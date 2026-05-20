#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::recordSourceGraphTaps(
      uint32_t source_id,
      uint32_t frame,
      const SourceState& source,
      float dry_left,
      float dry_right,
      float ducked_left,
      float ducked_right,
      float send_left,
      float send_right) {
  if (!graph_taps_enabled) {
    if (source.diffuse_send <= 0.0f) {
      return;
    }
    const float diffuse_left = dry_left * source.diffuse_send;
    const float diffuse_right = dry_right * source.diffuse_send;
    if (diffuse_left == 0.0f && diffuse_right == 0.0f) {
      return;
    }
    diffuse_bus_l[frame] += diffuse_left;
    diffuse_bus_r[frame] += diffuse_right;
    diffuse_bus_active_this_block = true;
    return;
  }

  struct SourceGraphTapPointers {
    float* dry_l;
    float* dry_r;
    float* reverb_l;
    float* reverb_r;
    float* delay_a_l;
    float* delay_a_r;
    float* delay_b_l;
    float* delay_b_r;
    float* granular_l;
    float* granular_r;
    float* diffuse_l;
    float* diffuse_r;
  };
  const auto taps = [this, source_id]() -> SourceGraphTapPointers {
    switch (source_id) {
      case KESSHO_PRODUCT_SOURCE_PAD1:
        return {graph_pad1_dry_l, graph_pad1_dry_r, graph_pad1_reverb_send_l, graph_pad1_reverb_send_r,
            graph_pad1_delay_a_send_l, graph_pad1_delay_a_send_r, graph_pad1_delay_b_send_l, graph_pad1_delay_b_send_r,
            graph_pad1_granular_send_l, graph_pad1_granular_send_r, graph_pad1_diffuse_send_l, graph_pad1_diffuse_send_r};
      case KESSHO_PRODUCT_SOURCE_PAD2:
        return {graph_pad2_dry_l, graph_pad2_dry_r, graph_pad2_reverb_send_l, graph_pad2_reverb_send_r,
            graph_pad2_delay_a_send_l, graph_pad2_delay_a_send_r, graph_pad2_delay_b_send_l, graph_pad2_delay_b_send_r,
            graph_pad2_granular_send_l, graph_pad2_granular_send_r, graph_pad2_diffuse_send_l, graph_pad2_diffuse_send_r};
      case KESSHO_PRODUCT_SOURCE_LEAD1:
        return {graph_lead1_dry_l, graph_lead1_dry_r, graph_lead1_reverb_send_l, graph_lead1_reverb_send_r,
            graph_lead1_delay_a_send_l, graph_lead1_delay_a_send_r, graph_lead1_delay_b_send_l, graph_lead1_delay_b_send_r,
            graph_lead1_granular_send_l, graph_lead1_granular_send_r, graph_lead1_diffuse_send_l, graph_lead1_diffuse_send_r};
      case KESSHO_PRODUCT_SOURCE_LEAD2:
        return {graph_lead2_dry_l, graph_lead2_dry_r, graph_lead2_reverb_send_l, graph_lead2_reverb_send_r,
            graph_lead2_delay_a_send_l, graph_lead2_delay_a_send_r, graph_lead2_delay_b_send_l, graph_lead2_delay_b_send_r,
            graph_lead2_granular_send_l, graph_lead2_granular_send_r, graph_lead2_diffuse_send_l, graph_lead2_diffuse_send_r};
      case KESSHO_PRODUCT_SOURCE_PIANO:
        return {graph_piano_dry_l, graph_piano_dry_r, graph_piano_reverb_send_l, graph_piano_reverb_send_r,
            graph_piano_delay_a_send_l, graph_piano_delay_a_send_r, graph_piano_delay_b_send_l, graph_piano_delay_b_send_r,
            graph_piano_granular_send_l, graph_piano_granular_send_r, graph_piano_diffuse_send_l, graph_piano_diffuse_send_r};
      default:
        return {};
    }
  }();
  if (taps.dry_l == nullptr) return;

  const uint32_t sidechain_target = sidechainTargetForSource(source_id);
  if (graph_taps_enabled && sidechain_target < kSidechainTargetCount) {
    const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
    const float duck_gain_for_tap = lead_source ? sidechainGain(sidechain_target, frame) : 1.0f;
    const float sidechain_output_left = lead_source ? dry_left * duck_gain_for_tap : ducked_left;
    const float sidechain_output_right = lead_source ? dry_right * duck_gain_for_tap : ducked_right;
    graph_sidechain_input_l[sidechain_target][frame] += dry_left;
    graph_sidechain_input_r[sidechain_target][frame] += dry_right;
    graph_sidechain_output_l[sidechain_target][frame] += sidechain_output_left;
    graph_sidechain_output_r[sidechain_target][frame] += sidechain_output_right;
  }

  if (graph_taps_enabled) {
    taps.dry_l[frame] += dry_left;
    taps.dry_r[frame] += dry_right;
    taps.reverb_l[frame] += send_left * source.reverb_send;
    taps.reverb_r[frame] += send_right * source.reverb_send;
    taps.delay_a_l[frame] += send_left * source.delay_a_send;
    taps.delay_a_r[frame] += send_right * source.delay_a_send;
    taps.delay_b_l[frame] += send_left * source.delay_b_send;
    taps.delay_b_r[frame] += send_right * source.delay_b_send;
    taps.granular_l[frame] += send_left * source.granular_send;
    taps.granular_r[frame] += send_right * source.granular_send;
  }
  if (source.diffuse_send <= 0.0f) return;
  const float diffuse_left = dry_left * source.diffuse_send;
  const float diffuse_right = dry_right * source.diffuse_send;
  if (diffuse_left == 0.0f && diffuse_right == 0.0f) return;
  if (graph_taps_enabled) {
    taps.diffuse_l[frame] += diffuse_left;
    taps.diffuse_r[frame] += diffuse_right;
    graph_diffuse_input_l[frame] += diffuse_left;
    graph_diffuse_input_r[frame] += diffuse_right;
  }
  diffuse_bus_l[frame] += diffuse_left;
  diffuse_bus_r[frame] += diffuse_right;
  diffuse_bus_active_this_block = true;
}
