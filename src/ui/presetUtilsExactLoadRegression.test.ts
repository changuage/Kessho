import assert from 'node:assert/strict';
import { applyPreset } from './presetUtils';
import { DEFAULT_STATE, type SavedPreset, type SliderState } from './state';

function normalize(state: SliderState): SliderState {
  return state;
}

function makePreset(state: Partial<SliderState>): SavedPreset {
  return {
    name: 'six-lane exact load',
    timestamp: '2026-06-20T00:00:00.000Z',
    state: {
      ...DEFAULT_STATE,
      ...state,
    },
  };
}

const maximalSixLanePreset = makePreset({
  drumEnabled: true,
  drumLevel: 0,
  drumReverbSend: 0,
  drumDelayASend: 0,
  drumDelayBSend: 0,
  granularDrumSend: 0,
  drumEuclidMasterEnabled: true,
  synthEuclideanMasterEnabled: true,
  drumEuclid5Enabled: true,
  drumEuclid5Steps: 17,
  drumEuclid5Hits: 5,
  drumEuclid5Rotation: 3,
  drumEuclid6Enabled: true,
  drumEuclid6Steps: 19,
  drumEuclid6Hits: 7,
  drumEuclid6Rotation: 4,
});

const exact = applyPreset(maximalSixLanePreset, { loadMode: 'exact-as-saved', normalize });
assert.equal(exact.state.drumEuclidMasterEnabled, maximalSixLanePreset.state.drumEuclidMasterEnabled);
assert.equal(exact.state.synthEuclideanMasterEnabled, maximalSixLanePreset.state.synthEuclideanMasterEnabled);
assert.equal(exact.state.drumEnabled, true);
assert.equal(exact.state.drumEuclid5Enabled, true);
assert.equal(exact.state.drumEuclid6Enabled, true);
assert.equal(exact.safeAuditionChanged, false);
assert.equal(exact.transportDisabledByLoadMode, false);

const safe = applyPreset(maximalSixLanePreset, { loadMode: 'safe-audition', normalize });
assert.equal(safe.transportDisabledByLoadMode, true);
assert.equal(safe.state.drumEuclidMasterEnabled, false);
assert.equal(safe.state.synthEuclideanMasterEnabled, false);
assert.equal(safe.state.drumEnabled, false);

const currentWithoutLegacyProgression = makePreset({});
for (const key of [
  'chordProgressionEnabled',
  'chordProgressionPattern',
  'chordProgressionSteps',
  'chordProgressionHits',
  'chordProgressionRotation',
  'chordProgressionStepEnabled',
  'chordProgressionPhraseMultiplier',
  'chordProgressionClockSource',
] as const) {
  delete (currentWithoutLegacyProgression.state as Partial<SliderState>)[key];
}
assert.doesNotThrow(
  () => applyPreset(currentWithoutLegacyProgression, { loadMode: 'exact-as-saved', normalize }),
  'removed legacy progression fields must not be required by the current apply contract',
);

const currentWithoutSpectralFreezeFields = makePreset({});
for (const key of [
  'spectralFreezeMode',
  'spectralFreezeCaptureSerial',
  'spectralFreezeStretchSpeed',
  'spectralFreezeDirection',
  'spectralFreezePosition',
  'spectralFreezeRefresh',
  'spectralFreezeInputSensitivity',
  'spectralFreezeDiffusion',
] as const) {
  delete (currentWithoutSpectralFreezeFields.state as Partial<SliderState>)[key];
}
const completedFreeze = applyPreset(currentWithoutSpectralFreezeFields, { loadMode: 'exact-as-saved', normalize });
assert.equal(completedFreeze.state.spectralFreezeEnabled, false);
assert.equal(completedFreeze.state.spectralFreezeActive, false);
assert.equal(completedFreeze.state.spectralFreezeCaptureSerial, 0);
assert.equal(completedFreeze.state.spectralFreezeMode, DEFAULT_STATE.spectralFreezeMode);
assert.equal(completedFreeze.state.spectralFreezeDiffusion, DEFAULT_STATE.spectralFreezeDiffusion);

const authoredFreeze = applyPreset(makePreset({
  spectralFreezeEnabled: true,
  spectralFreezeActive: true,
  spectralFreezeCaptureSerial: 99,
  spectralFreezeMode: 'slushy',
  spectralFreezeDiffusion: 0.91,
}), { loadMode: 'exact-as-saved', normalize });
assert.equal(authoredFreeze.state.spectralFreezeEnabled, true);
assert.equal(authoredFreeze.state.spectralFreezeMode, 'slushy');
assert.equal(authoredFreeze.state.spectralFreezeDiffusion, 0.91);
assert.equal(authoredFreeze.state.spectralFreezeActive, false);
assert.equal(authoredFreeze.state.spectralFreezeCaptureSerial, 0);

const currentWithoutAdditiveSynthLaneFields = makePreset({});
for (const lane of [1, 2, 3, 4] as const) {
  for (const suffix of ['ResumeQuantization', 'NoteMin', 'NoteMax'] as const) {
    delete (currentWithoutAdditiveSynthLaneFields.state as unknown as Record<string, unknown>)[`synthEuclid${lane}${suffix}`];
  }
}
const completedSynthLanes = applyPreset(currentWithoutAdditiveSynthLaneFields, { loadMode: 'exact-as-saved', normalize });
for (const lane of [1, 2, 3, 4] as const) {
  for (const suffix of ['ResumeQuantization', 'NoteMin', 'NoteMax'] as const) {
    const key = `synthEuclid${lane}${suffix}` as keyof SliderState;
    assert.equal(completedSynthLanes.state[key], DEFAULT_STATE[key]);
  }
}

const authoredSynthLaneFields = applyPreset(makePreset({
  synthEuclid1ResumeQuantization: 'immediate',
  synthEuclid1NoteMin: 60,
  synthEuclid1NoteMax: 84,
}), { loadMode: 'exact-as-saved', normalize });
assert.equal(authoredSynthLaneFields.state.synthEuclid1ResumeQuantization, 'immediate');
assert.equal(authoredSynthLaneFields.state.synthEuclid1NoteMin, 60);
assert.equal(authoredSynthLaneFields.state.synthEuclid1NoteMax, 84);

const currentWithoutDrumResumeQuantization = makePreset({});
for (const lane of [1, 2, 3, 4, 5, 6] as const) {
  delete (currentWithoutDrumResumeQuantization.state as unknown as Record<string, unknown>)[`drumEuclid${lane}ResumeQuantization`];
}
const completedDrumResumeQuantization = applyPreset(currentWithoutDrumResumeQuantization, {
  loadMode: 'exact-as-saved',
  normalize,
});
for (const lane of [1, 2, 3, 4, 5, 6] as const) {
  const key = `drumEuclid${lane}ResumeQuantization` as keyof SliderState;
  assert.equal(completedDrumResumeQuantization.state[key], DEFAULT_STATE[key]);
}

const currentWithoutPerLeadPerformanceFields = makePreset({
  leadVibratoDepth: 0.2,
  leadVibratoRate: 0.3,
  leadGlide: 0.4,
});
for (const lead of [1, 2] as const) {
  for (const suffix of ['VibratoDepth', 'VibratoRate', 'Glide'] as const) {
    delete (currentWithoutPerLeadPerformanceFields.state as unknown as Record<string, unknown>)[`lead${lead}${suffix}`];
  }
}
const completedPerLeadFields = applyPreset(currentWithoutPerLeadPerformanceFields, { loadMode: 'exact-as-saved', normalize });
assert.equal(completedPerLeadFields.state.lead1VibratoDepth, 0.2);
assert.equal(completedPerLeadFields.state.lead2VibratoRate, 0.3);
assert.equal(completedPerLeadFields.state.lead1Glide, 0.4);

const currentWithoutCanonicalFields = makePreset({
  granularDelayEnabled: true,
} as Partial<SliderState>);
delete (currentWithoutCanonicalFields.state as Partial<SliderState>).detune;
delete (currentWithoutCanonicalFields.state as Partial<SliderState>).granularDelayBSend;
const completedCanonicalFields = applyPreset(currentWithoutCanonicalFields, {
  loadMode: 'exact-as-saved',
  normalize,
});
assert.equal(completedCanonicalFields.state.detune, DEFAULT_STATE.detune);
assert.equal(completedCanonicalFields.state.granularDelayBSend, DEFAULT_STATE.granularDelayBSend);

assert.throws(
  () => applyPreset(makePreset({ detune: Number.NaN }), { loadMode: 'exact-as-saved', normalize }),
  /Product Core preset boundary validation failed/,
  'authored malformed values must still fail current-contract validation',
);

console.log('preset exact load regression passed');
