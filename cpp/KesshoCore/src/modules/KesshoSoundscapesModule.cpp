#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>

#include "kessho_soundscapes.h"

namespace kessho::core {
namespace {

constexpr int kSoundscapesBlockSize = 128;
constexpr int kParamWaterActive = 0;
constexpr int kParamWaterPreset = kParamWaterActive + 1;
constexpr int kParamWaterParams = kParamWaterPreset + 1;
constexpr int kParamWaterLayerDetail = kParamWaterParams + 14;
constexpr int kParamWaterLayerMix = kParamWaterLayerDetail + 7;
constexpr int kParamWaterLayerDensity = kParamWaterLayerMix + 6;
constexpr int kParamWaterDensityLoop = kParamWaterLayerDensity + 6;
constexpr int kParamWaterSurf = kParamWaterDensityLoop + 7;
constexpr int kParamWaterChannels = kParamWaterSurf + 16;
constexpr int kParamWaterSeed = kParamWaterChannels + 2;
constexpr int kParamInsectsActive = kParamWaterSeed + 1;
constexpr int kParamInsectsEngine = kParamInsectsActive + 1;
constexpr int kParamInsectsParams = kParamInsectsEngine + 1;
constexpr int kParamInsectsSeed = kParamInsectsParams + 14;
constexpr int kParamInsects2Active = kParamInsectsSeed + 1;
constexpr int kParamInsects2Engine = kParamInsects2Active + 1;
constexpr int kParamInsects2Params = kParamInsects2Engine + 1;
constexpr int kParamInsects2Seed = kParamInsects2Params + 14;
constexpr int kParamOutputSelect = kParamInsects2Seed + 1;
constexpr int kParamCount = kParamOutputSelect + 1;
constexpr float kSeedNoChange = -1.0f;

int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};

  params[kParamWaterActive] = 0.0f;
  params[kParamWaterPreset] = 0.0f;

  params[kParamWaterParams + 0] = 0.5f;
  params[kParamWaterParams + 1] = 0.5f;
  params[kParamWaterParams + 2] = 0.3f;
  params[kParamWaterParams + 3] = 0.3f;
  params[kParamWaterParams + 4] = 2500.0f;
  params[kParamWaterParams + 5] = 2500.0f;
  params[kParamWaterParams + 6] = 2500.0f;
  params[kParamWaterParams + 7] = 2500.0f;
  params[kParamWaterParams + 8] = 0.5f;
  params[kParamWaterParams + 9] = 0.5f;
  params[kParamWaterParams + 10] = 0.5f;
  params[kParamWaterParams + 11] = 0.5f;
  params[kParamWaterParams + 12] = 0.5f;
  params[kParamWaterParams + 13] = 0.5f;

  params[kParamWaterLayerDetail + 0] = 1.0f;
  params[kParamWaterLayerDetail + 1] = 12000.0f;
  params[kParamWaterLayerDetail + 2] = 1.0f;
  params[kParamWaterLayerDetail + 3] = 1.0f;
  params[kParamWaterLayerDetail + 4] = 16000.0f;
  params[kParamWaterLayerDetail + 5] = 1.0f;
  params[kParamWaterLayerDetail + 6] = 1500.0f;

  params[kParamWaterLayerMix + 0] = 0.7f;
  params[kParamWaterLayerMix + 1] = 0.5f;
  params[kParamWaterLayerMix + 2] = 0.3f;
  params[kParamWaterLayerMix + 3] = 0.0f;
  params[kParamWaterLayerMix + 4] = 0.0f;
  params[kParamWaterLayerMix + 5] = 0.0f;

  params[kParamWaterLayerDensity + 0] = 0.5f;
  params[kParamWaterLayerDensity + 1] = 0.5f;
  params[kParamWaterLayerDensity + 2] = 0.5f;
  params[kParamWaterLayerDensity + 3] = 0.5f;
  params[kParamWaterLayerDensity + 4] = 0.5f;
  params[kParamWaterLayerDensity + 5] = 0.5f;

  params[kParamWaterDensityLoop + 0] = 0.22f;
  params[kParamWaterDensityLoop + 1] = 0.36f;
  params[kParamWaterDensityLoop + 2] = 0.48f;
  params[kParamWaterDensityLoop + 3] = 0.64f;
  params[kParamWaterDensityLoop + 4] = 1050.0f;
  params[kParamWaterDensityLoop + 5] = 1.0f;
  params[kParamWaterDensityLoop + 6] = 0.34f;

  params[kParamWaterSurf + 0] = 4.0f;
  params[kParamWaterSurf + 1] = 12.0f;
  params[kParamWaterSurf + 2] = 5.0f;
  params[kParamWaterSurf + 3] = 14.0f;
  params[kParamWaterSurf + 4] = 0.2f;
  params[kParamWaterSurf + 5] = 0.5f;
  params[kParamWaterSurf + 6] = 0.7f;
  params[kParamWaterSurf + 7] = 0.7f;
  params[kParamWaterSurf + 8] = 0.3f;
  params[kParamWaterSurf + 9] = 0.7f;
  params[kParamWaterSurf + 10] = 300.0f;
  params[kParamWaterSurf + 11] = 300.0f;
  params[kParamWaterSurf + 12] = 4000.0f;
  params[kParamWaterSurf + 13] = 4000.0f;
  params[kParamWaterSurf + 14] = 0.4f;
  params[kParamWaterSurf + 15] = 0.4f;

  params[kParamWaterChannels + 0] = 0.0f;
  params[kParamWaterChannels + 1] = 0.5f;
  params[kParamWaterSeed] = kSeedNoChange;

  params[kParamInsectsActive] = 0.0f;
  params[kParamInsectsEngine] = 0.0f;
  params[kParamInsects2Active] = 0.0f;
  params[kParamInsects2Engine] = 1.0f;

  for (int base : {kParamInsectsParams, kParamInsects2Params}) {
    params[base + 0] = 0.5f;
    params[base + 1] = 0.5f;
    params[base + 2] = 0.5f;
    params[base + 3] = 0.5f;
    params[base + 4] = 0.3f;
    params[base + 5] = 0.3f;
    params[base + 6] = 0.5f;
    params[base + 7] = 0.5f;
    params[base + 8] = 0.3f;
    params[base + 9] = 0.3f;
    params[base + 10] = 0.3f;
    params[base + 11] = 0.3f;
    params[base + 12] = 0.5f;
    params[base + 13] = 0.5f;
  }

  params[kParamInsectsSeed] = kSeedNoChange;
  params[kParamInsects2Seed] = kSeedNoChange;
  params[kParamOutputSelect] = 0.0f;
  return params;
}

class SoundscapesModule final : public IKesshoModule {
public:
  ~SoundscapesModule() override {
    water_instance_destroy(water_);
    insects_instance_destroy(insects_);
    insects2_instance_destroy(insects2_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kSoundscapesBlockSize));

    water_instance_destroy(water_);
    insects_instance_destroy(insects_);
    insects2_instance_destroy(insects2_);
    water_ = water_instance_create(sample_rate_);
    insects_ = insects_instance_create(sample_rate_);
    insects2_ = insects2_instance_create(sample_rate_);
    if (water_ == nullptr || insects_ == nullptr || insects2_ == nullptr) {
      return false;
    }

    water_started_ = false;
    insects_started_ = false;
    insects2_started_ = false;
    committed_params_valid_ = false;
    return true;
  }

  void reset() override {
    if (water_ != nullptr) {
      water_instance_reset(water_, sample_rate_);
    }
    if (insects_ != nullptr) {
      insects_instance_reset(insects_, sample_rate_);
    }
    if (insects2_ != nullptr) {
      insects2_instance_reset(insects2_, sample_rate_);
    }
    water_started_ = false;
    insects_started_ = false;
    insects2_started_ = false;
    committed_params_valid_ = false;
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    (void)input_interleaved;
    if (output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kSoundscapesBlockSize, std::min(max_block_size_, frames - rendered));
      processBlock(block);
      copySelectedOutput(output_interleaved + rendered * 2, block);
      rendered += block;
    }
  }

  void processPlanarStereo(
      const float* input_l,
      const float* input_r,
      float* output_l,
      float* output_r,
      int frames) override {
    (void)input_l;
    (void)input_r;
    if (output_l == nullptr || output_r == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kSoundscapesBlockSize, std::min(max_block_size_, frames - rendered));
      processBlock(block);
      copySelectedOutput(output_l + rendered, output_r + rendered, block);
      rendered += block;
    }
  }

  int paramCount() const override {
    return kParamCount;
  }

  float* params() override {
    return params_.data();
  }

  void commitParams() override {
    if (water_ == nullptr || insects_ == nullptr || insects2_ == nullptr) {
      return;
    }

    const bool water_preset_changed = paramChanged(kParamWaterPreset, 1);
    const bool water_params_changed = water_preset_changed || paramChanged(kParamWaterParams, 14);
    const bool water_detail_changed = water_preset_changed || paramChanged(kParamWaterLayerDetail, 7);
    const bool water_mix_changed = water_preset_changed || paramChanged(kParamWaterLayerMix, 6);
    const bool water_density_changed = water_preset_changed || paramChanged(kParamWaterLayerDensity, 6);
    const bool water_density_loop_changed = water_preset_changed || paramChanged(kParamWaterDensityLoop, 7);
    const bool water_surf_changed = water_preset_changed || paramChanged(kParamWaterSurf, 16);
    const bool water_channels_changed = water_preset_changed || paramChanged(kParamWaterChannels, 2);

    if (paramChanged(kParamWaterSeed, 1) && shouldSetSeed(kParamWaterSeed)) {
      water_instance_set_seed(water_, roundedInt(params_[kParamWaterSeed]));
    }
    if (water_preset_changed) {
      water_instance_set_preset(water_, std::clamp(roundedInt(params_[kParamWaterPreset]), 0, 7));
    }
    if (water_params_changed) {
      water_instance_set_params(
          water_,
          params_[kParamWaterParams + 0], params_[kParamWaterParams + 1],
          params_[kParamWaterParams + 2], params_[kParamWaterParams + 3],
          params_[kParamWaterParams + 4], params_[kParamWaterParams + 5],
          params_[kParamWaterParams + 6], params_[kParamWaterParams + 7],
          params_[kParamWaterParams + 8], params_[kParamWaterParams + 9],
          params_[kParamWaterParams + 10], params_[kParamWaterParams + 11],
          params_[kParamWaterParams + 12], params_[kParamWaterParams + 13]);
    }
    if (water_detail_changed) {
      water_instance_set_layer_detail_params(
          water_,
          params_[kParamWaterLayerDetail + 0],
          params_[kParamWaterLayerDetail + 1],
          params_[kParamWaterLayerDetail + 2],
          params_[kParamWaterLayerDetail + 3],
          params_[kParamWaterLayerDetail + 4],
          params_[kParamWaterLayerDetail + 5],
          params_[kParamWaterLayerDetail + 6]);
    }
    if (water_mix_changed) {
      water_instance_set_layer_mix(
          water_,
          params_[kParamWaterLayerMix + 0],
          params_[kParamWaterLayerMix + 1],
          params_[kParamWaterLayerMix + 2],
          params_[kParamWaterLayerMix + 3],
          params_[kParamWaterLayerMix + 4],
          params_[kParamWaterLayerMix + 5]);
    }
    if (water_density_changed) {
      water_instance_set_layer_density(
          water_,
          params_[kParamWaterLayerDensity + 0],
          params_[kParamWaterLayerDensity + 1],
          params_[kParamWaterLayerDensity + 2],
          params_[kParamWaterLayerDensity + 3],
          params_[kParamWaterLayerDensity + 4],
          params_[kParamWaterLayerDensity + 5]);
    }
    if (water_surf_changed) {
      water_instance_set_surf_params(
          water_,
          params_[kParamWaterSurf + 0], params_[kParamWaterSurf + 1],
          params_[kParamWaterSurf + 2], params_[kParamWaterSurf + 3],
          params_[kParamWaterSurf + 4], params_[kParamWaterSurf + 5],
          params_[kParamWaterSurf + 6], params_[kParamWaterSurf + 7],
          params_[kParamWaterSurf + 8], params_[kParamWaterSurf + 9],
          params_[kParamWaterSurf + 10], params_[kParamWaterSurf + 11],
          params_[kParamWaterSurf + 12], params_[kParamWaterSurf + 13],
          params_[kParamWaterSurf + 14], params_[kParamWaterSurf + 15]);
    }
    if (water_channels_changed) {
      water_instance_set_channels_params(
          water_,
          params_[kParamWaterChannels + 0],
          params_[kParamWaterChannels + 1]);
    }
    if (water_density_loop_changed) {
      water_instance_set_density_loop_params(
          water_,
          params_[kParamWaterDensityLoop + 0],
          params_[kParamWaterDensityLoop + 1],
          params_[kParamWaterDensityLoop + 2],
          params_[kParamWaterDensityLoop + 3],
          params_[kParamWaterDensityLoop + 4],
          params_[kParamWaterDensityLoop + 5],
          params_[kParamWaterDensityLoop + 6]);
    }
    syncWaterActive();

    if (paramChanged(kParamInsectsSeed, 1) && shouldSetSeed(kParamInsectsSeed)) {
      insects_instance_set_seed(insects_, roundedInt(params_[kParamInsectsSeed]));
    }
    if (paramChanged(kParamInsectsEngine, 1)) {
      insects_instance_set_engine(insects_, std::clamp(roundedInt(params_[kParamInsectsEngine]), 0, 6));
    }
    if (paramChanged(kParamInsectsParams, 14)) {
      commitInsectsParams(insects_, kParamInsectsParams);
    }
    syncInsectsActive();

    if (paramChanged(kParamInsects2Seed, 1) && shouldSetSeed(kParamInsects2Seed)) {
      insects2_instance_set_seed(insects2_, roundedInt(params_[kParamInsects2Seed]));
    }
    if (paramChanged(kParamInsects2Engine, 1)) {
      insects2_instance_set_engine(insects2_, std::clamp(roundedInt(params_[kParamInsects2Engine]), 0, 6));
    }
    if (paramChanged(kParamInsects2Params, 14)) {
      insects2_instance_set_params(
          insects2_,
          params_[kParamInsects2Params + 0], params_[kParamInsects2Params + 1],
          params_[kParamInsects2Params + 2], params_[kParamInsects2Params + 3],
          params_[kParamInsects2Params + 4], params_[kParamInsects2Params + 5],
          params_[kParamInsects2Params + 6], params_[kParamInsects2Params + 7],
          params_[kParamInsects2Params + 8], params_[kParamInsects2Params + 9],
          params_[kParamInsects2Params + 10], params_[kParamInsects2Params + 11],
          params_[kParamInsects2Params + 12], params_[kParamInsects2Params + 13]);
    }
    syncInsects2Active();

    committed_params_ = params_;
    committed_params_valid_ = true;
  }

  void allNotesOff() override {
    if (water_ != nullptr) {
      water_instance_stop(water_);
    }
    if (insects_ != nullptr) {
      insects_instance_stop(insects_);
    }
    if (insects2_ != nullptr) {
      insects2_instance_stop(insects2_);
    }
    water_started_ = false;
    insects_started_ = false;
    insects2_started_ = false;
  }

  int activeVoiceCount() override {
    int count = 0;
    if (water_ != nullptr) {
      count += water_instance_get_active_voices(water_);
    }
    if (insects_ != nullptr) {
      count += insects_instance_get_active_voices(insects_);
    }
    if (insects2_ != nullptr) {
      count += insects2_instance_get_active_voices(insects2_);
    }
    return count;
  }

  int outputTapCount() const override {
    return 3;
  }

  void processPlanarStereoTaps(
      const float* input_l,
      const float* input_r,
      float* const* output_l,
      float* const* output_r,
      uint32_t output_bus_count,
      int frames) override {
    (void)input_l;
    (void)input_r;
    if (output_bus_count == 0u || output_l == nullptr || output_r == nullptr || frames <= 0) {
      return;
    }
    for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
      if (output_l[bus] == nullptr || output_r[bus] == nullptr) {
        return;
      }
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kSoundscapesBlockSize, std::min(max_block_size_, frames - rendered));
      processBlock(block);
      copyTapOutputs(output_l, output_r, output_bus_count, rendered, block);
      rendered += block;
    }
  }

private:
  bool paramChanged(int base, int count) const {
    if (!committed_params_valid_) {
      return true;
    }
    for (int index = 0; index < count; ++index) {
      if (params_[base + index] != committed_params_[base + index]) {
        return true;
      }
    }
    return false;
  }

  void commitInsectsParams(KesshoInsectsInstance* instance, int params_base) {
    insects_instance_set_params(
        instance,
        params_[params_base + 0], params_[params_base + 1],
        params_[params_base + 2], params_[params_base + 3],
        params_[params_base + 4], params_[params_base + 5],
        params_[params_base + 6], params_[params_base + 7],
        params_[params_base + 8], params_[params_base + 9],
        params_[params_base + 10], params_[params_base + 11],
        params_[params_base + 12], params_[params_base + 13]);
  }

  int outputSelect() const {
    return std::clamp(roundedInt(params_[kParamOutputSelect]), 0, 3);
  }

  bool shouldSetSeed(int seed_index) const {
    return std::isfinite(params_[seed_index]) && params_[seed_index] >= 0.0f;
  }

  void syncWaterActive() {
    const bool should_start = params_[kParamWaterActive] > 0.5f;
    if (should_start && !water_started_) {
      water_instance_start(water_);
      water_started_ = true;
    } else if (!should_start && water_started_) {
      water_instance_stop(water_);
      water_started_ = false;
    }
  }

  void syncInsectsActive() {
    const bool should_start = params_[kParamInsectsActive] > 0.5f;
    if (should_start && !insects_started_) {
      insects_instance_start(insects_);
      insects_started_ = true;
    } else if (!should_start && insects_started_) {
      insects_instance_stop(insects_);
      insects_started_ = false;
    }
  }

  void syncInsects2Active() {
    const bool should_start = params_[kParamInsects2Active] > 0.5f;
    if (should_start && !insects2_started_) {
      insects2_instance_start(insects2_);
      insects2_started_ = true;
    } else if (!should_start && insects2_started_) {
      insects2_instance_stop(insects2_);
      insects2_started_ = false;
    }
  }

  void processBlock(int block) {
    water_instance_process_block(water_, block);
    insects_instance_process_block(insects_, block);
    insects2_instance_process_block(insects2_, block);
  }

  const float* waterOutput() const {
    return water_instance_get_output_ptr(water_);
  }

  const float* insectsOutput() const {
    return insects_instance_get_output_ptr(insects_);
  }

  const float* insects2Output() const {
    return insects2_instance_get_output_ptr(insects2_);
  }

  void copySelectedOutput(float* output_interleaved, int frames) {
    if (outputSelect() == 3) {
      const float* water = waterOutput();
      const float* insects = insectsOutput();
      const float* insects2 = insects2Output();
      for (int i = 0; i < frames * 2; ++i) {
        output_interleaved[i] =
            (water ? water[i] : 0.0f) +
            (insects ? insects[i] : 0.0f) +
            (insects2 ? insects2[i] : 0.0f);
      }
      return;
    }

    const float* source = selectedOutput();
    if (source == nullptr) {
      std::fill(output_interleaved, output_interleaved + frames * 2, 0.0f);
      return;
    }
    std::copy(source, source + frames * 2, output_interleaved);
  }

  void copySelectedOutput(float* output_l, float* output_r, int frames) {
    if (outputSelect() == 3) {
      const float* water = waterOutput();
      const float* insects = insectsOutput();
      const float* insects2 = insects2Output();
      for (int i = 0; i < frames; ++i) {
        output_l[i] =
            (water ? water[i * 2] : 0.0f) +
            (insects ? insects[i * 2] : 0.0f) +
            (insects2 ? insects2[i * 2] : 0.0f);
        output_r[i] =
            (water ? water[i * 2 + 1] : 0.0f) +
            (insects ? insects[i * 2 + 1] : 0.0f) +
            (insects2 ? insects2[i * 2 + 1] : 0.0f);
      }
      return;
    }

    const float* source = selectedOutput();
    if (source == nullptr) {
      std::fill(output_l, output_l + frames, 0.0f);
      std::fill(output_r, output_r + frames, 0.0f);
      return;
    }
    for (int i = 0; i < frames; ++i) {
      output_l[i] = source[i * 2];
      output_r[i] = source[i * 2 + 1];
    }
  }

  const float* selectedOutput() const {
    switch (outputSelect()) {
      case 1:
        return insectsOutput();
      case 2:
        return insects2Output();
      default:
        return waterOutput();
    }
  }

  void copyTapOutputs(
      float* const* output_l,
      float* const* output_r,
      uint32_t output_bus_count,
      int offset,
      int frames) {
    const float* taps[] = {waterOutput(), insectsOutput(), insects2Output()};
    const uint32_t copy_bus_count = std::min<uint32_t>(output_bus_count, 3u);
    for (uint32_t bus = 0; bus < copy_bus_count; ++bus) {
      const float* source = taps[bus];
      if (source == nullptr) {
        std::fill(output_l[bus] + offset, output_l[bus] + offset + frames, 0.0f);
        std::fill(output_r[bus] + offset, output_r[bus] + offset + frames, 0.0f);
        continue;
      }
      for (int i = 0; i < frames; ++i) {
        output_l[bus][offset + i] = source[i * 2];
        output_r[bus][offset + i] = source[i * 2 + 1];
      }
    }
    for (uint32_t bus = copy_bus_count; bus < output_bus_count; ++bus) {
      std::fill(output_l[bus] + offset, output_l[bus] + offset + frames, 0.0f);
      std::fill(output_r[bus] + offset, output_r[bus] + offset + frames, 0.0f);
    }
  }

  KesshoWaterInstance* water_ = nullptr;
  KesshoInsectsInstance* insects_ = nullptr;
  KesshoInsects2Instance* insects2_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kSoundscapesBlockSize;
  std::array<float, kParamCount> params_ = makeDefaultParams();
  std::array<float, kParamCount> committed_params_{};
  bool committed_params_valid_ = false;
  bool water_started_ = false;
  bool insects_started_ = false;
  bool insects2_started_ = false;
};

} // namespace

std::unique_ptr<IKesshoModule> createSoundscapesModule() {
  return std::make_unique<SoundscapesModule>();
}

} // namespace kessho::core
