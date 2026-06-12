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
  if ((seed & kPadVoiceSeedFlag) == 0u || (seed & kPadVoiceMaskSeedFlag) != 0u) {
    return kPadVoiceNoPreference;
  }
  const uint32_t encoded = (seed & kPadVoiceSeedMask) >> kPadVoiceSeedShift;
  return encoded >= 1u && encoded <= kProductPadVoiceCount
      ? encoded - 1u
      : kPadVoiceNoPreference;
}

inline uint32_t padVoiceMaskFromEncodedSeed(uint32_t seed) {
  if ((seed & kPadVoiceMaskSeedFlag) != 0u) {
    return ((seed & kPadVoiceMaskSeedMask) >> kPadVoiceMaskSeedShift) & kProductPadVoiceMaskAll;
  }
  const uint32_t voice_index = padVoiceIndexFromEncodedSeed(seed);
  return voice_index < kProductPadVoiceCount ? (1u << voice_index) : 0u;
}

inline uint32_t laneSeedFromEncodedPadVoice(uint32_t seed) {
  if ((seed & kPadVoiceMaskSeedFlag) != 0u) {
    return seed & kPadVoiceMaskSeedPayloadMask;
  }
  if ((seed & kPadVoiceSeedFlag) != 0u) {
    return seed & kPadVoiceSeedPayloadMask;
  }
  return seed;
}

inline uint32_t padVoiceIndexFromMask(uint32_t voice_mask, uint64_t hit_count) {
  const uint32_t mask = voice_mask & kProductPadVoiceMaskAll;
  if (mask == 0u) {
    return kPadVoiceNoPreference;
  }
  uint32_t voice_count = 0u;
  for (uint32_t voice_index = 0u; voice_index < kProductPadVoiceCount; ++voice_index) {
    if ((mask & (1u << voice_index)) != 0u) {
      ++voice_count;
    }
  }
  if (voice_count == 0u) {
    return kPadVoiceNoPreference;
  }
  uint32_t target_rank = static_cast<uint32_t>(hit_count % voice_count);
  for (uint32_t voice_index = 0u; voice_index < kProductPadVoiceCount; ++voice_index) {
    if ((mask & (1u << voice_index)) == 0u) {
      continue;
    }
    if (target_rank == 0u) {
      return voice_index;
    }
    --target_rank;
  }
  return kPadVoiceNoPreference;
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
