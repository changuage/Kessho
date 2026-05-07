#include "KesshoEngineInternal.h"

#include <new>

#include "KesshoCore/KesshoCore.h"

namespace kessho::core {

Engine::Engine(double sample_rate, int max_block_size)
    : sample_rate_(sample_rate), max_block_size_(max_block_size) {
  master_gain_.reset(1.0f);
  smoke_amplitude_.reset(0.125f);
}

bool Engine::isValid() const {
  return sample_rate_ > 0.0 && max_block_size_ > 0;
}

void Engine::reset() {
  transport_.reset();
  smoke_phase_ = 0.0;
}

void Engine::start() {
  transport_.start();
}

void Engine::stop() {
  transport_.stop();
}

bool Engine::isRunning() const {
  return transport_.running;
}

uint64_t Engine::sampleFrame() const {
  return transport_.sample_frame;
}

double Engine::sampleRate() const {
  return sample_rate_;
}

int Engine::maxBlockSize() const {
  return max_block_size_;
}

int Engine::renderMode() const {
  return render_mode_;
}

} // namespace kessho::core

int kessho_get_abi_version(void) {
  return KESSHO_CORE_ABI_VERSION;
}

KesshoEngine* kessho_create(double sample_rate, int max_block_size) {
  if (sample_rate <= 0.0 || max_block_size <= 0) {
    return nullptr;
  }

  KesshoEngine* engine = new (std::nothrow) KesshoEngine{
      kessho::core::Engine(sample_rate, max_block_size),
  };

  if (engine == nullptr || !engine->impl.isValid()) {
    delete engine;
    return nullptr;
  }

  return engine;
}

void kessho_destroy(KesshoEngine* engine) {
  delete engine;
}

void kessho_reset(KesshoEngine* engine) {
  if (engine == nullptr) {
    return;
  }

  engine->impl.reset();
}

void kessho_start(KesshoEngine* engine) {
  if (engine == nullptr) {
    return;
  }

  engine->impl.start();
}

void kessho_stop(KesshoEngine* engine) {
  if (engine == nullptr) {
    return;
  }

  engine->impl.stop();
}

int kessho_is_running(KesshoEngine* engine) {
  return engine != nullptr && engine->impl.isRunning() ? 1 : 0;
}

void kessho_render(KesshoEngine* engine, float* out_l, float* out_r, int frames) {
  if (engine == nullptr || out_l == nullptr || out_r == nullptr || frames <= 0) {
    return;
  }

  engine->impl.render(out_l, out_r, frames);
}

uint64_t kessho_get_sample_frame(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.sampleFrame() : 0;
}

double kessho_get_sample_rate(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.sampleRate() : 0.0;
}

int kessho_get_max_block_size(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.maxBlockSize() : 0;
}

int kessho_get_stats(KesshoEngine* engine, KesshoCoreStats* stats) {
  if (engine == nullptr || stats == nullptr) {
    return 0;
  }

  stats->sample_frame = engine->impl.sampleFrame();
  stats->sample_rate = engine->impl.sampleRate();
  stats->max_block_size = engine->impl.maxBlockSize();
  stats->running = engine->impl.isRunning() ? 1 : 0;
  stats->render_mode = engine->impl.renderMode();
  stats->event_queue_depth = engine->impl.eventQueueDepth();
  stats->midi_events_processed = engine->impl.midiEventsProcessed();
  return 1;
}
