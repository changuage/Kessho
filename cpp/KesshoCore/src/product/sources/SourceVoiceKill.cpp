#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::killSourceVoices(uint32_t source_id) {
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) && pad_module) {
    for (uint32_t voice = 0u; voice < kProductPadVoiceCount; ++voice) {
      pad_module->killVoice(static_cast<int>(voice));
    }
    clearPadVoiceReleases(0u);
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_LEAD1) && lead_modules[0]) {
    lead_modules[0]->killVoice(0);
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) && lead_modules[1]) {
    lead_modules[1]->killVoice(0);
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_DRUM) && drum_module) {
    drum_module->allNotesOff();
  }
  if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) && soundscapes_module) {
    soundscapes_module->allNotesOff();
    soundscapes_module_params_configured = false;
  }
  bool changed = false;
  for (Voice& voice : voices) {
    if (voice.active && (source_id == 0u || voice.source_id == source_id)) {
      voice.active = false;
      voice.looping = false;
      voice.start_delay_frames = 0u;
      voice.remaining_frames = 0u;
      voice.total_frames = 1u;
      changed = true;
    }
  }
  if (changed) markActiveVoiceListDirty();
  clearMidiRuntimeForSource(source_id);
}
