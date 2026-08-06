#include "SpectralFreezeMemory.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace kessho::spectral_freeze {
namespace {

float clampUnit(float value) noexcept {
  return std::clamp(std::isfinite(value) ? value : 0.0f, 0.0f, 1.0f);
}

}  // namespace

bool SpectralFreezeMemory::prepare(double sample_rate, int fft_size) {
  if (!std::isfinite(sample_rate) || sample_rate <= 0.0 || fft_size < 2) {
    return false;
  }

  const int bins = fft_size / 2 + 1;
  try {
    band_for_bin_.assign(static_cast<size_t>(bins), 0u);
    for (auto& channel : held_log_magnitude_) {
      channel.assign(static_cast<size_t>(bins), 0.0f);
    }
    for (auto& channel : previous_live_log_magnitude_) {
      channel.assign(static_cast<size_t>(bins), 0.0f);
    }
  } catch (...) {
    bin_count_ = 0;
    return false;
  }

  bin_count_ = bins;
  const double nyquist = sample_rate * 0.5;
  const double minimum_frequency = std::min(40.0, nyquist);
  const double log_range = nyquist > minimum_frequency
      ? std::log(nyquist / minimum_frequency)
      : 0.0;
  for (int bin = 0; bin < bins; ++bin) {
    const double frequency = static_cast<double>(bin) * sample_rate /
        static_cast<double>(fft_size);
    double normalized = 0.0;
    if (log_range > 0.0 && frequency > minimum_frequency) {
      normalized = std::log(frequency / minimum_frequency) / log_range;
    }
    const int band = std::clamp(
        static_cast<int>(normalized * static_cast<double>(kBandCount)),
        0,
        kBandCount - 1);
    band_for_bin_[static_cast<size_t>(bin)] = static_cast<uint8_t>(band);
  }

  reset();
  return true;
}

void SpectralFreezeMemory::reset() noexcept {
  for (auto& channel : held_log_magnitude_) {
    std::fill(channel.begin(), channel.end(), 0.0f);
  }
  for (auto& channel : previous_live_log_magnitude_) {
    std::fill(channel.begin(), channel.end(), 0.0f);
  }
  band_flux_.fill(0.0f);
  smoothed_band_mask_.fill(0.0f);
  captured_ = false;
}

void SpectralFreezeMemory::capture(
    const float* magnitude_l,
    const float* magnitude_r,
    int bin_count) noexcept {
  if (magnitude_l == nullptr || magnitude_r == nullptr || bin_count != bin_count_) {
    return;
  }
  for (int bin = 0; bin < bin_count_; ++bin) {
    const float left = std::log1p(std::max(0.0f, magnitude_l[bin]));
    const float right = std::log1p(std::max(0.0f, magnitude_r[bin]));
    held_log_magnitude_[0][static_cast<size_t>(bin)] = left;
    held_log_magnitude_[1][static_cast<size_t>(bin)] = right;
    previous_live_log_magnitude_[0][static_cast<size_t>(bin)] = left;
    previous_live_log_magnitude_[1][static_cast<size_t>(bin)] = right;
  }
  band_flux_.fill(0.0f);
  smoothed_band_mask_.fill(0.0f);
  captured_ = true;
}

void SpectralFreezeMemory::updateFromLive(
    const float* magnitude_l,
    const float* magnitude_r,
    int bin_count,
    float refresh,
    float input_sensitivity,
    float sustain) noexcept {
  if (
      !captured_ ||
      magnitude_l == nullptr ||
      magnitude_r == nullptr ||
      bin_count != bin_count_) {
    return;
  }

  band_flux_.fill(0.0f);
  const float sensitivity = clampUnit(input_sensitivity);
  for (int bin = 0; bin < bin_count_; ++bin) {
    const int band = bandForBin(bin);
    const float live_left = std::log1p(std::max(0.0f, magnitude_l[bin]));
    const float live_right = std::log1p(std::max(0.0f, magnitude_r[bin]));
    const float flux_left = std::max(
        0.0f,
        live_left - previous_live_log_magnitude_[0][static_cast<size_t>(bin)]);
    const float flux_right = std::max(
        0.0f,
        live_right - previous_live_log_magnitude_[1][static_cast<size_t>(bin)]);
    band_flux_[static_cast<size_t>(band)] += 0.5f * (flux_left + flux_right);
  }

  const float refresh_amount = clampUnit(refresh);
  for (int band = 0; band < kBandCount; ++band) {
    const float flux_drive = 1.0f - std::exp(
        -band_flux_[static_cast<size_t>(band)] * (0.25f + sensitivity * 3.75f));
    const float target = refresh_amount * (0.2f + 0.8f * flux_drive);
    smoothed_band_mask_[static_cast<size_t>(band)] +=
        (target - smoothed_band_mask_[static_cast<size_t>(band)]) * 0.25f;
  }

  updateChannel(0, magnitude_l, refresh_amount, sensitivity, clampUnit(sustain));
  updateChannel(1, magnitude_r, refresh_amount, sensitivity, clampUnit(sustain));
}

int SpectralFreezeMemory::bandForBin(int bin) const noexcept {
  if (bin_count_ <= 0) {
    return 0;
  }
  const int clamped = std::clamp(bin, 0, bin_count_ - 1);
  return static_cast<int>(band_for_bin_[static_cast<size_t>(clamped)]);
}

float SpectralFreezeMemory::heldLogMagnitude(int channel, int bin) const noexcept {
  if (bin_count_ <= 0 || channel < 0 || channel > 1) {
    return 0.0f;
  }
  const int clamped = std::clamp(bin, 0, bin_count_ - 1);
  return held_log_magnitude_[static_cast<size_t>(channel)][static_cast<size_t>(clamped)];
}

float SpectralFreezeMemory::heldMagnitude(int channel, int bin) const noexcept {
  return std::expm1(heldLogMagnitude(channel, bin));
}

float SpectralFreezeMemory::bandFlux(int band) const noexcept {
  const int clamped = std::clamp(band, 0, kBandCount - 1);
  return band_flux_[static_cast<size_t>(clamped)];
}

void SpectralFreezeMemory::updateChannel(
    int channel,
    const float* magnitude,
    float refresh,
    float input_sensitivity,
    float sustain) noexcept {
  auto& held = held_log_magnitude_[static_cast<size_t>(channel)];
  auto& previous = previous_live_log_magnitude_[static_cast<size_t>(channel)];
  const float release_base = 0.0005f + (1.0f - sustain) * 0.08f;
  for (int bin = 0; bin < bin_count_; ++bin) {
    const float live = std::log1p(std::max(0.0f, magnitude[bin]));
    const float delta = live - held[static_cast<size_t>(bin)];
    const float band_mask = smoothed_band_mask_[static_cast<size_t>(bandForBin(bin))];
    const float attack = std::min(
        0.85f,
        0.02f + band_mask * (0.45f + 0.35f * input_sensitivity));
    const float release = std::min(
        0.25f,
        release_base + band_mask * (0.01f + 0.04f * refresh));
    held[static_cast<size_t>(bin)] += delta * (delta >= 0.0f ? attack : release);
    previous[static_cast<size_t>(bin)] = live;
  }
}

}  // namespace kessho::spectral_freeze
