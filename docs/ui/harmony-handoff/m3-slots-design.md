# M3 technical design: six uniform slots and per-slot Random

> Implementation design for milestone M3 of the [implementation goal](implementation-goal.md), 28 November 2026. Behaviour is fixed by the Slots and Randomness rows of the [Decisions](../harmony-random-brain-design.md#decisions-24-november-2026) table and acceptance 1–4 there. This document decides how the code changes.

## Starting point

| Concern | Today | Where |
| --- | --- | --- |
| Synth slots | 4 lanes (`synth_lane_count = 4`). Each lane is Steps (Euclid), Walker or Orbit (`sequencer_mode` 0, 1 or 2), with Walker and Orbit state in `KesshoProductSequencerLaneModeSnapshot` | `ProductSequencerFaceState.h`, `KesshoProductSnapshot.h:321` |
| Random Chords and Notes | Two singleton producers in the arrangement block: chord-generator fields and `lead_*` fields, sharing one `rng_state` | `ProductArrangementState.h`, `ProductArrangementSequencer.cpp` (420 lines), `KesshoProductArrangementSnapshot` |
| Global settings in the same block | `source_hold_seconds[8]`, `pad_euclid_owned_voice_mask` | same |
| TS state | `synthEuclid1..4*` keys, `synthSequencerFaces.slots[4]`, and arrangement keys (`synthChordGeneratorEnabled`, `leadRandom*`, `waveSpread`, …) | `src/ui/state.ts`, `src/audio/coreProductSnapshot.ts` |
| UI | Synth Simple view hosts the Random Chords and Notes controls; Detail and Overview show the 4 lanes | `src/ui/synth/SynthPage.tsx` |

## Decisions

### S1 · Six lanes, Random is a lane mode
- **Six lanes:** `synth_lane_count` becomes 6. Native already sizes lane arrays to 16, so only the count, the TS slot arrays and the UI change.
- **Random mode:** `kSequencerModeRandom` = 3 joins Steps, Walker and Orbit.
- **Random state:** a Random lane's settings live in a new `KesshoProductRandomSlotSnapshot random` member of `KesshoProductSequencerLaneModeSnapshot`, beside `anchor_walker` and `orbit`.
- **Source:** the lane's existing `target_source_id` is the Random slot's source. There is no separate generator source.

### S2 · One Random block, two modes
`KesshoProductRandomSlotSnapshot`:
```c
uint32_t mode;          // 0 chords, 1 notes
uint32_t part_id;       // stable slot identity, never the lane position
// Chords (existing chord-generator semantics)
uint32_t voice_count; float wave_spread; int32_t octave; uint32_t voice_mask;
uint32_t pad2_voice_assign; uint32_t pad_split; uint32_t fit_envelope_to_chord;
// Notes (existing Random Notes semantics)
float phrase_seconds; float density; int32_t notes_octave; uint32_t octave_range;
float hold_seconds; float velocity_min; float velocity_max; float chord_bias; float initial_delay_seconds;
```
- **Unchanged musical behaviour:** each mode keeps its algorithm, timing, distributions and harmony relationship exactly as the singleton producer had them.
- **Clean split of the arrangement block:**
  - **Kept:** only global settings (`source_hold_seconds[8]`, `pad_euclid_owned_voice_mask`) remain in `KesshoProductArrangementSnapshot`, renamed to what they are.
  - **Deleted:** every generator field leaves it.
  - **Migrated:** `pad1_fit_envelope_to_chord` and `pad2_fit_envelope_to_chord` become the Chords slot's `fit_envelope_to_chord`, applied to whichever pad that slot targets.

### S3 · Per-slot random streams
- **Seeding:** each Random lane seeds its own stream from `hash(seed_window_seed, part_id)` when the snapshot loads or its part ID changes, and on transport reset.
- **No shared state:** the shared `rng_state` and `rng_seed` are deleted.
- **Independence:** reordering lanes, switching another lane's type, or opening an inspector never touches a slot's stream, because nothing else reads or advances it. That is acceptance 4.
- **Behaviour version:** this is the one behaviour-version bump. Migrated presets keep their parameters, timing and distributions, but play different exact notes. The M1 statistics fixture, with its M3 tolerances, is the check.

### S4 · Runtime
- **Per-lane runtime:** phrase counters, next-phrase frames and the pending queue (with the lane index on each pending note) move from `ProductArrangementState` to per-lane Random runtime state.
- **Shared code:** `generateArrangementEvents` becomes a per-lane `generateRandomLaneEvents`, which reuses the Chords and Notes code paths unchanged apart from reading the lane's block and stream.
- **Capture taps:** the T6c taps keep working, keyed by mode with the lane index as the source lane. The sentinel lanes 0x100 and 0x101 are deleted.

### S5 · TS state and migration
- **Slot shape:** `synthSequencerFaces.slots` holds 6 slots. Each slot has a stable `partId` (a random 32-bit integer created once and saved) plus its type (`steps | walker | orbit | random`) and Random settings.
- **Lane keys:** the per-lane `synthEuclidN*` keys extend to N = 5 and 6 under the same shared slider and param-registry rules.
- **Loading an older preset:** the M3 behaviour-version step runs once.
  - **Random Chords:** if `synthChordGeneratorEnabled`, the first free lane of 5 and 6 becomes Random Chords with the generator's saved values and source.
  - **Random Notes:** if `leadRandomEnabled`, the next free lane becomes Random Notes with its saved values.
  - **After migration:** the old arrangement keys are dropped and never saved.

  This is the only allowed migration, and it is the "data/runtime migration" the players scope calls for.
- **Version bump:** the preset behaviour version increments. The M1 audit found one bundled preset (String Waves) using both generators, and it must load as two Random slots with its original sounds.

### S6 · UI
- **Type control:** the slot type control gains Random, with a Chords / Notes choice inside the Random slot.
- **Random surface:** a Random slot shows the existing Random controls, moved out of the Simple view onto the slot surface. These are the same shared sliders with their moving ranges and modulation metadata.
- **Deleted:** the Synth Simple view. Detail and Overview show six slots, in two rows of three on narrow panels.

## Tasks

| # | Task | Agent |
| --- | --- | --- |
| M3-T1 | Native: Random lane mode, per-lane Random block and stream (S1–S4), six lanes, delete the singleton generator fields and shared RNG, and new determinism tests (acceptance 4). TS snapshot builder: map today's TS state onto lanes, with the arrangement generators going to lanes 5 and 6, so the M1 fixture can run. Covers the ABI, encoder, WASM and the M1 statistics fixture. | Sonnet |
| M3-T2 | TS state: six slots with `partId`, Random settings per slot, the migration (S5), the behaviour-version bump, deletion of the arrangement keys, and preset tests. | Sonnet |
| M3-T3 | UI: Random in the type control, the Random slot surface, six-slot layout, Simple view deleted, plus screenshots and a browser check. | Sonnet |
| M3-T4 | Gate: `core:product:determinism`, `core:product:sequencer-lane-count-guards`, the M1 statistics fixture, `core:product:ci`, and a search for the deleted fields. | Haiku runs it; main session triages |
