import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STATE } from '../../ui/state';
import { defaultResolvedHarmonyFrame } from '../CoreProductHarmonyControl';
import type { HarmonyProjection } from './harmonyProjection';
import { createHarmonyPhrasePreview } from './harmonyPhrasePreview';

function projection(current: number[], next: number[]): HarmonyProjection {
  const frame = {
    ...defaultResolvedHarmonyFrame(60, 1),
    currentNotePool: current,
    nextNotePool: next,
  };
  return {
    engine: {
      homeRootNote: 0,
      effectiveRootNote: 0,
      rootMidi: 60,
      homeScaleName: 'Major (Ionian)',
      homeScaleId: 1,
      scaleId: 1,
      scaleName: 'Major (Ionian)',
      scaleMode: 'manual',
      morphLocked: false,
    },
    activeFrame: frame,
    underlyingFrame: frame,
    manualControl: {} as HarmonyProjection['manualControl'],
    chordSequence: [],
    chordSequenceEnabled: false,
    chordSequenceLength: 0,
    chordSequenceStepIndex: 0,
    tension: 0.3,
    slots: [],
    progression: [],
    canonicalProgression: { version: 1, enabled: false, events: [], currentEventIndex: 0 },
    position: {
      eventIndex: 1,
      eventId: 'event-2',
      barInEvent: 0,
      phraseIndex: 7,
      absoluteBarIndex: 28,
    },
    liveLayer: null,
    activeLiveInputScope: null,
    morphPlan: {} as HarmonyProjection['morphPlan'],
    bank: 'A',
    isEndpoint: true,
    runtimeHarmonyReady: true,
  };
}

test('builds the chord visualizer from authoritative Harmony note pools', () => {
  const preview = createHarmonyPhrasePreview(
    {
      ...DEFAULT_STATE,
      synthChordGeneratorEnabled: true,
      synthChordGeneratorVoiceCount: 3,
      waveSpread: 0,
    },
    projection([67, 60, 64, 60], [69, 65, 72]),
    {
      effectiveBpm: 120,
      effectivePhraseSeconds: 16,
      nextPhraseBoundaryIn: 12,
      nextHarmonyEventIn: 3,
      nextProgressionStepIn: 3,
    },
  );

  assert.equal(preview.kind, 'padChord');
  assert.equal(preview.enabled, true);
  assert.equal(preview.phraseIndex, 7);
  assert.deepEqual(
    preview.notes.filter((note) => note.id.includes(':current:')).map((note) => note.midi),
    [60, 64, 67],
  );
  assert.deepEqual(
    preview.notes.filter((note) => note.id.includes(':next:')).map((note) => note.midi),
    [65, 69, 72],
  );
  assert.equal(
    preview.notes.find((note) => note.id.includes(':next:'))?.triggerSeconds,
    7,
    'next Harmony event should be placed at the transport-relative phrase position',
  );
});

test('does not invent a next chord when Harmony reports the same pool', () => {
  const preview = createHarmonyPhrasePreview(
    {
      ...DEFAULT_STATE,
      synthChordGeneratorEnabled: true,
      synthChordGeneratorVoiceCount: 3,
      waveSpread: 0,
    },
    projection([60, 64, 67], [67, 64, 60]),
  );
  assert.equal(preview.notes.length, 3);
  assert.ok(preview.notes.every((note) => note.id.includes(':current:')));
});

test('shows the Harmony-driven generator as off without inventing preview notes', () => {
  const preview = createHarmonyPhrasePreview(
    { ...DEFAULT_STATE, synthChordGeneratorEnabled: false },
    projection([60, 64, 67], [65, 69, 72]),
  );
  assert.equal(preview.enabled, false);
  assert.deepEqual(preview.notes, []);
});
