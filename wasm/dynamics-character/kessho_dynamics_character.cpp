#include "kessho_dynamics_character.h"

#include <cmath>
#include <cstring>
#include <new>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace {

constexpr int kDelayMaxSamples = 24576;
constexpr float kMinFreq = 8.0f;

enum ParamIndex {
    P_ACTIVE = 0,
    P_ALLPASS_ACTIVE,
    P_DRY,
    P_WET,
    P_DEGRADE_MIX,
    P_DEGRADE_ALIAS,
    P_DEGRADE_GENERATION,
    P_DEGRADE_CORROSION,
    P_DEGRADE_WEAR,
    P_NOISE_GAIN,
    P_JITTER_DEPTH,
    P_RANDOM_DRIFT_FILTER_HZ,
    P_RANDOM_DRIFT_DEPTH,
    P_BASE_DELAY,
    P_SPREAD_DELAY,
    P_RANDOM_DRIFT,
    P_RANDOM_HOLD_RATE_HZ,
    P_RANDOM_HOLD_LAG,
    P_RANDOM_DELAY_DEPTH,
    P_RANDOM_SPREAD_DELAY_DEPTH,
    P_RANDOM_FILTER_DEPTH,
    P_RANDOM_SPREAD_FILTER_DEPTH,
    P_DEPTH,
    P_RATE,
    P_SHALLOW,
    P_ABYSS,
    P_STEREO,
    P_DAMAGE,
    P_MAIN_PAN,
    P_SPREAD_PAN,
    P_MAIN_DELAY_GAIN,
    P_SPREAD_DELAY_GAIN,
    P_WOW_FREQ,
    P_FLUTTER_FREQ,
    P_FLUTTER_RANDOM_DEPTH,
    P_WOW_DEPTH,
    P_FLUTTER_DEPTH,
    P_HIGHPASS_HZ,
    P_HIGHPASS_Q,
    P_ALLPASS_A_HZ,
    P_ALLPASS_A_Q,
    P_ALLPASS_B_HZ,
    P_ALLPASS_B_Q,
    P_HEAD_BUMP_HZ,
    P_HEAD_BUMP_Q,
    P_HEAD_BUMP_GAIN,
    P_DROPOUT_FILTER_HZ,
    P_DROPOUT_DEPTH,
    P_DROPOUT_GAIN,
    P_ENV_FILTER_HZ,
    P_ENV_TO_LOWPASS_GAIN,
    P_ENV_TO_RESONANCE_GAIN,
    P_ENV_TO_WET_GAIN,
    P_LOWPASS_HZ,
    P_LOWPASS_Q,
    P_LOWPASS2_HZ,
    P_LOWPASS2_Q,
    P_COMP_THRESHOLD,
    P_COMP_KNEE,
    P_COMP_RATIO,
    P_COMP_ATTACK,
    P_COMP_RELEASE,
    P_COMP_MAKEUP,
    P_SATURATION,
    P_CORROSION,
    P_MASTER_SAT_ACTIVE,
    P_MASTER_SAT_MODE,
    P_MASTER_SAT_DRIVE,
    P_MASTER_SAT_TONE,
    P_MASTER_SAT_BIAS,
    P_END_COMP_ACTIVE,
    P_END_COMP_THRESHOLD,
    P_END_COMP_KNEE,
    P_END_COMP_RATIO,
    P_END_COMP_ATTACK,
    P_END_COMP_RELEASE,
    P_END_COMP_MAKEUP,
    P_END_COMP_MIX,
    P_END_COMP_DETECTOR_HP_HZ,
    P_END_COMP_DETECTOR_TILT,
    P_END_COMP_AUTO_MAKEUP,
    P_END_COMP_PROGRAM_RELEASE,
};

enum TelemetryIndex {
    T_INPUT_PEAK = 0,
    T_OUTPUT_PEAK,
    T_WET_PEAK,
    T_ENV,
    T_COMP_GR_DB,
    T_DROPOUT_GAIN,
    T_END_INPUT_PEAK,
    T_END_OUTPUT_PEAK,
    T_END_GR_DB,
    T_END_DETECTOR_DB,
};

inline float clampf(float value, float lo, float hi) {
    if (!std::isfinite(value)) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

inline float clamp01(float value) {
    return clampf(value, 0.0f, 1.0f);
}

inline float db_to_gain(float db) {
    return std::pow(10.0f, db / 20.0f);
}

inline float gain_to_db(float gain) {
    return 20.0f * std::log10(std::fmax(gain, 1.0e-9f));
}

inline float one_pole_coeff(float hz, float sample_rate) {
    const float safe_hz = clampf(hz, 0.001f, sample_rate * 0.45f);
    return 1.0f - std::exp(-2.0f * static_cast<float>(M_PI) * safe_hz / sample_rate);
}

inline float smooth_coeff(float seconds, float sample_rate, int block_size = 1) {
    const float safe = std::fmax(seconds, 0.0001f);
    return 1.0f - std::exp(-static_cast<float>(block_size) / (safe * sample_rate));
}

struct Biquad {
    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float z1 = 0.0f, z2 = 0.0f;

    void set(float nb0, float nb1, float nb2, float na0, float na1, float na2) {
        const float inv = std::fabs(na0) > 1.0e-9f ? 1.0f / na0 : 1.0f;
        b0 = nb0 * inv;
        b1 = nb1 * inv;
        b2 = nb2 * inv;
        a1 = na1 * inv;
        a2 = na2 * inv;
    }

    float process(float x) {
        const float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        if (!std::isfinite(z1)) z1 = 0.0f;
        if (!std::isfinite(z2)) z2 = 0.0f;
        return std::isfinite(y) ? y : 0.0f;
    }
};

void set_lowpass(Biquad& f, float freq, float q, float sr) {
    const float w0 = 2.0f * static_cast<float>(M_PI) * clampf(freq, kMinFreq, sr * 0.45f) / sr;
    const float c = std::cos(w0);
    const float s = std::sin(w0);
    const float alpha = s / (2.0f * clampf(q, 0.05f, 20.0f));
    f.set((1.0f - c) * 0.5f, 1.0f - c, (1.0f - c) * 0.5f, 1.0f + alpha, -2.0f * c, 1.0f - alpha);
}

void set_highpass(Biquad& f, float freq, float q, float sr) {
    const float w0 = 2.0f * static_cast<float>(M_PI) * clampf(freq, kMinFreq, sr * 0.45f) / sr;
    const float c = std::cos(w0);
    const float s = std::sin(w0);
    const float alpha = s / (2.0f * clampf(q, 0.05f, 20.0f));
    f.set((1.0f + c) * 0.5f, -(1.0f + c), (1.0f + c) * 0.5f, 1.0f + alpha, -2.0f * c, 1.0f - alpha);
}

void set_allpass(Biquad& f, float freq, float q, float sr) {
    const float w0 = 2.0f * static_cast<float>(M_PI) * clampf(freq, kMinFreq, sr * 0.45f) / sr;
    const float c = std::cos(w0);
    const float s = std::sin(w0);
    const float alpha = s / (2.0f * clampf(q, 0.05f, 20.0f));
    f.set(1.0f - alpha, -2.0f * c, 1.0f + alpha, 1.0f + alpha, -2.0f * c, 1.0f - alpha);
}

void set_peaking(Biquad& f, float freq, float q, float gain_db, float sr) {
    const float w0 = 2.0f * static_cast<float>(M_PI) * clampf(freq, kMinFreq, sr * 0.45f) / sr;
    const float c = std::cos(w0);
    const float s = std::sin(w0);
    const float a = std::pow(10.0f, clampf(gain_db, -36.0f, 36.0f) / 40.0f);
    const float alpha = s / (2.0f * clampf(q, 0.05f, 20.0f));
    f.set(1.0f + alpha * a, -2.0f * c, 1.0f - alpha * a, 1.0f + alpha / a, -2.0f * c, 1.0f - alpha / a);
}

struct DynamicsCharacterState {
    float sample_rate = 44100.0f;
    int delay_size = 8192;
    int write_pos = 0;
    unsigned int rng = 0x6d2b79f5u;
    long long sample_clock = 0;

    float input[KESSHO_DYNAMICS_CHARACTER_MAX_BLOCK_SIZE * 2] = {0.0f};
    float output[KESSHO_DYNAMICS_CHARACTER_MAX_BLOCK_SIZE * 2] = {0.0f};
    float param_buffer[KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT] = {0.0f};
    float telemetry[KESSHO_DYNAMICS_CHARACTER_TELEMETRY_COUNT] = {0.0f};
    float target[KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT] = {0.0f};
    float current[KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT] = {0.0f};
    int params_initialized = 0;

    float main_delay[kDelayMaxSamples] = {0.0f};
    float spread_delay[kDelayMaxSamples] = {0.0f};

    Biquad hp_l, hp_r;
    Biquad ap_a_l, ap_a_r;
    Biquad ap_b_l, ap_b_r;
    Biquad head_l, head_r;
    Biquad lp_l, lp_r;
    Biquad lp2_l, lp2_r;
    float static_filter_cache[9] = {0.0f};
    int static_filters_initialized = 0;

    float wow_phase = 0.0f;
    float flutter_phase = 0.0f;
    float lpg_env = 0.0f;
    float env = 0.0f;
    float compressor_gain = 1.0f;
    float master_sat_prev_l = 0.0f;
    float master_sat_prev_r = 0.0f;
    float end_comp_gain = 1.0f;
    Biquad end_detector_hp_l, end_detector_hp_r;
    float end_detector_hp_cache = -1.0f;
    float noise_lp_l = 0.0f;
    float noise_lp_r = 0.0f;
    float drift_noise = 0.0f;
    float wow_wander = 0.0f;
    float wow_wander_slow = 0.0f;
    float dropout_noise = 0.0f;

    float hold_main = 0.0f;
    float hold_spread = 0.0f;
    float hold_main_target = 0.0f;
    float hold_spread_target = 0.0f;
    long long next_hold_sample = 0;
    float water_cv_main = 0.0f;
    float water_cv_spread = 0.0f;
    float water_cv_main_target = 0.0f;
    float water_cv_spread_target = 0.0f;
    long long next_water_cv_sample = 0;

    float degrade_held[2] = {0.0f, 0.0f};
    float degrade_phase[2] = {1.0f, 1.0f};
    float degrade_lp[2] = {0.0f, 0.0f};
};

DynamicsCharacterState g_default;
thread_local DynamicsCharacterState* g_current = &g_default;

DynamicsCharacterState& dynamics_character_current_state() {
    return *g_current;
}

struct ScopedDynamicsCharacterState {
    explicit ScopedDynamicsCharacterState(DynamicsCharacterState& next) : previous(g_current) {
        g_current = &next;
    }

    ~ScopedDynamicsCharacterState() {
        g_current = previous;
    }

    DynamicsCharacterState* previous;
};

#define g dynamics_character_current_state()

void init_dynamics_character_state(DynamicsCharacterState& state, float sample_rate) {
    std::memset(&state, 0, sizeof(state));
    state.sample_rate = std::isfinite(sample_rate) && sample_rate > 1000.0f ? sample_rate : 44100.0f;
    state.delay_size = static_cast<int>(std::fmin(static_cast<float>(kDelayMaxSamples), state.sample_rate * 0.12f));
    if (state.delay_size < 512) state.delay_size = 512;
    state.degrade_phase[0] = 1.0f;
    state.degrade_phase[1] = 1.0f;
    state.compressor_gain = 1.0f;
    state.end_comp_gain = 1.0f;
    state.end_detector_hp_cache = -1.0f;
    state.rng = 0x9e3779b9u ^ static_cast<unsigned int>(state.sample_rate);
}

float rand01() {
    unsigned int t = (g.rng += 0x6d2b79f5u);
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + ((t ^ (t >> 7)) * (t | 61u));
    return static_cast<float>((t ^ (t >> 14)) & 0x00ffffffu) / 16777216.0f;
}

float rand_bipolar() {
    return rand01() * 2.0f - 1.0f;
}

float read_delay(const float* delay, float delay_samples) {
    float read = static_cast<float>(g.write_pos) - delay_samples;
    while (read < 0.0f) read += static_cast<float>(g.delay_size);
    while (read >= static_cast<float>(g.delay_size)) read -= static_cast<float>(g.delay_size);
    const int i0 = static_cast<int>(read);
    const int i1 = (i0 + 1) % g.delay_size;
    const float frac = read - static_cast<float>(i0);
    return delay[i0] + (delay[i1] - delay[i0]) * frac;
}

void pan_mono(float x, float pan, float& l, float& r) {
    const float p = clampf(pan, -1.0f, 1.0f);
    const float angle = (p + 1.0f) * static_cast<float>(M_PI) * 0.25f;
    l = x * std::cos(angle);
    r = x * std::sin(angle);
}

float saturate_character(float x, float amount, float corrosion) {
    const float sat = clamp01(amount);
    const float rust = clamp01(corrosion);
    if (sat <= 0.0001f && rust <= 0.0001f) return x;
    const float drive = 1.0f + sat * 7.0f + rust * 5.0f;
    const float fold = rust * 0.34f;
    const float crush = rust * 0.16f;
    const float shaped = std::tanh(x * drive);
    const float folded = std::sin((x + shaped * 0.25f) * static_cast<float>(M_PI) * (1.5f + drive * 0.4f));
    float y = shaped * (1.0f - fold) + folded * fold;
    if (crush > 0.001f) {
        const float steps = 96.0f - rust * 72.0f;
        const float quantized = std::round(y * steps) / steps;
        y = y * (1.0f - crush) + quantized * crush;
    }
    return clampf(y, -1.0f, 1.0f);
}

float master_saturation_curve(float x, int mode, float drive, float bias) {
    const float asym = (clamp01(bias) - 0.5f) * 0.8f;
    const float biased = x + asym * (0.24f + drive * 0.22f);
    float y = biased;
    switch (mode) {
        case 1: { // Tape: rounded compression with a little odd/even motion.
            const float soft = std::tanh(biased);
            const float harmonic = std::sin(biased * static_cast<float>(M_PI) * (0.32f + drive * 0.12f));
            y = soft * (0.86f - drive * 0.08f) + harmonic * (0.08f + drive * 0.08f);
            break;
        }
        case 2: { // Tube: even-order warmth before the final soft clip.
            const float even = biased + biased * biased * asym * (0.24f + drive * 0.18f);
            y = std::tanh(even * (0.92f + drive * 0.16f));
            break;
        }
        case 3: { // Diode: asymmetric limiting, useful for bright edge.
            const float pos = std::tanh(biased * (1.0f + drive * 0.2f));
            const float neg = -std::tanh(-biased * (0.72f - asym * 0.12f));
            y = biased >= 0.0f ? pos : neg;
            break;
        }
        case 4: { // Fold: restrained wavefolding for more obvious color.
            const float folded = std::sin(biased * static_cast<float>(M_PI) * (0.64f + drive * 0.28f));
            y = std::tanh(biased) * (0.74f - drive * 0.08f) + folded * (0.18f + drive * 0.14f);
            break;
        }
        default:
            y = std::tanh(biased);
            break;
    }
    y -= asym * (0.16f + drive * 0.08f);
    return clampf(y, -1.25f, 1.25f);
}

float apply_tone_tilt(float x, float tone, float amount) {
    const float tilt = (clamp01(tone) - 0.5f) * amount;
    const float positive = tilt > 0.0f ? tilt : 0.0f;
    const float negative = tilt < 0.0f ? -tilt : 0.0f;
    return x * (1.0f + positive * 0.22f - negative * 0.16f);
}

float process_master_saturation_sample(float x, int mode, float drive, float tone, float bias) {
    if (drive <= 0.0001f || mode < 0) return x;
    const float shaped_drive = std::pow(clamp01(drive), 1.15f);
    const float pre_gain = 1.0f + shaped_drive * shaped_drive * 6.0f + shaped_drive * 1.2f;
    const float pre_tone = apply_tone_tilt(x, tone, shaped_drive);
    const float y = master_saturation_curve(pre_tone * pre_gain, mode, shaped_drive, bias);
    const float auto_gain = 1.0f / (1.0f + shaped_drive * (1.12f + mode * 0.08f));
    return apply_tone_tilt(y * auto_gain, tone, shaped_drive * 0.85f);
}

void process_master_saturation(float& l, float& r, const float* p) {
    if (p[P_MASTER_SAT_ACTIVE] < 0.5f) return;
    const float drive = clamp01(p[P_MASTER_SAT_DRIVE]);
    if (drive <= 0.0001f) return;
    const int mode = static_cast<int>(clampf(std::round(p[P_MASTER_SAT_MODE]), 0.0f, 4.0f));
    const float tone = clamp01(p[P_MASTER_SAT_TONE]);
    const float bias = clamp01(p[P_MASTER_SAT_BIAS]);
    const int factor = drive > 0.66f ? 4 : drive > 0.18f ? 2 : 1;
    const float in_l = l;
    const float in_r = r;

    if (factor == 1) {
        l = process_master_saturation_sample(in_l, mode, drive, tone, bias);
        r = process_master_saturation_sample(in_r, mode, drive, tone, bias);
    } else {
        float sum_l = 0.0f;
        float sum_r = 0.0f;
        for (int step = 1; step <= factor; ++step) {
            const float frac = static_cast<float>(step) / static_cast<float>(factor);
            const float os_l = g.master_sat_prev_l + (in_l - g.master_sat_prev_l) * frac;
            const float os_r = g.master_sat_prev_r + (in_r - g.master_sat_prev_r) * frac;
            sum_l += process_master_saturation_sample(os_l, mode, drive, tone, bias);
            sum_r += process_master_saturation_sample(os_r, mode, drive, tone, bias);
        }
        l = sum_l / static_cast<float>(factor);
        r = sum_r / static_cast<float>(factor);
    }

    g.master_sat_prev_l = in_l;
    g.master_sat_prev_r = in_r;
}

void update_end_detector_filter(const float* p) {
    const float hp_hz = clampf(p[P_END_COMP_DETECTOR_HP_HZ], 8.0f, g.sample_rate * 0.35f);
    if (std::fabs(hp_hz - g.end_detector_hp_cache) <= 0.05f) return;
    g.end_detector_hp_cache = hp_hz;
    set_highpass(g.end_detector_hp_l, hp_hz, 0.707f, g.sample_rate);
    set_highpass(g.end_detector_hp_r, hp_hz, 0.707f, g.sample_rate);
}

float compute_compressor_gain_db(float level_db, float threshold, float knee, float ratio) {
    const float safe_ratio = std::fmax(1.0f, ratio);
    const float safe_knee = std::fmax(0.0f, knee);
    const float over = level_db - threshold;
    float compressed_db = level_db;
    if (safe_knee > 0.0001f && over > -safe_knee * 0.5f && over < safe_knee * 0.5f) {
        const float x = over + safe_knee * 0.5f;
        compressed_db = level_db + (1.0f / safe_ratio - 1.0f) * x * x / (2.0f * safe_knee);
    } else if (over >= safe_knee * 0.5f) {
        compressed_db = threshold + over / safe_ratio;
    }
    return compressed_db - level_db;
}

void process_end_chain(float& l, float& r, const float* p, float attack_coeff) {
    if (p[P_END_COMP_ACTIVE] < 0.5f || p[P_END_COMP_MIX] <= 0.0001f) return;
    update_end_detector_filter(p);
    const float dry_l = l;
    const float dry_r = r;
    const float raw_level = std::fmax(std::fabs(l), std::fabs(r));
    g.telemetry[T_END_INPUT_PEAK] = std::fmax(g.telemetry[T_END_INPUT_PEAK], raw_level);
    const float hp_l = g.end_detector_hp_l.process(l);
    const float hp_r = g.end_detector_hp_r.process(r);
    const float hp_level = std::fmax(std::fabs(hp_l), std::fabs(hp_r));
    const float detector_tilt = clamp01(p[P_END_COMP_DETECTOR_TILT]);
    const float detector_level = raw_level * (1.0f - detector_tilt) + hp_level * detector_tilt;
    const float level_db = gain_to_db(detector_level);
    g.telemetry[T_END_DETECTOR_DB] = std::fmax(g.telemetry[T_END_DETECTOR_DB], level_db);
    const float target_gain_db = compute_compressor_gain_db(
        level_db,
        p[P_END_COMP_THRESHOLD],
        p[P_END_COMP_KNEE],
        p[P_END_COMP_RATIO]
    );
    const float target_gain = db_to_gain(target_gain_db);
    const float current_reduction_db = -gain_to_db(std::fmin(1.0f, g.end_comp_gain));
    const float release_scale = clampf(
        1.0f + p[P_END_COMP_PROGRAM_RELEASE] * (current_reduction_db / 12.0f - 0.45f),
        0.45f,
        2.4f
    );
    const float release_coeff = smooth_coeff(p[P_END_COMP_RELEASE] * release_scale, g.sample_rate);
    const float coeff = target_gain < g.end_comp_gain ? attack_coeff : release_coeff;
    g.end_comp_gain += (target_gain - g.end_comp_gain) * coeff;
    g.telemetry[T_END_GR_DB] = std::fmax(g.telemetry[T_END_GR_DB], -gain_to_db(std::fmin(1.0f, g.end_comp_gain)));

    const float auto_makeup_db = std::fmax(0.0f, (-p[P_END_COMP_THRESHOLD] - 12.0f) * (1.0f - 1.0f / std::fmax(1.0f, p[P_END_COMP_RATIO])) * 0.34f);
    const float makeup = p[P_END_COMP_MAKEUP] * db_to_gain(auto_makeup_db * clamp01(p[P_END_COMP_AUTO_MAKEUP]));
    const float wet_l = dry_l * g.end_comp_gain * makeup;
    const float wet_r = dry_r * g.end_comp_gain * makeup;
    const float mix = clamp01(p[P_END_COMP_MIX]);
    l = dry_l + (wet_l - dry_l) * mix;
    r = dry_r + (wet_r - dry_r) * mix;
    g.telemetry[T_END_OUTPUT_PEAK] = std::fmax(g.telemetry[T_END_OUTPUT_PEAK], std::fmax(std::fabs(l), std::fabs(r)));
}

float degrade_sample(float dry, int channel, float mix, float alias, float generation, float corrosion, float wear) {
    if (mix <= 0.0001f) return dry;
    const float alias_focus = std::pow(clamp01(alias), 1.35f);
    const float destructive = clamp01(alias_focus * (0.6f + corrosion * 0.55f));
    const float damage = clamp01(alias_focus * 0.34f + generation * 0.2f + corrosion * 0.14f);
    const bool clean_media_path = alias_focus <= 0.0001f && generation <= 0.0001f && corrosion <= 0.0001f;
    const float cutoff = std::fmax(1500.0f, g.sample_rate * 0.45f * (1.0f - wear * 0.46f - generation * 0.24f - corrosion * 0.1f));
    const float alpha = std::fmin(1.0f, 1.0f - std::exp((-2.0f * static_cast<float>(M_PI) * cutoff) / g.sample_rate));

    if (clean_media_path) {
        if (wear <= 0.0001f) {
            g.degrade_held[channel] = dry;
            g.degrade_lp[channel] = dry;
            return dry;
        }
        const float lp = g.degrade_lp[channel] + (dry - g.degrade_lp[channel]) * alpha;
        g.degrade_held[channel] = dry;
        g.degrade_lp[channel] = lp;
        return dry + (lp - dry) * mix;
    }

    const float rate_ratio = std::fmax(0.2f, 1.0f / (1.0f + alias_focus * 3.2f + generation * 0.7f + corrosion * 0.55f));
    const float bit_depth = std::fmax(9.0f, 16.0f - alias_focus * 3.2f - generation * 1.1f - corrosion * 1.1f);
    const float quant_steps = std::fmax(8.0f, std::pow(2.0f, bit_depth));
    const float fold = 1.0f + corrosion * 0.58f + generation * 0.2f + destructive * 0.34f;
    const float inv_fold_tanh = 1.0f / std::fmax(1.0e-6f, std::tanh(fold));
    const float shaper_trim = 1.0f / (1.0f + (fold - 1.0f) * (0.52f + mix * 0.22f) + destructive * 0.18f + damage * 0.12f);

    float held = g.degrade_held[channel];
    float phase = g.degrade_phase[channel] + rate_ratio;
    if (phase >= 1.0f) {
        phase -= std::floor(phase);
        held = dry;
    }
    float wet = std::round(held * quant_steps) / quant_steps;
    wet = std::tanh(wet * fold) * inv_fold_tanh * shaper_trim;
    float lp = g.degrade_lp[channel] + (wet - g.degrade_lp[channel]) * alpha;
    wet = lp + (wet - lp) * (0.08f + damage * 0.18f + destructive * 0.18f);

    g.degrade_held[channel] = held;
    g.degrade_phase[channel] = phase;
    g.degrade_lp[channel] = lp;
    return dry + (wet - dry) * mix;
}

void update_random_hold(const float* p) {
    const float hold_amount = clamp01(
        p[P_RANDOM_DRIFT] +
        p[P_DEPTH] * (0.26f + p[P_SHALLOW] * 0.24f + p[P_ABYSS] * 0.18f) +
        p[P_RATE] * 0.08f +
        p[P_DAMAGE] * 0.22f
    );
    if (hold_amount <= 0.0001f) {
        g.hold_main_target = 0.0f;
        g.hold_spread_target = 0.0f;
        g.next_hold_sample = 0;
        return;
    }
    if (g.next_hold_sample > g.sample_clock) return;

    auto next_hold = [](float previous) {
        float next = rand_bipolar();
        if (std::fabs(next - previous) < 0.28f) next += next >= previous ? 0.4f : -0.4f;
        return clampf(next, -1.0f, 1.0f);
    };
    const float main_target = next_hold(g.hold_main_target);
    float spread_target = clampf(
        main_target * (0.58f + rand01() * 0.24f) +
        (rand01() - 0.5f) * (0.28f + p[P_STEREO] * 0.32f),
        -1.0f,
        1.0f
    );
    if (std::fabs(spread_target - g.hold_spread_target) < 0.18f) {
        spread_target = clampf(spread_target + (spread_target >= g.hold_spread_target ? 0.24f : -0.24f), -1.0f, 1.0f);
    }

    const float clock_hz = p[P_RANDOM_HOLD_RATE_HZ] + p[P_DAMAGE] * 0.18f + p[P_RATE] * 0.12f;
    const float interval = std::fmax(0.18f, 1.0f / std::fmax(0.12f, clock_hz));
    g.hold_main_target = main_target;
    g.hold_spread_target = spread_target;
    g.next_hold_sample = g.sample_clock + static_cast<long long>(interval * (0.45f + rand01() * 1.25f + std::fabs(main_target) * 0.15f) * g.sample_rate);
}

void update_water_cv(const float* p) {
    const float water = clamp01(p[P_SHALLOW] + p[P_ABYSS]);
    if (water <= 0.0001f || p[P_RANDOM_DRIFT] <= 0.0001f) {
        g.water_cv_main_target = 0.0f;
        g.water_cv_spread_target = 0.0f;
        g.next_water_cv_sample = 0;
        return;
    }
    if (g.next_water_cv_sample > g.sample_clock) return;

    auto next_cv = [](float previous, float min_delta) {
        float next = rand_bipolar();
        if (std::fabs(next - previous) < min_delta) {
            next += next >= previous ? min_delta * 1.35f : -min_delta * 1.35f;
        }
        return clampf(next, -1.0f, 1.0f);
    };

    const float main_target = next_cv(g.water_cv_main_target, 0.28f + p[P_SHALLOW] * 0.06f + p[P_ABYSS] * 0.1f);
    const float spread_target = clampf(
        main_target * (0.48f + rand01() * 0.24f + p[P_ABYSS] * 0.16f) +
        rand_bipolar() * (0.4f + p[P_SHALLOW] * 0.32f + p[P_ABYSS] * 0.12f + p[P_STEREO] * 0.18f),
        -1.0f,
        1.0f
    );

    const float clock_hz = std::fmax(
        0.05f,
        p[P_RANDOM_HOLD_RATE_HZ] * (0.96f + p[P_SHALLOW] * 0.38f + p[P_ABYSS] * 0.26f) +
        p[P_RATE] * (0.06f + p[P_SHALLOW] * 0.18f + p[P_ABYSS] * 0.12f)
    );
    const float interval = 1.0f / clock_hz;
    g.water_cv_main_target = main_target;
    g.water_cv_spread_target = spread_target;
    g.next_water_cv_sample = g.sample_clock + static_cast<long long>(
        interval * (0.68f + rand01() * 0.86f + std::fabs(main_target) * 0.16f) * g.sample_rate
    );
}

inline bool differs(float a, float b, float epsilon = 1.0e-5f) {
    return std::fabs(a - b) > epsilon;
}

void update_static_filters(const float* p) {
    const float values[9] = {
        p[P_HIGHPASS_HZ],
        p[P_HIGHPASS_Q],
        p[P_ALLPASS_A_HZ],
        p[P_ALLPASS_A_Q],
        p[P_ALLPASS_B_HZ],
        p[P_ALLPASS_B_Q],
        p[P_HEAD_BUMP_HZ],
        p[P_HEAD_BUMP_Q],
        p[P_HEAD_BUMP_GAIN],
    };

    bool dirty = g.static_filters_initialized == 0;
    for (int i = 0; i < 9 && !dirty; ++i) {
        dirty = differs(values[i], g.static_filter_cache[i]);
    }
    if (!dirty) return;

    for (int i = 0; i < 9; ++i) g.static_filter_cache[i] = values[i];
    g.static_filters_initialized = 1;

    set_highpass(g.hp_l, p[P_HIGHPASS_HZ], p[P_HIGHPASS_Q], g.sample_rate);
    set_highpass(g.hp_r, p[P_HIGHPASS_HZ], p[P_HIGHPASS_Q], g.sample_rate);
    set_allpass(g.ap_a_l, p[P_ALLPASS_A_HZ], p[P_ALLPASS_A_Q], g.sample_rate);
    set_allpass(g.ap_a_r, p[P_ALLPASS_A_HZ], p[P_ALLPASS_A_Q], g.sample_rate);
    set_allpass(g.ap_b_l, p[P_ALLPASS_B_HZ], p[P_ALLPASS_B_Q], g.sample_rate);
    set_allpass(g.ap_b_r, p[P_ALLPASS_B_HZ], p[P_ALLPASS_B_Q], g.sample_rate);
    set_peaking(g.head_l, p[P_HEAD_BUMP_HZ], p[P_HEAD_BUMP_Q], p[P_HEAD_BUMP_GAIN], g.sample_rate);
    set_peaking(g.head_r, p[P_HEAD_BUMP_HZ], p[P_HEAD_BUMP_Q], p[P_HEAD_BUMP_GAIN], g.sample_rate);
}

void update_modulated_filters(const float* p) {
    const float water = clamp01(p[P_SHALLOW] + p[P_ABYSS]);
    const float water_main_cv = g.water_cv_main * water;
    const float water_spread_cv = g.water_cv_spread * water;
    const float random_filter_scale = clampf(1.0f - p[P_ABYSS] * 0.42f - p[P_SHALLOW] * 0.14f, 0.22f, 1.0f);
    const float random_filter_spread_scale = clampf(1.0f - p[P_ABYSS] * 0.36f - p[P_SHALLOW] * 0.1f, 0.28f, 1.0f);
    const float water_filter_main =
        water_main_cv * (24.0f + p[P_DEPTH] * (210.0f + p[P_SHALLOW] * 60.0f + p[P_ABYSS] * 40.0f));
    const float water_filter_spread =
        water_spread_cv * (34.0f + p[P_DEPTH] * (260.0f + p[P_SHALLOW] * 70.0f + p[P_ABYSS] * 50.0f));
    const float water_q = std::fmax(0.0f, g.water_cv_main) * (
        p[P_SHALLOW] * (0.04f + p[P_DEPTH] * 0.12f) +
        p[P_ABYSS] * (0.03f + p[P_DEPTH] * 0.08f)
    );
    const float env_lp_raw = p[P_LOWPASS_HZ] + g.env * p[P_ENV_TO_LOWPASS_GAIN] + g.hold_main * p[P_RANDOM_FILTER_DEPTH] * random_filter_scale + water_filter_main;
    const float env_lp2_raw = p[P_LOWPASS2_HZ] + g.env * p[P_ENV_TO_LOWPASS_GAIN] + g.hold_spread * p[P_RANDOM_SPREAD_FILTER_DEPTH] * random_filter_spread_scale + water_filter_spread;
    const float env_lp = std::fmax(env_lp_raw, p[P_LOWPASS_HZ]);
    const float env_lp2 = std::fmax(env_lp2_raw, p[P_LOWPASS2_HZ]);
    const float env_q = g.env * p[P_ENV_TO_RESONANCE_GAIN];
    set_lowpass(g.lp_l, env_lp, p[P_LOWPASS_Q] + env_q + water_q, g.sample_rate);
    set_lowpass(g.lp_r, env_lp, p[P_LOWPASS_Q] + env_q + water_q, g.sample_rate);
    set_lowpass(g.lp2_l, env_lp2, p[P_LOWPASS2_Q] + env_q + water_q * 0.65f, g.sample_rate);
    set_lowpass(g.lp2_r, env_lp2, p[P_LOWPASS2_Q] + env_q + water_q * 0.65f, g.sample_rate);
}

void process_compressor(float& l, float& r, const float* p, float attack_coeff, float release_coeff) {
    const float threshold = p[P_COMP_THRESHOLD];
    const float knee = std::fmax(0.0f, p[P_COMP_KNEE]);
    const float ratio = std::fmax(1.0f, p[P_COMP_RATIO]);
    const float level_db = gain_to_db(std::fmax(std::fabs(l), std::fabs(r)));
    float over = level_db - threshold;
    float compressed_db = level_db;
    if (knee > 0.0001f && over > -knee * 0.5f && over < knee * 0.5f) {
        const float x = over + knee * 0.5f;
        compressed_db = level_db + (1.0f / ratio - 1.0f) * x * x / (2.0f * knee);
    } else if (over >= knee * 0.5f) {
        compressed_db = threshold + over / ratio;
    }
    const float target_gain = db_to_gain(compressed_db - level_db);
    const bool attacking = target_gain < g.compressor_gain;
    const float coeff = attacking ? attack_coeff : release_coeff;
    g.compressor_gain += (target_gain - g.compressor_gain) * coeff;
    g.telemetry[T_COMP_GR_DB] = std::fmax(g.telemetry[T_COMP_GR_DB], -gain_to_db(std::fmin(1.0f, g.compressor_gain)));
    const float gain = g.compressor_gain * p[P_COMP_MAKEUP];
    l *= gain;
    r *= gain;
}

} // namespace

extern "C" {

struct KesshoDynamicsCharacterInstance {
    DynamicsCharacterState state;
};

int dynamics_character_init(float sample_rate) {
    init_dynamics_character_state(g, sample_rate);
    return 0;
}

int dynamics_character_reset(float sample_rate) {
    init_dynamics_character_state(g, sample_rate);
    return 0;
}

void dynamics_character_destroy(void) {
    std::memset(&g, 0, sizeof(g));
}

float* dynamics_character_get_input_ptr(void) {
    return g.input;
}

float* dynamics_character_get_output_ptr(void) {
    return g.output;
}

float* dynamics_character_get_params_ptr(void) {
    return g.param_buffer;
}

float* dynamics_character_get_telemetry_ptr(void) {
    return g.telemetry;
}

void dynamics_character_commit_params(void) {
    for (int i = 0; i < KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT; ++i) {
        const float value = std::isfinite(g.param_buffer[i]) ? g.param_buffer[i] : 0.0f;
        g.target[i] = value;
        if (!g.params_initialized) g.current[i] = value;
    }
    g.params_initialized = 1;
}

void dynamics_character_process_block(int block_size) {
    if (block_size <= 0) return;
    if (block_size > KESSHO_DYNAMICS_CHARACTER_MAX_BLOCK_SIZE) block_size = KESSHO_DYNAMICS_CHARACTER_MAX_BLOCK_SIZE;
    for (int i = 0; i < KESSHO_DYNAMICS_CHARACTER_TELEMETRY_COUNT; ++i) {
        g.telemetry[i] = 0.0f;
    }
    g.telemetry[T_DROPOUT_GAIN] = 1.0f;
    g.telemetry[T_END_DETECTOR_DB] = -120.0f;
    if (!g.params_initialized || g.target[P_ACTIVE] < 0.5f) {
        std::memcpy(g.output, g.input, static_cast<size_t>(block_size) * 2 * sizeof(float));
        return;
    }

    const float block_smooth = smooth_coeff(0.035f, g.sample_rate, block_size);
    for (int i = 0; i < KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT; ++i) {
        g.current[i] += (g.target[i] - g.current[i]) * block_smooth;
    }
    g.current[P_ACTIVE] = g.target[P_ACTIVE];
    g.current[P_ALLPASS_ACTIVE] = g.target[P_ALLPASS_ACTIVE];

    float* p = g.current;
    update_random_hold(p);
    update_water_cv(p);
    const float water_amount = clamp01(p[P_SHALLOW] + p[P_ABYSS]);
    const float water_delay_cv_mix = clamp01(p[P_SHALLOW] * 0.72f + p[P_ABYSS] * 0.54f);
    const float water_cv_lag = std::fmax(
        0.02f,
        p[P_RANDOM_HOLD_LAG] * (0.32f + p[P_ABYSS] * 0.22f + p[P_SHALLOW] * 0.1f)
    );
    const float water_cv_base_coeff = smooth_coeff(water_cv_lag, g.sample_rate);
    const float hold_coeff = smooth_coeff(std::fmax(0.012f, p[P_RANDOM_HOLD_LAG] * 0.48f + (1.0f - p[P_RATE]) * 0.045f), g.sample_rate);
    const float env_coeff = one_pole_coeff(p[P_ENV_FILTER_HZ], g.sample_rate);
    const float lpg_attack_coeff = smooth_coeff(0.2f + p[P_ABYSS] * 0.035f - p[P_SHALLOW] * 0.02f, g.sample_rate);
    const float lpg_decay_coeff = smooth_coeff(0.005f, g.sample_rate);
    const float lpg_cv_attack_coeff = smooth_coeff(0.012f + p[P_ABYSS] * 0.006f, g.sample_rate);
    const float lpg_cv_decay_coeff = smooth_coeff(0.075f + clampf(p[P_RANDOM_HOLD_LAG], 0.0f, 2.0f) * 0.025f + p[P_ABYSS] * 0.025f, g.sample_rate);
    const float drift_coeff = one_pole_coeff(p[P_RANDOM_DRIFT_FILTER_HZ], g.sample_rate);
    const float tape_wow_blend = clamp01(
        p[P_DEGRADE_MIX] * 1.25f +
        p[P_DEGRADE_WEAR] * 0.18f +
        p[P_DEGRADE_GENERATION] * 0.08f +
        p[P_DEGRADE_CORROSION] * 0.08f
    );
    const float water_random_blend = clamp01(p[P_SHALLOW] * 0.74f + p[P_ABYSS] * 0.68f);
    const float water_flutter_blend = clamp01(p[P_SHALLOW] * 0.58f + p[P_ABYSS] * 0.46f);
    const float wow_wander_coeff = one_pole_coeff(
        0.03f + p[P_WOW_FREQ] * 0.45f + p[P_RANDOM_DRIFT_FILTER_HZ] * 0.24f,
        g.sample_rate
    );
    const float wow_wander_slow_coeff = one_pole_coeff(
        0.008f + p[P_WOW_FREQ] * 0.11f + p[P_RANDOM_DRIFT_FILTER_HZ] * 0.05f,
        g.sample_rate
    );
    const float dropout_coeff = one_pole_coeff(p[P_DROPOUT_FILTER_HZ], g.sample_rate);
    const float comp_attack_coeff = smooth_coeff(p[P_COMP_ATTACK], g.sample_rate);
    const float comp_release_coeff = smooth_coeff(p[P_COMP_RELEASE], g.sample_rate);
    const float end_comp_attack_coeff = smooth_coeff(p[P_END_COMP_ATTACK], g.sample_rate);
    update_static_filters(p);

    for (int i = 0; i < block_size; ++i) {
        if ((i & 15) == 0) update_modulated_filters(p);

        const float in_l = std::isfinite(g.input[i * 2]) ? g.input[i * 2] : 0.0f;
        const float in_r = std::isfinite(g.input[i * 2 + 1]) ? g.input[i * 2 + 1] : in_l;
        const float mono = (in_l + in_r) * 0.5f;
        g.telemetry[T_INPUT_PEAK] = std::fmax(g.telemetry[T_INPUT_PEAK], std::fmax(std::fabs(in_l), std::fabs(in_r)));

        const float abs_mono = std::fabs(mono);
        if (water_amount > 0.0001f) {
            const float follower_coeff = abs_mono > g.lpg_env ? lpg_attack_coeff : lpg_decay_coeff;
            g.lpg_env += (abs_mono - g.lpg_env) * follower_coeff;
            const float cv_diff = g.lpg_env - g.env;
            const float cv_coeff = cv_diff > 0.0f ? lpg_cv_attack_coeff : lpg_cv_decay_coeff;
            g.env += cv_diff * cv_coeff;
        } else {
            g.lpg_env = abs_mono;
            g.env += (abs_mono - g.env) * env_coeff;
        }
        g.telemetry[T_ENV] = std::fmax(g.telemetry[T_ENV], g.env);

        g.hold_main += (g.hold_main_target - g.hold_main) * hold_coeff;
        g.hold_spread += (g.hold_spread_target - g.hold_spread) * hold_coeff;
        const float water_main_diff = g.water_cv_main_target - g.water_cv_main;
        const float water_spread_diff = g.water_cv_spread_target - g.water_cv_spread;
        const float water_main_coeff = clampf(
            water_cv_base_coeff * (1.0f + std::fabs(water_main_diff) * (1.6f + water_amount * 1.2f)),
            water_cv_base_coeff,
            0.095f
        );
        const float water_spread_coeff = clampf(
            water_cv_base_coeff * (1.0f + std::fabs(water_spread_diff) * (1.8f + water_amount * 1.1f)),
            water_cv_base_coeff,
            0.11f
        );
        g.water_cv_main += water_main_diff * water_main_coeff;
        g.water_cv_spread += water_spread_diff * water_spread_coeff;

        const float white_l = rand_bipolar();
        const float white_r = rand_bipolar();
        g.noise_lp_l += (white_l - g.noise_lp_l) * 0.035f;
        g.noise_lp_r += (white_r - g.noise_lp_r) * 0.035f;
        g.drift_noise += (white_l - g.drift_noise) * drift_coeff;
        g.wow_wander += (white_l - g.wow_wander) * wow_wander_coeff;
        g.wow_wander_slow += (white_r - g.wow_wander_slow) * wow_wander_slow_coeff;
        g.dropout_noise += (white_r - g.dropout_noise) * dropout_coeff;

        g.wow_phase += p[P_WOW_FREQ] / g.sample_rate;
        if (g.wow_phase >= 1.0f) g.wow_phase -= 1.0f;
        g.flutter_phase += p[P_FLUTTER_FREQ] / g.sample_rate;
        if (g.flutter_phase >= 1.0f) g.flutter_phase -= 1.0f;
        const float cyclic_wow = std::sin(2.0f * static_cast<float>(M_PI) * g.wow_phase);
        const float tape_wow = clampf(
            g.wow_wander * 0.64f +
            g.wow_wander_slow * 0.46f +
            g.hold_main * 0.22f +
            g.drift_noise * 0.18f,
            -1.0f,
            1.0f
        );
        const float unstable_cyclic_wow = cyclic_wow * clampf(0.78f + g.wow_wander_slow * 0.16f, 0.62f, 1.0f);
        const float wow_blend = clampf(
            tape_wow_blend * 0.42f + p[P_DEGRADE_MIX] * 0.12f + water_random_blend,
            0.0f,
            0.93f
        );
        const float wow = unstable_cyclic_wow * (1.0f - wow_blend) + tape_wow * wow_blend;
        const float cyclic_flutter = 4.0f * std::fabs(g.flutter_phase - 0.5f) - 1.0f;
        const float tape_flutter = clampf(
            cyclic_flutter * (0.28f * (1.0f - water_flutter_blend * 0.6f)) +
            g.drift_noise * 0.46f +
            g.wow_wander * 0.26f,
            -1.0f,
            1.0f
        );
        const float flutter_blend = clampf(tape_wow_blend * 0.78f + water_flutter_blend, 0.0f, 0.95f);
        const float flutter = cyclic_flutter * (1.0f - flutter_blend) + tape_flutter * flutter_blend;
        const float flutter_random = g.drift_noise * p[P_FLUTTER_RANDOM_DEPTH];
        const float jitter = white_l * p[P_JITTER_DEPTH];

        const float main_delay_cv = g.hold_main * (1.0f - water_delay_cv_mix) + g.water_cv_main * water_delay_cv_mix;
        const float spread_delay_cv = g.hold_spread * (1.0f - water_delay_cv_mix) + g.water_cv_spread * water_delay_cv_mix;
        const float delay_mod_trim = clampf(1.0f - p[P_ABYSS] * 0.35f, 0.4f, 1.0f);
        const float main_delay_s = clampf(
            p[P_BASE_DELAY] + (wow * p[P_WOW_DEPTH] + flutter * p[P_FLUTTER_DEPTH] + main_delay_cv * p[P_RANDOM_DELAY_DEPTH] + g.drift_noise * p[P_RANDOM_DRIFT_DEPTH] + jitter) * delay_mod_trim,
            0.00005f,
            0.105f
        );
        const float spread_delay_s = clampf(
            p[P_SPREAD_DELAY] + (wow * p[P_WOW_DEPTH] + (flutter + flutter_random) * p[P_FLUTTER_DEPTH] + spread_delay_cv * p[P_RANDOM_SPREAD_DELAY_DEPTH] + g.drift_noise * p[P_RANDOM_DRIFT_DEPTH] + jitter) * delay_mod_trim,
            0.00005f,
            0.105f
        );

        g.main_delay[g.write_pos] = mono;
        g.spread_delay[g.write_pos] = mono;
        const float main = read_delay(g.main_delay, main_delay_s * g.sample_rate);
        const float spread = read_delay(g.spread_delay, spread_delay_s * g.sample_rate);
        g.write_pos = (g.write_pos + 1) % g.delay_size;

        float main_l = 0.0f, main_r = 0.0f, spread_l = 0.0f, spread_r = 0.0f;
        const float water_spread_motion = g.water_cv_spread * p[P_STEREO] * (p[P_SHALLOW] * 0.24f + p[P_ABYSS] * 0.34f);
        const float water_gain_motion = clampf(
            1.0f + g.water_cv_main * (p[P_SHALLOW] * 0.08f + p[P_ABYSS] * 0.05f),
            0.72f,
            1.24f
        );
        const float spread_gain_motion = clampf(
            1.0f + g.water_cv_spread * (p[P_SHALLOW] * 0.18f + p[P_ABYSS] * 0.1f),
            0.68f,
            1.28f
        );
        pan_mono(main * p[P_MAIN_DELAY_GAIN] * water_gain_motion, p[P_MAIN_PAN] - water_spread_motion * 0.38f, main_l, main_r);
        pan_mono(spread * p[P_SPREAD_DELAY_GAIN] * spread_gain_motion, p[P_SPREAD_PAN] + water_spread_motion, spread_l, spread_r);
        float wet_l = main_l + spread_l;
        float wet_r = main_r + spread_r;
        g.telemetry[T_WET_PEAK] = std::fmax(g.telemetry[T_WET_PEAK], std::fmax(std::fabs(wet_l), std::fabs(wet_r)));

        wet_l = degrade_sample(wet_l, 0, p[P_DEGRADE_MIX], p[P_DEGRADE_ALIAS], p[P_DEGRADE_GENERATION], p[P_DEGRADE_CORROSION], p[P_DEGRADE_WEAR]);
        wet_r = degrade_sample(wet_r, 1, p[P_DEGRADE_MIX], p[P_DEGRADE_ALIAS], p[P_DEGRADE_GENERATION], p[P_DEGRADE_CORROSION], p[P_DEGRADE_WEAR]);

        wet_l = g.hp_l.process(wet_l);
        wet_r = g.hp_r.process(wet_r);
        if (p[P_ALLPASS_ACTIVE] > 0.5f) {
            wet_l = g.ap_a_l.process(wet_l);
            wet_r = g.ap_a_r.process(wet_r);
            wet_l = g.ap_b_l.process(wet_l);
            wet_r = g.ap_b_r.process(wet_r);
        }
        wet_l = g.head_l.process(wet_l);
        wet_r = g.head_r.process(wet_r);
        wet_l = g.lp_l.process(wet_l);
        wet_r = g.lp_r.process(wet_r);
        wet_l = g.lp2_l.process(wet_l);
        wet_r = g.lp2_r.process(wet_r);

        process_compressor(wet_l, wet_r, p, comp_attack_coeff, comp_release_coeff);

        wet_l = saturate_character(wet_l, p[P_SATURATION], p[P_CORROSION]);
        wet_r = saturate_character(wet_r, p[P_SATURATION], p[P_CORROSION]);

        const float dropout_dip = std::fmax(0.0f, -g.dropout_noise);
        const float dropout_gain = clampf(p[P_DROPOUT_GAIN] - dropout_dip * p[P_DROPOUT_DEPTH], 0.0f, 1.25f);
        g.telemetry[T_DROPOUT_GAIN] = std::fmin(g.telemetry[T_DROPOUT_GAIN], dropout_gain);
        wet_l *= dropout_gain;
        wet_r *= dropout_gain;

        const float water_cv_bloom = std::fmax(0.0f, g.water_cv_main) * (p[P_SHALLOW] * 0.035f);
        const float wet_gain = clampf(p[P_WET] + g.env * p[P_ENV_TO_WET_GAIN] + water_cv_bloom, 0.0f, 1.5f);
        const float noise_gain = p[P_NOISE_GAIN];
        float out_l = in_l * p[P_DRY] + wet_l * wet_gain + g.noise_lp_l * noise_gain;
        float out_r = in_r * p[P_DRY] + wet_r * wet_gain + g.noise_lp_r * noise_gain;
        process_master_saturation(out_l, out_r, p);
        process_end_chain(out_l, out_r, p, end_comp_attack_coeff);
        g.telemetry[T_OUTPUT_PEAK] = std::fmax(g.telemetry[T_OUTPUT_PEAK], std::fmax(std::fabs(out_l), std::fabs(out_r)));
        g.output[i * 2] = out_l;
        g.output[i * 2 + 1] = out_r;
        g.sample_clock++;
    }
}

KesshoDynamicsCharacterInstance* dynamics_character_instance_create(float sample_rate) {
    auto* instance = new (std::nothrow) KesshoDynamicsCharacterInstance{};
    if (instance == nullptr) return nullptr;
    init_dynamics_character_state(instance->state, sample_rate);
    return instance;
}

void dynamics_character_instance_destroy(KesshoDynamicsCharacterInstance* instance) {
    delete instance;
}

int dynamics_character_instance_reset(KesshoDynamicsCharacterInstance* instance, float sample_rate) {
    if (instance == nullptr) return 0;
    init_dynamics_character_state(instance->state, sample_rate);
    return 1;
}

float* dynamics_character_instance_get_input_ptr(KesshoDynamicsCharacterInstance* instance) {
    return instance != nullptr ? instance->state.input : nullptr;
}

float* dynamics_character_instance_get_output_ptr(KesshoDynamicsCharacterInstance* instance) {
    return instance != nullptr ? instance->state.output : nullptr;
}

float* dynamics_character_instance_get_params_ptr(KesshoDynamicsCharacterInstance* instance) {
    return instance != nullptr ? instance->state.param_buffer : nullptr;
}

float* dynamics_character_instance_get_telemetry_ptr(KesshoDynamicsCharacterInstance* instance) {
    return instance != nullptr ? instance->state.telemetry : nullptr;
}

void dynamics_character_instance_commit_params(KesshoDynamicsCharacterInstance* instance) {
    if (instance == nullptr) return;
    ScopedDynamicsCharacterState scoped(instance->state);
    dynamics_character_commit_params();
}

void dynamics_character_instance_process_block(KesshoDynamicsCharacterInstance* instance, int block_size) {
    if (instance == nullptr) return;
    ScopedDynamicsCharacterState scoped(instance->state);
    dynamics_character_process_block(block_size);
}

} // extern "C"
