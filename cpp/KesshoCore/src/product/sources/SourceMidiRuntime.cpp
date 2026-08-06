#include "../KesshoProductEngineInternal.h"

namespace {
void resetMidiControllerState(MidiControllerRuntimeState& state) {
  state = {};
  state.pitch_bend = static_cast<uint16_t>(kProductMidiPitchBendCenter);
  state.cc_values[7] = 127u;
  state.cc_values[11] = 127u;
}

uint8_t midiByte(uint32_t value) {
  return static_cast<uint8_t>(std::min<uint32_t>(value, 127u));
}
} // namespace

void KesshoProductEngine::resetMidiRuntimeState() {
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    slot = {};
  }
  for (SourceState& source : sources) {
    source.transient_audition_hold_count = 0u;
    source.transient_audition_until_frame = 0u;
    source.transient_audition_gain = 0.0f;
    source.transient_audition_gain_target = 0.0f;
    source.transient_audition_gain_delta = 0.0f;
    source.transient_audition_gain_ramp_remaining = 0u;
    source.transient_audition_gain_frame = audio_render_sample_frame;
  }
  for (uint32_t source = 0u; source < kSourceCount; ++source) {
    for (uint32_t channel = 0u; channel < kProductMidiChannelCount; ++channel) {
      resetMidiControllerState(midi_controller_state[source][channel]);
      midi_sustain_down[source][channel] = false;
    }
  }
  next_midi_note_slot = 0u;
}

void KesshoProductEngine::clearMidiRuntimeForSource(uint32_t source_id) {
  const bool clear_all = source_id == 0u;
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (slot.active && (clear_all || slot.source_id == source_id)) {
      if (slot.transient_audition) {
        releaseSourceTransientAudition(slot.source_id);
      }
      slot = {};
    }
  }
  for (uint32_t source = 0u; source < kSourceCount; ++source) {
    const uint32_t current_source_id = source + 1u;
    if (!clear_all && source_id != current_source_id) {
      continue;
    }
    for (uint32_t channel = 0u; channel < kProductMidiChannelCount; ++channel) {
      midi_sustain_down[source][channel] = false;
    }
  }
  if (clear_all) {
    next_midi_note_slot = 0u;
  }
}

void KesshoProductEngine::clearMidiRuntimeForSampleVoice(uint32_t voice_index) {
  if (voice_index >= kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES) {
    return;
  }
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (slot.active && slot.sample_voice_index == voice_index) {
      if (slot.transient_audition) {
        releaseSourceTransientAudition(slot.source_id);
      }
      slot = {};
    }
  }
}

void KesshoProductEngine::releaseMidiSlot(MidiNoteRuntimeSlot& slot) {
  if (!slot.active) {
    return;
  }
  if (slot.pad_voice_index != kProductInvalidVoiceIndex && pad_module) {
    pad_module->noteOff(static_cast<int>(slot.pad_voice_index));
    if (slot.source_id == KESSHO_PRODUCT_SOURCE_PAD1 || slot.source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
      const uint32_t pad_index = slot.source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      if (pad_index < static_cast<uint32_t>(PAD_NUM_PADS) &&
          slot.pad_voice_index < static_cast<uint32_t>(PAD_NUM_VOICES)) {
        pad_voice_release_frames[pad_index][slot.pad_voice_index] = 0u;
      }
    }
  }
  if (slot.lead_voice_index != kProductInvalidVoiceIndex) {
    if (slot.source_id == KESSHO_PRODUCT_SOURCE_LEAD1 && lead_modules[0]) {
      lead_modules[0]->noteOff(static_cast<int>(slot.lead_voice_index));
    } else if (slot.source_id == KESSHO_PRODUCT_SOURCE_LEAD2 && lead_modules[1]) {
      lead_modules[1]->noteOff(static_cast<int>(slot.lead_voice_index));
    }
  }
  if (slot.sample_voice_index < kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES) {
    Voice& voice = voices[slot.sample_voice_index];
    if (voice.active) {
      voice.looping = false;
      voice.start_delay_frames = 0u;
      const uint32_t release_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(0.02 * sample_rate));
      voice.remaining_frames = std::min<uint32_t>(voice.remaining_frames, release_frames);
      voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
    }
  }
  if (slot.transient_audition) {
    releaseSourceTransientAudition(slot.source_id);
  }
  slot = {};
}

void KesshoProductEngine::trackMidiNoteOn(
    uint32_t source_id,
    uint32_t channel,
    uint32_t note,
    uint32_t pad_voice_index,
    uint32_t lead_voice_index,
    uint32_t sample_voice_index,
    uint32_t owner_token,
    bool transient_audition) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount || note > 127u) {
    return;
  }
  if (pad_voice_index == kProductInvalidVoiceIndex &&
      lead_voice_index == kProductInvalidVoiceIndex &&
      sample_voice_index == kProductInvalidVoiceIndex) {
    return;
  }
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (!slot.active || slot.source_id != source_id) {
      continue;
    }
    if (pad_voice_index != kProductInvalidVoiceIndex && slot.pad_voice_index == pad_voice_index) {
      if (slot.transient_audition) {
        releaseSourceTransientAudition(slot.source_id);
      }
      slot = {};
      continue;
    }
    if (lead_voice_index != kProductInvalidVoiceIndex && slot.lead_voice_index == lead_voice_index) {
      if (slot.transient_audition) {
        releaseSourceTransientAudition(slot.source_id);
      }
      slot = {};
      continue;
    }
    if (sample_voice_index != kProductInvalidVoiceIndex && slot.sample_voice_index == sample_voice_index) {
      if (slot.transient_audition) {
        releaseSourceTransientAudition(slot.source_id);
      }
      slot = {};
    }
  }
  MidiNoteRuntimeSlot* target = nullptr;
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (!slot.active) {
      target = &slot;
      break;
    }
  }
  if (target == nullptr) {
    target = &midi_note_slots[next_midi_note_slot % kMaxProductMidiNoteSlots];
    releaseMidiSlot(*target);
    next_midi_note_slot = (next_midi_note_slot + 1u) % kMaxProductMidiNoteSlots;
  }
  target->active = true;
  target->sustained = false;
  target->transient_audition = transient_audition;
  target->source_id = source_id;
  target->channel = channel;
  target->note = note;
  target->owner_token = owner_token;
  target->pad_voice_index = pad_voice_index;
  target->lead_voice_index = lead_voice_index;
  target->sample_voice_index = sample_voice_index;
}

void KesshoProductEngine::applyMidiNoteOff(
    uint32_t source_id,
    uint32_t channel,
    uint32_t note,
    uint32_t owner_token) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount || note > 127u) {
    return;
  }
  const bool sustain_down = midi_sustain_down[source_id - 1u][channel];
  bool matched = false;
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (!slot.active ||
        slot.source_id != source_id ||
        slot.channel != channel ||
        slot.note != note ||
        (owner_token != 0u && slot.owner_token != owner_token)) {
      continue;
    }
    matched = true;
    if (sustain_down) {
      slot.sustained = true;
    } else {
      releaseMidiSlot(slot);
    }
  }
  if (!matched && source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }
}

void KesshoProductEngine::applyMidiSustain(uint32_t source_id, uint32_t channel, bool sustain_down) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount) {
    return;
  }
  bool& current = midi_sustain_down[source_id - 1u][channel];
  if (current == sustain_down) {
    return;
  }
  current = sustain_down;
  if (sustain_down) {
    return;
  }
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (slot.active && slot.sustained && slot.source_id == source_id && slot.channel == channel) {
      releaseMidiSlot(slot);
    }
  }
}

void KesshoProductEngine::applyMidiControlChange(uint32_t source_id, uint32_t channel, uint32_t controller, uint32_t value) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount ||
      controller >= kProductMidiControllerCount) {
    return;
  }
  MidiControllerRuntimeState& state = midi_controller_state[source_id - 1u][channel];
  state.cc_values[controller] = midiByte(value);
  if (controller == 64u) {
    applyMidiSustain(source_id, channel, value >= 64u);
    return;
  }
  if (controller == 120u || controller == 123u) {
    releaseSourceVoices(source_id);
  }
}

void KesshoProductEngine::applyMidiPitchBend(uint32_t source_id, uint32_t channel, uint32_t lsb, uint32_t msb) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount) {
    return;
  }
  const uint32_t bend = std::min<uint32_t>(
      kProductMidiPitchBendMax,
      midiByte(lsb) | (static_cast<uint32_t>(midiByte(msb)) << 7u));
  midi_controller_state[source_id - 1u][channel].pitch_bend = static_cast<uint16_t>(bend);
  applyMidiPitchBendToActiveNotes(source_id, channel);
}

void KesshoProductEngine::applyMidiPitchBendToActiveNotes(uint32_t source_id, uint32_t channel) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount) {
    return;
  }
  const float bend_semitones = midiPitchBendSemitones(source_id, channel);
  for (MidiNoteRuntimeSlot& slot : midi_note_slots) {
    if (!slot.active || slot.source_id != source_id || slot.channel != channel) {
      continue;
    }
    const float frequency = midiToFrequency(clampFloat(static_cast<float>(slot.note) + bend_semitones, 0.0f, 127.0f));
    if (slot.pad_voice_index != kProductInvalidVoiceIndex && pad_module) {
      pad_module->setVoiceFrequency(static_cast<int>(slot.pad_voice_index), frequency);
    }
    if (slot.lead_voice_index != kProductInvalidVoiceIndex) {
      if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 && lead_modules[0]) {
        lead_modules[0]->setVoiceFrequency(static_cast<int>(slot.lead_voice_index), frequency);
      } else if (source_id == KESSHO_PRODUCT_SOURCE_LEAD2 && lead_modules[1]) {
        lead_modules[1]->setVoiceFrequency(static_cast<int>(slot.lead_voice_index), frequency);
      }
    }
    if (slot.sample_voice_index < kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES) {
      Voice& voice = voices[slot.sample_voice_index];
      if (voice.active && voice.piano_sample_voice && voice.frequency > 0.0f) {
        const double ratio = static_cast<double>(frequency) / static_cast<double>(voice.frequency);
        voice.frequency = frequency;
        voice.sample_step *= ratio;
      }
    }
  }
}

void KesshoProductEngine::applyMidiChannelPressure(uint32_t source_id, uint32_t channel, uint32_t pressure) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount) {
    return;
  }
  midi_controller_state[source_id - 1u][channel].channel_pressure = midiByte(pressure);
}

void KesshoProductEngine::applyMidiPolyPressure(uint32_t source_id, uint32_t channel, uint32_t note, uint32_t pressure) {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount ||
      note >= kProductMidiControllerCount) {
    return;
  }
  midi_controller_state[source_id - 1u][channel].poly_pressure[note] = midiByte(pressure);
}

float KesshoProductEngine::midiPitchBendSemitones(uint32_t source_id, uint32_t channel) const {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount) {
    return 0.0f;
  }
  const uint32_t bend = midi_controller_state[source_id - 1u][channel].pitch_bend;
  const int32_t centered = static_cast<int32_t>(bend) - static_cast<int32_t>(kProductMidiPitchBendCenter);
  const float normalized = static_cast<float>(centered) / static_cast<float>(kProductMidiPitchBendCenter);
  return clampFloat(normalized, -1.0f, 1.0f) * kProductMidiPitchBendRangeSemitones;
}

float KesshoProductEngine::midiControllerVelocityScale(uint32_t source_id, uint32_t channel, uint32_t note) const {
  if (source_id < 1u || source_id > kSourceCount || channel >= kProductMidiChannelCount) {
    return 1.0f;
  }
  const MidiControllerRuntimeState& state = midi_controller_state[source_id - 1u][channel];
  const float channel_volume = static_cast<float>(state.cc_values[7]) / 127.0f;
  const float expression = static_cast<float>(state.cc_values[11]) / 127.0f;
  const uint32_t note_pressure = note < kProductMidiControllerCount ? state.poly_pressure[note] : 0u;
  const uint32_t pressure = std::max<uint32_t>(state.channel_pressure, note_pressure);
  const float pressure_boost = pressure == 0u ? 1.0f : 1.0f + (static_cast<float>(pressure) / 127.0f) * 0.25f;
  return clampFloat(channel_volume * expression * pressure_boost, 0.0f, 1.5f);
}
