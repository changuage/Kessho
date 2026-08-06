import { DEFAULT_STATE, type SliderState } from '../ui/state';

/** Authored Spectral Freeze values introduced after the first L4 state presets. */
export const SPECTRAL_FREEZE_AUTHORED_KEYS = [
  'spectralFreezeEnabled',
  'spectralFreezeMode',
  'spectralFreezeStretchSpeed',
  'spectralFreezeDirection',
  'spectralFreezePosition',
  'spectralFreezeRefresh',
  'spectralFreezeInputSensitivity',
  'spectralFreezeDiffusion',
  'spectralFreezeTone',
  'spectralFreezeWidth',
  'spectralFreezeSustain',
  'spectralFreezeMix',
  'spectralFreezeRouting',
  'spectralFreezeReverbCrossfade',
] as const satisfies readonly (keyof SliderState)[];

/** Runtime capture state must never be restored from a preset. */
export const SPECTRAL_FREEZE_TRANSIENT_KEYS = [
  'spectralFreezeActive',
  'spectralFreezeCaptureSerial',
] as const satisfies readonly (keyof SliderState)[];

/**
 * Complete the unused Spectral Freeze block on older state presets and reset
 * capture-only state. This deliberately does not repair any unrelated field.
 */
export function completeSpectralFreezePresetState(
  state: Partial<SliderState> | Record<string, unknown>,
): SliderState {
  const completed = { ...state } as Record<string, unknown>;
  for (const key of SPECTRAL_FREEZE_AUTHORED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(completed, key)) {
      completed[key] = DEFAULT_STATE[key];
    }
  }
  for (const key of SPECTRAL_FREEZE_TRANSIENT_KEYS) {
    completed[key] = DEFAULT_STATE[key];
  }
  return completed as unknown as SliderState;
}
