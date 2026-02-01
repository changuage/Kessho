# Audio Engine Architecture

## Complete Signal Flow Diagram

```
                                    ┌──────────────────────────────────────────────────────────────────────────┐
                                    │                         AUDIO ENGINE (engine.ts)                         │
                                    └──────────────────────────────────────────────────────────────────────────┘
                                                                      │
                    ┌─────────────────────────────────────────────────┼─────────────────────────────────────────────────┐
                    │                                                 │                                                 │
                    ▼                                                 ▼                                                 ▼
    ┌───────────────────────────────┐         ┌───────────────────────────────┐         ┌───────────────────────────────┐
    │      POLY SYNTH (6 voices)    │         │        LEAD SYNTH (FM)        │         │        OCEAN WAVES            │
    │                               │         │                               │         │                               │
    │  ┌─────────────────────────┐  │         │  ┌─────────────────────────┐  │         │  ┌─────────────────────────┐  │
    │  │ Voice 1-6:              │  │         │  │ FM Synthesis:           │  │         │  │ Wave Synth (Worklet):   │  │
    │  │  • 4 Oscillators each   │  │         │  │  • 2-4 Modulators       │  │         │  │  • 2 Wave Generators    │  │
    │  │  • Per-voice filter     │  │         │  │  • 2 Carriers           │  │         │  │  • Foam layer           │  │
    │  │  • Warmth/Presence EQ   │  │         │  │  • Variable timbre      │  │         │  │  • Depth rumble         │  │
    │  │  • Saturation           │  │         │  │  • Rhodes→Gamelan       │  │         │  └─────────────────────────┘  │
    │  │  • ADSR Envelope        │  │         │  └─────────────────────────┘  │         │                               │
    │  │  • Air Noise            │  │         │                               │         │  ┌─────────────────────────┐  │
    │  └─────────────────────────┘  │         │  ┌─────────────────────────┐  │         │  │ Sample Player:          │  │
    │                               │         │  │ Ping-Pong Delay:        │  │         │  │  • Ghetary-Waves.ogg    │  │
    │  Output: synthBus ───────────►├────┐    │  │  • Left delay           │  │         │  │  • Seamless loop        │  │
    └───────────────────────────────┘    │    │  │  • Right delay (0.75x)  │  │         │  └─────────────────────────┘  │
                                         │    │  │  • Cross-feedback       │  │         │                               │
                                         │    │  └─────────────────────────┘  │         │  Output: oceanGain ──────────►├───┐
                                         │    │                               │         └───────────────────────────────┘   │
                                         │    │  Output: leadGain ───────────►├───┐                                         │
                                         │    └───────────────────────────────┘   │                                         │
                                         │                                        │                                         │
                    ┌────────────────────┼────────────────────────────────────────┼─────────────────────────────────────────┘
                    │                    │                                        │
                    ▼                    ▼                                        ▼
    ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                            ROUTING & MIXING STAGE                                                      │
    │                                                                                                                        │
    │   synthBus ──┬──► granulatorInputGain ──► GRANULATOR ──► wetHPF ──► wetLPF ──┬──► granularDirect ──────────────────►│ │
    │              │                                          (Worklet)            └──► granularReverbSend ──┐            │ │
    │              │                                                                                         │            │ │
    │              └──► dryBus ──┬──► synthDirect ──────────────────────────────────────────────────────────►│────┐       │ │
    │                            └──► synthReverbSend ─────────────────────────────────────────────────────┐ │    │       │ │
    │                                                                                                      │ │    │       │ │
    │   leadGain ──► leadFilter ──┬──► leadDry ──────────────────────────────────────────────────────────►│────┤       │ │
    │                             ├──► leadDelayL/R ──► leadMerger ──► leadDelayMix ──┬────────────────────►│ │  │       │ │
    │                             │                                                   └──► leadDelayReverbSend─┤  │       │ │
    │                             └──► leadReverbSend ─────────────────────────────────────────────────────┤   │  │       │ │
    │                                                                                                      │   │  │       │ │
    │   oceanGain ──────────────────────────────────────────────────────────────────────────────────────────►│────┤       │ │
    │   oceanSampleGain ─────────────► oceanFilter ─────────────────────────────────────────────────────────►│    │       │ │
    │                                                                                                          │  │       │ │
    └──────────────────────────────────────────────────────────────────────────────────────────────────────────┼──┼───────┘ │
                                                                                                               │  │         │
                    ┌──────────────────────────────────────────────────────────────────────────────────────────┘  │         │
                    │                                                                                             │         │
                    ▼                                                                                             ▼         │
    ┌───────────────────────────────┐                                                         ┌───────────────────────────────┐
    │        REVERB (Worklet)       │                                                         │        MASTER OUTPUT          │
    │                               │                                                         │                               │
    │  ┌─────────────────────────┐  │                                                         │  masterGain                   │
    │  │ 8-tap FDN Reverb:       │  │                                                         │      │                        │
    │  │  • Pre-diffuser chains  │  │                                                         │      ▼                        │
    │  │  • Mid-diffuser chains  │  │                                                         │  limiter (DynamicsCompressor) │
    │  │  • Post-diffuser chains │  │         ┌──────────────────────────┐                    │      │                        │
    │  │  • Modulated delay lines│  │         │                          │                    │      ├──► ctx.destination     │
    │  │  • Damping filters      │  │         │   reverbOutputGain       │                    │      │                        │
    │  │  • DC blockers          │  │──────►  │                          │───────────────────►│      └──► mediaStreamDest     │
    │  │  • Width control        │  │         │                          │                    │          (iOS background)     │
    │  └─────────────────────────┘  │         └──────────────────────────┘                    │                               │
    │                               │                                                         │  Final output: -3dB limit     │
    └───────────────────────────────┘                                                         └───────────────────────────────┘
```

## Gain Structure

All levels are in linear gain (0.0 - 1.0 unless noted):

| Node | Default Value | Parameter | Purpose |
|------|---------------|-----------|---------|
| `masterGain` | 0.7 | `masterVolume` | Overall output level |
| `synthDirect` | 0.6 | `synthLevel` | Dry synth to output |
| `synthReverbSend` | 0.7 | `synthReverbSend` | Synth to reverb |
| `granularDirect` | 0.4 | `granularLevel` | Granular wet to output |
| `granularReverbSend` | 0.8 | `granularReverbSend` | Granular to reverb |
| `leadGain` | 0.4 | `leadLevel` | Lead synth volume |
| `leadReverbSend` | 0.5 | `leadReverbSend` | Lead dry to reverb |
| `leadDelayReverbSend` | 0.4 | `leadDelayReverbSend` | Lead delay to reverb |
| `leadDelayMix` | 0.35 | `leadDelayMix` | Delay wet/dry |
| `reverbOutputGain` | 1.0 | `reverbLevel` | Reverb output (0-2) |
| `oceanGain` | 0 or 0.4 | `oceanWaveSynthLevel` | Wave synth volume |
| `oceanSampleGain` | 0 or 0.5 | `oceanSampleLevel` | Sample volume |

## Limiter Configuration

```typescript
this.limiter.threshold.value = -3;    // dBFS
this.limiter.knee.value = 0;          // Hard knee
this.limiter.ratio.value = 20;        // Near-brickwall
this.limiter.attack.value = 0.001;    // 1ms attack
this.limiter.release.value = 0.1;     // 100ms release
```

## iOS AVAudioEngine Equivalent

```swift
class AudioEngine {
    private var engine: AVAudioEngine!
    private var mainMixer: AVAudioMixerNode!
    private var limiter: AVAudioUnitDynamicsProcessor!
    
    // Source nodes
    private var synthNodes: [AVAudioSourceNode] = []
    private var granulatorUnit: AUAudioUnit!
    private var reverbUnit: AUAudioUnit!
    private var leadSourceNode: AVAudioSourceNode!
    private var oceanSourceNode: AVAudioSourceNode!
    
    // Mixer nodes for routing
    private var synthMixer: AVAudioMixerNode!
    private var granularMixer: AVAudioMixerNode!
    private var reverbMixer: AVAudioMixerNode!
    private var leadMixer: AVAudioMixerNode!
    
    func setupAudioGraph() throws {
        engine = AVAudioEngine()
        mainMixer = engine.mainMixerNode
        
        // Create mixers for each bus
        synthMixer = AVAudioMixerNode()
        granularMixer = AVAudioMixerNode()
        reverbMixer = AVAudioMixerNode()
        leadMixer = AVAudioMixerNode()
        
        engine.attach(synthMixer)
        engine.attach(granularMixer)
        engine.attach(reverbMixer)
        engine.attach(leadMixer)
        
        // Setup limiter
        limiter = AVAudioUnitDynamicsProcessor()
        limiter.threshold = -3
        limiter.headRoom = 0
        limiter.expansionRatio = 20
        limiter.attackTime = 0.001
        limiter.releaseTime = 0.1
        engine.attach(limiter)
        
        // Route: all mixers → main mixer → limiter → output
        let format = mainMixer.outputFormat(forBus: 0)
        engine.connect(synthMixer, to: mainMixer, format: format)
        engine.connect(granularMixer, to: mainMixer, format: format)
        engine.connect(reverbMixer, to: mainMixer, format: format)
        engine.connect(leadMixer, to: mainMixer, format: format)
        engine.connect(mainMixer, to: limiter, format: format)
        engine.connect(limiter, to: engine.outputNode, format: format)
        
        try engine.start()
    }
}
```

## Voice Structure (Poly Synth)

Each of the 6 voices has this chain:

```
┌─────────────────────────────────────────────────────────────────────┐
│                           VOICE N                                    │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │  osc1   │  │  osc2   │  │  osc3   │  │  osc4   │   ┌─────────┐  │
│  │ (sine)  │  │(triangle)│ │(saw det)│  │  (saw)  │   │  noise  │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   └────┬────┘  │
│       │            │            │            │              │       │
│       ▼            ▼            ▼            ▼              ▼       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   ┌─────────┐  │
│  │osc1Gain │  │osc2Gain │  │osc3Gain │  │osc4Gain │   │noiseGain│  │
│  │ (0-1)   │  │ (0-1)   │  │ (0-1)   │  │ (0-1)   │   │ (0-0.1) │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   └────┬────┘  │
│       │            │            │            │              │       │
│       └────────────┴────────────┴────────────┴──────────────┘       │
│                                    │                                │
│                                    ▼                                │
│                           ┌───────────────┐                         │
│                           │    filter     │ ◄── filterType          │
│                           │ (BiquadFilter)│ ◄── filterCutoff        │
│                           │               │ ◄── filterQ             │
│                           └───────┬───────┘ ◄── filterResonance     │
│                                   │                                 │
│                                   ▼                                 │
│                           ┌───────────────┐                         │
│                           │ warmthFilter  │ ◄── warmth (0-8dB)      │
│                           │ (lowshelf)    │     freq: 250Hz         │
│                           └───────┬───────┘                         │
│                                   │                                 │
│                                   ▼                                 │
│                           ┌───────────────┐                         │
│                           │presenceFilter │ ◄── presence (-6 to +6) │
│                           │ (peaking EQ)  │     freq: 3kHz, Q: 0.8  │
│                           └───────┬───────┘                         │
│                                   │                                 │
│                                   ▼                                 │
│                           ┌───────────────┐                         │
│                           │  saturation   │ ◄── hardness            │
│                           │ (WaveShaper)  │     tanh curve          │
│                           └───────┬───────┘                         │
│                                   │                                 │
│                                   ▼                                 │
│                           ┌───────────────┐                         │
│                           │     gain      │     0.15 (voice level)  │
│                           └───────┬───────┘                         │
│                                   │                                 │
│                                   ▼                                 │
│                           ┌───────────────┐                         │
│                           │   envelope    │ ◄── ADSR schedule       │
│                           │  (GainNode)   │                         │
│                           └───────┬───────┘                         │
│                                   │                                 │
│                                   ▼                                 │
│                              To synthBus                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Oscillator Brightness Mapping

The `oscBrightness` parameter (0-3) controls oscillator mix:

| oscBrightness | sine | triangle | sawDetuned | saw | Character |
|---------------|------|----------|------------|-----|-----------|
| 0 | 1.0 | 0.0 | 0.0 | 0.0 | Pure, soft |
| 1 | 0.2 | 0.8 | 0.0 | 0.0 | Soft harmonics |
| 2 | 0.0 | 0.4 | 0.3 | 0.3 | Balanced ambient |
| 3 | 0.0 | 0.0 | 0.5 | 0.5 | Bright, full harmonics |

## Saturation Curve

```typescript
function createSaturationCurve(hardness: number): Float32Array {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = 1 + hardness * 3;  // 1 to 4

    for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * 2 - 1;  // -1 to +1
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return curve;
}
```

## iOS Voice Implementation

```swift
struct Voice {
    var oscillators: [AVAudioUnitGenerator] = []
    var filter: AVAudioUnitEQ!
    var warmthFilter: AVAudioUnitEQ!
    var presenceFilter: AVAudioUnitEQ!
    var envelope: AVAudioMixerNode!
    var targetFreq: Double = 0
    var active: Bool = false
}

class PolySynth {
    private let voiceCount = 6
    private var voices: [Voice] = []
    
    func createVoice() -> Voice {
        var voice = Voice()
        
        // Create 4 oscillator generators (will be AVAudioSourceNode with render block)
        // Each oscillator runs a render callback that generates samples
        
        // Filter chain using AVAudioUnitEQ with multiple bands
        voice.filter = AVAudioUnitEQ(numberOfBands: 1)
        voice.filter.bands[0].filterType = .lowPass
        voice.filter.bands[0].frequency = 2000
        voice.filter.bands[0].bandwidth = 1.0
        
        voice.warmthFilter = AVAudioUnitEQ(numberOfBands: 1)
        voice.warmthFilter.bands[0].filterType = .lowShelf
        voice.warmthFilter.bands[0].frequency = 250
        voice.warmthFilter.bands[0].gain = 0  // 0 to +8 dB
        
        voice.presenceFilter = AVAudioUnitEQ(numberOfBands: 1)
        voice.presenceFilter.bands[0].filterType = .parametric
        voice.presenceFilter.bands[0].frequency = 3000
        voice.presenceFilter.bands[0].bandwidth = 0.8
        voice.presenceFilter.bands[0].gain = 0  // -6 to +6 dB
        
        voice.envelope = AVAudioMixerNode()
        
        return voice
    }
}
```

## Key Timing Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `PHRASE_LENGTH` | 16 seconds | Chord change alignment |
| `VOICE_COUNT` | 6 | Polyphonic voices |
| Parameter smoothing | 0.05 seconds | `setTargetAtTime` time constant |
| Filter modulation | 100ms interval | Random walk update rate |

## Parameter Smoothing

All continuous parameters use exponential smoothing via `setTargetAtTime`:

```typescript
// Web Audio
node.gain.setTargetAtTime(targetValue, audioContext.currentTime, 0.05);

// iOS equivalent
AVAudioUnitEQ.bands[0].gain = targetValue  // Immediate, need manual smoothing
// OR use AURenderCallback with linear interpolation
```

For iOS, implement parameter smoothing in render callbacks:

```swift
class SmoothedParameter {
    private var currentValue: Float
    private var targetValue: Float
    private let smoothingFactor: Float = 0.001  // Per sample
    
    func advance() -> Float {
        currentValue += (targetValue - currentValue) * smoothingFactor
        return currentValue
    }
    
    func setTarget(_ value: Float) {
        targetValue = value
    }
}
```
