# Development Learnings

## DrumSynth RNG Initialization Order

### Problem
DrumSynth was not being created because it depends on `rng` (random number generator), which wasn't initialized when `createAudioGraph()` was called.

**Symptom:**
- Console log: `[Engine] No rng - DrumSynth NOT created`
- No drum sounds despite UI showing drums enabled

### Cause
The initialization order in `start()`:
1. `createAudioGraph()` - tried to create DrumSynth here, but `rng` is null
2. `initializeHarmony()` - this is where `rng` is actually set

### Solution
Move DrumSynth creation to AFTER `initializeHarmony()` in the `start()` method:

```typescript
// In start():
await this.createAudioGraph();
this.initializeHarmony();  // Sets this.rng

// Create drum synth AFTER initializeHarmony sets rng
if (this.ctx && this.rng && this.masterGain && this.reverbNode) {
  this.drumSynth = new DrumSynth(
    this.ctx,
    this.masterGain,
    this.reverbNode,
    this.sliderState!,
    this.rng
  );
}
```

### Key Insight
When adding new components that depend on shared resources (like `rng`), always check the initialization order in the engine's `start()` method. Dependencies must be created/initialized before the components that need them.

---

## Windows Group Policy Bypass for Node.js

### Problem
On some Windows systems (especially corporate environments), group policy restrictions block execution of `npm`, `npx`, and other Node.js commands even when Node.js is installed.

**Symptoms:**
- `npm run dev` → "npm is not recognized" or "This program is blocked by group policy"
- `npx vite` → same errors
- `where.exe node` → returns nothing even though Node.js is installed

**Verification:**
```powershell
Test-Path "C:\Program Files\nodejs\npm.cmd"  # Returns True if Node.js is installed
```

### Solution
Bypass the restriction by calling `node.exe` directly with the script path:

```powershell
# Instead of:
npm run dev

# Use:
& "C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js"
```

### Why This Works
- Group policy blocks `npm.cmd` and `npx.cmd` batch files
- But `node.exe` itself is not blocked
- Vite's CLI is just a JavaScript file that can be executed directly by node

### Other Commands
```powershell
# npm install equivalent (if npm is blocked)
# May need to manually download dependencies or use a different machine

# Running any npm script
i
```

---

## Scale Tension Weighting System

### Overview
The scale selection system uses a weighted probability algorithm to choose scales based on a tension slider (0.0 - 1.0). The goal is to have predictable, musical scale transitions where each tension value has a "home" scale that dominates the probability.

### Scale Positions (tensionValue)
Scales are positioned along the tension spectrum. Scale names are now **generic** (the root note is a separate parameter):

| Scale | Tension Value | Level |
|-------|---------------|-------|
| Major Pentatonic | 0.00 | consonant |
| Major (Ionian) | 0.05 | consonant |
| Lydian | 0.10 | consonant |
| Mixolydian | 0.18 | consonant |
| Minor Pentatonic | 0.22 | consonant |
| Dorian | 0.25 | consonant |
| Aeolian | 0.35 | color |
| Harmonic Minor | 0.50 | color |
| Melodic Minor | 0.55 | color |
| Octatonic Half-Whole | 0.85 | high |
| Phrygian Dominant | 0.90 | high |

### Weighting Formula
```typescript
weight = Math.pow(1 / (distance + 0.05), 1.5)
```

Where:
- `distance` = absolute difference between scale's tensionValue and current tension slider value
- `0.05` = offset constant (controls sharpness of probability peaks)
- `1.5` = power exponent (controls how fast probability falls off with distance)

### Probability Distribution at Key Tension Values

| Tension | Maj Pent | Major | Lydian | Mixolydian | Minor Pent | Dorian | Aeolian | Harm Minor | Mel Minor | Octatonic | Phryg Dom |
|---------|----------|-------|--------|------------|------------|--------|---------|------------|-----------|-----------|-----------|
| 0.00 | **55.7%** | 19.7% | 10.7% | 5.6% | 4.4% | 3.8% | - | - | - | - | - |
| 0.05 | 17.2% | **48.7%** | 17.2% | 7.1% | 5.3% | 4.4% | - | - | - | - | - |
| 0.10 | 9.3% | 17.1% | **48.3%** | 11.5% | 7.7% | 6.0% | - | - | - | - | - |
| 0.25 | 3.3% | 4.4% | 6.1% | 13.1% | 24.2% | **48.9%** | - | - | - | - | - |
| 0.35 | 2.4% | 3.0% | 3.7% | 5.9% | 8.0% | 10.5% | **54.7%** | 6.8% | 4.9% | - | - |
| 0.50 | 1.6% | 1.8% | 2.1% | 2.8% | 3.4% | 3.9% | 7.1% | **57.1%** | 20.2% | - | - |
| 0.85 | - | - | - | - | - | - | - | - | - | **73.9%** | 26.1% |

### Tension Bands (Candidate Filtering)
Before weighting, scales are filtered by tension band:
- **≤ 0.25**: Only consonant scales (Major, Lydian, Mixolydian, Dorian, etc.)
- **0.26 - 0.55**: Consonant + Color scales (adds Aeolian, Harmonic/Melodic Minor)
- **0.56 - 0.80**: Color + High tension scales
- **> 0.80**: Only High tension scales (Octatonic, Phrygian Dominant)

### Design Goals
1. **~75% probability** for Maj Pent + Major at tension 0.0
2. **~50-60% peak** for each scale at its home tension value
3. **Smooth transitions** - neighboring scales always have some probability
4. **Musical progression** - low tension = bright/major, high tension = dark/dissonant

### Tuning Parameters
- **Offset (0.05)**: Lower = sharper peaks, higher = flatter distribution
  - 0.05 → ~75% for top 2 scales at their home position
  - 0.08 → ~67% for top 2 scales
  - 0.10 → ~60% for top 2 scales
- **Power (1.5)**: Higher = faster falloff from peak
  - 1.0 → linear falloff
  - 1.5 → moderate curve (current)
  - 2.0 → sharp dropoff

---

## Circle of Fifths Morph System

### Overview
When morphing between presets with different root notes, the key transition follows the Circle of Fifths (CoF) for smooth, musical modulation rather than abrupt key changes.

### Key Components

#### 1. Direction-Aware Morphing
The morph system tracks which direction the user is moving:
- **A → B (0% → 100%)**: Captures A's current root (accounting for any active CoF drift)
- **B → A (100% → 0%)**: Captures B's current root

This is critical because the slider position semantics (0=A, 100=B) don't change, but the *musical* direction of the morph matters for calculating the correct CoF path.

#### 2. CoF Path Calculation
```typescript
// Calculate shortest path on Circle of Fifths
calculateCoFPath(fromSemitone, toSemitone): { steps, path }

// Steps can be positive (clockwise/sharps) or negative (counter-clockwise/flats)
// Path is array of semitones to traverse
```

Example: E(4) → G(7)
- Clockwise: E→B→F#→C#→G#→D#→A#→F→C→G = 9 steps
- Counter-clockwise: E→A→D→G = 3 steps
- **Result**: CCW is shorter, path = [E, A, D, G], steps = -3

#### 3. Morph Position to CoF Step Mapping
Key changes are distributed evenly across the morph:
```typescript
// For N steps, change at positions: 100/(N+1), 200/(N+1), ... N*100/(N+1)
// Example: 3 steps → change at 25%, 50%, 75%
segmentSize = 100 / (totalSteps + 1)
pathIndex = floor((morphPosition + segmentSize/2) / segmentSize)
```

#### 4. Smart CoF Toggle
When presets have different `cofDriftEnabled` values:

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| **Off → On** | Turn ON immediately (t > 0) | Allow CoF walk during morph |
| **On → Off** | Stay ON until arrival (t < 100) | Complete CoF walk before disabling |
| **Same** | Use that value | No special handling needed |

### Implementation Details

```typescript
// In lerpPresets():
if (direction === 'toB') {
  fromRoot = capturedStartRoot ?? stateA.rootNote;
  toRoot = stateB.rootNote;
  cofMorphT = t; // 0→100 maps directly
} else {
  fromRoot = capturedStartRoot ?? stateB.rootNote;
  toRoot = stateA.rootNote;
  cofMorphT = 100 - t; // Invert for B→A direction
}
```

### State Management

| Ref | Purpose |
|-----|---------|
| `morphCapturedStartRootRef` | Captures the effective root when morph begins |
| `morphDirectionRef` | Tracks 'toA' or 'toB' direction |
| `lastMorphEndpointRef` | Tracks last visited endpoint (0 or 100) |

### Visual Feedback
The Circle of Fifths UI component shows:
- **Blue segment**: Home key of current preset
- **Green segment**: Current key position during morph
- **Highlighted path**: All keys that will be traversed
- **Gray segments**: Keys within drift range (when CoF drift enabled)

---

## iOS Reverb Quality Modes

### Overview
iOS offers three reverb quality modes that balance sound quality vs battery consumption:

| Mode | Implementation | Stages | Battery | Sound |
|------|----------------|--------|---------|-------|
| **Ultra** | Custom FDN | 32 | High | Best (matches web) |
| **Balanced** | Custom FDN | 16 | Medium | Good |
| **Lite** | AVAudioUnitReverb | Apple | Best | Decent |

### Lite Mode Design Decision
Lite mode **intentionally** uses Apple's built-in `AVAudioUnitReverb` instead of the custom FDN algorithm. This is NOT a parity issue.

**Rationale:**
- Web runs on plugged-in devices; iOS is battery-limited
- Apple's reverb is highly optimized for their hardware
- Users can choose Ultra/Balanced for web-matching sound
- Lite provides battery-conscious alternative for long listening sessions

### FDN Preset Config
The internal `FDNPresetConfig` enum (renamed from `ReverbPreset`) stores FDN-specific parameters:
```swift
enum FDNPresetConfig {
    case plate, hall, cathedral, darkHall, ambient
    // Returns: (decay, damping, diffusion, size, modDepth)
}
```

This is separate from `ReverbType` which is the public UI-facing enum that includes both cross-platform presets and iOS-only Apple factory presets.

---

## Euclidean Sequencer Multi-Source Architecture

### Overview
The Euclidean sequencer can trigger multiple sound sources (Lead synth, Synth voices 1-6) independently of whether those sources are "enabled" via their primary toggles.

### Key Architecture Decisions

#### 1. Independent Scheduling Paths
The `scheduleLeadMelody()` function handles ALL Euclidean note scheduling, not just lead notes. This means:
- Lead melody scheduling must run if **either** Lead is enabled **OR** any Euclidean lane uses a synth source
- The function name is historical - it now handles all rhythmic note scheduling

```typescript
// In applyParams() - start scheduling if either condition is true
const euclideanSynthLanesEnabled = state.leadEuclideanMasterEnabled && (
  (state.leadEuclid1Enabled && state.leadEuclid1Source !== 'lead') ||
  (state.leadEuclid2Enabled && state.leadEuclid2Source !== 'lead') ||
  // ... etc
);
const shouldSchedule = state.leadEnabled || euclideanSynthLanesEnabled;
```

#### 2. Synth Chord Sequencer vs Euclidean Independence
When `synthChordSequencerEnabled` is off, the code silences all synth voices. But this would kill Euclidean synth notes! The solution:

```typescript
// Only silence voices if chord sequencer is off AND no Euclidean lanes use synth
if (sliderState.synthChordSequencerEnabled === false && this.voices.length > 0) {
  const euclideanUsesSynth = /* check if any lane uses synth source */;
  if (!euclideanUsesSynth) {
    // Safe to silence all voices
  }
}
```

#### 3. triggerSynthVoice with Duration
Synth voices normally sustain indefinitely (for chord pads). For Euclidean rhythmic notes, we need automatic release:

```typescript
triggerSynthVoice(voiceIndex: number, frequency: number, velocity: number, noteDuration?: number): void {
  // ... envelope attack/decay/sustain ...
  
  if (noteDuration !== undefined) {
    const releaseTime = now + noteDuration;
    voice.envelope.gain.setTargetAtTime(0, releaseTime, release / 3);
    setTimeout(() => { voice.active = false; }, (noteDuration + release) * 1000);
  }
}
```

The duration is calculated based on ADSR: `attack + decay + max(0.3, attack + decay)`

#### 4. State Properties per Lane
Each Euclidean lane has:
- `leadEuclid[1-4]Probability` (0.0-1.0) - Chance each hit actually triggers
- `leadEuclid[1-4]Source` ('lead' | 'synth1' | ... | 'synth6') - Target sound source

### Common Pitfalls

1. **Early return blocking synth lanes**: `scheduleLeadMelody()` may return early if `leadEnabled` is false. Must check for synth lanes first.

2. **State change detection**: Must detect changes to source settings, not just enabled toggles:
   ```typescript
   const euclideanChanged = /* ... */ ||
     state.leadEuclid1Source !== this.sliderState.leadEuclid1Source ||
     // ... etc
   ```

3. **startLeadMelody guard**: The `startLeadMelody()` wrapper also has an enabled check - must update both locations.

---

## Preset Morph Override System

### Overview
When morphing between two presets, users can modify parameters mid-morph. The system handles these edits with position-aware logic to preserve musical intent.

### Rules

#### Rule 1: Mid-Morph Changes are Temporary
When modifying a slider between 0% and 100%:
- The new value is applied immediately
- It's stored as a temporary override with the current morph position
- As the user continues morphing, the value **blends** from the override toward the destination preset
- The blend uses remaining distance: if override at 30% while moving to 100%, value transitions smoothly over the remaining 70%

#### Rule 2: Endpoint Changes are Permanent
When at exactly 0% or 100%:
- Changes **permanently update** that endpoint's preset
- At 0%: Updates Preset A's `state` and/or `dualRanges`
- At 100%: Updates Preset B's `state` and/or `dualRanges`
- This includes numeric values, dual mode toggles, and range adjustments

### Implementation

```typescript
// Ref to track manual overrides with their morph position
const morphManualOverridesRef = useRef<Record<string, { value: number; morphPosition: number }>>({});

// In handleSliderChange:
if (isMorphActive && isNumericMorphableKey) {
  if (morphPosition === 0 && morphPresetA) {
    // Endpoint A: update preset permanently
    setMorphPresetA(prev => ({ ...prev, state: { ...prev.state, [key]: value } }));
  } else if (morphPosition === 100 && morphPresetB) {
    // Endpoint B: update preset permanently
    setMorphPresetB(prev => ({ ...prev, state: { ...prev.state, [key]: value } }));
  } else {
    // Mid-morph: store temporary override
    morphManualOverridesRef.current[key] = { value, morphPosition };
  }
}
```

### Dual Mode Persistence

The same rules apply to dual mode changes:
- **Toggle dual mode at endpoint**: Updates preset's `dualRanges` (adds or removes the key)
- **Change dual range at endpoint**: Updates preset's `dualRanges[key]` min/max
- **Mid-morph changes**: Local state only, not persisted to presets

This ensures that when you modify a slider to dual mode while at 100%, morphing back to 0% and then to 100% again will preserve your dual mode setting.

### Blend Calculation

```typescript
// In handleMorphPositionChange:
Object.entries(morphManualOverridesRef.current).forEach(([key, override]) => {
  const direction = morphDirectionRef.current;
  const destination = direction === 'toB' ? morphPresetB.state[key] : morphPresetA.state[key];
  
  // Calculate blend based on remaining distance to destination
  const overridePos = override.morphPosition;
  const currentPos = newPosition;
  const destPos = direction === 'toB' ? 100 : 0;
  
  const totalDistance = Math.abs(destPos - overridePos);
  const traveledDistance = Math.abs(currentPos - overridePos);
  const blendT = Math.min(1, traveledDistance / Math.max(1, totalDistance));
  
  lerpedState[key] = override.value + (destination - override.value) * blendT;
});
```

### Key Insight
This system allows users to "scrub" through a morph, make adjustments, and continue without losing context. The temporary override behavior prevents jarring jumps when resuming the morph, while endpoint persistence ensures intentional changes are saved.

---

## Morph Endpoint Detection and Selective Override Clearing

### Problem
When in a morph system with two presets (A at position 0, B at position 1), user edits at one endpoint were being lost when the OTHER endpoint's preset was changed.

**Symptoms:**
1. At position 100 (B), user switches slider to dual mode
2. User changes Preset A dropdown
3. Dual slider reverts to single mode (user edit lost)

### Root Cause
The code was clearing ALL overrides when ANY preset changed:
```typescript
if (keyStr.includes('PresetA') || keyStr.includes('PresetB')) {
  clearDrumMorphOverrides(voice);  // Clears EVERYTHING
}
```

### Solution

**1. Selective Override Clearing**

Created a function to clear only endpoint-specific overrides:
```typescript
export function clearDrumMorphEndpointOverrides(voice: DrumVoiceType, endpoint: 0 | 1): void {
  const overrides = drumMorphOverrides[voice];
  for (const param of Object.keys(overrides)) {
    if (override.isEndpoint) {
      if ((endpoint === 0 && override.morphPosition < 0.01) ||
          (endpoint === 1 && override.morphPosition > 0.99)) {
        delete overrides[param];
      }
    }
  }
  // Also clear dual range overrides for this endpoint only
  // ...
}
```

**2. Conditional UI Reset**

Only reset dual slider modes when the preset change affects the current position:
```typescript
const isPresetA = keyStr.includes('PresetA');
const atEndpoint0 = currentMorph < 0.01;
const atEndpoint1 = currentMorph > 0.99;

// Only reset if changing the preset we're currently at
const shouldResetDualModes = (isPresetA && !atEndpoint1) || (!isPresetA && !atEndpoint0);

if (shouldResetDualModes) {
  // Reset dual modes...
}
```

**3. Skip State Application at Opposite Endpoint**

For the main morph, only apply preset A values if at endpoint 0:
```typescript
const atEndpoint0 = isAtEndpoint0(morphPosition, true);
const shouldApplyPresetA = atEndpoint0 || !morphPresetB;

if (shouldApplyPresetA) {
  // Apply preset A state...
}
```

### Key Insight
When building dual-endpoint morph systems:
- User edits at each endpoint should be stored separately
- Changing one endpoint's source should only affect that endpoint's data
- UI state (like dual/single mode) must also respect this separation
- Always check "which endpoint am I at?" before clearing or applying state

---

## Lead Parameter Renaming: Shared → Per-Lead Namespace

### Overview
As the app evolved from a single lead synth to a dual-lead architecture (Lead 1 with Preset A↔B morph, Lead 2 with Preset C↔D morph), several "shared" parameters were renamed to the `lead1` namespace to allow future `lead2` equivalents.

### Renamed Parameters

| Old Name | New Name | Notes |
|----------|----------|-------|
| `leadDensity` | `lead1Density` | Notes per phrase |
| `leadOctave` | `lead1Octave` | Octave offset (-1 to 2) |
| `leadOctaveRange` | `lead1OctaveRange` | Octave span (1-4) |
| `leadAttack` | `lead1Attack` | ADSR attack time |
| `leadDecay` | `lead1Decay` | ADSR decay time |
| `leadSustain` | `lead1Sustain` | ADSR sustain level |
| `leadHold` | `lead1Hold` | Hold time at sustain |
| `leadRelease` | `lead1Release` | ADSR release time |
| `leadUseCustomAdsr` | `lead1UseCustomAdsr` | Toggle preset vs custom ADSR |
| `leadTimbreMin/Max` | `lead1MorphMin/Max` | Legacy timbre → FM morph range |

### Parameters NOT Renamed (Intentionally Shared)
| Parameter | Reason |
|-----------|--------|
| `leadEnabled` | Master toggle for entire lead bus |
| `leadLevel` | Master output gain for lead bus (`leadGain.gain`) — distinct from `lead1Level`/`lead2Level` which are per-voice velocity scales |
| `leadReverbSend` | Shared reverb send level |
| `leadDelayReverbSend` | Shared delay→reverb send |
| `leadDelay*` | Delay is shared across both leads |
| `leadVibrato*` | Expression params are shared |
| `leadGlide*` | Glide is shared |
| `leadEuclid*` | Euclidean sequencer is shared |

### Legacy Migration in normalizePresetForWeb()

Old presets (and cloud saves) still use the original names. The normalizer handles migration automatically:

```typescript
// Legacy density/octave rename
if (typeof raw.leadDensity === 'number' && typeof raw.lead1Density !== 'number') {
  normalized.lead1Density = raw.leadDensity as number;
}
// Same pattern for leadOctave, leadOctaveRange

// Legacy ADSHR rename
const adsrhMap: [string, keyof SliderState][] = [
  ['leadAttack', 'lead1Attack'], ['leadDecay', 'lead1Decay'],
  ['leadSustain', 'lead1Sustain'], ['leadHold', 'lead1Hold'],
  ['leadRelease', 'lead1Release'],
];
for (const [oldKey, newKey] of adsrhMap) {
  if (typeof raw[oldKey] === 'number' && typeof raw[newKey] !== 'number') {
    normalized[newKey] = raw[oldKey];
  }
}

// Legacy leadUseCustomAdsr → lead1UseCustomAdsr
if (typeof raw.leadUseCustomAdsr === 'boolean' && typeof raw.lead1UseCustomAdsr !== 'boolean') {
  normalized.lead1UseCustomAdsr = raw.leadUseCustomAdsr;
}

// Legacy timbre → morph (pre-existing migration)
// leadTimbreMin/Max auto-maps to lead1MorphMin/Max when morph values are 0/0
```

### Files Changed
- **state.ts**: Type definition, keys array, DEFAULT_STATE, PARAM_INFO
- **App.tsx**: UI sliders, save/export key lists, bool keys for morph, normalizer migration
- **engine.ts**: `playLeadNote()`, `getLeadMorphedParams()`, hold time read
- **All 6 preset JSONs**: Updated to new field names

### Key Insight
When renaming state properties in a system with cloud saves and local presets:
1. **Always add legacy migration** in the normalizer — old presets must still load
2. **Migration checks both old AND new** — `typeof raw.oldName === 'number' && typeof raw.newName !== 'number'` prevents overwriting when both exist
3. **`{ ...DEFAULT_STATE, ...normalized }` provides safety net** — any missing key falls back to defaults
4. **Leave `leadTimbreMin/Max` in state.ts type/defaults** — the normalizer still references them for old preset migration, even though no UI or engine reads them

---

## Unified 3-Mode Slider System (Replacing Dual-Range Sliders)

### Problem
The app had 6 independent dual-range slider systems using different state shapes and different random-value strategies:

1. **App-level random walk** — drove `synthReverbSend`, `granularReverbSend`, etc. via a shared `dualSliderRanges` + `randomWalkRef`
2. **Engine-level lead morph** — had its own `lead1MorphMin/Max` fields, sampled per note in `playLeadNote()`
3. **Per-trigger expression** — `leadVibratoDepthMin/Max`, `leadVibratoRateMin/Max`, `leadGlideMin/Max` — sampled at each note trigger
4. **Per-trigger delay** — `leadDelayTimeMin/Max`, etc. — sampled at each note trigger
5. **Per-trigger ocean** — `oceanDurationMin/Max`, etc. — sampled at each wave trigger
6. **Drum morph** — per-voice morph params with dual ranges — already used `dualSliderRanges`

Each had its own state variables (`expressionDualModes`, `delayDualModes`, `oceanDualModes`, `leadMorphDualModes`), separate toggle handlers, and separate UI JSX blocks (~600 lines of inline dual-slider code).

**Symptoms:**
- 4 separate `Record<string, boolean>` + 4 toggle handlers
- ~1,400 lines of duplicated slider rendering code
- Two different randomization strategies (walk vs sample-and-hold) with no user control
- Inconsistent mode indicators (some blue, all labeled "⟷ dual")
- 15 separate `*Min/*Max` state fields that couldn't exist without dual mode enabled

### Solution
Unified everything into a single 3-mode slider system:

```typescript
type SliderMode = 'single' | 'walk' | 'sampleHold';

// One record for all slider modes (absent key = 'single')
sliderModes: Record<string, SliderMode>

// One handler cycles: single → walk → sampleHold → single
handleCycleSliderMode(key: keyof SliderState)
```

### Architectural Changes

**state.ts:**
- Added `SliderMode` type, `SavedPreset.sliderModes` field
- Replaced 15 `*Min/*Max` field pairs with 13 single fields (e.g., `oceanDurationMin/Max` → `oceanDuration`)
- Added `PRESET_MIGRATION_MAP` and `migratePreset()` for old→new format conversion
- Kept `filterCutoffMin/Max` as-is (this is an intentional paired range, not a dual-mode slider)
- Migrated `grainSizeMin/Max` → `grainSize` (sampleHold mode; engine passes dual range to granulator worklet as grainSizeMin/grainSizeMax internally)

**engine.ts:**
- Added `dualRanges` storage + `setDualRanges()` method
- All per-trigger sampling reads from `this.dualRanges['oceanDuration']` etc. instead of `this.sliderState.oceanDurationMin`
- 4 callbacks (expression, morph, delay, ocean) all use consistent lookup

**App.tsx (~1,400 lines removed):**
- Replaced 4 mode-state Records with one `sliderModes` Record
- Replaced 4 toggle handlers with one `handleCycleSliderMode`
- `sliderProps(paramKey)` helper returns `{ mode, dualRange, walkPosition, onCycleMode, onDualRangeChange }`
- `DualSlider` component renders 3 modes with color coding (walk=#a5c4d4, S&H=#D4A520)
- 10 inline dual-slider JSX blocks replaced with `<Slider {...sliderProps('key')} />`
- `lerpPresets` uses `Record<string, SliderMode>` for morph interpolation

**Preset JSON format (5 files migrated):**
```json
{
  "state": { "oceanDuration": 6, "leadDelayTime": 375 },
  "dualRanges": { "oceanDuration": { "min": 4, "max": 10 } },
  "sliderModes": { "oceanDuration": "walk", "leadDelayTime": "sampleHold" }
}
```

### Migration Path
Every preset load path routes through `migratePreset()`:
1. Detects old `*Min/*Max` pairs via `PRESET_MIGRATION_MAP`
2. Converts to single value (midpoint if dual, min if single)
3. Creates `dualRanges` entry if min ≠ max (beyond threshold)
4. Sets `sliderModes` entry based on `defaultMode` from map
5. Old presets without `sliderModes` field: infer from `dualRanges` keys (drum=sampleHold, other=walk)

### Key Insight
When consolidating multiple independent systems into one:
1. **Identify the dimension of variation** — here it was "what happens at mode switch time" (walk vs S&H), which became the `SliderMode` enum
2. **Use a single Record for mode state, not per-section booleans** — `Record<string, SliderMode>` scales to any number of sliders without new state variables
3. **Always provide a `sliderProps()` factory** — one function that returns everything a slider needs, avoiding prop-threading bugs
4. **Migration must be idempotent** — `migratePreset()` is safe to call on already-migrated presets (no-op if old fields absent)
5. **Keep intentional paired ranges separate** — not every min/max pair is a dual-mode slider (filterCutoff is a true range; grainSize was migrated since the worklet already did per-grain random sampling internally)