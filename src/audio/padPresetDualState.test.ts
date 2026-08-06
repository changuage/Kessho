import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimePadPreset, resolvePadPresetDualState, upsertUserPadPreset } from './padPresets';

const presetAId = '__dual-state-a__';
const presetBId = '__dual-state-b__';
const presetSingleId = '__dual-state-single__';

upsertUserPadPreset('pad1', {
  id: presetAId,
  name: 'Dual state A',
  library: 'user',
  preset: {
    name: 'Dual state A',
    tags: [],
    params: { filterCutoff: 200 },
    dualRanges: { filterCutoff: { min: 100, max: 300 } },
    sliderModes: { filterCutoff: 'walk' },
  },
});
upsertUserPadPreset('pad1', {
  id: presetBId,
  name: 'Dual state B',
  library: 'user',
  preset: {
    name: 'Dual state B',
    tags: [],
    params: { filterCutoff: 1500 },
    dualRanges: { filterCutoff: { min: 1000, max: 2000 } },
    sliderModes: { filterCutoff: 'sampleHold' },
  },
});
upsertUserPadPreset('pad1', {
  id: presetSingleId,
  name: 'Single state',
  library: 'user',
  preset: {
    name: 'Single state',
    tags: [],
    params: { filterCutoff: 900 },
  },
});

test('pad preset changes restore and morph dual slider state', () => {
  const atA = resolvePadPresetDualState('pad1', presetAId, presetBId, 0);
  assert.deepEqual(atA.dualRanges.filterCutoff, { min: 100, max: 300 });
  assert.equal(atA.sliderModes.filterCutoff, 'walk');

  const atB = resolvePadPresetDualState('pad1', presetAId, presetBId, 1);
  assert.deepEqual(atB.dualRanges.filterCutoff, { min: 1000, max: 2000 });
  assert.equal(atB.sliderModes.filterCutoff, 'sampleHold');

  const single = resolvePadPresetDualState('pad1', presetAId, presetSingleId, 1);
  assert.equal(single.dualRanges.filterCutoff, undefined);
  assert.ok(single.relevantKeys.includes('filterCutoff'));
});

test('pad 2 dual slider state maps canonical preset keys to pad 2 controls', () => {
  upsertUserPadPreset('pad2', {
    id: presetAId,
    name: 'Pad 2 dual state A',
    library: 'user',
    preset: createRuntimePadPreset(
      'pad2',
      'Pad 2 dual state A',
      { pad2FilterCutoff: 200 },
      [],
      { pad2FilterCutoff: { min: 100, max: 300 } },
      { pad2FilterCutoff: 'sampleHold' },
    ),
  });

  const result = resolvePadPresetDualState('pad2', presetAId, presetAId, 0);
  assert.deepEqual(result.dualRanges.pad2FilterCutoff, { min: 100, max: 300 });
  assert.equal(result.sliderModes.pad2FilterCutoff, 'sampleHold');
});
