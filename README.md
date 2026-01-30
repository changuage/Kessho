# Deterministic Generative Music

An ethereal pad synthesizer web application with granular effects, algorithmic reverb, and Paulstretch textures. Two users with the same UTC time window and slider settings will hear essentially the same generative musical structure.

![Generative Music App](https://via.placeholder.com/800x400/1a1a2e/a855f7?text=Deterministic+Generative+Music)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173`

## 🎵 Features

### Dual UI Modes

#### ❄️ Simple Mode (Snowflake UI)
The app opens with an interactive **6-pronged snowflake interface** where each prong controls a key parameter:
- **Master**: Master volume
- **Synth**: Synth level
- **Granular**: Granular level  
- **Lead**: Lead level
- **Reverb**: Reverb mix
- **Send**: Synth reverb send

Simply **drag the glowing circles** at the end of each prong to adjust values. The snowflake has a unique, randomly-generated shape each time you load the app!

#### ⚙️ Advanced Mode
Click **"Advanced Settings"** to access the full parameter interface with 70+ sliders organized into sections:
- Master Mixer, Global, Harmony/Pitch, Timbre, Space, Granular, Paulstretch, Lead Synth
- Click **"❄️ Simple Mode"** to return to the snowflake interface

### Sound Engine
- **Poly Synth Pad**: 6-voice synthesizer with detuned oscillators, filters, and saturation
- **Granular Effect**: AudioWorklet-based granular synthesis with deterministic grain scheduling
- **Algorithmic Reverb**: Multi-tap delay network with plate/hall/cathedral/dark hall presets
- **Paulstretch Layer**: Offline-rendered spectral stretching for ambient textures

### Determinism (Option 2)
The app uses **seeded randomness** so that two users with:
1. The same UTC time window (hour or day)
2. The same slider/parameter settings

...will hear essentially the same generative music structure:
- Same scale family selection
- Same chord progressions
- Same voicing decisions
- Same grain scheduling patterns
- Same Paulstretch phase randomization

## � Presets

### Saving Presets
1. Adjust all sliders to your desired sound
2. Click **"💾 Save Preset"**
3. Enter a name for your preset
4. The preset will be downloaded as a JSON file

### Loading Presets
1. Click **"📂 Load Preset"**
2. Select a preset JSON file
3. All slider positions will be restored

The `presets/` folder contains example presets you can try:
- **Ethereal Ambient**: Spacious, reverb-heavy atmospheric pad
- **Dark Textures**: Deep, moody granular soundscape
- **Bright Bells**: Sparkly high-frequency tones with lead melody

## 🔗 Sharing

Click the **"🔗 Copy Link"** button to copy a URL that encodes your current slider state. Anyone opening that link will start with the same settings and hear the same generative structure (within the same UTC time window).

## 🎯 How Determinism Works

### Seed Derivation
```
bucket = UTC hour (YYYY-MM-DDTHH) or UTC day (YYYY-MM-DD)
sliderStateJson = stable JSON serialization of all parameters
seedMaterial = `${bucket}|${sliderStateJson}|E_ROOT`
seed = xmur3(seedMaterial)()  // uint32 hash
rng = mulberry32(seed)        // seeded PRNG
```

### RNG Implementation
- **xmur3**: String hash function producing uint32 seeds
- **mulberry32**: Fast, high-quality 32-bit PRNG

### Scheduling
- Phrase length: 16 seconds
- Chord/scale changes only occur at phrase boundaries
- All musical decisions use the seeded RNG, never `Math.random()`

### Limitations
- Micro-timing differences may exist between browsers/devices
- Audio processing order may cause slight variations
- Paulstretch rendering time varies by device

## 📱 Mobile Performance

For best performance on mobile devices:

1. Use the **"hour"** seed window (less frequent recalculations)
2. Keep **Granular Mix** low (< 0.2)
3. Keep **Density** moderate (15-30)
4. Disable **Paulstretch** (set mix to 0)
5. Use **Plate** or **Hall** reverb (lower CPU than Cathedral)

### Recommended Mobile Settings
```
Master Volume: 0.7
Granular Mix: 0.1
Density: 15
Paulstretch Mix: 0
Reverb Type: Hall
Reverb Mix: 0.3
```

## 🎹 Adding New Scales

Edit `src/audio/scales.ts`:

```typescript
export const SCALE_FAMILIES: readonly ScaleFamily[] = [
  // Add your scale here
  {
    name: 'E Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],  // Semitone offsets from E
    tensionLevel: 'color',              // 'consonant' | 'color' | 'high'
    tensionValue: 0.4,                  // 0-1 for auto-selection weighting
  },
  // ... existing scales
];
```

## 🔊 Adding Impulse Responses (Convolution)

The app defaults to algorithmic reverb. To add convolution support:

1. Add IR files to `src/assets/ir/`
2. Modify `src/audio/engine.ts` to load and use ConvolverNode when `reverbEngine === 'convolution'`

Example IR loading:
```typescript
const response = await fetch('/assets/ir/hall.wav');
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
convolver.buffer = audioBuffer;
```

## 📁 Project Structure

```
src/
├── main.tsx                 # App bootstrap
├── App.tsx                  # Main UI component
├── ui/
│   └── state.ts            # Slider state, quantization, URL encoding
├── audio/
│   ├── engine.ts           # Audio graph, voice management, scheduling
│   ├── rng.ts              # Seeded PRNG (xmur3 + mulberry32)
│   ├── scales.ts           # E-root scale families
│   ├── harmony.ts          # Chord generation, phrase timing
│   ├── worklets/
│   │   ├── granulator.worklet.ts  # Granular synthesis processor
│   │   └── reverb.worklet.ts      # Algorithmic reverb processor
│   └── paulstretch.worker.ts      # Offline stretch renderer
└── assets/
    ├── ir/                  # Impulse responses (optional)
    └── samples/             # Audio samples (optional)
```

## ⚙️ Technical Details

### Audio Graph
```
Voices (6x) → Synth Bus → Granulator → Wet HPF → Wet LPF → Reverb → Master → Limiter → Output
                       ↘ Dry Bus ────────────────────────→ Reverb
Paulstretch ─────────────────────────────────────────────────────→ Master
```

### Voice Architecture
Each voice contains:
- 2 detuned sawtooth oscillators
- 1 triangle oscillator
- Noise generator
- Lowpass filter (brightness)
- Waveshaper (hardness/saturation)
- Envelope (attack/release from hardness)

### Worklet Communication
- Main thread sends pre-generated random sequences to granulator
- Granulator uses these for deterministic grain scheduling
- Re-seeding occurs at phrase boundaries

## 🐛 Troubleshooting

### No Sound
1. Click the Start button (required for iOS AudioContext)
2. Check that Master Volume > 0
3. Ensure browser supports Web Audio API

### Crackling/Distortion
1. Lower Granular Density
2. Reduce Feedback
3. Lower Paulstretch Mix
4. Close other browser tabs

### Different Sound Than Shared Link
1. Ensure you're in the same UTC time window (hour or day)
2. Check that all slider values match exactly
3. Minor timing differences are expected

## 📄 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Acknowledgments

- Paulstretch algorithm by Nasca Octavian Paul
- Inspired by generative ambient music pioneers (Eno, Basinski, etc.)
