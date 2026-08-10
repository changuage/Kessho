import assert from 'node:assert/strict';
import test from 'node:test';
import { getPadPreset, PAD_PRESET_PARAM_KEYS, PAD_PRESETS } from './padPresets';

test('factory pad bank is complete and every value is usable', () => {
  const allowedKeys = new Set<string>(PAD_PRESET_PARAM_KEYS);

  for (const [id, rawPreset] of Object.entries(PAD_PRESETS)) {
    const preset = getPadPreset(id);
    assert.ok(preset, `missing normalized preset ${id}`);

    for (const key of Object.keys(rawPreset.params)) {
      assert.ok(allowedKeys.has(key), `${id} has unknown parameter ${key}`);
    }
    for (const key of PAD_PRESET_PARAM_KEYS) {
      const value = preset.params[key];
      assert.notEqual(value, undefined, `${id} is missing ${key}`);
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${id}.${key} is not finite`);
    }
  }
});

test('factory bank covers the synth showcase palette', () => {
  const presets = Object.keys(PAD_PRESETS).map((id) => getPadPreset(id)!);
  const waves = new Set(presets.flatMap(({ params }) => [params.padOscAWave, params.padOscBWave]));
  const destinations = new Set(presets.flatMap(({ params }) => [
    params.padLfo1Dest,
    params.padLfo2Dest,
    params.padModEnvDest,
  ]));
  const tags = new Set(presets.flatMap(({ tags: presetTags }) => presetTags));

  assert.deepEqual(waves, new Set([
    'sine', 'triangle', 'sawtooth', 'square', 'harmonic', 'complexSine', 'complexTriangle',
  ]));
  for (const destination of [
    'oscAPosition', 'oscBPosition', 'oscAPhaseDistortion', 'oscBPhaseDistortion',
    'oscBLinearHzOffset', 'filterResonance', 'foldAmount',
  ]) {
    assert.ok(destinations.has(destination), `missing showcase destination ${destination}`);
  }
  for (const tag of ['pad', 'strings', 'bass', 'lead', '80s', 'ear candy']) {
    assert.ok(tags.has(tag), `missing showcase category ${tag}`);
  }
  assert.deepEqual(new Set(presets.map(({ params }) => params.padPhaseReset)), new Set([0, 1, 2]));
  assert.deepEqual(new Set(presets.map(({ params }) => params.padFoldMode)), new Set([0, 1, 2]));
});

test('Saturated Drift is preserved and its modern companion uses the new engine', () => {
  const original = getPadPreset('saturated_drift')!;
  assert.deepEqual({
    waveA: original.params.padOscAWave,
    waveB: original.params.padOscBWave,
    pitchB: original.params.padOscBPitch,
    noise: original.params.padNoiseLevel,
    hardness: original.params.hardness,
    cutoff: original.params.filterCutoff,
    attack: original.params.synthAttack,
    release: original.params.synthRelease,
    lfoRate: original.params.padLfo1Rate,
    lfoDepth: original.params.padLfo1Depth,
    lfoDestination: original.params.padLfo1Dest,
  }, {
    waveA: 'sawtooth',
    waveB: 'triangle',
    pitchB: 0.08,
    noise: 0.36,
    hardness: 0.56,
    cutoff: 865,
    attack: 6,
    release: 12,
    lfoRate: 0.09,
    lfoDepth: 1,
    lfoDestination: 'filterCutoff',
  });

  const modern = getPadPreset('saturated_drift_ii')!;
  assert.equal(modern.params.filterType, 'ladderLp');
  assert.ok(Number(modern.params.padDrift) > 0);
  assert.ok(Number(modern.params.padFoldAmount) > 0);
  assert.ok(Number(modern.params.padOscAWavePosition) > 0);
  assert.ok(Number(modern.params.padOscBWavePosition) > 0);
  assert.notEqual(modern.params.padOscAPhaseDistortion, 0);
  assert.notEqual(modern.params.padOscBLinearHzOffset, 0);
});
