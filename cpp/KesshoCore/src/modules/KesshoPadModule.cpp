#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>

#include "KesshoCore/KesshoTypes.h"
#include "kessho_pad.h"

namespace kessho::core {
namespace {

constexpr int kPadBlockSize = PAD_MAX_BLOCK_SIZE;
constexpr int kPadParamCount = 53;
constexpr int kParamReverbSend = kPadParamCount * PAD_NUM_PADS;
constexpr int kParamOutputSelect = kParamReverbSend + 1;
constexpr int kParamCount = kParamOutputSelect + 1;
constexpr int kPadOutputTapCount = KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT;
static_assert(kPadOutputTapCount == KESSHO_MODULE_TAP_POSTFADER_PAD2 + 1, "pad tap count must match tap enum");

constexpr int kOscAWave = 0;
constexpr int kOscAOctave = 1;
constexpr int kOscADetune = 2;
constexpr int kOscALevel = 3;
constexpr int kOscBWave = 4;
constexpr int kOscBOctave = 5;
constexpr int kOscBDetune = 6;
constexpr int kOscBLevel = 7;
constexpr int kOscMix = 8;
constexpr int kSubEnabled = 9;
constexpr int kSubOctave = 10;
constexpr int kSubWave = 11;
constexpr int kSubLevel = 12;
constexpr int kNoiseType = 13;
constexpr int kNoiseLevel = 14;
constexpr int kHardness = 15;
constexpr int kWarmth = 16;
constexpr int kPresence = 17;
constexpr int kFoldAmount = 18;
constexpr int kFoldMode = 19;
constexpr int kFilterType = 20;
constexpr int kFilterCutoffMin = 21;
constexpr int kFilterCutoffMax = 22;
constexpr int kFilterResonance = 23;
constexpr int kFilterQ = 24;
constexpr int kFilterSlope = 25;
constexpr int kFilterKeyTracking = 26;
constexpr int kFilterBEnabled = 27;
constexpr int kFilterBType = 28;
constexpr int kFilterBCutoff = 29;
constexpr int kFilterBResonance = 30;
constexpr int kFilterBQ = 31;
constexpr int kFilterRouting = 32;
constexpr int kAttack = 33;
constexpr int kDecay = 34;
constexpr int kSustain = 35;
constexpr int kRelease = 36;
constexpr int kLfo1Rate = 37;
constexpr int kLfo1Depth = 38;
constexpr int kLfo1Wave = 39;
constexpr int kLfo1Dest = 40;
constexpr int kLfo2Rate = 41;
constexpr int kLfo2Depth = 42;
constexpr int kLfo2Wave = 43;
constexpr int kLfo2Dest = 44;
constexpr int kModEnvEnabled = 45;
constexpr int kModEnvAttack = 46;
constexpr int kModEnvDecay = 47;
constexpr int kModEnvSustain = 48;
constexpr int kModEnvRelease = 49;
constexpr int kModEnvDepth = 50;
constexpr int kModEnvDest = 51;
constexpr int kLevel = 52;

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};

  for (int pad = 0; pad < PAD_NUM_PADS; ++pad) {
    const int base = pad * kPadParamCount;
    params[base + kOscAWave] = PAD_WAVE_TRIANGLE;
    params[base + kOscAOctave] = 0.0f;
    params[base + kOscADetune] = 0.0f;
    params[base + kOscALevel] = 1.0f;
    params[base + kOscBWave] = PAD_WAVE_SINE;
    params[base + kOscBOctave] = 0.0f;
    params[base + kOscBDetune] = 0.0f;
    params[base + kOscBLevel] = 1.0f;
    params[base + kOscMix] = 0.5f;
    params[base + kSubEnabled] = 0.0f;
    params[base + kSubOctave] = -1.0f;
    params[base + kSubWave] = PAD_WAVE_SINE;
    params[base + kSubLevel] = 0.5f;
    params[base + kNoiseType] = 0.0f;
    params[base + kNoiseLevel] = 0.0f;
    params[base + kHardness] = 0.0f;
    params[base + kWarmth] = 0.5f;
    params[base + kPresence] = 0.5f;
    params[base + kFoldAmount] = 0.0f;
    params[base + kFoldMode] = PAD_FOLD_BUCHLA;
    params[base + kFilterType] = PAD_FILTER_LP;
    params[base + kFilterCutoffMin] = 200.0f;
    params[base + kFilterCutoffMax] = 4000.0f;
    params[base + kFilterResonance] = 0.0f;
    params[base + kFilterQ] = 0.7f;
    params[base + kFilterSlope] = 12.0f;
    params[base + kFilterKeyTracking] = 0.0f;
    params[base + kFilterBEnabled] = 0.0f;
    params[base + kFilterBType] = PAD_FILTER_LP;
    params[base + kFilterBCutoff] = 2000.0f;
    params[base + kFilterBResonance] = 0.0f;
    params[base + kFilterBQ] = 0.7f;
    params[base + kFilterRouting] = PAD_ROUTE_SERIES;
    params[base + kAttack] = 0.1f;
    params[base + kDecay] = 0.5f;
    params[base + kSustain] = 0.7f;
    params[base + kRelease] = 2.0f;
    params[base + kLfo1Rate] = 0.0f;
    params[base + kLfo1Depth] = 0.0f;
    params[base + kLfo1Wave] = PAD_LFO_SINE;
    params[base + kLfo1Dest] = PAD_DEST_NONE;
    params[base + kLfo2Rate] = 0.0f;
    params[base + kLfo2Depth] = 0.0f;
    params[base + kLfo2Wave] = PAD_LFO_SINE;
    params[base + kLfo2Dest] = PAD_DEST_NONE;
    params[base + kModEnvEnabled] = 0.0f;
    params[base + kModEnvAttack] = 0.5f;
    params[base + kModEnvDecay] = 1.0f;
    params[base + kModEnvSustain] = 0.0f;
    params[base + kModEnvRelease] = 0.5f;
    params[base + kModEnvDepth] = 0.0f;
    params[base + kModEnvDest] = PAD_DEST_FILTER_CUTOFF;
    params[base + kLevel] = 0.8f;
  }

  params[kParamReverbSend] = 0.1f;
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

class PadModule final : public IKesshoModule {
public:
  ~PadModule() override {
    pad_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kPadBlockSize));
    pad_instance_destroy(instance_);
    instance_ = pad_instance_create(sample_rate_);
    if (instance_ == nullptr) {
      return false;
    }
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr && pad_instance_reset(instance_, sample_rate_) == 1) {
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
      const int block = std::min(kPadBlockSize, std::min(max_block_size_, frames - rendered));
      pad_instance_process_block(instance_, block);
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
      const int block = std::min(kPadBlockSize, std::min(max_block_size_, frames - rendered));
      pad_instance_process_block(instance_, block);
      copySelectedOutput(output_l + rendered, output_r + rendered, block);
      rendered += block;
    }
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
    if (instance_ == nullptr || output_l == nullptr || output_r == nullptr || output_bus_count == 0 ||
        output_bus_count > kPadOutputTapCount || frames <= 0) {
      return;
    }

    for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
      if (output_l[bus] == nullptr || output_r[bus] == nullptr) {
        return;
      }
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kPadBlockSize, std::min(max_block_size_, frames - rendered));
      pad_instance_process_block(instance_, block);
      for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
        copyOutputTap(static_cast<int>(bus), output_l[bus] + rendered, output_r[bus] + rendered, block);
      }
      rendered += block;
    }
  }

  int paramCount() const override {
    return kParamCount;
  }

  int outputTapCount() const override {
    return kPadOutputTapCount;
  }

  float* params() override {
    return params_.data();
  }

  int setIndexedParam(int param_index, float value) override {
    if (param_index < 0 || param_index >= kParamCount) {
      return 0;
    }
    params_[param_index] = value;
    if (instance_ == nullptr) {
      return 1;
    }
    if (param_index == kParamReverbSend) {
      pad_instance_set_reverb_send(instance_, params_[kParamReverbSend]);
      return 1;
    }
    if (param_index >= 0 && param_index < kPadParamCount * PAD_NUM_PADS) {
      const int pad = param_index / kPadParamCount;
      const int pad_param = param_index - pad * kPadParamCount;
      applyPadParam(pad, pad_param);
      return 1;
    }
    return 1;
  }

  void commitParams() override {
    if (instance_ == nullptr) {
      return;
    }

    for (int pad = 0; pad < PAD_NUM_PADS; ++pad) {
      const int base = pad * kPadParamCount;
      pad_instance_set_osc_a_wave(instance_, pad, clampedRounded(params_[base + kOscAWave], 0, 3));
      pad_instance_set_osc_a_octave(instance_, pad, roundedInt(params_[base + kOscAOctave]));
      pad_instance_set_osc_a_detune(instance_, pad, params_[base + kOscADetune]);
      pad_instance_set_osc_a_level(instance_, pad, params_[base + kOscALevel]);
      pad_instance_set_osc_b_wave(instance_, pad, clampedRounded(params_[base + kOscBWave], 0, 3));
      pad_instance_set_osc_b_octave(instance_, pad, roundedInt(params_[base + kOscBOctave]));
      pad_instance_set_osc_b_detune(instance_, pad, params_[base + kOscBDetune]);
      pad_instance_set_osc_b_level(instance_, pad, params_[base + kOscBLevel]);
      pad_instance_set_osc_mix(instance_, pad, params_[base + kOscMix]);
      pad_instance_set_sub_enabled(instance_, pad, params_[base + kSubEnabled] > 0.5f ? 1 : 0);
      pad_instance_set_sub_octave(instance_, pad, roundedInt(params_[base + kSubOctave]));
      pad_instance_set_sub_wave(instance_, pad, clampedRounded(params_[base + kSubWave], 0, 3));
      pad_instance_set_sub_level(instance_, pad, params_[base + kSubLevel]);
      pad_instance_set_noise_type(instance_, pad, clampedRounded(params_[base + kNoiseType], 0, 1));
      pad_instance_set_noise_level(instance_, pad, params_[base + kNoiseLevel]);
      pad_instance_set_hardness(instance_, pad, params_[base + kHardness]);
      pad_instance_set_warmth(instance_, pad, params_[base + kWarmth]);
      pad_instance_set_presence(instance_, pad, params_[base + kPresence]);
      pad_instance_set_fold_amount(instance_, pad, params_[base + kFoldAmount]);
      pad_instance_set_fold_mode(instance_, pad, clampedRounded(params_[base + kFoldMode], 0, 2));
      pad_instance_set_filter_type(instance_, pad, clampedRounded(params_[base + kFilterType], 0, 3));
      pad_instance_set_filter_cutoff_min(instance_, pad, params_[base + kFilterCutoffMin]);
      pad_instance_set_filter_cutoff_max(instance_, pad, params_[base + kFilterCutoffMax]);
      pad_instance_set_filter_resonance(instance_, pad, params_[base + kFilterResonance]);
      pad_instance_set_filter_q(instance_, pad, params_[base + kFilterQ]);
      pad_instance_set_filter_slope(instance_, pad, params_[base + kFilterSlope]);
      pad_instance_set_filter_key_tracking(instance_, pad, params_[base + kFilterKeyTracking]);
      pad_instance_set_filter_b_enabled(instance_, pad, params_[base + kFilterBEnabled] > 0.5f ? 1 : 0);
      pad_instance_set_filter_b_type(instance_, pad, clampedRounded(params_[base + kFilterBType], 0, 3));
      pad_instance_set_filter_b_cutoff(instance_, pad, params_[base + kFilterBCutoff]);
      pad_instance_set_filter_b_resonance(instance_, pad, params_[base + kFilterBResonance]);
      pad_instance_set_filter_b_q(instance_, pad, params_[base + kFilterBQ]);
      pad_instance_set_filter_routing(instance_, pad, clampedRounded(params_[base + kFilterRouting], 0, 2));
      pad_instance_set_attack(instance_, pad, params_[base + kAttack]);
      pad_instance_set_decay(instance_, pad, params_[base + kDecay]);
      pad_instance_set_sustain(instance_, pad, params_[base + kSustain]);
      pad_instance_set_release(instance_, pad, params_[base + kRelease]);
      pad_instance_set_lfo1_rate(instance_, pad, params_[base + kLfo1Rate]);
      pad_instance_set_lfo1_depth(instance_, pad, params_[base + kLfo1Depth]);
      pad_instance_set_lfo1_wave(instance_, pad, clampedRounded(params_[base + kLfo1Wave], 0, 6));
      pad_instance_set_lfo1_dest(instance_, pad, clampedRounded(params_[base + kLfo1Dest], 0, 6));
      pad_instance_set_lfo2_rate(instance_, pad, params_[base + kLfo2Rate]);
      pad_instance_set_lfo2_depth(instance_, pad, params_[base + kLfo2Depth]);
      pad_instance_set_lfo2_wave(instance_, pad, clampedRounded(params_[base + kLfo2Wave], 0, 6));
      pad_instance_set_lfo2_dest(instance_, pad, clampedRounded(params_[base + kLfo2Dest], 0, 6));
      pad_instance_set_mod_env_enabled(instance_, pad, params_[base + kModEnvEnabled] > 0.5f ? 1 : 0);
      pad_instance_set_mod_env_attack(instance_, pad, params_[base + kModEnvAttack]);
      pad_instance_set_mod_env_decay(instance_, pad, params_[base + kModEnvDecay]);
      pad_instance_set_mod_env_sustain(instance_, pad, params_[base + kModEnvSustain]);
      pad_instance_set_mod_env_release(instance_, pad, params_[base + kModEnvRelease]);
      pad_instance_set_mod_env_depth(instance_, pad, params_[base + kModEnvDepth]);
      pad_instance_set_mod_env_dest(instance_, pad, clampedRounded(params_[base + kModEnvDest], 0, 6));
      pad_instance_set_level(instance_, pad, params_[base + kLevel]);
    }

    pad_instance_set_reverb_send(instance_, params_[kParamReverbSend]);
  }

  int noteOn(float frequency, float velocity, float hold_seconds, int lead_index) override {
    (void)hold_seconds;
    if (
        instance_ == nullptr ||
        !std::isfinite(frequency) ||
        !std::isfinite(velocity) ||
        frequency <= 0.0f ||
        velocity < 0.0f) {
      return 0;
    }

    const int route = std::max(0, lead_index);
    const int voice = route % PAD_NUM_VOICES;
    const int pad = std::clamp(route / PAD_VOICES_PER_PAD, 0, PAD_NUM_PADS - 1);
    pad_instance_set_voice_pad(instance_, voice, pad);
    pad_instance_note_on(instance_, voice, frequency, velocity);
    return 1;
  }

  int setSourceMacros(int source_index, float morph, float distance, float expression) override {
    if (instance_ == nullptr || source_index < 0 || source_index >= PAD_NUM_PADS) {
      return 0;
    }
    const float m = clampUnit(morph);
    const float d = clampUnit(distance);
    const float e = clampUnit(expression);
    const int base = source_index * kPadParamCount;

    params_[base + kHardness] = 0.05f + m * 0.45f;
    params_[base + kWarmth] = std::clamp(0.82f - d * 0.42f + (1.0f - m) * 0.08f, 0.0f, 1.0f);
    params_[base + kPresence] = std::clamp(0.22f + e * 0.58f + m * 0.16f, 0.0f, 1.0f);
    params_[base + kFoldAmount] = m * m * 0.32f;
    params_[base + kFilterCutoffMax] = std::clamp(900.0f + e * 4200.0f + m * 3200.0f, 400.0f, 12000.0f);
    params_[base + kFilterResonance] = std::clamp(0.04f + d * 0.32f, 0.0f, 0.95f);
    params_[base + kLfo1Rate] = 0.04f + d * 0.45f;
    params_[base + kLfo1Depth] = m * 0.14f;
    params_[base + kLevel] = std::clamp(0.35f + e * 0.65f, 0.0f, 1.2f);

    pad_instance_set_hardness(instance_, source_index, params_[base + kHardness]);
    pad_instance_set_warmth(instance_, source_index, params_[base + kWarmth]);
    pad_instance_set_presence(instance_, source_index, params_[base + kPresence]);
    pad_instance_set_fold_amount(instance_, source_index, params_[base + kFoldAmount]);
    pad_instance_set_filter_cutoff_max(instance_, source_index, params_[base + kFilterCutoffMax]);
    pad_instance_set_filter_resonance(instance_, source_index, params_[base + kFilterResonance]);
    pad_instance_set_lfo1_rate(instance_, source_index, params_[base + kLfo1Rate]);
    pad_instance_set_lfo1_depth(instance_, source_index, params_[base + kLfo1Depth]);
    pad_instance_set_level(instance_, source_index, params_[base + kLevel]);
    return 1;
  }

  int setSourcePresetPatch(int source_index, const KesshoSourcePresetPatch& patch) override {
    if (instance_ == nullptr || source_index < 0 || source_index >= PAD_NUM_PADS) {
      return 0;
    }

    const int base = source_index * kPadParamCount;
    if (patch.exact_pad_param_count == KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
      for (int i = 0; i < kPadParamCount; ++i) {
        params_[base + i] = patch.exact_pad_params[i];
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

    params_[base + kOscAWave] =
        tone > 0.72f ? PAD_WAVE_SAWTOOTH : tone < 0.22f ? PAD_WAVE_SINE : PAD_WAVE_TRIANGLE;
    params_[base + kOscBWave] =
        texture > 0.72f ? PAD_WAVE_SQUARE : brightness > 0.68f ? PAD_WAVE_SINE : PAD_WAVE_TRIANGLE;
    params_[base + kOscBDetune] = 2.0f + texture * 22.0f;
    params_[base + kOscALevel] = std::clamp(0.42f + body * 0.42f + brightness * 0.16f, 0.0f, 1.0f);
    params_[base + kOscBLevel] = std::clamp(0.18f + texture * 0.42f + brightness * 0.18f, 0.0f, 1.0f);
    params_[base + kSubEnabled] = body > 0.64f ? 1.0f : 0.0f;
    params_[base + kSubLevel] = std::clamp(0.08f + body * 0.55f, 0.0f, 1.0f);
    params_[base + kNoiseType] = texture > 0.55f ? 1.0f : 0.0f;
    params_[base + kNoiseLevel] = std::clamp(0.02f + texture * 0.18f + transient * 0.08f, 0.0f, 0.6f);
    params_[base + kHardness] = std::clamp(tone * 0.54f + transient * 0.2f, 0.0f, 1.0f);
    params_[base + kWarmth] = std::clamp(0.22f + body * 0.62f - brightness * 0.18f, 0.0f, 1.0f);
    params_[base + kPresence] = std::clamp(0.18f + brightness * 0.62f + transient * 0.16f, 0.0f, 1.0f);
    params_[base + kFoldAmount] = std::clamp(texture * transient * 0.55f, 0.0f, 1.0f);
    params_[base + kFoldMode] =
        texture > 0.72f ? PAD_FOLD_SERGE : texture > 0.42f ? PAD_FOLD_SINE : PAD_FOLD_BUCHLA;
    params_[base + kFilterType] =
        brightness > 0.78f ? PAD_FILTER_HP : tone > 0.65f ? PAD_FILTER_BP : PAD_FILTER_LP;
    params_[base + kFilterCutoffMin] = std::clamp(80.0f + body * 460.0f + brightness * 220.0f, 20.0f, 20000.0f);
    params_[base + kFilterCutoffMax] =
        std::clamp(850.0f + brightness * 8400.0f + tone * 1800.0f, 80.0f, 20000.0f);
    params_[base + kFilterResonance] = std::clamp(0.04f + texture * 0.32f + transient * 0.18f, 0.0f, 0.95f);
    params_[base + kFilterQ] = std::clamp(0.55f + texture * 2.4f, 0.1f, 8.0f);
    params_[base + kAttack] = 0.01f + attack * 0.8f;
    params_[base + kDecay] = 0.25f + (1.0f - transient) * 2.8f;
    params_[base + kSustain] = std::clamp(0.42f + body * 0.42f, 0.0f, 1.0f);
    params_[base + kRelease] = 0.35f + release * 15.0f;
    params_[base + kLfo1Rate] = 0.03f + motion * 1.1f;
    params_[base + kLfo1Depth] = motion * (0.04f + texture * 0.16f);
    params_[base + kLfo1Wave] = motion > 0.66f ? PAD_LFO_RANDOM_WALK : PAD_LFO_TRIANGLE;
    params_[base + kLfo1Dest] = texture > 0.55f ? PAD_DEST_FOLD_AMOUNT : PAD_DEST_FILTER_CUTOFF;
    params_[base + kModEnvEnabled] = transient > 0.18f ? 1.0f : 0.0f;
    params_[base + kModEnvAttack] = 0.02f + attack * 0.45f;
    params_[base + kModEnvDecay] = 0.35f + transient * 1.6f;
    params_[base + kModEnvDepth] = transient * 0.75f;
    params_[base + kModEnvDest] = PAD_DEST_FILTER_CUTOFF;

    commitParams();
    return 1;
  }

  int noteOff(int voice_index) override {
    if (instance_ == nullptr || voice_index < 0 || voice_index >= PAD_NUM_VOICES) {
      return 0;
    }

    pad_instance_note_off(instance_, voice_index);
    return 1;
  }

  int killVoice(int voice_index) override {
    if (instance_ == nullptr || voice_index < 0 || voice_index >= PAD_NUM_VOICES) {
      return 0;
    }

    pad_instance_kill_voice(instance_, voice_index);
    return 1;
  }

  void allNotesOff() override {
    if (instance_ == nullptr) {
      return;
    }

    for (int voice = 0; voice < PAD_NUM_VOICES; ++voice) {
      pad_instance_note_off(instance_, voice);
    }
  }

  int activeVoiceCount() override {
    return instance_ != nullptr ? pad_instance_get_active_count(instance_) : 0;
  }

  void advancePadIdleTelemetry(int source_index, int frames) override {
    if (instance_ == nullptr || source_index < 0 || source_index >= PAD_NUM_PADS || frames <= 0) {
      return;
    }
    pad_instance_advance_idle_telemetry(instance_, source_index, std::min(frames, max_block_size_));
  }

  float currentPadFilterFrequency(int source_index) override {
    if (instance_ == nullptr || source_index < 0 || source_index >= PAD_NUM_PADS) {
      return 0.0f;
    }
    return pad_instance_get_current_filter_freq(instance_, source_index);
  }

  float currentPadLfoValue(int source_index) override {
    if (instance_ == nullptr || source_index < 0 || source_index >= PAD_NUM_PADS) {
      return 0.0f;
    }
    return pad_instance_get_current_lfo1_value(instance_, source_index);
  }

private:
  void applyPadParam(int pad, int pad_param) {
    if (instance_ == nullptr || pad < 0 || pad >= PAD_NUM_PADS) {
      return;
    }
    const int base = pad * kPadParamCount;
    switch (pad_param) {
      case kOscAWave:
        pad_instance_set_osc_a_wave(instance_, pad, clampedRounded(params_[base + kOscAWave], 0, 3));
        break;
      case kOscAOctave:
        pad_instance_set_osc_a_octave(instance_, pad, roundedInt(params_[base + kOscAOctave]));
        break;
      case kOscADetune:
        pad_instance_set_osc_a_detune(instance_, pad, params_[base + kOscADetune]);
        break;
      case kOscALevel:
        pad_instance_set_osc_a_level(instance_, pad, params_[base + kOscALevel]);
        break;
      case kOscBWave:
        pad_instance_set_osc_b_wave(instance_, pad, clampedRounded(params_[base + kOscBWave], 0, 3));
        break;
      case kOscBOctave:
        pad_instance_set_osc_b_octave(instance_, pad, roundedInt(params_[base + kOscBOctave]));
        break;
      case kOscBDetune:
        pad_instance_set_osc_b_detune(instance_, pad, params_[base + kOscBDetune]);
        break;
      case kOscBLevel:
        pad_instance_set_osc_b_level(instance_, pad, params_[base + kOscBLevel]);
        break;
      case kOscMix:
        pad_instance_set_osc_mix(instance_, pad, params_[base + kOscMix]);
        break;
      case kSubEnabled:
        pad_instance_set_sub_enabled(instance_, pad, params_[base + kSubEnabled] > 0.5f ? 1 : 0);
        break;
      case kSubOctave:
        pad_instance_set_sub_octave(instance_, pad, roundedInt(params_[base + kSubOctave]));
        break;
      case kSubWave:
        pad_instance_set_sub_wave(instance_, pad, clampedRounded(params_[base + kSubWave], 0, 3));
        break;
      case kSubLevel:
        pad_instance_set_sub_level(instance_, pad, params_[base + kSubLevel]);
        break;
      case kNoiseType:
        pad_instance_set_noise_type(instance_, pad, clampedRounded(params_[base + kNoiseType], 0, 1));
        break;
      case kNoiseLevel:
        pad_instance_set_noise_level(instance_, pad, params_[base + kNoiseLevel]);
        break;
      case kHardness:
        pad_instance_set_hardness(instance_, pad, params_[base + kHardness]);
        break;
      case kWarmth:
        pad_instance_set_warmth(instance_, pad, params_[base + kWarmth]);
        break;
      case kPresence:
        pad_instance_set_presence(instance_, pad, params_[base + kPresence]);
        break;
      case kFoldAmount:
        pad_instance_set_fold_amount(instance_, pad, params_[base + kFoldAmount]);
        break;
      case kFoldMode:
        pad_instance_set_fold_mode(instance_, pad, clampedRounded(params_[base + kFoldMode], 0, 2));
        break;
      case kFilterType:
        pad_instance_set_filter_type(instance_, pad, clampedRounded(params_[base + kFilterType], 0, 3));
        break;
      case kFilterCutoffMin:
        pad_instance_set_filter_cutoff_min(instance_, pad, params_[base + kFilterCutoffMin]);
        break;
      case kFilterCutoffMax:
        pad_instance_set_filter_cutoff_max(instance_, pad, params_[base + kFilterCutoffMax]);
        break;
      case kFilterResonance:
        pad_instance_set_filter_resonance(instance_, pad, params_[base + kFilterResonance]);
        break;
      case kFilterQ:
        pad_instance_set_filter_q(instance_, pad, params_[base + kFilterQ]);
        break;
      case kFilterSlope:
        pad_instance_set_filter_slope(instance_, pad, params_[base + kFilterSlope]);
        break;
      case kFilterKeyTracking:
        pad_instance_set_filter_key_tracking(instance_, pad, params_[base + kFilterKeyTracking]);
        break;
      case kFilterBEnabled:
        pad_instance_set_filter_b_enabled(instance_, pad, params_[base + kFilterBEnabled] > 0.5f ? 1 : 0);
        break;
      case kFilterBType:
        pad_instance_set_filter_b_type(instance_, pad, clampedRounded(params_[base + kFilterBType], 0, 3));
        break;
      case kFilterBCutoff:
        pad_instance_set_filter_b_cutoff(instance_, pad, params_[base + kFilterBCutoff]);
        break;
      case kFilterBResonance:
        pad_instance_set_filter_b_resonance(instance_, pad, params_[base + kFilterBResonance]);
        break;
      case kFilterBQ:
        pad_instance_set_filter_b_q(instance_, pad, params_[base + kFilterBQ]);
        break;
      case kFilterRouting:
        pad_instance_set_filter_routing(instance_, pad, clampedRounded(params_[base + kFilterRouting], 0, 2));
        break;
      case kAttack:
        pad_instance_set_attack(instance_, pad, params_[base + kAttack]);
        break;
      case kDecay:
        pad_instance_set_decay(instance_, pad, params_[base + kDecay]);
        break;
      case kSustain:
        pad_instance_set_sustain(instance_, pad, params_[base + kSustain]);
        break;
      case kRelease:
        pad_instance_set_release(instance_, pad, params_[base + kRelease]);
        break;
      case kLfo1Rate:
        pad_instance_set_lfo1_rate(instance_, pad, params_[base + kLfo1Rate]);
        break;
      case kLfo1Depth:
        pad_instance_set_lfo1_depth(instance_, pad, params_[base + kLfo1Depth]);
        break;
      case kLfo1Wave:
        pad_instance_set_lfo1_wave(instance_, pad, clampedRounded(params_[base + kLfo1Wave], 0, 6));
        break;
      case kLfo1Dest:
        pad_instance_set_lfo1_dest(instance_, pad, clampedRounded(params_[base + kLfo1Dest], 0, 6));
        break;
      case kLfo2Rate:
        pad_instance_set_lfo2_rate(instance_, pad, params_[base + kLfo2Rate]);
        break;
      case kLfo2Depth:
        pad_instance_set_lfo2_depth(instance_, pad, params_[base + kLfo2Depth]);
        break;
      case kLfo2Wave:
        pad_instance_set_lfo2_wave(instance_, pad, clampedRounded(params_[base + kLfo2Wave], 0, 6));
        break;
      case kLfo2Dest:
        pad_instance_set_lfo2_dest(instance_, pad, clampedRounded(params_[base + kLfo2Dest], 0, 6));
        break;
      case kModEnvEnabled:
        pad_instance_set_mod_env_enabled(instance_, pad, params_[base + kModEnvEnabled] > 0.5f ? 1 : 0);
        break;
      case kModEnvAttack:
        pad_instance_set_mod_env_attack(instance_, pad, params_[base + kModEnvAttack]);
        break;
      case kModEnvDecay:
        pad_instance_set_mod_env_decay(instance_, pad, params_[base + kModEnvDecay]);
        break;
      case kModEnvSustain:
        pad_instance_set_mod_env_sustain(instance_, pad, params_[base + kModEnvSustain]);
        break;
      case kModEnvRelease:
        pad_instance_set_mod_env_release(instance_, pad, params_[base + kModEnvRelease]);
        break;
      case kModEnvDepth:
        pad_instance_set_mod_env_depth(instance_, pad, params_[base + kModEnvDepth]);
        break;
      case kModEnvDest:
        pad_instance_set_mod_env_dest(instance_, pad, clampedRounded(params_[base + kModEnvDest], 0, 6));
        break;
      case kLevel:
        pad_instance_set_level(instance_, pad, params_[base + kLevel]);
        break;
      default:
        break;
    }
  }

  int outputSelect() const {
    return clampedRounded(params_[kParamOutputSelect], 0, kPadOutputTapCount - 1);
  }

  const float* interleavedOutputTap(int tap_index) const {
    switch (tap_index) {
      case KESSHO_MODULE_TAP_REVERB_SEND:
        return pad_instance_get_reverb_send_ptr(instance_);
      case KESSHO_MODULE_TAP_PREFADER_PAD1:
        return pad_instance_get_prefader_pad1_ptr(instance_);
      case KESSHO_MODULE_TAP_PREFADER_PAD2:
        return pad_instance_get_prefader_pad2_ptr(instance_);
      case KESSHO_MODULE_TAP_POSTFADER_PAD1:
        return pad_instance_get_postfader_pad1_ptr(instance_);
      case KESSHO_MODULE_TAP_POSTFADER_PAD2:
        return pad_instance_get_postfader_pad2_ptr(instance_);
      default:
        return pad_instance_get_output_ptr(instance_);
    }
  }

  const float* selectedInterleavedOutput() const {
    return interleavedOutputTap(outputSelect());
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
    copyInterleavedTap(source, output_l, output_r, frames);
  }

  void copyOutputTap(int tap_index, float* output_l, float* output_r, int frames) {
    const float* source = interleavedOutputTap(tap_index);
    copyInterleavedTap(source, output_l, output_r, frames);
  }

  void copyInterleavedTap(const float* source, float* output_l, float* output_r, int frames) {
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

  KesshoPadInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kPadBlockSize;
  std::array<float, kParamCount> params_ = makeDefaultParams();
};

} // namespace

std::unique_ptr<IKesshoModule> createPadModule() {
  return std::make_unique<PadModule>();
}

} // namespace kessho::core
