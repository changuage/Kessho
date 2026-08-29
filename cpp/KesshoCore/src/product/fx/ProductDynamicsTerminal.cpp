#include "../KesshoProductEngineInternal.h"

namespace {

constexpr float kTerminalBusEpsilon = 1.0e-8f;
constexpr uint32_t kEqCoeffHighShelf = 4u;

float safeEqFrequency(float sample_rate, float freq) {
  const float nyquist_guard = std::max(20.0f, sample_rate * 0.45f);
  return clampFloat(freq, 20.0f, std::min(20000.0f, nyquist_guard));
}

void setIdentity(ProductEqBiquadState& state) {
  state.b0 = 1.0f;
  state.b1 = 0.0f;
  state.b2 = 0.0f;
  state.a1 = 0.0f;
  state.a2 = 0.0f;
}

void setCoefficients(ProductEqBiquadState& state, float b0, float b1, float b2, float a0, float a1, float a2) {
  if (!std::isfinite(a0) || std::fabs(a0) <= 1.0e-9f) {
    setIdentity(state);
    return;
  }
  const float inv_a0 = 1.0f / a0;
  state.b0 = b0 * inv_a0;
  state.b1 = b1 * inv_a0;
  state.b2 = b2 * inv_a0;
  state.a1 = a1 * inv_a0;
  state.a2 = a2 * inv_a0;
  if (!std::isfinite(state.b0) || !std::isfinite(state.b1) || !std::isfinite(state.b2) ||
      !std::isfinite(state.a1) || !std::isfinite(state.a2)) {
    setIdentity(state);
  }
}

void configurePeaking(ProductEqBiquadState& state, float sample_rate, float freq, float gain_db, float q) {
  const float safe_freq = safeEqFrequency(sample_rate, freq);
  const float safe_gain = clampFloat(gain_db, -24.0f, 24.0f);
  const float safe_q = clampFloat(q, 0.1f, 18.0f);
  if (state.coeff_type == kDynamicsEqEdgeBell && state.coeff_freq == safe_freq &&
      state.coeff_gain_db == safe_gain && state.coeff_q == safe_q) return;
  state.coeff_type = kDynamicsEqEdgeBell;
  state.coeff_freq = safe_freq;
  state.coeff_gain_db = safe_gain;
  state.coeff_q = safe_q;
  state.coeff_slope = 0.0f;
  if (std::fabs(safe_gain) <= 0.0001f) {
    setIdentity(state);
    return;
  }
  const float a = std::pow(10.0f, safe_gain / 40.0f);
  const float omega = static_cast<float>(kTwoPi) * safe_freq / std::max(1.0f, sample_rate);
  const float sin_w = std::sin(omega);
  const float cos_w = std::cos(omega);
  const float alpha = sin_w / (2.0f * safe_q);
  setCoefficients(state, 1.0f + alpha * a, -2.0f * cos_w, 1.0f - alpha * a,
                  1.0f + alpha / a, -2.0f * cos_w, 1.0f - alpha / a);
}

void configureLowShelf(ProductEqBiquadState& state, float sample_rate, float freq, float gain_db, float slope) {
  const float safe_freq = safeEqFrequency(sample_rate, freq);
  const float safe_gain = clampFloat(gain_db, -24.0f, 24.0f);
  const float safe_slope = clampFloat(slope, 0.25f, 1.0f);
  if (state.coeff_type == kDynamicsEqEdgeShelf && state.coeff_freq == safe_freq &&
      state.coeff_gain_db == safe_gain && state.coeff_slope == safe_slope) return;
  state.coeff_type = kDynamicsEqEdgeShelf;
  state.coeff_freq = safe_freq;
  state.coeff_gain_db = safe_gain;
  state.coeff_q = 0.0f;
  state.coeff_slope = safe_slope;
  if (std::fabs(safe_gain) <= 0.0001f) {
    setIdentity(state);
    return;
  }
  const float a = std::pow(10.0f, safe_gain / 40.0f);
  const float omega = static_cast<float>(kTwoPi) * safe_freq / std::max(1.0f, sample_rate);
  const float sin_w = std::sin(omega);
  const float cos_w = std::cos(omega);
  const float beta = 2.0f * std::sqrt(a) *
      (sin_w * 0.5f * std::sqrt(std::max(0.0f, (a + 1.0f / a) * (1.0f / safe_slope - 1.0f) + 2.0f)));
  setCoefficients(state,
      a * ((a + 1.0f) - (a - 1.0f) * cos_w + beta),
      2.0f * a * ((a - 1.0f) - (a + 1.0f) * cos_w),
      a * ((a + 1.0f) - (a - 1.0f) * cos_w - beta),
      (a + 1.0f) + (a - 1.0f) * cos_w + beta,
      -2.0f * ((a - 1.0f) + (a + 1.0f) * cos_w),
      (a + 1.0f) + (a - 1.0f) * cos_w - beta);
}

void configureHighShelf(ProductEqBiquadState& state, float sample_rate, float freq, float gain_db, float slope) {
  const float safe_freq = safeEqFrequency(sample_rate, freq);
  const float safe_gain = clampFloat(gain_db, -24.0f, 24.0f);
  const float safe_slope = clampFloat(slope, 0.25f, 1.0f);
  if (state.coeff_type == kEqCoeffHighShelf && state.coeff_freq == safe_freq &&
      state.coeff_gain_db == safe_gain && state.coeff_slope == safe_slope) return;
  state.coeff_type = kEqCoeffHighShelf;
  state.coeff_freq = safe_freq;
  state.coeff_gain_db = safe_gain;
  state.coeff_q = 0.0f;
  state.coeff_slope = safe_slope;
  if (std::fabs(safe_gain) <= 0.0001f) {
    setIdentity(state);
    return;
  }
  const float a = std::pow(10.0f, safe_gain / 40.0f);
  const float omega = static_cast<float>(kTwoPi) * safe_freq / std::max(1.0f, sample_rate);
  const float sin_w = std::sin(omega);
  const float cos_w = std::cos(omega);
  const float beta = 2.0f * std::sqrt(a) *
      (sin_w * 0.5f * std::sqrt(std::max(0.0f, (a + 1.0f / a) * (1.0f / safe_slope - 1.0f) + 2.0f)));
  setCoefficients(state,
      a * ((a + 1.0f) + (a - 1.0f) * cos_w + beta),
      -2.0f * a * ((a - 1.0f) + (a + 1.0f) * cos_w),
      a * ((a + 1.0f) + (a - 1.0f) * cos_w - beta),
      (a + 1.0f) - (a - 1.0f) * cos_w + beta,
      2.0f * ((a - 1.0f) - (a + 1.0f) * cos_w),
      (a + 1.0f) - (a - 1.0f) * cos_w - beta);
}

void configurePass(ProductEqBiquadState& state, float sample_rate, float freq, float q, uint32_t type) {
  const float safe_freq = safeEqFrequency(sample_rate, freq);
  const float safe_q = clampFloat(q, 0.1f, 18.0f);
  if (state.coeff_type == type && state.coeff_freq == safe_freq && state.coeff_q == safe_q) return;
  state.coeff_type = type;
  state.coeff_freq = safe_freq;
  state.coeff_gain_db = 0.0f;
  state.coeff_q = safe_q;
  state.coeff_slope = 0.0f;
  const float omega = static_cast<float>(kTwoPi) * safe_freq / std::max(1.0f, sample_rate);
  const float sin_w = std::sin(omega);
  const float cos_w = std::cos(omega);
  const float alpha = sin_w / (2.0f * safe_q);
  const bool high_pass = type == kDynamicsEqEdgeHighPass;
  const float b0 = (1.0f + (high_pass ? cos_w : -cos_w)) * 0.5f;
  const float b1 = high_pass ? -(1.0f + cos_w) : 1.0f - cos_w;
  setCoefficients(state, b0, b1, b0, 1.0f + alpha, -2.0f * cos_w, 1.0f - alpha);
}

float processEqBiquad(ProductEqBiquadState& filter, BiquadState& state, float input) {
  const float output = filter.b0 * input + filter.b1 * state.x1 + filter.b2 * state.x2 -
      filter.a1 * state.y1 - filter.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = output;
  return std::isfinite(output) ? output : 0.0f;
}

float peakForBus(const float* bus_l, const float* bus_r, uint32_t start, uint32_t frames) {
  float peak = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    peak = std::max(peak, std::max(std::fabs(bus_l[frame]), std::fabs(bus_r[frame])));
  }
  return peak;
}

void renderEqBus(ProductTerminalEqState& state, bool enabled, float input_gain_db,
    float output_gain_db, float mix, uint32_t low_type, float low_freq,
    float low_gain_db, float low_q, float low_slope, float mid_freq,
    float mid_gain_db, float mid_q, uint32_t high_type, float high_freq,
    float high_gain_db, float high_q, float high_slope, float sample_rate,
    const float* bus_l, const float* bus_r, float* out_l, float* out_r,
    uint32_t start, uint32_t frames) {
  if (peakForBus(bus_l, bus_r, start, frames) <= kTerminalBusEpsilon) return;
  if (!enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      out_l[frame] += bus_l[frame];
      out_r[frame] += bus_r[frame];
    }
    return;
  }
  if (low_type == kDynamicsEqEdgeBell) configurePeaking(state.low, sample_rate, low_freq, low_gain_db, low_q);
  else if (low_type == kDynamicsEqEdgeHighPass || low_type == kDynamicsEqEdgeLowPass)
    configurePass(state.low, sample_rate, low_freq, low_q, low_type);
  else configureLowShelf(state.low, sample_rate, low_freq, low_gain_db, low_slope);
  configurePeaking(state.mid, sample_rate, mid_freq, mid_gain_db, mid_q);
  if (high_type == kDynamicsEqEdgeBell) configurePeaking(state.high, sample_rate, high_freq, high_gain_db, high_q);
  else if (high_type == kDynamicsEqEdgeHighPass || high_type == kDynamicsEqEdgeLowPass)
    configurePass(state.high, sample_rate, high_freq, high_q, high_type);
  else configureHighShelf(state.high, sample_rate, high_freq, high_gain_db, high_slope);
  const float input_gain = dbToGain(clampFloat(input_gain_db, -24.0f, 24.0f));
  const float output_gain = dbToGain(clampFloat(output_gain_db, -24.0f, 24.0f));
  const float wet = clampFloat(mix, 0.0f, 1.0f);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float dry_left = bus_l[frame] * input_gain;
    const float dry_right = bus_r[frame] * input_gain;
    float left = processEqBiquad(state.low, state.low.left, dry_left);
    float right = processEqBiquad(state.low, state.low.right, dry_right);
    left = processEqBiquad(state.mid, state.mid.left, left);
    right = processEqBiquad(state.mid, state.mid.right, right);
    left = processEqBiquad(state.high, state.high.left, left);
    right = processEqBiquad(state.high, state.high.right, right);
    out_l[frame] += (dry_left + (left - dry_left) * wet) * output_gain;
    out_r[frame] += (dry_right + (right - dry_right) * wet) * output_gain;
  }
}

} // namespace

void KesshoProductEngine::renderDynamicsNode(uint8_t node, float* out_l, float* out_r,
                                             uint32_t start, uint32_t frames) {
  if (frames == 0u) return;
  if (node == kFxNodeEq1) {
    renderEqBus(dynamics_eq1_state, fx.dynamics_eq1_enabled,
        fx.dynamics_eq1_input_gain_db, fx.dynamics_eq1_output_gain_db,
        fx.dynamics_eq1_mix, fx.dynamics_eq1_low_type, fx.dynamics_eq1_low_freq,
        fx.dynamics_eq1_low_gain_db, fx.dynamics_eq1_low_q, fx.dynamics_eq1_low_slope,
        fx.dynamics_eq1_mid_freq, fx.dynamics_eq1_mid_gain_db, fx.dynamics_eq1_mid_q,
        fx.dynamics_eq1_high_type, fx.dynamics_eq1_high_freq, fx.dynamics_eq1_high_gain_db,
        fx.dynamics_eq1_high_q, fx.dynamics_eq1_high_slope, static_cast<float>(sample_rate),
        dynamics_eq1_bus_l, dynamics_eq1_bus_r, out_l, out_r, start, frames);
    return;
  }
  if (node == kFxNodeEq2) {
    renderEqBus(dynamics_eq2_state, fx.dynamics_eq2_enabled,
        fx.dynamics_eq2_input_gain_db, fx.dynamics_eq2_output_gain_db,
        fx.dynamics_eq2_mix, fx.dynamics_eq2_low_type, fx.dynamics_eq2_low_freq,
        fx.dynamics_eq2_low_gain_db, fx.dynamics_eq2_low_q, fx.dynamics_eq2_low_slope,
        fx.dynamics_eq2_mid_freq, fx.dynamics_eq2_mid_gain_db, fx.dynamics_eq2_mid_q,
        fx.dynamics_eq2_high_type, fx.dynamics_eq2_high_freq, fx.dynamics_eq2_high_gain_db,
        fx.dynamics_eq2_high_q, fx.dynamics_eq2_high_slope, static_cast<float>(sample_rate),
        dynamics_eq2_bus_l, dynamics_eq2_bus_r, out_l, out_r, start, frames);
    return;
  }
  if (node != kFxNodeSidechain ||
      peakForBus(dynamics_sidechain_bus_l, dynamics_sidechain_bus_r, start, frames) <= kTerminalBusEpsilon) return;
  const bool active = fx.sidechain_enabled && sidechainBusAmount() > 0.0001f;
  const float wet = clampFloat(fx.sidechain_mix, 0.0f, 1.0f);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float duck_gain = active ? sidechainBusGain(frame) : 1.0f;
    const float gain = 1.0f + (duck_gain - 1.0f) * wet;
    out_l[frame] += dynamics_sidechain_bus_l[frame] * gain;
    out_r[frame] += dynamics_sidechain_bus_r[frame] * gain;
  }
}

void KesshoProductEngine::renderDynamicsBuses(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (frames == 0u) return;
  renderDynamicsNode(kFxNodeEq1, out_l, out_r, start, frames);
  renderDynamicsNode(kFxNodeEq2, out_l, out_r, start, frames);
  renderDynamicsNode(kFxNodeSidechain, out_l, out_r, start, frames);
}
