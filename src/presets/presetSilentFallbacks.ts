export function sourceSlotFallbackOverrides(slot: string): Record<string, unknown> {
  switch (slot) {
    case 'synth':
      return {
        synthLevel: 0,
        pad2Level: 0,
        leadLevel: 0,
        lead1Level: 0,
        lead2Level: 0,
        pianoLevel: 0,
        leadEnabled: false,
        leadRandomEnabled: false,
        pianoEnabled: false,
        synthEuclideanMasterEnabled: false,
        padEnabled: false,
        pad2Enabled: false,
        lead2Enabled: false,
      };
    case 'drums':
      return {
        drumLevel: 0,
        drumEnabled: false,
        drumDelayEnabled: false,
        drumEuclidMasterEnabled: false,
      };
    case 'granular':
      return {
        granularLevel: 0,
        granularEnabled: false,
        granularFreeze: false,
        granularV1Enabled: false,
        granularV2Enabled: false,
        granularV3Enabled: false,
        granularV4Enabled: false,
      };
    case 'delay':
      return {
        delayAEnabled: false,
        delayAMix: 0,
        delayAFeedback: 0,
        drumDelayEnabled: false,
        drumDelayMix: 0,
        drumDelayFeedback: 0,
        granularDelayEnabled: false,
        granularDelayMix: 0,
        granularDelayRepeats: 0,
      };
    case 'reverb':
      return {
        reverbLevel: 0,
        reverbEnabled: false,
        spectralFreezeEnabled: false,
        spectralFreezeActive: false,
        spectralFreezeMix: 0,
      };
    case 'dynamicsBus':
      return {
        dynamicsBusEnabled: false,
        dynamicsEq1Enabled: false,
        dynamicsEq2Enabled: false,
        sidechainEnabled: false,
        sidechainMix: 0,
        sidechainAmount: 0,
      };
    case 'degrade':
      return {
        degradeEnabled: false,
        driftEnabled: false,
        driftMix: 0,
        erosionEnabled: false,
        erosionMix: 0,
      };
    case 'masterFx':
      return {
        masterSaturationEnabled: false,
        masterSaturationDrive: 0,
        endCompEnabled: false,
        endCompMix: 0,
      };
    case 'sidechain':
      return { sidechainMix: 0, sidechainAmount: 0 };
    case 'saturation':
      return { drive: 0 };
    case 'endChain':
      return { endCompMix: 0 };
    case 'earth':
      return {
        earthLevel: 0,
        natureLevel: 0,
        waterLevel: 0,
        insectsLevel: 0,
        insectsSharedLevel: 0,
        insects2Level: 0,
        oceanSampleLevel: 0,
        birdsLevel: 0,
        birds2Level: 0,
        frogsLevel: 0,
        waterEnabled: false,
        insectsEnabled: false,
        insects2Enabled: false,
        oceanSampleEnabled: false,
        birdsEnabled: false,
        birds2Enabled: false,
        frogsEnabled: false,
      };
    default:
      return {};
  }
}
