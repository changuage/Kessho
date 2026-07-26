# Unified Harmony architecture

This document is the unified Harmony architecture contract.

## Ownership and data flow

```text
authored SliderState / preset payload
          │
          ▼
resolveHarmonyProjection()
  canonical progression + endpoint bank + effective frame
          │
          ├── HarmonyWorkspace / HarmonyEnginePanel (UI and intent)
          ├── suggestion engine + contextual action planners
  ├── TS projection (UI, preview, snapshot encoding)
  └── native Product Core (semantic/exact resolution and runtime authority)
```

React owns interaction, draft state, selection, and persistence-shaped state.
`src/audio/harmony/harmonyProjection.ts` is the shared read model for Simple,
Detail, Overview, and Seq consumers. It is a UI/preview/snapshot-encoding
projection; native Product Core owns semantic/exact resolution, live gestures,
takeover, bounded morph planning, and dispatch telemetry.

The legacy TypeScript/Web Audio engine under `src/audio/reference/webTs/` is
reference/parity infrastructure only. A normal product load does not use it as
a silent production fallback.

## Dual chord representation

Each shared slot stores both:

- semantic intent (`HarmonyIntent`: root/degree, quality, extensions, inversion,
  bass, and captured context), and
- exact `SharedHarmonyChord.exactMidiNotes` plus its captured context.

`playbackBehavior` selects execution:

| Behavior | Meaning |
| --- | --- |
| `Exact` | Trigger the stored MIDI snapshot; bypass Harmony takeover. |
| `Relative` | Resolve semantic material against the current effective frame. |
| `Auto` | Use nearby exact material when appropriate, otherwise the semantic/relative path once semantic material is eligible. |

Exact-note edits are authored slot edits. Piano/manual changes are Draft edits
until Capture/Save. A semantic mismatch is retained rather than silently
discarding either representation.

## Canonical progression and capacity

`HarmonyProgression` is the phrase-level Harmony track. Events contain a stable
ID, `auto` or `slot` source, and a `bar`/`phrase` duration with values 1, 2, 4,
or 8. The authored endpoint capacity is 64 events. The old numeric global
degree progression is no longer an independent authority.

Overview structural actions (Add, Duplicate, Make Unique, Move, Delete) are
local undoable operations. Make Unique copies the selected chord into the first
empty unlocked S-slot and redirects only that event. Manage Pool replacement is
atomic across slot contents, canonical progression, and shared Harmony/Seq
references.

## Suggestions and scopes

`createHarmonySuggestionEngine()` produces eight bounded suggestions with stable
Z/X/C/V/B/N/M/, positions, category (`safe`, `movement`, `color`, `wildcard`),
semantic intent, exact notes, and playback policy. `saveHarmonySuggestion`,
`replaceHarmonySuggestion`, `insertHarmonySuggestion`, and Seq assignment
perform explicit atomic state planning; matching semantic intent, exact notes,
and playback behavior reuses an existing slot.

Live input has one visible scope at a time (`draft`, `harmony-takeover`, or
`seq-live`). `useKeyboardScope` arbitrates QWERTY ownership by priority. The
shared `LiveChordKeyboard` releases held notes on blur, inactive/disabled
transition, scope identity change, and unmount. Callback refs prevent ordinary
React rerenders from dropping held notes. On-screen input preserves velocity
metadata (`0.85`) and source (`onscreen`/`qwerty`); this web keyboard documents
QWERTY/touch input only and does not claim an external MIDI route.

## Seq contract

Seq 1–4 consumes the same shared slots and semantic/exact policy. Draft changes
remain local until Capture. Assigning a suggestion updates the selected Seq
Play chord step and any required shared slot atomically; it does not mutate the
global Harmony progression. Seq Exact bypasses Harmony takeover; Seq Relative
and eligible Auto resolve once through the effective frame.

Seq Play persistence uses canonical `synthPlayConfigs`. Older sequence and
lane-specific keys are accepted only by decode/migration paths.

## Takeover, Print, Adopt, and morph

Overview, suggestion, and relative-keyboard Play use the native Product Core
Harmony live-layer route. Product Core performs smart semantic remapping,
preserves quality/extension intent when possible, bypasses Exact, applies the
bounded custom/null-semantic fallback, and returns to the then-current
underlying frame on Release/Stop. Progression time continues under a hold or
latch; latch survives view changes until explicit Stop.

Print uses `planHarmonyPrint` to update semantic and exact representations for
the same slot IDs as one undoable operation. Adopt is separate: it changes Home
context (`rootNote`, manual scale, and CoF position) and does not rewrite the
bank as a side effect.

At an active A/B morph midpoint, `resolveHarmonyProjection` suppresses live
layers and exposes a cached `MorphHarmonyPlan`; authoring, takeover, Print, and
Adopt are read-only until a stable endpoint. Endpoint ownership is A below 50%
and B at/above 50%. New triggers choose bounded, precomputed valid note anchors;
they do not linearly glide through chromatic cents.

## Legacy and decode-only inputs

`harmonyChordSequence`, `harmonyChordSequenceA/B`, old numeric progression, and
legacy lane-specific chord/arp keys are retained in state decoding/migration
paths only. New authored state uses `harmonyProgression`,
`harmonyProgressionA/B`, and `synthPlayConfigs`.
Seq 5 and its separate chord/arp authority are removed from the unified Harmony
contract. Do not reintroduce hidden pad banks, `slotCopy`/`slotFollow`, Role or
Transition fields, or a separate Simple chord generator.
