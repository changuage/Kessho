import { DEFAULT_STATE, type SliderState } from '../state';
import {
  defineProductSliderControl,
  type ProductSliderControlDefinition,
} from '../controls/productControlSchema';

export interface DynamicsSliderControlDefinition extends ProductSliderControlDefinition {
  announceHelp?: boolean;
}

function defaultNumericValue(key: keyof SliderState): number {
  const value = DEFAULT_STATE[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function dynamicsSlider(
  key: keyof SliderState,
  label: string,
  options: Partial<Omit<DynamicsSliderControlDefinition, 'kind' | 'key' | 'label' | 'defaultValue'>> = {},
): DynamicsSliderControlDefinition {
  return {
    ...defineProductSliderControl({
      key,
      label,
      defaultValue: defaultNumericValue(key),
      helpPage: 'dynamics',
      ...options,
    }),
    announceHelp: options.announceHelp,
  };
}

export const DYNAMICS_CHARACTER_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('characterMix', 'Mix'),
  dynamicsSlider('characterAge', 'Age'),
  dynamicsSlider('characterBias', 'Bias'),
  dynamicsSlider('characterLpgAmount', 'LPG Open'),
  dynamicsSlider('characterDepth', 'Depth'),
  dynamicsSlider('characterRate', 'Rate'),
  dynamicsSlider('characterDamp', 'Damp'),
  dynamicsSlider('characterEnvFollow', 'Env Follow'),
  dynamicsSlider('degradeHp', 'HP'),
  dynamicsSlider('degradeLp', 'LP'),
  dynamicsSlider('characterStereo', 'Stereo'),
  dynamicsSlider('characterResonance', 'Resonance'),
];

export const DYNAMICS_CHARACTER_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('characterAntiComb', 'Comb Protect'),
  dynamicsSlider('characterDiffusion', 'Diffusion'),
];

export const DYNAMICS_DEGRADE_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('degradeMix', 'Mix'),
  dynamicsSlider('degradeAge', 'Wear'),
  dynamicsSlider('degradeGeneration', 'Generation'),
  dynamicsSlider('degradeAlias', 'Alias'),
  dynamicsSlider('degradeWow', 'Wow'),
  dynamicsSlider('degradeFlutter', 'Flutter'),
  dynamicsSlider('degradeDrift', 'Drift'),
  dynamicsSlider('degradeWobbleSpeed', 'Wobble Speed'),
  dynamicsSlider('degradeNoise', 'Noise'),
  dynamicsSlider('degradeHp', 'HP'),
  dynamicsSlider('degradeLp', 'LP'),
  dynamicsSlider('degradeTone', 'Tone'),
  dynamicsSlider('degradeSaturation', 'Clip'),
  dynamicsSlider('degradeCorrosion', 'Corrosion'),
];

export const DYNAMICS_DEGRADE_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('degradeEventAmount', 'Events'),
  dynamicsSlider('degradeProfileAmount', 'Profile'),
  dynamicsSlider('degradeDitherAmount', 'Dither'),
];

export const DYNAMICS_SATURATION_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsSaturationDrive', 'Drive'),
  dynamicsSlider('dynamicsSaturationTone', 'Tone'),
  dynamicsSlider('dynamicsSaturationBias', 'Bias'),
];

export const DYNAMICS_END_CHAIN_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('endCompThreshold', 'Threshold', { unit: ' dB' }),
  dynamicsSlider('endCompKnee', 'Knee', { unit: ' dB' }),
  dynamicsSlider('endCompRatio', 'Ratio'),
  dynamicsSlider('endCompAttackMs', 'Attack', { unit: ' ms' }),
  dynamicsSlider('endCompReleaseMs', 'Release', { unit: ' ms' }),
  dynamicsSlider('endCompMakeup', 'Makeup'),
  dynamicsSlider('endCompMix', 'Mix'),
  dynamicsSlider('endCompDetectorHp', 'Detector HP'),
  dynamicsSlider('endCompDetectorTilt', 'SC Tilt'),
  dynamicsSlider('endCompAutoMakeup', 'Auto Makeup'),
  dynamicsSlider('endCompProgramRelease', 'Program Rel'),
];

export const DYNAMICS_END_CHAIN_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('endCompPeakBlend', 'Peak/RMS'),
  dynamicsSlider('endCompClarity', 'Clarity'),
  dynamicsSlider('endCompTwoBandAmount', '2-Band'),
  dynamicsSlider('endCompBandSplit', 'Band Split'),
];

export const DYNAMICS_SIDECHAIN_MIX_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('sidechainKeyAWeight', 'Key A Weight', { announceHelp: true }),
  dynamicsSlider('sidechainKeyBWeight', 'Key B Weight', { announceHelp: true }),
  dynamicsSlider('sidechainAmount', 'Amount', { announceHelp: true }),
  dynamicsSlider('sidechainMix', 'Mix', { announceHelp: true }),
];

export const DYNAMICS_SIDECHAIN_SHAPE_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('sidechainThreshold', 'Threshold', { unit: ' dB' }),
  dynamicsSlider('sidechainRatio', 'Ratio'),
  dynamicsSlider('sidechainKnee', 'Knee', { unit: ' dB' }),
  dynamicsSlider('sidechainCurve', 'Curve'),
  dynamicsSlider('sidechainAttackMs', 'Attack', { unit: ' ms' }),
  dynamicsSlider('sidechainHoldMs', 'Hold', { unit: ' ms' }),
  dynamicsSlider('sidechainReleaseMs', 'Release', { unit: ' ms' }),
  dynamicsSlider('sidechainMakeup', 'Makeup'),
];

export const DYNAMICS_SIDECHAIN_TARGET_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('sidechainPad1Target', 'Pad 1'),
  dynamicsSlider('sidechainPad2Target', 'Pad 2'),
  dynamicsSlider('sidechainLead1Target', 'Lead 1'),
  dynamicsSlider('sidechainLead2Target', 'Lead 2'),
  dynamicsSlider('sidechainPianoTarget', 'Piano'),
  dynamicsSlider('sidechainGranularTarget', 'Granular'),
  dynamicsSlider('sidechainDelayATarget', 'Delay A'),
  dynamicsSlider('sidechainDelayBTarget', 'Delay B'),
  dynamicsSlider('sidechainReverbTarget', 'Reverb'),
];
