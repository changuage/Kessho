#pragma once

#include "ProductMath.h"

namespace kessho::product::internal {

struct ProductTransport {
  uint64_t sample_frame = 0;
  bool running = false;
  float bpm = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BPM;
  uint32_t beats_per_bar = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR;
  uint32_t bars_per_phrase = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE;
  float swing = 0.0f;

  void reset();
  double samplesPerBeat(double sample_rate) const;
  double beatPosition(double sample_rate) const;
  uint64_t barIndex(double sample_rate) const;
  uint64_t barIndexAt(double sample_rate, uint64_t sample) const;
  uint64_t phraseIndex(double sample_rate) const;
  uint64_t phraseIndexAt(double sample_rate, uint64_t sample) const;
};

struct HarmonyState {
  float root_midi = 60.0f;
  uint32_t scale_id = 1;
  float tension = 0.35f;
  uint32_t chord_mode = 0;
  uint32_t voicing_mode = 0;
  uint32_t chord_degree = 0;
  float chord_midi[4] = {60.0f, 64.0f, 67.0f, 72.0f};
};

} // namespace kessho::product::internal
