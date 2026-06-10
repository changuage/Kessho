import type { SliderState } from '../state';
import {
  levelAboveEpsilon,
  numericStateValue,
  routingAnyFlagEnabled,
  ROUTING_ACTIVE_EPSILON,
} from './routePredicates';

export { numericStateValue, ROUTING_ACTIVE_EPSILON };

export type RoutingRowId =
  | 'pad1'
  | 'pad2'
  | 'lead1'
  | 'lead2'
  | 'piano'
  | 'drums'
  | 'granular'
  | 'waves'
  | 'water'
  | 'insects'
  | 'nature'
  | 'delayAOut'
  | 'delayBOut'
  | 'degrade'
  | 'reverb';

export type RoutingSendDestination =
  | 'delayA'
  | 'delayB'
  | 'granular'
  | 'degrade'
  | 'reverb';

export type ToggleMode = 'simple-toggle' | 'disable-only-family' | 'return-row' | 'computed';

export interface RoutingSourceDef {
  id: RoutingRowId;
  label: string;
  accent: string;
  note?: string;
  levelKey: keyof SliderState;
  enabledKeys?: readonly (keyof SliderState)[];
  toggleMode: ToggleMode;
  sends: Partial<Record<RoutingSendDestination, keyof SliderState>>;
  dynamicsBusKey?: keyof SliderState;
  snowflakeArmEligible: boolean;
  isEnabled(state: SliderState): boolean;
  isAudible(state: SliderState): boolean;
}

type RoutingSourceInput = Omit<RoutingSourceDef, 'isEnabled' | 'isAudible'> & {
  isEnabled?: (state: SliderState) => boolean;
  isAudible?: (state: SliderState) => boolean;
};

const source = (input: RoutingSourceInput): RoutingSourceDef => {
  const isEnabled = input.isEnabled ?? ((state) => input.enabledKeys ? routingAnyFlagEnabled(state, input.enabledKeys) : true);
  return {
    ...input,
    isEnabled,
    isAudible: input.isAudible ?? ((state) => isEnabled(state) && levelAboveEpsilon(state, input.levelKey)),
  };
};

const sourceWithFlags = (
  state: SliderState,
  keys: readonly (keyof SliderState)[],
): boolean => routingAnyFlagEnabled(state, keys);

const degradeEnabled = (state: SliderState): boolean => sourceWithFlags(state, [
  'degradeEnabled',
  'driftEnabled',
  'erosionEnabled',
  'dynamicsSaturationEnabled',
]);

const reverbEnabled = (state: SliderState): boolean => (
  Boolean(state.reverbEnabled)
  || numericStateValue(state, 'reverbDegradeSend') > ROUTING_ACTIVE_EPSILON
  || numericStateValue(state, 'degradeReverbSend') > ROUTING_ACTIVE_EPSILON
);

export const ROUTING_SOURCE_REGISTRY = [
  source({
    id: 'pad1',
    label: 'Pad 1',
    accent: '#E07A84',
    note: 'Pad 1 has its own Delay A, Delay B, Granular, Degrade, and Reverb sends.',
    levelKey: 'synthLevel',
    enabledKeys: ['padEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'pad1DelayASend', delayB: 'pad1DelayBSend', granular: 'granularPad1Send', degrade: 'degradePad1Send', reverb: 'pad1ReverbSend' },
    dynamicsBusKey: 'dynamicsPad1Bus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'pad2',
    label: 'Pad 2',
    accent: '#B96A72',
    note: 'Pad 2 has its own Delay A, Delay B, Granular, Degrade, and Reverb sends.',
    levelKey: 'pad2Level',
    enabledKeys: ['pad2Enabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'pad2DelayASend', delayB: 'pad2DelayBSend', granular: 'granularPad2Send', degrade: 'degradePad2Send', reverb: 'pad2ReverbSend' },
    dynamicsBusKey: 'dynamicsPad2Bus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'lead1',
    label: 'Lead 1',
    accent: '#D4A520',
    levelKey: 'lead1Level',
    enabledKeys: ['leadEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'lead1DelayASend', delayB: 'lead1DelayBSend', granular: 'granularLead1Send', degrade: 'degradeLead1Send', reverb: 'lead1ReverbSend' },
    dynamicsBusKey: 'dynamicsLead1Bus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'lead2',
    label: 'Lead 2',
    accent: '#BFA45A',
    levelKey: 'lead2Level',
    enabledKeys: ['lead2Enabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'lead2DelayASend', delayB: 'lead2DelayBSend', granular: 'granularLead2Send', degrade: 'degradeLead2Send', reverb: 'lead2ReverbSend' },
    dynamicsBusKey: 'dynamicsLead2Bus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'piano',
    label: 'Piano',
    accent: '#E8DCC4',
    levelKey: 'pianoLevel',
    enabledKeys: ['pianoEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'pianoDelayASend', delayB: 'pianoDelayBSend', granular: 'granularPianoSend', degrade: 'degradePianoSend', reverb: 'pianoReverbSend' },
    dynamicsBusKey: 'dynamicsPianoBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'drums',
    label: 'Drums',
    accent: '#A870E8',
    note: 'Drums trim straight into the shared Delay A and Delay B buses. Delay A timing and tone live with the shared Simple Delay controls.',
    levelKey: 'drumLevel',
    enabledKeys: ['drumEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'drumDelayASend', delayB: 'drumDelayBSend', granular: 'granularDrumSend', degrade: 'degradeDrumSend', reverb: 'drumReverbSend' },
    dynamicsBusKey: 'dynamicsDrumBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'granular',
    label: 'Granular',
    accent: '#E8B44A',
    note: 'Granular to Delay B uses the current Clocked Space frontend for bus voicing. The matrix cell trims the source-send amount.',
    levelKey: 'granularLevel',
    enabledKeys: ['granularEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'granularDelayASend', delayB: 'granularDelayBSend', degrade: 'granularDegradeSend', reverb: 'granularReverbSend' },
    dynamicsBusKey: 'dynamicsGranularBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'waves',
    label: 'Waves',
    accent: '#5A7B8A',
    levelKey: 'oceanSampleLevel',
    enabledKeys: ['oceanSampleEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'oceanDelayASend', delayB: 'oceanDelayBSend', granular: 'granularWavesSend', degrade: 'degradeWavesSend', reverb: 'oceanReverbSend' },
    dynamicsBusKey: 'dynamicsWavesBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'water',
    label: 'Water',
    accent: '#6F9AB1',
    levelKey: 'waterLevel',
    enabledKeys: ['waterEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'waterDelayASend', delayB: 'waterDelayBSend', granular: 'granularWaterSend', degrade: 'degradeWaterSend', reverb: 'waterReverbSend' },
    dynamicsBusKey: 'dynamicsWaterBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'insects',
    label: 'Insects',
    accent: '#7B9A6D',
    note: 'The current Earth engine exposes one shared insects dry master plus combined wet sends for both insect layers, so this row controls the family-level routing.',
    levelKey: 'insectsSharedLevel',
    enabledKeys: ['insectsEnabled', 'insects2Enabled'],
    toggleMode: 'disable-only-family',
    sends: { delayA: 'insDelayASend', delayB: 'insDelayBSend', granular: 'granularInsectsSend', degrade: 'degradeInsectsSend', reverb: 'insectsReverbSend' },
    dynamicsBusKey: 'dynamicsInsectsBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'nature',
    label: 'Nature',
    accent: '#A6B98A',
    note: 'Nature has a shared dry master plus one wet bus for Birds Alps, Birds Fujian, and Frogs. Individual source levels and texture shaping still live in the Active Earth Matrix.',
    levelKey: 'natureLevel',
    enabledKeys: ['birdsEnabled', 'birds2Enabled', 'frogsEnabled'],
    toggleMode: 'disable-only-family',
    sends: { delayA: 'natureDelayASend', delayB: 'natureDelayBSend', granular: 'granularNatureSend', degrade: 'degradeNatureSend', reverb: 'natureReverbSend' },
    dynamicsBusKey: 'dynamicsNatureBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'delayAOut',
    label: 'Delay A Out',
    accent: '#32C8C8',
    levelKey: 'delayAMix',
    enabledKeys: ['delayAEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayB: 'delayAToBSend', granular: 'delayAGranularSend', degrade: 'delayADegradeSend', reverb: 'delayAReverbSend' },
    dynamicsBusKey: 'dynamicsDelayABus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'delayBOut',
    label: 'Delay B Out',
    accent: '#32C7C7',
    note: 'Level trims the direct Clocked Space return. Reverb and Granular sends stay independent, so mute those too for total silence.',
    levelKey: 'granularDelayMix',
    enabledKeys: ['granularDelayEnabled'],
    toggleMode: 'simple-toggle',
    sends: { delayA: 'delayBToASend', granular: 'delayBGranularSend', degrade: 'delayBDegradeSend', reverb: 'granularDelayReverbSend' },
    dynamicsBusKey: 'dynamicsDelayBBus',
    snowflakeArmEligible: true,
  }),
  source({
    id: 'degrade',
    label: 'Degrade',
    accent: '#A980FF',
    note: 'Degrade is the return for the Drift and Erosion processors. It can feed Reverb, but Reverb and Degrade cannot feed each other at the same time.',
    levelKey: 'degradeLevel',
    enabledKeys: ['degradeEnabled', 'driftEnabled', 'erosionEnabled', 'dynamicsSaturationEnabled'],
    toggleMode: 'return-row',
    sends: { reverb: 'degradeReverbSend' },
    dynamicsBusKey: 'dynamicsDegradeBus',
    snowflakeArmEligible: false,
    isEnabled: degradeEnabled,
  }),
  source({
    id: 'reverb',
    label: 'Reverb',
    accent: '#D49660',
    note: 'Reverb is a return bus here. Its routing row trims the wet output level while source sends still live on their own rows.',
    levelKey: 'reverbLevel',
    enabledKeys: ['reverbEnabled'],
    toggleMode: 'return-row',
    sends: { degrade: 'reverbDegradeSend' },
    dynamicsBusKey: 'dynamicsReverbBus',
    snowflakeArmEligible: false,
    isEnabled: reverbEnabled,
  }),
] as const satisfies readonly RoutingSourceDef[];

export const ROUTING_SOURCE_IDS = ROUTING_SOURCE_REGISTRY.map((row) => row.id);

export const ROUTING_SOURCE_BY_ID = new Map<RoutingRowId, RoutingSourceDef>(
  ROUTING_SOURCE_REGISTRY.map((row) => [row.id, row]),
);

export const ROUTING_MATRIX_ROW_IDS = ROUTING_SOURCE_IDS;

export const SNOWFLAKE_ARM_ELIGIBLE_ROUTING_ROW_IDS = ROUTING_SOURCE_REGISTRY
  .filter((row) => row.snowflakeArmEligible)
  .map((row) => row.id);

export const ROUTING_DELAY_A_INPUT_KEYS = new Set<keyof SliderState>(
  ROUTING_SOURCE_REGISTRY.flatMap((row) => row.sends.delayA ? [row.sends.delayA] : []),
);

export const ROUTING_DELAY_B_INPUT_KEYS = new Set<keyof SliderState>(
  ROUTING_SOURCE_REGISTRY.flatMap((row) => row.sends.delayB ? [row.sends.delayB] : []),
);

export const ROUTING_DEGRADE_ACTIVE_KEYS = new Set<keyof SliderState>([
  ...ROUTING_SOURCE_REGISTRY.flatMap((row) => row.sends.degrade ? [row.sends.degrade] : []),
  'degradeReverbSend',
  'degradeLevel',
]);

export const ROUTING_NATURE_KEYS = new Set<keyof SliderState>([
  'natureLevel',
  'natureReverbSend',
  'natureDelayASend',
  'natureDelayBSend',
  'granularNatureSend',
  'degradeNatureSend',
]);

export const ROUTING_INSECTS_KEYS = new Set<keyof SliderState>([
  'insectsSharedLevel',
  'insectsReverbSend',
  'insDelayASend',
  'insDelayBSend',
  'granularInsectsSend',
  'degradeInsectsSend',
]);

export function getRoutingSourceDef(sourceId: string): RoutingSourceDef | null {
  return ROUTING_SOURCE_BY_ID.get(sourceId as RoutingRowId) ?? null;
}

export function routingSourceIsEnabled(sourceId: string, state: SliderState): boolean {
  return getRoutingSourceDef(sourceId)?.isEnabled(state) ?? false;
}

export function routingSourceIsAudible(sourceId: string, state: SliderState): boolean {
  return getRoutingSourceDef(sourceId)?.isAudible(state) ?? false;
}

export function getRoutingSourceToggleKeys(sourceId: string): readonly (keyof SliderState)[] {
  return getRoutingSourceDef(sourceId)?.enabledKeys ?? [];
}

export function getActiveRoutingRowIds(state: SliderState): RoutingRowId[] {
  return ROUTING_SOURCE_REGISTRY
    .filter((row) => row.isEnabled(state))
    .map((row) => row.id);
}

export function getActiveDawOutputSourceIds(state: SliderState): string[] {
  const ids: string[] = getActiveRoutingRowIds(state).filter((id) => id !== 'degrade');
  if (degradeEnabled(state) || Boolean(state.dynamicsEnabled)) ids.push('dynamics');
  return ids;
}

export function dawOutputSourceIsActive(sourceId: string, state: SliderState): boolean {
  if (sourceId === 'dynamics') {
    return degradeEnabled(state) || Boolean(state.dynamicsEnabled);
  }
  if (sourceId === 'degrade') return degradeEnabled(state);
  return getRoutingSourceDef(sourceId)?.isEnabled(state) ?? false;
}
