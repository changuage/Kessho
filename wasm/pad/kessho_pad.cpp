/** Kessho Pad Synth DSP.  Audio-thread code is allocation/lock/FFT free. */

#include "kessho_pad.h"
#include "generated/pad_synth_tables.generated.h"
#include "../common/kessho_dsp.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <new>

using namespace kessho;

namespace {

constexpr float kMinOscillatorHz = 0.5f;
constexpr float kOutputCalibration = 0.28f;
constexpr float kLimiterCeiling = 0.92f;
constexpr float kPi = 3.14159265358979323846f;

struct PadParams {
    int osc_a_wave = PAD_WAVE_TRIANGLE;
    float osc_a_position = 0.0f;
    float osc_a_phase_distortion = 0.0f;
    float osc_a_pitch = 0.0f;
    float osc_a_hz_offset = 0.0f;
    float osc_a_level = 1.0f;

    int osc_b_wave = PAD_WAVE_SINE;
    float osc_b_position = 0.0f;
    float osc_b_phase_distortion = 0.0f;
    float osc_b_pitch = 0.08f;
    float osc_b_hz_offset = 0.0f;
    float osc_b_level = 1.0f;

    float osc_mix = 0.5f;
    float drift = 0.42f;
    int phase_reset = PAD_PHASE_RESET_RANDOM;

    int sub_enabled = 0;
    int sub_octave = -1;
    int sub_wave = PAD_WAVE_SINE;
    float sub_level = 0.5f;

    int noise_type = 0;
    float noise_level = 0.0f;

    float hardness = 0.0f;
    float warmth = 0.5f;
    float presence = 0.5f;
    float fold_amount = 0.0f;
    int fold_mode = PAD_FOLD_BUCHLA;

    int filter_type = PAD_FILTER_LP;
    float filter_cutoff = 1700.0f;
    float filter_resonance = 0.0f;
    float filter_q = 0.7f;
    float filter_slope = 12.0f;
    float filter_key_tracking = 0.0f;

    int filter_b_enabled = 0;
    int filter_b_type = PAD_FILTER_LP;
    float filter_b_cutoff = 2000.0f;
    float filter_b_resonance = 0.0f;
    float filter_b_q = 0.7f;
    int filter_routing = PAD_ROUTE_SERIES;

    float attack = 0.1f;
    float decay = 0.5f;
    float sustain = 0.7f;
    float release = 2.0f;

    float lfo1_rate = 0.0f;
    float lfo1_depth = 0.0f;
    int lfo1_wave = PAD_LFO_SINE;
    int lfo1_dest = PAD_DEST_NONE;
    float lfo2_rate = 0.0f;
    float lfo2_depth = 0.0f;
    int lfo2_wave = PAD_LFO_SINE;
    int lfo2_dest = PAD_DEST_NONE;

    int mod_env_enabled = 0;
    float mod_env_attack = 0.5f;
    float mod_env_decay = 1.0f;
    float mod_env_sustain = 0.0f;
    float mod_env_release = 0.5f;
    float mod_env_depth = 0.0f;
    int mod_env_dest = PAD_DEST_FILTER_CUTOFF;

    float level = 0.8f;
};

struct LFOState {
    float phase = 0.0f;
    float value = 0.0f;
    float prev_random = 0.0f;
    float next_random = 0.0f;
    float random_walk = 0.0f;
    float random_walk_velocity = 0.0f;
    float random_walk_elapsed_seconds = 0.1f;
    PRNG rng;

    float process(float rate, int wave, float sample_rate, const SineTable& sine) {
        const float safe_rate = std::max(0.0f, std::min(40.0f, rate));
        if (safe_rate <= 0.0f || !std::isfinite(safe_rate)) { value = 0.0f; return 0.0f; }
        phase += safe_rate / sample_rate;
        if (phase >= 1.0f) {
            phase -= floorf(phase);
            prev_random = next_random;
            next_random = rng.next_bipolar();
        }
        switch (wave) {
            case PAD_LFO_SINE: value = sine.lookup(phase); break;
            case PAD_LFO_TRIANGLE: value = phase < 0.5f ? phase * 4.0f - 1.0f : 3.0f - phase * 4.0f; break;
            case PAD_LFO_SAWTOOTH: value = phase * 2.0f - 1.0f; break;
            case PAD_LFO_SQUARE: value = phase < 0.5f ? 1.0f : -1.0f; break;
            case PAD_LFO_SAMPLE_HOLD: value = prev_random; break;
            case PAD_LFO_RANDOM_SMOOTH: value = prev_random + (next_random - prev_random) * phase; break;
            case PAD_LFO_RANDOM_WALK: {
                random_walk_elapsed_seconds += 1.0f / std::max(1.0f, sample_rate);
                while (random_walk_elapsed_seconds >= 0.1f) {
                    random_walk_elapsed_seconds -= 0.1f;
                    const float speed = 0.02f * safe_rate;
                    random_walk_velocity = (random_walk_velocity + rng.next_bipolar() * speed) * 0.92f;
                    random_walk_velocity = std::max(-speed * 4.0f, std::min(speed * 4.0f, random_walk_velocity));
                    float position = (random_walk + 1.0f) * 0.5f + random_walk_velocity;
                    random_walk = std::max(-1.0f, std::min(1.0f, position * 2.0f - 1.0f));
                }
                value = random_walk;
                break;
            }
            default: value = 0.0f; break;
        }
        return value;
    }

    void reset() {
        phase = value = prev_random = next_random = random_walk = random_walk_velocity = 0.0f;
        random_walk_elapsed_seconds = 0.1f;
    }
};

// Four-pole nonlinear TPT-style ladder. Resonance is feedback; Hardness is
// input drive. The four tanh stages share one feedback path and remain bounded.
struct PadLadderLP {
    float y1 = 0.0f, y2 = 0.0f, y3 = 0.0f, y4 = 0.0f;

    void reset() { y1 = y2 = y3 = y4 = 0.0f; }

    float process(float input, float cutoff_hz, float resonance, float hardness, float sample_rate) {
        const float cutoff = std::max(20.0f, std::min(cutoff_hz, sample_rate * 0.45f));
        const float g = tanf(kPi * cutoff / sample_rate);
        const float G = g / (1.0f + g);
        const float feedback = std::max(0.0f, std::min(3.9f, resonance * 3.9f));
        const float drive = 1.0f + std::max(0.0f, std::min(1.0f, hardness)) * 4.0f;
        const float x = fast_tanhf((input - feedback * y4) * drive);
        y1 += G * (x - fast_tanhf(y1));
        y2 += G * (fast_tanhf(y1) - fast_tanhf(y2));
        y3 += G * (fast_tanhf(y2) - fast_tanhf(y3));
        y4 += G * (fast_tanhf(y3) - fast_tanhf(y4));
        return std::isfinite(y4) ? y4 : 0.0f;
    }
};

struct PadVoice {
    int active = 0;
    int pad_idx = 0;
    float base_freq = 440.0f;
    float velocity = 1.0f;
    float output_gain = 1.0f;
    float output_gain_target = 1.0f;
    float output_gain_step = 0.0f;
    uint32_t output_gain_remaining = 0u;

    Oscillator osc_a;
    Oscillator osc_b;
    Oscillator osc_sub;
    uint64_t last_phase_frame_a = 0;
    uint64_t last_phase_frame_b = 0;
    float last_frequency_a = 440.0f;
    float last_frequency_b = 440.0f;
    bool phase_seeded = false;

    PRNG noise_rng;
    PinkNoise pink;
    SVF filter_a, filter_a_slope2, filter_a_slope3, filter_a_slope4, filter_b;
    PadLadderLP ladder_a;
    Biquad warmth_filter, presence_filter;
    WaveshaperCurve waveshaper;
    ADSREnvelope amp_env, mod_env;
    LFOState lfo1, lfo2;

    float drift_static_a = 0.0f, drift_static_b = 0.0f;
    float drift_phase_a = 0.0f, drift_phase_b = 0.0f;
    float drift_rate_a = 0.035f, drift_rate_b = 0.052f;

    float a_position = 0.0f, a_pd = 0.0f, a_pitch = 0.0f, a_hz_offset = 0.0f;
    float b_position = 0.0f, b_pd = 0.0f, b_pitch = 0.08f, b_hz_offset = 0.0f;
    float drift = 0.42f;

    void reset() {
        active = 0;
        osc_a = {};
        osc_b = {};
        osc_sub = {};
        last_phase_frame_a = last_phase_frame_b = 0;
        last_frequency_a = last_frequency_b = 440.0f;
        phase_seeded = false;
        filter_a.reset(); filter_a_slope2.reset(); filter_a_slope3.reset(); filter_a_slope4.reset();
        filter_b.reset(); ladder_a.reset(); warmth_filter = {}; presence_filter = {};
        waveshaper = {};
        amp_env.reset(); mod_env.reset(); lfo1.reset(); lfo2.reset(); pink.reset();
        drift_static_a = drift_static_b = drift_phase_a = drift_phase_b = 0.0f;
        drift_rate_a = 0.035f; drift_rate_b = 0.052f;
        a_position = b_position = 0.0f;
        a_pd = b_pd = a_pitch = a_hz_offset = b_hz_offset = 0.0f;
        b_pitch = 0.08f; drift = 0.42f;
    }
};

struct PadState {
    float sample_rate = 48000.0f;
    uint64_t sample_frame = 0;
    SineTable sine;
    PRNG rng;
    PadVoice voices[PAD_NUM_VOICES];
    PadParams pads[PAD_NUM_PADS];
    LFOState preview_lfo1[PAD_NUM_PADS], preview_lfo2[PAD_NUM_PADS];
    float output[PAD_MAX_BLOCK_SIZE * 2] = {};
    float reverb_output[PAD_MAX_BLOCK_SIZE * 2] = {};
    float prefader_pad1[PAD_MAX_BLOCK_SIZE * 2] = {};
    float prefader_pad2[PAD_MAX_BLOCK_SIZE * 2] = {};
    float postfader_pad1[PAD_MAX_BLOCK_SIZE * 2] = {};
    float postfader_pad2[PAD_MAX_BLOCK_SIZE * 2] = {};
    float reverb_send = 0.1f;
    float current_filter_freq[PAD_NUM_PADS] = {1000.0f, 1000.0f};
    float current_lfo1_value[PAD_NUM_PADS] = {};
};

PadState g_default_pad;
thread_local PadState* g_pad_slot = &g_default_pad;
PadState& state() { return *g_pad_slot; }
struct ScopedPadState {
    PadState* previous;
    explicit ScopedPadState(PadState* next) : previous(g_pad_slot) { g_pad_slot = next ? next : &g_default_pad; }
    ~ScopedPadState() { g_pad_slot = previous; }
    ScopedPadState(const ScopedPadState&) = delete;
    ScopedPadState& operator=(const ScopedPadState&) = delete;
};

#define g_sample_rate state().sample_rate
#define g_sample_frame state().sample_frame
#define g_sine state().sine
#define g_rng state().rng
#define g_voices state().voices
#define g_pads state().pads
#define g_preview_lfo1 state().preview_lfo1
#define g_preview_lfo2 state().preview_lfo2
#define g_output state().output
#define g_reverb_output state().reverb_output
#define g_prefader_pad1 state().prefader_pad1
#define g_prefader_pad2 state().prefader_pad2
#define g_postfader_pad1 state().postfader_pad1
#define g_postfader_pad2 state().postfader_pad2
#define g_reverb_send state().reverb_send
#define g_current_filter_freq state().current_filter_freq
#define g_current_lfo1_value state().current_lfo1_value

float clamp01(float value) { return std::isfinite(value) ? std::max(0.0f, std::min(1.0f, value)) : 0.0f; }
float clampBipolar(float value) { return std::isfinite(value) ? std::max(-1.0f, std::min(1.0f, value)) : 0.0f; }
float clampPitch(float value) { return std::isfinite(value) ? std::max(-24.0f, std::min(24.0f, value)) : 0.0f; }
float clampHzOffset(float value) { return std::isfinite(value) ? std::max(-50.0f, std::min(50.0f, value)) : 0.0f; }
float clampHz(float value) { return std::isfinite(value) ? std::max(20.0f, std::min(18000.0f, value)) : 20.0f; }
float telemetryHz(float value) {
    // Keep Product/Core telemetry stable at parameter boundaries despite the
    // last-bit error from exp2f modulation (e.g. 499.999969 -> 500 Hz).
    return std::round(clampHz(value) * 1000.0f) * 0.001f;
}
float softLimit(float value) {
    constexpr float knee = 1.0f - kLimiterCeiling;
    if (value > kLimiterCeiling) return kLimiterCeiling + knee * fast_tanhf((value - kLimiterCeiling) / knee);
    if (value < -kLimiterCeiling) return -kLimiterCeiling + knee * fast_tanhf((value + kLimiterCeiling) / knee);
    return std::isfinite(value) ? value : 0.0f;
}
float voiceCompensation(int count) { return 1.0f / powf(static_cast<float>(std::max(1, count)), 0.35f); }
float rngUnipolar() { return g_rng.next_unipolar(); }
float rngTriangular() { return rngUnipolar() - rngUnipolar(); }
float smoothCoeff(float milliseconds) { return 1.0f - expf(-1.0f / std::max(1.0f, g_sample_rate * milliseconds * 0.001f)); }
float smooth(float current, float target, float coeff) { return current + (target - current) * coeff; }

float applyPhaseDistortion(float phase, float pd) {
    const float midpoint = std::max(0.05f, std::min(0.95f, 0.5f + clampBipolar(pd) * 0.45f));
    return phase < midpoint
        ? 0.5f * phase / midpoint
        : 0.5f + 0.5f * (phase - midpoint) / (1.0f - midpoint);
}

int tableTrajectory(int wave) {
    if (wave == PAD_WAVE_HARMONIC) return 0;
    if (wave == PAD_WAVE_COMPLEX_TRIANGLE) return 2;
    return 1;
}

int selectMip(float frequency) {
    // Fixed thresholds keep the callback on cheap comparisons (no log2f).
    if (frequency < 180.0f) return 0;
    if (frequency < 360.0f) return 1;
    if (frequency < 720.0f) return 2;
    if (frequency < 1440.0f) return 3;
    if (frequency < 2880.0f) return 4;
    if (frequency < 5760.0f) return 5;
    if (frequency < 11520.0f) return 6;
    return kessho_pad_tables::kMipLevels - 1;
}

float sampleGenerated(int wave, float position, float phase, float frequency) {
    using namespace kessho_pad_tables;
    const int trajectory = tableTrajectory(wave);
    const float frame = clamp01(position) * static_cast<float>(kPositionFrames - 1);
    const int f0 = std::max(0, std::min(kPositionFrames - 2, static_cast<int>(frame)));
    const float ff = frame - static_cast<float>(f0);
    const int mip = selectMip(frequency);
    const float index = (phase - floorf(phase)) * static_cast<float>(kAudioSamples - 1);
    const int i0 = std::max(0, std::min(kAudioSamples - 2, static_cast<int>(index)));
    const float fi = index - static_cast<float>(i0);
    const auto at = [&](int frame_index) {
        const float a = kOscillatorTables[trajectory][frame_index][mip][i0] * kQ15Scale;
        const float b = kOscillatorTables[trajectory][frame_index][mip][i0 + 1] * kQ15Scale;
        return a + (b - a) * fi;
    };
    const float v0 = at(f0);
    const float v1 = at(f0 + 1);
    return v0 + (v1 - v0) * ff;
}

float foldTransfer(float input, float amount, int mode) {
    using namespace kessho_pad_tables;
    const int safeMode = std::max(0, std::min(kFoldModes - 1, mode));
    const float amountIndex = clamp01(amount) * static_cast<float>(kFoldAmountFrames - 1);
    const int a0 = std::max(0, std::min(kFoldAmountFrames - 2, static_cast<int>(amountIndex)));
    const float af = amountIndex - static_cast<float>(a0);
    const float inputIndex = (clampBipolar(input) * 0.5f + 0.5f) * static_cast<float>(kFoldAudioSamples - 1);
    const int i0 = std::max(0, std::min(kFoldAudioSamples - 2, static_cast<int>(inputIndex)));
    const float fi = inputIndex - static_cast<float>(i0);
    const auto row = [&](int amountFrame) {
        const float a = kFoldTables[safeMode][amountFrame][i0] * kQ15Scale;
        const float b = kFoldTables[safeMode][amountFrame][i0 + 1] * kQ15Scale;
        return a + (b - a) * fi;
    };
    const float v0 = row(a0);
    const float v1 = row(a0 + 1);
    return v0 + (v1 - v0) * af;
}

Waveform basicWave(int wave) {
    switch (wave) {
        case PAD_WAVE_TRIANGLE: return WAVE_TRIANGLE;
        case PAD_WAVE_SAWTOOTH: return WAVE_SAWTOOTH;
        case PAD_WAVE_SQUARE: return WAVE_SQUARE;
        default: return WAVE_SINE;
    }
}

float generateOscillator(Oscillator& oscillator, int wave, float position, float pd) {
    oscillator.advance(g_sample_rate);
    const float phase = oscillator.phase - floorf(oscillator.phase);
    const float warped = applyPhaseDistortion(phase, pd);
    if (wave >= PAD_WAVE_HARMONIC) return sampleGenerated(wave, position, warped, oscillator.freq);
    const float dt = std::max(0.000001f, std::min(0.49f, oscillator.freq / g_sample_rate));
    switch (basicWave(wave)) {
        case WAVE_SINE: return g_sine.lookup(warped);
        case WAVE_TRIANGLE: return 2.0f * fabsf(2.0f * warped - 1.0f) - 1.0f;
        case WAVE_SAWTOOTH: {
            float value = 2.0f * warped - 1.0f;
            value -= poly_blep(warped, dt);
            return value;
        }
        case WAVE_SQUARE: {
            // PD is variable duty here: both discontinuities use the standard
            // phase-domain PolyBLEP residual (the edge spacing must not scale
            // dt; oscillator phase advances at the same rate on both edges).
            const float midpoint = std::max(0.05f, std::min(0.95f, 0.5f + clampBipolar(pd) * 0.45f));
            float value = phase < midpoint ? 1.0f : -1.0f;
            value += poly_blep(phase, dt);
            const float edgePhase = phase - midpoint < 0.0f ? phase - midpoint + 1.0f : phase - midpoint;
            value -= poly_blep(edgePhase, dt);
            return value;
        }
        default: return 0.0f;
    }
}

float safeOscillatorHz(float noteHz, float pitch, float pitchModSemitones, float driftCents, float offsetHz) {
    const float safeNote = std::isfinite(noteHz) && noteHz > 0.0f ? noteHz : 440.0f;
    const float safePitch = std::isfinite(pitch) ? pitch : 0.0f;
    const float safePitchMod = std::isfinite(pitchModSemitones) ? pitchModSemitones : 0.0f;
    const float safeDriftCents = std::isfinite(driftCents)
        ? std::max(-12.0f, std::min(12.0f, driftCents))
        : 0.0f;
    float semitones = safePitch + safePitchMod + safeDriftCents * 0.01f;
    if (!std::isfinite(semitones)) semitones = 0.0f;
    float tracked = safeNote * exp2f(semitones / 12.0f);
    if (!std::isfinite(tracked)) tracked = 440.0f;
    const float maxHz = std::max(kMinOscillatorHz, g_sample_rate * 0.45f);
    const float safeOffset = std::isfinite(offsetHz) ? clampHzOffset(offsetHz) : 0.0f;
    const float finalHz = tracked + safeOffset;
    if (!std::isfinite(finalHz)) return maxHz;
    return std::max(kMinOscillatorHz, std::min(maxHz, finalHz));
}

void advanceIdlePhase(Oscillator& oscillator, uint64_t& lastFrame, float frequency, uint64_t now) {
    if (lastFrame >= now || !std::isfinite(frequency) || frequency <= 0.0f) return;
    const uint64_t frames = now - lastFrame;
    const double increment = static_cast<double>(frequency) / static_cast<double>(g_sample_rate) * static_cast<double>(frames);
    oscillator.phase = static_cast<float>(oscillator.phase + increment - floor(increment));
    oscillator.phase -= floorf(oscillator.phase);
    lastFrame = now;
}

struct Modulation {
    float filter_a = 0.0f, filter_b = 0.0f, amp = 0.0f;
    float pitch_semitones = 0.0f, osc_b_level = 0.0f, fold = 0.0f;
    float a_position = 0.0f, b_position = 0.0f, a_pd = 0.0f, b_pd = 0.0f;
    float b_hz_offset = 0.0f, resonance = 0.0f;
};

void addModulation(float value, float depth, int dest, Modulation& m) {
    const float mod = value * depth;
    switch (dest) {
        case PAD_DEST_FILTER_CUTOFF: m.filter_a += mod; break;
        case PAD_DEST_FILTER_B: m.filter_b += mod; break;
        case PAD_DEST_AMPLITUDE: m.amp += mod * 0.5f; break;
        case PAD_DEST_PITCH: m.pitch_semitones += mod * 2.0f; break;
        case PAD_DEST_OSC_B_LEVEL: m.osc_b_level += mod; break;
        case PAD_DEST_FOLD_AMOUNT: m.fold += mod; break;
        case PAD_DEST_OSC_A_POSITION: m.a_position += mod; break;
        case PAD_DEST_OSC_B_POSITION: m.b_position += mod; break;
        case PAD_DEST_OSC_A_PHASE_DISTORTION: m.a_pd += mod; break;
        case PAD_DEST_OSC_B_PHASE_DISTORTION: m.b_pd += mod; break;
        case PAD_DEST_OSC_B_HZ_OFFSET: m.b_hz_offset += mod * 50.0f; break;
        case PAD_DEST_FILTER_RESONANCE: m.resonance += mod; break;
        default: break;
    }
}

void applyModEnvelope(float value, Modulation& m, int dest) { addModulation(value, 1.0f, dest, m); }

SVFMode filterMode(int type) {
    switch (type) {
        case PAD_FILTER_BP: return SVF_BANDPASS;
        case PAD_FILTER_HP: return SVF_HIGHPASS;
        case PAD_FILTER_NOTCH: return SVF_NOTCH;
        default: return SVF_LOWPASS;
    }
}
int slopeStages(float slope) { return std::max(1, std::min(4, static_cast<int>(roundf(slope / 12.0f)))); }
float octaveMod(float cutoff, float modulation) {
    if (std::fabs(modulation) <= 1.0e-7f) return cutoff;
    return cutoff * exp2f(std::max(-8.0f, std::min(8.0f, modulation * 4.0f)));
}
float processFilterA(PadVoice& voice, float input, float cutoff, float q, SVFMode mode, int stages) {
    float out = voice.filter_a.process(input, cutoff, q, g_sample_rate, mode);
    if (stages <= 1) return out;
    const float cascadeQ = std::min(q, 0.707f);
    out = voice.filter_a_slope2.process(out, cutoff, cascadeQ, g_sample_rate, mode);
    if (stages <= 2) return out;
    out = voice.filter_a_slope3.process(out, cutoff, cascadeQ, g_sample_rate, mode);
    if (stages <= 3) return out;
    return voice.filter_a_slope4.process(out, cutoff, cascadeQ, g_sample_rate, mode);
}

void renderVoice(PadVoice& voice, float* outL, float* outR,
                 float* pf1L, float* pf1R, float* pf2L, float* pf2R,
                 float* post1L, float* post1R, float* post2L, float* post2R,
                 int blockSize, int activeVoiceCount) {
    if (!voice.active) return;
    const PadParams& p = g_pads[voice.pad_idx];
    float* targetPfL = voice.pad_idx == 0 ? pf1L : pf2L;
    float* targetPfR = voice.pad_idx == 0 ? pf1R : pf2R;
    float* targetPostL = voice.pad_idx == 0 ? post1L : post2L;
    float* targetPostR = voice.pad_idx == 0 ? post1R : post2R;

    const float aMix = std::min(1.0f, 2.0f * (1.0f - clamp01(p.osc_mix)));
    const float bMix = std::min(1.0f, 2.0f * clamp01(p.osc_mix));
    const float filterAq = std::max(0.05f, std::min(20.0f, p.filter_q + clamp01(p.filter_resonance) * 4.0f));
    const float filterBq = std::max(0.05f, std::min(20.0f, p.filter_b_q + clamp01(p.filter_b_resonance) * 4.0f));
    const SVFMode modeA = filterMode(p.filter_type);
    const SVFMode modeB = filterMode(p.filter_b_type);
    const int slope = slopeStages(p.filter_slope);
    const float safeLevel = clamp01(p.level);
    const float compensation = voiceCompensation(activeVoiceCount);
    const float paramCoeff = smoothCoeff(8.0f);
    const float driftCoeff = smoothCoeff(100.0f);
    const bool ladder = p.filter_type == PAD_FILTER_LADDER_LP;
    const float subFrequency = safeOscillatorHz(voice.base_freq, p.sub_octave * 12.0f, 0.0f, 0.0f, 0.0f);
    const float keyTrackingRatio = p.filter_key_tracking <= 0.0001f
        ? 1.0f
        : exp2f(log2f(std::max(0.125f, std::min(8.0f, voice.base_freq / 261.625565f)))
            * std::max(0.0f, std::min(1.0f, p.filter_key_tracking)));

    // Coefficients and immutable curves are prepared once per block/voice.
    voice.warmth_filter.set_low_shelf(250.0f, (p.warmth - 0.5f) * 12.0f, g_sample_rate);
    voice.presence_filter.set_peaking(3000.0f, (p.presence - 0.5f) * 10.0f, 1.5f, g_sample_rate);
    voice.waveshaper.set_drive(1.0f + clamp01(p.hardness) * 10.0f);

    for (int n = 0; n < blockSize; n += 1) {
        const float lfo1 = voice.lfo1.process(p.lfo1_rate, p.lfo1_wave, g_sample_rate, g_sine);
        const float lfo2 = voice.lfo2.process(p.lfo2_rate, p.lfo2_wave, g_sample_rate, g_sine);
        Modulation mod;
        addModulation(lfo1, p.lfo1_depth, p.lfo1_dest, mod);
        addModulation(lfo2, p.lfo2_depth, p.lfo2_dest, mod);
        if (p.mod_env_enabled) {
            const float env = voice.mod_env.process(g_sample_rate) * p.mod_env_depth;
            applyModEnvelope(env, mod, p.mod_env_dest);
        }

        const float driftTarget = clamp01(p.drift);
        voice.drift = smooth(voice.drift, driftTarget, driftCoeff);
        const bool driftActive = voice.drift > 0.00001f;
        float slowA = 0.0f, slowB = 0.0f;
        if (driftActive) {
            voice.drift_phase_a += voice.drift_rate_a / g_sample_rate;
            voice.drift_phase_b += voice.drift_rate_b / g_sample_rate;
            voice.drift_phase_a -= floorf(voice.drift_phase_a);
            voice.drift_phase_b -= floorf(voice.drift_phase_b);
            slowA = fast_sinf(voice.drift_phase_a * KESSHO_TWO_PI) * 0.25f * voice.drift;
            slowB = fast_sinf(voice.drift_phase_b * KESSHO_TWO_PI) * 0.25f * voice.drift;
        }

        voice.a_position = smooth(voice.a_position, clamp01(p.osc_a_position + mod.a_position), paramCoeff);
        voice.b_position = smooth(voice.b_position, clamp01(p.osc_b_position + mod.b_position), paramCoeff);
        voice.a_pd = smooth(voice.a_pd, clampBipolar(p.osc_a_phase_distortion + mod.a_pd), paramCoeff);
        voice.b_pd = smooth(voice.b_pd, clampBipolar(p.osc_b_phase_distortion + mod.b_pd), paramCoeff);
        voice.a_pitch = smooth(voice.a_pitch, clampPitch(p.osc_a_pitch), paramCoeff);
        voice.b_pitch = smooth(voice.b_pitch, clampPitch(p.osc_b_pitch), paramCoeff);
        voice.a_hz_offset = smooth(voice.a_hz_offset, clampHzOffset(p.osc_a_hz_offset), paramCoeff);
        voice.b_hz_offset = smooth(voice.b_hz_offset, clampHzOffset(p.osc_b_hz_offset + mod.b_hz_offset), paramCoeff);

        const float freqA = safeOscillatorHz(voice.base_freq, voice.a_pitch, mod.pitch_semitones,
            voice.drift_static_a * voice.drift + slowA, voice.a_hz_offset);
        const float freqB = safeOscillatorHz(voice.base_freq, voice.b_pitch, mod.pitch_semitones,
            voice.drift_static_b * voice.drift + slowB, voice.b_hz_offset);
        voice.osc_a.freq = freqA;
        voice.osc_b.freq = freqB;
        voice.osc_sub.freq = subFrequency;
        const float sa = generateOscillator(voice.osc_a, p.osc_a_wave, voice.a_position, voice.a_pd) * clamp01(p.osc_a_level);
        const float sb = generateOscillator(voice.osc_b, p.osc_b_wave, voice.b_position, voice.b_pd)
            * clamp01(p.osc_b_level + mod.osc_b_level);
        voice.last_frequency_a = freqA;
        voice.last_frequency_b = freqB;
        voice.last_phase_frame_a = g_sample_frame + static_cast<uint64_t>(n + 1);
        voice.last_phase_frame_b = g_sample_frame + static_cast<uint64_t>(n + 1);

        float sub = 0.0f;
        if (p.sub_enabled) sub = generateOscillator(voice.osc_sub, p.sub_wave, 0.0f, 0.0f) * clamp01(p.sub_level);
        float noise = 0.0f;
        if (p.noise_level > 0.001f) {
            const float white = voice.noise_rng.next_bipolar();
            noise = (p.noise_type == 1 ? voice.pink.process(white) : white) * clamp01(p.noise_level);
        }
        float sample = sa * aMix + sb * bMix + sub + noise;

        float filterCutoff = clampHz(octaveMod(p.filter_cutoff, mod.filter_a) * keyTrackingRatio);
        const float filterBMod = mod.filter_b;
        const float resonance = clamp01(p.filter_resonance + mod.resonance);
        g_current_filter_freq[voice.pad_idx] = filterCutoff;
        g_current_lfo1_value[voice.pad_idx] = lfo1 * p.lfo1_depth;
        if (filterCutoff < 200.0f) sample *= 1.0f + (200.0f - filterCutoff) / 400.0f;

        float filtered = 0.0f;
        if (p.filter_routing == PAD_ROUTE_B_ONLY && p.filter_b_enabled) {
            const float bCutoff = clampHz(octaveMod(p.filter_b_cutoff, filterBMod));
            filtered = voice.filter_b.process(sample, bCutoff, filterBq, g_sample_rate, modeB);
        } else {
            filtered = ladder
                ? voice.ladder_a.process(sample, filterCutoff, resonance, p.hardness, g_sample_rate)
                : processFilterA(voice, sample, filterCutoff, std::max(0.05f, filterAq + resonance * 0.5f), modeA, slope);
            if (p.filter_routing == PAD_ROUTE_SERIES && p.filter_b_enabled) {
                const float bCutoff = clampHz(octaveMod(p.filter_b_cutoff, filterBMod));
                filtered = voice.filter_b.process(filtered, bCutoff, filterBq, g_sample_rate, modeB);
            }
        }

        filtered = voice.warmth_filter.process(filtered);
        filtered = voice.presence_filter.process(filtered);
        const float foldAmount = clamp01(p.fold_amount + mod.fold);
        if (foldAmount > 0.0001f) filtered = foldTransfer(filtered, foldAmount, p.fold_mode);
        if (!ladder && p.hardness > 0.0001f) filtered = voice.waveshaper.process(filtered);

        const float env = voice.amp_env.process(g_sample_rate);
        if (voice.amp_env.stage == ENV_OFF) { voice.active = 0; return; }
        const float amp = std::max(0.0f, env * (1.0f + mod.amp));
        const float prefader = filtered * amp * voice.velocity * voice.output_gain;
        if (voice.output_gain_remaining > 0u) {
            voice.output_gain += voice.output_gain_step;
            --voice.output_gain_remaining;
            if (voice.output_gain_remaining == 0u) voice.output_gain = voice.output_gain_target;
        }
        // Engineering calibration and polyphony compensation belong before the
        // pad-level dry/send split.  The Product Core keeps the Pad source send
        // intentionally pre-fader relative to source.level, so its prefader tap
        // must carry the same fixed transfer as the postfader tap.
        const float calibrated_prefader = prefader * kOutputCalibration * compensation;
        const float postfader = calibrated_prefader * safeLevel;
        outL[n] += postfader;
        outR[n] += postfader;
        targetPfL[n] += calibrated_prefader;
        targetPfR[n] += calibrated_prefader;
        targetPostL[n] += postfader;
        targetPostR[n] += postfader;
    }
}

void updateIdleTelemetry(int pad, int frames) {
    if (pad < 0 || pad >= PAD_NUM_PADS) return;
    const PadParams& p = g_pads[pad];
    float lfo1 = 0.0f;
    for (int i = 0; i < std::max(1, frames); i += 1) lfo1 = g_preview_lfo1[pad].process(p.lfo1_rate, p.lfo1_wave, g_sample_rate, g_sine);
    Modulation mod;
    addModulation(lfo1, p.lfo1_depth, p.lfo1_dest, mod);
    float cutoff = clampHz(octaveMod(p.filter_cutoff, mod.filter_a));
    g_current_filter_freq[pad] = cutoff;
    g_current_lfo1_value[pad] = lfo1 * p.lfo1_depth;
}

} // namespace

// Completes the C header's opaque handle in the global namespace.
struct KesshoPadInstance { PadState state; };

extern "C" {

int pad_init(float sample_rate) {
    g_sample_rate = std::isfinite(sample_rate) && sample_rate > 1000.0f ? sample_rate : 48000.0f;
    g_sample_frame = 0;
    g_sine.init();
    g_rng.seed(7777);
    for (int i = 0; i < PAD_NUM_VOICES; i += 1) {
        g_voices[i].reset();
        g_voices[i].pad_idx = 0;
        g_voices[i].osc_a.phase = rngUnipolar();
        g_voices[i].osc_b.phase = rngUnipolar();
        g_voices[i].osc_sub.phase = rngUnipolar();
        g_voices[i].phase_seeded = true;
        g_voices[i].noise_rng.seed(g_rng.next());
        g_voices[i].lfo1.rng.seed(g_rng.next());
        g_voices[i].lfo2.rng.seed(g_rng.next());
    }
    for (int pad = 0; pad < PAD_NUM_PADS; pad += 1) {
        g_preview_lfo1[pad].reset();
        g_preview_lfo2[pad].reset();
        g_preview_lfo1[pad].rng.seed(g_rng.next());
        g_preview_lfo2[pad].rng.seed(g_rng.next());
        g_current_filter_freq[pad] = clampHz(g_pads[pad].filter_cutoff);
        g_current_lfo1_value[pad] = 0.0f;
    }
    memset(g_output, 0, sizeof(g_output));
    memset(g_reverb_output, 0, sizeof(g_reverb_output));
    memset(g_prefader_pad1, 0, sizeof(g_prefader_pad1));
    memset(g_prefader_pad2, 0, sizeof(g_prefader_pad2));
    memset(g_postfader_pad1, 0, sizeof(g_postfader_pad1));
    memset(g_postfader_pad2, 0, sizeof(g_postfader_pad2));
    return 0;
}

void pad_destroy(void) {}
float* pad_get_output_ptr(void) { return g_output; }
float* pad_get_reverb_send_ptr(void) { return g_reverb_output; }
float* pad_get_prefader_pad1_ptr(void) { return g_prefader_pad1; }
float* pad_get_prefader_pad2_ptr(void) { return g_prefader_pad2; }
float* pad_get_postfader_pad1_ptr(void) { return g_postfader_pad1; }
float* pad_get_postfader_pad2_ptr(void) { return g_postfader_pad2; }

void pad_process_block(int block_size) {
    const int frames = std::max(0, std::min(PAD_MAX_BLOCK_SIZE, block_size));
    memset(g_output, 0, static_cast<size_t>(frames) * 2u * sizeof(float));
    memset(g_reverb_output, 0, static_cast<size_t>(frames) * 2u * sizeof(float));
    memset(g_prefader_pad1, 0, static_cast<size_t>(frames) * 2u * sizeof(float));
    memset(g_prefader_pad2, 0, static_cast<size_t>(frames) * 2u * sizeof(float));
    memset(g_postfader_pad1, 0, static_cast<size_t>(frames) * 2u * sizeof(float));
    memset(g_postfader_pad2, 0, static_cast<size_t>(frames) * 2u * sizeof(float));
    if (frames == 0) return;
    float dryL[PAD_MAX_BLOCK_SIZE] = {}, dryR[PAD_MAX_BLOCK_SIZE] = {};
    float pf1L[PAD_MAX_BLOCK_SIZE] = {}, pf1R[PAD_MAX_BLOCK_SIZE] = {};
    float pf2L[PAD_MAX_BLOCK_SIZE] = {}, pf2R[PAD_MAX_BLOCK_SIZE] = {};
    float post1L[PAD_MAX_BLOCK_SIZE] = {}, post1R[PAD_MAX_BLOCK_SIZE] = {};
    float post2L[PAD_MAX_BLOCK_SIZE] = {}, post2R[PAD_MAX_BLOCK_SIZE] = {};
    bool activePad[PAD_NUM_PADS] = {};
    int voiceCount[PAD_NUM_PADS] = {};
    for (int i = 0; i < PAD_NUM_VOICES; i += 1) {
        if (g_voices[i].active) {
            const int pad = std::max(0, std::min(PAD_NUM_PADS - 1, g_voices[i].pad_idx));
            activePad[pad] = true;
            voiceCount[pad] += 1;
        }
    }
    for (int i = 0; i < PAD_NUM_VOICES; i += 1) {
        if (!g_voices[i].active) continue;
        const int pad = std::max(0, std::min(PAD_NUM_PADS - 1, g_voices[i].pad_idx));
        renderVoice(g_voices[i], dryL, dryR, pf1L, pf1R, pf2L, pf2R, post1L, post1R, post2L, post2R, frames, voiceCount[pad]);
    }
    for (int pad = 0; pad < PAD_NUM_PADS; pad += 1) if (!activePad[pad]) updateIdleTelemetry(pad, frames);
    for (int n = 0; n < frames; n += 1) {
        g_output[n * 2] = softLimit(dryL[n]);
        g_output[n * 2 + 1] = softLimit(dryR[n]);
        g_reverb_output[n * 2] = softLimit((post1L[n] + post2L[n]) * g_reverb_send);
        g_reverb_output[n * 2 + 1] = softLimit((post1R[n] + post2R[n]) * g_reverb_send);
        g_prefader_pad1[n * 2] = pf1L[n]; g_prefader_pad1[n * 2 + 1] = pf1R[n];
        g_prefader_pad2[n * 2] = pf2L[n]; g_prefader_pad2[n * 2 + 1] = pf2R[n];
        g_postfader_pad1[n * 2] = softLimit(post1L[n]); g_postfader_pad1[n * 2 + 1] = softLimit(post1R[n]);
        g_postfader_pad2[n * 2] = softLimit(post2L[n]); g_postfader_pad2[n * 2 + 1] = softLimit(post2R[n]);
    }
    g_sample_frame += static_cast<uint64_t>(frames);
}

void pad_note_on(int voice_idx, float frequency, float velocity) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES) return;
    PadVoice& voice = g_voices[voice_idx];
    const PadParams& p = g_pads[voice.pad_idx];
    voice.active = 1;
    voice.base_freq = std::isfinite(frequency) && frequency > 0.0f ? frequency : 440.0f;
    voice.velocity = clamp01(velocity);
    voice.output_gain = voice.output_gain_target = 1.0f;
    voice.output_gain_step = 0.0f;
    voice.output_gain_remaining = 0u;

    if (p.phase_reset == PAD_PHASE_RESET_ON) {
        voice.osc_a.phase = voice.osc_b.phase = 0.0f;
    } else if (p.phase_reset == PAD_PHASE_RESET_RANDOM || !voice.phase_seeded) {
        voice.osc_a.phase = rngUnipolar();
        voice.osc_b.phase = rngUnipolar();
    } else {
        advanceIdlePhase(voice.osc_a, voice.last_phase_frame_a, voice.last_frequency_a, g_sample_frame);
        advanceIdlePhase(voice.osc_b, voice.last_phase_frame_b, voice.last_frequency_b, g_sample_frame);
    }
    voice.osc_sub.phase = rngUnipolar();
    voice.phase_seeded = true;
    voice.last_phase_frame_a = voice.last_phase_frame_b = g_sample_frame;
    voice.drift_static_a = rngTriangular() * 0.7f;
    voice.drift_static_b = rngTriangular() * 0.8f;
    voice.drift_phase_a = rngUnipolar();
    voice.drift_phase_b = rngUnipolar();
    voice.drift_rate_a = 0.025f + rngUnipolar() * 0.035f;
    voice.drift_rate_b = 0.035f + rngUnipolar() * 0.055f;
    voice.drift = clamp01(p.drift);
    voice.a_position = clamp01(p.osc_a_position);
    voice.b_position = clamp01(p.osc_b_position);
    voice.a_pd = clampBipolar(p.osc_a_phase_distortion);
    voice.b_pd = clampBipolar(p.osc_b_phase_distortion);
    voice.a_pitch = clampPitch(p.osc_a_pitch);
    voice.b_pitch = clampPitch(p.osc_b_pitch);
    voice.a_hz_offset = clampHzOffset(p.osc_a_hz_offset);
    voice.b_hz_offset = clampHzOffset(p.osc_b_hz_offset);

    voice.filter_a.reset(); voice.filter_a_slope2.reset(); voice.filter_a_slope3.reset(); voice.filter_a_slope4.reset();
    voice.filter_b.reset(); voice.ladder_a.reset();
    voice.amp_env.reset(); voice.amp_env.attack = p.attack; voice.amp_env.decay = p.decay;
    voice.amp_env.sustain = clamp01(p.sustain); voice.amp_env.release = p.release; voice.amp_env.gate_on();
    voice.mod_env.reset();
    if (p.mod_env_enabled) {
        voice.mod_env.attack = p.mod_env_attack; voice.mod_env.decay = p.mod_env_decay;
        voice.mod_env.sustain = clamp01(p.mod_env_sustain); voice.mod_env.release = p.mod_env_release; voice.mod_env.gate_on();
    }
    voice.waveshaper.set_drive(1.0f + clamp01(p.hardness) * 10.0f);
}

void pad_set_voice_frequency(int voice_idx, float frequency) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES || !std::isfinite(frequency) || frequency <= 0.0f) return;
    if (g_voices[voice_idx].active) g_voices[voice_idx].base_freq = frequency;
}
void pad_set_voice_gain(int voice_idx, float gain) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES || !std::isfinite(gain)) return;
    g_voices[voice_idx].output_gain = g_voices[voice_idx].output_gain_target = std::max(0.0f, std::min(1.0f, gain));
    g_voices[voice_idx].output_gain_step = 0.0f; g_voices[voice_idx].output_gain_remaining = 0u;
}
void pad_set_voice_gain_ramp(int voice_idx, float target, uint32_t frames) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES || !std::isfinite(target)) return;
    PadVoice& voice = g_voices[voice_idx];
    voice.output_gain_target = std::max(0.0f, std::min(1.0f, target));
    voice.output_gain_remaining = frames;
    voice.output_gain_step = frames ? (voice.output_gain_target - voice.output_gain) / static_cast<float>(frames) : 0.0f;
    if (!frames) voice.output_gain = voice.output_gain_target;
}
void pad_note_off(int voice_idx) {
    if (voice_idx < 0 || voice_idx >= PAD_NUM_VOICES) return;
    PadVoice& voice = g_voices[voice_idx];
    if (voice.active) { voice.amp_env.gate_off(); if (g_pads[voice.pad_idx].mod_env_enabled) voice.mod_env.gate_off(); }
}
void pad_kill_voice(int voice_idx) { if (voice_idx >= 0 && voice_idx < PAD_NUM_VOICES) g_voices[voice_idx].reset(); }
void pad_set_voice_pad(int voice_idx, int pad) { if (voice_idx >= 0 && voice_idx < PAD_NUM_VOICES && pad >= 0 && pad < PAD_NUM_PADS) g_voices[voice_idx].pad_idx = pad; }

#define PAD_CHECK(index) if ((index) < 0 || (index) >= PAD_NUM_PADS) return
void pad_set_osc_a_wave(int p, int v) { PAD_CHECK(p); g_pads[p].osc_a_wave = std::max(0, std::min(6, v)); }
void pad_set_osc_a_position(int p, float v) { PAD_CHECK(p); g_pads[p].osc_a_position = clamp01(v); }
void pad_set_osc_a_phase_distortion(int p, float v) { PAD_CHECK(p); g_pads[p].osc_a_phase_distortion = clampBipolar(v); }
void pad_set_osc_a_pitch(int p, float v) { PAD_CHECK(p); g_pads[p].osc_a_pitch = clampPitch(v); }
void pad_set_osc_a_hz_offset(int p, float v) { PAD_CHECK(p); g_pads[p].osc_a_hz_offset = clampHzOffset(v); }
void pad_set_osc_a_level(int p, float v) { PAD_CHECK(p); g_pads[p].osc_a_level = clamp01(v); }
void pad_set_osc_b_wave(int p, int v) { PAD_CHECK(p); g_pads[p].osc_b_wave = std::max(0, std::min(6, v)); }
void pad_set_osc_b_position(int p, float v) { PAD_CHECK(p); g_pads[p].osc_b_position = clamp01(v); }
void pad_set_osc_b_phase_distortion(int p, float v) { PAD_CHECK(p); g_pads[p].osc_b_phase_distortion = clampBipolar(v); }
void pad_set_osc_b_pitch(int p, float v) { PAD_CHECK(p); g_pads[p].osc_b_pitch = clampPitch(v); }
void pad_set_osc_b_hz_offset(int p, float v) { PAD_CHECK(p); g_pads[p].osc_b_hz_offset = clampHzOffset(v); }
void pad_set_osc_b_level(int p, float v) { PAD_CHECK(p); g_pads[p].osc_b_level = clamp01(v); }
void pad_set_osc_mix(int p, float v) { PAD_CHECK(p); g_pads[p].osc_mix = clamp01(v); }
void pad_set_drift(int p, float v) { PAD_CHECK(p); g_pads[p].drift = clamp01(v); }
void pad_set_phase_reset(int p, int v) { PAD_CHECK(p); g_pads[p].phase_reset = std::max(PAD_PHASE_RESET_OFF, std::min(PAD_PHASE_RESET_RANDOM, v)); }
void pad_set_sub_enabled(int p, int v) { PAD_CHECK(p); g_pads[p].sub_enabled = v ? 1 : 0; }
void pad_set_sub_octave(int p, int v) { PAD_CHECK(p); g_pads[p].sub_octave = std::max(-4, std::min(1, v)); }
void pad_set_sub_wave(int p, int v) { PAD_CHECK(p); g_pads[p].sub_wave = std::max(0, std::min(3, v)); }
void pad_set_sub_level(int p, float v) { PAD_CHECK(p); g_pads[p].sub_level = clamp01(v); }
void pad_set_noise_type(int p, int v) { PAD_CHECK(p); g_pads[p].noise_type = v ? 1 : 0; }
void pad_set_noise_level(int p, float v) { PAD_CHECK(p); g_pads[p].noise_level = clamp01(v); }
void pad_set_hardness(int p, float v) { PAD_CHECK(p); g_pads[p].hardness = clamp01(v); }
void pad_set_warmth(int p, float v) { PAD_CHECK(p); g_pads[p].warmth = clamp01(v); }
void pad_set_presence(int p, float v) { PAD_CHECK(p); g_pads[p].presence = clamp01(v); }
void pad_set_fold_amount(int p, float v) { PAD_CHECK(p); g_pads[p].fold_amount = clamp01(v); }
void pad_set_fold_mode(int p, int v) { PAD_CHECK(p); g_pads[p].fold_mode = std::max(0, std::min(2, v)); }
void pad_set_filter_type(int p, int v) { PAD_CHECK(p); g_pads[p].filter_type = std::max(0, std::min(4, v)); }
void pad_set_filter_cutoff(int p, float v) { PAD_CHECK(p); g_pads[p].filter_cutoff = clampHz(v); }
void pad_set_filter_resonance(int p, float v) { PAD_CHECK(p); g_pads[p].filter_resonance = clamp01(v); }
void pad_set_filter_q(int p, float v) { PAD_CHECK(p); g_pads[p].filter_q = std::isfinite(v) ? std::max(0.01f, std::min(20.0f, v)) : 0.7f; }
void pad_set_filter_slope(int p, float v) { PAD_CHECK(p); g_pads[p].filter_slope = std::isfinite(v) ? std::max(12.0f, std::min(48.0f, v)) : 12.0f; }
void pad_set_filter_key_tracking(int p, float v) { PAD_CHECK(p); g_pads[p].filter_key_tracking = clamp01(v); }
void pad_set_filter_b_enabled(int p, int v) { PAD_CHECK(p); g_pads[p].filter_b_enabled = v ? 1 : 0; }
void pad_set_filter_b_type(int p, int v) { PAD_CHECK(p); g_pads[p].filter_b_type = std::max(0, std::min(3, v)); }
void pad_set_filter_b_cutoff(int p, float v) { PAD_CHECK(p); g_pads[p].filter_b_cutoff = clampHz(v); }
void pad_set_filter_b_resonance(int p, float v) { PAD_CHECK(p); g_pads[p].filter_b_resonance = clamp01(v); }
void pad_set_filter_b_q(int p, float v) { PAD_CHECK(p); g_pads[p].filter_b_q = std::isfinite(v) ? std::max(0.01f, std::min(20.0f, v)) : 0.7f; }
void pad_set_filter_routing(int p, int v) { PAD_CHECK(p); g_pads[p].filter_routing = std::max(0, std::min(2, v)); }
void pad_set_attack(int p, float v) { PAD_CHECK(p); g_pads[p].attack = std::max(0.001f, std::min(20.0f, v)); }
void pad_set_decay(int p, float v) { PAD_CHECK(p); g_pads[p].decay = std::max(0.001f, std::min(20.0f, v)); }
void pad_set_sustain(int p, float v) { PAD_CHECK(p); g_pads[p].sustain = clamp01(v); }
void pad_set_release(int p, float v) { PAD_CHECK(p); g_pads[p].release = std::max(0.001f, std::min(30.0f, v)); }
void pad_set_lfo1_rate(int p, float v) { PAD_CHECK(p); g_pads[p].lfo1_rate = std::max(0.0f, std::min(40.0f, v)); }
void pad_set_lfo1_depth(int p, float v) { PAD_CHECK(p); g_pads[p].lfo1_depth = clamp01(v); }
void pad_set_lfo1_wave(int p, int v) { PAD_CHECK(p); g_pads[p].lfo1_wave = std::max(0, std::min(6, v)); }
void pad_set_lfo1_dest(int p, int v) { PAD_CHECK(p); g_pads[p].lfo1_dest = std::max(0, std::min(12, v)); }
void pad_set_lfo2_rate(int p, float v) { PAD_CHECK(p); g_pads[p].lfo2_rate = std::max(0.0f, std::min(40.0f, v)); }
void pad_set_lfo2_depth(int p, float v) { PAD_CHECK(p); g_pads[p].lfo2_depth = clamp01(v); }
void pad_set_lfo2_wave(int p, int v) { PAD_CHECK(p); g_pads[p].lfo2_wave = std::max(0, std::min(6, v)); }
void pad_set_lfo2_dest(int p, int v) { PAD_CHECK(p); g_pads[p].lfo2_dest = std::max(0, std::min(12, v)); }
void pad_set_mod_env_enabled(int p, int v) { PAD_CHECK(p); g_pads[p].mod_env_enabled = v ? 1 : 0; }
void pad_set_mod_env_attack(int p, float v) { PAD_CHECK(p); g_pads[p].mod_env_attack = std::max(0.001f, std::min(20.0f, v)); }
void pad_set_mod_env_decay(int p, float v) { PAD_CHECK(p); g_pads[p].mod_env_decay = std::max(0.001f, std::min(20.0f, v)); }
void pad_set_mod_env_sustain(int p, float v) { PAD_CHECK(p); g_pads[p].mod_env_sustain = clamp01(v); }
void pad_set_mod_env_release(int p, float v) { PAD_CHECK(p); g_pads[p].mod_env_release = std::max(0.001f, std::min(30.0f, v)); }
void pad_set_mod_env_depth(int p, float v) { PAD_CHECK(p); g_pads[p].mod_env_depth = std::isfinite(v) ? std::max(-1.0f, std::min(1.0f, v)) : 0.0f; }
void pad_set_mod_env_dest(int p, int v) { PAD_CHECK(p); g_pads[p].mod_env_dest = std::max(0, std::min(12, v)); }
void pad_set_level(int p, float v) { PAD_CHECK(p); g_pads[p].level = clamp01(v); }
void pad_set_reverb_send(float v) { g_reverb_send = clamp01(v); }

int pad_get_active_count(void) { int count = 0; for (const auto& voice : g_voices) if (voice.active) count += 1; return count; }
void pad_advance_idle_telemetry(int p, int frames) { updateIdleTelemetry(p, frames); }
float pad_get_current_filter_freq(int p) { return p >= 0 && p < PAD_NUM_PADS ? telemetryHz(g_current_filter_freq[p]) : 0.0f; }
float pad_get_current_lfo1_value(int p) { return p >= 0 && p < PAD_NUM_PADS ? g_current_lfo1_value[p] : 0.0f; }

KesshoPadInstance* pad_instance_create(float sample_rate) {
    KesshoPadInstance* instance = new (std::nothrow) KesshoPadInstance{};
    if (!instance) return nullptr;
    { ScopedPadState scoped(&instance->state); if (pad_init(sample_rate) != 0) { delete instance; return nullptr; } }
    return instance;
}
void pad_instance_destroy(KesshoPadInstance* instance) { if (!instance) return; { ScopedPadState scoped(&instance->state); pad_destroy(); } delete instance; }
int pad_instance_reset(KesshoPadInstance* instance, float sample_rate) { if (!instance) return 0; ScopedPadState scoped(&instance->state); return pad_init(sample_rate) == 0 ? 1 : 0; }
float* pad_instance_get_output_ptr(KesshoPadInstance* i) { if (!i) return nullptr; ScopedPadState s(&i->state); return pad_get_output_ptr(); }
float* pad_instance_get_reverb_send_ptr(KesshoPadInstance* i) { if (!i) return nullptr; ScopedPadState s(&i->state); return pad_get_reverb_send_ptr(); }
float* pad_instance_get_prefader_pad1_ptr(KesshoPadInstance* i) { if (!i) return nullptr; ScopedPadState s(&i->state); return pad_get_prefader_pad1_ptr(); }
float* pad_instance_get_prefader_pad2_ptr(KesshoPadInstance* i) { if (!i) return nullptr; ScopedPadState s(&i->state); return pad_get_prefader_pad2_ptr(); }
float* pad_instance_get_postfader_pad1_ptr(KesshoPadInstance* i) { if (!i) return nullptr; ScopedPadState s(&i->state); return pad_get_postfader_pad1_ptr(); }
float* pad_instance_get_postfader_pad2_ptr(KesshoPadInstance* i) { if (!i) return nullptr; ScopedPadState s(&i->state); return pad_get_postfader_pad2_ptr(); }
void pad_instance_process_block(KesshoPadInstance* i, int n) { if (!i) return; ScopedPadState s(&i->state); pad_process_block(n); }
void pad_instance_note_on(KesshoPadInstance* i, int v, float f, float gain) { if (!i) return; ScopedPadState s(&i->state); pad_note_on(v, f, gain); }
void pad_instance_set_voice_frequency(KesshoPadInstance* i, int v, float f) { if (!i) return; ScopedPadState s(&i->state); pad_set_voice_frequency(v, f); }
void pad_instance_set_voice_gain(KesshoPadInstance* i, int v, float gain) { if (!i) return; ScopedPadState s(&i->state); pad_set_voice_gain(v, gain); }
void pad_instance_set_voice_gain_ramp(KesshoPadInstance* i, int v, float gain, uint32_t n) { if (!i) return; ScopedPadState s(&i->state); pad_set_voice_gain_ramp(v, gain, n); }
void pad_instance_note_off(KesshoPadInstance* i, int v) { if (!i) return; ScopedPadState s(&i->state); pad_note_off(v); }
void pad_instance_kill_voice(KesshoPadInstance* i, int v) { if (!i) return; ScopedPadState s(&i->state); pad_kill_voice(v); }
void pad_instance_set_voice_pad(KesshoPadInstance* i, int v, int p) { if (!i) return; ScopedPadState s(&i->state); pad_set_voice_pad(v, p); }

#define INSTANCE_SETTER2(name, typeA, typeB) \
    void pad_instance_##name(KesshoPadInstance* i, typeA a, typeB b) { if (!i) return; ScopedPadState s(&i->state); pad_##name(a, b); }
#define INSTANCE_SETTER1(name, typeA) \
    void pad_instance_##name(KesshoPadInstance* i, typeA a) { if (!i) return; ScopedPadState s(&i->state); pad_##name(a); }
INSTANCE_SETTER2(set_osc_a_wave, int, int)
INSTANCE_SETTER2(set_osc_a_position, int, float)
INSTANCE_SETTER2(set_osc_a_phase_distortion, int, float)
INSTANCE_SETTER2(set_osc_a_pitch, int, float)
INSTANCE_SETTER2(set_osc_a_hz_offset, int, float)
INSTANCE_SETTER2(set_osc_a_level, int, float)
INSTANCE_SETTER2(set_osc_b_wave, int, int)
INSTANCE_SETTER2(set_osc_b_position, int, float)
INSTANCE_SETTER2(set_osc_b_phase_distortion, int, float)
INSTANCE_SETTER2(set_osc_b_pitch, int, float)
INSTANCE_SETTER2(set_osc_b_hz_offset, int, float)
INSTANCE_SETTER2(set_osc_b_level, int, float)
INSTANCE_SETTER2(set_osc_mix, int, float)
INSTANCE_SETTER2(set_drift, int, float)
INSTANCE_SETTER2(set_phase_reset, int, int)
INSTANCE_SETTER2(set_sub_enabled, int, int)
INSTANCE_SETTER2(set_sub_octave, int, int)
INSTANCE_SETTER2(set_sub_wave, int, int)
INSTANCE_SETTER2(set_sub_level, int, float)
INSTANCE_SETTER2(set_noise_type, int, int)
INSTANCE_SETTER2(set_noise_level, int, float)
INSTANCE_SETTER2(set_hardness, int, float)
INSTANCE_SETTER2(set_warmth, int, float)
INSTANCE_SETTER2(set_presence, int, float)
INSTANCE_SETTER2(set_fold_amount, int, float)
INSTANCE_SETTER2(set_fold_mode, int, int)
INSTANCE_SETTER2(set_filter_type, int, int)
INSTANCE_SETTER2(set_filter_cutoff, int, float)
INSTANCE_SETTER2(set_filter_resonance, int, float)
INSTANCE_SETTER2(set_filter_q, int, float)
INSTANCE_SETTER2(set_filter_slope, int, float)
INSTANCE_SETTER2(set_filter_key_tracking, int, float)
INSTANCE_SETTER2(set_filter_b_enabled, int, int)
INSTANCE_SETTER2(set_filter_b_type, int, int)
INSTANCE_SETTER2(set_filter_b_cutoff, int, float)
INSTANCE_SETTER2(set_filter_b_resonance, int, float)
INSTANCE_SETTER2(set_filter_b_q, int, float)
INSTANCE_SETTER2(set_filter_routing, int, int)
INSTANCE_SETTER2(set_attack, int, float)
INSTANCE_SETTER2(set_decay, int, float)
INSTANCE_SETTER2(set_sustain, int, float)
INSTANCE_SETTER2(set_release, int, float)
INSTANCE_SETTER2(set_lfo1_rate, int, float)
INSTANCE_SETTER2(set_lfo1_depth, int, float)
INSTANCE_SETTER2(set_lfo1_wave, int, int)
INSTANCE_SETTER2(set_lfo1_dest, int, int)
INSTANCE_SETTER2(set_lfo2_rate, int, float)
INSTANCE_SETTER2(set_lfo2_depth, int, float)
INSTANCE_SETTER2(set_lfo2_wave, int, int)
INSTANCE_SETTER2(set_lfo2_dest, int, int)
INSTANCE_SETTER2(set_mod_env_enabled, int, int)
INSTANCE_SETTER2(set_mod_env_attack, int, float)
INSTANCE_SETTER2(set_mod_env_decay, int, float)
INSTANCE_SETTER2(set_mod_env_sustain, int, float)
INSTANCE_SETTER2(set_mod_env_release, int, float)
INSTANCE_SETTER2(set_mod_env_depth, int, float)
INSTANCE_SETTER2(set_mod_env_dest, int, int)
INSTANCE_SETTER2(set_level, int, float)
INSTANCE_SETTER1(set_reverb_send, float)
#undef INSTANCE_SETTER2
#undef INSTANCE_SETTER1

int pad_instance_get_active_count(KesshoPadInstance* i) { if (!i) return 0; ScopedPadState s(&i->state); return pad_get_active_count(); }
void pad_instance_advance_idle_telemetry(KesshoPadInstance* i, int p, int n) { if (!i) return; ScopedPadState s(&i->state); pad_advance_idle_telemetry(p, n); }
float pad_instance_get_current_filter_freq(KesshoPadInstance* i, int p) { if (!i) return 0.0f; ScopedPadState s(&i->state); return pad_get_current_filter_freq(p); }
float pad_instance_get_current_lfo1_value(KesshoPadInstance* i, int p) { if (!i) return 0.0f; ScopedPadState s(&i->state); return pad_get_current_lfo1_value(p); }

} // extern "C"
