#include "KesshoProductEngineInternal.h"

namespace {

enum ProductModuleMask : uint32_t {
  kModulePad = 1u << 0,
  kModuleLead1 = 1u << 1,
  kModuleLead2 = 1u << 2,
  kModuleDrum = 1u << 3,
  kModuleSoundscape = 1u << 4,
};

} // namespace

void KesshoProductEngine::renderPadModule(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!pad_module || frames == 0u) {
    return;
  }
  if (pad_module->activeVoiceCount() <= 0) {
    pad_module->advancePadIdleTelemetry(0, static_cast<int>(frames));
    pad_module->advancePadIdleTelemetry(1, static_cast<int>(frames));
    return;
  }
  float* tap_l[kModuleTapCount]{};
  float* tap_r[kModuleTapCount]{};
  for (uint32_t bus = 0; bus < KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT; ++bus) {
    tap_l[bus] = module_tap_l[bus];
    tap_r[bus] = module_tap_r[bus];
    std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
    std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
  }
  pad_module->processPlanarStereoTaps(silent_l, silent_r, tap_l, tap_r, KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT, static_cast<int>(frames));
  processPadPostChain(
      pad_post_chains[0],
      KESSHO_PRODUCT_SOURCE_PAD1,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      frames);
  processPadPostChain(
      pad_post_chains[1],
      KESSHO_PRODUCT_SOURCE_PAD2,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      frames);
  processPadPostChain(
      pad_send_post_chains[0],
      KESSHO_PRODUCT_SOURCE_PAD1,
      module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD1],
      frames);
  processPadPostChain(
      pad_send_post_chains[1],
      KESSHO_PRODUCT_SOURCE_PAD2,
      module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD2],
      frames);
  mixPadSourceBuffer(
      KESSHO_PRODUCT_SOURCE_PAD1,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD1],
      out_l,
      out_r,
      start,
      frames);
  mixPadSourceBuffer(
      KESSHO_PRODUCT_SOURCE_PAD2,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD2],
      out_l,
      out_r,
      start,
      frames);
}

void KesshoProductEngine::renderSingleModuleSource(
      kessho::core::IKesshoModule* module,
      uint32_t source_id,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (module == nullptr || frames == 0u) {
    return;
  }
  if (module->activeVoiceCount() <= 0) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  module->processPlanarStereo(silent_l, silent_r, module_l, module_r, static_cast<int>(frames));
  const float* send_l = module_l;
  const float* send_r = module_r;
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1) {
    const SourceState& source = sources[source_id - 1u];
    const bool needs_prefx_copy =
        graph_taps_enabled ||
        source.reverb_send > 0.0f ||
        source.delay_a_send > 0.0f ||
        source.delay_b_send > 0.0f ||
        source.granular_send > 0.0f ||
        source.diffuse_send > 0.0f ||
        source.degrade_send > 0.0f;
    if (needs_prefx_copy) {
      std::copy(module_l, module_l + frames, module_tap_l[0]);
      std::copy(module_r, module_r + frames, module_tap_r[0]);
      send_l = module_tap_l[0];
      send_r = module_tap_r[0];
    }
    processLeadPostChain(0u, source_id, module_l, module_r, frames);
  } else if (source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    const SourceState& source = sources[source_id - 1u];
    const bool needs_prefx_copy =
        graph_taps_enabled ||
        source.reverb_send > 0.0f ||
        source.delay_a_send > 0.0f ||
        source.delay_b_send > 0.0f ||
        source.granular_send > 0.0f ||
        source.diffuse_send > 0.0f ||
        source.degrade_send > 0.0f;
    if (needs_prefx_copy) {
      std::copy(module_l, module_l + frames, module_tap_l[0]);
      std::copy(module_r, module_r + frames, module_tap_r[0]);
      send_l = module_tap_l[0];
      send_r = module_tap_r[0];
    }
    processLeadPostChain(1u, source_id, module_l, module_r, frames);
  }
  mixSourceBuffer(source_id, module_l, module_r, send_l, send_r, out_l, out_r, start, frames);
}

void KesshoProductEngine::renderDrumModule(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!drum_module || frames == 0u) {
    return;
  }
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  if (!sourceRenderActive(source)) {
    return;
  }
  float* tap_l[kModuleTapCount]{};
  float* tap_r[kModuleTapCount]{};
  for (uint32_t bus = 0; bus < 2u; ++bus) {
    tap_l[bus] = module_tap_l[bus];
    tap_r[bus] = module_tap_r[bus];
    std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
    std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
  }
  drum_module->processPlanarStereoTaps(silent_l, silent_r, tap_l, tap_r, 2u, static_cast<int>(frames));
  const float delay_a_send = std::max(0.0f, source.delay_a_send);
  const float delay_b_send = std::max(0.0f, source.delay_b_send);
  const float granular_send = std::max(0.0f, source.granular_send);
  const float degrade_send = std::max(0.0f, source.degrade_send);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float source_gate = sourceEnableGainForFrame(source, transport.sample_frame + i);
    const float dry_l = module_tap_l[0][i] * source_gate;
    const float dry_r = module_tap_r[0][i] * source_gate;
    const float reverb_l = module_tap_l[1][i] * source_gate;
    const float reverb_r = module_tap_r[1][i] * source_gate;
    const float delay_a_l = dry_l * delay_a_send;
    const float delay_a_r = dry_r * delay_a_send;
    const float delay_b_l = dry_l * delay_b_send;
    const float delay_b_r = dry_r * delay_b_send;
    const float granular_l = dry_l * granular_send;
    const float granular_r = dry_r * granular_send;
    const float drift_l = dry_l * degrade_send;
    const float drift_r = dry_r * degrade_send;

    routeTerminalSample(dynamicsBusForSource(KESSHO_PRODUCT_SOURCE_DRUM), out_l, out_r, frame, dry_l, dry_r);
    stem_l[KESSHO_PRODUCT_STEM_DRUM][frame] += dry_l;
    stem_r[KESSHO_PRODUCT_STEM_DRUM][frame] += dry_r;
    reverb_bus_l[frame] += reverb_l;
    reverb_bus_r[frame] += reverb_r;
    delay_a_bus_l[frame] += delay_a_l;
    delay_a_bus_r[frame] += delay_a_r;
    delay_b_bus_l[frame] += delay_b_l;
    delay_b_bus_r[frame] += delay_b_r;
    granular_bus_l[frame] += granular_l;
    granular_bus_r[frame] += granular_r;
    degrade_bus_l[frame] += drift_l;
    degrade_bus_r[frame] += drift_r;

    if (graph_taps_enabled) {
      graph_drum_dry_l[frame] += dry_l;
      graph_drum_dry_r[frame] += dry_r;
      graph_drum_reverb_send_l[frame] += reverb_l;
      graph_drum_reverb_send_r[frame] += reverb_r;
      graph_drum_delay_a_send_l[frame] += delay_a_l;
      graph_drum_delay_a_send_r[frame] += delay_a_r;
      graph_drum_delay_b_send_l[frame] += delay_b_l;
      graph_drum_delay_b_send_r[frame] += delay_b_r;
      graph_drum_granular_send_l[frame] += granular_l;
      graph_drum_granular_send_r[frame] += granular_r;
    }
  }
}

void KesshoProductEngine::configureSoundscapesModuleFromSource() {
  if (!soundscapes_module) {
    return;
  }
  float* params = soundscapes_module->params();
  if (params == nullptr || soundscapes_module->paramCount() < static_cast<int>(kSoundscapeModuleParamCount)) {
    return;
  }
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  const bool module_should_run = soundscapeModuleShouldRun(source);
  if (!module_should_run) {
    if (soundscapes_module_params_configured) {
      soundscapes_module->allNotesOff();
      soundscapes_module_params_configured = false;
      soundscapes_module_param_cache = {};
    }
    return;
  }
  std::array<float, kSoundscapeModuleParamCount> desired{};
  for (uint32_t i = 0; i < kSoundscapeModuleParamCount; ++i) {
    desired[i] = std::isfinite(source.soundscape_module_params[i]) ? source.soundscape_module_params[i] : 0.0f;
  }
  bool changed = !soundscapes_module_params_configured;
  if (!changed) {
    for (uint32_t i = 0; i < kSoundscapeModuleParamCount; ++i) {
      if (desired[i] != soundscapes_module_param_cache[i]) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) {
    return;
  }
  std::copy(desired.begin(), desired.end(), params);
  soundscapes_module->commitParams();
  soundscapes_module_param_cache = desired;
  soundscapes_module_params_configured = true;
}

void KesshoProductEngine::renderSoundscapesModule(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!soundscapes_module || frames == 0u) {
    return;
  }
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  if (!soundscapeModuleShouldRun(source)) {
    return;
  }

  float* tap_l[3] = {module_tap_l[0], module_tap_l[1], module_tap_l[2]};
  float* tap_r[3] = {module_tap_r[0], module_tap_r[1], module_tap_r[2]};
  for (uint32_t bus = 0; bus < 3u; ++bus) {
    std::fill(tap_l[bus], tap_l[bus] + frames, 0.0f);
    std::fill(tap_r[bus], tap_r[bus] + frames, 0.0f);
  }
  soundscapes_module->processPlanarStereoTaps(
      silent_l,
      silent_r,
      tap_l,
      tap_r,
      3u,
      static_cast<int>(frames));

  const float water_level = clampFloat(source.soundscape_module_params[kSoundscapeModuleWaterLevelParam], 0.0f, 2.0f);
  const float insects_level = clampFloat(source.soundscape_module_params[kSoundscapeModuleInsectsLevelParam], 0.0f, 2.0f);
  const float insects2_level = clampFloat(source.soundscape_module_params[kSoundscapeModuleInsects2LevelParam], 0.0f, 2.0f);
  const float insects_shared_level = clampFloat(source.soundscape_module_params[kSoundscapeModuleInsectsSharedLevelParam], 0.0f, 2.0f);
  const float earth_level = clampFloat(source.soundscape_module_params[kSoundscapeModuleEarthLevelParam], 0.0f, 2.0f);
  const float water_reverb_send = soundscapeLayerRouteSend(source, kSoundscapeLayerWater, kSoundscapeLayerRouteReverb, 0.0f);
  const float water_delay_a_send = soundscapeLayerRouteSend(source, kSoundscapeLayerWater, kSoundscapeLayerRouteDelayA, 0.0f);
  const float water_delay_b_send = soundscapeLayerRouteSend(source, kSoundscapeLayerWater, kSoundscapeLayerRouteDelayB, 0.0f);
  const float water_granular_send = soundscapeLayerRouteSend(source, kSoundscapeLayerWater, kSoundscapeLayerRouteGranular, 0.0f);
  const float water_degrade_send = soundscapeLayerRouteSend(source, kSoundscapeLayerWater, kSoundscapeLayerRouteDegrade, 0.0f);
  const float insects_reverb_send = soundscapeLayerRouteSend(source, kSoundscapeLayerInsects, kSoundscapeLayerRouteReverb, 0.0f);
  const float insects_delay_a_send = soundscapeLayerRouteSend(source, kSoundscapeLayerInsects, kSoundscapeLayerRouteDelayA, 0.0f);
  const float insects_delay_b_send = soundscapeLayerRouteSend(source, kSoundscapeLayerInsects, kSoundscapeLayerRouteDelayB, 0.0f);
  const float insects_granular_send = soundscapeLayerRouteSend(source, kSoundscapeLayerInsects, kSoundscapeLayerRouteGranular, 0.0f);
  const float insects_degrade_send = soundscapeLayerRouteSend(source, kSoundscapeLayerInsects, kSoundscapeLayerRouteDegrade, 0.0f);

  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float source_gate = sourceEnableGainForFrame(source, transport.sample_frame + i);
    const float water_l = module_tap_l[0][i] * water_level * source_gate;
    const float water_r = module_tap_r[0][i] * water_level * source_gate;
    const float insects_prefader_l =
        (module_tap_l[1][i] * insects_level + module_tap_l[2][i] * insects2_level) * insects_shared_level * source_gate;
    const float insects_prefader_r =
        (module_tap_r[1][i] * insects_level + module_tap_r[2][i] * insects2_level) * insects_shared_level * source_gate;
    const float water_out_l = water_l * earth_level;
    const float water_out_r = water_r * earth_level;
    const float insects_out_l = insects_prefader_l * earth_level;
    const float insects_out_r = insects_prefader_r * earth_level;

    if (graph_taps_enabled) {
      graph_soundscape_layer_dry_l[kSoundscapeLayerWater][frame] += water_l;
      graph_soundscape_layer_dry_r[kSoundscapeLayerWater][frame] += water_r;
      graph_soundscape_layer_reverb_send_l[kSoundscapeLayerWater][frame] += water_l * water_reverb_send;
      graph_soundscape_layer_reverb_send_r[kSoundscapeLayerWater][frame] += water_r * water_reverb_send;
      graph_soundscape_layer_delay_a_send_l[kSoundscapeLayerWater][frame] += water_l * water_delay_a_send;
      graph_soundscape_layer_delay_a_send_r[kSoundscapeLayerWater][frame] += water_r * water_delay_a_send;
      graph_soundscape_layer_delay_b_send_l[kSoundscapeLayerWater][frame] += water_l * water_delay_b_send;
      graph_soundscape_layer_delay_b_send_r[kSoundscapeLayerWater][frame] += water_r * water_delay_b_send;
      graph_soundscape_layer_granular_send_l[kSoundscapeLayerWater][frame] += water_l * water_granular_send;
      graph_soundscape_layer_granular_send_r[kSoundscapeLayerWater][frame] += water_r * water_granular_send;

      graph_soundscape_layer_dry_l[kSoundscapeLayerInsects][frame] += insects_prefader_l;
      graph_soundscape_layer_dry_r[kSoundscapeLayerInsects][frame] += insects_prefader_r;
      graph_soundscape_layer_reverb_send_l[kSoundscapeLayerInsects][frame] += insects_prefader_l * insects_reverb_send;
      graph_soundscape_layer_reverb_send_r[kSoundscapeLayerInsects][frame] += insects_prefader_r * insects_reverb_send;
      graph_soundscape_layer_delay_a_send_l[kSoundscapeLayerInsects][frame] += insects_prefader_l * insects_delay_a_send;
      graph_soundscape_layer_delay_a_send_r[kSoundscapeLayerInsects][frame] += insects_prefader_r * insects_delay_a_send;
      graph_soundscape_layer_delay_b_send_l[kSoundscapeLayerInsects][frame] += insects_prefader_l * insects_delay_b_send;
      graph_soundscape_layer_delay_b_send_r[kSoundscapeLayerInsects][frame] += insects_prefader_r * insects_delay_b_send;
      graph_soundscape_layer_granular_send_l[kSoundscapeLayerInsects][frame] += insects_prefader_l * insects_granular_send;
      graph_soundscape_layer_granular_send_r[kSoundscapeLayerInsects][frame] += insects_prefader_r * insects_granular_send;
    }

    routeTerminalSample(
        dynamicsBusForSoundscapeLayer(kSoundscapeLayerWater),
        out_l,
        out_r,
        frame,
        water_out_l,
        water_out_r);
    routeTerminalSample(
        dynamicsBusForSoundscapeLayer(kSoundscapeLayerInsects),
        out_l,
        out_r,
        frame,
        insects_out_l,
        insects_out_r);
    stem_l[KESSHO_PRODUCT_STEM_SOUNDSCAPE][frame] += water_out_l + insects_out_l;
    stem_r[KESSHO_PRODUCT_STEM_SOUNDSCAPE][frame] += water_out_r + insects_out_r;
    reverb_bus_l[frame] += water_l * water_reverb_send + insects_prefader_l * insects_reverb_send;
    reverb_bus_r[frame] += water_r * water_reverb_send + insects_prefader_r * insects_reverb_send;
    delay_a_bus_l[frame] += water_l * water_delay_a_send + insects_prefader_l * insects_delay_a_send;
    delay_a_bus_r[frame] += water_r * water_delay_a_send + insects_prefader_r * insects_delay_a_send;
    delay_b_bus_l[frame] += water_l * water_delay_b_send + insects_prefader_l * insects_delay_b_send;
    delay_b_bus_r[frame] += water_r * water_delay_b_send + insects_prefader_r * insects_delay_b_send;
    granular_bus_l[frame] += water_l * water_granular_send + insects_prefader_l * insects_granular_send;
    granular_bus_r[frame] += water_r * water_granular_send + insects_prefader_r * insects_granular_send;
    degrade_bus_l[frame] += water_l * water_degrade_send + insects_prefader_l * insects_degrade_send;
    degrade_bus_r[frame] += water_r * water_degrade_send + insects_prefader_r * insects_degrade_send;
  }
}

uint32_t KesshoProductEngine::computeActiveModuleMask() const {
  uint32_t mask = 0u;
  if (pad_module && pad_module->activeVoiceCount() > 0) {
    mask |= kModulePad;
  }
  if (lead_modules[0] && lead_modules[0]->activeVoiceCount() > 0) {
    mask |= kModuleLead1;
  }
  if (lead_modules[1] && lead_modules[1]->activeVoiceCount() > 0) {
    mask |= kModuleLead2;
  }
  if (
      drum_module &&
      (drum_module_trigger_pending || drum_module->activeVoiceCount() > 0) &&
      sourceRenderActive(sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u])) {
    mask |= kModuleDrum;
  }
  if (
      soundscapes_module &&
      transport.running &&
      soundscapeModuleShouldRun(sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u])) {
    mask |= kModuleSoundscape;
  }
  return mask;
}

void KesshoProductEngine::renderProductModules(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!modules_ready || frames == 0u) {
    return;
  }
  advancePadVoiceReleases(frames);
  const uint32_t active_module_mask = computeActiveModuleMask();
  if ((active_module_mask & kModulePad) != 0u) {
    renderPadModule(out_l, out_r, start, frames);
  } else if (pad_module) {
    pad_module->advancePadIdleTelemetry(0, static_cast<int>(frames));
    pad_module->advancePadIdleTelemetry(1, static_cast<int>(frames));
  }
  if ((active_module_mask & kModuleLead1) != 0u) {
    renderSingleModuleSource(lead_modules[0].get(), KESSHO_PRODUCT_SOURCE_LEAD1, out_l, out_r, start, frames);
  }
  if ((active_module_mask & kModuleLead2) != 0u) {
    renderSingleModuleSource(lead_modules[1].get(), KESSHO_PRODUCT_SOURCE_LEAD2, out_l, out_r, start, frames);
  }
  if ((active_module_mask & kModuleDrum) != 0u) {
    renderDrumModule(out_l, out_r, start, frames);
    drum_module_trigger_pending = false;
  }
  if ((active_module_mask & kModuleSoundscape) != 0u) {
    renderSoundscapesModule(out_l, out_r, start, frames);
  }
}
