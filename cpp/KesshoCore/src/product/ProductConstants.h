#pragma once

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoCore/KesshoTypes.h"

#include <cstdint>

#include "KesshoProductDefaults.h"
#include "KesshoProductParamIds.h"
#include "KesshoProductSchema.h"
#include "KesshoProductSchemaHash.h"
#include "../modules/KesshoModule.h"

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

} // namespace kessho::product::internal
