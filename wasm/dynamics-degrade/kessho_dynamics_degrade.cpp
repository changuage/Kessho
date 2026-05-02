#include "kessho_dynamics_degrade.h"

#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace {

struct DynamicsDegradeState {
    float sample_rate = 44100.0f;
    int enabled = 0;
    float mix = 0.0f;
    float alias = 0.0f;
    float generation = 0.0f;
    float corrosion = 0.0f;
    float wear = 0.0f;

    float held[2] = {0.0f, 0.0f};
    float phase[2] = {1.0f, 1.0f};
    float lowpass[2] = {0.0f, 0.0f};

    float input[KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE * 2] = {0.0f};
    float output[KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE * 2] = {0.0f};
};

DynamicsDegradeState g_state;

inline float clamp01(float value) {
    if (!std::isfinite(value) || value <= 0.0f) return 0.0f;
    if (value >= 1.0f) return 1.0f;
    return value;
}

} // namespace

extern "C" {

int dynamics_degrade_init(float sample_rate) {
    std::memset(&g_state, 0, sizeof(g_state));
    g_state.sample_rate = std::isfinite(sample_rate) && sample_rate > 1000.0f ? sample_rate : 44100.0f;
    g_state.phase[0] = 1.0f;
    g_state.phase[1] = 1.0f;
    return 0;
}

void dynamics_degrade_destroy(void) {
    std::memset(&g_state, 0, sizeof(g_state));
    g_state.sample_rate = 44100.0f;
    g_state.phase[0] = 1.0f;
    g_state.phase[1] = 1.0f;
}

float* dynamics_degrade_get_input_ptr(void) {
    return g_state.input;
}

float* dynamics_degrade_get_output_ptr(void) {
    return g_state.output;
}

void dynamics_degrade_set_params(
    int enabled,
    float mix,
    float alias,
    float generation,
    float corrosion,
    float wear
) {
    g_state.enabled = enabled ? 1 : 0;
    g_state.mix = clamp01(mix);
    g_state.alias = clamp01(alias);
    g_state.generation = clamp01(generation);
    g_state.corrosion = clamp01(corrosion);
    g_state.wear = clamp01(wear);
}

void dynamics_degrade_process_block(int block_size) {
    if (block_size <= 0) return;
    if (block_size > KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE) {
        block_size = KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE;
    }

    if (!g_state.enabled || g_state.mix <= 0.0001f) {
        std::memcpy(g_state.output, g_state.input, static_cast<size_t>(block_size) * 2 * sizeof(float));
        return;
    }

    const float alias_focus = std::pow(g_state.alias, 1.35f);
    const float destructive = clamp01(alias_focus * (0.6f + g_state.corrosion * 0.55f));
    const float damage = clamp01(alias_focus * 0.34f + g_state.generation * 0.2f + g_state.corrosion * 0.14f);
    const float rate_ratio = std::fmax(0.2f, 1.0f / (1.0f + alias_focus * 3.2f + g_state.generation * 0.7f + g_state.corrosion * 0.55f));
    const float bit_depth = std::fmax(9.0f, 16.0f - alias_focus * 3.2f - g_state.generation * 1.1f - g_state.corrosion * 1.1f);
    const float quant_steps = std::fmax(8.0f, std::pow(2.0f, bit_depth));
    const float cutoff_hz = std::fmax(
        1500.0f,
        g_state.sample_rate * 0.45f * (1.0f - g_state.wear * 0.46f - g_state.generation * 0.24f - g_state.corrosion * 0.1f)
    );
    const float alpha = std::fmin(1.0f, 1.0f - std::exp((-2.0f * static_cast<float>(M_PI) * cutoff_hz) / g_state.sample_rate));
    const float fold = 1.0f + g_state.corrosion * 0.58f + g_state.generation * 0.2f + destructive * 0.34f;
    const float inv_fold_tanh = 1.0f / std::fmax(1.0e-6f, std::tanh(fold));
    const float wet_lift = 0.08f + damage * 0.18f + destructive * 0.18f;

    for (int channel = 0; channel < 2; ++channel) {
        float held = g_state.held[channel];
        float phase = g_state.phase[channel];
        float lp = g_state.lowpass[channel];

        for (int i = 0; i < block_size; ++i) {
            const int index = i * 2 + channel;
            const float dry = std::isfinite(g_state.input[index]) ? g_state.input[index] : 0.0f;

            phase += rate_ratio;
            if (phase >= 1.0f) {
                phase -= std::floor(phase);
                held = dry;
            }

            float wet = std::round(held * quant_steps) / quant_steps;
            wet = std::tanh(wet * fold) * inv_fold_tanh;
            lp += (wet - lp) * alpha;
            wet = lp + (wet - lp) * wet_lift;
            g_state.output[index] = dry + (wet - dry) * g_state.mix;
        }

        g_state.held[channel] = held;
        g_state.phase[channel] = phase;
        g_state.lowpass[channel] = lp;
    }
}

} // extern "C"
