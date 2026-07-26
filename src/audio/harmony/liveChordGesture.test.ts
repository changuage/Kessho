import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveChordGesture, createLiveChordLayerController, nextSafeAudioBlock, releaseLiveChordGesture, resolveLiveChordExecution, shouldEmitLiveChordMonitorNotes, stopLiveChordGesture } from './liveChordGesture';
import type { HarmonyDraftChord, ResolvedHarmonyFrame } from './harmonyTypes';

const draft = (playbackBehavior: HarmonyDraftChord['playbackBehavior'] = 'auto'): HarmonyDraftChord => ({
  intent: null,
  intentSource: null,
  exactMidiNotes: [60, 64, 67],
  semanticCandidates: [],
  quality: 'maj',
  extensions: [],
  playbackBehavior,
  capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
  recognizedLabel: 'C maj',
  editFocus: 'exact',
  source: 'onscreen',
  dirty: true,
});

const frame: ResolvedHarmonyFrame = {
  activeSource: 'baseline', activeStepIndex: 0, activeSlotId: 0, rootMidi: 60, effectiveRootMidiAnchor: 60, scaleId: 1, degree: 0,
  quality: 'maj', currentNotePool: [60, 64, 67], bassNote: null, nextNotePool: [60, 64, 67], nextSource: null, nextStepIndex: null,
  morphPercent: 0, manualControlAvailable: true,
};

test('gesture release/latch is temporary and does not imply authored writes', () => {
  const gesture = createLiveChordGesture({ id: 'g1', scope: { kind: 'seq', seqId: 0 }, target: 'track', source: 'onscreen', draft: draft() });
  assert.equal(gesture.phase, 'start');
  assert.equal(releaseLiveChordGesture(gesture).phase, 'release');
  assert.equal(releaseLiveChordGesture(gesture, true).phase, 'update');
  assert.equal(stopLiveChordGesture(gesture).phase, 'stop');
});

test('Track and Harmony share immediate safe-block entry while Exact Seq bypasses takeover', () => {
  assert.equal(nextSafeAudioBlock(42, false), 43);
  assert.equal(nextSafeAudioBlock(42, true), 43);
  const harmonyGesture = createLiveChordGesture({ id: 'g2', scope: 'detail-draft', target: 'harmony', source: 'suggestion', draft: draft() });
  const harmony = resolveLiveChordExecution({ gesture: harmonyGesture, draft: draft(), effectiveFrame: frame, currentAudioBlock: 42, running: true });
  assert.equal(harmony.entersAtAudioBlock, 43);
  assert.deepEqual(harmony.temporaryHarmonyFrame?.currentNotePool, [60, 64, 67]);
  const exactGesture = createLiveChordGesture({ id: 'g3', scope: { kind: 'seq', seqId: 0 }, target: 'harmony', source: 'slot', draft: draft('exact') });
  const exact = resolveLiveChordExecution({ gesture: exactGesture, draft: draft('exact'), effectiveFrame: frame, currentAudioBlock: 42, running: true });
  assert.equal(exact.bypassesHarmony, true);
  assert.equal(exact.temporaryHarmonyFrame, null);
  assert.equal(shouldEmitLiveChordMonitorNotes({ target: 'harmony', running: true, bypassesHarmony: true }), true);
  assert.equal(shouldEmitLiveChordMonitorNotes({ target: 'harmony', running: true, bypassesHarmony: false }), false);
  assert.equal(shouldEmitLiveChordMonitorNotes({ target: 'harmony', running: false, bypassesHarmony: false }), true);
});

test('App layer controller releases only the active gesture and never mutates authored state', () => {
  const authored = { slots: [{ id: 0, chord: 'C' }], progression: ['S1'] };
  const changes: unknown[] = [];
  const controller = createLiveChordLayerController((layer) => changes.push(layer));
  const layer = { kind: 'harmony-takeover' as const, latched: false, frame };
  controller.start('old', layer);
  controller.start('new', layer);
  controller.release('old');
  assert.equal(controller.activeGestureId(), 'new');
  assert.equal(changes.length, 2);
  controller.release('new');
  assert.equal(controller.activeGestureId(), null);
  assert.equal(changes[changes.length - 1], null);
  assert.deepEqual(authored, { slots: [{ id: 0, chord: 'C' }], progression: ['S1'] });
});
