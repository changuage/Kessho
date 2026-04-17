/**
 * Kessho Granular-FX Granular Engine — Full C++ Implementation
 *
 * Faithful port of granular-fx.worklet.ts (~1,400 lines TypeScript → ~1,100 lines C++).
 * Every DSP function, LUT, filter, and grain processing path is reproduced exactly.
 *
 * Build targets:
 *   Web:  emcc → .wasm (loaded in AudioWorklet via thin JS shell)
 *   iOS:  clang → static lib (used in AURenderBlock)
 */

#include "kessho_granular.h"
#include <cmath>
#include <cstring>
#include <cstdlib>

#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ═══════════════ Internal Structures ═══════════════

struct Grain {
    float position;      // read position in buffer (fractional samples)
    float playback_rate; // pitch shift rate (negative = reverse)
    float pan;           // -1 to 1
    float pan_l;         // cached constant-power gain at grain spawn
    float pan_r;         // cached constant-power gain at grain spawn
    int   start_sample;  // samples elapsed since grain start
    int   length;        // grain length in samples
    int   attack_smp;    // rise time in samples
    int   decay_smp;     // fall time in samples
    int   active;        // 0 or 1
    int   active_list_pos; // slot inside per-voice active grain index list
    float env_z1;        // one-pole envelope smoother state
};

struct BiquadFilter {
    float b0, b1, b2, a1, a2;
    float x1, x2, y1, y2;
    float current_rate;
};

struct OnePoleHPF {
    float x1, y1;
};

struct OnePoleLPF {
    float z1;
};

struct AllpassDiffuser {
    // 4-stage allpass chain — L channel
    float* delays_l[KESSHO_ALLPASS_STAGES];
    int    delay_sizes_l[KESSHO_ALLPASS_STAGES];
    int    write_pos_l[KESSHO_ALLPASS_STAGES];
    // 4-stage allpass chain — R channel (decorrelated)
    float* delays_r[KESSHO_ALLPASS_STAGES];
    int    delay_sizes_r[KESSHO_ALLPASS_STAGES];
    int    write_pos_r[KESSHO_ALLPASS_STAGES];
    float  g; // allpass coefficient (blur * 0.7)
};

struct TriLFO {
    float phase;
    float rate; // Hz
    int   use_sine;
};

struct ScanState {
    float head_a;
    float head_b;
    float fade;      // 0 = 100% head A, 1 = 100% head B
    int   fading;
    float fade_dir;  // +1 or -1
    int   initialized;
};

struct VoiceParams {
    int   enabled;
    int   mode;          // KESSHO_MODE_*
    int   slice;         // 0–15
    float speed;         // 0 = LFO scan, 1 = normal
    float scan_rate;     // playback-rate multiplier for clean scan mode
    int   reverse;
    float pitch;         // semitones
    float attack;        // seconds
    float decay;         // seconds
    float blur;          // 0–1
    float grain_oct;     // 0–1 probability of +12st
    float spray;         // 0–1
    float density;       // grains/sec
    float grain_size;    // ms
    float pan;           // -1 to +1
    float gain;          // 0–1
    float pos_lfo_rate;  // 0–1
    float pos_lfo_depth; // 0–1
    float pan_lfo_rate;  // 0–1
    float stereo_spread; // 0–1
    float reverse_lfo_rate;  // 0–1
    float write_follow;      // 0–1
    float record_lfo_rate;   // 0–1
    int   euclid_gated;
    int   euclid_muted;  // silenced by Euclid mute/solo (still counted for gain comp)
};

struct LegacyParams {
    float jitter;       // ms
    float probability;  // 0–1
    int   pitch_mode;   // KESSHO_PITCH_*
    float pitch_spread; // semitones
    float feedback;     // 0–0.35
};

struct GranularState {
    // Audio buffer
    float* buffer_l;
    float* buffer_r;
    int    buffer_size;  // samples
    int    write_pos;
    int    freeze;
    int    freeze_with_feedback;
    int    enabled;
    float  dry_wet;
    float  feedback;
    float  feedback_lpf_coeff;
    float  sample_rate;
    int    grain_shape;
    float  bus_diffusion;
    float  timing_randomness;

    // Per-voice
    VoiceParams voice[KESSHO_NUM_VOICES];
    Grain       grain_pool[KESSHO_NUM_VOICES][KESSHO_MAX_GRAINS];
    int         active_grain_indices[KESSHO_NUM_VOICES][KESSHO_MAX_GRAINS];
    int         active_grain_counts[KESSHO_NUM_VOICES];
    AllpassDiffuser diffuser[KESSHO_NUM_VOICES];
    TriLFO      pos_lfo[KESSHO_NUM_VOICES];
    TriLFO      pan_lfo[KESSHO_NUM_VOICES];
    TriLFO      reverse_lfo[KESSHO_NUM_VOICES];
    TriLFO      record_lfo[KESSHO_NUM_VOICES];
    BiquadFilter anti_alias_l[KESSHO_NUM_VOICES];
    BiquadFilter anti_alias_r[KESSHO_NUM_VOICES];
    ScanState   scan[KESSHO_NUM_VOICES];

    // Per-voice scheduling
    int   samples_since_grain[KESSHO_NUM_VOICES];
    int   samples_per_grain[KESSHO_NUM_VOICES];
    int   samples_until_grain[KESSHO_NUM_VOICES];
    float trig_density_mult[KESSHO_NUM_VOICES];

    // Per-voice clean mode read position
    float clean_read_pos[KESSHO_NUM_VOICES];

    // Per-voice LFO scan target position (for smooth UI visualization)
    float scan_lfo_target[KESSHO_NUM_VOICES];

    // Per-voice Euclidean trigger envelope
    int   trig_env_phase[KESSHO_NUM_VOICES];    // -1 = no active envelope
    float trig_env_velocity[KESSHO_NUM_VOICES];
    float trig_env_atk_cache[KESSHO_NUM_VOICES]; // samples
    float trig_env_dec_cache[KESSHO_NUM_VOICES]; // samples

    // Per-voice representative grain position
    float last_grain_pos[KESSHO_NUM_VOICES];

    // Per-voice grain smoothing state (used to soften transient peaking in granular mode)
    float grain_smooth_l[KESSHO_NUM_VOICES];
    float grain_smooth_r[KESSHO_NUM_VOICES];

    // Summed granular bus smoothing/diffusion
    AllpassDiffuser bus_diffuser;
    float bus_smooth_l;
    float bus_smooth_r;

    // Per-voice Euclidean sub-lane overrides
    int   euclid_slice_override[KESSHO_NUM_VOICES];   // -1 = none
    float euclid_pitch_override[KESSHO_NUM_VOICES];
    int   euclid_pitch_active[KESSHO_NUM_VOICES];
    int   euclid_reverse_override[KESSHO_NUM_VOICES];
    int   euclid_reverse_active[KESSHO_NUM_VOICES];

    // Global grain counter
    int total_active_grains;

    // Silence detection
    int silent_samples;

    // Feedback filters
    OnePoleHPF fb_hpf_l, fb_hpf_r;
    OnePoleLPF fb_lpf_l, fb_lpf_r;
    float      fb_rms;

    // Legacy params
    LegacyParams legacy;

    // Scale quantization
    int   scale_intervals[KESSHO_MAX_SCALE_INTERVALS];
    int   scale_count;

    // Chord bias
    int   chord_pitches[KESSHO_MAX_CHORD_PITCHES];
    int   chord_count;
    float chord_bias; // 0=pure scale, 1=chord tones only

    // Random sequence
    float* random_seq;
    int    random_len;
    int    random_idx;
    unsigned int rng_seed; // fallback LCG seed (moved from static local)
    int    initialized;

    // I/O buffers (interleaved stereo)
    float input_buf[KESSHO_MAX_BLOCK_SIZE * 2];
    float output_buf[KESSHO_MAX_BLOCK_SIZE * 2];

    // Temp voice accumulation buffers
    float voice_out_l[KESSHO_MAX_BLOCK_SIZE];
    float voice_out_r[KESSHO_MAX_BLOCK_SIZE];

    // LUTs
    float hann_table[KESSHO_HANN_TABLE_SIZE];
    float pan_table_l[KESSHO_PAN_TABLE_SIZE];
    float pan_table_r[KESSHO_PAN_TABLE_SIZE];
    float xfade_table_a[KESSHO_XFADE_TABLE_SIZE + 1];
    float xfade_table_b[KESSHO_XFADE_TABLE_SIZE + 1];
    float gain_comp_table[KESSHO_MAX_GRAINS + 1]; // 1/sqrt(n)

    // Windowed sinc interpolation LUT
    float sinc_table[KESSHO_SINC_TABLE_SIZE];

    // Cascaded anti-alias filters (3-stage = 36 dB/oct)
    BiquadFilter anti_alias2_l[KESSHO_NUM_VOICES];
    BiquadFilter anti_alias2_r[KESSHO_NUM_VOICES];
    BiquadFilter anti_alias3_l[KESSHO_NUM_VOICES];
    BiquadFilter anti_alias3_r[KESSHO_NUM_VOICES];

    // Per-voice DC blocking filters
    OnePoleHPF dc_block_l[KESSHO_NUM_VOICES];
    OnePoleHPF dc_block_r[KESSHO_NUM_VOICES];

    // Unfreeze crossfade
    int prev_freeze;
    int unfreeze_fade;  // countdown from KESSHO_UNFREEZE_XFADE_SAMPLES to 0

};

// Global singleton
static GranularState* g_state = nullptr;

// ═══════════════ Harmonic Intervals (legacy mode) ═══════════════

static const int HARMONIC_INTERVALS[] = {
    0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24
};
static const int NUM_HARMONIC_INTERVALS = 11;

// ═══════════════ Allpass Delay Sizes ═══════════════

// L channel: ~1.5ms, 2.3ms, 3.7ms, 5.1ms @ 48kHz
static const int BASE_DELAY_L[KESSHO_ALLPASS_STAGES] = { 72, 110, 178, 245 };
// R channel (decorrelated): ~1.7ms, 2.6ms, 4.0ms, 5.6ms @ 48kHz
static const int BASE_DELAY_R[KESSHO_ALLPASS_STAGES] = { 83, 127, 193, 269 };

// ═══════════════ Math Helpers ═══════════════

static inline float fast_tanh(float x) {
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

#ifdef __wasm_simd128__
// ═══════════════ SIMD Helpers ═══════════════

// Branchless vectorized tanh: x*(27+x²)/(27+9x²) clamped to [-1,1]
static inline v128_t fast_tanh_v4(v128_t x) {
    const v128_t pos3  = wasm_f32x4_splat(3.0f);
    const v128_t neg3  = wasm_f32x4_splat(-3.0f);
    const v128_t one   = wasm_f32x4_splat(1.0f);
    const v128_t neg1  = wasm_f32x4_splat(-1.0f);
    const v128_t c27   = wasm_f32x4_splat(27.0f);
    const v128_t c9    = wasm_f32x4_splat(9.0f);

    v128_t x2 = wasm_f32x4_mul(x, x);
    v128_t num = wasm_f32x4_mul(x, wasm_f32x4_add(c27, x2));
    v128_t den = wasm_f32x4_add(c27, wasm_f32x4_mul(c9, x2));
    v128_t result = wasm_f32x4_div(num, den);

    // Branchless clamp: min(max(result, -1), 1)
    result = wasm_f32x4_max(result, neg1);
    result = wasm_f32x4_min(result, one);
    return result;
}

// Vectorized fast_tanh for 2 values (L/R), returns in lanes 0,1
static inline void fast_tanh_lr(float* l, float* r) {
    v128_t v = wasm_f32x4_make(*l, *r, 0.0f, 0.0f);
    v = fast_tanh_v4(v);
    *l = wasm_f32x4_extract_lane(v, 0);
    *r = wasm_f32x4_extract_lane(v, 1);
}
#endif // __wasm_simd128__

static inline float clampf(float x, float lo, float hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

static inline int clampi(int x, int lo, int hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

// Bitwise NaN/Inf/denormal sanitizer — works even with -ffast-math
static inline float sanitize(float x) {
    union { float f; uint32_t u; } v;
    v.f = x;
    uint32_t exp = v.u & 0x7F800000u;
    if (exp == 0x7F800000u) return 0.0f;  // NaN or Inf
    if (exp == 0u) return 0.0f;            // denormal → flush to zero
    return x;
}

// ═══════════════ LFO ═══════════════

static void lfo_init(TriLFO* lfo) {
    lfo->phase = 0.0f;
    lfo->rate = 0.0f;
    lfo->use_sine = 0;
}

static void lfo_set_rate(TriLFO* lfo, float normalized) {
    lfo->rate = normalized > 0.01f ? normalized * 0.15f : 0.0f;
}

static float lfo_tick(TriLFO* lfo, float sr) {
    if (lfo->rate <= 0.0f) return 0.0f;
    lfo->phase += lfo->rate / sr;
    if (lfo->phase > 1.0f) lfo->phase -= 1.0f;

    if (lfo->use_sine) {
        float p = lfo->phase;
        if (p <= 0.5f) {
            return 4.0f * p * (1.0f - 2.0f * p) + 0.5f;
        }
        return -4.0f * (p - 0.5f) * (1.0f - 2.0f * (p - 0.5f)) + 0.5f;
    }
    return 1.0f - fabsf(2.0f * lfo->phase - 1.0f);
}

// ═══════════════ Biquad Anti-alias Filter ═══════════════

static void biquad_reset(BiquadFilter* f) {
    f->b0 = 1.0f; f->b1 = 0.0f; f->b2 = 0.0f;
    f->a1 = 0.0f; f->a2 = 0.0f;
    f->x1 = 0.0f; f->x2 = 0.0f;
    f->y1 = 0.0f; f->y2 = 0.0f;
    f->current_rate = 1.0f;
}

static void biquad_update(BiquadFilter* f, float abs_rate) {
    if (abs_rate <= 1.05f) { f->current_rate = 1.0f; return; }
    if (fabsf(abs_rate - f->current_rate) < 0.02f) return;
    f->current_rate = abs_rate;
    float fc = 0.425f / abs_rate;
    if (fc > 0.45f) fc = 0.45f;
    float w0 = 2.0f * (float)M_PI * fc;
    float cos_w0 = cosf(w0);
    float sin_w0 = sinf(w0);
    float alpha = sin_w0 / (2.0f * 0.707f);
    float a0 = 1.0f + alpha;
    f->b0 = ((1.0f - cos_w0) * 0.5f) / a0;
    f->b1 = (1.0f - cos_w0) / a0;
    f->b2 = f->b0;
    f->a1 = (-2.0f * cos_w0) / a0;
    f->a2 = (1.0f - alpha) / a0;
}

static inline float biquad_process(BiquadFilter* f, float x) {
    if (f->current_rate <= 1.0f) return x;
    float y = f->b0 * x + f->b1 * f->x1 + f->b2 * f->x2
              - f->a1 * f->y1 - f->a2 * f->y2;
    f->x2 = f->x1; f->x1 = x;
    y = sanitize(y);
    f->y2 = f->y1; f->y1 = y;
    return y;
}

// ═══════════════ One-pole Filters ═══════════════

static inline float hpf_process(OnePoleHPF* f, float input) {
    float y = input - f->x1 + 0.996f * f->y1;
    f->x1 = input;
    f->y1 = sanitize(y);
    return f->y1;
}

static inline float lpf_process(OnePoleLPF* f, float input, float coeff) {
    f->z1 = input * (1.0f - coeff) + f->z1 * coeff;
    f->z1 = sanitize(f->z1);
    return f->z1;
}

// ═══════════════ Allpass Diffuser ═══════════════

static void diffuser_init(AllpassDiffuser* d, float sr) {
    float scale = sr / 48000.0f;
    d->g = 0.0f;
    for (int i = 0; i < KESSHO_ALLPASS_STAGES; i++) {
        d->delay_sizes_l[i] = (int)ceilf(BASE_DELAY_L[i] * scale) + 1;
        d->delays_l[i] = (float*)calloc(d->delay_sizes_l[i], sizeof(float));
        d->write_pos_l[i] = 0;

        d->delay_sizes_r[i] = (int)ceilf(BASE_DELAY_R[i] * scale) + 1;
        d->delays_r[i] = (float*)calloc(d->delay_sizes_r[i], sizeof(float));
        d->write_pos_r[i] = 0;
    }
}

static void diffuser_destroy(AllpassDiffuser* d) {
    for (int i = 0; i < KESSHO_ALLPASS_STAGES; i++) {
        free(d->delays_l[i]);
        free(d->delays_r[i]);
        d->delays_l[i] = nullptr;
        d->delays_r[i] = nullptr;
    }
}

static inline float diffuser_process_channel(float* buf, int size, int* write_pos,
                                               int delay_size, float g, float input) {
    int rp = (*write_pos - delay_size + size);
    if (rp < 0) rp += size;
    rp = rp % size;
    float delayed = buf[rp];
    float v = input - delayed * g;
    buf[*write_pos] = sanitize(v);
    float out = delayed + v * g;
    *write_pos = (*write_pos + 1) % size;
    return sanitize(out);
}

static float diffuser_process_l(AllpassDiffuser* d, float input) {
    float x = input;
    for (int i = 0; i < KESSHO_ALLPASS_STAGES; i++) {
        x = diffuser_process_channel(d->delays_l[i], d->delay_sizes_l[i],
                                      &d->write_pos_l[i], BASE_DELAY_L[i],
                                      d->g, x);
    }
    return x;
}

static float diffuser_process_r(AllpassDiffuser* d, float input) {
    float x = input;
    for (int i = 0; i < KESSHO_ALLPASS_STAGES; i++) {
        x = diffuser_process_channel(d->delays_r[i], d->delay_sizes_r[i],
                                      &d->write_pos_r[i], BASE_DELAY_R[i],
                                      d->g, x);
    }
    return x;
}

// ═══════════════ Buffer Interpolation ═══════════════

static inline float read_buffer_cubic(const float* buf, int size, float position) {
    float pos = fmodf(position, (float)size);
    if (pos < 0.0f) pos += (float)size;
    int i0 = (int)pos;
    float frac = pos - (float)i0;

    int im1 = i0 > 0 ? i0 - 1 : size - 1;
    int i1  = i0 < size - 1 ? i0 + 1 : 0;
    int i2  = i0 < size - 2 ? i0 + 2 : (i0 + 2) % size;

    float xm1 = buf[im1];
    float x0  = buf[i0];
    float x1  = buf[i1];
    float x2  = buf[i2];

    float c1 = 0.5f * (x1 - xm1);
    float c2 = xm1 - 2.5f * x0 + 2.0f * x1 - 0.5f * x2;
    float c3 = 0.5f * (x2 - xm1) + 1.5f * (x0 - x1);
    return ((c3 * frac + c2) * frac + c1) * frac + x0;
}

/** 8-point Kaiser-windowed sinc interpolation — higher fidelity than cubic. */
static inline float read_buffer_sinc(const GranularState* s, const float* buf, int size, float position) {
    float pos = fmodf(position, (float)size);
    if (pos < 0.0f) pos += (float)size;
    int i0 = (int)pos;
    float frac = pos - (float)i0;

    // Quantize fractional offset to sinc table resolution
    int frac_idx = (int)(frac * (float)KESSHO_SINC_OVERSAMPLING);
    if (frac_idx >= KESSHO_SINC_OVERSAMPLING) frac_idx = KESSHO_SINC_OVERSAMPLING - 1;

    const float* kernel = &s->sinc_table[frac_idx * KESSHO_SINC_TAPS];
    float sum = 0.0f;
    int half = KESSHO_SINC_TAPS / 2;
    for (int t = 0; t < KESSHO_SINC_TAPS; t++) {
        int idx = i0 + t - half + 1;
        // Wrap around circular buffer
        if (idx < 0) idx += size;
        else if (idx >= size) idx -= size;
        sum += buf[idx] * kernel[t];
    }
    return sum;
}

// ═══════════════ Hann Window / Grain Envelope ═══════════════

/** Hann window with linear interpolation between table entries. */
static inline float hann_window(const GranularState* s, float phase) {
    float idx_f = phase * (float)(KESSHO_HANN_TABLE_SIZE - 1);
    if (idx_f < 0.0f) idx_f = 0.0f;
    if (idx_f >= (float)(KESSHO_HANN_TABLE_SIZE - 1)) return s->hann_table[KESSHO_HANN_TABLE_SIZE - 1];
    int idx = (int)idx_f;
    float frac = idx_f - (float)idx;
    return s->hann_table[idx] + frac * (s->hann_table[idx + 1] - s->hann_table[idx]);
}

static inline float grain_attack_curve(const GranularState* s, int shape, float t) {
    t = clampf(t, 0.0f, 1.0f);
    switch (shape) {
        case KESSHO_GRAIN_SHAPE_TRIANGLE:
            return t;
        case KESSHO_GRAIN_SHAPE_SAW_UP:
            return t * t;
        case KESSHO_GRAIN_SHAPE_SAW_DOWN:
            return sqrtf(t);
        case KESSHO_GRAIN_SHAPE_SQUARE:
        default:
            // Safety-smoothed edge so square does not click aggressively.
            return hann_window(s, t * 0.5f);
    }
}

static inline float grain_decay_curve(const GranularState* s, int shape, float t) {
    t = clampf(t, 0.0f, 1.0f);
    switch (shape) {
        case KESSHO_GRAIN_SHAPE_TRIANGLE:
            return 1.0f - t;
        case KESSHO_GRAIN_SHAPE_SAW_UP:
            return powf(1.0f - t, 0.65f);
        case KESSHO_GRAIN_SHAPE_SAW_DOWN:
            return powf(1.0f - t, 1.4f);
        case KESSHO_GRAIN_SHAPE_SQUARE:
        default:
            return hann_window(s, 0.5f + t * 0.5f);
    }
}

/**
 * Grain envelope with discrete contour families inspired by Microcosm-style
 * shape modes. Attack/decay still define the edge durations; shape changes the
 * curve inside those edges.
 */
static inline float grain_envelope(const GranularState* s, int sample, int length,
                                     int atk_smp, int dec_smp, int shape) {
    if (length <= 0) return 0.0f;
    if (atk_smp < 1) atk_smp = 1;
    if (dec_smp < 1) dec_smp = 1;

    int dec_start = length - dec_smp;
    if (dec_start < atk_smp) dec_start = atk_smp;

    if (sample < atk_smp) {
        float phase = (float)sample / (float)atk_smp;
        return grain_attack_curve(s, shape, phase);
    }
    if (sample >= dec_start) {
        float denom = (float)(length - dec_start);
        if (denom < 1.0f) denom = 1.0f;
        float phase = (float)(sample - dec_start) / denom;
        return grain_decay_curve(s, shape, phase);
    }
    return 1.0f;
}

// ═══════════════ Pan Lookup ═══════════════

static inline void get_pan_lr(const GranularState* s, float pan, float* out_l, float* out_r) {
    int idx = (int)((pan + 1.0f) * 0.5f * (float)(KESSHO_PAN_TABLE_SIZE - 1));
    if (idx < 0) idx = 0;
    if (idx >= KESSHO_PAN_TABLE_SIZE) idx = KESSHO_PAN_TABLE_SIZE - 1;
    *out_l = s->pan_table_l[idx];
    *out_r = s->pan_table_r[idx];
}

// ═══════════════ Pitch Quantization ═══════════════

static float quantize_pitch(const GranularState* s, float semitones) {
    if (s->scale_count == 0 && s->chord_count == 0) return semitones;

    // Scale quantization
    float scale_result = semitones;
    if (s->scale_count > 0) {
        int octaves = (int)floorf(semitones / 12.0f);
        float remainder = fmodf(fmodf(semitones, 12.0f) + 12.0f, 12.0f);
        int best_interval = 0;
        float best_dist = 99.0f;
        for (int i = 0; i < s->scale_count; i++) {
            float d = fabsf((float)s->scale_intervals[i] - remainder);
            float dist = d < (12.0f - d) ? d : (12.0f - d);
            if (dist < best_dist) {
                best_dist = dist;
                best_interval = s->scale_intervals[i];
            }
        }
        scale_result = (float)(octaves * 12 + best_interval);
    }

    // Chord bias: blend toward nearest chord tone
    if (s->chord_count > 0 && s->chord_bias > 0.0f) {
        int octaves = (int)floorf(semitones / 12.0f);
        float remainder = fmodf(fmodf(semitones, 12.0f) + 12.0f, 12.0f);
        int best_chord = 0;
        float best_dist = 99.0f;
        for (int i = 0; i < s->chord_count; i++) {
            float ct = fmodf((float)s->chord_pitches[i], 12.0f);
            if (ct < 0.0f) ct += 12.0f;
            float d = fabsf(ct - remainder);
            float dist = d < (12.0f - d) ? d : (12.0f - d);
            if (dist < best_dist) {
                best_dist = dist;
                best_chord = (int)ct;
            }
        }
        float chord_result = (float)(octaves * 12 + best_chord);
        // Blend: bias=0 → pure scale, bias=1 → chord tones only
        return scale_result + s->chord_bias * (chord_result - scale_result);
    }

    return scale_result;
}

// ═══════════════ Random ═══════════════

static float next_random(GranularState* s) {
    if (s->random_len == 0) {
        // Fallback: simple LCG using per-instance seed
        s->rng_seed = s->rng_seed * 1103515245 + 12345;
        return (float)(s->rng_seed & 0x7FFF) / 32768.0f;
    }
    float v = s->random_seq[s->random_idx];
    s->random_idx = (s->random_idx + 1) % s->random_len;
    return v;
}

// ═══════════════ Trigger Envelope ═══════════════

static inline float trig_env_level(const GranularState* s, int v) {
    int phase = s->trig_env_phase[v];
    if (phase < 0) return 1.0f;
    float atk = s->trig_env_atk_cache[v];
    float dec = s->trig_env_dec_cache[v];
    float vel = s->trig_env_velocity[v];
    if ((float)phase < atk) {
        return ((float)phase / atk) * vel;
    }
    float dec_phase = (float)phase - atk;
    if (dec_phase < dec) {
        return vel * (1.0f - dec_phase / dec);
    }
    return 0.0f;
}

static inline void advance_trig_env(GranularState* s, int v) {
    if (s->trig_env_phase[v] >= 0) {
        s->trig_env_phase[v]++;
        if ((float)s->trig_env_phase[v] > s->trig_env_atk_cache[v] + s->trig_env_dec_cache[v]) {
            s->trig_env_phase[v] = -1;
        }
    }
}

// ═══════════════ Slice System ═══════════════

static inline int get_slice_start(const GranularState* s, int slice_index) {
    return (int)((float)slice_index / (float)KESSHO_NUM_SLICES * (float)s->buffer_size);
}

static inline int get_slice_length(const GranularState* s) {
    return s->buffer_size / KESSHO_NUM_SLICES;
}

static inline int compute_next_grain_interval(GranularState* s, int voice_idx) {
    float base_interval = (float)s->samples_per_grain[voice_idx];
    float burst_mult = s->trig_density_mult[voice_idx];
    if (burst_mult < 1.0f) burst_mult = 1.0f;
    float mean_interval = base_interval / burst_mult;
    float jitter = clampf(s->timing_randomness, 0.0f, 1.0f);
    float spread = 0.08f + jitter * 0.92f;
    float rand = (next_random(s) - 0.5f) * 2.0f;
    float interval_scale = 1.0f + rand * spread;
    if (interval_scale < 0.12f) interval_scale = 0.12f;
    int next_interval = (int)(mean_interval * interval_scale);
    if (next_interval < 1) next_interval = 1;
    return next_interval;
}

// ═══════════════ Grain Spawning ═══════════════

static void spawn_grain(GranularState* s, int voice_idx) {
    VoiceParams* vp = &s->voice[voice_idx];
    Grain* pool = s->grain_pool[voice_idx];

    if (s->total_active_grains >= KESSHO_MAX_TOTAL_GRAINS) return;

    // Find inactive grain
    Grain* grain = nullptr;
    for (int i = 0; i < KESSHO_MAX_GRAINS; i++) {
        if (!pool[i].active) { grain = &pool[i]; break; }
    }
    if (!grain) return;

    float sr = s->sample_rate;
    int grain_samples = (int)(vp->grain_size / 1000.0f * sr);
    if (grain_samples < 1) grain_samples = 1;

    if (vp->mode == KESSHO_MODE_LEGACY) {
        // Legacy mode: replicate original granulator behavior
        if (next_random(s) > s->legacy.probability) return;

        int spray_samples = (int)(vp->spray * 600.0f / 1000.0f * sr);
        int jitter_samples = (int)(s->legacy.jitter / 1000.0f * sr);
        int base_pos = (s->write_pos - spray_samples + s->buffer_size) % s->buffer_size;
        int spray_offset = (int)(next_random(s) * (float)spray_samples);
        int jitter_offset = (int)((next_random(s) - 0.5f) * 2.0f * (float)jitter_samples);
        grain->position = (float)((base_pos - spray_offset + jitter_offset + s->buffer_size * 2) % s->buffer_size);
        s->last_grain_pos[voice_idx] = grain->position;

        // Harmonic or random pitch — quantize to current scale for musicality
        float pitch_offset;
        if (s->legacy.pitch_mode == KESSHO_PITCH_HARMONIC) {
            int max_idx = (int)(s->legacy.pitch_spread / 12.0f * (float)NUM_HARMONIC_INTERVALS);
            if (max_idx < 1) max_idx = 1;
            if (max_idx > NUM_HARMONIC_INTERVALS) max_idx = NUM_HARMONIC_INTERVALS;
            pitch_offset = (float)HARMONIC_INTERVALS[(int)(next_random(s) * (float)max_idx)];
        } else {
            pitch_offset = (next_random(s) - 0.5f) * 2.0f * s->legacy.pitch_spread;
        }
        // Snap pitch to current scale so legacy grains stay in key
        pitch_offset = quantize_pitch(s, pitch_offset);
        grain->playback_rate = powf(2.0f, pitch_offset / 12.0f);
        grain->pan = (next_random(s) - 0.5f) * 2.0f * (vp->stereo_spread > 0.0f ? vp->stereo_spread : 0.5f);
    } else {
        // Standard granular mode
        int slice = s->euclid_slice_override[voice_idx] >= 0
            ? s->euclid_slice_override[voice_idx]
            : vp->slice;
        int slice_start = get_slice_start(s, slice);
        float spray = vp->spray;

        // Write follow + record LFO
        float base_wf = vp->write_follow;
        float write_follow = base_wf;
        if (vp->record_lfo_rate > 0.01f) {
            float rec_lfo_val = lfo_tick(&s->record_lfo[voice_idx], sr);
            float rec_gate = rec_lfo_val > 0.62f ? 1.0f : 0.0f;
            write_follow = base_wf + rec_gate * (1.0f - base_wf);
        }
        if (write_follow > 1.0f) write_follow = 1.0f;

        float pos_lfo_val = lfo_tick(&s->pos_lfo[voice_idx], sr);
        float lfo_depth = vp->pos_lfo_depth;
        float lfo_offset = pos_lfo_val * lfo_depth * (float)s->buffer_size;

        int slice_len = s->buffer_size / KESSHO_NUM_SLICES;
        float spray_window = fmaxf((float)grain_samples * 4.0f, (float)slice_len * 0.6f);
        float spray_range = spray * spray * spray_window;
        float spray_offset = spray_range * (next_random(s) - 0.5f);

        float base_pos;
        if (write_follow > 0.01f) {
            int wh_pos = (s->write_pos - grain_samples * 2 + s->buffer_size * 2) % s->buffer_size;
            base_pos = (float)slice_start * (1.0f - write_follow) + (float)wh_pos * write_follow;
        } else {
            base_pos = (float)slice_start;
        }
        grain->position = fmodf(base_pos + lfo_offset + spray_offset + (float)(s->buffer_size * 2),
                                 (float)s->buffer_size);
        s->last_grain_pos[voice_idx] = grain->position;

        // Pitch
        float pitch_semi = quantize_pitch(s, vp->pitch);
        if (s->euclid_pitch_active[voice_idx]) {
            pitch_semi += s->euclid_pitch_override[voice_idx];
        }
        if (vp->grain_oct > 0.0f && next_random(s) < vp->grain_oct * 0.6f) {
            pitch_semi += 12.0f;
        }
        float speed = vp->speed;

        // Reverse: manual XOR LFO XOR Euclidean
        float rev_lfo_val = lfo_tick(&s->reverse_lfo[voice_idx], sr);
        int lfo_reverse = rev_lfo_val > 0.5f ? 1 : 0;
        int is_reversed = vp->reverse != lfo_reverse;
        if (s->euclid_reverse_active[voice_idx]) {
            is_reversed = s->euclid_reverse_override[voice_idx] != is_reversed;
        }
        float direction = is_reversed ? -1.0f : 1.0f;
        grain->playback_rate = powf(2.0f, pitch_semi / 12.0f) * speed * direction;

        // Pan: manual + LFO + spread
        float base_pan = vp->pan;
        float pan_lfo = (lfo_tick(&s->pan_lfo[voice_idx], sr) - 0.5f) * 2.0f;
        float pan_rate = vp->pan_lfo_rate;
        float spread = vp->stereo_spread;
        grain->pan = clampf(base_pan + pan_lfo * pan_rate * 0.5f
                             + (next_random(s) - 0.5f) * 2.0f * spread,
                             -1.0f, 1.0f);
    }

    // Attack/decay envelope
    int min_fade = (int)(0.002f * sr);
    int atk_smp = (int)(vp->attack * sr);
    int dec_smp = (int)(vp->decay * sr);
    if (atk_smp < min_fade) atk_smp = min_fade;
    if (dec_smp < min_fade) dec_smp = min_fade;
    if (atk_smp + dec_smp > grain_samples) {
        int total = atk_smp + dec_smp;
        atk_smp = atk_smp * grain_samples / total;
        dec_smp = grain_samples - atk_smp;
    }
    grain->attack_smp = atk_smp;
    grain->decay_smp = dec_smp;
    grain->start_sample = 0;
    grain->length = grain_samples;
    grain->env_z1 = 0.0f;
    get_pan_lr(s, grain->pan, &grain->pan_l, &grain->pan_r);
    grain->active = 1;
    int grain_index = (int)(grain - pool);
    int active_count = s->active_grain_counts[voice_idx];
    if (active_count < KESSHO_MAX_GRAINS) {
        s->active_grain_indices[voice_idx][active_count] = grain_index;
        grain->active_list_pos = active_count;
        s->active_grain_counts[voice_idx] = active_count + 1;
    } else {
        grain->active = 0;
        grain->active_list_pos = -1;
        return;
    }
    s->total_active_grains++;
}

// ═══════════════ Clean Voice Processing ═══════════════

static void process_clean_voice(GranularState* s, int v, float* out_l, float* out_r, int block_size) {
    VoiceParams* vp = &s->voice[v];
    float sr = s->sample_rate;

    int slice = s->euclid_slice_override[v] >= 0 ? s->euclid_slice_override[v] : vp->slice;
    int slice_start = get_slice_start(s, slice);
    int slice_len = get_slice_length(s);
    float speed = vp->speed;

    // Reverse: manual XOR Euclidean XOR LFO
    int reverse = vp->reverse;
    if (s->euclid_reverse_active[v]) {
        reverse = (s->euclid_reverse_override[v] != reverse) ? 1 : 0;
    }
    float rev_lfo_val = lfo_tick(&s->reverse_lfo[v], sr);
    int lfo_reverse = rev_lfo_val > 0.5f ? 1 : 0;
    reverse = (reverse != lfo_reverse) ? 1 : 0;

    float pitch_semi = quantize_pitch(s, vp->pitch);
    if (s->euclid_pitch_active[v]) {
        pitch_semi += s->euclid_pitch_override[v];
    }
    float pitch_rate = powf(2.0f, pitch_semi / 12.0f);
    float scan_rate = clampf(vp->scan_rate, 0.25f, 4.0f);
    float effective_rate = speed * pitch_rate * (reverse ? -1.0f : 1.0f);
    float gain = vp->gain;
    float blur = vp->blur;
    float lfo_depth = vp->pos_lfo_depth;
    int is_gated = vp->euclid_gated;

    // Record LFO
    float base_wf = vp->write_follow;
    float write_follow = base_wf;
    if (vp->record_lfo_rate > 0.01f) {
        // In clean mode, treat the record LFO as a gate/latch gesture instead of a
        // continuous wobble. This keeps looper-style presets stable while still
        // allowing periodic re-capture toward the write head.
        float rec_lfo_val = lfo_tick(&s->record_lfo[v], sr);
        float rec_gate = rec_lfo_val > 0.62f ? 1.0f : 0.0f;
        write_follow = base_wf + rec_gate * (1.0f - base_wf);
    }
    if (write_follow > 1.0f) write_follow = 1.0f;

    // Pan
    float pan_lfo_val = (lfo_tick(&s->pan_lfo[v], sr) - 0.5f) * 2.0f;
    float pan_rate = vp->pan_lfo_rate;
    float spread = vp->stereo_spread;
    float mod_pan = clampf(vp->pan + pan_lfo_val * pan_rate * 0.5f
                            + spread * ((v % 2 == 0) ? -0.3f : 0.3f),
                            -1.0f, 1.0f);
    float pan_l, pan_r;
    get_pan_lr(s, mod_pan, &pan_l, &pan_r);

    BiquadFilter* aa_l = &s->anti_alias_l[v];
    BiquadFilter* aa_r = &s->anti_alias_r[v];
    BiquadFilter* aa2_l = &s->anti_alias2_l[v];
    BiquadFilter* aa2_r = &s->anti_alias2_r[v];
    BiquadFilter* aa3_l = &s->anti_alias3_l[v];
    BiquadFilter* aa3_r = &s->anti_alias3_r[v];

    int is_lfo_scan = (speed == 0.0f);
    if (is_lfo_scan) {
        s->pos_lfo[v].use_sine = 1;
    }

    if (!is_lfo_scan) {
        float ar = fabsf(effective_rate);
        biquad_update(aa_l, ar);
        biquad_update(aa_r, ar);
        biquad_update(aa2_l, ar);
        biquad_update(aa2_r, ar);
        biquad_update(aa3_l, ar);
        biquad_update(aa3_r, ar);
    }

    // ═══ LFO Scan Mode ═══
    if (is_lfo_scan) {
        float half_buf = (float)s->buffer_size * 0.5f;
        // Decouple transport from pitch in scan mode so "pitch" no longer causes the
        // scan heads themselves to race around the buffer. This makes clean loopers
        // behave like moving tape heads instead of pitch-wobbled grain clouds.
        float scan_adv = scan_rate * (reverse ? -1.0f : 1.0f);
        float abs_scan_rate = fabsf(scan_adv);
        static const float SCAN_XFADE_INC = 1.0f / 5760.0f;
        static const float SCAN_DRIFT_THRESH = 7200.0f;

        ScanState* sc = &s->scan[v];
        if (abs_scan_rate > 1.05f) {
            biquad_update(aa_l, abs_scan_rate);
            biquad_update(aa_r, abs_scan_rate);
            biquad_update(aa2_l, abs_scan_rate);
            biquad_update(aa2_r, abs_scan_rate);
            biquad_update(aa3_l, abs_scan_rate);
            biquad_update(aa3_r, abs_scan_rate);
        }

        for (int i = 0; i < block_size; i++) {
            float env_gain = 1.0f;
            if (is_gated) {
                env_gain = trig_env_level(s, v);
                advance_trig_env(s, v);
                if (env_gain < 0.001f) continue;
            }

            float lfo_val = lfo_tick(&s->pos_lfo[v], sr);
            float target_pos = fmodf(lfo_val * lfo_depth * (float)s->buffer_size, (float)s->buffer_size);
            if (write_follow > 0.01f) {
                float wp = (float)((s->write_pos - 4096 + s->buffer_size) % s->buffer_size);
                target_pos = target_pos * (1.0f - write_follow) + wp * write_follow;
            }

            if (!sc->initialized) {
                sc->head_a = target_pos;
                sc->head_b = target_pos;
                sc->fade = 0.0f;
                sc->fading = 0;
                sc->initialized = 1;
            }

            // Advance both heads
            sc->head_a = fmodf(sc->head_a + scan_adv + (float)s->buffer_size, (float)s->buffer_size);
            sc->head_b = fmodf(sc->head_b + scan_adv + (float)s->buffer_size, (float)s->buffer_size);

            float active_pos = sc->fade < 0.5f ? sc->head_a : sc->head_b;
            float drift = target_pos - active_pos;
            if (drift > half_buf) drift -= (float)s->buffer_size;
            if (drift < -half_buf) drift += (float)s->buffer_size;

            if (!sc->fading && fabsf(drift) > SCAN_DRIFT_THRESH) {
                sc->fading = 1;
                if (sc->fade < 0.5f) {
                    sc->head_b = target_pos;
                    sc->fade_dir = 1.0f;
                } else {
                    sc->head_a = target_pos;
                    sc->fade_dir = -1.0f;
                }
            }

            if (sc->fading) {
                sc->fade += sc->fade_dir * SCAN_XFADE_INC;
                if (sc->fade >= 1.0f) { sc->fade = 1.0f; sc->fading = 0; }
                else if (sc->fade <= 0.0f) { sc->fade = 0.0f; sc->fading = 0; }
            }

            int fade_idx = (int)(sc->fade * (float)KESSHO_XFADE_TABLE_SIZE);
            if (fade_idx > KESSHO_XFADE_TABLE_SIZE) fade_idx = KESSHO_XFADE_TABLE_SIZE;
            float gain_a = s->xfade_table_a[fade_idx];
            float gain_b = s->xfade_table_b[fade_idx];

            float sL = read_buffer_sinc(s, s->buffer_l, s->buffer_size, sc->head_a) * gain_a
                      + read_buffer_sinc(s, s->buffer_l, s->buffer_size, sc->head_b) * gain_b;
            float sR = read_buffer_sinc(s, s->buffer_r, s->buffer_size, sc->head_a) * gain_a
                      + read_buffer_sinc(s, s->buffer_r, s->buffer_size, sc->head_b) * gain_b;

            if (abs_scan_rate > 1.05f) {
                sL = biquad_process(aa_l, biquad_process(aa2_l, biquad_process(aa3_l, sL)));
                sR = biquad_process(aa_r, biquad_process(aa2_r, biquad_process(aa3_r, sR)));
            }

            if (blur > 0.01f) {
                float bl = diffuser_process_l(&s->diffuser[v], sL);
                float br = diffuser_process_r(&s->diffuser[v], sR);
                sL = sL * (1.0f - blur) + bl * blur;
                sR = sR * (1.0f - blur) + br * blur;
            }

            // DC blocking
            sL = hpf_process(&s->dc_block_l[v], sL);
            sR = hpf_process(&s->dc_block_r[v], sR);

            out_l[i] += sL * gain * env_gain * pan_l;
            out_r[i] += sR * gain * env_gain * pan_r;
            s->clean_read_pos[v] = active_pos;
            s->scan_lfo_target[v] = target_pos;
        }
        return;
    }

    // ═══ Normal clean voice (speed > 0) ═══
    for (int i = 0; i < block_size; i++) {
        float env_gain = 1.0f;
        if (is_gated) {
            env_gain = trig_env_level(s, v);
            advance_trig_env(s, v);
            if (env_gain < 0.001f) continue;
        }

        float lfo_val = lfo_tick(&s->pos_lfo[v], sr);
        float lfo_offset = lfo_val * lfo_depth * (float)s->buffer_size;
        int clean_pos_int = (int)s->clean_read_pos[v] % slice_len;
        if (clean_pos_int < 0) clean_pos_int += slice_len;
        float read_pos = fmodf((float)slice_start + (float)clean_pos_int + lfo_offset
                                + (float)(s->buffer_size * 2), (float)s->buffer_size);

        float sL = read_buffer_sinc(s, s->buffer_l, s->buffer_size, read_pos);
        float sR = read_buffer_sinc(s, s->buffer_r, s->buffer_size, read_pos);

        // 36 dB/oct cascaded anti-alias
        sL = biquad_process(aa_l, biquad_process(aa2_l, biquad_process(aa3_l, sL)));
        sR = biquad_process(aa_r, biquad_process(aa2_r, biquad_process(aa3_r, sR)));

        if (blur > 0.01f) {
            float bl = diffuser_process_l(&s->diffuser[v], sL);
            float br = diffuser_process_r(&s->diffuser[v], sR);
            sL = sL * (1.0f - blur) + bl * blur;
            sR = sR * (1.0f - blur) + br * blur;
        }

        // DC blocking
        sL = hpf_process(&s->dc_block_l[v], sL);
        sR = hpf_process(&s->dc_block_r[v], sR);

        out_l[i] += sL * gain * env_gain * pan_l;
        out_r[i] += sR * gain * env_gain * pan_r;

        s->clean_read_pos[v] += effective_rate;
        s->clean_read_pos[v] = fmodf(s->clean_read_pos[v], (float)slice_len);
        if (s->clean_read_pos[v] < 0.0f) s->clean_read_pos[v] += (float)slice_len;
    }
}

// ═══════════════ Granular/Legacy Voice Processing ═══════════════

static void process_granular_voice(GranularState* s, int v, float* out_l, float* out_r, int block_size) {
    VoiceParams* vp = &s->voice[v];
    float gain = vp->gain;
    float blur = vp->blur;
    Grain* pool = s->grain_pool[v];
    int* active_indices = s->active_grain_indices[v];
    int is_gated = vp->euclid_gated;
    float sr = s->sample_rate;
    float euclidSchedulerThrottle = is_gated ? 0.42f : 1.0f;

    // Anti-alias: max absolute rate across active grains
    float max_abs_rate = 1.0f;
    int active_grain_count = s->active_grain_counts[v];
    for (int gi = 0; gi < active_grain_count; gi++) {
        Grain* grain = &pool[active_indices[gi]];
        float ar = fabsf(grain->playback_rate);
        if (ar > max_abs_rate) max_abs_rate = ar;
    }
    // 3-stage cascaded biquad (36 dB/oct)
    BiquadFilter* aa_l  = &s->anti_alias_l[v];
    BiquadFilter* aa_r  = &s->anti_alias_r[v];
    BiquadFilter* aa2_l = &s->anti_alias2_l[v];
    BiquadFilter* aa2_r = &s->anti_alias2_r[v];
    BiquadFilter* aa3_l = &s->anti_alias3_l[v];
    BiquadFilter* aa3_r = &s->anti_alias3_r[v];
    biquad_update(aa_l, max_abs_rate);
    biquad_update(aa_r, max_abs_rate);
    biquad_update(aa2_l, max_abs_rate);
    biquad_update(aa2_r, max_abs_rate);
    biquad_update(aa3_l, max_abs_rate);
    biquad_update(aa3_r, max_abs_rate);

    static const float TRIG_DENSITY_DECAY = 0.9997f;
    float smooth_coeff = 0.06f + blur * 0.18f;
    float smooth_mix = 0.22f + blur * 0.28f;

    for (int i = 0; i < block_size; i++) {
        // Euclidean gating
        float env_gain = 1.0f;
        if (is_gated) {
            env_gain = trig_env_level(s, v);
            advance_trig_env(s, v);
        }

        // Grain scheduling
        if (s->initialized) {
            s->samples_since_grain[v]++;
            s->samples_until_grain[v]--;
            if (s->samples_until_grain[v] <= 0) {
                spawn_grain(s, v);
                s->samples_since_grain[v] = 0;
                int nextInterval = compute_next_grain_interval(s, v);
                if (euclidSchedulerThrottle < 0.999f) {
                    nextInterval = (int)((float)nextInterval / euclidSchedulerThrottle);
                    if (nextInterval < 1) nextInterval = 1;
                }
                s->samples_until_grain[v] = nextInterval;
            }
            if (s->trig_density_mult[v] > 1.001f) {
                s->trig_density_mult[v] *= TRIG_DENSITY_DECAY;
            } else {
                s->trig_density_mult[v] = 1.0f;
            }
        }
        active_grain_count = s->active_grain_counts[v];

        // Accumulate active grains
        float wet_l = 0.0f, wet_r = 0.0f;
        int active_count = 0;

        int gi = 0;
        while (gi < active_grain_count) {
            Grain* grain = &pool[active_indices[gi]];
            active_count++;

            float read_pos = grain->position + (float)grain->start_sample * grain->playback_rate;
            float sL = read_buffer_sinc(s, s->buffer_l, s->buffer_size, read_pos);
            float sR = read_buffer_sinc(s, s->buffer_r, s->buffer_size, read_pos);

            float raw_env = grain_envelope(s, grain->start_sample, grain->length,
                                        grain->attack_smp, grain->decay_smp, s->grain_shape);
            // One-pole envelope smoother — removes micro-discontinuities
            float env = grain->env_z1 + 0.005f * (raw_env - grain->env_z1);
            grain->env_z1 = env;

            wet_l += sL * env * grain->pan_l;
            wet_r += sR * env * grain->pan_r;

            grain->start_sample++;
            if (grain->start_sample >= grain->length) {
                grain->active = 0;
                int remove_pos = grain->active_list_pos;
                int last_pos = active_grain_count - 1;
                if (remove_pos >= 0 && remove_pos <= last_pos) {
                    int moved_index = active_indices[last_pos];
                    active_indices[remove_pos] = moved_index;
                    pool[moved_index].active_list_pos = remove_pos;
                    active_grain_count = last_pos;
                    s->active_grain_counts[v] = active_grain_count;
                }
                grain->active_list_pos = -1;
                s->total_active_grains--;
                continue;
            }
            gi++;
        }

        // Gain compensation
        if (active_count > 1) {
            float comp = (active_count <= KESSHO_MAX_GRAINS)
                ? s->gain_comp_table[active_count]
                : (1.0f / sqrtf((float)active_count));
            wet_l *= comp;
            wet_r *= comp;
        }

        // Anti-alias (36 dB/oct cascaded biquads)
        wet_l = biquad_process(aa_l, biquad_process(aa2_l, biquad_process(aa3_l, wet_l)));
        wet_r = biquad_process(aa_r, biquad_process(aa2_r, biquad_process(aa3_r, wet_r)));

        // Blur
        if (blur > 0.01f) {
            float bl = diffuser_process_l(&s->diffuser[v], wet_l);
            float br = diffuser_process_r(&s->diffuser[v], wet_r);
            wet_l = wet_l * (1.0f - blur) + bl * blur;
            wet_r = wet_r * (1.0f - blur) + br * blur;
        }

        // DC blocking (~5 Hz HPF)
        wet_l = hpf_process(&s->dc_block_l[v], wet_l);
        wet_r = hpf_process(&s->dc_block_r[v], wet_r);

        // One-pole smoothing after blur/DC helps the cloud read as one texture
        // instead of a flock of isolated transients poking through the reverb.
        s->grain_smooth_l[v] += smooth_coeff * (wet_l - s->grain_smooth_l[v]);
        s->grain_smooth_r[v] += smooth_coeff * (wet_r - s->grain_smooth_r[v]);
        wet_l = wet_l * (1.0f - smooth_mix) + s->grain_smooth_l[v] * smooth_mix;
        wet_r = wet_r * (1.0f - smooth_mix) + s->grain_smooth_r[v] * smooth_mix;

        out_l[i] += wet_l * gain * env_gain;
        out_r[i] += wet_r * gain * env_gain;
    }
}

// ═══════════════ Main Process Block ═══════════════

static void process_block_internal(GranularState* s, int block_size) {
    float sr = s->sample_rate;
    float* in_buf = s->input_buf;
    float* out_buf = s->output_buf;

    if (!s->enabled) {
        // Pass-through: straight copy (compiler may auto-vectorize, but memcpy is optimal)
        memcpy(out_buf, in_buf, block_size * 2 * sizeof(float));
        return;
    }

    // ── Step 1: Write input to buffer ──
    for (int i = 0; i < block_size; i++) {
        float in_l = in_buf[i * 2];
        float in_r = in_buf[i * 2 + 1];

        // Silence detection
        float level = fabsf(in_l) + fabsf(in_r);
        if (level < 0.001f) {
            s->silent_samples++;
            if (!s->freeze && s->silent_samples > (int)(sr * 2.0f)) {
                float fade_rate = (float)(s->silent_samples - (int)(sr * 2.0f)) / (sr * 4.0f);
                if (fade_rate > 1.0f) fade_rate = 1.0f;
                float decay = 1.0f - fade_rate * 0.002f;
                s->buffer_l[s->write_pos] *= decay;
                s->buffer_r[s->write_pos] *= decay;
            }
        } else {
            s->silent_samples = 0;
        }

        // Detect freeze → unfreeze transition
        if (s->prev_freeze && !s->freeze) {
            s->unfreeze_fade = KESSHO_UNFREEZE_XFADE_SAMPLES;
        }
        s->prev_freeze = s->freeze;

        if (!s->freeze) {
            if (s->unfreeze_fade > 0) {
                // Crossfade old buffer content with new input to avoid splice click
                float fade_in = 1.0f - (float)s->unfreeze_fade / (float)KESSHO_UNFREEZE_XFADE_SAMPLES;
                float fade_out = 1.0f - fade_in;
                s->buffer_l[s->write_pos] = s->buffer_l[s->write_pos] * fade_out + in_l * fade_in;
                s->buffer_r[s->write_pos] = s->buffer_r[s->write_pos] * fade_out + in_r * fade_in;
                s->unfreeze_fade--;
            } else {
                s->buffer_l[s->write_pos] = in_l;
                s->buffer_r[s->write_pos] = in_r;
            }
            s->write_pos = (s->write_pos + 1) % s->buffer_size;
        }
    }

    // ── Step 2: Process voices ──
    float* v_out_l = s->voice_out_l;
    float* v_out_r = s->voice_out_r;
    memset(v_out_l, 0, block_size * sizeof(float));
    memset(v_out_r, 0, block_size * sizeof(float));

    // Count ALL enabled voices for compensation (including Euclid-muted ones)
    // so mute/solo doesn't cause volume jumps
    for (int v = 0; v < KESSHO_NUM_VOICES; v++) {
        if (!s->voice[v].enabled) continue;
        if (s->voice[v].euclid_muted) continue; // silenced by Euclid mute/solo

        if (s->voice[v].mode == KESSHO_MODE_CLEAN) {
            process_clean_voice(s, v, v_out_l, v_out_r, block_size);
        } else {
            process_granular_voice(s, v, v_out_l, v_out_r, block_size);
        }
    }

    // ── Step 2b: Voice-count gain compensation ──
    // Always scale by 1/√(NUM_VOICES) so solo/mute don't change gain of remaining voices
    {
        float voice_comp = 1.0f / sqrtf((float)KESSHO_NUM_VOICES);
#ifdef __wasm_simd128__
        // SIMD: process 4 samples at a time per channel
        v128_t vc = wasm_f32x4_splat(voice_comp);
        int i = 0;
        for (; i + 3 < block_size; i += 4) {
            wasm_v128_store(&v_out_l[i], wasm_f32x4_mul(wasm_v128_load(&v_out_l[i]), vc));
            wasm_v128_store(&v_out_r[i], wasm_f32x4_mul(wasm_v128_load(&v_out_r[i]), vc));
        }
        for (; i < block_size; i++) {
            v_out_l[i] *= voice_comp;
            v_out_r[i] *= voice_comp;
        }
#else
        for (int i = 0; i < block_size; i++) {
            v_out_l[i] *= voice_comp;
            v_out_r[i] *= voice_comp;
        }
#endif
    }

    // ── Step 3: Feedback ──
    float feedback_gain;
    if (s->voice[0].mode == KESSHO_MODE_LEGACY) {
        feedback_gain = s->legacy.feedback;
        if (feedback_gain > 0.35f) feedback_gain = 0.35f;
    } else {
        feedback_gain = s->feedback;
        if (feedback_gain > 0.85f) feedback_gain = 0.85f;
    }

    if (feedback_gain > 0.001f) {
        static const float RMS_ATTACK = 0.001f;
        static const float RMS_RELEASE = 0.05f;

        for (int i = 0; i < block_size; i++) {
            float fb_l = v_out_l[i] * feedback_gain;
            float fb_r = v_out_r[i] * feedback_gain;

            fb_l = hpf_process(&s->fb_hpf_l, fb_l);
            fb_r = hpf_process(&s->fb_hpf_r, fb_r);

            fb_l = lpf_process(&s->fb_lpf_l, fb_l, s->feedback_lpf_coeff);
            fb_r = lpf_process(&s->fb_lpf_r, fb_r, s->feedback_lpf_coeff);

            // RMS auto-gain
            float energy = fb_l * fb_l + fb_r * fb_r;
            float coeff = energy > s->fb_rms ? RMS_ATTACK : RMS_RELEASE;
            s->fb_rms += coeff * (energy - s->fb_rms);
            s->fb_rms = sanitize(s->fb_rms);
            float auto_gain = s->fb_rms > 0.09f ? 0.3f / sqrtf(s->fb_rms) : 1.0f;
            fb_l *= auto_gain;
            fb_r *= auto_gain;

#ifdef __wasm_simd128__
            fast_tanh_lr(&fb_l, &fb_r);
#else
            fb_l = fast_tanh(fb_l);
            fb_r = fast_tanh(fb_r);
#endif

            if (!s->freeze || s->freeze_with_feedback) {
                int fb_write_pos = (s->write_pos - block_size + i + s->buffer_size) % s->buffer_size;
                s->buffer_l[fb_write_pos] += sanitize(fb_l);
                s->buffer_r[fb_write_pos] += sanitize(fb_r);
                // Hard-clamp buffer to prevent unbounded accumulation
                // (JS survives via float64 headroom; float32 needs explicit limit)
                s->buffer_l[fb_write_pos] = clampf(s->buffer_l[fb_write_pos], -4.0f, 4.0f);
                s->buffer_r[fb_write_pos] = clampf(s->buffer_r[fb_write_pos], -4.0f, 4.0f);
            }
        }
    }

    // ── Step 3b: Summed bus diffusion ──
    if (s->bus_diffusion > 0.001f) {
        float diff_amount = clampf(s->bus_diffusion, 0.0f, 1.0f);
        float diff_mix = 0.12f + diff_amount * 0.7f;
        float smooth_coeff = 0.03f + diff_amount * 0.2f;
        float smooth_mix = 0.08f + diff_amount * 0.3f;
        for (int i = 0; i < block_size; i++) {
            float diff_l = diffuser_process_l(&s->bus_diffuser, v_out_l[i]);
            float diff_r = diffuser_process_r(&s->bus_diffuser, v_out_r[i]);
            float mixed_l = v_out_l[i] * (1.0f - diff_mix) + diff_l * diff_mix;
            float mixed_r = v_out_r[i] * (1.0f - diff_mix) + diff_r * diff_mix;
            s->bus_smooth_l += smooth_coeff * (mixed_l - s->bus_smooth_l);
            s->bus_smooth_r += smooth_coeff * (mixed_r - s->bus_smooth_r);
            v_out_l[i] = mixed_l * (1.0f - smooth_mix) + s->bus_smooth_l * smooth_mix;
            v_out_r[i] = mixed_r * (1.0f - smooth_mix) + s->bus_smooth_r * smooth_mix;
        }
    }

    // ── Step 4: Output ──
    float wet_level = s->dry_wet;
#ifdef __wasm_simd128__
    // SIMD: vectorized tanh on 4 samples at a time, then interleave L/R
    v128_t wl = wasm_f32x4_splat(wet_level);
    const v128_t out_lo = wasm_f32x4_splat(-1.0f);
    const v128_t out_hi = wasm_f32x4_splat(1.0f);
    int i = 0;
    for (; i + 3 < block_size; i += 4) {
        // Load 4 L and 4 R samples, scale by wet_level
        v128_t vl = wasm_f32x4_mul(wasm_v128_load(&v_out_l[i]), wl);
        v128_t vr = wasm_f32x4_mul(wasm_v128_load(&v_out_r[i]), wl);
        // Vectorized tanh on all 4 at once
        vl = fast_tanh_v4(vl);
        vr = fast_tanh_v4(vr);
        // Hard clamp to [-1,1] — defense against NaN/Inf leaking through
        vl = wasm_f32x4_min(wasm_f32x4_max(vl, out_lo), out_hi);
        vr = wasm_f32x4_min(wasm_f32x4_max(vr, out_lo), out_hi);
        // Replace NaN with 0: NaN != NaN, so use bitselect
        v128_t nanL = wasm_f32x4_ne(vl, vl);
        v128_t nanR = wasm_f32x4_ne(vr, vr);
        vl = wasm_v128_andnot(vl, nanL);
        vr = wasm_v128_andnot(vr, nanR);
        // Interleave L/R for stereo output: L0,R0,L1,R1 then L2,R2,L3,R3
        v128_t lo = wasm_i32x4_shuffle(vl, vr, 0, 4, 1, 5); // L0,R0,L1,R1
        v128_t hi = wasm_i32x4_shuffle(vl, vr, 2, 6, 3, 7); // L2,R2,L3,R3
        wasm_v128_store(&out_buf[(i)     * 2], lo);
        wasm_v128_store(&out_buf[(i + 2) * 2], hi);
    }
    // Scalar tail
    for (; i < block_size; i++) {
        float oL = sanitize(fast_tanh(v_out_l[i] * wet_level));
        float oR = sanitize(fast_tanh(v_out_r[i] * wet_level));
        out_buf[i * 2]     = clampf(oL, -1.0f, 1.0f);
        out_buf[i * 2 + 1] = clampf(oR, -1.0f, 1.0f);
    }
#else
    for (int i = 0; i < block_size; i++) {
        float oL = sanitize(fast_tanh(v_out_l[i] * wet_level));
        float oR = sanitize(fast_tanh(v_out_r[i] * wet_level));
        out_buf[i * 2]     = clampf(oL, -1.0f, 1.0f);
        out_buf[i * 2 + 1] = clampf(oR, -1.0f, 1.0f);
    }
#endif
}

// ═══════════════ Public C API Implementation ═══════════════

int granular_init(float sample_rate, float buffer_seconds) {
    if (g_state) granular_destroy();

    g_state = (GranularState*)calloc(1, sizeof(GranularState));
    if (!g_state) return -1;

    GranularState* s = g_state;
    s->sample_rate = sample_rate;
    s->buffer_size = (int)(buffer_seconds * sample_rate);
    s->buffer_l = (float*)calloc(s->buffer_size, sizeof(float));
    s->buffer_r = (float*)calloc(s->buffer_size, sizeof(float));
    if (!s->buffer_l || !s->buffer_r) { granular_destroy(); return -1; }

    s->write_pos = 0;
    s->freeze = 0;
    s->freeze_with_feedback = 0;
    s->enabled = 1;
    s->dry_wet = 0.3f;
    s->feedback = 0.1f;
    s->feedback_lpf_coeff = 0.7f;
    s->grain_shape = KESSHO_GRAIN_SHAPE_TRIANGLE;
    s->bus_diffusion = 0.0f;
    s->timing_randomness = 0.35f;
    s->total_active_grains = 0;
    memset(s->active_grain_counts, 0, sizeof(s->active_grain_counts));
    s->silent_samples = 0;
    // Start initialized=1 so granular works immediately with fallback LCG.
    // If granular_set_random_sequence is called later, it replaces the LCG.
    s->initialized = 1;
    s->random_seq = nullptr;
    s->random_len = 0;
    s->random_idx = 0;
    s->rng_seed = 12345; // fallback LCG seed
    s->scale_count = 0;
    s->chord_count = 0;
    s->chord_bias = 0.0f;

    // Feedback filters
    memset(&s->fb_hpf_l, 0, sizeof(OnePoleHPF));
    memset(&s->fb_hpf_r, 0, sizeof(OnePoleHPF));
    memset(&s->fb_lpf_l, 0, sizeof(OnePoleLPF));
    memset(&s->fb_lpf_r, 0, sizeof(OnePoleLPF));
    s->fb_rms = 0.0f;

    // Legacy defaults
    s->legacy.jitter = 10.0f;
    s->legacy.probability = 0.8f;
    s->legacy.pitch_mode = KESSHO_PITCH_HARMONIC;
    s->legacy.pitch_spread = 2.0f;
    s->legacy.feedback = 0.1f;

    // Per-voice init
    for (int v = 0; v < KESSHO_NUM_VOICES; v++) {
        VoiceParams* vp = &s->voice[v];
        vp->enabled = (v == 0) ? 1 : 0;
        vp->mode = KESSHO_MODE_GRANULAR;
        vp->slice = v * 4;
        vp->speed = 1.0f;
        vp->scan_rate = 1.0f;
        vp->reverse = 0;
        vp->pitch = 0.0f;
        vp->attack = 0.003f;
        vp->decay = 0.5f;
        vp->blur = 0.0f;
        vp->grain_oct = 0.0f;
        vp->spray = 0.3f;
        vp->density = 20.0f;
        vp->grain_size = 80.0f;
        vp->pan = 0.0f;
        vp->gain = 0.5f;
        vp->pos_lfo_rate = 0.0f;
        vp->pos_lfo_depth = 0.0f;
        vp->pan_lfo_rate = 0.0f;
        vp->stereo_spread = 0.5f;
        vp->reverse_lfo_rate = 0.0f;
        vp->write_follow = 0.0f;
        vp->record_lfo_rate = 0.0f;
        vp->euclid_gated = 0;
        vp->euclid_muted = 0;

        // Grain pools
        memset(s->grain_pool[v], 0, sizeof(Grain) * KESSHO_MAX_GRAINS);
        for (int g = 0; g < KESSHO_MAX_GRAINS; g++) {
            s->grain_pool[v][g].active_list_pos = -1;
        }

        // Scheduling
        s->samples_since_grain[v] = 0;
        s->samples_per_grain[v] = (int)(sample_rate / 20.0f);
        s->samples_until_grain[v] = s->samples_per_grain[v];
        s->trig_density_mult[v] = 1.0f;
        s->clean_read_pos[v] = 0.0f;

        // Trigger envelope
        s->trig_env_phase[v] = -1;
        s->trig_env_velocity[v] = 1.0f;
        s->trig_env_atk_cache[v] = 1.0f;
        s->trig_env_dec_cache[v] = 1.0f;

        s->last_grain_pos[v] = 0.0f;

        // Euclidean overrides
        s->euclid_slice_override[v] = -1;
        s->euclid_pitch_override[v] = 0.0f;
        s->euclid_pitch_active[v] = 0;
        s->euclid_reverse_override[v] = 0;
        s->euclid_reverse_active[v] = 0;

        // Allpass diffuser
        diffuser_init(&s->diffuser[v], sample_rate);

        // LFOs — staggered phases
        lfo_init(&s->pos_lfo[v]);
        s->pos_lfo[v].phase = (float)v * 0.25f;
        lfo_init(&s->pan_lfo[v]);
        s->pan_lfo[v].phase = (float)v * 0.17f + 0.1f;
        lfo_init(&s->reverse_lfo[v]);
        s->reverse_lfo[v].phase = (float)v * 0.31f;
        lfo_init(&s->record_lfo[v]);
        s->record_lfo[v].phase = (float)v * 0.23f + 0.05f;

        // Anti-alias filters (3-stage cascade for 36 dB/oct)
        biquad_reset(&s->anti_alias_l[v]);
        biquad_reset(&s->anti_alias_r[v]);
        biquad_reset(&s->anti_alias2_l[v]);
        biquad_reset(&s->anti_alias2_r[v]);
        biquad_reset(&s->anti_alias3_l[v]);
        biquad_reset(&s->anti_alias3_r[v]);

        // DC blocking filters
        memset(&s->dc_block_l[v], 0, sizeof(OnePoleHPF));
        memset(&s->dc_block_r[v], 0, sizeof(OnePoleHPF));

        // Scan state
        memset(&s->scan[v], 0, sizeof(ScanState));
    }

    diffuser_init(&s->bus_diffuser, sample_rate);
    s->bus_smooth_l = 0.0f;
    s->bus_smooth_r = 0.0f;

    // Unfreeze crossfade
    s->prev_freeze = 0;
    s->unfreeze_fade = 0;

    // ── Pre-compute LUTs ──

    // Hann window
    for (int i = 0; i < KESSHO_HANN_TABLE_SIZE; i++) {
        float phase = (float)i / (float)(KESSHO_HANN_TABLE_SIZE - 1);
        s->hann_table[i] = 0.5f * (1.0f - cosf(2.0f * (float)M_PI * phase));
    }

    // Pan tables (constant power)
    for (int i = 0; i < KESSHO_PAN_TABLE_SIZE; i++) {
        float pan = (float)i / (float)(KESSHO_PAN_TABLE_SIZE - 1) * 2.0f - 1.0f;
        float angle = (pan + 1.0f) * 0.25f * (float)M_PI;
        s->pan_table_l[i] = cosf(angle);
        s->pan_table_r[i] = sinf(angle);
    }

    // Crossfade tables (cos/sin)
    for (int i = 0; i <= KESSHO_XFADE_TABLE_SIZE; i++) {
        float angle = (float)i / (float)KESSHO_XFADE_TABLE_SIZE * 1.5707963f; // π/2
        s->xfade_table_a[i] = cosf(angle);
        s->xfade_table_b[i] = sinf(angle);
    }

    // Gain compensation: 1/sqrt(n)
    s->gain_comp_table[0] = 1.0f;
    s->gain_comp_table[1] = 1.0f;
    for (int i = 2; i <= KESSHO_MAX_GRAINS; i++) {
        s->gain_comp_table[i] = 1.0f / sqrtf((float)i);
    }

    // Windowed sinc interpolation LUT (Kaiser window, beta=6.5)
    {
        const float beta = 6.5f;
        const int half = KESSHO_SINC_TAPS / 2;
        // Compute I0(beta) for Kaiser window normalization
        auto bessel_i0 = [](float x) -> float {
            float sum = 1.0f;
            float term = 1.0f;
            for (int k = 1; k < 20; k++) {
                term *= (x / (2.0f * (float)k)) * (x / (2.0f * (float)k));
                sum += term;
                if (term < 1e-10f) break;
            }
            return sum;
        };
        float i0_beta = bessel_i0(beta);

        for (int fi = 0; fi < KESSHO_SINC_OVERSAMPLING; fi++) {
            float frac = (float)fi / (float)KESSHO_SINC_OVERSAMPLING;
            float* kernel = &s->sinc_table[fi * KESSHO_SINC_TAPS];
            float norm = 0.0f;
            for (int t = 0; t < KESSHO_SINC_TAPS; t++) {
                float n = (float)(t - half + 1) - frac;
                // Sinc value
                float sinc_val;
                if (fabsf(n) < 1e-6f) {
                    sinc_val = 1.0f;
                } else {
                    float pn = (float)M_PI * n;
                    sinc_val = sinf(pn) / pn;
                }
                // Kaiser window
                float w_arg = 2.0f * (float)(t) / (float)(KESSHO_SINC_TAPS - 1) - 1.0f;
                float kaiser = bessel_i0(beta * sqrtf(1.0f - w_arg * w_arg)) / i0_beta;
                kernel[t] = sinc_val * kaiser;
                norm += kernel[t];
            }
            // Normalize kernel so taps sum to 1.0
            if (fabsf(norm) > 1e-8f) {
                for (int t = 0; t < KESSHO_SINC_TAPS; t++) {
                    kernel[t] /= norm;
                }
            }
        }
    }

    return 0;
}

void granular_destroy(void) {
    if (!g_state) return;
    GranularState* s = g_state;

    free(s->buffer_l);
    free(s->buffer_r);
    free(s->random_seq);

    for (int v = 0; v < KESSHO_NUM_VOICES; v++) {
        diffuser_destroy(&s->diffuser[v]);
    }
    diffuser_destroy(&s->bus_diffuser);

    free(s);
    g_state = nullptr;
}

float* granular_get_input_ptr(void) {
    return g_state ? g_state->input_buf : nullptr;
}

float* granular_get_output_ptr(void) {
    return g_state ? g_state->output_buf : nullptr;
}

void granular_process_block(int block_size) {
    if (!g_state || block_size <= 0 || block_size > KESSHO_MAX_BLOCK_SIZE) return;
    process_block_internal(g_state, block_size);
}

void granular_set_enabled(int enabled) {
    if (g_state) g_state->enabled = enabled;
}

void granular_set_freeze(int frozen, int with_feedback) {
    if (!g_state) return;
    g_state->freeze = frozen;
    g_state->freeze_with_feedback = with_feedback;
}

void granular_set_dry_wet(float level) {
    if (g_state) g_state->dry_wet = clampf(level, 0.0f, 1.0f);
}

void granular_set_feedback(float amount, float lpf_hz) {
    if (!g_state) return;
    g_state->feedback = clampf(amount, 0.0f, 0.85f);
    // Match JS: feedbackLPFCoeff = 1 - exp(-2*pi*fc/sr)
    // In lpf_process: z1 = input*(1-coeff) + z1*coeff
    // NOTE: Coefficient is semantically inverted from a standard LPF (higher fc = more filtering)
    // but this gives the expected behavior for the feedback filter control.
    float coeff = expf(-2.0f * (float)M_PI * lpf_hz / g_state->sample_rate);
    g_state->feedback_lpf_coeff = 1.0f - coeff;
}

void granular_set_bus_diffusion(float amount) {
    if (!g_state) return;
    g_state->bus_diffusion = clampf(amount, 0.0f, 1.0f);
    g_state->bus_diffuser.g = 0.12f + g_state->bus_diffusion * 0.42f;
}

void granular_set_timing_randomness(float amount) {
    if (!g_state) return;
    g_state->timing_randomness = clampf(amount, 0.0f, 1.0f);
}

void granular_set_scale(const int* intervals, int count) {
    if (!g_state) return;
    g_state->scale_count = clampi(count, 0, KESSHO_MAX_SCALE_INTERVALS);
    for (int i = 0; i < g_state->scale_count; i++) {
        g_state->scale_intervals[i] = intervals[i];
    }
}

void granular_set_chord_bias(const int* pitches, int count, float bias) {
    if (!g_state) return;
    g_state->chord_count = clampi(count, 0, KESSHO_MAX_CHORD_PITCHES);
    for (int i = 0; i < g_state->chord_count; i++) {
        g_state->chord_pitches[i] = pitches[i];
    }
    g_state->chord_bias = clampf(bias, 0.0f, 1.0f);
}

void granular_set_buffer_size(float buffer_seconds) {
    if (!g_state) return;
    GranularState* s = g_state;
    int new_size = (int)(buffer_seconds * s->sample_rate);
    if (new_size == s->buffer_size) return;

    float* new_l = (float*)calloc(new_size, sizeof(float));
    float* new_r = (float*)calloc(new_size, sizeof(float));
    if (!new_l || !new_r) { free(new_l); free(new_r); return; }

    int copy_len = s->buffer_size < new_size ? s->buffer_size : new_size;
    memcpy(new_l, s->buffer_l, copy_len * sizeof(float));
    memcpy(new_r, s->buffer_r, copy_len * sizeof(float));

    free(s->buffer_l);
    free(s->buffer_r);
    s->buffer_l = new_l;
    s->buffer_r = new_r;
    s->buffer_size = new_size;
    if (s->write_pos >= new_size) s->write_pos = 0;

    // Clamp active grain positions to the new buffer range
    for (int v = 0; v < KESSHO_NUM_VOICES; v++) {
        for (int g = 0; g < KESSHO_MAX_GRAINS; g++) {
            Grain* gr = &s->grain_pool[v][g];
            if (gr->active && gr->position >= (float)new_size) {
                gr->position = fmodf(gr->position, (float)new_size);
            }
        }
        // Clamp clean-mode read positions
        if (s->clean_read_pos[v] >= (float)new_size) {
            s->clean_read_pos[v] = fmodf(s->clean_read_pos[v], (float)new_size);
        }
        // Clamp scan heads
        if (s->scan[v].head_a >= (float)new_size) s->scan[v].head_a = fmodf(s->scan[v].head_a, (float)new_size);
        if (s->scan[v].head_b >= (float)new_size) s->scan[v].head_b = fmodf(s->scan[v].head_b, (float)new_size);
    }
}

void granular_set_grain_shape(int shape) {
    if (!g_state) return;
    g_state->grain_shape = clampi(shape, KESSHO_GRAIN_SHAPE_TRIANGLE, KESSHO_GRAIN_SHAPE_SQUARE);
}

void granular_set_voice_mode(int voice, int enabled, int mode) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    g_state->voice[voice].enabled = enabled;
    g_state->voice[voice].mode = mode;
}

void granular_set_voice_position(int voice, int slice, float speed, float scan_rate,
                                int reverse, float pitch, float write_follow) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    VoiceParams* vp = &g_state->voice[voice];
    vp->slice = clampi(slice, 0, KESSHO_NUM_SLICES - 1);
    vp->speed = speed;
    vp->scan_rate = clampf(scan_rate, 0.25f, 4.0f);
    vp->reverse = reverse;
    vp->pitch = pitch;
    vp->write_follow = clampf(write_follow, 0.0f, 1.0f);
}

void granular_set_voice_grain(int voice, float density, float grain_size,
                             float spray, float grain_oct,
                             float attack, float decay) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    VoiceParams* vp = &g_state->voice[voice];
    int previousSamplesPerGrain = g_state->samples_per_grain[voice];
    if (previousSamplesPerGrain < 1) previousSamplesPerGrain = 1;
    int previousSince = g_state->samples_since_grain[voice];
    int previousUntil = g_state->samples_until_grain[voice];
    int previousInterval = previousSince + previousUntil;

    vp->density = density;
    vp->grain_size = grain_size;
    vp->spray = clampf(spray, 0.0f, 1.0f);
    vp->grain_oct = clampf(grain_oct, 0.0f, 1.0f);
    vp->attack = attack;
    vp->decay = decay;
    // Update samples-per-grain, but preserve the current scheduler phase so
    // rapid parameter drags do not keep restarting the next-grain countdown.
    int newSamplesPerGrain = (int)(g_state->sample_rate / (density > 0.0f ? density : 20.0f));
    if (newSamplesPerGrain < 1) newSamplesPerGrain = 1;
    g_state->samples_per_grain[voice] = newSamplesPerGrain;

    if (!g_state->initialized || previousInterval <= 0) {
        g_state->samples_since_grain[voice] = 0;
        g_state->samples_until_grain[voice] = compute_next_grain_interval(g_state, voice);
        return;
    }

    float intervalScale = (float)newSamplesPerGrain / (float)previousSamplesPerGrain;
    int newInterval = (int)roundf((float)previousInterval * intervalScale);
    if (newInterval < 1) newInterval = 1;

    float progressRatio = (float)previousSince / (float)previousInterval;
    if (progressRatio < 0.0f) progressRatio = 0.0f;
    if (progressRatio > 1.0f) progressRatio = 1.0f;

    int newSince = (int)roundf((float)newInterval * progressRatio);
    if (newSince < 0) newSince = 0;
    if (newSince >= newInterval) newSince = newInterval - 1;

    int newUntil = newInterval - newSince;
    if (newUntil < 1) newUntil = 1;

    g_state->samples_since_grain[voice] = newSince;
    g_state->samples_until_grain[voice] = newUntil;
}

void granular_set_voice_output(int voice, float gain, float pan,
                              float blur, float stereo_spread) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    VoiceParams* vp = &g_state->voice[voice];
    vp->gain = clampf(gain, 0.0f, 1.0f);
    vp->pan = clampf(pan, -1.0f, 1.0f);
    vp->blur = clampf(blur, 0.0f, 1.0f);
    vp->stereo_spread = clampf(stereo_spread, 0.0f, 1.0f);
    // Update diffuser coefficient
    g_state->diffuser[voice].g = blur * 0.5f;
}

void granular_set_voice_lfo(int voice, float pos_rate, float pos_depth,
                           float pan_rate, float reverse_rate, float record_rate) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    VoiceParams* vp = &g_state->voice[voice];
    vp->pos_lfo_rate = pos_rate;
    vp->pos_lfo_depth = pos_depth;
    vp->pan_lfo_rate = pan_rate;
    vp->reverse_lfo_rate = reverse_rate;
    vp->record_lfo_rate = record_rate;
    // Update LFO rates
    lfo_set_rate(&g_state->pos_lfo[voice], pos_rate);
    lfo_set_rate(&g_state->pan_lfo[voice], pan_rate);
    lfo_set_rate(&g_state->reverse_lfo[voice], reverse_rate);
    lfo_set_rate(&g_state->record_lfo[voice], record_rate);
}

void granular_set_voice_euclid_gated(int voice, int gated) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    g_state->voice[voice].euclid_gated = gated;
}

void granular_set_voice_euclid_muted(int voice, int muted) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    g_state->voice[voice].euclid_muted = muted;
}

// Note: max_grains parameter is accepted but unused (kept for WASM ABI compatibility)
void granular_set_legacy_params(float jitter, float probability, int pitch_mode,
                               float pitch_spread, int max_grains, float feedback) {
    if (!g_state) return;
    g_state->legacy.jitter = jitter;
    g_state->legacy.probability = clampf(probability, 0.0f, 1.0f);
    g_state->legacy.pitch_mode = pitch_mode;
    g_state->legacy.pitch_spread = pitch_spread;
    g_state->legacy.feedback = clampf(feedback, 0.0f, 0.35f);
}

void granular_euclid_trigger(int voice, float velocity, int slice_override,
                            float pitch_override, int has_pitch,
                            int reverse_override, int has_reverse) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    GranularState* s = g_state;

    s->trig_env_phase[voice] = 0;
    s->trig_env_velocity[voice] = velocity;
    s->trig_env_atk_cache[voice] = fmaxf(1.0f, s->voice[voice].attack * s->sample_rate);
    s->trig_env_dec_cache[voice] = fmaxf(1.0f, s->voice[voice].decay * s->sample_rate);

    if (slice_override >= 0) {
        s->euclid_slice_override[voice] = slice_override;
    }
    if (has_pitch) {
        s->euclid_pitch_override[voice] = pitch_override;
        s->euclid_pitch_active[voice] = 1;
    } else {
        s->euclid_pitch_active[voice] = 0;
    }
    if (has_reverse) {
        s->euclid_reverse_override[voice] = reverse_override;
        s->euclid_reverse_active[voice] = 1;
    } else {
        s->euclid_reverse_active[voice] = 0;
    }

    // Clean mode: restart read position
    if (s->voice[voice].mode == KESSHO_MODE_CLEAN) {
        s->clean_read_pos[voice] = 0.0f;
    }
    // Granular mode: force immediate spawn + density burst
    if (s->voice[voice].mode == KESSHO_MODE_GRANULAR) {
        s->samples_since_grain[voice] = s->samples_per_grain[voice];
        s->samples_until_grain[voice] = 0;
        float cappedVelocity = clampf(velocity, 0.0f, 1.0f);
        float voiceDensity = clampf(s->voice[voice].density, 1.0f, 64.0f);
        float densityNormalized = (voiceDensity - 1.0f) / 63.0f;
        float burstHeadroom = 1.0f - densityNormalized * 0.65f;
        if (burstHeadroom < 0.2f) burstHeadroom = 0.2f;
        s->trig_density_mult[voice] = 1.0f + 1.35f * cappedVelocity * burstHeadroom;
    }
}

void granular_set_random_sequence(const float* data, int count) {
    if (!g_state) return;
    free(g_state->random_seq);
    if (count > 0 && data) {
        g_state->random_seq = (float*)malloc(count * sizeof(float));
        if (g_state->random_seq) {
            memcpy(g_state->random_seq, data, count * sizeof(float));
            g_state->random_len = count;
            g_state->random_idx = 0;
            g_state->initialized = 1;
        }
    } else {
        g_state->random_seq = nullptr;
        g_state->random_len = 0;
    }
}

float granular_get_write_head(void) {
    if (!g_state || g_state->buffer_size == 0) return 0.0f;
    return (float)g_state->write_pos / (float)g_state->buffer_size;
}

void granular_get_voice_positions(float* out) {
    if (!g_state || !out || g_state->buffer_size == 0) return;
    for (int v = 0; v < KESSHO_NUM_VOICES; v++) {
        if (g_state->voice[v].mode == KESSHO_MODE_CLEAN) {
            float speed = g_state->voice[v].speed;
            if (speed == 0.0f) {
                // Use LFO target position for smooth visualization (avoids dual-head crossfade snap)
                float t = fmodf(g_state->scan_lfo_target[v], (float)g_state->buffer_size);
                if (t < 0.0f) t += (float)g_state->buffer_size;
                out[v] = t / (float)g_state->buffer_size;
            } else {
                int slice = g_state->euclid_slice_override[v] >= 0
                    ? g_state->euclid_slice_override[v]
                    : g_state->voice[v].slice;
                int slice_start = get_slice_start(g_state, slice);
                out[v] = fmodf((float)slice_start + g_state->clean_read_pos[v], (float)g_state->buffer_size) / (float)g_state->buffer_size;
            }
        } else {
            out[v] = g_state->last_grain_pos[v] / (float)g_state->buffer_size;
        }
    }
}

int granular_get_active_grain_count(void) {
    return g_state ? g_state->total_active_grains : 0;
}

float* granular_get_buffer_ptr_l(void) {
    return g_state ? g_state->buffer_l : nullptr;
}

int granular_get_buffer_size(void) {
    return g_state ? g_state->buffer_size : 0;
}
