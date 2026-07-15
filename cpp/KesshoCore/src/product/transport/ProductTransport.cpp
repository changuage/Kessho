#include "../KesshoProductEngineInternal.h"

void ProductTransport::reset() {
  sample_frame = 0;
  beat_origin_frame = 0;
  phrase_origin_frame = 0;
  beat_position_origin = 0.0;
  bar_position_origin = 0.0;
  phrase_position_origin = 0.0;
  transition_pending = false;
  pending_apply_frame = 0;
  transition_revision = 0;
}

double ProductTransport::samplesPerBeat(double sample_rate) const {
  return sample_rate * 60.0 / std::max(1.0f, bpm);
}

double ProductTransport::samplesPerPhrase(double sample_rate) const {
  const double explicit_seconds = static_cast<double>(phrase_seconds);
  if (std::isfinite(explicit_seconds) && explicit_seconds > 0.0) {
    return std::max(1.0, explicit_seconds * sample_rate);
  }
  return samplesPerBeat(sample_rate) *
      static_cast<double>(std::max(1u, beats_per_bar)) *
      static_cast<double>(std::max(1u, bars_per_phrase));
}

uint64_t ProductTransport::nextPhraseBoundaryFrame(double sample_rate) const {
  const double period = samplesPerPhrase(sample_rate);
  if (!std::isfinite(period) || period <= 0.0) return sample_frame;
  const double position = phrasePositionAt(sample_rate, sample_frame);
  const double remaining = (std::floor(position) + 1.0) - position;
  const double target = static_cast<double>(sample_frame) + remaining * period;
  if (!std::isfinite(target) || target <= static_cast<double>(sample_frame)) return sample_frame + 1u;
  return static_cast<uint64_t>(std::llround(target));
}

namespace {

uint64_t boundaryFrameFromPosition(uint64_t sample, double position, double period) {
  if (!std::isfinite(position) || !std::isfinite(period) || period <= 0.0) return sample;
  const double fraction = position - std::floor(position);
  if (fraction <= 1e-9 || 1.0 - fraction <= 1e-9) return sample;
  const double target = static_cast<double>(sample) + (1.0 - fraction) * period;
  if (!std::isfinite(target) || target <= static_cast<double>(sample)) return sample;
  return static_cast<uint64_t>(std::llround(target));
}

} // namespace

uint64_t ProductTransport::beatBoundaryFrameAt(double sample_rate, uint64_t sample) const {
  const uint64_t elapsed = sample >= beat_origin_frame ? sample - beat_origin_frame : 0u;
  const double position = beat_position_origin + static_cast<double>(elapsed) / samplesPerBeat(sample_rate);
  return boundaryFrameFromPosition(sample, position, samplesPerBeat(sample_rate));
}

uint64_t ProductTransport::barBoundaryFrameAt(double sample_rate, uint64_t sample) const {
  const double period = samplesPerBeat(sample_rate) * static_cast<double>(std::max(1u, beats_per_bar));
  return boundaryFrameFromPosition(sample, barPositionAt(sample_rate, sample), period);
}

uint64_t ProductTransport::phraseBoundaryFrameAt(double sample_rate, uint64_t sample) const {
  return boundaryFrameFromPosition(sample, phrasePositionAt(sample_rate, sample), samplesPerPhrase(sample_rate));
}

void ProductTransport::stageNextPhraseTransition(
    float next_bpm,
    uint32_t next_beats_per_bar,
    uint32_t next_bars_per_phrase,
    float next_phrase_seconds,
    double sample_rate) {
  pending_bpm = clampFloat(next_bpm, 1.0f, 400.0f);
  pending_beats_per_bar = clampU32(next_beats_per_bar, 1u, 32u);
  pending_bars_per_phrase = clampU32(next_bars_per_phrase, 1u, 256u);
  pending_phrase_seconds = std::isfinite(next_phrase_seconds) && next_phrase_seconds > 0.0f
      ? clampFloat(next_phrase_seconds, 0.001f, 4096.0f)
      : static_cast<float>(
          (60.0 / static_cast<double>(pending_bpm)) *
          static_cast<double>(pending_beats_per_bar) *
          static_cast<double>(pending_bars_per_phrase));
  const bool matches_active =
      std::fabs(pending_bpm - bpm) <= 0.0001f &&
      pending_beats_per_bar == beats_per_bar &&
      pending_bars_per_phrase == bars_per_phrase &&
      std::fabs(pending_phrase_seconds - phrase_seconds) <= 0.0001f;
  if (matches_active) {
    transition_pending = false;
    pending_apply_frame = 0u;
    return;
  }
  if (!transition_pending) pending_apply_frame = nextPhraseBoundaryFrame(sample_rate);
  transition_pending = true;
}

bool ProductTransport::applyPendingTransition(double sample_rate) {
  if (!transition_pending || sample_frame < pending_apply_frame) return false;
  return applyImmediateTransition(
      pending_bpm,
      pending_beats_per_bar,
      pending_bars_per_phrase,
      pending_phrase_seconds,
      sample_rate);
}

bool ProductTransport::applyImmediateTransition(
    float next_bpm,
    uint32_t next_beats_per_bar,
    uint32_t next_bars_per_phrase,
    float next_phrase_seconds,
    double sample_rate) {
  const float resolved_bpm = clampFloat(next_bpm, 1.0f, 400.0f);
  const uint32_t resolved_beats_per_bar = clampU32(next_beats_per_bar, 1u, 32u);
  const uint32_t resolved_bars_per_phrase = clampU32(next_bars_per_phrase, 1u, 256u);
  const float resolved_phrase_seconds = std::isfinite(next_phrase_seconds) && next_phrase_seconds > 0.0f
      ? clampFloat(next_phrase_seconds, 0.001f, 4096.0f)
      : static_cast<float>(
          (60.0 / static_cast<double>(resolved_bpm)) *
          static_cast<double>(resolved_beats_per_bar) *
          static_cast<double>(resolved_bars_per_phrase));
  const bool changed =
      std::fabs(resolved_bpm - bpm) > 0.0001f ||
      resolved_beats_per_bar != beats_per_bar ||
      resolved_bars_per_phrase != bars_per_phrase ||
      std::fabs(resolved_phrase_seconds - phrase_seconds) > 0.0001f;
  transition_pending = false;
  pending_apply_frame = 0u;
  if (!changed) return false;

  const double next_beat_position_origin = beatPosition(sample_rate);
  const double next_bar_position_origin = barPositionAt(sample_rate, sample_frame);
  const double next_phrase_position_origin = phrasePositionAt(sample_rate, sample_frame);
  bpm = resolved_bpm;
  beats_per_bar = resolved_beats_per_bar;
  bars_per_phrase = resolved_bars_per_phrase;
  phrase_seconds = resolved_phrase_seconds;
  beat_origin_frame = sample_frame;
  phrase_origin_frame = sample_frame;
  beat_position_origin = next_beat_position_origin;
  bar_position_origin = next_bar_position_origin;
  phrase_position_origin = next_phrase_position_origin;
  transition_revision += 1u;
  return true;
}
