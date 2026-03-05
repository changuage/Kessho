/**
 * Kessho Soundscapes — C++ / WASM Audio Engine
 *
 * Ports water.worklet.js (~2200 ops/sample) + insects.worklet.js (~550 ops/sample)
 * to C++ with fast approximations, eliminating per-sample trig calls and allocations.
 *
 * Build: emcc kessho_soundscapes.cpp -o kessho_soundscapes.wasm -O3 -msimd128 ...
 */

#include <cmath>
#include <cstring>
#include <cstdint>
#include "kessho_soundscapes.h"

// ═══════════════════════════════════════════════════════════
//  FAST MATH APPROXIMATIONS
// ═══════════════════════════════════════════════════════════

static constexpr float PI_F  = 3.14159265358979323846f;
static constexpr float TAU_F = 6.28318530717958647692f;

// Fast sin approximation: Bhaskara I-inspired, max error ~0.001
// Input MUST be in [0, TAU)
static inline float fast_sin_0tau(float x) {
    // Normalize to [0, PI], handle sign
    float sign = 1.0f;
    if (x > PI_F) { x -= PI_F; sign = -1.0f; }
    // Parabolic approximation: 16x(π-x) / (5π² - 4x(π-x))
    float b = x * (PI_F - x);
    return sign * (16.0f * b) / (5.0f * PI_F * PI_F - 4.0f * b);
}

// General fast sin (any input)
static inline float fast_sin(float x) {
    // Reduce to [0, TAU)
    x = fmodf(x, TAU_F);
    if (x < 0.0f) x += TAU_F;
    return fast_sin_0tau(x);
}

static inline float fast_cos(float x) {
    return fast_sin(x + PI_F * 0.5f);
}

// Fast tanh (rational approx, good for soft clipping)
static inline float fast_tanh(float x) {
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

// Fast exponential decay: pow(base, exp) for base in [0,1]
// exp(exp * ln(base)) ≈ using fast exp
static inline float fast_exp(float x) {
    // Schraudolph's approx, rough but fast
    union { float f; int32_t i; } v;
    v.i = (int32_t)(12102203.0f * x + 1065353216.0f);
    return v.f;
}

static inline float fast_pow_decay(float base, float exp_val) {
    if (base <= 0.0f) return 0.0f;
    if (base >= 1.0f) return 1.0f;
    return fast_exp(exp_val * logf(base));
}

// Fast pow_decay with precomputed log(base) — avoids per-sample logf()
static inline float fast_pow_decay_prelog(float log_base, float exp_val) {
    return fast_exp(exp_val * log_base);
}

// Fast pow for small exponents (1.5, 2.2 etc) — avoids libm powf()
// x^1.5 = x * sqrt(x)
static inline float fast_pow_1_5(float x) {
    return x * sqrtf(x);
}
// x^n for arbitrary n via exp(n*ln(x)), using fast_exp
static inline float fast_powf(float base, float exp_val) {
    if (base <= 0.0f) return 0.0f;
    return fast_exp(exp_val * logf(base));
}

// ═══════════════════════════════════════════════════════════
//  SEEDED PRNG (Mulberry32 — matches JS version)
// ═══════════════════════════════════════════════════════════

struct Rng {
    uint32_t state;
};

static inline float rng_next(Rng* r) {
    uint32_t t = (r->state += 0x6D2B79F5u);
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return (float)((t ^ (t >> 14)) >> 0) / 4294967296.0f;
}

static inline float rng_range(Rng* r, float lo, float hi) {
    return lo + rng_next(r) * (hi - lo);
}

static inline int rng_int(Rng* r, int lo, int hi) {
    return lo + (int)(rng_next(r) * (float)(hi - lo + 1));
}

// ═══════════════════════════════════════════════════════════
//  DSP PRIMITIVES
// ═══════════════════════════════════════════════════════════

// ── OnePole: single-pole IIR lowpass ──
struct OnePole {
    float z1;
    float coeff;
};

static inline float onepole_process(OnePole* f, float x) {
    f->z1 = x * (1.0f - f->coeff) + f->z1 * f->coeff;
    return f->z1;
}

static inline void onepole_set_freq(OnePole* f, float freq, float sr) {
    float w = TAU_F * freq / sr;
    if (w > 0.99f) w = 0.99f;
    f->coeff = 1.0f - w;
    if (f->coeff < 0.0f) f->coeff = 0.0f;
    if (f->coeff > 0.9999f) f->coeff = 0.9999f;
}

// ── DC Blocker ──
struct DCBlocker {
    float x1, y1;
};

static inline float dc_block(DCBlocker* b, float x) {
    float y = x - b->x1 + 0.9975f * b->y1;  // matches JS
    b->x1 = x;
    b->y1 = y;
    return y;
}

// ── Biquad Filter (Direct Form I) ──
struct Biquad {
    float b0, b1, b2, a1, a2;
    float x1, x2, y1, y2;
};

static inline float biquad_process(Biquad* f, float x) {
    float y = f->b0 * x + f->b1 * f->x1 + f->b2 * f->x2
            - f->a1 * f->y1 - f->a2 * f->y2;
    f->x2 = f->x1; f->x1 = x;
    f->y2 = f->y1; f->y1 = y;
    return y;
}

static void biquad_set_lowpass(Biquad* f, float freq, float Q, float sr) {
    float w0 = TAU_F * freq / sr;
    float s = fast_sin(w0);
    float c = fast_cos(w0);
    float alpha = s / (2.0f * Q);
    float a0 = 1.0f + alpha;
    float inv_a0 = 1.0f / a0;
    f->b0 = ((1.0f - c) * 0.5f) * inv_a0;
    f->b1 = (1.0f - c) * inv_a0;
    f->b2 = f->b0;
    f->a1 = (-2.0f * c) * inv_a0;
    f->a2 = (1.0f - alpha) * inv_a0;
}

static void biquad_set_highpass(Biquad* f, float freq, float Q, float sr) {
    float w0 = TAU_F * freq / sr;
    float s = fast_sin(w0);
    float c = fast_cos(w0);
    float alpha = s / (2.0f * Q);
    float a0 = 1.0f + alpha;
    float inv_a0 = 1.0f / a0;
    f->b0 = ((1.0f + c) * 0.5f) * inv_a0;
    f->b1 = -(1.0f + c) * inv_a0;
    f->b2 = f->b0;
    f->a1 = (-2.0f * c) * inv_a0;
    f->a2 = (1.0f - alpha) * inv_a0;
}

static void biquad_set_bandpass(Biquad* f, float freq, float Q, float sr) {
    float w0 = TAU_F * freq / sr;
    float s = fast_sin(w0);
    float c = fast_cos(w0);
    float alpha = s / (2.0f * Q);
    float a0 = 1.0f + alpha;
    float inv_a0 = 1.0f / a0;
    f->b0 = alpha * inv_a0;
    f->b1 = 0.0f;
    f->b2 = -alpha * inv_a0;
    f->a1 = (-2.0f * c) * inv_a0;
    f->a2 = (1.0f - alpha) * inv_a0;
}

static inline void biquad_reset(Biquad* f) {
    f->x1 = f->x2 = f->y1 = f->y2 = 0.0f;
}

// ═══════════════════════════════════════════════════════════
//  DRIFTING RESONATOR (modal oscillator with freq drift)
//  Matches JS: time-limited drift with shaped curve
// ═══════════════════════════════════════════════════════════

struct DriftingResonator {
    float phase;
    float amplitude;
    float frequency;       // current freq Hz
    float start_freq;      // freq at trigger
    float target_freq;     // end freq after drift
    float decay;           // per-sample multiplicative decay
    int   drift_samples;   // remaining drift samples
    int   total_drift_samples;
    int   drift_mode;      // 0=linear, 1=exp
    float drift_exponent;  // for exp mode
    float sample_rate;
    int   active;
};

static inline float drifting_resonator_tick(DriftingResonator* r, float sr) {
    if (!r->active || r->amplitude < 0.00001f) {
        r->active = 0;
        return 0.0f;
    }
    
    // Frequency drift (time-limited, shaped)
    if (r->drift_samples > 0) {
        float prev_freq = r->frequency;
        if (r->drift_mode == 1 && r->total_drift_samples > 0) {
            // Exponential/power curve shaping
            int elapsed = r->total_drift_samples - r->drift_samples + 1;
            float t = (float)elapsed / (float)r->total_drift_samples;
            if (t < 0.0f) t = 0.0f;
            if (t > 1.0f) t = 1.0f;
            float shaped = fast_powf(t, r->drift_exponent);
            r->frequency = r->start_freq + (r->target_freq - r->start_freq) * shaped;
        } else {
            // Linear drift
            float drift_rate = (r->target_freq - r->start_freq) / (float)r->total_drift_samples;
            r->frequency += drift_rate;
        }
        // Keep drift strictly non-decreasing (no glide-back)
        if (r->frequency < prev_freq) r->frequency = prev_freq;
        r->drift_samples--;
    }
    
    float phase_inc = TAU_F * r->frequency / sr;
    float out = fast_sin(r->phase) * r->amplitude;
    r->phase += phase_inc;
    if (r->phase > TAU_F) r->phase -= TAU_F;
    r->amplitude *= r->decay;
    return out;
}

// Full trigger with time-limited drift (matches JS DriftingResonator)
static void drifting_resonator_trigger(DriftingResonator* r, float freq, float amp,
                                       float decay_time, float sr,
                                       float drift_amount, float drift_duration,
                                       int drift_mode, float drift_exponent) {
    r->phase = 0.0f;
    r->frequency = freq;
    r->start_freq = freq;
    r->target_freq = freq * (1.0f + drift_amount);  // drift UP (bubble shrinks)
    r->amplitude = amp;
    r->sample_rate = sr;
    r->drift_mode = drift_mode;
    r->drift_exponent = drift_exponent;
    
    r->drift_samples = (int)(drift_duration * sr);
    r->total_drift_samples = r->drift_samples;
    
    // Convert decay time (seconds) to per-sample multiplier
    r->decay = (decay_time > 0.0f) ? expf(-1.0f / (decay_time * sr)) : 0.999f;
    r->active = 1;
}

// Simple trigger (no drift) for glass/sink resonators
static void drifting_resonator_trigger_simple(DriftingResonator* r, float freq, float amp,
                                              float decay_time, float sr) {
    drifting_resonator_trigger(r, freq, amp, decay_time, sr, 0.0f, 0.0f, 0, 2.2f);
}

// ═══════════════════════════════════════════════════════════
//  WATER ENGINE — DROPLET VOICE (hard surface impact)
//  Matches JS DropletVoice: research-based realistic water drop
//  Impact transient (2-10ms) + damped multi-mode resonance + broadband tail
// ═══════════════════════════════════════════════════════════

#define WATER_MAX_HARD_VOICES   24
#define WATER_MAX_SOFT_VOICES   24
#define WATER_MODES_PER_DROP    5
#define WATER_BUBBLE_SUBVOICES  6
#define WATER_RIVULET_STREAMS   4

struct DropletVoice {
    int active;
    DriftingResonator modes[WATER_MODES_PER_DROP];
    
    // Impact transient (matches JS)
    Biquad impact_hpf;
    Biquad impact_bpf;
    float impact_env;
    float impact_decay;
    float impact_noise_state;
    float impact_tonal_mix;     // blend HPF/BPF (parallel, not serial)
    int   impact_delay_counter; // micro-delay before ring onset
    
    // Ring tone envelope (matches JS ringToneEnv)
    float ring_tone_env;
    float ring_tone_decay;
    
    // Broadband tail
    Biquad tail_bpf;
    float tail_env;
    float tail_decay;
    float tail_noise_state;
    
    // Plink HPF with LFO modulation (matches JS)
    Biquad plink_hpf;
    float plink_hpf_base_freq;
    float plink_hpf_freq;
    float plink_hpf_q;
    float plink_hpf_lfo_phase;
    float plink_hpf_lfo_rate;
    float plink_hpf_lfo_depth;
    float plink_hpf_jitter;
    int   plink_hpf_update_counter; // amortize coefficient recalc
    
    float pan_l, pan_r;
    int   samples_alive;
    int   max_samples;
};

static void droplet_trigger(DropletVoice* v, float base_freq, float hardness,
                            float drop_size, float decay_time, Rng* rng, float sr) {
    v->active = 1;
    v->samples_alive = 0;
    v->max_samples = (int)(sr * 0.6f);

    // Randomize per-drop characteristics (matches JS)
    float brightness = 0.3f + rng_next(rng) * 0.6f;
    float modal_spread = 0.03f + rng_next(rng) * 0.04f;
    float impact_to_ring = 0.4f + rng_next(rng) * 0.4f;
    v->impact_tonal_mix = 0.05f + rng_next(rng) * 0.08f;
    
    // Micro-delay 0-3ms before ring onset
    float ring_delay_ms = rng_next(rng) * 0.003f;
    v->impact_delay_counter = (int)(ring_delay_ms * sr);
    
    // Ring tone envelope (18-68ms)
    float ring_tone_ms = 0.018f + rng_next(rng) * 0.05f;
    v->ring_tone_env = 1.0f;
    v->ring_tone_decay = expf(-1.0f / (ring_tone_ms * sr));

    // ===== MODAL RESONATOR BANK (matches JS exactly) =====
    float freq_scale = 1.0f - drop_size * 0.6f;
    // JS: baseFreq * freqScale * (1.05 + rng()*0.85)
    float fundamental_freq = base_freq * freq_scale * (1.05f + rng_next(rng) * 0.85f);
    
    // Very short base decay
    float base_decay_ms = decay_time * 0.12f * (0.4f + drop_size * 0.6f);
    
    // Plink glide: upward pitch motion
    float drift_amount = 0.08f + rng_next(rng) * 0.08f;
    float drift_duration = 0.08f;
    
    // Mode 0: Main dominant mode
    float main_decay = base_decay_ms * (0.7f + rng_next(rng) * 0.6f);
    drifting_resonator_trigger(&v->modes[0],
        fundamental_freq,
        0.25f * (1.0f - impact_to_ring * 0.7f),
        main_decay, sr,
        drift_amount, drift_duration, 0, 2.2f);
    
    // Mode 1: Neighbor mode (-spread detune)
    float n1_detune = 1.0f - modal_spread * (0.5f + rng_next(rng) * 0.5f);
    float n1_decay = base_decay_ms * (0.5f + rng_next(rng) * 0.4f);
    drifting_resonator_trigger(&v->modes[1],
        fundamental_freq * n1_detune,
        0.12f * (1.0f - impact_to_ring * 0.5f),
        n1_decay, sr,
        drift_amount * 0.7f, drift_duration * 0.8f, 0, 2.2f);
    
    // Mode 2: Neighbor mode (+spread detune)
    float n2_detune = 1.0f + modal_spread * (0.5f + rng_next(rng) * 0.5f);
    float n2_decay = base_decay_ms * (0.4f + rng_next(rng) * 0.4f);
    drifting_resonator_trigger(&v->modes[2],
        fundamental_freq * n2_detune,
        0.10f * (1.0f - impact_to_ring * 0.5f),
        n2_decay, sr,
        drift_amount * 0.5f, drift_duration * 0.6f, 0, 2.2f);
    
    // Mode 3: Higher partial (2-3x, low level)
    float higher_ratio = 2.0f + rng_next(rng);
    float higher_decay = base_decay_ms * (0.15f + rng_next(rng) * 0.25f);
    drifting_resonator_trigger(&v->modes[3],
        fundamental_freq * higher_ratio,
        0.04f * (0.5f + rng_next(rng) * 0.5f),
        higher_decay, sr,
        0.0f, 0.0f, 0, 2.2f);
    
    // Mode 4: Optional very high partial (50% chance)
    if (rng_next(rng) > 0.5f) {
        drifting_resonator_trigger(&v->modes[4],
            fundamental_freq * (3.0f + rng_next(rng)),
            0.02f,
            base_decay_ms * 0.1f, sr,
            0.0f, 0.0f, 0, 2.2f);
    } else {
        v->modes[4].amplitude = 0.0f;
        v->modes[4].active = 0;
    }

    // ===== IMPACT TRANSIENT (matches JS) =====
    v->impact_env = hardness * (0.8f + rng_next(rng) * 0.4f);
    float impact_decay_ms = 0.002f + (1.0f - hardness) * 0.008f;
    v->impact_decay = expf(-1.0f / (impact_decay_ms * sr));
    
    // Impact HPF: 2000-10000 Hz (JS: 2000 + brightness*6000 + rng*2000)
    float impact_hpf_freq = 2000.0f + brightness * 6000.0f + rng_next(rng) * 2000.0f;
    if (impact_hpf_freq > sr * 0.4f) impact_hpf_freq = sr * 0.4f;
    biquad_set_highpass(&v->impact_hpf, impact_hpf_freq, 1.0f, sr);
    biquad_reset(&v->impact_hpf);
    
    // Impact BPF: 1400-6600 Hz  
    float impact_bpf_freq = 1400.0f + rng_next(rng) * 5200.0f;
    biquad_set_bandpass(&v->impact_bpf, impact_bpf_freq, 0.6f + rng_next(rng), sr);
    biquad_reset(&v->impact_bpf);
    
    v->impact_noise_state = 0.0f;

    // ===== BROADBAND TAIL (matches JS) =====
    v->tail_env = drop_size * 0.4f * (0.6f + rng_next(rng) * 0.8f);
    float tail_decay_ms = 0.01f + drop_size * 0.07f;
    v->tail_decay = expf(-1.0f / (tail_decay_ms * sr));
    float tail_freq = 1000.0f + (1.0f - drop_size) * 6000.0f + rng_next(rng) * 2000.0f;
    biquad_set_bandpass(&v->tail_bpf, tail_freq, 1.5f, sr);
    biquad_reset(&v->tail_bpf);
    v->tail_noise_state = 0.0f;

    // ===== PLINK HPF with LFO (matches JS) =====
    float plink_base = fundamental_freq * (0.85f + rng_next(rng) * 0.5f);
    if (plink_base < 180.0f) plink_base = 180.0f;
    if (plink_base > sr * 0.42f) plink_base = sr * 0.42f;
    v->plink_hpf_base_freq = plink_base;
    v->plink_hpf_freq = plink_base;
    v->plink_hpf_q = 1.3f + rng_next(rng) * 2.0f;
    v->plink_hpf_lfo_phase = rng_next(rng);
    v->plink_hpf_lfo_rate = 0.7f + rng_next(rng) * 2.2f;
    v->plink_hpf_lfo_depth = 0.10f + rng_next(rng) * 0.22f;
    v->plink_hpf_jitter = 0.01f + rng_next(rng) * 0.05f;
    biquad_set_highpass(&v->plink_hpf, v->plink_hpf_freq, v->plink_hpf_q, sr);
    biquad_reset(&v->plink_hpf);
    v->plink_hpf_update_counter = 0;

    // Pan
    float pan = rng_range(rng, -0.8f, 0.8f);
    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);
}

static void droplet_process(DropletVoice* v, float* outL, float* outR,
                            int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    for (int i = 0; i < block_size; i++) {
        v->samples_alive++;
        
        // ===== IMPACT TRANSIENT (dominates first 2-10ms) =====
        float impact = 0.0f;
        if (v->impact_env > 0.0005f) {
            float noise = rng_next(rng) * 2.0f - 1.0f;
            // Noise state smoothing (JS: state*0.3 + noise*0.7)
            v->impact_noise_state = v->impact_noise_state * 0.3f + noise * 0.7f;
            
            // Parallel HPF + BPF mix (NOT serial like old C++)
            float hpf_out = biquad_process(&v->impact_hpf, v->impact_noise_state);
            float bpf_out = biquad_process(&v->impact_bpf, v->impact_noise_state);
            impact = (hpf_out * (1.0f - v->impact_tonal_mix) + bpf_out * v->impact_tonal_mix)
                     * v->impact_env;
            
            v->impact_env *= v->impact_decay;
        }

        // ===== MODAL RESONANCE (with micro-delay) =====
        float modal_sum = 0.0f;
        int any_active = 0;
        
        if (v->impact_delay_counter > 0) {
            v->impact_delay_counter--;
        } else {
            for (int m = 0; m < WATER_MODES_PER_DROP; m++) {
                if (v->modes[m].active) {
                    modal_sum += drifting_resonator_tick(&v->modes[m], sr);
                    any_active |= v->modes[m].active;
                }
            }
            modal_sum *= v->ring_tone_env;
            v->ring_tone_decay = v->ring_tone_decay;  // keep rate
            v->ring_tone_env *= v->ring_tone_decay;
        }

        // ===== BROADBAND TAIL =====
        float tail = 0.0f;
        if (v->tail_env > 0.001f) {
            float tail_noise_in = rng_next(rng) * 2.0f - 1.0f;
            v->tail_noise_state = v->tail_noise_state * 0.4f + tail_noise_in * 0.6f;
            tail = biquad_process(&v->tail_bpf, v->tail_noise_state) * v->tail_env;
            v->tail_env *= v->tail_decay;
        }

        // ===== PLINK HPF with LFO (coefficient update amortized every 4 samples) =====
        v->plink_hpf_lfo_phase += v->plink_hpf_lfo_rate / sr;
        if (v->plink_hpf_lfo_phase > 1.0f) v->plink_hpf_lfo_phase -= 1.0f;
        v->plink_hpf_update_counter++;
        if (v->plink_hpf_update_counter >= 4) {
            v->plink_hpf_update_counter = 0;
            float lfo = fast_sin(v->plink_hpf_lfo_phase * TAU_F) * v->plink_hpf_lfo_depth;
            float jitter = (rng_next(rng) * 2.0f - 1.0f) * v->plink_hpf_jitter;
            float target_hpf_freq = v->plink_hpf_base_freq * (1.0f + lfo + jitter);
            if (target_hpf_freq < 120.0f) target_hpf_freq = 120.0f;
            if (target_hpf_freq > sr * 0.45f) target_hpf_freq = sr * 0.45f;
            v->plink_hpf_freq = target_hpf_freq;
            biquad_set_highpass(&v->plink_hpf, v->plink_hpf_freq, v->plink_hpf_q, sr);
        }
        float modal_shaped = biquad_process(&v->plink_hpf, modal_sum);

        // ===== MIX (matches JS: impact*0.9 + modal*0.08 + tail*0.24) =====
        float sample = impact * 0.9f + modal_shaped * 0.08f + tail * 0.24f;

        outL[i] += sample * v->pan_l;
        outR[i] += sample * v->pan_r;

        // Check if voice is done
        if (!any_active && v->impact_env < 0.0005f && v->tail_env < 0.001f) {
            v->active = 0;
            return;
        }
        if (v->samples_alive > v->max_samples && !any_active) {
            v->active = 0;
            return;
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  WATER ENGINE — WATER-INTO-WATER VOICE (soft drops)
//  Matches JS WaterIntoWaterVoice: 79.8 Hz osc + resonant HPF sweep
// ═══════════════════════════════════════════════════════════

struct WaterIntoWaterVoice {
    int active;
    
    // Oscillator A (79.8 Hz excitation source)
    float osc_phase;
    float osc_base_freq;
    float osc_freq;
    
    // Pitch envelope (settling over 60-90ms)
    float pitch_env;
    float pitch_env_decay;
    float pitch_env_decay_base;
    
    // Amp envelope (D=600ms, release ~50ms)
    float amp_env;
    float amp_decay;
    float amp_decay_base;
    float release_env;
    float release_decay;
    float release_decay_base;
    
    // Noise exciter burst
    float noise_env;
    float noise_decay;
    float noise_decay_base;
    float noise_state;
    Biquad noise_bpf;
    
    // Precomputed log(base) values for fast_pow_decay (avoids per-sample logf)
    float log_pitch_env_decay_base;
    float log_amp_decay_base;
    float log_noise_decay_base;
    float log_release_decay_base;
    
    // 24dB/oct resonant HPF (2 cascaded biquads)
    Biquad res_hpf1, res_hpf2;
    float cutoff_base;
    float cutoff_start;
    float cutoff_end;
    float cutoff_q_start;
    float cutoff_q_end;
    float current_cutoff;
    float current_q;
    
    // S&H LFO
    float sh_value;
    int   sh_counter;
    int   sh_interval;
    float sh_amount;
    int   filter_update_counter;
    int   filter_update_interval;
    
    // Body LPF (OnePole with raw coefficient)
    OnePole body_lpf;
    
    float pan_l, pan_r;
    int   age;
    int   max_lifetime;
    float sample_rate;
};

static void water_soft_trigger(WaterIntoWaterVoice* v, float base_freq,
                               float drop_size, Rng* rng, float sr) {
    v->active = 1;
    v->age = 0;
    v->sample_rate = sr;
    v->max_lifetime = (int)(sr * 1.2f);  // 1.2 seconds (matches JS)

    // Oscillator A around 79.8Hz (matches JS)
    v->osc_base_freq = 79.8f * (0.95f + rng_next(rng) * 0.1f);
    v->osc_freq = v->osc_base_freq;
    v->osc_phase = rng_next(rng) * TAU_F;

    // Pitch env = 100% settling over short window (60-90ms)
    v->pitch_env = 1.0f;
    float pitch_settle_ms = 0.06f + rng_next(rng) * 0.03f;
    v->pitch_env_decay_base = expf(-1.0f / (pitch_settle_ms * sr));
    v->pitch_env_decay = v->pitch_env_decay_base;
    v->log_pitch_env_decay_base = logf(v->pitch_env_decay_base);

    // Amp envelope: decay ~600ms
    v->amp_env = 1.0f;
    v->amp_decay_base = expf(-1.0f / (0.6f * sr));
    v->amp_decay = v->amp_decay_base;
    v->log_amp_decay_base = logf(v->amp_decay_base);
    v->release_env = 1.0f;
    v->release_decay_base = expf(-1.0f / (0.05f * sr));
    v->release_decay = v->release_decay_base;
    v->log_release_decay_base = logf(v->release_decay_base);

    // Noise exciter (matches JS: 0.18 * (0.75 + rng*0.35))
    v->noise_env = 0.18f * (0.75f + rng_next(rng) * 0.35f);
    float noise_ms = 0.006f + rng_next(rng) * 0.01f;
    v->noise_decay_base = expf(-1.0f / (noise_ms * sr));
    v->noise_decay = v->noise_decay_base;
    v->log_noise_decay_base = logf(v->noise_decay_base);
    v->noise_state = 0.0f;
    float noise_bpf_freq = 1800.0f + (1.0f - drop_size) * 2200.0f + rng_next(rng) * 800.0f;
    if (noise_bpf_freq > sr * 0.42f) noise_bpf_freq = sr * 0.42f;
    biquad_set_bandpass(&v->noise_bpf, noise_bpf_freq, 0.9f, sr);
    biquad_reset(&v->noise_bpf);

    // Resonant HPF — the audible "drop pitch" (matches JS)
    v->cutoff_base = base_freq * (0.86f + rng_next(rng) * 0.22f);
    if (v->cutoff_base < 1200.0f) v->cutoff_base = 1200.0f;
    if (v->cutoff_base > 4200.0f) v->cutoff_base = 4200.0f;
    v->cutoff_start = v->cutoff_base * (0.76f + rng_next(rng) * 0.06f);
    v->cutoff_end = v->cutoff_base * (1.12f + rng_next(rng) * 0.16f);
    v->cutoff_q_start = 7.8f + rng_next(rng) * 2.0f;
    v->cutoff_q_end = v->cutoff_q_start + 2.8f + rng_next(rng) * 2.4f;
    v->current_cutoff = v->cutoff_start;
    v->current_q = v->cutoff_q_start;
    biquad_set_highpass(&v->res_hpf1, v->cutoff_start, v->cutoff_q_start, sr);
    biquad_set_highpass(&v->res_hpf2, v->cutoff_start, v->cutoff_q_start, sr);
    biquad_reset(&v->res_hpf1);
    biquad_reset(&v->res_hpf2);

    // S&H LFO at 127 Hz (matches JS)
    v->sh_value = 0.0f;
    v->sh_counter = 0;
    v->sh_interval = (int)(sr / 127.0f);
    if (v->sh_interval < 1) v->sh_interval = 1;
    v->sh_amount = 0.64f;
    v->filter_update_counter = 0;
    v->filter_update_interval = 8;
    
    // Body LPF with raw coefficient 0.68 (matches JS)
    v->body_lpf.coeff = 0.68f;
    v->body_lpf.z1 = 0.0f;

    // Pan
    float pan = (rng_next(rng) - 0.5f) * 1.4f;
    float pan_angle = (pan + 1.0f) * 0.25f * PI_F;
    v->pan_l = fast_cos(pan_angle);
    v->pan_r = fast_sin(pan_angle);
}

static void water_soft_process(WaterIntoWaterVoice* v, float* outL, float* outR,
                               int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    for (int i = 0; i < block_size; i++) {
        v->age++;

        // S&H LFO at ~127 Hz
        v->sh_counter--;
        if (v->sh_counter <= 0) {
            v->sh_counter = v->sh_interval;
            v->sh_value = rng_next(rng) * 2.0f - 1.0f;
        }

        // LFO affects envelope timing (matches JS timeMod)
        float time_mod = 1.0f + v->sh_value * v->sh_amount * 0.6f;
        if (time_mod < 0.55f) time_mod = 0.55f;
        if (time_mod > 1.75f) time_mod = 1.75f;
        
        // pow(base, 1/timeMod) using precomputed log(base) — avoids 4× logf() per sample
        float inv_time_mod = 1.0f / time_mod;
        v->pitch_env_decay = fast_pow_decay_prelog(v->log_pitch_env_decay_base, inv_time_mod);
        v->amp_decay = fast_pow_decay_prelog(v->log_amp_decay_base, inv_time_mod);
        v->noise_decay = fast_pow_decay_prelog(v->log_noise_decay_base, inv_time_mod);
        v->release_decay = fast_pow_decay_prelog(v->log_release_decay_base, inv_time_mod);

        // Pitch env settling
        v->pitch_env *= v->pitch_env_decay;
        float sweep_progress = 1.0f - v->pitch_env;
        float pitch_jitter = 1.0f + v->sh_value * v->sh_amount * 0.08f * v->pitch_env;
        v->osc_freq = v->osc_base_freq * pitch_jitter;

        // Oscillator A
        v->osc_phase += TAU_F * v->osc_freq / sr;
        if (v->osc_phase > TAU_F) v->osc_phase -= TAU_F;
        float osc = fast_sin(v->osc_phase);

        // Noise exciter burst
        float noise_exciter = 0.0f;
        if (v->noise_env > 0.0005f) {
            float white = rng_next(rng) * 2.0f - 1.0f;
            v->noise_state = v->noise_state * 0.45f + white * 0.55f;
            noise_exciter = biquad_process(&v->noise_bpf, v->noise_state) * v->noise_env;
            v->noise_env *= v->noise_decay;
        }

        // Amp decay then quick release
        v->amp_env *= v->amp_decay;
        if (v->amp_env < 0.12f) {
            v->release_env *= v->release_decay;
        }

        // Excitation signal into resonant HPF pair (matches JS)
        float excitation = (osc * 0.28f + noise_exciter * 0.46f) * v->amp_env;

        // Filter sweeps up; resonance rises with sweep (matches JS)
        float sweep_cutoff = v->cutoff_start + (v->cutoff_end - v->cutoff_start) * sweep_progress;
        float cutoff_jitter = 1.0f + v->sh_value * v->sh_amount * 0.14f * (0.45f + v->pitch_env * 0.55f);
        v->current_cutoff = sweep_cutoff * cutoff_jitter;
        if (v->current_cutoff < 700.0f) v->current_cutoff = 700.0f;
        if (v->current_cutoff > sr * 0.46f) v->current_cutoff = sr * 0.46f;
        v->current_q = v->cutoff_q_start + (v->cutoff_q_end - v->cutoff_q_start) * sweep_progress;

        v->filter_update_counter++;
        if (v->filter_update_counter >= v->filter_update_interval) {
            v->filter_update_counter = 0;
            biquad_set_highpass(&v->res_hpf1, v->current_cutoff, v->current_q, sr);
            biquad_set_highpass(&v->res_hpf2, v->current_cutoff, v->current_q, sr);
        }

        float sample = biquad_process(&v->res_hpf2,
                       biquad_process(&v->res_hpf1, excitation));
        sample *= v->release_env;
        
        // Body LPF with raw coefficient (matches JS: OnePole with coeff 0.68)
        sample = onepole_process(&v->body_lpf, sample);

        // Safety check
        if (sample != sample) { // NaN check
            v->active = 0;
            return;
        }

        outL[i] += sample * v->pan_l;
        outR[i] += sample * v->pan_r;

        // Check if done
        if (v->age > v->max_lifetime || 
            (v->amp_env < 0.0004f && v->release_env < 0.0004f && v->noise_env < 0.0004f)) {
            v->active = 0;
            return;
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  WATER ENGINE — CONTINUOUS LAYERS
// ═══════════════════════════════════════════════════════════

// ── Turbulence Bed: 3-band stereo noise with LFO (matches JS) ──
struct TurbulenceBed {
    Biquad low_l, low_r;
    Biquad mid_l, mid_r;
    Biquad high_l, high_r;
    float lfo_phase[3];     // one per band
    float lfo_rate[3];      // Hz
    float band_gains[3];    // adjustable per band
    int   inited;
};

static void turbulence_init(TurbulenceBed* t, float sr) {
    // Matches JS: LP 250Hz Q0.7, BP 800Hz Q1.2, BP 5000Hz Q2.0
    biquad_set_lowpass(&t->low_l, 250.0f, 0.7f, sr);
    biquad_set_lowpass(&t->low_r, 250.0f, 0.7f, sr);
    biquad_set_bandpass(&t->mid_l, 800.0f, 1.2f, sr);
    biquad_set_bandpass(&t->mid_r, 800.0f, 1.2f, sr);
    biquad_set_bandpass(&t->high_l, 5000.0f, 2.0f, sr);  // BP not HP!
    biquad_set_bandpass(&t->high_r, 5000.0f, 2.0f, sr);
    // Matches JS LFO rates
    t->lfo_phase[0] = 0.0f;  t->lfo_rate[0] = 0.07f;
    t->lfo_phase[1] = 0.33f; t->lfo_rate[1] = 0.11f;
    t->lfo_phase[2] = 0.67f; t->lfo_rate[2] = 0.17f;
    // Default band gains
    t->band_gains[0] = 0.5f;
    t->band_gains[1] = 0.5f;
    t->band_gains[2] = 0.3f;
    t->inited = 1;
}

static void turbulence_process(TurbulenceBed* t, float* outL, float* outR,
                               int block_size, float level, Rng* rng, float sr) {
    if (level < 0.001f) return;
    if (!t->inited) turbulence_init(t, sr);

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // 3 LFO values (matches JS: 0.7 + 0.3 * sin(...))
        float lfo0 = 0.7f + 0.3f * fast_sin(t->lfo_phase[0] * TAU_F);
        float lfo1 = 0.7f + 0.3f * fast_sin(t->lfo_phase[1] * TAU_F);
        float lfo2 = 0.7f + 0.3f * fast_sin(t->lfo_phase[2] * TAU_F);
        t->lfo_phase[0] += t->lfo_rate[0] * inv_sr;
        t->lfo_phase[1] += t->lfo_rate[1] * inv_sr;
        t->lfo_phase[2] += t->lfo_rate[2] * inv_sr;
        if (t->lfo_phase[0] > 1.0f) t->lfo_phase[0] -= 1.0f;
        if (t->lfo_phase[1] > 1.0f) t->lfo_phase[1] -= 1.0f;
        if (t->lfo_phase[2] > 1.0f) t->lfo_phase[2] -= 1.0f;

        // Decorrelated noise per channel
        float nL1 = rng_next(rng) * 2.0f - 1.0f;
        float nR1 = rng_next(rng) * 2.0f - 1.0f;
        float nL2 = rng_next(rng) * 2.0f - 1.0f;
        float nR2 = rng_next(rng) * 2.0f - 1.0f;
        float nL3 = rng_next(rng) * 2.0f - 1.0f;
        float nR3 = rng_next(rng) * 2.0f - 1.0f;

        float lo_l = biquad_process(&t->low_l, nL1) * lfo0 * t->band_gains[0];
        float lo_r = biquad_process(&t->low_r, nR1) * lfo0 * t->band_gains[0];
        float md_l = biquad_process(&t->mid_l, nL2) * lfo1 * t->band_gains[1];
        float md_r = biquad_process(&t->mid_r, nR2) * lfo1 * t->band_gains[1];
        float hi_l = biquad_process(&t->high_l, nL3) * lfo2 * t->band_gains[2];
        float hi_r = biquad_process(&t->high_r, nR3) * lfo2 * t->band_gains[2];

        outL[i] += (lo_l + md_l + hi_l) * level;
        outR[i] += (lo_r + md_r + hi_r) * level;
    }
}

// ── Bubbling Layer: 6 concurrent bubble sub-voices (matches JS) ──
struct BubbleSubVoice {
    DriftingResonator res1, res2;
    Biquad noise_bpf;
    float  noise_env;
    float  noise_decay;
    float  noise_state;      // smoothed noise
    float  tone_env;
    float  tone_decay;
    int    active;
    int    next_trigger;     // samples until next trigger check
    float  base_rate;        // per-voice trigger rate
    float  pan;              // -0.5 to 0.5
};

struct BubblingLayer {
    BubbleSubVoice voices[WATER_BUBBLE_SUBVOICES];
    OnePole smooth_l, smooth_r;  // output smoothing (matches JS)
    float gain;
    float rate;
    float density;
    int inited;
};

static void bubbling_init(BubblingLayer* b, Rng* rng, float sr) {
    for (int i = 0; i < WATER_BUBBLE_SUBVOICES; i++) {
        b->voices[i].active = 0;
        b->voices[i].next_trigger = 0;
        b->voices[i].base_rate = 0.5f + (float)i * 0.3f;  // matches JS
        b->voices[i].pan = ((float)i / 5.0f) - 0.5f;       // matches JS
        b->voices[i].noise_state = 0.0f;
    }
    b->smooth_l.coeff = 0.62f;  // matches JS OnePole coeff 0.62
    b->smooth_l.z1 = 0.0f;
    b->smooth_r.coeff = 0.62f;
    b->smooth_r.z1 = 0.0f;
    b->gain = 0.5f;
    b->rate = 1.0f;
    b->density = 1.0f;
    b->inited = 1;
}

static void bubbling_process(BubblingLayer* b, float* outL, float* outR,
                             int block_size, float level, float density,
                             Rng* rng, float sr) {
    if (level < 0.001f) return;
    if (!b->inited) bubbling_init(b, rng, sr);

    for (int i = 0; i < block_size; i++) {
        float sum_l = 0.0f, sum_r = 0.0f;

        for (int vi = 0; vi < WATER_BUBBLE_SUBVOICES; vi++) {
            BubbleSubVoice* sv = &b->voices[vi];

            // Trigger check (matches JS: nextTrigger-- then probability gate)
            sv->next_trigger--;
            if (sv->next_trigger <= 0 && rng_next(rng) < 0.26f * b->rate * density) {
                // Log-randomized frequency: 110 * pow(2, rng*1.88) → ~110-406 Hz
                float freq = 110.0f * powf(2.0f, rng_next(rng) * 1.88f);
                float decay_time = 0.02f + rng_next(rng) * 0.05f;
                float drift = 2.0f;
                
                // Resonator A (matches JS: exp drift, exponent 0.75)
                drifting_resonator_trigger(&sv->res1,
                    freq * (0.88f + rng_next(rng) * 0.20f),
                    0.09f * (0.45f + rng_next(rng) * 0.8f),
                    decay_time, sr,
                    drift, 0.08f, 1, 0.75f);  // exp mode
                
                // Resonator B
                drifting_resonator_trigger(&sv->res2,
                    freq * (1.1f + rng_next(rng) * 0.2f),
                    0.045f * (0.5f + rng_next(rng) * 0.75f),
                    decay_time * (0.55f + rng_next(rng) * 0.35f), sr,
                    drift, 0.08f, 1, 0.8f);
                
                // Noise (matches JS)
                sv->noise_env = 0.17f * (0.5f + rng_next(rng) * 0.8f);
                float noise_ms = 0.025f + rng_next(rng) * 0.08f;
                sv->noise_decay = expf(-1.0f / (noise_ms * sr));
                float noise_freq = freq * (0.75f + rng_next(rng) * 0.55f);
                if (noise_freq < 130.0f) noise_freq = 130.0f;
                if (noise_freq > 1100.0f) noise_freq = 1100.0f;
                biquad_set_bandpass(&sv->noise_bpf, noise_freq, 0.45f + rng_next(rng) * 0.45f, sr);
                biquad_reset(&sv->noise_bpf);
                
                // Tone envelope (30-90ms)
                float tone_ms = 0.03f + rng_next(rng) * 0.06f;
                sv->tone_env = 1.0f;
                sv->tone_decay = expf(-1.0f / (tone_ms * sr));
                
                sv->active = 1;
                
                // Next trigger interval (matches JS)
                float dens = density;
                if (dens < 0.2f) dens = 0.2f;
                float base_interval = sr / (sv->base_rate * b->rate * dens);
                sv->next_trigger = (int)(base_interval * (0.2f + rng_next(rng) * 1.9f));
            }
            
            if (sv->next_trigger <= 0) {
                float dens = density;
                if (dens < 0.2f) dens = 0.2f;
                float base_interval = sr / (sv->base_rate * b->rate * dens);
                sv->next_trigger = (int)(base_interval * (0.2f + rng_next(rng) * 1.9f));
            }

            // Process active voice
            if (!sv->active) continue;
            
            float tone = 0.0f;
            int any_active = 0;
            if (sv->res1.active) {
                tone += drifting_resonator_tick(&sv->res1, sr);
                any_active = 1;
            }
            if (sv->res2.active) {
                tone += drifting_resonator_tick(&sv->res2, sr);
                any_active = 1;
            }
            tone *= sv->tone_env;
            sv->tone_env *= sv->tone_decay;

            float noise_out = 0.0f;
            if (sv->noise_env > 0.001f) {
                float noise = rng_next(rng) * 2.0f - 1.0f;
                // Noise state smoothing (matches JS: state*0.62 + noise*0.38)
                sv->noise_state = sv->noise_state * 0.62f + noise * 0.38f;
                noise_out = biquad_process(&sv->noise_bpf, sv->noise_state) * sv->noise_env;
                sv->noise_env *= sv->noise_decay;
                any_active = 1;
            }

            if (any_active || sv->noise_env > 0.001f) {
                // Mix: tone*0.42 + noise*0.58 (matches JS)
                float out = tone * 0.42f + noise_out * 0.58f;
                // Pan (matches JS: 0.5 - pan*0.35, 0.5 + pan*0.35)
                sum_l += out * (0.5f - sv->pan * 0.35f);
                sum_r += out * (0.5f + sv->pan * 0.35f);
            }

            if (!any_active && sv->noise_env < 0.001f) {
                sv->active = 0;
            }
        }

        // Output smoothing (matches JS: OnePole with 0.62)
        float sm_l = onepole_process(&b->smooth_l, sum_l);
        float sm_r = onepole_process(&b->smooth_r, sum_r);
        outL[i] += sm_l * b->gain * level;
        outR[i] += sm_r * b->gain * level;
    }
}

// ── Roar Layer: 3-band shaped waterfall noise (matches JS) ──
struct RoarLayer {
    Biquad rumble_l, rumble_r;
    Biquad body_l, body_r;
    Biquad spray_l, spray_r;
    float lfo_phase;
    float noise_l, noise_r;   // pink-ish noise state
    float gain;
    float rumble_amount;
    float spray_amount;
    float density;
    int   inited;
};

static void roar_init(RoarLayer* r, float sr) {
    // Matches JS: LP 80Hz Q0.5, BP 300Hz Q0.8, BP 4000Hz Q1.5
    biquad_set_lowpass(&r->rumble_l, 80.0f, 0.5f, sr);
    biquad_set_lowpass(&r->rumble_r, 80.0f, 0.5f, sr);
    biquad_set_bandpass(&r->body_l, 300.0f, 0.8f, sr);
    biquad_set_bandpass(&r->body_r, 300.0f, 0.8f, sr);
    biquad_set_bandpass(&r->spray_l, 4000.0f, 1.5f, sr);  // BP not HP!
    biquad_set_bandpass(&r->spray_r, 4000.0f, 1.5f, sr);
    r->lfo_phase = 0.0f;
    r->noise_l = 0.0f;
    r->noise_r = 0.0f;
    r->gain = 0.5f;
    r->rumble_amount = 0.7f;
    r->spray_amount = 0.4f;
    r->density = 1.0f;
    r->inited = 1;
}

static void roar_process(RoarLayer* r, float* outL, float* outR,
                         int block_size, float level, Rng* rng, float sr) {
    if (level < 0.001f) return;
    if (!r->inited) roar_init(r, sr);

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // Pink-ish noise (matches JS: noise*0.7 + white*0.3)
        float white_l = rng_next(rng) * 2.0f - 1.0f;
        float white_r = rng_next(rng) * 2.0f - 1.0f;
        r->noise_l = r->noise_l * 0.7f + white_l * 0.3f;
        r->noise_r = r->noise_r * 0.7f + white_r * 0.3f;

        // LFO (matches JS: 0.85 + 0.15 * sin(...), rate 0.08 Hz)
        r->lfo_phase += 0.08f * inv_sr;
        if (r->lfo_phase > 1.0f) r->lfo_phase -= 1.0f;
        float lfo = 0.85f + 0.15f * fast_sin(r->lfo_phase * TAU_F);

        // Process each band (matches JS gains)
        float rl = biquad_process(&r->rumble_l, r->noise_l) * r->rumble_amount;
        float rr = biquad_process(&r->rumble_r, r->noise_r) * r->rumble_amount;
        float bl = biquad_process(&r->body_l, r->noise_l) * 0.6f;
        float br = biquad_process(&r->body_r, r->noise_r) * 0.6f;
        // Spray uses white noise (matches JS)
        float sl = biquad_process(&r->spray_l, white_l) * r->spray_amount;
        float sr_out = biquad_process(&r->spray_r, white_r) * r->spray_amount;

        // Density scaling (matches JS: 0.25 + density * 0.75)
        float density_scale = 0.25f + r->density * 0.75f;
        outL[i] += (rl + bl + sl) * lfo * r->gain * density_scale;
        outR[i] += (rr + br + sr_out) * lfo * r->gain * density_scale;
    }
}

// ── Rivulet Layer: 4 bandpass-filtered trickling streams (matches JS) ──
struct RivuletLayer {
    Biquad filters[WATER_RIVULET_STREAMS];
    float  lfo_phase[WATER_RIVULET_STREAMS];
    float  lfo_rate[WATER_RIVULET_STREAMS];
    float  stream_gain[WATER_RIVULET_STREAMS];
    float  stream_pan[WATER_RIVULET_STREAMS];
    float  noise_state[WATER_RIVULET_STREAMS];
    float  gain;
    float  density;
    int    inited;
};

static void rivulet_init(RivuletLayer* r, float sr) {
    // Matches JS: BP freqs + per-stream Q and gain
    float freqs[WATER_RIVULET_STREAMS] = {2500.0f, 3500.0f, 4500.0f, 6000.0f};
    float qs[WATER_RIVULET_STREAMS] = {3.0f, 2.5f, 2.0f, 1.5f};
    float gains[WATER_RIVULET_STREAMS] = {0.3f, 0.25f, 0.2f, 0.15f};
    for (int s = 0; s < WATER_RIVULET_STREAMS; s++) {
        biquad_set_bandpass(&r->filters[s], freqs[s], qs[s], sr);
        biquad_reset(&r->filters[s]);
        r->stream_gain[s] = gains[s];
        r->stream_pan[s] = ((float)s / 3.0f) - 0.5f;  // matches JS: (i/3)-0.5
        r->noise_state[s] = 0.0f;
    }
    // LFO rates (matches JS: [0.15, 0.22, 0.31, 0.18])
    r->lfo_phase[0] = 0.0f;  r->lfo_rate[0] = 0.15f;
    r->lfo_phase[1] = 0.25f; r->lfo_rate[1] = 0.22f;
    r->lfo_phase[2] = 0.5f;  r->lfo_rate[2] = 0.31f;
    r->lfo_phase[3] = 0.75f; r->lfo_rate[3] = 0.18f;
    r->gain = 0.3f;
    r->density = 1.0f;
    r->inited = 1;
}

static void rivulet_process(RivuletLayer* r, float* outL, float* outR,
                            int block_size, float level, Rng* rng, float sr) {
    if (level < 0.001f) return;
    if (!r->inited) rivulet_init(r, sr);

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        float sum_l = 0.0f, sum_r = 0.0f;
        
        for (int s = 0; s < WATER_RIVULET_STREAMS; s++) {
            // LFO: 0.25 + 0.75 * pow(sin(phase*PI), 2) (matches JS: half-period sin²)
            r->lfo_phase[s] += r->lfo_rate[s] * inv_sr;
            if (r->lfo_phase[s] > 1.0f) r->lfo_phase[s] -= 1.0f;
            float sin_val = fast_sin(r->lfo_phase[s] * PI_F);  // half-period
            float env = 0.25f + 0.75f * sin_val * sin_val;

            // Noise with smoothing (matches JS: noise*0.6 + raw*0.4)
            float raw_noise = rng_next(rng) * 2.0f - 1.0f;
            r->noise_state[s] = r->noise_state[s] * 0.6f + raw_noise * 0.4f;
            
            // Density scaling (matches JS: 0.25 + density * 0.75)
            float density_scale = 0.25f + r->density * 0.75f;
            float filtered = biquad_process(&r->filters[s], r->noise_state[s])
                           * r->stream_gain[s] * env * density_scale;

            // Pan (matches JS: 0.5 - pan*0.4, 0.5 + pan*0.4)
            sum_l += filtered * (0.5f - r->stream_pan[s] * 0.4f);
            sum_r += filtered * (0.5f + r->stream_pan[s] * 0.4f);
        }

        outL[i] += sum_l * r->gain * level;
        outR[i] += sum_r * r->gain * level;
    }
}

// ── Glass Pane Resonator (rain-on-window, matches JS) ──
// JS uses ModalResonator (simple sin+decay), triggered by input energy
struct GlassResonator {
    DriftingResonator modes[4];
    float mode_freqs[4];     // cached frequencies
    float thickness;
    float level;
    int   inited;
};

static void glass_init(GlassResonator* g, float sr) {
    for (int m = 0; m < 4; m++) {
        g->modes[m].active = 0;
    }
    g->thickness = 0.5f;
    g->level = 0.0f;
    g->inited = 1;
}

static void glass_set_thickness(GlassResonator* g, float thickness, float sr) {
    g->thickness = thickness;
    // Matches JS: baseFreq = 400 + (1-thickness)*300 (thicker = lower)
    float base_freq = 400.0f + (1.0f - thickness) * 300.0f;
    float ratios[4] = {1.0f, 1.58f, 2.22f, 2.92f};  // matches JS
    for (int i = 0; i < 4; i++) {
        g->mode_freqs[i] = base_freq * ratios[i];
    }
}

static void glass_excite(GlassResonator* g, float amount, float sr) {
    // Matches JS: amp = amount * (1 - i*0.2), decay = 0.05 + i*0.02
    for (int i = 0; i < 4; i++) {
        float amp = amount * (1.0f - (float)i * 0.2f);
        float decay_time = 0.05f + g->thickness * 0.1f;
        drifting_resonator_trigger_simple(&g->modes[i], g->mode_freqs[i], amp, decay_time, sr);
    }
}

static void glass_process(GlassResonator* g, float* outL, float* outR,
                          int block_size, float level, float input_signal, float sr) {
    if (level < 0.001f && !g->modes[0].active) return;
    
    // Input-driven excitation (matches JS: excites when |input| > 0.1)
    if (fabsf(input_signal) > 0.1f) {
        glass_excite(g, fabsf(input_signal) * 0.3f, sr);
    }

    for (int i = 0; i < block_size; i++) {
        float sum = 0.0f;
        for (int m = 0; m < 4; m++) {
            sum += drifting_resonator_tick(&g->modes[m], sr);
        }
        // Matches JS: sum * 0.3
        outL[i] += sum * 0.3f * level;
        outR[i] += sum * 0.3f * level;
    }
}

// ═══════════════════════════════════════════════════════════
//  WATER ENGINE — MAIN STATE
// ═══════════════════════════════════════════════════════════

enum WaterPreset {
    WATER_TAP_DRIPS = 0,
    WATER_STREAM    = 1,
    WATER_WATERFALL = 2,
    WATER_RAIN      = 3,
};

struct WaterState {
    float sample_rate;
    int   initialized;

    // Voices
    DropletVoice        hard_drops[WATER_MAX_HARD_VOICES];
    WaterIntoWaterVoice soft_drops[WATER_MAX_SOFT_VOICES];

    // Continuous layers
    TurbulenceBed  turbulence;
    BubblingLayer  bubbling;
    RoarLayer      roar;
    RivuletLayer   rivulets;
    GlassResonator glass;

    // Output chain
    OnePole  dist_lpf_l, dist_lpf_r;
    DCBlocker dc_l, dc_r;

    // Band-limiting for water drops
    Biquad  water_bp_hpf_l, water_bp_hpf_r;
    Biquad  water_bp_lpf_l, water_bp_lpf_r;
    // Band-limiting for bubbling
    Biquad  bubble_bp_hpf_l, bubble_bp_hpf_r;
    Biquad  bubble_bp_lpf_l, bubble_bp_lpf_r;

    // Scheduling
    int     hard_samples_until_next;
    int     soft_samples_until_next;
    float   hard_base_interval;   // samples between hard drops
    float   soft_base_interval;
    int     burst_remaining;      // drops left in current burst
    int     burst_interval;       // samples between burst drops

    // Params
    int    preset;
    float  intensity;
    float  rate;
    float  distance;
    float  base_freq;
    float  drop_size;
    float  hardness;
    float  glass_thickness;

    // Preset-specific params (matches JS WATER_PRESETS)
    float  event_rate_min;
    float  event_rate_max;
    float  event_rate;           // current rate (events/sec)
    float  decay_time;           // preset decay time
    float  drop_size_min;
    float  drop_size_max;
    float  burst_probability;
    int    burst_count_min;
    int    burst_count_max;
    float  sink_material;

    // Parameter smoothing (matches JS)
    float  smoothed_intensity;
    float  smoothed_distance;

    // Distance filter coefficient (raw, matches JS)
    float  dist_coeff;

    // Layer levels & density
    float  layer_hard_drops;
    float  layer_water_drops;
    float  layer_turbulence;
    float  layer_bubbling;
    float  layer_roar;
    float  layer_rivulets;
    float  density_hard_drops;
    float  density_water_drops;
    float  density_turbulence;
    float  density_bubbling;
    float  density_roar;
    float  density_rivulets;

    // Fade
    float  fade_gain;
    float  fade_target;
    float  fade_inc;

    // PRNG
    Rng    rng;

    // Output buffer (interleaved stereo, max 128 × 2 = 256 floats)
    float  output[256];

    // Stats
    int    events_per_sec;
    int    event_counter;
    int    stat_samples;
};

static WaterState* g_water = nullptr;

// Preset base frequencies
static float water_preset_base_freq(int preset) {
    switch (preset) {
        case WATER_TAP_DRIPS:  return 2500.0f;
        case WATER_STREAM:     return 2300.0f;
        case WATER_WATERFALL:  return 4500.0f;
        case WATER_RAIN:       return 2100.0f;
        default:               return 2500.0f;
    }
}

static void water_update_scheduling(WaterState* s) {
    // Matches JS: eventRate = eventRate.min + rate * (max - min)
    s->event_rate = s->event_rate_min + s->rate * (s->event_rate_max - s->event_rate_min);
}

static int water_find_free_hard(WaterState* s) {
    for (int i = 0; i < WATER_MAX_HARD_VOICES; i++) {
        if (!s->hard_drops[i].active) return i;
    }
    return -1;
}

static int water_find_free_soft(WaterState* s) {
    for (int i = 0; i < WATER_MAX_SOFT_VOICES; i++) {
        if (!s->soft_drops[i].active) return i;
    }
    // Voice stealing: find oldest (matches JS)
    int oldest = 0;
    int max_age = 0;
    for (int i = 0; i < WATER_MAX_SOFT_VOICES; i++) {
        if (s->soft_drops[i].age > max_age) {
            max_age = s->soft_drops[i].age;
            oldest = i;
        }
    }
    return oldest;
}

// Matches JS scheduleDropletEvent() scheduling logic
static void water_schedule_hard_event(WaterState* s) {
    float sr = s->sample_rate;

    // Rate scaling (matches JS: 0.2 + smoothedIntensity * 0.8)
    float rate_scale = 0.2f + s->smoothed_intensity * 0.8f;
    float current_rate = s->event_rate * rate_scale * s->density_hard_drops;

    // Minimum 100ms spacing (matches JS)
    int min_spacing = (int)(0.1f * sr);

    if (s->burst_remaining > 0) {
        // Within a burst: tighter spacing (matches JS)
        s->burst_remaining--;
        float burst_jitter = (float)s->burst_interval * (0.3f + rng_next(&s->rng) * 0.7f);
        s->hard_samples_until_next = (int)burst_jitter;
        if (s->hard_samples_until_next < min_spacing) s->hard_samples_until_next = min_spacing;
    } else {
        // Normal scheduling with non-uniform jitter (matches JS exactly)
        float base_interval = sr / (current_rate > 0.01f ? current_rate : 0.01f);
        float jitter_factor;
        float jitter_rand = rng_next(&s->rng);

        if (jitter_rand < 0.4f) {
            jitter_factor = 0.6f + rng_next(&s->rng) * 0.6f;        // Normal (40%)
        } else if (jitter_rand < 0.6f) {
            jitter_factor = 0.4f + rng_next(&s->rng) * 0.4f;        // Slightly quicker (20%)
        } else if (jitter_rand < 0.85f) {
            jitter_factor = 1.5f + rng_next(&s->rng) * 1.5f;        // Longer pause (25%)
        } else {
            jitter_factor = 3.0f + rng_next(&s->rng) * 3.0f;        // Much longer (15%)
        }

        s->hard_samples_until_next = (int)(base_interval * jitter_factor);
        if (s->hard_samples_until_next < min_spacing) s->hard_samples_until_next = min_spacing;

        // Maybe start a burst (matches JS)
        if (rng_next(&s->rng) < s->burst_probability) {
            s->burst_remaining = s->burst_count_min + (int)(rng_next(&s->rng) *
                (float)(s->burst_count_max - s->burst_count_min));
            // Burst interval: 25-85ms (matches JS: 0.025 + rng*0.06)
            s->burst_interval = (int)(sr * (0.025f + rng_next(&s->rng) * 0.06f));
        }
    }
}

// Matches JS scheduleWaterDropEvent() scheduling logic
static void water_schedule_soft_event(WaterState* s) {
    float sr = s->sample_rate;

    // Rate scaling (matches JS: 0.15 + smoothedIntensity * 0.6, then *0.7)
    float rate_scale = 0.15f + s->smoothed_intensity * 0.6f;
    float requested_rate = s->event_rate * rate_scale * 0.7f * s->density_water_drops;
    float current_rate = requested_rate < 26.0f ? requested_rate : 26.0f;
    if (current_rate < 0.5f) current_rate = 0.5f;

    // Minimum 150ms spacing (matches JS)
    int min_spacing = (int)(0.15f * sr);

    float base_interval = sr / current_rate;

    // Non-uniform jitter (matches JS)
    float jitter_factor;
    float jitter_rand = rng_next(&s->rng);
    if (jitter_rand < 0.5f) {
        jitter_factor = 0.7f + rng_next(&s->rng) * 0.6f;
    } else if (jitter_rand < 0.8f) {
        jitter_factor = 1.5f + rng_next(&s->rng) * 1.5f;
    } else {
        jitter_factor = 3.0f + rng_next(&s->rng) * 4.0f;
    }

    // Voice pressure backoff (matches JS)
    int active_water_voices = 0;
    for (int i = 0; i < WATER_MAX_SOFT_VOICES; i++) {
        if (s->soft_drops[i].active) active_water_voices++;
    }
    float voice_pressure = (float)active_water_voices / (float)WATER_MAX_SOFT_VOICES;
    float pressure_scale = voice_pressure > 0.85f ? 1.6f : 1.0f;

    s->soft_samples_until_next = (int)(base_interval * jitter_factor * pressure_scale);
    if (s->soft_samples_until_next < min_spacing) s->soft_samples_until_next = min_spacing;
}

// ═══════════════════════════════════════════════════════════
//  WATER ENGINE — PUBLIC API
// ═══════════════════════════════════════════════════════════

extern "C" {

int water_init(float sample_rate) {
    g_water = new WaterState();
    memset(g_water, 0, sizeof(WaterState));
    g_water->sample_rate = sample_rate;
    g_water->initialized = 1;

    // Defaults (matches JS WaterProcessor constructor)
    g_water->preset = WATER_TAP_DRIPS;
    g_water->intensity = 0.5f;
    g_water->rate = 0.5f;
    g_water->distance = 0.3f;
    g_water->base_freq = 2500.0f;
    g_water->drop_size = 0.5f;
    g_water->hardness = 0.5f;
    g_water->glass_thickness = 0.5f;

    // tapDrips preset defaults (matches JS WATER_PRESETS.tapDrips)
    g_water->event_rate_min = 0.5f;
    g_water->event_rate_max = 2.0f;
    g_water->event_rate = 0.5f + 0.5f * (2.0f - 0.5f);  // rate=0.5
    g_water->decay_time = 0.05f;
    g_water->drop_size_min = 0.5f;
    g_water->drop_size_max = 0.9f;
    g_water->burst_probability = 0.08f;
    g_water->burst_count_min = 2;
    g_water->burst_count_max = 3;
    g_water->sink_material = 0.3f;
    g_water->burst_remaining = 0;
    g_water->burst_interval = 0;

    // Parameter smoothing (matches JS constructor)
    g_water->smoothed_intensity = 0.5f;
    g_water->smoothed_distance = 0.3f;

    // Layer levels (matches JS tapDrips preset)
    g_water->layer_hard_drops = 0.7f;
    g_water->layer_water_drops = 0.5f;
    g_water->layer_turbulence = 0.3f;
    g_water->layer_bubbling = 0.0f;
    g_water->layer_roar = 0.0f;
    g_water->layer_rivulets = 0.0f;

    // Layer densities (matches JS defaults)
    g_water->density_hard_drops = 0.5f;
    g_water->density_water_drops = 0.5f;
    g_water->density_turbulence = 0.5f;
    g_water->density_bubbling = 0.5f;
    g_water->density_roar = 0.5f;
    g_water->density_rivulets = 0.5f;

    g_water->fade_gain = 0.0f;
    g_water->fade_target = 0.0f;
    g_water->fade_inc = 0.0f;
    g_water->rng.state = 12345;

    // Distance filter (raw coefficient, matches JS: 0.1 + distance * 0.85)
    g_water->dist_coeff = 0.1f + 0.3f * 0.85f;
    g_water->dist_lpf_l.coeff = g_water->dist_coeff;
    g_water->dist_lpf_l.z1 = 0.0f;
    g_water->dist_lpf_r.coeff = g_water->dist_coeff;
    g_water->dist_lpf_r.z1 = 0.0f;

    // Band-limiting for water drops (HPF 1kHz + LPF 16kHz, matches JS)
    biquad_set_highpass(&g_water->water_bp_hpf_l, 1000.0f, 0.707f, sample_rate);
    biquad_set_highpass(&g_water->water_bp_hpf_r, 1000.0f, 0.707f, sample_rate);
    biquad_set_lowpass(&g_water->water_bp_lpf_l, 16000.0f, 0.707f, sample_rate);
    biquad_set_lowpass(&g_water->water_bp_lpf_r, 16000.0f, 0.707f, sample_rate);

    // Band-limiting for bubbling (HPF 250Hz + LPF 1500Hz, matches JS)
    biquad_set_highpass(&g_water->bubble_bp_hpf_l, 250.0f, 0.707f, sample_rate);
    biquad_set_highpass(&g_water->bubble_bp_hpf_r, 250.0f, 0.707f, sample_rate);
    biquad_set_lowpass(&g_water->bubble_bp_lpf_l, 1500.0f, 0.707f, sample_rate);
    biquad_set_lowpass(&g_water->bubble_bp_lpf_r, 1500.0f, 0.707f, sample_rate);

    // Init glass with default thickness
    glass_init(&g_water->glass, sample_rate);
    glass_set_thickness(&g_water->glass, g_water->glass_thickness, sample_rate);

    water_update_scheduling(g_water);
    water_schedule_hard_event(g_water);
    water_schedule_soft_event(g_water);

    return 0;
}

void water_destroy(void) {
    if (g_water) { delete g_water; g_water = nullptr; }
}

float* water_get_output_ptr(void) {
    return g_water ? g_water->output : nullptr;
}

void water_process_block(int block_size) {
    if (!g_water || !g_water->initialized || block_size > 128) return;

    WaterState* s = g_water;
    float sr = s->sample_rate;

    // ── Block-level parameter smoothing (matches JS: += (target - smooth) * 0.001) ──
    s->smoothed_intensity += (s->intensity - s->smoothed_intensity) * 0.001f;
    s->smoothed_distance += (s->distance - s->smoothed_distance) * 0.001f;

    // Distance filter coefficient (matches JS: 0.1 + smoothedDistance * 0.85)
    float dist_coeff = 0.1f + s->smoothed_distance * 0.85f;
    s->dist_lpf_l.coeff = dist_coeff;
    s->dist_lpf_r.coeff = dist_coeff;

    // Clear temp buffers
    float hard_buf_l[128] = {0}, hard_buf_r[128] = {0};
    float soft_buf_l[128] = {0}, soft_buf_r[128] = {0};
    float bubble_buf_l[128] = {0}, bubble_buf_r[128] = {0};
    float turb_buf_l[128] = {0}, turb_buf_r[128] = {0};
    float roar_buf_l[128] = {0}, roar_buf_r[128] = {0};
    float rivulet_buf_l[128] = {0}, rivulet_buf_r[128] = {0};
    float glass_buf_l[128] = {0}, glass_buf_r[128] = {0};

    // ── Event scheduling (sample-accurate, matches JS process() loop) ──
    for (int i = 0; i < block_size; i++) {
        // Fade envelope (matches JS: linear fade)
        if (s->fade_gain < s->fade_target) {
            s->fade_gain += s->fade_inc;
            if (s->fade_gain > s->fade_target) s->fade_gain = s->fade_target;
        } else if (s->fade_gain > s->fade_target) {
            s->fade_gain -= s->fade_inc;
            if (s->fade_gain < s->fade_target) s->fade_gain = s->fade_target;
        }

        if (s->fade_gain < 0.0001f) continue;

        // Hard drop scheduling (matches JS)
        if (s->layer_hard_drops > 0.01f && s->density_hard_drops > 0.01f) {
            s->hard_samples_until_next--;
            if (s->hard_samples_until_next <= 0) {
                int idx = water_find_free_hard(s);
                if (idx >= 0) {
                    // Build trigger params with randomization (matches JS scheduleDropletEvent)
                    float drop_size = s->drop_size_min +
                        s->drop_size * (s->drop_size_max - s->drop_size_min);
                    float drop_size_var = drop_size + (rng_next(&s->rng) - 0.5f) * 0.25f;
                    if (drop_size_var < 0.0f) drop_size_var = 0.0f;
                    if (drop_size_var > 1.0f) drop_size_var = 1.0f;
                    float hardness_var = s->hardness * (0.7f + rng_next(&s->rng) * 0.6f);
                    float decay_var = s->decay_time * (0.5f + rng_next(&s->rng) * 1.0f);
                    float freq_var = s->base_freq * (0.75f + rng_next(&s->rng) * 0.5f);

                    droplet_trigger(&s->hard_drops[idx], freq_var,
                                   hardness_var, drop_size_var, decay_var, &s->rng, sr);
                    s->event_counter++;
                }
                water_schedule_hard_event(s);
            }
        }

        // Soft drop scheduling (matches JS)
        if (s->layer_water_drops > 0.01f && s->density_water_drops > 0.01f) {
            s->soft_samples_until_next--;
            if (s->soft_samples_until_next <= 0) {
                int idx = water_find_free_soft(s);
                // Water drop params (matches JS scheduleWaterDropEvent)
                float drop_size = s->drop_size_min +
                    s->drop_size * (s->drop_size_max - s->drop_size_min);
                float soft_freq = s->base_freq * 0.5f * (0.6f + rng_next(&s->rng) * 0.8f);
                float soft_drop_size = drop_size + (rng_next(&s->rng) - 0.5f) * 0.3f;
                water_soft_trigger(&s->soft_drops[idx], soft_freq,
                                  soft_drop_size, &s->rng, sr);
                s->event_counter++;
                water_schedule_soft_event(s);
            }
        }
    }

    // ── Process all active hard-drop voices ──
    for (int v = 0; v < WATER_MAX_HARD_VOICES; v++) {
        droplet_process(&s->hard_drops[v], hard_buf_l, hard_buf_r,
                       block_size, &s->rng, sr);
    }

    // ── Process all active soft-drop voices ──
    for (int v = 0; v < WATER_MAX_SOFT_VOICES; v++) {
        water_soft_process(&s->soft_drops[v], soft_buf_l, soft_buf_r,
                          block_size, &s->rng, sr);
    }
    // Band-limit water drops (matches JS: 1kHz HPF, 16kHz LPF)
    for (int i = 0; i < block_size; i++) {
        soft_buf_l[i] = biquad_process(&s->water_bp_lpf_l,
                        biquad_process(&s->water_bp_hpf_l, soft_buf_l[i]));
        soft_buf_r[i] = biquad_process(&s->water_bp_lpf_r,
                        biquad_process(&s->water_bp_hpf_r, soft_buf_r[i]));
    }

    // ── Process continuous layers (matches JS bypass logic) ──
    if (s->layer_turbulence > 0.0001f && s->density_turbulence > 0.0001f) {
        turbulence_process(&s->turbulence, turb_buf_l, turb_buf_r, block_size,
                          s->layer_turbulence * s->density_turbulence, &s->rng, sr);
    }

    if (s->layer_bubbling > 0.0001f && s->density_bubbling > 0.0001f) {
        bubbling_process(&s->bubbling, bubble_buf_l, bubble_buf_r, block_size,
                        s->layer_bubbling, s->density_bubbling, &s->rng, sr);
        // Band-limit bubbling (matches JS: 250Hz HPF, 1.5kHz LPF)
        for (int i = 0; i < block_size; i++) {
            bubble_buf_l[i] = biquad_process(&s->bubble_bp_lpf_l,
                              biquad_process(&s->bubble_bp_hpf_l, bubble_buf_l[i]));
            bubble_buf_r[i] = biquad_process(&s->bubble_bp_lpf_r,
                              biquad_process(&s->bubble_bp_hpf_r, bubble_buf_r[i]));
        }
    }

    if (s->layer_roar > 0.0001f && s->density_roar > 0.0001f) {
        roar_process(&s->roar, roar_buf_l, roar_buf_r, block_size,
                    s->layer_roar * s->density_roar, &s->rng, sr);
    }

    if (s->layer_rivulets > 0.0001f && s->density_rivulets > 0.0001f) {
        rivulet_process(&s->rivulets, rivulet_buf_l, rivulet_buf_r, block_size,
                       s->layer_rivulets * s->density_rivulets, &s->rng, sr);
    }

    // ── Glass pane: input-driven excitation from drop audio (matches JS) ──
    if (s->preset == WATER_RAIN || s->glass.level > 0.0001f) {
        // Sum drop audio as input signal for glass excitation
        float drop_mono_sum = 0.0f;
        for (int i = 0; i < block_size; i++) {
            drop_mono_sum += (hard_buf_l[i] + hard_buf_r[i]) * 0.5f;
        }
        float avg_input = drop_mono_sum / (float)block_size;
        glass_process(&s->glass, glass_buf_l, glass_buf_r, block_size,
                     (s->preset == WATER_RAIN ? s->glass_thickness * 0.3f : 0.0f),
                     avg_input, sr);
    }

    // ── Mix all layers → output chain (matches JS exactly) ──
    float intensity_scale = 0.5f + s->smoothed_intensity * 1.0f;

    for (int i = 0; i < block_size; i++) {
        // Per-layer gain multipliers (matches JS mix section)
        float l = (
            hard_buf_l[i] * s->layer_hard_drops * 0.6f +
            soft_buf_l[i] * s->layer_water_drops * 0.75f +
            turb_buf_l[i] * s->layer_turbulence * s->density_turbulence * 0.7f +
            bubble_buf_l[i] * 0.75f +
            roar_buf_l[i] * 0.8f +
            rivulet_buf_l[i] * 0.4f +
            glass_buf_l[i] * 0.2f
        ) * intensity_scale;

        float r = (
            hard_buf_r[i] * s->layer_hard_drops * 0.6f +
            soft_buf_r[i] * s->layer_water_drops * 0.75f +
            turb_buf_r[i] * s->layer_turbulence * s->density_turbulence * 0.7f +
            bubble_buf_r[i] * 0.75f +
            roar_buf_r[i] * 0.8f +
            rivulet_buf_r[i] * 0.4f +
            glass_buf_r[i] * 0.2f
        ) * intensity_scale;

        // Distance filter (raw coefficient, matches JS OnePole)
        l = onepole_process(&s->dist_lpf_l, l);
        r = onepole_process(&s->dist_lpf_r, r);

        // DC blocking (matches JS: 0.9975 coefficient)
        l = dc_block(&s->dc_l, l);
        r = dc_block(&s->dc_r, r);

        // Fade & final gain × 0.8 (matches JS)
        s->output[i * 2]     = l * s->fade_gain * 0.8f;
        s->output[i * 2 + 1] = r * s->fade_gain * 0.8f;
    }

    // Stats
    s->stat_samples += block_size;
    if (s->stat_samples >= (int)sr) {
        s->events_per_sec = s->event_counter;
        s->event_counter = 0;
        s->stat_samples = 0;
    }
}

void water_set_preset(int preset) {
    if (!g_water) return;
    WaterState* s = g_water;
    s->preset = preset;
    s->base_freq = water_preset_base_freq(preset);

    // Set per-preset parameters (matches JS WATER_PRESETS exactly)
    switch (preset) {
        case WATER_TAP_DRIPS:
            s->event_rate_min   = 0.5f;
            s->event_rate_max   = 2.0f;
            s->drop_size_min    = 0.5f;
            s->drop_size_max    = 0.9f;
            s->hardness         = 0.8f;
            s->decay_time       = 0.05f;
            s->sink_material    = 0.3f;
            s->burst_probability = 0.08f;
            s->burst_count_min  = 2;
            s->burst_count_max  = 3;
            // Layer mix (matches JS tapDrips.layers)
            s->layer_hard_drops   = 0.7f;
            s->layer_water_drops  = 0.5f;
            s->layer_turbulence   = 0.3f;
            s->layer_bubbling     = 0.0f;
            s->layer_roar         = 0.0f;
            s->layer_rivulets     = 0.0f;
            break;
        case WATER_STREAM:
            s->event_rate_min   = 3.5f;
            s->event_rate_max   = 10.0f;
            s->drop_size_min    = 0.28f;
            s->drop_size_max    = 0.62f;
            s->hardness         = 0.2f;
            s->decay_time       = 0.06f;
            s->sink_material    = 0.0f;
            s->burst_probability = 0.1f;
            s->burst_count_min  = 2;
            s->burst_count_max  = 3;
            // Layer mix (matches JS stream.layers)
            s->layer_hard_drops   = 0.08f;
            s->layer_water_drops  = 0.82f;
            s->layer_turbulence   = 0.56f;
            s->layer_bubbling     = 0.92f;
            s->layer_roar         = 0.0f;
            s->layer_rivulets     = 0.0f;
            break;
        case WATER_WATERFALL:
            s->event_rate_min   = 20.0f;
            s->event_rate_max   = 50.0f;
            s->drop_size_min    = 0.1f;
            s->drop_size_max    = 0.3f;
            s->hardness         = 0.2f;
            s->decay_time       = 0.02f;
            s->sink_material    = 0.0f;
            s->burst_probability = 0.15f;
            s->burst_count_min  = 3;
            s->burst_count_max  = 6;
            // Layer mix (matches JS waterfall.layers)
            s->layer_hard_drops   = 0.1f;
            s->layer_water_drops  = 0.3f;
            s->layer_turbulence   = 0.4f;
            s->layer_bubbling     = 0.4f;
            s->layer_roar         = 1.0f;
            s->layer_rivulets     = 0.0f;
            break;
        case WATER_RAIN:
            s->event_rate_min   = 2.0f;
            s->event_rate_max   = 8.0f;
            s->drop_size_min    = 0.28f;
            s->drop_size_max    = 0.82f;
            s->hardness         = 0.58f;
            s->decay_time       = 0.04f;
            s->sink_material    = 0.5f;
            s->burst_probability = 0.06f;
            s->burst_count_min  = 2;
            s->burst_count_max  = 3;
            // Layer mix (matches JS rainWindow.layers)
            s->layer_hard_drops   = 0.32f;
            s->layer_water_drops  = 0.42f;
            s->layer_turbulence   = 0.18f;
            s->layer_bubbling     = 0.0f;
            s->layer_roar         = 0.0f;
            s->layer_rivulets     = 0.92f;
            break;
    }

    // Init glass for rain preset
    if (preset == WATER_RAIN) {
        if (!s->glass.inited) glass_init(&s->glass, s->sample_rate);
        glass_set_thickness(&s->glass, s->glass_thickness, s->sample_rate);
    }

    water_update_scheduling(s);
}

void water_set_params(float intensity, float rate, float distance,
                      float base_freq, float drop_size, float hardness,
                      float glass_thickness) {
    if (!g_water) return;
    g_water->intensity = intensity;
    g_water->rate = rate;
    g_water->distance = distance;
    g_water->base_freq = base_freq;
    g_water->drop_size = drop_size;
    g_water->hardness = hardness;
    g_water->glass_thickness = glass_thickness;

    // Update glass thickness when changed (matches JS)
    if (g_water->glass.inited) {
        glass_set_thickness(&g_water->glass, glass_thickness, g_water->sample_rate);
    }

    water_update_scheduling(g_water);
}

void water_set_layer_mix(float hard_drops, float water_drops, float turbulence,
                         float bubbling, float roar, float rivulets) {
    if (!g_water) return;
    g_water->layer_hard_drops = hard_drops;
    g_water->layer_water_drops = water_drops;
    g_water->layer_turbulence = turbulence;
    g_water->layer_bubbling = bubbling;
    g_water->layer_roar = roar;
    g_water->layer_rivulets = rivulets;
}

void water_set_layer_density(float hard_drops, float water_drops, float turbulence,
                             float bubbling, float roar, float rivulets) {
    if (!g_water) return;
    g_water->density_hard_drops = hard_drops;
    g_water->density_water_drops = water_drops;
    g_water->density_turbulence = turbulence;
    g_water->density_bubbling = bubbling;
    g_water->density_roar = roar;
    g_water->density_rivulets = rivulets;
    water_update_scheduling(g_water);
}

void water_start(void) {
    if (!g_water) return;
    g_water->fade_target = 1.0f;
    g_water->fade_inc = 1.0f / (g_water->sample_rate * 0.2f);  // 200ms fade
}

void water_stop(void) {
    if (!g_water) return;
    g_water->fade_target = 0.0f;
    g_water->fade_inc = 1.0f / (g_water->sample_rate * 0.2f);
}

void water_set_seed(int seed) {
    if (!g_water) return;
    g_water->rng.state = (uint32_t)seed;
}

int water_get_active_voices(void) {
    if (!g_water) return 0;
    int count = 0;
    for (int i = 0; i < WATER_MAX_HARD_VOICES; i++)
        if (g_water->hard_drops[i].active) count++;
    for (int i = 0; i < WATER_MAX_SOFT_VOICES; i++)
        if (g_water->soft_drops[i].active) count++;
    return count;
}

int water_get_events_per_sec(void) {
    return g_water ? g_water->events_per_sec : 0;
}

} // extern "C" (water API)


// ═══════════════════════════════════════════════════════════
//  INSECTS ENGINE
// ═══════════════════════════════════════════════════════════

enum InsectEngine {
    INSECT_CRICKET     = 0,
    INSECT_TREE_CRICKET = 1,
    INSECT_KATYDID     = 2,
    INSECT_CICADA      = 3,
    INSECT_GRASSHOPPER = 4,
    INSECT_MOLE_CRICKET = 5,
    INSECT_FLY_BEE     = 6,
};

#define INSECT_MAX_VOICES 12

// ── Cricket Voice ──
struct CricketVoice {
    int active;
    float tooth_phase;        // tooth-strike exciter phase [0..1)
    float tooth_freq;         // carrier freq from tooth-strike rate
    float base_freq;
    float freq_offset;
    float noise_state;        // scraper friction noise
    Biquad wing_res1, wing_res2;  // wing harp resonators
    float pan_l, pan_r;
    float volume;
    float distance;
    // State machine: chirp / silence
    int   state_chirping;     // 1=chirp, 0=silence
    int   state_timer;
    int   chirp_duration;
    int   silence_duration;
    // Syllable pulsing within chirp
    float pulse_phase;
    float pulse_rate;         // syllables per second
    float pulse_env;
    float freq_mod;           // per-syllable freq variation
    float temperature;
    float jitter_amount;
};

static void cricket_set_params(CricketVoice* v, Rng* rng, float sr,
                               float temperature, float pan_param, float dist_param) {
    v->active = 1;
    v->temperature = temperature;

    // Dolbear's law: chirps/sec ≈ (T-40)/4
    float chirp_rate = 0.6f + temperature * 2.0f;
    v->chirp_duration = (int)(sr * (0.25f + rng_next(rng) * 0.4f) / chirp_rate);
    v->silence_duration = (int)(sr * (0.15f + rng_next(rng) * 0.25f) / chirp_rate);

    // Pulse/syllable rate within chirp
    v->pulse_rate = 20.0f + temperature * 15.0f + rng_next(rng) * 8.0f;

    // Carrier frequency from tooth-strike rate (~5 kHz typical)
    v->base_freq = 4500.0f + rng_next(rng) * 800.0f;
    v->tooth_freq = v->base_freq;
    v->freq_offset = (rng_next(rng) - 0.5f) * 150.0f;

    // Wing harp resonators (high Q for tonal purity)
    biquad_set_bandpass(&v->wing_res1, v->base_freq + v->freq_offset, 12.0f, sr);
    // Second formant at 1.5× base (NOT 0.98×)
    biquad_set_bandpass(&v->wing_res2, (v->base_freq + v->freq_offset) * 1.5f, 8.0f, sr);
    biquad_reset(&v->wing_res1);
    biquad_reset(&v->wing_res2);

    // Spatial position
    float pan = (pan_param != -99.0f) ? pan_param : (rng_next(rng) - 0.5f) * 1.8f;
    v->distance = (dist_param >= 0.0f) ? dist_param : rng_next(rng) * 0.7f;
    v->volume = 1.0f - v->distance * 0.6f;

    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);

    v->jitter_amount = 0.02f + rng_next(rng) * 0.03f;
}

static void cricket_init_voice(CricketVoice* v, int index, Rng* rng, float sr,
                               float density, float temperature) {
    memset(v, 0, sizeof(CricketVoice));
    v->tooth_phase = rng_next(rng);
    v->noise_state = 0.0f;
    v->state_chirping = 0;
    v->state_timer = rng_int(rng, (int)(sr * 0.1f), (int)(sr * 0.5f));
    v->pulse_phase = 0.0f;
    v->pulse_env = 0.0f;
    v->freq_mod = 0.0f;
    cricket_set_params(v, rng, sr, temperature, -99.0f, -1.0f);
}

static void cricket_process_voice(CricketVoice* v, float* outL, float* outR,
                                  int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // State machine: chirp ↔ silence
        v->state_timer++;

        if (!v->state_chirping) {
            // In silence
            if (v->state_timer >= v->silence_duration) {
                v->state_chirping = 1;
                v->state_timer = 0;
                v->pulse_phase = 0.0f;
                // Randomize next silence
                float chirp_rate = 0.6f + v->temperature * 2.0f;
                v->silence_duration = (int)(sr * (0.15f + rng_next(rng) * 0.25f) / chirp_rate);
            }
            continue; // JS returns [0,0] during silence
        }

        // In chirp
        if (v->state_timer >= v->chirp_duration) {
            v->state_chirping = 0;
            v->state_timer = 0;
            float chirp_rate = 0.6f + v->temperature * 2.0f;
            v->chirp_duration = (int)(sr * (0.25f + rng_next(rng) * 0.4f) / chirp_rate);
            continue;
        }

        // Syllable/pulse envelope
        v->pulse_phase += v->pulse_rate * inv_sr;
        if (v->pulse_phase >= 1.0f) {
            v->pulse_phase -= 1.0f;
            // Subtle frequency variation per syllable
            v->freq_mod = (rng_next(rng) - 0.5f) * 80.0f;
        }

        // Pulse envelope: fast attack (0.15), sustain to 0.4, decay rate 2.5
        float syl_pos = v->pulse_phase;
        float pulse_target;
        if (syl_pos < 0.15f)      pulse_target = syl_pos / 0.15f;
        else if (syl_pos < 0.4f)  pulse_target = 1.0f;
        else                      pulse_target = fmaxf(0.0f, 1.0f - (syl_pos - 0.4f) * 2.5f);
        v->pulse_env += (pulse_target - v->pulse_env) * 0.15f;

        // Tooth-strike exciter: narrow pulse at carrier freq
        float current_freq = v->tooth_freq + v->freq_offset + v->freq_mod;
        v->tooth_phase += current_freq * inv_sr;
        if (v->tooth_phase >= 1.0f) v->tooth_phase -= 1.0f;

        // Exciter: narrow pulse (0.1 duty) + scraper friction noise
        float tooth_pulse = (v->tooth_phase < 0.1f) ? 1.0f : 0.0f;
        v->noise_state = v->noise_state * 0.7f + (rng_next(rng) * 2.0f - 1.0f) * 0.3f;
        float exciter = (tooth_pulse * 0.8f + v->noise_state * 0.15f) * v->pulse_env;

        // Wing harp resonators
        float resonated1 = biquad_process(&v->wing_res1, exciter);
        float resonated2 = biquad_process(&v->wing_res2, exciter);

        float sample = (resonated1 * 0.7f + resonated2 * 0.2f) * v->volume * 1.2f;

        outL[i] += sample * v->pan_l;
        outR[i] += sample * v->pan_r;
    }
}

// ── Tree Cricket Voice ──
struct TreeCricketVoice {
    int active;
    float phase;
    float freq;
    float freq_lfo_phase;
    float freq_lfo_rate;
    float freq_lfo_depth;     // additive Hz
    float am_phase;           // wing stroke AM
    float am_rate;
    float trill_phase;
    float trill_rate;
    float pan_l, pan_r;
    float volume;
    float distance;
    float temperature;
    // Phrase on/off
    float phrase_gain;
    float phrase_target;
    float attack_slew;
    float release_slew;
    int   is_resting;
    int   phase_timer;
    int   on_samples;
    int   off_samples;
};

static void tree_cricket_set_params(TreeCricketVoice* v, Rng* rng, float sr,
                                    float temperature, float pan_param, float dist_param) {
    v->active = 1;
    v->temperature = temperature;

    // Frequency varies with temperature (thermometer cricket)
    v->freq = 2300.0f + temperature * 550.0f + (rng_next(rng) - 0.5f) * 120.0f;

    // Wing stroke rate temperature-dependent
    v->am_rate = 28.0f + temperature * 18.0f;

    // Spatial
    float pan = (pan_param != -99.0f) ? pan_param : (rng_next(rng) - 0.5f) * 1.8f;
    v->distance = (dist_param >= 0.0f) ? dist_param : rng_next(rng) * 0.8f;
    v->volume = 1.0f - v->distance * 0.45f;

    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);

    v->freq_lfo_phase = rng_next(rng);
    v->freq_lfo_rate = 0.08f + rng_next(rng) * 0.12f;
    v->freq_lfo_depth = 1.2f + rng_next(rng) * 1.6f;
    v->trill_rate = 18.0f + temperature * 10.0f;
    v->on_samples = (int)(sr * (0.9f + rng_next(rng) * 0.8f));
    v->off_samples = (int)(sr * (0.8f + rng_next(rng) * 0.9f));
}

static void tree_cricket_init_voice(TreeCricketVoice* v, int index, Rng* rng,
                                    float sr, float temperature) {
    memset(v, 0, sizeof(TreeCricketVoice));
    v->phase = rng_next(rng);
    v->am_phase = rng_next(rng);
    v->trill_phase = rng_next(rng);
    v->phrase_gain = 1.0f;
    v->phrase_target = 1.0f;
    v->attack_slew = 0.002f;
    v->release_slew = 0.00045f;
    v->is_resting = 0;
    v->phase_timer = 0;
    tree_cricket_set_params(v, rng, sr, temperature, -99.0f, -1.0f);
}

static void tree_cricket_process_voice(TreeCricketVoice* v, float* outL, float* outR,
                                       int block_size, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // Phrase on/off timing
        v->phase_timer++;
        if (v->is_resting && v->phase_timer >= v->off_samples) {
            v->is_resting = 0;
            v->phase_timer = 0;
            v->phrase_target = 1.0f;
        } else if (!v->is_resting && v->phase_timer >= v->on_samples) {
            v->is_resting = 1;
            v->phase_timer = 0;
            v->phrase_target = 0.0f;
        }

        // Multiplicative slew (matches JS: gain += (target - gain) * slew)
        float slew = (v->phrase_target > v->phrase_gain) ? v->attack_slew : v->release_slew;
        v->phrase_gain += (v->phrase_target - v->phrase_gain) * slew;
        if (v->is_resting && v->phrase_gain < 0.00005f) {
            continue;
        }

        // Slow frequency drift (additive Hz)
        v->freq_lfo_phase += v->freq_lfo_rate * inv_sr;
        if (v->freq_lfo_phase >= 1.0f) v->freq_lfo_phase -= 1.0f;
        float freq_mod = fast_sin(v->freq_lfo_phase * TAU_F) * v->freq_lfo_depth;

        // Main oscillator - very pure tone
        float current_freq = v->freq + freq_mod;
        v->phase += current_freq * inv_sr;
        if (v->phase >= 1.0f) v->phase -= 1.0f;

        // Nearly pure sine with tiny 2nd harmonic for warmth
        float sample = fast_sin(v->phase * TAU_F);
        sample += fast_sin(v->phase * TAU_F * 2.0f) * 0.02f;

        // Subtle AM from wing strokes: 0.9 + 0.1*sin (NOT 0.5+0.5)
        v->am_phase += v->am_rate * inv_sr;
        if (v->am_phase >= 1.0f) v->am_phase -= 1.0f;
        float am = 0.9f + 0.1f * fast_sin(v->am_phase * TAU_F);

        // Trill: 0.65 + 0.35*max(0, sin)
        v->trill_phase += v->trill_rate * inv_sr;
        if (v->trill_phase >= 1.0f) v->trill_phase -= 1.0f;
        float trill_val = fast_sin(v->trill_phase * TAU_F);
        float trill_env = 0.65f + 0.35f * fmaxf(0.0f, trill_val);

        sample *= am * trill_env * v->volume * 0.14f * v->phrase_gain;
        outL[i] += sample * v->pan_l;
        outR[i] += sample * v->pan_r;
    }
}

// ── Katydid Voice ──
struct KatydidVoice {
    int active;
    Biquad bp[4];         // 4 bandpass resonators
    Biquad rasp_hpf;
    float noise_state1, noise_state2;
    float pan_l, pan_r;
    float volume;
    float distance;
    float temperature;
    // State machine: chirp / silence
    int   state_chirping;
    int   state_timer;
    int   chirp_duration;
    int   silence_duration;
    // Pulse envelope
    float pulse_phase;
    float pulse_rate;
    float pulse_env;
    // Antiphonal
    int   group;          // 0 or 1
    float base_freq;
    float antiphony_delay;
};

static void katydid_set_params(KatydidVoice* v, int index, Rng* rng,
                               float sr, float temperature, float antiphony,
                               float pan_param, float dist_param) {
    v->active = 1;
    v->temperature = temperature;
    v->antiphony_delay = sr * antiphony;

    float chirp_rate = 0.4f + temperature * 1.0f;
    v->chirp_duration = (int)(sr * (0.3f + rng_next(rng) * 0.3f) / chirp_rate);
    v->silence_duration = (int)(sr * (0.25f + rng_next(rng) * 0.35f) / chirp_rate);

    // Add antiphony offset for group 1
    if (v->group == 1) {
        v->state_timer = -(int)v->antiphony_delay;
        v->state_chirping = 0;
    }

    v->pulse_rate = 12.0f + temperature * 8.0f + rng_next(rng) * 5.0f;
    v->base_freq = 3500.0f + rng_next(rng) * 600.0f;

    // 4 BPFs at correct multipliers: 0.85×, 1.2×, 2.0×, 3.0× (NOT 1×,1.4×,2.1×,3×)
    float freq_mults[4] = {0.85f, 1.2f, 2.0f, 3.0f};
    float freq_rand[4];
    freq_rand[0] = rng_next(rng) * 200.0f;
    freq_rand[1] = rng_next(rng) * 300.0f;
    freq_rand[2] = rng_next(rng) * 500.0f;
    freq_rand[3] = 0.0f;
    float Qs[4] = {3.0f, 2.5f, 2.0f, 1.5f};
    for (int f = 0; f < 4; f++) {
        float freq = v->base_freq * freq_mults[f] + freq_rand[f];
        if (f == 3) freq = fminf(freq, sr * 0.4f);
        biquad_set_bandpass(&v->bp[f], freq, Qs[f], sr);
        biquad_reset(&v->bp[f]);
    }

    // Rasp HPF: 2kHz, Q=0.5
    biquad_set_highpass(&v->rasp_hpf, 2000.0f, 0.5f, sr);
    biquad_reset(&v->rasp_hpf);

    float pan = (pan_param != -99.0f) ? pan_param : (rng_next(rng) - 0.5f) * 1.6f;
    v->distance = (dist_param >= 0.0f) ? dist_param : rng_next(rng) * 0.6f;
    v->volume = 1.0f - v->distance * 0.5f;

    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);
}

static void katydid_init_voice(KatydidVoice* v, int index, Rng* rng,
                               float sr, float antiphony) {
    memset(v, 0, sizeof(KatydidVoice));
    v->group = index % 2;
    v->state_chirping = 1; // JS starts with state = 'chirping'
    v->state_timer = 0;
    v->pulse_phase = 0.0f;
    v->pulse_env = 0.0f;
    katydid_set_params(v, index, rng, sr, 0.5f, antiphony, -99.0f, -1.0f);
}

static void katydid_process_voice(KatydidVoice* v, float* outL, float* outR,
                                  int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        v->state_timer++;

        if (!v->state_chirping) {
            // In silence
            if (v->state_timer >= v->silence_duration) {
                v->state_chirping = 1;
                v->state_timer = 0;
                v->pulse_phase = 0.0f;
            }
            continue;
        }

        // In chirp
        if (v->state_timer >= v->chirp_duration) {
            v->state_chirping = 0;
            v->state_timer = 0;
            float chirp_rate = 0.4f + v->temperature * 1.0f;
            v->chirp_duration = (int)(sr * (0.3f + rng_next(rng) * 0.3f) / chirp_rate);
            continue;
        }

        // Pulse envelope (harsh bursts)
        v->pulse_phase += v->pulse_rate * inv_sr;
        if (v->pulse_phase >= 1.0f) v->pulse_phase -= 1.0f;

        // Sharp attack (0.08), sustain to 0.25, fast decay (×3)
        float pp = v->pulse_phase;
        float pulse_target;
        if (pp < 0.08f)       pulse_target = pp / 0.08f;
        else if (pp < 0.25f)  pulse_target = 1.0f;
        else                  pulse_target = fmaxf(0.0f, 1.0f - (pp - 0.25f) * 3.0f);
        v->pulse_env += (pulse_target - v->pulse_env) * 0.2f;

        // Broadband noise excitation (NOT pure tone)
        float n1 = rng_next(rng) * 2.0f - 1.0f;
        float n2 = rng_next(rng) * 2.0f - 1.0f;
        v->noise_state1 = v->noise_state1 * 0.3f + n1 * 0.7f;
        v->noise_state2 = v->noise_state2 * 0.5f + n2 * 0.5f;
        float noise = (v->noise_state1 * 0.6f + v->noise_state2 * 0.4f) * v->pulse_env;

        // 4 BPFs with per-band gains: 0.5, 0.7, 0.4, 0.25
        float band_gains[4] = {0.5f, 0.7f, 0.4f, 0.25f};
        float resonated = 0.0f;
        for (int f = 0; f < 4; f++) {
            resonated += biquad_process(&v->bp[f], noise) * band_gains[f];
        }

        // Rasp: HPF with 0.15 gain
        float rasp = biquad_process(&v->rasp_hpf, noise) * 0.15f;

        float sample = (resonated + rasp) * v->volume * 0.6f;
        outL[i] += sample * v->pan_l;
        outR[i] += sample * v->pan_r;
    }
}

// ── Cicada Voice ──
struct CicadaVoice {
    int active;
    float mod_phase;      // AM buzz phase [0..1)
    float mod_rate;       // 40-200 Hz tymbal muscle rate
    float breath_phase;   // slow breathing LFO [0..1)
    float breath_rate;    // 0.15-0.45 Hz
    float noise_state;
    Biquad res[3];        // resonant bandpass filters
    float pan_l, pan_r;
    float volume;
    float distance;
    float temperature;
    float base_freq;
};

static void cicada_set_params(CicadaVoice* v, Rng* rng,
                              float sr, float temperature, float click_rate,
                              float pan_param, float dist_param) {
    v->active = 1;
    v->temperature = temperature;

    // Modulation rate: (40+clickRate*160)*(0.6+temp*0.8)
    float base_rate = 40.0f + click_rate * 160.0f;
    v->mod_rate = base_rate * (0.6f + temperature * 0.8f);

    // Base resonant frequency with temperature dependency
    v->base_freq = 3500.0f + rng_next(rng) * 1500.0f + temperature * 500.0f;

    // 3 BPFs at 1×, 1.5×, 2.2× base (with per-voice randomization)
    float freq_mults[3] = {1.0f, 1.5f, 2.2f};
    float freq_rand_mult[3] = {0.95f + rng_next(rng) * 0.1f,
                                0.9f + rng_next(rng) * 0.2f,
                                0.85f + rng_next(rng) * 0.3f};
    float Qs[3] = {8.0f, 6.0f, 4.0f};
    for (int f = 0; f < 3; f++) {
        biquad_set_bandpass(&v->res[f], v->base_freq * freq_mults[f] * freq_rand_mult[f], Qs[f], sr);
        biquad_reset(&v->res[f]);
    }

    float pan = (pan_param != -99.0f) ? pan_param : (rng_next(rng) - 0.5f) * 1.8f;
    v->distance = (dist_param >= 0.0f) ? dist_param : rng_next(rng) * 0.8f;
    v->volume = 1.0f - v->distance * 0.4f;

    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);

    v->breath_rate = 0.15f + rng_next(rng) * 0.3f;
}

static void cicada_init_voice(CicadaVoice* v, int index, Rng* rng,
                              float sr, float temperature, float click_rate) {
    memset(v, 0, sizeof(CicadaVoice));
    v->mod_phase = rng_next(rng);
    v->breath_phase = rng_next(rng);
    v->noise_state = 0.0f;
    cicada_set_params(v, rng, sr, temperature, click_rate, -99.0f, -1.0f);
}

static void cicada_process_voice(CicadaVoice* v, float* outL, float* outR,
                                 int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // AM buzz envelope: 0.5 + 0.5*abs(sin) (NOT rectified)
        float mod_wave = fast_sin(v->mod_phase * TAU_F);
        float buzz_env = 0.5f + 0.5f * fabsf(mod_wave);
        v->mod_phase += v->mod_rate * inv_sr;
        if (v->mod_phase >= 1.0f) v->mod_phase -= 1.0f;

        // Breathing LFO: 0.7 + 0.3*sin
        float breath_mod = 0.7f + 0.3f * fast_sin(v->breath_phase * TAU_F);
        v->breath_phase += v->breath_rate * inv_sr;
        if (v->breath_phase >= 1.0f) v->breath_phase -= 1.0f;

        // Noise excitation
        v->noise_state = v->noise_state * 0.3f + (rng_next(rng) * 2.0f - 1.0f) * 0.7f;
        float exciter = v->noise_state * buzz_env * breath_mod;

        // Through 3 resonant BP filters with weights: 1.0, 0.6, 0.3
        float r1 = biquad_process(&v->res[0], exciter);
        float r2 = biquad_process(&v->res[1], exciter);
        float r3 = biquad_process(&v->res[2], exciter);
        float resonated = r1 * 1.0f + r2 * 0.6f + r3 * 0.3f;

        float sample = resonated * v->volume * 0.35f;
        outL[i] += sample * v->pan_l;
        outR[i] += sample * v->pan_r;
    }
}
// ── Grasshopper Voice ──
struct GrasshopperVoice {
    int active;
    float stroke_phase;   // [0..1) leg stroke
    float stroke_rate;    // strokes per second
    float stroke_env;     // smoothed envelope
    float tooth_phase;    // [0..1) tooth impacts within stroke
    float tooth_rate;     // teeth per second
    float noise_state;
    Biquad res_bp;
    Biquad hpf;
    float pan_l, pan_r;
    float volume;
    float distance;
    float base_freq;
};

static void grasshopper_set_params(GrasshopperVoice* v, Rng* rng,
                                   float sr, float temperature,
                                   float pan_param, float dist_param) {
    v->active = 1;

    // Stroke rate: 10-25 per second (temperature-dependent)
    v->stroke_rate = 10.0f + temperature * 15.0f + (rng_next(rng) - 0.5f) * 5.0f;

    // Tooth rate: 600-1000 (NOT clickRate-based)
    v->tooth_rate = 600.0f + rng_next(rng) * 400.0f;

    // Resonant frequency
    v->base_freq = 6000.0f + rng_next(rng) * 4000.0f;
    biquad_set_bandpass(&v->res_bp, v->base_freq, 3.0f, sr);  // Q=3 (not 4)
    biquad_set_highpass(&v->hpf, 2000.0f, 0.7f, sr);         // 2000Hz (not 3000)
    biquad_reset(&v->res_bp);
    biquad_reset(&v->hpf);

    float pan = (pan_param != -99.0f) ? pan_param : (rng_next(rng) - 0.5f) * 1.8f;
    v->distance = (dist_param >= 0.0f) ? dist_param : rng_next(rng) * 0.8f;
    v->volume = 1.0f - v->distance * 0.4f;

    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);

    v->stroke_phase = rng_next(rng); // Desync individuals
}

static void grasshopper_init_voice(GrasshopperVoice* v, int index, Rng* rng,
                                   float sr, float temperature, float click_rate) {
    memset(v, 0, sizeof(GrasshopperVoice));
    v->noise_state = 0.0f;
    v->stroke_env = 0.0f;
    v->tooth_phase = 0.0f;
    grasshopper_set_params(v, rng, sr, temperature, -99.0f, -1.0f);
}

static void grasshopper_process_voice(GrasshopperVoice* v, float* outL, float* outR,
                                      int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // Leg stroke envelope (on-off rhythm)
        v->stroke_phase += v->stroke_rate * inv_sr;
        if (v->stroke_phase >= 1.0f) v->stroke_phase -= 1.0f;

        // Active during first ~60% of stroke cycle
        float target_env = (v->stroke_phase < 0.6f) ? 1.0f : 0.0f;
        // Smooth: env*0.995 + target*0.005 (matches JS)
        v->stroke_env = v->stroke_env * 0.995f + target_env * 0.005f;

        // Tooth impacts during active stroke
        v->tooth_phase += v->tooth_rate * inv_sr;
        float tooth_impulse = 0.0f;
        if (v->tooth_phase >= 1.0f) {
            v->tooth_phase -= 1.0f;
            tooth_impulse = 0.5f + rng_next(rng) * 0.5f; // Variable tooth contact
        }

        // Scratchy noise: state*0.4 + noise*0.6 (JS order)
        v->noise_state = v->noise_state * 0.4f + (rng_next(rng) * 2.0f - 1.0f) * 0.6f;

        // Exciter: impulse*0.6 + noise*0.4 (not impulse+noise*0.1)
        float exciter = (tooth_impulse * 0.6f + v->noise_state * 0.4f) * v->stroke_env;

        // Filter through resonance then HPF
        float res = biquad_process(&v->res_bp, exciter);
        float sample = biquad_process(&v->hpf, res);

        float output = sample * v->volume * 0.3f;
        outL[i] += output * v->pan_l;
        outR[i] += output * v->pan_r;
    }
}

// ── Mole Cricket Voice ──
struct MoleCricketVoice {
    int active;
    float osc_phase;      // [0..1) main tone oscillator
    float freq;
    float trill_phase;    // [0..1) trill pulse phase
    float trill_rate;     // pulses per second in trill
    float cycle_phase;    // [0..1) trill on/off cycling
    float cycle_rate;     // trills per second
    Biquad res1, res2;    // burrow resonators
    Biquad lpf;           // ground LPF
    float pan_l, pan_r;
    float volume;
    float distance;
    float temperature;
};

static void mole_cricket_set_params(MoleCricketVoice* v, Rng* rng,
                                    float sr, float temperature,
                                    float pan_param, float dist_param) {
    v->active = 1;
    v->temperature = temperature;

    // Frequency: 1.5-3 kHz (lower than field cricket)
    v->freq = 1500.0f + temperature * 1000.0f + (rng_next(rng) - 0.5f) * 400.0f;

    // Trill rate varies with temperature
    v->trill_rate = 35.0f + temperature * 40.0f;
    v->cycle_rate = 0.5f + temperature * 0.6f;

    // Burrow resonance: res1 at freq Q=10, res2 at freq*2.0 Q=6
    biquad_set_bandpass(&v->res1, v->freq, 10.0f, sr);
    biquad_set_bandpass(&v->res2, v->freq * 2.0f, 6.0f, sr);
    biquad_set_lowpass(&v->lpf, v->freq * 3.0f, 1.0f, sr);
    biquad_reset(&v->res1);
    biquad_reset(&v->res2);
    biquad_reset(&v->lpf);

    float pan = (pan_param != -99.0f) ? pan_param : (rng_next(rng) - 0.5f) * 1.8f;
    v->distance = (dist_param >= 0.0f) ? dist_param : rng_next(rng) * 0.8f;
    v->volume = 1.0f - v->distance * 0.35f;

    v->pan_l = fast_cos((pan + 1.0f) * PI_F * 0.25f);
    v->pan_r = fast_sin((pan + 1.0f) * PI_F * 0.25f);
}

static void mole_cricket_init_voice(MoleCricketVoice* v, int index, Rng* rng,
                                    float sr, float temperature) {
    memset(v, 0, sizeof(MoleCricketVoice));
    v->osc_phase = 0.0f;
    v->trill_phase = 0.0f;
    v->cycle_phase = rng_next(rng);
    mole_cricket_set_params(v, rng, sr, temperature, -99.0f, -1.0f);
}

static void mole_cricket_process_voice(MoleCricketVoice* v, float* outL, float* outR,
                                       int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // Trill on/off cycling (70% duty cycle)
        v->cycle_phase += v->cycle_rate * inv_sr;
        if (v->cycle_phase >= 1.0f) v->cycle_phase -= 1.0f;
        int trill_on = (v->cycle_phase < 0.7f) ? 1 : 0;

        // Trill pulse envelope: sinusoidal when on, 0 when off
        v->trill_phase += v->trill_rate * inv_sr;
        if (v->trill_phase >= 1.0f) v->trill_phase -= 1.0f;
        float trill_env = trill_on ? (0.5f + 0.5f * fast_sin(v->trill_phase * TAU_F)) : 0.0f;

        if (trill_env < 0.001f) continue;

        // Generate tone (richer than field cricket due to burrow)
        v->osc_phase += v->freq * inv_sr;
        if (v->osc_phase >= 1.0f) v->osc_phase -= 1.0f;

        // Multiple harmonics for richness
        float tone = fast_sin(v->osc_phase * TAU_F);
        tone += fast_sin(v->osc_phase * TAU_F * 2.0f) * 0.3f;
        tone += fast_sin(v->osc_phase * TAU_F * 3.0f) * 0.1f;

        // Exciter: pure tone * trill_env (NO noise - JS doesn't add noise here)
        float exciter = tone * trill_env;

        // Burrow resonance: res1*0.7 + res2*0.3, then LPF
        float resonated = biquad_process(&v->res1, exciter) * 0.7f;
        resonated += biquad_process(&v->res2, exciter) * 0.3f;
        float filtered = biquad_process(&v->lpf, resonated);

        float output = filtered * v->volume * 0.3f;
        outL[i] += output * v->pan_l;
        outR[i] += output * v->pan_r;
    }
}

// ── Fly/Bee Voice ──
// Harmonic wingbeat oscillator with spectral notch and Doppler
struct FlyBeeVoice {
    int active;
    float wing_phase;     // [0..1) wingbeat fundamental
    float wing_freq;      // ~190Hz fly, ~230Hz bee
    int   is_bee;
    float harmonic_amps[6];
    float harmonic_jitter[6];
    // Spectral notch
    Biquad notch_filter;
    float notch_freq;
    float notch_target;
    int   notch_update_counter;
    // Amplitude modulation LFOs
    float slow_lfo_phase;
    float fast_lfo_phase;
    float slow_lfo_rate;
    float fast_lfo_rate;
    // Motion / Doppler
    float pos_x, pos_y, pos_z;
    float vel_x, vel_y, vel_z;
    int   motion_enabled;
    int   is_close;
    // Output
    float pan;
    float distance;
    float volume;
};

static void fly_bee_set_params(FlyBeeVoice* v, Rng* rng, float sr,
                               int is_bee, int is_close, int motion) {
    v->active = 1;
    v->is_bee = is_bee;

    // Wingbeat fundamental: Fly ~190Hz, Bee ~230Hz
    v->wing_freq = is_bee ? (225.0f + rng_next(rng) * 20.0f)
                          : (185.0f + rng_next(rng) * 15.0f);

    // Harmonic amplitudes
    if (is_bee) {
        float ba[6] = {1.0f, 0.38f, 0.18f, 0.1f, 0.22f, 0.08f};
        for (int i = 0; i < 6; i++) v->harmonic_amps[i] = ba[i];
    } else {
        float fa[6] = {1.0f, 0.46f, 0.22f, 0.12f, 0.1f, 0.05f};
        for (int i = 0; i < 6; i++) v->harmonic_amps[i] = fa[i];
    }

    // Per-harmonic jitter init
    for (int i = 0; i < 6; i++) {
        v->harmonic_jitter[i] = rng_next(rng) * 0.3f;
    }

    // Position and motion
    v->is_close = is_close;
    v->motion_enabled = is_close && motion;

    if (is_close) {
        v->distance = 0.1f + rng_next(rng) * 0.25f;
        v->pos_x = (rng_next(rng) - 0.5f) * 1.5f;
        v->pos_y = (rng_next(rng) - 0.5f) * 1.5f;
        v->pos_z = v->distance;
    } else {
        v->distance = 0.5f + rng_next(rng) * 0.4f;
        v->pos_x = (rng_next(rng) - 0.5f) * 3.0f;
        v->pos_y = (rng_next(rng) - 0.5f) * 2.0f;
        v->pos_z = v->distance;
    }

    v->vel_x = (rng_next(rng) - 0.5f) * 0.0015f;
    v->vel_y = (rng_next(rng) - 0.5f) * 0.001f;
    v->vel_z = (rng_next(rng) - 0.5f) * 0.0005f;

    // LFO rates
    v->slow_lfo_phase = rng_next(rng);
    v->fast_lfo_phase = rng_next(rng);
    v->slow_lfo_rate = 0.12f + rng_next(rng) * 0.2f;
    v->fast_lfo_rate = 4.0f + rng_next(rng) * 5.0f;

    v->volume = 1.0f - v->distance * 0.5f;

    // Notch frequency
    v->notch_freq = 400.0f + rng_next(rng) * 500.0f;
    v->notch_target = v->notch_freq;
    biquad_set_bandpass(&v->notch_filter, v->notch_freq, 3.0f, sr);
    biquad_reset(&v->notch_filter);
    v->notch_update_counter = 0;
}

static void fly_bee_init_voice(FlyBeeVoice* v, int index, Rng* rng, float sr) {
    memset(v, 0, sizeof(FlyBeeVoice));
    v->wing_phase = rng_next(rng);
    // Default init as fly
    fly_bee_set_params(v, rng, sr, 0, 0, 0);
}

static void fly_bee_process_voice(FlyBeeVoice* v, float* outL, float* outR,
                                  int block_size, Rng* rng, float sr) {
    if (!v->active) return;

    float inv_sr = 1.0f / sr;
    for (int i = 0; i < block_size; i++) {
        // Motion update for Doppler
        if (v->motion_enabled) {
            v->vel_x += (rng_next(rng) - 0.5f) * 0.00003f;
            v->vel_y += (rng_next(rng) - 0.5f) * 0.00002f;
            v->vel_z += (rng_next(rng) - 0.5f) * 0.00001f;
            v->vel_x *= 0.9998f;
            v->vel_y *= 0.9998f;
            v->vel_z *= 0.9999f;
            v->pos_x += v->vel_x;
            v->pos_y += v->vel_y;
            v->pos_z += v->vel_z;
            // Bounds
            if (v->pos_x < -2.0f) v->pos_x = -2.0f;
            if (v->pos_x >  2.0f) v->pos_x =  2.0f;
            if (v->pos_y < -1.5f) v->pos_y = -1.5f;
            if (v->pos_y >  1.5f) v->pos_y =  1.5f;
            if (v->pos_z <  0.08f) v->pos_z = 0.08f;
            if (v->pos_z >  1.2f) v->pos_z =  1.2f;
            v->distance = v->pos_z;
        }

        // Amplitude modulation (flight instability)
        v->slow_lfo_phase += v->slow_lfo_rate * inv_sr;
        if (v->slow_lfo_phase >= 1.0f) v->slow_lfo_phase -= 1.0f;
        v->fast_lfo_phase += v->fast_lfo_rate * inv_sr;
        if (v->fast_lfo_phase >= 1.0f) v->fast_lfo_phase -= 1.0f;

        float slow_mod = fast_sin(v->slow_lfo_phase * TAU_F);
        float fast_mod = fast_sin(v->fast_lfo_phase * TAU_F);
        float amp_mod = 0.88f + slow_mod * 0.08f + fast_mod * 0.04f;

        // Doppler shift from velocity
        float doppler_shift = 1.0f;
        if (v->motion_enabled) {
            doppler_shift = 1.0f + v->vel_x * 140.0f;
        }

        // Generate harmonics (wingbeat as harmonic series)
        v->wing_phase += (v->wing_freq * doppler_shift) * inv_sr;
        if (v->wing_phase >= 1.0f) v->wing_phase -= 1.0f;

        float sample = 0.0f;
        float base_phase = v->wing_phase * TAU_F;

        for (int h = 0; h < 6; h++) {
            // Per-harmonic amplitude jitter
            v->harmonic_jitter[h] += (rng_next(rng) - 0.5f) * 0.02f;
            v->harmonic_jitter[h] *= 0.98f;
            float jittered_amp = v->harmonic_amps[h] * (1.0f + v->harmonic_jitter[h]);
            sample += fast_sin(base_phase * (float)(h + 1)) * jittered_amp;
        }

        sample *= amp_mod;

        // Moving spectral notch (updated every 64 samples)
        v->notch_update_counter++;
        if (v->notch_update_counter >= 64) {
            v->notch_update_counter = 0;
            v->notch_target += (rng_next(rng) - 0.5f) * 5.0f;
            if (v->notch_target < 320.0f) v->notch_target = 320.0f;
            if (v->notch_target > 1200.0f) v->notch_target = 1200.0f;
            v->notch_freq += (v->notch_target - v->notch_freq) * 0.08f;
            biquad_set_bandpass(&v->notch_filter, v->notch_freq, 2.4f, sr);
        }

        // Apply notch via subtraction
        float notched = sample - biquad_process(&v->notch_filter, sample) * 0.35f;

        // Volume based on distance
        v->volume = 1.0f - v->distance * 0.5f;
        float output = notched * v->volume * 0.14f;

        // Pan from position
        v->pan = v->pos_x * 0.8f;
        if (v->pan < -1.0f) v->pan = -1.0f;
        if (v->pan >  1.0f) v->pan =  1.0f;
        float pan_angle = (v->pan + 1.0f) * 0.25f * PI_F;

        // High frequency rolloff with distance
        float dist_filter = 1.0f - v->distance * 0.25f;

        outL[i] += output * fast_cos(pan_angle) * dist_filter;
        outR[i] += output * fast_sin(pan_angle) * dist_filter;
    }
}

// ═══════════════════════════════════════════════════════════
//  INSECTS ENGINE — MAIN STATE
// ═══════════════════════════════════════════════════════════

struct InsectsState {
    float sample_rate;
    int   initialized;
    int   engine;

    // Voice pools (all pre-allocated)
    CricketVoice       crickets[INSECT_MAX_VOICES];
    TreeCricketVoice   tree_crickets[10];
    KatydidVoice       katydids[10];
    CicadaVoice        cicadas[8];
    GrasshopperVoice   grasshoppers[8];
    MoleCricketVoice   mole_crickets[8];
    FlyBeeVoice        fly_bees[10];

    // Active voice count per engine
    int active_count;

    // Params (target)
    float density;
    float temperature;
    float distance;
    float proximity;
    float antiphony;
    float click_rate;
    float motion;

    // Smoothed params (matching JS)
    float smoothed_density;
    float smoothed_temp;
    float smoothed_distance;

    // Output chain
    OnePole  dist_lpf_l, dist_lpf_r;
    DCBlocker dc_l, dc_r;

    // Fade
    float fade_gain;
    float fade_target;
    float fade_inc;

    // PRNG
    Rng   rng;

    // Output buffer
    float output[256];
};

static InsectsState* g_insects = nullptr;

static void insects_update_voices(InsectsState* s) {
    float sr = s->sample_rate;
    Rng* rng = &s->rng;

    // JS: getActiveCount = Math.max(1, Math.floor(smoothedDensity * max))
    auto getActiveCount = [&](int max_voices) -> int {
        return (int)fmaxf(1.0f, floorf(s->smoothed_density * (float)max_voices));
    };

    switch (s->engine) {
        case INSECT_CRICKET: {
            int count = getActiveCount(INSECT_MAX_VOICES);
            s->active_count = count;
            for (int i = 0; i < INSECT_MAX_VOICES; i++) {
                if (i < count) {
                    if (!s->crickets[i].active)
                        cricket_init_voice(&s->crickets[i], i, rng, sr, s->smoothed_density, s->smoothed_temp);
                    else
                        cricket_set_params(&s->crickets[i], rng, sr, s->smoothed_temp, -99.0f, -1.0f);
                } else {
                    s->crickets[i].active = 0;
                }
            }
            break;
        }
        case INSECT_TREE_CRICKET: {
            int count = getActiveCount(10);
            s->active_count = count;
            for (int i = 0; i < 10; i++) {
                if (i < count) {
                    if (!s->tree_crickets[i].active)
                        tree_cricket_init_voice(&s->tree_crickets[i], i, rng, sr, s->smoothed_temp);
                    else
                        tree_cricket_set_params(&s->tree_crickets[i], rng, sr, s->smoothed_temp, -99.0f, -1.0f);
                } else {
                    s->tree_crickets[i].active = 0;
                }
            }
            break;
        }
        case INSECT_KATYDID: {
            int count = getActiveCount(10);
            s->active_count = count;
            for (int i = 0; i < 10; i++) {
                if (i < count) {
                    if (!s->katydids[i].active)
                        katydid_init_voice(&s->katydids[i], i, rng, sr, s->antiphony);
                    else
                        katydid_set_params(&s->katydids[i], i, rng, sr, s->smoothed_temp, s->antiphony, -99.0f, -1.0f);
                } else {
                    s->katydids[i].active = 0;
                }
            }
            break;
        }
        case INSECT_CICADA: {
            int count = getActiveCount(8);
            s->active_count = count;
            for (int i = 0; i < 8; i++) {
                if (i < count) {
                    // JS: first 2 are "near", rest are distant
                    float dist_param = -1.0f;
                    if (i < 2) dist_param = 0.1f + rng_next(rng) * 0.2f;
                    else       dist_param = 0.4f + rng_next(rng) * 0.5f;
                    if (!s->cicadas[i].active)
                        cicada_init_voice(&s->cicadas[i], i, rng, sr, s->smoothed_temp, s->click_rate);
                    else
                        cicada_set_params(&s->cicadas[i], rng, sr, s->smoothed_temp, s->click_rate, -99.0f, dist_param);
                } else {
                    s->cicadas[i].active = 0;
                }
            }
            break;
        }
        case INSECT_GRASSHOPPER: {
            int count = getActiveCount(8);
            s->active_count = count;
            for (int i = 0; i < 8; i++) {
                if (i < count) {
                    if (!s->grasshoppers[i].active)
                        grasshopper_init_voice(&s->grasshoppers[i], i, rng, sr,
                                              s->smoothed_temp, s->click_rate);
                    else
                        grasshopper_set_params(&s->grasshoppers[i], rng, sr, s->smoothed_temp, -99.0f, -1.0f);
                } else {
                    s->grasshoppers[i].active = 0;
                }
            }
            break;
        }
        case INSECT_MOLE_CRICKET: {
            int count = getActiveCount(8);
            s->active_count = count;
            for (int i = 0; i < 8; i++) {
                if (i < count) {
                    if (!s->mole_crickets[i].active)
                        mole_cricket_init_voice(&s->mole_crickets[i], i, rng, sr, s->smoothed_temp);
                    else
                        mole_cricket_set_params(&s->mole_crickets[i], rng, sr, s->smoothed_temp, -99.0f, -1.0f);
                } else {
                    s->mole_crickets[i].active = 0;
                }
            }
            break;
        }
        case INSECT_FLY_BEE: {
            int count = getActiveCount(10);
            s->active_count = count;
            for (int i = 0; i < 10; i++) {
                if (i < count) {
                    int is_close = (i < 3) ? 1 : 0;
                    int is_bee = (rng_next(rng) > 0.5f) ? 1 : 0;
                    int motion_flag = (s->motion > 0.5f) ? 1 : 0;
                    if (!s->fly_bees[i].active)
                        fly_bee_init_voice(&s->fly_bees[i], i, rng, sr);
                    fly_bee_set_params(&s->fly_bees[i], rng, sr, is_bee, is_close, motion_flag);
                } else {
                    s->fly_bees[i].active = 0;
                }
            }
            break;
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  INSECTS ENGINE — PUBLIC API
// ═══════════════════════════════════════════════════════════

extern "C" {

int insects_init(float sample_rate) {
    g_insects = new InsectsState();
    memset(g_insects, 0, sizeof(InsectsState));
    g_insects->sample_rate = sample_rate;
    g_insects->initialized = 1;
    g_insects->engine = INSECT_CRICKET;

    g_insects->density = 0.5f;
    g_insects->temperature = 0.5f;
    g_insects->distance = 0.3f;
    g_insects->proximity = 0.5f;
    g_insects->antiphony = 0.3f;
    g_insects->click_rate = 0.3f;
    g_insects->motion = 0.5f;

    // Initialize smoothed params to match targets
    g_insects->smoothed_density = 0.5f;
    g_insects->smoothed_temp = 0.5f;
    g_insects->smoothed_distance = 0.3f;

    g_insects->fade_gain = 0.0f;
    g_insects->fade_target = 0.0f;
    g_insects->fade_inc = 0.0f;
    g_insects->rng.state = 12345;

    // Distance filter init (will be overwritten per-block)
    onepole_set_freq(&g_insects->dist_lpf_l, 8000.0f, sample_rate);
    onepole_set_freq(&g_insects->dist_lpf_r, 8000.0f, sample_rate);

    insects_update_voices(g_insects);
    return 0;
}

void insects_destroy(void) {
    if (g_insects) { delete g_insects; g_insects = nullptr; }
}

float* insects_get_output_ptr(void) {
    return g_insects ? g_insects->output : nullptr;
}

void insects_process_block(int block_size) {
    if (!g_insects || !g_insects->initialized || block_size > 128) return;

    InsectsState* s = g_insects;
    float sr = s->sample_rate;

    // Block-level parameter smoothing (matches JS: += (target-smooth)*0.001)
    s->smoothed_density += (s->density - s->smoothed_density) * 0.001f;
    s->smoothed_temp += (s->temperature - s->smoothed_temp) * 0.001f;
    s->smoothed_distance += (s->distance - s->smoothed_distance) * 0.001f;

    // Distance filter coefficient: raw coefficient like JS (higher = more filtering)
    float dist_coeff = 0.1f + s->smoothed_distance * 0.85f;

    // Temp voice buffers
    float voice_l[128] = {0}, voice_r[128] = {0};

    // Fade
    float fade_step = 0.0f;
    if (s->fade_gain != s->fade_target) {
        fade_step = (s->fade_target > s->fade_gain) ? s->fade_inc : -s->fade_inc;
    }

    // Process active voices
    switch (s->engine) {
        case INSECT_CRICKET:
            for (int v = 0; v < INSECT_MAX_VOICES; v++)
                cricket_process_voice(&s->crickets[v], voice_l, voice_r,
                                    block_size, &s->rng, sr);
            break;
        case INSECT_TREE_CRICKET:
            for (int v = 0; v < 10; v++)
                tree_cricket_process_voice(&s->tree_crickets[v], voice_l, voice_r,
                                          block_size, sr);
            break;
        case INSECT_KATYDID:
            for (int v = 0; v < 10; v++)
                katydid_process_voice(&s->katydids[v], voice_l, voice_r,
                                    block_size, &s->rng, sr);
            break;
        case INSECT_CICADA:
            for (int v = 0; v < 8; v++)
                cicada_process_voice(&s->cicadas[v], voice_l, voice_r,
                                   block_size, &s->rng, sr);
            break;
        case INSECT_GRASSHOPPER:
            for (int v = 0; v < 8; v++)
                grasshopper_process_voice(&s->grasshoppers[v], voice_l, voice_r,
                                         block_size, &s->rng, sr);
            break;
        case INSECT_MOLE_CRICKET:
            for (int v = 0; v < 8; v++)
                mole_cricket_process_voice(&s->mole_crickets[v], voice_l, voice_r,
                                           block_size, &s->rng, sr);
            break;
        case INSECT_FLY_BEE:
            for (int v = 0; v < 10; v++)
                fly_bee_process_voice(&s->fly_bees[v], voice_l, voice_r,
                                     block_size, &s->rng, sr);
            break;
    }

    // Normalize by voice count: sqrt(1/activeCount)
    float norm = 1.0f;
    if (s->active_count > 0) {
        norm = sqrtf(1.0f / (float)s->active_count);
    }

    for (int i = 0; i < block_size; i++) {
        // Update fade (linear for faster response, matching JS)
        if (s->fade_gain < s->fade_target) {
            s->fade_gain = fminf(s->fade_gain + s->fade_inc, s->fade_target);
        } else if (s->fade_gain > s->fade_target) {
            s->fade_gain = fmaxf(s->fade_gain - s->fade_inc, s->fade_target);
        }

        // Skip if faded out
        if (s->fade_gain < 0.0001f) {
            s->output[i * 2]     = 0.0f;
            s->output[i * 2 + 1] = 0.0f;
            continue;
        }

        float l = voice_l[i] * norm;
        float r = voice_r[i] * norm;

        // Distance filtering using raw coefficient (matches JS OnePole)
        l = onepole_process(&s->dist_lpf_l, l);
        r = onepole_process(&s->dist_lpf_r, r);

        // DC blocking
        l = dc_block(&s->dc_l, l);
        r = dc_block(&s->dc_r, r);

        // Final gain ×1.2 (matches JS)
        s->output[i * 2]     = l * s->fade_gain * 1.2f;
        s->output[i * 2 + 1] = r * s->fade_gain * 1.2f;
    }

    // Update distance filter coefficient for next block
    s->dist_lpf_l.coeff = dist_coeff;
    s->dist_lpf_r.coeff = dist_coeff;
}

void insects_set_engine(int engine) {
    if (!g_insects || engine < 0 || engine > 6) return;
    g_insects->engine = engine;
    insects_update_voices(g_insects);
}

void insects_set_params(float density, float temperature, float distance,
                        float proximity, float antiphony, float click_rate,
                        float motion) {
    if (!g_insects) return;
    g_insects->density = density;
    g_insects->temperature = temperature;
    g_insects->distance = distance;
    g_insects->proximity = proximity;
    g_insects->antiphony = antiphony;
    g_insects->click_rate = click_rate;
    g_insects->motion = motion;
    insects_update_voices(g_insects);
}

void insects_start(void) {
    if (!g_insects) return;
    g_insects->fade_target = 1.0f;
    g_insects->fade_inc = 0.0001f;  // ~200ms fade at 48kHz (matches JS)
}

void insects_stop(void) {
    if (!g_insects) return;
    g_insects->fade_target = 0.0f;
    g_insects->fade_inc = 0.0001f;
}

void insects_set_seed(int seed) {
    if (!g_insects) return;
    g_insects->rng.state = (uint32_t)seed;
    insects_update_voices(g_insects);
}

int insects_get_active_voices(void) {
    return g_insects ? g_insects->active_count : 0;
}

int insects_get_engine_type(void) {
    return g_insects ? g_insects->engine : 0;
}

// ═══════════════════════════════════════════════════════════
//  INSECTS ENGINE 2 — Second independent layer for dual layering
//  Reuses all voice types and processing functions from engine 1.
//  Separate state, voice pools, params, output buffer, and RNG.
// ═══════════════════════════════════════════════════════════

static InsectsState* g_insects2 = nullptr;

int insects2_init(float sample_rate) {
    g_insects2 = new InsectsState();
    memset(g_insects2, 0, sizeof(InsectsState));
    g_insects2->sample_rate = sample_rate;
    g_insects2->initialized = 1;
    g_insects2->engine = INSECT_TREE_CRICKET; // Default to different engine than layer 1

    g_insects2->density = 0.5f;
    g_insects2->temperature = 0.5f;
    g_insects2->distance = 0.3f;
    g_insects2->proximity = 0.5f;
    g_insects2->antiphony = 0.3f;
    g_insects2->click_rate = 0.3f;
    g_insects2->motion = 0.5f;

    g_insects2->smoothed_density = 0.5f;
    g_insects2->smoothed_temp = 0.5f;
    g_insects2->smoothed_distance = 0.3f;

    g_insects2->fade_gain = 0.0f;
    g_insects2->fade_target = 0.0f;
    g_insects2->fade_inc = 0.0f;
    g_insects2->rng.state = 67890; // Different seed from layer 1

    onepole_set_freq(&g_insects2->dist_lpf_l, 8000.0f, sample_rate);
    onepole_set_freq(&g_insects2->dist_lpf_r, 8000.0f, sample_rate);

    insects_update_voices(g_insects2);
    return 0;
}

void insects2_destroy(void) {
    if (g_insects2) { delete g_insects2; g_insects2 = nullptr; }
}

float* insects2_get_output_ptr(void) {
    return g_insects2 ? g_insects2->output : nullptr;
}

void insects2_process_block(int block_size) {
    if (!g_insects2 || !g_insects2->initialized || block_size > 128) return;

    InsectsState* s = g_insects2;
    float sr = s->sample_rate;

    // Block-level parameter smoothing
    s->smoothed_density += (s->density - s->smoothed_density) * 0.001f;
    s->smoothed_temp += (s->temperature - s->smoothed_temp) * 0.001f;
    s->smoothed_distance += (s->distance - s->smoothed_distance) * 0.001f;

    float dist_coeff = 0.1f + s->smoothed_distance * 0.85f;

    float voice_l[128] = {0}, voice_r[128] = {0};

    float fade_step = 0.0f;
    if (s->fade_gain != s->fade_target) {
        fade_step = (s->fade_target > s->fade_gain) ? s->fade_inc : -s->fade_inc;
    }

    // Process active voices (same switch as engine 1)
    switch (s->engine) {
        case INSECT_CRICKET:
            for (int v = 0; v < INSECT_MAX_VOICES; v++)
                cricket_process_voice(&s->crickets[v], voice_l, voice_r,
                                    block_size, &s->rng, sr);
            break;
        case INSECT_TREE_CRICKET:
            for (int v = 0; v < 10; v++)
                tree_cricket_process_voice(&s->tree_crickets[v], voice_l, voice_r,
                                          block_size, sr);
            break;
        case INSECT_KATYDID:
            for (int v = 0; v < 10; v++)
                katydid_process_voice(&s->katydids[v], voice_l, voice_r,
                                    block_size, &s->rng, sr);
            break;
        case INSECT_CICADA:
            for (int v = 0; v < 8; v++)
                cicada_process_voice(&s->cicadas[v], voice_l, voice_r,
                                   block_size, &s->rng, sr);
            break;
        case INSECT_GRASSHOPPER:
            for (int v = 0; v < 8; v++)
                grasshopper_process_voice(&s->grasshoppers[v], voice_l, voice_r,
                                         block_size, &s->rng, sr);
            break;
        case INSECT_MOLE_CRICKET:
            for (int v = 0; v < 8; v++)
                mole_cricket_process_voice(&s->mole_crickets[v], voice_l, voice_r,
                                           block_size, &s->rng, sr);
            break;
        case INSECT_FLY_BEE:
            for (int v = 0; v < 10; v++)
                fly_bee_process_voice(&s->fly_bees[v], voice_l, voice_r,
                                     block_size, &s->rng, sr);
            break;
    }

    float norm = 1.0f;
    if (s->active_count > 0) {
        norm = sqrtf(1.0f / (float)s->active_count);
    }

    for (int i = 0; i < block_size; i++) {
        if (s->fade_gain < s->fade_target) {
            s->fade_gain = fminf(s->fade_gain + s->fade_inc, s->fade_target);
        } else if (s->fade_gain > s->fade_target) {
            s->fade_gain = fmaxf(s->fade_gain - s->fade_inc, s->fade_target);
        }

        if (s->fade_gain < 0.0001f) {
            s->output[i * 2]     = 0.0f;
            s->output[i * 2 + 1] = 0.0f;
            continue;
        }

        float l = voice_l[i] * norm;
        float r = voice_r[i] * norm;

        l = onepole_process(&s->dist_lpf_l, l);
        r = onepole_process(&s->dist_lpf_r, r);

        l = dc_block(&s->dc_l, l);
        r = dc_block(&s->dc_r, r);

        s->output[i * 2]     = l * s->fade_gain * 1.2f;
        s->output[i * 2 + 1] = r * s->fade_gain * 1.2f;
    }

    s->dist_lpf_l.coeff = dist_coeff;
    s->dist_lpf_r.coeff = dist_coeff;
}

void insects2_set_engine(int engine) {
    if (!g_insects2 || engine < 0 || engine > 6) return;
    g_insects2->engine = engine;
    insects_update_voices(g_insects2);
}

void insects2_set_params(float density, float temperature, float distance,
                         float proximity, float antiphony, float click_rate,
                         float motion) {
    if (!g_insects2) return;
    g_insects2->density = density;
    g_insects2->temperature = temperature;
    g_insects2->distance = distance;
    g_insects2->proximity = proximity;
    g_insects2->antiphony = antiphony;
    g_insects2->click_rate = click_rate;
    g_insects2->motion = motion;
    insects_update_voices(g_insects2);
}

void insects2_start(void) {
    if (!g_insects2) return;
    g_insects2->fade_target = 1.0f;
    g_insects2->fade_inc = 0.0001f;
}

void insects2_stop(void) {
    if (!g_insects2) return;
    g_insects2->fade_target = 0.0f;
    g_insects2->fade_inc = 0.0001f;
}

void insects2_set_seed(int seed) {
    if (!g_insects2) return;
    g_insects2->rng.state = (uint32_t)seed;
    insects_update_voices(g_insects2);
}

int insects2_get_active_voices(void) {
    return g_insects2 ? g_insects2->active_count : 0;
}

int insects2_get_engine_type(void) {
    return g_insects2 ? g_insects2->engine : 0;
}

} // extern "C" (insects API)

// ═══════════════════════════════════════════════════════════
//  OCEAN WAVES ENGINE
//  Port of ocean.worklet.js / ocean.worklet.ts
//  Two independent wave generators with filtered noise,
//  foam layer, deep rumble, and master filtering.
// ═══════════════════════════════════════════════════════════

// ── Wave Event (single wave instance) ──
struct OceanWaveEvent {
    bool    active;
    float   phase;       // 0-1 progress through wave
    float   duration;    // duration in samples (float for phase increment)
    float   amplitude;   // random amplitude variation
    float   pan_offset;  // stereo position (-1 to 1)
    float   foam;        // this wave's foam amount
    float   depth;       // this wave's depth amount
};

// ── Wave Generator (one of two) ──
struct OceanGenerator {
    int             time_since_last_wave;
    int             next_wave_interval;
    OceanWaveEvent  current_wave;
    float           lpf_state_l;
    float           lpf_state_r;
};

// ── Ocean State ──
struct OceanState {
    float sample_rate;
    int   initialized;

    // Parameters (all match JS AudioParam descriptors)
    float intensity;         // 0-1, default 0.5
    float wave_duration_min; // 2-15, default 4
    float wave_duration_max; // 2-15, default 10
    float wave_interval_min; // 3-20, default 5
    float wave_interval_max; // 3-20, default 12
    float wave2_offset_min;  // 0-10, default 2
    float wave2_offset_max;  // 0-10, default 6
    float foam_min;          // 0-1, default 0.2
    float foam_max;          // 0-1, default 0.5
    float depth_min;         // 0-1, default 0.3
    float depth_max;         // 0-1, default 0.7

    // Two wave generators
    OceanGenerator gen1;
    OceanGenerator gen2;

    // Master filter states
    float master_lpf_l, master_lpf_r;
    float master_hpf_l, master_hpf_r;

    // Foam layer filter
    float foam_lpf_l, foam_lpf_r;

    // Deep rumble layer
    float rumble_lpf_l, rumble_lpf_r;

    // Fade
    float fade_gain;
    float fade_target;
    float fade_inc;

    // PRNG
    Rng   rng;

    // Output buffer (interleaved stereo, max 128 × 2 = 256 floats)
    float output[256];
};

static OceanState* g_ocean = nullptr;

// ── Create a wave generator (matches JS createGenerator) ──
static void ocean_create_generator(OceanGenerator* gen, float phase_offset,
                                   float sample_rate, Rng* rng) {
    gen->time_since_last_wave = (int)(sample_rate * 8.0f * phase_offset);
    gen->next_wave_interval = (int)(sample_rate * (5.0f + rng_next(rng) * 5.0f));
    gen->current_wave.active = false;
    gen->current_wave.phase = 0.0f;
    gen->current_wave.duration = sample_rate * 6.0f;
    gen->current_wave.amplitude = 0.7f + rng_next(rng) * 0.3f;
    gen->current_wave.pan_offset = (rng_next(rng) - 0.5f) * 0.6f;
    gen->current_wave.foam = 0.3f;
    gen->current_wave.depth = 0.5f;
    gen->lpf_state_l = 0.0f;
    gen->lpf_state_r = 0.0f;
}

// ── Start a new wave (matches JS startNewWave) ──
static void ocean_start_new_wave(OceanGenerator* gen, Rng* rng, float sample_rate,
                                 float dur_min, float dur_max,
                                 float foam_min, float foam_max,
                                 float depth_min, float depth_max) {
    OceanWaveEvent* w = &gen->current_wave;
    w->active = true;
    w->phase = 0.0f;
    w->duration = floorf(sample_rate * rng_range(rng, dur_min, dur_max));
    w->amplitude = 0.6f + rng_next(rng) * 0.4f;
    w->pan_offset = (rng_next(rng) - 0.5f) * 0.8f;
    w->foam = rng_range(rng, foam_min, foam_max);
    w->depth = rng_range(rng, depth_min, depth_max);
    gen->time_since_last_wave = 0;
}

// ── Wave envelope: gentle rise, peak, long tail ──
// Matches JS waveEnvelope() exactly
static inline float ocean_wave_envelope(float phase) {
    if (phase < 0.25f) {
        // Rising - quadratic
        float t = phase / 0.25f;
        return t * t;
    } else if (phase < 0.35f) {
        // Peak plateau
        return 1.0f;
    } else {
        // Long decay: (1-t)^1.5 = (1-t)*sqrt(1-t)
        float t = (phase - 0.35f) / 0.65f;
        float omt = 1.0f - t;
        return fast_pow_1_5(omt);
    }
}

// ── Foam envelope: peaks during wave crest ──
// Matches JS foamEnvelope() exactly
static inline float ocean_foam_envelope(float phase) {
    if (phase < 0.2f || phase > 0.6f) return 0.0f;
    float t = (phase - 0.2f) / 0.4f;
    // sin(t * PI) — use standard sinf for accuracy here
    return sinf(t * PI_F);
}

// ═══════════════════════════════════════════════════════════
//  OCEAN ENGINE — PUBLIC API
// ═══════════════════════════════════════════════════════════

extern "C" {

int ocean_init(float sample_rate) {
    g_ocean = new OceanState();
    memset(g_ocean, 0, sizeof(OceanState));
    g_ocean->sample_rate = sample_rate;
    g_ocean->initialized = 1;

    // Defaults (match JS parameterDescriptors)
    g_ocean->intensity = 0.5f;
    g_ocean->wave_duration_min = 4.0f;
    g_ocean->wave_duration_max = 10.0f;
    g_ocean->wave_interval_min = 5.0f;
    g_ocean->wave_interval_max = 12.0f;
    g_ocean->wave2_offset_min = 2.0f;
    g_ocean->wave2_offset_max = 6.0f;
    g_ocean->foam_min = 0.2f;
    g_ocean->foam_max = 0.5f;
    g_ocean->depth_min = 0.3f;
    g_ocean->depth_max = 0.7f;

    // Fade
    g_ocean->fade_gain = 0.0f;
    g_ocean->fade_target = 0.0f;
    g_ocean->fade_inc = 0.0f;

    // PRNG seed (matches JS: mulberry32(12345))
    g_ocean->rng.state = 12345;

    // Create generators (matches JS: createGenerator(0), createGenerator(0.5))
    ocean_create_generator(&g_ocean->gen1, 0.0f, sample_rate, &g_ocean->rng);
    ocean_create_generator(&g_ocean->gen2, 0.5f, sample_rate, &g_ocean->rng);

    // All filter states already zeroed by memset
    return 0;
}

void ocean_destroy(void) {
    if (g_ocean) { delete g_ocean; g_ocean = nullptr; }
}

float* ocean_get_output_ptr(void) {
    return g_ocean ? g_ocean->output : nullptr;
}

void ocean_set_params(float intensity,
                      float wave_duration_min, float wave_duration_max,
                      float wave_interval_min, float wave_interval_max,
                      float wave2_offset_min, float wave2_offset_max,
                      float foam_min, float foam_max,
                      float depth_min, float depth_max) {
    if (!g_ocean) return;
    g_ocean->intensity = intensity;
    g_ocean->wave_duration_min = wave_duration_min;
    g_ocean->wave_duration_max = wave_duration_max;
    g_ocean->wave_interval_min = wave_interval_min;
    g_ocean->wave_interval_max = wave_interval_max;
    g_ocean->wave2_offset_min = wave2_offset_min;
    g_ocean->wave2_offset_max = wave2_offset_max;
    g_ocean->foam_min = foam_min;
    g_ocean->foam_max = foam_max;
    g_ocean->depth_min = depth_min;
    g_ocean->depth_max = depth_max;
}

void ocean_process_block(int block_size) {
    if (!g_ocean || !g_ocean->initialized || block_size > 128) return;

    OceanState* s = g_ocean;
    Rng* rng = &s->rng;
    float sr = s->sample_rate;

    // Read params
    float intensity = s->intensity;
    float dur_min = s->wave_duration_min;
    float dur_max = s->wave_duration_max;
    float int_min = s->wave_interval_min;
    float int_max = s->wave_interval_max;
    float off_min = s->wave2_offset_min;
    float off_max = s->wave2_offset_max;
    float f_min = s->foam_min;
    float f_max = s->foam_max;
    float d_min = s->depth_min;
    float d_max = s->depth_max;

    // Fade
    float fade = s->fade_gain;
    float fade_target = s->fade_target;
    float fade_inc = s->fade_inc;

    for (int i = 0; i < block_size; i++) {
        // Advance fade
        if (fade < fade_target) {
            fade += fade_inc;
            if (fade > fade_target) fade = fade_target;
        } else if (fade > fade_target) {
            fade -= fade_inc;
            if (fade < fade_target) fade = fade_target;
        }

        float sampleL = 0.0f;
        float sampleR = 0.0f;
        float foamL = 0.0f;
        float foamR = 0.0f;
        float depth_amount = 0.0f;

        // ── Process generator 1 ──
        s->gen1.time_since_last_wave++;
        if (!s->gen1.current_wave.active &&
            s->gen1.time_since_last_wave >= s->gen1.next_wave_interval) {
            ocean_start_new_wave(&s->gen1, rng, sr, dur_min, dur_max,
                                 f_min, f_max, d_min, d_max);
            s->gen1.next_wave_interval =
                (int)(sr * rng_range(rng, int_min, int_max));
        }

        if (s->gen1.current_wave.active) {
            OceanWaveEvent* wave = &s->gen1.current_wave;
            wave->phase += 1.0f / wave->duration;

            if (wave->phase >= 1.0f) {
                wave->active = false;
            } else {
                float env = ocean_wave_envelope(wave->phase) * wave->amplitude;
                float foam_env = ocean_foam_envelope(wave->phase) * wave->amplitude;

                // Filtered noise for wave body (LPF coeff 0.03 for gen1)
                float noise = (rng_next(rng) - 0.5f) * 2.0f;
                s->gen1.lpf_state_l += (noise - s->gen1.lpf_state_l) * 0.03f;
                float noise_r = (rng_next(rng) - 0.5f) * 2.0f;
                s->gen1.lpf_state_r += (noise_r - s->gen1.lpf_state_r) * 0.03f;

                // Panning
                float panL = 0.5f + wave->pan_offset * 0.5f;
                float panR = 0.5f - wave->pan_offset * 0.5f;

                sampleL += s->gen1.lpf_state_l * env * panL;
                sampleR += s->gen1.lpf_state_r * env * panR;

                // Foam (higher frequency noise during crest, gen1 scale = 0.5)
                float foam_noise = (rng_next(rng) - 0.5f) * 2.0f;
                foamL += foam_noise * foam_env * panL * 0.5f * wave->foam;
                foamR += foam_noise * foam_env * panR * 0.5f * wave->foam;

                // Depth contribution
                depth_amount += env * wave->depth;
            }
        }

        // ── Process generator 2 ──
        s->gen2.time_since_last_wave++;
        if (!s->gen2.current_wave.active &&
            s->gen2.time_since_last_wave >= s->gen2.next_wave_interval) {
            ocean_start_new_wave(&s->gen2, rng, sr, dur_min, dur_max,
                                 f_min, f_max, d_min, d_max);
            // Gen2 has additional wave2 offset (matches JS)
            float wave2_offset = rng_range(rng, off_min, off_max);
            s->gen2.next_wave_interval =
                (int)(sr * (rng_range(rng, int_min, int_max) + wave2_offset));
        }

        if (s->gen2.current_wave.active) {
            OceanWaveEvent* wave = &s->gen2.current_wave;
            wave->phase += 1.0f / wave->duration;

            if (wave->phase >= 1.0f) {
                wave->active = false;
            } else {
                // Gen2: amplitude * 0.7 (slightly quieter)
                float env = ocean_wave_envelope(wave->phase) * wave->amplitude * 0.7f;
                float foam_env = ocean_foam_envelope(wave->phase) * wave->amplitude * 0.7f;

                // Filtered noise (LPF coeff 0.04 for gen2 — slightly different character)
                float noise = (rng_next(rng) - 0.5f) * 2.0f;
                s->gen2.lpf_state_l += (noise - s->gen2.lpf_state_l) * 0.04f;
                float noise_r = (rng_next(rng) - 0.5f) * 2.0f;
                s->gen2.lpf_state_r += (noise_r - s->gen2.lpf_state_r) * 0.04f;

                // Opposite pan tendency (matches JS)
                float panL = 0.5f - wave->pan_offset * 0.5f;
                float panR = 0.5f + wave->pan_offset * 0.5f;

                sampleL += s->gen2.lpf_state_l * env * panL;
                sampleR += s->gen2.lpf_state_r * env * panR;

                // Foam (gen2 scale = 0.4, vs gen1's 0.5)
                float foam_noise = (rng_next(rng) - 0.5f) * 2.0f;
                foamL += foam_noise * foam_env * panL * 0.4f * wave->foam;
                foamR += foam_noise * foam_env * panR * 0.4f * wave->foam;

                depth_amount += env * wave->depth;
            }
        }

        // ── Deep rumble layer (constant low frequency, modulated by depth) ──
        float rumble_noise = (rng_next(rng) - 0.5f) * 2.0f;
        s->rumble_lpf_l += (rumble_noise - s->rumble_lpf_l) * 0.005f;
        s->rumble_lpf_r += ((rng_next(rng) - 0.5f) * 2.0f - s->rumble_lpf_r) * 0.005f;

        // ── Foam high-pass filter (remove low frequencies from foam) ──
        s->foam_lpf_l += (foamL - s->foam_lpf_l) * 0.3f;
        s->foam_lpf_r += (foamR - s->foam_lpf_r) * 0.3f;

        // ── Combine layers — depth modulates rumble ──
        float avg_depth = (d_min + d_max) * 0.5f;
        float combinedL = sampleL
            + s->rumble_lpf_l * (depth_amount + avg_depth * 0.2f) * 0.4f
            + s->foam_lpf_l;
        float combinedR = sampleR
            + s->rumble_lpf_r * (depth_amount + avg_depth * 0.2f) * 0.4f
            + s->foam_lpf_r;

        // ── Master smoothing LPF (coeff 0.35) ──
        s->master_lpf_l += (combinedL - s->master_lpf_l) * 0.35f;
        s->master_lpf_r += (combinedR - s->master_lpf_r) * 0.35f;

        // ── DC blocking HPF (coeff 0.0005) ──
        s->master_hpf_l += (s->master_lpf_l - s->master_hpf_l) * 0.0005f;
        s->master_hpf_r += (s->master_lpf_r - s->master_hpf_r) * 0.0005f;

        // ── Final output with soft clipping ──
        float finalL = (s->master_lpf_l - s->master_hpf_l) * intensity * 0.6f;
        float finalR = (s->master_lpf_r - s->master_hpf_r) * intensity * 0.6f;

        // Apply fade and soft clip (fast_tanh matches JS fastTanh / Math.tanh)
        s->output[i * 2]     = fast_tanh(finalL) * fade;
        s->output[i * 2 + 1] = fast_tanh(finalR) * fade;
    }

    s->fade_gain = fade;
}

void ocean_start(void) {
    if (!g_ocean) return;
    g_ocean->fade_target = 1.0f;
    g_ocean->fade_inc = 0.0001f;  // ~200ms fade at 48kHz
}

void ocean_stop(void) {
    if (!g_ocean) return;
    g_ocean->fade_target = 0.0f;
    g_ocean->fade_inc = 0.0001f;
}

void ocean_set_seed(int seed) {
    if (!g_ocean) return;
    g_ocean->rng.state = (uint32_t)seed;
    ocean_create_generator(&g_ocean->gen1, 0.0f, g_ocean->sample_rate, &g_ocean->rng);
    ocean_create_generator(&g_ocean->gen2, 0.5f, g_ocean->sample_rate, &g_ocean->rng);
}

} // extern "C" (ocean API)
