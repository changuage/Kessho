import type { SliderState } from '../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { applyLeadDistanceEnvelope, getVoiceDistanceKey } from './distanceMacro';

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type PadVoice = 'pad1' | 'pad2';

type PadEnvelopeGateOptions = {
  triggerIntervalSeconds?: number;
  voiceDelaySeconds?: number;
};

const PAD_CHORD_ENVELOPE_SAFETY_SECONDS = 0.05;

function leadHoldSecondsFromState(
  state: Record<string, unknown> | undefined,
  voice: 'lead1' | 'lead2',
  fallback: number,
): number {
  const holdKey = voice === 'lead2' ? 'lead2Hold' : 'lead1Hold';
  const hold = numberFromState(state, holdKey, fallback);
  const distance = numberFromState(state, getVoiceDistanceKey(voice), 0);
  return applyLeadDistanceEnvelope(voice, {
    attack: 0.01,
    decay: 0.8,
    sustain: 0.3,
    hold,
    release: 2,
  }, distance).hold ?? hold;
}

export function coreProductPadEnvelopeGateSecondsFromState(
  state: Record<string, unknown> | undefined,
  voice: PadVoice,
  options: PadEnvelopeGateOptions = {},
): number {
  const attackKey: keyof SliderState = voice === 'pad2' ? 'pad2Attack' : 'synthAttack';
  const decayKey: keyof SliderState = voice === 'pad2' ? 'pad2Decay' : 'synthDecay';
  const holdKey: keyof SliderState = voice === 'pad2' ? 'pad2Hold' : 'synthHold';
  const releaseKey: keyof SliderState = voice === 'pad2' ? 'pad2Release' : 'synthRelease';
  const fitKey: keyof SliderState = voice === 'pad2' ? 'pad2FitEnvelopeToChord' : 'padFitEnvelopeToChord';
  const attack = clamp(numberFromState(state, attackKey, 6), 0.001, 16);
  const decay = clamp(numberFromState(state, decayKey, 1), 0.01, 8);
  const requestedHold = clamp(numberFromState(state, holdKey, 1), 0, 20);
  const release = clamp(numberFromState(state, releaseKey, 12), 0.01, 30);
  let hold = requestedHold;
  if (
    state?.[fitKey] !== false &&
    Number.isFinite(options.triggerIntervalSeconds) &&
    Number.isFinite(options.voiceDelaySeconds)
  ) {
    const availableSeconds =
      Math.max(0, options.triggerIntervalSeconds ?? 0) -
      Math.max(0, options.voiceDelaySeconds ?? 0) -
      PAD_CHORD_ENVELOPE_SAFETY_SECONDS;
    hold = clamp(requestedHold, 0, Math.max(0, availableSeconds - attack - decay - release));
  }
  return clamp(attack + decay + hold, 0.02, 20);
}

export function coreProductSynthSequencerHoldSecondsFromState(
  state: Record<string, unknown> | undefined,
  sourceId: number,
  fallback: number,
): number {
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      return coreProductPadEnvelopeGateSecondsFromState(state, 'pad1');
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      return coreProductPadEnvelopeGateSecondsFromState(state, 'pad2');
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      return leadHoldSecondsFromState(state, 'lead1', fallback);
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return leadHoldSecondsFromState(state, 'lead2', fallback);
    case CORE_PRODUCT_SOURCE_IDS.piano:
      return numberFromState(state, 'pianoHold', 0.2);
    default:
      return fallback;
  }
}
