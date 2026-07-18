import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoreProductSnapshot } from '../../coreProductSnapshot';
import type { JourneyConfig, JourneyConnection, JourneyNode } from '../../journeyTypes';
import {
  BACKGROUND_JOURNEY_FLAGS,
  IOS_WEB_BACKGROUND_JOURNEY_LIMITS,
  admitBackgroundJourneyMemory,
  compileBackgroundJourneyPlan,
  createBackgroundJourneyConfigFingerprint,
  optimizeBackgroundJourneySubset,
  type ResolvedBackgroundJourneyNode,
} from './compileBackgroundJourneyPlan';

function node(id: string, phraseLength = 1): JourneyNode {
  return { id, presetId: id, presetName: id, phraseLength, position: id === 'center' ? 'center' : 'left', color: '#000' };
}

function edge(fromNodeId: string, toNodeId: string, probability = 1, morphDuration = 0.5): JourneyConnection {
  return { id: `${fromNodeId}>${toNodeId}`, fromNodeId, toNodeId, probability, morphDuration };
}

function fixture(connections: JourneyConnection[], overrides: Partial<JourneyConfig> = {}): JourneyConfig {
  return {
    id: 'journey',
    name: 'Journey',
    nodes: [node('a'), { ...node('b'), position: 'right' }, { ...node('c'), position: 'top' }, node('center', 0)],
    connections,
    autoAdvance: true,
    loopEnabled: true,
    ...overrides,
  };
}

function resolved(): Map<string, ResolvedBackgroundJourneyNode> {
  return new Map([
    ['a', { snapshot: createCoreProductSnapshot({ synthLevel: 0.2 }), phraseSeconds: 1 }],
    ['b', { snapshot: createCoreProductSnapshot({ synthLevel: 0.4 }), phraseSeconds: 1 }],
    ['c', { snapshot: createCoreProductSnapshot({ synthLevel: 0.6 }), phraseSeconds: 1 }],
  ]);
}

function compile(config: JourneyConfig, seed = 7, targetSeconds = 30, maxScheduleEntries = 512) {
  return compileBackgroundJourneyPlan({
    config,
    resolvedNodes: resolved(),
    productSeed: seed,
    revision: 4,
    sampleRate: 48_000,
    targetSeconds,
    maxScheduleEntries,
  });
}

test('plans a deterministic weighted route and a closed loop suffix', () => {
  const config = fixture([
    edge('center', 'a'),
    edge('a', 'b', 0.75),
    edge('a', 'c', 0.25),
    edge('b', 'a'),
    edge('c', 'a'),
  ]);
  const first = compile(config);
  const second = compile(config);
  assert.equal(first.status, 'ready');
  assert.deepEqual(second, first);
  if (first.status !== 'ready') return;
  assert.ok(first.plan.loopStartIndex !== null);
  assert.equal(
    first.plan.entries[first.plan.entries.length - 1]!.toNodeIndex,
    first.plan.entries[first.plan.loopStartIndex!]!.fromNodeIndex,
  );
  assert.ok(first.plan.totalFrames >= 48_000n * 30n);
  assert.ok(first.plan.entries.length <= 512);
  assert.ok(first.plan.transitionPrograms.length <= 4);
  assert.ok(first.plan.entries.some((entry) => (entry.flags & BACKGROUND_JOURNEY_FLAGS.restart) !== 0));
});

test('fingerprints every node field that affects route preparation', () => {
  const config = fixture([edge('center', 'a'), edge('a', 'a')]);
  const original = createBackgroundJourneyConfigFingerprint(config);

  assert.notEqual(createBackgroundJourneyConfigFingerprint({
    ...config,
    nodes: config.nodes.map((entry) => entry.id === 'a' ? { ...entry, presetName: 'replacement' } : entry),
  }), original);
  assert.notEqual(createBackgroundJourneyConfigFingerprint({
    ...config,
    nodes: config.nodes.map((entry) => entry.id === 'a' ? { ...entry, position: 'center' } : entry),
  }), original);
});

test('different seeds diverge at a weighted branch', () => {
  const config = fixture([
    edge('center', 'a'), edge('a', 'b', 0.5), edge('a', 'c', 0.5), edge('b', 'a'), edge('c', 'a'),
  ]);
  const routes = new Set<number>();
  for (let seed = 1; seed <= 12; seed += 1) {
    const result = compile(config, seed);
    assert.equal(result.status, 'ready');
    if (result.status === 'ready') routes.add(result.plan.entries[0]!.toNodeIndex);
  }
  assert.ok(routes.size > 1);
});

test('self-loops consume hold frames without a scene morph program', () => {
  const config = fixture([edge('center', 'a'), edge('a', 'a')]);
  const result = compile(config, 7, 5);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.plan.transitionPrograms.length, 0);
  assert.ok(result.plan.entries.every((entry) => entry.morphFrames === 0n));
  assert.ok(result.plan.entries.every((entry) => (entry.flags & BACKGROUND_JOURNEY_FLAGS.selfLoop) !== 0));
});

test('enforces explicit auto-advance, cycle, natural-end, and capacity semantics', () => {
  assert.equal(compile(fixture([edge('center', 'a'), edge('a', 'b')], { autoAdvance: false })).status, 'not-ready');
  const tooFast = compile(fixture([edge('center', 'a'), edge('a', 'a', 1, 0.25)]));
  assert.deepEqual(tooFast.status === 'not-ready' && tooFast.reason, 'invalid-duration');
  const noCycle = compile(fixture([edge('center', 'a'), edge('a', 'b')]));
  assert.deepEqual(noCycle.status === 'not-ready' && noCycle.reason, 'no-reachable-cycle');

  const natural = compile(fixture([edge('center', 'a'), edge('a', 'center', 1, 1)], { loopEnabled: false }), 7, 2);
  assert.equal(natural.status, 'ready');
  const tooShort = compile(fixture([edge('center', 'a'), edge('a', 'center')], { loopEnabled: false }), 7, 10);
  assert.deepEqual(tooShort.status === 'not-ready' && tooShort.reason, 'natural-route-too-short');

  const capacity = compile(fixture([edge('center', 'a'), edge('a', 'a')]), 7, 100, 2);
  assert.deepEqual(capacity.status === 'not-ready' && capacity.reason, 'schedule-capacity');
  const unclosedCapacity = compile(fixture([
    edge('center', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'a'),
  ]), 7, 5, 4);
  assert.deepEqual(unclosedCapacity.status === 'not-ready' && unclosedCapacity.reason, 'schedule-capacity');
});

test('admits memory using separate registered, decode-peak, and host-cache domains', () => {
  const MiB = 1024 * 1024;
  assert.equal(admitBackgroundJourneyMemory({
    uniqueDecodedAssetBytes: 160 * MiB,
    registeredBytes: 160 * MiB,
    largestPendingDecodeBytes: 32 * MiB,
    hostDecodedBytes: 16 * MiB,
  }).status, 'ready');
  assert.deepEqual(admitBackgroundJourneyMemory({
    uniqueDecodedAssetBytes: 161 * MiB,
    registeredBytes: 100 * MiB,
    largestPendingDecodeBytes: 1 * MiB,
    hostDecodedBytes: 1 * MiB,
  }).status, 'not-ready');
  const peak = admitBackgroundJourneyMemory({
    uniqueDecodedAssetBytes: 150 * MiB,
    registeredBytes: 180 * MiB,
    largestPendingDecodeBytes: 13 * MiB,
    hostDecodedBytes: 1 * MiB,
  });
  assert.deepEqual(peak.status === 'not-ready' && peak.reason, 'decode-peak-budget');
  assert.equal(IOS_WEB_BACKGROUND_JOURNEY_LIMITS.maxConcurrentDecodes, 1);
});

test('selects the best cyclic subset without mutating the saved Journey', () => {
  const config = fixture([
    edge('center', 'a'), edge('center', 'b'),
    edge('a', 'b'), edge('b', 'a'), edge('c', 'a'),
  ]);
  const before = structuredClone(config);
  const candidate = optimizeBackgroundJourneySubset({
    config,
    options: {
      resolvedNodes: resolved(), productSeed: 9, revision: 2, sampleRate: 48_000, targetSeconds: 10,
    },
    estimateAssets: (nodeIds) => ({
      decodedBytes: nodeIds.includes('c') ? 200 * 1024 * 1024 : 120 * 1024 * 1024,
      sharedAssetReuse: nodeIds.length,
    }),
  });
  assert.deepEqual(config, before);
  assert.deepEqual(candidate?.nodeIds, ['a', 'b']);
  assert.ok(candidate && candidate.decodedAssetBytes <= IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes);
});
