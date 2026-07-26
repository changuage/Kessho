import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDraftToSlot, countSharedSlotUses, draftFromSlot, emptyHarmonyDraft, resolveDraftNotes, resolveLiveReanchoredNotes, updateDraftExactNotes } from './harmonyDraftHelpers';
import type { SharedHarmonyChordSlot } from '../../../audio/harmony/harmonyTypes';

const slot = (locked = false, populated = true): SharedHarmonyChordSlot => ({
  id: 1,
  name: 'Slot 2',
  locked,
  chord: populated ? {
    intent: null,
    intentSource: null,
    exactMidiNotes: [60, 64, 67],
    recognizedLabel: 'C maj',
    playbackBehavior: 'auto',
    capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
  } : null,
});

test('slot load copies exact notes and capture is the only authored write', () => {
  const source = slot();
  const draft = draftFromSlot(source);
  draft.exactMidiNotes.push(72);
  assert.deepEqual(source.chord?.exactMidiNotes, [60, 64, 67]);
  const captured = captureDraftToSlot(source, draft);
  assert.deepEqual(captured.chord?.exactMidiNotes, [60, 64, 67, 72]);
  assert.deepEqual(source.chord?.exactMidiNotes, [60, 64, 67]);
});

test('empty draft remains empty until capture and locked slots reject it', () => {
  const draft = emptyHarmonyDraft();
  assert.equal(captureDraftToSlot(slot(false, false), draft).chord, null);
  assert.deepEqual(captureDraftToSlot(slot(true), { ...draft, exactMidiNotes: [60] }).chord?.exactMidiNotes, [60, 64, 67]);
});

test('auto keeps exact at six semitones and resolves relative beyond six', () => {
  const draft = updateDraftExactNotes(emptyHarmonyDraft({ rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 }), [60, 64, 67]);
  assert.deepEqual(resolveDraftNotes(draft, 66), [60, 64, 67]);
  assert.notDeepEqual(resolveDraftNotes(draft, 67), [60, 64, 67]);
});

test('shared use count spans all Seq lanes and Harmony progression refs', () => {
  const configs = [0, 1, 2, 3].map((lane) => ({ chord: { choiceLength: 2, steps: [{ slotId: lane }, { slotId: 2 }] } }));
  assert.equal(countSharedSlotUses(2, configs, [{ slotId: 2 }, { slotId: 4 }]), 6);
});

test('live re-anchor honors Exact, Relative, and Auto threshold', () => {
  const base = { intent: null, exactMidiNotes: [60, 64, 67], playbackBehavior: 'exact' as const, capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 } };
  assert.deepEqual(resolveLiveReanchoredNotes(base, 72, 72, 1), [60, 64, 67]);
  const relative = { ...base, playbackBehavior: 'relative' as const, intent: { source: 'manualControl' as const, strength: 'force' as const, rootMode: 'absolute' as const, degree: 0, rootNote: 0, quality: 'maj' as const, extensions: [], inversion: 0, spread: 0, octave: 4, bassMode: 'off' as const, bassNote: null, capturedMidiNotes: [], preserveCapturedVoicing: false } };
  assert.equal(resolveLiveReanchoredNotes(relative, 72, 72, 1).length > 0, true);
  const auto = { ...relative, playbackBehavior: 'auto' as const };
  assert.deepEqual(resolveLiveReanchoredNotes(auto, 66, 66, 1), [60, 64, 67]);
  assert.equal(resolveLiveReanchoredNotes(auto, 67, 67, 1).length > 0, true);
});

test('ambiguous Custom draft playback is pending explicit semantic selection', () => {
  const context = { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 };
  const draft = updateDraftExactNotes(emptyHarmonyDraft(context), [60, 61, 66]);
  assert.equal(draft.intent, null);
  assert.deepEqual(resolveDraftNotes({ ...draft, playbackBehavior: 'auto' }, 72), []);
  assert.deepEqual(resolveDraftNotes({ ...draft, playbackBehavior: 'relative' }, 72), []);
  const custom = { intent: null, exactMidiNotes: [60, 61, 66], playbackBehavior: 'relative' as const, capturedContext: context };
  assert.deepEqual(resolveLiveReanchoredNotes(custom, 72, 72, 1), []);
});
