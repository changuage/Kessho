# WASM Synth Port Plan — Drum, Lead FM, Pad & Delay Effects

## Goal

Port the three remaining Web Audio API synth engines (Drum, Lead 4-op FM, Pad) plus
all delay effects to C++, compiled via Emscripten to WASM for web and natively for iOS.
Each engine runs as a self-contained `AudioWorkletProcessor` backed by a single `.wasm`
binary — identical to the existing `kessho_granular` / `kessho_reverb` / `kessho_soundscapes`
pattern.

---

## Architecture Pattern (from existing WASM engines)

```
┌──────────────────────────────────────────────┐
│  C++ source (.h + .cpp)                      │
│  - Pure C API: init / destroy / process_block│
│  - Zero-copy buffers (get_input_ptr/output)  │
│  - Per-param setter functions                │
│  - No malloc in audio path                   │
└──────────┬───────────────────────────────────┘
           │ Emscripten (build.sh)
           ▼
┌──────────────────────────────────────────────┐
│  .wasm binary (standalone, no JS glue)       │
│  - STANDALONE_WASM=1, --no-entry             │
│  - WASM SIMD (-msimd128)                     │
│  - ALLOW_MEMORY_GROWTH, 16MB initial         │
└──────────┬───────────────────────────────────┘
           │ fetch() + WebAssembly.instantiate()
           ▼
┌──────────────────────────────────────────────┐
│  JS worklet shell (.worklet.js)              │
│  - Thin AudioWorkletProcessor               │
│  - postMessage → C setter calls             │
│  - process(): copy input → WASM, call       │
│    process_block, copy output → Web Audio   │
└──────────────────────────────────────────────┘
```

---

## Phase 1: Drum Synth WASM — `kessho_drum`

### Why first
- Highest CPU impact: creates/destroys 8-15 Web Audio nodes **per hit**
- 7 voice types × Euclidean sequencer = frequent node churn
- iOS version is already incomplete (missing `membrane` voice)
- ~2,838 lines TS → shared C++ eliminates dual maintenance

### C API Design (`kessho_drum.h`)

```c
// Lifecycle
int   drum_init(float sample_rate);
void  drum_destroy(void);

// Zero-copy buffers (stereo interleaved output, no input needed)
float* drum_get_output_ptr(void);      // stereo interleaved L,R,L,R...

// Processing
void  drum_process_block(int block_size);

// Voice triggers (called from JS scheduler via postMessage)
void  drum_trigger_sub(float velocity, float time_samples);
void  drum_trigger_kick(float velocity, float time_samples);
void  drum_trigger_click(float velocity, float time_samples);
void  drum_trigger_beep_hi(float velocity, float time_samples);
void  drum_trigger_beep_lo(float velocity, float time_samples);
void  drum_trigger_noise(float velocity, float time_samples);
void  drum_trigger_membrane(float velocity, float time_samples);

// Per-voice parameters (sub)
void  drum_set_sub_params(float freq, float decay, float level, float tone,
                          float shape, float pitch_env, float pitch_decay,
                          float drive, float sub_octave, float attack,
                          float variation, float distance);

// Per-voice parameters (kick)
void  drum_set_kick_params(float freq, float pitch_env, float pitch_decay,
                           float decay, float level, float click,
                           float body, float punch, float tail, float tone,
                           float attack, float variation, float distance);

// Per-voice parameters (click)  
void  drum_set_click_params(float freq, float decay, float level, float tone,
                            int mode, float pitch_env, float stereo_width,
                            float grain_count, float grain_spread,
                            float attack, float variation, float distance);

// Per-voice parameters (beepHi)
void  drum_set_beep_hi_params(float freq, float decay, float level,
                               float harmonics, float shimmer_rate,
                               float shimmer_depth, float detune,
                               float attack, float variation, float distance);

// Per-voice parameters (beepLo)
void  drum_set_beep_lo_params(float freq, float decay, float level, float tone,
                               float pluck, float damp, float body,
                               float attack, float variation, float distance);

// Per-voice parameters (noise)
void  drum_set_noise_params(float freq, float decay, float level, float q,
                            int filter_type, float attack, float formant,
                            float breath, float filter_env_depth,
                            float filter_env_decay,
                            float variation, float distance);

// Per-voice parameters (membrane)
void  drum_set_membrane_params(float freq, float decay, float level,
                                float tension, float material, float size,
                                float damping, float strike, float wire_buzz,
                                float attack, float variation, float distance);

// Delay effect (stereo ping-pong, processed in same worklet)
void  drum_set_delay_enabled(int enabled);
void  drum_set_delay_params(float time_l_samples, float time_r_samples,
                            float feedback, float filter_freq, float mix);
void  drum_set_delay_send(int voice_index, float level);  // 0-6 = sub..membrane

// Per-trigger morph overrides
void  drum_set_trigger_morph(float morph_position);
void  drum_set_trigger_distance(float distance);
void  drum_set_trigger_pitch(float semitones);
void  drum_set_trigger_ratchet_cap(float decay_cap, float attack_cap);

// RNG seed for deterministic variation
void  drum_set_rng_seed(unsigned int seed);
```

### Internal C++ Architecture

```cpp
// Per-voice state (no dynamic allocation)
struct DrumVoice {
    float phase;
    float phase2;         // secondary osc
    float freq;
    float envelope;
    float pitch_env;
    int   active;
    int   voice_type;     // 0=sub..6=membrane
    // ... all synth params
};

// Voice pool (fixed-size, oldest-steal)
#define DRUM_MAX_POLYPHONY 4  // per voice type
#define DRUM_NUM_TYPES     7
DrumVoice voice_pool[DRUM_NUM_TYPES * DRUM_MAX_POLYPHONY];

// Trigger queue (ring buffer, JS writes triggers ahead of time)
#define DRUM_TRIGGER_QUEUE_SIZE 64
struct DrumTrigger {
    int   voice_type;
    float velocity;
    int   sample_offset;  // offset within current block
};

// Delay state (stereo ping-pong)
struct DelayLine {
    float* buffer;        // circular buffer
    int    write_pos;
    int    length;
};
```

### Key DSP Algorithms to Port

| TS Feature | C++ Implementation |
|---|---|
| `OscillatorNode` (sine/tri/saw) | Phase-accumulator with wavetable LUT (1024 samples) |
| `BiquadFilterNode` (LP/HP/BP/notch) | SVF (State Variable Filter) — same as iOS `SynthVoice.swift` |
| `WaveShaperNode` (tanh drive) | `fast_tanhf()` inline approximation |
| Pitch envelope | Per-sample exponential interpolation toward target freq |
| AD envelope | Per-sample exponential decay with attack ramp |
| Noise buffer | LFSR-based white noise (no buffer allocation) |
| Variation (triangular jitter) | Inline RNG with xoshiro128+ |
| Distance model | Pre-computed multiplier struct |
| Karplus-Strong (beepLo pluck) | Short delay line with LP feedback |
| Membrane (physical model) | Modal synthesis: 5-8 resonant bandpass modes + wire buzz |

### Files to Create
- `wasm/drum/kessho_drum.h`
- `wasm/drum/kessho_drum.cpp`
- `wasm/drum/build.sh`
- `public/worklets/drum-wasm.worklet.js`

---

## Phase 2: Lead 4-op FM WASM — `kessho_lead_fm`

### Why second
- ~23 Web Audio nodes created **per note**, all destroyed on release
- Unison mode multiplies this 4×
- ~950 lines TS synthesis + preset morphing
- iOS `LeadSynth.swift` is architecturally behind (monophonic, no unison/presets)

### C API Design (`kessho_lead_fm.h`)

```c
// Lifecycle
int   lead_fm_init(float sample_rate);
void  lead_fm_destroy(void);

// Zero-copy buffers
float* lead_fm_get_output_ptr(void);   // stereo interleaved

// Processing
void  lead_fm_process_block(int block_size);

// Note control
void  lead_fm_note_on(float frequency, float velocity);
void  lead_fm_note_off(void);  // begins release phase
void  lead_fm_all_notes_off(void);

// Preset params (morphed values from JS morph function)
void  lead_fm_set_algorithm(int algo);  // 0=parallel 1=stack 2=split 3=cross 4=dx17
void  lead_fm_set_carriers(float beat_detune, float carrier2_mix);
void  lead_fm_set_operator(int op_index, float ratio, float index,
                           float decay, float sustain, float level,
                           float feedback, float detune, float env_rate,
                           float mod_attack, float mod_delay);
void  lead_fm_set_envelope(float attack, float decay, float sustain, float release);
void  lead_fm_set_filter(float freq, float q, int type,
                         float env_attack, float env_decay,
                         float env_sustain, float env_release, float env_depth);
void  lead_fm_set_drive(float amount);
void  lead_fm_set_xy(float x_level, float x_pan, float y_level, float y_pan);
void  lead_fm_set_lfo(float rate, float depth, int target);
void  lead_fm_set_unison(int voices, float detune);
void  lead_fm_set_transient(float click, float noise, float duration,
                            float decay, float filter, int type);
void  lead_fm_set_gain(float gain);
void  lead_fm_set_hold(float hold_seconds);

// Glide
void  lead_fm_set_glide(float time_seconds);

// Active note count (for CPU overlay)
int   lead_fm_get_active_count(void);
```

### Lead Delay (Stereo Ping-Pong) — same worklet

```c
void  lead_fm_set_delay_enabled(int enabled);
void  lead_fm_set_delay_params(float time_l_samples, float time_r_samples,
                               float feedback, float mix);
void  lead_fm_set_delay_reverb_send(float level);
float* lead_fm_get_delay_reverb_output_ptr(void);  // separate stereo bus for reverb send
```

### Internal Architecture

```cpp
#define LEAD_MAX_POLYPHONY    8   // max simultaneous notes
#define LEAD_MAX_UNISON       4

struct FMOperator {
    float phase;
    float freq;
    float index;
    float envelope;     // mod envelope value
    float feedback_z1;  // self-feedback delay
    // ... params
};

struct LeadVoice {
    float carrier1_phase, carrier2_phase;
    FMOperator ops[4];
    float amp_envelope;     // ADSR state
    int   env_stage;        // 0=off 1=attack 2=decay 3=sustain 4=release
    float frequency;
    float target_frequency; // for glide
    float velocity;
    int   active;
    // Filter state (SVF)
    float svf_ic1eq, svf_ic2eq;
    float filter_env;       // filter envelope
    int   filter_env_stage;
};

LeadVoice voices[LEAD_MAX_POLYPHONY * LEAD_MAX_UNISON];

// Sine LUT (2048 entries + linear interpolation, matching iOS pattern)
float sine_table[2049];
```

### Key DSP
- **FM synthesis**: Phase accumulator per operator, sine LUT lookup
- **Algorithm routing**: Switch on algorithm enum, inline connections
- **ADSR envelope**: 4-stage state machine (per-sample exp/lin ramps)
- **SVF filter**: Topology-preserving with envelope modulation
- **Drive**: `fast_tanhf()` waveshaper
- **XY panning**: Pre-computed L/R gains from pan position
- **LFO**: Separate phase accumulator targeting FM index / pitch / filter
- **Transient**: Short burst of filtered noise via LFSR

### Files to Create
- `wasm/lead-fm/kessho_lead_fm.h`
- `wasm/lead-fm/kessho_lead_fm.cpp`
- `wasm/lead-fm/build.sh`
- `public/worklets/lead-fm-wasm.worklet.js`

---

## Phase 3: Pad Synth WASM — `kessho_pad`

### Why third
- 6 voices × ~19 persistent nodes = 114 nodes always running
- Two independent pad instances (Pad 1 + Pad 2) = 228 nodes
- Continuous CPU drain even during silent passages
- Voice chain: 4 Osc → 4 OscGain → Noise → Filter A → Filter B → Warmth → Presence → Saturation → Gain → ModEnv → Envelope → Mixer

### C API Design (`kessho_pad.h`)

```c
// Lifecycle
int   pad_init(float sample_rate);
void  pad_destroy(void);

// Zero-copy buffers
float* pad_get_output_ptr(void);   // stereo interleaved (Pad 1 + Pad 2 summed)

// Processing
void  pad_process_block(int block_size);

// Voice control (6-voice polyphony per pad instance)
void  pad_note_on(int pad_index, int voice_index, float frequency);  // pad_index: 0=pad1, 1=pad2
void  pad_note_off(int pad_index, int voice_index);
void  pad_set_voice_freq(int pad_index, int voice_index, float frequency);

// Oscillator params
void  pad_set_osc_a(int pad_index, int wave, int octave, float detune, float level);
void  pad_set_osc_b(int pad_index, int wave, int octave, float detune, float level);
void  pad_set_sub(int pad_index, int enabled, int octave, int wave, float level);
void  pad_set_noise(int pad_index, int type, float level);  // 0=white, 1=pink
void  pad_set_osc_mix(int pad_index, float mix);  // 0=A only, 0.5=both, 1=B only

// Filter
void  pad_set_filter_a(int pad_index, int type, float cutoff, float q);
void  pad_set_filter_b(int pad_index, int enabled, int type, float cutoff, float q);

// Tone shaping
void  pad_set_warmth(int pad_index, float amount);    // low shelf at 250Hz
void  pad_set_presence(int pad_index, float amount);  // peaking EQ at 3kHz
void  pad_set_hardness(int pad_index, float amount);  // saturation drive

// Envelope
void  pad_set_envelope(int pad_index, float attack, float decay,
                       float sustain, float release);
void  pad_set_level(int pad_index, float level);

// Mod envelope
void  pad_set_mod_env(int pad_index, float attack, float decay,
                      float depth, int target);  // target: 0=amp, 1=filter, 2=pitch

// LFO (applied from JS side via param updates, but can also be internal)
void  pad_set_filter_freq(int pad_index, float freq);  // real-time filter modulation from LFO

// Get active voice count
int   pad_get_active_count(int pad_index);
```

### Internal Architecture

```cpp
#define PAD_NUM_VOICES  6
#define PAD_NUM_PADS    2
#define PAD_NUM_OSCS    4   // OscA, OscA detuned, OscB, Sub/OscB detuned

struct PadOscillator {
    float phase;
    float freq;
    int   waveform;    // 0=sine, 1=triangle, 2=sawtooth, 3=square
    float gain;
};

struct PadVoice {
    PadOscillator oscs[PAD_NUM_OSCS];
    float noise_phase;     // LFSR state for noise
    float noise_gain;
    // Two SVF filters in series
    float svf_a_ic1eq, svf_a_ic2eq;
    float svf_b_ic1eq, svf_b_ic2eq;
    // Tone shaping
    float warmth_state[2];   // low shelf biquad state
    float presence_state[2]; // peaking biquad state
    // Envelopes
    float amp_envelope;
    int   amp_env_stage;
    float mod_envelope;
    int   mod_env_stage;
    // State
    float target_freq;
    float velocity;
    int   active;
};

struct PadInstance {
    PadVoice voices[PAD_NUM_VOICES];
    // Shared params
    float filter_a_cutoff, filter_a_q;
    float filter_b_cutoff, filter_b_q;
    int   filter_a_type, filter_b_type;
    int   filter_b_enabled;
    float warmth, presence, hardness;
    float level;
    // Saturation curve (pre-computed)
    float sat_curve[256];
};

PadInstance pads[PAD_NUM_PADS];
```

### Key DSP
- **4 oscillators per voice**: PolyBLEP anti-aliased saw/square, sine/tri from LUT
- **Noise**: LFSR white noise + Paul Kellet pink noise filter
- **Dual SVF filters**: Topology-preserving, series cascade
- **Low shelf (warmth)**: 2nd-order biquad
- **Peaking EQ (presence)**: 2nd-order biquad
- **Saturation**: Pre-computed tanh curve (256 samples, linear interp)
- **ADSR envelope**: 4-stage per voice
- **Mod envelope**: Separate ADSR routed to amp/filter/pitch

### Files to Create
- `wasm/pad/kessho_pad.h`
- `wasm/pad/kessho_pad.cpp`
- `wasm/pad/build.sh`
- `public/worklets/pad-wasm.worklet.js`

---

## Phase 4: Delay Effects (embedded in each engine)

Delay effects are **processed within the same worklet** as their parent synth.
This avoids extra worklet hops and keeps latency minimal.

### Drum Delay (Stereo Ping-Pong)
- Embedded in `kessho_drum.cpp`
- Two delay lines (L/R) with cross-feedback
- Per-channel low-pass filter in feedback path
- Per-voice send levels (7 gains)
- Note-division-based delay times (converted to samples in JS)

### Lead FM Delay (Stereo Ping-Pong)
- Embedded in `kessho_lead_fm.cpp`  
- Same topology as drum delay
- Separate reverb send output (second stereo bus)

### Granular Multi-Tap Delay (8-tap Microcosm-style)
- **Stays in Web Audio API** — already fed from WASM granular output
- 8 native `DelayNode`s with per-tap panning and vibrato
- Activity-based tap gating is cheap with native nodes
- Moving this to WASM would require the WASM engine to also handle vibrato LFOs per tap — low ROI

### Delay DSP (shared code)

```cpp
// Shared delay line implementation
struct StereoDelay {
    float* buffer_l;
    float* buffer_r;
    int    buffer_size;      // max samples (sample_rate * 4 for 4s max)
    int    write_pos;
    float  time_l, time_r;   // in samples (fractional for interpolation)
    float  feedback;
    float  mix;
    // Per-channel LP filter state (1-pole)
    float  filter_z_l, filter_z_r;
    float  filter_coeff;     // derived from cutoff freq
};

// Process: reads from delay, writes new + feedback, applies filter
void delay_process(StereoDelay* d, float* in_l, float* in_r,
                   float* out_l, float* out_r, int block_size);
```

---

## Integration with engine.ts

### Worklet Loading Changes
In `engine.ts`, replace Web Audio API node creation with worklet instantiation:

```typescript
// Before: drumSynth = new DrumSynth(ctx, masterOutput, reverbNode, params, rng)
// After:
await ctx.audioWorklet.addModule('/worklets/drum-wasm.worklet.js');
this.drumWorkletNode = new AudioWorkletNode(ctx, 'drum-wasm', {
  numberOfInputs: 0,
  numberOfOutputs: 2,  // [0] = main stereo, [1] = reverb send
  outputChannelCount: [2, 2],
});
```

### Parameter Updates
Replace direct Web Audio node manipulation with `postMessage`:

```typescript
// Before: this.drumSynth.updateParams(params)
// After:
this.drumWorkletNode.port.postMessage({
  type: 'params',
  sub: { freq: p.drumSubFreq, decay: p.drumSubDecay, ... },
  kick: { freq: p.drumKickFreq, ... },
  // ...
});
```

### Trigger Scheduling
The Euclidean sequencer **stays in JS** (in `drumSynth.ts` or extracted to `drumScheduler.ts`).
Only the audio synthesis moves to WASM. Triggers are sent via `postMessage`:

```typescript
this.drumWorkletNode.port.postMessage({
  type: 'trigger',
  voice: 'kick',
  velocity: 0.8,
  sampleOffset: 128,  // precise sample offset within next block
});
```

---

## Shared C++ Utilities

Create `wasm/common/kessho_dsp.h` for shared DSP primitives:

```cpp
// Fast math
float fast_sinf(float x);     // polynomial approximation
float fast_tanhf(float x);    // rational approximation
float fast_expf(float x);     // fast exp for envelopes

// Oscillators
float osc_sine(float phase);         // LUT with linear interp
float osc_triangle(float phase);     // computed
float osc_saw_polyblep(float phase, float dt);   // anti-aliased
float osc_square_polyblep(float phase, float dt); // anti-aliased

// Filters
struct SVF { float ic1eq, ic2eq; };
void svf_process(SVF* f, float input, float g, float k,
                 float* lp, float* hp, float* bp);

// Envelope
struct ADSREnvelope {
    float value;
    int   stage;  // 0=off 1=attack 2=decay 3=sustain 4=release
    float attack, decay, sustain, release;
};
float adsr_process(ADSREnvelope* env, float sample_rate);

// Noise
uint32_t xoshiro128_next(uint32_t state[4]);
float    white_noise(uint32_t state[4]);

// Delay
struct DelayLine {
    float* buffer;
    int    size;
    int    write_pos;
};
float delay_read(DelayLine* dl, float delay_samples);  // linear interp
void  delay_write(DelayLine* dl, float sample);
```

---

## Build & Deployment

### Build All Script (`wasm/build_all.sh`)
```bash
#!/bin/bash
set -euo pipefail
echo "Building all WASM modules..."

(cd drum && ./build.sh)
(cd lead-fm && ./build.sh)
(cd pad && ./build.sh)
(cd granular-fx && ./build.sh)
(cd reverb && ./build.sh)
(cd soundscapes && ./build.sh)
(cd spectral-freeze && python build.py)

echo "All WASM modules built successfully."
```

### Expected Binary Sizes
| Module | Estimated Size |
|--------|---------------|
| kessho_drum.wasm | 25-40 KB |
| kessho_lead_fm.wasm | 20-30 KB |
| kessho_pad.wasm | 20-30 KB |
| Total new WASM | ~65-100 KB |

---

## Implementation Order

### Step 1: Shared DSP utilities
1. Create `wasm/common/kessho_dsp.h` with oscillators, filters, envelopes, noise, delay

### Step 2: Drum Synth (`kessho_drum`)
1. `kessho_drum.h` — C API header
2. `kessho_drum.cpp` — All 7 voice types + delay + trigger queue
3. `build.sh` — Emscripten build
4. `drum-wasm.worklet.js` — JS shell
5. Test: standalone trigger via postMessage, verify audio output

### Step 3: Lead FM (`kessho_lead_fm`)
1. `kessho_lead_fm.h` — C API header  
2. `kessho_lead_fm.cpp` — 4-op FM + algorithms + envelopes + delay
3. `build.sh` — Emscripten build
4. `lead-fm-wasm.worklet.js` — JS shell
5. Test: note_on/note_off, verify FM timbres match presets

### Step 4: Pad Synth (`kessho_pad`)
1. `kessho_pad.h` — C API header
2. `kessho_pad.cpp` — 4-osc + noise + dual filter + envelope
3. `build.sh` — Emscripten build
4. `pad-wasm.worklet.js` — JS shell
5. Test: 6-voice polyphony, verify filter sweep behavior

### Step 5: Integration
1. Update `engine.ts` to load new worklets
2. Update `drumSynth.ts` to use postMessage triggers (keep sequencer in JS)
3. Update lead note scheduling to use postMessage
4. Update pad voice management to use postMessage
5. Full integration test

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Audio quality regression | A/B comparison: run old TS + new WASM side by side |
| Timing precision | Sub-sample trigger offsets in trigger queue |
| Memory leaks | Fixed-size voice pools, no malloc in audio path |
| Build complexity | Shared build_all.sh, CI integration |
| iOS integration later | Pure C API = trivial to compile with Clang for ARM |

---

## CPU Savings Estimate

| Engine | Current (Web Audio) | After (WASM) | Savings |
|--------|-------------------|--------------|---------|
| Drum (active) | 15-25% (node churn) | 2-4% | ~85% |
| Lead FM (per note) | 8-12% | 1-2% | ~85% |
| Pad (idle 12 voices) | 8-15% | 1-3% | ~80% |
| **Total peak** | **~45%** | **~8%** | **~37% freed** |

*Estimates based on existing granular/reverb WASM savings observed in this codebase.*
