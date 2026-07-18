#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::applyJourneyStateEvent(const KesshoProductEvent& event) {
  journey_running = event.value >= 0.5f;
  journey_phase = clampFloat(event.value2, 0.0f, 1.0f);
  if (event.value3 > 0.0f) {
    journey_rate_bars = clampFloat(event.value3, 0.25f, 128.0f);
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::advanceJourney(uint32_t frames) {
  if (journey_schedule_runtime.running) {
    return;
  }
  if (!journey_running || !transport.running) {
    return;
  }
  const double samples_per_bar = transport.samplesPerBeat(sample_rate) * static_cast<double>(std::max(1u, transport.beats_per_bar));
  const double period_samples = samples_per_bar * static_cast<double>(std::max(0.25f, journey_rate_bars));
  if (period_samples <= 0.0) {
    return;
  }
  journey_phase += static_cast<float>(static_cast<double>(frames) / period_samples);
  journey_phase -= std::floor(journey_phase);
}
