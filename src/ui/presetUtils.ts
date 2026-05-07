/**
 * Centralized preset loading utility.
 *
 * Replaces the 10+ copy-paste preset-load sequences in App.tsx with a single
 * canonical function that handles migration, normalization, default merge,
 * user-preference preservation, granular auto-disable, and engine update.
 */

import { SliderState, DEFAULT_STATE, migratePreset, SavedPreset } from './state';
import { audioEngine } from '../audio/runtime';

// User preference keys — audio processing settings that should NOT change
// when loading presets or morphing between them.
export const USER_PREFERENCE_KEYS: (keyof SliderState)[] = [
  'reverbQuality',
];

export interface ApplyPresetOptions {
  /** Current state, used to read USER_PREFERENCE_KEYS values. If omitted, preferences are not preserved. */
  currentState?: SliderState;
  /** Whether to call audioEngine.updateParams() after applying. Default: true. */
  updateEngine?: boolean;
  /** Whether to call audioEngine.resetCofDrift(). Default: true. */
  resetCofDrift?: boolean;
  /** Whether to run migratePreset() on the raw input. Default: true. */
  migrate?: boolean;
  /** The normalizePresetForWeb function (defined in App.tsx, passed in to avoid circular deps). */
  normalize: (state: SliderState) => SliderState;
}

export interface ApplyPresetResult {
  /** The final merged SliderState, ready for setState(). */
  state: SliderState;
  /** The migrated preset (with dualRanges and sliderModes) for applyDualRangesFromPreset(). */
  preset: SavedPreset;
}

/**
 * Canonical preset loading: migrate → normalize → merge defaults → preserve
 * user preferences → auto-disable zero-level features → update engine.
 *
 * Returns the final state and migrated preset so the caller can:
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
    migrate = true,
    normalize,
  } = options;

  // 1. Migrate (handles legacy field renames, dualRange inference, etc.)
  const migrated: SavedPreset = migrate ? migratePreset(raw) : (raw as SavedPreset);

  // 2. Normalize (iOS reverb types, legacy lead timbre/ADSR, defensive sanitization)
  const normalizedState = normalize(migrated.state);

  // 3. Merge with defaults (fills any missing fields)
  const newState: SliderState = { ...DEFAULT_STATE, ...normalizedState };

  // 4. Preserve user preference keys from current state
  if (currentState) {
    for (const key of USER_PREFERENCE_KEYS) {
      (newState as unknown as Record<string, unknown>)[key] = currentState[key];
    }
  }

  const presetState = migrated.state as Partial<SliderState>;

  // Legacy granular presets used a Clocked Space on/off flag instead of the shared Delay B send.
  if (presetState.granularDelayBSend === undefined && typeof presetState.granularDelayEnabled === 'boolean') {
    newState.granularDelayBSend = presetState.granularDelayEnabled ? 1 : 0;
  }

  const delayBHasFeed =
    (newState.granularDelayBSend ?? 0) > 0 ||
    (newState.pad1DelayBSend ?? 0) > 0 ||
    (newState.pad2DelayBSend ?? 0) > 0 ||
    (newState.lead1DelayBSend ?? 0) > 0 ||
    (newState.lead2DelayBSend ?? 0) > 0 ||
    (newState.pianoDelayBSend ?? 0) > 0 ||
    (newState.drumDelayBSend ?? 0) > 0 ||
    (newState.oceanDelayBSend ?? 0) > 0 ||
    (newState.natureDelayBSend ?? 0) > 0 ||
    (newState.waterDelayBSend ?? 0) > 0 ||
    (newState.insDelayBSend ?? 0) > 0 ||
    (newState.delayAToBSend ?? 0) > 0;
  const delayBHasOutput =
    (newState.granularDelayMix ?? 0) > 0 ||
    (newState.granularDelayReverbSend ?? 0) > 0 ||
    (newState.delayBToASend ?? 0) > 0 ||
    (newState.delayBGranularSend ?? 0) > 0;
  if (delayBHasFeed && delayBHasOutput) {
    newState.granularDelayEnabled = true;
  }

  // 5. Auto-disable engines if both dry level and reverb send are 0
  if (
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
  ) {
    newState.granularEnabled = false;
  }
  if (
    newState.leadLevel === 0 &&
    newState.leadReverbSend === 0 &&
    (newState.lead1DelayASend ?? 0) === 0 &&
    (newState.lead1DelayBSend ?? 0) === 0
  ) {
    newState.leadEnabled = false;
  }
  if (
    newState.drumLevel === 0 &&
    newState.drumReverbSend === 0 &&
    (newState.drumDelayASend ?? 0) === 0 &&
    (newState.drumDelayBSend ?? 0) === 0 &&
    (newState.granularDrumSend ?? 0) === 0
  ) {
    newState.drumEnabled = false;
  }
  if (
    newState.oceanSampleLevel === 0 &&
    newState.oceanReverbSend === 0 &&
    (newState.oceanDelayASend ?? 0) === 0 &&
    (newState.oceanDelayBSend ?? 0) === 0 &&
    (newState.granularWavesSend ?? 0) === 0
  ) {
    newState.oceanSampleEnabled = false;
  }
  if (
    newState.birdsLevel === 0 &&
    (newState.natureReverbSend ?? 0) === 0 &&
    (newState.natureDelayASend ?? 0) === 0 &&
    (newState.natureDelayBSend ?? 0) === 0 &&
    (newState.granularNatureSend ?? 0) === 0
  ) {
    newState.birdsEnabled = false;
  }
  if (
    newState.birds2Level === 0 &&
    (newState.natureReverbSend ?? 0) === 0 &&
    (newState.natureDelayASend ?? 0) === 0 &&
    (newState.natureDelayBSend ?? 0) === 0 &&
    (newState.granularNatureSend ?? 0) === 0
  ) {
    newState.birds2Enabled = false;
  }
  if (
    newState.frogsLevel === 0 &&
    (newState.natureReverbSend ?? 0) === 0 &&
    (newState.natureDelayASend ?? 0) === 0 &&
    (newState.natureDelayBSend ?? 0) === 0 &&
    (newState.granularNatureSend ?? 0) === 0
  ) {
    newState.frogsEnabled = false;
  }
  if (
    newState.synthLevel === 0 &&
    newState.pad1ReverbSend === 0 &&
    (newState.pad1DelayASend ?? 0) === 0 &&
    (newState.pad1DelayBSend ?? 0) === 0 &&
    (newState.granularPad1Send ?? 0) === 0
  ) {
    newState.padEnabled = false;
  }
  if (
    newState.pad2Level === 0 &&
    newState.pad2ReverbSend === 0 &&
    (newState.pad2DelayASend ?? 0) === 0 &&
    (newState.pad2DelayBSend ?? 0) === 0 &&
    (newState.granularPad2Send ?? 0) === 0
  ) {
    newState.pad2Enabled = false;
  }
  if (
    newState.waterLevel === 0 &&
    newState.waterReverbSend === 0 &&
    (newState.waterDelayASend ?? 0) === 0 &&
    (newState.waterDelayBSend ?? 0) === 0 &&
    (newState.granularWaterSend ?? 0) === 0
  ) {
    newState.waterEnabled = false;
  }
  if (
    newState.insectsLevel === 0 &&
    newState.insectsReverbSend === 0 &&
    (newState.insDelayASend ?? 0) === 0 &&
    (newState.insDelayBSend ?? 0) === 0 &&
    (newState.granularInsectsSend ?? 0) === 0
  ) {
    newState.insectsEnabled = false;
  }
  if (
    newState.insects2Level === 0 &&
    newState.insectsReverbSend === 0 &&
    (newState.insDelayASend ?? 0) === 0 &&
    (newState.insDelayBSend ?? 0) === 0 &&
    (newState.granularInsectsSend ?? 0) === 0
  ) {
    newState.insects2Enabled = false;
  }

  // 6. Update audio engine
  if (updateEngine) {
    audioEngine.updateParams(newState, {
      presetId: migrated.name,
      presetName: migrated.name,
    });
  }
  if (resetCofDrift) {
    audioEngine.resetCofDrift();
  }

  return {
    state: newState,
    preset: { ...migrated, state: newState },
  };
}
