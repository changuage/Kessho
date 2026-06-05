import assert from 'node:assert/strict';

import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type { ProductResolvedStateCommit } from '../audio/product/ProductEngineTypes';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import {
  commitThenTrigger,
  commitVisibleSliderStateForProduct,
  createInitialProductControlState,
  reduceProductControlState,
  resolvePerformanceState,
  resolveVisibleSliderStateForProductCommit,
  type ProductControlState,
} from './index';

function stateWith(patch: Partial<SliderState>): SliderState {
  return { ...DEFAULT_STATE, ...patch };
}

function controlState(
  patch: Partial<SliderState> = {},
  options: Parameters<typeof createInitialProductControlState>[1] = {},
): ProductControlState {
  return createInitialProductControlState(stateWith(patch), options);
}

function replaceEndpoint(
  state: ProductControlState,
  endpoint: 'A' | 'B',
  sliders: SliderState,
): ProductControlState {
  return reduceProductControlState(state, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint,
    presetId: `preset-${endpoint}`,
    sliders,
  });
}

{
  const initial = controlState({ synthLevel: 0.2 }, { synthMorphKeys: ['synthLevel'] });
  const preset = stateWith({ synthLevel: 0.73, padMorph: 0.4 });
  const next = reduceProductControlState(initial, {
    type: 'preset/load',
    presetId: 'loaded-preset',
    sliders: preset,
  });
  const resolved = resolvePerformanceState(next);
  assert.equal(resolved.sliders.synthLevel, 0.73, 'preset load should replace visible sliders');
  assert.equal(resolved.productPatch.synthLevel, 0.73, 'preset load product patch should use resolved sliders');
  assert.equal(resolved.revision, initial.revision + 1, 'preset load should increment revision');
  assert.equal(resolved.reason, 'preset-load', 'preset load should expose preset reason');
  assert.equal(resolved.triggerCritical, true, 'preset load should be trigger-critical');
}

{
  let next = controlState({ synthLevel: 0.1 }, { synthMorphKeys: ['synthLevel'] });
  next = replaceEndpoint(next, 'A', stateWith({ synthLevel: 0.2 }));
  next = replaceEndpoint(next, 'B', stateWith({ synthLevel: 0.8 }));

  const atA = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 0 });
  assert.equal(resolvePerformanceState(atA).sliders.synthLevel, 0.2, 'morph position 0 should resolve endpoint A');

  const atB = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 1 });
  assert.equal(resolvePerformanceState(atB).sliders.synthLevel, 0.8, 'morph position 1 should resolve endpoint B');

  const midpoint = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 0.5 });
  assert.equal(resolvePerformanceState(midpoint).sliders.synthLevel, 0.5, 'morph position 0.5 should interpolate numeric sliders');
  assert.equal(resolvePerformanceState(midpoint).productPatch.synthLevel, 0.5, 'morph product patch should match visible slider');
}

{
  let next = controlState({}, { synthMorphKeys: ['synthLevel'] });
  next = replaceEndpoint(next, 'A', stateWith({ synthLevel: 0.2 }));
  next = replaceEndpoint(next, 'B', stateWith({ synthLevel: 0.7 }));
  next = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 0.4 });
  next = replaceEndpoint(next, 'A', stateWith({ synthLevel: 1.0 }));
  assert.equal(resolvePerformanceState(next).sliders.synthLevel, 0.88, 'replacing endpoint A mid-morph should recompute immediately');
  next = replaceEndpoint(next, 'B', stateWith({ synthLevel: 0.0 }));
  assert.equal(resolvePerformanceState(next).sliders.synthLevel, 0.6, 'replacing endpoint B mid-morph should recompute immediately');
}

{
  let next = controlState({}, { synthMorphKeys: ['synthLevel'] });
  next = replaceEndpoint(next, 'A', stateWith({ synthLevel: 0.2 }));
  next = replaceEndpoint(next, 'B', stateWith({ synthLevel: 0.8 }));
  next = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 0 });
  next = reduceProductControlState(next, {
    type: 'morph/midpoint-edit',
    target: 'synth',
    key: 'synthLevel',
    value: 0.35,
  });
  assert.equal(resolvePerformanceState(next).sliders.synthLevel, 0.35, 'endpoint A edit should mutate endpoint A at position 0');
  next = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 1 });
  next = reduceProductControlState(next, {
    type: 'morph/midpoint-edit',
    target: 'synth',
    key: 'synthLevel',
    value: 0.95,
  });
  assert.equal(resolvePerformanceState(next).sliders.synthLevel, 0.95, 'endpoint B edit should mutate endpoint B at position 1');
}

{
  let next = controlState(
    {},
    { synthMorphKeys: ['synthLevel'], midMorphEditPolicy: 'disallow-midpoint-edits' },
  );
  next = replaceEndpoint(next, 'A', stateWith({ synthLevel: 0.2 }));
  next = replaceEndpoint(next, 'B', stateWith({ synthLevel: 0.8 }));
  next = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 0.5 });
  const beforeRevision = next.revision;
  const rejected = reduceProductControlState(next, {
    type: 'morph/midpoint-edit',
    target: 'synth',
    key: 'synthLevel',
    value: 1,
  });
  assert.equal(rejected.revision, beforeRevision, 'disallowed midpoint edit should not increment revision');
  assert.equal(resolvePerformanceState(rejected).sliders.synthLevel, 0.5, 'disallowed midpoint edit should not create hidden endpoint edits');
}

{
  let next = controlState({}, { synthMorphKeys: ['synthLevel'], midMorphEditPolicy: 'visible-midpoint-override' });
  next = replaceEndpoint(next, 'A', stateWith({ synthLevel: 0.2 }));
  next = replaceEndpoint(next, 'B', stateWith({ synthLevel: 0.8 }));
  next = reduceProductControlState(next, { type: 'morph/position-set', target: 'synth', position: 0.5 });
  next = reduceProductControlState(next, {
    type: 'morph/midpoint-edit',
    target: 'synth',
    key: 'synthLevel',
    value: 0.9,
  });
  const resolved = resolvePerformanceState(next);
  assert.equal(resolved.sliders.synthLevel, 0.9, 'visible midpoint override should be the visible resolved slider');
  assert.equal(resolved.productPatch.synthLevel, 0.9, 'visible midpoint override should be in Product patch');
}

{
  let next = controlState({}, { drumMorphKeys: ['drumKickFreq'] });
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'drum',
    endpoint: 'A',
    presetId: 'kick-low',
    sliders: stateWith({ drumKickFreq: 40 }),
  });
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'drum',
    endpoint: 'B',
    presetId: 'kick-high',
    sliders: stateWith({ drumKickFreq: 100 }),
  });
  next = reduceProductControlState(next, { type: 'morph/position-set', target: 'drum', position: 0.25 });
  assert.equal(resolvePerformanceState(next).sliders.drumKickFreq, 55, 'drum morph should interpolate selected drum keys');
}

{
  const initial = controlState({ synthLevel: 0.2 });
  const edited = reduceProductControlState(initial, {
    type: 'slider/edit',
    key: 'synthLevel',
    value: 0.3,
  });
  assert.equal(edited.revision, initial.revision + 1, 'sound-affecting slider edit should increment revision');
  const viewed = reduceProductControlState(edited, { type: 'ui/view-change', view: 'synth' });
  assert.equal(viewed.revision, edited.revision, 'UI-only action should not increment revision');
  const trigger = reduceProductControlState(viewed, { type: 'manual-trigger/request', source: 'pad1' });
  assert.equal(trigger.revision, viewed.revision, 'manual trigger request should use current committed revision');
  assert.equal(resolvePerformanceState(trigger).triggerCritical, true, 'manual trigger request should mark trigger-critical resolution');
}

{
  const resolved = resolveVisibleSliderStateForProductCommit(
    stateWith({ synthLevel: 0.64, padMorph: 74 }),
    { revision: 12, reason: 'morph-control-change', triggerCritical: true },
  );
  assert.equal(resolved.revision, 12, 'visible slider commit should use the supplied revision');
  assert.equal(resolved.reason, 'morph-control-change', 'visible slider commit should preserve the transaction reason');
  assert.equal(resolved.triggerCritical, true, 'visible slider commit should preserve trigger-critical intent');
  assert.equal(resolved.sliders.synthLevel, 0.64, 'visible slider commit should resolve from visible sliders');
  assert.equal(resolved.productPatch.synthLevel, 0.64, 'visible slider commit patch should match visible sliders');
  assert.equal(resolved.productPatch.padMorph, 74, 'visible morph position should be included in the resolved patch');
}

{
  let committedRevision = 6;
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'full-snapshot' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  await commitVisibleSliderStateForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.91 }),
    { reason: 'preset-load', triggerCritical: true },
  );
  const capturedCommit = capturedCommits[0];
  assert.ok(capturedCommit, 'visible slider commit should call commitResolvedState');
  assert.equal(capturedCommit.revision, 7, 'visible slider commit should allocate the next Product revision');
  assert.equal(capturedCommit.reason, 'preset-load', 'visible slider commit should forward preset transaction reason');
  assert.equal(capturedCommit.patch.synthLevel, 0.91, 'visible slider commit should patch the visible slider value');
  assert.equal(capturedCommit.triggerCritical, true, 'visible slider commit should forward trigger-critical flag');
}

{
  const calls: string[] = [];
  let committedRevision = 0;
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      calls.push(`commit:${commit.revision}`);
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'full-snapshot' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  const next = reduceProductControlState(controlState({ synthLevel: 0.2 }), {
    type: 'slider/edit',
    key: 'synthLevel',
    value: 0.4,
  });
  const resolved = resolvePerformanceState(next);
  await commitThenTrigger(fakeProductEngine, resolved, (revision) => {
    calls.push(`trigger:${revision}`);
  });
  assert.deepEqual(calls, ['commit:1', 'trigger:1'], 'commitThenTrigger should commit before invoking trigger callback');
}

{
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => (
      { revision: commit.revision, applied: false, mode: 'noop' as const }
    ),
    getCommittedStateRevision: () => 0,
  } as unknown as ProductEnginePort;
  const resolved = resolvePerformanceState(reduceProductControlState(
    controlState({ synthLevel: 0.2 }),
    { type: 'slider/edit', key: 'synthLevel', value: 0.4 },
  ));
  await assert.rejects(
    () => commitThenTrigger(fakeProductEngine, resolved, () => undefined),
    /was not committed before trigger/,
    'trigger-critical resolved state should block when commit receipt is not applied',
  );
}

console.log('Resolved performance state tests passed');
