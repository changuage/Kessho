#include <array>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include "SpectralFreezeEngine.h"

using namespace kessho::spectral_freeze;

int main() {
  for (const uint32_t serial : {0u, 1u}) {
  for (const auto mode : {SpectralFreezeMode::Solid, SpectralFreezeMode::Stretch}) {
    SpectralFreezeEngine engine;
    if (!engine.prepare(48000)) throw std::runtime_error("prepare failed");
    SpectralFreezeParams params;
    params.mode = mode;
    params.active = true;
    params.capture_serial = serial;
    params.refresh = 0;
    engine.setParams(params);
    std::array<float, 128> input{}, left{}, right{};
    for (int block = 0; block < 1500; ++block) {
      engine.process(input.data(), input.data(), left.data(), right.data(), 128);
    }
    if (engine.runtimeState() != SpectralFreezeRuntimeState::Recording) {
      throw std::runtime_error("Freeze captured startup silence before the source entered");
    }
    float peak = 0;
    for (int block = 0; block < 1500; ++block) {
      for (int i = 0; i < 128; ++i) input[i] = 0.2f * std::sin(6.283185307179586 * 220 * (block * 128 + i) / 48000);
      engine.process(input.data(), input.data(), left.data(), right.data(), 128);
      for (int i = 0; i < 128; ++i) {
        if (!std::isfinite(left[i]) || !std::isfinite(right[i])) throw std::runtime_error("nonfinite output");
        peak = std::max(peak, std::max(std::fabs(left[i]), std::fabs(right[i])));
      }
    }
    if (engine.runtimeState() != SpectralFreezeRuntimeState::Frozen || peak < 0.01f) {
      throw std::runtime_error("Freeze failed to capture the source after delayed entry");
    }
    params.active = false;
    engine.setParams(params);
    for (int block = 0; block < 150; ++block) engine.process(input.data(), input.data(), left.data(), right.data(), 128);
    if (engine.runtimeState() != SpectralFreezeRuntimeState::Recording) throw std::runtime_error("release failed");
  }
  }
  std::cout << "Spectral Freeze startup capture passed\n";
}
