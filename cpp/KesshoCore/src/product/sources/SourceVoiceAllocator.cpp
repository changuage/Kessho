#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::triggerModuleSource(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float morph,
      float distance,
      float expression,
      const kessho::core::KesshoSourcePresetPatch* preset_patch,
      float drum_delay_send,
      bool scale_velocity_by_expression) {
  if (!modules_ready) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return true;
  }

  const float frequency = midiToFrequency(clampFloat(midi_note, 0.0f, 127.0f));
  const float clamped_velocity = clampFloat(
      velocity * (scale_velocity_by_expression ? clampFloat(expression, 0.0f, 1.5f) : 1.0f),
      0.0f,
      1.0f);
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2: {
      if (!pad_module) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
        return true;
      }
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      const int route = static_cast<int>(pad_index * PAD_VOICES_PER_PAD + (pad_voice_cursors[pad_index]++ % PAD_VOICES_PER_PAD));
      const bool exact_pad_patch =
          preset_patch != nullptr &&
          preset_patch->exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
      if (exact_pad_patch) {
        pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch);
      } else if (preset_patch != nullptr) {
        pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch);
        pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
      } else {
        pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
      }
      const int voice_index = route % PAD_NUM_VOICES;
      if (pad_module->noteOn(frequency, clamped_velocity, hold_seconds, route) != 0) {
        schedulePadVoiceRelease(pad_index, static_cast<uint32_t>(voice_index), hold_seconds);
      }
      return true;
    }
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2: {
      const uint32_t lead_index = source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u;
      sources[source_id - 1u].post_lpf_tracking_midi = clampFloat(midi_note, 0.0f, 127.0f);
      if (!lead_modules[lead_index]) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
        return true;
      }
      if (preset_patch != nullptr) {
        lead_modules[lead_index]->setSourcePresetPatch(static_cast<int>(lead_index), *preset_patch);
      }
      const bool exact_lead_patch =
          preset_patch != nullptr &&
          preset_patch->exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
      if (!exact_lead_patch) {
        lead_modules[lead_index]->setTriggerMacros(morph, distance, expression);
      }
      lead_modules[lead_index]->noteOn(frequency, clamped_velocity, std::max(0.001f, hold_seconds), 0);
      return true;
    }
    case KESSHO_PRODUCT_SOURCE_DRUM: {
      if (!drum_module) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
        return true;
      }
      const int voice_type = std::clamp(roundedInt(midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1);
      if (preset_patch != nullptr) {
        drum_module->setSourcePresetPatch(0, *preset_patch);
      }
      if (std::isfinite(drum_delay_send) && drum_delay_send >= 0.0f) {
        drum_module->setVoiceSend(voice_type, drum_delay_send);
      }
      drum_module->setTriggerMacros(morph, distance, expression);
      drum_module->noteOn(0.0f, clamped_velocity, 0.0f, voice_type);
      return true;
    }
    default:
      return false;
  }
}

  void KesshoProductEngine::triggerVoice(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float event_morph ,
      float event_distance ,
      float event_expression ,
      uint32_t sample_seed ,
      uint32_t asset_id_override ,
      bool scale_velocity_by_expression ) {
  if (source_id < 1u || source_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  SourceState& source = sources[source_id - 1u];
  if (!source.enabled) {
    return;
  }

  const uint32_t resolved_seed = sample_seed == 0u
      ? hashU32(rng_seed ^ source_id ^ static_cast<uint32_t>(std::max(0.0f, midi_note * 31.0f)) ^
                static_cast<uint32_t>(transport.sample_frame))
      : sample_seed;
  source.level = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, source.level, resolved_seed);
  source.reverb_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID, source.reverb_send, resolved_seed);
  source.delay_a_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, source.delay_a_send, resolved_seed);
  source.delay_b_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID, source.delay_b_send, resolved_seed);
  source.granular_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID, source.granular_send, resolved_seed);
  const bool drum_source = source_id == KESSHO_PRODUCT_SOURCE_DRUM;
  float morph = event_morph >= 0.0f ? event_morph : (drum_source ? -1.0f : source.morph);
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

  const bool pad_source = source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2;
  const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  kessho::core::KesshoSourcePresetPatch snapshot_patch{};
  const bool snapshot_exact_pad_patch =
      pad_source &&
      source.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
  if (snapshot_exact_pad_patch) {
    snapshot_patch.exact_pad_param_count = kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
    for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT; ++param_index) {
      snapshot_patch.exact_pad_params[param_index] = source.exact_pad_params[param_index];
    }
  }
  const bool snapshot_exact_lead_patch =
      lead_source &&
      source.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
  if (snapshot_exact_lead_patch) {
    snapshot_patch.exact_lead_param_count = kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
    for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT; ++param_index) {
      snapshot_patch.exact_lead_params[param_index] = source.exact_lead_params[param_index];
    }
  }
  const bool snapshot_exact_drum_patch =
      drum_source &&
      source.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
  if (snapshot_exact_drum_patch) {
    snapshot_patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
    for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++param_index) {
      snapshot_patch.exact_drum_params[param_index] = source.exact_drum_params[param_index];
    }
  }
  const bool snapshot_generated_drum_patch = drum_source && !snapshot_exact_drum_patch;
  if (snapshot_generated_drum_patch) {
    snapshot_patch = drumVoiceMorphPatch(source);
  }
  if (
      drum_source &&
      snapshot_patch.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
    for (uint32_t param_index = 0u; param_index < kProductDrumRuntimeParamCount; ++param_index) {
      snapshot_patch.exact_drum_params[param_index] = resolveModulatedValue(
          drum_target,
          kProductDrumRuntimeParamIdBase + param_index,
          snapshot_patch.exact_drum_params[param_index],
          resolved_seed);
    }
  }
  const bool snapshot_exact_patch =
      snapshot_exact_pad_patch || snapshot_exact_lead_patch || snapshot_exact_drum_patch || snapshot_generated_drum_patch;
  const auto* preset = snapshot_exact_patch ? nullptr : findSourcePreset(source.preset_id);
  const kessho::core::KesshoSourcePresetPatch preset_patch = snapshot_exact_patch
      ? snapshot_patch
      : sourcePresetPatch(preset);
  const bool exact_pad_patch =
      pad_source &&
      preset_patch.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
  const bool exact_lead_patch =
      lead_source &&
      preset_patch.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
  const bool exact_drum_patch =
      drum_source &&
      preset_patch.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
  if (!exact_pad_patch && !exact_lead_patch && !exact_drum_patch) {
    applySourcePresetMacros(source, morph, distance, expression);
  }
  const kessho::core::KesshoSourcePresetPatch* preset_patch_ptr =
      (snapshot_exact_patch || preset != nullptr) ? &preset_patch : nullptr;

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
          scale_velocity_by_expression)) {
    return;
  }

  const uint32_t voice_index = allocateVoice();
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
      return;
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
    voice.remaining_frames = assets[slot].frame_count;
    voice.total_frames = std::max(1u, voice.remaining_frames);
    if (source_id == KESSHO_PRODUCT_SOURCE_PIANO) {
      const auto seconds_to_frames = [this](float seconds) -> uint32_t {
        if (!std::isfinite(seconds) || seconds <= 0.0f || sample_rate <= 0.0) {
          return 1u;
        }
        return std::max<uint32_t>(1u, static_cast<uint32_t>(std::ceil(static_cast<double>(seconds) * sample_rate)));
      };
      const float piano_distance = clampFloat(distance, 0.0f, 1.0f);
      const float attack_base_unmodulated = resolveModulatedValue(
          source_id,
          KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID,
          source.attack_seconds,
          resolved_seed);
      const float decay_base_unmodulated = resolveModulatedValue(
          source_id,
          KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID,
          source.decay_seconds,
          resolved_seed);
      const float sustain_base_unmodulated = resolveModulatedValue(
          source_id,
          KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID,
          source.sustain,
          resolved_seed);
      const float release_base_unmodulated = resolveModulatedValue(
          source_id,
          KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID,
          source.release_seconds,
          resolved_seed);
      const float hold_base_unmodulated = resolveModulatedValue(
          source_id,
          KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID,
          source.hold_seconds,
          resolved_seed);
      const float attack_base = (std::abs(piano_distance) <= 0.0001f || attack_base_unmodulated > 0.005f)
          ? attack_base_unmodulated
          : attack_base_unmodulated + 0.1f;
      const float attack_seconds = clampFloat(
          distanceMultiply(attack_base, piano_distance, 1.35f, 4.5f),
          0.001f,
          2.0f);
      const float decay_seconds = clampFloat(
          distanceMultiply(decay_base_unmodulated, piano_distance, 0.96f, 0.80f),
          0.01f,
          4.0f);
      const float hold = clampFloat(hold_base_unmodulated, 0.0f, 4.0f);
      const float hold_seconds_resolved = clampFloat(
          distanceAdd(hold, piano_distance, -0.03f, -0.18f),
          0.0f,
          4.0f);
      const float release_seconds = clampFloat(
          distanceMultiply(release_base_unmodulated, piano_distance, 1.12f, 1.80f),
          0.01f,
          8.0f);
      voice.piano_sample_voice = true;
      voice.pan = 0.0f;
      voice.envelope_attack_frames = seconds_to_frames(attack_seconds);
      voice.envelope_decay_frames = seconds_to_frames(decay_seconds);
      voice.envelope_hold_frames = hold_seconds_resolved <= 0.0f
          ? 0u
          : static_cast<uint32_t>(std::ceil(static_cast<double>(hold_seconds_resolved) * sample_rate));
      voice.envelope_release_frames = seconds_to_frames(release_seconds);
      voice.envelope_sustain = clampFloat(
          distanceAdd(sustain_base_unmodulated, piano_distance, -0.04f, -0.22f),
          0.0f,
          1.0f);
      voice.amplitude = clampFloat(velocity, 0.0f, 1.0f);
      const uint32_t envelope_tail_frames = seconds_to_frames(kPianoEnvelopePostReleaseTailSeconds);
      const uint64_t envelope_stop_frames =
          static_cast<uint64_t>(voice.envelope_attack_frames) +
          static_cast<uint64_t>(voice.envelope_decay_frames) +
          static_cast<uint64_t>(voice.envelope_hold_frames) +
          static_cast<uint64_t>(voice.envelope_release_frames) +
          static_cast<uint64_t>(envelope_tail_frames);
      const double step = std::max(0.000001, voice.sample_step);
      const uint32_t source_duration_frames = std::max<uint32_t>(
          1u,
          static_cast<uint32_t>(std::ceil(static_cast<double>(assets[slot].frame_count) / step)));
      voice.remaining_frames = std::min<uint32_t>(
          source_duration_frames,
          static_cast<uint32_t>(std::min<uint64_t>(envelope_stop_frames, UINT32_MAX)));
      voice.total_frames = std::max(1u, voice.remaining_frames);
    }
    if (source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE && voice.looping) {
      if (soundscapeParityFixtureEnabled(source)) {
        voice.sample_position = 0.0;
        voice.amplitude = source.level;
        voice.pan = 0.0f;
        voice.sample_step = base_step;
        return;
      }
      voice.sample_position = soundscapeRandomStartFrame(assets[slot], resolved_seed);
      voice.amplitude *= soundscapeLayerLevel(assets[slot], resolved_seed);
      voice.pan = soundscapeLayerPan(assets[slot], resolved_seed, distance);
      voice.sample_step *= soundscapeLayerPlaybackRate(assets[slot], resolved_seed);
    }
  }
}
