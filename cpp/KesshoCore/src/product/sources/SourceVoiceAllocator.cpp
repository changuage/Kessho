#include "../KesshoProductEngineInternal.h"

  uint32_t KesshoProductEngine::triggerVoice(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float event_morph ,
      float event_distance ,
      float event_expression ,
      uint32_t sample_seed ,
      uint32_t asset_id_override ,
      bool scale_velocity_by_expression ,
      float drum_pitch_offset ,
      float drum_ratchet_decay_cap ,
      float drum_ratchet_attack_cap ,
      uint32_t pad_voice_index ,
      float synth_ratchet_factor ) {
  if (source_id < 1u || source_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return kProductInvalidVoiceIndex;
  }
  SourceState& source = sources[source_id - 1u];
  if (!source.enabled) {
    return kProductInvalidVoiceIndex;
  }
  const bool source_was_idle = !sourceRuntimeActive(source_id);
  const uint32_t resolved_seed = sample_seed == 0u
      ? hashU32(rng_seed ^ source_id ^ static_cast<uint32_t>(std::max(0.0f, midi_note * 31.0f)) ^
                static_cast<uint32_t>(transport.sample_frame))
      : sample_seed;
  source.level = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, source.level, resolved_seed);
  source.reverb_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID, source.reverb_send, resolved_seed);
  source.delay_a_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, source.delay_a_send, resolved_seed);
  source.delay_b_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID, source.delay_b_send, resolved_seed);
  source.granular_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID, source.granular_send, resolved_seed);
  if (source_was_idle) {
    primeGranularControlsForSourceStart(source_id);
  }
  const bool drum_source = source_id == KESSHO_PRODUCT_SOURCE_DRUM;
  const bool event_morph_override = event_morph >= 0.0f;
  float morph = event_morph_override ? event_morph : (drum_source ? -1.0f : source.morph);
  float distance = event_distance >= 0.0f ? event_distance : (drum_source ? -1.0f : source.distance);
  float expression = event_expression >= 0.0f ? event_expression : (drum_source ? 1.0f : source.expression);
  if (!drum_source) {
    morph = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph, resolved_seed);
    distance = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance, resolved_seed);
  }
  expression = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression, resolved_seed);
  float drum_delay_send = -1.0f;
  uint32_t drum_voice = 0u;
  if (drum_source) {
    drum_voice = static_cast<uint32_t>(std::clamp(roundedInt(midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1));
    const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
    morph = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph, resolved_seed);
    distance = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance, resolved_seed);
    expression = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression, resolved_seed);
    drum_delay_send = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, source.delay_a_send, resolved_seed);
    triggerSidechainDuck(drum_voice, clampFloat(velocity * expression, 0.0f, 1.0f));
  }
  triggerFxSampleHoldRanges(
      source_id,
      fxSampleHoldSourceStrength(kProductSampleHoldTriggerDelayA, source_id, drum_delay_send),
      fxSampleHoldSourceStrength(kProductSampleHoldTriggerDelayB, source_id, drum_delay_send),
      fxSampleHoldSourceStrength(kProductSampleHoldTriggerGranular, source_id, drum_delay_send),
      fxSampleHoldSourceStrength(kProductSampleHoldTriggerReverb, source_id, drum_delay_send),
      resolved_seed);
  const bool pad_source = isPadProductSource(source_id);
  const bool lead_source = isLeadProductSource(source_id);
  kessho::core::KesshoSourcePresetPatch endpoint_morph_patch{};
  const kessho::core::KesshoSourcePresetPatch* endpoint_morph_patch_ptr = nullptr;
  if ((pad_source || lead_source) && source.source_preset_endpoint_valid) {
    endpoint_morph_patch_ptr = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        morph,
        distance,
        endpoint_morph_patch);
  }
  const bool endpoint_morph_patch_valid = endpoint_morph_patch_ptr != nullptr;
  kessho::core::KesshoSourcePresetPatch snapshot_patch{};
  const bool drum_trigger_morph_patch_required =
      drum_source &&
      morph >= 0.0f;
  if (drum_source) {
    snapshot_patch = source.source_preset_patch;
  }
  if (drum_trigger_morph_patch_required) {
    applyDrumVoiceMorphToPatch(snapshot_patch, source, drum_voice, morph);
  }
  if (drum_source) {
    applyDrumSourceMixFieldsToPatch(snapshot_patch, source.level, source.reverb_send);
  }
  if (
      drum_source &&
      snapshot_patch.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
    for (uint32_t param_index = 0u; param_index < kProductDrumRuntimeParamCount; ++param_index) {
      if (!drumRuntimeParamModulated(drum_voice, param_index)) {
        continue;
      }
      snapshot_patch.exact_drum_params[param_index] = resolveModulatedValue(
          drum_target,
          kProductDrumRuntimeParamIdBase + param_index,
          snapshot_patch.exact_drum_params[param_index],
          resolved_seed);
    }
  }
  const bool module_source = pad_source || lead_source || drum_source;
  const bool use_snapshot_patch =
      (drum_source && snapshot_patch.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
  kessho::core::KesshoSourcePresetPatch preset_patch{};
  const kessho::core::KesshoSourcePresetPatch* preset_patch_ptr = nullptr;
  if (endpoint_morph_patch_valid) {
    preset_patch_ptr = endpoint_morph_patch_ptr;
  } else if (use_snapshot_patch) {
    preset_patch = snapshot_patch;
    preset_patch_ptr = &preset_patch;
  } else if (module_source && source.source_preset_patch_valid) {
    preset_patch_ptr = &source.source_preset_patch;
  }
  const bool exact_pad_patch =
      (pad_source &&
       preset_patch_ptr != nullptr &&
       preset_patch_ptr->exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT);
  const bool exact_lead_patch =
      (lead_source &&
       preset_patch_ptr != nullptr &&
       preset_patch_ptr->exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT);
  const bool exact_drum_patch =
      (drum_source &&
       preset_patch_ptr != nullptr &&
       preset_patch_ptr->exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
  if (!exact_pad_patch && !exact_lead_patch && !exact_drum_patch) {
    applySourcePresetMacros(source, morph, distance, expression);
  }
  uint32_t module_voice_index = kProductInvalidVoiceIndex;
  if (triggerModuleSource(
          source_id,
          midi_note,
          velocity,
          hold_seconds,
          morph,
          distance,
          expression,
          preset_patch_ptr,
          drum_delay_send,
          scale_velocity_by_expression,
          drum_pitch_offset,
          drum_ratchet_decay_cap,
          drum_ratchet_attack_cap,
          synth_ratchet_factor,
          pad_voice_index,
          &module_voice_index)) {
    return module_voice_index;
  }
  const uint32_t voice_index = allocateVoice();
  clearMidiRuntimeForSampleVoice(voice_index);
  Voice& voice = voices[voice_index];
  voice = {};
  voice.active = true;
  voice.source_id = source_id;
  voice.frequency = midiToFrequency(clampFloat(midi_note, 0.0f, 127.0f));
  voice.amplitude = clampFloat(velocity * expression, 0.0f, 1.0f);
  voice.remaining_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(hold_seconds * sample_rate));
  voice.total_frames = voice.remaining_frames;
  voice.phase = hashUnit(rng_state ^ source_id ^ voice_index) * kTwoPi;
  voice.pan = ((hashUnit(rng_state + voice_index * 17u) * 2.0f) - 1.0f) * (0.25f + distance * 0.75f);
  voice.drum_voice = source_id == KESSHO_PRODUCT_SOURCE_DRUM;
  if (source_id == KESSHO_PRODUCT_SOURCE_PIANO || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
    const float requested_midi = clampFloat(midi_note, 0.0f, 127.0f);
    float asset_root_midi = requested_midi;
    const uint32_t slot = source_id == KESSHO_PRODUCT_SOURCE_PIANO
        ? findPianoAssetSlot(requested_midi, velocity, asset_root_midi)
        : findAssetSlot(asset_id_override != 0u ? asset_id_override : source.asset_id);
    if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
      voice.active = false;
      reportMissingSourceAsset(source, asset_id_override != 0u ? asset_id_override : source.asset_id);
      return kProductInvalidVoiceIndex;
    }
    source.last_missing_asset_id = 0u;
    voice.sample_voice = true;
    voice.asset_slot = slot;
    voice.sample_position = 0.0;
    const double base_step = assets[slot].sample_rate / sample_rate;
    const double pitch_step = source_id == KESSHO_PRODUCT_SOURCE_PIANO
        ? static_cast<double>(voice.frequency) / static_cast<double>(midiToFrequency(asset_root_midi))
        : 1.0;
    voice.sample_step = base_step * pitch_step;
    voice.looping = (assets[slot].flags & KESSHO_PRODUCT_ASSET_LOOP) != 0u;
    voice.loop_crossfade_frames = voice.looping ? loopCrossfadeFrames(assets[slot]) : 0u;
    voice.remaining_frames = assets[slot].frame_count;
    voice.total_frames = std::max(1u, voice.remaining_frames);
    if (source_id == KESSHO_PRODUCT_SOURCE_PIANO) {
      configurePianoSampleVoiceEnvelope(voice, source, velocity, distance, resolved_seed, slot);
    }
    if (source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE && voice.looping) {
      if (soundscapeParityFixtureEnabled(source)) {
        voice.sample_position = 0.0;
        voice.amplitude = source.level;
        voice.pan = 0.0f;
        voice.sample_step = base_step;
        return voice_index;
      }
      voice.sample_position = soundscapeRandomStartFrame(assets[slot], resolved_seed);
      voice.amplitude *= soundscapeLayerLevel(assets[slot], resolved_seed);
      voice.pan = soundscapeLayerPan(assets[slot], resolved_seed, distance);
      voice.sample_step *= soundscapeLayerPlaybackRate(assets[slot], resolved_seed);
    }
  }
  return voice_index;
}
