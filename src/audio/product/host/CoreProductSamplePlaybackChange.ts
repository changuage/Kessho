import { SYNTH_EUCLIDEAN_LANE_COUNT } from '../../sequencerLaneCounts';

const SAMPLE_SLOT_TRIGGER_CRITICAL_SUFFIXES = [
  'Enabled',
  'LibraryKey',
  'Role',
  'Articulation',
  'SelectionMode',
  'DynamicMode',
  'FixedDynamic',
  'VariantMode',
  'LoopEnabled',
  'MaxVoices',
] as const;

const SIMPLE_SEQUENCER_SOURCE_KEYS = [
  'synthChordGeneratorSource',
  'leadRandomSource',
] as const;

function stateValueChanged(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
  key: string,
): boolean {
  return previous?.[key] !== next?.[key];
}

function sampleSlotTriggerCriticalStateChanged(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): boolean {
  for (const slotId of ['sample1', 'sample2'] as const) {
    for (const suffix of SAMPLE_SLOT_TRIGGER_CRITICAL_SUFFIXES) {
      if (stateValueChanged(previous, next, `${slotId}${suffix}`)) return true;
    }
  }
  return false;
}

function synthSequencerTargetStateChanged(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): boolean {
  for (const key of SIMPLE_SEQUENCER_SOURCE_KEYS) {
    if (stateValueChanged(previous, next, key)) return true;
  }
  for (let lane = 1; lane <= SYNTH_EUCLIDEAN_LANE_COUNT; lane += 1) {
    if (stateValueChanged(previous, next, `synthEuclid${lane}Source`)) return true;
  }
  return previous?.synthSequencerFaces !== next?.synthSequencerFaces;
}

export function productSamplePlaybackTriggerCriticalChange(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): boolean {
  if (!previous || !next) return false;
  return sampleSlotTriggerCriticalStateChanged(previous, next) ||
    synthSequencerTargetStateChanged(previous, next);
}
