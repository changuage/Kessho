import type { DrumVoiceType } from '../../../audio/drumSynth';
import { getPresetNames as getDrumPresetNames } from '../../../audio/drumPresets';
import type { SliderState } from '../../state';
import { getDrumVoiceRoute } from '../drumVoiceParamRouting';

export function scatterMorphEndpointPatchForVoice(
  voice: DrumVoiceType,
  state: SliderState | undefined,
): Partial<SliderState> {
  if (!state) return {};

  const route = getDrumVoiceRoute(voice);
  const presetA = String(state[route.presetAKey] ?? '');
  const presetB = String(state[route.presetBKey] ?? '');
  if (presetA && presetB && presetA !== presetB) return {};

  const currentPreset = presetA || presetB;
  const fallbackPreset = getDrumPresetNames(voice).find((name) => name !== currentPreset);
  if (!fallbackPreset) return {};

  return {
    [route.presetBKey]: fallbackPreset,
  } as Partial<SliderState>;
}
