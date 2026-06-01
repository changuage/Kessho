#include "../KesshoProductEngineInternal.h"
namespace {
void addStereo(float* left_bus, float* right_bus, uint32_t frame, float left, float right) { left_bus[frame] += left; right_bus[frame] += right; }
} // namespace

void KesshoProductEngine::mixPadSourceBuffer(uint32_t source_id, const float* dry_l, const float* dry_r,
    const float* send_l, const float* send_r, float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (source_id < 1u || source_id > kSourceCount) return;
  SourceState& source = sources[source_id - 1u];
  if (!sourceRenderActive(source)) return;
  const bool freeze_mutes_pad_dry =
      fx.spectral_freeze_enabled &&
      fx.spectral_freeze_active &&
      (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2);
  const float freeze_dry_gain = freeze_mutes_pad_dry
      ? 1.0f - clampFloat(fx.spectral_freeze_reverb_crossfade, 0.0f, 1.0f)
      : 1.0f;
  const float graph_dry_gain = source.level * source.dry_gain;
  if (!graph_taps_enabled && !fx.sidechain_enabled && source.diffuse_send <= 0.0f) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float source_gate = sourceEnableGainForFrame(source, transport.sample_frame + i);
      const float dry_left = dry_l[i] * graph_dry_gain * freeze_dry_gain * source_gate;
      const float dry_right = dry_r[i] * graph_dry_gain * freeze_dry_gain * source_gate;
      const float send_left = send_l[i] * source_gate;
      const float send_right = send_r[i] * source_gate;
      const float granular_send = granularSendGainForFrame(source_id, source.granular_send, transport.sample_frame + i);
      out_l[frame] += dry_left;
      out_r[frame] += dry_right;
      addStereo(stem_l[source_id], stem_r[source_id], frame, dry_left, dry_right);
      addStereo(reverb_bus_l, reverb_bus_r, frame, send_left * source.reverb_send, send_right * source.reverb_send);
      addStereo(delay_a_bus_l, delay_a_bus_r, frame, send_left * source.delay_a_send, send_right * source.delay_a_send);
      addStereo(delay_b_bus_l, delay_b_bus_r, frame, send_left * source.delay_b_send, send_right * source.delay_b_send);
      addStereo(granular_bus_l, granular_bus_r, frame, send_left * granular_send, send_right * granular_send);
    }
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float source_gate = sourceEnableGainForFrame(source, transport.sample_frame + i);
    const float graph_dry_left = dry_l[i] * graph_dry_gain * source_gate;
    const float graph_dry_right = dry_r[i] * graph_dry_gain * source_gate;
    const float dry_left = graph_dry_left * freeze_dry_gain;
    const float dry_right = graph_dry_right * freeze_dry_gain;
    const float send_left = send_l[i] * source_gate;
    const float send_right = send_r[i] * source_gate;
    const float granular_send = granularSendGainForFrame(source_id, source.granular_send, transport.sample_frame + i);
    const float duck_gain = sidechainGain(source_id - 1u, frame);
    const float left = dry_left * duck_gain;
    const float right = dry_right * duck_gain;
    recordSourceGraphTaps(source_id, frame, source, graph_dry_left, graph_dry_right, left, right, send_left, send_right, granular_send);
    out_l[frame] += left;
    out_r[frame] += right;
    addStereo(stem_l[source_id], stem_r[source_id], frame, left, right);
    addStereo(reverb_bus_l, reverb_bus_r, frame, send_left * source.reverb_send, send_right * source.reverb_send);
    addStereo(delay_a_bus_l, delay_a_bus_r, frame, send_left * source.delay_a_send, send_right * source.delay_a_send);
    addStereo(delay_b_bus_l, delay_b_bus_r, frame, send_left * source.delay_b_send, send_right * source.delay_b_send);
    addStereo(granular_bus_l, granular_bus_r, frame, send_left * granular_send, send_right * granular_send);
  }
}

void KesshoProductEngine::mixSourceBuffer(
    uint32_t source_id, const float* in_l, const float* in_r, float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (source_id < 1u || source_id > kSourceCount || source_id >= kStemCount) return;
  SourceState& source = sources[source_id - 1u];
  if (!sourceRenderActive(source)) return;
  const float trim = moduleSourceOutputTrim(source_id);
  const float dry_gain = source.level * source.dry_gain * trim;
  const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  const float graph_dry_gain = source.level * source.dry_gain * (lead_source ? 1.0f : trim);
  const float send_gain = source.dry_gain;
  const uint32_t sidechain_target = sidechainTargetForSource(source_id);
  if (!graph_taps_enabled && !fx.sidechain_enabled && source.diffuse_send <= 0.0f) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float source_gate = sourceEnableGainForFrame(source, transport.sample_frame + i);
      const float dry_left = in_l[i] * dry_gain * source_gate;
      const float dry_right = in_r[i] * dry_gain * source_gate;
      const float send_left = in_l[i] * send_gain * source_gate;
      const float send_right = in_r[i] * send_gain * source_gate;
      const float granular_send = granularSendGainForFrame(source_id, source.granular_send, transport.sample_frame + i);
      out_l[frame] += dry_left;
      out_r[frame] += dry_right;
      addStereo(stem_l[source_id], stem_r[source_id], frame, dry_left, dry_right);
      addStereo(reverb_bus_l, reverb_bus_r, frame, send_left * source.reverb_send, send_right * source.reverb_send);
      addStereo(delay_a_bus_l, delay_a_bus_r, frame, send_left * source.delay_a_send, send_right * source.delay_a_send);
      addStereo(delay_b_bus_l, delay_b_bus_r, frame, send_left * source.delay_b_send, send_right * source.delay_b_send);
      addStereo(granular_bus_l, granular_bus_r, frame, send_left * granular_send, send_right * granular_send);
    }
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float source_gate = sourceEnableGainForFrame(source, transport.sample_frame + i);
    const float dry_left = in_l[i] * dry_gain * source_gate;
    const float dry_right = in_r[i] * dry_gain * source_gate;
    const float graph_dry_left = in_l[i] * graph_dry_gain * source_gate;
    const float graph_dry_right = in_r[i] * graph_dry_gain * source_gate;
    const float send_left = in_l[i] * send_gain * source_gate;
    const float send_right = in_r[i] * send_gain * source_gate;
    const float granular_send = granularSendGainForFrame(source_id, source.granular_send, transport.sample_frame + i);
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float left = dry_left * duck_gain;
    const float right = dry_right * duck_gain;
    recordSourceGraphTaps(source_id, frame, source, graph_dry_left, graph_dry_right, left, right, send_left, send_right, granular_send);
    out_l[frame] += left;
    out_r[frame] += right;
    addStereo(stem_l[source_id], stem_r[source_id], frame, left, right);
    addStereo(reverb_bus_l, reverb_bus_r, frame, send_left * source.reverb_send, send_right * source.reverb_send);
    addStereo(delay_a_bus_l, delay_a_bus_r, frame, send_left * source.delay_a_send, send_right * source.delay_a_send);
    addStereo(delay_b_bus_l, delay_b_bus_r, frame, send_left * source.delay_b_send, send_right * source.delay_b_send);
    addStereo(granular_bus_l, granular_bus_r, frame, send_left * granular_send, send_right * granular_send);
  }
}
