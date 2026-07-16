import type { SliderState } from '../ui/state';
import { getPhraseDurationForClockSource } from './transport';
import { coreProductChordSequencerStepSeconds } from './coreProductChordSequencerClock';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { booleanFromState, clamp, numberFromState } from './coreProductSnapshotState';
import type { CoreProductSnapshot } from './coreProductSnapshotTypes';
import {
  leadRandomSource,
  leadRandomSourceEnabled,
  leadRandomSourceId,
  manualNoteSourceEnabled,
  createSchedulerHarmonyState,
  simpleSequencerSourceId,
  synthChordGeneratorSource,
  synthChordGeneratorSourceEnabled,
} from './coreProductArrangementSchedulerUtils';
import {
  createSynthChordSlotResolutionContext,
  defaultSynthChordSequencerStep,
  resolveSynthChordStepMidiPool,
  sanitizeSynthChordSequencerConfig,
  synthChordArpPatternForShape,
  synthChordArpSpeedSeconds,
} from './synthChordSequencer';
import { getEffectiveTension } from './harmony';
import { getUtcBucket, xmur3 } from './rng';
import { padEuclidOwnedVoiceMask } from './coreProductArrangementVoiceMapping';

function arrangementRngState(state: Record<string, unknown>): number {
  const explicit = numberFromState(state, 'arrangementRngState', Number.NaN);
  if (Number.isFinite(explicit)) return Math.max(1, Math.round(explicit) >>> 0);
  const bucket = getUtcBucket(state.seedWindow === 'day' ? 'day' : 'hour');
  return xmur3(`${bucket}|E_ROOT`)() || 1;
}

export function coreProductArrangementSnapshotFromState(
  state: Record<string, unknown> | undefined,
): CoreProductSnapshot['arrangement'] {
  const arrangementState = state ?? {};
  const sliderState = arrangementState as unknown as SliderState;
  const chordSequencer = sanitizeSynthChordSequencerConfig(arrangementState.synthChordSequencer);
  const chordGeneratorSource = String(arrangementState.synthChordGeneratorSource ?? 'sample1').trim().toLowerCase();
  const chordSequencerSource = String(arrangementState.synthChordSequencerSource ?? 'sample1').trim().toLowerCase();
  const randomSource = leadRandomSource(arrangementState);
  const chordSequencerSourceId = simpleSequencerSourceId(arrangementState.synthChordSequencerSource);
  const chordSequencerEnabled = booleanFromState(arrangementState, 'synthChordSequencerEnabled', false)
    && manualNoteSourceEnabled(arrangementState, chordSequencerSourceId);
  const leadTensionMode = arrangementState.leadTensionMode === 'locked' || arrangementState.leadTensionMode === 'bypass'
    ? arrangementState.leadTensionMode
    : 'follow';
  const leadTension = getEffectiveTension(
    clamp(numberFromState(arrangementState, 'tension', 0.3), 0, 1),
    leadTensionMode,
    clamp(numberFromState(arrangementState, 'leadTensionValue', 0), -0.5, 0.5),
  );
  const harmonyState = createSchedulerHarmonyState(sliderState);
  const slotContext = createSynthChordSlotResolutionContext(arrangementState, harmonyState);
  const fallbackChordMidi = harmonyState.currentChord.midiNotes;
  const chordSlotPools = Array.from({ length: 8 }, (_, slotId) => resolveSynthChordStepMidiPool({
    step: { ...defaultSynthChordSequencerStep(slotId), slotId },
    context: slotContext,
    fallbackMidi: fallbackChordMidi,
  }));
  const subLaneNames = ['chord', 'expression', 'morph', 'distance', 'nudge'] as const;
  const subLaneDirectionId = (direction: string): number => direction === 'reverse' ? 1 : direction === 'pingpong' ? 2 : 0;
  const arpPattern = chordSequencer.arp.shape === 'custom'
    ? chordSequencer.arp.pattern
    : synthChordArpPatternForShape(chordSequencer.arp.shape, chordSequencer.arp.patternLength);
  const playbackMode = chordSequencer.playbackMode === 'arp' ? 1 : chordSequencer.playbackMode === 'strum' ? 2 : 0;
  const strumDirection = ['up', 'down', 'upDown', 'downUp', 'random'].indexOf(chordSequencer.strum.direction);
  const leadPhraseSeconds = getPhraseDurationForClockSource(
    sliderState,
    sliderState.leadRandomClockSource ?? 'globalPhrase',
  );
  const leadClockSource = sliderState.leadRandomClockSource ?? 'globalPhrase';
  const snapshotWallSec = numberFromState(arrangementState, '__coreProductSnapshotWallSec', 0);
  const leadInitialDelaySeconds = (sliderState.leadRandomSyncPolicy ?? 'nextPhrase') === 'nextPhrase'
    ? leadClockSource === 'globalPhrase' || leadClockSource === 'globalBeat'
      ? Math.max(0, Math.ceil(snapshotWallSec / leadPhraseSeconds) * leadPhraseSeconds - snapshotWallSec)
      : leadPhraseSeconds
    : 0;

  return {
    chordGeneratorEnabled: synthChordGeneratorSourceEnabled(arrangementState),
    chordGeneratorSourceId: simpleSequencerSourceId(synthChordGeneratorSource(arrangementState)),
    chordGeneratorVoiceCount: clamp(Math.round(numberFromState(arrangementState, 'synthChordGeneratorVoiceCount', 6)), 1, 8),
    chordSequencerEnabled,
    chordSequencerSourceId,
    chordSequencerVoiceCount: clamp(Math.round(numberFromState(arrangementState, 'synthChordSequencerVoiceCount', 6)), 1, 8),
    chordSequencerStepCount: chordSequencer.stepCount,
    chordSequencerEnabledMask: chordSequencer.steps.reduce(
      (mask, step, index) => step.enabled ? mask | (1 << index) : mask,
      0,
    ) >>> 0,
    chordSequencerStepSeconds: coreProductChordSequencerStepSeconds(arrangementState),
    chordSequencerProbability: chordSequencer.steps.map((step) => step.probability),
    chordSequencerHoldSteps: chordSequencer.steps.map((step) => step.holdSteps),
    leadRandomEnabled: leadRandomSourceEnabled(arrangementState, randomSource),
    leadRandomSourceId: leadRandomSourceId(randomSource),
    leadPhraseSeconds,
    leadDensity: clamp(numberFromState(arrangementState, 'lead1Density', 0.5), 0.1, 12),
    leadOctave: clamp(Math.round(numberFromState(arrangementState, 'lead1Octave', 1)), -1, 2),
    leadOctaveRange: clamp(Math.round(numberFromState(arrangementState, 'lead1OctaveRange', 2)), 1, 4),
    leadHoldSeconds: coreProductSynthSequencerHoldSecondsFromState(
      arrangementState,
      leadRandomSourceId(randomSource),
      0.5,
    ),
    leadVelocityMin: 0.5,
    leadVelocityMax: 0.9,
    rngState: arrangementRngState(arrangementState),
    waveSpread: clamp(numberFromState(arrangementState, 'waveSpread', 0.125), 0, 1),
    synthOctave: clamp(Math.round(numberFromState(arrangementState, 'synthOctave', 0)), -2, 2),
    leadChordBias: leadTension < 0 ? 0.9 : 0.9 - leadTension * 0.4,
    synthVoiceMask: clamp(Math.round(numberFromState(arrangementState, 'synthVoiceMask', 63)), 0, 255) >>> 0,
    pad2VoiceAssign: clamp(Math.round(numberFromState(arrangementState, 'pad2VoiceAssign', 0)), 0, 255) >>> 0,
    padEuclidOwnedVoiceMask: padEuclidOwnedVoiceMask(arrangementState) >>> 0,
    chordGeneratorPadSplit: chordGeneratorSource === 'pad',
    chordSequencerPadSplit: chordSequencerSource === 'pad',
    sourceHoldSeconds: Array.from(
      { length: 8 },
      (_, index) => coreProductSynthSequencerHoldSecondsFromState(arrangementState, index + 1, 0.5),
    ),
    pad1FitEnvelopeToChord: arrangementState.padFitEnvelopeToChord !== false,
    pad2FitEnvelopeToChord: arrangementState.pad2FitEnvelopeToChord !== false,
    chordSlotNoteCount: chordSlotPools.map((pool) => pool.length),
    chordSlotMidi: chordSlotPools.flatMap((pool) => Array.from({ length: 8 }, (_, index) => pool[index] ?? 0)),
    chordStepSlotId: chordSequencer.steps.map((step) => step.slotId ?? -1),
    chordSlotLaneEnabled: chordSequencer.subLanes.chord.enabled,
    chordExpressionMask: chordSequencer.subLanes.expression.enabled ? 0xff : 0,
    chordMorphMask: chordSequencer.subLanes.morph.enabled ? 0xff : 0,
    chordDistanceMask: chordSequencer.subLanes.distance.enabled ? 0xff : 0,
    chordNudgeMask: chordSequencer.subLanes.nudge.enabled ? 0xff : 0,
    chordExpression: chordSequencer.subLanes.expression.values,
    chordMorph: chordSequencer.subLanes.morph.values,
    chordDistance: chordSequencer.subLanes.distance.values,
    chordNudge: chordSequencer.subLanes.nudge.values,
    chordLaneValues: chordSequencer.subLanes.chord.values,
    chordSubLaneSteps: subLaneNames.map((name) => chordSequencer.subLanes[name].steps),
    chordSubLaneDirections: subLaneNames.map((name) => subLaneDirectionId(chordSequencer.subLanes[name].direction)),
    chordPlaybackMode: playbackMode,
    chordArpSpeedSeconds: synthChordArpSpeedSeconds(arrangementState, chordSequencer.arp.speed),
    chordArpGate: chordSequencer.arp.gate,
    chordArpPatternLength: chordSequencer.arp.patternLength,
    chordArpActiveMask: arpPattern.reduce((mask, step, index) => step.active ? mask | (1 << index) : mask, 0) >>> 0,
    chordArpTone: arpPattern.map((step) => step.tone),
    chordArpOctave: arpPattern.map((step) => step.octave),
    chordStrumDirection: Math.max(0, strumDirection),
    chordStrumSpreadSeconds: chordSequencer.strum.spreadMs / 1000,
    chordStrumCurve: chordSequencer.strum.curve,
    chordStrumGate: chordSequencer.strum.gate,
    chordStrumVelocityFalloff: chordSequencer.strum.velocityFalloff,
    leadInitialDelaySeconds,
  };
}
