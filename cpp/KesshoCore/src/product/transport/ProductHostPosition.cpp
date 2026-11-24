#include "../KesshoProductEngineInternal.h"

// Anchors the transport to a plugin host position. Called between renders on
// the render-owning thread. Euclidean lanes keep their musical phase across a
// seek; harmony and arrangement timelines restart.
void KesshoProductEngine::setHostPosition(
    uint64_t sample_frame,
    double beat_position,
    double beats_per_bar,
    double measure_downbeat,
    float bpm,
    bool running) {
  const float previous_bpm = transport.bpm;
  transport.applyImmediateTransition(bpm, beats_per_bar, transport.bars_per_phrase, 0.0f, sample_rate);
  transport.setHostPosition(sample_frame, beat_position, measure_downbeat);
  if (previous_bpm != transport.bpm) retimeTempoSyncedFx(previous_bpm);
  const bool changed_running = running != transport.running;
  if (changed_running) {
    KesshoProductEvent event{};
    event.event_kind = running ? KESSHO_PRODUCT_EVENT_KIND_START : KESSHO_PRODUCT_EVENT_KIND_STOP;
    applyControlEvent(event);
  }
  const auto rebase_lane = [&](LaneState& lane) {
    if (!changed_running) resetSequencerLaneRuntime(lane);
    if (!running || !lane.enabled || lane.sequencer_mode != kSequencerModeEuclid) return;
    const uint32_t step_count = kessho::product::internal::variationStepCount(
        lane.variation_runtime, lane.step_count);
    const uint32_t clock_division = kessho::product::internal::variationClockDivision(
        lane.variation_runtime, lane.clock_division);
    if (step_count == 0u || clock_division == 0u) return;
    const double tempo_multiplier = static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
    const double samples_per_step =
        sequencerSamplesPerStep(transport, sample_rate, clock_division) / tempo_multiplier;
    if (!std::isfinite(samples_per_step) || samples_per_step <= 0.0) return;
    const double phrase_beats = beats_per_bar * static_cast<double>(std::max(1u, transport.bars_per_phrase));
    const double phase_beats = lane.phrase_reset
        ? (transport.phrase_position_origin - std::floor(transport.phrase_position_origin)) * phrase_beats
        : lane.bar_reset
          ? std::clamp(beat_position - measure_downbeat, 0.0, beats_per_bar)
          : std::max(0.0, beat_position);
    const double phase_steps = phase_beats * static_cast<double>(clock_division) * tempo_multiplier / 4.0;
    const double pattern_step = std::fmod(phase_steps, static_cast<double>(step_count));
    const double start = static_cast<double>(sample_frame) - pattern_step * samples_per_step;
    lane.sequencer_start_sample_frame = std::llround(start);
    lane.sequencer_runtime_sample_frame = sample_frame;
    lane.sequencer_runtime_initialized = true;
    lane.sequencer_join_pending = false;
  };
  for (uint32_t index = 0; index < synth_lane_count; ++index) rebase_lane(synth_lanes[index]);
  for (uint32_t index = 0; index < drum_lane_count; ++index) rebase_lane(drum_lanes[index]);
  if (!changed_running || !running) {
    resetHarmonyClock();
    resetArrangementRuntime();
  }
}
