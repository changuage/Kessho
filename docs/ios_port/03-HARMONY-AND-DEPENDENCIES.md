# Harmony System & Component Dependencies

## Core Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    TIME-BASED SEED SYSTEM                                           │
│                                                                                                     │
│  seedWindow ('hour'|'day')                                                                          │
│         │                                                                                           │
│         ▼                                                                                           │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐                              │
│  │ getUtcBucket()  │ ───► │  computeSeed()  │ ───► │   createRng()   │ ───► Seeded RNG function    │
│  │ "2026-01-31T14" │      │  xmur3 hash     │      │  mulberry32     │      rng() → [0,1)          │
│  └─────────────────┘      └─────────────────┘      └─────────────────┘                              │
│                                                              │                                      │
│                    ┌─────────────────────────────────────────┼──────────────────────────────┐       │
│                    │                                         │                              │       │
│                    ▼                                         ▼                              ▼       │
│    ┌───────────────────────────┐         ┌───────────────────────────┐    ┌───────────────────────┐ │
│    │    HARMONY GENERATOR      │         │     GRANULATOR WORKLET    │    │     OCEAN WORKLET     │ │
│    │                           │         │                           │    │                       │ │
│    │ • Scale selection         │         │ • Grain timing            │    │ • Wave timing         │ │
│    │ • Chord voicing           │         │ • Pitch selection         │    │ • Pan positions       │ │
│    │ • Note selection          │         │ • Pan positions           │    │ • Duration variation  │ │
│    └───────────────────────────┘         └───────────────────────────┘    └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    HARMONY → PITCH PIPELINE                                         │
│                                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              ROOT NOTE DETERMINATION                                            ││
│  │                                                                                                 ││
│  │   SliderState.rootNote (0-11)  ◄────────────────────────────────────────────────────────────┐  ││
│  │          │                                                                                  │  ││
│  │          │ (if cofDriftEnabled)                                                             │  ││
│  │          ▼                                                                                  │  ││
│  │   ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐          │  ││
│  │   │ Circle of Fifths   │ ──► │ cofConfig.currentStep│ ──► │calculateDriftedRoot │          │  ││
│  │   │ Drift System       │     │    (-6 to +6)       │     │                     │          │  ││
│  │   │                    │     │                     │     │                     │          │  ││
│  │   │ • cofDriftEnabled  │     │ Updated at phrase   │     │ homeRoot + step     │          │  ││
│  │   │ • cofDriftRate     │     │ boundaries via      │     │ mapped through      │          │  ││
│  │   │ • cofDriftDirection│     │ updateCircleOfFifths│     │ COF_SEQUENCE        │          │  ││
│  │   │ • cofDriftRange    │     │                     │     │                     │          │  ││
│  │   └─────────────────────┘     └─────────────────────┘     └──────────┬──────────┘          │  ││
│  │                                                                      │                     │  ││
│  │                                                                      ▼                     │  ││
│  │                                                              effectiveRoot (0-11)         │  ││
│  │                                                                      │                     │  ││
│  └──────────────────────────────────────────────────────────────────────┼─────────────────────┘  ││
│                                                                         │                        ││
│  ┌──────────────────────────────────────────────────────────────────────┼────────────────────────┐│
│  │                              SCALE SELECTION                         │                        ││
│  │                                                                      │                        ││
│  │   SliderState.scaleMode ──┬── 'auto' ───► selectScaleFamily(rng, tension)                    ││
│  │                           │                      │                                            ││
│  │                           │                      │ tension parameter weights scale choice:    ││
│  │                           │                      │ 0.0-0.25 → consonant (Major, Lydian...)   ││
│  │                           │                      │ 0.25-0.55 → color (Aeolian, Harmonic...)  ││
│  │                           │                      │ 0.55-1.0 → high (Octatonic, Phrygian...)  ││
│  │                           │                      │                                            ││
│  │                           └── 'manual' ─► getScaleByName(manualScale)                        ││
│  │                                                  │                                            ││
│  │                                                  ▼                                            ││
│  │                                          ScaleFamily                                         ││
│  │                                          { name, intervals[], tensionLevel, tensionValue }   ││
│  │                                                  │                                            ││
│  └──────────────────────────────────────────────────┼────────────────────────────────────────────┘│
│                                                     │                                             │
│  ┌──────────────────────────────────────────────────┼────────────────────────────────────────────┐│
│  │                         CHORD VOICING GENERATION │                                            ││
│  │                                                  │                                            ││
│  │                                                  ▼                                            ││
│  │   generateChordVoicing(rng, scale, tension, voicingSpread, detune, effectiveRoot)            ││
│  │         │                                                                                     ││
│  │         ├── Base root: 36 + effectiveRoot (MIDI note C2 + offset)                            ││
│  │         │                                                                                     ││
│  │         ├── Get available notes: getScaleNotesInRange(scale, low, high, effectiveRoot)       ││
│  │         │                                                                                     ││
│  │         ├── Note count: tension < 0.5 ? 3-4 notes : 4-5 notes                                ││
│  │         │                                                                                     ││
│  │         ├── Always include root and fifth (if in scale)                                      ││
│  │         │                                                                                     ││
│  │         ├── voicingSpread: probability of octave displacement (±12 semitones)                ││
│  │         │                                                                                     ││
│  │         └── detune: random ± cents applied to each note                                      ││
│  │                                                                                               ││
│  │         Output: ChordVoicing { midiNotes[], frequencies[] }                                  ││
│  │                        │                                                                      ││
│  └────────────────────────┼──────────────────────────────────────────────────────────────────────┘│
│                           │                                                                       │
│                           ▼                                                                       │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              CONSUMERS OF HARMONY STATE                                       ││
│  │                                                                                               ││
│  │   ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐  ││
│  │   │     POLY SYNTH          │    │     LEAD SYNTH          │    │    GRANULATOR           │  ││
│  │   │                         │    │                         │    │                         │  ││
│  │   │ applyChord(frequencies) │    │ scheduleLeadMelody()    │    │ (uses synth audio as    │  ││
│  │   │                         │    │                         │    │  input, so inherits     │  ││
│  │   │ Each voice gets one     │    │ Uses effectiveRoot +    │    │  pitch from synth)      │  ││
│  │   │ frequency from the      │    │ scaleFamily to get      │    │                         │  ││
│  │   │ chord voicing           │    │ available lead notes    │    │ pitchMode: 'harmonic'   │  ││
│  │   │                         │    │                         │    │ uses HARMONIC_INTERVALS │  ││
│  │   │ synthVoiceMask filters  │    │ getScaleNotesInRange()  │    │ for grain transposition │  ││
│  │   │ which voices play       │    │ with lane note ranges   │    │                         │  ││
│  │   │                         │    │                         │    │                         │  ││
│  │   │ synthOctave shifts all  │    │ Random or Euclidean     │    │                         │  ││
│  │   │ frequencies up/down     │    │ note scheduling         │    │                         │  ││
│  │   └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘  ││
│  │                                                                                               ││
│  └───────────────────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Circle of Fifths Drift Algorithm

```typescript
// Circle of Fifths sequence: semitone values at each position
const COF_SEQUENCE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
// Positions:          C  G  D  A  E  B  F# C# G# D# A# F
// COF Labels:         0  1  2  3  4  5  6  7  8  9  10 11

function calculateDriftedRoot(homeRoot: number, stepOffset: number): number {
    // Find home key's position on the circle
    const homeIndex = COF_SEQUENCE.indexOf(homeRoot % 12);
    
    // Move stepOffset positions around the circle
    const driftedIndex = ((homeIndex + stepOffset) % 12 + 12) % 12;
    
    // Return the semitone value at the new position
    return COF_SEQUENCE[driftedIndex];
}

// Example: homeRoot = 4 (E), stepOffset = +1
// homeIndex = 4 (E is at position 4 on the circle)
// driftedIndex = 5 (one step clockwise)
// Returns: COF_SEQUENCE[5] = 11 (B)
```

## Circle of Fifths Path Calculation (for Morph)

When morphing between presets with different root notes, calculate the shortest path on the CoF:

```typescript
function calculateCoFPath(fromSemitone: number, toSemitone: number): { steps: number; path: number[] } {
    const fromIndex = COF_SEQUENCE.indexOf(fromSemitone % 12);
    const toIndex = COF_SEQUENCE.indexOf(toSemitone % 12);
    
    // Calculate clockwise and counter-clockwise distances
    const cwDistance = (toIndex - fromIndex + 12) % 12;
    const ccwDistance = (fromIndex - toIndex + 12) % 12;
    
    // Choose shortest path (prefer CW if equal)
    const useCW = cwDistance <= ccwDistance;
    const steps = useCW ? cwDistance : -ccwDistance;
    
    // Build path of semitones
    const path: number[] = [];
    const direction = useCW ? 1 : -1;
    for (let i = 0; i <= Math.abs(steps); i++) {
        const pathIndex = (fromIndex + i * direction + 12) % 12;
        path.push(COF_SEQUENCE[pathIndex]);
    }
    
    return { steps, path };
}

// Example: E(4) → G(7)
// E is at index 4, G is at index 1
// CW distance: (1 - 4 + 12) % 12 = 9 steps
// CCW distance: (4 - 1 + 12) % 12 = 3 steps
// CCW is shorter → steps = -3
// Path: [4, 9, 2, 7] = [E, A, D, G]
```

### Key Implementation Notes for iOS

1. **COF Index vs Semitone**: The CoF uses indices 0-11 representing positions on the circle. These map to semitones via `COF_SEQUENCE`. Don't confuse the two!

2. **Negative Steps**: Negative steps mean counter-clockwise (toward flats). The path is still built correctly by using `direction = -1`.

3. **Path Includes Endpoints**: The returned path includes both the start and end semitones.

## Phrase Boundary Timing

All harmony changes occur at **phrase boundaries** (every 16 seconds):

```typescript
export const PHRASE_LENGTH = 16;  // seconds

export function getCurrentPhraseIndex(): number {
    const nowSec = Date.now() / 1000;
    return Math.floor(nowSec / PHRASE_LENGTH);
}

export function getTimeUntilNextPhrase(): number {
    const nowSec = Date.now() / 1000;
    const nextBoundary = Math.ceil(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH;
    return nextBoundary - nowSec;
}
```

The engine schedules:
1. **Chord changes** at phrase boundaries (controlled by `chordRate`)
2. **Circle of Fifths drift** at phrase boundaries (controlled by `cofDriftRate`)
3. **Lead melody phrases** reset at phrase boundaries
4. **Granulator reseed** at phrase boundaries

## Scale Families

Scale names are now **generic** (e.g., "Dorian" instead of "E Dorian"). The root note is a separate parameter, allowing dynamic key changes.

```typescript
export const SCALE_FAMILIES: readonly ScaleFamily[] = [
    // Consonant (tension 0 - 0.25)
    { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9], tensionValue: 0.0 },
    { name: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11], tensionValue: 0.05 },
    { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], tensionValue: 0.10 },
    { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], tensionValue: 0.18 },
    { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10], tensionValue: 0.22 },
    { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], tensionValue: 0.25 },
    
    // Color (tension 0.25 - 0.55)
    { name: 'Aeolian', intervals: [0, 2, 3, 5, 7, 8, 10], tensionValue: 0.35 },
    { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11], tensionValue: 0.5 },
    { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11], tensionValue: 0.55 },
    
    // High tension (tension 0.55 - 1.0)
    { name: 'Octatonic Half-Whole', intervals: [0, 1, 3, 4, 6, 7, 9, 10], tensionValue: 0.85 },
    { name: 'Phrygian Dominant', intervals: [0, 1, 4, 5, 7, 8, 10], tensionValue: 0.9 },
];
```

## iOS Implementation

```swift
// Scales.swift
struct ScaleFamily {
    let name: String
    let intervals: [Int]
    let tensionLevel: TensionLevel
    let tensionValue: Double
    
    enum TensionLevel {
        case consonant
        case color
        case high
    }
}

let SCALE_FAMILIES: [ScaleFamily] = [
    ScaleFamily(name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9], 
                tensionLevel: .consonant, tensionValue: 0.0),
    // ... all scales (use generic names, combine with rootNote for display)
]

// HarmonyGenerator.swift
class HarmonyGenerator {
    private var scaleFamily: ScaleFamily
    private var currentChord: ChordVoicing
    private var effectiveRoot: Int = 4  // E
    
    private var cofConfig: CircleOfFifthsConfig
    private var rng: SeededRNG
    
    func onPhraseBoundary() {
        // Update CoF drift if enabled
        if cofConfig.enabled {
            updateCircleOfFifthsDrift()
        }
        
        // Calculate effective root
        effectiveRoot = cofConfig.enabled 
            ? calculateDriftedRoot(homeRoot: rootNote, step: cofConfig.currentStep)
            : rootNote
        
        // Potentially generate new chord
        if phrasesUntilChange <= 1 {
            currentChord = generateChordVoicing()
            phrasesUntilChange = phrasesPerChord
        } else {
            phrasesUntilChange -= 1
        }
    }
    
    func getScaleNotesInRange(low: Int, high: Int) -> [Int] {
        var notes: [Int] = []
        let rootBase = 36 + effectiveRoot  // C2 + offset
        
        for octave in 0..<8 {
            for interval in scaleFamily.intervals {
                let midi = rootBase + octave * 12 + interval
                if midi >= low && midi <= high {
                    notes.append(midi)
                }
            }
        }
        return notes.sorted()
    }
}
```

## Component Dependency Matrix

| Component | Depends On | Affects |
|-----------|------------|---------|
| **RNG System** | seedWindow, current time | All randomized components |
| **Circle of Fifths** | cofDrift* params, RNG | effectiveRoot |
| **Scale Selection** | scaleMode, manualScale, tension, RNG | scaleFamily |
| **Chord Voicing** | scaleFamily, effectiveRoot, voicingSpread, detune, RNG | synth frequencies |
| **Poly Synth** | chord frequencies, synthVoiceMask, synthOctave, ADSR | Audio output |
| **Lead Synth** | scaleFamily, effectiveRoot, Euclidean params, RNG | Audio output |
| **Granulator** | Synth audio (input), grainPitchMode, pitchSpread, RNG | Audio output |
| **Filter Modulation** | filterCutoffMin/Max, filterModSpeed, RNG | Voice filter freq |

## Key Synchronization Points

1. **Phrase Boundary** (every 16 seconds):
   - CoF drift update
   - Chord change evaluation
   - Lead melody rescheduling
   - Granulator reseed
   - Filter modulation continues independently

2. **State Change** (immediate):
   - Parameter smoothing (50ms)
   - Oscillator gains
   - Filter cutoff/Q
   - Reverb/delay parameters
   - Level changes

3. **Seed Change** (when seedWindow changes):
   - Full RNG reseed
   - Granulator random sequence regenerated
   - Harmony state recreated
