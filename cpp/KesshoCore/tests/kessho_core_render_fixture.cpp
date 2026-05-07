#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoCore.h"
#include "KesshoCore/KesshoTypes.h"

namespace {

constexpr double kSampleRate = 48000.0;
constexpr int kBlockSize = 128;
constexpr int kTotalFrames = 4096;

void fail(const char* message) {
  std::cerr << message << "\n";
  std::exit(1);
}

} // namespace

int main() {
  KesshoEngine* engine = kessho_create(kSampleRate, kBlockSize);
  if (engine == nullptr) {
    fail("failed to create KesshoCore fixture engine");
  }

  if (kessho_set_render_mode(engine, KESSHO_RENDER_SMOKE_SINE) != 1) {
    kessho_destroy(engine);
    fail("failed to set KesshoCore fixture render mode");
  }

  kessho_set_smoke_tone(engine, 440.0f, 0.2f);
  kessho_start(engine);

  std::vector<float> left(kBlockSize);
  std::vector<float> right(kBlockSize);
  std::vector<float> interleaved(kTotalFrames * 2);

  int written = 0;
  while (written < kTotalFrames) {
    const int frames = std::min(kBlockSize, kTotalFrames - written);
    kessho_render(engine, left.data(), right.data(), frames);
    for (int i = 0; i < frames; ++i) {
      interleaved[(written + i) * 2] = left[i];
      interleaved[(written + i) * 2 + 1] = right[i];
    }
    written += frames;
  }

  kessho_destroy(engine);
  std::cout.write(
      reinterpret_cast<const char*>(interleaved.data()),
      static_cast<std::streamsize>(interleaved.size() * sizeof(float)));
  return std::cout.good() ? 0 : 1;
}
