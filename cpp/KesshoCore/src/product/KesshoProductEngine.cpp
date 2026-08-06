#include "KesshoProductEngineInternal.h"

#include <new>

  KesshoProductEngine::KesshoProductEngine(double in_sample_rate, uint32_t in_max_block_size, uint32_t in_flags)
      : sample_rate(in_sample_rate), max_block_size(in_max_block_size), flags(in_flags),
        journey_schedule_runtime_storage(std::make_unique<ProductJourneyScheduleRuntimeState>()),
        journey_schedule_runtime(*journey_schedule_runtime_storage) {
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
  dynamics_drift_module = kessho::core::createDynamicsDriftModule();
  dynamics_degrade_send_module = kessho::core::createDynamicsDriftModule();
  soundscapes_module = kessho::core::createSoundscapesModule();
  if (!pad_module || !lead_modules[0] || !lead_modules[1] || !drum_module ||
      !delay_a_module || !delay_b_module || !reverb_module || !granular_module ||
      !spectral_freeze_module || !dynamics_drift_module || !dynamics_degrade_send_module || !soundscapes_module) {
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
      !dynamics_drift_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !dynamics_degrade_send_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
      !soundscapes_module->prepare(sample_rate, static_cast<int>(max_block_size))) {
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
  fx = {};
  for (uint32_t i = 0; i < kGranularVoiceCount; ++i) {
    fx.granular_voices[i] = {};
    fx.granular_voices[i].enabled = i == 0u;
    fx.granular_voices[i].slice = i * 4u;
  }
  routing = {};
  rng_seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  rng_state = rng_seed;
  resetSonicRuntimeState();
  scatter_runtime = {};
  scene_program_runtime = {};
  // This member is already value-initialized. Aggregate assignment would create
  // the multi-megabyte schedule bank on the constrained WASM stack.
  auto_cycle_runtime = {};
  routing_mute_groups = {};
  resetHarmonyClock();
  resetArrangementRuntime();
  sequencer_evolve_rng_stream_seed = 0u;
  sequencer_evolve_rng_stream_state = 0u;
  sequencer_evolve_rng_stream_initialized = false;
  generated_sequencer_capture_config = {};
  generated_sequencer_capture_ring.reset();
  generated_sequencer_capture_event_counter = 1u;
  simple_sequencer_visual_ring.reset();
  simple_sequencer_visual_event_counter = 1u;
  synth_sequencer_chain = {};
  drum_sequencer_chain = {};
  evolution_amount = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_EVOLUTION_AMOUNT;
  evolution_state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_EVOLUTION_STATE;
  journey_running = false;
  journey_phase = 0.0f;
  journey_rate_bars = 8.0f;
  for (uint32_t i = 0; i < kSourceCount; ++i) {
    sources[i] = {};
    sources[i].source_id = i + 1;
    sources[i].preset_id = defaultSourcePresetId(sources[i].source_id);
    if (sources[i].source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
        if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
          continue;
        }
        const auto* default_preset = defaultDrumVoicePreset(voice.index);
        if (default_preset != nullptr) {
          sources[i].drum_voice_preset_a_ids[voice.index] = default_preset->id;
          sources[i].drum_voice_preset_b_ids[voice.index] = default_preset->id;
        }
      }
    }
    compileSourcePresetRuntime(sources[i]);
  }
  for (uint32_t i = 0; i < kMaxLaneCount; ++i) {
    synth_lanes[i] = {};
    synth_lanes[i].sequencer_mode = kSequencerModeEuclid;
    synth_lanes[i].enabled = i == 0u;
    synth_lanes[i].target_source_id = (i % 2 == 0) ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_LEAD1;
    synth_lanes[i].midi_note = 60.0f + static_cast<float>((i % 4) * 7);
    synth_lanes[i].seed = rng_seed + i + 1;
    synth_lanes[i].anchor_walker = {};
    synth_lanes[i].anchor_walker.enabled = true;
    synth_lanes[i].anchor_walker.target_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
    synth_lanes[i].anchor_walker.manual_anchor_midi = 60.0f + static_cast<float>(i * 2u);
    synth_lanes[i].anchor_walker.seed = rng_seed + 1000u + i;
    synth_lanes[i].anchor_walker.layers[0].enabled = true;
    synth_lanes[i].anchor_walker.layers[0].diatonic_offset = 0;
    synth_lanes[i].anchor_walker.layers[0].delay_seconds = 0.0f;
    synth_lanes[i].orbit = {};
    synth_lanes[i].orbit.enabled = true;
    synth_lanes[i].orbit.target_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
    synth_lanes[i].orbit.base_angle = static_cast<float>(i) * 0.12f;
    synth_lanes[i].orbit.prev_base_angle = synth_lanes[i].orbit.base_angle;
    synth_lanes[i].orbit.authored_base_angle = synth_lanes[i].orbit.base_angle;
    synth_lanes[i].orbit.note_count = 6u;
    synth_lanes[i].orbit.seed = rng_seed + 3000u + i;
    for (uint32_t note = 0u; note < synth_lanes[i].orbit.note_count; ++note) {
      OrbitNoteState& orbit_note = synth_lanes[i].orbit.notes[note];
      orbit_note.enabled = true;
      orbit_note.radius_norm = 0.34f + static_cast<float>(note % 3u) * 0.19f;
      orbit_note.angle = static_cast<float>(kTwoPi * static_cast<double>(note) / 6.0);
      orbit_note.prev_angle = orbit_note.angle;
      orbit_note.authored_phase = orbit_note.angle;
      orbit_note.speed_mode = 1u;
      orbit_note.speed_value = note % 3u == 0u ? 1.0f : (note % 3u == 1u ? 2.0f : 4.0f);
      orbit_note.direction = note % 3u == 0u ? -1 : 1;
      orbit_note.pitch_mode = 1u;
      orbit_note.harmony_degree = static_cast<int32_t>((note * 2u) % 7u);
      orbit_note.midi_note = 60.0f + static_cast<float>(note);
      orbit_note.seed = rng_seed + 4000u + note + i * 31u;
    }
    drum_lanes[i] = {};
    drum_lanes[i].sequencer_mode = kSequencerModeEuclid;
    drum_lanes[i].enabled = i == 0u;
    drum_lanes[i].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
    drum_lanes[i].midi_note = midiNoteForDrumVoice(std::min<uint32_t>(i, DRUM_NUM_VOICE_TYPES - 1u));
    drum_lanes[i].fill_count = (i == 0) ? 4u : 2u;
    drum_lanes[i].seed = rng_seed + 100u + i;
  }
  for (ModulationRange& range : modulation_ranges) {
    range = {};
  }
  resetModulationRouteCache();
  resetFxSampleHoldOwners();
  resetSidechainRuntime();
  resetMasterTelemetryState();
  reverb_pre_comp_gain = 1.0f;
  resetReverbHarmonyCoupling();
  resetGranularPhraseRuntime();
  granular_output_lpf = {};
  granular_reverb_lpf = {};
  granular_reverb_comp_gain = 1.0f;
  std::fill(delay_a_cross_carry_l, delay_a_cross_carry_l + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  std::fill(delay_a_cross_carry_r, delay_a_cross_carry_r + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  resetDiffuseRuntime();
  telemetry.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  telemetry.sample_rate = sample_rate;
  telemetry.block_size = max_block_size;
  active_voice_count = 0u;
  active_source_mask = 0u;
  active_voice_list_dirty = true;
  drum_module_trigger_pending = false;
  resetSoundscapeTextureRuntimes();
  product_render_frame = 0u;
  pad_voice_cursors[0] = 0;
  pad_voice_cursors[1] = 0;
  clearPadVoiceReleases(0u);
  resetMidiRuntimeState();
  resetPadPostChains();
  resetLeadPostChains();
  configureFxModules();
}

  void KesshoProductEngine::reset() {
  transport.reset();
  audio_render_sample_frame = 0u;
  snapshot_loaded_once = false;
  control_event_count = 0;
  pending_phrase_timing_event_count = 0u;
  pending_phrase_timing_apply_frame = 0u;
  sequencer_events.clear();
  for (LaneState& lane : synth_lanes) {
    resetSequencerLaneRuntime(lane);
  }
  for (LaneState& lane : drum_lanes) {
    resetSequencerLaneRuntime(lane);
  }
  for (Voice& voice : voices) {
    voice = {};
  }
  active_voice_count = 0u;
  active_source_mask = 0u;
  active_voice_list_dirty = true;
  drum_module_trigger_pending = false;
  for (ModulationRange& range : modulation_ranges) {
    range = {};
  }
  resetModulationRouteCache();
  resetFxSampleHoldOwners();
  resetSidechainRuntime();
  resetMasterTelemetryState();
  reverb_pre_comp_gain = 1.0f;
  resetReverbHarmonyCoupling();
  resetGranularPhraseRuntime();
  granular_output_lpf = {};
  granular_reverb_lpf = {};
  granular_reverb_comp_gain = 1.0f;
  std::fill(delay_a_cross_carry_l, delay_a_cross_carry_l + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  std::fill(delay_a_cross_carry_r, delay_a_cross_carry_r + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  resetDiffuseRuntime();
  rng_state = rng_seed;
  resetSonicRuntimeState();
  scatter_runtime = {};
  scene_program_runtime = {};
  journey_schedule_runtime.~ProductJourneyScheduleRuntimeState();
  new (&journey_schedule_runtime) ProductJourneyScheduleRuntimeState{};
  generated_sequencer_capture_config = {};
  generated_sequencer_capture_ring.reset();
  generated_sequencer_capture_event_counter = 1u;
  simple_sequencer_visual_ring.reset();
  simple_sequencer_visual_event_counter = 1u;
  sequencer_evolve_rng_stream_seed = 0u;
  sequencer_evolve_rng_stream_state = 0u;
  sequencer_evolve_rng_stream_initialized = false;
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
  if (dynamics_drift_module) {
    dynamics_drift_module->reset();
  }
  if (dynamics_degrade_send_module) {
    dynamics_degrade_send_module->reset();
  }
  if (soundscapes_module) {
    soundscapes_module->reset();
    soundscapes_module_params_configured = false;
  }
  for (SourceState& source : sources) {
    source.applied_module_patch_ptr = nullptr;
    source.applied_module_patch_revision = 0u;
  }
  resetSoundscapeTextureRuntimes();
  product_render_frame = 0u;
  pad_voice_cursors[0] = 0;
  pad_voice_cursors[1] = 0;
  clearPadVoiceReleases(0u);
  resetMidiRuntimeState();
  resetPadPostChains();
  resetLeadPostChains();
  configureFxModules();
  configureSoundscapesModuleFromSource();
  updateTelemetry(0);
}
