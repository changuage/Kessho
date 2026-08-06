import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftFromCapturedNotes,
  initialHarmonyCaptureState,
  HARMONY_DRAFT_GROUPING_WINDOW_MS,
  reduceHarmonyCaptureNoteOff,
  reduceHarmonyCaptureNoteOn,
  reduceHarmonyCaptureReleaseAll,
  reduceHarmonyCaptureSettled,
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
  assert.deepEqual(state.capturedGesture, []);
  state = reduceHarmonyCaptureSettled(state, 90 + HARMONY_DRAFT_GROUPING_WINDOW_MS);
  const draft = draftFromCapturedNotes(state.capturedGesture, context);
  assert.deepEqual(draft.exactMidiNotes, [60, 62, 67, 71]);
  assert.equal(draft.semanticCandidates.length, 1);
  assert.ok(draft.intent || draft.semanticCandidates[0]?.intent);
});

test('the settle window retains the largest near-simultaneous held chord', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOn(state, 64, 40);
  state = reduceHarmonyCaptureNoteOn(state, 67, 80);
  assert.deepEqual(reduceHarmonyCaptureSettled(state, 80 + HARMONY_DRAFT_GROUPING_WINDOW_MS - 1).capturedGesture, []);
  state = reduceHarmonyCaptureNoteOn(state, 71, 100);
  state = reduceHarmonyCaptureSettled(state, 100 + HARMONY_DRAFT_GROUPING_WINDOW_MS);
  assert.deepEqual(state.capturedGesture, [60, 64, 67, 71]);
});

test('release does not shrink a four-note chord and a foreign third note replaces it', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOn(state, 64, 20);
  state = reduceHarmonyCaptureNoteOn(state, 67, 0);
  state = reduceHarmonyCaptureNoteOn(state, 71, 40);
  state = reduceHarmonyCaptureSettled(state, 40 + HARMONY_DRAFT_GROUPING_WINDOW_MS);
  assert.deepEqual(state.capturedGesture, [60, 64, 67, 71]);
  state = reduceHarmonyCaptureNoteOff(state, 60);
  state = reduceHarmonyCaptureNoteOff(state, 64);
  assert.deepEqual(state.capturedGesture, [60, 64, 67, 71]);
  state = reduceHarmonyCaptureNoteOn(state, 65, 240);
  assert.deepEqual(state.pendingGesture, [65, 67, 71]);
  state = reduceHarmonyCaptureNoteOff(state, 65);
  assert.deepEqual(state.capturedGesture, [65, 67, 71]);
});

test('replaying a retained note into the two-note tail does not replace the retained chord', () => {
  let state = initialHarmonyCaptureState();
  for (const [index, note] of [60, 64, 67, 71].entries()) state = reduceHarmonyCaptureNoteOn(state, note, index * 20);
  state = reduceHarmonyCaptureSettled(state, 60 + HARMONY_DRAFT_GROUPING_WINDOW_MS);
  state = reduceHarmonyCaptureNoteOff(state, 60);
  state = reduceHarmonyCaptureNoteOff(state, 64);
  state = reduceHarmonyCaptureNoteOn(state, 60, 260);
  assert.deepEqual(state.pendingGesture, []);
  assert.deepEqual(state.capturedGesture, [60, 64, 67, 71]);
});

test('a fresh three-note gesture replaces the retained chord even when it is a subset', () => {
  let state = initialHarmonyCaptureState();
  for (const [index, note] of [60, 64, 67, 71].entries()) state = reduceHarmonyCaptureNoteOn(state, note, index * 20);
  state = reduceHarmonyCaptureReleaseAll(state);
  assert.deepEqual(state.capturedGesture, [60, 64, 67, 71]);
  for (const [index, note] of [60, 64, 67].entries()) state = reduceHarmonyCaptureNoteOn(state, note, 300 + index * 20);
  state = reduceHarmonyCaptureSettled(state, 340 + HARMONY_DRAFT_GROUPING_WINDOW_MS);
  assert.deepEqual(state.capturedGesture, [60, 64, 67]);
});

test('sustain-held notes participate in a complete retained chord until pedal release', () => {
  let state = initialHarmonyCaptureState();
  state = reduceHarmonyCaptureSustain(state, true);
  state = reduceHarmonyCaptureNoteOn(state, 60, 0);
  state = reduceHarmonyCaptureNoteOff(state, 60);
  state = reduceHarmonyCaptureNoteOn(state, 64, 120);
  state = reduceHarmonyCaptureNoteOn(state, 67, 150);
  state = reduceHarmonyCaptureSettled(state, 150 + HARMONY_DRAFT_GROUPING_WINDOW_MS);
  assert.deepEqual(state.capturedGesture, [60, 64, 67]);
  state = reduceHarmonyCaptureSustain(state, false);
  assert.deepEqual(Array.from(state.heldNotes).sort((a, b) => a - b), [64, 67]);
  state = reduceHarmonyCaptureNoteOff(state, 64);
  state = reduceHarmonyCaptureNoteOff(state, 67);
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
  assert.deepEqual(state.capturedGesture, []);
  assert.deepEqual(state.pendingGesture, []);
});
