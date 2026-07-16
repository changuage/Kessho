#include "../KesshoProductEngineInternal.h"

namespace {

constexpr double kProductRuntimeSampleHoldRateHz = 10.0;
constexpr float kProductRandomWalkTickSeconds = 0.10f;
constexpr uint32_t kProductRandomWalkMaxCatchupSteps = 24u;
constexpr float kProductRuntimeRandomWalkMinSpeed = 0.01f;
constexpr float kProductRuntimeRandomWalkMaxSpeed = 5.0f;

uint32_t runtimeSampleHoldIntervalFrames(double sample_rate) {
  if (!std::isfinite(sample_rate) || sample_rate <= 0.0) {
    return 1u;
  }
  return std::max<uint32_t>(1u, static_cast<uint32_t>(std::lround(sample_rate / kProductRuntimeSampleHoldRateHz)));
}

float randomWalkPosition(const ModulationRange& range) {
  const float span = range.max_value - range.min_value;
  if (span <= 0.0f) {
    return 0.0f;
  }
  return clampFloat((range.current_value - range.min_value) / span, 0.0f, 1.0f);
}

float smoothRandomWalkPosition(const ModulationRange& range, double seconds) {
  const float speed = clampFloat(range.random_walk_speed, kProductRuntimeRandomWalkMinSpeed, kProductRuntimeRandomWalkMaxSpeed);
  const float phase = static_cast<float>(seconds) * std::max(0.05f, speed) * 0.08f;
  const float phase_floor = std::floor(phase);
  const uint32_t i0 = static_cast<uint32_t>(std::max(0.0f, phase_floor));
  const uint32_t i1 = i0 + 1u;
  const float frac = clampFloat(phase - phase_floor, 0.0f, 1.0f);
  const float smooth = frac * frac * (3.0f - 2.0f * frac);
  const uint32_t base_seed = range.seed ^ (range.control_id * 0x9e3779b9u);
  const float v0 = hashUnit(base_seed ^ (i0 * 0x85ebca6bu) ^ 0x7f4a7c15u);
  const float v1 = hashUnit(base_seed ^ (i1 * 0x85ebca6bu) ^ 0x7f4a7c15u);
  return clampFloat(v0 + (v1 - v0) * smooth, 0.0f, 1.0f);
}

} // namespace

  void KesshoProductEngine::advanceModulationRanges(uint32_t frames) {
  if (frames == 0u || active_modulation_range_count == 0u) {
    return;
  }
  for (uint32_t active_index = 0u; active_index < active_modulation_range_count; ++active_index) {
    const uint32_t range_index = active_modulation_range_indices[active_index];
    if (range_index >= kMaxModulationRanges) {
      continue;
    }
    ModulationRange& range = modulation_ranges[range_index];
    if (!range.active) continue;
    if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
      if (range.target_id != 0u && !isSoundscapeAssetLevelRangeTarget(range.target_id)) {
        continue;
      }
      if (range.sample_hold_trigger_bus != kProductSampleHoldTriggerTimed) {
        continue;
      }
      if (range.sample_hold_interval_frames == 0u) {
        range.sample_hold_interval_frames = runtimeSampleHoldIntervalFrames(sample_rate);
        range.sample_hold_frames_until_next = range.sample_hold_interval_frames;
      }
      if (range.sample_hold_frames_until_next > frames) {
        range.sample_hold_frames_until_next -= frames;
        continue;
      }
      const uint32_t interval = std::max(1u, range.sample_hold_interval_frames);
      const uint32_t elapsed_after_first = frames - range.sample_hold_frames_until_next;
      const uint32_t samples_due = 1u + elapsed_after_first / interval;
      const uint32_t remainder = elapsed_after_first % interval;
      range.sample_hold_counter += samples_due;
      range.current_value = modulationRangeSample(range, range.current_value, range.sample_hold_counter);
      range.last_trigger_frame = product_render_frame + frames;
      range.last_trigger_source = 0u;
      range.sample_hold_frames_until_next = interval - remainder;
      if (range.sample_hold_frames_until_next == 0u) {
        range.sample_hold_frames_until_next = interval;
      }
      applyModulationRangeValue(range);
      continue;
    }
    if (range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
      continue;
    }
    if (range.max_value <= range.min_value) {
      range.current_value = range.min_value;
      applyRuntimeWalkValue(range);
      continue;
    }
    const float span = range.max_value - range.min_value;
    if (range.random_walk_global) {
      const double seconds = std::isfinite(sample_rate) && sample_rate > 0.0
          ? static_cast<double>(product_render_frame + frames) / sample_rate
          : 0.0;
      range.current_value = range.min_value + span * smoothRandomWalkPosition(range, seconds);
      range.velocity = 0.0f;
      applyRuntimeWalkValue(range);
      continue;
    }
    const float tick_frames = std::max(1.0f, static_cast<float>(sample_rate) * kProductRandomWalkTickSeconds);
    range.random_walk_step_accumulator = std::min(
        static_cast<float>(kProductRandomWalkMaxCatchupSteps),
        range.random_walk_step_accumulator + static_cast<float>(frames) / tick_frames);
    const uint32_t step_count = std::min<uint32_t>(
        kProductRandomWalkMaxCatchupSteps,
        static_cast<uint32_t>(std::floor(range.random_walk_step_accumulator)));
    range.random_walk_step_accumulator -= static_cast<float>(step_count);
    float position = randomWalkPosition(range);
    const float speed = clampFloat(range.random_walk_speed, kProductRuntimeRandomWalkMinSpeed, kProductRuntimeRandomWalkMaxSpeed);
    for (uint32_t step = 0; step < step_count; ++step) {
      const uint32_t step_seed = range.seed ^
          (range.random_walk_counter * 0x9e3779b9u) ^
          (range.control_id * 0x85ebca6bu) ^
          0x94d049bbu;
      ++range.random_walk_counter;
      range.velocity += (hashUnit(step_seed) - 0.5f) * 0.01f * speed;
      range.velocity *= 0.98f;
      range.velocity = clampFloat(range.velocity, -0.05f * speed, 0.05f * speed);
      position += range.velocity;
      if (position < 0.0f) {
        position = 0.0f;
        range.velocity = std::abs(range.velocity);
      } else if (position > 1.0f) {
        position = 1.0f;
        range.velocity = -std::abs(range.velocity);
      }
    }
    range.current_value = range.min_value + span * clampFloat(position, 0.0f, 1.0f);
    applyRuntimeWalkValue(range);
  }
}
