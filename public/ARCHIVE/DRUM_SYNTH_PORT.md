# Drum Synth Port - Full Audit

> **Status**: CSS/layout port complete. Deep functional + wiring gaps remain.
> **Source**: `public/drum-synth-ui-prototype_option2.html` (6187 lines)
> **Target**: React components in `src/ui/drums/` + wiring in `src/App.tsx` + audio engine in `src/audio/drumSynth.ts`
> **Build**: 717.67 KB JS, 40.02 KB CSS, 0 TS errors

---

## What Is Working

### Audio Engine (7 files, ~7500 lines - no changes needed)
All 7 voices, trigger functions, morph, presets, euclidean algorithm, evolve methods fully ported.

### CSS/Layout Port (Steps 1-11 complete)
- `drums.css` - ~1100 lines of prototype CSS scoped under `.drum-root`
- All 12 component files use CSS classes (no inline styles except `--vc`/`--sc` custom props and dynamic grid)
- DrumPage two-panel layout shell created
- App.tsx DrumPage rendering cleaned up

### Connected Features
| Feature | Mechanism |
|---------|-----------|
| Play/Stop button | `drumEuclidMasterEnabled` -> `updateParams()` -> `start/stopEuclidScheduler()` |
| Sparkline data display | `drumSequencerModels` useMemo reads SliderState -> pattern data |
| Sparkline click -> select lane | `setDrumSeqOpenLane(laneKind)` |
| Playhead animation | `onStepPositionChange` callback -> `setDrumSeqPlayheads` |
| Evolve panel -> audio | useEffect -> `audioEngine.setDrumEuclidEvolveConfigs()` |
| SeqOverview row click | -> `setDrumSeqActiveTab` + switch to detail mode |
| Global params -> audio | useEffect -> `audioEngine.updateParams(state)` on any state change |

---

## CRITICAL GAPS - Audio/Sequencer Engine Disconnects

### GAP C1: Step Overrides Never Reach Audio Engine
**Severity: CRITICAL**

User toggles steps in trigger lane grid -> `drumSeqStepOverrides.triggerToggles` updates -> `drumSequencerModels` useMemo re-merges the pattern -> UI displays the toggled pattern correctly. But:

The audio engine's `startEuclidScheduler()` (drumSynth.ts L2510) creates its own internal `euclidSequencers` array using `createSequencer()`. The scheduler (L2637-2695) independently computes patterns via `getCachedEuclideanPattern()` from `this.params.drumEuclid{N}Steps/Hits/Rotation`. It NEVER reads `drumSeqStepOverrides`.

**Result**: What you see (toggled pattern) != what you hear (original euclidean pattern).

**Fix**: Add `audioEngine.setDrumSeqStepOverrides(overrides)` method + useEffect bridge in App.tsx.

### GAP C2: Sub-Lane Values Not Applied During Playback
**Severity: CRITICAL**

- **Pitch offsets**: `triggerVoice(voice, velocity, time)` accepts only 3 args (drumSynth.ts L673). No pitch offset parameter. The `PitchMode`, `root`, `scale` fields in `SequencerState` are typed but never read by the scheduler.
- **Morph values**: Scheduler does not set morph position per-step. Prototype calls `applyMorph(v)` to shift the morph slider to the sequencer's morph lane value before triggering.
- **Distance values**: Scheduler does not temporarily override `drumXxxDistance` params. Prototype saves current distance, sets the sequencer's value, triggers, then restores.
- **Expression (partial)**: Scheduler blends sequencer velocity 30% with random velocity 70% (drumSynth.ts L2689-2690), diluting intentional values. Prototype uses sequencer velocity directly (100%).

**Result**: Sub-lanes (pitch, morph, distance) are entirely cosmetic - editing them changes nothing audibly.

### GAP C3: Audio Engine Diverges From UI Over Time
**Severity: HIGH**

The audio scheduler maintains internal `euclidSequencers` that get mutated by evolution (hit drift, velocity breath, etc.) at drumSynth.ts L2617. These mutations are never reflected back to `drumSequencerModels` or any UI state. After evolution runs for a few bars, the sparklines/grids show the original patterns while the audio plays evolved patterns.

**Fix**: Evolution mutations need to push state back to the UI (via callback or shared state).

---

## MISSING UI CONTROLS - User-Reported Issues

### GAP U1: No Per-Sequencer Hits/Steps/Rotation Controls
**Severity: CRITICAL** (user issue #1 - "sequencer is not euclidean")

The `seq-per-controls` row in DrumPage.tsx (L297-L314) currently renders GLOBAL controls only: Tempo, Swing, Division, Evolve.

**Missing**: Per-sequencer DragNumber widgets for Steps (2-16), Hits (0-Steps), Rotation arrows. Also missing: euclidean pattern preset dropdown.

In the prototype, these controls are in `.seq-lane-controls` inside the trigger lane header AND in each overview row. Without these controls, the user has no visual way to create/edit euclidean patterns.

### GAP U2: Sub-Lanes Not Expandable
**Severity: HIGH** (user issue #2 - "sub sequencers are not actually expandable to use")

Sparklines show data and clicking selects a lane, but the expanded `SeqLane` editor (SeqLane.tsx) lacks:
- **Enable/Disable toggle** per sub-lane
- **Independent step count** per sub-lane (currently shares trigger lane count)
- **Direction cycling** (forward/reverse/pingpong - state exists but no UI button)
- **Pitch-specific controls**: Mode select (semitones vs notes), Root note, Scale, Pitch presets
- **Lane header controls** entirely missing - only shows lane name text (SeqLane.tsx L70)

### GAP U3: Speed Slider in Simple View
**Severity: LOW** (user issue #3 - "no need for speed in the simple view")

The `seq-per-controls` row shows global Tempo/Swing/Division. Consider removing Tempo from per-controls and keeping it in the transport bar or a collapsible settings area.

### GAP U4: Mini Overview Click -> Switch Sequencer
**Severity: MEDIUM** (user issue #5 - "clicking on the mini sequencer doesn't switch sequencers")

`SeqMiniOverview.tsx` (39 lines) renders patterns/playheads with ZERO click handlers. In the prototype, clicking a mini overview row calls `seqSetActiveTab(idx)`.

**Fix**: Add `onRowClick` prop, wire to `setDrumSeqActiveTab`.

---

## MISSING UI FEATURES - Full Prototype Feature Comparison

### GAP F1: Mute/Solo Buttons Non-Functional
**Severity: HIGH**

M/S buttons exist in tab bar (DrumPage.tsx L286-287) but `onClick` only calls `e.stopPropagation()` - no state toggle. `SequencerState.solo` is hardcoded to `false` in useMemo. The audio scheduler has no mute/solo check.

**Prototype behavior**: `seqToggleMute(idx)` flips `s.muted`; `seqToggleSolo(idx)` flips `s.solo`; scheduler checks `hasSolo = any(solo) -> skip non-solo; if muted -> skip`.

### GAP F2: Step Probability Editing
**Severity: MEDIUM**

Trigger lane steps only toggle on/off. No vertical drag for probability (0-100%). In prototype: drag up/down on a step changes its probability, shown as fill bar height + label. Double-click resets to 100%. Probability affects whether a step actually triggers (checked in scheduler at drumSynth.ts L2686).

### GAP F3: Ratchet UI
**Severity: MEDIUM**

Ratchet arrays exist in SequencerState but no UI to edit them. In prototype: tap hash lines below each step to cycle 1->2->3->4->1. Ratchet produces N sub-triggers within one step duration with decaying velocity. The scheduler already supports ratchets (drumSynth.ts L2692-2695).

### GAP F4: Source Voice Toggles
**Severity: MEDIUM**

Prototype shows 7 checkboxes per sequencer in `.seq-sources` section (which voices this seq triggers). React has boolean params per lane (`drumEuclid{N}TargetSub/Kick/etc.`) in SliderState but no visible checkboxes in the sequencer detail view. SeqOverview shows source icons but they are read-only (no onClick). Users cannot select which voices a sequencer triggers from the drums UI.

### GAP F5: Per-Sequencer Clock Division
**Severity: MEDIUM**

Prototype: each sequencer has its own clock division (1/4, 1/8, 1/16, 1/8T) including triplet. React: one global `drumEuclidDivision` (values 4/8/16/32) applied to all lanes. No triplet option. Each sequencer running at a different clock division creates polyrhythmic interest.

### GAP F6: Per-Sequencer Swing
**Severity: LOW**

Prototype: each sequencer has `s.swing` (0-0.75). React: one global `drumEuclidSwing` (0-100, converted to 0-1). Less critical than clock division since global swing still provides groove.

### GAP F7: Overview Mode Is Read-Only
**Severity: MEDIUM**

Prototype overview has full editing per row: Steps/Hits DragNums, Rotation buttons, Clock select, Source toggles, M/S, step grid with probability/ratchet. React overview shows: name, hits/steps text (read-only), source icons (display-only), colored step dots (no editing). Clicking a row switches to detail mode (this works), but you cannot edit anything inline in overview.

### GAP F8: Pitch Sub-Lane Specifics
**Severity: MEDIUM** (only matters when pitch lane is expanded)

Missing: Mode toggle (semitones vs tonal notes), Root note selector (MIDI note dropdown), Scale selector (Minor, Major, Dorian, etc. from `SEQ_SCALES`), Pitch presets dropdown, Note names displayed below bars in tonal mode.

### GAP F9: Drag Popup Tooltips
**Severity: LOW**

Prototype shows floating popup during all drags (value readout near cursor). React has no drag popup on any control.

### GAP F10: Spacebar Play/Stop
**Severity: LOW**

Prototype binds spacebar globally for play/stop toggle. React has no keyboard shortcut.

### GAP F11: Link Button
**Severity: LOW**

Prototype has a "Link" button per sequencer that ties sub-lane step counts to the trigger lane. React has no link concept in UI (though `linked` field exists in SequencerState type).

---

## Architecture Issues

### ARCH1: Two Separate Sequencer State Worlds

The biggest architectural problem. There are TWO independently-maintained sequencer states:

1. **UI world** (`drumSequencerModels` useMemo in App.tsx ~L1627): Computed from SliderState + drumSeqStepOverrides. Used for display. Recreated on every state change. Pure/stateless.

2. **Audio world** (`euclidSequencers` in drumSynth.ts L109): Created in `startEuclidScheduler()` via `createSequencer()`. Mutated in-place by evolution (L2617). Used for playback. Stateful/persistent.

These two worlds have NO synchronization:
- UI edits (toggle steps, drag values) -> update world #1 only
- Evolution mutations -> update world #2 only
- Hits/Steps/Rotation changes -> reach world #2 via `this.params` but NOT step overrides
- Playhead position -> goes from world #2 to UI via callback (one-way sync)

**Recommendation**: Add `setDrumSeqStepOverrides()` method to the engine to push UI edits in, plus callbacks for evolved state coming back out. Least invasive fix.

### ARCH2: useMemo Performance

`drumSequencerModels` useMemo depends on `[state, drumEuclidEvolveConfigs, drumSeqStepOverrides]`. Since `state` is the entire SliderState object (249+ drum keys + all synth/lead/fx keys), this useMemo recalculates on every slider change across the whole app. Should use a memoized subset of only drum-related keys.

### ARCH3: Global vs Per-Sequencer Params

Several params that should be per-sequencer are currently global:

| Param | Current | Should Be |
|-------|---------|-----------|
| Clock division | `drumEuclidDivision` (global) | Per-sequencer `drumEuclid{N}ClockDiv` |
| Swing | `drumEuclidSwing` (global) | Per-sequencer `drumEuclid{N}Swing` |
| Probability | `drumEuclid{N}Probability` (single value) | Per-step array `probability[step]` |

---

## Prioritized Fix Plan

### Phase 1: Core Sequencer Functionality (fixes user issues #1, #2, #4)
1. **Add per-seq Hits/Steps/Rotation controls** to trigger lane header in DrumPage
2. **Add euclidean preset dropdown** to trigger lane header
3. **Wire step overrides to audio engine** - `audioEngine.setDrumSeqStepOverrides()`
4. **Add sub-lane header controls**: enable toggle, steps DragNumber, direction cycling
5. **Wire sub-lane values to scheduler**: pitch -> triggerVoice, morph -> applyMorph, distance -> setDistance, expression -> velocity(direct)

### Phase 2: Interactivity (fixes user issues #3, #5)
6. **Add mini overview click handler** -> switch to sequencer tab
7. **Remove Tempo from per-controls** (keep in transport bar only)
8. **Wire mute/solo buttons** - toggle enabled/solo state, add scheduler checks
9. **Add source voice toggles** in seq body (checkbox per voice)
10. **Add per-step probability drag** on trigger lane steps

### Phase 3: Feature Parity
11. **Per-sequencer clock division** - migrate `drumEuclidDivision` to per-lane
12. **Overview inline editing** - Steps/Hits/Rotation/Sources in overview rows
13. **Pitch lane controls** - mode/root/scale selectors
14. **Ratchet UI** - hash lines below steps, tap to cycle
15. **Per-sequencer swing**
16. **Sub-lane independent step counts + link button**
17. **Direction cycling for sub-lanes**

### Phase 4: Polish
18. **Drag popup tooltips**
19. **Spacebar + A-J voice trigger keyboard shortcuts**
20. **Evolution state sync** - push evolved patterns back to UI
21. **Double-click reset** on all draggable values

### Phase 5: Extended Features (beyond original 21)
22. **Envelope visualizer upgrade** - multi-curve overlay (amp/pitch/filter/FM/wire), live spectrogram heatmap with per-voice frequency ceiling zoom, waveform oscilloscope, level meter (green->yellow->red + dB), fade transition back to envelope view after sound decays
23. **Responsive/mobile CSS breakpoints** - @media 900/820/600/400px + pointer:coarse touch targets + touch-action:none on drag surfaces
24. **SeqLane rendering details** - beat-head step numbers only at 1/5/9/13, expression inverted fill, morph/distance bipolar center line with A/B and 0/1 labels, sparkline SVG beat grid + opacity scaling + playhead rect
25. **Polyrhythm info display** - footer with "Trig N x Pitch N x Expr N = N hit cycle | Source: ..." LCM calculation
26. **Voice advanced panel section collapse** - per-section header toggle (Tone, Envelope, Body, etc.)
27. **Non-linear attack slider curve** - attackSliderToMs / attackMsToSlider (0-0.75 = 0ms, 0.75-1.0 = 0-5000ms)
28. **Auto-scroll on voice edit** - card.scrollIntoView() when toggling edit mode
29. **Status bar preset count** - dynamic "N presets loaded across 7 voices"
30. **Delete SeqPanel.tsx** - dead code removal

---

## File Change Map

| File | Changes Needed |
|------|---------------|
| `src/audio/drumSynth.ts` | Add `setDrumSeqStepOverrides()`, extend `triggerVoice()` for pitch/morph/distance, add mute/solo check in scheduler, emit evolved state |
| `src/App.tsx` | Add useEffect for step overrides -> engine, per-seq clock/swing state, fix useMemo deps |
| `src/ui/drums/DrumPage.tsx` | Add Hits/Steps/Rotation/Preset controls to trigger header, source toggles, move Tempo, wire mute/solo buttons |
| `src/ui/drums/SeqLane.tsx` | Add lane header controls (enable, steps, direction, pitch-specifics), probability drag, ratchet UI |
| `src/ui/drums/SeqMiniOverview.tsx` | Add `onRowClick` prop + per-row click handler |
| `src/ui/drums/SeqOverview.tsx` | Add inline controls (Steps/Hits/Rotation/Clock/Sources/M-S) per row |
| `src/ui/drums/SeqSparkline.tsx` | Add enable badge toggle |
| `src/ui/drums/drums.css` | Add CSS for source toggles, probability fills, ratchet hash lines, lane header controls, drag popup |
| `src/ui/state.ts` | Add per-seq clock division + swing keys if migrating from global |
| `src/ui/drums/SeqPanel.tsx` | Dead code - can be deleted |

---

## Audit Checklist (run after all phases complete)

### A. Visual Parity
- [ ] Per-seq Hits/Steps/Rotation/Preset controls rendered in trigger lane header
- [ ] Sub-lane headers have enable toggle, steps, direction buttons
- [ ] Source voice checkboxes visible and interactive
- [ ] Mute/Solo buttons toggle visually
- [ ] Overview rows have inline editing controls
- [ ] Mini overview rows are clickable
- [ ] Ratchet hash lines visible below trigger steps
- [ ] Probability fill bars visible in trigger steps
- [ ] Pitch lane shows mode/root/scale selectors
- [ ] Drag popup tooltip appears during drags

### B. Audio Integration
- [ ] Step toggle overrides reach audio engine (hear what you see)
- [ ] Pitch lane applies frequency offsets during playback
- [ ] Expression lane directly controls velocity (100%, not 30%)
- [ ] Morph lane sets morph position per step before trigger
- [ ] Distance lane overrides distance per step before trigger
- [ ] Mute silences a sequencer; Solo solos it
- [ ] Probability affects trigger chance per step
- [ ] Ratchet produces correct number of sub-hits
- [ ] Evolution mutations sync back to UI display
- [ ] Per-seq clock division creates polyrhythms

### C. No Regressions
- [ ] Synth/Lead/FX tabs unaffected
- [ ] Build compiles with zero TS errors
- [ ] No console errors during normal operation
- [ ] Playhead animation still works
- [ ] Evolve panel still works
