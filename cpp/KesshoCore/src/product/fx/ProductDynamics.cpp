#include "../KesshoProductEngineInternal.h"

namespace {

constexpr float kTerminalBusEpsilon = 1.0e-8f;

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
  if (state.coeff_type == kDynamicsEqEdgeBell &&
      state.coeff_freq == safe_freq &&
      state.coeff_gain_db == safe_gain &&
      state.coeff_q == safe_q) {
    return;
  }
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
  setCoefficients(
      state,
      1.0f + alpha * a,
      -2.0f * cos_w,
      1.0f - alpha * a,
      1.0f + alpha / a,
      -2.0f * cos_w,
      1.0f - alpha / a);
}

void configureLowShelf(ProductEqBiquadState& state, float sample_rate, float freq, float gain_db, float slope) {
  const float safe_freq = safeEqFrequency(sample_rate, freq);
  const float safe_gain = clampFloat(gain_db, -24.0f, 24.0f);
  const float safe_slope = clampFloat(slope, 0.25f, 4.0f);
  if (state.coeff_type == kDynamicsEqEdgeShelf &&
      state.coeff_freq == safe_freq &&
      state.coeff_gain_db == safe_gain &&
      state.coeff_slope == safe_slope) {
    return;
  }
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
  setCoefficients(
      state,
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
  const float safe_slope = clampFloat(slope, 0.25f, 4.0f);
  if (state.coeff_type == kDynamicsEqEdgeShelf + 2u &&
      state.coeff_freq == safe_freq &&
      state.coeff_gain_db == safe_gain &&
      state.coeff_slope == safe_slope) {
    return;
  }
  state.coeff_type = kDynamicsEqEdgeShelf + 2u;
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
  setCoefficients(
      state,
      a * ((a + 1.0f) + (a - 1.0f) * cos_w + beta),
      -2.0f * a * ((a - 1.0f) + (a + 1.0f) * cos_w),
      a * ((a + 1.0f) + (a - 1.0f) * cos_w - beta),
      (a + 1.0f) - (a - 1.0f) * cos_w + beta,
      2.0f * ((a - 1.0f) - (a + 1.0f) * cos_w),
      (a + 1.0f) - (a - 1.0f) * cos_w - beta);
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

} // namespace

  void KesshoProductEngine::resetSidechainRuntime() {
  for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
    sidechain_envelopes[target] = {};
    sidechain_envelopes[target].current_gain = 1.0f;
    sidechain_envelopes[target].start_gain = 1.0f;
    sidechain_envelopes[target].target_gain = 1.0f;
    for (uint32_t frame = 0; frame < kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES; ++frame) {
      sidechain_gains[target][frame] = 1.0f;
    }
  }
  sidechain_bus_envelope = {};
  sidechain_bus_envelope.current_gain = 1.0f;
  sidechain_bus_envelope.start_gain = 1.0f;
  sidechain_bus_envelope.target_gain = 1.0f;
  for (uint32_t frame = 0; frame < kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES; ++frame) {
    sidechain_bus_gains[frame] = 1.0f;
  }
}

  void KesshoProductEngine::resetSonicParityFxRuntime() {
  control_event_count = 0;
  sequencer_events.clear();
  for (Voice& voice : voices) {
    voice = {};
  }
  pad_voice_cursors[0] = 0;
  pad_voice_cursors[1] = 0;
  clearPadVoiceReleases(0u);
  if (delay_a_module) {
    delay_a_module->reset();
  }
  if (delay_b_module) {
    delay_b_module->reset();
  }
  if (reverb_module) {
    reverb_module->reset();
  }
  if (granular_module) {
    granular_module->reset();
  }
  if (spectral_freeze_module) {
    spectral_freeze_module->reset();
  }
  if (dynamics_drift_module) {
    dynamics_drift_module->reset();
  }
  if (dynamics_degrade_send_module) {
    dynamics_degrade_send_module->reset();
  }
  if (soundscapes_module) {
    soundscapes_module->reset();
    soundscapes_module_params_configured = false;
  }
  granular_output_lpf = {};
  granular_reverb_lpf = {};
  granular_reverb_comp_gain = 1.0f;
  reverb_pre_comp_gain = 1.0f;
  resetReverbHarmonyCoupling();
  resetGranularPhraseRuntime();
  std::fill(delay_a_cross_carry_l, delay_a_cross_carry_l + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  std::fill(delay_a_cross_carry_r, delay_a_cross_carry_r + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  resetSidechainRuntime();
  resetDiffuseRuntime();
  configureFxModules();
  configureSoundscapesModuleFromSource();
}

  float KesshoProductEngine::sidechainTargetAmount(uint32_t target) const {
  if (!fx.sidechain_enabled || target >= kSidechainTargetCount) {
    return 0.0f;
  }
  const float raw = clampFloat(fx.sidechain_targets[target], 0.0f, 1.0f) *
      clampFloat(fx.sidechain_amount, 0.0f, 1.0f) *
      clampFloat(fx.sidechain_mix, 0.0f, 1.0f);
  return clampFloat(1.0f - (1.0f - raw) * (1.0f - raw), 0.0f, 1.0f);
}

  float KesshoProductEngine::sidechainBusAmount() const {
  if (!fx.sidechain_enabled) {
    return 0.0f;
  }
  const float raw =
      clampFloat(fx.sidechain_amount, 0.0f, 1.0f) *
      clampFloat(fx.sidechain_mix, 0.0f, 1.0f);
  return clampFloat(1.0f - (1.0f - raw) * (1.0f - raw), 0.0f, 1.0f);
}

  uint32_t KesshoProductEngine::sidechainTargetForSource(uint32_t source_id) const {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
      return kSidechainPad1;
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return kSidechainPad2;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      return kSidechainLead1;
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return kSidechainLead2;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      return kSidechainPiano;
    default:
      return kSidechainTargetCount;
  }
}

  float KesshoProductEngine::sidechainGain(uint32_t target, uint32_t frame) const {
  if (!fx.sidechain_enabled || target >= kSidechainTargetCount ||
      frame >= kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    return 1.0f;
  }
  return sidechain_gains[target][frame];
}

  float KesshoProductEngine::sidechainBusGain(uint32_t frame) const {
  if (!fx.sidechain_enabled || frame >= kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    return 1.0f;
  }
  return sidechain_bus_gains[frame];
}

  void KesshoProductEngine::triggerSidechainDuck(uint32_t drum_voice, float velocity) {
  if (!fx.sidechain_enabled) {
    return;
  }
  const uint32_t key_id = clampU32(drum_voice + 1u, kSidechainKeySub, kSidechainKeyMembrane);
  const float weight =
      (key_id == fx.sidechain_key_a ? clampFloat(fx.sidechain_key_a_weight, 0.0f, 1.0f) : 0.0f) +
      (key_id == fx.sidechain_key_b ? clampFloat(fx.sidechain_key_b_weight, 0.0f, 1.0f) : 0.0f);
  if (weight <= 0.0001f) {
    return;
  }

  const float curve = 0.65f + clampFloat(fx.sidechain_curve, 0.0f, 1.0f) * 0.7f;
  const float trigger_strength = std::pow(clampFloat(velocity * weight, 0.0f, 1.0f), curve);
  const float detector_db = 20.0f * std::log10(std::max(0.0001f, trigger_strength));
  const float threshold_db = clampFloat(fx.sidechain_threshold, -60.0f, 0.0f);
  const float ratio = clampFloat(fx.sidechain_ratio, 1.0f, 20.0f);
  const float knee = clampFloat(fx.sidechain_knee, 0.0f, 40.0f);
  const float over_db = detector_db - threshold_db;
  const float knee_over_db =
      knee > 0.0f && over_db > -knee && over_db < knee
          ? ((over_db + knee) * (over_db + knee)) / (4.0f * knee)
          : std::max(0.0f, over_db);
  const float gain_reduction_db = knee_over_db * (1.0f - 1.0f / ratio);
  const float duck_factor = std::max(0.005f, std::pow(10.0f, -gain_reduction_db / 20.0f));
  const float makeup = clampFloat(fx.sidechain_makeup, 0.25f, 4.0f);
  const uint32_t attack_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(clampFloat(fx.sidechain_attack_ms, 0.1f, 100.0f) * 0.001f * sample_rate));
  const uint32_t hold_frames = static_cast<uint32_t>(clampFloat(fx.sidechain_hold_ms, 0.0f, 250.0f) * 0.001f * sample_rate);
  const uint32_t release_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(clampFloat(fx.sidechain_release_ms, 20.0f, 1500.0f) * 0.001f * sample_rate));
  const float release_tau_seconds = std::max(0.000001f, clampFloat(fx.sidechain_release_ms, 20.0f, 1500.0f) / 3000.0f);
  const float release_coeff = std::exp(-1.0f / static_cast<float>(release_tau_seconds * sample_rate));

  for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
    const float amount = sidechainTargetAmount(target);
    if (amount <= 0.0001f) {
      continue;
    }
    const float ducked_wet_gain = std::min(amount * 1.2f, amount * duck_factor * makeup);
    const float computed_gain = clampFloat((1.0f - amount) + ducked_wet_gain, 0.0f, 1.0f);
    SidechainEnvelope& envelope = sidechain_envelopes[target];
    envelope.start_gain = envelope.current_gain;
    envelope.target_gain = std::min(envelope.current_gain, computed_gain);
    envelope.attack_elapsed = 0u;
    envelope.attack_frames = attack_frames;
    envelope.hold_remaining = hold_frames;
    envelope.release_elapsed = 0u;
    envelope.release_frames = release_frames;
    envelope.release_coeff = release_coeff;
  }
  const float bus_amount = sidechainBusAmount();
  if (bus_amount > 0.0001f) {
    const float ducked_wet_gain = std::min(bus_amount * 1.2f, bus_amount * duck_factor * makeup);
    const float computed_gain = clampFloat((1.0f - bus_amount) + ducked_wet_gain, 0.0f, 1.0f);
    sidechain_bus_envelope.start_gain = sidechain_bus_envelope.current_gain;
    sidechain_bus_envelope.target_gain = std::min(sidechain_bus_envelope.current_gain, computed_gain);
    sidechain_bus_envelope.attack_elapsed = 0u;
    sidechain_bus_envelope.attack_frames = attack_frames;
    sidechain_bus_envelope.hold_remaining = hold_frames;
    sidechain_bus_envelope.release_elapsed = 0u;
    sidechain_bus_envelope.release_frames = release_frames;
    sidechain_bus_envelope.release_coeff = release_coeff;
  }
}

  float KesshoProductEngine::advanceSidechainEnvelope(SidechainEnvelope& envelope) {
  if (envelope.attack_elapsed < envelope.attack_frames) {
    ++envelope.attack_elapsed;
    const float t = static_cast<float>(envelope.attack_elapsed) / static_cast<float>(std::max(1u, envelope.attack_frames));
    envelope.current_gain = envelope.start_gain + (envelope.target_gain - envelope.start_gain) * t;
    return envelope.current_gain;
  }
  if (envelope.hold_remaining > 0u) {
    --envelope.hold_remaining;
    envelope.current_gain = envelope.target_gain;
    return envelope.current_gain;
  }
  if (envelope.release_coeff > 0.0f && std::fabs(envelope.current_gain - 1.0f) > 0.00001f) {
    ++envelope.release_elapsed;
    envelope.current_gain = 1.0f + (envelope.current_gain - 1.0f) * envelope.release_coeff;
    return envelope.current_gain;
  }
  envelope.current_gain = 1.0f;
  envelope.start_gain = 1.0f;
  envelope.target_gain = 1.0f;
  envelope.release_coeff = 0.0f;
  return envelope.current_gain;
}

  void KesshoProductEngine::renderSidechainGains(uint32_t start, uint32_t frames) {
  if (start + frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    return;
  }
  if (!fx.sidechain_enabled) {
    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      sidechain_envelopes[target].current_gain = 1.0f;
      sidechain_envelopes[target].start_gain = 1.0f;
      sidechain_envelopes[target].target_gain = 1.0f;
      sidechain_envelopes[target].attack_elapsed = 0u;
      sidechain_envelopes[target].attack_frames = 0u;
      sidechain_envelopes[target].hold_remaining = 0u;
      sidechain_envelopes[target].release_elapsed = 0u;
      sidechain_envelopes[target].release_frames = 0u;
      sidechain_envelopes[target].release_coeff = 0.0f;
      if (graph_taps_enabled) {
        for (uint32_t i = 0; i < frames; ++i) {
          sidechain_gains[target][start + i] = 1.0f;
        }
      }
    }
    sidechain_bus_envelope.current_gain = 1.0f;
    sidechain_bus_envelope.start_gain = 1.0f;
    sidechain_bus_envelope.target_gain = 1.0f;
    sidechain_bus_envelope.attack_elapsed = 0u;
    sidechain_bus_envelope.attack_frames = 0u;
    sidechain_bus_envelope.hold_remaining = 0u;
    sidechain_bus_envelope.release_elapsed = 0u;
    sidechain_bus_envelope.release_frames = 0u;
    sidechain_bus_envelope.release_coeff = 0.0f;
    for (uint32_t i = 0; i < frames; ++i) {
      sidechain_bus_gains[start + i] = 1.0f;
    }
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      sidechain_gains[target][frame] = advanceSidechainEnvelope(sidechain_envelopes[target]);
    }
    sidechain_bus_gains[frame] = advanceSidechainEnvelope(sidechain_bus_envelope);
  }
}

  uint32_t KesshoProductEngine::normalizedDynamicsBus(float value) const {
  if (!std::isfinite(value)) {
    return kDynamicsBusSkip;
  }
  const int32_t rounded = static_cast<int32_t>(std::lround(value));
  if (rounded <= static_cast<int32_t>(kDynamicsBusSkip)) {
    return kDynamicsBusSkip;
  }
  return clampU32(static_cast<uint32_t>(rounded), kDynamicsBusSkip, kDynamicsBusSidechain);
}

  uint32_t KesshoProductEngine::dynamicsBusForSource(uint32_t source_id) const {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
      return routing.dynamics_routes[kDynamicsRoutePad1];
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return routing.dynamics_routes[kDynamicsRoutePad2];
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      return routing.dynamics_routes[kDynamicsRouteLead1];
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return routing.dynamics_routes[kDynamicsRouteLead2];
    case KESSHO_PRODUCT_SOURCE_PIANO:
      return routing.dynamics_routes[kDynamicsRoutePiano];
    case KESSHO_PRODUCT_SOURCE_DRUM:
      return routing.dynamics_routes[kDynamicsRouteDrum];
    case KESSHO_PRODUCT_SOURCE_SOUNDSCAPE:
      return routing.dynamics_routes[kDynamicsRouteNature];
    default:
      return kDynamicsBusSkip;
  }
}

  uint32_t KesshoProductEngine::dynamicsBusForSoundscapeLayer(uint32_t layer) const {
  switch (layer) {
    case kSoundscapeLayerOcean:
      return routing.dynamics_routes[kDynamicsRouteWaves];
    case kSoundscapeLayerWater:
      return routing.dynamics_routes[kDynamicsRouteWater];
    case kSoundscapeLayerInsects:
      return routing.dynamics_routes[kDynamicsRouteInsects];
    case kSoundscapeLayerNature:
      return routing.dynamics_routes[kDynamicsRouteNature];
    default:
      return dynamicsBusForSource(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
  }
}

  void KesshoProductEngine::routeTerminalSample(
      uint32_t bus,
      float* out_l,
      float* out_r,
      uint32_t frame,
      float left,
      float right) {
  if (std::fabs(left) <= 0.0f && std::fabs(right) <= 0.0f) {
    return;
  }
  switch (bus) {
    case kDynamicsBusEq1:
      dynamics_eq1_bus_l[frame] += left;
      dynamics_eq1_bus_r[frame] += right;
      return;
    case kDynamicsBusEq2:
      dynamics_eq2_bus_l[frame] += left;
      dynamics_eq2_bus_r[frame] += right;
      return;
    case kDynamicsBusSidechain:
      dynamics_sidechain_bus_l[frame] += left;
      dynamics_sidechain_bus_r[frame] += right;
      return;
    case kDynamicsBusSkip:
    default:
      out_l[frame] += left;
      out_r[frame] += right;
      return;
  }
}

void renderEqBus(
    ProductTerminalEqState& state,
    bool enabled,
    float input_gain_db,
    float output_gain_db,
    uint32_t low_type,
    float low_freq,
    float low_gain_db,
    float low_q,
    float low_slope,
    float mid_freq,
    float mid_gain_db,
    float mid_q,
    uint32_t high_type,
    float high_freq,
    float high_gain_db,
    float high_q,
    float high_slope,
    float sample_rate,
    const float* bus_l,
    const float* bus_r,
    float* out_l,
    float* out_r,
    uint32_t start,
    uint32_t frames) {
  if (peakForBus(bus_l, bus_r, start, frames) <= kTerminalBusEpsilon) {
    return;
  }
  if (!enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      out_l[frame] += bus_l[frame];
      out_r[frame] += bus_r[frame];
    }
    return;
  }
  if (low_type == kDynamicsEqEdgeBell) {
    configurePeaking(state.low, sample_rate, low_freq, low_gain_db, low_q);
  } else {
    configureLowShelf(state.low, sample_rate, low_freq, low_gain_db, low_slope);
  }
  configurePeaking(state.mid, sample_rate, mid_freq, mid_gain_db, mid_q);
  if (high_type == kDynamicsEqEdgeBell) {
    configurePeaking(state.high, sample_rate, high_freq, high_gain_db, high_q);
  } else {
    configureHighShelf(state.high, sample_rate, high_freq, high_gain_db, high_slope);
  }
  const float input_gain = dbToGain(clampFloat(input_gain_db, -24.0f, 24.0f));
  const float output_gain = dbToGain(clampFloat(output_gain_db, -24.0f, 24.0f));
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    float left = bus_l[frame] * input_gain;
    float right = bus_r[frame] * input_gain;
    left = processEqBiquad(state.low, state.low.left, left);
    right = processEqBiquad(state.low, state.low.right, right);
    left = processEqBiquad(state.mid, state.mid.left, left);
    right = processEqBiquad(state.mid, state.mid.right, right);
    left = processEqBiquad(state.high, state.high.left, left);
    right = processEqBiquad(state.high, state.high.right, right);
    out_l[frame] += left * output_gain;
    out_r[frame] += right * output_gain;
  }
}

  void KesshoProductEngine::renderDynamicsBuses(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (frames == 0u) {
    return;
  }
  renderEqBus(
      dynamics_eq1_state,
      fx.dynamics_eq1_enabled,
      fx.dynamics_eq1_input_gain_db,
      fx.dynamics_eq1_output_gain_db,
      fx.dynamics_eq1_low_type,
      fx.dynamics_eq1_low_freq,
      fx.dynamics_eq1_low_gain_db,
      fx.dynamics_eq1_low_q,
      fx.dynamics_eq1_low_slope,
      fx.dynamics_eq1_mid_freq,
      fx.dynamics_eq1_mid_gain_db,
      fx.dynamics_eq1_mid_q,
      fx.dynamics_eq1_high_type,
      fx.dynamics_eq1_high_freq,
      fx.dynamics_eq1_high_gain_db,
      fx.dynamics_eq1_high_q,
      fx.dynamics_eq1_high_slope,
      static_cast<float>(sample_rate),
      dynamics_eq1_bus_l,
      dynamics_eq1_bus_r,
      out_l,
      out_r,
      start,
      frames);
  renderEqBus(
      dynamics_eq2_state,
      fx.dynamics_eq2_enabled,
      fx.dynamics_eq2_input_gain_db,
      fx.dynamics_eq2_output_gain_db,
      fx.dynamics_eq2_low_type,
      fx.dynamics_eq2_low_freq,
      fx.dynamics_eq2_low_gain_db,
      fx.dynamics_eq2_low_q,
      fx.dynamics_eq2_low_slope,
      fx.dynamics_eq2_mid_freq,
      fx.dynamics_eq2_mid_gain_db,
      fx.dynamics_eq2_mid_q,
      fx.dynamics_eq2_high_type,
      fx.dynamics_eq2_high_freq,
      fx.dynamics_eq2_high_gain_db,
      fx.dynamics_eq2_high_q,
      fx.dynamics_eq2_high_slope,
      static_cast<float>(sample_rate),
      dynamics_eq2_bus_l,
      dynamics_eq2_bus_r,
      out_l,
      out_r,
      start,
      frames);

  if (peakForBus(dynamics_sidechain_bus_l, dynamics_sidechain_bus_r, start, frames) <= kTerminalBusEpsilon) {
    return;
  }
  const bool sidechain_active = fx.sidechain_enabled && sidechainBusAmount() > 0.0001f;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float gain = sidechain_active ? sidechainBusGain(frame) : 1.0f;
    out_l[frame] += dynamics_sidechain_bus_l[frame] * gain;
    out_r[frame] += dynamics_sidechain_bus_r[frame] * gain;
  }
}

  void KesshoProductEngine::mixFxBuffer(const float* in_l, const float* in_r, float* out_l, float* out_r,
      uint32_t start, uint32_t frames, float gain, uint32_t sidechain_target) {
  if (gain <= 0.0f) {
    return;
  }
  if (!fx.sidechain_enabled && !graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float left = in_l[i] * gain;
      const float right = in_r[i] * gain;
      out_l[frame] += left;
      out_r[frame] += right;
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
    }
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float input_left = in_l[i] * gain;
    const float input_right = in_r[i] * gain;
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float left = input_left * duck_gain;
    const float right = input_right * duck_gain;
    if (graph_taps_enabled && sidechain_target < kSidechainTargetCount) {
      graph_sidechain_input_l[sidechain_target][frame] += input_left;
      graph_sidechain_input_r[sidechain_target][frame] += input_right;
      graph_sidechain_output_l[sidechain_target][frame] += left;
      graph_sidechain_output_r[sidechain_target][frame] += right;
    }
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
    stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
  }
}

  void KesshoProductEngine::renderDynamics(float* out_l, float* out_r, uint32_t frames) {
  const bool dynamics_active =
      fx.dynamics_drive > 0.0001f ||
      (fx.dynamics_saturation_enabled && fx.dynamics_saturation_drive > 0.0001f) ||
      (
          fx.dynamics_enabled &&
          fx.dynamics_end_comp_enabled &&
          fx.dynamics_end_comp_mix > 0.0001f);
  if (dynamics_drift_module == nullptr || frames == 0u || !dynamics_active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  dynamics_drift_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] = module_l[i];
    out_r[i] = module_r[i];
  }
}

void KesshoProductEngine::renderDegradeSend(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  const bool degrade_output_active =
      routing.degrade_return_level > 0.0001f ||
      routing.degrade_to_reverb > 0.0001f;
  const bool degrade_fx_active =
      fx.dynamics_enabled &&
      degrade_output_active &&
      ((fx.dynamics_drift_enabled && fx.dynamics_drift_mix > 0.0001f) ||
       (fx.dynamics_erosion_enabled && fx.dynamics_erosion_mix > 0.0001f));
  if (dynamics_degrade_send_module == nullptr || frames == 0u || !degrade_fx_active) {
    return;
  }
  float input_peak = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    input_peak = std::max(input_peak, std::max(std::abs(degrade_bus_l[frame]), std::abs(degrade_bus_r[frame])));
  }
  if (input_peak <= 1.0e-8f) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  dynamics_degrade_send_module->processPlanarStereo(
      degrade_bus_l + start,
      degrade_bus_r + start,
      module_l,
      module_r,
      static_cast<int>(frames));
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float left = module_l[i] * routing.degrade_return_level;
    const float right = module_r[i] * routing.degrade_return_level;
    if (routing.degrade_to_reverb > 0.0001f) {
      reverb_bus_l[frame] += module_l[i] * routing.degrade_to_reverb;
      reverb_bus_r[frame] += module_r[i] * routing.degrade_to_reverb;
    }
    routeTerminalSample(routing.dynamics_routes[kDynamicsRouteDegrade], out_l, out_r, frame, left, right);
    stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
    stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
  }
}
