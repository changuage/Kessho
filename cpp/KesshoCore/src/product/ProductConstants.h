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
constexpr float kMasterLimiterWebAudioMakeupGain = 1.2f;
constexpr uint32_t kDrumVoiceMaskSeedFlag = 0x80000000u;
constexpr uint32_t kDrumVoiceMaskSeedMask = 0x7f000000u;
constexpr uint32_t kDrumVoiceMaskSeedShift = 24u;
constexpr uint32_t kDrumVoiceMaskSeedPayloadMask = 0x00ffffffu;
constexpr uint32_t kPadVoiceSeedFlag = 0x40000000u;
constexpr uint32_t kPadVoiceSeedMask = 0x07000000u;
constexpr uint32_t kPadVoiceSeedShift = 24u;
constexpr uint32_t kPadVoiceSeedPayloadMask = 0x00ffffffu;
constexpr uint32_t kPadVoiceNoPreference = 0xffffffffu;
constexpr uint32_t kSequencerEventPadVoiceFlag = 0x80000000u;
constexpr uint32_t kSequencerEventPadVoiceMask = 0x07000000u;
constexpr uint32_t kSequencerEventPadVoiceShift = 24u;
constexpr uint32_t kProductPadVoiceCount = 6u;
constexpr uint32_t kProductInvalidVoiceIndex = 0xffffffffu;
constexpr uint32_t kProductMidiChannelCount = 16u;
constexpr uint32_t kProductMidiControllerCount = 128u;
constexpr uint32_t kProductMidiPitchBendCenter = 8192u;
constexpr uint32_t kProductMidiPitchBendMax = 16383u;
constexpr float kProductMidiPitchBendRangeSemitones = 2.0f;
constexpr uint32_t kMaxProductMidiNoteSlots = 96u;
constexpr uint32_t kSourceCount = 7;
constexpr uint32_t kStemCount = 9;
constexpr uint32_t kMaxLaneCount = 16;
constexpr uint32_t kMaxScaleNotes = 8;
constexpr uint32_t kProductControlOnlyModulationTarget = 0x7ffffff0u;
constexpr uint32_t kModuleTapCount = KESSHO_MODULE_MAX_OUTPUT_TAPS;
constexpr uint32_t kMaxModulationRanges = 96;
constexpr uint32_t kMaxRuntimeWalkTelemetry = KESSHO_PRODUCT_RUNTIME_WALK_TELEMETRY_CAPACITY;
constexpr uint32_t kProductPadRuntimeParamIdBase = 2000u;
constexpr uint32_t kProductPad2RuntimeParamIdBase = 2100u;
constexpr uint32_t kProductPadRuntimeParamCount = kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
static_assert(
    kProductPadRuntimeParamCount == KESSHO_PRODUCT_PAD_OVERRIDE_PARAM_COUNT,
    "Pad override snapshot ABI count must match module Pad param count");
constexpr uint32_t kProductLeadRuntimeParamIdBase = 2200u;
constexpr uint32_t kProductLead2RuntimeParamIdBase = 2300u;
constexpr uint32_t kProductLeadRuntimeParamCount = kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
static_assert(
    kProductLeadRuntimeParamCount == KESSHO_PRODUCT_LEAD_OVERRIDE_PARAM_COUNT,
    "Lead override snapshot ABI count must match module Lead param count");
constexpr uint32_t kProductDrumRuntimeParamIdBase = 3000u;
constexpr uint32_t kProductDrumRuntimeParamCount = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
constexpr uint32_t kProductDrumMasterLevelParam = 122u;
constexpr uint32_t kProductDrumReverbSendParam = 123u;
constexpr uint32_t kMaxSoundscapeAssetRefs = 16;

inline bool productDrumRuntimeParamIndex(uint32_t param_id, uint32_t& param_index) {
  if (param_id < kProductDrumRuntimeParamIdBase ||
      param_id >= kProductDrumRuntimeParamIdBase + kProductDrumRuntimeParamCount) {
    return false;
  }
  param_index = param_id - kProductDrumRuntimeParamIdBase;
  return true;
}

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
constexpr uint32_t kPianoShortAssetIdBase = kPianoAssetIdBase + kPianoSampleCount;
constexpr double kSampleAttackSeconds = 0.004;
constexpr double kSampleReleaseSeconds = 0.02;
constexpr float kSourceToggleFadeSeconds = 0.05f;
constexpr float kSoundscapeSourceToggleFadeSeconds = 5.0f;
constexpr float kPianoEnvelopePostReleaseTailSeconds = 0.25f;
constexpr float kPianoSampleParityTrim = 0.66f;
constexpr double kLoopCrossfadeSeconds = 0.012;
constexpr uint32_t kSoundscapeRandomStartMinimumFrames = 64;
constexpr float kDiffuseHighpassHz = 180.0f;
constexpr float kDiffuseLowpassHz = 7200.0f;
constexpr float kDiffuseHaasDelayMs = 14.0f;
constexpr float kDiffuseHaasSideGain = 0.28f;
constexpr float kDiffuseHaasCenterGain = 0.78f;
constexpr float kDiffuseOutputGain = 0.22f;
constexpr float kDiffuseReverbSendGain = 0.18f;
constexpr uint32_t kDiffuseDelayMaxFrames = 9600u;
constexpr float kDiffuseIdleReleaseSeconds = 0.25f;
constexpr float kDiffuseIdleSleepPeak = 1.0e-7f;
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
constexpr uint32_t kSoundscapeAssetLevelRangeTargetBase = 0x51000000u;
constexpr uint32_t kSoundscapeAssetLevelRangeTargetEnd = kSoundscapeAssetLevelRangeTargetBase + 0x01000000u;
constexpr uint32_t kSoundscapeLayerOcean = 0u;
constexpr uint32_t kSoundscapeLayerWater = 1u;
constexpr uint32_t kSoundscapeLayerInsects = 2u;
constexpr uint32_t kSoundscapeLayerNature = 3u;
constexpr uint32_t kSoundscapeLayerCount = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_LAYER_COUNT;
constexpr uint32_t kSoundscapeLayerRouteReverb = 0u;
constexpr uint32_t kSoundscapeLayerRouteDelayA = 1u;
constexpr uint32_t kSoundscapeLayerRouteDelayB = 2u;
constexpr uint32_t kSoundscapeLayerRouteGranular = 3u;
constexpr uint32_t kSoundscapeLayerRouteStride = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_STRIDE;
constexpr uint32_t kSoundscapeLayerRouteParamCount = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT;
constexpr uint32_t kSoundscapeParityFixtureParam = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_PARITY_FIXTURE_PARAM;
constexpr uint32_t kSoundscapeParityParamCount = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_PARITY_PARAM_COUNT;
constexpr uint32_t kSoundscapeTextureParamStart = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_START;
constexpr uint32_t kSoundscapeTextureSlotOcean = 0u;
constexpr uint32_t kSoundscapeTextureSlotBirds = 1u;
constexpr uint32_t kSoundscapeTextureSlotBirds2 = 2u;
constexpr uint32_t kSoundscapeTextureSlotFrogs = 3u;
constexpr uint32_t kSoundscapeTextureSlotCount = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_SLOT_COUNT;
constexpr uint32_t kSoundscapeTextureParamStride = kessho::product::generated::KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_STRIDE;
constexpr uint32_t kSoundscapeTextureParamSliceDuration = 0u;
constexpr uint32_t kSoundscapeTextureParamDensity = 1u;
constexpr uint32_t kSoundscapeTextureParamFadeTime = 2u;
constexpr uint32_t kSoundscapeTextureParamSeedLo = 3u;
constexpr uint32_t kSoundscapeTextureParamSeedHi = 4u;
constexpr uint32_t kSoundscapeTextureParamCount = kessho::product::generated::KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_TEXTURE_PARAM_COUNT;
static_assert(
    kSoundscapeTextureParamCount == KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_COUNT,
    "Soundscape texture snapshot ABI count must match Product Core texture params");
constexpr uint32_t kSoundscapeTextureMinimumQueuedSlices = 4u;
constexpr double kSoundscapeTextureInitialDelaySeconds = 0.158;
constexpr double kSoundscapeTextureLookAheadSeconds = 0.5;
constexpr float kSoundscapeTexturePitchRangeCents = 200.0f;
constexpr float kSoundscapeTextureSpeedVariation = 0.2f;
constexpr uint32_t kSoundscapeTextureHaasDelayMaxFrames = 2400u;
constexpr uint32_t kSoundscapeModuleParamCount = kessho::product::generated::KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_MODULE_PARAM_COUNT;
constexpr uint32_t kSoundscapeModuleWaterActiveParam = 0u;
constexpr uint32_t kSoundscapeModuleWaterSeedParam = 60u;
constexpr uint32_t kSoundscapeModuleInsectsActiveParam = 61u;
constexpr uint32_t kSoundscapeModuleInsectsSeedParam = 77u;
constexpr uint32_t kSoundscapeModuleInsects2ActiveParam = 78u;
constexpr uint32_t kSoundscapeModuleInsects2SeedParam = 94u;
constexpr float kSoundscapeModuleSeedNoChange = -1.0f;
constexpr uint32_t kSoundscapeModuleWaterLevelParam = kSoundscapeModuleParamCount;
constexpr uint32_t kSoundscapeModuleInsectsLevelParam = kSoundscapeModuleWaterLevelParam + 1u;
constexpr uint32_t kSoundscapeModuleInsects2LevelParam = kSoundscapeModuleInsectsLevelParam + 1u;
constexpr uint32_t kSoundscapeModuleInsectsSharedLevelParam = kSoundscapeModuleInsects2LevelParam + 1u;
constexpr uint32_t kSoundscapeModuleEarthLevelParam = kSoundscapeModuleInsectsSharedLevelParam + 1u;
constexpr uint32_t kSoundscapeProductModuleParamCount = kessho::product::generated::KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT;
static_assert(
    kSoundscapeProductModuleParamCount == KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT,
    "Soundscape module snapshot ABI count must match Product Core module params");
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

} // namespace kessho::product::internal

#include "ProductDynamicsConstants.h"
