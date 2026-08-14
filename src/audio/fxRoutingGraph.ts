export const FX_ROUTING_NODE_IDS = [
  'delayA',
  'delayB',
  'granular',
  'degrade',
  'freeze',
  'reverb',
  'eq1',
  'eq2',
  'sidechain',
  'creativeSaturation',
] as const;

export type FxRoutingNodeId = (typeof FX_ROUTING_NODE_IDS)[number];

export const fxRouteRuntimeKey = (from: FxRoutingNodeId, to: FxRoutingNodeId): string =>
  `fx-route:${from}>${to}`;

export function fxRouteRuntimePositions(
  graph: FxRoutingGraphState | undefined,
  effectiveAmounts: readonly number[] | undefined,
): Record<string, number> {
  if (!graph || !effectiveAmounts) return {};
  const positions: Record<string, number> = {};
  for (const edge of graph.edges) {
    if ((edge.mode ?? 'single') === 'single' || edge.min == null || edge.max == null) continue;
    const from = FX_ROUTING_NODE_IDS.indexOf(edge.from);
    const to = FX_ROUTING_NODE_IDS.indexOf(edge.to);
    const effective = effectiveAmounts[from * FX_ROUTING_NODE_IDS.length + to];
    const span = edge.max - edge.min;
    if (!Number.isFinite(effective) || span <= 0) continue;
    positions[fxRouteRuntimeKey(edge.from, edge.to)] = Math.max(0, Math.min(1, (effective! - edge.min) / span));
  }
  return positions;
}
export function resolveFxRoutingHorizontalBounds(width: number): {
  left: number;
  right: number;
  masterX: number;
} {
  const left = Math.max(285, width * 0.28);
  return {
    left,
    right: Math.max(left, Math.min(width * 0.72, width - 330)),
    masterX: width - 100,
  };
}

export function resolveFxRoutingFanOffsets(count: number, maxSpread: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => (
    -maxSpread + (index * maxSpread * 2) / (count - 1)
  ));
}

export function resolveFxRoutingApproachFanOffsets(
  items: readonly { id: string; from: FxRoutingWirePoint }[],
  to: FxRoutingWirePoint,
  maxSpread: number,
  vertical = false,
): Map<string, number> {
  const angle = ({ from }: (typeof items)[number]) => vertical
    ? Math.atan2(from.x - to.x, Math.abs(to.y - from.y))
    : Math.atan2(from.y - to.y, Math.abs(to.x - from.x));
  const sorted = [...items].sort((a, b) => angle(a) - angle(b) || a.id.localeCompare(b.id));
  const offsets = resolveFxRoutingFanOffsets(sorted.length, maxSpread);
  return new Map(sorted.map((item, index) => [item.id, offsets[index]!]));
}

export function resolveFxRoutingRoutedFanOffsets(
  items: readonly {
    id: string;
    originPosition: number;
    destinationPosition: number;
    laneOffset: number;
  }[],
  maxSpread: number,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => {
    const aDeparture = Math.abs(a.laneOffset) > 0.001
      ? a.originPosition + a.laneOffset
      : a.destinationPosition;
    const bDeparture = Math.abs(b.laneOffset) > 0.001
      ? b.originPosition + b.laneOffset
      : b.destinationPosition;
    return aDeparture - bDeparture
      || a.destinationPosition - b.destinationPosition
      || a.id.localeCompare(b.id);
  });
  const offsets = resolveFxRoutingFanOffsets(sorted.length, maxSpread);
  return new Map(sorted.map((item, index) => [item.id, offsets[index]!]));
}

export function resolveFxRoutingNodeRanks(
  nodes: readonly FxRoutingNodeId[],
  edges: readonly Pick<FxRoutingConnection, 'from' | 'to'>[],
  sourceRanks: Partial<Record<FxRoutingNodeId, readonly number[]>>,
  sourceLinks: readonly { rank: number; targets: readonly FxRoutingNodeId[] }[] = [],
): Partial<Record<FxRoutingNodeId, number>> {
  const ranks: Partial<Record<FxRoutingNodeId, number>> = {};
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const node of nodes) {
      const influences = [
        ...(sourceRanks[node] ?? []),
        ...edges.filter((edge) => edge.to === node).flatMap((edge) => {
          const rank = ranks[edge.from];
          return rank == null ? [] : [rank];
        }),
      ];
      if (influences.length === 0) continue;
      const next = influences.reduce((sum, rank) => sum + rank, 0) / influences.length;
      if (ranks[node] !== next) { ranks[node] = next; changed = true; }
    }
    if (!changed) break;
  }
  const reaches = (from: FxRoutingNodeId, to: FxRoutingNodeId): boolean => {
    const pending = [from];
    const visited = new Set<FxRoutingNodeId>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === to) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges) if (edge.from === current) pending.push(edge.to);
    }
    return false;
  };
  const displaced = new Set<FxRoutingNodeId>();
  const displace = (node: FxRoutingNodeId, fallbackRank: number) => {
    if (displaced.has(node)) return;
    const rank = ranks[node] ?? fallbackRank;
    ranks[node] = Math.max(0.08, Math.min(0.92, rank + (rank <= 0.5 ? -0.28 : 0.28)));
    displaced.add(node);
  };
  for (const link of sourceLinks) {
    for (const node of link.targets) {
      if (!link.targets.some((target) => target !== node && reaches(node, target))) continue;
      displace(node, link.rank);
    }
    for (const target of link.targets) {
      for (const node of nodes) {
        if (node !== target && !link.targets.includes(node) && reaches(node, target)) displace(node, link.rank);
      }
    }
  }
  return ranks;
}

export type FxRoutingWirePoint = { x: number; y: number };
export type FxRoutingWireObstacle = FxRoutingWirePoint & { halfWidth: number; halfHeight: number };

export function sampleFxRoutingVerticalWire(
  from: FxRoutingWirePoint,
  to: FxRoutingWirePoint,
  laneOffset: number,
  steps = 16,
): FxRoutingWirePoint[] {
  const bend = Math.max(42, Math.abs(to.y - from.y) * 0.42);
  const controlA = { x: from.x + laneOffset, y: from.y + bend };
  const controlB = { x: to.x + laneOffset * 0.2, y: to.y - bend };
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const u = 1 - t;
    return {
      x: u ** 3 * from.x + 3 * u ** 2 * t * controlA.x + 3 * u * t ** 2 * controlB.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u ** 2 * t * controlA.y + 3 * u * t ** 2 * controlB.y + t ** 3 * to.y,
    };
  });
}

export function sampleFxRoutingHorizontalWire(
  from: FxRoutingWirePoint,
  to: FxRoutingWirePoint,
  laneOffset: number,
  steps = 16,
): FxRoutingWirePoint[] {
  return sampleFxRoutingVerticalWire(
    { x: from.y, y: from.x },
    { x: to.y, y: to.x },
    laneOffset,
    steps,
  ).map(({ x, y }) => ({ x: y, y: x }));
}

const wireSegmentsCross = (
  a: FxRoutingWirePoint,
  b: FxRoutingWirePoint,
  c: FxRoutingWirePoint,
  d: FxRoutingWirePoint,
): boolean => {
  const direction = (p: FxRoutingWirePoint, q: FxRoutingWirePoint, r: FxRoutingWirePoint) =>
    (r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x);
  const abC = direction(a, b, c);
  const abD = direction(a, b, d);
  const cdA = direction(c, d, a);
  const cdB = direction(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
};

export function resolveFxRoutingVerticalLaneOffset({
  from,
  to,
  maxOffset,
  preferredSide,
  obstacles,
  occupiedPaths,
}: {
  from: FxRoutingWirePoint;
  to: FxRoutingWirePoint;
  maxOffset: number;
  preferredSide: -1 | 1;
  obstacles: readonly FxRoutingWireObstacle[];
  occupiedPaths: readonly (readonly FxRoutingWirePoint[])[];
}): number {
  const candidates = [preferredSide * maxOffset, 0, -preferredSide * maxOffset, preferredSide * maxOffset * 0.55];
  let best = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const path = sampleFxRoutingVerticalWire(from, to, candidate);
    let score = Math.abs(candidate) / Math.max(1, maxOffset);
    for (const point of path.slice(2, -2)) {
      for (const obstacle of obstacles) {
        if (Math.abs(point.x - obstacle.x) <= obstacle.halfWidth + 8
          && Math.abs(point.y - obstacle.y) <= obstacle.halfHeight + 8) score += 1200;
      }
    }
    for (let index = 2; index < path.length - 2; index += 1) {
      for (const occupied of occupiedPaths) {
        for (let other = 1; other < occupied.length; other += 1) {
          if (wireSegmentsCross(path[index - 1]!, path[index]!, occupied[other - 1]!, occupied[other]!)) score += 400;
        }
      }
    }
    if (candidate === 0) score += 4;
    else if (Math.sign(candidate) !== preferredSide) score += 12;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function resolveFxRoutingHorizontalLaneOffset({
  from,
  to,
  maxOffset,
  preferredSide,
  obstacles,
  occupiedPaths,
}: {
  from: FxRoutingWirePoint;
  to: FxRoutingWirePoint;
  maxOffset: number;
  preferredSide: -1 | 1;
  obstacles: readonly FxRoutingWireObstacle[];
  occupiedPaths: readonly (readonly FxRoutingWirePoint[])[];
}): number {
  return resolveFxRoutingVerticalLaneOffset({
    from: { x: from.y, y: from.x },
    to: { x: to.y, y: to.x },
    maxOffset,
    preferredSide,
    obstacles: obstacles.map(({ x, y, halfWidth, halfHeight }) => ({
      x: y,
      y: x,
      halfWidth: halfHeight,
      halfHeight: halfWidth,
    })),
    occupiedPaths: occupiedPaths.map((path) => path.map(({ x, y }) => ({ x: y, y: x }))),
  });
}

export const FX_ROUTING_NODE_ROW_IDS = {
  delayA: 'delayAOut',
  delayB: 'delayBOut',
  granular: 'granular',
  degrade: 'degrade',
  freeze: 'freezeOut',
  reverb: 'reverb',
  eq1: 'eq1Out',
  eq2: 'eq2Out',
  sidechain: 'sidechainOut',
  creativeSaturation: 'saturationOut',
} as const satisfies Record<FxRoutingNodeId, string>;

export type FxRoutingRowId = (typeof FX_ROUTING_NODE_ROW_IDS)[FxRoutingNodeId];

export const FX_ROUTING_NODE_LEVEL_KEYS = {
  delayA: 'delayAMix',
  delayB: 'granularDelayMix',
  granular: 'granularLevel',
  degrade: 'degradeLevel',
  freeze: 'spectralFreezeMix',
  reverb: 'reverbLevel',
  eq1: 'dynamicsEq1Mix',
  eq2: 'dynamicsEq2Mix',
  sidechain: 'sidechainMix',
  creativeSaturation: 'dynamicsSaturationDrive',
} as const;

export const FX_ROUTING_NODE_LABELS: Record<FxRoutingNodeId, string> = {
  delayA: 'Delay A',
  delayB: 'Delay B',
  granular: 'Granular',
  degrade: 'Degrade',
  freeze: 'Freeze',
  reverb: 'Reverb',
  eq1: 'EQ 1',
  eq2: 'EQ 2',
  sidechain: 'Sidechain',
  creativeSaturation: 'Saturator',
};

export const FX_ROUTING_NODE_ACCENTS: Record<FxRoutingNodeId, string> = {
  delayA: '#32C8C8',
  delayB: '#32C7C7',
  granular: '#E8B44A',
  degrade: '#A980FF',
  freeze: '#8EB6D8',
  reverb: '#D49660',
  eq1: '#78A6C8',
  eq2: '#648EB0',
  sidechain: '#C7925B',
  creativeSaturation: '#C97865',
};

export const FX_ROUTING_NODE_ENABLE_KEYS: Record<FxRoutingNodeId, {
  enable: readonly string[];
  disable: readonly string[];
}> = {
  delayA: { enable: ['delayAEnabled'], disable: ['delayAEnabled'] },
  delayB: { enable: ['granularDelayEnabled'], disable: ['granularDelayEnabled'] },
  granular: { enable: ['granularEnabled'], disable: ['granularEnabled'] },
  degrade: { enable: ['degradeEnabled'], disable: ['degradeEnabled', 'driftEnabled', 'erosionEnabled'] },
  freeze: { enable: ['spectralFreezeEnabled'], disable: ['spectralFreezeEnabled'] },
  reverb: { enable: ['reverbEnabled'], disable: ['reverbEnabled'] },
  eq1: { enable: ['dynamicsBusEnabled', 'dynamicsEq1Enabled'], disable: ['dynamicsEq1Enabled'] },
  eq2: { enable: ['dynamicsBusEnabled', 'dynamicsEq2Enabled'], disable: ['dynamicsEq2Enabled'] },
  sidechain: { enable: ['dynamicsEnabled', 'dynamicsBusEnabled', 'sidechainEnabled'], disable: ['sidechainEnabled'] },
  creativeSaturation: { enable: ['dynamicsSaturationEnabled'], disable: ['dynamicsSaturationEnabled'] },
};

export function isFxRoutingNodeActive(state: object, node: FxRoutingNodeId): boolean {
  const values = state as Record<string, unknown>;
  switch (node) {
    case 'delayA': return Boolean(values.delayAEnabled);
    case 'delayB': return Boolean(values.granularDelayEnabled);
    case 'granular': return Boolean(values.granularEnabled);
    case 'degrade': return Boolean(values.degradeEnabled || values.driftEnabled || values.erosionEnabled);
    case 'freeze': return Boolean(values.spectralFreezeEnabled);
    case 'reverb': return Boolean(values.reverbEnabled);
    case 'eq1': return Boolean(values.dynamicsEq1Enabled);
    case 'eq2': return Boolean(values.dynamicsEq2Enabled);
    case 'sidechain': return Boolean(values.sidechainEnabled);
    case 'creativeSaturation': return Boolean(values.dynamicsSaturationEnabled);
  }
}

export interface FxRoutingEdge {
  from: FxRoutingNodeId;
  to: FxRoutingNodeId;
}

export interface FxRoutingConnection extends FxRoutingEdge {
  amount: number;
  mode?: 'single' | 'range' | 'walk' | 'sampleHold';
  min?: number;
  max?: number;
  muted?: boolean;
}

export interface FxRoutingGraphState {
  version: 1;
  edges: FxRoutingConnection[];
  dynamicsBuses?: Partial<Record<FxRoutingNodeId, 0 | 1 | 2 | 3>>;
}

export const DEFAULT_FX_ROUTING_GRAPH_STATE: FxRoutingGraphState = {
  version: 1,
  edges: [
    { from: 'delayA', to: 'reverb', amount: 0.4 },
    { from: 'delayB', to: 'reverb', amount: 0.4 },
    { from: 'granular', to: 'reverb', amount: 0.3 },
    { from: 'freeze', to: 'reverb', amount: 1 },
  ],
};

const edgeKey = (from: FxRoutingNodeId, to: FxRoutingNodeId): string => `${from}>${to}`;

function outgoingSets(edges: readonly FxRoutingEdge[]): Map<FxRoutingNodeId, Set<FxRoutingNodeId>> {
  const outgoing = new Map<FxRoutingNodeId, Set<FxRoutingNodeId>>();
  for (const node of FX_ROUTING_NODE_IDS) outgoing.set(node, new Set());
  for (const edge of edges) outgoing.get(edge.from)?.add(edge.to);
  return outgoing;
}

export function fxNodeCanReach(
  edges: readonly FxRoutingEdge[],
  from: FxRoutingNodeId,
  target: FxRoutingNodeId,
): boolean {
  const outgoing = outgoingSets(edges);
  const visited = new Set<FxRoutingNodeId>();
  const stack: FxRoutingNodeId[] = [from];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of outgoing.get(node) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}

export function canEnableFxRoute(
  edges: readonly FxRoutingEdge[],
  from: FxRoutingNodeId,
  to: FxRoutingNodeId,
): boolean {
  if (from === to) return false;
  if (edges.some((edge) => edge.from === from && edge.to === to)) return true;
  return !fxNodeCanReach(edges, to, from);
}

export function setFxRoutePresence(
  edges: readonly FxRoutingEdge[],
  from: FxRoutingNodeId,
  to: FxRoutingNodeId,
  enabled: boolean,
): FxRoutingEdge[] | null {
  const key = edgeKey(from, to);
  const without = edges.filter((edge) => edgeKey(edge.from, edge.to) !== key);
  if (!enabled) return without;
  if (!canEnableFxRoute(without, from, to)) return null;
  return [...without, { from, to }];
}

export function buildFxRenderOrder(edges: readonly FxRoutingEdge[]): FxRoutingNodeId[] | null {
  const outgoing = outgoingSets(edges);
  const indegree = new Map<FxRoutingNodeId, number>(FX_ROUTING_NODE_IDS.map((node) => [node, 0]));
  for (const targets of outgoing.values()) {
    for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }
  const order: FxRoutingNodeId[] = [];
  const emitted = new Set<FxRoutingNodeId>();
  while (order.length < FX_ROUTING_NODE_IDS.length) {
    const next = FX_ROUTING_NODE_IDS.find((node) => !emitted.has(node) && indegree.get(node) === 0);
    if (!next) return null;
    emitted.add(next);
    order.push(next);
    for (const target of outgoing.get(next) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
    }
  }
  return order;
}

const finiteAmount = (state: Record<string, unknown>, key: string): number => {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : 0;
};

export function deriveLegacyFxRoutingGraphState(state: Record<string, unknown>): FxRoutingGraphState {
  const edges: FxRoutingConnection[] = [];
  const add = (from: FxRoutingNodeId, to: FxRoutingNodeId, amount: number) => {
    if (amount <= 0.0001 || !canEnableFxRoute(edges, from, to)) return;
    edges.push({ from, to, amount });
  };
  add('delayA', 'delayB', finiteAmount(state, 'delayAToBSend'));
  add('delayA', 'granular', finiteAmount(state, 'delayAGranularSend'));
  add('delayA', 'degrade', finiteAmount(state, 'delayADegradeSend'));
  add('delayA', 'reverb', finiteAmount(state, 'delayAReverbSend'));
  add('delayB', 'granular', finiteAmount(state, 'delayBGranularSend'));
  add('delayB', 'degrade', finiteAmount(state, 'delayBDegradeSend'));
  add('delayB', 'reverb', finiteAmount(state, 'granularDelayReverbSend'));
  add('delayB', 'delayA', finiteAmount(state, 'delayBToASend'));
  add('granular', 'degrade', finiteAmount(state, 'granularDegradeSend'));
  add('granular', 'reverb', finiteAmount(state, 'granularReverbSend'));
  add('granular', 'delayA', finiteAmount(state, 'granularDelayASend'));
  add('granular', 'delayB', finiteAmount(state, 'granularDelayBSend'));
  add('degrade', 'reverb', finiteAmount(state, 'degradeReverbSend'));
  add('reverb', 'degrade', finiteAmount(state, 'reverbDegradeSend'));
  if (state.spectralFreezeRouting === 'post') {
    add('reverb', 'freeze', 1);
  } else {
    add('freeze', 'reverb', finiteAmount(state, 'spectralFreezeReverbCrossfade'));
  }
  return { version: 1, edges };
}

export function normalizeFxRoutingGraphState(
  value: unknown,
  legacyState?: Record<string, unknown>,
): FxRoutingGraphState {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return legacyState ? deriveLegacyFxRoutingGraphState(legacyState) : structuredClone(DEFAULT_FX_ROUTING_GRAPH_STATE);
  }
  const raw = value as Partial<FxRoutingGraphState>;
  if (!Array.isArray(raw.edges)) {
    return legacyState ? deriveLegacyFxRoutingGraphState(legacyState) : structuredClone(DEFAULT_FX_ROUTING_GRAPH_STATE);
  }
  const edges: FxRoutingConnection[] = [];
  for (const candidate of raw.edges) {
    if (!candidate || !FX_ROUTING_NODE_IDS.includes(candidate.from) || !FX_ROUTING_NODE_IDS.includes(candidate.to) ||
        candidate.from === candidate.to || !Number.isFinite(candidate.amount) ||
        !canEnableFxRoute(edges, candidate.from, candidate.to)) {
      continue;
    }
    const existing = edges.find((edge) => edge.from === candidate.from && edge.to === candidate.to);
    if (existing) {
      existing.amount = Math.max(0, Math.min(4, candidate.amount));
    } else {
      const amount = Math.max(0, Math.min(4, candidate.amount));
      const mode = candidate.mode === 'range' || candidate.mode === 'walk' || candidate.mode === 'sampleHold'
        ? candidate.mode
        : 'single';
      const min = Math.max(0, Math.min(4, Number.isFinite(candidate.min) ? candidate.min! : amount));
      const max = Math.max(min, Math.min(4, Number.isFinite(candidate.max) ? candidate.max! : amount));
      edges.push({
        from: candidate.from,
        to: candidate.to,
        amount,
        ...(mode !== 'single' ? { mode, min, max } : {}),
        ...(candidate.muted ? { muted: true } : {}),
      });
    }
  }
  const dynamicsBuses = raw.dynamicsBuses && typeof raw.dynamicsBuses === 'object'
    ? Object.fromEntries(FX_ROUTING_NODE_IDS.flatMap((node) => {
        const bus = raw.dynamicsBuses?.[node];
        return Number.isInteger(bus) && (bus ?? -1) >= 0 && (bus ?? 4) <= 3 ? [[node, bus]] : [];
      })) as FxRoutingGraphState['dynamicsBuses']
    : undefined;
  return { version: 1, edges, ...(dynamicsBuses ? { dynamicsBuses } : {}) };
}

const LEGACY_ROUTE_KEYS: Partial<Record<string, readonly [FxRoutingNodeId, FxRoutingNodeId]>> = {
  delayAToBSend: ['delayA', 'delayB'],
  delayBToASend: ['delayB', 'delayA'],
  delayAGranularSend: ['delayA', 'granular'],
  delayBGranularSend: ['delayB', 'granular'],
  delayADegradeSend: ['delayA', 'degrade'],
  delayBDegradeSend: ['delayB', 'degrade'],
  granularDegradeSend: ['granular', 'degrade'],
  delayAReverbSend: ['delayA', 'reverb'],
  granularDelayReverbSend: ['delayB', 'reverb'],
  granularReverbSend: ['granular', 'reverb'],
  granularDelayASend: ['granular', 'delayA'],
  granularDelayBSend: ['granular', 'delayB'],
  degradeReverbSend: ['degrade', 'reverb'],
  reverbDegradeSend: ['reverb', 'degrade'],
  spectralFreezeReverbCrossfade: ['freeze', 'reverb'],
};

export const isLegacyFxRoutingKey = (key: string): boolean => key in LEGACY_ROUTE_KEYS;

export function updateFxRoutingGraphFromLegacyParam(
  graph: FxRoutingGraphState,
  key: string,
  value: unknown,
): FxRoutingGraphState {
  const route = LEGACY_ROUTE_KEYS[key];
  if (!route || typeof value !== 'number' || !Number.isFinite(value)) return graph;
  const [from, to] = route;
  const amount = Math.max(0, Math.min(4, value));
  const nextEdges = setFxRoutePresence(graph.edges, from, to, amount > 0.0001);
  if (nextEdges === null) return graph;
  return {
    ...graph,
    edges: nextEdges.map((edge) => edge.from === from && edge.to === to
      ? { ...edge, amount }
      : edge as FxRoutingConnection),
  };
}

export function updateFxRoutingGraphFromLegacyPatch(
  graph: FxRoutingGraphState,
  patch: Record<string, unknown>,
): FxRoutingGraphState {
  let next = graph;
  for (const [key, value] of Object.entries(patch)) {
    next = updateFxRoutingGraphFromLegacyParam(next, key, value);
  }
  return next;
}
