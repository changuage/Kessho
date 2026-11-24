# Kessho — players and printing

> Companion implementation scope for recording and printing. Findings and test counts below describe the dated review. Recheck each open issue against the current implementation before changing it. [Handoff and precedence](README.md).

Design and implementation scope. Product direction updated 5 November 2026; printer findings below were reviewed 15 October 2026. No application changes made.

The accepted contract for Random defaults, circle-of-fifths preset transitions, key drift and Brain is [Harmony, Random and Brain](../harmony-random-brain-design.md). It takes precedence over earlier interaction studies and simplified prototype algorithms.

## Product decision

Treat Steps, Random, Walker and Orbit as peer ways of playing a part. Random has Notes and Chords modes with independently retained settings; two slots can run both modes simultaneously. Each generator can play indefinitely without printing. Print captures a finite performance into editable Steps.

Harmony remains the global composer: key, scale, progression, tension and harmonic rate. Random / Chords uses the existing Harmony-triggered chord renderer, including long wave timing, voice allocation and envelope fitting. Random / Notes uses the existing random-timing generator. These are the defaults for new slots as well as migrated presets; no legacy mode is required. Preserve parameter walk, moving ranges and modulation metadata. Brain remains a live transformation applied downstream of authored/generated notes. It has no recording lane in this scope.

Preserve the four existing sequencer slots and their independent sublanes. The current arrangement-level Chords and Random Notes producers become peers in the common slot model, retaining at least six simultaneous processes. Four parts may be shown initially with the others available on expansion. A preset using both generators loads two active Random slots with their original sounds and settings. Implementing their common slot representation requires a data/runtime migration; the printer repair can proceed independently while the existing algorithms remain authoritative.

Euclidean rhythm remains a way to generate the Steps trigger pattern. A hand-played keyboard is always available for monitoring, entry, and recording; it is not another mutually exclusive player type.

## Interface

One selected player fills the Synth workspace. A shared header exposes sound destination, player identity, enable/mute, Brain link, and Print. Only the selected player's controls appear.

Every slider uses [Kessho's existing shared slider architecture](../harmony-random-brain-design.md#all-sliders-use-the-existing-shared-architecture), including compact inspectors and single-only controls. Preserve shared Mod A/B assignments, ranges, capability restrictions, runtime indicators and preset metadata. Sequencer-content controls keep their existing ownership through the appropriate shared adapter; visual simplification must not introduce a second control or modulation system.

| Player | Main surface | Secondary controls |
| --- | --- | --- |
| Steps | Existing trigger, note/chord, and enabled sublanes | Probability, direction, conditions, lengths |
| Random / Chords | Voice-entry timing, voice count, wave timing, `Timing · Harmony` | Register, masks/split routing, envelope fitting, parameter motion; link to global voicing and harmonic rate |
| Random / Notes | Note attacks distributed along a phrase; density and register/range | Existing clock/sync policy, tension relationship, source hold and parameter motion |
| Walker | Anchor, movement path, and held gesture | Layers, offsets, boundaries, individual sound destinations |
| Orbit | Existing orbital field and crossings | Note/line properties, probability, timing and routing |

Global's Generate drawer controls harmonic decisions. Random / Chords follows Harmony ticks by default; Random / Notes preserves its existing clock relationship. A compact context indicator connects both pages without duplicating settings.

Global keeps one twelve-key circle of fifths for free key drift and the L4 route between presets. The chord progression appears in a separate compact strip. At a held blend, including 50 A / 50 B, enabled Harmony key drift can continue and Brain remains available. During an active Journey transition, Journey owns the key route, additional key-drift advances are suspended, and Brain is unavailable. Pause/dwell/stop restore Brain availability without reactivating an old override. Retain the stored drift settings throughout; follow the linked contract for the pause/resume handoff.

Clicking Print opens a short inline strip:

`Print notes · 2 bars · into B · [Capture]`

Default to the selected part's available variation and hand that same part from its generator to Steps. Another destination is a detail option. Preserve existing seconds-based timing and expose an appropriate duration unit for that clock; the two-bar example is not a bars-only requirement.

Capture begins at the next musical boundary appropriate to the selected clock: the next bar for beat-based capture or the next phrase for seconds-based phrase capture. A progress line occupies the same strip. Completion produces a frozen take with `Use steps`, `Again`, and `Discard`. Destination conflicts and fit limits appear here only when relevant. Advanced capture timing can expose Immediate/First note later without cluttering the default.

Use steps commits the selected destination and changes playback ownership at one audio boundary. The source generator's settings remain saved. Only the printed source is stopped when it is being replaced; unrelated players continue. A menu command can instead keep the generator running and retain the printed take without activating it. Preview and activation must not accidentally double the same part.

## Findings in the current printer

The current path is already partly unified: SynthPage uses useRecordedNoteCapture for keyboard, Walker, and Orbit; it then runs autoPrintSynthSequenceVariation and commits a native variation bank. This is the path to retain.

### Confirmed by direct execution of the converter

1. **Sound destinations disappear.** Changing sourceId on the captured notes produces identical printed banks. Walker layers and Orbit notes can address different sounds, but the printed note payload has no per-note destination and playback uses the destination lane's source.
2. **Dense independent attacks can fail despite a nearly empty phrase.** Three separate attacks at beats 0.20, 0.21, and 0.22 in a four-beat phrase are rejected with a grid collision. The current fitter allows one attack per cell and only adjacent anchors; increasing resolution up to its maximum cannot represent every cluster.
3. **Existing Morph and Distance content is cleared.** The printer explicitly nulls these overrides, disables their sublanes, and changes linked to false. This is not a neutral operation on an existing lane.
4. **Grouped onsets are flattened.** A chord captured with different per-note onset times becomes intervals with velocity and duration only. The native chord playback branch launches these notes on the same parent trigger.

### Confirmed by tracing callers and runtime code

5. **Chords and Random are absent from the active capture source contract.** The current UI maps Euclid to keyboard capture. Native capture hooks are present for Walker and Orbit; the arrangement Chords/Random emitters are outside that path. The existence of a native Euclid capture enum does not mean all those producers are connected.
6. **Keep replaces the variation bank.** The fitter creates A onward, and the caller installs that whole bank. The selected edit variation is not an explicit print destination. Other variations in that bank are not merged into the result.
7. **Duration describes a rolling retention window, not a one-shot print.** The worklet explicitly continues until Finish/Stop. The scratch buffer sweeps old phase positions. Clicking Stop therefore determines which partial combination of loop passes remains. This is useful for replacement recording, but is the wrong default for “print the next two bars.”
8. **Several old capture components remain alongside the new path.** useGeneratedSequenceCapture has no production caller found in this review, but its legacy commit bridge remains exposed. Remove only after checking runtime, test, and migration consumers.

Additional parity check required: chord per-note velocity and the first voice's velocity are both represented in the printed output (the latter as Expression). Native playback applies expression scaling. Verify and define a single effective-velocity contract before claiming audible equivalence.

These findings do not identify a single reproduced end-to-end UI crash. They identify concrete data losses, unsupported producers, and capture/commit semantics that can make a valid musical take print incorrectly or fail.

## One capture and commit pipeline

Reuse:

- Native generated-event ring, sample timestamps, attack identities, and overflow reporting.
- RecordedNoteCaptureBatch with session token, transport watermark, final event id, and error handling.
- RecordedNoteClip and the existing per-note pitch/onset/duration/velocity/source metadata.
- The existing session lifecycle and capture hook, with a fixed-window policy added to the current rolling policy.
- The variation fitter/encoder, native pending-bank handoff, and acknowledgement checks.

Do not create a second recorder for generators, a second sequencer for printed clips, or a general plugin/factory framework.

### Inputs

Live notes and generated notes converge on the same canonical capture event. Normalize source identity explicitly: keyboard/MIDI/shortcut gesture versus a specific generated player. Do not overload `keyboard` to mean Step output, or a sound source id to mean a sequencer id.

Extend the native capture tap to Chords, Random, and optional Step-output printing. Tap accepted scheduled note events with their actual timestamps and destinations; do not reconstruct a performance from UI playheads, visual telemetry, settings, or a fresh random seed. Preserve the existing producer algorithms.

Capture before Brain's temporary transformation. Resolve the generator's harmony into concrete written pitches at capture time. Printed steps then remain exact authored notes unless the user explicitly changes their harmony behavior. Preserve the part's separate Brain link so playback can respond live without transposing the recorded notes twice. Do not add Brain automation or implicit Brain baking.

### Capture lifetime

1. Arm a source and a destination, storing both identities and the destination revision. Determine a fixed musical start and end from the audio transport.
2. Acknowledge the start boundary before advertising Recording. All producers use the same beat/sample mapping; UI arrival time must not define note placement.
3. Record onsets in `[start, end)`. Include currently held notes at the start when the selected source exposes them, with their remaining gate, so a sustained chord does not become an empty opening bar. Preserve known tails crossing the end. Live-held notes can close at the explicit recording boundary.
4. Stop intake at the audio boundary. Drain the final events and wait for the final watermark. UI visibility or a delayed batch must not decide completion.
5. Freeze the take. Further generator changes cannot alter it. Overflow or invalid data leaves it available for inspection/retry and prevents a misleading successful print.

Use a fixed window for Print. Keep rolling replacement as a separate live-recording policy. Reuse storage and event ingestion without forcing the same loop-retention semantics on both.

### Fitting into the existing step system

Keep trigger, pitch, expression, nudge, and the other subsequencers. The grid is the editing structure; it must not erase valid performance timing.

Extend the existing bounded per-step note list to preserve per-note attack offsets and destination routing. Preserve attack/group identity as editing metadata: one chord gesture can contain several notes, and a cell can contain several independent attacks without falsely naming them one chord. Use the existing parent nudge for the first attack, with subsequent note offsets relative to it. The native scheduler already iterates bounded per-step note lists; extend that route rather than adding another playback engine.

This requires a versioned native note-payload change, matching TypeScript encoding, validation, persistence defaults, and native playback. Old notes default to zero offset and inherit-lane destination. Preserve pad voice identity where the original routing requires it. Retain source limits and reject unrepresentable routes explicitly.

Define velocity once: store effective per-note velocity and use neutral Expression for faithful printing, then allow the user to reshape Expression afterward. Do not multiply the captured velocity twice. Preserve per-note gates and human timing by default. Optional quantization edits the frozen take explicitly.

### Destination and transaction

The fitter receives the selected destination and its existing bank, not only a base lane. Respect the bank's shared clock division and available A–D space. A take that needs multiple variations must show the required destinations. Never silently change other variations' clock or overwrite occupied ones to make it fit.

Default to an available destination that can represent the take. If the chosen destination cannot fit it, keep the take and offer another empty destination or an explicit replacement. Keep unrelated variations and sublanes intact. Starting from an empty destination avoids reapplying existing pitch/expression modulation to a baked performance.

Preflight all note counts, offsets, gates, pitch spans, source routes, and required variation space before sending the bank. Recheck the destination revision at commit so edits made during capture are not overwritten.

Commit bank content, playback mode/selection, and the replaced producer's activation state at one audio boundary. The UI must say success only after the matching acknowledgement. Preserve the take on rejection or timeout; a retry must not create a duplicate commit. Undo restores the prior destination and player activation state.

## CPU and code size

- Capture into bounded storage on the audio side; no allocations, serialization, sorting, or chord recognition in the audio callback.
- Fit and encode only when the take is frozen. Never send a whole bank on every incoming note.
- Coalesce UI previews; incoming batches and keyboard events should not force a full SynthPage render for every note.
- Keep capture delivery independent of visual telemetry demand and page visibility.
- Reuse the existing ring and note lists. Add only fields required for musical fidelity and routing.
- Remove the uncalled old generated recorder and unused bridge code after coverage transfers to the shared path. Do not remove migrations or persistence readers merely because the old UI is gone.

## Implementation order and acceptance

1. **Repair the shared printer:** destination-aware commit; retain routing/timing/velocity; explicit capacity failures; safe source-to-Steps handoff. This benefits live recording, Walker, and Orbit immediately.
2. **Add fixed-window capture and missing producers:** Chords/Random/Step adapters; audio-owned start/end and final drain; shared live input integration. Keep existing generation algorithms.
3. **Expose the common player UI:** one selected surface, one Print strip, retained generator settings, and reversible Use steps.

Acceptance must compare captured and replayed event streams, not just whether a bank serializes:

- Single notes alternating with chords, manual rolled chords, and shortcut chords.
- Walker unison layers, delayed layers, and different sound destinations.
- Orbit simultaneous crossings and tightly clustered independent crossings.
- Random timing/probability printed from the performed pass, without rerolling on playback.
- Chords with voice spread, sustain, and pad splitting.
- Silent passages, note on exactly at start/end, tails, tempo changes, delayed batches, and hidden UI.
- Printing to B preserves A/C/D; a take needing extra variations never silently overwrites them.
- Brain is applied once at playback and is not recorded as automation.
- Overflow, failed acknowledgement, retry, stale revision, cancellation, and undo retain the original source and take.
- CPU/load measurements on actual browser and native playback, including physical input latency.

29 existing focused capture/fitting/encoding tests passed during this review. Additional direct converter probes reproduced routing loss, cleared sublanes, dense-attack rejection, and flattened grouped onset data. No device audio or complete UI print session was measured.

## Code anchors

- [Current recorder integration and Print](../../../src/ui/synth/SynthPage.tsx) — also lines 5639 and 6548.
- `src/ui/sequencer/useRecordedNoteCapture.ts` — shared lifecycle, lines 369 and 479 onward.
- `src/ui/sequencer/synthSequenceVariations.ts` — configurePrintedLane, groupCaptureNotes, makeStepMetadata, autoPrintSynthSequenceVariation, SynthSequenceCaptureScratch.
- `src/audio/product/synthSequenceVariationEncoder.ts` — fixed native step-note encoding, line 320 onward.
- `public/worklets/kessho-core-product.worklet.js` — sample/beat capture conversion, lines 918–1050; fixed duration currently does not stop recording.
- `cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp` — generated tap at 1185, Walker at 1373, Orbit at 2008, per-step note playback at 2550.
- `cpp/KesshoCore/src/product/sequencer/ProductArrangementSequencer.cpp` — Chords and Random producers, lines 254 and 276.
- `cpp/KesshoCore/include/KesshoCore/KesshoProductGeneratedSequencerCapture.h` — reusable fixed event ring and source filter.
- `cpp/KesshoCore/include/KesshoCore/KesshoProductSequencerVariations.h` — native payload capacities and layout.
