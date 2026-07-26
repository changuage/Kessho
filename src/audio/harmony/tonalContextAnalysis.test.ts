import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzePlayingAndPreview,
  analyzeTonalContext,
  tonalContextDisplay,
} from './tonalContextAnalysis';
import {
  HarmonyEvidenceAccumulator,
  harmonyEvidenceFromSeqTelemetry,
  harmonyEvidenceFromTriggerObservations,
} from './harmonyEvidence';

const C = 0;
const A = 9;
const D = 2;
const G = 7;

function event(kind: 'playedChord' | 'progression' | 'seqTrigger' | 'livePlay', rootPitchClass: number, notes: readonly number[], timestampMs: number, extra: Record<string, unknown> = {}) {
  return { kind, rootPitchClass, notes, timestampMs, audible: true, ...extra } as const;
}

function analysis(events: readonly ReturnType<typeof event>[]) {
  return analyzeTonalContext({ engine: { rootPitchClass: C, scaleId: 1 }, evidence: events, nowMs: 4000 });
}

test('Cmaj7–Am7–Dm7–G7 strongly infers C Ionian', () => {
  const result = analysis([
    event('progression', C, [60, 64, 67, 71], 0),
    event('progression', A, [57, 60, 64, 67], 1000),
    event('progression', D, [62, 65, 69, 72], 2000),
    event('progression', G, [55, 59, 62, 65], 3000),
  ]);
  assert.equal(result.top?.rootPitchClass, C);
  assert.equal(result.top?.scaleId, 1);
  assert.ok(result.confidence > 0.15, `expected a confident context, got ${result.confidence}`);
});

test('Am7–Dm–E7–Am supports A harmonic minor', () => {
  const result = analyzeTonalContext({
    engine: { rootPitchClass: A, scaleId: 2 },
    evidence: [
      event('progression', A, [57, 60, 64, 67], 0),
      event('progression', D, [62, 65, 69], 1000),
      event('progression', 4, [64, 68, 71], 2000),
      event('progression', A, [57, 60, 64, 69], 3000),
    ],
    nowMs: 4000,
  });
  assert.equal(result.top?.rootPitchClass, A);
  assert.equal(result.top?.scaleId, 9);
});

test('single ambiguous Am7 does not force a context', () => {
  const result = analysis([event('playedChord', A, [57, 60, 64, 67], 0)]);
  assert.equal(result.top, null, 'single chord must remain uncommitted');
  assert.equal(result.insufficientEvidence, true);
});

test('muted lanes contribute nothing and trigger bridge uses hit deltas', () => {
  const muted = harmonyEvidenceFromSeqTelemetry({
    nowMs: 1000,
    previousHitCounts: { 'synth:0': 2 },
    lanes: [{ laneId: 'synth:0', enabled: true, muted: true, hitCount: 3, currentStep: 1, midiNotes: [60, 64] }],
  });
  assert.equal(muted.events.length, 0);
  const silent = harmonyEvidenceFromSeqTelemetry({
    nowMs: 1000,
    previousHitCounts: { 'synth:0': 2 },
    lanes: [{ laneId: 'synth:0', enabled: true, hitCount: 2, currentStep: 1, midiNotes: [60, 64] }],
  });
  assert.equal(silent.events.length, 0, 'configured steps without a new trigger are not evidence');
  const unresolved = harmonyEvidenceFromSeqTelemetry({
    nowMs: 1000,
    previousHitCounts: { 'synth:0': 2 },
    lanes: [{ laneId: 'synth:0', enabled: true, hitCount: 3, currentStep: 1 }],
  });
  assert.equal(unresolved.events.length, 0, 'payload-less trigger ordinals must not force a tonal context');
  assert.equal(unresolved.hitCounts['synth:0'], 3);
  const resolved = harmonyEvidenceFromTriggerObservations([{ laneId: 'synth:0', triggerOrdinal: 3, timestampMs: 1000, notes: [60, 64, 67], rootPitchClass: C, audible: true }]);
  assert.deepEqual(resolved[0]?.notes, [60, 64, 67]);
});

test('repeated C does not overwhelm a strong G7→C cadence', () => {
  const accumulator = new HarmonyEvidenceAccumulator({ halfLifeMs: 60_000 });
  for (let index = 0; index < 12; index += 1) accumulator.add(event('seqTrigger', C, [60, 64, 67], index * 100));
  accumulator.add(event('progression', G, [55, 59, 62, 65], 1300));
  accumulator.add(event('progression', C, [60, 64, 67, 71], 1400));
  const result = analyzeTonalContext({ engine: { rootPitchClass: C, scaleId: 1 }, evidence: accumulator.snapshot(1500), nowMs: 1500 });
  assert.equal(result.top?.rootPitchClass, C);
  assert.ok((result.top?.cadenceEvidence ?? 0) > 0, 'cadence evidence should survive repetition discounting');
});

test('temporary live Play is Preview-only and display keeps committed Playing separate', () => {
  const playing = [
    event('progression', C, [60, 64, 67, 71], 0),
    event('progression', A, [57, 60, 64, 67], 1000),
    event('progression', D, [62, 65, 69, 72], 2000),
    event('progression', G, [55, 59, 62, 65], 3000),
  ];
  const preview = [event('livePlay', A, [57, 60, 64, 67], 1000, { scope: 'preview' })];
  const pair = analyzePlayingAndPreview({ engine: { rootPitchClass: C, scaleId: 1 }, playingEvidence: playing, previewEvidence: preview, nowMs: 1000 });
  assert.equal(pair.playing.top?.rootPitchClass, C);
  assert.equal(pair.preview?.mode, 'preview');
  const display = tonalContextDisplay({ engine: { rootPitchClass: C, scaleId: 1 }, playingEvidence: playing, previewEvidence: preview, nowMs: 1000 });
  assert.equal(display.playing.top?.rootPitchClass, C);
  assert.notEqual(display.preview?.top?.rootPitchClass, display.playing.top?.rootPitchClass);
});

test('hysteresis holds the prior label during a near tie', () => {
  const baseline = analysis([
    event('progression', C, [60, 64, 67, 71], 0),
    event('progression', G, [55, 59, 62, 65], 1000),
  ]);
  const held = analyzeTonalContext({
    engine: { rootPitchClass: C, scaleId: 1 },
    evidence: [event('progression', A, [57, 60, 64, 67], 0)],
    previous: baseline.top,
    nowMs: 0,
  });
  assert.equal(held.heldByHysteresis, true);
});
