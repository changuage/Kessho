import {
  envelopeAmplitudeAt,
  previewRange,
  type SimpleSequencerPhrasePreview,
  type SimpleSequencerVizNote,
} from './simpleSequencerPhrasePreview';

type RuntimeArrangementKind = 'padChord' | 'randomTiming';

const RUNTIME_NOTE_FLOOR = 0.0008;

export function runtimePlanKey(plan: SimpleSequencerPhrasePreview): string {
  const noteKey = plan.notes
    .map((note) => `${note.id}:${note.source}:${Math.round(note.midi)}:${(note.triggerWallSec ?? note.triggerSeconds).toFixed(4)}:${note.velocity.toFixed(3)}`)
    .join('|');
  return `${plan.kind}:runtime:${plan.enabled ? 'on' : 'off'}:${plan.phraseIndex ?? 0}:${(plan.phraseStartWallSec ?? 0).toFixed(4)}:${plan.phraseSeconds.toFixed(4)}:${plan.triggerIntervalSeconds.toFixed(4)}:${noteKey}`;
}

export function cloneRuntimePlan(plan: SimpleSequencerPhrasePreview | null): SimpleSequencerPhrasePreview | null {
  if (!plan) return null;
  return {
    ...plan,
    notes: plan.notes.map((note) => ({ ...note, envelope: { ...note.envelope } })),
  };
}

export function createRuntimePlan(
  kind: RuntimeArrangementKind,
  enabled: boolean,
  phraseSeconds: number,
  triggerIntervalSeconds: number,
  phraseIndex: number,
  phraseStartWallSec: number,
  rangeMinMidi?: number,
  rangeMaxMidi?: number,
): SimpleSequencerPhrasePreview {
  const range = previewRange([], rangeMinMidi, rangeMaxMidi);
  const plan: SimpleSequencerPhrasePreview = {
    kind,
    enabled,
    phraseSeconds,
    triggerIntervalSeconds,
    notes: [],
    ...range,
    ...(rangeMinMidi != null ? { rangeMinMidi } : {}),
    ...(rangeMaxMidi != null ? { rangeMaxMidi } : {}),
    phraseIndex,
    phraseStartWallSec,
    key: '',
  };
  return { ...plan, key: runtimePlanKey(plan) };
}

export function updateRuntimePlanNotes(
  plan: SimpleSequencerPhrasePreview,
  notes: readonly SimpleSequencerVizNote[],
  rangeMinMidi = plan.rangeMinMidi,
  rangeMaxMidi = plan.rangeMaxMidi,
): SimpleSequencerPhrasePreview {
  const sortedNotes = [...notes].sort((left, right) => {
    const leftTime = left.triggerWallSec ?? left.triggerSeconds;
    const rightTime = right.triggerWallSec ?? right.triggerSeconds;
    return leftTime - rightTime || left.midi - right.midi || String(left.id).localeCompare(String(right.id));
  });
  const range = previewRange(sortedNotes, rangeMinMidi, rangeMaxMidi);
  const nextPlan: SimpleSequencerPhrasePreview = {
    ...plan,
    notes: sortedNotes,
    ...range,
    ...(rangeMinMidi != null ? { rangeMinMidi } : {}),
    ...(rangeMaxMidi != null ? { rangeMaxMidi } : {}),
  };
  return { ...nextPlan, key: runtimePlanKey(nextPlan) };
}

export function createCarryoverPlan(
  kind: RuntimeArrangementKind,
  previousPlan: SimpleSequencerPhrasePreview | null,
  currentPlan: SimpleSequencerPhrasePreview | null,
  phraseSeconds: number,
  triggerIntervalSeconds: number,
  phraseIndex: number,
  phraseStartWallSec: number,
  rangeMinMidi?: number,
  rangeMaxMidi?: number,
): SimpleSequencerPhrasePreview | null {
  const notesByKey = new Map<string, SimpleSequencerVizNote>();
  for (const plan of [previousPlan, currentPlan]) {
    if (!plan) continue;
    for (const note of plan.notes) {
      const triggerWallSec = note.triggerWallSec ?? (plan.phraseStartWallSec != null ? plan.phraseStartWallSec + note.triggerSeconds : null);
      if (triggerWallSec == null || !Number.isFinite(triggerWallSec)) continue;
      const ageAtPhraseStart = phraseStartWallSec - triggerWallSec;
      if (ageAtPhraseStart >= 0 && envelopeAmplitudeAt(ageAtPhraseStart, note.envelope) <= RUNTIME_NOTE_FLOOR) continue;
      notesByKey.set(`${note.id}:${triggerWallSec.toFixed(4)}`, {
        ...note,
        triggerSeconds: triggerWallSec - phraseStartWallSec,
        triggerWallSec,
      });
    }
  }
  const notes = [...notesByKey.values()];
  if (notes.length === 0) return null;
  return updateRuntimePlanNotes(
    createRuntimePlan(kind, true, phraseSeconds, triggerIntervalSeconds, phraseIndex, phraseStartWallSec, rangeMinMidi, rangeMaxMidi),
    notes,
    rangeMinMidi,
    rangeMaxMidi,
  );
}
