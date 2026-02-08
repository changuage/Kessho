# Kessho Enhancements Roadmap

This document tracks planned enhancements and their implementation status.

---

## Journey Mode - Diamond Matrix UI (Feb 2026)

### Implementation Status: Web [x] | iOS [ ]

### Overview

Journey Mode is a new way to experience Kessho that automatically morphs between presets over time. Users configure a "journey" with up to 4 presets positioned in a diamond pattern, then press play to let the app smoothly transition between them.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         JOURNEY MODE ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  DiamondJourneyUI│────▶│   journeyState   │────▶│     App.tsx      │
│   (Visual UI)    │     │   (State Hook)   │     │  (Audio Control) │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  journeyTypes.ts │     │ JourneyModeView  │     │   audioEngine    │
│   (Type Defs)    │     │  (UI Wrapper)    │     │  (Sound Output)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Diamond Matrix Layout

```
                    ◎ P2 (top/12:00)
                   ╱    ╲
       ◎ P1 ────  ◉ START ────  ◎ P3
      (left)       ╲    ╱      (right)
                    ◎ P4 (bottom/6:00)
```

- **P1-P4**: Four preset slots at cardinal positions
- **START (Center)**: Journey begins here, optionally ends here
- **Connections**: Curved paths between nodes with probability weights

### Node Colors by Position

| Position | Color | Hex |
|----------|-------|-----|
| Left (P1) | Cyan | `#4fc3f7` |
| Top (P2) | Orange | `#C4724E` |
| Right (P3) | Green | `#7B9A6D` |
| Bottom (P4) | Gold | `#D4A520` |
| Center | Purple | `#8B5CF6` |

### Key Files

| File | Purpose |
|------|---------|
| `src/audio/journeyTypes.ts` | Type definitions, constants, helper functions |
| `src/ui/journeyState.ts` | Main state management hook (`useJourney`) |
| `src/ui/DiamondJourneyUI.tsx` | Visual diamond matrix UI component |
| `src/ui/JourneyModeView.tsx` | Wrapper connecting UI to audio |
| `src/App.tsx` | Journey callbacks, morph animation, integration |

### State Machine Phases

| Phase | Description |
|-------|-------------|
| `idle` | Journey not playing |
| `playing` | At a node, playing its preset |
| `morphing` | Transitioning between two nodes |
| `self-loop` | Node connecting to itself (phrase repeat) |
| `ending` | Fading out to center node |
| `ended` | Journey complete |

### Morph Flow (Continuous Alternating)

The morph system alternates direction to avoid audio glitches:

```
1. Start: A=Preset1, position=0
2. Morph 1 (toB): B=Preset2, morph 0→100
3. Morph 2 (toA): A=Preset3, morph 100→0
4. Morph 3 (toB): B=Preset4, morph 0→100
5. Morph 4 (toA): A=Preset5, morph 100→0
   ... continues alternating
```

This ensures smooth audio transitions - the next preset always loads into the opposite slot from where we just arrived.

### Timing System

- **PHRASE_LENGTH**: 16 seconds (from `harmony.ts`)
- **msPerPhrase**: `PHRASE_LENGTH * 1000` milliseconds
- All durations specified in phrases (e.g., "play for 4 phrases" = 64 seconds)

### Key Implementation Details

#### React State Timing Fix
Journey morph uses refs (`journeyPresetARef`, `journeyPresetBRef`) updated synchronously to avoid stale closure issues with React's async state updates.

#### Integration Points
- **handleJourneyLoadPreset**: Loads initial preset, starts audio
- **handleJourneyMorphTo**: Animates morph to target preset
- **handleJourneyEnd**: Cleans up, unlocks sliders
- **handleStop**: Now also stops journey playback

#### UI State Persistence
Journey state is managed at App.tsx level so switching between UI modes (Snowflake/Advanced/Journey) preserves playback state.

### Debug Panel Info

When journey is playing, Debug Panel shows:
- Phase (playing/morphing/etc.)
- Current preset name
- Next preset name
- Phrases left / Morph progress
- Time remaining
- Morph direction (toA/toB)
- Morph position (0-100%)

---

## Morph Endpoint Behavior Fixes (Feb 2026)

### Implementation Status: Web [x] | iOS [partial]

### Problem
1. **Main Morph**: When at position 100 (fully at Preset B), changing Preset A would incorrectly update all parameters to Preset A values
2. **Drum Morph**: Changing Preset A while at B would clear all user overrides including those at endpoint B
3. **Drum Dual Sliders**: Switching to dual mode at endpoint B, then changing Preset A, would revert the slider to single mode

### Solution

#### Main Morph Fix
Changed the preset loading logic from:
```typescript
const inMidMorph = morphPresetB && isInMidMorph(morphPosition, true);
if (!inMidMorph) { /* apply preset A values */ }
```
to:
```typescript
const atEndpoint0 = isAtEndpoint0(morphPosition, true);
const shouldApplyPresetA = atEndpoint0 || !morphPresetB;
if (shouldApplyPresetA) { /* apply preset A values */ }
```

This ensures preset A values only apply when:
- At endpoint 0 (position ≈ 0)
- OR no preset B is loaded yet

**iOS**: Same logic applied to `loadPreset()` in AppState.swift.

#### Drum Morph Override Fix
Created new function `clearDrumMorphEndpointOverrides(voice, endpoint)` that selectively clears only the specified endpoint's overrides, preserving the other endpoint's user edits.

**iOS**: Not yet implemented - iOS drum synth doesn't have the per-voice preset/morph system.

#### Drum Dual Slider Persistence Fix
Modified the dual slider reset logic to check current morph position:
```typescript
const isPresetA = keyStr.includes('PresetA');
const atEndpoint0 = currentMorph < 0.01;
const atEndpoint1 = currentMorph > 0.99;
const shouldResetDualModes = (isPresetA && !atEndpoint1) || (!isPresetA && !atEndpoint0);
```

Dual modes only reset when the changed preset affects the current position.

**iOS**: Not yet implemented - requires drum voice preset system first.

### Files Changed
- `src/audio/morphUtils.ts` - New shared morph utilities
- `src/audio/drumMorph.ts` - Added `clearDrumMorphEndpointOverrides`
- `src/App.tsx` - Updated preset loading and dual mode reset logic
- `KesshoiOS/Kessho/State/AppState.swift` - Fixed main morph preset loading

---

## Advanced UI Panel Restructure

### Overview
Reorganize the Advanced UI from a single long scrolling panel into clearly separated window sections, each with its own icon. This improves navigation, reduces cognitive load, and groups related controls logically.

### Implementation Status: Web [x] | iOS [x]

### Panel Structure

| Panel | Icon | Description | Contents |
|-------|------|-------------|----------|
| **Global** | ◎ | Master controls & presets | Master Mixer, Global/Seed, Scale Mode, Tension, Preset Morph, Cloud Presets |
| **Synth + Lead** | ∿ | Melodic instruments | Harmony/Pitch (minus Scale/Tension), Timbre, Lead Synth, Euclidean Sequencer |
| **Drum Synth** | ⋮⋮ | Percussion | All DrumSynth controls (voices, Euclidean, master) |
| **FX** | ◈ | Effects processing | Space (Reverb), Granular, Wave (Ocean) |

**Note:** Debug panel appears at the bottom of every window section (not a separate panel).

### Icon Alternatives
Consider these minimalist Unicode icons for each panel:

| Panel | Option A | Option B | Option C |
|-------|----------|----------|----------|
| Global | ◎ (bullseye) | ⊕ (circled plus) | ⌂ (home) |
| Synth + Lead | ♪ (note) | ⎎ (wave) | ≋ (triple wave) |
| Drum Synth | ◇ (diamond) | ⬡ (hexagon) | ⊡ (squared dot) |
| FX | ◈ (diamond target) | ✦ (star) | ⋮⋮ (dots) |

### Parameter Relocations

| Parameter | From | To |
|-----------|------|-----|
| `scaleMode` | Harmony/Pitch | Global |
| `manualScale` | Harmony/Pitch | Global |
| `tension` | Harmony/Pitch | Global |

### Global Panel Contents
- **Master Mixer**: masterVolume, synthLevel, granularLevel, reverbLevel, all send levels
- **Global/Seed**: seedWindow, randomness, rootNote
- **Circle of Fifths Drift**: cofDriftEnabled, cofDriftRate, cofDriftDirection, cofDriftRange
- **Scale & Tension**: scaleMode, manualScale, tension (moved from Harmony)
- **Preset Morph**: morphValue, morphDuration, preset A/B selection
- **Cloud Presets**: Load/save from Supabase
- **Debug** (bottom): Debug controls always visible

### Synth + Lead Panel Contents
- **Harmony/Pitch**: chordRate, voicingSpread, waveSpread, detune (Scale/Tension removed)
- **Synth ADSR**: synthAttack, synthDecay, synthSustain, synthRelease
- **Synth Voices**: synthVoiceMask, synthOctave
- **Timbre**: hardness, oscBrightness, filterType, filterCutoff, filterResonance, warmth, presence, airNoise
- **Lead Synth**: All lead parameters (enabled, level, ADSR, delay, etc.)
- **Euclidean Sequencer**: All 4 lanes with steps, hits, rotation, probability, source
- **Debug** (bottom): Debug controls always visible

### Drum Synth Panel Contents
- All 6 drum voices (Sub, Kick, Snare, Hi-hat, Click, Noise)
- Drum Euclidean (4 lanes)
- Drum master (level, reverb send, tempo, swing)
- **Debug** (bottom): Debug controls always visible

### FX Panel Contents
- **Space (Reverb)**: reverbEnabled, reverbEngine, reverbType, reverbQuality, decay, size, diffusion, modulation, predelay, damping, width
- **Granular**: granularEnabled, all grain parameters
- **Wave (Ocean)**: oceanSampleLevel, oceanFilterCutoff, all ocean parameters
- **Debug** (bottom): Debug controls always visible

### UI/UX Considerations
- Each panel has a header bar with icon + title
- Panels can be collapsed/expanded independently
- Active panel indicated with highlight color
- Panel state persisted in localStorage
- Debug section duplicated at bottom of each panel for easy access
- Mobile: Swipe between panels or accordion style
- Web: Tab bar at top or sidebar navigation

### Implementation Checklist

#### Web
- [ ] Create panel container component with icon + title + collapse
- [ ] Separate Advanced.tsx into 4 panel components
- [ ] Add tab bar or navigation between panels
- [ ] Move Scale Mode + Tension to Global panel
- [ ] Add Debug section to bottom of each panel
- [ ] Persist panel collapse state to localStorage
- [ ] Update App.tsx to render new panel structure
- [ ] Responsive: stack vertically on mobile

#### iOS
- [ ] Create panel container view with icon + title + collapse
- [ ] Separate SliderControlsView into 4 sections
- [ ] Add TabView or navigation between panels
- [ ] Move Scale Mode + Tension to Global panel
- [ ] Add Debug section to bottom of each panel
- [ ] Persist panel state with @AppStorage
- [ ] Update MainView to render new panel structure

---

## Euclidean Sequencer Enhancement

### Overview
Transform the Euclidean sequencer from a lead-synth-only feature into a versatile multi-source polyrhythmic tool with its own dedicated menu.

### Current State (IMPLEMENTED ✓)
- Euclidean sequencer has probability and source controls per lane
- Can trigger Lead Synth OR individual Synth voices (1-6)
- 4 lanes with: steps, hits, rotation, preset, note range, level, probability, source
- Master enable and tempo controls
- Synth chord sequencer can be toggled off

---

### Phase 1: Probability Hit Parameter + Separate Menu

#### 1.1 Add Probability Hit Parameter ✓
- [x] **State**: Add `leadEuclid[1-4]Probability` to `SliderState` (0-1, default 1.0)
- [x] **Engine**: Modify `scheduleLeadMelody()` to check probability before scheduling each hit
- [x] **UI**: Add probability slider to each lane in the Euclidean section
- [x] **Presets**: STATE_KEYS updated to include probability

#### 1.2 Move Euclidean to Separate Menu ✓
- [x] **UI**: Create new collapsible "Euclidean Sequencer" panel in App.tsx
- [x] **UI**: Remove Euclidean controls from Lead Synth section
- [x] **UI**: Add visual indicator showing which sound sources are active

---

### Phase 2: Multi-Source Sound Selection ✓

#### 2.1 Add Sound Source Selection Per Lane ✓
- [x] **State**: Add `leadEuclid[1-4]Source` to `SliderState` 
  - Values: `'lead'` | `'synth1'` | `'synth2'` | `'synth3'` | `'synth4'` | `'synth5'` | `'synth6'`
  - Default: `'lead'`
- [x] **UI**: Add source dropdown to each lane
- [x] **Engine**: Route Euclidean triggers to appropriate sound source

#### 2.2 Implement Source Routing Logic ✓

**Lead Synth Source Behavior:**
- [x] Euclidean mode already disables the random lead sequencer when enabled

**Synth Voice Source Behavior:**
- [x] When a lane selects `'synthN'` as source:
  - Triggers that specific synth voice independently
  - Existing synth chord sequencer can be toggled
  
- [x] **State**: Add `synthChordSequencerEnabled` boolean (default: true)
  - When `false`: Synth voices only play from Euclidean triggers
  - When `true`: Normal chord changes continue + Euclidean overlays additional notes

#### 2.3 Engine Modifications ✓
- [x] Create `triggerSynthVoice(voiceIndex, frequency, velocity)` method
- [x] Modify Euclidean scheduling to check `source` per lane
- [x] Add `synthChordSequencerEnabled` check in `onPhraseBoundary()` and initial chord application

---

### State Changes Summary (IMPLEMENTED)

```typescript
// New properties for SliderState:
interface SliderState {
  // ... existing ...
  
  // Phase 1: Probability
  leadEuclid1Probability: number;  // 0-1, default 1.0
  leadEuclid2Probability: number;
  leadEuclid3Probability: number;
  leadEuclid4Probability: number;
  
  // Phase 2: Sound Source Selection
  leadEuclid1Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  leadEuclid2Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  leadEuclid3Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  leadEuclid4Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  
  // Phase 2: Synth Sequencer Control
  synthChordSequencerEnabled: boolean;  // default true
}
```

---

### UI Design Notes

**Current Lane Layout (per lane when enabled):**
```
┌─ Lane N ──────────────────────────────────────────────┐
│ [Pattern Dots Visualization]                          │
│ Preset: [Dropdown]                                    │
│ Note Range: [Low slider] [High slider]                │
│ Level: [====○====]  Rotate: [←] [→]                  │
│ Probability: [====○====]  Source: [Dropdown]          │
│ (If custom: Steps + Hits sliders)                     │
└───────────────────────────────────────────────────────┘
```

**Synth Chord Sequencer Toggle (in Harmony panel):**
│ Lane 1: [✓] Source: [Lead ▼]                         │
│   Preset: [Lancaran ▼]  Probability: [====○]         │
│   Steps: 16  Hits: 4  Rotation: 0  Level: [===]      │
│   Note Range: [C4] to [C6]                           │
│                                                       │
│ Lane 2: [✓] Source: [Synth 1 ▼]                      │
│   ...                                                 │
│                                                       │
│ ─── Synth Options ───                                │
│ [✓] Chord Sequencer Enabled                          │
│   (Disable to use only Euclidean for synth voices)   │
└───────────────────────────────────────────────────────┘
```

---

### Implementation Order

1. **State changes** - Add new properties to SliderState with defaults
2. **Probability** - Simple addition, low risk
3. **UI reorganization** - Move to separate panel
4. **Source selection state** - Add source property per lane
5. **Lead routing** - Implement lead sequencer disable logic
6. **Synth voice trigger** - Create independent voice trigger method
7. **Synth routing** - Route Euclidean to synth voices
8. **Synth sequencer toggle** - Add chord sequencer disable option

---

### Testing Checklist

- [x] Probability 0 = no notes, 1 = all notes, 0.5 = ~half
- [x] Lead source + Euclidean enabled → existing lead sequencer disabled
- [x] Lead source + Euclidean disabled → existing lead sequencer works
- [x] Synth source → triggers individual voice
- [x] Synth chord sequencer enabled → both Euclidean and chords play
- [x] Synth chord sequencer disabled → only Euclidean triggers synth
- [x] Multiple lanes with different sources work simultaneously
- [x] Preset save/load includes all new parameters
- [ ] iOS parity (implement after web verified)

---

## Reverb Enable Toggle (CPU Saver)

### Overview
Add a reverb on/off toggle to save CPU when reverb is not needed. Defaults to ON.

### Implementation (IMPLEMENTED ✓)
- [x] **State**: Add `reverbEnabled: boolean` to `SliderState` (default: true)
- [x] **Engine**: Mute all reverb sends when disabled (synth, granular, lead, leadDelay)
- [x] **Engine**: Skip reverb parameter updates when disabled
- [x] **UI**: Add toggle button in Space panel with "Active" / "Bypassed (saves CPU)" states
- [x] **iOS**: Full parity - SliderState, AudioEngine, SliderControlsView, AppState updated

---

## Ryoji Ikeda-Style Drum Synth

### Overview
Add a minimalist, data-driven percussion synthesizer inspired by Ryoji Ikeda's aesthetic: sharp digital impulses, pure sine beeps, sub-bass pulses, noise bursts, and mathematical precision. Features its own probability-based random triggering and a dedicated 4-lane Euclidean sequencer.

### Sound Design Philosophy
Ryoji Ikeda's signature sound elements:
- **Extreme precision** - clicks and impulses measured in milliseconds
- **Pure tones** - sine waves, no harmonics
- **Dynamic range** - silence to full volume instantly
- **Frequency extremes** - sub-bass (20-60Hz) and ultra-highs (8-16kHz)
- **Digital artifacts** - intentional bit reduction, sample rate effects
- **Polyrhythmic patterns** - mathematical, interlocking sequences

---

### Phase 1: Drum Voice Architecture

#### 1.1 Drum Voice Types (6 voices)

| Voice | Name | Sound Source | Typical Use |
|-------|------|--------------|-------------|
| 1 | **Sub** | Low sine (30-80Hz) | Bass pulse, felt more than heard |
| 2 | **Kick** | Sine w/ pitch env (80-200Hz) | Percussive thump |
| 3 | **Click** | Impulse/noise burst | Sharp transient, the "data" sound |
| 4 | **Beep Hi** | High sine (2-8kHz) | Melodic ping, notification tone |
| 5 | **Beep Lo** | Mid sine (200-800Hz) | Lower pitched tone |
| 6 | **Noise** | Filtered white noise | Texture, hi-hat substitute |

#### 1.2 Per-Voice Parameters

```typescript
interface DrumVoiceParams {
  // Pitch
  frequency: number;      // Base frequency (Hz)
  pitchEnvAmount: number; // Pitch envelope depth (semitones, for kick)
  pitchEnvDecay: number;  // Pitch envelope decay time (ms)
  
  // Amplitude Envelope
  attack: number;         // 0-50ms (most voices use 0-2ms)
  decay: number;          // 5-500ms
  
  // Tone
  noiseAmount: number;    // 0-1, blend noise with tone
  bitDepth: number;       // 4-16 bits (lo-fi effect)
  
  // Level
  level: number;          // 0-1 output gain
}
```

#### 1.3 Voice Synthesis Details

**Sub (Voice 1):**
```
Oscillator: Sine @ 30-80Hz
Envelope: Attack 0ms, Decay 50-200ms
Character: Pure, clean sub-bass pulse
```

**Kick (Voice 2):**
```
Oscillator: Sine @ 80-200Hz with pitch envelope
Pitch Env: Start at 2-4x base freq, decay to base in 20-80ms
Envelope: Attack 0ms, Decay 50-300ms
Character: Classic 808-style but cleaner
```

**Click (Voice 3):**
```
Source: Single-sample impulse OR 1-5ms noise burst
Filter: Optional highpass @ 2kHz
Envelope: Attack 0ms, Decay 1-20ms
Character: Digital, precise, "data transmission" sound
```

**Beep Hi (Voice 4):**
```
Oscillator: Sine @ 2000-8000Hz
Envelope: Attack 0-5ms, Decay 20-200ms
Character: Notification ping, sonar, digital chirp
```

**Beep Lo (Voice 5):**
```
Oscillator: Sine @ 200-800Hz
Envelope: Attack 0-5ms, Decay 20-200ms  
Character: Lower melodic tone, Morse code feel
```

**Noise (Voice 6):**
```
Source: White noise
Filter: Bandpass or Highpass, adjustable cutoff
Envelope: Attack 0-2ms, Decay 10-100ms
Character: Hi-hat, static burst, texture
```

---

### Phase 2: Random Probability Engine

#### 2.1 Per-Voice Random Triggering
Each voice has its own probability-based random trigger system (similar to existing lead synth random mode):

```typescript
interface DrumRandomParams {
  enabled: boolean;           // Random mode on/off
  probability: number;        // 0-1, chance per tick
  minInterval: number;        // Minimum ms between triggers
  maxInterval: number;        // Maximum ms between triggers
  velocityMin: number;        // 0-1 random velocity range
  velocityMax: number;        // 0-1
}
```

#### 2.2 Global Random Parameters
```typescript
interface DrumGlobalParams {
  randomMasterEnabled: boolean;  // Enable/disable all random triggers
  randomDensity: number;         // 0-1 scales all probabilities
  randomSync: boolean;           // Sync to global tempo subdivisions
}
```

---

### Phase 3: Euclidean Sequencer (4 lanes)

#### 3.1 Dedicated Drum Euclidean Sequencer
Separate from the existing lead/synth Euclidean sequencer:

```typescript
interface DrumEuclidLane {
  enabled: boolean;
  steps: number;              // 2-32
  hits: number;               // 1-steps
  rotation: number;           // 0 to steps-1
  preset: EuclideanPreset;    // Custom or named pattern
  target: DrumVoiceTarget;    // 'sub'|'kick'|'click'|'beepHi'|'beepLo'|'noise'
  probability: number;        // 0-1 per-hit probability
  velocityMin: number;        // Random velocity range
  velocityMax: number;
  level: number;              // Lane output level
}
```

#### 3.2 Sequencer Master Controls
```typescript
interface DrumEuclidMaster {
  enabled: boolean;           // Master enable
  tempo: number;              // BPM (can sync to global or independent)
  tempoSync: boolean;         // Lock to main tempo
  swing: number;              // 0-100% swing amount
  division: TempoDiv;         // 1/4, 1/8, 1/16, 1/32
}
```

---

### Phase 4: State Schema

```typescript
interface SliderState {
  // ... existing properties ...
  
  // ─── Drum Synth Master ───
  drumEnabled: boolean;                    // Master on/off
  drumLevel: number;                       // 0-1 master volume
  drumReverbSend: number;                  // 0-1 send to main reverb
  drumBitCrush: number;                    // 4-16 bit depth (16 = off)
  
  // ─── Voice 1: Sub ───
  drumSubFreq: number;                     // 30-80 Hz
  drumSubDecay: number;                    // 50-500 ms
  drumSubLevel: number;                    // 0-1
  
  // ─── Voice 2: Kick ───
  drumKickFreq: number;                    // 40-200 Hz
  drumKickPitchEnv: number;                // 0-48 semitones
  drumKickPitchDecay: number;              // 10-100 ms
  drumKickDecay: number;                   // 50-500 ms
  drumKickLevel: number;                   // 0-1
  
  // ─── Voice 3: Click ───
  drumClickDecay: number;                  // 1-50 ms
  drumClickFilter: number;                 // Highpass freq 500-10000 Hz
  drumClickNoiseAmount: number;            // 0-1 (0=impulse, 1=noise)
  drumClickLevel: number;                  // 0-1
  
  // ─── Voice 4: Beep Hi ───
  drumBeepHiFreq: number;                  // 2000-12000 Hz
  drumBeepHiAttack: number;                // 0-20 ms
  drumBeepHiDecay: number;                 // 10-500 ms
  drumBeepHiLevel: number;                 // 0-1
  
  // ─── Voice 5: Beep Lo ───
  drumBeepLoFreq: number;                  // 200-2000 Hz
  drumBeepLoAttack: number;                // 0-20 ms
  drumBeepLoDecay: number;                 // 10-500 ms
  drumBeepLoLevel: number;                 // 0-1
  
  // ─── Voice 6: Noise ───
  drumNoiseFilter: number;                 // Cutoff freq 500-15000 Hz
  drumNoiseFilterQ: number;                // 0.5-10 resonance
  drumNoiseDecay: number;                  // 5-200 ms
  drumNoiseLevel: number;                  // 0-1
  
  // ─── Drum Random Mode ───
  drumRandomEnabled: boolean;              // Master random enable
  drumRandomDensity: number;               // 0-1 global probability scale
  drumRandomSub: number;                   // 0-1 per-voice probability
  drumRandomKick: number;
  drumRandomClick: number;
  drumRandomBeepHi: number;
  drumRandomBeepLo: number;
  drumRandomNoise: number;
  drumRandomMinInterval: number;           // 50-2000 ms
  drumRandomMaxInterval: number;           // 50-2000 ms
  
  // ─── Drum Euclidean Lane 1 ───
  drumEuclid1Enabled: boolean;
  drumEuclid1Steps: number;
  drumEuclid1Hits: number;
  drumEuclid1Rotation: number;
  drumEuclid1Preset: string;
  drumEuclid1Target: 'sub'|'kick'|'click'|'beepHi'|'beepLo'|'noise';
  drumEuclid1Probability: number;
  drumEuclid1Level: number;
  
  // ─── Drum Euclidean Lane 2 ───
  drumEuclid2Enabled: boolean;
  drumEuclid2Steps: number;
  drumEuclid2Hits: number;
  drumEuclid2Rotation: number;
  drumEuclid2Preset: string;
  drumEuclid2Target: 'sub'|'kick'|'click'|'beepHi'|'beepLo'|'noise';
  drumEuclid2Probability: number;
  drumEuclid2Level: number;
  
  // ─── Drum Euclidean Lane 3 ───
  drumEuclid3Enabled: boolean;
  drumEuclid3Steps: number;
  drumEuclid3Hits: number;
  drumEuclid3Rotation: number;
  drumEuclid3Preset: string;
  drumEuclid3Target: 'sub'|'kick'|'click'|'beepHi'|'beepLo'|'noise';
  drumEuclid3Probability: number;
  drumEuclid3Level: number;
  
  // ─── Drum Euclidean Lane 4 ───
  drumEuclid4Enabled: boolean;
  drumEuclid4Steps: number;
  drumEuclid4Hits: number;
  drumEuclid4Rotation: number;
  drumEuclid4Preset: string;
  drumEuclid4Target: 'sub'|'kick'|'click'|'beepHi'|'beepLo'|'noise';
  drumEuclid4Probability: number;
  drumEuclid4Level: number;
  
  // ─── Drum Euclidean Master ───
  drumEuclidMasterEnabled: boolean;
  drumEuclidTempo: number;                 // BPM
  drumEuclidTempoSync: boolean;            // Sync to global tempo
  drumEuclidSwing: number;                 // 0-100%
  drumEuclidDivision: number;              // 4, 8, 16, 32
}
```

---

### Phase 5: Engine Implementation

#### 5.1 DrumSynth Class Structure

```typescript
class DrumSynth {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private reverbSend: GainNode;
  private bitCrusher: AudioWorkletNode;  // Optional
  
  // Voice nodes (created on-demand for each trigger)
  private voicePool: Map<string, DrumVoice>;
  
  // Scheduling
  private euclidScheduler: DrumEuclidScheduler;
  private randomScheduler: DrumRandomScheduler;
  
  // Public methods
  triggerVoice(voice: DrumVoiceType, velocity: number, time?: number): void;
  applyParams(state: SliderState): void;
  start(): void;
  stop(): void;
}
```

#### 5.2 Voice Trigger Implementation

```typescript
triggerSub(velocity: number, time: number): void {
  const osc = this.ctx.createOscillator();
  const gain = this.ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = this.params.drumSubFreq;
  
  gain.gain.setValueAtTime(velocity, time);
  gain.gain.exponentialRampToValueAtTime(
    0.001, 
    time + this.params.drumSubDecay / 1000
  );
  
  osc.connect(gain);
  gain.connect(this.masterGain);
  
  osc.start(time);
  osc.stop(time + this.params.drumSubDecay / 1000 + 0.01);
}

triggerKick(velocity: number, time: number): void {
  const osc = this.ctx.createOscillator();
  const gain = this.ctx.createGain();
  
  osc.type = 'sine';
  
  // Pitch envelope: start high, decay to base freq
  const startFreq = this.params.drumKickFreq * 
    Math.pow(2, this.params.drumKickPitchEnv / 12);
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(
    this.params.drumKickFreq,
    time + this.params.drumKickPitchDecay / 1000
  );
  
  // Amplitude envelope
  gain.gain.setValueAtTime(velocity, time);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    time + this.params.drumKickDecay / 1000
  );
  
  osc.connect(gain);
  gain.connect(this.masterGain);
  
  osc.start(time);
  osc.stop(time + this.params.drumKickDecay / 1000 + 0.01);
}

triggerClick(velocity: number, time: number): void {
  // Two modes: impulse or noise burst
  if (this.params.drumClickNoiseAmount < 0.5) {
    // Impulse mode: single sample or very short buffer
    this.playImpulse(velocity, time);
  } else {
    // Noise burst mode
    const noise = this.createNoiseBuffer(this.params.drumClickDecay);
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    filter.type = 'highpass';
    filter.frequency.value = this.params.drumClickFilter;
    
    gain.gain.setValueAtTime(velocity, time);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      time + this.params.drumClickDecay / 1000
    );
    
    source.buffer = noise;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    source.start(time);
  }
}
```

#### 5.3 Bit Crusher (Optional AudioWorklet)

```javascript
// drum-bitcrush.worklet.js
class BitCrushProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16 }];
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const bits = parameters.bits[0];
    const step = Math.pow(0.5, bits);
    
    for (let channel = 0; channel < input.length; channel++) {
      for (let i = 0; i < input[channel].length; i++) {
        output[channel][i] = step * Math.floor(input[channel][i] / step + 0.5);
      }
    }
    return true;
  }
}
```

---

### Phase 6: UI Design

#### 6.1 Drum Synth Panel Layout

```
┌─ Drum Synth ────────────────────────────────────────────────┐
│ [✓ Enabled]  Level: [====○====]  Reverb: [===○===]         │
│                                                              │
│ ─── Voices ───                                               │
│ Sub:     [30 Hz ▼]  Decay: [===]  Level: [===]              │
│ Kick:    [60 Hz ▼]  Pitch: [===]  Decay: [===]  Level: [===]│
│ Click:   Decay: [===]  Filter: [===]  Noise: [○]  Level: [===]│
│ Beep Hi: [4kHz ▼]  Atk: [=]  Decay: [===]  Level: [===]     │
│ Beep Lo: [400Hz ▼]  Atk: [=]  Decay: [===]  Level: [===]    │
│ Noise:   Filter: [===]  Q: [=]  Decay: [===]  Level: [===]  │
│                                                              │
│ ─── Random Triggers ───                                      │
│ [✓ Enabled]  Density: [====○====]                           │
│ Interval: [100ms] to [500ms]                                 │
│ Sub: [===]  Kick: [===]  Click: [===]                        │
│ BeepHi: [===]  BeepLo: [===]  Noise: [===]                   │
│                                                              │
│ ─── Euclidean Sequencer ───                                  │
│ [✓ Enabled]  [Sync ✓]  Division: [1/16 ▼]  Swing: [===]     │
│                                                              │
│ Lane 1: [✓] Target: [Click ▼]  Prob: [===]  Level: [===]    │
│   [● ○ ○ ● ○ ○ ● ○ ○ ● ○ ○ ● ○ ○ ○]  Steps: 16  Hits: 5    │
│                                                              │
│ Lane 2: [✓] Target: [Sub ▼]  Prob: [===]  Level: [===]      │
│   [● ○ ○ ○ ● ○ ○ ○ ● ○ ○ ○ ● ○ ○ ○]  Steps: 16  Hits: 4    │
│                                                              │
│ Lane 3: [ ] Target: [Beep Hi ▼]  ...                        │
│ Lane 4: [ ] Target: [Noise ▼]  ...                          │
└──────────────────────────────────────────────────────────────┘
```

#### 6.2 Compact Voice Presets
Quick-select common Ikeda-style configurations:

| Preset | Description |
|--------|-------------|
| **Minimal** | Sub + Click only, sparse random |
| **Data Stream** | Fast clicks, occasional beeps |
| **Pulse** | Sub-heavy, steady Euclidean |
| **Glitch** | All voices, high random density |
| **Morse** | Beeps only, rhythmic patterns |

---

### Implementation Order

1. **State schema** - Add all drum parameters to SliderState
2. **Default values** - Set musical defaults
3. **DrumSynth class** - Basic voice triggering
4. **Voice implementations** - All 6 voice types
5. **Random scheduler** - Probability-based triggers
6. **Euclidean scheduler** - 4-lane pattern sequencer
7. **Bit crusher worklet** - Optional lo-fi effect
8. **UI panel** - All controls
9. **Preset integration** - Save/load drum settings
10. **iOS parity** - Port to Swift/AVAudioEngine

---

### Default Parameter Values

```typescript
// Drum Master
drumEnabled: false,
drumLevel: 0.7,
drumReverbSend: 0.2,
drumBitCrush: 16,  // 16 = no crush

// Sub
drumSubFreq: 50,
drumSubDecay: 150,
drumSubLevel: 0.8,

// Kick  
drumKickFreq: 60,
drumKickPitchEnv: 24,
drumKickPitchDecay: 30,
drumKickDecay: 200,
drumKickLevel: 0.7,

// Click
drumClickDecay: 5,
drumClickFilter: 4000,
drumClickNoiseAmount: 0.3,
drumClickLevel: 0.6,

// Beep Hi
drumBeepHiFreq: 4000,
drumBeepHiAttack: 1,
drumBeepHiDecay: 80,
drumBeepHiLevel: 0.5,

// Beep Lo
drumBeepLoFreq: 400,
drumBeepLoAttack: 2,
drumBeepLoDecay: 100,
drumBeepLoLevel: 0.5,

// Noise
drumNoiseFilter: 8000,
drumNoiseFilterQ: 1,
drumNoiseDecay: 30,
drumNoiseLevel: 0.4,

// Random
drumRandomEnabled: false,
drumRandomDensity: 0.3,
drumRandomSub: 0.1,
drumRandomKick: 0.15,
drumRandomClick: 0.4,
drumRandomBeepHi: 0.2,
drumRandomBeepLo: 0.15,
drumRandomNoise: 0.25,
drumRandomMinInterval: 100,
drumRandomMaxInterval: 500,

// Euclidean (all 4 lanes)
drumEuclid[1-4]Enabled: false,
drumEuclid[1-4]Steps: 16,
drumEuclid[1-4]Hits: 4,
drumEuclid[1-4]Rotation: 0,
drumEuclid[1-4]Preset: 'custom',
drumEuclid[1-4]Target: 'click',
drumEuclid[1-4]Probability: 1.0,
drumEuclid[1-4]Level: 0.7,

// Euclidean Master
drumEuclidMasterEnabled: false,
drumEuclidTempo: 120,
drumEuclidTempoSync: true,
drumEuclidSwing: 0,
drumEuclidDivision: 16,
```

---

### Testing Checklist

- [ ] Each voice triggers correctly with proper envelope
- [ ] Pitch envelope on kick sounds musical
- [ ] Click impulse vs noise modes both work
- [ ] Bit crusher effect audible at low bit depths
- [ ] Random triggers respect probability and interval settings
- [ ] Euclidean patterns generate correctly
- [ ] Multiple Euclidean lanes play simultaneously
- [ ] Probability per-hit works in Euclidean
- [ ] Tempo sync locks to global BPM
- [ ] Swing affects timing appropriately
- [ ] Reverb send routes to main reverb
- [ ] All parameters save/load in presets
- [ ] UI controls responsive and clear
- [ ] CPU usage acceptable with all features enabled
- [ ] iOS parity complete

---

### iOS Implementation Learnings Checklist

These learnings from the web implementation must be applied when porting to iOS:

#### Critical Architecture Learnings
- [x] **RNG Initialization Order**: DrumSynth depends on `rng` (seeded random number generator). On web, `rng` is set in `initializeHarmony()`. DrumSynth must be created AFTER harmony initialization, not in the initial audio graph setup.
- [x] **QUANTIZATION Config**: Any new slider parameters (`drumLevel`, `drumReverbSend`) must be added to the quantization system for sliders to render correctly.
- [x] **Voice Toggle System**: Euclidean lanes use 6 boolean toggles per lane (one per voice) instead of a single dropdown. This allows triggering multiple voices simultaneously.

#### DrumSynth Class Requirements
- [x] **6 Voice Types**: Sub, Kick, Click, BeepHi, BeepLo, Noise
- [x] **Noise Buffer**: Pre-generate 1 second of white noise for Click and Noise voices
- [x] **Master Gain Chain**: masterGain → masterOutput, reverbSend → reverbNode
- [x] **Voice Trigger Callback**: Optional UI callback `onDrumTrigger` for visualization

#### Voice Synthesis Requirements
- [x] **Sub Voice**: Pure sine at 30-100Hz with optional overtone (drumSubTone)
- [x] **Kick Voice**: Sine with pitch envelope (start high, sweep down) + optional click transient
- [x] **Click Voice**: Filtered noise burst with highpass filter and resonance
- [x] **BeepHi Voice**: High sine (2-12kHz) with optional FM modulation for metallic character
- [x] **BeepLo Voice**: Lower sine (150-2000Hz), blends between sine and square based on tone
- [x] **Noise Voice**: Filtered white noise with configurable filter type (lowpass/bandpass/highpass)

#### Scheduler Requirements
- [x] **Random Scheduler**: Timer-based, checks each voice probability per tick, respects minInterval
- [x] **Euclidean Scheduler**: Generates patterns using Bresenham's algorithm with rotation
- [x] **4 Euclidean Lanes**: Each with steps, hits, rotation, preset, target voices, probability, velocity range, level
- [x] **Pattern Presets**: Include all presets (sparse, dense, lancaran, kotekan, tresillo, etc.)
- [x] **Swing**: Applied on offbeats by delaying by swing percentage

#### State Parameters (76+ properties)
- [x] Master: drumEnabled, drumLevel, drumReverbSend
- [x] Voice params (24 total): 4-6 params per voice for freq, decay, level, tone, etc.
- [x] Random mode (10 total): enabled, density, per-voice probabilities, min/max interval
- [x] Euclidean master (5 total): enabled, baseBPM, tempo, swing, division
- [x] Euclidean lanes (14 per lane × 4 = 56 total): enabled, preset, steps, hits, rotation, 6 target booleans, probability, velocityMin, velocityMax, level

#### AudioEngine Integration
- [x] **Mixer Node**: Create `drumMixer` for drum output
- [x] **Connections**: drumMixer → dryMixer (dry path), drumMixer → reverbSend (wet path)
- [x] **Create After Harmony**: Initialize DrumSynth in `start()` after `initializeHarmony()`, not in `setupAudioGraph()`
- [x] **Update in applyParams()**: Call `drumSynth?.updateParams(currentParams)`

#### UI Components
- [x] **DrumSynthView**: Collapsible panel with master controls
- [x] **Voice Section**: Per-voice collapsible panels with freq/decay/level/tone sliders
- [x] **Random Section**: Toggle + density slider + per-voice probability sliders + interval range
- [x] **Euclidean Section**: Master controls + 4 lane editors with pattern visualization
- [x] **Voice Toggles**: 6 toggle buttons per Euclidean lane for target selection

---

### iOS Euclidean UI Parity Checklist

The iOS Euclidean sequencer UI has been updated to match the webapp. ✅

#### Lead/Synth Euclidean (EuclideanLaneView) - COMPLETED ✅
- [x] **Note Range Sliders**: Added dual sliders for noteMin/noteMax with visual range bar.
- [x] **Lane Colors**: Uses distinct colors per lane (orange, green, blue, pink) matching webapp.
- [x] **Rotation Arrow Buttons**: Implemented ←/→ buttons matching webapp UX.
- [x] **Full Preset List (40+)**: Added all presets including World Rhythms and additional Polyrhythmic.
- [x] **Preset Optgroups**: Organized presets into groups (Polyrhythmic, Gamelan, World, Reich) via Menu sections.
- [x] **Pattern Visualization**: Added colored circles showing Euclidean pattern with lane color.
- [x] **Source Picker Colors**: Lead/Synth options use color coding (cyan/green).

#### Drum Euclidean (DrumEuclidLaneView) - COMPLETED ✅
- [x] **Pattern Visualization**: Added colored dots showing Euclidean pattern hits with lane color.
- [x] **Lane Colors**: Uses distinct colors per lane (red, orange, green, purple) matching webapp.
- [x] **Rotation Arrow Buttons**: Implemented ←/→ buttons matching webapp UX.
- [x] **Velocity Range**: Added velocityMin/Max with dual slider and visual range bar.
- [x] **Full Preset List (30+)**: Added all presets with optgroups (Polyrhythmic, Gamelan, World, Reich).
- [x] **Voice Icons**: Uses icons (◉●▪△▽≋) for voices matching webapp.
- [x] **Lane Toggle Button**: Colored circular button with lane number.
- [x] **Pattern Summary in Header**: Shows active voice icons and hits/steps ratio.

#### Master Controls Note
- Master BPM, Tempo, Swing, Division are in the parent Drum Euclidean section, not per-lane (matching webapp structure).

#### Shared Components
- [x] **EuclideanPatternView**: Updated with color parameter and circle visualization.
- [x] **Preset Data Parity**: All 40+ presets exist with correct steps/hits/rotation values.

---

### iOS General UI Parity Checklist - COMPLETED ✅

All major UI differences have been addressed. iOS now matches webapp UI.

#### Harmony / Pitch Section
- [x] **Wave Spread Slider**: In Synth Oscillator section (intentional placement for mobile UX).
- [x] **Detune Slider**: In Synth Oscillator section (intentional placement for mobile UX).
- [x] **ADSR Visual Curve**: iOS has `ADSRVisualization` component matching webapp's SVG curve.
- [x] **Voice Mask Toggle Buttons**: iOS has `VoiceMaskControl` matching webapp's 6-button grid.
- [x] **Synth Chord Sequencer Toggle**: iOS has this toggle in Character section.

#### Timbre / Filter Section
- [x] **Filter Visualization**: `FilterResponseView` shows interactive filter response curve with all filter types.
- [x] **Live Filter Frequency Display**: Shows current filter position with glowing green line when running.
- [x] **Filter Type/Cutoff/Resonance/Q**: All present on iOS.

#### Lead Synth Section
- [x] **Timbre Range Visualization**: `TimbreRangeView` shows gradient bar (Rhodes → Gamelan) with active range.
- [x] **ADSHR Visual Curve**: `ADSRVisualization` used for Lead envelope (includes Hold parameter).
- [x] **Expression Dual-Mode Indicators**: `DualRangeSlider` shows "RANGE" badge when in dual mode.
- [x] **Double-Tap Toggle**: `DualRangeSlider` has `.onTapGesture(count: 2)` for toggling single/dual mode.

#### Granular Section
- [x] **All parameters present**: Matches webapp.
- [x] **Pitch Mode Segmented Control**: iOS uses segmented (appropriate for mobile UX).

#### Ocean Section
- [x] **Beach Recording (Sample) Toggle**: Present.
- [x] **Wave Synthesis Toggle**: Present.
- [x] **Dual-Mode Duration/Interval**: `DualRangeSlider` with double-tap toggle.
- [x] **Sample Level Slider**: Present in Levels section.
- [x] **Filter Type/Cutoff/Resonance**: Present.

#### Reverb Section
- [x] **Enable Toggle**: Present with CPU savings indicator.
- [x] **Quality Mode Picker**: Present with Ultra/Balanced/Lite.
- [x] **Type Picker with iOS-only section**: Present.
- [x] **All reverb parameters**: Present.

#### Levels Section
- [x] **Ocean Level Slider**: Added to Levels section.
- [x] **Drum Level Slider**: Added to Levels section.
- [x] **Master/Synth/Granular/Lead/Reverb**: Present.

#### Circle of Fifths
- [x] **Interactive CoF Display**: `CircleOfFifthsView` shows current key, morph path, drift range, direction arrows.

#### Morph Slider Area
- [x] **Visual Preset A/B indicators**: `MorphControl` shows preset names at each end.
- [x] **Progress indicator during morph**: Shows `morphPhase` ("Playing A", "Morphing to B", etc.).

---

## Snowflake UI Enhancement (Simple Mode)

### Overview
Enhance the Simple UI snowflake with dual-parameter control per prong: length controls level, width/complexity controls a secondary parameter (reverb send, decay, or filter cutoff).

### Implementation Status: Web ✓ | iOS ✓

### 6-Prong Configuration

| Prong | Position | Level Key (Length) | Width Key | Label |
|-------|----------|-------------------|-----------|-------|
| 1 | Top (12:00) | reverbLevel | reverbDecay | Reverb / Decay |
| 2 | 2:00 | synthLevel | synthReverbSend | Synth / Verb |
| 3 | 4:00 | granularLevel | granularReverbSend | Granular / Verb |
| 4 | 6:00 | leadLevel | leadReverbSend | Lead / Verb |
| 5 | 8:00 | drumLevel | drumReverbSend | Drum / Verb |
| 6 | 10:00 | oceanSampleLevel | oceanFilterCutoff | Wave / Filter |

### Interaction Model
- **Radial drag on handle** → Controls level (prong length)
- **Tangential drag on prong body** → Controls width parameter (reverb send/decay/filter)
- **Wide invisible hit area** (4x prong width) for easier interaction

### Visual Representation
- **Prong length** = Level value (with log scaling)
- **Branch complexity** = Width value (reverb send/decay/filter)
  - Line thickness multiplier: 0.4x-1.6x
  - Branch density: 20%-80%
  - Number of main shoots: 2-5
  - Number of sub-branches: 1-3
  - End crystal size (scaled down 20%)

### Exponential Width Curves
Width values use exponential curves so lower percentages show more visual complexity:

| Parameter | Exponent | Effect |
|-----------|----------|--------|
| Drum reverb send | 0.1 | 1%→63%, 5%→78%, very aggressive |
| Others (synth, granular, lead, wave, reverb decay) | 0.5 | 25%→50%, 50%→71%, sqrt curve |

### Color Scheme
| Prong | Color | Hex |
|-------|-------|-----|
| Reverb | Warm cream | #E8DCC4 |
| Synth | Muted orange | #C4724E |
| Granular | Sage green | #7B9A6D |
| Lead | Mustard gold | #D4A520 |
| Drum | Purple | #8B5CF6 |
| Wave | Slate blue | #5A7B8A |

### Highlight on Width Drag
- Branches glow with prong color when width is being dragged
- Uses `shadowColor` and `shadowBlur` for glow effect
- End crystals also glow when highlighted

### Labels on Hover/Drag
| Prong | Label Format |
|-------|--------------|
| Reverb | "Decay: XX%" |
| Synth/Granular/Lead/Drum | "Verb: XX%" |
| Wave | "Filter: XkHz" |

### Default Values Changed
- `drumReverbSend`: 0.06 (6%, was 30%)

### iOS Implementation Checklist
- [x] **SnowflakeView.swift**: Update to 6 prongs with new configuration
- [x] **Prong colors**: Match web colors (#E8DCC4, #C4724E, etc.)
- [x] **Width parameter mapping**: Add reverbSendKey equivalent per prong
- [x] **Tangential drag gesture**: Implement side-to-side drag on prong body
- [x] **Width hit area**: 4x prong width for easier interaction
- [x] **Exponential curves**: 0.1 for drum, 0.5 for others
- [x] **Branch complexity**: Reduce density by 20% (match web)
- [x] **Labels**: Show appropriate label (Decay/Verb/Filter) on drag
- [x] **Highlight effect**: Glow branches when width dragging
- [x] **Default drumReverbSend**: 0.06

---

### Version History

| Date | Changes |
|------|---------|
| 2026-02-03 | Initial enhancement spec created |
| 2026-02-03 | Web implementation complete - all features working |
| 2026-02-03 | Reverb enable toggle added for CPU savings |
| 2026-02-03 | Ryoji Ikeda drum synth spec added |
| 2026-02-03 | iOS implementation learnings checklist added |
| 2026-02-03 | iOS Euclidean UI parity completed (lane colors, presets, pattern viz) |
| 2026-02-03 | iOS General UI parity verified complete |
| 2026-02-03 | Snowflake UI enhancement: 6 prongs with dual-parameter control |
| 2026-02-03 | iOS Snowflake UI complete: tangential drag, exponential curves, all prong colors |

| 2026-02-04 | Drum Voice Morphing & Dual Preset System spec added |

---

## Drum Voice Morphing & Dual Preset System

### Overview
Expand the drum synthesizer from 6 basic voices into a deeply morphable sound design system capable of producing everything from ASMR ear candy to Ikeda-style data glitches to ambient percussion. Each voice gets additional synthesis parameters plus a dual-preset morph system where two presets define the endpoints and a single morph slider interpolates all parameters between them.

### Design Philosophy
- **Minimalist Ikeda aesthetic** at one extreme
- **ASMR ear candy textures** at another extreme  
- **Ambient/textural drums** as a third dimension
- **Continuous morphing** between any two sonic states
- **Deterministic** - same seed produces same results

### Implementation Status: Web [ ] | iOS [ ]

---

### Part 1: New Synthesis Parameters Per Voice

Each of the 6 voices gains additional parameters to unlock new sonic territories.

#### Voice 1: Sub (◉)
**Current**: Simple sine with decay
**New Capabilities**: Room thump, underwater bubble, felt bass

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `drumSubShape` | 0-1 | 0 | 0=sine, 0.5=triangle, 1=filtered saw |
| `drumSubPitchEnv` | -48..+48 | 0 | Semitones pitch sweep (neg=rise) |
| `drumSubPitchDecay` | 5-500 | 50 | Pitch envelope decay ms |
| `drumSubDrive` | 0-1 | 0 | Soft saturation/warmth |
| `drumSubSub` | 0-1 | 0 | Sub-octave mix (octave down) |

**Unlocked Sounds**: Thump, Bubble (pitch rise), Deep pulse, Warm bass

#### Voice 2: Kick (●)
**Current**: Sine with pitch envelope + click layer
**New Capabilities**: Soft tap, boomy ambient, tight punch

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `drumKickBody` | 0-1 | 0.5 | 0=tight, 1=boomy/ambient |
| `drumKickPunch` | 0-1 | 0.5 | Transient sharpness |
| `drumKickTail` | 0-1 | 0 | Reverberant tail amount |
| `drumKickTone` | 0-1 | 0 | Harmonic content |

**Unlocked Sounds**: Tap, Ambient boom, Tight punch, Soft thud

#### Voice 3: Click (▪)
**Current**: Filtered noise impulse
**New Capabilities**: Crinkle, tick, blip, dust, granular micro-hits

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `drumClickPitch` | 200-8000 | 2000 | Center pitch for tonal mode |
| `drumClickPitchEnv` | -48..+48 | 0 | Pitch sweep semitones |
| `drumClickMode` | string | 'impulse' | 'impulse', 'noise', 'tonal', 'granular' |
| `drumClickGrainCount` | 1-8 | 1 | Micro-grains per trigger |
| `drumClickGrainSpread` | 0-50 | 0 | Grain timing spread ms |
| `drumClickStereoWidth` | 0-1 | 0 | Stereo spread of grains |

**Unlocked Sounds**: Tick, Blip, Crinkle, Dust, Data glitch

#### Voice 4: BeepHi (△)
**Current**: High sine with optional FM
**New Capabilities**: Glass, bell, shimmer, metallic ring

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `drumBeepHiInharmonic` | 0-1 | 0 | Inharmonic partial detune |
| `drumBeepHiPartials` | 1-6 | 1 | Number of partials |
| `drumBeepHiShimmer` | 0-1 | 0 | Vibrato/chorus amount |
| `drumBeepHiShimmerRate` | 0.5-12 | 4 | Shimmer LFO rate Hz |
| `drumBeepHiBrightness` | 0-1 | 0.5 | Spectral tilt |

**Unlocked Sounds**: Glass ting, Bell, Shimmer, Crystal, Metallic ping

#### Voice 5: BeepLo (▽)
**Current**: Sine/square blip
**New Capabilities**: Droplet, pluck, bubble, muted tap

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `drumBeepLoPitchEnv` | -48..+48 | 0 | Pitch envelope (neg=rise for droplet) |
| `drumBeepLoPitchDecay` | 5-500 | 50 | Pitch env decay ms |
| `drumBeepLoBody` | 0-1 | 0.3 | Resonance/body warmth |
| `drumBeepLoPluck` | 0-1 | 0 | Karplus-Strong pluck amount |
| `drumBeepLoPluckDamp` | 0-1 | 0.5 | Pluck damping (0=bright, 1=muted) |

**Unlocked Sounds**: Droplet, Bubble, Pluck, Muted tap, Blip

#### Voice 6: Noise (≋)
**Current**: Filtered noise burst
**New Capabilities**: Breath, whisper, scrape, texture

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `drumNoiseFormant` | 0-1 | 0 | Vowel formant morph (a->e->i->o->u) |
| `drumNoiseBreath` | 0-1 | 0 | Breathiness/air amount |
| `drumNoiseFilterEnv` | -1..+1 | 0 | Filter envelope direction |
| `drumNoiseFilterEnvDecay` | 5-2000 | 100 | Filter env decay ms |
| `drumNoiseDensity` | 0-1 | 1 | 0=sparse dust, 1=dense hiss |
| `drumNoiseColorLFO` | 0-10 | 0 | Filter modulation rate Hz |

**Unlocked Sounds**: Breath, Whisper, Scrape, Dust, Texture, Hiss

---

### Part 2: Dual Preset Morph System

#### Concept
Each drum voice has:
1. **Preset A** - defines all parameter values at morph position 0
2. **Preset B** - defines all parameter values at morph position 1  
3. **Morph Slider** - 0-1 interpolates between A and B

When morph = 0.5, all parameters are at the midpoint between presets.

#### Preset Data Structure

`	ypescript
interface DrumVoicePreset {
  name: string;
  voice: 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise';
  params: Record<string, number | string>;
  tags: string[];  // 'asmr', 'ikeda', 'ambient', 'texture', etc.
}
`

---

### Part 3: Preset Library (64+ Presets)

#### Sub Presets (10)
| Name | Character |
|------|-----------|
| Classic Sub | Ikeda-style felt bass |
| Deep Thump | Room-filling thud |
| Bubble Up | Rising bubble |
| Warm Pulse | Analog warmth |
| Data Pulse | Digital heartbeat |
| Subterranean | Extremely low |
| Soft Touch | Gentle |
| Pressure Wave | Physical |
| Sine Ping | Clean |
| Rumble | Textured |

#### Kick Presets (10)
| Name | Character |
|------|-----------|
| Ikeda Kick | Sharp digital |
| Ambient Boom | Spacious |
| Soft Tap | ASMR finger tap |
| Tight Punch | Punchy |
| 808 Deep | Classic 808 |
| Paper Thud | Muted |
| Room Kick | Natural |
| Click Kick | Clicky |
| Pillow | Extremely soft |
| Heartbeat | Organic |

#### Click Presets (12)
| Name | Character |
|------|-----------|
| Data Point | Classic Ikeda |
| Tick | Clock tick |
| Blip | Soft digital |
| Crinkle | Paper texture |
| Dust | Vinyl crackle |
| Glitch | Digital error |
| Tap | Finger tap |
| Spark | Electric |
| Pop | Bubble pop |
| Static | Radio static |
| Scratch | Record scratch |
| Micro Hit | Tiny impact |

#### BeepHi Presets (10)
| Name | Character |
|------|-----------|
| Data Ping | Classic Ikeda |
| Glass | Wine glass |
| Bell | Small bell |
| Crystal | Crystalline |
| Shimmer | Evolving |
| Chime | Wind chime |
| Metallic | Industrial |
| Whistle | High pitch |
| Sparkle | Magical |
| Tink | Tiny metal |

#### BeepLo Presets (10)
| Name | Character |
|------|-----------|
| Blip | Classic blip |
| Droplet | Water drop |
| Bubble | Underwater |
| Pluck | String pluck |
| Muted Tap | Soft impact |
| Bloop | Cartoon |
| Ping | Sonar ping |
| Woody | Wood block |
| Soft Ping | Gentle |
| Chirp | Bird-like |

#### Noise Presets (12)
| Name | Character |
|------|-----------|
| Hi-Hat | Classic hat |
| Breath | Soft air |
| Whisper | Voice-like |
| Dust | Vinyl |
| Texture | Ambient |
| Scrape | Friction |
| Hiss | White noise |
| Shaker | Percussion |
| Ocean Spray | Water mist |
| Steam | Pressure release |
| Rustle | Leaves |
| Static | Electronic |

---

### Part 4: Implementation Checklist

#### Phase 1: State & Parameters
- [ ] Add 31 new synthesis parameters to state.ts
- [ ] Add 36 morph parameters (6 voices x 6 params each)
- [ ] Add QUANTIZATION ranges
- [ ] Add to STATE_KEYS

#### Phase 2: Preset System
- [ ] Create drumPresets.ts with 64 presets
- [ ] Create drumMorph.ts interpolation logic
- [ ] Implement preset loading in drumSynth.ts

#### Phase 3: Synthesis Expansion
- [ ] Sub: shape, pitch env, drive, sub-octave
- [ ] Kick: body, punch, tail, tone
- [ ] Click: modes, pitch, grains
- [ ] BeepHi: partials, shimmer, inharmonicity
- [ ] BeepLo: pitch env, pluck (Karplus-Strong)
- [ ] Noise: formant, density, filter env

#### Phase 4: UI
- [ ] Add preset dropdowns to voice panels
- [ ] Add morph slider per voice
- [ ] Add new parameter sliders

---

## Journey Mode: Diamond Matrix Layout

### Implementation Status: Web [DEMO] | iOS [ ]

### Overview
A preset chaining system that allows users to create evolving sonic journeys by connecting up to 4 presets with probabilistic transitions. Uses a **Diamond Matrix** layout with START/END in the center and presets at cardinal positions.

### Design Philosophy
- **Minimalist elegance** - matches Snowflake UI aesthetic
- **Intuitive drag-to-connect** - no side panels or menus needed
- **Visual feedback** - see phrase progress, morph duration, and probabilities at a glance
- **Loopable patterns** - curved connections allow any-to-any routing including self-loops

---

### Implementation Progress

#### ✅ Phase 1: Core Types & State (COMPLETE)
- [x] Created `src/audio/journeyTypes.ts` with full TypeScript interfaces
- [x] Created `src/ui/journeyState.ts` with React hooks (`useJourney`)
- [x] JourneyConfig, JourneyNode, JourneyConnection types
- [x] JourneyState with phases: idle, playing, morphing, self-loop, ending, ended
- [x] Pre-selected `plannedNextNodeId` for tracker display
- [x] Dual mode support for phrase lengths and morph durations (min/max ranges)
- [x] Stale closure fixes using refs for callbacks

#### ✅ Phase 2: Diamond Matrix Rendering (COMPLETE)
- [x] Created `DiamondJourneyUI.tsx` component (~4000 lines)
- [x] Diamond layout with 4 cardinal positions + center
- [x] Empty slot placeholders with + icon
- [x] Filled preset nodes with 2-letter initials and preset colors
- [x] Node size animation for phrase progress (shrinks as phrase plays)
- [x] Warm, organic color palette matching Snowflake UI
- [x] Animated halo around diamond that lerps between preset colors

#### ✅ Phase 3: Connection Rendering (COMPLETE)
- [x] Curved Bezier paths calculated around center
- [x] START connections from center (green) and END connections to center (blue)
- [x] Connection arc thickness based on probability
- [x] Dot visualization for morph duration on arcs
- [x] Animated flowing dots during active morph phase
- [x] Self-loop arcs that curve outward and back to same node
- [x] Proper curve direction (clockwise/counterclockwise) based on position

#### ✅ Phase 4: Drag-to-Connect Interaction (COMPLETE)
- [x] Drag start detection on node edges
- [x] Ghost connection line during drag
- [x] Valid drop target highlighting
- [x] Connection creation on successful drop
- [x] Self-loop creation when dropping on same node
- [x] Drag to center creates END connection
- [x] Drag from center creates START connection

#### ✅ Phase 5: Inline Editing (COMPLETE)
- [x] Node tap → popup with phrase length (dual mode), change preset, remove
- [x] Connection tap → popup with morph duration (dual mode), probability slider, delete
- [x] Empty slot tap → preset selector dropdown
- [x] Secondary popup for connection details from node popup
- [x] Dismiss popup on outside click
- [x] 2-column layout for min/max dual mode sliders
- [x] Font: Avenir with reduced sizes for elegance

#### ✅ Phase 6: Journey Tracker Popup (COMPLETE)
- [x] Long hover (600ms) on center node shows tracker popup
- [x] Displays current phase with colored indicator dot
- [x] Shows current preset name being played
- [x] Phrase progress bar (animated, shows completion %)
- [x] Morph progress bar during transitions
- [x] Time remaining display
- [x] Next stop prediction (uses pre-selected `plannedNextNodeId`)
- [x] Fixed progress bar CSS (minWidth, removed transition conflicts)

#### ✅ Phase 7: Animation Loop Fixes (COMPLETE)
- [x] Fixed animation loop not stopping on journey end
- [x] Added `shouldContinue` flag to prevent RAF leak
- [x] Stale closure fixes for `onMorphTo` and `onLoadPreset` callbacks
- [x] Proper cleanup on unmount

#### 🔄 Phase 8: Audio Integration (IN PROGRESS)
- [ ] Wire `onLoadPreset` callback to load actual preset from saved presets
- [ ] Wire `onMorphTo` callback to trigger preset morph with duration
- [ ] Connect to existing morph slider system (0-100 range)
- [ ] Implement fadeout during 'ending' phase
- [ ] Test with real presets and audio engine

#### ⏳ Phase 9: Main App Integration (PLANNED)
- [ ] Add Journey Mode route/view accessible from main app
- [ ] Add diamond icon (◇) to Snowflake UI header
- [ ] Add diamond icon to Advanced UI header
- [ ] Navigation between main UI and Journey Mode
- [ ] Persist journey configs to localStorage
- [ ] Journey mode uses app's actual saved presets

---

### Diamond Matrix Layout

```
                        ◎ P2
                       (12:00)
                      ╱      ╲
                     ╱        ╲
                    ╱          ╲
                   ╱            ╲
                  ╱              ╲
                 ╱                ╲
      ◎ P1 ────╱───── ◉ ─────────╲───── ◎ P3
     (9:00)   ╱    START/END      ╲    (3:00)
              │                    │
              │                    │
              │                    │
              ╲                    ╱
               ╲                  ╱
                ╲                ╱
                 ╲              ╱
                  ╲            ╱
                   ╲          ╱
                    ╲        ╱
                     ╲      ╱
                        ◎ P4
                       (6:00)
```

**Positions:**
- **CENTER**: START/END node (dual purpose)
- **12:00** (Top): Preset slot 2
- **3:00** (Right): Preset slot 3  
- **6:00** (Bottom): Preset slot 4
- **9:00** (Left): Preset slot 1

---

### Connection Flow & Curved Paths

Connections curve **around the center** to avoid overlapping, creating elegant loop patterns.

```
Example: P1 → P2 → P3 → P1 (triangle loop)

                        ◎ P2
                       ╱╲   ╲
                      ╱  ╲   ╲
                     ╱    ╲   ╲
                    ╱      ╲   ╲
         ╭────────╱────────╲───╲────────╮
        ╱       ╱            ╲  ╲        ╲
      ◎ P1 ───╱───── ◉ ──────╲──╲─────── ◎ P3
       ╲     ╱                 ╲  ↑        ╱
        ╲   ╱                   ╲ │       ╱
         ╲ ╱                     ╲│      ╱
          ╳═══════════════════════╪═════╯
         ╱                        │
        ╱                         │
       ↓                          │
      (Connection from P3 back to P1 curves around bottom)
```

**Connection Rules:**
- **START → P**: Drag from center to any preset position
- **P → P**: Curved arc that bows away from center
- **P → END**: Return to center, triggers stop or loop restart

---

### Two-Preset Infinite Loop Example

```
Simple A ↔ B oscillation:

                        ◎ (empty)
                      
                      
      ◎ A ←════╮  ◉  ╭═════→ ◎ B
              │ END │
              │     │
              ╰─────╯
         (morph connection curves around bottom)
                      
                        ◎ (empty)

Connection visualization:
- A → B: curves around top of center
- B → A: curves around bottom of center
- Creates elegant figure-8 or infinity loop pattern
```

---

### Visual Feedback System

#### 1. Node State Indicators

| State | Visual |
|-------|--------|
| **Empty slot** | Dotted circle outline, dim |
| **Has preset** | Solid filled circle with preset initial |
| **Currently playing** | Pulsing glow, brighter |
| **Shrinking during phrase** | Node radius decreases as phrase progresses |

**Phrase Progress Visualization:**
```
Start of phrase:     ●────────────────
                    (full size)

Mid phrase:          ◉────────────────
                    (medium size)

End of phrase:       ○────────────────
                    (minimum size, about to transition)
```

#### 2. Connection Arc Indicators

| Property | Visual |
|----------|--------|
| **Morph duration** | Number of dots on the arc (more dots = longer morph) |
| **Probability** | Line thickness (thicker = higher probability) |
| **Currently morphing** | Dots animate/flow along the arc |
| **Can be edited** | Subtle glow on hover |

**Morph Duration Dots:**
```
Short morph (1 phrase):   ○──●──○
Medium morph (2 phrases): ○──●──●──○
Long morph (4 phrases):   ○──●──●──●──●──○
```

#### 3. Center Node (START/END)

| State | Visual |
|-------|--------|
| **Idle/Start** | Double ring, dim |
| **Playing journey** | Inner ring pulsing |
| **About to end** | Glowing, drawing attention |

---

### Drag-to-Connect Interaction

#### Creating Connections

1. **START → First Preset**
   - Drag from center node outward
   - Highlight valid preset slots
   - Drop on slot = set as first preset in journey

2. **Preset → Preset**
   - Start drag from edge of preset node
   - Ghost line follows cursor, curves around center
   - Drop on another preset = create connection
   - Drop on same preset = create self-loop

3. **Preset → END**
   - Drag to center node
   - Creates termination point

#### Visual Drag Feedback

```
During drag from P1:

                        ◎ P2 (glowing - valid target)
                       ╱
                      ╱
                     ╱ ← ghost line curves
                    ╱
      [P1]─────────╱──── ◉ ───────────── ◎ P3 (glowing)
     (dragging)             
                            
                        ◎ P4 (glowing - valid target)
```

---

### Editing Nodes & Connections (No Side Panel)

#### Node Tap/Click → Popup

```
┌─────────────────────────┐
│  Preset A               │
├─────────────────────────┤
│  Phrase Length: [4] ▼   │
│  ──────────────────     │
│  [Change Preset]        │
│  [Remove Node]          │
└─────────────────────────┘
```

#### Connection Tap/Click → Popup

```
┌─────────────────────────┐
│  A → B                  │
├─────────────────────────┤
│  Morph Duration: [2] ▼  │
│  Probability: [●●●○○]   │
│  ──────────────────     │
│  [Delete Connection]    │
└─────────────────────────┘
```

#### Empty Slot Tap → Add Preset

```
┌─────────────────────────┐
│  Add Preset             │
├─────────────────────────┤
│  [Recent Presets...]    │
│  [Browse All...]        │
└─────────────────────────┘
```

---

### Color Scheme

| Element | Color | Hex |
|---------|-------|-----|
| **Empty slot** | Dim gray | `#444` |
| **Filled preset** | Snowflake blue | `#4fc3f7` |
| **Playing/active** | Bright cyan | `#00e5ff` |
| **Connection line** | Light blue | `#81d4fa` |
| **Morphing** | Animated gradient | `#4fc3f7 → #00e5ff` |
| **Drag ghost line** | Orange | `#ff9800` |
| **END glow** | Warm amber | `#ffb74d` |
| **Background** | Dark | `#1a1a2e` |

---

### Journey Configuration

```typescript
interface JourneyNode {
  id: string;
  position: 'center' | 'top' | 'right' | 'bottom' | 'left';
  presetId?: string;           // undefined = empty slot
  presetName?: string;
  phraseLengthBars: number;    // 2, 4, 8, 16
}

interface JourneyConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  morphDurationPhrases: number; // 1, 2, 4
  probability: number;         // 0-1
}

interface JourneyConfig {
  nodes: JourneyNode[];
  connections: JourneyConnection[];
  loopOnEnd: boolean;          // true = restart, false = stop
  globalTempo?: number;        // optional tempo override
}
```

---

### Implementation Checklist

#### Phase 1: Core Types & State ✅
- [x] Create `src/audio/journeyTypes.ts` with interfaces
- [x] Create `src/ui/journeyState.ts` with React hooks
- [x] Add journey config to app state (or separate context)

#### Phase 2: Diamond Matrix Rendering ✅
- [x] Create `JourneyUI.tsx` component
- [x] Render diamond layout with 4 cardinal positions + center
- [x] Draw empty slot placeholders (dotted circles)
- [x] Draw filled preset nodes with initials
- [x] Implement node size animation for phrase progress

#### Phase 3: Connection Rendering ✅
- [x] Calculate curved Bezier paths around center
- [x] Draw connection arcs with proper curvature direction
- [x] Add dots along arcs for morph duration visualization
- [x] Vary line thickness based on probability
- [x] Add flowing animation for active morph

#### Phase 4: Drag-to-Connect Interaction ✅
- [x] Detect drag start on node edge
- [x] Render ghost connection line during drag
- [x] Highlight valid drop targets
- [x] Create connection on successful drop
- [x] Handle self-loop creation
- [x] Handle drag to center (END connection)

#### Phase 5: Inline Editing (No Side Panel) ✅
- [x] Node tap → popup with phrase length, change preset, remove
- [x] Connection tap → popup with morph duration, probability, delete
- [x] Empty slot tap → preset browser popup
- [x] Dismiss popup on outside tap

#### Phase 6: Playback Integration 🔄
- [x] Visual sync: node shrink, arc animation
- [x] Journey tracker popup with progress bars
- [ ] Connect to audio engine for phrase boundaries
- [ ] Implement probabilistic transition selection
- [ ] Trigger morph between presets
- [ ] Handle END node (stop or loop restart)

#### Phase 7: Audio Integration (NEXT)
- [ ] Create JourneyModeView component (not demo)
- [ ] Wire `onLoadPreset(presetName)` to `handlePresetLoad`
- [ ] Wire `onMorphTo(presetName, duration)` to start morph animation
- [ ] Calculate morph duration in ms from bars
- [ ] Animate morph slider from 0→100 over duration
- [ ] Implement fadeout during 'ending' phase (reduce master volume)
- [ ] Handle journey end (stop audio or keep last preset playing)

#### Phase 8: Main App Integration
- [ ] Add `/journey` route to App.tsx router
- [ ] Create JourneyModeView that wraps DiamondJourneyUI
- [ ] Add diamond icon (◇) button to SnowflakeUI header
- [ ] Add diamond icon (◇) button to Advanced UI header  
- [ ] Pass real saved presets to Journey Mode
- [ ] Navigation: click diamond → journey mode, back button → main UI
- [ ] Journey mode inherits current audio engine state

#### Phase 9: Persistence & Presets
- [ ] Save/load journey configs to localStorage
- [ ] Journey preset library (pre-built journeys)
- [ ] Export/import journey as JSON

---

### Audio Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     JourneyModeView                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               DiamondJourneyUI                       │   │
│  │  - Visual diamond matrix                             │   │
│  │  - Drag-to-connect                                   │   │
│  │  - Journey tracker popup                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│    onLoadPreset    onMorphTo      onJourneyEnd            │
│           │               │               │                │
└───────────┼───────────────┼───────────────┼────────────────┘
            │               │               │
            ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                      App.tsx                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  handleJourneyLoadPreset(name)                       │   │
│  │    → Find preset in savedPresets                     │   │
│  │    → setMorphPresetA(preset)                         │   │
│  │    → setMorphPosition(0)                             │   │
│  │    → Apply preset state to engine                    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  handleJourneyMorphTo(name, durationBars)            │   │
│  │    → Find preset in savedPresets                     │   │
│  │    → setMorphPresetB(preset)                         │   │
│  │    → Calculate duration in ms                        │   │
│  │    → Animate morphPosition from 0 → 100              │   │
│  │    → On complete: swap B→A, clear B                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  handleJourneyEnd()                                  │   │
│  │    → Optional: fade out master volume                │   │
│  │    → Keep last preset playing (or stop)              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Morph Animation Strategy

During Journey Mode morphs, we animate the morph slider programmatically:

```typescript
function handleJourneyMorphTo(presetName: string, durationBars: number) {
  // 1. Find and set destination preset
  const preset = savedPresets.find(p => p.name === presetName);
  if (!preset) return;
  setMorphPresetB(preset);
  
  // 2. Calculate duration in milliseconds
  const msPerBar = (60 / bpm) * 4 * 1000;
  const durationMs = durationBars * msPerBar;
  
  // 3. Animate morph position from current → 100
  const startPosition = morphPosition;
  const startTime = performance.now();
  
  function animateMorph(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const newPosition = startPosition + (100 - startPosition) * progress;
    
    setMorphPosition(newPosition);
    
    if (progress < 1) {
      requestAnimationFrame(animateMorph);
    } else {
      // Morph complete - swap presets
      setMorphPresetA(morphPresetB);
      setMorphPresetB(null);
      setMorphPosition(0);
    }
  }
  
  requestAnimationFrame(animateMorph);
}
```

### Journey Mode Entry Points

**From Snowflake UI:**
```
┌────────────────────────────────────────┐
│  ◇ Journey  |  ⚙️ Advanced  |  ☁️ Cloud │  ← Header bar
├────────────────────────────────────────┤
│                                        │
│          [Snowflake Visual]            │
│                                        │
└────────────────────────────────────────┘
```

**From Advanced UI:**
```
┌────────────────────────────────────────┐
│  ❄️ Simple  |  ◇ Journey  |  ☁️ Cloud  │  ← Header bar
├────────────────────────────────────────┤
│                                        │
│          [Advanced Sliders]            │
│                                        │
└────────────────────────────────────────┘
```

---

### Curved Path Calculation

For connections that curve around the center:

```typescript
function calculateCurvedPath(
  fromPos: Position,
  toPos: Position,
  centerPos: Position,
  curveDirection: 'clockwise' | 'counterclockwise'
): string {
  // Calculate control points that bow away from center
  const midpoint = getMidpoint(fromPos, toPos);
  const directionFromCenter = normalize(subtract(midpoint, centerPos));
  
  // Push control point away from center
  const curveOffset = 80; // pixels
  const sign = curveDirection === 'clockwise' ? 1 : -1;
  const controlPoint = add(midpoint, scale(perpendicular(directionFromCenter), curveOffset * sign));
  
  return `M ${fromPos.x} ${fromPos.y} Q ${controlPoint.x} ${controlPoint.y} ${toPos.x} ${toPos.y}`;
}
```

**Curve Direction Rules:**
- Going "forward" around the diamond (P1→P2→P3→P4): clockwise curves
- Going "backward" (P4→P3→P2→P1): counterclockwise curves
- This ensures opposing connections don't overlap

---

### Accessibility Considerations

- [ ] Keyboard navigation between nodes
- [ ] Tab order: Center → P1 → P2 → P3 → P4
- [ ] Enter to activate node (open popup)
- [ ] Arrow keys to select connections from active node
- [ ] Screen reader labels for all interactive elements
- [ ] High contrast mode support

---
max