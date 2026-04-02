// src/ui/delay/delayPresets.ts
// Factory presets for Echo Line (L1), Clocked Space (L1), Delay Kit (L2), and Delay Source (L3).

import type { SliderState } from '../state';

/* ── Echo Line (echoLine scope, L1 engine) ── */

export interface EchoLinePreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'delayAPingPong' | 'delayAModRate' | 'delayAModDepth' |
    'delayADuck' | 'delayAFilterType' | 'delayAWidth'
  >;
}

export const ECHO_LINE_PRESETS: Record<string, EchoLinePreset> = {
  init: {
    name: 'Init',
    description: 'Default Echo Line — clean, centred, no modulation.',
    tags: ['init', 'clean'],
    params: {
      delayAPingPong: false,
      delayAModRate: 0,
      delayAModDepth: 0,
      delayADuck: 0,
      delayAFilterType: 'lowpass',
      delayAWidth: 0.5,
    },
  },
  pingPongClean: {
    name: 'Ping Pong Clean',
    description: 'Wide stereo ping-pong with no processing.',
    tags: ['stereo', 'clean'],
    params: {
      delayAPingPong: true,
      delayAModRate: 0,
      delayAModDepth: 0,
      delayADuck: 0,
      delayAFilterType: 'lowpass',
      delayAWidth: 0.75,
    },
  },
  chorusWash: {
    name: 'Chorus Wash',
    description: 'Lush chorus-like modulation, wide and warm.',
    tags: ['modulation', 'lush'],
    params: {
      delayAPingPong: false,
      delayAModRate: 0.6,
      delayAModDepth: 0.5,
      delayADuck: 0,
      delayAFilterType: 'lowpass',
      delayAWidth: 0.7,
    },
  },
  duckedStereo: {
    name: 'Ducked Stereo',
    description: 'Ping-pong echo that ducks on input for clarity.',
    tags: ['duck', 'stereo', 'clean'],
    params: {
      delayAPingPong: true,
      delayAModRate: 0.2,
      delayAModDepth: 0.15,
      delayADuck: 0.7,
      delayAFilterType: 'lowpass',
      delayAWidth: 0.85,
    },
  },
  bandpassSweep: {
    name: 'Bandpass Sweep',
    description: 'Narrow bandpass feedback with gentle modulation.',
    tags: ['bandpass', 'filter', 'character'],
    params: {
      delayAPingPong: false,
      delayAModRate: 0.35,
      delayAModDepth: 0.3,
      delayADuck: 0.2,
      delayAFilterType: 'bandpass',
      delayAWidth: 0.5,
    },
  },
  highpassShimmer: {
    name: 'Highpass Shimmer',
    description: 'Bright, airy echoes with ping-pong and wide spread.',
    tags: ['bright', 'airy', 'stereo'],
    params: {
      delayAPingPong: true,
      delayAModRate: 0.5,
      delayAModDepth: 0.25,
      delayADuck: 0.15,
      delayAFilterType: 'highpass',
      delayAWidth: 0.9,
    },
  },
  darkMono: {
    name: 'Dark Mono',
    description: 'Narrow, dark echo with subtle modulation.',
    tags: ['dark', 'mono', 'subtle'],
    params: {
      delayAPingPong: false,
      delayAModRate: 0.1,
      delayAModDepth: 0.05,
      delayADuck: 0,
      delayAFilterType: 'lowpass',
      delayAWidth: 0.15,
    },
  },
  wideModulated: {
    name: 'Wide Modulated',
    description: 'Maximum spread with heavy modulation — ambient swirl.',
    tags: ['modulation', 'wide', 'ambient'],
    params: {
      delayAPingPong: false,
      delayAModRate: 0.8,
      delayAModDepth: 0.65,
      delayADuck: 0,
      delayAFilterType: 'lowpass',
      delayAWidth: 1.0,
    },
  },
};

/* ── Clocked Space (clockedSpace scope, L1 engine) ── */

export interface ClockedSpacePreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'delayBPattern' | 'delayBWarp' | 'delayBWarpIntensity' | 'delayBSpread'
  >;
}

export const CLOCKED_SPACE_PRESETS: Record<string, ClockedSpacePreset> = {
  init: {
    name: 'Init',
    description: 'Default Clocked Space — cascade pattern, clean, balanced spread.',
    tags: ['init', 'clean'],
    params: {
      delayBPattern: 'cascade',
      delayBWarp: 'clean',
      delayBWarpIntensity: 0.5,
      delayBSpread: 0.5,
    },
  },
  goldenClean: {
    name: 'Golden Clean',
    description: 'Golden ratio taps, no warp — naturally balanced.',
    tags: ['golden', 'clean', 'natural'],
    params: {
      delayBPattern: 'golden',
      delayBWarp: 'clean',
      delayBWarpIntensity: 0,
      delayBSpread: 0.6,
    },
  },
  mirrorSweep: {
    name: 'Mirror Sweep',
    description: 'Mirrored taps with filter sweep warp — evolving texture.',
    tags: ['mirror', 'filter', 'evolving'],
    params: {
      delayBPattern: 'mirror',
      delayBWarp: 'filterSweep',
      delayBWarpIntensity: 0.7,
      delayBSpread: 0.5,
    },
  },
  dottedDrift: {
    name: 'Dotted Drift',
    description: 'Dotted rhythm with pitch drift — dreamy, off-kilter.',
    tags: ['dotted', 'pitch', 'dreamy'],
    params: {
      delayBPattern: 'dotted',
      delayBWarp: 'pitchDrift',
      delayBWarpIntensity: 0.4,
      delayBSpread: 0.7,
    },
  },
  cascadeGrain: {
    name: 'Cascade Grain',
    description: 'Cascading taps with granular crossfade — textural depth.',
    tags: ['cascade', 'grain', 'texture'],
    params: {
      delayBPattern: 'cascade',
      delayBWarp: 'grainCrossfade',
      delayBWarpIntensity: 0.6,
      delayBSpread: 0.8,
    },
  },
  goldenFilter: {
    name: 'Golden Filter',
    description: 'Golden ratio with heavy filter sweep — movement and shimmer.',
    tags: ['golden', 'filter', 'shimmer'],
    params: {
      delayBPattern: 'golden',
      delayBWarp: 'filterSweep',
      delayBWarpIntensity: 0.8,
      delayBSpread: 0.4,
    },
  },
  tightMirror: {
    name: 'Tight Mirror',
    description: 'Close-in mirrored taps — focused, dry spatial echo.',
    tags: ['mirror', 'tight', 'focused'],
    params: {
      delayBPattern: 'mirror',
      delayBWarp: 'clean',
      delayBWarpIntensity: 0,
      delayBSpread: 0.2,
    },
  },
  wideGrain: {
    name: 'Wide Grain',
    description: 'Full-width granular crossfade — immersive cloud.',
    tags: ['grain', 'wide', 'immersive'],
    params: {
      delayBPattern: 'dotted',
      delayBWarp: 'grainCrossfade',
      delayBWarpIntensity: 0.9,
      delayBSpread: 1.0,
    },
  },
};

/* ── Delay Kit (L2, delayKit scope — cross-feed routing + master sat) ── */

export interface DelayKitPreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'delayAToBSend' | 'delayBToASend' | 'delayACrossFeedFilter' |
    'delayAGranularSend' | 'delayBGranularSend' |
    'masterSatDrive' | 'masterSatMode' | 'masterSatTone'
  >;
}

export const DELAY_KIT_PRESETS: Record<string, DelayKitPreset> = {
  init: {
    name: 'Init',
    description: 'No cross-feeds, no saturation — clean parallel delays.',
    tags: ['init', 'clean'],
    params: {
      delayAToBSend: 0,
      delayBToASend: 0,
      delayACrossFeedFilter: 1,
      delayAGranularSend: 0,
      delayBGranularSend: 0,
      masterSatDrive: 0,
      masterSatMode: 'clean',
      masterSatTone: 0.5,
    },
  },
  aFeedsB: {
    name: 'Echo → Clocked',
    description: 'Echo Line feeds into Clocked Space for cascading echoes.',
    tags: ['cascade', 'feed'],
    params: {
      delayAToBSend: 0.4,
      delayBToASend: 0,
      delayACrossFeedFilter: 0.7,
      delayAGranularSend: 0,
      delayBGranularSend: 0,
      masterSatDrive: 0,
      masterSatMode: 'clean',
      masterSatTone: 0.5,
    },
  },
  bFeedsA: {
    name: 'Clocked → Echo',
    description: 'Clocked Space returns into Echo Line — rhythmic pre-diffusion.',
    tags: ['feedback', 'rhythmic'],
    params: {
      delayAToBSend: 0,
      delayBToASend: 0.35,
      delayACrossFeedFilter: 0.6,
      delayAGranularSend: 0,
      delayBGranularSend: 0,
      masterSatDrive: 0,
      masterSatMode: 'clean',
      masterSatTone: 0.5,
    },
  },
  dualFeedback: {
    name: 'Dual Feedback',
    description: 'Both delays feed each other — dense, evolving texture.',
    tags: ['feedback', 'dense', 'evolving'],
    params: {
      delayAToBSend: 0.25,
      delayBToASend: 0.2,
      delayACrossFeedFilter: 0.5,
      delayAGranularSend: 0,
      delayBGranularSend: 0,
      masterSatDrive: 0.15,
      masterSatMode: 'tape',
      masterSatTone: 0.45,
    },
  },
  granularReturn: {
    name: 'Granular Return',
    description: 'Both delays feed into granular engine for textural recycling.',
    tags: ['granular', 'texture', 'recycle'],
    params: {
      delayAToBSend: 0,
      delayBToASend: 0,
      delayACrossFeedFilter: 1,
      delayAGranularSend: 0.35,
      delayBGranularSend: 0.4,
      masterSatDrive: 0,
      masterSatMode: 'clean',
      masterSatTone: 0.5,
    },
  },
  tapeLoop: {
    name: 'Tape Loop',
    description: 'Warm tape saturation with gentle cross-feed — lo-fi character.',
    tags: ['tape', 'warm', 'lo-fi'],
    params: {
      delayAToBSend: 0.2,
      delayBToASend: 0.15,
      delayACrossFeedFilter: 0.4,
      delayAGranularSend: 0,
      delayBGranularSend: 0,
      masterSatDrive: 0.5,
      masterSatMode: 'tape',
      masterSatTone: 0.35,
    },
  },
  tubeDrive: {
    name: 'Tube Drive',
    description: 'Hot tube saturation, cascading A→B — aggressive character.',
    tags: ['tube', 'drive', 'aggressive'],
    params: {
      delayAToBSend: 0.5,
      delayBToASend: 0,
      delayACrossFeedFilter: 0.55,
      delayAGranularSend: 0,
      delayBGranularSend: 0,
      masterSatDrive: 0.7,
      masterSatMode: 'tube',
      masterSatTone: 0.6,
    },
  },
  fullMatrix: {
    name: 'Full Matrix',
    description: 'Everything connected — dense, saturated, granular-recycled.',
    tags: ['matrix', 'dense', 'saturated', 'granular'],
    params: {
      delayAToBSend: 0.3,
      delayBToASend: 0.2,
      delayACrossFeedFilter: 0.45,
      delayAGranularSend: 0.25,
      delayBGranularSend: 0.3,
      masterSatDrive: 0.4,
      masterSatMode: 'tape',
      masterSatTone: 0.4,
    },
  },
};

/* ── Delay Source (L3, delay scope — page-level modes) ── */

export interface DelaySourcePreset {
  name: string;
  description: string;
  tags: string[];
  params: Pick<SliderState,
    'granularSpaceMode' | 'delayBGranularLinked'
  >;
}

export const DELAY_SOURCE_PRESETS: Record<string, DelaySourcePreset> = {
  clockedLinked: {
    name: 'Clocked Linked',
    description: 'Clocked mode with granular preset linkage — default behavior.',
    tags: ['clocked', 'linked', 'default'],
    params: {
      granularSpaceMode: 'clocked',
      delayBGranularLinked: true,
    },
  },
  clockedFree: {
    name: 'Clocked Free',
    description: 'Clocked mode, Delay B voicing independent of granular presets.',
    tags: ['clocked', 'free', 'independent'],
    params: {
      granularSpaceMode: 'clocked',
      delayBGranularLinked: false,
    },
  },
  diffuseLinked: {
    name: 'Diffuse Linked',
    description: 'Diffuse mode with granular linkage — washy, organic delays.',
    tags: ['diffuse', 'linked', 'washy'],
    params: {
      granularSpaceMode: 'diffuse',
      delayBGranularLinked: true,
    },
  },
  diffuseFree: {
    name: 'Diffuse Free',
    description: 'Diffuse mode, fully independent Delay B voicing.',
    tags: ['diffuse', 'free', 'independent'],
    params: {
      granularSpaceMode: 'diffuse',
      delayBGranularLinked: false,
    },
  },
};
