// src/ui/drums/drumSourcePresets.ts
// Factory presets for L2 drumKit and L3 drums source scope.

import type { SliderState } from '../state';

/* ── L3 Drums Source Presets ── */

export interface DrumsSourcePreset {
  name: string;
  description: string;
  tags: string[];
  params: Partial<Pick<SliderState,
    'drumEnabled' | 'drumMorphSliderAnimate' | 'drumDelayEnabled' |
    'drumDelayNoteL' | 'drumDelayNoteR' | 'drumDelayFeedback' |
    'drumDelayMix' | 'drumDelayFilter' |
    'drumSubDelaySend' | 'drumKickDelaySend' | 'drumClickDelaySend' |
    'drumBeepHiDelaySend' | 'drumBeepLoDelaySend' | 'drumNoiseDelaySend' |
    'drumMembraneDelaySend'
  >>;
}

export const DRUMS_SOURCE_PRESETS: Record<string, DrumsSourcePreset> = {
  init: {
    name: 'Init',
    description: 'Default drums source — engine enabled, delay off.',
    tags: ['init', 'clean'],
    params: {
      drumEnabled: true,
      drumMorphSliderAnimate: false,
      drumDelayEnabled: false,
      drumDelayNoteL: '1/8d',
      drumDelayNoteR: '1/4',
      drumDelayFeedback: 0.4,
      drumDelayMix: 0.3,
      drumDelayFilter: 0.5,
      drumSubDelaySend: 0,
      drumKickDelaySend: 0.2,
      drumClickDelaySend: 0.5,
      drumBeepHiDelaySend: 0.6,
      drumBeepLoDelaySend: 0.4,
      drumNoiseDelaySend: 0.7,
      drumMembraneDelaySend: 0.2,
    },
  },
  dottedEcho: {
    name: 'Dotted Echo',
    description: 'Classic dotted eighth delay on highs, quarter on lows.',
    tags: ['delay', 'dotted', 'classic'],
    params: {
      drumEnabled: true,
      drumMorphSliderAnimate: false,
      drumDelayEnabled: true,
      drumDelayNoteL: '1/8d',
      drumDelayNoteR: '1/4',
      drumDelayFeedback: 0.35,
      drumDelayMix: 0.25,
      drumDelayFilter: 0.6,
      drumSubDelaySend: 0,
      drumKickDelaySend: 0.1,
      drumClickDelaySend: 0.8,
      drumBeepHiDelaySend: 0.7,
      drumBeepLoDelaySend: 0.3,
      drumNoiseDelaySend: 0.6,
      drumMembraneDelaySend: 0.15,
    },
  },
  dubbedOut: {
    name: 'Dubbed Out',
    description: 'Heavy delay with high feedback — dub echo style.',
    tags: ['dub', 'heavy', 'delay'],
    params: {
      drumEnabled: true,
      drumMorphSliderAnimate: false,
      drumDelayEnabled: true,
      drumDelayNoteL: '1/4',
      drumDelayNoteR: '1/8',
      drumDelayFeedback: 0.6,
      drumDelayMix: 0.4,
      drumDelayFilter: 0.35,
      drumSubDelaySend: 0.1,
      drumKickDelaySend: 0.3,
      drumClickDelaySend: 0.7,
      drumBeepHiDelaySend: 0.8,
      drumBeepLoDelaySend: 0.5,
      drumNoiseDelaySend: 0.9,
      drumMembraneDelaySend: 0.4,
    },
  },
  morphing: {
    name: 'Morphing',
    description: 'Auto-morphing voices with no delay — evolving sound.',
    tags: ['morph', 'evolving', 'dry'],
    params: {
      drumEnabled: true,
      drumMorphSliderAnimate: true,
      drumDelayEnabled: false,
      drumDelayNoteL: '1/8d',
      drumDelayNoteR: '1/4',
      drumDelayFeedback: 0.4,
      drumDelayMix: 0.3,
      drumDelayFilter: 0.5,
      drumSubDelaySend: 0,
      drumKickDelaySend: 0,
      drumClickDelaySend: 0,
      drumBeepHiDelaySend: 0,
      drumBeepLoDelaySend: 0,
      drumNoiseDelaySend: 0,
      drumMembraneDelaySend: 0,
    },
  },
  brightTriplet: {
    name: 'Bright Triplet',
    description: 'Triplet delays with open filter — bright, rhythmic.',
    tags: ['triplet', 'bright', 'rhythmic'],
    params: {
      drumEnabled: true,
      drumMorphSliderAnimate: false,
      drumDelayEnabled: true,
      drumDelayNoteL: '1/4t',
      drumDelayNoteR: '1/8t',
      drumDelayFeedback: 0.3,
      drumDelayMix: 0.3,
      drumDelayFilter: 0.8,
      drumSubDelaySend: 0,
      drumKickDelaySend: 0.15,
      drumClickDelaySend: 0.6,
      drumBeepHiDelaySend: 0.8,
      drumBeepLoDelaySend: 0.5,
      drumNoiseDelaySend: 0.4,
      drumMembraneDelaySend: 0.3,
    },
  },
};

/* ── L2 Drum Kit Presets ── */

export interface DrumKitPreset {
  name: string;
  description: string;
  tags: string[];
  params: Partial<Pick<SliderState,
    'drumSubDistance' | 'drumKickDistance' | 'drumClickDistance' |
    'drumBeepHiDistance' | 'drumBeepLoDistance' | 'drumNoiseDistance' | 'drumMembraneDistance' |
    'drumSubVariation' | 'drumKickVariation' | 'drumClickVariation' |
    'drumBeepHiVariation' | 'drumBeepLoVariation' | 'drumNoiseVariation' | 'drumMembraneVariation'
  >>;
}

export const DRUM_KIT_PRESETS: Record<string, DrumKitPreset> = {
  init: {
    name: 'Init',
    description: 'Default kit — centred distances, no variation.',
    tags: ['init', 'clean'],
    params: {
      drumSubDistance: 0.5,
      drumKickDistance: 0.5,
      drumClickDistance: 0.5,
      drumBeepHiDistance: 0.5,
      drumBeepLoDistance: 0.5,
      drumNoiseDistance: 0.5,
      drumMembraneDistance: 0.5,
      drumSubVariation: 0,
      drumKickVariation: 0,
      drumClickVariation: 0,
      drumBeepHiVariation: 0,
      drumBeepLoVariation: 0,
      drumNoiseVariation: 0,
      drumMembraneVariation: 0,
    },
  },
  scattered: {
    name: 'Scattered',
    description: 'Wide distance spread with moderate variation — diverse kit.',
    tags: ['varied', 'wide', 'diverse'],
    params: {
      drumSubDistance: 0.3,
      drumKickDistance: 0.7,
      drumClickDistance: 0.2,
      drumBeepHiDistance: 0.8,
      drumBeepLoDistance: 0.4,
      drumNoiseDistance: 0.6,
      drumMembraneDistance: 0.9,
      drumSubVariation: 0.3,
      drumKickVariation: 0.3,
      drumClickVariation: 0.3,
      drumBeepHiVariation: 0.3,
      drumBeepLoVariation: 0.3,
      drumNoiseVariation: 0.3,
      drumMembraneVariation: 0.3,
    },
  },
  evolving: {
    name: 'Evolving',
    description: 'Max variation, centred distance — everything morphing.',
    tags: ['morph', 'evolving', 'alive'],
    params: {
      drumSubDistance: 0.5,
      drumKickDistance: 0.5,
      drumClickDistance: 0.5,
      drumBeepHiDistance: 0.5,
      drumBeepLoDistance: 0.5,
      drumNoiseDistance: 0.5,
      drumMembraneDistance: 0.5,
      drumSubVariation: 0.8,
      drumKickVariation: 0.8,
      drumClickVariation: 0.8,
      drumBeepHiVariation: 0.8,
      drumBeepLoVariation: 0.8,
      drumNoiseVariation: 0.8,
      drumMembraneVariation: 0.8,
    },
  },
  minimal: {
    name: 'Minimal',
    description: 'Close distances, zero variation — tight, predictable kit.',
    tags: ['minimal', 'tight', 'predictable'],
    params: {
      drumSubDistance: 0.2,
      drumKickDistance: 0.15,
      drumClickDistance: 0.25,
      drumBeepHiDistance: 0.1,
      drumBeepLoDistance: 0.2,
      drumNoiseDistance: 0.15,
      drumMembraneDistance: 0.3,
      drumSubVariation: 0,
      drumKickVariation: 0,
      drumClickVariation: 0,
      drumBeepHiVariation: 0,
      drumBeepLoVariation: 0,
      drumNoiseVariation: 0,
      drumMembraneVariation: 0,
    },
  },
};
