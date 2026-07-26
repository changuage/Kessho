import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHarmonyProjection, clearHarmonyProjectionMorphPlanCache } from './harmonyProjection';
import { defaultHarmonyIntent } from '../CoreProductHarmonyControl';
import { generateHarmonySuggestionBank } from './chordSuggestionEngine';

function slot(name: string, rootNote: number, notes: number[]) {
  const intent = { ...defaultHarmonyIntent('slot', 0), rootMode: 'absolute' as const, rootNote, quality: 'maj' as const };
  const chord = { intent, intentSource: 'confirmed' as const, exactMidiNotes: notes, recognizedLabel: name, playbackBehavior: 'auto' as const, capturedContext: { rootMidi: 60, scaleId: 1 } };
  return { id: 0, name, intent, chord, locked: false };
}

test('endpoint ownership is A below midpoint and B at midpoint', () => {
  const state = { rootNote: 0, manualScale: 'Major (Ionian)', tension: 0.25, harmonyMorphPercent: 49.99, harmonyChordSlotsA: [slot('A chord', 0, [60, 64, 67])], harmonyChordSlotsB: [slot('B chord', 5, [65, 69, 72])] };
  const a = resolveHarmonyProjection(state);
  const b = resolveHarmonyProjection({ ...state, harmonyMorphPercent: 50 });
  assert.equal(a.bank, 'A');
  assert.equal(b.bank, 'B');
  assert.equal(a.engine.morphLocked, true);
  assert.equal(b.engine.morphLocked, true);
  assert.equal(a.slots[0]?.name, 'A chord');
  assert.equal(b.slots[0]?.name, 'B chord');
});

test('projection exposes one bounded active frame and no merged midpoint bank', () => {
  const projection = resolveHarmonyProjection({
    rootNote: 2,
    manualScale: 'Dorian',
    tension: 0.5,
    harmonyMorphPercent: 50,
    harmonyChordSlotsA: [slot('A', 0, [60, 64, 67])],
    harmonyChordSlotsB: [slot('B', 5, [65, 69, 72])],
  });
  assert.equal(projection.bank, 'B');
  assert.ok(projection.slots.length <= 8);
  assert.ok(projection.activeFrame.currentNotePool.length <= 8);
  assert.ok(projection.morphPlan.commonToneVoicePairs.length <= 8);
  assert.ok(projection.morphPlan.voiceLeadingPairs.length <= 8);
});

test('common tones stay paired and CoF path is bounded', () => {
  clearHarmonyProjectionMorphPlanCache();
  const aSlot = slot('A', 0, [60, 64, 67]);
  const bSlot = slot('B', 5, [65, 69, 72]);
  const sequenceA = [{ id: 0, enabled: true, locked: false, mode: 'intent', degree: 0, quality: 'maj', intent: aSlot.intent, slotId: 0, probability: 1 }];
  const sequenceB = [{ id: 0, enabled: true, locked: false, mode: 'intent', degree: 0, quality: 'maj', intent: bSlot.intent, slotId: 0, probability: 1 }];
  const projection = resolveHarmonyProjection({ rootNote: 0, manualScale: 'Major (Ionian)', tension: 0.35, harmonyChordSequenceEnabled: true, harmonyChordSequenceLength: 1, harmonyChordSequenceStepIndex: 0, harmonyChordSequenceA: sequenceA, harmonyChordSequenceB: sequenceB, harmonyChordSlotsA: [aSlot], harmonyChordSlotsB: [bSlot], harmonyMorphPercent: 0 });
  const pairs = projection.morphPlan.commonToneVoicePairs;
  assert.equal(resolveHarmonyProjection({ harmonyMorphPercent: 0, harmonyChordSlotsA: [aSlot] }).slots[0]?.name, 'A');
  assert.equal(resolveHarmonyProjection({ harmonyMorphPercent: 100, harmonyChordSlotsB: [bSlot] }).slots[0]?.name, 'B');
  assert.ok(pairs.some(([from, to]) => from % 12 === 0 && to % 12 === 0));
  for (const [from, to] of pairs) assert.equal(((from - to) % 12 + 12) % 12, 0);
  assert.ok(projection.morphPlan.cofRootPath.length <= 13);
});

test('live layer priority selects takeover and morph suppresses performance layers', () => {
  const liveLayer = { kind: 'harmony-takeover' as const, latched: true };
  const scope = { kind: 'harmony-takeover' };
  const takeoverFrame = resolveHarmonyProjection({}).underlyingFrame;
  const projection = resolveHarmonyProjection({}, { liveLayers: [{ kind: 'draft-live' }, { kind: 'seq-live', seqId: 1 }, { ...liveLayer, frame: { ...takeoverFrame, rootMidi: 72 } }], activeLiveInputScope: scope });
  assert.equal(projection.liveLayer?.kind, liveLayer.kind);
  assert.equal(projection.activeLiveInputScope, scope);
  assert.equal(projection.activeFrame.rootMidi, 72);
  const morphProjection = resolveHarmonyProjection({ harmonyMorphPercent: 50 }, { liveLayer, activeLiveInputScope: scope });
  assert.equal(morphProjection.liveLayer, null);
  assert.equal(morphProjection.activeLiveInputScope, null);
  assert.equal(resolveHarmonyProjection({ harmonyMorphPercent: 0 }, { morphPercent: 50 }).bank, 'B');
});

test('canonical auto event resolves through the same suggestion bank used by Detail', () => {
  const state = {
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.35,
    harmonyProgression: { version: 1, enabled: true, currentEventIndex: 0, events: [{ id: 'auto-0', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 } }] },
  };
  const projection = resolveHarmonyProjection(state);
  const expected = generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.35, phrasePosition: 'opening' }).find((entry) => entry !== null);
  assert.ok(expected);
  assert.deepEqual(projection.activeFrame.currentNotePool, expected.exactMidiNotes);
});

test('projection exposes absolute transport bars for canonical adoption boundaries', () => {
  const state = {
    rootNote: 0,
    manualScale: 'Major (Ionian)',
    transportBarsPerPhrase: 4,
    harmonyProgression: { version: 1, enabled: true, currentEventIndex: 0, events: [{ id: 'long', source: { type: 'auto' }, duration: { unit: 'phrase', value: 2 } }, { id: 'next', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } }] },
  };
  const atBar1 = resolveHarmonyProjection(state, { barIndex: 1 });
  const atBar8 = resolveHarmonyProjection(state, { barIndex: 8 });
  assert.equal(atBar1.position.absoluteBarIndex, 1);
  assert.equal(atBar1.position.eventIndex, 0);
  assert.equal(atBar8.position.eventIndex, 1);
  assert.equal(atBar8.position.absoluteBarIndex, 8);
});
