import { DEFAULT_STATE, type SliderState } from '../state';
import {
  defineProductSliderControl,
  type ProductSliderControlDefinition,
} from '../controls/productControlSchema';

export interface DynamicsSliderControlDefinition extends ProductSliderControlDefinition {
  announceHelp?: boolean;
}

export type DynamicsEqId = 'eq1' | 'eq2';

export interface DynamicsEqControlSet {
  id: DynamicsEqId;
  label: string;
  scope: 'dynamicsEq1' | 'dynamicsEq2';
  enabledKey: 'dynamicsEq1Enabled' | 'dynamicsEq2Enabled';
  lowTypeKey: 'dynamicsEq1LowType' | 'dynamicsEq2LowType';
  highTypeKey: 'dynamicsEq1HighType' | 'dynamicsEq2HighType';
  trimControls: readonly DynamicsSliderControlDefinition[];
  lowControls: readonly DynamicsSliderControlDefinition[];
  midControls: readonly DynamicsSliderControlDefinition[];
  highControls: readonly DynamicsSliderControlDefinition[];
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
      helpPage: 'texture',
      ...options,
    }),
    announceHelp: options.announceHelp,
  };
}

export const DYNAMICS_DRIFT_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('driftMix', 'Mix'),
  dynamicsSlider('driftAge', 'Age'),
  dynamicsSlider('driftBias', 'Bias'),
  dynamicsSlider('driftLpgAmount', 'LPG Open'),
  dynamicsSlider('driftDepth', 'Depth'),
  dynamicsSlider('driftRate', 'Rate'),
  dynamicsSlider('driftDamp', 'Damp'),
  dynamicsSlider('driftEnvFollow', 'Env Follow'),
  dynamicsSlider('degradeHp', 'HP'),
  dynamicsSlider('degradeLp', 'LP'),
  dynamicsSlider('driftStereo', 'Stereo'),
  dynamicsSlider('driftResonance', 'Resonance'),
];

export const DYNAMICS_DRIFT_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('driftAntiComb', 'Comb Protect'),
  dynamicsSlider('driftDiffusion', 'Diffusion'),
];

export const DYNAMICS_EROSION_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('erosionMix', 'Mix'),
  dynamicsSlider('erosionAge', 'Wear'),
  dynamicsSlider('erosionGeneration', 'Generation'),
  dynamicsSlider('erosionAlias', 'Alias'),
  dynamicsSlider('erosionWow', 'Wow'),
  dynamicsSlider('erosionFlutter', 'Flutter'),
  dynamicsSlider('erosionDrift', 'Drift'),
  dynamicsSlider('erosionWobbleSpeed', 'Wobble Speed'),
  dynamicsSlider('erosionNoise', 'Noise'),
  dynamicsSlider('degradeHp', 'HP'),
  dynamicsSlider('degradeLp', 'LP'),
  dynamicsSlider('erosionTone', 'Tone'),
  dynamicsSlider('erosionSaturation', 'Clip'),
  dynamicsSlider('erosionCorrosion', 'Corrosion'),
];

export const DYNAMICS_EROSION_QUALITY_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('erosionEventAmount', 'Events'),
  dynamicsSlider('erosionProfileAmount', 'Profile'),
  dynamicsSlider('erosionDitherAmount', 'Dither'),
];

export const DYNAMICS_SATURATION_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsSaturationDrive', 'Drive'),
  dynamicsSlider('dynamicsSaturationTone', 'Tone'),
  dynamicsSlider('dynamicsSaturationBias', 'Bias'),
];

const EQ_GAIN_OPTIONS = { unit: ' dB' } as const;
const EQ_FREQ_OPTIONS = { unit: ' Hz', logarithmic: true, announceHelp: true } as const;
const EQ_Q_OPTIONS = { announceHelp: true } as const;

const DYNAMICS_EQ1_TRIM_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq1InputGain', 'Input', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq1OutputGain', 'Output', EQ_GAIN_OPTIONS),
];

const DYNAMICS_EQ1_LOW_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq1LowFreq', 'Low Freq', EQ_FREQ_OPTIONS),
  dynamicsSlider('dynamicsEq1LowGain', 'Low Gain', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq1LowQ', 'Low Q', EQ_Q_OPTIONS),
  dynamicsSlider('dynamicsEq1LowSlope', 'Low Slope', EQ_Q_OPTIONS),
];

const DYNAMICS_EQ1_MID_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq1MidFreq', 'Mid Freq', EQ_FREQ_OPTIONS),
  dynamicsSlider('dynamicsEq1MidGain', 'Mid Gain', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq1MidQ', 'Mid Q', EQ_Q_OPTIONS),
];

const DYNAMICS_EQ1_HIGH_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq1HighFreq', 'High Freq', EQ_FREQ_OPTIONS),
  dynamicsSlider('dynamicsEq1HighGain', 'High Gain', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq1HighQ', 'High Q', EQ_Q_OPTIONS),
  dynamicsSlider('dynamicsEq1HighSlope', 'High Slope', EQ_Q_OPTIONS),
];

const DYNAMICS_EQ2_TRIM_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq2InputGain', 'Input', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq2OutputGain', 'Output', EQ_GAIN_OPTIONS),
];

const DYNAMICS_EQ2_LOW_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq2LowFreq', 'Low Freq', EQ_FREQ_OPTIONS),
  dynamicsSlider('dynamicsEq2LowGain', 'Low Gain', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq2LowQ', 'Low Q', EQ_Q_OPTIONS),
  dynamicsSlider('dynamicsEq2LowSlope', 'Low Slope', EQ_Q_OPTIONS),
];

const DYNAMICS_EQ2_MID_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq2MidFreq', 'Mid Freq', EQ_FREQ_OPTIONS),
  dynamicsSlider('dynamicsEq2MidGain', 'Mid Gain', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq2MidQ', 'Mid Q', EQ_Q_OPTIONS),
];

const DYNAMICS_EQ2_HIGH_CONTROLS: readonly DynamicsSliderControlDefinition[] = [
  dynamicsSlider('dynamicsEq2HighFreq', 'High Freq', EQ_FREQ_OPTIONS),
  dynamicsSlider('dynamicsEq2HighGain', 'High Gain', EQ_GAIN_OPTIONS),
  dynamicsSlider('dynamicsEq2HighQ', 'High Q', EQ_Q_OPTIONS),
  dynamicsSlider('dynamicsEq2HighSlope', 'High Slope', EQ_Q_OPTIONS),
];

export const DYNAMICS_EQ_CONTROL_SETS = [
  {
    id: 'eq1',
    label: 'EQ 1',
    scope: 'dynamicsEq1',
    enabledKey: 'dynamicsEq1Enabled',
    lowTypeKey: 'dynamicsEq1LowType',
    highTypeKey: 'dynamicsEq1HighType',
    trimControls: DYNAMICS_EQ1_TRIM_CONTROLS,
    lowControls: DYNAMICS_EQ1_LOW_CONTROLS,
    midControls: DYNAMICS_EQ1_MID_CONTROLS,
    highControls: DYNAMICS_EQ1_HIGH_CONTROLS,
  },
  {
    id: 'eq2',
    label: 'EQ 2',
    scope: 'dynamicsEq2',
    enabledKey: 'dynamicsEq2Enabled',
    lowTypeKey: 'dynamicsEq2LowType',
    highTypeKey: 'dynamicsEq2HighType',
    trimControls: DYNAMICS_EQ2_TRIM_CONTROLS,
    lowControls: DYNAMICS_EQ2_LOW_CONTROLS,
    midControls: DYNAMICS_EQ2_MID_CONTROLS,
    highControls: DYNAMICS_EQ2_HIGH_CONTROLS,
  },
] as const satisfies readonly DynamicsEqControlSet[];

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
