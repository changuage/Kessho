#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::isSourceParam(uint32_t param_id) const {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
      return true;
    default:
      return false;
  }
}

  bool KesshoProductEngine::isSourceTarget(uint32_t target_id) const {
  return target_id >= 1u && target_id <= kSourceCount;
}

  bool KesshoProductEngine::isDrumRangeTarget(uint32_t target_id) const {
  return target_id >= KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE &&
      target_id < KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + DRUM_NUM_VOICE_TYPES;
}

  ModulationRange* KesshoProductEngine::findModulationRange(uint32_t target_id, uint32_t param_id) {
  for (ModulationRange& range : modulation_ranges) {
    if (range.active && range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  return nullptr;
}

  const ModulationRange* KesshoProductEngine::findModulationRange(uint32_t target_id, uint32_t param_id) const {
  for (const ModulationRange& range : modulation_ranges) {
    if (range.active && range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  return nullptr;
}

  ModulationRange* KesshoProductEngine::findOrAllocateModulationRange(uint32_t target_id, uint32_t param_id) {
  for (ModulationRange& range : modulation_ranges) {
    if (range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  for (ModulationRange& range : modulation_ranges) {
    if (!range.active) {
      return &range;
    }
  }
  return nullptr;
}

  void KesshoProductEngine::applyModulationRangeEvent(const KesshoProductEvent& event) {
  const uint32_t target_id = event.target_id;
  const uint32_t param_id = event.param_id;
  const uint32_t mode = static_cast<uint32_t>(std::max(0.0f, std::round(event.value3)));
  const bool active = (event.flags & KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE) != 0u &&
      mode != KESSHO_PRODUCT_MODULATION_RANGE_OFF;
  if (param_id == 0u || (!isSourceTarget(target_id) && !isDrumRangeTarget(target_id) && target_id != 0u)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  if (isDrumRangeTarget(target_id) && !isSourceParam(param_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }

  ModulationRange* range = findOrAllocateModulationRange(target_id, param_id);
  if (range == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return;
  }
  if (!active) {
    *range = {};
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }

  const float min_value = std::min(event.value, event.value2);
  const float max_value = std::max(event.value, event.value2);
  range->active = true;
  range->control_id = event.index == 0u ? hashU32(target_id ^ (param_id * 16777619u)) : event.index;
  range->target_id = target_id;
  range->param_id = param_id;
  range->mode = mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
      ? KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
      : KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD;
  range->min_value = min_value;
  range->max_value = max_value;
  const float fallback_current = (min_value + max_value) * 0.5f;
  range->current_value = clampFloat(
      std::isfinite(event.value4) ? event.value4 : fallback_current,
      min_value,
      max_value);
  range->seed = hashU32(rng_seed ^ range->control_id ^ range->target_id ^ range->param_id);
  const float direction = hashUnit(range->seed ^ 0xa511e9b3u) < 0.5f ? -1.0f : 1.0f;
  const float span = std::max(0.0001f, max_value - min_value);
  range->velocity = direction * span * (0.015f + hashUnit(range->seed ^ 0x63d83595u) * 0.025f);
  if (target_id == 0u && range->mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
    KesshoProductEvent param_event{};
    param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    param_event.target_id = 0u;
    param_event.param_id = range->param_id;
    param_event.value = range->current_value;
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    applyParam(param_event);
    return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::applySourcePresetEvent(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  const uint32_t preset_id = event.value <= 0.0f ? 0u : static_cast<uint32_t>(std::lround(event.value));
  sources[event.target_id - 1u].preset_id = preset_id;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::applySourcePresetMacros(const SourceState& source, float& morph, float& distance, float& expression) const {
  const auto* preset = findSourcePreset(source.preset_id);
  if (preset == nullptr) {
    return;
  }
  morph = clampFloat(morph + preset->macro_morph, 0.0f, 1.0f);
  distance = clampFloat(distance + preset->macro_distance, 0.0f, 1.0f);
  expression = clampFloat(expression * preset->macro_expression, 0.0f, 1.0f);
}

  kessho::core::KesshoSourcePresetPatch KesshoProductEngine::drumVoiceMorphPatch(const SourceState& source) const {
  auto patch = sourcePresetPatch(findSourcePreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT));
  if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
    for (uint32_t i = 0; i < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++i) {
      patch.exact_drum_params[i] = 0.0f;
    }
  }

  for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
    if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
      continue;
    }
    const auto* preset_a = findDrumVoicePreset(voice.index, source.drum_voice_preset_a_ids[voice.index]);
    const auto* preset_b = findDrumVoicePreset(voice.index, source.drum_voice_preset_b_ids[voice.index]);
    if (preset_a == nullptr && preset_b == nullptr) {
      continue;
    }
    if (preset_a == nullptr) {
      preset_a = preset_b;
    }
    if (preset_b == nullptr) {
      preset_b = preset_a;
    }

    const float morph = clampFloat(source.drum_voice_morphs[voice.index], 0.0f, 1.0f);
    const float smooth = smoothstep01(morph);
    const uint32_t end = std::min<uint32_t>(
        voice.param_start + voice.param_count,
        kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
    for (uint32_t param_index = voice.param_start; param_index < end; ++param_index) {
      const float a = preset_a->params[param_index];
      const float b = preset_b->params[param_index];
      patch.exact_drum_params[param_index] = drumParamUsesPresetSnap(param_index)
          ? (morph < 0.5f ? a : b)
          : a + (b - a) * smooth;
    }
  }
  return patch;
}

  bool KesshoProductEngine::exactPadMacrosDifferFromDefaults(float morph, float distance, float expression) const {
  return std::abs(morph) > 0.0001f ||
         std::abs(distance) > 0.0001f ||
         std::abs(expression - kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION) > 0.0001f;
}

  float KesshoProductEngine::modulationRangeSample(const ModulationRange& range, float fallback, uint32_t sample_seed) const {
  if (!range.active) {
    return fallback;
  }
  if (range.max_value <= range.min_value) {
    return range.min_value;
  }
  if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
    return clampFloat(range.current_value, range.min_value, range.max_value);
  }
  const float position = hashUnit(range.seed ^ sample_seed ^ (range.target_id * 2246822519u) ^ (range.param_id * 3266489917u));
  return range.min_value + (range.max_value - range.min_value) * position;
}

  float KesshoProductEngine::resolveModulatedValue(uint32_t target_id, uint32_t param_id, float fallback, uint32_t sample_seed) const {
  const ModulationRange* range = findModulationRange(target_id, param_id);
  if (range == nullptr) {
    return fallback;
  }
  return modulationRangeSample(*range, fallback, sample_seed);
}

  void KesshoProductEngine::applyRuntimeWalkValue(const ModulationRange& range) {
  if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
    return;
  }
  if (isDrumRangeTarget(range.target_id)) {
    if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID && drum_module) {
      const int voice = static_cast<int>(range.target_id - KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE);
      drum_module->setVoiceSend(voice, range.current_value);
    }
    return;
  }
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.target_id = range.target_id;
  event.param_id = range.param_id;
  event.value = range.current_value;
  applyParam(event);
}

  void KesshoProductEngine::advanceModulationRanges(uint32_t frames) {
  if (frames == 0u) {
    return;
  }
  const float beats = static_cast<float>(static_cast<double>(frames) / transport.samplesPerBeat(sample_rate));
  for (ModulationRange& range : modulation_ranges) {
    if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
      continue;
    }
    if (range.max_value <= range.min_value) {
      range.current_value = range.min_value;
      applyRuntimeWalkValue(range);
      continue;
    }
    const float span = range.max_value - range.min_value;
    const uint32_t time_seed = static_cast<uint32_t>(transport.sample_frame) ^ static_cast<uint32_t>(transport.sample_frame >> 32);
    const float jitter = (hashUnit(range.seed ^ time_seed ^ 0x9e3779b9u) - 0.5f) * span * 0.01f;
    range.current_value += (range.velocity + jitter) * beats;
    if (range.current_value <= range.min_value) {
      range.current_value = range.min_value;
      range.velocity = std::abs(range.velocity);
    } else if (range.current_value >= range.max_value) {
      range.current_value = range.max_value;
      range.velocity = -std::abs(range.velocity);
    }
    applyRuntimeWalkValue(range);
  }
}

  void KesshoProductEngine::applySourceParam(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }

  SourceState& source = sources[event.target_id - 1u];
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
      source.enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
      source.level = clampFloat(event.value, 0.0f, 1.5f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
      source.morph = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
      source.distance = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
      source.expression = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
      source.dry_gain = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
      source.reverb_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
      source.delay_a_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
      source.delay_b_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
      source.granular_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
      source.post_lpf_hz = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
      source.stereo_width = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
      source.post_lpf_key_tracking = clampFloat(event.value, 0.0f, 1.0f);
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      break;
  }
}

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
      const int route = static_cast<int>(pad_index * PAD_NUM_VOICES + (pad_voice_cursors[pad_index]++ % PAD_NUM_VOICES));
      const bool exact_pad_patch =
          preset_patch != nullptr &&
          preset_patch->exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
      if (exact_pad_patch) {
        pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch);
        if (exactPadMacrosDifferFromDefaults(morph, distance, expression)) {
          pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
        }
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
  float morph = event_morph >= 0.0f ? event_morph : source.morph;
  float distance = event_distance >= 0.0f ? event_distance : source.distance;
  float expression = event_expression >= 0.0f ? event_expression : source.expression;
  morph = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph, resolved_seed);
  distance = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance, resolved_seed);
  expression = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression, resolved_seed);

  float drum_delay_send = -1.0f;
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    const uint32_t drum_voice = static_cast<uint32_t>(std::clamp(roundedInt(midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1));
    const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
    morph = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph, resolved_seed);
    distance = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance, resolved_seed);
    expression = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression, resolved_seed);
    drum_delay_send = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, source.delay_a_send, resolved_seed);
    triggerSidechainDuck(drum_voice, clampFloat(velocity * expression, 0.0f, 1.0f));
  }

  const bool pad_source = source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2;
  const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  const bool drum_source = source_id == KESSHO_PRODUCT_SOURCE_DRUM;
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
  voice.amplitude = clampFloat(velocity * expression, 0.0f, 1.0f) * source.level;
  voice.remaining_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(hold_seconds * sample_rate));
  voice.total_frames = voice.remaining_frames;
  voice.phase = hashUnit(rng_state ^ source_id ^ voice_index) * kTwoPi;
  voice.pan = ((hashUnit(rng_state + voice_index * 17u) * 2.0f) - 1.0f) * (0.25f + distance * 0.75f);
  voice.drum_voice = source_id == KESSHO_PRODUCT_SOURCE_DRUM;

  if (source_id == KESSHO_PRODUCT_SOURCE_PIANO || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
    const float requested_midi = clampFloat(midi_note, 0.0f, 127.0f);
    float asset_root_midi = requested_midi;
    const uint32_t slot = source_id == KESSHO_PRODUCT_SOURCE_PIANO
        ? findPianoAssetSlot(requested_midi, asset_root_midi)
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
    if (source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE && voice.looping) {
      voice.sample_position = soundscapeRandomStartFrame(assets[slot], resolved_seed);
      voice.amplitude *= soundscapeLayerLevel(assets[slot], resolved_seed);
      voice.pan = soundscapeLayerPan(assets[slot], resolved_seed, distance);
      voice.sample_step *= soundscapeLayerPlaybackRate(assets[slot], resolved_seed);
    }
  }
}

  void KesshoProductEngine::ensureSoundscapeVoice() {
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  if (!source.enabled) {
    releaseSourceVoices(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
    return;
  }
  releaseUnwantedSoundscapeVoices(source);
  if (source.asset_ref_count == 0u) {
    return;
  }
  for (uint32_t ref_index = 0; ref_index < source.asset_ref_count; ++ref_index) {
    const uint32_t asset_id = source.asset_refs[ref_index];
    if (asset_id == 0u || hasActiveSoundscapeVoice(asset_id)) {
      continue;
    }
    const uint32_t slot = findAssetSlot(asset_id);
    if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
      reportMissingSourceAsset(source, asset_id);
      continue;
    }
    if ((assets[slot].flags & KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == 0u) {
      continue;
    }
    triggerVoice(
        KESSHO_PRODUCT_SOURCE_SOUNDSCAPE,
        60.0f,
        1.0f,
        static_cast<float>(static_cast<double>(assets[slot].frame_count) / std::max(1.0, assets[slot].sample_rate)),
        source.morph,
        source.distance,
        source.expression,
        hashU32(rng_seed ^ asset_id ^ 0x51f15ca9u),
        asset_id);
  }
}

  void KesshoProductEngine::releaseSourceVoices(uint32_t source_id) {
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) && pad_module) {
    pad_module->allNotesOff();
    clearPadVoiceReleases(0u);
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_LEAD1) && lead_modules[0]) {
    lead_modules[0]->allNotesOff();
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) && lead_modules[1]) {
    lead_modules[1]->allNotesOff();
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_DRUM) && drum_module) {
    drum_module->allNotesOff();
  }
  for (Voice& voice : voices) {
    if (voice.active && (source_id == 0u || voice.source_id == source_id)) {
      voice.looping = false;
      voice.remaining_frames = std::min<uint32_t>(voice.remaining_frames, static_cast<uint32_t>(0.02 * sample_rate));
      voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
    }
  }
}
