#pragma once

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

namespace kessho::product::internal {

constexpr double kTwoPi = 6.283185307179586476925286766559;
constexpr float kProductTuningA4Hz = 432.0f;
constexpr float kProductTelemetrySilenceDb = -100.0f;
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

inline float clampFloat(float value, float min_value, float max_value) {
  if (!std::isfinite(value)) {
    return min_value;
  }
  return std::min(max_value, std::max(min_value, value));
}

inline float scaleSourceDistance(float distance) {
  const float safe_distance = clampFloat(distance, 0.0f, 1.0f);
  return 1.0f - (1.0f - safe_distance) * (1.0f - safe_distance);
}

inline float anchoredDistanceValue(float distance, float start_value, float slight_value, float max_value) {
  constexpr float kSlightPoint = 0.25f;
  const float scaled = scaleSourceDistance(distance);
  if (scaled <= kSlightPoint) {
    const float head_t = kSlightPoint <= 0.0f ? 1.0f : scaled / kSlightPoint;
    return start_value + head_t * (slight_value - start_value);
  }
  const float tail_t = (scaled - kSlightPoint) / (1.0f - kSlightPoint);
  return slight_value + tail_t * (max_value - slight_value);
}

inline float distanceMultiply(float base, float distance, float slight_mul, float max_mul) {
  return base * anchoredDistanceValue(distance, 1.0f, slight_mul, max_mul);
}

inline float distanceAdd(float base, float distance, float slight_delta, float max_delta) {
  return base + anchoredDistanceValue(distance, 0.0f, slight_delta, max_delta);
}

inline uint32_t clampU32(uint32_t value, uint32_t min_value, uint32_t max_value) {
  return std::min(max_value, std::max(min_value, value));
}

inline float midiToFrequency(float midi_note) {
  return kProductTuningA4Hz * std::pow(2.0f, (midi_note - 69.0f) / 12.0f);
}

inline float dbToGain(float db) {
  return std::pow(10.0f, db / 20.0f);
}

inline float gainToDb(float gain) {
  if (!std::isfinite(gain) || gain <= 0.000000001f) {
    return kProductTelemetrySilenceDb;
  }
  return 20.0f * std::log10(gain);
}

inline float unitToLogFrequency(float value, float min_hz, float max_hz) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return min_hz * std::pow(max_hz / min_hz, t);
}

uint32_t hashU32(uint32_t value);

float hashUnit(uint32_t value);

inline int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

inline uint32_t positiveModulo(int32_t value, uint32_t modulo) {
  const int32_t signed_modulo = static_cast<int32_t>(modulo);
  int32_t result = value % signed_modulo;
  if (result < 0) {
    result += signed_modulo;
  }
  return static_cast<uint32_t>(result);
}

inline bool euclidHit(uint32_t step, uint32_t steps, uint32_t fills, int32_t rotation) {
  if (steps == 0 || fills == 0) {
    return false;
  }
  if (fills >= steps) {
    return true;
  }

  const uint32_t rotated = positiveModulo(static_cast<int32_t>(step) - rotation, steps);
  return (rotated * fills) % steps < fills;
}

struct ProductTransport;
struct LaneState;

uint32_t scaleIntervals(uint32_t scale_id, int intervals[kMaxScaleNotes]);

uint32_t circleOfFifthsProgressionDegree(
    uint32_t seed,
    float tension,
    uint64_t bar,
    uint64_t phrase,
    uint32_t scale_count);

double sequencerSamplesPerStep(const ProductTransport& transport, double sample_rate, uint32_t clock_division);

double sequencerSwingSamples(const ProductTransport& transport, const LaneState& lane, double samples_per_step);

int64_t sequencerFirstStep(uint64_t block_start, double samples_per_step);

int64_t sequencerLastStep(uint64_t block_end, double samples_per_step);

struct ProductTransport {
  uint64_t sample_frame = 0;
  bool running = false;
  float bpm = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BPM;
  uint32_t beats_per_bar = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR;
  uint32_t bars_per_phrase = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE;
  float swing = 0.0f;

  void reset();
  double samplesPerBeat(double sample_rate) const;
  double beatPosition(double sample_rate) const;
  uint64_t barIndex(double sample_rate) const;
  uint64_t barIndexAt(double sample_rate, uint64_t sample) const;
  uint64_t phraseIndex(double sample_rate) const;
  uint64_t phraseIndexAt(double sample_rate, uint64_t sample) const;
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

inline uint32_t defaultSourcePresetId(uint32_t source_id) {
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

inline const kessho::product::generated::KesshoProductGeneratedSourcePreset* findSourcePreset(uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

inline const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* findDrumVoicePreset(
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

inline float smoothstep01(float value) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

inline bool drumParamUsesPresetSnap(uint32_t param_index) {
  return param_index == 32u || param_index == 82u || param_index == 96u;
}

inline kessho::core::KesshoSourcePresetPatch sourcePresetPatch(
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

inline float moduleSourceOutputTrim(uint32_t source_id) {
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

} // namespace kessho::product::internal

using namespace kessho::product::internal;

struct KesshoProductEngine {
  explicit KesshoProductEngine(double in_sample_rate, uint32_t in_max_block_size, uint32_t in_flags);

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
  float master_true_peak_prev_l = 0.0f;
  float master_true_peak_prev_r = 0.0f;
  double master_integrated_loudness_energy = 0.0;
  uint64_t master_integrated_loudness_frames = 0;
  FxState fx{};
  RoutingState routing{};
  uint32_t rng_seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t rng_state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t sequencer_ui_state_revision = 1u;
  uint32_t sequencer_ui_last_changed_target_id = 0u;
  uint32_t sequencer_ui_last_changed_lane_index = 0xffffffffu;
  uint32_t sequencer_ui_last_change_kind = 0u;
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

  bool prepareProductModules();

  float dynamicsModRoute(const float sources[kDynamicsModSourceCount], uint32_t target) const;

  void configureFxModules();

  void setMasterLimiterCeilingDb(float value);

  void resetMasterTelemetryState();

  void resetSidechainRuntime();

  float sidechainTargetAmount(uint32_t target) const;

  uint32_t sidechainTargetForSource(uint32_t source_id) const;

  float sidechainGain(uint32_t target, uint32_t frame) const;

  void triggerSidechainDuck(uint32_t drum_voice, float velocity);

  float advanceSidechainEnvelope(SidechainEnvelope& envelope);

  void renderSidechainGains(uint32_t start, uint32_t frames);

  void loadDefaults();

  void reset();

  int32_t loadSnapshot(const KesshoProductSnapshotV2& snapshot);

  void loadLaneSnapshots(
      const KesshoProductSequencerSnapshot& snapshot,
      LaneState* lanes,
      uint32_t fallback_source);

  int32_t enqueueEvent(const KesshoProductEvent& event);

  void sortControlEvents();

  float manualNoteHoldSeconds(uint32_t source_id, float requested_seconds) const;

  void applyControlEvent(const KesshoProductEvent& event);

  uint32_t resolveMidiTargetSource(const KesshoProductEvent& event, uint32_t status) const;

  void applyMidiEvent(const KesshoProductEvent& event);

  void clearStepOverride(LaneState& lane, uint32_t step);

  bool stepMaskHas(uint32_t low, uint32_t high, uint32_t step) const;

  void setStepMask(uint32_t& low, uint32_t& high, uint32_t step);

  void clearStepMask(uint32_t& low, uint32_t& high, uint32_t step);

  float stepFloatValue(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const float values[64],
      float fallback) const;

  uint32_t stepU32Value(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const uint32_t values[64],
      uint32_t fallback) const;

  void setStepOverride(LaneState& lane, uint32_t step, bool enabled);

  void clearLaneStepOverrides(LaneState& lane);

  uint32_t stepFieldId(uint32_t field) const;

  bool validStepFieldId(uint32_t field_id) const;

  void applyStepFieldConfig(LaneState& lane, const KesshoProductEvent& event);

  uint32_t subLaneStepForField(
      const LaneState& lane,
      uint32_t field,
      uint32_t trigger_step,
      int64_t absolute_step) const;

  void clearStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step);

  void setStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step, float value, float value2);

  void applySequencerStepEvent(const KesshoProductEvent& event);

  bool isSequencerLaneParam(uint32_t param_id) const;

  void applySequencerLaneParamEvent(const KesshoProductEvent& event);

  LaneState* sequencerLanesForEvent(const KesshoProductEvent& event, uint32_t& lane_count);

  void applyResetSequencerLaneHomeEvent(const KesshoProductEvent& event);

  bool dicePatternHit(uint32_t step, uint32_t steps, uint32_t fills, uint32_t rotation) const;

  bool dicePatternMatchesBase(const LaneState& lane, uint32_t rotation, uint32_t fills) const;

  void applyDiceSequencerLaneEvent(const KesshoProductEvent& event);

  void applyJourneyStateEvent(const KesshoProductEvent& event);

  bool applyGranularVoiceParamEvent(const KesshoProductEvent& event);

  bool applyGranularParamEvent(const KesshoProductEvent& event);

  bool applyDynamicsModParamEvent(const KesshoProductEvent& event);

  void applyParam(const KesshoProductEvent& event);

  bool isSourceParam(uint32_t param_id) const;

  bool isSourceTarget(uint32_t target_id) const;

  bool isDrumRangeTarget(uint32_t target_id) const;

  ModulationRange* findModulationRange(uint32_t target_id, uint32_t param_id);

  const ModulationRange* findModulationRange(uint32_t target_id, uint32_t param_id) const;

  ModulationRange* findOrAllocateModulationRange(uint32_t target_id, uint32_t param_id);

  void applyModulationRangeEvent(const KesshoProductEvent& event);

  void applySourcePresetEvent(const KesshoProductEvent& event);

  void applySourcePresetMacros(const SourceState& source, float& morph, float& distance, float& expression) const;

  kessho::core::KesshoSourcePresetPatch drumVoiceMorphPatch(const SourceState& source) const;

  bool exactPadMacrosDifferFromDefaults(float morph, float distance, float expression) const;

  float modulationRangeSample(const ModulationRange& range, float fallback, uint32_t sample_seed) const;

  float resolveModulatedValue(uint32_t target_id, uint32_t param_id, float fallback, uint32_t sample_seed) const;

  void applyRuntimeWalkValue(const ModulationRange& range);

  void advanceModulationRanges(uint32_t frames);

  void applySourceParam(const KesshoProductEvent& event);

  void compactControlEvents(uint32_t frames, uint32_t first_unprocessed);

  bool trigConditionPass(uint32_t trig_condition, uint64_t absolute_sample) const;

  bool stepTrigConditionPass(const LaneState& lane, uint32_t step, int64_t absolute_step) const;

  bool manualMaskHit(const LaneState& lane, uint32_t step) const;

  float resolveHarmonyMidi(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample) const;

  void updateHarmonyTelemetry(uint64_t absolute_sample);

  void markSequencerUiStateChanged(uint32_t target_id, uint32_t lane_index, uint32_t change_kind);

  void copySequencerLaneUiState(const LaneState& lane, KesshoProductSequencerLaneUiState& out) const;

  void copySequencerUiState(KesshoProductSequencerUiState& out) const;

  float evolutionDepth() const;

  float evolvedLaneValue(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample,
      uint32_t component,
      float base,
      float depth,
      float min_value,
      float max_value) const;

  void generateLaneEvents(
      const LaneState* lanes,
      uint32_t lane_count,
      uint32_t frames,
      SequencerBuffer& out) const;

  void generateSequencerEvents(uint32_t frames);

  uint32_t findAssetSlot(uint32_t asset_id) const;

  bool pianoAssetRootMidi(uint32_t asset_id, float& out_midi) const;

  uint32_t findPianoAssetSlot(float midi_note, float& out_root_midi) const;

  uint32_t allocateVoice();

  bool hasActiveSourceVoice(uint32_t source_id) const;

  bool soundscapeWantsAsset(const SourceState& source, uint32_t asset_id) const;

  bool hasActiveSoundscapeVoice(uint32_t asset_id) const;

  void releaseUnwantedSoundscapeVoices(const SourceState& source);

  void reportMissingSourceAsset(SourceState& source);

  void reportMissingSourceAsset(SourceState& source, uint32_t asset_id);

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
      bool scale_velocity_by_expression);

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
      bool scale_velocity_by_expression = true);

  void ensureSoundscapeVoice();

  void releaseSourceVoices(uint32_t source_id);

  void schedulePadVoiceRelease(uint32_t pad_index, uint32_t voice_index, float hold_seconds);

  void clearPadVoiceReleases(uint32_t source_id);

  void advancePadVoiceReleases(uint32_t frames);

  void resetPadPostChains();

  float resolveSourcePostLpfHz(uint32_t source_id) const;

  float resolveSourceStereoWidth(uint32_t source_id) const;

  void updatePadPostChainCoefficients(PadPostChainState& chain);

  float processPadPostLpfSample(const PadPostChainState& chain, BiquadState& state, float input) const;

  void processPadPostChain(uint32_t pad_index, uint32_t source_id, float* left, float* right, uint32_t frames);

  void resetLeadPostChains();

  void updateLeadPostChainCoefficients(LeadPostChainState& chain);

  float processLeadPostLpfSample(const LeadPostChainState& chain, BiquadState& state, float input) const;

  void processLeadPostChain(uint32_t lead_index, uint32_t source_id, float* left, float* right, uint32_t frames);

  void updateVoicePostChainCoefficients(Voice& voice, float cutoff_hz);

  float processVoicePostLpfSample(const Voice& voice, BiquadState& state, float input) const;

  void processVoicePostChain(Voice& voice, float& left, float& right);

  void mixPadSourceBuffer(
      uint32_t source_id,
      const float* dry_l,
      const float* dry_r,
      const float* send_l,
      const float* send_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);

  void triggerSequencerEvent(const KesshoSequencerEvent& event);

  uint32_t sampleFadeFrames(double seconds, uint32_t limit_frames) const;

  uint32_t loopCrossfadeFrames(const AssetSlot& asset) const;

  double soundscapeRandomStartFrame(const AssetSlot& asset, uint32_t sample_seed) const;

  SoundscapeLayerPolicy soundscapeLayerPolicy(uint32_t asset_id) const;

  float soundscapeLayerLevel(const AssetSlot& asset, uint32_t sample_seed) const;

  float soundscapeLayerPan(const AssetSlot& asset, uint32_t sample_seed, float distance) const;

  float soundscapeLayerPlaybackRate(const AssetSlot& asset, uint32_t sample_seed) const;

  float sampleVoiceEnvelope(const Voice& voice) const;

  float assetSample(const AssetSlot& asset, uint32_t channel, uint32_t frame) const;

  void renderVoiceSample(Voice& voice, float& out_l, float& out_r);

  void mixSourceBuffer(
      uint32_t source_id,
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);

  void renderPadModule(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void renderSingleModuleSource(
      kessho::core::IKesshoModule* module,
      uint32_t source_id,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);

  void renderProductModules(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void mixFxBuffer(
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames,
      float gain,
      uint32_t sidechain_target);

  float reverbPreCompressorGainDbForLevel(float level_db) const;

  float reverbPreconditionerSoftLimit(float value) const;

  void processReverbPreconditioner(uint32_t start, uint32_t frames);

  void renderDelayModule(
      kessho::core::IKesshoModule* module,
      float* input_l,
      float* input_r,
      float* cross_l,
      float* cross_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);

  void renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void renderSampleVoices(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void renderSegment(float* out_l, float* out_r, uint32_t start, uint32_t frames);

  void renderSpectralFreeze(float* out_l, float* out_r, uint32_t frames);

  void renderDynamics(float* out_l, float* out_r, uint32_t frames);

  void applyMaster(float* out_l, float* out_r, uint32_t frames);

  void clearOutput(float* out_l, float* out_r, uint32_t frames);

  void advanceJourney(uint32_t frames);

  void render(float* out_l, float* out_r, uint32_t frames);

  void updateTelemetry(uint32_t frames);
};
