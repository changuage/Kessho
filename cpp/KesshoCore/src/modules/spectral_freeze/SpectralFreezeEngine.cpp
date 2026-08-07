#include "SpectralFreezeEngine.h"

#include <algorithm>
#include <cmath>

namespace kessho::spectral_freeze {
namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;
constexpr float kInverseSqrtTwo = 0.70710678118654752440f;

float clampUnit(float value) noexcept {
  return std::clamp(std::isfinite(value) ? value : 0.0f, 0.0f, 1.0f);
}

float wrapPhase(float phase) noexcept {
  return std::remainder(phase, kTwoPi);
}

float wrapBoundedPhase(float phase) noexcept {
  if (phase > kPi) {
    return phase - kTwoPi;
  }
  if (phase < -kPi) {
    return phase + kTwoPi;
  }
  return phase;
}

}  // namespace

bool SpectralFreezeEngine::prepare(double sample_rate) {
  sample_rate_ = std::isfinite(sample_rate) && sample_rate > 1000.0
      ? sample_rate
      : 48000.0;
  if (
      !capture_.prepare(sample_rate_, 16.0) ||
      !stft_.prepare() ||
      !memory_.prepare(sample_rate_, SpectralFreezeStft::kFftSize)) {
    return false;
  }
  updateSpectralCaches();
  reset();
  return true;
}

void SpectralFreezeEngine::reset() noexcept {
  capture_.reset();
  memory_.reset();
  stft_.reset();
  live_ring_l_.fill(0.0f);
  live_ring_r_.fill(0.0f);
  analysis_frame_mid_.fill(0.0f);
  analysis_frame_side_.fill(0.0f);
  synthesized_frame_.fill(0.0f);
  for (auto& channel : live_magnitude_) channel.fill(0.0f);
  for (auto& channel : live_phase_) channel.fill(0.0f);
  for (auto& channel : source_magnitude_) channel.fill(0.0f);
  for (auto& channel : source_phase_) channel.fill(0.0f);
  for (auto& channel : endpoint_magnitude_) channel.fill(0.0f);
  for (auto& channel : previous_source_phase_) channel.fill(0.0f);
  for (auto& channel : phase_advance_) channel.fill(0.0f);
  for (auto& channel : synthesis_phase_) channel.fill(0.0f);
  for (auto& channel : smoothed_log_magnitude_) channel.fill(0.0f);
  for (auto& channel : output_ring_) channel.fill(0.0f);
  output_magnitude_.fill(0.0f);
  output_phase_.fill(0.0f);
  live_write_position_ = 0;
  hop_counter_ = 0;
  output_read_position_ = 0;
  spectral_frame_index_ = 0;
  pending_capture_ = false;
  source_phase_valid_ = false;
  active_crossfade_ = 0.0f;
  held_decay_gain_ = 1.0f;
  normalization_gain_ = 1.0f;
  smoothed_position_ = clampUnit(params_.position);
  previous_scan_position_ = 0.0;
  last_capture_serial_ = params_.capture_serial;
  runtime_state_ = SpectralFreezeRuntimeState::Recording;
}

void SpectralFreezeEngine::process(
    const float* input_l,
    const float* input_r,
    float* output_l,
    float* output_r,
    int frames) noexcept {
  if (
      input_l == nullptr || input_r == nullptr ||
      output_l == nullptr || output_r == nullptr || frames <= 0) {
    return;
  }

  for (int frame = 0; frame < frames; ++frame) {
    const float in_l = std::isfinite(input_l[frame]) ? input_l[frame] : 0.0f;
    const float in_r = std::isfinite(input_r[frame]) ? input_r[frame] : 0.0f;

    if (runtime_state_ == SpectralFreezeRuntimeState::Recording) {
      capture_.write(&in_l, &in_r, 1);
    }

    live_ring_l_[static_cast<size_t>(live_write_position_)] = in_l;
    live_ring_r_[static_cast<size_t>(live_write_position_)] = in_r;
    ++live_write_position_;
    if (live_write_position_ == SpectralFreezeStft::kFftSize) {
      live_write_position_ = 0;
    }

    ++hop_counter_;
    if (hop_counter_ >= SpectralFreezeStft::kHopSize) {
      hop_counter_ = 0;
      processHop();
    }

    const float wet_mid = output_ring_[0][static_cast<size_t>(output_read_position_)];
    const float wet_side = output_ring_[1][static_cast<size_t>(output_read_position_)];
    output_ring_[0][static_cast<size_t>(output_read_position_)] = 0.0f;
    output_ring_[1][static_cast<size_t>(output_read_position_)] = 0.0f;
    ++output_read_position_;
    if (output_read_position_ == kOutputRingSize) {
      output_read_position_ = 0;
    }

    if (runtime_state_ == SpectralFreezeRuntimeState::Capturing ||
        runtime_state_ == SpectralFreezeRuntimeState::Frozen) {
      active_crossfade_ = std::min(1.0, active_crossfade_ + crossfade_step_);
    } else if (runtime_state_ == SpectralFreezeRuntimeState::Releasing) {
      active_crossfade_ = std::max(0.0, active_crossfade_ - crossfade_step_);
    }

    const float wet_l = (wet_mid + wet_side) * kInverseSqrtTwo;
    const float wet_r = (wet_mid - wet_side) * kInverseSqrtTwo;
    const float freeze_mix = clampUnit(params_.mix) * static_cast<float>(active_crossfade_);
    float rendered_l = wet_l * freeze_mix;
    float rendered_r = wet_r * freeze_mix;
    if (!std::isfinite(rendered_l) || std::fabs(rendered_l) > 1.0e6f) rendered_l = 0.0f;
    if (!std::isfinite(rendered_r) || std::fabs(rendered_r) > 1.0e6f) rendered_r = 0.0f;
    output_l[frame] = rendered_l;
    output_r[frame] = rendered_r;

    finishReleaseIfSilent();
  }
}

void SpectralFreezeEngine::setParams(const SpectralFreezeParams& incoming) noexcept {
  SpectralFreezeParams sanitized = incoming;
  sanitized.stretch_speed = clampUnit(incoming.stretch_speed);
  sanitized.position = clampUnit(incoming.position);
  sanitized.refresh = clampUnit(incoming.refresh);
  sanitized.input_sensitivity = clampUnit(incoming.input_sensitivity);
  sanitized.diffusion = clampUnit(incoming.diffusion);
  sanitized.tone = std::clamp(std::isfinite(incoming.tone) ? incoming.tone : -0.15f, -1.0f, 1.0f);
  sanitized.width = clampUnit(incoming.width);
  sanitized.sustain = clampUnit(incoming.sustain);
  sanitized.mix = clampUnit(incoming.mix);
  sanitized.transition_seconds = std::max(
      0.01f,
      std::isfinite(incoming.transition_seconds) ? incoming.transition_seconds : 0.1f);
  const bool was_active = params_.active;
  const bool tone_changed = sanitized.tone != params_.tone;
  params_ = sanitized;
  if (tone_changed) {
    updateSpectralCaches();
  }
  crossfade_step_ = 1.0 /
      std::max(1.0, sample_rate_ * static_cast<double>(params_.transition_seconds));

  if (!params_.active && was_active) {
    requestRelease();
  } else if (params_.active && params_.capture_serial != last_capture_serial_) {
    requestCapture(params_.capture_serial);
  }
}

void SpectralFreezeEngine::requestCapture(uint32_t capture_serial) noexcept {
  if (capture_serial == last_capture_serial_) {
    return;
  }
  last_capture_serial_ = capture_serial;
  if (runtime_state_ == SpectralFreezeRuntimeState::Recording) {
    pending_capture_ = true;
    if (hasMinimumCapture()) {
      runtime_state_ = SpectralFreezeRuntimeState::Capturing;
    }
  }
}

void SpectralFreezeEngine::requestRelease() noexcept {
  pending_capture_ = false;
  if (runtime_state_ != SpectralFreezeRuntimeState::Recording) {
    runtime_state_ = SpectralFreezeRuntimeState::Releasing;
  }
}

void SpectralFreezeEngine::processHop() noexcept {
  const bool capture_now = pending_capture_ && hasMinimumCapture();
  const bool stretch_mode = params_.mode == SpectralFreezeMode::Stretch ||
      params_.mode == SpectralFreezeMode::LivingStretch;
  const bool live_memory_mode = runtime_state_ == SpectralFreezeRuntimeState::Frozen &&
      (params_.mode == SpectralFreezeMode::Slushy ||
       (params_.mode == SpectralFreezeMode::LivingStretch && params_.refresh > 0.0f));
  if ((capture_now && !stretch_mode) || live_memory_mode) {
    analyzeLiveFrames(params_.mode != SpectralFreezeMode::LivingStretch);
  }
  if (capture_now) {
    runtime_state_ = SpectralFreezeRuntimeState::Capturing;
    beginCaptureAtHop();
  }
  if (runtime_state_ == SpectralFreezeRuntimeState::Frozen ||
      runtime_state_ == SpectralFreezeRuntimeState::Releasing) {
    renderFrozenHop();
  }
  ++spectral_frame_index_;
}

void SpectralFreezeEngine::analyzeLiveFrames(bool include_phase) noexcept {
  extractLiveMidSideFrames();
  if (include_phase) {
    stft_.analyze(analysis_frame_mid_.data(), live_magnitude_[0].data(), live_phase_[0].data());
    stft_.analyze(analysis_frame_side_.data(), live_magnitude_[1].data(), live_phase_[1].data());
  } else {
    stft_.analyzeMagnitude(analysis_frame_mid_.data(), live_magnitude_[0].data());
    stft_.analyzeMagnitude(analysis_frame_side_.data(), live_magnitude_[1].data());
  }
}

void SpectralFreezeEngine::analyzeCaptureFrames(double center_position) noexcept {
  analyzeCaptureFramesInto(center_position, source_magnitude_, source_phase_);
}

void SpectralFreezeEngine::analyzeCaptureMagnitudes(
    double center_position,
    std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2>& magnitude) noexcept {
  extractCaptureMidSideFrames(center_position);
  stft_.analyzeMagnitude(analysis_frame_mid_.data(), magnitude[0].data());
  stft_.analyzeMagnitude(analysis_frame_side_.data(), magnitude[1].data());
}

void SpectralFreezeEngine::analyzeCaptureFramesInto(
    double center_position,
    std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2>& magnitude,
    std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2>& phase) noexcept {
  extractCaptureMidSideFrames(center_position);
  stft_.analyze(analysis_frame_mid_.data(), magnitude[0].data(), phase[0].data());
  stft_.analyze(analysis_frame_side_.data(), magnitude[1].data(), phase[1].data());
}

void SpectralFreezeEngine::extractLiveMidSideFrames() noexcept {
  for (int index = 0; index < SpectralFreezeStft::kFftSize; ++index) {
    int physical = live_write_position_ + index;
    if (physical >= SpectralFreezeStft::kFftSize) {
      physical -= SpectralFreezeStft::kFftSize;
    }
    const float left = live_ring_l_[static_cast<size_t>(physical)];
    const float right = live_ring_r_[static_cast<size_t>(physical)];
    analysis_frame_mid_[static_cast<size_t>(index)] = (left + right) * kInverseSqrtTwo;
    analysis_frame_side_[static_cast<size_t>(index)] = (left - right) * kInverseSqrtTwo;
  }
}

void SpectralFreezeEngine::extractCaptureMidSideFrames(double center_position) noexcept {
  const double start = center_position - static_cast<double>(SpectralFreezeStft::kFftSize / 2);
  for (int index = 0; index < SpectralFreezeStft::kFftSize; ++index) {
    const double position = start + static_cast<double>(index);
    const float left = capture_.readLeft(position);
    const float right = capture_.readRight(position);
    analysis_frame_mid_[static_cast<size_t>(index)] = (left + right) * kInverseSqrtTwo;
    analysis_frame_side_[static_cast<size_t>(index)] = (left - right) * kInverseSqrtTwo;
  }
}

void SpectralFreezeEngine::beginCaptureAtHop() noexcept {
  pending_capture_ = false;
  if (!capture_.lock()) {
    runtime_state_ = SpectralFreezeRuntimeState::Recording;
    return;
  }

  const bool stretch_mode = params_.mode == SpectralFreezeMode::Stretch ||
      params_.mode == SpectralFreezeMode::LivingStretch;
  if (stretch_mode) {
    if (!scan_head_.configure(
            capture_.validSamples(),
            SpectralFreezeStft::kFftSize,
            SpectralFreezeStft::kHopSize)) {
      capture_.release();
      runtime_state_ = SpectralFreezeRuntimeState::Recording;
      return;
    }
    scan_head_.setDirection(params_.direction);
    smoothed_position_ = clampUnit(params_.position);
    scan_head_.setNormalizedPosition(smoothed_position_);
    previous_scan_position_ = scan_head_.positionSamples();
    analyzeCaptureFrames(previous_scan_position_);
  } else {
    source_magnitude_ = live_magnitude_;
    source_phase_ = live_phase_;
  }

  memory_.capture(
      source_magnitude_[0].data(),
      source_magnitude_[1].data(),
      SpectralFreezeStft::kBinCount);
  source_phase_valid_ = false;
  updatePhaseAdvance(0, source_phase_[0].data(), SpectralFreezeStft::kHopSize, true);
  updatePhaseAdvance(1, source_phase_[1].data(), SpectralFreezeStft::kHopSize, true);
  held_decay_gain_ = 1.0f;
  normalization_gain_ = 1.0f;
  runtime_state_ = SpectralFreezeRuntimeState::Frozen;
}

void SpectralFreezeEngine::updatePhaseAdvance(
    int channel,
    const float* phase,
    float analysis_delta_samples,
    bool reset_phase) noexcept {
  const float absolute_delta = std::fabs(analysis_delta_samples);
  for (int bin = 0; bin < SpectralFreezeStft::kBinCount; ++bin) {
    if (reset_phase || !source_phase_valid_) {
      const float expected_synthesis = wrapPhase(
          kTwoPi * static_cast<float>(bin) *
          static_cast<float>(SpectralFreezeStft::kHopSize) /
          static_cast<float>(SpectralFreezeStft::kFftSize));
      phase_advance_[static_cast<size_t>(channel)][static_cast<size_t>(bin)] = expected_synthesis;
      synthesis_phase_[static_cast<size_t>(channel)][static_cast<size_t>(bin)] = phase[bin];
    } else if (absolute_delta >= 1.0f) {
      const float expected_analysis = kTwoPi * static_cast<float>(bin) *
          analysis_delta_samples / static_cast<float>(SpectralFreezeStft::kFftSize);
      const float residual = wrapPhase(
          phase[bin] -
          previous_source_phase_[static_cast<size_t>(channel)][static_cast<size_t>(bin)] -
          expected_analysis);
      const float radians_per_sample = (expected_analysis + residual) / analysis_delta_samples;
      phase_advance_[static_cast<size_t>(channel)][static_cast<size_t>(bin)] = wrapPhase(
          radians_per_sample * static_cast<float>(SpectralFreezeStft::kHopSize));
    }
    previous_source_phase_[static_cast<size_t>(channel)][static_cast<size_t>(bin)] = phase[bin];
  }
}

void SpectralFreezeEngine::renderFrozenHop() noexcept {
  const bool stretch_mode = params_.mode == SpectralFreezeMode::Stretch ||
      params_.mode == SpectralFreezeMode::LivingStretch;
  if (stretch_mode && scan_head_.isValid()) {
    updatePositionTarget();
    const double current_position = scan_head_.positionSamples();
    analyzeCaptureFrames(current_position);
    const float analysis_delta = static_cast<float>(current_position - previous_scan_position_);
    updatePhaseAdvance(0, source_phase_[0].data(), analysis_delta, false);
    updatePhaseAdvance(1, source_phase_[1].data(), analysis_delta, false);
    source_phase_valid_ = true;
    previous_scan_position_ = current_position;
    const float scan_ratio = SpectralFreezeScanHead::normalizedToRatio(params_.stretch_speed);
    blendEndpointMagnitudes(current_position, scan_ratio);
    memory_.capture(
        source_magnitude_[0].data(),
        source_magnitude_[1].data(),
        SpectralFreezeStft::kBinCount);
    if (params_.mode == SpectralFreezeMode::LivingStretch && params_.refresh > 0.0f) {
      memory_.updateFromLive(
          live_magnitude_[0].data(),
          live_magnitude_[1].data(),
          SpectralFreezeStft::kBinCount,
          params_.refresh,
          params_.input_sensitivity,
          params_.sustain);
    }
    held_decay_gain_ *= decayGainPerHop();
    scan_head_.advance(scan_ratio);
  } else if (params_.mode == SpectralFreezeMode::Slushy) {
    memory_.updateFromLive(
        live_magnitude_[0].data(),
        live_magnitude_[1].data(),
        SpectralFreezeStft::kBinCount,
        params_.refresh,
        params_.input_sensitivity,
        params_.sustain);
    updatePhaseAdvance(0, live_phase_[0].data(), SpectralFreezeStft::kHopSize, false);
    updatePhaseAdvance(1, live_phase_[1].data(), SpectralFreezeStft::kHopSize, false);
    source_phase_valid_ = true;
  } else {
    held_decay_gain_ *= decayGainPerHop();
  }

  double source_energy = 0.0;
  double target_energy = 0.0;
  for (int bin = 0; bin < SpectralFreezeStft::kBinCount; ++bin) {
    const float source_mid = source_magnitude_[0][static_cast<size_t>(bin)];
    const float source_side = source_magnitude_[1][static_cast<size_t>(bin)];
    const float held_mid = memory_.heldMagnitude(0, bin);
    const float held_side = memory_.heldMagnitude(1, bin);
    source_energy += static_cast<double>(source_mid * source_mid + source_side * source_side);
    target_energy += static_cast<double>(held_mid * held_mid + held_side * held_side);
  }
  const float target_normalization = target_energy > 1.0e-12
      ? std::clamp(
            static_cast<float>(std::sqrt(source_energy / target_energy)),
            0.501187f,
            1.995262f)
      : 1.0f;
  normalization_gain_ += (target_normalization - normalization_gain_) * 0.1f;

  const float hop_seconds = static_cast<float>(SpectralFreezeStft::kHopSize) /
      static_cast<float>(sample_rate_);
  const float magnitude_attack_seconds = 0.04f + params_.diffusion * 0.16f;
  const float magnitude_release_seconds = 0.10f + params_.diffusion * 0.24f;
  const float magnitude_attack = 1.0f - std::exp(-hop_seconds / magnitude_attack_seconds);
  const float magnitude_release = 1.0f - std::exp(-hop_seconds / magnitude_release_seconds);
  synthesizeChannel(0, magnitude_attack, magnitude_release);
  synthesizeChannel(1, magnitude_attack, magnitude_release);
}

void SpectralFreezeEngine::blendEndpointMagnitudes(
    double center_position,
    float scan_ratio) noexcept {
  if (
      scan_head_.direction() != SpectralScanDirection::PingPong ||
      scan_ratio <= 0.0f) {
    return;
  }

  constexpr double kTransitionHops = 8.0;
  const double transition_samples = std::max(
      1.0,
      static_cast<double>(scan_ratio) *
          static_cast<double>(SpectralFreezeStft::kHopSize) * kTransitionHops);
  const bool approaching_maximum = scan_head_.directionSign() > 0;
  const double endpoint = approaching_maximum
      ? scan_head_.maximumPosition()
      : scan_head_.minimumPosition();
  const double distance = std::fabs(endpoint - center_position);
  if (distance >= transition_samples) {
    return;
  }

  const double outgoing_position = approaching_maximum
      ? endpoint - (transition_samples - distance)
      : endpoint + (transition_samples - distance);
  analyzeCaptureMagnitudes(outgoing_position, endpoint_magnitude_);

  const float progress = std::clamp(
      static_cast<float>(1.0 - distance / transition_samples),
      0.0f,
      1.0f);
  const float blend = 0.5f - 0.5f * std::cos(kPi * progress);
  for (int channel = 0; channel < 2; ++channel) {
    for (int bin = 0; bin < SpectralFreezeStft::kBinCount; ++bin) {
      const size_t index = static_cast<size_t>(bin);
      const float approaching_log = std::log1p(std::max(0.0f, source_magnitude_[channel][index]));
      const float outgoing_log = std::log1p(std::max(0.0f, endpoint_magnitude_[channel][index]));
      source_magnitude_[channel][index] = std::expm1(
          approaching_log + (outgoing_log - approaching_log) * blend);
    }
  }
}

void SpectralFreezeEngine::synthesizeChannel(
    int channel,
    float magnitude_attack,
    float magnitude_release) noexcept {
  const float width = channel == 1 ? params_.width : 1.0f;
  for (int bin = 0; bin < SpectralFreezeStft::kBinCount; ++bin) {
    const size_t index = static_cast<size_t>(bin);
    const float stereo_weight = width * (channel == 1 ? side_weight_[index] : 1.0f);
    const float target_log_magnitude = memory_.heldLogMagnitude(channel, bin);
    float& smoothed_log_magnitude =
        smoothed_log_magnitude_[static_cast<size_t>(channel)][index];
    const float smoothing = target_log_magnitude > smoothed_log_magnitude
        ? magnitude_attack
        : magnitude_release;
    smoothed_log_magnitude += (target_log_magnitude - smoothed_log_magnitude) * smoothing;
    const float magnitude = std::expm1(smoothed_log_magnitude);
    output_magnitude_[index] = magnitude * held_decay_gain_ *
        normalization_gain_ * tone_gain_[index] * stereo_weight;

    float phase = wrapBoundedPhase(
        synthesis_phase_[static_cast<size_t>(channel)][index] +
        phase_advance_[static_cast<size_t>(channel)][index]);
    if (
        params_.diffusion > 0.0f &&
        bin > 0 && bin + 1 < SpectralFreezeStft::kBinCount) {
      phase += deterministicSignedRandom(channel, bin) * params_.diffusion * kPi;
      phase = wrapBoundedPhase(phase);
    }
    synthesis_phase_[static_cast<size_t>(channel)][index] = phase;
    output_phase_[index] = phase;
  }
  stft_.synthesize(output_magnitude_.data(), output_phase_.data(), synthesized_frame_.data());
  addSynthesizedFrame(channel);
}

void SpectralFreezeEngine::addSynthesizedFrame(int channel) noexcept {
  for (int sample = 0; sample < SpectralFreezeStft::kFftSize; ++sample) {
    int position = output_read_position_ + sample;
    if (position >= kOutputRingSize) {
      position -= kOutputRingSize;
    }
    output_ring_[static_cast<size_t>(channel)][static_cast<size_t>(position)] +=
        synthesized_frame_[static_cast<size_t>(sample)];
  }
}

void SpectralFreezeEngine::finishReleaseIfSilent() noexcept {
  if (runtime_state_ != SpectralFreezeRuntimeState::Releasing || active_crossfade_ > 0.0f) {
    return;
  }
  capture_.release();
  memory_.reset();
  for (auto& channel : smoothed_log_magnitude_) channel.fill(0.0f);
  for (auto& channel : output_ring_) channel.fill(0.0f);
  source_phase_valid_ = false;
  held_decay_gain_ = 1.0f;
  runtime_state_ = SpectralFreezeRuntimeState::Recording;
}

void SpectralFreezeEngine::updatePositionTarget() noexcept {
  const float requested = clampUnit(params_.position);
  const float delta = requested - smoothed_position_;
  if (std::fabs(delta) > 1.0e-6f) {
    smoothed_position_ += delta * 0.125f;
    scan_head_.setNormalizedPosition(smoothed_position_);
  }
}

float SpectralFreezeEngine::deterministicSignedRandom(int channel, int bin) const noexcept {
  uint32_t value = 0x9e3779b9u;
  value ^= last_capture_serial_ + 0x85ebca6bu + (value << 6u) + (value >> 2u);
  value ^= static_cast<uint32_t>(spectral_frame_index_) + 0xc2b2ae35u + (value << 6u) + (value >> 2u);
  value ^= static_cast<uint32_t>(channel) * 0x27d4eb2du;
  value ^= static_cast<uint32_t>(bin) * 0x165667b1u;
  value ^= value >> 16u;
  value *= 0x7feb352du;
  value ^= value >> 15u;
  value *= 0x846ca68bu;
  value ^= value >> 16u;
  return static_cast<float>(value & 0x00ffffffu) * (2.0f / 16777215.0f) - 1.0f;
}

void SpectralFreezeEngine::updateSpectralCaches() noexcept {
  const float fft_size = static_cast<float>(SpectralFreezeStft::kFftSize);
  const float sample_rate = static_cast<float>(sample_rate_);
  for (int bin = 0; bin < SpectralFreezeStft::kBinCount; ++bin) {
    const size_t index = static_cast<size_t>(bin);
    const float frequency = static_cast<float>(bin) * sample_rate / fft_size;
    const float tone_frequency = std::max(20.0f, frequency);
    const float octaves = std::clamp(std::log2(tone_frequency / 800.0f), -4.0f, 4.0f);
    const float decibels = params_.tone * octaves * 1.5f;
    tone_gain_[index] = std::exp2(decibels / 6.0205999f);
    side_weight_[index] = frequency < 300.0f
        ? std::clamp((frequency - 80.0f) / 220.0f, 0.0f, 1.0f)
        : 1.0f;
  }
}

float SpectralFreezeEngine::decayGainPerHop() const noexcept {
  if (params_.sustain >= 0.9999f) {
    return 1.0f;
  }
  const float db_per_second = (1.0f - params_.sustain) * 18.0f;
  const float hops_per_second = static_cast<float>(sample_rate_) /
      static_cast<float>(SpectralFreezeStft::kHopSize);
  return std::pow(10.0f, -db_per_second / (20.0f * hops_per_second));
}

bool SpectralFreezeEngine::hasMinimumCapture() const noexcept {
  return capture_.validSamples() >= static_cast<int>(sample_rate_);
}

}  // namespace kessho::spectral_freeze
