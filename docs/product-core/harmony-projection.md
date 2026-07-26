# Product Core Harmony projection

## Boundary

Native Product Core is the production Harmony/audio authority. React and
TypeScript prepare authored state, UI intent, decoded assets, and preview data;
they do not resolve production Harmony or synthesize an alternate audio path.

```text
SliderState / preset decode
  -> resolveHarmonyProjection()
  -> UI/preview/snapshot encoding projection
  -> native Product Core semantic/exact resolver
  -> Product Core live gesture/takeover/morph dispatcher
```

`harmonyProjection.ts` is the shared TypeScript read model for UI, preview,
reference/parity tests, endpoint display, and snapshot encoding. Native Product
Core normalizes bounded gestures, owns semantic/exact resolution, selects the
active progression event, prepares lane trigger tables, precomputes takeover
anchors outside the audio callback, and reports dispatch telemetry.

Generated schema constants currently declare:

- 8 shared slots;
- 8-note maximum voicing;
- 12 takeover anchors;
- playback behaviors `auto`, `relative`, `exact`;
- gesture scopes `detail`, `overview`, `suggestion`, `seqDraft`, `seqLive`;
- takeover targets `global`, `detail`, `overview`, `seq1`–`seq4`.

## Projection contents

The native Product Core projection contains the bounded engine context, frozen
slots, active progression event, selected live gesture, optional Overview
takeover, lane patterns, lane step counts, and per-step trigger tables. A
Product trigger reads from this projection and never searches scales,
normalizes arbitrary state, or performs unbounded voice-leading work in the
callback.

The projection is derived from canonical `HarmonyProgression` and endpoint slot
banks. `harmonyProgressionA/B` are stable morph endpoints; native Product Core
selects endpoint ownership at the morph boundary and owns the bounded
`MorphHarmonyPlan` used by new triggers without creating an editable midpoint
bank.

## Playback policy

Each shared chord retains semantic intent, exact MIDI notes, captured context,
and playback behavior:

- Exact is literal and bypasses takeover.
- Relative maps semantic material to the effective frame.
- Auto uses exact nearby and semantic/relative material after semantic
  eligibility is established.

Native Product Core applies this policy. A takeover installs a temporary
effective frame for new Harmony-following triggers while progression advancement
continues beneath it. Release and Stop expose the then-current underlying frame;
explicit latch is runtime state, not UI state.

Seq Exact and drum/exact consumers bypass Harmony takeover. Seq Relative and
eligible Auto consumers render through the effective frame once and must not be
transformed twice. Seq live playback does not mutate the global Harmony
progression or Home context.

## Runtime gestures and lifecycle

The native Product Core gesture wire is bounded and revisioned:

```ts
{ revision, scope, target, latchedPhase, exactMidiNotes, intent,
  playbackBehavior, capturedContext, expiresAtFrame }
```

The phase distinguishes held and latched playback; expiry or removal of the
gesture ends the temporary route. Host/UI release paths include pointer
cancellation, keyboard blur, scope/view changes, runtime teardown, and unmount.
The shared UI keyboard preserves the existing velocity metadata and source tag.
The web keyboard documents QWERTY and touch input only; it does not claim an
external MIDI route.

## Product Core state authority

Product snapshot encoding and generated schema bindings carry canonical
`harmonyProgression`, endpoint banks, shared slots, and `synthPlayConfigs` into
Product Core. Native Product Core resolves trigger events from bounded cached
tables, owns live gesture/takeover state, owns the bounded morph plan, and emits
dispatch telemetry. The TypeScript reference engine is for explicit
parity/reference work only.

## Legacy/decode-only systems

Old `harmonyChordSequence*` fields remain accepted by state decode/migration so
older presets can be read, but new authored writes use canonical progression
fields and `synthPlayConfigs`. The old numeric global progression, hidden Seq 5
chord/arp authority, separate Simple generator, and slot-copy/follow placement
are not Product Core Harmony authorities. Do not add new runtime dependencies on
those systems.

## Verification targets

Before changing this boundary, verify:

1. Generated schema and C++ ABI hashes agree.
2. Product authority tests cover bounded gesture normalization, takeover anchor
   preparation, cached trigger identity, Exact bypass, and Seq non-mutation.
3. Snapshot/preset round trips preserve both semantic and exact chord material.
4. Morph midpoint is read-only and does not dispatch a live takeover.
5. Host dispatch latency remains within the supported target without allocating
   in the audio callback.
