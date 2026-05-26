#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

inline uint32_t drumVoiceMaskFromEncodedSeed(uint32_t seed) {
  return (seed & kDrumVoiceMaskSeedFlag) != 0u
      ? (seed & kDrumVoiceMaskSeedMask) >> kDrumVoiceMaskSeedShift
      : 0u;
}

inline uint32_t laneSeedFromEncodedDrumVoiceMask(uint32_t seed) {
  return (seed & kDrumVoiceMaskSeedFlag) != 0u
      ? seed & kDrumVoiceMaskSeedPayloadMask
      : seed;
}

inline uint32_t padVoiceIndexFromEncodedSeed(uint32_t seed) {
  if ((seed & kPadVoiceSeedFlag) == 0u) {
    return kPadVoiceNoPreference;
  }
  const uint32_t encoded = (seed & kPadVoiceSeedMask) >> kPadVoiceSeedShift;
  return encoded >= 1u && encoded <= kProductPadVoiceCount
      ? encoded - 1u
      : kPadVoiceNoPreference;
}

inline uint32_t laneSeedFromEncodedPadVoice(uint32_t seed) {
  return (seed & kPadVoiceSeedFlag) != 0u
      ? seed & kPadVoiceSeedPayloadMask
      : seed;
}

inline uint32_t sequencerPadVoiceEventFlags(uint32_t voice_index) {
  return voice_index < kProductPadVoiceCount
      ? kSequencerEventPadVoiceFlag | ((voice_index + 1u) << kSequencerEventPadVoiceShift)
      : 0u;
}

inline uint32_t padVoiceIndexFromSequencerEventFlags(uint32_t flags) {
  if ((flags & kSequencerEventPadVoiceFlag) == 0u) {
    return kPadVoiceNoPreference;
  }
  const uint32_t encoded = (flags & kSequencerEventPadVoiceMask) >> kSequencerEventPadVoiceShift;
  return encoded >= 1u && encoded <= kProductPadVoiceCount
      ? encoded - 1u
      : kPadVoiceNoPreference;
}

} // namespace kessho::product::internal
