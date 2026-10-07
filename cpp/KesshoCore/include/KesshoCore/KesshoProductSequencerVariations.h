#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// This is deliberately a small fixed wire format.  The audio thread owns the
// active copy; callers submit one pending copy and it becomes audible at a
// sequencer boundary.  Four variations * four 32-step snapshots is the whole
// bank; the chain only names those snapshots.
enum {
  KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION = 1u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT = 4u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS = 32u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_ENTRIES = 4u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_STEPS = 128u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_NOTES_PER_STEP = 32u,
};

typedef enum KesshoProductSequencerVariationStepMode {
  KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_EMPTY = 0u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_SINGLE = 1u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_CHORD = 2u,
  KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_ARP = 3u,
} KesshoProductSequencerVariationStepMode;

typedef struct KesshoProductSequencerVariationNote {
  // Semitone offset from the lane's current pitch authority.  The lane's
  // pitch binding, scale, harmony, and sublane cycle remain authoritative.
  float midi_note;
  float velocity;
  // Optional per-note gate.  Zero means use the parent step gate.
  float gate_beats;
} KesshoProductSequencerVariationNote;

typedef struct KesshoProductSequencerVariationStep {
  uint32_t mode;
  uint32_t note_count;
  float gate_beats;
  // ARP spans this many owning grid steps.  Zero is the normal one-step span.
  float arp_span_steps;
  uint32_t arp_direction;
  // A fixed printed pitch is the default.  Set this for an explicit harmony
  // follow on the individual trigger cell.
  uint32_t follow_harmony;
  // ProductArpConfig, kept local to an ARP step so the existing audio arp
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
  KesshoProductSequencerVariationNote notes[KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_NOTES_PER_STEP];
} KesshoProductSequencerVariationStep;

typedef struct KesshoProductSequencerVariationSnapshot {
  uint32_t step_count;
  uint32_t clock_division;
  float swing;
  uint32_t trigger_mask;
  uint32_t sublane_enabled_mask;
  uint32_t sublane_steps[9];
  uint32_t sublane_directions[9];
  uint32_t sublane_follow_trigger_hits_mask;
  float pitch_root;
  uint32_t pitch_mode;
  uint32_t pitch_binding_mode;
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
  KesshoProductSequencerVariationStep steps[KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS];
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
    sizeof(KesshoProductSequencerVariationNote) == 12u,
    "sequencer variation note ABI changed");
static_assert(
    sizeof(KesshoProductSequencerVariationStep) == 564u,
    "sequencer variation step ABI changed");
static_assert(
    sizeof(KesshoProductSequencerVariationSnapshot) == 19736u,
    "sequencer variation snapshot ABI changed");
static_assert(
    sizeof(KesshoProductSequencerVariationBank) == 78984u,
    "sequencer variation bank ABI changed");
#endif
