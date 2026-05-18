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
  float* dry_l = nullptr;
  float* dry_r = nullptr;
  float* reverb_l = nullptr;
  float* reverb_r = nullptr;
  float* delay_a_l = nullptr;
  float* delay_a_r = nullptr;
  float* delay_b_l = nullptr;
  float* delay_b_r = nullptr;
  float* granular_l = nullptr;
  float* granular_r = nullptr;
  float* diffuse_l = nullptr;
  float* diffuse_r = nullptr;

  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
      dry_l = graph_pad1_dry_l;
      dry_r = graph_pad1_dry_r;
      reverb_l = graph_pad1_reverb_send_l;
      reverb_r = graph_pad1_reverb_send_r;
      delay_a_l = graph_pad1_delay_a_send_l;
      delay_a_r = graph_pad1_delay_a_send_r;
      delay_b_l = graph_pad1_delay_b_send_l;
      delay_b_r = graph_pad1_delay_b_send_r;
      granular_l = graph_pad1_granular_send_l;
      granular_r = graph_pad1_granular_send_r;
      diffuse_l = graph_pad1_diffuse_send_l;
      diffuse_r = graph_pad1_diffuse_send_r;
      break;
    case KESSHO_PRODUCT_SOURCE_PAD2:
      dry_l = graph_pad2_dry_l;
      dry_r = graph_pad2_dry_r;
      reverb_l = graph_pad2_reverb_send_l;
      reverb_r = graph_pad2_reverb_send_r;
      delay_a_l = graph_pad2_delay_a_send_l;
      delay_a_r = graph_pad2_delay_a_send_r;
      delay_b_l = graph_pad2_delay_b_send_l;
      delay_b_r = graph_pad2_delay_b_send_r;
      granular_l = graph_pad2_granular_send_l;
      granular_r = graph_pad2_granular_send_r;
      diffuse_l = graph_pad2_diffuse_send_l;
      diffuse_r = graph_pad2_diffuse_send_r;
      break;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      dry_l = graph_lead1_dry_l;
      dry_r = graph_lead1_dry_r;
      reverb_l = graph_lead1_reverb_send_l;
      reverb_r = graph_lead1_reverb_send_r;
      delay_a_l = graph_lead1_delay_a_send_l;
      delay_a_r = graph_lead1_delay_a_send_r;
      delay_b_l = graph_lead1_delay_b_send_l;
      delay_b_r = graph_lead1_delay_b_send_r;
      granular_l = graph_lead1_granular_send_l;
      granular_r = graph_lead1_granular_send_r;
      diffuse_l = graph_lead1_diffuse_send_l;
      diffuse_r = graph_lead1_diffuse_send_r;
      break;
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      dry_l = graph_lead2_dry_l;
      dry_r = graph_lead2_dry_r;
      reverb_l = graph_lead2_reverb_send_l;
      reverb_r = graph_lead2_reverb_send_r;
      delay_a_l = graph_lead2_delay_a_send_l;
      delay_a_r = graph_lead2_delay_a_send_r;
      delay_b_l = graph_lead2_delay_b_send_l;
      delay_b_r = graph_lead2_delay_b_send_r;
      granular_l = graph_lead2_granular_send_l;
      granular_r = graph_lead2_granular_send_r;
      diffuse_l = graph_lead2_diffuse_send_l;
      diffuse_r = graph_lead2_diffuse_send_r;
      break;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      dry_l = graph_piano_dry_l;
      dry_r = graph_piano_dry_r;
      reverb_l = graph_piano_reverb_send_l;
      reverb_r = graph_piano_reverb_send_r;
      delay_a_l = graph_piano_delay_a_send_l;
      delay_a_r = graph_piano_delay_a_send_r;
      delay_b_l = graph_piano_delay_b_send_l;
      delay_b_r = graph_piano_delay_b_send_r;
      granular_l = graph_piano_granular_send_l;
      granular_r = graph_piano_granular_send_r;
      diffuse_l = graph_piano_diffuse_send_l;
      diffuse_r = graph_piano_diffuse_send_r;
      break;
    default:
      return;
  }

  const uint32_t sidechain_target = sidechainTargetForSource(source_id);
  if (sidechain_target < kSidechainTargetCount) {
    const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
    const float duck_gain_for_tap = lead_source ? sidechainGain(sidechain_target, frame) : 1.0f;
    const float sidechain_output_left = lead_source ? dry_left * duck_gain_for_tap : ducked_left;
    const float sidechain_output_right = lead_source ? dry_right * duck_gain_for_tap : ducked_right;
    graph_sidechain_input_l[sidechain_target][frame] += dry_left;
    graph_sidechain_input_r[sidechain_target][frame] += dry_right;
    graph_sidechain_output_l[sidechain_target][frame] += sidechain_output_left;
    graph_sidechain_output_r[sidechain_target][frame] += sidechain_output_right;
  }

  dry_l[frame] += dry_left;
  dry_r[frame] += dry_right;
  reverb_l[frame] += send_left * source.reverb_send;
  reverb_r[frame] += send_right * source.reverb_send;
  delay_a_l[frame] += send_left * source.delay_a_send;
  delay_a_r[frame] += send_right * source.delay_a_send;
  delay_b_l[frame] += send_left * source.delay_b_send;
  delay_b_r[frame] += send_right * source.delay_b_send;
  granular_l[frame] += send_left * source.granular_send;
  granular_r[frame] += send_right * source.granular_send;
  if (source.diffuse_send <= 0.0f) {
    return;
  }
  const float diffuse_left = dry_left * source.diffuse_send;
  const float diffuse_right = dry_right * source.diffuse_send;
  if (diffuse_left == 0.0f && diffuse_right == 0.0f) {
    return;
  }
  diffuse_l[frame] += diffuse_left;
  diffuse_r[frame] += diffuse_right;
  graph_diffuse_input_l[frame] += diffuse_left;
  graph_diffuse_input_r[frame] += diffuse_right;
  diffuse_bus_l[frame] += diffuse_left;
  diffuse_bus_r[frame] += diffuse_right;
  diffuse_bus_active_this_block = true;
}
