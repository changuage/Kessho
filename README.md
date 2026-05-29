# Kessho

Kessho is a deterministic generative music application backed by C++ Product Core. The production web runtime is `core-product`; the legacy TypeScript/Web Audio engine remains reference-only as `web-ts` for parity probes and migration comparison.

React and TypeScript own the product UI, state encoding, browser hosting, asset decode/registration, and diagnostics. Production DSP, sequencing semantics, source rendering, FX routing, and CPU-critical audio behavior belong in Product Core behind `ProductEnginePort`.

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

# Run the Product Core release gate
npm run core:product:ci
```

The app will be available at `http://localhost:5173`

## Mac Migration Notes

If you copied this project from a Windows PC to a Mac by zipping the folder, do not trust the old `node_modules` folder.

Use this sequence on the Mac:

```bash
bash scripts/check-macos.sh
rm -rf node_modules
npm install
npm run build
```

Notes:
- `scripts/check-macos.sh` fixes missing execute bits on local shell scripts and warns about common migration problems.
- If `bash scripts/check-macos.sh` warns that the Xcode license is not accepted, run `sudo xcodebuild -license`. That is only needed for local WASM/native tooling, but this machine is currently blocked on it.

## Product Core Architecture

Production audio flows through:

```text
React UI
  -> ProductEnginePort
  -> WebProductEngine
  -> coreProductEngineHost
  -> AudioWorklet + WASM Product Core
  -> KesshoProductCore C ABI
```

The Product boundary must not expose browser Web Audio objects such as `AudioNode`, `GainNode`, `AnalyserNode`, or `MediaStream`. Missing Product Core behavior should be implemented as generated Product events, generated snapshot fields, telemetry, or explicit unsupported crash boundaries. It should not silently fall back to `web-ts`.

Primary verification commands:

```bash
npm run migration:product-boundary
npm run migration:docs
npm run core:product:runtime-fallbacks
npm run core:product:cpu
npm run core:product:browser-runtime
npm run core:product:ci
```

Architecture docs live in `docs/product-core/`.

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

## 📁 Project Structure

```
src/
├── main.tsx                 # App bootstrap
├── App.tsx                  # Main UI component
├── ui/
│   └── state.ts            # Slider state, quantization, URL encoding
├── audio/
│   ├── product/            # ProductEnginePort and web Product runtime adapter
│   ├── coreProductEngineHost.ts # Web host for Product Core AudioWorklet/WASM
│   ├── generated/          # Schema-generated Product constants and event IDs
│   ├── reference/webTs/    # web-ts reference implementation, not production runtime
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
cpp/
└── KesshoCore/
    ├── schema/              # Product schemas
    ├── generated/           # Generated Product C++ constants
    ├── include/KesshoCore/  # Product C ABI
    └── src/product/         # Product Core implementation
docs/
└── product-core/            # Product architecture, diagnostics, schema, and reference docs
```

Production code must not add a root `src/audio/engine.ts` or `src/audio/runtime.ts` path. Reference and parity code should import the legacy implementation from `src/audio/reference/webTs/engine.ts`.

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
