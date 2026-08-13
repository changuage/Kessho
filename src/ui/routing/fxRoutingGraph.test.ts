import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFxRenderOrder,
  canEnableFxRoute,
  isFxRoutingNodeActive,
  deriveLegacyFxRoutingGraphState,
  fxRouteRuntimeKey,
  fxRouteRuntimePositions,
  resolveFxRoutingApproachFanOffsets,
  resolveFxRoutingFanOffsets,
  resolveFxRoutingHorizontalBounds,
  resolveFxRoutingHorizontalLaneOffset,
  resolveFxRoutingNodeRanks,
  resolveFxRoutingRoutedFanOffsets,
  resolveFxRoutingVerticalLaneOffset,
  sampleFxRoutingHorizontalWire,
  sampleFxRoutingVerticalWire,
  setFxRoutePresence,
  updateFxRoutingGraphFromLegacyParam,
  type FxRoutingEdge,
  type FxRoutingNodeId,
} from './fxRoutingGraph';

test('node layout keeps terminal FX clear of Master and fans shared ports symmetrically', () => {
  const bounds = resolveFxRoutingHorizontalBounds(1200);
  assert.equal(bounds.masterX, 1100);
  assert.ok(bounds.masterX - bounds.right >= 230);
  assert.deepEqual(resolveFxRoutingFanOffsets(1, 20), [0]);
  assert.deepEqual(resolveFxRoutingFanOffsets(4, 18), [-18, -6, 6, 18]);
});

test('mobile wire routing chooses the clear side around nodes and existing lines', () => {
  const occupied = [sampleFxRoutingVerticalWire({ x: 0, y: 24 }, { x: -12, y: 120 }, 0)];
  const offset = resolveFxRoutingVerticalLaneOffset({
    from: { x: 0, y: 0 },
    to: { x: 20, y: 150 },
    maxOffset: 64,
    preferredSide: 1,
    obstacles: [{ x: 0, y: 62, halfWidth: 28, halfHeight: 24 }],
    occupiedPaths: occupied,
  });
  assert.ok(offset > 0, 'the uncluttered right-hand lane should win');
});

test('desktop wire routing bends around nodes and occupied paths', () => {
  const occupied = [sampleFxRoutingHorizontalWire({ x: 10, y: 26 }, { x: 150, y: 12 }, 0)];
  const offset = resolveFxRoutingHorizontalLaneOffset({
    from: { x: 0, y: 0 },
    to: { x: 180, y: 20 },
    maxOffset: 72,
    preferredSide: -1,
    obstacles: [{ x: 82, y: 0, halfWidth: 32, halfHeight: 28 }],
    occupiedPaths: occupied,
  });
  assert.notEqual(offset, 0, 'the blocked center lane should not win');

  const masterOffset = resolveFxRoutingHorizontalLaneOffset({
    from: { x: 356, y: 168 },
    to: { x: 1027, y: 222 },
    maxOffset: 110,
    preferredSide: 1,
    obstacles: [{ x: 826, y: 247, halfWidth: 42, halfHeight: 31 }],
    occupiedPaths: [],
  });
  assert.ok(masterOffset < 0, 'a Master return should route above a downstream FX instead of through it');
});

test('outgoing ports follow routed departure lanes before destination height', () => {
  const offsets = resolveFxRoutingRoutedFanOffsets([
    { id: 'edge:delayA>reverb', originPosition: 250, destinationPosition: 370, laneOffset: 110 },
    { id: 'master:delayA', originPosition: 250, destinationPosition: 405, laneOffset: -110 },
  ], 19);
  assert.equal(offsets.get('master:delayA'), -19, 'the upper Master lane should leave from the upper port');
  assert.equal(offsets.get('edge:delayA>reverb'), 19, 'the lower Reverb lane should leave from the lower port');
});

test('incoming ports follow approach angle instead of source height', () => {
  const offsets = resolveFxRoutingApproachFanOffsets([
    { id: 'pad1', from: { x: 325, y: 150 } },
    { id: 'delayB', from: { x: 1160, y: 225 } },
    { id: 'nature', from: { x: 350, y: 816 } },
    { id: 'delayA', from: { x: 710, y: 790 } },
  ], { x: 1645, y: 445 }, 18);
  assert.ok(offsets.get('delayB')! < offsets.get('pad1')!, 'the steeper upper route should take the outer upper port');
  assert.ok(offsets.get('delayA')! > offsets.get('nature')!, 'the steeper lower route should take the outer lower port');
});

test('node placement follows connected source barycenters and wires arrive calmly', () => {
  const barycenterRanks = resolveFxRoutingNodeRanks(
    ['delayA', 'granular', 'reverb'],
    [{ from: 'granular', to: 'reverb' }],
    { delayA: [0.35], granular: [0.05, 0.25] },
  );
  assert.ok(barycenterRanks.granular! < barycenterRanks.delayA!, 'Granular should sit above Delay A for the upper sources');

  const bypassRanks = resolveFxRoutingNodeRanks(
    ['delayA', 'reverb'],
    [{ from: 'delayA', to: 'reverb' }],
    { delayA: [0.35], reverb: [0.35] },
    [{ rank: 0.35, targets: ['delayA', 'reverb'] }],
  );
  assert.ok(bypassRanks.delayA! < 0.2, 'a bypassed singleton FX should leave the direct source lane');
  assert.ok(bypassRanks.reverb! > bypassRanks.delayA!, 'the direct downstream target should retain the source lane');

  const independentUpstreamRanks = resolveFxRoutingNodeRanks(
    ['delayA', 'reverb'],
    [{ from: 'delayA', to: 'reverb' }],
    { reverb: [0.5] },
    [{ rank: 0.5, targets: ['reverb'] }],
  );
  assert.ok(independentUpstreamRanks.delayA! < 0.3, 'upstream FX should leave a downstream direct-source corridor');

  const path = sampleFxRoutingHorizontalWire({ x: 0, y: 0 }, { x: 180, y: 20 }, -72);
  assert.ok(Math.abs(path[path.length - 2]!.y - 20) < Math.abs(path[1]!.y), 'the curve should flatten near its target');
});

test('DSP route feedback resolves to the same normalized key in Nodes and Matrix', () => {
  const amounts = Array(100).fill(0);
  amounts[5] = 0.65; // Delay A (0) → Reverb (5).
  const positions = fxRouteRuntimePositions({
    version: 1,
    edges: [{ from: 'delayA', to: 'reverb', amount: 0.5, mode: 'range', min: 0.2, max: 0.8 }],
  }, amounts);
  assert.ok(Math.abs(positions[fxRouteRuntimeKey('delayA', 'reverb')]! - 0.75) < 0.000001);
});

assert.equal(isFxRoutingNodeActive({ delayAEnabled: true }, 'delayA'), true);
assert.equal(isFxRoutingNodeActive({ delayAEnabled: false }, 'delayA'), false);
assert.equal(isFxRoutingNodeActive({ dynamicsEq1Enabled: false }, 'eq1'), false);
assert.equal(isFxRoutingNodeActive({ dynamicsEq1Enabled: true }, 'eq1'), true);

function orderIndex(order: readonly FxRoutingNodeId[], node: FxRoutingNodeId): number {
  return order.indexOf(node);
}

test('FX routing accepts chains, fan-out, and merges while rejecting every feedback path', () => {
  let edges: FxRoutingEdge[] = [];
  edges = setFxRoutePresence(edges, 'reverb', 'degrade', true)!;
  edges = setFxRoutePresence(edges, 'degrade', 'freeze', true)!;
  assert.equal(canEnableFxRoute(edges, 'freeze', 'reverb'), false);
  assert.equal(canEnableFxRoute(edges, 'reverb', 'reverb'), false);

  edges = setFxRoutePresence(edges, 'reverb', 'eq1', true)!;
  edges = setFxRoutePresence(edges, 'eq1', 'freeze', true)!;
  const order = buildFxRenderOrder(edges);
  assert.ok(order);
  assert.ok(orderIndex(order, 'reverb') < orderIndex(order, 'degrade'));
  assert.ok(orderIndex(order, 'degrade') < orderIndex(order, 'freeze'));
  assert.ok(orderIndex(order, 'reverb') < orderIndex(order, 'eq1'));
  assert.ok(orderIndex(order, 'eq1') < orderIndex(order, 'freeze'));

  edges = setFxRoutePresence(edges, 'reverb', 'degrade', false)!;
  assert.equal(canEnableFxRoute(edges, 'freeze', 'reverb'), false, 'alternate path still closes the cycle');
  edges = setFxRoutePresence(edges, 'reverb', 'eq1', false)!;
  edges = setFxRoutePresence(edges, 'freeze', 'reverb', true)!;
  assert.ok(edges.some((edge) => edge.from === 'freeze' && edge.to === 'reverb'));
});

test('edge presence is independent from send amount', () => {
  const edges: FxRoutingEdge[] = [{ from: 'reverb', to: 'freeze' }];
  assert.equal(canEnableFxRoute(edges, 'freeze', 'reverb'), false);
});

test('legacy routing migrates once into the cycle-safe graph', () => {
  const graph = deriveLegacyFxRoutingGraphState({
    reverbDegradeSend: 0.8,
    degradeReverbSend: 0.9,
    spectralFreezeRouting: 'pre',
    spectralFreezeReverbCrossfade: 0.6,
  });
  assert.equal(graph.edges.some((edge) => edge.from === 'degrade' && edge.to === 'reverb'), true);
  assert.equal(graph.edges.some((edge) => edge.from === 'reverb' && edge.to === 'degrade'), false);
  assert.equal(graph.edges.some((edge) => edge.from === 'freeze' && edge.to === 'reverb' && edge.amount === 0.6), true);

  const removed = updateFxRoutingGraphFromLegacyParam(graph, 'degradeReverbSend', 0);
  const reversed = updateFxRoutingGraphFromLegacyParam(removed, 'reverbDegradeSend', 0.8);
  assert.equal(reversed.edges.some((edge) => edge.from === 'reverb' && edge.to === 'degrade'), true);
});
