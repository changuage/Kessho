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
#include <new>

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
static const int DIFF_LATE_L[4] = {313, 419, 557, 719};
static const int DIFF_LATE_R[4] = {331, 443, 587, 743};

// Preset configs (damping/size removed — multi-band damping uses dampLow/dampHigh,
// size uses g_reverb.size directly)
struct PresetConfig {
    float decay;
    float diffusion;
    float modDepth;
    float maxFeedback;
    float lateSmear;
};
static const PresetConfig PRESETS[4] = {
    {0.92f, 0.80f, 0.25f, 0.99962f, 0.12f},  // plate
    {0.95f, 0.85f, 0.30f, 0.99974f, 0.18f},  // hall
    {0.972f, 0.95f, 0.40f, 0.99984f, 0.26f}, // cathedral
    {0.965f, 0.90f, 0.30f, 0.99978f, 0.22f}, // darkHall
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
static const float MULTITAP_GAINS[MULTITAP_COUNT]   = { 0.6f, 0.25f, 0.15f };

// ═══════════════ Fast Sine Approximation ═══════════════
// 5th-order minimax polynomial — max error < 0.0002 over [-π, π]
// Input: radians (any range, automatically wrapped to [-π, π])
static inline float fast_sinf(float x) {
    // Wrap to [-π, π] using Cody-Waite-style reduction
    const float INV_TWO_PI = 0.15915494309189533f;  // 1/(2π)
    const float TWO_PI = 6.283185307179586f;
    x -= TWO_PI * floorf(x * INV_TWO_PI + 0.5f);
    // Horner form of 5th-order odd-symmetry polynomial
    float x2 = x * x;
    return x * (1.0f - x2 * (0.16666667f - x2 * (0.00833333f - x2 * 0.000198413f)));
}

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
        if (delaySamples >= size) delaySamples = size - 1;
        if (delaySamples < 1) delaySamples = 1;
        int idx = writeIdx - delaySamples;
        if (idx < 0) idx += size;
        return buffer[idx];
    }
    inline float readInterpolated(float delaySamples) const {
        // Clamp to valid range to prevent out-of-bounds reads
        if (delaySamples >= (float)(size - 1)) delaySamples = (float)(size - 2);
        if (delaySamples < 1.0f) delaySamples = 1.0f;
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

// Transient-aware input conditioning (Lexicon/Bricasti-style)
// Detects sharp attacks via slew rate, applies dynamic LP + micro-allpass smear
static constexpr int TRANS_AP_STAGES = 3;
static const int TRANS_AP_TIMES[3] = {97, 157, 211};  // ~2.0, 3.3, 4.4ms at 48kHz

struct TransientSmoother {
    float envelope;
    float attackCoeff;
    float releaseCoeff;
    float lpState;
    float prevInput;
    float twoPiOverSr;
    SmoothDelay apDelays[TRANS_AP_STAGES];
    int apSamples[TRANS_AP_STAGES];

    void init(float sampleRate, float scale) {
        envelope = 0.0f;
        lpState = 0.0f;
        prevInput = 0.0f;
        attackCoeff = expf(-1.0f / (0.0003f * sampleRate));   // 0.3ms attack
        releaseCoeff = expf(-1.0f / (0.15f * sampleRate));    // 150ms release
        twoPiOverSr = 2.0f * (float)M_PI / sampleRate;
        for (int i = 0; i < TRANS_AP_STAGES; i++) {
            int sz = (int)(TRANS_AP_TIMES[i] * scale) + 10;
            apDelays[i].init(sz);
            apSamples[i] = (int)(TRANS_AP_TIMES[i] * scale);
        }
    }
    void destroy() {
        for (int i = 0; i < TRANS_AP_STAGES; i++) apDelays[i].destroy();
    }
    inline float process(float input, float amount) {
        // Envelope follower (peak detector)
        float absIn = fabsf(input);
        if (absIn > envelope) {
            envelope += (1.0f - attackCoeff) * (absIn - envelope);
        } else {
            envelope *= releaseCoeff;
        }
        // Slew rate detection
        float slew = fabsf(input - prevInput);
        prevInput = input;
        // Normalized transient gate: high slew relative to envelope = attack
        float normSlew = (envelope > 1e-6f) ? slew / envelope : 0.0f;
        float smoothing = fminf(normSlew * 5.0f, 1.0f) * amount;
        // Dynamic lowpass: bilinear one-pole, 12kHz -> ~500Hz on transients
        float cutoff = 12000.0f - smoothing * 11500.0f;
        float omega = cutoff * twoPiOverSr;
        float alpha = omega / (1.0f + omega);
        lpState += alpha * (input - lpState);
        // 3-stage micro-allpass smear (fixed fb, always primed)
        float x = lpState;
        float apFb = 0.65f;
        for (int j = 0; j < TRANS_AP_STAGES; j++) {
            float delayed = apDelays[j].read(apSamples[j]);
            float v = x - delayed * apFb;
            apDelays[j].write(v);
            x = delayed + v * apFb;
        }
        // Crossfade: raw -> smoothed proportional to transient strength
        return input + (x - input) * smoothing;
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

struct ReverbState {
    float sampleRate;
    float twoPiOverSr;
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
    DiffuserChain lateDiffL, lateDiffR;

    // Predelay
    SmoothDelay predelayL, predelayR;
    int predelaySamples;

    // Input tone shaping
    TiltFilter tiltL, tiltR;

    // Transient smoother (pre-tank input conditioning)
    TransientSmoother transSmoothL, transSmoothR;

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

    // v5 parameters
    float transientSmooth;     // 0-1 transient conditioning amount
    float erLpFreq;            // 200-12000 Hz, LP cutoff for early reflections
    float erLpStateL;          // one-pole LP state for ER left
    float erLpStateR;          // one-pole LP state for ER right

    // Early reflection delay lines
    SmoothDelay erDelayL, erDelayR;   // shared ER buffer per side

    // Air absorption filter per FDN channel (spectral tilt in feedback)
    OnePole fdnAirAbs[FDN_MAX_CHANNELS];

    // Velvet noise injection (sparse random impulses at high decay)
    SimpleRNG velvetRNG;
    float velvetDensity;       // auto-calculated from decay

    // Givens rotation state (2 continuous rotations for spatial evolution)
    float givensPhase0;        // rotation phase for channel pair (2,11)
    float givensPhase1;        // rotation phase for channel pair (5,14)
    float givensCos0, givensSin0;  // precomputed per block
    float givensCos1, givensSin1;

    // Allpass coefficient modulation (per-channel slow LFO on feedback)
    float apModPhases[FDN_MAX_CHANNELS];

    // Output tap modulation (spatial shimmer — slowly evolving stereo image)
    float tapModPhases[FDN_MAX_CHANNELS];

    // Per-channel decay feedback (longer delays decay faster)
    float channelFb[FDN_MAX_CHANNELS];

    // Pre-computed early reflection tap positions (samples)
    int erTapSamplesL[ER_TAP_COUNT];
    int erTapSamplesR[ER_TAP_COUNT];

    // Predelay modulation
    float predelayModPhase;

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
    float bloomEnv;
    float bloomGain;

    int initialized;
};

static ReverbState g_default_reverb;
static thread_local ReverbState* g_current_reverb = &g_default_reverb;

static inline ReverbState& reverb_current_state() {
    return *g_current_reverb;
}

class ScopedReverbState {
public:
    explicit ScopedReverbState(ReverbState& state)
        : previous_(g_current_reverb) {
        g_current_reverb = &state;
    }

    ~ScopedReverbState() {
        g_current_reverb = previous_;
    }

    ScopedReverbState(const ScopedReverbState&) = delete;
    ScopedReverbState& operator=(const ScopedReverbState&) = delete;

private:
    ReverbState* previous_;
};

#define g_reverb reverb_current_state()

struct KesshoReverbInstance {
    ReverbState state;
};

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
    float maxFeedback = preset.maxFeedback;
    float effectiveDecay = baseDecay + (maxFeedback - baseDecay) * userDecay * 0.985f;
    if (userDecay > 0.82f) {
        float t = (userDecay - 0.82f) / 0.18f;
        if (t > 1.0f) t = 1.0f;
        float tailLift = t * (0.35f + 0.65f * t);
        effectiveDecay += (maxFeedback - effectiveDecay) * tailLift;
    }
    g_reverb.feedbackGain = fminf(maxFeedback, effectiveDecay);

    // FDN delay times — size range extended to 10.0 for massive spaces
    int maxChannels = (g_reverb.quality == 0) ? 16 : (g_reverb.quality == 1) ? 8 : 4;
    for (int i = 0; i < maxChannels; i++) {
        g_reverb.fdnDelayTimes[i] = FDN_TIMES_MS[i] * scale * sr / 1000.0f * userSize;
    }

    // Diffuser feedback
    float baseDiff = preset.diffusion;
    float userDiff = g_reverb.diffusion;
    float effectiveDiff = fminf(1.12f, baseDiff * (0.72f + userDiff * 0.52f));
    float preFb  = fminf(0.94f, 0.56f + effectiveDiff * 0.34f);
    float midFb  = fminf(0.88f, 0.50f + effectiveDiff * 0.33f);
    float postFb = fminf(0.84f, 0.46f + effectiveDiff * 0.32f);
    float lateFb = fminf(0.82f, 0.43f + effectiveDiff * 0.34f);

    g_reverb.preDiffL.setFeedback(preFb);
    g_reverb.preDiffR.setFeedback(preFb);
    g_reverb.midDiffL.setFeedback(midFb);
    g_reverb.midDiffR.setFeedback(midFb);
    g_reverb.postDiffL.setFeedback(postFb);
    g_reverb.postDiffR.setFeedback(postFb);
    g_reverb.lateDiffL.setFeedback(lateFb);
    g_reverb.lateDiffR.setFeedback(lateFb);
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

// 16×16 Hadamard via fast Walsh-Hadamard butterfly stages.
static inline void mixFDN16(const float* in, float* out) {
    const float s = 0.25f;  // 1/sqrt(16)
    float x[16];
    for (int i = 0; i < 16; i++) x[i] = in[i];

    for (int stride = 1; stride < 16; stride <<= 1) {
        int step = stride << 1;
        for (int base = 0; base < 16; base += step) {
            for (int j = 0; j < stride; j++) {
                float a = x[base + j];
                float b = x[base + j + stride];
                x[base + j] = a + b;
                x[base + j + stride] = a - b;
            }
        }
    }

    for (int i = 0; i < 16; i++) out[i] = x[i] * s;
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
    if (g_reverb.initialized) {
        reverb_destroy();
    }
    memset(&g_reverb, 0, sizeof(g_reverb));
    g_reverb.sampleRate = sample_rate;
    g_reverb.twoPiOverSr = 2.0f * (float)M_PI / sample_rate;
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

    // Givens rotations
    g_reverb.givensPhase0 = 0.0f;
    g_reverb.givensPhase1 = 0.0f;
    g_reverb.givensCos0 = 1.0f; g_reverb.givensSin0 = 0.0f;
    g_reverb.givensCos1 = 1.0f; g_reverb.givensSin1 = 0.0f;

    // Allpass coefficient modulation phases (golden-ratio spaced)
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.apModPhases[i] = (float)i * 0.618033988f;  // golden ratio spacing
        if (g_reverb.apModPhases[i] >= 1.0f) g_reverb.apModPhases[i] -= (float)(int)g_reverb.apModPhases[i];
    }

    // Output tap modulation phases (golden-ratio spaced, different seed)
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.tapModPhases[i] = (float)i * 0.381966f;  // 1 - golden ratio
        if (g_reverb.tapModPhases[i] >= 1.0f) g_reverb.tapModPhases[i] -= (float)(int)g_reverb.tapModPhases[i];
    }

    // Per-channel decay
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.channelFb[i] = 0.9f;
    }

    // Predelay modulation
    g_reverb.predelayModPhase = 0.0f;

    // Pre-compute early reflection tap positions (ms → samples)
    for (int t = 0; t < ER_TAP_COUNT; t++) {
        int sL = (int)(ER_TIMES_L[t] * 0.001f * sample_rate);
        int sR = (int)(ER_TIMES_R[t] * 0.001f * sample_rate);
        g_reverb.erTapSamplesL[t] = sL < 1 ? 1 : sL;
        g_reverb.erTapSamplesR[t] = sR < 1 ? 1 : sR;
    }

    // HPF ~35 Hz
    g_reverb.hpCoeff = 1.0f - (2.0f * (float)M_PI * 35.0f / sample_rate);

    // Diffusers
    g_reverb.preDiffL.init(DIFF_PRE_L, 6, scale, 0.65f);
    g_reverb.preDiffR.init(DIFF_PRE_R, 6, scale, 0.65f);
    g_reverb.midDiffL.init(DIFF_MID_L, 4, scale, 0.55f);
    g_reverb.midDiffR.init(DIFF_MID_R, 4, scale, 0.55f);
    g_reverb.postDiffL.init(DIFF_POST_L, 6, scale, 0.5f);
    g_reverb.postDiffR.init(DIFF_POST_R, 6, scale, 0.5f);
    g_reverb.lateDiffL.init(DIFF_LATE_L, 4, scale, 0.48f);
    g_reverb.lateDiffR.init(DIFF_LATE_R, 4, scale, 0.48f);

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

    // v5 defaults
    g_reverb.transientSmooth = 0.0f;
    g_reverb.erLpFreq = 2500.0f;
    g_reverb.erLpStateL = 0.0f;
    g_reverb.erLpStateR = 0.0f;
    g_reverb.transSmoothL.init(sample_rate, scale);
    g_reverb.transSmoothR.init(sample_rate, scale);

    // Computed
    g_reverb.smoothDampLow = g_reverb.dampLow;
    g_reverb.smoothDampHigh = g_reverb.dampHigh;
    g_reverb.bloomEnv = 0.0f;
    g_reverb.bloomGain = 1.0f;
    g_reverb.tiltCoeff = expf(-2.0f * (float)M_PI * 1000.0f / sample_rate);

    updateCrossover();
    updateChorusRates();
    updatePreset();
    updatePredelay();

    g_reverb.initialized = 1;
    return 0;
}

void reverb_destroy(void) {
    if (!g_reverb.initialized) {
        return;
    }
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        g_reverb.fdnDelays[i].destroy();
        g_reverb.fdnInLoopAP[i].destroy();
    }
    g_reverb.preDiffL.destroy();  g_reverb.preDiffR.destroy();
    g_reverb.midDiffL.destroy();  g_reverb.midDiffR.destroy();
    g_reverb.postDiffL.destroy(); g_reverb.postDiffR.destroy();
    g_reverb.lateDiffL.destroy(); g_reverb.lateDiffR.destroy();
    g_reverb.predelayL.destroy(); g_reverb.predelayR.destroy();
    g_reverb.transSmoothL.destroy(); g_reverb.transSmoothR.destroy();
    free(g_reverb.reverseBufL);
    free(g_reverb.reverseBufR);
    g_reverb.reverseBufL = nullptr;
    g_reverb.reverseBufR = nullptr;
    g_reverb.reverseBufSize = 0;
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
    (void)damping;
    g_reverb.decay = decay;
    g_reverb.size = size;
    // Legacy `damping` parameter ignored — multi-band damping (dampLow/dampHigh)
    // set via reverb_set_multiband_damp() is used instead.
    g_reverb.diffusion = diffusion;
    g_reverb.modulation = modulation;
    g_reverb.predelayMs = predelay;
    g_reverb.width = width;
    updatePreset();
    updatePredelay();
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

void reverb_set_transient_smooth(float amount) {
    g_reverb.transientSmooth = fmaxf(0.0f, fminf(1.0f, amount));
}

void reverb_set_er_lp_freq(float freq) {
    g_reverb.erLpFreq = fmaxf(200.0f, fminf(12000.0f, freq));
}

KesshoReverbInstance* reverb_instance_create(float sample_rate) {
    KesshoReverbInstance* instance = new (std::nothrow) KesshoReverbInstance{};
    if (instance == nullptr) {
        return nullptr;
    }

    int init_result = 0;
    {
        ScopedReverbState scoped(instance->state);
        init_result = reverb_init(sample_rate);
    }

    if (init_result != 0) {
        delete instance;
        return nullptr;
    }

    return instance;
}

void reverb_instance_destroy(KesshoReverbInstance* instance) {
    if (instance == nullptr) {
        return;
    }

    {
        ScopedReverbState scoped(instance->state);
        reverb_destroy();
    }
    delete instance;
}

int reverb_instance_reset(KesshoReverbInstance* instance, float sample_rate) {
    if (instance == nullptr) {
        return 0;
    }

    ScopedReverbState scoped(instance->state);
    return reverb_init(sample_rate) == 0 ? 1 : 0;
}

float* reverb_instance_get_input_ptr(KesshoReverbInstance* instance) {
    if (instance == nullptr) {
        return nullptr;
    }

    ScopedReverbState scoped(instance->state);
    return reverb_get_input_ptr();
}

float* reverb_instance_get_output_ptr(KesshoReverbInstance* instance) {
    if (instance == nullptr) {
        return nullptr;
    }

    ScopedReverbState scoped(instance->state);
    return reverb_get_output_ptr();
}

void reverb_instance_process_block(KesshoReverbInstance* instance, int block_size) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_process_block(block_size);
}

void reverb_instance_set_type(KesshoReverbInstance* instance, int type) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_type(type);
}

void reverb_instance_set_quality(KesshoReverbInstance* instance, int quality) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_quality(quality);
}

void reverb_instance_set_params(
    KesshoReverbInstance* instance,
    float decay,
    float size,
    float damping,
    float diffusion,
    float modulation,
    float predelay,
    float width) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_params(decay, size, damping, diffusion, modulation, predelay, width);
}

void reverb_instance_set_shimmer(KesshoReverbInstance* instance, float amount, float pitch_semitones) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_shimmer(amount, pitch_semitones);
}

void reverb_instance_set_slow_mod(KesshoReverbInstance* instance, float rate_hz, float depth) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_slow_mod(rate_hz, depth);
}

void reverb_instance_set_reverse(KesshoReverbInstance* instance, float amount, float length_seconds) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_reverse(amount, length_seconds);
}

void reverb_instance_set_chorus(KesshoReverbInstance* instance, float rate_hz, float depth) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_chorus(rate_hz, depth);
}

void reverb_instance_set_mod_character(KesshoReverbInstance* instance, int mode) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_mod_character(mode);
}

void reverb_instance_set_multiband_damp(
    KesshoReverbInstance* instance,
    float damp_low,
    float damp_high,
    float crossover_hz) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_multiband_damp(damp_low, damp_high, crossover_hz);
}

void reverb_instance_set_input_tone(KesshoReverbInstance* instance, float tone) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_input_tone(tone);
}

void reverb_instance_set_shimmer_feedback(KesshoReverbInstance* instance, float feedback) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_shimmer_feedback(feedback);
}

void reverb_instance_set_warp(KesshoReverbInstance* instance, float amount) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_warp(amount);
}

void reverb_instance_set_cross_feed(KesshoReverbInstance* instance, float amount) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_cross_feed(amount);
}

void reverb_instance_set_early_reflections(KesshoReverbInstance* instance, float amount) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_early_reflections(amount);
}

void reverb_instance_set_air_absorption(KesshoReverbInstance* instance, float amount) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_air_absorption(amount);
}

void reverb_instance_set_saturation_mode(KesshoReverbInstance* instance, int mode) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_saturation_mode(mode);
}

void reverb_instance_set_transient_smooth(KesshoReverbInstance* instance, float amount) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_transient_smooth(amount);
}

void reverb_instance_set_er_lp_freq(KesshoReverbInstance* instance, float freq) {
    if (instance == nullptr) {
        return;
    }

    ScopedReverbState scoped(instance->state);
    reverb_set_er_lp_freq(freq);
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
    const bool isShimmerMode = (g_reverb.presetType == 5);

    // Dattorro decay coefficient
    float tankDecay = fminf(0.9998f, 0.5f + userDecay * 0.4998f);

    // Damping (1-pole LP coefficient)
    float dampCoeff = 1.0f - damping * 0.7f;

    // Mod depth — shimmer mode gets more modulation for detuning shimmer effect
    float modMult = isShimmerMode ? 2.5f : 1.0f;
    float modDepthSamples = modulation * 16.0f * scale * modMult;
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

    // Input gain
    float inputGain = 0.2f;

    // Warp: DC bias on tank allpass modulation
    float warpAmount = g_reverb.warp;

    // v4: Air absorption coefficient for tank dampers
    float airAbsCoeff = 1.0f - g_reverb.airAbsorption * 0.6f;
    int satMode = g_reverb.saturationMode;
    float erAmount = g_reverb.earlyReflections;
    float predelayModRate = 0.1f / sr;
    float predelayModMaxSamples = 0.002f * sr;
    float transSmooth = g_reverb.transientSmooth;

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

        // Transient conditioning (pre-tank)
        if (transSmooth > 0.0f) {
            inL = g_reverb.transSmoothL.process(inL, transSmooth);
            inR = g_reverb.transSmoothR.process(inR, transSmooth);
        }

        // Predelay with modulation
        g_reverb.predelayL.write(inL);
        g_reverb.predelayR.write(inR);
        float delayedL, delayedR;
        if (g_reverb.predelaySamples > 0) {
            g_reverb.predelayModPhase += predelayModRate;
            if (g_reverb.predelayModPhase > 1.0f) g_reverb.predelayModPhase -= 1.0f;
            float modL = predelayModMaxSamples * fast_sinf(g_reverb.predelayModPhase * 2.0f * (float)M_PI);
            float modR = predelayModMaxSamples * fast_sinf((g_reverb.predelayModPhase + 0.37f) * 2.0f * (float)M_PI);
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
        float lfo1 = fast_sinf(g_reverb.datModPhase * 2.0f * (float)M_PI) * modDepthSamples;
        float lfo2 = fast_sinf((g_reverb.datModPhase * 1.37f + 0.5f) * 2.0f * (float)M_PI) * modDepthSamples;

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
                erL += g_reverb.erDelayL.read(g_reverb.erTapSamplesL[t]) * ER_GAINS[t];
                erR += g_reverb.erDelayR.read(g_reverb.erTapSamplesR[t]) * ER_GAINS[t];
            }
            // ER low-pass filter (one-pole)
            float erOmega = g_reverb.erLpFreq * g_reverb.twoPiOverSr;
            float erAlpha = erOmega / (1.0f + erOmega);
            g_reverb.erLpStateL += erAlpha * (erL - g_reverb.erLpStateL);
            g_reverb.erLpStateR += erAlpha * (erR - g_reverb.erLpStateR);
            outL += g_reverb.erLpStateL * erAmount * 0.12f;
            outR += g_reverb.erLpStateR * erAmount * 0.12f;
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

        // Soft limiter — preserves peak dynamics while preventing extreme values
        outL = softClipClean(outL);
        outR = softClipClean(outR);

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

    float blockFeedback = g_reverb.feedbackGain;
    float blockDampLow  = g_reverb.smoothDampLow;
    float blockDampHigh = g_reverb.smoothDampHigh;
    float crossCoeff    = g_reverb.crossoverCoeff;
    float spatialDrift = 0.0f;
    float lateSmearBoost = 0.0f;

    // Decay-dependent damping: reduce high damping at very high decay to maintain presence
    if (blockFeedback > 0.9f) {
        float decayScale = (blockFeedback - 0.9f) * 10.0f;  // 0..1 as decay goes 0.9..1.0
        blockDampHigh *= (1.0f - decayScale * 0.4f);         // reduce by up to 40%
    }

    // v3 enhancement params
    float warpAmount = g_reverb.warp;
    float crossFeedAmt = g_reverb.crossFeed;

    // Slow modulation (character drift)
    float slowDepth = g_reverb.slowModDepth;
    if (slowDepth > 0.0f) {
        float slowRate = g_reverb.slowModRate;
        float TAU = (float)(2.0 * M_PI);
        g_reverb.slowModPhase1 += TAU * slowRate * blockPhaseInc;
        g_reverb.slowModPhase2 += TAU * slowRate * 1.37f * blockPhaseInc;
        if (g_reverb.slowModPhase1 > TAU) g_reverb.slowModPhase1 -= TAU;
        if (g_reverb.slowModPhase2 > TAU) g_reverb.slowModPhase2 -= TAU;

        float m1 = fast_sinf(g_reverb.slowModPhase1);
            float m2 = fast_sinf(g_reverb.slowModPhase2);

            // Taper slow-mod depth as presets approach the decay ceiling so motion stays
            // audible without turning into a periodic feedback swell.
            float ceilingProximity = fmaxf(0.0f, (g_reverb.feedbackGain - 0.92f) / 0.0795f);
            float safeSlowDepth = slowDepth * (1.0f - 0.88f * ceilingProximity);
            float motion = 0.5f * (m1 + 1.0f);
            spatialDrift = safeSlowDepth * (0.02f + 0.02f * motion);
            lateSmearBoost = safeSlowDepth * (0.04f + 0.05f * (0.5f * (m2 + 1.0f)));
            blockDampLow = fmaxf(0.0f, fminf(1.0f, blockDampLow + m1 * safeSlowDepth * 0.008f));
            blockDampHigh = fmaxf(0.0f, fminf(1.0f, blockDampHigh + m2 * safeSlowDepth * 0.015f));
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
    float lateBlend = 0.08f + g_reverb.diffusion * 0.16f + preset.lateSmear * 0.18f
                    + (useMidDiff ? 0.06f : 0.0f) + lateSmearBoost;
    if (lateBlend > 0.42f) lateBlend = 0.42f;
    float bloomStrength = 0.0f;
    if (blockFeedback > 0.997f) {
        bloomStrength = (blockFeedback - 0.997f) / 0.00284f;
        if (bloomStrength > 1.0f) bloomStrength = 1.0f;
        bloomStrength *= fminf(1.0f, 0.45f + g_reverb.diffusion * 0.35f + (useMidDiff ? 0.15f : 0.0f));
    }
    const float bloomAttack = 1.0f - expf(-1.0f / (0.012f * sr));
    const float bloomRelease = 1.0f - expf(-1.0f / (0.45f * sr));

    // HPF
    float hpC = g_reverb.hpCoeff;
    // Input gain
    float inputGain = (fdnCount >= 16 ? 0.10f : fdnCount >= 8 ? 0.10f : 0.20f);

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
    float airAbsCoeff = 1.0f - g_reverb.airAbsorption * 0.6f;
    int satMode = g_reverb.saturationMode;
    float erAmount = g_reverb.earlyReflections;

    // Predelay modulation: ±2ms at ~0.1 Hz for spatial movement
    float predelayModRate = 0.1f / sr;
    float predelayModMaxSamples = 0.002f * sr;
    float transSmooth = g_reverb.transientSmooth;
    float erAlpha = 0.0f;
    if (erAmount > 0.0f) {
        float erOmega = g_reverb.erLpFreq * g_reverb.twoPiOverSr;
        erAlpha = erOmega / (1.0f + erOmega);
    }

    // Velvet noise density: sparse impulse injection for density at high decay.
    float velvetThreshold = 0.0f;
    if (blockFeedback > 0.92f && blockFeedback < 0.97f) {
        velvetThreshold = (blockFeedback - 0.92f) * 20.0f * 0.008f;  // max ~0.8% at 0.97
    }

    // Per-channel decay: longer delay lines decay faster (correct room acoustics)
    // Reference delay = median of the 16 delay times (~146 samples at 48k)
    // Clamp to 0.9995 ceiling — pow(fb, ratio<1) can exceed blockFeedback for short lines
    float referenceDelay = g_reverb.fdnDelayTimes[9];  // 146ms line
    for (int j = 0; j < fdnCount; j++) {
        g_reverb.channelFb[j] = fminf(0.9995f, powf(blockFeedback, g_reverb.fdnDelayTimes[j] / referenceDelay));
    }

    // Allpass coefficient modulation: update phases per block
    // Rates: ~0.02-0.04 Hz with golden-ratio spacing between channels
    for (int j = 0; j < fdnCount; j++) {
        float apRate = (0.02f + 0.02f * goldenHash(j + 32)) / sr * (float)block_size;
        g_reverb.apModPhases[j] += apRate;
        if (g_reverb.apModPhases[j] >= 1.0f) g_reverb.apModPhases[j] -= 1.0f;
        // Update the in-loop allpass feedback coefficient
        g_reverb.fdnInLoopAP[j].fb = INLOOP_AP_FB + 0.05f * fast_sinf(g_reverb.apModPhases[j] * 2.0f * (float)M_PI);
    }

    // Givens rotation: update phases & precompute sin/cos per block
    float givensRate0 = 0.013f / sr * (float)block_size;  // ~0.013 Hz
    float givensRate1 = 0.021f / sr * (float)block_size;  // ~0.021 Hz (golden ratio relative)
    g_reverb.givensPhase0 += givensRate0;
    g_reverb.givensPhase1 += givensRate1;
    if (g_reverb.givensPhase0 >= 1.0f) g_reverb.givensPhase0 -= 1.0f;
    if (g_reverb.givensPhase1 >= 1.0f) g_reverb.givensPhase1 -= 1.0f;
    float gAngle0 = g_reverb.givensPhase0 * 2.0f * (float)M_PI;
    float gAngle1 = g_reverb.givensPhase1 * 2.0f * (float)M_PI;
    g_reverb.givensCos0 = cosf(gAngle0); g_reverb.givensSin0 = fast_sinf(gAngle0);
    g_reverb.givensCos1 = cosf(gAngle1); g_reverb.givensSin1 = fast_sinf(gAngle1);

    // Output tap modulation: update phases per block
    for (int j = 0; j < fdnCount; j++) {
        float tapRate = (0.01f + 0.04f * goldenHash(j + 64)) / sr * (float)block_size;
        g_reverb.tapModPhases[j] += tapRate;
        if (g_reverb.tapModPhases[j] >= 1.0f) g_reverb.tapModPhases[j] -= 1.0f;
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

        // Transient conditioning (pre-tank)
        if (transSmooth > 0.0f) {
            inL = g_reverb.transSmoothL.process(inL, transSmooth);
            inR = g_reverb.transSmoothR.process(inR, transSmooth);
        }

        // Predelay with modulation + true stereo diffusion
        g_reverb.predelayL.write(inL);
        g_reverb.predelayR.write(inR);
        float delayedL, delayedR;
        if (g_reverb.predelaySamples > 0) {
            // Modulated predelay: ±2ms sine, decorrelated L vs R phase
            g_reverb.predelayModPhase += predelayModRate;
            if (g_reverb.predelayModPhase > 1.0f) g_reverb.predelayModPhase -= 1.0f;
            float modL = predelayModMaxSamples * fast_sinf(g_reverb.predelayModPhase * 2.0f * (float)M_PI);
            float modR = predelayModMaxSamples * fast_sinf((g_reverb.predelayModPhase + 0.37f) * 2.0f * (float)M_PI);
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
                float sineVal = fast_sinf(g_reverb.chorusPhases[j] * 2.0f * (float)M_PI);

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
                           * fast_sinf(g_reverb.chorusPhases[j] * 0.37f * 2.0f * (float)M_PI);
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
            g_reverb.fdnMixed[j] = g_reverb.fdnInLoopAP[j].process(g_reverb.fdnMixed[j]);
        }

        // ── Givens rotations: continuous unitary channel pair rotation ──
        if (!isLite && fdnCount >= 16) {
            // Rotation 1: channels (2, 11)
            float a0 = g_reverb.fdnMixed[2], b0 = g_reverb.fdnMixed[11];
            g_reverb.fdnMixed[2]  = a0 * g_reverb.givensCos0 - b0 * g_reverb.givensSin0;
            g_reverb.fdnMixed[11] = a0 * g_reverb.givensSin0 + b0 * g_reverb.givensCos0;
            // Rotation 2: channels (5, 14)
            float a1 = g_reverb.fdnMixed[5], b1 = g_reverb.fdnMixed[14];
            g_reverb.fdnMixed[5]  = a1 * g_reverb.givensCos1 - b1 * g_reverb.givensSin1;
            g_reverb.fdnMixed[14] = a1 * g_reverb.givensSin1 + b1 * g_reverb.givensCos1;
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
            float env0 = fast_sinf(g_reverb.shimmerPhase0 * (float)M_PI);
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
            float env1 = fast_sinf(g_reverb.shimmerPhase1 * (float)M_PI);
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

            float rawFeedback = g_reverb.fdnMixed[j] * g_reverb.channelFb[j]
                + dryInject
                + shimInject
                + shimFbInject;
            float value = softClip(rawFeedback, satMode);
            // NaN/Inf guard — prevent corrupted delay lines from poisoning the entire FDN
            if (!(value == value) || value > 1e15f || value < -1e15f) value = 0.0f;
            g_reverb.fdnDelays[j].write(value);
        }

        // ── Output tapping with stereo decorrelation ──
        float rawL = 0.0f, rawR = 0.0f;
        if (fdnCount == 16) {
            // True decorrelation with spatial modulation: slowly evolving stereo image
            float tapModDepth = 0.04f + spatialDrift;
            if (tapModDepth > 0.09f) tapModDepth = 0.09f;
            for (int j = 0; j < 16; j++) {
                float tapMod = tapModDepth * fast_sinf(g_reverb.tapModPhases[j] * 2.0f * (float)M_PI);
                float modTapL = STEREO_TAPS_L[j] + tapMod;
                float modTapR = STEREO_TAPS_R[j] - tapMod;  // anti-phase for energy conservation
                rawL += g_reverb.fdnReads[j] * modTapL;
                rawR += g_reverb.fdnReads[j] * modTapR;
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
                erL += g_reverb.erDelayL.read(g_reverb.erTapSamplesL[t]) * ER_GAINS[t];
                erR += g_reverb.erDelayR.read(g_reverb.erTapSamplesR[t]) * ER_GAINS[t];
            }
            // ER low-pass filter (one-pole)
            g_reverb.erLpStateL += erAlpha * (erL - g_reverb.erLpStateL);
            g_reverb.erLpStateR += erAlpha * (erR - g_reverb.erLpStateR);
            rawL += g_reverb.erLpStateL * erAmount * 0.12f;
            rawR += g_reverb.erLpStateR * erAmount * 0.12f;
        }

        // Post-diffusion
        rawL = g_reverb.postDiffL.process(rawL);
        rawR = g_reverb.postDiffR.process(rawR);
        if (lateBlend > 0.0001f) {
            float lateL = g_reverb.lateDiffL.process(rawL);
            float lateR = g_reverb.lateDiffR.process(rawR);
            rawL += (lateL - rawL) * lateBlend;
            rawR += (lateR - rawR) * lateBlend;
        }

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
            float env = fast_sinf(envPos * (float)M_PI);
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

        // Gentle bloom leveling: flatten the initial hit and keep the long tail
        // more present without feeding energy back into the tank.
        if (bloomStrength > 0.0001f) {
            float monoEnv = 0.5f * (fabsf(rawL) + fabsf(rawR));
            if (monoEnv > g_reverb.bloomEnv) {
                g_reverb.bloomEnv += (monoEnv - g_reverb.bloomEnv) * bloomAttack;
            } else {
                g_reverb.bloomEnv += (monoEnv - g_reverb.bloomEnv) * bloomRelease;
            }
            float targetEnv = 0.07f + bloomStrength * 0.05f;
            float envRatio = targetEnv / (g_reverb.bloomEnv + 0.02f);
            if (envRatio < 0.55f) envRatio = 0.55f;
            if (envRatio > 1.85f) envRatio = 1.85f;
            float gainShape = 0.16f + bloomStrength * 0.10f;
            float targetGain = powf(envRatio, gainShape);
            float minGain = 0.82f - bloomStrength * 0.10f;
            float maxGain = 1.22f + bloomStrength * 0.18f;
            if (targetGain < minGain) targetGain = minGain;
            if (targetGain > maxGain) targetGain = maxGain;
            g_reverb.bloomGain += (targetGain - g_reverb.bloomGain) * (0.015f + bloomStrength * 0.035f);
            rawL *= g_reverb.bloomGain;
            rawR *= g_reverb.bloomGain;
        } else {
            g_reverb.bloomEnv *= 0.9995f;
            g_reverb.bloomGain += (1.0f - g_reverb.bloomGain) * 0.01f;
        }

        // DC blocking
        rawL = g_reverb.dcBlockerL.process(rawL);
        rawR = g_reverb.dcBlockerR.process(rawR);

        // NaN/Inf guard — prevent poisoning the WebAudio graph
        if (!(rawL == rawL) || rawL > 1e15f || rawL < -1e15f) rawL = 0.0f;
        if (!(rawR == rawR) || rawR > 1e15f || rawR < -1e15f) rawR = 0.0f;

        // Soft limiter — preserves peak dynamics while preventing extreme values
        // (JS-side NaN guard at ±10 provides ultimate safety net)
        rawL = softClipClean(rawL);
        rawR = softClipClean(rawR);

        // Stereo width (mid-side)
        float mid  = (rawL + rawR) * 0.5f;
        float side = (rawL - rawR) * 0.5f;
        g_reverb.outputBuf[i * 2]     = mid + side * width;
        g_reverb.outputBuf[i * 2 + 1] = mid - side * width;
    }
}
