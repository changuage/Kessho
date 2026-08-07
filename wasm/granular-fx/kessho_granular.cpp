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
#include <new>

#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

enum CloudPitchMode {
    CLOUD_PITCH_FIXED = 0,
    CLOUD_PITCH_OCTAVES = 1,
    CLOUD_PITCH_FIFTHS = 2,
    CLOUD_PITCH_CHORD = 3,
    CLOUD_PITCH_SCALE = 4,
    CLOUD_PITCH_FREE = 5,
};

enum CloudStyle {
    CLOUD_STYLE_CLASSIC = 0,
    CLOUD_STYLE_MOSAIC = 1,
    CLOUD_STYLE_BLOOM = 2,
    CLOUD_STYLE_TIDE = 3,
    CLOUD_STYLE_ORBIT = 4,
    CLOUD_STYLE_STARS = 5,
};

static constexpr int kOctavePalette[] = {0, 12, -12, 24};
static constexpr int kFifthsPalette[] = {0, 7, 12, -5, 19};
static constexpr float kStarsAnchors[] = {0.10f, 0.30f, 0.50f, 0.70f, 0.90f};

// ═══════════════ Internal Structures ═══════════════

struct Grain {
    float position;      // read position in buffer (fractional samples)
    float playback_rate; // pitch shift rate (negative = reverse)
    float playback_rate_step;
    float pitch_semi_start;
    float pitch_semi_end;
    float tide_phase;
    float tide_depth;
    float pan;           // -1 to 1
    float pan_l;         // cached constant-power gain at grain spawn
    float pan_r;         // cached constant-power gain at grain spawn
    float gain;          // per-grain scalar for bloom ghosts
    int   start_sample;  // samples elapsed since grain start
    int   length;        // grain length in samples
    int   attack_smp;    // rise time in samples
    int   decay_smp;     // fall time in samples
    int   active;        // 0 or 1
    int   active_list_pos; // slot inside per-voice active grain index list
    int   is_ghost;
    int   cloud_style;
    int   visual_flags;
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
    float position_spray;
    float timing_spray;
    float lookback;
    float write_guard;
    int   pitch_mode;
    float pitch_spread;
    float pitch_jitter_cents;
    float pitch_quantize;
    float reverse_chance;
    float bloom;
    float glide;
    int   cloud_style;
    int   anchor_pattern;
    float loop_crossfade_ms;
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
    int    quality;
    int    max_total_grains_user;
    float  spray_macro;
    float  cloud_macro;
    float  pitch_macro;

    // Per-voice
    VoiceParams voice[KESSHO_NUM_VOICES];
    Grain       grain_pool[KESSHO_NUM_VOICES][KESSHO_MAX_GRAINS];
    int         active_grain_indices[KESSHO_NUM_VOICES][KESSHO_MAX_GRAINS];
    int         active_grain_counts[KESSHO_NUM_VOICES];
    int         next_free_hint[KESSHO_NUM_VOICES];
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
    float clean_pan_lfo_value[KESSHO_NUM_VOICES];
    float clean_pos_lfo_value[KESSHO_NUM_VOICES];
    int   clean_lfo_counter[KESSHO_NUM_VOICES];

    // Per-voice LFO scan target position (for smooth UI visualization)
    float scan_lfo_target[KESSHO_NUM_VOICES];

    // Per-voice Euclidean trigger envelope
    int   trig_env_phase[KESSHO_NUM_VOICES];    // -1 = no active envelope
    float trig_env_velocity[KESSHO_NUM_VOICES];
    float trig_env_atk_cache[KESSHO_NUM_VOICES]; // samples
    float trig_env_dec_cache[KESSHO_NUM_VOICES]; // samples

    // Per-voice representative grain position
    float last_grain_pos[KESSHO_NUM_VOICES];
    int   anchor_step[KESSHO_NUM_VOICES];

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

    KesshoGranularVisualEvent visual_events[KESSHO_GRANULAR_VISUAL_EVENT_CAPACITY];
    uint32_t visual_event_write;
    uint32_t visual_event_read_shadow;

};

// Legacy callers use the default state. KesshoCore wrappers scope this slot to
// an instance-owned state pointer without changing the existing C API symbols.
static GranularState* g_default_state = nullptr;
static thread_local GranularState** g_state_slot = &g_default_state;

static inline GranularState*& granular_current_state() {
    return *g_state_slot;
}

class ScopedGranularState {
public:
    explicit ScopedGranularState(GranularState*& state)
        : previous_(g_state_slot) {
        g_state_slot = &state;
    }

    ~ScopedGranularState() {
        g_state_slot = previous_;
    }

    ScopedGranularState(const ScopedGranularState&) = delete;
    ScopedGranularState& operator=(const ScopedGranularState&) = delete;

private:
    GranularState** previous_;
};

#define g_state granular_current_state()

struct KesshoGranularInstance {
    GranularState* state;
};

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

static inline int wrap_index(int idx, int size) {
    if (idx >= size) idx -= size;
    else if (idx < 0) idx += size;
    return idx;
}

static inline int wrap_index_any(int idx, int size) {
    if (idx >= size || idx < 0) {
        idx %= size;
        if (idx < 0) idx += size;
    }
    return idx;
}

static inline float wrap_position(float pos, float size_f) {
    if (pos >= size_f) {
        pos -= size_f;
        if (pos >= size_f) pos = fmodf(pos, size_f);
    } else if (pos < 0.0f) {
        pos += size_f;
        if (pos < 0.0f) {
            pos = fmodf(pos, size_f);
            if (pos < 0.0f) pos += size_f;
        }
    }
    return pos;
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

static float lfo_tick_stride(TriLFO* lfo, float sr, float sample_stride) {
    if (lfo->rate <= 0.0f) return 0.0f;
    lfo->phase += (lfo->rate * sample_stride) / sr;
    if (lfo->phase >= 1.0f) {
        lfo->phase = fmodf(lfo->phase, 1.0f);
    }

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
    int rp = wrap_index(*write_pos - delay_size + size, size);
    float delayed = buf[rp];
    float v = input - delayed * g;
    buf[*write_pos] = sanitize(v);
    float out = delayed + v * g;
    int next_write = *write_pos + 1;
    if (next_write >= size) next_write = 0;
    *write_pos = next_write;
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

/** 8-point Kaiser-windowed sinc interpolation — higher fidelity than cubic. */
static inline float read_buffer_sinc(const GranularState* s, const float* buf, int size, float position) {
    float pos = wrap_position(position, (float)size);
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

static inline float read_buffer_linear(const float* buf, int size, float position) {
    float pos = wrap_position(position, (float)size);
    int i0 = (int)pos;
    int i1 = i0 + 1;
    if (i1 >= size) i1 -= size;
    float frac = pos - (float)i0;
    return buf[i0] + (buf[i1] - buf[i0]) * frac;
}

static inline float read_buffer_cubic(const float* buf, int size, float position) {
    float pos = wrap_position(position, (float)size);
    int i1 = (int)pos;
    float t = pos - (float)i1;
    int i0 = i1 - 1; if (i0 < 0) i0 += size;
    int i2 = i1 + 1; if (i2 >= size) i2 -= size;
    int i3 = i1 + 2; if (i3 >= size) i3 -= size;
    const float y0 = buf[i0];
    const float y1 = buf[i1];
    const float y2 = buf[i2];
    const float y3 = buf[i3];
    const float c0 = y1;
    const float c1 = 0.5f * (y2 - y0);
    const float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
    const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
    return ((c3 * t + c2) * t + c1) * t + c0;
}

static inline float read_buffer_quality(const GranularState* s, const float* buf, int size, float position, float abs_rate) {
    if (s->quality <= 0) {
        return abs_rate < 1.20f ? read_buffer_linear(buf, size, position)
                                : read_buffer_cubic(buf, size, position);
    }
    if (s->quality == 1) {
        return abs_rate < 1.70f ? read_buffer_cubic(buf, size, position)
                                : read_buffer_sinc(s, buf, size, position);
    }
    return read_buffer_sinc(s, buf, size, position);
}

static inline int anti_alias_stage_count_for_rate(const GranularState* s, float abs_rate) {
    if (s->quality <= 0) return abs_rate > 1.70f ? 1 : 0;
    if (s->quality == 1) {
        if (abs_rate <= 1.10f) return 0;
        return abs_rate <= 1.85f ? 1 : 2;
    }
    if (abs_rate <= 1.05f) return 0;
    return abs_rate <= 1.60f ? 2 : 3;
}

static inline float process_aa_stages(float sample, int stage_count, BiquadFilter* a, BiquadFilter* b, BiquadFilter* c) {
    if (stage_count <= 0) return sample;
    sample = biquad_process(a, sample);
    if (stage_count <= 1) return sample;
    sample = biquad_process(b, sample);
    if (stage_count <= 2) return sample;
    return biquad_process(c, sample);
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
    s->random_idx++;
    if (s->random_idx >= s->random_len) s->random_idx = 0;
    return v;
}

static float choose_cloud_pitch(GranularState* s, const VoiceParams* vp, float base_pitch) {
    const float pitch_macro = clampf(s->pitch_macro, 0.0f, 1.0f);
    const float spread = clampf(vp->pitch_spread + pitch_macro * 12.0f, 0.0f, 24.0f);
    const float jitter_cents = clampf(vp->pitch_jitter_cents + pitch_macro * 8.0f, 0.0f, 50.0f);
    const float jitter_st = ((next_random(s) - 0.5f) * 2.0f) * (jitter_cents / 100.0f);
    float offset = 0.0f;

    switch (vp->pitch_mode) {
        case CLOUD_PITCH_OCTAVES: {
            const int count = spread >= 18.0f ? 4 : (spread >= 9.0f ? 3 : 2);
            offset = (float)kOctavePalette[(int)(next_random(s) * (float)count) % count];
            break;
        }
        case CLOUD_PITCH_FIFTHS: {
            const int count = spread >= 16.0f ? 5 : (spread >= 8.0f ? 4 : 2);
            offset = (float)kFifthsPalette[(int)(next_random(s) * (float)count) % count];
            break;
        }
        case CLOUD_PITCH_CHORD:
            if (s->chord_count > 0) {
                const int idx = (int)(next_random(s) * (float)s->chord_count) % s->chord_count;
                offset = (float)s->chord_pitches[idx];
            }
            break;
        case CLOUD_PITCH_SCALE:
            if (s->scale_count > 0) {
                const int idx = (int)(next_random(s) * (float)s->scale_count) % s->scale_count;
                offset = (float)s->scale_intervals[idx];
                if (next_random(s) < spread / 24.0f) offset += next_random(s) < 0.5f ? 12.0f : -12.0f;
            }
            break;
        case CLOUD_PITCH_FREE:
            offset = ((next_random(s) - 0.5f) * 2.0f) * spread;
            break;
        case CLOUD_PITCH_FIXED:
        default:
            break;
    }

    const float raw = base_pitch + offset + jitter_st;
    const float quantized = quantize_pitch(s, raw);
    return raw + (quantized - raw) * clampf(vp->pitch_quantize, 0.0f, 1.0f);
}

static Grain* find_free_grain_using_hint(GranularState* s, int voice_idx, int* out_index) {
    Grain* pool = s->grain_pool[voice_idx];
    const int start = s->next_free_hint[voice_idx] & (KESSHO_MAX_GRAINS - 1);
    for (int n = 0; n < KESSHO_MAX_GRAINS; ++n) {
        const int i = (start + n) & (KESSHO_MAX_GRAINS - 1);
        if (!pool[i].active) {
            s->next_free_hint[voice_idx] = (i + 1) & (KESSHO_MAX_GRAINS - 1);
            if (out_index) *out_index = i;
            return &pool[i];
        }
    }
    if (out_index) *out_index = -1;
    return nullptr;
}

static int activate_grain(GranularState* s, int voice_idx, Grain* grain, int grain_index) {
    int active_count = s->active_grain_counts[voice_idx];
    if (active_count >= KESSHO_MAX_GRAINS) {
        grain->active = 0;
        grain->active_list_pos = -1;
        return 0;
    }
    s->active_grain_indices[voice_idx][active_count] = grain_index;
    grain->active_list_pos = active_count;
    s->active_grain_counts[voice_idx] = active_count + 1;
    s->total_active_grains++;
    return 1;
}

static inline void push_visual_event(GranularState* s, int voice_idx, const Grain* grain) {
    if (!s || !grain || s->buffer_size <= 0) return;
    KesshoGranularVisualEvent* event =
        &s->visual_events[s->visual_event_write % KESSHO_GRANULAR_VISUAL_EVENT_CAPACITY];
    event->position_norm = wrap_position(grain->position, (float)s->buffer_size) / (float)s->buffer_size;
    event->pan = grain->pan;
    event->pitch_semi = grain->pitch_semi_start;
    event->gain = grain->gain;
    event->length_ms = (float)grain->length * 1000.0f / s->sample_rate;
    event->voice = voice_idx;
    event->flags =
        (grain->is_ghost ? 1 : 0) |
        (grain->playback_rate < 0.0f ? 2 : 0) |
        (grain->cloud_style == CLOUD_STYLE_STARS ? 4 : 0) |
        (fabsf(grain->playback_rate_step) > 0.000001f ? 8 : 0);
    event->cloud_style = grain->cloud_style;
    s->visual_event_write++;
}

static void spawn_bloom_ghosts(GranularState* s, int voice_idx, const Grain* source, const VoiceParams* vp) {
    const int max_total_grains = clampi(s->max_total_grains_user, 1, KESSHO_MAX_TOTAL_GRAINS);
    if (s->total_active_grains >= max_total_grains) return;

    float bloom_amount = clampf(vp->bloom + s->cloud_macro * 0.35f, 0.0f, 1.0f);
    if (vp->cloud_style == CLOUD_STYLE_BLOOM) bloom_amount = clampf(bloom_amount + 0.30f, 0.0f, 1.0f);
    const int ghost_count = bloom_amount > 0.66f ? 2 : (bloom_amount > 0.08f ? 1 : 0);
    if (ghost_count <= 0) return;

    for (int ghost_num = 0; ghost_num < ghost_count && s->total_active_grains < max_total_grains; ++ghost_num) {
        int ghost_index = -1;
        Grain* ghost = find_free_grain_using_hint(s, voice_idx, &ghost_index);
        if (!ghost) return;

        *ghost = *source;
        ghost->active = 1;
        ghost->active_list_pos = -1;
        ghost->is_ghost = 1;
        ghost->visual_flags = source->visual_flags | 1;
        ghost->start_sample = -(int)((float)source->length * (0.15f + 0.10f * (float)ghost_num));
        ghost->length = clampi((int)((float)source->length * (0.68f + 0.10f * (float)ghost_num)), 1, source->length);
        ghost->position = wrap_position(
            source->position + source->playback_rate * (float)source->length * (0.18f + 0.13f * (float)ghost_num),
            (float)s->buffer_size);
        const float detune = (ghost_num == 0 ? 0.0045f : -0.0065f) * (0.45f + bloom_amount);
        ghost->playback_rate *= 1.0f + detune;
        ghost->playback_rate_step *= 0.65f;
        ghost->gain = (0.28f + bloom_amount * 0.18f) * (ghost_num == 0 ? 1.0f : 0.68f);
        ghost->pan = clampf(source->pan + (ghost_num == 0 ? 0.18f : -0.18f) * vp->stereo_spread, -1.0f, 1.0f);
        get_pan_lr(s, ghost->pan, &ghost->pan_l, &ghost->pan_r);

        if (!activate_grain(s, voice_idx, ghost, ghost_index)) return;
        push_visual_event(s, voice_idx, ghost);
    }
}

static inline float circular_delta(float from, float to, float size) {
    float delta = to - from;
    const float half = size * 0.5f;
    if (delta > half) delta -= size;
    else if (delta < -half) delta += size;
    return delta;
}

static inline float circular_blend_position(float from, float to, float amount, float size) {
    return wrap_position(from + circular_delta(from, to, size) * clampf(amount, 0.0f, 1.0f), size);
}

static inline float samples_behind_write_head(float write_pos, float read_pos, float size) {
    float age = write_pos - read_pos;
    if (age < 0.0f) age += size;
    if (age >= size) age = fmodf(age, size);
    return age;
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
    const VoiceParams* vp = &s->voice[voice_idx];
    const float global_spray = clampf(s->timing_randomness, 0.0f, 1.0f);
    const float voice_spray = clampf(vp->timing_spray, 0.0f, 1.0f);
    const float macro_spray = clampf(s->spray_macro, 0.0f, 1.0f);
    const float timing_spray = clampf(
        voice_spray * 0.70f + global_spray * 0.45f + macro_spray * 0.35f,
        0.0f,
        1.0f);
    float interval_scale = 1.0f;
    if (timing_spray > 0.001f) {
        const float rand = (next_random(s) - 0.5f) * 2.0f;
        const float spread = powf(timing_spray, 1.45f) * 0.78f;
        interval_scale = clampf(1.0f + rand * spread, 0.35f, 2.20f);
    }
    int next_interval = (int)(mean_interval * interval_scale);
    if (next_interval < 1) next_interval = 1;
    return next_interval;
}

// ═══════════════ Grain Spawning ═══════════════

static void spawn_grain(GranularState* s, int voice_idx) {
    VoiceParams* vp = &s->voice[voice_idx];

    const int max_total_grains = clampi(s->max_total_grains_user, 1, KESSHO_MAX_TOTAL_GRAINS);
    if (s->total_active_grains >= max_total_grains) return;

    int grain_index = -1;
    Grain* grain = find_free_grain_using_hint(s, voice_idx, &grain_index);
    if (!grain) return;

    float sr = s->sample_rate;
    int grain_samples = (int)(vp->grain_size / 1000.0f * sr);
    if (grain_samples < 1) grain_samples = 1;

    {
        // Granular mode
        int slice = s->euclid_slice_override[voice_idx] >= 0
            ? s->euclid_slice_override[voice_idx]
            : vp->slice;
        int slice_start = get_slice_start(s, slice);
        // Write follow + record LFO
        float base_wf = vp->write_follow;
        float write_follow = base_wf;
        if (vp->record_lfo_rate > 0.01f) {
            float rec_lfo_val = lfo_tick(&s->record_lfo[voice_idx], sr);
            float rec_gate = rec_lfo_val > 0.62f ? 1.0f : 0.0f;
            write_follow = base_wf + rec_gate * (1.0f - base_wf);
        }
        if (write_follow > 1.0f) write_follow = 1.0f;

        float pos_lfo_val = (lfo_tick(&s->pos_lfo[voice_idx], sr) - 0.5f) * 2.0f;
        float lfo_depth = vp->pos_lfo_depth;
        float lfo_offset = pos_lfo_val * lfo_depth * (float)s->buffer_size * 0.50f;

        const float buffer_size_f = (float)s->buffer_size;
        int slice_len = s->buffer_size / KESSHO_NUM_SLICES;
        const float position_spray = clampf(vp->position_spray + s->spray_macro * 0.18f, 0.0f, 1.0f);
        const float spray2 = position_spray * position_spray;
        const float spray_smooth = spray2 * (3.0f - 2.0f * position_spray);
        const float local_window = fmaxf((float)grain_samples * 3.0f, (float)slice_len * 0.35f);
        const float history_window = buffer_size_f * 0.92f;
        float spray_range = position_spray * (local_window + spray_smooth * (history_window - local_window));
        if (spray_range > history_window) spray_range = history_window;
        const float spray_offset = spray_range * (next_random(s) - 0.5f);

        const float lookback_norm = clampf(vp->lookback, 0.0f, 1.0f);
        const float min_lookback_s = 0.060f;
        const float max_lookback_s = fminf(8.0f, (float)s->buffer_size / sr * 0.92f);
        const float lookback_s = max_lookback_s > min_lookback_s
            ? expf(logf(min_lookback_s) + lookback_norm * logf(max_lookback_s / min_lookback_s))
            : min_lookback_s;
        const int lookback_samples = clampi((int)(lookback_s * sr), 1, (int)(buffer_size_f * 0.92f));

        float base_pos;
        if (write_follow > 0.01f) {
            int wh_pos = wrap_index_any(s->write_pos - lookback_samples, s->buffer_size);
            base_pos = circular_blend_position((float)slice_start, (float)wh_pos, write_follow, buffer_size_f);
        } else {
            base_pos = (float)slice_start;
        }
        if (vp->cloud_style == CLOUD_STYLE_STARS) {
            int idx = s->anchor_step[voice_idx] % 5;
            if (vp->anchor_pattern == 1) idx = 4 - idx;
            else if (vp->anchor_pattern == 2) {
                const int p = s->anchor_step[voice_idx] % 8;
                idx = p < 5 ? p : 8 - p;
            } else if (vp->anchor_pattern == 3) {
                idx = (int)(next_random(s) * 5.0f) % 5;
            }
            base_pos = kStarsAnchors[idx] * buffer_size_f;
            s->anchor_step[voice_idx]++;
        }

        grain->position = wrap_position(base_pos + lfo_offset + spray_offset, buffer_size_f);
        const float guard_norm = clampf(vp->write_guard, 0.0f, 1.0f);
        const float guard_ms = 15.0f + guard_norm * 105.0f;
        const float min_read_age = fmaxf((float)grain_samples * 0.75f, sr * guard_ms * 0.001f);
        float read_age = samples_behind_write_head((float)s->write_pos, grain->position, buffer_size_f);
        if (read_age < min_read_age) {
            grain->position = wrap_position(grain->position - (min_read_age - read_age), buffer_size_f);
        }
        s->last_grain_pos[voice_idx] = grain->position;

        // Pitch
        float pitch_semi = choose_cloud_pitch(s, vp, vp->pitch);
        if (s->euclid_pitch_active[voice_idx]) {
            pitch_semi += s->euclid_pitch_override[voice_idx];
        }
        if (vp->grain_oct > 0.0f && next_random(s) < vp->grain_oct * 0.45f) {
            pitch_semi += next_random(s) < 0.72f ? 12.0f : -12.0f;
        }
        float speed = vp->speed;

        // Reverse: manual XOR LFO XOR Euclidean
        float rev_lfo_val = lfo_tick(&s->reverse_lfo[voice_idx], sr);
        int lfo_reverse = rev_lfo_val > 0.5f ? 1 : 0;
        int is_reversed = vp->reverse != lfo_reverse;
        if (s->euclid_reverse_active[voice_idx]) {
            is_reversed = s->euclid_reverse_override[voice_idx] != is_reversed;
        }
        if (vp->reverse_chance > 0.001f && next_random(s) < vp->reverse_chance) {
            is_reversed = !is_reversed;
        }
        float direction = is_reversed ? -1.0f : 1.0f;
        if (vp->cloud_style == CLOUD_STYLE_ORBIT) {
            const float orbit = next_random(s);
            const float radius = clampf(vp->stereo_spread + s->cloud_macro * 0.20f, 0.0f, 1.0f);
            pitch_semi += cosf(orbit * 6.2831853f) * radius * 0.20f;
        }
        const float glide = clampf(vp->glide, 0.0f, 1.0f);
        grain->pitch_semi_start = pitch_semi;
        grain->pitch_semi_end = pitch_semi + ((next_random(s) - 0.5f) * 2.0f) * glide * 12.0f;
        grain->playback_rate = powf(2.0f, grain->pitch_semi_start / 12.0f) * speed * direction;
        const float end_rate = powf(2.0f, grain->pitch_semi_end / 12.0f) * speed * direction;
        grain->playback_rate_step = glide > 0.001f ? (end_rate - grain->playback_rate) / fmaxf(1.0f, (float)grain_samples) : 0.0f;

        // Pan: manual + LFO + spread
        float base_pan = vp->pan;
        float pan_lfo = (lfo_tick(&s->pan_lfo[voice_idx], sr) - 0.5f) * 2.0f;
        float pan_rate = vp->pan_lfo_rate;
        float spread = vp->stereo_spread;
        grain->pan = clampf(base_pan + pan_lfo * pan_rate * 0.5f
                             + (next_random(s) - 0.5f) * 2.0f * spread,
                             -1.0f, 1.0f);
        if (vp->cloud_style == CLOUD_STYLE_ORBIT) {
            const float orbit = next_random(s);
            const float radius = clampf(vp->stereo_spread + s->cloud_macro * 0.20f, 0.0f, 1.0f);
            grain->pan = clampf(vp->pan + sinf(orbit * 6.2831853f) * radius, -1.0f, 1.0f);
        }
        grain->tide_phase = next_random(s);
        grain->tide_depth = vp->cloud_style == CLOUD_STYLE_TIDE
            ? clampf(0.15f + vp->stereo_spread * 0.45f + s->cloud_macro * 0.20f, 0.0f, 0.80f)
            : 0.0f;
        grain->cloud_style = vp->cloud_style;
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
    grain->is_ghost = 0;
    grain->visual_flags = 0;
    grain->gain = 1.0f;
    grain->visual_flags =
        (grain->playback_rate < 0.0f ? 2 : 0) |
        (grain->cloud_style == CLOUD_STYLE_STARS ? 4 : 0) |
        (fabsf(grain->playback_rate_step) > 0.000001f ? 8 : 0);
    get_pan_lr(s, grain->pan, &grain->pan_l, &grain->pan_r);
    grain->active = 1;
    if (!activate_grain(s, voice_idx, grain, grain_index)) return;
    push_visual_event(s, voice_idx, grain);
    spawn_bloom_ghosts(s, voice_idx, grain, vp);
}

// ═══════════════ Clean Voice Processing ═══════════════

static inline int clean_lookback_samples_for_voice(const GranularState* s, const VoiceParams* vp) {
    const float lookback_norm = clampf(vp->lookback, 0.0f, 1.0f);
    const float min_lookback_s = 0.040f;
    const float max_lookback_s = fminf(8.0f, (float)s->buffer_size / s->sample_rate * 0.92f);
    const float lookback_s = max_lookback_s > min_lookback_s
        ? expf(logf(min_lookback_s) + lookback_norm * logf(max_lookback_s / min_lookback_s))
        : min_lookback_s;
    return clampi((int)(lookback_s * s->sample_rate), 1, (int)((float)s->buffer_size * 0.92f));
}

static inline void update_clean_control_lfo(GranularState* s, int v, float sr, float* pan_l, float* pan_r) {
    if ((s->clean_lfo_counter[v]++ & 15) != 0) return;
    VoiceParams* vp = &s->voice[v];
    s->clean_pos_lfo_value[v] = vp->pos_lfo_rate > 0.01f
        ? lfo_tick_stride(&s->pos_lfo[v], sr, 16.0f)
        : 0.0f;
    s->clean_pan_lfo_value[v] = vp->pan_lfo_rate > 0.01f
        ? lfo_tick_stride(&s->pan_lfo[v], sr, 16.0f)
        : 0.5f;

    const float pan_lfo_val = (s->clean_pan_lfo_value[v] - 0.5f) * 2.0f;
    const float mod_pan = clampf(vp->pan + pan_lfo_val * vp->pan_lfo_rate * 0.5f
                                 + vp->stereo_spread * ((v % 2 == 0) ? -0.3f : 0.3f),
                                 -1.0f, 1.0f);
    get_pan_lr(s, mod_pan, pan_l, pan_r);
}

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

    float pan_l = 0.0f, pan_r = 0.0f;
    const float initial_pan_lfo = vp->pan_lfo_rate > 0.01f
        ? (s->clean_pan_lfo_value[v] - 0.5f) * 2.0f
        : 0.0f;
    const float initial_pan = clampf(vp->pan + initial_pan_lfo * vp->pan_lfo_rate * 0.5f
                                     + vp->stereo_spread * ((v % 2 == 0) ? -0.3f : 0.3f),
                                     -1.0f, 1.0f);
    get_pan_lr(s, initial_pan, &pan_l, &pan_r);
    update_clean_control_lfo(s, v, sr, &pan_l, &pan_r);

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

    const float clean_abs_rate = fabsf(effective_rate);
    const int clean_aa_stage_count = anti_alias_stage_count_for_rate(s, clean_abs_rate);
    if (!is_lfo_scan) {
        float ar = clean_abs_rate;
        biquad_update(aa_l, ar);
        biquad_update(aa_r, ar);
        if (clean_aa_stage_count > 1) {
            biquad_update(aa2_l, ar);
            biquad_update(aa2_r, ar);
        }
        if (clean_aa_stage_count > 2) {
            biquad_update(aa3_l, ar);
            biquad_update(aa3_r, ar);
        }
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
        const int scan_aa_stage_count = anti_alias_stage_count_for_rate(s, abs_scan_rate);
        if (scan_aa_stage_count > 0) {
            biquad_update(aa_l, abs_scan_rate);
            biquad_update(aa_r, abs_scan_rate);
            if (scan_aa_stage_count > 1) {
                biquad_update(aa2_l, abs_scan_rate);
                biquad_update(aa2_r, abs_scan_rate);
            }
            if (scan_aa_stage_count > 2) {
                biquad_update(aa3_l, abs_scan_rate);
                biquad_update(aa3_r, abs_scan_rate);
            }
        }

        for (int i = 0; i < block_size; i++) {
            update_clean_control_lfo(s, v, sr, &pan_l, &pan_r);
            float env_gain = 1.0f;
            if (is_gated) {
                env_gain = trig_env_level(s, v);
                advance_trig_env(s, v);
                if (env_gain < 0.001f) continue;
            }

            float lfo_val = vp->pos_lfo_rate > 0.01f ? s->clean_pos_lfo_value[v] : 0.0f;
            float target_pos = wrap_position(lfo_val * lfo_depth * (float)s->buffer_size, (float)s->buffer_size);
            if (write_follow > 0.01f) {
                const int lookback_samples = clean_lookback_samples_for_voice(s, vp);
                float wp = (float)wrap_index_any(s->write_pos - lookback_samples, s->buffer_size);
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
            sc->head_a = wrap_position(sc->head_a + scan_adv, (float)s->buffer_size);
            sc->head_b = wrap_position(sc->head_b + scan_adv, (float)s->buffer_size);

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

            float sL = read_buffer_quality(s, s->buffer_l, s->buffer_size, sc->head_a, abs_scan_rate) * gain_a
                      + read_buffer_quality(s, s->buffer_l, s->buffer_size, sc->head_b, abs_scan_rate) * gain_b;
            float sR = read_buffer_quality(s, s->buffer_r, s->buffer_size, sc->head_a, abs_scan_rate) * gain_a
                      + read_buffer_quality(s, s->buffer_r, s->buffer_size, sc->head_b, abs_scan_rate) * gain_b;

            if (scan_aa_stage_count > 0) {
                sL = process_aa_stages(sL, scan_aa_stage_count, aa_l, aa2_l, aa3_l);
                sR = process_aa_stages(sR, scan_aa_stage_count, aa_r, aa2_r, aa3_r);
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
        update_clean_control_lfo(s, v, sr, &pan_l, &pan_r);
        float env_gain = 1.0f;
        if (is_gated) {
            env_gain = trig_env_level(s, v);
            advance_trig_env(s, v);
            if (env_gain < 0.001f) continue;
        }

        const float lfo_val = vp->pos_lfo_rate > 0.01f
            ? (s->clean_pos_lfo_value[v] - 0.5f) * 2.0f
            : 0.0f;
        float lfo_offset = lfo_val * lfo_depth * (float)s->buffer_size * 0.5f;
        int clean_pos_int = (int)s->clean_read_pos[v];
        if (clean_pos_int >= slice_len || clean_pos_int < 0) {
            clean_pos_int = wrap_index_any(clean_pos_int, slice_len);
        }
        float read_pos = wrap_position((float)slice_start + (float)clean_pos_int + lfo_offset,
                                       (float)s->buffer_size);

        float sL = read_buffer_quality(s, s->buffer_l, s->buffer_size, read_pos, clean_abs_rate);
        float sR = read_buffer_quality(s, s->buffer_r, s->buffer_size, read_pos, clean_abs_rate);

        if (clean_aa_stage_count > 0) {
            sL = process_aa_stages(sL, clean_aa_stage_count, aa_l, aa2_l, aa3_l);
            sR = process_aa_stages(sR, clean_aa_stage_count, aa_r, aa2_r, aa3_r);
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

        s->clean_read_pos[v] += effective_rate;
        s->clean_read_pos[v] = wrap_position(s->clean_read_pos[v], (float)slice_len);
    }
}

// ═══════════════ Granular Voice Processing ═══════════════

static void process_granular_voice(GranularState* s, int v, float* out_l, float* out_r, int block_size) {
    VoiceParams* vp = &s->voice[v];
    float gain = vp->gain;
    float blur = vp->blur;
    Grain* pool = s->grain_pool[v];
    int* active_indices = s->active_grain_indices[v];
    int is_gated = vp->euclid_gated;
    float euclidSchedulerThrottle = is_gated ? 0.42f : 1.0f;
    int active_grain_count = s->active_grain_counts[v];

    // Anti-alias: max absolute rate across active grains
    float max_abs_rate = 1.0f;
    for (int gi = 0; gi < active_grain_count; gi++) {
        Grain* grain = &pool[active_indices[gi]];
        float ar = fabsf(grain->playback_rate + grain->playback_rate_step * (float)grain->length * 0.5f);
        if (ar > max_abs_rate) max_abs_rate = ar;
    }
    BiquadFilter* aa_l  = &s->anti_alias_l[v];
    BiquadFilter* aa_r  = &s->anti_alias_r[v];
    BiquadFilter* aa2_l = &s->anti_alias2_l[v];
    BiquadFilter* aa2_r = &s->anti_alias2_r[v];
    BiquadFilter* aa3_l = &s->anti_alias3_l[v];
    BiquadFilter* aa3_r = &s->anti_alias3_r[v];
    const int aa_stage_count = anti_alias_stage_count_for_rate(s, max_abs_rate);
    biquad_update(aa_l, max_abs_rate);
    biquad_update(aa_r, max_abs_rate);
    if (aa_stage_count > 1) {
        biquad_update(aa2_l, max_abs_rate);
        biquad_update(aa2_r, max_abs_rate);
    }
    if (aa_stage_count > 2) {
        biquad_update(aa3_l, max_abs_rate);
        biquad_update(aa3_r, max_abs_rate);
    }
    const float buffer_size_f = (float)s->buffer_size;

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

            const float read_pos = grain->position;
            const float grain_abs_rate = fabsf(grain->playback_rate);
            float sL = read_buffer_quality(s, s->buffer_l, s->buffer_size, read_pos, grain_abs_rate);
            float sR = read_buffer_quality(s, s->buffer_r, s->buffer_size, read_pos, grain_abs_rate);

            float raw_env = grain_envelope(s, grain->start_sample, grain->length,
                                        grain->attack_smp, grain->decay_smp, s->grain_shape);
            if (grain->tide_depth > 0.001f) {
                const float phase = clampf((float)grain->start_sample / fmaxf(1.0f, (float)grain->length), 0.0f, 1.0f);
                const float tide = 1.0f - grain->tide_depth * 0.5f
                    + grain->tide_depth * (0.5f + 0.5f * sinf((phase + grain->tide_phase) * 6.2831853f));
                raw_env *= tide;
            }
            // One-pole envelope smoother — removes micro-discontinuities
            float env = grain->env_z1 + 0.005f * (raw_env - grain->env_z1);
            grain->env_z1 = env;

            wet_l += sL * env * grain->gain * grain->pan_l;
            wet_r += sR * env * grain->gain * grain->pan_r;

            grain->position = wrap_position(read_pos + grain->playback_rate, buffer_size_f);
            grain->playback_rate += grain->playback_rate_step;
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

        if (aa_stage_count > 0) {
            wet_l = process_aa_stages(wet_l, aa_stage_count, aa_l, aa2_l, aa3_l);
            wet_r = process_aa_stages(wet_r, aa_stage_count, aa_r, aa2_r, aa3_r);
        }

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

template <bool kPlanarIo>
static void process_block_internal(
    GranularState* s,
    int block_size,
    const float* planar_in_l,
    const float* planar_in_r,
    float* planar_out_l,
    float* planar_out_r) {
    float sr = s->sample_rate;
    float* in_buf = s->input_buf;
    float* out_buf = s->output_buf;

    if (!s->enabled) {
        if constexpr (kPlanarIo) {
            if (planar_out_l != planar_in_l) {
                memcpy(planar_out_l, planar_in_l, block_size * sizeof(float));
            }
            if (planar_out_r != planar_in_r) {
                memcpy(planar_out_r, planar_in_r, block_size * sizeof(float));
            }
        } else {
            // Pass-through: straight copy (compiler may auto-vectorize, but memcpy is optimal)
            memcpy(out_buf, in_buf, block_size * 2 * sizeof(float));
        }
        return;
    }

    // ── Step 1: Write input to buffer ──
    for (int i = 0; i < block_size; i++) {
        float in_l;
        float in_r;
        if constexpr (kPlanarIo) {
            in_l = planar_in_l[i];
            in_r = planar_in_r[i];
        } else {
            in_l = in_buf[i * 2];
            in_r = in_buf[i * 2 + 1];
        }

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
            s->write_pos++;
            if (s->write_pos >= s->buffer_size) s->write_pos = 0;
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
    float feedback_gain = s->feedback;
    if (feedback_gain > 0.85f) feedback_gain = 0.85f;

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
                int fb_write_pos = wrap_index_any(s->write_pos - block_size + i, s->buffer_size);
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
    if constexpr (kPlanarIo) {
#ifdef __wasm_simd128__
        v128_t wl = wasm_f32x4_splat(wet_level);
        const v128_t out_lo = wasm_f32x4_splat(-1.0f);
        const v128_t out_hi = wasm_f32x4_splat(1.0f);
        int i = 0;
        for (; i + 3 < block_size; i += 4) {
            v128_t vl = wasm_f32x4_mul(wasm_v128_load(&v_out_l[i]), wl);
            v128_t vr = wasm_f32x4_mul(wasm_v128_load(&v_out_r[i]), wl);
            vl = fast_tanh_v4(vl);
            vr = fast_tanh_v4(vr);
            vl = wasm_f32x4_min(wasm_f32x4_max(vl, out_lo), out_hi);
            vr = wasm_f32x4_min(wasm_f32x4_max(vr, out_lo), out_hi);
            v128_t nanL = wasm_f32x4_ne(vl, vl);
            v128_t nanR = wasm_f32x4_ne(vr, vr);
            vl = wasm_v128_andnot(vl, nanL);
            vr = wasm_v128_andnot(vr, nanR);
            wasm_v128_store(&planar_out_l[i], vl);
            wasm_v128_store(&planar_out_r[i], vr);
        }
        for (; i < block_size; i++) {
            float oL = sanitize(fast_tanh(v_out_l[i] * wet_level));
            float oR = sanitize(fast_tanh(v_out_r[i] * wet_level));
            planar_out_l[i] = clampf(oL, -1.0f, 1.0f);
            planar_out_r[i] = clampf(oR, -1.0f, 1.0f);
        }
#else
        for (int i = 0; i < block_size; i++) {
            float oL = sanitize(fast_tanh(v_out_l[i] * wet_level));
            float oR = sanitize(fast_tanh(v_out_r[i] * wet_level));
            planar_out_l[i] = clampf(oL, -1.0f, 1.0f);
            planar_out_r[i] = clampf(oR, -1.0f, 1.0f);
        }
#endif
        return;
    }
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
    s->quality = 1;
    s->max_total_grains_user = 48;
    s->spray_macro = 0.0f;
    s->cloud_macro = 0.0f;
    s->pitch_macro = 0.0f;
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
        vp->position_spray = 0.3f;
        vp->timing_spray = 0.0f;
        vp->lookback = 0.35f;
        vp->write_guard = 0.3f;
        vp->pitch_mode = CLOUD_PITCH_FIXED;
        vp->pitch_spread = 0.0f;
        vp->pitch_jitter_cents = 4.0f;
        vp->pitch_quantize = 1.0f;
        vp->reverse_chance = 0.0f;
        vp->bloom = 0.0f;
        vp->glide = 0.0f;
        vp->cloud_style = CLOUD_STYLE_CLASSIC;
        vp->anchor_pattern = 0;
        vp->loop_crossfade_ms = 12.0f;
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
        s->next_free_hint[v] = 0;
        s->clean_read_pos[v] = 0.0f;
        s->clean_pan_lfo_value[v] = 0.5f;
        s->clean_pos_lfo_value[v] = 0.0f;
        s->clean_lfo_counter[v] = 0;

        // Trigger envelope
        s->trig_env_phase[v] = -1;
        s->trig_env_velocity[v] = 1.0f;
        s->trig_env_atk_cache[v] = 1.0f;
        s->trig_env_dec_cache[v] = 1.0f;

        s->last_grain_pos[v] = 0.0f;
        s->anchor_step[v] = 0;

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
    process_block_internal<false>(g_state, block_size, nullptr, nullptr, nullptr, nullptr);
}

void granular_process_planar(const float* in_l, const float* in_r,
                             float* out_l, float* out_r, int block_size) {
    if (!g_state || !in_l || !in_r || !out_l || !out_r ||
        block_size <= 0 || block_size > KESSHO_MAX_BLOCK_SIZE) {
        return;
    }
    process_block_internal<true>(g_state, block_size, in_l, in_r, out_l, out_r);
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

void granular_set_quality_params(int quality, int max_grains, float spray_macro,
                                 float cloud_macro, float pitch_macro) {
    if (!g_state) return;
    g_state->quality = clampi(quality, 0, 2);
    g_state->max_total_grains_user = clampi(max_grains, 1, KESSHO_MAX_TOTAL_GRAINS);
    g_state->spray_macro = clampf(spray_macro, 0.0f, 1.0f);
    g_state->cloud_macro = clampf(cloud_macro, 0.0f, 1.0f);
    g_state->pitch_macro = clampf(pitch_macro, 0.0f, 1.0f);
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
    g_state->voice[voice].mode = mode <= KESSHO_MODE_CLEAN ? KESSHO_MODE_CLEAN : KESSHO_MODE_GRANULAR;
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

void granular_set_voice_advanced(int voice, float position_spray, float timing_spray,
                                 float lookback, float write_guard, int pitch_mode,
                                 float pitch_spread, float pitch_jitter_cents,
                                 float pitch_quantize, float reverse_chance,
                                 float bloom, float glide, int cloud_style,
                                 int anchor_pattern, float loop_crossfade_ms) {
    if (!g_state || voice < 0 || voice >= KESSHO_NUM_VOICES) return;
    VoiceParams* vp = &g_state->voice[voice];
    vp->position_spray = clampf(position_spray, 0.0f, 1.0f);
    vp->timing_spray = clampf(timing_spray, 0.0f, 1.0f);
    vp->lookback = clampf(lookback, 0.0f, 1.0f);
    vp->write_guard = clampf(write_guard, 0.0f, 1.0f);
    vp->pitch_mode = clampi(pitch_mode, CLOUD_PITCH_FIXED, CLOUD_PITCH_FREE);
    vp->pitch_spread = clampf(pitch_spread, 0.0f, 24.0f);
    vp->pitch_jitter_cents = clampf(pitch_jitter_cents, 0.0f, 50.0f);
    vp->pitch_quantize = clampf(pitch_quantize, 0.0f, 1.0f);
    vp->reverse_chance = clampf(reverse_chance, 0.0f, 1.0f);
    vp->bloom = clampf(bloom, 0.0f, 1.0f);
    vp->glide = clampf(glide, 0.0f, 1.0f);
    vp->cloud_style = clampi(cloud_style, CLOUD_STYLE_CLASSIC, CLOUD_STYLE_STARS);
    vp->anchor_pattern = clampi(anchor_pattern, 0, 3);
    vp->loop_crossfade_ms = clampf(loop_crossfade_ms, 4.0f, 80.0f);
}

void granular_set_legacy_params(float jitter, float probability, int pitch_mode,
                               float pitch_spread, int max_grains, float feedback) {
    (void)jitter;
    (void)probability;
    (void)pitch_mode;
    (void)pitch_spread;
    (void)max_grains;
    (void)feedback;
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

int granular_get_visual_events(KesshoGranularVisualEvent* out_events, int max_events) {
    if (!g_state || !out_events || max_events <= 0) return 0;
    uint32_t write = g_state->visual_event_write;
    uint32_t read = g_state->visual_event_read_shadow;
    uint32_t available = write - read;
    if (available > KESSHO_GRANULAR_VISUAL_EVENT_CAPACITY) {
        available = KESSHO_GRANULAR_VISUAL_EVENT_CAPACITY;
    }
    uint32_t request = (uint32_t)max_events;
    uint32_t count = available < request ? available : request;
    uint32_t start = write - count;
    for (uint32_t index = 0; index < count; ++index) {
        out_events[index] = g_state->visual_events[(start + index) % KESSHO_GRANULAR_VISUAL_EVENT_CAPACITY];
    }
    g_state->visual_event_read_shadow = write;
    return (int)count;
}

float* granular_get_buffer_ptr_l(void) {
    return g_state ? g_state->buffer_l : nullptr;
}

int granular_get_buffer_size(void) {
    return g_state ? g_state->buffer_size : 0;
}

KesshoGranularInstance* granular_instance_create(float sample_rate, float buffer_seconds) {
    KesshoGranularInstance* instance = new (std::nothrow) KesshoGranularInstance{};
    if (!instance) return nullptr;

    int init_result = 0;
    {
        ScopedGranularState scoped(instance->state);
        init_result = granular_init(sample_rate, buffer_seconds);
    }

    if (init_result != 0) {
        delete instance;
        return nullptr;
    }

    return instance;
}

void granular_instance_destroy(KesshoGranularInstance* instance) {
    if (!instance) return;
    {
        ScopedGranularState scoped(instance->state);
        granular_destroy();
    }
    delete instance;
}

int granular_instance_reset(KesshoGranularInstance* instance, float sample_rate, float buffer_seconds) {
    if (!instance) return 0;
    ScopedGranularState scoped(instance->state);
    return granular_init(sample_rate, buffer_seconds) == 0 ? 1 : 0;
}

float* granular_instance_get_input_ptr(KesshoGranularInstance* instance) {
    if (!instance) return nullptr;
    ScopedGranularState scoped(instance->state);
    return granular_get_input_ptr();
}

float* granular_instance_get_output_ptr(KesshoGranularInstance* instance) {
    if (!instance) return nullptr;
    ScopedGranularState scoped(instance->state);
    return granular_get_output_ptr();
}

void granular_instance_process_block(KesshoGranularInstance* instance, int block_size) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_process_block(block_size);
}

void granular_instance_process_planar(KesshoGranularInstance* instance,
                                      const float* in_l,
                                      const float* in_r,
                                      float* out_l,
                                      float* out_r,
                                      int block_size) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_process_planar(in_l, in_r, out_l, out_r, block_size);
}

void granular_instance_set_enabled(KesshoGranularInstance* instance, int enabled) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_enabled(enabled);
}

void granular_instance_set_freeze(KesshoGranularInstance* instance, int frozen, int with_feedback) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_freeze(frozen, with_feedback);
}

void granular_instance_set_dry_wet(KesshoGranularInstance* instance, float level) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_dry_wet(level);
}

void granular_instance_set_feedback(KesshoGranularInstance* instance, float amount, float lpf_hz) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_feedback(amount, lpf_hz);
}

void granular_instance_set_scale(KesshoGranularInstance* instance, const int* intervals, int count) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_scale(intervals, count);
}

void granular_instance_set_chord_bias(KesshoGranularInstance* instance, const int* pitches, int count, float bias) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_chord_bias(pitches, count, bias);
}

void granular_instance_set_buffer_size(KesshoGranularInstance* instance, float buffer_seconds) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_buffer_size(buffer_seconds);
}

void granular_instance_set_grain_shape(KesshoGranularInstance* instance, int shape) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_grain_shape(shape);
}

void granular_instance_set_bus_diffusion(KesshoGranularInstance* instance, float amount) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_bus_diffusion(amount);
}

void granular_instance_set_timing_randomness(KesshoGranularInstance* instance, float amount) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_timing_randomness(amount);
}

void granular_instance_set_quality_params(KesshoGranularInstance* instance, int quality, int max_grains,
                                          float spray_macro, float cloud_macro, float pitch_macro) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_quality_params(quality, max_grains, spray_macro, cloud_macro, pitch_macro);
}

void granular_instance_set_voice_mode(KesshoGranularInstance* instance, int voice, int enabled, int mode) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_mode(voice, enabled, mode);
}

void granular_instance_set_voice_position(KesshoGranularInstance* instance, int voice, int slice, float speed,
                                          float scan_rate, int reverse, float pitch, float write_follow) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_position(voice, slice, speed, scan_rate, reverse, pitch, write_follow);
}

void granular_instance_set_voice_grain(KesshoGranularInstance* instance, int voice, float density, float grain_size,
                                       float spray, float grain_oct, float attack, float decay) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_grain(voice, density, grain_size, spray, grain_oct, attack, decay);
}

void granular_instance_set_voice_output(KesshoGranularInstance* instance, int voice, float gain, float pan,
                                        float blur, float stereo_spread) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_output(voice, gain, pan, blur, stereo_spread);
}

void granular_instance_set_voice_lfo(KesshoGranularInstance* instance, int voice, float pos_rate, float pos_depth,
                                     float pan_rate, float reverse_rate, float record_rate) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_lfo(voice, pos_rate, pos_depth, pan_rate, reverse_rate, record_rate);
}

void granular_instance_set_voice_euclid_gated(KesshoGranularInstance* instance, int voice, int gated) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_euclid_gated(voice, gated);
}

void granular_instance_set_voice_euclid_muted(KesshoGranularInstance* instance, int voice, int muted) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_euclid_muted(voice, muted);
}

void granular_instance_set_voice_advanced(KesshoGranularInstance* instance, int voice, float position_spray,
                                          float timing_spray, float lookback, float write_guard,
                                          int pitch_mode, float pitch_spread, float pitch_jitter_cents,
                                          float pitch_quantize, float reverse_chance, float bloom, float glide,
                                          int cloud_style, int anchor_pattern, float loop_crossfade_ms) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_voice_advanced(voice, position_spray, timing_spray, lookback, write_guard,
                                pitch_mode, pitch_spread, pitch_jitter_cents, pitch_quantize,
                                reverse_chance, bloom, glide, cloud_style, anchor_pattern,
                                loop_crossfade_ms);
}

void granular_instance_set_legacy_params(KesshoGranularInstance* instance, float jitter, float probability,
                                         int pitch_mode, float pitch_spread, int max_grains, float feedback) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_legacy_params(jitter, probability, pitch_mode, pitch_spread, max_grains, feedback);
}

void granular_instance_euclid_trigger(KesshoGranularInstance* instance, int voice, float velocity,
                                      int slice_override, float pitch_override, int has_pitch,
                                      int reverse_override, int has_reverse) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_euclid_trigger(voice, velocity, slice_override, pitch_override, has_pitch, reverse_override, has_reverse);
}

void granular_instance_set_random_sequence(KesshoGranularInstance* instance, const float* data, int count) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_set_random_sequence(data, count);
}

float granular_instance_get_write_head(KesshoGranularInstance* instance) {
    if (!instance) return 0.0f;
    ScopedGranularState scoped(instance->state);
    return granular_get_write_head();
}

void granular_instance_get_voice_positions(KesshoGranularInstance* instance, float* out) {
    if (!instance) return;
    ScopedGranularState scoped(instance->state);
    granular_get_voice_positions(out);
}

int granular_instance_get_active_grain_count(KesshoGranularInstance* instance) {
    if (!instance) return 0;
    ScopedGranularState scoped(instance->state);
    return granular_get_active_grain_count();
}

int granular_instance_get_visual_events(
    KesshoGranularInstance* instance,
    KesshoGranularVisualEvent* out_events,
    int max_events) {
    if (!instance) return 0;
    ScopedGranularState scoped(instance->state);
    return granular_get_visual_events(out_events, max_events);
}

float* granular_instance_get_buffer_ptr_l(KesshoGranularInstance* instance) {
    if (!instance) return nullptr;
    ScopedGranularState scoped(instance->state);
    return granular_get_buffer_ptr_l();
}

int granular_instance_get_buffer_size(KesshoGranularInstance* instance) {
    if (!instance) return 0;
    ScopedGranularState scoped(instance->state);
    return granular_get_buffer_size();
}
