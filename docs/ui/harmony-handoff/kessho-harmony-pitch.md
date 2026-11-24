# KESSHO / HARMONY

> Original client pitch and demo narrative. Use for design rationale. The accepted design governs feature scope, live Brain ownership, and the sequencer layout. [Handoff and precedence](README.md).
## Move the music.

Design direction and product rescope · 13 October 2026

**One gesture changes the harmony. Every part keeps its character.**

Kessho should feel like an ensemble under your fingertips. Play a new harmonic destination and the linked instruments move with you: the bass finds its foundation, the melody keeps its contour, the arpeggio finds its new notes, and the pad settles into a sympathetic voicing. Release to return, latch to stay, record to make a progression.

This is the central proposal: make Harmony a persistent performance instrument, with a single chord editor shared by the global phrase and synth steps. Put musical decisions on the surface and make storage, inference and routing details secondary.

This is a proposed experience, not implemented functionality or a claim that every musical mapping has been validated. The accompanying interactive study demonstrates visual interactions without audio. No application code was changed.

## 1. The opportunity in the current product

The source already contains valuable foundations: shared semantic and exact chord representations, a canonical progression, a native live harmony layer, chord recognition, suggestions, undo, and unified slots consumed by the synth sequencers. Replacing these wholesale would add risk without improving the musician's first minute.

The experience asks users to understand too much of that machinery:

| Observed in the current source | Consequence for the musician | Proposed decision |
| --- | --- | --- |
| Simple, Detail and Overview, with further Arrange/Edit/Manage modes | A musical action first requires finding the correct surface | One Harmony surface; open an editor at the selected object |
| Home, Track, Effective, Position, Live scope, Engine and tonal advice in the header | Competing answers to “what am I hearing?” | Show Home, Now and the source of Now; show Next only while queued |
| Draft/Live switching, Capture, saved slots, route selection and playback policies | Playing, auditioning and committing have different mental models | Perform on pads; edit in one transactional editor; record explicitly |
| Synth chord choices refer to the shared S1–S8 bank | Editing a step can imply editing shared musical material | Edit this occurrence by default; edit linked uses only explicitly |
| Separate timing and performance controls appear around chord choices, triggers and live input | It is difficult to predict when a harmonic change will happen | One visible global launch timing; local steps inherit the sequencer clock |
| Harmony becomes read-only during an active morph midpoint | Controls can become unavailable during performance | Keep the current restriction visible in the first release; do not promise simultaneous morph and takeover |

The diagnosis is an interaction and ownership problem, not a shortage of chord features. These observations are from source inspection; the running Kessho interface and audio were not tested in this review. The July baseline document describes earlier implementation history and is not treated as the current UI specification.

## 2. What the references teach us

Teenage Engineering's OP-XY documents a dedicated Brain track, automatic or manual key selection, and explicit participation of instrument tracks. The transferable idea is a small, playable control surface over a whole arrangement. It does not establish the internal mapping algorithm we should use. [OP-XY auxiliary guide](https://teenage.engineering/guides/op-xy/auxiliary)

OP-Z documents note analysis of its melodic tracks, keyboard transposition, track selection and sequencing of chords on its master track. Its lesson is that harmony can itself be sequenced and performed. [OP-Z master guide](https://teenage.engineering/guides/op-z/master)

Elektron's Digitone II offers step-level parameter locks and transpose controls at pattern, track and trig levels. Borrow the direct connection between selecting a step and changing its exception, with visible software equivalents for hardware shortcuts. [Digitone II manual](https://www.elektron.se/wp-content/uploads/2025/07/Digitone-2-User-Manual_ENG_OS1.10C_250708.pdf)

FabFilter puts interactive visual feedback at the center, exposing relevant controls around the selected object. Borrow that hierarchy: show the musical result and reveal precise editing where the user is working. [Pro-Q interface overview](https://www.fabfilter.com/help/pro-q/using/overview)

Scaler demonstrates the value of directly arranging chord objects and offering harmonic suggestions. Borrow those focused interactions, while keeping Kessho's first surface compact. [Scaler 3](https://scalermusic.com/products/scaler-3/)

These are design references, not endorsements or evidence of usability superiority. “Brain-like” describes the inspiration; the product-facing name remains **Harmony**.

## 3. The new mental model

**Home** is the composition's reference key and scale. **Now** is the harmony currently controlling linked parts. **Follow** determines which parts respond. That is the model a new user needs.

The global Harmony strip remains visible on Global and Synth. It shows `Home C major → Now Dm7`, a small source label such as `Live` or `Phrase`, launch timing, Latch and Return. A queued change adds `Next Fmaj7 · next bar`. Diagnostics and confidence percentages are removed from the primary view.

The expanded global surface contains three things: playable chord pads, the linked-part list and the Harmony phrase. Selecting a chord opens the shared editor in place. Circle of Fifths, drift and generative options move into a contextual Explore drawer.

On smaller screens, keep Home/Now and Return visible, wrap the pads into two rows, and show the editor as a bottom sheet. Use the same names, commands and ownership rules everywhere.

## 4. A performance that takes seconds

1. Start an existing pattern. Linked tonal parts are already identified.
2. Press a chord pad or play the Harmony input. A single key chooses a diatonic destination from Home; a played chord supplies an explicit destination.
3. Linked parts respond at the selected boundary. The screen shows Now and which parts followed.
4. With Latch off, release returns to the underlying phrase at its current position. With Latch on, the destination remains until another gesture or Return.
5. Record captures the accepted changes and their timing into the one global Harmony phrase. Pressing Record again finishes one undoable take.

The phrase continues beneath live playing. Return never jumps back to a stale chord from the start of the gesture. Returning from a queued but unlaunched gesture cancels that gesture. New destinations replace an earlier pending destination instead of building a hidden queue. With transport stopped, audition is immediate.

Default launch timing is Next beat; alternatives are Now and Next bar. Momentary performance should use Now by default, with any quantized momentary gesture canceled if released before it launches. Latch remains clearly visible across page changes. Pointer cancel, loss of input focus and device disconnect release momentary notes. Transport Stop clears live takeover and queued changes; its handling of sustained notes must follow the existing transport contract and be verified.

## 5. Define “smart” musically

Scale transposition, chord reharmonization and changing the home key are separate operations. Do not hide all three behind an unexplained transpose knob.

The primary action is **Smart**: choose a harmonic destination within the declared context. A C-major phrase `C–E–G–B` moving from I to ii becomes `D–F–A–C`. A simple two-semitone shift would produce `D–F♯–A–C♯`; that is available under the secondary **Semitones** command and must be labelled in semitones.

Use the existing sequence output type to determine musical response:

| Material | Proposed response |
| --- | --- |
| Melody / authored notes | Retain rhythm, register and scale-step contour; map structural notes to the destination context. Preserve intentional chromatic approaches where possible rather than flattening every note onto a chord tone |
| Chord output | Resolve the destination chord, respecting voice limit and range; use minimal voice movement with deterministic tie-breaking |
| Arpeggio output | Keep rhythm and ordering while replacing the harmonic note pool |
| Explicit root-based bass | Follow the destination root or specified slash bass in its existing range |
| Fixed notes / unlinked parts | Keep their authored pitches; show the Fixed state where the exception lives |

New melodic material can follow by default. Percussion and untuned audio remain excluded by default. Existing presets preserve their actual behavior on import; do not silently turn on Follow for them.

Notes transform exactly once from their authored reference, never cumulatively from the previous transformed result. A global change does not rewrite the source sequence. Custom chords preserve their supplied notes and spelling; if their intent cannot be recognized, show `Custom · fixed notes` and offer an explicit conversion. Do not present an uncertain analysis as certainty.

For borrowed chords, explicit chord tones take priority while non-chord notes follow a defined contextual mapping. Modal ambiguity, chromatic approach tones, diminished chords and unequal scale cardinalities need a musician listening study before this mapping is frozen. Until supported, an unsupported scale conversion should keep the last valid mapping and explain the limit, rather than invent a result.

Source-key detection is advisory, based on pre-transform authored note material. Analyze at phrase/edit boundaries, not continuously from the output being transformed. Show a stable proposed key, retain the user's locked Home, and require a deliberate `Use detected key` action to change it. Automatic detection is not the default authority for the first release.

At launch, new note-ons use the new harmony. Already sounding notes retain their pitch through note-off/release, avoiding unintended glides or retriggers. Common-tone retention and retrigger behavior for pads require an explicit musical test; this proposal does not promise instantaneous retuning of every held voice.

## 6. The synth sequencer becomes a rhythm instrument again

Keep existing Note / Chord / Arp output choices and the rhythm grid. Add one clearly labelled relationship: **Follow Harmony**. It is independent of audio routing and independent of a step's chord source.

In Chord mode, a trigger plays the current global chord by default. No slot assignment is needed. Hold a step and play a chord to create an exception; select the step and use `Set chord` for a visible mouse, touch and keyboard alternative. An exception appears directly on the step as a chord label. `Use global chord` clears it.

Local exceptions are reference-relative by default when the track follows Harmony. A step-level `Fixed notes` lock protects an exact voicing and wins over Follow for that step. This exception is visible, rather than hidden in an Auto policy. A following step can therefore use the current global chord or its own relative chord; that source choice is distinct from whether it transforms.

Remove the chord-choice matrix as the default sequence surface. Existing patterns with an independent chord-choice clock, non-forward flow or a different choice length cannot be collapsed losslessly into a single 16-step row. Preserve those patterns in an explicitly marked Advanced chord lane, and offer conversion only with an audible preview and retained original. New patterns use one trigger grid unless the user deliberately opens that advanced facility.

Do not create a fifth special chord sequencer or another bank per synth. One global phrase controls harmonic time; each synth owns its rhythm, articulation and explicit local exceptions.

## 7. One chord editor, three ways in

The same editor opens from a global phrase event, a synth step or a favorite pad. The header names the destination: `Phrase · event 2` or `Seq 1 · step 9`.

**Play it.** On-screen keys, computer keys and a supported external MIDI route feed the same capture transaction. Include a one-finger note-entry latch for touch and motor accessibility. MIDI input routing and note-off handling are a delivery item to verify, not an existing capability inferred from the web keyboard.

**Type it.** Enter `Dm9`, `Fmaj7/A` or `Esus4`. Show the interpreted notes before applying; preserve the last valid chord while a symbol is incomplete. Unsupported symbols get a specific explanation, not silent correction.

**Choose it.** Root, quality and optional extensions form the compact builder. The contextual inspector exposes bass, inversion, spacing and exact notes. Suggestions appear on demand as a few stable alternatives, never a permanently expanding wall of controls.

The selected chord can be auditioned without saving it. `Apply` writes the named destination as one undoable edit; Cancel restores the previous state. Drafts still exist internally but users no longer select a global Draft mode.

Favorites are shortcuts. A normal edit changes the selected occurrence. Editing the favorite itself or all linked uses is a separate, clearly labelled command showing the number of affected uses. Store editable occurrences with semantic intent and exact-note snapshots in the canonical representation; do not force every new chord through a full eight-slot bank. This is a real data-model change and belongs in the rescope, not merely a relabel of the current slot UI.

## 8. A distinctive visual language

Keep Kessho's warm charcoal, cream and sage. Replace low-contrast density with a calm typographic hierarchy: a large live chord name, legible destination labels and compact secondary controls. Clay marks a queued change, sage marks a live destination, and a filled lock plus text identifies fixed material. Meaning never relies on color alone.

The signature detail is a compact voice-motion display: note positions show how the selected part moves from its authored shape to its sounding result. It is an explanation attached to the music, with exact note names available on selection. No decorative particles or continuously running visualizer are needed here.

Show selected, queued and sounding as different states. Keep essential actions visible; hardware-style hold gestures are accelerators, with labelled alternatives. Use 44-pixel touch targets, visible keyboard focus, sensible tab order, full shortcut operation, readable contrast and reduced-motion support. Long chord names must wrap or expand on selection rather than silently disappear.

The award ambition rests on a demonstrable interaction: a beginner can move a full arrangement and understand what happened; an experienced musician can introduce one precise exception without leaving the sequence.

## 9. Cut, retain and deliver

**Remove from the primary experience:** Simple/Detail/Overview, Draft/Live tabs, S-number assignments, pool management, default Auto/Relative/Exact choices, and separate Capture/Print/Adopt vocabulary.

**Retain beneath the experience:** the native harmony authority, semantic-plus-exact notes, canonical progression, recognition, bounded suggestions, history and preset compatibility. Do not replace the audio engine to redesign its controls.

Record means write harmonic events. Save favorite means store a reusable chord. Set home key means change the reference context. An advanced `Write transformed notes…` operation, if retained, must identify its scope and reset the relevant transform atomically to prevent double transposition. These should never become one vague Keep button.

**First delivery:** persistent Harmony strip; explicit Follow; manual Home; stable Smart behavior on supported scales; deterministic launch/return; one editor; inherited global chords and local step exceptions; undo; migration. Preserve legacy Auto as a compatibility state until explicitly converted.

**Second delivery:** performance recording and editing, external MIDI capture after routing verification, advisory key detection and suggestion refinement. A design prototype should test the complete record journey early even if delivery is staged.

**Later, only with evidence:** live harmony over a moving A/B morph, sophisticated chromatic inference, retrospective capture, broader alternate scales and batch rewriting. The first release explicitly retains the existing morph restriction with an actionable route to a stable endpoint.

## 10. CPU and technical debt are design constraints

Resolve harmony once at an authored edit or scheduled change boundary and share the bounded result. Cache pitch maps and voicings by context, chord, range and voice limit. Keep recognition and suggestions off the audio thread; use preallocated, bounded work for runtime note dispatch. No new polling loop or per-sample harmonic analysis.

Update visual note maps on meaningful state changes. Animate only the transition, honor reduced motion, suspend hidden views and avoid rebuilding all chord rows on playback ticks. Keep one native playback authority with a shared UI projection, rather than another parallel harmony resolver.

Benchmark the existing and proposed paths on the same target devices, voice count, sample rate and buffer size. Measure callback cost, missed deadlines and idle UI CPU, with dense note-ons and rapid chord changes. The acceptance goal is no audio deadline regressions and no additional idle polling. No percentage saving is claimed without measurement.

Migration must preserve exact voicings, Relative and legacy Auto behavior, reused slot references, progression durations, independent chord clocks, sequence variations, fixed notes and both morph endpoints. Decode old presets without silently rewriting them; save only the new canonical form after a verified conversion. Keep tests at these musical and persistence boundaries rather than duplicating old UI structure.

## 11. Prove the promise

Run moderated, counterbalanced comparisons with 8–12 musicians spanning theory-light producers, keyboard players and hardware sequencer users, including touch and keyboard-only interaction. This is formative research, not a statistically representative claim.

| Task | Proposed acceptance target |
| --- | --- |
| Change harmony across three parts and return | First successful attempt within 15 seconds, without help |
| Protect one part from a global change | Correctly set Fixed within 10 seconds |
| Build a four-event progression | Within 45 seconds using pads and recording or direct entry |
| Put a slash chord on one step without altering other uses | Correct destination and no accidental shared edits |
| Predict Now, Next and Return behavior | At least 90% correct across observed task attempts |
| Recover from an unwanted edit | One Undo, restoring the audible and authored result |

Record baseline times and errors before setting final thresholds. The numbers above are design targets, not measured results. Pair task success with listening comparisons, confidence ratings and explanations in the participant's own words. Test fast repeated input, ambiguous chords, note-off identity, sustain, empty patterns, transport restarts, rapid preset loads and restricted morph states.

## The client demonstration

Begin with a restrained four-part loop. Press Dm7. Three linked parts move; the fixed lead stays. Press Fmaj7. The motion display makes the voicing change legible. Return restores the advancing phrase. Record four destinations. Open Synth, select step 9, enter Fmaj7/A and apply it only there. Undo once.

The proposition is visible in that minute: **Kessho lets you play the relationship between instruments as directly as you play a note.**

## Interaction study coverage

The accompanying study demonstrates global chord selection, Following/Fixed participation, Latch/Return, direct phrase editing, typed chord recognition for a bounded symbol set, one-step exceptions, and edit undo. Checked in a browser on desktop and at 390- and 320-pixel widths; the narrow layout has no overflowing controls after correction. Tested Dm7 note display, Fmaj7/A entry on step 9 and a single phrase event, undo, and return. No browser warnings or errors were reported in the final check.

It is a silent visual prototype. It does not implement audio, the production pitch resolver, scheduled launch boundaries, performance recording, MIDI capture, automatic key detection or morph behavior. Its note tiles illustrate pitch-class relationships, not measured voice-leading quality. Those behaviors are scoped above for the eventual product.

## Source anchors for the rescope

- [Harmony workspace and modes](../../../src/ui/harmony/HarmonyWorkspace.tsx)
- [Current status header](../../../src/ui/harmony/HarmonyWorkspaceHeader.tsx)
- [Shared slot interactions](../../../src/ui/harmony/HarmonySlotStrip.tsx)
- [Synth chord choice lane](../../../src/ui/synth/chord/SeqChordChoiceLane.tsx)
- [Synth draft/live input](../../../src/ui/synth/chord/SeqChordInteractionBay.tsx)
- [Playback and voicing controls](../../../src/ui/synth/chord/SeqDraftControls.tsx)
- [Current architecture contract](../../architecture/unified-harmony.md)
- [Existing visual tokens](../../../src/designSystem/designSystem.css)

Not performed: audio evaluation, production usability testing, CPU profiling or implementation changes. The principal delivery risks are musical mapping, exact-preset compatibility, independent chord-lane timing and morph ownership.
