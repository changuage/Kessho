# Accepted step printing direction

> September engineering snapshot. Preserve the verified Step, Walker and Orbit behavior as regression cases. See the later players and printing scope for outstanding fidelity and destination requirements. [Handoff and precedence](README.md).

## Playback alignment follow-up — 2026-09-12

Fixed the reported Walker-print mismatch: native telemetry now uses the active bank's length and division, the host no longer folds positions by the legacy length, and independent-lane cursors use the appropriate sounded-hit or step phase. Sparklines render their actual length and inactive variations do not borrow the audible variation's cursor.

Live review also exposed pending bank edits starving when the first note had negative Nudge. Early loop activation advanced the boundary before pending transactions could apply. Pending bank/selection transactions now use the preserved nominal boundary during preactivation, including render segmentation, without duplicate first attacks.

Verified the screenshot's 24-cell triplet pattern with 13 sparse attacks and nudges, running 8-to-24-cell bank replacement, six pending-bank/selection cases around negative-nudge preactivation, host-queue/encoder delivery, UI cursor regressions, TypeScript, production build, telemetry tests, WASM smoke and asset freshness. Live Walker capture with first Nudge -0.24 was printed, resized from 8 to 24 cells, changed to 1/8T, and observed reaching step 22 with advancing Nudge and no runtime warnings/errors. Final runtime asset hash: `055f36f73bc8ef60`.

## Completion review — 2026-09-12

Implemented and reviewed the accepted step-based direction. Historical checkpoints below describe intermediate states and are superseded by this completion review.

- Successful Keep switches the source lane to Step, opens Detail, and selects the first printed hit and its Note/Chord/Arp editor. Rejected or stale receipts do not change the view or mode.
- Every grid cell has a numbered inspection control separate from the trigger toggle. Shared Length edits note holds, scales captured chord voices proportionally within supported limits, and leaves Arp span separate.
- Step, Walker and Orbit display the actual selected playback mode. Printed banks remain saved when returning to a generator; generator clock and recording settings remain independent of the saved bank.
- Final verification: full production build, TypeScript, 30 focused recording/model/encoder/inspection tests, plus 20 focused checks after the final mode-display correction. Earlier C++ sequencer, native capture/render/link and WASM checks passed; runtime asset version is `66c3fbe7ec5b2b85`.
- Live browser verification: Orbit printed 3 notes and Walker printed 4 notes into active Step playback; first-hit inspection opened automatically. Numbered inspection preserved trigger states. Length changed to 0.75 beats and persisted after switching Walker → Step. No browser runtime errors were reported.

This replaces the unfinished piano-roll/timed-clip product direction. Implementation must preserve the original polyrhythmic step sequencer rather than bypass it with a separately editable performance timeline.

## User experience

- Four variations A–D per synth sequence, each up to 32 steps. One variation can loop, or the four can chain, up to 128 steps. These are not the existing four synth lanes or Harmony morph banks.
- Keep the trigger grid and familiar Pitch, Velocity/Expression, and Nudge subsequencers. Preserve independent cycle lengths. Supply explicit note duration/gate handling; the existing StepOverrides type does not currently contain a gate lane.
- Select a step to edit Note, Chord, or Arp in one contextual panel. No separate Play subsequencer initially.
- Reuse arp rate/pattern controls. Default span is one step; allow extending the visible span. Next triggered event ends the prior arp; no overlap-policy selector initially.
- Preserve plotted chord comparisons on one stable pitch axis. Show nearby choices and expand Compare all. Use the same chord model/editor for local synth material, shared library, and Global Harmony, with destination explicit. Local edit by default; saving/linking library content deliberate. Recorded pitches stay fixed by default; Follow Harmony is explicit.
- Recording shows phrase progress, Stop and Cancel. Stopped draft offers Keep take and Discard. Never clear accepted sequence material merely to arm recording.

## Auto-print

- Phrase musical duration is anchored when recording starts. Auto-print changes step resolution/length and variation use, not global BPM or phrase duration.
- Choose the coarsest available resolution that represents ordered event groups within four variations/128 steps. Finer grids distinguish separate attacks; chord grouping must not silently turn fast melodies into chords.
- Nudge is grid-relative: 0 is on the step, +1 is the next grid step, -1 is the previous grid step, with continuous fractional values. Compute nudge=(recordedBeat-gridBeat)/owningStepDuration. Gaps in the trigger pattern do not change this offset. Account for cyclic phrase and variation boundaries.
- Record beyond the phrase using modulo phrase time. Subsequent passes replace traversed phrase regions including rests; preserve the unswept suffix when stopping mid-pass. Capacity overflow is not permission to discard arbitrary old events.
- Keep capture scratch bounded and report unrepresentable material; retain the draft when fitting fails. Fit on Stop/Keep or a stable preview rather than constantly changing displayed step numbering while playing.
- Initially align printed subsequencer lengths/reset positions to reproduce the print. Subsequent independent-cycle edits intentionally transform the result.

## Engineering constraints

- Reuse trigger clips, play-note/chord/arp machinery and existing audio scheduler where correct. No extra dependencies or speculative frameworks.
- One persisted step authority, audio-side variation boundaries, atomic accepted edits, and accurate playback-derived UI position.
- No per-frame sorting/recognition/serialization; compile edited musical state outside the real-time rendering path and retain sparse/bounded scheduling.
- Remove unfinished timed-clip product UI/runtime paths deliberately. User explicitly confirmed no saved sequencer data: no migration or quarantine compatibility paths are required.
- Parent manages/reviews; implementation delegated to Luna Max with focused briefs, no full context forks. No commits or pushes requested.

## Acceptance checks

Implementation ownership after architecture review: native_recording_finish owns the shared TS bank contract, auto-print/looping scratch and state/persistence; browser_recording_finish owns C++ shared audio, ABI, WASM exports/worklet and Apple native delivery/build tests; native_recording_finish additionally owns the TS variation encoder and binary contract tests; recording_interface_finish owns Synth/contextual step UI, recorder hooks, chord comparison/editor cohesion, and TS host/runtime/page callback wiring. Coordinate ABI changes directly between encoder and core owners; avoid overlapping edits. Workers coordinate types directly. Existing trigger and independent subsequencer arrays remain authority: do not introduce StepRecord pitch/velocity/nudge fields that duplicate those arrays. Add only step-local mode/chord/gate/arp detail. Gate starts as a per-step detail rather than a new generic subsequencer lane. Variation chains are at most four populated entries, never a speculative 128-entry chain.

- A single-note print edits and plays through Pitch/Velocity/Nudge, with no timed-clip override masking edits.
- An explicitly grouped chord remains one event; a rapid ordered melody remains separate events or reports a fitting limitation.
- A dense fixed-duration phrase selects finer supported clock spacing and uses additional variations without changing tempo or extending the phrase.
- Sparse phrases select a readable coarser fit. Exact phrase duration and the trigger minimum of two steps remain valid even for a short final variation.
- Nudged attacks at A/B and D/A boundaries reproduce the intended phrase-relative positions.
- A second pass containing rests removes swept old attacks; stopping halfway preserves the unswept suffix. Crossing the phrase boundary is not an arbitrary capacity eviction.
- Held note instances survive wrap until release without duplicate attacks or silent loss of the anchor event.
- Editing a subsequencer cycle after printing intentionally changes playback; both selected and currently playing variation remain correctly identified.
- Note/Chord/Arp can coexist within a variation. Arp span and note gate are distinct; next triggered event ends the previous arp.
- Keep take is acknowledged before persisted replacement; Cancel leaves the accepted sequence intact. Save/reload preserves every variation and local chord.
- Global/library/sequence chord comparisons share a stable pitch axis and resolve to the notes actually played. Local edits do not mutate shared library chords implicitly.
- Browser and Mac use the same musical behavior. Hidden-page recording does not depend on animation frames; no per-frame full-state sorting or encoding.

## In-progress review checkpoint

Three Luna Max workers are implementing, not complete. Shared model is `src/ui/sequencer/synthSequenceVariations.ts`, persisted field `SliderState.synthSequenceVariationBanks`. Bank uses existing serialized lane overrides/state plus stepMetadata; UI-only selection separate `playVariation`. New UI components are `SequencerVariationRail.tsx` and `SeqStepDetailPanel.tsx`. Runtime wire headers started at `KesshoProductSequencerVariations.h`/`ProductSequencerVariationState.h`; full audio delivery/build still outstanding. UI exact planned props: `selectSynthSequenceVariation(lane,index)`, `activeSynthSequenceVariationIndices`, `commitSynthSequenceVariationBank(lane,bank)` (acknowledged before persist/cancel).

Parent ran initial auto-print tests: six passed. Review rejected the known-duration scratch test's expectation that a newly ingested note disappeared in its first pass. Model worker must add generation/absolute time or atomic sweep-before-insert batch processing; only later passes erase prior notes. Also move capacity checks after time sweeping, test128 steps/phase boundaries/rest overwrite/held gates, and use bounded matching for legal adjacent grid anchors (no exponential DFS). Fitter shape/nudge enabled lanes and nearby-note/chord examples improved. No full playback or UI acceptance yet.

Other current review requirements: missing bank commit callback must not act as accepted; source/chord group identity must survive raw capture; recording duration is loop period, not auto-stop cutoff; Keep selects Step view after Orbit/Walker print without deleting generator settings; original independently cycling subsequencer controls must actually govern bank playback; no fake wall-clock audible variation indicator; no inactive editor variation accidentally written to currently audible legacy lane. Native generated capture must have authoritative unwrapped beat/gate data and shared grid nudge. Tests/build remain required.

## Latest manager review

- Parent verified 13 model/persistence checks pass; separate delayed batch smoke retains onset3 and4.1 at clock4.2 in a4-beat phrase. Keep the explicit unwrapped batch contract.
- Encoder/core owners must agree one ABI before final tests: correct per-variation byte offsets; pitch modes/root, independent sublane lengths/directions/follow-hit policy, per-note gates, full arp controls. No silently truncated musical payloads.
- Core review: nudge indexing must use its own subsequence phase, Arp→Note/Chord must clear prior arp scheduling, single-variation boundary must advance each loop, and active-step telemetry must use samples per step (not step count). Fixed captured notes must not be re-harmonized without Follow Harmony.
- UI review in running app: initial A should show the existing lane's actual step count; manual step editing must not require recording or a hidden initialization click. Remove Timed clip recorder/Extend leftovers. Familiar subsequence controls must edit the selected variation.
- Runtime UI: selection requests need core acceptance or an explicit unconfirmed state; actual sounding variation needs a telemetry subscription, not a memo frozen on runtime availability. Accepted Keep must functionally persist latest state once, guarding stale receipts.
- Keyboard chord IDs group a bounded first-attack window; fitter must not additionally require identical timestamps. Different nearby attacks remain separate.
- No final build/audio/live recording acceptance yet. Parent Vite preview is127.0.0.1:4173, session20012.

## Current finishing team and verification

Fresh Luna Max workers (no context forks): core_finish owns C++/worklet/WASM/Apple native; host_finish owns TS encoder/model/host/native TS/state persistence; ui_finish owns UI/recording hook/App React bridges. Previous workers are no longer live.

Parent independently verified TypeScript compile and ProductSequencerTests pass, plus21 model/encoder/persistence/host tests at this checkpoint. ABI Step564/Snapshot19736/Bank78984; following masks start108 and steps1688; followHarmony at step20. Existing Notes UI arrays mean scale degrees relative stored root, not absolute MIDI. Print now uses fixed-root Chromatic degrees; audio must preserve actual captured pitch.

Remaining review blockers assigned: synchronizer must capture target signature before awaiting receipt (avoid marking newer target applied); native doublebuffer telemetry needs reader ownership/atomic safe publication and rejected mailbox updates must terminate receipt; generated attack group IDs absent from native/worklet capture require forwarding; hook integration tests for silence sweeps/origin/overflow/staleack; one trigger grid and selected variation length/rotation controls. Remove obsolete timedclip playback/persistence authority, retain raw scratch only. Rebuild WASM and full app, then live recording/Keep/Discard/variation playback checks. Not complete.
