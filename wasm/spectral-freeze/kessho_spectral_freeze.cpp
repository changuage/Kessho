#include "kessho_spectral_freeze.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <new>

#include "SpectralFreezeEngine.h"

using kessho::spectral_freeze::SpectralFreezeEngine;
using kessho::spectral_freeze::SpectralFreezeMode;
using kessho::spectral_freeze::SpectralFreezeParams;
using kessho::spectral_freeze::SpectralScanDirection;

struct KesshoSpectralFreezeInstance {
  SpectralFreezeEngine engine;
  SpectralFreezeParams params{};
  std::array<float, KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE * 2> input{};
  std::array<float, KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE * 2> output{};
  std::array<float, KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE> planar_l{};
  std::array<float, KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE> planar_r{};
  uint32_t compatibility_capture_serial = 0;
  bool initialized = false;
};

namespace {

KesshoSpectralFreezeInstance g_default_instance;

float clampUnit(float value) noexcept {
  return std::clamp(std::isfinite(value) ? value : 0.0f, 0.0f, 1.0f);
}

SpectralFreezeMode modeFromInt(int mode) noexcept {
  switch (mode) {
    case KESSHO_SPECTRAL_FREEZE_MODE_SLUSHY:
      return SpectralFreezeMode::Slushy;
    case KESSHO_SPECTRAL_FREEZE_MODE_STRETCH:
      return SpectralFreezeMode::Stretch;
    case KESSHO_SPECTRAL_FREEZE_MODE_LIVING_STRETCH:
      return SpectralFreezeMode::LivingStretch;
    default:
      return SpectralFreezeMode::Solid;
  }
}

SpectralScanDirection directionFromInt(int direction) noexcept {
  switch (direction) {
    case KESSHO_SPECTRAL_FREEZE_DIRECTION_REVERSE:
      return SpectralScanDirection::Reverse;
    case KESSHO_SPECTRAL_FREEZE_DIRECTION_PING_PONG:
      return SpectralScanDirection::PingPong;
    default:
      return SpectralScanDirection::Forward;
  }
}

void commit(KesshoSpectralFreezeInstance* instance) noexcept {
  if (instance != nullptr && instance->initialized) {
    instance->engine.setParams(instance->params);
  }
}

int prepareInstance(KesshoSpectralFreezeInstance* instance, float sample_rate) noexcept {
  if (instance == nullptr) {
    return 0;
  }
  instance->initialized = instance->engine.prepare(
      sample_rate > 1000.0f ? static_cast<double>(sample_rate) : 48000.0);
  if (!instance->initialized) {
    return 0;
  }
  instance->engine.setParams(instance->params);
  return 1;
}

void setFreeze(KesshoSpectralFreezeInstance* instance, int active) noexcept {
  if (instance == nullptr) {
    return;
  }
  const bool next_active = active != 0;
  if (next_active && !instance->params.active) {
    ++instance->compatibility_capture_serial;
    if (instance->compatibility_capture_serial == 0u) {
      ++instance->compatibility_capture_serial;
    }
    instance->params.capture_serial = instance->compatibility_capture_serial;
  }
  instance->params.active = next_active;
  commit(instance);
}

void processPlanarInstance(
    KesshoSpectralFreezeInstance* instance,
    const float* input_l,
    const float* input_r,
    float* output_l,
    float* output_r,
    int frames) noexcept {
  if (
      instance == nullptr || !instance->initialized ||
      input_l == nullptr || input_r == nullptr ||
      output_l == nullptr || output_r == nullptr || frames <= 0) {
    return;
  }

  int rendered = 0;
  while (rendered < frames) {
    const int block = std::min(frames - rendered, KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE);
    instance->engine.process(
        input_l + rendered,
        input_r + rendered,
        output_l + rendered,
        output_r + rendered,
        block);
    rendered += block;
  }
}

void processInstance(KesshoSpectralFreezeInstance* instance, int block_size) noexcept {
  if (instance == nullptr || !instance->initialized || block_size <= 0) {
    return;
  }
  const int frames = std::min(block_size, KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE);
  for (int frame = 0; frame < frames; ++frame) {
    instance->planar_l[static_cast<size_t>(frame)] = instance->input[static_cast<size_t>(frame * 2)];
    instance->planar_r[static_cast<size_t>(frame)] = instance->input[static_cast<size_t>(frame * 2 + 1)];
  }
  processPlanarInstance(
      instance,
      instance->planar_l.data(),
      instance->planar_r.data(),
      instance->planar_l.data(),
      instance->planar_r.data(),
      frames);
  for (int frame = 0; frame < frames; ++frame) {
    instance->output[static_cast<size_t>(frame * 2)] = instance->planar_l[static_cast<size_t>(frame)];
    instance->output[static_cast<size_t>(frame * 2 + 1)] = instance->planar_r[static_cast<size_t>(frame)];
  }
}

}  // namespace

extern "C" {

int spectral_freeze_init(float sample_rate) {
  return prepareInstance(&g_default_instance, sample_rate) ? 0 : -1;
}

void spectral_freeze_reset(void) {
  if (!g_default_instance.initialized) return;
  g_default_instance.engine.reset();
  commit(&g_default_instance);
}

void spectral_freeze_destroy(void) {
  g_default_instance.initialized = false;
}

float* spectral_freeze_get_input_ptr(void) {
  return g_default_instance.input.data();
}

float* spectral_freeze_get_output_ptr(void) {
  return g_default_instance.output.data();
}

void spectral_freeze_process_block(int block_size) {
  processInstance(&g_default_instance, block_size);
}

void spectral_freeze_set_freeze(int active) {
  setFreeze(&g_default_instance, active);
}

void spectral_freeze_set_slushy(int slushy) {
  g_default_instance.params.mode = slushy != 0
      ? SpectralFreezeMode::Slushy
      : SpectralFreezeMode::Solid;
  commit(&g_default_instance);
}

void spectral_freeze_set_speed(float speed) {
  g_default_instance.params.refresh = clampUnit(speed);
  commit(&g_default_instance);
}

void spectral_freeze_set_mix(float mix) {
  g_default_instance.params.mix = clampUnit(mix);
  commit(&g_default_instance);
}

void spectral_freeze_set_decay(float decay) {
  g_default_instance.params.sustain = 1.0f - clampUnit(decay);
  commit(&g_default_instance);
}

void spectral_freeze_set_phase_jitter(float jitter) {
  g_default_instance.params.diffusion = clampUnit(jitter);
  commit(&g_default_instance);
}

void spectral_freeze_set_mode(int mode) {
  g_default_instance.params.mode = modeFromInt(mode);
  commit(&g_default_instance);
}

void spectral_freeze_request_capture(uint32_t capture_serial) {
  g_default_instance.params.capture_serial = capture_serial;
  g_default_instance.params.active = true;
  commit(&g_default_instance);
}

void spectral_freeze_set_stretch_speed(float normalized_speed) {
  g_default_instance.params.stretch_speed = clampUnit(normalized_speed);
  commit(&g_default_instance);
}

void spectral_freeze_set_direction(int direction) {
  g_default_instance.params.direction = directionFromInt(direction);
  commit(&g_default_instance);
}

void spectral_freeze_set_position(float position) {
  g_default_instance.params.position = clampUnit(position);
  commit(&g_default_instance);
}

void spectral_freeze_set_refresh(float refresh) {
  g_default_instance.params.refresh = clampUnit(refresh);
  commit(&g_default_instance);
}

void spectral_freeze_set_input_sensitivity(float sensitivity) {
  g_default_instance.params.input_sensitivity = clampUnit(sensitivity);
  commit(&g_default_instance);
}

void spectral_freeze_set_diffusion(float diffusion) {
  g_default_instance.params.diffusion = clampUnit(diffusion);
  commit(&g_default_instance);
}

void spectral_freeze_set_tone(float tone) {
  g_default_instance.params.tone = std::clamp(std::isfinite(tone) ? tone : -0.15f, -1.0f, 1.0f);
  commit(&g_default_instance);
}

void spectral_freeze_set_width(float width) {
  g_default_instance.params.width = clampUnit(width);
  commit(&g_default_instance);
}

void spectral_freeze_set_sustain(float sustain) {
  g_default_instance.params.sustain = clampUnit(sustain);
  commit(&g_default_instance);
}

KesshoSpectralFreezeInstance* spectral_freeze_instance_create(float sample_rate) {
  auto* instance = new (std::nothrow) KesshoSpectralFreezeInstance{};
  if (instance == nullptr || !prepareInstance(instance, sample_rate)) {
    delete instance;
    return nullptr;
  }
  return instance;
}

void spectral_freeze_instance_destroy(KesshoSpectralFreezeInstance* instance) {
  delete instance;
}

int spectral_freeze_instance_reset(KesshoSpectralFreezeInstance* instance, float sample_rate) {
  return prepareInstance(instance, sample_rate);
}

float* spectral_freeze_instance_get_input_ptr(KesshoSpectralFreezeInstance* instance) {
  return instance != nullptr ? instance->input.data() : nullptr;
}

float* spectral_freeze_instance_get_output_ptr(KesshoSpectralFreezeInstance* instance) {
  return instance != nullptr ? instance->output.data() : nullptr;
}

void spectral_freeze_instance_process_block(KesshoSpectralFreezeInstance* instance, int block_size) {
  processInstance(instance, block_size);
}

void spectral_freeze_instance_process_planar(
    KesshoSpectralFreezeInstance* instance,
    const float* input_l,
    const float* input_r,
    float* output_l,
    float* output_r,
    int frames) {
  processPlanarInstance(instance, input_l, input_r, output_l, output_r, frames);
}

void spectral_freeze_instance_set_params(
    KesshoSpectralFreezeInstance* instance,
    int active,
    int mode,
    uint32_t capture_serial,
    float stretch_speed,
    int direction,
    float position,
    float refresh,
    float input_sensitivity,
    float diffusion,
    float tone,
    float width,
    float sustain,
    float mix,
    float transition_seconds) {
  if (instance == nullptr) return;
  instance->params.active = active != 0;
  instance->params.mode = modeFromInt(mode);
  instance->params.capture_serial = capture_serial;
  instance->params.stretch_speed = stretch_speed;
  instance->params.direction = directionFromInt(direction);
  instance->params.position = position;
  instance->params.refresh = refresh;
  instance->params.input_sensitivity = input_sensitivity;
  instance->params.diffusion = diffusion;
  instance->params.tone = tone;
  instance->params.width = width;
  instance->params.sustain = sustain;
  instance->params.mix = mix;
  instance->params.transition_seconds = transition_seconds;
  commit(instance);
}

void spectral_freeze_instance_set_freeze(KesshoSpectralFreezeInstance* instance, int active) {
  setFreeze(instance, active);
}

void spectral_freeze_instance_set_slushy(KesshoSpectralFreezeInstance* instance, int slushy) {
  if (instance == nullptr) return;
  instance->params.mode = slushy != 0 ? SpectralFreezeMode::Slushy : SpectralFreezeMode::Solid;
  commit(instance);
}

void spectral_freeze_instance_set_speed(KesshoSpectralFreezeInstance* instance, float speed) {
  if (instance == nullptr) return;
  instance->params.refresh = clampUnit(speed);
  commit(instance);
}

void spectral_freeze_instance_set_mix(KesshoSpectralFreezeInstance* instance, float mix) {
  if (instance == nullptr) return;
  instance->params.mix = clampUnit(mix);
  commit(instance);
}

void spectral_freeze_instance_set_decay(KesshoSpectralFreezeInstance* instance, float decay) {
  if (instance == nullptr) return;
  instance->params.sustain = 1.0f - clampUnit(decay);
  commit(instance);
}

void spectral_freeze_instance_set_phase_jitter(KesshoSpectralFreezeInstance* instance, float jitter) {
  if (instance == nullptr) return;
  instance->params.diffusion = clampUnit(jitter);
  commit(instance);
}

void spectral_freeze_instance_set_mode(KesshoSpectralFreezeInstance* instance, int mode) {
  if (instance == nullptr) return;
  instance->params.mode = modeFromInt(mode);
  commit(instance);
}

void spectral_freeze_instance_request_capture(
    KesshoSpectralFreezeInstance* instance,
    uint32_t capture_serial) {
  if (instance == nullptr) return;
  instance->params.capture_serial = capture_serial;
  instance->params.active = true;
  commit(instance);
}

void spectral_freeze_instance_set_stretch_speed(
    KesshoSpectralFreezeInstance* instance,
    float normalized_speed) {
  if (instance == nullptr) return;
  instance->params.stretch_speed = clampUnit(normalized_speed);
  commit(instance);
}

void spectral_freeze_instance_set_direction(KesshoSpectralFreezeInstance* instance, int direction) {
  if (instance == nullptr) return;
  instance->params.direction = directionFromInt(direction);
  commit(instance);
}

void spectral_freeze_instance_set_position(KesshoSpectralFreezeInstance* instance, float position) {
  if (instance == nullptr) return;
  instance->params.position = clampUnit(position);
  commit(instance);
}

void spectral_freeze_instance_set_refresh(KesshoSpectralFreezeInstance* instance, float refresh) {
  if (instance == nullptr) return;
  instance->params.refresh = clampUnit(refresh);
  commit(instance);
}

void spectral_freeze_instance_set_input_sensitivity(
    KesshoSpectralFreezeInstance* instance,
    float sensitivity) {
  if (instance == nullptr) return;
  instance->params.input_sensitivity = clampUnit(sensitivity);
  commit(instance);
}

void spectral_freeze_instance_set_diffusion(KesshoSpectralFreezeInstance* instance, float diffusion) {
  if (instance == nullptr) return;
  instance->params.diffusion = clampUnit(diffusion);
  commit(instance);
}

void spectral_freeze_instance_set_tone(KesshoSpectralFreezeInstance* instance, float tone) {
  if (instance == nullptr) return;
  instance->params.tone = std::clamp(std::isfinite(tone) ? tone : -0.15f, -1.0f, 1.0f);
  commit(instance);
}

void spectral_freeze_instance_set_width(KesshoSpectralFreezeInstance* instance, float width) {
  if (instance == nullptr) return;
  instance->params.width = clampUnit(width);
  commit(instance);
}

void spectral_freeze_instance_set_sustain(KesshoSpectralFreezeInstance* instance, float sustain) {
  if (instance == nullptr) return;
  instance->params.sustain = clampUnit(sustain);
  commit(instance);
}

void spectral_freeze_instance_set_transition_seconds(
    KesshoSpectralFreezeInstance* instance,
    float seconds) {
  if (instance == nullptr) return;
  instance->params.transition_seconds = seconds;
  commit(instance);
}

}  // extern "C"
