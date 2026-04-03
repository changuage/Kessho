// src/ui/earth/earthPresets.ts
// Factory presets for L2 earthKit scope.

import type { SliderState } from '../state';

export interface EarthKitPreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'waterEnabled' | 'insectsEnabled' | 'insects2Enabled' | 'fireEnabled' |
    'oceanSampleEnabled' | 'oceanFilterType' | 'oceanFilterCutoff' | 'oceanFilterResonance'
  >;
}

export const EARTH_KIT_PRESETS: Record<string, EarthKitPreset> = {
  init: {
    name: 'Init',
    description: 'All earth engines off.',
    tags: ['init', 'silent'],
    params: {
      waterEnabled: false,
      insectsEnabled: false,
      insects2Enabled: false,
      fireEnabled: false,
      oceanSampleEnabled: false,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 8000,
      oceanFilterResonance: 0.1,
    },
  },
  waterOnly: {
    name: 'Water Only',
    description: 'Pure water soundscape, no insects or ocean.',
    tags: ['water', 'minimal'],
    params: {
      waterEnabled: true,
      insectsEnabled: false,
      insects2Enabled: false,
      fireEnabled: false,
      oceanSampleEnabled: false,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 8000,
      oceanFilterResonance: 0.1,
    },
  },
  fullNature: {
    name: 'Full Nature',
    description: 'Everything enabled — immersive nature soundscape.',
    tags: ['nature', 'full', 'immersive'],
    params: {
      waterEnabled: true,
      insectsEnabled: true,
      insects2Enabled: true,
      fireEnabled: false,
      oceanSampleEnabled: true,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 6000,
      oceanFilterResonance: 0.15,
    },
  },
  nightAmbience: {
    name: 'Night Ambience',
    description: 'Insects + dark ocean — nocturnal atmosphere.',
    tags: ['night', 'insects', 'dark'],
    params: {
      waterEnabled: false,
      insectsEnabled: true,
      insects2Enabled: true,
      fireEnabled: false,
      oceanSampleEnabled: true,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 3000,
      oceanFilterResonance: 0.2,
    },
  },
  coastalDay: {
    name: 'Coastal Day',
    description: 'Water + bright ocean — seaside atmosphere.',
    tags: ['coastal', 'ocean', 'bright'],
    params: {
      waterEnabled: true,
      insectsEnabled: false,
      insects2Enabled: false,
      fireEnabled: false,
      oceanSampleEnabled: true,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 10000,
      oceanFilterResonance: 0.1,
    },
  },
  filteredOcean: {
    name: 'Filtered Ocean',
    description: 'Ocean through bandpass filter — atmospheric, distant.',
    tags: ['ocean', 'bandpass', 'distant'],
    params: {
      waterEnabled: false,
      insectsEnabled: false,
      insects2Enabled: false,
      fireEnabled: false,
      oceanSampleEnabled: true,
      oceanFilterType: 'bandpass',
      oceanFilterCutoff: 2000,
      oceanFilterResonance: 0.5,
    },
  },
  campfireNight: {
    name: 'Shoreline Night',
    description: 'Dual insects with a dark distant wave bed.',
    tags: ['night', 'shore', 'waves'],
    params: {
      waterEnabled: false,
      insectsEnabled: true,
      insects2Enabled: true,
      fireEnabled: false,
      oceanSampleEnabled: true,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 2600,
      oceanFilterResonance: 0.18,
    },
  },
};
