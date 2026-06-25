#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::stopSoundscapeTransportRuntime() {
  bool changed = false;
  if (soundscapes_module && (soundscapes_module_params_configured || soundscapes_module->activeVoiceCount() > 0)) {
    soundscapes_module->allNotesOff();
    soundscapes_module_params_configured = false;
    changed = true;
  }
  for (Voice& voice : voices) {
    if (voice.active && voice.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
      voice.active = false;
      changed = true;
    }
  }
  bool suspended_texture_runtime = false;
  for (uint32_t slot = 0u; slot < kSoundscapeTextureSlotCount; ++slot) {
    SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[slot];
    if (runtime.next_start_frame != 0u) {
      runtime.next_start_frame = 0u;
      suspended_texture_runtime = true;
    }
  }
  if (changed) {
    markActiveVoiceListDirty();
    clearMidiRuntimeForSource(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
  }
  if (!changed && !suspended_texture_runtime) return;
  for (uint32_t slot = 0u; slot < kSoundscapeTextureSlotCount; ++slot) {
    std::fill(soundscape_texture_delay[slot], soundscape_texture_delay[slot] + kSoundscapeTextureHaasDelayMaxFrames, 0.0f);
    soundscape_texture_delay_index[slot] = 0u;
  }
}
