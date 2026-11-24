#pragma once

#include <stdint.h>

#include "KesshoCore/KesshoProductChord.h"

namespace kessho::product::music {

// Effective harmony frame (key drift / route already applied by the caller).
struct ChordFrame {
  float root_midi = 60.0f;
  uint32_t scale_id = 0u;
};

struct ChordResolveOptions {
  bool smooth = false;
  const KesshoProductChordNote* previous = nullptr;
  uint32_t previous_count = 0u;
};

// Resolves a chord intent to MIDI notes, ascending, bass first.  FIXED copies
// `notes`; FOLLOW derives the notes from the intent against `frame` (the input
// notes are only a display cache).  Returns the number of notes written, at
// most min(out_capacity, MAX_NOTES + 1).  Allocation-free, audio-thread safe.
uint32_t resolveChord(const KesshoProductChordIntent& intent,
                      const KesshoProductChordNote* notes, uint32_t note_count,
                      const ChordFrame& frame, const ChordResolveOptions& options,
                      KesshoProductChordNote* out, uint32_t out_capacity);

} // namespace kessho::product::music
