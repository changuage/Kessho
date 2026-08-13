#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::renderSpectralFreeze(
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames,
      bool send_to_reverb) {
  if (
      spectral_freeze_module == nullptr ||
      out_l == nullptr ||
      out_r == nullptr ||
      frames == 0u) {
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    if (graph_taps_enabled) {
      graph_spectral_freeze_input_l[frame] = spectral_freeze_bus_l[frame];
      graph_spectral_freeze_input_r[frame] = spectral_freeze_bus_r[frame];
    }
  }
  spectral_freeze_module->processPlanarStereo(
      spectral_freeze_bus_l + start,
      spectral_freeze_bus_r + start,
      spectral_freeze_output_l + start,
      spectral_freeze_output_r + start,
      static_cast<int>(frames));
  const bool audible = fx.spectral_freeze_enabled && fx.spectral_freeze_mix > 0.0f;
  const float return_gain = clampFloat(fx.spectral_freeze_mix, 0.0f, 1.0f);
  const float reverb_send_gain = send_to_reverb
      ? clampFloat(fx.spectral_freeze_reverb_crossfade, 0.0f, 1.0f)
      : 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    if (graph_taps_enabled) {
      graph_spectral_freeze_output_l[frame] = spectral_freeze_output_l[frame];
      graph_spectral_freeze_output_r[frame] = spectral_freeze_output_r[frame];
    }
    if (fx_graph_rendering) {
      const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowFreeze, transport.sample_frame + i);
      fx_node_output_l[kFxNodeFreeze][frame] = spectral_freeze_output_l[frame] * mute_gain;
      fx_node_output_r[kFxNodeFreeze][frame] = spectral_freeze_output_r[frame] * mute_gain;
      continue;
    }
    if (!audible) {
      continue;
    }
    const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowFreeze, transport.sample_frame + i);
    const float left = spectral_freeze_output_l[frame] * return_gain * mute_gain;
    const float right = spectral_freeze_output_r[frame] * return_gain * mute_gain;
    if (reverb_send_gain > 0.0f) {
      reverb_bus_l[frame] += spectral_freeze_output_l[frame] * reverb_send_gain;
      reverb_bus_r[frame] += spectral_freeze_output_r[frame] * reverb_send_gain;
    }
    routeTerminalSample(routing.fx_dynamics_bus[kFxNodeFreeze], out_l, out_r, frame, left, right);
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
    }
  }
}
