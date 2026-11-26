import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHarmonyLiveLayerChange, resolveHarmonyProjection, resolveCachedMorphHarmonyPlan, clearHarmonyProjectionMorphPlanCache } from './harmonyProjection';
import { normalizeChord } from './chord';
import { generateHarmonySuggestionBank } from './chordSuggestionEngine';
import { createCoreProductHostHarmonySnapshot } from '../CoreProductHostHarmonyState';

function chordProgression(degree: number) {
  return {
    version: 2,
    enabled: true,
    currentEventIndex: 0,
    events: [{ id: `degree-${degree}`, source: { type: 'chord', chord: normalizeChord({ behavior: 'follow', degree }) }, duration: { unit: 'phrase', value: 1 } }],
  };
}

test('endpoint ownership is A below midpoint and B at midpoint', () => {
  const state = { rootNote: 0, manualScale: 'Major (Ionian)', tension: 0.25, harmonyMorphPercent: 49.99, harmonyProgressionA: chordProgression(0), harmonyProgressionB: chordProgression(5) };
  const a = resolveHarmonyProjection(state);
  const b = resolveHarmonyProjection({ ...state, harmonyMorphPercent: 50 });
  assert.equal(a.bank, 'A');
  assert.equal(b.bank, 'B');
  assert.equal(a.engine.morphLocked, true);
  assert.equal(b.engine.morphLocked, true);
  assert.equal(a.progression[0]?.chord?.degree, 0);
  assert.equal(b.progression[0]?.chord?.degree, 5);
  assert.equal(a.progression[0]?.source, 'chord');
});

test('projection exposes one bounded active frame and no merged midpoint bank', () => {
  const projection = resolveHarmonyProjection({
    rootNote: 2,
    manualScale: 'Dorian',
    tension: 0.5,
    harmonyMorphPercent: 50,
    harmonyProgressionA: chordProgression(0),
    harmonyProgressionB: chordProgression(5),
  });
  assert.equal(projection.bank, 'B');
  assert.equal(projection.progression.length, 1);
  assert.ok(projection.activeFrame.currentNotePool.length <= 8);
  assert.ok(projection.morphPlan.commonToneVoicePairs.length <= 8);
  assert.ok(projection.morphPlan.voiceLeadingPairs.length <= 8);
});

test('common tones stay paired and CoF path is bounded', () => {
  clearHarmonyProjectionMorphPlanCache();
  const base = resolveHarmonyProjection({}).underlyingFrame;
  const plan = resolveCachedMorphHarmonyPlan(
    { ...base, rootMidi: 60, currentNotePool: [60, 64, 67] },
    { ...base, rootMidi: 65, currentNotePool: [65, 69, 72] },
    'A',
  );
  const pairs = plan.commonToneVoicePairs;
  assert.ok(pairs.some(([from, to]) => from % 12 === 0 && to % 12 === 0));
  for (const [from, to] of pairs) assert.equal(((from - to) % 12 + 12) % 12, 0);
  assert.ok(plan.cofRootPath.length <= 13);
});

test('live layer priority selects takeover and morph suppresses performance layers', () => {
  const liveLayer = { kind: 'harmony-takeover' as const, latched: true };
  const scope = { kind: 'harmony-takeover' };
  const takeoverFrame = resolveHarmonyProjection({}).underlyingFrame;
  const projection = resolveHarmonyProjection({}, { liveLayers: [{ kind: 'draft-live' }, { ...liveLayer, frame: { ...takeoverFrame, rootMidi: 72 } }], activeLiveInputScope: scope });
  assert.equal(projection.liveLayer?.kind, liveLayer.kind);
  assert.equal(projection.activeLiveInputScope, scope);
  assert.equal(projection.activeFrame.rootMidi, 72);
  const morphProjection = resolveHarmonyProjection({ harmonyMorphPercent: 50 }, { liveLayer, activeLiveInputScope: scope });
  assert.equal(morphProjection.liveLayer, null);
  assert.equal(morphProjection.activeLiveInputScope, null);
  assert.equal(resolveHarmonyProjection({ harmonyMorphPercent: 0 }, { morphPercent: 50 }).bank, 'B');
});

test('latched live layers survive ordinary release and clear only on explicit Stop', () => {
  const latched = { kind: 'draft-live' as const, latched: true };
  assert.equal(resolveHarmonyLiveLayerChange(latched, null), latched);
  assert.equal(resolveHarmonyLiveLayerChange(latched, null, { explicitStop: true }), null);
  const replacement = { kind: 'harmony-takeover' as const, latched: false };
  assert.equal(resolveHarmonyLiveLayerChange(latched, replacement), replacement);
  assert.equal(resolveHarmonyLiveLayerChange(replacement, null), null);
});

test('canonical auto event resolves through the same suggestion bank used by Detail', () => {
  const state = {
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.35,
    harmonyProgression: { version: 2, enabled: true, currentEventIndex: 0, events: [{ id: 'auto-0', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 } }] },
  };
  const projection = resolveHarmonyProjection(state);
  const expected = generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.35, phrasePosition: 'opening' }).find((entry) => entry !== null);
  assert.ok(expected);
  assert.deepEqual(projection.activeFrame.currentNotePool, expected.exactMidiNotes);
});

test('native Product runtime pools remain authoritative for current and next auto frames', () => {
  const projection = resolveHarmonyProjection({ rootNote: 0, manualScale: 'Major (Ionian)', tension: 0.35 }, {
    harmonyState: {
      runtimeNotePoolMidi: [61, 65, 68, 73],
      runtimeNextNotePoolMidi: [62, 66, 69, 74],
    },
  });
  assert.deepEqual(projection.activeFrame.currentNotePool, [61, 65, 68, 73]);
  assert.deepEqual(projection.activeFrame.nextNotePool, [62, 66, 69, 74]);
  assert.deepEqual(projection.underlyingFrame.currentNotePool, [61, 65, 68, 73]);
  assert.deepEqual(projection.underlyingFrame.nextNotePool, [62, 66, 69, 74]);
});

test('auto pools stay unavailable until the first native Product pool arrives', () => {
  const state = { rootNote: 0, manualScale: 'Major (Ionian)', scaleMode: 'manual', tension: 0.35 };
  const initial = createCoreProductHostHarmonySnapshot(state, {
    schemaHash: 1,
    transportRunning: true,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    harmonyRootMidi: 60,
    harmonyScaleId: 1,
    harmonyTension: 0.35,
    harmonyChordDegree: 0,
    harmonyChordMidi: [60, 64, 67, 72],
  });
  assert.equal(initial.harmonyState?.runtimeHarmonyReady, false);
  const initialProjection = resolveHarmonyProjection(state, { harmonyState: initial.harmonyState });
  assert.deepEqual(initialProjection.activeFrame.currentNotePool, []);
  assert.deepEqual(initialProjection.activeFrame.nextNotePool, []);

  const firstNative = createCoreProductHostHarmonySnapshot(state, {
    schemaHash: 1,
    transportRunning: true,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    harmonyRootMidi: 60,
    harmonyScaleId: 1,
    harmonyTension: 0.35,
    harmonyChordDegree: 0,
    harmonyChordMidi: [60, 64, 67, 72],
    harmonyNotePoolMidi: [60, 64, 67, 72],
    harmonyNextNotePoolMidi: [62, 65, 69, 74],
  });
  assert.equal(firstNative.harmonyState?.runtimeHarmonyReady, true);
  const firstProjection = resolveHarmonyProjection(state, { harmonyState: firstNative.harmonyState });
  assert.deepEqual(firstProjection.activeFrame.currentNotePool, [60, 64, 67, 72]);
  assert.deepEqual(firstProjection.activeFrame.nextNotePool, [62, 65, 69, 74]);
});

test('projection exposes absolute transport bars for canonical adoption boundaries', () => {
  const state = {
    rootNote: 0,
    manualScale: 'Major (Ionian)',
    transportBarsPerPhrase: 4,
    harmonyProgression: { version: 2, enabled: true, currentEventIndex: 0, events: [{ id: 'long', source: { type: 'auto' }, duration: { unit: 'phrase', value: 2 } }, { id: 'next', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } }] },
  };
  const atBar1 = resolveHarmonyProjection(state, { barIndex: 1 });
  const atBar8 = resolveHarmonyProjection(state, { barIndex: 8 });
  assert.equal(atBar1.position.absoluteBarIndex, 1);
  assert.equal(atBar1.position.eventIndex, 0);
  assert.equal(atBar8.position.eventIndex, 1);
  assert.equal(atBar8.position.absoluteBarIndex, 8);
});
