#include "KesshoEngineInternal.h"

#include <algorithm>
#include <cmath>

#include "KesshoCore/KesshoCore.h"

namespace kessho::core {

bool Engine::setRenderMode(int render_mode) {
  if (render_mode != KESSHO_RENDER_SILENCE && render_mode != KESSHO_RENDER_SMOKE_SINE) {
    return false;
  }

  render_mode_ = render_mode;
  return true;
}

void Engine::setSmokeTone(float frequency_hz, float amplitude) {
  if (std::isfinite(frequency_hz)) {
    smoke_frequency_hz_ = std::clamp(frequency_hz, 0.0f, static_cast<float>(sample_rate_ * 0.45));
  }

  if (std::isfinite(amplitude)) {
    smoke_amplitude_.setImmediate(std::clamp(amplitude, 0.0f, 1.0f));
  }
}

bool Engine::applySnapshot(const KesshoCoreSnapshotV1& snapshot) {
  if (snapshot.version != KESSHO_CORE_SNAPSHOT_VERSION ||
      snapshot.schema_hash != KESSHO_CORE_SNAPSHOT_SCHEMA_HASH ||
      !std::isfinite(snapshot.bpm) ||
      !std::isfinite(snapshot.master_gain) ||
      !std::isfinite(snapshot.smoke_frequency_hz) ||
      !std::isfinite(snapshot.smoke_amplitude)) {
    return false;
  }

  if (!setRenderMode(snapshot.render_mode)) {
    return false;
  }

  bpm_ = std::clamp(snapshot.bpm, 1.0f, 400.0f);
  setTransportSignature(snapshot.beats_per_bar, snapshot.bars_per_phrase);
  setSeed(snapshot.seed);
  master_gain_.setImmediate(std::clamp(snapshot.master_gain, 0.0f, 1.0f));
  setSmokeTone(snapshot.smoke_frequency_hz, snapshot.smoke_amplitude);
  return true;
}

} // namespace kessho::core

int kessho_set_render_mode(KesshoEngine* engine, int render_mode) {
  if (engine == nullptr) {
    return 0;
  }

  return engine->impl.setRenderMode(render_mode) ? 1 : 0;
}

void kessho_set_smoke_tone(KesshoEngine* engine, float frequency_hz, float amplitude) {
  if (engine == nullptr) {
    return;
  }

  engine->impl.setSmokeTone(frequency_hz, amplitude);
}

int kessho_apply_snapshot_v1(KesshoEngine* engine, const KesshoCoreSnapshotV1* snapshot) {
  if (engine == nullptr || snapshot == nullptr) {
    return 0;
  }

  return engine->impl.applySnapshot(*snapshot) ? 1 : 0;
}
