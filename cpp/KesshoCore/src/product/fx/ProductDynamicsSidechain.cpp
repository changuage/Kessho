#include "../KesshoProductEngineInternal.h"

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

float KesshoProductEngine::sidechainTargetAmount(uint32_t target) const {
  if (!fx.sidechain_enabled || target >= kSidechainTargetCount) {
    return 0.0f;
  }
  const float raw = clampFloat(fx.sidechain_targets[target], 0.0f, 1.0f) *
      clampFloat(fx.sidechain_amount, 0.0f, 1.0f);
  return clampFloat(1.0f - (1.0f - raw) * (1.0f - raw), 0.0f, 1.0f);
}

float KesshoProductEngine::sidechainBusAmount() const {
  if (!fx.sidechain_enabled) {
    return 0.0f;
  }
  const float raw =
      clampFloat(fx.sidechain_amount, 0.0f, 1.0f);
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
    case KESSHO_PRODUCT_SOURCE_SAMPLE1:
    case KESSHO_PRODUCT_SOURCE_SAMPLE2:
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
