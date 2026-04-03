# Kessho Enhancements — Phase 4

This document breaks down the `src/App.tsx` refactor into a sequence of safe, shippable slices.
The goal is not to "rewrite the app shell." The goal is to turn the current god file into a thin
composition layer while preserving behavior, keeping feature work moving, and avoiding one massive
merge-conflict magnet.

Designed against the live app as of April 2026.

---

## 1. Why `App.tsx` Must Be Split

`src/App.tsx` is currently doing all of the following in one module:

- top-level app shell and tab routing
- preset store bootstrapping and cloud/local preset integration
- snowflake / welcome mode orchestration
- journey mode orchestration
- morph runtime orchestration
- recording and stem-export orchestration
- playback timer / countdown logic
- engine callback wiring
- per-tab UI sync state for drums, synth, granular, and delay
- slider mode / dual-range / random-walk coordination
- page prop adaptation and type coercion

This creates three practical problems:

- performance fixes are hard because UI, engine, and preset logic are interleaved
- type cleanup is hard because boundaries are unclear and prop adapters live inline
- feature work is high-risk because touching one area often means touching unrelated state

---

## 2. Refactor Goals

**Primary goals**
- Reduce `App.tsx` to a composition shell.
- Move logic into domain-sized hooks/modules with explicit ownership.
- Replace cast-heavy inline adapters with typed boundaries.
- Make timer/callback code live near the feature it serves.

**Non-goals**
- No visual redesign.
- No engine rewrite in this phase.
- No new state-management library unless the existing state shape proves impossible to extract cleanly.

---

## 3. Target End State

Recommended structure:

```text
src/app/
  AppShell.tsx
  AppTabs.tsx
  AppDebugPanel.tsx
  appTypes.ts

  hooks/
    useAdvancedTabs.ts
    useEngineBindings.ts
    useMorphRuntime.ts
    useJourneyRuntime.ts
    usePresetLibrary.ts
    useRecordingRuntime.ts
    usePlaybackTimer.ts
    useSliderModes.ts
    useDrumUiState.ts
    useSynthUiState.ts
    useGranularUiState.ts
    useCloudPresetBootstrap.ts
    useMediaSession.ts

  adapters/
    buildGlobalPageProps.ts
    buildSynthPageProps.ts
    buildDrumPageProps.ts
    buildGranularPageProps.ts
    buildDelayPageProps.ts
    buildRoutingPageProps.ts
    buildEarthPageProps.ts
    buildReverbPageProps.ts

  presets/
    normalizePresetForWeb.ts
    presetImportExport.ts
    morphPresetSlots.ts

  runtime/
    morphApply.ts
    journeyApply.ts
    randomWalkSync.ts
    visibilityLoop.ts
```

Key rule: `App.tsx` should stop owning domain logic directly. It should mainly:

- gather top-level state
- call domain hooks
- mount the current page
- render the debug panel / mode shell

---

## 4. Decomposition Map

### 4.1 Extract `usePresetLibrary`

**Owns**
- local/cloud preset store setup
- factory preset loading
- save/load/delete/import/export flows
- `SavedPreset` conversion helpers
- slot upload selection logic

**Move out of `App.tsx`**
- preset loading bootstrap near the top of the file
- `handleSavePreset`
- `handleDeletePreset`
- `handleLoadPreset`
- `presetEntryToSavedPreset`
- slot upload dialog support state

**Why first**
- High payoff, low runtime risk.
- Mostly IO/state orchestration, not real-time audio logic.

---

### 4.2 Extract `useSliderModes`

**Owns**
- `sliderModes`
- `dualSliderRanges`
- `randomWalkPositions`
- `randomWalkRef`
- `handleCycleSliderMode`
- `handleDualRangeChange`
- dual-range application from preset load

**Move out of `App.tsx`**
- the unified dual slider mode state block
- dual range preset application helper
- range-cycle logic and morph-endpoint range persistence logic

**Why early**
- This is a cross-cutting concern currently cluttering many handlers.
- Once isolated, page prop builders get much simpler.

---

### 4.3 Extract `useEngineBindings`

**Owns**
- engine callback registration / cleanup
- engine-driven UI sync state
- tab/visibility gating for callback-driven React updates

**Sub-slices**
- `useLeadBindings`
- `useDrumBindings`
- `useGranularBindings`
- `useSynthSequencerBindings`

**Move out of `App.tsx`**
- lead expression / morph / delay callbacks
- drum morph / S&H / trigger / playhead callbacks
- synth playhead / evolve callbacks
- granular UI active wiring and polling

**Why now**
- This is where a lot of the battery fixes live.
- Pulling it out reduces future timer regressions.

---

### 4.4 Extract `useMorphRuntime`

**Owns**
- morph slot state
- morph preset capture refs
- manual morph position apply
- auto morph player scheduling
- morph countdown / phase state
- CoF morph visualization state

**Move out of `App.tsx`**
- `lerpPresets`
- morph slot load / clear handlers
- morph auto-play runtime
- `handleMorphPositionChange`
- morph endpoint compatibility warnings

**Important constraint**
- Keep the public surface typed and small.
- Avoid mixing "UI picker state" and "morph engine apply logic" in the same function.

---

### 4.5 Extract `useJourneyRuntime`

**Owns**
- journey mode playback state
- preset load bridge into journey
- journey morph bridge into global morph runtime
- hidden-tab journey scheduling behavior

**Move out of `App.tsx`**
- `handleJourneyLoadPreset`
- `handleJourneyMorphTo`
- journey scheduling refs / cancellation
- `handleJourneyEnd`

**Why separate from morph runtime**
- Journey is a caller of morph logic, not the owner of the generic morph system.

---

### 4.6 Extract `useRecordingRuntime`

**Owns**
- arm/start/stop recording
- stem buffer accumulation
- MediaRecorder lifecycle
- WAV/WebM/archive generation
- recording duration timer

**Move out of `App.tsx`**
- recording refs
- `handleArmRecording`
- `handleStartRecording`
- `handleStopRecording`
- archive/export helpers

**Why valuable**
- Recording is a dense, self-contained runtime that currently makes the shell much harder to scan.

---

### 4.7 Extract `usePlaybackTimer` and `useMediaSession`

**Owns**
- playback auto-stop timer
- countdown display
- media session setup / teardown
- iOS bridge logic

**Why separate**
- These are lifecycle concerns, not app-shell concerns.

---

### 4.8 Extract tab prop builders

**Owns**
- page-specific prop shaping
- typed prop adapters
- removal of repeated `as unknown as React.ComponentType<Record<string, unknown>>`

**Move out of `App.tsx`**
- the large tab-mount block’s inline adapters
- page-specific callback wrapping

**Result**
- `App.tsx` becomes mostly:
  - `const drumPageProps = buildDrumPageProps(...)`
  - `const synthPageProps = buildSynthPageProps(...)`
  - `<AppTabs activeTab={...} />`

---

## 5. Recommended Extraction Order

### Slice 1 — Shell hygiene
- Create `src/app/`
- Move shared types out of `App.tsx`
- Move debug panel into `AppDebugPanel.tsx`
- Move tab button strip into `AppTabs.tsx`

### Slice 2 — Preset library
- Extract `usePresetLibrary`
- Remove preset import/export/save/delete logic from `App.tsx`

### Slice 3 — Slider modes and dual ranges
- Extract `useSliderModes`
- Update page prop builders to consume one typed object instead of many loose values

### Slice 4 — Engine bindings
- Extract lead/drum/granular/synth callback hooks
- Keep `App.tsx` focused on wiring returned state into pages

### Slice 5 — Morph runtime
- Extract `lerpPresets` and morph orchestration into `useMorphRuntime`
- Share helpers with journey instead of maintaining parallel apply logic

### Slice 6 — Journey runtime
- Extract `useJourneyRuntime`
- Leave `JourneyModeView` props stable while moving orchestration behind the hook

### Slice 7 — Recording + playback timer
- Extract recording runtime and playback timer hooks
- Move media session bridging alongside playback lifecycle

### Slice 8 — Typed page adapters
- Add `build*PageProps.ts` adapters
- remove the broad component casts

### Slice 9 — Final shell cleanup
- Rename `App.tsx` implementation to `AppShell.tsx`
- keep a tiny `App.tsx` entry that renders providers + `AppShell`

---

## 6. Guardrails

- No slice should change page behavior and refactor module ownership at the same time unless the behavior fix is trivial.
- Every slice must pass `npm run type-check` and `npm run build`.
- Avoid moving raw code blocks without introducing a named ownership boundary.
- Favor hooks for runtime/lifecycle extraction and plain modules for data/adapter extraction.
- Keep refs owned by the hook that mutates them; do not leak them through wide prop chains unless absolutely necessary.

---

## 7. What Should Stay in `App.tsx`

Even after the split, a thin app shell should still own:

- top-level provider composition
- top-level `state` and `engineState` ownership, unless a later phase intentionally changes that
- mode selection (`snowflake` / `advanced` / `journey`)
- current tab selection
- assembly of the major hooks
- final render tree

If a function is deeply domain-specific, timer-heavy, or page-specific, it probably should not still live there.

---

## 8. Acceptance Criteria

Phase 4 is successful when:

- `src/App.tsx` drops under roughly 1500-2000 lines
- preset logic, morph runtime, journey runtime, recording runtime, and engine bindings no longer live inline in the shell
- the tab mount block no longer relies on repeated broad component casts
- future performance work can be done by editing a focused hook/module instead of spelunking the whole shell

---

## 9. Immediate Next Refactor Start

Best first real slice:

1. Extract `AppDebugPanel.tsx`
2. Extract `AppTabs.tsx`
3. Extract `usePresetLibrary`

That gives the fastest reduction in shell size with the least audio risk, and it sets up the later morph/journey extractions cleanly.
