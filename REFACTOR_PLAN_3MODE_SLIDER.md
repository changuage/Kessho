# Unified 3-Mode Slider Refactor Plan

> **Status**: Planning complete, implementation not started  
> **Created**: 2026-02-15  
> **Goal**: Replace 6 separate dual-mode systems with one unified 3-mode slider (single / walk / sampleHold)

---

## 1. THE PROBLEM

Currently there are **6 independent dual-mode implementations**, each with its own state, toggle handler, and runtime behavior:

| System | State Variable(s) | Mode Storage | Runtime | Persisted in Preset? |
|--------|-------------------|-------------|---------|---------------------|
| **Main sliders** | `dualSliderModes` (Set) + `dualSliderRanges` + `randomWalkPositions` + `randomWalkRef` | Set membership | Random walk (10Hz Brownian, App.tsx L1832-1892) | Yes, in `dualRanges` |
| **Drum morph** | Same Set, filtered by `drumMorphKeys` | Same Set + hardcoded filter | Per-trigger S&H (drumSynth.ts per-voice) | Yes, in `dualRanges` |
| **Expression** | `expressionDualModes` (3 bools) + `leadExpressionPositions` | Separate object | Per-trigger S&H (engine.ts L1927-1949) | No (uses `*Min/*Max` in state) |
| **Delay** | `delayDualModes` (3 bools) + `leadDelayPositions` | Separate object | Per-trigger S&H (engine.ts L1955-1974) | No (uses `*Min/*Max` in state) |
| **Ocean** | `oceanDualModes` (4 bools) + `oceanPositions` | Separate object | Random walk (ocean worklet) | No (uses `*Min/*Max` in state) |
| **Lead morph** | `leadMorphDualModes` (2 bools) + `leadMorphPositions` | Separate object | Per-trigger S&H or auto-walk (engine.ts L1145-1200) | No (uses `*Min/*Max` in state) |

**Problems**:
- ~180 lines of duplicate toggle logic across 6 handlers
- Dual-mode restore blocks duplicated **7×** across preset load paths (L2346, L3199, L3280, L3911, L4019, L4937, L5128)
- Mode (walk vs S&H) is **hardcoded per parameter group** — users can't choose
- Expression/delay/ocean/lead morph use `*Min/*Max` fields in `SliderState` instead of `dualSliderRanges`, creating two parallel systems

---

## 2. THE SOLUTION

### 2.1 New Type: `SliderMode`

```typescript
// In src/ui/state.ts or a new src/audio/sliderModes.ts
type SliderMode = 'single' | 'walk' | 'sampleHold';
```

### 2.2 New Unified State (replaces 6 variables → 1)

```typescript
// Replaces: dualSliderModes, expressionDualModes, delayDualModes,
//           oceanDualModes, leadMorphDualModes, drumMorphKeys filter
const [sliderModes, setSliderModes] = useState<Partial<Record<keyof SliderState, SliderMode>>>({});
```

A key absent from `sliderModes` = `'single'` mode.  
`dualSliderRanges` stays as-is — it stores the `{min, max}` for any key in walk or sampleHold mode.

### 2.3 DualSlider Component Changes

```typescript
// OLD
interface DualSliderProps {
  isDualMode: boolean;
  walkPosition?: number;
  onToggleDual: (key) => void;
  // ...
}

// NEW
interface DualSliderProps {
  mode: SliderMode;              // 'single' | 'walk' | 'sampleHold'
  walkPosition?: number;         // Position indicator (0-1) for both walk and S&H
  onCycleMode: (key) => void;    // double-click/long-press cycles modes
  // ...
}
```

**Visual distinction**:
- `single` → standard blue slider (unchanged)
- `walk` → blue range track + blue thumbs + white moving dot (unchanged from current)
- `sampleHold` → **amber/gold range track** + amber thumbs + amber pulsing dot
  - Track: `rgba(212, 165, 32, 0.4)` (from app palette `#D4A520` mustard gold)
  - Thumbs: `#D4A520`
  - Indicator dot: `#D4A520` with `boxShadow: '0 0 8px rgba(212, 165, 32, 0.8)'`
  - Mode label: `⤳ s&h` instead of `⟷ range`

**Mode cycling**: double-click / long-press cycles `single → walk → sampleHold → single`

---

## 3. OPTION A: FULL MIGRATION (CHOSEN)

Move **all** `*Min/*Max` range fields out of `SliderState` and into `dualSliderRanges`. This eliminates the parallel systems.

### 3.1 Fields to Migrate OUT of SliderState

These `*Min/*Max` pairs currently live as separate fields in `SliderState` (state.ts). They will be **removed** from `SliderState` and stored in `dualSliderRanges` + `sliderModes` instead:

#### Group A: Expression (3 pairs → 3 virtual keys)
| Old Min Field | Old Max Field | New `dualSliderRanges` key | Default Mode |
|--------------|--------------|---------------------------|-------------|
| `leadVibratoDepthMin` | `leadVibratoDepthMax` | `leadVibratoDepth` (NEW virtual key) | `sampleHold` |
| `leadVibratoRateMin` | `leadVibratoRateMax` | `leadVibratoRate` (NEW virtual key) | `sampleHold` |
| `leadGlideMin` | `leadGlideMax` | `leadGlide` (NEW virtual key) | `sampleHold` |

#### Group B: Delay (3 pairs → 3 virtual keys)
| Old Min Field | Old Max Field | New `dualSliderRanges` key | Default Mode |
|--------------|--------------|---------------------------|-------------|
| `leadDelayTimeMin` | `leadDelayTimeMax` | `leadDelayTime` (NEW virtual key) | `sampleHold` |
| `leadDelayFeedbackMin` | `leadDelayFeedbackMax` | `leadDelayFeedback` (NEW virtual key) | `sampleHold` |
| `leadDelayMixMin` | `leadDelayMixMax` | `leadDelayMix` (NEW virtual key) | `sampleHold` |

#### Group C: Ocean (4 pairs → 4 virtual keys)
| Old Min Field | Old Max Field | New `dualSliderRanges` key | Default Mode |
|--------------|--------------|---------------------------|-------------|
| `oceanDurationMin` | `oceanDurationMax` | `oceanDuration` (NEW virtual key) | `walk` |
| `oceanIntervalMin` | `oceanIntervalMax` | `oceanInterval` (NEW virtual key) | `walk` |
| `oceanFoamMin` | `oceanFoamMax` | `oceanFoam` (NEW virtual key) | `walk` |
| `oceanDepthMin` | `oceanDepthMax` | `oceanDepth` (NEW virtual key) | `walk` |

#### Group D: Lead Morph (2 pairs → 2 virtual keys)
| Old Min Field | Old Max Field | New `dualSliderRanges` key | Default Mode |
|--------------|--------------|---------------------------|-------------|
| `lead1MorphMin` | `lead1MorphMax` | `lead1Morph` (use existing key) | `sampleHold` |
| `lead2MorphMin` | `lead2MorphMax` | `lead2Morph` (use existing key) | `sampleHold` |

**Note**: `lead1Morph`/`lead2Morph` don't exist in `SliderState` currently — we need to add them as single-value keys (the "current value" when in single mode).

#### Group E: Legacy Timbre (can also migrate)
| Old Min Field | Old Max Field | New key | Default Mode |
|--------------|--------------|---------|-------------|
| `leadTimbreMin` | `leadTimbreMax` | `leadTimbre` | `sampleHold` |

**Total**: 15 pairs → 15 unified keys

### 3.2 New SliderState Fields (to replace removed pairs)

Add single-value versions to `SliderState` for each migrated parameter:

```typescript
// These replace the *Min/*Max pairs
leadVibratoDepth: number;    // 0..1 (single value; range stored in dualSliderRanges)
leadVibratoRate: number;     // 0..1
leadGlide: number;           // 0..1
leadDelayTime: number;       // 0..1000 ms
leadDelayFeedback: number;   // 0..0.8
leadDelayMix: number;        // 0..1
oceanDuration: number;       // 2..15 s
oceanInterval: number;       // 3..20 s
oceanFoam: number;           // 0..1
oceanDepth: number;          // 0..1
lead1Morph: number;          // 0..1 (replaces lead1MorphMin when single)
lead2Morph: number;          // 0..1 (replaces lead2MorphMin when single)
leadTimbre: number;          // 0..1
```

### 3.3 Changes to `SliderState` in state.ts

**Remove these fields** (30 fields):
```
leadDelayTimeMin, leadDelayTimeMax
leadDelayFeedbackMin, leadDelayFeedbackMax
leadDelayMixMin, leadDelayMixMax
leadVibratoDepthMin, leadVibratoDepthMax
leadVibratoRateMin, leadVibratoRateMax
leadGlideMin, leadGlideMax
oceanDurationMin, oceanDurationMax
oceanIntervalMin, oceanIntervalMax
oceanFoamMin, oceanFoamMax
oceanDepthMin, oceanDepthMax
lead1MorphMin, lead1MorphMax
lead2MorphMin, lead2MorphMax
leadTimbreMin, leadTimbreMax
```

**Add these fields** (13 fields):
```
leadVibratoDepth, leadVibratoRate, leadGlide
leadDelayTime, leadDelayFeedback, leadDelayMix
oceanDuration, oceanInterval, oceanFoam, oceanDepth
lead1Morph, lead2Morph
leadTimbre
```

**Also update**: `DEFAULT_STATE`, `STATE_KEYS`, `QUANTIZATION` table.

---

## 4. ENGINE CHANGES

### 4.1 engine.ts — Reading Min/Max for Per-Trigger Sampling

The engine currently reads `this.sliderState.leadVibratoDepthMin` etc. directly. After migration, the engine needs to know the range. Two approaches:

**Approach (chosen): Pass ranges to engine via a new method**

```typescript
// In engine.ts
private dualRanges: Partial<Record<string, { min: number; max: number }>> = {};

setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>) {
  this.dualRanges = ranges;
}
```

Then in `playLeadNote()`:
```typescript
// OLD:
const vibratoDepthMin = this.sliderState.leadVibratoDepthMin;
const vibratoDepthMax = this.sliderState.leadVibratoDepthMax;

// NEW:
const range = this.dualRanges['leadVibratoDepth'];
const vibratoDepthMin = range ? range.min : (this.sliderState?.leadVibratoDepth ?? 0);
const vibratoDepthMax = range ? range.max : (this.sliderState?.leadVibratoDepth ?? 0);
```

Same pattern for delay and lead morph.

### 4.2 engine.ts — Ocean Worklet Parameters

```typescript
// OLD:
setParam('waveDurationMin', state.oceanDurationMin);
setParam('waveDurationMax', state.oceanDurationMax);

// NEW: read from dualRanges
const durRange = this.dualRanges['oceanDuration'];
setParam('waveDurationMin', durRange ? durRange.min : state.oceanDuration);
setParam('waveDurationMax', durRange ? durRange.max : state.oceanDuration);
```

### 4.3 engine.ts — Lead Morph Walk

The engine's `startLeadMorphRandomWalk()` currently reads `lead1MorphMin`/`lead1MorphMax`. After migration:

```typescript
// OLD:
const rawMorphMin = useLead2 ? this.sliderState!.lead2MorphMin : this.sliderState!.lead1MorphMin;
const rawMorphMax = useLead2 ? this.sliderState!.lead2MorphMax : this.sliderState!.lead1MorphMax;

// NEW:
const morphKey = useLead2 ? 'lead2Morph' : 'lead1Morph';
const morphRange = this.dualRanges[morphKey];
const rawMorphMin = morphRange ? morphRange.min : (this.sliderState![morphKey] ?? 0);
const rawMorphMax = morphRange ? morphRange.max : (this.sliderState![morphKey] ?? 0);
```

---

## 5. PRESET MIGRATION

### 5.1 New Preset Format

```json
{
  "name": "My Preset",
  "timestamp": "...",
  "state": {
    "leadVibratoDepth": 0.3,
    "leadDelayTime": 375,
    "oceanDuration": 7,
    "lead1Morph": 0.5,
    ...
  },
  "dualRanges": {
    "leadLevel": { "min": 0, "max": 0.38 },
    "leadVibratoDepth": { "min": 0.1, "max": 0.6 },
    "oceanDuration": { "min": 4, "max": 10 }
  },
  "sliderModes": {
    "leadLevel": "walk",
    "leadVibratoDepth": "sampleHold",
    "oceanDuration": "walk",
    "drumSubMorph": "sampleHold"
  }
}
```

### 5.2 Migration Function (for old presets)

```typescript
function migratePreset(preset: any): SavedPreset {
  const state = { ...preset.state };
  const dualRanges = { ...(preset.dualRanges || {}) };
  const sliderModes: Record<string, SliderMode> = { ...(preset.sliderModes || {}) };

  // --- Migrate *Min/*Max pairs → single value + dualRanges ---
  const MIGRATION_MAP: Array<{
    minKey: string; maxKey: string;
    newKey: string; defaultMode: SliderMode;
    threshold: number;
  }> = [
    { minKey: 'leadVibratoDepthMin', maxKey: 'leadVibratoDepthMax', newKey: 'leadVibratoDepth', defaultMode: 'sampleHold', threshold: 0.001 },
    { minKey: 'leadVibratoRateMin', maxKey: 'leadVibratoRateMax', newKey: 'leadVibratoRate', defaultMode: 'sampleHold', threshold: 0.001 },
    { minKey: 'leadGlideMin', maxKey: 'leadGlideMax', newKey: 'leadGlide', defaultMode: 'sampleHold', threshold: 0.001 },
    { minKey: 'leadDelayTimeMin', maxKey: 'leadDelayTimeMax', newKey: 'leadDelayTime', defaultMode: 'sampleHold', threshold: 0.1 },
    { minKey: 'leadDelayFeedbackMin', maxKey: 'leadDelayFeedbackMax', newKey: 'leadDelayFeedback', defaultMode: 'sampleHold', threshold: 0.001 },
    { minKey: 'leadDelayMixMin', maxKey: 'leadDelayMixMax', newKey: 'leadDelayMix', defaultMode: 'sampleHold', threshold: 0.001 },
    { minKey: 'oceanDurationMin', maxKey: 'oceanDurationMax', newKey: 'oceanDuration', defaultMode: 'walk', threshold: 0.01 },
    { minKey: 'oceanIntervalMin', maxKey: 'oceanIntervalMax', newKey: 'oceanInterval', defaultMode: 'walk', threshold: 0.01 },
    { minKey: 'oceanFoamMin', maxKey: 'oceanFoamMax', newKey: 'oceanFoam', defaultMode: 'walk', threshold: 0.001 },
    { minKey: 'oceanDepthMin', maxKey: 'oceanDepthMax', newKey: 'oceanDepth', defaultMode: 'walk', threshold: 0.001 },
    { minKey: 'lead1MorphMin', maxKey: 'lead1MorphMax', newKey: 'lead1Morph', defaultMode: 'sampleHold', threshold: 0.0001 },
    { minKey: 'lead2MorphMin', maxKey: 'lead2MorphMax', newKey: 'lead2Morph', defaultMode: 'sampleHold', threshold: 0.0001 },
    { minKey: 'leadTimbreMin', maxKey: 'leadTimbreMax', newKey: 'leadTimbre', defaultMode: 'sampleHold', threshold: 0.001 },
  ];

  for (const { minKey, maxKey, newKey, defaultMode, threshold } of MIGRATION_MAP) {
    if (minKey in state) {
      const min = state[minKey];
      const max = state[maxKey] ?? min;
      const isDual = Math.abs(max - min) > threshold;

      // Set single value to midpoint (or min if single)
      state[newKey] = isDual ? (min + max) / 2 : min;

      if (isDual) {
        dualRanges[newKey] = { min, max };
        sliderModes[newKey] = defaultMode;
      }

      delete state[minKey];
      delete state[maxKey];
    }
  }

  // --- Infer modes for existing dualRanges keys (pre-migration format) ---
  if (!preset.sliderModes) {
    const DRUM_MORPH_KEYS = new Set([
      'drumSubMorph', 'drumKickMorph', 'drumClickMorph',
      'drumBeepHiMorph', 'drumBeepLoMorph', 'drumNoiseMorph'
    ]);
    for (const key of Object.keys(dualRanges)) {
      if (!(key in sliderModes)) {
        sliderModes[key] = DRUM_MORPH_KEYS.has(key) ? 'sampleHold' : 'walk';
      }
    }
  }

  return {
    name: preset.name,
    timestamp: preset.timestamp,
    state,
    dualRanges: Object.keys(dualRanges).length > 0 ? dualRanges : undefined,
    sliderModes: Object.keys(sliderModes).length > 0 ? sliderModes : undefined,
  };
}
```

### 5.3 Existing Preset Files to Migrate

These JSON files need to be updated:

1. **`public/presets/Static_frequencies.json`** — has `dualRanges` + `*Min/*Max` state fields
2. **`public/presets/ZoneOut1.json`** — has `dualRanges` + `*Min/*Max` state fields
3. **`public/presets/StringWavesR.json`** — has `dualRanges` + `*Min/*Max` state fields
4. **`public/presets/Gamelantest.json`** — has `*Min/*Max` state fields (different format: nested `state.state`)
5. **`public/presets/Lasers.json`** — check for `*Min/*Max` fields

**Approach**: Run migration function on all preset JSONs and overwrite them. Also apply `migratePreset()` at runtime when loading any preset (for user-saved presets in localStorage/Supabase).

---

## 6. APP.TSX CHANGES — DETAILED

### 6.1 State Variables to DELETE

```typescript
// DELETE these (6 state variables + refs):
const [expressionDualModes, setExpressionDualModes] = useState<{...}>(...);       // L1451
const [leadMorphDualModes, setLeadMorphDualModes] = useState<{...}>(...);         // L1458
const [leadMorphPositions, setLeadMorphPositions] = useState<{...}>(...);         // L1463
const [delayDualModes, setDelayDualModes] = useState<{...}>(...);                // L1530
const [leadDelayPositions, setLeadDelayPositions] = useState<{...}>(...);         // L1537
const [oceanDualModes, setOceanDualModes] = useState<{...}>(...);                // L1566
const [oceanPositions, setOceanPositions] = useState<{...}>(...);                // L1579
const [leadExpressionPositions, setLeadExpressionPositions] = useState<{...}>(..);// L1432
const leadMorphLongPressTimerRef = useRef<number | null>(null);                   // L1492

// KEEP but modify:
const [dualSliderModes, setDualSliderModes] = ...    → RENAME to sliderModes: Partial<Record<keyof SliderState, SliderMode>>
const [dualSliderRanges, setDualSliderRanges] = ...  → KEEP (now stores ALL ranges including migrated ones)
const [randomWalkPositions, setRandomWalkPositions] = ... → KEEP (now also stores walk positions for ocean)
const randomWalkRef = useRef<RandomWalkStates>(...)       → KEEP
```

### 6.2 Toggle Handlers to DELETE (replaced by one `handleCycleSliderMode`)

```typescript
// DELETE these 6 handlers:
toggleLeadMorphDualMode          // L1470-1488
startLeadMorphLongPress          // L1492-1500
cancelLeadMorphLongPress         // L1501-1505
toggleExpressionDualMode         // L1509-1527
toggleDelayDualMode              // L1544-1562
toggleOceanDualMode              // L1592-1613
```

### 6.3 New Unified Toggle Handler

```typescript
const handleCycleSliderMode = useCallback((key: keyof SliderState) => {
  if (isJourneyPlaying) return;

  setSliderModes(prev => {
    const current = prev[key] || 'single';
    const next: SliderMode =
      current === 'single' ? 'walk' :
      current === 'walk' ? 'sampleHold' : 'single';

    if (next === 'single') {
      // Collapsing to single: set value to midpoint of range
      const range = dualSliderRanges[key];
      if (range) {
        const mid = (range.min + range.max) / 2;
        setState(s => ({ ...s, [key]: quantize(key, mid) }));
        setDualSliderRanges(r => { const { [key]: _, ...rest } = r; return rest; });
      }
      // Remove walk state
      setRandomWalkPositions(p => { const { [key]: _, ...rest } = p; return rest; });
      delete randomWalkRef.current[key];

      const { [key]: _, ...rest } = prev;
      return rest;
    }

    // Entering walk or sampleHold: initialize range from current value ± spread
    if (!dualSliderRanges[key]) {
      const info = getParamInfo(key);
      const val = state[key] as number;
      const spread = info ? (info.max - info.min) * 0.1 : 0.05;
      const min = info ? Math.max(info.min, val - spread) : val;
      const max = info ? Math.min(info.max, val + spread) : val;
      setDualSliderRanges(r => ({ ...r, [key]: { min, max } }));
    }

    if (next === 'walk') {
      // Init walk state
      const pos = Math.random();
      setRandomWalkPositions(p => ({ ...p, [key]: pos }));
      randomWalkRef.current[key] = { position: pos, velocity: (Math.random() - 0.5) * 0.02 };
    }

    // Handle endpoint save (Rule 2) — same as existing handleToggleDualMode
    // ... (preserve existing morph preset save logic)

    return { ...prev, [key]: next };
  });
}, [isJourneyPlaying, state, dualSliderRanges, ...]);
```

### 6.4 Random Walk useEffect Changes

```typescript
// OLD: filter by !drumMorphKeys.has(key)
const walkKeys = Array.from(dualSliderModes).filter(key => !drumMorphKeys.has(key));

// NEW: filter by mode === 'walk'
const walkKeys = Object.entries(sliderModes)
  .filter(([_, mode]) => mode === 'walk')
  .map(([key]) => key as keyof SliderState);
```

### 6.5 DualSlider Component `sliderProps` Helper

```typescript
// OLD:
const sliderProps = useCallback((paramKey: keyof SliderState) => {
  let walkPos = randomWalkPositions[paramKey];
  if (drumMorphKeys.has(paramKey)) {
    walkPos = drumMorphPositions[voice];
  }
  return {
    isDualMode: dualSliderModes.has(paramKey),
    dualRange: dualSliderRanges[paramKey],
    walkPosition: walkPos,
    onToggleDual: handleToggleDualMode,
    onDualRangeChange: handleDualRangeChange,
  };
}, [...]);

// NEW:
const sliderProps = useCallback((paramKey: keyof SliderState) => {
  const mode = sliderModes[paramKey] || 'single';
  // For S&H keys, walkPosition stores the last triggered position (0-1)
  const walkPos = randomWalkPositions[paramKey];
  return {
    mode,
    dualRange: dualSliderRanges[paramKey],
    walkPosition: walkPos,
    onCycleMode: handleCycleSliderMode,
    onDualRangeChange: handleDualRangeChange,
  };
}, [sliderModes, dualSliderRanges, randomWalkPositions, handleCycleSliderMode, handleDualRangeChange]);
```

### 6.6 Inline Dual-Range Renderers to Replace

These are hand-coded dual-range slider UIs that become `<DualSlider>` components:

| Location (approx. lines) | UI | Currently renders |
|--------------------------|-----|-------------------|
| L6586-6670 | Lead 1 Morph | Custom dual slider with A/B presets |
| L6946-7043 | Lead 2 Morph | Custom dual slider with C/D presets |
| L7262-7335 | Vibrato Depth | Inline expression dual slider |
| L7355-7430 | Vibrato Rate | Inline expression dual slider |
| L7445-7520 | Glide | Inline expression dual slider |
| L7555-7630 | Delay Time | Inline delay dual slider |
| L7645-7720 | Delay Feedback | Inline delay dual slider |
| L7740-7815 | Delay Mix | Inline delay dual slider |
| L8483-8565 | Ocean Duration | Inline ocean dual slider |
| L8580-8660 | Ocean Interval | Inline ocean dual slider |
| L8660-8740 | Ocean Foam | Inline ocean dual slider |
| L8740-8820 | Ocean Depth | Inline ocean dual slider |

Each becomes a `<DualSlider>` with the unified props.

### 6.7 Dual-Mode Restore Blocks to Consolidate

These 7 nearly-identical blocks each call `setOceanDualModes()`, `setExpressionDualModes()`, `setDelayDualModes()` — all replaced by one helper:

```typescript
function restoreSliderModesFromState(newState: SliderState, dualRanges: DualSliderState): Partial<Record<keyof SliderState, SliderMode>> {
  const modes: Partial<Record<keyof SliderState, SliderMode>> = {};
  
  // From dualRanges (main sliders + drum morph)
  for (const key of Object.keys(dualRanges)) {
    // Infer mode from key or use stored mode
    modes[key as keyof SliderState] = DRUM_MORPH_KEYS.has(key) ? 'sampleHold' : 'walk';
  }
  
  // From migrated fields — if range exists in dualSliderRanges for the new key, set its mode
  // (will be set by sliderModes in new preset format)
  
  return modes;
}
```

Lines to modify: ~L2346, ~L3199, ~L3280, ~L3911, ~L4019, ~L4937, ~L5128

### 6.8 `lerpPresets` Changes

The `parentChildMap` references old `*Min/*Max` keys. Update to new single-value keys:

```typescript
// OLD:
leadEnabled: [
  'leadDelayTimeMin', 'leadDelayTimeMax', 'leadDelayFeedbackMin', 'leadDelayFeedbackMax',
  'leadDelayMixMin', 'leadDelayMixMax', ...
  'leadVibratoDepthMin', 'leadVibratoDepthMax', ...
]

// NEW:
leadEnabled: [
  'leadDelayTime', 'leadDelayFeedback', 'leadDelayMix', ...
  'leadVibratoDepth', 'leadVibratoRate', 'leadGlide', ...
]
```

And the dual-range interpolation in `lerpPresets` now also covers the migrated keys since they'll be in `dualRanges`.

---

## 7. ENGINE CALLBACK CHANGES

### 7.1 Expression/Delay/Morph S&H Indicators

Currently the engine fires callbacks like `onLeadExpressionTrigger` which update `leadExpressionPositions`. After migration, these should update `randomWalkPositions` for the corresponding keys:

```typescript
// OLD:
audioEngine.setLeadExpressionCallback(setLeadExpressionPositions);

// NEW:
audioEngine.setLeadExpressionCallback((positions) => {
  setRandomWalkPositions(prev => ({
    ...prev,
    leadVibratoDepth: positions.vibratoDepth,
    leadVibratoRate: positions.vibratoRate,
    leadGlide: positions.glide,
  }));
});
```

Same for delay:
```typescript
audioEngine.setLeadDelayCallback((positions) => {
  setRandomWalkPositions(prev => ({
    ...prev,
    leadDelayTime: positions.time,
    leadDelayFeedback: positions.feedback,
    leadDelayMix: positions.mix,
  }));
});
```

And drum morph:
```typescript
// drumMorphPositions → randomWalkPositions
audioEngine.setDrumMorphCallback((voice, position) => {
  const key = DRUM_VOICE_TO_KEY[voice];
  setRandomWalkPositions(prev => ({ ...prev, [key]: position }));
});
```

And lead morph:
```typescript
audioEngine.setLeadMorphCallback((positions) => {
  if (positions.lead1 >= 0) setRandomWalkPositions(prev => ({ ...prev, lead1Morph: positions.lead1 }));
  if (positions.lead2 >= 0) setRandomWalkPositions(prev => ({ ...prev, lead2Morph: positions.lead2 }));
});
```

---

## 8. PASS DUAL RANGES TO ENGINE

Add a `useEffect` that sends current `dualSliderRanges` to the engine whenever they change:

```typescript
useEffect(() => {
  audioEngine.setDualRanges(dualSliderRanges);
}, [dualSliderRanges]);
```

This replaces the separate `useEffect` that currently calls `audioEngine.setDrumMorphRange()` per voice.

---

## 9. VISUAL DESIGN — COLOR SCHEME

### Walk Mode (blue — unchanged)
- Track background: `rgba(165, 196, 212, 0.4)` (`#a5c4d4`)
- Thumbs: `#a5c4d4` (active: `#fff`)
- Walk indicator dot: `#fff` with `boxShadow: '0 0 8px rgba(255,255,255,0.8)'`
- Mode label: `⟷ range`

### Sample & Hold Mode (amber/gold — NEW)
- Track background: `rgba(212, 165, 32, 0.4)` (`#D4A520` mustard gold from app palette)
- Thumbs: `#D4A520` (active: `#fff`)
- S&H indicator dot: `#D4A520` with `boxShadow: '0 0 8px rgba(212, 165, 32, 0.8)'`
- Mode label: `⤳ s&h`

### Palette Reference (from App.tsx L1178-1181)
```
#E8DCC4 warm cream
#C4724E muted orange
#7B9A6D sage green
#D4A520 mustard gold  ← USING THIS
#8B5CF6 purple
#5A7B8A slate blue
#3C7181 teal
#C1930A gold accent
```

---

## 10. IMPLEMENTATION ORDER

### Phase 1: Foundation (no visible change yet)
- [ ] **1a.** Add `SliderMode` type and migration function to `src/ui/state.ts`
- [ ] **1b.** Add new single-value fields to `SliderState` interface + `DEFAULT_STATE` + `QUANTIZATION`
- [ ] **1c.** Keep old `*Min/*Max` fields temporarily (dual existence) for compilation
- [ ] **1d.** Add `sliderModes` field to `SavedPreset` interface (optional, for backward compat)
- [ ] **1e.** Add `setDualRanges()` method to engine

### Phase 2: Engine Plumbing
- [ ] **2a.** Wire engine to read from `dualRanges` object instead of `*Min/*Max` state fields
- [ ] **2b.** Update ocean worklet parameter passing
- [ ] **2c.** Update lead morph `playLeadNote()` to read from ranges
- [ ] **2d.** Add `useEffect` in App.tsx to pass `dualSliderRanges` to engine

### Phase 3: Unified State
- [ ] **3a.** Replace 6 mode state vars with single `sliderModes` state
- [ ] **3b.** Write `handleCycleSliderMode` 
- [ ] **3c.** Update `sliderProps` helper
- [ ] **3d.** Reroute engine callbacks to write into `randomWalkPositions`

### Phase 4: DualSlider Component
- [ ] **4a.** Add `mode: SliderMode` prop, replace `isDualMode: boolean`
- [ ] **4b.** Add S&H visual variant (amber/gold colors)
- [ ] **4c.** Mode cycling on double-click/long-press (3-way instead of toggle)

### Phase 5: UI Migration
- [ ] **5a.** Replace inline expression dual-range sliders with `<DualSlider>`
- [ ] **5b.** Replace inline delay dual-range sliders with `<DualSlider>`
- [ ] **5c.** Replace inline ocean dual-range sliders with `<DualSlider>`
- [ ] **5d.** Replace inline lead morph dual-range sliders with `<DualSlider>`
- [ ] **5e.** Consolidate 7× dual-mode restore blocks into helper function

### Phase 6: Cleanup
- [ ] **6a.** Remove old `*Min/*Max` fields from `SliderState`
- [ ] **6b.** Remove old `STATE_KEYS` entries and `QUANTIZATION` entries for removed fields
- [ ] **6c.** Remove old state variables and handlers (6 mode vars, 6 toggle handlers, position states)
- [ ] **6d.** Update `parentChildMap` in `lerpPresets` to use new key names
- [ ] **6e.** Remove `drumMorphKeys` hardcoded Set (now inferred from `sliderModes`)

### Phase 7: Preset Migration
- [ ] **7a.** Migrate all 5 preset JSON files in `public/presets/`
- [ ] **7b.** Add runtime migration in preset load paths (file load, cloud load, URL decode)
- [ ] **7c.** Update `update-presets.cjs` script if it touches these fields

### Phase 8: Testing
- [ ] **8a.** Verify all 5 shipped presets load correctly
- [ ] **8b.** Test mode cycling for each slider type (main, drum, expression, delay, ocean, lead morph)
- [ ] **8c.** Test morph interpolation between presets with different modes
- [ ] **8d.** Test preset save → load round-trip with new format
- [ ] **8e.** Test old-format preset loading (migration path)
- [ ] **8f.** Verify engine audio output unchanged for all parameter types

---

## 11. FILES TOUCHED

| File | Changes |
|------|---------|
| `src/ui/state.ts` | SliderState interface, DEFAULT_STATE, STATE_KEYS, QUANTIZATION, SavedPreset, SliderMode type, migration fn |
| `src/App.tsx` | All 6 mode states → 1, all 6 toggle handlers → 1, DualSlider component, sliderProps, random walk useEffect, lerpPresets, 7× restore blocks, engine callbacks, 12× inline dual sliders |
| `src/audio/engine.ts` | `setDualRanges()`, read ranges in playLeadNote(), ocean worklet params, lead morph walk |
| `src/audio/drumSynth.ts` | Possibly unchanged if engine passes ranges through existing `setDrumMorphRange` |
| `src/audio/drumMorph.ts` | Minor: mode info if needed |
| `src/audio/morphUtils.ts` | Possibly add SliderMode-aware interpolation |
| `public/presets/*.json` | All 5 preset files migrated to new format |

---

## 12. RISK ASSESSMENT

| Risk | Mitigation |
|------|-----------|
| Breaking existing user-saved presets (localStorage) | Runtime migration function runs on every preset load |
| Breaking cloud presets (Supabase) | Same migration function |
| Audio behavior change (walk where S&H was, or vice versa) | Migration preserves original mode per key group |
| Lead morph auto-walk vs S&H logic in engine | Careful: lead morph has BOTH modes depending on `lead1MorphAuto`. The unified system needs to respect this existing toggle |
| Ocean worklet expects min/max params | Engine adapter layer converts ranges to worklet params |
| 11,000-line App.tsx — merge conflicts | Work in small, testable phases |

---

## 13. ESTIMATED LINE IMPACT

| Category | Lines Removed | Lines Added | Net |
|----------|--------------|-------------|-----|
| State declarations | ~60 | ~15 | -45 |
| Toggle handlers | ~180 | ~40 | -140 |
| Restore blocks (7×) | ~140 | ~20 | -120 |
| Inline dual sliders (12×) | ~960 | ~120 | -840 |
| DualSlider component | ~30 (modify) | ~50 | +20 |
| Engine adapter | 0 | ~40 | +40 |
| Migration function | 0 | ~60 | +60 |
| **TOTAL** | **~1370** | **~345** | **~-1025** |

Estimated net reduction: **~1,000 lines** from App.tsx alone.
