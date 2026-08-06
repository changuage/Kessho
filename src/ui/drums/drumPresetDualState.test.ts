import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeDrumPreset, upsertUserPreset } from '../../audio/drumPresets';
import { resolveDrumPresetDualState } from './drumPresetApply';

const presetAName = '__kick-dual-state-a__';
const presetBName = '__kick-dual-state-b__';
const singlePresetName = '__kick-dual-state-single__';

upsertUserPreset('kick', createRuntimeDrumPreset(
  'kick',
  presetAName,
  { drumKickFreq: 50 },
  [],
  { drumKickFreq: { min: 40, max: 60 } },
  { drumKickFreq: 'walk' },
));
upsertUserPreset('kick', createRuntimeDrumPreset(
  'kick',
  presetBName,
  { drumKickFreq: 100 },
  [],
  { drumKickFreq: { min: 80, max: 120 } },
  { drumKickFreq: 'sampleHold' },
));
upsertUserPreset('kick', createRuntimeDrumPreset(
  'kick',
  singlePresetName,
  { drumKickFreq: 70 },
));

test('drum preset changes restore and morph dual slider state', () => {
  const atA = resolveDrumPresetDualState('kick', presetAName, presetBName, 0);
  assert.deepEqual(atA.dualRanges.drumKickFreq, { min: 40, max: 60 });
  assert.equal(atA.sliderModes.drumKickFreq, 'walk');

  const atB = resolveDrumPresetDualState('kick', presetAName, presetBName, 1);
  assert.deepEqual(atB.dualRanges.drumKickFreq, { min: 80, max: 120 });
  assert.equal(atB.sliderModes.drumKickFreq, 'sampleHold');

  const single = resolveDrumPresetDualState('kick', presetAName, singlePresetName, 1);
  assert.equal(single.dualRanges.drumKickFreq, undefined);
  assert.ok(single.relevantKeys.includes('drumKickFreq'));
});

test('runtime drum presets retain only applicable dual metadata', () => {
  const preset = createRuntimeDrumPreset(
    'kick',
    'Runtime',
    { drumKickFreq: 55 },
    [],
    {
      drumKickFreq: { min: 45, max: 65 },
      unrelated: { min: 0, max: 1 },
    },
    { drumKickFreq: 'sampleHold', unrelated: 'walk' },
  );

  assert.deepEqual(preset.dualRanges, { drumKickFreq: { min: 45, max: 65 } });
  assert.deepEqual(preset.sliderModes, { drumKickFreq: 'sampleHold' });
});
