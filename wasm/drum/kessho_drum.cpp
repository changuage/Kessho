/**
 * Kessho Drum Synth — C++ Implementation
 *
 * Full port of drumSynth.ts voice synthesis (7 types) + stereo ping-pong delay.
 * Euclidean scheduling stays in JS; triggers arrive via drum_trigger().
 *
 * Architecture:
 *   - Fixed voice pool (DRUM_MAX_POLYPHONY per type, oldest-steal)
 *   - Trigger queue (ring buffer) drained at block start
 *   - Per-sample synthesis: oscillator + filter + envelope + waveshaper
 *   - Stereo ping-pong delay with per-voice send levels
 *   - PRNG for variation/noise (xoshiro128+)
 */

#include "kessho_drum.h"
#include "../common/kessho_dsp.h"
#include <cstring>
#include <cmath>
#include <algorithm>
#include <new>

using namespace kessho;

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════════════════════

struct SubParams {
    float freq = 60, decay_ms = 200, level = 0.8f, tone = 0;
    float shape = 0, pitch_env = 0, pitch_decay_ms = 50;
    float drive = 0, sub_octave = 0, attack_ms = 0;
    float variation = 0, distance = 0.5f;
};

struct KickParams {
    float freq = 55, pitch_env = 24, pitch_decay_ms = 60;
    float decay_ms = 300, level = 0.8f, click = 0.3f;
    float body = 0.5f, punch = 0.5f, tail = 0, tone = 0;
    float attack_ms = 0, variation = 0, distance = 0.5f;
};

struct ClickParams {
    float decay_ms = 30, filter = 4000, tone = 0.5f;
    float level = 0.7f, resonance = 0.5f, pitch = 2000;
    float pitch_env = 0, exciter_color = 0, attack_ms = 0;
    int   mode = DRUM_CLICK_IMPULSE, grain_count = 1;
    float grain_spread_ms = 0, stereo_width = 0;
    float variation = 0, distance = 0.5f;
};

struct BeepHiParams {
    float freq = 4000, attack_ms = 1, decay_ms = 100;
    float level = 0.6f, tone = 0.3f, inharmonic = 0;
    int   partials = 1;
    float shimmer = 0, shimmer_rate = 4, brightness = 0.5f;
    float feedback = 0, mod_env_decay = 0, noise_in_mod = 0;
    float mod_ratio = 2, mod_ratio_fine = 0.01f;
    float mod_env_end = 0.2f, noise_decay = 0;
    float variation = 0, distance = 0.5f;
};

struct BeepLoParams {
    float freq = 200, attack_ms = 1, decay_ms = 200;
    float level = 0.7f, tone = 0, pitch_env = 0, pitch_decay_ms = 50;
    float body = 0.3f, pluck = 0, pluck_damp = 0.5f;
    float modal = 0, modal_q = 10, modal_inharmonic = 0;
    float modal_spread = 0, modal_cut = 0;
    float osc_gain = 1, modal_gain = 1;
    float variation = 0, distance = 0.5f;
};

struct NoiseParams {
    float freq = 2000, decay_ms = 100, level = 0.6f;
    float q = 1, attack_ms = 1;
    int   filter_type = 0; // 0=LP, 1=HP, 2=BP, 3=notch
    float formant = 0, breath = 0;
    float filter_env_depth = 0, filter_env_decay_ms = 100;
    float density = 1, color_lfo = 0;
    float variation = 0, distance = 0.5f;
};

struct MembraneParams {
    float freq = 150, decay_ms = 500, level = 0.7f;
    float tension = 0.5f, material = 0; // 0=skin,1=metal,2=wood,3=glass,4=plastic
    float size = 150, damping = 0.3f, strike = 0.5f;
    float wire_buzz = 0, attack_ms = 1;
    float variation = 0, distance = 0.5f;
};

// Variation multipliers (same as TS computeVariation)
struct Variation {
    float vLevel = 1, vDecay = 1, vPitch = 1;
    float vBright = 1, vAttack = 1, vExcite = 1;
};

// Distance multipliers (same as TS computeDistance)
struct Distance {
    float dLevel = 1, dDecay = 1, dBright = 1;
    float dAttack = 1, dTransient = 1, dBody = 1;
    float t = 0; // bipolar -1..+1
};

// ═══════════════════════════════════════════════════════════════════════════════
// Voice State
// ═══════════════════════════════════════════════════════════════════════════════

// Maximum partials for beepHi
#define BEEP_HI_MAX_PARTIALS 8
// Maximum modal modes for membrane/beepLo
#define MODAL_MAX_MODES 8
// Karplus-Strong max delay (for beepLo pluck)
#define KS_MAX_DELAY 2048

struct DrumVoice {
    int   voice_type = -1;
    int   active = 0;
    float age = 0;           // samples since trigger (for oldest-steal)

    // Common oscillator state
    Oscillator osc1;
    Oscillator osc2;         // secondary (harmonics, body, etc.)
    Oscillator sub_osc;      // sub-octave for sub voice
    Oscillator mod_osc;      // FM modulator for beepHi

    // Pitch envelope
    float pitch_start = 440;
    float pitch_target = 440;
    float pitch_decay_samples = 0;
    float pitch_progress = 0;

    // Amplitude envelope (AD)
    ADEnvelope env;

    // Secondary envelopes (for click, body, tail, etc.)
    ADEnvelope env2;
    ADEnvelope env3;

    // Filter
    SVF filter1;
    SVF filter2;
    SVFMode filter_mode = SVF_LOWPASS;
    float filter_cutoff = 4000;
    float filter_q = 1;

    // Filter envelope
    float filter_env_start = 4000;
    float filter_env_target = 4000;
    float filter_env_decay_samples = 0;
    float filter_env_progress = 0;

    // Waveshaper
    WaveshaperCurve waveshaper;
    float drive = 0;

    // Noise state (LFSR-based)
    PRNG noise_rng;
    PinkNoise pink;

    // FM modulation
    float fm_index = 0;
    float fm_mod_env_value = 0;
    float fm_mod_env_decay_rate = 0;
    float fm_mod_env_end = 0;

    // Shimmer LFO
    float shimmer_phase = 0;
    float shimmer_rate = 0;
    float shimmer_depth = 0;

    // Modal resonator bank (for membrane & beepLo modal)
    struct ModalMode {
        SVF   filter;
        float freq;        // mode center frequency (Hz)
        float q;           // mode resonance Q
        float level;
        float decay_rate;  // per-sample multiplier
        float env_value;
    };
    ModalMode modes[MODAL_MAX_MODES];
    int num_modes = 0;

    // Karplus-Strong delay line (for beepLo pluck)
    float ks_buffer[KS_MAX_DELAY] = {};
    int   ks_write_pos = 0;
    int   ks_delay_len = 0;
    float ks_damp = 0.5f;
    float ks_z1 = 0; // LP filter state

    // BeepHi partials
    struct Partial {
        Oscillator osc;
        ADEnvelope env;
    };
    Partial partials[BEEP_HI_MAX_PARTIALS];
    int num_partials = 0;

    // Per-voice output level & pan
    float output_level = 0;
    float pan = 0; // -1..+1

    // Delay send level for this trigger
    float delay_send = 0;

    // Wire buzz (membrane)
    float wire_env_value = 0;
    float wire_env_decay_rate = 0;
    float wire_level = 0;
    SVF   wire_hp;
    SVF   wire_bp;

    // Click exciter color levels
    float click_impulse_level = 0;
    float click_tonal_level = 0;
    float click_noise_level = 0;

    // Click granular grains
    #define CLICK_MAX_GRAINS 8
    struct ClickGrain {
        float delay_samples;  // onset offset in samples
        float pan;            // -1..+1
        float level;
        float filter_freq;
        SVF   filter;
        ADEnvelope env;
    };
    ClickGrain grains[CLICK_MAX_GRAINS];
    int num_grains = 0;

    // Kick tail (filtered noise sustain layer)
    float tail_level = 0;
    float tail_cutoff = 200;
    ADEnvelope tail_env;

    // Noise formant (parallel 3-band formant filter bank)
    SVF formant_filters[3];
    float formant_freqs[3] = {};
    float formant_q = 5;
    float formant_mix = 0; // 0 = off

    // Noise breath (AM LFO)
    float breath_phase = 0;
    float breath_rate = 0;
    float breath_depth = 0;

    // Noise color LFO (filter frequency modulation)
    float color_lfo_phase = 0;
    float color_lfo_rate = 0;
    float color_lfo_depth = 0;

    // BeepHi FM feedback
    float feedback_delay_sample = 0;
    float feedback_gain = 0;

    void reset() {
        active = 0;
        age = 0;
        osc1 = {};
        osc2 = {};
        sub_osc = {};
        mod_osc = {};
        env.reset();
        env2.reset();
        env3.reset();
        filter1.reset();
        filter2.reset();
        waveshaper.set_drive(0);
        memset(ks_buffer, 0, sizeof(ks_buffer));
        ks_write_pos = 0;
        ks_z1 = 0;
        num_modes = 0;
        num_partials = 0;
        wire_env_value = 0;
        shimmer_phase = 0;
        fm_mod_env_value = 0;
        pink.reset();
        wire_hp.reset();
        wire_bp.reset();
        tail_level = 0;
        tail_env.reset();
        formant_mix = 0;
        for (int i = 0; i < 3; i++) formant_filters[i].reset();
        breath_depth = 0;
        breath_phase = 0;
        color_lfo_depth = 0;
        color_lfo_phase = 0;
        feedback_gain = 0;
        feedback_delay_sample = 0;
        num_grains = 0;
    }
};

struct DrumTriggerEntry {
    int   voice_type;
    float velocity;
    int   sample_offset;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Engine State
// ═══════════════════════════════════════════════════════════════════════════════

struct DrumState {
    float g_sample_rate = 48000;
    SineTable g_sine;
    PRNG g_rng;

    DrumVoice g_voices[DRUM_TOTAL_VOICES];

    SubParams      g_sub;
    KickParams     g_kick;
    ClickParams    g_click;
    BeepHiParams   g_beep_hi;
    BeepLoParams   g_beep_lo;
    NoiseParams    g_noise;
    MembraneParams g_membrane;

    DrumTriggerEntry g_trigger_queue[DRUM_TRIGGER_QUEUE_SIZE] = {};
    int g_trigger_read = 0;
    int g_trigger_write = 0;

    float g_morph_override = -1;
    float g_distance_override = -1;
    float g_pitch_override = 0;
    float g_ratchet_decay_cap = 1e10f;
    float g_ratchet_attack_cap = 1e10f;

    StereoPingPongDelay g_delay;
    float g_delay_sends[DRUM_NUM_VOICE_TYPES] = {};

    float g_master_level = 0.8f;
    float g_reverb_send_level = 0.1f;

    float g_output[DRUM_MAX_BLOCK_SIZE * 2] = {};
    float g_reverb_output[DRUM_MAX_BLOCK_SIZE * 2] = {};

    float g_voice_buf_l[DRUM_MAX_BLOCK_SIZE] = {};
    float g_voice_buf_r[DRUM_MAX_BLOCK_SIZE] = {};
    int initialized = 0;
};

static DrumState g_default_drum;
static thread_local DrumState* g_drum_slot = &g_default_drum;

static DrumState& drum_current_state() {
    return *g_drum_slot;
}

class ScopedDrumState {
public:
    explicit ScopedDrumState(DrumState* state) : previous_(g_drum_slot) {
        g_drum_slot = state != nullptr ? state : &g_default_drum;
    }

    ~ScopedDrumState() {
        g_drum_slot = previous_;
    }

    ScopedDrumState(const ScopedDrumState&) = delete;
    ScopedDrumState& operator=(const ScopedDrumState&) = delete;

private:
    DrumState* previous_;
};

struct KesshoDrumInstance {
    DrumState state;
};

#define g_sample_rate drum_current_state().g_sample_rate
#define g_sine drum_current_state().g_sine
#define g_rng drum_current_state().g_rng
#define g_voices drum_current_state().g_voices
#define g_sub drum_current_state().g_sub
#define g_kick drum_current_state().g_kick
#define g_click drum_current_state().g_click
#define g_beep_hi drum_current_state().g_beep_hi
#define g_beep_lo drum_current_state().g_beep_lo
#define g_noise drum_current_state().g_noise
#define g_membrane drum_current_state().g_membrane
#define g_trigger_queue drum_current_state().g_trigger_queue
#define g_trigger_read drum_current_state().g_trigger_read
#define g_trigger_write drum_current_state().g_trigger_write
#define g_morph_override drum_current_state().g_morph_override
#define g_distance_override drum_current_state().g_distance_override
#define g_pitch_override drum_current_state().g_pitch_override
#define g_ratchet_decay_cap drum_current_state().g_ratchet_decay_cap
#define g_ratchet_attack_cap drum_current_state().g_ratchet_attack_cap
#define g_delay drum_current_state().g_delay
#define g_delay_sends drum_current_state().g_delay_sends
#define g_master_level drum_current_state().g_master_level
#define g_reverb_send_level drum_current_state().g_reverb_send_level
#define g_output drum_current_state().g_output
#define g_reverb_output drum_current_state().g_reverb_output
#define g_voice_buf_l drum_current_state().g_voice_buf_l
#define g_voice_buf_r drum_current_state().g_voice_buf_r
#define g_initialized drum_current_state().initialized

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

static Variation compute_variation(float variation, PRNG& rng) {
    Variation v;
    if (variation < 0.001f) return v;
    float offset = rng.next_triangular() * variation;
    v.vLevel   = 1.0f + offset * 0.60f;
    v.vDecay   = 1.0f + offset * 0.40f;
    v.vPitch   = 1.0f + offset * 0.02f;
    v.vBright  = 1.0f + offset * 0.80f;
    v.vAttack  = 1.0f / (1.0f + offset * 0.60f);
    v.vExcite  = 1.0f + offset * 0.80f;
    return v;
}

static Distance compute_distance(float distance) {
    Distance d;
    float t = (distance - 0.5f) * 2.0f; // -1..+1
    d.t = t;
    if (fabsf(t) < 0.01f) return d;

    d.dBright = t >= 0
        ? 1.0f + log2f(1.0f + t) * 1.1f
        : 1.0f / (1.0f + log2f(1.0f + fabsf(t)) * 3.5f);
    d.dLevel     = 1.0f - t * 0.4f;
    d.dDecay     = t >= 0 ? 1.0f - t * 0.8f : 1.0f + fabsf(t) * 7.0f;
    d.dAttack    = t >= 0 ? 1.0f - t * 0.55f : 1.0f + fabsf(t) * 1.0f;
    d.dTransient = t >= 0 ? 1.0f + t * 0.3f : 1.0f - fabsf(t) * 0.5f;
    d.dBody      = t >= 0 ? 1.0f - t * 0.6f : 1.0f + fabsf(t) * 0.3f;
    return d;
}

static float pitch_tuning_ratio(float override_semitones) {
    return A432_RATIO * semitones_to_ratio(override_semitones);
}

static float resolve_distance(float param_distance) {
    return g_distance_override >= 0 ? g_distance_override : param_distance;
}

static float ms_to_samples(float ms) {
    return ms * g_sample_rate / 1000.0f;
}

// Find oldest voice of given type for stealing, or first inactive
static int find_voice_slot(int voice_type) {
    int base = voice_type * DRUM_MAX_POLYPHONY;
    int oldest_idx = base;
    float oldest_age = -1;

    for (int i = base; i < base + DRUM_MAX_POLYPHONY; i++) {
        if (!g_voices[i].active) return i;
        if (g_voices[i].age > oldest_age) {
            oldest_age = g_voices[i].age;
            oldest_idx = i;
        }
    }
    // Steal oldest
    g_voices[oldest_idx].reset();
    return oldest_idx;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Voice Trigger Functions
// ═══════════════════════════════════════════════════════════════════════════════

static void trigger_sub(DrumVoice& v, float velocity) {
    const SubParams& p = g_sub;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));
    float tuning = pitch_tuning_ratio(g_pitch_override);

    float freq = p.freq * var.vPitch * tuning;
    float attack = std::max(0.0001f, (p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack);
    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float level = velocity * p.level * var.vLevel * dist.dLevel;
    attack = std::min(attack, g_ratchet_attack_cap);

    v.voice_type = DRUM_VOICE_SUB;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_SUB];

    // Main oscillator
    v.osc1.freq = freq;
    v.osc1.phase = 0;
    v.filter_mode = SVF_LOWPASS;
    v.filter_cutoff = 20000;
    v.filter_q = 0.7f;

    // Pitch envelope
    v.pitch_start = freq * semitones_to_ratio(p.pitch_env);
    v.pitch_target = freq;
    v.pitch_decay_samples = ms_to_samples(p.pitch_decay_ms);
    v.pitch_progress = 0;

    // Amplitude envelope
    v.env.trigger(level, attack, decay);

    // Drive
    v.drive = p.drive;
    if (p.drive > 0.05f) {
        v.waveshaper.set_drive(p.drive * 10.0f);
    }

    // Harmonic oscillator (tone)
    float eff_tone = p.tone * dist.dBright;
    if (eff_tone > 0.05f) {
        v.osc2.freq = freq * 2.0f;
        v.osc2.phase = 0;
        v.env2.trigger(eff_tone * 0.3f * level, attack, decay * 0.7f);
    }

    // Sub-octave
    if (p.sub_octave > 0.05f) {
        v.sub_osc.freq = freq / 2.0f;
        v.sub_osc.phase = 0;
        v.env3.trigger(p.sub_octave * 0.5f * level, attack, decay * 1.2f);
    }
}

static void trigger_kick(DrumVoice& v, float velocity) {
    const KickParams& p = g_kick;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));
    float tuning = pitch_tuning_ratio(g_pitch_override);

    float freq = p.freq * var.vPitch * tuning;
    float attack = std::min(std::max(0.0001f, (p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack), g_ratchet_attack_cap);
    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float level = velocity * p.level * var.vLevel * dist.dLevel;

    v.voice_type = DRUM_VOICE_KICK;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_KICK];

    // Main sine oscillator
    v.osc1.freq = freq;
    v.osc1.phase = 0;

    // Pitch envelope
    float eff_punch = p.punch * dist.dTransient;
    float punch_mult = 0.5f + eff_punch * 1.5f;
    v.pitch_start = freq * semitones_to_ratio(p.pitch_env * punch_mult);
    v.pitch_target = freq;
    float pitch_decay = std::min(0.5f, (p.pitch_decay_ms / 1000.0f));
    v.pitch_decay_samples = pitch_decay * g_sample_rate;
    v.pitch_progress = 0;

    // Amplitude envelope
    v.env.trigger(level, attack, decay);

    // Drive/tone
    float eff_tone = p.tone * dist.dBright;
    v.drive = eff_tone;
    if (eff_tone > 0.05f) {
        v.waveshaper.set_drive(eff_tone * 5.0f);
    }

    // Click transient
    float eff_click = p.click * dist.dTransient * var.vBright;
    if (eff_click > 0.05f) {
        v.osc2.freq = (3000.0f + eff_punch * 2000.0f) * dist.dBright;
        v.osc2.phase = 0;
        float click_lev = eff_click * velocity * p.level * 0.5f * var.vLevel * dist.dLevel;
        v.env2.trigger(click_lev, 0.0001f, 0.005f);
    }

    // Body layer
    float body = p.body * dist.dBody;
    if (body > 0.1f) {
        v.filter1.reset();
        v.filter_cutoff = freq * 4.0f * dist.dBright;
        v.filter_q = 0.7f;
        v.filter_mode = SVF_LOWPASS;
        float body_lev = body * velocity * p.level * 0.4f * var.vLevel * dist.dLevel;
        v.env3.trigger(body_lev, attack, decay * 0.6f);
    }

    // Tail layer — LP-filtered noise for room sustain
    float tail = p.tail;
    if (tail > 0.1f) {
        v.noise_rng.seed(g_rng.next());
        v.tail_cutoff = freq * 2.0f * dist.dBright;
        float tail_level = tail * velocity * p.level * 0.2f * var.vLevel * dist.dLevel;
        v.tail_level = tail_level;
        // Slow fade-in (10% of decay), long fade-out (1.5× decay)
        v.tail_env.trigger(tail_level, decay * 0.1f, decay * 1.5f);
        v.filter2.reset();
    }
}

static void trigger_click(DrumVoice& v, float velocity) {
    const ClickParams& p = g_click;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));

    float level = std::min(1.0f, velocity * p.level * var.vLevel * dist.dLevel);
    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float attack = std::min(std::max(0.0001f, (p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack), g_ratchet_attack_cap);
    float eff_filter = p.filter * var.vBright * dist.dBright;
    float eff_res = p.resonance * var.vBright;
    float eff_tone = p.tone * dist.dBright;
    float eff_pitch = p.pitch * var.vPitch * pitch_tuning_ratio(g_pitch_override);

    v.voice_type = DRUM_VOICE_CLICK;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_CLICK];

    // Noise source (initialized via PRNG)
    v.noise_rng.seed(g_rng.next());

    if (p.mode == DRUM_CLICK_GRANULAR) {
        // Granular mode: multiple micro-noise grains
        int grain_count = std::max(1, std::min(CLICK_MAX_GRAINS, p.grain_count));
        float spread_samples = (p.grain_spread_ms / 1000.0f) * g_sample_rate;
        float grain_level = level / sqrtf((float)grain_count);
        v.num_grains = grain_count;

        for (int i = 0; i < grain_count; i++) {
            v.grains[i].delay_samples = g_rng.next() * spread_samples;
            v.grains[i].pan = (g_rng.next_bipolar()) * p.stereo_width;
            v.grains[i].level = grain_level;
            v.grains[i].filter_freq = eff_filter * (0.8f + g_rng.next() * 0.4f);
            v.grains[i].filter.reset();
            float grain_decay = decay * (0.5f + g_rng.next() * 0.5f);
            v.grains[i].env.trigger(grain_level, attack, grain_decay);
        }

        // Main envelope not used for granular mode
        v.env.trigger(level, attack, decay);
        return;
    }

    // Continuous exciter color mode
    float color = p.exciter_color;

    // Impulse layer (dominant when color ~0)
    v.click_impulse_level = std::max(0.0f, 1.0f - color * 2.0f);
    // Tonal layer (peaks at color ~0.5)
    v.click_tonal_level = 1.0f - fabsf(color - 0.5f) * 2.0f;
    // Noise layer (dominant when color ~1)
    v.click_noise_level = std::max(0.0f, (color - 0.5f) * 2.0f);

    // Noise source (initialized via PRNG)
    v.noise_rng.seed(g_rng.next());

    // Filter for impulse/noise layers
    v.filter1.reset();
    v.filter_cutoff = eff_filter;
    v.filter_q = 0.5f + eff_res * 15.0f;

    // Configure based on dominant mode
    float actual_decay;
    if (color < 0.33f) {
        // Impulse dominant
        v.filter_mode = SVF_HIGHPASS;
        actual_decay = decay * (0.1f + eff_tone * 0.2f);
    } else if (color > 0.67f) {
        // Noise dominant
        v.filter_mode = SVF_BANDPASS;
        v.filter_q = 1.0f + eff_res * 10.0f;
        actual_decay = decay * (0.5f + eff_tone * 0.5f);
    } else {
        // Tonal dominant
        v.osc1.freq = eff_pitch;
        v.osc1.phase = 0;
        v.pitch_start = eff_pitch * semitones_to_ratio(p.pitch_env);
        v.pitch_target = eff_pitch;
        v.pitch_decay_samples = decay * 0.3f * g_sample_rate;
        v.pitch_progress = 0;
        v.filter_mode = SVF_LOWPASS;
        actual_decay = decay;
    }

    v.env.trigger(level, attack, actual_decay);
}

static void trigger_beep_hi(DrumVoice& v, float velocity) {
    const BeepHiParams& p = g_beep_hi;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));
    float tuning = pitch_tuning_ratio(g_pitch_override);

    float freq = p.freq * var.vPitch * tuning;
    float attack = std::min(std::max(0.0001f, (p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack), g_ratchet_attack_cap);
    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float level = std::min(1.0f, velocity * p.level * var.vLevel * dist.dLevel * dist.dBody);
    float eff_brightness = p.brightness * dist.dBright;

    v.voice_type = DRUM_VOICE_BEEP_HI;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_BEEP_HI];

    // Brightness filter
    v.filter1.reset();
    v.filter_cutoff = freq * (1.0f + eff_brightness * 4.0f);
    v.filter_q = 0.707f;
    v.filter_mode = SVF_LOWPASS;

    // Shimmer LFO
    v.shimmer_phase = 0;
    v.shimmer_rate = p.shimmer_rate * var.vBright;
    v.shimmer_depth = p.shimmer * 0.3f * level;

    // Partials
    int num_p = std::max(1, std::min(BEEP_HI_MAX_PARTIALS, p.partials));
    v.num_partials = num_p;
    for (int i = 0; i < num_p; i++) {
        float harmonic = (float)(i + 1);
        float inharm_offset = powf(harmonic, 1.0f + p.inharmonic * 0.5f) - harmonic;
        float partial_freq = freq * (harmonic + inharm_offset * p.inharmonic);
        float partial_level = level / (float)num_p / sqrtf(harmonic);

        v.partials[i].osc.freq = partial_freq;
        v.partials[i].osc.phase = 0;
        v.partials[i].env.trigger(partial_level, attack, decay);
    }

    // FM modulation
    float eff_tone = p.tone * dist.dBright;
    if (eff_tone > 0.1f) {
        float eff_ratio = p.mod_ratio + p.mod_ratio_fine;
        v.mod_osc.freq = freq * eff_ratio;
        v.mod_osc.phase = 0;
        v.fm_index = eff_tone * freq * 0.3f;

        // FM self-feedback (DX7-style)
        float eff_feedback = p.feedback + dist.t * 0.3f; // CL_ED: [0.3, 0, 'add']
        if (fabsf(eff_feedback) > 0.01f) {
            v.feedback_gain = eff_feedback * freq * 0.5f;
            v.feedback_delay_sample = 0;
        }

        // Mod envelope
        if (p.mod_env_decay > 0.01f) {
            float env_dur = 0.005f + p.mod_env_decay * 0.295f;
            v.fm_mod_env_value = v.fm_index * (1.0f + p.mod_env_decay * 4.0f);
            v.fm_mod_env_end = std::max(0.01f, v.fm_index * p.mod_env_end);
            v.fm_mod_env_decay_rate = fast_expf(-1.0f / (env_dur * g_sample_rate));
        } else {
            v.fm_mod_env_value = v.fm_index;
            v.fm_mod_env_end = v.fm_index;
            v.fm_mod_env_decay_rate = 1.0f; // no decay
        }
    } else {
        v.fm_index = 0;
    }

    // Noise-in-mod: inject noise into carrier frequency for metallic transients
    if (p.noise_in_mod > 0.01f) {
        v.noise_rng.seed(g_rng.next());
        // Noise depth and duration stored in filter_env fields (reused for beepHi)
        float noise_depth = p.noise_in_mod * freq * 0.5f;
        float noise_dur = 0.005f + p.noise_decay * (attack + decay * 0.8f);
        v.filter_env_start = noise_depth;
        v.filter_env_target = 0.01f;
        v.filter_env_decay_samples = noise_dur * g_sample_rate;
        v.filter_env_progress = 0;
    }

    // Main envelope (for shimmer modulation target)
    v.env.trigger(level, attack, decay);
}

static void trigger_beep_lo(DrumVoice& v, float velocity) {
    const BeepLoParams& p = g_beep_lo;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));
    float tuning = pitch_tuning_ratio(g_pitch_override);

    float freq = p.freq * var.vPitch * tuning;
    float attack = std::min(std::max(0.0001f, (p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack), g_ratchet_attack_cap);
    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float level = std::min(1.0f, velocity * p.level * var.vLevel * dist.dLevel);

    v.voice_type = DRUM_VOICE_BEEP_LO;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_BEEP_LO];

    // Equal-power crossfade between osc and modal
    float osc_amp = cosf(p.modal * KESSHO_HALF_PI) * p.osc_gain;
    float modal_amp = sinf(p.modal * KESSHO_HALF_PI) * p.modal_gain;

    // Modal resonator bank
    if (modal_amp > 0.01f) {
        float harmonic_ratios[] = {1, 2, 3, 4, 5, 6};
        float bell_ratios[] = {1, 2.0f, 3.0f, 4.2f, 5.4f, 6.8f};
        int num_modes = 6;
        v.num_modes = num_modes;

        for (int i = 0; i < num_modes; i++) {
            float h = harmonic_ratios[i];
            float b = bell_ratios[i];
            float base_ratio = h + (b - h) * p.modal_inharmonic;

            // modalSpread: warp partial spacing
            float ratio;
            if (fabsf(p.modal_spread) > 0.01f) {
                float normalized = base_ratio / bell_ratios[num_modes - 1]; // 0..1
                if (p.modal_spread > 0) {
                    ratio = bell_ratios[num_modes - 1] * powf(normalized, 1.0f - p.modal_spread * 0.7f);
                } else {
                    ratio = bell_ratios[num_modes - 1] * powf(normalized, 1.0f + fabsf(p.modal_spread) * 2.0f);
                }
                ratio = std::max(0.5f, ratio);
            } else {
                ratio = base_ratio;
            }

            float mode_freq = std::min(freq * ratio, 18000.0f);
            float mode_level = modal_amp * level * dist.dBright / ((float)num_modes * powf((float)(i+1), 0.3f + p.body * 0.5f));

            // modalCut: spectral tilt across modes
            if (fabsf(p.modal_cut) > 0.01f) {
                float normalized_idx = (float)i / (float)(num_modes - 1);
                if (p.modal_cut > 0) {
                    mode_level *= powf(normalized_idx, p.modal_cut * 1.5f);
                } else {
                    mode_level *= powf(1.0f - normalized_idx, fabsf(p.modal_cut) * 1.5f);
                }
            }

            v.modes[i].filter.reset();
            v.modes[i].freq = mode_freq;
            v.modes[i].q = p.modal_q;
            v.modes[i].level = mode_level;
            v.modes[i].decay_rate = fast_expf(-1.0f / (decay * g_sample_rate / (1.0f + (float)i * 0.15f)));
            v.modes[i].env_value = mode_level;
        }

        // Noise excitation burst (stored in PRNG)
        v.noise_rng.seed(g_rng.next());
    }

    // Oscillator path
    if (osc_amp > 0.01f) {
        // Karplus-Strong pluck
        if (p.pluck > 0.3f) {
            // Init KS delay line
            int delay_len = std::max(2, std::min(KS_MAX_DELAY - 1, (int)(g_sample_rate / freq)));
            v.ks_delay_len = delay_len;
            v.ks_write_pos = 0;
            v.ks_damp = p.pluck_damp * dist.dBright;
            v.ks_z1 = 0;

            // Fill with noise burst
            for (int i = 0; i < delay_len; i++) {
                v.ks_buffer[i] = g_rng.next_bipolar() * level * p.pluck;
            }
            v.env.trigger(osc_amp * level, attack, decay);
        } else {
            // Standard oscillator
            v.osc1.freq = freq;
            v.osc1.phase = 0;

            // Pitch envelope
            v.pitch_start = freq * semitones_to_ratio(p.pitch_env);
            v.pitch_target = freq;
            v.pitch_decay_samples = ms_to_samples(p.pitch_decay_ms);
            v.pitch_progress = 0;

            // Body resonance filter
            if (p.body > 0.1f) {
                v.filter1.reset();
                v.filter_cutoff = freq * 4.0f * dist.dBright;
                v.filter_q = 0.7f;
                v.filter_mode = SVF_LOWPASS;
            }

            v.env.trigger(osc_amp * level, attack, decay);
        }
    }
}

static void trigger_noise(DrumVoice& v, float velocity) {
    const NoiseParams& p = g_noise;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));

    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float attack = std::min(std::max(0.0001f, (p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack), g_ratchet_attack_cap);
    float level = std::min(1.0f, velocity * p.level * var.vLevel * dist.dLevel);
    float eff_filter = std::max(20.0f, std::min(20000.0f, p.freq * var.vBright * dist.dBright));

    v.voice_type = DRUM_VOICE_NOISE;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_NOISE];

    // Noise source
    v.noise_rng.seed(g_rng.next());

    // Main filter
    v.filter1.reset();
    v.filter_cutoff = eff_filter;
    v.filter_q = p.q * var.vBright;

    SVFMode fmode;
    switch (p.filter_type) {
        case 1: fmode = SVF_HIGHPASS; break;
        case 2: fmode = SVF_BANDPASS; break;
        case 3: fmode = SVF_NOTCH; break;
        default: fmode = SVF_LOWPASS; break;
    }
    v.filter_mode = fmode;

    // Filter envelope
    float env_depth = p.filter_env_depth * eff_filter;
    v.filter_env_start = std::max(20.0f, std::min(20000.0f, eff_filter + env_depth));
    v.filter_env_target = eff_filter;
    v.filter_env_decay_samples = ms_to_samples(p.filter_env_decay_ms);
    v.filter_env_progress = 0;

    // Amplitude envelope
    v.env.trigger(level, attack, decay);

    // Formant filter bank — 3-band parallel bandpass ("a" vowel)
    if (p.formant > 0.05f) {
        float base_freqs[] = {700.0f, 1200.0f, 2500.0f};
        v.formant_mix = p.formant;
        v.formant_q = 5.0f + p.formant * 10.0f;
        for (int i = 0; i < 3; i++) {
            v.formant_filters[i].reset();
            v.formant_freqs[i] = std::min(20000.0f, base_freqs[i] * dist.dBright);
        }
    }

    // Breath AM LFO (8-12 Hz random rate)
    if (p.breath > 0.05f) {
        v.breath_rate = 8.0f + g_rng.next() * 4.0f;
        v.breath_depth = p.breath * 0.3f * level;
        v.breath_phase = 0;
    }

    // Color LFO (filter frequency modulation)
    if (p.color_lfo > 0.01f) {
        v.color_lfo_rate = p.color_lfo;
        v.color_lfo_depth = eff_filter * 0.3f;
        v.color_lfo_phase = 0;
    }
}

static void trigger_membrane(DrumVoice& v, float velocity) {
    const MembraneParams& p = g_membrane;
    Variation var = compute_variation(p.variation, g_rng);
    Distance dist = compute_distance(resolve_distance(p.distance));
    float tuning = pitch_tuning_ratio(g_pitch_override);

    float freq = p.size * var.vPitch * tuning;
    float attack = std::min((p.attack_ms / 1000.0f) * var.vAttack * dist.dAttack, g_ratchet_attack_cap);
    float decay = std::min((p.decay_ms / 1000.0f) * var.vDecay * dist.dDecay, g_ratchet_decay_cap);
    float level = std::min(1.0f, velocity * p.level * var.vLevel * dist.dLevel);

    v.voice_type = DRUM_VOICE_MEMBRANE;
    v.active = 1;
    v.age = 0;
    v.output_level = level;
    v.pan = 0;
    v.delay_send = g_delay_sends[DRUM_VOICE_MEMBRANE];

    // Material properties
    struct MatProps { float inharm, damp, bright; };
    MatProps mat;
    int mat_idx = (int)p.material;
    switch (mat_idx) {
        case 1: mat = {0.3f, 0.5f, 1.5f}; break;   // metal
        case 2: mat = {0.15f, 1.3f, 0.7f}; break;   // wood
        case 3: mat = {0.4f, 0.3f, 2.0f}; break;    // glass
        case 4: mat = {0.1f, 0.8f, 1.2f}; break;    // plastic
        default: mat = {0.0f, 1.0f, 1.0f}; break;    // skin
    }

    // Membrane modal ratios (circular drum membrane)
    float mode_ratios[] = {1.0f, 1.59f, 2.14f, 2.30f, 2.65f, 2.92f, 3.16f, 3.50f};
    int num_modes = std::min(8, (int)MODAL_MAX_MODES);
    v.num_modes = num_modes;

    float inharm = mat.inharm + p.tension * 0.0f; // tension affects pitch, not inharmonicity
    float exc_pos = p.strike;

    // Noise excitation
    v.noise_rng.seed(g_rng.next());

    for (int m = 0; m < num_modes; m++) {
        float ratio = mode_ratios[m] + inharm * ((float)m * 0.08f);
        float pos_amp = (m == 0) ? 1.0f : (1.0f - fabsf(exc_pos - 0.5f) * ((m % 2 == 0) ? 1.5f : 0.3f));
        float mode_freq = std::min(18000.0f, freq * ratio * (0.5f + p.tension * 1.0f));
        float mode_q = (5.0f + (1.0f - p.damping) * 30.0f) * mat.damp / (1.0f + (float)m * 0.3f);
        float mode_level = level * std::max(0.05f, pos_amp) * mat.bright / (1.0f + (float)m * 0.4f);

        v.modes[m].filter.reset();
        v.modes[m].freq = mode_freq;
        v.modes[m].q = mode_q;
        v.modes[m].level = mode_level;
        v.modes[m].decay_rate = fast_expf(-1.0f / (decay * g_sample_rate / (1.0f + (float)m * 0.15f)));
        v.modes[m].env_value = mode_level;
    }

    // Pitch envelope applied to mode frequencies (handled in render)
    v.pitch_start = semitones_to_ratio(p.freq); // used differently: store pitch env amount
    v.pitch_target = 1.0f;
    v.pitch_decay_samples = 0.05f * g_sample_rate; // quick pitch drop

    // Body oscillator
    if (dist.dBody > 0.1f) {
        v.osc1.freq = freq;
        v.osc1.phase = 0;
        v.env.trigger(level * dist.dBody * 0.4f, attack, decay);
    }

    // Wire buzz
    if (p.wire_buzz > 0.01f) {
        v.wire_level = level * p.wire_buzz * 0.5f;
        float wire_dec = decay * 0.3f + p.wire_buzz * decay * 1.4f;
        v.wire_env_value = v.wire_level;
        v.wire_env_decay_rate = fast_expf(-1.0f / (wire_dec * g_sample_rate));
        v.wire_hp.reset();
        v.wire_bp.reset();
    }

    // Overall envelope (for master output)
    v.env2.trigger(level, attack, decay);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-Sample Voice Rendering
// ═══════════════════════════════════════════════════════════════════════════════

static void render_voice(DrumVoice& v, float* out_l, float* out_r, int block_size) {
    if (!v.active) return;

    for (int n = 0; n < block_size; n++) {
        float sample = 0;
        v.age += 1;

        switch (v.voice_type) {
        case DRUM_VOICE_SUB: {
            // Pitch envelope interpolation
            if (v.pitch_progress < v.pitch_decay_samples) {
                float t = v.pitch_progress / v.pitch_decay_samples;
                v.osc1.freq = v.pitch_start * powf(v.pitch_target / v.pitch_start, t);
                v.pitch_progress += 1;
            }
            v.osc1.advance(g_sample_rate);
            sample = v.osc1.generate(WAVE_SINE, g_sample_rate, g_sine);

            // Drive
            if (v.drive > 0.05f) {
                sample = v.waveshaper.process(sample);
            }

            float env_val = v.env.process(g_sample_rate);
            sample *= env_val;

            // Harmonic overtone
            if (v.env2.active) {
                v.osc2.advance(g_sample_rate);
                sample += v.osc2.generate(WAVE_SINE, g_sample_rate, g_sine) * v.env2.process(g_sample_rate);
            }

            // Sub-octave
            if (v.env3.active) {
                v.sub_osc.advance(g_sample_rate);
                sample += v.sub_osc.generate(WAVE_SINE, g_sample_rate, g_sine) * v.env3.process(g_sample_rate);
            }

            if (!v.env.active && !v.env2.active && !v.env3.active) v.active = 0;
            break;
        }

        case DRUM_VOICE_KICK: {
            // Pitch envelope
            if (v.pitch_progress < v.pitch_decay_samples) {
                float t = v.pitch_progress / v.pitch_decay_samples;
                v.osc1.freq = v.pitch_start * powf(v.pitch_target / v.pitch_start, t);
                v.pitch_progress += 1;
            }
            v.osc1.advance(g_sample_rate);
            sample = v.osc1.generate(WAVE_SINE, g_sample_rate, g_sine);

            // Drive
            if (v.drive > 0.05f) {
                sample = v.waveshaper.process(sample);
            }

            float env_val = v.env.process(g_sample_rate);
            sample *= env_val;

            // Click transient
            if (v.env2.active) {
                v.osc2.advance(g_sample_rate);
                sample += v.osc2.generate(WAVE_TRIANGLE, g_sample_rate, g_sine) * v.env2.process(g_sample_rate);
            }

            // Body layer (triangle through LP filter)
            if (v.env3.active) {
                float body_sample = fast_sinf(v.osc1.phase * KESSHO_TWO_PI * 1.5f) * v.env3.process(g_sample_rate);
                body_sample = v.filter1.process(body_sample, v.filter_cutoff, v.filter_q, g_sample_rate, SVF_LOWPASS);
                sample += body_sample;
            }

            // Tail layer (LP-filtered noise)
            if (v.tail_env.active) {
                float tail_noise = v.noise_rng.next_bipolar();
                tail_noise = v.filter2.process(tail_noise, v.tail_cutoff, 2.0f, g_sample_rate, SVF_LOWPASS);
                sample += tail_noise * v.tail_env.process(g_sample_rate);
            }

            if (!v.env.active && !v.env2.active && !v.env3.active && !v.tail_env.active) v.active = 0;
            break;
        }

        case DRUM_VOICE_CLICK: {
            if (v.num_grains > 0) {
                // Granular mode: render each grain with individual panning
                float noise = v.noise_rng.next_bipolar();
                bool any_active = false;
                float grain_l = 0, grain_r = 0;
                for (int g = 0; g < v.num_grains; g++) {
                    if (v.age < v.grains[g].delay_samples) { any_active = true; continue; }
                    if (!v.grains[g].env.active) continue;
                    any_active = true;
                    float filtered = v.grains[g].filter.process(noise, v.grains[g].filter_freq, 2.0f, g_sample_rate, SVF_HIGHPASS);
                    float gsample = filtered * v.grains[g].env.process(g_sample_rate);
                    // Equal-power pan
                    float pan_angle = (v.grains[g].pan + 1.0f) * 0.5f; // 0..1
                    grain_l += gsample * cosf(pan_angle * KESSHO_HALF_PI);
                    grain_r += gsample * sinf(pan_angle * KESSHO_HALF_PI);
                }
                out_l[n] += grain_l;
                out_r[n] += grain_r;
                if (!any_active) v.active = 0;
                break;
            }

            // Pitch envelope for tonal mode
            if (v.pitch_progress < v.pitch_decay_samples && v.click_tonal_level > 0.01f) {
                float t = v.pitch_progress / v.pitch_decay_samples;
                v.osc1.freq = v.pitch_start * powf(v.pitch_target / v.pitch_start, t);
                v.pitch_progress += 1;
            }

            float noise = v.noise_rng.next_bipolar();
            float env_val = v.env.process(g_sample_rate);

            // Impulse layer
            if (v.click_impulse_level > 0.01f) {
                float imp = v.filter1.process(noise, v.filter_cutoff, v.filter_q, g_sample_rate, SVF_HIGHPASS);
                sample += imp * v.click_impulse_level * env_val;
            }

            // Tonal layer
            if (v.click_tonal_level > 0.01f) {
                v.osc1.advance(g_sample_rate);
                float tonal = v.osc1.generate(WAVE_SINE, g_sample_rate, g_sine);
                sample += tonal * v.click_tonal_level * env_val;
            }

            // Noise layer
            if (v.click_noise_level > 0.01f) {
                float ns = v.filter2.process(noise, v.filter_cutoff, 1.0f + v.filter_q * 0.5f, g_sample_rate, SVF_BANDPASS);
                sample += ns * v.click_noise_level * env_val;
            }

            if (!v.env.active) v.active = 0;
            break;
        }

        case DRUM_VOICE_BEEP_HI: {
            // FM modulator
            float fm_val = 0;
            if (v.fm_index > 0) {
                // Self-feedback: add delayed output back to frequency
                if (v.feedback_gain != 0) {
                    v.mod_osc.freq += v.feedback_delay_sample * v.feedback_gain;
                }

                v.mod_osc.advance(g_sample_rate);
                float mod_raw = v.mod_osc.generate(WAVE_SINE, g_sample_rate, g_sine);

                // Store for feedback delay (one sample)
                if (v.feedback_gain != 0) {
                    v.mod_osc.freq -= v.feedback_delay_sample * v.feedback_gain;
                    v.feedback_delay_sample = mod_raw;
                }

                fm_val = mod_raw * v.fm_mod_env_value;

                // Mod envelope decay
                if (v.fm_mod_env_decay_rate < 1.0f) {
                    v.fm_mod_env_value = v.fm_mod_env_end + (v.fm_mod_env_value - v.fm_mod_env_end) * v.fm_mod_env_decay_rate;
                }
            }

            // Noise-in-mod: inject noise into carrier frequency
            float noise_fm = 0;
            if (v.filter_env_progress < v.filter_env_decay_samples) {
                float t = v.filter_env_progress / v.filter_env_decay_samples;
                float noise_depth = v.filter_env_start + (v.filter_env_target - v.filter_env_start) * t;
                noise_fm = v.noise_rng.next_bipolar() * noise_depth;
                v.filter_env_progress += 1;
            }

            // Sum partials
            float partial_sum = 0;
            bool any_active = false;
            for (int i = 0; i < v.num_partials; i++) {
                float freq_offset = 0;
                // Apply FM to first partial
                if (i == 0) {
                    freq_offset = fm_val + noise_fm;
                    if (freq_offset != 0) v.partials[i].osc.freq += freq_offset;
                }
                v.partials[i].osc.advance(g_sample_rate);
                float p_sample = v.partials[i].osc.generate(WAVE_SINE, g_sample_rate, g_sine);
                float p_env = v.partials[i].env.process(g_sample_rate);
                partial_sum += p_sample * p_env;
                if (v.partials[i].env.active) any_active = true;
                if (i == 0 && freq_offset != 0) {
                    v.partials[i].osc.freq -= freq_offset; // Restore
                }
            }

            // Brightness filter
            sample = v.filter1.process(partial_sum, v.filter_cutoff, v.filter_q, g_sample_rate, SVF_LOWPASS);

            // Shimmer LFO
            if (v.shimmer_depth > 0) {
                v.shimmer_phase += v.shimmer_rate / g_sample_rate;
                if (v.shimmer_phase >= 1.0f) v.shimmer_phase -= 1.0f;
                float lfo = g_sine.lookup(v.shimmer_phase);
                sample *= (1.0f + lfo * v.shimmer_depth);
            }

            if (!any_active) v.active = 0;
            break;
        }

        case DRUM_VOICE_BEEP_LO: {
            float env_val = v.env.process(g_sample_rate);

            // Karplus-Strong pluck
            if (v.ks_delay_len > 0) {
                // Read from delay
                int read_pos = ((v.ks_write_pos - v.ks_delay_len) % KS_MAX_DELAY + KS_MAX_DELAY) % KS_MAX_DELAY;
                float ks_sample = v.ks_buffer[read_pos];

                // LP damping filter
                float filtered = ks_sample * (1.0f - v.ks_damp) + v.ks_z1 * v.ks_damp;
                v.ks_z1 = filtered;

                // Write feedback
                v.ks_buffer[v.ks_write_pos] = filtered * 0.996f; // slight decay
                v.ks_write_pos = (v.ks_write_pos + 1) % KS_MAX_DELAY;

                sample = ks_sample * env_val;
            } else {
                // Standard oscillator
                if (v.pitch_progress < v.pitch_decay_samples) {
                    float t = v.pitch_progress / v.pitch_decay_samples;
                    v.osc1.freq = v.pitch_start * powf(v.pitch_target / v.pitch_start, t);
                    v.pitch_progress += 1;
                }
                v.osc1.advance(g_sample_rate);
                sample = v.osc1.generate(WAVE_SINE, g_sample_rate, g_sine) * env_val;
            }

            // Modal resonator bank
            if (v.num_modes > 0) {
                float excite = v.noise_rng.next_bipolar() * (v.age < 256 ? (1.0f - v.age / 256.0f) : 0.0f) * 40.0f;
                for (int m = 0; m < v.num_modes; m++) {
                    float mode_out = v.modes[m].filter.process(excite, v.modes[m].freq, v.modes[m].q, g_sample_rate, SVF_BANDPASS);
                    v.modes[m].env_value *= v.modes[m].decay_rate;
                    sample += mode_out * v.modes[m].env_value;
                }
            }

            if (!v.env.active && v.num_modes == 0) v.active = 0;
            else if (v.num_modes > 0 && v.modes[0].env_value < 0.0001f) v.active = 0;
            break;
        }

        case DRUM_VOICE_NOISE: {
            float noise = v.noise_rng.next_bipolar();

            // Filter envelope
            float current_cutoff = v.filter_cutoff;
            if (v.filter_env_progress < v.filter_env_decay_samples) {
                float t = v.filter_env_progress / v.filter_env_decay_samples;
                current_cutoff = v.filter_env_start + (v.filter_env_target - v.filter_env_start) * t;
                v.filter_env_progress += 1;
            }

            // Color LFO (filter frequency modulation)
            if (v.color_lfo_depth > 0) {
                v.color_lfo_phase += v.color_lfo_rate / g_sample_rate;
                if (v.color_lfo_phase >= 1.0f) v.color_lfo_phase -= 1.0f;
                current_cutoff += g_sine.lookup(v.color_lfo_phase) * v.color_lfo_depth;
                current_cutoff = std::max(20.0f, std::min(20000.0f, current_cutoff));
            }

            // Apply filter
            sample = v.filter1.process(noise, current_cutoff, v.filter_q, g_sample_rate, v.filter_mode);

            // Formant filter bank (parallel bandpass sum)
            if (v.formant_mix > 0) {
                float formant_sum = 0;
                for (int f = 0; f < 3; f++) {
                    formant_sum += v.formant_filters[f].process(noise, v.formant_freqs[f], v.formant_q, g_sample_rate, SVF_BANDPASS);
                }
                sample += formant_sum * (v.formant_mix / 3.0f);
            }

            // Amplitude envelope
            float env_val = v.env.process(g_sample_rate);
            sample *= env_val;

            // Breath AM LFO
            if (v.breath_depth > 0) {
                v.breath_phase += v.breath_rate / g_sample_rate;
                if (v.breath_phase >= 1.0f) v.breath_phase -= 1.0f;
                sample *= (1.0f + g_sine.lookup(v.breath_phase) * v.breath_depth);
            }

            if (!v.env.active) v.active = 0;
            break;
        }

        case DRUM_VOICE_MEMBRANE: {
            // Noise excitation (short burst)
            float excite = 0;
            float burst_samples = 0.005f * g_sample_rate;
            if (v.age < burst_samples) {
                float t = v.age / burst_samples;
                excite = v.noise_rng.next_bipolar() * (1.0f - t) * 40.0f;
            }

            // Modal resonator bank
            float modal_sum = 0;
            for (int m = 0; m < v.num_modes; m++) {
                float mode_out = v.modes[m].filter.process(excite, v.modes[m].freq, v.modes[m].q, g_sample_rate, SVF_BANDPASS);
                v.modes[m].env_value *= v.modes[m].decay_rate;
                modal_sum += mode_out * v.modes[m].env_value;
            }

            // Body oscillator
            float body_sample = 0;
            if (v.env.active) {
                v.osc1.advance(g_sample_rate);
                body_sample = v.osc1.generate(WAVE_SINE, g_sample_rate, g_sine) * v.env.process(g_sample_rate);
            }

            // Wire buzz
            float wire_sample = 0;
            if (v.wire_level > 0.001f) {
                float wire_noise = v.noise_rng.next_bipolar();
                wire_noise = v.wire_hp.process(wire_noise, 2000.0f, 1.0f, g_sample_rate, SVF_HIGHPASS);
                wire_noise = v.wire_bp.process(wire_noise, 5000.0f, 3.0f, g_sample_rate, SVF_BANDPASS);
                wire_sample = wire_noise * v.wire_env_value;
                v.wire_env_value *= v.wire_env_decay_rate;
            }

            sample = modal_sum + body_sample + wire_sample;

            // Master envelope
            float master_env = v.env2.process(g_sample_rate);
            sample *= master_env;

            if (!v.env2.active) v.active = 0;
            break;
        }

        default:
            v.active = 0;
            break;
        }

        // Accumulate to output with stereo panning
        if (v.pan != 0) {
            float pan_angle = (v.pan + 1.0f) * 0.5f; // -1..+1 → 0..1
            out_l[n] += sample * cosf(pan_angle * KESSHO_HALF_PI);
            out_r[n] += sample * sinf(pan_angle * KESSHO_HALF_PI);
        } else {
            out_l[n] += sample;
            out_r[n] += sample;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API Implementation
// ═══════════════════════════════════════════════════════════════════════════════

extern "C" {

int drum_init(float sample_rate) {
    if (g_initialized) {
        g_delay.destroy();
        g_initialized = 0;
    }

    g_sample_rate = sample_rate;
    g_sine.init();
    g_rng.seed(42);

    for (int i = 0; i < DRUM_TOTAL_VOICES; i++) {
        g_voices[i].reset();
    }

    // Initialize delay (max 4 seconds)
    int max_delay_samples = (int)(sample_rate * DRUM_DELAY_MAX_SECONDS) + 1;
    g_delay.init(max_delay_samples);
    g_delay.set_filter(4000.0f, sample_rate);

    g_trigger_read = 0;
    g_trigger_write = 0;

    memset(g_output, 0, sizeof(g_output));
    memset(g_reverb_output, 0, sizeof(g_reverb_output));
    memset(g_delay_sends, 0, sizeof(g_delay_sends));
    g_initialized = 1;

    return 0;
}

void drum_destroy(void) {
    if (g_initialized) {
        g_delay.destroy();
        g_initialized = 0;
    }
    memset(g_output, 0, sizeof(g_output));
    memset(g_reverb_output, 0, sizeof(g_reverb_output));
}

float* drum_get_output_ptr(void) {
    return g_output;
}

float* drum_get_reverb_send_ptr(void) {
    return g_reverb_output;
}

void drum_process_block(int block_size) {
    if (block_size > DRUM_MAX_BLOCK_SIZE) block_size = DRUM_MAX_BLOCK_SIZE;

    // Clear output
    memset(g_output, 0, block_size * 2 * sizeof(float));
    memset(g_reverb_output, 0, block_size * 2 * sizeof(float));

    // Drain trigger queue
    while (g_trigger_read != g_trigger_write) {
        DrumTriggerEntry& trig = g_trigger_queue[g_trigger_read];
        int slot = find_voice_slot(trig.voice_type);
        DrumVoice& v = g_voices[slot];
        v.reset();

        switch (trig.voice_type) {
            case DRUM_VOICE_SUB:      trigger_sub(v, trig.velocity); break;
            case DRUM_VOICE_KICK:     trigger_kick(v, trig.velocity); break;
            case DRUM_VOICE_CLICK:    trigger_click(v, trig.velocity); break;
            case DRUM_VOICE_BEEP_HI:  trigger_beep_hi(v, trig.velocity); break;
            case DRUM_VOICE_BEEP_LO:  trigger_beep_lo(v, trig.velocity); break;
            case DRUM_VOICE_NOISE:    trigger_noise(v, trig.velocity); break;
            case DRUM_VOICE_MEMBRANE: trigger_membrane(v, trig.velocity); break;
        }

        g_trigger_read = (g_trigger_read + 1) % DRUM_TRIGGER_QUEUE_SIZE;
    }

    // Clear scratch buffers
    memset(g_voice_buf_l, 0, block_size * sizeof(float));
    memset(g_voice_buf_r, 0, block_size * sizeof(float));

    // Render all active voices
    // Accumulate pre-delay dry signal
    float dry_l[DRUM_MAX_BLOCK_SIZE] = {};
    float dry_r[DRUM_MAX_BLOCK_SIZE] = {};
    float delay_input_l[DRUM_MAX_BLOCK_SIZE] = {};
    float delay_input_r[DRUM_MAX_BLOCK_SIZE] = {};

    for (int i = 0; i < DRUM_TOTAL_VOICES; i++) {
        if (!g_voices[i].active) continue;

        memset(g_voice_buf_l, 0, block_size * sizeof(float));
        memset(g_voice_buf_r, 0, block_size * sizeof(float));

        render_voice(g_voices[i], g_voice_buf_l, g_voice_buf_r, block_size);

        float send = g_voices[i].delay_send;
        for (int n = 0; n < block_size; n++) {
            dry_l[n] += g_voice_buf_l[n];
            dry_r[n] += g_voice_buf_r[n];
            delay_input_l[n] += g_voice_buf_l[n] * send;
            delay_input_r[n] += g_voice_buf_r[n] * send;
        }
    }

    // Process delay
    for (int n = 0; n < block_size; n++) {
        float del_l, del_r;
        g_delay.process_sample(delay_input_l[n], delay_input_r[n], del_l, del_r);

        float out_l = (dry_l[n] + (del_l - delay_input_l[n])) * g_master_level;
        float out_r = (dry_r[n] + (del_r - delay_input_r[n])) * g_master_level;

        g_output[n * 2]     = out_l;
        g_output[n * 2 + 1] = out_r;

        g_reverb_output[n * 2]     = (dry_l[n] + (del_l - delay_input_l[n])) * g_reverb_send_level;
        g_reverb_output[n * 2 + 1] = (dry_r[n] + (del_r - delay_input_r[n])) * g_reverb_send_level;
    }
}

void drum_trigger(int voice_type, float velocity, int sample_offset) {
    if (voice_type < 0 || voice_type >= DRUM_NUM_VOICE_TYPES) return;
    int next_write = (g_trigger_write + 1) % DRUM_TRIGGER_QUEUE_SIZE;
    if (next_write == g_trigger_read) return; // queue full

    g_trigger_queue[g_trigger_write] = { voice_type, velocity, sample_offset };
    g_trigger_write = next_write;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parameter Setters
// ═══════════════════════════════════════════════════════════════════════════════

// --- Sub ---
void drum_set_sub_freq(float v) { g_sub.freq = v; }
void drum_set_sub_decay(float v) { g_sub.decay_ms = v; }
void drum_set_sub_level(float v) { g_sub.level = v; }
void drum_set_sub_tone(float v) { g_sub.tone = v; }
void drum_set_sub_shape(float v) { g_sub.shape = v; }
void drum_set_sub_pitch_env(float v) { g_sub.pitch_env = v; }
void drum_set_sub_pitch_decay(float v) { g_sub.pitch_decay_ms = v; }
void drum_set_sub_drive(float v) { g_sub.drive = v; }
void drum_set_sub_sub_octave(float v) { g_sub.sub_octave = v; }
void drum_set_sub_attack(float v) { g_sub.attack_ms = v; }
void drum_set_sub_variation(float v) { g_sub.variation = v; }
void drum_set_sub_distance(float v) { g_sub.distance = v; }

// --- Kick ---
void drum_set_kick_freq(float v) { g_kick.freq = v; }
void drum_set_kick_pitch_env(float v) { g_kick.pitch_env = v; }
void drum_set_kick_pitch_decay(float v) { g_kick.pitch_decay_ms = v; }
void drum_set_kick_decay(float v) { g_kick.decay_ms = v; }
void drum_set_kick_level(float v) { g_kick.level = v; }
void drum_set_kick_click(float v) { g_kick.click = v; }
void drum_set_kick_body(float v) { g_kick.body = v; }
void drum_set_kick_punch(float v) { g_kick.punch = v; }
void drum_set_kick_tail(float v) { g_kick.tail = v; }
void drum_set_kick_tone(float v) { g_kick.tone = v; }
void drum_set_kick_attack(float v) { g_kick.attack_ms = v; }
void drum_set_kick_variation(float v) { g_kick.variation = v; }
void drum_set_kick_distance(float v) { g_kick.distance = v; }

// --- Click ---
void drum_set_click_decay(float v) { g_click.decay_ms = v; }
void drum_set_click_filter(float v) { g_click.filter = v; }
void drum_set_click_tone(float v) { g_click.tone = v; }
void drum_set_click_level(float v) { g_click.level = v; }
void drum_set_click_resonance(float v) { g_click.resonance = v; }
void drum_set_click_pitch(float v) { g_click.pitch = v; }
void drum_set_click_pitch_env(float v) { g_click.pitch_env = v; }
void drum_set_click_mode(int v) { g_click.mode = v; }
void drum_set_click_grain_count(int v) { g_click.grain_count = v; }
void drum_set_click_grain_spread(float v) { g_click.grain_spread_ms = v; }
void drum_set_click_stereo_width(float v) { g_click.stereo_width = v; }
void drum_set_click_exciter_color(float v) { g_click.exciter_color = v; }
void drum_set_click_attack(float v) { g_click.attack_ms = v; }
void drum_set_click_variation(float v) { g_click.variation = v; }
void drum_set_click_distance(float v) { g_click.distance = v; }

// --- BeepHi ---
void drum_set_beep_hi_freq(float v) { g_beep_hi.freq = v; }
void drum_set_beep_hi_attack(float v) { g_beep_hi.attack_ms = v; }
void drum_set_beep_hi_decay(float v) { g_beep_hi.decay_ms = v; }
void drum_set_beep_hi_level(float v) { g_beep_hi.level = v; }
void drum_set_beep_hi_tone(float v) { g_beep_hi.tone = v; }
void drum_set_beep_hi_inharmonic(float v) { g_beep_hi.inharmonic = v; }
void drum_set_beep_hi_partials(int v) { g_beep_hi.partials = v; }
void drum_set_beep_hi_shimmer(float v) { g_beep_hi.shimmer = v; }
void drum_set_beep_hi_shimmer_rate(float v) { g_beep_hi.shimmer_rate = v; }
void drum_set_beep_hi_brightness(float v) { g_beep_hi.brightness = v; }
void drum_set_beep_hi_feedback(float v) { g_beep_hi.feedback = v; }
void drum_set_beep_hi_mod_env_decay(float v) { g_beep_hi.mod_env_decay = v; }
void drum_set_beep_hi_noise_in_mod(float v) { g_beep_hi.noise_in_mod = v; }
void drum_set_beep_hi_mod_ratio(float v) { g_beep_hi.mod_ratio = v; }
void drum_set_beep_hi_mod_ratio_fine(float v) { g_beep_hi.mod_ratio_fine = v; }
void drum_set_beep_hi_mod_env_end(float v) { g_beep_hi.mod_env_end = v; }
void drum_set_beep_hi_noise_decay(float v) { g_beep_hi.noise_decay = v; }
void drum_set_beep_hi_variation(float v) { g_beep_hi.variation = v; }
void drum_set_beep_hi_distance(float v) { g_beep_hi.distance = v; }

// --- BeepLo ---
void drum_set_beep_lo_freq(float v) { g_beep_lo.freq = v; }
void drum_set_beep_lo_attack(float v) { g_beep_lo.attack_ms = v; }
void drum_set_beep_lo_decay(float v) { g_beep_lo.decay_ms = v; }
void drum_set_beep_lo_level(float v) { g_beep_lo.level = v; }
void drum_set_beep_lo_tone(float v) { g_beep_lo.tone = v; }
void drum_set_beep_lo_pitch_env(float v) { g_beep_lo.pitch_env = v; }
void drum_set_beep_lo_pitch_decay(float v) { g_beep_lo.pitch_decay_ms = v; }
void drum_set_beep_lo_body(float v) { g_beep_lo.body = v; }
void drum_set_beep_lo_pluck(float v) { g_beep_lo.pluck = v; }
void drum_set_beep_lo_pluck_damp(float v) { g_beep_lo.pluck_damp = v; }
void drum_set_beep_lo_modal(float v) { g_beep_lo.modal = v; }
void drum_set_beep_lo_modal_q(float v) { g_beep_lo.modal_q = v; }
void drum_set_beep_lo_modal_inharmonic(float v) { g_beep_lo.modal_inharmonic = v; }
void drum_set_beep_lo_modal_spread(float v) { g_beep_lo.modal_spread = v; }
void drum_set_beep_lo_modal_cut(float v) { g_beep_lo.modal_cut = v; }
void drum_set_beep_lo_osc_gain(float v) { g_beep_lo.osc_gain = v; }
void drum_set_beep_lo_modal_gain(float v) { g_beep_lo.modal_gain = v; }
void drum_set_beep_lo_variation(float v) { g_beep_lo.variation = v; }
void drum_set_beep_lo_distance(float v) { g_beep_lo.distance = v; }

// --- Noise ---
void drum_set_noise_freq(float v) { g_noise.freq = v; }
void drum_set_noise_decay(float v) { g_noise.decay_ms = v; }
void drum_set_noise_level(float v) { g_noise.level = v; }
void drum_set_noise_q(float v) { g_noise.q = v; }
void drum_set_noise_filter_type(int v) { g_noise.filter_type = v; }
void drum_set_noise_attack(float v) { g_noise.attack_ms = v; }
void drum_set_noise_formant(float v) { g_noise.formant = v; }
void drum_set_noise_breath(float v) { g_noise.breath = v; }
void drum_set_noise_filter_env_depth(float v) { g_noise.filter_env_depth = v; }
void drum_set_noise_filter_env_decay(float v) { g_noise.filter_env_decay_ms = v; }
void drum_set_noise_density(float v) { g_noise.density = v; }
void drum_set_noise_color_lfo(float v) { g_noise.color_lfo = v; }
void drum_set_noise_variation(float v) { g_noise.variation = v; }
void drum_set_noise_distance(float v) { g_noise.distance = v; }

// --- Membrane ---
void drum_set_membrane_freq(float v) { g_membrane.freq = v; }
void drum_set_membrane_decay(float v) { g_membrane.decay_ms = v; }
void drum_set_membrane_level(float v) { g_membrane.level = v; }
void drum_set_membrane_tension(float v) { g_membrane.tension = v; }
void drum_set_membrane_material(float v) { g_membrane.material = v; }
void drum_set_membrane_size(float v) { g_membrane.size = v; }
void drum_set_membrane_damping(float v) { g_membrane.damping = v; }
void drum_set_membrane_strike(float v) { g_membrane.strike = v; }
void drum_set_membrane_wire_buzz(float v) { g_membrane.wire_buzz = v; }
void drum_set_membrane_attack(float v) { g_membrane.attack_ms = v; }
void drum_set_membrane_variation(float v) { g_membrane.variation = v; }
void drum_set_membrane_distance(float v) { g_membrane.distance = v; }

// --- Delay ---
void drum_set_delay_enabled(int v) { g_delay.enabled = v != 0; }
void drum_set_delay_time_l(float v) { g_delay.time_l = v; }
void drum_set_delay_time_r(float v) { g_delay.time_r = v; }
void drum_set_delay_feedback(float v) { g_delay.feedback = v; }
void drum_set_delay_filter(float v) { g_delay.set_filter(v, g_sample_rate); }
void drum_set_delay_mix(float v) { g_delay.mix = v; }
void drum_set_delay_send(int voice_type, float level) {
    if (voice_type >= 0 && voice_type < DRUM_NUM_VOICE_TYPES) {
        g_delay_sends[voice_type] = level;
    }
}

// --- Per-trigger overrides ---
void drum_set_trigger_morph(float v) { g_morph_override = v; }
void drum_set_trigger_distance(float v) { g_distance_override = v; }
void drum_set_trigger_pitch(float v) { g_pitch_override = v; }
void drum_set_trigger_ratchet_cap(float d, float a) {
    g_ratchet_decay_cap = d;
    g_ratchet_attack_cap = a;
}
void drum_clear_trigger_overrides(void) {
    g_morph_override = -1;
    g_distance_override = -1;
    g_pitch_override = 0;
    g_ratchet_decay_cap = 1e10f;
    g_ratchet_attack_cap = 1e10f;
}

// --- Global ---
void drum_set_master_level(float v) { g_master_level = v; }
void drum_set_reverb_send(float v) { g_reverb_send_level = v; }
void drum_set_rng_seed(unsigned int v) { g_rng.seed(v); }

int drum_get_active_count(void) {
    int count = 0;
    for (int i = 0; i < DRUM_TOTAL_VOICES; i++) {
        if (g_voices[i].active) count++;
    }
    return count;
}

KesshoDrumInstance* drum_instance_create(float sample_rate) {
    KesshoDrumInstance* instance = new (std::nothrow) KesshoDrumInstance{};
    if (!instance) return nullptr;

    int init_result = 0;
    {
        ScopedDrumState scoped(&instance->state);
        init_result = drum_init(sample_rate);
    }

    if (init_result != 0) {
        delete instance;
        return nullptr;
    }

    return instance;
}

void drum_instance_destroy(KesshoDrumInstance* instance) {
    if (!instance) return;
    {
        ScopedDrumState scoped(&instance->state);
        drum_destroy();
    }
    delete instance;
}

int drum_instance_reset(KesshoDrumInstance* instance, float sample_rate) {
    if (!instance) return 0;
    ScopedDrumState scoped(&instance->state);
    return drum_init(sample_rate) == 0 ? 1 : 0;
}

float* drum_instance_get_output_ptr(KesshoDrumInstance* instance) {
    if (!instance) return nullptr;
    ScopedDrumState scoped(&instance->state);
    return drum_get_output_ptr();
}

float* drum_instance_get_reverb_send_ptr(KesshoDrumInstance* instance) {
    if (!instance) return nullptr;
    ScopedDrumState scoped(&instance->state);
    return drum_get_reverb_send_ptr();
}

void drum_instance_process_block(KesshoDrumInstance* instance, int block_size) {
    if (!instance) return;
    ScopedDrumState scoped(&instance->state);
    drum_process_block(block_size);
}

void drum_instance_trigger(KesshoDrumInstance* instance, int voice_type, float velocity, int sample_offset) {
    if (!instance) return;
    ScopedDrumState scoped(&instance->state);
    drum_trigger(voice_type, velocity, sample_offset);
}

#define DRUM_INSTANCE_SETTER1(name, type_a) \
    void drum_instance_##name(KesshoDrumInstance* instance, type_a a) { \
        if (!instance) return; \
        ScopedDrumState scoped(&instance->state); \
        drum_##name(a); \
    }

#define DRUM_INSTANCE_SETTER2(name, type_a, type_b) \
    void drum_instance_##name(KesshoDrumInstance* instance, type_a a, type_b b) { \
        if (!instance) return; \
        ScopedDrumState scoped(&instance->state); \
        drum_##name(a, b); \
    }

DRUM_INSTANCE_SETTER1(set_sub_freq, float)
DRUM_INSTANCE_SETTER1(set_sub_decay, float)
DRUM_INSTANCE_SETTER1(set_sub_level, float)
DRUM_INSTANCE_SETTER1(set_sub_tone, float)
DRUM_INSTANCE_SETTER1(set_sub_shape, float)
DRUM_INSTANCE_SETTER1(set_sub_pitch_env, float)
DRUM_INSTANCE_SETTER1(set_sub_pitch_decay, float)
DRUM_INSTANCE_SETTER1(set_sub_drive, float)
DRUM_INSTANCE_SETTER1(set_sub_sub_octave, float)
DRUM_INSTANCE_SETTER1(set_sub_attack, float)
DRUM_INSTANCE_SETTER1(set_sub_variation, float)
DRUM_INSTANCE_SETTER1(set_sub_distance, float)

DRUM_INSTANCE_SETTER1(set_kick_freq, float)
DRUM_INSTANCE_SETTER1(set_kick_pitch_env, float)
DRUM_INSTANCE_SETTER1(set_kick_pitch_decay, float)
DRUM_INSTANCE_SETTER1(set_kick_decay, float)
DRUM_INSTANCE_SETTER1(set_kick_level, float)
DRUM_INSTANCE_SETTER1(set_kick_click, float)
DRUM_INSTANCE_SETTER1(set_kick_body, float)
DRUM_INSTANCE_SETTER1(set_kick_punch, float)
DRUM_INSTANCE_SETTER1(set_kick_tail, float)
DRUM_INSTANCE_SETTER1(set_kick_tone, float)
DRUM_INSTANCE_SETTER1(set_kick_attack, float)
DRUM_INSTANCE_SETTER1(set_kick_variation, float)
DRUM_INSTANCE_SETTER1(set_kick_distance, float)

DRUM_INSTANCE_SETTER1(set_click_decay, float)
DRUM_INSTANCE_SETTER1(set_click_filter, float)
DRUM_INSTANCE_SETTER1(set_click_tone, float)
DRUM_INSTANCE_SETTER1(set_click_level, float)
DRUM_INSTANCE_SETTER1(set_click_resonance, float)
DRUM_INSTANCE_SETTER1(set_click_pitch, float)
DRUM_INSTANCE_SETTER1(set_click_pitch_env, float)
DRUM_INSTANCE_SETTER1(set_click_mode, int)
DRUM_INSTANCE_SETTER1(set_click_grain_count, int)
DRUM_INSTANCE_SETTER1(set_click_grain_spread, float)
DRUM_INSTANCE_SETTER1(set_click_stereo_width, float)
DRUM_INSTANCE_SETTER1(set_click_exciter_color, float)
DRUM_INSTANCE_SETTER1(set_click_attack, float)
DRUM_INSTANCE_SETTER1(set_click_variation, float)
DRUM_INSTANCE_SETTER1(set_click_distance, float)

DRUM_INSTANCE_SETTER1(set_beep_hi_freq, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_attack, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_decay, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_level, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_tone, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_inharmonic, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_partials, int)
DRUM_INSTANCE_SETTER1(set_beep_hi_shimmer, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_shimmer_rate, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_brightness, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_feedback, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_mod_env_decay, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_noise_in_mod, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_mod_ratio, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_mod_ratio_fine, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_mod_env_end, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_noise_decay, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_variation, float)
DRUM_INSTANCE_SETTER1(set_beep_hi_distance, float)

DRUM_INSTANCE_SETTER1(set_beep_lo_freq, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_attack, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_decay, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_level, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_tone, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_pitch_env, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_pitch_decay, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_body, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_pluck, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_pluck_damp, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_modal, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_modal_q, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_modal_inharmonic, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_modal_spread, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_modal_cut, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_osc_gain, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_modal_gain, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_variation, float)
DRUM_INSTANCE_SETTER1(set_beep_lo_distance, float)

DRUM_INSTANCE_SETTER1(set_noise_freq, float)
DRUM_INSTANCE_SETTER1(set_noise_decay, float)
DRUM_INSTANCE_SETTER1(set_noise_level, float)
DRUM_INSTANCE_SETTER1(set_noise_q, float)
DRUM_INSTANCE_SETTER1(set_noise_filter_type, int)
DRUM_INSTANCE_SETTER1(set_noise_attack, float)
DRUM_INSTANCE_SETTER1(set_noise_formant, float)
DRUM_INSTANCE_SETTER1(set_noise_breath, float)
DRUM_INSTANCE_SETTER1(set_noise_filter_env_depth, float)
DRUM_INSTANCE_SETTER1(set_noise_filter_env_decay, float)
DRUM_INSTANCE_SETTER1(set_noise_density, float)
DRUM_INSTANCE_SETTER1(set_noise_color_lfo, float)
DRUM_INSTANCE_SETTER1(set_noise_variation, float)
DRUM_INSTANCE_SETTER1(set_noise_distance, float)

DRUM_INSTANCE_SETTER1(set_membrane_freq, float)
DRUM_INSTANCE_SETTER1(set_membrane_decay, float)
DRUM_INSTANCE_SETTER1(set_membrane_level, float)
DRUM_INSTANCE_SETTER1(set_membrane_tension, float)
DRUM_INSTANCE_SETTER1(set_membrane_material, float)
DRUM_INSTANCE_SETTER1(set_membrane_size, float)
DRUM_INSTANCE_SETTER1(set_membrane_damping, float)
DRUM_INSTANCE_SETTER1(set_membrane_strike, float)
DRUM_INSTANCE_SETTER1(set_membrane_wire_buzz, float)
DRUM_INSTANCE_SETTER1(set_membrane_attack, float)
DRUM_INSTANCE_SETTER1(set_membrane_variation, float)
DRUM_INSTANCE_SETTER1(set_membrane_distance, float)

DRUM_INSTANCE_SETTER1(set_delay_enabled, int)
DRUM_INSTANCE_SETTER1(set_delay_time_l, float)
DRUM_INSTANCE_SETTER1(set_delay_time_r, float)
DRUM_INSTANCE_SETTER1(set_delay_feedback, float)
DRUM_INSTANCE_SETTER1(set_delay_filter, float)
DRUM_INSTANCE_SETTER1(set_delay_mix, float)
DRUM_INSTANCE_SETTER2(set_delay_send, int, float)

DRUM_INSTANCE_SETTER1(set_trigger_morph, float)
DRUM_INSTANCE_SETTER1(set_trigger_distance, float)
DRUM_INSTANCE_SETTER1(set_trigger_pitch, float)
DRUM_INSTANCE_SETTER2(set_trigger_ratchet_cap, float, float)

void drum_instance_clear_trigger_overrides(KesshoDrumInstance* instance) {
    if (!instance) return;
    ScopedDrumState scoped(&instance->state);
    drum_clear_trigger_overrides();
}

DRUM_INSTANCE_SETTER1(set_master_level, float)
DRUM_INSTANCE_SETTER1(set_reverb_send, float)
DRUM_INSTANCE_SETTER1(set_rng_seed, unsigned int)

#undef DRUM_INSTANCE_SETTER1
#undef DRUM_INSTANCE_SETTER2

int drum_instance_get_active_count(KesshoDrumInstance* instance) {
    if (!instance) return 0;
    ScopedDrumState scoped(&instance->state);
    return drum_get_active_count();
}

} // extern "C"
