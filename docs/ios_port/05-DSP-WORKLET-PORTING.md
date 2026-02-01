# DSP Worklet Porting Guide

This document provides detailed specifications for porting the three AudioWorklet processors to iOS AUAudioUnits.

## Worklet Overview

| Worklet | File | Purpose | Complexity |
|---------|------|---------|------------|
| Granulator | `granulator.worklet.js` | Granular synthesis effect | High |
| Reverb | `reverb.worklet.js` | 8-tap FDN reverb | High |
| Ocean | `ocean.worklet.js` | Wave synthesis | Medium |

---

## 1. Granulator Worklet

### Architecture

```
Input (Stereo) ──► Write Buffer ──► Grain Spawner ──► Grain Pool (64) ──► Output (Stereo)
                       ▲                                    │
                       └────────── Feedback ◄───────────────┘
```

### Key Data Structures

```javascript
// Grain structure
{
    startSample: number,    // Current playback position in grain
    position: number,       // Buffer read position
    length: number,         // Grain duration in samples
    playbackRate: number,   // Pitch ratio (1.0 = original)
    panIndex: number,       // Pre-computed pan table index (0-255)
    active: boolean
}

// Parameters
{
    grainSizeMin: 20,       // ms
    grainSizeMax: 80,       // ms
    density: 20,            // grains/second
    spray: 100,             // ms (buffer read offset)
    jitter: 10,             // ms (position randomization)
    probability: 0.8,       // spawn probability
    pitchMode: 'harmonic',  // or 'random'
    pitchSpread: 2,         // semitones
    stereoSpread: 0.5,      // pan width 0-1
    feedback: 0.1           // wet → input
}
```

### Lookup Tables (Optimization)

```javascript
// Pan table (256 entries for -1 to +1)
const PAN_TABLE_SIZE = 256;
const panTableL = new Float32Array(PAN_TABLE_SIZE);
const panTableR = new Float32Array(PAN_TABLE_SIZE);
for (let i = 0; i < PAN_TABLE_SIZE; i++) {
    const pan = (i / (PAN_TABLE_SIZE - 1)) * 2 - 1;
    const angle = (pan + 1) * 0.25 * Math.PI;
    panTableL[i] = Math.cos(angle);
    panTableR[i] = Math.sin(angle);
}

// Hann window table (1024 entries)
const HANN_TABLE_SIZE = 1024;
const hannTable = new Float32Array(HANN_TABLE_SIZE);
for (let i = 0; i < HANN_TABLE_SIZE; i++) {
    const phase = i / HANN_TABLE_SIZE;
    hannTable[i] = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
}
```

### Harmonic Intervals

```javascript
const HARMONIC_INTERVALS = [
    0,    // Unison
    7,    // Fifth up
    12,   // Octave up
    -12,  // Octave down
    19,   // Octave + fifth up
    5,    // Fourth up
    -7,   // Fifth down
    24,   // Two octaves up
    -5,   // Fourth down
    4,    // Major third up
    -24   // Two octaves down
];
```

### Core Processing Loop

```javascript
process(inputs, outputs, _parameters) {
    const inputL = inputs[0][0];
    const inputR = inputs[0][1] || inputs[0][0];
    const outputL = outputs[0][0];
    const outputR = outputs[0][1];
    const blockSize = outputL.length;

    for (let i = 0; i < blockSize; i++) {
        // Write input to circular buffer
        this.buffer[0][this.writePos] = inputL[i] || 0;
        this.buffer[1][this.writePos] = inputR[i] || 0;

        // Spawn new grains at interval
        this.samplesSinceGrain++;
        if (this.samplesSinceGrain >= this.samplesPerGrain) {
            this.spawnGrain();
            this.samplesSinceGrain = 0;
        }

        // Sum active grains
        let wetL = 0, wetR = 0;
        for (const grain of this.grains) {
            if (!grain.active) continue;

            // Interpolated buffer read
            const readPos = grain.position + grain.startSample * grain.playbackRate;
            const sampleL = this.readBuffer(0, readPos);
            const sampleR = this.readBuffer(1, readPos);
            
            // Hann window envelope
            const envelope = this.hannWindow(grain.startSample, grain.length);
            
            // Pan using lookup table
            const panL = panTableL[grain.panIndex];
            const panR = panTableR[grain.panIndex];

            wetL += sampleL * envelope * panL;
            wetR += sampleR * envelope * panR;

            // Advance grain
            grain.startSample++;
            if (grain.startSample >= grain.length) {
                grain.active = false;
            }
        }

        // Feedback (soft clipped)
        this.buffer[0][this.writePos] += Math.tanh(wetL * this.params.feedback);
        this.buffer[1][this.writePos] += Math.tanh(wetR * this.params.feedback);

        this.writePos = (this.writePos + 1) % this.bufferSize;

        outputL[i] = wetL * this.params.wetMix;
        outputR[i] = wetR * this.params.wetMix;
    }
    return true;
}
```

### iOS AUAudioUnit Implementation

```swift
// GranulatorAudioUnit.swift
import AudioToolbox
import AVFoundation

class GranulatorAudioUnit: AUAudioUnit {
    private var inputBus: AUAudioUnitBus!
    private var outputBus: AUAudioUnitBus!
    
    // Circular buffer (4 seconds at 48kHz)
    private let bufferSize = 4 * 48000
    private var bufferL: [Float]
    private var bufferR: [Float]
    private var writePos = 0
    
    // Grain pool
    private let maxGrains = 64
    private var grains: [Grain] = []
    
    // Lookup tables
    private var panTableL: [Float]
    private var panTableR: [Float]
    private var hannTable: [Float]
    
    // Random sequence from main thread
    private var randomSequence: [Float] = []
    private var randomIndex = 0
    
    struct Grain {
        var startSample: Int = 0
        var position: Float = 0
        var length: Int = 0
        var playbackRate: Float = 1
        var panIndex: Int = 128
        var active: Bool = false
    }
    
    override init(componentDescription: AudioComponentDescription,
                  options: AudioComponentInstantiationOptions = []) throws {
        // Initialize buffers
        bufferL = [Float](repeating: 0, count: bufferSize)
        bufferR = [Float](repeating: 0, count: bufferSize)
        
        // Build lookup tables
        panTableL = [Float](repeating: 0, count: 256)
        panTableR = [Float](repeating: 0, count: 256)
        for i in 0..<256 {
            let pan = Float(i) / 255.0 * 2 - 1
            let angle = (pan + 1) * 0.25 * Float.pi
            panTableL[i] = cos(angle)
            panTableR[i] = sin(angle)
        }
        
        hannTable = [Float](repeating: 0, count: 1024)
        for i in 0..<1024 {
            let phase = Float(i) / 1024.0
            hannTable[i] = 0.5 * (1 - cos(2 * Float.pi * phase))
        }
        
        // Initialize grains
        grains = (0..<maxGrains).map { _ in Grain() }
        
        try super.init(componentDescription: componentDescription, options: options)
    }
    
    override var internalRenderBlock: AUInternalRenderBlock {
        return { [weak self] actionFlags, timestamp, frameCount, outputBusNumber,
                  outputData, renderEvent, pullInputBlock in
            guard let self = self else { return kAudioUnitErr_NoConnection }
            
            // Pull input
            var inputFlags = AudioUnitRenderActionFlags()
            let inputBuffer = /* allocate input buffer */
            pullInputBlock?(&inputFlags, timestamp, frameCount, 0, inputBuffer)
            
            // Process (similar to JS version)
            // ... granular processing loop ...
            
            return noErr
        }
    }
}
```

---

## 2. Reverb Worklet (FDN)

### Architecture

```
Input ──► Predelay ──► Pre-Diffuser ──► FDN (8-tap) ──► Mid-Diffuser ──► Post-Diffuser ──► Output
                                            │
                                            └──► Damping ◄── Modulation
```

### Components

#### Smooth Delay Line
```javascript
class SmoothDelay {
    constructor(maxSamples) {
        this.buffer = new Float32Array(maxSamples);
        this.writeIndex = 0;
    }

    write(sample) {
        this.buffer[this.writeIndex] = sample;
        this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    }

    readInterpolated(delaySamples) {
        const readPos = this.writeIndex - delaySamples;
        const readIndex = ((readPos % this.size) + this.size) % this.size;
        const i0 = Math.floor(readIndex);
        const frac = readIndex - i0;
        const i1 = (i0 + 1) % this.size;
        return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
    }
}
```

#### Allpass Diffuser Chain
```javascript
class DiffuserChain {
    constructor(delaySamples, feedback) {
        this.stages = delaySamples.map(samples => ({
            delay: new SmoothDelay(samples + 100),
            feedback,
            delaySamples: samples
        }));
    }

    process(input) {
        let x = input;
        for (const stage of this.stages) {
            const delayed = stage.delay.read(stage.delaySamples);
            const v = x - delayed * stage.feedback;
            stage.delay.write(v);
            x = delayed + v * stage.feedback;
        }
        return x;
    }
}
```

#### FDN Mixing Matrix (Hadamard)
```javascript
mixFDN(state) {
    const s = 0.3535533905932738;  // 1/sqrt(8)
    return [
        s * (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + state[7]),
        s * (state[0] - state[1] + state[2] - state[3] + state[4] - state[5] + state[6] - state[7]),
        s * (state[0] + state[1] - state[2] - state[3] + state[4] + state[5] - state[6] - state[7]),
        s * (state[0] - state[1] - state[2] + state[3] + state[4] - state[5] - state[6] + state[7]),
        s * (state[0] + state[1] + state[2] + state[3] - state[4] - state[5] - state[6] - state[7]),
        s * (state[0] - state[1] + state[2] - state[3] - state[4] + state[5] - state[6] + state[7]),
        s * (state[0] + state[1] - state[2] - state[3] - state[4] - state[5] + state[6] + state[7]),
        s * (state[0] - state[1] - state[2] + state[3] - state[4] + state[5] + state[6] - state[7]),
    ];
}
```

### Delay Times (scaled for sample rate)

```javascript
// Base times in ms (for 48kHz)
const FDN_TIMES_MS = [37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3];

// Diffuser times in samples
const DIFFUSER_TIMES_BASE = [
    [89, 127, 179, 233, 307, 401],   // Pre L
    [97, 137, 191, 251, 317, 419],   // Pre R
    [167, 229, 313, 421],            // Mid L
    [173, 241, 331, 433],            // Mid R
    [211, 283, 367, 457, 547, 641],  // Post L
    [223, 293, 379, 467, 557, 653],  // Post R
];
```

### Presets

```javascript
const PRESETS = {
    plate: { decay: 0.88, damping: 0.25, diffusion: 0.8, size: 0.8, modDepth: 0.25 },
    hall: { decay: 0.92, damping: 0.2, diffusion: 0.85, size: 1.0, modDepth: 0.3 },
    cathedral: { decay: 0.96, damping: 0.12, diffusion: 0.95, size: 1.5, modDepth: 0.4 },
    darkHall: { decay: 0.94, damping: 0.45, diffusion: 0.9, size: 1.3, modDepth: 0.3 },
};
```

### iOS Implementation Strategy

**Option A: Port to Swift/C++ AUAudioUnit** (Recommended for quality match)

```swift
class ReverbAudioUnit: AUAudioUnit {
    private var fdnDelays: [SmoothDelay] = []
    private var fdnDampers: [OnePole] = []
    private var preDiffuserL: DiffuserChain!
    private var preDiffuserR: DiffuserChain!
    // ... etc
    
    struct SmoothDelay {
        var buffer: [Float]
        var writeIndex: Int = 0
        let size: Int
        
        mutating func write(_ sample: Float) {
            buffer[writeIndex] = sample
            writeIndex = (writeIndex + 1) % size
        }
        
        func readInterpolated(_ delaySamples: Float) -> Float {
            let readPos = Float(writeIndex) - delaySamples
            var readIndex = readPos.truncatingRemainder(dividingBy: Float(size))
            if readIndex < 0 { readIndex += Float(size) }
            let i0 = Int(readIndex)
            let frac = readIndex - Float(i0)
            let i1 = (i0 + 1) % size
            return buffer[i0] * (1 - frac) + buffer[i1] * frac
        }
    }
    
    struct OnePole {
        var z1: Float = 0
        mutating func process(_ input: Float, coeff: Float) -> Float {
            z1 = input * (1 - coeff) + z1 * coeff
            return z1
        }
    }
}
```

**Option B: Use AudioKit** (Faster development)

```swift
import AudioKit

// AudioKit has built-in reverbs, but for exact matching, 
// you'd still need custom implementation
let reverb = Reverb(input)
reverb.dryWetMix = 0.5
```

---

## 3. Ocean Worklet

### Architecture

```
Seeded RNG ──► Wave Generator 1 ──┬──► Foam Layer ──┬──► Master Filter ──► Output
              Wave Generator 2 ──┘    Deep Rumble ──┘
```

### Wave Envelope

```javascript
waveEnvelope(phase) {
    if (phase < 0.25) {
        // Attack (0-25%): quadratic rise
        const t = phase / 0.25;
        return t * t;
    } else if (phase < 0.35) {
        // Sustain (25-35%): hold at peak
        return 1;
    } else {
        // Decay (35-100%): power curve fall
        const t = (phase - 0.35) / 0.65;
        return Math.pow(1 - t, 1.5);
    }
}

foamEnvelope(phase) {
    if (phase < 0.2 || phase > 0.6) return 0;
    const t = (phase - 0.2) / 0.4;
    return Math.sin(t * Math.PI);
}
```

### Generator State

```javascript
createGenerator(phaseOffset) {
    return {
        timeSinceLastWave: Math.floor(sampleRate * 8 * phaseOffset),
        nextWaveInterval: Math.floor(sampleRate * (5 + rng() * 5)),
        currentWave: {
            active: false,
            phase: 0,
            duration: sampleRate * 6,
            amplitude: 0.7 + rng() * 0.3,
            panOffset: (rng() - 0.5) * 0.6,
            foam: 0.3,
            depth: 0.5
        },
        lpfStateL: 0,
        lpfStateR: 0
    };
}
```

### Processing

The ocean generator uses:
- **Filtered noise** for wave body
- **Higher frequency noise** for foam
- **Very low frequency noise** for deep rumble
- **One-pole filters** for smoothing

```javascript
// Main wave noise
const noise = (rng() - 0.5) * 2;
gen.lpfStateL += (noise - gen.lpfStateL) * 0.03;  // ~50Hz LPF at 48kHz

// Foam noise (less filtered)
const foamNoise = (rng() - 0.5) * 2;
foamL += foamNoise * foamEnv * panL * 0.5 * wave.foam;

// Deep rumble (very low pass)
const rumbleNoise = (rng() - 0.5) * 2;
this.rumbleLpfL += (rumbleNoise - this.rumbleLpfL) * 0.005;  // ~4Hz LPF
```

### iOS Implementation

```swift
class OceanGenerator {
    private var rng: SeededRNG
    private var gen1: WaveGenerator
    private var gen2: WaveGenerator
    private var rumbleLpfL: Float = 0
    private var rumbleLpfR: Float = 0
    private var masterLpfL: Float = 0
    private var masterLpfR: Float = 0
    
    struct WaveGenerator {
        var timeSinceLastWave: Int
        var nextWaveInterval: Int
        var currentWave: Wave
        var lpfStateL: Float = 0
        var lpfStateR: Float = 0
    }
    
    struct Wave {
        var active: Bool = false
        var phase: Float = 0
        var duration: Int
        var amplitude: Float
        var panOffset: Float
        var foam: Float
        var depth: Float
    }
    
    func process(frameCount: Int, outputL: UnsafeMutablePointer<Float>, 
                 outputR: UnsafeMutablePointer<Float>) {
        for i in 0..<frameCount {
            var sampleL: Float = 0
            var sampleR: Float = 0
            
            // Process both generators
            processGenerator(&gen1, &sampleL, &sampleR)
            processGenerator(&gen2, &sampleL, &sampleR)
            
            // Add rumble
            let rumbleNoise = rng.next() * 2 - 1
            rumbleLpfL += (rumbleNoise - rumbleLpfL) * 0.005
            sampleL += rumbleLpfL * 0.4
            
            // Master LPF
            masterLpfL += (sampleL - masterLpfL) * 0.35
            
            // Soft clip output
            outputL[i] = tanh(masterLpfL * intensity * 0.6)
            outputR[i] = tanh(masterLpfR * intensity * 0.6)
        }
    }
}
```

---

## Performance Considerations

### Web Audio Worklets

- Run in separate thread (AudioWorkletGlobalScope)
- 128 samples per process() call
- Must avoid memory allocation in process()
- Use typed arrays (Float32Array)

### iOS AUAudioUnits

- Run in real-time audio thread
- Variable buffer sizes (typically 256-1024)
- Must never allocate in render callback
- Use Accelerate framework for SIMD operations
- Consider vDSP for FFT-based effects

### Memory Pre-allocation

```swift
// Pre-allocate all buffers at initialization
class AudioProcessor {
    private var scratchBufferL: [Float]
    private var scratchBufferR: [Float]
    
    init(maxBufferSize: Int) {
        scratchBufferL = [Float](repeating: 0, count: maxBufferSize)
        scratchBufferR = [Float](repeating: 0, count: maxBufferSize)
    }
}
```

### SIMD Optimization Example

```swift
import Accelerate

// Vector multiply-add for grain summing
func sumGrains(_ grains: [Grain], into outputL: inout [Float], _ outputR: inout [Float]) {
    for grain in grains where grain.active {
        // Use vDSP for efficient operations
        vDSP_vma(grainSamplesL, 1,    // A
                 envelopeBuffer, 1,    // B
                 outputL, 1,           // C
                 &outputL, 1,          // D = A*B + C
                 vDSP_Length(grain.length))
    }
}
```
