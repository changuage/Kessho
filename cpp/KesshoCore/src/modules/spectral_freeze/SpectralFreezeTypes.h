#pragma once

#include <cstdint>

namespace kessho::spectral_freeze {

enum class SpectralFreezeMode : uint8_t {
  Solid = 0,
  Slushy = 1,
  Stretch = 2,
  LivingStretch = 3,
};

enum class SpectralScanDirection : uint8_t {
  Forward = 0,
  Reverse = 1,
  PingPong = 2,
};

enum class SpectralFreezeRuntimeState : uint8_t {
  Recording = 0,
  Capturing = 1,
  Frozen = 2,
  Releasing = 3,
};

struct SpectralFreezeParams {
  bool active = false;
  SpectralFreezeMode mode = SpectralFreezeMode::Stretch;
  uint32_t capture_serial = 0;
  float stretch_speed = 0.5f;
  SpectralScanDirection direction = SpectralScanDirection::PingPong;
  float position = 0.0f;
  float refresh = 0.15f;
  float input_sensitivity = 0.5f;
  float diffusion = 0.55f;
  float tone = -0.15f;
  float width = 0.85f;
  float sustain = 1.0f;
  float mix = 1.0f;
  float transition_seconds = 0.1f;
};

}  // namespace kessho::spectral_freeze
