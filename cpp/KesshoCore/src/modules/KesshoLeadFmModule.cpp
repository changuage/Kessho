#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>

#include "kessho_lead_fm.h"

namespace kessho::core {
namespace {

constexpr int kLeadFmBlockSize = LEAD_FM_MAX_BLOCK_SIZE;
constexpr int kParamAlgorithm = 0;
constexpr int kParamBeatDetune = 1;
constexpr int kParamCarrier2Mix = 2;
constexpr int kOperatorParamStart = 3;
constexpr int kOperatorParamCount = 10;
constexpr int kParamAttack = kOperatorParamStart + LEAD_FM_NUM_OPERATORS * kOperatorParamCount;
constexpr int kParamDecay = kParamAttack + 1;
constexpr int kParamSustain = kParamAttack + 2;
constexpr int kParamRelease = kParamAttack + 3;
constexpr int kParamFilterFreq = kParamAttack + 4;
constexpr int kParamFilterQ = kParamAttack + 5;
constexpr int kParamFilterType = kParamAttack + 6;
constexpr int kParamFilterEnvAttack = kParamAttack + 7;
constexpr int kParamFilterEnvDecay = kParamAttack + 8;
constexpr int kParamFilterEnvSustain = kParamAttack + 9;
constexpr int kParamFilterEnvRelease = kParamAttack + 10;
constexpr int kParamFilterEnvDepth = kParamAttack + 11;
constexpr int kParamDrive = kParamAttack + 12;
constexpr int kParamTransientClick = kParamAttack + 13;
constexpr int kParamTransientNoise = kParamAttack + 14;
constexpr int kParamTransientDuration = kParamAttack + 15;
constexpr int kParamTransientDecay = kParamAttack + 16;
constexpr int kParamTransientFilter = kParamAttack + 17;
constexpr int kParamTransientType = kParamAttack + 18;
constexpr int kParamGain = kParamAttack + 19;
constexpr int kParamXLevel = kParamAttack + 20;
constexpr int kParamXPan = kParamAttack + 21;
constexpr int kParamYLevel = kParamAttack + 22;
constexpr int kParamYPan = kParamAttack + 23;
constexpr int kParamLfoRate = kParamAttack + 24;
constexpr int kParamLfoDepth = kParamAttack + 25;
constexpr int kParamLfoTarget = kParamAttack + 26;
constexpr int kParamUnisonVoices = kParamAttack + 27;
constexpr int kParamUnisonDetune = kParamAttack + 28;
constexpr int kParamDelayEnabled = kParamAttack + 29;
constexpr int kParamDelayTimeL = kParamAttack + 30;
constexpr int kParamDelayTimeR = kParamAttack + 31;
constexpr int kParamDelayFeedback = kParamAttack + 32;
constexpr int kParamDelayFilter = kParamAttack + 33;
constexpr int kParamDelayMix = kParamAttack + 34;
constexpr int kParamDelaySend = kParamAttack + 35;
constexpr int kParamOutputSelect = kParamAttack + 36;
constexpr int kParamCarrier1Waveform = 80;
constexpr int kParamCarrier2Waveform = 81;
constexpr int kParamStereoSpread = 82;
constexpr int kParamPitchEnvDepthCents = 83;
constexpr int kParamPitchEnvAttack = 84;
constexpr int kParamPitchEnvDecay = 85;
constexpr int kParamPitchEnvTarget = 86;
constexpr int kParamPitchEnvVelocityDepth = 87;
constexpr int kOperatorV2ParamStart = 88;
constexpr int kOperatorV2ParamCount = 6;
constexpr int kParamCount = 112;

constexpr int kOpRatio = 0;
constexpr int kOpIndex = 1;
constexpr int kOpDecay = 2;
constexpr int kOpSustain = 3;
constexpr int kOpLevel = 4;
constexpr int kOpFeedback = 5;
constexpr int kOpDetune = 6;
constexpr int kOpEnvRate = 7;
constexpr int kOpModAttack = 8;
constexpr int kOpModDelay = 9;
constexpr int kOpWaveform = 0;
constexpr int kOpFixedHz = 1;
constexpr int kOpKeyTrack = 2;
constexpr int kOpVelocityToIndex = 3;
constexpr int kOpVelocityToLevel = 4;
constexpr int kOpModRelease = 5;

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};
  params[kParamAlgorithm] = LEAD_FM_ALG_PARALLEL;
  params[kParamBeatDetune] = 0.0f;
  params[kParamCarrier2Mix] = 0.0f;
  params[kParamCarrier1Waveform] = LEAD_FM_WAVE_SINE;
  params[kParamCarrier2Waveform] = LEAD_FM_WAVE_SINE;
  params[kParamStereoSpread] = 0.0f;
  params[kParamPitchEnvDepthCents] = 0.0f;
  params[kParamPitchEnvAttack] = 0.0f;
  params[kParamPitchEnvDecay] = 0.08f;
  params[kParamPitchEnvTarget] = LEAD_FM_PITCH_ENV_CARRIERS;
  params[kParamPitchEnvVelocityDepth] = 0.0f;

  for (int op = 0; op < LEAD_FM_NUM_OPERATORS; ++op) {
    const int base = kOperatorParamStart + op * kOperatorParamCount;
    const int v2_base = kOperatorV2ParamStart + op * kOperatorV2ParamCount;
    params[base + kOpRatio] = 1.0f;
    params[base + kOpIndex] = 0.0f;
    params[base + kOpDecay] = 0.8f;
    params[base + kOpSustain] = 0.1f;
    params[base + kOpLevel] = 1.0f;
    params[base + kOpFeedback] = 0.0f;
    params[base + kOpDetune] = 0.0f;
    params[base + kOpEnvRate] = 1.0f;
    params[base + kOpModAttack] = 0.0f;
    params[base + kOpModDelay] = 0.0f;
    params[v2_base + kOpWaveform] = LEAD_FM_WAVE_SINE;
    params[v2_base + kOpFixedHz] = 0.0f;
    params[v2_base + kOpKeyTrack] = 1.0f;
    params[v2_base + kOpVelocityToIndex] = 0.0f;
    params[v2_base + kOpVelocityToLevel] = 0.0f;
    params[v2_base + kOpModRelease] = 0.0f;
  }

  params[kParamAttack] = 0.01f;
  params[kParamDecay] = 0.8f;
  params[kParamSustain] = 0.3f;
  params[kParamRelease] = 2.0f;
  params[kParamFilterFreq] = 4000.0f;
  params[kParamFilterQ] = 0.7f;
  params[kParamFilterType] = LEAD_FM_FILTER_LP;
  params[kParamFilterEnvAttack] = 0.0f;
  params[kParamFilterEnvDecay] = 0.0f;
  params[kParamFilterEnvSustain] = 1.0f;
  params[kParamFilterEnvRelease] = 0.0f;
  params[kParamFilterEnvDepth] = 0.0f;
  params[kParamDrive] = 0.0f;
  params[kParamTransientClick] = 0.0f;
  params[kParamTransientNoise] = 0.0f;
  params[kParamTransientDuration] = 20.0f;
  params[kParamTransientDecay] = 50.0f;
  params[kParamTransientFilter] = 4000.0f;
  params[kParamTransientType] = LEAD_FM_TRANS_WHITE;
  params[kParamGain] = 0.34f;
  params[kParamXLevel] = 1.0f;
  params[kParamXPan] = -0.2f;
  params[kParamYLevel] = 0.9f;
  params[kParamYPan] = 0.2f;
  params[kParamLfoRate] = 0.0f;
  params[kParamLfoDepth] = 0.0f;
  params[kParamLfoTarget] = LEAD_FM_LFO_ALL;
  params[kParamUnisonVoices] = 1.0f;
  params[kParamUnisonDetune] = 0.0f;
  params[kParamDelayEnabled] = 0.0f;
  params[kParamDelayTimeL] = 0.0f;
  params[kParamDelayTimeR] = 0.0f;
  params[kParamDelayFeedback] = 0.4f;
  params[kParamDelayFilter] = 4000.0f;
  params[kParamDelayMix] = 0.3f;
  params[kParamDelaySend] = 0.3f;
  params[kParamOutputSelect] = 0.0f;
  return params;
}

int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

int clampedRounded(float value, int lo, int hi) {
  return std::clamp(roundedInt(value), lo, hi);
}

float clampUnit(float value) {
  return std::isfinite(value) ? std::clamp(value, 0.0f, 1.0f) : 0.0f;
}

class LeadFmModule final : public IKesshoModule {
public:
  ~LeadFmModule() override {
    lead_fm_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kLeadFmBlockSize));
    lead_fm_instance_destroy(instance_);
    instance_ = lead_fm_instance_create(sample_rate_);
    if (instance_ == nullptr) {
      return false;
    }
    last_triggered_voice_index_ = -1;
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr && lead_fm_instance_reset(instance_, sample_rate_) == 1) {
      last_triggered_voice_index_ = -1;
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
      const int block = std::min(kLeadFmBlockSize, std::min(max_block_size_, frames - rendered));
      lead_fm_instance_process_block(instance_, block);
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
      const int block = std::min(kLeadFmBlockSize, std::min(max_block_size_, frames - rendered));
      lead_fm_instance_process_block(instance_, block);
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

    lead_fm_instance_set_algorithm(instance_, clampedRounded(params_[kParamAlgorithm], 0, 4));
    lead_fm_instance_set_beat_detune(instance_, params_[kParamBeatDetune]);
    lead_fm_instance_set_carrier2_mix(instance_, params_[kParamCarrier2Mix]);
    lead_fm_instance_set_carrier1_waveform(instance_, clampedRounded(params_[kParamCarrier1Waveform], 0, 3));
    lead_fm_instance_set_carrier2_waveform(instance_, clampedRounded(params_[kParamCarrier2Waveform], 0, 3));
    lead_fm_instance_set_stereo_spread(instance_, params_[kParamStereoSpread]);
    lead_fm_instance_set_pitch_env_depth_cents(instance_, params_[kParamPitchEnvDepthCents]);
    lead_fm_instance_set_pitch_env_attack(instance_, params_[kParamPitchEnvAttack]);
    lead_fm_instance_set_pitch_env_decay(instance_, params_[kParamPitchEnvDecay]);
    lead_fm_instance_set_pitch_env_target(instance_, clampedRounded(params_[kParamPitchEnvTarget], 0, 3));
    lead_fm_instance_set_pitch_env_velocity_depth(instance_, params_[kParamPitchEnvVelocityDepth]);

    for (int op = 0; op < LEAD_FM_NUM_OPERATORS; ++op) {
      const int base = kOperatorParamStart + op * kOperatorParamCount;
      const int v2_base = kOperatorV2ParamStart + op * kOperatorV2ParamCount;
      lead_fm_instance_set_op_ratio(instance_, op, params_[base + kOpRatio]);
      lead_fm_instance_set_op_index(instance_, op, params_[base + kOpIndex]);
      lead_fm_instance_set_op_decay(instance_, op, params_[base + kOpDecay]);
      lead_fm_instance_set_op_sustain(instance_, op, params_[base + kOpSustain]);
      lead_fm_instance_set_op_level(instance_, op, params_[base + kOpLevel]);
      lead_fm_instance_set_op_feedback(instance_, op, params_[base + kOpFeedback]);
      lead_fm_instance_set_op_detune(instance_, op, params_[base + kOpDetune]);
      lead_fm_instance_set_op_env_rate(instance_, op, params_[base + kOpEnvRate]);
      lead_fm_instance_set_op_mod_attack(instance_, op, params_[base + kOpModAttack]);
      lead_fm_instance_set_op_mod_delay(instance_, op, params_[base + kOpModDelay]);
      lead_fm_instance_set_op_waveform(instance_, op, clampedRounded(params_[v2_base + kOpWaveform], 0, 3));
      lead_fm_instance_set_op_fixed_hz(instance_, op, params_[v2_base + kOpFixedHz]);
      lead_fm_instance_set_op_key_track(instance_, op, params_[v2_base + kOpKeyTrack]);
      lead_fm_instance_set_op_velocity_to_index(instance_, op, params_[v2_base + kOpVelocityToIndex]);
      lead_fm_instance_set_op_velocity_to_level(instance_, op, params_[v2_base + kOpVelocityToLevel]);
      lead_fm_instance_set_op_mod_release(instance_, op, params_[v2_base + kOpModRelease]);
    }

    lead_fm_instance_set_attack(instance_, params_[kParamAttack]);
    lead_fm_instance_set_decay(instance_, params_[kParamDecay]);
    lead_fm_instance_set_sustain(instance_, params_[kParamSustain]);
    lead_fm_instance_set_release(instance_, params_[kParamRelease]);
    lead_fm_instance_set_filter_freq(instance_, params_[kParamFilterFreq]);
    lead_fm_instance_set_filter_q(instance_, params_[kParamFilterQ]);
    lead_fm_instance_set_filter_type(instance_, clampedRounded(params_[kParamFilterType], 0, 4));
    lead_fm_instance_set_filter_env_attack(instance_, params_[kParamFilterEnvAttack]);
    lead_fm_instance_set_filter_env_decay(instance_, params_[kParamFilterEnvDecay]);
    lead_fm_instance_set_filter_env_sustain(instance_, params_[kParamFilterEnvSustain]);
    lead_fm_instance_set_filter_env_release(instance_, params_[kParamFilterEnvRelease]);
    lead_fm_instance_set_filter_env_depth(instance_, params_[kParamFilterEnvDepth]);
    lead_fm_instance_set_drive(instance_, params_[kParamDrive]);
    lead_fm_instance_set_transient_click(instance_, params_[kParamTransientClick]);
    lead_fm_instance_set_transient_noise(instance_, params_[kParamTransientNoise]);
    lead_fm_instance_set_transient_duration_ms(instance_, params_[kParamTransientDuration]);
    lead_fm_instance_set_transient_decay(instance_, params_[kParamTransientDecay]);
    lead_fm_instance_set_transient_filter(instance_, params_[kParamTransientFilter]);
    lead_fm_instance_set_transient_type(instance_, clampedRounded(params_[kParamTransientType], 0, 3));
    lead_fm_instance_set_gain(instance_, params_[kParamGain]);
    lead_fm_instance_set_x_level(instance_, params_[kParamXLevel]);
    lead_fm_instance_set_x_pan(instance_, params_[kParamXPan]);
    lead_fm_instance_set_y_level(instance_, params_[kParamYLevel]);
    lead_fm_instance_set_y_pan(instance_, params_[kParamYPan]);
    lead_fm_instance_set_lfo_rate(instance_, params_[kParamLfoRate]);
    lead_fm_instance_set_lfo_depth(instance_, params_[kParamLfoDepth]);
    lead_fm_instance_set_lfo_target(instance_, clampedRounded(params_[kParamLfoTarget], 0, 10));
    lead_fm_instance_set_unison_voices(instance_, clampedRounded(params_[kParamUnisonVoices], 1, LEAD_FM_MAX_UNISON));
    lead_fm_instance_set_unison_detune(instance_, params_[kParamUnisonDetune]);
    lead_fm_instance_set_delay_enabled(instance_, params_[kParamDelayEnabled] > 0.5f ? 1 : 0);
    lead_fm_instance_set_delay_time_l(instance_, params_[kParamDelayTimeL]);
    lead_fm_instance_set_delay_time_r(instance_, params_[kParamDelayTimeR]);
    lead_fm_instance_set_delay_feedback(instance_, params_[kParamDelayFeedback]);
    lead_fm_instance_set_delay_filter(instance_, params_[kParamDelayFilter]);
    lead_fm_instance_set_delay_mix(instance_, params_[kParamDelayMix]);
    lead_fm_instance_set_delay_send(instance_, params_[kParamDelaySend]);
  }

  int noteOn(float frequency, float velocity, float hold_seconds, int lead_index) override {
    if (
        instance_ == nullptr ||
        !std::isfinite(frequency) ||
        !std::isfinite(velocity) ||
        !std::isfinite(hold_seconds) ||
        frequency <= 0.0f ||
        velocity < 0.0f ||
        hold_seconds < 0.0f) {
      return 0;
    }

    last_triggered_voice_index_ = lead_fm_instance_note_on_ex(
        instance_,
        frequency,
        velocity,
        hold_seconds,
        lead_index > 0 ? 1 : 0);
    last_triggered_frequency_hz_ = last_triggered_voice_index_ >= 0 ? frequency : 0.0f;
    return last_triggered_voice_index_ >= 0 ? 1 : 0;
  }

  int setVoiceFrequency(int voice_index, float frequency) override {
    if (instance_ == nullptr ||
        voice_index < 0 ||
        voice_index >= LEAD_FM_MAX_POLYPHONY ||
        !std::isfinite(frequency) ||
        frequency <= 0.0f) {
      return 0;
    }
    return lead_fm_instance_note_set_frequency(instance_, voice_index, frequency);
  }

  int setVoiceGain(int voice_index, float gain) override {
    if (instance_ == nullptr || voice_index < 0 || voice_index >= LEAD_FM_MAX_POLYPHONY || !std::isfinite(gain)) {
      return 0;
    }
    return lead_fm_instance_set_voice_gain(instance_, voice_index, std::clamp(gain, 0.0f, 1.0f));
  }

  int setVoiceGainRamp(int voice_index, float target_gain, uint32_t frames) override {
    if (instance_ == nullptr || voice_index < 0 || voice_index >= LEAD_FM_MAX_POLYPHONY || !std::isfinite(target_gain)) return 0;
    return lead_fm_instance_set_voice_gain_ramp(instance_, voice_index, std::clamp(target_gain, 0.0f, 1.0f), frames);
  }

  int setTriggerMacros(float morph, float distance, float expression) override {
    if (instance_ == nullptr) {
      return 0;
    }
    const float m = clampUnit(morph);
    const float d = clampUnit(distance);
    const float e = clampUnit(expression);

    params_[kParamFilterFreq] = std::clamp(850.0f + e * 4600.0f + m * 3400.0f, 300.0f, 12000.0f);
    params_[kParamDrive] = m * 0.58f;
    params_[kParamTransientClick] = m * 0.18f;
    params_[kParamTransientNoise] = d * 0.1f;
    params_[kParamGain] = std::clamp(0.14f + e * 0.46f, 0.0f, 0.9f);
    params_[kParamXLevel] = std::clamp(1.0f - m * 0.18f, 0.0f, 1.2f);
    params_[kParamYLevel] = std::clamp(0.45f + m * 0.55f, 0.0f, 1.2f);
    params_[kParamXPan] = std::clamp(-0.18f - d * 0.22f, -1.0f, 1.0f);
    params_[kParamYPan] = std::clamp(0.18f + d * 0.22f, -1.0f, 1.0f);

    lead_fm_instance_set_filter_freq(instance_, params_[kParamFilterFreq]);
    lead_fm_instance_set_drive(instance_, params_[kParamDrive]);
    lead_fm_instance_set_transient_click(instance_, params_[kParamTransientClick]);
    lead_fm_instance_set_transient_noise(instance_, params_[kParamTransientNoise]);
    lead_fm_instance_set_gain(instance_, params_[kParamGain]);
    lead_fm_instance_set_x_level(instance_, params_[kParamXLevel]);
    lead_fm_instance_set_y_level(instance_, params_[kParamYLevel]);
    lead_fm_instance_set_x_pan(instance_, params_[kParamXPan]);
    lead_fm_instance_set_y_pan(instance_, params_[kParamYPan]);
    return 1;
  }

  int setSourcePresetPatch(int source_index, const KesshoSourcePresetPatch& patch) override {
    (void)source_index;
    if (instance_ == nullptr || patch.exact_lead_param_count != KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
      return 0;
    }
    for (uint32_t index = 0; index < KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT; ++index) {
      if (!std::isfinite(patch.exact_lead_params[index])) {
        return 0;
      }
    }
    for (uint32_t index = 0; index < KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT; ++index) {
      params_[index] = patch.exact_lead_params[index];
    }
    commitParams();
    lead_fm_instance_refresh_active_notes(instance_);
    return 1;
  }

  int setIndexedParam(int param_index, float value) override {
    if (instance_ == nullptr || param_index < 0 || param_index >= static_cast<int>(KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT)) {
      return 0;
    }
    if (!std::isfinite(value)) {
      return 0;
    }
    params_[static_cast<uint32_t>(param_index)] = value;
    commitParams();
    lead_fm_instance_refresh_active_notes(instance_);
    return 1;
  }

  void allNotesOff() override {
    if (instance_ != nullptr) {
      lead_fm_instance_all_notes_off(instance_);
    }
    last_triggered_voice_index_ = -1;
  }

  int noteOff(int voice_index) override {
    return instance_ != nullptr ? lead_fm_instance_note_off(instance_, voice_index) : 0;
  }

  int killVoice(int voice_index) override {
    (void)voice_index;
    if (instance_ == nullptr) {
      return 0;
    }
    reset();
    return 1;
  }

  int lastTriggeredVoiceIndex() const override {
    return last_triggered_voice_index_;
  }

  float lastTriggeredFrequencyHz() const override {
    return last_triggered_frequency_hz_;
  }

  int activeVoiceCount() override {
    return instance_ != nullptr ? lead_fm_instance_get_active_count(instance_) : 0;
  }

private:
  int outputSelect() const {
    return clampedRounded(params_[kParamOutputSelect], 0, 2);
  }

  void copySelectedOutput(float* output_interleaved, int frames) {
    const float* lead1 = lead_fm_instance_get_output_ptr(instance_);
    const float* lead2 = lead_fm_instance_get_output2_ptr(instance_);
    const int sample_count = frames * 2;
    switch (outputSelect()) {
      case 1:
        std::copy(lead2, lead2 + sample_count, output_interleaved);
        break;
      case 2:
        for (int i = 0; i < sample_count; ++i) {
          output_interleaved[i] = lead1[i] + lead2[i];
        }
        break;
      default:
        std::copy(lead1, lead1 + sample_count, output_interleaved);
        break;
    }
  }

  void copySelectedOutput(float* output_l, float* output_r, int frames) {
    const float* lead1 = lead_fm_instance_get_output_ptr(instance_);
    const float* lead2 = lead_fm_instance_get_output2_ptr(instance_);
    const int select = outputSelect();
    for (int i = 0; i < frames; ++i) {
      const int idx = i * 2;
      if (select == 1) {
        output_l[i] = lead2[idx];
        output_r[i] = lead2[idx + 1];
      } else if (select == 2) {
        output_l[i] = lead1[idx] + lead2[idx];
        output_r[i] = lead1[idx + 1] + lead2[idx + 1];
      } else {
        output_l[i] = lead1[idx];
        output_r[i] = lead1[idx + 1];
      }
    }
  }

  KesshoLeadFmInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kLeadFmBlockSize;
  int last_triggered_voice_index_ = -1;
  float last_triggered_frequency_hz_ = 0.0f;
  std::array<float, kParamCount> params_ = makeDefaultParams();
};

} // namespace

std::unique_ptr<IKesshoModule> createLeadFmModule() {
  return std::make_unique<LeadFmModule>();
}

} // namespace kessho::core
