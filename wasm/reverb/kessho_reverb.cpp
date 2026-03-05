/**
 * Kessho Reverb — Full C++ Implementation
 *
 * Faithful port of reverb.worklet.ts (~700 lines TypeScript → ~650 lines C++).
 * 8-channel FDN with Hadamard mixing, 3-stage allpass diffusion, shimmer,
 * slow modulation, and reverse tail.
 *
 * Build targets:
 *   Web:  emcc → .wasm (loaded in AudioWorklet via thin JS shell)
 *   iOS:  clang → static lib
 */

#include "kessho_reverb.h"
#include <cmath>
#include <cstring>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ═══════════════ Constants ═══════════════

static constexpr int MAX_BLOCK_SIZE = 128;
static constexpr int FDN_CHANNELS   = 8;
static constexpr int SHIMMER_BUF_SIZE = 4096;

// FDN delay times in ms (prime-ish for rich decay)
static const float FDN_TIMES_MS[8] = {
    37.3f, 43.7f, 53.1f, 61.7f, 71.3f, 83.9f, 97.1f, 109.3f
};

// Diffuser times in samples at 48kHz
// Pre-diffuser L (6 stages)
static const int DIFF_PRE_L[6]  = {89, 127, 179, 233, 307, 401};
// Pre-diffuser R (6 stages)
static const int DIFF_PRE_R[6]  = {97, 137, 191, 251, 317, 419};
// Mid-diffuser L (4 stages)
static const int DIFF_MID_L[4]  = {167, 229, 313, 421};
// Mid-diffuser R (4 stages)
static const int DIFF_MID_R[4]  = {173, 241, 331, 433};
// Post-diffuser L (6 stages)
static const int DIFF_POST_L[6] = {211, 283, 367, 457, 547, 641};
// Post-diffuser R (6 stages)
static const int DIFF_POST_R[6] = {223, 293, 379, 467, 557, 653};

// Preset configs: decay, damping, diffusion, size, modDepth
struct PresetConfig {
    float decay, damping, diffusion, size, modDepth;
};
static const PresetConfig PRESETS[4] = {
    {0.88f, 0.25f, 0.80f, 0.8f, 0.25f},  // plate
    {0.92f, 0.20f, 0.85f, 1.0f, 0.30f},  // hall
    {0.96f, 0.12f, 0.95f, 1.5f, 0.40f},  // cathedral
    {0.94f, 0.45f, 0.90f, 1.3f, 0.30f},  // darkHall
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
    float z1 = 0.0f;
    inline float process(float input, float coeff) {
        float y = input - z1 + coeff * z1;
        z1 = y;
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

// Max 6 stages per diffuser chain
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
    if (x > 1.0f) return 1.0f - 1.0f / (x + 1.0f);
    if (x < -1.0f) return -1.0f + 1.0f / (-x + 1.0f);
    return x;
}

// Fast sine approximation (Bhaskara I, max error ~0.16%)
inline float fastSin(float x) {
    // Reduce to [0, 2π]
    x = fmodf(x, (float)(2.0 * M_PI));
    if (x < 0) x += (float)(2.0 * M_PI);
    // Bhaskara I approximation
    float y = x * (float)(1.0 / M_PI);  // 0..2
    if (y > 1.0f) { y -= 2.0f; }        // -1..1 (maps to sin domain)
    return 4.0f * y * (1.0f - fabsf(y)) * (1.0f / (1.0f - 0.19195f * y * y + 0.19195f));
}

// ═══════════════ Engine State ═══════════════

static struct {
    float sampleRate;
    float scale; // sampleRate / 48000

    // I/O buffers
    float inputBuf[MAX_BLOCK_SIZE * 2];
    float outputBuf[MAX_BLOCK_SIZE * 2];

    // FDN
    SmoothDelay fdnDelays[FDN_CHANNELS];
    float       fdnDelayTimes[FDN_CHANNELS];
    OnePole     fdnDampers[FDN_CHANNELS];
    OnePoleHP   fdnHPFs[FDN_CHANNELS];
    float       hpCoeff;

    // Pre-allocated work arrays
    float fdnReads[FDN_CHANNELS];
    float fdnDamped[FDN_CHANNELS];
    float fdnMixed[FDN_CHANNELS];

    // Diffusers
    DiffuserChain preDiffL, preDiffR;
    DiffuserChain midDiffL, midDiffR;
    DiffuserChain postDiffL, postDiffR;

    // Predelay
    SmoothDelay predelayL, predelayR;
    int predelaySamples;

    // DC blockers
    DCBlocker dcBlockerL, dcBlockerR;

    // Ultra-slow modulation phases
    float modPhase1, modPhase2, modPhase3, modPhase4;

    // Feedback
    float feedbackGain;
    float smoothDamping;

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

    // Parameters
    int   presetType;    // 0=plate 1=hall 2=cathedral 3=darkHall
    int   quality;       // 0=ultra 1=balanced 2=lite
    float decay;
    float size;
    float damping;
    float diffusion;
    float modulation;
    float predelayMs;
    float width;
    int   freeze;
    float shimmerAmount;
    float shimmerPitch;  // semitones
    float slowModRate;
    float slowModDepth;
    float reverseAmount;
    float reverseLength; // seconds

    int initialized;
} g_reverb;

// ═══════════════ Internal helpers ═══════════════

static void updatePreset() {
    const auto& preset = PRESETS[g_reverb.presetType];
    float userDecay = g_reverb.decay;
    float userSize = g_reverb.size;
    float userDiffusion = g_reverb.diffusion;
    float sr = g_reverb.sampleRate;
    float scale = g_reverb.scale;

    // Feedback gain
    float baseDecay = preset.decay;
    float effectiveDecay = baseDecay + (1.0f - baseDecay) * userDecay * 0.9f;
    g_reverb.feedbackGain = g_reverb.freeze
        ? 1.0f
        : fminf(0.995f, effectiveDecay);

    // FDN delay times
    for (int i = 0; i < FDN_CHANNELS; i++) {
        g_reverb.fdnDelayTimes[i] = FDN_TIMES_MS[i] * scale * sr / 1000.0f * userSize;
    }

    // Diffuser feedback
    float baseDiff = preset.diffusion;
    float effectiveDiff = baseDiff * (0.6f + userDiffusion * 0.4f);
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

// Hadamard 8×8 mixing
static inline void mixFDN8(const float* state, float* out) {
    const float s = 0.3535533905932738f; // 1/sqrt(8)
    out[0] = s * (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + state[7]);
    out[1] = s * (state[0] - state[1] + state[2] - state[3] + state[4] - state[5] + state[6] - state[7]);
    out[2] = s * (state[0] + state[1] - state[2] - state[3] + state[4] + state[5] - state[6] - state[7]);
    out[3] = s * (state[0] - state[1] - state[2] + state[3] + state[4] - state[5] - state[6] + state[7]);
    out[4] = s * (state[0] + state[1] + state[2] + state[3] - state[4] - state[5] - state[6] - state[7]);
    out[5] = s * (state[0] - state[1] + state[2] - state[3] - state[4] + state[5] - state[6] + state[7]);
    out[6] = s * (state[0] + state[1] - state[2] - state[3] - state[4] - state[5] + state[6] + state[7]);
    out[7] = s * (state[0] - state[1] - state[2] + state[3] - state[4] + state[5] + state[6] - state[7]);
}

// Hadamard 4×4 mixing (lite mode)
static inline void mixFDN4(const float* state, float* out) {
    const float s = 0.5f; // 1/sqrt(4)
    out[0] = s * (state[0] + state[1] + state[2] + state[3]);
    out[1] = s * (state[0] - state[1] + state[2] - state[3]);
    out[2] = s * (state[0] + state[1] - state[2] - state[3]);
    out[3] = s * (state[0] - state[1] - state[2] + state[3]);
}

// ═══════════════ Public API ═══════════════

int reverb_init(float sample_rate) {
    memset(&g_reverb, 0, sizeof(g_reverb));
    g_reverb.sampleRate = sample_rate;
    g_reverb.scale = sample_rate / 48000.0f;

    float scale = g_reverb.scale;

    // FDN delay lines
    for (int i = 0; i < FDN_CHANNELS; i++) {
        float baseTime = FDN_TIMES_MS[i] * scale;
        int maxSamples = (int)ceilf(baseTime * sample_rate / 1000.0f * 4.0f);
        g_reverb.fdnDelays[i].init(maxSamples);
        g_reverb.fdnDelayTimes[i] = baseTime * sample_rate / 1000.0f;
    }

    // HPF coefficient ~35Hz
    g_reverb.hpCoeff = 1.0f - (2.0f * (float)M_PI * 35.0f / sample_rate);

    // Diffusers
    g_reverb.preDiffL.init(DIFF_PRE_L, 6, scale, 0.65f);
    g_reverb.preDiffR.init(DIFF_PRE_R, 6, scale, 0.65f);
    g_reverb.midDiffL.init(DIFF_MID_L, 4, scale, 0.55f);
    g_reverb.midDiffR.init(DIFF_MID_R, 4, scale, 0.55f);
    g_reverb.postDiffL.init(DIFF_POST_L, 6, scale, 0.5f);
    g_reverb.postDiffR.init(DIFF_POST_R, 6, scale, 0.5f);

    // Predelay (up to 300ms)
    int maxPredelay = (int)ceilf(0.3f * sample_rate);
    g_reverb.predelayL.init(maxPredelay);
    g_reverb.predelayR.init(maxPredelay);

    // Shimmer buffer
    g_reverb.shimmerPhase0 = 0.0f;
    g_reverb.shimmerPhase1 = 0.5f;
    g_reverb.shimmerPitchRatio = 2.0f; // +12 semitones default

    // Reverse buffer (max 16 seconds)
    g_reverb.reverseBufSize = (int)ceilf(16.0f * sample_rate);
    g_reverb.reverseBufL = (float*)calloc(g_reverb.reverseBufSize, sizeof(float));
    g_reverb.reverseBufR = (float*)calloc(g_reverb.reverseBufSize, sizeof(float));
    g_reverb.reverseCycleLen = (int)(2.0f * sample_rate);

    // Modulation phases
    g_reverb.modPhase1 = 0.0f;
    g_reverb.modPhase2 = 0.25f;
    g_reverb.modPhase3 = 0.5f;
    g_reverb.modPhase4 = 0.75f;
    g_reverb.slowModPhase1 = 0.0f;
    g_reverb.slowModPhase2 = 1.2f;

    // Defaults
    g_reverb.presetType = 1; // hall
    g_reverb.quality = 1;    // balanced
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
    g_reverb.smoothDamping = 0.5f;

    updatePreset();
    updatePredelay();

    g_reverb.initialized = 1;
    return 0;
}

void reverb_destroy(void) {
    for (int i = 0; i < FDN_CHANNELS; i++) g_reverb.fdnDelays[i].destroy();
    g_reverb.preDiffL.destroy();  g_reverb.preDiffR.destroy();
    g_reverb.midDiffL.destroy();  g_reverb.midDiffR.destroy();
    g_reverb.postDiffL.destroy(); g_reverb.postDiffR.destroy();
    g_reverb.predelayL.destroy(); g_reverb.predelayR.destroy();
    free(g_reverb.reverseBufL);
    free(g_reverb.reverseBufR);
    g_reverb.initialized = 0;
}

float* reverb_get_input_ptr(void) { return g_reverb.inputBuf; }
float* reverb_get_output_ptr(void) { return g_reverb.outputBuf; }

void reverb_set_type(int type) {
    g_reverb.presetType = (type >= 0 && type <= 3) ? type : 1;
    updatePreset();
}

void reverb_set_quality(int quality) {
    g_reverb.quality = (quality >= 0 && quality <= 2) ? quality : 1;
}

void reverb_set_params(float decay, float size, float damping, float diffusion,
                       float modulation, float predelay, float width) {
    g_reverb.decay = decay;
    g_reverb.size = size;
    g_reverb.damping = damping;
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

// ═══════════════ Processing ═══════════════

void reverb_process_block(int block_size) {
    if (!g_reverb.initialized || block_size <= 0) return;
    if (block_size > MAX_BLOCK_SIZE) block_size = MAX_BLOCK_SIZE;

    const float sr = g_reverb.sampleRate;
    const float width = g_reverb.width;
    const float modulation = g_reverb.modulation;
    const auto& preset = PRESETS[g_reverb.presetType];
    const float modDepth = preset.modDepth * modulation;

    // --- Per-block modulation (ultra-slow LFO) ---
    const float blockPhaseInc = (float)block_size / sr;
    const float modRate1 = 0.023f, modRate2 = 0.031f, modRate3 = 0.041f, modRate4 = 0.053f;

    float tri1 = 1.0f - fabsf(2.0f * g_reverb.modPhase1 - 1.0f);
    float tri2 = 1.0f - fabsf(2.0f * g_reverb.modPhase2 - 1.0f);
    float tri3 = 1.0f - fabsf(2.0f * g_reverb.modPhase3 - 1.0f);
    float tri4 = 1.0f - fabsf(2.0f * g_reverb.modPhase4 - 1.0f);

    float mod1 = (tri1 - 0.5f) * modDepth;
    float mod2 = (tri2 - 0.5f) * modDepth;
    float mod3 = (tri3 - 0.5f) * modDepth;
    float mod4 = (tri4 - 0.5f) * modDepth;

    g_reverb.modPhase1 += modRate1 * blockPhaseInc;
    g_reverb.modPhase2 += modRate2 * blockPhaseInc;
    g_reverb.modPhase3 += modRate3 * blockPhaseInc;
    g_reverb.modPhase4 += modRate4 * blockPhaseInc;
    if (g_reverb.modPhase1 > 1.0f) g_reverb.modPhase1 -= 1.0f;
    if (g_reverb.modPhase2 > 1.0f) g_reverb.modPhase2 -= 1.0f;
    if (g_reverb.modPhase3 > 1.0f) g_reverb.modPhase3 -= 1.0f;
    if (g_reverb.modPhase4 > 1.0f) g_reverb.modPhase4 -= 1.0f;

    // Smooth damping per block
    float targetDamping = g_reverb.damping;
    g_reverb.smoothDamping += (targetDamping - g_reverb.smoothDamping)
                              * (1.0f - powf(1.0f - 0.0001f, (float)block_size));

    // Freeze overrides
    const bool isFrozen = g_reverb.freeze != 0;
    float blockFeedback = isFrozen ? 1.0f : g_reverb.feedbackGain;
    float blockDamping = isFrozen ? 0.0f : g_reverb.smoothDamping;

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
        blockDamping = fmaxf(0.0f, fminf(1.0f, blockDamping + m2 * slowDepth * 0.15f));
    }

    // Shimmer constants
    float shimmerAmount = g_reverb.shimmerAmount;
    const int shimmerGrainSize = 1024;
    const float shimmerPhaseInc = 1.0f / (float)shimmerGrainSize;

    // Reverse constants
    float reverseAmount = g_reverb.reverseAmount;
    int rCycleLen = g_reverb.reverseCycleLen;
    if (rCycleLen < 1) rCycleLen = 1;

    // Quality
    bool isLite = (g_reverb.quality == 2);
    bool useMidDiff = (g_reverb.quality == 0);
    int fdnCount = isLite ? 4 : 8;

    float hpC = isFrozen ? 1.0f : g_reverb.hpCoeff;
    float inputGain = isFrozen ? 0.0f : (isLite ? 0.25f : 0.2f);

    // === Sample loop ===
    for (int i = 0; i < block_size; i++) {
        float inL = g_reverb.inputBuf[i * 2];
        float inR = g_reverb.inputBuf[i * 2 + 1];

        // Predelay
        g_reverb.predelayL.write(inL);
        g_reverb.predelayR.write(inR);
        float delayedL = g_reverb.predelaySamples > 0 ? g_reverb.predelayL.read(g_reverb.predelaySamples) : inL;
        float delayedR = g_reverb.predelaySamples > 0 ? g_reverb.predelayR.read(g_reverb.predelaySamples) : inR;

        // Pre-diffusion
        float diffInL = g_reverb.preDiffL.process(delayedL);
        float diffInR = g_reverb.preDiffR.process(delayedR);

        // Read FDN delay lines with modulation
        for (int j = 0; j < fdnCount; j++) {
            float modAmt = (j < 2) ? mod1 : (j < 4) ? mod2 : (j < 6) ? mod3 : mod4;
            float modOffset = modAmt * g_reverb.fdnDelayTimes[j] * 0.015f;
            float delayTime = g_reverb.fdnDelayTimes[j] + modOffset;
            if (delayTime < 1.0f) delayTime = 1.0f;
            g_reverb.fdnReads[j] = g_reverb.fdnDelays[j].readInterpolated(delayTime);
        }

        // Damping + HPF
        for (int j = 0; j < fdnCount; j++) {
            float damped = g_reverb.fdnDampers[j].process(g_reverb.fdnReads[j], blockDamping);
            g_reverb.fdnDamped[j] = g_reverb.fdnHPFs[j].process(damped, hpC);
        }

        // Hadamard mixing
        if (isLite) {
            mixFDN4(g_reverb.fdnDamped, g_reverb.fdnMixed);
        } else {
            mixFDN8(g_reverb.fdnDamped, g_reverb.fdnMixed);
        }

        // Mid-diffusion (Ultra only)
        float midL = 0.0f, midR = 0.0f;
        if (useMidDiff) {
            midL = g_reverb.midDiffL.process(
                (g_reverb.fdnMixed[0] + g_reverb.fdnMixed[2] + g_reverb.fdnMixed[4] + g_reverb.fdnMixed[6]) * 0.25f
            );
            midR = g_reverb.midDiffR.process(
                (g_reverb.fdnMixed[1] + g_reverb.fdnMixed[3] + g_reverb.fdnMixed[5] + g_reverb.fdnMixed[7]) * 0.25f
            );
        }

        // Shimmer: pitch-shifted grain feedback
        float shimInL = 0.0f, shimInR = 0.0f;
        if (shimmerAmount > 0.0f) {
            int sBuf = SHIMMER_BUF_SIZE;
            float ratio = g_reverb.shimmerPitchRatio;

            // Grain 0
            float readOff0 = fmodf(g_reverb.shimmerPhase0 * shimmerGrainSize * ratio, (float)sBuf);
            float ri0 = fmodf((float)(g_reverb.shimmerWriteIdx - shimmerGrainSize + sBuf) + readOff0, (float)sBuf);
            int ri0i = (int)ri0;
            float ri0f = ri0 - (float)ri0i;
            int ri0n = (ri0i + 1) % sBuf;
            float env0 = sinf(g_reverb.shimmerPhase0 * (float)M_PI);
            shimInL = (g_reverb.shimmerBufL[ri0i] + ri0f * (g_reverb.shimmerBufL[ri0n] - g_reverb.shimmerBufL[ri0i])) * env0;
            shimInR = (g_reverb.shimmerBufR[ri0i] + ri0f * (g_reverb.shimmerBufR[ri0n] - g_reverb.shimmerBufR[ri0i])) * env0;

            // Grain 1
            float readOff1 = fmodf(g_reverb.shimmerPhase1 * shimmerGrainSize * ratio, (float)sBuf);
            float ri1 = fmodf((float)(g_reverb.shimmerWriteIdx - shimmerGrainSize + sBuf) + readOff1, (float)sBuf);
            int ri1i = (int)ri1;
            float ri1f = ri1 - (float)ri1i;
            int ri1n = (ri1i + 1) % sBuf;
            float env1 = sinf(g_reverb.shimmerPhase1 * (float)M_PI);
            shimInL += (g_reverb.shimmerBufL[ri1i] + ri1f * (g_reverb.shimmerBufL[ri1n] - g_reverb.shimmerBufL[ri1i])) * env1;
            shimInR += (g_reverb.shimmerBufR[ri1i] + ri1f * (g_reverb.shimmerBufR[ri1n] - g_reverb.shimmerBufR[ri1i])) * env1;

            shimInL *= shimmerAmount * 0.35f;
            shimInR *= shimmerAmount * 0.35f;

            g_reverb.shimmerPhase0 += shimmerPhaseInc;
            g_reverb.shimmerPhase1 += shimmerPhaseInc;
            if (g_reverb.shimmerPhase0 >= 1.0f) g_reverb.shimmerPhase0 -= 1.0f;
            if (g_reverb.shimmerPhase1 >= 1.0f) g_reverb.shimmerPhase1 -= 1.0f;
        }

        // Inject input + shimmer + feedback → write back
        int halfCount = fdnCount >> 1;
        for (int j = 0; j < fdnCount; j++) {
            float dryInject = (j < halfCount) ? diffInL * inputGain : diffInR * inputGain;
            float shimInject = (j < halfCount) ? shimInL : shimInR;
            float value = softClip(g_reverb.fdnMixed[j] * blockFeedback + dryInject + shimInject);
            g_reverb.fdnDelays[j].write(value);
        }

        // Output tapping
        float rawL, rawR;
        if (isLite) {
            rawL = (g_reverb.fdnReads[0] + g_reverb.fdnReads[2] + g_reverb.fdnReads[1] * 0.3f) * 0.7f;
            rawR = (g_reverb.fdnReads[1] + g_reverb.fdnReads[3] + g_reverb.fdnReads[0] * 0.3f) * 0.7f;
        } else {
            rawL = (g_reverb.fdnReads[0] + g_reverb.fdnReads[2] + g_reverb.fdnReads[4] + g_reverb.fdnReads[6]
                  + g_reverb.fdnReads[1] * 0.3f + g_reverb.fdnReads[3] * 0.3f) * 0.5f;
            rawR = (g_reverb.fdnReads[1] + g_reverb.fdnReads[3] + g_reverb.fdnReads[5] + g_reverb.fdnReads[7]
                  + g_reverb.fdnReads[0] * 0.3f + g_reverb.fdnReads[2] * 0.3f) * 0.5f;
        }

        // Mid-diffusion blend
        if (useMidDiff) {
            rawL = rawL * 0.7f + midL * 0.3f;
            rawR = rawR * 0.7f + midR * 0.3f;
        }

        // Post-diffusion
        rawL = g_reverb.postDiffL.process(rawL);
        rawR = g_reverb.postDiffR.process(rawR);

        // Shimmer buffer write
        if (shimmerAmount > 0.0f) {
            g_reverb.shimmerBufL[g_reverb.shimmerWriteIdx] = rawL;
            g_reverb.shimmerBufR[g_reverb.shimmerWriteIdx] = rawR;
            g_reverb.shimmerWriteIdx = (g_reverb.shimmerWriteIdx + 1) % SHIMMER_BUF_SIZE;
        }

        // Reverse tail
        if (reverseAmount > 0.0f) {
            g_reverb.reverseBufL[g_reverb.reverseWriteIdx] = rawL;
            g_reverb.reverseBufR[g_reverb.reverseWriteIdx] = rawR;

            int readIdx = (g_reverb.reverseWriteIdx - (int)g_reverb.reverseReadPhase + rCycleLen) % rCycleLen;
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

        // Stereo width
        float mid = (rawL + rawR) * 0.5f;
        float side = (rawL - rawR) * 0.5f;
        g_reverb.outputBuf[i * 2]     = mid + side * width;
        g_reverb.outputBuf[i * 2 + 1] = mid - side * width;
    }
}
