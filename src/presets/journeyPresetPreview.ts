import type { DiamondPosition, JourneyConfig } from '../audio/journeyTypes';
import type { JourneyPresetPreview } from './types';

const POSITION_ORDER: DiamondPosition[] = ['center', 'top', 'right', 'bottom', 'left'];
const POSITION_SET = new Set<DiamondPosition>(POSITION_ORDER);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDiamondPosition(value: unknown): value is DiamondPosition {
  return typeof value === 'string' && POSITION_SET.has(value as DiamondPosition);
}

function sortByPosition<T extends { position: DiamondPosition }>(items: T[]): T[] {
  return [...items].sort((left, right) => POSITION_ORDER.indexOf(left.position) - POSITION_ORDER.indexOf(right.position));
}

export function buildJourneyPresetPreview(config: JourneyConfig | null | undefined): JourneyPresetPreview | undefined {
  if (!config) return undefined;

  const nodeByPosition = new Map<DiamondPosition, { position: DiamondPosition; filled: boolean }>();
  const positionById = new Map<string, DiamondPosition>();

  for (const node of config.nodes) {
    if (!POSITION_SET.has(node.position)) continue;
    positionById.set(node.id, node.position);
    const filled = node.position === 'center'
      || Boolean(node.presetName && node.presetId && node.presetId !== '__CENTER__');
    const existing = nodeByPosition.get(node.position);
    nodeByPosition.set(node.position, {
      position: node.position,
      filled: Boolean(existing?.filled || filled),
    });
  }

  const connections = config.connections.flatMap((connection) => {
    const from = positionById.get(connection.fromNodeId);
    const to = positionById.get(connection.toNodeId);
    if (!from || !to) return [];
    if (from !== to) {
      nodeByPosition.set(from, nodeByPosition.get(from) ?? { position: from, filled: from === 'center' });
      nodeByPosition.set(to, nodeByPosition.get(to) ?? { position: to, filled: to === 'center' });
    }
    return [{ from, to }];
  });

  const nodes = sortByPosition([...nodeByPosition.values()]);
  if (!nodes.length && !connections.length) return undefined;

  return {
    nodes,
    connections,
  };
}

export function normalizeJourneyPresetPreview(value: unknown): JourneyPresetPreview | undefined {
  if (!isPlainObject(value)) return undefined;

  const nodeByPosition = new Map<DiamondPosition, { position: DiamondPosition; filled: boolean }>();
  if (Array.isArray(value.nodes)) {
    for (const rawNode of value.nodes) {
      if (!isPlainObject(rawNode) || !isDiamondPosition(rawNode.position)) continue;
      const existing = nodeByPosition.get(rawNode.position);
      nodeByPosition.set(rawNode.position, {
        position: rawNode.position,
        filled: Boolean(existing?.filled || rawNode.filled),
      });
    }
  }

  const connections = Array.isArray(value.connections)
    ? value.connections.flatMap((rawConnection) => {
      if (!isPlainObject(rawConnection)) return [];
      if (!isDiamondPosition(rawConnection.from) || !isDiamondPosition(rawConnection.to)) return [];
      return [{ from: rawConnection.from, to: rawConnection.to }];
    })
    : [];

  const nodes = sortByPosition([...nodeByPosition.values()]);
  if (!nodes.length && !connections.length) return undefined;

  return { nodes, connections };
}
