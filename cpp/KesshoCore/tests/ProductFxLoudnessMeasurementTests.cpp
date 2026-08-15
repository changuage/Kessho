#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <vector>

#include "ProductLoudnessMeter.h"
#include "../src/product/KesshoProductEngineInternal.h"

namespace {

constexpr double kSampleRate = 48000.0;
constexpr uint32_t kBlockSize = 128u;
constexpr float kPi = 3.14159265358979323846f;
constexpr float kNonzeroRms = 1.0e-8f;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Product FX loudness measurement failed: " << message << "\n";
    std::exit(1);
  }
}

struct SignalMetrics {
  double sum_squares = 0.0;
  uint64_t sample_count = 0u;
  float peak = 0.0f;
  uint64_t hash = 1469598103934665603ull;

  void add(const float* left, const float* right, uint32_t frames) {
    require(left != nullptr && right != nullptr, "measurement buffer was null");
    for (uint32_t i = 0u; i < frames; ++i) {
      const float channels[2] = {left[i], right[i]};
      for (const float value : channels) {
        require(std::isfinite(value), "measurement emitted a non-finite sample");
        sum_squares += static_cast<double>(value) * static_cast<double>(value);
        ++sample_count;
        peak = std::max(peak, std::fabs(value));
        uint32_t bits = 0u;
        std::memcpy(&bits, &value, sizeof(bits));
        hash ^= static_cast<uint64_t>(bits);
        hash *= 1099511628211ull;
      }
    }
  }

  float rms() const {
    return sample_count == 0u
        ? 0.0f
        : static_cast<float>(std::sqrt(sum_squares / static_cast<double>(sample_count)));
  }
};

enum class InputBus : uint8_t {
  DelayA,
  DelayB,
  Granular,
  Degrade,
  Freeze,
  Reverb,
  Eq1,
  Eq2,
  Sidechain,
  CreativeSaturation,
};

enum class OutputNode : uint8_t {
  DelayA,
  DelayB,
  Granular,
  Degrade,
  Freeze,
  Reverb,
  Eq1,
  Eq2,
  Sidechain,
  CreativeSaturation,
};

struct Measurement {
  const char* name = nullptr;
  SignalMetrics input;
  SignalMetrics raw;
  SignalMetrics node;
  SignalMetrics returned;
  SignalMetrics tail;
  uint32_t active_blocks = 0u;
  uint32_t warmup_blocks = 0u;
  uint32_t tail_blocks = 0u;
  double input_lufs = kessho::offline::kSilenceLufs;
  double output_lufs = kessho::offline::kSilenceLufs;
  double delta_lu = kessho::offline::kSilenceLufs;
  double tail_lufs = kessho::offline::kSilenceLufs;
};

float dbDelta(float output_rms, float input_rms) {
  if (output_rms <= 1.0e-12f || input_rms <= 1.0e-12f) return -120.0f;
  return 20.0f * std::log10(output_rms / input_rms);
}

void appendPcm(
    std::vector<float>& left,
    std::vector<float>& right,
    const float* source_left,
    const float* source_right) {
  require(source_left != nullptr && source_right != nullptr, "LUFS PCM buffer was null");
  left.insert(left.end(), source_left, source_left + kBlockSize);
  right.insert(right.end(), source_right, source_right + kBlockSize);
}

double integratedLufs(const std::vector<float>& left, const std::vector<float>& right) {
  require(left.size() == right.size(), "LUFS PCM channel lengths differed");
  require(left.size() >= kessho::offline::kLoudnessWindowFrames, "LUFS PCM window was shorter than 400 ms");
  return kessho::offline::measureStereoIntegratedLufs(
      left.data(), right.data(), left.size(),
      static_cast<uint32_t>(kSampleRate)).integrated_lufs;
}

double lufsDelta(double output_lufs, double input_lufs) {
  return std::isfinite(output_lufs) && std::isfinite(input_lufs)
      ? output_lufs - input_lufs
      : kessho::offline::kSilenceLufs;
}

float* inputLeft(KesshoProductEngine& engine, InputBus bus) {
  switch (bus) {
    case InputBus::DelayA: return engine.delay_a_bus_l;
    case InputBus::DelayB: return engine.delay_b_bus_l;
    case InputBus::Granular: return engine.granular_bus_l;
    case InputBus::Degrade: return engine.degrade_bus_l;
    case InputBus::Freeze: return engine.spectral_freeze_bus_l;
    case InputBus::Reverb: return engine.reverb_bus_l;
    case InputBus::Eq1: return engine.dynamics_eq1_bus_l;
    case InputBus::Eq2: return engine.dynamics_eq2_bus_l;
    case InputBus::Sidechain: return engine.dynamics_sidechain_bus_l;
    case InputBus::CreativeSaturation: return engine.creative_saturation_bus_l;
  }
  return nullptr;
}

float* inputRight(KesshoProductEngine& engine, InputBus bus) {
  switch (bus) {
    case InputBus::DelayA: return engine.delay_a_bus_r;
    case InputBus::DelayB: return engine.delay_b_bus_r;
    case InputBus::Granular: return engine.granular_bus_r;
    case InputBus::Degrade: return engine.degrade_bus_r;
    case InputBus::Freeze: return engine.spectral_freeze_bus_r;
    case InputBus::Reverb: return engine.reverb_bus_r;
    case InputBus::Eq1: return engine.dynamics_eq1_bus_r;
    case InputBus::Eq2: return engine.dynamics_eq2_bus_r;
    case InputBus::Sidechain: return engine.dynamics_sidechain_bus_r;
    case InputBus::CreativeSaturation: return engine.creative_saturation_bus_r;
  }
  return nullptr;
}

uint8_t nodeId(OutputNode node) {
  using namespace kessho::product::internal;
  switch (node) {
    case OutputNode::DelayA: return kFxNodeDelayA;
    case OutputNode::DelayB: return kFxNodeDelayB;
    case OutputNode::Granular: return kFxNodeGranular;
    case OutputNode::Degrade: return kFxNodeDegrade;
    case OutputNode::Freeze: return kFxNodeFreeze;
    case OutputNode::Reverb: return kFxNodeReverb;
    case OutputNode::Eq1: return kFxNodeEq1;
    case OutputNode::Eq2: return kFxNodeEq2;
    case OutputNode::Sidechain: return kFxNodeSidechain;
    case OutputNode::CreativeSaturation: return kFxNodeCreativeSaturation;
  }
  return kFxNodeCount;
}

void clearFrameState(KesshoProductEngine& engine) {
  float* const buses[] = {
      engine.delay_a_bus_l, engine.delay_a_bus_r,
      engine.delay_b_bus_l, engine.delay_b_bus_r,
      engine.granular_bus_l, engine.granular_bus_r,
      engine.degrade_bus_l, engine.degrade_bus_r,
      engine.spectral_freeze_bus_l, engine.spectral_freeze_bus_r,
      engine.reverb_bus_l, engine.reverb_bus_r,
      engine.dynamics_eq1_bus_l, engine.dynamics_eq1_bus_r,
      engine.dynamics_eq2_bus_l, engine.dynamics_eq2_bus_r,
      engine.dynamics_sidechain_bus_l, engine.dynamics_sidechain_bus_r,
      engine.creative_saturation_bus_l, engine.creative_saturation_bus_r,
  };
  for (float* buffer : buses) std::fill(buffer, buffer + kBlockSize, 0.0f);
  std::fill(engine.module_l, engine.module_l + kBlockSize, 0.0f);
  std::fill(engine.module_r, engine.module_r + kBlockSize, 0.0f);
  for (uint32_t tap = 0u; tap < kModuleTapCount; ++tap) {
    std::fill(engine.module_tap_l[tap], engine.module_tap_l[tap] + kBlockSize, 0.0f);
    std::fill(engine.module_tap_r[tap], engine.module_tap_r[tap] + kBlockSize, 0.0f);
  }
  for (uint8_t node = 0u; node < kFxNodeCount; ++node) {
    std::fill(engine.fx_node_output_l[node], engine.fx_node_output_l[node] + kBlockSize, 0.0f);
    std::fill(engine.fx_node_output_r[node], engine.fx_node_output_r[node] + kBlockSize, 0.0f);
  }
  std::fill(engine.spectral_freeze_output_l, engine.spectral_freeze_output_l + kBlockSize, 0.0f);
  std::fill(engine.spectral_freeze_output_r, engine.spectral_freeze_output_r + kBlockSize, 0.0f);
  std::fill(engine.graph_delay_a_output_l, engine.graph_delay_a_output_l + kBlockSize, 0.0f);
  std::fill(engine.graph_delay_a_output_r, engine.graph_delay_a_output_r + kBlockSize, 0.0f);
  std::fill(engine.graph_delay_b_output_l, engine.graph_delay_b_output_l + kBlockSize, 0.0f);
  std::fill(engine.graph_delay_b_output_r, engine.graph_delay_b_output_r + kBlockSize, 0.0f);
  std::fill(engine.graph_granular_output_l, engine.graph_granular_output_l + kBlockSize, 0.0f);
  std::fill(engine.graph_granular_output_r, engine.graph_granular_output_r + kBlockSize, 0.0f);
  std::fill(engine.graph_reverb_output_l, engine.graph_reverb_output_l + kBlockSize, 0.0f);
  std::fill(engine.graph_reverb_output_r, engine.graph_reverb_output_r + kBlockSize, 0.0f);
}

void writeFixture(KesshoProductEngine& engine, InputBus bus, uint64_t frame, bool active) {
  float* left = inputLeft(engine, bus);
  float* right = inputRight(engine, bus);
  require(left != nullptr && right != nullptr, "fixture input bus was null");
  for (uint32_t i = 0u; i < kBlockSize; ++i) {
    if (!active) {
      left[i] = 0.0f;
      right[i] = 0.0f;
      continue;
    }
    const float t = static_cast<float>(frame + i) / static_cast<float>(kSampleRate);
    const float phase = 2.0f * kPi * 440.0f * t;
    const float color = 2.0f * kPi * 701.0f * t;
    left[i] = 0.22f * std::sin(phase) + 0.045f * std::cos(color);
    right[i] = 0.18f * std::sin(phase * 0.997f + 0.37f) + 0.035f * std::cos(color * 0.73f);
  }
}

const float* rawLeft(KesshoProductEngine& engine, OutputNode node) {
  switch (node) {
    case OutputNode::DelayA:
    case OutputNode::DelayB: return engine.module_tap_l[0];
    case OutputNode::Granular:
    case OutputNode::Degrade:
    case OutputNode::Reverb: return engine.module_l;
    case OutputNode::Freeze: return engine.spectral_freeze_output_l;
    case OutputNode::Eq1:
    case OutputNode::Eq2:
    case OutputNode::Sidechain:
    case OutputNode::CreativeSaturation: return engine.fx_node_output_l[nodeId(node)];
  }
  return nullptr;
}

const float* rawRight(KesshoProductEngine& engine, OutputNode node) {
  switch (node) {
    case OutputNode::DelayA:
    case OutputNode::DelayB: return engine.module_tap_r[0];
    case OutputNode::Granular:
    case OutputNode::Degrade:
    case OutputNode::Reverb: return engine.module_r;
    case OutputNode::Freeze: return engine.spectral_freeze_output_r;
    case OutputNode::Eq1:
    case OutputNode::Eq2:
    case OutputNode::Sidechain:
    case OutputNode::CreativeSaturation: return engine.fx_node_output_r[nodeId(node)];
  }
  return nullptr;
}

const float* nodeLeft(KesshoProductEngine& engine, OutputNode node) {
  return engine.fx_node_output_l[nodeId(node)];
}

const float* nodeRight(KesshoProductEngine& engine, OutputNode node) {
  return engine.fx_node_output_r[nodeId(node)];
}

const float* returnedLeft(KesshoProductEngine& engine, OutputNode node) {
  switch (node) {
    case OutputNode::DelayA: return engine.graph_delay_a_output_l;
    case OutputNode::DelayB: return engine.graph_delay_b_output_l;
    case OutputNode::Granular: return engine.graph_granular_output_l;
    case OutputNode::Reverb: return engine.graph_reverb_output_l;
    case OutputNode::Degrade:
    case OutputNode::Freeze:
    case OutputNode::Eq1:
    case OutputNode::Eq2:
    case OutputNode::Sidechain:
    case OutputNode::CreativeSaturation: return nodeLeft(engine, node);
  }
  return nullptr;
}

const float* returnedRight(KesshoProductEngine& engine, OutputNode node) {
  switch (node) {
    case OutputNode::DelayA: return engine.graph_delay_a_output_r;
    case OutputNode::DelayB: return engine.graph_delay_b_output_r;
    case OutputNode::Granular: return engine.graph_granular_output_r;
    case OutputNode::Reverb: return engine.graph_reverb_output_r;
    case OutputNode::Degrade:
    case OutputNode::Freeze:
    case OutputNode::Eq1:
    case OutputNode::Eq2:
    case OutputNode::Sidechain:
    case OutputNode::CreativeSaturation: return nodeRight(engine, node);
  }
  return nullptr;
}

void normalizeRouting(KesshoProductEngine& engine) {
  engine.routing.clearFxGraph();
  engine.routing.delay_a_to_delay_b_feedback = 0.0f;
  engine.routing.delay_b_to_delay_a_feedback = 0.0f;
  engine.routing.reverb_to_degrade = 0.0f;
  engine.routing.degrade_to_reverb = 0.0f;
  engine.routing.degrade_return_level = 1.0f;
  for (uint32_t route = 0u; route < kDynamicsRouteCount; ++route) {
    engine.routing.dynamics_routes[route] = kDynamicsBusSkip;
  }
}

Measurement renderCase(
    const char* name,
    InputBus input_bus,
    OutputNode output_node,
    uint32_t warmup_blocks,
    uint32_t active_blocks,
    uint32_t tail_blocks,
    void (*configure)(KesshoProductEngine&)) {
  KesshoProductEngine engine(kSampleRate, kBlockSize, 0u);
  engine.graph_taps_enabled = true;
  normalizeRouting(engine);
  configure(engine);
  engine.configureFxModules();

  Measurement result;
  result.name = name;
  result.active_blocks = active_blocks;
  result.warmup_blocks = warmup_blocks;
  result.tail_blocks = tail_blocks;
  std::array<float, kBlockSize> output_l{};
  std::array<float, kBlockSize> output_r{};
  const uint32_t total_blocks = active_blocks + tail_blocks;
  const std::size_t active_frames = static_cast<std::size_t>(active_blocks - warmup_blocks) * kBlockSize;
  const std::size_t tail_frames = static_cast<std::size_t>(tail_blocks) * kBlockSize;
  std::vector<float> active_input_l;
  std::vector<float> active_input_r;
  std::vector<float> active_output_l;
  std::vector<float> active_output_r;
  std::vector<float> tail_output_l;
  std::vector<float> tail_output_r;
  active_input_l.reserve(active_frames);
  active_input_r.reserve(active_frames);
  active_output_l.reserve(active_frames);
  active_output_r.reserve(active_frames);
  tail_output_l.reserve(std::max(tail_frames, kessho::offline::kLoudnessWindowFrames));
  tail_output_r.reserve(std::max(tail_frames, kessho::offline::kLoudnessWindowFrames));
  for (uint32_t block = 0u; block < total_blocks; ++block) {
    const bool active = block < active_blocks;
    const bool measure_active = active && block >= warmup_blocks;
    clearFrameState(engine);
    writeFixture(engine, input_bus, static_cast<uint64_t>(block) * kBlockSize, active);
    if (measure_active) {
      result.input.add(inputLeft(engine, input_bus), inputRight(engine, input_bus), kBlockSize);
      appendPcm(active_input_l, active_input_r, inputLeft(engine, input_bus), inputRight(engine, input_bus));
    }
    std::fill(output_l.begin(), output_l.end(), 0.0f);
    std::fill(output_r.begin(), output_r.end(), 0.0f);
    engine.renderFxGraph(output_l.data(), output_r.data(), 0u, kBlockSize);
    if (measure_active) {
      result.raw.add(rawLeft(engine, output_node), rawRight(engine, output_node), kBlockSize);
      result.node.add(nodeLeft(engine, output_node), nodeRight(engine, output_node), kBlockSize);
      result.returned.add(returnedLeft(engine, output_node), returnedRight(engine, output_node), kBlockSize);
      appendPcm(active_output_l, active_output_r, returnedLeft(engine, output_node), returnedRight(engine, output_node));
    } else if (!active) {
      result.tail.add(returnedLeft(engine, output_node), returnedRight(engine, output_node), kBlockSize);
      appendPcm(tail_output_l, tail_output_r, returnedLeft(engine, output_node), returnedRight(engine, output_node));
    }
    engine.transport.sample_frame += kBlockSize;
  }

  while (tail_output_l.size() < kessho::offline::kLoudnessWindowFrames) {
    tail_output_l.push_back(0.0f);
    tail_output_r.push_back(0.0f);
  }
  result.input_lufs = integratedLufs(active_input_l, active_input_r);
  result.output_lufs = integratedLufs(active_output_l, active_output_r);
  result.delta_lu = lufsDelta(result.output_lufs, result.input_lufs);
  result.tail_lufs = integratedLufs(tail_output_l, tail_output_r);

  require(result.input.rms() > kNonzeroRms, "steady input fixture rendered silence");
  require(result.node.rms() > kNonzeroRms, "active FX fixture rendered silence");
  return result;
}

void configureDelayA(KesshoProductEngine& engine) {
  engine.fx.delay_a_enabled = true;
  engine.fx.delay_a_time_left_ms = 100.0f;
  engine.fx.delay_a_time_right_ms = 100.0f;
  engine.fx.delay_a_feedback = 0.0f;
  engine.fx.delay_a_filter_hz = 12000.0f;
  engine.fx.delay_a_filter_type = 0u;
  engine.fx.delay_a_mix = 1.0f;
  engine.fx.delay_a_width = 0.5f;
  engine.fx.delay_a_ping_pong = false;
  engine.fx.delay_a_duck = 0.0f;
}

void configureDelayBMatched(KesshoProductEngine& engine) {
  engine.fx.delay_b_enabled = true;
  engine.fx.delay_b_activity = 0.0f;
  engine.fx.delay_b_repeats = 0.0f;
  engine.fx.delay_b_base_time_ms = 100.0f;
  engine.fx.delay_b_tone = 1.0f;
  engine.fx.delay_b_vibrato = 0.0f;
  engine.fx.delay_b_mix = 1.0f;
  engine.fx.delay_b_space_mode = 0u;
  engine.fx.delay_b_pattern = 0u;
  engine.fx.delay_b_warp = 0u;
  engine.fx.delay_b_warp_intensity = 0.0f;
  engine.fx.delay_b_spread = 0.0f;
  engine.fx.delay_b_tape_head_mask = 1u;
  engine.fx.delay_b_tape_head_levels = {{1.0f, 0.0f, 0.0f, 0.0f}};
}

void configureDelayBFull(KesshoProductEngine& engine) {
  configureDelayBMatched(engine);
  engine.fx.delay_b_activity = 1.0f;
}

void configureReverb(KesshoProductEngine& engine) {
  engine.fx.reverb_mix = 1.0f;
  engine.fx.reverb_type = 2u;
  engine.fx.reverb_quality = 1u;
  engine.fx.reverb_decay = 0.65f;
  engine.fx.reverb_size = 1.5f;
  engine.fx.reverb_damping = 0.4f;
  engine.fx.reverb_diffusion = 1.0f;
  engine.fx.reverb_modulation = 0.0f;
  engine.fx.reverb_predelay_ms = 0.0f;
  engine.fx.reverb_width = 0.85f;
  engine.fx.reverb_shimmer_amount = 0.0f;
  engine.fx.reverb_reverse_amount = 0.0f;
  engine.fx.reverb_chorus_depth = 0.0f;
  engine.fx.reverb_cross_feed = 0.0f;
  engine.fx.reverb_pre_comp_threshold = -36.0f;
  engine.fx.reverb_pre_comp_knee = 0.0f;
  engine.fx.reverb_pre_comp_ratio = 1.0f;
  engine.fx.reverb_pre_comp_makeup = 1.0f;
}

void configureGranular(KesshoProductEngine& engine) {
  engine.fx.granular_enabled = true;
  engine.fx.granular_mix = 1.0f;
  engine.fx.granular_feedback = 0.0f;
  engine.fx.granular_buffer_seconds = 1.0f;
  engine.fx.granular_grain_shape = 0u;
  engine.fx.granular_bus_diffusion = 0.0f;
  engine.fx.granular_timing_randomness = 0.0f;
  engine.fx.granular_output_lpf_hz = 12000.0f;
  engine.fx.granular_reverb_lpf_hz = 12000.0f;
  for (uint32_t index = 0u; index < kGranularVoiceCount; ++index) {
    engine.fx.granular_voices[index] = {};
  }
  GranularVoiceState& voice = engine.fx.granular_voices[0];
  voice.enabled = true;
  voice.mode = 0u;
  voice.slice = 0u;
  voice.speed = 1.0f;
  voice.scan_rate = 1.0f;
  voice.pitch = 0.0f;
  voice.write_follow = 1.0f;
  voice.density = 16.0f;
  voice.grain_size_ms = 60.0f;
  voice.spray = 0.0f;
  voice.grain_octave_probability = 0.0f;
  voice.attack_seconds = 0.01f;
  voice.decay_seconds = 0.12f;
  voice.gain = 1.0f;
  voice.pan = 0.0f;
  voice.blur = 0.0f;
  voice.stereo_spread = 0.0f;
}

void configureDegrade(KesshoProductEngine& engine) {
  engine.fx.dynamics_enabled = true;
  engine.fx.dynamics_drift_enabled = true;
  engine.fx.dynamics_drift_mode = 2u;
  engine.fx.dynamics_drift_quality = 1u;
  engine.fx.dynamics_drift_mix = 0.35f;
  engine.fx.dynamics_drift_age = 0.2f;
  engine.fx.dynamics_drift_bias = 0.44f;
  engine.fx.dynamics_drift_lpg_amount = 0.68f;
  engine.fx.dynamics_drift_resonance = 0.35f;
  engine.fx.dynamics_drift_stereo = 0.5f;
  engine.fx.dynamics_drift_env_follow = 0.35f;
  engine.fx.dynamics_drift_depth = 0.72f;
  engine.fx.dynamics_drift_rate = 0.18f;
  engine.fx.dynamics_drift_damp = 0.62f;
  engine.fx.dynamics_erosion_enabled = false;
  engine.fx.dynamics_degrade_hp = 0.0f;
  engine.fx.dynamics_degrade_lp = 1.0f;
}

void configureFreeze(KesshoProductEngine& engine) {
  engine.fx.spectral_freeze_enabled = true;
  engine.fx.spectral_freeze_active = true;
  engine.fx.spectral_freeze_mode = 2u;
  engine.fx.spectral_freeze_capture_serial = 1u;
  engine.fx.spectral_freeze_stretch_speed = 0.5f;
  engine.fx.spectral_freeze_direction = 2u;
  engine.fx.spectral_freeze_position = 0.0f;
  engine.fx.spectral_freeze_refresh = 0.15f;
  engine.fx.spectral_freeze_input_sensitivity = 0.5f;
  engine.fx.spectral_freeze_diffusion = 0.55f;
  engine.fx.spectral_freeze_tone = 0.0f;
  engine.fx.spectral_freeze_width = 0.85f;
  engine.fx.spectral_freeze_sustain = 1.0f;
  engine.fx.spectral_freeze_mix = 1.0f;
  engine.fx.spectral_freeze_reverb_crossfade = 0.0f;
}

void configureEq1(KesshoProductEngine& engine) {
  engine.fx.dynamics_eq1_enabled = true;
  engine.fx.dynamics_eq1_input_gain_db = 0.0f;
  engine.fx.dynamics_eq1_output_gain_db = 0.0f;
  engine.fx.dynamics_eq1_mix = 1.0f;
  engine.fx.dynamics_eq1_low_gain_db = 0.0f;
  engine.fx.dynamics_eq1_mid_gain_db = 0.0f;
  engine.fx.dynamics_eq1_high_gain_db = 0.0f;
}

void configureEq2(KesshoProductEngine& engine) {
  engine.fx.dynamics_eq2_enabled = true;
  engine.fx.dynamics_eq2_input_gain_db = 0.0f;
  engine.fx.dynamics_eq2_output_gain_db = 0.0f;
  engine.fx.dynamics_eq2_mix = 1.0f;
  engine.fx.dynamics_eq2_low_gain_db = 0.0f;
  engine.fx.dynamics_eq2_mid_gain_db = 0.0f;
  engine.fx.dynamics_eq2_high_gain_db = 0.0f;
}

void configureNeutralSidechain(KesshoProductEngine& engine) {
  engine.fx.sidechain_enabled = false;
  engine.fx.sidechain_mix = 1.0f;
}

void configureCreativeSaturation(KesshoProductEngine& engine) {
  engine.fx.dynamics_saturation_enabled = true;
  engine.fx.dynamics_saturation_mode = 2u;
  engine.fx.dynamics_saturation_quality = 1u;
  engine.fx.dynamics_saturation_drive = 0.42f;
  engine.fx.dynamics_saturation_tone = 0.5f;
  engine.fx.dynamics_saturation_bias = 0.5f;
}

void appendMetric(std::ostringstream& json, const SignalMetrics& metric) {
  json << "{\"rms\":" << std::setprecision(9) << metric.rms()
       << ",\"peak\":" << metric.peak
       << ",\"hash\":\"" << metric.hash << "\"}";
}

void appendLufs(std::ostringstream& json, double value) {
  if (std::isfinite(value)) json << std::setprecision(9) << value;
  else json << "null";
}

void appendMeasurement(std::ostringstream& json, const Measurement& result) {
  json << "{\"name\":\"" << result.name << "\",\"active_blocks\":" << result.active_blocks
       << ",\"warmup_blocks\":" << result.warmup_blocks
       << ",\"tail_blocks\":" << result.tail_blocks << ",\"input\":";
  appendMetric(json, result.input);
  json << ",\"raw\":";
  appendMetric(json, result.raw);
  json << ",\"node\":";
  appendMetric(json, result.node);
  json << ",\"returned\":";
  appendMetric(json, result.returned);
  json << ",\"tail\":";
  appendMetric(json, result.tail);
  json << ",\"raw_delta_db\":" << dbDelta(result.raw.rms(), result.input.rms())
       << ",\"node_delta_db\":" << dbDelta(result.node.rms(), result.input.rms())
       << ",\"returned_delta_db\":" << dbDelta(result.returned.rms(), result.input.rms())
       << ",\"tail_delta_db\":" << dbDelta(result.tail.rms(), result.input.rms())
       << ",\"input_lufs\":";
  appendLufs(json, result.input_lufs);
  json << ",\"output_lufs\":";
  appendLufs(json, result.output_lufs);
  json << ",\"delta_lu\":";
  appendLufs(json, result.delta_lu);
  json << ",\"tail_lufs\":";
  appendLufs(json, result.tail_lufs);
  json << "}";
}

} // namespace

int main() {
  const Measurement measurements[] = {
      renderCase("delay_a_matched_100ms", InputBus::DelayA, OutputNode::DelayA, 96u, 320u, 96u, configureDelayA),
      renderCase("delay_b_matched_100ms_activity0", InputBus::DelayB, OutputNode::DelayB, 96u, 320u, 96u, configureDelayBMatched),
      renderCase("delay_b_matched_100ms_activity1", InputBus::DelayB, OutputNode::DelayB, 96u, 320u, 96u, configureDelayBFull),
      renderCase("reverb_controlled", InputBus::Reverb, OutputNode::Reverb, 64u, 320u, 768u, configureReverb),
      renderCase("granular_controlled", InputBus::Granular, OutputNode::Granular, 128u, 640u, 384u, configureGranular),
      renderCase("degrade_drift_controlled", InputBus::Degrade, OutputNode::Degrade, 32u, 192u, 32u, configureDegrade),
      renderCase("spectral_freeze_controlled", InputBus::Freeze, OutputNode::Freeze, 900u, 1500u, 512u, configureFreeze),
      renderCase("eq1_neutral", InputBus::Eq1, OutputNode::Eq1, 16u, 192u, 32u, configureEq1),
      renderCase("eq2_neutral", InputBus::Eq2, OutputNode::Eq2, 16u, 192u, 32u, configureEq2),
      renderCase("sidechain_neutral", InputBus::Sidechain, OutputNode::Sidechain, 16u, 192u, 32u, configureNeutralSidechain),
      renderCase("creative_saturation_controlled", InputBus::CreativeSaturation,
          OutputNode::CreativeSaturation, 16u, 192u, 32u, configureCreativeSaturation),
  };

  require(measurements[0].returned.rms() > kNonzeroRms, "Delay A return was silent");
  require(measurements[1].returned.rms() > kNonzeroRms, "matched Delay B return was silent");
  require(measurements[2].returned.rms() > kNonzeroRms, "full Delay B return was silent");
  require(measurements[3].tail.rms() > kNonzeroRms, "Reverb tail was silent");
  require(measurements[4].tail.rms() > kNonzeroRms, "Granular tail was silent");
  require(measurements[5].tail.peak <= 1.0e-7f, "Degrade emitted a stale tail");
  require(measurements[6].tail.rms() > kNonzeroRms, "Spectral Freeze tail was silent");
  for (size_t index = 7u; index < 10u; ++index) {
    require(measurements[index].tail.peak <= 1.0e-7f, "neutral terminal node emitted a stale tail");
    require(std::fabs(measurements[index].returned.rms() - measurements[index].input.rms()) <= 1.0e-6f,
        "neutral terminal node was not unity");
  }
  require(measurements[10].tail.peak <= 1.0e-7f, "Creative Saturation emitted a stale tail");

  std::ostringstream json;
  json << "{\"schema\":\"kessho-product-fx-loudness-measurement-v1\",\"sample_rate\":"
       << static_cast<uint32_t>(kSampleRate) << ",\"block_size\":" << kBlockSize << ",\"fixtures\":[";
  for (size_t index = 0u; index < std::size(measurements); ++index) {
    if (index != 0u) json << ',';
    appendMeasurement(json, measurements[index]);
  }
  json << "]}";
  std::cout << "KESSHO_PRODUCT_FX_LOUDNESS_JSON=" << json.str() << "\n";
  std::cout << "Product FX loudness measurement fixtures passed\n";
  return 0;
}
