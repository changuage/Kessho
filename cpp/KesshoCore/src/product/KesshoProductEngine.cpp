#include "KesshoCore/KesshoProductCore.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <memory>
#include <new>

#include "KesshoProductDefaults.h"
#include "KesshoProductParamIds.h"
#include "KesshoProductSchema.h"
#include "KesshoProductSchemaHash.h"
#include "KesshoCore/KesshoTypes.h"
#include "../modules/KesshoModule.h"
#include "kessho_drum.h"
#include "kessho_pad.h"

namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;
constexpr float kProductTuningA4Hz = 432.0f;
constexpr uint32_t kSourceCount = 7;
constexpr uint32_t kStemCount = 9;
constexpr uint32_t kMaxLaneCount = 16;
constexpr uint32_t kMaxScaleNotes = 8;
constexpr uint32_t kModuleTapCount = KESSHO_MODULE_MAX_OUTPUT_TAPS;
constexpr uint32_t kMaxModulationRanges = 96;
constexpr uint32_t kMaxRuntimeWalkTelemetry = 16;
constexpr uint32_t kMaxSoundscapeAssetRefs = 16;
constexpr uint32_t kGranularVoiceCount = 4;
constexpr uint32_t kSidechainTargetCount = 9;
constexpr uint32_t kGranularParamCount = 138;
constexpr uint32_t kGranularGlobalParamCount = 10;
constexpr uint32_t kGranularVoiceParamCount = 25;
constexpr uint32_t kGranularScaleCountParam = 110;
constexpr uint32_t kGranularScaleIntervalsParam = 111;
constexpr uint32_t kGranularChordCountParam = 123;
constexpr uint32_t kGranularChordPitchesParam = 124;
constexpr uint32_t kGranularChordBiasParam = 131;
constexpr uint32_t kGranularLegacyParamStart = 132;
constexpr uint32_t kPianoAssetIdBase = 7200;
constexpr uint32_t kPianoBaseMidi = 21;
constexpr uint32_t kPianoSampleCount = 64;
constexpr double kSampleAttackSeconds = 0.004;
constexpr double kSampleReleaseSeconds = 0.02;
constexpr double kLoopCrossfadeSeconds = 0.012;
constexpr uint32_t kSoundscapeRandomStartMinimumFrames = 64;
constexpr float kDefaultPadPostLpfHz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
constexpr float kDefaultPadStereoWidth = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
constexpr float kDefaultLeadPostLpfHz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
constexpr float kDefaultLeadStereoWidth = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
constexpr uint32_t kSoundscapeAssetOcean = 7101;
constexpr uint32_t kSoundscapeAssetBirds = 7102;
constexpr uint32_t kSoundscapeAssetFrogs = 7103;
constexpr uint32_t kSoundscapeAssetWater = 7104;
constexpr uint32_t kSoundscapeAssetBirds2 = 7105;
constexpr uint32_t kSoundscapeAssetInsects = 7106;
constexpr uint32_t kDynamicsCharacterParamCount = 82;

enum SidechainTargetIndex : uint32_t {
  kSidechainPad1 = 0,
  kSidechainPad2 = 1,
  kSidechainLead1 = 2,
  kSidechainLead2 = 3,
  kSidechainPiano = 4,
  kSidechainGranular = 5,
  kSidechainDelayA = 6,
  kSidechainDelayB = 7,
  kSidechainReverb = 8,
};

enum SidechainKeyId : uint32_t {
  kSidechainKeyOff = 0,
  kSidechainKeySub = 1,
  kSidechainKeyKick = 2,
  kSidechainKeyClick = 3,
  kSidechainKeyBeepHi = 4,
  kSidechainKeyBeepLo = 5,
  kSidechainKeyNoise = 6,
  kSidechainKeyMembrane = 7,
};

enum DynamicsModSourceIndex : uint32_t {
  kDynamicsModSourceSlow = 0,
  kDynamicsModSourceFlutter = 1,
  kDynamicsModSourceRandom = 2,
  kDynamicsModSourceEnv = 3,
  kDynamicsModSourceNoise = 4,
  kDynamicsModSourceCount = 5,
};

enum DynamicsModTargetIndex : uint32_t {
  kDynamicsModTargetWow = 0,
  kDynamicsModTargetFlutter = 1,
  kDynamicsModTargetLp = 2,
  kDynamicsModTargetWet = 3,
  kDynamicsModTargetDropout = 4,
  kDynamicsModTargetAlias = 5,
  kDynamicsModTargetCount = 6,
};

static_assert(
    KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_NOISE_ALIAS_ID -
            KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID + 1u ==
        kDynamicsModSourceCount * kDynamicsModTargetCount,
    "Dynamics modulation matrix Product Core param IDs must remain contiguous");

enum DynamicsCharacterParamIndex : uint32_t {
  kDynActive = 0,
  kDynAllpassActive = 1,
  kDynDry = 2,
  kDynWet = 3,
  kDynDegradeMix = 4,
  kDynDegradeAlias = 5,
  kDynDegradeGeneration = 6,
  kDynDegradeCorrosion = 7,
  kDynDegradeWear = 8,
  kDynNoiseGain = 9,
  kDynJitterDepth = 10,
  kDynRandomDriftFilterHz = 11,
  kDynRandomDriftDepth = 12,
  kDynBaseDelay = 13,
  kDynSpreadDelay = 14,
  kDynRandomDrift = 15,
  kDynRandomHoldRateHz = 16,
  kDynRandomHoldLag = 17,
  kDynRandomDelayDepth = 18,
  kDynRandomSpreadDelayDepth = 19,
  kDynRandomFilterDepth = 20,
  kDynRandomSpreadFilterDepth = 21,
  kDynDepth = 22,
  kDynRate = 23,
  kDynShallow = 24,
  kDynAbyss = 25,
  kDynStereo = 26,
  kDynDamage = 27,
  kDynMainPan = 28,
  kDynSpreadPan = 29,
  kDynMainDelayGain = 30,
  kDynSpreadDelayGain = 31,
  kDynWowFrequency = 32,
  kDynFlutterFrequency = 33,
  kDynFlutterRandomDepth = 34,
  kDynWowDepth = 35,
  kDynFlutterDepth = 36,
  kDynHighpassHz = 37,
  kDynHighpassQ = 38,
  kDynAllpassAFrequency = 39,
  kDynAllpassAQ = 40,
  kDynAllpassBFrequency = 41,
  kDynAllpassBQ = 42,
  kDynHeadBumpFrequency = 43,
  kDynHeadBumpQ = 44,
  kDynHeadBumpGain = 45,
  kDynDropoutFilterHz = 46,
  kDynDropoutDepth = 47,
  kDynDropoutGain = 48,
  kDynEnvFilterHz = 49,
  kDynEnvToLowpassGain = 50,
  kDynEnvToResonanceGain = 51,
  kDynEnvToWetGain = 52,
  kDynLowpassHz = 53,
  kDynLowpassQ = 54,
  kDynLowpassStage2Hz = 55,
  kDynLowpassStage2Q = 56,
  kDynCompressorThreshold = 57,
  kDynCompressorKnee = 58,
  kDynCompressorRatio = 59,
  kDynCompressorAttack = 60,
  kDynCompressorRelease = 61,
  kDynCompressorMakeup = 62,
  kDynSaturation = 63,
  kDynCorrosion = 64,
  kDynMasterSatActive = 65,
  kDynMasterSatMode = 66,
  kDynMasterSatDrive = 67,
  kDynMasterSatTone = 68,
  kDynMasterSatBias = 69,
  kDynEndCompActive = 70,
  kDynEndCompThreshold = 71,
  kDynEndCompKnee = 72,
  kDynEndCompRatio = 73,
  kDynEndCompAttack = 74,
  kDynEndCompRelease = 75,
  kDynEndCompMakeup = 76,
  kDynEndCompMix = 77,
  kDynEndCompDetectorHpHz = 78,
  kDynEndCompDetectorTilt = 79,
  kDynEndCompAutoMakeup = 80,
  kDynEndCompProgramRelease = 81,
};

float clampFloat(float value, float min_value, float max_value) {
  if (!std::isfinite(value)) {
    return min_value;
  }
  return std::min(max_value, std::max(min_value, value));
}

float scaleSourceDistance(float distance) {
  const float safe_distance = clampFloat(distance, 0.0f, 1.0f);
  return 1.0f - (1.0f - safe_distance) * (1.0f - safe_distance);
}

float anchoredDistanceValue(float distance, float start_value, float slight_value, float max_value) {
  constexpr float kSlightPoint = 0.25f;
  const float scaled = scaleSourceDistance(distance);
  if (scaled <= kSlightPoint) {
    const float head_t = kSlightPoint <= 0.0f ? 1.0f : scaled / kSlightPoint;
    return start_value + head_t * (slight_value - start_value);
  }
  const float tail_t = (scaled - kSlightPoint) / (1.0f - kSlightPoint);
  return slight_value + tail_t * (max_value - slight_value);
}

float distanceMultiply(float base, float distance, float slight_mul, float max_mul) {
  return base * anchoredDistanceValue(distance, 1.0f, slight_mul, max_mul);
}

float distanceAdd(float base, float distance, float slight_delta, float max_delta) {
  return base + anchoredDistanceValue(distance, 0.0f, slight_delta, max_delta);
}

uint32_t clampU32(uint32_t value, uint32_t min_value, uint32_t max_value) {
  return std::min(max_value, std::max(min_value, value));
}

float midiToFrequency(float midi_note) {
  return kProductTuningA4Hz * std::pow(2.0f, (midi_note - 69.0f) / 12.0f);
}

float dbToGain(float db) {
  return std::pow(10.0f, db / 20.0f);
}

float unitToLogFrequency(float value, float min_hz, float max_hz) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return min_hz * std::pow(max_hz / min_hz, t);
}

uint32_t hashU32(uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352du;
  value ^= value >> 15;
  value *= 0x846ca68bu;
  value ^= value >> 16;
  return value;
}

float hashUnit(uint32_t value) {
  return static_cast<float>(hashU32(value) & 0x00ffffffu) / static_cast<float>(0x01000000u);
}

int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

uint32_t positiveModulo(int32_t value, uint32_t modulo) {
  const int32_t signed_modulo = static_cast<int32_t>(modulo);
  int32_t result = value % signed_modulo;
  if (result < 0) {
    result += signed_modulo;
  }
  return static_cast<uint32_t>(result);
}

bool euclidHit(uint32_t step, uint32_t steps, uint32_t fills, int32_t rotation) {
  if (steps == 0 || fills == 0) {
    return false;
  }
  if (fills >= steps) {
    return true;
  }

  const uint32_t rotated = positiveModulo(static_cast<int32_t>(step) - rotation, steps);
  return (rotated * fills) % steps < fills;
}

uint32_t scaleIntervals(uint32_t scale_id, int intervals[kMaxScaleNotes]) {
  switch (scale_id) {
    case 2:
      intervals[0] = 0;
      intervals[1] = 2;
      intervals[2] = 3;
      intervals[3] = 5;
      intervals[4] = 7;
      intervals[5] = 8;
      intervals[6] = 10;
      return 7;
    case 3:
      intervals[0] = 0;
      intervals[1] = 2;
      intervals[2] = 4;
      intervals[3] = 7;
      intervals[4] = 9;
      return 5;
    case 4:
      intervals[0] = 0;
      intervals[1] = 1;
      intervals[2] = 5;
      intervals[3] = 7;
      intervals[4] = 8;
      return 5;
    case 1:
    default:
      intervals[0] = 0;
      intervals[1] = 2;
      intervals[2] = 4;
      intervals[3] = 5;
      intervals[4] = 7;
      intervals[5] = 9;
      intervals[6] = 11;
      return 7;
  }
}

struct ProductTransport {
  uint64_t sample_frame = 0;
  bool running = false;
  float bpm = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BPM;
  uint32_t beats_per_bar = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR;
  uint32_t bars_per_phrase = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE;
  float swing = 0.0f;

  void reset() {
    sample_frame = 0;
  }

  double samplesPerBeat(double sample_rate) const {
    return sample_rate * 60.0 / std::max(1.0f, bpm);
  }

  double beatPosition(double sample_rate) const {
    return static_cast<double>(sample_frame) / samplesPerBeat(sample_rate);
  }

  uint64_t barIndex(double sample_rate) const {
    const double beats = beatPosition(sample_rate);
    return static_cast<uint64_t>(beats / std::max(1u, beats_per_bar));
  }

  uint64_t barIndexAt(double sample_rate, uint64_t sample) const {
    const double beats = static_cast<double>(sample) / samplesPerBeat(sample_rate);
    return static_cast<uint64_t>(beats / std::max(1u, beats_per_bar));
  }

  uint64_t phraseIndex(double sample_rate) const {
    return barIndex(sample_rate) / std::max(1u, bars_per_phrase);
  }

  uint64_t phraseIndexAt(double sample_rate, uint64_t sample) const {
    return barIndexAt(sample_rate, sample) / std::max(1u, bars_per_phrase);
  }
};

struct HarmonyState {
  float root_midi = 60.0f;
  uint32_t scale_id = 1;
  float tension = 0.35f;
  uint32_t chord_mode = 0;
  uint32_t voicing_mode = 0;
  uint32_t chord_degree = 0;
  float chord_midi[4] = {60.0f, 64.0f, 67.0f, 72.0f};
};

struct SourceState {
  bool enabled = true;
  uint32_t source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  uint32_t preset_id = 0;
  uint32_t asset_id = 0;
  uint32_t asset_refs[kMaxSoundscapeAssetRefs]{};
  uint32_t asset_ref_count = 0;
  uint32_t last_missing_asset_id = 0;
  float level = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_LEVEL;
  float morph = 0.0f;
  float distance = 0.0f;
  float expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  float dry_gain = 1.0f;
  float reverb_send = 0.12f;
  float delay_a_send = 0.0f;
  float delay_b_send = 0.0f;
  float granular_send = 0.0f;
  float post_lpf_hz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
  float stereo_width = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
  float post_lpf_key_tracking = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING;
  float post_lpf_tracking_midi = 60.0f;
  float hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
  uint32_t exact_pad_param_count = 0u;
  float exact_pad_params[kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT]{};
  uint32_t exact_lead_param_count = 0u;
  float exact_lead_params[kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT]{};
  uint32_t exact_drum_param_count = 0u;
  float exact_drum_params[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT]{};
  uint32_t drum_voice_preset_a_ids[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
  uint32_t drum_voice_preset_b_ids[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
  float drum_voice_morphs[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
};

struct BiquadState {
  float x1 = 0.0f;
  float x2 = 0.0f;
  float y1 = 0.0f;
  float y2 = 0.0f;
};

struct PadPostChainState {
  float post_lpf_hz = kDefaultPadPostLpfHz;
  float stereo_width = kDefaultPadStereoWidth;
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  BiquadState left{};
  BiquadState right{};
};

struct LeadPostChainState {
  float post_lpf_hz = kDefaultLeadPostLpfHz;
  float stereo_width = kDefaultLeadStereoWidth;
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  BiquadState stage1_left{};
  BiquadState stage1_right{};
  BiquadState stage2_left{};
  BiquadState stage2_right{};
};

struct StepValueSubLaneConfig {
  bool enabled = false;
  uint32_t steps = 0;
  uint32_t direction = KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD;
};

struct GranularVoiceState {
  bool enabled = false;
  uint32_t mode = 1;
  uint32_t slice = 0;
  float speed = 1.0f;
  float scan_rate = 1.0f;
  bool reverse = false;
  float pitch = 0.0f;
  float write_follow = 0.0f;
  float density = 20.0f;
  float grain_size_ms = 80.0f;
  float spray = 0.3f;
  float grain_octave_probability = 0.0f;
  float attack_seconds = 0.003f;
  float decay_seconds = 0.5f;
  float gain = 0.5f;
  float pan = 0.0f;
  float blur = 0.0f;
  float stereo_spread = 0.5f;
  float position_lfo_rate = 0.0f;
  float position_lfo_depth = 0.0f;
  float pan_lfo_rate = 0.0f;
  float reverse_lfo_rate = 0.0f;
  float record_lfo_rate = 0.0f;
  bool euclid_gated = false;
  bool euclid_muted = false;
};

struct FxState {
  float granular_mix = 0.0f;
  bool granular_enabled = false;
  bool granular_freeze = false;
  bool granular_freeze_with_feedback = false;
  float granular_feedback = 0.1f;
  float granular_feedback_lpf_hz = 8000.0f;
  float granular_buffer_seconds = 16.0f;
  uint32_t granular_grain_shape = 0;
  float granular_bus_diffusion = 0.0f;
  float granular_timing_randomness = 0.35f;
  float granular_chord_bias = 0.0f;
  float granular_legacy_jitter_ms = 10.0f;
  float granular_legacy_probability = 0.8f;
  uint32_t granular_legacy_pitch_mode = 1;
  float granular_legacy_pitch_spread = 2.0f;
  uint32_t granular_legacy_max_grains = 64;
  float granular_legacy_feedback = 0.1f;
  GranularVoiceState granular_voices[kGranularVoiceCount]{};
  bool delay_a_enabled = true;
  float delay_a_time_left_ms = 500.0f;
  float delay_a_time_right_ms = 375.0f;
  float delay_a_feedback = 0.4f;
  float delay_a_mix = 0.0f;
  float delay_a_filter_hz = 2000.0f;
  uint32_t delay_a_filter_type = 0;
  float delay_a_mod_rate_hz = 0.0f;
  float delay_a_mod_depth_ms = 0.0f;
  bool delay_a_ping_pong = false;
  float delay_a_duck = 0.0f;
  float delay_a_width = 0.5f;
  float delay_a_cross_feed_filter_hz = 8000.0f;
  bool delay_b_enabled = false;
  float delay_b_activity = 0.3f;
  float delay_b_repeats = 0.3f;
  float delay_b_base_time_ms = 500.0f;
  float delay_b_tone = 0.5f;
  float delay_b_vibrato = 0.0f;
  float delay_b_mix = 0.0f;
  uint32_t delay_b_space_mode = 0;
  uint32_t delay_b_pattern = 0;
  uint32_t delay_b_warp = 0;
  float delay_b_warp_intensity = 0.5f;
  float delay_b_spread = 0.5f;
  float reverb_mix = 0.12f;
  uint32_t reverb_type = 2;
  uint32_t reverb_quality = 1;
  float reverb_decay = 0.9f;
  float reverb_size = 2.0f;
  float reverb_damping = 0.2f;
  float reverb_diffusion = 1.0f;
  float reverb_modulation = 0.4f;
  float reverb_predelay_ms = 60.0f;
  float reverb_width = 0.85f;
  float reverb_shimmer_amount = 0.0f;
  float reverb_shimmer_pitch = 12.0f;
  float reverb_slow_rate_hz = 0.05f;
  float reverb_slow_depth = 0.0f;
  float reverb_reverse_amount = 0.0f;
  float reverb_reverse_length_sec = 2.0f;
  float reverb_chorus_rate_hz = 0.5f;
  float reverb_chorus_depth = 12.0f;
  uint32_t reverb_mod_character = 2;
  float reverb_damp_low = 0.1f;
  float reverb_damp_high = 0.3f;
  float reverb_crossover_hz = 800.0f;
  float reverb_input_tone = 0.0f;
  float reverb_shimmer_feedback = 0.0f;
  float reverb_warp = 0.0f;
  float reverb_cross_feed = 0.0f;
  float reverb_early_reflections = 0.3f;
  float reverb_air_absorption = 0.2f;
  uint32_t reverb_saturation_mode = 0;
  float reverb_transient_smooth = 0.0f;
  float reverb_er_lp_freq = 2500.0f;
  float reverb_pre_comp_threshold = -36.0f;
  float reverb_pre_comp_knee = 20.0f;
  float reverb_pre_comp_ratio = 5.0f;
  float reverb_pre_comp_attack_ms = 0.7f;
  float reverb_pre_comp_release_ms = 700.0f;
  float reverb_pre_comp_makeup = 2.9f;
  float spectral_freeze_mix = 0.0f;
  bool spectral_freeze_enabled = false;
  bool spectral_freeze_active = false;
  bool spectral_freeze_slushy = false;
  float spectral_freeze_speed = 0.3f;
  float spectral_freeze_decay = 1.0f;
  float spectral_freeze_phase_jitter = 0.0f;
  float dynamics_drive = 0.0f;
  bool dynamics_enabled = false;
  bool dynamics_character_enabled = false;
  uint32_t dynamics_character_mode = 0;
  float dynamics_character_mix = 0.0f;
  float dynamics_character_age = 0.0f;
  float dynamics_character_bias = 0.5f;
  float dynamics_character_lpg_amount = 0.5f;
  float dynamics_character_resonance = 0.2f;
  float dynamics_character_stereo = 0.5f;
  float dynamics_character_env_follow = 0.0f;
  float dynamics_character_depth = 0.0f;
  float dynamics_character_rate = 0.3f;
  float dynamics_character_damp = 0.5f;
  bool dynamics_degrade_enabled = false;
  float dynamics_degrade_mix = 0.0f;
  float dynamics_degrade_age = 0.0f;
  float dynamics_degrade_generation = 0.0f;
  float dynamics_degrade_alias = 0.0f;
  float dynamics_degrade_wow = 0.0f;
  float dynamics_degrade_flutter = 0.0f;
  float dynamics_degrade_drift = 0.0f;
  float dynamics_degrade_wobble_speed = 0.35f;
  float dynamics_degrade_tone = 0.5f;
  float dynamics_degrade_hp = 0.0f;
  float dynamics_degrade_lp = 1.0f;
  float dynamics_degrade_noise = 0.0f;
  float dynamics_degrade_saturation = 0.0f;
  float dynamics_degrade_corrosion = 0.0f;
  float dynamics_mod[kDynamicsModSourceCount][kDynamicsModTargetCount]{
      {0.18f, 0.02f, 0.12f, 0.03f, 0.04f, 0.0f},
      {0.0f, 0.12f, 0.02f, 0.0f, 0.02f, 0.0f},
      {0.04f, 0.03f, 0.14f, 0.02f, 0.1f, 0.02f},
      {0.0f, 0.0f, 0.08f, 0.04f, 0.0f, 0.0f},
      {0.0f, 0.06f, 0.02f, 0.0f, 0.06f, 0.02f},
  };
  bool dynamics_saturation_enabled = false;
  uint32_t dynamics_saturation_mode = 0;
  float dynamics_saturation_drive = 0.0f;
  float dynamics_saturation_tone = 0.5f;
  float dynamics_saturation_bias = 0.5f;
  bool dynamics_end_comp_enabled = false;
  float dynamics_end_comp_threshold = -18.0f;
  float dynamics_end_comp_knee = 12.0f;
  float dynamics_end_comp_ratio = 2.0f;
  float dynamics_end_comp_attack_ms = 10.0f;
  float dynamics_end_comp_release_ms = 180.0f;
  float dynamics_end_comp_makeup = 1.0f;
  float dynamics_end_comp_mix = 1.0f;
  float dynamics_end_comp_detector_hp = 0.25f;
  float dynamics_end_comp_detector_tilt = 0.5f;
  float dynamics_end_comp_auto_makeup = 0.7f;
  float dynamics_end_comp_program_release = 0.65f;
  bool sidechain_enabled = false;
  uint32_t sidechain_key_a = kSidechainKeyKick;
  uint32_t sidechain_key_b = kSidechainKeyOff;
  float sidechain_key_a_weight = 1.0f;
  float sidechain_key_b_weight = 0.7f;
  float sidechain_amount = 0.5f;
  float sidechain_threshold = -24.0f;
  float sidechain_ratio = 4.0f;
  float sidechain_knee = 6.0f;
  float sidechain_attack_ms = 5.0f;
  float sidechain_hold_ms = 20.0f;
  float sidechain_release_ms = 180.0f;
  float sidechain_makeup = 1.0f;
  float sidechain_mix = 1.0f;
  float sidechain_curve = 0.5f;
  float sidechain_detector_hp = 0.0f;
  float sidechain_detector_lp = 1.0f;
  float sidechain_targets[kSidechainTargetCount]{};
};

struct SidechainEnvelope {
  float current_gain = 1.0f;
  float start_gain = 1.0f;
  float target_gain = 1.0f;
  uint32_t attack_elapsed = 0u;
  uint32_t attack_frames = 0u;
  uint32_t hold_remaining = 0u;
  uint32_t release_elapsed = 0u;
  uint32_t release_frames = 0u;
};

struct RoutingState {
  float delay_a_to_delay_b = 0.0f;
  float delay_b_to_delay_a = 0.0f;
  float delay_to_reverb = 0.2f;
  float granular_to_reverb = 0.15f;
  float delay_a_to_granular = 0.0f;
  float delay_b_to_granular = 0.0f;
  float delay_b_to_reverb = 0.4f;
};

uint32_t defaultSourcePresetId(uint32_t source_id) {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
    case KESSHO_PRODUCT_SOURCE_DRUM:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT;
    case KESSHO_PRODUCT_SOURCE_SOUNDSCAPE:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_OCEAN_SAMPLE;
    default:
      return 0u;
  }
}

const kessho::product::generated::KesshoProductGeneratedSourcePreset* findSourcePreset(uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* findDrumVoicePreset(
    uint32_t voice_index,
    uint32_t preset_id) {
  const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* fallback = nullptr;
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICE_PRESETS) {
    if (preset.voice_index != voice_index) {
      continue;
    }
    if (preset.id == preset_id) {
      return &preset;
    }
    if (fallback == nullptr || preset.default_for_voice != 0u) {
      fallback = &preset;
    }
  }
  return fallback;
}

float smoothstep01(float value) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

bool drumParamUsesPresetSnap(uint32_t param_index) {
  return param_index == 32u || param_index == 82u || param_index == 96u;
}

kessho::core::KesshoSourcePresetPatch sourcePresetPatch(
    const kessho::product::generated::KesshoProductGeneratedSourcePreset* preset) {
  kessho::core::KesshoSourcePresetPatch patch{};
  if (preset == nullptr) {
    return patch;
  }
  patch.tone = clampFloat(preset->profile_tone, 0.0f, 1.0f);
  patch.brightness = clampFloat(preset->profile_brightness, 0.0f, 1.0f);
  patch.texture = clampFloat(preset->profile_texture, 0.0f, 1.0f);
  patch.motion = clampFloat(preset->profile_motion, 0.0f, 1.0f);
  patch.attack = clampFloat(preset->profile_attack, 0.0f, 1.0f);
  patch.release = clampFloat(preset->profile_release, 0.0f, 1.0f);
  patch.body = clampFloat(preset->profile_body, 0.0f, 1.0f);
  patch.transient = clampFloat(preset->profile_transient, 0.0f, 1.0f);
  patch.exact_pad_param_count = std::min<uint32_t>(
      preset->exact_pad_param_count,
      kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT);
  for (uint32_t i = 0; i < patch.exact_pad_param_count; ++i) {
    patch.exact_pad_params[i] = preset->exact_pad_params[i];
  }
  patch.exact_lead_param_count = std::min<uint32_t>(
      preset->exact_lead_param_count,
      kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT);
  for (uint32_t i = 0; i < patch.exact_lead_param_count; ++i) {
    patch.exact_lead_params[i] = preset->exact_lead_params[i];
  }
  patch.exact_drum_param_count = std::min<uint32_t>(
      preset->exact_drum_param_count,
      kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
  for (uint32_t i = 0; i < patch.exact_drum_param_count; ++i) {
    patch.exact_drum_params[i] = preset->exact_drum_params[i];
  }
  return patch;
}

float moduleSourceOutputTrim(uint32_t source_id) {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_OUTPUT_TRIM;
    default:
      return 1.0f;
  }
}

struct LaneState {
  bool enabled = false;
  uint32_t target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  uint32_t step_count = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_STEPS;
  uint32_t fill_count = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_FILLS;
  int32_t rotation = 0;
  uint32_t clock_division = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_CLOCK_DIVISION;
  float swing = 0.0f;
  float probability = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_PROBABILITY;
  uint32_t ratchet = 1;
  uint32_t trig_condition = KESSHO_PRODUCT_TRIG_ALWAYS;
  float midi_note = 60.0f;
  float velocity = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_VELOCITY;
  float hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_HOLD_SECONDS;
  float morph = 0.0f;
  float distance = 0.0f;
  float expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  uint32_t seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  bool bar_reset = true;
  bool phrase_reset = false;
  uint32_t manual_step_mask_low = 0;
  uint32_t manual_step_mask_high = 0;
  uint32_t step_override_set_low = 0;
  uint32_t step_override_set_high = 0;
  uint32_t step_override_value_low = 0;
  uint32_t step_override_value_high = 0;
  uint32_t probability_override_set_low = 0;
  uint32_t probability_override_set_high = 0;
  float probability_overrides[64]{};
  uint32_t ratchet_override_set_low = 0;
  uint32_t ratchet_override_set_high = 0;
  uint32_t ratchet_overrides[64]{};
  uint32_t trig_condition_override_set_low = 0;
  uint32_t trig_condition_override_set_high = 0;
  uint32_t trig_condition_numerators[64]{};
  uint32_t trig_condition_denominators[64]{};
  uint32_t midi_note_override_set_low = 0;
  uint32_t midi_note_override_set_high = 0;
  float midi_note_overrides[64]{};
  uint32_t expression_override_set_low = 0;
  uint32_t expression_override_set_high = 0;
  float expression_overrides[64]{};
  uint32_t morph_override_set_low = 0;
  uint32_t morph_override_set_high = 0;
  float morph_overrides[64]{};
  uint32_t distance_override_set_low = 0;
  uint32_t distance_override_set_high = 0;
  float distance_overrides[64]{};
  StepValueSubLaneConfig step_value_configs[8]{};
};

struct AssetSlot {
  bool active = false;
  uint32_t asset_id = 0;
  const float* channels[2]{};
  uint32_t channel_count = 0;
  uint32_t frame_count = 0;
  double sample_rate = 0.0;
  uint32_t flags = 0;
};

struct SoundscapeLayerPolicy {
  float level_base = 0.85f;
  float level_range = 0.15f;
  float pan_base = 0.2f;
  float pan_distance = 0.55f;
  float rate_depth = 0.02f;
};

struct Voice {
  bool active = false;
  uint32_t source_id = 0;
  uint32_t asset_slot = 0;
  bool sample_voice = false;
  bool drum_voice = false;
  bool looping = false;
  double phase = 0.0;
  double sample_position = 0.0;
  double sample_step = 1.0;
  float frequency = 0.0f;
  float amplitude = 0.0f;
  float pan = 0.0f;
  uint32_t age_frames = 0;
  uint32_t remaining_frames = 0;
  uint32_t total_frames = 1;
  float post_coeff_cutoff = -1.0f;
  float post_b0 = 1.0f;
  float post_b1 = 0.0f;
  float post_b2 = 0.0f;
  float post_a1 = 0.0f;
  float post_a2 = 0.0f;
  BiquadState post_left{};
  BiquadState post_right{};
};

struct ModulationRange {
  bool active = false;
  uint32_t control_id = 0;
  uint32_t target_id = 0;
  uint32_t param_id = 0;
  uint32_t mode = KESSHO_PRODUCT_MODULATION_RANGE_OFF;
  float min_value = 0.0f;
  float max_value = 0.0f;
  float current_value = 0.0f;
  float velocity = 0.0f;
  uint32_t seed = 1;
};

struct QueuedProductEvent {
  KesshoProductEvent event{};
  uint32_t sequence = 0;
};

struct SequencerBuffer {
  KesshoSequencerEvent events[kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS]{};
  uint32_t count = 0;

  void clear() {
    count = 0;
  }

  bool push(const KesshoSequencerEvent& event) {
    if (count >= kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS) {
      return false;
    }
    events[count++] = event;
    return true;
  }

  void sortByOffset() {
    for (uint32_t i = 1; i < count; ++i) {
      KesshoSequencerEvent key = events[i];
      uint32_t j = i;
      while (j > 0 && key.sample_offset < events[j - 1].sample_offset) {
        events[j] = events[j - 1];
        --j;
      }
      events[j] = key;
    }
  }
};

} // namespace

struct KesshoProductEngine {
  explicit KesshoProductEngine(double in_sample_rate, uint32_t in_max_block_size, uint32_t in_flags)
      : sample_rate(in_sample_rate), max_block_size(in_max_block_size), flags(in_flags) {
    modules_ready = prepareProductModules();
    loadDefaults();
  }

  double sample_rate = 48000.0;
  uint32_t max_block_size = 128;
  uint32_t flags = 0;
  ProductTransport transport{};
  HarmonyState harmony{};
  SourceState sources[kSourceCount]{};
  LaneState synth_lanes[kMaxLaneCount]{};
  LaneState drum_lanes[kMaxLaneCount]{};
  uint32_t synth_lane_count = 4;
  uint32_t drum_lane_count = 8;
  AssetSlot assets[kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS]{};
  Voice voices[kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES]{};
  ModulationRange modulation_ranges[kMaxModulationRanges]{};
  QueuedProductEvent control_events[kessho::product::generated::KESSHO_PRODUCT_MAX_CONTROL_EVENTS]{};
  uint32_t control_event_count = 0;
  uint32_t next_control_sequence = 1;
  SequencerBuffer sequencer_events{};
  KesshoProductTelemetry telemetry{};
  float stem_l[kStemCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float stem_r[kStemCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float silent_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float silent_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_tap_l[kModuleTapCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_tap_r[kModuleTapCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float reverb_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float reverb_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_a_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_a_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_b_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_b_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float granular_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float granular_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float sidechain_gains[kSidechainTargetCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  SidechainEnvelope sidechain_envelopes[kSidechainTargetCount]{};
  float reverb_pre_comp_gain = 1.0f;
  uint32_t last_stem_frames = 0;
  float master_gain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_GAIN;
  float master_limiter_ceiling_db = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB;
  float master_limiter_ceiling_gain = dbToGain(kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB);
  uint32_t master_saturation_mode = 0;
  float master_saturation_drive = 0.0f;
  float master_saturation_tone = 0.5f;
  FxState fx{};
  RoutingState routing{};
  uint32_t rng_seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t rng_state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  float evolution_amount = 0.0f;
  uint32_t evolution_state = 0u;
  bool journey_running = false;
  float journey_phase = 0.0f;
  float journey_rate_bars = 8.0f;
  bool modules_ready = false;
  std::unique_ptr<kessho::core::IKesshoModule> pad_module{};
  std::unique_ptr<kessho::core::IKesshoModule> lead_modules[2]{};
  std::unique_ptr<kessho::core::IKesshoModule> drum_module{};
  std::unique_ptr<kessho::core::IKesshoModule> delay_a_module{};
  std::unique_ptr<kessho::core::IKesshoModule> delay_b_module{};
  std::unique_ptr<kessho::core::IKesshoModule> reverb_module{};
  std::unique_ptr<kessho::core::IKesshoModule> granular_module{};
  std::unique_ptr<kessho::core::IKesshoModule> spectral_freeze_module{};
  std::unique_ptr<kessho::core::IKesshoModule> dynamics_character_module{};
  uint32_t pad_voice_cursors[2]{};
  uint32_t pad_voice_release_frames[PAD_NUM_PADS][PAD_NUM_VOICES]{};
  PadPostChainState pad_post_chains[PAD_NUM_PADS]{};
  LeadPostChainState lead_post_chains[2]{};

  bool prepareProductModules() {
    pad_module = kessho::core::createPadModule();
    lead_modules[0] = kessho::core::createLeadFmModule();
    lead_modules[1] = kessho::core::createLeadFmModule();
    drum_module = kessho::core::createDrumModule();
    delay_a_module = kessho::core::createDelayAModule();
    delay_b_module = kessho::core::createDelayBModule();
    reverb_module = kessho::core::createReverbModule();
    granular_module = kessho::core::createGranularModule();
    spectral_freeze_module = kessho::core::createSpectralFreezeModule();
    dynamics_character_module = kessho::core::createDynamicsCharacterModule();
    if (!pad_module || !lead_modules[0] || !lead_modules[1] || !drum_module ||
        !delay_a_module || !delay_b_module || !reverb_module || !granular_module ||
        !spectral_freeze_module || !dynamics_character_module) {
      return false;
    }
    if (!pad_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !lead_modules[0]->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !lead_modules[1]->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !drum_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !delay_a_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !delay_b_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !reverb_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !granular_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !spectral_freeze_module->prepare(sample_rate, static_cast<int>(max_block_size)) ||
        !dynamics_character_module->prepare(sample_rate, static_cast<int>(max_block_size))) {
      return false;
    }
    return true;
  }

  float dynamicsModRoute(const float sources[kDynamicsModSourceCount], uint32_t target) const {
    if (target >= kDynamicsModTargetCount) {
      return 0.0f;
    }
    float sum = 0.0f;
    for (uint32_t source = 0; source < kDynamicsModSourceCount; ++source) {
      sum += sources[source] * clampFloat(fx.dynamics_mod[source][target], 0.0f, 1.0f);
    }
    return clampFloat(sum, 0.0f, 1.0f);
  }

  void configureFxModules() {
    if (delay_a_module) {
      float* params = delay_a_module->params();
      if (params != nullptr && delay_a_module->paramCount() >= 16) {
        const bool active =
            fx.delay_a_enabled &&
            (fx.delay_a_mix > 0.0001f ||
             routing.delay_a_to_delay_b > 0.0001f ||
             routing.delay_to_reverb > 0.0001f ||
             routing.delay_a_to_granular > 0.0001f);
        params[0] = active ? 1.0f : 0.0f;
        params[1] = clampFloat(fx.delay_a_time_left_ms, 10.0f, 5000.0f);
        params[2] = clampFloat(fx.delay_a_time_right_ms, 10.0f, 5000.0f);
        params[3] = clampFloat(fx.delay_a_feedback, 0.0f, 0.95f);
        params[4] = clampFloat(fx.delay_a_mix, 0.0f, 1.0f);
        params[5] = clampFloat(fx.delay_a_filter_hz, 200.0f, 12000.0f);
        params[6] = static_cast<float>(clampU32(fx.delay_a_filter_type, 0u, 2u));
        params[7] = clampFloat(routing.delay_to_reverb, 0.0f, 1.0f);
        params[8] = clampFloat(fx.delay_a_mod_rate_hz, 0.0f, 5.0f);
        params[9] = clampFloat(fx.delay_a_mod_depth_ms, 0.0f, 50.0f);
        params[10] = fx.delay_a_ping_pong ? 1.0f : 0.0f;
        params[11] = clampFloat(fx.delay_a_duck, 0.0f, 1.0f);
        params[12] = clampFloat(fx.delay_a_width, 0.0f, 1.0f);
        params[13] = clampFloat(routing.delay_a_to_delay_b, 0.0f, 1.0f);
        params[14] = clampFloat(fx.delay_a_cross_feed_filter_hz, 200.0f, 12000.0f);
        params[15] = clampFloat(routing.delay_a_to_granular, 0.0f, 1.0f);
        delay_a_module->commitParams();
      }
    }
    if (delay_b_module) {
      float* params = delay_b_module->params();
      if (params != nullptr && delay_b_module->paramCount() >= 16) {
        const bool active =
            fx.delay_b_enabled &&
            (fx.delay_b_mix > 0.0001f ||
             routing.delay_b_to_delay_a > 0.0001f ||
             routing.delay_b_to_reverb > 0.0001f ||
             routing.delay_b_to_granular > 0.0001f);
        params[0] = active ? 1.0f : 0.0f;
        params[1] = clampFloat(fx.delay_b_activity, 0.0f, 1.0f);
        params[2] = clampFloat(fx.delay_b_repeats, 0.0f, 0.85f);
        params[3] = clampFloat(fx.delay_b_base_time_ms, 20.0f, 5000.0f);
        params[4] = clampFloat(fx.delay_b_tone, 0.0f, 1.0f);
        params[5] = clampFloat(fx.delay_b_vibrato, 0.0f, 1.0f);
        params[6] = clampFloat(fx.delay_b_mix, 0.0f, 1.0f);
        params[7] = clampFloat(routing.delay_b_to_reverb, 0.0f, 1.0f);
        params[8] = clampFloat(routing.delay_b_to_granular, 0.0f, 1.0f);
        params[9] = clampFloat(routing.delay_b_to_delay_a, 0.0f, 1.0f);
        params[10] = static_cast<float>(clampU32(fx.delay_b_space_mode, 0u, 1u));
        params[11] = static_cast<float>(clampU32(fx.delay_b_pattern, 0u, 3u));
        params[12] = static_cast<float>(clampU32(fx.delay_b_warp, 0u, 3u));
        params[13] = clampFloat(fx.delay_b_warp_intensity, 0.0f, 1.0f);
        params[14] = clampFloat(fx.delay_b_spread, 0.0f, 1.0f);
        delay_b_module->commitParams();
      }
    }
    if (reverb_module) {
      float* params = reverb_module->params();
      if (params != nullptr && reverb_module->paramCount() >= 30) {
        params[0] = static_cast<float>(clampU32(fx.reverb_type, 0u, 5u));
        params[1] = static_cast<float>(clampU32(fx.reverb_quality, 0u, 2u));
        params[2] = clampFloat(fx.reverb_decay, 0.0f, 1.0f);
        params[3] = clampFloat(fx.reverb_size, 0.5f, 10.0f);
        params[4] = clampFloat(fx.reverb_damping, 0.0f, 1.0f);
        params[5] = clampFloat(fx.reverb_diffusion, 0.0f, 1.0f);
        params[6] = clampFloat(fx.reverb_modulation, 0.0f, 1.0f);
        params[7] = clampFloat(fx.reverb_predelay_ms, 0.0f, 100.0f);
        params[8] = clampFloat(fx.reverb_width, 0.0f, 1.0f);
        params[9] = clampFloat(fx.reverb_shimmer_amount, 0.0f, 1.0f);
        params[10] = clampFloat(fx.reverb_shimmer_pitch, -24.0f, 24.0f);
        params[11] = clampFloat(fx.reverb_slow_rate_hz, 0.01f, 0.2f);
        params[12] = clampFloat(fx.reverb_slow_depth, 0.0f, 1.0f);
        params[13] = clampFloat(fx.reverb_reverse_amount, 0.0f, 1.0f);
        params[14] = clampFloat(fx.reverb_reverse_length_sec, 0.5f, 16.0f);
        params[15] = clampFloat(fx.reverb_chorus_rate_hz, 0.05f, 2.0f);
        params[16] = clampFloat(fx.reverb_chorus_depth, 0.0f, 40.0f);
        params[17] = static_cast<float>(clampU32(fx.reverb_mod_character, 0u, 2u));
        params[18] = clampFloat(fx.reverb_damp_low, 0.0f, 1.0f);
        params[19] = clampFloat(fx.reverb_damp_high, 0.0f, 1.0f);
        params[20] = clampFloat(fx.reverb_crossover_hz, 100.0f, 6000.0f);
        params[21] = clampFloat(fx.reverb_input_tone, -1.0f, 1.0f);
        params[22] = clampFloat(fx.reverb_shimmer_feedback, 0.0f, 1.0f);
        params[23] = clampFloat(fx.reverb_warp, 0.0f, 1.0f);
        params[24] = clampFloat(fx.reverb_cross_feed, 0.0f, 1.0f);
        params[25] = clampFloat(fx.reverb_early_reflections, 0.0f, 1.0f);
        params[26] = clampFloat(fx.reverb_air_absorption, 0.0f, 1.0f);
        params[27] = static_cast<float>(clampU32(fx.reverb_saturation_mode, 0u, 2u));
        params[28] = clampFloat(fx.reverb_transient_smooth, 0.0f, 1.0f);
        params[29] = clampFloat(fx.reverb_er_lp_freq, 200.0f, 12000.0f);
        reverb_module->commitParams();
      }
    }
    if (granular_module) {
      float* params = granular_module->params();
      if (params != nullptr && granular_module->paramCount() >= static_cast<int>(kGranularParamCount)) {
        params[0] = fx.granular_enabled ? 1.0f : 0.0f;
        params[1] = fx.granular_freeze ? 1.0f : 0.0f;
        params[2] = fx.granular_freeze_with_feedback ? 1.0f : 0.0f;
        params[3] = 1.0f;
        params[4] = clampFloat(fx.granular_feedback, 0.0f, 0.85f);
        params[5] = clampFloat(fx.granular_feedback_lpf_hz, 200.0f, 12000.0f);
        params[6] = clampFloat(fx.granular_buffer_seconds, 1.0f, 32.0f);
        params[7] = static_cast<float>(clampU32(fx.granular_grain_shape, 0u, 3u));
        params[8] = clampFloat(fx.granular_bus_diffusion, 0.0f, 1.0f);
        params[9] = clampFloat(fx.granular_timing_randomness, 0.0f, 1.0f);
        for (uint32_t voice_index = 0; voice_index < kGranularVoiceCount; ++voice_index) {
          const GranularVoiceState& voice = fx.granular_voices[voice_index];
          const uint32_t base = kGranularGlobalParamCount + voice_index * kGranularVoiceParamCount;
          params[base + 0] = voice.enabled ? 1.0f : 0.0f;
          params[base + 1] = static_cast<float>(clampU32(voice.mode, 0u, 2u));
          params[base + 2] = static_cast<float>(clampU32(voice.slice, 0u, 15u));
          params[base + 3] = clampFloat(voice.speed, 0.0f, 4.0f);
          params[base + 4] = clampFloat(voice.scan_rate, 0.25f, 4.0f);
          params[base + 5] = voice.reverse ? 1.0f : 0.0f;
          params[base + 6] = clampFloat(voice.pitch, -24.0f, 24.0f);
          params[base + 7] = clampFloat(voice.write_follow, 0.0f, 1.0f);
          params[base + 8] = clampFloat(voice.density, 1.0f, 64.0f);
          params[base + 9] = clampFloat(voice.grain_size_ms, 10.0f, 500.0f);
          params[base + 10] = clampFloat(voice.spray, 0.0f, 1.0f);
          params[base + 11] = clampFloat(voice.grain_octave_probability, 0.0f, 1.0f);
          params[base + 12] = clampFloat(voice.attack_seconds, 0.001f, 0.5f);
          params[base + 13] = clampFloat(voice.decay_seconds, 0.01f, 4.0f);
          params[base + 14] = clampFloat(voice.gain, 0.0f, 1.0f);
          params[base + 15] = clampFloat(voice.pan, -1.0f, 1.0f);
          params[base + 16] = clampFloat(voice.blur, 0.0f, 1.0f);
          params[base + 17] = clampFloat(voice.stereo_spread, 0.0f, 1.0f);
          params[base + 18] = clampFloat(voice.position_lfo_rate, 0.0f, 1.0f);
          params[base + 19] = clampFloat(voice.position_lfo_depth, 0.0f, 1.0f);
          params[base + 20] = clampFloat(voice.pan_lfo_rate, 0.0f, 1.0f);
          params[base + 21] = clampFloat(voice.reverse_lfo_rate, 0.0f, 1.0f);
          params[base + 22] = clampFloat(voice.record_lfo_rate, 0.0f, 1.0f);
          params[base + 23] = voice.euclid_gated ? 1.0f : 0.0f;
          params[base + 24] = voice.euclid_muted ? 1.0f : 0.0f;
        }
        int intervals[kMaxScaleNotes]{};
        const uint32_t interval_count = std::min<uint32_t>(scaleIntervals(harmony.scale_id, intervals), 12u);
        params[kGranularScaleCountParam] = static_cast<float>(interval_count);
        for (uint32_t i = 0; i < 12u; ++i) {
          params[kGranularScaleIntervalsParam + i] = i < interval_count ? static_cast<float>(intervals[i]) : 0.0f;
        }
        params[kGranularChordCountParam] = 4.0f;
        for (uint32_t i = 0; i < 7u; ++i) {
          params[kGranularChordPitchesParam + i] =
              i < 4u ? static_cast<float>(positiveModulo(roundedInt(harmony.chord_midi[i] - harmony.root_midi), 12u)) : 0.0f;
        }
        params[kGranularChordBiasParam] = clampFloat(fx.granular_chord_bias, 0.0f, 1.0f);
        params[kGranularLegacyParamStart + 0] = clampFloat(fx.granular_legacy_jitter_ms, 0.0f, 30.0f);
        params[kGranularLegacyParamStart + 1] = clampFloat(fx.granular_legacy_probability, 0.0f, 1.0f);
        params[kGranularLegacyParamStart + 2] = static_cast<float>(clampU32(fx.granular_legacy_pitch_mode, 0u, 1u));
        params[kGranularLegacyParamStart + 3] = clampFloat(fx.granular_legacy_pitch_spread, 0.0f, 12.0f);
        params[kGranularLegacyParamStart + 4] = static_cast<float>(clampU32(fx.granular_legacy_max_grains, 0u, 128u));
        params[kGranularLegacyParamStart + 5] = clampFloat(fx.granular_legacy_feedback, 0.0f, 0.35f);
        granular_module->commitParams();
      }
    }
    if (spectral_freeze_module) {
      float* params = spectral_freeze_module->params();
      if (params != nullptr && spectral_freeze_module->paramCount() >= 6) {
        params[0] = fx.spectral_freeze_active ? 1.0f : 0.0f;
        params[1] = fx.spectral_freeze_slushy ? 1.0f : 0.0f;
        params[2] = clampFloat(fx.spectral_freeze_speed, 0.0f, 1.0f);
        params[3] = 1.0f;
        params[4] = clampFloat(1.0f - fx.spectral_freeze_decay, 0.0f, 1.0f);
        params[5] = clampFloat(fx.spectral_freeze_phase_jitter, 0.0f, 1.0f);
        spectral_freeze_module->commitParams();
      }
    }
    if (dynamics_character_module) {
      float* params = dynamics_character_module->params();
      if (
          params != nullptr &&
          static_cast<uint32_t>(dynamics_character_module->paramCount()) >= kDynamicsCharacterParamCount) {
        std::fill(params, params + dynamics_character_module->paramCount(), 0.0f);
        const float macro_drive = clampFloat(fx.dynamics_drive, 0.0f, 1.0f);
        const float legacy_master_saturation_drive = clampFloat(master_saturation_drive, 0.0f, 1.0f);
        const bool legacy_master_saturation_enabled =
            !fx.dynamics_enabled && legacy_master_saturation_drive > 0.0001f;
        const bool dynamics_enabled =
            fx.dynamics_enabled || macro_drive > 0.0001f || legacy_master_saturation_enabled;
        const bool character_enabled = dynamics_enabled && fx.dynamics_character_enabled;
        const bool degrade_enabled = dynamics_enabled && fx.dynamics_degrade_enabled;
        const bool saturation_enabled =
            (fx.dynamics_enabled && fx.dynamics_saturation_enabled) || legacy_master_saturation_enabled;
        const bool end_comp_enabled = dynamics_enabled && fx.dynamics_end_comp_enabled;
        const float character_mix = character_enabled ? clampFloat(fx.dynamics_character_mix, 0.0f, 1.0f) : 0.0f;
        const float degrade_mix = degrade_enabled ? clampFloat(fx.dynamics_degrade_mix, 0.0f, 1.0f) : 0.0f;
        const float mode_wet = clampFloat(1.0f - (1.0f - character_mix) * (1.0f - degrade_mix), 0.0f, 1.0f);
        const float wet = clampFloat(std::max(mode_wet, macro_drive), 0.0f, 1.0f);
        const float dry = clampFloat(1.0f - wet * 0.72f - macro_drive * 0.12f, 0.0f, 1.0f);
        const uint32_t character_mode = character_enabled ? clampU32(fx.dynamics_character_mode, 0u, 2u) : 0u;
        const float shallow = character_mode == 2u ? 1.0f : 0.0f;
        const float abyss = character_mode == 1u ? 1.0f : 0.0f;
        const float depth = character_enabled ? clampFloat(fx.dynamics_character_depth, 0.0f, 1.0f) : 0.0f;
        const float rate = character_enabled ? clampFloat(fx.dynamics_character_rate, 0.0f, 1.0f) : 0.0f;
        const float damp = character_enabled ? clampFloat(fx.dynamics_character_damp, 0.0f, 1.0f) : 0.5f;
        const float stereo = character_enabled ? clampFloat(fx.dynamics_character_stereo, 0.0f, 1.0f) : 0.0f;
        const float resonance = character_enabled ? clampFloat(fx.dynamics_character_resonance, 0.0f, 1.0f) : 0.2f;
        const float env_follow = character_enabled ? clampFloat(fx.dynamics_character_env_follow, 0.0f, 1.0f) : 0.0f;
        const float character_age = character_enabled ? clampFloat(fx.dynamics_character_age, 0.0f, 1.0f) : 0.0f;
        const float lpg_amount = character_enabled ? clampFloat(fx.dynamics_character_lpg_amount, 0.0f, 1.0f) : 0.0f;
        const float bias = character_enabled ? clampFloat(fx.dynamics_character_bias, 0.0f, 1.0f) : 0.5f;
        const float degrade_age = degrade_enabled ? clampFloat(fx.dynamics_degrade_age, 0.0f, 1.0f) : 0.0f;
        const float degrade_generation = degrade_enabled ? clampFloat(fx.dynamics_degrade_generation, 0.0f, 1.0f) : 0.0f;
        const float degrade_alias = degrade_enabled ? clampFloat(fx.dynamics_degrade_alias, 0.0f, 1.0f) : 0.0f;
        const float degrade_wow = degrade_enabled ? clampFloat(fx.dynamics_degrade_wow, 0.0f, 1.0f) : 0.0f;
        const float degrade_flutter = degrade_enabled ? clampFloat(fx.dynamics_degrade_flutter, 0.0f, 1.0f) : 0.0f;
        const float degrade_drift = degrade_enabled ? clampFloat(fx.dynamics_degrade_drift, 0.0f, 1.0f) : 0.0f;
        const float degrade_wobble_speed = degrade_enabled ? clampFloat(fx.dynamics_degrade_wobble_speed, 0.0f, 1.0f) : 0.35f;
        const float degrade_tone = degrade_enabled ? clampFloat(fx.dynamics_degrade_tone, 0.0f, 1.0f) : 0.5f;
        const float degrade_hp = degrade_enabled ? clampFloat(fx.dynamics_degrade_hp, 0.0f, 1.0f) : 0.0f;
        const float degrade_lp = degrade_enabled ? clampFloat(fx.dynamics_degrade_lp, 0.0f, 1.0f) : 1.0f;
        const float degrade_noise = degrade_enabled ? clampFloat(fx.dynamics_degrade_noise, 0.0f, 1.0f) : 0.0f;
        const float degrade_saturation = degrade_enabled ? clampFloat(fx.dynamics_degrade_saturation, 0.0f, 1.0f) : 0.0f;
        const float degrade_corrosion = degrade_enabled ? clampFloat(fx.dynamics_degrade_corrosion, 0.0f, 1.0f) : 0.0f;
        const float degrade_influence = std::sqrt(clampFloat(degrade_mix, 0.0f, 1.0f));
        float mod_sources[kDynamicsModSourceCount]{};
        if (degrade_enabled) {
          const float media_wear = clampFloat(degrade_age + degrade_generation * 0.42f, 0.0f, 1.0f);
          mod_sources[kDynamicsModSourceSlow] = degrade_influence * clampFloat(
              degrade_wow * 0.22f + degrade_drift * 0.34f + degrade_age * 0.2f + degrade_generation * 0.18f,
              0.0f,
              1.0f);
          mod_sources[kDynamicsModSourceFlutter] = degrade_influence * clampFloat(
              degrade_flutter * 0.55f + degrade_generation * 0.08f,
              0.0f,
              1.0f);
          mod_sources[kDynamicsModSourceRandom] = degrade_influence * clampFloat(
              degrade_drift * 0.3f + media_wear * 0.22f,
              0.0f,
              1.0f);
          mod_sources[kDynamicsModSourceEnv] = degrade_influence * env_follow;
          mod_sources[kDynamicsModSourceNoise] = degrade_influence * clampFloat(
              degrade_noise * 0.64f + degrade_corrosion * 0.18f + degrade_alias * 0.12f,
              0.0f,
              1.0f);
        }
        const float mod_wow = dynamicsModRoute(mod_sources, kDynamicsModTargetWow);
        const float mod_flutter = dynamicsModRoute(mod_sources, kDynamicsModTargetFlutter);
        const float mod_lp = dynamicsModRoute(mod_sources, kDynamicsModTargetLp);
        const float mod_wet = dynamicsModRoute(mod_sources, kDynamicsModTargetWet);
        const float mod_dropout = dynamicsModRoute(mod_sources, kDynamicsModTargetDropout);
        const float mod_alias = dynamicsModRoute(mod_sources, kDynamicsModTargetAlias);
        const float shaped_alias = clampFloat(degrade_alias + mod_alias * 0.18f, 0.0f, 1.0f);
        const float shaped_wow = clampFloat(degrade_wow + mod_wow * 0.2f, 0.0f, 1.0f);
        const float shaped_flutter = clampFloat(degrade_flutter + mod_flutter * 0.08f, 0.0f, 1.0f);
        const float wear = clampFloat(degrade_age + degrade_generation * 0.42f, 0.0f, 1.0f);
        const float damage = clampFloat(
            degrade_mix * (degrade_age * 0.32f + degrade_generation * 0.18f + shaped_alias * 0.08f + degrade_corrosion * 0.12f),
            0.0f,
            1.0f);
        const float corrosion = clampFloat(degrade_corrosion * degrade_mix * 0.72f + degrade_generation * 0.04f + shaped_alias * 0.025f + macro_drive * 0.08f, 0.0f, 1.0f);
        const float random_drift = clampFloat(degrade_drift * 0.52f + depth * (0.18f + shallow * 0.24f + abyss * 0.2f) + mod_flutter * 0.24f, 0.0f, 1.0f);
        const float hold_rate_hz = 0.08f + rate * 1.2f + degrade_wobble_speed * degrade_mix * 0.48f + mod_wow * 0.08f;
        const float hold_lag = 0.08f + damp * 0.54f + (1.0f - degrade_wobble_speed) * degrade_mix * 0.28f;
        const float lowpass_unit = std::max(0.08f, std::min(degrade_lp, 1.0f - damage * 0.2f - corrosion * 0.1f - mod_lp * 0.08f));
        const float lowpass_hz = unitToLogFrequency(lowpass_unit, 1000.0f, 20000.0f) * (0.82f + degrade_tone * 0.38f);
        const float highpass_hz = unitToLogFrequency(std::max(degrade_hp, damage * 0.025f), 20.0f, 2400.0f);
        const float bias_floor_hz = unitToLogFrequency(bias, 140.0f + 360.0f * (1.0f - abyss), 1200.0f + 10800.0f * (1.0f - abyss));
        const float lpg_open_hz = std::max(0.0f, lowpass_hz - std::min(lowpass_hz, bias_floor_hz));
        const float wow_frequency = 0.03f + rate * 0.64f + degrade_wobble_speed * shaped_wow * 0.18f + degrade_drift * 0.12f + mod_wow * 0.04f;
        const float flutter_frequency = 2.4f + rate * 6.2f + shaped_flutter * 4.6f + corrosion * 3.0f;
        const float wow_depth = (shaped_wow * 0.003f + depth * 0.002f + degrade_drift * 0.001f + mod_wow * 0.00085f) * (1.0f + macro_drive);
        const float flutter_depth = (shaped_flutter * 0.0008f + depth * 0.0003f + corrosion * 0.0004f + mod_flutter * 0.0002f) * (1.0f + macro_drive);
        const float saturation_drive = legacy_master_saturation_enabled
            ? legacy_master_saturation_drive
            : (saturation_enabled ? clampFloat(fx.dynamics_saturation_drive, 0.0f, 1.0f) : macro_drive * 0.35f);
        const float end_comp_mix = end_comp_enabled
            ? clampFloat(fx.dynamics_end_comp_mix, 0.0f, 1.0f)
            : (macro_drive > 0.55f ? macro_drive : 0.0f);

        params[kDynActive] = dynamics_enabled && (wet > 0.0001f || saturation_drive > 0.0001f || end_comp_mix > 0.0001f) ? 1.0f : 0.0f;
        params[kDynAllpassActive] = 0.0f;
        params[kDynDry] = dry;
        params[kDynWet] = wet;
        params[kDynDegradeMix] = degrade_mix;
        params[kDynDegradeAlias] = shaped_alias;
        params[kDynDegradeGeneration] = degrade_generation;
        params[kDynDegradeCorrosion] = degrade_corrosion;
        params[kDynDegradeWear] = wear;
        params[kDynNoiseGain] = std::min(0.018f, wet * degrade_noise * (0.006f + wear * 0.014f + corrosion * 0.012f));
        params[kDynJitterDepth] = degrade_mix * (shaped_flutter * 0.00008f + corrosion * 0.00006f + shaped_alias * 0.00004f + mod_flutter * 0.00011f);
        params[kDynRandomDriftFilterHz] = std::max(0.08f, hold_rate_hz * (0.92f - damp * 0.58f));
        params[kDynRandomDriftDepth] = random_drift * (0.00016f + degrade_drift * 0.00225f + wear * 0.0015f);
        params[kDynBaseDelay] = 0.0003f + character_age * 0.0012f + degrade_drift * 0.004f;
        params[kDynSpreadDelay] = 0.0006f + stereo * 0.004f + character_age * 0.002f + degrade_drift * 0.006f;
        params[kDynRandomDrift] = random_drift;
        params[kDynRandomHoldRateHz] = hold_rate_hz;
        params[kDynRandomHoldLag] = hold_lag;
        params[kDynRandomDelayDepth] = random_drift * (0.00008f + depth * 0.004f + shaped_wow * 0.0008f);
        params[kDynRandomSpreadDelayDepth] = params[kDynRandomDelayDepth] * (0.68f + stereo * 0.56f);
        params[kDynRandomFilterDepth] = random_drift * (18.0f + depth * 220.0f + shaped_wow * 80.0f + mod_lp * 120.0f);
        params[kDynRandomSpreadFilterDepth] = params[kDynRandomFilterDepth] * (0.55f + stereo * 0.32f);
        params[kDynDepth] = depth;
        params[kDynRate] = rate;
        params[kDynShallow] = shallow;
        params[kDynAbyss] = abyss;
        params[kDynStereo] = stereo;
        params[kDynDamage] = damage;
        params[kDynMainPan] = -stereo * (0.25f + shallow * 0.18f);
        params[kDynSpreadPan] = stereo * (0.58f + shallow * 0.24f);
        params[kDynMainDelayGain] = 1.0f - stereo * 0.14f;
        params[kDynSpreadDelayGain] = stereo * (0.05f + depth * (0.12f + shallow * 0.28f + abyss * 0.12f));
        params[kDynWowFrequency] = wow_frequency;
        params[kDynFlutterFrequency] = flutter_frequency;
        params[kDynFlutterRandomDepth] = degrade_mix * shaped_flutter * (0.00004f + flutter_depth * 0.4f + mod_flutter * 0.00048f);
        params[kDynWowDepth] = wow_depth;
        params[kDynFlutterDepth] = flutter_depth;
        params[kDynHighpassHz] = highpass_hz;
        params[kDynHighpassQ] = 0.7f + resonance * 1.5f;
        params[kDynAllpassAFrequency] = 260.0f + shallow * 520.0f + depth * 380.0f + character_age * 240.0f;
        params[kDynAllpassAQ] = 0.25f + resonance * (abyss > 0.0f ? 0.18f : 1.1f);
        params[kDynAllpassBFrequency] = 900.0f + shallow * 2100.0f + depth * 680.0f + character_age * 420.0f;
        params[kDynAllpassBQ] = 0.25f + resonance * (abyss > 0.0f ? 0.14f : 0.85f);
        params[kDynHeadBumpFrequency] = 80.0f + wear * 45.0f + corrosion * 20.0f;
        params[kDynHeadBumpQ] = 0.55f + wear * 0.55f;
        params[kDynHeadBumpGain] = degrade_mix * 1.1f * (0.2f + wear * 0.65f) + character_mix * (abyss * 0.28f + shallow * 0.22f);
        params[kDynDropoutFilterHz] = 0.25f + wear * 1.8f + corrosion * 4.5f + degrade_generation * 1.2f + mod_dropout * 2.2f;
        params[kDynDropoutDepth] = clampFloat(damage + mod_dropout, 0.0f, 1.0f) * 0.16f;
        params[kDynDropoutGain] = 1.0f - clampFloat(damage + mod_dropout, 0.0f, 1.0f) * 0.14f;
        params[kDynEnvFilterHz] = 2.5f + env_follow * 26.0f + rate * 12.0f;
        params[kDynEnvToLowpassGain] = env_follow * lpg_amount * lpg_open_hz * (0.18f + shallow * 0.58f + abyss * 0.7f) + mod_lp * 120.0f;
        params[kDynEnvToResonanceGain] = env_follow * lpg_amount * (0.02f + resonance * (0.08f + abyss * 0.16f));
        params[kDynEnvToWetGain] = env_follow * lpg_amount * character_mix * (0.012f + shallow * 0.033f + abyss * 0.068f) + mod_wet * degrade_mix * 0.03f;
        params[kDynLowpassHz] = lowpass_hz;
        params[kDynLowpassQ] = 0.7f + resonance * (0.45f + shallow * 0.45f + abyss * 0.15f);
        params[kDynLowpassStage2Hz] = character_mode == 0u ? lowpass_hz : 20000.0f;
        params[kDynLowpassStage2Q] = character_mode == 0u ? 0.7f + resonance * 0.2f : 0.707f;
        params[kDynCompressorThreshold] = character_enabled ? -16.0f - character_mix * (shallow * 10.0f + abyss * 7.0f) : -4.0f;
        params[kDynCompressorKnee] = 10.0f + shallow * 10.0f + abyss * 8.0f;
        params[kDynCompressorRatio] = 1.2f + shallow * 0.8f + abyss * 0.9f + env_follow * abyss * 0.35f;
        params[kDynCompressorAttack] = 0.004f + shallow * 0.014f + abyss * 0.003f;
        params[kDynCompressorRelease] = 0.12f + shallow * 0.1f + abyss * 0.18f + damp * 0.08f;
        params[kDynCompressorMakeup] = 1.0f + character_mix * (shallow * 0.05f + abyss * 0.16f);
        params[kDynSaturation] = clampFloat(degrade_saturation * degrade_mix * 0.55f + character_mix * character_age * 0.06f + macro_drive * 0.25f, 0.0f, 1.0f);
        params[kDynCorrosion] = corrosion;
        params[kDynMasterSatActive] = saturation_drive > 0.0001f ? 1.0f : 0.0f;
        params[kDynMasterSatMode] = static_cast<float>(
            legacy_master_saturation_enabled
                ? clampU32(master_saturation_mode, 0u, 4u)
                : (saturation_enabled ? clampU32(fx.dynamics_saturation_mode, 0u, 4u) : 0u));
        params[kDynMasterSatDrive] = saturation_drive;
        params[kDynMasterSatTone] = legacy_master_saturation_enabled
            ? clampFloat(master_saturation_tone, 0.0f, 1.0f)
            : (saturation_enabled ? clampFloat(fx.dynamics_saturation_tone, 0.0f, 1.0f) : 0.5f);
        params[kDynMasterSatBias] = legacy_master_saturation_enabled
            ? 0.5f
            : (saturation_enabled ? clampFloat(fx.dynamics_saturation_bias, 0.0f, 1.0f) : 0.5f);
        params[kDynEndCompActive] = end_comp_mix > 0.0001f ? 1.0f : 0.0f;
        params[kDynEndCompThreshold] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_threshold, -60.0f, 0.0f) : -18.0f;
        params[kDynEndCompKnee] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_knee, 0.0f, 40.0f) : 6.0f;
        params[kDynEndCompRatio] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_ratio, 1.0f, 20.0f) : 2.0f + macro_drive * 2.0f;
        params[kDynEndCompAttack] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_attack_ms, 0.1f, 100.0f) * 0.001f : 0.01f;
        params[kDynEndCompRelease] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_release_ms, 20.0f, 1500.0f) * 0.001f : 0.12f;
        params[kDynEndCompMakeup] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_makeup, 0.25f, 4.0f) : 1.0f;
        params[kDynEndCompMix] = end_comp_mix;
        params[kDynEndCompDetectorHpHz] = unitToLogFrequency(
            end_comp_enabled ? fx.dynamics_end_comp_detector_hp : 0.25f,
            20.0f,
            360.0f);
        params[kDynEndCompDetectorTilt] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_detector_tilt, 0.0f, 1.0f) : 0.5f;
        params[kDynEndCompAutoMakeup] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_auto_makeup, 0.0f, 1.0f) : 0.0f;
        params[kDynEndCompProgramRelease] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_program_release, 0.0f, 1.0f) : 0.25f;
        dynamics_character_module->commitParams();
      }
    }
  }

  void setMasterLimiterCeilingDb(float value) {
    master_limiter_ceiling_db = clampFloat(value, -24.0f, 0.0f);
    master_limiter_ceiling_gain = dbToGain(master_limiter_ceiling_db);
  }

  void resetSidechainRuntime() {
    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      sidechain_envelopes[target] = {};
      sidechain_envelopes[target].current_gain = 1.0f;
      sidechain_envelopes[target].start_gain = 1.0f;
      sidechain_envelopes[target].target_gain = 1.0f;
      for (uint32_t frame = 0; frame < kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES; ++frame) {
        sidechain_gains[target][frame] = 1.0f;
      }
    }
  }

  float sidechainTargetAmount(uint32_t target) const {
    if (!fx.sidechain_enabled || target >= kSidechainTargetCount) {
      return 0.0f;
    }
    const float raw = clampFloat(fx.sidechain_targets[target], 0.0f, 1.0f) *
        clampFloat(fx.sidechain_amount, 0.0f, 1.0f) *
        clampFloat(fx.sidechain_mix, 0.0f, 1.0f);
    return clampFloat(1.0f - (1.0f - raw) * (1.0f - raw), 0.0f, 1.0f);
  }

  uint32_t sidechainTargetForSource(uint32_t source_id) const {
    switch (source_id) {
      case KESSHO_PRODUCT_SOURCE_PAD1:
        return kSidechainPad1;
      case KESSHO_PRODUCT_SOURCE_PAD2:
        return kSidechainPad2;
      case KESSHO_PRODUCT_SOURCE_LEAD1:
        return kSidechainLead1;
      case KESSHO_PRODUCT_SOURCE_LEAD2:
        return kSidechainLead2;
      case KESSHO_PRODUCT_SOURCE_PIANO:
        return kSidechainPiano;
      default:
        return kSidechainTargetCount;
    }
  }

  float sidechainGain(uint32_t target, uint32_t frame) const {
    if (!fx.sidechain_enabled || target >= kSidechainTargetCount ||
        frame >= kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
      return 1.0f;
    }
    return sidechain_gains[target][frame];
  }

  void triggerSidechainDuck(uint32_t drum_voice, float velocity) {
    if (!fx.sidechain_enabled) {
      return;
    }
    const uint32_t key_id = clampU32(drum_voice + 1u, kSidechainKeySub, kSidechainKeyMembrane);
    const float weight =
        (key_id == fx.sidechain_key_a ? clampFloat(fx.sidechain_key_a_weight, 0.0f, 1.0f) : 0.0f) +
        (key_id == fx.sidechain_key_b ? clampFloat(fx.sidechain_key_b_weight, 0.0f, 1.0f) : 0.0f);
    if (weight <= 0.0001f) {
      return;
    }

    const float curve = 0.65f + clampFloat(fx.sidechain_curve, 0.0f, 1.0f) * 0.7f;
    const float trigger_strength = std::pow(clampFloat(velocity * weight, 0.0f, 1.0f), curve);
    const float detector_db = 20.0f * std::log10(std::max(0.0001f, trigger_strength));
    const float threshold_db = clampFloat(fx.sidechain_threshold, -60.0f, 0.0f);
    const float ratio = clampFloat(fx.sidechain_ratio, 1.0f, 20.0f);
    const float knee = clampFloat(fx.sidechain_knee, 0.0f, 40.0f);
    const float over_db = detector_db - threshold_db;
    const float knee_over_db =
        knee > 0.0f && over_db > -knee && over_db < knee
            ? ((over_db + knee) * (over_db + knee)) / (4.0f * knee)
            : std::max(0.0f, over_db);
    const float gain_reduction_db = knee_over_db * (1.0f - 1.0f / ratio);
    const float duck_factor = std::max(0.005f, std::pow(10.0f, -gain_reduction_db / 20.0f));
    const float makeup = clampFloat(fx.sidechain_makeup, 0.25f, 4.0f);
    const uint32_t attack_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(clampFloat(fx.sidechain_attack_ms, 0.1f, 100.0f) * 0.001f * sample_rate));
    const uint32_t hold_frames = static_cast<uint32_t>(clampFloat(fx.sidechain_hold_ms, 0.0f, 250.0f) * 0.001f * sample_rate);
    const uint32_t release_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(clampFloat(fx.sidechain_release_ms, 20.0f, 1500.0f) * 0.001f * sample_rate));

    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      const float amount = sidechainTargetAmount(target);
      if (amount <= 0.0001f) {
        continue;
      }
      const float ducked_wet_gain = std::min(amount * 1.2f, amount * duck_factor * makeup);
      const float computed_gain = clampFloat((1.0f - amount) + ducked_wet_gain, 0.0f, 1.0f);
      SidechainEnvelope& envelope = sidechain_envelopes[target];
      envelope.start_gain = envelope.current_gain;
      envelope.target_gain = std::min(envelope.current_gain, computed_gain);
      envelope.attack_elapsed = 0u;
      envelope.attack_frames = attack_frames;
      envelope.hold_remaining = hold_frames;
      envelope.release_elapsed = 0u;
      envelope.release_frames = release_frames;
    }
  }

  float advanceSidechainEnvelope(SidechainEnvelope& envelope) {
    if (envelope.attack_elapsed < envelope.attack_frames) {
      ++envelope.attack_elapsed;
      const float t = static_cast<float>(envelope.attack_elapsed) / static_cast<float>(std::max(1u, envelope.attack_frames));
      const float shaped = 1.0f - (1.0f - t) * (1.0f - t);
      envelope.current_gain = envelope.start_gain + (envelope.target_gain - envelope.start_gain) * shaped;
      return envelope.current_gain;
    }
    if (envelope.hold_remaining > 0u) {
      --envelope.hold_remaining;
      envelope.current_gain = envelope.target_gain;
      return envelope.current_gain;
    }
    if (envelope.release_elapsed < envelope.release_frames) {
      ++envelope.release_elapsed;
      const float t = static_cast<float>(envelope.release_elapsed) / static_cast<float>(std::max(1u, envelope.release_frames));
      const float shaped = 1.0f - (1.0f - t) * (1.0f - t);
      envelope.current_gain = envelope.target_gain + (1.0f - envelope.target_gain) * shaped;
      return envelope.current_gain;
    }
    envelope.current_gain = 1.0f;
    envelope.start_gain = 1.0f;
    envelope.target_gain = 1.0f;
    return envelope.current_gain;
  }

  void renderSidechainGains(uint32_t start, uint32_t frames) {
    if (start + frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
      return;
    }
    if (!fx.sidechain_enabled) {
      for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
        sidechain_envelopes[target].current_gain = 1.0f;
        sidechain_envelopes[target].target_gain = 1.0f;
        for (uint32_t i = 0; i < frames; ++i) {
          sidechain_gains[target][start + i] = 1.0f;
        }
      }
      return;
    }
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
        sidechain_gains[target][frame] = advanceSidechainEnvelope(sidechain_envelopes[target]);
      }
    }
  }

  void loadDefaults() {
    transport = {};
    harmony = {};
    master_gain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_GAIN;
    setMasterLimiterCeilingDb(kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB);
    master_saturation_mode = 0u;
    master_saturation_drive = 0.0f;
    master_saturation_tone = 0.5f;
    fx = {};
    for (uint32_t i = 0; i < kGranularVoiceCount; ++i) {
      fx.granular_voices[i] = {};
      fx.granular_voices[i].enabled = i == 0u;
      fx.granular_voices[i].slice = i * 4u;
    }
    routing = {};
    rng_seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
    rng_state = rng_seed;
    evolution_amount = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_EVOLUTION_AMOUNT;
    evolution_state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_EVOLUTION_STATE;
    journey_running = false;
    journey_phase = 0.0f;
    journey_rate_bars = 8.0f;
    for (uint32_t i = 0; i < kSourceCount; ++i) {
      sources[i] = {};
      sources[i].source_id = i + 1;
      sources[i].preset_id = defaultSourcePresetId(sources[i].source_id);
    }
    for (uint32_t i = 0; i < kMaxLaneCount; ++i) {
      synth_lanes[i] = {};
      synth_lanes[i].enabled = i == 0u;
      synth_lanes[i].target_source_id = (i % 2 == 0) ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_LEAD1;
      synth_lanes[i].midi_note = 60.0f + static_cast<float>((i % 4) * 7);
      synth_lanes[i].seed = rng_seed + i + 1;
      drum_lanes[i] = {};
      drum_lanes[i].enabled = i == 0u;
      drum_lanes[i].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
      drum_lanes[i].midi_note = 36.0f + static_cast<float>(i);
      drum_lanes[i].fill_count = (i == 0) ? 4u : 2u;
      drum_lanes[i].seed = rng_seed + 100u + i;
    }
    for (ModulationRange& range : modulation_ranges) {
      range = {};
    }
    resetSidechainRuntime();
    reverb_pre_comp_gain = 1.0f;
    telemetry.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
    telemetry.sample_rate = sample_rate;
    telemetry.block_size = max_block_size;
    pad_voice_cursors[0] = 0;
    pad_voice_cursors[1] = 0;
    clearPadVoiceReleases(0u);
    resetPadPostChains();
    resetLeadPostChains();
    configureFxModules();
  }

  void reset() {
    transport.reset();
    control_event_count = 0;
    sequencer_events.clear();
    for (Voice& voice : voices) {
      voice = {};
    }
    for (ModulationRange& range : modulation_ranges) {
      range = {};
    }
    resetSidechainRuntime();
    reverb_pre_comp_gain = 1.0f;
    rng_state = rng_seed;
    journey_phase = 0.0f;
    if (pad_module) {
      pad_module->reset();
    }
    for (auto& lead_module : lead_modules) {
      if (lead_module) {
        lead_module->reset();
      }
    }
    if (drum_module) {
      drum_module->reset();
    }
    if (delay_a_module) {
      delay_a_module->reset();
    }
    if (delay_b_module) {
      delay_b_module->reset();
    }
    if (reverb_module) {
      reverb_module->reset();
    }
    if (granular_module) {
      granular_module->reset();
    }
    if (spectral_freeze_module) {
      spectral_freeze_module->reset();
    }
    if (dynamics_character_module) {
      dynamics_character_module->reset();
    }
    pad_voice_cursors[0] = 0;
    pad_voice_cursors[1] = 0;
    clearPadVoiceReleases(0u);
    resetPadPostChains();
    resetLeadPostChains();
    configureFxModules();
    updateTelemetry(0);
  }

  int32_t loadSnapshot(const KesshoProductSnapshotV2& snapshot) {
    if (snapshot.version != KESSHO_PRODUCT_SNAPSHOT_VERSION) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_UNSUPPORTED_SNAPSHOT_VERSION;
      return KESSHO_PRODUCT_ERROR_UNSUPPORTED_SNAPSHOT_VERSION;
    }
    if (snapshot.schema_hash != KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH;
      return KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH;
    }

    transport.running = snapshot.transport.running != 0u;
    transport.bpm = clampFloat(snapshot.transport.bpm, 1.0f, 400.0f);
    transport.beats_per_bar = clampU32(snapshot.transport.beats_per_bar, 1u, 32u);
    transport.bars_per_phrase = clampU32(snapshot.transport.bars_per_phrase, 1u, 256u);
    transport.swing = clampFloat(snapshot.transport.swing, 0.0f, 1.0f);
    harmony.root_midi = clampFloat(snapshot.harmony.root_midi, 0.0f, 127.0f);
    harmony.scale_id = snapshot.harmony.scale_id == 0u ? 1u : snapshot.harmony.scale_id;
    harmony.tension = clampFloat(snapshot.harmony.tension, 0.0f, 1.0f);
    harmony.chord_mode = snapshot.harmony.chord_mode;
    harmony.voicing_mode = snapshot.harmony.voicing_mode;
    master_gain = clampFloat(snapshot.master.gain, 0.0f, 1.5f);
    setMasterLimiterCeilingDb(snapshot.master.limiter_ceiling_db);
    master_saturation_mode = clampU32(snapshot.master.saturation_mode, 0u, 4u);
    master_saturation_drive = clampFloat(snapshot.master.saturation_drive, 0.0f, 1.0f);
    master_saturation_tone = clampFloat(snapshot.master.saturation_tone, 0.0f, 1.0f);
    rng_seed = snapshot.rng.seed == 0u ? 1u : snapshot.rng.seed;
    rng_state = snapshot.rng.state == 0u ? rng_seed : snapshot.rng.state;
    evolution_amount = clampFloat(snapshot.evolution.amount, 0.0f, 1.0f);
    evolution_state = snapshot.evolution.state;
    journey_running = snapshot.journey.enabled != 0u;
    journey_phase = clampFloat(snapshot.journey.morph_phase, 0.0f, 1.0f);
    journey_rate_bars = clampFloat(snapshot.journey.morph_rate_bars, 0.25f, 128.0f);
    fx.granular_mix = clampFloat(snapshot.fx.granular_mix, 0.0f, 1.0f);
    fx.granular_enabled = snapshot.fx.granular_enabled != 0u;
    fx.granular_freeze = snapshot.fx.granular_freeze != 0u;
    fx.granular_freeze_with_feedback = snapshot.fx.granular_freeze_with_feedback != 0u;
    fx.granular_feedback = clampFloat(snapshot.fx.granular_feedback, 0.0f, 0.85f);
    fx.granular_feedback_lpf_hz = clampFloat(snapshot.fx.granular_feedback_lpf_hz, 200.0f, 12000.0f);
    fx.granular_buffer_seconds = clampFloat(snapshot.fx.granular_buffer_seconds, 1.0f, 32.0f);
    fx.granular_grain_shape = clampU32(snapshot.fx.granular_grain_shape, 0u, 3u);
    fx.granular_bus_diffusion = clampFloat(snapshot.fx.granular_bus_diffusion, 0.0f, 1.0f);
    fx.granular_timing_randomness = clampFloat(snapshot.fx.granular_timing_randomness, 0.0f, 1.0f);
    fx.granular_chord_bias = clampFloat(snapshot.fx.granular_chord_bias, 0.0f, 1.0f);
    fx.granular_legacy_jitter_ms = clampFloat(snapshot.fx.granular_legacy_jitter_ms, 0.0f, 30.0f);
    fx.granular_legacy_probability = clampFloat(snapshot.fx.granular_legacy_probability, 0.0f, 1.0f);
    fx.granular_legacy_pitch_mode = clampU32(snapshot.fx.granular_legacy_pitch_mode, 0u, 1u);
    fx.granular_legacy_pitch_spread = clampFloat(snapshot.fx.granular_legacy_pitch_spread, 0.0f, 12.0f);
    fx.granular_legacy_max_grains = clampU32(snapshot.fx.granular_legacy_max_grains, 0u, 128u);
    fx.granular_legacy_feedback = clampFloat(snapshot.fx.granular_legacy_feedback, 0.0f, 0.35f);
    for (uint32_t i = 0; i < kGranularVoiceCount; ++i) {
      const KesshoProductGranularVoiceSnapshot& voice_snapshot = snapshot.fx.granular_voices[i];
      GranularVoiceState& voice = fx.granular_voices[i];
      voice.enabled = voice_snapshot.enabled != 0u;
      voice.mode = clampU32(voice_snapshot.mode, 0u, 2u);
      voice.slice = clampU32(voice_snapshot.slice, 0u, 15u);
      voice.speed = clampFloat(voice_snapshot.speed, 0.0f, 4.0f);
      voice.scan_rate = clampFloat(voice_snapshot.scan_rate, 0.25f, 4.0f);
      voice.reverse = voice_snapshot.reverse != 0u;
      voice.pitch = clampFloat(voice_snapshot.pitch, -24.0f, 24.0f);
      voice.write_follow = clampFloat(voice_snapshot.write_follow, 0.0f, 1.0f);
      voice.density = clampFloat(voice_snapshot.density, 1.0f, 64.0f);
      voice.grain_size_ms = clampFloat(voice_snapshot.grain_size_ms, 10.0f, 500.0f);
      voice.spray = clampFloat(voice_snapshot.spray, 0.0f, 1.0f);
      voice.grain_octave_probability = clampFloat(voice_snapshot.grain_octave_probability, 0.0f, 1.0f);
      voice.attack_seconds = clampFloat(voice_snapshot.attack_seconds, 0.001f, 0.5f);
      voice.decay_seconds = clampFloat(voice_snapshot.decay_seconds, 0.01f, 4.0f);
      voice.gain = clampFloat(voice_snapshot.gain, 0.0f, 1.0f);
      voice.pan = clampFloat(voice_snapshot.pan, -1.0f, 1.0f);
      voice.blur = clampFloat(voice_snapshot.blur, 0.0f, 1.0f);
      voice.stereo_spread = clampFloat(voice_snapshot.stereo_spread, 0.0f, 1.0f);
      voice.position_lfo_rate = clampFloat(voice_snapshot.position_lfo_rate, 0.0f, 1.0f);
      voice.position_lfo_depth = clampFloat(voice_snapshot.position_lfo_depth, 0.0f, 1.0f);
      voice.pan_lfo_rate = clampFloat(voice_snapshot.pan_lfo_rate, 0.0f, 1.0f);
      voice.reverse_lfo_rate = clampFloat(voice_snapshot.reverse_lfo_rate, 0.0f, 1.0f);
      voice.record_lfo_rate = clampFloat(voice_snapshot.record_lfo_rate, 0.0f, 1.0f);
      voice.euclid_gated = voice_snapshot.euclid_gated != 0u;
      voice.euclid_muted = voice_snapshot.euclid_muted != 0u;
    }
    fx.delay_a_enabled = snapshot.fx.delay_a_enabled != 0u;
    fx.delay_a_time_left_ms = clampFloat(snapshot.fx.delay_a_time_left_ms, 10.0f, 5000.0f);
    fx.delay_a_time_right_ms = clampFloat(snapshot.fx.delay_a_time_right_ms, 10.0f, 5000.0f);
    fx.delay_a_feedback = clampFloat(snapshot.fx.delay_a_feedback, 0.0f, 0.95f);
    fx.delay_a_mix = clampFloat(snapshot.fx.delay_a_mix, 0.0f, 1.0f);
    fx.delay_a_filter_hz = clampFloat(snapshot.fx.delay_a_filter_hz, 200.0f, 12000.0f);
    fx.delay_a_filter_type = clampU32(snapshot.fx.delay_a_filter_type, 0u, 2u);
    fx.delay_a_mod_rate_hz = clampFloat(snapshot.fx.delay_a_mod_rate_hz, 0.0f, 5.0f);
    fx.delay_a_mod_depth_ms = clampFloat(snapshot.fx.delay_a_mod_depth_ms, 0.0f, 50.0f);
    fx.delay_a_ping_pong = snapshot.fx.delay_a_ping_pong != 0u;
    fx.delay_a_duck = clampFloat(snapshot.fx.delay_a_duck, 0.0f, 1.0f);
    fx.delay_a_width = clampFloat(snapshot.fx.delay_a_width, 0.0f, 1.0f);
    fx.delay_a_cross_feed_filter_hz = clampFloat(snapshot.fx.delay_a_cross_feed_filter_hz, 200.0f, 12000.0f);
    fx.delay_b_enabled = snapshot.fx.delay_b_enabled != 0u;
    fx.delay_b_activity = clampFloat(snapshot.fx.delay_b_activity, 0.0f, 1.0f);
    fx.delay_b_repeats = clampFloat(snapshot.fx.delay_b_repeats, 0.0f, 0.85f);
    fx.delay_b_base_time_ms = clampFloat(snapshot.fx.delay_b_base_time_ms, 20.0f, 5000.0f);
    fx.delay_b_tone = clampFloat(snapshot.fx.delay_b_tone, 0.0f, 1.0f);
    fx.delay_b_vibrato = clampFloat(snapshot.fx.delay_b_vibrato, 0.0f, 1.0f);
    fx.delay_b_mix = clampFloat(snapshot.fx.delay_b_mix, 0.0f, 1.0f);
    fx.delay_b_space_mode = clampU32(snapshot.fx.delay_b_space_mode, 0u, 1u);
    fx.delay_b_pattern = clampU32(snapshot.fx.delay_b_pattern, 0u, 3u);
    fx.delay_b_warp = clampU32(snapshot.fx.delay_b_warp, 0u, 3u);
    fx.delay_b_warp_intensity = clampFloat(snapshot.fx.delay_b_warp_intensity, 0.0f, 1.0f);
    fx.delay_b_spread = clampFloat(snapshot.fx.delay_b_spread, 0.0f, 1.0f);
    fx.reverb_mix = clampFloat(snapshot.fx.reverb_mix, 0.0f, 1.0f);
    fx.reverb_type = clampU32(snapshot.fx.reverb_type, 0u, 5u);
    fx.reverb_quality = clampU32(snapshot.fx.reverb_quality, 0u, 2u);
    fx.reverb_decay = clampFloat(snapshot.fx.reverb_decay, 0.0f, 1.0f);
    fx.reverb_size = clampFloat(snapshot.fx.reverb_size, 0.5f, 10.0f);
    fx.reverb_damping = clampFloat(snapshot.fx.reverb_damping, 0.0f, 1.0f);
    fx.reverb_diffusion = clampFloat(snapshot.fx.reverb_diffusion, 0.0f, 1.0f);
    fx.reverb_modulation = clampFloat(snapshot.fx.reverb_modulation, 0.0f, 1.0f);
    fx.reverb_predelay_ms = clampFloat(snapshot.fx.reverb_predelay_ms, 0.0f, 100.0f);
    fx.reverb_width = clampFloat(snapshot.fx.reverb_width, 0.0f, 1.0f);
    fx.reverb_shimmer_amount = clampFloat(snapshot.fx.reverb_shimmer_amount, 0.0f, 1.0f);
    fx.reverb_shimmer_pitch = clampFloat(snapshot.fx.reverb_shimmer_pitch, -24.0f, 24.0f);
    fx.reverb_slow_rate_hz = clampFloat(snapshot.fx.reverb_slow_rate_hz, 0.01f, 0.2f);
    fx.reverb_slow_depth = clampFloat(snapshot.fx.reverb_slow_depth, 0.0f, 1.0f);
    fx.reverb_reverse_amount = clampFloat(snapshot.fx.reverb_reverse_amount, 0.0f, 1.0f);
    fx.reverb_reverse_length_sec = clampFloat(snapshot.fx.reverb_reverse_length_sec, 0.5f, 16.0f);
    fx.reverb_chorus_rate_hz = clampFloat(snapshot.fx.reverb_chorus_rate_hz, 0.05f, 2.0f);
    fx.reverb_chorus_depth = clampFloat(snapshot.fx.reverb_chorus_depth, 0.0f, 40.0f);
    fx.reverb_mod_character = clampU32(snapshot.fx.reverb_mod_character, 0u, 2u);
    fx.reverb_damp_low = clampFloat(snapshot.fx.reverb_damp_low, 0.0f, 1.0f);
    fx.reverb_damp_high = clampFloat(snapshot.fx.reverb_damp_high, 0.0f, 1.0f);
    fx.reverb_crossover_hz = clampFloat(snapshot.fx.reverb_crossover_hz, 100.0f, 6000.0f);
    fx.reverb_input_tone = clampFloat(snapshot.fx.reverb_input_tone, -1.0f, 1.0f);
    fx.reverb_shimmer_feedback = clampFloat(snapshot.fx.reverb_shimmer_feedback, 0.0f, 1.0f);
    fx.reverb_warp = clampFloat(snapshot.fx.reverb_warp, 0.0f, 1.0f);
    fx.reverb_cross_feed = clampFloat(snapshot.fx.reverb_cross_feed, 0.0f, 1.0f);
    fx.reverb_early_reflections = clampFloat(snapshot.fx.reverb_early_reflections, 0.0f, 1.0f);
    fx.reverb_air_absorption = clampFloat(snapshot.fx.reverb_air_absorption, 0.0f, 1.0f);
    fx.reverb_saturation_mode = clampU32(snapshot.fx.reverb_saturation_mode, 0u, 2u);
    fx.reverb_transient_smooth = clampFloat(snapshot.fx.reverb_transient_smooth, 0.0f, 1.0f);
    fx.reverb_er_lp_freq = clampFloat(snapshot.fx.reverb_er_lp_freq, 200.0f, 12000.0f);
    fx.reverb_pre_comp_threshold = clampFloat(snapshot.fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
    fx.reverb_pre_comp_knee = clampFloat(snapshot.fx.reverb_pre_comp_knee, 0.0f, 40.0f);
    fx.reverb_pre_comp_ratio = clampFloat(snapshot.fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
    fx.reverb_pre_comp_attack_ms = clampFloat(snapshot.fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
    fx.reverb_pre_comp_release_ms = clampFloat(snapshot.fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
    fx.reverb_pre_comp_makeup = clampFloat(snapshot.fx.reverb_pre_comp_makeup, 0.5f, 4.0f);
    fx.spectral_freeze_mix = clampFloat(snapshot.fx.spectral_freeze_mix, 0.0f, 1.0f);
    fx.spectral_freeze_enabled = snapshot.fx.spectral_freeze_enabled != 0u;
    fx.spectral_freeze_active = snapshot.fx.spectral_freeze_active != 0u;
    fx.spectral_freeze_slushy = snapshot.fx.spectral_freeze_slushy != 0u;
    fx.spectral_freeze_speed = clampFloat(snapshot.fx.spectral_freeze_speed, 0.0f, 1.0f);
    fx.spectral_freeze_decay = clampFloat(snapshot.fx.spectral_freeze_decay, 0.0f, 1.0f);
    fx.spectral_freeze_phase_jitter = clampFloat(snapshot.fx.spectral_freeze_phase_jitter, 0.0f, 1.0f);
    fx.dynamics_drive = clampFloat(snapshot.fx.dynamics_drive, 0.0f, 1.0f);
    fx.dynamics_enabled = snapshot.fx.dynamics_enabled != 0u;
    fx.dynamics_character_enabled = snapshot.fx.dynamics_character_enabled != 0u;
    fx.dynamics_character_mode = clampU32(snapshot.fx.dynamics_character_mode, 0u, 2u);
    fx.dynamics_character_mix = clampFloat(snapshot.fx.dynamics_character_mix, 0.0f, 1.0f);
    fx.dynamics_character_age = clampFloat(snapshot.fx.dynamics_character_age, 0.0f, 1.0f);
    fx.dynamics_character_bias = clampFloat(snapshot.fx.dynamics_character_bias, 0.0f, 1.0f);
    fx.dynamics_character_lpg_amount = clampFloat(snapshot.fx.dynamics_character_lpg_amount, 0.0f, 1.0f);
    fx.dynamics_character_resonance = clampFloat(snapshot.fx.dynamics_character_resonance, 0.0f, 1.0f);
    fx.dynamics_character_stereo = clampFloat(snapshot.fx.dynamics_character_stereo, 0.0f, 1.0f);
    fx.dynamics_character_env_follow = clampFloat(snapshot.fx.dynamics_character_env_follow, 0.0f, 1.0f);
    fx.dynamics_character_depth = clampFloat(snapshot.fx.dynamics_character_depth, 0.0f, 1.0f);
    fx.dynamics_character_rate = clampFloat(snapshot.fx.dynamics_character_rate, 0.0f, 1.0f);
    fx.dynamics_character_damp = clampFloat(snapshot.fx.dynamics_character_damp, 0.0f, 1.0f);
    fx.dynamics_degrade_enabled = snapshot.fx.dynamics_degrade_enabled != 0u;
    fx.dynamics_degrade_mix = clampFloat(snapshot.fx.dynamics_degrade_mix, 0.0f, 1.0f);
    fx.dynamics_degrade_age = clampFloat(snapshot.fx.dynamics_degrade_age, 0.0f, 1.0f);
    fx.dynamics_degrade_generation = clampFloat(snapshot.fx.dynamics_degrade_generation, 0.0f, 1.0f);
    fx.dynamics_degrade_alias = clampFloat(snapshot.fx.dynamics_degrade_alias, 0.0f, 1.0f);
    fx.dynamics_degrade_wow = clampFloat(snapshot.fx.dynamics_degrade_wow, 0.0f, 1.0f);
    fx.dynamics_degrade_flutter = clampFloat(snapshot.fx.dynamics_degrade_flutter, 0.0f, 1.0f);
    fx.dynamics_degrade_drift = clampFloat(snapshot.fx.dynamics_degrade_drift, 0.0f, 1.0f);
    fx.dynamics_degrade_wobble_speed = clampFloat(snapshot.fx.dynamics_degrade_wobble_speed, 0.0f, 1.0f);
    fx.dynamics_degrade_tone = clampFloat(snapshot.fx.dynamics_degrade_tone, 0.0f, 1.0f);
    fx.dynamics_degrade_hp = clampFloat(snapshot.fx.dynamics_degrade_hp, 0.0f, 1.0f);
    fx.dynamics_degrade_lp = clampFloat(snapshot.fx.dynamics_degrade_lp, 0.0f, 1.0f);
    fx.dynamics_degrade_noise = clampFloat(snapshot.fx.dynamics_degrade_noise, 0.0f, 1.0f);
    fx.dynamics_degrade_saturation = clampFloat(snapshot.fx.dynamics_degrade_saturation, 0.0f, 1.0f);
    fx.dynamics_degrade_corrosion = clampFloat(snapshot.fx.dynamics_degrade_corrosion, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_slow_wow, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_slow_flutter, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_slow_lp, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_slow_wet, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_slow_dropout, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_slow_alias, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_flutter_wow, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_flutter_flutter, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_flutter_lp, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_flutter_wet, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_flutter_dropout, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_flutter_alias, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_random_wow, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_random_flutter, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_random_lp, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_random_wet, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_random_dropout, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_random_alias, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_env_wow, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_env_flutter, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_env_lp, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_env_wet, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_env_dropout, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_env_alias, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_noise_wow, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_noise_flutter, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_noise_lp, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_noise_wet, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_noise_dropout, 0.0f, 1.0f);
    fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_noise_alias, 0.0f, 1.0f);
    fx.dynamics_saturation_enabled = snapshot.fx.dynamics_saturation_enabled != 0u;
    fx.dynamics_saturation_mode = clampU32(snapshot.fx.dynamics_saturation_mode, 0u, 4u);
    fx.dynamics_saturation_drive = clampFloat(snapshot.fx.dynamics_saturation_drive, 0.0f, 1.0f);
    fx.dynamics_saturation_tone = clampFloat(snapshot.fx.dynamics_saturation_tone, 0.0f, 1.0f);
    fx.dynamics_saturation_bias = clampFloat(snapshot.fx.dynamics_saturation_bias, 0.0f, 1.0f);
    fx.dynamics_end_comp_enabled = snapshot.fx.dynamics_end_comp_enabled != 0u;
    fx.dynamics_end_comp_threshold = clampFloat(snapshot.fx.dynamics_end_comp_threshold, -60.0f, 0.0f);
    fx.dynamics_end_comp_knee = clampFloat(snapshot.fx.dynamics_end_comp_knee, 0.0f, 40.0f);
    fx.dynamics_end_comp_ratio = clampFloat(snapshot.fx.dynamics_end_comp_ratio, 1.0f, 20.0f);
    fx.dynamics_end_comp_attack_ms = clampFloat(snapshot.fx.dynamics_end_comp_attack_ms, 0.1f, 100.0f);
    fx.dynamics_end_comp_release_ms = clampFloat(snapshot.fx.dynamics_end_comp_release_ms, 20.0f, 1500.0f);
    fx.dynamics_end_comp_makeup = clampFloat(snapshot.fx.dynamics_end_comp_makeup, 0.25f, 4.0f);
    fx.dynamics_end_comp_mix = clampFloat(snapshot.fx.dynamics_end_comp_mix, 0.0f, 1.0f);
    fx.dynamics_end_comp_detector_hp = clampFloat(snapshot.fx.dynamics_end_comp_detector_hp, 0.0f, 1.0f);
    fx.dynamics_end_comp_detector_tilt = clampFloat(snapshot.fx.dynamics_end_comp_detector_tilt, 0.0f, 1.0f);
    fx.dynamics_end_comp_auto_makeup = clampFloat(snapshot.fx.dynamics_end_comp_auto_makeup, 0.0f, 1.0f);
    fx.dynamics_end_comp_program_release = clampFloat(snapshot.fx.dynamics_end_comp_program_release, 0.0f, 1.0f);
    fx.sidechain_enabled = snapshot.fx.sidechain_enabled != 0u;
    fx.sidechain_key_a = clampU32(snapshot.fx.sidechain_key_a, kSidechainKeyOff, kSidechainKeyMembrane);
    fx.sidechain_key_b = clampU32(snapshot.fx.sidechain_key_b, kSidechainKeyOff, kSidechainKeyMembrane);
    fx.sidechain_key_a_weight = clampFloat(snapshot.fx.sidechain_key_a_weight, 0.0f, 1.0f);
    fx.sidechain_key_b_weight = clampFloat(snapshot.fx.sidechain_key_b_weight, 0.0f, 1.0f);
    fx.sidechain_amount = clampFloat(snapshot.fx.sidechain_amount, 0.0f, 1.0f);
    fx.sidechain_threshold = clampFloat(snapshot.fx.sidechain_threshold, -60.0f, 0.0f);
    fx.sidechain_ratio = clampFloat(snapshot.fx.sidechain_ratio, 1.0f, 20.0f);
    fx.sidechain_knee = clampFloat(snapshot.fx.sidechain_knee, 0.0f, 40.0f);
    fx.sidechain_attack_ms = clampFloat(snapshot.fx.sidechain_attack_ms, 0.1f, 100.0f);
    fx.sidechain_hold_ms = clampFloat(snapshot.fx.sidechain_hold_ms, 0.0f, 250.0f);
    fx.sidechain_release_ms = clampFloat(snapshot.fx.sidechain_release_ms, 20.0f, 1500.0f);
    fx.sidechain_makeup = clampFloat(snapshot.fx.sidechain_makeup, 0.25f, 4.0f);
    fx.sidechain_mix = clampFloat(snapshot.fx.sidechain_mix, 0.0f, 1.0f);
    fx.sidechain_curve = clampFloat(snapshot.fx.sidechain_curve, 0.0f, 1.0f);
    fx.sidechain_detector_hp = clampFloat(snapshot.fx.sidechain_detector_hp, 0.0f, 1.0f);
    fx.sidechain_detector_lp = clampFloat(snapshot.fx.sidechain_detector_lp, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainPad1] = clampFloat(snapshot.fx.sidechain_pad1_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainPad2] = clampFloat(snapshot.fx.sidechain_pad2_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainLead1] = clampFloat(snapshot.fx.sidechain_lead1_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainLead2] = clampFloat(snapshot.fx.sidechain_lead2_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainPiano] = clampFloat(snapshot.fx.sidechain_piano_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainGranular] = clampFloat(snapshot.fx.sidechain_granular_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainDelayA] = clampFloat(snapshot.fx.sidechain_delay_a_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainDelayB] = clampFloat(snapshot.fx.sidechain_delay_b_target, 0.0f, 1.0f);
    fx.sidechain_targets[kSidechainReverb] = clampFloat(snapshot.fx.sidechain_reverb_target, 0.0f, 1.0f);
    resetSidechainRuntime();
    routing.delay_a_to_delay_b = clampFloat(snapshot.routing.delay_a_to_delay_b, 0.0f, 1.0f);
    routing.delay_b_to_delay_a = clampFloat(snapshot.routing.delay_b_to_delay_a, 0.0f, 1.0f);
    routing.delay_to_reverb = clampFloat(snapshot.routing.delay_to_reverb, 0.0f, 1.0f);
    routing.granular_to_reverb = clampFloat(snapshot.routing.granular_to_reverb, 0.0f, 1.0f);
    routing.delay_a_to_granular = clampFloat(snapshot.routing.delay_a_to_granular, 0.0f, 1.0f);
    routing.delay_b_to_granular = clampFloat(snapshot.routing.delay_b_to_granular, 0.0f, 1.0f);
    routing.delay_b_to_reverb = clampFloat(snapshot.routing.delay_b_to_reverb, 0.0f, 1.0f);
    configureFxModules();

    for (uint32_t i = 0; i < kSourceCount; ++i) {
      const KesshoProductSourceSnapshot& source = snapshot.sources[i];
      sources[i].enabled = source.enabled != 0u;
      sources[i].source_id = source.source_id == 0u ? i + 1u : source.source_id;
      sources[i].preset_id = source.preset_id == 0u ? defaultSourcePresetId(sources[i].source_id) : source.preset_id;
      sources[i].asset_id = source.asset_id;
      if (sources[i].last_missing_asset_id != source.asset_id) {
        sources[i].last_missing_asset_id = 0u;
      }
      sources[i].level = clampFloat(source.level, 0.0f, 1.5f);
      sources[i].morph = clampFloat(source.morph, 0.0f, 1.0f);
      sources[i].distance = clampFloat(source.distance, 0.0f, 1.0f);
      sources[i].expression = clampFloat(source.expression, 0.0f, 1.0f);
      sources[i].dry_gain = clampFloat(source.dry_gain, 0.0f, 2.0f);
      sources[i].reverb_send = clampFloat(source.reverb_send, 0.0f, 2.0f);
      sources[i].delay_a_send = clampFloat(source.delay_a_send, 0.0f, 2.0f);
      sources[i].delay_b_send = clampFloat(source.delay_b_send, 0.0f, 2.0f);
      sources[i].granular_send = clampFloat(source.granular_send, 0.0f, 2.0f);
      sources[i].post_lpf_hz = source.post_lpf_hz > 0.0f && std::isfinite(source.post_lpf_hz)
          ? clampFloat(source.post_lpf_hz, 20.0f, 20000.0f)
          : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
      sources[i].stereo_width = std::isfinite(source.stereo_width)
          ? clampFloat(source.stereo_width, 0.0f, 1.0f)
          : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
      sources[i].post_lpf_key_tracking = std::isfinite(source.post_lpf_key_tracking)
          ? clampFloat(source.post_lpf_key_tracking, 0.0f, 1.0f)
          : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING;
      sources[i].hold_seconds = clampFloat(source.hold_seconds, 0.001f, 20.0f);
      sources[i].exact_pad_param_count = std::min<uint32_t>(
          source.exact_pad_param_count,
          kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT);
      for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT; ++param_index) {
        sources[i].exact_pad_params[param_index] =
            param_index < sources[i].exact_pad_param_count && std::isfinite(source.exact_pad_params[param_index])
                ? source.exact_pad_params[param_index]
                : 0.0f;
      }
      sources[i].exact_lead_param_count = std::min<uint32_t>(
          source.exact_lead_param_count,
          kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT);
      for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++param_index) {
        sources[i].exact_lead_params[param_index] =
            param_index < sources[i].exact_lead_param_count && std::isfinite(source.exact_lead_params[param_index])
                ? source.exact_lead_params[param_index]
                : 0.0f;
      }
      sources[i].exact_drum_param_count = std::min<uint32_t>(
          source.exact_drum_param_count,
          kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT);
      for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT; ++param_index) {
        sources[i].exact_drum_params[param_index] =
            param_index < sources[i].exact_drum_param_count && std::isfinite(source.exact_drum_params[param_index])
                ? source.exact_drum_params[param_index]
                : 0.0f;
      }
      for (uint32_t voice_index = 0; voice_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT; ++voice_index) {
        sources[i].drum_voice_preset_a_ids[voice_index] = source.drum_voice_preset_a_ids[voice_index];
        sources[i].drum_voice_preset_b_ids[voice_index] = source.drum_voice_preset_b_ids[voice_index];
        sources[i].drum_voice_morphs[voice_index] = std::isfinite(source.drum_voice_morphs[voice_index])
            ? clampFloat(source.drum_voice_morphs[voice_index], 0.0f, 1.0f)
            : 0.0f;
      }
    }
    SourceState& soundscape_source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
    soundscape_source.asset_ref_count = 0;
    std::fill(soundscape_source.asset_refs, soundscape_source.asset_refs + kMaxSoundscapeAssetRefs, 0u);
    for (uint32_t ref_index = 0; ref_index < 32u && soundscape_source.asset_ref_count < kMaxSoundscapeAssetRefs; ++ref_index) {
      const uint32_t asset_id = snapshot.asset_refs[ref_index];
      if (asset_id == 0u) {
        continue;
      }
      bool already_present = false;
      for (uint32_t i = 0; i < soundscape_source.asset_ref_count; ++i) {
        already_present = already_present || soundscape_source.asset_refs[i] == asset_id;
      }
      if (!already_present) {
        soundscape_source.asset_refs[soundscape_source.asset_ref_count++] = asset_id;
      }
    }
    if (soundscape_source.asset_ref_count == 0u && soundscape_source.asset_id != 0u) {
      soundscape_source.asset_refs[soundscape_source.asset_ref_count++] = soundscape_source.asset_id;
    }
    soundscape_source.last_missing_asset_id = 0u;

    synth_lane_count = std::min<uint32_t>(snapshot.synth_euclid.lane_count, kMaxLaneCount);
    drum_lane_count = std::min<uint32_t>(snapshot.drum_euclid.lane_count, kMaxLaneCount);
    loadLaneSnapshots(snapshot.synth_euclid, synth_lanes, KESSHO_PRODUCT_SOURCE_PAD1);
    loadLaneSnapshots(snapshot.drum_euclid, drum_lanes, KESSHO_PRODUCT_SOURCE_DRUM);
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return KESSHO_PRODUCT_OK;
  }

  void loadLaneSnapshots(
      const KesshoProductSequencerSnapshot& snapshot,
      LaneState* lanes,
      uint32_t fallback_source) {
    const uint32_t count = std::min<uint32_t>(snapshot.lane_count, kMaxLaneCount);
    for (uint32_t i = 0; i < count; ++i) {
      const KesshoProductSequencerLaneSnapshot& lane = snapshot.lanes[i];
      lanes[i].enabled = lane.enabled != 0u;
      lanes[i].target_source_id = lane.target_source_id == 0u ? fallback_source : lane.target_source_id;
      lanes[i].step_count = clampU32(lane.step_count, 1u, 64u);
      lanes[i].fill_count = clampU32(lane.fill_count, 0u, lanes[i].step_count);
      lanes[i].rotation = lane.rotation;
      lanes[i].clock_division = clampU32(lane.clock_division, 1u, 128u);
      lanes[i].swing = clampFloat(lane.swing, 0.0f, 1.0f);
      lanes[i].probability = clampFloat(lane.probability, 0.0f, 1.0f);
      lanes[i].ratchet = clampU32(lane.ratchet, 1u, 8u);
      lanes[i].trig_condition = lane.trig_condition;
      lanes[i].midi_note = clampFloat(lane.midi_note, 0.0f, 127.0f);
      lanes[i].velocity = clampFloat(lane.velocity, 0.0f, 1.0f);
      lanes[i].hold_seconds = clampFloat(lane.hold_seconds, 0.001f, 20.0f);
      lanes[i].morph = clampFloat(lane.morph, 0.0f, 1.0f);
      lanes[i].distance = clampFloat(lane.distance, 0.0f, 1.0f);
      lanes[i].expression = clampFloat(lane.expression, 0.0f, 1.0f);
      lanes[i].seed = lane.seed == 0u ? rng_seed + i + 1u : lane.seed;
      lanes[i].bar_reset = lane.bar_reset != 0u;
      lanes[i].phrase_reset = lane.phrase_reset != 0u;
      lanes[i].manual_step_mask_low = lane.manual_step_mask_low;
      lanes[i].manual_step_mask_high = lane.manual_step_mask_high;
      lanes[i].step_override_set_low = 0;
      lanes[i].step_override_set_high = 0;
      lanes[i].step_override_value_low = 0;
      lanes[i].step_override_value_high = 0;
      clearLaneStepOverrides(lanes[i]);
    }
  }

  int32_t enqueueEvent(const KesshoProductEvent& event) {
    if (control_event_count >= kessho::product::generated::KESSHO_PRODUCT_MAX_CONTROL_EVENTS) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
      return KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
    }
    if (!std::isfinite(event.value) || !std::isfinite(event.value2) || !std::isfinite(event.value3) || !std::isfinite(event.value4)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    }
    control_events[control_event_count].event = event;
    control_events[control_event_count].sequence = next_control_sequence++;
    ++control_event_count;
    telemetry.control_queue_depth = control_event_count;
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return KESSHO_PRODUCT_OK;
  }

  void sortControlEvents() {
    for (uint32_t i = 1; i < control_event_count; ++i) {
      QueuedProductEvent key = control_events[i];
      uint32_t j = i;
      while (
          j > 0 &&
          (key.event.sample_offset < control_events[j - 1].event.sample_offset ||
           (key.event.sample_offset == control_events[j - 1].event.sample_offset &&
            key.sequence < control_events[j - 1].sequence))) {
        control_events[j] = control_events[j - 1];
        --j;
      }
      control_events[j] = key;
    }
  }

  float manualNoteHoldSeconds(uint32_t source_id, float requested_seconds) const {
    if (
        (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) &&
        source_id >= 1u &&
        source_id <= kSourceCount) {
      return clampFloat(sources[source_id - 1u].hold_seconds, 0.001f, 20.0f);
    }
    return clampFloat(requested_seconds, 0.001f, 20.0f);
  }

  void applyControlEvent(const KesshoProductEvent& event) {
    switch (event.event_kind) {
      case KESSHO_PRODUCT_EVENT_KIND_START:
        transport.running = true;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_STOP:
        transport.running = false;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_RESET_TRANSPORT:
        transport.reset();
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT:
        transport.bpm = clampFloat(event.value, 1.0f, 400.0f);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP:
        applySequencerStepEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE:
        applySequencerLaneParamEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_STATE:
        applyJourneyStateEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_PARAM:
        applyParam(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_ENABLED:
        if (event.target_id >= 1u && event.target_id <= kSourceCount) {
          sources[event.target_id - 1u].enabled = event.value >= 0.5f;
        }
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET:
        applySourcePresetEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON: {
        const uint32_t source_id = event.target_id == 0u ? KESSHO_PRODUCT_SOURCE_PAD1 : event.target_id;
        triggerVoice(
            source_id,
            event.value,
            event.value2,
            manualNoteHoldSeconds(source_id, event.value3),
            -1.0f,
            -1.0f,
            event.value4 > 0.0f ? event.value4 : -1.0f,
            0u,
            0u,
            false);
        break;
      }
      case KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_OFF:
        releaseSourceVoices(event.target_id);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT:
        applyMidiEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE:
        triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 36.0f + static_cast<float>(event.target_id % 24u), event.value <= 0.0f ? 0.8f : event.value, 0.12f);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_START_JOURNEY_MORPH_CLOCK:
        journey_running = true;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_STOP_JOURNEY_MORPH_CLOCK:
        journey_running = false;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_HARMONY_ROOT:
        harmony.root_midi = clampFloat(event.value, 0.0f, 127.0f);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_SCALE:
        harmony.scale_id = event.target_id == 0u ? 1u : event.target_id;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_SEED:
        rng_seed = event.target_id == 0u ? 1u : event.target_id;
        rng_state = rng_seed;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_RESET_RNG:
        rng_state = rng_seed;
        break;
      case KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE:
        applyModulationRangeEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_RESET_SEQUENCER_LANE_HOME:
        applyResetSequencerLaneHomeEvent(event);
        break;
      case KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE:
        applyDiceSequencerLaneEvent(event);
        break;
      default:
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
        break;
    }
  }

  uint32_t resolveMidiTargetSource(const KesshoProductEvent& event, uint32_t status) const {
    if (event.target_id >= 1u && event.target_id <= kSourceCount) {
      return event.target_id;
    }
    const uint32_t channel = event.index <= 15u ? event.index : (status & 0x0fu);
    if (channel == 9u) {
      return KESSHO_PRODUCT_SOURCE_DRUM;
    }
    switch (channel) {
      case 1u:
        return KESSHO_PRODUCT_SOURCE_LEAD2;
      case 2u:
        return KESSHO_PRODUCT_SOURCE_PAD1;
      case 3u:
        return KESSHO_PRODUCT_SOURCE_PAD2;
      case 4u:
        return KESSHO_PRODUCT_SOURCE_PIANO;
      case 5u:
        return KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
      default:
        return KESSHO_PRODUCT_SOURCE_LEAD1;
    }
  }

  void applyMidiEvent(const KesshoProductEvent& event) {
    const uint32_t status = static_cast<uint32_t>(std::lround(clampFloat(event.value, 0.0f, 255.0f)));
    const uint32_t command = status & 0xf0u;
    const float data1 = clampFloat(event.value2, 0.0f, 127.0f);
    const float data2 = clampFloat(event.value3, 0.0f, 127.0f);
    const uint32_t source_id = resolveMidiTargetSource(event, status);
    if (command == 0x90u && data2 > 0.0f) {
      triggerVoice(source_id, data1, clampFloat(data2 / 127.0f, 0.0f, 1.0f), 0.5f);
      return;
    }
    if (command == 0x80u || (command == 0x90u && data2 <= 0.0f)) {
      releaseSourceVoices(source_id);
      return;
    }
    if (command == 0xb0u && event.param_id != 0u) {
      KesshoProductEvent param_event = event;
      param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
      param_event.value = clampFloat(event.value4, 0.0f, 1.0f);
      applyParam(param_event);
      return;
    }
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  void clearStepOverride(LaneState& lane, uint32_t step) {
    if (step < 32u) {
      const uint32_t bit = 1u << step;
      lane.step_override_set_low &= ~bit;
      lane.step_override_value_low &= ~bit;
      return;
    }
    const uint32_t bit = 1u << (step - 32u);
    lane.step_override_set_high &= ~bit;
    lane.step_override_value_high &= ~bit;
  }

  bool stepMaskHas(uint32_t low, uint32_t high, uint32_t step) const {
    if (step < 32u) {
      return (low & (1u << step)) != 0u;
    }
    return (high & (1u << (step - 32u))) != 0u;
  }

  void setStepMask(uint32_t& low, uint32_t& high, uint32_t step) {
    if (step < 32u) {
      low |= 1u << step;
      return;
    }
    high |= 1u << (step - 32u);
  }

  void clearStepMask(uint32_t& low, uint32_t& high, uint32_t step) {
    if (step < 32u) {
      low &= ~(1u << step);
      return;
    }
    high &= ~(1u << (step - 32u));
  }

  float stepFloatValue(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const float values[64],
      float fallback) const {
    return stepMaskHas(low, high, step) ? values[step] : fallback;
  }

  uint32_t stepU32Value(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const uint32_t values[64],
      uint32_t fallback) const {
    return stepMaskHas(low, high, step) ? values[step] : fallback;
  }

  void setStepOverride(LaneState& lane, uint32_t step, bool enabled) {
    if (step < 32u) {
      const uint32_t bit = 1u << step;
      lane.step_override_set_low |= bit;
      if (enabled) {
        lane.step_override_value_low |= bit;
      } else {
        lane.step_override_value_low &= ~bit;
      }
      return;
    }
    const uint32_t bit = 1u << (step - 32u);
    lane.step_override_set_high |= bit;
    if (enabled) {
      lane.step_override_value_high |= bit;
    } else {
      lane.step_override_value_high &= ~bit;
    }
  }

  void clearLaneStepOverrides(LaneState& lane) {
    lane.step_override_set_low = 0;
    lane.step_override_set_high = 0;
    lane.step_override_value_low = 0;
    lane.step_override_value_high = 0;
    lane.probability_override_set_low = 0;
    lane.probability_override_set_high = 0;
    lane.ratchet_override_set_low = 0;
    lane.ratchet_override_set_high = 0;
    lane.trig_condition_override_set_low = 0;
    lane.trig_condition_override_set_high = 0;
    lane.midi_note_override_set_low = 0;
    lane.midi_note_override_set_high = 0;
    lane.expression_override_set_low = 0;
    lane.expression_override_set_high = 0;
    lane.morph_override_set_low = 0;
    lane.morph_override_set_high = 0;
    lane.distance_override_set_low = 0;
    lane.distance_override_set_high = 0;
    for (StepValueSubLaneConfig& config : lane.step_value_configs) {
      config = {};
    }
  }

  uint32_t stepFieldId(uint32_t field) const {
    return (field >> KESSHO_PRODUCT_STEP_FIELD_SHIFT) & KESSHO_PRODUCT_STEP_FIELD_ID_MASK;
  }

  bool validStepFieldId(uint32_t field_id) const {
    return field_id < 8u;
  }

  void applyStepFieldConfig(LaneState& lane, const KesshoProductEvent& event) {
    const uint32_t field_id = event.param_id & KESSHO_PRODUCT_STEP_FIELD_ID_MASK;
    if (!validStepFieldId(field_id)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }

    StepValueSubLaneConfig& config = lane.step_value_configs[field_id];
    if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_FIELD) != 0u ||
        (event.flags & KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE) == 0u ||
        event.value < 0.5f) {
      config = {};
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }

    config.enabled = true;
    config.steps = clampU32(static_cast<uint32_t>(std::lround(event.value2)), 1u, 64u);
    config.direction = clampU32(
        static_cast<uint32_t>(std::lround(event.value3)),
        KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD,
        KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG);
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  uint32_t subLaneStepForField(
      const LaneState& lane,
      uint32_t field,
      uint32_t trigger_step,
      int64_t absolute_step) const {
    const uint32_t field_id = stepFieldId(field);
    if (!validStepFieldId(field_id)) {
      return trigger_step;
    }

    const StepValueSubLaneConfig& config = lane.step_value_configs[field_id];
    if (!config.enabled || config.steps == 0u || absolute_step < 0) {
      return trigger_step;
    }

    const uint32_t steps = clampU32(config.steps, 1u, 64u);
    const uint64_t phase = static_cast<uint64_t>(absolute_step);
    if (config.direction == KESSHO_PRODUCT_SUBLANE_DIRECTION_REVERSE) {
      return steps - 1u - static_cast<uint32_t>(phase % steps);
    }
    if (config.direction == KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG && steps > 1u) {
      const uint32_t period = steps * 2u - 2u;
      const uint32_t position = static_cast<uint32_t>(phase % period);
      return position < steps ? position : period - position;
    }
    return static_cast<uint32_t>(phase % steps);
  }

  void clearStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step) {
    switch (field) {
      case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
        clearStepMask(lane.probability_override_set_low, lane.probability_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
        clearStepMask(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION:
        clearStepMask(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
        clearStepMask(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
        clearStepMask(lane.expression_override_set_low, lane.expression_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_MORPH:
        clearStepMask(lane.morph_override_set_low, lane.morph_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
        clearStepMask(lane.distance_override_set_low, lane.distance_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_TRIGGER:
      default:
        clearStepOverride(lane, step);
        break;
    }
  }

  void setStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step, float value, float value2) {
    switch (field) {
      case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
        lane.probability_overrides[step] = clampFloat(value, 0.0f, 1.0f);
        setStepMask(lane.probability_override_set_low, lane.probability_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
        lane.ratchet_overrides[step] = clampU32(static_cast<uint32_t>(std::lround(value)), 1u, 8u);
        setStepMask(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION:
        lane.trig_condition_numerators[step] = clampU32(static_cast<uint32_t>(std::lround(value)), 1u, 16u);
        lane.trig_condition_denominators[step] = clampU32(static_cast<uint32_t>(std::lround(value2)), 1u, 16u);
        setStepMask(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
        lane.midi_note_overrides[step] = clampFloat(value, 0.0f, 127.0f);
        setStepMask(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
        lane.expression_overrides[step] = clampFloat(value, 0.0f, 1.0f);
        setStepMask(lane.expression_override_set_low, lane.expression_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_MORPH:
        lane.morph_overrides[step] = clampFloat(value, 0.0f, 1.0f);
        setStepMask(lane.morph_override_set_low, lane.morph_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
        lane.distance_overrides[step] = clampFloat(value, 0.0f, 1.0f);
        setStepMask(lane.distance_override_set_low, lane.distance_override_set_high, step);
        break;
      case KESSHO_PRODUCT_STEP_FIELD_TRIGGER:
      default:
        setStepOverride(lane, step, value >= 0.5f);
        break;
    }
  }

  void applySequencerStepEvent(const KesshoProductEvent& event) {
    uint32_t lane_count = 0;
    LaneState* lanes = sequencerLanesForEvent(event, lane_count);
    if (lanes == nullptr) {
      return;
    }
    if (event.index >= lane_count) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      return;
    }

    LaneState& lane = lanes[event.index];
    const uint32_t field = event.flags & KESSHO_PRODUCT_STEP_FIELD_MASK;
    if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_LANE) != 0u) {
      clearLaneStepOverrides(lane);
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }
    if (field == KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG) {
      applyStepFieldConfig(lane, event);
      return;
    }
    if (event.param_id >= 64u) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }

    const uint32_t step = event.param_id % std::max(1u, lane.step_count);
    if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_FIELD) != 0u) {
      clearStepFieldOverride(lane, field, step);
    } else if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE) != 0u) {
      setStepFieldOverride(lane, field, step, event.value, event.value2);
    } else {
      clearStepFieldOverride(lane, field, step);
    }
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  bool isSequencerLaneParam(uint32_t param_id) const {
    switch (param_id) {
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_RATCHET_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TRIG_CONDITION_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID:
        return true;
      default:
        return false;
    }
  }

  void applySequencerLaneParamEvent(const KesshoProductEvent& event) {
    uint32_t lane_count = 0;
    LaneState* lanes = sequencerLanesForEvent(event, lane_count);
    if (lanes == nullptr) {
      return;
    }
    if (event.index >= lane_count) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      return;
    }

    LaneState& lane = lanes[event.index];
    switch (event.param_id) {
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID:
        lane.enabled = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID: {
        const uint32_t source_id = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, kSourceCount);
        lane.target_source_id = source_id;
        break;
      }
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
        lane.step_count = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 64u);
        lane.fill_count = clampU32(lane.fill_count, 0u, lane.step_count);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
        lane.fill_count = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, lane.step_count);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
        lane.rotation = static_cast<int32_t>(std::lround(clampFloat(event.value, -64.0f, 64.0f)));
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
        lane.clock_division = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 128u);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
        lane.swing = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID:
        lane.probability = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_RATCHET_ID:
        lane.ratchet = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 8u);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TRIG_CONDITION_ID:
        lane.trig_condition = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value)));
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID:
        lane.midi_note = clampFloat(event.value, 0.0f, 127.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID:
        lane.velocity = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID:
        lane.hold_seconds = clampFloat(event.value, 0.001f, 20.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID: {
        const uint32_t seed = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value)));
        lane.seed = seed == 0u ? rng_seed + event.index + 1u : seed;
        break;
      }
      default:
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
    }
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  LaneState* sequencerLanesForEvent(const KesshoProductEvent& event, uint32_t& lane_count) {
    if (event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
      lane_count = synth_lane_count;
      return synth_lanes;
    }
    if (event.target_id == KESSHO_PRODUCT_SEQUENCER_DRUM) {
      lane_count = drum_lane_count;
      return drum_lanes;
    }
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    lane_count = 0;
    return nullptr;
  }

  void applyResetSequencerLaneHomeEvent(const KesshoProductEvent& event) {
    uint32_t lane_count = 0;
    LaneState* lanes = sequencerLanesForEvent(event, lane_count);
    if (lanes == nullptr) {
      return;
    }
    if (event.index >= lane_count) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      return;
    }
    clearLaneStepOverrides(lanes[event.index]);
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  bool dicePatternHit(uint32_t step, uint32_t steps, uint32_t fills, uint32_t rotation) const {
    return euclidHit(step, steps, fills, static_cast<int32_t>(rotation));
  }

  bool dicePatternMatchesBase(const LaneState& lane, uint32_t rotation, uint32_t fills) const {
    for (uint32_t step = 0; step < lane.step_count; ++step) {
      if (dicePatternHit(step, lane.step_count, fills, rotation) != euclidHit(step, lane.step_count, lane.fill_count, lane.rotation)) {
        return false;
      }
    }
    return true;
  }

  void applyDiceSequencerLaneEvent(const KesshoProductEvent& event) {
    uint32_t lane_count = 0;
    LaneState* lanes = sequencerLanesForEvent(event, lane_count);
    if (lanes == nullptr) {
      return;
    }
    if (event.index >= lane_count) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
      return;
    }

    LaneState& lane = lanes[event.index];
    clearLaneStepOverrides(lane);
    const float intensity = clampFloat(event.value <= 0.0f ? 1.0f : event.value, 0.0f, 1.0f);
    if (intensity <= 0.0001f || lane.step_count == 0u) {
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }

    const uint32_t event_seed = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value2)));
    const uint32_t dice_nonce = event_seed == 0u ? rng_state : event_seed;
    const uint32_t seed = hashU32(
        rng_seed ^
        rng_state ^
        evolution_state ^
        lane.seed ^
        dice_nonce ^
        (event.target_id * 16777619u) ^
        (event.index * 2246822519u) ^
        (event.flags * 3266489917u));
    rng_state = hashU32(seed ^ rng_state ^ 0x9e3779b9u);
    if (rng_state == 0u) {
      rng_state = rng_seed == 0u ? 1u : rng_seed;
    }
    const uint32_t steps = clampU32(lane.step_count, 1u, 64u);
    uint32_t fills = lane.fill_count == 0u ? std::max(1u, steps / 4u) : lane.fill_count;
    fills = clampU32(fills, 1u, steps);
    uint32_t rotation = steps > 1u ? (hashU32(seed ^ 0x6c8e9cf5u) % steps) : 0u;
    for (uint32_t attempts = 0; attempts < steps && dicePatternMatchesBase(lane, rotation, fills); ++attempts) {
      rotation = (rotation + 1u) % steps;
    }

    for (uint32_t step = 0; step < steps; ++step) {
      const bool base_hit = manualMaskHit(lane, step);
      const bool random_hit = dicePatternHit(step, steps, fills, rotation);
      const bool use_random_hit = intensity >= 0.999f || hashUnit(seed ^ step ^ 0xb5297a4du) < intensity;
      setStepOverride(lane, step, use_random_hit ? random_hit : base_hit);

      const float random_probability = 0.25f + hashUnit(seed ^ (step * 747796405u) ^ 0x7f4a7c15u) * 0.75f;
      const float probability = clampFloat(lane.probability * (1.0f - intensity) + random_probability * intensity, 0.0f, 1.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step, probability, 0.0f);

      const float expression = clampFloat(lane.expression * (1.0f - intensity) + hashUnit(seed ^ (step * 1597334677u) ^ 0x94d049bbu) * intensity, 0.0f, 1.0f);
      const float morph = clampFloat(lane.morph * (1.0f - intensity) + hashUnit(seed ^ (step * 3812015801u) ^ 0x2c1b3c6du) * intensity, 0.0f, 1.0f);
      const float distance = clampFloat(lane.distance * (1.0f - intensity) + hashUnit(seed ^ (step * 1103515245u) ^ 0x165667b1u) * intensity, 0.0f, 1.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, step, expression, 0.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_MORPH, step, morph, 0.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, step, distance, 0.0f);

      if (event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
        const int32_t offset = static_cast<int32_t>(hashU32(seed ^ (step * 668265263u) ^ 0x27d4eb2fu) % 25u) - 12;
        const float midi = clampFloat(lane.midi_note + static_cast<float>(std::lround(static_cast<float>(offset) * intensity)), 0.0f, 127.0f);
        setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step, midi, 0.0f);
      }
    }
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  void applyJourneyStateEvent(const KesshoProductEvent& event) {
    journey_running = event.value >= 0.5f;
    journey_phase = clampFloat(event.value2, 0.0f, 1.0f);
    if (event.value3 > 0.0f) {
      journey_rate_bars = clampFloat(event.value3, 0.25f, 128.0f);
    }
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  bool applyGranularVoiceParamEvent(const KesshoProductEvent& event) {
    const uint32_t voice_param_bases[kGranularVoiceCount] = {
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V2_ENABLED_ID,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V3_ENABLED_ID,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V4_ENABLED_ID,
    };
    for (uint32_t voice_index = 0; voice_index < kGranularVoiceCount; ++voice_index) {
      const uint32_t base = voice_param_bases[voice_index];
      if (event.param_id < base || event.param_id >= base + kGranularVoiceParamCount) {
        continue;
      }
      GranularVoiceState& voice = fx.granular_voices[voice_index];
      switch (event.param_id - base) {
        case 0:
          voice.enabled = event.value >= 0.5f;
          break;
        case 1:
          voice.mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
          break;
        case 2:
          voice.slice = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 15u);
          break;
        case 3:
          voice.speed = clampFloat(event.value, 0.0f, 4.0f);
          break;
        case 4:
          voice.scan_rate = clampFloat(event.value, 0.25f, 4.0f);
          break;
        case 5:
          voice.reverse = event.value >= 0.5f;
          break;
        case 6:
          voice.pitch = clampFloat(event.value, -24.0f, 24.0f);
          break;
        case 7:
          voice.write_follow = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 8:
          voice.density = clampFloat(event.value, 1.0f, 64.0f);
          break;
        case 9:
          voice.grain_size_ms = clampFloat(event.value, 10.0f, 500.0f);
          break;
        case 10:
          voice.spray = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 11:
          voice.grain_octave_probability = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 12:
          voice.attack_seconds = clampFloat(event.value, 0.001f, 0.5f);
          break;
        case 13:
          voice.decay_seconds = clampFloat(event.value, 0.01f, 4.0f);
          break;
        case 14:
          voice.gain = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 15:
          voice.pan = clampFloat(event.value, -1.0f, 1.0f);
          break;
        case 16:
          voice.blur = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 17:
          voice.stereo_spread = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 18:
          voice.position_lfo_rate = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 19:
          voice.position_lfo_depth = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 20:
          voice.pan_lfo_rate = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 21:
          voice.reverse_lfo_rate = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 22:
          voice.record_lfo_rate = clampFloat(event.value, 0.0f, 1.0f);
          break;
        case 23:
          voice.euclid_gated = event.value >= 0.5f;
          break;
        case 24:
          voice.euclid_muted = event.value >= 0.5f;
          break;
        default:
          telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
          return true;
      }
      configureFxModules();
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return true;
    }
    return false;
  }

  bool applyGranularParamEvent(const KesshoProductEvent& event) {
    if (applyGranularVoiceParamEvent(event)) {
      return true;
    }
    switch (event.param_id) {
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID:
        fx.granular_mix = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_ENABLED_ID:
        fx.granular_enabled = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FREEZE_ID:
        fx.granular_freeze = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FREEZE_WITH_FEEDBACK_ID:
        fx.granular_freeze_with_feedback = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID:
        fx.granular_feedback = clampFloat(event.value, 0.0f, 0.85f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_LPF_HZ_ID:
        fx.granular_feedback_lpf_hz = clampFloat(event.value, 200.0f, 12000.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUFFER_SECONDS_ID:
        fx.granular_buffer_seconds = clampFloat(event.value, 1.0f, 32.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_GRAIN_SHAPE_ID:
        fx.granular_grain_shape = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUS_DIFFUSION_ID:
        fx.granular_bus_diffusion = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_TIMING_RANDOMNESS_ID:
        fx.granular_timing_randomness = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_CHORD_BIAS_ID:
        fx.granular_chord_bias = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_JITTER_MS_ID:
        fx.granular_legacy_jitter_ms = clampFloat(event.value, 0.0f, 30.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID:
        fx.granular_legacy_probability = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_MODE_ID:
        fx.granular_legacy_pitch_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 1u);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_SPREAD_ID:
        fx.granular_legacy_pitch_spread = clampFloat(event.value, 0.0f, 12.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID:
        fx.granular_legacy_max_grains = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 128u);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_FEEDBACK_ID:
        fx.granular_legacy_feedback = clampFloat(event.value, 0.0f, 0.35f);
        break;
      default:
        return false;
    }
    configureFxModules();
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return true;
  }

  bool applyDynamicsModParamEvent(const KesshoProductEvent& event) {
    if (
        event.param_id < KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID ||
        event.param_id > KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_NOISE_ALIAS_ID) {
      return false;
    }
    const uint32_t offset = event.param_id - KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID;
    const uint32_t source = offset / kDynamicsModTargetCount;
    const uint32_t target = offset % kDynamicsModTargetCount;
    if (source >= kDynamicsModSourceCount || target >= kDynamicsModTargetCount) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return true;
    }
    fx.dynamics_mod[source][target] = clampFloat(event.value, 0.0f, 1.0f);
    configureFxModules();
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return true;
  }

  void applyParam(const KesshoProductEvent& event) {
    if (applyGranularParamEvent(event)) {
      return;
    }
    if (applyDynamicsModParamEvent(event)) {
      return;
    }
    switch (event.param_id) {
      case KESSHO_PRODUCT_PARAM_TRANSPORT_RUNNING_ID:
        transport.running = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
        applySourceParam(event);
        break;
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_RATCHET_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TRIG_CONDITION_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID:
      case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID:
        applySequencerLaneParamEvent(event);
        break;
      case KESSHO_PRODUCT_PARAM_TRANSPORT_BPM_ID:
        transport.bpm = clampFloat(event.value, 1.0f, 400.0f);
        break;
      case KESSHO_PRODUCT_PARAM_TRANSPORT_BEATS_PER_BAR_ID:
        transport.beats_per_bar = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 32u);
        break;
      case KESSHO_PRODUCT_PARAM_TRANSPORT_BARS_PER_PHRASE_ID:
        transport.bars_per_phrase = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 256u);
        break;
      case KESSHO_PRODUCT_PARAM_TRANSPORT_SWING_ID:
        transport.swing = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID:
        master_gain = clampFloat(event.value, 0.0f, 1.5f);
        break;
      case KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID:
        setMasterLimiterCeilingDb(event.value);
        break;
      case KESSHO_PRODUCT_PARAM_MASTER_SATURATION_MODE_ID:
        master_saturation_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 4u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_MASTER_SATURATION_DRIVE_ID:
        master_saturation_drive = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_MASTER_SATURATION_TONE_ID:
        master_saturation_tone = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_HARMONY_ROOT_MIDI_ID:
        harmony.root_midi = clampFloat(event.value, 0.0f, 127.0f);
        break;
      case KESSHO_PRODUCT_PARAM_HARMONY_SCALE_ID_ID:
        harmony.scale_id = static_cast<uint32_t>(std::max(1.0f, event.value));
        break;
      case KESSHO_PRODUCT_PARAM_HARMONY_TENSION_ID:
        harmony.tension = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_JOURNEY_ENABLED_ID:
        journey_running = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_JOURNEY_MORPH_PHASE_ID:
        journey_phase = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_JOURNEY_MORPH_RATE_BARS_ID:
        journey_rate_bars = clampFloat(event.value, 0.25f, 128.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID:
        fx.granular_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AENABLED_ID:
        fx.delay_a_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_LEFT_MS_ID:
        fx.delay_a_time_left_ms = clampFloat(event.value, 10.0f, 5000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_RIGHT_MS_ID:
        fx.delay_a_time_right_ms = clampFloat(event.value, 10.0f, 5000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID:
        fx.delay_a_feedback = clampFloat(event.value, 0.0f, 0.95f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID:
        fx.delay_a_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID:
        fx.delay_a_filter_hz = clampFloat(event.value, 200.0f, 12000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_TYPE_ID:
        fx.delay_a_filter_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_RATE_HZ_ID:
        fx.delay_a_mod_rate_hz = clampFloat(event.value, 0.0f, 5.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_DEPTH_MS_ID:
        fx.delay_a_mod_depth_ms = clampFloat(event.value, 0.0f, 50.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_APING_PONG_ID:
        fx.delay_a_ping_pong = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_ADUCK_ID:
        fx.delay_a_duck = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_AWIDTH_ID:
        fx.delay_a_width = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_ACROSS_FEED_FILTER_HZ_ID:
        fx.delay_a_cross_feed_filter_hz = clampFloat(event.value, 200.0f, 12000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BENABLED_ID:
        fx.delay_b_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BACTIVITY_ID:
        fx.delay_b_activity = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BREPEATS_ID:
        fx.delay_b_repeats = clampFloat(event.value, 0.0f, 0.85f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BBASE_TIME_MS_ID:
        fx.delay_b_base_time_ms = clampFloat(event.value, 20.0f, 5000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BTONE_ID:
        fx.delay_b_tone = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BVIBRATO_ID:
        fx.delay_b_vibrato = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID:
        fx.delay_b_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPACE_MODE_ID:
        fx.delay_b_space_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 1u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BPATTERN_ID:
        fx.delay_b_pattern = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_ID:
        fx.delay_b_warp = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 3u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_INTENSITY_ID:
        fx.delay_b_warp_intensity = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID:
        fx.delay_b_spread = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID:
        fx.reverb_mix = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_TYPE_ID:
        fx.reverb_type = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 5u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_QUALITY_ID:
        fx.reverb_quality = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID:
        fx.reverb_decay = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID:
        fx.reverb_size = clampFloat(event.value, 0.5f, 10.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMPING_ID:
        fx.reverb_damping = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_DIFFUSION_ID:
        fx.reverb_diffusion = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_MODULATION_ID:
        fx.reverb_modulation = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PREDELAY_MS_ID:
        fx.reverb_predelay_ms = clampFloat(event.value, 0.0f, 100.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID:
        fx.reverb_width = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID:
        fx.reverb_shimmer_amount = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_PITCH_ID:
        fx.reverb_shimmer_pitch = clampFloat(event.value, -24.0f, 24.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_RATE_HZ_ID:
        fx.reverb_slow_rate_hz = clampFloat(event.value, 0.01f, 0.2f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_DEPTH_ID:
        fx.reverb_slow_depth = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_AMOUNT_ID:
        fx.reverb_reverse_amount = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_LENGTH_SEC_ID:
        fx.reverb_reverse_length_sec = clampFloat(event.value, 0.5f, 16.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_RATE_HZ_ID:
        fx.reverb_chorus_rate_hz = clampFloat(event.value, 0.05f, 2.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_DEPTH_ID:
        fx.reverb_chorus_depth = clampFloat(event.value, 0.0f, 40.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_MOD_CHARACTER_ID:
        fx.reverb_mod_character = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_LOW_ID:
        fx.reverb_damp_low = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID:
        fx.reverb_damp_high = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSSOVER_HZ_ID:
        fx.reverb_crossover_hz = clampFloat(event.value, 100.0f, 6000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_INPUT_TONE_ID:
        fx.reverb_input_tone = clampFloat(event.value, -1.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_FEEDBACK_ID:
        fx.reverb_shimmer_feedback = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_WARP_ID:
        fx.reverb_warp = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSS_FEED_ID:
        fx.reverb_cross_feed = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_EARLY_REFLECTIONS_ID:
        fx.reverb_early_reflections = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_AIR_ABSORPTION_ID:
        fx.reverb_air_absorption = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_SATURATION_MODE_ID:
        fx.reverb_saturation_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_TRANSIENT_SMOOTH_ID:
        fx.reverb_transient_smooth = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_ER_LP_FREQ_ID:
        fx.reverb_er_lp_freq = clampFloat(event.value, 200.0f, 12000.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_THRESHOLD_ID:
        fx.reverb_pre_comp_threshold = clampFloat(event.value, -60.0f, 0.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_KNEE_ID:
        fx.reverb_pre_comp_knee = clampFloat(event.value, 0.0f, 40.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RATIO_ID:
        fx.reverb_pre_comp_ratio = clampFloat(event.value, 1.0f, 20.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_ATTACK_MS_ID:
        fx.reverb_pre_comp_attack_ms = clampFloat(event.value, 0.1f, 30.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RELEASE_MS_ID:
        fx.reverb_pre_comp_release_ms = clampFloat(event.value, 20.0f, 1000.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_MAKEUP_ID:
        fx.reverb_pre_comp_makeup = clampFloat(event.value, 0.5f, 4.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID:
        fx.spectral_freeze_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ENABLED_ID:
        fx.spectral_freeze_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ACTIVE_ID:
        fx.spectral_freeze_active = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SLUSHY_ID:
        fx.spectral_freeze_slushy = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SPEED_ID:
        fx.spectral_freeze_speed = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DECAY_ID:
        fx.spectral_freeze_decay = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_PHASE_JITTER_ID:
        fx.spectral_freeze_phase_jitter = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID:
        fx.dynamics_drive = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_ENABLED_ID:
        fx.dynamics_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_ENABLED_ID:
        fx.dynamics_character_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MODE_ID:
        fx.dynamics_character_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 2u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MIX_ID:
        fx.dynamics_character_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_AGE_ID:
        fx.dynamics_character_age = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_BIAS_ID:
        fx.dynamics_character_bias = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_LPG_AMOUNT_ID:
        fx.dynamics_character_lpg_amount = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_RESONANCE_ID:
        fx.dynamics_character_resonance = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_STEREO_ID:
        fx.dynamics_character_stereo = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_ENV_FOLLOW_ID:
        fx.dynamics_character_env_follow = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_DEPTH_ID:
        fx.dynamics_character_depth = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_RATE_ID:
        fx.dynamics_character_rate = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_DAMP_ID:
        fx.dynamics_character_damp = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_ENABLED_ID:
        fx.dynamics_degrade_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_MIX_ID:
        fx.dynamics_degrade_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_AGE_ID:
        fx.dynamics_degrade_age = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_GENERATION_ID:
        fx.dynamics_degrade_generation = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_ALIAS_ID:
        fx.dynamics_degrade_alias = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_WOW_ID:
        fx.dynamics_degrade_wow = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_FLUTTER_ID:
        fx.dynamics_degrade_flutter = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_DRIFT_ID:
        fx.dynamics_degrade_drift = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_WOBBLE_SPEED_ID:
        fx.dynamics_degrade_wobble_speed = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_TONE_ID:
        fx.dynamics_degrade_tone = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_HP_ID:
        fx.dynamics_degrade_hp = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_LP_ID:
        fx.dynamics_degrade_lp = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_NOISE_ID:
        fx.dynamics_degrade_noise = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_SATURATION_ID:
        fx.dynamics_degrade_saturation = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_CORROSION_ID:
        fx.dynamics_degrade_corrosion = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_ENABLED_ID:
        fx.dynamics_saturation_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_MODE_ID:
        fx.dynamics_saturation_mode = clampU32(static_cast<uint32_t>(std::lround(event.value)), 0u, 4u);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID:
        fx.dynamics_saturation_drive = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_TONE_ID:
        fx.dynamics_saturation_tone = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_BIAS_ID:
        fx.dynamics_saturation_bias = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_ENABLED_ID:
        fx.dynamics_end_comp_enabled = event.value >= 0.5f;
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_THRESHOLD_ID:
        fx.dynamics_end_comp_threshold = clampFloat(event.value, -60.0f, 0.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_KNEE_ID:
        fx.dynamics_end_comp_knee = clampFloat(event.value, 0.0f, 40.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_RATIO_ID:
        fx.dynamics_end_comp_ratio = clampFloat(event.value, 1.0f, 20.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_ATTACK_MS_ID:
        fx.dynamics_end_comp_attack_ms = clampFloat(event.value, 0.1f, 100.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_RELEASE_MS_ID:
        fx.dynamics_end_comp_release_ms = clampFloat(event.value, 20.0f, 1500.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MAKEUP_ID:
        fx.dynamics_end_comp_makeup = clampFloat(event.value, 0.25f, 4.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MIX_ID:
        fx.dynamics_end_comp_mix = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_DETECTOR_HP_ID:
        fx.dynamics_end_comp_detector_hp = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_DETECTOR_TILT_ID:
        fx.dynamics_end_comp_detector_tilt = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_AUTO_MAKEUP_ID:
        fx.dynamics_end_comp_auto_makeup = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_PROGRAM_RELEASE_ID:
        fx.dynamics_end_comp_program_release = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_ENABLED_ID:
        fx.sidechain_enabled = event.value >= 0.5f;
        if (!fx.sidechain_enabled) {
          resetSidechainRuntime();
        }
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_A_ID:
        fx.sidechain_key_a = clampU32(static_cast<uint32_t>(std::lround(event.value)), kSidechainKeyOff, kSidechainKeyMembrane);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_B_ID:
        fx.sidechain_key_b = clampU32(static_cast<uint32_t>(std::lround(event.value)), kSidechainKeyOff, kSidechainKeyMembrane);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_AWEIGHT_ID:
        fx.sidechain_key_a_weight = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_BWEIGHT_ID:
        fx.sidechain_key_b_weight = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_AMOUNT_ID:
        fx.sidechain_amount = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_THRESHOLD_ID:
        fx.sidechain_threshold = clampFloat(event.value, -60.0f, 0.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RATIO_ID:
        fx.sidechain_ratio = clampFloat(event.value, 1.0f, 20.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KNEE_ID:
        fx.sidechain_knee = clampFloat(event.value, 0.0f, 40.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_ATTACK_MS_ID:
        fx.sidechain_attack_ms = clampFloat(event.value, 0.1f, 100.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_HOLD_MS_ID:
        fx.sidechain_hold_ms = clampFloat(event.value, 0.0f, 250.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RELEASE_MS_ID:
        fx.sidechain_release_ms = clampFloat(event.value, 20.0f, 1500.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_MAKEUP_ID:
        fx.sidechain_makeup = clampFloat(event.value, 0.25f, 4.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_MIX_ID:
        fx.sidechain_mix = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_CURVE_ID:
        fx.sidechain_curve = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DETECTOR_HP_ID:
        fx.sidechain_detector_hp = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DETECTOR_LP_ID:
        fx.sidechain_detector_lp = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD1_TARGET_ID:
        fx.sidechain_targets[kSidechainPad1] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD2_TARGET_ID:
        fx.sidechain_targets[kSidechainPad2] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_LEAD1_TARGET_ID:
        fx.sidechain_targets[kSidechainLead1] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_LEAD2_TARGET_ID:
        fx.sidechain_targets[kSidechainLead2] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PIANO_TARGET_ID:
        fx.sidechain_targets[kSidechainPiano] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_GRANULAR_TARGET_ID:
        fx.sidechain_targets[kSidechainGranular] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DELAY_ATARGET_ID:
        fx.sidechain_targets[kSidechainDelayA] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DELAY_BTARGET_ID:
        fx.sidechain_targets[kSidechainDelayB] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_REVERB_TARGET_ID:
        fx.sidechain_targets[kSidechainReverb] = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_DELAY_B_ID:
        routing.delay_a_to_delay_b = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_DELAY_A_ID:
        routing.delay_b_to_delay_a = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_TO_REVERB_ID:
        routing.delay_to_reverb = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_REVERB_ID:
        routing.granular_to_reverb = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID:
        routing.delay_a_to_granular = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_GRANULAR_ID:
        routing.delay_b_to_granular = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_REVERB_ID:
        routing.delay_b_to_reverb = clampFloat(event.value, 0.0f, 1.0f);
        configureFxModules();
        break;
      case KESSHO_PRODUCT_PARAM_RNG_SEED_ID:
        rng_seed = static_cast<uint32_t>(std::max(1.0f, event.value));
        rng_state = rng_seed;
        break;
      case KESSHO_PRODUCT_PARAM_RNG_STATE_ID:
        rng_state = static_cast<uint32_t>(std::max(1.0f, event.value));
        break;
      case KESSHO_PRODUCT_PARAM_EVOLUTION_AMOUNT_ID:
        evolution_amount = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_EVOLUTION_STATE_ID:
        evolution_state = static_cast<uint32_t>(std::max(1.0f, event.value));
        break;
      default:
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        break;
    }
  }

  bool isSourceParam(uint32_t param_id) const {
    switch (param_id) {
      case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
      case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
        return true;
      default:
        return false;
    }
  }

  bool isSourceTarget(uint32_t target_id) const {
    return target_id >= 1u && target_id <= kSourceCount;
  }

  bool isDrumRangeTarget(uint32_t target_id) const {
    return target_id >= KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE &&
        target_id < KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + DRUM_NUM_VOICE_TYPES;
  }

  ModulationRange* findModulationRange(uint32_t target_id, uint32_t param_id) {
    for (ModulationRange& range : modulation_ranges) {
      if (range.active && range.target_id == target_id && range.param_id == param_id) {
        return &range;
      }
    }
    return nullptr;
  }

  const ModulationRange* findModulationRange(uint32_t target_id, uint32_t param_id) const {
    for (const ModulationRange& range : modulation_ranges) {
      if (range.active && range.target_id == target_id && range.param_id == param_id) {
        return &range;
      }
    }
    return nullptr;
  }

  ModulationRange* findOrAllocateModulationRange(uint32_t target_id, uint32_t param_id) {
    for (ModulationRange& range : modulation_ranges) {
      if (range.target_id == target_id && range.param_id == param_id) {
        return &range;
      }
    }
    for (ModulationRange& range : modulation_ranges) {
      if (!range.active) {
        return &range;
      }
    }
    return nullptr;
  }

  void applyModulationRangeEvent(const KesshoProductEvent& event) {
    const uint32_t target_id = event.target_id;
    const uint32_t param_id = event.param_id;
    const uint32_t mode = static_cast<uint32_t>(std::max(0.0f, std::round(event.value3)));
    const bool active = (event.flags & KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE) != 0u &&
        mode != KESSHO_PRODUCT_MODULATION_RANGE_OFF;
    if (param_id == 0u || (!isSourceTarget(target_id) && !isDrumRangeTarget(target_id) && target_id != 0u)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
    }
    if (isDrumRangeTarget(target_id) && !isSourceParam(param_id)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
    }

    ModulationRange* range = findOrAllocateModulationRange(target_id, param_id);
    if (range == nullptr) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
      return;
    }
    if (!active) {
      *range = {};
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }

    const float min_value = std::min(event.value, event.value2);
    const float max_value = std::max(event.value, event.value2);
    range->active = true;
    range->control_id = event.index == 0u ? hashU32(target_id ^ (param_id * 16777619u)) : event.index;
    range->target_id = target_id;
    range->param_id = param_id;
    range->mode = mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
        ? KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
        : KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD;
    range->min_value = min_value;
    range->max_value = max_value;
    const float fallback_current = (min_value + max_value) * 0.5f;
    range->current_value = clampFloat(
        std::isfinite(event.value4) ? event.value4 : fallback_current,
        min_value,
        max_value);
    range->seed = hashU32(rng_seed ^ range->control_id ^ range->target_id ^ range->param_id);
    const float direction = hashUnit(range->seed ^ 0xa511e9b3u) < 0.5f ? -1.0f : 1.0f;
    const float span = std::max(0.0001f, max_value - min_value);
    range->velocity = direction * span * (0.015f + hashUnit(range->seed ^ 0x63d83595u) * 0.025f);
    if (target_id == 0u && range->mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
      KesshoProductEvent param_event{};
      param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
      param_event.target_id = 0u;
      param_event.param_id = range->param_id;
      param_event.value = range->current_value;
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      applyParam(param_event);
      return;
    }
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  void applySourcePresetEvent(const KesshoProductEvent& event) {
    if (event.target_id < 1u || event.target_id > kSourceCount) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      return;
    }
    const uint32_t preset_id = event.value <= 0.0f ? 0u : static_cast<uint32_t>(std::lround(event.value));
    sources[event.target_id - 1u].preset_id = preset_id;
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
  }

  void applySourcePresetMacros(const SourceState& source, float& morph, float& distance, float& expression) const {
    const auto* preset = findSourcePreset(source.preset_id);
    if (preset == nullptr) {
      return;
    }
    morph = clampFloat(morph + preset->macro_morph, 0.0f, 1.0f);
    distance = clampFloat(distance + preset->macro_distance, 0.0f, 1.0f);
    expression = clampFloat(expression * preset->macro_expression, 0.0f, 1.0f);
  }

  kessho::core::KesshoSourcePresetPatch drumVoiceMorphPatch(const SourceState& source) const {
    auto patch = sourcePresetPatch(findSourcePreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT));
    if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
      patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
      for (uint32_t i = 0; i < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++i) {
        patch.exact_drum_params[i] = 0.0f;
      }
    }

    for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
      if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
        continue;
      }
      const auto* preset_a = findDrumVoicePreset(voice.index, source.drum_voice_preset_a_ids[voice.index]);
      const auto* preset_b = findDrumVoicePreset(voice.index, source.drum_voice_preset_b_ids[voice.index]);
      if (preset_a == nullptr && preset_b == nullptr) {
        continue;
      }
      if (preset_a == nullptr) {
        preset_a = preset_b;
      }
      if (preset_b == nullptr) {
        preset_b = preset_a;
      }

      const float morph = clampFloat(source.drum_voice_morphs[voice.index], 0.0f, 1.0f);
      const float smooth = smoothstep01(morph);
      const uint32_t end = std::min<uint32_t>(
          voice.param_start + voice.param_count,
          kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
      for (uint32_t param_index = voice.param_start; param_index < end; ++param_index) {
        const float a = preset_a->params[param_index];
        const float b = preset_b->params[param_index];
        patch.exact_drum_params[param_index] = drumParamUsesPresetSnap(param_index)
            ? (morph < 0.5f ? a : b)
            : a + (b - a) * smooth;
      }
    }
    return patch;
  }

  bool exactPadMacrosDifferFromDefaults(float morph, float distance, float expression) const {
    return std::abs(morph) > 0.0001f ||
           std::abs(distance) > 0.0001f ||
           std::abs(expression - kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION) > 0.0001f;
  }

  float modulationRangeSample(const ModulationRange& range, float fallback, uint32_t sample_seed) const {
    if (!range.active) {
      return fallback;
    }
    if (range.max_value <= range.min_value) {
      return range.min_value;
    }
    if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
      return clampFloat(range.current_value, range.min_value, range.max_value);
    }
    const float position = hashUnit(range.seed ^ sample_seed ^ (range.target_id * 2246822519u) ^ (range.param_id * 3266489917u));
    return range.min_value + (range.max_value - range.min_value) * position;
  }

  float resolveModulatedValue(uint32_t target_id, uint32_t param_id, float fallback, uint32_t sample_seed) const {
    const ModulationRange* range = findModulationRange(target_id, param_id);
    if (range == nullptr) {
      return fallback;
    }
    return modulationRangeSample(*range, fallback, sample_seed);
  }

  void applyRuntimeWalkValue(const ModulationRange& range) {
    if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
      return;
    }
    if (isDrumRangeTarget(range.target_id)) {
      if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID && drum_module) {
        const int voice = static_cast<int>(range.target_id - KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE);
        drum_module->setVoiceSend(voice, range.current_value);
      }
      return;
    }
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.target_id = range.target_id;
    event.param_id = range.param_id;
    event.value = range.current_value;
    applyParam(event);
  }

  void advanceModulationRanges(uint32_t frames) {
    if (frames == 0u) {
      return;
    }
    const float beats = static_cast<float>(static_cast<double>(frames) / transport.samplesPerBeat(sample_rate));
    for (ModulationRange& range : modulation_ranges) {
      if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
        continue;
      }
      if (range.max_value <= range.min_value) {
        range.current_value = range.min_value;
        applyRuntimeWalkValue(range);
        continue;
      }
      const float span = range.max_value - range.min_value;
      const uint32_t time_seed = static_cast<uint32_t>(transport.sample_frame) ^ static_cast<uint32_t>(transport.sample_frame >> 32);
      const float jitter = (hashUnit(range.seed ^ time_seed ^ 0x9e3779b9u) - 0.5f) * span * 0.01f;
      range.current_value += (range.velocity + jitter) * beats;
      if (range.current_value <= range.min_value) {
        range.current_value = range.min_value;
        range.velocity = std::abs(range.velocity);
      } else if (range.current_value >= range.max_value) {
        range.current_value = range.max_value;
        range.velocity = -std::abs(range.velocity);
      }
      applyRuntimeWalkValue(range);
    }
  }

  void applySourceParam(const KesshoProductEvent& event) {
    if (event.target_id < 1u || event.target_id > kSourceCount) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      return;
    }

    SourceState& source = sources[event.target_id - 1u];
    switch (event.param_id) {
      case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
        source.enabled = event.value >= 0.5f;
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
        source.level = clampFloat(event.value, 0.0f, 1.5f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
        source.morph = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
        source.distance = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
        source.expression = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
        source.dry_gain = clampFloat(event.value, 0.0f, 2.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
        source.reverb_send = clampFloat(event.value, 0.0f, 2.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
        source.delay_a_send = clampFloat(event.value, 0.0f, 2.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
        source.delay_b_send = clampFloat(event.value, 0.0f, 2.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
        source.granular_send = clampFloat(event.value, 0.0f, 2.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
        source.post_lpf_hz = clampFloat(event.value, 20.0f, 20000.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
        source.stereo_width = clampFloat(event.value, 0.0f, 1.0f);
        break;
      case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
        source.post_lpf_key_tracking = clampFloat(event.value, 0.0f, 1.0f);
        break;
      default:
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        break;
    }
  }

  void compactControlEvents(uint32_t frames, uint32_t first_unprocessed) {
    uint32_t write = 0;
    for (uint32_t read = first_unprocessed; read < control_event_count; ++read) {
      QueuedProductEvent queued = control_events[read];
      if (queued.event.sample_offset >= frames) {
        queued.event.sample_offset -= frames;
        control_events[write++] = queued;
      }
    }
    control_event_count = write;
  }

  bool trigConditionPass(uint32_t trig_condition, uint64_t absolute_sample) const {
    if (trig_condition == KESSHO_PRODUCT_TRIG_ALWAYS) {
      return true;
    }
    const double samples_per_bar = transport.samplesPerBeat(sample_rate) * static_cast<double>(std::max(1u, transport.beats_per_bar));
    const uint64_t bar = static_cast<uint64_t>(static_cast<double>(absolute_sample) / samples_per_bar);
    if (trig_condition == KESSHO_PRODUCT_TRIG_EVERY_2_BARS) {
      return (bar % 2u) == 0u;
    }
    if (trig_condition == KESSHO_PRODUCT_TRIG_FIRST_BAR_OF_PHRASE) {
      return (bar % std::max(1u, transport.bars_per_phrase)) == 0u;
    }
    return true;
  }

  bool stepTrigConditionPass(const LaneState& lane, uint32_t step, int64_t absolute_step) const {
    if (!stepMaskHas(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step)) {
      return true;
    }
    const uint32_t denominator = std::max(1u, lane.trig_condition_denominators[step]);
    const uint32_t numerator = clampU32(lane.trig_condition_numerators[step], 1u, denominator);
    const uint64_t visit = static_cast<uint64_t>(absolute_step / std::max<int64_t>(1, static_cast<int64_t>(lane.step_count))) + 1u;
    return ((visit - 1u) % denominator) + 1u == numerator;
  }

  bool manualMaskHit(const LaneState& lane, uint32_t step) const {
    if (step < 32u) {
      const uint32_t bit = 1u << step;
      if ((lane.step_override_set_low & bit) != 0u) {
        return (lane.step_override_value_low & bit) != 0u;
      }
    } else {
      const uint32_t bit = 1u << (step - 32u);
      if ((lane.step_override_set_high & bit) != 0u) {
        return (lane.step_override_value_high & bit) != 0u;
      }
    }
    if (lane.manual_step_mask_low == 0u && lane.manual_step_mask_high == 0u) {
      return euclidHit(step, lane.step_count, lane.fill_count, lane.rotation);
    }
    if (step < 32u) {
      return (lane.manual_step_mask_low & (1u << step)) != 0u;
    }
    return (lane.manual_step_mask_high & (1u << (step - 32u))) != 0u;
  }

  float resolveHarmonyMidi(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample) const {
    if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      return lane.midi_note;
    }

    int intervals[kMaxScaleNotes]{};
    const uint32_t scale_count = scaleIntervals(harmony.scale_id, intervals);
    const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
    const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
    const uint32_t progression_degree = harmony.tension > 0.5f
        ? hashU32(rng_seed ^ static_cast<uint32_t>(bar * 31u) ^ static_cast<uint32_t>(phrase * 131u)) % scale_count
        : 0u;
    const uint32_t degree = (step_id + lane_index + progression_degree) % scale_count;
    const int octave_offset = static_cast<int>(std::floor((lane.midi_note - harmony.root_midi) / 12.0f));
    const float resolved = harmony.root_midi + static_cast<float>(octave_offset * 12 + intervals[degree]);
    return clampFloat(resolved, 0.0f, 127.0f);
  }

  void updateHarmonyTelemetry(uint64_t absolute_sample) {
    int intervals[kMaxScaleNotes]{};
    const uint32_t scale_count = scaleIntervals(harmony.scale_id, intervals);
    const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
    const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
    harmony.chord_degree = harmony.tension > 0.5f
        ? hashU32(rng_seed ^ static_cast<uint32_t>(bar * 31u) ^ static_cast<uint32_t>(phrase * 131u)) % scale_count
        : 0u;

    const uint32_t degrees[4] = {
        harmony.chord_degree % scale_count,
        (harmony.chord_degree + 2u) % scale_count,
        (harmony.chord_degree + 4u) % scale_count,
        (harmony.chord_degree + 7u) % scale_count,
    };
    for (uint32_t i = 0; i < 4u; ++i) {
      const int octave = i == 3u ? 12 : 0;
      harmony.chord_midi[i] = clampFloat(harmony.root_midi + static_cast<float>(intervals[degrees[i]] + octave), 0.0f, 127.0f);
    }
  }

  float evolutionDepth() const {
    const float journey_depth = journey_running
        ? 0.35f * (0.5f + 0.5f * std::sin(static_cast<float>(kTwoPi) * journey_phase))
        : 0.0f;
    return clampFloat(evolution_amount + journey_depth, 0.0f, 1.0f);
  }

  float evolvedLaneValue(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample,
      uint32_t component,
      float base,
      float depth,
      float min_value,
      float max_value) const {
    const float amount = evolutionDepth() * clampFloat(depth, 0.0f, 1.0f);
    if (amount <= 0.000001f) {
      return clampFloat(base, min_value, max_value);
    }

    const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
    const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
    const uint32_t seed =
        lane.seed ^
        rng_seed ^
        evolution_state ^
        (component * 374761393u) ^
        (lane_index * 668265263u) ^
        (step_id * 2246822519u) ^
        static_cast<uint32_t>(bar * 3266489917ull) ^
        static_cast<uint32_t>(phrase * 2654435761ull);
    const float random_delta = hashUnit(seed) * 2.0f - 1.0f;
    const float journey_delta = journey_running
        ? std::sin(static_cast<float>(kTwoPi) * (journey_phase + lane_index * 0.071f + step_id * 0.019f + component * 0.113f))
        : 0.0f;
    return clampFloat(base + amount * (random_delta + journey_delta * 0.5f), min_value, max_value);
  }

  void generateLaneEvents(
      const LaneState* lanes,
      uint32_t lane_count,
      uint32_t frames,
      SequencerBuffer& out) const {
    const uint64_t block_start = transport.sample_frame;
    const uint64_t block_end = block_start + frames;
    const double samples_per_beat = transport.samplesPerBeat(sample_rate);
    for (uint32_t lane_index = 0; lane_index < lane_count; ++lane_index) {
      const LaneState& lane = lanes[lane_index];
      if (!lane.enabled || lane.step_count == 0u || lane.clock_division == 0u) {
        continue;
      }
      const double samples_per_step = samples_per_beat * 4.0 / static_cast<double>(lane.clock_division);
      const double swing_samples = samples_per_step * 0.5 * clampFloat(transport.swing + lane.swing, 0.0f, 1.0f);
      const int64_t first_step = static_cast<int64_t>(std::floor(static_cast<double>(block_start) / samples_per_step)) - 1;
      const int64_t last_step = static_cast<int64_t>(std::ceil(static_cast<double>(block_end) / samples_per_step)) + 1;
      for (int64_t absolute_step = first_step; absolute_step <= last_step; ++absolute_step) {
        if (absolute_step < 0) {
          continue;
        }
        const uint32_t step_id = static_cast<uint32_t>(absolute_step % static_cast<int64_t>(lane.step_count));
        if (!manualMaskHit(lane, step_id)) {
          continue;
        }
        double event_sample_double = static_cast<double>(absolute_step) * samples_per_step;
        if ((step_id & 1u) != 0u) {
          event_sample_double += swing_samples;
        }
        const uint64_t event_sample = static_cast<uint64_t>(std::llround(event_sample_double));
        if (event_sample < block_start || event_sample >= block_end) {
          continue;
        }
        if (!trigConditionPass(lane.trig_condition, event_sample)) {
          continue;
        }
        if (!stepTrigConditionPass(lane, step_id, absolute_step)) {
          continue;
        }
        const uint32_t probability_seed = lane.seed ^ static_cast<uint32_t>(absolute_step * 2654435761ull) ^ (lane_index * 16777619u);
        const uint32_t probability_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_PROBABILITY,
            step_id,
            absolute_step);
        const float probability_base = stepFloatValue(
            probability_step_id,
            lane.probability_override_set_low,
            lane.probability_override_set_high,
            lane.probability_overrides,
            lane.probability);
        const float probability = evolvedLaneValue(
            lane,
            lane_index,
            step_id,
            event_sample,
            1u,
            probability_base,
            probability_base >= 0.999f ? 0.0f : 0.35f,
            0.0f,
            1.0f);
        if (hashUnit(probability_seed) > probability) {
          continue;
        }
        const uint32_t ratchet_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_RATCHET,
            step_id,
            absolute_step);
        const uint32_t ratchet = clampU32(
            stepU32Value(
                ratchet_step_id,
                lane.ratchet_override_set_low,
                lane.ratchet_override_set_high,
                lane.ratchet_overrides,
                lane.ratchet),
            1u,
            8u);
        const double ratchet_spacing = samples_per_step / static_cast<double>(ratchet);
        for (uint32_t ratchet_index = 0; ratchet_index < ratchet; ++ratchet_index) {
          const uint64_t ratchet_sample = event_sample + static_cast<uint64_t>(std::llround(ratchet_spacing * ratchet_index));
          if (ratchet_sample < block_start || ratchet_sample >= block_end) {
            continue;
          }
          KesshoSequencerEvent event{};
          event.sample_offset = static_cast<uint32_t>(ratchet_sample - block_start);
          event.source_id = static_cast<uint16_t>(lane.target_source_id);
          event.lane_id = static_cast<uint16_t>(lane_index);
          event.step_id = static_cast<uint16_t>(step_id);
          event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON);
          const uint32_t midi_step_id = subLaneStepForField(
              lane,
              KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE,
              step_id,
              absolute_step);
          event.midi_note = stepFloatValue(
              midi_step_id,
              lane.midi_note_override_set_low,
              lane.midi_note_override_set_high,
              lane.midi_note_overrides,
              resolveHarmonyMidi(lane, lane_index, step_id, ratchet_sample));
          event.frequency_hz = midiToFrequency(event.midi_note);
          event.velocity = evolvedLaneValue(
              lane,
              lane_index,
              step_id,
              ratchet_sample,
              2u,
              lane.velocity,
              0.25f,
              0.0f,
              1.0f) /
              static_cast<float>(ratchet_index + 1u);
          event.hold_seconds = lane.hold_seconds;
          const uint32_t event_seed = probability_seed ^ (ratchet_index * 374761393u);
          const uint32_t morph_step_id = subLaneStepForField(
              lane,
              KESSHO_PRODUCT_STEP_FIELD_MORPH,
              step_id,
              absolute_step);
          const uint32_t distance_step_id = subLaneStepForField(
              lane,
              KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
              step_id,
              absolute_step);
          const uint32_t expression_step_id = subLaneStepForField(
              lane,
              KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
              step_id,
              absolute_step);
          const float morph_base = stepFloatValue(
              morph_step_id,
              lane.morph_override_set_low,
              lane.morph_override_set_high,
              lane.morph_overrides,
              lane.morph);
          const float distance_base = stepFloatValue(
              distance_step_id,
              lane.distance_override_set_low,
              lane.distance_override_set_high,
              lane.distance_overrides,
              lane.distance);
          const float expression_base = stepFloatValue(
              expression_step_id,
              lane.expression_override_set_low,
              lane.expression_override_set_high,
              lane.expression_overrides,
              lane.expression);
          event.morph = resolveModulatedValue(lane.target_source_id, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph_base, event_seed);
          event.distance = resolveModulatedValue(lane.target_source_id, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance_base, event_seed);
          event.expression = resolveModulatedValue(lane.target_source_id, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression_base, event_seed);
          if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
            const uint32_t drum_voice = static_cast<uint32_t>(std::clamp(roundedInt(event.midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1));
            const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
            event.morph = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, event.morph, event_seed);
            event.distance = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, event.distance, event_seed);
            event.expression = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, event.expression, event_seed);
          }
          event.morph = evolvedLaneValue(lane, lane_index, step_id, ratchet_sample, 3u, event.morph, 0.35f, 0.0f, 1.0f);
          event.distance = evolvedLaneValue(lane, lane_index, step_id, ratchet_sample, 4u, event.distance, 0.35f, 0.0f, 1.0f);
          event.expression = evolvedLaneValue(lane, lane_index, step_id, ratchet_sample, 5u, event.expression, 0.25f, 0.0f, 1.0f);
          event.flags = ratchet_index;
          out.push(event);
        }
      }
    }
  }

  void generateSequencerEvents(uint32_t frames) {
    sequencer_events.clear();
    if (!transport.running) {
      return;
    }
    generateLaneEvents(synth_lanes, synth_lane_count, frames, sequencer_events);
    generateLaneEvents(drum_lanes, drum_lane_count, frames, sequencer_events);
    sequencer_events.sortByOffset();
  }

  uint32_t findAssetSlot(uint32_t asset_id) const {
    for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
      if (assets[i].active && assets[i].asset_id == asset_id) {
        return i;
      }
    }
    return kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS;
  }

  bool pianoAssetRootMidi(uint32_t asset_id, float& out_midi) const {
    if (asset_id <= kPianoAssetIdBase) {
      return false;
    }
    const uint32_t index = asset_id - kPianoAssetIdBase;
    if (index == 0u || index > kPianoSampleCount) {
      return false;
    }
    out_midi = static_cast<float>(kPianoBaseMidi + index - 1u);
    return true;
  }

  uint32_t findPianoAssetSlot(float midi_note, float& out_root_midi) const {
    uint32_t best_slot = kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS;
    float best_distance = 1000000.0f;
    float best_root = 60.0f;
    for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
      const AssetSlot& asset = assets[i];
      if (!asset.active || (asset.flags & KESSHO_PRODUCT_ASSET_PIANO) == 0u) {
        continue;
      }
      float root_midi = 60.0f;
      pianoAssetRootMidi(asset.asset_id, root_midi);
      const float distance = std::abs(root_midi - midi_note);
      if (distance < best_distance) {
        best_distance = distance;
        best_slot = i;
        best_root = root_midi;
      }
    }
    out_root_midi = best_root;
    return best_slot;
  }

  uint32_t allocateVoice() {
    for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES; ++i) {
      if (!voices[i].active) {
        return i;
      }
    }
    return 0;
  }

  bool hasActiveSourceVoice(uint32_t source_id) const {
    for (const Voice& voice : voices) {
      if (voice.active && voice.source_id == source_id) {
        return true;
      }
    }
    return false;
  }

  bool soundscapeWantsAsset(const SourceState& source, uint32_t asset_id) const {
    for (uint32_t i = 0; i < source.asset_ref_count; ++i) {
      if (source.asset_refs[i] == asset_id) {
        return true;
      }
    }
    return false;
  }

  bool hasActiveSoundscapeVoice(uint32_t asset_id) const {
    for (const Voice& voice : voices) {
      if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE || !voice.sample_voice) {
        continue;
      }
      if (voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
          assets[voice.asset_slot].active &&
          assets[voice.asset_slot].asset_id == asset_id) {
        return true;
      }
    }
    return false;
  }

  void releaseUnwantedSoundscapeVoices(const SourceState& source) {
    for (Voice& voice : voices) {
      if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE || !voice.sample_voice) {
        continue;
      }
      const uint32_t asset_id = voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS
          ? assets[voice.asset_slot].asset_id
          : 0u;
      if (asset_id == 0u || !soundscapeWantsAsset(source, asset_id)) {
        voice.looping = false;
        voice.remaining_frames = std::min<uint32_t>(voice.remaining_frames, static_cast<uint32_t>(0.02 * sample_rate));
        voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
      }
    }
  }

  void reportMissingSourceAsset(SourceState& source) {
    if (source.asset_id == 0u || source.last_missing_asset_id == source.asset_id) {
      return;
    }
    source.last_missing_asset_id = source.asset_id;
    ++telemetry.asset_missing_count;
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_MISSING_ASSET;
  }

  void reportMissingSourceAsset(SourceState& source, uint32_t asset_id) {
    if (asset_id == 0u || source.last_missing_asset_id == asset_id) {
      return;
    }
    source.last_missing_asset_id = asset_id;
    ++telemetry.asset_missing_count;
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_MISSING_ASSET;
  }

  bool triggerModuleSource(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float morph,
      float distance,
      float expression,
      const kessho::core::KesshoSourcePresetPatch* preset_patch,
      float drum_delay_send,
      bool scale_velocity_by_expression) {
    if (!modules_ready) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
      return true;
    }

    const float frequency = midiToFrequency(clampFloat(midi_note, 0.0f, 127.0f));
    const float clamped_velocity = clampFloat(
        velocity * (scale_velocity_by_expression ? clampFloat(expression, 0.0f, 1.5f) : 1.0f),
        0.0f,
        1.0f);
    switch (source_id) {
      case KESSHO_PRODUCT_SOURCE_PAD1:
      case KESSHO_PRODUCT_SOURCE_PAD2: {
        if (!pad_module) {
          telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
          return true;
        }
        const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
        const int route = static_cast<int>(pad_index * PAD_NUM_VOICES + (pad_voice_cursors[pad_index]++ % PAD_NUM_VOICES));
        const bool exact_pad_patch =
            preset_patch != nullptr &&
            preset_patch->exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
        if (exact_pad_patch) {
          pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch);
          if (exactPadMacrosDifferFromDefaults(morph, distance, expression)) {
            pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
          }
        } else if (preset_patch != nullptr) {
          pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch);
          pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
        } else {
          pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
        }
        const int voice_index = route % PAD_NUM_VOICES;
        if (pad_module->noteOn(frequency, clamped_velocity, hold_seconds, route) != 0) {
          schedulePadVoiceRelease(pad_index, static_cast<uint32_t>(voice_index), hold_seconds);
        }
        return true;
      }
      case KESSHO_PRODUCT_SOURCE_LEAD1:
      case KESSHO_PRODUCT_SOURCE_LEAD2: {
        const uint32_t lead_index = source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u;
        sources[source_id - 1u].post_lpf_tracking_midi = clampFloat(midi_note, 0.0f, 127.0f);
        if (!lead_modules[lead_index]) {
          telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
          return true;
        }
        if (preset_patch != nullptr) {
          lead_modules[lead_index]->setSourcePresetPatch(static_cast<int>(lead_index), *preset_patch);
        }
        const bool exact_lead_patch =
            preset_patch != nullptr &&
            preset_patch->exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
        if (!exact_lead_patch) {
          lead_modules[lead_index]->setTriggerMacros(morph, distance, expression);
        }
        lead_modules[lead_index]->noteOn(frequency, clamped_velocity, std::max(0.001f, hold_seconds), 0);
        return true;
      }
      case KESSHO_PRODUCT_SOURCE_DRUM: {
        if (!drum_module) {
          telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
          return true;
        }
        const int voice_type = std::clamp(roundedInt(midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1);
        if (preset_patch != nullptr) {
          drum_module->setSourcePresetPatch(0, *preset_patch);
        }
        if (std::isfinite(drum_delay_send) && drum_delay_send >= 0.0f) {
          drum_module->setVoiceSend(voice_type, drum_delay_send);
        }
        drum_module->setTriggerMacros(morph, distance, expression);
        drum_module->noteOn(0.0f, clamped_velocity, 0.0f, voice_type);
        return true;
      }
      default:
        return false;
    }
  }

  void triggerVoice(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float event_morph = -1.0f,
      float event_distance = -1.0f,
      float event_expression = -1.0f,
      uint32_t sample_seed = 0u,
      uint32_t asset_id_override = 0u,
      bool scale_velocity_by_expression = true) {
    if (source_id < 1u || source_id > kSourceCount) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      return;
    }
    SourceState& source = sources[source_id - 1u];
    if (!source.enabled) {
      return;
    }

    const uint32_t resolved_seed = sample_seed == 0u
        ? hashU32(rng_seed ^ source_id ^ static_cast<uint32_t>(std::max(0.0f, midi_note * 31.0f)) ^
                  static_cast<uint32_t>(transport.sample_frame))
        : sample_seed;
    source.level = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, source.level, resolved_seed);
    source.reverb_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID, source.reverb_send, resolved_seed);
    source.delay_a_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, source.delay_a_send, resolved_seed);
    source.delay_b_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID, source.delay_b_send, resolved_seed);
    source.granular_send = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID, source.granular_send, resolved_seed);
    float morph = event_morph >= 0.0f ? event_morph : source.morph;
    float distance = event_distance >= 0.0f ? event_distance : source.distance;
    float expression = event_expression >= 0.0f ? event_expression : source.expression;
    morph = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph, resolved_seed);
    distance = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance, resolved_seed);
    expression = resolveModulatedValue(source_id, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression, resolved_seed);

    float drum_delay_send = -1.0f;
    if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      const uint32_t drum_voice = static_cast<uint32_t>(std::clamp(roundedInt(midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1));
      const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
      morph = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph, resolved_seed);
      distance = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance, resolved_seed);
      expression = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression, resolved_seed);
      drum_delay_send = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, source.delay_a_send, resolved_seed);
      triggerSidechainDuck(drum_voice, clampFloat(velocity * expression, 0.0f, 1.0f));
    }

    const bool pad_source = source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2;
    const bool lead_source = source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
    const bool drum_source = source_id == KESSHO_PRODUCT_SOURCE_DRUM;
    kessho::core::KesshoSourcePresetPatch snapshot_patch{};
    const bool snapshot_exact_pad_patch =
        pad_source &&
        source.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
    if (snapshot_exact_pad_patch) {
      snapshot_patch.exact_pad_param_count = kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
      for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT; ++param_index) {
        snapshot_patch.exact_pad_params[param_index] = source.exact_pad_params[param_index];
      }
    }
    const bool snapshot_exact_lead_patch =
        lead_source &&
        source.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
    if (snapshot_exact_lead_patch) {
      snapshot_patch.exact_lead_param_count = kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
      for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT; ++param_index) {
        snapshot_patch.exact_lead_params[param_index] = source.exact_lead_params[param_index];
      }
    }
    const bool snapshot_exact_drum_patch =
        drum_source &&
        source.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
    if (snapshot_exact_drum_patch) {
      snapshot_patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
      for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++param_index) {
        snapshot_patch.exact_drum_params[param_index] = source.exact_drum_params[param_index];
      }
    }
    const bool snapshot_generated_drum_patch = drum_source && !snapshot_exact_drum_patch;
    if (snapshot_generated_drum_patch) {
      snapshot_patch = drumVoiceMorphPatch(source);
    }
    const bool snapshot_exact_patch =
        snapshot_exact_pad_patch || snapshot_exact_lead_patch || snapshot_exact_drum_patch || snapshot_generated_drum_patch;
    const auto* preset = snapshot_exact_patch ? nullptr : findSourcePreset(source.preset_id);
    const kessho::core::KesshoSourcePresetPatch preset_patch = snapshot_exact_patch
        ? snapshot_patch
        : sourcePresetPatch(preset);
    const bool exact_pad_patch =
        pad_source &&
        preset_patch.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
    const bool exact_lead_patch =
        lead_source &&
        preset_patch.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
    const bool exact_drum_patch =
        drum_source &&
        preset_patch.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
    if (!exact_pad_patch && !exact_lead_patch && !exact_drum_patch) {
      applySourcePresetMacros(source, morph, distance, expression);
    }
    const kessho::core::KesshoSourcePresetPatch* preset_patch_ptr =
        (snapshot_exact_patch || preset != nullptr) ? &preset_patch : nullptr;

    if (triggerModuleSource(
            source_id,
            midi_note,
            velocity,
            hold_seconds,
            morph,
            distance,
            expression,
            preset_patch_ptr,
            drum_delay_send,
            scale_velocity_by_expression)) {
      return;
    }

    const uint32_t voice_index = allocateVoice();
    Voice& voice = voices[voice_index];
    voice = {};
    voice.active = true;
    voice.source_id = source_id;
    voice.frequency = midiToFrequency(clampFloat(midi_note, 0.0f, 127.0f));
    voice.amplitude = clampFloat(velocity * expression, 0.0f, 1.0f) * source.level;
    voice.remaining_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(hold_seconds * sample_rate));
    voice.total_frames = voice.remaining_frames;
    voice.phase = hashUnit(rng_state ^ source_id ^ voice_index) * kTwoPi;
    voice.pan = ((hashUnit(rng_state + voice_index * 17u) * 2.0f) - 1.0f) * (0.25f + distance * 0.75f);
    voice.drum_voice = source_id == KESSHO_PRODUCT_SOURCE_DRUM;

    if (source_id == KESSHO_PRODUCT_SOURCE_PIANO || source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE) {
      const float requested_midi = clampFloat(midi_note, 0.0f, 127.0f);
      float asset_root_midi = requested_midi;
      const uint32_t slot = source_id == KESSHO_PRODUCT_SOURCE_PIANO
          ? findPianoAssetSlot(requested_midi, asset_root_midi)
          : findAssetSlot(asset_id_override != 0u ? asset_id_override : source.asset_id);
      if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
        voice.active = false;
        reportMissingSourceAsset(source, asset_id_override != 0u ? asset_id_override : source.asset_id);
        return;
      }
      source.last_missing_asset_id = 0u;
      voice.sample_voice = true;
      voice.asset_slot = slot;
      voice.sample_position = 0.0;
      const double base_step = assets[slot].sample_rate / sample_rate;
      const double pitch_step = source_id == KESSHO_PRODUCT_SOURCE_PIANO
          ? static_cast<double>(voice.frequency) / static_cast<double>(midiToFrequency(asset_root_midi))
          : 1.0;
      voice.sample_step = base_step * pitch_step;
      voice.looping = (assets[slot].flags & KESSHO_PRODUCT_ASSET_LOOP) != 0u;
      voice.remaining_frames = assets[slot].frame_count;
      voice.total_frames = std::max(1u, voice.remaining_frames);
      if (source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE && voice.looping) {
        voice.sample_position = soundscapeRandomStartFrame(assets[slot], resolved_seed);
        voice.amplitude *= soundscapeLayerLevel(assets[slot], resolved_seed);
        voice.pan = soundscapeLayerPan(assets[slot], resolved_seed, distance);
        voice.sample_step *= soundscapeLayerPlaybackRate(assets[slot], resolved_seed);
      }
    }
  }

  void ensureSoundscapeVoice() {
    SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
    if (!source.enabled) {
      releaseSourceVoices(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
      return;
    }
    releaseUnwantedSoundscapeVoices(source);
    if (source.asset_ref_count == 0u) {
      return;
    }
    for (uint32_t ref_index = 0; ref_index < source.asset_ref_count; ++ref_index) {
      const uint32_t asset_id = source.asset_refs[ref_index];
      if (asset_id == 0u || hasActiveSoundscapeVoice(asset_id)) {
        continue;
      }
      const uint32_t slot = findAssetSlot(asset_id);
      if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
        reportMissingSourceAsset(source, asset_id);
        continue;
      }
      if ((assets[slot].flags & KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == 0u) {
        continue;
      }
      triggerVoice(
          KESSHO_PRODUCT_SOURCE_SOUNDSCAPE,
          60.0f,
          1.0f,
          static_cast<float>(static_cast<double>(assets[slot].frame_count) / std::max(1.0, assets[slot].sample_rate)),
          source.morph,
          source.distance,
          source.expression,
          hashU32(rng_seed ^ asset_id ^ 0x51f15ca9u),
          asset_id);
    }
  }

  void releaseSourceVoices(uint32_t source_id) {
    if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) && pad_module) {
      pad_module->allNotesOff();
      clearPadVoiceReleases(0u);
    }
    if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_LEAD1) && lead_modules[0]) {
      lead_modules[0]->allNotesOff();
    }
    if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) && lead_modules[1]) {
      lead_modules[1]->allNotesOff();
    }
    if ((source_id == 0u || source_id == KESSHO_PRODUCT_SOURCE_DRUM) && drum_module) {
      drum_module->allNotesOff();
    }
    for (Voice& voice : voices) {
      if (voice.active && (source_id == 0u || voice.source_id == source_id)) {
        voice.looping = false;
        voice.remaining_frames = std::min<uint32_t>(voice.remaining_frames, static_cast<uint32_t>(0.02 * sample_rate));
        voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
      }
    }
  }

  void schedulePadVoiceRelease(uint32_t pad_index, uint32_t voice_index, float hold_seconds) {
    if (pad_index >= static_cast<uint32_t>(PAD_NUM_PADS) || voice_index >= static_cast<uint32_t>(PAD_NUM_VOICES)) {
      return;
    }
    for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
      pad_voice_release_frames[pad][voice_index] = 0u;
    }
    if (!std::isfinite(hold_seconds) || hold_seconds <= 0.0f || sample_rate <= 0.0) {
      return;
    }
    const double requested_frames = static_cast<double>(hold_seconds) * sample_rate;
    pad_voice_release_frames[pad_index][voice_index] =
        static_cast<uint32_t>(std::max(1.0, std::min(requested_frames, static_cast<double>(UINT32_MAX))));
  }

  void clearPadVoiceReleases(uint32_t source_id) {
    const bool clear_all = source_id == 0u;
    for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
      const uint32_t pad_source_id = pad == 0u ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_PAD2;
      if (!clear_all && source_id != pad_source_id) {
        continue;
      }
      for (uint32_t voice = 0; voice < static_cast<uint32_t>(PAD_NUM_VOICES); ++voice) {
        pad_voice_release_frames[pad][voice] = 0u;
      }
    }
  }

  void advancePadVoiceReleases(uint32_t frames) {
    if (!pad_module || frames == 0u) {
      return;
    }
    for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
      for (uint32_t voice = 0; voice < static_cast<uint32_t>(PAD_NUM_VOICES); ++voice) {
        uint32_t& remaining = pad_voice_release_frames[pad][voice];
        if (remaining == 0u) {
          continue;
        }
        if (remaining <= frames) {
          pad_module->noteOff(static_cast<int>(voice));
          remaining = 0u;
        } else {
          remaining -= frames;
        }
      }
    }
  }

  void resetPadPostChains() {
    for (PadPostChainState& chain : pad_post_chains) {
      chain = {};
      chain.post_lpf_hz = kDefaultPadPostLpfHz;
      chain.stereo_width = kDefaultPadStereoWidth;
      updatePadPostChainCoefficients(chain);
    }
  }

  float resolveSourcePostLpfHz(uint32_t source_id) const {
    if (source_id < 1u || source_id > kSourceCount) {
      return kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
    }
    const SourceState& source = sources[source_id - 1u];
    float cutoff = source.post_lpf_hz;
    switch (source_id) {
      case KESSHO_PRODUCT_SOURCE_PAD1:
      case KESSHO_PRODUCT_SOURCE_PAD2:
        cutoff = distanceMultiply(cutoff, source.distance, 0.90f, 0.42f);
        break;
      case KESSHO_PRODUCT_SOURCE_LEAD1:
        cutoff = distanceMultiply(cutoff, source.distance, 0.88f, 0.38f);
        break;
      case KESSHO_PRODUCT_SOURCE_LEAD2:
        cutoff = distanceMultiply(cutoff, source.distance, 0.84f, 0.32f);
        break;
      case KESSHO_PRODUCT_SOURCE_PIANO:
        cutoff = distanceMultiply(cutoff, source.distance, 0.82f, 0.30f);
        break;
      default:
        break;
    }
    if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
      const float tracking = clampFloat(source.post_lpf_key_tracking, 0.0f, 1.0f);
      if (tracking > 0.0001f) {
        const float tracking_frequency = midiToFrequency(clampFloat(source.post_lpf_tracking_midi, 0.0f, 127.0f));
        const float ratio = clampFloat(tracking_frequency / midiToFrequency(60.0f), 0.125f, 8.0f);
        cutoff *= std::pow(ratio, tracking);
      }
    }
    return clampFloat(cutoff, 20.0f, 20000.0f);
  }

  float resolveSourceStereoWidth(uint32_t source_id) const {
    if (source_id < 1u || source_id > kSourceCount) {
      return kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
    }
    const SourceState& source = sources[source_id - 1u];
    float width = source.stereo_width;
    switch (source_id) {
      case KESSHO_PRODUCT_SOURCE_PAD1:
      case KESSHO_PRODUCT_SOURCE_PAD2:
        width = distanceAdd(width, source.distance, -0.06f, -0.35f);
        break;
      case KESSHO_PRODUCT_SOURCE_LEAD1:
        width = distanceAdd(width, source.distance, -0.08f, -0.42f);
        break;
      case KESSHO_PRODUCT_SOURCE_LEAD2:
        width = distanceAdd(width, source.distance, -0.10f, -0.50f);
        break;
      case KESSHO_PRODUCT_SOURCE_PIANO:
        width = distanceAdd(width, source.distance, -0.06f, -0.28f);
        break;
      default:
        break;
    }
    return clampFloat(width, 0.0f, 1.0f);
  }

  void updatePadPostChainCoefficients(PadPostChainState& chain) {
    const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
    const float cutoff = clampFloat(chain.post_lpf_hz, 20.0f, std::max(20.0f, nyquist_limit));
    if (std::abs(chain.coeff_cutoff - cutoff) <= 0.0001f) {
      return;
    }

    constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
    const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
    const float sin_omega = std::sin(omega);
    const float cos_omega = std::cos(omega);
    const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
    const float a0 = 1.0f + alpha;
    chain.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
    chain.b1 = (1.0f - cos_omega) / a0;
    chain.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
    chain.a1 = (-2.0f * cos_omega) / a0;
    chain.a2 = (1.0f - alpha) / a0;
    chain.coeff_cutoff = cutoff;
  }

  float processPadPostLpfSample(const PadPostChainState& chain, BiquadState& state, float input) const {
    const float y =
        chain.b0 * input +
        chain.b1 * state.x1 +
        chain.b2 * state.x2 -
        chain.a1 * state.y1 -
        chain.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = input;
    state.y2 = state.y1;
    state.y1 = std::isfinite(y) ? y : 0.0f;
    return state.y1;
  }

  void processPadPostChain(uint32_t pad_index, uint32_t source_id, float* left, float* right, uint32_t frames) {
    if (pad_index >= static_cast<uint32_t>(PAD_NUM_PADS) || left == nullptr || right == nullptr || frames == 0u) {
      return;
    }
    PadPostChainState& chain = pad_post_chains[pad_index];
    chain.post_lpf_hz = resolveSourcePostLpfHz(source_id);
    chain.stereo_width = resolveSourceStereoWidth(source_id);
    updatePadPostChainCoefficients(chain);
    const float width = clampFloat(chain.stereo_width, 0.0f, 1.0f);
    const float direct = 0.5f * (1.0f + width);
    const float cross = 0.5f * (1.0f - width);
    for (uint32_t i = 0; i < frames; ++i) {
      const float filtered_left = processPadPostLpfSample(chain, chain.left, left[i]);
      const float filtered_right = processPadPostLpfSample(chain, chain.right, right[i]);
      left[i] = filtered_left * direct + filtered_right * cross;
      right[i] = filtered_left * cross + filtered_right * direct;
    }
  }

  void resetLeadPostChains() {
    for (LeadPostChainState& chain : lead_post_chains) {
      chain = {};
      chain.post_lpf_hz = kDefaultLeadPostLpfHz;
      chain.stereo_width = kDefaultLeadStereoWidth;
      updateLeadPostChainCoefficients(chain);
    }
  }

  void updateLeadPostChainCoefficients(LeadPostChainState& chain) {
    const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
    const float cutoff = clampFloat(chain.post_lpf_hz, 20.0f, std::max(20.0f, nyquist_limit));
    if (std::abs(chain.coeff_cutoff - cutoff) <= 0.0001f) {
      return;
    }

    constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
    const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
    const float sin_omega = std::sin(omega);
    const float cos_omega = std::cos(omega);
    const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
    const float a0 = 1.0f + alpha;
    chain.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
    chain.b1 = (1.0f - cos_omega) / a0;
    chain.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
    chain.a1 = (-2.0f * cos_omega) / a0;
    chain.a2 = (1.0f - alpha) / a0;
    chain.coeff_cutoff = cutoff;
  }

  float processLeadPostLpfSample(const LeadPostChainState& chain, BiquadState& state, float input) const {
    const float y =
        chain.b0 * input +
        chain.b1 * state.x1 +
        chain.b2 * state.x2 -
        chain.a1 * state.y1 -
        chain.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = input;
    state.y2 = state.y1;
    state.y1 = std::isfinite(y) ? y : 0.0f;
    return state.y1;
  }

  void processLeadPostChain(uint32_t lead_index, uint32_t source_id, float* left, float* right, uint32_t frames) {
    if (lead_index >= 2u || left == nullptr || right == nullptr || frames == 0u) {
      return;
    }
    LeadPostChainState& chain = lead_post_chains[lead_index];
    chain.post_lpf_hz = resolveSourcePostLpfHz(source_id);
    chain.stereo_width = resolveSourceStereoWidth(source_id);
    updateLeadPostChainCoefficients(chain);
    const float width = clampFloat(chain.stereo_width, 0.0f, 1.0f);
    const float direct = 0.5f * (1.0f + width);
    const float cross = 0.5f * (1.0f - width);
    for (uint32_t i = 0; i < frames; ++i) {
      const float stage1_left = processLeadPostLpfSample(chain, chain.stage1_left, left[i]);
      const float stage1_right = processLeadPostLpfSample(chain, chain.stage1_right, right[i]);
      const float filtered_left = processLeadPostLpfSample(chain, chain.stage2_left, stage1_left);
      const float filtered_right = processLeadPostLpfSample(chain, chain.stage2_right, stage1_right);
      left[i] = filtered_left * direct + filtered_right * cross;
      right[i] = filtered_left * cross + filtered_right * direct;
    }
  }

  void updateVoicePostChainCoefficients(Voice& voice, float cutoff_hz) {
    const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
    const float cutoff = clampFloat(cutoff_hz, 20.0f, std::max(20.0f, nyquist_limit));
    if (std::abs(voice.post_coeff_cutoff - cutoff) <= 0.0001f) {
      return;
    }

    constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
    const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
    const float sin_omega = std::sin(omega);
    const float cos_omega = std::cos(omega);
    const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
    const float a0 = 1.0f + alpha;
    voice.post_b0 = ((1.0f - cos_omega) * 0.5f) / a0;
    voice.post_b1 = (1.0f - cos_omega) / a0;
    voice.post_b2 = ((1.0f - cos_omega) * 0.5f) / a0;
    voice.post_a1 = (-2.0f * cos_omega) / a0;
    voice.post_a2 = (1.0f - alpha) / a0;
    voice.post_coeff_cutoff = cutoff;
  }

  float processVoicePostLpfSample(const Voice& voice, BiquadState& state, float input) const {
    const float y =
        voice.post_b0 * input +
        voice.post_b1 * state.x1 +
        voice.post_b2 * state.x2 -
        voice.post_a1 * state.y1 -
        voice.post_a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = input;
    state.y2 = state.y1;
    state.y1 = std::isfinite(y) ? y : 0.0f;
    return state.y1;
  }

  void processVoicePostChain(Voice& voice, float& left, float& right) {
    const uint32_t source_id = voice.source_id;
    updateVoicePostChainCoefficients(voice, resolveSourcePostLpfHz(source_id));
    const float width = resolveSourceStereoWidth(source_id);
    const float filtered_left = processVoicePostLpfSample(voice, voice.post_left, left);
    const float filtered_right = processVoicePostLpfSample(voice, voice.post_right, right);
    const float direct = 0.5f * (1.0f + width);
    const float cross = 0.5f * (1.0f - width);
    left = filtered_left * direct + filtered_right * cross;
    right = filtered_left * cross + filtered_right * direct;
  }

  void mixPadSourceBuffer(
      uint32_t source_id,
      const float* dry_l,
      const float* dry_r,
      const float* send_l,
      const float* send_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
    if (source_id < 1u || source_id > kSourceCount) {
      return;
    }
    const SourceState& source = sources[source_id - 1u];
    if (!source.enabled) {
      return;
    }
    const float dry_gain = source.level * source.dry_gain;
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float dry_left = dry_l[i] * dry_gain;
      const float dry_right = dry_r[i] * dry_gain;
      const float send_left = send_l[i];
      const float send_right = send_r[i];
      const float duck_gain = sidechainGain(source_id - 1u, frame);
      const float left = dry_left * duck_gain;
      const float right = dry_right * duck_gain;
      out_l[frame] += left;
      out_r[frame] += right;
      stem_l[source_id][frame] += left;
      stem_r[source_id][frame] += right;
      reverb_bus_l[frame] += send_left * source.reverb_send;
      reverb_bus_r[frame] += send_right * source.reverb_send;
      delay_a_bus_l[frame] += send_left * source.delay_a_send;
      delay_a_bus_r[frame] += send_right * source.delay_a_send;
      delay_b_bus_l[frame] += send_left * source.delay_b_send;
      delay_b_bus_r[frame] += send_right * source.delay_b_send;
      granular_bus_l[frame] += send_left * source.granular_send;
      granular_bus_r[frame] += send_right * source.granular_send;
    }
  }

  void triggerSequencerEvent(const KesshoSequencerEvent& event) {
    const uint32_t seed = hashU32(
        rng_seed ^
        (static_cast<uint32_t>(event.lane_id) * 16777619u) ^
        (static_cast<uint32_t>(event.step_id) * 2246822519u) ^
        (event.flags * 3266489917u) ^
        static_cast<uint32_t>(transport.sample_frame));
    triggerVoice(
        event.source_id,
        event.midi_note,
        event.velocity,
        event.hold_seconds,
        event.morph,
        event.distance,
        event.expression,
        seed);
  }

  uint32_t sampleFadeFrames(double seconds, uint32_t limit_frames) const {
    if (limit_frames <= 1u || sample_rate <= 0.0) {
      return 0u;
    }
    const uint32_t requested = static_cast<uint32_t>(std::max(1.0, seconds * sample_rate));
    return std::min<uint32_t>(requested, std::max<uint32_t>(1u, limit_frames));
  }

  uint32_t loopCrossfadeFrames(const AssetSlot& asset) const {
    if (asset.frame_count <= 4u || sample_rate <= 0.0) {
      return 0u;
    }
    const uint32_t requested = static_cast<uint32_t>(std::max(1.0, kLoopCrossfadeSeconds * sample_rate));
    return std::min<uint32_t>(requested, std::max<uint32_t>(1u, asset.frame_count / 2u));
  }

  double soundscapeRandomStartFrame(const AssetSlot& asset, uint32_t sample_seed) const {
    if (asset.frame_count <= kSoundscapeRandomStartMinimumFrames) {
      return 0.0;
    }
    const uint32_t crossfade_frames = loopCrossfadeFrames(asset);
    const uint32_t max_start = asset.frame_count > crossfade_frames + 1u
        ? asset.frame_count - crossfade_frames - 1u
        : asset.frame_count - 1u;
    const float position = hashUnit(sample_seed ^ asset.asset_id ^ 0xa341316cu);
    return std::floor(static_cast<double>(position) * static_cast<double>(max_start + 1u));
  }

  SoundscapeLayerPolicy soundscapeLayerPolicy(uint32_t asset_id) const {
    switch (asset_id) {
      case kSoundscapeAssetOcean:
        return {0.90f, 0.10f, 0.12f, 0.28f, 0.006f};
      case kSoundscapeAssetWater:
        return {0.88f, 0.12f, 0.14f, 0.26f, 0.012f};
      case kSoundscapeAssetBirds:
      case kSoundscapeAssetBirds2:
        return {0.72f, 0.28f, 0.30f, 0.62f, 0.035f};
      case kSoundscapeAssetFrogs:
        return {0.76f, 0.20f, 0.26f, 0.48f, 0.020f};
      case kSoundscapeAssetInsects:
        return {0.62f, 0.24f, 0.36f, 0.64f, 0.045f};
      default:
        return {};
    }
  }

  float soundscapeLayerLevel(const AssetSlot& asset, uint32_t sample_seed) const {
    const SoundscapeLayerPolicy policy = soundscapeLayerPolicy(asset.asset_id);
    return policy.level_base + policy.level_range * hashUnit(sample_seed ^ 0x8da6b343u);
  }

  float soundscapeLayerPan(const AssetSlot& asset, uint32_t sample_seed, float distance) const {
    const SoundscapeLayerPolicy policy = soundscapeLayerPolicy(asset.asset_id);
    const float spread = policy.pan_base + clampFloat(distance, 0.0f, 1.0f) * policy.pan_distance;
    return ((hashUnit(sample_seed ^ 0xd1b54a32u) * 2.0f) - 1.0f) * spread;
  }

  float soundscapeLayerPlaybackRate(const AssetSlot& asset, uint32_t sample_seed) const {
    const SoundscapeLayerPolicy policy = soundscapeLayerPolicy(asset.asset_id);
    const float rate_delta = ((hashUnit(sample_seed ^ 0xc2b2ae35u) * 2.0f) - 1.0f) * policy.rate_depth;
    return clampFloat(1.0f + rate_delta, 0.5f, 2.0f);
  }

  float sampleVoiceEnvelope(const Voice& voice) const {
    float envelope = 1.0f;
    const uint32_t attack_frames = sampleFadeFrames(kSampleAttackSeconds, voice.total_frames / 2u);
    if (attack_frames > 1u && voice.age_frames < attack_frames) {
      envelope = std::min(envelope, static_cast<float>(voice.age_frames + 1u) / static_cast<float>(attack_frames));
    }
    if (!voice.looping) {
      const uint32_t release_frames = sampleFadeFrames(kSampleReleaseSeconds, voice.total_frames);
      if (release_frames > 1u && voice.remaining_frames < release_frames) {
        envelope = std::min(
            envelope,
            static_cast<float>(voice.remaining_frames) / static_cast<float>(release_frames));
      }
    }
    return clampFloat(envelope, 0.0f, 1.0f);
  }

  float assetSample(const AssetSlot& asset, uint32_t channel, uint32_t frame) const {
    const uint32_t resolved_channel = channel < asset.channel_count ? channel : 0u;
    const float* data = asset.channels[resolved_channel] != nullptr ? asset.channels[resolved_channel] : asset.channels[0];
    return data != nullptr && frame < asset.frame_count ? data[frame] : 0.0f;
  }

  void renderVoiceSample(Voice& voice, float& out_l, float& out_r) {
    out_l = 0.0f;
    out_r = 0.0f;
    if (!voice.active) {
      return;
    }
    if (voice.remaining_frames == 0u) {
      voice.active = false;
      return;
    }

    float sample_l = 0.0f;
    float sample_r = 0.0f;
    if (voice.sample_voice) {
      const AssetSlot& asset = assets[voice.asset_slot];
      if (asset.frame_count == 0u || asset.channels[0] == nullptr) {
        voice.active = false;
        return;
      }
      uint32_t frame = static_cast<uint32_t>(voice.sample_position);
      if (frame >= asset.frame_count) {
        if (!voice.looping) {
          voice.active = false;
          return;
        }
        while (frame >= asset.frame_count) {
          voice.sample_position -= static_cast<double>(asset.frame_count);
          frame = static_cast<uint32_t>(voice.sample_position);
        }
      }
      sample_l = assetSample(asset, 0u, frame);
      sample_r = asset.channel_count > 1u ? assetSample(asset, 1u, frame) : sample_l;
      const uint32_t crossfade_frames = loopCrossfadeFrames(asset);
      if (voice.looping && crossfade_frames > 1u && asset.frame_count > crossfade_frames) {
        const uint32_t crossfade_start = asset.frame_count - crossfade_frames;
        if (frame >= crossfade_start) {
          const uint32_t wrapped_frame = frame - crossfade_start;
          const float mix = static_cast<float>(wrapped_frame + 1u) / static_cast<float>(crossfade_frames);
          const float next_l = assetSample(asset, 0u, wrapped_frame);
          const float next_r = asset.channel_count > 1u ? assetSample(asset, 1u, wrapped_frame) : next_l;
          sample_l = sample_l * (1.0f - mix) + next_l * mix;
          sample_r = sample_r * (1.0f - mix) + next_r * mix;
        }
      }
      const float envelope = sampleVoiceEnvelope(voice);
      sample_l *= envelope;
      sample_r *= envelope;
      voice.sample_position += voice.sample_step;
    } else if (voice.drum_voice) {
      const float envelope = static_cast<float>(voice.remaining_frames) / static_cast<float>(std::max(1u, voice.total_frames));
      const float noise = hashUnit(static_cast<uint32_t>(voice.remaining_frames) ^ rng_state ^ voice.source_id) * 2.0f - 1.0f;
      sample_l = (std::sin(voice.phase) * 0.7f + noise * 0.3f) * envelope;
      sample_r = sample_l;
      voice.phase += kTwoPi * voice.frequency / sample_rate;
    } else {
      const float envelope = std::min(
          1.0f,
          static_cast<float>(voice.remaining_frames) / static_cast<float>(std::max(1u, voice.total_frames / 3u)));
      sample_l = std::sin(voice.phase) * envelope;
      sample_r = sample_l;
      voice.phase += kTwoPi * voice.frequency / sample_rate;
    }

    ++voice.age_frames;
    if (!voice.looping) {
      --voice.remaining_frames;
      if (voice.remaining_frames == 0u) {
        voice.active = false;
      }
    }
    out_l = sample_l * voice.amplitude;
    out_r = sample_r * voice.amplitude;
  }

  void mixSourceBuffer(
      uint32_t source_id,
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
    if (source_id < 1u || source_id > kSourceCount || source_id >= kStemCount) {
      return;
    }
    const SourceState& source = sources[source_id - 1u];
    if (!source.enabled) {
      return;
    }
    const float gain = source.level * source.dry_gain * moduleSourceOutputTrim(source_id);
    const uint32_t sidechain_target = sidechainTargetForSource(source_id);
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float send_left = in_l[i] * gain;
      const float send_right = in_r[i] * gain;
      const float duck_gain = sidechainGain(sidechain_target, frame);
      const float left = send_left * duck_gain;
      const float right = send_right * duck_gain;
      out_l[frame] += left;
      out_r[frame] += right;
      stem_l[source_id][frame] += left;
      stem_r[source_id][frame] += right;
      reverb_bus_l[frame] += send_left * source.reverb_send;
      reverb_bus_r[frame] += send_right * source.reverb_send;
      delay_a_bus_l[frame] += send_left * source.delay_a_send;
      delay_a_bus_r[frame] += send_right * source.delay_a_send;
      delay_b_bus_l[frame] += send_left * source.delay_b_send;
      delay_b_bus_r[frame] += send_right * source.delay_b_send;
      granular_bus_l[frame] += send_left * source.granular_send;
      granular_bus_r[frame] += send_right * source.granular_send;
    }
  }

  void renderPadModule(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    if (!pad_module || frames == 0u) {
      return;
    }
    advancePadVoiceReleases(frames);
    float* tap_l[kModuleTapCount]{};
    float* tap_r[kModuleTapCount]{};
    for (uint32_t bus = 0; bus < kModuleTapCount; ++bus) {
      tap_l[bus] = module_tap_l[bus];
      tap_r[bus] = module_tap_r[bus];
      std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
      std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
    }
    pad_module->processPlanarStereoTaps(silent_l, silent_r, tap_l, tap_r, KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT, static_cast<int>(frames));
    processPadPostChain(
        0u,
        KESSHO_PRODUCT_SOURCE_PAD1,
        module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD1],
        module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD1],
        frames);
    processPadPostChain(
        1u,
        KESSHO_PRODUCT_SOURCE_PAD2,
        module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD2],
        module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD2],
        frames);
    mixPadSourceBuffer(
        KESSHO_PRODUCT_SOURCE_PAD1,
        module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD1],
        module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD1],
        module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD1],
        module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD1],
        out_l,
        out_r,
        start,
        frames);
    mixPadSourceBuffer(
        KESSHO_PRODUCT_SOURCE_PAD2,
        module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD2],
        module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD2],
        module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD2],
        module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD2],
        out_l,
        out_r,
        start,
        frames);
  }

  void renderSingleModuleSource(
      kessho::core::IKesshoModule* module,
      uint32_t source_id,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
    if (module == nullptr || frames == 0u) {
      return;
    }
    std::fill(module_l, module_l + frames, 0.0f);
    std::fill(module_r, module_r + frames, 0.0f);
    module->processPlanarStereo(silent_l, silent_r, module_l, module_r, static_cast<int>(frames));
    if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1) {
      processLeadPostChain(0u, source_id, module_l, module_r, frames);
    } else if (source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
      processLeadPostChain(1u, source_id, module_l, module_r, frames);
    }
    mixSourceBuffer(source_id, module_l, module_r, out_l, out_r, start, frames);
  }

  void renderProductModules(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    if (!modules_ready || frames == 0u) {
      return;
    }
    renderPadModule(out_l, out_r, start, frames);
    renderSingleModuleSource(lead_modules[0].get(), KESSHO_PRODUCT_SOURCE_LEAD1, out_l, out_r, start, frames);
    renderSingleModuleSource(lead_modules[1].get(), KESSHO_PRODUCT_SOURCE_LEAD2, out_l, out_r, start, frames);
    renderSingleModuleSource(drum_module.get(), KESSHO_PRODUCT_SOURCE_DRUM, out_l, out_r, start, frames);
  }

  void mixFxBuffer(
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames,
      float gain,
      uint32_t sidechain_target) {
    if (gain <= 0.0f) {
      return;
    }
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float duck_gain = sidechainGain(sidechain_target, frame);
      const float left = in_l[i] * gain * duck_gain;
      const float right = in_r[i] * gain * duck_gain;
      out_l[frame] += left;
      out_r[frame] += right;
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
    }
  }

  float reverbPreCompressorGainDbForLevel(float level_db) const {
    const float threshold = clampFloat(fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
    const float knee = clampFloat(fx.reverb_pre_comp_knee, 0.0f, 40.0f);
    const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
    if (ratio <= 1.0f) {
      return 0.0f;
    }
    constexpr float strength = 0.04f;
    if (knee <= 0.0f) {
      if (level_db <= threshold) {
        return 0.0f;
      }
      return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
    }

    const float lower = threshold - knee * 0.5f;
    const float upper = threshold + knee * 0.5f;
    if (level_db <= lower) {
      return 0.0f;
    }
    if (level_db >= upper) {
      return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
    }

    const float x = level_db - lower;
    return ((1.0f / ratio) - 1.0f) * x * x / (2.0f * knee) * strength;
  }

  float reverbPreconditionerSoftLimit(float value) const {
    constexpr float limit = 1.047f;
    const float abs_value = std::abs(value);
    if (abs_value <= limit) {
      return value;
    }
    return std::copysign(limit + std::tanh((abs_value - limit) * 6.0f) * 0.005f, value);
  }

  void processReverbPreconditioner(uint32_t start, uint32_t frames) {
    if (frames == 0u || sample_rate <= 0.0) {
      return;
    }
    const float attack_ms = clampFloat(fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
    const float release_ms = clampFloat(fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
    const float attack_coeff = std::exp(-1.0f / std::max(1.0f, attack_ms * 0.001f * static_cast<float>(sample_rate)));
    const float release_coeff = std::exp(-1.0f / std::max(1.0f, release_ms * 0.001f * static_cast<float>(sample_rate)));
    const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
    const float ratio_depth = clampFloat((ratio - 1.0f) / 4.0f, 0.0f, 1.0f);
    const float native_auto_makeup = 1.0f + ratio_depth * 0.18f;
    const float input_makeup = clampFloat(fx.reverb_pre_comp_makeup, 0.5f, 4.0f);

    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float left = reverb_bus_l[frame];
      const float right = reverb_bus_r[frame];
      const float detector = std::max(std::max(std::abs(left), std::abs(right)), 1.0e-9f);
      const float level_db = 20.0f * std::log10(detector);
      const float target_gain = std::pow(10.0f, reverbPreCompressorGainDbForLevel(level_db) / 20.0f);
      const float coeff = target_gain < reverb_pre_comp_gain ? attack_coeff : release_coeff;
      reverb_pre_comp_gain = target_gain + (reverb_pre_comp_gain - target_gain) * coeff;
      const float gain = reverb_pre_comp_gain * native_auto_makeup * input_makeup;
      reverb_bus_l[frame] = reverbPreconditionerSoftLimit(left * gain);
      reverb_bus_r[frame] = reverbPreconditionerSoftLimit(right * gain);
    }
  }

  void renderDelayModule(
      kessho::core::IKesshoModule* module,
      float* input_l,
      float* input_r,
      float* cross_l,
      float* cross_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
    if (module == nullptr || frames == 0u) {
      return;
    }
    float* tap_l[kModuleTapCount]{};
    float* tap_r[kModuleTapCount]{};
    for (uint32_t bus = 0; bus < kModuleTapCount; ++bus) {
      tap_l[bus] = module_tap_l[bus];
      tap_r[bus] = module_tap_r[bus];
      std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
      std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
    }
    module->processPlanarStereoTaps(input_l + start, input_r + start, tap_l, tap_r, KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT, static_cast<int>(frames));
    mixFxBuffer(
        module_tap_l[KESSHO_MODULE_DELAY_A_TAP_MAIN],
        module_tap_r[KESSHO_MODULE_DELAY_A_TAP_MAIN],
        out_l,
        out_r,
        start,
        frames,
        1.0f,
        module == delay_a_module.get() ? kSidechainDelayA : kSidechainDelayB);
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      reverb_bus_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i];
      reverb_bus_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i];
      cross_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i];
      cross_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i];
      granular_bus_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i];
      granular_bus_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i];
    }
  }

  void renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    const bool active =
        fx.granular_enabled &&
        (fx.granular_mix > 0.0001f || routing.granular_to_reverb > 0.0001f);
    if (granular_module == nullptr || frames == 0u || !active) {
      return;
    }
    std::fill(module_l, module_l + frames, 0.0f);
    std::fill(module_r, module_r + frames, 0.0f);
    granular_module->processPlanarStereo(granular_bus_l + start, granular_bus_r + start, module_l, module_r, static_cast<int>(frames));
    mixFxBuffer(module_l, module_r, out_l, out_r, start, frames, fx.granular_mix, kSidechainGranular);
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      reverb_bus_l[frame] += module_l[i] * routing.granular_to_reverb;
      reverb_bus_r[frame] += module_r[i] * routing.granular_to_reverb;
    }
  }

  void renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    if (reverb_module == nullptr || frames == 0u || fx.reverb_mix <= 0.0f) {
      return;
    }
    std::fill(module_l, module_l + frames, 0.0f);
    std::fill(module_r, module_r + frames, 0.0f);
    processReverbPreconditioner(start, frames);
    reverb_module->processPlanarStereo(reverb_bus_l + start, reverb_bus_r + start, module_l, module_r, static_cast<int>(frames));
    mixFxBuffer(
        module_l,
        module_r,
        out_l,
        out_r,
        start,
        frames,
        fx.reverb_mix * kessho::product::generated::KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM,
        kSidechainReverb);
  }

  void renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    if (!modules_ready || frames == 0u) {
      return;
    }
    renderDelayModule(delay_a_module.get(), delay_a_bus_l, delay_a_bus_r, delay_b_bus_l, delay_b_bus_r, out_l, out_r, start, frames);
    renderDelayModule(delay_b_module.get(), delay_b_bus_l, delay_b_bus_r, delay_a_bus_l, delay_a_bus_r, out_l, out_r, start, frames);
    renderGranular(out_l, out_r, start, frames);
    renderReverb(out_l, out_r, start, frames);
  }

  void renderSampleVoices(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      for (Voice& voice : voices) {
        if (!voice.active) {
          continue;
        }
        float value_l = 0.0f;
        float value_r = 0.0f;
        renderVoiceSample(voice, value_l, value_r);
        const SourceState& source = sources[voice.source_id - 1u];
        const float pan_l = voice.pan <= 0.0f ? 1.0f : 1.0f - voice.pan * 0.5f;
        const float pan_r = voice.pan >= 0.0f ? 1.0f : 1.0f + voice.pan * 0.5f;
        const uint32_t sidechain_target = sidechainTargetForSource(voice.source_id);
        const float duck_gain = sidechainGain(sidechain_target, frame);
        float send_left = value_l * source.dry_gain * pan_l;
        float send_right = value_r * source.dry_gain * pan_r;
        processVoicePostChain(voice, send_left, send_right);
        const float left = send_left * duck_gain;
        const float right = send_right * duck_gain;
        out_l[frame] += left;
        out_r[frame] += right;
        if (voice.source_id < kStemCount) {
          stem_l[voice.source_id][frame] += left;
          stem_r[voice.source_id][frame] += right;
        }
        reverb_bus_l[frame] += send_left * source.reverb_send;
        reverb_bus_r[frame] += send_right * source.reverb_send;
        delay_a_bus_l[frame] += send_left * source.delay_a_send;
        delay_a_bus_r[frame] += send_right * source.delay_a_send;
        delay_b_bus_l[frame] += send_left * source.delay_b_send;
        delay_b_bus_r[frame] += send_right * source.delay_b_send;
        granular_bus_l[frame] += send_left * source.granular_send;
        granular_bus_r[frame] += send_right * source.granular_send;
      }
    }
  }

  void renderSegment(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
    renderSidechainGains(start, frames);
    renderProductModules(out_l, out_r, start, frames);
    renderSampleVoices(out_l, out_r, start, frames);
    renderFx(out_l, out_r, start, frames);
  }

  void renderSpectralFreeze(float* out_l, float* out_r, uint32_t frames) {
    if (spectral_freeze_module == nullptr || frames == 0u || !fx.spectral_freeze_enabled || fx.spectral_freeze_mix <= 0.0f) {
      return;
    }
    std::fill(module_l, module_l + frames, 0.0f);
    std::fill(module_r, module_r + frames, 0.0f);
    spectral_freeze_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
    const float mix = clampFloat(fx.spectral_freeze_mix, 0.0f, 1.0f);
    for (uint32_t i = 0; i < frames; ++i) {
      const float wet_l = module_l[i] * mix;
      const float wet_r = module_r[i] * mix;
      out_l[i] = out_l[i] * (1.0f - mix) + wet_l;
      out_r[i] = out_r[i] * (1.0f - mix) + wet_r;
      stem_l[KESSHO_PRODUCT_STEM_FX][i] += wet_l;
      stem_r[KESSHO_PRODUCT_STEM_FX][i] += wet_r;
    }
  }

  void renderDynamics(float* out_l, float* out_r, uint32_t frames) {
    const bool dynamics_active =
        fx.dynamics_drive > 0.0001f ||
        (!fx.dynamics_enabled && master_saturation_drive > 0.0001f) ||
        (
            fx.dynamics_enabled &&
            ((fx.dynamics_character_enabled && fx.dynamics_character_mix > 0.0001f) ||
             (fx.dynamics_degrade_enabled && fx.dynamics_degrade_mix > 0.0001f) ||
             (fx.dynamics_saturation_enabled && fx.dynamics_saturation_drive > 0.0001f) ||
             (fx.dynamics_end_comp_enabled && fx.dynamics_end_comp_mix > 0.0001f)));
    if (dynamics_character_module == nullptr || frames == 0u || !dynamics_active) {
      return;
    }
    std::fill(module_l, module_l + frames, 0.0f);
    std::fill(module_r, module_r + frames, 0.0f);
    dynamics_character_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
    for (uint32_t i = 0; i < frames; ++i) {
      out_l[i] = module_l[i];
      out_r[i] = module_r[i];
    }
  }

  void applyMaster(float* out_l, float* out_r, uint32_t frames) {
    renderSpectralFreeze(out_l, out_r, frames);
    renderDynamics(out_l, out_r, frames);
    const float ceiling = master_limiter_ceiling_gain;
    for (uint32_t i = 0; i < frames; ++i) {
      out_l[i] = clampFloat(out_l[i] * master_gain, -ceiling, ceiling);
      out_r[i] = clampFloat(out_r[i] * master_gain, -ceiling, ceiling);
      stem_l[KESSHO_PRODUCT_STEM_MASTER][i] = out_l[i];
      stem_r[KESSHO_PRODUCT_STEM_MASTER][i] = out_r[i];
    }
  }

  void clearOutput(float* out_l, float* out_r, uint32_t frames) {
    for (uint32_t i = 0; i < frames; ++i) {
      out_l[i] = 0.0f;
      out_r[i] = 0.0f;
    }
    const uint32_t stem_frames = std::min<uint32_t>(frames, kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES);
    for (uint32_t stem = 0; stem < kStemCount; ++stem) {
      for (uint32_t i = 0; i < stem_frames; ++i) {
        stem_l[stem][i] = 0.0f;
        stem_r[stem][i] = 0.0f;
      }
    }
    for (uint32_t i = 0; i < stem_frames; ++i) {
      reverb_bus_l[i] = 0.0f;
      reverb_bus_r[i] = 0.0f;
      delay_a_bus_l[i] = 0.0f;
      delay_a_bus_r[i] = 0.0f;
      delay_b_bus_l[i] = 0.0f;
      delay_b_bus_r[i] = 0.0f;
      granular_bus_l[i] = 0.0f;
      granular_bus_r[i] = 0.0f;
    }
    last_stem_frames = stem_frames;
  }

  void advanceJourney(uint32_t frames) {
    if (!journey_running || !transport.running) {
      return;
    }
    const double samples_per_bar = transport.samplesPerBeat(sample_rate) * static_cast<double>(std::max(1u, transport.beats_per_bar));
    const double period_samples = samples_per_bar * static_cast<double>(std::max(0.25f, journey_rate_bars));
    if (period_samples <= 0.0) {
      return;
    }
    journey_phase += static_cast<float>(static_cast<double>(frames) / period_samples);
    journey_phase -= std::floor(journey_phase);
  }

  void render(float* out_l, float* out_r, uint32_t frames) {
    if (out_l == nullptr || out_r == nullptr || frames == 0u) {
      return;
    }
    if (frames > max_block_size || frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
      clearOutput(out_l, out_r, std::min<uint32_t>(frames, max_block_size));
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_RENDER_BLOCK_TOO_LARGE;
      return;
    }

    clearOutput(out_l, out_r, frames);
    sortControlEvents();

    uint32_t control_index = 0;
    while (control_index < control_event_count && control_events[control_index].event.sample_offset == 0u) {
      applyControlEvent(control_events[control_index].event);
      ++control_index;
    }

    advanceModulationRanges(frames);
    ensureSoundscapeVoice();
    generateSequencerEvents(frames);
    uint32_t sequencer_index = 0;

    uint32_t cursor = 0;
    while (cursor < frames) {
      while (control_index < control_event_count && control_events[control_index].event.sample_offset == cursor) {
        applyControlEvent(control_events[control_index].event);
        ++control_index;
      }
      while (sequencer_index < sequencer_events.count && sequencer_events.events[sequencer_index].sample_offset == cursor) {
        triggerSequencerEvent(sequencer_events.events[sequencer_index]);
        ++sequencer_index;
      }

      uint32_t next_event_offset = frames;
      if (control_index < control_event_count) {
        next_event_offset = std::min(next_event_offset, control_events[control_index].event.sample_offset);
      }
      if (sequencer_index < sequencer_events.count) {
        next_event_offset = std::min(next_event_offset, sequencer_events.events[sequencer_index].sample_offset);
      }
      if (next_event_offset <= cursor) {
        next_event_offset = cursor + 1u;
      }
      const uint32_t segment_frames = next_event_offset - cursor;
      renderSegment(out_l, out_r, cursor, segment_frames);
      if (transport.running) {
        transport.sample_frame += segment_frames;
      }
      cursor = next_event_offset;
    }

    applyMaster(out_l, out_r, frames);
    compactControlEvents(frames, control_index);
    advanceJourney(frames);
    updateTelemetry(frames);
  }

  void updateTelemetry(uint32_t frames) {
    updateHarmonyTelemetry(transport.sample_frame);
    uint32_t active_voice_count = 0;
    uint32_t active_source_mask = 0;
    for (const Voice& voice : voices) {
      if (voice.active) {
        ++active_voice_count;
        if (voice.source_id >= 1u && voice.source_id <= 31u) {
          active_source_mask |= 1u << voice.source_id;
        }
      }
    }
    const uint32_t pad_active_count = pad_module ? static_cast<uint32_t>(std::max(0, pad_module->activeVoiceCount())) : 0u;
    if (pad_active_count > 0u) {
      active_voice_count += pad_active_count;
      active_source_mask |= 1u << KESSHO_PRODUCT_SOURCE_PAD1;
      active_source_mask |= 1u << KESSHO_PRODUCT_SOURCE_PAD2;
    }
    for (uint32_t i = 0; i < 2u; ++i) {
      const uint32_t lead_active_count = lead_modules[i] ? static_cast<uint32_t>(std::max(0, lead_modules[i]->activeVoiceCount())) : 0u;
      if (lead_active_count > 0u) {
        active_voice_count += lead_active_count;
        active_source_mask |= 1u << (i == 0u ? KESSHO_PRODUCT_SOURCE_LEAD1 : KESSHO_PRODUCT_SOURCE_LEAD2);
      }
    }
    const uint32_t drum_active_count = drum_module ? static_cast<uint32_t>(std::max(0, drum_module->activeVoiceCount())) : 0u;
    if (drum_active_count > 0u) {
      active_voice_count += drum_active_count;
      active_source_mask |= 1u << KESSHO_PRODUCT_SOURCE_DRUM;
    }
    uint32_t active_source_count = 0;
    for (uint32_t bit = 0; bit < 32u; ++bit) {
      active_source_count += (active_source_mask & (1u << bit)) != 0u ? 1u : 0u;
    }
    uint32_t active_asset_count = 0;
    for (const AssetSlot& asset : assets) {
      active_asset_count += asset.active ? 1u : 0u;
    }

    telemetry.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
    telemetry.sample_rate = sample_rate;
    telemetry.block_size = frames == 0u ? max_block_size : frames;
    telemetry.transport_running = transport.running ? 1u : 0u;
    telemetry.absolute_sample_time = transport.sample_frame;
    telemetry.beat_position = transport.beatPosition(sample_rate);
    telemetry.bar_index = transport.barIndex(sample_rate);
    telemetry.phrase_index = transport.phraseIndex(sample_rate);
    telemetry.active_sources = active_source_count;
    telemetry.active_voices = active_voice_count;
    telemetry.active_assets = active_asset_count;
    telemetry.sequencer_event_count = sequencer_events.count;
    telemetry.control_queue_depth = control_event_count;
    telemetry.journey_morph_running = journey_running ? 1u : 0u;
    telemetry.journey_morph_phase = journey_phase;
    telemetry.harmony_root_midi = harmony.root_midi;
    telemetry.harmony_scale_id = harmony.scale_id;
    telemetry.harmony_tension = harmony.tension;
    telemetry.harmony_chord_degree = harmony.chord_degree;
    for (uint32_t i = 0; i < 4u; ++i) {
      telemetry.harmony_chord_midi[i] = harmony.chord_midi[i];
    }
    uint32_t active_range_count = 0;
    uint32_t walk_count = 0;
    for (uint32_t i = 0; i < kMaxRuntimeWalkTelemetry; ++i) {
      telemetry.runtime_walk_control_ids[i] = 0u;
      telemetry.runtime_walk_values[i] = 0.0f;
    }
    for (const ModulationRange& range : modulation_ranges) {
      if (!range.active) {
        continue;
      }
      ++active_range_count;
      if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK && walk_count < kMaxRuntimeWalkTelemetry) {
        telemetry.runtime_walk_control_ids[walk_count] = range.control_id;
        telemetry.runtime_walk_values[walk_count] = range.current_value;
        ++walk_count;
      }
    }
    telemetry.modulation_range_count = active_range_count;
    telemetry.runtime_walk_count = walk_count;
    telemetry.rng_seed = rng_seed;
    telemetry.rng_state = rng_state;
    for (uint32_t i = 0; i < kSourceCount; ++i) {
      telemetry.source_preset_ids[i] = sources[i].preset_id;
    }
  }
};

extern "C" {

int32_t kessho_product_get_abi_version(void) {
  return KESSHO_PRODUCT_ABI_VERSION;
}

KesshoProductCapabilityReport kessho_product_get_capability_report(void) {
  KesshoProductCapabilityReport report{};
  report.abi_version = KESSHO_PRODUCT_ABI_VERSION;
  report.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  report.supports_full_product_graph = 0;
  report.supports_synth_sequencer = 1;
  report.supports_drum_sequencer = 1;
  report.supports_journey_morph_clock = 1;
  report.supports_harmony_core = 1;
  report.supports_core_asset_rendering = 1;
  report.supports_native_bridge = 0;
  report.supports_recordable_stems = 1;
  report.supports_cpu_telemetry = 1;
  report.legacy_fallback_count = 0;
  report.unsupported_method_count = 0;
  return report;
}

KesshoProductEngine* kessho_product_create(double sample_rate, uint32_t max_block_size, uint32_t flags) {
  if (sample_rate <= 0.0 || max_block_size == 0u ||
      max_block_size > kessho::product::generated::KESSHO_PRODUCT_MAX_BLOCK_SIZE) {
    return nullptr;
  }
  KesshoProductEngine* engine = new (std::nothrow) KesshoProductEngine(sample_rate, max_block_size, flags);
  if (engine == nullptr) {
    return nullptr;
  }
  if (!engine->modules_ready) {
    delete engine;
    return nullptr;
  }
  return engine;
}

void kessho_product_destroy(KesshoProductEngine* engine) {
  delete engine;
}

void kessho_product_reset(KesshoProductEngine* engine) {
  if (engine == nullptr) {
    return;
  }
  engine->reset();
}

int32_t kessho_product_load_snapshot_v2(
    KesshoProductEngine* engine,
    const void* snapshot_bytes,
    uint32_t snapshot_byte_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (snapshot_bytes == nullptr || snapshot_byte_count < sizeof(KesshoProductSnapshotV2)) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
  }
  const KesshoProductSnapshotV2* snapshot = static_cast<const KesshoProductSnapshotV2*>(snapshot_bytes);
  return engine->loadSnapshot(*snapshot);
}

int32_t kessho_product_enqueue_event(KesshoProductEngine* engine, const KesshoProductEvent* event) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (event == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  return engine->enqueueEvent(*event);
}

int32_t kessho_product_enqueue_events(
    KesshoProductEngine* engine,
    const KesshoProductEvent* events,
    uint32_t event_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (events == nullptr && event_count > 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  for (uint32_t i = 0; i < event_count; ++i) {
    const int32_t result = engine->enqueueEvent(events[i]);
    if (result != KESSHO_PRODUCT_OK) {
      return result;
    }
  }
  return KESSHO_PRODUCT_OK;
}

void kessho_product_render(KesshoProductEngine* engine, float* out_l, float* out_r, uint32_t frames) {
  if (engine == nullptr || out_l == nullptr || out_r == nullptr) {
    return;
  }
  engine->render(out_l, out_r, frames);
}

int32_t kessho_product_get_stem(
    KesshoProductEngine* engine,
    uint32_t stem_id,
    float* out_l,
    float* out_r,
    uint32_t frames) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_l == nullptr || out_r == nullptr || stem_id >= kStemCount) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  const uint32_t copy_frames = std::min<uint32_t>(frames, engine->last_stem_frames);
  for (uint32_t i = 0; i < copy_frames; ++i) {
    out_l[i] = engine->stem_l[stem_id][i];
    out_r[i] = engine->stem_r[stem_id][i];
  }
  for (uint32_t i = copy_frames; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
  return KESSHO_PRODUCT_OK;
}

KesshoProductTelemetry kessho_product_get_telemetry(KesshoProductEngine* engine) {
  KesshoProductTelemetry telemetry{};
  if (engine == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
    return telemetry;
  }
  return engine->telemetry;
}

int32_t kessho_product_copy_telemetry(
    KesshoProductEngine* engine,
    KesshoProductTelemetry* out_telemetry) {
  if (engine == nullptr || out_telemetry == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  *out_telemetry = engine->telemetry;
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_register_asset_buffer(
    KesshoProductEngine* engine,
    uint32_t asset_id,
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double asset_sample_rate,
    uint32_t flags) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (asset_id == 0u || channels == nullptr || channel_count == 0u || channel_count > 2u ||
      channels[0] == nullptr || frame_count == 0u || asset_sample_rate <= 0.0) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
    return KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
  }

  uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
      if (!engine->assets[i].active) {
        slot = i;
        break;
      }
    }
  }
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  }

  AssetSlot& asset = engine->assets[slot];
  asset.active = true;
  asset.asset_id = asset_id;
  asset.channel_count = channel_count;
  asset.frame_count = frame_count;
  asset.sample_rate = asset_sample_rate;
  asset.flags = flags;
  asset.channels[0] = channels[0];
  asset.channels[1] = channel_count > 1u ? channels[1] : channels[0];
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_unregister_asset_buffer(KesshoProductEngine* engine, uint32_t asset_id) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  const uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    return KESSHO_PRODUCT_ERROR_INVALID_ASSET_ID;
  }
  engine->assets[slot] = {};
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_debug_render_events(
    KesshoProductEngine* engine,
    KesshoSequencerEvent* out_events,
    uint32_t max_event_count,
    uint32_t frames) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_events == nullptr && max_event_count > 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  engine->sortControlEvents();
  uint32_t control_index = 0;
  while (control_index < engine->control_event_count &&
         engine->control_events[control_index].event.sample_offset == 0u) {
    engine->applyControlEvent(engine->control_events[control_index].event);
    ++control_index;
  }
  engine->advanceModulationRanges(frames);
  engine->generateSequencerEvents(frames);
  const uint32_t count = std::min<uint32_t>(engine->sequencer_events.count, max_event_count);
  for (uint32_t i = 0; i < count; ++i) {
    out_events[i] = engine->sequencer_events.events[i];
  }
  if (engine->transport.running) {
    engine->transport.sample_frame += frames;
  }
  engine->compactControlEvents(frames, control_index);
  engine->updateTelemetry(frames);
  return static_cast<int32_t>(count);
}

} // extern "C"
