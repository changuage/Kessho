#pragma once

#include "ProductMidiRuntimeState.h"
#include "ProductVoiceState.h"
#include "../modules/KesshoModule.h"
#include "kessho_pad.h"
#include "kessho_lead_fm.h"

#include <array>
#include <memory>

namespace kessho::product::internal {

struct SoundscapeFamilyGainState {
  float gain = 0.0f;
  float target = 0.0f;
  float delta = 0.0f;
  uint32_t remaining = 0u;
  uint64_t frame = 0u;
};

struct HarmonyModuleVoiceState {
  float midi_note = 60.0f;
  float gain = 1.0f;
  float target_gain = 1.0f;
  uint32_t fade_frames_remaining = 0u;
  bool active = false;
  bool harmony_resolved = false;
};

struct ProductModuleRuntimeState {
  bool modules_ready = false;
  std::unique_ptr<kessho::core::IKesshoModule> pad_module{};
  std::unique_ptr<kessho::core::IKesshoModule> lead_modules[2]{};
  std::unique_ptr<kessho::core::IKesshoModule> drum_module{};
  std::unique_ptr<kessho::core::IKesshoModule> delay_a_module{};
  std::unique_ptr<kessho::core::IKesshoModule> delay_b_module{};
  std::unique_ptr<kessho::core::IKesshoModule> reverb_module{};
  std::unique_ptr<kessho::core::IKesshoModule> granular_module{};
  std::unique_ptr<kessho::core::IKesshoModule> spectral_freeze_module{};
  std::unique_ptr<kessho::core::IKesshoModule> dynamics_drift_module{};
  std::unique_ptr<kessho::core::IKesshoModule> dynamics_degrade_send_module{};
  std::unique_ptr<kessho::core::IKesshoModule> soundscapes_module{};
  std::array<float, kSoundscapeModuleParamCount> soundscapes_module_param_cache{};
  bool soundscapes_module_params_configured = false;
  SoundscapeTextureRuntime soundscape_texture_runtimes[kSoundscapeTextureSlotCount]{};
  float soundscape_texture_delay[kSoundscapeTextureSlotCount][kSoundscapeTextureHaasDelayMaxFrames]{};
  uint32_t soundscape_texture_delay_index[kSoundscapeTextureSlotCount]{};
  SoundscapeFamilyGainState soundscape_family_gains[2]{}; // Water, Insects
  SoundscapeFamilyGainState soundscape_insects_layer_gains[2]{};
  uint64_t product_render_frame = 0u;
  uint32_t pad_voice_cursors[2]{};
  uint32_t pad_voice_release_frames[PAD_NUM_PADS][PAD_NUM_VOICES]{};
  HarmonyModuleVoiceState pad_harmony_voice_states[PAD_NUM_VOICES]{};
  HarmonyModuleVoiceState lead_harmony_voice_states[2][LEAD_FM_MAX_POLYPHONY]{};
  MidiNoteRuntimeSlot midi_note_slots[kMaxProductMidiNoteSlots]{};
  MidiControllerRuntimeState midi_controller_state[kSourceCount][kProductMidiChannelCount]{};
  bool midi_sustain_down[kSourceCount][kProductMidiChannelCount]{};
  uint32_t next_midi_note_slot = 0u;
  PadPostChainState pad_post_chains[PAD_NUM_PADS]{};
  PadPostChainState pad_send_post_chains[PAD_NUM_PADS]{};
  LeadPostChainState lead_post_chains[2]{};
};

} // namespace kessho::product::internal
