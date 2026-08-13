import {
  normalizeRoutingMuteGroupScenePayload,
  normalizeRoutingMuteGroupSceneRefSlot,
  normalizeRoutingMuteGroupSlot,
  normalizeRoutingMuteGroupsState,
  ROUTING_MUTE_GROUP_SCHEMA_VERSION,
  ROUTING_MUTE_GROUP_SLOT_COUNT,
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
import type { PresetRecoveryWarning, PresetVersionMetadata } from './types';

/** Legacy named-child slot prefix retained for read compatibility only. */
export const ROUTING_MUTE_GROUP_SCENE_REF_PREFIX = 'routingMuteScene:';
export const ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE = 'routingMuteScene' as const;
export const ROUTING_MUTE_GROUP_SCENE_CONTENT_SCHEMA_VERSION = 1 as const;
export const ROUTING_MUTE_GROUP_SCENE_CONTENT_REF_PREFIX = 'routing.mute-group.slot-';
export const ROUTING_MUTE_GROUP_SCENE_CONTENT_REF_SUFFIX = '.content';
const ROUTING_MUTE_GROUP_SCENE_CONTENT_REF_SLOT_PATTERN = /^routing\.mute-group\.slot-(\d+)\.content$/;

export interface RoutingMuteGroupSceneContentEnvelope {
  contentType: typeof ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE;
  schemaVersion: typeof ROUTING_MUTE_GROUP_SCENE_CONTENT_SCHEMA_VERSION;
  content: RoutingMuteGroupScenePayload;
}

export interface RoutingMuteGroupSceneStorageItem {
  slotIndex: number;
  refSlot: string;
  hash: string;
  scene: RoutingMuteGroupScenePayload;
  envelope: RoutingMuteGroupSceneContentEnvelope;
  contentType: typeof ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE;
}

export interface RoutingMuteGroupSceneLookupResult {
  targetFound: boolean;
  payload: unknown;
  /** Hash recorded by the direct content ref or legacy target row. */
  contentHash?: string;
  contentType?: string;
  source?: 'direct' | 'legacy';
}

export interface RoutingMuteGroupMetadataStoragePlan {
  metadata?: PresetVersionMetadata;
  scenes: RoutingMuteGroupSceneStorageItem[];
}

export function routingMuteGroupSceneRefSlot(slotIndex: number): string {
  return `${ROUTING_MUTE_GROUP_SCENE_CONTENT_REF_PREFIX}${slotIndex}${ROUTING_MUTE_GROUP_SCENE_CONTENT_REF_SUFFIX}`;
}

export function routingMuteGroupLegacySceneRefSlot(slotIndex: number): string {
  return `${ROUTING_MUTE_GROUP_SCENE_REF_PREFIX}${slotIndex}`;
}

export function isRoutingMuteGroupSceneRefSlotName(slot: string): boolean {
  if (isRoutingMuteGroupContentRefSlotName(slot)) return true;
  if (!slot.startsWith(ROUTING_MUTE_GROUP_SCENE_REF_PREFIX)) return false;
  const indexText = slot.slice(ROUTING_MUTE_GROUP_SCENE_REF_PREFIX.length);
  return String(Number(indexText)) === indexText && Number(indexText) >= 0;
}

export function isRoutingMuteGroupContentRefSlotName(slot: string): boolean {
  const match = ROUTING_MUTE_GROUP_SCENE_CONTENT_REF_SLOT_PATTERN.exec(slot);
  const slotIndex = Number(match?.[1] ?? -1);
  return slotIndex >= 0 && slotIndex < ROUTING_MUTE_GROUP_SLOT_COUNT;
}

export function createRoutingMuteGroupSceneContentEnvelope(
  scene: RoutingMuteGroupScenePayload,
): RoutingMuteGroupSceneContentEnvelope {
  return {
    contentType: ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE,
    schemaVersion: ROUTING_MUTE_GROUP_SCENE_CONTENT_SCHEMA_VERSION,
    content: scene,
  };
}

function normalizeRoutingMuteGroupSceneContentEnvelope(
  value: unknown,
): RoutingMuteGroupSceneContentEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<RoutingMuteGroupSceneContentEnvelope>;
  if (raw.contentType !== ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE
      || raw.schemaVersion !== ROUTING_MUTE_GROUP_SCENE_CONTENT_SCHEMA_VERSION) {
    return null;
  }
  const scene = normalizeRoutingMuteGroupScenePayload(raw.content);
  return scene ? createRoutingMuteGroupSceneContentEnvelope(scene) : null;
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
    const envelope = createRoutingMuteGroupSceneContentEnvelope(sceneRecord);
    const canonicalEnvelope = canonicalizeRecord(envelope as unknown as Record<string, unknown>) as unknown as RoutingMuteGroupSceneContentEnvelope;
    const hash = await hashCanonicalJson(canonicalEnvelope);
    scenes.push({
      slotIndex: index,
      refSlot: routingMuteGroupSceneRefSlot(index),
      hash,
      scene: sceneRecord,
      envelope: canonicalEnvelope,
      contentType: ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE,
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

    if (result.contentHash && result.contentHash !== sceneRef.sceneHash) {
      options.recoveryWarnings?.push({
        slot: refSlot,
        reason: 'hash_mismatch',
        fallback: 'empty',
        version: options.version,
      });
      return null;
    }

    const typedEnvelope = normalizeRoutingMuteGroupSceneContentEnvelope(result.payload);
    if (result.source === 'direct' || result.contentType === ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE) {
      if (!typedEnvelope || result.contentType !== ROUTING_MUTE_GROUP_SCENE_CONTENT_TYPE) {
        options.recoveryWarnings?.push({
          slot: refSlot,
          reason: 'invalid_payload_shape',
          fallback: 'empty',
          version: options.version,
        });
        return null;
      }
    }

    const scene = normalizeRoutingMuteGroupScenePayload(typedEnvelope?.content ?? result.payload);
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
