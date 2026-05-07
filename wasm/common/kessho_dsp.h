/**
 * Kessho DSP Utilities — Shared header-only DSP primitives
 *
 * Used by all Kessho WASM synth engines (drum, lead-fm, pad, granular, reverb).
 * Pure C++17, no external dependencies, designed for Emscripten WASM + native ARM.
 *
 * Includes:
 *   - Fast math approximations (sin, tanh, exp)
 *   - Wavetable oscillators (sine, triangle, saw, square) with PolyBLEP
 *   - State Variable Filter (SVF) — topology-preserving
 *   - Biquad filters (low shelf, peaking EQ)
 *   - ADSR envelope generator
 *   - LFSR/xoshiro128+ noise generators
 *   - Delay line with fractional-sample interpolation
 *   - Stereo ping-pong delay effect
 */

#ifndef KESSHO_DSP_H
#define KESSHO_DSP_H

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define KESSHO_TWO_PI    6.28318530717958647692f
#define KESSHO_HALF_PI   1.57079632679489661923f
#define KESSHO_INV_TWO_PI (1.0f / KESSHO_TWO_PI)

// ═══════════════════════════════════════════════════════════════════════════════
// Fast Math
// ═══════════════════════════════════════════════════════════════════════════════

namespace kessho {

/** Fast sine approximation (5th-order polynomial, max error ~0.0002). */
inline float fast_sinf(float x) {
    // Wrap to [-π, π]
    x = x - KESSHO_TWO_PI * floorf(x * KESSHO_INV_TWO_PI + 0.5f);
    const float x2 = x * x;
    return x * (1.0f - x2 * (0.16666667f - x2 * (0.00833333f - x2 * 0.000198413f)));
}

/** Fast cosine via fast_sinf. */
inline float fast_cosf(float x) {
    return fast_sinf(x + KESSHO_HALF_PI);
}

/** Fast tanh approximation (rational, max error ~0.001). */
inline float fast_tanhf(float x) {
    if (x < -3.0f) return -1.0f;
    if (x >  3.0f) return  1.0f;
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

/** Fast exp approximation for envelopes (accurate for x in [-10, 0]). */
inline float fast_expf(float x) {
    // Schraudolph's method with adjustment
    x = 1.0f + x / 256.0f;
    x *= x; x *= x; x *= x; x *= x;
    x *= x; x *= x; x *= x; x *= x;
    return x;
}

/** Linear interpolation. */
inline float lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

/** Clamp to [min, max]. */
inline float clampf(float x, float lo, float hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

/** dB to linear gain. */
inline float db_to_gain(float db) {
    return powf(10.0f, db * 0.05f);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sine Lookup Table
// ═══════════════════════════════════════════════════════════════════════════════

#define KESSHO_SINE_TABLE_SIZE 2048

struct SineTable {
    float table[KESSHO_SINE_TABLE_SIZE + 1]; // +1 for linear interpolation guard

    void init() {
        for (int i = 0; i <= KESSHO_SINE_TABLE_SIZE; i++) {
            table[i] = sinf(KESSHO_TWO_PI * (float)i / (float)KESSHO_SINE_TABLE_SIZE);
        }
    }

    /** Lookup with linear interpolation. Phase is 0..1. */
    float lookup(float phase) const {
        const float idx = phase * (float)KESSHO_SINE_TABLE_SIZE;
        const int i0 = (int)idx;
        const float frac = idx - (float)i0;
        return table[i0] + frac * (table[i0 + 1] - table[i0]);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Oscillators
// ═══════════════════════════════════════════════════════════════════════════════

/** PolyBLEP residual for anti-aliased waveforms. dt = freq/sampleRate. */
inline float poly_blep(float t, float dt) {
    if (t < dt) {
        t /= dt;
        return t + t - t * t - 1.0f;
    } else if (t > 1.0f - dt) {
        t = (t - 1.0f) / dt;
        return t * t + t + t + 1.0f;
    }
    return 0.0f;
}

/** Waveform types for oscillators. */
enum Waveform {
    WAVE_SINE = 0,
    WAVE_TRIANGLE = 1,
    WAVE_SAWTOOTH = 2,
    WAVE_SQUARE = 3,
};

/** Stateful oscillator with phase accumulator and anti-aliasing. */
struct Oscillator {
    float phase = 0.0f;
    float freq = 440.0f;

    /** Advance phase by one sample. Returns new phase (0..1). */
    float advance(float sample_rate) {
        float dt = freq / sample_rate;
        phase += dt;
        if (phase >= 1.0f) phase -= 1.0f;
        if (phase < 0.0f) phase += 1.0f;
        return phase;
    }

    /** Generate one sample of the given waveform. Call advance() first. */
    float generate(Waveform wave, float sample_rate, const SineTable& sine) const {
        const float dt = freq / sample_rate;
        switch (wave) {
            case WAVE_SINE:
                return sine.lookup(phase);
            case WAVE_TRIANGLE: {
                float v = 2.0f * fabsf(2.0f * phase - 1.0f) - 1.0f;
                return v;
            }
            case WAVE_SAWTOOTH: {
                float v = 2.0f * phase - 1.0f;
                v -= poly_blep(phase, dt);
                return v;
            }
            case WAVE_SQUARE: {
                float v = (phase < 0.5f) ? 1.0f : -1.0f;
                v += poly_blep(phase, dt);
                v -= poly_blep(fmodf(phase + 0.5f, 1.0f), dt);
                return v;
            }
            default:
                return 0.0f;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// State Variable Filter (SVF) — Topology-Preserving
// ═══════════════════════════════════════════════════════════════════════════════

enum SVFMode {
    SVF_LOWPASS = 0,
    SVF_HIGHPASS = 1,
    SVF_BANDPASS = 2,
    SVF_NOTCH = 3,
    SVF_PEAK = 4,
};

struct SVF {
    float ic1eq = 0.0f;
    float ic2eq = 0.0f;

    /** Reset filter state. */
    void reset() { ic1eq = 0.0f; ic2eq = 0.0f; }

    /**
     * Process one sample through the SVF.
     * @param input   Input sample
     * @param cutoff  Cutoff frequency in Hz
     * @param q       Q factor (0.5 = no resonance, higher = more resonant)
     * @param sr      Sample rate
     * @param mode    Filter mode
     * @return Filtered sample
     */
    float process(float input, float cutoff, float q, float sr, SVFMode mode) {
        const float g = tanf(M_PI * clampf(cutoff, 20.0f, sr * 0.49f) / sr);
        const float k = 1.0f / std::max(0.01f, q);
        const float a1 = 1.0f / (1.0f + g * (g + k));
        const float a2 = g * a1;
        const float a3 = g * a2;

        const float v3 = input - ic2eq;
        const float v1 = a1 * ic1eq + a2 * v3;
        const float v2 = ic2eq + a2 * ic1eq + a3 * v3;
        ic1eq = 2.0f * v1 - ic1eq;
        ic2eq = 2.0f * v2 - ic2eq;

        switch (mode) {
            case SVF_LOWPASS:  return v2;
            case SVF_HIGHPASS: return input - k * v1 - v2;
            case SVF_BANDPASS: return v1;
            case SVF_NOTCH:    return input - k * v1;
            case SVF_PEAK:     return 2.0f * v2 - input + k * v1;
            default:           return v2;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Biquad Filter (for shelving and peaking EQ)
// ═══════════════════════════════════════════════════════════════════════════════

struct Biquad {
    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f;
    float a1 = 0.0f, a2 = 0.0f;
    float z1 = 0.0f, z2 = 0.0f;

    void reset() { z1 = 0.0f; z2 = 0.0f; }

    /** Configure as low shelf filter. */
    void set_low_shelf(float freq, float gain_db, float sr) {
        const float A = powf(10.0f, gain_db / 40.0f);
        const float w0 = KESSHO_TWO_PI * freq / sr;
        const float cs = cosf(w0);
        const float sn = sinf(w0);
        const float alpha = sn / (2.0f * 0.707f);
        const float sqrtA2alpha = 2.0f * sqrtf(A) * alpha;

        const float a0_inv = 1.0f / ((A + 1.0f) + (A - 1.0f) * cs + sqrtA2alpha);
        b0 = A * ((A + 1.0f) - (A - 1.0f) * cs + sqrtA2alpha) * a0_inv;
        b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * cs) * a0_inv;
        b2 = A * ((A + 1.0f) - (A - 1.0f) * cs - sqrtA2alpha) * a0_inv;
        a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * cs) * a0_inv;
        a2 = ((A + 1.0f) + (A - 1.0f) * cs - sqrtA2alpha) * a0_inv;
    }

    /** Configure as peaking EQ filter. */
    void set_peaking(float freq, float gain_db, float bw_q, float sr) {
        const float safe_q = std::max(0.001f, bw_q);
        const float A = powf(10.0f, gain_db / 40.0f);
        const float w0 = KESSHO_TWO_PI * freq / sr;
        const float cs = cosf(w0);
        const float sn = sinf(w0);
        const float alpha = sn / (2.0f * safe_q);

        const float a0_inv = 1.0f / (1.0f + alpha / A);
        b0 = (1.0f + alpha * A) * a0_inv;
        b1 = (-2.0f * cs) * a0_inv;
        b2 = (1.0f - alpha * A) * a0_inv;
        a1 = b1; // same
        a2 = (1.0f - alpha / A) * a0_inv;
    }

    /** Configure as 1-pole lowpass (for delay feedback darkening). */
    void set_onepole_lp(float freq, float sr) {
        const float w = KESSHO_TWO_PI * freq / sr;
        const float c = 2.0f - cosf(w);
        const float coeff = c - sqrtf(c * c - 1.0f);
        b0 = 1.0f - coeff;
        b1 = 0.0f;
        b2 = 0.0f;
        a1 = -coeff;
        a2 = 0.0f;
    }

    /** Process one sample (Direct Form II Transposed). */
    float process(float input) {
        const float output = b0 * input + z1;
        z1 = b1 * input - a1 * output + z2;
        z2 = b2 * input - a2 * output;
        return output;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADSR Envelope Generator
// ═══════════════════════════════════════════════════════════════════════════════

enum EnvStage {
    ENV_OFF = 0,
    ENV_ATTACK = 1,
    ENV_DECAY = 2,
    ENV_SUSTAIN = 3,
    ENV_RELEASE = 4,
};

struct ADSREnvelope {
    float value = 0.0f;
    EnvStage stage = ENV_OFF;
    float attack = 0.01f;   // seconds
    float decay = 0.1f;     // seconds
    float sustain = 0.7f;   // level 0..1
    float release = 0.3f;   // seconds

    void reset() { value = 0.0f; stage = ENV_OFF; }

    void gate_on() {
        stage = ENV_ATTACK;
    }

    void gate_off() {
        if (stage != ENV_OFF) stage = ENV_RELEASE;
    }

    /** Process one sample. Returns envelope value 0..1. */
    float process(float sr) {
        const float inv_sr = 1.0f / sr;
        switch (stage) {
            case ENV_ATTACK: {
                const float rate = (attack > 0.001f) ? inv_sr / attack : 1.0f;
                value += rate;
                if (value >= 1.0f) {
                    value = 1.0f;
                    stage = ENV_DECAY;
                }
                break;
            }
            case ENV_DECAY: {
                const float rate = (decay > 0.001f) ? inv_sr / decay : 1.0f;
                // Exponential decay toward sustain
                value -= (value - sustain) * (1.0f - fast_expf(-rate * 5.0f));
                if (value <= sustain + 0.0001f) {
                    value = sustain;
                    stage = ENV_SUSTAIN;
                }
                break;
            }
            case ENV_SUSTAIN:
                value = sustain;
                break;
            case ENV_RELEASE: {
                const float rate = (release > 0.001f) ? inv_sr / release : 1.0f;
                value -= value * (1.0f - fast_expf(-rate * 5.0f));
                if (value < 0.0001f) {
                    value = 0.0f;
                    stage = ENV_OFF;
                }
                break;
            }
            case ENV_OFF:
            default:
                value = 0.0f;
                break;
        }
        return value;
    }
};

/** Simple Attack-Decay envelope (no sustain/release). */
struct ADEnvelope {
    float value = 0.0f;
    bool  attacking = false;
    bool  active = false;
    float attack = 0.001f;  // seconds
    float peak = 1.0f;
    float decay = 0.1f;     // seconds
    int   decay_samples_remaining = -1;
    float decay_multiplier = 1.0f;

    void reset() {
        value = 0.0f;
        attacking = false;
        active = false;
        decay_samples_remaining = -1;
        decay_multiplier = 1.0f;
    }

    void trigger(float p, float att, float dec) {
        peak = p;
        attack = std::max(0.0001f, att);
        decay = std::max(0.001f, dec);
        active = true;
        decay_samples_remaining = -1;
        decay_multiplier = 1.0f;
        if (attack > 0.0005f) {
            value = 0.0f;
            attacking = true;
        } else {
            value = peak;
            attacking = false;
        }
    }

    void begin_decay(float sr) {
        decay_samples_remaining = std::max(1, (int)ceilf(decay * sr));
        const float target = 0.001f;
        const float start = std::max(fabsf(value), target);
        decay_multiplier = powf(target / start, 1.0f / (float)decay_samples_remaining);
    }

    /** Process one sample. Returns envelope value. */
    float process(float sr) {
        if (!active) return 0.0f;
        if (attacking) {
            value += peak * (1.0f / (attack * sr));
            if (value >= peak * 0.999f) {
                value = peak;
                attacking = false;
                decay_samples_remaining = -1;
            }
        } else {
            if (decay_samples_remaining < 0) {
                begin_decay(sr);
            }
            value *= decay_multiplier;
            decay_samples_remaining -= 1;
            if (decay_samples_remaining <= 0 || value < 0.0001f) {
                value = 0.0f;
                active = false;
            }
        }
        return value;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Noise Generators
// ═══════════════════════════════════════════════════════════════════════════════

/** xoshiro128+ PRNG — lightweight, high-quality. */
struct PRNG {
    uint32_t s[4];

    void seed(uint32_t seed) {
        s[0] = seed;
        s[1] = seed * 2654435761u;
        s[2] = seed * 2246822519u;
        s[3] = seed * 3266489917u;
        // Warm up
        for (int i = 0; i < 16; i++) next();
    }

    uint32_t next() {
        const uint32_t result = s[0] + s[3];
        const uint32_t t = s[1] << 9;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = (s[3] << 11) | (s[3] >> 21);
        return result;
    }

    /** Uniform float in [-1, 1]. */
    float next_bipolar() {
        return (float)(int32_t)next() * (1.0f / 2147483648.0f);
    }

    /** Uniform float in [0, 1]. */
    float next_unipolar() {
        return (float)next() * (1.0f / 4294967296.0f);
    }

    /** Triangular distribution (sum of two uniforms, centered at 0). */
    float next_triangular() {
        return next_unipolar() + next_unipolar() - 1.0f;
    }
};

/**
 * xmur3 hash — matches JS `xmur3()` exactly for cross-platform seed parity.
 * Produces uint32 values from a string seed.
 */
struct Xmur3 {
    uint32_t h;

    void init(const char* str, int len) {
        h = 1779033703u ^ (uint32_t)len;
        for (int i = 0; i < len; i++) {
            h ^= (uint32_t)(unsigned char)str[i];
            // imul equivalent: full 32-bit multiply, keep low 32 bits
            h = (uint32_t)((uint64_t)h * 3432918353ull);
            h = (h << 13) | (h >> 19);
        }
    }

    uint32_t next() {
        h = (uint32_t)((uint64_t)(h ^ (h >> 16)) * 2246822507ull);
        h = (uint32_t)((uint64_t)(h ^ (h >> 13)) * 3266489909ull);
        return (h ^= h >> 16) >> 0;
    }
};

/**
 * Mulberry32 PRNG — matches JS `mulberry32()` exactly for cross-platform
 * determinism. Returns float in [0, 1).
 */
struct Mulberry32 {
    uint32_t state;

    void seed(uint32_t s) { state = s; }

    /** Seed from a string (using xmur3 hash, matching JS createRng). */
    void seed_from_string(const char* str, int len) {
        Xmur3 hash;
        hash.init(str, len);
        state = hash.next();
    }

    /** Next uint32 (full 32-bit). */
    uint32_t next_u32() {
        uint32_t t = (state += 0x6d2b79f5u);
        t = (uint32_t)((uint64_t)(t ^ (t >> 15)) * (uint64_t)(t | 1u));
        t ^= t + (uint32_t)((uint64_t)(t ^ (t >> 7)) * (uint64_t)(t | 61u));
        return (t ^ (t >> 14)) >> 0;
    }

    /** Next float in [0, 1) — matches JS mulberry32 output exactly. */
    float next() {
        return (float)next_u32() / 4294967296.0f;
    }

    /** Next float in [min, max]. */
    float next_range(float lo, float hi) {
        return lo + next() * (hi - lo);
    }

    /** Next int in [min, max] inclusive. */
    int next_int(int lo, int hi) {
        return lo + (int)(next() * (float)(hi - lo + 1));
    }
};

/** Pink noise filter (Paul Kellet's refined method). */
struct PinkNoise {
    float b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    void reset() { b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0; }

    float process(float white) {
        b0 = 0.99886f * b0 + white * 0.0555179f;
        b1 = 0.99332f * b1 + white * 0.0750759f;
        b2 = 0.96900f * b2 + white * 0.1538520f;
        b3 = 0.86650f * b3 + white * 0.3104856f;
        b4 = 0.55000f * b4 + white * 0.5329522f;
        b5 = -0.7616f * b5 - white * 0.0168980f;
        float pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362f) * 0.11f;
        b6 = white * 0.115926f;
        return pink;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Delay Line
// ═══════════════════════════════════════════════════════════════════════════════

struct DelayLine {
    float* buffer = nullptr;
    int    size = 0;
    int    write_pos = 0;

    void init(int max_samples) {
        size = max_samples;
        buffer = new float[size]();
    }

    void destroy() {
        delete[] buffer;
        buffer = nullptr;
        size = 0;
    }

    void reset() {
        if (buffer) memset(buffer, 0, size * sizeof(float));
        write_pos = 0;
    }

    void write(float sample) {
        buffer[write_pos] = sample;
        write_pos = (write_pos + 1) % size;
    }

    /** Read with linear interpolation for fractional delay. */
    float read(float delay_samples) const {
        const float read_pos = (float)write_pos - delay_samples;
        const int pos = (int)floorf(read_pos);
        const float frac = read_pos - (float)pos;
        const int i0 = ((pos % size) + size) % size;
        const int i1 = (i0 + 1) % size;
        return buffer[i0] + frac * (buffer[i1] - buffer[i0]);
    }

    /** Read at integer delay (no interpolation). */
    float read_int(int delay_samples) const {
        const int pos = ((write_pos - delay_samples) % size + size) % size;
        return buffer[pos];
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Stereo Ping-Pong Delay
// ═══════════════════════════════════════════════════════════════════════════════

struct StereoPingPongDelay {
    DelayLine line_l;
    DelayLine line_r;
    Biquad    filter_l;
    Biquad    filter_r;
    float     time_l = 0.0f;    // delay time in samples
    float     time_r = 0.0f;
    float     feedback = 0.4f;
    float     mix = 0.3f;
    bool      enabled = false;

    void init(int max_samples) {
        line_l.init(max_samples);
        line_r.init(max_samples);
        filter_l.reset();
        filter_r.reset();
    }

    void destroy() {
        line_l.destroy();
        line_r.destroy();
    }

    void reset() {
        line_l.reset();
        line_r.reset();
        filter_l.reset();
        filter_r.reset();
    }

    void set_filter(float cutoff_hz, float sr) {
        filter_l.set_onepole_lp(cutoff_hz, sr);
        filter_r.set_onepole_lp(cutoff_hz, sr);
    }

    /**
     * Process one stereo sample pair through the ping-pong delay.
     * @param in_l, in_r   Dry input
     * @param out_l, out_r  Output (dry + wet mixed)
     */
    void process_sample(float in_l, float in_r, float& out_l, float& out_r) {
        if (!enabled || mix < 0.001f) {
            out_l = in_l;
            out_r = in_r;
            return;
        }

        // Read from delay lines
        const float del_l = line_l.read(time_l);
        const float del_r = line_r.read(time_r);

        // Filter feedback
        const float filt_l = filter_l.process(del_l);
        const float filt_r = filter_r.process(del_r);

        // Cross-feed: L feedback → R, R feedback → L (ping-pong)
        line_l.write(in_l + filt_r * feedback);
        line_r.write(in_r + filt_l * feedback);

        // Mix dry + wet
        out_l = in_l + filt_l * mix;
        out_r = in_r + filt_r * mix;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Saturation / Waveshaper
// ═══════════════════════════════════════════════════════════════════════════════

/** Pre-computed tanh waveshaper curve (256 points, linear interp). */
struct WaveshaperCurve {
    float table[256];
    float drive = 0.0f;

    /** Recompute curve for a given drive amount. */
    void set_drive(float d) {
        if (fabsf(d - drive) < 0.001f) return;
        drive = d;
        if (d < 0.001f) {
            // Identity (linear)
            for (int i = 0; i < 256; i++) {
                table[i] = (float)(i * 2) / 256.0f - 1.0f;
            }
        } else {
            const float denom = tanhf(d);
            for (int i = 0; i < 256; i++) {
                float x = (float)(i * 2) / 256.0f - 1.0f;
                table[i] = tanhf(x * d) / denom;
            }
        }
    }

    /** Apply waveshaping to a sample. */
    float process(float input) const {
        // Map input [-1,1] to table index [0,255]
        const float idx = (input + 1.0f) * 127.5f;
        const int i0 = (int)clampf(idx, 0.0f, 254.0f);
        const float frac = idx - (float)i0;
        return table[i0] + frac * (table[i0 + 1] - table[i0]);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Wave Folder (Buchla 259 / Sinusoidal / Serge)
// ═══════════════════════════════════════════════════════════════════════════════

#define FOLD_BUCHLA 0
#define FOLD_SINE   1
#define FOLD_SERGE  2

struct WaveFolder {
    float table[256];
    float cur_amount = -1.0f;
    int   cur_mode   = -1;

    void set_fold(float amount, int mode) {
        if (fabsf(amount - cur_amount) < 0.001f && mode == cur_mode) return;
        cur_amount = amount;
        cur_mode   = mode;
        const float gain = 1.0f + amount * 7.0f;   // 1..8x gain range
        for (int i = 0; i < 256; i++) {
            float x = (float)(i * 2) / 256.0f - 1.0f;  // [-1, 1]
            float xg = x * gain;
            switch (mode) {
                case FOLD_SINE:
                    table[i] = sinf(xg * 1.5707963f);  // sin(x·gain·π/2)
                    break;
                case FOLD_SERGE: {
                    // 3-stage tanh cascade
                    float s = tanhf(xg);
                    s = tanhf(s * gain * 0.5f);
                    s = tanhf(s * gain * 0.25f);
                    table[i] = s;
                    break;
                }
                default: // FOLD_BUCHLA – triangle foldback
                    table[i] = 4.0f * fabsf(0.25f * xg - floorf(0.25f * xg + 0.5f)) - 1.0f;
                    break;
            }
        }
    }

    float process(float input) const {
        const float idx = (input + 1.0f) * 127.5f;
        const int i0 = (int)clampf(idx, 0.0f, 254.0f);
        const float frac = idx - (float)i0;
        return table[i0] + frac * (table[i0 + 1] - table[i0]);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Pitch Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/** Convert semitones to frequency ratio. */
inline float semitones_to_ratio(float semitones) {
    return powf(2.0f, semitones / 12.0f);
}

/** A=432Hz tuning ratio (vs A=440Hz). */
constexpr float A432_RATIO = 432.0f / 440.0f;

} // namespace kessho

#endif // KESSHO_DSP_H
