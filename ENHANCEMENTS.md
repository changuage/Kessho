# Kessho Enhancements

This document captures the final implementation details and key learnings from building Kessho's features.

---

## Journey Mode - Diamond Matrix UI

**Status**: Web ✓ | iOS pending

### Overview
Journey Mode automatically morphs between up to 4 presets over time using a diamond pattern UI.

### Mobile Touch Improvements
- **Expandable status bar**: Compact bar at top shows current preset + progress, tap to expand for full details (time remaining, next preset)
- **Node popup positioning**: Mobile shows popup at top (12px from edge), desktop shows near clicked node
- **Compact mobile popups**: Reduced padding and margins for better fit
- **Ghost connection lines**: During drag or popup, shows possible connections to valid targets
- **Click-to-connect**: Tap a valid target while popup is open to create connection
- **Single start connection**: Center node limited to one outgoing connection
- **Touch-action fixes**: Prevents pull-to-refresh during drag interactions

### Architecture
```
DiamondJourneyUI → journeyState → App.tsx → audioEngine
```

**Key Files:**
- `src/audio/journeyTypes.ts` - Type definitions, constants
- `src/ui/journeyState.ts` - State hook (`useJourney`)
- `src/ui/DiamondJourneyUI.tsx` - Visual UI
- `src/ui/JourneyModeView.tsx` - Audio integration wrapper

### Diamond Layout
```
            ◎ P2 (12:00)
           ╱    ╲
   ◎ P1 ── ◉ START ── ◎ P3
  (9:00)   ╲    ╱    (3:00)
            ◎ P4 (6:00)
```

### Node Colors (by order added)
| Position | Color | Hex |
|----------|-------|-----|
| 1st | Purple | `#8B5CF6` |
| 2nd | Orange | `#C4724E` |
| 3rd | Green | `#7B9A6D` |
| 4th | Gold | `#D4A520` |
| 5th | Cyan | `#4fc3f7` |
| 6th | Slate | `#5A7B8A` |
| 7th | Cream | `#E8DCC4` |

### State Phases
`idle` → `playing` → `morphing` → `playing` (loop) → `ending` → `ended`

### Morph Flow (Alternating Direction)
```
A=Preset1, position=0 → Morph toB (0→100) → A=Preset3, Morph toA (100→0) → ...
```
Alternating ensures the next preset loads into the opposite slot, avoiding audio glitches.

### Key Learnings

**Stale Closure Fix**: Journey morph callbacks use refs (`journeyPresetARef`, `journeyPresetBRef`) updated synchronously because React's async state updates caused timing issues.

**Animation Loop Cleanup**: Added `shouldContinue` flag to prevent RAF leaks when journey ends.

**UI State Persistence**: Managing journey state at App.tsx level preserves playback when switching between UI modes.

---

## Morph Endpoint Behavior Fixes

**Status**: Web ✓ | iOS partial

### Problems Fixed
1. At position 100 (Preset B), changing Preset A incorrectly updated parameters
2. Changing Preset A while at B cleared user overrides at endpoint B
3. Switching to dual mode at endpoint B, then changing Preset A, reverted to single mode

### Key Learnings

**Endpoint Detection Pattern**:
```typescript
const atEndpoint0 = isAtEndpoint0(morphPosition, true);
const shouldApplyPresetA = atEndpoint0 || !morphPresetB;
```
Only apply preset A values when at endpoint 0 OR no preset B loaded.

**Selective Override Clearing**: Created `clearDrumMorphEndpointOverrides(voice, endpoint)` to clear only the specified endpoint's overrides, preserving the other.

**Dual Mode Reset Logic**:
```typescript
const shouldResetDualModes = (isPresetA && !atEndpoint1) || (!isPresetA && !atEndpoint0);
```
Only reset dual modes when the changed preset affects the current position.

---

## Euclidean Sequencer Enhancement

**Status**: Web ✓ | iOS partial

### Features
- 4 lanes with probability and source controls per lane
- Can trigger Lead Synth OR individual Synth voices (1-6)
- Per-lane: steps, hits, rotation, preset, note range, level, probability, source
- Synth chord sequencer toggle

### State
```typescript
leadEuclid[1-4]Probability: number;  // 0-1
leadEuclid[1-4]Source: 'lead' | 'synth1' | ... | 'synth6';
synthChordSequencerEnabled: boolean;  // default true
```

### Key Learnings

**Lead Synth Integration**: Euclidean mode automatically disables the random lead sequencer when enabled.

**Synth Voice Routing**: Created `triggerSynthVoice(voiceIndex, frequency, velocity)` for independent voice triggering from Euclidean patterns.

---

## Reverb Enable Toggle

**Status**: Web ✓ | iOS ✓

Simple CPU-saving feature: `reverbEnabled: boolean` (default true) mutes all reverb sends when disabled.

---

## Ryoji Ikeda-Style Drum Synth

**Status**: Web ✓ | iOS ✓

### Overview
Minimalist, data-driven percussion inspired by Ryoji Ikeda: sharp digital impulses, pure sine beeps, sub-bass pulses, noise bursts, and polyrhythmic patterns. Features probability-based random triggering and 4-lane Euclidean sequencer.

### 6 Voice Types

| Voice | Sound | Range |
|-------|-------|-------|
| Sub (◉) | Low sine | 30-100Hz |
| Kick (●) | Sine + pitch envelope + click | 40-200Hz |
| Click (▪) | Filtered noise burst | 500-10kHz filter |
| BeepHi (△) | High sine + FM | 2-12kHz |
| BeepLo (▽) | Lower sine/square | 150-2kHz |
| Noise (≋) | Filtered white noise | Variable filter |

### Drum Euclidean Lanes
- 4 independent lanes
- 6 boolean toggles per lane (one per voice) for multi-voice triggering
- Pattern presets: sparse, dense, lancaran, kotekan, tresillo, etc.
- Per-lane: steps, hits, rotation, targets, probability, velocity range

### Key Learnings

**RNG Initialization Order**: DrumSynth depends on `rng` (seeded random). Create AFTER `initializeHarmony()`, not in initial audio graph setup.

**QUANTIZATION Config**: Any new slider parameters must be added to QUANTIZATION system or sliders won't render correctly.

**Voice Toggle System**: Euclidean lanes use 6 boolean toggles per lane instead of single dropdown, allowing simultaneous multi-voice triggers.

**Noise Buffer**: Pre-generate 1 second of white noise for Click and Noise voices rather than creating on-demand.

**Master Gain Chain**: `masterGain → masterOutput` + `reverbSend → reverbNode` for proper routing.

### iOS Euclidean UI Parity
- Lane colors: distinct per lane (orange, green, blue, pink for lead; red, orange, green, purple for drum)
- Note range sliders with visual range bar
- Rotation ←/→ buttons
- 40+ pattern presets organized in Menu sections
- Pattern visualization with colored circles

---

## Snowflake UI (Simple Mode)

**Status**: Web ✓ | iOS ✓

### Overview
Enhanced Snowflake UI with dual-parameter control per prong: length controls level, tangential drag controls a secondary parameter (reverb send, decay, or filter).

### 6-Prong Configuration

| Prong | Position | Length (Level) | Width (Secondary) |
|-------|----------|----------------|-------------------|
| 1 | 12:00 | reverbLevel | reverbDecay |
| 2 | 2:00 | synthLevel | synthReverbSend |
| 3 | 4:00 | granularLevel | granularReverbSend |
| 4 | 6:00 | leadLevel | leadReverbSend |
| 5 | 8:00 | drumLevel | drumReverbSend |
| 6 | 10:00 | oceanSampleLevel | oceanFilterCutoff |

### Interaction Model
- **Radial drag on handle** → Controls level (prong length)
- **Tangential drag on prong body** → Controls width parameter
- **Wide invisible hit area** (4x prong width) for easier touch

### Visual Design
- Branch complexity reflects width value: thickness (0.4x-1.6x), branch density (20%-80%)
- Prong colors: Cream (#E8DCC4), Orange (#C4724E), Green (#7B9A6D), Gold (#D4A520), Purple (#8B5CF6), Slate (#5A7B8A)
- Branches glow with prong color when width is being dragged

### Key Learnings

**Exponential Width Curves**: Width values use exponential curves so lower percentages show more visual complexity:
- Drum reverb send: exponent 0.1 (1%→63%, very aggressive)
- Others: exponent 0.5 (25%→50%, sqrt curve)

**Labels on Drag**: Show contextual labels - "Decay: XX%" for reverb, "Verb: XX%" for sends, "Filter: XkHz" for wave.

---

## iOS General UI Parity

**Status**: Complete ✓

All major UI differences addressed - iOS now matches webapp:

| Feature | Implementation |
|---------|----------------|
| ADSR Visual Curve | `ADSRVisualization` component |
| Voice Mask Toggle | `VoiceMaskControl` 6-button grid |
| Filter Visualization | `FilterResponseView` with interactive curve |
| Timbre Range | `TimbreRangeView` gradient bar |
| Dual-Mode Sliders | `DualRangeSlider` with double-tap toggle |
| Circle of Fifths | `CircleOfFifthsView` with drift visualization |

---

## Drum Voice Morphing (Future)

**Status**: Not implemented

### Concept
Expand drum synth with dual-preset morph per voice: Preset A + Preset B + morph slider interpolates all parameters. Designed for ASMR textures, Ikeda glitches, and ambient percussion.

### Planned Voice Extensions
- **Sub**: Shape, pitch envelope, drive, sub-octave
- **Kick**: Body (tight→boomy), punch, tail, tone
- **Click**: Modes (impulse/noise/tonal/granular), grain controls
- **BeepHi**: Partials, shimmer, inharmonicity
- **BeepLo**: Pitch envelope, Karplus-Strong pluck
- **Noise**: Formant, breath, filter envelope, density

---

## Advanced UI Panel Structure

**Status**: Web ✓ | iOS ✓

### Panels
| Panel | Icon | Contents |
|-------|------|----------|
| Global | ◎ | Master Mixer, Seed, Scale, Tension, Preset Morph, Cloud |
| Synth + Lead | ∿ | Harmony, ADSR, Voices, Timbre, Lead Synth, Euclidean |
| Drum Synth | ⋮⋮ | All 6 voices, Drum Euclidean, Master |
| FX | ◈ | Reverb, Granular, Ocean |

**Note**: reverbQuality (Ultra/Balanced/Lite) is a user preference, NOT affected by presets or morphing.

---

## UI Refinements

**Status**: Complete ✓

### Changes Made
- Removed decorative diamond indicator from Journey navbar
- Simple mode button uses snowflake icon (matches destination)
- Preset popup repositioned below trigger button
- Icon sizes standardized (play 39px, stop 40px, nav 46px)
- Default node color changed to purple
- Demo mode removed (Journey integrated into main app)