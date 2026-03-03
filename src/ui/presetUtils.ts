/**
 * Centralized preset loading utility.
 *
 * Replaces the 10+ copy-paste preset-load sequences in App.tsx with a single
 * canonical function that handles migration, normalization, default merge,
 * user-preference preservation, granular auto-disable, and engine update.
 */

import { SliderState, DEFAULT_STATE, migratePreset, SavedPreset } from './state';
import { audioEngine } from '../audio/engine';

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

  // 5. Auto-disable granular if level is 0
  if (newState.granularLevel === 0) {
    newState.granularEnabled = false;
  }

  // 6. Update audio engine
  if (updateEngine) {
    audioEngine.updateParams(newState);
  }
  if (resetCofDrift) {
    audioEngine.resetCofDrift();
  }

  return {
    state: newState,
    preset: { ...migrated, state: newState },
  };
}
