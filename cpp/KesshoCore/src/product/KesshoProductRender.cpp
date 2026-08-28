#include "KesshoProductEngineInternal.h"

namespace {

template <size_t FrameCapacity>
void clearFrameBuffer(float (&buffer)[FrameCapacity], uint32_t frames) {
  std::fill(buffer, buffer + std::min<uint32_t>(frames, FrameCapacity), 0.0f);
}

template <size_t RowCount, size_t FrameCapacity>
void clearFrameBuffer(float (&buffer)[RowCount][FrameCapacity], uint32_t frames) {
  const uint32_t count = std::min<uint32_t>(frames, FrameCapacity);
  for (uint32_t row = 0u; row < RowCount; ++row) {
    std::fill(buffer[row], buffer[row] + count, 0.0f);
  }
}

struct SoundscapeRenderBlockCache {
  float earth_level = 1.0f;
  float layer_route_sends[kSoundscapeLayerCount][kSoundscapeLayerRouteStride]{};
};

} // namespace

void KesshoProductEngine::resetInteractionSignals() {
  interaction_demand_mask = 0u;
  interaction_source_mask = 0u;
  interaction_signals = {};
  interaction_signals.version = KESSHO_PRODUCT_INTERACTION_VERSION;
  std::fill(
      interaction_envelope_state,
      interaction_envelope_state + KESSHO_PRODUCT_INTERACTION_SOURCE_COUNT,
      0.0f);
  std::fill(
      interaction_previous_peak,
      interaction_previous_peak + KESSHO_PRODUCT_INTERACTION_SOURCE_COUNT,
      0.0f);
}

void KesshoProductEngine::setInteractionDemand(uint32_t demand_mask, uint32_t source_mask) {
  const uint32_t next_demand = demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_ALL;
  const uint32_t next_sources = source_mask & KESSHO_PRODUCT_INTERACTION_SOURCE_MASK_ALL;
  if (interaction_demand_mask == next_demand && interaction_source_mask == next_sources) return;
  const bool event_demand_changed =
      (interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS) !=
      (next_demand & KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS);
  const uint32_t revision = interaction_signals.revision;
  resetInteractionSignals();
  interaction_signals.revision = revision;
  interaction_demand_mask = next_demand;
  interaction_source_mask = next_sources;
  interaction_signals.demand_mask = next_demand;
  interaction_signals.source_mask = next_sources;
  if (event_demand_changed) resetInteractionEvents();
}

void KesshoProductEngine::updateInteractionSignals(uint32_t frames) {
  constexpr uint32_t analysis_mask =
      KESSHO_PRODUCT_INTERACTION_DEMAND_ENVELOPE |
      KESSHO_PRODUCT_INTERACTION_DEMAND_PEAK |
      KESSHO_PRODUCT_INTERACTION_DEMAND_RMS |
      KESSHO_PRODUCT_INTERACTION_DEMAND_ONSET;
  if ((interaction_demand_mask & analysis_mask) == 0u || interaction_source_mask == 0u || frames == 0u) {
    return;
  }
  const float safe_sample_rate = static_cast<float>(std::max(1.0, sample_rate));
  const float attack = std::exp(-static_cast<float>(frames) / (safe_sample_rate * 0.020f));
  const float release = std::exp(-static_cast<float>(frames) / (safe_sample_rate * 0.250f));
  uint32_t valid_mask = 0u;
  for (uint32_t source = 0u; source < KESSHO_PRODUCT_INTERACTION_SOURCE_COUNT; ++source) {
    const uint32_t source_bit = 1u << source;
    if ((interaction_source_mask & source_bit) == 0u) continue;
    float peak = 0.0f;
    double sum_squares = 0.0;
    for (uint32_t frame = 0u; frame < frames; ++frame) {
      const float left = stem_l[source][frame];
      const float right = stem_r[source][frame];
      peak = std::max(peak, std::max(std::fabs(left), std::fabs(right)));
      sum_squares += static_cast<double>(left) * static_cast<double>(left);
      sum_squares += static_cast<double>(right) * static_cast<double>(right);
    }
    const float rms = std::sqrt(static_cast<float>(sum_squares / static_cast<double>(frames * 2u)));
    const float coefficient = rms > interaction_envelope_state[source] ? attack : release;
    const float envelope = rms + coefficient * (interaction_envelope_state[source] - rms);
    const float onset = std::max(0.0f, peak - interaction_previous_peak[source]);
    interaction_envelope_state[source] = std::isfinite(envelope) ? envelope : 0.0f;
    interaction_previous_peak[source] = std::isfinite(peak) ? peak : 0.0f;
    interaction_signals.envelope[source] =
        (interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_ENVELOPE) != 0u
        ? interaction_envelope_state[source] : 0.0f;
    interaction_signals.peak[source] =
        (interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_PEAK) != 0u
        ? interaction_previous_peak[source] : 0.0f;
    interaction_signals.rms[source] =
        (interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_RMS) != 0u
        ? (std::isfinite(rms) ? rms : 0.0f) : 0.0f;
    interaction_signals.onset_strength[source] =
        (interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_ONSET) != 0u
        ? (std::isfinite(onset) ? onset : 0.0f) : 0.0f;
    valid_mask |= source_bit;
  }
  interaction_signals.version = KESSHO_PRODUCT_INTERACTION_VERSION;
  interaction_signals.demand_mask = interaction_demand_mask;
  interaction_signals.source_mask = interaction_source_mask;
  interaction_signals.valid_source_mask = valid_mask;
  interaction_signals.sample_frame = audio_render_sample_frame;
  ++interaction_signals.revision;
  if (interaction_signals.revision == 0u) interaction_signals.revision = 1u;
}

void KesshoProductEngine::resetInteractionEvents() {
  interaction_event_read_index = 0u;
  interaction_event_write_index = 0u;
  interaction_event_count = 0u;
  interaction_event_overflow_count = 0u;
  interaction_clock_initialized = false;
  interaction_last_beat_index = 0u;
  interaction_last_bar_index = 0u;
  interaction_last_phrase_index = 0u;
}

void KesshoProductEngine::emitVoiceInteractionEvent(
    uint32_t source_id,
    uint32_t origin,
    uint64_t sample_frame,
    float midi_note,
    float strength) {
  uint32_t type = KESSHO_PRODUCT_INTERACTION_EVENT_VOICE_TRIGGERED;
  uint32_t parent = KESSHO_PRODUCT_INTERACTION_PARENT_SYNTHS;
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    type = KESSHO_PRODUCT_INTERACTION_EVENT_DRUM_TRIGGERED;
    parent = KESSHO_PRODUCT_INTERACTION_PARENT_DRUMS;
  } else if (source_id == KESSHO_PRODUCT_SOURCE_SAMPLE1 || source_id == KESSHO_PRODUCT_SOURCE_SAMPLE2) {
    type = KESSHO_PRODUCT_INTERACTION_EVENT_SAMPLE_TRIGGERED;
    parent = KESSHO_PRODUCT_INTERACTION_PARENT_SAMPLES;
  } else if (source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
    type = KESSHO_PRODUCT_INTERACTION_EVENT_TEXTURE_STARTED;
    parent = KESSHO_PRODUCT_INTERACTION_PARENT_SOUNDSCAPE;
  }
  emitInteractionEvent(
      type,
      parent,
      source_id,
      origin,
      KESSHO_PRODUCT_INTERACTION_TAP_POST_SOURCE,
      sample_frame,
      midi_note,
      strength);
}

void KesshoProductEngine::emitTransportClockInteractionEvents() {
  if ((interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS) == 0u || !transport.running) {
    interaction_clock_initialized = false;
    return;
  }
  const uint64_t beat = static_cast<uint64_t>(std::max(0.0, std::floor(transport.beatPosition(sample_rate))));
  const uint64_t bar = transport.barIndex(sample_rate);
  const uint64_t phrase = transport.phraseIndex(sample_rate);
  if (!interaction_clock_initialized) {
    interaction_clock_initialized = true;
    interaction_last_beat_index = beat;
    interaction_last_bar_index = bar;
    interaction_last_phrase_index = phrase;
    return;
  }
  if (beat != interaction_last_beat_index) {
    emitInteractionEvent(KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_BEAT,
        KESSHO_PRODUCT_INTERACTION_PARENT_TRANSPORT, KESSHO_PRODUCT_INTERACTION_CHILD_NONE,
        KESSHO_PRODUCT_INTERACTION_ORIGIN_SYSTEM, KESSHO_PRODUCT_INTERACTION_TAP_NONE,
        transport.sample_frame, static_cast<float>(beat), 1.0f);
    interaction_last_beat_index = beat;
  }
  if (bar != interaction_last_bar_index) {
    emitInteractionEvent(KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_BAR,
        KESSHO_PRODUCT_INTERACTION_PARENT_TRANSPORT, KESSHO_PRODUCT_INTERACTION_CHILD_NONE,
        KESSHO_PRODUCT_INTERACTION_ORIGIN_SYSTEM, KESSHO_PRODUCT_INTERACTION_TAP_NONE,
        transport.sample_frame, static_cast<float>(bar), 1.0f);
    interaction_last_bar_index = bar;
  }
  if (phrase != interaction_last_phrase_index) {
    emitInteractionEvent(KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_PHRASE,
        KESSHO_PRODUCT_INTERACTION_PARENT_TRANSPORT, KESSHO_PRODUCT_INTERACTION_CHILD_NONE,
        KESSHO_PRODUCT_INTERACTION_ORIGIN_SYSTEM, KESSHO_PRODUCT_INTERACTION_TAP_NONE,
        transport.sample_frame, static_cast<float>(phrase), 1.0f);
    interaction_last_phrase_index = phrase;
  }
}

void KesshoProductEngine::emitInteractionEvent(
    uint32_t type,
    uint32_t parent,
    uint32_t child,
    uint32_t origin,
    uint32_t tap,
    uint64_t sample_frame,
    float value,
    float strength) {
  if ((interaction_demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS) == 0u) return;
  if (interaction_event_count >= KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY) {
    if (interaction_event_overflow_count != 0xffffffffu) ++interaction_event_overflow_count;
    return;
  }
  KesshoProductInteractionEvent& event = interaction_event_ring[interaction_event_write_index];
  event.type = type;
  event.parent = parent;
  event.child = child;
  event.origin = origin;
  event.tap = tap;
  event.flags = 0u;
  event.sample_frame = sample_frame;
  event.value = std::isfinite(value) ? value : 0.0f;
  event.strength = std::isfinite(strength) ? strength : 0.0f;
  interaction_event_write_index =
      (interaction_event_write_index + 1u) % KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY;
  ++interaction_event_count;
}

uint32_t KesshoProductEngine::drainInteractionEvents(
    KesshoProductInteractionEvent* out_events,
    uint32_t max_event_count,
    uint32_t* out_overflow_count) {
  if (out_overflow_count != nullptr) *out_overflow_count = interaction_event_overflow_count;
  if (out_events == nullptr || max_event_count == 0u) return 0u;
  const uint32_t count = std::min(max_event_count, interaction_event_count);
  for (uint32_t i = 0u; i < count; ++i) {
    out_events[i] = interaction_event_ring[interaction_event_read_index];
    interaction_event_read_index =
        (interaction_event_read_index + 1u) % KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY;
  }
  interaction_event_count -= count;
  return count;
}

  void KesshoProductEngine::resetDiffuseRuntime() {
  diffuse_highpass = {};
  diffuse_lowpass = {};
  diffuse_delay_index = 0u;
  std::fill(diffuse_delay_l, diffuse_delay_l + kDiffuseDelayMaxFrames, 0.0f);
  std::fill(diffuse_delay_r, diffuse_delay_r + kDiffuseDelayMaxFrames, 0.0f);
  diffuse_bus_active_this_block = false;
  diffuse_runtime_active = false;
  diffuse_idle_frames_remaining = 0u;
}

  void KesshoProductEngine::updateProductBiquadCoefficients(
      ProductBiquadFilterState& filter,
      float cutoff_hz,
      uint32_t type) {
  const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
  const float cutoff = clampFloat(cutoff_hz, 20.0f, std::max(20.0f, nyquist_limit));
  if (std::abs(filter.coeff_cutoff - cutoff) <= 0.0001f) {
    return;
  }

  constexpr float kWebAudioQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioQ07);
  const float a0 = 1.0f + alpha;
  if (type == kProductBiquadHighpass) {
    filter.b0 = ((1.0f + cos_omega) * 0.5f) / a0;
    filter.b1 = -(1.0f + cos_omega) / a0;
    filter.b2 = ((1.0f + cos_omega) * 0.5f) / a0;
  } else {
    filter.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
    filter.b1 = (1.0f - cos_omega) / a0;
    filter.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
  }
  filter.a1 = (-2.0f * cos_omega) / a0;
  filter.a2 = (1.0f - alpha) / a0;
  filter.coeff_cutoff = cutoff;
}

  float KesshoProductEngine::processProductBiquadSample(
      const ProductBiquadFilterState& filter,
      BiquadState& state,
      float input) const {
  const float y =
      filter.b0 * input +
      filter.b1 * state.x1 +
      filter.b2 * state.x2 -
      filter.a1 * state.y1 -
      filter.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = std::isfinite(y) ? y : 0.0f;
  return state.y1;
}

  void KesshoProductEngine::renderDiffuseBus(float* out_l, float* out_r, uint32_t frames) {
  if (out_l == nullptr || out_r == nullptr || frames == 0u) {
    return;
  }
  if (!diffuse_bus_active_this_block && !diffuse_runtime_active) {
    return;
  }
  const uint32_t idle_release_frames = std::max<uint32_t>(
      frames,
      static_cast<uint32_t>(std::ceil(sample_rate * static_cast<double>(kDiffuseIdleReleaseSeconds))));
  if (diffuse_bus_active_this_block) {
    diffuse_runtime_active = true;
    diffuse_idle_frames_remaining = idle_release_frames;
  }
  updateProductBiquadCoefficients(diffuse_highpass, kDiffuseHighpassHz, kProductBiquadHighpass);
  updateProductBiquadCoefficients(diffuse_lowpass, kDiffuseLowpassHz, kProductBiquadLowpass);
  const uint32_t delay_frames = clampU32(
      static_cast<uint32_t>(std::lround(sample_rate * static_cast<double>(kDiffuseHaasDelayMs) * 0.001)),
      1u,
      kDiffuseDelayMaxFrames - 1u);

  float block_peak = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const float high_l = processProductBiquadSample(diffuse_highpass, diffuse_highpass.left, diffuse_bus_l[i]);
    const float high_r = processProductBiquadSample(diffuse_highpass, diffuse_highpass.right, diffuse_bus_r[i]);
    const float filtered_l = processProductBiquadSample(diffuse_lowpass, diffuse_lowpass.left, high_l);
    const float filtered_r = processProductBiquadSample(diffuse_lowpass, diffuse_lowpass.right, high_r);

    const uint32_t read_index =
        (diffuse_delay_index + kDiffuseDelayMaxFrames - delay_frames) % kDiffuseDelayMaxFrames;
    const float delayed_l = diffuse_delay_l[read_index];
    const float delayed_r = diffuse_delay_r[read_index];
    diffuse_delay_l[diffuse_delay_index] = filtered_l;
    diffuse_delay_r[diffuse_delay_index] = filtered_r;
    diffuse_delay_index = (diffuse_delay_index + 1u) % kDiffuseDelayMaxFrames;

    const float center_l = filtered_l * kDiffuseHaasCenterGain;
    const float center_r = filtered_r * kDiffuseHaasCenterGain;
    const float spread_l = center_l + (filtered_l + filtered_r) * kDiffuseHaasSideGain;
    const float spread_r = center_r + (delayed_l + delayed_r) * kDiffuseHaasSideGain;
    const float out_left = spread_l * kDiffuseOutputGain;
    const float out_right = spread_r * kDiffuseOutputGain;
    const float reverb_left = spread_l * kDiffuseReverbSendGain;
    const float reverb_right = spread_r * kDiffuseReverbSendGain;
    block_peak = std::max(block_peak, std::max(
        std::max(std::fabs(out_left), std::fabs(out_right)),
        std::max(std::fabs(reverb_left), std::fabs(reverb_right))));

    if (graph_taps_enabled) {
      graph_diffuse_output_l[i] = out_left;
      graph_diffuse_output_r[i] = out_right;
      graph_diffuse_reverb_send_l[i] = reverb_left;
      graph_diffuse_reverb_send_r[i] = reverb_right;
    }
    out_l[i] += out_left;
    out_r[i] += out_right;
    reverb_bus_l[i] += reverb_left;
    reverb_bus_r[i] += reverb_right;
  }
  if (!diffuse_bus_active_this_block && diffuse_runtime_active) {
    diffuse_idle_frames_remaining =
        diffuse_idle_frames_remaining > frames ? diffuse_idle_frames_remaining - frames : 0u;
    if (diffuse_idle_frames_remaining == 0u && block_peak <= kDiffuseIdleSleepPeak) {
      resetDiffuseRuntime();
    }
  }
}

  void KesshoProductEngine::renderSampleVoices(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (active_voice_list_dirty) {
    rebuildActiveVoiceList();
  }
  if (active_voice_count == 0u) {
    return;
  }
  const SourceState& soundscape_source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  SoundscapeRenderBlockCache soundscape_cache{};
  if (soundscapeModuleParamsAvailable(soundscape_source) &&
      soundscape_source.soundscape_module_param_count > kSoundscapeModuleEarthLevelParam) {
    soundscape_cache.earth_level =
        clampFloat(soundscape_source.soundscape_module_params[kSoundscapeModuleEarthLevelParam], 0.0f, 2.0f);
  }
  const float soundscape_route_fallbacks[kSoundscapeLayerRouteStride] = {
    soundscape_source.reverb_send,
    soundscape_source.delay_a_send,
    soundscape_source.delay_b_send,
    soundscape_source.granular_send,
    soundscape_source.degrade_send,
    soundscape_source.spectral_freeze_send,
  };
  for (uint32_t layer = 0u; layer < kSoundscapeLayerCount; ++layer) {
    for (uint32_t route = 0u; route < kSoundscapeLayerRouteStride; ++route) {
      soundscape_cache.layer_route_sends[layer][route] =
          soundscapeLayerRouteSend(soundscape_source, layer, route, soundscape_route_fallbacks[route]);
    }
  }
  const uint32_t harmony_fade_total_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(std::lround(sample_rate * 0.02)));
  const float harmony_morph_handover = clampFloat(harmony.morph_scale_handover_at, 0.05f, 0.95f);
  const bool harmony_morph_target_side = harmony.morph_plan_phase >= harmony_morph_handover;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    float source_gates[kSourceCount]{};
    for (uint32_t source_index = 0u; source_index < kSourceCount; ++source_index) {
      if ((active_source_mask & (1u << source_index)) == 0u) {
        continue;
      }
      const uint64_t transport_frame = transport.sample_frame + i;
      const uint64_t render_frame = audio_render_sample_frame + i;
      source_gates[source_index] = sourceOutputGainForFrame(sources[source_index], render_frame);
      const uint32_t mute_row = routingMuteRowForSource(source_index + 1u);
      if (mute_row < kProductRoutingMuteRowCount) {
        source_gates[source_index] *= routingMuteGainForFrame(mute_row, transport_frame);
      }
    }
    for (uint32_t active_i = 0u; active_i < active_voice_count; ++active_i) {
      Voice& voice = voices[active_voice_indices[active_i]];
      if (!voice.active) {
        active_voice_list_dirty = true;
        continue;
      }
      if (voice.source_id < 1u || voice.source_id > kSourceCount) {
        voice.active = false;
        active_voice_list_dirty = true;
        continue;
      }
      // Existing voices removed by a Harmony morph are crossfaded out over a
      // bounded 20 ms window. New target-side triggers retain integer MIDI
      // anchors and their normal attack envelope; no pitch interpolation is
      // performed. All state is fixed-capacity per voice and audio-thread safe.
      bool removed_harmony_voice = false;
      if (harmony.morph_plan_phase > 0.0f && harmony_morph_target_side && harmony.morph_unmatched_a_count > 0u) {
        for (uint32_t note_index = 0u; note_index < harmony.morph_unmatched_a_count; ++note_index) {
          if (voice.harmony_resolved_voice &&
              std::abs(voice.midi_note - harmony.morph_unmatched_a[note_index]) <= 0.01f) {
            removed_harmony_voice = true;
            break;
          }
        }
      }
      if (removed_harmony_voice) {
        if (voice.harmony_fade_target > 0.0f) {
          voice.harmony_fade_target = 0.0f;
          voice.harmony_fade_frames_remaining = harmony_fade_total_frames;
          voice.harmony_fade_step = -voice.harmony_fade_gain / static_cast<float>(harmony_fade_total_frames);
        }
      } else if (voice.harmony_fade_target < 1.0f) {
        voice.harmony_fade_target = 1.0f;
        voice.harmony_fade_frames_remaining = harmony_fade_total_frames;
        voice.harmony_fade_step = (1.0f - voice.harmony_fade_gain) / static_cast<float>(harmony_fade_total_frames);
      }
      if (voice.harmony_fade_frames_remaining > 0u) {
        voice.harmony_fade_gain = std::max(0.0f, std::min(1.0f,
            voice.harmony_fade_gain + voice.harmony_fade_step));
        --voice.harmony_fade_frames_remaining;
        if (voice.harmony_fade_frames_remaining == 0u) {
          voice.harmony_fade_gain = voice.harmony_fade_target;
        }
      }
      if (removed_harmony_voice && voice.harmony_fade_gain <= 0.0f) {
        voice.active = false;
        active_voice_list_dirty = true;
        continue;
      }
      float value_l = 0.0f;
      float value_r = 0.0f;
      if (voice.soundscape_texture_voice &&
          !voice.soundscape_texture_sample_hold_triggered &&
          voice.start_delay_frames == 0u &&
          voice.soundscape_texture_slot < kSoundscapeTextureSlotCount) {
        voice.soundscape_texture_sample_hold_triggered = true;
        triggerSoundscapeTextureSampleHoldRanges(
            voice.soundscape_texture_slot,
            voice.soundscape_texture_slice_id);
      }
      renderVoiceSample(voice, value_l, value_r);
      value_l *= voice.harmony_fade_gain;
      value_r *= voice.harmony_fade_gain;
      SourceState& source = sources[voice.source_id - 1u];
      float source_gate = source_gates[voice.source_id - 1u];
      if (voice.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
        const uint32_t layer = voice.soundscape_layer < kSoundscapeLayerCount
            ? voice.soundscape_layer
            : (voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS
                ? soundscapeLayerIndexForAsset(assets[voice.asset_slot].asset_id)
                : kSoundscapeLayerCount);
        if (layer < kSoundscapeLayerCount) {
          source_gate *= routingMuteGainForFrame(
              kRoutingMuteRowWaves + layer,
              transport.sample_frame + i);
        }
      }
      if (voice.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
          voice.sample_voice &&
          voice.soundscape_texture_voice &&
          voice.age_frames > 0u &&
          voice.soundscape_texture_slot < kSoundscapeTextureSlotCount) {
        if (soundscapeTextureParam(source, voice.soundscape_texture_slot, kSoundscapeTextureParamAssetId, 0.0f) > 0.0f) {
          processSoundscapeTextureFilter(voice, source, value_l, value_r);
        }
        processSoundscapeTextureSpatialForSlot(voice.soundscape_texture_slot, value_l, value_r);
      }
      const float pan_l = voice.pan <= 0.0f ? 1.0f : 1.0f - voice.pan * 0.5f;
      const float pan_r = voice.pan >= 0.0f ? 1.0f : 1.0f + voice.pan * 0.5f;
      const bool piano_voice = voice.sample_slot_voice && source.sample_library_id == kSampleLibraryPiano;
      const bool soundscape_sample =
          voice.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
          voice.sample_voice &&
          voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
          assets[voice.asset_slot].active;
      float send_left = value_l * source.dry_gain * pan_l * source_gate;
      float send_right = value_r * source.dry_gain * pan_r * source_gate;
      float dry_left = send_left;
      float dry_right = send_right;
      if (!soundscape_sample) {
        processVoicePostChain(voice, dry_left, dry_right);
        if (piano_voice) {
          send_left = dry_left * kPianoSampleParityTrim;
          send_right = dry_right * kPianoSampleParityTrim;
          dry_left = send_left * source.level;
          dry_right = send_right * source.level;
        } else {
          dry_left *= source.level;
          dry_right *= source.level;
        }
      }
      uint32_t soundscape_layer = kSoundscapeLayerCount;
      float soundscape_asset_level = 1.0f;
      float soundscape_earth_level = 1.0f;
      float graph_dry_left = dry_left;
      float graph_dry_right = dry_right;
      float output_dry_left = dry_left;
      float output_dry_right = dry_right;
      float layer_send_left = send_left;
      float layer_send_right = send_right;
      if (soundscape_sample) {
        soundscape_layer = voice.soundscape_layer < kSoundscapeLayerCount
            ? voice.soundscape_layer
            : soundscapeLayerIndexForAsset(assets[voice.asset_slot].asset_id);
        soundscape_asset_level = voice.soundscape_releasing
            ? voice.soundscape_asset_level
            : (voice.soundscape_texture_voice && voice.soundscape_texture_slot < kSoundscapeTextureSlotCount &&
                soundscapeTextureParam(source, voice.soundscape_texture_slot, kSoundscapeTextureParamAssetId, 0.0f) > 0.0f
                ? clampFloat(soundscapeTextureParam(source, voice.soundscape_texture_slot, kSoundscapeTextureParamLevel, 0.5f), 0.0f, 1.0f)
                : soundscapeAssetRefLevel(source, assets[voice.asset_slot].asset_id));
        voice.soundscape_asset_level = soundscape_asset_level;
        soundscape_earth_level = soundscape_cache.earth_level;
        graph_dry_left = dry_left * soundscape_asset_level;
        graph_dry_right = dry_right * soundscape_asset_level;
        output_dry_left = graph_dry_left * soundscape_earth_level;
        output_dry_right = graph_dry_right * soundscape_earth_level;
        layer_send_left = graph_dry_left;
        layer_send_right = graph_dry_right;
      }
      const float left = output_dry_left;
      const float right = output_dry_right;
      const float graph_granular_send = soundscape_sample
          ? source.granular_send
          : granularSendGainForFrame(source.source_id, source.granular_send, transport.sample_frame + i);
      if (graph_taps_enabled || source.diffuse_send > 0.0f) {
        recordSourceGraphTaps(
            voice.source_id,
            frame,
            source,
            graph_dry_left,
            graph_dry_right,
            left,
            right,
            send_left,
            send_right,
            graph_granular_send);
      }
      float reverb_send = source.reverb_send;
      float delay_a_send = source.delay_a_send;
      float delay_b_send = source.delay_b_send;
      float granular_send = source.granular_send;
      float degrade_send = source.degrade_send;
      float spectral_freeze_send = source.spectral_freeze_send;
      if (soundscape_sample) {
        if (soundscape_layer < kSoundscapeLayerCount) {
          reverb_send = soundscape_cache.layer_route_sends[soundscape_layer][kSoundscapeLayerRouteReverb];
          delay_a_send = soundscape_cache.layer_route_sends[soundscape_layer][kSoundscapeLayerRouteDelayA];
          delay_b_send = soundscape_cache.layer_route_sends[soundscape_layer][kSoundscapeLayerRouteDelayB];
          granular_send = soundscape_cache.layer_route_sends[soundscape_layer][kSoundscapeLayerRouteGranular];
          degrade_send = soundscape_cache.layer_route_sends[soundscape_layer][kSoundscapeLayerRouteDegrade];
          spectral_freeze_send = soundscape_cache.layer_route_sends[soundscape_layer][kSoundscapeLayerRouteSpectralFreeze];
          if (graph_taps_enabled) {
            graph_soundscape_layer_dry_l[soundscape_layer][frame] += graph_dry_left;
            graph_soundscape_layer_dry_r[soundscape_layer][frame] += graph_dry_right;
            graph_soundscape_layer_reverb_send_l[soundscape_layer][frame] += layer_send_left * reverb_send;
            graph_soundscape_layer_reverb_send_r[soundscape_layer][frame] += layer_send_right * reverb_send;
            graph_soundscape_layer_delay_a_send_l[soundscape_layer][frame] += layer_send_left * delay_a_send;
            graph_soundscape_layer_delay_a_send_r[soundscape_layer][frame] += layer_send_right * delay_a_send;
            graph_soundscape_layer_delay_b_send_l[soundscape_layer][frame] += layer_send_left * delay_b_send;
            graph_soundscape_layer_delay_b_send_r[soundscape_layer][frame] += layer_send_right * delay_b_send;
            graph_soundscape_layer_granular_send_l[soundscape_layer][frame] += layer_send_left * granular_send;
            graph_soundscape_layer_granular_send_r[soundscape_layer][frame] += layer_send_right * granular_send;
          }
        }
      }
      const float effective_granular_send = soundscape_sample
          ? granular_send
          : granularSendGainForFrame(source.source_id, granular_send, transport.sample_frame + i);
      const uint32_t terminal_bus = soundscape_sample
          ? dynamicsBusForSoundscapeLayer(soundscape_layer)
          : dynamicsBusForSource(voice.source_id);
      routeTerminalSample(terminal_bus, out_l, out_r, frame, left, right);
      if (captureStems() && voice.source_id < kStemCount) {
        stem_l[voice.source_id][frame] += left;
        stem_r[voice.source_id][frame] += right;
      }
      const float bus_send_left = soundscape_sample ? layer_send_left : send_left;
      const float bus_send_right = soundscape_sample ? layer_send_right : send_right;
      reverb_bus_l[frame] += bus_send_left * reverb_send;
      reverb_bus_r[frame] += bus_send_right * reverb_send;
      delay_a_bus_l[frame] += bus_send_left * delay_a_send;
      delay_a_bus_r[frame] += bus_send_right * delay_a_send;
      delay_b_bus_l[frame] += bus_send_left * delay_b_send;
      delay_b_bus_r[frame] += bus_send_right * delay_b_send;
      granular_bus_l[frame] += bus_send_left * effective_granular_send;
      granular_bus_r[frame] += bus_send_right * effective_granular_send;
      degrade_bus_l[frame] += bus_send_left * degrade_send;
      degrade_bus_r[frame] += bus_send_right * degrade_send;
      spectral_freeze_bus_l[frame] += bus_send_left * spectral_freeze_send;
      spectral_freeze_bus_r[frame] += bus_send_right * spectral_freeze_send;
    }
  }
}

void KesshoProductEngine::renderSegment(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  renderSidechainGains(start, frames);
  renderProductModules(out_l, out_r, start, frames);
  renderSampleVoices(out_l, out_r, start, frames);
}

  void KesshoProductEngine::applyMaster(float* out_l, float* out_r, uint32_t frames) {
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] *= master_gain;
    out_r[i] *= master_gain;
    if (graph_taps_enabled) {
      graph_dynamics_input_l[i] = out_l[i];
      graph_dynamics_input_r[i] = out_r[i];
    }
  }
  renderDynamics(out_l, out_r, frames);
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      graph_dynamics_output_l[i] = out_l[i];
      graph_dynamics_output_r[i] = out_r[i];
    }
  }
  const float ceiling = master_limiter_ceiling_gain;
  const bool publish_master_telemetry =
      meter_demand_enabled && (master_telemetry_block_counter++ & 0x3u) == 0u;
  float master_input_peak = 0.0f;
  float master_output_peak = 0.0f;
  float master_true_peak = 0.0f;
  double master_output_sum_squares = 0.0;
  double master_loudness_energy = 0.0;
  float limiter_gain_reduction_db = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const float pre_limiter_l = out_l[i];
    const float pre_limiter_r = out_r[i];
    if (graph_taps_enabled) {
      graph_master_pre_limiter_l[i] = pre_limiter_l;
      graph_master_pre_limiter_r[i] = pre_limiter_r;
    }
    const float limiter_input_l = pre_limiter_l * kMasterLimiterWebAudioMakeupGain;
    const float limiter_input_r = pre_limiter_r * kMasterLimiterWebAudioMakeupGain;
    if (publish_master_telemetry) {
      const float input_peak = std::max(std::fabs(pre_limiter_l), std::fabs(pre_limiter_r));
      const float limiter_input_peak = input_peak * kMasterLimiterWebAudioMakeupGain;
      master_input_peak = std::max(master_input_peak, limiter_input_peak);
      if (limiter_input_peak > ceiling && ceiling > 0.0f) {
        limiter_gain_reduction_db = std::max(
            limiter_gain_reduction_db,
            20.0f * std::log10(limiter_input_peak / ceiling));
      }
    }
    out_l[i] = clampFloat(limiter_input_l, -ceiling, ceiling);
    out_r[i] = clampFloat(limiter_input_r, -ceiling, ceiling);
    if (publish_master_telemetry) {
      const float true_peak_l = std::max(
          std::fabs(out_l[i]),
          std::fabs((out_l[i] + master_true_peak_prev_l) * 0.5f));
      const float true_peak_r = std::max(
          std::fabs(out_r[i]),
          std::fabs((out_r[i] + master_true_peak_prev_r) * 0.5f));
      master_true_peak = std::max(master_true_peak, true_peak_l);
      master_true_peak = std::max(master_true_peak, true_peak_r);
      master_output_peak = std::max(master_output_peak, std::fabs(out_l[i]));
      master_output_peak = std::max(master_output_peak, std::fabs(out_r[i]));
      master_output_sum_squares += static_cast<double>(out_l[i]) * static_cast<double>(out_l[i]);
      master_output_sum_squares += static_cast<double>(out_r[i]) * static_cast<double>(out_r[i]);
      master_loudness_energy += static_cast<double>(out_l[i]) * static_cast<double>(out_l[i]);
      master_loudness_energy += static_cast<double>(out_r[i]) * static_cast<double>(out_r[i]);
    }
    if (publish_master_telemetry) {
      master_true_peak_prev_l = out_l[i];
      master_true_peak_prev_r = out_r[i];
    }
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_MASTER][i] = out_l[i];
      stem_r[KESSHO_PRODUCT_STEM_MASTER][i] = out_r[i];
    }
  }
  telemetry.dynamics_saturation_drive = fx.dynamics_saturation_drive;
  if (!publish_master_telemetry) {
    return;
  }
  master_integrated_loudness_energy += master_loudness_energy;
  master_integrated_loudness_frames += frames;
  const double integrated_mean_square = master_integrated_loudness_frames == 0u
      ? 0.0
      : master_integrated_loudness_energy / static_cast<double>(master_integrated_loudness_frames);
  telemetry.master_input_peak = master_input_peak;
  telemetry.master_output_peak = master_output_peak;
  telemetry.master_output_rms = frames == 0u
      ? 0.0f
      : static_cast<float>(std::sqrt(master_output_sum_squares / static_cast<double>(frames * 2u)));
  telemetry.master_limiter_gain_reduction_db = limiter_gain_reduction_db;
  telemetry.master_true_peak = master_true_peak;
  telemetry.master_true_peak_dbtp = gainToDb(master_true_peak);
  telemetry.master_integrated_lufs = integrated_mean_square <= 0.000000000001
      ? kProductTelemetrySilenceDb
      : static_cast<float>(-0.691 + 10.0 * std::log10(integrated_mean_square));
}

  void KesshoProductEngine::clearAudioOutput(float* out_l, float* out_r, uint32_t frames) {
  std::fill(out_l, out_l + frames, 0.0f);
  std::fill(out_r, out_r + frames, 0.0f);
}

  void KesshoProductEngine::clearStemOutput(uint32_t frames) {
  clearFrameBuffer(stem_l, frames);
  clearFrameBuffer(stem_r, frames);
}

  void KesshoProductEngine::clearBusOutput(uint32_t frames) {
  clearFrameBuffer(reverb_bus_l, frames);
  clearFrameBuffer(reverb_bus_r, frames);
  for (uint32_t i = 0; i < frames; ++i) {
    delay_a_bus_l[i] = delay_a_cross_carry_l[i];
    delay_a_bus_r[i] = delay_a_cross_carry_r[i];
    delay_a_cross_carry_l[i] = 0.0f;
    delay_a_cross_carry_r[i] = 0.0f;
  }
  clearFrameBuffer(delay_b_bus_l, frames);
  clearFrameBuffer(delay_b_bus_r, frames);
  clearFrameBuffer(granular_bus_l, frames);
  clearFrameBuffer(granular_bus_r, frames);
  clearFrameBuffer(degrade_bus_l, frames);
  clearFrameBuffer(degrade_bus_r, frames);
  clearFrameBuffer(spectral_freeze_bus_l, frames);
  clearFrameBuffer(spectral_freeze_bus_r, frames);
  clearFrameBuffer(dynamics_eq1_bus_l, frames);
  clearFrameBuffer(dynamics_eq1_bus_r, frames);
  clearFrameBuffer(dynamics_eq2_bus_l, frames);
  clearFrameBuffer(dynamics_eq2_bus_r, frames);
  clearFrameBuffer(dynamics_sidechain_bus_l, frames);
  clearFrameBuffer(dynamics_sidechain_bus_r, frames);
  clearFrameBuffer(creative_saturation_bus_l, frames);
  clearFrameBuffer(creative_saturation_bus_r, frames);
  clearFrameBuffer(fx_node_output_l, frames);
  clearFrameBuffer(fx_node_output_r, frames);
  clearFrameBuffer(diffuse_bus_l, frames);
  clearFrameBuffer(diffuse_bus_r, frames);
}

  void KesshoProductEngine::clearGraphTapOutput(uint32_t frames) {
  clearFrameBuffer(graph_reverb_input_l, frames);
  clearFrameBuffer(graph_reverb_input_r, frames);
  clearFrameBuffer(graph_delay_a_input_l, frames);
  clearFrameBuffer(graph_delay_a_input_r, frames);
  clearFrameBuffer(graph_delay_b_input_l, frames);
  clearFrameBuffer(graph_delay_b_input_r, frames);
  clearFrameBuffer(graph_granular_input_l, frames);
  clearFrameBuffer(graph_granular_input_r, frames);
  clearFrameBuffer(graph_diffuse_input_l, frames);
  clearFrameBuffer(graph_diffuse_input_r, frames);
  clearFrameBuffer(graph_diffuse_output_l, frames);
  clearFrameBuffer(graph_diffuse_output_r, frames);
  clearFrameBuffer(graph_diffuse_reverb_send_l, frames);
  clearFrameBuffer(graph_diffuse_reverb_send_r, frames);
  clearFrameBuffer(graph_soundscape_layer_dry_l, frames);
  clearFrameBuffer(graph_soundscape_layer_dry_r, frames);
  clearFrameBuffer(graph_soundscape_layer_reverb_send_l, frames);
  clearFrameBuffer(graph_soundscape_layer_reverb_send_r, frames);
  clearFrameBuffer(graph_soundscape_layer_delay_a_send_l, frames);
  clearFrameBuffer(graph_soundscape_layer_delay_a_send_r, frames);
  clearFrameBuffer(graph_soundscape_layer_delay_b_send_l, frames);
  clearFrameBuffer(graph_soundscape_layer_delay_b_send_r, frames);
  clearFrameBuffer(graph_soundscape_layer_granular_send_l, frames);
  clearFrameBuffer(graph_soundscape_layer_granular_send_r, frames);
  clearFrameBuffer(graph_delay_a_output_l, frames);
  clearFrameBuffer(graph_delay_a_output_r, frames);
  clearFrameBuffer(graph_delay_a_reverb_send_l, frames);
  clearFrameBuffer(graph_delay_a_reverb_send_r, frames);
  clearFrameBuffer(graph_delay_a_to_delay_b_send_l, frames);
  clearFrameBuffer(graph_delay_a_to_delay_b_send_r, frames);
  clearFrameBuffer(graph_delay_a_to_granular_send_l, frames);
  clearFrameBuffer(graph_delay_a_to_granular_send_r, frames);
  clearFrameBuffer(graph_delay_b_output_l, frames);
  clearFrameBuffer(graph_delay_b_output_r, frames);
  clearFrameBuffer(graph_delay_b_reverb_send_l, frames);
  clearFrameBuffer(graph_delay_b_reverb_send_r, frames);
  clearFrameBuffer(graph_delay_b_to_delay_a_send_l, frames);
  clearFrameBuffer(graph_delay_b_to_delay_a_send_r, frames);
  clearFrameBuffer(graph_delay_b_to_granular_send_l, frames);
  clearFrameBuffer(graph_delay_b_to_granular_send_r, frames);
  clearFrameBuffer(graph_granular_output_l, frames);
  clearFrameBuffer(graph_granular_output_r, frames);
  clearFrameBuffer(graph_granular_reverb_send_l, frames);
  clearFrameBuffer(graph_granular_reverb_send_r, frames);
  clearFrameBuffer(graph_granular_to_delay_a_send_l, frames);
  clearFrameBuffer(graph_granular_to_delay_a_send_r, frames);
  clearFrameBuffer(graph_granular_to_delay_b_send_l, frames);
  clearFrameBuffer(graph_granular_to_delay_b_send_r, frames);
  clearFrameBuffer(graph_reverb_preconditioner_output_l, frames);
  clearFrameBuffer(graph_reverb_preconditioner_output_r, frames);
  clearFrameBuffer(graph_spectral_freeze_input_l, frames);
  clearFrameBuffer(graph_spectral_freeze_input_r, frames);
  clearFrameBuffer(graph_spectral_freeze_output_l, frames);
  clearFrameBuffer(graph_spectral_freeze_output_r, frames);
  clearFrameBuffer(graph_reverb_output_l, frames);
  clearFrameBuffer(graph_reverb_output_r, frames);
  clearFrameBuffer(graph_dynamics_input_l, frames);
  clearFrameBuffer(graph_dynamics_input_r, frames);
  clearFrameBuffer(graph_dynamics_output_l, frames);
  clearFrameBuffer(graph_dynamics_output_r, frames);
  clearFrameBuffer(graph_master_pre_limiter_l, frames);
  clearFrameBuffer(graph_master_pre_limiter_r, frames);
  clearFrameBuffer(graph_sidechain_input_l, frames);
  clearFrameBuffer(graph_sidechain_input_r, frames);
  clearFrameBuffer(graph_sidechain_output_l, frames);
  clearFrameBuffer(graph_sidechain_output_r, frames);
  clearFrameBuffer(graph_drum_dry_l, frames);
  clearFrameBuffer(graph_drum_dry_r, frames);
  clearFrameBuffer(graph_drum_reverb_send_l, frames);
  clearFrameBuffer(graph_drum_reverb_send_r, frames);
  clearFrameBuffer(graph_drum_delay_a_send_l, frames);
  clearFrameBuffer(graph_drum_delay_a_send_r, frames);
  clearFrameBuffer(graph_drum_delay_b_send_l, frames);
  clearFrameBuffer(graph_drum_delay_b_send_r, frames);
  clearFrameBuffer(graph_drum_granular_send_l, frames);
  clearFrameBuffer(graph_drum_granular_send_r, frames);
  clearFrameBuffer(graph_pad1_dry_l, frames);
  clearFrameBuffer(graph_pad1_dry_r, frames);
  clearFrameBuffer(graph_pad1_reverb_send_l, frames);
  clearFrameBuffer(graph_pad1_reverb_send_r, frames);
  clearFrameBuffer(graph_pad1_delay_a_send_l, frames);
  clearFrameBuffer(graph_pad1_delay_a_send_r, frames);
  clearFrameBuffer(graph_pad1_delay_b_send_l, frames);
  clearFrameBuffer(graph_pad1_delay_b_send_r, frames);
  clearFrameBuffer(graph_pad1_granular_send_l, frames);
  clearFrameBuffer(graph_pad1_granular_send_r, frames);
  clearFrameBuffer(graph_pad1_diffuse_send_l, frames);
  clearFrameBuffer(graph_pad1_diffuse_send_r, frames);
  clearFrameBuffer(graph_pad2_dry_l, frames);
  clearFrameBuffer(graph_pad2_dry_r, frames);
  clearFrameBuffer(graph_pad2_reverb_send_l, frames);
  clearFrameBuffer(graph_pad2_reverb_send_r, frames);
  clearFrameBuffer(graph_pad2_delay_a_send_l, frames);
  clearFrameBuffer(graph_pad2_delay_a_send_r, frames);
  clearFrameBuffer(graph_pad2_delay_b_send_l, frames);
  clearFrameBuffer(graph_pad2_delay_b_send_r, frames);
  clearFrameBuffer(graph_pad2_granular_send_l, frames);
  clearFrameBuffer(graph_pad2_granular_send_r, frames);
  clearFrameBuffer(graph_pad2_diffuse_send_l, frames);
  clearFrameBuffer(graph_pad2_diffuse_send_r, frames);
  clearFrameBuffer(graph_lead1_dry_l, frames);
  clearFrameBuffer(graph_lead1_dry_r, frames);
  clearFrameBuffer(graph_lead1_reverb_send_l, frames);
  clearFrameBuffer(graph_lead1_reverb_send_r, frames);
  clearFrameBuffer(graph_lead1_delay_a_send_l, frames);
  clearFrameBuffer(graph_lead1_delay_a_send_r, frames);
  clearFrameBuffer(graph_lead1_delay_b_send_l, frames);
  clearFrameBuffer(graph_lead1_delay_b_send_r, frames);
  clearFrameBuffer(graph_lead1_granular_send_l, frames);
  clearFrameBuffer(graph_lead1_granular_send_r, frames);
  clearFrameBuffer(graph_lead1_diffuse_send_l, frames);
  clearFrameBuffer(graph_lead1_diffuse_send_r, frames);
  clearFrameBuffer(graph_lead2_dry_l, frames);
  clearFrameBuffer(graph_lead2_dry_r, frames);
  clearFrameBuffer(graph_lead2_reverb_send_l, frames);
  clearFrameBuffer(graph_lead2_reverb_send_r, frames);
  clearFrameBuffer(graph_lead2_delay_a_send_l, frames);
  clearFrameBuffer(graph_lead2_delay_a_send_r, frames);
  clearFrameBuffer(graph_lead2_delay_b_send_l, frames);
  clearFrameBuffer(graph_lead2_delay_b_send_r, frames);
  clearFrameBuffer(graph_lead2_granular_send_l, frames);
  clearFrameBuffer(graph_lead2_granular_send_r, frames);
  clearFrameBuffer(graph_lead2_diffuse_send_l, frames);
  clearFrameBuffer(graph_lead2_diffuse_send_r, frames);
  clearFrameBuffer(graph_piano_dry_l, frames);
  clearFrameBuffer(graph_piano_dry_r, frames);
  clearFrameBuffer(graph_piano_reverb_send_l, frames);
  clearFrameBuffer(graph_piano_reverb_send_r, frames);
  clearFrameBuffer(graph_piano_delay_a_send_l, frames);
  clearFrameBuffer(graph_piano_delay_a_send_r, frames);
  clearFrameBuffer(graph_piano_delay_b_send_l, frames);
  clearFrameBuffer(graph_piano_delay_b_send_r, frames);
  clearFrameBuffer(graph_piano_granular_send_l, frames);
  clearFrameBuffer(graph_piano_granular_send_r, frames);
  clearFrameBuffer(graph_piano_diffuse_send_l, frames);
  clearFrameBuffer(graph_piano_diffuse_send_r, frames);
  clearFrameBuffer(graph_sample2_dry_l, frames);
  clearFrameBuffer(graph_sample2_dry_r, frames);
  clearFrameBuffer(graph_sample2_reverb_send_l, frames);
  clearFrameBuffer(graph_sample2_reverb_send_r, frames);
  clearFrameBuffer(graph_sample2_delay_a_send_l, frames);
  clearFrameBuffer(graph_sample2_delay_a_send_r, frames);
  clearFrameBuffer(graph_sample2_delay_b_send_l, frames);
  clearFrameBuffer(graph_sample2_delay_b_send_r, frames);
  clearFrameBuffer(graph_sample2_granular_send_l, frames);
  clearFrameBuffer(graph_sample2_granular_send_r, frames);
  clearFrameBuffer(graph_sample2_diffuse_send_l, frames);
  clearFrameBuffer(graph_sample2_diffuse_send_r, frames);
}

  void KesshoProductEngine::clearOutput(float* out_l, float* out_r, uint32_t frames) {
  const uint32_t stem_frames = std::min<uint32_t>(frames, kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES);
  clearAudioOutput(out_l, out_r, frames);
  if (captureStems()) {
    clearStemOutput(stem_frames);
  }
  clearBusOutput(stem_frames);
  if (graph_taps_enabled) {
    clearGraphTapOutput(stem_frames);
  }
  diffuse_bus_active_this_block = false;
  last_stem_frames = captureStems() ? stem_frames : 0u;
}

void KesshoProductEngine::render(float* out_l, float* out_r, uint32_t frames) {
  if (out_l == nullptr || out_r == nullptr || frames == 0u) {
    return;
  }
  if (frames > max_block_size || frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    clearOutput(out_l, out_r, std::min<uint32_t>(frames, max_block_size));
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_RENDER_BLOCK_TOO_LARGE;
    return;
  }

  clearOutput(out_l, out_r, frames);

  uint32_t control_index = 0;
  while (control_index < control_event_count && control_events[control_index].event.sample_offset == 0u) {
    applyControlEvent(control_events[control_index].event);
    ++control_index;
  }
  applyPendingTransportTransition();
  applyPendingSequencerAudibilityTransitions();
  applySequencerChainTransitions();
  scheduleJourneyRuntime();
  scheduleGlobalAutoCycle();
  scheduleSceneRuntimeEvents();

  advanceModulationRanges(frames);
  advanceGranularPhraseReseed();
  advanceReverbHarmonyCoupling(frames);
  if (transport.running) {
    ensureSoundscapeVoice();
  } else {
    stopSoundscapeTransportRuntime();
  }
  uint32_t sequencer_event_total = 0u;
  uint32_t cursor = 0;
  while (cursor < frames) {
    while (control_index < control_event_count && control_events[control_index].event.sample_offset == cursor) {
      applyControlEvent(control_events[control_index].event);
      ++control_index;
    }
    applyPendingTransportTransition();
    applyPendingSequencerAudibilityTransitions();
    applySequencerChainTransitions();
    scheduleJourneyRuntime();
    scheduleGlobalAutoCycle();
    scheduleSceneRuntimeEvents();
    advanceHarmonyClock();
    applyAutoStopAtCurrentFrame();
    scheduleSourceMorphAutomation();

    uint32_t control_segment_end = frames;
    if (control_index < control_event_count) {
      control_segment_end = std::min(control_segment_end, control_events[control_index].event.sample_offset);
    }
    if (transport.transition_pending && transport.pending_apply_frame > transport.sample_frame) {
      const uint64_t frames_until_transition = transport.pending_apply_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_transition, frames - cursor)));
    }
    if (pending_phrase_timing_event_count > 0u && pending_phrase_timing_apply_frame > transport.sample_frame) {
      const uint64_t frames_until_timing = pending_phrase_timing_apply_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_timing, frames - cursor)));
    }
    const uint64_t next_audibility_frame = nextPendingSequencerAudibilityFrame();
    if (next_audibility_frame != UINT64_MAX && next_audibility_frame > transport.sample_frame) {
      const uint64_t frames_until_audibility = next_audibility_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_audibility, frames - cursor)));
    }
    const uint64_t next_chain_frame = nextSequencerChainBoundaryFrame();
    if (next_chain_frame != UINT64_MAX && next_chain_frame > transport.sample_frame) {
      const uint64_t frames_until_chain = next_chain_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_chain, frames - cursor)));
    }
    if (harmony.next_harmony_frame != UINT64_MAX && harmony.next_harmony_frame > transport.sample_frame) {
      const uint64_t frames_until_harmony = harmony.next_harmony_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_harmony, frames - cursor)));
    }
    const uint64_t auto_stop_frame = nextAutoStopFrame();
    if (auto_stop_frame != UINT64_MAX && auto_stop_frame > transport.sample_frame) {
      const uint64_t frames_until_stop = auto_stop_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_stop, frames - cursor)));
    }
    const uint64_t auto_cycle_frame = nextGlobalAutoCycleFrame();
    if (auto_cycle_frame != UINT64_MAX && auto_cycle_frame > transport.sample_frame) {
      const uint64_t frames_until_auto_cycle = auto_cycle_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_auto_cycle, frames - cursor)));
    }
    const uint64_t journey_frame = nextJourneyScheduleFrame();
    if (journey_frame != UINT64_MAX && journey_frame > transport.sample_frame) {
      const uint64_t frames_until_journey = journey_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_journey, frames - cursor)));
    }
    const uint64_t routing_mute_frame = nextRoutingMuteGroupFrame();
    if (routing_mute_frame != UINT64_MAX && routing_mute_frame > transport.sample_frame) {
      const uint64_t frames_until_routing_mute = routing_mute_frame - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_routing_mute, frames - cursor)));
    }
    if (control_segment_end <= cursor) {
      control_segment_end = cursor + 1u;
    }
    const uint32_t initial_control_segment_frames = control_segment_end - cursor;
    scheduleRoutingMuteGroups(initial_control_segment_frames);
    const uint64_t routing_mute_after_schedule = nextRoutingMuteGroupFrame();
    if (routing_mute_after_schedule != UINT64_MAX &&
        routing_mute_after_schedule > transport.sample_frame) {
      const uint64_t frames_until_routing_mute = routing_mute_after_schedule - transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_routing_mute, frames - cursor)));
    }
    if (control_segment_end <= cursor) {
      control_segment_end = cursor + 1u;
    }
    const uint32_t control_segment_frames = control_segment_end - cursor;
    generateSequencerEvents(control_segment_frames);
    sequencer_event_total += sequencer_events.count;

    uint32_t sequencer_index = 0;
    uint32_t local_cursor = 0;
    while (local_cursor < control_segment_frames) {
      while (
          sequencer_index < sequencer_events.count &&
          sequencer_events.events[sequencer_index].sample_offset == local_cursor) {
        triggerSequencerEvent(sequencer_events.events[sequencer_index]);
        ++sequencer_index;
      }

      uint32_t next_event_offset = control_segment_frames;
      if (sequencer_index < sequencer_events.count) {
        next_event_offset = std::min(next_event_offset, sequencer_events.events[sequencer_index].sample_offset);
      }
      if (next_event_offset <= local_cursor) {
        next_event_offset = local_cursor + 1u;
      }
      const uint32_t segment_frames = next_event_offset - local_cursor;
      renderSegment(out_l, out_r, cursor + local_cursor, segment_frames);
      if (transport.running) {
        transport.sample_frame += segment_frames;
      }
      audio_render_sample_frame += segment_frames;
      local_cursor = next_event_offset;
    }
    cursor = control_segment_end;
  }

  sequencer_events.count = std::min<uint32_t>(
      sequencer_event_total,
      kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS);
  renderDiffuseBus(out_l, out_r, frames);
  renderFxGraph(out_l, out_r, 0u, frames);
  applyMaster(out_l, out_r, frames);
  updateInteractionSignals(frames);
  emitTransportClockInteractionEvents();
  compactControlEvents(frames, control_index);
  advanceJourney(frames);
  product_render_frame += frames;
  finishRealtimeTelemetryBlock(frames);
}
