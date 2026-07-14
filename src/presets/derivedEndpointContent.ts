import { getPadPreset, morphPadPresets, PAD1_TO_PAD2_KEY, PAD_PRESET_PARAM_KEYS } from '../audio/padPresets';
import type { PresetContentCandidate } from './contentNodes';
import type { PresetVersionContentRefV2Row } from './presetStorageV2';
import { getPreset as getDrumPreset, type DrumVoiceType } from '../audio/drumPresets';
import { interpolatePresets } from '../audio/drumMorph';
import type { PresetContentNodeType } from './contentNodes';
import { getGranularPresetData, isGranularDelayBStateKey } from '../ui/granular/granularPresets';
import { morphWaterPresets, morphWaterPresetStates, WATER_MORPH_PARAM_KEYS } from '../audio/waterPresets';

export interface DerivedEndpointInstance {
  id: string;
  refSlot: string;
  contentType: PresetContentNodeType;
  content: Record<string, unknown>;
}

const DRUM_ENDPOINTS: Record<DrumVoiceType, {
  presetPrefix: string;
  contentType: PresetContentNodeType;
}> = {
  sub: { presetPrefix: 'drumSubPreset', contentType: 'drumSubVoice' },
  kick: { presetPrefix: 'drumKickPreset', contentType: 'drumKickVoice' },
  click: { presetPrefix: 'drumClickPreset', contentType: 'drumClickVoice' },
  beepHi: { presetPrefix: 'drumBeepHiPreset', contentType: 'drumBeepHiVoice' },
  beepLo: { presetPrefix: 'drumBeepLoPreset', contentType: 'drumBeepLoVoice' },
  noise: { presetPrefix: 'drumNoisePreset', contentType: 'drumNoiseVoice' },
  membrane: { presetPrefix: 'drumMembranePreset', contentType: 'drumMembraneVoice' },
};

export function buildDrumDerivedEndpointInstances(state: Record<string, unknown>): DerivedEndpointInstance[] {
  const instances: DerivedEndpointInstance[] = [];
  for (const [voice, config] of Object.entries(DRUM_ENDPOINTS) as Array<[DrumVoiceType, (typeof DRUM_ENDPOINTS)[DrumVoiceType]]>) {
    for (const endpoint of ['A', 'B'] as const) {
      const name = presetName(state[`${config.presetPrefix}${endpoint}`]);
      const preset = name ? getDrumPreset(voice, name) : null;
      if (!preset) continue;
      instances.push({
        id: `derived.drum.${voice}.${endpoint.toLowerCase()}`,
        refSlot: `derived.drum.${voice.toLowerCase()}.endpoint-${endpoint.toLowerCase()}`,
        contentType: config.contentType,
        content: { ...(preset as unknown as Record<string, unknown>) },
      });
    }
  }
  return instances;
}

export function buildGranularAndWaterDerivedEndpointInstances(state: Record<string, unknown>): DerivedEndpointInstance[] {
  const instances: DerivedEndpointInstance[] = [];
  const granularPreset = presetName(state.granularPreset);
  const granularContent = granularPreset ? getGranularPresetData(granularPreset) : null;
  if (granularContent) instances.push({
    id: 'derived.granular.selection',
    refSlot: 'derived.granular.selection',
    contentType: 'granularSelection',
    content: { ...(granularContent as Record<string, unknown>) },
  });
  for (const endpoint of ['a', 'b'] as const) {
    const value = Number(state[endpoint === 'a' ? 'waterMorphA' : 'waterMorphB']);
    if (!Number.isFinite(value)) continue;
    const endpointState = morphWaterPresets(value, value, 0);
    instances.push({
      id: `derived.water.${endpoint}`,
      refSlot: `derived.water.endpoint-${endpoint}`,
      contentType: 'waterEndpoint',
      content: Object.fromEntries(WATER_MORPH_PARAM_KEYS.map(key => [key, endpointState[key]])),
    });
  }
  return instances;
}

function presetName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function buildPadDerivedEndpointInstances(state: Record<string, unknown>): DerivedEndpointInstance[] {
  const instances: DerivedEndpointInstance[] = [];
  for (const laneIndex of [0, 1] as const) {
    const lane = laneIndex + 1;
    const prefix = laneIndex === 0 ? 'padPreset' : 'pad2Preset';
    for (const endpoint of ['A', 'B'] as const) {
      const name = presetName(state[`${prefix}${endpoint}`]);
      if (!name) continue;
      const preset = getPadPreset(name, laneIndex === 0 ? 'pad1' : 'pad2');
      if (!preset) continue;
      const presetRecord = preset as unknown as Record<string, unknown>;
      instances.push({
        id: `derived.pad.${lane}.${endpoint.toLowerCase()}`,
        refSlot: `derived.pad.${lane}.endpoint-${endpoint.toLowerCase()}`,
        contentType: 'padVoice',
        content: Object.fromEntries(PAD_PRESET_PARAM_KEYS
          .filter(key => key !== 'detune' && presetRecord[key] !== undefined)
          .map(key => [key, presetRecord[key]])),
      });
    }
  }
  return instances;
}

export function derivedEndpointCandidates(instances: readonly DerivedEndpointInstance[]): PresetContentCandidate[] {
  return instances.map(instance => ({ id: instance.id, contentType: instance.contentType, content: instance.content }));
}

export function hydratePadDerivedEndpointRefs(
  state: Record<string, unknown>,
  refs: readonly PresetVersionContentRefV2Row[],
  payloadMap: Map<string, unknown>,
): Record<string, unknown> {
  let next = { ...state };
  for (const laneIndex of [0, 1] as const) {
    const lane = laneIndex + 1;
    const payloadFor = (endpoint: 'a' | 'b'): Record<string, unknown> | null => {
      const ref = refs.find(candidate => candidate.ref_slot === `derived.pad.${lane}.endpoint-${endpoint}`);
      const envelope = ref ? payloadMap.get(ref.content_hash) : null;
      return isRecord(envelope) && isRecord(envelope.content) ? envelope.content : null;
    };
    const endpointA = payloadFor('a');
    const endpointB = payloadFor('b');
    if (!endpointA || !endpointB) continue;
    const morph = Number(state[laneIndex === 0 ? 'padMorph' : 'pad2Morph'] ?? 0);
    const derived = morphPadPresets(endpointA as never, endpointB as never, Number.isFinite(morph) ? morph : 0);
    for (const key of PAD_PRESET_PARAM_KEYS) {
      const runtimeKey = laneIndex === 0 ? key : PAD1_TO_PAD2_KEY[key];
      if (runtimeKey && !(runtimeKey in next) && derived[key] !== undefined) next[runtimeKey] = derived[key];
    }
  }
  return next;
}

export function hydrateDrumDerivedEndpointRefs(
  state: Record<string, unknown>,
  refs: readonly PresetVersionContentRefV2Row[],
  payloadMap: Map<string, unknown>,
): Record<string, unknown> {
  const next = { ...state };
  for (const [voice, config] of Object.entries(DRUM_ENDPOINTS) as Array<[DrumVoiceType, (typeof DRUM_ENDPOINTS)[DrumVoiceType]]>) {
    const endpointPayload = (endpoint: 'a' | 'b'): Record<string, unknown> | null => {
      const ref = refs.find(candidate => (
        candidate.ref_slot === `derived.drum.${voice.toLowerCase()}.endpoint-${endpoint}`
        && candidate.content_type === config.contentType
      ));
      const envelope = ref ? payloadMap.get(ref.content_hash) : null;
      return isRecord(envelope) && isRecord(envelope.content) ? envelope.content : null;
    };
    const endpointA = endpointPayload('a');
    const endpointB = endpointPayload('b');
    if (!endpointA || !endpointB) continue;
    const morph = Number(state[`${config.presetPrefix.replace('Preset', '')}Morph`] ?? 0);
    const derived = interpolatePresets(endpointA as never, endpointB as never, Number.isFinite(morph) ? morph : 0);
    for (const [key, value] of Object.entries(derived)) if (!(key in next)) next[key] = value;
  }
  return next;
}

export function hydrateGranularAndWaterDerivedEndpointRefs(
  state: Record<string, unknown>,
  refs: readonly PresetVersionContentRefV2Row[],
  payloadMap: Map<string, unknown>,
): Record<string, unknown> {
  const next = { ...state };
  const payloadFor = (slot: string, type: string): Record<string, unknown> | null => {
    const ref = refs.find(candidate => candidate.ref_slot === slot && candidate.content_type === type);
    const envelope = ref ? payloadMap.get(ref.content_hash) : null;
    return isRecord(envelope) && isRecord(envelope.content) ? envelope.content : null;
  };
  const granular = payloadFor('derived.granular.selection', 'granularSelection');
  if (granular) {
    const linked = state.delayBGranularLinked !== false;
    for (const [key, value] of Object.entries(granular)) {
      if (!linked && isGranularDelayBStateKey(key)) continue;
      if (!(key in next)) next[key] = value;
    }
  }
  const waterA = payloadFor('derived.water.endpoint-a', 'waterEndpoint');
  const waterB = payloadFor('derived.water.endpoint-b', 'waterEndpoint');
  if (waterA && waterB) {
    const morph = Number(state.waterMorph ?? 0);
    const derived = morphWaterPresetStates(waterA, waterB, Number.isFinite(morph) ? morph : 0);
    for (const key of WATER_MORPH_PARAM_KEYS) if (!(key in next)) next[key] = derived[key];
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findMissingDerivedEndpointSlots(
  refs: readonly PresetVersionContentRefV2Row[],
  payloadMap: Map<string, unknown>,
): string[] {
  if (!refs.some(ref => ref.ref_slot.startsWith('derived.'))) return [];
  return refs
    .filter(ref => ref.ref_slot.startsWith('derived.') && !isRecord(payloadMap.get(ref.content_hash)))
    .map(ref => ref.ref_slot)
    .sort();
}
