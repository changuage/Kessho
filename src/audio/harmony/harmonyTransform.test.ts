import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHarmonyIntent } from '../CoreProductHarmonyControl';
import type { SharedHarmonyChord } from './harmonyTypes';
import { createHarmonyTakeoverRuntime, planHarmonyPrint, transformHarmonyChord, type HarmonyTakeoverFrame } from './harmonyTransform';
import { analyzeHarmonyBank, enumerateHarmonySlotReferences, planEmptyUnusedHarmonySlot, planReplaceHarmonySlotReferences } from './harmonyBankAnalysis';

const context = (rootPitchClass: number, scaleId = 1) => ({ rootPitchClass, scaleId, scaleName: 'Ionian', score: 1, confidence: 1, noteCoverage: 1, diatonicChordFit: 1, rootBassEvidence: 1, cadenceEvidence: 0, orderEvidence: 0, confirmedRecognition: 1 });
const semantic = (behavior: 'relative' | 'auto' | 'exact' = 'relative'): SharedHarmonyChord => {
  const intent = { ...defaultHarmonyIntent('slot', 0), rootMode: 'degree' as const, quality: 'maj7' as const, degree: 0, extensions: ['9'] };
  return { intent, intentSource: 'confirmed', exactMidiNotes: [60, 64, 67, 71], recognizedLabel: 'Cmaj9', playbackBehavior: behavior, capturedContext: { rootMidi: 60, scaleId: 1 } };
};

test('Relative and eligible Auto follow target context while Exact bypasses', () => {
  const source = context(0);
  const target = context(5);
  const relative = transformHarmonyChord({ chord: semantic('relative'), sourceContext: source, effectiveContext: target });
  const auto = transformHarmonyChord({ chord: semantic('auto'), sourceContext: source, effectiveContext: target, autoUsesSemantic: true });
  const exact = transformHarmonyChord({ chord: semantic('exact'), sourceContext: source, effectiveContext: target });
  assert.equal(relative.transformed, true);
  assert.deepEqual(auto.exactMidiNotes, relative.exactMidiNotes);
  assert.deepEqual(exact.exactMidiNotes, [60, 64, 67, 71]);
  assert.equal(exact.bypassed, true);
  assert.deepEqual(transformHarmonyChord({ chord: semantic('auto'), sourceContext: source, effectiveContext: target }).exactMidiNotes, [60, 64, 67, 71]);
});

test('explicit null-semantic fallback preserves chromatic shape and guard prevents double transpose', () => {
  const chord = { ...semantic('relative'), intent: null };
  assert.deepEqual(transformHarmonyChord({ chord, sourceContext: context(0), effectiveContext: context(5) }).exactMidiNotes, []);
  const moved = transformHarmonyChord({ chord, sourceContext: context(0), effectiveContext: context(5), customFallback: true });
  assert.equal(moved.reason, 'chromatic-shape');
  assert.deepEqual(moved.exactMidiNotes, [65, 69, 72, 76]);
  const guarded = transformHarmonyChord({ chord: { ...chord, exactMidiNotes: moved.exactMidiNotes }, sourceContext: context(0), effectiveContext: context(5), alreadyTransformed: true });
  assert.deepEqual(guarded.exactMidiNotes, moved.exactMidiNotes);
});

test('ambiguous null semantic capture stays pending until explicit selection', () => {
  const chord = { ...semantic('relative'), intent: null, requiresSemanticSelection: true };
  const pending = transformHarmonyChord({ chord, sourceContext: context(0), effectiveContext: context(5) });
  assert.deepEqual(pending.exactMidiNotes, []);
  const custom = transformHarmonyChord({ chord, sourceContext: context(0), effectiveContext: context(5), customFallback: true });
  assert.deepEqual(custom.exactMidiNotes, [65, 69, 72, 76]);
});

test('custom semantic material uses chromatic interval-shape fallback', () => {
  const chord = { ...semantic('relative'), intent: { ...semantic('relative').intent!, quality: 'custom' as const } };
  const result = transformHarmonyChord({ chord, sourceContext: context(0), effectiveContext: context(5), customFallback: true });
  assert.deepEqual(result.exactMidiNotes, [65, 69, 72, 76]);
  assert.equal(result.reason, 'chromatic-shape');
});

test('voice leading keeps common tones and avoids double transpose', () => {
  const source = context(0);
  const target = context(7);
  const first = transformHarmonyChord({ chord: semantic(), sourceContext: source, effectiveContext: target, underlyingNotes: [67, 71, 74] });
  const second = transformHarmonyChord({ chord: { ...semantic(), exactMidiNotes: first.exactMidiNotes }, sourceContext: source, effectiveContext: target, underlyingNotes: first.exactMidiNotes });
  assert.ok(first.exactMidiNotes.some((note) => [67, 71, 74].includes(note)));
  assert.deepEqual(second.exactMidiNotes, first.exactMidiNotes);
});

const frame = (root: number, latched = false): HarmonyTakeoverFrame => ({ anchorPitchClass: root, sourceContext: context(root), effectiveContext: context(root), latched });

test('hold/release uses then-current underlying frame, latch survives views, Stop clears', () => {
  const runtime = createHarmonyTakeoverRuntime(frame(0));
  runtime.hold(frame(5));
  assert.equal(runtime.snapshot().underlying.anchorPitchClass, 0);
  runtime.release(frame(7));
  assert.equal(runtime.snapshot().active.anchorPitchClass, 7);
  runtime.hold(frame(2));
  runtime.setLatch(true);
  runtime.viewChanged();
  runtime.release(frame(9));
  assert.equal(runtime.snapshot().active.anchorPitchClass, 2);
  assert.equal(runtime.snapshot().latched, true);
  runtime.stop(frame(11));
  assert.equal(runtime.snapshot().active.anchorPitchClass, 11);
  assert.equal(runtime.snapshot().latched, false);
});

test('print updates semantic and exact snapshots together and undo is reversible', () => {
  const slots = [{ id: 0, name: 'S1', locked: false, chord: semantic('relative') }];
  const patch = planHarmonyPrint(slots, context(0), context(5));
  assert.deepEqual(slots[0]!.chord!.exactMidiNotes, [60, 64, 67, 71]);
  assert.notDeepEqual(patch.after[0]!.chord!.exactMidiNotes, slots[0]!.chord!.exactMidiNotes);
  assert.equal(patch.after[0]!.chord!.playbackBehavior, 'relative');
  assert.deepEqual(patch.undo()[0]!.chord!.exactMidiNotes, [60, 64, 67, 71]);
  const autoPatch = planHarmonyPrint([{ id: 0, name: 'A', locked: false, chord: semantic('auto') }], context(0), context(5), { autoUsesSemantic: true });
  assert.notDeepEqual(autoPatch.after[0]!.chord!.exactMidiNotes, [60, 64, 67, 71]);
});

test('reference enumeration weights progression and enabled Seq choices', () => {
  const progression = { version: 1 as const, enabled: true, currentEventIndex: 0, events: [{ id: 'e1', source: { type: 'slot' as const, slotId: 0 }, duration: { unit: 'bar' as const, value: 2 as const } }] };
  const sequence = [{ id: 3, enabled: true, locked: false, mode: 'slot' as const, degree: 0, quality: 'maj' as const, intent: null, slotId: 0, probability: 0.5 }];
  const refs = enumerateHarmonySlotReferences({ progression, sequence });
  assert.equal(refs.length, 2);
  assert.equal(analyzeHarmonyBank({ progression, sequence }).usageBySlot[0], 2.5);
});

test('reference enumeration includes both progression endpoints and persisted Seq Play lanes exactly once', () => {
  const progression = (id: string) => ({ version: 1 as const, enabled: false, currentEventIndex: 0, events: [{ id, source: { type: 'slot' as const, slotId: 2 }, duration: { unit: 'bar' as const, value: 1 as const } }] });
  const refs = enumerateHarmonySlotReferences({ progressions: [{ endpoint: 'A', progression: progression('a') }, { endpoint: 'B', progression: progression('b') }], seqPlayChoices: [1, 2, 3, 4].map((lane) => ({ lane, steps: [{ id: 0, chordSlotId: 2 }] })) });
  assert.equal(refs.filter((ref) => ref.slotId === 2).length, 6);
  assert.equal(refs.filter((ref) => String(ref.id).startsWith('A:')).length, 1);
  assert.equal(refs.filter((ref) => String(ref.id).startsWith('B:')).length, 1);
  assert.deepEqual(
    [...new Set(refs.filter((ref) => ref.kind === 'sequence').map((ref) => String(ref.id).split(':')[0]))].sort(),
    ['1', '2', '3', '4'],
  );
});

test('bank analysis infers source context from weighted slot/progression evidence', () => {
  const progression = { version: 1 as const, enabled: true, currentEventIndex: 0, events: [{ id: 'e', source: { type: 'slot' as const, slotId: 0 }, duration: { unit: 'phrase' as const, value: 1 as const } }] };
  const notes = [60, 64, 67];
  const slot = { id: 0, name: 'C', locked: false, chord: { ...semantic(), exactMidiNotes: notes } };
  const inferred = analyzeHarmonyBank({ slots: [slot], progression, engineContext: { rootPitchClass: 0, scaleId: 1 } }).sourceContext;
  assert.ok(inferred);
  assert.equal(inferred!.rootPitchClass, 0);
});

test('Replace References is atomic and updates every Harmony/Seq reference', () => {
  const slot = (id: number, chord: SharedHarmonyChord | null, locked = false) => ({ id, name: `S${id + 1}`, locked, chord });
  const progression = { version: 1 as const, enabled: true, currentEventIndex: 0, events: [{ id: 'e', source: { type: 'slot' as const, slotId: 0 }, duration: { unit: 'bar' as const, value: 1 as const } }] };
  const sequence = [{ id: 1, enabled: true, locked: false, mode: 'slot' as const, degree: 0, quality: 'maj' as const, intent: null, slotId: 0, probability: 1 }];
  const state = {
    slots: [slot(0, semantic()), slot(1, semantic())],
    progression,
    progressions: [{ endpoint: 'A' as const, progression }, { endpoint: 'B' as const, progression: { ...progression, events: progression.events.map((event) => ({ ...event, id: 'b' })) } }],
    sequence,
    seqPlayChoices: [1, 2, 3, 4].map((lane) => ({ lane, steps: [{ id: 0, chordSlotId: 0 }] })),
  };
  const patch = planReplaceHarmonySlotReferences(state, 0, 1);
  assert.equal(patch.ok, true);
  assert.equal(patch.after!.slots[0]!.chord, null);
  assert.equal(patch.after!.progression!.events[0]!.source.type, 'slot');
  assert.equal((patch.after!.progression!.events[0]!.source as { slotId: number }).slotId, 1);
  assert.equal(patch.after!.sequence![0]!.slotId, 1);
  assert.equal(patch.after!.progressions?.every(({ progression: endpoint }) => endpoint?.events[0]?.source.type === 'slot' && endpoint.events[0].source.slotId === 1), true);
  assert.equal(patch.after!.seqPlayChoices?.every(({ steps }) => steps[0]?.chordSlotId === 1), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(patch.undo!())),
    JSON.parse(JSON.stringify(state)),
    'atomic replace undo restores both endpoints and Seq1–4 references',
  );
  assert.equal(planReplaceHarmonySlotReferences(state, 0, 0).ok, false);
  const emptyTarget = { ...state, slots: [state.slots[0]!, slot(1, null)] };
  assert.equal(planReplaceHarmonySlotReferences(emptyTarget, 0, 1).ok, false);
  assert.equal(state.slots[0]!.chord !== null, true);
  assert.equal(planReplaceHarmonySlotReferences({ ...state, slots: [slot(0, null), slot(1, semantic())] }, 0, 1).error, 'source-empty');
  assert.equal(planReplaceHarmonySlotReferences({ ...state, progression: { ...progression, events: [] }, progressions: [], sequence: [], seqPlayChoices: [] }, 0, 1).error, 'source-unreferenced');
  const unused = { ...state, progression: { ...progression, events: [] }, progressions: [], sequence: [], seqPlayChoices: [] };
  assert.equal(planEmptyUnusedHarmonySlot(unused, 0).ok, true);
  assert.equal(planEmptyUnusedHarmonySlot(state, 0).error, 'referenced');
});
