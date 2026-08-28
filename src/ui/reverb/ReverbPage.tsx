/**
 * ReverbPage — Two-card layout for reverb controls
 *
 * Left card  : Core reverb (Active, Engine, Type, Quality, Decay, Size, Diffusion)
 * Right card : Mod & Character (Presets, Modulation, Pre-delay, Damping, Width,
 *              Shimmer, Slow Mod, Reverse, Spectral Freeze)
 *
 * Follows SynthPage / EarthPage / GranularPage pattern: dedicated component with
 * own CSS, receives SliderComponent, SelectComponent, sliderProps, onParamChange
 * as props from App.tsx.
 */

import React, { useState, useCallback } from 'react';
import { DEFAULT_STATE, type SliderState } from '../state';
import type { SliderRendererProps, SliderRuntimeRendererProps } from '../sliderSystem';
import type { SelectRenderer } from '../../app/AppControls';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import ReverbEnvelopeCanvas from './ReverbEnvelopeCanvas';
import SpectralFreezeCard from './SpectralFreezeCard';
import { nextSpectralFreezeCaptureSerial } from '../spectralFreezeGesture';
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.5, reverbChorusDepth: 12,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.3, reverbCrossoverFreq: 800,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.3, reverbAirAbsorption: 0.2, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.7, reverbChorusDepth: 18,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.2, reverbCrossoverFreq: 1200,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.15,
      reverbEarlyReflections: 0.2, reverbAirAbsorption: 0.15, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
    },
  },
  blackhole: {
    label: 'Blackhole',
    description: 'Massive infinite-like space with warp drift + dark tone',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.98, reverbSize: 6.0, reverbDiffusion: 1.0, reverbModulation: 0.65,
      predelay: 80, damping: 0.08, width: 1.0,
      reverbShimmer: 0.08, reverbShimmerPitch: 5,
      reverbSlowModRate: 0.02, reverbSlowModDepth: 0.7,
      reverbReverse: 0.4, reverbReverseLength: 3.5,
      reverbChorusRate: 0.3, reverbChorusDepth: 30,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.15, reverbCrossoverFreq: 600,
      reverbBloom: -0.82,
      reverbWarp: 0.4, reverbCrossFeed: 0.3,
      reverbEarlyReflections: 0, reverbAirAbsorption: 0.55, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0.15, reverbReverseLength: 2.5,
      reverbChorusRate: 0.4, reverbChorusDepth: 20,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.15, reverbDampHigh: 0.45, reverbCrossoverFreq: 700,
      reverbBloom: 0,
      reverbWarp: 0.1, reverbCrossFeed: 0.2,
      reverbEarlyReflections: 0.25, reverbAirAbsorption: 0.35, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
    },
  },
  lossyFreeze: {
    label: 'Slushy Memory',
    description: 'Slushy spectral freeze — held pad with slow spectral ooze (Chase Bliss Lossy style)',
    params: {
      // Spectral freeze: slushy, held indefinitely, slow spectral drift
      spectralFreezeEnabled: true,
      spectralFreezeActive: false,
      spectralFreezeMode: 'slushy',
      spectralFreezeCaptureSerial: 0,
      spectralFreezeRefresh: 0.18,
      spectralFreezeInputSensitivity: 0.65,
      spectralFreezeMix: 1.0,
      spectralFreezeSustain: 0.95,
      spectralFreezeDiffusion: 0.45,
      spectralFreezeTone: -0.2,
      spectralFreezeWidth: 0.8,
      spectralFreezeRouting: 'pre' as const,
      spectralFreezeReverbCrossfade: 1.0,
      // Reverb: long warm tail to bloom the frozen pad
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.93, reverbSize: 2.5, reverbDiffusion: 0.95, reverbModulation: 0.35,
      predelay: 80, damping: 0.15, width: 1.0,
      reverbShimmer: 0, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.03, reverbSlowModDepth: 0.3,
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.4, reverbChorusDepth: 15,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.2, reverbCrossoverFreq: 900,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.1,
      reverbEarlyReflections: 0.2, reverbAirAbsorption: 0.15, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
    },
  },
  stretchFreeze: {
    label: 'Stretch Freeze',
    description: 'Slow ping-pong scan through the rolling spectral memory',
    params: {
      spectralFreezeEnabled: true,
      spectralFreezeActive: false,
      spectralFreezeMode: 'stretch',
      spectralFreezeCaptureSerial: 0,
      spectralFreezeStretchSpeed: 0.5,
      spectralFreezeDirection: 'pingpong',
      spectralFreezePosition: 0,
      spectralFreezeMix: 1,
      spectralFreezeSustain: 1,
      spectralFreezeDiffusion: 0.6,
      spectralFreezeTone: -0.15,
      spectralFreezeWidth: 0.85,
      spectralFreezeRouting: 'pre',
      spectralFreezeReverbCrossfade: 1,
    },
  },
  livingStretch: {
    label: 'Living Stretch',
    description: 'A stretched memory that slowly absorbs new spectral detail',
    params: {
      spectralFreezeEnabled: true,
      spectralFreezeActive: false,
      spectralFreezeMode: 'livingStretch',
      spectralFreezeCaptureSerial: 0,
      spectralFreezeStretchSpeed: 0.333333,
      spectralFreezeDirection: 'pingpong',
      spectralFreezePosition: 0,
      spectralFreezeRefresh: 0.12,
      spectralFreezeInputSensitivity: 0.7,
      spectralFreezeMix: 1,
      spectralFreezeSustain: 1,
      spectralFreezeDiffusion: 0.65,
      spectralFreezeTone: -0.2,
      spectralFreezeWidth: 0.9,
      spectralFreezeRouting: 'pre',
      spectralFreezeReverbCrossfade: 1,
    },
  },
  reverseWash: {
    label: 'Reverse Wash',
    description: 'Heavy reverse tail with drift modulation for swell effects',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.88, reverbSize: 1.8, reverbDiffusion: 0.9, reverbModulation: 0.4,
      predelay: 30, damping: 0.25, width: 0.85,
      reverbShimmer: 0, reverbShimmerPitch: -12,
      reverbSlowModRate: 0.06, reverbSlowModDepth: 0.3,
      reverbReverse: 0.7, reverbReverseLength: 2.0,
      reverbChorusRate: 0.6, reverbChorusDepth: 25,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.35, reverbCrossoverFreq: 900,
      reverbBloom: -0.68,
      reverbWarp: 0.15, reverbCrossFeed: 0.1,
      reverbEarlyReflections: 0.02, reverbAirAbsorption: 0.28, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
    },
  },
  cosmicDrift: {
    label: 'Cosmic Drift',
    description: 'Deep slow-breathing space with compound shimmer and dark tone',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.94, reverbSize: 2.8, reverbDiffusion: 0.92, reverbModulation: 0.7,
      predelay: 70, damping: 0.12, width: 1.0,
      reverbShimmer: 0.12, reverbShimmerPitch: 19,
      reverbSlowModRate: 0.015, reverbSlowModDepth: 0.85,
      reverbReverse: 0.25, reverbReverseLength: 3.0,
      reverbChorusRate: 0.25, reverbChorusDepth: 35,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.2, reverbCrossoverFreq: 500,
      reverbBloom: -0.28,
      reverbWarp: 0.25, reverbCrossFeed: 0.35,
      reverbEarlyReflections: 0.02, reverbAirAbsorption: 0.45, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 1.2, reverbChorusDepth: 5,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.2, reverbDampHigh: 0.5, reverbCrossoverFreq: 2000,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.5, reverbAirAbsorption: 0.1, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
    },
  },
  supermassive: {
    label: 'Supermassive',
    description: 'Extreme warp + massive size — Valhalla Supermassive inspired',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.97, reverbSize: 8.0, reverbDiffusion: 1.0, reverbModulation: 0.6,
      predelay: 60, damping: 0.1, width: 1.0,
      reverbShimmer: 0.05, reverbShimmerPitch: 7,
      reverbSlowModRate: 0.025, reverbSlowModDepth: 0.5,
      reverbReverse: 0.2, reverbReverseLength: 4.0,
      reverbChorusRate: 0.2, reverbChorusDepth: 35,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.12, reverbCrossoverFreq: 500,
      reverbBloom: -0.2,
      reverbWarp: 0.6, reverbCrossFeed: 0.4,
      reverbEarlyReflections: 0.02, reverbAirAbsorption: 0.42, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
    },
  },
  gravityWell: {
    label: 'Glacial Pull',
    description: 'Inward dark wash — slow reverse pull with reduced room cues',
    params: {
      reverbType: 'hall' as SliderState['reverbType'],
      reverbDecay: 0.96, reverbSize: 5.0, reverbDiffusion: 0.95, reverbModulation: 0.8,
      predelay: 40, damping: 0.06, width: 1.0,
      reverbShimmer: 0.04, reverbShimmerPitch: -5,
      reverbSlowModRate: 0.03, reverbSlowModDepth: 0.6,
      reverbReverse: 0.1, reverbReverseLength: 2.5,
      reverbChorusRate: 0.35, reverbChorusDepth: 40,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.04, reverbDampHigh: 0.1, reverbCrossoverFreq: 400,
      reverbBloom: -0.72,
      reverbWarp: 0.85, reverbCrossFeed: 0.5,
      reverbEarlyReflections: 0, reverbAirAbsorption: 0.62, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.5, reverbChorusDepth: 12,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.1, reverbDampHigh: 0.35, reverbCrossoverFreq: 1200,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0,
      reverbEarlyReflections: 0.4, reverbAirAbsorption: 0.15, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.4, reverbChorusDepth: 20,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.2, reverbCrossoverFreq: 900,
      reverbBloom: 0,
      reverbWarp: 0.3, reverbCrossFeed: 0.15,
      reverbEarlyReflections: 0.2, reverbAirAbsorption: 0.2, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
    },
  },
  eventHorizon: {
    label: 'Event Horizon',
    description: 'Edge of infinite — extreme cross-feed + allpass smearing',
    params: {
      reverbType: 'cathedral' as SliderState['reverbType'],
      reverbDecay: 0.995, reverbSize: 10.0, reverbDiffusion: 1.0, reverbModulation: 0.5,
      predelay: 120, damping: 0.03, width: 1.0,
      reverbShimmer: 0.08, reverbShimmerPitch: 12,
      reverbSlowModRate: 0.01, reverbSlowModDepth: 0.9,
      reverbReverse: 0.5, reverbReverseLength: 5.0,
      reverbChorusRate: 0.15, reverbChorusDepth: 38,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.02, reverbDampHigh: 0.08, reverbCrossoverFreq: 350,
      reverbBloom: -0.9,
      reverbWarp: 0.5, reverbCrossFeed: 0.6,
      reverbEarlyReflections: 0, reverbAirAbsorption: 0.6, reverbSaturationMode: 'tube' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.9, reverbChorusDepth: 6,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.25, reverbCrossoverFreq: 1800,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.08,
      reverbEarlyReflections: 0.7, reverbAirAbsorption: 0.25, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.3, reverbChorusDepth: 14,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.0, reverbDampHigh: 0.08, reverbCrossoverFreq: 600,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.2,
      reverbEarlyReflections: 0.15, reverbAirAbsorption: 0.7, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.6, reverbChorusDepth: 10,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.12, reverbDampHigh: 0.35, reverbCrossoverFreq: 1400,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.12,
      reverbEarlyReflections: 0.55, reverbAirAbsorption: 0.3, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0.1, reverbReverseLength: 3.0,
      reverbChorusRate: 0.2, reverbChorusDepth: 22,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.12, reverbCrossoverFreq: 450,
      reverbBloom: 0,
      reverbWarp: 0.05, reverbCrossFeed: 0.35,
      reverbEarlyReflections: 0.05, reverbAirAbsorption: 0.8, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.7, reverbChorusDepth: 8,
      reverbModCharacter: 'sine' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.05, reverbDampHigh: 0.22, reverbCrossoverFreq: 1600,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.05,
      reverbEarlyReflections: 0.65, reverbAirAbsorption: 0.12, reverbSaturationMode: 'clean' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0, reverbReverseLength: 2,
      reverbChorusRate: 0.35, reverbChorusDepth: 16,
      reverbModCharacter: 'hybrid' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.06, reverbDampHigh: 0.18, reverbCrossoverFreq: 900,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.18,
      reverbEarlyReflections: 0.35, reverbAirAbsorption: 0.4, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
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
      reverbReverse: 0.2, reverbReverseLength: 2.5,
      reverbChorusRate: 0.4, reverbChorusDepth: 18,
      reverbModCharacter: 'drift' as SliderState['reverbModCharacter'],
      reverbDampLow: 0.08, reverbDampHigh: 0.28, reverbCrossoverFreq: 750,
      reverbBloom: 0,
      reverbWarp: 0, reverbCrossFeed: 0.25,
      reverbEarlyReflections: 0.4, reverbAirAbsorption: 0.45, reverbSaturationMode: 'tape' as const,
      reverbErLpFreq: 2500,
    },
  },
};

// ═══ Props ═══

export interface ReverbPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntimeRendererProps<keyof SliderState>;
  SliderComponent: React.ComponentType<SliderRendererProps<keyof SliderState>>;
  SelectComponent: SelectRenderer;
}

// ═══ Component ═══

export default function ReverbPage({
  state,
  isMobile,
  onParamChange,
  onSelectChange,
  onStateChange,
  sliderProps,
  SliderComponent,
  SelectComponent,
}: ReverbPageProps) {
  const [setupPresetName, setSetupPresetName] = useState<string | undefined>();
  const [setupPresetDescription, setSetupPresetDescription] = useState<string>('');
  const [visualizerEnabled, setVisualizerEnabled] = useState(() => !isMobile);
  const reverbLevel = state.reverbLevel ?? DEFAULT_STATE.reverbLevel;
  const reverbPreCompThreshold = state.reverbPreCompThreshold ?? DEFAULT_STATE.reverbPreCompThreshold;
  const reverbPreCompKnee = state.reverbPreCompKnee ?? DEFAULT_STATE.reverbPreCompKnee;
  const reverbPreCompRatio = state.reverbPreCompRatio ?? DEFAULT_STATE.reverbPreCompRatio;
  const reverbPreCompAttackMs = state.reverbPreCompAttackMs ?? DEFAULT_STATE.reverbPreCompAttackMs;
  const reverbPreCompReleaseMs = state.reverbPreCompReleaseMs ?? DEFAULT_STATE.reverbPreCompReleaseMs;
  const reverbPreCompMakeup = state.reverbPreCompMakeup ?? DEFAULT_STATE.reverbPreCompMakeup;

  const handleSetupPresetLoad = useCallback((entry: PresetEntry, _data: Record<string, unknown>) => {
    setSetupPresetName(entry.name);
    const currentVersion = entry.versions.find(version => version.v === entry.currentVersion);
    setSetupPresetDescription(entry.description ?? currentVersion?.note ?? '');
  }, []);

  const Slider = SliderComponent;

  const Select = SelectComponent;

  // Helper to spread slider props
  function sp(key: keyof SliderState) {
    return sliderProps(key);
  }

  return (
    <div className="reverb-root">

      <div className="reverb-container">

        {/* ════════════ LEFT COLUMN ════════════ */}
        <div className="reverb-left">

          {/* ═══ Global bar — Reverb FX ON/OFF + Freeze (left column only) ═══ */}
          <div className="reverb-global-bar fx-page-header">
            <span className="reverb-title fx-page-title">⊞ Reverb FX</span>
            <div className="fx-page-actions">
              <button
                className={`reverb-enable-btn${state.reverbEnabled ? ' on' : ''}`}
                onClick={() => onSelectChange('reverbEnabled', !state.reverbEnabled)}
                aria-pressed={Boolean(state.reverbEnabled)}
              >
                {state.reverbEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                className={`reverb-freeze-btn${(state.spectralFreezeEnabled && state.spectralFreezeActive) ? ' frozen' : ''}`}
                aria-pressed={Boolean(state.spectralFreezeEnabled && state.spectralFreezeActive)}
                onClick={() => {
                  if (state.spectralFreezeEnabled && state.spectralFreezeActive) {
                    onSelectChange('spectralFreezeActive', false);
                    return;
                  }
                  onSelectChange('spectralFreezeEnabled', true);
                  onParamChange('spectralFreezeCaptureSerial', nextSpectralFreezeCaptureSerial(state.spectralFreezeCaptureSerial));
                  onSelectChange('spectralFreezeActive', true);
                }}
              >
                {(state.spectralFreezeEnabled && state.spectralFreezeActive) ? '❄ FROZEN' : '❄ Freeze'}
              </button>
            </div>
          </div>

          {/* ── Preset card (matches Granular preset card) ── */}
          <div className="reverb-section-card reverb-preset-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Preset</span>
              <span className="reverb-section-note">Save or recall the full reverb setup</span>
            </div>
            <div className="reverb-preset-body">
              <PresetDropdown
                className="reverb-preset-toolbar"
                level="source"
                scope="reverb"
                state={state}
                currentName={setupPresetName}
                onLoad={handleSetupPresetLoad}
                onStateChange={onStateChange}
                compact
              />

              <div className="reverb-preset-meta">
                <div className="reverb-preset-description">
                  {setupPresetDescription || (setupPresetName ? 'No description saved for this preset.' : 'Load a reverb preset to view its description.')}
                </div>
              </div>
            </div>
          </div>

          {/* ── Core Reverb card ── */}
          <div className="reverb-section-card reverb-core-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Core</span>
              <span className="reverb-section-note">Engine, type, decay shape</span>
            </div>
            <div className="reverb-section-body">
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

              <div className="reverb-grid-2">
                <Slider label="Return" value={reverbLevel} paramKey="reverbLevel" onChange={onParamChange} {...sp('reverbLevel')} />
                <Slider label="Decay" value={state.reverbDecay} paramKey="reverbDecay" onChange={onParamChange} {...sp('reverbDecay')} />
              </div>
              <div className="reverb-grid-2">
                <Slider label="Size" value={state.reverbSize} paramKey="reverbSize" onChange={onParamChange} {...sp('reverbSize')} />
                <Slider label="Diffusion" value={state.reverbDiffusion} paramKey="reverbDiffusion" onChange={onParamChange} {...sp('reverbDiffusion')} />
              </div>
            </div>
          </div>

        </div>

        {/* ════════════ RIGHT COLUMN ════════════ */}
        <div className="reverb-right">
          <div className="reverb-right-grid">

          {/* ── 1. Visualizer card ── */}
          <div className="reverb-section-card reverb-visualizer-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Visualizer</span>
              <span className="reverb-section-note">Tail map, diffusion spread, freeze state</span>
            </div>
            <div className="reverb-section-body">
              <div className="reverb-visualizer-meta" aria-label="Reverb visualizer status">
                <span className="reverb-viz-pill">{state.reverbEngine === 'convolution' ? 'Convolution' : 'Algorithmic'}</span>
                <span className="reverb-viz-pill">{state.reverbQuality}</span>
                <span className="reverb-viz-pill">Pre {Math.round(state.predelay)}ms</span>
                <span className="reverb-viz-pill">Tail {Math.round(state.reverbDecay * 100)}%</span>
              </div>
              {visualizerEnabled ? (
                <ReverbEnvelopeCanvas
                  engine={state.reverbEngine}
                  quality={state.reverbQuality}
                  decay={state.reverbDecay}
                  size={state.reverbSize}
                  diffusion={state.reverbDiffusion}
                  modulation={state.reverbModulation}
                  predelay={state.predelay}
                  damping={state.damping}
                  width={state.width}
                  shimmer={state.reverbShimmer}
                  shimmerPitch={state.reverbShimmerPitch}
                  reverse={state.reverbReverse}
                  reverseLength={state.reverbReverseLength}
                  earlyReflections={state.reverbEarlyReflections}
                  airAbsorption={state.reverbAirAbsorption}
                  dampLow={state.reverbDampLow}
                  dampHigh={state.reverbDampHigh}
                  inputTone={state.reverbInputTone}
                  warp={state.reverbWarp}
                  saturationMode={state.reverbSaturationMode}
                  frozen={!!(state.spectralFreezeEnabled && state.spectralFreezeActive)}
                  enabled={state.reverbEnabled}
                  chorusDepth={state.reverbChorusDepth}
                  slowModDepth={state.reverbSlowModDepth}
                />
              ) : (
                <div className="reverb-visualizer-meta" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span>Mobile default keeps the tail visualizer off to reduce layout and canvas work.</span>
                  <button
                    type="button"
                    className="reverb-mode-btn active"
                    onClick={() => setVisualizerEnabled(true)}
                  >
                    Enable Visualizer
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── 2. Spatial & Character card ── */}
          <div className="reverb-section-card reverb-spatial-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Spatial &amp; Character</span>
              <span className="reverb-section-note">Room shape and texture</span>
            </div>
            <div className="reverb-section-body">
              <div className="reverb-grid-2">
                <Slider label="Early Reflections" value={state.reverbEarlyReflections} paramKey="reverbEarlyReflections" onChange={onParamChange} {...sp('reverbEarlyReflections')} />
                <Slider label="ER LP Freq" value={state.reverbErLpFreq} paramKey="reverbErLpFreq" onChange={onParamChange} unit="Hz" {...sp('reverbErLpFreq')} />
              </div>
              <div className="reverb-grid-2">
                <Slider label="Air Absorption" value={state.reverbAirAbsorption} paramKey="reverbAirAbsorption" onChange={onParamChange} {...sp('reverbAirAbsorption')} />
                <Slider label="Transient Smooth" value={state.reverbTransientSmooth} paramKey="reverbTransientSmooth" onChange={onParamChange} {...sp('reverbTransientSmooth')} />
              </div>
            </div>
          </div>

          {/* ── 3. Input Dynamics card ── */}
          <div className="reverb-section-card reverb-dynamics-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Input Dynamics</span>
              <span className="reverb-section-note">Level the hit before it blooms into the tank</span>
            </div>
            <div className="reverb-section-body">
              <div className="reverb-grid-2">
                <Slider label="Threshold" value={reverbPreCompThreshold} paramKey="reverbPreCompThreshold" unit="dB" onChange={onParamChange} {...sp('reverbPreCompThreshold')} />
                <Slider label="Knee" value={reverbPreCompKnee} paramKey="reverbPreCompKnee" unit="dB" onChange={onParamChange} {...sp('reverbPreCompKnee')} />
              </div>
              <div className="reverb-grid-2">
                <Slider label="Ratio" value={reverbPreCompRatio} paramKey="reverbPreCompRatio" onChange={onParamChange} {...sp('reverbPreCompRatio')} />
                <Slider label="Makeup" value={reverbPreCompMakeup} paramKey="reverbPreCompMakeup" unit="x" onChange={onParamChange} {...sp('reverbPreCompMakeup')} />
              </div>
              <div className="reverb-grid-2">
                <Slider label="Attack" value={reverbPreCompAttackMs} paramKey="reverbPreCompAttackMs" unit="ms" onChange={onParamChange} {...sp('reverbPreCompAttackMs')} />
                <Slider label="Release" value={reverbPreCompReleaseMs} paramKey="reverbPreCompReleaseMs" unit="ms" onChange={onParamChange} {...sp('reverbPreCompReleaseMs')} />
              </div>
            </div>
          </div>

          {/* ── 4. Modulation card ── */}
          <div className="reverb-section-card reverb-modulation-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Modulation</span>
              <span className="reverb-section-note">Movement and animation within the tail</span>
            </div>
            <div className="reverb-section-body">
              <Slider label="Modulation" value={state.reverbModulation} paramKey="reverbModulation" onChange={onParamChange} {...sp('reverbModulation')} />

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

              <div className="reverb-subsection">Chorus</div>
              <div className="reverb-grid-2">
                <Slider label="Rate" value={state.reverbChorusRate} paramKey="reverbChorusRate" unit="Hz" onChange={onParamChange} {...sp('reverbChorusRate')} />
                <Slider label="Depth" value={state.reverbChorusDepth} paramKey="reverbChorusDepth" unit="smp" onChange={onParamChange} {...sp('reverbChorusDepth')} />
              </div>

              <div className="reverb-subsection">Slow Mod</div>
              <div className="reverb-grid-2">
                <Slider label="Rate" value={state.reverbSlowModRate} paramKey="reverbSlowModRate" unit="Hz" onChange={onParamChange} {...sp('reverbSlowModRate')} />
                <Slider label="Depth" value={state.reverbSlowModDepth} paramKey="reverbSlowModDepth" onChange={onParamChange} {...sp('reverbSlowModDepth')} />
              </div>
            </div>
          </div>

          {/* ── 5. Tone & Damping card ── */}
          <div className="reverb-section-card reverb-tone-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Tone &amp; Damping</span>
              <span className="reverb-section-note">Colour and frequency shaping</span>
            </div>
            <div className="reverb-section-body">
              <div className="reverb-grid-2">
                <Slider label="Pre-delay" value={state.predelay} paramKey="predelay" unit="ms" onChange={onParamChange} {...sp('predelay')} />
                <Slider label="Width" value={state.width} paramKey="width" onChange={onParamChange} {...sp('width')} />
              </div>
              <div className="reverb-grid-2">
                <Slider label="Damping" value={state.damping} paramKey="damping" onChange={onParamChange} {...sp('damping')} />
                <Slider label="Input Tone" value={state.reverbInputTone} paramKey="reverbInputTone" onChange={onParamChange} {...sp('reverbInputTone')} />
              </div>

              <div className="reverb-subsection">Multi-band Damping</div>
              <div className="reverb-grid-2">
                <Slider label="Damp Low" value={state.reverbDampLow} paramKey="reverbDampLow" onChange={onParamChange} {...sp('reverbDampLow')} />
                <Slider label="Damp High" value={state.reverbDampHigh} paramKey="reverbDampHigh" onChange={onParamChange} {...sp('reverbDampHigh')} />
              </div>
              <div className="reverb-grid-2">
                <Slider label="Crossover" value={state.reverbCrossoverFreq} paramKey="reverbCrossoverFreq" unit="Hz" onChange={onParamChange} {...sp('reverbCrossoverFreq')} />
                <div className="reverb-select-wrap">
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
                </div>
              </div>
            </div>
          </div>

          {/* ── 6. Shimmer & Effects card ── */}
          <div className="reverb-section-card reverb-effects-card">
            <div className="reverb-section-head">
              <span className="reverb-section-title">Shimmer &amp; Effects</span>
              <span className="reverb-section-note">Pitched tails, warp, reverse</span>
            </div>
            <div className="reverb-section-body">
              <div className="reverb-grid-2">
                <Slider label="Shimmer" value={state.reverbShimmer} paramKey="reverbShimmer" onChange={onParamChange} {...sp('reverbShimmer')} />
                <Slider label="Reverse Mix" value={state.reverbReverse} paramKey="reverbReverse" onChange={onParamChange} {...sp('reverbReverse')} />
              </div>
              <Slider label="Bloom" value={state.reverbBloom} paramKey="reverbBloom" onChange={onParamChange} {...sp('reverbBloom')} />
              {state.reverbShimmer > 0 && (
                <div className="reverb-grid-2">
                  <Slider label="Pitch" value={state.reverbShimmerPitch} paramKey="reverbShimmerPitch" unit="st" onChange={onParamChange} {...sp('reverbShimmerPitch')} />
                  <Slider label="Feedback" value={state.reverbShimmerFeedback} paramKey="reverbShimmerFeedback" onChange={onParamChange} {...sp('reverbShimmerFeedback')} />
                </div>
              )}

              <div className="reverb-subsection">Harmony</div>
              <div className="reverb-mode-row reverb-mode-row-wrap">
                <button
                  className={`reverb-mode-btn${state.reverbScaleShimmer ? ' active' : ''}`}
                  title="Snap shimmer pitch to nearest scale interval"
                  onClick={() => onSelectChange('reverbScaleShimmer' as keyof SliderState, !state.reverbScaleShimmer as any)}
                >Scale</button>
                <button
                  className={`reverb-mode-btn${state.reverbChordWash ? ' active' : ''}`}
                  title="Boost shimmer on chord changes"
                  onClick={() => onSelectChange('reverbChordWash' as keyof SliderState, !state.reverbChordWash as any)}
                >Chord Wash</button>
                <button
                  className={`reverb-mode-btn${state.reverbResolutionBloom ? ' active' : ''}`}
                  title="Bloom decay and shimmer on tension resolution"
                  onClick={() => onSelectChange('reverbResolutionBloom' as keyof SliderState, !state.reverbResolutionBloom as any)}
                >Bloom</button>
              </div>

              <div className="reverb-subsection">Special</div>
              <div className="reverb-grid-2">
                <Slider label="Warp" value={state.reverbWarp} paramKey="reverbWarp" onChange={onParamChange} {...sp('reverbWarp')} />
                <Slider label="Cross-Feed" value={state.reverbCrossFeed} paramKey="reverbCrossFeed" onChange={onParamChange} {...sp('reverbCrossFeed')} />
              </div>

              {state.reverbReverse > 0 && (
                <Slider label="Reverse Length" value={state.reverbReverseLength} paramKey="reverbReverseLength" unit="s" onChange={onParamChange} {...sp('reverbReverseLength')} />
              )}
            </div>
          </div>

          <SpectralFreezeCard
            state={state}
            onParamChange={onParamChange}
            onSelectChange={onSelectChange}
            sliderProps={sliderProps}
            SliderComponent={SliderComponent}
            SelectComponent={SelectComponent}
          />

          </div>

        </div>

      </div>
    </div>
  );
}
