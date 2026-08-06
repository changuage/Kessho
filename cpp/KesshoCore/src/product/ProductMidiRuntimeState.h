#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

struct MidiNoteRuntimeSlot {
  bool active = false;
  bool sustained = false;
  bool transient_audition = false;
  uint32_t source_id = 0u;
  uint32_t channel = 0u;
  uint32_t note = 0u;
  uint32_t owner_token = 0u;
  uint32_t pad_voice_index = kProductInvalidVoiceIndex;
  uint32_t lead_voice_index = kProductInvalidVoiceIndex;
  uint32_t sample_voice_index = kProductInvalidVoiceIndex;
};

struct MidiControllerRuntimeState {
  uint16_t pitch_bend = static_cast<uint16_t>(kProductMidiPitchBendCenter);
  uint8_t channel_pressure = 0u;
  uint8_t cc_values[kProductMidiControllerCount]{};
  uint8_t poly_pressure[kProductMidiControllerCount]{};
};

} // namespace kessho::product::internal
