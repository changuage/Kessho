import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftFromCapturedNotes,
  initialHarmonyCaptureState,
  reduceHarmonyCaptureNoteOff,
  reduceHarmonyCaptureNoteOn,
  reduceHarmonyCaptureSustain,
  resolveHarmonyDraftNotes,
  resolveHarmonyDraftRerootPreview,
  setDraftPlaybackBehavior,
} from './harmonyDraftChord';

const context = { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 };

test('ADGH capture groups held notes and preserves semantic plus exact values', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOn(state, 62, 30);
  state = reduceHarmonyCaptureNoteOn(state, 67, 60);
  state = reduceHarmonyCaptureNoteOn(state, 71, 90);
  const draft = draftFromCapturedNotes(state.capturedGesture, context);
  assert.deepEqual(draft.exactMidiNotes, [60, 62, 67, 71]);
  assert.equal(draft.semanticCandidates.length, 1);
  assert.ok(draft.intent || draft.semanticCandidates[0]?.intent);
});

test('the initial grouping window accepts 99ms and starts a fresh group after 100ms', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOn(state, 64, 99);
  assert.deepEqual(state.capturedGesture, [60, 64]);
  state = reduceHarmonyCaptureNoteOn(state, 67, 201);
  assert.deepEqual(state.capturedGesture, [60, 64, 67]);
  assert.equal(state.groupingStartedAt, 201);
});

test('release does not shrink draft and F after GH starts from held plus F', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureNoteOn(state, 67, 0);
  state = reduceHarmonyCaptureNoteOn(state, 71, 40);
  state = reduceHarmonyCaptureNoteOff(state, 67);
  state = reduceHarmonyCaptureNoteOn(state, 65, 80);
  assert.deepEqual(state.capturedGesture, [65, 71]);
  assert.deepEqual(Array.from(state.heldNotes).sort((a, b) => a - b), [65, 71]);
});

test('sustain-held notes remain in the next gesture until pedal release', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureSustain(state, true);
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOff(state, 60);
  state = reduceHarmonyCaptureNoteOn(state, 64, 120);
  assert.deepEqual(state.capturedGesture, [60, 64]);
  state = reduceHarmonyCaptureSustain(state, false);
  assert.deepEqual(Array.from(state.heldNotes), [64]);
  state = reduceHarmonyCaptureNoteOff(state, 64);
  assert.equal(state.heldNotes.size, 0);
});

test('playback behavior changes never discard exact capture', () => {
  const draft = draftFromCapturedNotes([60, 64, 67], context);
  for (const behavior of ['auto', 'relative', 'exact'] as const) {
    const next = setDraftPlaybackBehavior(draft, behavior);
    assert.deepEqual(next.exactMidiNotes, [60, 64, 67]);
    assert.deepEqual(next.semanticCandidates, draft.semanticCandidates);
  }
  assert.deepEqual(resolveHarmonyDraftNotes(setDraftPlaybackBehavior(draft, 'exact'), 84), [60, 64, 67]);
});

test('re-root preview shifts only the resolved preview and leaves draft representations intact', () => {
  const draft = draftFromCapturedNotes([60, 64, 67], context);
  assert.deepEqual(resolveHarmonyDraftRerootPreview(draft, 60, 5), [65, 69, 72]);
  assert.deepEqual(draft.exactMidiNotes, [60, 64, 67]);
  assert.equal(draft.capturedContext.rootMidi, 60);
});

test('new note after a complete release resets from the new note', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOff(state, 60);
  state = reduceHarmonyCaptureNoteOn(state, 72, 500);
  assert.deepEqual(state.capturedGesture, [72]);
});
