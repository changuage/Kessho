import { applyMorphToState, VOICE_MORPH_KEYS } from '../../audio/drumMorph';
import { clampMorphPosition } from '../../audio/morphUtils';
import { getPreset } from '../../audio/drumPresets';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { DRUM_VOICE_PARAM_KEYS } from '../../audio/drumVoiceConfig';
import type { SliderMode, SliderState } from '../state';

export function applyDrumPresetSlotChange(
  state: SliderState,
  voice: DrumVoiceType,
  slot: 'A' | 'B',
  presetName: string,
): SliderState {
  const morphKeys = VOICE_MORPH_KEYS[voice];
  const slotKey = slot === 'A' ? morphKeys.presetA : morphKeys.presetB;
  const next = {
    ...state,
    [slotKey]: presetName,
  } as SliderState;
  return {
    ...next,
    ...applyMorphToState(next, voice),
  } as SliderState;
}

export function resolveDrumPresetDualState(
  voice: DrumVoiceType,
  presetAName: string,
  presetBName: string,
  morph: number,
): {
  relevantKeys: string[];
  dualRanges: Record<string, { min: number; max: number }>;
  sliderModes: Record<string, SliderMode>;
} {
  const relevantKeys = DRUM_VOICE_PARAM_KEYS[voice];
  const dualRanges: Record<string, { min: number; max: number }> = {};
  const sliderModes: Record<string, SliderMode> = {};
  const presetA = getPreset(voice, presetAName);
  const presetB = getPreset(voice, presetBName);
  if (!presetA || !presetB) return { relevantKeys, dualRanges, sliderModes };

  const position = clampMorphPosition(morph);
  const dualKeys = new Set([
    ...Object.keys(presetA.dualRanges ?? {}),
    ...Object.keys(presetB.dualRanges ?? {}),
  ]);

  for (const key of dualKeys) {
    const rangeA = presetA.dualRanges?.[key];
    const rangeB = presetB.dualRanges?.[key];
    const valueA = presetA.params[key];
    const valueB = presetB.params[key];
    if ((!rangeA && typeof valueA !== 'number') || (!rangeB && typeof valueB !== 'number')) continue;

    const minA = rangeA?.min ?? valueA as number;
    const maxA = rangeA?.max ?? valueA as number;
    const minB = rangeB?.min ?? valueB as number;
    const maxB = rangeB?.max ?? valueB as number;
    const min = minA + (minB - minA) * position;
    const max = maxA + (maxB - maxA) * position;
    if (Math.abs(max - min) <= 0.001) continue;

    const modeA = presetA.sliderModes?.[key] ?? (rangeA ? 'walk' : undefined);
    const modeB = presetB.sliderModes?.[key] ?? (rangeB ? 'walk' : undefined);
    dualRanges[key] = { min, max };
    sliderModes[key] = position < 0.5
      ? modeA ?? modeB ?? 'walk'
      : modeB ?? modeA ?? 'walk';
  }

  return { relevantKeys, dualRanges, sliderModes };
}

export function resolveDrumPresetDualStateFromState(
  state: SliderState,
  voice: DrumVoiceType,
) {
  const keys = VOICE_MORPH_KEYS[voice];
  return resolveDrumPresetDualState(
    voice,
    String(state[keys.presetA] ?? ''),
    String(state[keys.presetB] ?? ''),
    Number(state[keys.morph] ?? 0),
  );
}
