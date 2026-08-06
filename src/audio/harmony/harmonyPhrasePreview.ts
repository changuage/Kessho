import type { TransportDebugSnapshot } from '../transport';
import { getPhraseDurationForClockSource } from '../transport';
import type { SliderState } from '../../ui/state';
import type { HarmonyProjection } from './harmonyProjection';
import {
  midiNoteLabel,
  previewRange,
  type SimpleSequencerPhrasePreview,
  type SimpleSequencerVizNote,
} from '../simpleSequencerPhrasePreview';

const MAX_VISUAL_NOTES = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function boundedMidiPool(notes: readonly number[]): number[] {
  const unique = new Map<string, number>();
  for (const value of notes) {
    if (!Number.isFinite(value)) continue;
    const midi = clamp(value, 0, 127);
    unique.set(midi.toFixed(3), midi);
    if (unique.size >= MAX_VISUAL_NOTES) break;
  }
  return [...unique.values()].sort((left, right) => left - right);
}

function poolsEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((note, index) => note === right[index]);
}

function visualPhaseSeconds(
  phraseSeconds: number,
  transportDebug: TransportDebugSnapshot | null | undefined,
): number {
  const boundary = transportDebug?.nextPadChordBoundaryIn ?? transportDebug?.nextPhraseBoundaryIn;
  if (typeof boundary !== 'number' || !Number.isFinite(boundary)) return 0;
  return clamp(phraseSeconds - Math.max(0, boundary), 0, phraseSeconds);
}

function harmonyNotes(
  notes: readonly number[],
  role: 'current' | 'next',
  triggerSeconds: number,
  phraseSeconds: number,
  state: SliderState,
  spreadSpanSeconds = phraseSeconds,
): SimpleSequencerVizNote[] {
  const sourceValue = state.synthChordGeneratorSource ?? 'sample1';
  const voiceCount = clamp(Math.round(state.synthChordGeneratorVoiceCount ?? 6), 1, 8);
  const octaveShift = clamp(Math.round(state.synthOctave ?? 0), -2, 2) * 12;
  const spreadSeconds = clamp(state.waveSpread ?? 0.125, 0, 1) * spreadSpanSeconds;
  const renderedNotes = notes.length === 0
    ? []
    : Array.from({ length: voiceCount }, (_, index) => notes[index % notes.length]!);
  return renderedNotes.map((baseMidi, voiceIndex) => ({
    id: `harmony:${role}:${baseMidi.toFixed(3)}:${voiceIndex}`,
    source: sourceValue === 'both'
      ? voiceIndex % 2 === 0 ? 'pad1' : 'pad2'
      : sourceValue,
    midi: clamp(baseMidi + octaveShift, 0, 127),
    label: midiNoteLabel(clamp(baseMidi + octaveShift, 0, 127)),
    voiceIndex,
    triggerSeconds: triggerSeconds + (voiceCount <= 1 ? 0 : spreadSeconds * voiceIndex / (voiceCount - 1)),
    velocity: role === 'current' ? 1 : 0.82,
    envelope: {
      attack: 0.02,
      decay: 0.12,
      sustain: role === 'current' ? 0.88 : 0.74,
      gateSeconds: Math.max(0.25, phraseSeconds),
      release: 0.4,
    },
  }));
}

/**
 * Builds a UI-only phrase plan from the shared Harmony projection.
 * It deliberately avoids the retired chord-generator event stream: current and
 * next pitches come from the same native-backed projection used by Harmony,
 * Synth pitch binding, and the sequencer chord lanes.
 */
export function createHarmonyPhrasePreview(
  state: SliderState,
  projection: HarmonyProjection,
  transportDebug?: TransportDebugSnapshot | null,
): SimpleSequencerPhrasePreview {
  const fallbackPhraseSeconds = getPhraseDurationForClockSource(
    state,
    state.harmonyClockSource ?? 'globalPhrase',
  );
  const runtimePhraseSeconds = transportDebug?.padChordPhraseSeconds
    ?? transportDebug?.effectivePhraseSeconds;
  const phraseSeconds = typeof runtimePhraseSeconds === 'number'
    && Number.isFinite(runtimePhraseSeconds)
    && runtimePhraseSeconds > 0
    ? runtimePhraseSeconds
    : fallbackPhraseSeconds;
  const phaseSeconds = visualPhaseSeconds(phraseSeconds, transportDebug);
  const currentPool = boundedMidiPool(projection.activeFrame.currentNotePool);
  const nextPool = boundedMidiPool(projection.activeFrame.nextNotePool);
  const nextEventIn = transportDebug?.nextHarmonyEventIn;
  const nextTriggerSeconds = typeof nextEventIn === 'number' && Number.isFinite(nextEventIn)
    ? clamp(phaseSeconds + Math.max(0, nextEventIn), phaseSeconds, phraseSeconds)
    : phraseSeconds;
  const showNext = nextPool.length > 0 && !poolsEqual(currentPool, nextPool);
  const enabled = state.synthChordGeneratorEnabled === true;
  const notes = enabled ? [
    ...harmonyNotes(currentPool, 'current', 0, phraseSeconds, state),
    ...(showNext ? harmonyNotes(nextPool, 'next', nextTriggerSeconds, phraseSeconds, state) : []),
  ] : [];
  const range = previewRange(notes);
  const currentSignature = currentPool.join(',');
  const nextSignature = showNext ? nextPool.join(',') : '';

  return {
    kind: 'padChord',
    enabled,
    phraseSeconds,
    triggerIntervalSeconds: Math.max(0.001, nextTriggerSeconds),
    notes,
    ...range,
    phraseIndex: projection.position.phraseIndex,
    key: [
      'harmony',
      projection.bank,
      projection.position.eventId ?? 'auto',
      projection.position.phraseIndex,
      currentSignature,
      nextSignature,
    ].join(':'),
  };
}
