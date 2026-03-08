/**
 * Kessho Reverb v2 — Full C++ Implementation
 *
 * Ambient wash reverb inspired by Empress Reverb / Valhalla Supermassive.
 *
 * v2 additions over v1:
 *   1. 16-channel FDN (Ultra mode) — denser, smoother wash
 *   2. Golden-ratio-spaced prime delay lengths — eliminates periodicity
 *   3. Per-delay-line chorus modulation with random phase offsets
 *   4. Drift modulation (filtered noise) — organic, never-repeating wobble
 *   5. Multi-band damping (2-band low/high with crossover)
 *   6. Input tone shaping (pre-filter before FDN)
 *   7. True stereo decorrelation (different taps per ear)
 *   8. Shimmer feedback into FDN (compound pitch shifting)
 *
 * Build: emcc → .wasm (AudioWorklet) or clang → static lib (iOS)
 */

#include "kessho_reverb.h"
#include <cmath>
#include <cstring>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ═══════════════ Constants ═══════════════

static constexpr int MAX_BLOCK_SIZE   = 128;
static constexpr int FDN_MAX_CHANNELS = 16;  // Ultra uses all 16
static constexpr int SHIMMER_BUF_SIZE = 4096;

// Golden-ratio-spaced prime delay times (ms) — 16 lines
// Each successive time ≈ prev × φ^(1/3), snapped to nearest prime
// This ensures maximum density with minimum repetition
static const float FDN_TIMES_MS[16] = {
    29.0f,  34.0f,  41.0f,  49.0f,  59.0f,  71.0f,  83.0f,  101.0f,
   121.0f, 146.0f, 173.0f, 211.0f, 251.0f, 307.0f, 367.0f, 443.0f
};

// Diffuser times (samples at 48 kHz)
static const int DIFF_PRE_L[6]  = {89, 127, 179, 233, 307, 401};
static const int DIFF_PRE_R[6]  = {97, 137, 191, 251, 317, 419};
static const int DIFF_MID_L[4]  = {167, 229, 313, 421};
static const int DIFF_MID_R[4]  = {173, 241, 331, 433};
static const int DIFF_POST_L[6] = {211, 283, 367, 457, 547, 641};
static const int DIFF_POST_R[6] = {223, 293, 379, 467, 557, 653};

// Preset configs
struct PresetConfig { float decay, damping, diffusion, size, modDepth; };
static const PresetConfig PRESETS[4] = {
    {0.88f, 0.25f, 0.80f, 0.8f, 0.25f},  // plate
    {0.92f, 0.20f, 0.85f, 1.0f, 0.30f},  // hall
    {0.96f, 0.12f, 0.95f, 1.5f, 0.40f},  // cathedral
    {0.94f, 0.45f, 0.90f, 1.3f, 0.30f},  // darkHall
};

// Stereo decorrelation tap coefficients — separate L/R arrays
// Scaled so RMS ≈ 0.91, matching 8-ch output tap RMS
static const float STEREO_TAPS_L[16] = {
    0.39f, 0.09f, 0.35f, 0.11f, 0.30f, 0.06f, 0.26f, 0.05f,
    0.06f, 0.36f, 0.09f, 0.33f, 0.06f, 0.26f, 0.05f, 0.21f
};
static const float STEREO_TAPS_R[16] = {
    0.05f, 0.30f, 0.06f, 0.33f, 0.09f, 0.35f, 0.11f, 0.39f,
    0.21f, 0.05f, 0.29f, 0.06f, 0.33f, 0.11f, 0.36f, 0.09f
};

// Dattorro plate reverb delay times (samples at 48 kHz)
// Scaled from Jon Dattorro, "Effect Design Pt.1", JAES 1997 (29761 Hz → 48000 Hz)
static constexpr float DAT_SCALE = 48000.0f / 29761.0f;  // ≈1.613

// Input diffusion allpass delay lengths (samples at 48k)
static const int DAT_IN_AP[4] = {229, 173, 611, 447};
// Input diffusion coefficients
static constexpr float DAT_IN_DIFF1 = 0.75f;
static constexpr float DAT_IN_DIFF2 = 0.625f;

// Tank delay lengths (samples at 48k)
static const int DAT_TANK_AP[2]    = {1084, 1464};    // modulated allpass
static const int DAT_TANK_DELAY1[2] = {7184, 6802};   // first delay per side
static const int DAT_TANK_AP2[2]   = {2904, 4284};    // decay allpass
static const int DAT_TANK_DELAY2[2] = {6000, 5102};   // second delay per side
static constexpr float DAT_TANK_AP_COEFF  = 0.7f;
static constexpr float DAT_TANK_AP2_COEFF = 0.5f;

// Dattorro output tap positions (samples at 48k, from original paper, scaled)
static const int DAT_OUT_TAPS_L[7] = {429, 4801, 3087, 3221, 1720, 574, 5652};
static const int DAT_OUT_TAPS_R[7] = {569, 5852, 1981, 3404, 541, 301, 7808};
// Which tank delay each tap reads from: 0-3 = delays 1a, 2a, 1b, 2b
static const int DAT_OUT_TAP_SRC_L[7] = {0, 0, 1, 2, 2, 3, 3};
static const int DAT_OUT_TAP_SRC_R[7] = {2, 2, 3, 0, 0, 1, 1};
static const float DAT_OUT_TAP_SIGN_L[7] = {1,1,1,1,-1,1,-1};
static const float DAT_OUT_TAP_SIGN_R[7] = {1,1,1,1,-1,1,-1};

// In-loop allpass per FDN channel — smears transients inside recirculation
static constexpr int INLOOP_AP_STAGES = 2;
static const int INLOOP_AP_TIMES[2] = {31, 67};  // prime, short
static constexpr float INLOOP_AP_FB = 0.4f;

// Early reflections — sparse taps simulating first room reflections (ms at 48k)
static constexpr int ER_TAP_COUNT = 10;
static const float ER_TIMES_L[ER_TAP_COUNT] = { 7.0f, 13.0f, 19.0f, 29.0f, 37.0f, 43.0f, 53.0f, 61.0f, 71.0f, 79.0f };
static const float ER_TIMES_R[ER_TAP_COUNT] = { 11.0f, 17.0f, 23.0f, 31.0f, 41.0f, 47.0f, 59.0f, 67.0f, 73.0f, 83.0f };
static const float ER_GAINS[ER_TAP_COUNT]   = { 0.85f, 0.72f, 0.60f, 0.50f, 0.42f, 0.35f, 0.28f, 0.22f, 0.18f, 0.15f };

// Multi-tap read — additional prime-spaced taps per FDN line for denser echoes
static constexpr int MULTITAP_COUNT = 3;
static const float MULTITAP_OFFSETS[MULTITAP_COUNT] = { 0.0f, 0.381966f, 0.618034f };  // golden ratio positions
static const float MULTITAP_GAINS[MULTITAP_COUNT]   = { 0.6f, 0.25f, 0.15f };

// ═══════════════ DSP Primitives ═══════════════

struct OnePole {
    float z1 = 0.0f;
    inline float process(float input, float coeff) {
        z1 = input * (1.0f - coeff) + z1 * coeff;
        return z1;
    }
};

struct OnePoleHP {
    float x1 = 0.0f;
    float y1 = 0.0f;
    inline float process(float input, float coeff) {
        float y = coeff * (y1 + input - x1);
        x1 = input;
        y1 = y;
        return y;
    }
};

struct DCBlocker {
    float x1 = 0.0f, y1 = 0.0f;
    inline float process(float input) {
        float y = input - x1 + 0.9975f * y1;
        x1 = input;
        y1 = y;
        return y;
    }
};

// 2-band shelving damper (low + high decay rates)
struct MultibandDamper {
    float lpState = 0.0f;  // low-shelf accumulator
    float hpState = 0.0f;  // high-shelf accumulator

    // Process one sample with separate low/high damping coefficients
    // crossCoeff = exp(-2π * crossoverFreq / sampleRate)
    inline float process(float input, float dampLow, float dampHigh, float crossCoeff) {
        // Split into low and high bands
        float lo = lpState + (1.0f - crossCoeff) * (input - lpState);
        lpState = lo;
        float hi = input - lo;

        // Apply separate damping to each band
        lo = lo * (1.0f - dampLow);
        hi = hi * (1.0f - dampHigh);

        return lo + hi;
    }
};

// Input tone shaping — simple tilt EQ
struct TiltFilter {
    float lpState = 0.0f;

    // tone: -1=dark (full LP) 0=flat +1=bright (full HP)
    // coeff: exp(-2π * 1000Hz / sr) — fixed center frequency
    inline float process(float input, float tone, float coeff) {
        lpState += (1.0f - coeff) * (input - lpState);
        float lo = lpState;
        float hi = input - lo;
        // Crossfade: -1 → all lo, 0 → mix, +1 → all hi
        if (tone <= 0.0f) {
            // -1..0: blend from pure LP to flat
            float blend = tone + 1.0f;  // 0..1
            return lo + hi * blend;
        } else {
            // 0..+1: blend from flat to boosted HP
            return lo * (1.0f - tone) + hi * (1.0f + tone * 0.5f);
        }
    }
};

struct SmoothDelay {
    float* buffer = nullptr;
    int    writeIdx = 0;
    int    size = 0;

    void init(int maxSamples) {
        size = maxSamples;
        buffer = (float*)calloc(maxSamples, sizeof(float));
        writeIdx = 0;
    }
    void destroy() {
        free(buffer);
        buffer = nullptr;
    }
    inline void write(float sample) {
        buffer[writeIdx] = sample;
        writeIdx++;
        if (writeIdx >= size) writeIdx = 0;
    }
    inline float read(int delaySamples) const {
        int idx = writeIdx - delaySamples;
        if (idx < 0) idx += size;
        return buffer[idx];
    }
    inline float readInterpolated(float delaySamples) const {
        // Allpass interpolation — transparent modulation, no zipper artifacts
        // Uses 1st-order allpass: y[n] = x[n-1] + frac * (x[n] - y[n-1])
        // where x[n] is the integer-delayed sample
        float readPos = (float)writeIdx - delaySamples;
        if (readPos < 0.0f) readPos += (float)size;
        int i0 = (int)readPos;
        if (i0 >= size) i0 -= size;
        int i1 = i0 + 1;
        if (i1 >= size) i1 = 0;
        int im1 = i0 - 1;
        if (im1 < 0) im1 += size;
        float frac = readPos - floorf(readPos);
        // For very small frac, allpass becomes unstable → fall back to linear
        if (frac < 0.01f || frac > 0.99f) {
            return buffer[i0] + (buffer[i1] - buffer[i0]) * frac;
        }
        // Allpass coefficient for fractional delay
        float c = (1.0f - frac) / (1.0f + frac);
        return buffer[i1] + c * (buffer[i0] - buffer[i1]);
    }
};

static constexpr int MAX_DIFFUSER_STAGES = 6;

struct DiffuserChain {
    SmoothDelay delays[MAX_DIFFUSER_STAGES];
    float       feedbacks[MAX_DIFFUSER_STAGES];
    int         delaySamples[MAX_DIFFUSER_STAGES];
    int         stageCount = 0;

    void init(const int* times, int count, float scale, float feedback) {
        stageCount = count;
        for (int i = 0; i < count; i++) {
            int sz = (int)(times[i] * scale) + 100;
            delays[i].init(sz);
            feedbacks[i] = feedback;
            delaySamples[i] = (int)(times[i] * scale);
        }
    }
    void destroy() {
        for (int i = 0; i < stageCount; i++) delays[i].destroy();
    }
    inline float process(float input) {
        float x = input;
        for (int i = 0; i < stageCount; i++) {
            float delayed = delays[i].read(delaySamples[i]);
            float fb = feedbacks[i];
            float v = x - delayed * fb;
            delays[i].write(v);
            x = delayed + v * fb;
        }
        return x;
    }
    void setFeedback(float fb) {
        for (int i = 0; i < stageCount; i++) feedbacks[i] = fb;
    }
};

// Saturation modes: 0=clean (tanh), 1=tape (asymmetric odd+even harmonics), 2=tube (soft knee)
inline float softClipClean(float x) {
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

inline float softClipTape(float x) {
    // Asymmetric: odd harmonics (tanh) + subtle even harmonics (x²)
    // Creates warmth through 2nd harmonic content like analog tape
    float sym = softClipClean(x);
    float asym = 0.08f * x * x * (x > 0.0f ? 1.0f : -1.0f);  // even-harmonic bias
    return sym + fmaxf(-0.15f, fminf(0.15f, asym));
}

inline float softClipTube(float x) {
    // Softer knee — more gradual onset of saturation
    // y = x / (1 + |x|)^0.7 — gentler than tanh, more headroom
    float ax = fabsf(x);
    if (ax < 0.001f) return x;
    return x / powf(1.0f + ax, 0.7f);
}

inline float softClip(float x, int mode = 0) {
    switch (mode) {
        case 1:  return softClipTape(x);
        case 2:  return softClipTube(x);
        default: return softClipClean(x);
    }
}

// In-loop allpass filter (lightweight, per FDN channel)
struct InLoopAllpass {
    SmoothDelay delays[INLOOP_AP_STAGES];
    int delaySamples[INLOOP_AP_STAGES];
    float fb;

    void init(float scale) {
        fb = INLOOP_AP_FB;
        for (int i = 0; i < INLOOP_AP_STAGES; i++) {
            int sz = (int)(INLOOP_AP_TIMES[i] * scale) + 10;
            delays[i].init(sz);
            delaySamples[i] = (int)(INLOOP_AP_TIMES[i] * scale);
        }
    }
    void destroy() {
        for (int i = 0; i < INLOOP_AP_STAGES; i++) delays[i].destroy();
    }
    inline float process(float input) {
        float x = input;
        for (int i = 0; i < INLOOP_AP_STAGES; i++) {
            float delayed = delays[i].read(delaySamples[i]);
            float v = x - delayed * fb;
            delays[i].write(v);
            x = delayed + v * fb;
        }
        return x;
    }
};

// Dattorro tank allpass with optional LFO modulation
struct TankAllpass {
    SmoothDelay delay;
    int baseSamples;
    float coeff;

    void init(int samples, float scale, float c) {
        baseSamples = (int)(samples * scale);
        int sz = baseSamples + 200;  // extra for modulation excursion
        delay.init(sz);
        coeff = c;
    }
    void destroy() { delay.destroy(); }
    inline float process(float input) {
        float delayed = delay.read(baseSamples);
        float v = input - delayed * coeff;
        delay.write(v);
        return delayed + v * coeff;
    }
    inline float processModulated(float input, float modOffset) {
        float delayTime = (float)baseSamples + modOffset;
        if (delayTime < 1.0f) delayTime = 1.0f;
        float delayed = delay.readInterpolated(delayTime);
        float v = input - delayed * coeff;
        delay.write(v);
        return delayed + v * coeff;
    }
};

// Simple LCG PRNG for drift noise
struct SimpleRNG {
    uint32_t state;
    void seed(uint32_t s) { state = s ? s : 1; }
    inline float nextFloat() {  // returns -1..+1
        state = state * 1664525u + 1013904223u;
        return (float)(int32_t)(state) * (1.0f / 2147483648.0f);
    }
};

// ═══════════════ Engine State ═══════════════

static struct {
    float sampleRate;
    float scale;  // sampleRate / 48000

    // I/O
    float inputBuf[MAX_BLOCK_SIZE * 2];
    float outputBuf[MAX_BLOCK_SIZE * 2];

    // FDN — 16 channels max (Ultra uses 16, Balanced uses 8, Lite uses 4)
    SmoothDelay     fdnDelays[FDN_MAX_CHANNELS];
    float           fdnDelayTimes[FDN_MAX_CHANNELS];
    MultibandDamper fdnDampers[FDN_MAX_CHANNELS];
    OnePoleHP       fdnHPFs[FDN_MAX_CHANNELS];
    float           hpCoeff;

    // Work arrays
    float fdnReads[FDN_MAX_CHANNELS];
    float fdnDamped[FDN_MAX_CHANNELS];
    float fdnMixed[FDN_MAX_CHANNELS];

    // In-loop allpass per FDN channel (smears transients inside recirculation)
    InLoopAllpass fdnInLoopAP[FDN_MAX_CHANNELS];

    // Per-line chorus modulation
    float chorusPhases[FDN_MAX_CHANNELS];   // current phase per line
    float chorusPhaseInc[FDN_MAX_CHANNELS]; // phase increment per sample
    // Drift modulation state (filtered noise)
    float driftState[FDN_MAX_CHANNELS];     // current drift value
    float driftTarget[FDN_MAX_CHANNELS];    // target drift value
    SimpleRNG driftRNG[FDN_MAX_CHANNELS];   // per-line PRNGs

    // Diffusers
    DiffuserChain preDiffL, preDiffR;
    DiffuserChain midDiffL, midDiffR;
    DiffuserChain postDiffL, postDiffR;

    // Predelay
    SmoothDelay predelayL, predelayR;
    int predelaySamples;

    // Input tone shaping
    TiltFilter tiltL, tiltR;

    // DC blockers
    DCBlocker dcBlockerL, dcBlockerR;

    // Shimmer
    float shimmerBufL[SHIMMER_BUF_SIZE];
    float shimmerBufR[SHIMMER_BUF_SIZE];
    int   shimmerWriteIdx;
    float shimmerPhase0, shimmerPhase1;
    float shimmerPitchRatio;

    // Slow modulation
    float slowModPhase1, slowModPhase2;

    // Reverse tail
    float* reverseBufL;
    float* reverseBufR;
    int    reverseBufSize;
    int    reverseWriteIdx;
    float  reverseReadPhase;
    float  reverseEnvPhase;
    int    reverseCycleLen;

    // ═══ Parameters ═══
    int   presetType;          // 0-5 (0-3=FDN, 4=dattorroPlate, 5=dattorroShimmer)
    int   quality;             // 0=ultra(16ch) 1=balanced(8ch) 2=lite(4ch)
    float decay;
    float size;
    float damping;             // legacy single-band (maps to dampHigh)
    float diffusion;
    float modulation;
    float predelayMs;
    float width;
    int   freeze;
    float shimmerAmount;
    float shimmerPitch;
    float slowModRate;
    float slowModDepth;
    float reverseAmount;
    float reverseLength;

    // v2 parameters
    float chorusRate;          // 0.1-2.0 Hz
    float chorusDepth;         // 0-40 samples
    int   modCharacter;        // 0=sine 1=drift 2=hybrid
    float dampLow;             // 0-1 (multi-band low damping)
    float dampHigh;            // 0-1 (multi-band high damping)
    float crossoverHz;         // 200-4000 Hz
    float crossoverCoeff;      // computed from crossoverHz
    float inputTone;           // -1..+1
    float tiltCoeff;           // computed from ~1000 Hz center
    float shimmerFeedback;     // 0-1 (compound pitch shifting)

    // v3 parameters  
    float warp;                // 0-1 pitch warp/bend in feedback
    float crossFeed;           // 0-1 stereo cross-injection

    // v4 parameters
    float earlyReflections;    // 0-1 early reflections mix
    float airAbsorption;       // 0-1 spectral tilt per recirculation
    int   saturationMode;      // 0=clean 1=tape 2=tube

    // Early reflection delay lines
    SmoothDelay erDelayL, erDelayR;   // shared ER buffer per side

    // Air absorption filter per FDN channel (spectral tilt in feedback)
    OnePole fdnAirAbs[FDN_MAX_CHANNELS];

    // Velvet noise injection (sparse random impulses at high decay)
    SimpleRNG velvetRNG;
    float velvetDensity;       // auto-calculated from decay

    // Matrix rotation state
    float matrixRotPhase;      // 0..1 evolving over ~30s
    int   matrixSignFlip[FDN_MAX_CHANNELS];  // sign pattern per channel

    // Predelay modulation
    float predelayModPhase;

    // Freeze spectral evolution
    float freezeAPDrift;       // slowly evolving allpass coefficient offset
    float freezeAPPhase;       // LFO phase for freeze evolution

    // v5 enhanced freeze state
    float freezeRamp;          // 0..1 smooth ramp (0=normal, 1=fully frozen)
    float freezeInputBleed;    // 0-1 how much new input leaks during freeze
    float freezeModAtten;      // 0-1 how much to attenuate modulation during freeze
    float freezeVelvetDensity; // re-seeding density during freeze
    float freezeEvoPhase2;     // second evolution LFO phase (0.07 Hz)
    float freezeEvoPhase3;     // third evolution LFO phase (0.13 Hz)
    int   freezeMode;          // 0=tank, 1=state-capture, 2=resonator (future)

    // Dattorro tank state
    TankAllpass datInAP[4];         // input diffusion allpass
    TankAllpass datTankAP[2];       // modulated allpass per side
    SmoothDelay datTankDelay1[2];   // first tank delay per side
    OnePole     datTankDamp[2];     // LP damper per side
    TankAllpass datTankAP2[2];      // decay allpass per side
    SmoothDelay datTankDelay2[2];   // second tank delay per side
    float       datTankState[2];    // cross-coupled feedback state
    float       datModPhase;        // tank modulation LFO phase
    int         datInitialized;

    // Internal computed
    float feedbackGain;
    float smoothDampLow;
    float smoothDampHigh;

    int initialized;
} g_reverb;

// ═══════════════ Internal helpers ═══════════════

static void updatePreset() {
    // Dattorro types don't use FDN preset configs
    if (g_reverb.presetType >= 4) return;

    const auto& preset = PRESETS[g_reverb.presetType];
    float userDecay = g_reverb.decay;
    float userSize  = g_reverb.size;
    float sr = g_reverb.sampleRate;
    float scale = g_reverb.scale;

    // Feedback gain (with decay-dependent damping adjustment)
    float baseDecay = preset.decay;
    float effectiveDecay = baseDecay + (1.0f - baseDecay) * userDecay * 0.9f;
    g_reverb.feedbackGain = g_reverb.freeze
        ? 1.0f
        : fminf(0.998f, effectiveDecay);

    // FDN delay times — size range extended to 10.0 for massive spaces
    int maxChannels = (g_reverb.quality == 0) ? 16 : (g_reverb.quality == 1) ? 8 : 4;
    for (int i = 0; i < maxChannels; i++) {
        g_reverb.fdnDelayTimes[i] = FDN_TIMES_MS[i] * scale * sr / 1000.0f * userSize;
    }

    // Diffuser feedback
    float baseDiff = preset.diffusion;
    float userDiff = g_reverb.diffusion;
    float effectiveDiff = baseDiff * (0.6f + userDiff * 0.4f);
    float preFb  = 0.5f + effectiveDiff * 0.4f;
    float midFb  = 0.45f + effectiveDiff * 0.4f;
    float postFb = 0.4f + effectiveDiff * 0.4f;

    g_reverb.preDiffL.setFeedback(preFb);
    g_reverb.preDiffR.setFeedback(preFb);
    g_reverb.midDiffL.setFeedback(midFb);
    g_reverb.midDiffR.setFeedback(midFb);
    g_reverb.postDiffL.setFeedback(postFb);
    g_reverb.postDiffR.setFeedback(postFb);
}

static void updatePredelay() {
    g_reverb.predelaySamples = (int)(g_reverb.predelayMs / 1000.0f * g_reverb.sampleRate);
}

// Golden-ratio hash for per-line variation — deterministic, well-distributed 0..1
static inline float goldenHash(int i) {
    return fmodf((float)(i + 1) * 0.6180339887f, 1.0f);
}

static void updateChorusRates() {
    float baseRate = g_reverb.chorusRate;
    float sr = g_reverb.sampleRate;
    // Each line gets a unique rate via golden-ratio hash — prevents synchronization
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        float lineRate = baseRate * (0.8f + 0.4f * goldenHash(i));
        g_reverb.chorusPhaseInc[i] = lineRate / sr;
    }
}

static void updateCrossover() {
    g_reverb.crossoverCoeff = expf(-2.0f * (float)M_PI * g_reverb.crossoverHz / g_reverb.sampleRate);
}

// ── Hadamard mixing — 16×16, 8×8, 4×4 ──

// 16×16 Hadamard via recursive doubling of 8×8
static inline void mixFDN16(const float* in, float* out) {
    const float s = 0.25f;  // 1/sqrt(16)
    // H16 = H2 ⊗ H8: split into two halves, mix with ±
    float a[8], b[8];
    for (int i = 0; i < 8; i++) {
        a[i] = in[i] + in[i + 8];
        b[i] = in[i] - in[i + 8];
    }
    // Apply H8 to each half
    float ha[8], hb[8];
    // H8 rows (Hadamard pattern: rows are Walsh functions)
    const int H8[8][8] = {
        { 1, 1, 1, 1, 1, 1, 1, 1},
        { 1,-1, 1,-1, 1,-1, 1,-1},
        { 1, 1,-1,-1, 1, 1,-1,-1},
        { 1,-1,-1, 1, 1,-1,-1, 1},
        { 1, 1, 1, 1,-1,-1,-1,-1},
        { 1,-1, 1,-1,-1, 1,-1, 1},
        { 1, 1,-1,-1,-1,-1, 1, 1},
        { 1,-1,-1, 1,-1, 1, 1,-1}
    };
    for (int r = 0; r < 8; r++) {
        float sumA = 0.0f, sumB = 0.0f;
        for (int c = 0; c < 8; c++) {
            sumA += (float)H8[r][c] * a[c];
            sumB += (float)H8[r][c] * b[c];
        }
        ha[r] = sumA;
        hb[r] = sumB;
    }
    for (int i = 0; i < 8; i++) {
        out[i]     = ha[i] * s;
        out[i + 8] = hb[i] * s;
    }
}

static inline void mixFDN8(const float* state, float* out) {
    const float s = 0.3535533905932738f;  // 1/sqrt(8)
    out[0] = s * ( state[0]+state[1]+state[2]+state[3]+state[4]+state[5]+state[6]+state[7]);
    out[1] = s * ( state[0]-state[1]+state[2]-state[3]+state[4]-state[5]+state[6]-state[7]);
    out[2] = s * ( state[0]+state[1]-state[2]-state[3]+state[4]+state[5]-state[6]-state[7]);
    out[3] = s * ( state[0]-state[1]-state[2]+state[3]+state[4]-state[5]-state[6]+state[7]);
    out[4] = s * ( state[0]+state[1]+state[2]+state[3]-state[4]-state[5]-state[6]-state[7]);
    out[5] = s * ( state[0]-state[1]+state[2]-state[3]-state[4]+state[5]-state[6]+state[7]);
    out[6] = s * ( state[0]+state[1]-state[2]-state[3]-state[4]-state[5]+state[6]+state[7]);
    out[7] = s * ( state[0]-state[1]-state[2]+state[3]-state[4]+state[5]+state[6]-state[7]);
}

static inline void mixFDN4(const float* state, float* out) {
    const float s = 0.5f;
    out[0] = s * ( state[0]+state[1]+state[2]+state[3]);
    out[1] = s * ( state[0]-state[1]+state[2]-state[3]);
    out[2] = s * ( state[0]+state[1]-state[2]-state[3]);
    out[3] = s * ( state[0]-state[1]-state[2]+state[3]);
}

// ═══════════════ Public API ═══════════════

int reverb_init(float sample_rate) {
    memset(&g_reverb, 0, sizeof(g_reverb));
    g_reverb.sampleRate = sample_rate;
    g_reverb.scale = sample_rate / 48000.0f;

    float scale = g_reverb.scale;

    // FDN delay lines — allocate all 16 (unused ones cost near-zero)
    // Buffer sized for extended size up to 10.0 + modulation excursion
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        float baseTime = FDN_TIMES_MS[i] * scale;
        int maxSamples = (int)ceilf(baseTime * sample_rate / 1000.0f * 12.0f) + 200;
        g_reverb.fdnDelays[i].init(maxSamples);
        g_reverb.fdnDelayTimes[i] = baseTime * sample_rate / 1000.0f;
    }

    // In-loop allpass per FDN channel — smears transients inside recirculation
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.fdnInLoopAP[i].init(scale);
    }

    // Dattorro plate reverb tank initialization
    for (int i = 0; i < 4; i++) {
        float c = (i < 2) ? DAT_IN_DIFF1 : DAT_IN_DIFF2;
        g_reverb.datInAP[i].init(DAT_IN_AP[i], scale, c);
    }
    int datBufSize = (int)(8000.0f * scale * 3.5f) + 200;
    for (int s = 0; s < 2; s++) {
        g_reverb.datTankAP[s].init(DAT_TANK_AP[s], scale, DAT_TANK_AP_COEFF);
        g_reverb.datTankDelay1[s].init(datBufSize);
        g_reverb.datTankAP2[s].init(DAT_TANK_AP2[s], scale, DAT_TANK_AP2_COEFF);
        g_reverb.datTankDelay2[s].init(datBufSize);
        g_reverb.datTankState[s] = 0.0f;
    }
    g_reverb.datModPhase = 0.0f;
    g_reverb.datInitialized = 1;

    // Early reflection delay buffers (up to 100ms per side)
    int erBufSize = (int)ceilf(0.1f * sample_rate) + 100;
    g_reverb.erDelayL.init(erBufSize);
    g_reverb.erDelayR.init(erBufSize);

    // Velvet noise
    g_reverb.velvetRNG.seed(98765u);
    g_reverb.velvetDensity = 0.0f;

    // Matrix rotation
    g_reverb.matrixRotPhase = 0.0f;
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.matrixSignFlip[i] = 0;
    }

    // Predelay modulation
    g_reverb.predelayModPhase = 0.0f;

    // Freeze evolution
    g_reverb.freezeAPDrift = 0.0f;
    g_reverb.freezeAPPhase = 0.0f;

    // v5 enhanced freeze defaults
    g_reverb.freezeRamp = 0.0f;
    g_reverb.freezeInputBleed = 0.0f;
    g_reverb.freezeModAtten = 0.7f;      // attenuate modulation to 30% during freeze
    g_reverb.freezeVelvetDensity = 0.003f; // subtle re-seeding
    g_reverb.freezeEvoPhase2 = 0.0f;
    g_reverb.freezeEvoPhase3 = 0.0f;
    g_reverb.freezeMode = 0;

    // HPF ~35 Hz
    g_reverb.hpCoeff = 1.0f - (2.0f * (float)M_PI * 35.0f / sample_rate);

    // Diffusers
    g_reverb.preDiffL.init(DIFF_PRE_L, 6, scale, 0.65f);
    g_reverb.preDiffR.init(DIFF_PRE_R, 6, scale, 0.65f);
    g_reverb.midDiffL.init(DIFF_MID_L, 4, scale, 0.55f);
    g_reverb.midDiffR.init(DIFF_MID_R, 4, scale, 0.55f);
    g_reverb.postDiffL.init(DIFF_POST_L, 6, scale, 0.5f);
    g_reverb.postDiffR.init(DIFF_POST_R, 6, scale, 0.5f);

    // Predelay (up to 300 ms)
    int maxPredelay = (int)ceilf(0.3f * sample_rate);
    g_reverb.predelayL.init(maxPredelay);
    g_reverb.predelayR.init(maxPredelay);

    // Shimmer
    g_reverb.shimmerPhase0 = 0.0f;
    g_reverb.shimmerPhase1 = 0.5f;
    g_reverb.shimmerPitchRatio = 2.0f;

    // Reverse (max 16 s)
    g_reverb.reverseBufSize = (int)ceilf(16.0f * sample_rate);
    g_reverb.reverseBufL = (float*)calloc(g_reverb.reverseBufSize, sizeof(float));
    g_reverb.reverseBufR = (float*)calloc(g_reverb.reverseBufSize, sizeof(float));
    g_reverb.reverseCycleLen = (int)(2.0f * sample_rate);

    // Per-line chorus: random phase offsets
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        // Deterministic but well-distributed initial phases
        g_reverb.chorusPhases[i] = fmodf((float)i * 0.6180339887f, 1.0f);  // golden ratio
        g_reverb.driftState[i] = 0.0f;
        g_reverb.driftTarget[i] = 0.0f;
        g_reverb.driftRNG[i].seed(12345u + (uint32_t)i * 7919u);  // prime-seeded
    }

    // Slow-mod phases
    g_reverb.slowModPhase1 = 0.0f;
    g_reverb.slowModPhase2 = 1.2f;

    // ═══ Defaults ═══
    g_reverb.presetType = 1;      // hall
    g_reverb.quality = 0;         // ultra (16 ch) — new default
    g_reverb.decay = 0.8f;
    g_reverb.size = 1.5f;
    g_reverb.damping = 0.5f;
    g_reverb.diffusion = 0.8f;
    g_reverb.modulation = 0.3f;
    g_reverb.predelayMs = 20.0f;
    g_reverb.width = 0.8f;
    g_reverb.freeze = 0;
    g_reverb.shimmerAmount = 0.0f;
    g_reverb.shimmerPitch = 12.0f;
    g_reverb.slowModRate = 0.05f;
    g_reverb.slowModDepth = 0.0f;
    g_reverb.reverseAmount = 0.0f;
    g_reverb.reverseLength = 2.0f;

    // v2 defaults
    g_reverb.chorusRate = 0.5f;
    g_reverb.chorusDepth = 12.0f;
    g_reverb.modCharacter = 2;     // hybrid (sine + drift)
    g_reverb.dampLow = 0.1f;
    g_reverb.dampHigh = 0.3f;
    g_reverb.crossoverHz = 800.0f;
    g_reverb.inputTone = 0.0f;     // flat
    g_reverb.shimmerFeedback = 0.0f;

    // v3 defaults
    g_reverb.warp = 0.0f;
    g_reverb.crossFeed = 0.0f;

    // v4 defaults
    g_reverb.earlyReflections = 0.3f;
    g_reverb.airAbsorption = 0.2f;
    g_reverb.saturationMode = 0;  // clean

    // Computed
    g_reverb.smoothDampLow = g_reverb.dampLow;
    g_reverb.smoothDampHigh = g_reverb.dampHigh;
    g_reverb.tiltCoeff = expf(-2.0f * (float)M_PI * 1000.0f / sample_rate);

    updateCrossover();
    updateChorusRates();
    updatePreset();
    updatePredelay();

    g_reverb.initialized = 1;
    return 0;
}

void reverb_destroy(void) {
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.fdnDelays[i].destroy();
        g_reverb.fdnInLoopAP[i].destroy();
    }
    g_reverb.preDiffL.destroy();  g_reverb.preDiffR.destroy();
    g_reverb.midDiffL.destroy();  g_reverb.midDiffR.destroy();
    g_reverb.postDiffL.destroy(); g_reverb.postDiffR.destroy();
    g_reverb.predelayL.destroy(); g_reverb.predelayR.destroy();
    free(g_reverb.reverseBufL);
    free(g_reverb.reverseBufR);
    // Early reflections
    g_reverb.erDelayL.destroy();
    g_reverb.erDelayR.destroy();
    // Dattorro cleanup
    for (int i = 0; i < 4; i++) g_reverb.datInAP[i].destroy();
    for (int s = 0; s < 2; s++) {
        g_reverb.datTankAP[s].destroy();
        g_reverb.datTankDelay1[s].destroy();
        g_reverb.datTankAP2[s].destroy();
        g_reverb.datTankDelay2[s].destroy();
    }
    g_reverb.initialized = 0;
}

float* reverb_get_input_ptr(void)  { return g_reverb.inputBuf; }
float* reverb_get_output_ptr(void) { return g_reverb.outputBuf; }

void reverb_set_type(int type) {
    g_reverb.presetType = (type >= 0 && type <= 5) ? type : 1;
    updatePreset();
}

void reverb_set_quality(int quality) {
    g_reverb.quality = (quality >= 0 && quality <= 2) ? quality : 1;
    updatePreset();  // recalculate delay times for new channel count
}

void reverb_set_params(float decay, float size, float damping, float diffusion,
                       float modulation, float predelay, float width) {
    g_reverb.decay = decay;
    g_reverb.size = size;
    g_reverb.damping = damping;
    // Legacy: single-band damping maps to dampHigh ONLY if multiband_damp hasn't been called
    // (dampHigh is now owned by reverb_set_multiband_damp, don't clobber it)
    g_reverb.diffusion = diffusion;
    g_reverb.modulation = modulation;
    g_reverb.predelayMs = predelay;
    g_reverb.width = width;
    updatePreset();
    updatePredelay();
}

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
    g_reverb.freezeMode = (mode >= 0 && mode <= 2) ? mode : 0;
}

void reverb_set_shimmer(float amount, float pitch_semitones) {
    g_reverb.shimmerAmount = amount;
    g_reverb.shimmerPitch = pitch_semitones;
    g_reverb.shimmerPitchRatio = powf(2.0f, pitch_semitones / 12.0f);
}

void reverb_set_slow_mod(float rate_hz, float depth) {
    g_reverb.slowModRate = rate_hz;
    g_reverb.slowModDepth = depth;
}

void reverb_set_reverse(float amount, float length_seconds) {
    g_reverb.reverseAmount = amount;
    g_reverb.reverseLength = length_seconds;
    g_reverb.reverseCycleLen = (int)fminf(
        (float)g_reverb.reverseBufSize,
        roundf(length_seconds * g_reverb.sampleRate)
    );
}

// ─── v2 setters ───

void reverb_set_chorus(float rate_hz, float depth) {
    g_reverb.chorusRate = fmaxf(0.05f, fminf(2.0f, rate_hz));
    g_reverb.chorusDepth = fmaxf(0.0f, fminf(40.0f, depth));
    updateChorusRates();
}

void reverb_set_mod_character(int mode) {
    g_reverb.modCharacter = (mode >= 0 && mode <= 2) ? mode : 2;
}

void reverb_set_multiband_damp(float damp_low, float damp_high, float crossover_hz) {
    g_reverb.dampLow = fmaxf(0.0f, fminf(1.0f, damp_low));
    g_reverb.dampHigh = fmaxf(0.0f, fminf(1.0f, damp_high));
    g_reverb.crossoverHz = fmaxf(100.0f, fminf(6000.0f, crossover_hz));
    updateCrossover();
}

void reverb_set_input_tone(float tone) {
    g_reverb.inputTone = fmaxf(-1.0f, fminf(1.0f, tone));
}

void reverb_set_shimmer_feedback(float feedback) {
    g_reverb.shimmerFeedback = fmaxf(0.0f, fminf(1.0f, feedback));
}

void reverb_set_warp(float amount) {
    g_reverb.warp = fmaxf(0.0f, fminf(1.0f, amount));
}

void reverb_set_cross_feed(float amount) {
    g_reverb.crossFeed = fmaxf(0.0f, fminf(1.0f, amount));
}

void reverb_set_early_reflections(float amount) {
    g_reverb.earlyReflections = fmaxf(0.0f, fminf(1.0f, amount));
}

void reverb_set_air_absorption(float amount) {
    g_reverb.airAbsorption = fmaxf(0.0f, fminf(1.0f, amount));
}

void reverb_set_saturation_mode(int mode) {
    g_reverb.saturationMode = (mode < 0) ? 0 : ((mode > 2) ? 2 : mode);
}

// ═══════════════ Dattorro Plate Reverb ═══════════════
//
// Jon Dattorro, "Effect Design Part 1", JAES 1997
// Signal flow:
//   Input → Predelay → Pre-diffusion → 4× Input Allpass → Tank
//   Tank = 2 cross-coupled loops: ModAP → Delay → Damp → DecayAP → Delay → ×decay
//   Output = 14 taps from tank delays
//
// Types: 4 = dattorroPlate (classic), 5 = dattorroShimmer (higher diffusion + mod)

static void dattorro_process_block(int block_size) {
    const float sr = g_reverb.sampleRate;
    const float scale = g_reverb.scale;
    const float userDecay = g_reverb.decay;
    const float userSize = g_reverb.size;
    const float damping = g_reverb.dampHigh;
    const float modulation = g_reverb.modulation;
    const float width = g_reverb.width;
    const float inputTone = g_reverb.inputTone;
    const float tiltCoeff = g_reverb.tiltCoeff;
    const bool isFrozen = g_reverb.freeze != 0;
    const bool isShimmerMode = (g_reverb.presetType == 5);

    // v5: use shared smooth ramp for Dattorro too
    float rampTarget = isFrozen ? 1.0f : 0.0f;
    float rampSpeed = (float)block_size / (0.2f * sr);
    g_reverb.freezeRamp += (rampTarget - g_reverb.freezeRamp) * fminf(1.0f, rampSpeed);
    float fzRamp = g_reverb.freezeRamp;

    // Dattorro decay coefficient — interpolated with ramp
    float normalTankDecay = fminf(0.9995f, 0.5f + userDecay * 0.4995f);
    float tankDecay = normalTankDecay + (1.0f - normalTankDecay) * fzRamp;

    // Damping (1-pole LP coefficient) — ramp toward no damping during freeze
    float normalDampCoeff = 1.0f - damping * 0.7f;
    float dampCoeff = normalDampCoeff + (1.0f - normalDampCoeff) * fzRamp;

    // Mod depth — shimmer mode gets more modulation for detuning shimmer effect
    // v5: attenuate modulation during freeze
    float modMult = isShimmerMode ? 2.5f : 1.0f;
    float modAttenFactor = 1.0f - fzRamp * g_reverb.freezeModAtten;
    float modDepthSamples = modulation * 16.0f * scale * modMult * modAttenFactor;
    float modRate = 0.3f / sr;  // slow tank LFO

    // Size scaling (capped at 3.0 for Dattorro — plate topology)
    float sizeScale = fmaxf(0.5f, fminf(3.0f, userSize));

    // Input diffusion — shimmer mode uses higher coefficients for more smearing
    float inDiff1 = isShimmerMode ? 0.85f : DAT_IN_DIFF1;
    float inDiff2 = isShimmerMode ? 0.75f : DAT_IN_DIFF2;
    // Temporarily update input AP coefficients if in shimmer mode
    if (isShimmerMode) {
        for (int i = 0; i < 2; i++) g_reverb.datInAP[i].coeff = inDiff1;
        for (int i = 2; i < 4; i++) g_reverb.datInAP[i].coeff = inDiff2;
    }

    // Input gain — v5: smooth ramp with optional bleed
    float normalDatInputGain = 0.2f;
    float datFreezeBleed = g_reverb.freezeInputBleed * normalDatInputGain;
    float inputGain = normalDatInputGain * (1.0f - fzRamp) + datFreezeBleed * fzRamp;

    // Warp: DC bias on tank allpass modulation
    float warpAmount = g_reverb.warp;

    // v4: Air absorption coefficient for tank dampers
    float airAbsCoeff = 1.0f - g_reverb.airAbsorption * 0.6f;
    int satMode = g_reverb.saturationMode;
    float erAmount = g_reverb.earlyReflections;
    float predelayModRate = 0.1f / sr;
    float predelayModMaxSamples = 0.002f * sr;

    // Pointer aliases for output tapping
    SmoothDelay* tankDelays[4] = {
        &g_reverb.datTankDelay1[0], &g_reverb.datTankDelay2[0],
        &g_reverb.datTankDelay1[1], &g_reverb.datTankDelay2[1]
    };

    for (int i = 0; i < block_size; i++) {
        float inL = g_reverb.inputBuf[i * 2];
        float inR = g_reverb.inputBuf[i * 2 + 1];

        // Input tone shaping
        if (inputTone != 0.0f) {
            inL = g_reverb.tiltL.process(inL, inputTone, tiltCoeff);
            inR = g_reverb.tiltR.process(inR, inputTone, tiltCoeff);
        }

        // Predelay with modulation
        g_reverb.predelayL.write(inL);
        g_reverb.predelayR.write(inR);
        float delayedL, delayedR;
        if (g_reverb.predelaySamples > 0) {
            g_reverb.predelayModPhase += predelayModRate;
            if (g_reverb.predelayModPhase > 1.0f) g_reverb.predelayModPhase -= 1.0f;
            float modL = predelayModMaxSamples * sinf(g_reverb.predelayModPhase * 2.0f * (float)M_PI);
            float modR = predelayModMaxSamples * sinf((g_reverb.predelayModPhase + 0.37f) * 2.0f * (float)M_PI);
            float readL = (float)g_reverb.predelaySamples + modL;
            float readR = (float)g_reverb.predelaySamples + modR;
            if (readL < 1.0f) readL = 1.0f;
            if (readR < 1.0f) readR = 1.0f;
            delayedL = g_reverb.predelayL.readInterpolated(readL);
            delayedR = g_reverb.predelayR.readInterpolated(readR);
        } else {
            delayedL = inL;
            delayedR = inR;
        }

        // Write to early reflection buffers
        g_reverb.erDelayL.write(delayedL);
        g_reverb.erDelayR.write(delayedR);

        // Sum to mono, scale, apply pre-diffusion
        float diffIn = g_reverb.preDiffL.process((delayedL + delayedR) * 0.5f) * inputGain;

        // Input diffusion: 4 serial allpass filters
        float x = diffIn;
        for (int j = 0; j < 4; j++) {
            x = g_reverb.datInAP[j].process(x);
        }

        // Inject into both tank sides (cross-coupled from opposite side)
        float tankInA = x + g_reverb.datTankState[1] * tankDecay;
        float tankInB = x + g_reverb.datTankState[0] * tankDecay;

        // Tank LFO modulation
        g_reverb.datModPhase += modRate;
        if (g_reverb.datModPhase > 1.0f) g_reverb.datModPhase -= 1.0f;
        float lfo1 = sinf(g_reverb.datModPhase * 2.0f * (float)M_PI) * modDepthSamples;
        float lfo2 = sinf((g_reverb.datModPhase * 1.37f + 0.5f) * 2.0f * (float)M_PI) * modDepthSamples;

        // Warp: DC offset on LFO — creates compounding pitch bend per recirculation
        if (warpAmount > 0.0f) {
            float warpOffset = warpAmount * modDepthSamples * 2.0f;
            lfo1 += warpOffset;
            lfo2 -= warpOffset;  // opposite direction for stereo interest
        }

        // --- Tank Side A ---
        float sA = g_reverb.datTankAP[0].processModulated(tankInA, lfo1);
        g_reverb.datTankDelay1[0].write(sA);
        int rp1a = (int)(DAT_TANK_DELAY1[0] * scale * sizeScale);
        if (rp1a < 1) rp1a = 1;
        if (rp1a >= g_reverb.datTankDelay1[0].size) rp1a = g_reverb.datTankDelay1[0].size - 1;
        sA = g_reverb.datTankDelay1[0].read(rp1a);
        sA = g_reverb.datTankDamp[0].process(sA, dampCoeff);
        // Air absorption in tank A
        if (g_reverb.airAbsorption > 0.01f) {
            sA = g_reverb.fdnAirAbs[0].process(sA, airAbsCoeff);
        }
        sA = g_reverb.datTankAP2[0].process(sA);
        g_reverb.datTankDelay2[0].write(sA);
        int rp2a = (int)(DAT_TANK_DELAY2[0] * scale * sizeScale);
        if (rp2a < 1) rp2a = 1;
        if (rp2a >= g_reverb.datTankDelay2[0].size) rp2a = g_reverb.datTankDelay2[0].size - 1;
        sA = g_reverb.datTankDelay2[0].read(rp2a);
        g_reverb.datTankState[0] = softClip(sA * tankDecay, satMode);

        // --- Tank Side B ---
        float sB = g_reverb.datTankAP[1].processModulated(tankInB, lfo2);
        g_reverb.datTankDelay1[1].write(sB);
        int rp1b = (int)(DAT_TANK_DELAY1[1] * scale * sizeScale);
        if (rp1b < 1) rp1b = 1;
        if (rp1b >= g_reverb.datTankDelay1[1].size) rp1b = g_reverb.datTankDelay1[1].size - 1;
        sB = g_reverb.datTankDelay1[1].read(rp1b);
        sB = g_reverb.datTankDamp[1].process(sB, dampCoeff);
        // Air absorption in tank B
        if (g_reverb.airAbsorption > 0.01f) {
            sB = g_reverb.fdnAirAbs[1].process(sB, airAbsCoeff);
        }
        sB = g_reverb.datTankAP2[1].process(sB);
        g_reverb.datTankDelay2[1].write(sB);
        int rp2b = (int)(DAT_TANK_DELAY2[1] * scale * sizeScale);
        if (rp2b < 1) rp2b = 1;
        if (rp2b >= g_reverb.datTankDelay2[1].size) rp2b = g_reverb.datTankDelay2[1].size - 1;
        sB = g_reverb.datTankDelay2[1].read(rp2b);
        g_reverb.datTankState[1] = softClip(sB * tankDecay, satMode);

        // --- Output tapping (14 taps: 7L, 7R) ---
        float outL = 0.0f, outR = 0.0f;
        for (int t = 0; t < 7; t++) {
            int srcL = DAT_OUT_TAP_SRC_L[t];
            int tapL = (int)(DAT_OUT_TAPS_L[t] * scale * sizeScale);
            if (tapL >= tankDelays[srcL]->size) tapL = tankDelays[srcL]->size - 1;
            if (tapL < 1) tapL = 1;
            outL += tankDelays[srcL]->read(tapL) * DAT_OUT_TAP_SIGN_L[t];

            int srcR = DAT_OUT_TAP_SRC_R[t];
            int tapR = (int)(DAT_OUT_TAPS_R[t] * scale * sizeScale);
            if (tapR >= tankDelays[srcR]->size) tapR = tankDelays[srcR]->size - 1;
            if (tapR < 1) tapR = 1;
            outR += tankDelays[srcR]->read(tapR) * DAT_OUT_TAP_SIGN_R[t];
        }

        // Scale output
        outL *= 0.15f;
        outR *= 0.15f;

        // Early reflections for Dattorro
        if (erAmount > 0.0f) {
            float erL = 0.0f, erR = 0.0f;
            for (int t = 0; t < ER_TAP_COUNT; t++) {
                int sampL = (int)(ER_TIMES_L[t] * 0.001f * sr);
                int sampR = (int)(ER_TIMES_R[t] * 0.001f * sr);
                if (sampL < 1) sampL = 1;
                if (sampR < 1) sampR = 1;
                erL += g_reverb.erDelayL.read(sampL) * ER_GAINS[t];
                erR += g_reverb.erDelayR.read(sampR) * ER_GAINS[t];
            }
            outL += erL * erAmount * 0.12f;
            outR += erR * erAmount * 0.12f;
        }

        // Post-diffusion (reuse existing post-diffuser chains)
        outL = g_reverb.postDiffL.process(outL);
        outR = g_reverb.postDiffR.process(outR);

        // NaN/Inf guard
        if (!(outL == outL) || outL > 1e15f || outL < -1e15f) outL = 0.0f;
        if (!(outR == outR) || outR > 1e15f || outR < -1e15f) outR = 0.0f;

        // DC blocking
        outL = g_reverb.dcBlockerL.process(outL);
        outR = g_reverb.dcBlockerR.process(outR);

        // Safety limiter
        if (outL > 0.95f) outL = 0.95f;
        else if (outL < -0.95f) outL = -0.95f;
        if (outR > 0.95f) outR = 0.95f;
        else if (outR < -0.95f) outR = -0.95f;

        // Stereo width
        float mid  = (outL + outR) * 0.5f;
        float side = (outL - outR) * 0.5f;
        g_reverb.outputBuf[i * 2]     = mid + side * width;
        g_reverb.outputBuf[i * 2 + 1] = mid - side * width;
    }

    // Restore default input AP coefficients if shimmer mode changed them
    if (isShimmerMode) {
        for (int i = 0; i < 2; i++) g_reverb.datInAP[i].coeff = DAT_IN_DIFF1;
        for (int i = 2; i < 4; i++) g_reverb.datInAP[i].coeff = DAT_IN_DIFF2;
    }
}

// ═══════════════ Processing ═══════════════

void reverb_process_block(int block_size) {
    if (!g_reverb.initialized || block_size <= 0) return;
    if (block_size > MAX_BLOCK_SIZE) block_size = MAX_BLOCK_SIZE;

    // Route to Dattorro engine for types 4-5 (avoids PRESETS[4+] out-of-bounds)
    if (g_reverb.presetType >= 4) {
        dattorro_process_block(block_size);
        return;
    }

    const float sr = g_reverb.sampleRate;
    const float width = g_reverb.width;
    const float modulation = g_reverb.modulation;
    const auto& preset = PRESETS[g_reverb.presetType];
    const float modDepth = preset.modDepth * modulation;
    const float blockPhaseInc = (float)block_size / sr;

    // Smooth damping per block (multi-band)
    const float smoothFactor = 1.0f - powf(1.0f - 0.0001f, (float)block_size);
    g_reverb.smoothDampLow  += (g_reverb.dampLow  - g_reverb.smoothDampLow)  * smoothFactor;
    g_reverb.smoothDampHigh += (g_reverb.dampHigh - g_reverb.smoothDampHigh) * smoothFactor;

    // Freeze overrides — v5: smooth ramp instead of instant switch
    const bool isFrozen = g_reverb.freeze != 0;
    // Ramp toward target: ~200ms at 48kHz = 9600 samples, per-block step
    float rampTarget = isFrozen ? 1.0f : 0.0f;
    float rampSpeed = (float)block_size / (0.2f * sr);  // reach target in ~200ms
    g_reverb.freezeRamp += (rampTarget - g_reverb.freezeRamp) * fminf(1.0f, rampSpeed);
    float fzRamp = g_reverb.freezeRamp;  // 0=normal, 1=fully frozen

    // Interpolate feedback, damping, and input gain using ramp
    float normalFeedback = g_reverb.feedbackGain;
    float blockFeedback = normalFeedback + (1.0f - normalFeedback) * fzRamp;
    float blockDampLow  = g_reverb.smoothDampLow * (1.0f - fzRamp);
    float blockDampHigh = g_reverb.smoothDampHigh * (1.0f - fzRamp);
    float crossCoeff    = g_reverb.crossoverCoeff;

    // Decay-dependent damping: reduce high damping at very high decay to maintain presence
    if (fzRamp < 0.5f && blockFeedback > 0.9f) {
        float decayScale = (blockFeedback - 0.9f) * 10.0f;  // 0..1 as decay goes 0.9..1.0
        blockDampHigh *= (1.0f - decayScale * 0.4f);         // reduce by up to 40%
    }

    // v3 enhancement params
    float warpAmount = g_reverb.warp;
    float crossFeedAmt = g_reverb.crossFeed;

    // Slow modulation (character drift) — v5: attenuate during freeze
    float slowDepth = g_reverb.slowModDepth;
    // Attenuate modulation during freeze based on freezeModAtten
    float modAttenFactor = 1.0f - fzRamp * g_reverb.freezeModAtten;
    if (slowDepth > 0.0f && modAttenFactor > 0.01f) {
        float slowRate = g_reverb.slowModRate;
        float TAU = (float)(2.0 * M_PI);
        g_reverb.slowModPhase1 += TAU * slowRate * blockPhaseInc;
        g_reverb.slowModPhase2 += TAU * slowRate * 1.37f * blockPhaseInc;
        if (g_reverb.slowModPhase1 > TAU) g_reverb.slowModPhase1 -= TAU;
        if (g_reverb.slowModPhase2 > TAU) g_reverb.slowModPhase2 -= TAU;

        float m1 = sinf(g_reverb.slowModPhase1);
        float m2 = sinf(g_reverb.slowModPhase2);

        blockFeedback = fminf(0.998f, blockFeedback * (1.0f + m1 * slowDepth * 0.06f * modAttenFactor));
        blockDampHigh = fmaxf(0.0f, fminf(1.0f, blockDampHigh + m2 * slowDepth * 0.15f * modAttenFactor));
    }

    // Shimmer
    float shimmerAmount = g_reverb.shimmerAmount;
    float shimmerFb = g_reverb.shimmerFeedback;
    const int shimmerGrainSize = 1024;
    const float shimmerPhaseInc = 1.0f / (float)shimmerGrainSize;

    // Reverse
    float reverseAmount = g_reverb.reverseAmount;
    int rCycleLen = g_reverb.reverseCycleLen;
    if (rCycleLen < 1) rCycleLen = 1;

    // Quality-dependent channel count
    int fdnCount;
    bool useMidDiff;
    if (g_reverb.quality == 0) {
        fdnCount = 16;
        useMidDiff = true;
    } else if (g_reverb.quality == 1) {
        fdnCount = 8;
        useMidDiff = false;
    } else {
        fdnCount = 4;
        useMidDiff = false;
    }
    bool isLite = (g_reverb.quality == 2);

    float hpC = fzRamp > 0.99f ? 1.0f : g_reverb.hpCoeff;
    // v5: input gain ramps down with freeze, optional bleed keeps a tiny amount
    float normalInputGain = (fdnCount >= 16 ? 0.10f : fdnCount >= 8 ? 0.10f : 0.20f);
    float freezeBleed = g_reverb.freezeInputBleed * normalInputGain;
    float inputGain = normalInputGain * (1.0f - fzRamp) + freezeBleed * fzRamp;

    // Chorus / drift / modulation params
    float chorusDepth = g_reverb.chorusDepth;
    int   modChar = g_reverb.modCharacter;
    float inputTone = g_reverb.inputTone;
    float tiltCoeff = g_reverb.tiltCoeff;

    // Update drift targets once per block
    if (modChar == 1 || modChar == 2) {
        float driftSmooth = 1.0f - expf(-2.0f * (float)M_PI * 0.5f / sr * (float)block_size);
        for (int j = 0; j < fdnCount; j++) {
            // Occasionally set new drift target
            if (fabsf(g_reverb.driftState[j] - g_reverb.driftTarget[j]) < 0.05f) {
                g_reverb.driftTarget[j] = g_reverb.driftRNG[j].nextFloat();
            }
            g_reverb.driftState[j] += (g_reverb.driftTarget[j] - g_reverb.driftState[j]) * driftSmooth;
        }
    }

    // v4 enhancement params
    float airAbsCoeff = 1.0f - g_reverb.airAbsorption * 0.6f;  // 1.0=transparent, 0.4=heavy treble loss
    int satMode = g_reverb.saturationMode;
    float erAmount = g_reverb.earlyReflections;

    // Predelay modulation: ±2ms at ~0.1 Hz for spatial movement
    float predelayModRate = 0.1f / sr;  // Hz / sampleRate
    float predelayModMaxSamples = 0.002f * sr;  // 2ms in samples

    // Velvet noise density: auto-computed from decay (only at very high decay)
    // v5: also inject during freeze for re-seeding (prevents dead texture)
    float velvetThreshold = 0.0f;
    if (fzRamp > 0.5f) {
        velvetThreshold = g_reverb.freezeVelvetDensity * fzRamp;
    } else if (blockFeedback > 0.92f) {
        velvetThreshold = (blockFeedback - 0.92f) * 12.5f * 0.015f;  // max ~1.5% density at decay=1
    }

    // Matrix rotation: slowly flip Hadamard signs for evolving spatial pattern
    float matrixRotInc = 1.0f / (sr * 25.0f);  // one flip per ~25 seconds

    // v5 enhanced freeze evolution: multi-rate LFO drift of in-loop allpass coefficients
    if (fzRamp > 0.1f) {
        float TAU = 2.0f * (float)M_PI;
        // LFO 1: 0.03 Hz — slow primary drift
        g_reverb.freezeAPPhase += 0.03f / sr;
        if (g_reverb.freezeAPPhase > 1.0f) g_reverb.freezeAPPhase -= 1.0f;
        // LFO 2: 0.07 Hz — secondary drift
        g_reverb.freezeEvoPhase2 += 0.07f / sr;
        if (g_reverb.freezeEvoPhase2 > 1.0f) g_reverb.freezeEvoPhase2 -= 1.0f;
        // LFO 3: 0.13 Hz — tertiary drift
        g_reverb.freezeEvoPhase3 += 0.13f / sr;
        if (g_reverb.freezeEvoPhase3 > 1.0f) g_reverb.freezeEvoPhase3 -= 1.0f;
        float evo1 = sinf(g_reverb.freezeAPPhase * TAU);
        float evo2 = sinf(g_reverb.freezeEvoPhase2 * TAU);
        float evo3 = sinf(g_reverb.freezeEvoPhase3 * TAU);
        // Combined drift with ramp scaling
        g_reverb.freezeAPDrift = fzRamp * 0.04f * (evo1 * 0.5f + evo2 * 0.3f + evo3 * 0.2f);
    } else {
        g_reverb.freezeAPDrift = 0.0f;
    }

    // === Sample loop ===
    for (int i = 0; i < block_size; i++) {
        float inL = g_reverb.inputBuf[i * 2];
        float inR = g_reverb.inputBuf[i * 2 + 1];

        // Input tone shaping
        if (inputTone != 0.0f) {
            inL = g_reverb.tiltL.process(inL, inputTone, tiltCoeff);
            inR = g_reverb.tiltR.process(inR, inputTone, tiltCoeff);
        }

        // Predelay with modulation + true stereo diffusion
        g_reverb.predelayL.write(inL);
        g_reverb.predelayR.write(inR);
        float delayedL, delayedR;
        if (g_reverb.predelaySamples > 0) {
            // Modulated predelay: ±2ms sine, decorrelated L vs R phase
            g_reverb.predelayModPhase += predelayModRate;
            if (g_reverb.predelayModPhase > 1.0f) g_reverb.predelayModPhase -= 1.0f;
            float modL = predelayModMaxSamples * sinf(g_reverb.predelayModPhase * 2.0f * (float)M_PI);
            float modR = predelayModMaxSamples * sinf((g_reverb.predelayModPhase + 0.37f) * 2.0f * (float)M_PI);
            float readL = (float)g_reverb.predelaySamples + modL;
            float readR = (float)g_reverb.predelaySamples + modR;
            if (readL < 1.0f) readL = 1.0f;
            if (readR < 1.0f) readR = 1.0f;
            delayedL = g_reverb.predelayL.readInterpolated(readL);
            delayedR = g_reverb.predelayR.readInterpolated(readR);
        } else {
            delayedL = inL;
            delayedR = inR;
        }

        // Write to early reflection buffers
        g_reverb.erDelayL.write(delayedL);
        g_reverb.erDelayR.write(delayedR);

        // Pre-diffusion
        float diffInL = g_reverb.preDiffL.process(delayedL);
        float diffInR = g_reverb.preDiffR.process(delayedR);

        // ── Read FDN delay lines with per-line modulation ──
        for (int j = 0; j < fdnCount; j++) {
            // Compute per-line modulation offset
            float modOffset = 0.0f;

            if (chorusDepth > 0.0f || modDepth > 0.0f) {
                // Sine component (per-line chorus)
                float sineVal = sinf(g_reverb.chorusPhases[j] * 2.0f * (float)M_PI);

                // Per-line depth variation via golden hash
                float lineDepth = chorusDepth * (0.7f + 0.6f * goldenHash(j));

                if (modChar == 0) {
                    // Pure sine
                    modOffset = sineVal * lineDepth;
                } else if (modChar == 1) {
                    // Pure drift
                    modOffset = g_reverb.driftState[j] * lineDepth;
                } else {
                    // Hybrid: 60% sine + 40% drift
                    modOffset = (sineVal * 0.6f + g_reverb.driftState[j] * 0.4f) * lineDepth;
                }

                // Add legacy global modulation on top
                modOffset += modDepth * g_reverb.fdnDelayTimes[j] * 0.015f
                           * sinf(g_reverb.chorusPhases[j] * 0.37f * 2.0f * (float)M_PI);
            }

            // Warp: DC offset on chorus modulation — compounds pitch bend per recirculation
            if (warpAmount > 0.0f) {
                float warpSign = (j % 2 == 0) ? 1.0f : -1.0f;
                float warpBase = fmaxf(chorusDepth, 8.0f);  // ensure warp works even with low chorus
                modOffset += warpAmount * warpBase * 2.0f * warpSign;
            }

            // Advance per-line phase
            g_reverb.chorusPhases[j] += g_reverb.chorusPhaseInc[j];
            if (g_reverb.chorusPhases[j] >= 1.0f) g_reverb.chorusPhases[j] -= 1.0f;

            float delayTime = g_reverb.fdnDelayTimes[j] + modOffset;
            if (delayTime < 1.0f) delayTime = 1.0f;

            // Multi-tap read: main tap + 2 golden-ratio positions for density
            if (!isLite) {
                float tap0 = g_reverb.fdnDelays[j].readInterpolated(delayTime);
                float tap1 = g_reverb.fdnDelays[j].readInterpolated(fmaxf(1.0f, delayTime * 0.618f));
                float tap2 = g_reverb.fdnDelays[j].readInterpolated(fmaxf(1.0f, delayTime * 0.382f));
                g_reverb.fdnReads[j] = tap0 * MULTITAP_GAINS[0]
                                      + tap1 * MULTITAP_GAINS[1]
                                      + tap2 * MULTITAP_GAINS[2];
            } else {
                g_reverb.fdnReads[j] = g_reverb.fdnDelays[j].readInterpolated(delayTime);
            }
        }

        // ── Multi-band damping + air absorption + HPF ──
        for (int j = 0; j < fdnCount; j++) {
            float damped = g_reverb.fdnDampers[j].process(
                g_reverb.fdnReads[j], blockDampLow, blockDampHigh, crossCoeff
            );
            // Air absorption: extra spectral tilt (treble loss) per recirculation
            if (g_reverb.airAbsorption > 0.01f) {
                damped = g_reverb.fdnAirAbs[j].process(damped, airAbsCoeff);
            }
            g_reverb.fdnDamped[j] = g_reverb.fdnHPFs[j].process(damped, hpC);
        }

        // ── Hadamard mixing ──
        if (fdnCount == 16) {
            mixFDN16(g_reverb.fdnDamped, g_reverb.fdnMixed);
        } else if (fdnCount == 8) {
            mixFDN8(g_reverb.fdnDamped, g_reverb.fdnMixed);
        } else {
            mixFDN4(g_reverb.fdnDamped, g_reverb.fdnMixed);
        }

        // ── In-loop allpass — smears transients inside recirculation ──
        for (int j = 0; j < fdnCount; j++) {
            // v5 freeze evolution: modulate allpass feedback for spectral drift (ramp-scaled)
            float fbOrig = g_reverb.fdnInLoopAP[j].fb;
            if (g_reverb.freezeAPDrift != 0.0f) {
                float perLineDrift = g_reverb.freezeAPDrift * (1.0f + 0.3f * goldenHash(j));
                g_reverb.fdnInLoopAP[j].fb = fmaxf(0.2f, fminf(0.75f, fbOrig + perLineDrift));
            }
            g_reverb.fdnMixed[j] = g_reverb.fdnInLoopAP[j].process(g_reverb.fdnMixed[j]);
            if (g_reverb.freezeAPDrift != 0.0f) g_reverb.fdnInLoopAP[j].fb = fbOrig;  // restore
        }

        // ── Matrix rotation: slowly evolving spatial pattern ──
        if (!isLite) {
            g_reverb.matrixRotPhase += matrixRotInc;
            if (g_reverb.matrixRotPhase >= 1.0f) {
                g_reverb.matrixRotPhase -= 1.0f;
                // Flip one channel's sign for slow spatial evolution
                int flipIdx = ((int)(g_reverb.velvetRNG.nextFloat() * (float)fdnCount)) % fdnCount;
                g_reverb.matrixSignFlip[flipIdx] ^= 1;
            }
            for (int j = 0; j < fdnCount; j++) {
                if (g_reverb.matrixSignFlip[j]) g_reverb.fdnMixed[j] = -g_reverb.fdnMixed[j];
            }
        }

        // ── Velvet noise injection: sparse impulses for density at high decay ──
        if (velvetThreshold > 0.0f) {
            for (int j = 0; j < fdnCount; j++) {
                if (g_reverb.velvetRNG.nextFloat() < velvetThreshold) {
                    float sign = (g_reverb.velvetRNG.nextFloat() > 0.5f) ? 1.0f : -1.0f;
                    g_reverb.fdnMixed[j] += sign * 0.001f;  // ~-60dB
                }
            }
        }

        // ── Mid-diffusion (Ultra only) ──
        float midL = 0.0f, midR = 0.0f;
        if (useMidDiff) {
            // Sum even channels for L, odd for R
            float sumL = 0.0f, sumR = 0.0f;
            for (int j = 0; j < fdnCount; j += 2) sumL += g_reverb.fdnMixed[j];
            for (int j = 1; j < fdnCount; j += 2) sumR += g_reverb.fdnMixed[j];
            float invHalf = 2.0f / (float)fdnCount;
            midL = g_reverb.midDiffL.process(sumL * invHalf);
            midR = g_reverb.midDiffR.process(sumR * invHalf);
        }

        // ── Shimmer ──
        float shimInL = 0.0f, shimInR = 0.0f;
        if (shimmerAmount > 0.0f) {
            int sBuf = SHIMMER_BUF_SIZE;
            float ratio = g_reverb.shimmerPitchRatio;

            // Grain 0
            float readOff0 = fmodf(g_reverb.shimmerPhase0 * shimmerGrainSize * ratio, (float)sBuf);
            float ri0 = fmodf((float)(g_reverb.shimmerWriteIdx - shimmerGrainSize + sBuf)
                              + readOff0, (float)sBuf);
            int ri0i = (int)ri0;
            float ri0f = ri0 - (float)ri0i;
            int ri0n = (ri0i + 1) % sBuf;
            float env0 = sinf(g_reverb.shimmerPhase0 * (float)M_PI);
            shimInL = (g_reverb.shimmerBufL[ri0i]
                     + ri0f * (g_reverb.shimmerBufL[ri0n] - g_reverb.shimmerBufL[ri0i])) * env0;
            shimInR = (g_reverb.shimmerBufR[ri0i]
                     + ri0f * (g_reverb.shimmerBufR[ri0n] - g_reverb.shimmerBufR[ri0i])) * env0;

            // Grain 1
            float readOff1 = fmodf(g_reverb.shimmerPhase1 * shimmerGrainSize * ratio, (float)sBuf);
            float ri1 = fmodf((float)(g_reverb.shimmerWriteIdx - shimmerGrainSize + sBuf)
                              + readOff1, (float)sBuf);
            int ri1i = (int)ri1;
            float ri1f = ri1 - (float)ri1i;
            int ri1n = (ri1i + 1) % sBuf;
            float env1 = sinf(g_reverb.shimmerPhase1 * (float)M_PI);
            shimInL += (g_reverb.shimmerBufL[ri1i]
                      + ri1f * (g_reverb.shimmerBufL[ri1n] - g_reverb.shimmerBufL[ri1i])) * env1;
            shimInR += (g_reverb.shimmerBufR[ri1i]
                      + ri1f * (g_reverb.shimmerBufR[ri1n] - g_reverb.shimmerBufR[ri1i])) * env1;

            // Scale shimmer injection by channel count — more channels = less per-channel shimmer
            float shimScale = (fdnCount >= 16) ? 0.15f : (fdnCount >= 8) ? 0.30f : 0.35f;
            shimInL *= shimmerAmount * shimScale;
            shimInR *= shimmerAmount * shimScale;

            g_reverb.shimmerPhase0 += shimmerPhaseInc;
            g_reverb.shimmerPhase1 += shimmerPhaseInc;
            if (g_reverb.shimmerPhase0 >= 1.0f) g_reverb.shimmerPhase0 -= 1.0f;
            if (g_reverb.shimmerPhase1 >= 1.0f) g_reverb.shimmerPhase1 -= 1.0f;
        }

        // ── Write back: input + shimmer + shimmer-feedback + mixing feedback ──
        int halfCount = fdnCount >> 1;
        for (int j = 0; j < fdnCount; j++) {
            float dryInject = (j < halfCount) ? diffInL * inputGain : diffInR * inputGain;

            // Cross-feed: inject opposite-side signal for stereo thickening
            if (crossFeedAmt > 0.0f) {
                float otherInject = (j < halfCount) ? diffInR : diffInL;
                dryInject += otherInject * crossFeedAmt * inputGain * 0.3f;
            }

            float shimInject = (j < halfCount) ? shimInL : shimInR;

            // Shimmer feedback: compound pitch shifting (shimmer feeds back into FDN)
            float shimFbInject = 0.0f;
            if (shimmerFb > 0.0f && shimmerAmount > 0.0f) {
                shimFbInject = shimInject * shimmerFb * 0.2f;
            }

            float value = softClip(
                g_reverb.fdnMixed[j] * blockFeedback
                + dryInject
                + shimInject
                + shimFbInject
            , satMode);
            // NaN/Inf guard — prevent corrupted delay lines from poisoning the entire FDN
            if (!(value == value) || value > 1e15f || value < -1e15f) value = 0.0f;
            g_reverb.fdnDelays[j].write(value);
        }

        // ── Output tapping with stereo decorrelation ──
        float rawL = 0.0f, rawR = 0.0f;
        if (fdnCount == 16) {
            // True decorrelation: separate normalized L/R tap arrays
            for (int j = 0; j < 16; j++) {
                rawL += g_reverb.fdnReads[j] * STEREO_TAPS_L[j];
                rawR += g_reverb.fdnReads[j] * STEREO_TAPS_R[j];
            }
        } else if (fdnCount == 8) {
            // Decorrelated 8-ch tapping
            rawL = (g_reverb.fdnReads[0] + g_reverb.fdnReads[2]
                  + g_reverb.fdnReads[4] + g_reverb.fdnReads[6]
                  + g_reverb.fdnReads[3] * 0.3f + g_reverb.fdnReads[5] * 0.2f) * 0.45f;
            rawR = (g_reverb.fdnReads[1] + g_reverb.fdnReads[3]
                  + g_reverb.fdnReads[5] + g_reverb.fdnReads[7]
                  + g_reverb.fdnReads[2] * 0.3f + g_reverb.fdnReads[4] * 0.2f) * 0.45f;
        } else {
            rawL = (g_reverb.fdnReads[0] + g_reverb.fdnReads[2]
                  + g_reverb.fdnReads[1] * 0.3f) * 0.7f;
            rawR = (g_reverb.fdnReads[1] + g_reverb.fdnReads[3]
                  + g_reverb.fdnReads[0] * 0.3f) * 0.7f;
        }

        // Mid-diffusion blend (additive — preserves main signal level)
        if (useMidDiff) {
            rawL += midL * 0.15f;
            rawR += midR * 0.15f;
        }

        // Early reflections: sparse taps from ER buffers
        if (erAmount > 0.0f) {
            float erL = 0.0f, erR = 0.0f;
            for (int t = 0; t < ER_TAP_COUNT; t++) {
                int sampL = (int)(ER_TIMES_L[t] * 0.001f * sr);
                int sampR = (int)(ER_TIMES_R[t] * 0.001f * sr);
                if (sampL < 1) sampL = 1;
                if (sampR < 1) sampR = 1;
                erL += g_reverb.erDelayL.read(sampL) * ER_GAINS[t];
                erR += g_reverb.erDelayR.read(sampR) * ER_GAINS[t];
            }
            rawL += erL * erAmount * 0.12f;
            rawR += erR * erAmount * 0.12f;
        }

        // Post-diffusion
        rawL = g_reverb.postDiffL.process(rawL);
        rawR = g_reverb.postDiffR.process(rawR);

        // Shimmer buffer write (source for shimmer grain reader)
        if (shimmerAmount > 0.0f) {
            g_reverb.shimmerBufL[g_reverb.shimmerWriteIdx] = rawL;
            g_reverb.shimmerBufR[g_reverb.shimmerWriteIdx] = rawR;
            g_reverb.shimmerWriteIdx = (g_reverb.shimmerWriteIdx + 1) % SHIMMER_BUF_SIZE;
        }

        // Reverse tail
        if (reverseAmount > 0.0f) {
            g_reverb.reverseBufL[g_reverb.reverseWriteIdx] = rawL;
            g_reverb.reverseBufR[g_reverb.reverseWriteIdx] = rawR;

            int readIdx = (g_reverb.reverseWriteIdx
                         - (int)g_reverb.reverseReadPhase + rCycleLen) % rCycleLen;
            float envPos = g_reverb.reverseEnvPhase / (float)rCycleLen;
            float env = sinf(envPos * (float)M_PI);
            rawL += g_reverb.reverseBufL[readIdx] * env * reverseAmount;
            rawR += g_reverb.reverseBufR[readIdx] * env * reverseAmount;

            g_reverb.reverseReadPhase += 1.0f;
            g_reverb.reverseEnvPhase += 1.0f;
            if (g_reverb.reverseEnvPhase >= (float)rCycleLen) {
                g_reverb.reverseEnvPhase = 0.0f;
                g_reverb.reverseReadPhase = 0.0f;
            }
            g_reverb.reverseWriteIdx = (g_reverb.reverseWriteIdx + 1) % rCycleLen;
        }

        // DC blocking
        rawL = g_reverb.dcBlockerL.process(rawL);
        rawR = g_reverb.dcBlockerR.process(rawR);

        // Safety limiter — hard clamp to prevent speaker damage
        if (rawL > 0.95f) rawL = 0.95f;
        else if (rawL < -0.95f) rawL = -0.95f;
        if (rawR > 0.95f) rawR = 0.95f;
        else if (rawR < -0.95f) rawR = -0.95f;

        // Stereo width (mid-side)
        float mid  = (rawL + rawR) * 0.5f;
        float side = (rawL - rawR) * 0.5f;
        g_reverb.outputBuf[i * 2]     = mid + side * width;
        g_reverb.outputBuf[i * 2 + 1] = mid - side * width;
    }
}
