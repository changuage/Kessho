import {
  KESSHO_PRODUCT_SCHEMA_HASH,
  KESSHO_PRODUCT_SCHEMA_VERSION,
  KESSHO_PRODUCT_PAD_PARAM_COUNT,
  KESSHO_PRODUCT_LEAD_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
  KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
  KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
} from './generated/kesshoProductSchema';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import {
  defaultPresetId,
  emptyLeadParams,
  emptyPadParams,
  exactDrumParamsFromState,
  granularVoiceModeId,
} from './CoreProductLegacyPresetCompat';
import type { CoreProductSnapshot } from './coreProductSnapshot';

type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];
type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];
type ProductGranularVoiceSnapshot = CoreProductSnapshot['fx']['granularVoices'][number];

const SOURCE_ORDER = [
  CORE_PRODUCT_SOURCE_IDS.pad1,
  CORE_PRODUCT_SOURCE_IDS.pad2,
  CORE_PRODUCT_SOURCE_IDS.lead1,
  CORE_PRODUCT_SOURCE_IDS.lead2,
  CORE_PRODUCT_SOURCE_IDS.drum,
  CORE_PRODUCT_SOURCE_IDS.piano,
  CORE_PRODUCT_SOURCE_IDS.soundscape,
] as const;

const SNAPSHOT_BYTES = 12644;
const SOURCE_BYTES = 1200;
const LANE_BYTES = 84;
const SEQUENCER_BYTES = 4 + 16 * LANE_BYTES;

function bool(value: unknown): number {
  return value ? 1 : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sourceDefaults(sourceId: number): ProductSourceSnapshot {
  return {
    enabled: true,
    sourceId,
    presetId: defaultPresetId(sourceId),
    assetId: 0,
    level: 0.75,
    morph: 0,
    distance: 0,
    expression: 0.75,
    dryGain: 1,
    reverbSend: 0.12,
    delayASend: 0,
    delayBSend: 0,
    granularSend: 0,
    postLpfHz: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
    stereoWidth: KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
    postLpfKeyTracking: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
    holdSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
    exactPadParamCount: 0,
    exactPadParams: emptyPadParams(),
    exactLeadParamCount: 0,
    exactLeadParams: emptyLeadParams(),
    exactDrumParamCount: 0,
    exactDrumParams: exactDrumParamsFromState(),
    drumVoicePresetAIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoicePresetBIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoiceMorphs: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
  };
}

function laneDefaults(targetSourceId: number, midiNote: number): ProductLaneSnapshot {
  return {
    enabled: false,
    targetSourceId,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    swing: 0,
    probability: 1,
    ratchet: 1,
    trigCondition: 0,
    midiNote,
    velocity: 0.75,
    holdSeconds: 0.18,
    morph: 0,
    distance: 0,
    expression: 0.75,
    seed: 1,
    barReset: true,
    phraseReset: false,
    manualStepMaskLow: 0,
    manualStepMaskHigh: 0,
  };
}

function granularVoiceDefaults(voiceNumber: number): ProductGranularVoiceSnapshot {
  return {
    enabled: voiceNumber === 1,
    mode: granularVoiceModeId(undefined),
    slice: clamp((voiceNumber - 1) * 4, 0, 15),
    speed: 1,
    scanRate: 1,
    reverse: false,
    pitch: 0,
    writeFollow: 0,
    density: 20,
    grainSizeMs: 80,
    spray: 0.3,
    grainOctaveProbability: 0,
    attackSeconds: 0.003,
    decaySeconds: 0.5,
    gain: 0.5,
    pan: 0,
    blur: 0,
    stereoSpread: 0.5,
    positionLfoRate: 0,
    positionLfoDepth: 0,
    panLfoRate: 0,
    reverseLfoRate: 0,
    recordLfoRate: 0,
    euclidGated: false,
    euclidMuted: false,
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
  u32(0);

  for (let index = 0; index < 7; index += 1) {
    const source = snapshot.sources[index] ?? sourceDefaults(SOURCE_ORDER[index] ?? CORE_PRODUCT_SOURCE_IDS.pad1);
    u32(bool(source.enabled));
    u32(source.sourceId);
    u32(source.presetId);
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
    f32(source.postLpfHz);
    f32(source.stereoWidth);
    f32(source.postLpfKeyTracking);
    u32(Math.min(source.exactPadParamCount, KESSHO_PRODUCT_PAD_PARAM_COUNT));
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_PAD_PARAM_COUNT; paramIndex += 1) {
      f32(source.exactPadParams[paramIndex] ?? 0);
    }
    u32(Math.min(source.exactLeadParamCount, KESSHO_PRODUCT_LEAD_PARAM_COUNT));
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_LEAD_PARAM_COUNT; paramIndex += 1) {
      f32(source.exactLeadParams[paramIndex] ?? 0);
    }
    u32(Math.min(source.exactDrumParamCount, KESSHO_PRODUCT_DRUM_PARAM_COUNT));
    for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_DRUM_PARAM_COUNT; paramIndex += 1) {
      f32(source.exactDrumParams[paramIndex] ?? 0);
    }
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) {
      u32(source.drumVoicePresetAIds[voiceIndex] ?? 0);
    }
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) {
      u32(source.drumVoicePresetBIds[voiceIndex] ?? 0);
    }
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) {
      f32(clamp(source.drumVoiceMorphs[voiceIndex] ?? 0, 0, 1));
    }
    f32(source.holdSeconds);
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
  f32(snapshot.fx.spectralFreezeMix);
  u32(bool(snapshot.fx.spectralFreezeEnabled));
  u32(bool(snapshot.fx.spectralFreezeActive));
  u32(bool(snapshot.fx.spectralFreezeSlushy));
  f32(snapshot.fx.spectralFreezeSpeed);
  f32(snapshot.fx.spectralFreezeDecay);
  f32(snapshot.fx.spectralFreezePhaseJitter);
  f32(snapshot.fx.dynamicsDrive);
  u32(bool(snapshot.fx.dynamicsEnabled));
  u32(bool(snapshot.fx.dynamicsCharacterEnabled));
  u32(snapshot.fx.dynamicsCharacterMode >>> 0);
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
  f32(snapshot.fx.dynamicsSaturationDrive);
  f32(snapshot.fx.dynamicsSaturationTone);
  f32(snapshot.fx.dynamicsSaturationBias);
  u32(bool(snapshot.fx.dynamicsEndCompEnabled));
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
  f32(0);
  f32(snapshot.master.gain);
  f32(snapshot.master.limiterCeilingDb);
  u32(snapshot.master.saturationMode);
  f32(snapshot.master.saturationDrive);
  f32(snapshot.master.saturationTone);
  u32(snapshot.rng.seed);
  u32(snapshot.rng.state);
  f32(snapshot.evolution.amount);
  u32(snapshot.evolution.state);
  for (let i = 0; i < 32; i += 1) u32(snapshot.assetRefs[i] ?? 0);
  for (let i = 0; i < 32; i += 1) f32(clamp(snapshot.assetRefLevels[i] ?? 0, 0, 2));

  if (offset !== SNAPSHOT_BYTES) {
    throw new Error(`Kessho Product snapshot encoder wrote ${offset} bytes; expected ${SNAPSHOT_BYTES}`);
  }
  return buffer;
}

export const KESSHO_PRODUCT_SNAPSHOT_BYTES = SNAPSHOT_BYTES;
export const KESSHO_PRODUCT_SOURCE_SNAPSHOT_BYTES = SOURCE_BYTES;
