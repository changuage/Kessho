#include "KesshoEngineInternal.h"

#include <cmath>

namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;

} // namespace

namespace kessho::core {

void Engine::render(float* out_l, float* out_r, int frames) {
  sortEvents();

  int running_frames = 0;
  int event_index = 0;
  for (int i = 0; i < frames; ++i) {
    while (
        event_index < event_count_ &&
        event_queue_[event_index].sample_offset == static_cast<uint32_t>(i)) {
      applyEvent(event_queue_[event_index]);
      ++event_index;
    }

    if (transport_.running && render_mode_ == KESSHO_RENDER_SMOKE_SINE) {
      const double phase_increment = kTwoPi * static_cast<double>(smoke_frequency_hz_) / sample_rate_;
      const float sample = static_cast<float>(std::sin(smoke_phase_)) *
                           smoke_amplitude_.next() *
                           master_gain_.next();
      out_l[i] = sample;
      out_r[i] = sample;

      smoke_phase_ += phase_increment;
      if (smoke_phase_ >= kTwoPi) {
        smoke_phase_ -= kTwoPi * std::floor(smoke_phase_ / kTwoPi);
      }
      ++running_frames;
    } else {
      out_l[i] = 0.0f;
      out_r[i] = 0.0f;
      if (transport_.running) {
        master_gain_.next();
        smoke_amplitude_.next();
        ++running_frames;
      }
    }
  }

  compactEventsAfterRender(frames, event_index);
  transport_.advance(running_frames);
}

void Engine::renderSilence(float* out_l, float* out_r, int frames) {
  for (int i = 0; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
}

void Engine::renderSmokeSine(float* out_l, float* out_r, int frames) {
  const double phase_increment = kTwoPi * static_cast<double>(smoke_frequency_hz_) / sample_rate_;
  double phase = smoke_phase_;

  for (int i = 0; i < frames; ++i) {
    const float sample = static_cast<float>(std::sin(phase)) * smoke_amplitude_.next() * master_gain_.next();
    out_l[i] = sample;
    out_r[i] = sample;

    phase += phase_increment;
    if (phase >= kTwoPi) {
      phase -= kTwoPi * std::floor(phase / kTwoPi);
    }
  }

  smoke_phase_ = phase;
}

} // namespace kessho::core
