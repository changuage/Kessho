// src/ui/synth/synthSourcePresets.ts
// Factory presets for L3 synth source scope.

import type { SliderState } from '../state';

export interface SynthSourcePreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'leadEnabled' | 'leadRandomEnabled' | 'leadVibratoDepth' |
    'leadVibratoRate' | 'leadGlide'
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
      leadVibratoDepth: 0,
      leadVibratoRate: 0,
      leadGlide: 0,
    },
  },
  leadOn: {
    name: 'Lead Active',
    description: 'Lead enabled with gentle vibrato.',
    tags: ['lead', 'active', 'vibrato'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: false,
      leadVibratoDepth: 0.15,
      leadVibratoRate: 0.3,
      leadGlide: 0,
    },
  },
  expressiveLead: {
    name: 'Expressive Lead',
    description: 'Deep vibrato with portamento — vocal, expressive.',
    tags: ['expressive', 'vibrato', 'glide'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: false,
      leadVibratoDepth: 0.4,
      leadVibratoRate: 0.5,
      leadGlide: 0.6,
    },
  },
  randomMelody: {
    name: 'Random Melody',
    description: 'Random lead phrases, subtle vibrato.',
    tags: ['random', 'melody', 'generative'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: true,
      leadVibratoDepth: 0.1,
      leadVibratoRate: 0.25,
      leadGlide: 0.2,
    },
  },
  smoothGlide: {
    name: 'Smooth Glide',
    description: 'Maximum glide, moderate vibrato — smooth legato.',
    tags: ['glide', 'legato', 'smooth'],
    params: {
      leadEnabled: true,
      leadRandomEnabled: false,
      leadVibratoDepth: 0.2,
      leadVibratoRate: 0.35,
      leadGlide: 1.0,
    },
  },
};
