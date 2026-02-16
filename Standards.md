# Kessho Code Standards

## Morph Endpoint Detection

**Rule:** All morph slider endpoint checks MUST use the shared helpers from `src/audio/morphUtils.ts`. Never use inline threshold comparisons or raw `=== 0` / `=== 100` checks.

### Shared Helpers

```typescript
import { isAtEndpoint0, isAtEndpoint1, isInMidMorph, getEndpoint } from './audio/morphUtils';
```

| Helper | Returns `true` when |
|---|---|
| `isAtEndpoint0(position)` | `position === 0` (0-1 scale) |
| `isAtEndpoint0(position, true)` | `position === 0` (0-100 scale) |
| `isAtEndpoint1(position)` | `position === 1` (0-1 scale) |
| `isAtEndpoint1(position, true)` | `position === 100` (0-100 scale) |
| `isInMidMorph(position, scale100?)` | Not at either endpoint |
| `getEndpoint(position, scale100?)` | `0`, `1`, or `null` |

### Usage

**Main morph** (0-100 scale) — always pass `true` as the second argument:

```typescript
// ✅ Correct
if (isAtEndpoint0(morphPosition, true)) { /* at preset A */ }
if (isAtEndpoint1(morphPosition, true)) { /* at preset B */ }
const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);

// ❌ Wrong — inline checks
if (morphPosition === 0) { ... }
if (morphPosition <= 1) { ... }
if (morphPosition >= 99) { ... }
```

**Drum morph** (0-1 scale) — omit the second argument (defaults to `false`):

```typescript
// ✅ Correct
if (isAtEndpoint0(drumMorphPosition)) { /* at drum preset A */ }
if (isAtEndpoint1(drumMorphPosition)) { /* at drum preset B */ }

// ❌ Wrong — inline tolerance checks
const isAtEndpoint0 = drumMorphPosition < 0.001;  // shadows import!
const atEnd = currentMorph > 0.99;
```

### Why Exact Match

All morph sliders produce integer values (main morph: 0-100) or clean float values (drum morph: stepped 0-1). Tolerance-based checks (`< 0.001`, `> 0.999`, `<= 1`, `>= 99`) are unnecessary and create inconsistency. Exact match (`=== 0`, `=== 100`, `=== 1`) is correct and simple.

### Where This Applies

- `handleSliderChange` — morph preset endpoint updates (Rule 2)
- `handleDualModeToggle` — dual range override capture at endpoints
- `handleDualRangeChange` — dual range override capture at endpoints
- `handleMorphSliderChange` — endpoint tracking, CoF viz, override clearing
- `lerpPresets` — engine toggle snap behavior at endpoints
- Journey mode morph animation — CoF viz clearing at endpoints
- Drum morph `handleSliderChange` — mid-morph override clearing, preset reset logic
- UI display labels — "Full A" / "Full B" text
---

## Slider System — Unified 3-Mode Pattern

**Every numeric slider** in the app MUST use the unified `Slider` → `DualSlider` pipeline. Never create one-off slider markup or manage dual-range state outside the standard system.

### Required Pattern (JSX)

```tsx
<Slider
  label="Ocean Duration"
  value={state.oceanDuration}
  paramKey="oceanDuration"
  unit="s"
  onChange={handleSliderChange}
  {...sliderProps('oceanDuration')}
/>
```

**Rules:**
1. Always spread `{...sliderProps('paramKey')}` — this injects `mode`, `dualRange`, `walkPosition`, `onCycleMode`, and `onDualRangeChange`
2. Never pass `onCycleMode` or `onDualRangeChange` manually — `sliderProps()` handles it
3. Never create inline dual-slider JSX — the `Slider` wrapper delegates to `DualSlider` automatically
4. Use `logarithmic={true}` for frequency/time parameters that need log scaling

### SliderProps Interface

```typescript
interface SliderProps {
  label: string;                                              // Display label
  value: number;                                              // Current state value
  paramKey: keyof SliderState;                                // State key for quantization + param info lookup
  unit?: string;                                              // Display unit suffix (Hz, ms, s, %)
  logarithmic?: boolean;                                      // Log-scale slider mapping
  onChange: (key: keyof SliderState, value: number) => void;  // Always handleSliderChange
  // Injected by sliderProps():
  mode?: SliderMode;                                          // 'single' | 'walk' | 'sampleHold'
  dualRange?: { min: number; max: number };                   // Range bounds for walk/S&H modes
  walkPosition?: number;                                      // Current walk/trigger position (0-1)
  onCycleMode?: (key: keyof SliderState) => void;             // Double-click/long-press handler
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
}
```

### The `sliderProps()` Factory

The `sliderProps(paramKey)` callback centralizes all dual-mode state lookup:

```typescript
const sliderProps = useCallback((paramKey: keyof SliderState) => {
  const keyStr = paramKey as string;
  const mode: SliderMode = sliderModes[keyStr] ?? 'single';

  let walkPos: number | undefined;
  if (mode === 'walk') walkPos = randomWalkPositions[keyStr];
  else if (mode === 'sampleHold') walkPos = triggerPositionMap[keyStr];

  // Drum morph keys use per-trigger positions
  if (drumMorphKeys.has(paramKey)) {
    const voice = drumMorphKeyToVoice[paramKey];
    if (voice) walkPos = drumMorphPositions[voice];
  }

  return {
    mode,
    dualRange: dualSliderRanges[paramKey],
    walkPosition: walkPos,
    onCycleMode: handleCycleSliderMode,
    onDualRangeChange: handleDualRangeChange,
  };
}, [sliderModes, dualSliderRanges, randomWalkPositions, triggerPositionMap,
    drumMorphPositions, drumMorphKeys, drumMorphKeyToVoice,
    handleCycleSliderMode, handleDualRangeChange]);
```

**Why a factory?** One function returns everything a slider needs. No prop-threading bugs, no forgetting to wire a handler. Adding a new slider = one `<Slider {...sliderProps('key')} />` call.

### Slider Mode Behavior

| Mode | Color | Label | Behavior | Stored In |
|------|-------|-------|----------|-----------|
| `single` | Standard | *(none)* | Fixed value | `state[key]` |
| `walk` | Blue `#a5c4d4` | `⟷ walk` | Continuous random walk between min/max | `dualSliderRanges[key]` |
| `sampleHold` | Gold `#D4A520` | `⟷ S&H` | New random value per trigger event | `dualSliderRanges[key]` |

Mode cycle: **double-click** (desktop) or **long-press 400ms** (mobile) → `single → walk → sampleHold → single`

### Routing Logic (Slider → DualSlider)

The `Slider` component checks if `onCycleMode` and `onDualRangeChange` are present:
- **Present** → renders `DualSlider` (supports all 3 modes, drag thumbs, walk indicator)
- **Absent** → renders plain `<input type="range">` fallback

Since `sliderProps()` always provides both handlers, every slider with `{...sliderProps()}` automatically gets full 3-mode support.

### Mode State Management

```typescript
// Single Record tracks all modes (absent key = 'single')
const [sliderModes, setSliderModes] = useState<Record<string, SliderMode>>({});

// Single Record tracks all dual ranges
const [dualSliderRanges, setDualSliderRanges] = useState<Partial<Record<keyof SliderState, DualSliderRange>>>({});

// One handler cycles modes
const handleCycleSliderMode = useCallback((key: keyof SliderState) => {
  const current = sliderModes[key as string] ?? 'single';
  const next: SliderMode = current === 'single' ? 'walk'
    : current === 'walk' ? 'sampleHold' : 'single';
  // When entering walk/S&H from single: create range ±10% around current value
  // When collapsing to single: set state to current walk/trigger position value
  // Update morph preset dualRanges/sliderModes at endpoints
  // ...
}, [...]);
```

**Never** create per-section mode states (e.g., `expressionDualModes`, `delayDualModes`). The unified `sliderModes` Record handles everything.

---

## Adding a New Slider Parameter

Checklist for adding a new numeric parameter that supports 3-mode operation:

### 1. State Definition (`src/ui/state.ts`)

```typescript
// In SliderState interface:
myNewParam: number;

// In STATE_KEYS array:
'myNewParam',

// In DEFAULT_STATE:
myNewParam: 50,

// In QUANTIZATION:
myNewParam: { min: 0, max: 100, step: 1 },
```

### 2. Engine Integration (`src/audio/engine.ts`)

If the parameter is per-trigger (sampled on each note/wave event):
```typescript
// In the relevant trigger callback:
const range = this.dualRanges['myNewParam'];
const value = range
  ? range.min + Math.random() * (range.max - range.min)
  : this.sliderState.myNewParam;
```

If it's a continuous parameter (driven by random walk from App):
```typescript
// No engine changes needed — App.tsx random walk useEffect handles it
// Just read this.sliderState.myNewParam normally
```

### 3. UI Rendering (`src/App.tsx`)

```tsx
<Slider
  label="My New Param"
  value={state.myNewParam}
  paramKey="myNewParam"
  unit="%"
  onChange={handleSliderChange}
  {...sliderProps('myNewParam')}
/>
```

### 4. If Engine Needs Dual Ranges

Add the key to the `setDualRanges()` push in the engine useEffect:
```typescript
// In the useEffect that calls audioEngine.setDualRanges():
if (dualSliderRanges.myNewParam) {
  engineRanges['myNewParam'] = dualSliderRanges.myNewParam;
}
```

### 5. Preset Serialization

The preset save handler already serializes `dualRanges` and `sliderModes` generically — no per-key code needed. Just ensure `myNewParam` is in `STATE_KEYS` so it's included in preset state.

---

## Parameter Naming Conventions

| Pattern | Meaning | Example |
|---------|---------|---------|
| `lead1*` / `lead2*` | Per-lead parameters | `lead1Density`, `lead2Morph` |
| `lead*` (no number) | Shared across both leads | `leadEnabled`, `leadLevel`, `leadDelayTime` |
| `ocean*` | Ocean wave synth | `oceanDuration`, `oceanFilterType` |
| `synth*` | Chord pad synth | `synthLevel`, `synthReverbSend` |
| `granular*` / `grain*` | Granular engine | `granularLevel`, `grainSizeMin` |
| `drum*` | Drum synth (per-voice) | `drumSubDecay`, `drumKickPitch` |
| `filterCutoffMin/Max` | Intentional paired range (NOT a dual-mode slider) | Always two fields |

**Important:** `filterCutoffMin/Max` is a **true min/max range parameter** — it always operates as a pair and is NOT a candidate for the 3-mode slider system. `grainSize` was migrated to a 3-mode slider (default: sampleHold) — the engine sends the dual range as `grainSizeMin`/`grainSizeMax` to the granulator worklet internally.

---

## Preset Migration

When renaming or removing state fields:

1. **Add to `PRESET_MIGRATION_MAP`** in `state.ts` if converting `*Min/*Max` → single field
2. **Add to `normalizePresetForWeb()`** in `App.tsx` for any other renames
3. **Migration must be idempotent** — safe to call on already-migrated presets
4. **Check both old AND new:** `typeof raw.oldName === 'number' && typeof raw.newName !== 'number'`
5. **`{ ...DEFAULT_STATE, ...normalized }`** ensures missing keys fall back to defaults
6. **Update all preset JSON files** in `public/presets/`

---

## iOS Port Considerations

When porting slider functionality to SwiftUI:

1. **`SliderMode` enum:** `enum SliderMode: String, Codable { case single, walk, sampleHold }`
2. **DualSlider SwiftUI view:** Two draggable thumbs + colored range track + walk/trigger indicator dot
3. **Mode cycling gesture:** Long-press cycles `single → walk → sampleHold → single`
4. **Engine reads:** Use `dualRanges[key]` for per-trigger sampling; fall back to `state[key]` if absent
5. **Preset migration:** Port `migratePreset()` logic — handles old `*Min/*Max` → new format
6. **Color constants:** Walk = `#a5c4d4` (blue), S&H = `#D4A520` (gold)
7. **See:** `docs/ios_port/04-PARAMETER-MAPPING.md` § "Unified 3-Mode Slider System" for full mapping table