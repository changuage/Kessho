#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// One chord value type shared by the sequencer Notes lane, the harmony
// progression and the Brain live layer.  Every zero-initialised struct is
// valid: Follow, tonic degree, diatonic quality, no extensions, root position,
// close voicing, register 0, no separate bass.
enum {
  KESSHO_PRODUCT_CHORD_MAX_NOTES = 8u,
};

enum {
  KESSHO_PRODUCT_CHORD_BEHAVIOR_FOLLOW = 0u,
  KESSHO_PRODUCT_CHORD_BEHAVIOR_FIXED = 1u,
};

enum {
  KESSHO_PRODUCT_CHORD_QUALITY_DIATONIC = 0u,  // stack scale thirds from the degree
  KESSHO_PRODUCT_CHORD_QUALITY_MAJOR = 1u,
  KESSHO_PRODUCT_CHORD_QUALITY_MINOR = 2u,
  KESSHO_PRODUCT_CHORD_QUALITY_DIMINISHED = 3u,
  KESSHO_PRODUCT_CHORD_QUALITY_AUGMENTED = 4u,
  KESSHO_PRODUCT_CHORD_QUALITY_SUS2 = 5u,
  KESSHO_PRODUCT_CHORD_QUALITY_SUS4 = 6u,
  KESSHO_PRODUCT_CHORD_QUALITY_COUNT = 7u,
};

enum {
  KESSHO_PRODUCT_CHORD_EXT_SIXTH = 1u << 0,
  KESSHO_PRODUCT_CHORD_EXT_SEVENTH = 1u << 1,
  KESSHO_PRODUCT_CHORD_EXT_NINTH = 1u << 2,
  KESSHO_PRODUCT_CHORD_EXT_ELEVENTH = 1u << 3,
  KESSHO_PRODUCT_CHORD_EXT_THIRTEENTH = 1u << 4,
  KESSHO_PRODUCT_CHORD_EXT_DOMINANT = 1u << 5,  // forces a minor (b7) seventh when SEVENTH is set
};

enum {
  KESSHO_PRODUCT_CHORD_BASS_NONE = 0u,
  KESSHO_PRODUCT_CHORD_BASS_ROOT = 1u,
  KESSHO_PRODUCT_CHORD_BASS_PITCH_CLASS = 2u,
};

typedef struct KesshoProductChordNote {
  float midi;                      // absolute MIDI note (may be fractional; Pitch lane transposes later)
  float velocity;                  // 0..1
  float gate_beats;                // 0 = inherit lane gate
  float offset_beats;              // attack offset from the cell start, >= 0
  uint32_t destination_source_id;  // 0 = inherit the part's destination
} KesshoProductChordNote;

typedef struct KesshoProductChordIntent {
  uint32_t behavior;          // FOLLOW / FIXED
  int32_t degree;             // scale degree of the root; negative or >= scale size wraps with octaves
  uint32_t quality;
  uint32_t extensions;        // EXT_* mask
  int32_t inversion;          // 0 = root position; n rotates the lowest n voices up an octave (mod voice count)
  float spread;               // 0 = close position .. 1 = open
  int32_t register_octave;    // whole-chord octave offset, clamped to -3..3
  uint32_t bass_mode;         // BASS_NONE / BASS_ROOT / BASS_PITCH_CLASS
  uint32_t bass_pitch_class;  // 0..11, used when bass_mode == PITCH_CLASS
} KesshoProductChordIntent;

#ifdef __cplusplus
}
#endif
