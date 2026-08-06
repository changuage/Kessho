/**
 * Centralized preset loading utility.
 *
 * Replaces the 10+ copy-paste preset-load sequences in App.tsx with a single
 * canonical function that handles current-schema validation, user-preference
 * preservation, safe-audition policy, and engine update.
 */

import { SliderState, DEFAULT_STATE, SavedPreset } from './state';
import { getAllMorphedDrumParams } from '../audio/drumMorph';
import { normalizeDegradeReverbCrossfeed } from './routing';
import { PARAM_REGISTRY } from '../presets/ParamRegistry';
import { completeSpectralFreezePresetState } from '../presets/spectralFreezePresetState';

// User preference keys — audio processing settings that should NOT change
// when loading presets or morphing between them.
export const USER_PREFERENCE_KEYS: (keyof SliderState)[] = [
  'reverbQuality',
];

export type PresetLoadMode =
  | 'safe-audition'
  | 'exact-as-saved'
  | 'session-restore';

export interface ApplyPresetOptions {
  /** Current state, used to read USER_PREFERENCE_KEYS values. If omitted, preferences are not preserved. */
  currentState?: SliderState;
  /** Whether to call onUpdateEngine() after applying. Default: true. */
  updateEngine?: boolean;
  /** Whether to call onResetCofDrift() after applying. Default: true. */
  resetCofDrift?: boolean;
  onUpdateEngine?: (state: SliderState, metadata: { presetId: string; presetName: string }) => void;
  onResetCofDrift?: () => void;
  /** Whether to restore saved live sequencer transport flags. Default: false. */
  preserveSequencerTransport?: boolean;
  /** Whether to preserve silent engine enabled flags. Default follows loadMode. */
  preserveSilentEngines?: boolean;
  /** Controls whether preset load is safe-audition, exact, or session restore. */
  loadMode?: PresetLoadMode;
  /** The normalizePresetForWeb function (defined in App.tsx, passed in to avoid circular deps). */
  normalize: (state: SliderState) => SliderState;
}

export interface ApplyPresetResult {
  /** The final merged SliderState, ready for setState(). */
  state: SliderState;
  /** The current preset (with dualRanges and sliderModes) for applyDualRangesFromPreset(). */
  preset: SavedPreset;
  /** True when safe-audition intentionally changed loaded behavior. */
  safeAuditionChanged?: boolean;
  /** True when load mode intentionally stopped sequencer transport. */
  transportDisabledByLoadMode?: boolean;
}

export function resolvePresetLoadMode(options: ApplyPresetOptions | undefined): PresetLoadMode {
  if (options?.loadMode) return options.loadMode;
  if (options?.preserveSequencerTransport || options?.preserveSilentEngines) return 'exact-as-saved';
  return 'safe-audition';
}

function shouldPreserveSequencerTransport(mode: PresetLoadMode): boolean {
  return mode === 'exact-as-saved' || mode === 'session-restore';
}

function shouldPreserveSilentEngines(mode: PresetLoadMode): boolean {
  return mode === 'exact-as-saved' || mode === 'session-restore';
}

/**
 * Canonical current-preset loading: validate → preserve user preferences →
 * apply safe-audition policy → update engine.
 *
 * Returns the final state and canonical preset so the caller can:
 *   setState(result.state)
 *   applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes)
 */
export function applyPreset(
  raw: SavedPreset | Record<string, unknown>,
  options: ApplyPresetOptions,
): ApplyPresetResult {
  const {
    currentState,
    updateEngine = true,
    resetCofDrift = true,
    onUpdateEngine,
    onResetCofDrift,
    preserveSequencerTransport,
    preserveSilentEngines,
    loadMode,
    normalize,
  } = options;
  const resolvedLoadMode = loadMode ?? resolvePresetLoadMode(options);
  const preserveTransport = preserveSequencerTransport ?? shouldPreserveSequencerTransport(resolvedLoadMode);
  const preserveEngines = preserveSilentEngines ?? shouldPreserveSilentEngines(resolvedLoadMode);
  let safeAuditionChanged = false;
  let transportDisabledByLoadMode = false;

  const currentPreset: SavedPreset = raw as SavedPreset;

  // 1. Normalize only current canonical values; missing fields are incompatible.
  const normalizedState = normalize(completeSpectralFreezePresetState(currentPreset.state));
  const missingKeys = (Object.keys(PARAM_REGISTRY) as (keyof SliderState)[])
    .filter((key) => (
      key in DEFAULT_STATE
      && DEFAULT_STATE[key] !== undefined
      && !Object.prototype.hasOwnProperty.call(normalizedState, key)
    ));
  if (missingKeys.length > 0) {
    throw new Error(`Current preset state is missing canonical fields: ${missingKeys.slice(0, 8).join(', ')}`);
  }
  const newState: SliderState = { ...normalizedState };

  // 2. Preserve user preference keys from current state
  if (currentState) {
    for (const key of USER_PREFERENCE_KEYS) {
      (newState as unknown as Record<string, unknown>)[key] = currentState[key];
    }
  }

  Object.assign(newState, getAllMorphedDrumParams(newState));

  if (!preserveTransport) {
    newState.drumEuclidMasterEnabled = false;
    newState.synthEuclideanMasterEnabled = false;
    transportDisabledByLoadMode = true;
  }

  Object.assign(newState, normalizeDegradeReverbCrossfeed(newState));

  // 3. Auto-disable engines if both dry level and reverb send are 0 in audition mode.
  if (!preserveEngines && (
    newState.granularLevel === 0 &&
    newState.granularReverbSend === 0 &&
    (newState.granularDelayASend ?? 0) === 0 &&
    (newState.granularDelayBSend ?? 0) === 0 &&
    (newState.delayAGranularSend ?? 0) === 0 &&
    (newState.delayBGranularSend ?? 0) === 0 &&
    (newState.granularPad1Send ?? 0) === 0 &&
    (newState.granularPad2Send ?? 0) === 0 &&
    (newState.granularLead1Send ?? 0) === 0 &&
    (newState.granularLead2Send ?? 0) === 0 &&
    (newState.granularDrumSend ?? 0) === 0 &&
    (newState.granularWavesSend ?? 0) === 0 &&
    (newState.granularWaterSend ?? 0) === 0 &&
    (newState.granularInsectsSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.granularEnabled === true;
    newState.granularEnabled = false;
  }
  if (!preserveEngines && (
    newState.leadLevel === 0 &&
    newState.leadReverbSend === 0 &&
    (newState.lead1DelayASend ?? 0) === 0 &&
    (newState.lead1DelayBSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.leadEnabled === true;
    newState.leadEnabled = false;
  }
  if (!preserveEngines && (
    newState.drumLevel === 0 &&
    newState.drumReverbSend === 0 &&
    (newState.drumDelayASend ?? 0) === 0 &&
    (newState.drumDelayBSend ?? 0) === 0 &&
    (newState.granularDrumSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.drumEnabled === true;
    newState.drumEnabled = false;
  }
  if (!preserveEngines && (
    newState.oceanSampleLevel === 0 &&
    newState.oceanReverbSend === 0 &&
    (newState.oceanDelayASend ?? 0) === 0 &&
    (newState.oceanDelayBSend ?? 0) === 0 &&
    (newState.granularWavesSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.oceanSampleEnabled === true;
    newState.oceanSampleEnabled = false;
  }
  if (!preserveEngines && (
    newState.birdsLevel === 0 &&
    (newState.natureReverbSend ?? 0) === 0 &&
    (newState.natureDelayASend ?? 0) === 0 &&
    (newState.natureDelayBSend ?? 0) === 0 &&
    (newState.granularNatureSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.birdsEnabled === true;
    newState.birdsEnabled = false;
  }
  if (!preserveEngines && (
    newState.birds2Level === 0 &&
    (newState.natureReverbSend ?? 0) === 0 &&
    (newState.natureDelayASend ?? 0) === 0 &&
    (newState.natureDelayBSend ?? 0) === 0 &&
    (newState.granularNatureSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.birds2Enabled === true;
    newState.birds2Enabled = false;
  }
  if (!preserveEngines && (
    newState.frogsLevel === 0 &&
    (newState.natureReverbSend ?? 0) === 0 &&
    (newState.natureDelayASend ?? 0) === 0 &&
    (newState.natureDelayBSend ?? 0) === 0 &&
    (newState.granularNatureSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.frogsEnabled === true;
    newState.frogsEnabled = false;
  }
  if (!preserveEngines && (
    newState.synthLevel === 0 &&
    newState.pad1ReverbSend === 0 &&
    (newState.pad1DelayASend ?? 0) === 0 &&
    (newState.pad1DelayBSend ?? 0) === 0 &&
    (newState.granularPad1Send ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.padEnabled === true;
    newState.padEnabled = false;
  }
  if (!preserveEngines && (
    newState.pad2Level === 0 &&
    newState.pad2ReverbSend === 0 &&
    (newState.pad2DelayASend ?? 0) === 0 &&
    (newState.pad2DelayBSend ?? 0) === 0 &&
    (newState.granularPad2Send ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.pad2Enabled === true;
    newState.pad2Enabled = false;
  }
  if (!preserveEngines && (
    newState.waterLevel === 0 &&
    newState.waterReverbSend === 0 &&
    (newState.waterDelayASend ?? 0) === 0 &&
    (newState.waterDelayBSend ?? 0) === 0 &&
    (newState.granularWaterSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.waterEnabled === true;
    newState.waterEnabled = false;
  }
  if (!preserveEngines && (
    newState.insectsLevel === 0 &&
    newState.insectsReverbSend === 0 &&
    (newState.insDelayASend ?? 0) === 0 &&
    (newState.insDelayBSend ?? 0) === 0 &&
    (newState.granularInsectsSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.insectsEnabled === true;
    newState.insectsEnabled = false;
  }
  if (!preserveEngines && (
    newState.insects2Level === 0 &&
    newState.insectsReverbSend === 0 &&
    (newState.insDelayASend ?? 0) === 0 &&
    (newState.insDelayBSend ?? 0) === 0 &&
    (newState.granularInsectsSend ?? 0) === 0
  )) {
    safeAuditionChanged = safeAuditionChanged || newState.insects2Enabled === true;
    newState.insects2Enabled = false;
  }

  // 6. Update audio engine
  if (updateEngine) {
    onUpdateEngine?.(newState, {
      presetId: currentPreset.name,
      presetName: currentPreset.name,
    });
  }
  if (resetCofDrift) {
    onResetCofDrift?.();
  }

  return {
    state: newState,
    preset: { ...currentPreset, state: newState },
    safeAuditionChanged,
    transportDisabledByLoadMode,
  };
}
