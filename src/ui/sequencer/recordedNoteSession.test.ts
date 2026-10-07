import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECORDED_NOTE_CAPACITY,
  RECORDED_NOTE_MIN_DURATION_BEATS,
  RecordedNoteSession,
  type RecordedNoteClip,
} from './recordedNoteSession';
import { validateRecordedNoteClip } from './recordedNoteClip';

const walker = (pitch: number, onsetBeats: number, id?: number) => ({
  source: 'walker' as const,
  pitch,
  velocity: 0.75,
  onsetBeats,
  id,
});

function ready(session: RecordedNoteSession, clockBeat = 4) {
  session.finishLoop(0);
  session.advanceClock(clockBeat);
  assert.equal(session.snapshot().phase, 'ready');
}

test('same-cell chords and overlapping repeated pitches retain distinct note instances', () => {
  const session = new RecordedNoteSession({ durationBeats: 4, gridSteps: 16 });
  session.start('replace');
  const first = session.noteOn('left', { ...walker(60, 1), source: 'keyboard' });
  const second = session.noteOn('right', { ...walker(60, 1), source: 'orbit' });
  assert.ok(first && second && first !== second);
  assert.equal(session.noteOff({ inputId: 'left', offsetBeats: 2 }), true);
  assert.equal(session.noteOff({ inputId: 'right', offsetBeats: 3 }), true);

  ready(session);
  const request = session.requestCommit();
  assert.ok(request);
  validateRecordedNoteClip(request.clip);
  assert.deepEqual(
    request.clip.notes.map((note) => ({ pitch: note.pitch, onset: note.onsetBeats, duration: note.durationBeats })),
    [
      { pitch: 60, onset: 1, duration: 1 },
      { pitch: 60, onset: 1, duration: 2 },
    ],
  );
});

test('capacity rejects the extra note and retains a visible draft error', () => {
  const session = new RecordedNoteSession({ durationBeats: 8 });
  session.start();
  for (let index = 0; index < RECORDED_NOTE_CAPACITY; index += 1) {
    assert.ok(session.recordNote(walker(36 + (index % 24), index / 256)));
  }
  assert.equal(session.recordNote(walker(60, 1)), null);
  const state = session.snapshot();
  assert.equal(state.phase, 'error');
  assert.equal(state.error?.kind, 'capacity');
  assert.equal(state.retainedNoteCount, RECORDED_NOTE_CAPACITY);
  assert.match(state.error?.message ?? '', /1024/);
});

test('finish loop reaches ready at the clock boundary through silence', () => {
  const session = new RecordedNoteSession({ durationBeats: 4 });
  session.start();
  session.recordNote({ ...walker(64, 0), durationBeats: 0.5 });
  assert.equal(session.finishLoop(1).phase, 'finishing');
  assert.equal(session.advanceClock(3.99), false);
  assert.equal(session.advanceClock(4), true);
  assert.equal(session.snapshot().phase, 'ready');
  assert.equal(session.snapshot().openNoteCount, 0);
  const request = session.requestCommit();
  assert.ok(request);
  validateRecordedNoteClip(request.clip);
  assert.equal(request.clip.durationBeats, 4);
});

test('runtime origin correction moves a pending finish boundary with the pass', () => {
  const session = new RecordedNoteSession({ durationBeats: 4 });
  session.start();
  assert.equal(session.finishLoop(Number.NEGATIVE_INFINITY).phase, 'finishing');
  assert.equal(session.snapshot().finishAtBeat, 4);
  assert.equal(session.setOriginBeat(100), true);
  assert.equal(session.snapshot().finishAtBeat, 104);
  assert.equal(session.advanceClock(103.99), false);
  assert.equal(session.advanceClock(104), true);
  assert.equal(session.snapshot().phase, 'ready');
});

test('a one-shot pass auto-finishes on the transport clock without a Finish click', () => {
  const session = new RecordedNoteSession({ durationBeats: 2 });
  session.start();
  assert.equal(session.advanceClock(1.99), false);
  assert.equal(session.advanceClock(2), true);
  assert.equal(session.snapshot().phase, 'ready');
  const request = session.requestCommit();
  assert.ok(request);
  validateRecordedNoteClip(request.clip);
});

test('notes arriving after Finish loop request are retained until the boundary', () => {
  const session = new RecordedNoteSession({ durationBeats: 4 });
  session.start();
  session.finishLoop(1);
  assert.ok(session.recordNote({ ...walker(60, 2), durationBeats: 0.5 }));
  assert.equal(session.advanceClock(4), true);
  assert.equal(session.snapshot().phase, 'ready');
  const request = session.requestCommit();
  assert.ok(request);
  validateRecordedNoteClip(request.clip);
  assert.equal(request.clip.notes.length, 1);
});

test('releaseAll closes every held note with a positive duration', () => {
  const session = new RecordedNoteSession({ durationBeats: 4 });
  session.start();
  session.noteOn('a', { ...walker(60, 1), source: 'keyboard' });
  session.noteOn('b', { ...walker(64, 1), source: 'keyboard' });
  assert.equal(session.releaseAll(2), 2);
  ready(session);
  const request = session.requestCommit();
  assert.ok(request);
  validateRecordedNoteClip(request.clip);
  const notes = request.clip.notes;
  assert.equal(notes.length, 2);
  assert.ok(notes.every((note) => note.durationBeats >= RECORDED_NOTE_MIN_DURATION_BEATS));
});

test('closing one explicit note id removes it from release-all tracking', () => {
  const session = new RecordedNoteSession({ durationBeats: 4 });
  session.start();
  const first = session.noteOn('same-input', { ...walker(60, 0), source: 'keyboard' });
  const second = session.noteOn('same-input', { ...walker(64, 0), source: 'keyboard' });
  assert.ok(first && second);
  assert.equal(session.noteOff({ id: first, offsetBeats: 1 }), true);
  assert.equal(session.releaseAll(2), 1);
  ready(session);
  const request = session.requestCommit();
  assert.ok(request);
  const durations = request.clip.notes.map((note) => note.durationBeats).sort((a, b) => a - b);
  assert.deepEqual(durations, [1, 2]);
});

test('late or duplicate note-off cannot mutate a staged commit payload', () => {
  const session = new RecordedNoteSession({ durationBeats: 2 });
  session.start();
  const id = session.noteOn('held', { ...walker(60, 0), source: 'keyboard' });
  assert.ok(id);
  assert.equal(session.noteOff({ id, offsetBeats: 0.5 }), true);
  ready(session, 2);
  const request = session.requestCommit();
  assert.ok(request);
  const original = request.clip.notes[0]?.durationBeats;
  assert.equal(session.noteOff({ id, offsetBeats: 1.5 }), false);
  assert.equal(session.snapshot().draft?.notes[0]?.durationBeats, original);
});

test('stale acknowledgement cannot commit a re-armed session', () => {
  const session = new RecordedNoteSession({ durationBeats: 2 });
  session.start();
  session.recordNote({ ...walker(60, 0), durationBeats: 0.25 });
  ready(session, 2);
  const firstRequest = session.requestCommit();
  assert.ok(firstRequest);

  session.start('replace');
  session.recordNote({ ...walker(67, 0), durationBeats: 0.25 });
  const stale = session.acknowledge({ sessionToken: firstRequest.sessionToken, accepted: true });
  assert.equal(stale.stale, true);
  assert.equal(session.snapshot().phase, 'recording');

  ready(session, 2);
  const currentRequest = session.requestCommit();
  assert.ok(currentRequest);
  const applied = session.acknowledge({ sessionToken: currentRequest.sessionToken, accepted: true, revision: currentRequest.clip.revision });
  assert.equal(applied.applied, true);
  assert.equal(session.getCommittedClip()?.revision, currentRequest.clip.revision);
});

test('acknowledgement revision mismatch retains the draft and retry reuses its token', () => {
  const session = new RecordedNoteSession({ durationBeats: 2 });
  session.start();
  session.recordNote({ ...walker(60, 0), durationBeats: 0.25 });
  ready(session, 2);
  const request = session.requestCommit();
  assert.ok(request);
  const rejected = session.acknowledge({ sessionToken: request.sessionToken, accepted: true, revision: request.clip.revision + 1 });
  assert.equal(rejected.applied, false);
  assert.equal(rejected.stale, false);
  assert.equal(rejected.state.phase, 'error');
  assert.equal(rejected.state.draft?.notes.length, 1);
  const retry = session.retryCommit();
  assert.ok(retry);
  assert.equal(retry.sessionToken, request.sessionToken);
  const applied = session.acknowledge({ sessionToken: retry.sessionToken, accepted: true, revision: retry.clip.revision });
  assert.equal(applied.applied, true);
});

test('cancel keeps the previous clip while replace remains staged', () => {
  const previous: RecordedNoteClip = {
    schemaVersion: 1,
    id: 'lane-2',
    revision: 4,
    durationBeats: 4,
    grid: { steps: 32 },
    notes: [{ id: 7, onsetBeats: 0, durationBeats: 1, pitch: 48, velocity: 0.5 }],
  };
  const session = new RecordedNoteSession({ previousClip: previous });
  session.start('replace', { durationBeats: 8, gridSteps: 32 });
  session.recordNote({ ...walker(72, 0), durationBeats: 0.5 });
  assert.equal(session.snapshot().draft?.notes.length, 1);
  session.cancel();
  assert.deepEqual(session.getCommittedClip(), previous);
});

test('overdub preserves the prior phrase and extend keeps grid separate from phrase duration', () => {
  const previous: RecordedNoteClip = {
    schemaVersion: 1,
    id: 'lane-1',
    revision: 2,
    durationBeats: 4,
    grid: { steps: 16 },
    notes: [{ id: 3, onsetBeats: 0, durationBeats: 1, pitch: 48, velocity: 0.4 }],
  };
  const session = new RecordedNoteSession({ previousClip: previous });
  session.start('overdub', { gridSteps: 32 });
  session.recordNote({ ...walker(60, 1), durationBeats: 0.5 });
  ready(session, 4);
  const overdub = session.requestCommit()?.clip;
  assert.equal(overdub?.durationBeats, 4);
  assert.equal(overdub?.grid.steps, 32);
  assert.equal(overdub?.notes.length, 2);

  session.acknowledge({ sessionToken: session.snapshot().token!, accepted: true, revision: overdub!.revision });
  session.start('extend', { durationBeats: 2, gridSteps: 32 });
  session.recordNote({ ...walker(72, 0), durationBeats: 0.5 });
  ready(session, 6);
  const extended = session.requestCommit()?.clip;
  validateRecordedNoteClip(extended);
  assert.equal(extended?.durationBeats, 6);
  assert.equal(extended?.grid.steps, 32);
  assert.equal(extended?.notes[extended.notes.length - 1]?.onsetBeats, 4);
});

test('invalid overdub duration leaves the retained clip untouched before rearm', () => {
  const previous: RecordedNoteClip = {
    schemaVersion: 1,
    id: 'lane-overdub-bound',
    revision: 3,
    durationBeats: 4,
    grid: { steps: 16 },
    notes: [{ id: 2, onsetBeats: 1, durationBeats: 1, pitch: 50, velocity: 0.5 }],
  };
  const session = new RecordedNoteSession({ previousClip: previous });
  const before = session.getCommittedClip();
  const rejected = session.start('overdub', { durationBeats: 2 });
  assert.equal(rejected.phase, 'error');
  assert.equal(rejected.error?.kind, 'invalid');
  assert.deepEqual(session.getCommittedClip(), before);
  assert.doesNotThrow(() => validateRecordedNoteClip(rejected.draft));
  assert.equal(session.start('overdub', { durationBeats: 4 }).phase, 'recording');
});

test('invalid extension over the duration limit leaves the retained clip untouched', () => {
  const previous: RecordedNoteClip = {
    schemaVersion: 1,
    id: 'lane-extend-bound',
    revision: 5,
    durationBeats: 4090,
    grid: { steps: 2 },
    notes: [{ id: 4, onsetBeats: 0, durationBeats: 1, pitch: 52, velocity: 0.5 }],
  };
  const session = new RecordedNoteSession({ previousClip: previous });
  const before = session.getCommittedClip();
  const rejected = session.start('extend', { durationBeats: 7 });
  assert.equal(rejected.phase, 'error');
  assert.match(rejected.error?.message ?? '', /exceed/);
  assert.deepEqual(session.getCommittedClip(), before);
  assert.doesNotThrow(() => validateRecordedNoteClip(rejected.draft));
  const accepted = session.start('extend', { durationBeats: 6 });
  assert.equal(accepted.phase, 'recording');
  assert.equal(accepted.draft?.durationBeats, 4096);
  validateRecordedNoteClip(accepted.draft);
});

test('stop now in an extended pass closes against the extension offset without shrinking prior notes', () => {
  const previous: RecordedNoteClip = {
    schemaVersion: 1,
    id: 'lane-stop',
    revision: 1,
    durationBeats: 4,
    grid: { steps: 16 },
    notes: [{ id: 1, onsetBeats: 3.5, durationBeats: 1, pitch: 48, velocity: 0.5 }],
  };
  const session = new RecordedNoteSession({ previousClip: previous });
  session.start('extend', { durationBeats: 2, originBeat: 100 });
  session.noteOn('extension', { ...walker(72, 0), source: 'keyboard' });
  assert.equal(session.finishLoop(100).phase, 'finishing');
  assert.equal(session.snapshot().finishAtBeat, 102);
  assert.equal(session.stopNow(101).phase, 'ready');
  const request = session.requestCommit();
  assert.ok(request);
  validateRecordedNoteClip(request.clip);
  assert.equal(request.clip.durationBeats, 5);
  assert.equal(request.clip.notes.find((note) => note.id !== 1)?.onsetBeats, 4);
});
