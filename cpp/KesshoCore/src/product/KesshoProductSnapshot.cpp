#include "KesshoProductEngineInternal.h"

#include <array>
#include <memory>

namespace {
bool generatedPadEndpointPatchValid(const KesshoProductSourceSnapshot& source) {
  const auto* endpoint_a = kessho::product::internal::findSourcePreset(source.source_preset_a_id);
  const auto* endpoint_b = kessho::product::internal::findSourcePreset(source.source_preset_b_id);
  return kessho::product::internal::sourcePresetMatchesSource(source.source_id, endpoint_a) &&
         kessho::product::internal::sourcePresetMatchesSource(source.source_id, endpoint_b) &&
         kessho::product::internal::findPadSourcePresetPatch(endpoint_a->id) != nullptr &&
         kessho::product::internal::findPadSourcePresetPatch(endpoint_b->id) != nullptr;
}

bool generatedLeadEndpointPatchValid(const KesshoProductSourceSnapshot& source) {
  const auto* endpoint_a = kessho::product::internal::findSourcePreset(source.source_preset_a_id);
  const auto* endpoint_b = kessho::product::internal::findSourcePreset(source.source_preset_b_id);
  return kessho::product::internal::sourcePresetMatchesSource(source.source_id, endpoint_a) &&
         kessho::product::internal::sourcePresetMatchesSource(source.source_id, endpoint_b) &&
         kessho::product::internal::findLeadSourcePresetPatch(endpoint_a->id) != nullptr &&
         kessho::product::internal::findLeadSourcePresetPatch(endpoint_b->id) != nullptr;
}

bool validGeneratedDrumVoicePresetIds(const KesshoProductSourceSnapshot& source) {
  for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
    if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
      return false;
    }
    if (kessho::product::internal::findDrumVoicePreset(voice.index, source.drum_voice_preset_a_ids[voice.index]) == nullptr ||
        kessho::product::internal::findDrumVoicePreset(voice.index, source.drum_voice_preset_b_ids[voice.index]) == nullptr) {
      return false;
    }
  }
  return true;
}

bool validSparseOverrideBlock(uint32_t count, const uint32_t* indices, const float* values, uint32_t param_count) {
  if (count > param_count) {
    return false;
  }
  for (uint32_t slot = 0u; slot < count; ++slot) {
    if (indices[slot] >= param_count || !std::isfinite(values[slot])) {
      return false;
    }
  }
  return true;
}

bool exactParamBlockEmpty(uint32_t count, const float* values, uint32_t param_count) {
  if (count != 0u) {
    return false;
  }
  for (uint32_t slot = 0u; slot < param_count; ++slot) {
    if (!std::isfinite(values[slot]) || values[slot] != 0.0f) {
      return false;
    }
  }
  return true;
}

bool migrateLegacyPadSnapshotSource(KesshoProductSourceSnapshot& source) {
  if (source.exact_pad_param_count != kessho::core::KESSHO_LEGACY_SOURCE_PRESET_PAD_PARAM_COUNT) {
    return true;
  }
  if (source.source_id != KESSHO_PRODUCT_SOURCE_PAD1 && source.source_id != KESSHO_PRODUCT_SOURCE_PAD2) {
    return false;
  }
  // Legacy exact patches and sparse overrides were mutually exclusive. Keep
  // that invariant while moving the old 52-value block into the current
  // reconstructable sparse representation.
  if (source.pad_override_count != 0u) {
    return false;
  }
  std::array<float, kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT> converted{};
  if (!kessho::core::convertLegacyPadPresetParams(source.exact_pad_params, converted.data())) {
    return false;
  }
  source.exact_pad_param_count = 0u;
  source.pad_override_count = kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
  for (uint32_t index = 0u; index < source.pad_override_count; ++index) {
    if (!std::isfinite(converted[index])) {
      return false;
    }
    source.pad_override_indices[index] = index;
    source.pad_override_values[index] = converted[index];
    source.exact_pad_params[index] = 0.0f;
  }
  return true;
}

bool loadFxGraphSnapshot(
    kessho::product::internal::RoutingState& routing,
    const KesshoProductRoutingSnapshot& snapshot,
    const KesshoProductFxSnapshot& fx) {
  using namespace kessho::product::internal;
  static_assert(KESSHO_PRODUCT_FX_NODE_COUNT == kFxNodeCount, "FX snapshot node count drifted from runtime graph");
  RoutingState next = routing;
  next.clearFxGraph();
  next.delay_a_to_delay_b_feedback = 0.0f;
  next.delay_b_to_delay_a_feedback = 0.0f;

  const auto load_restricted_delay_feedback = [&next, &snapshot]() {
    if (!std::isfinite(snapshot.delay_a_to_delay_b) || !std::isfinite(snapshot.delay_b_to_delay_a) ||
        snapshot.delay_a_to_delay_b <= 0.0001f || snapshot.delay_b_to_delay_a <= 0.0001f) {
      return;
    }
    (void)next.setFxRoute(kFxNodeDelayA, kFxNodeDelayB, 0.0f, false);
    (void)next.setFxRoute(kFxNodeDelayB, kFxNodeDelayA, 0.0f, false);
    next.delay_a_to_delay_b_feedback = clampFloat(snapshot.delay_a_to_delay_b, 0.0f, 1.0f);
    next.delay_b_to_delay_a_feedback = clampFloat(snapshot.delay_b_to_delay_a, 0.0f, 1.0f);
  };

  const auto add_legacy = [&next](uint8_t from, uint8_t to, float amount) {
    if (!std::isfinite(amount) || amount <= 0.0001f) return;
    (void)next.setFxRoute(from, to, clampFloat(amount, 0.0f, 4.0f), true);
  };
  if (snapshot.fx_graph_version == 0u) {
    // Preserve the old forward render order. Any reverse edge that would close
    // a cycle is intentionally dropped during this one-way migration.
    add_legacy(kFxNodeDelayA, kFxNodeDelayB, snapshot.delay_a_to_delay_b);
    add_legacy(kFxNodeDelayA, kFxNodeGranular, snapshot.delay_a_to_granular);
    add_legacy(kFxNodeDelayA, kFxNodeDegrade, snapshot.delay_a_to_degrade);
    add_legacy(kFxNodeDelayA, kFxNodeReverb, snapshot.delay_to_reverb);
    add_legacy(kFxNodeDelayB, kFxNodeGranular, snapshot.delay_b_to_granular);
    add_legacy(kFxNodeDelayB, kFxNodeDegrade, snapshot.delay_b_to_degrade);
    add_legacy(kFxNodeDelayB, kFxNodeReverb, snapshot.delay_b_to_reverb);
    add_legacy(kFxNodeDelayB, kFxNodeDelayA, snapshot.delay_b_to_delay_a);
    add_legacy(kFxNodeGranular, kFxNodeDegrade, snapshot.granular_to_degrade);
    add_legacy(kFxNodeGranular, kFxNodeReverb, snapshot.granular_to_reverb);
    add_legacy(kFxNodeGranular, kFxNodeDelayA, snapshot.granular_to_delay_a);
    add_legacy(kFxNodeGranular, kFxNodeDelayB, snapshot.granular_to_delay_b);
    add_legacy(kFxNodeDegrade, kFxNodeReverb, snapshot.degrade_to_reverb);
    add_legacy(kFxNodeReverb, kFxNodeDegrade, snapshot.reverb_to_degrade);
    if (fx.spectral_freeze_routing == 0u) {
      add_legacy(kFxNodeFreeze, kFxNodeReverb, fx.spectral_freeze_reverb_crossfade);
    } else {
      add_legacy(kFxNodeReverb, kFxNodeFreeze, 1.0f);
    }
    next.fx_dynamics_bus[kFxNodeDelayA] = clampU32(snapshot.dynamics_delay_a_bus, kDynamicsBusSkip, kDynamicsBusSidechain);
    next.fx_dynamics_bus[kFxNodeDelayB] = clampU32(snapshot.dynamics_delay_b_bus, kDynamicsBusSkip, kDynamicsBusSidechain);
    next.fx_dynamics_bus[kFxNodeDegrade] = clampU32(snapshot.dynamics_degrade_bus, kDynamicsBusSkip, kDynamicsBusSidechain);
    next.fx_dynamics_bus[kFxNodeReverb] = clampU32(snapshot.dynamics_reverb_bus, kDynamicsBusSkip, kDynamicsBusSidechain);
    load_restricted_delay_feedback();
    next.syncLegacyFxRoutes();
    routing = next;
    return true;
  }
  if (snapshot.fx_graph_version != KESSHO_PRODUCT_FX_GRAPH_VERSION) return false;

  constexpr uint32_t valid_mask = (1u << kFxNodeCount) - 1u;
  for (uint8_t from = 0u; from < kFxNodeCount; ++from) {
    const uint32_t mask = snapshot.fx_edge_mask[from];
    if ((mask & ~valid_mask) != 0u || (mask & (1u << from)) != 0u) return false;
    next.fx_dynamics_bus[from] = clampU32(snapshot.fx_dynamics_bus[from], kDynamicsBusSkip, kDynamicsBusSidechain);
    for (uint8_t to = 0u; to < kFxNodeCount; ++to) {
      const uint32_t edge = from * kFxNodeCount + to;
      const float amount = snapshot.fx_route_amount[edge];
      if (!std::isfinite(amount) || amount < 0.0f || amount > 4.0f) return false;
      if ((mask & (1u << to)) == 0u) continue;
      if (!next.setFxRoute(from, to, amount, true)) return false;
      const uint32_t modulation = snapshot.fx_route_modulation[edge];
      const uint8_t mode = static_cast<uint8_t>(modulation & 0x3u);
      const float min_value = static_cast<float>((modulation >> 2u) & 0x7fffu) * (4.0f / 32767.0f);
      const float max_value = static_cast<float>((modulation >> 17u) & 0x7fffu) * (4.0f / 32767.0f);
      if (min_value > max_value) return false;
      next.setFxRouteModulation(from, to, mode, min_value, max_value);
    }
  }
  load_restricted_delay_feedback();
  next.syncLegacyFxRoutes();
  routing = next;
  return true;
}

struct SequencerLaneRuntimePhase {
  uint64_t emitted_hit_count = 0u;
  uint64_t sequencer_runtime_sample_frame = 0u;
  int64_t sequencer_start_sample_frame = 0;
};

double wrappedAngleDistance(double left, double right) {
  using namespace kessho::product::internal;
  const double diff = std::fmod(std::abs(left - right), kTwoPi);
  return std::min(diff, kTwoPi - diff);
}

bool anglesMatch(double left, double right) {
  return wrappedAngleDistance(left, right) < 1.0e-5;
}

bool orbitAuthoredTimingMatches(
    const kessho::product::internal::OrbitSequencerState& orbit,
    const KesshoProductOrbitSequencerSnapshot& snapshot) {
  using namespace kessho::product::internal;
  if (!anglesMatch(orbit.authored_base_angle, wrapRadians(snapshot.base_angle))) {
    return false;
  }
  const uint32_t next_note_count = clampU32(snapshot.note_count, 0u, kMaxOrbitSequencerNotes);
  if (orbit.note_count != next_note_count) {
    return false;
  }
  for (uint32_t note_index = 0u; note_index < next_note_count; ++note_index) {
    if (!anglesMatch(orbit.notes[note_index].authored_phase, wrapRadians(snapshot.notes[note_index].phase))) {
      return false;
    }
  }
  return true;
}

} // namespace

namespace kessho::product::internal {

namespace {

void appendUniqueInterval(float* intervals, uint32_t& count, float value) {
  for (uint32_t index = 0u; index < count; ++index) {
    if (intervals[index] == value) return;
  }
  if (count < 8u) intervals[count++] = value;
}

void replaceOrAppendInterval(
    float* intervals,
    uint32_t& count,
    float first,
    float second,
    float replacement) {
  for (uint32_t index = 0u; index < count; ++index) {
    if (intervals[index] != first && intervals[index] != second) continue;
    intervals[index] = replacement;
    return;
  }
  appendUniqueInterval(intervals, count, replacement);
}

} // namespace

uint32_t buildSemanticHarmonyVoicing(
    const HarmonyState& harmony,
    const HarmonyIntentRecipe& recipe,
    float root_midi,
    float* output) {
  if (recipe.present == 0u) return 0u;
  float intervals[8] = {0.0f, 4.0f, 7.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
  uint32_t count = 3u;
  switch (recipe.quality) {
    case 0u: {
      const uint32_t scale_count = std::max(1u, harmony.cached_scale_degree_count);
      const uint32_t degrees[4] = {0u, 2u, 4u, harmony.tension > 0.5f ? 6u : 7u};
      count = 4u;
      for (uint32_t index = 0u; index < count; ++index) {
        const uint32_t degree = degrees[index];
        intervals[index] = static_cast<float>(harmony.cached_scale_degree_map[degree % scale_count]) +
            (degree >= 7u ? 12.0f : 0.0f);
      }
      break;
    }
    case 1u: intervals[1] = 3.0f; intervals[2] = 6.0f; break; // dim
    case 2u: intervals[1] = 3.0f; break; // min
    case 4u: intervals[1] = 5.0f; intervals[2] = 7.0f; break; // sus
    case 5u: intervals[3] = 11.0f; count = 4u; break; // maj7
    case 6u: intervals[1] = 3.0f; intervals[3] = 10.0f; count = 4u; break; // min7
    case 7u: intervals[3] = 10.0f; count = 4u; break; // dom7
    case 8u: intervals[3] = 14.0f; count = 4u; break; // add9
    case 9u: intervals[3] = 9.0f; count = 4u; break; // six
    case 10u: intervals[3] = 9.0f; intervals[4] = 14.0f; count = 5u; break;
    case 11u: intervals[3] = 10.0f; intervals[4] = 14.0f; count = 5u; break;
    case 12u: intervals[1] = 5.0f; intervals[2] = 10.0f; intervals[3] = 15.0f; count = 4u; break; // quartal
    case 13u: intervals[1] = 1.0f; intervals[2] = 2.0f; intervals[3] = 4.0f; count = 4u; break; // cluster
    default: break;
  }
  const auto addExtension = [&](uint32_t bit, std::initializer_list<float> values) {
    if ((recipe.extension_mask & (1u << bit)) == 0u) return;
    for (const float value : values) appendUniqueInterval(intervals, count, value);
  };
  addExtension(0u, {9.0f});
  addExtension(1u, {10.0f});
  addExtension(2u, {11.0f});
  addExtension(3u, {14.0f});
  addExtension(4u, {14.0f, 17.0f});
  addExtension(5u, {14.0f, 21.0f});
  addExtension(6u, {9.0f});
  addExtension(7u, {10.0f});
  addExtension(8u, {10.0f});
  addExtension(9u, {14.0f});
  addExtension(10u, {14.0f});
  addExtension(11u, {9.0f, 14.0f});
  addExtension(12u, {21.0f});

  const uint32_t alterations = recipe.alteration_mask;
  if ((alterations & (1u << 0u)) != 0u) replaceOrAppendInterval(intervals, count, 7.0f, 8.0f, 6.0f);
  if ((alterations & (1u << 1u)) != 0u) replaceOrAppendInterval(intervals, count, 7.0f, 6.0f, 8.0f);
  if ((alterations & (1u << 2u)) != 0u) replaceOrAppendInterval(intervals, count, 14.0f, 15.0f, 13.0f);
  if ((alterations & (1u << 3u)) != 0u) replaceOrAppendInterval(intervals, count, 14.0f, 13.0f, 15.0f);
  if ((alterations & (1u << 4u)) != 0u) replaceOrAppendInterval(intervals, count, 17.0f, 17.0f, 18.0f);
  if ((alterations & (1u << 5u)) != 0u) replaceOrAppendInterval(intervals, count, 21.0f, 21.0f, 20.0f);
  if ((alterations & (1u << 6u)) != 0u) for (uint32_t i = 0u; i < count; ++i) if (intervals[i] == 3.0f || intervals[i] == 4.0f) intervals[i] = -100.0f;
  if ((alterations & (1u << 7u)) != 0u) for (uint32_t i = 0u; i < count; ++i) if (intervals[i] >= 6.0f && intervals[i] <= 8.0f) intervals[i] = -100.0f;

  uint32_t output_count = 0u;
  if (recipe.bass_mode == 1u) output[output_count++] = root_midi - 12.0f;
  if (recipe.bass_mode == 2u) output[output_count++] = root_midi - 5.0f;
  if (recipe.bass_mode == 3u && recipe.bass_note >= 0.0f) output[output_count++] = recipe.bass_note;
  for (uint32_t index = 0u; index < count && output_count < 8u; ++index) {
    if (intervals[index] < -50.0f) continue;
    output[output_count++] = root_midi + intervals[index] + (index >= 3u && recipe.spread > 0.66f ? 12.0f : 0.0f);
  }
  std::sort(output, output + output_count);
  if (recipe.inversion > 0) {
    for (int32_t index = 0; index < recipe.inversion && output_count > 1u; ++index) {
      const float moved = output[0];
      for (uint32_t note = 1u; note < output_count; ++note) output[note - 1u] = output[note];
      output[output_count - 1u] = moved + 12.0f;
    }
  } else if (recipe.inversion < 0) {
    for (int32_t index = 0; index < -recipe.inversion && output_count > 1u; ++index) {
      const float moved = output[output_count - 1u];
      for (uint32_t note = output_count - 1u; note > 0u; --note) output[note] = output[note - 1u];
      output[0] = moved - 12.0f;
    }
  }
  std::sort(output, output + output_count);
  uint32_t unique_count = 0u;
  for (uint32_t index = 0u; index < output_count; ++index) {
    if (unique_count == 0u || output[index] != output[unique_count - 1u]) output[unique_count++] = output[index];
  }
  return unique_count;
}

} // namespace kessho::product::internal

void KesshoProductEngine::rebuildHarmonyAuthorityCache() {
  harmony.authority_revision += 1u;
  int intervals[kMaxScaleNotes]{};
  harmony.cached_scale_degree_count = std::min<uint32_t>(scaleIntervals(harmony.scale_id, intervals), 7u);
  for (uint32_t index = 0u; index < 7u; ++index) {
    harmony.cached_scale_degree_map[index] = index < harmony.cached_scale_degree_count
        ? static_cast<uint32_t>(std::max(0, intervals[index]))
        : 0u;
    harmony.cached_recipe_ids[index] = index < harmony.canonical_progression_event_count
        ? harmony.canonical_progression_slot_id[index]
        : index;
  }
  if (harmony.morph_endpoint_count >= 2u) {
    const float phase = clampFloat(harmony.morph_plan_phase, 0.0f, 1.0f);
    harmony.root_midi = phase < 0.5f
        ? harmony.morph_endpoint_root_midi[0]
        : harmony.morph_endpoint_root_midi[1];
    harmony.tension = harmony.morph_endpoint_tension[0] +
        (harmony.morph_endpoint_tension[1] - harmony.morph_endpoint_tension[0]) * phase;
    harmony.scale_id = phase < 0.5f ? harmony.morph_endpoint_scale_id[0] : harmony.morph_endpoint_scale_id[1];
    if (harmony.morph_cof_root_path_count >= 2u) {
      const uint32_t last = harmony.morph_cof_root_path_count - 1u;
      const float pathPosition = phase * static_cast<float>(last);
      const uint32_t pathIndex = std::min(last, static_cast<uint32_t>(std::round(pathPosition)));
      harmony.root_midi = harmony.morph_cof_root_path[pathIndex];
    }
    if (harmony.morph_scale_handover_from != harmony.morph_scale_handover_to) {
      harmony.scale_id = phase < harmony.morph_scale_handover_at
          ? harmony.morph_scale_handover_from
          : harmony.morph_scale_handover_to;
    }
    harmony.cached_scale_degree_count = std::min<uint32_t>(scaleIntervals(harmony.scale_id, intervals), 7u);
    for (uint32_t index = 0u; index < harmony.cached_scale_degree_count; ++index) {
      harmony.cached_scale_degree_map[index] = static_cast<uint32_t>(std::max(0, intervals[index]));
    }
  }
  harmony.cached_voice_leading_candidate_count = 0u;
  for (uint32_t slot = 0u; slot < 8u; ++slot) {
    const uint32_t count = std::min<uint32_t>(arrangement.harmony_slot_note_count[slot], 8u);
    harmony.cached_voice_leading_candidate_note_counts[slot] = count;
    float semantic_root = harmony.root_midi;
    // Native playback owns semantic intent resolution.  Captured/exact rows
    // remain untouched, while degree/absolute intent roots feed relative and
    // auto playback before the bounded candidate row is cached.
    if (harmony.slot_intent_present[slot] != 0u) {
      const uint32_t root_mode = harmony.slot_intent_root_mode[slot];
      if (root_mode == 0u && harmony.cached_scale_degree_count > 0u) {
        const uint32_t degree = static_cast<uint32_t>(std::max(0, harmony.slot_intent_degree[slot])) % harmony.cached_scale_degree_count;
        semantic_root += static_cast<float>(harmony.cached_scale_degree_map[degree]);
      } else {
        semantic_root = 60.0f + static_cast<float>(positiveModulo(static_cast<int>(std::round(harmony.slot_intent_root_note[slot])), 12u));
      }
      semantic_root += static_cast<float>(harmony.slot_intent_octave[slot] - 4) * 12.0f;
    }
    const float delta = semantic_root - harmony.slot_captured_root_midi[slot];
    const float movement_delta = harmony.root_midi - harmony.slot_captured_root_midi[slot];
    const bool exact = harmony.slot_playback_behavior[slot] == 2u ||
        (harmony.slot_playback_behavior[slot] == 0u && std::abs(movement_delta) <= 6.0f);
    float semantic_notes[8]{};
    const HarmonyIntentRecipe recipe{
      harmony.slot_intent_present[slot],
      harmony.slot_intent_quality[slot],
      harmony.slot_intent_inversion[slot],
      harmony.slot_intent_spread[slot],
      harmony.slot_intent_bass_mode[slot],
      harmony.slot_intent_bass_note[slot],
      harmony.slot_intent_extension_mask[slot],
      harmony.slot_intent_alteration_mask[slot],
    };
    const uint32_t semantic_count = !exact
        ? buildSemanticHarmonyVoicing(harmony, recipe, semantic_root, semantic_notes)
        : 0u;
    if (semantic_count > 0u) harmony.cached_voice_leading_candidate_note_counts[slot] = semantic_count;
    for (uint32_t note = 0u; note < 8u; ++note) {
      const float captured = note < count ? arrangement.harmony_slot_midi[slot * 8u + note] : 0.0f;
      harmony.cached_voice_leading_candidates[slot][note] = semantic_count > 0u
          ? (note < semantic_count ? semantic_notes[note] : 0.0f)
          : (exact ? captured : captured + delta);
    }
    if (count > 0u || semantic_count > 0u) harmony.cached_voice_leading_candidate_count = slot + 1u;
  }
  if (harmony.takeover_anchor_count == 0u) {
    harmony.takeover_anchor_count = std::min<uint32_t>(std::min(harmony.note_pool_count, harmony.next_note_pool_count), 12u);
    for (uint32_t index = 0u; index < 12u; ++index) {
      harmony.takeover_anchor_source[index] = index < harmony.takeover_anchor_count ? harmony.note_pool_midi[index] : 0.0f;
      harmony.takeover_anchor_target[index] = index < harmony.takeover_anchor_count ? harmony.next_note_pool_midi[index] : 0.0f;
      harmony.takeover_anchor_weight[index] = index < harmony.takeover_anchor_count
          ? 1.0f / std::max(1.0f, std::abs(harmony.takeover_anchor_target[index] - harmony.takeover_anchor_source[index])) : 0.0f;
    }
  }
}

int32_t KesshoProductEngine::loadSnapshot(const KesshoProductSnapshotV2& incoming_snapshot) {
  // Stored snapshots may carry the retired 52-value Pad exact block. Convert
  // it before the current-count and sparse-block validators run.
  auto normalized_snapshot = std::make_unique<KesshoProductSnapshotV2>(incoming_snapshot);
  KesshoProductSnapshotV2& snapshot = *normalized_snapshot;
  pending_phrase_timing_event_count = 0u;
  pending_phrase_timing_apply_frame = 0u;
  if (snapshot.version != KESSHO_PRODUCT_SNAPSHOT_VERSION) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_UNSUPPORTED_SNAPSHOT_VERSION;
    return KESSHO_PRODUCT_ERROR_UNSUPPORTED_SNAPSHOT_VERSION;
  }
  if (snapshot.schema_hash != KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH;
    return KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH;
  }
  for (uint32_t index = 0u; index < kSourceCount; ++index) {
    if (!migrateLegacyPadSnapshotSource(snapshot.sources[index])) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
  }
  for (const auto& automation : snapshot.sonic_runtime.source_morph) {
    if (automation.enabled > 1u ||
        (automation.enabled != 0u &&
         (automation.mode > 2u || !std::isfinite(automation.phrases_per_cycle) ||
          automation.phrases_per_cycle < 1.0f || automation.phrases_per_cycle > 4096.0f))) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
  }
  for (uint32_t i = 0; i < kSourceCount; ++i) {
    const KesshoProductSourceSnapshot& source = snapshot.sources[i];
    if (source.source_id != i + 1u || source.preset_id == 0u) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    }
    if (!validSourcePresetForSource(source.source_id, source.preset_id)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    const bool pad_source =
        source.source_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
        source.source_id == KESSHO_PRODUCT_SOURCE_PAD2;
    const bool lead_source =
        source.source_id == KESSHO_PRODUCT_SOURCE_LEAD1 ||
        source.source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
    const bool drum_source = source.source_id == KESSHO_PRODUCT_SOURCE_DRUM;
    if (
        !exactParamBlockEmpty(
            source.exact_pad_param_count,
            source.exact_pad_params,
            kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT) ||
        (pad_source && !generatedPadEndpointPatchValid(source))) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    if (
        !exactParamBlockEmpty(
            source.exact_lead_param_count,
            source.exact_lead_params,
            kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT) ||
        (lead_source && !generatedLeadEndpointPatchValid(source))) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    if (
        !exactParamBlockEmpty(
            source.exact_drum_param_count,
            source.exact_drum_params,
            kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    if (drum_source && !validGeneratedDrumVoicePresetIds(source)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    if (
        (!pad_source && source.pad_override_count != 0u) ||
        (pad_source && !validSparseOverrideBlock(
            source.pad_override_count,
            source.pad_override_indices,
            source.pad_override_values,
            kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT))) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    if (
        (!lead_source && source.lead_override_count != 0u) ||
        (lead_source && !validSparseOverrideBlock(
            source.lead_override_count,
            source.lead_override_indices,
            source.lead_override_values,
            kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT))) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
    if (
        (!drum_source && source.drum_override_count != 0u) ||
        (drum_source && !validSparseOverrideBlock(
            source.drum_override_count,
            source.drum_override_indices,
            source.drum_override_values,
            kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT))) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    }
  }
  const auto validate_lanes = [](const KesshoProductSequencerSnapshot& sequencer_snapshot) -> int32_t {
    if (sequencer_snapshot.lane_count > kMaxLaneCount) {
      return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    }
    for (uint32_t i = 0; i < sequencer_snapshot.lane_count; ++i) {
      const KesshoProductSequencerLaneSnapshot& lane = sequencer_snapshot.lanes[i];
      if (lane.target_source_id < 1u || lane.target_source_id > kSourceCount) {
        return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      }
      if (lane.enabled != 0u && (lane.step_count == 0u || lane.fill_count == 0u)) {
        return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      }
    }
    return KESSHO_PRODUCT_OK;
  };
  const int32_t synth_lane_validation = validate_lanes(snapshot.synth_euclid);
  if (synth_lane_validation != KESSHO_PRODUCT_OK) {
    telemetry.last_error_code = synth_lane_validation;
    return synth_lane_validation;
  }
  const int32_t drum_lane_validation = validate_lanes(snapshot.drum_euclid);
  if (drum_lane_validation != KESSHO_PRODUCT_OK) {
    telemetry.last_error_code = drum_lane_validation;
    return drum_lane_validation;
  }
  const bool was_transport_running = transport.running;
  const bool preserve_running_sequencer_runtime =
      snapshot_loaded_once && was_transport_running && snapshot.transport.running != 0u;
  transport.running = snapshot.transport.running != 0u;
  transport.bpm = clampFloat(snapshot.transport.bpm, 1.0f, 400.0f);
  transport.beats_per_bar = clampU32(snapshot.transport.beats_per_bar, 1u, 32u);
  transport.bars_per_phrase = clampU32(snapshot.transport.bars_per_phrase, 1u, 256u);
  float encoded_phrase_seconds = 0.0f;
  std::memcpy(&encoded_phrase_seconds, &snapshot.transport.reserved0, sizeof(encoded_phrase_seconds));
  transport.phrase_seconds = std::isfinite(encoded_phrase_seconds) && encoded_phrase_seconds > 0.0f
      ? clampFloat(encoded_phrase_seconds, 0.001f, 4096.0f)
      : static_cast<float>(
          (60.0 / static_cast<double>(transport.bpm)) *
          static_cast<double>(transport.beats_per_bar) *
          static_cast<double>(transport.bars_per_phrase));
  transport.transition_pending = false;
  transport.pending_apply_frame = 0u;
  transport.swing = clampFloat(snapshot.transport.swing, 0.0f, 1.0f);
  harmony.root_midi = clampFloat(snapshot.harmony.root_midi, 0.0f, 127.0f);
  harmony.scale_id = snapshot.harmony.scale_id == 0u ? 1u : snapshot.harmony.scale_id;
  harmony.tension = clampFloat(snapshot.harmony.tension, 0.0f, 1.0f);
  harmony.chord_mode = snapshot.harmony.chord_mode;
  harmony.voicing_mode = snapshot.harmony.voicing_mode;
  harmony.control_mode = snapshot.harmony.control_mode;
  harmony.control_strength = snapshot.harmony.control_strength;
  harmony.active_source = snapshot.harmony.active_source;
  harmony.active_slot_id = snapshot.harmony.active_slot_id;
  harmony.active_step_index = snapshot.harmony.active_step_index;
  harmony.manual_control_available = snapshot.harmony.manual_control_available != 0u;
  harmony.note_pool_count = std::min<uint32_t>(snapshot.harmony.note_pool_count, 8u);
  for (uint32_t i = 0; i < 8u; ++i) {
    harmony.note_pool_midi[i] = i < harmony.note_pool_count
        ? clampFloat(snapshot.harmony.note_pool_midi[i], 0.0f, 127.0f)
        : 0.0f;
  }
  harmony.bass_midi = snapshot.harmony.bass_midi < 0.0f ? -1.0f : clampFloat(snapshot.harmony.bass_midi, 0.0f, 127.0f);
  harmony.next_note_pool_count = std::min<uint32_t>(snapshot.harmony.next_note_pool_count, 8u);
  for (uint32_t i = 0; i < 8u; ++i) {
    harmony.next_note_pool_midi[i] = i < harmony.next_note_pool_count
        ? clampFloat(snapshot.harmony.next_note_pool_midi[i], 0.0f, 127.0f)
        : 0.0f;
  }
  harmony.next_source = snapshot.harmony.next_source;
  harmony.next_step_index = snapshot.harmony.next_step_index;
  harmony.chord_interval_seconds = std::isfinite(snapshot.harmony.chord_interval_seconds)
      ? clampFloat(snapshot.harmony.chord_interval_seconds, 0.0f, 4096.0f)
      : 0.0f;
  std::memcpy(harmony.seed_material, snapshot.harmony.seed_material, sizeof(harmony.seed_material));
  harmony.seed_material[sizeof(harmony.seed_material) - 1u] = '\0';
  harmony.next_phrase_index = static_cast<uint64_t>(snapshot.harmony.next_phrase_index_low) |
      (static_cast<uint64_t>(snapshot.harmony.next_phrase_index_high) << 32u);
  harmony.next_phrase_index = std::max<uint64_t>(1u, harmony.next_phrase_index);
  harmony.next_progression_phrase_index = static_cast<uint64_t>(snapshot.harmony.next_progression_phrase_index_low) |
      (static_cast<uint64_t>(snapshot.harmony.next_progression_phrase_index_high) << 32u);
  harmony.phrase_length_seconds = clampFloat(snapshot.harmony.phrase_length_seconds, 0.001f, 4096.0f);
  harmony.progression_phrase_seconds = clampFloat(snapshot.harmony.progression_phrase_seconds, 0.001f, 4096.0f);
  harmony.voicing_spread = clampFloat(snapshot.harmony.voicing_spread, 0.0f, 1.0f);
  harmony.requested_voicing_spread = harmony.voicing_spread;
  harmony.detune_cents = clampFloat(snapshot.harmony.detune_cents, 0.0f, 100.0f);
  harmony.scale_mode = snapshot.harmony.scale_mode == 1u ? 1u : 0u;
  harmony.phrases_until_change = std::max<uint32_t>(1u, snapshot.harmony.phrases_until_change);
  harmony.current_degree = std::max(-1, std::min(7, snapshot.harmony.current_degree));
  harmony.progression_enabled = snapshot.harmony.progression_enabled != 0u;
  for (uint32_t index = 0u; index < 8u; ++index) {
    harmony.progression_pattern[index] = std::max(0, std::min(7, snapshot.harmony.progression_pattern[index]));
  }
  harmony.progression_step_enabled_mask = snapshot.harmony.progression_step_enabled_mask & 0xffu;
  harmony.progression_steps = clampU32(snapshot.harmony.progression_steps, 1u, 8u);
  harmony.progression_step = snapshot.harmony.progression_step % harmony.progression_steps;
  const uint32_t phrase_multiplier = snapshot.harmony.progression_phrase_multiplier;
  harmony.progression_phrase_multiplier = phrase_multiplier == 2u || phrase_multiplier == 4u || phrase_multiplier == 8u
      ? phrase_multiplier
      : 1u;
  harmony.progression_phrase_counter = snapshot.harmony.progression_phrase_counter;
  for (uint32_t index = 0u; index < 8u; ++index) {
    arrangement.harmony_slot_note_count[index] = clampU32(snapshot.harmony.harmony_slot_note_count[index], 0u, 8u);
  }
  for (uint32_t index = 0u; index < 64u; ++index) {
    arrangement.harmony_slot_midi[index] = clampFloat(snapshot.harmony.harmony_slot_midi[index], 0.0f, 127.0f);
  }
  harmony.tension_arc_type = std::min<uint32_t>(snapshot.harmony.tension_arc_type, 2u);
  harmony.tension_arc_phrases_remaining = snapshot.harmony.tension_arc_phrases_remaining;
  harmony.cof_enabled = snapshot.harmony.cof_enabled != 0u;
  harmony.cof_current_step = std::max(-6, std::min(6, snapshot.harmony.cof_current_step));
  harmony.cof_phrase_counter = snapshot.harmony.cof_phrase_counter;
  harmony.cof_home_root = positiveModulo(snapshot.harmony.cof_home_root, 12u);
  harmony.cof_drift_rate = clampU32(snapshot.harmony.cof_drift_rate, 1u, 8u);
  harmony.cof_drift_direction = std::min<uint32_t>(snapshot.harmony.cof_drift_direction, 2u);
  harmony.cof_drift_range = clampU32(snapshot.harmony.cof_drift_range, 1u, 6u);
  harmony.canonical_progression_present = snapshot.harmony.canonical_progression_version == 1u;
  harmony.canonical_progression_enabled = harmony.canonical_progression_present && snapshot.harmony.canonical_progression_enabled != 0u;
  harmony.canonical_progression_event_count = clampU32(snapshot.harmony.canonical_progression_event_count, 1u, 64u);
  harmony.canonical_progression_current_event = snapshot.harmony.canonical_progression_current_event % harmony.canonical_progression_event_count;
  harmony.canonical_progression_bars_per_phrase = clampU32(snapshot.harmony.canonical_progression_bars_per_phrase, 1u, 16u);
  for (uint32_t index = 0u; index < 64u; ++index) {
    harmony.canonical_progression_source[index] = snapshot.harmony.canonical_progression_source[index] == 1u ? 1u : 0u;
    harmony.canonical_progression_slot_id[index] = std::min<uint32_t>(snapshot.harmony.canonical_progression_slot_id[index], 7u);
    harmony.canonical_progression_duration_unit[index] = snapshot.harmony.canonical_progression_duration_unit[index] == 0u ? 0u : 1u;
    const uint32_t duration = snapshot.harmony.canonical_progression_duration_value[index];
    harmony.canonical_progression_duration_value[index] = duration == 2u || duration == 4u || duration == 8u ? duration : 1u;
  }
  harmony.live_gesture_revision = snapshot.harmony.live_gesture_revision;
  for (uint32_t index = 0u; index < 8u; ++index) {
    harmony.slot_playback_behavior[index] = std::min<uint32_t>(snapshot.harmony.harmony_slot_playback_behavior[index], 2u);
    harmony.slot_intent_present[index] = snapshot.harmony.harmony_slot_intent_present[index] == 0u ? 0u : 1u;
    harmony.slot_intent_quality[index] = std::min<uint32_t>(snapshot.harmony.harmony_slot_intent_quality[index], 14u);
    harmony.slot_intent_root_mode[index] = std::min<uint32_t>(snapshot.harmony.harmony_slot_intent_root_mode[index], 2u);
    harmony.slot_intent_degree[index] = std::max(0, std::min(6, snapshot.harmony.harmony_slot_intent_degree[index]));
    harmony.slot_intent_root_note[index] = clampFloat(snapshot.harmony.harmony_slot_intent_root_note[index], 0.0f, 11.0f);
    harmony.slot_intent_inversion[index] = std::max(-4, std::min(4, snapshot.harmony.harmony_slot_intent_inversion[index]));
    harmony.slot_intent_spread[index] = clampFloat(snapshot.harmony.harmony_slot_intent_spread[index], 0.0f, 1.0f);
    harmony.slot_intent_octave[index] = std::max(0, std::min(8, snapshot.harmony.harmony_slot_intent_octave[index]));
    harmony.slot_intent_bass_mode[index] = std::min<uint32_t>(snapshot.harmony.harmony_slot_intent_bass_mode[index], 3u);
    harmony.slot_intent_bass_note[index] = clampFloat(snapshot.harmony.harmony_slot_intent_bass_note[index], -1.0f, 127.0f);
    harmony.slot_intent_extension_mask[index] = snapshot.harmony.harmony_slot_intent_extension_mask[index];
    harmony.slot_intent_alteration_mask[index] = snapshot.harmony.harmony_slot_intent_alteration_mask[index];
    harmony.slot_captured_root_midi[index] = clampFloat(snapshot.harmony.harmony_slot_captured_root_midi[index], 0.0f, 127.0f);
    harmony.slot_captured_scale_id[index] = snapshot.harmony.harmony_slot_captured_scale_id[index] == 0u ? 1u : snapshot.harmony.harmony_slot_captured_scale_id[index];
  }
  harmony.live_gesture_scope = snapshot.harmony.live_gesture_scope;
  harmony.live_gesture_target = snapshot.harmony.live_gesture_target;
  harmony.live_gesture_phase = snapshot.harmony.live_gesture_phase;
  harmony.live_gesture_playback_behavior = snapshot.harmony.live_gesture_playback_behavior;
  harmony.live_gesture_intent_present = snapshot.harmony.live_gesture_intent_present == 0u ? 0u : 1u;
  harmony.live_gesture_intent_quality = snapshot.harmony.live_gesture_intent_quality;
  harmony.live_gesture_intent_root_mode = snapshot.harmony.live_gesture_intent_root_mode;
  harmony.live_gesture_intent_degree = snapshot.harmony.live_gesture_intent_degree;
  harmony.live_gesture_intent_root_note = clampFloat(snapshot.harmony.live_gesture_intent_root_note, 0.0f, 11.0f);
  harmony.live_gesture_intent_inversion = std::max(-4, std::min(4, snapshot.harmony.live_gesture_intent_inversion));
  harmony.live_gesture_intent_spread = clampFloat(snapshot.harmony.live_gesture_intent_spread, 0.0f, 1.0f);
  harmony.live_gesture_intent_octave = std::max(0, std::min(8, snapshot.harmony.live_gesture_intent_octave));
  harmony.live_gesture_intent_bass_mode = std::min<uint32_t>(snapshot.harmony.live_gesture_intent_bass_mode, 3u);
  harmony.live_gesture_intent_bass_note = clampFloat(snapshot.harmony.live_gesture_intent_bass_note, -1.0f, 127.0f);
  harmony.live_gesture_intent_extension_mask = snapshot.harmony.live_gesture_intent_extension_mask;
  harmony.live_gesture_intent_alteration_mask = snapshot.harmony.live_gesture_intent_alteration_mask;
  harmony.live_gesture_captured_root_midi = clampFloat(snapshot.harmony.live_gesture_captured_root_midi, 0.0f, 127.0f);
  harmony.live_gesture_captured_scale_id = snapshot.harmony.live_gesture_captured_scale_id;
  harmony.live_gesture_revision = snapshot.harmony.live_gesture_revision;
  harmony.live_gesture_note_count = std::min<uint32_t>(snapshot.harmony.live_gesture_note_count, 8u);
  for (uint32_t index = 0u; index < 8u; ++index) harmony.live_gesture_notes[index] = index < harmony.live_gesture_note_count ? snapshot.harmony.live_gesture_notes[index] : 0.0f;
  harmony.live_gesture_expires_at_frame = static_cast<uint64_t>(snapshot.harmony.live_gesture_expires_at_frame_low) |
      (static_cast<uint64_t>(snapshot.harmony.live_gesture_expires_at_frame_high) << 32u);
  harmony.takeover_anchor_count = std::min<uint32_t>(snapshot.harmony.takeover_anchor_count, 12u);
  harmony.takeover_progress = clampFloat(snapshot.harmony.takeover_progress, 0.0f, 1.0f);
  harmony.takeover_target_root_midi = clampFloat(snapshot.harmony.takeover_target_root_midi, 0.0f, 127.0f);
  harmony.takeover_target_scale_id = snapshot.harmony.takeover_target_scale_id == 0u ? 1u : snapshot.harmony.takeover_target_scale_id;
  for (uint32_t index = 0u; index < 12u; ++index) {
    harmony.takeover_anchor_source[index] = snapshot.harmony.takeover_anchor_source[index];
    harmony.takeover_anchor_target[index] = snapshot.harmony.takeover_anchor_target[index];
    harmony.takeover_anchor_weight[index] = snapshot.harmony.takeover_anchor_weight[index];
  }
  harmony.morph_endpoint_count = std::min<uint32_t>(snapshot.harmony.morph_endpoint_count, 2u);
  for (uint32_t index = 0u; index < 2u; ++index) {
    harmony.morph_endpoint_root_midi[index] = clampFloat(snapshot.harmony.morph_endpoint_root_midi[index], 0.0f, 127.0f);
    harmony.morph_endpoint_scale_id[index] = snapshot.harmony.morph_endpoint_scale_id[index] == 0u ? 1u : snapshot.harmony.morph_endpoint_scale_id[index];
    harmony.morph_endpoint_tension[index] = clampFloat(snapshot.harmony.morph_endpoint_tension[index], 0.0f, 1.0f);
  }
  harmony.morph_plan_revision = snapshot.harmony.morph_plan_revision;
  harmony.morph_plan_phase = clampFloat(snapshot.harmony.morph_plan_phase, 0.0f, 1.0f);
  for (uint32_t index = 0u; index < 8u; ++index) harmony.morph_plan_slot_playback_behavior[index] = std::min<uint32_t>(snapshot.harmony.morph_plan_slot_playback_behavior[index], 2u);
  harmony.morph_common_pair_count = std::min<uint32_t>(snapshot.harmony.morph_common_pair_count, 8u);
  harmony.morph_voice_pair_count = std::min<uint32_t>(snapshot.harmony.morph_voice_pair_count, 8u);
  harmony.morph_unmatched_a_count = std::min<uint32_t>(snapshot.harmony.morph_unmatched_a_count, 8u);
  harmony.morph_unmatched_b_count = std::min<uint32_t>(snapshot.harmony.morph_unmatched_b_count, 8u);
  harmony.morph_cof_root_path_count = std::min<uint32_t>(snapshot.harmony.morph_cof_root_path_count, 13u);
  for (uint32_t index = 0u; index < 8u; ++index) {
    harmony.morph_common_pair_source[index] = snapshot.harmony.morph_common_pair_source[index]; harmony.morph_common_pair_target[index] = snapshot.harmony.morph_common_pair_target[index];
    harmony.morph_voice_pair_source[index] = snapshot.harmony.morph_voice_pair_source[index]; harmony.morph_voice_pair_target[index] = snapshot.harmony.morph_voice_pair_target[index];
    harmony.morph_unmatched_a[index] = snapshot.harmony.morph_unmatched_a[index]; harmony.morph_unmatched_b[index] = snapshot.harmony.morph_unmatched_b[index];
  }
  for (uint32_t index = 0u; index < 13u; ++index) {
    harmony.morph_cof_root_path[index] = snapshot.harmony.morph_cof_root_path[index];
  }
  harmony.morph_scale_handover_from = snapshot.harmony.morph_scale_handover_from == 0u ? 1u : snapshot.harmony.morph_scale_handover_from;
  harmony.morph_scale_handover_to = snapshot.harmony.morph_scale_handover_to == 0u ? 1u : snapshot.harmony.morph_scale_handover_to;
  harmony.morph_scale_handover_at = clampFloat(snapshot.harmony.morph_scale_handover_at, 0.0f, 1.0f);
  rebuildHarmonyAuthorityCache();
  // Canonical progression supersedes the legacy degree-pattern controls when
  // present; the legacy fields remain only for old snapshot compatibility.
  harmony.progression_enabled = harmony.canonical_progression_present
      ? harmony.canonical_progression_enabled
      : snapshot.harmony.progression_enabled != 0u;
  arrangement.chord_generator_enabled = snapshot.arrangement.chord_generator_enabled != 0u;
  arrangement.chord_generator_source_id = clampU32(snapshot.arrangement.chord_generator_source_id, 1u, kSourceCount);
  arrangement.chord_generator_voice_count = clampU32(snapshot.arrangement.chord_generator_voice_count, 1u, 8u);
  arrangement.lead_random_enabled = snapshot.arrangement.lead_random_enabled != 0u;
  arrangement.lead_random_source_id = clampU32(snapshot.arrangement.lead_random_source_id, 1u, kSourceCount);
  arrangement.lead_phrase_seconds = clampFloat(snapshot.arrangement.lead_phrase_seconds, 0.001f, 4096.0f);
  arrangement.lead_density = clampFloat(snapshot.arrangement.lead_density, 0.1f, 12.0f);
  arrangement.lead_octave = std::max(-1, std::min(2, snapshot.arrangement.lead_octave));
  arrangement.lead_octave_range = clampU32(snapshot.arrangement.lead_octave_range, 1u, 4u);
  arrangement.lead_hold_seconds = clampFloat(snapshot.arrangement.lead_hold_seconds, 0.02f, 24.0f);
  arrangement.lead_velocity_min = clampFloat(snapshot.arrangement.lead_velocity_min, 0.001f, 1.0f);
  arrangement.lead_velocity_max = clampFloat(snapshot.arrangement.lead_velocity_max, arrangement.lead_velocity_min, 1.0f);
  arrangement.rng_seed = snapshot.arrangement.rng_state == 0u ? 1u : snapshot.arrangement.rng_state;
  arrangement.wave_spread = clampFloat(snapshot.arrangement.wave_spread, 0.0f, 1.0f);
  arrangement.requested_wave_spread = arrangement.wave_spread;
  arrangement.synth_octave = std::max(-2, std::min(2, snapshot.arrangement.synth_octave));
  arrangement.requested_synth_octave = arrangement.synth_octave;
  arrangement.lead_chord_bias = clampFloat(snapshot.arrangement.lead_chord_bias, 0.0f, 1.0f);
  arrangement.synth_voice_mask = snapshot.arrangement.synth_voice_mask & 0xffu;
  arrangement.pad2_voice_assign = snapshot.arrangement.pad2_voice_assign & 0xffu;
  arrangement.pad_euclid_owned_voice_mask = snapshot.arrangement.pad_euclid_owned_voice_mask & 0xffu;
  arrangement.chord_generator_pad_split = snapshot.arrangement.chord_generator_pad_split != 0u;
  for (uint32_t source_index = 0u; source_index < 8u; ++source_index) {
    arrangement.source_hold_seconds[source_index] = clampFloat(
        snapshot.arrangement.source_hold_seconds[source_index], 0.02f, 24.0f);
  }
  arrangement.pad1_fit_envelope_to_chord = snapshot.arrangement.pad1_fit_envelope_to_chord != 0u;
  arrangement.pad2_fit_envelope_to_chord = snapshot.arrangement.pad2_fit_envelope_to_chord != 0u;
  arrangement.lead_initial_delay_seconds = clampFloat(snapshot.arrangement.lead_initial_delay_seconds, 0.0f, 4096.0f);
  master_gain = clampFloat(snapshot.master.gain, 0.0f, 1.5f);
  setMasterLimiterCeilingDb(snapshot.master.limiter_ceiling_db);
  rng_seed = snapshot.rng.seed == 0u ? 1u : snapshot.rng.seed;
  rng_state = snapshot.rng.state == 0u ? rng_seed : snapshot.rng.state;
  resetHarmonyClock();
  resetArrangementRuntime();
  sequencer_evolve_rng_stream_seed = 0u;
  sequencer_evolve_rng_stream_state = 0u;
  sequencer_evolve_rng_stream_initialized = false;
  evolution_amount = clampFloat(snapshot.evolution.amount, 0.0f, 1.0f);
  evolution_state = snapshot.evolution.state;
  journey_running = snapshot.journey.enabled != 0u;
  journey_phase = clampFloat(snapshot.journey.morph_phase, 0.0f, 1.0f);
  journey_rate_bars = clampFloat(snapshot.journey.morph_rate_bars, 0.25f, 128.0f);
  fx.granular_mix = clampFloat(snapshot.fx.granular_mix, 0.0f, 4.0f);
  fx.granular_enabled = snapshot.fx.granular_enabled != 0u;
  fx.granular_freeze = snapshot.fx.granular_freeze != 0u;
  fx.granular_freeze_with_feedback = snapshot.fx.granular_freeze_with_feedback != 0u;
  fx.granular_feedback = clampFloat(snapshot.fx.granular_feedback, 0.0f, 0.85f);
  fx.granular_feedback_lpf_hz = clampFloat(snapshot.fx.granular_feedback_lpf_hz, 200.0f, 12000.0f);
  fx.granular_reverb_lpf_hz = clampFloat(snapshot.fx.granular_reverb_lpf_hz, 200.0f, 12000.0f);
  fx.granular_output_lpf_hz = clampFloat(snapshot.fx.granular_output_lpf_hz, 200.0f, 12000.0f);
  fx.granular_buffer_seconds = clampFloat(snapshot.fx.granular_buffer_seconds, 1.0f, 32.0f);
  fx.granular_grain_shape = clampU32(snapshot.fx.granular_grain_shape, 0u, 3u);
  fx.granular_bus_diffusion = clampFloat(snapshot.fx.granular_bus_diffusion, 0.0f, 1.0f);
  fx.granular_timing_randomness = clampFloat(snapshot.fx.granular_timing_randomness, 0.0f, 1.0f);
  fx.granular_chord_bias = clampFloat(snapshot.fx.granular_chord_bias, 0.0f, 1.0f);
  fx.granular_quality = clampU32(snapshot.fx.granular_quality, 0u, 2u);
  fx.granular_max_grains = clampU32(snapshot.fx.granular_max_grains, 8u, 64u);
  fx.granular_spray_macro = clampFloat(snapshot.fx.granular_spray_macro, 0.0f, 1.0f);
  fx.granular_cloud_macro = clampFloat(snapshot.fx.granular_cloud_macro, 0.0f, 1.0f);
  fx.granular_pitch_macro = clampFloat(snapshot.fx.granular_pitch_macro, 0.0f, 1.0f);
  fx.granular_legacy_jitter_ms = clampFloat(snapshot.fx.granular_legacy_jitter_ms, 0.0f, 30.0f);
  fx.granular_legacy_probability = clampFloat(snapshot.fx.granular_legacy_probability, 0.0f, 1.0f);
  fx.granular_legacy_pitch_mode = clampU32(snapshot.fx.granular_legacy_pitch_mode, 0u, 1u);
  fx.granular_legacy_pitch_spread = clampFloat(snapshot.fx.granular_legacy_pitch_spread, 0.0f, 12.0f);
  fx.granular_legacy_max_grains = clampU32(snapshot.fx.granular_legacy_max_grains, 0u, 128u);
  fx.granular_legacy_feedback = clampFloat(snapshot.fx.granular_legacy_feedback, 0.0f, 0.35f);
  for (uint32_t i = 0; i < kGranularVoiceCount; ++i) {
    const KesshoProductGranularVoiceSnapshot& voice_snapshot = snapshot.fx.granular_voices[i];
    GranularVoiceState& voice = fx.granular_voices[i];
    voice.enabled = voice_snapshot.enabled != 0u;
    voice.mode = voice_snapshot.mode == 0u ? 0u : 1u;
    voice.slice = clampU32(voice_snapshot.slice, 0u, 15u);
    voice.speed = clampFloat(voice_snapshot.speed, 0.0f, 4.0f);
    voice.scan_rate = clampFloat(voice_snapshot.scan_rate, 0.25f, 4.0f);
    voice.reverse = voice_snapshot.reverse != 0u;
    voice.pitch = clampFloat(voice_snapshot.pitch, -24.0f, 24.0f);
    voice.write_follow = clampFloat(voice_snapshot.write_follow, 0.0f, 1.0f);
    voice.density = clampFloat(voice_snapshot.density, 1.0f, 64.0f);
    voice.grain_size_ms = clampFloat(voice_snapshot.grain_size_ms, 10.0f, 500.0f);
    voice.spray = clampFloat(voice_snapshot.spray, 0.0f, 1.0f);
    voice.position_spray = clampFloat(voice_snapshot.position_spray, 0.0f, 1.0f);
    voice.timing_spray = clampFloat(voice_snapshot.timing_spray, 0.0f, 1.0f);
    voice.lookback = clampFloat(voice_snapshot.lookback, 0.0f, 1.0f);
    voice.write_guard = clampFloat(voice_snapshot.write_guard, 0.0f, 1.0f);
    voice.pitch_mode = clampU32(voice_snapshot.pitch_mode, 0u, 5u);
    voice.pitch_spread = clampFloat(voice_snapshot.pitch_spread, 0.0f, 24.0f);
    voice.pitch_jitter_cents = clampFloat(voice_snapshot.pitch_jitter_cents, 0.0f, 50.0f);
    voice.pitch_quantize = clampFloat(voice_snapshot.pitch_quantize, 0.0f, 1.0f);
    voice.reverse_chance = clampFloat(voice_snapshot.reverse_chance, 0.0f, 1.0f);
    voice.bloom = clampFloat(voice_snapshot.bloom, 0.0f, 1.0f);
    voice.glide = clampFloat(voice_snapshot.glide, 0.0f, 1.0f);
    voice.cloud_style = clampU32(voice_snapshot.cloud_style, 0u, 5u);
    voice.anchor_pattern = clampU32(voice_snapshot.anchor_pattern, 0u, 3u);
    voice.loop_crossfade_ms = clampFloat(voice_snapshot.loop_crossfade_ms, 4.0f, 80.0f);
    voice.grain_octave_probability = clampFloat(voice_snapshot.grain_octave_probability, 0.0f, 1.0f);
    voice.attack_seconds = clampFloat(voice_snapshot.attack_seconds, 0.001f, 0.5f);
    voice.decay_seconds = clampFloat(voice_snapshot.decay_seconds, 0.01f, 4.0f);
    voice.gain = clampFloat(voice_snapshot.gain, 0.0f, 1.0f);
    voice.pan = clampFloat(voice_snapshot.pan, -1.0f, 1.0f);
    voice.blur = clampFloat(voice_snapshot.blur, 0.0f, 1.0f);
    voice.stereo_spread = clampFloat(voice_snapshot.stereo_spread, 0.0f, 1.0f);
    voice.position_lfo_rate = clampFloat(voice_snapshot.position_lfo_rate, 0.0f, 1.0f);
    voice.position_lfo_depth = clampFloat(voice_snapshot.position_lfo_depth, 0.0f, 1.0f);
    voice.pan_lfo_rate = clampFloat(voice_snapshot.pan_lfo_rate, 0.0f, 1.0f);
    voice.reverse_lfo_rate = clampFloat(voice_snapshot.reverse_lfo_rate, 0.0f, 1.0f);
    voice.record_lfo_rate = clampFloat(voice_snapshot.record_lfo_rate, 0.0f, 1.0f);
    voice.euclid_gated = voice_snapshot.euclid_gated != 0u;
    voice.euclid_muted = voice_snapshot.euclid_muted != 0u;
  }
  fx.delay_a_enabled = snapshot.fx.delay_a_enabled != 0u;
  fx.delay_a_time_left_ms = clampFloat(snapshot.fx.delay_a_time_left_ms, 10.0f, 5000.0f);
  fx.delay_a_time_right_ms = clampFloat(snapshot.fx.delay_a_time_right_ms, 10.0f, 5000.0f);
  fx.delay_a_feedback = clampFloat(snapshot.fx.delay_a_feedback, 0.0f, 0.95f);
  fx.delay_a_mix = clampFloat(snapshot.fx.delay_a_mix, 0.0f, 1.0f);
  fx.delay_a_filter_hz = clampFloat(snapshot.fx.delay_a_filter_hz, 200.0f, 12000.0f);
  fx.delay_a_filter_type = clampU32(snapshot.fx.delay_a_filter_type, 0u, 2u);
  fx.delay_a_mod_rate_hz = clampFloat(snapshot.fx.delay_a_mod_rate_hz, 0.0f, 5.0f);
  fx.delay_a_mod_depth_ms = clampFloat(snapshot.fx.delay_a_mod_depth_ms, 0.0f, 50.0f);
  fx.delay_a_ping_pong = snapshot.fx.delay_a_ping_pong != 0u;
  fx.delay_a_duck = clampFloat(snapshot.fx.delay_a_duck, 0.0f, 1.0f);
  fx.delay_a_width = clampFloat(snapshot.fx.delay_a_width, 0.0f, 1.0f);
  fx.delay_a_cross_feed_filter_hz = clampFloat(snapshot.fx.delay_a_cross_feed_filter_hz, 200.0f, 12000.0f);
  fx.delay_b_enabled = snapshot.fx.delay_b_enabled != 0u;
  fx.delay_b_activity = clampFloat(snapshot.fx.delay_b_activity, 0.0f, 1.0f);
  fx.delay_b_repeats = clampFloat(snapshot.fx.delay_b_repeats, 0.0f, 0.85f);
  fx.delay_b_base_time_ms = clampFloat(snapshot.fx.delay_b_base_time_ms, 20.0f, 5000.0f);
  fx.delay_b_tone = clampFloat(snapshot.fx.delay_b_tone, 0.0f, 1.0f);
  fx.delay_b_vibrato = clampFloat(snapshot.fx.delay_b_vibrato, 0.0f, 1.0f);
  fx.delay_b_mix = clampFloat(snapshot.fx.delay_b_mix, 0.0f, 1.0f);
  fx.delay_b_space_mode = clampU32(snapshot.fx.delay_b_space_mode, 0u, 2u);
  fx.delay_b_pattern = clampU32(snapshot.fx.delay_b_pattern, 0u, 3u);
  fx.delay_b_warp = clampU32(snapshot.fx.delay_b_warp, 0u, 3u);
  fx.delay_b_warp_intensity = clampFloat(snapshot.fx.delay_b_warp_intensity, 0.0f, 1.0f);
  fx.delay_b_spread = clampFloat(snapshot.fx.delay_b_spread, 0.0f, 1.0f);
  fx.delay_b_tape_head_mask = clampU32(snapshot.fx.delay_b_tape_head_mask, 0u, 15u);
  for (size_t index = 0; index < fx.delay_b_tape_head_levels.size(); ++index) {
    fx.delay_b_tape_head_levels[index] = clampFloat(snapshot.fx.delay_b_tape_head_levels[index], 0.0f, 1.0f);
    fx.delay_b_tape_head_pans[index] = clampFloat(snapshot.fx.delay_b_tape_head_pans[index], 0.0f, 1.0f);
  }
  fx.reverb_mix = clampFloat(snapshot.fx.reverb_mix, 0.0f, 1.0f);
  fx.reverb_type = clampU32(snapshot.fx.reverb_type, 0u, 5u);
  fx.reverb_quality = clampU32(snapshot.fx.reverb_quality, 0u, 2u);
  fx.reverb_decay = clampFloat(snapshot.fx.reverb_decay, 0.0f, 1.0f);
  fx.reverb_size = clampFloat(snapshot.fx.reverb_size, 0.5f, 10.0f);
  fx.reverb_damping = clampFloat(snapshot.fx.reverb_damping, 0.0f, 1.0f);
  fx.reverb_diffusion = clampFloat(snapshot.fx.reverb_diffusion, 0.0f, 1.0f);
  fx.reverb_modulation = clampFloat(snapshot.fx.reverb_modulation, 0.0f, 1.0f);
  fx.reverb_predelay_ms = clampFloat(snapshot.fx.reverb_predelay_ms, 0.0f, 100.0f);
  fx.reverb_width = clampFloat(snapshot.fx.reverb_width, 0.0f, 1.0f);
  fx.reverb_shimmer_amount = clampFloat(snapshot.fx.reverb_shimmer_amount, 0.0f, 1.0f);
  fx.reverb_shimmer_pitch = clampFloat(snapshot.fx.reverb_shimmer_pitch, -24.0f, 24.0f);
  fx.reverb_slow_rate_hz = clampFloat(snapshot.fx.reverb_slow_rate_hz, 0.01f, 0.2f);
  fx.reverb_slow_depth = clampFloat(snapshot.fx.reverb_slow_depth, 0.0f, 1.0f);
  fx.reverb_reverse_amount = clampFloat(snapshot.fx.reverb_reverse_amount, 0.0f, 1.0f);
  fx.reverb_reverse_length_sec = clampFloat(snapshot.fx.reverb_reverse_length_sec, 0.5f, 16.0f);
  fx.reverb_chorus_rate_hz = clampFloat(snapshot.fx.reverb_chorus_rate_hz, 0.05f, 2.0f);
  fx.reverb_chorus_depth = clampFloat(snapshot.fx.reverb_chorus_depth, 0.0f, 40.0f);
  fx.reverb_mod_character = clampU32(snapshot.fx.reverb_mod_character, 0u, 2u);
  fx.reverb_damp_low = clampFloat(snapshot.fx.reverb_damp_low, 0.0f, 1.0f);
  fx.reverb_damp_high = clampFloat(snapshot.fx.reverb_damp_high, 0.0f, 1.0f);
  fx.reverb_crossover_hz = clampFloat(snapshot.fx.reverb_crossover_hz, 100.0f, 6000.0f);
  fx.reverb_input_tone = clampFloat(snapshot.fx.reverb_input_tone, -1.0f, 1.0f);
  fx.reverb_shimmer_feedback = clampFloat(snapshot.fx.reverb_shimmer_feedback, 0.0f, 1.0f);
  fx.reverb_bloom = clampFloat(snapshot.fx.reverb_bloom, -1.0f, 1.0f);
  fx.reverb_warp = clampFloat(snapshot.fx.reverb_warp, 0.0f, 1.0f);
  fx.reverb_cross_feed = clampFloat(snapshot.fx.reverb_cross_feed, 0.0f, 1.0f);
  fx.reverb_early_reflections = clampFloat(snapshot.fx.reverb_early_reflections, 0.0f, 1.0f);
  fx.reverb_air_absorption = clampFloat(snapshot.fx.reverb_air_absorption, 0.0f, 1.0f);
  fx.reverb_saturation_mode = clampU32(snapshot.fx.reverb_saturation_mode, 0u, 2u);
  fx.reverb_transient_smooth = clampFloat(snapshot.fx.reverb_transient_smooth, 0.0f, 1.0f);
  fx.reverb_er_lp_freq = clampFloat(snapshot.fx.reverb_er_lp_freq, 200.0f, 12000.0f);
  fx.reverb_pre_comp_threshold = clampFloat(snapshot.fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
  fx.reverb_pre_comp_knee = clampFloat(snapshot.fx.reverb_pre_comp_knee, 0.0f, 40.0f);
  fx.reverb_pre_comp_ratio = clampFloat(snapshot.fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  fx.reverb_pre_comp_attack_ms = clampFloat(snapshot.fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
  fx.reverb_pre_comp_release_ms = clampFloat(snapshot.fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
  fx.reverb_pre_comp_makeup = clampFloat(snapshot.fx.reverb_pre_comp_makeup, 0.5f, 4.0f);
  fx.reverb_chord_wash = snapshot.fx.reverb_chord_wash != 0u;
  fx.reverb_resolution_bloom = snapshot.fx.reverb_resolution_bloom != 0u;
  fx.spectral_freeze_mix = clampFloat(snapshot.fx.spectral_freeze_mix, 0.0f, 1.0f);
  fx.spectral_freeze_enabled = snapshot.fx.spectral_freeze_enabled != 0u;
  // Stored presets sanitize transient capture state before encoding. Applying
  // live values here keeps an active capture alive across unrelated snapshots.
  fx.spectral_freeze_active = snapshot.fx.spectral_freeze_active != 0u;
  fx.spectral_freeze_mode = clampU32(snapshot.fx.spectral_freeze_mode, 0u, 3u);
  fx.spectral_freeze_capture_serial = snapshot.fx.spectral_freeze_capture_serial;
  fx.spectral_freeze_stretch_speed = clampFloat(snapshot.fx.spectral_freeze_stretch_speed, 0.0f, 1.0f);
  fx.spectral_freeze_direction = clampU32(snapshot.fx.spectral_freeze_direction, 0u, 2u);
  fx.spectral_freeze_position = clampFloat(snapshot.fx.spectral_freeze_position, 0.0f, 1.0f);
  fx.spectral_freeze_refresh = clampFloat(snapshot.fx.spectral_freeze_refresh, 0.0f, 1.0f);
  fx.spectral_freeze_input_sensitivity = clampFloat(snapshot.fx.spectral_freeze_input_sensitivity, 0.0f, 1.0f);
  fx.spectral_freeze_diffusion = clampFloat(snapshot.fx.spectral_freeze_diffusion, 0.0f, 1.0f);
  fx.spectral_freeze_tone = clampFloat(snapshot.fx.spectral_freeze_tone, -1.0f, 1.0f);
  fx.spectral_freeze_width = clampFloat(snapshot.fx.spectral_freeze_width, 0.0f, 1.0f);
  fx.spectral_freeze_sustain = clampFloat(snapshot.fx.spectral_freeze_sustain, 0.0f, 1.0f);
  fx.spectral_freeze_routing = clampU32(snapshot.fx.spectral_freeze_routing, 0u, 1u);
  fx.spectral_freeze_reverb_crossfade = clampFloat(snapshot.fx.spectral_freeze_reverb_crossfade, 0.0f, 1.0f);
  fx.dynamics_drive = clampFloat(snapshot.fx.dynamics_drive, 0.0f, 1.0f);
  fx.dynamics_master_saturation_enabled = snapshot.fx.dynamics_master_saturation_enabled != 0u;
  fx.dynamics_master_saturation_mode = clampU32(snapshot.fx.dynamics_master_saturation_mode, 0u, 4u);
  fx.dynamics_master_saturation_quality = clampU32(snapshot.fx.dynamics_master_saturation_quality, 0u, 2u);
  fx.dynamics_master_saturation_tone = clampFloat(snapshot.fx.dynamics_master_saturation_tone, 0.0f, 1.0f);
  fx.dynamics_master_saturation_bias = clampFloat(snapshot.fx.dynamics_master_saturation_bias, 0.0f, 1.0f);
  fx.dynamics_enabled = snapshot.fx.dynamics_enabled != 0u;
  fx.dynamics_drift_enabled = snapshot.fx.dynamics_drift_enabled != 0u;
  fx.dynamics_drift_mode = clampU32(snapshot.fx.dynamics_drift_mode, 0u, 2u);
  fx.dynamics_drift_quality = clampU32(snapshot.fx.dynamics_drift_quality, 0u, 2u);
  fx.dynamics_drift_anti_comb = clampFloat(snapshot.fx.dynamics_drift_anti_comb, 0.0f, 1.0f);
  fx.dynamics_drift_diffusion = clampFloat(snapshot.fx.dynamics_drift_diffusion, 0.0f, 1.0f);
  fx.dynamics_drift_mix = clampFloat(snapshot.fx.dynamics_drift_mix, 0.0f, 1.0f);
  fx.dynamics_drift_age = clampFloat(snapshot.fx.dynamics_drift_age, 0.0f, 1.0f);
  fx.dynamics_drift_bias = clampFloat(snapshot.fx.dynamics_drift_bias, 0.0f, 1.0f);
  fx.dynamics_drift_lpg_amount = clampFloat(snapshot.fx.dynamics_drift_lpg_amount, 0.0f, 1.0f);
  fx.dynamics_drift_resonance = clampFloat(snapshot.fx.dynamics_drift_resonance, 0.0f, 1.0f);
  fx.dynamics_drift_stereo = clampFloat(snapshot.fx.dynamics_drift_stereo, 0.0f, 1.0f);
  fx.dynamics_drift_env_follow = clampFloat(snapshot.fx.dynamics_drift_env_follow, 0.0f, 1.0f);
  fx.dynamics_drift_depth = clampFloat(snapshot.fx.dynamics_drift_depth, 0.0f, 1.0f);
  fx.dynamics_drift_rate = clampFloat(snapshot.fx.dynamics_drift_rate, 0.0f, 1.0f);
  fx.dynamics_drift_damp = clampFloat(snapshot.fx.dynamics_drift_damp, 0.0f, 1.0f);
  fx.dynamics_erosion_enabled = snapshot.fx.dynamics_erosion_enabled != 0u;
  fx.dynamics_erosion_quality = clampU32(snapshot.fx.dynamics_erosion_quality, 0u, 2u);
  fx.dynamics_erosion_event_amount = clampFloat(snapshot.fx.dynamics_erosion_event_amount, 0.0f, 1.0f);
  fx.dynamics_erosion_profile_amount = clampFloat(snapshot.fx.dynamics_erosion_profile_amount, 0.0f, 1.0f);
  fx.dynamics_erosion_dither_amount = clampFloat(snapshot.fx.dynamics_erosion_dither_amount, 0.0f, 1.0f);
  fx.dynamics_erosion_mix = clampFloat(snapshot.fx.dynamics_erosion_mix, 0.0f, 1.0f);
  fx.dynamics_erosion_age = clampFloat(snapshot.fx.dynamics_erosion_age, 0.0f, 1.0f);
  fx.dynamics_erosion_generation = clampFloat(snapshot.fx.dynamics_erosion_generation, 0.0f, 1.0f);
  fx.dynamics_erosion_alias = clampFloat(snapshot.fx.dynamics_erosion_alias, 0.0f, 1.0f);
  fx.dynamics_erosion_wow = clampFloat(snapshot.fx.dynamics_erosion_wow, 0.0f, 1.0f);
  fx.dynamics_erosion_flutter = clampFloat(snapshot.fx.dynamics_erosion_flutter, 0.0f, 1.0f);
  fx.dynamics_erosion_drift = clampFloat(snapshot.fx.dynamics_erosion_drift, 0.0f, 1.0f);
  fx.dynamics_erosion_wobble_speed = clampFloat(snapshot.fx.dynamics_erosion_wobble_speed, 0.0f, 1.0f);
  fx.dynamics_erosion_tone = clampFloat(snapshot.fx.dynamics_erosion_tone, 0.0f, 1.0f);
  fx.dynamics_degrade_hp = clampFloat(snapshot.fx.dynamics_degrade_hp, 0.0f, 1.0f);
  fx.dynamics_degrade_lp = clampFloat(snapshot.fx.dynamics_degrade_lp, 0.0f, 1.0f);
  fx.dynamics_erosion_noise = clampFloat(snapshot.fx.dynamics_erosion_noise, 0.0f, 1.0f);
  fx.dynamics_erosion_saturation = clampFloat(snapshot.fx.dynamics_erosion_saturation, 0.0f, 1.0f);
  fx.dynamics_erosion_corrosion = clampFloat(snapshot.fx.dynamics_erosion_corrosion, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_slow_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_slow_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_slow_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_slow_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_slow_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_slow_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_flutter_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_flutter_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_flutter_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_flutter_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_flutter_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_flutter_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_random_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_random_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_random_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_random_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_random_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_random_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_env_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_env_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_env_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_env_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_env_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_env_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_noise_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_noise_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_noise_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_noise_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_noise_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_noise_alias, 0.0f, 1.0f);
  fx.dynamics_saturation_enabled = snapshot.fx.dynamics_saturation_enabled != 0u;
  fx.dynamics_saturation_mode = clampU32(snapshot.fx.dynamics_saturation_mode, 0u, 4u);
  fx.dynamics_saturation_quality = clampU32(snapshot.fx.dynamics_saturation_quality, 0u, 2u);
  fx.dynamics_saturation_drive = clampFloat(snapshot.fx.dynamics_saturation_drive, 0.0f, 1.0f);
  fx.dynamics_saturation_tone = clampFloat(snapshot.fx.dynamics_saturation_tone, 0.0f, 1.0f);
  fx.dynamics_saturation_bias = clampFloat(snapshot.fx.dynamics_saturation_bias, 0.0f, 1.0f);
  fx.dynamics_end_comp_enabled = snapshot.fx.dynamics_end_comp_enabled != 0u;
  fx.dynamics_end_comp_mode = clampU32(snapshot.fx.dynamics_end_comp_mode, 0u, 4u);
  fx.dynamics_end_comp_threshold = clampFloat(snapshot.fx.dynamics_end_comp_threshold, -60.0f, 0.0f);
  fx.dynamics_end_comp_knee = clampFloat(snapshot.fx.dynamics_end_comp_knee, 0.0f, 40.0f);
  fx.dynamics_end_comp_ratio = clampFloat(snapshot.fx.dynamics_end_comp_ratio, 1.0f, 20.0f);
  fx.dynamics_end_comp_attack_ms = clampFloat(snapshot.fx.dynamics_end_comp_attack_ms, 0.1f, 100.0f);
  fx.dynamics_end_comp_release_ms = clampFloat(snapshot.fx.dynamics_end_comp_release_ms, 20.0f, 1500.0f);
  fx.dynamics_end_comp_makeup = clampFloat(snapshot.fx.dynamics_end_comp_makeup, 0.25f, 4.0f);
  fx.dynamics_end_comp_mix = clampFloat(snapshot.fx.dynamics_end_comp_mix, 0.0f, 1.0f);
  fx.dynamics_end_comp_detector_hp = clampFloat(snapshot.fx.dynamics_end_comp_detector_hp, 0.0f, 1.0f);
  fx.dynamics_end_comp_detector_tilt = clampFloat(snapshot.fx.dynamics_end_comp_detector_tilt, 0.0f, 1.0f);
  fx.dynamics_end_comp_auto_makeup = clampFloat(snapshot.fx.dynamics_end_comp_auto_makeup, 0.0f, 1.0f);
  fx.dynamics_end_comp_program_release = clampFloat(snapshot.fx.dynamics_end_comp_program_release, 0.0f, 1.0f);
  fx.dynamics_end_comp_peak_blend = clampFloat(snapshot.fx.dynamics_end_comp_peak_blend, 0.0f, 1.0f);
  fx.dynamics_end_comp_clarity = clampFloat(snapshot.fx.dynamics_end_comp_clarity, 0.0f, 1.0f);
  fx.dynamics_end_comp_two_band_amount = clampFloat(snapshot.fx.dynamics_end_comp_two_band_amount, 0.0f, 1.0f);
  fx.dynamics_end_comp_band_split = clampFloat(snapshot.fx.dynamics_end_comp_band_split, 0.0f, 1.0f);
  fx.dynamics_eq1_enabled = snapshot.fx.dynamics_eq1_enabled != 0u;
  fx.dynamics_eq1_input_gain_db = clampFloat(snapshot.fx.dynamics_eq1_input_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq1_output_gain_db = clampFloat(snapshot.fx.dynamics_eq1_output_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq1_mix = clampFloat(snapshot.fx.dynamics_eq1_mix, 0.0f, 1.0f);
  fx.dynamics_eq1_low_type = clampU32(snapshot.fx.dynamics_eq1_low_type, kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
  fx.dynamics_eq1_low_freq = clampFloat(snapshot.fx.dynamics_eq1_low_freq, 20.0f, 20000.0f);
  fx.dynamics_eq1_low_gain_db = clampFloat(snapshot.fx.dynamics_eq1_low_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq1_low_q = clampFloat(snapshot.fx.dynamics_eq1_low_q, 0.1f, 18.0f);
  fx.dynamics_eq1_low_slope = clampFloat(snapshot.fx.dynamics_eq1_low_slope, 0.25f, 1.0f);
  fx.dynamics_eq1_mid_freq = clampFloat(snapshot.fx.dynamics_eq1_mid_freq, 20.0f, 20000.0f);
  fx.dynamics_eq1_mid_gain_db = clampFloat(snapshot.fx.dynamics_eq1_mid_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq1_mid_q = clampFloat(snapshot.fx.dynamics_eq1_mid_q, 0.1f, 18.0f);
  fx.dynamics_eq1_high_type = clampU32(snapshot.fx.dynamics_eq1_high_type, kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
  fx.dynamics_eq1_high_freq = clampFloat(snapshot.fx.dynamics_eq1_high_freq, 20.0f, 20000.0f);
  fx.dynamics_eq1_high_gain_db = clampFloat(snapshot.fx.dynamics_eq1_high_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq1_high_q = clampFloat(snapshot.fx.dynamics_eq1_high_q, 0.1f, 18.0f);
  fx.dynamics_eq1_high_slope = clampFloat(snapshot.fx.dynamics_eq1_high_slope, 0.25f, 1.0f);
  fx.dynamics_eq2_enabled = snapshot.fx.dynamics_eq2_enabled != 0u;
  fx.dynamics_eq2_input_gain_db = clampFloat(snapshot.fx.dynamics_eq2_input_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq2_output_gain_db = clampFloat(snapshot.fx.dynamics_eq2_output_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq2_mix = clampFloat(snapshot.fx.dynamics_eq2_mix, 0.0f, 1.0f);
  fx.dynamics_eq2_low_type = clampU32(snapshot.fx.dynamics_eq2_low_type, kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
  fx.dynamics_eq2_low_freq = clampFloat(snapshot.fx.dynamics_eq2_low_freq, 20.0f, 20000.0f);
  fx.dynamics_eq2_low_gain_db = clampFloat(snapshot.fx.dynamics_eq2_low_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq2_low_q = clampFloat(snapshot.fx.dynamics_eq2_low_q, 0.1f, 18.0f);
  fx.dynamics_eq2_low_slope = clampFloat(snapshot.fx.dynamics_eq2_low_slope, 0.25f, 1.0f);
  fx.dynamics_eq2_mid_freq = clampFloat(snapshot.fx.dynamics_eq2_mid_freq, 20.0f, 20000.0f);
  fx.dynamics_eq2_mid_gain_db = clampFloat(snapshot.fx.dynamics_eq2_mid_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq2_mid_q = clampFloat(snapshot.fx.dynamics_eq2_mid_q, 0.1f, 18.0f);
  fx.dynamics_eq2_high_type = clampU32(snapshot.fx.dynamics_eq2_high_type, kDynamicsEqEdgeShelf, kDynamicsEqEdgeBell);
  fx.dynamics_eq2_high_freq = clampFloat(snapshot.fx.dynamics_eq2_high_freq, 20.0f, 20000.0f);
  fx.dynamics_eq2_high_gain_db = clampFloat(snapshot.fx.dynamics_eq2_high_gain_db, -24.0f, 24.0f);
  fx.dynamics_eq2_high_q = clampFloat(snapshot.fx.dynamics_eq2_high_q, 0.1f, 18.0f);
  fx.dynamics_eq2_high_slope = clampFloat(snapshot.fx.dynamics_eq2_high_slope, 0.25f, 1.0f);
  fx.sidechain_enabled = snapshot.fx.sidechain_enabled != 0u;
  fx.sidechain_key_a = clampU32(snapshot.fx.sidechain_key_a, kSidechainKeyOff, kSidechainKeyMembrane);
  fx.sidechain_key_b = clampU32(snapshot.fx.sidechain_key_b, kSidechainKeyOff, kSidechainKeyMembrane);
  fx.sidechain_key_a_weight = clampFloat(snapshot.fx.sidechain_key_a_weight, 0.0f, 1.0f);
  fx.sidechain_key_b_weight = clampFloat(snapshot.fx.sidechain_key_b_weight, 0.0f, 1.0f);
  fx.sidechain_amount = clampFloat(snapshot.fx.sidechain_amount, 0.0f, 1.0f);
  fx.sidechain_threshold = clampFloat(snapshot.fx.sidechain_threshold, -60.0f, 0.0f);
  fx.sidechain_ratio = clampFloat(snapshot.fx.sidechain_ratio, 1.0f, 20.0f);
  fx.sidechain_knee = clampFloat(snapshot.fx.sidechain_knee, 0.0f, 40.0f);
  fx.sidechain_attack_ms = clampFloat(snapshot.fx.sidechain_attack_ms, 0.1f, 100.0f);
  fx.sidechain_hold_ms = clampFloat(snapshot.fx.sidechain_hold_ms, 0.0f, 250.0f);
  fx.sidechain_release_ms = clampFloat(snapshot.fx.sidechain_release_ms, 20.0f, 1500.0f);
  fx.sidechain_makeup = clampFloat(snapshot.fx.sidechain_makeup, 0.25f, 4.0f);
  fx.sidechain_mix = clampFloat(snapshot.fx.sidechain_mix, 0.0f, 1.0f);
  fx.sidechain_curve = clampFloat(snapshot.fx.sidechain_curve, 0.0f, 1.0f);
  fx.sidechain_detector_hp = clampFloat(snapshot.fx.sidechain_detector_hp, 0.0f, 1.0f);
  fx.sidechain_detector_lp = clampFloat(snapshot.fx.sidechain_detector_lp, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainPad1] = clampFloat(snapshot.fx.sidechain_pad1_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainPad2] = clampFloat(snapshot.fx.sidechain_pad2_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainLead1] = clampFloat(snapshot.fx.sidechain_lead1_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainLead2] = clampFloat(snapshot.fx.sidechain_lead2_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainPiano] = clampFloat(snapshot.fx.sidechain_piano_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainGranular] = clampFloat(snapshot.fx.sidechain_granular_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainDelayA] = clampFloat(snapshot.fx.sidechain_delay_a_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainDelayB] = clampFloat(snapshot.fx.sidechain_delay_b_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainReverb] = clampFloat(snapshot.fx.sidechain_reverb_target, 0.0f, 1.0f);
  resetSidechainRuntime();
  if (!loadFxGraphSnapshot(routing, snapshot.routing, snapshot.fx)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
  }
  routing.degrade_return_level = clampFloat(snapshot.routing.degrade_return_level, 0.0f, 1.0f);
  routing.dynamics_routes[kDynamicsRoutePad1] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_pad1_bus));
  routing.dynamics_routes[kDynamicsRoutePad2] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_pad2_bus));
  routing.dynamics_routes[kDynamicsRouteLead1] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_lead1_bus));
  routing.dynamics_routes[kDynamicsRouteLead2] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_lead2_bus));
  routing.dynamics_routes[kDynamicsRoutePiano] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_piano_bus));
  routing.dynamics_routes[kDynamicsRouteDrum] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_drum_bus));
  routing.dynamics_routes[kDynamicsRouteGranular] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_granular_bus));
  routing.dynamics_routes[kDynamicsRouteWaves] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_waves_bus));
  routing.dynamics_routes[kDynamicsRouteWater] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_water_bus));
  routing.dynamics_routes[kDynamicsRouteInsects] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_insects_bus));
  routing.dynamics_routes[kDynamicsRouteNature] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_nature_bus));
  routing.dynamics_routes[kDynamicsRouteDelayA] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_delay_a_bus));
  routing.dynamics_routes[kDynamicsRouteDelayB] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_delay_b_bus));
  routing.dynamics_routes[kDynamicsRouteDegrade] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_degrade_bus));
  routing.dynamics_routes[kDynamicsRouteReverb] = normalizedDynamicsBus(static_cast<float>(snapshot.routing.dynamics_reverb_bus));
  resetReverbHarmonyCoupling();
  resetGranularPhraseRuntime();
  configureFxModules();

  const bool first_snapshot = !snapshot_loaded_once;
  if (first_snapshot) {
    granular_mix_gain = fx.granular_mix;
    granular_reverb_send_gain = routing.granular_to_reverb;
    granular_delay_a_send_gain = routing.granular_to_delay_a;
    granular_delay_b_send_gain = routing.granular_to_delay_b;
    granular_degrade_send_gain = routing.granular_to_degrade;
    granular_return_gain_frame = UINT64_MAX;
  }
  for (uint32_t i = 0; i < kSourceCount; ++i) {
    const KesshoProductSourceSnapshot& source = snapshot.sources[i];
    sources[i].source_id = source.source_id;
    setSourceEnabled(sources[i], source.enabled != 0u, first_snapshot);
    sources[i].preset_id = source.preset_id;
    sources[i].asset_id = source.asset_id;
    if (sources[i].last_missing_asset_id != source.asset_id) {
      sources[i].last_missing_asset_id = 0u;
    }
    sources[i].level = clampFloat(source.level, 0.0f, 1.5f);
    sources[i].morph = clampFloat(source.morph, 0.0f, 1.0f);
    sources[i].distance = clampFloat(source.distance, 0.0f, 1.0f);
    sources[i].expression = clampFloat(source.expression, 0.0f, 1.0f);
    sources[i].dry_gain = clampFloat(source.dry_gain, 0.0f, 2.0f);
    sources[i].reverb_send = clampFloat(source.reverb_send, 0.0f, 2.0f);
    sources[i].delay_a_send = clampFloat(source.delay_a_send, 0.0f, 2.0f);
    sources[i].delay_b_send = clampFloat(source.delay_b_send, 0.0f, 2.0f);
    sources[i].granular_send = clampFloat(source.granular_send, 0.0f, 2.0f);
    sources[i].degrade_send = clampFloat(source.degrade_send, 0.0f, 2.0f);
    sources[i].spectral_freeze_send = clampFloat(source.spectral_freeze_send, 0.0f, 2.0f);
    if (first_snapshot) {
      sources[i].granular_send_gain = sources[i].granular_send;
      sources[i].granular_send_gain_frame = UINT64_MAX;
    }
    sources[i].diffuse_send = clampFloat(source.diffuse_send, 0.0f, 2.0f);
    sources[i].post_lpf_hz = source.post_lpf_hz > 0.0f && std::isfinite(source.post_lpf_hz)
        ? clampFloat(source.post_lpf_hz, 20.0f, 20000.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
    sources[i].stereo_width = std::isfinite(source.stereo_width)
        ? clampFloat(source.stereo_width, 0.0f, 1.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
    sources[i].post_lpf_key_tracking = std::isfinite(source.post_lpf_key_tracking)
        ? clampFloat(source.post_lpf_key_tracking, 0.0f, 1.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING;
    sources[i].lead_vibrato_depth = std::isfinite(source.lead_vibrato_depth)
        ? clampFloat(source.lead_vibrato_depth, 0.0f, 1.0f)
        : 0.0f;
    sources[i].lead_vibrato_rate = std::isfinite(source.lead_vibrato_rate)
        ? clampFloat(source.lead_vibrato_rate, 0.0f, 1.0f)
        : 0.0f;
    sources[i].lead_glide = std::isfinite(source.lead_glide)
        ? clampFloat(source.lead_glide, 0.0f, 1.0f)
        : 0.0f;
    const bool lead_source =
        source.source_id == KESSHO_PRODUCT_SOURCE_LEAD1 ||
        source.source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
    const bool extended_envelope_source =
        isPadProductSource(source.source_id) || lead_source || isSampleProductSource(source.source_id);
    sources[i].attack_seconds = source.attack_seconds > 0.0f && std::isfinite(source.attack_seconds)
        ? clampFloat(source.attack_seconds, 0.001f, extended_envelope_source ? 16.0f : 2.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS;
    sources[i].decay_seconds = source.decay_seconds > 0.0f && std::isfinite(source.decay_seconds)
        ? clampFloat(source.decay_seconds, 0.01f, extended_envelope_source ? 8.0f : 4.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS;
    sources[i].sustain = std::isfinite(source.sustain)
        ? clampFloat(source.sustain, 0.0f, 1.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN;
    sources[i].hold_seconds = std::isfinite(source.hold_seconds)
        ? clampFloat(source.hold_seconds, 0.0f, lead_source ? 44.0f : 20.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
    sources[i].release_seconds = source.release_seconds > 0.0f && std::isfinite(source.release_seconds)
        ? clampFloat(source.release_seconds, 0.01f, extended_envelope_source ? 30.0f : 8.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS;
    sources[i].sample_library_id = source.sample_library_id == 0u ? kSampleLibraryPiano : source.sample_library_id;
    sources[i].sample_role_id = source.sample_role_id;
    sources[i].sample_articulation_id = source.sample_articulation_id;
    sources[i].sample_selection_mode =
        source.sample_selection_mode <= KESSHO_PRODUCT_SAMPLE_SELECTION_EXACT
            ? source.sample_selection_mode
            : KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
    sources[i].sample_dynamic_mode =
        source.sample_dynamic_mode <= KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY
            ? source.sample_dynamic_mode
            : KESSHO_PRODUCT_SAMPLE_DYNAMIC_VELOCITY;
    sources[i].sample_fixed_dynamic_id =
        source.sample_fixed_dynamic_id == 0u ? kSampleDynamicRegular : source.sample_fixed_dynamic_id;
    sources[i].sample_loop_enabled = source.sample_loop_enabled != 0u;
    sources[i].sample_max_voices = clampU32(source.sample_max_voices, 1u, 64u);
    sources[i].sample_variant_mode =
        source.sample_variant_mode <= KESSHO_PRODUCT_SAMPLE_VARIANT_ROUND_ROBIN
            ? source.sample_variant_mode
            : KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
    const bool pad_source =
        source.source_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
        source.source_id == KESSHO_PRODUCT_SOURCE_PAD2;
    sources[i].pad_override_count = pad_source ? source.pad_override_count : 0u;
    for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT; ++param_index) {
      const uint32_t override_index = source.pad_override_indices[param_index];
      sources[i].pad_override_indices[param_index] =
          param_index < sources[i].pad_override_count
              ? override_index
              : 0u;
      sources[i].pad_override_values[param_index] =
          param_index < sources[i].pad_override_count && std::isfinite(source.pad_override_values[param_index])
              ? source.pad_override_values[param_index]
              : 0.0f;
    }
    sources[i].lead_override_count = lead_source ? source.lead_override_count : 0u;
    for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++param_index) {
      const uint32_t override_index = source.lead_override_indices[param_index];
      sources[i].lead_override_indices[param_index] =
          param_index < sources[i].lead_override_count
              ? override_index
              : 0u;
      sources[i].lead_override_values[param_index] =
          param_index < sources[i].lead_override_count && std::isfinite(source.lead_override_values[param_index])
              ? source.lead_override_values[param_index]
              : 0.0f;
    }
    const bool drum_source = source.source_id == KESSHO_PRODUCT_SOURCE_DRUM;
    sources[i].drum_override_count = drum_source ? source.drum_override_count : 0u;
    for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT; ++param_index) {
      const uint32_t override_index = source.drum_override_indices[param_index];
      sources[i].drum_override_indices[param_index] =
          param_index < sources[i].drum_override_count
              ? override_index
              : 0u;
      sources[i].drum_override_values[param_index] =
          param_index < sources[i].drum_override_count && std::isfinite(source.drum_override_values[param_index])
              ? source.drum_override_values[param_index]
              : 0.0f;
    }
    if (sources[i].source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
      sources[i].soundscape_texture_param_count =
          std::min<uint32_t>(snapshot.soundscape_texture_param_count, kSoundscapeTextureParamCount);
      for (uint32_t param_index = 0; param_index < kSoundscapeTextureParamCount; ++param_index) {
        sources[i].soundscape_texture_params[param_index] =
            param_index < sources[i].soundscape_texture_param_count
                ? (std::isfinite(snapshot.soundscape_texture_params[param_index])
                      ? snapshot.soundscape_texture_params[param_index]
                      : 0.0f)
                : 0.0f;
      }
      sources[i].soundscape_module_param_count =
          std::min<uint32_t>(snapshot.soundscape_module_param_count, kSoundscapeProductModuleParamCount);
      for (uint32_t param_index = 0; param_index < kSoundscapeProductModuleParamCount; ++param_index) {
        sources[i].soundscape_module_params[param_index] =
            param_index < sources[i].soundscape_module_param_count
                ? (std::isfinite(snapshot.soundscape_module_params[param_index])
                      ? snapshot.soundscape_module_params[param_index]
                      : 0.0f)
                : 0.0f;
      }
    }
    for (uint32_t voice_index = 0; voice_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT; ++voice_index) {
      sources[i].drum_voice_preset_a_ids[voice_index] = source.drum_voice_preset_a_ids[voice_index];
      sources[i].drum_voice_preset_b_ids[voice_index] = source.drum_voice_preset_b_ids[voice_index];
      sources[i].drum_voice_morphs[voice_index] = std::isfinite(source.drum_voice_morphs[voice_index])
          ? clampFloat(source.drum_voice_morphs[voice_index], 0.0f, 1.0f)
          : 0.0f;
    }
    sources[i].source_preset_a_id = source.source_preset_a_id;
    sources[i].source_preset_b_id = source.source_preset_b_id;
    sources[i].lead_envelope_override_enabled = source.lead_envelope_override_enabled != 0u;
    sources[i].lead_algorithm_preset_a_enabled = source.lead_algorithm_preset_a_enabled != 0u;
    compileSourcePresetRuntime(sources[i]);
    compileSourcePresetEndpoints(sources[i]);
    if (pad_source || lead_source || drum_source) {
      if (!applyStructuredSourceOverridesToModule(source.source_id)) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
        return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
      }
    }
  }
  SourceState& soundscape_source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  soundscape_source.asset_ref_count = 0;
  std::fill(soundscape_source.asset_refs, soundscape_source.asset_refs + kMaxSoundscapeAssetRefs, 0u);
  std::fill(soundscape_source.asset_ref_levels, soundscape_source.asset_ref_levels + kMaxSoundscapeAssetRefs, 0.0f);
  for (uint32_t ref_index = 0; ref_index < 32u && soundscape_source.asset_ref_count < kMaxSoundscapeAssetRefs; ++ref_index) {
    const uint32_t asset_id = snapshot.asset_refs[ref_index];
    if (asset_id == 0u) {
      continue;
    }
    const float asset_level = std::isfinite(snapshot.asset_ref_levels[ref_index])
        ? clampFloat(snapshot.asset_ref_levels[ref_index], 0.0f, 2.0f)
        : 1.0f;
    bool already_present = false;
    for (uint32_t i = 0; i < soundscape_source.asset_ref_count; ++i) {
      if (soundscape_source.asset_refs[i] == asset_id) {
        soundscape_source.asset_ref_levels[i] = std::max(soundscape_source.asset_ref_levels[i], asset_level);
        already_present = true;
      }
    }
    if (!already_present) {
      const uint32_t write_index = soundscape_source.asset_ref_count++;
      soundscape_source.asset_refs[write_index] = asset_id;
      soundscape_source.asset_ref_levels[write_index] = asset_level;
    }
  }
  if (soundscape_source.asset_ref_count == 0u && soundscape_source.asset_id != 0u) {
    soundscape_source.asset_refs[soundscape_source.asset_ref_count] = soundscape_source.asset_id;
    soundscape_source.asset_ref_levels[soundscape_source.asset_ref_count] = 1.0f;
    ++soundscape_source.asset_ref_count;
  }
  soundscape_source.last_missing_asset_id = 0u;
  configureSoundscapesModuleFromSource();

  synth_lane_count = std::min<uint32_t>(snapshot.synth_euclid.lane_count, kMaxLaneCount);
  drum_lane_count = std::min<uint32_t>(snapshot.drum_euclid.lane_count, kMaxLaneCount);
  loadLaneSnapshots(snapshot.synth_euclid, synth_lanes, KESSHO_PRODUCT_SOURCE_PAD1, preserve_running_sequencer_runtime);
  loadLaneSnapshots(snapshot.drum_euclid, drum_lanes, KESSHO_PRODUCT_SOURCE_DRUM, preserve_running_sequencer_runtime);
  for (uint32_t target_id = 0u; target_id < kProductSourceMorphAutomationCount; ++target_id) {
    const auto& automation = snapshot.sonic_runtime.source_morph[target_id];
    configureSourceMorphAutomation(
        target_id,
        automation.enabled != 0u,
        static_cast<ProductMorphMode>(automation.mode),
        automation.phrases_per_cycle,
        automation.seed);
  }
  if (!transport.running) {
    stopSoundscapeTransportRuntime();
  }
  markSequencerUiStateChanged(0u, 0xffffffffu, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_SNAPSHOT);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  snapshot_loaded_once = true;
  return KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::loadLaneSnapshots(
      const KesshoProductSequencerSnapshot& snapshot,
      LaneState* lanes,
      uint32_t fallback_source,
      bool preserve_running_runtime) {
  const uint32_t count = std::min<uint32_t>(snapshot.lane_count, kMaxLaneCount);
  for (uint32_t i = 0; i < count; ++i) {
    const KesshoProductSequencerLaneSnapshot& lane = snapshot.lanes[i];
    const KesshoProductAnchorWalkerSnapshot& walker_snapshot = snapshot.mode_states[i].anchor_walker;
    const uint32_t next_mode = clampU32(lane.sequencer_mode, kSequencerModeEuclid, kSequencerModeOrbit);
    const bool walker_timing_matches =
        next_mode != kSequencerModeAnchorWalker ||
        (lanes[i].anchor_walker.trigger_mode == clampU32(walker_snapshot.trigger_mode, 0u, 2u) &&
         lanes[i].anchor_walker.auto_rate == clampU32(walker_snapshot.auto_rate, 0u, 6u) &&
         lanes[i].anchor_walker.auto_feel == clampU32(walker_snapshot.auto_feel, 0u, 2u));
    const bool orbit_timing_matches =
        next_mode != kSequencerModeOrbit ||
        orbitAuthoredTimingMatches(lanes[i].orbit, snapshot.mode_states[i].orbit);
    const bool preserve_phase =
        preserve_running_runtime &&
        lanes[i].enabled &&
        lane.enabled != 0u &&
        lanes[i].sequencer_mode == next_mode &&
        lanes[i].sequencer_runtime_initialized &&
        lanes[i].step_count != 0u &&
        lanes[i].clock_division != 0u &&
        walker_timing_matches &&
        orbit_timing_matches;
    const SequencerLaneRuntimePhase preserved_phase{
        lanes[i].emitted_hit_count,
        lanes[i].sequencer_runtime_sample_frame,
        lanes[i].sequencer_start_sample_frame,
    };
    const int32_t preserved_walker_cursor_degree = lanes[i].anchor_walker.cursor_degree;
    const float preserved_walker_cursor_midi = lanes[i].anchor_walker.cursor_midi;
    const bool preserved_walker_cursor_valid = lanes[i].anchor_walker.cursor_valid;
    const float preserved_walker_anchor_midi = lanes[i].anchor_walker.anchor_midi;
    const bool preserved_walker_anchor_valid = lanes[i].anchor_walker.anchor_valid;
    const bool preserved_walker_gesture_held = lanes[i].anchor_walker.gesture_held;
    const int32_t preserved_walker_held_gesture_delta = lanes[i].anchor_walker.held_gesture_delta;
    const float preserved_walker_held_gesture_velocity = lanes[i].anchor_walker.held_gesture_velocity;
    const uint64_t preserved_walker_gesture_started_sample = lanes[i].anchor_walker.gesture_started_sample;
    const uint64_t preserved_walker_next_gesture_walk_sample = lanes[i].anchor_walker.next_gesture_walk_sample;
    const uint32_t preserved_walker_pending_gesture_steps = lanes[i].anchor_walker.pending_gesture_steps;
    const float preserved_walker_previous_cursor_midi = lanes[i].anchor_walker.previous_cursor_midi;
    const int32_t preserved_walker_last_gesture_delta = lanes[i].anchor_walker.last_gesture_delta;
    const uint32_t preserved_walker_boundary_event = lanes[i].anchor_walker.boundary_event;
    const uint64_t preserved_walker_runtime_sample_frame = lanes[i].anchor_walker.runtime_sample_frame;
    const uint64_t preserved_walker_next_walk_sample = lanes[i].anchor_walker.next_walk_sample;
    const bool preserved_walker_runtime_initialized = lanes[i].anchor_walker.runtime_initialized;
    const float preserved_orbit_base_angle = lanes[i].orbit.base_angle;
    const float preserved_orbit_prev_base_angle = lanes[i].orbit.prev_base_angle;
    const uint64_t preserved_orbit_runtime_sample_frame = lanes[i].orbit.runtime_sample_frame;
    const bool preserved_orbit_runtime_initialized = lanes[i].orbit.runtime_initialized;
    float preserved_orbit_note_angles[kMaxOrbitSequencerNotes]{};
    float preserved_orbit_note_prev_angles[kMaxOrbitSequencerNotes]{};
    for (uint32_t note_index = 0u; note_index < kMaxOrbitSequencerNotes; ++note_index) {
      preserved_orbit_note_angles[note_index] = lanes[i].orbit.notes[note_index].angle;
      preserved_orbit_note_prev_angles[note_index] = lanes[i].orbit.notes[note_index].prev_angle;
    }
    lanes[i].sequencer_mode = next_mode;
    lanes[i].enabled = lane.enabled != 0u;
    lanes[i].muted = lane.muted != 0u;
    (void) fallback_source;
    lanes[i].target_source_id = lane.target_source_id;
    const bool pad_lane =
        lane.target_source_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
        lane.target_source_id == KESSHO_PRODUCT_SOURCE_PAD2;
    lanes[i].step_count = clampU32(lane.step_count, 1u, 64u);
    lanes[i].fill_count = clampU32(lane.fill_count, 0u, lanes[i].step_count);
    lanes[i].rotation = lane.rotation;
    lanes[i].clock_division = clampU32(lane.clock_division, 1u, 128u);
    lanes[i].swing = clampFloat(lane.swing, 0.0f, 1.0f);
    lanes[i].probability = clampFloat(lane.probability, 0.0f, 1.0f);
    lanes[i].ratchet = clampU32(lane.ratchet, 1u, 8u);
    lanes[i].trig_condition = lane.trig_condition;
    lanes[i].midi_note = clampFloat(lane.midi_note, 0.0f, 127.0f);
    lanes[i].drum_voice_mask = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM
        ? drumVoiceMaskFromEncodedSeed(lane.seed)
        : 0u;
    lanes[i].target_pad_voice_index = pad_lane
        ? padVoiceIndexFromEncodedSeed(lane.seed)
        : kPadVoiceNoPreference;
    lanes[i].target_pad_voice_mask = pad_lane
        ? padVoiceMaskFromEncodedSeed(lane.seed)
        : 0u;
    lanes[i].velocity = clampFloat(lane.velocity, 0.0f, 1.0f);
    lanes[i].hold_seconds = clampFloat(lane.hold_seconds, 0.001f, 20.0f);
    lanes[i].morph = clampFloat(lane.morph, 0.0f, 1.0f);
    lanes[i].distance = clampFloat(lane.distance, 0.0f, 1.0f);
    lanes[i].expression = clampFloat(lane.expression, 0.0f, 1.0f);
    const uint32_t decoded_seed = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM
        ? laneSeedFromEncodedDrumVoiceMask(lane.seed)
        : (pad_lane ? laneSeedFromEncodedPadVoice(lane.seed) : lane.seed);
    lanes[i].seed = decoded_seed == 0u ? rng_seed + i + 1u : decoded_seed;
    lanes[i].bar_reset = lane.bar_reset != 0u;
    lanes[i].phrase_reset = lane.phrase_reset != 0u;
    lanes[i].tempo_multiplier = lane.tempo_multiplier > 0.0f
        ? clampFloat(lane.tempo_multiplier, 0.25f, 12.0f)
        : 1.0f;
    lanes[i].initial_start_delay_seconds =
        std::isfinite(lane.initial_start_delay_seconds) && lane.initial_start_delay_seconds >= 0.0f
            ? clampFloat(lane.initial_start_delay_seconds, 0.0f, 64.0f)
            : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_INITIAL_START_DELAY_SECONDS;
    lanes[i].manual_step_mask_low = lane.manual_step_mask_low;
    lanes[i].manual_step_mask_high = lane.manual_step_mask_high;
    AnchorWalkerState& walker = lanes[i].anchor_walker;
    walker.enabled = walker_snapshot.enabled != 0u;
    walker.mode = clampU32(walker_snapshot.mode, 0u, 2u);
    walker.play_mode = clampU32(walker_snapshot.play_mode, 0u, 2u);
    walker.target_source_id = clampU32(walker_snapshot.target_source_id, 1u, kSourceCount);
    walker.anchor_source = clampU32(walker_snapshot.anchor_source, 0u, 3u);
    walker.manual_anchor_midi = clampFloat(walker_snapshot.manual_anchor_midi, 0.0f, 127.0f);
    walker.snap_source = clampU32(walker_snapshot.snap_source, 0u, 4u);
    walker.custom_pitch_class_mask = static_cast<uint16_t>(
        clampU32(walker_snapshot.custom_pitch_class_mask, 1u, 0x0fffu));
    walker.trigger_mode = clampU32(walker_snapshot.trigger_mode, 0u, 2u);
    walker.boundary_mode = clampU32(walker_snapshot.boundary_mode, 0u, 2u);
    walker.keyboard_range = clampU32(walker_snapshot.keyboard_range, 0u, 1u);
    walker.show_linked_outputs = walker_snapshot.show_linked_outputs != 0u;
    walker.auto_rate = clampU32(walker_snapshot.auto_rate, 0u, 6u);
    walker.auto_feel = clampU32(walker_snapshot.auto_feel, 0u, 2u);
    walker.swing = clampFloat(walker_snapshot.swing, 0.0f, 0.75f);
    walker.lead_mode = walker_snapshot.lead_mode != 0u;
    walker.mw_to_velocity = walker_snapshot.mw_to_velocity != 0u;
    walker.pitch_wheel_walk = walker_snapshot.pitch_wheel_walk != 0u;
    for (uint32_t pattern_index = 0u; pattern_index < kMaxAnchorWalkerPatternSteps; ++pattern_index) {
      walker.gesture_pattern[pattern_index] = static_cast<int32_t>(
          clampInt(walker_snapshot.gesture_pattern[pattern_index], -7, 7));
    }
    walker.gesture_pattern_length =
        clampU32(walker_snapshot.gesture_pattern_length, 1u, kMaxAnchorWalkerPatternSteps);
    walker.active_pad_delta = static_cast<int32_t>(clampInt(walker_snapshot.active_pad_delta, -7, 7));
    walker.layer_preset = clampU32(walker_snapshot.layer_preset, 0u, 6u);
    walker.spread_seconds = clampFloat(walker_snapshot.spread_seconds, 0.0f, 0.5f);
    walker.layer_count = clampU32(walker_snapshot.layer_count, 1u, kMaxAnchorWalkerLayers);
    for (uint32_t layer_index = 0u; layer_index < kMaxAnchorWalkerLayers; ++layer_index) {
      const KesshoProductAnchorWalkerLayerSnapshot& layer_snapshot = walker_snapshot.layers[layer_index];
      AnchorWalkerLayerState& layer = walker.layers[layer_index];
      layer.enabled = layer_snapshot.enabled != 0u;
      layer.transpose_semitones = static_cast<int32_t>(clampInt(layer_snapshot.transpose_semitones, -48, 48));
      layer.diatonic_offset = static_cast<int32_t>(clampInt(layer_snapshot.diatonic_offset, -14, 14));
      layer.tuning = clampU32(layer_snapshot.tuning, 0u, 2u);
      layer.motion = clampU32(layer_snapshot.motion, 0u, 2u);
      layer.delay_seconds = clampFloat(layer_snapshot.delay_seconds, 0.0f, 0.5f);
      layer.gate_ratio = clampFloat(layer_snapshot.gate_ratio, 0.05f, 1.0f);
      layer.velocity_scale = clampFloat(layer_snapshot.velocity_scale, 0.0f, 2.0f);
      layer.velocity_offset = clampFloat(layer_snapshot.velocity_offset, -1.0f, 1.0f);
      layer.target_source_id = clampU32(layer_snapshot.target_source_id, 0u, kSourceCount);
    }
    walker.output_range_min = clampFloat(walker_snapshot.output_range_min, 0.0f, 127.0f);
    walker.output_range_max = clampFloat(walker_snapshot.output_range_max, walker.output_range_min, 127.0f);
    walker.seed = walker_snapshot.seed == 0u ? rng_seed + 1000u + i : walker_snapshot.seed;

    const KesshoProductOrbitSequencerSnapshot& orbit_snapshot = snapshot.mode_states[i].orbit;
    OrbitSequencerState& orbit = lanes[i].orbit;
    orbit.enabled = orbit_snapshot.enabled != 0u;
    orbit.target_source_id = clampU32(orbit_snapshot.target_source_id, 1u, kSourceCount);
    orbit.trigger_line_count = clampU32(orbit_snapshot.trigger_line_count, 1u, kMaxOrbitTriggerLines);
    orbit.clock_mode = orbit_snapshot.clock_mode > 0u ? 1u : 0u;
    orbit.bpm_percent = clampFloat(orbit_snapshot.bpm_percent, 1.0f, 800.0f);
    orbit.speed_offset = clampFloat(orbit_snapshot.speed_offset, -1.0f, 1.0f);
    orbit.global_offset = clampFloat(orbit_snapshot.global_offset, -1.0f, 1.0f);
    orbit.even_offset = clampFloat(orbit_snapshot.even_offset, -1.0f, 1.0f);
    orbit.free_offset = clampFloat(orbit_snapshot.free_offset, -1.0f, 1.0f);
    orbit.even_reverse_mode = orbit_snapshot.even_reverse_mode > 0u ? 1u : 0u;
    orbit.constellation_mode = clampU32(orbit_snapshot.constellation_mode, 0u, 5u);
    orbit.quantize_to_harmony = orbit_snapshot.quantize_to_harmony != 0u;
    orbit.snap_source = clampU32(orbit_snapshot.snap_source, 0u, 4u);
    orbit.pitch_range_min = clampFloat(orbit_snapshot.pitch_range_min, 0.0f, 127.0f);
    orbit.pitch_range_max = clampFloat(orbit_snapshot.pitch_range_max, orbit.pitch_range_min, 127.0f);
    orbit.spline_h1_x = clampFloat(orbit_snapshot.spline_h1_x, -1.2f, 1.2f);
    orbit.spline_h1_y = clampFloat(orbit_snapshot.spline_h1_y, -1.2f, 1.2f);
    orbit.spline_h2_x = clampFloat(orbit_snapshot.spline_h2_x, -1.2f, 1.2f);
    orbit.spline_h2_y = clampFloat(orbit_snapshot.spline_h2_y, -1.2f, 1.2f);
    orbit.spline_tip_x = clampFloat(orbit_snapshot.spline_tip_x, -1.2f, 1.2f);
    orbit.spline_tip_y = clampFloat(orbit_snapshot.spline_tip_y, -1.2f, 1.2f);
    orbit.spline_spin_enabled = orbit_snapshot.spline_spin_enabled != 0u;
    orbit.spline_spin_direction = orbit_snapshot.spline_spin_direction < 0 ? -1 : 1;
    orbit.base_angle = wrapRadians(orbit_snapshot.base_angle);
    orbit.prev_base_angle = orbit.base_angle;
    orbit.authored_base_angle = orbit.base_angle;
    orbit.note_count = clampU32(orbit_snapshot.note_count, 0u, kMaxOrbitSequencerNotes);
    orbit.seed = orbit_snapshot.seed == 0u ? rng_seed + 3000u + i : orbit_snapshot.seed;
    for (uint32_t note_index = 0u; note_index < kMaxOrbitSequencerNotes; ++note_index) {
      const KesshoProductOrbitNoteSnapshot& note_snapshot = orbit_snapshot.notes[note_index];
      OrbitNoteState& note = orbit.notes[note_index];
      note.enabled = note_snapshot.enabled != 0u;
      note.radius_norm = clampFloat(note_snapshot.radius_norm, 0.08f, 1.0f);
      note.angle = wrapRadians(note_snapshot.phase);
      note.prev_angle = note.angle;
      note.authored_phase = note.angle;
      note.speed_mode = note_snapshot.speed_mode > 0u ? 1u : 0u;
      note.speed_value = clampFloat(note_snapshot.speed_value, 0.125f, 800.0f);
      note.direction = note_snapshot.direction < 0 ? -1 : 1;
      note.pitch_mode = clampU32(note_snapshot.pitch_mode, 0u, 3u);
      note.midi_note = clampFloat(note_snapshot.midi_note, 0.0f, 127.0f);
      note.harmony_degree = static_cast<int32_t>(clampInt(note_snapshot.harmony_degree, -32, 32));
      note.pitch_range_min = clampFloat(note_snapshot.pitch_range_min, 0.0f, 127.0f);
      note.pitch_range_max = clampFloat(note_snapshot.pitch_range_max, note.pitch_range_min, 127.0f);
      note.velocity = clampFloat(note_snapshot.velocity, 0.0f, 1.0f);
      note.velocity_range_enabled = note_snapshot.velocity_range_enabled != 0u;
      note.velocity_min = clampFloat(note_snapshot.velocity_min, 0.0f, 1.0f);
      note.velocity_max = clampFloat(note_snapshot.velocity_max, note.velocity_min, 1.0f);
      note.gate_beats = clampFloat(note_snapshot.gate_beats, 0.05f, 8.0f);
      note.gate_range_enabled = note_snapshot.gate_range_enabled != 0u;
      note.gate_min_beats = clampFloat(note_snapshot.gate_min_beats, 0.05f, 8.0f);
      note.gate_max_beats = clampFloat(note_snapshot.gate_max_beats, note.gate_min_beats, 8.0f);
      note.probability = clampFloat(note_snapshot.probability, 0.0f, 1.0f);
      note.target_source_id = clampU32(note_snapshot.target_source_id, 0u, kSourceCount);
      note.seed = note_snapshot.seed == 0u ? rng_seed + 4000u + note_index + i * 31u : note_snapshot.seed;
      note.flash = 0.0f;
    }
    lanes[i].step_override_set_low = 0;
    lanes[i].step_override_set_high = 0;
    lanes[i].step_override_value_low = 0;
    lanes[i].step_override_value_high = 0;
    resetSequencerLaneRuntime(lanes[i], lanes[i].initial_start_delay_seconds >= 0.0f);
    if (preserve_phase) {
      lanes[i].emitted_hit_count = preserved_phase.emitted_hit_count;
      lanes[i].sequencer_runtime_sample_frame = preserved_phase.sequencer_runtime_sample_frame;
      lanes[i].sequencer_start_sample_frame = preserved_phase.sequencer_start_sample_frame;
      lanes[i].sequencer_runtime_initialized = true;
      lanes[i].sequencer_join_pending = false;
      if (lanes[i].sequencer_mode == kSequencerModeAnchorWalker) {
        lanes[i].anchor_walker.cursor_degree = preserved_walker_cursor_degree;
        lanes[i].anchor_walker.cursor_midi = preserved_walker_cursor_midi;
        lanes[i].anchor_walker.cursor_valid = preserved_walker_cursor_valid;
        lanes[i].anchor_walker.anchor_midi = preserved_walker_anchor_midi;
        lanes[i].anchor_walker.anchor_valid = preserved_walker_anchor_valid;
        lanes[i].anchor_walker.gesture_held = preserved_walker_gesture_held;
        lanes[i].anchor_walker.held_gesture_delta = preserved_walker_held_gesture_delta;
        lanes[i].anchor_walker.held_gesture_velocity = preserved_walker_held_gesture_velocity;
        lanes[i].anchor_walker.gesture_started_sample = preserved_walker_gesture_started_sample;
        lanes[i].anchor_walker.next_gesture_walk_sample = preserved_walker_next_gesture_walk_sample;
        lanes[i].anchor_walker.pending_gesture_steps = preserved_walker_pending_gesture_steps;
        lanes[i].anchor_walker.previous_cursor_midi = preserved_walker_previous_cursor_midi;
        lanes[i].anchor_walker.last_gesture_delta = preserved_walker_last_gesture_delta;
        lanes[i].anchor_walker.boundary_event = preserved_walker_boundary_event;
        lanes[i].anchor_walker.runtime_sample_frame = preserved_walker_runtime_sample_frame;
        lanes[i].anchor_walker.next_walk_sample = preserved_walker_next_walk_sample;
        lanes[i].anchor_walker.runtime_initialized = preserved_walker_runtime_initialized;
      } else if (lanes[i].sequencer_mode == kSequencerModeOrbit) {
        lanes[i].orbit.base_angle = preserved_orbit_base_angle;
        lanes[i].orbit.prev_base_angle = preserved_orbit_prev_base_angle;
        lanes[i].orbit.runtime_sample_frame = preserved_orbit_runtime_sample_frame;
        lanes[i].orbit.runtime_initialized = preserved_orbit_runtime_initialized;
        for (uint32_t note_index = 0u; note_index < kMaxOrbitSequencerNotes; ++note_index) {
          lanes[i].orbit.notes[note_index].angle = preserved_orbit_note_angles[note_index];
          lanes[i].orbit.notes[note_index].prev_angle = preserved_orbit_note_prev_angles[note_index];
        }
      }
    }
    clearLaneStepOverrides(lanes[i]);
  }
}
