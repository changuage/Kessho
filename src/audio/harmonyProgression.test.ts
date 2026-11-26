import assert from 'node:assert/strict';
import {
  HARMONY_PROGRESSION_CAPACITY,
  defaultHarmonyProgression,
  migrateHarmonyProgression,
  reduceHarmonyProgression,
  resolveProductHarmonyState,
  sanitizeHarmonyPalette,
  sanitizeHarmonyProgression,
} from './CoreProductHarmonyControl';
import { normalizeChord } from './harmony/chord';
import { createHarmonyState, updateHarmonyState } from './harmony';
import { createCoreProductHostHarmonySnapshot } from './CoreProductHostHarmonyState';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { resolveHarmonyProjection } from './harmony/harmonyProjection';
import { DEFAULT_STATE, decodeStateFromUrl, encodeStateToUrl, migratePreset, serializeState } from '../ui/state';

const base = defaultHarmonyProgression();
const first = base.events[0]!;

// A version 1 progression keeps its events; slot sources load as Auto.
const migrated = sanitizeHarmonyProgression({
  version: 1,
  enabled: true,
  currentEventIndex: 1,
  events: [
    { id: 'a', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 } },
    { id: 'b', source: { type: 'slot', slotId: 2 }, duration: { unit: 'bar', value: 4 } },
  ],
});
assert.equal(migrated.version, 2);
assert.equal(migrated.events.length, 2);
assert.deepEqual(migrated.events[1]?.source, { type: 'auto' });
assert.deepEqual(migrated.events[1]?.duration, { unit: 'bar', value: 4 });
assert.equal(migrated.enabled, true);
assert.equal(migrated.currentEventIndex, 1);

// Version 2 chord events validate through normalizeChord; anything else loads as Auto.
const chord = normalizeChord({ behavior: 'fixed', notes: [{ midi: 60 }, { midi: 64 }, { midi: 67 }] })!;
const withChord = sanitizeHarmonyProgression({
  version: 2,
  enabled: true,
  events: [
    { id: 'c', source: { type: 'chord', chord }, duration: { unit: 'bar', value: 2 } },
    { id: 'd', source: { type: 'chord', chord: 'not a chord' }, duration: { unit: 'bar', value: 1 } },
  ],
});
assert.deepEqual(withChord.events[0]?.source, { type: 'chord', chord });
assert.deepEqual(withChord.events[1]?.source, { type: 'auto' });
assert.deepEqual(sanitizeHarmonyProgression(undefined).events.map((event) => event.source.type), ['auto']);
assert.deepEqual(sanitizeHarmonyProgression({ events: [{ id: 'x' }, { id: 'x' }] }).events.map((event) => event.id), ['x', 'x-1'], 'duplicate ids are made unique');

// The Palette keeps up to 16 valid chords.
const palette = sanitizeHarmonyPalette([chord, 'junk', ...Array.from({ length: 20 }, () => chord)]);
assert.equal(palette.length, 16);
assert.deepEqual(sanitizeHarmonyPalette(undefined), []);

const oversizedMigration = migrateHarmonyProgression({
  version: 1,
  enabled: true,
  currentEventIndex: 0,
  events: Array.from({ length: HARMONY_PROGRESSION_CAPACITY + 3 }, (_, index) => ({
    id: `oversized-${index}`,
    source: { type: 'auto' },
    duration: { unit: 'bar', value: 1 },
  })),
});
assert.equal(oversizedMigration.progression.events.length, HARMONY_PROGRESSION_CAPACITY);
assert.deepEqual(oversizedMigration.diagnostics, [{
  code: 'progression-capacity-exceeded',
  inputCount: HARMONY_PROGRESSION_CAPACITY + 3,
  retainedCount: HARMONY_PROGRESSION_CAPACITY,
  discardedCount: 3,
  capacity: HARMONY_PROGRESSION_CAPACITY,
}]);

const withDurations = reduceHarmonyProgression(
  reduceHarmonyProgression(base, { type: 'setDuration', id: first.id, unit: 'bar', value: 2 }),
  { type: 'insert', afterId: first.id },
);
assert.equal(withDurations.events.length, 2);
assert.equal(withDurations.events[0]?.duration.unit, 'bar');
assert.equal(withDurations.events[0]?.duration.value, 2);
const duplicate = reduceHarmonyProgression(withDurations, { type: 'duplicate', id: first.id });
assert.equal(duplicate.events.length, 3);
assert.deepEqual(duplicate.events[1]?.source, duplicate.events[0]?.source);
const chordProgression = { ...base, events: [{ ...first, source: { type: 'chord' as const, chord } }] };
const chordCopy = reduceHarmonyProgression(chordProgression, { type: 'duplicate', id: first.id });
assert.deepEqual(chordCopy.events[1]?.source, chordCopy.events[0]?.source);
assert.notEqual((chordCopy.events[1]?.source as { chord: unknown }).chord, (chordCopy.events[0]?.source as { chord: unknown }).chord, 'a duplicated chord event owns its own chord');
const moved = reduceHarmonyProgression(duplicate, { type: 'move', id: duplicate.events[0]!.id, direction: 'down' });
assert.equal(moved.events[1]?.id, duplicate.events[0]?.id);
const deleted = reduceHarmonyProgression(moved, { type: 'delete', id: moved.events[0]!.id });
assert.equal(deleted.events.length, 2);
assert.equal(deleted.currentEventIndex, 0, 'deleting the active event chooses a deterministic neighbor');
const indexed = { ...duplicate, currentEventIndex: 2 };
const deletedBeforeCurrent = reduceHarmonyProgression(indexed, { type: 'delete', id: indexed.events[0]!.id });
assert.equal(deletedBeforeCurrent.currentEventIndex, 1, 'deleting before the active event decrements the index');
const collisionSource = { ...base, events: [{ ...first, id: 'x' }, { ...first, id: 'x-copy' }] };
const collisionDuplicate = reduceHarmonyProgression(collisionSource, { type: 'duplicate', id: 'x' });
assert.deepEqual(collisionDuplicate.events.map((event) => event.id), ['x', 'x-copy-2', 'x-copy'], 'duplicate IDs remain collision-free after delete/insert history');
assert.equal(reduceHarmonyProgression(base, { type: 'delete', id: first.id }).events.length, 1, 'final event is protected');

let full = base;
for (let i = 0; i < HARMONY_PROGRESSION_CAPACITY - 1; i += 1) {
  full = reduceHarmonyProgression(full, { type: 'insert' });
}
assert.equal(full.events.length, HARMONY_PROGRESSION_CAPACITY);
const rejected = reduceHarmonyProgression(full, { type: 'insert' });
assert.deepEqual(rejected, full, 'event 65 must be rejected atomically');

const runtime = resolveProductHarmonyState({
  state: {
    harmonyProgression: {
      version: 2,
      enabled: true,
      currentEventIndex: 1,
      events: [
        { id: 'a', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 } },
        { id: 'b', source: { type: 'auto' }, duration: { unit: 'bar', value: 4 } },
      ],
    },
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(runtime.progression.events.length, 2);
assert.equal(runtime.progression.currentEventIndex, 1);
const positionedRuntime = resolveProductHarmonyState({
  state: { harmonyProgression: runtime.progression, transportBarsPerPhrase: 4 },
  barIndex: 4,
  phraseIndex: 1,
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(positionedRuntime.progression.currentEventIndex, 1, 'canonical position follows the transport context');
const sixtyFourEvents = Array.from({ length: 64 }, (_, index) => ({
  id: `event-${index}`,
  source: { type: 'auto' as const },
  duration: { unit: 'bar' as const, value: 1 as const },
}));
const sixtyFourRuntime = resolveProductHarmonyState({
  state: {
    harmonyProgression: { version: 2 as const, enabled: true, currentEventIndex: 63, events: sixtyFourEvents },
  },
  rootMidi: 60,
  scaleId: 1,
  tension: 0.35,
  seed: 1,
});
assert.equal(sixtyFourRuntime.progression.events.length, 64);
assert.equal(sixtyFourRuntime.progression.currentEventIndex, 63, 'canonical runtime resolves event 64');
assert.equal(sixtyFourRuntime.resolvedHarmonyFrame.nextStepIndex, 0, 'canonical runtime wraps event 64 to event 1');
assert.deepEqual(
  resolveProductHarmonyState({ state: { harmonyProgression: runtime.progression }, rootMidi: 60, scaleId: 1, tension: 0.35, seed: 1 }).resolvedHarmonyFrame.currentNotePool,
  runtime.resolvedHarmonyFrame.currentNotePool,
  'auto resolution remains deterministic at the event boundary',
);

const canonicalTiming = {
  version: 2 as const,
  enabled: true,
  currentEventIndex: 0,
  events: [
    { id: 'bar', source: { type: 'auto' as const }, duration: { unit: 'bar' as const, value: 1 as const } },
    { id: 'phrase', source: { type: 'auto' as const }, duration: { unit: 'phrase' as const, value: 1 as const } },
  ],
};
const timingState = createHarmonyState('progression-timing', 0.3, 32, 0.5, 8, 'auto', 'Major (Ionian)', 4, 16, {
  canonicalProgression: canonicalTiming,
  transportBarsPerPhrase: 4,
});
const advancedWithinPhrase = updateHarmonyState(
  timingState,
  'progression-timing',
  0,
  0.3,
  32,
  0.5,
  8,
  'auto',
  'Major (Ionian)',
  4,
  16,
  { canonicalProgression: canonicalTiming, transportBarsPerPhrase: 4 },
  0.25,
  false,
);
assert.equal(advancedWithinPhrase.progression.step, 1, 'one-bar canonical event advances at the bar boundary within a phrase');

// Old chord keys are ignored on load and never saved: no decoders.
const legacyUrl = `?harmonyChordSequence=${encodeURIComponent(JSON.stringify([
  { id: 0, enabled: true, mode: 'auto', degree: 0 },
  { id: 1, enabled: true, mode: 'slotFollow', slotId: 2, durationBars: 2 },
]))}&harmonyChordSequenceEnabled=true&harmonyChordSlots=${encodeURIComponent('[]')}&chordProgressionEnabled=true`;
const decodedLegacy = decodeStateFromUrl(legacyUrl);
assert(decodedLegacy, 'legacy URL should decode');
assert.deepEqual(decodedLegacy?.harmonyProgression, DEFAULT_STATE.harmonyProgression, 'legacy sequence keys no longer feed the progression');
for (const key of ['harmonyChordSequence', 'harmonyChordSequenceEnabled', 'harmonyChordSlots', 'chordProgressionEnabled']) {
  assert.equal(key in (decodedLegacy ?? {}), false, `${key} must not be decoded`);
}
const migratedPreset = migratePreset({
  name: 'legacy',
  state: {
    harmonyChordSlots: [{ id: 0 }],
    harmonyChordSequence: [{ id: 0, enabled: true, mode: 'auto', degree: 0 }],
    chordProgressionEnabled: true,
    harmonyProgression: { version: 1, enabled: true, events: [{ id: 'old', source: { type: 'slot', slotId: 1 }, duration: { unit: 'bar', value: 2 } }] },
    harmonyPalette: [chord, 'junk'],
  },
});
const migratedState = migratedPreset.state as unknown as Record<string, unknown>;
for (const key of ['harmonyChordSlots', 'harmonyChordSequence', 'chordProgressionEnabled']) assert.equal(key in migratedState, false, `${key} must be dropped on load`);
assert.deepEqual(migratedPreset.state.harmonyProgression.events.map((event) => event.source), [{ type: 'auto' }], 'a version 1 progression keeps its events with slot sources turned into Auto');
assert.equal(migratedPreset.state.harmonyProgression.version, 2);
assert.deepEqual(migratedPreset.state.harmonyPalette, [chord]);
assert.equal(DEFAULT_STATE.harmonyProgression.version, 2);
assert.deepEqual(DEFAULT_STATE.harmonyPalette, []);
const serialized = JSON.parse(serializeState(DEFAULT_STATE)) as Record<string, unknown>;
assert.equal('harmonyChordSlots' in serialized, false);
assert.deepEqual(serialized.harmonyPalette, []);
assert.equal(encodeStateToUrl({ ...DEFAULT_STATE, harmonyPalette: [chord] }).includes('harmonyPalette'), true, 'the Palette round-trips through URLs');
assert.deepEqual(decodeStateFromUrl(encodeStateToUrl({ ...DEFAULT_STATE, harmonyPalette: [chord] }))?.harmonyPalette, [chord]);

console.log('harmony progression tests passed');

const projectionState = {
  harmonyProgression: {
    version: 2,
    enabled: true,
    currentEventIndex: 0,
    events: [
      { id: 'stable-a', source: { type: 'auto' }, duration: { unit: 'bar', value: 1 } },
      { id: 'stable-b', source: { type: 'auto' }, duration: { unit: 'phrase', value: 1 } },
    ],
  },
  transportBarsPerPhrase: 4,
};
const firstProjection = resolveHarmonyProjection(projectionState, { barIndex: 0, phraseIndex: 0 });
const advancedProjection = resolveHarmonyProjection(projectionState, { barIndex: 1, phraseIndex: 0 });
const takeoverProjection = resolveHarmonyProjection(projectionState, {
  barIndex: 1,
  phraseIndex: 0,
  liveLayer: { kind: 'harmony-takeover', latched: true },
});
assert.equal(firstProjection.progression[0]?.id, 'stable-a');
assert.equal(firstProjection.progression[0]?.durationBars, 1);
assert.equal(firstProjection.progression[1]?.durationBars, 4);
assert.equal(advancedProjection.position.eventId, 'stable-b', 'canonical position advances at a one-bar boundary');
assert.equal(takeoverProjection.position.eventId, advancedProjection.position.eventId, 'takeover overlays must not freeze the underlying progression clock');
const loopProjection = resolveHarmonyProjection(projectionState, { barIndex: 9, phraseIndex: 2 });
assert.equal(loopProjection.position.eventId, 'stable-b', 'later canonical cycles retain the correct event');
assert.equal(loopProjection.position.barInEvent, 3, 'barInEvent is normalized within the progression cycle');
assert(firstProjection.morphPlan.commonToneVoicePairs.length > 0, 'canonical morph should retain at least one common tone when endpoints overlap');
assert(
  firstProjection.morphPlan.voiceLeadingPairs.every(([from, to]) => Math.abs(from - to) <= 12),
  'canonical morph voice pairs should use minimal motion',
);
assert.deepEqual(firstProjection.morphPlan.commonToneVoicePairs, resolveHarmonyProjection(projectionState).morphPlan.commonToneVoicePairs);

const hostState = {
  harmonyProgression: projectionState.harmonyProgression,
  transportBarsPerPhrase: 4,
  rootNote: 0,
  tension: 0.35,
  manualScale: 'Major (Ionian)',
};
const hostSnapshot = createCoreProductHostHarmonySnapshot(hostState, {
  schemaHash: 0,
  transportRunning: true,
  barIndex: 1,
  phraseIndex: 0,
  transportBarsPerPhrase: 4,
  activeSources: 0,
  activeVoices: 0,
  activeAssets: 0,
  sequencerEventCount: 0,
  controlQueueDepth: 0,
  assetMissingCount: 0,
  lastErrorCode: 0,
} as unknown as CoreProductTelemetrySnapshot);
assert.equal(hostSnapshot.harmonyState?.progression.step, 1, 'host telemetry must position canonical progression');
const hostProjection = resolveHarmonyProjection(hostState, {
  harmonyState: hostSnapshot.harmonyState,
  liveLayer: { kind: 'harmony-takeover', latched: true },
});
assert.equal(hostProjection.position.eventId, 'stable-b', 'projection uses host progression position without explicit overlay bars');
console.log('harmony projection progression tests passed');
