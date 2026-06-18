import { applyMorphToState } from '../../audio/drumMorph';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { SliderState } from '../state';

const DRUM_PRESET_SLOT_KEYS: Record<DrumVoiceType, { A: keyof SliderState; B: keyof SliderState }> = {
  sub: { A: 'drumSubPresetA', B: 'drumSubPresetB' },
  kick: { A: 'drumKickPresetA', B: 'drumKickPresetB' },
  click: { A: 'drumClickPresetA', B: 'drumClickPresetB' },
  beepHi: { A: 'drumBeepHiPresetA', B: 'drumBeepHiPresetB' },
  beepLo: { A: 'drumBeepLoPresetA', B: 'drumBeepLoPresetB' },
  noise: { A: 'drumNoisePresetA', B: 'drumNoisePresetB' },
  membrane: { A: 'drumMembranePresetA', B: 'drumMembranePresetB' },
};

export function applyDrumPresetSlotChange(
  state: SliderState,
  voice: DrumVoiceType,
  slot: 'A' | 'B',
  presetName: string,
): SliderState {
  const slotKey = DRUM_PRESET_SLOT_KEYS[voice][slot];
  const next = {
    ...state,
    [slotKey]: presetName,
  } as SliderState;
  return {
    ...next,
    ...applyMorphToState(next, voice),
  } as SliderState;
}
