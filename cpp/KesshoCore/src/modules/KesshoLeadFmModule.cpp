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
constexpr int kParamCount = kParamOutputSelect + 1;

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

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};
  params[kParamAlgorithm] = LEAD_FM_ALG_PARALLEL;
  params[kParamBeatDetune] = 0.0f;
  params[kParamCarrier2Mix] = 0.0f;

  for (int op = 0; op < LEAD_FM_NUM_OPERATORS; ++op) {
    const int base = kOperatorParamStart + op * kOperatorParamCount;
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
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr && lead_fm_instance_reset(instance_, sample_rate_) == 1) {
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

    for (int op = 0; op < LEAD_FM_NUM_OPERATORS; ++op) {
      const int base = kOperatorParamStart + op * kOperatorParamCount;
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
    lead_fm_instance_set_lfo_target(instance_, clampedRounded(params_[kParamLfoTarget], 0, 8));
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

    lead_fm_instance_note_on_ex(
        instance_,
        frequency,
        velocity,
        hold_seconds,
        lead_index > 0 ? 1 : 0);
    return 1;
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
    if (instance_ == nullptr) {
      return 0;
    }
    if (patch.exact_lead_param_count == KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
      for (uint32_t index = 0; index < KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT; ++index) {
        params_[index] = std::isfinite(patch.exact_lead_params[index]) ? patch.exact_lead_params[index] : params_[index];
      }
      commitParams();
      return 1;
    }

    const float tone = clampUnit(patch.tone);
    const float brightness = clampUnit(patch.brightness);
    const float texture = clampUnit(patch.texture);
    const float motion = clampUnit(patch.motion);
    const float attack = clampUnit(patch.attack);
    const float release = clampUnit(patch.release);
    const float body = clampUnit(patch.body);
    const float transient = clampUnit(patch.transient);

    params_[kParamAlgorithm] =
        texture > 0.72f ? LEAD_FM_ALG_DX17 : tone > 0.58f ? LEAD_FM_ALG_SPLIT : LEAD_FM_ALG_PARALLEL;
    params_[kParamBeatDetune] = texture * 7.0f;
    params_[kParamCarrier2Mix] = std::clamp(0.08f + brightness * 0.38f, 0.0f, 1.0f);
    for (int op = 0; op < LEAD_FM_NUM_OPERATORS; ++op) {
      const int base = kOperatorParamStart + op * kOperatorParamCount;
      const float op_position = static_cast<float>(op) / static_cast<float>(LEAD_FM_NUM_OPERATORS - 1);
      params_[base + kOpRatio] = 1.0f + op_position * (1.0f + tone * 3.5f);
      params_[base + kOpIndex] = std::clamp((0.12f + texture * 2.2f) * (1.0f - op_position * 0.22f), 0.0f, 8.0f);
      params_[base + kOpDecay] = 0.22f + release * 1.8f + op_position * 0.45f;
      params_[base + kOpSustain] = std::clamp(0.08f + body * 0.52f - op_position * 0.06f, 0.0f, 1.0f);
      params_[base + kOpLevel] = std::clamp(0.55f + brightness * 0.38f - op_position * 0.08f, 0.0f, 1.0f);
      params_[base + kOpFeedback] = std::clamp(texture * transient * (op == 0 ? 0.45f : 0.24f), 0.0f, 1.0f);
      params_[base + kOpDetune] = (op_position - 0.5f) * texture * 24.0f;
      params_[base + kOpEnvRate] = 0.65f + motion * 1.4f;
      params_[base + kOpModAttack] = attack * 0.18f;
      params_[base + kOpModDelay] = op_position * motion * 0.12f;
    }
    params_[kParamAttack] = 0.004f + attack * 0.18f;
    params_[kParamDecay] = 0.18f + (1.0f - transient) * 1.6f;
    params_[kParamSustain] = std::clamp(0.18f + body * 0.62f, 0.0f, 1.0f);
    params_[kParamRelease] = 0.18f + release * 3.4f;
    params_[kParamFilterFreq] = std::clamp(650.0f + brightness * 7600.0f + tone * 2400.0f, 120.0f, 14000.0f);
    params_[kParamFilterQ] = std::clamp(0.35f + texture * 1.8f, 0.05f, 8.0f);
    params_[kParamFilterEnvDepth] = brightness * transient * 2600.0f;
    params_[kParamDrive] = std::clamp(tone * 0.26f + transient * 0.22f, 0.0f, 1.0f);
    params_[kParamTransientClick] = transient * 0.18f;
    params_[kParamTransientNoise] = texture * transient * 0.12f;
    params_[kParamTransientDuration] = 8.0f + transient * 38.0f;
    params_[kParamGain] = std::clamp(0.18f + body * 0.3f + brightness * 0.18f, 0.0f, 0.95f);
    params_[kParamLfoRate] = motion * 4.0f;
    params_[kParamLfoDepth] = motion * texture * 0.18f;
    params_[kParamUnisonVoices] = 1.0f + std::floor(texture * 3.0f);
    params_[kParamUnisonDetune] = texture * 18.0f;

    commitParams();
    return 1;
  }

  void allNotesOff() override {
    if (instance_ != nullptr) {
      lead_fm_instance_all_notes_off(instance_);
    }
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
  std::array<float, kParamCount> params_ = makeDefaultParams();
};

} // namespace

std::unique_ptr<IKesshoModule> createLeadFmModule() {
  return std::make_unique<LeadFmModule>();
}

} // namespace kessho::core
