import type { SliderState } from '../ui/state';
import {
  normalizeDegradeReverbCrossfeed,
  ROUTING_DEGRADE_ACTIVE_KEYS,
  ROUTING_DELAY_A_INPUT_KEYS,
  ROUTING_DELAY_B_INPUT_KEYS,
  ROUTING_INSECTS_KEYS,
  ROUTING_NATURE_KEYS,
} from '../ui/routing';
import { isDrumSequencerActive } from './drumSequencerSourcePolicy';

const RUNTIME_ENABLED_FLAG_KEYS = [
  'padEnabled',
  'pad2Enabled',
  'leadEnabled',
  'lead2Enabled',
  'pianoEnabled',
  'drumEnabled',
  'granularEnabled',
  'oceanSampleEnabled',
  'waterEnabled',
  'insectsEnabled',
  'insects2Enabled',
  'birdsEnabled',
  'birds2Enabled',
  'frogsEnabled',
  'delayAEnabled',
  'granularDelayEnabled',
  'reverbEnabled',
] as const satisfies readonly (keyof SliderState)[];

type RuntimeEnabledFlagKey = typeof RUNTIME_ENABLED_FLAG_KEYS[number];
type RuntimeEnabledFlags = Pick<SliderState, RuntimeEnabledFlagKey>;

const GRANULAR_ENGINE_ACTIVE_KEYS = [
  'granularLevel',
  'granularReverbSend',
  'granularDelayASend',
  'granularDelayBSend',
  'granularDegradeSend',
  'delayAGranularSend',
  'delayBGranularSend',
  'granularPad1Send',
  'granularPad2Send',
  'granularLead1Send',
  'granularLead2Send',
  'granularPianoSend',
  'granularDrumSend',
  'granularWavesSend',
  'granularNatureSend',
  'granularWaterSend',
  'granularInsectsSend',
] as const satisfies readonly (keyof SliderState)[];

const DELAY_A_WET_ACTIVE_KEYS = [
  'delayAMix',
  'delayAReverbSend',
  'delayAToBSend',
  'delayAGranularSend',
  'delayADegradeSend',
  'delayBToASend',
  'pad1DelayASend',
  'pad2DelayASend',
  'lead1DelayASend',
  'lead2DelayASend',
  'pianoDelayASend',
  'drumDelayASend',
  'oceanDelayASend',
  'waterDelayASend',
  'insDelayASend',
  'natureDelayASend',
  'granularDelayASend',
] as const satisfies readonly (keyof SliderState)[];

const DELAY_B_WET_ACTIVE_KEYS = [
  'granularDelayMix',
  'granularDelayReverbSend',
  'delayBToASend',
  'delayBGranularSend',
  'delayBDegradeSend',
  'delayAToBSend',
  'pad1DelayBSend',
  'pad2DelayBSend',
  'lead1DelayBSend',
  'lead2DelayBSend',
  'pianoDelayBSend',
  'drumDelayBSend',
  'oceanDelayBSend',
  'waterDelayBSend',
  'insDelayBSend',
  'natureDelayBSend',
  'granularDelayBSend',
] as const satisfies readonly (keyof SliderState)[];

const PAD1_WET_ACTIVE_KEYS = [
  'synthLevel',
  'pad1ReverbSend',
  'pad1DelayASend',
  'pad1DelayBSend',
  'granularPad1Send',
  'degradePad1Send',
] as const satisfies readonly (keyof SliderState)[];

const PAD2_WET_ACTIVE_KEYS = [
  'pad2Level',
  'pad2ReverbSend',
  'pad2DelayASend',
  'pad2DelayBSend',
  'granularPad2Send',
  'degradePad2Send',
] as const satisfies readonly (keyof SliderState)[];

const LEAD1_WET_ACTIVE_KEYS = [
  'lead1Level',
  'lead1ReverbSend',
  'lead1DelayASend',
  'lead1DelayBSend',
  'granularLead1Send',
  'degradeLead1Send',
] as const satisfies readonly (keyof SliderState)[];

const LEAD2_WET_ACTIVE_KEYS = [
  'lead2Level',
  'lead2ReverbSend',
  'lead2DelayASend',
  'lead2DelayBSend',
  'granularLead2Send',
  'degradeLead2Send',
] as const satisfies readonly (keyof SliderState)[];

const PIANO_WET_ACTIVE_KEYS = [
  'pianoLevel',
  'pianoReverbSend',
  'pianoDelayASend',
  'pianoDelayBSend',
  'granularPianoSend',
  'degradePianoSend',
] as const satisfies readonly (keyof SliderState)[];

const DRUM_WET_ACTIVE_KEYS = [
  'drumLevel',
  'drumReverbSend',
  'drumDelayASend',
  'drumDelayBSend',
  'granularDrumSend',
  'degradeDrumSend',
] as const satisfies readonly (keyof SliderState)[];

const OCEAN_WET_ACTIVE_KEYS = [
  'oceanSampleLevel',
  'oceanReverbSend',
  'oceanDelayASend',
  'oceanDelayBSend',
  'granularWavesSend',
  'degradeWavesSend',
] as const satisfies readonly (keyof SliderState)[];

const NATURE_WET_ACTIVE_KEYS = [
  'natureReverbSend',
  'natureDelayASend',
  'natureDelayBSend',
  'granularNatureSend',
  'degradeNatureSend',
] as const satisfies readonly (keyof SliderState)[];

const WATER_WET_ACTIVE_KEYS = [
  'waterLevel',
  'waterReverbSend',
  'waterDelayASend',
  'waterDelayBSend',
  'waterLayerHardDrops',
  'waterLayerWaterDrops',
  'waterLayerTurbulence',
  'waterLayerBubbling',
  'waterLayerSurf',
  'waterLayerChannels',
  'granularWaterSend',
  'degradeWaterSend',
] as const satisfies readonly (keyof SliderState)[];

const INSECTS_SHARED_WET_ACTIVE_KEYS = [
  'insectsReverbSend',
  'insDelayASend',
  'insDelayBSend',
  'granularInsectsSend',
  'degradeInsectsSend',
] as const satisfies readonly (keyof SliderState)[];

function hasPositiveValue(state: SliderState, keys: readonly (keyof SliderState)[]): boolean {
  return keys.some((key) => {
    const value = state[key];
    return typeof value === 'number' && value > 0;
  });
}

export function captureRuntimeEnabledFlags(state: SliderState): RuntimeEnabledFlags {
  const flags = {} as RuntimeEnabledFlags;
  for (const key of RUNTIME_ENABLED_FLAG_KEYS) {
    flags[key] = state[key];
  }
  return flags;
}

export function restoreRuntimeEnabledFlags(state: SliderState, flags: RuntimeEnabledFlags): SliderState {
  return {
    ...state,
    ...flags,
  };
}

export function applyRoutingActivationForSliderValue(
  previousState: SliderState,
  nextState: SliderState,
  routeKey: keyof SliderState,
  stateValue: unknown,
): SliderState {
  const positiveNumber = typeof stateValue === 'number' && stateValue > 0;
  if (!positiveNumber) return nextState;

  let newState = nextState;
  switch (routeKey) {
    case 'delayAMix':
    case 'delayAReverbSend':
    case 'delayAToBSend':
    case 'delayADegradeSend':
      newState.delayAEnabled = true;
      if (routeKey === 'delayAToBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularDelayActivity':
    case 'granularDelayRepeats':
    case 'granularDelayMix':
    case 'granularDelayReverbSend':
    case 'granularDelayFilter':
    case 'granularDelayVibrato':
    case 'delayBToASend':
    case 'delayBDegradeSend':
    case 'delayBWarpIntensity':
    case 'delayBSpread':
      newState.granularDelayEnabled = true;
      break;
    case 'granularLevel':
    case 'granularReverbSend':
    case 'granularDelayASend':
    case 'granularDelayBSend':
    case 'granularDegradeSend':
      newState.granularEnabled = true;
      if (routeKey === 'granularDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      newState.delayBGranularSend = 0;
      break;
    case 'delayAGranularSend':
      newState.delayAEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'delayBGranularSend':
      newState.granularDelayEnabled = true;
      newState.granularEnabled = true;
      newState.granularDelayBSend = 0;
      break;
    case 'degradeReverbSend':
      newState.reverbEnabled = true;
      newState = normalizeDegradeReverbCrossfeed(newState, previousState, {
        preserveActiveDirection: 'last-edited',
        lastEditedDirection: 'degrade-to-reverb',
      });
      break;
    case 'reverbDegradeSend':
      newState = normalizeDegradeReverbCrossfeed(newState, previousState, {
        preserveActiveDirection: 'last-edited',
        lastEditedDirection: 'reverb-to-degrade',
      });
      break;
    case 'lead1Level':
    case 'lead1ReverbSend':
    case 'lead1DelayASend':
    case 'lead1DelayBSend':
    case 'degradeLead1Send':
      newState.leadEnabled = true;
      if (routeKey === 'lead1DelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularLead1Send':
      newState.leadEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'lead2Level':
    case 'lead2ReverbSend':
    case 'lead2DelayASend':
    case 'lead2DelayBSend':
    case 'degradeLead2Send':
      newState.lead2Enabled = true;
      if (routeKey === 'lead2DelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularLead2Send':
      newState.lead2Enabled = true;
      newState.granularEnabled = true;
      break;
    case 'pianoLevel':
    case 'pianoReverbSend':
    case 'pianoDelayASend':
    case 'pianoDelayBSend':
    case 'degradePianoSend':
      newState.pianoEnabled = true;
      if (routeKey === 'pianoDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularPianoSend':
      newState.pianoEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'drumLevel':
    case 'drumReverbSend':
    case 'drumDelayASend':
    case 'drumDelayBSend':
    case 'degradeDrumSend':
      newState.drumEnabled = true;
      if (routeKey === 'drumDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularDrumSend':
      newState.drumEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'oceanSampleLevel':
    case 'oceanReverbSend':
    case 'oceanDelayASend':
    case 'oceanDelayBSend':
    case 'degradeWavesSend':
    case 'oceanSliceDuration':
    case 'oceanSliceDensity':
      newState.oceanSampleEnabled = true;
      if (routeKey === 'oceanDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularWavesSend':
      newState.oceanSampleEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'natureLevel':
    case 'natureReverbSend':
    case 'natureDelayASend':
    case 'natureDelayBSend':
    case 'degradeNatureSend':
      if (routeKey === 'natureDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularNatureSend':
      newState.granularEnabled = true;
      break;
    case 'birdsLevel':
    case 'birdsSliceDuration':
    case 'birdsSliceDensity':
      newState.birdsEnabled = true;
      break;
    case 'birds2Level':
    case 'birds2SliceDuration':
    case 'birds2SliceDensity':
      newState.birds2Enabled = true;
      break;
    case 'frogsLevel':
    case 'frogsSliceDuration':
    case 'frogsSliceDensity':
      newState.frogsEnabled = true;
      break;
    case 'synthLevel':
    case 'pad1ReverbSend':
    case 'degradePad1Send':
    case 'pad1DelayASend':
    case 'pad1DelayBSend':
      newState.padEnabled = true;
      break;
    case 'pad2Level':
    case 'pad2ReverbSend':
    case 'degradePad2Send':
    case 'pad2DelayASend':
    case 'pad2DelayBSend':
      newState.pad2Enabled = true;
      break;
    case 'granularPad1Send':
      newState.padEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'granularPad2Send':
      newState.pad2Enabled = true;
      newState.granularEnabled = true;
      break;
    case 'waterLevel':
    case 'waterReverbSend':
    case 'waterDelayASend':
    case 'waterDelayBSend':
    case 'degradeWaterSend':
    case 'waterLayerHardDrops':
    case 'waterLayerWaterDrops':
    case 'waterLayerTurbulence':
    case 'waterLayerBubbling':
    case 'waterLayerSurf':
    case 'waterLayerChannels':
      newState.waterEnabled = true;
      if (routeKey === 'waterDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularWaterSend':
      newState.waterEnabled = true;
      newState.granularEnabled = true;
      break;
    case 'insectsLevel':
      newState.insectsEnabled = true;
      break;
    case 'insectsSharedLevel':
      break;
    case 'insects2Level':
      newState.insects2Enabled = true;
      break;
    case 'insectsReverbSend':
    case 'insDelayASend':
    case 'insDelayBSend':
    case 'degradeInsectsSend':
      if (routeKey === 'insDelayBSend') {
        newState.granularDelayEnabled = true;
      }
      break;
    case 'granularInsectsSend':
      newState.granularEnabled = true;
      break;
    default:
      break;
  }

  if (ROUTING_DELAY_A_INPUT_KEYS.has(routeKey)) {
    newState.delayAEnabled = true;
  }
  if (ROUTING_DELAY_B_INPUT_KEYS.has(routeKey)) {
    newState.granularDelayEnabled = true;
  }
  if (ROUTING_NATURE_KEYS.has(routeKey) && !newState.birdsEnabled && !newState.birds2Enabled && !newState.frogsEnabled) {
    newState.birdsEnabled = true;
  }
  if (ROUTING_INSECTS_KEYS.has(routeKey) && !newState.insectsEnabled && !newState.insects2Enabled) {
    newState.insectsEnabled = true;
  }
  if (ROUTING_DEGRADE_ACTIVE_KEYS.has(routeKey)) {
    newState.dynamicsEnabled = true;
    newState.degradeEnabled = true;
    if (!newState.driftEnabled && !newState.erosionEnabled) {
      newState.driftEnabled = true;
    }
    if ((newState.driftMix ?? 0) <= 0 && (newState.erosionMix ?? 0) <= 0) {
      if (newState.erosionEnabled && !newState.driftEnabled) {
        newState.erosionMix = 1;
      } else {
        newState.driftMix = 1;
      }
    }
    if ((newState.degradeLevel ?? 0) <= 0) {
      newState.degradeLevel = 1;
    }
  }

  return newState;
}

export function normalizeRoutingRuntimeEnabledFlags(state: SliderState): SliderState {
  let nextState = state;
  const natureSharedWetActive = hasPositiveValue(nextState, NATURE_WET_ACTIVE_KEYS);
  const insectsSharedWetActive = hasPositiveValue(nextState, INSECTS_SHARED_WET_ACTIVE_KEYS);

  if (!hasPositiveValue(nextState, GRANULAR_ENGINE_ACTIVE_KEYS)) {
    nextState.granularEnabled = false;
  }
  if (!hasPositiveValue(nextState, DELAY_A_WET_ACTIVE_KEYS)) {
    nextState.delayAEnabled = false;
  }
  if (!hasPositiveValue(nextState, DELAY_B_WET_ACTIVE_KEYS)) {
    nextState.granularDelayEnabled = false;
  }
  if (!hasPositiveValue(nextState, LEAD1_WET_ACTIVE_KEYS)) {
    nextState.leadEnabled = false;
  }
  if (!hasPositiveValue(nextState, LEAD2_WET_ACTIVE_KEYS)) {
    nextState.lead2Enabled = false;
  }
  if (!hasPositiveValue(nextState, PIANO_WET_ACTIVE_KEYS)) {
    nextState.pianoEnabled = false;
  }
  if (!isDrumSequencerActive(nextState) && !hasPositiveValue(nextState, DRUM_WET_ACTIVE_KEYS)) {
    nextState.drumEnabled = false;
  }
  if (!hasPositiveValue(nextState, OCEAN_WET_ACTIVE_KEYS)) {
    nextState.oceanSampleEnabled = false;
  }
  if (!positiveValue(nextState, 'birdsLevel') && !natureSharedWetActive) {
    nextState.birdsEnabled = false;
  }
  if (!positiveValue(nextState, 'birds2Level') && !natureSharedWetActive) {
    nextState.birds2Enabled = false;
  }
  if (!positiveValue(nextState, 'frogsLevel') && !natureSharedWetActive) {
    nextState.frogsEnabled = false;
  }
  if (!hasPositiveValue(nextState, PAD1_WET_ACTIVE_KEYS)) {
    nextState.padEnabled = false;
  }
  if (!hasPositiveValue(nextState, PAD2_WET_ACTIVE_KEYS)) {
    nextState.pad2Enabled = false;
  }
  if (!hasPositiveValue(nextState, WATER_WET_ACTIVE_KEYS)) {
    nextState.waterEnabled = false;
  }
  if (!positiveValue(nextState, 'insectsLevel') && !insectsSharedWetActive) {
    nextState.insectsEnabled = false;
  }
  if (!positiveValue(nextState, 'insects2Level') && !insectsSharedWetActive) {
    nextState.insects2Enabled = false;
  }

  return nextState;
}

function positiveValue(state: SliderState, key: keyof SliderState): boolean {
  const value = state[key];
  return typeof value === 'number' && value > 0;
}
