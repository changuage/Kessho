# Reverb Freeze — Archived Feature

**Archived:** March 2026  
**Reason:** After extensive iteration (~10+ rounds of bug fixes), reverb freeze never achieved true infinite sustain. The recirculating signal in both FDN and Dattorro reverb topologies always decayed despite addressing every identified loss source. The separate **Spectral Freeze** (STFT-based) works correctly and remains in the codebase.

---

## What It Was

A reverb tank freeze feature with 4 modes:
- **Mode 0 — Tank:** Evolving sustain with LFO drift of allpass coefficients
- **Mode 1 — State-capture:** Static snapshot, all modulation killed
- **Mode 2 — Resonator:** Input stays live, tank acts as resonant filter
- **Mode 3 — Slushy:** Stochastic input gating for evolving texture

## What Was Tried (Bug Fix History)

1. **Feedback clamp bypass** — Slow modulation was clamping feedback to 0.998. Fixed by gating modulation when `fzRamp >= 0.5`.
2. **OLA zeroing** — Full-frame zeroing destroyed overlapping frames → only zero HOP_SIZE leading edge.
3. **Slushy HF noise (reverb)** — Binary gate → 1-pole LP smoothed gate (`slushyGateSmooth`).
4. **Slushy HF noise (spectral)** — Binary speckle → temporal smoothing + smooth interpolation.
5. **FDN slushy gate** — Only existed in Dattorro path → added independent gate in FDN.
6. **Velvet noise during freeze** — Disabled when `fzRamp >= 0.1`.
7. **Air absorption during freeze** — Progressive darkening → ramp `airAbsCoeff` toward transparency.
8. **Audio engine crash (NaN)** — NaN propagation → guards in C++ and JS worklets.
9. **Reverb too quiet** — Hard 0.95 safety limiter → replaced with `softClipClean()`.
10. **Soft clipper in feedback loop** — `softClip()` inside the recirculation loop compressed signal each pass. Bypassed during freeze, replaced with hard clamp at ±3.
11. **OnePole coefficient polarity** — `OnePole::process` uses `z1 = input*(1-coeff) + z1*coeff`. Coefficient=1.0 is sample-and-hold (max damping), NOT passthrough. The freeze code was ramping `dampCoeff` and `airAbsCoeff` toward 1.0, which locked the filters. Fixed by ramping toward 0.0.

### Root Cause (Never Fully Resolved)

Despite fixing all identified loss sources (soft clipper, damping polarity, air absorption polarity, velvet noise, feedback clamping), the signal still decayed. The FDN/Dattorro topology has too many cascaded filters, allpasses, and mixing stages — each introducing minute numerical losses that compound over thousands of recirculations per second. True lossless recirculation may require a fundamentally different approach (e.g., capturing and replaying the delay buffer contents directly, or using spectral domain hold like the working Spectral Freeze).

---

## C++ Code (kessho_reverb.cpp)

### State Variables

```cpp
// In the reverb struct:
int   freeze;              // 0=off, 1=on
float freezeAPDrift;       // slowly evolving allpass coefficient offset
float freezeAPPhase;       // LFO phase for freeze evolution (0.03 Hz)
float freezeRamp;          // 0..1 smooth ramp (0=normal, 1=fully frozen)
float freezeInputBleed;    // 0-1 how much new input leaks during freeze
float freezeModAtten;      // 0-1 how much to attenuate modulation during freeze
float freezeVelvetDensity; // re-seeding density during freeze
float freezeEvoPhase2;     // second evolution LFO phase (0.07 Hz)
float freezeEvoPhase3;     // third evolution LFO phase (0.13 Hz)
int   freezeMode;          // 0=tank, 1=state-capture, 2=resonator, 3=slushy
uint32_t slushyRngState;   // RNG state for stochastic input gating
float slushyGateSmooth;    // 1-pole smoothed gate envelope
```

### Initialization

```cpp
g_reverb.freezeAPDrift = 0.0f;
g_reverb.freezeAPPhase = 0.0f;
g_reverb.freezeRamp = 0.0f;
g_reverb.freezeInputBleed = 0.0f;
g_reverb.freezeModAtten = 0.7f;
g_reverb.freezeVelvetDensity = 0.003f;
g_reverb.freezeEvoPhase2 = 0.0f;
g_reverb.freezeEvoPhase3 = 0.0f;
g_reverb.freezeMode = 0;
g_reverb.slushyRngState = 12345u;
g_reverb.slushyGateSmooth = 0.0f;
```

### API Functions

```cpp
void reverb_set_freeze(int freeze) {
    g_reverb.freeze = freeze;
    updatePreset();
}

void reverb_set_freeze_params(float input_bleed, float mod_atten, float velvet_density) {
    g_reverb.freezeInputBleed = fmaxf(0.0f, fminf(1.0f, input_bleed));
    g_reverb.freezeModAtten = fmaxf(0.0f, fminf(1.0f, mod_atten));
    g_reverb.freezeVelvetDensity = fmaxf(0.0f, fminf(0.05f, velvet_density));
}

void reverb_set_freeze_mode(int mode) {
    g_reverb.freezeMode = (mode >= 0 && mode <= 3) ? mode : 0;
}
```

### Dattorro Freeze Logic (dattorro_process_block)

```cpp
// Smooth ramp (~200ms)
const bool isFrozen = g_reverb.freeze != 0;
float rampTarget = isFrozen ? 1.0f : 0.0f;
float rampSpeed = (float)block_size / (0.2f * sr);
g_reverb.freezeRamp += (rampTarget - g_reverb.freezeRamp) * fminf(1.0f, rampSpeed);
float fzRamp = g_reverb.freezeRamp;

int fzMode = g_reverb.freezeMode;

// Decay coefficient ramp toward 1.0 (infinite)
float normalTankDecay = fminf(0.9995f, 0.5f + userDecay * 0.4995f);
float tankDecay = normalTankDecay + (1.0f - normalTankDecay) * fzRamp;

// Damping ramp (OnePole: coeff=0 is passthrough)
float normalDampCoeff = 1.0f - damping * 0.7f;
float dampCoeff;
if (fzMode == 2 && fzRamp > 0.01f) {
    dampCoeff = normalDampCoeff;  // Resonator: keep active
} else if (fzMode == 3 && fzRamp > 0.01f) {
    dampCoeff = normalDampCoeff * (1.0f - fzRamp * 0.5f);  // Slushy: partial
} else {
    dampCoeff = normalDampCoeff * (1.0f - fzRamp);  // Tank/Snapshot: passthrough
}

// Modulation attenuation per mode
float modAttenFactor;
if (fzMode == 1) {
    modAttenFactor = 1.0f - fzRamp;  // Snapshot: kill
} else if (fzMode == 2 || fzMode == 3) {
    modAttenFactor = 1.0f;  // Resonator/Slushy: keep
} else {
    modAttenFactor = 1.0f - fzRamp * g_reverb.freezeModAtten;  // Tank: user-controlled
}

// Input gain per mode
float normalDatInputGain = 0.2f;
float inputGain;
if (fzMode == 1 && fzRamp > 0.01f) {
    inputGain = normalDatInputGain * (1.0f - fzRamp);  // Snapshot: mute
} else if (fzMode == 2 && fzRamp > 0.01f) {
    inputGain = normalDatInputGain;  // Resonator: keep
} else if (fzMode == 3 && fzRamp > 0.01f) {
    inputGain = normalDatInputGain;  // Slushy: keep (per-sample gating below)
} else {
    float datFreezeBleed = g_reverb.freezeInputBleed * normalDatInputGain;
    inputGain = normalDatInputGain * (1.0f - fzRamp) + datFreezeBleed * fzRamp;
}

// Air absorption ramp toward passthrough
float airAbsCoeff = 1.0f - g_reverb.airAbsorption * 0.6f;
if (fzRamp > 0.01f) {
    airAbsCoeff = airAbsCoeff * (1.0f - fzRamp);
}

// Slushy stochastic input gating (in sample loop)
if (fzMode == 3 && fzRamp > 0.01f) {
    uint32_t rng = g_reverb.slushyRngState;
    rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
    g_reverb.slushyRngState = rng;
    float rndVal = (float)(rng & 0x7FFFFFu) / (float)0x800000u;
    float gateDensity = g_reverb.freezeInputBleed;
    float gateTarget = (rndVal < gateDensity) ? gateDensity : 0.0f;
    float smoothCoeff = 1.0f - expf(-1.0f / (0.002f * g_reverb.sampleRate));
    g_reverb.slushyGateSmooth += (gateTarget - g_reverb.slushyGateSmooth) * smoothCoeff;
    diffIn *= (1.0f - fzRamp) + fzRamp * g_reverb.slushyGateSmooth;
}

// Soft clipper bypass during freeze (tank feedback)
float feedA = sA * tankDecay;
g_reverb.datTankState[0] = (fzRamp > 0.5f)
    ? fmaxf(-3.0f, fminf(3.0f, feedA))
    : softClip(feedA, satMode);
// (same for side B)
```

### FDN Freeze Logic (reverb_process_block)

```cpp
// Smooth ramp (identical to Dattorro)
const bool isFrozen = g_reverb.freeze != 0;
float rampTarget = isFrozen ? 1.0f : 0.0f;
float rampSpeed = (float)block_size / (0.2f * sr);
g_reverb.freezeRamp += (rampTarget - g_reverb.freezeRamp) * fminf(1.0f, rampSpeed);
float fzRamp = g_reverb.freezeRamp;

int fzMode = g_reverb.freezeMode;
float normalFeedback = g_reverb.feedbackGain;
float blockFeedback = normalFeedback + (1.0f - normalFeedback) * fzRamp;

// Multi-band damping per mode
float blockDampLow, blockDampHigh;
if (fzMode == 1 && fzRamp > 0.01f) {
    blockDampLow = g_reverb.smoothDampLow * (1.0f - fzRamp);
    blockDampHigh = g_reverb.smoothDampHigh * (1.0f - fzRamp);
} else if (fzMode == 2 && fzRamp > 0.01f) {
    blockDampLow = g_reverb.smoothDampLow;
    blockDampHigh = g_reverb.smoothDampHigh;
} else if (fzMode == 3 && fzRamp > 0.01f) {
    blockDampLow = g_reverb.smoothDampLow * (1.0f - fzRamp * 0.5f);
    blockDampHigh = g_reverb.smoothDampHigh * (1.0f - fzRamp * 0.5f);
} else {
    blockDampLow = g_reverb.smoothDampLow * (1.0f - fzRamp);
    blockDampHigh = g_reverb.smoothDampHigh * (1.0f - fzRamp);
}

// Slow modulation bypass during freeze
if (fzRamp < 0.5f) {
    blockFeedback = fminf(0.998f, blockFeedback * (1.0f + m1 * slowDepth * 0.06f * modAttenFactor));
}

// HPF bypass during freeze
float hpC = (fzRamp > 0.99f && fzMode != 2 && fzMode != 3) ? 1.0f : g_reverb.hpCoeff;

// Velvet noise disabled during freeze
float velvetThreshold = 0.0f;
if (fzRamp < 0.1f && blockFeedback > 0.92f && blockFeedback < 0.97f && fzMode != 1) {
    velvetThreshold = (blockFeedback - 0.92f) * 20.0f * 0.008f;
}

// Multi-rate LFO evolution (allpass coefficient drift)
if (fzRamp > 0.1f && fzMode != 1) {
    float TAU = 2.0f * (float)M_PI;
    g_reverb.freezeAPPhase += 0.03f / sr;     // LFO 1: 0.03 Hz
    g_reverb.freezeEvoPhase2 += 0.07f / sr;   // LFO 2: 0.07 Hz
    g_reverb.freezeEvoPhase3 += 0.13f / sr;   // LFO 3: 0.13 Hz
    float evo1 = sinf(g_reverb.freezeAPPhase * TAU);
    float evo2 = sinf(g_reverb.freezeEvoPhase2 * TAU);
    float evo3 = sinf(g_reverb.freezeEvoPhase3 * TAU);
    g_reverb.freezeAPDrift = fzRamp * 0.04f * (evo1 * 0.5f + evo2 * 0.3f + evo3 * 0.2f);
}

// In-loop allpass drift during freeze
float fbOrig = g_reverb.fdnInLoopAP[j].fb;
if (g_reverb.freezeAPDrift != 0.0f) {
    float perLineDrift = g_reverb.freezeAPDrift * (1.0f + 0.3f * goldenHash(j));
    g_reverb.fdnInLoopAP[j].fb = fmaxf(0.2f, fminf(0.75f, fbOrig + perLineDrift));
}
g_reverb.fdnMixed[j] = g_reverb.fdnInLoopAP[j].process(g_reverb.fdnMixed[j]);
if (g_reverb.freezeAPDrift != 0.0f) g_reverb.fdnInLoopAP[j].fb = fbOrig;

// Soft clipper bypass in FDN write-back
float rawFeedback = g_reverb.fdnMixed[j] * blockFeedback + dryInject + shimInject + shimFbInject;
float value = (fzRamp > 0.5f)
    ? fmaxf(-3.0f, fminf(3.0f, rawFeedback))
    : softClip(rawFeedback, satMode);
```

---

## Worklet Code (reverb-wasm.worklet.js)

```javascript
// Freeze parameter passing
w.reverb_set_freeze((p.freeze || p.infinite) ? 1 : 0);

if (p.freezeInputBleed !== undefined || p.freezeModAtten !== undefined || p.freezeVelvetDensity !== undefined) {
  w.reverb_set_freeze_params(
    p.freezeInputBleed ?? 0,
    p.freezeModAtten ?? 0.7,
    p.freezeVelvetDensity ?? 0.003
  );
}
if (p.freezeMode !== undefined) {
  w.reverb_set_freeze_mode(p.freezeMode ?? 0);
}
```

## Engine Code (engine.ts)

```typescript
// In applyParams reverb section:
freeze: state.reverbFreeze ?? false,
freezeInputBleed: state.reverbFreezeInputBleed ?? 0,
freezeModAtten: state.reverbFreezeModAtten ?? 0.7,
freezeVelvetDensity: state.reverbFreezeVelvetDensity ?? 0.003,
freezeMode: state.reverbFreezeMode ?? 0,
```

## State Definitions (state.ts)

```typescript
// SliderState interface:
reverbFreeze: boolean;
reverbFreezeInputBleed: number;    // 0..1
reverbFreezeModAtten: number;      // 0..1
reverbFreezeVelvetDensity: number; // 0..0.05
reverbFreezeMode: number;          // 0-3

// Defaults:
reverbFreeze: false,
reverbFreezeInputBleed: 0,
reverbFreezeModAtten: 0.7,
reverbFreezeVelvetDensity: 0.003,
reverbFreezeMode: 0,

// Slider constraints:
reverbFreezeInputBleed: { min: 0, max: 1, step: 0.01 },
reverbFreezeModAtten: { min: 0, max: 1, step: 0.01 },
reverbFreezeVelvetDensity: { min: 0, max: 0.05, step: 0.001 },
reverbFreezeMode: { min: 0, max: 3, step: 1 },
```

## UI Code (ReverbPage.tsx)

```tsx
{/* Freeze toggle */}
<div className="app-slider-group" style={{ marginTop: 8 }}>
  <div className="app-slider-label">
    <span>Freeze</span>
    <span style={{ color: state.reverbFreeze ? '#60a5fa' : '#6b7280' }}>
      {state.reverbFreeze ? 'FROZEN' : 'OFF'}
    </span>
  </div>
  <button
    className={`reverb-toggle ${state.reverbFreeze ? 'freeze-on' : 'freeze-off'}`}
    onClick={() => onSelectChange('reverbFreeze', !state.reverbFreeze)}
  >
    {state.reverbFreeze ? '❄ Infinite Sustain' : '○ Normal Decay'}
  </button>
</div>

{/* Freeze sub-params */}
{state.reverbFreeze && (
  <>
    <Select label="Freeze Mode" value={String(state.reverbFreezeMode ?? 0)}
      options={[
        { value: '0', label: 'Tank (evolving sustain)' },
        { value: '1', label: 'Snapshot (static capture)' },
        { value: '2', label: 'Resonator (filter input)' },
        { value: '3', label: 'Slushy (stochastic refresh)' },
      ]}
      onChange={(v) => onSelectChange('reverbFreezeMode', Number(v))}
    />
    {state.reverbFreezeMode === 0 && (
      <>
        <Slider label="Input Bleed" paramKey="reverbFreezeInputBleed" ... />
        <Slider label="Mod Attenuation" paramKey="reverbFreezeModAtten" ... />
        <Slider label="Velvet Density" paramKey="reverbFreezeVelvetDensity" ... />
      </>
    )}
  </>
)}
```

## Presets

### Frozen Cathedral
```typescript
{
  label: 'Frozen Cathedral',
  description: 'Infinite sustain with wide stereo and gentle chorus',
  params: {
    reverbType: 'cathedral', reverbDecay: 1.0, reverbSize: 3.0,
    reverbDiffusion: 1.0, reverbModulation: 0.3,
    predelay: 100, damping: 0.05, width: 1.0,
    reverbFreeze: true,
    reverbFreezeInputBleed: 0.05, reverbFreezeModAtten: 0.8,
    reverbFreezeVelvetDensity: 0.003, reverbFreezeMode: 0,
    reverbChorusRate: 0.8, reverbChorusDepth: 15,
    reverbModCharacter: 'sine',
    reverbDampLow: 0.0, reverbDampHigh: 0.05, reverbCrossoverFreq: 1000,
    reverbInputTone: 0.1,
    reverbEarlyReflections: 0.4, reverbAirAbsorption: 0.1,
    reverbSaturationMode: 'clean',
  },
}
```

---

## Key Lesson

**Why STFT spectral freeze works but FDN/Dattorro reverb freeze does not:**

The spectral freeze operates in the frequency domain — it captures FFT magnitudes and holds them directly. There is no recirculation; the output is simply resynthesized from the held spectrum. This is inherently lossless.

FDN/Dattorro reverb freeze attempts to achieve infinite hold by setting feedback to 1.0. But the signal must physically recirculate through delay lines, allpass filters, damping filters, mixing matrices, and output taps thousands of times per second. Even with all known loss sources addressed, the cumulative effect of:
- Floating-point rounding in filters
- Allpass coefficient quantization
- Hadamard matrix scaling factors
- Interpolation in modulated delay reads
- Any sub-unity gain anywhere in the chain

...means the signal inevitably decays. True reverb freeze likely requires a hybrid approach: capture the delay line state and replay it (snapshot-and-play), rather than relying on feedback=1.0 recirculation.
