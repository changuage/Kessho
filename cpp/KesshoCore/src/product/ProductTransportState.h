#pragma once

#include "ProductMath.h"
#include "ProductHarmonyState.h"

namespace kessho::product::internal {

struct ProductTransport {
  uint64_t sample_frame = 0;
  uint64_t beat_origin_frame = 0;
  uint64_t phrase_origin_frame = 0;
  double beat_position_origin = 0.0;
  double bar_position_origin = 0.0;
  double phrase_position_origin = 0.0;
  bool running = false;
  float bpm = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BPM;
  uint32_t beats_per_bar = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR;
  uint32_t bars_per_phrase = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE;
  float phrase_seconds = 0.0f;
  float swing = 0.0f;
  bool transition_pending = false;
  float pending_bpm = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BPM;
  uint32_t pending_beats_per_bar = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR;
  uint32_t pending_bars_per_phrase = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE;
  float pending_phrase_seconds = 0.0f;
  uint64_t pending_apply_frame = 0;
  uint32_t transition_revision = 0;

  void reset();
  double samplesPerBeat(double sample_rate) const;
  double samplesPerPhrase(double sample_rate) const;
  uint64_t nextPhraseBoundaryFrame(double sample_rate) const;
  uint64_t beatBoundaryFrameAt(double sample_rate, uint64_t sample) const;
  uint64_t barBoundaryFrameAt(double sample_rate, uint64_t sample) const;
  uint64_t phraseBoundaryFrameAt(double sample_rate, uint64_t sample) const;
  void stageNextPhraseTransition(
      float next_bpm,
      uint32_t next_beats_per_bar,
      uint32_t next_bars_per_phrase,
      float next_phrase_seconds,
      double sample_rate);
  bool applyImmediateTransition(
      float next_bpm,
      uint32_t next_beats_per_bar,
      uint32_t next_bars_per_phrase,
      float next_phrase_seconds,
      double sample_rate);
  bool applyPendingTransition(double sample_rate);
  double beatPosition(double sample_rate) const;
  double barPositionAt(double sample_rate, uint64_t sample) const;
  double phrasePositionAt(double sample_rate, uint64_t sample) const;
  uint64_t barIndex(double sample_rate) const;
  uint64_t barIndexAt(double sample_rate, uint64_t sample) const;
  uint64_t phraseIndex(double sample_rate) const;
  uint64_t phraseIndexAt(double sample_rate, uint64_t sample) const;
};

} // namespace kessho::product::internal
