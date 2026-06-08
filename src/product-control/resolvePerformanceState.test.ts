import assert from 'node:assert/strict';

import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type { ProductResolvedStateCommit } from '../audio/product/ProductEngineTypes';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import {
  commitProductControlActionForProduct,
  commitProductControlActionThenTrigger,
  commitProductControlPatchForProduct,
  commitThenTrigger,
  commitVisibleSliderStateForProduct,
  createInitialProductControlState,
  getProductDrumMorphDualRangeOverrides,
  interpolateProductDrumMorphDualRanges,
  reduceProductControlState,
  reduceVisibleSliderPatchForProductCommit,
  reduceVisibleSliderStateForProductCommit,
  resolvePerformanceState,
  resolveVisibleSliderStateForProductCommit,
  type ProductControlAction,
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function hashJson(value: unknown): string {
  return stableStringify(value);
}

async function waitForCondition(condition: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(condition(), message);
}

function expectSoundActionChangesResolvedOutput(
  before: ProductControlState,
  action: ProductControlAction,
  message: string,
): ProductControlState {
  const beforeResolved = resolvePerformanceState(before);
  const after = reduceProductControlState(before, action);
  const afterResolved = resolvePerformanceState(after);

  if (after.revision !== before.revision) {
    assert.notEqual(
      hashJson(afterResolved.productPatch),
      hashJson(beforeResolved.productPatch),
      message,
    );
  }

  return after;
}

// ProductControl state authority invariants.
{
  let next = controlState({ padPostLPF: 1000, synthAttack: 0.1 });
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'A',
    presetId: 'pad-a',
    sliders: stateWith({ padPostLPF: 1000, synthAttack: 0.1 }),
  });
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'pad-b',
    sliders: stateWith({ padPostLPF: 5000, synthAttack: 0.9 }),
  });
  next = reduceProductControlState(next, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0.5,
    triggerCritical: true,
  });
  const resolved = resolvePerformanceState(next);
  assert.equal(resolved.sliders.padPostLPF, 3000, 'empty morph keys should interpolate endpoint Pad LPF');
  assert.equal(resolved.sliders.synthAttack, 0.5, 'empty morph keys should interpolate endpoint envelope keys');
  assert.equal(resolved.productPatch.padPostLPF, 3000, 'empty morph keys should write interpolated Pad LPF to Product patch');
  assert.equal(resolved.productPatch.synthAttack, 0.5, 'empty morph keys should write interpolated envelope to Product patch');
}

{
  const next = reduceProductControlState(controlState({ synthEuclideanMasterEnabled: false }), {
    type: 'sequencer/edit',
    patch: { synthEuclideanMasterEnabled: true },
    triggerCritical: true,
  });
  const resolved = resolvePerformanceState(next);
  assert.equal(resolved.sliders.synthEuclideanMasterEnabled, true, 'sequencer/edit should affect resolved visible sequencer sliders');
  assert.equal(resolved.productPatch.synthEuclideanMasterEnabled, true, 'sequencer/edit should affect resolved Product patch');
}

{
  const before = controlState({
    drumKickPresetA: 'Ikeda Kick',
    drumKickPresetB: 'Ikeda Kick',
    drumKickMorph: 0,
    drumKickFreq: 55,
  });
  const after = reduceProductControlState(before, {
    type: 'drum-morph/override-set',
    voice: 'kick',
    param: 'drumKickFreq',
    value: 72,
    morphPosition: 0,
  });
  if (after.revision !== before.revision) {
    assert.notEqual(
      hashJson(resolvePerformanceState(after).productPatch),
      hashJson(resolvePerformanceState(before).productPatch),
      'drum morph override revisions should change resolved Product output',
    );
  }
}

{
  let next = controlState({ padPostLPF: 1000 });
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'A',
    presetId: 'A1',
    sliders: stateWith({ padPostLPF: 1000 }),
  });
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'B1',
    sliders: stateWith({ padPostLPF: 5000 }),
  });
  next = reduceProductControlState(next, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0.5,
    triggerCritical: true,
  });
  assert.equal(resolvePerformanceState(next).sliders.padPostLPF, 3000, 'morph midpoint should resolve before endpoint replacement');
  next = reduceProductControlState(next, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'B2',
    sliders: stateWith({ padPostLPF: 9000 }),
  });
  const resolved = resolvePerformanceState(next);
  assert.equal(resolved.sliders.padPostLPF, 5000, 'endpoint replacement at midpoint should recompute visible slider immediately');
  assert.equal(resolved.productPatch.padPostLPF, 5000, 'endpoint replacement at midpoint should recompute Product patch immediately');
}

{
  let next = controlState({ padPostLPF: 1000 });
  next = reduceProductControlState(next, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0,
    triggerCritical: true,
  });
  next = reduceProductControlState(next, {
    type: 'morph/midpoint-edit',
    target: 'synth',
    key: 'padPostLPF',
    value: 2222,
  });
  next = reduceProductControlState(next, {
    type: 'morph/position-set',
    target: 'synth',
    position: 1,
    triggerCritical: true,
  });
  next = reduceProductControlState(next, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0,
    triggerCritical: true,
  });
  assert.equal(resolvePerformanceState(next).sliders.padPostLPF, 2222, 'endpoint A edits should persist after morphing away and back');
}

{
  const initial = controlState({ synthLevel: 0.2, synthEuclideanMasterEnabled: false, drumKickMorph: 0 });
  expectSoundActionChangesResolvedOutput(
    initial,
    { type: 'slider/edit', key: 'synthLevel', value: 0.3 },
    'slider/edit should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    initial,
    { type: 'slider/patch', patch: { synthLevel: 0.4 }, reason: 'ui-control-change', triggerCritical: true },
    'slider/patch should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    initial,
    { type: 'preset/load', presetId: 'preset-b', sliders: stateWith({ synthLevel: 0.5 }) },
    'preset/load should not bump revision without resolved output change',
  );

  let morphing = reduceProductControlState(initial, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'A',
    presetId: 'A',
    sliders: stateWith({ synthLevel: 0.1 }),
  });
  morphing = reduceProductControlState(morphing, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'B',
    sliders: stateWith({ synthLevel: 0.9 }),
  });
  morphing = reduceProductControlState(morphing, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0.25,
    triggerCritical: true,
  });
  expectSoundActionChangesResolvedOutput(
    morphing,
    { type: 'morph/position-set', target: 'synth', position: 0.75, triggerCritical: true },
    'morph/position-set should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    morphing,
    {
      type: 'morph/endpoint-replace',
      target: 'synth',
      endpoint: 'B',
      presetId: 'B2',
      sliders: stateWith({ synthLevel: 0.6 }),
    },
    'morph/endpoint-replace should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    reduceProductControlState(morphing, { type: 'morph/position-set', target: 'synth', position: 0, triggerCritical: true }),
    { type: 'morph/endpoint-edit', target: 'synth', endpoint: 'A', key: 'synthLevel', value: 0.6 },
    'morph/endpoint-edit should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    reduceProductControlState(morphing, { type: 'morph/position-set', target: 'synth', position: 0, triggerCritical: true }),
    { type: 'morph/midpoint-edit', target: 'synth', key: 'synthLevel', value: 0.55 },
    'morph/midpoint-edit should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    initial,
    { type: 'sequencer/edit', patch: { synthEuclideanMasterEnabled: true }, triggerCritical: true },
    'sequencer/edit should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    initial,
    { type: 'transport/edit', patch: { transportBeatsPerBar: 5 }, triggerCritical: true },
    'transport/edit should not bump revision without resolved output change',
  );
  expectSoundActionChangesResolvedOutput(
    controlState({ drumKickPresetA: 'Ikeda Kick', drumKickPresetB: 'Ikeda Kick', drumKickMorph: 0 }),
    { type: 'drum-morph/override-set', voice: 'kick', param: 'drumKickFreq', value: 72, morphPosition: 0 },
    'drum-morph/override-set should not bump revision without resolved output change',
  );
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
  let next = controlState();
  const initialRevision = next.revision;
  next = reduceProductControlState(next, {
    type: 'drum-morph/override-set',
    voice: 'kick',
    param: 'drumKickFreq',
    value: 72,
    morphPosition: 0,
  });
  assert.equal(next.revision, initialRevision + 1, 'drum morph value override should increment ProductControl revision');
  assert.equal(
    next.drumMorphOverrides.valueOverrides.kick.drumKickFreq?.value,
    72,
    'drum morph value override should be stored in ProductControl state',
  );
  next = reduceProductControlState(next, {
    type: 'drum-morph/dual-range-set',
    voice: 'kick',
    param: 'drumKickFreq',
    isDualMode: true,
    value: 72,
    range: { min: 50, max: 90 },
    endpoint: 0,
  });
  next = reduceProductControlState(next, {
    type: 'drum-morph/dual-range-set',
    voice: 'kick',
    param: 'drumKickFreq',
    isDualMode: false,
    value: 100,
    endpoint: 1,
  });
  const interpolated = interpolateProductDrumMorphDualRanges(
    next.drumMorphOverrides,
    'kick',
    0.5,
    { drumKickFreq: 72 },
  ).drumKickFreq;
  assert.deepEqual(
    interpolated,
    { isDualMode: true, range: { min: 75, max: 95 } },
    'drum morph dual ranges should interpolate from ProductControl-owned endpoints',
  );
  next = reduceProductControlState(next, {
    type: 'drum-morph/endpoint-clear',
    voice: 'kick',
    endpoint: 0,
  });
  assert.equal(
    next.drumMorphOverrides.valueOverrides.kick.drumKickFreq,
    undefined,
    'clearing endpoint 0 should remove value overrides authored at endpoint 0',
  );
  const remainingDualRange = getProductDrumMorphDualRangeOverrides(next.drumMorphOverrides, 'kick').drumKickFreq;
  assert.equal(remainingDualRange?.endpoint0, undefined, 'clearing endpoint 0 should remove endpoint 0 range state');
  assert.equal(remainingDualRange?.endpoint1?.value, 100, 'clearing endpoint 0 should preserve endpoint 1 range state');
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
    { revision: 12, reason: 'morph-control-change', triggerCritical: true, forceFullSnapshot: true },
  );
  assert.equal(resolved.revision, 12, 'visible slider commit should use the supplied revision');
  assert.equal(resolved.reason, 'morph-control-change', 'visible slider commit should preserve the transaction reason');
  assert.equal(resolved.triggerCritical, true, 'visible slider commit should preserve trigger-critical intent');
  assert.equal(resolved.applyMode, 'full-snapshot', 'visible slider commit should preserve explicit full-snapshot intent');
  assert.equal(resolved.sliders.synthLevel, 0.64, 'visible slider commit should resolve from visible sliders');
  assert.equal(resolved.productPatch.synthLevel, 0.64, 'visible slider commit patch should match visible sliders');
  assert.equal(resolved.productPatch.padMorph, 74, 'visible morph position should be included in the resolved patch');
}

{
  const initial = controlState({ synthLevel: 0.2 });
  const patched = reduceVisibleSliderPatchForProductCommit(
    initial,
    stateWith({ synthLevel: 0.42, padMorph: 33 }),
    { synthLevel: 0.42, padMorph: 33 },
    { reason: 'morph-control-change', triggerCritical: true },
  );
  assert.equal(patched.revision, initial.revision + 1, 'visible patch transaction should increment revision once');
  assert.equal(patched.lastReason, 'morph-control-change', 'visible patch transaction should preserve reducer reason');
  assert.equal(resolvePerformanceState(patched).sliders.synthLevel, 0.42, 'visible patch transaction should persist patched slider state');
  assert.equal(resolvePerformanceState(patched).sliders.padMorph, 33, 'visible patch transaction should persist patched runtime morph state');

  const committed = reduceVisibleSliderStateForProductCommit(
    initial,
    stateWith({ synthLevel: 0.42, padMorph: 33 }),
    { reason: 'morph-control-change', triggerCritical: true },
  );
  const resolved = resolvePerformanceState(committed);
  assert.equal(committed.revision, initial.revision + 1, 'visible slider transaction should increment revision once');
  assert.equal(resolved.sliders.synthLevel, 0.42, 'visible slider transaction should persist raw slider state');
  assert.equal(resolved.sliders.padMorph, 33, 'visible slider transaction should persist visible runtime morph state');
}

{
  let committedRevision = 6;
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      committedRevision = commit.revision;
      return {
        revision: commit.revision,
        applied: true,
        mode: commit.applyMode === 'full-snapshot' ? 'full-snapshot' as const : 'dirty-diff' as const,
      };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  await commitVisibleSliderStateForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.91 }),
    { reason: 'preset-load', triggerCritical: true, forceFullSnapshot: true },
  );
  await commitVisibleSliderStateForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.52, padMorph: 25 }),
    { reason: 'morph-control-change', triggerCritical: true },
  );
  const capturedCommit = capturedCommits[0];
  assert.ok(capturedCommit, 'visible slider commit should call commitResolvedState');
  assert.equal(capturedCommit.revision, 7, 'visible slider commit should allocate the next Product revision');
  assert.equal(capturedCommit.reason, 'preset-load', 'visible slider commit should forward preset transaction reason');
  assert.equal(capturedCommit.patch.synthLevel, 0.91, 'visible slider commit should patch the visible slider value');
  assert.equal(capturedCommit.triggerCritical, true, 'visible slider commit should forward trigger-critical flag');
  assert.equal(capturedCommit.applyMode, 'full-snapshot', 'visible slider commit should forward full-snapshot apply mode');
  const secondCommit = capturedCommits[1];
  assert.ok(secondCommit, 'persistent visible slider commit should call commitResolvedState again');
  assert.equal(secondCommit.revision, 8, 'persistent visible slider commits should continue from the stored reducer revision');
  assert.equal(secondCommit.reason, 'morph-control-change', 'persistent visible slider commit should forward the second reason');
  assert.equal(secondCommit.patch.padMorph, 25, 'persistent visible slider commit should include the later visible slider value');
  assert.equal(secondCommit.applyMode, undefined, 'non-forced visible slider commit should not request a full snapshot');
}

{
  let committedRevision = 10;
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'full-snapshot' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  await commitProductControlPatchForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.91, padMorph: 0 }),
    { synthLevel: 0.91 },
    { reason: 'ui-control-change', triggerCritical: true },
  );
  await commitProductControlPatchForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.52, padMorph: 25 }),
    { padMorph: 25 },
    { reason: 'morph-control-change', triggerCritical: true },
  );
  const firstCommit = capturedCommits[0];
  assert.ok(firstCommit, 'ProductControl patch commit should call commitResolvedState');
  assert.equal(firstCommit.revision, 11, 'ProductControl patch commit should allocate the next Product revision');
  assert.equal(firstCommit.patch.synthLevel, 0.91, 'ProductControl patch commit should apply the patched slider value');
  const secondCommit = capturedCommits[1];
  assert.ok(secondCommit, 'ProductControl patch commit should persist reducer state across commits');
  assert.equal(secondCommit.revision, 12, 'ProductControl patch commits should continue from stored reducer revision');
  assert.equal(secondCommit.patch.padMorph, 25, 'ProductControl patch commit should apply the later patch value');
  assert.equal(
    secondCommit.patch.synthLevel,
    0.91,
    'ProductControl patch commit must not accept unpatched nextState keys as authoritative reducer changes',
  );
}

{
  let committedRevision = 40;
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'full-snapshot' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  await commitProductControlPatchForProduct(
    fakeProductEngine,
    stateWith({ lead1PresetB: 'soft_rhodes' }),
    { lead1PresetB: 'soft_rhodes' },
    { reason: 'ui-control-change', triggerCritical: true, forceFullSnapshot: true },
  );
  const capturedCommit = capturedCommits[0];
  assert.ok(capturedCommit, 'Lead preset ProductControl commit should call commitResolvedState');
  assert.equal(capturedCommit.revision, 41, 'Lead preset data hydration should share the preset edit revision');
  assert.equal(capturedCommit.patch.lead1PresetB, 'soft_rhodes', 'Lead preset commit should include the selected endpoint id');
  assert.equal(
    (capturedCommit.patch.lead1PresetBData as Record<string, unknown> | undefined)?.id,
    'soft_rhodes',
    'Lead preset commit should carry resolved preset data in the same ProductControl patch',
  );
}

{
  let committedRevision = 70;
  let releaseFirstCommit = (): void => undefined;
  const firstCommitGate = new Promise<void>((resolve) => {
    releaseFirstCommit = resolve;
  });
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      if (capturedCommits.length === 1) await firstCommitGate;
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'dirty-diff' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  const firstCommit = commitProductControlPatchForProduct(
    fakeProductEngine,
    stateWith({ padPresetA: 'glass_shimmer', padPresetB: 'init', padMorph: 0 }),
    { padPresetA: 'glass_shimmer' },
    { reason: 'ui-control-change', triggerCritical: true },
  );
  await waitForCondition(
    () => capturedCommits.length === 1,
    'first queued ProductControl commit should start immediately',
  );
  const secondCommit = commitProductControlPatchForProduct(
    fakeProductEngine,
    stateWith({ padPresetA: 'glass_shimmer', padPresetB: 'init', padMorph: 0.25 }),
    { padMorph: 0.25 },
    { reason: 'morph-control-change', triggerCritical: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(capturedCommits.length, 1, 'second ProductControl commit should wait for the first receipt');
  releaseFirstCommit();
  await Promise.all([firstCommit, secondCommit]);
  const secondCapturedCommit = capturedCommits[1];
  assert.ok(secondCapturedCommit, 'queued ProductControl commit should run after first receipt');
  assert.equal(secondCapturedCommit.revision, 72, 'queued ProductControl commits should allocate revisions in receipt order');
  assert.equal(
    secondCapturedCommit.patch.padPresetA,
    'glass_shimmer',
    'queued morph commit must retain the preceding Pad endpoint change',
  );
  assert.equal(secondCapturedCommit.patch.padMorph, 0.25, 'queued morph commit should still apply the latest morph value');
}

{
  let committedRevision = 30;
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'event' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  const event = { type: 'sequencer-control-test', value: 7 } as unknown as NonNullable<ProductResolvedStateCommit['events']>[number];
  await commitProductControlActionForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.66 }),
    {
      type: 'sequencer/edit',
      patch: { synthEuclid1Swing: 0.25 },
      triggerCritical: true,
    },
    {
      reason: 'sequencer-control-change',
      triggerCritical: true,
      productEvents: [event],
    },
  );
  await commitProductControlActionForProduct(
    fakeProductEngine,
    stateWith({ synthLevel: 0.72 }),
    {
      type: 'sequencer/edit',
      patch: { synthEuclid1Probability: 0.5 },
      triggerCritical: true,
    },
    {
      reason: 'sequencer-control-change',
      triggerCritical: true,
      productEvents: [event],
    },
  );
  const capturedCommit = capturedCommits[0];
  assert.ok(capturedCommit, 'ProductControl action commit should call commitResolvedState');
  assert.equal(capturedCommit.revision, 31, 'ProductControl sequencer action should allocate a revision');
  assert.equal(capturedCommit.reason, 'sequencer-control-change', 'ProductControl sequencer action should forward its reason');
  assert.equal(capturedCommit.patch.synthLevel, 0.66, 'ProductControl sequencer action should resolve from current visible sliders');
  assert.deepEqual(capturedCommit.events, [event], 'ProductControl sequencer action should carry generated Product events atomically');
  const secondCommit = capturedCommits[1];
  assert.ok(secondCommit, 'ProductControl sequencer action should keep committing subsequent live edits');
  assert.equal(secondCommit.revision, 33, 'ProductControl sequencer action should commit the final synced reducer revision');
  assert.equal(
    secondCommit.patch.synthLevel,
    0.72,
    'ProductControl sequencer action must sync changed visible sliders into raw slider state before sequencer edits',
  );
}

{
  const calls: string[] = [];
  let committedRevision = 20;
  const capturedCommits: ProductResolvedStateCommit[] = [];
  const fakeProductEngine = {
    commitResolvedState: async (commit: ProductResolvedStateCommit) => {
      capturedCommits.push(commit);
      calls.push(`commit:${commit.revision}`);
      committedRevision = commit.revision;
      return { revision: commit.revision, applied: true, mode: 'full-snapshot' as const };
    },
    getCommittedStateRevision: () => committedRevision,
  } as unknown as ProductEnginePort;
  await commitProductControlActionThenTrigger(
    fakeProductEngine,
    stateWith({ synthLevel: 0.88 }),
    { type: 'manual-trigger/request', source: 'pad1' },
    (revision) => calls.push(`trigger:${revision}`),
  );
  const capturedCommit = capturedCommits[0];
  assert.ok(capturedCommit, 'manual trigger helper should commit the visible ProductControl state');
  assert.equal(capturedCommit.revision, 21, 'first manual trigger should allocate a revision for the visible state sync');
  assert.equal(capturedCommit.patch.synthLevel, 0.88, 'manual trigger helper should commit current visible sliders before triggering');
  assert.deepEqual(calls, ['commit:21', 'trigger:21'], 'manual trigger helper should commit before invoking trigger callback');
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
