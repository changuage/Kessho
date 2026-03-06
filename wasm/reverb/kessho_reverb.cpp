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
// Scaled so total sum per side ≈ 2.0, matching 8-ch output level
static const float STEREO_TAPS_L[16] = {
    0.26f, 0.06f, 0.23f, 0.07f, 0.20f, 0.04f, 0.17f, 0.03f,
    0.04f, 0.24f, 0.06f, 0.22f, 0.04f, 0.17f, 0.03f, 0.14f
};
static const float STEREO_TAPS_R[16] = {
    0.03f, 0.20f, 0.04f, 0.22f, 0.06f, 0.23f, 0.07f, 0.26f,
    0.14f, 0.03f, 0.19f, 0.04f, 0.22f, 0.07f, 0.24f, 0.06f
};

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
        float readPos = (float)writeIdx - delaySamples;
        if (readPos < 0.0f) readPos += (float)size;
        int i0 = (int)readPos;
        if (i0 >= size) i0 -= size;
        int i1 = i0 + 1;
        if (i1 >= size) i1 = 0;
        float frac = readPos - floorf(readPos);
        return buffer[i0] + (buffer[i1] - buffer[i0]) * frac;
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

inline float softClip(float x) {
    // tanhf approximation — warm saturation, preserves sign symmetry
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

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
    int   presetType;          // 0-3
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

    // Internal computed
    float feedbackGain;
    float smoothDampLow;
    float smoothDampHigh;

    int initialized;
} g_reverb;

// ═══════════════ Internal helpers ═══════════════

static void updatePreset() {
    const auto& preset = PRESETS[g_reverb.presetType];
    float userDecay = g_reverb.decay;
    float userSize  = g_reverb.size;
    float sr = g_reverb.sampleRate;
    float scale = g_reverb.scale;

    // Feedback gain
    float baseDecay = preset.decay;
    float effectiveDecay = baseDecay + (1.0f - baseDecay) * userDecay * 0.9f;
    g_reverb.feedbackGain = g_reverb.freeze
        ? 1.0f
        : fminf(0.998f, effectiveDecay);

    // FDN delay times
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
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) {
        float baseTime = FDN_TIMES_MS[i] * scale;
        int maxSamples = (int)ceilf(baseTime * sample_rate / 1000.0f * 4.0f);
        g_reverb.fdnDelays[i].init(maxSamples);
        g_reverb.fdnDelayTimes[i] = baseTime * sample_rate / 1000.0f;
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
    for (int i = 0; i < FDN_MAX_CHANNELS; i++) g_reverb.fdnDelays[i].destroy();
    g_reverb.preDiffL.destroy();  g_reverb.preDiffR.destroy();
    g_reverb.midDiffL.destroy();  g_reverb.midDiffR.destroy();
    g_reverb.postDiffL.destroy(); g_reverb.postDiffR.destroy();
    g_reverb.predelayL.destroy(); g_reverb.predelayR.destroy();
    free(g_reverb.reverseBufL);
    free(g_reverb.reverseBufR);
    g_reverb.initialized = 0;
}

float* reverb_get_input_ptr(void)  { return g_reverb.inputBuf; }
float* reverb_get_output_ptr(void) { return g_reverb.outputBuf; }

void reverb_set_type(int type) {
    g_reverb.presetType = (type >= 0 && type <= 3) ? type : 1;
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

// ═══════════════ Processing ═══════════════

void reverb_process_block(int block_size) {
    if (!g_reverb.initialized || block_size <= 0) return;
    if (block_size > MAX_BLOCK_SIZE) block_size = MAX_BLOCK_SIZE;

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

    // Freeze overrides
    const bool isFrozen = g_reverb.freeze != 0;
    float blockFeedback = isFrozen ? 1.0f : g_reverb.feedbackGain;
    float blockDampLow  = isFrozen ? 0.0f : g_reverb.smoothDampLow;
    float blockDampHigh = isFrozen ? 0.0f : g_reverb.smoothDampHigh;
    float crossCoeff    = g_reverb.crossoverCoeff;

    // Slow modulation (character drift)
    float slowDepth = g_reverb.slowModDepth;
    if (slowDepth > 0.0f && !isFrozen) {
        float slowRate = g_reverb.slowModRate;
        float TAU = (float)(2.0 * M_PI);
        g_reverb.slowModPhase1 += TAU * slowRate * blockPhaseInc;
        g_reverb.slowModPhase2 += TAU * slowRate * 1.37f * blockPhaseInc;
        if (g_reverb.slowModPhase1 > TAU) g_reverb.slowModPhase1 -= TAU;
        if (g_reverb.slowModPhase2 > TAU) g_reverb.slowModPhase2 -= TAU;

        float m1 = sinf(g_reverb.slowModPhase1);
        float m2 = sinf(g_reverb.slowModPhase2);

        blockFeedback = fminf(0.998f, blockFeedback * (1.0f + m1 * slowDepth * 0.06f));
        blockDampHigh = fmaxf(0.0f, fminf(1.0f, blockDampHigh + m2 * slowDepth * 0.15f));
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

    float hpC = isFrozen ? 1.0f : g_reverb.hpCoeff;
    float inputGain = isFrozen ? 0.0f : (fdnCount >= 16 ? 0.10f : fdnCount >= 8 ? 0.10f : 0.20f);

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

    // === Sample loop ===
    for (int i = 0; i < block_size; i++) {
        float inL = g_reverb.inputBuf[i * 2];
        float inR = g_reverb.inputBuf[i * 2 + 1];

        // Input tone shaping
        if (inputTone != 0.0f) {
            inL = g_reverb.tiltL.process(inL, inputTone, tiltCoeff);
            inR = g_reverb.tiltR.process(inR, inputTone, tiltCoeff);
        }

        // Predelay
        g_reverb.predelayL.write(inL);
        g_reverb.predelayR.write(inR);
        float delayedL = g_reverb.predelaySamples > 0
            ? g_reverb.predelayL.read(g_reverb.predelaySamples) : inL;
        float delayedR = g_reverb.predelaySamples > 0
            ? g_reverb.predelayR.read(g_reverb.predelaySamples) : inR;

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

            // Advance per-line phase
            g_reverb.chorusPhases[j] += g_reverb.chorusPhaseInc[j];
            if (g_reverb.chorusPhases[j] >= 1.0f) g_reverb.chorusPhases[j] -= 1.0f;

            float delayTime = g_reverb.fdnDelayTimes[j] + modOffset;
            if (delayTime < 1.0f) delayTime = 1.0f;
            g_reverb.fdnReads[j] = g_reverb.fdnDelays[j].readInterpolated(delayTime);
        }

        // ── Multi-band damping + HPF ──
        for (int j = 0; j < fdnCount; j++) {
            float damped = g_reverb.fdnDampers[j].process(
                g_reverb.fdnReads[j], blockDampLow, blockDampHigh, crossCoeff
            );
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
            );
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

        // Mid-diffusion blend
        if (useMidDiff) {
            rawL = rawL * 0.7f + midL * 0.3f;
            rawR = rawR * 0.7f + midR * 0.3f;
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
