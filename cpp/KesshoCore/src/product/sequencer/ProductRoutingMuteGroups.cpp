#include "../KesshoProductEngineInternal.h"

namespace {

uint32_t nextRoutingMuteRandom(uint32_t& state) {
  state = state == 0u ? 1u : state;
  state ^= state << 13u;
  state ^= state >> 17u;
  state ^= state << 5u;
  return state;
}

} // namespace

void KesshoProductEngine::beginRoutingMuteGroups(const KesshoProductEvent& event) {
  routing_mute_groups.staging_open = true;
  for (auto& slot : routing_mute_groups.staging) slot = {};
  routing_mute_groups.revision = static_cast<uint32_t>(std::lround(event.value));
  routing_mute_groups.rng_state = std::max(1u, static_cast<uint32_t>(std::lround(event.value2)));
  routing_mute_groups.avoid_repeat = event.value3 >= 0.5f;
  routing_mute_groups.enabled = event.value4 >= 0.5f;
  routing_mute_groups.baseline_synth_lane_enabled_mask = event.target_id & 0xffffu;
  routing_mute_groups.baseline_synth_lane_muted_mask = event.target_id >> 16u;
  routing_mute_groups.baseline_drum_lane_enabled_mask = event.index & 0xffffu;
  routing_mute_groups.baseline_drum_lane_muted_mask = event.index >> 16u;
  routing_mute_groups.baseline_granular_voice_enabled_mask = event.param_id & 0xfu;
}

void KesshoProductEngine::setRoutingMuteGroupSlot(const KesshoProductEvent& event) {
  if (!routing_mute_groups.staging_open || event.index >= kProductRoutingMuteGroupSlotCount) return;
  auto& slot = routing_mute_groups.staging[event.index];
  slot = {};
  slot.stored = true;
  slot.eligible = (event.flags & KESSHO_PRODUCT_ROUTING_MUTE_SLOT_ELIGIBLE) != 0u;
  slot.mute_mask = event.target_id & ((1u << kProductRoutingMuteRowCount) - 1u);
  slot.min_hold_quarter_phrases = static_cast<uint32_t>(std::lround(event.value));
  slot.max_hold_quarter_phrases = static_cast<uint32_t>(std::lround(event.value2));
  slot.transition_frames = static_cast<uint32_t>(std::lround(event.value3));
  const uint32_t synth_masks = event.param_id;
  const uint32_t drum_masks = static_cast<uint32_t>(std::lround(event.value4));
  slot.synth_lane_enabled_mask = synth_masks & 0xffffu;
  slot.synth_lane_muted_mask = synth_masks >> 16u;
  slot.drum_lane_enabled_mask = drum_masks & 0xffffu;
  slot.drum_lane_muted_mask = drum_masks >> 16u;
  slot.granular_voice_enabled_mask =
      (event.flags & KESSHO_PRODUCT_ROUTING_MUTE_GRANULAR_MASK) >> KESSHO_PRODUCT_ROUTING_MUTE_GRANULAR_SHIFT;
}

void KesshoProductEngine::commitRoutingMuteGroups(const KesshoProductEvent&) {
  if (!routing_mute_groups.staging_open) return;
  std::copy(
      std::begin(routing_mute_groups.staging),
      std::end(routing_mute_groups.staging),
      std::begin(routing_mute_groups.active));
  routing_mute_groups.staging_open = false;
  routing_mute_groups.active_slot = kProductRoutingMuteNoSlot;
  routing_mute_groups.next_slot = kProductRoutingMuteNoSlot;
  routing_mute_groups.next_change_frame = transport.running
      ? transport.nextPhraseBoundaryFrame(sample_rate)
      : UINT64_MAX;
  ++routing_mute_groups.trace_revision;
}

float KesshoProductEngine::routingMuteGainForFrame(uint32_t row, uint64_t absolute_frame) {
  if (row >= kProductRoutingMuteRowCount) return 1.0f;
  const uint32_t row_bit = 1u << row;
  if ((routing_mute_groups.non_unity_row_mask & row_bit) == 0u) return 1.0f;
  auto& ramp = routing_mute_groups.rows[row];
  if (absolute_frame <= ramp.start_frame) return ramp.start_gain;
  if (ramp.end_frame <= ramp.start_frame || absolute_frame >= ramp.end_frame) {
    ramp.start_gain = ramp.target_gain;
    ramp.start_frame = ramp.end_frame;
    ramp.runtime_muted = ramp.target_gain <= 0.0001f;
    if (ramp.target_gain >= 0.9999f) routing_mute_groups.non_unity_row_mask &= ~row_bit;
    return ramp.target_gain;
  }
  const double position = static_cast<double>(absolute_frame - ramp.start_frame) /
      static_cast<double>(ramp.end_frame - ramp.start_frame);
  const float t = clampFloat(static_cast<float>(position), 0.0f, 1.0f);
  const float smooth = t * t * (3.0f - 2.0f * t);
  return ramp.start_gain + (ramp.target_gain - ramp.start_gain) * smooth;
}

bool KesshoProductEngine::routingMuteRowSuppressed(uint32_t row) const {
  if (row >= kProductRoutingMuteRowCount) return false;
  const auto& ramp = routing_mute_groups.rows[row];
  return ramp.runtime_muted && ramp.target_gain <= 0.0001f && ramp.end_frame <= transport.sample_frame;
}

uint32_t KesshoProductEngine::routingMuteRowForSource(uint32_t source_id) const {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1: return kRoutingMuteRowPad1;
    case KESSHO_PRODUCT_SOURCE_PAD2: return kRoutingMuteRowPad2;
    case KESSHO_PRODUCT_SOURCE_LEAD1: return kRoutingMuteRowLead1;
    case KESSHO_PRODUCT_SOURCE_LEAD2: return kRoutingMuteRowLead2;
    case KESSHO_PRODUCT_SOURCE_SAMPLE1: return kRoutingMuteRowSample1;
    case KESSHO_PRODUCT_SOURCE_SAMPLE2: return kRoutingMuteRowSample2;
    case KESSHO_PRODUCT_SOURCE_DRUM: return kRoutingMuteRowDrums;
    default: return kProductRoutingMuteRowCount;
  }
}

void KesshoProductEngine::recallRoutingMuteGroup(uint32_t slot_index, uint32_t transition_frames) {
  recallRoutingMuteGroupAt(slot_index, transition_frames, transport.sample_frame);
}

void KesshoProductEngine::recallRoutingMuteGroupAt(
    uint32_t slot_index,
    uint32_t transition_frames,
    uint64_t start) {
  uint32_t target_mask = 0u;
  uint32_t synth_enabled = routing_mute_groups.baseline_synth_lane_enabled_mask;
  uint32_t synth_muted = routing_mute_groups.baseline_synth_lane_muted_mask;
  uint32_t drum_enabled = routing_mute_groups.baseline_drum_lane_enabled_mask;
  uint32_t drum_muted = routing_mute_groups.baseline_drum_lane_muted_mask;
  uint32_t granular_enabled = routing_mute_groups.baseline_granular_voice_enabled_mask;
  if (slot_index < kProductRoutingMuteGroupSlotCount && routing_mute_groups.active[slot_index].stored) {
    const auto& slot = routing_mute_groups.active[slot_index];
    target_mask = slot.mute_mask;
    synth_enabled = slot.synth_lane_enabled_mask;
    synth_muted = slot.synth_lane_muted_mask;
    drum_enabled = slot.drum_lane_enabled_mask;
    drum_muted = slot.drum_lane_muted_mask;
    granular_enabled = slot.granular_voice_enabled_mask;
    if (transition_frames == UINT32_MAX) {
      transition_frames = routing_mute_groups.active[slot_index].transition_frames;
    }
  } else {
    slot_index = kProductRoutingMuteNoSlot;
    transition_frames = transition_frames == UINT32_MAX ? 0u : transition_frames;
  }
  const uint64_t end = start + transition_frames;
  for (uint32_t row = 0u; row < kProductRoutingMuteRowCount; ++row) {
    auto& ramp = routing_mute_groups.rows[row];
    const float current = routingMuteGainForFrame(row, start);
    const float target = (target_mask & (1u << row)) != 0u ? 0.0f : 1.0f;
    ramp.start_gain = current;
    ramp.target_gain = target;
    ramp.start_frame = start;
    ramp.end_frame = end;
    ramp.runtime_muted = transition_frames == 0u && target <= 0.0001f;
    const uint32_t row_bit = 1u << row;
    if (current < 0.9999f || target < 0.9999f) routing_mute_groups.non_unity_row_mask |= row_bit;
    else routing_mute_groups.non_unity_row_mask &= ~row_bit;
  }
  routing_mute_groups.active_slot = slot_index;
  for (uint32_t lane = 0u; lane < synth_lane_count; ++lane) {
    synth_lanes[lane].enabled = (synth_enabled & (1u << lane)) != 0u;
    synth_lanes[lane].muted = (synth_muted & (1u << lane)) != 0u;
  }
  for (uint32_t lane = 0u; lane < drum_lane_count; ++lane) {
    drum_lanes[lane].enabled = (drum_enabled & (1u << lane)) != 0u;
    drum_lanes[lane].muted = (drum_muted & (1u << lane)) != 0u;
  }
  for (uint32_t voice = 0u; voice < kGranularVoiceCount; ++voice) {
    fx.granular_voices[voice].enabled = (granular_enabled & (1u << voice)) != 0u;
  }
  routing_mute_groups.fade_end_frame = end;
  ++routing_mute_groups.trace_revision;
}

void KesshoProductEngine::setRoutingMuteGroupsEnabled(bool enabled) {
  routing_mute_groups.enabled = enabled;
  if (!enabled) {
    routing_mute_groups.next_change_frame = UINT64_MAX;
    recallRoutingMuteGroup(kProductRoutingMuteNoSlot, 0u);
  } else if (transport.running) {
    routing_mute_groups.next_change_frame = transport.nextPhraseBoundaryFrame(sample_rate);
  }
}

void KesshoProductEngine::scheduleRoutingMuteGroups(uint32_t frames) {
  if (!routing_mute_groups.enabled || !transport.running || frames == 0u) return;
  const uint64_t block_end = transport.sample_frame + frames;
  if (routing_mute_groups.next_change_frame == UINT64_MAX) {
    routing_mute_groups.next_change_frame = transport.nextPhraseBoundaryFrame(sample_rate);
  }
  if (routing_mute_groups.next_change_frame >= block_end) return;

  uint32_t candidates[kProductRoutingMuteGroupSlotCount]{};
  uint32_t candidate_count = 0u;
  for (uint32_t index = 0u; index < kProductRoutingMuteGroupSlotCount; ++index) {
    const auto& slot = routing_mute_groups.active[index];
    if (!slot.stored || !slot.eligible) continue;
    if (routing_mute_groups.avoid_repeat &&
        routing_mute_groups.active_slot == index) continue;
    candidates[candidate_count++] = index;
  }
  if (candidate_count == 0u && routing_mute_groups.active_slot < kProductRoutingMuteGroupSlotCount) {
    candidates[candidate_count++] = routing_mute_groups.active_slot;
  }
  if (candidate_count == 0u) {
    routing_mute_groups.next_change_frame = transport.nextPhraseBoundaryFrame(sample_rate);
    return;
  }

  const uint32_t selected = routing_mute_groups.next_slot < kProductRoutingMuteGroupSlotCount &&
          routing_mute_groups.active[routing_mute_groups.next_slot].stored &&
          routing_mute_groups.active[routing_mute_groups.next_slot].eligible
      ? routing_mute_groups.next_slot
      : candidates[nextRoutingMuteRandom(routing_mute_groups.rng_state) % candidate_count];
  const auto& slot = routing_mute_groups.active[selected];
  const uint32_t hold_span = slot.max_hold_quarter_phrases - slot.min_hold_quarter_phrases + 1u;
  const uint32_t hold_quarter_phrases = slot.min_hold_quarter_phrases +
      (nextRoutingMuteRandom(routing_mute_groups.rng_state) % hold_span);
  const uint64_t boundary = routing_mute_groups.next_change_frame;
  recallRoutingMuteGroupAt(selected, slot.transition_frames, boundary);
  uint32_t future[kProductRoutingMuteGroupSlotCount]{};
  uint32_t future_count = 0u;
  for (uint32_t index = 0u; index < kProductRoutingMuteGroupSlotCount; ++index) {
    const auto& candidate = routing_mute_groups.active[index];
    if (!candidate.stored || !candidate.eligible) continue;
    if (routing_mute_groups.avoid_repeat && index == selected) continue;
    future[future_count++] = index;
  }
  routing_mute_groups.next_slot = future_count == 0u
      ? selected
      : future[nextRoutingMuteRandom(routing_mute_groups.rng_state) % future_count];
  const uint64_t quarter_phrase_frames = std::max<uint64_t>(
      1u, static_cast<uint64_t>(std::llround(transport.samplesPerPhrase(sample_rate) * 0.25)));
  routing_mute_groups.next_change_frame = boundary + slot.transition_frames +
      quarter_phrase_frames * hold_quarter_phrases;
}
