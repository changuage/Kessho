#pragma once

#include <array>

namespace digitone {

// Calibration is deliberately a small value object.  The transfer curves in
// this file are documented approximations of the public Digitone controls;
// hardware measurements can replace the values without changing Engine's API.
struct Calibration {
    // Relative partial weights used by the HARM approximation (partials 1..8).
    std::array<float, 8> harmonicWeights{{1.0f, 0.46f, 0.24f, 0.14f,
                                          0.09f, 0.06f, 0.04f, 0.03f}};
    float harmonicMix = 0.85f;
    float feedbackScale = 0.50f;
    float fmIndexScale = 0.50f;
    float envelopeTimeScale = 1.0f;
    float filterQScale = 1.0f;

    static Calibration approximation() noexcept;
};

// Approximate HARM wavetable interpolation.  amount is normally [0, 1].
float calibratedHarmonic(float phase, float amount,
                         const Calibration& calibration) noexcept;

// B is a Digitone macro mapped to B1 and B2 with different piecewise curves.
// The knots are the documented parameter values 0, 43, 85 and 127.
float b1LevelMacro(float normalized) noexcept;
float b2LevelMacro(float normalized) noexcept;

// Host-side control approximations. These deliberately live beside the other
// replaceable calibration curves instead of being hidden in JSON/CLI code.
float envelopeSecondsFromNormalized(float normalized) noexcept;
float filterCutoffFromNormalized(float normalized) noexcept;
float filterQFromNormalized(float normalized) noexcept;
float lfoRateFromNormalized(float normalized) noexcept;

} // namespace digitone
