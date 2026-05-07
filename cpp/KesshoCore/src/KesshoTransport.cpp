#include "KesshoEngineInternal.h"

#include <algorithm>
#include <cmath>

#include "KesshoCore/KesshoCore.h"

namespace {

uint32_t sanitizeCount(uint32_t value, uint32_t fallback, uint32_t minimum, uint32_t maximum) {
  if (value == 0) {
    return fallback;
  }
  return std::clamp(value, minimum, maximum);
}

uint32_t sanitizeSeed(uint32_t seed) {
  return seed == 0 ? KESSHO_CORE_DEFAULT_SEED : seed;
}

} // namespace

namespace kessho::core {

void Transport::reset() {
  sample_frame = 0;
}

void Transport::start() {
  running = true;
}

void Transport::stop() {
  running = false;
}

void Transport::advance(int frames) {
  if (frames > 0) {
    sample_frame += static_cast<uint64_t>(frames);
  }
}

bool Engine::setTransportSignature(uint32_t beats_per_bar, uint32_t bars_per_phrase) {
  beats_per_bar_ = sanitizeCount(beats_per_bar, 4, 1, 64);
  bars_per_phrase_ = sanitizeCount(bars_per_phrase, 4, 1, 256);
  return true;
}

void Engine::setSeed(uint32_t seed) {
  rng_seed_ = sanitizeSeed(seed);
  rng_state_ = rng_seed_;
}

uint32_t Engine::seed() const {
  return rng_seed_;
}

uint32_t Engine::rngState() const {
  return rng_state_;
}

float Engine::nextRandomFloat() {
  uint32_t state = rng_state_;
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  rng_state_ = sanitizeSeed(state);
  return static_cast<float>(rng_state_ >> 8) * (1.0f / 16777216.0f);
}

void Engine::fillTransportInfo(KesshoTransportInfo& info) const {
  const double seconds = sample_rate_ > 0.0 ? static_cast<double>(transport_.sample_frame) / sample_rate_ : 0.0;
  const double samples_per_beat = sample_rate_ > 0.0 && bpm_ > 0.0f
                                      ? sample_rate_ * 60.0 / static_cast<double>(bpm_)
                                      : 1.0;
  const double beat_position = static_cast<double>(transport_.sample_frame) / samples_per_beat;
  const double beat_floor = std::floor(beat_position);
  const auto beat_index = static_cast<uint64_t>(beat_floor);
  const double beat_phase = beat_position - beat_floor;
  const uint64_t beats_per_bar = std::max<uint32_t>(1, beats_per_bar_);
  const uint64_t bars_per_phrase = std::max<uint32_t>(1, bars_per_phrase_);
  const uint64_t phrase_beats = std::max<uint64_t>(1, beats_per_bar * bars_per_phrase);
  const uint64_t beat_in_bar = beat_index % beats_per_bar;
  const uint64_t beat_in_phrase = beat_index % phrase_beats;

  info.sample_frame = transport_.sample_frame;
  info.sample_rate = sample_rate_;
  info.bpm = bpm_;
  info.beats_per_bar = beats_per_bar_;
  info.bars_per_phrase = bars_per_phrase_;
  info.beat_index = beat_index;
  info.bar_index = beat_index / beats_per_bar;
  info.phrase_index = beat_index / phrase_beats;
  info.beat_phase = beat_phase;
  info.bar_phase = (static_cast<double>(beat_in_bar) + beat_phase) / static_cast<double>(beats_per_bar);
  info.phrase_phase =
      (static_cast<double>(beat_in_phrase) + beat_phase) / static_cast<double>(phrase_beats);
  info.seconds = seconds;
  info.seed = rng_seed_;
  info.rng_state = rng_state_;
}

} // namespace kessho::core

int kessho_set_transport_signature(
    KesshoEngine* engine,
    uint32_t beats_per_bar,
    uint32_t bars_per_phrase) {
  if (engine == nullptr) {
    return 0;
  }

  return engine->impl.setTransportSignature(beats_per_bar, bars_per_phrase) ? 1 : 0;
}

void kessho_set_seed(KesshoEngine* engine, uint32_t seed) {
  if (engine == nullptr) {
    return;
  }

  engine->impl.setSeed(seed);
}

uint32_t kessho_get_seed(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.seed() : 0;
}

float kessho_next_random_float(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.nextRandomFloat() : 0.0f;
}

int kessho_get_transport_info(KesshoEngine* engine, KesshoTransportInfo* info) {
  if (engine == nullptr || info == nullptr) {
    return 0;
  }

  engine->impl.fillTransportInfo(*info);
  return 1;
}
