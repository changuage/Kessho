import type { SliderState } from '../ui/state';
import { getPhraseDurationForClockSource } from './transport';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { clamp, numberFromState } from './coreProductSnapshotState';
import type { CoreProductSnapshot } from './coreProductSnapshotTypes';
import {
  leadRandomSource,
  leadRandomSourceEnabled,
  leadRandomSourceId,
  simpleSequencerSourceId,
  synthChordGeneratorSource,
  synthChordGeneratorSourceEnabled,
} from './coreProductArrangementSchedulerUtils';
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
  const chordGeneratorSource = synthChordGeneratorSource(arrangementState);
  const randomSource = leadRandomSource(arrangementState);
  const leadTensionMode = arrangementState.leadTensionMode === 'locked' || arrangementState.leadTensionMode === 'bypass'
    ? arrangementState.leadTensionMode
    : 'follow';
  const leadTension = getEffectiveTension(
    clamp(numberFromState(arrangementState, 'tension', 0.3), 0, 1),
    leadTensionMode,
    clamp(numberFromState(arrangementState, 'leadTensionValue', 0), -0.5, 0.5),
  );
  const leadPhraseSeconds = getPhraseDurationForClockSource(
    sliderState,
    sliderState.leadRandomClockSource ?? 'globalPhrase',
  );
  // Playback start is the shared phrase-zero boundary for both Simple-mode
  // generators. Live "next phrase" enables are aligned by the native event
  // handler instead of carrying wall-clock phase across a stop/resume.
  const leadInitialDelaySeconds = 0;

  return {
    // Harmony owns the pitches; Arrangement owns only rendering/routing.
    chordGeneratorEnabled: synthChordGeneratorSourceEnabled(arrangementState),
    chordGeneratorSourceId: simpleSequencerSourceId(
      chordGeneratorSource === 'both' ? 'pad1' : chordGeneratorSource,
    ),
    chordGeneratorVoiceCount: clamp(
      Math.round(numberFromState(arrangementState, 'synthChordGeneratorVoiceCount', 6)),
      1,
      8,
    ),
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
    chordGeneratorPadSplit: chordGeneratorSource === 'both',
    sourceHoldSeconds: Array.from(
      { length: 8 },
      (_, index) => coreProductSynthSequencerHoldSecondsFromState(arrangementState, index + 1, 0.5),
    ),
    pad1FitEnvelopeToChord: arrangementState.padFitEnvelopeToChord !== false,
    pad2FitEnvelopeToChord: arrangementState.pad2FitEnvelopeToChord !== false,
    leadInitialDelaySeconds,
  };
}
