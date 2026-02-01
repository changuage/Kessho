# Lead Synth & FM Synthesis

## Lead Synth Overview

The lead synth creates Rhodes piano to Gamelan metallophone sounds using **FM synthesis**. It's a complex, dynamic instrument with:

- Variable timbre (soft Rhodes ↔ metallic Gamelan)
- Stereo ping-pong delay
- Euclidean rhythm sequencing
- Scale-aware note selection

## Signal Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    LEAD SYNTH SIGNAL PATH                                        │
│                                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              NOTE SCHEDULING                                                ││
│  │                                                                                             ││
│  │   ┌────────────────────┐         ┌────────────────────┐         ┌────────────────────┐     ││
│  │   │ leadEuclidean      │         │                    │         │                    │     ││
│  │   │ MasterEnabled?     │───Yes──►│ Euclidean Sequencer│───────►│ scheduleLeadMelody │     ││
│  │   │                    │         │ (4 lanes)          │         │ (per phrase)       │     ││
│  │   └────────────────────┘         └────────────────────┘         └─────────┬──────────┘     ││
│  │            │                                                              │                ││
│  │            No                                                             │                ││
│  │            │                                                              │                ││
│  │            ▼                                                              │                ││
│  │   ┌────────────────────┐                                                  │                ││
│  │   │ Random Mode:       │                                                  │                ││
│  │   │ leadDensity notes  │──────────────────────────────────────────────────┘                ││
│  │   │ per phrase         │                                                                   ││
│  │   └────────────────────┘                                                                   ││
│  │                                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘│
│                                              │                                                  │
│                                              ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              FM SYNTHESIS ENGINE                                            ││
│  │                                                                                             ││
│  │   Timbre Parameter (0-1): Controls everything from soft Rhodes to metallic Gamelan         ││
│  │                                                                                             ││
│  │   ┌─────────────────────────────────────────────────────────────────────────────┐          ││
│  │   │                          MODULATORS                                          │          ││
│  │   │                                                                              │          ││
│  │   │   Modulator 1 (always active):                                               │          ││
│  │   │   • freq = carrier * (1.0 + timbre * 1.4)  // ratio 1.0 to 2.4              │          ││
│  │   │   • index = frequency * (0.25 + timbre * 1.8) * velocity                    │          ││
│  │   │   → modulates carrier.frequency                                              │          ││
│  │   │                                                                              │          ││
│  │   │   Modulator 2 (always active):                                               │          ││
│  │   │   • freq = carrier * (2.0 + timbre * 2.0)  // ratio 2.0 to 4.0              │          ││
│  │   │   • index = frequency * (0.08 + timbre * 0.35)                              │          ││
│  │   │   → adds metallic partials                                                   │          ││
│  │   │                                                                              │          ││
│  │   │   Modulator 3 (if timbre > 0.5):                                             │          ││
│  │   │   • freq = carrier * (3.0 + timbre * 2.5)  // ratio 3.0 to 5.5              │          ││
│  │   │   • index = frequency * (timbre - 0.5) * 0.4                                │          ││
│  │   │   → high harmonic shimmer                                                    │          ││
│  │   │                                                                              │          ││
│  │   │   Modulator 4 (if timbre > 0.4):                                             │          ││
│  │   │   • freq = carrier * (0.5 + timbre * 0.15)  // sub-harmonic                 │          ││
│  │   │   • index = frequency * (timbre - 0.4) * 0.25                               │          ││
│  │   │   → adds body/warmth                                                         │          ││
│  │   │                                                                              │          ││
│  │   └─────────────────────────────────────────────────────────────────────────────┘          ││
│  │                                     │                                                       ││
│  │                                     ▼                                                       ││
│  │   ┌─────────────────────────────────────────────────────────────────────────────┐          ││
│  │   │                          CARRIERS                                            │          ││
│  │   │                                                                              │          ││
│  │   │   Carrier 1 (always active):                                                 │          ││
│  │   │   • type = sine                                                              │          ││
│  │   │   • frequency = note frequency (modulated by Mod1, Mod2, Mod3, Mod4)        │          ││
│  │   │   → main tone                                                                │          ││
│  │   │                                                                              │          ││
│  │   │   Carrier 2 (if timbre > 0.1):                                               │          ││
│  │   │   • type = sine                                                              │          ││
│  │   │   • frequency = note * (1 + timbre * 2 / 1200)  // slight detune            │          ││
│  │   │   • gain = timbre * 0.5                                                      │          ││
│  │   │   → gamelan shimmer/beating                                                  │          ││
│  │   │                                                                              │          ││
│  │   └─────────────────────────────────────────────────────────────────────────────┘          ││
│  │                                     │                                                       ││
│  │                                     ▼                                                       ││
│  │   ┌─────────────────────────────────────────────────────────────────────────────┐          ││
│  │   │                          ENVELOPES                                           │          ││
│  │   │                                                                              │          ││
│  │   │   Amplitude Envelope:                                                        │          ││
│  │   │   • attack = leadAttack * (1.0 - timbre * 0.6)  // faster at high timbre    │          ││
│  │   │   • decay = leadDecay                                                        │          ││
│  │   │   • sustain = leadSustain                                                    │          ││
│  │   │   • release = leadRelease                                                    │          ││
│  │   │                                                                              │          ││
│  │   │   Modulation Envelope (FM index decay):                                      │          ││
│  │   │   • decay = 0.4 + (1.0 - timbre) * 0.4                                       │          ││
│  │   │   • to = index * (0.08 + (1.0 - timbre) * 0.15)                              │          ││
│  │   │   → FM index decreases over note duration                                    │          ││
│  │   │                                                                              │          ││
│  │   └─────────────────────────────────────────────────────────────────────────────┘          ││
│  │                                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘│
│                                              │                                                  │
│                                              ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              EFFECTS CHAIN                                                  ││
│  │                                                                                             ││
│  │   leadGain ──► leadFilter ──┬──► leadDry ──────────────────────────────────► masterGain    ││
│  │               (LP 4kHz)     │                                                               ││
│  │                             ├──► leadDelayL ──► leadDelayFeedbackL ──┐                     ││
│  │                             │                                        │                      ││
│  │                             │    ◄── leadDelayFeedbackR ◄── leadDelayR ◄┘                  ││
│  │                             │                    │              │                           ││
│  │                             │                    └──► leadDelayFeedbackL (ping-pong)       ││
│  │                             │                                                               ││
│  │                             │    leadDelayL ──► merger(L)                                   ││
│  │                             │    leadDelayR ──► merger(R) ──► leadDelayMix ──► masterGain  ││
│  │                             │                                      │                        ││
│  │                             ├──► leadReverbSend ──► reverbNode                             ││
│  │                             │                                                               ││
│  │                             └──► leadDelayReverbSend ◄── leadDelayMix ──► reverbNode       ││
│  │                                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Timbre Parameter Effect

| Timbre | Character | Modulators Active | Carrier 2 |
|--------|-----------|-------------------|-----------|
| 0.0 | Soft Rhodes | 1, 2 | No |
| 0.2 | Warm Rhodes | 1, 2 | Yes (subtle) |
| 0.4 | EP/Bell mix | 1, 2, 4 | Yes |
| 0.6 | Bell-like | 1, 2, 3, 4 | Yes |
| 0.8 | Metallic | 1, 2, 3, 4 | Yes (strong) |
| 1.0 | Gamelan | 1, 2, 3, 4 | Yes (max shimmer) |

## Ping-Pong Delay Configuration

```javascript
// Left delay
leadDelayL.delayTime = leadDelayTime / 1000;  // ms to seconds

// Right delay (offset for stereo width)
leadDelayR.delayTime = (leadDelayTime / 1000) * 0.75;

// Feedback routing (ping-pong):
// L → feedbackL → R → feedbackR → L
leadDelayL ──► leadDelayFeedbackL ──► leadDelayR ──► leadDelayFeedbackR ──┐
    ▲                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
```

## Euclidean Rhythm System

### Bjorklund's Algorithm

```javascript
generateEuclideanPattern(steps, hits, rotation) {
    if (hits >= steps) return new Array(steps).fill(true);
    if (hits <= 0) return new Array(steps).fill(false);

    // Bjorklund's algorithm - distributes hits evenly
    let pattern = [];
    let remainder = [];

    for (let i = 0; i < hits; i++) pattern.push([1]);
    for (let i = 0; i < steps - hits; i++) remainder.push([0]);

    while (remainder.length > 1) {
        const newPattern = [];
        const minLen = Math.min(pattern.length, remainder.length);
        
        for (let i = 0; i < minLen; i++) {
            newPattern.push([...pattern[i], ...remainder[i]]);
        }
        
        if (pattern.length > remainder.length) {
            remainder = pattern.slice(minLen);
        } else {
            remainder = remainder.slice(minLen);
        }
        pattern = newPattern;
    }

    // Flatten
    const result = [];
    for (const p of [...pattern, ...remainder]) {
        for (const val of p) result.push(val === 1);
    }

    // Apply rotation
    const rotated = [];
    for (let i = 0; i < result.length; i++) {
        rotated.push(result[(i + rotation) % result.length]);
    }
    return rotated;
}
```

### Preset Patterns

| Preset | Steps | Hits | Rotation | Origin |
|--------|-------|------|----------|--------|
| `lancaran` | 16 | 4 | 0 | Javanese gamelan |
| `ketawang` | 16 | 2 | 0 | Sparse gamelan |
| `ladrang` | 32 | 8 | 0 | Long gamelan cycle |
| `gangsaran` | 8 | 4 | 0 | Fast gamelan |
| `kotekan` | 8 | 3 | 1 | Interlocking (Balinese) |
| `kotekan2` | 8 | 3 | 4 | Counter-pattern |
| `clapping` | 12 | 8 | 0 | Steve Reich |
| `poly3v4` | 12 | 3 | 0 | 3:4 polyrhythm |
| `poly4v3` | 12 | 4 | 0 | 4:3 polyrhythm |
| `reich18` | 12 | 7 | 3 | Music for 18 style |

### Lane Configuration

Each lane has independent:
- Pattern (preset or custom)
- Note range (MIDI min/max)
- Velocity/level
- Enable/disable

This allows polyrhythmic textures where different lanes play in different registers with different patterns.

## Note Selection

```javascript
// Get scale notes within lane's note range
const availableNotes = getScaleNotesInRange(
    scale,              // Current scale family
    lane.noteMin,       // MIDI note minimum
    lane.noteMax,       // MIDI note maximum  
    effectiveRoot       // Root note (including CoF drift)
);

// Random selection from available notes
const noteIndex = Math.floor(rng() * availableNotes.length);
const midiNote = availableNotes[noteIndex];
const frequency = midiToFreq(midiNote);

// Random velocity within lane level
const velocity = rngFloat(rng, 0.5 * lane.level, 0.9 * lane.level);

// Random timbre within min/max
const timbre = rngFloat(rng, leadTimbreMin, leadTimbreMax);
```

## iOS Implementation

```swift
class LeadSynth {
    // FM oscillators (created per-note, not persistent)
    
    // Delay nodes
    private var delayL: AVAudioUnitDelay!
    private var delayR: AVAudioUnitDelay!
    private var delayMixer: AVAudioMixerNode!
    
    // Output
    private var outputMixer: AVAudioMixerNode!
    
    func playNote(frequency: Double, velocity: Double, timbre: Double) {
        // Create oscillators
        let carrier1 = createOscillator(frequency: frequency)
        let carrier2 = timbre > 0.1 ? createOscillator(frequency: frequency * pow(2, timbre * 2 / 1200)) : nil
        
        let mod1 = createModulator(carrierFreq: frequency, ratio: 1.0 + timbre * 1.4, 
                                    index: frequency * (0.25 + timbre * 1.8) * velocity)
        let mod2 = createModulator(carrierFreq: frequency, ratio: 2.0 + timbre * 2.0,
                                    index: frequency * (0.08 + timbre * 0.35))
        let mod3 = timbre > 0.5 ? createModulator(carrierFreq: frequency, ratio: 3.0 + timbre * 2.5,
                                                   index: frequency * (timbre - 0.5) * 0.4) : nil
        let mod4 = timbre > 0.4 ? createModulator(carrierFreq: frequency, ratio: 0.5 + timbre * 0.15,
                                                   index: frequency * (timbre - 0.4) * 0.25) : nil
        
        // Connect FM chain
        // Note: In iOS, we'd use AVAudioSourceNode with render callback for FM synthesis
        // since direct oscillator FM isn't as straightforward
        
        // Apply envelopes and schedule cleanup
        scheduleEnvelopes(attack: leadAttack * (1.0 - timbre * 0.6),
                         decay: leadDecay,
                         sustain: leadSustain,
                         release: leadRelease)
    }
}

// Euclidean pattern generator
class EuclideanSequencer {
    func generatePattern(steps: Int, hits: Int, rotation: Int) -> [Bool] {
        guard hits > 0 && hits < steps else {
            return [Bool](repeating: hits >= steps, count: steps)
        }
        
        var pattern: [[Int]] = (0..<hits).map { _ in [1] }
        var remainder: [[Int]] = (0..<(steps - hits)).map { _ in [0] }
        
        while remainder.count > 1 {
            var newPattern: [[Int]] = []
            let minLen = min(pattern.count, remainder.count)
            
            for i in 0..<minLen {
                newPattern.append(pattern[i] + remainder[i])
            }
            
            if pattern.count > remainder.count {
                remainder = Array(pattern[minLen...])
            } else {
                remainder = Array(remainder[minLen...])
            }
            pattern = newPattern
        }
        
        let flat = (pattern + remainder).flatMap { $0 }.map { $0 == 1 }
        
        // Apply rotation
        return (0..<flat.count).map { i in
            flat[(i + rotation) % flat.count]
        }
    }
}
```

## Dependencies Summary

The Lead Synth depends on:

1. **Harmony System**
   - `effectiveRoot` (from CoF drift)
   - `scaleFamily` (for note selection)
   - `getScaleNotesInRange()` function

2. **Phrase Timing**
   - `PHRASE_LENGTH` (16 seconds)
   - `getTimeUntilNextPhrase()`
   - Reschedules at each phrase boundary

3. **RNG System**
   - Note selection randomness
   - Velocity variation
   - Timbre selection within range

4. **Reverb Node**
   - Receives `leadReverbSend` signal
   - Receives `leadDelayReverbSend` signal
