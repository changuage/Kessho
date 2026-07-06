import {
  normalizeRoutingMuteGroupScenePayload,
  normalizeRoutingMuteGroupSceneRefSlot,
  normalizeRoutingMuteGroupSlot,
  normalizeRoutingMuteGroupsState,
  ROUTING_MUTE_GROUP_SCHEMA_VERSION,
  routingMuteGroupSlotFromScenePayload,
  routingMuteGroupSlotScenePayload,
  type RoutingMuteGroupScenePayload,
  type RoutingMuteGroupSceneRefSlot,
  type RoutingMuteGroupsState,
} from '../ui/routing/routingMuteGroups';
import {
  canonicalizeRecord,
  hashCanonicalJson,
} from './presetStorageV2';
import type {
  PresetLevel,
  PresetRecoveryWarning,
  PresetVersionMetadata,
} from './types';

export const ROUTING_MUTE_GROUP_SCENE_DERIVED_TYPE: PresetLevel = 'journey';
export const ROUTING_MUTE_GROUP_SCENE_DERIVED_SCOPE = 'routingMuteScene';
export const ROUTING_MUTE_GROUP_SCENE_REF_PREFIX = 'routingMuteScene:';

export interface RoutingMuteGroupSceneStorageItem {
  slotIndex: number;
  refSlot: string;
  hash: string;
  scene: RoutingMuteGroupScenePayload;
}

export interface RoutingMuteGroupSceneLookupResult {
  targetFound: boolean;
  payload: unknown;
}

export interface RoutingMuteGroupMetadataStoragePlan {
  metadata?: PresetVersionMetadata;
  scenes: RoutingMuteGroupSceneStorageItem[];
}

export function routingMuteGroupSceneRefSlot(slotIndex: number): string {
  return `${ROUTING_MUTE_GROUP_SCENE_REF_PREFIX}${slotIndex}`;
}

export function isRoutingMuteGroupSceneRefSlotName(slot: string): boolean {
  if (!slot.startsWith(ROUTING_MUTE_GROUP_SCENE_REF_PREFIX)) return false;
  const indexText = slot.slice(ROUTING_MUTE_GROUP_SCENE_REF_PREFIX.length);
  return String(Number(indexText)) === indexText && Number(indexText) >= 0;
}

function compactSceneRefSlot(
  hash: string,
  slot: NonNullable<RoutingMuteGroupsState['slots'][number]>,
): RoutingMuteGroupSceneRefSlot {
  return {
    sceneHash: hash,
    ...(slot.phraseRange ? { phraseRange: slot.phraseRange } : {}),
  };
}

export async function planRoutingMuteGroupMetadataStorage(
  metadata: PresetVersionMetadata | undefined,
): Promise<RoutingMuteGroupMetadataStoragePlan> {
  if (!metadata?.routingMuteGroups) return { metadata, scenes: [] };

  const groups = normalizeRoutingMuteGroupsState(metadata.routingMuteGroups);
  const compactSlots: (RoutingMuteGroupSceneRefSlot | null)[] = [];
  const scenes: RoutingMuteGroupSceneStorageItem[] = [];

  for (let index = 0; index < groups.slots.length; index += 1) {
    const slot = groups.slots[index];
    if (!slot) {
      compactSlots[index] = null;
      continue;
    }

    const scene = routingMuteGroupSlotScenePayload(slot);
    if (!scene) {
      compactSlots[index] = null;
      continue;
    }

    const sceneRecord = canonicalizeRecord(scene as unknown as Record<string, unknown>) as unknown as RoutingMuteGroupScenePayload;
    const hash = await hashCanonicalJson(sceneRecord);
    scenes.push({
      slotIndex: index,
      refSlot: routingMuteGroupSceneRefSlot(index),
      hash,
      scene: sceneRecord,
    });
    compactSlots[index] = compactSceneRefSlot(hash, slot);
  }

  const compactRoutingMuteGroups = {
    schemaVersion: ROUTING_MUTE_GROUP_SCHEMA_VERSION,
    slots: compactSlots,
    random: groups.random,
  };

  return {
    metadata: {
      ...metadata,
      routingMuteGroups: compactRoutingMuteGroups as unknown as RoutingMuteGroupsState,
    },
    scenes,
  };
}

export function reconstructRoutingMuteGroupMetadata(
  metadata: PresetVersionMetadata | undefined,
  lookupScenePayload: (refSlot: string) => RoutingMuteGroupSceneLookupResult,
  options: {
    recoveryWarnings?: PresetRecoveryWarning[];
    version?: number;
  } = {},
): PresetVersionMetadata | undefined {
  if (!metadata?.routingMuteGroups) return metadata;

  const rawGroups = metadata.routingMuteGroups;
  const rawSlots = Array.isArray(rawGroups)
    ? rawGroups
    : Array.isArray(rawGroups.slots)
      ? rawGroups.slots
      : [];
  const fullGroups = normalizeRoutingMuteGroupsState(rawGroups);
  const slots = fullGroups.slots.map((slot, index) => {
    if (slot) return slot;

    const rawSlot = rawSlots[index];
    const inlineSlot = normalizeRoutingMuteGroupSlot(rawSlot);
    if (inlineSlot) return inlineSlot;

    const sceneRef = normalizeRoutingMuteGroupSceneRefSlot(rawSlot);
    if (!sceneRef) return null;

    const refSlot = routingMuteGroupSceneRefSlot(index);
    const result = lookupScenePayload(refSlot);
    if (!result.targetFound) {
      options.recoveryWarnings?.push({
        slot: refSlot,
        reason: 'missing_child_preset',
        fallback: 'empty',
        version: options.version,
      });
      return null;
    }

    if (result.payload === undefined) {
      options.recoveryWarnings?.push({
        slot: refSlot,
        reason: 'missing_payload',
        fallback: 'empty',
        version: options.version,
      });
      return null;
    }

    const scene = normalizeRoutingMuteGroupScenePayload(result.payload);
    if (!scene) {
      options.recoveryWarnings?.push({
        slot: refSlot,
        reason: 'invalid_payload_shape',
        fallback: 'empty',
        version: options.version,
      });
      return null;
    }

    return routingMuteGroupSlotFromScenePayload(scene, {
      phraseRange: sceneRef.phraseRange,
    });
  });

  return {
    ...metadata,
    routingMuteGroups: {
      schemaVersion: ROUTING_MUTE_GROUP_SCHEMA_VERSION,
      slots,
      random: fullGroups.random,
    },
  };
}
