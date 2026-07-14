import { normalizeSynthEuclidSource } from '../../audio/coreProductSourceMapping';
import { MANUAL_SYNTH_SOURCE_ENABLED_KEYS } from '../../audio/product/manualSynthSources';
import type { ManualSynthSource } from '../../audio/engineSharedTypes';
import type { SliderState } from '../state';

export { MANUAL_SYNTH_SOURCE_ENABLED_KEYS } from '../../audio/product/manualSynthSources';

export const SYNTH_LANE_ENABLED_KEYS = [
  'synthEuclid1Enabled',
  'synthEuclid2Enabled',
  'synthEuclid3Enabled',
  'synthEuclid4Enabled',
] as const satisfies readonly (keyof SliderState)[];

export const SYNTH_LANE_SOURCE_KEYS = [
  'synthEuclid1Source',
  'synthEuclid2Source',
  'synthEuclid3Source',
  'synthEuclid4Source',
] as const satisfies readonly (keyof SliderState)[];

export const DRUM_LANE_ENABLED_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
  'drumEuclid5Enabled',
  'drumEuclid6Enabled',
] as const satisfies readonly (keyof SliderState)[];

export type SequencerManualSynthSource = Exclude<ManualSynthSource, 'piano'>;

export type SequencerTransportPlan = {
  readonly starting: boolean;
  readonly patch: Partial<SliderState>;
};

export type SequencerTransportStateChange = <K extends keyof SliderState>(
  key: K,
  value: SliderState[K],
) => void;

export function applySequencerTransportPlan(
  plan: SequencerTransportPlan,
  onStateChange: SequencerTransportStateChange,
  onPlaybackStart?: (patch: Partial<SliderState>) => void,
): void {
  for (const [key, value] of Object.entries(plan.patch) as Array<[keyof SliderState, SliderState[keyof SliderState]]>) {
    onStateChange(key, value);
  }
  if (plan.starting) onPlaybackStart?.(plan.patch);
}

function safeLaneIndex(index: number, laneCount: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(laneCount - 1, Math.floor(index)));
}

export function manualSynthSourceForLaneSource(
  source: unknown,
  pad2VoiceAssign: unknown,
): SequencerManualSynthSource {
  const normalized = normalizeSynthEuclidSource(source);
  if (normalized === 'lead2') return 'lead2';
  if (normalized === 'sample1') return 'sample1';
  if (normalized === 'sample2') return 'sample2';
  if (normalized === 'pad1') return 'pad1';
  if (normalized === 'pad2') return 'pad2';
  if (normalized.startsWith('synth')) {
    const voiceIndex = Number.parseInt(normalized.slice('synth'.length), 10) - 1;
    if (Number.isFinite(voiceIndex) && voiceIndex >= 0) {
      const pad2Mask = typeof pad2VoiceAssign === 'number' && Number.isFinite(pad2VoiceAssign)
        ? Math.round(pad2VoiceAssign)
        : 0;
      return (pad2Mask & (1 << voiceIndex)) !== 0 ? 'pad2' : 'pad1';
    }
    return 'pad1';
  }
  return 'lead1';
}

export function manualSynthSourcesForLaneSource(
  source: unknown,
  pad2VoiceAssign: unknown,
): readonly SequencerManualSynthSource[] {
  if (String(source ?? '').trim().toLowerCase() === 'both') return ['pad1', 'pad2'];
  return [manualSynthSourceForLaneSource(source, pad2VoiceAssign)];
}

function addSynthSourceEnablePatch(
  patch: Partial<SliderState>,
  state: SliderState,
  source: SequencerManualSynthSource,
): void {
  const enabledKey = MANUAL_SYNTH_SOURCE_ENABLED_KEYS[source];
  if (!Boolean(state[enabledKey])) patch[enabledKey] = true;
}

export function planSynthSequencerTransportToggle(
  state: SliderState,
  activeLaneIndex: number,
): SequencerTransportPlan {
  const starting = !state.synthEuclideanMasterEnabled;
  const patch: Partial<SliderState> = { synthEuclideanMasterEnabled: starting };
  if (!starting) return { starting, patch };

  const activeLane = safeLaneIndex(activeLaneIndex, SYNTH_LANE_ENABLED_KEYS.length);
  const anyLaneEnabled = SYNTH_LANE_ENABLED_KEYS.some((key) => Boolean(state[key]));
  const requestedLane = anyLaneEnabled ? null : activeLane;
  if (requestedLane !== null) {
    const requestedLaneKey = SYNTH_LANE_ENABLED_KEYS[requestedLane] ?? SYNTH_LANE_ENABLED_KEYS[0];
    patch[requestedLaneKey] = true;
  }

  for (let laneIndex = 0; laneIndex < SYNTH_LANE_ENABLED_KEYS.length; laneIndex += 1) {
    const laneEnabledKey = SYNTH_LANE_ENABLED_KEYS[laneIndex] ?? SYNTH_LANE_ENABLED_KEYS[0];
    const laneSourceKey = SYNTH_LANE_SOURCE_KEYS[laneIndex] ?? SYNTH_LANE_SOURCE_KEYS[0];
    if (!Boolean(state[laneEnabledKey]) && laneIndex !== requestedLane) continue;
    const sourceValue = state[laneSourceKey] ?? 'lead1';
    for (const source of manualSynthSourcesForLaneSource(sourceValue, state.pad2VoiceAssign)) {
      addSynthSourceEnablePatch(patch, state, source);
    }
  }

  return { starting, patch };
}

export function planDrumSequencerTransportToggle(
  state: SliderState,
  activeLaneIndex: number,
  laneEnableTouched: boolean,
): SequencerTransportPlan {
  const starting = !state.drumEuclidMasterEnabled;
  const patch: Partial<SliderState> = { drumEuclidMasterEnabled: starting };
  if (!starting) return { starting, patch };

  if (!state.drumEnabled) patch.drumEnabled = true;
  const anyLaneEnabled = DRUM_LANE_ENABLED_KEYS.some((key) => Boolean(state[key]));
  if (shouldAutoEnableDrumLaneOnTransportStart({ starting, anyLaneEnabled, laneEnableTouched })) {
    const activeLane = safeLaneIndex(activeLaneIndex, DRUM_LANE_ENABLED_KEYS.length);
    const activeLaneKey = DRUM_LANE_ENABLED_KEYS[activeLane] ?? DRUM_LANE_ENABLED_KEYS[0];
    patch[activeLaneKey] = true;
  }

  return { starting, patch };
}

export function shouldAutoEnableDrumLaneOnTransportStart(options: {
  readonly starting: boolean;
  readonly anyLaneEnabled: boolean;
  readonly laneEnableTouched: boolean;
}): boolean {
  return options.starting && !options.anyLaneEnabled && !options.laneEnableTouched;
}

export function drumLaneEnableTouchedAfterPresetRestore(options: {
  readonly anyLaneEnabled: boolean;
}): boolean {
  return !options.anyLaneEnabled;
}
