#include "../KesshoProductEngineInternal.h"

namespace {

using kessho::product::internal::LaneState;
using kessho::product::internal::SequencerChainState;

uint64_t chainDurationFrames(double sample_rate, float seconds) {
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::llround(
      sample_rate * static_cast<double>(std::max(0.001f, seconds)))));
}

} // namespace

void KesshoProductEngine::applySequencerChainParamEvent(const KesshoProductEvent& event) {
  SequencerChainState* chain = nullptr;
  uint32_t lane_count = 0u;
  if (event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
    chain = &synth_sequencer_chain;
    lane_count = synth_lane_count;
  } else if (event.target_id == KESSHO_PRODUCT_SEQUENCER_DRUM) {
    chain = &drum_sequencer_chain;
    lane_count = drum_lane_count;
  }
  if (chain == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }

  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENABLED_ID:
      chain->enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENTRY_COUNT_ID:
      chain->entry_count = std::min<uint32_t>(
          kessho::product::internal::kMaxSequencerChainEntries,
          static_cast<uint32_t>(std::max(0.0f, std::round(event.value))));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENTRY_LANE_ID:
      if (event.index >= kessho::product::internal::kMaxSequencerChainEntries) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
        return;
      }
      chain->entry_lane_indices[event.index] = lane_count == 0u
          ? 0u
          : std::min<uint32_t>(lane_count - 1u, static_cast<uint32_t>(std::max(0.0f, std::round(event.value))));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENTRY_DURATION_SECONDS_ID:
      if (event.index >= kessho::product::internal::kMaxSequencerChainEntries) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
        return;
      }
      chain->entry_duration_seconds[event.index] = clampFloat(event.value, 0.001f, 4096.0f);
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  chain->initialized = false;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::applySequencerChainTransitions() {
  const auto apply = [&](SequencerChainState& chain, LaneState* lanes, uint32_t lane_count) {
    if (!transport.running || !chain.enabled || chain.entry_count == 0u || lane_count == 0u) {
      chain.initialized = false;
      for (uint32_t lane = 0u; lane < lane_count; ++lane) lanes[lane].chain_muted = false;
      return;
    }

    if (!chain.initialized) {
      chain.active_entry = 0u;
      chain.next_boundary_frame = transport.sample_frame +
          chainDurationFrames(sample_rate, chain.entry_duration_seconds[0]);
      chain.initialized = true;
    } else {
      uint32_t transitions = 0u;
      while (transport.sample_frame >= chain.next_boundary_frame && transitions++ < 64u) {
        chain.active_entry = (chain.active_entry + 1u) % chain.entry_count;
        chain.next_boundary_frame += chainDurationFrames(
            sample_rate,
            chain.entry_duration_seconds[chain.active_entry]);
      }
    }

    const uint32_t active_lane = std::min<uint32_t>(
        lane_count - 1u,
        chain.entry_lane_indices[chain.active_entry]);
    for (uint32_t lane = 0u; lane < lane_count; ++lane) {
      const bool next_muted = lane != active_lane;
      if (lanes[lane].chain_muted && !next_muted) resetSequencerLaneRuntime(lanes[lane], false);
      lanes[lane].chain_muted = next_muted;
    }
  };
  apply(synth_sequencer_chain, synth_lanes, synth_lane_count);
  apply(drum_sequencer_chain, drum_lanes, drum_lane_count);
}

uint64_t KesshoProductEngine::nextSequencerChainBoundaryFrame() const {
  uint64_t next = UINT64_MAX;
  const auto inspect = [&](const SequencerChainState& chain) {
    if (transport.running && chain.enabled && chain.initialized && chain.entry_count > 0u) {
      next = std::min(next, chain.next_boundary_frame);
    }
  };
  inspect(synth_sequencer_chain);
  inspect(drum_sequencer_chain);
  return next;
}
