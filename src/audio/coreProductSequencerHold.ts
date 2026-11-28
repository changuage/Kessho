import type { SliderState } from '../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { leadEnvelopeGateSecondsFromState } from './CoreProductLeadPatch';

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type PadVoice = 'pad1' | 'pad2';

export function coreProductPadEnvelopeGateSecondsFromState(
  state: Record<string, unknown> | undefined,
  voice: PadVoice,
): number {
  const attackKey: keyof SliderState = voice === 'pad2' ? 'pad2Attack' : 'synthAttack';
  const decayKey: keyof SliderState = voice === 'pad2' ? 'pad2Decay' : 'synthDecay';
  const holdKey: keyof SliderState = voice === 'pad2' ? 'pad2Hold' : 'synthHold';
  const attack = clamp(numberFromState(state, attackKey, 6), 0.001, 16);
  const decay = clamp(numberFromState(state, decayKey, 1), 0.01, 8);
  const hold = clamp(numberFromState(state, holdKey, 1), 0, 20);
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
      return leadEnvelopeGateSecondsFromState(state, 0);
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return leadEnvelopeGateSecondsFromState(state, 1);
    case CORE_PRODUCT_SOURCE_IDS.sample1:
      return numberFromState(state, 'sample1HoldMs', 200) / 1000;
    case CORE_PRODUCT_SOURCE_IDS.sample2:
      return numberFromState(state, 'sample2HoldMs', 200) / 1000;
    default:
      return fallback;
  }
}
