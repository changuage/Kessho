#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>

#include "kessho_drum.h"

namespace kessho::core {
namespace {

constexpr int kDrumBlockSize = DRUM_MAX_BLOCK_SIZE;
constexpr int kParamSub = 0;
constexpr int kParamKick = kParamSub + 12;
constexpr int kParamClick = kParamKick + 13;
constexpr int kParamBeepHi = kParamClick + 15;
constexpr int kParamBeepLo = kParamBeepHi + 19;
constexpr int kParamNoise = kParamBeepLo + 19;
constexpr int kParamMembrane = kParamNoise + 14;
constexpr int kParamDelay = kParamMembrane + 12;
constexpr int kParamDelaySends = kParamDelay + 6;
constexpr int kParamTrigger = kParamDelaySends + DRUM_NUM_VOICE_TYPES;
constexpr int kParamMasterLevel = kParamTrigger + 5;
constexpr int kParamReverbSend = kParamMasterLevel + 1;
constexpr int kParamSeed = kParamMasterLevel + 2;
constexpr int kParamOutputSelect = kParamMasterLevel + 3;
constexpr int kParamCount = kParamOutputSelect + 1;

int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};

  params[kParamSub + 0] = 60.0f;
  params[kParamSub + 1] = 200.0f;
  params[kParamSub + 2] = 0.8f;
  params[kParamSub + 3] = 0.0f;
  params[kParamSub + 4] = 0.0f;
  params[kParamSub + 5] = 0.0f;
  params[kParamSub + 6] = 50.0f;
  params[kParamSub + 7] = 0.0f;
  params[kParamSub + 8] = 0.0f;
  params[kParamSub + 9] = 0.0f;
  params[kParamSub + 10] = 0.0f;
  params[kParamSub + 11] = 0.5f;

  params[kParamKick + 0] = 55.0f;
  params[kParamKick + 1] = 24.0f;
  params[kParamKick + 2] = 60.0f;
  params[kParamKick + 3] = 300.0f;
  params[kParamKick + 4] = 0.8f;
  params[kParamKick + 5] = 0.3f;
  params[kParamKick + 6] = 0.5f;
  params[kParamKick + 7] = 0.5f;
  params[kParamKick + 8] = 0.0f;
  params[kParamKick + 9] = 0.0f;
  params[kParamKick + 10] = 0.0f;
  params[kParamKick + 11] = 0.0f;
  params[kParamKick + 12] = 0.5f;

  params[kParamClick + 0] = 30.0f;
  params[kParamClick + 1] = 4000.0f;
  params[kParamClick + 2] = 0.5f;
  params[kParamClick + 3] = 0.7f;
  params[kParamClick + 4] = 0.5f;
  params[kParamClick + 5] = 2000.0f;
  params[kParamClick + 6] = 0.0f;
  params[kParamClick + 7] = DRUM_CLICK_IMPULSE;
  params[kParamClick + 8] = 1.0f;
  params[kParamClick + 9] = 0.0f;
  params[kParamClick + 10] = 0.0f;
  params[kParamClick + 11] = 0.0f;
  params[kParamClick + 12] = 0.0f;
  params[kParamClick + 13] = 0.0f;
  params[kParamClick + 14] = 0.5f;

  params[kParamBeepHi + 0] = 4000.0f;
  params[kParamBeepHi + 1] = 1.0f;
  params[kParamBeepHi + 2] = 100.0f;
  params[kParamBeepHi + 3] = 0.6f;
  params[kParamBeepHi + 4] = 0.3f;
  params[kParamBeepHi + 5] = 0.0f;
  params[kParamBeepHi + 6] = 1.0f;
  params[kParamBeepHi + 7] = 0.0f;
  params[kParamBeepHi + 8] = 4.0f;
  params[kParamBeepHi + 9] = 0.5f;
  params[kParamBeepHi + 10] = 0.0f;
  params[kParamBeepHi + 11] = 0.0f;
  params[kParamBeepHi + 12] = 0.0f;
  params[kParamBeepHi + 13] = 2.0f;
  params[kParamBeepHi + 14] = 0.01f;
  params[kParamBeepHi + 15] = 0.2f;
  params[kParamBeepHi + 16] = 0.0f;
  params[kParamBeepHi + 17] = 0.0f;
  params[kParamBeepHi + 18] = 0.5f;

  params[kParamBeepLo + 0] = 200.0f;
  params[kParamBeepLo + 1] = 1.0f;
  params[kParamBeepLo + 2] = 200.0f;
  params[kParamBeepLo + 3] = 0.7f;
  params[kParamBeepLo + 4] = 0.0f;
  params[kParamBeepLo + 5] = 0.0f;
  params[kParamBeepLo + 6] = 50.0f;
  params[kParamBeepLo + 7] = 0.3f;
  params[kParamBeepLo + 8] = 0.0f;
  params[kParamBeepLo + 9] = 0.5f;
  params[kParamBeepLo + 10] = 0.0f;
  params[kParamBeepLo + 11] = 10.0f;
  params[kParamBeepLo + 12] = 0.0f;
  params[kParamBeepLo + 13] = 0.0f;
  params[kParamBeepLo + 14] = 0.0f;
  params[kParamBeepLo + 15] = 1.0f;
  params[kParamBeepLo + 16] = 1.0f;
  params[kParamBeepLo + 17] = 0.0f;
  params[kParamBeepLo + 18] = 0.5f;

  params[kParamNoise + 0] = 2000.0f;
  params[kParamNoise + 1] = 100.0f;
  params[kParamNoise + 2] = 0.6f;
  params[kParamNoise + 3] = 1.0f;
  params[kParamNoise + 4] = 0.0f;
  params[kParamNoise + 5] = 1.0f;
  params[kParamNoise + 6] = 0.0f;
  params[kParamNoise + 7] = 0.0f;
  params[kParamNoise + 8] = 0.0f;
  params[kParamNoise + 9] = 100.0f;
  params[kParamNoise + 10] = 1.0f;
  params[kParamNoise + 11] = 0.0f;
  params[kParamNoise + 12] = 0.0f;
  params[kParamNoise + 13] = 0.5f;

  params[kParamMembrane + 0] = 150.0f;
  params[kParamMembrane + 1] = 500.0f;
  params[kParamMembrane + 2] = 0.7f;
  params[kParamMembrane + 3] = 0.5f;
  params[kParamMembrane + 4] = 0.0f;
  params[kParamMembrane + 5] = 150.0f;
  params[kParamMembrane + 6] = 0.3f;
  params[kParamMembrane + 7] = 0.5f;
  params[kParamMembrane + 8] = 0.0f;
  params[kParamMembrane + 9] = 1.0f;
  params[kParamMembrane + 10] = 0.0f;
  params[kParamMembrane + 11] = 0.5f;

  params[kParamDelay + 0] = 0.0f;
  params[kParamDelay + 1] = 0.0f;
  params[kParamDelay + 2] = 0.0f;
  params[kParamDelay + 3] = 0.4f;
  params[kParamDelay + 4] = 4000.0f;
  params[kParamDelay + 5] = 0.3f;

  params[kParamTrigger + 0] = -1.0f;
  params[kParamTrigger + 1] = -1.0f;
  params[kParamTrigger + 2] = 0.0f;
  params[kParamTrigger + 3] = 1.0e10f;
  params[kParamTrigger + 4] = 1.0e10f;

  params[kParamMasterLevel] = 0.8f;
  params[kParamReverbSend] = 0.1f;
  params[kParamSeed] = 42.0f;
  params[kParamOutputSelect] = 0.0f;
  return params;
}

class DrumModule final : public IKesshoModule {
public:
  ~DrumModule() override {
    drum_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kDrumBlockSize));
    drum_instance_destroy(instance_);
    instance_ = drum_instance_create(sample_rate_);
    if (instance_ == nullptr) {
      return false;
    }
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr && drum_instance_reset(instance_, sample_rate_) == 1) {
      commitParams();
    }
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    (void)input_interleaved;
    if (instance_ == nullptr || output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kDrumBlockSize, std::min(max_block_size_, frames - rendered));
      drum_instance_process_block(instance_, block);
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
    if (instance_ == nullptr || output_l == nullptr || output_r == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kDrumBlockSize, std::min(max_block_size_, frames - rendered));
      drum_instance_process_block(instance_, block);
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
    if (instance_ == nullptr) {
      return;
    }

    drum_instance_set_sub_freq(instance_, params_[kParamSub + 0]);
    drum_instance_set_sub_decay(instance_, params_[kParamSub + 1]);
    drum_instance_set_sub_level(instance_, params_[kParamSub + 2]);
    drum_instance_set_sub_tone(instance_, params_[kParamSub + 3]);
    drum_instance_set_sub_shape(instance_, params_[kParamSub + 4]);
    drum_instance_set_sub_pitch_env(instance_, params_[kParamSub + 5]);
    drum_instance_set_sub_pitch_decay(instance_, params_[kParamSub + 6]);
    drum_instance_set_sub_drive(instance_, params_[kParamSub + 7]);
    drum_instance_set_sub_sub_octave(instance_, params_[kParamSub + 8]);
    drum_instance_set_sub_attack(instance_, params_[kParamSub + 9]);
    drum_instance_set_sub_variation(instance_, params_[kParamSub + 10]);
    drum_instance_set_sub_distance(instance_, params_[kParamSub + 11]);

    drum_instance_set_kick_freq(instance_, params_[kParamKick + 0]);
    drum_instance_set_kick_pitch_env(instance_, params_[kParamKick + 1]);
    drum_instance_set_kick_pitch_decay(instance_, params_[kParamKick + 2]);
    drum_instance_set_kick_decay(instance_, params_[kParamKick + 3]);
    drum_instance_set_kick_level(instance_, params_[kParamKick + 4]);
    drum_instance_set_kick_click(instance_, params_[kParamKick + 5]);
    drum_instance_set_kick_body(instance_, params_[kParamKick + 6]);
    drum_instance_set_kick_punch(instance_, params_[kParamKick + 7]);
    drum_instance_set_kick_tail(instance_, params_[kParamKick + 8]);
    drum_instance_set_kick_tone(instance_, params_[kParamKick + 9]);
    drum_instance_set_kick_attack(instance_, params_[kParamKick + 10]);
    drum_instance_set_kick_variation(instance_, params_[kParamKick + 11]);
    drum_instance_set_kick_distance(instance_, params_[kParamKick + 12]);

    drum_instance_set_click_decay(instance_, params_[kParamClick + 0]);
    drum_instance_set_click_filter(instance_, params_[kParamClick + 1]);
    drum_instance_set_click_tone(instance_, params_[kParamClick + 2]);
    drum_instance_set_click_level(instance_, params_[kParamClick + 3]);
    drum_instance_set_click_resonance(instance_, params_[kParamClick + 4]);
    drum_instance_set_click_pitch(instance_, params_[kParamClick + 5]);
    drum_instance_set_click_pitch_env(instance_, params_[kParamClick + 6]);
    drum_instance_set_click_mode(instance_, roundedInt(params_[kParamClick + 7]));
    drum_instance_set_click_grain_count(instance_, roundedInt(params_[kParamClick + 8]));
    drum_instance_set_click_grain_spread(instance_, params_[kParamClick + 9]);
    drum_instance_set_click_stereo_width(instance_, params_[kParamClick + 10]);
    drum_instance_set_click_exciter_color(instance_, params_[kParamClick + 11]);
    drum_instance_set_click_attack(instance_, params_[kParamClick + 12]);
    drum_instance_set_click_variation(instance_, params_[kParamClick + 13]);
    drum_instance_set_click_distance(instance_, params_[kParamClick + 14]);

    drum_instance_set_beep_hi_freq(instance_, params_[kParamBeepHi + 0]);
    drum_instance_set_beep_hi_attack(instance_, params_[kParamBeepHi + 1]);
    drum_instance_set_beep_hi_decay(instance_, params_[kParamBeepHi + 2]);
    drum_instance_set_beep_hi_level(instance_, params_[kParamBeepHi + 3]);
    drum_instance_set_beep_hi_tone(instance_, params_[kParamBeepHi + 4]);
    drum_instance_set_beep_hi_inharmonic(instance_, params_[kParamBeepHi + 5]);
    drum_instance_set_beep_hi_partials(instance_, roundedInt(params_[kParamBeepHi + 6]));
    drum_instance_set_beep_hi_shimmer(instance_, params_[kParamBeepHi + 7]);
    drum_instance_set_beep_hi_shimmer_rate(instance_, params_[kParamBeepHi + 8]);
    drum_instance_set_beep_hi_brightness(instance_, params_[kParamBeepHi + 9]);
    drum_instance_set_beep_hi_feedback(instance_, params_[kParamBeepHi + 10]);
    drum_instance_set_beep_hi_mod_env_decay(instance_, params_[kParamBeepHi + 11]);
    drum_instance_set_beep_hi_noise_in_mod(instance_, params_[kParamBeepHi + 12]);
    drum_instance_set_beep_hi_mod_ratio(instance_, params_[kParamBeepHi + 13]);
    drum_instance_set_beep_hi_mod_ratio_fine(instance_, params_[kParamBeepHi + 14]);
    drum_instance_set_beep_hi_mod_env_end(instance_, params_[kParamBeepHi + 15]);
    drum_instance_set_beep_hi_noise_decay(instance_, params_[kParamBeepHi + 16]);
    drum_instance_set_beep_hi_variation(instance_, params_[kParamBeepHi + 17]);
    drum_instance_set_beep_hi_distance(instance_, params_[kParamBeepHi + 18]);

    drum_instance_set_beep_lo_freq(instance_, params_[kParamBeepLo + 0]);
    drum_instance_set_beep_lo_attack(instance_, params_[kParamBeepLo + 1]);
    drum_instance_set_beep_lo_decay(instance_, params_[kParamBeepLo + 2]);
    drum_instance_set_beep_lo_level(instance_, params_[kParamBeepLo + 3]);
    drum_instance_set_beep_lo_tone(instance_, params_[kParamBeepLo + 4]);
    drum_instance_set_beep_lo_pitch_env(instance_, params_[kParamBeepLo + 5]);
    drum_instance_set_beep_lo_pitch_decay(instance_, params_[kParamBeepLo + 6]);
    drum_instance_set_beep_lo_body(instance_, params_[kParamBeepLo + 7]);
    drum_instance_set_beep_lo_pluck(instance_, params_[kParamBeepLo + 8]);
    drum_instance_set_beep_lo_pluck_damp(instance_, params_[kParamBeepLo + 9]);
    drum_instance_set_beep_lo_modal(instance_, params_[kParamBeepLo + 10]);
    drum_instance_set_beep_lo_modal_q(instance_, params_[kParamBeepLo + 11]);
    drum_instance_set_beep_lo_modal_inharmonic(instance_, params_[kParamBeepLo + 12]);
    drum_instance_set_beep_lo_modal_spread(instance_, params_[kParamBeepLo + 13]);
    drum_instance_set_beep_lo_modal_cut(instance_, params_[kParamBeepLo + 14]);
    drum_instance_set_beep_lo_osc_gain(instance_, params_[kParamBeepLo + 15]);
    drum_instance_set_beep_lo_modal_gain(instance_, params_[kParamBeepLo + 16]);
    drum_instance_set_beep_lo_variation(instance_, params_[kParamBeepLo + 17]);
    drum_instance_set_beep_lo_distance(instance_, params_[kParamBeepLo + 18]);

    drum_instance_set_noise_freq(instance_, params_[kParamNoise + 0]);
    drum_instance_set_noise_decay(instance_, params_[kParamNoise + 1]);
    drum_instance_set_noise_level(instance_, params_[kParamNoise + 2]);
    drum_instance_set_noise_q(instance_, params_[kParamNoise + 3]);
    drum_instance_set_noise_filter_type(instance_, roundedInt(params_[kParamNoise + 4]));
    drum_instance_set_noise_attack(instance_, params_[kParamNoise + 5]);
    drum_instance_set_noise_formant(instance_, params_[kParamNoise + 6]);
    drum_instance_set_noise_breath(instance_, params_[kParamNoise + 7]);
    drum_instance_set_noise_filter_env_depth(instance_, params_[kParamNoise + 8]);
    drum_instance_set_noise_filter_env_decay(instance_, params_[kParamNoise + 9]);
    drum_instance_set_noise_density(instance_, params_[kParamNoise + 10]);
    drum_instance_set_noise_color_lfo(instance_, params_[kParamNoise + 11]);
    drum_instance_set_noise_variation(instance_, params_[kParamNoise + 12]);
    drum_instance_set_noise_distance(instance_, params_[kParamNoise + 13]);

    drum_instance_set_membrane_freq(instance_, params_[kParamMembrane + 0]);
    drum_instance_set_membrane_decay(instance_, params_[kParamMembrane + 1]);
    drum_instance_set_membrane_level(instance_, params_[kParamMembrane + 2]);
    drum_instance_set_membrane_tension(instance_, params_[kParamMembrane + 3]);
    drum_instance_set_membrane_material(instance_, params_[kParamMembrane + 4]);
    drum_instance_set_membrane_size(instance_, params_[kParamMembrane + 5]);
    drum_instance_set_membrane_damping(instance_, params_[kParamMembrane + 6]);
    drum_instance_set_membrane_strike(instance_, params_[kParamMembrane + 7]);
    drum_instance_set_membrane_wire_buzz(instance_, params_[kParamMembrane + 8]);
    drum_instance_set_membrane_attack(instance_, params_[kParamMembrane + 9]);
    drum_instance_set_membrane_variation(instance_, params_[kParamMembrane + 10]);
    drum_instance_set_membrane_distance(instance_, params_[kParamMembrane + 11]);

    drum_instance_set_delay_enabled(instance_, params_[kParamDelay + 0] > 0.5f ? 1 : 0);
    drum_instance_set_delay_time_l(instance_, params_[kParamDelay + 1]);
    drum_instance_set_delay_time_r(instance_, params_[kParamDelay + 2]);
    drum_instance_set_delay_feedback(instance_, params_[kParamDelay + 3]);
    drum_instance_set_delay_filter(instance_, params_[kParamDelay + 4]);
    drum_instance_set_delay_mix(instance_, params_[kParamDelay + 5]);
    for (int voice = 0; voice < DRUM_NUM_VOICE_TYPES; ++voice) {
      drum_instance_set_delay_send(instance_, voice, params_[kParamDelaySends + voice]);
    }

    drum_instance_clear_trigger_overrides(instance_);
    if (params_[kParamTrigger + 0] >= 0.0f) {
      drum_instance_set_trigger_morph(instance_, params_[kParamTrigger + 0]);
    }
    if (params_[kParamTrigger + 1] >= 0.0f) {
      drum_instance_set_trigger_distance(instance_, params_[kParamTrigger + 1]);
    }
    drum_instance_set_trigger_pitch(instance_, params_[kParamTrigger + 2]);
    drum_instance_set_trigger_ratchet_cap(
        instance_,
        params_[kParamTrigger + 3],
        params_[kParamTrigger + 4]);
    drum_instance_set_master_level(instance_, params_[kParamMasterLevel]);
    drum_instance_set_reverb_send(instance_, params_[kParamReverbSend]);
    drum_instance_set_rng_seed(instance_, static_cast<unsigned int>(std::max(0, roundedInt(params_[kParamSeed]))));
  }

  int noteOn(float frequency, float velocity, float hold_seconds, int lead_index) override {
    (void)frequency;
    if (
        instance_ == nullptr ||
        !std::isfinite(velocity) ||
        !std::isfinite(hold_seconds) ||
        velocity < 0.0f) {
      return 0;
    }

    const int voice_type = std::clamp(lead_index, 0, DRUM_NUM_VOICE_TYPES - 1);
    const int sample_offset = std::max(0, roundedInt(hold_seconds));
    drum_instance_trigger(instance_, voice_type, velocity, sample_offset);
    return 1;
  }

  int setTriggerMacros(float morph, float distance, float expression) override {
    (void)expression;
    if (instance_ == nullptr) {
      return 0;
    }
    params_[kParamTrigger + 0] = std::isfinite(morph) ? std::clamp(morph, 0.0f, 1.0f) : -1.0f;
    params_[kParamTrigger + 1] = std::isfinite(distance) ? std::clamp(distance, 0.0f, 1.0f) : -1.0f;
    commitParams();
    return 1;
  }

  int setVoiceSend(int voice_index, float delay_send) override {
    if (instance_ == nullptr || voice_index < 0 || voice_index >= DRUM_NUM_VOICE_TYPES) {
      return 0;
    }
    params_[kParamDelaySends + voice_index] = std::isfinite(delay_send) ? std::clamp(delay_send, 0.0f, 1.0f) : 0.0f;
    commitParams();
    return 1;
  }

  void allNotesOff() override {
    if (instance_ != nullptr) {
      reset();
    }
  }

  int activeVoiceCount() override {
    return instance_ != nullptr ? drum_instance_get_active_count(instance_) : 0;
  }

private:
  int outputSelect() const {
    return std::clamp(roundedInt(params_[kParamOutputSelect]), 0, 1);
  }

  const float* selectedInterleavedOutput() const {
    return outputSelect() == 1 ? drum_instance_get_reverb_send_ptr(instance_) : drum_instance_get_output_ptr(instance_);
  }

  void copySelectedOutput(float* output_interleaved, int frames) {
    const float* source = selectedInterleavedOutput();
    if (source == nullptr) {
      std::fill(output_interleaved, output_interleaved + frames * 2, 0.0f);
      return;
    }
    std::copy(source, source + frames * 2, output_interleaved);
  }

  void copySelectedOutput(float* output_l, float* output_r, int frames) {
    const float* source = selectedInterleavedOutput();
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

  KesshoDrumInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kDrumBlockSize;
  std::array<float, kParamCount> params_ = makeDefaultParams();
};

} // namespace

std::unique_ptr<IKesshoModule> createDrumModule() {
  return std::make_unique<DrumModule>();
}

} // namespace kessho::core
