#include <algorithm>
#include <iostream>
#include <stdexcept>

// Standalone translation unit: exercise private DSP helpers without a production test API.
#include "../../../wasm/granular-fx/kessho_granular.cpp"

static void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

static void check_curves(const GranularState* s) {
    float up_error = 0.0f, down_error = 0.0f, sine_error = 0.0f;
    float previous_up = 1.0f, previous_down = 1.0f;
    for (int i = 0; i <= 200000; ++i) {
        const float t = (float)i / 200000.0f;
        const float up = grain_decay_curve(s, KESSHO_GRAIN_SHAPE_SAW_UP, t);
        const float down = grain_decay_curve(s, KESSHO_GRAIN_SHAPE_SAW_DOWN, t);
        require(std::isfinite(up) && std::isfinite(down), "nonfinite decay curve");
        require(up <= previous_up && down <= previous_down, "nonmonotonic decay curve");
        previous_up = up;
        previous_down = down;
        up_error = std::max(up_error, std::fabs(up - powf(1.0f - t, 0.65f)));
        down_error = std::max(down_error, std::fabs(down - powf(1.0f - t, 1.4f)));
        const float cycles = t * 2.0f;
        sine_error = std::max(sine_error, std::fabs(tide_sine(s, cycles) - sinf(cycles * 6.2831853f)));
        require(grain_decay_curve(s, KESSHO_GRAIN_SHAPE_TRIANGLE, t) == 1.0f - t,
                "Triangle changed");
    }
    require(up_error <= 5e-5f && down_error <= 1e-5f && sine_error <= 1e-5f,
            "curve approximation exceeds its error bound");
    for (int i = 0; i <= kCurveTableSegments; ++i) {
        const float x = (float)i / (float)kCurveTableSegments;
        for (float t : {1.0f - x, std::nextafter(1.0f - x, 0.0f), std::nextafter(1.0f - x, 1.0f)}) {
            require(std::fabs(grain_decay_curve(s, KESSHO_GRAIN_SHAPE_SAW_UP, t) - powf(1.0f - t, 0.65f)) <= 5e-5f,
                    "Saw Up table boundary mismatch");
        }
    }
    for (int shape : {KESSHO_GRAIN_SHAPE_SAW_UP, KESSHO_GRAIN_SHAPE_SAW_DOWN}) {
        require(grain_decay_curve(s, shape, 0) == 1 && grain_decay_curve(s, shape, 1) == 0,
                "decay endpoint changed");
    }
    require(tide_sine(s, 0) == tide_sine(s, 1), "Tide wrap endpoint changed");
    std::cout << "Curve max errors: Saw Up=" << up_error << ", Saw Down=" << down_error
              << ", Tide=" << sine_error << '\n';
}

static void check_waiting_bloom(int shape, int quality, int count) {
    auto* candidate = granular_instance_create(48000.0f, 1.0f);
    auto* reference = granular_instance_create(48000.0f, 1.0f);
    require(candidate && reference, "Bloom initialization failed");
    for (auto* instance : {candidate, reference}) {
        auto* s = instance->state;
        s->initialized = 0; // Isolate existing grains from the scheduler.
        s->grain_shape = shape;
        s->quality = quality;
        s->voice[0].gain = 0.5f;
        s->voice[0].blur = 0.3f;
        for (int i = 0; i < s->buffer_size; ++i) {
            s->buffer_l[i] = 0.2f * sinf((float)i * 0.013f);
            s->buffer_r[i] = 0.15f * cosf((float)i * 0.017f);
        }
        for (int i = 0; i < count; ++i) {
            auto* grain = &s->grain_pool[0][i];
            *grain = Grain{};
            grain->active = 1;
            grain->position = (float)(s->buffer_size - 2 - i);
            grain->playback_rate = i % 2 ? -1.4f : 1.7f;
            grain->playback_rate_step = i % 2 ? -0.0001f : 0.0001f;
            grain->start_sample = -2 - i * 3;
            grain->length = 400;
            grain->attack_smp = 20;
            grain->decay_smp = 380;
            grain->pan_l = 0.7f;
            grain->pan_r = 0.6f;
            grain->gain = 0.4f;
            grain->tide_depth = 0.5f;
            grain->tide_phase = 0.3f;
            // The reference always takes the original read/envelope path.
            grain->is_ghost = instance == candidate;
            if (i == count - 1) grain->env_z1 = 0.01f; // Must not skip a decaying envelope.
            require(activate_grain(s, 0, grain, i), "Bloom activation failed");
        }
    }
    float peak = 0;
    for (int sample = 0; sample < 650; ++sample) {
        float left[2] = {}, right[2] = {};
        process_granular_voice(candidate->state, 0, &left[0], &right[0], 1);
        process_granular_voice(reference->state, 0, &left[1], &right[1], 1);
        require(left[0] == left[1] && right[0] == right[1], "Bloom output changed");
        peak = std::max(peak, std::fabs(left[0]));
        require(candidate->state->total_active_grains == reference->state->total_active_grains,
                "Bloom overlap count changed");
        for (int i = 0; i < count; ++i) {
            const auto& a = candidate->state->grain_pool[0][i];
            const auto& b = reference->state->grain_pool[0][i];
            require(a.start_sample == b.start_sample && a.position == b.position &&
                    a.playback_rate == b.playback_rate && a.env_z1 == b.env_z1 &&
                    a.active == b.active && a.active_list_pos == b.active_list_pos,
                    "Bloom state advancement changed");
        }
    }
    require(peak > 1e-5f && candidate->state->total_active_grains == 0,
            "Bloom test did not exercise audible output and removal");
    granular_instance_destroy(candidate);
    granular_instance_destroy(reference);
}

int main() {
    auto* instance = granular_instance_create(48000.0f, 1.0f);
    require(instance != nullptr, "granular initialization failed");
    check_curves(instance->state);
    granular_instance_destroy(instance);
    for (int shape = 0; shape < 4; ++shape)
        for (int quality = 0; quality < 3; ++quality)
            for (int count : {2, 3, KESSHO_MAX_GRAINS}) check_waiting_bloom(shape, quality, count);
    std::cout << "Waiting Bloom exact output, onset, reverse/glide, overlap and removal passed\n";
}
