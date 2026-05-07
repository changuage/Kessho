#include "kessho_dynamics_degrade.h"

#include <cmath>
#include <cstring>
#include <new>

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

DynamicsDegradeState g_default;
thread_local DynamicsDegradeState* g_current = &g_default;

DynamicsDegradeState& dynamics_degrade_current_state() {
    return *g_current;
}

struct ScopedDynamicsDegradeState {
    explicit ScopedDynamicsDegradeState(DynamicsDegradeState& next) : previous(g_current) {
        g_current = &next;
    }

    ~ScopedDynamicsDegradeState() {
        g_current = previous;
    }

    DynamicsDegradeState* previous;
};

inline float clamp01(float value) {
    if (!std::isfinite(value) || value <= 0.0f) return 0.0f;
    if (value >= 1.0f) return 1.0f;
    return value;
}

} // namespace

extern "C" {

struct KesshoDynamicsDegradeInstance {
    DynamicsDegradeState state;
};

int dynamics_degrade_init(float sample_rate) {
    DynamicsDegradeState& g_state = dynamics_degrade_current_state();
    std::memset(&g_state, 0, sizeof(g_state));
    g_state.sample_rate = std::isfinite(sample_rate) && sample_rate > 1000.0f ? sample_rate : 44100.0f;
    g_state.phase[0] = 1.0f;
    g_state.phase[1] = 1.0f;
    return 0;
}

void dynamics_degrade_destroy(void) {
    DynamicsDegradeState& g_state = dynamics_degrade_current_state();
    std::memset(&g_state, 0, sizeof(g_state));
    g_state.sample_rate = 44100.0f;
    g_state.phase[0] = 1.0f;
    g_state.phase[1] = 1.0f;
}

float* dynamics_degrade_get_input_ptr(void) {
    return dynamics_degrade_current_state().input;
}

float* dynamics_degrade_get_output_ptr(void) {
    return dynamics_degrade_current_state().output;
}

void dynamics_degrade_set_params(
    int enabled,
    float mix,
    float alias,
    float generation,
    float corrosion,
    float wear
) {
    DynamicsDegradeState& g_state = dynamics_degrade_current_state();
    g_state.enabled = enabled ? 1 : 0;
    g_state.mix = clamp01(mix);
    g_state.alias = clamp01(alias);
    g_state.generation = clamp01(generation);
    g_state.corrosion = clamp01(corrosion);
    g_state.wear = clamp01(wear);
}

void dynamics_degrade_process_block(int block_size) {
    DynamicsDegradeState& g_state = dynamics_degrade_current_state();
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
    const bool clean_media_path = alias_focus <= 0.0001f && g_state.generation <= 0.0001f && g_state.corrosion <= 0.0001f;
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
    const float shaper_trim = 1.0f / (1.0f + (fold - 1.0f) * (0.52f + g_state.mix * 0.22f) + destructive * 0.18f + damage * 0.12f);
    const float wet_lift = 0.08f + damage * 0.18f + destructive * 0.18f;

    for (int channel = 0; channel < 2; ++channel) {
        float held = g_state.held[channel];
        float phase = g_state.phase[channel];
        float lp = g_state.lowpass[channel];

        for (int i = 0; i < block_size; ++i) {
            const int index = i * 2 + channel;
            const float dry = std::isfinite(g_state.input[index]) ? g_state.input[index] : 0.0f;

            if (clean_media_path) {
                held = dry;
                if (g_state.wear <= 0.0001f) {
                    lp = dry;
                    g_state.output[index] = dry;
                    continue;
                }
                lp += (dry - lp) * alpha;
                g_state.output[index] = dry + (lp - dry) * g_state.mix;
                continue;
            }

            phase += rate_ratio;
            if (phase >= 1.0f) {
                phase -= std::floor(phase);
                held = dry;
            }

            float wet = std::round(held * quant_steps) / quant_steps;
            wet = std::tanh(wet * fold) * inv_fold_tanh * shaper_trim;
            lp += (wet - lp) * alpha;
            wet = lp + (wet - lp) * wet_lift;
            g_state.output[index] = dry + (wet - dry) * g_state.mix;
        }

        g_state.held[channel] = held;
        g_state.phase[channel] = phase;
        g_state.lowpass[channel] = lp;
    }
}

KesshoDynamicsDegradeInstance* dynamics_degrade_instance_create(float sample_rate) {
    auto* instance = new (std::nothrow) KesshoDynamicsDegradeInstance{};
    if (instance == nullptr) return nullptr;
    ScopedDynamicsDegradeState scoped(instance->state);
    dynamics_degrade_init(sample_rate);
    return instance;
}

void dynamics_degrade_instance_destroy(KesshoDynamicsDegradeInstance* instance) {
    delete instance;
}

int dynamics_degrade_instance_reset(KesshoDynamicsDegradeInstance* instance, float sample_rate) {
    if (instance == nullptr) return 0;
    ScopedDynamicsDegradeState scoped(instance->state);
    dynamics_degrade_init(sample_rate);
    return 1;
}

float* dynamics_degrade_instance_get_input_ptr(KesshoDynamicsDegradeInstance* instance) {
    return instance != nullptr ? instance->state.input : nullptr;
}

float* dynamics_degrade_instance_get_output_ptr(KesshoDynamicsDegradeInstance* instance) {
    return instance != nullptr ? instance->state.output : nullptr;
}

void dynamics_degrade_instance_set_params(
    KesshoDynamicsDegradeInstance* instance,
    int enabled,
    float mix,
    float alias,
    float generation,
    float corrosion,
    float wear
) {
    if (instance == nullptr) return;
    ScopedDynamicsDegradeState scoped(instance->state);
    dynamics_degrade_set_params(enabled, mix, alias, generation, corrosion, wear);
}

void dynamics_degrade_instance_process_block(KesshoDynamicsDegradeInstance* instance, int block_size) {
    if (instance == nullptr) return;
    ScopedDynamicsDegradeState scoped(instance->state);
    dynamics_degrade_process_block(block_size);
}

} // extern "C"
