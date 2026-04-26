/**
 * Kessho Pad Synth — C++ Implementation
 *
 * Full port of engine.ts pad voice synthesis to per-sample C++.
 *
 * Architecture:
 *   - 6 voices, each assignable to pad 1 or pad 2
 *   - Per voice: 4 oscillators (OscA, OscA detuned, OscB, Sub) + noise
 *   - Dual SVF filters (A+B) with configurable routing (series/aOnly/bOnly)
 *   - Warmth (low shelf) + Presence (peaking EQ) via Biquad
 *   - Saturation waveshaper
 *   - ADSR amplitude envelope
 *   - 2 LFOs per pad (7 waveform types, 6 destinations)
 *   - Mod envelope per pad (ADS, 4 destinations)
 *   - No pad-specific delay (reverb send is a separate output bus)
 */

#include "kessho_pad.h"
#include "../common/kessho_dsp.h"
#include <cstring>
#include <cmath>
#include <algorithm>

using namespace kessho;

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════════════════════

struct PadParams {
    // Oscillator A
    int   osc_a_wave = PAD_WAVE_TRIANGLE;
    int   osc_a_octave = 0;
    float osc_a_detune = 0;   // cents
    float osc_a_level = 1;

    // Oscillator B
    int   osc_b_wave = PAD_WAVE_SINE;
    int   osc_b_octave = 0;
    float osc_b_detune = 0;
    float osc_b_level = 1;

    // Mix
    float osc_mix = 0.5f;     // 0=A only, 0.5=both, 1=B only

    // Sub
    int   sub_enabled = 0;
    int   sub_octave = -1;
    int   sub_wave = PAD_WAVE_SINE;
    float sub_level = 0.5f;

    // Noise
    int   noise_type = 0;     // 0=white, 1=pink
    float noise_level = 0;

    // Timbre
    float hardness = 0;       // drive amount
    float warmth = 0.5f;      // low shelf gain
    float presence = 0.5f;    // presence EQ gain
    float fold_amount = 0;     // wave fold amount [0..1]
    int   fold_mode = 0;        // 0=Buchla, 1=Sine, 2=Serge

    // Filter A
    int   filter_type = PAD_FILTER_LP;
    float filter_cutoff_min = 200;
    float filter_cutoff_max = 4000;
    float filter_resonance = 0;
    float filter_q = 0.7f;
    float filter_slope = 12.0f; // dB/oct, implemented as cascaded 12 dB/oct SVF stages
    float filter_key_tracking = 0.0f; // 0=fixed cutoff, 1=one octave cutoff per octave played

    // Filter B
    int   filter_b_enabled = 0;
    int   filter_b_type = PAD_FILTER_LP;
    float filter_b_cutoff = 2000;
    float filter_b_resonance = 0;
    float filter_b_q = 0.7f;
    int   filter_routing = PAD_ROUTE_SERIES;

    // ADSR
    float attack = 0.1f;
    float decay = 0.5f;
    float sustain = 0.7f;
    float release = 2.0f;

    // LFO 1
    float lfo1_rate = 0;
    float lfo1_depth = 0;
    int   lfo1_wave = PAD_LFO_SINE;
    int   lfo1_dest = PAD_DEST_NONE;

    // LFO 2
    float lfo2_rate = 0;
    float lfo2_depth = 0;
    int   lfo2_wave = PAD_LFO_SINE;
    int   lfo2_dest = PAD_DEST_NONE;

    // Mod Envelope
    int   mod_env_enabled = 0;
    float mod_env_attack = 0.5f;
    float mod_env_decay = 1.0f;
    float mod_env_sustain = 0;
    float mod_env_release = 0.5f;
    float mod_env_depth = 0;
    int   mod_env_dest = PAD_DEST_FILTER_CUTOFF;

    // Level
    float level = 0.8f;
};

struct LFOState {
    float phase = 0;
    float value = 0;
    float prev_random = 0;
    float next_random = 0;
    float random_walk = 0;
    PRNG  rng;

    float process(float rate, int wave_type, float sample_rate, const SineTable& sine) {
        if (rate <= 0) { value = 0; return 0; }

        float prev_phase = phase;
        phase += rate / sample_rate;
        if (phase >= 1.0f) {
            phase -= 1.0f;
            // Update S&H / random targets on cycle
            prev_random = next_random;
            next_random = rng.next_bipolar();
            random_walk += rng.next_bipolar() * 0.2f;
            random_walk = std::max(-1.0f, std::min(1.0f, random_walk));
        }

        switch (wave_type) {
            case PAD_LFO_SINE:
                value = sine.lookup(phase);
                break;
            case PAD_LFO_TRIANGLE:
                value = (phase < 0.5f) ? (phase * 4.0f - 1.0f) : (3.0f - phase * 4.0f);
                break;
            case PAD_LFO_SAWTOOTH:
                value = phase * 2.0f - 1.0f;
                break;
            case PAD_LFO_SQUARE:
                value = (phase < 0.5f) ? 1.0f : -1.0f;
                break;
            case PAD_LFO_SAMPLE_HOLD:
                value = prev_random;
                break;
            case PAD_LFO_RANDOM_SMOOTH: {
                // Interpolate between random values
                float t = phase;
                value = prev_random + (next_random - prev_random) * t;
                break;
            }
            case PAD_LFO_RANDOM_WALK:
                value = random_walk;
                break;
            default:
                value = 0;
                break;
        }
        return value;
    }

    void reset() {
        phase = 0;
        value = 0;
        prev_random = 0;
        next_random = 0;
        random_walk = 0;
    }
};

struct PadVoice {
    int   active = 0;
    int   pad_idx = 0;         // 0=pad1, 1=pad2
    float base_freq = 440;
    float velocity = 1;

    // 4 oscillators
    Oscillator osc_a;          // OscA
    Oscillator osc_a2;         // OscA detuned
    Oscillator osc_b;          // OscB
    Oscillator osc_sub;        // Sub (or OscB detuned)

    // Noise
    PRNG noise_rng;
    PinkNoise pink;

    // Dual filters
    SVF filter_a;
    SVF filter_a_slope2;
    SVF filter_a_slope3;
    SVF filter_a_slope4;
    SVF filter_b;

    // Warmth + presence (biquad)
    Biquad warmth_filter;
    Biquad presence_filter;

    // Wave Folder
    WaveFolder folder;

    // Saturation
    WaveshaperCurve waveshaper;

    // Amplitude ADSR
    ADSREnvelope amp_env;

    // Mod envelope (per-voice, tracks pad's params)
    ADSREnvelope mod_env;

    // LFOs (per-voice instances so phase can differ)
    LFOState lfo1;
    LFOState lfo2;

    void reset() {
        active = 0;
        osc_a = {};
        osc_a2 = {};
        osc_b = {};
        osc_sub = {};
        filter_a.reset();
        filter_a_slope2.reset();
        filter_a_slope3.reset();
        filter_a_slope4.reset();
        filter_b.reset();
        warmth_filter = {};
        presence_filter = {};
        amp_env.reset();
        mod_env.reset();
        lfo1.reset();
        lfo2.reset();
        pink.reset();
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Engine State
// ═══════════════════════════════════════════════════════════════════════════════

static float g_sample_rate = 48000;
static SineTable g_sine;
static PRNG g_rng;

static PadVoice g_voices[PAD_NUM_VOICES];
static PadParams g_pads[PAD_NUM_PADS];

// Output buffers
static float g_output[PAD_MAX_BLOCK_SIZE * 2];
static float g_reverb_output[PAD_MAX_BLOCK_SIZE * 2];
static float g_prefader_pad1_output[PAD_MAX_BLOCK_SIZE * 2];
static float g_prefader_pad2_output[PAD_MAX_BLOCK_SIZE * 2];
static float g_postfader_pad1_output[PAD_MAX_BLOCK_SIZE * 2];
static float g_postfader_pad2_output[PAD_MAX_BLOCK_SIZE * 2];

static float g_reverb_send_level = 0.1f;

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

static Waveform wave_index_to_waveform(int idx) {
    switch (idx) {
        case PAD_WAVE_TRIANGLE: return WAVE_TRIANGLE;
        case PAD_WAVE_SAWTOOTH: return WAVE_SAWTOOTH;
        case PAD_WAVE_SQUARE: return WAVE_SQUARE;
        default: return WAVE_SINE;
    }
}

static SVFMode filter_type_to_mode(int type) {
    switch (type) {
        case PAD_FILTER_BP: return SVF_BANDPASS;
        case PAD_FILTER_HP: return SVF_HIGHPASS;
        case PAD_FILTER_NOTCH: return SVF_NOTCH;
        default: return SVF_LOWPASS;
    }
}

static int slope_to_stage_count(float slope_db_per_oct) {
    return std::max(1, std::min(4, (int)roundf(slope_db_per_oct / 12.0f)));
}

static float clamp_hz(float value) {
    return std::max(20.0f, std::min(18000.0f, value));
}

static float apply_key_tracking(float cutoff, float base_freq, float amount) {
    const float safe_amount = std::max(0.0f, std::min(1.0f, amount));
    if (safe_amount <= 0.0001f) return cutoff;
    const float ratio = std::max(0.125f, std::min(8.0f, base_freq / 261.625565f));
    return cutoff * powf(ratio, safe_amount);
}

static float process_filter_a(PadVoice& v, float input, float cutoff, float q, SVFMode mode, int stage_count) {
    float out = v.filter_a.process(input, cutoff, q, g_sample_rate, mode);
    if (stage_count <= 1) return out;

    // Keep the first stage responsible for resonance, then use neutral follow-up
    // stages for slope so high-Q patches do not multiply into runaway peaks.
    const float cascade_q = std::min(q, 0.707f);
    out = v.filter_a_slope2.process(out, cutoff, cascade_q, g_sample_rate, mode);
    if (stage_count <= 2) return out;
    out = v.filter_a_slope3.process(out, cutoff, cascade_q, g_sample_rate, mode);
    if (stage_count <= 3) return out;
    return v.filter_a_slope4.process(out, cutoff, cascade_q, g_sample_rate, mode);
}

static void apply_lfo_modulation(float lfo_val, float depth, int dest,
    float& filter_a_mod, float& filter_b_mod,
    float& amp_mod, float& pitch_mod, float& osc_b_mod, float& fold_mod) {
    float mod = lfo_val * depth;
    switch (dest) {
        case PAD_DEST_FILTER_CUTOFF:
            filter_a_mod += mod;
            break;
        case PAD_DEST_FILTER_B:
            filter_b_mod += mod;
            break;
        case PAD_DEST_AMPLITUDE:
            amp_mod += mod * 0.5f; // ±50% amplitude modulation
            break;
        case PAD_DEST_PITCH:
            pitch_mod += mod * 0.02f; // ±2% pitch
            break;
        case PAD_DEST_OSC_B_LEVEL:
            osc_b_mod += mod;
            break;
        case PAD_DEST_FOLD_AMOUNT:
            fold_mod += mod;
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-Sample Rendering
// ═══════════════════════════════════════════════════════════════════════════════

static void render_voice(PadVoice& v, float* out_l, float* out_r,
                         float* pf_pad1_l, float* pf_pad1_r,
                         float* pf_pad2_l, float* pf_pad2_r,
                         float* post_pad1_l, float* post_pad1_r,
                         float* post_pad2_l, float* post_pad2_r,
                         int block_size) {
    if (!v.active) return;

    const PadParams& p = g_pads[v.pad_idx];
    float* target_pf_l = (v.pad_idx == 0) ? pf_pad1_l : pf_pad2_l;
    float* target_pf_r = (v.pad_idx == 0) ? pf_pad1_r : pf_pad2_r;
    float* target_post_l = (v.pad_idx == 0) ? post_pad1_l : post_pad2_l;
    float* target_post_r = (v.pad_idx == 0) ? post_pad1_r : post_pad2_r;

    // Compute osc mix levels: cosine crossfade
    float osc_a_mix = cosf(p.osc_mix * KESSHO_HALF_PI);
    float osc_b_mix = sinf(p.osc_mix * KESSHO_HALF_PI);

    // Frequencies
    float freq_a = v.base_freq * semitones_to_ratio((float)(p.osc_a_octave * 12));
    float freq_a2 = freq_a * semitones_to_ratio(p.osc_a_detune / 100.0f);
    float freq_b = v.base_freq * semitones_to_ratio((float)(p.osc_b_octave * 12));
    float freq_sub = v.base_freq * semitones_to_ratio((float)(p.sub_octave * 12));

    Waveform wave_a = wave_index_to_waveform(p.osc_a_wave);
    Waveform wave_b = wave_index_to_waveform(p.osc_b_wave);
    Waveform wave_sub = wave_index_to_waveform(p.sub_wave);

    SVFMode filt_a_mode = filter_type_to_mode(p.filter_type);
    SVFMode filt_b_mode = filter_type_to_mode(p.filter_b_type);
    int filter_a_stage_count = slope_to_stage_count(p.filter_slope);

    float eff_q = p.filter_q + p.filter_resonance * p.hardness * 5.0f;

    for (int n = 0; n < block_size; n++) {
        // LFOs
        float lfo1_val = v.lfo1.process(p.lfo1_rate, p.lfo1_wave, g_sample_rate, g_sine);
        float lfo2_val = v.lfo2.process(p.lfo2_rate, p.lfo2_wave, g_sample_rate, g_sine);

        // Modulation accumulators
        float filter_a_mod = 0, filter_b_mod = 0;
        float amp_mod = 0, pitch_mod = 0, osc_b_mod = 0, fold_mod = 0;

        apply_lfo_modulation(lfo1_val, p.lfo1_depth, p.lfo1_dest,
            filter_a_mod, filter_b_mod, amp_mod, pitch_mod, osc_b_mod, fold_mod);
        apply_lfo_modulation(lfo2_val, p.lfo2_depth, p.lfo2_dest,
            filter_a_mod, filter_b_mod, amp_mod, pitch_mod, osc_b_mod, fold_mod);

        // Mod envelope
        float mod_env_val = 0;
        if (p.mod_env_enabled) {
            mod_env_val = v.mod_env.process(g_sample_rate) * p.mod_env_depth;
            switch (p.mod_env_dest) {
                case PAD_DEST_FILTER_CUTOFF: filter_a_mod += mod_env_val; break;
                case PAD_DEST_PITCH: pitch_mod += mod_env_val * 0.05f; break;
                case PAD_DEST_OSC_B_LEVEL: osc_b_mod += mod_env_val; break;
                case PAD_DEST_FOLD_AMOUNT: fold_mod += mod_env_val; break;
            }
        }

        // Apply pitch modulation to frequencies
        float pitch_mult = 1.0f + pitch_mod;
        float eff_freq_a = freq_a * pitch_mult;
        float eff_freq_a2 = freq_a2 * pitch_mult;
        float eff_freq_b = freq_b * pitch_mult;
        float eff_freq_sub = freq_sub * pitch_mult;

        // Generate oscillators
        v.osc_a.freq = eff_freq_a;
        v.osc_a.advance(g_sample_rate);
        float sa = v.osc_a.generate(wave_a, g_sample_rate, g_sine) * p.osc_a_level;

        v.osc_a2.freq = eff_freq_a2;
        v.osc_a2.advance(g_sample_rate);
        float sa2 = v.osc_a2.generate(wave_a, g_sample_rate, g_sine) * p.osc_a_level;

        float osc_b_level = p.osc_b_level + osc_b_mod;
        osc_b_level = std::max(0.0f, std::min(1.0f, osc_b_level));
        v.osc_b.freq = eff_freq_b;
        v.osc_b.advance(g_sample_rate);
        float sb = v.osc_b.generate(wave_b, g_sample_rate, g_sine) * osc_b_level;

        float s_sub = 0;
        if (p.sub_enabled) {
            v.osc_sub.freq = eff_freq_sub;
            v.osc_sub.advance(g_sample_rate);
            s_sub = v.osc_sub.generate(wave_sub, g_sample_rate, g_sine) * p.sub_level;
        }

        // Noise
        float noise = 0;
        if (p.noise_level > 0.001f) {
            float white = v.noise_rng.next_bipolar();
            noise = (p.noise_type == 1) ? v.pink.process(white) : white;
            noise *= p.noise_level;
        }

        // Mix oscillators: A crossfade + B crossfade + sub + noise
        float sample = (sa + sa2) * 0.5f * osc_a_mix + sb * osc_b_mix + s_sub + noise;

        // Filter A
        const float cutoff_min = std::min(p.filter_cutoff_min, p.filter_cutoff_max);
        const float cutoff_max = std::max(p.filter_cutoff_min, p.filter_cutoff_max);
        float filter_cutoff = cutoff_min +
            (cutoff_max - cutoff_min) * 0.5f * (1.0f + filter_a_mod);
        filter_cutoff = apply_key_tracking(filter_cutoff, v.base_freq, p.filter_key_tracking);
        filter_cutoff = clamp_hz(filter_cutoff);

        // Low-cutoff boost
        if (filter_cutoff < 200.0f) {
            float boost = 1.0f + (200.0f - filter_cutoff) / 200.0f * 0.5f;
            sample *= boost;
        }

        float filtered;
        if (p.filter_routing == PAD_ROUTE_B_ONLY && p.filter_b_enabled) {
            // Skip filter A, use B only
            float fb_cutoff = std::max(20.0f, std::min(18000.0f, p.filter_b_cutoff * (1.0f + filter_b_mod)));
            filtered = v.filter_b.process(sample, fb_cutoff, p.filter_b_q, g_sample_rate, filt_b_mode);
        } else if (p.filter_routing == PAD_ROUTE_A_ONLY || !p.filter_b_enabled) {
            filtered = process_filter_a(v, sample, filter_cutoff, eff_q, filt_a_mode, filter_a_stage_count);
        } else {
            // Series: A → B
            filtered = process_filter_a(v, sample, filter_cutoff, eff_q, filt_a_mode, filter_a_stage_count);
            float fb_cutoff = std::max(20.0f, std::min(18000.0f, p.filter_b_cutoff * (1.0f + filter_b_mod)));
            filtered = v.filter_b.process(filtered, fb_cutoff, p.filter_b_q, g_sample_rate, filt_b_mode);
        }

        // Warmth (low shelf at 250 Hz)
        float warmth_db = (p.warmth - 0.5f) * 12.0f; // ±6 dB
        v.warmth_filter.set_low_shelf(250.0f, warmth_db, g_sample_rate);
        filtered = v.warmth_filter.process(filtered);

        // Presence (peaking at 3kHz)
        float presence_db = (p.presence - 0.5f) * 10.0f;
        v.presence_filter.set_peaking(3000.0f, presence_db, 1.5f, g_sample_rate);
        filtered = v.presence_filter.process(filtered);

        // Wave Folder (before saturation) — with LFO modulation
        float fold_amount = std::max(0.0f, std::min(1.0f, p.fold_amount + fold_mod));
        if (fold_amount > 0.01f) {
            v.folder.set_fold(fold_amount, p.fold_mode);
            filtered = v.folder.process(filtered);
        }

        // Saturation
        if (p.hardness > 0.05f) {
            v.waveshaper.set_drive(1.0f + p.hardness * 10.0f);
            filtered = v.waveshaper.process(filtered);
        }

        // Amplitude envelope
        float env_val = v.amp_env.process(g_sample_rate);
        if (v.amp_env.stage == ENV_OFF) {
            v.active = 0;
            return;
        }

        // Amplitude modulation from LFO
        float final_amp = env_val * (1.0f + amp_mod);
        final_amp = std::max(0.0f, final_amp);

        float output = filtered * final_amp * p.level * v.velocity;

        // Mono → stereo (center for now, could add pan per voice later)
        out_l[n] += output;
        out_r[n] += output;

        // Pre-fader output (for granular)
        target_pf_l[n] += filtered * final_amp * v.velocity;
        target_pf_r[n] += filtered * final_amp * v.velocity;
        target_post_l[n] += output;
        target_post_r[n] += output;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API Implementation
// ═══════════════════════════════════════════════════════════════════════════════

extern "C" {

int pad_init(float sample_rate) {
    g_sample_rate = sample_rate;
    g_sine.init();
    g_rng.seed(7777);

    for (int i = 0; i < PAD_NUM_VOICES; i++) {
        g_voices[i].reset();
        g_voices[i].pad_idx = 0; // all start on pad 1
        g_voices[i].noise_rng.seed(g_rng.next());
        g_voices[i].lfo1.rng.seed(g_rng.next());
        g_voices[i].lfo2.rng.seed(g_rng.next());
    }

    memset(g_output, 0, sizeof(g_output));
    memset(g_reverb_output, 0, sizeof(g_reverb_output));
    memset(g_prefader_pad1_output, 0, sizeof(g_prefader_pad1_output));
    memset(g_prefader_pad2_output, 0, sizeof(g_prefader_pad2_output));
    memset(g_postfader_pad1_output, 0, sizeof(g_postfader_pad1_output));
    memset(g_postfader_pad2_output, 0, sizeof(g_postfader_pad2_output));

    return 0;
}

void pad_destroy(void) {
    // No dynamic allocations to free
}

float* pad_get_output_ptr(void) { return g_output; }
float* pad_get_reverb_send_ptr(void) { return g_reverb_output; }
float* pad_get_prefader_pad1_ptr(void) { return g_prefader_pad1_output; }
float* pad_get_prefader_pad2_ptr(void) { return g_prefader_pad2_output; }
float* pad_get_postfader_pad1_ptr(void) { return g_postfader_pad1_output; }
float* pad_get_postfader_pad2_ptr(void) { return g_postfader_pad2_output; }

void pad_process_block(int block_size) {
    if (block_size > PAD_MAX_BLOCK_SIZE) block_size = PAD_MAX_BLOCK_SIZE;

    memset(g_output, 0, block_size * 2 * sizeof(float));
    memset(g_reverb_output, 0, block_size * 2 * sizeof(float));
    memset(g_prefader_pad1_output, 0, block_size * 2 * sizeof(float));
    memset(g_prefader_pad2_output, 0, block_size * 2 * sizeof(float));
    memset(g_postfader_pad1_output, 0, block_size * 2 * sizeof(float));
    memset(g_postfader_pad2_output, 0, block_size * 2 * sizeof(float));

    float dry_l[PAD_MAX_BLOCK_SIZE] = {};
    float dry_r[PAD_MAX_BLOCK_SIZE] = {};
    float pf_pad1_l[PAD_MAX_BLOCK_SIZE] = {};
    float pf_pad1_r[PAD_MAX_BLOCK_SIZE] = {};
    float pf_pad2_l[PAD_MAX_BLOCK_SIZE] = {};
    float pf_pad2_r[PAD_MAX_BLOCK_SIZE] = {};
    float post_pad1_l[PAD_MAX_BLOCK_SIZE] = {};
    float post_pad1_r[PAD_MAX_BLOCK_SIZE] = {};
    float post_pad2_l[PAD_MAX_BLOCK_SIZE] = {};
    float post_pad2_r[PAD_MAX_BLOCK_SIZE] = {};

    for (int i = 0; i < PAD_NUM_VOICES; i++) {
        if (g_voices[i].active) {
            render_voice(
                g_voices[i],
                dry_l,
                dry_r,
                pf_pad1_l,
                pf_pad1_r,
                pf_pad2_l,
                pf_pad2_r,
                post_pad1_l,
                post_pad1_r,
                post_pad2_l,
                post_pad2_r,
                block_size
            );
        }
    }

    for (int n = 0; n < block_size; n++) {
        g_output[n * 2]     = dry_l[n];
        g_output[n * 2 + 1] = dry_r[n];

        g_reverb_output[n * 2]     = (pf_pad1_l[n] + pf_pad2_l[n]) * g_reverb_send_level;
        g_reverb_output[n * 2 + 1] = (pf_pad1_r[n] + pf_pad2_r[n]) * g_reverb_send_level;

        g_prefader_pad1_output[n * 2]     = pf_pad1_l[n];
        g_prefader_pad1_output[n * 2 + 1] = pf_pad1_r[n];
        g_prefader_pad2_output[n * 2]     = pf_pad2_l[n];
        g_prefader_pad2_output[n * 2 + 1] = pf_pad2_r[n];
        g_postfader_pad1_output[n * 2]     = post_pad1_l[n];
        g_postfader_pad1_output[n * 2 + 1] = post_pad1_r[n];
        g_postfader_pad2_output[n * 2]     = post_pad2_l[n];
        g_postfader_pad2_output[n * 2 + 1] = post_pad2_r[n];
    }
}

void pad_note_on(int voice_idx, float frequency, float velocity) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES) return;
    PadVoice& v = g_voices[voice_idx];

    v.active = 1;
    v.base_freq = frequency;
    v.velocity = velocity;

    const PadParams& p = g_pads[v.pad_idx];

    // Setup oscillators
    v.osc_a.phase = 0;
    v.osc_a2.phase = 0;
    v.osc_b.phase = 0;
    v.osc_sub.phase = 0;

    // Amplitude ADSR
    v.amp_env.attack = p.attack;
    v.amp_env.decay = p.decay;
    v.amp_env.sustain = p.sustain;
    v.amp_env.release = p.release;
    v.amp_env.gate_on();

    // Mod envelope
    if (p.mod_env_enabled) {
        v.mod_env.attack = p.mod_env_attack;
        v.mod_env.decay = p.mod_env_decay;
        v.mod_env.sustain = p.mod_env_sustain;
        v.mod_env.release = p.mod_env_release;
        v.mod_env.gate_on();
    }

    // Waveshaper
    if (p.hardness > 0.05f) {
        v.waveshaper.set_drive(1.0f + p.hardness * 10.0f);
    }
}

void pad_note_off(int voice_idx) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES) return;
    PadVoice& v = g_voices[voice_idx];
    if (v.active) {
        v.amp_env.gate_off();
        if (g_pads[v.pad_idx].mod_env_enabled) {
            v.mod_env.gate_off();
        }
    }
}

void pad_kill_voice(int voice_idx) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES) return;
    g_voices[voice_idx].reset();
}

void pad_set_voice_pad(int voice_idx, int pad) {
    if (voice_idx >= 0 && voice_idx < PAD_NUM_VOICES && pad >= 0 && pad < PAD_NUM_PADS) {
        g_voices[voice_idx].pad_idx = pad;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parameter Setters
// ═══════════════════════════════════════════════════════════════════════════════

#define PAD_CHECK(idx) if ((idx) < 0 || (idx) >= PAD_NUM_PADS) return

void pad_set_osc_a_wave(int p, int v)      { PAD_CHECK(p); g_pads[p].osc_a_wave = v; }
void pad_set_osc_a_octave(int p, int v)    { PAD_CHECK(p); g_pads[p].osc_a_octave = v; }
void pad_set_osc_a_detune(int p, float v)  { PAD_CHECK(p); g_pads[p].osc_a_detune = v; }
void pad_set_osc_a_level(int p, float v)   { PAD_CHECK(p); g_pads[p].osc_a_level = v; }

void pad_set_osc_b_wave(int p, int v)      { PAD_CHECK(p); g_pads[p].osc_b_wave = v; }
void pad_set_osc_b_octave(int p, int v)    { PAD_CHECK(p); g_pads[p].osc_b_octave = v; }
void pad_set_osc_b_detune(int p, float v)  { PAD_CHECK(p); g_pads[p].osc_b_detune = v; }
void pad_set_osc_b_level(int p, float v)   { PAD_CHECK(p); g_pads[p].osc_b_level = v; }

void pad_set_osc_mix(int p, float v)       { PAD_CHECK(p); g_pads[p].osc_mix = v; }

void pad_set_sub_enabled(int p, int v)     { PAD_CHECK(p); g_pads[p].sub_enabled = v; }
void pad_set_sub_octave(int p, int v)      { PAD_CHECK(p); g_pads[p].sub_octave = v; }
void pad_set_sub_wave(int p, int v)        { PAD_CHECK(p); g_pads[p].sub_wave = v; }
void pad_set_sub_level(int p, float v)     { PAD_CHECK(p); g_pads[p].sub_level = v; }

void pad_set_noise_type(int p, int v)      { PAD_CHECK(p); g_pads[p].noise_type = v; }
void pad_set_noise_level(int p, float v)   { PAD_CHECK(p); g_pads[p].noise_level = v; }

void pad_set_hardness(int p, float v)      { PAD_CHECK(p); g_pads[p].hardness = v; }
void pad_set_warmth(int p, float v)        { PAD_CHECK(p); g_pads[p].warmth = v; }
void pad_set_presence(int p, float v)      { PAD_CHECK(p); g_pads[p].presence = v; }
void pad_set_fold_amount(int p, float v)     { PAD_CHECK(p); g_pads[p].fold_amount = std::max(0.0f, std::min(1.0f, v)); }
void pad_set_fold_mode(int p, int v)         { PAD_CHECK(p); g_pads[p].fold_mode = std::max(PAD_FOLD_BUCHLA, std::min(PAD_FOLD_SERGE, v)); }

void pad_set_filter_type(int p, int v)         { PAD_CHECK(p); g_pads[p].filter_type = v; }
void pad_set_filter_cutoff_min(int p, float v) { PAD_CHECK(p); g_pads[p].filter_cutoff_min = clamp_hz(v); }
void pad_set_filter_cutoff_max(int p, float v) { PAD_CHECK(p); g_pads[p].filter_cutoff_max = clamp_hz(v); }
void pad_set_filter_resonance(int p, float v)  { PAD_CHECK(p); g_pads[p].filter_resonance = v; }
void pad_set_filter_q(int p, float v)          { PAD_CHECK(p); g_pads[p].filter_q = v; }
void pad_set_filter_slope(int p, float v)      { PAD_CHECK(p); g_pads[p].filter_slope = std::max(12.0f, std::min(48.0f, v)); }
void pad_set_filter_key_tracking(int p, float v) { PAD_CHECK(p); g_pads[p].filter_key_tracking = std::max(0.0f, std::min(1.0f, v)); }

void pad_set_filter_b_enabled(int p, int v)    { PAD_CHECK(p); g_pads[p].filter_b_enabled = v; }
void pad_set_filter_b_type(int p, int v)       { PAD_CHECK(p); g_pads[p].filter_b_type = v; }
void pad_set_filter_b_cutoff(int p, float v)   { PAD_CHECK(p); g_pads[p].filter_b_cutoff = v; }
void pad_set_filter_b_resonance(int p, float v){ PAD_CHECK(p); g_pads[p].filter_b_resonance = v; }
void pad_set_filter_b_q(int p, float v)        { PAD_CHECK(p); g_pads[p].filter_b_q = v; }
void pad_set_filter_routing(int p, int v)      { PAD_CHECK(p); g_pads[p].filter_routing = v; }

void pad_set_attack(int p, float v)    { PAD_CHECK(p); g_pads[p].attack = v; }
void pad_set_decay(int p, float v)     { PAD_CHECK(p); g_pads[p].decay = v; }
void pad_set_sustain(int p, float v)   { PAD_CHECK(p); g_pads[p].sustain = v; }
void pad_set_release(int p, float v)   { PAD_CHECK(p); g_pads[p].release = v; }

void pad_set_lfo1_rate(int p, float v) { PAD_CHECK(p); g_pads[p].lfo1_rate = v; }
void pad_set_lfo1_depth(int p, float v){ PAD_CHECK(p); g_pads[p].lfo1_depth = v; }
void pad_set_lfo1_wave(int p, int v)   { PAD_CHECK(p); g_pads[p].lfo1_wave = v; }
void pad_set_lfo1_dest(int p, int v)   { PAD_CHECK(p); g_pads[p].lfo1_dest = v; }

void pad_set_lfo2_rate(int p, float v) { PAD_CHECK(p); g_pads[p].lfo2_rate = v; }
void pad_set_lfo2_depth(int p, float v){ PAD_CHECK(p); g_pads[p].lfo2_depth = v; }
void pad_set_lfo2_wave(int p, int v)   { PAD_CHECK(p); g_pads[p].lfo2_wave = v; }
void pad_set_lfo2_dest(int p, int v)   { PAD_CHECK(p); g_pads[p].lfo2_dest = v; }

void pad_set_mod_env_enabled(int p, int v)     { PAD_CHECK(p); g_pads[p].mod_env_enabled = v; }
void pad_set_mod_env_attack(int p, float v)    { PAD_CHECK(p); g_pads[p].mod_env_attack = v; }
void pad_set_mod_env_decay(int p, float v)     { PAD_CHECK(p); g_pads[p].mod_env_decay = v; }
void pad_set_mod_env_sustain(int p, float v)   { PAD_CHECK(p); g_pads[p].mod_env_sustain = v; }
void pad_set_mod_env_release(int p, float v)   { PAD_CHECK(p); g_pads[p].mod_env_release = v; }
void pad_set_mod_env_depth(int p, float v)     { PAD_CHECK(p); g_pads[p].mod_env_depth = v; }
void pad_set_mod_env_dest(int p, int v)        { PAD_CHECK(p); g_pads[p].mod_env_dest = v; }

void pad_set_level(int p, float v)     { PAD_CHECK(p); g_pads[p].level = v; }
void pad_set_reverb_send(float v)      { g_reverb_send_level = v; }

int pad_get_active_count(void) {
    int count = 0;
    for (int i = 0; i < PAD_NUM_VOICES; i++) {
        if (g_voices[i].active) count++;
    }
    return count;
}

} // extern "C"
