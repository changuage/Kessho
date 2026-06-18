#include "../KesshoProductEngineInternal.h"
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
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) && soundscapes_module) {
    soundscapes_module->allNotesOff();
  }
  for (Voice& voice : voices) {
    if (voice.active && (source_id == 0u || voice.source_id == source_id)) {
      voice.looping = false;
      voice.start_delay_frames = 0u;
      voice.remaining_frames = std::min<uint32_t>(voice.remaining_frames, static_cast<uint32_t>(0.02 * sample_rate));
      voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
    }
  }
  clearMidiRuntimeForSource(source_id);
}
void KesshoProductEngine::stopSoundscapeTransportRuntime() {
  bool changed = false;
  if (soundscapes_module && soundscapes_module->activeVoiceCount() > 0) {
    soundscapes_module->allNotesOff();
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
