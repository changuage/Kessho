#pragma once

#include <stdint.h>

#include "KesshoProductChord.h"

#ifdef __cplusplus
extern "C" {
#endif

// This is deliberately a small fixed wire format.  The audio thread owns the
// active copy; callers submit one pending copy and it becomes audible at a
// sequencer boundary.  Four variations * four 32-step snapshots is the whole
// bank; the chain only names those snapshots.
enum {
  KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION = 2u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT = 4u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS = 32u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_ENTRIES = 4u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_STEPS = 128u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_NOTES_PER_STEP = 32u,
  // Nine step-value sublanes (field ids 1..8, 0 = trigger) plus the Notes lane.
  KESSHO_PRODUCT_SEQUENCER_VARIATION_SUBLANE_COUNT = 10u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_NOTES_SUBLANE = 9u,
};

typedef enum KesshoProductSequencerNotesCellKind {
  KESSHO_PRODUCT_SEQUENCER_NOTES_CELL_REST = 0u,
  // Plays the part's harmony pitch plus each note's semitone interval.
  KESSHO_PRODUCT_SEQUENCER_NOTES_CELL_HARMONY = 1u,
  // Plays its notes as absolute MIDI.
  KESSHO_PRODUCT_SEQUENCER_NOTES_CELL_FIXED = 2u,
  // Resolves `intent` against the harmony frame; `notes` is a display cache.
  KESSHO_PRODUCT_SEQUENCER_NOTES_CELL_FOLLOW = 3u,
} KesshoProductSequencerNotesCellKind;

typedef enum KesshoProductSequencerNotesArticulation {
  KESSHO_PRODUCT_SEQUENCER_NOTES_ARTICULATION_CHORD = 0u,
  KESSHO_PRODUCT_SEQUENCER_NOTES_ARTICULATION_ARP = 1u,
} KesshoProductSequencerNotesArticulation;

typedef struct KesshoProductSequencerNotesCell {
  uint32_t kind;
  uint32_t articulation;
  uint32_t note_count;
  float gate_beats;
  // ARP spans this many owning grid steps.  Zero is the normal one-step span.
  float arp_span_steps;
  uint32_t arp_direction;
  // ProductArpConfig, kept local to an ARP cell so the existing audio arp
  // resolver can be reused without making a second lane authority.
  uint32_t arp_rate_x2;
  uint32_t arp_length;
  uint32_t arp_pulse_mask;
  uint32_t arp_flow;
  uint32_t arp_contour_mode;
  uint32_t arp_boundary_mode;
  uint32_t arp_reset_mask;
  int32_t arp_contour[16];
  int32_t arp_slot_lane[16];
  KesshoProductChordIntent intent;
  KesshoProductChordNote notes[KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_NOTES_PER_STEP];
} KesshoProductSequencerNotesCell;

typedef struct KesshoProductSequencerVariationSnapshot {
  uint32_t step_count;
  uint32_t clock_division;
  float swing;
  uint32_t trigger_mask;
  uint32_t sublane_enabled_mask;
  uint32_t sublane_steps[KESSHO_PRODUCT_SEQUENCER_VARIATION_SUBLANE_COUNT];
  uint32_t sublane_directions[KESSHO_PRODUCT_SEQUENCER_VARIATION_SUBLANE_COUNT];
  uint32_t sublane_follow_trigger_hits_mask;
  uint32_t probability_mask;
  uint32_t ratchet_mask;
  uint32_t trig_condition_mask;
  uint32_t midi_note_mask;
  uint32_t expression_mask;
  uint32_t morph_mask;
  uint32_t distance_mask;
  uint32_t nudge_mask;
  uint32_t expression_range_mask;
  uint32_t morph_range_mask;
  uint32_t distance_range_mask;
  float probability[32];
  uint32_t ratchet[32];
  uint32_t trig_condition_numerators[32];
  uint32_t trig_condition_denominators[32];
  float midi_notes[32];
  float expression[32];
  float expression_range_maxes[32];
  float morph[32];
  float morph_range_maxes[32];
  float distance[32];
  float distance_range_maxes[32];
  float nudge_values[32];
  KesshoProductSequencerNotesCell cells[KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS];
} KesshoProductSequencerVariationSnapshot;

typedef struct KesshoProductSequencerVariationBank {
  uint32_t schema_version;
  uint32_t enabled;
  uint32_t chain_length;
  uint32_t chain[KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_ENTRIES];
  // Selection used when chain playback is disabled.  The UI edit selection is
  // intentionally absent from this audio payload.
  uint32_t play_variation;
  uint64_t revision;
  KesshoProductSequencerVariationSnapshot variations[KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT];
} KesshoProductSequencerVariationBank;

typedef struct KesshoProductSequencerVariationRuntime {
  uint32_t schema_version;
  uint32_t active_variation;
  uint32_t chain_position;
  uint32_t active_step;
  uint64_t revision;
  uint64_t next_boundary_frame;
} KesshoProductSequencerVariationRuntime;

#ifdef __cplusplus
}

static_assert(
    sizeof(KesshoProductSequencerNotesCell) == 856u,
    "sequencer notes cell ABI changed");
static_assert(
    sizeof(KesshoProductSequencerVariationSnapshot) == 29076u,
    "sequencer variation snapshot ABI changed");
static_assert(
    sizeof(KesshoProductSequencerVariationBank) == 116344u,
    "sequencer variation bank ABI changed");
#endif
