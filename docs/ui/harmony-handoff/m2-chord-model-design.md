# M2 technical design: chord model and printer repair

> Implementation design for milestone M2 of the [implementation goal](implementation-goal.md), 25 November 2026. Behaviour is fixed by the [Chords section](../harmony-random-brain-design.md#chords) and the [players and printing scope](kessho-players-and-printing-scope.md); this document decides how the code changes. Line references are from the 25 November tree and will drift.

## Starting point (what exists today)

| Concern | Today | Where |
| --- | --- | --- |
| Authored chord value | `SharedHarmonyChord` (intent, exact notes and seven bookkeeping fields) inside eight `HarmonyChordSlot`s, mirrored to A/B banks | `src/audio/harmony/harmonyTypes.ts:96–137`; state keys `src/ui/state.ts:675–677` |
| Native chord bank | `harmony_slot_note_count[8]` and `harmony_slot_midi[64]`. The snapshot fills them from exact notes, while the `HARMONY_SLOT_SET` event (35) rebuilds them from intent; the two writers disagree. | `ProductArrangementState.h:34–35`; `KesshoProductEvents.cpp:61, 130–160, 1322–1354` |
| Progression | 64 events: `source` (auto or slot), `slot_id`, `duration_unit` and `duration_value`. A slot event reads the native bank. | `ProductHarmonyState.h:63–71`; `HarmonyEngine.cpp:402–425` |
| Legacy progression | `progression_pattern[8]`. TS writes slot IDs into it, but native reads them as scale degrees, so the field is effectively dead. | `ProductHarmonyState.h:48`; `coreProductSnapshot.ts:1015` |
| Play chord sequencer | Resolved entirely in TS into per-step `play_note_overrides[64][32]` `{midi, offset_ms, velocity, harmony_slot_id}`; no native config | `src/audio/productPlaySequencer.ts`; `ProductSequencerState.h:86–87`; `ProductSequencerStepOverrideEvents.ts` |
| Step content | Each variation has 32 trigger-indexed `steps[]` with `mode` (empty, single, chord or arp), `follow_harmony` and up to 32 `{midi_note offset, velocity, gate_beats}` | `KesshoProductSequencerVariations.h:22–60` |
| Pitch lane | Sublane field 4 (`midi_notes[32]`, with its own length and direction). Native knows only two pitch bindings, Hit (0) and Step (1). `linked` is emulated in the UI. | `SequencerEventBuffer.cpp:242–287`; `ProductSequencerPitchConstants.h` |
| Printer | `autoPrintSynthSequenceVariation` fits captured notes onto trigger steps. It has the four confirmed defects. It also keeps velocity only for chord steps; single-note steps are written with velocity 1 (to verify). | `src/ui/sequencer/synthSequenceVariations.ts:345–736`; encoder `synthSequenceVariationEncoder.ts:314–383` |
| Generated capture | `useRecordedNoteCapture` is live. `useGeneratedSequenceCapture` (638 lines) has no app caller. | `src/ui/sequencer/` |

## Decisions

### D1 · One `Chord` value, two representations
TypeScript type, exactly as specified:

```ts
type Chord = { behavior: 'follow' | 'fixed'; degree; quality; extensions; voicing: { inversion; spread; register; bass }; notes: ChordNote[] };
type ChordNote = { midi; velocity?; offset?; gate?; destination? };
```

Native mirror, in the public header `KesshoProductChord.h` shared by every place that stores a chord. A zero-initialised intent is a Follow tonic triad in root position.

```c
typedef struct KesshoProductChordNote { float midi; float velocity; float gate_beats; float offset_beats; uint32_t destination_source_id; } // 20 bytes; destination 0 = inherit
typedef struct KesshoProductChordIntent { uint32_t behavior; int32_t degree; uint32_t quality; uint32_t extensions; int32_t inversion; float spread; int32_t register_octave; uint32_t bass_mode; uint32_t bass_pitch_class; } // 36 bytes
```

- **Quality:** `diatonic` (stack scale thirds from the degree), major, minor, diminished, augmented, sus2 or sus4.
- **Extensions:** a bit mask of 6, 7, 9, 11 and 13, plus a dominant flag that forces a flat seventh. Diatonic extensions stay in the scale.
- **Bass:** none (the lowest voice is the bass), root, or a chosen pitch class. The bass note sits below the voicing.

- **Fixed chords** store absolute MIDI notes. The Pitch lane still transposes them, in semitones.
- **Follow chords** store intent. Their `notes` are a cache for display only; native ignores them at playback.
- **No other fields.** Recognition labels, captured context, mismatch flags and the `Auto` behaviour are not represented anywhere.

### D2 · Notes lane = a cell table with its own traversal
Today, step content is indexed by trigger step. In M2 the variation's `steps[32]` become `cells[32]` (`KesshoProductSequencerNotesCell`). They are traversed as a tenth sublane (`KESSHO_PRODUCT_SEQUENCER_VARIATION_NOTES_SUBLANE` = 9): `sublane_steps`, `sublane_directions` and bit 9 of `sublane_follow_trigger_hits_mask` give the Notes lane its length, direction and Advance, through the same position rule as every other sublane.

Each cell has a `kind`:

| Kind | Plays | Notes field means |
| --- | --- | --- |
| `REST` | nothing | unused |
| `HARMONY` | the part's harmony pitch (`resolveHarmonyMidi`) plus each note's interval: today's `follow_harmony` and Semitones-mode steps | semitone intervals, −48..48 |
| `FIXED` | exactly its notes | absolute MIDI, 0..127 |
| `FOLLOW` | `resolveChord(intent)` against the harmony frame | display cache, ignored |

- **Transposition:** the Pitch lane transposes every kind in semitones. For `FIXED` and `FOLLOW` it is the only base.
- **No root bypass:** `pitch_mode` and `pitch_root` leave the native payload. The Notes-mode bypass is gone because `FIXED` notes are already absolute.
- **Articulation:** a cell's `articulation` is `CHORD` or `ARP` and keeps the existing ARP fields. Strum is added with its renderer, not before.
- **Notes per cell:** a cell holds up to 32 `KesshoProductChordNote`, so a printed cell keeps dense attacks as offsets. Authored chords, progression events and the Palette hold at most `KESSHO_PRODUCT_CHORD_MAX_NOTES` = 8.
- **Not played yet:** T2 rejects non-zero `offset_beats` and `destination_source_id` in validation. T6 adds playback for them together with the printer that writes them.
- **TS model unchanged in T2:** the TS encoder maps today's `stepMetadata` onto cells. A Notes-mode step without harmony follow becomes `FIXED` (root + interval); any other active step becomes `HARMONY`; an inactive step becomes `REST`. The Notes lane gets length = `step_count`, direction forward and Advance = Steps, so existing variations play exactly as before. The TS `Chord` model replaces `stepMetadata` in T5.

### D3 · Pitch binding collapses into Advance
Every sublane gets one Advance setting (Hits / Steps), which is `sublane_follow_trigger_hits_mask` as it already exists.

- **Variations (T2):** `pitch_binding_mode` leaves the variation snapshot. The encoder writes bit 4 as Hits for `polyrhythmic` and `linked`, and Steps for `sequence`.
- **Lane state (M4):** removing `midi_note_binding_mode`, the `PitchBindingMode` type and the `linked` UI emulation (`SynthPage.tsx:4995–5003`) touches about 40 files, including the drum lanes. It moves to M4, which rebuilds the lane model.
- **Loading old presets (M4):** `polyrhythmic` maps to Hits, `sequence` to Steps, and `linked` to Hits with the pitch lane length set to the hit count, as the UI does today.

### D4 · Progression events hold an inline chord
- `canonical_progression_slot_id[64]` becomes `KesshoProductChordIntent progression_chord[64]` plus `KesshoProductChordNote progression_notes[64][8]` and a note count.
- An `auto` event keeps today's engine-chooses path.
- A `chord` event resolves through D5.
- Delete the legacy `progression_pattern[8]` path (`HarmonyEngine.cpp:425`), `cached_recipe_ids` taken from slot IDs, and the TS fill at `coreProductSnapshot.ts:1015`.

### D5 · One native resolver
Extract a pure function `resolveChord(intent, notes, frame, previous) → notes[]` into a new `music/ChordResolver.{h,cpp}`.

- **Built from:** `writeHarmonyPoolFromIntent` (`KesshoProductEvents.cpp:61`) and the voice-leading cache in `ProductHarmonyAuthorityState.h`.
- **Inputs:** `frame` is the effective harmony frame (Home, key drift, L4 route); `previous` enables Smooth when it's on.
- **Fixed chords** return their notes unchanged.
- **Callers:** Notes-lane playback, progression events and (in M6) the live layer.
- **No TS copy:** the UI previews resolved notes through a debug or projection read, not a TypeScript reimplementation. The TS `resolveChord` in the prototype is not ported.

### D6 · Palette is TS-only state
- **Storage:** `harmonyPalette: Chord[]` (max 16) in state and presets. Never sent to native.
- **Use:** placing a palette chord copies it into a cell or progression event.

### D7 · Printer writes Fixed chords into a chosen variation
Captured notes become cells in the chosen variation, with Notes advance = Steps and length = step count. Each cell is a Fixed chord whose notes carry `velocity`, `offset_beats`, `gate_beats` and `destination_source_id`. This fixes the four confirmed defects:

1. **Destination kept:** each note keeps its sound destination.
2. **Dense attacks fit:** several attacks in one cell are stored as offsets.
3. **Lanes untouched:** Morph and Distance are left alone.
4. **One variation written:** only the target variation is replaced, after a revision check.

It also fixes single-note velocity. Fixed-window capture becomes a policy beside rolling capture, and Random producer taps join the native generated-capture ring.

### D8 · Persistence: new keys, no chord decoders
- **New keys:** `harmonyProgression` with inline chords (version 2), `harmonyPalette`, and the Notes-lane cells inside `synthSequenceVariations` (format version bump).
- **Old chord keys are ignored on load:** `harmonyChordSlots*`, `harmonyChordSequence*`, `chordProgression*`, `synthPlayConfigs`, legacy arp and chord lane keys, and slot-sourced progression events. They are also dropped on save, with no decoders.
- **Pitch binding:** this is not a chord field, so the D3 mapping is applied when old variations load.

## Deletions (in the same PR)

**TypeScript:**
- **Chord types:** `SharedHarmonyChord`, `HarmonyChordSlot`, `SharedHarmonyChordSlot`, `LegacyHarmonyChordSlotInput`, `HarmonySequenceStep`, the `HarmonyPlaybackBehavior` / `Auto` paths.
- **Bank management:** `harmonyBankAnalysis.ts`; `makeUniqueHarmonySlot`, `applyHarmonySeqChoiceReferences` and the Manage Pool parts of `harmonyOverviewModel.ts` / `HarmonyOverviewSurface.tsx`; `HarmonySlotStrip.tsx`.
- **Draft and capture:** `harmonyDraftChord.ts` and `harmonyDraftHelpers.ts` (draft parts); `useHarmonyChordCapture.ts`; `RecognitionResolution.tsx`.
- **Play chord sequencer:** `productPlaySequencer.ts` chord mode (ARP moves to lane articulation); `src/ui/synth/chord/*`; the `synthPlayConfigs` keys and the play-config plumbing in `useSynthPlayConfigRuntime.ts`, `usePresetSequencerRestore.ts` and the preset codecs; play-note overrides in `ProductSequencerStepOverrideEvents.ts`.
- **Unused capture:** `useGeneratedSequenceCapture.ts` and its static check in `check-kessho-product-running-sequencer-live-updates.mjs`, once coverage moves to the shared path.

**Native:**
- **Chord bank:** `harmony_slot_*` arrays and their snapshot fields; events `HARMONY_SLOT_SET`, `HARMONY_SLOT_TRIGGER` and `HARMONY_SLOT_CLEAR` (35–37), regenerated through `core:product:generate`.
- **Slot-driven code:** `syncHarmonySlotAuthorityRow`, `clearHarmonySlotAuthorityRow`, `resolveProductHarmonySlotNote`, `productHarmonySlotHasPool`, and `slot_playback_behavior`.
- **Play overrides:** `play_note_overrides` and `play_note_voice_masks`.
- **Legacy progression:** `progression_pattern`.

**Tests:** rewrite or delete those covering removed paths (`seqChordState.test.ts`, `harmonyOverviewModel.test.ts`, `harmonyDraftChord.test.ts`, the slot cases in `ProductHarmonyTests.cpp` and `ProductSequencerTests.cpp`, `productChordNativeEventAuthority.test.ts`), and add tests for D1–D7.

## Task breakdown

These are stacked commits on one M2 branch, reviewed in order. **Agent** is the suggested delegate; every task is reviewed in the main session before the next starts.

| # | Task | Depends on | Agent |
| --- | --- | --- | --- |
| T1 | Native chord types and resolver. Add `KesshoProductChord.h` and `music/ChordResolver.{h,cpp}`, extracted from `writeHarmonyPoolFromIntent`, with unit tests (`ProductChordResolverTests.cpp`) covering Fixed passthrough, Follow resolution in several keys and scales, inversion and spread, and the Smooth common-tone case (Cmaj7 → Am7 keeps three notes). No callers changed yet. | M0 landed | Sonnet |
| T2 | Variation payload: steps become the Notes cell table (D2) and variation pitch binding becomes Advance (D3). Covers the native struct, validation, playback indexing, the TS encoder mapping and the schema version. Existing variations play exactly as before. | T1 | Sonnet; main session designs the struct diff |
| T3 | Inline progression chords (D4) in native and TS. Delete the legacy progression and the slot-sourced path. | T1 | Sonnet |
| T4 | Delete the chord bank and slot events (native and TS), and switch every reader to the resolver or the cells. | T2, T3 | Sonnet; main session reviews the deletion list against `git grep` |
| T5 | TS Chord model and state: `Chord` type, `harmonyPalette`, persistence keys (D6, D8), and dropping old keys on load. | T2, T3 | Haiku for keys and tests, Sonnet for the model |
| T6 | Printer repair (D7) and the fixed-window capture policy; Random producer taps into the generated-capture ring; delete `useGeneratedSequenceCapture`. | T2 | Sonnet |
| T7 | UI. Covers the Notes editor (Follow/Fixed, Harmony, Rest, articulation override, Copy/Place, Undo); the Notes-lane settings (length, direction, Advance, articulation); and Palette placement. Delete `src/ui/synth/chord/*`, Draft/Capture and the slot strip. Uses Kessho tokens and the "Avoid generic UI patterns" rules. | T5 | Sonnet; main session reviews screenshots against the M1 baselines |
| T8 | Gate run: `core:product:ci`, `core:product:harmony`, `test:generated-sequencer-capture`, `ProductSequencerTests`, `ProductHarmonyTests`, `core:product:abi`, `core:product:schema`, `core:product:legacy-boundary`, `core:product:no-temporary-runtime-compat`, `test:m1-arrangement-statistics`; then `git grep` for every deleted symbol. | T1–T7 | Haiku runs it; main session triages failures |

## Review checklist per task

- **Contracts:** native struct sizes are mirrored in the TS encoder, and the `static_assert`s and `core:product:abi` agree.
- **Audio thread:** no allocation or sorting in the render path; the resolver runs per event with bounded loops.
- **Deletions:** every deleted symbol is gone from `src/`, `cpp/` and `scripts/`, except decoders explicitly kept by D8 (the pitch binding mapping only).
- **Fixtures:** the M1 statistics fixture still passes (M2 must not change the generators).
- **UI tasks:** screenshots at 390 and 1280 px, compared with `m1-baselines/`.
