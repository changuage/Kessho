# Harmony Workspace UI

The workspace is a single Harmony surface with three views: Simple, Detail,
and Overview. `HarmonyWorkspace.tsx` owns view selection, context/status
display, history controls, morph read-only state, and the shared slot strip.
`HarmonyEnginePanel.tsx` consumes the projection and owns view-specific
interaction. No view owns a second chord generator or private chord bank.

## Shared context and scopes

The header always exposes Home, Track, Effective, Position, and Live scope.
During morph it announces that Harmony is read-only. Tabs use `role="tab"`,
`aria-selected`, `aria-controls`, and linked `role="tabpanel"` IDs.

The reusable `LiveChordKeyboard` uses the Journey white/black geometry across
Detail, Overview, and Seq live/draft surfaces. It has one explicit scope label:
`DRAFT`, `HARMONY TAKEOVER`, or `SEQ N LIVE`. The visible keyboard has seven
white plus five black keys and the scoped QWERTY map A–J. Touch/pointer presses
capture the pointer and release safely; QWERTY shortcuts are prevented only
while the scope is enabled and are ignored in text inputs.

The keyboard carries the existing velocity metadata (`0.85`) into
`onNoteDown`. This UI documents QWERTY and touch input only; it does not claim
an external MIDI route.

## Simple

Simple exposes root, scale, Circle-of-Fifths, tension, and automatic policy
controls against the same projection. It does not create a hidden progression
or slot generator. Adopt is shown as a distinct context action and remains
undoable; morph disables authoring and live controls.

## Detail

Detail is the Manual Voicing/Draft surface. Root/Degree, quality, extensions,
exact matrix editing, route, and Auto/Relative/Exact behavior all target one
`HarmonyDraftChord`. Capturing a draft writes the selected shared S-slot;
until Capture, the draft is not an authored slot mutation. The shared suggestion
grid supports immediate Hold/Release Play and Save S#; it does not silently
replace a slot.

## Overview

Overview is the canonical combined surface, not a second Chord Lab:

- Arrange shows only authored progression rows, up to 64 events.
- Rows display event ID, source slot/Auto label, chord name, duration, and a
  compact dot map on one min/max pitch axis shared with suggestions.
- The selected-event bar owns Add, Duplicate, Make Unique, Move Up/Down, Delete,
  Undo, Print, Latch, and Stop. Up/Down remain visible on mobile; secondary
  actions are also exposed under labelled `More actions` overflow.
- Duration edits are 1/2/4/8 bars or phrases and are local undoable edits.
- Rows have immediate pointer Play with selected/playing state and stable
  event-ID focus restoration when virtualization (>24 rows) removes/re-adds a
  row.
- Edit Notes hides structural placement actions. It shows the selected S-slot,
  use count, aligned exact-note matrix, Make Unique, Play, Undo, Return, and
  Save-only suggestions.
- Manage Pool shows lock state, use counts, and affected Harmony/Seq references.
  Empty is blocked for referenced or locked slots. Replace References requires a
  different populated target and updates slots/progression/sequence atomically.

Overview takeover keys feed the same live Harmony route as row and suggestion
Play. Exact slots bypass transformation. Relative/eligible Auto slots use the
shared smart transform and release to the current progression frame. Latch
survives view changes until Stop; morph read-only state disables takeover.

## Suggestions

Eight suggestion positions remain stable and visibly print Z/X/C/V/B/N/M/,
labels. Pointer down, touch, or the scoped shortcut starts Play immediately;
release, cancellation, button blur, and scope blur release the preview. The
selected suggestion persists after release and exposes one contextual dock:

- Arrange: Replace E#, Insert after, Save S#.
- Edit: Save S# only.
- Seq: Assign to Step # or Save S#.

The dock exposes the first empty destination when available, reuses an exact
semantic/playback match, and links to Manage Pool when the bank is full. Tiles
do not contain repeated commit controls.

## Accessibility and mobile checklist

- Use visible labels plus `aria-label`/`aria-describedby` for scopes, keys,
  suggestions, dot-map MIDI summaries, and morph read-only status.
- Keep roving tab focus on the selected/focused virtualized row by stable event
  ID, not by transient array position.
- Pointer capture is required for held keys, rows, and suggestions; cancellation
  and blur must be equivalent to Release.
- Mobile layouts retain Up/Down and expose Duplicate/Make Unique/Delete through
  labelled overflow. No interaction depends on drag or undisclosed long press.
- Runtime latch is an explicit exception: it survives view/page changes and is
  cleared only by Stop or runtime teardown.

## Persistence note

The UI reads/writes canonical progression and endpoint fields plus
`synthPlayConfigs`; legacy sequence keys remain decode-only migration inputs.
