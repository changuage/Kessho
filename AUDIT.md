# Kessho Codebase Tech Debt Audit

**Date:** 2025-03-03  
**Codebase size:** ~50,070 lines (TS/TSX/CSS) across ~55 files  
**Scope:** Repeating patterns, duplication, structural risks, efficiency opportunities

---

## Executive Summary

The codebase has grown to 50k lines with **no state management**, **no component decomposition**, and **a flat 667-field state type**. Three god-objects — `App.tsx` (6,651 lines), `engine.ts` (4,129 lines), `drumSynth.ts` (3,054 lines) — contain 13,834 lines, or **28% of the entire codebase**. Repeating per-voice/per-lane patterns account for an estimated **2,500–3,000 lines of pure duplication** that could be eliminated through data-driven abstractions.

The top 5 systemic risks, in order of severity:

| # | Risk | Lines Affected | Impact |
|---|------|---------------|--------|
| 1 | **Flat SliderState with 667 fields** | All files | Every new param requires edits in 5+ places; `as number` casts everywhere |
| 2 | **App.tsx god component** | 6,651 | All state, all callbacks, all routing in one file; 187 hooks, 64 useState |
| 3 | **Per-voice copy-paste** (7 drum, 4 looper, 4 euclid lanes) | ~3,000 | Identical blocks repeated with only prefix changes |
| 4 | **No centralized preset loading** | ~10 call sites | Same 20-line migrate+normalize+merge sequence in 10+ places |
| 5 | **Dual Euclidean schedulers** | ~550 lines | 80% structural clone in engine.ts |

---

## 1. The Flat SliderState Problem (Critical)

**File:** `src/ui/state.ts` — 2,923 lines  
**SliderState:** ~667 individually-named fields

The entire app's parameter space is a single flat `Record`-like type where every drum voice, looper voice, and sequencer lane is expanded into uniquely-named fields:

```
drumSubFreq, drumSubDecay, drumSubAttack, drumSubLevel, drumSubVariation, drumSubDistance...
drumKickFreq, drumKickDecay, drumKickAttack, drumKickLevel, drumKickVariation, drumKickDistance...
drumClickFreq, drumClickDecay... (×7 voices = ~160 fields)

looperV1Blur, looperV1Spray, looperV1GrainSize, looperV1Pitch...
looperV2Blur, looperV2Spray... (×4 voices = ~88 fields)

drumEuclid1Steps, drumEuclid1Fills, drumEuclid1Rotate...
drumEuclid2Steps, drumEuclid2Fills... (×4 lanes × 3 sequencers = ~120 fields)
```

### Why this is the root cause of most debt

- **334 `as number`/`as string` casts** across the codebase — because `SliderState[key]` returns a `string | number | boolean` union
- **Every dynamic key access requires a cast**: `state[paramKey] as number`
- **Adding a new param** requires: (1) add to type, (2) add to DEFAULT_STATE, (3) add to UI, (4) add to engine.applyParams, (5) add to preset migration if renaming — **5+ touch-points per field**
- **Morph interpolation** must iterate all 667 keys to lerp between presets
- **Preset serialization** dumps all 667 fields into JSON even if only 20 differ from defaults

### Suggested structure

```typescript
// Instead of 160 flat drumXxx fields:
interface DrumVoiceState {
  freq: number; decay: number; attack: number; level: number;
  variation: number; distance: number; /* ...12-20 params */ 
}
interface DrumState {
  voices: Record<DrumVoice, DrumVoiceState>;  // 7 voices
  delay: DrumDelayState;
  euclid: EuclidLaneState[];  // 4 lanes
}
```

This would eliminate ~300 duplicate field definitions, all `as number` casts for drum params, and the 7-way if/else chains that map key prefixes to voice names.

---

## 2. App.tsx God Component (Critical)

**6,651 lines | 187 hooks | 64 useState | 59 useRef | ~42 useEffect**

Everything lives in one React component: audio engine management, preset loading, morph system, recording (WAV encoding, stem export, zip archive), journey mode orchestration, slider mode cycling, random walk animation, UI rendering.

### Hook census

| Hook | Count |
|------|------:|
| useState | 64 |
| useRef | 59 |
| useEffect | ~42 |
| useCallback | ~16 (several are 170–290 lines) |
| useMemo | 6 |

### Largest callbacks (each should be its own hook or module)

| Callback | Lines | What it does |
|----------|------:|--------------|
| `lerpPresets` | ~280 | Interpolates all 667 SliderState fields between A/B presets |
| `handleSliderChange` | ~290 | Slider value dispatch + drum morph override + pad morph + dual range interpolation |
| `handleMorphPositionChange` | ~170 | Manual morph application + override blending + CoF drift |
| `handleCycleSliderMode` | ~170 | Slider mode cycling with drum morph awareness |
| Auto-cycle morph useEffect | ~260 | 6-phase state machine (hold/entry/playA/morphAB/playB/morphBA) |

### Duplication within App.tsx

| Pattern | Copies | Lines each | Total waste |
|---------|-------:|----------:|-----------:|
| Preset load boilerplate (migrate → normalize → merge → preserve USER_PREFERENCE_KEYS → update engine) | 6+ | ~20 | ~120 |
| Morph dual-range merge block (filter morph keys → merge modes → init random walk) | 3 | ~40 | ~80 |
| Morph state capture (capture refs for A/B/ranges/modes) | 4 | ~12 | ~36 |
| Drum voice if/else chain (7 `startsWith` checks to map key → voice) | 4+ | ~14 | ~42 |
| effectiveA/effectiveB construction (fallback to current state) | 5 | ~5 | ~20 |
| Inline JSX event handlers (50-line onChange in Slot A/B dropdowns) | 2 | ~50 | ~50 |
| **Total** | | | **~348 lines** |

### Extraction roadmap

| Priority | Extract To | Lines Saved |
|----------|-----------|------------:|
| P0 | `useMorphSystem()` hook | ~800 |
| P0 | `useRecording()` hook | ~400 |
| P0 | `presetUtils.ts` (applyPreset, captureMorphState, applyMorphResult) | ~300 |
| P1 | `useAudioEngineCallbacks()` hook | ~250 |
| P1 | `useSliderModes()` hook | ~200 |
| P1 | `drumVoiceMap.ts` (lookup table replacing if/else chains) | ~60 |
| P2 | `usePlaybackTimer()` hook | ~80 |
| P2 | `styles.ts` (extract inline styles) | ~400 |
| P2 | `useJourneyMode()` hook | ~150 |

P0 alone: 6,651 → ~5,150 lines. All priorities: → ~3,100 lines.

---

## 3. Per-Voice Copy-Paste in drumSynth.ts (High)

**3,054 lines | 7 trigger methods | 6-phase template repeated 7×**

Every trigger method (`triggerSub`, `triggerKick`, `triggerClick`, `triggerBeepHi`, `triggerBeepLo`, `triggerNoise`, `triggerMembrane`) follows an identical 6-phase template:

| Phase | What it does | Lines per voice | Identical? |
|-------|-------------|----------------:|:----------:|
| 1. Morph resolution | Check override → S&H → getMorphedParams → notify | ~15 | ✅ Verbatim |
| 2. Param extraction | `(morphed.drumXxxParam as number) ?? p.drumXxxParam ?? default` | 8–20 | 🟡 Same pattern, different keys |
| 3. Variation + Distance | computeVariation → sampleSHParam → resolveDistance | ~5–8 | ✅ Verbatim |
| 4. Node creation | createOscillator/Gain/Filter | 3–15 | ❌ Voice-specific |
| 5. Envelope | attack > 0.0005 ? linearRamp → expRamp : setValueAtTime → expRamp | varies | ✅ Same pattern ×25 |
| 6. Routing + cleanup | connect triggerTarget + reverbSend + delaySends → trackTransientNodes | ~8 | ✅ Verbatim |

### Specific duplication

| Pattern | Instances | Lines saved with helper |
|---------|----------:|----------------------:|
| Morph resolution boilerplate (phases 1-2) | 7 | ~105 |
| Envelope pattern (attack/decay idiom) | ~25 | ~150 |
| Output routing (connect target + reverb + delay) | 15+ | ~60 |
| **Total** | | **~315** |

### Helpers that should exist

```
resolveMorph(voice: DrumVoice): { morphed, morphValue }    // eliminates 105 lines
applyADEnvelope(param, time, attack, peak, decay): void    // eliminates 150 lines  
routeOutput(node, voice): void                              // eliminates 60 lines
```

### Ordering inconsistency (latent bug)

`noise` and `membrane` resolve variation/distance **before** morph params, while the other 5 voices do it **after**. This means morph values don't correctly feed into variation/distance for those two voices.

### Hot-path allocation concern

Each trigger creates 3–15 fresh `AudioNode` objects. At 120 BPM with 4 Euclidean lanes at 16th notes = ~32 triggers/sec = **160–320 AudioNode allocations/sec**, all becoming garbage. `Float32Array` for excite/grain buffers is also allocated per trigger in modal and particle modes.

---

## 4. engine.ts God Class (High)

**4,129 lines | ~85 private fields | 33 forwarding methods | 640-line applyParams()**

### Signal graph (no abstraction)

80+ `createGain()`, 30+ `createBiquadFilter()`, 100+ `.connect()` calls — all raw imperative code with no graph builder. The full graph includes:

- 6 pad voices (4 oscs + noise → 2 filters → EQ → saturation → ADSR → mixer)
- Lead path (FM synth → filter → ping-pong delay → reverb send)
- Drum path (7-voice DrumSynth → pool gains → voice bus → pre-fader → master)
- Looper path (6 source sends → worklet → 8-tap delay → reverb send)
- Granular worklet path
- Ocean worklet + sample path
- Global reverb worklet → master limiter → destination

### Top duplication patterns

| Pattern | Copies | Lines |
|---------|-------:|------:|
| **Euclidean schedulers** (synth vs looper) — 80% identical structure | 2 | ~550 total, ~400 shared |
| **Lead/pad chain creation** (createAudioGraph vs ensureSynthChain) | 2 | ~145 each |
| **Master/limiter chain** (ensureDrumSynth vs createAudioGraph vs ensureSynthChain) | 3 | ~40 each |
| **Callback triple-wiring** (setter + wireDrumSynthCallbacks + forwarding) | 15 callbacks × 3 | ~90 |
| **V1/V2/V3/V4 unrolling** in applyParams (13 arrays of 4 individually-named fields) | 13 | ~50 |
| **Null-teardown** (null 12 lead chain fields) | 3 | ~36 |

### applyParams() — the 640-line monolith

Lines 2700–3340 mix: pad LFO math, looper macro computation, delay tap updates, ocean params, reverb params, lead preset loading, saturation curve generation. Should be 8+ focused methods:

```
applyPadParams(), applyLeadParams(), applyLooperParams(), 
applyDrumParams(), applyReverbParams(), applyOceanParams(),
applyDelayParams(), applySaturation()
```

### Resource management concerns

| Issue | Severity |
|-------|----------|
| 8 looper delay vibrato oscillators never stopped on `stop()` | Medium |
| 8-tap delay nodes (delays + gains + panners) not disconnected on `stop()` | Medium |
| `sliderState` mutated in-place during pad morph override (race condition) | High |
| Ocean sample fetch has no AbortController | Low |
| Voice steal `setTimeout` IDs never tracked/cancelled on dispose | Medium |

---

## 5. Preset System Fragmentation (Medium-High)

### No centralized loader

The sequence `migratePreset()` → `normalizePresetForWeb()` → `{ ...DEFAULT_STATE, ...state }` → preserve `USER_PREFERENCE_KEYS` → `audioEngine.updateParams()` → `audioEngine.resetCofDrift()` → `applyDualRangesFromPreset()` appears in **10+ locations** across App.tsx:

- `handleLoadPresetFromList` (morph load path)
- `handleLoadPreset` (file import)
- Slot A dropdown onChange (inline JSX)
- Slot B dropdown onChange (inline JSX)
- `CloudPresets` onLoadPreset
- `handleJourneyLoadPreset`
- URL preset load on mount
- Three more conditional paths

Each copy is 15–25 lines. A single `applyPreset(raw, options?)` function would fix this.

### drumPresets.ts — 3,701 lines of inline data

Preset data hardcoded as TypeScript objects. The Lead4opFM presets are already externalized to JSON files in `public/presets/Lead4opFM/`. drumPresets should follow the same pattern.

### Backup files shipping in production

- `lead4opfm_backup_pre_digitone.ts` — 823 lines
- `lead4opfm_backup_pre_harmonics.ts` — 823 lines

1,646 lines of dead code that should be in version control history, not in the source tree.

---

## 6. Callback Registration Pattern (Medium)

**engine.ts has 15 `setXxxCallback()` methods**, each following:

```typescript
setFooCallback(cb: (args) => void) {
  this.onFoo = cb;
  if (this.drumSynth) this.drumSynth.onFoo = cb;
}
```

Then `wireDrumSynthCallbacks()` re-applies all 15 whenever DrumSynth is recreated. Every new callback requires edits in 3 places:

1. Add field `private onFoo`
2. Add `setFooCallback()` method  
3. Add line in `wireDrumSynthCallbacks()`

**Fix:** A single `callbacks: EngineCallbacks` object with one setter + one wiring method.

---

## 7. Prop Drilling (Medium)

No state management library. Pure prop drilling from `App.tsx`:

| Route | Props Passed |
|-------|------------:|
| App → SynthPage | 31 |
| App → DrumPage | 26 |
| App → LooperPage | 24 |
| App → SnowflakeUI | 16 |
| DrumPage → DrumPanel → VoiceCard → VoiceCardAdvanced | 4 levels deep |

8 props appear identically in every page component: `state`, `onParamChange`, `onSelectChange`, `sliderProps`, `SliderComponent`, `togglePanel`, `expandedPanels`, `isMobile`.

**Fix:** React Context for engine state + callbacks, or Zustand/Jotai store.

---

## 8. Console Logging (Low-Medium)

**109 `console.log`/`warn`/`error` statements** across src/:

| File | Count | Notable |
|------|------:|---------|
| App.tsx | ~35 | Morph debug logs in hot path |
| engine.ts | ~30 | Worklet loading, scheduling |
| DiamondJourneyUI.tsx | ~20 | Drag coordinates, connection events |
| SnowflakeUI.tsx | 1 | `console.log('windowSize:', windowSize)` |

Many are outright debug logs that should not ship.

---

## 9. Styling Inconsistency (Low-Medium)

- **609** `className=` usages
- **413** `style=` (inline) usages  
- **4,192 lines** of CSS across 3 files (drums.css, synth.css, looper.css)
- **~400 lines** of inline style objects in App.tsx
- `onMouseEnter`/`onMouseLeave` for hover effects instead of CSS `:hover`
- No CSS modules, no CSS-in-JS, no design tokens

---

## 10. DiamondJourneyUI.tsx (Observation)

**4,335 lines** — the second-largest file after App.tsx. Contains the journey mode diamond graph visualization with drag/connect/animate logic. Likely has its own internal duplication patterns but was not deeply audited since it's a specialized visualization component. Worth a focused audit if journey mode continues to grow.

---

## File Size Leaderboard

| Rank | File | Lines | Role |
|-----:|------|------:|------|
| 1 | src/App.tsx | 6,651 | God component |
| 2 | src/ui/DiamondJourneyUI.tsx | 4,335 | Journey diamond viz |
| 3 | src/audio/engine.ts | 4,129 | Audio engine god class |
| 4 | src/audio/drumPresets.ts | 3,701 | Drum preset data |
| 5 | src/audio/drumSynth.ts | 3,054 | Drum synthesis |
| 6 | src/ui/state.ts | 2,923 | SliderState + migration |
| 7 | src/ui/synth/SynthPage.tsx | 2,188 | Synth page UI |
| 8 | src/ui/SnowflakeUI.tsx | 1,464 | Snowflake viz |
| 9 | src/ui/looper/LooperPage.tsx | 1,274 | Looper page UI |
| 10 | src/audio/worklets/looper-fx.worklet.ts | 1,222 | Looper DSP worklet |
| | **Top 10 total** | **30,941** | **62% of codebase** |

---

## Consolidated Refactoring Roadmap

### Phase 1 — Extract & Deduplicate (no behavior change)

| Task | Files Touched | Lines Eliminated | Risk |
|------|--------------|----------------:|------|
| 1a. Create `applyPreset()` utility | App.tsx, new presetUtils.ts | ~120 | Low |
| 1b. Create `resolveMorph()` / `applyADEnvelope()` / `routeOutput()` helpers in drumSynth | drumSynth.ts | ~315 | Low |
| 1c. Extract `useMorphSystem()` hook | App.tsx, new hook file | ~800 | Medium |
| 1d. Extract `useRecording()` hook | App.tsx, new hook file | ~400 | Low |
| 1e. Unify Euclidean schedulers | engine.ts, new EuclideanScheduler.ts | ~400 | Medium |
| 1f. Delete backup files | lead4opfm_backup_*.ts | ~1,646 | None |

**Phase 1 total: ~3,680 lines eliminated, no behavior change**

### Phase 2 — Structural improvements

| Task | Files Touched | Impact |
|------|--------------|--------|
| 2a. Nested SliderState (DrumVoiceState, LooperVoiceState, EuclidLaneState) | state.ts, all consumers | Eliminates `as number` casts, enables loops over voices |
| 2b. React Context or lightweight store for engine state + callbacks | App.tsx, all page components | Eliminates prop drilling |
| 2c. Extract `applyParams()` into per-subsystem methods | engine.ts | Readability + testability |
| 2d. Externalize drumPresets.ts to JSON | drumPresets.ts, loader | Separates data from code |
| 2e. Consolidate callback registration (single callbacks object) | engine.ts, drumSynth.ts | Eliminates triple-wiring |

### Phase 3 — Performance & correctness

| Task | Impact |
|------|--------|
| 3a. Fix noise/membrane morph ordering inconsistency | Bug fix |
| 3b. Pre-allocate excite/grain buffers for modal/particle | Reduces GC pressure |
| 3c. Stop looper delay oscillators on engine stop | Resource leak |
| 3d. Remove 109 console.log statements | Bundle size, no prod logging |
| 3e. Replace ScriptProcessorNode with AudioWorkletNode for recording | Deprecated API |
| 3f. Cancel voice-steal timeouts on dispose | Memory safety |

---

## Key Metrics Summary

| Metric | Current | Healthy Target |
|--------|--------:|---------------:|
| Largest file (App.tsx) | 6,651 lines | < 1,000 |
| SliderState fields | ~667 | ~80 (nested) |
| useState in one component | 64 | < 10 |
| useRef in one component | 59 | < 10 |
| Type casts (`as number/string/any`) | 334 | < 20 |
| Console statements | 109 | 0 in production |
| Preset load code paths | 10+ | 1 |
| Dead code (backup files) | 1,646 lines | 0 |
| Duplicated lines (estimated) | ~2,500-3,000 | < 200 |
