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
  progression: [], canonicalProgression: { version: 2, enabled: false, events: [], currentEventIndex: 0 },
  tension: 0.3,
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

test('header exposes explicit Adopt state without implying automatic mutation', () => {
  const header = deriveHarmonyWorkspaceHeader(projection, null, {
    targetLabel: 'G · Dorian',
    mode: 'preview',
    active: false,
    onAdopt: () => undefined,
    onCancel: () => undefined,
  });
  assert.deepEqual(header.adoption, { target: 'G · Dorian', mode: 'preview', active: false });
});

test('workspace tonal bridge derives Playing from progression chords and Preview from live layer', () => {
  const workspaceProjection = {
    ...projection,
    progression: [{ id: 'chord-a', chord: { behavior: 'follow', degree: 0, notes: [] }, source: 'chord', durationBars: 1, startBar: 0, endBar: 1 }],
    liveLayer: { kind: 'draft-live', frame: { currentNotePool: [57, 60, 64, 67], rootMidi: 57 } },
  } as unknown as HarmonyProjection;
  const context = deriveHarmonyWorkspaceTonalContext(workspaceProjection, 1000);
  assert.ok(context.playing.evidenceWeight > 0);
  assert.ok(context.playing.alternatives.some((candidate) => candidate.rootPitchClass === 0), 'a Follow chord root must resolve from the Engine root');
  assert.equal(context.preview?.mode, 'preview');
  assert.ok(context.preview?.evidenceWeight && context.preview.evidenceWeight > 0);
});

test('running live Preview does not replace committed Playing evidence', () => {
  const withoutPreview = deriveHarmonyWorkspaceTonalContext({ ...projection, liveLayer: null } as HarmonyProjection, 1000, true);
  const withPreview = deriveHarmonyWorkspaceTonalContext({
    ...projection,
    liveLayer: { kind: 'draft-live', frame: { currentNotePool: [57, 60, 64, 67], rootMidi: 57 } },
  } as unknown as HarmonyProjection, 1000, true);
  assert.deepEqual(withPreview.playing.top, withoutPreview.playing.top);
  assert.equal(withPreview.preview?.mode, 'preview');
});
