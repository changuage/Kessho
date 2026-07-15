import type { SequencerResumeQuantization, SliderState } from '../ui/state';

export type { SequencerResumeQuantization } from '../ui/state';
export type SequencerResumeKind = 'synth' | 'drum';

export const DEFAULT_SEQUENCER_RESUME_QUANTIZATION: SequencerResumeQuantization = 'nextBeat';

export const CORE_PRODUCT_SEQUENCER_AUDIBILITY_FLAGS = Object.freeze({
  applyNextBeat: 1 << 1,
  applyNextBar: 1 << 2,
} as const);

const CYCLE: readonly SequencerResumeQuantization[] = ['nextBeat', 'nextBar', 'immediate'];

export function normalizeSequencerResumeQuantization(value: unknown): SequencerResumeQuantization {
  return value === 'immediate' || value === 'nextBar' || value === 'nextBeat'
    ? value
    : DEFAULT_SEQUENCER_RESUME_QUANTIZATION;
}

export function nextSequencerResumeQuantization(value: unknown): SequencerResumeQuantization {
  const normalized = normalizeSequencerResumeQuantization(value);
  return CYCLE[(CYCLE.indexOf(normalized) + 1) % CYCLE.length] ?? DEFAULT_SEQUENCER_RESUME_QUANTIZATION;
}

export function sequencerResumeQuantizationLabel(value: unknown): string {
  const normalized = normalizeSequencerResumeQuantization(value);
  if (normalized === 'immediate') return 'Immediate';
  return normalized === 'nextBar' ? 'Next Bar' : 'Next Beat';
}

export function sequencerResumeQuantizationKey(
  kind: SequencerResumeKind,
  laneNumber: number,
): keyof SliderState {
  const safeLane = Math.max(1, Math.trunc(laneNumber));
  return `${kind === 'synth' ? 'synth' : 'drum'}Euclid${safeLane}ResumeQuantization` as keyof SliderState;
}

export function sequencerResumeQuantizationForLane(
  state: object | undefined,
  kind: SequencerResumeKind,
  laneNumber: number,
): SequencerResumeQuantization {
  const key = sequencerResumeQuantizationKey(kind, laneNumber);
  return normalizeSequencerResumeQuantization((state as Record<string, unknown> | undefined)?.[key]);
}

export function coreProductSequencerAudibilityFlags(value: unknown): number {
  const normalized = normalizeSequencerResumeQuantization(value);
  if (normalized === 'nextBeat') return CORE_PRODUCT_SEQUENCER_AUDIBILITY_FLAGS.applyNextBeat;
  if (normalized === 'nextBar') return CORE_PRODUCT_SEQUENCER_AUDIBILITY_FLAGS.applyNextBar;
  return 0;
}
