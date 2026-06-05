import { KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ, KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING, KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH, KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN, KESSHO_PRODUCT_DRUM_PARAM_COUNT, KESSHO_PRODUCT_DRUM_VOICE_COUNT, KESSHO_PRODUCT_LEAD_PARAM_COUNT, KESSHO_PRODUCT_PAD_PARAM_COUNT, KESSHO_PRODUCT_SCHEMA_HASH, KESSHO_PRODUCT_SCHEMA_VERSION } from './generated/kesshoProductSchema';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { granularVoiceModeId } from './CoreProductModeIds';
import { emptyLeadOverrideIndices, emptyLeadOverrideValues } from './CoreProductLeadPatch';
import { emptyPadOverrideIndices, emptyPadOverrideValues } from './CoreProductPadPatch';
import { emptyDrumOverrideIndices, emptyDrumOverrideValues } from './CoreProductDrumPatch';
import { defaultPresetId } from './CoreProductPresetIds';
import { SOUNDSCAPE_TEXTURE_PARAM_COUNT, SOUNDSCAPES_PRODUCT_PARAM_COUNT } from './coreProductSoundscapesSnapshot';
import type { CoreProductSnapshot } from './coreProductSnapshot';

type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];
type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];
type ProductGranularVoiceSnapshot = CoreProductSnapshot['fx']['granularVoices'][number];
type LegacyExactBridgeSource = ProductSourceSnapshot & {
  exactPadParamCount?: unknown;
  exactPadParams?: unknown;
  exactLeadParamCount?: unknown;
  exactLeadParams?: unknown;
  exactDrumParamCount?: unknown;
  exactDrumParams?: unknown;
};

const SOURCE_ORDER = [CORE_PRODUCT_SOURCE_IDS.pad1, CORE_PRODUCT_SOURCE_IDS.pad2, CORE_PRODUCT_SOURCE_IDS.lead1, CORE_PRODUCT_SOURCE_IDS.lead2, CORE_PRODUCT_SOURCE_IDS.drum, CORE_PRODUCT_SOURCE_IDS.piano, CORE_PRODUCT_SOURCE_IDS.soundscape] as const;

const SNAPSHOT_BYTES = 28600;
const SOURCE_BYTES = 3332;
const LANE_BYTES = 92;
const SEQUENCER_BYTES = 4 + 16 * LANE_BYTES;

function bool(value: unknown): number {
  return value ? 1 : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rejectLegacyExactBridge(label: string, source: ProductSourceSnapshot, countKey: keyof LegacyExactBridgeSource, paramsKey: keyof LegacyExactBridgeSource): 0 {
  const legacySource = source as LegacyExactBridgeSource;
  if (Object.prototype.hasOwnProperty.call(legacySource, countKey) || Object.prototype.hasOwnProperty.call(legacySource, paramsKey)) {
    throw new RangeError(`${label} exact patch fields are no longer accepted by web snapshot encoding`);
  }
  return 0;
}

function validateSparseOverride(label: string, enabled: boolean, count: number, indices: readonly number[], values: readonly number[], max: number): number {
  if (!Number.isInteger(count) || count < 0 || count > max || (!enabled && count !== 0)) {
    throw new RangeError(`${label} sparse override count is invalid: ${count}`);
  }
  for (let index = 0; index < count; index += 1) {
    const overrideIndex = indices[index];
    const overrideValue = values[index];
    if (!Number.isInteger(overrideIndex) || (overrideIndex ?? -1) < 0 || (overrideIndex ?? max) >= max) throw new RangeError(`${label} sparse override index is invalid at ${index}`);
    if (!Number.isFinite(overrideValue)) throw new RangeError(`${label} sparse override value is invalid at ${index}`);
  }
  return count >>> 0;
}

function sourceDefaults(sourceId: number): ProductSourceSnapshot {
  return {
    enabled: true,
    sourceId,
    presetId: defaultPresetId(sourceId),
    sourcePresetAId: 0, sourcePresetBId: 0, leadEnvelopeOverrideEnabled: false, leadAlgorithmPresetAEnabled: false,
    assetId: 0, level: 0.75, morph: 0, distance: 0, expression: 0.75,
    dryGain: 1, reverbSend: 0.12, delayASend: 0, delayBSend: 0, granularSend: 0, diffuseSend: 0,
    postLpfHz: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
    stereoWidth: KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
    postLpfKeyTracking: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
    leadVibratoDepth: 0, leadVibratoRate: 0, leadGlide: 0,
    attackSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS,
    decaySeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS,
    sustain: KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN,
    holdSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
    releaseSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS,
    padOverrideCount: 0, padOverrideIndices: emptyPadOverrideIndices(), padOverrideValues: emptyPadOverrideValues(),
    leadOverrideCount: 0, leadOverrideIndices: emptyLeadOverrideIndices(), leadOverrideValues: emptyLeadOverrideValues(),
    drumOverrideCount: 0, drumOverrideIndices: emptyDrumOverrideIndices(), drumOverrideValues: emptyDrumOverrideValues(),
    drumVoicePresetAIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoicePresetBIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoiceMorphs: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
  };
}

function laneDefaults(targetSourceId: number, midiNote: number): ProductLaneSnapshot {
  return {
    enabled: false, targetSourceId, stepCount: 16, fillCount: 4, rotation: 0, clockDivision: 16,
    swing: 0, probability: 1, ratchet: 1, trigCondition: 0, midiNote, velocity: 0.75,
    holdSeconds: 0.18, morph: 0, distance: 0, expression: 0.75, seed: 1,
    barReset: true, phraseReset: false, manualStepMaskLow: 0, manualStepMaskHigh: 0,
    tempoMultiplier: 1, initialStartDelaySeconds: -1,
  };
}

function granularVoiceDefaults(voiceNumber: number): ProductGranularVoiceSnapshot {
  return {
    enabled: voiceNumber === 1, mode: granularVoiceModeId(undefined), slice: clamp((voiceNumber - 1) * 4, 0, 15),
    speed: 1, scanRate: 1, reverse: false, pitch: 0, writeFollow: 0, density: 20,
    grainSizeMs: 80, spray: 0.3, grainOctaveProbability: 0, attackSeconds: 0.003, decaySeconds: 0.5,
    gain: 0.5, pan: 0, blur: 0, stereoSpread: 0.5, positionLfoRate: 0, positionLfoDepth: 0,
    panLfoRate: 0, reverseLfoRate: 0, recordLfoRate: 0, euclidGated: false, euclidMuted: false,
  };
}

// SNAPSHOT_AUTHORITY: PACK_GENERATED_SNAPSHOT_BYTES - byte packing only, no musical interpretation.
export function encodeCoreProductSnapshot(snapshot: CoreProductSnapshot): ArrayBuffer {
  const buffer = new ArrayBuffer(SNAPSHOT_BYTES);
  const view = new DataView(buffer);
  let offset = 0;
  const u32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };
  const i32 = (value: number) => {
    view.setInt32(offset, value | 0, true);
    offset += 4;
  };
  const f32 = (value: number) => {
    view.setFloat32(offset, Number.isFinite(value) ? value : 0, true);
    offset += 4;
  };

  u32(KESSHO_PRODUCT_SCHEMA_VERSION);
  u32(KESSHO_PRODUCT_SCHEMA_HASH);
  u32(bool(snapshot.transport.running));
  f32(snapshot.transport.bpm);
  u32(snapshot.transport.beatsPerBar);
  u32(snapshot.transport.barsPerPhrase);
  f32(snapshot.transport.swing);
  u32(0);
  f32(snapshot.harmony.rootMidi);
  u32(snapshot.harmony.scaleId);
  f32(snapshot.harmony.tension);
  u32(snapshot.harmony.chordMode);
  u32(snapshot.harmony.voicingMode);
  u32(snapshot.harmony.controlMode);
  u32(snapshot.harmony.controlStrength);
  u32(snapshot.harmony.activeSource);
  i32(snapshot.harmony.activeSlotId);
  i32(snapshot.harmony.activeStepIndex);
  u32(bool(snapshot.harmony.manualControlAvailable));
  u32(snapshot.harmony.notePoolCount);
  for (let index = 0; index < 8; index += 1) f32(snapshot.harmony.notePoolMidi[index] ?? 0);
  f32(snapshot.harmony.bassMidi);
  u32(snapshot.harmony.nextNotePoolCount);
  for (let index = 0; index < 8; index += 1) f32(snapshot.harmony.nextNotePoolMidi[index] ?? 0);
  u32(snapshot.harmony.nextSource);
  i32(snapshot.harmony.nextStepIndex);
  u32(0);

  for (let index = 0; index < 7; index += 1) {
    const source = snapshot.sources[index] ?? sourceDefaults(SOURCE_ORDER[index] ?? CORE_PRODUCT_SOURCE_IDS.pad1);
    const isPadSource = source.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 || source.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2;
    const isLeadSource = source.sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 || source.sourceId === CORE_PRODUCT_SOURCE_IDS.lead2;
    const isDrumSource = source.sourceId === CORE_PRODUCT_SOURCE_IDS.drum;
    const exactPadParamCount = rejectLegacyExactBridge('Pad', source, 'exactPadParamCount', 'exactPadParams');
    const padOverrideCount = validateSparseOverride('Pad', isPadSource, source.padOverrideCount, source.padOverrideIndices, source.padOverrideValues, KESSHO_PRODUCT_PAD_PARAM_COUNT);
    const exactLeadParamCount = rejectLegacyExactBridge('Lead', source, 'exactLeadParamCount', 'exactLeadParams');
    const leadOverrideCount = validateSparseOverride('Lead', isLeadSource, source.leadOverrideCount, source.leadOverrideIndices, source.leadOverrideValues, KESSHO_PRODUCT_LEAD_PARAM_COUNT);
    const exactDrumParamCount = rejectLegacyExactBridge('Drum', source, 'exactDrumParamCount', 'exactDrumParams');
    const drumOverrideCount = validateSparseOverride('Drum', isDrumSource, source.drumOverrideCount, source.drumOverrideIndices, source.drumOverrideValues, KESSHO_PRODUCT_DRUM_PARAM_COUNT);
    u32(bool(source.enabled));
    u32(source.sourceId);
    u32(source.presetId);
    u32(source.sourcePresetAId); u32(source.sourcePresetBId); u32(bool(source.leadEnvelopeOverrideEnabled)); u32(bool(source.leadAlgorithmPresetAEnabled));
    u32(source.assetId);
    f32(source.level);
    f32(source.morph);
    f32(source.distance);
    f32(source.expression);
    f32(source.dryGain);
    f32(source.reverbSend);
    f32(source.delayASend);
    f32(source.delayBSend);
    f32(source.granularSend);
    f32(source.diffuseSend);
    f32(source.postLpfHz);
    f32(source.stereoWidth);
    f32(source.postLpfKeyTracking);
    f32(source.leadVibratoDepth);
    f32(source.leadVibratoRate);
    f32(source.leadGlide);
    u32(exactPadParamCount);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_PAD_PARAM_COUNT; paramIndex += 1) f32(0);
    u32(padOverrideCount);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_PAD_PARAM_COUNT; paramIndex += 1) u32(paramIndex < padOverrideCount ? (source.padOverrideIndices[paramIndex] ?? 0) : 0);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_PAD_PARAM_COUNT; paramIndex += 1) f32(paramIndex < padOverrideCount ? (source.padOverrideValues[paramIndex] ?? 0) : 0);
    u32(exactLeadParamCount);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_LEAD_PARAM_COUNT; paramIndex += 1) f32(0);
    u32(leadOverrideCount);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_LEAD_PARAM_COUNT; paramIndex += 1) u32(paramIndex < leadOverrideCount ? (source.leadOverrideIndices[paramIndex] ?? 0) : 0);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_LEAD_PARAM_COUNT; paramIndex += 1) f32(paramIndex < leadOverrideCount ? (source.leadOverrideValues[paramIndex] ?? 0) : 0);
    u32(exactDrumParamCount);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_DRUM_PARAM_COUNT; paramIndex += 1) f32(0);
    u32(drumOverrideCount);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_DRUM_PARAM_COUNT; paramIndex += 1) u32(paramIndex < drumOverrideCount ? (source.drumOverrideIndices[paramIndex] ?? 0) : 0);
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_DRUM_PARAM_COUNT; paramIndex += 1) f32(paramIndex < drumOverrideCount ? (source.drumOverrideValues[paramIndex] ?? 0) : 0);
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) u32(source.drumVoicePresetAIds[voiceIndex] ?? 0);
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) u32(source.drumVoicePresetBIds[voiceIndex] ?? 0);
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) f32(clamp(source.drumVoiceMorphs[voiceIndex] ?? 0, 0, 1));
    f32(source.attackSeconds);
    f32(source.decaySeconds);
    f32(source.sustain);
    f32(source.holdSeconds);
    f32(source.releaseSeconds);
  }

  const writeSequencer = (lanes: ProductLaneSnapshot[]) => {
    const start = offset;
    u32(Math.min(lanes.length, 16));
    for (let index = 0; index < 16; index += 1) {
      const lane = lanes[index] ?? laneDefaults(CORE_PRODUCT_SOURCE_IDS.pad1, 60);
      u32(bool(lane.enabled));
      u32(lane.targetSourceId);
      u32(lane.stepCount);
      u32(lane.fillCount);
      i32(lane.rotation);
      u32(lane.clockDivision);
      f32(lane.swing);
      f32(lane.probability);
      u32(lane.ratchet);
      u32(lane.trigCondition);
      f32(lane.midiNote);
      f32(lane.velocity);
      f32(lane.holdSeconds);
      f32(lane.morph);
      f32(lane.distance);
      f32(lane.expression);
      u32(lane.seed);
      u32(bool(lane.barReset));
      u32(bool(lane.phraseReset));
      u32(lane.manualStepMaskLow);
      u32(lane.manualStepMaskHigh);
      f32(lane.tempoMultiplier);
      f32(lane.initialStartDelaySeconds);
    }
    offset = start + SEQUENCER_BYTES;
  };

  writeSequencer(snapshot.synthLanes);
  writeSequencer(snapshot.drumLanes);
  u32(bool(snapshot.journey.enabled));
  f32(snapshot.journey.morphPhase);
  f32(snapshot.journey.morphRateBars);
  u32(0);
  f32(snapshot.fx.granularMix);
  u32(bool(snapshot.fx.granularEnabled));
  u32(bool(snapshot.fx.granularFreeze));
  u32(bool(snapshot.fx.granularFreezeWithFeedback));
  f32(snapshot.fx.granularFeedback);
  f32(snapshot.fx.granularFeedbackLpfHz);
  f32(snapshot.fx.granularReverbLpfHz);
  f32(snapshot.fx.granularOutputLpfHz);
  f32(snapshot.fx.granularBufferSeconds);
  u32(snapshot.fx.granularGrainShape >>> 0);
  f32(snapshot.fx.granularBusDiffusion);
  f32(snapshot.fx.granularTimingRandomness);
  f32(snapshot.fx.granularChordBias);
  f32(snapshot.fx.granularLegacyJitterMs);
  f32(snapshot.fx.granularLegacyProbability);
  u32(snapshot.fx.granularLegacyPitchMode >>> 0);
  f32(snapshot.fx.granularLegacyPitchSpread);
  u32(snapshot.fx.granularLegacyMaxGrains >>> 0);
  f32(snapshot.fx.granularLegacyFeedback);
  for (let index = 0; index < 4; index += 1) {
    const voice = snapshot.fx.granularVoices[index] ?? granularVoiceDefaults(index + 1);
    u32(bool(voice.enabled));
    u32(voice.mode >>> 0);
    u32(voice.slice >>> 0);
    f32(voice.speed);
    f32(voice.scanRate);
    u32(bool(voice.reverse));
    f32(voice.pitch);
    f32(voice.writeFollow);
    f32(voice.density);
    f32(voice.grainSizeMs);
    f32(voice.spray);
    f32(voice.grainOctaveProbability);
    f32(voice.attackSeconds);
    f32(voice.decaySeconds);
    f32(voice.gain);
    f32(voice.pan);
    f32(voice.blur);
    f32(voice.stereoSpread);
    f32(voice.positionLfoRate);
    f32(voice.positionLfoDepth);
    f32(voice.panLfoRate);
    f32(voice.reverseLfoRate);
    f32(voice.recordLfoRate);
    u32(bool(voice.euclidGated));
    u32(bool(voice.euclidMuted));
  }
  u32(bool(snapshot.fx.delayAEnabled));
  f32(snapshot.fx.delayATimeLeftMs);
  f32(snapshot.fx.delayATimeRightMs);
  f32(snapshot.fx.delayAFeedback);
  f32(snapshot.fx.delayAMix);
  f32(snapshot.fx.delayAFilterHz);
  u32(snapshot.fx.delayAFilterType >>> 0);
  f32(snapshot.fx.delayAModRateHz);
  f32(snapshot.fx.delayAModDepthMs);
  u32(bool(snapshot.fx.delayAPingPong));
  f32(snapshot.fx.delayADuck);
  f32(snapshot.fx.delayAWidth);
  f32(snapshot.fx.delayACrossFeedFilterHz);
  u32(bool(snapshot.fx.delayBEnabled));
  f32(snapshot.fx.delayBActivity);
  f32(snapshot.fx.delayBRepeats);
  f32(snapshot.fx.delayBBaseTimeMs);
  f32(snapshot.fx.delayBTone);
  f32(snapshot.fx.delayBVibrato);
  f32(snapshot.fx.delayBMix);
  u32(snapshot.fx.delayBSpaceMode >>> 0);
  u32(snapshot.fx.delayBPattern >>> 0);
  u32(snapshot.fx.delayBWarp >>> 0);
  f32(snapshot.fx.delayBWarpIntensity);
  f32(snapshot.fx.delayBSpread);
  u32(snapshot.fx.delayBTapeHeadMask >>> 0);
  for (let index = 0; index < 4; index += 1) {
    f32(snapshot.fx.delayBTapeHeadLevels[index] ?? [0.72, 0.8, 0.88, 1][index] ?? 1);
  }
  for (let index = 0; index < 4; index += 1) {
    f32(snapshot.fx.delayBTapeHeadPans[index] ?? [0.28, 0.72, 0.38, 0.62][index] ?? 0.5);
  }
  f32(snapshot.fx.reverbMix);
  u32(snapshot.fx.reverbType >>> 0);
  u32(snapshot.fx.reverbQuality >>> 0);
  f32(snapshot.fx.reverbDecay);
  f32(snapshot.fx.reverbSize);
  f32(snapshot.fx.reverbDamping);
  f32(snapshot.fx.reverbDiffusion);
  f32(snapshot.fx.reverbModulation);
  f32(snapshot.fx.reverbPredelayMs);
  f32(snapshot.fx.reverbWidth);
  f32(snapshot.fx.reverbShimmerAmount);
  f32(snapshot.fx.reverbShimmerPitch);
  f32(snapshot.fx.reverbSlowRateHz);
  f32(snapshot.fx.reverbSlowDepth);
  f32(snapshot.fx.reverbReverseAmount);
  f32(snapshot.fx.reverbReverseLengthSec);
  f32(snapshot.fx.reverbChorusRateHz);
  f32(snapshot.fx.reverbChorusDepth);
  u32(snapshot.fx.reverbModCharacter >>> 0);
  f32(snapshot.fx.reverbDampLow);
  f32(snapshot.fx.reverbDampHigh);
  f32(snapshot.fx.reverbCrossoverHz);
  f32(snapshot.fx.reverbInputTone);
  f32(snapshot.fx.reverbShimmerFeedback);
  f32(snapshot.fx.reverbBloom);
  f32(snapshot.fx.reverbWarp);
  f32(snapshot.fx.reverbCrossFeed);
  f32(snapshot.fx.reverbEarlyReflections);
  f32(snapshot.fx.reverbAirAbsorption);
  u32(snapshot.fx.reverbSaturationMode >>> 0);
  f32(snapshot.fx.reverbTransientSmooth);
  f32(snapshot.fx.reverbErLpFreq);
  f32(snapshot.fx.reverbPreCompThreshold);
  f32(snapshot.fx.reverbPreCompKnee);
  f32(snapshot.fx.reverbPreCompRatio);
  f32(snapshot.fx.reverbPreCompAttackMs);
  f32(snapshot.fx.reverbPreCompReleaseMs);
  f32(snapshot.fx.reverbPreCompMakeup);
  u32(bool(snapshot.fx.reverbChordWash));
  u32(bool(snapshot.fx.reverbResolutionBloom));
  f32(snapshot.fx.spectralFreezeMix);
  u32(bool(snapshot.fx.spectralFreezeEnabled));
  u32(bool(snapshot.fx.spectralFreezeActive));
  u32(bool(snapshot.fx.spectralFreezeSlushy));
  f32(snapshot.fx.spectralFreezeSpeed);
  f32(snapshot.fx.spectralFreezeDecay);
  f32(snapshot.fx.spectralFreezePhaseJitter);
  u32(snapshot.fx.spectralFreezeRouting >>> 0);
  f32(snapshot.fx.spectralFreezeReverbCrossfade);
  f32(snapshot.fx.dynamicsDrive);
  u32(bool(snapshot.fx.dynamicsEnabled));
  u32(bool(snapshot.fx.dynamicsCharacterEnabled));
  u32(snapshot.fx.dynamicsCharacterMode >>> 0);
  u32(snapshot.fx.dynamicsCharacterQuality >>> 0);
  f32(snapshot.fx.dynamicsCharacterAntiComb);
  f32(snapshot.fx.dynamicsCharacterDiffusion);
  f32(snapshot.fx.dynamicsCharacterMix);
  f32(snapshot.fx.dynamicsCharacterAge);
  f32(snapshot.fx.dynamicsCharacterBias);
  f32(snapshot.fx.dynamicsCharacterLpgAmount);
  f32(snapshot.fx.dynamicsCharacterResonance);
  f32(snapshot.fx.dynamicsCharacterStereo);
  f32(snapshot.fx.dynamicsCharacterEnvFollow);
  f32(snapshot.fx.dynamicsCharacterDepth);
  f32(snapshot.fx.dynamicsCharacterRate);
  f32(snapshot.fx.dynamicsCharacterDamp);
  u32(bool(snapshot.fx.dynamicsDegradeEnabled));
  u32(snapshot.fx.dynamicsDegradeQuality >>> 0);
  f32(snapshot.fx.dynamicsDegradeEventAmount);
  f32(snapshot.fx.dynamicsDegradeProfileAmount);
  f32(snapshot.fx.dynamicsDegradeDitherAmount);
  f32(snapshot.fx.dynamicsDegradeMix);
  f32(snapshot.fx.dynamicsDegradeAge);
  f32(snapshot.fx.dynamicsDegradeGeneration);
  f32(snapshot.fx.dynamicsDegradeAlias);
  f32(snapshot.fx.dynamicsDegradeWow);
  f32(snapshot.fx.dynamicsDegradeFlutter);
  f32(snapshot.fx.dynamicsDegradeDrift);
  f32(snapshot.fx.dynamicsDegradeWobbleSpeed);
  f32(snapshot.fx.dynamicsDegradeTone);
  f32(snapshot.fx.dynamicsDegradeHp);
  f32(snapshot.fx.dynamicsDegradeLp);
  f32(snapshot.fx.dynamicsDegradeNoise);
  f32(snapshot.fx.dynamicsDegradeSaturation);
  f32(snapshot.fx.dynamicsDegradeCorrosion);
  f32(snapshot.fx.dynamicsModSlowWow);
  f32(snapshot.fx.dynamicsModSlowFlutter);
  f32(snapshot.fx.dynamicsModSlowLp);
  f32(snapshot.fx.dynamicsModSlowWet);
  f32(snapshot.fx.dynamicsModSlowDropout);
  f32(snapshot.fx.dynamicsModSlowAlias);
  f32(snapshot.fx.dynamicsModFlutterWow);
  f32(snapshot.fx.dynamicsModFlutterFlutter);
  f32(snapshot.fx.dynamicsModFlutterLp);
  f32(snapshot.fx.dynamicsModFlutterWet);
  f32(snapshot.fx.dynamicsModFlutterDropout);
  f32(snapshot.fx.dynamicsModFlutterAlias);
  f32(snapshot.fx.dynamicsModRandomWow);
  f32(snapshot.fx.dynamicsModRandomFlutter);
  f32(snapshot.fx.dynamicsModRandomLp);
  f32(snapshot.fx.dynamicsModRandomWet);
  f32(snapshot.fx.dynamicsModRandomDropout);
  f32(snapshot.fx.dynamicsModRandomAlias);
  f32(snapshot.fx.dynamicsModEnvWow);
  f32(snapshot.fx.dynamicsModEnvFlutter);
  f32(snapshot.fx.dynamicsModEnvLp);
  f32(snapshot.fx.dynamicsModEnvWet);
  f32(snapshot.fx.dynamicsModEnvDropout);
  f32(snapshot.fx.dynamicsModEnvAlias);
  f32(snapshot.fx.dynamicsModNoiseWow);
  f32(snapshot.fx.dynamicsModNoiseFlutter);
  f32(snapshot.fx.dynamicsModNoiseLp);
  f32(snapshot.fx.dynamicsModNoiseWet);
  f32(snapshot.fx.dynamicsModNoiseDropout);
  f32(snapshot.fx.dynamicsModNoiseAlias);
  u32(bool(snapshot.fx.dynamicsSaturationEnabled));
  u32(snapshot.fx.dynamicsSaturationMode >>> 0);
  u32(snapshot.fx.dynamicsSaturationQuality >>> 0);
  f32(snapshot.fx.dynamicsSaturationDrive);
  f32(snapshot.fx.dynamicsSaturationTone);
  f32(snapshot.fx.dynamicsSaturationBias);
  u32(bool(snapshot.fx.dynamicsEndCompEnabled));
  u32(snapshot.fx.dynamicsEndCompMode >>> 0);
  f32(snapshot.fx.dynamicsEndCompThreshold);
  f32(snapshot.fx.dynamicsEndCompKnee);
  f32(snapshot.fx.dynamicsEndCompRatio);
  f32(snapshot.fx.dynamicsEndCompAttackMs);
  f32(snapshot.fx.dynamicsEndCompReleaseMs);
  f32(snapshot.fx.dynamicsEndCompMakeup);
  f32(snapshot.fx.dynamicsEndCompMix);
  f32(snapshot.fx.dynamicsEndCompDetectorHp);
  f32(snapshot.fx.dynamicsEndCompDetectorTilt);
  f32(snapshot.fx.dynamicsEndCompAutoMakeup);
  f32(snapshot.fx.dynamicsEndCompProgramRelease);
  f32(snapshot.fx.dynamicsEndCompPeakBlend);
  f32(snapshot.fx.dynamicsEndCompClarity);
  f32(snapshot.fx.dynamicsEndCompTwoBandAmount);
  f32(snapshot.fx.dynamicsEndCompBandSplit);
  u32(bool(snapshot.fx.sidechainEnabled));
  u32(snapshot.fx.sidechainKeyA >>> 0);
  u32(snapshot.fx.sidechainKeyB >>> 0);
  f32(snapshot.fx.sidechainKeyAWeight);
  f32(snapshot.fx.sidechainKeyBWeight);
  f32(snapshot.fx.sidechainAmount);
  f32(snapshot.fx.sidechainThreshold);
  f32(snapshot.fx.sidechainRatio);
  f32(snapshot.fx.sidechainKnee);
  f32(snapshot.fx.sidechainAttackMs);
  f32(snapshot.fx.sidechainHoldMs);
  f32(snapshot.fx.sidechainReleaseMs);
  f32(snapshot.fx.sidechainMakeup);
  f32(snapshot.fx.sidechainMix);
  f32(snapshot.fx.sidechainCurve);
  f32(snapshot.fx.sidechainDetectorHp);
  f32(snapshot.fx.sidechainDetectorLp);
  f32(snapshot.fx.sidechainPad1Target);
  f32(snapshot.fx.sidechainPad2Target);
  f32(snapshot.fx.sidechainLead1Target);
  f32(snapshot.fx.sidechainLead2Target);
  f32(snapshot.fx.sidechainPianoTarget);
  f32(snapshot.fx.sidechainGranularTarget);
  f32(snapshot.fx.sidechainDelayATarget);
  f32(snapshot.fx.sidechainDelayBTarget);
  f32(snapshot.fx.sidechainReverbTarget);
  f32(snapshot.routing.delayAToDelayB);
  f32(snapshot.routing.delayBToDelayA);
  f32(snapshot.routing.delayToReverb);
  f32(snapshot.routing.granularToReverb);
  f32(snapshot.routing.delayAToGranular);
  f32(snapshot.routing.delayBToGranular);
  f32(snapshot.routing.delayBToReverb);
  f32(snapshot.routing.granularToDelayA);
  f32(snapshot.routing.granularToDelayB);
  f32(snapshot.master.gain);
  f32(snapshot.master.limiterCeilingDb);
  u32(snapshot.rng.seed);
  u32(snapshot.rng.state);
  f32(snapshot.evolution.amount);
  u32(snapshot.evolution.state);
  for (let i = 0; i < 32; i += 1) u32(snapshot.assetRefs[i] ?? 0);
  for (let i = 0; i < 32; i += 1) f32(clamp(snapshot.assetRefLevels[i] ?? 0, 0, 2));
  const soundscape = snapshot.soundscape ?? { textureParamCount: 0, textureParams: [], moduleParamCount: 0, moduleParams: [] };
  u32(Math.min(soundscape.textureParamCount, SOUNDSCAPE_TEXTURE_PARAM_COUNT));
  for (let paramIndex = 0; paramIndex < SOUNDSCAPE_TEXTURE_PARAM_COUNT; paramIndex += 1) f32(soundscape.textureParams[paramIndex] ?? 0);
  u32(Math.min(soundscape.moduleParamCount, SOUNDSCAPES_PRODUCT_PARAM_COUNT));
  for (let paramIndex = 0; paramIndex < SOUNDSCAPES_PRODUCT_PARAM_COUNT; paramIndex += 1) f32(soundscape.moduleParams[paramIndex] ?? 0);

  if (offset !== SNAPSHOT_BYTES) {
    throw new Error(`Kessho Product snapshot encoder wrote ${offset} bytes; expected ${SNAPSHOT_BYTES}`);
  }
  return buffer;
}

export { SNAPSHOT_BYTES as KESSHO_PRODUCT_SNAPSHOT_BYTES, SOURCE_BYTES as KESSHO_PRODUCT_SOURCE_SNAPSHOT_BYTES };
