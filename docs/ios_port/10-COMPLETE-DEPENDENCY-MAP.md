# Complete Dependency & Connection Map

This document provides an exhaustive mapping of how every slider connects to audio components, and how audio components connect to each other.

## Visual Overview: The Full Audio Graph

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              SLIDER STATE                                                        │
│                                           (120+ Parameters)                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
        ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
        │                                           │                                           │
        ▼                                           ▼                                           ▼
┌───────────────────┐                    ┌───────────────────┐                    ┌───────────────────┐
│   HARMONY SYSTEM  │                    │   AUDIO ENGINE    │                    │    UI DISPLAY     │
│                   │                    │                   │                    │                   │
│ • tension         │──────determines───▶│ • scale selection │                    │ • CoF widget      │
│ • scaleMode       │                    │ • chord voicing   │                    │ • filter freq     │
│ • rootNote        │                    │ • note pitches    │                    │ • preset name     │
│ • cofDrift*       │                    │                   │                    │ • arm values      │
└───────────────────┘                    └───────────────────┘                    └───────────────────┘
```

---

## Part 1: Slider → Audio Node Connections

### Master Mixer Section

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          MASTER MIXER SLIDERS                                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    masterVolume (0-1)
         │
         └────────────────────────────────────────────────────────────▶ masterGain.gain
                                                                              │
    ┌────────────────────────────────────────────────────────────────────────┘
    │
    ├─── synthLevel (0-1) ──────────────────────────────────────────────────▶ synthDirect.gain
    │
    ├─── synthReverbSend (0-1) ─────────────────────────────────────────────▶ synthReverbSend.gain
    │
    ├─── granularLevel (0-4) ───────────────────────────────────────────────▶ granularDirect.gain
    │
    ├─── granularReverbSend (0-1) ──────────────────────────────────────────▶ granularReverbSend.gain
    │
    ├─── reverbLevel (0-2) ─────────────────────────────────────────────────▶ reverbOutputGain.gain
    │
    ├─── leadLevel (0-1) ───────────────────────────────────────────────────▶ leadGain.gain
    │                                                                              └─── gated by leadEnabled
    │
    ├─── leadReverbSend (0-1) ──────────────────────────────────────────────▶ leadReverbSend.gain
    │
    ├─── leadDelayReverbSend (0-1) ─────────────────────────────────────────▶ leadDelayReverbSend.gain
    │
    ├─── oceanWaveSynthLevel (0-1) ─────────────────────────────────────────▶ oceanGain.gain
    │                                                                              └─── gated by oceanWaveSynthEnabled
    │
    └─── oceanSampleLevel (0-1) ────────────────────────────────────────────▶ oceanSampleGain.gain
                                                                                   └─── gated by oceanSampleEnabled
```

### Synth Voice Parameters

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SYNTH TIMBRE SLIDERS                                                   │
│                                     (Applied to all 6 poly synth voices)                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    oscBrightness (0-3 integer)
         │
         ├─── 0 = Pure Sine ─────────────────────────────▶ osc1Gain.gain = 1.0, others = 0
         ├─── 1 = Triangle ──────────────────────────────▶ osc1Gain.gain = 0.2, osc2Gain.gain = 0.8
         ├─── 2 = Saw+Triangle Mix ──────────────────────▶ osc2Gain = 0.4, osc3Gain = 0.3, osc4Gain = 0.3
         └─── 3 = Sawtooth ──────────────────────────────▶ osc3Gain = 0.5, osc4Gain = 0.5

    detune (0-50 cents)
         │
         ├────────────────────────────────────────────────▶ osc2.frequency = freq × 2^(-detune/1200)
         └────────────────────────────────────────────────▶ osc3.frequency = freq × 2^(+detune/1200)

    airNoise (0-1)
         │
         └────────────────────────────────────────────────▶ noiseGain.gain = airNoise × 0.1

    hardness (0-1)
         │
         └────────────────────────────────────────────────▶ saturation.curve = tanh(x × (1 + hardness×3))

    warmth (0-1)
         │
         └────────────────────────────────────────────────▶ warmthFilter.gain = warmth × 8  (dB)
                                                                   └─── type: lowshelf @ 250Hz

    presence (0-1)
         │
         └────────────────────────────────────────────────▶ presenceFilter.gain = (presence - 0.5) × 12  (dB)
                                                                   └─── type: peaking @ 3000Hz, Q=0.8

    synthOctave (-2 to +2)
         │
         └────────────────────────────────────────────────▶ All voice frequencies × 2^octaveShift

    synthVoiceMask (bitmask 0-63)
         │
         ├─── bit 0 ─────────────────────────────────────▶ voice[0] enabled/disabled
         ├─── bit 1 ─────────────────────────────────────▶ voice[1] enabled/disabled
         ├─── bit 2 ─────────────────────────────────────▶ voice[2] enabled/disabled
         ├─── bit 3 ─────────────────────────────────────▶ voice[3] enabled/disabled
         ├─── bit 4 ─────────────────────────────────────▶ voice[4] enabled/disabled
         └─── bit 5 ─────────────────────────────────────▶ voice[5] enabled/disabled
```

### Filter Section

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             FILTER SLIDERS                                                       │
│                                    (Filter modulation = random walk)                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    filterType (enum)
         │
         └────────────────────────────────────────────────▶ voice.filter.type = 'lowpass'|'highpass'|'bandpass'

    filterCutoffMin (20-20000 Hz)
         │
         └─────────────────┐
                           │
    filterCutoffMax (20-20000 Hz)
         │                 │
         └─────────────────┼──────────────────────────────▶ voice.filter.frequency = lerp(min, max, modValue)
                           │                                        │
    filterModSpeed (0.5-8 phrases)                                  │
         │                 │                                        │
         └─────────────────┼──────────────────────────────▶ modValue = random walk position (0-1)
                           │                                        │
                           └────────────────────────────────────────┘
                           
    filterQ (0.1-15)
         │
         └────────────────────────────────────────────────▶ voice.filter.Q (base value)

    filterResonance (0-1)
         │
         └────────────────────────────────────────────────▶ voice.filter.Q += resonance × 8 × (0.7 + hardness×0.6)
```

### ADSR Envelope

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              ADSR SLIDERS                                                        │
│                                     (Controls voice envelope shape)                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    synthAttack (0.01-8 sec)
         │
         └────────────────────────────────────────────────▶ envelope.gain.setTargetAtTime(1.0, now, attack/3)

    synthDecay (0.01-8 sec)
         │
         └────────────────────────────────────────────────▶ envelope.gain.setTargetAtTime(sustain, now+attack, decay/3)

    synthSustain (0-1)
         │
         └────────────────────────────────────────────────▶ Target gain level after decay

    synthRelease (0.01-16 sec)
         │
         └────────────────────────────────────────────────▶ envelope.gain.setTargetAtTime(0, now, release/4)

    waveSpread (0-30 sec)
         │
         └────────────────────────────────────────────────▶ Staggered voice entry times (random per voice)
```

### Granular Effect

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           GRANULAR SLIDERS                                                       │
│                                    (Sent to AudioWorklet via postMessage)                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    granularEnabled (boolean)
         │
         ├─── false ─────────────────────────────────────▶ granularDirect.gain = 0
         │                                               ▶ granularReverbSend.gain = 0
         └─── true ──────────────────────────────────────▶ granularDirect.gain = granularLevel
                                                         ▶ granularReverbSend.gain = granularReverbSend

    grainSize (5-200 ms) — 3-mode slider (single/walk/sampleHold)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({grainSizeMin, grainSizeMax})
              (walk/S&H: engine reads dualRanges['grainSize'].min/max;
               single: uses state.grainSize for both min and max)

    density (1-50 grains/sec)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({density})

    spray (0-1)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({spray})
                                                                   └─── Buffer position randomization

    jitter (0-1)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({jitter})
                                                                   └─── Grain timing randomization

    grainProbability (0-1)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({probability})

    grainPitchMode ('fixed'|'random'|'harmonic')
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({pitchMode})

    pitchSpread (0-1)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({pitchSpread})

    stereoSpread (0-1)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({stereoSpread})

    feedback (0-0.35 clamped)
         │
         └────────────────────────────────────────────────▶ granulatorNode.port.postMessage({feedback})

    wetHPF (20-2000 Hz)
         │
         └────────────────────────────────────────────────▶ granularWetHPF.frequency

    wetLPF (1000-20000 Hz)
         │
         └────────────────────────────────────────────────▶ granularWetLPF.frequency
```

### Reverb Effect

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                            REVERB SLIDERS                                                        │
│                                    (Sent to AudioWorklet via postMessage)                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    reverbType ('hall'|'plate'|'room')
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({type})

    reverbDecay (0.5-30 sec)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({decay})

    reverbSize (0-1)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({size})
                                                                   └─── Controls delay line lengths

    reverbDiffusion (0-1)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({diffusion})

    reverbModulation (0-1)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({modulation})

    predelay (0-0.1 sec)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({predelay})

    damping (0-1)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({damping})
                                                                   └─── High frequency decay rate

    width (0-1)
         │
         └────────────────────────────────────────────────▶ reverbNode.port.postMessage({width})
                                                                   └─── Stereo decorrelation
```

### Lead Synth

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             LEAD SLIDERS                                                         │
│                                      (FM Synthesis + Ping-Pong Delay)                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    leadEnabled (boolean)
         │
         ├─── false ─────────────────────────────────────▶ leadGain.gain = 0
         │                                               ▶ Stop leadMelodyTimer
         └─── true ──────────────────────────────────────▶ leadGain.gain = leadLevel
                                                         ▶ Start leadMelodyTimer

    leadTimbre (0-1)
         │
         ├─── 0 = Rhodes Piano ──────────────────────────▶ 2 modulators: octave + fifth
         ├─── 0.5 = Hybrid ──────────────────────────────▶ 4 modulators: all active
         └─── 1 = Gamelan Bell ──────────────────────────▶ 4 modulators: inharmonic
         
         │
         └────────────────────────────────────────────────▶ Modulator indices controlled:
                                                                  mod1: ratio 1.0 (octave below)
                                                                  mod2: ratio 3.0 (octave + fifth)
                                                                  mod3: ratio 5.04 (inharmonic)
                                                                  mod4: ratio 7.02 (metallic)

    leadAttack (0.001-2 sec)
         │
         └────────────────────────────────────────────────▶ Note envelope attack time

    leadDecay (0.05-4 sec)
         │
         └────────────────────────────────────────────────▶ Note envelope decay time

    leadSustain (0-1)
         │
         └────────────────────────────────────────────────▶ Note envelope sustain level

    leadRelease (0.05-8 sec)
         │
         └────────────────────────────────────────────────▶ Note envelope release time

    leadVibrato (0-20 Hz)
         │
         └────────────────────────────────────────────────▶ Vibrato LFO depth (cents)

    leadVibratoRate (0.5-10 Hz)
         │
         └────────────────────────────────────────────────▶ Vibrato LFO frequency

    leadOctave (-2 to +2)
         │
         └────────────────────────────────────────────────▶ Note frequency × 2^octave

    leadDelayTime (50-1000 ms)
         │
         ├────────────────────────────────────────────────▶ leadDelayL.delayTime = delayTime
         └────────────────────────────────────────────────▶ leadDelayR.delayTime = delayTime × 0.75

    leadDelayFeedback (0-0.9)
         │
         ├────────────────────────────────────────────────▶ leadDelayFeedbackL.gain
         └────────────────────────────────────────────────▶ leadDelayFeedbackR.gain

    leadDelayMix (0-1)
         │
         └────────────────────────────────────────────────▶ leadDelayMix.gain
```

### Euclidean Rhythms (Lead)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         EUCLIDEAN SLIDERS                                                        │
│                                    (Multi-lane rhythm configuration)                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    leadEuclideanMasterEnabled (boolean)
         │
         ├─── false ─────────────────────────────────────▶ Use free-tempo scheduling
         └─── true ──────────────────────────────────────▶ Use Euclidean pattern scheduling

    leadEuclideanPreset (string)
         │
         ├─── 'gamelan' ─────────────────────────────────▶ 4 lanes: [7,16], [5,16], [3,8], [2,8]
         ├─── 'steveReich' ──────────────────────────────▶ 3 lanes: [3,8], [4,12], [5,16]
         ├─── 'westAfrican' ─────────────────────────────▶ 4 lanes: [3,8], [5,12], [7,16], [4,16]
         ├─── 'minimal' ─────────────────────────────────▶ 2 lanes: [3,8], [2,8]
         ├─── 'polymetric' ──────────────────────────────▶ 4 lanes: [5,8], [7,12], [11,16], [3,4]
         └─── 'sparse' ──────────────────────────────────▶ 3 lanes: [2,8], [3,12], [1,4]

    leadEuclid1Enabled/2/3/4 (boolean)
         │
         └────────────────────────────────────────────────▶ Enable/disable individual lanes

    leadEuclid1Steps/2/3/4 (4-32)
         │
         └────────────────────────────────────────────────▶ Total steps in pattern

    leadEuclid1Pulses/2/3/4 (1-steps)
         │
         └────────────────────────────────────────────────▶ Number of hits (Bjorklund algorithm)

    leadEuclid1Octave/2/3/4 (-2 to +2)
         │
         └────────────────────────────────────────────────▶ Octave offset for lane

    leadEuclid1Probability/2/3/4 (0-1)
         │
         └────────────────────────────────────────────────▶ Chance of note playing
```

### Ocean Section

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             OCEAN SLIDERS                                                        │
│                                   (Wave Synth + Sample Player)                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    oceanWaveSynthEnabled (boolean)
         │
         ├─── false ─────────────────────────────────────▶ oceanGain.gain = 0
         └─── true ──────────────────────────────────────▶ oceanGain.gain = oceanWaveSynthLevel

    oceanSampleEnabled (boolean)
         │
         ├─── false ─────────────────────────────────────▶ oceanSampleGain.gain = 0
         └─── true ──────────────────────────────────────▶ oceanSampleGain.gain = oceanSampleLevel
                                                         ▶ Start oceanSampleSource playback

    oceanDuration (0.5-10 sec) — 3-mode slider (single/walk/sampleHold)
         │
         └────────────────────────────────────────────────▶ oceanNode.parameters.waveDuration
              (walk/S&H: engine reads dualRanges['oceanDuration'].min/max)

    oceanInterval (0.1-5 sec) — 3-mode slider
         │
         └────────────────────────────────────────────────▶ oceanNode.parameters.waveInterval
              (walk/S&H: engine reads dualRanges['oceanInterval'].min/max)

    oceanFoam (0-1) — 3-mode slider
         │
         └────────────────────────────────────────────────▶ oceanNode.parameters.foam
              (walk/S&H: engine reads dualRanges['oceanFoam'].min/max)

    oceanDepth (0-1) — 3-mode slider
         │
         └────────────────────────────────────────────────▶ oceanNode.parameters.depth
              (walk/S&H: engine reads dualRanges['oceanDepth'].min/max)

    oceanFilterType (enum)
         │
         └────────────────────────────────────────────────▶ oceanFilter.type

    oceanFilterCutoff (20-20000 Hz)
         │
         └────────────────────────────────────────────────▶ oceanFilter.frequency

    oceanFilterResonance (0-1)
         │
         └────────────────────────────────────────────────▶ oceanFilter.Q = 0.5 + resonance × 10
```

### Harmony/Circle of Fifths

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         HARMONY SLIDERS                                                          │
│                                  (Affects note/chord selection logic)                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    tension (0-1)
         │
         ├────────────────────────────────────────────────▶ Scale family selection weights
         ├────────────────────────────────────────────────▶ Chord complexity (notes per chord)
         ├────────────────────────────────────────────────▶ Dissonance tolerance
         └────────────────────────────────────────────────▶ UI hexagon size (visual only)

    rootNote (0-11)
         │
         └────────────────────────────────────────────────▶ Home key for harmony (C=0, E=4, etc.)
                                                                   └─── Combined with cofCurrentStep

    scaleMode ('auto'|'manual')
         │
         ├─── 'auto' ────────────────────────────────────▶ Tension-weighted random selection
         └─── 'manual' ──────────────────────────────────▶ Use manualScale directly

    manualScale (string)
         │
         └────────────────────────────────────────────────▶ getScaleByName(manualScale)

    chordRate (8-64 sec)
         │
         └────────────────────────────────────────────────▶ Phrases between chord changes
                                                                   └─── 1 phrase = 16 seconds

    voicingSpread (0-1)
         │
         └────────────────────────────────────────────────▶ Probability of octave displacement

    cofDriftEnabled (boolean)
         │
         ├─── false ─────────────────────────────────────▶ effectiveRoot = rootNote
         └─── true ──────────────────────────────────────▶ effectiveRoot = calculateDriftedRoot(rootNote, step)

    cofDriftRate (1-8 phrases)
         │
         └────────────────────────────────────────────────▶ How often drift occurs (phrase multiples)

    cofDriftDirection ('cw'|'ccw'|'random')
         │
         └────────────────────────────────────────────────▶ Direction around Circle of Fifths

    cofDriftRange (1-6 steps)
         │
         └────────────────────────────────────────────────▶ Maximum steps from home key

    cofCurrentStep (-6 to +6)
         │
         └────────────────────────────────────────────────▶ Display only (engine-controlled)
                                                                   └─── UI: CircleOfFifths widget
```

---

## Part 2: Audio Node → Audio Node Connections

### Complete Signal Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          AUDIO NODE GRAPH                                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                            ┌──────────────────────────────────────────────────────────────────────────────────┐
                            │                            SYNTH VOICES (x6)                                     │
                            │                                                                                  │
                            │   osc1 (sine) ─────────▶ osc1Gain ─────┐                                        │
                            │   osc2 (triangle) ─────▶ osc2Gain ─────┤                                        │
                            │   osc3 (saw detuned) ──▶ osc3Gain ─────┼──▶ filter ──▶ warmthFilter ────────────│
                            │   osc4 (saw) ──────────▶ osc4Gain ─────┤       │            │                   │
                            │   noise ───────────────▶ noiseGain ────┘       │            ▼                   │
                            │                                                │      presenceFilter            │
                            │                                                │            │                   │
                            │                                                │            ▼                   │
                            │                                                │       saturation              │
                            │                                                │            │                   │
                            │                                                │            ▼                   │
                            │                                                │          gain                  │
                            │                                                │            │                   │
                            │                                                │            ▼                   │
                            │                                                │       envelope ───────────────│───┐
                            │                                                │                                │   │
                            └──────────────────────────────────────────────────────────────────────────────────┘   │
                                                                                                                   │
                                                                                                                   │
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──┐
│                                                  MAIN AUDIO BUS                                                  ▼  │
│                                                                                                                     │
│   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐     │
│   │                                          synthBus                                                        │◀────┘
│   └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
│                                 │                                        │
│                                 ▼                                        ▼
│                        granulatorInputGain                            dryBus
│                                 │                                        │
│                                 ▼                                        ├────────▶ synthReverbSend ────────────┐
│                        ┌────────────────┐                                │                                      │
│                        │  GRANULATOR    │                                └────────▶ synthDirect ─────────────┐  │
│                        │  (Worklet)     │                                                                    │  │
│                        └────────────────┘                                                                    │  │
│                                 │                                                                            │  │
│                                 ▼                                                                            │  │
│                         granularWetHPF                                                                       │  │
│                                 │                                                                            │  │
│                                 ▼                                                                            │  │
│                         granularWetLPF                                                                       │  │
│                                 │                                                                            │  │
│                                 ├────────▶ granularReverbSend ──────────────────────────────────────────────┐│  │
│                                 │                                                                           ││  │
│                                 └────────▶ granularDirect ────────────────────────────────────────────────┐ ││  │
│                                                                                                           │ ││  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┼─┼┼──┘
                                                                                                            │ ││
                                                                                                            │ ││
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┼─┼┼──┐
│                                           LEAD SYNTH                                                      │ ││  │
│                                                                                                           │ ││  │
│   FM Note (per-note oscillators) ───▶ leadGain ───▶ leadFilter ───┬──────▶ leadDry ────────────────────┐  │ ││  │
│                                                          │        │                                    │  │ ││  │
│                                                          │        └──────▶ leadReverbSend ─────────────┼──┼─┼┼──│──┐
│                                                          │                                             │  │ ││  │  │
│                                                          ▼                                             │  │ ││  │  │
│                                                     leadDelayL ◀─────────────────────────────────┐     │  │ ││  │  │
│                                                          │                                       │     │  │ ││  │  │
│                                                          ├──────▶ leadMerger[0] (L) ──┐          │     │  │ ││  │  │
│                                                          │                            │          │     │  │ ││  │  │
│                                                          ▼                            │          │     │  │ ││  │  │
│                                               leadDelayFeedbackL                      │          │     │  │ ││  │  │
│                                                          │                            │          │     │  │ ││  │  │
│                                                          ▼                            │          │     │  │ ││  │  │
│                                                     leadDelayR                        │          │     │  │ ││  │  │
│                                                          │                            │          │     │  │ ││  │  │
│                                                          ├──────▶ leadMerger[1] (R) ──┼──────────│─────│──│─┼┼──│──│──┐
│                                                          │                            │          │     │  │ ││  │  │  │
│                                                          ▼                            ▼          │     │  │ ││  │  │  │
│                                               leadDelayFeedbackR            leadDelayMix ────┐   │     │  │ ││  │  │  │
│                                                          │                       │           │   │     │  │ ││  │  │  │
│                                                          └───────────────────────┼───────────┼───┘     │  │ ││  │  │  │
│                                                                                  │           │         │  │ ││  │  │  │
│                                                                                  └──▶ leadDelayReverbSend─┼──┼─┼┼──│──│──┐
│                                                                                              │         │  │ ││  │  │  │
└──────────────────────────────────────────────────────────────────────────────────────────────┼─────────┼──┼─┼┼──┘  │  │
                                                                                               │         │  │ ││     │  │
                                                                                               │         │  │ ││     │  │
┌──────────────────────────────────────────────────────────────────────────────────────────────┼─────────┼──┼─┼┼─────┼──┼──┐
│                                          OCEAN                                               │         │  │ ││     │  │  │
│                                                                                              │         │  │ ││     │  │  │
│   ┌────────────────┐                                                                         │         │  │ ││     │  │  │
│   │  OCEAN SYNTH   │──▶ oceanGain ──────────────────────────────┐                            │         │  │ ││     │  │  │
│   │  (Worklet)     │                                            │                            │         │  │ ││     │  │  │
│   └────────────────┘                                            ▼                            │         │  │ ││     │  │  │
│                                                            oceanFilter ──────────────────────┼─────────┼──┼─┼┼─────┼──┼──│──┐
│   oceanSampleSource ──▶ oceanSampleGain ────────────────────────┘                            │         │  │ ││     │  │  │  │
│                                                                                              │         │  │ ││     │  │  │  │
└──────────────────────────────────────────────────────────────────────────────────────────────┼─────────┼──┼─┼┼─────┼──┼──┼──┘
                                                                                               │         │  │ ││     │  │  │
                                                                                               │         │  │ ││     │  │  │
┌──────────────────────────────────────────────────────────────────────────────────────────────┼─────────┼──┼─┼┼─────┼──┼──┼──┐
│                                          REVERB                                              │         │  │ ││     │  │  │  │
│                                                                                              │         │  │ ││     │  │  │  │
│   ┌────────────────┐ ◀───────────────────────────────────────────────────────────────────────┘         │  │ ││     │  │  │  │
│   │  FDN REVERB    │ ◀─────────────────────────────────────────────────────────────────────────────────┘  │ ││     │  │  │  │
│   │  (Worklet)     │ ◀────────────────────────────────────────────────────────────────────────────────────┘ ││     │  │  │  │
│   │                │ ◀──────────────────────────────────────────────────────────────────────────────────────┘│     │  │  │  │
│   │                │ ◀───────────────────────────────────────────────────────────────────────────────────────┘     │  │  │  │
│   └────────────────┘                                                                                               │  │  │  │
│            │                                                                                                       │  │  │  │
│            ▼                                                                                                       │  │  │  │
│   reverbOutputGain ────────────────────────────────────────────────────────────────────────────────────────────────┼──┼──┼──│──┐
│                                                                                                                    │  │  │  │  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──┼──┼──┼──┘
                                                                                                                     │  │  │  │
                                                                                                                     │  │  │  │
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──┼──┼──┼──┐
│                                          MASTER OUTPUT                                                             │  │  │  │  │
│                                                                                                                    │  │  │  │  │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │  │  │  │  │
│   │                                         masterGain ◀───────────────────────────────────────────────────────┼───┘  │  │  │  │
│   │                                              ◀─────────────────────────────────────────────────────────────┼──────┘  │  │  │
│   │                                              ◀─────────────────────────────────────────────────────────────┼─────────┘  │  │
│   │                                              ◀─────────────────────────────────────────────────────────────┼────────────┘  │
│   │                                              ◀─────────────────────────────────────────────────────────────┼───────────────┘
│   └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
│                                                  │
│                                                  ▼
│                                             limiter (DynamicsCompressor configured as limiter)
│                                                  │
│                                                  ├──────────▶ ctx.destination (speakers)
│                                                  │
│                                                  └──────────▶ mediaStreamDest (for iOS background audio)
│
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Component Dependencies

### What Depends on What

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    COMPONENT DEPENDENCY GRAPH                                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────────┐
                                    │    SliderState      │
                                    │   (state.ts)        │
                                    └─────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
    │   HarmonyState      │       │   AudioEngine       │       │   SnowflakeUI       │
    │   (harmony.ts)      │       │   (engine.ts)       │       │   (SnowflakeUI.tsx) │
    └─────────────────────┘       └─────────────────────┘       └─────────────────────┘
              │                               │                               │
              │                               │                               │
              ▼                               │                               ▼
    ┌─────────────────────┐                   │               ┌─────────────────────┐
    │   Scale Selection   │                   │               │  CircleOfFifths     │
    │   (scales.ts)       │◀──────────────────┤               │  (CircleOfFifths.tsx)│
    └─────────────────────┘                   │               └─────────────────────┘
              │                               │
              │                               │
              ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │   Note Pitches      │──────▶│   Poly Synth        │
    │   (midiToFreq)      │       │   (6 voices)        │
    └─────────────────────┘       └─────────────────────┘
                                              │
                                              ├──────────────────────────────────────────┐
                                              │                                          │
                                              ▼                                          ▼
                                  ┌─────────────────────┐                   ┌─────────────────────┐
                                  │   Granulator        │                   │   Lead Synth        │
                                  │   (worklet)         │                   │   (FM + Delay)      │
                                  └─────────────────────┘                   └─────────────────────┘
                                              │                                          │
                                              │                                          │
                                              ▼                                          ▼
                                  ┌───────────────────────────────────────────────────────────────┐
                                  │                         FDN Reverb                            │
                                  │                         (worklet)                             │
                                  └───────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
                                                  ┌─────────────────────┐
                                                  │   Master Output     │
                                                  │   (Limiter)         │
                                                  └─────────────────────┘
```

### Cross-Component Dependencies

| Component | Depends On | Provides To |
|-----------|------------|-------------|
| **RNG (rng.ts)** | seedWindow, time bucket | Harmony, Granulator, Ocean |
| **Harmony (harmony.ts)** | tension, rootNote, cofStep, scaleMode | Poly Synth voices, Lead Synth |
| **Scales (scales.ts)** | - | Harmony |
| **Poly Synth** | Harmony (chord freqs), all synth sliders | synthBus |
| **Granulator** | synthBus audio, RNG sequence, granular sliders | granularWetLPF |
| **Lead Synth** | Harmony (scale notes), Euclidean config, lead sliders | leadGain |
| **FDN Reverb** | All reverb sends, reverb sliders | reverbOutputGain |
| **Ocean Synth** | RNG seed, ocean sliders | oceanGain |
| **Ocean Sample** | oceanSampleEnabled | oceanSampleGain |
| **Master Output** | All direct gains + reverb output | ctx.destination |

### Timing Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         TIMING RELATIONSHIPS                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    PHRASE BOUNDARY (every 16 seconds)
         │
         ├──────▶ updateCircleOfFifthsDrift()
         │             │
         │             └──▶ May change cofCurrentStep
         │                        │
         │                        └──▶ calculateDriftedRoot() updates effectiveRoot
         │
         ├──────▶ updateHarmonyState()
         │             │
         │             └──▶ May generate new chord
         │                        │
         │                        └──▶ applyChord() triggers voice frequency changes
         │
         ├──────▶ sendGranulatorRandomSequence()
         │             │
         │             └──▶ Reseed granulator for phrase
         │
         └──────▶ notifyStateChange()
                       │
                       └──▶ UI updates (CoF widget, etc.)


    FILTER MODULATION (every 100ms)
         │
         └──────▶ Random walk updates filterModValue
                       │
                       └──▶ voice.filter.frequency interpolates


    LEAD MELODY (tempo-dependent)
         │
         └──────▶ scheduleMelodyNotes()
                       │
                       ├──▶ If Euclidean: Use pattern timing
                       │
                       └──▶ If free: Random timing based on density
```

---

## Part 4: UI ↔ Audio Bidirectional Connections

### UI Reads From Engine

| UI Element | Engine Property | Update Trigger |
|------------|-----------------|----------------|
| Circle of Fifths current key | `cofConfig.currentStep` | `notifyStateChange()` |
| Filter frequency display | `currentFilterFreq` | `applyFilterModulation()` |
| Current seed display | `currentSeed` | `recomputeSeed()` |
| Current bucket display | `currentBucket` | `recomputeSeed()` |
| Harmony state (scale, chord) | `harmonyState` | `onPhraseBoundary()` |

### UI Writes To Engine

| UI Control | Engine Method | Immediate Effect |
|------------|---------------|------------------|
| Any slider change | `updateParams(state)` | `applyParams()` called |
| Play button | `start(state)` | Create audio graph |
| Stop button | `stop()` | Destroy audio graph |
| Preset load | `updateParams(state)` | Full parameter update |
| Seed lock toggle | `setSeedLocked(bool)` | Prevent seed recompute |

---

## Part 5: Worklet Communication

### Message Types: Main Thread → Worklet

```typescript
// Granulator Worklet
granulatorNode.port.postMessage({
    type: 'params',
    params: {
        grainSizeMin, grainSizeMax,  // derived from dualRanges['grainSize'] or state.grainSize
        density, spray, jitter,
        probability, pitchMode, pitchSpread, stereoSpread,
        feedback, level
    }
});

granulatorNode.port.postMessage({
    type: 'randomSequence',
    sequence: Float32Array  // 10000 random values
});

// Reverb Worklet
reverbNode.port.postMessage({
    type: 'params',
    params: {
        type, decay, size, diffusion, modulation,
        predelay, damping, width
    }
});

// Ocean Worklet
oceanNode.port.postMessage({
    type: 'setSampleRate',
    sampleRate: number
});

oceanNode.port.postMessage({
    type: 'setSeed',
    seed: number
});
```

### AudioParam Control (Ocean Worklet)

```typescript
// Direct AudioParam access via processorOptions
const oceanParams = oceanNode.parameters;
oceanParams.get('intensity').setTargetAtTime(value, now, smoothTime);
oceanParams.get('waveDurationMin').setTargetAtTime(value, now, smoothTime);
// ... etc for all AudioParams
```
