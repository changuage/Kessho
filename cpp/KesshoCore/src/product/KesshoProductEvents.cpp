#include "KesshoProductEngineInternal.h"

#include <initializer_list>
#include <limits>

namespace {

bool finiteEventValues(const KesshoProductEvent& event) {
  return std::isfinite(event.value) && std::isfinite(event.value2) &&
      std::isfinite(event.value3) && std::isfinite(event.value4);
}

bool resolvePadRuntimeParamId(
    uint32_t param_id,
    uint32_t& source_id,
    uint32_t& pad_index,
    uint32_t& param_index) {
  if (param_id >= kProductPadRuntimeParamIdBase &&
      param_id < kProductPadRuntimeParamIdBase + kProductPadRuntimeParamCount) {
    source_id = KESSHO_PRODUCT_SOURCE_PAD1;
    pad_index = 0u;
    param_index = param_id - kProductPadRuntimeParamIdBase;
    return true;
  }
  if (param_id >= kProductPad2RuntimeParamIdBase &&
      param_id < kProductPad2RuntimeParamIdBase + kProductPadRuntimeParamCount) {
    source_id = KESSHO_PRODUCT_SOURCE_PAD2;
    pad_index = 1u;
    param_index = param_id - kProductPad2RuntimeParamIdBase;
    return true;
  }
  return false;
}

bool resolveLeadRuntimeParamId(
    uint32_t param_id,
    uint32_t& source_id,
    uint32_t& lead_index,
    uint32_t& param_index) {
  if (param_id >= kProductLeadRuntimeParamIdBase &&
      param_id < kProductLeadRuntimeParamIdBase + kProductLeadRuntimeParamCount) {
    source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
    lead_index = 0u;
    param_index = param_id - kProductLeadRuntimeParamIdBase;
    return true;
  }
  if (param_id >= kProductLead2RuntimeParamIdBase &&
      param_id < kProductLead2RuntimeParamIdBase + kProductLeadRuntimeParamCount) {
    source_id = KESSHO_PRODUCT_SOURCE_LEAD2;
    lead_index = 1u;
    param_index = param_id - kProductLead2RuntimeParamIdBase;
    return true;
  }
  return false;
}

bool manualHarmonyAllowed(float morph_phase) {
  return morph_phase <= 0.0f || morph_phase >= 1.0f;
}

void writeHarmonyPoolFromIntent(
    HarmonyState& harmony,
    uint32_t source,
    uint32_t degree,
    uint32_t quality,
    uint32_t strength,
    uint32_t root_note,
    int32_t slot_id,
    int32_t step_index) {
  int intervals[kMaxScaleNotes]{};
  const uint32_t scale_count = std::max(1u, scaleIntervals(harmony.scale_id, intervals));
  const uint32_t safe_degree = scale_count == 0u ? 0u : degree % scale_count;
  const float degree_root = clampFloat(harmony.root_midi + static_cast<float>(intervals[safe_degree]), 0.0f, 127.0f);
  float quality_intervals[8]{};
  uint32_t quality_count = 0u;
  const auto set_quality = [&](std::initializer_list<float> values) {
    quality_count = 0u;
    for (const float value : values) {
      if (quality_count < 8u) {
        quality_intervals[quality_count++] = value;
      }
    }
  };
  switch (quality) {
    case 1u: set_quality({0.0f, 3.0f, 6.0f}); break;
    case 2u: set_quality({0.0f, 3.0f, 7.0f}); break;
    case 3u: set_quality({0.0f, 4.0f, 7.0f}); break;
    case 4u: set_quality({0.0f, 5.0f, 7.0f}); break;
    case 5u: set_quality({0.0f, 4.0f, 7.0f, 11.0f}); break;
    case 6u: set_quality({0.0f, 3.0f, 7.0f, 10.0f}); break;
    case 7u: set_quality({0.0f, 4.0f, 7.0f, 10.0f}); break;
    case 8u: set_quality({0.0f, 4.0f, 7.0f, 14.0f}); break;
    case 9u: set_quality({0.0f, 4.0f, 7.0f, 9.0f}); break;
    case 10u: set_quality({0.0f, 4.0f, 7.0f, 9.0f, 14.0f}); break;
    case 11u: set_quality({0.0f, 4.0f, 7.0f, 10.0f, 14.0f}); break;
    case 12u: set_quality({0.0f, 5.0f, 10.0f, 15.0f}); break;
    case 13u: set_quality({0.0f, 1.0f, 2.0f, 4.0f}); break;
    case 0u:
    default:
      quality_count = std::min<uint32_t>(4u, scale_count);
      for (uint32_t i = 0u; i < quality_count; ++i) {
        const uint32_t degree_index = (safe_degree + i * 2u) % scale_count;
        const int octave = safe_degree + i * 2u >= scale_count ? 12 : 0;
        quality_intervals[i] = static_cast<float>(intervals[degree_index] - intervals[safe_degree] + octave);
      }
      break;
  }
  harmony.control_mode = source == 1u ? 1u : source == 3u ? 2u : source == 2u ? 3u : 0u;
  harmony.control_strength = strength > 0u ? 1u : 0u;
  harmony.active_source = source;
  harmony.active_slot_id = slot_id;
  harmony.active_step_index = step_index;
  harmony.note_pool_count = std::min<uint32_t>(quality_count, 8u);
  for (uint32_t i = 0u; i < 8u; ++i) {
    harmony.note_pool_midi[i] = i < harmony.note_pool_count
        ? clampFloat(degree_root + quality_intervals[i], 0.0f, 127.0f)
        : 0.0f;
  }
  harmony.bass_midi = -1.0f;
  harmony.manual_control_available = true;
  harmony.next_source = harmony.next_source == 0u ? source : harmony.next_source;
  (void)root_note;
}

// Runtime Harmony edits arrive as bounded control events, so mirror the
// resulting note pool into the fixed-capacity slot authority row immediately.
// This keeps sequencer slot references sample-accurate without rebuilding a
// snapshot or allocating on the audio thread, while leaving the authored
// semantic intent fields untouched for later authority rebuilds.
void syncHarmonySlotAuthorityRow(KesshoProductEngine& engine, uint32_t slot_id) {
  if (slot_id >= 8u) return;
  HarmonyState& harmony = engine.harmony;
  ProductArrangementState& arrangement = engine.arrangement;
  const uint32_t count = std::min<uint32_t>(harmony.note_pool_count, 8u);
  arrangement.harmony_slot_note_count[slot_id] = count;
  harmony.cached_voice_leading_candidate_note_counts[slot_id] = count;
  for (uint32_t note = 0u; note < 8u; ++note) {
    const float midi = note < count ? clampFloat(harmony.note_pool_midi[note], 0.0f, 127.0f) : 0.0f;
    arrangement.harmony_slot_midi[slot_id * 8u + note] = midi;
    harmony.cached_voice_leading_candidates[slot_id][note] = midi;
  }
  harmony.cached_voice_leading_candidate_count = 0u;
  for (uint32_t row = 0u; row < 8u; ++row) {
    if (harmony.cached_voice_leading_candidate_note_counts[row] > 0u) {
      harmony.cached_voice_leading_candidate_count = row + 1u;
    }
  }
}

void clearHarmonySlotAuthorityRow(KesshoProductEngine& engine, uint32_t slot_id) {
  if (slot_id >= 8u) return;
  engine.arrangement.harmony_slot_note_count[slot_id] = 0u;
  engine.harmony.cached_voice_leading_candidate_note_counts[slot_id] = 0u;
  for (uint32_t note = 0u; note < 8u; ++note) {
    engine.arrangement.harmony_slot_midi[slot_id * 8u + note] = 0.0f;
    engine.harmony.cached_voice_leading_candidates[slot_id][note] = 0.0f;
  }
  engine.harmony.cached_voice_leading_candidate_count = 0u;
  for (uint32_t row = 0u; row < 8u; ++row) {
    if (engine.harmony.cached_voice_leading_candidate_note_counts[row] > 0u) {
      engine.harmony.cached_voice_leading_candidate_count = row + 1u;
    }
  }
}

using GranularVoiceParamApplier = void (*)(GranularVoiceState&, float);

struct GranularVoiceParamSpec {
  uint32_t offset;
  GranularVoiceParamApplier apply;
};

void setGranularVoiceEnabled(GranularVoiceState& voice, float value) { voice.enabled = value >= 0.5f; }
void setGranularVoiceMode(GranularVoiceState& voice, float value) { voice.mode = value < 0.5f ? 0u : 1u; }
void setGranularVoiceSlice(GranularVoiceState& voice, float value) { voice.slice = clampU32(static_cast<uint32_t>(std::lround(value)), 0u, 15u); }
void setGranularVoiceSpeed(GranularVoiceState& voice, float value) { voice.speed = clampFloat(value, 0.0f, 4.0f); }
void setGranularVoiceScanRate(GranularVoiceState& voice, float value) { voice.scan_rate = clampFloat(value, 0.25f, 4.0f); }
void setGranularVoiceReverse(GranularVoiceState& voice, float value) { voice.reverse = value >= 0.5f; }
void setGranularVoicePitch(GranularVoiceState& voice, float value) { voice.pitch = clampFloat(value, -24.0f, 24.0f); }
void setGranularVoiceWriteFollow(GranularVoiceState& voice, float value) { voice.write_follow = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceDensity(GranularVoiceState& voice, float value) { voice.density = clampFloat(value, 1.0f, 64.0f); }
void setGranularVoiceGrainSize(GranularVoiceState& voice, float value) { voice.grain_size_ms = clampFloat(value, 10.0f, 500.0f); }
void setGranularVoiceSpray(GranularVoiceState& voice, float value) { voice.spray = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceGrainOctaveProbability(GranularVoiceState& voice, float value) { voice.grain_octave_probability = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceAttack(GranularVoiceState& voice, float value) { voice.attack_seconds = clampFloat(value, 0.001f, 0.5f); }
void setGranularVoiceDecay(GranularVoiceState& voice, float value) { voice.decay_seconds = clampFloat(value, 0.01f, 4.0f); }
void setGranularVoiceGain(GranularVoiceState& voice, float value) { voice.gain = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoicePan(GranularVoiceState& voice, float value) { voice.pan = clampFloat(value, -1.0f, 1.0f); }
void setGranularVoiceBlur(GranularVoiceState& voice, float value) { voice.blur = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceStereoSpread(GranularVoiceState& voice, float value) { voice.stereo_spread = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoicePositionLfoRate(GranularVoiceState& voice, float value) { voice.position_lfo_rate = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoicePositionLfoDepth(GranularVoiceState& voice, float value) { voice.position_lfo_depth = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoicePanLfoRate(GranularVoiceState& voice, float value) { voice.pan_lfo_rate = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceReverseLfoRate(GranularVoiceState& voice, float value) { voice.reverse_lfo_rate = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceRecordLfoRate(GranularVoiceState& voice, float value) { voice.record_lfo_rate = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceEuclidGated(GranularVoiceState& voice, float value) { voice.euclid_gated = value >= 0.5f; }
void setGranularVoiceEuclidMuted(GranularVoiceState& voice, float value) { voice.euclid_muted = value >= 0.5f; }
void setGranularVoicePositionSpray(GranularVoiceState& voice, float value) { voice.position_spray = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceTimingSpray(GranularVoiceState& voice, float value) { voice.timing_spray = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceLookback(GranularVoiceState& voice, float value) { voice.lookback = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceWriteGuard(GranularVoiceState& voice, float value) { voice.write_guard = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoicePitchMode(GranularVoiceState& voice, float value) { voice.pitch_mode = clampU32(static_cast<uint32_t>(std::lround(value)), 0u, 5u); }
void setGranularVoicePitchSpread(GranularVoiceState& voice, float value) { voice.pitch_spread = clampFloat(value, 0.0f, 24.0f); }
void setGranularVoicePitchJitter(GranularVoiceState& voice, float value) { voice.pitch_jitter_cents = clampFloat(value, 0.0f, 50.0f); }
void setGranularVoicePitchQuantize(GranularVoiceState& voice, float value) { voice.pitch_quantize = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceReverseChance(GranularVoiceState& voice, float value) { voice.reverse_chance = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceBloom(GranularVoiceState& voice, float value) { voice.bloom = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceGlide(GranularVoiceState& voice, float value) { voice.glide = clampFloat(value, 0.0f, 1.0f); }
void setGranularVoiceCloudStyle(GranularVoiceState& voice, float value) { voice.cloud_style = clampU32(static_cast<uint32_t>(std::lround(value)), 0u, 5u); }
void setGranularVoiceAnchorPattern(GranularVoiceState& voice, float value) { voice.anchor_pattern = clampU32(static_cast<uint32_t>(std::lround(value)), 0u, 3u); }
void setGranularVoiceLoopCrossfade(GranularVoiceState& voice, float value) { voice.loop_crossfade_ms = clampFloat(value, 4.0f, 80.0f); }

constexpr GranularVoiceParamSpec kGranularVoiceParamSpecs[] = {
  {0u, setGranularVoiceEnabled},
  {1u, setGranularVoiceMode},
  {2u, setGranularVoiceSlice},
  {3u, setGranularVoiceSpeed},
  {4u, setGranularVoiceScanRate},
  {5u, setGranularVoiceReverse},
  {6u, setGranularVoicePitch},
  {7u, setGranularVoiceWriteFollow},
  {8u, setGranularVoiceDensity},
  {9u, setGranularVoiceGrainSize},
  {10u, setGranularVoiceSpray},
  {11u, setGranularVoiceGrainOctaveProbability},
  {12u, setGranularVoiceAttack},
  {13u, setGranularVoiceDecay},
  {14u, setGranularVoiceGain},
  {15u, setGranularVoicePan},
  {16u, setGranularVoiceBlur},
  {17u, setGranularVoiceStereoSpread},
  {18u, setGranularVoicePositionLfoRate},
  {19u, setGranularVoicePositionLfoDepth},
  {20u, setGranularVoicePanLfoRate},
  {21u, setGranularVoiceReverseLfoRate},
  {22u, setGranularVoiceRecordLfoRate},
  {23u, setGranularVoiceEuclidGated},
  {24u, setGranularVoiceEuclidMuted},
};

const GranularVoiceParamSpec* findGranularVoiceParamSpec(uint32_t offset) {
  for (const GranularVoiceParamSpec& spec : kGranularVoiceParamSpecs) {
    if (spec.offset == offset) {
      return &spec;
    }
  }
  return nullptr;
}

constexpr GranularVoiceParamSpec kGranularExtVoiceParamSpecs[] = {
  {0u, setGranularVoicePositionSpray},
  {1u, setGranularVoiceTimingSpray},
  {2u, setGranularVoiceLookback},
  {3u, setGranularVoiceWriteGuard},
  {4u, setGranularVoicePitchMode},
  {5u, setGranularVoicePitchSpread},
  {6u, setGranularVoicePitchJitter},
  {7u, setGranularVoicePitchQuantize},
  {8u, setGranularVoiceReverseChance},
  {9u, setGranularVoiceBloom},
  {10u, setGranularVoiceGlide},
  {11u, setGranularVoiceCloudStyle},
  {12u, setGranularVoiceAnchorPattern},
  {13u, setGranularVoiceLoopCrossfade},
};

const GranularVoiceParamSpec* findGranularExtVoiceParamSpec(uint32_t offset) {
  for (const GranularVoiceParamSpec& spec : kGranularExtVoiceParamSpecs) {
    if (spec.offset == offset) {
      return &spec;
    }
  }
  return nullptr;
}

double laneTimingSamplesPerStep(const KesshoProductEngine& engine, const LaneState& lane) {
  return sequencerSamplesPerStep(engine.transport, engine.sample_rate, lane.clock_division) /
      static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
}

uint64_t retimedFutureSample(
    uint64_t sample,
    uint64_t transition_sample,
    double timing_ratio) {
  if (sample <= transition_sample) return sample;
  const double retimed = static_cast<double>(transition_sample) +
      static_cast<double>(sample - transition_sample) * timing_ratio;
  if (!std::isfinite(retimed) || retimed >= static_cast<double>(std::numeric_limits<uint64_t>::max())) {
    return std::numeric_limits<uint64_t>::max();
  }
  return static_cast<uint64_t>(std::llround(std::max(0.0, retimed)));
}

void retimeSequencerLanePreservingPhase(
    KesshoProductEngine& engine,
    LaneState& lane,
    double previous_samples_per_step) {
  if (!lane.sequencer_runtime_initialized ||
      !std::isfinite(previous_samples_per_step) ||
      previous_samples_per_step <= 0.0) {
    return;
  }
  const double next_samples_per_step = laneTimingSamplesPerStep(engine, lane);
  if (!std::isfinite(next_samples_per_step) || next_samples_per_step <= 0.0) return;
  const uint64_t transition_sample = engine.transport.sample_frame;
  const double previous_step_position =
      (static_cast<double>(transition_sample) - static_cast<double>(lane.sequencer_start_sample_frame)) /
      previous_samples_per_step;
  if (!std::isfinite(previous_step_position)) return;
  const double next_origin = static_cast<double>(transition_sample) -
      previous_step_position * next_samples_per_step;
  const double clamped_origin = std::clamp(
      next_origin,
      static_cast<double>(std::numeric_limits<int64_t>::min()),
      static_cast<double>(std::numeric_limits<int64_t>::max()));
  lane.sequencer_start_sample_frame = static_cast<int64_t>(std::llround(clamped_origin));
  lane.sequencer_runtime_sample_frame = transition_sample;
  lane.sequencer_join_pending = false;

  const double timing_ratio = next_samples_per_step / previous_samples_per_step;
  for (uint32_t i = 0u; i < lane.pending_ratchet_count; ++i) {
    lane.pending_ratchets[i].absolute_sample = retimedFutureSample(
        lane.pending_ratchets[i].absolute_sample,
        transition_sample,
        timing_ratio);
  }
  if (lane.arp.runtime_initialized) {
    lane.arp.next_event_sample = retimedFutureSample(
        lane.arp.next_event_sample,
        transition_sample,
        timing_ratio);
  }
  if (lane.anchor_walker.runtime_initialized) {
    lane.anchor_walker.runtime_sample_frame = transition_sample;
    lane.anchor_walker.next_walk_sample = retimedFutureSample(
        lane.anchor_walker.next_walk_sample,
        transition_sample,
        timing_ratio);
    lane.anchor_walker.next_gesture_walk_sample = retimedFutureSample(
        lane.anchor_walker.next_gesture_walk_sample,
        transition_sample,
        timing_ratio);
  }
  if (lane.orbit.runtime_initialized) {
    lane.orbit.runtime_sample_frame = transition_sample;
  }
}

} // namespace

  int32_t KesshoProductEngine::validateEvent(const KesshoProductEvent& event) const {
  if (!std::isfinite(event.value) || !std::isfinite(event.value2) || !std::isfinite(event.value3) || !std::isfinite(event.value4)) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  const auto valid_source = [](uint32_t source_id) {
    return source_id >= 1u && source_id <= kSourceCount;
  };
  const auto valid_sequencer = [](uint32_t target_id) {
    return target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH || target_id == KESSHO_PRODUCT_SEQUENCER_DRUM;
  };
  const auto valid_drum_voice = [](uint32_t voice_id) {
    return voice_id < static_cast<uint32_t>(DRUM_NUM_VOICE_TYPES);
  };

  switch (event.event_kind) {
    case KESSHO_PRODUCT_EVENT_KIND_START:
    case KESSHO_PRODUCT_EVENT_KIND_STOP:
    case KESSHO_PRODUCT_EVENT_KIND_RESET_TRANSPORT:
    case KESSHO_PRODUCT_EVENT_KIND_RESET_RNG:
    case KESSHO_PRODUCT_EVENT_KIND_START_JOURNEY_MORPH_CLOCK:
    case KESSHO_PRODUCT_EVENT_KIND_STOP_JOURNEY_MORPH_CLOCK:
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_CLEAR_MANUAL_INTENT_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_GENERATE_SLOTS_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_GENERATE_SEQUENCE_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_GENERATE_BOTH_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_REGENERATE_UNLOCKED_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_COMMIT_BASELINE_MAP_ID:
      return KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT:
      return event.value > 0.0f &&
              (event.value2 == 0.0f || (event.value2 >= 1.0f && event.value2 <= 32.0f)) &&
              (event.value3 == 0.0f || (event.value3 >= 1.0f && event.value3 <= 256.0f)) &&
              event.value4 >= 0.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_GENERATED_SEQUENCER_CAPTURE:
      return valid_sequencer(event.target_id) &&
              event.index < kMaxLaneCount &&
              event.param_id < kMaxLaneCount &&
              event.value >= 0.0f && event.value <= 1.0f &&
              event.value2 >= 1.0f && event.value2 <= 2.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_CONFIG:
      return event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH &&
              event.index < kMaxLaneCount &&
              event.param_id <= 0xffffu &&
              event.value >= 0.0f && event.value <= 1.0f &&
              event.value2 >= 1.0f && event.value2 <= static_cast<float>(kMaxProductArpSteps) &&
              event.value3 >= 0.25f && event.value3 <= 4.0f &&
              event.value4 >= 0.0f && event.value4 <= 65535.0f &&
              (event.flags & ~(
                  KESSHO_PRODUCT_ARP_FLOW_MASK |
                  KESSHO_PRODUCT_ARP_CONTOUR_SEMITONE |
                  KESSHO_PRODUCT_ARP_BOUNDARY_MASK |
                  KESSHO_PRODUCT_ARP_FIXED_MIDI |
                  KESSHO_PRODUCT_ARP_MUSICAL_CONFIG)) == 0u &&
              (event.flags & KESSHO_PRODUCT_ARP_FLOW_MASK) <= 5u &&
              ((event.flags & KESSHO_PRODUCT_ARP_BOUNDARY_MASK) >> KESSHO_PRODUCT_ARP_BOUNDARY_SHIFT) <= 2u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_STEP:
      return event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH &&
              event.index < kMaxLaneCount &&
              event.param_id < kMaxProductArpSteps &&
              event.value >= -1.0f && event.value <= 127.0f &&
              event.value2 >= 0.0f && event.value2 <= 1.0f &&
              event.value3 >= -12.0f && event.value3 <= 12.0f &&
              event.value4 >= -1.0f && event.value4 <= 7.0f &&
              (event.flags & ~KESSHO_PRODUCT_ARP_STEP_RESET) == 0u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_SYNTH_ARP_PATTERN:
      return event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH && event.index < kMaxLaneCount
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_AUTO_STOP:
      return event.value >= 0.0f && event.value <= 604800.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_VOICE_PARAM: {
      const bool unit_param =
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_ENABLED ||
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_TRIGGER_PROBABILITY ||
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_BURST_PROBABILITY ||
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK ||
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK_ENABLED ||
          (event.param_id >= KESSHO_PRODUCT_SCATTER_PARAM_ANCHOR &&
           event.param_id <= KESSHO_PRODUCT_SCATTER_PARAM_SPREAD);
      const bool feel_param =
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_FEEL_X ||
          event.param_id == KESSHO_PRODUCT_SCATTER_PARAM_FEEL_Y;
      return event.index < kProductScatterVoiceCount &&
              ((unit_param && event.value >= 0.0f && event.value <= 1.0f) ||
               (feel_param && event.value >= -1.0f && event.value <= 1.0f))
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    }
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCATTER_CONFIG:
      return event.index == 0u && event.param_id == 0u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_ENABLED:
      return event.value >= 0.0f && event.value <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM:
      return finiteEventValues(event) &&
              event.value >= 0.0f && event.value <= static_cast<float>(kProductSceneMaxEntries) &&
              event.value2 >= 0.0f && event.value2 <= static_cast<float>(kProductSceneMaxCommands) &&
              event.value3 >= 0.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_ENTRY: {
      if (!finiteEventValues(event)) return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      const uint32_t nested_kind = static_cast<uint32_t>(std::lround(event.value4));
      const uint32_t interpolation = event.flags & KESSHO_PRODUCT_SCENE_INTERPOLATION_MASK;
      const uint32_t nested_index = event.flags >> KESSHO_PRODUCT_SCENE_ENTRY_INDEX_SHIFT;
      return event.index < kProductSceneMaxEntries && event.param_id != 0u &&
              (nested_kind == KESSHO_PRODUCT_EVENT_KIND_SET_PARAM ||
               nested_kind == KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE) &&
              interpolation <= static_cast<uint32_t>(ProductSceneInterpolation::EnableGate) &&
              nested_index < kMaxLaneCount && event.value3 >= 0.0f && event.value3 <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    }
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_HEADER: {
      if (!finiteEventValues(event)) return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      const uint32_t nested_kind = static_cast<uint32_t>(std::lround(event.value3));
      const uint32_t direction = static_cast<uint32_t>(std::lround(event.value4));
      const bool forbidden =
          nested_kind >= KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM &&
          nested_kind <= KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED;
      return event.index < kProductSceneMaxCommands && !forbidden && nested_kind > 0u &&
              event.value >= 0.0f && event.value2 >= 0.0f && event.value2 <= 1.0f &&
              direction >= KESSHO_PRODUCT_SCENE_COMMAND_FORWARD &&
              direction <= (KESSHO_PRODUCT_SCENE_COMMAND_FORWARD | KESSHO_PRODUCT_SCENE_COMMAND_REVERSE)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    }
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_VALUES:
      return event.index < kProductSceneMaxCommands && finiteEventValues(event)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCENE_PROGRAM:
      return KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_POSITION:
      return std::isfinite(event.value) && event.value >= 0.0f && event.value <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_CONFIGURE_GLOBAL_AUTO_CYCLE:
      return finiteEventValues(event) && event.value >= 0.0f && event.value <= 1.0f &&
              event.value2 >= 0.0f && event.value2 <= 1024.0f &&
              event.value3 >= 0.0f && event.value3 <= 1024.0f &&
              event.value4 >= 0.0f && event.value4 <= 16777215.0f &&
              (event.flags & ~3u) == 0u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE:
      return finiteEventValues(event) &&
              event.value >= 1.0f && event.value <= static_cast<float>(kProductJourneyMaxEntries) &&
              event.value2 >= 0.0f && event.value2 <= static_cast<float>(kProductJourneyMaxPrograms) &&
              event.value3 >= 0.0f && event.value3 <= static_cast<float>(kProductJourneyMaxEntries)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENTRY_HOLD:
      return finiteEventValues(event) && event.index < kProductJourneyMaxEntries &&
              (event.param_id == kProductJourneyNoProgram || event.param_id < kProductJourneyMaxPrograms) &&
              event.value >= 0.0f && event.value <= 65535.0f &&
              event.value2 >= 0.0f && event.value2 <= 65535.0f &&
              event.value3 >= 0.0f && event.value3 <= 65535.0f &&
              event.value4 >= 0.0f && event.value4 <= 65535.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENTRY_MORPH:
      return finiteEventValues(event) && event.index < kProductJourneyMaxEntries &&
              event.value >= 0.0f && event.value <= 65535.0f &&
              event.value2 >= 0.0f && event.value2 <= 65535.0f &&
              event.value3 >= 0.0f && event.value3 <= 65535.0f &&
              event.value4 >= 0.0f && event.value4 <= 65535.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_TRANSITION_PROGRAM:
      return finiteEventValues(event) && event.index < kProductJourneyMaxPrograms &&
              event.value >= 0.0f && event.value <= static_cast<float>(kProductSceneMaxEntries) &&
              event.value2 >= 0.0f && event.value2 <= static_cast<float>(kProductSceneMaxCommands)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_ENTRY: {
      if (!finiteEventValues(event)) return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      const uint32_t program = event.index >> 16u;
      const uint32_t slot = event.index & 0xffffu;
      const uint32_t nested_kind = static_cast<uint32_t>(std::lround(event.value4));
      const uint32_t interpolation = event.flags & KESSHO_PRODUCT_SCENE_INTERPOLATION_MASK;
      return program < kProductJourneyMaxPrograms && slot < kProductSceneMaxEntries &&
              event.param_id != 0u &&
              (nested_kind == KESSHO_PRODUCT_EVENT_KIND_SET_PARAM || nested_kind == KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE) &&
              interpolation <= static_cast<uint32_t>(ProductSceneInterpolation::EnableGate) &&
              event.value3 >= 0.0f && event.value3 <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    }
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_COMMAND_HEADER: {
      if (!finiteEventValues(event)) return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      const uint32_t program = event.index >> 16u;
      const uint32_t slot = event.index & 0xffffu;
      const uint32_t nested_kind = static_cast<uint32_t>(std::lround(event.value3));
      const uint32_t direction = static_cast<uint32_t>(std::lround(event.value4));
      const bool forbidden = nested_kind >= KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM &&
          nested_kind <= KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED;
      return program < kProductJourneyMaxPrograms && slot < kProductSceneMaxCommands &&
              !forbidden && nested_kind > 0u && event.value >= 0.0f &&
              event.value2 >= 0.0f && event.value2 <= 1.0f &&
              direction >= KESSHO_PRODUCT_SCENE_COMMAND_FORWARD &&
              direction <= (KESSHO_PRODUCT_SCENE_COMMAND_FORWARD | KESSHO_PRODUCT_SCENE_COMMAND_REVERSE)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    }
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_COMMAND_VALUES:
      return (event.index >> 16u) < kProductJourneyMaxPrograms &&
              (event.index & 0xffffu) < kProductSceneMaxCommands &&
              finiteEventValues(event)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_TRANSITION_PROGRAM:
      return event.index < kProductJourneyMaxPrograms ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_SCHEDULE:
      return KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED:
      return event.value >= 0.0f && event.value <= 1.0f ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_ROUTING_MUTE_GROUPS:
      return event.value >= 0.0f && event.value2 >= 1.0f &&
              event.value3 >= 0.0f && event.value3 <= 1.0f &&
              event.value4 >= 0.0f && event.value4 <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_ROUTING_MUTE_GROUP_SLOT:
      return event.index < kProductRoutingMuteGroupSlotCount &&
              event.target_id < (1u << kProductRoutingMuteRowCount) &&
              event.value >= 1.0f && event.value <= 800.0f &&
              event.value2 >= event.value && event.value2 <= 800.0f &&
              event.value3 >= 0.0f && event.value3 <= static_cast<float>(sample_rate * 600.0) &&
              event.value4 >= 0.0f && event.value4 <= 16777215.0f &&
              (event.flags & ~(KESSHO_PRODUCT_ROUTING_MUTE_SLOT_ELIGIBLE |
                               KESSHO_PRODUCT_ROUTING_MUTE_GRANULAR_MASK)) == 0u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_ROUTING_MUTE_GROUPS:
      return KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_RECALL_ROUTING_MUTE_GROUP:
      return (event.index < kProductRoutingMuteGroupSlotCount || event.index == UINT32_MAX) &&
              event.value >= 0.0f && event.value <= static_cast<float>(sample_rate * 600.0)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_ROUTING_MUTE_GROUPS_ENABLED:
      return event.value >= 0.0f && event.value <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_PARAM:
      return event.param_id == 0u ? KESSHO_PRODUCT_ERROR_INVALID_PARAM : KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_ENABLED:
      if (!valid_source(event.target_id)) return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      return (event.flags & ~KESSHO_PRODUCT_SOURCE_ENABLE_IMMEDIATE) == 0u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET:
      return valid_source(event.target_id) && event.value > 0.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE: {
      const uint32_t param_count = sourceOverrideParamCountForSource(event.target_id);
      if (!valid_source(event.target_id) || param_count == 0u) {
        return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      }
      constexpr uint32_t valid_flags =
          KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT |
          KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT |
          KESSHO_PRODUCT_SOURCE_OVERRIDE_MORPH_ANCHORED;
      if ((event.flags & ~valid_flags) != 0u) {
        return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      const bool set_slot = (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT) != 0u;
      const bool commit = (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT) != 0u;
      if (set_slot == commit) {
        return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      if (set_slot && (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_MORPH_ANCHORED) != 0u) {
        return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      if (set_slot) {
        return event.index < param_count && event.param_id < param_count
            ? KESSHO_PRODUCT_OK
            : KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      }
      return event.index <= param_count
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    }
    case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON:
      if (!valid_source(event.target_id)) {
        return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      }
      return event.value >= 0.0f && event.value <= 127.0f &&
              event.value2 > 0.0f && event.value2 <= 1.0f &&
              event.value3 > 0.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_OFF:
      return valid_source(event.target_id) ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    case KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT:
      return event.value >= 0.0f && event.value <= 255.0f &&
              event.value2 >= 0.0f && event.value2 <= 127.0f &&
              event.value3 >= 0.0f && event.value3 <= 127.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE:
      return valid_drum_voice(event.target_id) && event.value > 0.0f && event.value <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    case KESSHO_PRODUCT_EVENT_KIND_SET_HARMONY_ROOT:
      return event.value >= 0.0f && event.value <= 127.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCALE:
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEED:
      return event.target_id != 0u ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_STATE:
      return event.value2 >= 0.0f && event.value2 <= 1.0f && event.value3 > 0.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_MODE_ID:
      return event.value >= 0.0f && event.value <= 2.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_STRENGTH_ID:
      return event.value >= 0.0f && event.value <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_MANUAL_INTENT_ID:
      return event.value >= 0.0f && event.value <= 6.0f &&
              event.value2 >= 0.0f && event.value2 <= 14.0f &&
              event.value3 >= 0.0f && event.value3 <= 11.0f &&
              event.value4 >= 0.0f && event.value4 <= 1.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_SLOT_SET_ID:
      return event.index < 8u && event.value >= 0.0f && event.value <= 6.0f && event.value2 >= 0.0f && event.value2 <= 14.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_SLOT_TRIGGER_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_SLOT_CLEAR_ID:
      return event.index < 8u ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_SEQUENCE_SET_STEP_ID:
      return event.index < 8u && event.value >= 0.0f && event.value <= 6.0f && event.value2 >= 0.0f && event.value2 <= 14.0f
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_SEQUENCE_SET_ENABLED_ID:
      return event.value >= 0.0f && event.value <= 1.0f ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_HARMONY_SEQUENCE_SET_ACTIVE_STEP_ID:
      return event.index < 8u ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE:
      if (event.param_id == 0u || event.index == 0u) {
        return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      }
      if (
          event.target_id != 0u &&
          event.target_id != kProductControlOnlyModulationTarget &&
          !valid_source(event.target_id) &&
          !isDrumRangeTarget(event.target_id) &&
          !isSoundscapeAssetLevelRangeTarget(event.target_id) &&
          !isSoundscapeTextureLevelRangeTarget(event.target_id) &&
          !isSoundscapeTextureParamTarget(event.target_id) &&
          !isSoundscapeModuleParamTarget(event.target_id)) {
        return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      }
      return KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP:
      if (!valid_sequencer(event.target_id) || event.index >= kMaxLaneCount) {
        return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      }
      if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_LANE) != 0u) {
        return KESSHO_PRODUCT_OK;
      }
      if ((event.flags & KESSHO_PRODUCT_STEP_FIELD_MASK) == KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG) {
        return validStepFieldId(event.param_id) && event.value2 >= 1.0f && event.value2 <= 64.0f
            ? KESSHO_PRODUCT_OK
            : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      return event.param_id < 64u ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE:
      if (!valid_sequencer(event.target_id) || event.index >= kMaxLaneCount) {
        return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      }
      return isSequencerLaneParam(event.param_id)
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    case KESSHO_PRODUCT_EVENT_KIND_ANCHOR_WALKER_PERFORMANCE:
      if (!valid_sequencer(event.target_id) || event.index >= kMaxLaneCount) {
        return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      }
      switch (event.param_id) {
        case KESSHO_PRODUCT_ANCHOR_WALKER_ACTION_GESTURE_TAP:
        case KESSHO_PRODUCT_ANCHOR_WALKER_ACTION_GESTURE_DOWN:
          return event.value >= -7.0f && event.value <= 7.0f &&
                  event.value != 0.0f &&
                  event.value2 > 0.0f && event.value2 <= 1.0f
              ? KESSHO_PRODUCT_OK
              : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
        case KESSHO_PRODUCT_ANCHOR_WALKER_ACTION_GESTURE_UP:
        case KESSHO_PRODUCT_ANCHOR_WALKER_ACTION_RESET_CURSOR:
          return KESSHO_PRODUCT_OK;
        case KESSHO_PRODUCT_ANCHOR_WALKER_ACTION_SET_MANUAL_ANCHOR:
          return event.value3 >= 0.0f && event.value3 <= 127.0f
              ? KESSHO_PRODUCT_OK
              : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
        default:
          return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
    case KESSHO_PRODUCT_EVENT_KIND_RESET_SEQUENCER_LANE_HOME:
    case KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE:
      return valid_sequencer(event.target_id) && event.index < kMaxLaneCount
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    case KESSHO_PRODUCT_EVENT_KIND_HARMONY_LIVE_CHORD_GESTURE:
      if (event.target_id > kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_SEQ4 || event.param_id > 0x7fffffffu) {
        return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_NOTE) != 0u) {
        return event.index < 8u && event.value >= 0.0f && event.value <= 127.0f &&
                (event.flags & ~(KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_NOTE)) == 0u
            ? KESSHO_PRODUCT_OK
            : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_INTENT) != 0u) {
        const uint32_t valid_flags = KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_INTENT;
        if ((event.flags & ~valid_flags) != 0u || event.index > 2u) return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
        if (event.index == 0u) {
          return event.value >= 0.0f && event.value <= 1.0f && event.value2 >= 0.0f && event.value2 <= 14.0f &&
                  event.value3 >= 0.0f && event.value3 <= 2.0f && event.value4 >= 0.0f && event.value4 <= 6.0f
              ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
        }
        if (event.index == 1u) {
          return event.value >= 0.0f && event.value <= 11.0f && event.value2 >= -4.0f && event.value2 <= 4.0f &&
                  event.value3 >= 0.0f && event.value3 <= 1.0f && event.value4 >= 0.0f && event.value4 <= 8.0f
              ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
        }
        return event.value >= 0.0f && event.value <= 3.0f && event.value2 >= -1.0f && event.value2 <= 127.0f &&
                event.value3 >= 0.0f && event.value3 <= 0xffffu && event.value4 >= 0.0f && event.value4 <= 0xffffu
            ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_CONTEXT) != 0u) {
        return (event.flags & ~KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_CONTEXT) == 0u && event.index == 0u &&
                event.value >= 0.0f && event.value <= 127.0f && event.value2 >= 1.0f && event.value2 <= 0xffffu
            ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      }
      return (event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_HEADER) != 0u &&
              event.index <= kessho::product::generated::KESSHO_PRODUCT_HARMONY_GESTURE_SCOPE_SEQLIVE &&
              event.target_id <= kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_SEQ4 &&
              event.param_id <= 0x7fffffffu && event.value >= 0.0f && event.value <= 2.0f &&
              event.value2 >= 0.0f && event.value2 <= 2.0f && event.value3 >= 0.0f && event.value3 <= 8.0f &&
              event.value4 >= 0.0f && event.value4 <= 1.0f &&
              (event.flags & ~(KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_HEADER | KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_CLEAR | KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_TAKEOVER)) == 0u
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    default:
      return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
}

int32_t KesshoProductEngine::enqueueEvent(const KesshoProductEvent& event) {
  if (control_event_count >= kessho::product::generated::KESSHO_PRODUCT_MAX_CONTROL_EVENTS) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
    return KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
  }
  const int32_t validation_result = validateEvent(event);
  if (validation_result != KESSHO_PRODUCT_OK) {
    telemetry.last_error_code = validation_result;
    return validation_result;
  }
  QueuedProductEvent queued{};
  queued.event = event;
  queued.sequence = next_control_sequence++;
  uint32_t insert_index = control_event_count;
  while (
      insert_index > 0u &&
      (queued.event.sample_offset < control_events[insert_index - 1u].event.sample_offset ||
       (queued.event.sample_offset == control_events[insert_index - 1u].event.sample_offset &&
        queued.sequence < control_events[insert_index - 1u].sequence))) {
    control_events[insert_index] = control_events[insert_index - 1u];
    --insert_index;
  }
  control_events[insert_index] = queued;
  ++control_event_count;
  telemetry.control_queue_depth = control_event_count;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::sortControlEvents() {
  for (uint32_t i = 1; i < control_event_count; ++i) {
    QueuedProductEvent key = control_events[i];
    uint32_t j = i;
    while (
        j > 0 &&
        (key.event.sample_offset < control_events[j - 1].event.sample_offset ||
         (key.event.sample_offset == control_events[j - 1].event.sample_offset &&
          key.sequence < control_events[j - 1].sequence))) {
      control_events[j] = control_events[j - 1];
      --j;
    }
    control_events[j] = key;
  }
}

  float KesshoProductEngine::manualNoteHoldSeconds(uint32_t source_id, float requested_seconds) const {
  if (
      (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 ||
       source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ||
       isSampleProductSource(source_id)) &&
      source_id >= 1u &&
      source_id <= kSourceCount) {
    return clampFloat(sources[source_id - 1u].hold_seconds, 0.001f, 20.0f);
  }
  return clampFloat(requested_seconds, 0.001f, 20.0f);
}

bool KesshoProductEngine::isSequencerLaneTimingEvent(const KesshoProductEvent& event) const {
  if (event.event_kind != KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE) return false;
  return event.param_id == KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID ||
      event.param_id == KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TEMPO_MULTIPLIER_ID ||
      event.param_id == KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID;
}

void KesshoProductEngine::stageNextPhraseTimingEvent(const KesshoProductEvent& event) {
  for (uint32_t i = 0u; i < pending_phrase_timing_event_count; ++i) {
    KesshoProductEvent& pending = pending_phrase_timing_events[i];
    if (pending.event_kind == event.event_kind &&
        pending.target_id == event.target_id &&
        pending.index == event.index &&
        pending.param_id == event.param_id) {
      pending = event;
      return;
    }
  }
  if (pending_phrase_timing_event_count >= kMaxPendingPhraseTimingEvents) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
    return;
  }
  if (pending_phrase_timing_event_count == 0u) {
    pending_phrase_timing_apply_frame = transport.nextPhraseBoundaryFrame(sample_rate);
  }
  pending_phrase_timing_events[pending_phrase_timing_event_count++] = event;
}

  void KesshoProductEngine::applyPendingTransportTransition() {
  const bool transport_due = transport.transition_pending &&
      transport.sample_frame >= transport.pending_apply_frame;
  const bool timing_due = pending_phrase_timing_event_count > 0u &&
      transport.sample_frame >= pending_phrase_timing_apply_frame;
  if (!transport_due && !timing_due) return;

  double previous_synth_samples_per_step[kMaxLaneCount]{};
  double previous_drum_samples_per_step[kMaxLaneCount]{};
  for (uint32_t i = 0u; i < synth_lane_count; ++i) {
    previous_synth_samples_per_step[i] = laneTimingSamplesPerStep(*this, synth_lanes[i]);
  }
  for (uint32_t i = 0u; i < drum_lane_count; ++i) {
    previous_drum_samples_per_step[i] = laneTimingSamplesPerStep(*this, drum_lanes[i]);
  }
  const float previous_bpm = transport.bpm;
  const bool transport_applied = transport.applyPendingTransition(sample_rate);

  uint32_t synth_timing_lane_mask = 0u;
  uint32_t drum_timing_lane_mask = 0u;
  if (timing_due) {
    const uint32_t event_count = pending_phrase_timing_event_count;
    pending_phrase_timing_event_count = 0u;
    pending_phrase_timing_apply_frame = 0u;
    for (uint32_t i = 0u; i < event_count; ++i) {
      KesshoProductEvent timing_event = pending_phrase_timing_events[i];
      timing_event.flags &= ~KESSHO_PRODUCT_TIMING_APPLY_NEXT_PHRASE;
      if (timing_event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH && timing_event.index < 32u) {
        synth_timing_lane_mask |= 1u << timing_event.index;
      } else if (timing_event.target_id == KESSHO_PRODUCT_SEQUENCER_DRUM && timing_event.index < 32u) {
        drum_timing_lane_mask |= 1u << timing_event.index;
      }
      applySequencerLaneParamEvent(timing_event);
    }
  }

  if (transport_applied) {
    retimeTempoSyncedFx(previous_bpm);
  }
  for (uint32_t i = 0; i < synth_lane_count; ++i) {
    if (!transport_applied && (synth_timing_lane_mask & (1u << i)) == 0u) continue;
    retimeSequencerLanePreservingPhase(*this, synth_lanes[i], previous_synth_samples_per_step[i]);
  }
  for (uint32_t i = 0; i < drum_lane_count; ++i) {
    if (!transport_applied && (drum_timing_lane_mask & (1u << i)) == 0u) continue;
    retimeSequencerLanePreservingPhase(*this, drum_lanes[i], previous_drum_samples_per_step[i]);
  }
}

  void KesshoProductEngine::applyControlEvent(const KesshoProductEvent& event) {
  if (transport.running &&
      (event.flags & KESSHO_PRODUCT_TIMING_APPLY_NEXT_PHRASE) != 0u &&
      isSequencerLaneTimingEvent(event)) {
    stageNextPhraseTimingEvent(event);
    return;
  }
  switch (event.event_kind) {
    case KESSHO_PRODUCT_EVENT_KIND_START:
      if (!transport.running) {
        for (uint32_t i = 0; i < synth_lane_count; ++i) {
          resetSequencerLaneRuntime(synth_lanes[i]);
        }
        for (uint32_t i = 0; i < drum_lane_count; ++i) {
          resetSequencerLaneRuntime(drum_lanes[i]);
        }
        transport.running = true;
        resetHarmonyClock();
        resetArrangementRuntime();
      } else {
        transport.running = true;
      }
      configureSoundscapesModuleFromSource();
      break;
    case KESSHO_PRODUCT_EVENT_KIND_STOP:
      transport.running = false;
      stopSoundscapeTransportRuntime();
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        resetSequencerLaneRuntime(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        resetSequencerLaneRuntime(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_RESET_TRANSPORT:
      transport.reset();
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        resetSequencerLaneRuntime(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        resetSequencerLaneRuntime(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT:
      if ((event.flags & KESSHO_PRODUCT_TRANSPORT_APPLY_NEXT_PHRASE) != 0u && transport.running) {
        transport.stageNextPhraseTransition(
            event.value,
            event.value2 > 0.0f
                ? static_cast<uint32_t>(std::lround(event.value2))
                : transport.beats_per_bar,
            event.value3 > 0.0f
                ? static_cast<uint32_t>(std::lround(event.value3))
                : transport.bars_per_phrase,
            event.value4,
            sample_rate);
        break;
      }
      {
        double previous_synth_samples_per_step[kMaxLaneCount]{};
        double previous_drum_samples_per_step[kMaxLaneCount]{};
        for (uint32_t i = 0u; i < synth_lane_count; ++i) {
          previous_synth_samples_per_step[i] = laneTimingSamplesPerStep(*this, synth_lanes[i]);
        }
        for (uint32_t i = 0u; i < drum_lane_count; ++i) {
          previous_drum_samples_per_step[i] = laneTimingSamplesPerStep(*this, drum_lanes[i]);
        }
        const float previous_bpm = transport.bpm;
        const bool transport_applied = transport.applyImmediateTransition(
            event.value,
            event.value2 > 0.0f
                ? static_cast<uint32_t>(std::lround(event.value2))
                : transport.beats_per_bar,
            event.value3 > 0.0f
                ? static_cast<uint32_t>(std::lround(event.value3))
                : transport.bars_per_phrase,
            event.value4,
            sample_rate);
        if (!transport_applied) break;
        retimeTempoSyncedFx(previous_bpm);
        for (uint32_t i = 0u; i < synth_lane_count; ++i) {
          retimeSequencerLanePreservingPhase(*this, synth_lanes[i], previous_synth_samples_per_step[i]);
        }
        for (uint32_t i = 0u; i < drum_lane_count; ++i) {
          retimeSequencerLanePreservingPhase(*this, drum_lanes[i], previous_drum_samples_per_step[i]);
        }
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP:
      applySequencerStepEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_CONFIG:
      applySynthArpConfigEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_STEP:
      applySynthArpStepEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_SYNTH_ARP_PATTERN:
      applyCommitSynthArpPatternEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_AUTO_STOP:
      configureProductAutoStop(event.value > 0.0f, event.value);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_VOICE_PARAM:
      applyScatterVoiceParamEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCATTER_CONFIG:
      commitScatterConfig();
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_ENABLED:
      setScatterEnabled(event.value >= 0.5f);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM:
      beginSceneProgram(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_ENTRY:
      setSceneProgramEntry(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_HEADER:
      setSceneProgramCommandHeader(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_VALUES:
      setSceneProgramCommandValues(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCENE_PROGRAM:
      commitSceneProgram();
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_POSITION:
      setSceneProgramPosition(event.value);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_ROUTING_MUTE_GROUPS:
      beginRoutingMuteGroups(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_ROUTING_MUTE_GROUP_SLOT:
      setRoutingMuteGroupSlot(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_ROUTING_MUTE_GROUPS:
      commitRoutingMuteGroups(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_RECALL_ROUTING_MUTE_GROUP:
      recallRoutingMuteGroup(event.index, static_cast<uint32_t>(std::lround(event.value)));
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_ROUTING_MUTE_GROUPS_ENABLED:
      setRoutingMuteGroupsEnabled(event.value >= 0.5f);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_CONFIGURE_GLOBAL_AUTO_CYCLE:
      configureGlobalAutoCycle(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE:
      beginJourneySchedule(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENTRY_HOLD:
      setJourneyScheduleEntryHold(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENTRY_MORPH:
      setJourneyScheduleEntryMorph(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_TRANSITION_PROGRAM:
      beginJourneyTransitionProgram(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_ENTRY:
      setJourneyTransitionEntry(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_COMMAND_HEADER:
      setJourneyTransitionCommandHeader(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_COMMAND_VALUES:
      setJourneyTransitionCommandValues(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_TRANSITION_PROGRAM:
      commitJourneyTransitionProgram(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_SCHEDULE:
      commitJourneySchedule();
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED:
      setJourneyScheduleEnabled(event.value >= 0.5f);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE:
      if (transport.running && isSequencerLaneTimingEvent(event)) {
        uint32_t lane_count = 0u;
        LaneState* lanes = sequencerLanesForEvent(event, lane_count);
        if (lanes == nullptr || event.index >= lane_count) {
          applySequencerLaneParamEvent(event);
          break;
        }
        LaneState& lane = lanes[event.index];
        const double previous_samples_per_step = laneTimingSamplesPerStep(*this, lane);
        applySequencerLaneParamEvent(event);
        retimeSequencerLanePreservingPhase(*this, lane, previous_samples_per_step);
      } else {
        applySequencerLaneParamEvent(event);
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_ANCHOR_WALKER_PERFORMANCE:
      applyAnchorWalkerPerformanceEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_GENERATED_SEQUENCER_CAPTURE: {
      const uint32_t source_mode = static_cast<uint32_t>(std::lround(event.value2));
      generated_sequencer_capture_config.enabled = event.value >= 0.5f ? 1u : 0u;
      generated_sequencer_capture_config.source_lane_index = static_cast<int32_t>(event.index);
      generated_sequencer_capture_config.target_lane_index = static_cast<int32_t>(event.param_id);
      generated_sequencer_capture_config.source_mode_mask =
          kessho::product::generatedSequencerCaptureModeBit(source_mode);
      if (generated_sequencer_capture_config.enabled != 0u) {
        generated_sequencer_capture_ring.reset();
      }
      break;
    }
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_STATE:
      applyJourneyStateEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_PARAM:
      applyParam(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_ENABLED:
      if (event.target_id >= 1u && event.target_id <= kSourceCount) {
        setSourceEnabled(
            sources[event.target_id - 1u],
            event.value >= 0.5f,
            (event.flags & KESSHO_PRODUCT_SOURCE_ENABLE_IMMEDIATE) != 0u);
      } else {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET:
      applySourcePresetEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE:
      applySourceOverrideEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON: {
      const uint32_t source_id = event.target_id;
      const bool transient_audition =
          (event.flags & kProductManualNoteTransientAuditionFlag) != 0u;
      const float hold_seconds = manualNoteHoldSeconds(source_id, event.value3);
      if (transient_audition) {
        extendSourceTransientAudition(source_id, hold_seconds);
      }
      triggerVoice(
          source_id,
          event.value,
          event.value2,
          hold_seconds,
          -1.0f,
          -1.0f,
          event.value4 > 0.0f ? event.value4 : -1.0f,
          0u,
          0u,
          false,
          0.0f,
          1.0e10f,
          1.0e10f,
          padVoiceIndexFromSequencerEventFlags(event.flags),
          1.0f,
          false,
          transient_audition);
      break;
    }
    case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_OFF:
      if (event.value >= 1.0f) {
        killSourceVoices(event.target_id);
      } else {
        releaseSourceVoices(event.target_id);
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT:
      applyMidiEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE:
      triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, midiNoteForDrumVoice(event.target_id), event.value, 0.12f);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_START_JOURNEY_MORPH_CLOCK:
      journey_running = true;
      break;
    case KESSHO_PRODUCT_EVENT_KIND_STOP_JOURNEY_MORPH_CLOCK:
      journey_running = false;
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_HARMONY_ROOT:
      harmony.root_midi = clampFloat(event.value, 0.0f, 127.0f);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SCALE:
      harmony.scale_id = event.target_id;
      rebuildHarmonyAuthorityCache();
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEED:
      rng_seed = event.target_id;
      rng_state = rng_seed;
      break;
    case KESSHO_PRODUCT_EVENT_KIND_RESET_RNG:
      rng_state = rng_seed;
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_MODE_ID:
      harmony.control_mode = static_cast<uint32_t>(std::lround(event.value));
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_STRENGTH_ID:
      harmony.control_strength = event.value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_MANUAL_INTENT_ID:
      harmony.manual_control_available = manualHarmonyAllowed(journey_phase);
      if (harmony.manual_control_available) {
        writeHarmonyPoolFromIntent(
            harmony,
            3u,
            static_cast<uint32_t>(std::lround(event.value)),
            static_cast<uint32_t>(std::lround(event.value2)),
            event.value4 >= 0.5f ? 1u : 0u,
            static_cast<uint32_t>(std::lround(event.value3)),
            -1,
            -1);
      }
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_CLEAR_MANUAL_INTENT_ID:
      harmony.note_pool_count = 0u;
      harmony.active_source = 0u;
      harmony.control_mode = 0u;
      harmony.active_slot_id = -1;
      harmony.active_step_index = -1;
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_SLOT_SET_ID:
      if (manualHarmonyAllowed(journey_phase)) {
        writeHarmonyPoolFromIntent(
            harmony,
            2u,
            static_cast<uint32_t>(std::lround(event.value)),
            static_cast<uint32_t>(std::lround(event.value2)),
            event.value4 >= 0.5f ? 1u : 0u,
            static_cast<uint32_t>(std::lround(event.value3)),
            static_cast<int32_t>(event.index),
            -1);
        syncHarmonySlotAuthorityRow(*this, event.index);
      }
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_SLOT_TRIGGER_ID:
      harmony.manual_control_available = manualHarmonyAllowed(journey_phase);
      if (harmony.manual_control_available) {
        harmony.active_source = 2u;
        harmony.control_mode = 3u;
        harmony.active_slot_id = static_cast<int32_t>(event.index);
      }
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_SLOT_CLEAR_ID:
      {
        const bool was_active_slot = harmony.active_slot_id == static_cast<int32_t>(event.index);
        if (was_active_slot) {
          harmony.note_pool_count = 0u;
          harmony.active_source = 0u;
          harmony.control_mode = 0u;
          harmony.active_slot_id = -1;
        }
        if (event.index < 8u) {
          clearHarmonySlotAuthorityRow(*this, event.index);
        }
      }
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_SEQUENCE_SET_STEP_ID:
      writeHarmonyPoolFromIntent(
          harmony,
          1u,
          static_cast<uint32_t>(std::lround(event.value)),
          static_cast<uint32_t>(std::lround(event.value2)),
          event.value4 >= 0.5f ? 1u : 0u,
          static_cast<uint32_t>(std::lround(event.value3)),
          -1,
          static_cast<int32_t>(event.index));
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_SEQUENCE_SET_ENABLED_ID:
      if (event.value < 0.5f && harmony.active_source == 1u) {
        harmony.note_pool_count = 0u;
        harmony.active_source = 0u;
        harmony.control_mode = 0u;
        harmony.active_step_index = -1;
      }
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_SEQUENCE_SET_ACTIVE_STEP_ID:
      harmony.active_step_index = static_cast<int32_t>(event.index);
      if (harmony.active_source == 0u) {
        harmony.active_source = 1u;
        harmony.control_mode = 1u;
      }
      break;
    case KESSHO_PRODUCT_EVENT_HARMONY_GENERATE_SLOTS_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_GENERATE_SEQUENCE_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_GENERATE_BOTH_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_REGENERATE_UNLOCKED_ID:
    case KESSHO_PRODUCT_EVENT_HARMONY_COMMIT_BASELINE_MAP_ID:
      rng_state = hashU32(rng_state ^ event.event_kind ^ event.index);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE:
      applyModulationRangeEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_RESET_SEQUENCER_LANE_HOME:
      applyResetSequencerLaneHomeEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE:
      applyDiceSequencerLaneEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_HARMONY_LIVE_CHORD_GESTURE: {
      const bool morph_locked = harmony.morph_plan_phase > 0.0f && harmony.morph_plan_phase < 1.0f;
      const bool is_header = (event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_HEADER) != 0u;
      const bool clear_event = is_header && ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_CLEAR) != 0u || event.value >= 2.0f);
      // Midpoint morph owns the harmony resolver. A stale UI gesture cannot
      // reintroduce a manual layer until the runtime reaches an endpoint.
      if (morph_locked && !clear_event) break;
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_NOTE) != 0u) {
        if (event.index < 8u && (harmony.live_gesture_note_count > event.index || harmony.takeover_progress > 0.0f)) {
          harmony.live_gesture_notes[event.index] = clampFloat(event.value, 0.0f, 127.0f);
          if ((harmony.live_gesture_scope == kessho::product::generated::KESSHO_PRODUCT_HARMONY_GESTURE_SCOPE_OVERVIEW ||
               harmony.live_gesture_scope == kessho::product::generated::KESSHO_PRODUCT_HARMONY_GESTURE_SCOPE_DETAIL) &&
              harmony.live_gesture_target <= kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_OVERVIEW) {
            harmony.takeover_anchor_source[event.index] = clampFloat(event.value, 0.0f, 127.0f);
            harmony.takeover_anchor_target[event.index] = clampFloat(event.value2, 0.0f, 127.0f);
            harmony.takeover_anchor_weight[event.index] = std::max(0.0f, event.value3);
            harmony.takeover_anchor_count = std::max(harmony.takeover_anchor_count, event.index + 1u);
          }
        }
        break;
      }
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_INTENT) != 0u) {
        if (event.index == 0u) {
          harmony.live_gesture_intent_present = event.value >= 0.5f ? 1u : 0u;
          harmony.live_gesture_intent_quality = static_cast<uint32_t>(std::lround(event.value2));
          harmony.live_gesture_intent_root_mode = static_cast<uint32_t>(std::lround(event.value3));
          harmony.live_gesture_intent_degree = static_cast<int32_t>(std::lround(event.value4));
        } else if (event.index == 1u) {
          harmony.live_gesture_intent_root_note = clampFloat(event.value, 0.0f, 11.0f);
          harmony.live_gesture_intent_inversion = std::max(-4, std::min(4, static_cast<int32_t>(std::lround(event.value2))));
          harmony.live_gesture_intent_spread = clampFloat(event.value3, 0.0f, 1.0f);
          harmony.live_gesture_intent_octave = std::max(0, std::min(8, static_cast<int32_t>(std::lround(event.value4))));
        } else {
          harmony.live_gesture_intent_bass_mode = std::min<uint32_t>(static_cast<uint32_t>(std::lround(event.value)), 3u);
          harmony.live_gesture_intent_bass_note = clampFloat(event.value2, -1.0f, 127.0f);
          harmony.live_gesture_intent_extension_mask = static_cast<uint32_t>(std::lround(event.value3));
          harmony.live_gesture_intent_alteration_mask = static_cast<uint32_t>(std::lround(event.value4));
        }
        break;
      }
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_CONTEXT) != 0u) {
        harmony.live_gesture_captured_root_midi = clampFloat(event.value, 0.0f, 127.0f);
        harmony.live_gesture_captured_scale_id = std::max<uint32_t>(1u, static_cast<uint32_t>(std::lround(event.value2)));
        if (harmony.takeover_progress > 0.0f) {
          harmony.takeover_target_root_midi = harmony.live_gesture_captured_root_midi;
          harmony.takeover_target_scale_id = harmony.live_gesture_captured_scale_id;
        }
        break;
      }
      harmony.live_gesture_revision = event.param_id;
      harmony.live_gesture_scope = std::min<uint32_t>(event.index, kessho::product::generated::KESSHO_PRODUCT_HARMONY_GESTURE_SCOPE_SEQLIVE);
      harmony.live_gesture_target = std::min<uint32_t>(event.target_id, kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_SEQ4);
      harmony.live_gesture_phase = std::min<uint32_t>(static_cast<uint32_t>(std::lround(event.value)), 2u);
      harmony.live_gesture_playback_behavior = std::min<uint32_t>(static_cast<uint32_t>(std::lround(event.value2)), 2u);
      harmony.live_gesture_note_count = std::min<uint32_t>(static_cast<uint32_t>(std::lround(event.value3)), 8u);
      harmony.live_gesture_intent_present = 0u;
      harmony.live_gesture_intent_quality = 0u;
      harmony.live_gesture_intent_root_mode = 0u;
      harmony.live_gesture_intent_degree = 0;
      harmony.live_gesture_intent_root_note = 0.0f;
      harmony.live_gesture_intent_inversion = 0;
      harmony.live_gesture_intent_spread = 0.5f;
      harmony.live_gesture_intent_octave = 4;
      harmony.live_gesture_intent_bass_mode = 0u;
      harmony.live_gesture_intent_bass_note = -1.0f;
      harmony.live_gesture_intent_extension_mask = 0u;
      harmony.live_gesture_intent_alteration_mask = 0u;
      harmony.live_gesture_captured_root_midi = harmony.root_midi;
      harmony.live_gesture_captured_scale_id = harmony.scale_id;
      if ((event.flags & KESSHO_PRODUCT_HARMONY_LIVE_GESTURE_TAKEOVER) != 0u) {
        harmony.live_gesture_note_count = 0u;
        harmony.takeover_progress = clampFloat(event.value4, 0.0f, 1.0f);
        harmony.takeover_anchor_count = 0u;
      } else {
        harmony.takeover_progress = 0.0f;
        harmony.takeover_anchor_count = 0u;
      }
      if (clear_event) {
        harmony.live_gesture_note_count = 0u;
        harmony.live_gesture_expires_at_frame = transport.sample_frame;
        harmony.takeover_progress = 0.0f;
        harmony.takeover_anchor_count = 0u;
      } else {
        harmony.live_gesture_expires_at_frame = UINT64_MAX;
      }
      harmony.harmony_play_dispatch_count += 1u;
      harmony.harmony_play_last_dispatch_frame = transport.sample_frame + event.sample_offset;
      harmony.harmony_play_last_dispatch_latency_ms = static_cast<float>(
          static_cast<double>(event.sample_offset) * 1000.0 / std::max(1.0, sample_rate));
      break;
    }
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      break;
  }
}

  uint32_t KesshoProductEngine::resolveMidiTargetSource(const KesshoProductEvent& event, uint32_t status) const {
  if (event.target_id >= 1u && event.target_id <= kSourceCount) {
    return event.target_id;
  }
  const uint32_t channel = event.index <= 15u ? event.index : (status & 0x0fu);
  if (channel == 9u) {
    return KESSHO_PRODUCT_SOURCE_DRUM;
  }
  switch (channel) {
    case 1u:
      return KESSHO_PRODUCT_SOURCE_LEAD2;
    case 2u:
      return KESSHO_PRODUCT_SOURCE_PAD1;
    case 3u:
      return KESSHO_PRODUCT_SOURCE_PAD2;
    case 4u:
      return KESSHO_PRODUCT_SOURCE_PIANO;
    case 5u:
      return KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
    case 6u:
      return KESSHO_PRODUCT_SOURCE_SAMPLE2;
    default:
      return KESSHO_PRODUCT_SOURCE_LEAD1;
  }
}

  void KesshoProductEngine::applyMidiEvent(const KesshoProductEvent& event) {
  const uint32_t status = static_cast<uint32_t>(std::lround(clampFloat(event.value, 0.0f, 255.0f)));
  const uint32_t command = status & 0xf0u;
  const float data1 = clampFloat(event.value2, 0.0f, 127.0f);
  const float data2 = clampFloat(event.value3, 0.0f, 127.0f);
  const uint32_t channel = event.index <= 15u ? event.index : (status & 0x0fu);
  const uint32_t midi_note = clampU32(static_cast<uint32_t>(std::lround(data1)), 0u, 127u);
  const uint32_t source_id = resolveMidiTargetSource(event, status);
  const bool transient_audition =
      (event.flags & kProductMidiEventTransientAuditionFlag) != 0u;
  if (command == 0x90u && data2 > 0.0f) {
    const float controller_velocity_scale = midiControllerVelocityScale(source_id, channel, midi_note);
    const float trigger_midi_note = clampFloat(data1 + midiPitchBendSemitones(source_id, channel), 0.0f, 127.0f);
    uint32_t pad_voice_index = kPadVoiceNoPreference;
    uint32_t pad_route_voice_index = kProductInvalidVoiceIndex;
    if ((source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) &&
        source_id >= 1u && source_id <= kSourceCount &&
        (sources[source_id - 1u].enabled || transient_audition) &&
        pad_module) {
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      pad_voice_index = pad_voice_cursors[pad_index]++ % static_cast<uint32_t>(PAD_VOICES_PER_PAD);
      pad_route_voice_index = pad_index * static_cast<uint32_t>(PAD_VOICES_PER_PAD) + pad_voice_index;
    }
    const float hold_seconds = pad_route_voice_index != kProductInvalidVoiceIndex ? 0.0f : 0.5f;
    if (transient_audition) {
      retainSourceTransientAudition(source_id);
    }
    const uint32_t trigger_voice_index = triggerVoice(
        source_id,
        trigger_midi_note,
        clampFloat((data2 / 127.0f) * controller_velocity_scale, 0.0f, 1.0f),
        hold_seconds,
        -1.0f,
        -1.0f,
        -1.0f,
        0u,
        0u,
        true,
        0.0f,
        1.0e10f,
        1.0e10f,
        pad_voice_index,
        1.0f,
        false,
        transient_audition);
    uint32_t lead_voice_index = kProductInvalidVoiceIndex;
    uint32_t sample_voice_index = kProductInvalidVoiceIndex;
    if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
      lead_voice_index = trigger_voice_index;
    } else if (isSampleProductSource(source_id) || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
      sample_voice_index = trigger_voice_index;
    }
    if (transient_audition && trigger_voice_index == kProductInvalidVoiceIndex) {
      releaseSourceTransientAudition(source_id);
    }
    if (source_id >= 1u && source_id <= kSourceCount &&
        (sources[source_id - 1u].enabled || transient_audition) &&
        trigger_voice_index != kProductInvalidVoiceIndex) {
      trackMidiNoteOn(
          source_id,
          channel,
          midi_note,
          pad_route_voice_index,
          lead_voice_index,
          sample_voice_index,
          event.param_id,
          transient_audition);
    }
    return;
  }
  if (command == 0x80u || (command == 0x90u && data2 <= 0.0f)) {
    applyMidiNoteOff(source_id, channel, midi_note, event.param_id);
    return;
  }
  if (command == 0xb0u) {
    const uint32_t controller = midi_note;
    applyMidiControlChange(source_id, channel, controller, clampU32(static_cast<uint32_t>(std::lround(data2)), 0u, 127u));
    if (controller == 64u || controller == 120u || controller == 123u) {
      return;
    }
  }
  if (command == 0xb0u && event.param_id != 0u) {
    KesshoProductEvent param_event = event;
    param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    param_event.value = clampFloat(event.value4, 0.0f, 1.0f);
    applyParam(param_event);
    return;
  }
  if (command == 0xe0u) {
    applyMidiPitchBend(
        source_id,
        channel,
        clampU32(static_cast<uint32_t>(std::lround(data1)), 0u, 127u),
        clampU32(static_cast<uint32_t>(std::lround(data2)), 0u, 127u));
    return;
  }
  if (command == 0xd0u) {
    applyMidiChannelPressure(source_id, channel, clampU32(static_cast<uint32_t>(std::lround(data1)), 0u, 127u));
    return;
  }
  if (command == 0xa0u) {
    applyMidiPolyPressure(source_id, channel, midi_note, clampU32(static_cast<uint32_t>(std::lround(data2)), 0u, 127u));
    return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  bool KesshoProductEngine::applyGranularVoiceParamEvent(const KesshoProductEvent& event) {
  const uint32_t voice_param_bases[kGranularVoiceCount] = {
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID,
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V2_ENABLED_ID,
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V3_ENABLED_ID,
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V4_ENABLED_ID,
  };
  const uint32_t ext_voice_param_bases[kGranularVoiceCount] = {
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_POSITION_SPRAY_ID,
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V2_POSITION_SPRAY_ID,
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V3_POSITION_SPRAY_ID,
    KESSHO_PRODUCT_PARAM_FX_GRANULAR_V4_POSITION_SPRAY_ID,
  };
  for (uint32_t voice_index = 0; voice_index < kGranularVoiceCount; ++voice_index) {
    const uint32_t base = voice_param_bases[voice_index];
    if (event.param_id < base || event.param_id >= base + kGranularVoiceParamCount) {
      const uint32_t ext_base = ext_voice_param_bases[voice_index];
      if (event.param_id < ext_base || event.param_id >= ext_base + kGranularExtVoiceParamCount) {
        continue;
      }
      GranularVoiceState& voice = fx.granular_voices[voice_index];
      const GranularVoiceParamSpec* spec = findGranularExtVoiceParamSpec(event.param_id - ext_base);
      if (!spec) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return true;
      }
      spec->apply(voice, event.value);
      configureFxModules();
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return true;
    }
    GranularVoiceState& voice = fx.granular_voices[voice_index];
    const GranularVoiceParamSpec* spec = findGranularVoiceParamSpec(event.param_id - base);
    if (!spec) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return true;
    }
    spec->apply(voice, event.value);
    configureFxModules();
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return true;
  }
  return false;
}

  bool KesshoProductEngine::applyGranularParamEvent(const KesshoProductEvent& event) {
  if (applyGranularVoiceParamEvent(event)) {
    return true;
  }
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID:
      fx.granular_mix = clampFloat(event.value, 0.0f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_ENABLED_ID:
      fx.granular_enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FREEZE_ID:
      fx.granular_freeze = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FREEZE_WITH_FEEDBACK_ID:
      fx.granular_freeze_with_feedback = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID:
      fx.granular_feedback = clampFloat(event.value, 0.0f, 0.85f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_LPF_HZ_ID:
      fx.granular_feedback_lpf_hz = clampFloat(event.value, 200.0f, 12000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_REVERB_LPF_HZ_ID:
      fx.granular_reverb_lpf_hz = clampFloat(event.value, 200.0f, 12000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_OUTPUT_LPF_HZ_ID:
      fx.granular_output_lpf_hz = clampFloat(event.value, 200.0f, 12000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUFFER_SECONDS_ID:
      fx.granular_buffer_seconds = clampFloat(event.value, 1.0f, 32.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_GRAIN_SHAPE_ID:
      fx.granular_grain_shape = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUS_DIFFUSION_ID:
      fx.granular_bus_diffusion = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_TIMING_RANDOMNESS_ID:
      fx.granular_timing_randomness = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_CHORD_BIAS_ID:
      fx.granular_chord_bias = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_QUALITY_ID:
      fx.granular_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MAX_GRAINS_ID:
      fx.granular_max_grains = clampU32(static_cast<uint32_t>(std::lround(event.value)), 8u, 64u);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_SPRAY_MACRO_ID:
      fx.granular_spray_macro = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_CLOUD_MACRO_ID:
      fx.granular_cloud_macro = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_PITCH_MACRO_ID:
      fx.granular_pitch_macro = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_JITTER_MS_ID:
      fx.granular_legacy_jitter_ms = clampFloat(event.value, 0.0f, 30.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID:
      fx.granular_legacy_probability = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_MODE_ID:
      fx.granular_legacy_pitch_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 1u);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_SPREAD_ID:
      fx.granular_legacy_pitch_spread = clampFloat(event.value, 0.0f, 12.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID:
      fx.granular_legacy_max_grains = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 128u);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_FEEDBACK_ID:
      fx.granular_legacy_feedback = clampFloat(event.value, 0.0f, 0.35f);
      break;
    default:
      return false;
  }
  configureFxModules();
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return true;
}

  bool KesshoProductEngine::applyDynamicsModParamEvent(const KesshoProductEvent& event) {
  if (
      event.param_id < KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID ||
      event.param_id > KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_NOISE_ALIAS_ID) {
    return false;
  }
  const uint32_t offset = event.param_id - KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID;
  const uint32_t source = offset / kDynamicsModTargetCount;
  const uint32_t target = offset % kDynamicsModTargetCount;
  if (source >= kDynamicsModSourceCount || target >= kDynamicsModTargetCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return true;
  }
  fx.dynamics_mod[source][target] = clampFloat(event.value, 0.0f, 1.0f);
  configureFxModules();
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return true;
}

  bool KesshoProductEngine::applyDynamicsEqParamEvent(const KesshoProductEvent& event) {
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_ENABLED_ID:
      fx.dynamics_eq1_enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_INPUT_GAIN_ID:
      fx.dynamics_eq1_input_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_OUTPUT_GAIN_ID:
      fx.dynamics_eq1_output_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_LOW_TYPE_ID:
      fx.dynamics_eq1_low_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_LOW_FREQ_ID:
      fx.dynamics_eq1_low_freq = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_LOW_GAIN_ID:
      fx.dynamics_eq1_low_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_LOW_Q_ID:
      fx.dynamics_eq1_low_q = clampFloat(event.value, 0.1f, 18.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_LOW_SLOPE_ID:
      fx.dynamics_eq1_low_slope = clampFloat(event.value, 0.25f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_MID_FREQ_ID:
      fx.dynamics_eq1_mid_freq = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_MID_GAIN_ID:
      fx.dynamics_eq1_mid_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_MID_Q_ID:
      fx.dynamics_eq1_mid_q = clampFloat(event.value, 0.1f, 18.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_HIGH_TYPE_ID:
      fx.dynamics_eq1_high_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_HIGH_FREQ_ID:
      fx.dynamics_eq1_high_freq = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_HIGH_GAIN_ID:
      fx.dynamics_eq1_high_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_HIGH_Q_ID:
      fx.dynamics_eq1_high_q = clampFloat(event.value, 0.1f, 18.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ1_HIGH_SLOPE_ID:
      fx.dynamics_eq1_high_slope = clampFloat(event.value, 0.25f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_ENABLED_ID:
      fx.dynamics_eq2_enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_INPUT_GAIN_ID:
      fx.dynamics_eq2_input_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_OUTPUT_GAIN_ID:
      fx.dynamics_eq2_output_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_LOW_TYPE_ID:
      fx.dynamics_eq2_low_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_LOW_FREQ_ID:
      fx.dynamics_eq2_low_freq = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_LOW_GAIN_ID:
      fx.dynamics_eq2_low_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_LOW_Q_ID:
      fx.dynamics_eq2_low_q = clampFloat(event.value, 0.1f, 18.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_LOW_SLOPE_ID:
      fx.dynamics_eq2_low_slope = clampFloat(event.value, 0.25f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_MID_FREQ_ID:
      fx.dynamics_eq2_mid_freq = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_MID_GAIN_ID:
      fx.dynamics_eq2_mid_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_MID_Q_ID:
      fx.dynamics_eq2_mid_q = clampFloat(event.value, 0.1f, 18.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_HIGH_TYPE_ID:
      fx.dynamics_eq2_high_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_HIGH_FREQ_ID:
      fx.dynamics_eq2_high_freq = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_HIGH_GAIN_ID:
      fx.dynamics_eq2_high_gain_db = clampFloat(event.value, -24.0f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_HIGH_Q_ID:
      fx.dynamics_eq2_high_q = clampFloat(event.value, 0.1f, 18.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EQ2_HIGH_SLOPE_ID:
      fx.dynamics_eq2_high_slope = clampFloat(event.value, 0.25f, 4.0f);
      break;
    default:
      return false;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return true;
}

  bool KesshoProductEngine::applyRoutingParamEvent(const KesshoProductEvent& event) {
  uint32_t route = kDynamicsRouteCount;
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_PAD1_BUS_ID:
      route = kDynamicsRoutePad1;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_PAD2_BUS_ID:
      route = kDynamicsRoutePad2;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_LEAD1_BUS_ID:
      route = kDynamicsRouteLead1;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_LEAD2_BUS_ID:
      route = kDynamicsRouteLead2;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_PIANO_BUS_ID:
      route = kDynamicsRoutePiano;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_DRUM_BUS_ID:
      route = kDynamicsRouteDrum;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_GRANULAR_BUS_ID:
      route = kDynamicsRouteGranular;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_WAVES_BUS_ID:
      route = kDynamicsRouteWaves;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_WATER_BUS_ID:
      route = kDynamicsRouteWater;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_INSECTS_BUS_ID:
      route = kDynamicsRouteInsects;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_NATURE_BUS_ID:
      route = kDynamicsRouteNature;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_DELAY_ABUS_ID:
      route = kDynamicsRouteDelayA;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_DELAY_BBUS_ID:
      route = kDynamicsRouteDelayB;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_DEGRADE_BUS_ID:
      route = kDynamicsRouteDegrade;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DYNAMICS_REVERB_BUS_ID:
      route = kDynamicsRouteReverb;
      break;
    default:
      return false;
  }
  routing.dynamics_routes[route] = normalizedDynamicsBus(event.value);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return true;
}

  void KesshoProductEngine::applyParam(const KesshoProductEvent& event) {
  if (event.target_id >= kSoundscapeAssetLevelRangeTargetBase &&
      event.target_id < kSoundscapeAssetLevelRangeTargetEnd &&
      event.param_id == KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID) {
    applySoundscapeAssetLevelValue(event.target_id - kSoundscapeAssetLevelRangeTargetBase, event.value);
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  SourceState& soundscape_source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  if (event.target_id >= kSoundscapeTextureParamTargetBase &&
      event.target_id < kSoundscapeTextureParamTargetEnd) {
    const uint32_t index = event.target_id - kSoundscapeTextureParamTargetBase;
    soundscape_source.soundscape_texture_params[index] = event.value;
    soundscape_source.soundscape_texture_param_count = std::max(soundscape_source.soundscape_texture_param_count, index + 1u);
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  if (event.target_id >= kSoundscapeModuleParamTargetBase &&
      event.target_id < kSoundscapeModuleParamTargetBase + kSoundscapeProductModuleParamCount) {
    const uint32_t index = event.target_id - kSoundscapeModuleParamTargetBase;
    soundscape_source.soundscape_module_params[index] = event.value;
    soundscape_source.soundscape_module_param_count = std::max(soundscape_source.soundscape_module_param_count, index + 1u);
    configureSoundscapesModuleFromSource();
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  uint32_t pad_source_id = 0u;
  uint32_t pad_index = 0u;
  uint32_t pad_param_index = 0u;
  if (resolvePadRuntimeParamId(event.param_id, pad_source_id, pad_index, pad_param_index)) {
    if (applyRuntimeSourceOverrideParam(pad_source_id, pad_param_index, event.value)) {
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }
    (void) pad_index;
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  uint32_t lead_source_id = 0u;
  uint32_t lead_index = 0u;
  uint32_t lead_param_index = 0u;
  if (resolveLeadRuntimeParamId(event.param_id, lead_source_id, lead_index, lead_param_index)) {
    if (applyRuntimeSourceOverrideParam(lead_source_id, lead_param_index, event.value)) {
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }
    (void) lead_index;
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  uint32_t drum_param_index = 0u;
  if (productDrumRuntimeParamIndex(event.param_id, drum_param_index)) {
    if (applyRuntimeSourceOverrideParam(KESSHO_PRODUCT_SOURCE_DRUM, drum_param_index, event.value)) {
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  if (applyGranularParamEvent(event)) {
    return;
  }
  if (applyDynamicsModParamEvent(event)) {
    return;
  }
  if (applyDynamicsEqParamEvent(event)) {
    return;
  }
  if (applyRoutingParamEvent(event)) {
    return;
  }
  if (
      (event.param_id >= KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MODE_ID &&
       event.param_id <= KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_RANGE_ENABLED_ID) ||
      event.param_id == KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_CLOCK_MODE_ID) {
    applySequencerLaneParamEvent(event);
    return;
  }
  // TODO(product-core-cpp-dispatch-table): table-drive the low-risk FX families
  // in this switch after ProductAbiLayoutTests plus web graph parity cover the
  // exact before/after values. Start with Delay A/B and Reverb cases below:
  // use constexpr param specs with param_id, clamp/apply function, and
  // configureFxModules=true. Delete this TODO only after event IDs and C ABI
  // constants are unchanged and Product Core ABI, web-host, smoke, and parity
  // checks pass on the table-driven implementation.
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_TRANSPORT_RUNNING_ID:
      transport.running = event.value >= 0.5f;
      if (!transport.running) {
        stopSoundscapeTransportRuntime();
        for (uint32_t i = 0; i < synth_lane_count; ++i) {
          resetSequencerLaneRuntime(synth_lanes[i]);
        }
        for (uint32_t i = 0; i < drum_lane_count; ++i) {
          resetSequencerLaneRuntime(drum_lanes[i]);
        }
      }
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DEGRADE_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DIFFUSE_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ALGORITHM_PRESET_AENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_VIBRATO_DEPTH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_VIBRATO_RATE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_GLIDE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LIBRARY_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ROLE_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ARTICULATION_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_SELECTION_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_DYNAMIC_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_FIXED_DYNAMIC_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LOOP_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_MAX_VOICES_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_VARIANT_MODE_ID:
      applySourceParam(event);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_RATCHET_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TRIG_CONDITION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_BINDING_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_INITIAL_START_DELAY_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TEMPO_MULTIPLIER_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_ROOT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_SCALE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_NOTE_RANGE_MIN_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_NOTE_RANGE_MAX_ID:
      applySequencerLaneParamEvent(event);
      break;
    case KESSHO_PRODUCT_PARAM_TRANSPORT_BPM_ID:
      transport.bpm = clampFloat(event.value, 1.0f, 400.0f);
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        clearPendingRatchets(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        clearPendingRatchets(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_PARAM_TRANSPORT_BEATS_PER_BAR_ID:
      transport.beats_per_bar = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 32u);
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        clearPendingRatchets(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        clearPendingRatchets(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_PARAM_TRANSPORT_BARS_PER_PHRASE_ID:
      transport.bars_per_phrase = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 256u);
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        clearPendingRatchets(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        clearPendingRatchets(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_PARAM_TRANSPORT_SWING_ID:
      transport.swing = clampFloat(event.value, 0.0f, 1.0f);
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        clearPendingRatchets(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        clearPendingRatchets(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID:
      master_gain = clampFloat(event.value, 0.0f, 1.5f);
      break;
    case KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID:
      setMasterLimiterCeilingDb(event.value);
      break;
    case KESSHO_PRODUCT_PARAM_HARMONY_ROOT_MIDI_ID:
      harmony.root_midi = clampFloat(event.value, 0.0f, 127.0f);
      break;
    case KESSHO_PRODUCT_PARAM_HARMONY_SCALE_ID_ID:
      harmony.scale_id = static_cast<uint32_t>(std::max(1.0f, event.value));
      rebuildHarmonyAuthorityCache();
      break;
    case KESSHO_PRODUCT_PARAM_HARMONY_TENSION_ID:
      harmony.tension = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_HARMONY_VOICING_SPREAD_ID: {
      const float next_spread = clampFloat(event.value, 0.0f, 1.0f);
      harmony.requested_voicing_spread = next_spread;
      if (!transport.running) {
        harmony.voicing_spread = next_spread;
        arrangement.chord_generator_pending = arrangement.chord_generator_enabled;
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_SYNTH_OCTAVE_ID: {
      const int32_t next_octave = std::max(-2, std::min(2, static_cast<int32_t>(std::lround(event.value))));
      arrangement.requested_synth_octave = next_octave;
      if (!transport.running && arrangement.synth_octave != next_octave) {
        arrangement.synth_octave = next_octave;
        arrangement.chord_generator_pending = arrangement.chord_generator_enabled;
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_WAVE_SPREAD_ID: {
      const float next_spread = clampFloat(event.value, 0.0f, 1.0f);
      arrangement.requested_wave_spread = next_spread;
      if (!transport.running) {
        arrangement.wave_spread = next_spread;
        arrangement.chord_generator_pending = arrangement.chord_generator_enabled;
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_CHORD_GENERATOR_ENABLED_ID:
      arrangement.chord_generator_enabled = event.value >= 0.5f;
      if (!arrangement.chord_generator_enabled) {
        arrangement.chord_generator_pending = false;
      } else if (!transport.running) {
        arrangement.chord_generator_pending = true;
      }
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_CHORD_GENERATOR_SOURCE_ID_ID:
      arrangement.chord_generator_source_id = clampU32(
          static_cast<uint32_t>(std::lround(event.value)),
          1u,
          kSourceCount);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_CHORD_GENERATOR_VOICE_COUNT_ID:
      arrangement.chord_generator_voice_count = clampU32(
          static_cast<uint32_t>(std::lround(event.value)),
          1u,
          8u);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_CHORD_GENERATOR_PAD_SPLIT_ID:
      arrangement.chord_generator_pad_split = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_RANDOM_ENABLED_ID: {
      const bool next_enabled = event.value >= 0.5f;
      if (next_enabled && !arrangement.lead_random_enabled && transport.running) {
        const uint64_t phrase_frames = std::max<uint64_t>(
            1u,
            static_cast<uint64_t>(std::llround(
                sample_rate * static_cast<double>(arrangement.lead_phrase_seconds))));
        const uint64_t next_shared_boundary = arrangement.chord_phrase_start_frame + phrase_frames;
        arrangement.next_lead_phrase_frame = std::max(transport.sample_frame, next_shared_boundary);
        arrangement.lead_phrase_index = arrangement.chord_phrase_index + 1u;
      }
      arrangement.lead_random_enabled = next_enabled;
      break;
    }
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_RANDOM_SOURCE_ID_ID:
      arrangement.lead_random_source_id = clampU32(
          static_cast<uint32_t>(std::lround(event.value)),
          1u,
          kSourceCount);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_PHRASE_SECONDS_ID:
      arrangement.lead_phrase_seconds = clampFloat(event.value, 0.001f, 4096.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_DENSITY_ID:
      arrangement.lead_density = clampFloat(event.value, 0.1f, 12.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_OCTAVE_ID:
      arrangement.lead_octave = std::max(
          -1,
          std::min(2, static_cast<int32_t>(std::lround(event.value))));
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_OCTAVE_RANGE_ID:
      arrangement.lead_octave_range = clampU32(
          static_cast<uint32_t>(std::lround(event.value)),
          1u,
          4u);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_HOLD_SECONDS_ID:
      arrangement.lead_hold_seconds = clampFloat(event.value, 0.02f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_VELOCITY_MIN_ID:
      arrangement.lead_velocity_min = clampFloat(event.value, 0.001f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_VELOCITY_MAX_ID:
      arrangement.lead_velocity_max = clampFloat(event.value, 0.001f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_CHORD_BIAS_ID:
      arrangement.lead_chord_bias = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ARRANGEMENT_LEAD_INITIAL_DELAY_SECONDS_ID:
      arrangement.lead_initial_delay_seconds = clampFloat(event.value, 0.0f, 4096.0f);
      break;
    case KESSHO_PRODUCT_PARAM_JOURNEY_ENABLED_ID:
      journey_running = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_JOURNEY_MORPH_PHASE_ID:
      journey_phase = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_JOURNEY_MORPH_RATE_BARS_ID:
      journey_rate_bars = clampFloat(event.value, 0.25f, 128.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID:
      fx.granular_mix = clampFloat(event.value, 0.0f, 4.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AENABLED_ID:
      fx.delay_a_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_LEFT_MS_ID:
      fx.delay_a_time_left_ms = clampFloat(event.value, 10.0f, 5000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_RIGHT_MS_ID:
      fx.delay_a_time_right_ms = clampFloat(event.value, 10.0f, 5000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID:
      fx.delay_a_feedback = clampFloat(event.value, 0.0f, 0.95f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID:
      fx.delay_a_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID:
      fx.delay_a_filter_hz = clampFloat(event.value, 200.0f, 12000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_TYPE_ID:
      fx.delay_a_filter_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_RATE_HZ_ID:
      fx.delay_a_mod_rate_hz = clampFloat(event.value, 0.0f, 5.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_DEPTH_MS_ID:
      fx.delay_a_mod_depth_ms = clampFloat(event.value, 0.0f, 50.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_APING_PONG_ID:
      fx.delay_a_ping_pong = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ADUCK_ID:
      fx.delay_a_duck = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AWIDTH_ID:
      fx.delay_a_width = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ACROSS_FEED_FILTER_HZ_ID:
      fx.delay_a_cross_feed_filter_hz = clampFloat(event.value, 200.0f, 12000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BENABLED_ID:
      fx.delay_b_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BACTIVITY_ID:
      fx.delay_b_activity = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BREPEATS_ID:
      fx.delay_b_repeats = clampFloat(event.value, 0.0f, 0.85f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BBASE_TIME_MS_ID:
      fx.delay_b_base_time_ms = clampFloat(event.value, 20.0f, 5000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTONE_ID:
      fx.delay_b_tone = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BVIBRATO_ID:
      fx.delay_b_vibrato = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID:
      fx.delay_b_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPACE_MODE_ID:
      fx.delay_b_space_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BPATTERN_ID:
      fx.delay_b_pattern = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_ID:
      fx.delay_b_warp = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_INTENSITY_ID:
      fx.delay_b_warp_intensity = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID:
      fx.delay_b_spread = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD_MASK_ID:
      fx.delay_b_tape_head_mask = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 15u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD2_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD3_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD4_LEVEL_ID: {
      const uint32_t index = event.param_id - KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_LEVEL_ID;
      if (index < fx.delay_b_tape_head_levels.size()) {
        fx.delay_b_tape_head_levels[index] = clampFloat(event.value, 0.0f, 1.0f);
      }
      configureFxModules();
      break;
    }
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_PAN_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD2_PAN_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD3_PAN_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD4_PAN_ID: {
      const uint32_t index = event.param_id - KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_PAN_ID;
      if (index < fx.delay_b_tape_head_pans.size()) {
        fx.delay_b_tape_head_pans[index] = clampFloat(event.value, 0.0f, 1.0f);
      }
      configureFxModules();
      break;
    }
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID:
      fx.reverb_mix = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_TYPE_ID:
      fx.reverb_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 5u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_QUALITY_ID:
      fx.reverb_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID:
      fx.reverb_decay = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID:
      fx.reverb_size = clampFloat(event.value, 0.5f, 10.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMPING_ID:
      fx.reverb_damping = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DIFFUSION_ID:
      fx.reverb_diffusion = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MODULATION_ID:
      fx.reverb_modulation = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PREDELAY_MS_ID:
      fx.reverb_predelay_ms = clampFloat(event.value, 0.0f, 100.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID:
      fx.reverb_width = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID:
      fx.reverb_shimmer_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_PITCH_ID:
      fx.reverb_shimmer_pitch = clampFloat(event.value, -24.0f, 24.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_RATE_HZ_ID:
      fx.reverb_slow_rate_hz = clampFloat(event.value, 0.01f, 0.2f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_DEPTH_ID:
      fx.reverb_slow_depth = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_AMOUNT_ID:
      fx.reverb_reverse_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_LENGTH_SEC_ID:
      fx.reverb_reverse_length_sec = clampFloat(event.value, 0.5f, 16.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_RATE_HZ_ID:
      fx.reverb_chorus_rate_hz = clampFloat(event.value, 0.05f, 2.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_DEPTH_ID:
      fx.reverb_chorus_depth = clampFloat(event.value, 0.0f, 40.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MOD_CHARACTER_ID:
      fx.reverb_mod_character = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_LOW_ID:
      fx.reverb_damp_low = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID:
      fx.reverb_damp_high = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSSOVER_HZ_ID:
      fx.reverb_crossover_hz = clampFloat(event.value, 100.0f, 6000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_INPUT_TONE_ID:
      fx.reverb_input_tone = clampFloat(event.value, -1.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_FEEDBACK_ID:
      fx.reverb_shimmer_feedback = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_BLOOM_ID:
      fx.reverb_bloom = clampFloat(event.value, -1.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WARP_ID:
      fx.reverb_warp = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSS_FEED_ID:
      fx.reverb_cross_feed = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_EARLY_REFLECTIONS_ID:
      fx.reverb_early_reflections = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_AIR_ABSORPTION_ID:
      fx.reverb_air_absorption = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SATURATION_MODE_ID:
      fx.reverb_saturation_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_TRANSIENT_SMOOTH_ID:
      fx.reverb_transient_smooth = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_ER_LP_FREQ_ID:
      fx.reverb_er_lp_freq = clampFloat(event.value, 200.0f, 12000.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_THRESHOLD_ID:
      fx.reverb_pre_comp_threshold = clampFloat(event.value, -60.0f, 0.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_KNEE_ID:
      fx.reverb_pre_comp_knee = clampFloat(event.value, 0.0f, 40.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RATIO_ID:
      fx.reverb_pre_comp_ratio = clampFloat(event.value, 1.0f, 20.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_ATTACK_MS_ID:
      fx.reverb_pre_comp_attack_ms = clampFloat(event.value, 0.1f, 30.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RELEASE_MS_ID:
      fx.reverb_pre_comp_release_ms = clampFloat(event.value, 20.0f, 1000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_MAKEUP_ID:
      fx.reverb_pre_comp_makeup = clampFloat(event.value, 0.5f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORD_WASH_ID:
      fx.reverb_chord_wash = event.value >= 0.5f;
      if (!fx.reverb_chord_wash) {
        reverb_wash_boost = 0.0f;
        configureReverbModule();
      }
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_RESOLUTION_BLOOM_ID:
      fx.reverb_resolution_bloom = event.value >= 0.5f;
      if (!fx.reverb_resolution_bloom) {
        reverb_bloom_boost = 0.0f;
        configureReverbModule();
      }
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID:
      fx.spectral_freeze_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ENABLED_ID:
      fx.spectral_freeze_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ACTIVE_ID:
      fx.spectral_freeze_active = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MODE_ID:
      fx.spectral_freeze_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_CAPTURE_SERIAL_ID:
      fx.spectral_freeze_capture_serial = static_cast<uint32_t>(std::max(0.0f, std::round(event.value)));
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_STRETCH_SPEED_ID:
      fx.spectral_freeze_stretch_speed = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DIRECTION_ID:
      fx.spectral_freeze_direction = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_POSITION_ID:
      fx.spectral_freeze_position = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_REFRESH_ID:
      fx.spectral_freeze_refresh = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_INPUT_SENSITIVITY_ID:
      fx.spectral_freeze_input_sensitivity = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DIFFUSION_ID:
      fx.spectral_freeze_diffusion = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_TONE_ID:
      fx.spectral_freeze_tone = clampFloat(event.value, -1.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_WIDTH_ID:
      fx.spectral_freeze_width = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SUSTAIN_ID:
      fx.spectral_freeze_sustain = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ROUTING_ID:
      fx.spectral_freeze_routing = event.value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_REVERB_CROSSFADE_ID:
      fx.spectral_freeze_reverb_crossfade = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID:
      fx.dynamics_drive = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_ENABLED_ID:
      fx.dynamics_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_ENABLED_ID:
      fx.dynamics_drift_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_MODE_ID:
      fx.dynamics_drift_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_QUALITY_ID:
      fx.dynamics_drift_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_ANTI_COMB_ID:
      fx.dynamics_drift_anti_comb = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_DIFFUSION_ID:
      fx.dynamics_drift_diffusion = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_MIX_ID:
      fx.dynamics_drift_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_AGE_ID:
      fx.dynamics_drift_age = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_BIAS_ID:
      fx.dynamics_drift_bias = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_LPG_AMOUNT_ID:
      fx.dynamics_drift_lpg_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_RESONANCE_ID:
      fx.dynamics_drift_resonance = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_STEREO_ID:
      fx.dynamics_drift_stereo = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_ENV_FOLLOW_ID:
      fx.dynamics_drift_env_follow = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_DEPTH_ID:
      fx.dynamics_drift_depth = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_RATE_ID:
      fx.dynamics_drift_rate = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_DAMP_ID:
      fx.dynamics_drift_damp = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_ENABLED_ID:
      fx.dynamics_erosion_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_QUALITY_ID:
      fx.dynamics_erosion_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_EVENT_AMOUNT_ID:
      fx.dynamics_erosion_event_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_PROFILE_AMOUNT_ID:
      fx.dynamics_erosion_profile_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_DITHER_AMOUNT_ID:
      fx.dynamics_erosion_dither_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_MIX_ID:
      fx.dynamics_erosion_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_AGE_ID:
      fx.dynamics_erosion_age = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_GENERATION_ID:
      fx.dynamics_erosion_generation = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_ALIAS_ID:
      fx.dynamics_erosion_alias = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_WOW_ID:
      fx.dynamics_erosion_wow = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_FLUTTER_ID:
      fx.dynamics_erosion_flutter = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_DRIFT_ID:
      fx.dynamics_erosion_drift = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_WOBBLE_SPEED_ID:
      fx.dynamics_erosion_wobble_speed = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_TONE_ID:
      fx.dynamics_erosion_tone = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_HP_ID:
      fx.dynamics_degrade_hp = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_LP_ID:
      fx.dynamics_degrade_lp = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_NOISE_ID:
      fx.dynamics_erosion_noise = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_SATURATION_ID:
      fx.dynamics_erosion_saturation = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_CORROSION_ID:
      fx.dynamics_erosion_corrosion = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_ENABLED_ID:
      fx.dynamics_saturation_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_MODE_ID:
      fx.dynamics_saturation_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 4u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_QUALITY_ID:
      fx.dynamics_saturation_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID:
      fx.dynamics_saturation_drive = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_TONE_ID:
      fx.dynamics_saturation_tone = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_BIAS_ID:
      fx.dynamics_saturation_bias = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_ENABLED_ID:
      fx.dynamics_end_comp_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MODE_ID:
      fx.dynamics_end_comp_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 4u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_THRESHOLD_ID:
      fx.dynamics_end_comp_threshold = clampFloat(event.value, -60.0f, 0.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_KNEE_ID:
      fx.dynamics_end_comp_knee = clampFloat(event.value, 0.0f, 40.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_RATIO_ID:
      fx.dynamics_end_comp_ratio = clampFloat(event.value, 1.0f, 20.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_ATTACK_MS_ID:
      fx.dynamics_end_comp_attack_ms = clampFloat(event.value, 0.1f, 100.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_RELEASE_MS_ID:
      fx.dynamics_end_comp_release_ms = clampFloat(event.value, 20.0f, 1500.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MAKEUP_ID:
      fx.dynamics_end_comp_makeup = clampFloat(event.value, 0.25f, 4.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MIX_ID:
      fx.dynamics_end_comp_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_DETECTOR_HP_ID:
      fx.dynamics_end_comp_detector_hp = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_DETECTOR_TILT_ID:
      fx.dynamics_end_comp_detector_tilt = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_AUTO_MAKEUP_ID:
      fx.dynamics_end_comp_auto_makeup = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_PROGRAM_RELEASE_ID:
      fx.dynamics_end_comp_program_release = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_PEAK_BLEND_ID:
      fx.dynamics_end_comp_peak_blend = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_CLARITY_ID:
      fx.dynamics_end_comp_clarity = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_TWO_BAND_AMOUNT_ID:
      fx.dynamics_end_comp_two_band_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_BAND_SPLIT_ID:
      fx.dynamics_end_comp_band_split = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_ENABLED_ID:
      fx.sidechain_enabled = event.value >= 0.5f;
      if (!fx.sidechain_enabled) {
        resetSidechainRuntime();
      }
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_A_ID:
      fx.sidechain_key_a = clampU32(static_cast<uint32_t>(std::lround(event.value)), kSidechainKeyOff, kSidechainKeyMembrane);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_B_ID:
      fx.sidechain_key_b = clampU32(static_cast<uint32_t>(std::lround(event.value)), kSidechainKeyOff, kSidechainKeyMembrane);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_AWEIGHT_ID:
      fx.sidechain_key_a_weight = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_BWEIGHT_ID:
      fx.sidechain_key_b_weight = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_AMOUNT_ID:
      fx.sidechain_amount = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_THRESHOLD_ID:
      fx.sidechain_threshold = clampFloat(event.value, -60.0f, 0.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RATIO_ID:
      fx.sidechain_ratio = clampFloat(event.value, 1.0f, 20.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KNEE_ID:
      fx.sidechain_knee = clampFloat(event.value, 0.0f, 40.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_ATTACK_MS_ID:
      fx.sidechain_attack_ms = clampFloat(event.value, 0.1f, 100.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_HOLD_MS_ID:
      fx.sidechain_hold_ms = clampFloat(event.value, 0.0f, 250.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RELEASE_MS_ID:
      fx.sidechain_release_ms = clampFloat(event.value, 20.0f, 1500.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_MAKEUP_ID:
      fx.sidechain_makeup = clampFloat(event.value, 0.25f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_MIX_ID:
      fx.sidechain_mix = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_CURVE_ID:
      fx.sidechain_curve = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DETECTOR_HP_ID:
      fx.sidechain_detector_hp = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DETECTOR_LP_ID:
      fx.sidechain_detector_lp = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD1_TARGET_ID:
      fx.sidechain_targets[kSidechainPad1] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD2_TARGET_ID:
      fx.sidechain_targets[kSidechainPad2] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_LEAD1_TARGET_ID:
      fx.sidechain_targets[kSidechainLead1] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_LEAD2_TARGET_ID:
      fx.sidechain_targets[kSidechainLead2] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PIANO_TARGET_ID:
      fx.sidechain_targets[kSidechainPiano] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_GRANULAR_TARGET_ID:
      fx.sidechain_targets[kSidechainGranular] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DELAY_ATARGET_ID:
      fx.sidechain_targets[kSidechainDelayA] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DELAY_BTARGET_ID:
      fx.sidechain_targets[kSidechainDelayB] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_REVERB_TARGET_ID:
      fx.sidechain_targets[kSidechainReverb] = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_DELAY_B_ID:
      routing.delay_a_to_delay_b = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_DELAY_A_ID:
      routing.delay_b_to_delay_a = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_TO_REVERB_ID:
      routing.delay_to_reverb = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_REVERB_ID:
      routing.granular_to_reverb = clampFloat(event.value, 0.0f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID:
      routing.delay_a_to_granular = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_GRANULAR_ID:
      routing.delay_b_to_granular = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_REVERB_ID:
      routing.delay_b_to_reverb = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DELAY_A_ID:
      routing.granular_to_delay_a = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DELAY_B_ID:
      routing.granular_to_delay_b = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_DEGRADE_ID:
      routing.delay_a_to_degrade = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_DEGRADE_ID:
      routing.delay_b_to_degrade = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DEGRADE_ID:
      routing.granular_to_degrade = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_REVERB_TO_DEGRADE_ID:
      routing.reverb_to_degrade = clampFloat(event.value, 0.0f, 1.0f);
      if (routing.reverb_to_degrade > 0.0001f) {
        routing.degrade_to_reverb = 0.0f;
      }
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DEGRADE_TO_REVERB_ID:
      routing.degrade_to_reverb = clampFloat(event.value, 0.0f, 1.0f);
      if (routing.degrade_to_reverb > 0.0001f) {
        routing.reverb_to_degrade = 0.0f;
      }
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DEGRADE_RETURN_LEVEL_ID:
      routing.degrade_return_level = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_RNG_SEED_ID:
      rng_seed = static_cast<uint32_t>(std::max(1.0f, event.value));
      rng_state = rng_seed;
      break;
    case KESSHO_PRODUCT_PARAM_RNG_STATE_ID:
      rng_state = static_cast<uint32_t>(std::max(1.0f, event.value));
      break;
    case KESSHO_PRODUCT_PARAM_EVOLUTION_AMOUNT_ID:
      evolution_amount = clampFloat(event.value, 0.0f, 1.0f);
      markSequencerUiStateChanged(0u, 0xffffffffu, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_EVOLUTION);
      break;
    case KESSHO_PRODUCT_PARAM_EVOLUTION_STATE_ID:
      evolution_state = static_cast<uint32_t>(std::max(1.0f, event.value));
      markSequencerUiStateChanged(0u, 0xffffffffu, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_EVOLUTION);
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      break;
  }
}

  void KesshoProductEngine::compactControlEvents(uint32_t frames, uint32_t first_unprocessed) {
  uint32_t write = 0;
  for (uint32_t read = first_unprocessed; read < control_event_count; ++read) {
    QueuedProductEvent queued = control_events[read];
    if (queued.event.sample_offset >= frames) {
      queued.event.sample_offset -= frames;
      control_events[write++] = queued;
    }
  }
  control_event_count = write;
}
