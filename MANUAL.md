# Kessho - Generative Ambient Music App

## User Manual

---

## Table of Contents
1. [What is Kessho?](#what-is-kessho)
2. [Getting Started](#getting-started)
3. [Audio Signal Flow](#audio-signal-flow)
4. [Control Panels Reference](#control-panels-reference)
   - [Master Mixer](#master-mixer)
   - [Global](#global)
   - [Circle of Fifths Drift](#circle-of-fifths-drift)
   - [Harmony/Pitch](#harmonypitch)
   - [Timbre](#timbre)
   - [Space (Reverb)](#space-reverb)
   - [Granular](#granular)
   - [Lead Synth](#lead-synth)
   - [Drum Synth](#drum-synth)
   - [Ocean Waves](#ocean-waves)
   - [Preset Morph](#preset-morph)
5. [Scale System Explained](#scale-system-explained)
6. [Circle of Fifths Deep Dive](#circle-of-fifths-deep-dive)
7. [Tips for Creating Atmospheres](#tips-for-creating-atmospheres)

---

## What is Kessho?

Kessho (結晶, Japanese for "crystal") is a **generative ambient music application** that creates ever-evolving, deterministic soundscapes. Unlike traditional music players, Kessho *composes* music in real-time using algorithms, creating unique ambient textures that are never exactly the same twice.

### Key Features:
- **Deterministic Generation**: Music is generated from a seed, so the same settings at the same time produce the same output
- **Multiple Sound Layers**: Pad synth, granular processing, lead melodies, and ocean waves
- **Phrase-Based Evolution**: Harmony changes at 16-second phrase boundaries
- **Circle of Fifths Drift**: Automatic key modulation for harmonic journeys
- **Deep Customization**: Over 80 parameters to shape your soundscape

---

## Getting Started

1. **Click "Start"** to begin audio generation
2. The music will begin playing with default ambient settings
3. Expand control panels on the left to adjust parameters
4. Use **presets** to quickly change the overall character
5. Enable **Circle of Fifths Drift** for evolving key changes

---

## Audio Signal Flow

Understanding how sound flows through Kessho helps you shape your mix effectively.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUDIO SIGNAL FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│  PAD SYNTH   │──┬──→ [Synth Direct] ──────────────────────┬──→ ┌─────────┐
│  (6 voices)  │  │                                          │    │         │
│              │  └──→ [Synth Reverb Send] ──→ ┌─────────┐  │    │         │
└──────────────┘                               │         │  │    │         │
       │                                       │         │  │    │         │
       ▼                                       │         │  │    │         │
┌──────────────┐                               │         │  │    │         │
│  GRANULAR    │──┬──→ [HPF] → [LPF] ──────────│         │  │    │         │
│  PROCESSOR   │  │      │                     │ REVERB  │──┼──→ │ MASTER  │
│              │  │      └──→ [Gran Rev Send]→ │  (FDN)  │  │    │  GAIN   │──→ [LIMITER] ──→ OUTPUT
└──────────────┘  │                            │         │  │    │         │
                  └──→ [Granular Direct] ──────│         │──┼──→ │         │
                                               │         │  │    │         │
┌──────────────┐                               │         │  │    │         │
│  LEAD SYNTH  │──→ [Filter] ──┬──→ [Lead Dry]─│         │──┼──→ │         │
│  (Rhodes/    │               │               │         │  │    │         │
│   Bell)      │               ├──→ [Lead Rev] │         │  │    │         │
│              │               │               │         │  │    │         │
│              │               └──→ [Ping-Pong Delay] ───┼──→ │         │
└──────────────┘                        │                │    │         │
                                        └──→ [Delay Rev]─┘    │         │
┌──────────────┐                                               │         │
│  DRUM SYNTH  │──┬──→ [Voice Levels] ─────────────────────────│         │
│  (6 voices)  │  │                                            │         │
│              │  └──→ [Per-Voice Sends] ──→ ┌─────────────┐   │         │
└──────────────┘                             │ STEREO DELAY│───│         │
                                             │ (Ping-Pong) │   │         │
                                             │  L: 1/8d    │   │         │
                                             │  R: 1/4     │   │         │
                                             └─────────────┘   │         │
┌──────────────┐                                               │         │
│ OCEAN WAVES  │──→ [Ocean Filter] ────────────────────────────│         │
│ (Sample +    │                                               │         │
│  Synthesis)  │                                               └─────────┘
└──────────────┘
```

### Signal Path Summary:
1. **Pad Synth** → Splits to direct output and reverb send
2. **Granular** → Processes pad audio, filtered (HPF/LPF), splits to direct and reverb
3. **Lead Synth** → Through filter, splits to dry, reverb, and ping-pong delay
4. **Drum Synth** → 6 voices with individual levels, per-voice delay sends to stereo ping-pong delay
5. **Ocean Waves** → Through ocean filter, direct to master
6. **Reverb** → All reverb sends mix together and output to master
7. **Master** → All signals sum, through limiter, to speakers

---

## Control Panels Reference

### Master Mixer

Controls the overall volume balance between sound sources.

| Control | Range | Description |
|---------|-------|-------------|
| **Master Volume** | 0-100% | Overall output level |
| **Synth Level** | 0-100% | Pad synth direct output (bypassing granular) |
| **Granular Level** | 0-200% | Granular processor output level |
| **Synth Reverb Send** | 0-100% | How much pad synth feeds into reverb |
| **Granular Reverb Send** | 0-100% | How much granular output feeds into reverb |
| **Lead Reverb Send** | 0-100% | How much lead synth feeds into reverb |
| **Lead Delay Reverb Send** | 0-100% | How much lead delay output feeds into reverb |
| **Reverb Level** | 0-200% | Reverb output level |
| **Drum Level** | 0-100% | Master level for all drum synth voices |

---

### Global

System-wide settings affecting generation behavior.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Root Note** | C, C#, D... B | The home key for all harmony (tap to change via Circle of Fifths popup) |
| **Seed Window** | Hour / Day | How often the generation seed changes |
| **Randomness** | 0-100% | Amount of variation in generated patterns |
| **Random Walk Speed** | 0.1-5x | Speed of value drift for dual sliders (range mode parameters) |

**Root Note Selection**: Tapping the current root note opens a Circle of Fifths popup for quick key selection. The selected key becomes the new home key for all harmony generation and Circle of Fifths drift.

---

### Circle of Fifths Drift

Enables automatic key modulation around the Circle of Fifths for evolving harmonic journeys.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Enable/Disable** | ON/OFF | Toggle key drifting |
| **Drift Rate** | 1-8 phrases | How many 16-second phrases between key changes |
| **Drift Direction** | CW / CCW / Random | Clockwise (sharps), counter-clockwise (flats), or random |
| **Drift Range** | 1-6 steps | Maximum distance from home key before bouncing back |

**Visual Display**: Shows current position on the Circle of Fifths:
- **Blue**: Home key
- **Green**: Current key
- **Gray**: Keys within drift range

---

### Harmony/Pitch

Controls the musical content: scales, chords, and voicing.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Scale Mode** | Auto / Manual | Auto selects based on tension; Manual lets you choose |
| **Manual Scale** | [Scale list] | Which scale to use in Manual mode |
| **Tension** | 0-100% | Musical dissonance (0=consonant, 100=dissonant) |
| **Chord Rate** | 8-64 sec | How often chords change |
| **Voicing Spread** | 0-100% | How spread out chord notes are across octaves |
| **Wave Spread** | 0-30 sec | Stagger time between voice entries (0=all at once) |
| **Detune** | 0-25 cents | Slight pitch variation between voices (warmth) |
| **Voice Mask** | Binary | Which of the 6 synth voices are active |
| **Synth Octave** | -2 to +2 | Octave shift for pad synth |

#### Synth ADSR Envelope:
| Control | Range | Description |
|---------|-------|-------------|
| **Attack** | 0.01-16 sec | Time to reach full volume |
| **Decay** | 0.01-8 sec | Time to fall to sustain level |
| **Sustain** | 0-100% | Volume level while note held |
| **Release** | 0.01-30 sec | Fade-out time after note ends |

---

### Timbre

Shapes the tonal character of the pad synth.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Hardness** | 0-100% | Soft saturation/warmth amount |
| **Oscillator Brightness** | Sine → Triangle → Saw+Tri → Saw | Waveform selection (brighter = more harmonics) |
| **Filter Type** | Lowpass / Bandpass / Highpass / Notch | Filter mode |
| **Filter Cutoff Min** | 40-8000 Hz | Lower limit of filter sweep |
| **Filter Cutoff Max** | 40-8000 Hz | Upper limit of filter sweep |
| **Filter Mod Speed** | 0-16 phrases | How many phrases per full filter cycle (0=static) |
| **Filter Resonance** | 0-100% | Peak emphasis at cutoff frequency |
| **Filter Q** | 0.1-12 | Filter bandwidth/sharpness |
| **Warmth** | 0-100% | Low-frequency shelf boost |
| **Presence** | 0-100% | High-mid emphasis |
| **Air/Noise** | 0-100% | Breathy noise layer amount |

---

### Space (Reverb)

Creates the spatial environment for all sounds.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Reverb Engine** | Algorithmic / Convolution | Algorithm type |
| **Reverb Type** | Plate / Hall / Cathedral / Dark Hall | Preset character |
| **Reverb Quality** | Ultra / Balanced / Lite | Processing quality (see below) |
| **Decay** | 0-100% | Reverb tail length |
| **Size** | 0.5-3.0 | Virtual room size |
| **Diffusion** | 0-100% | How smeared/smooth the reverb is |
| **Modulation** | 0-100% | Chorus-like shimmer effect |
| **Predelay** | 0-100 ms | Gap before reverb starts |
| **Damping** | 0-100% | High-frequency absorption |
| **Width** | 0-100% | Stereo spread |

#### Reverb Quality Modes

The FDN (Feedback Delay Network) reverb offers three quality levels:

| Mode | FDN Channels | Diffuser Stages | CPU Usage | Best For |
|------|-------------|-----------------|-----------|----------|
| **Ultra** | 8 | 32 (10+6+6+10) | High | Maximum smoothness, dense tails |
| **Balanced** | 8 | 16 (6+4+6) | Medium | Default quality, good balance |
| **Lite** | 4 | 8 | Low | Battery saving, older devices |

- **Ultra**: Maximum diffusion with 32 allpass stages creates the smoothest, most lush reverb tails. Best for headphone listening or when CPU isn't a concern.
- **Balanced**: The standard quality with excellent sound. Recommended for most use cases.
- **Lite**: Reduced 4-channel FDN with fewer diffusers. Suitable for mobile devices or when running other audio applications.

---

### Granular

Processes the pad synth through granular synthesis for texture.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Enable** | ON/OFF | Toggle granular processing |
| **Grain Probability** | 0-100% | Chance each grain triggers |
| **Grain Size Min/Max** | 5-200 ms | Duration range of each grain |
| **Density** | 5-80 grains/sec | How many grains per second |
| **Spray** | 0-600 ms | Random offset for grain start position |
| **Jitter** | 0-30 ms | Timing randomization |
| **Pitch Mode** | Random / Harmonic | How grain pitch is determined |
| **Pitch Spread** | 0-12 semitones | Range of pitch transposition |
| **Stereo Spread** | 0-100% | How wide grains are panned |
| **Feedback** | 0-35% | Grains feed back into input (use carefully!) |
| **Wet HPF** | 200-3000 Hz | High-pass filter on granular output |
| **Wet LPF** | 3000-12000 Hz | Low-pass filter on granular output |

---

### Lead Synth

A melodic voice with Rhodes/Bell character and delay.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Enable** | ON/OFF | Toggle lead synth |
| **Level** | 0-100% | Lead volume |
| **Attack** | 0.001-2 sec | Note attack time |
| **Decay** | 0.01-4 sec | Note decay time |
| **Sustain** | 0-100% | Sustain level |
| **Release** | 0.01-8 sec | Note release time |
| **Density** | 0.1-12 | Notes per phrase (sparseness) |
| **Octave** | -1 to +2 | Base octave offset |
| **Octave Range** | 1-4 | Octaves spanned by random notes |
| **Timbre Min/Max** | 0-100% | Rhodes (0%) to Bell (100%) character range |

#### Delay:
| Control | Range | Description |
|---------|-------|-------------|
| **Delay Time** | 0-1000 ms | Ping-pong delay time |
| **Delay Feedback** | 0-80% | Echo repetition amount |
| **Delay Mix** | 0-100% | Wet/dry blend |

#### Euclidean Sequencer:
Enable **Euclidean Mode** for polyrhythmic patterns with up to 4 lanes.

| Control | Description |
|---------|-------------|
| **Tempo** | Speed multiplier for all lanes |
| **Steps** | Pattern length (4-32) |
| **Hits** | Number of notes in pattern |
| **Rotation** | Pattern phase offset |
| **Note Range** | MIDI note range for this lane |
| **Level** | Velocity for this lane |

---

### Drum Synth

A generative percussion synthesizer with 6 synthesized voices, Euclidean sequencing, and stereo ping-pong delay.

#### Master Controls

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Drum Enable** | ON/OFF | Toggle the entire drum synth |
| **Mode** | Off / Euclidean / Random | Sequencing mode |
| **Master Level** | 0-100% | Overall drum output volume |

#### Euclidean Sequencer

When Mode is set to **Euclidean**, four lanes generate polyrhythmic patterns:

| Control | Range | Description |
|---------|-------|-------------|
| **Steps** | 1-16 | Pattern length |
| **Pulses** | 0-Steps | Hits distributed via Euclidean algorithm |
| **Rotation** | 0 to Steps-1 | Rotate the pattern |
| **Voice** | Sub/Kick/Click/BeepHi/BeepLo/Noise | Which drum voice this lane triggers |
| **Level** | 0-100% | Hit velocity for this lane |
| **Base BPM** | 40-200 | Tempo for all lanes |

#### Random Mode

In **Random** mode, drums trigger probabilistically:

| Control | Range | Description |
|---------|-------|-------------|
| **Density** | 0-100% | Probability of triggering each voice |
| **Interval** | 50-2000ms | Time between potential triggers |

#### Preset Morph System

Blend between two drum synthesis presets:

| Control | Description |
|---------|-------------|
| **Preset A/B** | Select presets for each morph slot |
| **Morph** | 0-100% crossfade position (0%=A, 100%=B) |
| **Auto Mode** | OFF, Ping-Pong, Forward | Automatic morphing |
| **Auto Cycle** | 10-120 sec | Duration of one morph cycle |
| **Random Range** | 0-100% | Per-trigger random morph deviation |

The morph system interpolates all synthesis parameters between presets A and B. **Random Range** adds per-hit variation—with 50% random range and morph at 30%, each hit's actual morph value varies between approximately 5%-55%.

#### The Six Voices

Each voice has individual **Level** and **Delay Send** controls, plus unique synthesis parameters:

##### Sub
Deep sine-wave sub-bass hit.
| Parameter | Range | Description |
|-----------|-------|-------------|
| **Pitch** | 20-80 Hz | Fundamental frequency |
| **Decay** | 50-800 ms | Amplitude envelope decay |

##### Kick
Pitched kick drum with frequency sweep.
| Parameter | Range | Description |
|-----------|-------|-------------|
| **Pitch** | 30-120 Hz | Base frequency |
| **Sweep** | 0-100% | Pitch drop amount |
| **Decay** | 50-500 ms | Envelope decay time |

##### Click
High-frequency transient click.
| Parameter | Range | Description |
|-----------|-------|-------------|
| **Pitch** | 800-8000 Hz | Click frequency |
| **Decay** | 1-50 ms | Very short decay |

##### BeepHi
High-pitched tonal beep.
| Parameter | Range | Description |
|-----------|-------|-------------|
| **Pitch** | 400-4000 Hz | Tone frequency |
| **Decay** | 20-300 ms | Envelope decay |

##### BeepLo
Lower-pitched tonal beep.
| Parameter | Range | Description |
|-----------|-------|-------------|
| **Pitch** | 80-800 Hz | Tone frequency |
| **Decay** | 20-300 ms | Envelope decay |

##### Noise
Filtered noise percussion.
| Parameter | Range | Description |
|-----------|-------|-------------|
| **Filter** | 200-12000 Hz | Bandpass center frequency |
| **Decay** | 10-500 ms | Envelope decay |
| **Tone** | 0-100% | Noise color (dark to bright) |

#### Stereo Ping-Pong Delay

A tempo-synced stereo delay effect with independent left/right timing:

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Delay Enable** | ON/OFF | Toggle the delay effect |
| **Left Time** | Note division | Delay time for left channel |
| **Right Time** | Note division | Delay time for right channel |
| **Feedback** | 0-90% | Delay regeneration |
| **Mix** | 0-100% | Wet/dry balance |
| **Filter** | 0-100% | Delay high-cut (darker at lower values) |

##### Note Division Options
Delay times sync to the Euclidean **Base BPM**:

| Value | Description |
|-------|-------------|
| 1/1 | Whole note |
| 1/2 | Half note |
| 1/2d | Dotted half note |
| 1/4 | Quarter note |
| 1/4d | Dotted quarter note |
| 1/4t | Quarter note triplet |
| 1/8 | Eighth note |
| 1/8d | Dotted eighth note |
| 1/8t | Eighth note triplet |
| 1/16 | Sixteenth note |
| 1/16d | Dotted sixteenth |
| 1/16t | Sixteenth triplet |
| 1/32 | Thirty-second note |

##### Per-Voice Delay Sends
Each of the 6 voices has its own **Delay Send** slider (0-100%). This allows precise control over which percussion elements use the delay effect. For example:
- Set **Click** delay send high for rhythmic echoes
- Keep **Sub** delay send low to avoid muddy low-end
- Use moderate **BeepHi** send for shimmering repeats

---

### Ocean Waves

Ambient ocean/wave sounds.

| Control | Options/Range | Description |
|---------|---------------|-------------|
| **Sample Enable** | ON/OFF | Toggle real ocean recording |
| **Sample Level** | 0-100% | Ocean sample volume |
| **Synth Enable** | ON/OFF | Toggle synthesized waves |
| **Synth Level** | 0-100% | Synth waves volume |
| **Filter Type** | Lowpass / Bandpass / Highpass / Notch | Filter mode |
| **Filter Cutoff** | 40-12000 Hz | Filter frequency |
| **Filter Resonance** | 0-100% | Filter peak |
| **Duration Min/Max** | 2-15 sec | Wave length range |
| **Interval Min/Max** | 3-20 sec | Time between waves |
| **Foam Min/Max** | 0-100% | White noise (foam) intensity |
| **Depth Min/Max** | 0-100% | Low rumble intensity |

---

### Preset Morph

Smoothly blend between two saved presets.

1. Load a preset into **Slot A**
2. Load a different preset into **Slot B**
3. Use the **Morph slider** to blend between them (0%=A, 100%=B)
4. All parameters smoothly interpolate
5. Enable **Auto-cycle** to automatically morph back and forth

#### Circle of Fifths Key Transitions

When morphing between presets with different root notes, the key transition follows the **Circle of Fifths** for smooth, musical modulation instead of jumping directly.

**How it works:**
1. The morph system calculates the **shortest path** around the Circle of Fifths between the source and destination keys
2. Key changes are **distributed evenly** across the morph duration
3. Each intermediate key is visited in sequence, creating a harmonic journey

**Path Examples:**

| From Key | To Key | Path | Steps | Direction |
|----------|--------|------|-------|-----------|
| E | B | E → B | 1 | Clockwise |
| E | A | E → A | 1 | Counter-clockwise |
| G | E | G → D → A → E | 3 | Counter-clockwise |
| C | F# | C → F → Bb → Eb → Ab → Db → F# | 6 | Counter-clockwise |
| C | F# | C → G → D → A → E → B → F# | 6 | Clockwise (same distance) |

**Morph Timeline Example** (E → G, 3 steps, 10-second morph):

| Morph % | Time | Key |
|---------|------|-----|
| 0% | 0s | E (start) |
| 33% | 3.3s | A |
| 66% | 6.6s | D |
| 100% | 10s | G (destination) |

The key changes are distributed evenly across the morph duration, creating a smooth harmonic journey rather than an abrupt key change. Each intermediate key plays for an equal portion of the morph time.

#### Smart CoF Toggle During Morph

When morphing between presets with different **Circle of Fifths Drift** settings:

| Scenario | Behavior |
|----------|----------|
| **Off → On** | CoF turns ON immediately when leaving the "off" preset, allowing the key walk to happen during morph |
| **On → Off** | CoF stays ON during the entire morph (key walk completes), only turns OFF upon arrival at destination |
| **On → On** | CoF stays ON, key walks between the two root notes |
| **Off → Off** | CoF stays OFF, instant key change at 50% |

This ensures the musical key transition always happens smoothly via the Circle of Fifths, regardless of whether either preset has drift enabled.

#### Dual Slider Morphing

Presets can contain **dual sliders** (range parameters with min/max values). Morphing handles these intelligently:

| Scenario | Behavior |
|----------|----------|
| **Single → Single** | Normal linear interpolation |
| **Single → Dual** | Creates dual slider with both handles at the single value, then independently morphs each handle to the target min/max |
| **Dual → Single** | Both min and max handles independently morph toward the single target value, converging at 100% |
| **Dual → Dual** | Min morphs to min, max morphs to max independently |

This ensures smooth transitions even when presets have different slider modes. The random walk behavior automatically activates/deactivates as the dual slider range opens or closes during the morph.

#### Editing Presets During Morph

You can modify parameters while morphing, with intelligent handling based on your morph position:

**At Endpoints (0% or 100%):**
Changes are **permanently saved** to the respective preset:
- At **0%**: Edits update Preset A
- At **100%**: Edits update Preset B

This includes:
- Slider value changes
- Toggling dual mode (single ↔ range)
- Adjusting dual slider min/max handles

**Mid-Morph (between endpoints):**
Changes are treated as **temporary overrides**:
- The new value is applied immediately
- As you continue morphing, the value smoothly blends toward the destination preset
- When you reach an endpoint, the override is cleared

This behavior applies to all morphable parameters including drum synth morph sliders.

---

## Scale System Explained

Kessho uses **scale families** (also called "modes") to determine which notes are played. Each scale has a characteristic mood and an assigned **tension value** that determines when it's likely to be selected.

### Available Scales (ordered by tension):

| Scale | Tension Value | Tension Level | Character |
|-------|---------------|---------------|-----------|
| **Major Pentatonic** | 0.00 (0%) | Consonant | Bright, simple, folk-like |
| **Major (Ionian)** | 0.05 (5%) | Consonant | Happy, resolved, classical |
| **Lydian** | 0.10 (10%) | Consonant | Dreamy, floating, mystical |
| **Mixolydian** | 0.18 (18%) | Consonant | Bluesy-bright, rock-like |
| **Minor Pentatonic** | 0.22 (22%) | Consonant | Bluesy, soulful |
| **Dorian** | 0.25 (25%) | Consonant | Minor but hopeful, jazzy |
| **Aeolian** | 0.35 (35%) | Color | Natural minor, sad |
| **Harmonic Minor** | 0.50 (50%) | Color | Exotic, dramatic |
| **Melodic Minor** | 0.55 (55%) | Color | Jazz, sophisticated |
| **Octatonic Half-Whole** | 0.85 (85%) | High | Dissonant, mysterious |
| **Phrygian Dominant** | 0.90 (90%) | High | Spanish, Middle-Eastern |

---

## How Tension Selection Works (In-Depth)

The **Tension** slider (0-100%) controls which scales are available AND how likely each is to be selected. This creates a smooth, musical progression from consonant to dissonant.

### Step 1: Tension Bands Filter Available Scales

First, your tension setting determines which **tension band** you're in, which filters which scales can be selected:

| Tension Range | Band | Available Scales |
|---------------|------|------------------|
| **0-25%** | Consonant Only | Major Pentatonic, Major, Lydian, Mixolydian, Minor Pentatonic, Dorian (6 scales) |
| **26-55%** | Consonant + Color | All above + Aeolian, Harmonic Minor, Melodic Minor (9 scales) |
| **56-80%** | Color + High | Aeolian, Harmonic Minor, Melodic Minor, Octatonic, Phrygian Dominant (5 scales) |
| **81-100%** | High Only | Octatonic Half-Whole, Phrygian Dominant (2 scales) |

### Step 2: Weighted Random Selection

Within the available scales, the app uses **weighted random selection** based on how close each scale's tension value is to your slider setting.

The formula is:
```
weight = (1 / (distance + 0.05))^1.5
```

Where `distance = |scale_tension - slider_tension|`

This creates a **steep falloff** — scales very close to your setting are much more likely than ones further away.

#### Weight Examples:

| Distance from Slider | Weight | Relative Likelihood |
|---------------------|--------|---------------------|
| 0.00 (exact match) | 89.4 | Very High |
| 0.05 | 20.0 | High |
| 0.10 | 10.5 | Medium |
| 0.15 | 6.5 | Lower |
| 0.20 | 4.5 | Low |
| 0.25 | 3.3 | Very Low |

### Detailed Probability Breakdown by Tension Setting

Here's what happens at specific tension slider positions:

---

#### Tension = 0% (Fully Consonant)

**Available**: 6 consonant scales

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Major Pentatonic | 0.00 | 0.00 | 89.4 | **~62%** |
| Major (Ionian) | 0.05 | 0.05 | 20.0 | **~14%** |
| Lydian | 0.10 | 0.10 | 10.5 | ~7% |
| Mixolydian | 0.18 | 0.18 | 5.3 | ~4% |
| Minor Pentatonic | 0.22 | 0.22 | 4.0 | ~3% |
| Dorian | 0.25 | 0.25 | 3.3 | ~2% |

*At 0% tension, you'll get Major Pentatonic about 62% of the time, Major about 14%, with diminishing chances for others.*

---

#### Tension = 25% (Upper Consonant)

**Available**: 6 consonant scales

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Dorian | 0.25 | 0.00 | 89.4 | **~55%** |
| Minor Pentatonic | 0.22 | 0.03 | 30.9 | **~19%** |
| Mixolydian | 0.18 | 0.07 | 13.9 | ~9% |
| Lydian | 0.10 | 0.15 | 6.5 | ~4% |
| Major (Ionian) | 0.05 | 0.20 | 4.5 | ~3% |
| Major Pentatonic | 0.00 | 0.25 | 3.3 | ~2% |

*At 25%, Dorian dominates (~55%), with Minor Pentatonic as second choice (~19%).*

---

#### Tension = 35% (Lower Color)

**Available**: 9 scales (Consonant + Color)

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Aeolian | 0.35 | 0.00 | 89.4 | **~46%** |
| Dorian | 0.25 | 0.10 | 10.5 | ~5% |
| Minor Pentatonic | 0.22 | 0.13 | 7.4 | ~4% |
| Harmonic Minor | 0.50 | 0.15 | 6.5 | ~3% |
| Mixolydian | 0.18 | 0.17 | 5.6 | ~3% |
| Melodic Minor | 0.55 | 0.20 | 4.5 | ~2% |
| ... (others lower) | | | | |

*At 35%, Aeolian (natural minor) is most likely (~46%).*

---

#### Tension = 50% (Mid Color)

**Available**: 9 scales (Consonant + Color)

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Harmonic Minor | 0.50 | 0.00 | 89.4 | **~52%** |
| Melodic Minor | 0.55 | 0.05 | 20.0 | **~12%** |
| Aeolian | 0.35 | 0.15 | 6.5 | ~4% |
| Dorian | 0.25 | 0.25 | 3.3 | ~2% |
| ... (others lower) | | | | |

*At 50%, Harmonic Minor dominates (~52%), with Melodic Minor as second choice (~12%).*

---

#### Tension = 70% (Color + High)

**Available**: 5 scales (Color + High)

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Melodic Minor | 0.55 | 0.15 | 6.5 | ~13% |
| Harmonic Minor | 0.50 | 0.20 | 4.5 | ~9% |
| Octatonic | 0.85 | 0.15 | 6.5 | ~13% |
| Phrygian Dominant | 0.90 | 0.20 | 4.5 | ~9% |
| Aeolian | 0.35 | 0.35 | 2.3 | ~5% |

*At 70%, you get a mix — the slider is between color and high tension scales, so selection is more evenly distributed.*

---

#### Tension = 90% (High Tension)

**Available**: 2 high-tension scales only

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Phrygian Dominant | 0.90 | 0.00 | 89.4 | **~69%** |
| Octatonic | 0.85 | 0.05 | 20.0 | **~15%** |

*At 90%, Phrygian Dominant is selected ~69% of the time.*

---

#### Tension = 100% (Maximum Dissonance)

**Available**: 2 high-tension scales only

| Scale | Tension Value | Distance | Weight | Probability |
|-------|---------------|----------|--------|-------------|
| Phrygian Dominant | 0.90 | 0.10 | 10.5 | **~51%** |
| Octatonic | 0.85 | 0.15 | 6.5 | **~32%** |

*At 100%, both high-tension scales are used, with slight preference for Phrygian Dominant.*

---

### Summary: Tension Zones

| Tension Slider | Primary Scales | Musical Character |
|----------------|----------------|-------------------|
| **0-10%** | Major Pentatonic, Major | Bright, happy, resolved |
| **10-20%** | Lydian, Mixolydian | Dreamy, slightly bluesy |
| **20-30%** | Minor Pentatonic, Dorian | Minor but warm, jazzy |
| **30-40%** | Aeolian | Sad, melancholic |
| **40-55%** | Harmonic/Melodic Minor | Exotic, dramatic, jazzy |
| **55-80%** | Mixed Color + High | Unsettled, mysterious |
| **80-100%** | Octatonic, Phrygian | Dissonant, tense, ethnic |

---

### Complete Probability Matrix (by 0.05 tension increments)

The table below shows the **probability (%)** of each scale being selected at each tension slider value. Scales with <1% probability are shown as "—".

**Band Key:** C = Consonant band, M = Mixed (Consonant+Color), H = Color+High, X = High only

| Tension | Band | Maj Pent | Major | Lydian | Mixolyd | Min Pent | Dorian | Aeolian | Harm Min | Mel Min | Octatonic | Phrygian |
|---------|------|----------|-------|--------|---------|----------|--------|---------|----------|---------|-----------|----------|
| **0.00** | C | **56%** | 20% | 11% | 6% | 4% | 4% | — | — | — | — | — |
| **0.05** | C | 33% | **37%** | 16% | 7% | 5% | 4% | — | — | — | — | — |
| **0.10** | C | 18% | 28% | **27%** | 11% | 7% | 6% | — | — | — | — | — |
| **0.15** | C | 11% | 16% | 24% | **19%** | 12% | 10% | — | — | — | — | — |
| **0.20** | C | 7% | 10% | 14% | 22% | **22%** | 16% | — | — | — | — | — |
| **0.25** | C | 5% | 6% | 9% | 13% | 20% | **34%** | — | — | — | — | — |
| **0.30** | M | 3% | 4% | 5% | 7% | 10% | 18% | **37%** | 9% | 5% | — | — |
| **0.35** | M | 2% | 3% | 4% | 5% | 7% | 11% | **46%** | 13% | 7% | — | — |
| **0.40** | M | 2% | 2% | 3% | 4% | 5% | 8% | 28% | **26%** | 12% | — | — |
| **0.45** | M | 1% | 2% | 2% | 3% | 4% | 6% | 18% | **38%** | 17% | — | — |
| **0.50** | M | 1% | 1% | 2% | 2% | 3% | 5% | 11% | **47%** | 21% | — | — |
| **0.55** | M | 1% | 1% | 1% | 2% | 2% | 4% | 8% | 26% | **47%** | — | — |
| **0.60** | H | — | — | — | — | — | — | 5% | 14% | 26% | 24% | 19% |
| **0.65** | H | — | — | — | — | — | — | 4% | 9% | 16% | **33%** | 25% |
| **0.70** | H | — | — | — | — | — | — | 3% | 6% | 10% | **39%** | 30% |
| **0.75** | H | — | — | — | — | — | — | 2% | 4% | 7% | **42%** | 34% |
| **0.80** | H | — | — | — | — | — | — | 1% | 3% | 5% | **44%** | 37% |
| **0.85** | X | — | — | — | — | — | — | — | — | — | **74%** | 26% |
| **0.90** | X | — | — | — | — | — | — | — | — | — | 26% | **74%** |
| **0.95** | X | — | — | — | — | — | — | — | — | — | 37% | **63%** |
| **1.00** | X | — | — | — | — | — | — | — | — | — | 44% | **56%** |

**Reading the table:**
- At Tension = 0.00, Major Pentatonic is selected 56% of the time
- At Tension = 0.35, Aeolian dominates at 46%
- At Tension = 0.50, Harmonic Minor peaks at 47%
- At Tension = 0.85, Octatonic dominates at 74%
- **Bold** values indicate the most likely scale at that tension

**Note:** Due to the weighting formula `(1/(distance+0.05))^1.5`, scales very close to the tension value have dramatically higher selection probability. A scale exactly matching the tension value will be selected ~50-75% of the time when in a 2-scale band, or ~35-55% in larger bands.

---

### Auto vs Manual Mode:

- **Auto Mode**: Uses the weighted selection system above
- **Manual Mode**: Bypasses all of this — you pick the exact scale

### When Scales Change:

Scales are re-evaluated at each **chord change** (controlled by Chord Rate, 8-64 seconds). In Auto mode, each new chord might bring a new scale from the available pool.

---

## Circle of Fifths Deep Dive

The **Circle of Fifths** is a fundamental concept in music theory that shows relationships between keys. Kessho uses it to create smooth, natural-sounding key changes.

### What is the Circle of Fifths?

Arrange all 12 musical keys in a circle where each step moves up by a "fifth" (7 semitones):

```
           C
      F         G
   
   Bb              D
   
   Eb              A
   
     Ab         E
        Db/C#  B
         Gb/F#
```

### Why It Matters:

**Adjacent keys share most of their notes.** This makes transitions between neighboring keys sound smooth and natural.

Example - E and B are neighbors:
- E Major: E, F#, G#, A, B, C#, D#
- B Major: B, C#, D#, E, F#, G#, A#

They share 6 out of 7 notes! Only one note changes (D# → A#).

### How Drift Works in Kessho:

1. You set a **Home Key** (e.g., E) via the Root Note control
2. Enable **Circle of Fifths Drift**
3. Every N phrases (set by Drift Rate), the key shifts one step
4. The **mode** (Dorian, Lydian, etc.) stays the same—only the root changes

#### Example Journey (clockwise from E):
| Phrase | Step | Key | Scale |
|--------|------|-----|-------|
| 1-2 | 0 | E | E Dorian |
| 3-4 | +1 | B | B Dorian |
| 5-6 | +2 | F# | F# Dorian |
| 7-8 | +3 | C# | C# Dorian |
| 9-10 | +2 | F# | F# Dorian ← bounce back |
| 11-12 | +1 | B | B Dorian |
| 13-14 | 0 | E | E Dorian ← home |

### Drift Direction:

- **Clockwise (→)**: Moves toward sharps (E→B→F#→C#...)
- **Counter-clockwise (←)**: Moves toward flats (E→A→D→G...)
- **Random**: Randomly chooses direction each drift

### Drift Range:

Sets the maximum distance from home before bouncing back:
- Range 1: Only moves 1 step away (E↔B)
- Range 3: Can move 3 steps (E→B→F#→C#, then back)
- Range 6: Full half-circle (maximum variety)

---

## Tips for Creating Atmospheres

### Deep Ambient / Meditation
- Low tension (10-25%)
- Slow chord rate (48-64 sec)
- High reverb decay and size
- Disable lead or set very low density
- Enable ocean sample at low level

### Ethereal / Floating
- Lydian scale in manual mode
- High voicing spread
- Moderate granular with long grains
- Enable Circle of Fifths with slow drift (6-8 phrases)
- High reverb modulation for shimmer

### Dark / Mysterious
- High tension (60-85%)
- Aeolian or Harmonic Minor scale
- Low filter cutoff, high resonance
- Granular with short grains, high pitch spread
- Counter-clockwise Circle of Fifths drift

### Rhythmic / Active
- Enable Euclidean sequencer on lead
- Multiple lanes with different step counts (polyrhythms)
- Lower reverb decay
- Faster filter modulation

### Ocean Meditation
- Enable both ocean sample and synth
- Low pad synth level
- Very slow chord rate
- Minimal or no lead
- Gentle Circle of Fifths drift (range 2-3, rate 6-8)

---

## Keyboard Shortcuts & Interactions

| Key/Action | Result |
|------------|--------|
| **Space** | Start/Stop audio |
| **Double-click slider** | Toggle range mode (dual slider) |
| **Tap Root Note** | Opens key selection popup (Circle of Fifths display) |

### Dual Slider (Range Mode)

Double-clicking any slider converts it to a **dual slider** with two handles (min/max). When in range mode:

- The actual value **randomly walks** between the min and max handles
- **Random Walk Speed** (in Global settings) controls how fast values drift (0.1x = slow, 5x = fast)
- Each phrase boundary updates the random walk targets
- Double-click again to return to single-value mode

This creates organic, evolving textures as parameters gently shift within your defined range.

---

## Technical Notes

- **Phrase Length**: 16 seconds (all timing is based on this)
- **Seed-Based Generation**: Same seed + same settings = same output
- **Sample Rate**: Uses browser's native audio sample rate
- **Worklets**: Granular, Reverb, and Ocean use AudioWorklets for performance

---

*Kessho - Generative Ambient Music*
*Created with love for ambient sound explorers*
