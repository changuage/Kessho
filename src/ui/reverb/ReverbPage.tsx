/**
 * ReverbPage — Two-card layout for reverb controls
 *
 * Left card  : Core reverb (Active, Engine, Type, Quality, Decay, Size, Diffusion)
 * Right card : Mod & Character (Presets, Modulation, Pre-delay, Damping, Width,
 *              Shimmer, Slow Mod, Reverse, Freeze)
 *
 * Follows SynthPage / EarthPage / LooperPage pattern: dedicated component with
 * own CSS, receives SliderComponent, SelectComponent, sliderProps, onParamChange
 * as props from App.tsx.
 */

import React, { useState, useCallback } from 'react';
import type { SliderState, SliderMode } from '../state';
import type { DualSliderRange } from '../DualSlider';
import './reverb.css';

// ═══ Reverb Character Presets ═══

export const REVERB_CHARACTER_PRESETS: Record<string, {
  label: string;
  description: string;
  params: Partial<SliderState>;
}> = {
  default: {
    label: 'Default',
    description: 'Clean ambient cathedral',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.9, reverbSize: 2.0, reverbDiffusion: 1.0, reverbModulation: 0.4,
      predelay: 60, damping: 0.2, width: 0.85,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.5, reverbChorusDepth: 12,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.3, reverbCrossoverFreq: 800,
      reverbInputTone: 0, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.3, reverbAirAbsorption: 0.2, reverbSaturationMode: 'clean' as const,
    },
  },
  shimmerPad: {
    label: 'Shimmer Pad',
    description: 'Octave-up shimmer with long decay and compound feedback',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.95, reverbSize: 2.5, reverbDiffusion: 0.95, reverbModulation: 0.5,
      predelay: 40, damping: 0.15, width: 0.95,
      reverbShimmer: 0.45, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.03, reverbSlowModDepth: 0.2,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.7, reverbChorusDepth: 18,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.2, reverbCrossoverFreq: 1200,
      reverbInputTone: 0.2, reverbShimmerFeedback: 0.35,
      reverbWarp: 0, reverbCrossFeed: 0.15,
      reverbEarlyReflections: 0.2, reverbAirAbsorption: 0.15, reverbSaturationMode: 'clean' as const,
    },
  },
  blackhole: {
    label: 'Blackhole',
    description: 'Massive infinite-like space with warp drift + dark tone',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.98, reverbSize: 6.0, reverbDiffusion: 1.0, reverbModulation: 0.65,
      predelay: 80, damping: 0.08, width: 1.0,
      reverbShimmer: 0.3, reverbShimmerPitch: 5,
      reverbSlowModRate: 0.02, reverbSlowModDepth: 0.7,
      reverbFreeze: false, reverbReverse: 0.4, reverbReverseLength: 3.5,
      reverbChorusRate: 0.3, reverbChorusDepth: 30,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.15, reverbCrossoverFreq: 600,
      reverbInputTone: -0.4, reverbShimmerFeedback: 0.5,
      reverbWarp: 0.4, reverbCrossFeed: 0.3,
      reverbEarlyReflections: 0.1, reverbAirAbsorption: 0.4, reverbSaturationMode: 'tape' as const,
    },
  },
  nightsky: {
    label: 'Nightsky',
    description: 'Warm drifting reverb with organic modulation and subtle shimmer',
    params: {
      reverbType: 'darkHall' as SliderState['reverbType'],
      reverbDecay: 0.92, reverbSize: 2.0, reverbDiffusion: 0.85, reverbModulation: 0.55,
      predelay: 50, damping: 0.35, width: 0.9,
      reverbShimmer: 0.2, reverbShimmerPitch: 7,
      reverbSlowModRate: 0.04, reverbSlowModDepth: 0.6,
      reverbFreeze: false, reverbReverse: 0.15, reverbReverseLength: 2.5,
      reverbChorusRate: 0.4, reverbChorusDepth: 20,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.15, reverbDampHigh: 0.45, reverbCrossoverFreq: 700,
      reverbInputTone: -0.3, reverbShimmerFeedback: 0.2,
      reverbWarp: 0.1, reverbCrossFeed: 0.2,
      reverbEarlyReflections: 0.25, reverbAirAbsorption: 0.35, reverbSaturationMode: 'tape' as const,
    },
  },
  frozenCathedral: {
    label: 'Frozen Cathedral',
    description: 'Infinite sustain with wide stereo and gentle chorus',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 1.0, reverbSize: 3.0, reverbDiffusion: 1.0, reverbModulation: 0.3,
      predelay: 100, damping: 0.05, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: true, reverbReverse: 0, reverbReverseLength: 2,
      reverbFreezeInputBleed: 0.05, reverbFreezeModAtten: 0.8, reverbFreezeVelvetDensity: 0.003,
      reverbChorusRate: 0.8, reverbChorusDepth: 15,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.0, reverbDampHigh: 0.05, reverbCrossoverFreq: 1000,
      reverbInputTone: 0.1, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.4, reverbAirAbsorption: 0.1, reverbSaturationMode: 'clean' as const,
    },
  },
  reverseWash: {
    label: 'Reverse Wash',
    description: 'Heavy reverse tail with drift modulation for swell effects',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.88, reverbSize: 1.8, reverbDiffusion: 0.9, reverbModulation: 0.4,
      predelay: 30, damping: 0.25, width: 0.85,
      reverbShimmer: 0.15, reverbShimmerPitch: -12,
      reverbSlowModRate: 0.06, reverbSlowModDepth: 0.3,
      reverbFreeze: false, reverbReverse: 0.7, reverbReverseLength: 2.0,
      reverbChorusRate: 0.6, reverbChorusDepth: 25,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.35, reverbCrossoverFreq: 900,
      reverbInputTone: -0.2, reverbShimmerFeedback: 0.15,
      reverbWarp: 0.15, reverbCrossFeed: 0.1,
      reverbEarlyReflections: 0.15, reverbAirAbsorption: 0.2, reverbSaturationMode: 'clean' as const,
    },
  },
  cosmicDrift: {
    label: 'Cosmic Drift',
    description: 'Deep slow-breathing space with compound shimmer and dark tone',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.94, reverbSize: 2.8, reverbDiffusion: 0.92, reverbModulation: 0.7,
      predelay: 70, damping: 0.12, width: 1.0,
      reverbShimmer: 0.35, reverbShimmerPitch: 19,
      reverbSlowModRate: 0.015, reverbSlowModDepth: 0.85,
      reverbFreeze: false, reverbReverse: 0.25, reverbReverseLength: 3.0,
      reverbChorusRate: 0.25, reverbChorusDepth: 35,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.2, reverbCrossoverFreq: 500,
      reverbInputTone: -0.5, reverbShimmerFeedback: 0.6,
      reverbWarp: 0.25, reverbCrossFeed: 0.35,
      reverbEarlyReflections: 0.1, reverbAirAbsorption: 0.35, reverbSaturationMode: 'tube' as const,
    },
  },
  tightPlate: {
    label: 'Tight Plate',
    description: 'Short bright plate — no effects',
    params: {
      reverbType: 'plate' as SliderState['reverbType'],
      reverbDecay: 0.5, reverbSize: 0.7, reverbDiffusion: 0.7, reverbModulation: 0.15,
      predelay: 10, damping: 0.4, width: 0.6,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 1.2, reverbChorusDepth: 5,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.2, reverbDampHigh: 0.5, reverbCrossoverFreq: 2000,
      reverbInputTone: 0.3, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.5, reverbAirAbsorption: 0.1, reverbSaturationMode: 'clean' as const,
    },
  },
  supermassive: {
    label: 'Supermassive',
    description: 'Extreme warp + massive size — Valhalla Supermassive inspired',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.97, reverbSize: 8.0, reverbDiffusion: 1.0, reverbModulation: 0.6,
      predelay: 60, damping: 0.1, width: 1.0,
      reverbShimmer: 0.2, reverbShimmerPitch: 7,
      reverbSlowModRate: 0.025, reverbSlowModDepth: 0.5,
      reverbFreeze: false, reverbReverse: 0.2, reverbReverseLength: 4.0,
      reverbChorusRate: 0.2, reverbChorusDepth: 35,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.12, reverbCrossoverFreq: 500,
      reverbInputTone: -0.3, reverbShimmerFeedback: 0.4,
      reverbWarp: 0.6, reverbCrossFeed: 0.4,
      reverbEarlyReflections: 0.05, reverbAirAbsorption: 0.3, reverbSaturationMode: 'tape' as const,
    },
  },
  gravityWell: {
    label: 'Gravity Well',
    description: 'Maximum warp — pitch cascades create swirling vortex',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.96, reverbSize: 5.0, reverbDiffusion: 0.95, reverbModulation: 0.8,
      predelay: 40, damping: 0.06, width: 1.0,
      reverbShimmer: 0.15, reverbShimmerPitch: -5,
      reverbSlowModRate: 0.03, reverbSlowModDepth: 0.6,
      reverbFreeze: false, reverbReverse: 0.1, reverbReverseLength: 2.5,
      reverbChorusRate: 0.35, reverbChorusDepth: 40,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.04, reverbDampHigh: 0.1, reverbCrossoverFreq: 400,
      reverbInputTone: -0.6, reverbShimmerFeedback: 0.3,
      reverbWarp: 0.85, reverbCrossFeed: 0.5,
      reverbEarlyReflections: 0, reverbAirAbsorption: 0.5, reverbSaturationMode: 'tube' as const,
    },
  },
  dattorroPlate: {
    label: 'Dattorro Plate',
    description: 'Classic Dattorro plate reverb — smooth, defined, musical',
    params: {
      reverbType: 'dattorroPlate' as SliderState['reverbType'],
      reverbDecay: 0.85, reverbSize: 1.0, reverbDiffusion: 0.8, reverbModulation: 0.3,
      predelay: 15, damping: 0.3, width: 0.9,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.5, reverbChorusDepth: 12,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.35, reverbCrossoverFreq: 1200,
      reverbInputTone: 0.1, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.4, reverbAirAbsorption: 0.15, reverbSaturationMode: 'clean' as const,
    },
  },
  dattorroShimmer: {
    label: 'Dattorro Shimmer',
    description: 'Dattorro engine with high diffusion + detuning modulation',
    params: {
      reverbType: 'dattorroShimmer' as SliderState['reverbType'],
      reverbDecay: 0.92, reverbSize: 1.5, reverbDiffusion: 0.95, reverbModulation: 0.6,
      predelay: 30, damping: 0.15, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.04, reverbSlowModDepth: 0.3,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.4, reverbChorusDepth: 20,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.2, reverbCrossoverFreq: 900,
      reverbInputTone: 0, reverbShimmerFeedback: 0,
      reverbWarp: 0.3, reverbCrossFeed: 0.15,
      reverbEarlyReflections: 0.2, reverbAirAbsorption: 0.2, reverbSaturationMode: 'clean' as const,
    },
  },
  eventHorizon: {
    label: 'Event Horizon',
    description: 'Edge of infinite — extreme cross-feed + allpass smearing',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.995, reverbSize: 10.0, reverbDiffusion: 1.0, reverbModulation: 0.5,
      predelay: 120, damping: 0.03, width: 1.0,
      reverbShimmer: 0.4, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.01, reverbSlowModDepth: 0.9,
      reverbFreeze: false, reverbReverse: 0.5, reverbReverseLength: 5.0,
      reverbChorusRate: 0.15, reverbChorusDepth: 38,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.02, reverbDampHigh: 0.08, reverbCrossoverFreq: 350,
      reverbInputTone: -0.7, reverbShimmerFeedback: 0.7,
      reverbWarp: 0.5, reverbCrossFeed: 0.6,
      reverbEarlyReflections: 0, reverbAirAbsorption: 0.6, reverbSaturationMode: 'tube' as const,
    },
  },
  // ═══ Experimental — even-harmonic / pleasant ═══
  warmTapeRoom: {
    label: 'Warm Tape Room',
    description: 'Intimate room through tape — 2nd harmonic warmth, rich early reflections',
    params: {
      reverbType: 'plate' as SliderState['reverbType'],
      reverbDecay: 0.72, reverbSize: 0.9, reverbDiffusion: 0.75, reverbModulation: 0.2,
      predelay: 12, damping: 0.15, width: 0.7,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.08, reverbSlowModDepth: 0.15,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.9, reverbChorusDepth: 6,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.25, reverbCrossoverFreq: 1800,
      reverbInputTone: -0.1, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0.08,
      reverbEarlyReflections: 0.7, reverbAirAbsorption: 0.25, reverbSaturationMode: 'tape' as const,
    },
  },
  silkCloud: {
    label: 'Silk Cloud',
    description: 'Ultra-smooth wash — heavy air absorption absorbs all harshness',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.93, reverbSize: 3.5, reverbDiffusion: 1.0, reverbModulation: 0.25,
      predelay: 90, damping: 0.05, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.02, reverbSlowModDepth: 0.4,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.3, reverbChorusDepth: 14,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.0, reverbDampHigh: 0.08, reverbCrossoverFreq: 600,
      reverbInputTone: -0.3, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0.2,
      reverbEarlyReflections: 0.15, reverbAirAbsorption: 0.7, reverbSaturationMode: 'clean' as const,
    },
  },
  amberHall: {
    label: 'Amber Hall',
    description: 'Golden wooden hall — tape warmth with defined early reflections',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.87, reverbSize: 1.6, reverbDiffusion: 0.82, reverbModulation: 0.35,
      predelay: 25, damping: 0.2, width: 0.85,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.04, reverbSlowModDepth: 0.25,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.6, reverbChorusDepth: 10,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.12, reverbDampHigh: 0.35, reverbCrossoverFreq: 1400,
      reverbInputTone: -0.15, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0.12,
      reverbEarlyReflections: 0.55, reverbAirAbsorption: 0.3, reverbSaturationMode: 'tape' as const,
    },
  },
  velvetFog: {
    label: 'Velvet Fog',
    description: 'Dense enveloping fog — extreme diffusion + air absorption, no edges',
    params: {
      reverbType: 'darkHall' as SliderState['reverbType'],
      reverbDecay: 0.95, reverbSize: 4.0, reverbDiffusion: 1.0, reverbModulation: 0.45,
      predelay: 65, damping: 0.03, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.015, reverbSlowModDepth: 0.5,
      reverbFreeze: false, reverbReverse: 0.1, reverbReverseLength: 3.0,
      reverbChorusRate: 0.2, reverbChorusDepth: 22,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.12, reverbCrossoverFreq: 450,
      reverbInputTone: -0.5, reverbShimmerFeedback: 0,
      reverbWarp: 0.05, reverbCrossFeed: 0.35,
      reverbEarlyReflections: 0.05, reverbAirAbsorption: 0.8, reverbSaturationMode: 'tape' as const,
    },
  },
  glassCathedral: {
    label: 'Glass Cathedral',
    description: 'Crystalline Dattorro — strong early reflections, zero saturation',
    params: {
      reverbType: 'dattorroPlate' as SliderState['reverbType'],
      reverbDecay: 0.88, reverbSize: 1.8, reverbDiffusion: 0.9, reverbModulation: 0.4,
      predelay: 35, damping: 0.18, width: 0.95,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.05, reverbSlowModDepth: 0.1,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.7, reverbChorusDepth: 8,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.22, reverbCrossoverFreq: 1600,
      reverbInputTone: 0.15, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0.05,
      reverbEarlyReflections: 0.65, reverbAirAbsorption: 0.12, reverbSaturationMode: 'clean' as const,
    },
  },
  honeyDrip: {
    label: 'Honey Drip',
    description: 'Sweet slow bloom — long predelay into tape-warm decay',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.91, reverbSize: 2.2, reverbDiffusion: 0.88, reverbModulation: 0.3,
      predelay: 140, damping: 0.1, width: 0.9,
      reverbShimmer: 0.1, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.025, reverbSlowModDepth: 0.35,
      reverbFreeze: false, reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.35, reverbChorusDepth: 16,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.06, reverbDampHigh: 0.18, reverbCrossoverFreq: 900,
      reverbInputTone: -0.2, reverbShimmerFeedback: 0.1,
      reverbWarp: 0, reverbCrossFeed: 0.18,
      reverbEarlyReflections: 0.35, reverbAirAbsorption: 0.4, reverbSaturationMode: 'tape' as const,
    },
  },
  moonlitLake: {
    label: 'Moonlit Lake',
    description: 'Wide contemplative space — gentle reverse ripples, natural air',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.9, reverbSize: 2.5, reverbDiffusion: 0.85, reverbModulation: 0.35,
      predelay: 55, damping: 0.15, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.03, reverbSlowModDepth: 0.45,
      reverbFreeze: false, reverbReverse: 0.2, reverbReverseLength: 2.5,
      reverbChorusRate: 0.4, reverbChorusDepth: 18,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.28, reverbCrossoverFreq: 750,
      reverbInputTone: -0.15, reverbShimmerFeedback: 0,
      reverbWarp: 0, reverbCrossFeed: 0.25,
      reverbEarlyReflections: 0.4, reverbAirAbsorption: 0.45, reverbSaturationMode: 'tape' as const,
    },
  },
};

// ═══ Props ═══

export interface ReverbPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  };
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  SelectComponent: React.ComponentType<Record<string, unknown>>;
}

// ═══ Component ═══

export default function ReverbPage({
  state,
  isMobile: _isMobile,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent,
  SelectComponent,
}: ReverbPageProps) {
  // Local expand/collapse state for cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(['core', 'mod']),
  );

  const toggleCard = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Cast components so TS allows our props
  const Slider = SliderComponent as React.ComponentType<{
    label: string;
    value: number;
    paramKey: keyof SliderState;
    unit?: string;
    onChange: (key: keyof SliderState, value: number) => void;
    mode?: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode?: (key: keyof SliderState) => void;
    onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
  }>;

  const Select = SelectComponent as React.ComponentType<{
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }>;

  // Helper to spread slider props
  function sp(key: keyof SliderState) {
    return sliderProps(key);
  }

  return (
    <div className="reverb-root">
      <div className="reverb-container">

        {/* ════ LEFT: Core Reverb ════ */}
        <div className="reverb-left">
          <div
            className={`reverb-card${expandedCards.has('core') ? ' expanded' : ''}`}
            style={{ '--sc': '#8b5cf6' } as React.CSSProperties}
          >
            <div className="reverb-card-header" onClick={() => toggleCard('core')}>
              <span className="rc-name">Reverb</span>
              <span className="rc-chevron">{expandedCards.has('core') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('core') && (
              <div className="reverb-card-body">
                {/* Active toggle */}
                <div className="app-slider-group" style={{ marginBottom: 10 }}>
                  <div className="app-slider-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: 4 }}>
                    <span>Reverb</span>
                    <span style={{
                      color: state.reverbEnabled ? '#10b981' : '#6b7280',
                      fontWeight: 'bold',
                    }}>
                      {state.reverbEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <button
                    className={`reverb-toggle ${state.reverbEnabled ? 'active' : 'inactive'}`}
                    onClick={() => onSelectChange('reverbEnabled', !state.reverbEnabled)}
                  >
                    {state.reverbEnabled ? '● Active' : '○ Bypassed (saves CPU)'}
                  </button>
                </div>

                <Select
                  label="Engine"
                  value={state.reverbEngine}
                  options={[
                    { value: 'algorithmic', label: 'Algorithmic' },
                    { value: 'convolution', label: 'Convolution (HQ)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbEngine', v as SliderState['reverbEngine'])}
                />
                <Select
                  label="Type"
                  value={state.reverbType}
                  options={[
                    { value: 'plate', label: 'Plate' },
                    { value: 'hall', label: 'Hall' },
                    { value: 'cathedral', label: 'Cathedral' },
                    { value: 'darkHall', label: 'Dark Hall' },
                    { value: 'dattorroPlate', label: 'Dattorro Plate' },
                    { value: 'dattorroShimmer', label: 'Dattorro Shimmer' },
                  ]}
                  onChange={(v) => onSelectChange('reverbType', v as SliderState['reverbType'])}
                />
                <Select
                  label="Quality"
                  value={state.reverbQuality}
                  options={[
                    { value: 'ultra', label: 'Ultra (16-ch FDN + mid diffusion)' },
                    { value: 'balanced', label: 'Balanced (8-ch FDN)' },
                    { value: 'lite', label: 'Lite (4-ch, saves CPU)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbQuality', v as SliderState['reverbQuality'])}
                />

                <Slider label="Decay" value={state.reverbDecay} paramKey="reverbDecay" onChange={onParamChange} {...sp('reverbDecay')} />
                <Slider label="Size" value={state.reverbSize} paramKey="reverbSize" onChange={onParamChange} {...sp('reverbSize')} />
                <Slider label="Diffusion" value={state.reverbDiffusion} paramKey="reverbDiffusion" onChange={onParamChange} {...sp('reverbDiffusion')} />
              </div>
            )}
          </div>
        </div>

        {/* ════ RIGHT: Mod & Character ════ */}
        <div className="reverb-right">
          <div
            className={`reverb-card${expandedCards.has('mod') ? ' expanded' : ''}`}
            style={{ '--sc': '#f59e0b' } as React.CSSProperties}
          >
            <div className="reverb-card-header" onClick={() => toggleCard('mod')}>
              <span className="rc-name">Mod &amp; Character</span>
              <span className="rc-chevron">{expandedCards.has('mod') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('mod') && (
              <div className="reverb-card-body">
                {/* Character Presets */}
                <div style={{ marginBottom: 10 }}>
                  <div className="reverb-subsection" style={{ marginTop: 0 }}>Character Preset</div>
                  <div className="reverb-preset-grid">
                    {Object.entries(REVERB_CHARACTER_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        className="reverb-preset-btn"
                        title={preset.description}
                        onClick={() => {
                          for (const [k, v] of Object.entries(preset.params)) {
                            onSelectChange(k as keyof SliderState, v as SliderState[keyof SliderState]);
                          }
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Core mod params */}
                <Slider label="Modulation" value={state.reverbModulation} paramKey="reverbModulation" onChange={onParamChange} {...sp('reverbModulation')} />
                <Slider label="Pre-delay" value={state.predelay} paramKey="predelay" unit="ms" onChange={onParamChange} {...sp('predelay')} />
                <Slider label="Damping" value={state.damping} paramKey="damping" onChange={onParamChange} {...sp('damping')} />
                <Slider label="Width" value={state.width} paramKey="width" onChange={onParamChange} {...sp('width')} />

                {/* Shimmer */}
                <div className="reverb-subsection">Shimmer</div>
                <Slider label="Shimmer" value={state.reverbShimmer} paramKey="reverbShimmer" onChange={onParamChange} {...sp('reverbShimmer')} />
                <Slider label="Shimmer Pitch" value={state.reverbShimmerPitch} paramKey="reverbShimmerPitch" unit="st" onChange={onParamChange} {...sp('reverbShimmerPitch')} />
                <Slider label="Shimmer Feedback" value={state.reverbShimmerFeedback} paramKey="reverbShimmerFeedback" onChange={onParamChange} {...sp('reverbShimmerFeedback')} />

                {/* Chorus & Modulation Character */}
                <div className="reverb-subsection">Chorus &amp; Mod Character</div>
                <Select
                  label="Mod Character"
                  value={state.reverbModCharacter}
                  options={[
                    { value: 'sine', label: 'Sine (smooth)' },
                    { value: 'drift', label: 'Drift (organic)' },
                    { value: 'hybrid', label: 'Hybrid (sine + drift)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbModCharacter', v as SliderState['reverbModCharacter'])}
                />
                <Slider label="Chorus Rate" value={state.reverbChorusRate} paramKey="reverbChorusRate" unit="Hz" onChange={onParamChange} {...sp('reverbChorusRate')} />
                <Slider label="Chorus Depth" value={state.reverbChorusDepth} paramKey="reverbChorusDepth" unit="smp" onChange={onParamChange} {...sp('reverbChorusDepth')} />

                {/* Multi-band Damping */}
                <div className="reverb-subsection">Multi-band Damping</div>
                <Slider label="Damp Low" value={state.reverbDampLow} paramKey="reverbDampLow" onChange={onParamChange} {...sp('reverbDampLow')} />
                <Slider label="Damp High" value={state.reverbDampHigh} paramKey="reverbDampHigh" onChange={onParamChange} {...sp('reverbDampHigh')} />
                <Slider label="Crossover" value={state.reverbCrossoverFreq} paramKey="reverbCrossoverFreq" unit="Hz" onChange={onParamChange} {...sp('reverbCrossoverFreq')} />

                {/* Input Tone */}
                <div className="reverb-subsection">Input Tone</div>
                <Slider label="Tone" value={state.reverbInputTone} paramKey="reverbInputTone" onChange={onParamChange} {...sp('reverbInputTone')} />

                {/* Slow Modulation */}
                <div className="reverb-subsection">Slow Modulation</div>
                <Slider label="Mod Rate" value={state.reverbSlowModRate} paramKey="reverbSlowModRate" unit="Hz" onChange={onParamChange} {...sp('reverbSlowModRate')} />
                <Slider label="Mod Depth" value={state.reverbSlowModDepth} paramKey="reverbSlowModDepth" onChange={onParamChange} {...sp('reverbSlowModDepth')} />

                {/* Special */}
                <div className="reverb-subsection">Special</div>
                <Slider label="Warp" value={state.reverbWarp} paramKey="reverbWarp" onChange={onParamChange} {...sp('reverbWarp')} />
                <Slider label="Cross-Feed" value={state.reverbCrossFeed} paramKey="reverbCrossFeed" onChange={onParamChange} {...sp('reverbCrossFeed')} />

                {/* v4: Spatial & Character */}
                <div className="reverb-subsection">Spatial &amp; Character</div>
                <Slider label="Early Reflections" value={state.reverbEarlyReflections} paramKey="reverbEarlyReflections" onChange={onParamChange} {...sp('reverbEarlyReflections')} />
                <Slider label="Air Absorption" value={state.reverbAirAbsorption} paramKey="reverbAirAbsorption" onChange={onParamChange} {...sp('reverbAirAbsorption')} />
                <Select
                  label="Saturation"
                  value={state.reverbSaturationMode}
                  options={[
                    { value: 'clean', label: 'Clean (transparent)' },
                    { value: 'tape', label: 'Tape (warm harmonics)' },
                    { value: 'tube', label: 'Tube (soft saturation)' },
                  ]}
                  onChange={(v) => onSelectChange('reverbSaturationMode', v as SliderState['reverbSaturationMode'])}
                />

                <Slider label="Reverse Mix" value={state.reverbReverse} paramKey="reverbReverse" onChange={onParamChange} {...sp('reverbReverse')} />
                {state.reverbReverse > 0 && (
                  <Slider label="Reverse Length" value={state.reverbReverseLength} paramKey="reverbReverseLength" unit="s" onChange={onParamChange} {...sp('reverbReverseLength')} />
                )}

                {/* Freeze toggle */}
                <div className="app-slider-group" style={{ marginTop: 8 }}>
                  <div className="app-slider-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: 4 }}>
                    <span>Freeze</span>
                    <span style={{
                      color: state.reverbFreeze ? '#60a5fa' : '#6b7280',
                      fontWeight: 'bold',
                    }}>
                      {state.reverbFreeze ? 'FROZEN' : 'OFF'}
                    </span>
                  </div>
                  <button
                    className={`reverb-toggle ${state.reverbFreeze ? 'freeze-on' : 'freeze-off'}`}
                    onClick={() => onSelectChange('reverbFreeze', !state.reverbFreeze)}
                  >
                    {state.reverbFreeze ? '❄ Infinite Sustain' : '○ Normal Decay'}
                  </button>
                </div>

                {/* Freeze sub-params — only shown when freeze is on */}
                {state.reverbFreeze && (
                  <>
                    <Slider label="Input Bleed" value={state.reverbFreezeInputBleed} paramKey="reverbFreezeInputBleed" onChange={onParamChange} {...sp('reverbFreezeInputBleed')} />
                    <Slider label="Mod Attenuation" value={state.reverbFreezeModAtten} paramKey="reverbFreezeModAtten" onChange={onParamChange} {...sp('reverbFreezeModAtten')} />
                    <Slider label="Velvet Density" value={state.reverbFreezeVelvetDensity} paramKey="reverbFreezeVelvetDensity" onChange={onParamChange} {...sp('reverbFreezeVelvetDensity')} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
