import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SOFT_RHODES,
  applyLead4opPresetOwnedParamsToState,
  resolveLead4opPresetDualState,
  withLead4opPresetOwnedState,
  type Lead4opFMPreset,
} from './lead4opfm';

function preset(
  id: string,
  distance: number,
  vibratoDepth: number,
  range?: { min: number; max: number },
): Lead4opFMPreset {
  return {
    ...DEFAULT_SOFT_RHODES,
    id,
    name: id,
    params: {
      ...DEFAULT_SOFT_RHODES.params,
      envelope: { ...DEFAULT_SOFT_RHODES.params.envelope, hold: distance },
      distance,
      postLpfHz: 18000 - distance * 8000,
      postLpfKeyTracking: distance,
      stereoWidth: 1 - distance * 0.5,
      diffuseSend: distance,
      vibratoDepth,
      vibratoRate: vibratoDepth * 0.5,
      glide: vibratoDepth * 0.25,
    },
    dualRanges: range ? { distance: range } : undefined,
    sliderModes: range ? { distance: 'sampleHold' } : undefined,
  };
}

test('Lead preset morph projects placement and independent expression into the selected Lead', () => {
  const a = preset('a', 0.2, 0.1);
  const b = preset('b', 0.8, 0.9);
  const projected = applyLead4opPresetOwnedParamsToState<Record<string, unknown>>({}, 'lead2', a, b, 0.25);

  assert.ok(Math.abs(Number(projected.lead2Distance) - 0.35) < 1e-12);
  assert.ok(Math.abs(Number(projected.lead2Hold) - 0.35) < 1e-12);
  assert.ok(Math.abs(Number(projected.lead2VibratoDepth) - 0.3) < 1e-12);
  assert.ok(Math.abs(Number(projected.lead2Glide) - 0.075) < 1e-12);
  assert.equal(projected.lead1Distance, undefined);
});

test('Lead preset dual metadata morphs and maps canonical fields to scoped slider keys', () => {
  const a = preset('a', 0.2, 0.1, { min: 0.1, max: 0.3 });
  const b = preset('b', 0.8, 0.9, { min: 0.6, max: 1 });
  const resolved = resolveLead4opPresetDualState('lead1', a, b, 0.5);

  assert.ok(Math.abs(resolved.dualRanges.lead1Distance!.min - 0.35) < 1e-12);
  assert.ok(Math.abs(resolved.dualRanges.lead1Distance!.max - 0.65) < 1e-12);
  assert.equal(resolved.sliderModes.lead1Distance, 'sampleHold');
  assert.ok(resolved.relevantKeys.includes('lead1VibratoDepth'));
  assert.equal(resolved.relevantKeys.includes('lead2VibratoDepth'), false);
});

test('Lead preset save capture uses canonical metadata and excludes routing sends', () => {
  const captured = withLead4opPresetOwnedState(
    preset('a', 0, 0),
    'lead1',
    {
      lead1Hold: 0.7,
      lead1Distance: 0.4,
      lead1PostLPF: 12000,
      lead1PostLPFKeyTracking: 0.25,
      lead1StereoWidth: 0.8,
      lead1DiffuseSend: 0.2,
      lead1VibratoDepth: 0.35,
      lead1VibratoRate: 0.45,
      lead1Glide: 0.15,
      lead1DelayASend: 0.9,
    },
    { lead1VibratoDepth: { min: 0.2, max: 0.5 } },
    { lead1VibratoDepth: 'walk' },
  );

  assert.equal(captured.params.envelope.hold, 0.7);
  assert.equal(captured.params.distance, 0.4);
  assert.equal(captured.params.vibratoDepth, 0.35);
  assert.deepEqual(captured.dualRanges, { vibratoDepth: { min: 0.2, max: 0.5 } });
  assert.equal('lead1DelayASend' in captured.params, false);
});
