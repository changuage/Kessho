#include "../KesshoProductEngineInternal.h"

namespace {

constexpr double kProductRuntimeSampleHoldRateHz = 10.0;
constexpr float kProductRandomWalkTickSeconds = 0.10f;
constexpr uint32_t kProductRandomWalkMaxCatchupSteps = 24u;
constexpr float kProductRuntimeRandomWalkMinSpeed = 0.01f;
constexpr float kProductRuntimeRandomWalkMaxSpeed = 5.0f;

// Sync division values are encoded in musical order. 4x and 2x are periods
// spanning multiple references; fractional labels are cycles per reference.
constexpr float kProductShapeSyncPeriods[] = {4.0f, 2.0f, 1.0f, 0.5f, 0.25f, 0.125f, 0.0625f};

uint32_t runtimeSampleHoldIntervalFrames(double sample_rate) {
  if (!std::isfinite(sample_rate) || sample_rate <= 0.0) {
    return 1u;
  }
  return std::max<uint32_t>(1u, static_cast<uint32_t>(std::lround(sample_rate / kProductRuntimeSampleHoldRateHz)));
}

float wrapUnit(float phase) {
  phase -= std::floor(phase);
  return phase < 0.0f ? phase + 1.0f : phase;
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

float shapeWaveformValue(uint32_t shape, float phase) {
  const float p = wrapUnit(phase);
  switch (shape) {
    case KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE:
      return p < 0.5f ? p * 2.0f : (1.0f - p) * 2.0f;
    case KESSHO_PRODUCT_MODULATION_SHAPE_SQUARE:
      return p < 0.5f ? 0.0f : 1.0f;
    case KESSHO_PRODUCT_MODULATION_SHAPE_SINE:
    default:
      // All shapes start at the lower edge of the authored range.
      return 0.5f - 0.5f * std::cos(static_cast<float>(kTwoPi) * p);
  }
}

float syncShapePhase(
    const ProductTransport& transport,
    double sample_rate,
    uint64_t sample,
    uint32_t reference,
    uint32_t division) {
  const double reference_position = reference == KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_PHRASE
      ? transport.phrasePositionAt(sample_rate, sample)
      : transport.barPositionAt(sample_rate, sample);
  const uint32_t safe_division = std::min<uint32_t>(
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1_16,
      division);
  const double period = static_cast<double>(kProductShapeSyncPeriods[safe_division]);
  const double cycles = reference_position / period;
  return wrapUnit(static_cast<float>(cycles));
}

void advanceLinkedRandomWalk(KesshoProductEngine& engine, uint32_t frames, uint32_t slot) {
  slot = std::min<uint32_t>(slot, kModulationSourceSlotCount - 1u);
  if (!engine.modulation_link_walk_initialized[slot]) {
    engine.modulation_link_walk_position[slot] = 0.5f;
    engine.modulation_link_walk_velocity[slot] = 0.0f;
    engine.modulation_link_walk_step_accumulator[slot] = 0.0f;
    engine.modulation_link_walk_counter[slot] = 0u;
    engine.modulation_link_walk_initialized[slot] = true;
  }
  const float tick_frames = std::max(
      1.0f,
      static_cast<float>(engine.sample_rate) * kProductRandomWalkTickSeconds);
  engine.modulation_link_walk_step_accumulator[slot] = std::min(
      static_cast<float>(kProductRandomWalkMaxCatchupSteps),
      engine.modulation_link_walk_step_accumulator[slot] + static_cast<float>(frames) / tick_frames);
  const uint32_t step_count = std::min<uint32_t>(
      kProductRandomWalkMaxCatchupSteps,
      static_cast<uint32_t>(std::floor(engine.modulation_link_walk_step_accumulator[slot])));
  engine.modulation_link_walk_step_accumulator[slot] -= static_cast<float>(step_count);
  const float speed = clampFloat(
      engine.modulation_link_walk_speed[slot],
      kProductRuntimeRandomWalkMinSpeed,
      kProductRuntimeRandomWalkMaxSpeed);
  for (uint32_t step = 0u; step < step_count; ++step) {
    const uint32_t step_seed =
        engine.rng_seed ^
        (engine.modulation_link_walk_counter[slot] * 0x9e3779b9u) ^
        (0x94d049bbu + slot * 0x85ebca6bu);
    ++engine.modulation_link_walk_counter[slot];
    engine.modulation_link_walk_velocity[slot] += (hashUnit(step_seed) - 0.5f) * 0.01f * speed;
    engine.modulation_link_walk_velocity[slot] *= 0.98f;
    engine.modulation_link_walk_velocity[slot] = clampFloat(
        engine.modulation_link_walk_velocity[slot],
        -0.05f * speed,
        0.05f * speed);
    engine.modulation_link_walk_position[slot] += engine.modulation_link_walk_velocity[slot];
    if (engine.modulation_link_walk_position[slot] < 0.0f) {
      engine.modulation_link_walk_position[slot] = 0.0f;
      engine.modulation_link_walk_velocity[slot] = std::abs(engine.modulation_link_walk_velocity[slot]);
    } else if (engine.modulation_link_walk_position[slot] > 1.0f) {
      engine.modulation_link_walk_position[slot] = 1.0f;
      engine.modulation_link_walk_velocity[slot] = -std::abs(engine.modulation_link_walk_velocity[slot]);
    }
  }
  engine.modulation_link_walk_position[slot] = clampFloat(
      engine.modulation_link_walk_position[slot],
      0.0f,
      1.0f);
}

} // namespace

void KesshoProductEngine::advanceModulationRanges(uint32_t frames) {
  if (frames == 0u || active_modulation_range_count == 0u) {
    return;
  }

  bool has_linked_shape[kModulationSourceSlotCount]{};
  bool has_linked_walk[kModulationSourceSlotCount]{};
  for (uint32_t active_index = 0u; active_index < active_modulation_range_count; ++active_index) {
    const uint32_t range_index = active_modulation_range_indices[active_index];
    if (range_index >= kMaxModulationRanges) continue;
    const ModulationRange& range = modulation_ranges[range_index];
    if (!range.active) continue;
    const uint32_t slot = std::min<uint32_t>(range.source_slot, kModulationSourceSlotCount - 1u);
    has_linked_shape[slot] = has_linked_shape[slot] ||
        (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_SHAPE_LFO &&
         range.timing == KESSHO_PRODUCT_MODULATION_TIMING_LINK);
    has_linked_walk[slot] = has_linked_walk[slot] ||
        (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK &&
         range.timing == KESSHO_PRODUCT_MODULATION_TIMING_LINK);
  }

  const double phrase_frames = std::max(1.0, transport.samplesPerPhrase(sample_rate));
  const float shape_phrase_step = static_cast<float>(static_cast<double>(frames) / phrase_frames);
  float linked_shape_positions[kModulationSourceSlotCount][3]{};
  for (uint32_t slot = 0u; slot < kModulationSourceSlotCount; ++slot) {
    if (has_linked_shape[slot]) {
      if (!modulation_link_shape_initialized[slot]) {
        modulation_link_shape_phase[slot] = 0.0f;
        modulation_link_shape_initialized[slot] = true;
      }
      const float speed = clampFloat(
          modulation_link_shape_speed[slot],
          kProductRuntimeRandomWalkMinSpeed,
          kProductRuntimeRandomWalkMaxSpeed);
      modulation_link_shape_phase[slot] = wrapUnit(
          modulation_link_shape_phase[slot] + shape_phrase_step * speed);
      for (uint32_t shape = KESSHO_PRODUCT_MODULATION_SHAPE_SINE;
           shape <= KESSHO_PRODUCT_MODULATION_SHAPE_SQUARE;
           ++shape) {
        linked_shape_positions[slot][shape] = shapeWaveformValue(shape, modulation_link_shape_phase[slot]);
      }
    }
    if (has_linked_walk[slot]) {
      advanceLinkedRandomWalk(*this, frames, slot);
    }
  }

  for (uint32_t active_index = 0u; active_index < active_modulation_range_count; ++active_index) {
    const uint32_t range_index = active_modulation_range_indices[active_index];
    if (range_index >= kMaxModulationRanges) continue;
    ModulationRange& range = modulation_ranges[range_index];
    if (!range.active) continue;

    if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
      if (range.target_id != 0u &&
          !isSoundscapeAssetLevelRangeTarget(range.target_id) &&
          !isSoundscapeTextureLevelRangeTarget(range.target_id) &&
          !isSoundscapeTextureParamTarget(range.target_id) &&
          !isSoundscapeModuleParamTarget(range.target_id)) {
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

    if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_SHAPE_LFO) {
      if (range.max_value <= range.min_value) {
        range.current_value = range.min_value;
        applyRuntimeModulationValue(range);
        continue;
      }
      float phase = range.shape_lfo_phase;
      if (range.timing == KESSHO_PRODUCT_MODULATION_TIMING_FREE) {
        const float speed = clampFloat(
            range.random_walk_speed,
            kProductRuntimeRandomWalkMinSpeed,
            kProductRuntimeRandomWalkMaxSpeed);
        range.shape_lfo_phase = wrapUnit(
            range.shape_lfo_phase + shape_phrase_step * speed);
        phase = range.shape_lfo_phase;
      } else if (range.timing == KESSHO_PRODUCT_MODULATION_TIMING_LINK) {
        phase = modulation_link_shape_phase[std::min<uint32_t>(range.source_slot, kModulationSourceSlotCount - 1u)];
      } else if (transport.running) {
        phase = syncShapePhase(
            transport,
            sample_rate,
            transport.sample_frame + frames,
            range.sync_reference,
            range.sync_division);
        range.shape_lfo_phase = phase;
        range.shape_sync_phase_initialized = true;
      } else {
        if (!range.shape_sync_phase_initialized) {
          range.shape_lfo_phase = syncShapePhase(
              transport,
              sample_rate,
              transport.sample_frame,
              range.sync_reference,
              range.sync_division);
          range.shape_sync_phase_initialized = true;
        }
        const uint32_t safe_division = std::min<uint32_t>(
            KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1_16,
            range.sync_division);
        const double reference_frames = range.sync_reference == KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_PHRASE
            ? transport.samplesPerPhrase(sample_rate)
            : transport.samplesPerBeat(sample_rate) * static_cast<double>(std::max(1u, transport.beats_per_bar));
        const double cycle_frames = std::max(1.0,
            reference_frames * static_cast<double>(kProductShapeSyncPeriods[safe_division]));
        range.shape_lfo_phase = wrapUnit(
            range.shape_lfo_phase + static_cast<float>(static_cast<double>(frames) / cycle_frames));
        phase = range.shape_lfo_phase;
      }
      const float position = range.timing == KESSHO_PRODUCT_MODULATION_TIMING_LINK
          ? linked_shape_positions[std::min<uint32_t>(range.source_slot, kModulationSourceSlotCount - 1u)]
              [std::min<uint32_t>(range.shape, KESSHO_PRODUCT_MODULATION_SHAPE_SQUARE)]
          : shapeWaveformValue(range.shape, phase);
      range.current_value = range.min_value +
          (range.max_value - range.min_value) * position;
      applyRuntimeModulationValue(range);
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
    if (range.timing == KESSHO_PRODUCT_MODULATION_TIMING_LINK) {
      const uint32_t slot = std::min<uint32_t>(range.source_slot, kModulationSourceSlotCount - 1u);
      range.current_value = range.min_value +
          span * modulation_link_walk_position[slot];
      range.velocity = modulation_link_walk_velocity[slot];
      applyRuntimeWalkValue(range);
      continue;
    }
    if (range.timing == KESSHO_PRODUCT_MODULATION_TIMING_SYNC && !transport.running) {
      continue;
    }
    if (range.random_walk_global) {
      const uint64_t source_frame = range.timing == KESSHO_PRODUCT_MODULATION_TIMING_SYNC
          ? transport.sample_frame + frames
          : product_render_frame + frames;
      const double seconds = std::isfinite(sample_rate) && sample_rate > 0.0
          ? static_cast<double>(source_frame) / sample_rate
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
    for (uint32_t step = 0u; step < step_count; ++step) {
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
