#pragma once

#include <array>
#include <cstdint>

#include "SpectralFreezeCaptureBuffer.h"
#include "SpectralFreezeMemory.h"
#include "SpectralFreezeScanHead.h"
#include "SpectralFreezeStft.h"
#include "SpectralFreezeTypes.h"

namespace kessho::spectral_freeze {

class SpectralFreezeEngine {
public:
  bool prepare(double sample_rate);
  void reset() noexcept;

  void process(
      const float* input_l,
      const float* input_r,
      float* output_l,
      float* output_r,
      int frames) noexcept;

  void setParams(const SpectralFreezeParams& params) noexcept;
  void requestCapture(uint32_t capture_serial) noexcept;
  void requestRelease() noexcept;

  [[nodiscard]] SpectralFreezeRuntimeState runtimeState() const noexcept { return runtime_state_; }
  [[nodiscard]] int validCaptureSamples() const noexcept { return capture_.validSamples(); }
  [[nodiscard]] bool captureLocked() const noexcept { return capture_.isLocked(); }
  [[nodiscard]] float normalizedScanPosition() const noexcept { return scan_head_.normalizedPosition(); }
  [[nodiscard]] uint32_t lastCaptureSerial() const noexcept { return last_capture_serial_; }

private:
  static constexpr int kOutputRingSize = SpectralFreezeStft::kFftSize * 2;

  void processHop() noexcept;
  void analyzeLiveFrames() noexcept;
  void analyzeCaptureFrames(double center_position) noexcept;
  void analyzeCaptureFramesInto(
      double center_position,
      std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2>& magnitude,
      std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2>& phase) noexcept;
  void blendEndpointMagnitudes(double center_position, float scan_ratio) noexcept;
  void extractLiveMidSideFrames() noexcept;
  void extractCaptureMidSideFrames(double center_position) noexcept;
  void beginCaptureAtHop() noexcept;
  void updatePhaseAdvance(
      int channel,
      const float* phase,
      float analysis_delta_samples,
      bool reset_phase) noexcept;
  void renderFrozenHop() noexcept;
  void synthesizeChannel(
      int channel,
      float magnitude_attack,
      float magnitude_release) noexcept;
  void addSynthesizedFrame(int channel) noexcept;
  void finishReleaseIfSilent() noexcept;
  void updatePositionTarget() noexcept;

  [[nodiscard]] float deterministicSignedRandom(int channel, int bin) const noexcept;
  [[nodiscard]] float toneGainForBin(int bin) const noexcept;
  [[nodiscard]] float decayGainPerHop() const noexcept;
  [[nodiscard]] bool hasMinimumCapture() const noexcept;

  double sample_rate_ = 48000.0;
  int live_write_position_ = 0;
  int hop_counter_ = 0;
  int output_read_position_ = 0;
  uint64_t spectral_frame_index_ = 0;
  uint32_t last_capture_serial_ = 0;
  bool pending_capture_ = false;
  bool source_phase_valid_ = false;
  double active_crossfade_ = 0.0;
  double crossfade_step_ = 1.0;
  float held_decay_gain_ = 1.0f;
  float normalization_gain_ = 1.0f;
  float smoothed_position_ = 0.0f;
  double previous_scan_position_ = 0.0;

  SpectralFreezeParams params_{};
  SpectralFreezeRuntimeState runtime_state_ = SpectralFreezeRuntimeState::Recording;
  SpectralFreezeCaptureBuffer capture_;
  SpectralFreezeScanHead scan_head_;
  SpectralFreezeStft stft_;
  SpectralFreezeMemory memory_;

  std::array<float, SpectralFreezeStft::kFftSize> live_ring_l_{};
  std::array<float, SpectralFreezeStft::kFftSize> live_ring_r_{};
  std::array<float, SpectralFreezeStft::kFftSize> analysis_frame_mid_{};
  std::array<float, SpectralFreezeStft::kFftSize> analysis_frame_side_{};
  std::array<float, SpectralFreezeStft::kFftSize> synthesized_frame_{};

  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> live_magnitude_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> live_phase_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> source_magnitude_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> source_phase_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> endpoint_magnitude_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> previous_source_phase_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> phase_advance_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> synthesis_phase_{};
  std::array<std::array<float, SpectralFreezeStft::kBinCount>, 2> smoothed_log_magnitude_{};
  std::array<float, SpectralFreezeStft::kBinCount> output_magnitude_{};
  std::array<float, SpectralFreezeStft::kBinCount> output_phase_{};
  std::array<std::array<float, kOutputRingSize>, 2> output_ring_{};
};

}  // namespace kessho::spectral_freeze
