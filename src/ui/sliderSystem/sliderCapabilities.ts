import {
  PARAM_MODULATION_CAPABILITIES,
  SINGLE_ONLY_PARAM_KEYS,
  WALK_ONLY_PARAM_KEYS,
  type ParamModulationCapability,
} from '../../presets/ParamRegistry';
import { type SliderMode, type SliderState } from '../state';

/**
 * The mode surface exposed by a shared Slider.  Keep this table static: it is
 * read from pointer handlers and React render paths, so lookups must stay O(1)
 * and must not enumerate the state object.
 */
export type SliderCapability = ParamModulationCapability;

const DYNAMIC_SINGLE_KEYS = new Set<string>([
  'sample1MaxVoices', 'sample2MaxVoices',
  'granularV1Slice', 'granularV2Slice', 'granularV3Slice', 'granularV4Slice',
  'padTensionValue', 'leadTensionValue', 'synthEuclidTensionValue',
  'granularTensionValue', 'reverbTensionValue', 'drumTensionValue',
  'sidechainSample1Target', 'sidechainSample2Target', 'driftWetHp',
]);

const DYNAMIC_DUAL_KEYS = new Set<string>([
  'driftDepth', 'driftRate', 'driftStereo',
  'degradeHp', 'degradeLp',
  'erosionAge', 'erosionWow', 'erosionFlutter',
  'masterSaturationDrive',
  'endCompThreshold', 'endCompRatio', 'endCompKnee', 'endCompMix',
]);

const WALK_ONLY_KEY_SET = new Set<string>(WALK_ONLY_PARAM_KEYS);

/**
 * O(1) capability lookup. Dynamic Slider families are intentionally matched
 * only after the static map, keeping normal literal paths to one Map lookup.
 * Unknown parameters stay scalar until the generated inventory gives them an
 * explicit entry or a bounded family rule.
 */
export function getSliderCapability(key: string): SliderCapability | undefined {
  const explicit = PARAM_MODULATION_CAPABILITIES[key];
  if (explicit) return explicit;
  if (DYNAMIC_SINGLE_KEYS.has(key)) return 'single';
  if (DYNAMIC_DUAL_KEYS.has(key)) return 'dual';
  if (WALK_ONLY_KEY_SET.has(key)) return 'walk-only';
  if (/^dynamicsSample[12]Bus$/.test(key)) return 'single';
  if (/^drum(?:Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)MorphSpeed$/.test(key)) return 'single';
  // Euclidean lane policy/range fields use the sequencer-content architecture,
  // not generic Product parameter automation.
  if (/^drumEuclid/.test(key)) return 'single';
  if (/^lead[12](?:Attack|Decay|Sustain|Hold|Release)$/.test(key)) return 'dual';
  // Earth/water/nature/insect pages use generated key arrays rather than
  // literal sliderProps calls. Their non-walk controls are Product ranges.
  if (/^(?:earth|ocean|birds2?|frogs|nature(?:[1-4])?|water|insects)/.test(key)) return 'dual';
  if (/^sample[12](?:AttackMs|DecayMs|Sustain|HoldMs|ReleaseMs|Level|Distance|PostLPF|StereoWidth|DiffuseSend|ReverbSend|DelayASend|DelayBSend)$/.test(key)) return 'dual';
  if (/^granularV[1-4](?:Speed|ScanRate|Pitch|Attack|Decay|Blur|GrainOct|Spray|PositionSpray|TimingSpray|Lookback|WriteGuard|PitchSpread|PitchJitter|PitchQuantize|ReverseChance|Bloom|Glide|LoopCrossfade|Density|GrainSize|Pan|Gain|PosLFORate|PosLFODepth|PanLFORate|StereoSpread|ReverseLFORate|WriteFollow|RecordLFORate)$/.test(key)) return 'dual';
  // Drum voice and modular Dynamics schemas are continuous Product keys.
  if (/^(?:drum|dynamics|sidechain|drift|erosion|endComp|masterSaturation)[A-Za-z0-9]+$/.test(key)) return 'dual';
  // Unknown keys fail the generated audit and are rendered as scalar controls
  // by callers until they receive an explicit registry entry.
  return undefined;
}

export function isSliderModeAllowed(key: string, mode: SliderMode): boolean {
  const capability = getSliderCapability(key);
  if (capability === 'single') return mode === 'single';
  if (capability === 'walk-only') return mode === 'single' || mode === 'walk' || mode === 'shape';
  if (capability === 'dual') return true;
  return mode === 'single';
}

export function normalizeSliderMode(key: string, mode?: SliderMode): SliderMode | undefined {
  if (!mode || mode === 'single') return mode;
  const capability = getSliderCapability(key);
  if (!capability) return undefined;
  if (capability === 'single') return undefined;
  if (capability === 'walk-only' && mode === 'sampleHold') return 'walk';
  return mode;
}

export function isSliderRangeCapable(key: keyof SliderState | string): boolean {
  const capability = getSliderCapability(String(key));
  return capability === 'dual' || capability === 'walk-only';
}

export const SINGLE_ONLY_SLIDER_KEYS: ReadonlySet<string> = new Set(SINGLE_ONLY_PARAM_KEYS);
export const WALK_ONLY_DUAL_KEYS: ReadonlySet<string> = new Set(WALK_ONLY_PARAM_KEYS);
export const SLIDER_CAPABILITIES: Readonly<Record<string, SliderCapability>> = PARAM_MODULATION_CAPABILITIES;
