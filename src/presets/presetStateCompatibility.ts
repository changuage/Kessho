import { deriveMissingWaterLayerEnabledFlags } from '../audio/waterLayerActivation';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import {
  DEFAULT_MODULATION_SOURCE_B,
  normalizeModulationSourceConfig,
} from '../ui/sliderSystem/dualConfigReducer';
import { PARAM_REGISTRY } from './ParamRegistry';
import { normalizeFxRoutingGraphState } from '../ui/routing/fxRoutingGraph';

const CANONICAL_PRESET_STATE_KEYS = Object.keys(PARAM_REGISTRY) as (keyof SliderState)[];

const SHARED_LEAD_ADDITIVE_KEYS = [
  ['leadVibratoDepth', 'lead1VibratoDepth', 'lead2VibratoDepth'],
  ['leadVibratoRate', 'lead1VibratoRate', 'lead2VibratoRate'],
  ['leadGlide', 'lead1Glide', 'lead2Glide'],
] as const satisfies readonly [keyof SliderState, keyof SliderState, keyof SliderState][];

/** Edge-trigger serial is runtime-only; L4 owns whether capture is armed. */
const TRANSIENT_PRESET_STATE_KEYS = [
  'spectralFreezeCaptureSerial',
] as const satisfies readonly (keyof SliderState)[];

/** Complete missing current-contract fields while preserving authored values for validation. */
export function completeCanonicalPresetState(
  state: Partial<SliderState> | Record<string, unknown>,
): SliderState {
  const completed = { ...state } as Record<string, unknown>;
  completed.modulationSourceA = normalizeModulationSourceConfig(
    completed.modulationSourceA as never,
    {
      type: 'walk',
      walk: {
        relationship: 'free',
        speed: typeof completed.randomWalkSpeed === 'number'
          ? completed.randomWalkSpeed
          : DEFAULT_STATE.randomWalkSpeed,
      },
    },
  );
  completed.modulationSourceB = normalizeModulationSourceConfig(
    completed.modulationSourceB as never,
    DEFAULT_MODULATION_SOURCE_B,
  );
  deriveMissingWaterLayerEnabledFlags(completed);
  completed.fxRoutingGraph = normalizeFxRoutingGraphState(completed.fxRoutingGraph, completed);
  for (const [sharedKey, lead1Key, lead2Key] of SHARED_LEAD_ADDITIVE_KEYS) {
    const sharedValue = completed[sharedKey];
    if (typeof sharedValue !== 'number' || !Number.isFinite(sharedValue)) continue;
    if (!Object.prototype.hasOwnProperty.call(completed, lead1Key)) completed[lead1Key] = sharedValue;
    if (!Object.prototype.hasOwnProperty.call(completed, lead2Key)) completed[lead2Key] = sharedValue;
  }
  for (const key of CANONICAL_PRESET_STATE_KEYS) {
    if (DEFAULT_STATE[key] !== undefined && !Object.prototype.hasOwnProperty.call(completed, key)) {
      completed[key] = DEFAULT_STATE[key];
    }
  }
  for (const key of TRANSIENT_PRESET_STATE_KEYS) completed[key] = DEFAULT_STATE[key];
  return completed as unknown as SliderState;
}
