/**
 * Kessho Lead 4-op FM Synth — C++ Implementation
 *
 * Full port of lead4opfm.ts playLead4opFMNote() to per-sample C++ synthesis.
 *
 * Architecture:
 *   - Polyphonic (LEAD_FM_MAX_POLYPHONY notes, oldest-steal)
 *   - Each note has up to 4 unison voices, each with 4 FM operators
 *   - 5 algorithms: parallel, stack, split, cross, dx17
 *   - Per-operator: feedback, level, detune, ADE mod envelope
 *   - Global: ADSR amp envelope, filter envelope, LFO, drive, transient, XY stereo
 *   - Stereo ping-pong delay
 *
 * Preset morphing is done in JS — pre-morphed params arrive via setters.
 */

#include "kessho_lead_fm.h"
#include "../common/kessho_dsp.h"
#include <cstring>
#include <cmath>
#include <algorithm>
#include <new>

using namespace kessho;

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════════════════════

struct OperatorParams {
    float ratio = 1;
    float index = 0;
    float decay_sec = 0.8f;
    float sustain = 0.1f;
    float level = 1;
    float feedback = 0;
    float detune_cents = 0;
    float env_rate = 1;
    float mod_attack_sec = 0;
    float mod_delay_sec = 0;
};

struct LeadPresetParams {
    int   algorithm = LEAD_FM_ALG_PARALLEL;
    float beat_detune = 0;      // cents
    float carrier2_mix = 0;

    OperatorParams ops[LEAD_FM_NUM_OPERATORS];

    // Amplitude ADSR
    float attack = 0.01f;
    float decay = 0.8f;
    float sustain_level = 0.3f;
    float release = 2.0f;

    // Filter
    float filter_freq = 4000;
    float filter_q = 0.7f;
    int   filter_type = LEAD_FM_FILTER_LP;
    float filter_env_attack = 0;
    float filter_env_decay = 0;
    float filter_env_sustain = 1;
    float filter_env_release = 0;
    float filter_env_depth = 0;

    // Drive
    float drive = 0;

    // Transient
    float transient_click = 0;
    float transient_noise = 0;
    float transient_duration_ms = 20;
    float transient_decay = 50;
    float transient_filter = 4000;
    int   transient_type = LEAD_FM_TRANS_WHITE;

    // Output
    float gain = 0.34f;
    float x_level = 1, x_pan = -0.2f;
    float y_level = 0.9f, y_pan = 0.2f;

    // LFO
    float lfo_rate = 0;
    float lfo_depth = 0;
    int   lfo_target = LEAD_FM_LFO_ALL;

    // Unison
    int   unison_voices = 1;
    float unison_detune = 0; // cents
};

// State for a single FM operator within a unison voice
struct OperatorState {
    Oscillator osc;
    float phase_fb = 0;         // self-feedback phase memory
    float mod_env_value = 0;    // ADE mod envelope current value
    float mod_env_target = 0;   // ADE mod envelope end value
    float mod_env_rate = 1;     // per-sample decay multiplier
    float peak_index = 0;       // peak FM index value
    // ADE state machine: 0=delay, 1=attack, 2=decay
    int   mod_env_stage = 2;
    float mod_env_counter = 0;  // samples remaining in current stage
    float mod_env_attack_rate = 0; // per-sample attack increment
};

// State for a single unison sub-voice
struct UnisonVoice {
    Oscillator carrier1;
    Oscillator carrier2;
    OperatorState ops[LEAD_FM_NUM_OPERATORS];
    float carrier2_mix = 0;
};

// State for a full polyphonic note
struct LeadNote {
    int   active = 0;
    int   lead_index = 0;       // 0 = lead1, 1 = lead2
    float age = 0;              // samples since trigger

    // Oscillator configuration
    float base_freq = 440;
    float velocity = 0;
    int   num_unison = 1;
    UnisonVoice unison[LEAD_FM_MAX_UNISON];

    // Amplitude ADSR
    ADSREnvelope amp_env;

    // Filter
    SVF filter_x;
    SVF filter_y;
    SVFMode filter_mode = SVF_LOWPASS;
    float filter_freq = 4000;
    float filter_q = 0.7f;

    // Filter envelope
    float filt_env_value = 0;   // current offset from base freq
    float filt_env_start = 0;
    float filt_env_peak = 0;
    float filt_env_sustain = 0;
    float filt_env_target = 0;
    // Filter env stages: 0=attack, 1=decay, 2=sustain, 3=release
    int   filt_env_stage = 0;
    float filt_env_counter = 0;
    float filt_env_rate = 0;

    // Drive
    WaveshaperCurve waveshaper;
    float drive = 0;

    // Transient
    float transient_env = 0;
    float transient_decay_rate = 0;
    float transient_level = 0;
    SVF   transient_filter;
    PRNG  transient_rng;
    PinkNoise transient_pink;
    int   transient_type = 0;

    // LFO
    float lfo_phase = 0;

    // XY config (captured at note-on)
    float x_level = 1, x_pan = 0;
    float y_level = 1, y_pan = 0;
    float gain = 0.34f;

    // Hold/release timing
    float hold_samples = 0;
    float samples_since_trigger = 0;
    int   released = 0;

    void reset() {
        active = 0;
        age = 0;
        amp_env.reset();
        filter_x.reset();
        filter_y.reset();
        transient_filter.reset();
        transient_env = 0;
        transient_pink.reset();
        lfo_phase = 0;
        released = 0;
        samples_since_trigger = 0;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Engine State
// ═══════════════════════════════════════════════════════════════════════════════

struct LeadFmState {
    float g_sample_rate = 48000;
    SineTable g_sine;
    PRNG g_rng;

    LeadNote g_notes[LEAD_FM_MAX_POLYPHONY];
    LeadPresetParams g_params;

    StereoPingPongDelay g_delay_lead1;
    StereoPingPongDelay g_delay_lead2;
    float g_delay_send = 0.3f;

    float g_output[LEAD_FM_MAX_BLOCK_SIZE * 2] = {};       // lead 1
    float g_output_lead2[LEAD_FM_MAX_BLOCK_SIZE * 2] = {}; // lead 2
    int initialized = 0;
};

static LeadFmState g_default_lead_fm;
static thread_local LeadFmState* g_lead_fm_slot = &g_default_lead_fm;

static LeadFmState& lead_fm_current_state() {
    return *g_lead_fm_slot;
}

class ScopedLeadFmState {
public:
    explicit ScopedLeadFmState(LeadFmState* state) : previous_(g_lead_fm_slot) {
        g_lead_fm_slot = state != nullptr ? state : &g_default_lead_fm;
    }

    ~ScopedLeadFmState() {
        g_lead_fm_slot = previous_;
    }

    ScopedLeadFmState(const ScopedLeadFmState&) = delete;
    ScopedLeadFmState& operator=(const ScopedLeadFmState&) = delete;

private:
    LeadFmState* previous_;
};

struct KesshoLeadFmInstance {
    LeadFmState state;
};

#define g_sample_rate lead_fm_current_state().g_sample_rate
#define g_sine lead_fm_current_state().g_sine
#define g_rng lead_fm_current_state().g_rng
#define g_notes lead_fm_current_state().g_notes
#define g_params lead_fm_current_state().g_params
#define g_delay_lead1 lead_fm_current_state().g_delay_lead1
#define g_delay_lead2 lead_fm_current_state().g_delay_lead2
#define g_delay_send lead_fm_current_state().g_delay_send
#define g_output lead_fm_current_state().g_output
#define g_output_lead2 lead_fm_current_state().g_output_lead2
#define g_initialized lead_fm_current_state().initialized

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

static float ms_to_samples(float ms) {
    return ms * g_sample_rate / 1000.0f;
}

static SVFMode filter_type_to_mode(int type) {
    switch (type) {
        case LEAD_FM_FILTER_HP:    return SVF_HIGHPASS;
        case LEAD_FM_FILTER_BP:    return SVF_BANDPASS;
        case LEAD_FM_FILTER_NOTCH: return SVF_NOTCH;
        case LEAD_FM_FILTER_PEAK:  return SVF_PEAK;
        default:                   return SVF_LOWPASS;
    }
}

static int find_note_slot() {
    // Find free slot
    for (int i = 0; i < LEAD_FM_MAX_POLYPHONY; i++) {
        if (!g_notes[i].active) return i;
    }
    // Steal oldest
    int oldest = 0;
    float oldest_age = 0;
    for (int i = 0; i < LEAD_FM_MAX_POLYPHONY; i++) {
        if (g_notes[i].age > oldest_age) {
            oldest_age = g_notes[i].age;
            oldest = i;
        }
    }
    g_notes[oldest].reset();
    return oldest;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-Sample Rendering
// ═══════════════════════════════════════════════════════════════════════════════

static void render_note(LeadNote& note, float* out_l, float* out_r, int block_size) {
    if (!note.active) return;

    const LeadPresetParams& p = g_params;

    for (int n = 0; n < block_size; n++) {
        note.age += 1;
        note.samples_since_trigger += 1;

        // Check hold time → trigger release
        if (!note.released && note.samples_since_trigger >= note.hold_samples) {
            note.amp_env.gate_off();
            note.released = 1;
            // Filter envelope release
            note.filt_env_stage = 3;
        }

        // Amplitude envelope
        float amp_env = note.amp_env.process(g_sample_rate);
        if (note.amp_env.stage == ENV_OFF) {
            note.active = 0;
            return;
        }

        // LFO
        float lfo_val = 0;
        if (p.lfo_rate > 0 && p.lfo_depth > 0) {
            note.lfo_phase += p.lfo_rate / g_sample_rate;
            if (note.lfo_phase >= 1.0f) note.lfo_phase -= 1.0f;
            lfo_val = g_sine.lookup(note.lfo_phase) * p.lfo_depth;
        }

        // Filter envelope
        float filt_env_offset = 0;
        if (fabsf(p.filter_env_depth) > 1.0f) {
            switch (note.filt_env_stage) {
                case 0: { // attack
                    note.filt_env_value += note.filt_env_rate;
                    if (note.filt_env_value >= note.filt_env_peak) {
                        note.filt_env_value = note.filt_env_peak;
                        note.filt_env_stage = 1;
                        float dec_samples = std::max(1.0f, p.filter_env_decay * g_sample_rate);
                        note.filt_env_rate = (note.filt_env_sustain - note.filt_env_peak) / dec_samples;
                    }
                    break;
                }
                case 1: { // decay
                    note.filt_env_value += note.filt_env_rate;
                    if ((note.filt_env_rate < 0 && note.filt_env_value <= note.filt_env_sustain) ||
                        (note.filt_env_rate > 0 && note.filt_env_value >= note.filt_env_sustain)) {
                        note.filt_env_value = note.filt_env_sustain;
                        note.filt_env_stage = 2;
                    }
                    break;
                }
                case 2: // sustain - hold
                    break;
                case 3: { // release
                    float rel_samples = std::max(1.0f, p.filter_env_release * g_sample_rate);
                    float rate = -note.filt_env_value / rel_samples;
                    note.filt_env_value += rate;
                    if (fabsf(note.filt_env_value) < 0.1f) note.filt_env_value = 0;
                    break;
                }
            }
            filt_env_offset = note.filt_env_value;
        }

        float current_filter_freq = std::max(20.0f, std::min(20000.0f, note.filter_freq + filt_env_offset));

        // LFO → filter
        if (p.lfo_target == LEAD_FM_LFO_FILTER) {
            current_filter_freq = std::max(20.0f, std::min(20000.0f,
                current_filter_freq + lfo_val * note.filter_freq * 0.5f));
        }

        // Sum all unison voices
        float carrier_sum_x = 0; // X channel (carrier1)
        float carrier_sum_y = 0; // Y channel (carrier2)

        for (int u = 0; u < note.num_unison; u++) {
            UnisonVoice& uv = note.unison[u];

            // LFO → pitch (vibrato)
            float pitch_mod = 0;
            if (p.lfo_target == LEAD_FM_LFO_PITCH) {
                pitch_mod = lfo_val * note.base_freq * 0.02f;
            }
            float detune_mod = 0;
            if (p.lfo_target == LEAD_FM_LFO_DETUNE) {
                detune_mod = lfo_val * note.base_freq * 0.01f;
            }

            // Process modulator envelopes and compute FM output
            float mod_outputs[4] = {};
            for (int op = 0; op < 4; op++) {
                OperatorState& os = uv.ops[op];

                // ADE mod envelope
                switch (os.mod_env_stage) {
                    case 0: // delay
                        os.mod_env_counter -= 1;
                        if (os.mod_env_counter <= 0) {
                            os.mod_env_stage = 1;
                            os.mod_env_counter = p.ops[op].mod_attack_sec * g_sample_rate;
                            os.mod_env_value = 0.001f;
                        }
                        break;
                    case 1: // attack
                        os.mod_env_value += os.mod_env_attack_rate;
                        os.mod_env_counter -= 1;
                        if (os.mod_env_counter <= 0 || os.mod_env_value >= os.peak_index) {
                            os.mod_env_value = os.peak_index;
                            os.mod_env_stage = 2;
                        }
                        break;
                    case 2: // decay
                        os.mod_env_value = os.mod_env_target +
                            (os.mod_env_value - os.mod_env_target) * os.mod_env_rate;
                        break;
                }

                // LFO → specific operator
                float lfo_mod = 0;
                if ((p.lfo_target == LEAD_FM_LFO_ALL) ||
                    (p.lfo_target == LEAD_FM_LFO_MOD1 + op)) {
                    lfo_mod = lfo_val * note.base_freq * p.ops[op].index * 0.5f;
                }

                // Self-feedback
                float fb = 0;
                if (p.ops[op].feedback > 0) {
                    fb = os.phase_fb * note.base_freq * p.ops[op].feedback * 0.5f;
                }

                // Advance operator oscillator with FM input
                float freq_mod = fb + lfo_mod;
                os.osc.freq += freq_mod;
                os.osc.advance(g_sample_rate);
                float op_out = os.osc.generate(WAVE_SINE, g_sample_rate, g_sine);
                os.osc.freq -= freq_mod;

                os.phase_fb = op_out; // store for feedback
                mod_outputs[op] = op_out * os.mod_env_value * p.ops[op].level;
            }

            // Apply algorithm routing → carrier frequency modulation
            float carrier1_fm = 0;
            float carrier2_fm = 0;

            switch (p.algorithm) {
                case LEAD_FM_ALG_STACK:
                    // 4→3→2→1→carriers
                    // Mod[3] → Mod[2] (accumulated in chain)
                    // For per-sample, we approximate: each op modulates the next
                    carrier1_fm = mod_outputs[0];
                    carrier2_fm = mod_outputs[0];
                    break;

                case LEAD_FM_ALG_SPLIT:
                    carrier1_fm = mod_outputs[0] + mod_outputs[2];
                    carrier2_fm = mod_outputs[1] + mod_outputs[3];
                    break;

                case LEAD_FM_ALG_CROSS:
                    carrier1_fm = mod_outputs[0] + mod_outputs[1];
                    carrier2_fm = mod_outputs[2] + mod_outputs[3];
                    break;

                case LEAD_FM_ALG_DX17:
                    carrier1_fm = mod_outputs[0] + mod_outputs[2];
                    carrier2_fm = 0; // carrier2 muted in dx17
                    break;

                default: // PARALLEL
                    carrier1_fm = mod_outputs[0] + mod_outputs[1] + mod_outputs[2] + mod_outputs[3];
                    carrier2_fm = carrier1_fm;
                    break;
            }

            // Generate carriers
            uv.carrier1.freq += carrier1_fm + pitch_mod;
            uv.carrier1.advance(g_sample_rate);
            float c1 = uv.carrier1.generate(WAVE_SINE, g_sample_rate, g_sine);
            uv.carrier1.freq -= carrier1_fm + pitch_mod;

            uv.carrier2.freq += carrier2_fm + pitch_mod + detune_mod;
            uv.carrier2.advance(g_sample_rate);
            float c2 = uv.carrier2.generate(WAVE_SINE, g_sample_rate, g_sine);
            uv.carrier2.freq -= carrier2_fm + pitch_mod + detune_mod;

            carrier_sum_x += c1;
            carrier_sum_y += c2 * uv.carrier2_mix;
        }

        // Scale by unison count
        float unison_scale = 1.0f / sqrtf((float)note.num_unison);
        carrier_sum_x *= unison_scale;
        carrier_sum_y *= unison_scale;

        // Apply amplitude envelope
        carrier_sum_x *= amp_env;
        carrier_sum_y *= amp_env;

        // Drive
        if (note.drive > 0.05f) {
            carrier_sum_x = note.waveshaper.process(carrier_sum_x);
            carrier_sum_y = note.waveshaper.process(carrier_sum_y);
        }

        // Filter (X and Y channels independently)
        carrier_sum_x = note.filter_x.process(carrier_sum_x, current_filter_freq, note.filter_q, g_sample_rate, note.filter_mode);
        carrier_sum_y = note.filter_y.process(carrier_sum_y, current_filter_freq, note.filter_q, g_sample_rate, note.filter_mode);

        // XY level
        carrier_sum_x *= note.x_level;
        carrier_sum_y *= note.y_level;

        // Transient
        float transient = 0;
        if (note.transient_env > 0.001f) {
            float noise;
            switch (note.transient_type) {
                case LEAD_FM_TRANS_PINK:
                    noise = note.transient_pink.process(note.transient_rng.next_bipolar());
                    break;
                case LEAD_FM_TRANS_BROWN:
                    noise = note.transient_rng.next_bipolar() * 0.02f;
                    // Simple brown noise approximation
                    noise = note.transient_filter.process(noise, 500.0f, 0.7f, g_sample_rate, SVF_LOWPASS) * 3.5f;
                    break;
                default:
                    noise = note.transient_rng.next_bipolar();
                    break;
            }
            transient = noise * note.transient_env * note.transient_level;
            note.transient_env *= note.transient_decay_rate;
        }

        // XY stereo panning
        // X → left-biased, Y → right-biased
        float x_pan_l = std::max(0.0f, 1.0f - note.x_pan) * 0.5f;
        float x_pan_r = std::max(0.0f, 1.0f + note.x_pan) * 0.5f;
        float y_pan_l = std::max(0.0f, 1.0f - note.y_pan) * 0.5f;
        float y_pan_r = std::max(0.0f, 1.0f + note.y_pan) * 0.5f;

        float gain = note.gain * note.velocity;
        float sample_l = (carrier_sum_x * x_pan_l + carrier_sum_y * y_pan_l + transient) * gain;
        float sample_r = (carrier_sum_x * x_pan_r + carrier_sum_y * y_pan_r + transient) * gain;

        out_l[n] += sample_l;
        out_r[n] += sample_r;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API Implementation
// ═══════════════════════════════════════════════════════════════════════════════

extern "C" {

int lead_fm_init(float sample_rate) {
    if (g_initialized) {
        g_delay_lead1.destroy();
        g_delay_lead2.destroy();
        g_initialized = 0;
    }

    g_sample_rate = sample_rate;
    g_sine.init();
    g_rng.seed(1337);

    for (int i = 0; i < LEAD_FM_MAX_POLYPHONY; i++) {
        g_notes[i].reset();
    }

    int max_delay = (int)(sample_rate * LEAD_FM_DELAY_MAX_SECONDS) + 1;
    g_delay_lead1.init(max_delay);
    g_delay_lead2.init(max_delay);
    g_delay_lead1.set_filter(4000.0f, sample_rate);
    g_delay_lead2.set_filter(4000.0f, sample_rate);

    memset(g_output, 0, sizeof(g_output));
    memset(g_output_lead2, 0, sizeof(g_output_lead2));
    g_initialized = 1;
    return 0;
}

void lead_fm_destroy(void) {
    if (g_initialized) {
        g_delay_lead1.destroy();
        g_delay_lead2.destroy();
        g_initialized = 0;
    }
    memset(g_output, 0, sizeof(g_output));
    memset(g_output_lead2, 0, sizeof(g_output_lead2));
}

float* lead_fm_get_output_ptr(void) {
    return g_output;
}

float* lead_fm_get_output2_ptr(void) {
    return g_output_lead2;
}

void lead_fm_process_block(int block_size) {
    if (block_size > LEAD_FM_MAX_BLOCK_SIZE) block_size = LEAD_FM_MAX_BLOCK_SIZE;
    if (block_size <= 0) return;

    // Separate dry buffers per lead
    float lead1_dry_l[LEAD_FM_MAX_BLOCK_SIZE] = {};
    float lead1_dry_r[LEAD_FM_MAX_BLOCK_SIZE] = {};
    float lead2_dry_l[LEAD_FM_MAX_BLOCK_SIZE] = {};
    float lead2_dry_r[LEAD_FM_MAX_BLOCK_SIZE] = {};

    for (int i = 0; i < LEAD_FM_MAX_POLYPHONY; i++) {
        if (g_notes[i].active) {
            if (g_notes[i].lead_index == 0) {
                render_note(g_notes[i], lead1_dry_l, lead1_dry_r, block_size);
            } else {
                render_note(g_notes[i], lead2_dry_l, lead2_dry_r, block_size);
            }
        }
    }

    // Per-lead delay: keep wet tails isolated so lead 1 activity cannot bleed into lead 2.
    for (int n = 0; n < block_size; n++) {
        float del1_in_l = lead1_dry_l[n] * g_delay_send;
        float del1_in_r = lead1_dry_r[n] * g_delay_send;
        float del2_in_l = lead2_dry_l[n] * g_delay_send;
        float del2_in_r = lead2_dry_r[n] * g_delay_send;

        float del1_l, del1_r;
        float del2_l, del2_r;
        g_delay_lead1.process_sample(del1_in_l, del1_in_r, del1_l, del1_r);
        g_delay_lead2.process_sample(del2_in_l, del2_in_r, del2_l, del2_r);

        float wet1_l = del1_l - del1_in_l;
        float wet1_r = del1_r - del1_in_r;
        float wet2_l = del2_l - del2_in_l;
        float wet2_r = del2_r - del2_in_r;

        g_output[n * 2]     = lead1_dry_l[n] + wet1_l;
        g_output[n * 2 + 1] = lead1_dry_r[n] + wet1_r;

        g_output_lead2[n * 2]     = lead2_dry_l[n] + wet2_l;
        g_output_lead2[n * 2 + 1] = lead2_dry_r[n] + wet2_r;
    }
}

void lead_fm_note_on(float frequency, float velocity, float hold_seconds) {
    lead_fm_note_on_ex(frequency, velocity, hold_seconds, 0);
}

void lead_fm_note_on_ex(float frequency, float velocity, float hold_seconds, int lead_index) {
    int slot = find_note_slot();
    LeadNote& note = g_notes[slot];
    note.reset();
    note.lead_index = lead_index;

    const LeadPresetParams& p = g_params;

    note.active = 1;
    note.base_freq = frequency;
    note.velocity = velocity;
    note.gain = p.gain;
    note.hold_samples = hold_seconds * g_sample_rate;
    note.samples_since_trigger = 0;
    note.released = 0;

    // XY
    note.x_level = p.x_level;
    note.x_pan = p.x_pan;
    note.y_level = p.y_level;
    note.y_pan = p.y_pan;

    // Filter
    note.filter_freq = p.filter_freq;
    note.filter_q = p.filter_q;
    note.filter_mode = filter_type_to_mode(p.filter_type);

    // Filter envelope
    if (fabsf(p.filter_env_depth) > 1.0f) {
        note.filt_env_peak = p.filter_env_depth;
        note.filt_env_sustain = p.filter_env_depth * p.filter_env_sustain;
        float att_samples = std::max(1.0f, p.filter_env_attack * g_sample_rate);
        note.filt_env_rate = note.filt_env_peak / att_samples;
        note.filt_env_stage = 0;
        note.filt_env_value = 0;
    }

    // Drive
    note.drive = p.drive;
    if (p.drive > 0.01f) {
        float drive_amount = 1.0f + p.drive * 19.0f;
        note.waveshaper.set_drive(drive_amount);
    }

    // Transient
    if (p.transient_click > 0 || p.transient_noise > 0) {
        note.transient_level = (p.transient_click + p.transient_noise) * velocity * 0.8f;
        note.transient_env = 1.0f;
        float dur_samples = std::max(1.0f, ms_to_samples(p.transient_duration_ms));
        note.transient_decay_rate = fast_expf(-1.0f / dur_samples);
        note.transient_rng.seed(g_rng.next());
        note.transient_type = p.transient_type;
    }

    // Amplitude ADSR (scaled by carrier 1's env_rate)
    float env_rate = p.ops[0].env_rate;
    note.amp_env.attack = p.attack * env_rate;
    note.amp_env.decay = p.decay * env_rate;
    note.amp_env.sustain = p.sustain_level;
    note.amp_env.release = p.release * env_rate;
    note.amp_env.gate_on();

    // Unison setup
    int num_unison = std::max(1, std::min(LEAD_FM_MAX_UNISON, p.unison_voices));
    note.num_unison = num_unison;

    for (int u = 0; u < num_unison; u++) {
        UnisonVoice& uv = note.unison[u];

        // Compute unison detune
        float unison_cents = 0;
        if (num_unison > 1) {
            unison_cents = p.unison_detune * ((float)u / ((float)(num_unison - 1)) * 2.0f - 1.0f);
        }
        float unison_freq = frequency * semitones_to_ratio(unison_cents / 100.0f);

        // Carriers
        uv.carrier1.freq = unison_freq;
        uv.carrier1.phase = 0;
        uv.carrier2.freq = unison_freq * semitones_to_ratio(p.beat_detune / 1200.0f);
        uv.carrier2.phase = 0;
        uv.carrier2_mix = p.carrier2_mix;

        // Operators
        for (int op = 0; op < 4; op++) {
            OperatorState& os = uv.ops[op];
            const OperatorParams& op_p = p.ops[op];

            float op_freq = unison_freq * op_p.ratio * semitones_to_ratio(op_p.detune_cents / 1200.0f);
            os.osc.freq = op_freq;
            os.osc.phase = 0;
            os.phase_fb = 0;

            // FM index (peak value)
            float mod_idx = (op == 0)
                ? unison_freq * op_p.index * velocity
                : unison_freq * op_p.index;
            os.peak_index = mod_idx;
            os.mod_env_target = std::max(0.001f, mod_idx * op_p.sustain);

            // ADE mod envelope setup
            if (op_p.mod_delay_sec > 0 || op_p.mod_attack_sec > 0) {
                os.mod_env_value = 0.001f;
                os.mod_env_stage = (op_p.mod_delay_sec > 0) ? 0 : 1;
                os.mod_env_counter = (op_p.mod_delay_sec > 0)
                    ? op_p.mod_delay_sec * g_sample_rate
                    : op_p.mod_attack_sec * g_sample_rate;
                float att_samples = std::max(1.0f, op_p.mod_attack_sec * g_sample_rate);
                os.mod_env_attack_rate = (mod_idx - 0.001f) / att_samples;
            } else {
                os.mod_env_value = mod_idx;
                os.mod_env_stage = 2; // straight to decay
            }

            // Decay rate
            float decay_samples = std::max(1.0f, op_p.decay_sec * g_sample_rate);
            os.mod_env_rate = fast_expf(-1.0f / decay_samples);
        }
    }
}

void lead_fm_all_notes_off(void) {
    for (int i = 0; i < LEAD_FM_MAX_POLYPHONY; i++) {
        if (g_notes[i].active && !g_notes[i].released) {
            g_notes[i].amp_env.gate_off();
            g_notes[i].released = 1;
            g_notes[i].filt_env_stage = 3;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parameter Setters
// ═══════════════════════════════════════════════════════════════════════════════

void lead_fm_set_algorithm(int v) { g_params.algorithm = v; }
void lead_fm_set_beat_detune(float v) { g_params.beat_detune = v; }
void lead_fm_set_carrier2_mix(float v) { g_params.carrier2_mix = v; }

void lead_fm_set_op_ratio(int i, float v)      { if (i >= 0 && i < 4) g_params.ops[i].ratio = v; }
void lead_fm_set_op_index(int i, float v)      { if (i >= 0 && i < 4) g_params.ops[i].index = v; }
void lead_fm_set_op_decay(int i, float v)      { if (i >= 0 && i < 4) g_params.ops[i].decay_sec = v; }
void lead_fm_set_op_sustain(int i, float v)    { if (i >= 0 && i < 4) g_params.ops[i].sustain = v; }
void lead_fm_set_op_level(int i, float v)      { if (i >= 0 && i < 4) g_params.ops[i].level = v; }
void lead_fm_set_op_feedback(int i, float v)   { if (i >= 0 && i < 4) g_params.ops[i].feedback = v; }
void lead_fm_set_op_detune(int i, float v)     { if (i >= 0 && i < 4) g_params.ops[i].detune_cents = v; }
void lead_fm_set_op_env_rate(int i, float v)   { if (i >= 0 && i < 4) g_params.ops[i].env_rate = v; }
void lead_fm_set_op_mod_attack(int i, float v) { if (i >= 0 && i < 4) g_params.ops[i].mod_attack_sec = v; }
void lead_fm_set_op_mod_delay(int i, float v)  { if (i >= 0 && i < 4) g_params.ops[i].mod_delay_sec = v; }

void lead_fm_set_attack(float v) { g_params.attack = v; }
void lead_fm_set_decay(float v) { g_params.decay = v; }
void lead_fm_set_sustain(float v) { g_params.sustain_level = v; }
void lead_fm_set_release(float v) { g_params.release = v; }

void lead_fm_set_filter_freq(float v) { g_params.filter_freq = v; }
void lead_fm_set_filter_q(float v) { g_params.filter_q = v; }
void lead_fm_set_filter_type(int v) { g_params.filter_type = v; }
void lead_fm_set_filter_env_attack(float v) { g_params.filter_env_attack = v; }
void lead_fm_set_filter_env_decay(float v) { g_params.filter_env_decay = v; }
void lead_fm_set_filter_env_sustain(float v) { g_params.filter_env_sustain = v; }
void lead_fm_set_filter_env_release(float v) { g_params.filter_env_release = v; }
void lead_fm_set_filter_env_depth(float v) { g_params.filter_env_depth = v; }

void lead_fm_set_drive(float v) { g_params.drive = v; }

void lead_fm_set_transient_click(float v) { g_params.transient_click = v; }
void lead_fm_set_transient_noise(float v) { g_params.transient_noise = v; }
void lead_fm_set_transient_duration_ms(float v) { g_params.transient_duration_ms = v; }
void lead_fm_set_transient_decay(float v) { g_params.transient_decay = v; }
void lead_fm_set_transient_filter(float v) { g_params.transient_filter = v; }
void lead_fm_set_transient_type(int v) { g_params.transient_type = v; }

void lead_fm_set_gain(float v) { g_params.gain = v; }
void lead_fm_set_x_level(float v) { g_params.x_level = v; }
void lead_fm_set_x_pan(float v) { g_params.x_pan = v; }
void lead_fm_set_y_level(float v) { g_params.y_level = v; }
void lead_fm_set_y_pan(float v) { g_params.y_pan = v; }

void lead_fm_set_lfo_rate(float v) { g_params.lfo_rate = v; }
void lead_fm_set_lfo_depth(float v) { g_params.lfo_depth = v; }
void lead_fm_set_lfo_target(int v) { g_params.lfo_target = v; }

void lead_fm_set_unison_voices(int v) { g_params.unison_voices = v; }
void lead_fm_set_unison_detune(float v) { g_params.unison_detune = v; }

// Delay
void lead_fm_set_delay_enabled(int v) { g_delay_lead1.enabled = g_delay_lead2.enabled = (v != 0); }
void lead_fm_set_delay_time_l(float v) { g_delay_lead1.time_l = g_delay_lead2.time_l = v; }
void lead_fm_set_delay_time_r(float v) { g_delay_lead1.time_r = g_delay_lead2.time_r = v; }
void lead_fm_set_delay_feedback(float v) { g_delay_lead1.feedback = g_delay_lead2.feedback = v; }
void lead_fm_set_delay_filter(float v) {
    g_delay_lead1.set_filter(v, g_sample_rate);
    g_delay_lead2.set_filter(v, g_sample_rate);
}
void lead_fm_set_delay_mix(float v) { g_delay_lead1.mix = g_delay_lead2.mix = v; }
void lead_fm_set_delay_send(float v) { g_delay_send = v; }

int lead_fm_get_active_count(void) {
    int count = 0;
    for (int i = 0; i < LEAD_FM_MAX_POLYPHONY; i++) {
        if (g_notes[i].active) count++;
    }
    return count;
}

KesshoLeadFmInstance* lead_fm_instance_create(float sample_rate) {
    KesshoLeadFmInstance* instance = new (std::nothrow) KesshoLeadFmInstance{};
    if (!instance) return nullptr;

    int init_result = 0;
    {
        ScopedLeadFmState scoped(&instance->state);
        init_result = lead_fm_init(sample_rate);
    }

    if (init_result != 0) {
        delete instance;
        return nullptr;
    }

    return instance;
}

void lead_fm_instance_destroy(KesshoLeadFmInstance* instance) {
    if (!instance) return;
    {
        ScopedLeadFmState scoped(&instance->state);
        lead_fm_destroy();
    }
    delete instance;
}

int lead_fm_instance_reset(KesshoLeadFmInstance* instance, float sample_rate) {
    if (!instance) return 0;
    ScopedLeadFmState scoped(&instance->state);
    return lead_fm_init(sample_rate) == 0 ? 1 : 0;
}

float* lead_fm_instance_get_output_ptr(KesshoLeadFmInstance* instance) {
    if (!instance) return nullptr;
    ScopedLeadFmState scoped(&instance->state);
    return lead_fm_get_output_ptr();
}

float* lead_fm_instance_get_output2_ptr(KesshoLeadFmInstance* instance) {
    if (!instance) return nullptr;
    ScopedLeadFmState scoped(&instance->state);
    return lead_fm_get_output2_ptr();
}

void lead_fm_instance_process_block(KesshoLeadFmInstance* instance, int block_size) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_process_block(block_size);
}

void lead_fm_instance_note_on(KesshoLeadFmInstance* instance, float frequency, float velocity, float hold_seconds) {
    lead_fm_instance_note_on_ex(instance, frequency, velocity, hold_seconds, 0);
}

void lead_fm_instance_note_on_ex(
    KesshoLeadFmInstance* instance,
    float frequency,
    float velocity,
    float hold_seconds,
    int lead_index) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_note_on_ex(frequency, velocity, hold_seconds, lead_index);
}

void lead_fm_instance_all_notes_off(KesshoLeadFmInstance* instance) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_all_notes_off();
}

void lead_fm_instance_set_algorithm(KesshoLeadFmInstance* instance, int algo) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_algorithm(algo);
}

void lead_fm_instance_set_beat_detune(KesshoLeadFmInstance* instance, float cents) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_beat_detune(cents);
}

void lead_fm_instance_set_carrier2_mix(KesshoLeadFmInstance* instance, float mix) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_carrier2_mix(mix);
}

void lead_fm_instance_set_op_ratio(KesshoLeadFmInstance* instance, int op_idx, float ratio) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_ratio(op_idx, ratio);
}

void lead_fm_instance_set_op_index(KesshoLeadFmInstance* instance, int op_idx, float index) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_index(op_idx, index);
}

void lead_fm_instance_set_op_decay(KesshoLeadFmInstance* instance, int op_idx, float decay_sec) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_decay(op_idx, decay_sec);
}

void lead_fm_instance_set_op_sustain(KesshoLeadFmInstance* instance, int op_idx, float sustain) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_sustain(op_idx, sustain);
}

void lead_fm_instance_set_op_level(KesshoLeadFmInstance* instance, int op_idx, float level) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_level(op_idx, level);
}

void lead_fm_instance_set_op_feedback(KesshoLeadFmInstance* instance, int op_idx, float feedback) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_feedback(op_idx, feedback);
}

void lead_fm_instance_set_op_detune(KesshoLeadFmInstance* instance, int op_idx, float cents) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_detune(op_idx, cents);
}

void lead_fm_instance_set_op_env_rate(KesshoLeadFmInstance* instance, int op_idx, float rate) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_env_rate(op_idx, rate);
}

void lead_fm_instance_set_op_mod_attack(KesshoLeadFmInstance* instance, int op_idx, float attack_sec) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_mod_attack(op_idx, attack_sec);
}

void lead_fm_instance_set_op_mod_delay(KesshoLeadFmInstance* instance, int op_idx, float delay_sec) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_op_mod_delay(op_idx, delay_sec);
}

void lead_fm_instance_set_attack(KesshoLeadFmInstance* instance, float seconds) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_attack(seconds);
}

void lead_fm_instance_set_decay(KesshoLeadFmInstance* instance, float seconds) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_decay(seconds);
}

void lead_fm_instance_set_sustain(KesshoLeadFmInstance* instance, float level) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_sustain(level);
}

void lead_fm_instance_set_release(KesshoLeadFmInstance* instance, float seconds) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_release(seconds);
}

void lead_fm_instance_set_filter_freq(KesshoLeadFmInstance* instance, float hz) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_freq(hz);
}

void lead_fm_instance_set_filter_q(KesshoLeadFmInstance* instance, float q) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_q(q);
}

void lead_fm_instance_set_filter_type(KesshoLeadFmInstance* instance, int type) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_type(type);
}

void lead_fm_instance_set_filter_env_attack(KesshoLeadFmInstance* instance, float seconds) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_env_attack(seconds);
}

void lead_fm_instance_set_filter_env_decay(KesshoLeadFmInstance* instance, float seconds) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_env_decay(seconds);
}

void lead_fm_instance_set_filter_env_sustain(KesshoLeadFmInstance* instance, float level) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_env_sustain(level);
}

void lead_fm_instance_set_filter_env_release(KesshoLeadFmInstance* instance, float seconds) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_env_release(seconds);
}

void lead_fm_instance_set_filter_env_depth(KesshoLeadFmInstance* instance, float hz) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_filter_env_depth(hz);
}

void lead_fm_instance_set_drive(KesshoLeadFmInstance* instance, float amount) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_drive(amount);
}

void lead_fm_instance_set_transient_click(KesshoLeadFmInstance* instance, float click) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_transient_click(click);
}

void lead_fm_instance_set_transient_noise(KesshoLeadFmInstance* instance, float noise) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_transient_noise(noise);
}

void lead_fm_instance_set_transient_duration_ms(KesshoLeadFmInstance* instance, float ms) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_transient_duration_ms(ms);
}

void lead_fm_instance_set_transient_decay(KesshoLeadFmInstance* instance, float decay) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_transient_decay(decay);
}

void lead_fm_instance_set_transient_filter(KesshoLeadFmInstance* instance, float freq) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_transient_filter(freq);
}

void lead_fm_instance_set_transient_type(KesshoLeadFmInstance* instance, int type) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_transient_type(type);
}

void lead_fm_instance_set_gain(KesshoLeadFmInstance* instance, float gain) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_gain(gain);
}

void lead_fm_instance_set_x_level(KesshoLeadFmInstance* instance, float level) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_x_level(level);
}

void lead_fm_instance_set_x_pan(KesshoLeadFmInstance* instance, float pan) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_x_pan(pan);
}

void lead_fm_instance_set_y_level(KesshoLeadFmInstance* instance, float level) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_y_level(level);
}

void lead_fm_instance_set_y_pan(KesshoLeadFmInstance* instance, float pan) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_y_pan(pan);
}

void lead_fm_instance_set_lfo_rate(KesshoLeadFmInstance* instance, float hz) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_lfo_rate(hz);
}

void lead_fm_instance_set_lfo_depth(KesshoLeadFmInstance* instance, float depth) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_lfo_depth(depth);
}

void lead_fm_instance_set_lfo_target(KesshoLeadFmInstance* instance, int target) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_lfo_target(target);
}

void lead_fm_instance_set_unison_voices(KesshoLeadFmInstance* instance, int count) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_unison_voices(count);
}

void lead_fm_instance_set_unison_detune(KesshoLeadFmInstance* instance, float cents) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_unison_detune(cents);
}

void lead_fm_instance_set_delay_enabled(KesshoLeadFmInstance* instance, int enabled) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_enabled(enabled);
}

void lead_fm_instance_set_delay_time_l(KesshoLeadFmInstance* instance, float samples) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_time_l(samples);
}

void lead_fm_instance_set_delay_time_r(KesshoLeadFmInstance* instance, float samples) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_time_r(samples);
}

void lead_fm_instance_set_delay_feedback(KesshoLeadFmInstance* instance, float feedback) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_feedback(feedback);
}

void lead_fm_instance_set_delay_filter(KesshoLeadFmInstance* instance, float cutoff_hz) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_filter(cutoff_hz);
}

void lead_fm_instance_set_delay_mix(KesshoLeadFmInstance* instance, float mix) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_mix(mix);
}

void lead_fm_instance_set_delay_send(KesshoLeadFmInstance* instance, float level) {
    if (!instance) return;
    ScopedLeadFmState scoped(&instance->state);
    lead_fm_set_delay_send(level);
}

int lead_fm_instance_get_active_count(KesshoLeadFmInstance* instance) {
    if (!instance) return 0;
    ScopedLeadFmState scoped(&instance->state);
    return lead_fm_get_active_count();
}

} // extern "C"
