// src/ui/synth/synthSourcePresets.ts
// Factory presets for L3 synth source scope.

import type { SliderState } from '../state';

export interface SynthSourcePreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'leadEnabled' | 'leadRandomEnabled' |
    'lead1VibratoDepth' | 'lead1VibratoRate' | 'lead1Glide' |
    'lead2VibratoDepth' | 'lead2VibratoRate' | 'lead2Glide'
  >;
}

export const SYNTH_SOURCE_PRESETS: Record<string, SynthSourcePreset> = {
  init: {
    name: 'Init',
    description: 'Default synth source — lead off, no vibrato or glide.',
    tags: ['init', 'clean'],
    params: {
      leadEnabled: false,
      leadRandomEnabled: false,
      lead1VibratoDepth: 0,
      lead1VibratoRate: 0,
      lead1Glide: 0,
      lead2VibratoDepth: 0,
      lead2VibratoRate: 0,
      lead2Glide: 0,
    },
  },
  leadOn: {
    name: 'Lead Active',
    description: 'Lead enabled with gentle vibrato.',
    tags: ['lead', 'active', 'vibrato'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: false,
      lead1VibratoDepth: 0.15,
      lead1VibratoRate: 0.3,
      lead1Glide: 0,
      lead2VibratoDepth: 0.15,
      lead2VibratoRate: 0.3,
      lead2Glide: 0,
    },
  },
  expressiveLead: {
    name: 'Expressive Lead',
    description: 'Deep vibrato with portamento — vocal, expressive.',
    tags: ['expressive', 'vibrato', 'glide'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: false,
      lead1VibratoDepth: 0.4,
      lead1VibratoRate: 0.5,
      lead1Glide: 0.6,
      lead2VibratoDepth: 0.4,
      lead2VibratoRate: 0.5,
      lead2Glide: 0.6,
    },
  },
  randomMelody: {
    name: 'Random Melody',
    description: 'Random lead phrases, subtle vibrato.',
    tags: ['random', 'melody', 'generative'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: true,
      lead1VibratoDepth: 0.1,
      lead1VibratoRate: 0.25,
      lead1Glide: 0.2,
      lead2VibratoDepth: 0.1,
      lead2VibratoRate: 0.25,
      lead2Glide: 0.2,
    },
  },
  smoothGlide: {
    name: 'Smooth Glide',
    description: 'Maximum glide, moderate vibrato — smooth legato.',
    tags: ['glide', 'legato', 'smooth'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: false,
      lead1VibratoDepth: 0.2,
      lead1VibratoRate: 0.35,
      lead1Glide: 1.0,
      lead2VibratoDepth: 0.2,
      lead2VibratoRate: 0.35,
      lead2Glide: 1.0,
    },
  },
};
