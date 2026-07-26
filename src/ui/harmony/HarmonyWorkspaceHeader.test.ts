import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveHarmonyWorkspaceHeader } from './HarmonyWorkspaceHeader';
import { deriveHarmonyWorkspaceTonalContext } from './useHarmonyWorkspaceController';
import type { HarmonyProjection } from '../../audio/harmony/harmonyProjection';

const projection = {
  engine: { homeRootNote: 0, effectiveRootNote: 0, rootMidi: 60, homeScaleName: 'Major (Ionian)', homeScaleId: 1, scaleId: 1, scaleName: 'Ionian', scaleMode: 'manual', morphLocked: false },
  underlyingFrame: { activeSource: 'baseline', rootMidi: 60, quality: 'maj', currentNotePool: [], scaleId: 1 },
  activeFrame: { activeSource: 'baseline', rootMidi: 60, quality: 'maj', currentNotePool: [], scaleId: 1 },
  position: { eventIndex: -1, eventId: null, barInEvent: 0, phraseIndex: 0 },
  progression: [], slots: [], canonicalProgression: { version: 1, enabled: false, events: [], currentEventIndex: 0 },
  chordSequence: [], chordSequenceEnabled: false, chordSequenceLength: 0, chordSequenceStepIndex: 0, tension: 0.3,
  manualControl: {}, liveLayer: null, activeLiveInputScope: null, morphPlan: {}, bank: 'A', isEndpoint: true,
} as unknown as HarmonyProjection;

test('workspace header exposes Engine plus one advisory context', () => {
  const header = deriveHarmonyWorkspaceHeader(projection, {
    engine: { rootPitchClass: 0, scaleId: 1, scaleName: 'Ionian' },
    playing: { mode: 'playing', top: { rootPitchClass: 0, scaleId: 1, scaleName: 'Ionian', confidence: 0.8, score: 0.8, noteCoverage: 1, diatonicChordFit: 1, rootBassEvidence: 1, cadenceEvidence: 1, orderEvidence: 1, confirmedRecognition: 1 }, confidence: 0.8, alternatives: [], evidenceWeight: 3, heldByHysteresis: false, insufficientEvidence: false },
    preview: null,
  });
  assert.equal(header.tonal?.mode, 'playing');
  assert.match(header.tonal?.engine ?? '', /C/);
  assert.match(header.tonal?.context ?? '', /Ionian/);
});

test('insufficient Playing evidence is rendered as uncommitted rather than a forced label', () => {
  const header = deriveHarmonyWorkspaceHeader(projection, {
    engine: { rootPitchClass: 0, scaleId: 1 },
    playing: { mode: 'playing', top: null, confidence: 0, alternatives: [], evidenceWeight: 0.4, heldByHysteresis: false, insufficientEvidence: true },
    preview: null,
  });
  assert.equal(header.tonal?.context, 'Insufficient evidence');
});

test('Preview replaces Playing context only while hypothetical evidence exists', () => {
  const header = deriveHarmonyWorkspaceHeader(projection, {
    engine: { rootPitchClass: 0, scaleId: 1 },
    playing: { mode: 'playing', top: null, confidence: 0, alternatives: [], evidenceWeight: 0, heldByHysteresis: false, insufficientEvidence: true },
    preview: { mode: 'preview', top: { rootPitchClass: 9, scaleId: 2, scaleName: 'Aeolian', confidence: 0.5, score: 0.5, noteCoverage: 1, diatonicChordFit: 1, rootBassEvidence: 1, cadenceEvidence: 0, orderEvidence: 0, confirmedRecognition: 0 }, confidence: 0.5, alternatives: [], evidenceWeight: 0.9, heldByHysteresis: false, insufficientEvidence: false },
  });
  assert.equal(header.tonal?.mode, 'preview');
  assert.match(header.tonal?.context ?? '', /A Aeolian/);
});

test('workspace tonal bridge derives Playing from progression/locked slots and Preview from live layer', () => {
  const workspaceProjection = {
    ...projection,
    progression: [{ id: 'slot-a', slotId: 1, source: 'slotFollow', durationBars: 1, startBar: 0, endBar: 1 }],
    slots: [{ id: 1, name: 'A', locked: true, chord: { exactMidiNotes: [64, 67, 60], intent: { rootMode: 'degree', degree: 0 }, intentSource: 'confirmed' } }],
    liveLayer: { kind: 'draft-live', draft: { exactMidiNotes: [57, 60, 64, 67], intent: { rootNote: 9 } } },
  } as unknown as HarmonyProjection;
  const context = deriveHarmonyWorkspaceTonalContext(workspaceProjection, 1000);
  assert.ok(context.playing.evidenceWeight > 0);
  assert.ok(context.playing.alternatives.some((candidate) => candidate.rootPitchClass === 0), 'degree slot root must resolve from Engine root even for inverted notes');
  assert.equal(context.preview?.mode, 'preview');
  assert.ok(context.preview?.evidenceWeight && context.preview.evidenceWeight > 0);
});

test('running live Preview does not replace committed Playing evidence', () => {
  const withoutPreview = deriveHarmonyWorkspaceTonalContext({ ...projection, liveLayer: null } as HarmonyProjection, 1000, true);
  const withPreview = deriveHarmonyWorkspaceTonalContext({
    ...projection,
    liveLayer: { kind: 'draft-live', draft: { exactMidiNotes: [57, 60, 64, 67], intent: { rootMode: 'degree', degree: 5, rootNote: 0 } } },
  } as unknown as HarmonyProjection, 1000, true);
  assert.deepEqual(withPreview.playing.top, withoutPreview.playing.top);
  assert.equal(withPreview.preview?.mode, 'preview');
});
