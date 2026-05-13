#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::schedulePadVoiceRelease(uint32_t pad_index, uint32_t voice_index, float hold_seconds) {
  if (pad_index >= static_cast<uint32_t>(PAD_NUM_PADS) || voice_index >= static_cast<uint32_t>(PAD_NUM_VOICES)) {
    return;
  }
  for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
    pad_voice_release_frames[pad][voice_index] = 0u;
  }
  if (!std::isfinite(hold_seconds) || hold_seconds <= 0.0f || sample_rate <= 0.0) {
    return;
  }
  const double requested_frames = static_cast<double>(hold_seconds) * sample_rate;
  pad_voice_release_frames[pad_index][voice_index] =
      static_cast<uint32_t>(std::max(1.0, std::min(requested_frames, static_cast<double>(UINT32_MAX))));
}

  void KesshoProductEngine::clearPadVoiceReleases(uint32_t source_id) {
  const bool clear_all = source_id == 0u;
  for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
    const uint32_t pad_source_id = pad == 0u ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_PAD2;
    if (!clear_all && source_id != pad_source_id) {
      continue;
    }
    for (uint32_t voice = 0; voice < static_cast<uint32_t>(PAD_NUM_VOICES); ++voice) {
      pad_voice_release_frames[pad][voice] = 0u;
    }
  }
}

  void KesshoProductEngine::advancePadVoiceReleases(uint32_t frames) {
  if (!pad_module || frames == 0u) {
    return;
  }
  for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
    for (uint32_t voice = 0; voice < static_cast<uint32_t>(PAD_NUM_VOICES); ++voice) {
      uint32_t& remaining = pad_voice_release_frames[pad][voice];
      if (remaining == 0u) {
        continue;
      }
      if (remaining <= frames) {
        pad_module->noteOff(static_cast<int>(voice));
        remaining = 0u;
      } else {
        remaining -= frames;
      }
    }
  }
}
