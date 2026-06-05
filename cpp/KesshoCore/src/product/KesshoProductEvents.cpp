#include "KesshoProductEngineInternal.h"

#include <initializer_list>

namespace {

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
      return event.value > 0.0f ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    case KESSHO_PRODUCT_EVENT_KIND_SET_PARAM:
      return event.param_id == 0u ? KESSHO_PRODUCT_ERROR_INVALID_PARAM : KESSHO_PRODUCT_OK;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_ENABLED:
      return valid_source(event.target_id) ? KESSHO_PRODUCT_OK : KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
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
          !isSoundscapeAssetLevelRangeTarget(event.target_id)) {
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
    case KESSHO_PRODUCT_EVENT_KIND_RESET_SEQUENCER_LANE_HOME:
    case KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE:
      return valid_sequencer(event.target_id) && event.index < kMaxLaneCount
          ? KESSHO_PRODUCT_OK
          : KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
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
       source_id == KESSHO_PRODUCT_SOURCE_PIANO) &&
      source_id >= 1u &&
      source_id <= kSourceCount) {
    return clampFloat(sources[source_id - 1u].hold_seconds, 0.001f, 20.0f);
  }
  return clampFloat(requested_seconds, 0.001f, 20.0f);
}

  void KesshoProductEngine::applyControlEvent(const KesshoProductEvent& event) {
  switch (event.event_kind) {
    case KESSHO_PRODUCT_EVENT_KIND_START:
      if (!transport.running) {
        for (uint32_t i = 0; i < synth_lane_count; ++i) {
          resetSequencerLaneRuntime(synth_lanes[i]);
        }
        for (uint32_t i = 0; i < drum_lane_count; ++i) {
          resetSequencerLaneRuntime(drum_lanes[i]);
        }
      }
      transport.running = true;
      break;
    case KESSHO_PRODUCT_EVENT_KIND_STOP:
      transport.running = false;
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
      transport.bpm = clampFloat(event.value, 1.0f, 400.0f);
      for (uint32_t i = 0; i < synth_lane_count; ++i) {
        clearPendingRatchets(synth_lanes[i]);
      }
      for (uint32_t i = 0; i < drum_lane_count; ++i) {
        clearPendingRatchets(drum_lanes[i]);
      }
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP:
      applySequencerStepEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE:
      applySequencerLaneParamEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_STATE:
      applyJourneyStateEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_PARAM:
      applyParam(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_ENABLED:
      if (event.target_id >= 1u && event.target_id <= kSourceCount) {
        setSourceEnabled(sources[event.target_id - 1u], event.value >= 0.5f, false);
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
      triggerVoice(
          source_id,
          event.value,
          event.value2,
          manualNoteHoldSeconds(source_id, event.value3),
          -1.0f,
          -1.0f,
          event.value4 > 0.0f ? event.value4 : -1.0f,
          0u,
          0u,
          false,
          0.0f,
          1.0e10f,
          1.0e10f,
          padVoiceIndexFromSequencerEventFlags(event.flags));
      break;
    }
    case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_OFF:
      releaseSourceVoices(event.target_id);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT:
      applyMidiEvent(event);
      break;
    case KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE:
      triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 36.0f + static_cast<float>(event.target_id), event.value, 0.12f);
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
      if (harmony.active_slot_id == static_cast<int32_t>(event.index)) {
        harmony.note_pool_count = 0u;
        harmony.active_source = 0u;
        harmony.control_mode = 0u;
        harmony.active_slot_id = -1;
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
  if (command == 0x90u && data2 > 0.0f) {
    const float controller_velocity_scale = midiControllerVelocityScale(source_id, channel, midi_note);
    const float trigger_midi_note = clampFloat(data1 + midiPitchBendSemitones(source_id, channel), 0.0f, 127.0f);
    uint32_t pad_voice_index = kPadVoiceNoPreference;
    uint32_t pad_route_voice_index = kProductInvalidVoiceIndex;
    if ((source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) &&
        source_id >= 1u && source_id <= kSourceCount &&
        sources[source_id - 1u].enabled &&
        pad_module) {
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      pad_voice_index = pad_voice_cursors[pad_index]++ % static_cast<uint32_t>(PAD_VOICES_PER_PAD);
      pad_route_voice_index = pad_index * static_cast<uint32_t>(PAD_VOICES_PER_PAD) + pad_voice_index;
    }
    const float hold_seconds = pad_route_voice_index != kProductInvalidVoiceIndex ? 0.0f : 0.5f;
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
        pad_voice_index);
    uint32_t lead_voice_index = kProductInvalidVoiceIndex;
    uint32_t sample_voice_index = kProductInvalidVoiceIndex;
    if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
      lead_voice_index = trigger_voice_index;
    } else if (source_id == KESSHO_PRODUCT_SOURCE_PIANO || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
      sample_voice_index = trigger_voice_index;
    }
    if (source_id >= 1u && source_id <= kSourceCount && sources[source_id - 1u].enabled) {
      trackMidiNoteOn(source_id, channel, midi_note, pad_route_voice_index, lead_voice_index, sample_voice_index);
    }
    return;
  }
  if (command == 0x80u || (command == 0x90u && data2 <= 0.0f)) {
    applyMidiNoteOff(source_id, channel, midi_note);
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

  void KesshoProductEngine::applyParam(const KesshoProductEvent& event) {
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
      break;
    case KESSHO_PRODUCT_PARAM_HARMONY_TENSION_ID:
      harmony.tension = clampFloat(event.value, 0.0f, 1.0f);
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
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SLUSHY_ID:
      fx.spectral_freeze_slushy = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SPEED_ID:
      fx.spectral_freeze_speed = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DECAY_ID:
      fx.spectral_freeze_decay = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_PHASE_JITTER_ID:
      fx.spectral_freeze_phase_jitter = clampFloat(event.value, 0.0f, 1.0f);
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
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_ENABLED_ID:
      fx.dynamics_character_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MODE_ID:
      fx.dynamics_character_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_QUALITY_ID:
      fx.dynamics_character_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_ANTI_COMB_ID:
      fx.dynamics_character_anti_comb = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_DIFFUSION_ID:
      fx.dynamics_character_diffusion = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MIX_ID:
      fx.dynamics_character_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_AGE_ID:
      fx.dynamics_character_age = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_BIAS_ID:
      fx.dynamics_character_bias = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_LPG_AMOUNT_ID:
      fx.dynamics_character_lpg_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_RESONANCE_ID:
      fx.dynamics_character_resonance = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_STEREO_ID:
      fx.dynamics_character_stereo = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_ENV_FOLLOW_ID:
      fx.dynamics_character_env_follow = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_DEPTH_ID:
      fx.dynamics_character_depth = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_RATE_ID:
      fx.dynamics_character_rate = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_DAMP_ID:
      fx.dynamics_character_damp = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_ENABLED_ID:
      fx.dynamics_degrade_enabled = event.value >= 0.5f;
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_QUALITY_ID:
      fx.dynamics_degrade_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_EVENT_AMOUNT_ID:
      fx.dynamics_degrade_event_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_PROFILE_AMOUNT_ID:
      fx.dynamics_degrade_profile_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_DITHER_AMOUNT_ID:
      fx.dynamics_degrade_dither_amount = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_MIX_ID:
      fx.dynamics_degrade_mix = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_AGE_ID:
      fx.dynamics_degrade_age = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_GENERATION_ID:
      fx.dynamics_degrade_generation = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_ALIAS_ID:
      fx.dynamics_degrade_alias = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_WOW_ID:
      fx.dynamics_degrade_wow = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_FLUTTER_ID:
      fx.dynamics_degrade_flutter = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_DRIFT_ID:
      fx.dynamics_degrade_drift = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_WOBBLE_SPEED_ID:
      fx.dynamics_degrade_wobble_speed = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_TONE_ID:
      fx.dynamics_degrade_tone = clampFloat(event.value, 0.0f, 1.0f);
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
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_NOISE_ID:
      fx.dynamics_degrade_noise = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_SATURATION_ID:
      fx.dynamics_degrade_saturation = clampFloat(event.value, 0.0f, 1.0f);
      configureFxModules();
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_CORROSION_ID:
      fx.dynamics_degrade_corrosion = clampFloat(event.value, 0.0f, 1.0f);
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
