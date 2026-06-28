import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { granularVoiceModeId } from './CoreProductModeIds';
import { emptyDrumOverrideIndices, emptyDrumOverrideValues } from './CoreProductDrumPatch';
import { emptyLeadOverrideIndices, emptyLeadOverrideValues } from './CoreProductLeadPatch';
import { emptyPadOverrideIndices, emptyPadOverrideValues } from './CoreProductPadPatch';
import { defaultPresetId } from './CoreProductPresetIds';
import { anchorWalkerDefaults, orbitSequencerDefaults } from './coreProductSequencerFaceDefaults';
import {
  KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
  KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
  KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN,
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
} from './generated/kesshoProductSchema';
import type {
  ProductGranularVoiceSnapshot,
  ProductLaneSnapshot,
  ProductSourceSnapshot,
} from './coreProductSnapshotTypes';

export { anchorWalkerDefaults, orbitSequencerDefaults } from './coreProductSequencerFaceDefaults';

export const SOURCE_ORDER = [
  CORE_PRODUCT_SOURCE_IDS.pad1,
  CORE_PRODUCT_SOURCE_IDS.pad2,
  CORE_PRODUCT_SOURCE_IDS.lead1,
  CORE_PRODUCT_SOURCE_IDS.lead2,
  CORE_PRODUCT_SOURCE_IDS.drum,
  CORE_PRODUCT_SOURCE_IDS.sample1,
  CORE_PRODUCT_SOURCE_IDS.soundscape,
  CORE_PRODUCT_SOURCE_IDS.sample2,
] as const;

export function sourceDefaults(sourceId: number): ProductSourceSnapshot {
  return {
    enabled: true,
    sourceId,
    presetId: defaultPresetId(sourceId),
    sourcePresetAId: 0, sourcePresetBId: 0, leadEnvelopeOverrideEnabled: false, leadAlgorithmPresetAEnabled: false,
    assetId: 0, level: 0.75, morph: 0, distance: 0, expression: 0.75,
    dryGain: 1, reverbSend: 0.12, delayASend: 0, delayBSend: 0, granularSend: 0, degradeSend: 0, diffuseSend: 0,
    postLpfHz: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
    stereoWidth: KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
    postLpfKeyTracking: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
    leadVibratoDepth: 0, leadVibratoRate: 0, leadGlide: 0,
    attackSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS,
    decaySeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS,
    sustain: KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN,
    holdSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
    releaseSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS,
    sampleLibraryId: 1,
    sampleRoleId: 0,
    sampleArticulationId: 0,
    sampleSelectionMode: 0,
    sampleDynamicMode: 2,
    sampleFixedDynamicId: 13,
    sampleLoopEnabled: true,
    sampleMaxVoices: 16,
    sampleVariantMode: 0,
    sampleReserved0: 0,
    padOverrideCount: 0, padOverrideIndices: emptyPadOverrideIndices(), padOverrideValues: emptyPadOverrideValues(),
    leadOverrideCount: 0, leadOverrideIndices: emptyLeadOverrideIndices(), leadOverrideValues: emptyLeadOverrideValues(),
    drumOverrideCount: 0, drumOverrideIndices: emptyDrumOverrideIndices(), drumOverrideValues: emptyDrumOverrideValues(),
    drumVoicePresetAIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoicePresetBIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoiceMorphs: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
  };
}

export function laneDefaults(targetSourceId: number, midiNote: number): ProductLaneSnapshot {
  return {
    enabled: false, sequencerMode: 0, targetSourceId, stepCount: 16, fillCount: 4, rotation: 0, clockDivision: 16,
    swing: 0, probability: 1, ratchet: 1, trigCondition: 0, midiNote, velocity: 0.75,
    holdSeconds: 0.18, morph: 0, distance: 0, expression: 0.75, seed: 1,
    barReset: true, phraseReset: false, manualStepMaskLow: 0, manualStepMaskHigh: 0,
    tempoMultiplier: 1, initialStartDelaySeconds: -1,
    anchorWalker: anchorWalkerDefaults(),
    orbit: orbitSequencerDefaults(),
  };
}

export function granularVoiceDefaults(voiceNumber: number): ProductGranularVoiceSnapshot {
  return {
    enabled: voiceNumber === 1, mode: granularVoiceModeId(undefined), slice: Math.max(0, Math.min(15, (voiceNumber - 1) * 4)),
    speed: 1, scanRate: 1, reverse: false, pitch: 0, writeFollow: 0, density: 20,
    grainSizeMs: 80, spray: 0.3, positionSpray: 0.3, timingSpray: 0, lookback: 0.35, writeGuard: 0.3,
    pitchMode: 0, pitchSpread: 0, pitchJitterCents: 4, pitchQuantize: 1, reverseChance: 0,
    bloom: 0, glide: 0, cloudStyle: 0, anchorPattern: 0, loopCrossfadeMs: 12,
    grainOctaveProbability: 0, attackSeconds: 0.003, decaySeconds: 0.5,
    gain: 0.5, pan: 0, blur: 0, stereoSpread: 0.5, positionLfoRate: 0, positionLfoDepth: 0,
    panLfoRate: 0, reverseLfoRate: 0, recordLfoRate: 0, euclidGated: false, euclidMuted: false,
  };
}
