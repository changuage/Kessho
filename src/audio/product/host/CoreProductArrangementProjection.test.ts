import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreProductArrangementProjection } from './CoreProductArrangementProjection';

test('projects the exact core-scheduled chord and random-timing notes', () => {
  const projection = new CoreProductArrangementProjection(() => {}, () => null);
  projection.start({
    phraseLength: 16,
    harmonyClockSource: 'globalPhrase',
    leadRandomClockSource: 'globalPhrase',
    lead1Octave: 0,
    lead1OctaveRange: 2,
    synthChordGeneratorEnabled: true,
    synthAttack: 0.01,
    synthDecay: 0.01,
    synthSustain: 1,
    synthRelease: 30,
  });
  projection.setRuntimePlanCaptureEnabled({ padChord: true, randomTiming: true });
  projection.syncTransportTelemetry({
    schemaHash: 1,
    sampleRate: 48_000,
    blockSize: 128,
    transportRunning: true,
    absoluteSampleTime: 72_000,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    simpleSequencerVisualEvents: [
      {
        eventId: 1,
        absoluteSample: 60_000,
        phraseStartSample: 48_000,
        phraseIndex: 3,
        kind: 'padChord',
        targetSourceId: 1,
        midiNote: 72,
        velocity: 0.8,
        gateSeconds: 1.25,
        voiceIndex: 2,
        phraseSeconds: 16,
        triggerIntervalSeconds: 4,
      },
      {
        eventId: 2,
        absoluteSample: 72_000,
        phraseStartSample: 48_000,
        phraseIndex: 7,
        kind: 'randomTiming',
        targetSourceId: 3,
        midiNote: 79,
        velocity: 0.65,
        gateSeconds: 0.5,
        voiceIndex: 1,
        phraseSeconds: 16,
        triggerIntervalSeconds: 16,
      },
    ],
  });

  const debug = projection.getTransportDebugState();
  assert.equal(debug?.simpleSequencerPlansAuthoritative, true);
  assert.equal(debug?.padChordPlan?.notes[0]?.midi, 72);
  assert.equal(debug?.padChordPlan?.notes[0]?.triggerSeconds, 0.25);
  assert.equal(debug?.padChordPlan?.notes[0]?.envelope.gateSeconds, 1.25);
  assert.equal(debug?.randomTimingPlan?.notes[0]?.midi, 79);
  assert.equal(debug?.randomTimingPlan?.notes[0]?.triggerSeconds, 0.5);
  assert.equal(debug?.randomTimingPlan?.notes[0]?.source, 'lead1');

  projection.syncTransportTelemetry({
    schemaHash: 1,
    sampleRate: 48_000,
    blockSize: 128,
    transportRunning: true,
    absoluteSampleTime: 144_000,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    simpleSequencerVisualEvents: [{
      eventId: 3,
      absoluteSample: 144_000,
      phraseStartSample: 48_000,
      phraseIndex: 3,
      kind: 'padChord',
      targetSourceId: 1,
      midiNote: 84,
      velocity: 0.9,
      gateSeconds: 1,
      voiceIndex: 2,
      phraseSeconds: 16,
      triggerIntervalSeconds: 16,
    }],
  });
  const rebuilt = projection.getTransportDebugState();
  assert.deepEqual(rebuilt?.padChordPlan?.notes.map((note) => note.midi), [72]);
  assert.equal(rebuilt?.previousPadChordPlan, null, 'an in-phrase event must not rewrite the sealed phrase plan');

  projection.syncTransportTelemetry({
    schemaHash: 1,
    sampleRate: 48_000,
    blockSize: 128,
    transportRunning: true,
    absoluteSampleTime: 816_000,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    simpleSequencerVisualEvents: [{
      eventId: 4,
      absoluteSample: 816_000,
      phraseStartSample: 816_000,
      phraseIndex: 4,
      kind: 'padChord',
      targetSourceId: 1,
      midiNote: 96,
      velocity: 0.7,
      gateSeconds: 1,
      voiceIndex: 0,
      phraseSeconds: 16,
      triggerIntervalSeconds: 16,
    }],
  });
  const nextPhrase = projection.getTransportDebugState();
  assert.deepEqual(nextPhrase?.padChordPlan?.notes.map((note) => note.midi), [96]);
  assert.deepEqual(nextPhrase?.previousPadChordPlan?.notes.map((note) => note.midi), [72],
    'a still-ringing note must carry into the new phrase animation');
  assert.ok((nextPhrase?.previousPadChordPlan?.notes[0]?.triggerSeconds ?? 0) < 0,
    'the carried note should be repositioned at the start of the new phrase timeline');
});

test('does not retain plans after visual demand is disabled', () => {
  const projection = new CoreProductArrangementProjection(() => {}, () => null);
  projection.start({ phraseLength: 16 });
  projection.setRuntimePlanCaptureEnabled({ padChord: false, randomTiming: false });
  const debug = projection.getTransportDebugState();
  assert.equal(debug?.padChordPlan, null);
  assert.equal(debug?.randomTimingPlan, null);
});
