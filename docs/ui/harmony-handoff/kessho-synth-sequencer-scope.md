# Kessho — harmony inside the instrument

> Sequencer compatibility study. Preserve independent traversal and local edit scope. Use the current Notes editor, literal keys, momentary chord modifiers and explicit Place for the proposed UI. [Handoff and precedence](README.md).

Design proposal · 13 October 2026 · No application changes

Status updated 5 November 2026: retain this study's independent-lane and editing-scope requirements, with later product decisions governed by [Harmony, Random and Brain — accepted UX direction](../harmony-random-brain-design.md) and [Players and printing](kessho-players-and-printing-scope.md). The current design unifies Random Notes/Chords into slots, preserves their existing behavior by default, and keeps the global circle of fifths for key drift and L4 preset transitions.

Keep the four synth sequencers and their independent sub-sequencers. Give harmony a playable surface within that structure: a compact row of chord choices, one contextual compass, and the existing modulation lanes beneath it.

## What belongs where

| Global | Synth sequencer |
| --- | --- |
| Key, scale, shared chord progression and master harmonic movement | Local chord choices, their traversal, voicing and performance |
| A compass gesture moves the harmonic frame of participating tracks | A compass gesture edits the selected chord occurrence |
| Momentary, latch and return gestures | Record, replace, copy, step locks and variations |
| Shared musical context | One voice's response to that context |

Global is more than a transpose page: it can supply the progression. A synth can read that progression or compose its own relative chords. Both use the same resolver and the same visual vocabulary.

## Preserve the sequencer's identity

- Keep Seq 1–4, source assignment, variations A–D, generator selection and existing clock controls.
- Keep Trigger, Play/Chords, Pitch, Expression, Morph, Distance and Nudge. Preserve their independent lengths, traversal, bindings and timing semantics.
- The current chord-choice sequence advances on audible trigger hits. Rests do not consume a chord choice. Six hits in a sixteen-step trigger loop advance an eight-choice chord lane by six, not sixteen; the next loop starts at choice seven.
- Always distinguish the editing selection from the audible playhead. Selection is a filled cell; playback is a small moving marker. Show “Trigger 07 · Chord choice 03” when those positions differ.
- Expand one lane's editor while leaving the other lane summaries visible. Each summary exposes its shape, length and active position. Its own detailed timing and modulation controls remain available on expansion.

The design study's optional “Each grid step” clock is a proposed extension, not a change to existing presets. Its parameter-lane values are illustrative; production must retain each lane's present units and bindings.

## The everyday interaction

1. Select a chord choice in the compact strip.
2. Tap a compass root. “In key” supplies the diatonic quality; the adjacent quality and extension pads provide deliberate exceptions.
3. Adjust voicing. The note stack shows the resulting register. An optional Notes view should reuse the existing keyboard for exact notes, bass and alterations.
4. Choose a performance gesture: Chord, Strum, Arp, Pattern or Harp. Apply it to the lane, or enable “This choice only” for an Elektron-inspired occurrence lock.
5. Copy to the next choice, continue composing, or record a succession of played chords into this lane at its own clock.

Direct replacement needs an immediate audition and one-step undo. Saving to the shared chord library is a separate explicit action. Draft/Live/Capture remains relevant to recording and temporary audition, but should not be mandatory choreography for replacing a selected chord.

Compact cells show the chord name and an articulation mark. Probability, condition, routing and detailed performance parameters appear for the selected cell instead of being repeated on every cell. Longer patterns page through the same lane without multiplying editor panels.

## Brain assistance inside the lane

The compass is a stable circle of fifths. Physical proximity represents fifth relationships; it does not measure how smoothly arbitrary voiced chords connect.

Use three subtle recommendation outlines, calculated from the preceding chord, the following chord when known, the key and the loop boundary. Rank candidates by shared tones, voice movement, harmonic function and the user's explicit constraints. Give held or focused recommendations a temporary voice-path preview. The final result must be auditionable before committing; do not represent a heuristic as a universal “best chord.”

“Smooth” runs whenever a chord is resolved, including during unattended sequence playback. Preserve common tones when practical and choose nearby inversions within register, bass, voice-count and instrument limits. It should not invent a new progression merely because the user stops touching the controls. Generating new chords requires an explicit action or generative mode.

Relative choices follow the global harmonic movement once. “Global chord” reads the currently resolved global chord. “Fixed notes” preserves the selected pitches through global movement. Returning from a temporary global gesture resolves the then-current background chord with the same voice-leading rules. Never jump back to a stale chord captured before the gesture.

The study demonstrates a small common-tone/movement ranking and a nearest-voicing approximation. Production needs a constrained, deterministic resolver; the illustration does not reproduce a proprietary Brain algorithm.

## Existing architecture: the important integration decision

The current page has two different authoring paths:

- [Printed variation steps](../../../src/ui/sequencer/synthSequenceVariations.ts) own local chord intervals relative to their step root.
- [The Play chord sub-sequencer](../../../src/audio/productPlaySequencer.ts) traverses saved-slot references by audible hit ordinal. Its [choice editor](../../../src/ui/synth/chord/SeqChordChoiceLane.tsx) and [interaction bay](../../../src/ui/synth/chord/SeqChordInteractionBay.tsx) expose that shared-bank workflow.

Reuse one compass editor across these contexts, but label its target explicitly: “Trigger step” or “Chord choice.” Do not collapse the two time models or silently change playback precedence.

The proposed “Only this choice” interaction needs a deliberate data-model change. A slot reference alone cannot support an isolated edit. Recommend one canonical local chord-intent payload, reusable by variation steps and chord-choice occurrences, with optional shared-library references. Keep old referenced patterns linked until explicitly made local. Do not create a second hidden bank, mirror shared slots, silently overwrite an occupied slot or merely relabel a global slot edit as local. This revises the current choice payload and needs versioned persistence plus native-engine support; it is not just a UI reskin.

## Delivery boundaries

First deliver the compact lane, contextual editor, honest editing scope and preserved playback behavior. Add local chord-intent support as part of making direct editing trustworthy. Then unify performance controls and add occurrence locks, recording and deeper contextual recommendations. Pattern and Harp are proposed additions to the consolidated surface; displaying their buttons does not establish full engine support.

Keep CPU work tied to musical events and actual edits. Cache bounded voicing candidates; resolve on chord/context changes; update only visible playheads. Never run recommendation searches or rebuild lane controls on every animation frame. Audio scheduling stays in the existing authoritative engine.

Acceptance checks: legacy presets sound the same; rests preserve hit-based chord traversal; mixed lane lengths remain independent; editing one occurrence leaves other uses intact; selection never follows the playhead unexpectedly; global transposition is applied once; exact notes remain fixed; loop-boundary voicings and note releases are stable; monophonic and polyphonic sources respect their limits.

The interactive study was checked for isolated choice editing, sequencer switching, style locks, fixed-note behavior under global movement, traversal and narrow-screen layout. It uses a simple audition sound, not Kessho's audio engine. The remaining application controls are outside this focused panel study.
