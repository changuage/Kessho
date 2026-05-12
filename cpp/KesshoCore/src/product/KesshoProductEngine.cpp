#include "KesshoProductEngineInternal.h"

  KesshoProductEngine::KesshoProductEngine(double in_sample_rate, uint32_t in_max_block_size, uint32_t in_flags)
      : sample_rate(in_sample_rate), max_block_size(in_max_block_size), flags(in_flags) {
  modules_ready = prepareProductModules();
  loadDefaults();
}

  bool KesshoProductEngine::prepareProductModules() {
  pad_module = kessho::core::createPadModule();
  lead_modules[0] = kessho::core::createLeadFmModule();
  lead_modules[1] = kessho::core::createLeadFmModule();
  drum_module = kessho::core::createDrumModule();
  delay_a_module = kessho::core::createDelayAModule();
  delay_b_module = kessho::core::createDelayBModule();
  reverb_module = kessho::core::createReverbModule();
  granular_module = kessho::core::createGranularModule();
  spectral_freeze_module = kessho::core::createSpectralFreezeModule();
  dynamics_character_module = kessho::core::createDynamicsCharacterModule();
  if (!pad_module || !lead_modules[0] || !lead_modules[1] || !drum_module ||
      !delay_a_module || !delay_b_module || !reverb_module || !granular_module ||
      !spectral_freeze_module || !dynamics_character_module) {
    return false;
  }
  if (!pad_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !lead_modules[0]->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !lead_modules[1]->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !drum_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !delay_a_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !delay_b_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !reverb_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !granular_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !spectral_freeze_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !dynamics_character_module->prepare(sample_rate, static_cast<int>(max_block_size))) {
    return false;
  }
  return true;
}

  void KesshoProductEngine::setMasterLimiterCeilingDb(float value) {
  master_limiter_ceiling_db = clampFloat(value, -24.0f, 0.0f);
  master_limiter_ceiling_gain = dbToGain(master_limiter_ceiling_db);
}

  void KesshoProductEngine::loadDefaults() {
  transport = {};
  harmony = {};
  master_gain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_GAIN;
  setMasterLimiterCeilingDb(kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB);
  master_saturation_mode = 0u;
  master_saturation_drive = 0.0f;
  master_saturation_tone = 0.5f;
  fx = {};
  for (uint32_t i = 0; i < kGranularVoiceCount; ++i) {
    fx.granular_voices[i] = {};
    fx.granular_voices[i].enabled = i == 0u;
    fx.granular_voices[i].slice = i * 4u;
  }
  routing = {};
  rng_seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  rng_state = rng_seed;
  evolution_amount = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_EVOLUTION_AMOUNT;
  evolution_state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_EVOLUTION_STATE;
  journey_running = false;
  journey_phase = 0.0f;
  journey_rate_bars = 8.0f;
  for (uint32_t i = 0; i < kSourceCount; ++i) {
    sources[i] = {};
    sources[i].source_id = i + 1;
    sources[i].preset_id = defaultSourcePresetId(sources[i].source_id);
  }
  for (uint32_t i = 0; i < kMaxLaneCount; ++i) {
    synth_lanes[i] = {};
    synth_lanes[i].enabled = i == 0u;
    synth_lanes[i].target_source_id = (i % 2 == 0) ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_LEAD1;
    synth_lanes[i].midi_note = 60.0f + static_cast<float>((i % 4) * 7);
    synth_lanes[i].seed = rng_seed + i + 1;
    drum_lanes[i] = {};
    drum_lanes[i].enabled = i == 0u;
    drum_lanes[i].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
    drum_lanes[i].midi_note = 36.0f + static_cast<float>(i);
    drum_lanes[i].fill_count = (i == 0) ? 4u : 2u;
    drum_lanes[i].seed = rng_seed + 100u + i;
  }
  for (ModulationRange& range : modulation_ranges) {
    range = {};
  }
  resetSidechainRuntime();
  resetMasterTelemetryState();
  reverb_pre_comp_gain = 1.0f;
  telemetry.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  telemetry.sample_rate = sample_rate;
  telemetry.block_size = max_block_size;
  pad_voice_cursors[0] = 0;
  pad_voice_cursors[1] = 0;
  clearPadVoiceReleases(0u);
  resetPadPostChains();
  resetLeadPostChains();
  configureFxModules();
}

  void KesshoProductEngine::reset() {
  transport.reset();
  control_event_count = 0;
  sequencer_events.clear();
  for (Voice& voice : voices) {
    voice = {};
  }
  for (ModulationRange& range : modulation_ranges) {
    range = {};
  }
  resetSidechainRuntime();
  resetMasterTelemetryState();
  reverb_pre_comp_gain = 1.0f;
  rng_state = rng_seed;
  journey_phase = 0.0f;
  if (pad_module) {
    pad_module->reset();
  }
  for (auto& lead_module : lead_modules) {
    if (lead_module) {
      lead_module->reset();
    }
  }
  if (drum_module) {
    drum_module->reset();
  }
  if (delay_a_module) {
    delay_a_module->reset();
  }
  if (delay_b_module) {
    delay_b_module->reset();
  }
  if (reverb_module) {
    reverb_module->reset();
  }
  if (granular_module) {
    granular_module->reset();
  }
  if (spectral_freeze_module) {
    spectral_freeze_module->reset();
  }
  if (dynamics_character_module) {
    dynamics_character_module->reset();
  }
  pad_voice_cursors[0] = 0;
  pad_voice_cursors[1] = 0;
  clearPadVoiceReleases(0u);
  resetPadPostChains();
  resetLeadPostChains();
  configureFxModules();
  updateTelemetry(0);
}

extern "C" {

int32_t kessho_product_get_abi_version(void) {
  return KESSHO_PRODUCT_ABI_VERSION;
}

KesshoProductCapabilityReport kessho_product_get_capability_report(void) {
  KesshoProductCapabilityReport report{};
  report.abi_version = KESSHO_PRODUCT_ABI_VERSION;
  report.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  report.supports_full_product_graph = 0;
  report.supports_synth_sequencer = 1;
  report.supports_drum_sequencer = 1;
  report.supports_journey_morph_clock = 1;
  report.supports_harmony_core = 1;
  report.supports_core_asset_rendering = 1;
  report.supports_native_bridge = 0;
  report.supports_recordable_stems = 1;
  report.supports_cpu_telemetry = 1;
  report.legacy_fallback_count = 0;
  report.unsupported_method_count = 0;
  return report;
}

KesshoProductEngine* kessho_product_create(double sample_rate, uint32_t max_block_size, uint32_t flags) {
  if (sample_rate <= 0.0 || max_block_size == 0u ||
      max_block_size > kessho::product::generated::KESSHO_PRODUCT_MAX_BLOCK_SIZE) {
    return nullptr;
  }
  KesshoProductEngine* engine = new (std::nothrow) KesshoProductEngine(sample_rate, max_block_size, flags);
  if (engine == nullptr) {
    return nullptr;
  }
  if (!engine->modules_ready) {
    delete engine;
    return nullptr;
  }
  return engine;
}

void kessho_product_destroy(KesshoProductEngine* engine) {
  delete engine;
}

void kessho_product_reset(KesshoProductEngine* engine) {
  if (engine == nullptr) {
    return;
  }
  engine->reset();
}

int32_t kessho_product_load_snapshot_v2(
    KesshoProductEngine* engine,
    const void* snapshot_bytes,
    uint32_t snapshot_byte_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (snapshot_bytes == nullptr || snapshot_byte_count < sizeof(KesshoProductSnapshotV2)) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
  }
  const KesshoProductSnapshotV2* snapshot = static_cast<const KesshoProductSnapshotV2*>(snapshot_bytes);
  return engine->loadSnapshot(*snapshot);
}

int32_t kessho_product_enqueue_event(KesshoProductEngine* engine, const KesshoProductEvent* event) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (event == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  return engine->enqueueEvent(*event);
}

int32_t kessho_product_enqueue_events(
    KesshoProductEngine* engine,
    const KesshoProductEvent* events,
    uint32_t event_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (events == nullptr && event_count > 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  for (uint32_t i = 0; i < event_count; ++i) {
    const int32_t result = engine->enqueueEvent(events[i]);
    if (result != KESSHO_PRODUCT_OK) {
      return result;
    }
  }
  return KESSHO_PRODUCT_OK;
}

void kessho_product_render(KesshoProductEngine* engine, float* out_l, float* out_r, uint32_t frames) {
  if (engine == nullptr || out_l == nullptr || out_r == nullptr) {
    return;
  }
  engine->render(out_l, out_r, frames);
}

int32_t kessho_product_get_stem(
    KesshoProductEngine* engine,
    uint32_t stem_id,
    float* out_l,
    float* out_r,
    uint32_t frames) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_l == nullptr || out_r == nullptr || stem_id >= kStemCount) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  const uint32_t copy_frames = std::min<uint32_t>(frames, engine->last_stem_frames);
  for (uint32_t i = 0; i < copy_frames; ++i) {
    out_l[i] = engine->stem_l[stem_id][i];
    out_r[i] = engine->stem_r[stem_id][i];
  }
  for (uint32_t i = copy_frames; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
  return KESSHO_PRODUCT_OK;
}

KesshoProductTelemetry kessho_product_get_telemetry(KesshoProductEngine* engine) {
  KesshoProductTelemetry telemetry{};
  if (engine == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
    return telemetry;
  }
  return engine->telemetry;
}

int32_t kessho_product_copy_telemetry(
    KesshoProductEngine* engine,
    KesshoProductTelemetry* out_telemetry) {
  if (engine == nullptr || out_telemetry == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  *out_telemetry = engine->telemetry;
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_copy_sequencer_ui_state(
    KesshoProductEngine* engine,
    KesshoProductSequencerUiState* out_state) {
  if (engine == nullptr || out_state == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  engine->copySequencerUiState(*out_state);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_register_asset_buffer(
    KesshoProductEngine* engine,
    uint32_t asset_id,
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double asset_sample_rate,
    uint32_t flags) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (asset_id == 0u || channels == nullptr || channel_count == 0u || channel_count > 2u ||
      channels[0] == nullptr || frame_count == 0u || asset_sample_rate <= 0.0) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
    return KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
  }

  uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
      if (!engine->assets[i].active) {
        slot = i;
        break;
      }
    }
  }
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  }

  AssetSlot& asset = engine->assets[slot];
  asset.active = true;
  asset.asset_id = asset_id;
  asset.channel_count = channel_count;
  asset.frame_count = frame_count;
  asset.sample_rate = asset_sample_rate;
  asset.flags = flags;
  asset.channels[0] = channels[0];
  asset.channels[1] = channel_count > 1u ? channels[1] : channels[0];
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_unregister_asset_buffer(KesshoProductEngine* engine, uint32_t asset_id) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  const uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    return KESSHO_PRODUCT_ERROR_INVALID_ASSET_ID;
  }
  engine->assets[slot] = {};
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_debug_render_events(
    KesshoProductEngine* engine,
    KesshoSequencerEvent* out_events,
    uint32_t max_event_count,
    uint32_t frames) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_events == nullptr && max_event_count > 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  engine->sortControlEvents();
  uint32_t control_index = 0;
  while (control_index < engine->control_event_count &&
         engine->control_events[control_index].event.sample_offset == 0u) {
    engine->applyControlEvent(engine->control_events[control_index].event);
    ++control_index;
  }
  engine->advanceModulationRanges(frames);
  engine->generateSequencerEvents(frames);
  const uint32_t count = std::min<uint32_t>(engine->sequencer_events.count, max_event_count);
  for (uint32_t i = 0; i < count; ++i) {
    out_events[i] = engine->sequencer_events.events[i];
  }
  if (engine->transport.running) {
    engine->transport.sample_frame += frames;
  }
  engine->compactControlEvents(frames, control_index);
  engine->updateTelemetry(frames);
  return static_cast<int32_t>(count);
}

} // extern "C"
