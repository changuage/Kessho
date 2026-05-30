#include "../KesshoProductEngineInternal.h"

#include <cmath>

namespace {

constexpr float kGranularControlSmoothSeconds = 0.05f;

float smoothedGranularControl(float current, float target, double sample_rate) {
  if (sample_rate <= 0.0 || !std::isfinite(target)) {
    return std::isfinite(target) ? target : 0.0f;
  }
  const float coeff = std::exp(-1.0f / std::max(1.0f, kGranularControlSmoothSeconds * static_cast<float>(sample_rate)));
  const float next = target + (current - target) * coeff;
  return std::abs(next - target) < 0.000001f ? target : next;
}

} // namespace

void KesshoProductEngine::resetGranularPhraseRuntime() {
  granular_last_phrase_index = 0u;
  granular_phrase_runtime_initialized = false;
}

float KesshoProductEngine::granularSendGainForFrame(uint32_t source_id, float target, uint64_t absolute_frame) {
  if (source_id < 1u || source_id > kSourceCount) return clampFloat(target, 0.0f, 2.0f);
  SourceState& source = sources[source_id - 1u];
  if (source.granular_send_gain_frame == absolute_frame) return source.granular_send_gain;
  source.granular_send_gain = smoothedGranularControl(
      source.granular_send_gain,
      clampFloat(target, 0.0f, 2.0f),
      sample_rate);
  source.granular_send_gain_frame = absolute_frame;
  return source.granular_send_gain;
}

void KesshoProductEngine::advanceGranularReturnGains(uint64_t absolute_frame) {
  if (granular_return_gain_frame == absolute_frame) return;
  granular_mix_gain = smoothedGranularControl(granular_mix_gain, clampFloat(fx.granular_mix, 0.0f, 4.0f), sample_rate);
  granular_reverb_send_gain = smoothedGranularControl(
      granular_reverb_send_gain,
      clampFloat(routing.granular_to_reverb, 0.0f, 4.0f),
      sample_rate);
  granular_delay_a_send_gain = smoothedGranularControl(
      granular_delay_a_send_gain,
      clampFloat(routing.granular_to_delay_a, 0.0f, 1.0f),
      sample_rate);
  granular_delay_b_send_gain = smoothedGranularControl(
      granular_delay_b_send_gain,
      clampFloat(routing.granular_to_delay_b, 0.0f, 1.0f),
      sample_rate);
  granular_return_gain_frame = absolute_frame;
}

void KesshoProductEngine::advanceGranularPhraseReseed() {
  if (granular_module == nullptr || !transport.running || sample_rate <= 0.0) return;
  const uint64_t phrase = transport.phraseIndex(sample_rate);
  if (!granular_phrase_runtime_initialized) {
    granular_phrase_runtime_initialized = true;
    granular_last_phrase_index = phrase;
    return;
  }
  if (phrase == granular_last_phrase_index) return;
  granular_last_phrase_index = phrase;
  granular_module->setRandomSeed(rng_state);
}
