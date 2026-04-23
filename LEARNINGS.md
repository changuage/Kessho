# Development Learnings

## Reverb Freeze Is Not Feasible with FDN/Dattorro Recirculation (Archived March 2026)

### Problem
Attempted to implement infinite sustain ("freeze") in the WASM reverb by setting feedback to 1.0 and disabling all loss sources. After 10+ rounds of fixes, the reverb tail still decayed to silence.

### What Was Tried
1. **Feedback clamp bypass** — Slow modulation was clamping feedback to 0.998 → gated when `fzRamp >= 0.5`
2. **Soft clipper bypass** — `softClip()` in the feedback loop compressed signal each recirculation → bypassed during freeze, replaced with hard clamp at ±3
3. **OnePole coefficient polarity** — `OnePole::process` uses `z1 = input*(1-coeff) + z1*coeff`. Coefficient=1.0 is **sample-and-hold** (max damping), NOT passthrough. The freeze code was ramping `dampCoeff` and `airAbsCoeff` toward 1.0 → fixed by ramping toward 0.0
4. **Air absorption bypass** — Disabled air absorption filters during freeze
5. **Damping bypass** — Disabled damping filters during freeze (per-mode behavior)
6. **HPF bypass** — `hpCoeff` set to 1.0 during freeze
7. **Velvet noise gating** — Disabled impulse injection during freeze
8. **NaN guards** — Added guards in C++ and JS worklets
9. **Input muting** — Mode-dependent input gain ramps
10. **Multi-rate LFO evolution** — 3-LFO system for organic frozen texture
11. **4 freeze modes** — Tank, State-capture, Resonator, Slushy with different behaviors

### Root Cause (Unsolvable with This Architecture)
FDN/Dattorro reverb recirculates audio through delay lines, allpass filters, damping filters, mixing matrices, and output taps **thousands of times per second**. Even with all identified loss sources fixed, cumulative floating-point rounding in filters, allpass quantization, Hadamard scaling, and interpolated delay reads cause inevitable signal decay.

### Key Insight: OnePole Filter Coefficient Semantics
```cpp
// OnePole: z1 = input * (1.0 - coeff) + z1 * coeff
// coeff = 0.0 → PASSTHROUGH (output = input)
// coeff = 1.0 → SAMPLE-AND-HOLD (output = z1 forever, ignores input)
```
This is the opposite of what "coefficient toward 1.0 for transparency" suggests. Always verify filter behavior at boundary values.

### Solution
Use **spectral freeze** (STFT phase vocoder) instead — it captures FFT magnitudes and resynthesizes directly with no recirculation. Inherently lossless.

### Archived Code
Full reverb freeze implementation archived at `public/ARCHIVE/reverb_freeze.md`

---

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
on mac
node node_modules/vite/bin/vite.js



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
const euclideanSynthLanesEnabled = state.synthEuclideanMasterEnabled && (
  (state.synthEuclid1Enabled && state.synthEuclid1Source !== 'lead') ||
  (state.synthEuclid2Enabled && state.synthEuclid2Source !== 'lead') ||
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
- `synthEuclid[1-4]Probability` (0.0-1.0) - Chance each hit actually triggers
- `synthEuclid[1-4]Source` ('lead' | 'synth1' | ... | 'synth6') - Target sound source

### Common Pitfalls

1. **Early return blocking synth lanes**: `scheduleLeadMelody()` may return early if `leadEnabled` is false. Must check for synth lanes first.

2. **State change detection**: Must detect changes to source settings, not just enabled toggles:
   ```typescript
   const euclideanChanged = /* ... */ ||
     state.synthEuclid1Source !== this.sliderState.synthEuclid1Source ||
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
| `leadLevel` | Master output gain for lead bus (`leadGain.gain`) — distinct from `lead1Level`/`lead2Level` which are per-voice level controls |
| `leadDelayReverbSend` | Shared delay→reverb send |
| `leadDelay*` | Delay is shared across both leads (WASM applies delay internally to combined signal) |
| `leadVibrato*` | Expression params are shared |
| `leadGlide*` | Glide is shared |
| `synthEuclid*` | Euclidean sequencer is shared |

**Note (March 2026):** `leadReverbSend` was replaced by per-lead `lead1ReverbSend` and `lead2ReverbSend`. A shared `leadReverbSend` gain node is kept as a legacy fallback but the WASM two-output architecture routes each lead's output to its own reverb send.

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
6. **WALK_ONLY_KEYS** — Some params only support `single → walk → single` (skipping S&H). This applies to `waterSurfBody`, `waterSurfSpray`, `waterChannelsMorph`, `waterChannelsSpeed` because the WASM engine accepts scalar values for these (no per-event randomisation). Implemented via a `Set<string>` check in `handleCycleSliderMode`.

---

## Euclidean Sequencer Clock Division Data Flow Gap

### Problem
Per-lane clock division (1/4, 1/8, 1/16, 1/8T) and swing dropdowns in the Euclidean sequencer UI had no effect on actual sequencer speed — all lanes played at the same rate regardless of the selected clock division.

**Symptom:**
- Changing the Clock dropdown from 1/8 to 1/16 → no audible speed change
- Same issue on both synth and drum Euclidean sequencers
- Swing slider also had no effect

### Root Cause
The `useEuclideanSequencer` hook maintained `clockDivs` and `swings` React state properly, and included them in the `sequencerModels` for UI rendering. But **no data path existed** from the hook to the audio engine schedulers.

**Synth Euclidean (`engine.ts`):**
- `scheduleSynthEuclid()` used a single fixed `stepDurationSec = 60 / (baseBPM * tempo)` for ALL lanes
- No per-lane clock division concept existed at all
- No swing logic existed

**Drum Euclidean (`drumSynth.ts`):**
- The scheduler DID read per-lane `clockDivToSec(sequencer.clockDiv)` and `sequencer.swing`
- But `euclidSequencers` were created via `createSequencer()` with hardcoded defaults
- No setter method existed to update `clockDiv` or `swing` after initialization

**The gap:**
```
useEuclideanSequencer (UI state) → ??? → audio engine schedulers
                                   ↑
                          No data path existed here
```

### Solution

**1. Synth Euclidean — add per-lane clock division support:**
```typescript
// Before: single duration for all lanes
const stepDurationSec = 60 / (baseBPM * tempo);

// After: per-lane clock division (matching drum scheduler pattern)
const beatDuration = 60 / (baseBPM * tempo);
const clockDivToSec = (clockDiv: ClockDivision): number => {
  switch (clockDiv) {
    case '1/4': return beatDuration;
    case '1/8': return beatDuration / 2;
    case '1/16': return beatDuration / 4;
    case '1/8T': return beatDuration / 3;
  }
};

// Per-lane step advance with swing
const laneStepDuration = clockDivToSec(this.synthEuclidClockDivs[laneIndex]);
const swingOffset = (stepIndex % 2 === 1) ? laneStepDuration * laneSwing * 0.5 : 0;
this.synthEuclidNextStepTime[laneIndex] += laneStepDuration + swingOffset;
```

**2. Drum Euclidean — add setter methods:**
```typescript
setEuclidClockDivs(divs: ClockDivision[]): void {
  divs.forEach((div, i) => {
    if (this.euclidSequencers[i]) this.euclidSequencers[i].clockDiv = div;
  });
}
setEuclidSwings(swings: number[]): void {
  swings.forEach((swing, i) => {
    if (this.euclidSequencers[i]) this.euclidSequencers[i].swing = swing;
  });
}
```

**3. Wire the UI → Engine data path:**
```
useEuclideanSequencer (clockDivs/swings state)
  → useEffect in SynthPage/DrumPage detects changes
    → onClockDivsChange/onSwingsChange callbacks (new props)
      → App.tsx wires to audioEngine.setSynthEuclidClockDivs() / setDrumEuclidClockDivs()
        → engine stores values / drumSynth updates euclidSequencers
          → scheduler reads per-lane values on each tick
```

### Key Insight
When adding new per-lane sequencer controls:
1. **Check the full data path**: UI state → callback → engine → scheduler. A control that only updates React state is invisible to the audio engine.
2. **Follow existing patterns**: The step overrides (probability, ratchet, etc.) used `onStepOverridesChange` → `setSynthStepOverrides()`. Clock/swing should follow the same callback pattern.
3. **Match defaults across layers**: `useEuclideanSequencer` defaults (`['1/8','1/16','1/8T','1/4']`) must match `createSequencer()`'s `defaultClockDiv()` and the engine's initial `synthEuclidClockDivs`. Mismatched defaults cause silent bugs where the initial state appears unsynced.
4. **Verify both synth AND drum paths**: The drum scheduler already had internal `clockDiv` support that was never wired; the synth scheduler lacked it entirely. Same symptom, different fixes.

---

## Synth Morph Override Leak on Sequencer Stop

### Problem
The morph (preset blend) sub-sequencer lane in the Euclidean sequencer could lock the morph slider at a fixed position after turning the sub-sequencer off.

**Symptom:**
- Enable morph sub-lane in Euclidean sequencer → works correctly, morph position changes per step
- Disable morph sub-lane → morph slider stuck at last sequenced value (e.g., 50%), manual slider movement ignored

### Root Cause
`synthMorphOverride` (a `number | null` field on `AudioEngine`) is set by the morph sub-sequencer lane to temporarily override the morph slider value. When `stopSynthEuclidScheduler()` was called (or the morph sub-lane was disabled), this field was never cleared — the last override value persisted indefinitely.

```typescript
// synthMorphOverride was set during scheduling:
this.synthMorphOverride = effectiveMorph;

// But stopSynthEuclidScheduler() only reset step counters:
private stopSynthEuclidScheduler(): void {
  clearTimeout(this.synthEuclidScheduleTimer);
  this.synthEuclidCurrentStep = [0, 0, 0, 0];
  // synthMorphOverride was NOT cleared!
}
```

### Solution
Add `this.synthMorphOverride = null;` to `stopSynthEuclidScheduler()` so the slider regains control when the sequencer stops.

### Key Insight
Any "override" field that temporarily takes control away from a UI slider MUST be cleared in ALL exit paths (stop, disable, tab switch, etc.). If the override persists, the slider appears broken.

---

## Earth Page: Unified Per-Event Min/Max for All Earth Engines

### Problem (Historical)
Sample & Hold (S&H) mode on dual sliders originally only worked natively for **Ocean** parameters. Ocean's C++ WASM code accepted min/max ranges and called `rng_range(min, max)` per wave trigger. Water and Insects engines accepted single values only, so the host had to collapse dual ranges to a midpoint ("DualRangeContinuousHold").

### Solution — All Engines Now Support Min/Max
As of March 2026, all three Earth WASM engines accept min/max range pairs:

| Engine | Params | Per-Event Randomisation |
|--------|--------|------------------------|
| **Ocean** | 5 min/max pairs (duration, interval, wave2Offset, foam, depth) | `rng_range(min, max)` per wave event |
| **Water** | 7 min/max pairs (intensity, rate, distance, baseFreq, dropSize, hardness, glassThickness) + Surf params (duration, interval, foam, depth) | `rng_range(min, max)` per drop/scheduling event and per wave event |
| **Insects** | 7 min/max pairs (density, temperature, distance, proximity, antiphony, clickRate, motion) | `rng_range(min, max)` per voice update |

Water also has **Surf** (wave-envelope-driven 3-band noise, replaces old Roar layer) and **Channels** (stream↔wind continuous morph, replaces old Rivulets layer). Surf accepts per-event min/max for duration, interval, foam, and depth. Channels accepts morph (0=stream, 1=wind) and speed as scalar params (walk-only, no S&H — see WALK_ONLY_KEYS below).

When `min == max` (single slider mode), `rng_range` returns the single value — behavior is identical to the old scalar API.

### Data Flow
```
UI sampleHold slider → dualSliderRanges (App.tsx)
  → setDualRanges() → engine.dualRanges
    → applyParams reads dualRanges['waterRate'] etc.
      → postMessage { rateMin, rateMax } to worklet
        → worklet calls water_set_params(rateMin, rateMax, ...)
          → WASM stores ranges, uses rng_range(min, max) per event
```

### Key Insight
All Earth engines now follow the same pattern as Ocean — the `OCEAN_SH_KEYS` gate concept is obsolete. The worklet handlers accept both old scalar fields (backward-compatible via `p.rateMin ?? p.rate ?? 0.5`) and new min/max fields.

---

## WASM Two-Output Lead Architecture (Lead 1/2 Bleed-Through Fix)

### Problem
Lead 1 sound was audible through Lead 2's output path. If Lead 1 volume was set to 0 and Lead 2 volume was above 0, notes triggered for Lead 1 were still audible because the WASM worklet had a single mixed output controlled by `max(lead1Level, lead2Level)`.

### Root Cause
The WASM lead FM node had one output that mixed both leads' audio. The JS-side `leadWasmLevelGain` was set to `Math.max(lead1Level, lead2Level)`. This meant Lead 1 audio passed through even when `lead1Level = 0` because Lead 2's level kept the gain up.

### Why Velocity Scaling Was Wrong
Initial fix attempted to scale per-note velocity by `thisLeadLvl / maxLvl`. This killed everything — dry signal, reverb send, AND granular send — which breaks the pre-fader send workflow (Lead 1 level=0, reverb send=100% should produce reverb-only output).

### Solution
Give the WASM worklet **two separate outputs**:

**C++ (`kessho_lead_fm.cpp`):**
- `LeadNote` struct gets `int lead_index` field (0=lead1, 1=lead2)
- New `g_output_lead2[MAX_BLOCK_SIZE * 2]` buffer
- `lead_fm_process_block()` routes notes to separate dry buffers by `lead_index`, then applies shared delay to both
- New `lead_fm_note_on_ex(freq, vel, hold, lead_index)` and `lead_fm_get_output2_ptr()`

**Worklet JS:**
- `numberOfOutputs: 2, outputChannelCount: [2, 2]`
- `process()` writes `outputs[0]` from `g_output` and `outputs[1]` from `g_output_lead2`

**Engine.ts:**
- `output[0]` → `leadWasmLevelGain` (lead1Level) → `leadVoiceLevel` → master
- `output[1]` → `leadWasmLead2LevelGain` (lead2Level) → `leadVoiceLevel` → master
- Pre-fader sends: `output[0]` → `lead1ReverbSend` + `granularLead1Send`; `output[1]` → `lead2ReverbSend` + `granularLead2Send`

### Key Insight
When a WASM worklet mixes multiple voices into one output, you cannot implement per-voice level control on the JS side without losing pre-fader send routing. Use multiple `AudioWorkletNode` outputs instead.

---

## Lead Delay Time Double-Division Bug

### Problem
Lead delay sounded much shorter than expected.

### Root Cause
`playLeadNote()` sent `delayTime / 1000` to the WASM worklet, but the worklet's `applyDelay()` function also divided by 1000 internally. The delay time was being divided by 1,000,000 instead of 1,000.

### Solution
Send raw milliseconds: `timeL: delayTime` (not `timeL: delayTime / 1000`). The worklet handles the ms→seconds conversion.

### Key Insight
When passing values through JS → postMessage → worklet → WASM, verify unit conversions at each boundary. Don't assume the worklet expects the same units as the JS caller.

---

## S&H Reverb Send Fixes (shv() Pattern)

### Problem
Reverb send gain nodes were reading `state.synthReverbSend` etc. directly, ignoring S&H sampled values. When a reverb send slider was in S&H mode, the 10Hz re-sampling had no audible effect.

### Solution
Created an `shv()` helper (Sample & Hold Value) inside `applyParams()`:
```typescript
const shv = (key: string, fallback: number) => this.shSampledValues[key] ?? fallback;
```

Applied to all 8 reverb sends:
- `synthReverbSend`, `granularReverbSend`
- `lead1ReverbSend`, `lead2ReverbSend` (per-lead)
- `waterReverbSend`, `oceanReverbSend`, `insectsReverbSend`
- `drumReverbSend` (in `sendDrumWasmParams`, reads `this.shSampledValues['drumReverbSend'] ?? s.drumReverbSend`)

### Key Insight
Any gain node whose value comes from `state.*` and could be in S&H mode must use `shv()` instead. The 10Hz timer populates `shSampledValues` for all keys in `dualRanges`, but the consuming code must opt in.

---

## S&H Position Indicators (Callback Enhancement)

### Problem
S&H slider indicators showed a midpoint flash but not the actual sampled position within the dual range.

### Root Cause
The `onGranularSHTrigger` callback only sent key names (`string[]`), not positions. The UI had no way to know where within the range the value was sampled.

### Solution
Changed callback signature from `(keys: string[]) => void` to `(positions: Record<string, number>) => void`. Each key maps to a 0-1 normalized position: `(sampled - min) / (max - min)`. The UI stores these in `shPositions` state and passes them as `walkPosition` fallback to the slider component.

### Key Insight
Zero CPU cost — the 10Hz timer already computes `shSampledValues[key]` and has access to `dualRanges[key].min/max`. The normalization is a single division per key.

---

## WASM Build on Windows (Emscripten via Python)

### Problem
Building WASM C++ on Windows via Emscripten had multiple failure modes.

### Issues & Fixes
1. **`python` not found**: Windows app alias intercepts `python` → use `py` launcher instead
2. **`-flto` causes MemoryError**: LTO triggers Python OOM during Emscripten system library compilation on machines with limited RAM → remove `-flto`, use `-O2` only
3. **`EMCC_CORES` must be 1**: Multiple compiler cores cause parallel MemoryError → set `env["EMCC_CORES"] = "1"` in build script
4. **Group policy blocks npm**: Use `& "C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js"` instead

### Build Script Pattern (`build.py`)
```python
env = os.environ.copy()
env["EMSDK"] = EMSDK_ROOT
env["EM_CONFIG"] = os.path.join(EMSDK_ROOT, ".emscripten")
env["EMCC_SKIP_SANITY_CHECK"] = "1"
env["EMCC_CORES"] = "1"  # CRITICAL

# Use emcc.py directly via Python interpreter
EMCC = [sys.executable, os.path.join(EMSDK_ROOT, "upstream", "emscripten", "emcc.py")]

# Flags: NO -flto
cmd = EMCC + [SRC, "-o", OUT, "-std=c++17", "-O2", "-fno-exceptions", "-fno-rtti",
              "-sSTANDALONE_WASM=1", "-sALLOW_MEMORY_GROWTH=1", "--no-entry",
              f"-sEXPORTED_FUNCTIONS={EXPORTS_STR}"]
```

### Key Insight
The reverb WASM uses `-O3 -flto` successfully, but the lead-fm WASM cannot on this machine. The difference is likely code size / template instantiation volume. Always have a no-LTO fallback.