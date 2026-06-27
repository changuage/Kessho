import { DrumVoiceType as DrumPresetVoice } from '../audio/drumPresets';
import type { SliderState } from '../ui/state';
import { DRUM_VOICE_PARAM_ROUTES } from '../ui/drums/drumVoiceParamRouting';

export const DRUM_PRESET_SLOT_CHANGE: Record<string, { voice: DrumPresetVoice; endpoint: 0 | 1 }> =
  Object.fromEntries(
    DRUM_VOICE_PARAM_ROUTES.flatMap((route) => [
      [route.presetAKey, { voice: route.voice, endpoint: 0 }] as const,
      [route.presetBKey, { voice: route.voice, endpoint: 1 }] as const,
    ]),
  ) as Record<string, { voice: DrumPresetVoice; endpoint: 0 | 1 }>;

const DRUM_EUCLID_LANE_ENABLED_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
  'drumEuclid5Enabled',
  'drumEuclid6Enabled',
] as const satisfies readonly (keyof SliderState)[];

export function isDrumSequencerActive(state: SliderState): boolean {
  return Boolean(state.drumEuclidMasterEnabled)
    && DRUM_EUCLID_LANE_ENABLED_KEYS.some((key) => Boolean(state[key]));
}

export function preserveRunningDrumSequencerSource(
  previous: SliderState,
  next: SliderState,
  options: { allowExplicitDrumDisable?: boolean } = {},
): SliderState {
  if (options.allowExplicitDrumDisable && previous.drumEnabled !== next.drumEnabled && next.drumEnabled === false) {
    return next;
  }
  if (!isDrumSequencerActive(previous) && !isDrumSequencerActive(next)) {
    return next;
  }
  if (next.drumEnabled === true) {
    return next;
  }
  return { ...next, drumEnabled: true };
}
