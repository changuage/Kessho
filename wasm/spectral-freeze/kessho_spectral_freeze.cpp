/**
 * Kessho Spectral Freeze — STFT Phase-Vocoder Freeze Engine
 *
 * Implements solid and slushy freeze modes inspired by the Chase Bliss × Goodhertz
 * Lossy pedal concept: STFT-based spectral capture with per-bin masked refresh.
 *
 * Solid freeze:  Capture magnitudes + instantaneous frequency, resynthesize indefinitely.
 * Slushy freeze: Continuously refresh held spectrum via stochastic per-bin masked blend.
 *
 * Architecture:
 *   Input → Hann Window → FFT → Analysis (mag/phase/IF) → Freeze Logic → IFFT → Overlap-Add → Output
 *
 * The freeze node can be placed pre-reverb, post-reverb, or parallel.
 * Routing is handled by the JS engine, not this module.
 *
 * Build: python build.py (Emscripten → kessho_spectral_freeze.wasm)
 */

#include <cmath>
#include <cstring>

// ═══════════════ Configuration ═══════════════

static constexpr int FFT_SIZE = 2048;
static constexpr int HALF_FFT = FFT_SIZE / 2 + 1;  // 1025 bins (DC to Nyquist)
static constexpr int HOP_SIZE = 512;                // 4x overlap
static constexpr int OVERLAP_FACTOR = FFT_SIZE / HOP_SIZE;  // 4
static constexpr int MAX_BLOCK_SIZE = 128;
static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 6.28318530717958647692f;

// ═══════════════ Simple xorshift32 PRNG ═══════════════

struct FastRNG {
    uint32_t state;
    void seed(uint32_t s) { state = s ? s : 1u; }
    uint32_t next() {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return state;
    }
    float nextFloat() { return (float)(next() & 0x7FFFFFu) / (float)0x800000u; }
};

// ═══════════════ In-place radix-2 Cooley-Tukey FFT ═══════════════

// Bit-reversal permutation
static void bitReverse(float* re, float* im, int n) {
    int j = 0;
    for (int i = 0; i < n - 1; i++) {
        if (i < j) {
            float tr = re[i]; re[i] = re[j]; re[j] = tr;
            float ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
        int k = n >> 1;
        while (k <= j) { j -= k; k >>= 1; }
        j += k;
    }
}

// Forward FFT (in-place, real/imag arrays, size must be power of 2)
static void fft(float* re, float* im, int n) {
    bitReverse(re, im, n);
    for (int len = 2; len <= n; len <<= 1) {
        float angle = -TWO_PI / (float)len;
        float wRe = cosf(angle);
        float wIm = sinf(angle);
        for (int i = 0; i < n; i += len) {
            float curRe = 1.0f, curIm = 0.0f;
            int half = len >> 1;
            for (int j = 0; j < half; j++) {
                int u = i + j;
                int v = u + half;
                float tRe = curRe * re[v] - curIm * im[v];
                float tIm = curRe * im[v] + curIm * re[v];
                re[v] = re[u] - tRe;
                im[v] = im[u] - tIm;
                re[u] += tRe;
                im[u] += tIm;
                float newCurRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = newCurRe;
            }
        }
    }
}

// Inverse FFT
static void ifft(float* re, float* im, int n) {
    // Conjugate
    for (int i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im, n);
    float invN = 1.0f / (float)n;
    for (int i = 0; i < n; i++) {
        re[i] *= invN;
        im[i] = -im[i] * invN;
    }
}

// ═══════════════ Hann window (precomputed) ═══════════════

static float g_window[FFT_SIZE];
static bool g_windowReady = false;

static void initWindow() {
    if (g_windowReady) return;
    for (int i = 0; i < FFT_SIZE; i++) {
        g_window[i] = 0.5f * (1.0f - cosf(TWO_PI * (float)i / (float)FFT_SIZE));
    }
    g_windowReady = true;
}

// ═══════════════ Spectral Freeze State ═══════════════

struct SpectralFreezeState {
    float sampleRate;
    int initialized;

    // STFT buffers — stereo (L and R processed independently)
    float inputRingL[FFT_SIZE];   // circular input buffer
    float inputRingR[FFT_SIZE];
    int   ringWritePos;           // write position in ring buffer
    int   hopCounter;             // counts samples until next hop

    // FFT scratch buffers
    float fftRe[FFT_SIZE];
    float fftIm[FFT_SIZE];

    // Analysis results (per channel, current frame)
    float magL[HALF_FFT];
    float magR[HALF_FFT];
    float phaseL[HALF_FFT];
    float phaseR[HALF_FFT];
    float prevPhaseL[HALF_FFT];   // previous frame phase (for IF estimation)
    float prevPhaseR[HALF_FFT];

    // Held freeze state
    float heldMagL[HALF_FFT];     // frozen magnitudes
    float heldMagR[HALF_FFT];
    float heldIFL[HALF_FFT];      // frozen instantaneous frequency (radians/hop)
    float heldIFR[HALF_FFT];
    float synthPhaseL[HALF_FFT];  // resynthesis phase accumulator
    float synthPhaseR[HALF_FFT];

    // Overlap-add output buffers (4 overlapping frames)
    float olaOutL[FFT_SIZE];
    float olaOutR[FFT_SIZE];
    int   olaReadPos;

    // Parameters
    int   freezeActive;        // 0=off, 1=on
    int   slushyMode;          // 0=solid, 1=slushy
    float slushySpeed;         // 0..1 → refresh rate (α in the masked blend)
    float mix;                 // 0..1 wet/dry

    // Slushy mask state
    FastRNG rng;
    float maskBandCenter;      // current center of the refresh band (0..1 normalized freq)
    float maskBandWidth;       // width of the refresh band
    int   maskUpdateCounter;   // frames since last mask band shift

    // Freeze transition ramp
    float freezeRamp;          // 0=unfrozen, 1=fully frozen (smooth)
    int   justFroze;           // flag: capture on next frame when transitioning to frozen

    // I/O buffers for WASM bridge
    float inputBuf[MAX_BLOCK_SIZE * 2];   // interleaved stereo input
    float outputBuf[MAX_BLOCK_SIZE * 2];  // interleaved stereo output

    // Output ring: overlap-add results ready for block output
    float outputRingL[FFT_SIZE * 2];
    float outputRingR[FFT_SIZE * 2];
    int   outputRingWritePos;
    int   outputRingReadPos;
};

static SpectralFreezeState g_sf;

// ═══════════════ Analysis: windowed FFT → magnitude + phase ═══════════════

static void analyzeFrame(const float* ringBuf, int ringPos,
                         float* mag, float* phase, float* fftRe, float* fftIm) {
    // Copy ring buffer to FFT input with Hann window
    for (int i = 0; i < FFT_SIZE; i++) {
        int idx = (ringPos - FFT_SIZE + i + FFT_SIZE) % FFT_SIZE;
        fftRe[i] = ringBuf[idx] * g_window[i];
        fftIm[i] = 0.0f;
    }

    fft(fftRe, fftIm, FFT_SIZE);

    // Extract magnitude and phase for positive frequencies
    for (int k = 0; k < HALF_FFT; k++) {
        mag[k] = sqrtf(fftRe[k] * fftRe[k] + fftIm[k] * fftIm[k]);
        phase[k] = atan2f(fftIm[k], fftRe[k]);
    }
}

// ═══════════════ Instantaneous Frequency estimation ═══════════════

static void estimateIF(const float* phase, const float* prevPhase, float* instFreq) {
    // Expected phase advance per hop for bin k:
    //   expectedAdvance = 2π * k * HOP_SIZE / FFT_SIZE
    // Instantaneous frequency (as phase advance per hop):
    //   IF[k] = expectedAdvance + principalArg(phase[k] - prevPhase[k] - expectedAdvance)
    float hopPhaseStep = TWO_PI * (float)HOP_SIZE / (float)FFT_SIZE;

    for (int k = 0; k < HALF_FFT; k++) {
        float expected = hopPhaseStep * (float)k;
        float diff = phase[k] - prevPhase[k] - expected;

        // Principal argument: wrap to [-π, π]
        diff = fmodf(diff + PI, TWO_PI);
        if (diff < 0) diff += TWO_PI;
        diff -= PI;

        instFreq[k] = expected + diff;
    }
}

// ═══════════════ Resynthesis: magnitude + phase → IFFT → overlap-add ═══════════════

static void synthesizeFrame(const float* mag, const float* synthPhase,
                            float* olaOut, int olaWriteStart,
                            float* fftRe, float* fftIm) {
    // Reconstruct complex spectrum from magnitude and phase
    for (int k = 0; k < HALF_FFT; k++) {
        fftRe[k] = mag[k] * cosf(synthPhase[k]);
        fftIm[k] = mag[k] * sinf(synthPhase[k]);
    }
    // Mirror for negative frequencies (conjugate symmetry)
    for (int k = 1; k < FFT_SIZE / 2; k++) {
        fftRe[FFT_SIZE - k] =  fftRe[k];
        fftIm[FFT_SIZE - k] = -fftIm[k];
    }

    ifft(fftRe, fftIm, FFT_SIZE);

    // Overlap-add with window (synthesis window for COLA)
    for (int i = 0; i < FFT_SIZE; i++) {
        int idx = (olaWriteStart + i) % (FFT_SIZE * 2);
        olaOut[idx] += fftRe[i] * g_window[i];
    }
}

// ═══════════════ Slushy mask generation ═══════════════

// Generates a per-bin mask M[k] in [0,1] that determines how much each bin refreshes.
// Uses band-limited regions + random speckle for the "oozing" spectral refresh character.
static void generateSlushyMask(float* mask, int numBins, float speed, FastRNG& rng,
                               float& bandCenter, float& bandWidth, int& updateCounter) {
    // Shift the refresh band periodically — slower speed = less frequent band shifts
    // At speed=1, shift every frame. At speed=0.01, shift every ~100 frames.
    int shiftInterval = (int)fmaxf(1.0f, 20.0f / fmaxf(0.01f, speed));
    updateCounter++;
    if (updateCounter >= shiftInterval) {
        updateCounter = 0;
        bandCenter = rng.nextFloat();  // random center in [0,1] normalized frequency
        bandWidth = 0.05f + rng.nextFloat() * 0.25f;  // 5-30% of spectrum
    }

    // Base alpha from speed: speed 0 → very slow refresh, speed 1 → near-instant
    float alpha = speed * speed * 0.5f;  // quadratic curve, max 0.5 per frame

    for (int k = 0; k < numBins; k++) {
        float normFreq = (float)k / (float)numBins;

        // Band-limited component: Gaussian-ish bump around bandCenter
        float dist = fabsf(normFreq - bandCenter);
        // Wrap around for circular distance
        if (dist > 0.5f) dist = 1.0f - dist;
        float bandMask = expf(-dist * dist / (2.0f * bandWidth * bandWidth));

        // Random speckle: sparse random refresh across all bins
        float speckleMask = (rng.nextFloat() < alpha * 0.3f) ? 1.0f : 0.0f;

        // Combined mask: band region refreshes smoothly, speckle adds sparse global refresh
        mask[k] = fminf(1.0f, alpha * (bandMask * 0.7f + speckleMask * 0.3f));
    }
}

// ═══════════════ Process one STFT hop ═══════════════

static void processHop() {
    SpectralFreezeState& s = g_sf;

    // ── Analyze current frame ──
    analyzeFrame(s.inputRingL, s.ringWritePos, s.magL, s.phaseL, s.fftRe, s.fftIm);
    analyzeFrame(s.inputRingR, s.ringWritePos, s.magR, s.phaseR, s.fftRe, s.fftIm);

    // Estimate instantaneous frequency
    float ifL[HALF_FFT], ifR[HALF_FFT];
    estimateIF(s.phaseL, s.prevPhaseL, ifL);
    estimateIF(s.phaseR, s.prevPhaseR, ifR);

    // Save current phase for next frame's IF estimation
    memcpy(s.prevPhaseL, s.phaseL, sizeof(float) * HALF_FFT);
    memcpy(s.prevPhaseR, s.phaseR, sizeof(float) * HALF_FFT);

    // ── Freeze logic ──
    float fzRamp = s.freezeRamp;

    if (s.justFroze) {
        // Capture: snapshot current spectrum as the held state
        memcpy(s.heldMagL, s.magL, sizeof(float) * HALF_FFT);
        memcpy(s.heldMagR, s.magR, sizeof(float) * HALF_FFT);
        memcpy(s.heldIFL, ifL, sizeof(float) * HALF_FFT);
        memcpy(s.heldIFR, ifR, sizeof(float) * HALF_FFT);
        memcpy(s.synthPhaseL, s.phaseL, sizeof(float) * HALF_FFT);
        memcpy(s.synthPhaseR, s.phaseR, sizeof(float) * HALF_FFT);
        s.justFroze = 0;
    }

    // Determine output magnitudes and phase advance
    float outMagL[HALF_FFT], outMagR[HALF_FFT];

    if (fzRamp < 0.01f) {
        // Not frozen: pass through (analysis → resynthesis = transparent)
        memcpy(outMagL, s.magL, sizeof(float) * HALF_FFT);
        memcpy(outMagR, s.magR, sizeof(float) * HALF_FFT);
        // Use live phase directly
        for (int k = 0; k < HALF_FFT; k++) {
            s.synthPhaseL[k] = s.phaseL[k];
            s.synthPhaseR[k] = s.phaseR[k];
        }
    } else if (s.slushyMode && fzRamp > 0.5f) {
        // ── Slushy freeze: masked partial refresh ──
        float mask[HALF_FFT];
        generateSlushyMask(mask, HALF_FFT, s.slushySpeed, s.rng,
                           s.maskBandCenter, s.maskBandWidth, s.maskUpdateCounter);

        for (int k = 0; k < HALF_FFT; k++) {
            float m = mask[k];
            // Blend held magnitudes with live input
            s.heldMagL[k] = (1.0f - m) * s.heldMagL[k] + m * s.magL[k];
            s.heldMagR[k] = (1.0f - m) * s.heldMagR[k] + m * s.magR[k];
            // Also blend IF for smoother transitions
            s.heldIFL[k] = (1.0f - m * 0.5f) * s.heldIFL[k] + m * 0.5f * ifL[k];
            s.heldIFR[k] = (1.0f - m * 0.5f) * s.heldIFR[k] + m * 0.5f * ifR[k];
        }

        // Advance synthesis phase using blended IF
        for (int k = 0; k < HALF_FFT; k++) {
            s.synthPhaseL[k] += s.heldIFL[k];
            s.synthPhaseR[k] += s.heldIFR[k];
        }

        // Crossfade output magnitude: live × (1−ramp) + held × ramp
        for (int k = 0; k < HALF_FFT; k++) {
            outMagL[k] = s.magL[k] * (1.0f - fzRamp) + s.heldMagL[k] * fzRamp;
            outMagR[k] = s.magR[k] * (1.0f - fzRamp) + s.heldMagR[k] * fzRamp;
        }
    } else {
        // ── Solid freeze: static held spectrum ──
        // Advance synthesis phase using held instantaneous frequency
        for (int k = 0; k < HALF_FFT; k++) {
            s.synthPhaseL[k] += s.heldIFL[k];
            s.synthPhaseR[k] += s.heldIFR[k];
        }

        // Crossfade magnitude: live × (1−ramp) + held × ramp
        for (int k = 0; k < HALF_FFT; k++) {
            outMagL[k] = s.magL[k] * (1.0f - fzRamp) + s.heldMagL[k] * fzRamp;
            outMagR[k] = s.magR[k] * (1.0f - fzRamp) + s.heldMagR[k] * fzRamp;
        }
    }

    // ── Resynthesize ──
    int olaPos = s.outputRingWritePos;

    // Clear the region we're about to write into (only the hop-sized new portion)
    for (int i = 0; i < HOP_SIZE; i++) {
        int idx = (olaPos + FFT_SIZE - HOP_SIZE + i) % (FFT_SIZE * 2);
        // Don't clear — the overlap-add accumulates appropriately
    }

    synthesizeFrame(outMagL, s.synthPhaseL, s.outputRingL, olaPos, s.fftRe, s.fftIm);
    synthesizeFrame(outMagR, s.synthPhaseR, s.outputRingR, olaPos, s.fftRe, s.fftIm);

    // Advance OLA write position by hop
    s.outputRingWritePos = (olaPos + HOP_SIZE) % (FFT_SIZE * 2);
}

// ═══════════════ Public C API ═══════════════

extern "C" {

int spectral_freeze_init(float sample_rate) {
    memset(&g_sf, 0, sizeof(g_sf));
    g_sf.sampleRate = sample_rate;
    g_sf.initialized = 1;
    g_sf.hopCounter = HOP_SIZE;  // trigger first analysis immediately
    g_sf.mix = 1.0f;
    g_sf.rng.seed(42);
    g_sf.maskBandCenter = 0.5f;
    g_sf.maskBandWidth = 0.15f;
    initWindow();
    return 0;
}

void spectral_freeze_destroy() {
    g_sf.initialized = 0;
}

float* spectral_freeze_get_input_ptr() {
    return g_sf.inputBuf;
}

float* spectral_freeze_get_output_ptr() {
    return g_sf.outputBuf;
}

void spectral_freeze_set_freeze(int active) {
    if (active && !g_sf.freezeActive) {
        g_sf.justFroze = 1;  // trigger capture on next hop
    }
    g_sf.freezeActive = active;
}

void spectral_freeze_set_slushy(int slushy) {
    g_sf.slushyMode = slushy;
}

void spectral_freeze_set_speed(float speed) {
    g_sf.slushySpeed = fmaxf(0.0f, fminf(1.0f, speed));
}

void spectral_freeze_set_mix(float mix) {
    g_sf.mix = fmaxf(0.0f, fminf(1.0f, mix));
}

void spectral_freeze_process_block(int block_size) {
    if (!g_sf.initialized || block_size <= 0) return;
    if (block_size > MAX_BLOCK_SIZE) block_size = MAX_BLOCK_SIZE;

    SpectralFreezeState& s = g_sf;

    // Smooth freeze ramp (~100ms transition)
    float rampTarget = s.freezeActive ? 1.0f : 0.0f;
    float rampSpeed = (float)block_size / (0.1f * s.sampleRate);

    for (int i = 0; i < block_size; i++) {
        float inL = s.inputBuf[i * 2];
        float inR = s.inputBuf[i * 2 + 1];

        // Smooth ramp
        s.freezeRamp += (rampTarget - s.freezeRamp) * fminf(1.0f, rampSpeed);

        // Write to input ring buffer
        s.inputRingL[s.ringWritePos] = inL;
        s.inputRingR[s.ringWritePos] = inR;
        s.ringWritePos = (s.ringWritePos + 1) % FFT_SIZE;

        // Check if it's time for a new hop
        s.hopCounter--;
        if (s.hopCounter <= 0) {
            s.hopCounter = HOP_SIZE;

            // Clear the new OLA output region before accumulating
            int clearStart = s.outputRingWritePos;
            for (int j = 0; j < FFT_SIZE; j++) {
                int idx = (clearStart + j) % (FFT_SIZE * 2);
                // Only clear the region that hasn't been read yet
                // Actually, clear entire frame region for clean overlap-add
            }
            // Zero the upcoming frame region
            for (int j = 0; j < FFT_SIZE; j++) {
                int idx = (s.outputRingWritePos + j) % (FFT_SIZE * 2);
                s.outputRingL[idx] = 0.0f;
                s.outputRingR[idx] = 0.0f;
            }

            processHop();
        }

        // Read from overlap-add output ring
        float wetL = s.outputRingL[s.outputRingReadPos];
        float wetR = s.outputRingR[s.outputRingReadPos];

        // Normalize overlap-add gain (4x overlap with Hann window → divide by sum of squared windows)
        // For Hann window with 4x overlap, the COLA normalization is 1.5 (sum of squared Hann at 4x)
        // But we use analysis+synthesis windows, so normalization = 2/3 * OVERLAP_FACTOR = 8/3
        // Empirical: 4x overlap Hann analysis+synthesis → scale by 2/(3*OVERLAP_FACTOR) ≈ 0.1667
        // Actually for Hann COLA with hop = N/4: sum of w² = 1.5 → scale = 1/1.5 = 0.6667
        wetL *= (2.0f / 3.0f);
        wetR *= (2.0f / 3.0f);

        // Clear the sample we just read (so it's clean for next OLA cycle)
        s.outputRingL[s.outputRingReadPos] = 0.0f;
        s.outputRingR[s.outputRingReadPos] = 0.0f;
        s.outputRingReadPos = (s.outputRingReadPos + 1) % (FFT_SIZE * 2);

        // Mix: dry/wet blend
        float m = s.mix;
        s.outputBuf[i * 2]     = inL * (1.0f - m) + wetL * m;
        s.outputBuf[i * 2 + 1] = inR * (1.0f - m) + wetR * m;
    }
}

} // extern "C"
