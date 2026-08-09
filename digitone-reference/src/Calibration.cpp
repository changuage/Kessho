#include "digitone/Calibration.h"

#include <algorithm>
#include <cmath>

namespace digitone {
namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;

float clampUnit(float value) noexcept {
    return std::max(0.0f, std::min(1.0f, value));
}

float interpolate(float x, float x0, float y0, float x1, float y1) noexcept {
    if (x <= x0) return y0;
    if (x >= x1) return y1;
    const float width = x1 - x0;
    return y0 + (y1 - y0) * ((x - x0) / width);
}

} // namespace

Calibration Calibration::approximation() noexcept {
    return Calibration{};
}

float calibratedHarmonic(float phase, float amount,
                         const Calibration& calibration) noexcept {
    // The instrument's exact wavetable/partial interpolation is not public.
    // This bounded additive approximation intentionally stays replaceable.
    const float a = clampUnit(std::fabs(amount));
    const float p = phase - std::floor(phase);
    const float sine = std::sin(kTwoPi * p);
    if (a <= 0.000001f) return sine;

    float partials = 0.0f;
    float normalizer = 0.0f;
    for (unsigned harmonic = 0; harmonic < calibration.harmonicWeights.size(); ++harmonic) {
        const float order = static_cast<float>(harmonic + 1u);
        const float weight = calibration.harmonicWeights[harmonic] / order;
        partials += weight * std::sin(kTwoPi * p * order);
        normalizer += std::fabs(weight);
    }
    if (normalizer <= 0.000001f) return sine;
    partials /= normalizer;
    return sine * (1.0f - a * calibration.harmonicMix) +
           partials * (a * calibration.harmonicMix);
}

float b1LevelMacro(float normalized) noexcept {
    const float x = clampUnit(normalized);
    constexpr float p43 = 43.0f / 127.0f;
    constexpr float p85 = 85.0f / 127.0f;
    if (x <= p43) return interpolate(x, 0.0f, 0.0f, p43, 1.0f);
    if (x <= p85) return interpolate(x, p43, 1.0f, p85, 0.0f);
    return interpolate(x, p85, 0.0f, 1.0f, 1.0f);
}

float b2LevelMacro(float normalized) noexcept {
    const float x = clampUnit(normalized);
    constexpr float p43 = 43.0f / 127.0f;
    constexpr float p85 = 85.0f / 127.0f;
    if (x <= p43) return 0.0f;
    if (x <= p85) return interpolate(x, p43, 0.0f, p85, 1.0f);
    return 1.0f;
}

} // namespace digitone
