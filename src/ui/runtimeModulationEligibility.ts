import { NATURE_SLOT_KEYS } from '../audio/natureSlots';
import { PAD_PRESET_PARAM_KEYS } from '../audio/padPresets';
import {
  ROUTING_SOURCE_REGISTRY,
  routingSourceIsEnabled,
  type RoutingRowId,
} from './routing/routingSourceRegistry';
import type { SliderMode, SliderState } from './state';

/**
 * Runtime modulation keeps its UI metadata even when a source is muted.  This
 * predicate only answers whether the product runtime should own a registration
 * for the key right now.
 */
export type RuntimeModulationState = Partial<SliderState> & Record<string, unknown>;

export type RuntimeRange = { min: number; max: number };

/** Select registrations without mutating the caller's slider metadata. */
export function selectEligibleRuntimeRanges<T extends RuntimeRange>(
  ranges: Partial<Record<string, T>>,
  sliderModes: Record<string, SliderMode>,
  mode: SliderMode,
  isEligible: (key: string) => boolean,
  supportsRangeKey: (key: string) => boolean = () => true,
): Partial<Record<string, T>> {
  const selected: Partial<Record<string, T>> = {};
  for (const [key, range] of Object.entries(ranges)) {
    if (!range || sliderModes[key] !== mode || !isEligible(key) || !supportsRangeKey(key)) continue;
    selected[key] = range;
  }
  return selected;
}

const routingKeyOwners = new Map<string, RoutingRowId[]>();
for (const source of ROUTING_SOURCE_REGISTRY) {
  const keys = [source.levelKey, ...Object.values(source.sends)];
  for (const key of keys) {
    if (!key) continue;
    const owners = routingKeyOwners.get(String(key));
    if (owners) owners.push(source.id);
    else routingKeyOwners.set(String(key), [source.id]);
  }
}

const PAD1_PRESET_KEYS = new Set<string>(PAD_PRESET_PARAM_KEYS as readonly string[]);
const PAD1_ENVELOPE_KEYS = new Set(['synthAttack', 'synthDecay', 'synthSustain', 'synthHold', 'synthRelease']);

const WATER_LAYER_OWNERS: readonly {
  enabledKey: string;
  prefixes: readonly string[];
}[] = [
  { enabledKey: 'waterLayerHardDropsEnabled', prefixes: ['waterLayerHardDrops', 'waterHardDrop', 'waterDensityHard'] },
  { enabledKey: 'waterLayerWaterDropsEnabled', prefixes: ['waterLayerWaterDrops', 'waterWaterDrop', 'waterDensityWater'] },
  { enabledKey: 'waterLayerBubblingEnabled', prefixes: ['waterLayerBubbling', 'waterBubbling', 'waterDensityBubble'] },
  { enabledKey: 'waterLayerTurbulenceEnabled', prefixes: ['waterLayerTurbulence'] },
  { enabledKey: 'waterLayerChannelsEnabled', prefixes: ['waterLayerChannels', 'waterChannels'] },
  { enabledKey: 'waterLayerSurfEnabled', prefixes: ['waterLayerSurf', 'waterSurf'] },
];

function hasOwn(state: RuntimeModulationState, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, key);
}

/** Missing flags are treated as enabled for legacy/partial states. */
function flag(state: RuntimeModulationState, key: string): boolean {
  return !hasOwn(state, key) || state[key] !== false;
}

function sourcePresentInState(source: RoutingRowId, state: RuntimeModulationState): boolean {
  const entry = ROUTING_SOURCE_REGISTRY.find((candidate) => candidate.id === source);
  if (!entry) return false;
  return (entry.enabledKeys ?? []).some((key) => hasOwn(state, String(key)));
}

function sourceEnabled(source: RoutingRowId, state: RuntimeModulationState): boolean {
  // Keep this helper useful for focused tests and partially hydrated presets:
  // if no owner flag is present, do not reject an otherwise valid range key.
  if (!sourcePresentInState(source, state)) return true;
  return routingSourceIsEnabled(source, state as SliderState);
}

function addOwner(owners: Set<RoutingRowId>, source: RoutingRowId): void {
  owners.add(source);
}

/**
 * Return whether a walk/sample-hold range should be registered in the product
 * runtime.  Ownership is intentionally inferred from the existing routing
 * registry and stable key namespaces instead of maintaining a second key list.
 */
export function isRuntimeModulationKeyEligible(
  key: string,
  state: RuntimeModulationState,
): boolean {
  const owners = new Set<RoutingRowId>(routingKeyOwners.get(key) ?? []);

  // Explicit source namespaces cover source-local controls (not just matrix
  // sends) while the routing registry above covers shared level/send keys.
  if (key.startsWith('pad2')) addOwner(owners, 'pad2');
  else if (key.startsWith('pad') || PAD1_PRESET_KEYS.has(key) || PAD1_ENVELOPE_KEYS.has(key)) addOwner(owners, 'pad1');
  if (key.startsWith('lead2')) addOwner(owners, 'lead2');
  else if (key.startsWith('lead')) addOwner(owners, 'lead1');
  if (key.startsWith('sample1')) addOwner(owners, 'sample1');
  if (key.startsWith('sample2')) addOwner(owners, 'sample2');
  if (key.startsWith('ocean')) addOwner(owners, 'waves');
  if (key.startsWith('piano') && !flag(state, 'pianoEnabled')) return false;
  // These are global Delay A note-division controls despite their legacy
  // `drumDelay...` names; they must not be gated by the Drums source.
  const isGlobalDrumDelayNote = key === 'drumDelayNoteL' || key === 'drumDelayNoteR';
  if (key.startsWith('drum') && !isGlobalDrumDelayNote) addOwner(owners, 'drums');
  if (key.startsWith('granularDelay')) addOwner(owners, 'delayBOut');
  else if (key.startsWith('granular')) addOwner(owners, 'granular');
  if (key.startsWith('delayA') || isGlobalDrumDelayNote) addOwner(owners, 'delayAOut');
  if (key.startsWith('delayB')) addOwner(owners, 'delayBOut');

  // A few reverb controls use historical names without the `reverb` prefix.
  if (key.startsWith('reverb') || ['predelay', 'damping', 'width'].includes(key)) addOwner(owners, 'reverb');
  if (key.startsWith('degrade') || key.startsWith('drift') || key.startsWith('erosion') || key.startsWith('dynamicsSaturation')) {
    addOwner(owners, 'degrade');
  }

  // Canonical Nature slots have a master plus per-slot owner. Legacy names are
  // retained as child flags for old presets and migrated content.
  const natureSlotMatch = /^nature([1-4])/.exec(key);
  if (natureSlotMatch) {
    const slot = Number(natureSlotMatch[1]);
    const slotKeys = NATURE_SLOT_KEYS[slot - 1];
    if (slotKeys) {
      if (!flag(state, 'natureMasterEnabled') || !flag(state, slotKeys.enabledKey)) return false;
    }
  } else if (key.startsWith('nature')) {
    addOwner(owners, 'nature');
  }
  if (key.startsWith('birds')) {
    if (!flag(state, 'natureMasterEnabled') || !flag(state, key.startsWith('birds2') ? 'birds2Enabled' : 'birdsEnabled')) return false;
  }
  if (key.startsWith('frogs')) {
    if (!flag(state, 'natureMasterEnabled') || !flag(state, 'frogsEnabled')) return false;
  }

  // Insects have one family master and two independently selectable children.
  const sharedInsectsKey = key === 'insectsSharedLevel' || key === 'insectsReverbSend';
  if (key.startsWith('insects2')) {
    if (!flag(state, 'insectsMasterEnabled') || !flag(state, 'insects2Enabled')) return false;
  } else if (key.startsWith('insects') && !sharedInsectsKey) {
    if (!flag(state, 'insectsMasterEnabled') || !flag(state, 'insectsEnabled')) return false;
  } else if (sharedInsectsKey) {
    if (!flag(state, 'insectsMasterEnabled')) return false;
  } else if (key.startsWith('insDelay')) {
    addOwner(owners, 'insects');
  }

  // Water has explicit child booleans in the product state.  Keep the parent
  // gate separate so disabling one layer does not discard the saved range.
  if (key.startsWith('water')) {
    if (!flag(state, 'waterEnabled')) return false;
    const layerOwner = WATER_LAYER_OWNERS.find(({ prefixes }) => prefixes.some((prefix) => key.startsWith(prefix)));
    if (layerOwner && !flag(state, layerOwner.enabledKey)) return false;
  }

  for (const owner of owners) {
    if (!sourceEnabled(owner, state)) return false;
  }
  return true;
}
