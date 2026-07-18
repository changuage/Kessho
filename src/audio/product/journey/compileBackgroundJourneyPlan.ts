import type { JourneyConfig, JourneyConnection, JourneyNode } from '../../journeyTypes';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import {
  compileProductSceneProgram,
  type ProductSceneProgram,
} from '../scene/compileProductSceneProgram';

const MiB = 1024 * 1024;
const MIN_BACKGROUND_JOURNEY_MORPH_PHRASES = 0.5;

export const IOS_WEB_BACKGROUND_JOURNEY_LIMITS = Object.freeze({
  targetSeconds: 7_200,
  maxScheduleEntries: 512,
  maxPresetNodes: 4,
  maxConnections: 20,
  registeredAssetSoftBytes: 160 * MiB,
  registeredAssetHardBytes: 192 * MiB,
  hostDecodedBytes: 16 * MiB,
  maxConcurrentDecodes: 1,
});

export const BACKGROUND_JOURNEY_FLAGS = Object.freeze({
  selfLoop: 1,
  ending: 2,
  restart: 4,
});

export function createBackgroundJourneyConfigFingerprint(config: JourneyConfig | null): string {
  if (!config) return '';
  return JSON.stringify({
    autoAdvance: config.autoAdvance,
    loopEnabled: config.loopEnabled,
    nodes: config.nodes.map((node) => [
      node.id,
      node.presetId,
      node.presetName,
      node.position,
      node.phraseLength,
      node.phraseLengthMax,
    ]),
    connections: config.connections.map((edge) => [
      edge.id,
      edge.fromNodeId,
      edge.toNodeId,
      edge.morphDuration,
      edge.morphDurationMax,
      edge.probability,
    ]),
  });
}

export type BackgroundJourneyScheduleEntry = {
  fromNodeIndex: number;
  toNodeIndex: number;
  transitionProgramIndex: number;
  holdFrames: bigint;
  morphFrames: bigint;
  flags: number;
};

export type BackgroundJourneyPlan = {
  entries: BackgroundJourneyScheduleEntry[];
  transitionPrograms: ProductSceneProgram[];
  loopStartIndex: number | null;
  totalFrames: bigint;
  rngStateAfterPlan: number;
  referencedNodeMask: number;
  revision: number;
};

export type BackgroundJourneyPlanReason =
  | 'auto-advance-disabled'
  | 'invalid-graph'
  | 'invalid-duration'
  | 'missing-preset'
  | 'missing-start'
  | 'no-reachable-cycle'
  | 'natural-route-too-short'
  | 'schedule-capacity'
  | 'scene-program-unsupported';

export type BackgroundJourneyPlanResult =
  | { status: 'ready'; plan: BackgroundJourneyPlan }
  | { status: 'not-ready'; reason: BackgroundJourneyPlanReason; detail?: string };

export type ResolvedBackgroundJourneyNode = {
  snapshot: CoreProductSnapshot;
  phraseSeconds: number;
};

export type CompileBackgroundJourneyPlanOptions = {
  config: JourneyConfig;
  resolvedNodes: ReadonlyMap<string, ResolvedBackgroundJourneyNode>;
  productSeed: number;
  revision: number;
  sampleRate: number;
  targetSeconds?: number;
  maxScheduleEntries?: number;
};

type PlannedEdge = {
  from: JourneyNode;
  to: JourneyNode;
  connection: JourneyConnection;
  holdFrames: bigint;
  morphFrames: bigint;
  flags: number;
};

function hashU32(text: string, seed: number): number {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function nextRng(state: number): { state: number; unit: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return { state: next || 1, unit: ((value ^ (value >>> 14)) >>> 0) / 0x100000000 };
}

function chooseWeighted<T>(
  choices: readonly T[],
  weight: (choice: T) => number,
  rngState: number,
): { choice: T | null; rngState: number } {
  const weighted = choices.map((choice) => ({ choice, weight: Math.max(0, weight(choice)) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) return { choice: null, rngState };
  const random = nextRng(rngState);
  let cursor = random.unit * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return { choice: item.choice, rngState: random.state };
  }
  return { choice: weighted[weighted.length - 1]?.choice ?? null, rngState: random.state };
}

function resolveRange(minimum: number, maximum: number | undefined, rngState: number): { value: number; rngState: number } {
  const max = maximum ?? minimum;
  if (max === minimum) return { value: minimum, rngState };
  const random = nextRng(rngState);
  return { value: minimum + (max - minimum) * random.unit, rngState: random.state };
}

function frames(seconds: number, sampleRate: number): bigint {
  return BigInt(Math.max(0, Math.round(seconds * sampleRate)));
}

function isCenter(node: JourneyNode): boolean {
  return node.position === 'center' || node.presetId === '__CENTER__';
}

function playable(node: JourneyNode): boolean {
  return !isCenter(node) && Boolean(node.presetId && node.presetName);
}

function hasReachableCycle(
  startId: string,
  outgoing: ReadonlyMap<string, readonly JourneyConnection[]>,
  playableIds: ReadonlySet<string>,
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (playableIds.has(edge.toNodeId) && visit(edge.toNodeId)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return visit(startId);
}

function graphRevisionMaterial(config: JourneyConfig, revision: number): string {
  const nodes = config.nodes.map((node) => [node.position, node.presetId, node.phraseLength, node.phraseLengthMax ?? node.phraseLength]);
  const connections = config.connections.map((edge) => [edge.fromNodeId, edge.toNodeId, edge.probability, edge.morphDuration, edge.morphDurationMax ?? edge.morphDuration]);
  return JSON.stringify([revision, config.autoAdvance, config.loopEnabled, nodes, connections]);
}

export function compileBackgroundJourneyPlan(options: CompileBackgroundJourneyPlanOptions): BackgroundJourneyPlanResult {
  const { config, resolvedNodes } = options;
  if (!config.autoAdvance) return { status: 'not-ready', reason: 'auto-advance-disabled' };
  const sampleRate = Math.round(options.sampleRate);
  const maxEntries = Math.min(IOS_WEB_BACKGROUND_JOURNEY_LIMITS.maxScheduleEntries, Math.max(1, Math.round(options.maxScheduleEntries ?? IOS_WEB_BACKGROUND_JOURNEY_LIMITS.maxScheduleEntries)));
  const targetFrames = frames(options.targetSeconds ?? IOS_WEB_BACKGROUND_JOURNEY_LIMITS.targetSeconds, sampleRate);
  if (!(sampleRate > 0) || targetFrames <= 0n) return { status: 'not-ready', reason: 'invalid-duration' };

  const nodes = config.nodes;
  const playableNodes = nodes.filter(playable);
  const center = nodes.find(isCenter);
  if (nodes.length > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.maxPresetNodes + 1 ||
      nodes.filter(isCenter).length > 1 ||
      new Set(nodes.map((node) => node.position)).size !== nodes.length ||
      playableNodes.length < 2 || playableNodes.length > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.maxPresetNodes ||
      config.connections.length > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.maxConnections) {
    return { status: 'not-ready', reason: 'invalid-graph', detail: 'Journey must contain 2-4 playable nodes and at most 20 connections' };
  }
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    return { status: 'not-ready', reason: 'invalid-graph', detail: 'Journey node IDs must be unique' };
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of playableNodes) {
    const resolved = resolvedNodes.get(node.id);
    if (!resolved) return { status: 'not-ready', reason: 'missing-preset', detail: node.presetName };
    if (!Number.isFinite(resolved.phraseSeconds) || !(resolved.phraseSeconds > 0) ||
        !Number.isFinite(node.phraseLength) || !(node.phraseLength > 0) ||
        (node.phraseLengthMax !== undefined && (!Number.isFinite(node.phraseLengthMax) || node.phraseLengthMax < node.phraseLength))) {
      return { status: 'not-ready', reason: 'invalid-duration', detail: node.id };
    }
  }
  for (const edge of config.connections) {
    if (!nodeById.has(edge.fromNodeId) || !nodeById.has(edge.toNodeId) ||
        !Number.isFinite(edge.probability) || edge.probability < 0 || edge.probability > 1) {
      return { status: 'not-ready', reason: 'invalid-graph', detail: edge.id };
    }
    if (!Number.isFinite(edge.morphDuration) || edge.morphDuration < MIN_BACKGROUND_JOURNEY_MORPH_PHRASES ||
        (edge.morphDurationMax !== undefined && (!Number.isFinite(edge.morphDurationMax) || edge.morphDurationMax < edge.morphDuration))) {
      return { status: 'not-ready', reason: 'invalid-duration', detail: edge.id };
    }
  }

  const outgoing = new Map<string, JourneyConnection[]>();
  for (const edge of config.connections) {
    const list = outgoing.get(edge.fromNodeId);
    if (list) list.push(edge);
    else outgoing.set(edge.fromNodeId, [edge]);
  }
  const playableIds = new Set(playableNodes.map((node) => node.id));
  let startEdges = center ? (outgoing.get(center.id) ?? []).filter((edge) => playableIds.has(edge.toNodeId)) : [];
  if (config.loopEnabled) {
    startEdges = startEdges.filter((edge) => hasReachableCycle(edge.toNodeId, outgoing, playableIds));
  }

  let rngState = hashU32(graphRevisionMaterial(config, options.revision), options.productSeed);
  let current: JourneyNode | undefined;
  if (startEdges.length > 0) {
    const selected = chooseWeighted(startEdges, (edge) => edge.probability, rngState);
    rngState = selected.rngState;
    current = selected.choice ? nodeById.get(selected.choice.toNodeId) : undefined;
  } else if (!center || (outgoing.get(center.id)?.length ?? 0) === 0) {
    const candidates = config.loopEnabled
      ? playableNodes.filter((node) => hasReachableCycle(node.id, outgoing, playableIds))
      : playableNodes;
    const selected = chooseWeighted(candidates, () => 1, rngState);
    rngState = selected.rngState;
    current = selected.choice ?? undefined;
  }
  if (!current) return { status: 'not-ready', reason: config.loopEnabled ? 'no-reachable-cycle' : 'missing-start' };

  const planned: PlannedEdge[] = [];
  const nodeSequence: string[] = [current.id];
  let loopStartIndex: number | null = null;
  let cycleEdges: JourneyConnection[] | null = null;
  let cycleCursor = 0;
  let totalFrames = 0n;

  while ((totalFrames < targetFrames || (cycleEdges !== null && cycleCursor !== 0)) && planned.length < maxEntries) {
    const source = current;
    const resolved = resolvedNodes.get(source.id)!;
    const hold = resolveRange(source.phraseLength, source.phraseLengthMax, rngState);
    rngState = hold.rngState;
    let edge: JourneyConnection | null = null;
    let restart = false;
    if (cycleEdges) {
      edge = cycleEdges[cycleCursor] ?? null;
      restart = cycleCursor === 0 && planned.length > (loopStartIndex ?? 0);
      cycleCursor = (cycleCursor + 1) % cycleEdges.length;
    } else {
      let choices = outgoing.get(source.id) ?? [];
      if (config.loopEnabled) {
        choices = choices.filter((candidate) => playableIds.has(candidate.toNodeId) && hasReachableCycle(candidate.toNodeId, outgoing, playableIds));
      }
      const selected = chooseWeighted(choices, (candidate) => candidate.probability, rngState);
      rngState = selected.rngState;
      edge = selected.choice;
    }

    if (!edge) break;
    const destination = nodeById.get(edge.toNodeId);
    if (!destination) return { status: 'not-ready', reason: 'invalid-graph', detail: edge.id };
    const selfLoop = destination.id === source.id;
    const ending = isCenter(destination);
    const morph = selfLoop ? { value: 0, rngState } : resolveRange(edge.morphDuration, edge.morphDurationMax, rngState);
    rngState = morph.rngState;
    const holdFrames = frames(hold.value * resolved.phraseSeconds, sampleRate);
    const morphFrames = frames(morph.value * resolved.phraseSeconds, sampleRate);
    const flags = (selfLoop ? BACKGROUND_JOURNEY_FLAGS.selfLoop : 0) |
      (ending ? BACKGROUND_JOURNEY_FLAGS.ending : 0) |
      (restart ? BACKGROUND_JOURNEY_FLAGS.restart : 0);
    planned.push({ from: source, to: destination, connection: edge, holdFrames, morphFrames, flags });
    totalFrames += holdFrames + morphFrames;
    if (ending) break;
    current = destination;

    if (!cycleEdges && config.loopEnabled) {
      const previousNodeIndex = nodeSequence.indexOf(current.id);
      nodeSequence.push(current.id);
      if (previousNodeIndex >= 0) {
        loopStartIndex = previousNodeIndex;
        cycleEdges = planned.slice(previousNodeIndex).map((entry) => entry.connection);
        cycleCursor = 0;
      }
    }
  }

  if (totalFrames < targetFrames) {
    if (planned.length >= maxEntries) return { status: 'not-ready', reason: 'schedule-capacity' };
    return { status: 'not-ready', reason: config.loopEnabled ? 'no-reachable-cycle' : 'natural-route-too-short' };
  }
  if (cycleEdges && cycleCursor !== 0) {
    return { status: 'not-ready', reason: 'schedule-capacity', detail: 'Closed suffix could not finish within capacity' };
  }
  if (config.loopEnabled && (loopStartIndex === null || !cycleEdges?.length)) {
    return { status: 'not-ready', reason: 'no-reachable-cycle' };
  }

  const nodeIndices = new Map(playableNodes.map((node, index) => [node.id, index]));
  const programs: ProductSceneProgram[] = [];
  const programByEdge = new Map<string, number>();
  let referencedNodeMask = 0;
  const entries: BackgroundJourneyScheduleEntry[] = [];
  for (const entry of planned) {
    const fromNodeIndex = nodeIndices.get(entry.from.id);
    if (fromNodeIndex === undefined) return { status: 'not-ready', reason: 'invalid-graph' };
    const toNodeIndex = nodeIndices.get(entry.to.id) ?? fromNodeIndex;
    referencedNodeMask |= (1 << fromNodeIndex);
    if (!isCenter(entry.to)) referencedNodeMask |= (1 << toNodeIndex);
    let transitionProgramIndex = 0xffff;
    if (entry.from.id !== entry.to.id && !isCenter(entry.to)) {
      const key = `${entry.from.id}>${entry.to.id}`;
      const existing = programByEdge.get(key);
      if (existing !== undefined) transitionProgramIndex = existing;
      else {
        const program = compileProductSceneProgram(resolvedNodes.get(entry.from.id)!.snapshot, resolvedNodes.get(entry.to.id)!.snapshot);
        if (program.unsupportedKeys.length > 0) {
          return { status: 'not-ready', reason: 'scene-program-unsupported', detail: program.unsupportedKeys.join(', ') };
        }
        transitionProgramIndex = programs.length;
        programByEdge.set(key, transitionProgramIndex);
        programs.push(program);
      }
    }
    entries.push({
      fromNodeIndex,
      toNodeIndex,
      transitionProgramIndex,
      holdFrames: entry.holdFrames,
      morphFrames: entry.morphFrames,
      flags: entry.flags,
    });
  }

  return {
    status: 'ready',
    plan: {
      entries,
      transitionPrograms: programs,
      loopStartIndex,
      totalFrames,
      rngStateAfterPlan: rngState,
      referencedNodeMask,
      revision: Math.max(0, Math.round(options.revision)) >>> 0,
    },
  };
}

export type BackgroundJourneyMemoryAdmission =
  | { status: 'ready'; registeredBytes: number; decodePeakBytes: number }
  | { status: 'not-ready'; reason: 'asset-soft-budget' | 'decode-peak-budget' | 'host-cache-budget'; bytes: number; limitBytes: number };

export function admitBackgroundJourneyMemory(input: {
  uniqueDecodedAssetBytes: number;
  registeredBytes: number;
  largestPendingDecodeBytes: number;
  hostDecodedBytes: number;
}): BackgroundJourneyMemoryAdmission {
  if (input.hostDecodedBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.hostDecodedBytes) {
    return { status: 'not-ready', reason: 'host-cache-budget', bytes: input.hostDecodedBytes, limitBytes: IOS_WEB_BACKGROUND_JOURNEY_LIMITS.hostDecodedBytes };
  }
  if (input.uniqueDecodedAssetBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes) {
    return { status: 'not-ready', reason: 'asset-soft-budget', bytes: input.uniqueDecodedAssetBytes, limitBytes: IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes };
  }
  const decodePeakBytes = input.registeredBytes + input.largestPendingDecodeBytes;
  if (decodePeakBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetHardBytes) {
    return { status: 'not-ready', reason: 'decode-peak-budget', bytes: decodePeakBytes, limitBytes: IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetHardBytes };
  }
  return { status: 'ready', registeredBytes: input.uniqueDecodedAssetBytes, decodePeakBytes };
}

export type BackgroundJourneySubsetCandidate = {
  nodeIds: readonly string[];
  plan: BackgroundJourneyPlan;
  decodedAssetBytes: number;
  retainedProbabilityMass: number;
  sharedAssetReuse: number;
};

export function optimizeBackgroundJourneySubset(input: {
  options: Omit<CompileBackgroundJourneyPlanOptions, 'config'>;
  config: JourneyConfig;
  estimateAssets: (nodeIds: readonly string[]) => { decodedBytes: number; sharedAssetReuse: number };
}): BackgroundJourneySubsetCandidate | null {
  const playableNodes = input.config.nodes.filter(playable);
  const candidates: BackgroundJourneySubsetCandidate[] = [];
  const savedConfig = input.config;
  for (let mask = 1; mask < (1 << playableNodes.length); mask += 1) {
    const selected = playableNodes.filter((_, index) => (mask & (1 << index)) !== 0);
    if (selected.length < 2 || selected.length === playableNodes.length) continue;
    const selectedIds = new Set(selected.map((node) => node.id));
    const centerId = savedConfig.nodes.find(isCenter)?.id;
    const connections = savedConfig.connections.filter((edge) =>
      (selectedIds.has(edge.fromNodeId) || edge.fromNodeId === centerId) && selectedIds.has(edge.toNodeId));
    const config: JourneyConfig = {
      ...savedConfig,
      nodes: savedConfig.nodes.filter((node) => selectedIds.has(node.id) || isCenter(node)),
      connections,
    };
    const assets = input.estimateAssets(selected.map((node) => node.id));
    if (assets.decodedBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes) continue;
    const result = compileBackgroundJourneyPlan({ ...input.options, config });
    if (result.status !== 'ready') continue;
    const retainedProbabilityMass = connections.reduce((sum, edge) => sum + Math.max(0, edge.probability), 0);
    candidates.push({
      nodeIds: selected.map((node) => node.id),
      plan: result.plan,
      decodedAssetBytes: assets.decodedBytes,
      retainedProbabilityMass,
      sharedAssetReuse: assets.sharedAssetReuse,
    });
  }
  candidates.sort((left, right) =>
    right.nodeIds.length - left.nodeIds.length ||
    right.retainedProbabilityMass - left.retainedProbabilityMass ||
    Number(right.plan.totalFrames - left.plan.totalFrames) ||
    right.sharedAssetReuse - left.sharedAssetReuse ||
    left.decodedAssetBytes - right.decodedAssetBytes);
  return candidates[0] ?? null;
}
