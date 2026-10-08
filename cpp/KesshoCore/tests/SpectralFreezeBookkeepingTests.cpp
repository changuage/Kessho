#include <array>
#include <cmath>
#include <iostream>
#include <stdexcept>

#include "SpectralFreezeEngine.h"

using namespace kessho::spectral_freeze;

static void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

static void check(double sample_rate) {
  SpectralFreezeEngine candidate, baseline;
  require(candidate.prepare(sample_rate) && baseline.prepare(sample_rate), "prepare failed");
  baseline.debugSetMagnitudeBookkeepingCacheEnabled(false);
  SpectralFreezeParams params;
  params.mode = SpectralFreezeMode::Stretch;
  params.stretch_speed = 0;
  params.direction = SpectralScanDirection::PingPong;
  params.position = 0.42f;
  params.refresh = 0;
  params.diffusion = 0.45f;
  params.transition_seconds = 0.01f;
  auto commit = [&] { candidate.setParams(params); baseline.setParams(params); };
  commit();
  std::array<float, 128> in_l{}, in_r{}, candidate_l{}, candidate_r{}, baseline_l{}, baseline_r{};
  int samples = 0;
  float peak = 0;
  auto render = [&](int blocks) {
    for (int block = 0; block < blocks; ++block) {
      for (int i = 0; i < 128; ++i) {
        const double t = (samples + i) / sample_rate;
        in_l[i] = 0.16f * std::sin(6.283185307179586 * 220 * t) + 0.07f * std::sin(6.283185307179586 * 311 * t);
        in_r[i] = 0.13f * std::sin(6.283185307179586 * 173 * t);
      }
      candidate.process(in_l.data(), in_r.data(), candidate_l.data(), candidate_r.data(), 128);
      baseline.process(in_l.data(), in_r.data(), baseline_l.data(), baseline_r.data(), 128);
      for (int i = 0; i < 128; ++i) {
        require(std::isfinite(candidate_l[i]) && std::isfinite(candidate_r[i]), "nonfinite output");
        require(candidate_l[i] == baseline_l[i] && candidate_r[i] == baseline_r[i], "bookkeeping changed PCM");
        peak = std::max(peak, std::max(std::fabs(candidate_l[i]), std::fabs(candidate_r[i])));
      }
      require(candidate.runtimeState() == baseline.runtimeState(), "runtime states differ");
      require(candidate.normalizedScanPosition() == baseline.normalizedScanPosition(), "scan positions differ");
      samples += 128;
    }
  };
  render(400);
  params.active = true;
  params.capture_serial = 1;
  commit();
  render(64);
  require(candidate.runtimeState() == SpectralFreezeRuntimeState::Frozen, "did not freeze");
  const auto captures = candidate.debugMemoryCaptureCount();
  const auto calculations = candidate.debugNormalizationCalculationCount();
  const auto baseline_captures = baseline.debugMemoryCaptureCount();
  render(128);
  require(candidate.debugMemoryCaptureCount() == captures, "stationary memory was recaptured");
  require(candidate.debugNormalizationCalculationCount() == calculations, "stationary normalization was recalculated");
  require(baseline.debugMemoryCaptureCount() > baseline_captures, "reference did not repeat capture");

  params.mode = SpectralFreezeMode::Solid;
  commit(); render(16);
  const auto solid_calculations = candidate.debugNormalizationCalculationCount();
  render(128);
  require(candidate.debugNormalizationCalculationCount() == solid_calculations, "Solid normalization was recalculated");

  params.mode = SpectralFreezeMode::Stretch;
  params.position += 0.02f;
  commit(); render(128); // Position motion must invalidate even when speed remains zero.
  params.stretch_speed = 0.5f;
  commit(); render(128);
  params.stretch_speed = 0;
  commit(); render(64);
  params.mode = SpectralFreezeMode::LivingStretch;
  params.refresh = 0.5f;
  commit(); render(128);
  params.refresh = 0;
  commit(); render(64);
  params.mode = SpectralFreezeMode::Stretch;
  commit(); render(64);
  params.mode = SpectralFreezeMode::Slushy;
  params.refresh = 0; // Existing memory updates still run at zero refresh.
  commit(); render(64);
  params.refresh = 0.5f;
  commit(); render(64);
  params.mode = SpectralFreezeMode::Solid;
  params.sustain = 0.8f;
  params.tone = 0.25f;
  params.width = 0.6f;
  params.diffusion = 0.8f;
  commit(); render(128);
  params.mode = SpectralFreezeMode::Stretch;
  params.stretch_speed = 1;
  params.position = 1;
  commit(); render(1024); // Cross both ping-pong endpoints with blending enabled.
  params.stretch_speed = 0;
  commit(); render(128);
  params.active = false;
  commit(); render(32);
  require(candidate.runtimeState() == SpectralFreezeRuntimeState::Recording, "release failed");
  params.active = true;
  params.capture_serial = 2;
  commit(); render(64);
  candidate.reset(); baseline.reset();
  params.active = false;
  commit(); render(400);
  params.mode = SpectralFreezeMode::Stretch;
  params.active = true;
  params.capture_serial = 3;
  commit(); render(128);
  require(peak > 1e-5f, "silent fixture");
  std::cout << "Spectral bookkeeping exact PCM and transitions passed at " << sample_rate
            << " Hz; settled captures=" << captures << ", normalization calculations=" << calculations << '\n';
}

int main() { check(44100); check(48000); }
