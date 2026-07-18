#include "../KesshoProductEngineInternal.h"

namespace {

uint32_t sonicHashU32(uint32_t value) {
  value ^= value >> 16u;
  value *= 0x7feb352du;
  value ^= value >> 15u;
  value *= 0x846ca68bu;
  value ^= value >> 16u;
  return value == 0u ? 1u : value;
}

float sonicHashUnit(uint32_t value) {
  return static_cast<float>(sonicHashU32(value) & 0x00ffffffu) / 16777216.0f;
}

} // namespace

void KesshoProductEngine::resetSonicRuntimeState() {
  sonic_runtime = {};
  for (uint32_t index = 0u; index < kProductSourceMorphAutomationCount; ++index) {
    sonic_runtime.source_morph[index].target_id = index;
    sonic_runtime.source_morph[index].rng_state = sonicHashU32(rng_seed ^ (index * 0x9e3779b9u));
  }
}

void KesshoProductEngine::configureSourceMorphAutomation(
    uint32_t target_id,
    bool enabled,
    ProductMorphMode mode,
    float phrases_per_cycle,
    uint32_t seed) {
  if (target_id >= kProductSourceMorphAutomationCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  SourceMorphAutomationState& runtime = sonic_runtime.source_morph[target_id];
  runtime.target_id = target_id;
  runtime.enabled = enabled ? 1u : 0u;
  const uint32_t target_bit = 1u << target_id;
  if (enabled) {
    sonic_runtime.source_morph_enabled_mask |= target_bit;
  } else {
    sonic_runtime.source_morph_enabled_mask &= ~target_bit;
  }
  runtime.mode = mode;
  runtime.phrases_per_cycle = clampFloat(phrases_per_cycle, 1.0f, 4096.0f);
  runtime.direction = 1;
  runtime.rng_state = sonicHashU32((seed == 0u ? rng_seed : seed) ^ (target_id * 0x9e3779b9u));
  runtime.cycle_start_frame = transport.sample_frame;
  const double duration = transport.samplesPerPhrase(sample_rate) * runtime.phrases_per_cycle;
  runtime.cycle_duration_frames = static_cast<uint64_t>(std::max(1.0, std::round(duration)));
  runtime.last_random_cycle_index = 0u;
  if (target_id < kProductDirectSourceMorphAutomationCount) {
    runtime.held_random = sources[target_id].morph;
  } else {
    runtime.held_random = sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u]
        .drum_voice_morphs[target_id - kProductDirectSourceMorphAutomationCount];
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::disableSourceMorphAutomationForSource(uint32_t source_id) {
  if (source_id >= KESSHO_PRODUCT_SOURCE_PAD1 && source_id <= KESSHO_PRODUCT_SOURCE_LEAD2) {
    const uint32_t target_id = source_id - 1u;
    sonic_runtime.source_morph[target_id].enabled = 0u;
    sonic_runtime.source_morph_enabled_mask &= ~(1u << target_id);
  }
}

void KesshoProductEngine::disableSourceMorphAutomationForDrumVoice(uint32_t voice_index) {
  if (voice_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
    const uint32_t target_id = kProductDirectSourceMorphAutomationCount + voice_index;
    sonic_runtime.source_morph[target_id].enabled = 0u;
    sonic_runtime.source_morph_enabled_mask &= ~(1u << target_id);
  }
}

void KesshoProductEngine::applySourceMorphAutomationValue(uint32_t target_id, float value) {
  const float clamped = clampFloat(value, 0.0f, 1.0f);
  if (target_id < kProductDirectSourceMorphAutomationCount) {
    applySourceMorphValue(target_id + 1u, clamped, false);
    return;
  }
  const uint32_t voice_index = target_id - kProductDirectSourceMorphAutomationCount;
  if (voice_index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) return;
  sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_voice_morphs[voice_index] = clamped;
}

void KesshoProductEngine::scheduleSourceMorphAutomation() {
  if (!transport.running || sonic_runtime.source_morph_enabled_mask == 0u) return;
  uint32_t enabled_mask = sonic_runtime.source_morph_enabled_mask;
  for (uint32_t target_id = 0u; enabled_mask != 0u; ++target_id, enabled_mask >>= 1u) {
    if ((enabled_mask & 1u) == 0u) continue;
    SourceMorphAutomationState& runtime = sonic_runtime.source_morph[target_id];
    const uint64_t duration = std::max<uint64_t>(1u, runtime.cycle_duration_frames);
    const uint64_t elapsed = transport.sample_frame >= runtime.cycle_start_frame
        ? transport.sample_frame - runtime.cycle_start_frame
        : 0u;
    const uint64_t cycle_index = elapsed / duration;
    const uint64_t frame_in_cycle = elapsed % duration;
    const float phase = static_cast<float>(
        static_cast<double>(frame_in_cycle) / static_cast<double>(duration));
    float value = 0.0f;
    switch (runtime.mode) {
      case ProductMorphMode::Linear:
        value = phase;
        break;
      case ProductMorphMode::PingPong:
        value = phase < 0.5f ? phase * 2.0f : (1.0f - phase) * 2.0f;
        runtime.direction = phase < 0.5f ? 1 : -1;
        break;
      case ProductMorphMode::Random:
        if (cycle_index > 0u && cycle_index != runtime.last_random_cycle_index) {
          runtime.held_random = sonicHashUnit(runtime.rng_state ^ static_cast<uint32_t>(cycle_index));
          runtime.last_random_cycle_index = cycle_index;
        }
        value = runtime.held_random;
        break;
    }
    applySourceMorphAutomationValue(runtime.target_id, value);
  }
}

void KesshoProductEngine::configureProductAutoStop(bool enabled, double duration_seconds) {
  sonic_runtime.auto_stop.enabled = enabled;
  if (!enabled) {
    sonic_runtime.auto_stop.target_sample_frame = 0u;
    return;
  }
  const double finite_duration = std::isfinite(duration_seconds)
      ? std::max(0.0, duration_seconds)
      : 0.0;
  const uint64_t duration_frames = static_cast<uint64_t>(std::llround(finite_duration * sample_rate));
  sonic_runtime.auto_stop.target_sample_frame = transport.sample_frame + duration_frames;
}

uint64_t KesshoProductEngine::nextAutoStopFrame() const {
  return sonic_runtime.auto_stop.enabled
      ? sonic_runtime.auto_stop.target_sample_frame
      : UINT64_MAX;
}

void KesshoProductEngine::applyAutoStopAtCurrentFrame() {
  if (!sonic_runtime.auto_stop.enabled ||
      transport.sample_frame < sonic_runtime.auto_stop.target_sample_frame) {
    return;
  }
  sonic_runtime.auto_stop.enabled = false;
  if (journey_schedule_runtime.running) {
    setJourneyScheduleEnabled(false);
  }
  transport.running = false;
  stopSoundscapeTransportRuntime();
  for (uint32_t index = 0u; index < synth_lane_count; ++index) {
    resetSequencerLaneRuntime(synth_lanes[index]);
  }
  for (uint32_t index = 0u; index < drum_lane_count; ++index) {
    resetSequencerLaneRuntime(drum_lanes[index]);
  }
}
