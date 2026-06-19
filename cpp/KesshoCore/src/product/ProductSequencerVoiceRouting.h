#pragma once

#include "ProductConstants.h"

#include <cstdint>

#include "kessho_drum.h"

namespace kessho::product::internal {

struct DrumKitMapEntry {
  uint8_t voice = DRUM_VOICE_KICK;
  int preset_slot = -1;
  float pitch_semis = 0.0f;
  float velocity_to_level = 1.0f;
  float velocity_to_morph = 0.0f;
  float velocity_to_expression = 1.0f;
  uint8_t choke_group = 0u;
  uint32_t seed_salt = 0u;
};

inline float midiNoteForDrumVoice(uint32_t voice) {
  switch (voice) {
    case DRUM_VOICE_SUB: return 35.0f;
    case DRUM_VOICE_KICK: return 36.0f;
    case DRUM_VOICE_CLICK: return 37.0f;
    case DRUM_VOICE_BEEP_HI: return 51.0f;
    case DRUM_VOICE_BEEP_LO: return 50.0f;
    case DRUM_VOICE_NOISE: return 42.0f;
    case DRUM_VOICE_MEMBRANE: return 38.0f;
    default: return 36.0f;
  }
}

inline DrumKitMapEntry defaultDrumKitMapEntry(float midi_note) {
  const int note = static_cast<int>(midi_note >= 0.0f ? midi_note + 0.5f : midi_note - 0.5f);
  switch (note) {
    case 35: return {DRUM_VOICE_SUB, -1, -2.0f, 1.0f, 0.05f, 1.0f, 0u, 35u};
    case 36: return {DRUM_VOICE_KICK, -1, 0.0f, 1.0f, 0.0f, 1.0f, 0u, 36u};
    case 37: return {DRUM_VOICE_CLICK, -1, 0.0f, 1.0f, 0.0f, 1.0f, 0u, 37u};
    case 38: return {DRUM_VOICE_MEMBRANE, -1, 0.0f, 1.0f, 0.0f, 1.0f, 0u, 38u};
    case 39: return {DRUM_VOICE_NOISE, -1, -3.0f, 1.0f, 0.2f, 1.0f, 0u, 39u};
    case 40: return {DRUM_VOICE_MEMBRANE, -1, 2.0f, 1.0f, 0.1f, 1.0f, 0u, 40u};
    case 41: return {DRUM_VOICE_MEMBRANE, -1, -7.0f, 1.0f, 0.0f, 1.0f, 0u, 41u};
    case 42: return {DRUM_VOICE_NOISE, -1, 0.0f, 1.0f, 0.0f, 1.0f, 1u, 42u};
    case 43: return {DRUM_VOICE_MEMBRANE, -1, -5.0f, 1.0f, 0.0f, 1.0f, 0u, 43u};
    case 44: return {DRUM_VOICE_NOISE, -1, -1.0f, 1.0f, 0.1f, 1.0f, 1u, 44u};
    case 45: return {DRUM_VOICE_MEMBRANE, -1, -2.0f, 1.0f, 0.0f, 1.0f, 0u, 45u};
    case 46: return {DRUM_VOICE_NOISE, -1, 2.0f, 1.0f, 0.25f, 1.0f, 1u, 46u};
    case 50: return {DRUM_VOICE_BEEP_LO, -1, 0.0f, 1.0f, 0.0f, 1.0f, 0u, 50u};
    case 51:
    case 53:
    case 56:
      return {DRUM_VOICE_BEEP_HI, -1, static_cast<float>(note - 51), 1.0f, 0.0f, 1.0f, 0u, static_cast<uint32_t>(note)};
    default: {
      const int legacy = std::max(0, std::min(DRUM_NUM_VOICE_TYPES - 1, note - 36));
      return {static_cast<uint8_t>(legacy), -1, 0.0f, 1.0f, 0.0f, 1.0f, 0u, static_cast<uint32_t>(std::max(0, note))};
    }
  }
}

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
