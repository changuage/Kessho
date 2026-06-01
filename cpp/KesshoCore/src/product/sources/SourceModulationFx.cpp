#include "../KesshoProductEngineInternal.h"

namespace {

constexpr double kFxSampleHoldOwnershipWindowSeconds = 0.14;
constexpr float kFxOwnershipStealMargin = 0.05f;
constexpr float kFxOwnershipStealRatio = 1.15f;
constexpr float kFxOwnershipRecentOnsetRatio = 0.65f;

uint64_t fxSampleHoldOwnershipWindowFrames(double sample_rate) {
  if (!std::isfinite(sample_rate) || sample_rate <= 0.0) {
    return 1u;
  }
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::lround(sample_rate * kFxSampleHoldOwnershipWindowSeconds)));
}

} // namespace

  uint32_t KesshoProductEngine::sampleHoldTriggerBusForParam(uint32_t param_id) const {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_LEFT_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_RIGHT_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_RATE_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_DEPTH_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ADUCK_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AWIDTH_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ACROSS_FEED_FILTER_HZ_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_DELAY_B_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_TO_REVERB_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID:
      return kProductSampleHoldTriggerDelayA;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BACTIVITY_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BREPEATS_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BBASE_TIME_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTONE_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BVIBRATO_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_INTENSITY_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_DELAY_A_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_GRANULAR_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_REVERB_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DELAY_A_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DELAY_B_ID:
      return kProductSampleHoldTriggerDelayB;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_REVERB_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_OUTPUT_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUFFER_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUS_DIFFUSION_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_TIMING_RANDOMNESS_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_CHORD_BIAS_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_JITTER_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_SPREAD_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID:
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_FEEDBACK_ID:
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_REVERB_ID:
      return kProductSampleHoldTriggerGranular;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMPING_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DIFFUSION_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MODULATION_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PREDELAY_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_PITCH_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_RATE_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_DEPTH_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_AMOUNT_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_LENGTH_SEC_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_RATE_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_DEPTH_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_LOW_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSSOVER_HZ_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_INPUT_TONE_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_FEEDBACK_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_BLOOM_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WARP_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSS_FEED_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_EARLY_REFLECTIONS_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_AIR_ABSORPTION_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_TRANSIENT_SMOOTH_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_ER_LP_FREQ_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_THRESHOLD_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_KNEE_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RATIO_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_ATTACK_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RELEASE_MS_ID:
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_MAKEUP_ID:
      return kProductSampleHoldTriggerReverb;
    default:
      break;
  }

  if (param_id >= KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID &&
      param_id <= KESSHO_PRODUCT_PARAM_FX_GRANULAR_V4_EUCLID_MUTED_ID) {
    const uint32_t offset = (param_id - KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID) % 25u;
    if (offset == 3u || offset == 4u || (offset >= 6u && offset <= 22u)) {
      return kProductSampleHoldTriggerGranular;
    }
  }
  return kProductSampleHoldTriggerTimed;
}

  uint32_t KesshoProductEngine::sampleHoldTriggerBusForEvent(const KesshoProductEvent& event) const {
  const uint32_t flags = event.flags & KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_MASK;
  if ((flags & KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_A) != 0u) return kProductSampleHoldTriggerDelayA;
  if ((flags & KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_B) != 0u) return kProductSampleHoldTriggerDelayB;
  if ((flags & KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_GRANULAR) != 0u) return kProductSampleHoldTriggerGranular;
  if ((flags & KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_REVERB) != 0u) return kProductSampleHoldTriggerReverb;
  return event.target_id == 0u ? sampleHoldTriggerBusForParam(event.param_id) : kProductSampleHoldTriggerTimed;
}

  void KesshoProductEngine::resetFxSampleHoldOwners() {
  for (ProductFxSampleHoldOwner& owner : fx_sample_hold_owners) {
    owner = {};
  }
}

  float KesshoProductEngine::fxSampleHoldSourceStrength(uint32_t bus, uint32_t source_id, float drum_delay_send) const {
  if (source_id < 1u || source_id > kSourceCount || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
    return 0.0f;
  }
  const SourceState& source = sources[source_id - 1u];
  switch (bus) {
    case kProductSampleHoldTriggerDelayA:
      return fx.delay_a_enabled
          ? clampFloat(source_id == KESSHO_PRODUCT_SOURCE_DRUM && drum_delay_send >= 0.0f ? drum_delay_send : source.delay_a_send, 0.0f, 1.0f)
          : 0.0f;
    case kProductSampleHoldTriggerDelayB:
      return fx.delay_b_enabled ? clampFloat(source.delay_b_send, 0.0f, 1.0f) : 0.0f;
    case kProductSampleHoldTriggerGranular:
      return fx.granular_enabled || fx.granular_mix > 0.0001f ? clampFloat(source.granular_send, 0.0f, 1.0f) : 0.0f;
    case kProductSampleHoldTriggerReverb:
      return fx.reverb_mix > 0.0001f ? clampFloat(source.reverb_send, 0.0f, 1.0f) : 0.0f;
    default:
      return 0.0f;
  }
}

  bool KesshoProductEngine::shouldTriggerFxSampleHoldBus(uint32_t bus, uint32_t source_id, float strength) const {
  if (bus == kProductSampleHoldTriggerTimed || bus > kProductSampleHoldTriggerReverb || strength <= 0.0001f) {
    return false;
  }
  const ProductFxSampleHoldOwner& owner = fx_sample_hold_owners[bus];
  if (owner.source_id == source_id || owner.source_id == 0u || transport.sample_frame >= owner.expires_at_frame) {
    return true;
  }
  if (strength >= owner.strength + kFxOwnershipStealMargin) return true;
  if (owner.strength > 0.0f && strength / owner.strength >= kFxOwnershipStealRatio) return true;
  return owner.strength > 0.0f && strength / owner.strength >= kFxOwnershipRecentOnsetRatio;
}

  void KesshoProductEngine::triggerFxSampleHoldRanges(
      uint32_t source_id,
      float delay_a_strength,
      float delay_b_strength,
      float granular_strength,
      float reverb_strength,
      uint32_t sample_seed) {
  bool trigger_bus[kProductSampleHoldTriggerReverb + 1]{};
  const float strengths[kProductSampleHoldTriggerReverb + 1]{
      0.0f,
      delay_a_strength,
      delay_b_strength,
      granular_strength,
      reverb_strength,
  };

  for (uint32_t bus = kProductSampleHoldTriggerDelayA; bus <= kProductSampleHoldTriggerReverb; ++bus) {
    if (!shouldTriggerFxSampleHoldBus(bus, source_id, strengths[bus])) continue;
    ProductFxSampleHoldOwner& owner = fx_sample_hold_owners[bus];
    owner.source_id = source_id;
    owner.strength = strengths[bus];
    owner.expires_at_frame = transport.sample_frame + fxSampleHoldOwnershipWindowFrames(sample_rate);
    trigger_bus[bus] = true;
  }

  for (ModulationRange& range : modulation_ranges) {
    if (!range.active ||
        range.target_id != 0u ||
        range.mode != KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD ||
        range.sample_hold_trigger_bus == kProductSampleHoldTriggerTimed ||
        range.sample_hold_trigger_bus > kProductSampleHoldTriggerReverb ||
        !trigger_bus[range.sample_hold_trigger_bus]) {
      continue;
    }
    ++range.sample_hold_counter;
    const uint32_t trigger_seed = sample_seed ^
        (range.sample_hold_trigger_bus * 0x9e3779b9u) ^
        (range.sample_hold_counter * 0x85ebca6bu);
    range.current_value = modulationRangeSample(range, range.current_value, trigger_seed);
    range.last_trigger_frame = transport.sample_frame;
    range.last_trigger_source = source_id;
    applyModulationRangeValue(range);
  }
}
