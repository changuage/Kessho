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
      graph_sidechain_pad1_input_l[frame] += dry_left;
      graph_sidechain_pad1_input_r[frame] += dry_right;
      graph_sidechain_pad1_output_l[frame] += ducked_left;
      graph_sidechain_pad1_output_r[frame] += ducked_right;
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
  const float diffuse_left = dry_left * source.diffuse_send;
  const float diffuse_right = dry_right * source.diffuse_send;
  diffuse_l[frame] += diffuse_left;
  diffuse_r[frame] += diffuse_right;
  graph_diffuse_input_l[frame] += diffuse_left;
  graph_diffuse_input_r[frame] += diffuse_right;
  diffuse_bus_l[frame] += diffuse_left;
  diffuse_bus_r[frame] += diffuse_right;
}

  void KesshoProductEngine::mixPadSourceBuffer(
      uint32_t source_id,
      const float* dry_l,
      const float* dry_r,
      const float* send_l,
      const float* send_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (source_id < 1u || source_id > kSourceCount) {
    return;
  }
  const SourceState& source = sources[source_id - 1u];
  if (!source.enabled) {
    return;
  }
  const bool freeze_mutes_pad_dry =
      fx.spectral_freeze_enabled &&
      fx.spectral_freeze_active &&
      (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2);
  const float freeze_dry_gain = freeze_mutes_pad_dry
      ? 1.0f - clampFloat(fx.spectral_freeze_reverb_crossfade, 0.0f, 1.0f)
      : 1.0f;
  const float graph_dry_gain = source.level * source.dry_gain;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float graph_dry_left = dry_l[i] * graph_dry_gain;
    const float graph_dry_right = dry_r[i] * graph_dry_gain;
    const float dry_left = graph_dry_left * freeze_dry_gain;
    const float dry_right = graph_dry_right * freeze_dry_gain;
    const float send_left = send_l[i];
    const float send_right = send_r[i];
    const float duck_gain = sidechainGain(source_id - 1u, frame);
    const float left = dry_left * duck_gain;
    const float right = dry_right * duck_gain;
    recordSourceGraphTaps(source_id, frame, source, graph_dry_left, graph_dry_right, left, right, send_left, send_right);
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[source_id][frame] += left;
    stem_r[source_id][frame] += right;
    reverb_bus_l[frame] += send_left * source.reverb_send;
    reverb_bus_r[frame] += send_right * source.reverb_send;
    delay_a_bus_l[frame] += send_left * source.delay_a_send;
    delay_a_bus_r[frame] += send_right * source.delay_a_send;
    delay_b_bus_l[frame] += send_left * source.delay_b_send;
    delay_b_bus_r[frame] += send_right * source.delay_b_send;
    granular_bus_l[frame] += send_left * source.granular_send;
    granular_bus_r[frame] += send_right * source.granular_send;
  }
}

  void KesshoProductEngine::mixSourceBuffer(
      uint32_t source_id,
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (source_id < 1u || source_id > kSourceCount || source_id >= kStemCount) {
    return;
  }
  const SourceState& source = sources[source_id - 1u];
  if (!source.enabled) {
    return;
  }
  const float trim = moduleSourceOutputTrim(source_id);
  const float dry_gain = source.level * source.dry_gain * trim;
  const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  const float graph_dry_gain = source.level * source.dry_gain * (lead_source ? 1.0f : trim);
  const float send_gain = source.dry_gain;
  const uint32_t sidechain_target = sidechainTargetForSource(source_id);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float dry_left = in_l[i] * dry_gain;
    const float dry_right = in_r[i] * dry_gain;
    const float graph_dry_left = in_l[i] * graph_dry_gain;
    const float graph_dry_right = in_r[i] * graph_dry_gain;
    const float send_left = in_l[i] * send_gain;
    const float send_right = in_r[i] * send_gain;
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float left = dry_left * duck_gain;
    const float right = dry_right * duck_gain;
    recordSourceGraphTaps(source_id, frame, source, graph_dry_left, graph_dry_right, left, right, send_left, send_right);
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[source_id][frame] += left;
    stem_r[source_id][frame] += right;
    reverb_bus_l[frame] += send_left * source.reverb_send;
    reverb_bus_r[frame] += send_right * source.reverb_send;
    delay_a_bus_l[frame] += send_left * source.delay_a_send;
    delay_a_bus_r[frame] += send_right * source.delay_a_send;
    delay_b_bus_l[frame] += send_left * source.delay_b_send;
    delay_b_bus_r[frame] += send_right * source.delay_b_send;
    granular_bus_l[frame] += send_left * source.granular_send;
    granular_bus_r[frame] += send_right * source.granular_send;
  }
}
