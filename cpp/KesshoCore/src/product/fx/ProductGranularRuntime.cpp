#include "../KesshoProductEngineInternal.h"

#include <cmath>

namespace {

constexpr float kGranularControlSmoothSeconds = 0.05f;

float smoothedGranularControlCached(float current, float target, float coeff) {
  if (!std::isfinite(target)) return 0.0f;
  const float next = target + (current - target) * coeff;
  return std::abs(next - target) < 0.000001f ? target : next;
}

} // namespace

void KesshoProductEngine::resetGranularPhraseRuntime() {
  granular_last_phrase_index = 0u;
  granular_phrase_runtime_initialized = false;
}

void KesshoProductEngine::updateGranularControlSmoothCoeff() {
  if (sample_rate == granular_control_smooth_coeff_sample_rate) return;
  granular_control_smooth_coeff_sample_rate = sample_rate;
  if (sample_rate <= 0.0) {
    granular_control_smooth_coeff = 0.0f;
    return;
  }
  granular_control_smooth_coeff = std::exp(
      -1.0f / std::max(1.0f, kGranularControlSmoothSeconds * static_cast<float>(sample_rate)));
}

bool KesshoProductEngine::sourceRuntimeActive(uint32_t source_id) const {
  if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
    return pad_module != nullptr && pad_module->activeVoiceCount() > 0;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1) {
    return lead_modules[0] != nullptr && lead_modules[0]->activeVoiceCount() > 0;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    return lead_modules[1] != nullptr && lead_modules[1]->activeVoiceCount() > 0;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return drum_module != nullptr && drum_module->activeVoiceCount() > 0;
  }
  return hasActiveSourceVoice(source_id);
}

void KesshoProductEngine::snapGranularReturnGainsToTargets() {
  granular_mix_gain = clampFloat(fx.granular_mix, 0.0f, 4.0f);
  granular_reverb_send_gain = clampFloat(routing.granular_to_reverb, 0.0f, 4.0f);
  granular_delay_a_send_gain = clampFloat(routing.granular_to_delay_a, 0.0f, 1.0f);
  granular_delay_b_send_gain = clampFloat(routing.granular_to_delay_b, 0.0f, 1.0f);
  granular_degrade_send_gain = clampFloat(routing.granular_to_degrade, 0.0f, 1.0f);
  granular_return_gain_frame = UINT64_MAX;
}

void KesshoProductEngine::primeGranularControlsForSourceStart(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) return;
  SourceState& source = sources[source_id - 1u];
  const float send_target = clampFloat(source.granular_send, 0.0f, 2.0f);
  if (send_target <= 0.0001f) return;
  if (source.granular_send_gain < send_target) {
    source.granular_send_gain = send_target;
    source.granular_send_gain_frame = UINT64_MAX;
  }

  const bool output_armed =
      fx.granular_mix > 0.0001f ||
      routing.granular_to_reverb > 0.0001f ||
      routing.granular_to_delay_a > 0.0001f ||
      routing.granular_to_delay_b > 0.0001f ||
      routing.granular_to_degrade > 0.0001f;
  if (!output_armed) return;
  const bool granular_idle = granular_module == nullptr || granular_module->activeGrainCount() <= 0;
  if (granular_idle) {
    snapGranularReturnGainsToTargets();
  }
}

float KesshoProductEngine::granularSendGainForFrame(uint32_t source_id, float target, uint64_t absolute_frame) {
  if (source_id < 1u || source_id > kSourceCount) return clampFloat(target, 0.0f, 2.0f);
  SourceState& source = sources[source_id - 1u];
  if (source.granular_send_gain_frame == absolute_frame) return source.granular_send_gain;
  updateGranularControlSmoothCoeff();
  source.granular_send_gain = smoothedGranularControlCached(
      source.granular_send_gain,
      clampFloat(target, 0.0f, 2.0f),
      granular_control_smooth_coeff);
  source.granular_send_gain_frame = absolute_frame;
  return source.granular_send_gain;
}

void KesshoProductEngine::advanceGranularReturnGains(uint64_t absolute_frame) {
  if (granular_return_gain_frame == absolute_frame) return;
  updateGranularControlSmoothCoeff();
  granular_mix_gain = smoothedGranularControlCached(
      granular_mix_gain,
      clampFloat(fx.granular_mix, 0.0f, 4.0f),
      granular_control_smooth_coeff);
  granular_reverb_send_gain = smoothedGranularControlCached(
      granular_reverb_send_gain,
      clampFloat(routing.granular_to_reverb, 0.0f, 4.0f),
      granular_control_smooth_coeff);
  granular_delay_a_send_gain = smoothedGranularControlCached(
      granular_delay_a_send_gain,
      clampFloat(routing.granular_to_delay_a, 0.0f, 1.0f),
      granular_control_smooth_coeff);
  granular_delay_b_send_gain = smoothedGranularControlCached(
      granular_delay_b_send_gain,
      clampFloat(routing.granular_to_delay_b, 0.0f, 1.0f),
      granular_control_smooth_coeff);
  granular_degrade_send_gain = smoothedGranularControlCached(
      granular_degrade_send_gain,
      clampFloat(routing.granular_to_degrade, 0.0f, 1.0f),
      granular_control_smooth_coeff);
  granular_return_gain_frame = absolute_frame;
}

void KesshoProductEngine::advanceGranularPhraseReseed() {
  if (granular_module == nullptr || !transport.running || sample_rate <= 0.0) return;
  const uint64_t phrase = transport.phraseIndex(sample_rate);
  if (!granular_phrase_runtime_initialized) {
    granular_phrase_runtime_initialized = true;
    granular_last_phrase_index = phrase;
    return;
  }
  if (phrase == granular_last_phrase_index) return;
  granular_last_phrase_index = phrase;
  granular_module->setRandomSeed(rng_state);
}
