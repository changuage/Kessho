// src/ui/granular/granularSourcePresets.ts
// Factory presets for L2 granularKit and L3 granular source scope.

import type { SliderState } from '../state';

/* ── L2 Granular Kit Presets ── */

export interface GranularKitPreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'granularV1Enabled' | 'granularV1Gain' |
    'granularV2Enabled' | 'granularV2Gain' |
    'granularV3Enabled' | 'granularV3Gain' |
    'granularV4Enabled' | 'granularV4Gain' |
    'granularMacroActivity' | 'granularMacroTexture' |
    'granularMacroComplexity' | 'granularMacroDarkness' | 'granularMacroChaos'
  >;
}

export const GRANULAR_KIT_PRESETS: Record<string, GranularKitPreset> = {
  init: {
    name: 'Init',
    description: 'Single voice, balanced macros.',
    tags: ['init', 'clean'],
    params: {
      granularV1Enabled: true,
      granularV1Gain: 0.5,
      granularV2Enabled: false,
      granularV2Gain: 0.5,
      granularV3Enabled: false,
      granularV3Gain: 0.5,
      granularV4Enabled: false,
      granularV4Gain: 0.5,
      granularMacroActivity: 0.35,
      granularMacroTexture: 0.3,
      granularMacroComplexity: 0.2,
      granularMacroDarkness: 0.3,
      granularMacroChaos: 0.1,
    },
  },
  dualVoice: {
    name: 'Dual Voice',
    description: 'Two voices active — stereo layering.',
    tags: ['dual', 'stereo', 'layered'],
    params: {
      granularV1Enabled: true,
      granularV1Gain: 0.6,
      granularV2Enabled: true,
      granularV2Gain: 0.5,
      granularV3Enabled: false,
      granularV3Gain: 0.5,
      granularV4Enabled: false,
      granularV4Gain: 0.5,
      granularMacroActivity: 0.5,
      granularMacroTexture: 0.4,
      granularMacroComplexity: 0.3,
      granularMacroDarkness: 0.25,
      granularMacroChaos: 0.15,
    },
  },
  fullQuad: {
    name: 'Full Quad',
    description: 'All four voices — dense granular cloud.',
    tags: ['quad', 'dense', 'immersive'],
    params: {
      granularV1Enabled: true,
      granularV1Gain: 0.45,
      granularV2Enabled: true,
      granularV2Gain: 0.45,
      granularV3Enabled: true,
      granularV3Gain: 0.4,
      granularV4Enabled: true,
      granularV4Gain: 0.35,
      granularMacroActivity: 0.6,
      granularMacroTexture: 0.5,
      granularMacroComplexity: 0.5,
      granularMacroDarkness: 0.35,
      granularMacroChaos: 0.25,
    },
  },
  darkChaos: {
    name: 'Dark Chaos',
    description: 'High chaos and darkness — glitchy, unpredictable.',
    tags: ['dark', 'chaos', 'glitch'],
    params: {
      granularV1Enabled: true,
      granularV1Gain: 0.6,
      granularV2Enabled: true,
      granularV2Gain: 0.5,
      granularV3Enabled: false,
      granularV3Gain: 0.5,
      granularV4Enabled: false,
      granularV4Gain: 0.5,
      granularMacroActivity: 0.7,
      granularMacroTexture: 0.6,
      granularMacroComplexity: 0.7,
      granularMacroDarkness: 0.8,
      granularMacroChaos: 0.7,
    },
  },
  gentleTexture: {
    name: 'Gentle Texture',
    description: 'Low activity, soft texture — ambient background.',
    tags: ['gentle', 'ambient', 'subtle'],
    params: {
      granularV1Enabled: true,
      granularV1Gain: 0.4,
      granularV2Enabled: false,
      granularV2Gain: 0.5,
      granularV3Enabled: false,
      granularV3Gain: 0.5,
      granularV4Enabled: false,
      granularV4Gain: 0.5,
      granularMacroActivity: 0.15,
      granularMacroTexture: 0.2,
      granularMacroComplexity: 0.1,
      granularMacroDarkness: 0.2,
      granularMacroChaos: 0.05,
    },
  },
};

/* ── L3 Granular Source Presets ── */

export interface GranularSourcePreset {
  name: string;
  description: string;
  tags: string[];
  params: Partial<Pick<SliderState,
    'granularEnabled' | 'granularFreeze' | 'granularFeedback' |
    'granularFeedbackLPF' | 'granularBufferSeconds' | 'granularShape' |
    'granularDiffusion' | 'granularReverbLPF' | 'granularOutputLPF' |
    'granularChordBias' | 'granularDelayEnabled' | 'granularDelayActivity' |
    'granularDelayRepeats' | 'granularDelayTime' | 'granularDelayFilter' |
    'granularDelayVibrato' | 'granularDelayMix'
  >>;
}

export const GRANULAR_SOURCE_PRESETS: Record<string, GranularSourcePreset> = {
  init: {
    name: 'Init',
    description: 'Default granular source — engine off, balanced settings.',
    tags: ['init', 'clean'],
    params: {
      granularEnabled: false,
      granularFreeze: false,
      granularFeedback: 0.3,
      granularFeedbackLPF: 0.6,
      granularBufferSeconds: 4,
      granularShape: 'triangle',
      granularDiffusion: 0.3,
      granularReverbLPF: 0.7,
      granularOutputLPF: 0.8,
      granularChordBias: 0,
      granularDelayEnabled: false,
      granularDelayActivity: 0.3,
      granularDelayRepeats: 0.3,
      granularDelayTime: '1/4',
      granularDelayFilter: 0.5,
      granularDelayVibrato: 0,
      granularDelayMix: 0.3,
    },
  },
  ambientWash: {
    name: 'Ambient Wash',
    description: 'Long buffer, high diffusion — washy ambient texture.',
    tags: ['ambient', 'wash', 'diffuse'],
    params: {
      granularEnabled: true,
      granularFreeze: false,
      granularFeedback: 0.5,
      granularFeedbackLPF: 0.5,
      granularBufferSeconds: 8,
      granularShape: 'triangle',
      granularDiffusion: 0.7,
      granularReverbLPF: 0.6,
      granularOutputLPF: 0.7,
      granularChordBias: 0.3,
      granularDelayEnabled: true,
      granularDelayActivity: 0.4,
      granularDelayRepeats: 0.4,
      granularDelayTime: '1/4',
      granularDelayFilter: 0.4,
      granularDelayVibrato: 0.15,
      granularDelayMix: 0.3,
    },
  },
  frozenCloud: {
    name: 'Frozen Cloud',
    description: 'Freeze enabled with high feedback — sustained cloud.',
    tags: ['freeze', 'sustained', 'cloud'],
    params: {
      granularEnabled: true,
      granularFreeze: true,
      granularFeedback: 0.7,
      granularFeedbackLPF: 0.4,
      granularBufferSeconds: 6,
      granularShape: 'triangle',
      granularDiffusion: 0.6,
      granularReverbLPF: 0.5,
      granularOutputLPF: 0.6,
      granularChordBias: 0.5,
      granularDelayEnabled: false,
      granularDelayActivity: 0.3,
      granularDelayRepeats: 0.3,
      granularDelayTime: '1/4',
      granularDelayFilter: 0.5,
      granularDelayVibrato: 0,
      granularDelayMix: 0.3,
    },
  },
  rhythmicChop: {
    name: 'Rhythmic Chop',
    description: 'Short buffer, square shape, delay active — choppy, rhythmic.',
    tags: ['rhythmic', 'chop', 'delay'],
    params: {
      granularEnabled: true,
      granularFreeze: false,
      granularFeedback: 0.2,
      granularFeedbackLPF: 0.7,
      granularBufferSeconds: 2,
      granularShape: 'square',
      granularDiffusion: 0.15,
      granularReverbLPF: 0.8,
      granularOutputLPF: 0.9,
      granularChordBias: 0,
      granularDelayEnabled: true,
      granularDelayActivity: 0.6,
      granularDelayRepeats: 0.4,
      granularDelayTime: '1/8',
      granularDelayFilter: 0.6,
      granularDelayVibrato: 0,
      granularDelayMix: 0.35,
    },
  },
  darkDrone: {
    name: 'Dark Drone',
    description: 'Dark, heavy feedback — droning, ominous texture.',
    tags: ['dark', 'drone', 'heavy'],
    params: {
      granularEnabled: true,
      granularFreeze: false,
      granularFeedback: 0.65,
      granularFeedbackLPF: 0.25,
      granularBufferSeconds: 6,
      granularShape: 'sawDown',
      granularDiffusion: 0.5,
      granularReverbLPF: 0.3,
      granularOutputLPF: 0.4,
      granularChordBias: 0.7,
      granularDelayEnabled: true,
      granularDelayActivity: 0.2,
      granularDelayRepeats: 0.5,
      granularDelayTime: '1/2',
      granularDelayFilter: 0.3,
      granularDelayVibrato: 0.2,
      granularDelayMix: 0.25,
    },
  },
};
