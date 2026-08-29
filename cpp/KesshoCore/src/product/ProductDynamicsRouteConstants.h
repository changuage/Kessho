#pragma once

#include <cstdint>

namespace kessho::product::internal {

enum DynamicsTerminalBus : uint32_t {
  kDynamicsBusSkip = 0,
  kDynamicsBusEq1 = 1,
  kDynamicsBusEq2 = 2,
  kDynamicsBusSidechain = 3,
};

enum DynamicsRouteIndex : uint32_t {
  kDynamicsRoutePad1 = 0,
  kDynamicsRoutePad2 = 1,
  kDynamicsRouteLead1 = 2,
  kDynamicsRouteLead2 = 3,
  kDynamicsRoutePiano = 4,
  kDynamicsRouteDrum = 5,
  kDynamicsRouteGranular = 6,
  kDynamicsRouteWaves = 7,
  kDynamicsRouteWater = 8,
  kDynamicsRouteInsects = 9,
  kDynamicsRouteNature = 10,
  kDynamicsRouteDelayA = 11,
  kDynamicsRouteDelayB = 12,
  kDynamicsRouteDegrade = 13,
  kDynamicsRouteReverb = 14,
  kDynamicsRouteCount = 15,
};

enum DynamicsEqEdgeType : uint32_t {
  kDynamicsEqEdgeShelf = 0,
  kDynamicsEqEdgeBell = 1,
  kDynamicsEqEdgeHighPass = 2,
  kDynamicsEqEdgeLowPass = 3,
};

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
