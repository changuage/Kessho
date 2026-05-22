import {
  createDiamondJourney,
  generateJourneyId,
  type DiamondPosition,
  type JourneyConfig,
  type JourneyConnection,
  type JourneyNode,
} from '../audio/journeyTypes';
import type { PresetRef } from './types';

export const JOURNEY_PRESET_FORMAT_VERSION = 1;
export const JOURNEY_STATE_PRESET_SCOPE = 'global';

const DIAMOND_POSITIONS: DiamondPosition[] = ['left', 'top', 'right', 'bottom', 'center'];
const PRESET_NODE_POSITIONS: DiamondPosition[] = ['left', 'top', 'right', 'bottom'];
const CENTER_PRESET_ID = '__CENTER__';

export interface SerializedJourneyNode {
  position: DiamondPosition;
  phraseLength: number;
  phraseLengthMax?: number;
  color: string;
  refSlot?: string;
  presetId?: string;
  presetName?: string;
}

export interface SerializedJourneyConnection {
  fromPosition: DiamondPosition;
  toPosition: DiamondPosition;
  morphDuration: number;
  morphDurationMax?: number;
  probability: number;
}

export interface SerializedJourneyPresetData {
  formatVersion: typeof JOURNEY_PRESET_FORMAT_VERSION;
  name: string;
  autoAdvance: boolean;
  loopEnabled: boolean;
  nodes: SerializedJourneyNode[];
  connections: SerializedJourneyConnection[];
}

export interface JourneyValidationResult {
  playable: boolean;
  issues: string[];
}

export function getJourneyNodeRefSlot(position: DiamondPosition): string {
  return `node:${position}`;
}

export function getJourneyNodePositionFromRefSlot(slot: string): DiamondPosition | null {
  if (!slot.startsWith('node:')) return null;
  const position = slot.slice('node:'.length);
  return isDiamondPosition(position) ? position : null;
}

function isDiamondPosition(value: string): value is DiamondPosition {
  return DIAMOND_POSITIONS.includes(value as DiamondPosition);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

function normalizeProbability(value: unknown): number {
  if (!isFiniteNumber(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function hasPresetRef(node: JourneyNode): boolean {
  return Boolean(node.presetId && node.presetId !== CENTER_PRESET_ID && node.presetName);
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function serializedNodeMatchesStatePreset(
  node: Partial<SerializedJourneyNode>,
  deletedPreset: { id?: string; name: string },
): boolean {
  if (node.position === 'center') return false;
  if (deletedPreset.id && node.presetId === deletedPreset.id) return true;
  return Boolean(node.presetName && normalizedName(node.presetName) === normalizedName(deletedPreset.name));
}

function clonePlainRecord<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON clone for older or cross-realm objects.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function encodeJourneyPresetData(config: JourneyConfig): SerializedJourneyPresetData {
  const nodes = config.nodes
    .filter((node) => DIAMOND_POSITIONS.includes(node.position))
    .map((node): SerializedJourneyNode => {
      const serialized: SerializedJourneyNode = {
        position: node.position,
        phraseLength: normalizePositiveNumber(node.phraseLength, node.position === 'center' ? 0 : 1),
        color: node.color || (node.position === 'center' ? '#4fc3f7' : '#444'),
      };
      if (isFiniteNumber(node.phraseLengthMax)) {
        serialized.phraseLengthMax = Math.max(serialized.phraseLength, node.phraseLengthMax);
      }
      if (hasPresetRef(node)) {
        serialized.refSlot = getJourneyNodeRefSlot(node.position);
        serialized.presetName = node.presetName;
        if (node.presetId !== node.presetName) {
          serialized.presetId = node.presetId;
        }
      }
      return serialized;
    });

  const nodeById = new Map(config.nodes.map((node) => [node.id, node]));
  const connections = config.connections.flatMap((connection): SerializedJourneyConnection[] => {
    const fromNode = nodeById.get(connection.fromNodeId);
    const toNode = nodeById.get(connection.toNodeId);
    if (!fromNode || !toNode) return [];
    if (!DIAMOND_POSITIONS.includes(fromNode.position) || !DIAMOND_POSITIONS.includes(toNode.position)) return [];
    const serialized: SerializedJourneyConnection = {
      fromPosition: fromNode.position,
      toPosition: toNode.position,
      morphDuration: normalizePositiveNumber(connection.morphDuration, 0.5),
      probability: normalizeProbability(connection.probability),
    };
    if (isFiniteNumber(connection.morphDurationMax)) {
      serialized.morphDurationMax = Math.max(serialized.morphDuration, connection.morphDurationMax);
    }
    return [serialized];
  });

  return {
    formatVersion: JOURNEY_PRESET_FORMAT_VERSION,
    name: config.name,
    autoAdvance: config.autoAdvance,
    loopEnabled: config.loopEnabled,
    nodes,
    connections,
  };
}

export function buildJourneyRefsFromConfig(
  config: JourneyConfig,
  resolveRef?: (node: JourneyNode) => PresetRef | null | undefined,
): Record<string, PresetRef> | undefined {
  const refs: Record<string, PresetRef> = {};
  for (const node of config.nodes) {
    if (!hasPresetRef(node)) continue;
    const resolved = resolveRef?.(node);
    refs[getJourneyNodeRefSlot(node.position)] = {
      ...(resolved ?? {}),
      name: resolved?.name ?? node.presetName,
      version: resolved?.version ?? 'latest',
      scope: resolved?.scope ?? JOURNEY_STATE_PRESET_SCOPE,
    };
  }
  return Object.keys(refs).length ? refs : undefined;
}

export function decodeJourneyPresetData(
  data: Record<string, unknown>,
  refs?: Record<string, PresetRef>,
  fallbackName = 'Journey',
): JourneyConfig {
  const record = data as Partial<SerializedJourneyPresetData>;
  const base = createDiamondJourney([]);
  const sourceNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const sourceConnections = Array.isArray(record.connections) ? record.connections : [];
  const nodeOverrides = new Map<DiamondPosition, SerializedJourneyNode>();

  for (const rawNode of sourceNodes) {
    if (!rawNode || typeof rawNode !== 'object') continue;
    const node = rawNode as Partial<SerializedJourneyNode>;
    if (!node.position || !DIAMOND_POSITIONS.includes(node.position)) continue;
    nodeOverrides.set(node.position, clonePlainRecord(node as SerializedJourneyNode));
  }

  const nodes = base.nodes.map((baseNode): JourneyNode => {
    const override = nodeOverrides.get(baseNode.position);
    const refSlot = override?.refSlot ?? getJourneyNodeRefSlot(baseNode.position);
    const ref = refs?.[refSlot];
    const isCenter = baseNode.position === 'center';
    const fallbackPresetName = !isCenter && typeof override?.presetName === 'string' ? override.presetName : '';
    const fallbackPresetId = !isCenter && typeof override?.presetId === 'string'
      ? override.presetId
      : fallbackPresetName;
    return {
      ...baseNode,
      id: generateJourneyId(),
      presetId: isCenter ? CENTER_PRESET_ID : (ref?.id ?? ref?.name ?? fallbackPresetId ?? ''),
      presetName: isCenter ? 'START/END' : (ref?.name ?? fallbackPresetName),
      phraseLength: normalizePositiveNumber(override?.phraseLength, isCenter ? 0 : 1),
      phraseLengthMax: isFiniteNumber(override?.phraseLengthMax)
        ? Math.max(normalizePositiveNumber(override?.phraseLength, isCenter ? 0 : 1), override.phraseLengthMax)
        : undefined,
      color: override?.color || baseNode.color,
    };
  });

  const nodeByPosition = new Map(nodes.map((node) => [node.position, node]));
  const connections = sourceConnections.flatMap((rawConnection): JourneyConnection[] => {
    if (!rawConnection || typeof rawConnection !== 'object') return [];
    const connection = rawConnection as Partial<SerializedJourneyConnection>;
    if (!connection.fromPosition || !connection.toPosition) return [];
    if (!DIAMOND_POSITIONS.includes(connection.fromPosition) || !DIAMOND_POSITIONS.includes(connection.toPosition)) return [];
    const fromNode = nodeByPosition.get(connection.fromPosition);
    const toNode = nodeByPosition.get(connection.toPosition);
    if (!fromNode || !toNode) return [];
    const morphDuration = normalizePositiveNumber(connection.morphDuration, 0.5);
    return [{
      id: generateJourneyId(),
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      morphDuration,
      morphDurationMax: isFiniteNumber(connection.morphDurationMax)
        ? Math.max(morphDuration, connection.morphDurationMax)
        : undefined,
      probability: normalizeProbability(connection.probability),
    }];
  });

  return {
    id: generateJourneyId(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : fallbackName,
    nodes,
    connections,
    autoAdvance: typeof record.autoAdvance === 'boolean' ? record.autoAdvance : true,
    loopEnabled: typeof record.loopEnabled === 'boolean' ? record.loopEnabled : true,
  };
}

export function validateJourneyConfig(config: JourneyConfig | null): JourneyValidationResult {
  if (!config) {
    return { playable: false, issues: ['No journey loaded'] };
  }

  const issues: string[] = [];
  const nodeById = new Map(config.nodes.map((node) => [node.id, node]));
  const filledNodes = config.nodes.filter((node) => node.position !== 'center' && hasPresetRef(node));
  if (filledNodes.length === 0) {
    issues.push('No state presets assigned');
  }

  for (const connection of config.connections) {
    const fromNode = nodeById.get(connection.fromNodeId);
    const toNode = nodeById.get(connection.toNodeId);
    if (!fromNode || !toNode) {
      issues.push('Connection points to a missing node');
      continue;
    }
    if (fromNode.position !== 'center' && !hasPresetRef(fromNode)) {
      issues.push('Connection starts from an empty node');
    }
    if (toNode.position !== 'center' && !hasPresetRef(toNode)) {
      issues.push('Connection points to an empty node');
    }
  }

  return {
    playable: issues.length === 0,
    issues: [...new Set(issues)],
  };
}

export function journeyDataReferencesStatePreset(
  data: Record<string, unknown>,
  refs: Record<string, PresetRef> | undefined,
  statePreset: { id?: string; name: string },
): boolean {
  if (refs) {
    for (const ref of Object.values(refs)) {
      const idMatches = statePreset.id && ref.id === statePreset.id;
      const nameMatches = normalizedName(ref.name) === normalizedName(statePreset.name);
      if (idMatches || nameMatches) return true;
    }
  }

  const nodes = (data as Partial<SerializedJourneyPresetData>).nodes;
  if (!Array.isArray(nodes)) return false;
  return nodes.some((rawNode) => (
    rawNode &&
    typeof rawNode === 'object' &&
    serializedNodeMatchesStatePreset(rawNode as Partial<SerializedJourneyNode>, statePreset)
  ));
}

export function removeStatePresetRefFromJourneyData(
  data: Record<string, unknown>,
  refs: Record<string, PresetRef> | undefined,
  deletedPreset: { id?: string; name: string },
): { data: Record<string, unknown>; refs?: Record<string, PresetRef>; changed: boolean } {
  const encoded = clonePlainRecord(data) as unknown as SerializedJourneyPresetData;
  const nextRefs: Record<string, PresetRef> = refs ? clonePlainRecord(refs) : {};
  const deletedSlots = new Set<string>();

  for (const [slot, ref] of Object.entries(nextRefs)) {
    const idMatches = deletedPreset.id && ref.id === deletedPreset.id;
    const nameMatches = normalizedName(ref.name) === normalizedName(deletedPreset.name);
    if (idMatches || nameMatches) {
      deletedSlots.add(slot);
      delete nextRefs[slot];
    }
  }

  if (Array.isArray(encoded.nodes)) {
    for (const node of encoded.nodes) {
      if (!serializedNodeMatchesStatePreset(node, deletedPreset)) continue;
      const slot = node.refSlot ?? getJourneyNodeRefSlot(node.position);
      deletedSlots.add(slot);
      delete nextRefs[slot];
    }
  }

  if (deletedSlots.size === 0) {
    return { data, refs, changed: false };
  }

  const deletedPositions = new Set<DiamondPosition>();
  for (const slot of deletedSlots) {
    const position = getJourneyNodePositionFromRefSlot(slot);
    if (position) deletedPositions.add(position);
  }

  const nodes = Array.isArray(encoded.nodes)
    ? encoded.nodes.map((node) => {
      const slot = node.refSlot ?? getJourneyNodeRefSlot(node.position);
      if (deletedSlots.has(slot) || serializedNodeMatchesStatePreset(node, deletedPreset)) {
        const nextNode = { ...node };
        delete nextNode.refSlot;
        delete nextNode.presetId;
        delete nextNode.presetName;
        nextNode.color = '#444';
        return nextNode;
      }
      return node;
    })
    : [];

  const connections = Array.isArray(encoded.connections)
    ? encoded.connections.filter((connection) => (
      !deletedPositions.has(connection.fromPosition) &&
      !deletedPositions.has(connection.toPosition)
    ))
    : [];

  return {
    data: {
      ...encoded,
      nodes,
      connections,
    } as unknown as Record<string, unknown>,
    refs: Object.keys(nextRefs).length ? nextRefs : undefined,
    changed: true,
  };
}

export function getFilledJourneyPositions(config: JourneyConfig | null): DiamondPosition[] {
  if (!config) return [];
  return PRESET_NODE_POSITIONS.filter((position) => {
    const node = config.nodes.find((candidate) => candidate.position === position);
    return Boolean(node && hasPresetRef(node));
  });
}
