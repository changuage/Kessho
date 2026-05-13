import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DualSliderRange } from './DualSlider';
import {
  getParamInfo,
  type SliderMode,
  type SliderState,
} from './state';
import {
  getRuntimeSliderFlashing,
  getRuntimeSliderPosition,
  useRuntimeSliderVersion,
} from './runtimeSliderState';
import { JOURNEY_COLORS, SOURCE_COLORS } from '../designSystem/colors';

type PrototypeScenario = 'dense' | 'sparse' | 'full' | 'live';

type ArmSlot = 0 | 1 | 2 | 3 | 4 | 5;

type SourceFamily = 'synth' | 'lead' | 'drums' | 'granular' | 'earth' | 'other';

type SnowflakeFamily = 'stellarPlate' | 'fernDendrite' | 'sectoredPlate' | 'broadPlate' | 'needleStar';

interface SourceConfig {
  id: string;
  label: string;
  family: SourceFamily;
  color: string;
  levelKey: keyof SliderState;
  enabled: (state: SliderState) => boolean;
  score: (state: SliderState) => number;
  reverbKey?: keyof SliderState;
  delayAKey?: keyof SliderState;
  delayBKey?: keyof SliderState;
  granularKey?: keyof SliderState;
}

interface SourceVisual {
  id: string;
  label: string;
  family: SourceFamily;
  color: string;
  levelKey?: keyof SliderState;
  active: boolean;
  score: number;
  authoredNorm: number;
  runtimeNorm: number;
  rangeNorm: { min: number; max: number };
  trim: number;
  displayNorm: number;
  displayRange: { min: number; max: number };
  mode: SliderMode;
  flash: boolean;
  reverb: number;
  delayA: number;
  delayB: number;
  granular: number;
  members?: SourceVisual[];
}

interface ArmLayout {
  slot: ArmSlot;
  source: SourceVisual;
}

interface Point {
  x: number;
  y: number;
}

interface SnowflakeMorphology {
  seed: number;
  family: SnowflakeFamily;
  armFullness: number;
  branchCount: number;
  branchStart: number;
  branchEnd: number;
  branchAngle: number;
  secondaryAngle: number;
  tertiaryAngle: number;
  branchLength: number;
  branchTaper: number;
  branchJitter: number;
  stemWidth: number;
  branchWidth: number;
  plateStrength: number;
  plateRadius: number;
  ringCount: number;
  ringWeight: number;
  terminalScale: number;
  sideForkScale: number;
  crystalFill: number;
}

interface SnowflakePrototypePageProps {
  state: SliderState;
  dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  sliderModes: Record<string, SliderMode>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onBack: () => void;
  onShowAdvanced: () => void;
}

const SOURCE_CONFIGS: SourceConfig[] = [
  {
    id: 'pad1',
    label: 'Pad 1',
    family: 'synth',
    color: SOURCE_COLORS.pad1,
    levelKey: 'synthLevel',
    enabled: (state) => !!state.padEnabled,
    score: (state) => numericState(state, 'synthLevel'),
    reverbKey: 'pad1ReverbSend',
    delayAKey: 'pad1DelayASend',
    delayBKey: 'pad1DelayBSend',
    granularKey: 'granularPad1Send',
  },
  {
    id: 'pad2',
    label: 'Pad 2',
    family: 'synth',
    color: SOURCE_COLORS.pad2,
    levelKey: 'pad2Level',
    enabled: (state) => !!state.pad2Enabled,
    score: (state) => numericState(state, 'pad2Level'),
    reverbKey: 'pad2ReverbSend',
    delayAKey: 'pad2DelayASend',
    delayBKey: 'pad2DelayBSend',
    granularKey: 'granularPad2Send',
  },
  {
    id: 'lead1',
    label: 'Lead 1',
    family: 'lead',
    color: SOURCE_COLORS.lead1,
    levelKey: 'lead1Level',
    enabled: (state) => !!state.leadEnabled,
    score: (state) => numericState(state, 'lead1Level'),
    reverbKey: 'lead1ReverbSend',
    delayAKey: 'lead1DelayASend',
    delayBKey: 'lead1DelayBSend',
    granularKey: 'granularLead1Send',
  },
  {
    id: 'lead2',
    label: 'Lead 2',
    family: 'lead',
    color: SOURCE_COLORS.lead2,
    levelKey: 'lead2Level',
    enabled: (state) => !!state.lead2Enabled,
    score: (state) => numericState(state, 'lead2Level'),
    reverbKey: 'lead2ReverbSend',
    delayAKey: 'lead2DelayASend',
    delayBKey: 'lead2DelayBSend',
    granularKey: 'granularLead2Send',
  },
  {
    id: 'piano',
    label: 'Piano',
    family: 'lead',
    color: SOURCE_COLORS.piano,
    levelKey: 'pianoLevel',
    enabled: (state) => !!state.pianoEnabled,
    score: (state) => numericState(state, 'pianoLevel'),
    reverbKey: 'pianoReverbSend',
    delayAKey: 'pianoDelayASend',
    delayBKey: 'pianoDelayBSend',
    granularKey: 'granularPianoSend',
  },
  {
    id: 'drums',
    label: 'Drums',
    family: 'drums',
    color: SOURCE_COLORS.drums,
    levelKey: 'drumLevel',
    enabled: (state) => !!state.drumEnabled,
    score: (state) => numericState(state, 'drumLevel'),
    reverbKey: 'drumReverbSend',
    delayAKey: 'drumDelayASend',
    delayBKey: 'drumDelayBSend',
    granularKey: 'granularDrumSend',
  },
  {
    id: 'granular',
    label: 'Granular',
    family: 'granular',
    color: SOURCE_COLORS.granular,
    levelKey: 'granularLevel',
    enabled: (state) => !!state.granularEnabled,
    score: (state) => numericState(state, 'granularLevel'),
    reverbKey: 'granularReverbSend',
    delayAKey: 'granularDelayASend',
    delayBKey: 'granularDelayBSend',
  },
  {
    id: 'waves',
    label: 'Waves',
    family: 'earth',
    color: SOURCE_COLORS.waves,
    levelKey: 'oceanSampleLevel',
    enabled: (state) => !!state.oceanSampleEnabled,
    score: (state) => numericState(state, 'earthLevel') * numericState(state, 'oceanSampleLevel'),
    reverbKey: 'oceanReverbSend',
    delayAKey: 'oceanDelayASend',
    delayBKey: 'oceanDelayBSend',
    granularKey: 'granularWavesSend',
  },
  {
    id: 'water',
    label: 'Water',
    family: 'earth',
    color: SOURCE_COLORS.water,
    levelKey: 'waterLevel',
    enabled: (state) => !!state.waterEnabled,
    score: (state) => numericState(state, 'earthLevel') * numericState(state, 'waterLevel'),
    reverbKey: 'waterReverbSend',
    delayAKey: 'waterDelayASend',
    delayBKey: 'waterDelayBSend',
    granularKey: 'granularWaterSend',
  },
  {
    id: 'nature',
    label: 'Nature',
    family: 'earth',
    color: SOURCE_COLORS.nature,
    levelKey: 'natureLevel',
    enabled: (state) => !!state.birdsEnabled || !!state.birds2Enabled || !!state.frogsEnabled,
    score: (state) => numericState(state, 'earthLevel') * numericState(state, 'natureLevel'),
    reverbKey: 'natureReverbSend',
    delayAKey: 'natureDelayASend',
    delayBKey: 'natureDelayBSend',
    granularKey: 'granularNatureSend',
  },
  {
    id: 'insects',
    label: 'Insects',
    family: 'earth',
    color: SOURCE_COLORS.insects,
    levelKey: 'insectsSharedLevel',
    enabled: (state) => !!state.insectsEnabled || !!state.insects2Enabled,
    score: (state) => {
      const layerLevel = Math.max(numericState(state, 'insectsLevel'), numericState(state, 'insects2Level'));
      return numericState(state, 'earthLevel') * numericState(state, 'insectsSharedLevel') * layerLevel;
    },
    reverbKey: 'insectsReverbSend',
    delayAKey: 'insDelayASend',
    delayBKey: 'insDelayBSend',
    granularKey: 'granularInsectsSend',
  },
];

const SLOT_SETS: Record<number, ArmSlot[]> = {
  0: [],
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

const DEMO_SOURCES: Record<Exclude<PrototypeScenario, 'live'>, SourceVisual[]> = {
  sparse: [
    demoSource({ id: 'drums', label: 'Drums', family: 'drums', color: SOURCE_COLORS.drums, score: 0.76, authoredNorm: 0.72, mode: 'sampleHold', rangeNorm: { min: 0.22, max: 0.84 }, reverb: 0.38, delayA: 0.64, delayB: 0.12, granular: 0.25 }),
    demoSource({ id: 'pad1', label: 'Pad 1', family: 'synth', color: SOURCE_COLORS.pad1, score: 0.64, authoredNorm: 0.62, mode: 'walk', rangeNorm: { min: 0.34, max: 0.78 }, reverb: 0.58, delayA: 0.18, delayB: 0.36, granular: 0.08 }),
    demoSource({ id: 'waves', label: 'Waves', family: 'earth', color: SOURCE_COLORS.waves, score: 0.46, authoredNorm: 0.44, mode: 'walk', rangeNorm: { min: 0.2, max: 0.55 }, reverb: 0.2, delayA: 0.08, delayB: 0.16, granular: 0.42 }),
  ],
  dense: [
    demoSource({ id: 'drums', label: 'Drums', family: 'drums', color: SOURCE_COLORS.drums, score: 0.86, authoredNorm: 0.78, mode: 'sampleHold', rangeNorm: { min: 0.25, max: 0.82 }, reverb: 0.44, delayA: 0.72, delayB: 0.22, granular: 0.32 }),
    demoSource({ id: 'pad1', label: 'Pad 1', family: 'synth', color: SOURCE_COLORS.pad1, score: 0.74, authoredNorm: 0.7, mode: 'walk', rangeNorm: { min: 0.4, max: 0.86 }, reverb: 0.68, delayA: 0.2, delayB: 0.38, granular: 0.14 }),
    demoSource({ id: 'lead1', label: 'Lead 1', family: 'lead', color: SOURCE_COLORS.lead1, score: 0.68, authoredNorm: 0.66, mode: 'single', rangeNorm: { min: 0.66, max: 0.66 }, reverb: 0.46, delayA: 0.55, delayB: 0.12, granular: 0.08 }),
    demoSource({ id: 'granular', label: 'Granular', family: 'granular', color: SOURCE_COLORS.granular, score: 0.62, authoredNorm: 0.58, mode: 'walk', rangeNorm: { min: 0.28, max: 0.68 }, reverb: 0.35, delayA: 0.18, delayB: 0.64, granular: 0.7 }),
    demoSource({ id: 'water', label: 'Water', family: 'earth', color: SOURCE_COLORS.water, score: 0.5, authoredNorm: 0.5, mode: 'walk', rangeNorm: { min: 0.22, max: 0.58 }, reverb: 0.28, delayA: 0.1, delayB: 0.16, granular: 0.52 }),
    demoSource({ id: 'piano', label: 'Piano', family: 'lead', color: SOURCE_COLORS.piano, score: 0.4, authoredNorm: 0.42, mode: 'sampleHold', rangeNorm: { min: 0.12, max: 0.52 }, reverb: 0.36, delayA: 0.12, delayB: 0.28, granular: 0.05 }),
    demoSource({ id: 'waves', label: 'Waves', family: 'earth', color: SOURCE_COLORS.waves, score: 0.36, authoredNorm: 0.38, mode: 'walk', rangeNorm: { min: 0.16, max: 0.48 }, reverb: 0.18, delayA: 0.08, delayB: 0.18, granular: 0.44 }),
    demoSource({ id: 'insects', label: 'Insects', family: 'earth', color: SOURCE_COLORS.insects, score: 0.32, authoredNorm: 0.35, mode: 'walk', rangeNorm: { min: 0.2, max: 0.46 }, reverb: 0.2, delayA: 0.18, delayB: 0.1, granular: 0.3 }),
  ],
  full: [
    demoSource({ id: 'pad1', label: 'Pad 1', family: 'synth', color: SOURCE_COLORS.pad1, score: 0.74, authoredNorm: 0.72, mode: 'walk', rangeNorm: { min: 0.36, max: 0.84 }, reverb: 0.68, delayA: 0.2, delayB: 0.38, granular: 0.08 }),
    demoSource({ id: 'pad2', label: 'Pad 2', family: 'synth', color: SOURCE_COLORS.pad2, score: 0.52, authoredNorm: 0.5, mode: 'walk', rangeNorm: { min: 0.24, max: 0.64 }, reverb: 0.5, delayA: 0.18, delayB: 0.22, granular: 0.18 }),
    demoSource({ id: 'drums', label: 'Drums', family: 'drums', color: SOURCE_COLORS.drums, score: 0.82, authoredNorm: 0.76, mode: 'sampleHold', rangeNorm: { min: 0.24, max: 0.82 }, reverb: 0.42, delayA: 0.7, delayB: 0.16, granular: 0.34 }),
    demoSource({ id: 'lead1', label: 'Lead 1', family: 'lead', color: SOURCE_COLORS.lead1, score: 0.66, authoredNorm: 0.64, mode: 'single', rangeNorm: { min: 0.64, max: 0.64 }, reverb: 0.48, delayA: 0.58, delayB: 0.1, granular: 0.08 }),
    demoSource({ id: 'granular', label: 'Granular', family: 'granular', color: SOURCE_COLORS.granular, score: 0.58, authoredNorm: 0.56, mode: 'walk', rangeNorm: { min: 0.22, max: 0.66 }, reverb: 0.36, delayA: 0.16, delayB: 0.66, granular: 0.72 }),
    demoSource({ id: 'waves', label: 'Waves', family: 'earth', color: SOURCE_COLORS.waves, score: 0.44, authoredNorm: 0.42, mode: 'walk', rangeNorm: { min: 0.18, max: 0.52 }, reverb: 0.2, delayA: 0.08, delayB: 0.16, granular: 0.46 }),
  ],
};

function numericState(state: SliderState, key: keyof SliderState): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeParam(key: keyof SliderState, value: number): number {
  const info = getParamInfo(key);
  if (!info) return clamp01(value);
  if (info.max === info.min) return 0;
  return clamp01((value - info.min) / (info.max - info.min));
}

function readNormalizedState(state: SliderState, key?: keyof SliderState): number {
  if (!key) return 0;
  return normalizeParam(key, numericState(state, key));
}

function readUnitState(state: SliderState, key?: keyof SliderState): number {
  if (!key) return 0;
  return clamp01(numericState(state, key));
}

function demoSource(source: Omit<SourceVisual, 'active' | 'trim' | 'displayNorm' | 'displayRange' | 'flash' | 'runtimeNorm'>): SourceVisual {
  return {
    ...source,
    active: true,
    trim: 1,
    displayNorm: source.authoredNorm,
    displayRange: source.rangeNorm,
    flash: false,
    runtimeNorm: source.authoredNorm,
  };
}

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function approximateRuntimePosition(id: string, mode: SliderMode, time: number): { position: number; flash: boolean } {
  const seed = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (mode === 'walk') {
    const slow = Math.sin(time * (0.32 + seededNoise(seed) * 0.18) + seed * 0.19);
    const drift = Math.sin(time * (0.11 + seededNoise(seed + 4) * 0.08) + seed * 0.07);
    return { position: clamp01(0.5 + slow * 0.32 + drift * 0.16), flash: false };
  }
  if (mode === 'sampleHold') {
    const step = Math.floor(time / 1.15);
    const position = seededNoise(seed + step * 17);
    return { position: clamp01(position), flash: (time % 1.15) < 0.16 };
  }
  return { position: 0.5, flash: false };
}

function resolveCurrentNorm(source: SourceVisual, time: number, runtimePosition?: number): { value: number; flash: boolean } {
  if (source.mode === 'single') {
    return { value: source.authoredNorm, flash: false };
  }
  const approximation = approximateRuntimePosition(source.id, source.mode, time);
  const position = runtimePosition ?? approximation.position;
  return {
    value: source.rangeNorm.min + clamp01(position) * (source.rangeNorm.max - source.rangeNorm.min),
    flash: approximation.flash,
  };
}

function formatPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function sourcePatternSeed(id: string): number {
  return Array.from(id).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0);
}

function snowflakeValueNorm(value: number): number {
  return clamp(value / 1.5, 0, 1);
}

function hashString(value: string): number {
  return Array.from(value).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function buildSnowflakeMorphology(seedKey: string, scenario: PrototypeScenario, activeCount: number): SnowflakeMorphology {
  const seed = Math.abs(hashString(`${scenario}:${activeCount}:${seedKey}`));
  const n = (offset: number) => seededNoise(seed + offset * 97);
  const liveChoice = n(1);
  const family: SnowflakeFamily = scenario === 'sparse'
    ? 'stellarPlate'
    : scenario === 'dense'
      ? 'fernDendrite'
      : scenario === 'full'
        ? 'sectoredPlate'
        : liveChoice < 0.22
          ? 'broadPlate'
          : liveChoice < 0.48
            ? 'fernDendrite'
            : liveChoice < 0.74
              ? 'sectoredPlate'
              : 'needleStar';

  const base = {
    seed,
    family,
    armFullness: 0.92,
    branchCount: 7,
    branchStart: 0.16,
    branchEnd: 0.9,
    branchAngle: radians(55),
    secondaryAngle: radians(44),
    tertiaryAngle: radians(66),
    branchLength: 0.15,
    branchTaper: 0.08,
    branchJitter: 0.03,
    stemWidth: 3,
    branchWidth: 1.6,
    plateStrength: 0.35,
    plateRadius: 3.2,
    ringCount: 3,
    ringWeight: 1,
    terminalScale: 1,
    sideForkScale: 0.75,
    crystalFill: 0.12,
  };

  if (family === 'stellarPlate') {
    return {
      ...base,
      armFullness: lerp(0.82, 0.94, n(2)),
      branchCount: 4 + Math.round(n(3) * 2),
      branchStart: 0.24,
      branchEnd: 0.82,
      branchAngle: radians(43 + n(4) * 12),
      secondaryAngle: radians(54 + n(5) * 10),
      tertiaryAngle: radians(34 + n(6) * 12),
      branchLength: lerp(0.12, 0.18, n(7)),
      branchTaper: 0.035,
      branchJitter: 0.018,
      stemWidth: lerp(3.8, 5.2, n(8)),
      branchWidth: lerp(2.1, 3.1, n(9)),
      plateStrength: lerp(0.62, 0.86, n(10)),
      plateRadius: lerp(4.6, 7.2, n(11)),
      ringCount: 4,
      ringWeight: 1.35,
      terminalScale: 1.28,
      sideForkScale: 0.5,
      crystalFill: 0.2,
    };
  }

  if (family === 'fernDendrite') {
    return {
      ...base,
      armFullness: lerp(0.94, 1, n(12)),
      branchCount: 8 + Math.round(n(13) * 3),
      branchStart: 0.12,
      branchEnd: 0.93,
      branchAngle: radians(56 + n(14) * 10),
      secondaryAngle: radians(31 + n(15) * 13),
      tertiaryAngle: radians(68 + n(16) * 9),
      branchLength: lerp(0.15, 0.22, n(17)),
      branchTaper: lerp(0.08, 0.14, n(18)),
      branchJitter: 0.042,
      stemWidth: lerp(2.7, 3.6, n(19)),
      branchWidth: lerp(1.3, 2.0, n(20)),
      plateStrength: lerp(0.18, 0.36, n(21)),
      plateRadius: lerp(2.3, 4.1, n(22)),
      ringCount: 2,
      ringWeight: 0.7,
      terminalScale: 0.95,
      sideForkScale: 0.95,
      crystalFill: 0.08,
    };
  }

  if (family === 'sectoredPlate') {
    return {
      ...base,
      armFullness: lerp(0.88, 0.98, n(23)),
      branchCount: 5 + Math.round(n(24) * 2),
      branchStart: 0.2,
      branchEnd: 0.88,
      branchAngle: radians(49 + n(25) * 12),
      secondaryAngle: radians(59 + n(26) * 8),
      tertiaryAngle: radians(40 + n(27) * 10),
      branchLength: lerp(0.16, 0.24, n(28)),
      branchTaper: 0.055,
      branchJitter: 0.02,
      stemWidth: lerp(3.4, 4.8, n(29)),
      branchWidth: lerp(2.0, 2.8, n(30)),
      plateStrength: lerp(0.75, 1, n(31)),
      plateRadius: lerp(5.2, 8.4, n(32)),
      ringCount: 5,
      ringWeight: 1.55,
      terminalScale: 1.15,
      sideForkScale: 0.62,
      crystalFill: 0.22,
    };
  }

  if (family === 'broadPlate') {
    return {
      ...base,
      armFullness: lerp(0.78, 0.9, n(33)),
      branchCount: 3 + Math.round(n(34) * 2),
      branchStart: 0.28,
      branchEnd: 0.76,
      branchAngle: radians(35 + n(35) * 12),
      secondaryAngle: radians(65 + n(36) * 8),
      tertiaryAngle: radians(30 + n(37) * 8),
      branchLength: lerp(0.18, 0.28, n(38)),
      branchTaper: 0.02,
      branchJitter: 0.015,
      stemWidth: lerp(4.4, 6.3, n(39)),
      branchWidth: lerp(2.8, 4.2, n(40)),
      plateStrength: lerp(0.86, 1, n(41)),
      plateRadius: lerp(7, 10, n(42)),
      ringCount: 4,
      ringWeight: 1.85,
      terminalScale: 1.45,
      sideForkScale: 0.36,
      crystalFill: 0.28,
    };
  }

  return {
    ...base,
    armFullness: lerp(0.96, 1, n(43)),
    branchCount: 6 + Math.round(n(44) * 2),
    branchStart: 0.18,
    branchEnd: 0.9,
    branchAngle: radians(62 + n(45) * 8),
    secondaryAngle: radians(28 + n(46) * 10),
    tertiaryAngle: radians(75 + n(47) * 8),
    branchLength: lerp(0.09, 0.14, n(48)),
    branchTaper: 0.04,
    branchJitter: 0.03,
    stemWidth: lerp(2.9, 4.2, n(49)),
    branchWidth: lerp(1.8, 2.5, n(50)),
    plateStrength: lerp(0.24, 0.48, n(51)),
    plateRadius: lerp(3.2, 5.2, n(52)),
    ringCount: 1,
    ringWeight: 0.55,
    terminalScale: 1.15,
    sideForkScale: 0.42,
    crystalFill: 0.1,
  };
}

function slotAngle(slot: number): number {
  return (slot * Math.PI * 2) / 6 - Math.PI / 2;
}

function polar(center: Point, angle: number, radius: number): Point {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function linePath(center: Point, slot: number, r0: number, r1: number, wobble: number, time: number, seed: number): string {
  const angle = slotAngle(slot);
  if (wobble <= 0.02) {
    const start = polar(center, angle, r0);
    const end = polar(center, angle, r1);
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  const perp = angle + Math.PI / 2;
  const parts: string[] = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const radius = r0 + (r1 - r0) * t;
    const base = polar(center, angle, radius);
    const offset = Math.sin(time * 1.2 + seed * 0.7 + t * Math.PI * 3) * wobble * 7;
    const point = {
      x: base.x + Math.cos(perp) * offset,
      y: base.y + Math.sin(perp) * offset,
    };
    parts.push(`${i === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  return parts.join(' ');
}

function crystalPoints(point: Point, angle: number, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const a = angle + (index * Math.PI * 2) / 6;
    const r = index % 2 === 0 ? radius : radius * 0.52;
    return `${(point.x + Math.cos(a) * r).toFixed(2)},${(point.y + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
}

function hexagonPoints(point: Point, angle: number, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const a = angle + (index * Math.PI * 2) / 6;
    return `${(point.x + Math.cos(a) * radius).toFixed(2)},${(point.y + Math.sin(a) * radius).toFixed(2)}`;
  }).join(' ');
}

function buildLiveSources(
  state: SliderState,
  dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>,
  sliderModes: Record<string, SliderMode>,
  trims: Record<string, number>,
  time: number,
): SourceVisual[] {
  return SOURCE_CONFIGS.map((config) => {
    const enabled = config.enabled(state);
    const authoredNorm = readNormalizedState(state, config.levelKey);
    const score = clamp01(config.score(state));
    const mode = sliderModes[String(config.levelKey)] ?? 'single';
    const range = mode === 'single' ? undefined : dualRanges[config.levelKey];
    const rangeNorm = range
      ? {
          min: normalizeParam(config.levelKey, Math.min(range.min, range.max)),
          max: normalizeParam(config.levelKey, Math.max(range.min, range.max)),
        }
      : { min: authoredNorm, max: authoredNorm };
    const runtime = resolveCurrentNorm(
      {
        id: config.id,
        label: config.label,
        family: config.family,
        color: config.color,
        levelKey: config.levelKey,
        active: enabled && score > 0.001,
        score,
        authoredNorm,
        runtimeNorm: authoredNorm,
        rangeNorm,
        trim: trims[config.id] ?? 1,
        displayNorm: authoredNorm,
        displayRange: rangeNorm,
        mode,
        flash: false,
        reverb: 0,
        delayA: 0,
        delayB: 0,
        granular: 0,
      },
      time,
      getRuntimeSliderPosition(String(config.levelKey), mode),
    );
    const trim = trims[config.id] ?? 1;
    const runtimeFlash = getRuntimeSliderFlashing(String(config.levelKey), mode);
    return {
      id: config.id,
      label: config.label,
      family: config.family,
      color: config.color,
      levelKey: config.levelKey,
      active: enabled && score > 0.001,
      score,
      authoredNorm,
      runtimeNorm: runtime.value,
      rangeNorm,
      trim,
      displayNorm: clamp(runtime.value * trim, 0, 1.5),
      displayRange: {
        min: clamp(rangeNorm.min * trim, 0, 1.5),
        max: clamp(rangeNorm.max * trim, 0, 1.5),
      },
      mode,
      flash: runtimeFlash || runtime.flash,
      reverb: readUnitState(state, config.reverbKey),
      delayA: readUnitState(state, config.delayAKey),
      delayB: readUnitState(state, config.delayBKey),
      granular: readUnitState(state, config.granularKey),
    };
  });
}

function buildDemoSources(
  scenario: Exclude<PrototypeScenario, 'live'>,
  trims: Record<string, number>,
  time: number,
): SourceVisual[] {
  return DEMO_SOURCES[scenario].map((source) => {
    const runtime = resolveCurrentNorm(source, time);
    const trim = trims[source.id] ?? 1;
    return {
      ...source,
      trim,
      runtimeNorm: runtime.value,
      flash: runtime.flash,
      displayNorm: clamp(runtime.value * trim, 0, 1.5),
      displayRange: {
        min: clamp(source.rangeNorm.min * trim, 0, 1.5),
        max: clamp(source.rangeNorm.max * trim, 0, 1.5),
      },
    };
  });
}

function aggregateOther(sources: SourceVisual[]): SourceVisual {
  const totalScore = sources.reduce((sum, source) => sum + source.score, 0) || 1;
  const weighted = (selector: (source: SourceVisual) => number) => (
    sources.reduce((sum, source) => sum + selector(source) * source.score, 0) / totalScore
  );
  const score = clamp01(Math.sqrt(totalScore / Math.max(1, sources.length)));
  const rangeNorm = {
    min: clamp01(Math.min(...sources.map((source) => source.displayRange.min))),
    max: clamp01(Math.max(...sources.map((source) => source.displayRange.max))),
  };

  return {
    id: 'other',
    label: `Other x${sources.length}`,
    family: 'other',
    color: JOURNEY_COLORS.icy,
    active: true,
    score,
    authoredNorm: weighted((source) => source.authoredNorm),
    runtimeNorm: weighted((source) => source.runtimeNorm),
    rangeNorm,
    trim: 1,
    displayNorm: clamp(weighted((source) => source.displayNorm), 0, 1.5),
    displayRange: rangeNorm,
    mode: sources.some((source) => source.mode !== 'single') ? 'walk' : 'single',
    flash: sources.some((source) => source.flash),
    reverb: weighted((source) => source.reverb),
    delayA: weighted((source) => source.delayA),
    delayB: weighted((source) => source.delayB),
    granular: weighted((source) => source.granular),
    members: sources,
  };
}

function buildLayout(sources: SourceVisual[]): ArmLayout[] {
  const active = sources
    .filter((source) => source.active && source.score > 0.001)
    .sort((left, right) => right.score - left.score);
  const display = active.length > 6
    ? [...active.slice(0, 5), aggregateOther(active.slice(5))]
    : active.slice(0, 6);
  const slots = (SLOT_SETS[display.length] ?? SLOT_SETS[6]) as ArmSlot[];
  return display.map((source, index) => ({
    source,
    slot: slots[index] ?? (index as ArmSlot),
  }));
}

function getGlobalFx(state: SliderState, scenario: PrototypeScenario): { character: number; degrade: number; dynamics: number; reverb: number } {
  if (scenario !== 'live') {
    return {
      character: scenario === 'sparse' ? 0.14 : 0.28,
      degrade: scenario === 'full' ? 0.2 : 0.12,
      dynamics: scenario === 'dense' ? 0.34 : 0.22,
      reverb: scenario === 'sparse' ? 0.3 : 0.58,
    };
  }
  const dynamicsCandidates = [
    state.sidechainEnabled ? numericState(state, 'sidechainMix') : 0,
    state.endCompEnabled ? numericState(state, 'endCompMix') : 0,
    state.dynamicsSaturationEnabled ? numericState(state, 'dynamicsSaturationDrive') : 0,
  ];
  return {
    character: state.characterEnabled ? clamp01(numericState(state, 'characterMix')) : 0,
    degrade: state.degradeEnabled ? clamp01(numericState(state, 'degradeMix')) : 0,
    dynamics: state.dynamicsEnabled ? clamp01(Math.max(...dynamicsCandidates)) : 0,
    reverb: state.reverbEnabled ? clamp01(numericState(state, 'reverbLevel')) : 0,
  };
}

const SnowflakePrototypePage: React.FC<SnowflakePrototypePageProps> = ({
  state,
  dualRanges,
  sliderModes,
  isPlaying,
  onTogglePlay,
  onBack,
  onShowAdvanced,
}) => {
  const [scenario, setScenario] = useState<PrototypeScenario>('dense');
  const [time, setTime] = useState(0);
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }));
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; slot: ArmSlot } | null>(null);
  const [trims, setTrims] = useState<Record<string, number>>({});
  const trimAnimationsRef = useRef<Record<string, { from: number; to: number; start: number; duration: number }>>({});
  const longPressTimerRef = useRef<number | null>(null);
  const centerLongPressTimerRef = useRef<number | null>(null);
  const runtimeVersion = useRuntimeSliderVersion();
  const scenarioLabels: Record<PrototypeScenario, string> = {
    dense: 'Dense',
    sparse: 'Sparse',
    full: 'Full',
    live: 'Live',
  };

  useEffect(() => {
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime((now - start) / 1000);
      const animations = trimAnimationsRef.current;
      if (Object.keys(animations).length > 0) {
        setTrims((current) => {
          let changed = false;
          const next = { ...current };
          const remaining: typeof animations = {};
          for (const [id, animation] of Object.entries(animations)) {
            const progress = clamp01((now - animation.start) / animation.duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            next[id] = animation.from + (animation.to - animation.from) * eased;
            changed = true;
            if (progress < 1) remaining[id] = animation;
          }
          trimAnimationsRef.current = remaining;
          return changed ? next : current;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const size = useMemo(() => {
    const availableWidth = windowSize.width - 32;
    const availableHeight = windowSize.height - 150;
    return clamp(Math.min(availableWidth, availableHeight), 320, 760);
  }, [windowSize]);

  const center = useMemo<Point>(() => ({ x: size / 2, y: size / 2 }), [size]);
  const baseRadius = size * 0.06;
  const maxArmLength = size * 0.405;
  const compact = windowSize.width < 760;

  const visualSources = useMemo(() => {
    if (scenario === 'live') {
      return buildLiveSources(state, dualRanges, sliderModes, trims, time);
    }
    return buildDemoSources(scenario, trims, time);
  }, [dualRanges, runtimeVersion, scenario, sliderModes, state, time, trims]);

  const layout = useMemo(() => buildLayout(visualSources), [visualSources]);
  const sourceById = useMemo(() => {
    const entries = layout.map((arm) => [arm.source.id, arm.source] as const);
    return new Map(entries);
  }, [layout]);
  const globalFx = useMemo(() => getGlobalFx(state, scenario), [scenario, state]);
  const layoutSeedKey = useMemo(() => layout.map((arm) => `${arm.slot}:${arm.source.id}`).join('|'), [layout]);
  const morphology = useMemo(
    () => buildSnowflakeMorphology(layoutSeedKey || 'empty', scenario, layout.length),
    [layout.length, layoutSeedKey, scenario],
  );
  const latticeComplexity = useMemo(() => {
    if (layout.length === 0) return 0.28;
    const activeAverage = layout.reduce((sum, arm) => sum + snowflakeValueNorm(arm.source.displayNorm), 0) / layout.length;
    return clamp01(0.32 + activeAverage * 0.34 + morphology.plateStrength * 0.34 + (layout.length / 6) * 0.08 + globalFx.reverb * 0.1);
  }, [globalFx.reverb, layout, morphology.plateStrength]);

  const animateTrimTo = useCallback((id: string, to: number, duration = 10000) => {
    const from = trims[id] ?? 1;
    trimAnimationsRef.current = {
      ...trimAnimationsRef.current,
      [id]: { from, to, start: performance.now(), duration },
    };
  }, [trims]);

  const animateAllTrimsToPatch = useCallback(() => {
    const nextAnimations: Record<string, { from: number; to: number; start: number; duration: number }> = {};
    const start = performance.now();
    for (const arm of layout) {
      nextAnimations[arm.source.id] = {
        from: trims[arm.source.id] ?? 1,
        to: 1,
        start,
        duration: 10000,
      };
    }
    trimAnimationsRef.current = {
      ...trimAnimationsRef.current,
      ...nextAnimations,
    };
  }, [layout, trims]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearCenterLongPress = useCallback(() => {
    if (centerLongPressTimerRef.current !== null) {
      window.clearTimeout(centerLongPressTimerRef.current);
      centerLongPressTimerRef.current = null;
    }
  }, []);

  const pointerNormForSlot = useCallback((event: React.PointerEvent<SVGSVGElement>, slot: ArmSlot): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const angle = slotAngle(slot);
    const dx = x - center.x;
    const dy = y - center.y;
    const projected = dx * Math.cos(angle) + dy * Math.sin(angle);
    return clamp((projected - baseRadius) / maxArmLength, 0, 1.5);
  }, [baseRadius, center.x, center.y, maxArmLength]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const source = sourceById.get(dragging.id);
    if (!source) return;
    const nextDisplayNorm = pointerNormForSlot(event, dragging.slot);
    const divisor = Math.max(0.04, source.runtimeNorm);
    const nextTrim = clamp(nextDisplayNorm / divisor, 0, 1.5);
    trimAnimationsRef.current = {
      ...trimAnimationsRef.current,
      [source.id]: { from: nextTrim, to: nextTrim, start: performance.now(), duration: 1 },
    };
    setTrims((current) => ({ ...current, [source.id]: nextTrim }));
  }, [dragging, pointerNormForSlot, sourceById]);

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    clearLongPress();
    clearCenterLongPress();
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [clearCenterLongPress, clearLongPress]);

  const activeCount = layout.length;
  const selectedSource = selectedId ? sourceById.get(selectedId) ?? null : null;

  return (
    <div style={styles.page}>
      <style>{`
        .snow-prototype-button {
          border: 1px solid rgba(220,235,255,0.22);
          background: rgba(8,15,28,0.58);
          color: rgba(240,248,255,0.84);
          border-radius: 8px;
          min-height: 36px;
          padding: 0 12px;
          font: 600 12px/1 Avenir, Avenir Next, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
          letter-spacing: 0;
          cursor: pointer;
          transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .snow-prototype-button:hover {
          border-color: rgba(184,224,255,0.65);
          background: rgba(21,36,58,0.78);
          color: white;
        }
        .snow-prototype-button.active {
          border-color: rgba(184,224,255,0.9);
          background: rgba(33,74,112,0.72);
          color: white;
          box-shadow: 0 0 20px rgba(93,156,255,0.2);
        }
        .snow-prototype-arm-label {
          transition: opacity 180ms ease, transform 180ms ease;
        }
        @keyframes snowPrototypePulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.92; }
        }
      `}</style>

      <div style={styles.topBar}>
        <div style={styles.titleBlock}>
          <div style={styles.title}>Snowflake prototype</div>
          <div style={styles.subtitle}>{activeCount} active arms, six-arm scaffold</div>
        </div>

        <div style={styles.modeBar} aria-label="Prototype scenario">
          {(['dense', 'sparse', 'full', 'live'] as PrototypeScenario[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`snow-prototype-button${scenario === mode ? ' active' : ''}`}
              onClick={() => setScenario(mode)}
            >
              {scenarioLabels[mode]}
            </button>
          ))}
        </div>

        <div style={styles.actionBar}>
          <button type="button" className="snow-prototype-button" onClick={onTogglePlay}>
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <button type="button" className="snow-prototype-button" onClick={onShowAdvanced}>
            Advanced
          </button>
          <button type="button" className="snow-prototype-button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      <div style={styles.stage}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={styles.svg}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="img"
          aria-label="Animated six-arm snowflake source prototype"
        >
          <defs>
            <radialGradient id="prototypeBg" cx="50%" cy="50%" r="52%">
              <stop offset="0%" stopColor="#111a28" stopOpacity="0.96" />
              <stop offset="62%" stopColor="#0a0f1d" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#07101b" stopOpacity="0" />
            </radialGradient>
            <filter id="prototypeSoftGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="prototypeWideGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle cx={center.x} cy={center.y} r={size * 0.49} fill="url(#prototypeBg)" />
          <SnowflakePlateLattice
            center={center}
            baseRadius={baseRadius}
            maxArmLength={maxArmLength}
            complexity={latticeComplexity}
            morphology={morphology}
            time={time}
          />
          {Array.from({ length: 6 }, (_, slot) => (
            <ScaffoldArm
              key={`scaffold-${slot}`}
              slot={slot as ArmSlot}
              center={center}
              baseRadius={baseRadius}
              maxArmLength={maxArmLength}
              morphology={morphology}
              time={time}
            />
          ))}
          <OverlappingCrystalField
            center={center}
            baseRadius={baseRadius}
            maxArmLength={maxArmLength}
            complexity={latticeComplexity}
            morphology={morphology}
            time={time}
          />

          <polygon
            points={hexagonPoints(center, -Math.PI / 2, baseRadius * (0.96 + globalFx.dynamics * 0.04))}
            fill="rgba(235,247,255,0.008)"
            stroke="rgba(235,247,255,0.08)"
            strokeWidth={0.55}
          />
          <polygon
            points={hexagonPoints(center, -Math.PI / 2, baseRadius * 0.52)}
            fill="rgba(245,251,255,0.018)"
            stroke="rgba(245,251,255,0.18)"
            strokeWidth={0.6}
          />
          {Array.from({ length: 6 }, (_, slot) => {
            const angle = slotAngle(slot);
            const inner = polar(center, angle, baseRadius * 0.58);
            const outer = polar(center, angle, baseRadius * (1.1 + globalFx.dynamics * 0.18));
            return (
              <line
                key={`center-rib-${slot}`}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(235,247,255,0.12)"
                strokeWidth={0.5}
                strokeLinecap="round"
              />
            );
          })}

          {layout.map((arm, index) => (
            <ActiveArm
              key={arm.source.id}
              arm={arm}
              center={center}
              baseRadius={baseRadius}
              maxArmLength={maxArmLength}
              time={time}
              hovered={hoveredId === arm.source.id}
              selected={selectedId === arm.source.id}
              globalDynamics={globalFx.dynamics}
              morphology={morphology}
              compact={compact}
              onPointerDown={(event) => {
                clearLongPress();
                clearCenterLongPress();
                event.currentTarget.setPointerCapture(event.pointerId);
                setSelectedId(arm.source.id);
                setDragging({ id: arm.source.id, slot: arm.slot });
                longPressTimerRef.current = window.setTimeout(() => {
                  setDragging(null);
                  animateTrimTo(arm.source.id, 1);
                }, 650);
              }}
              onHoverChange={(hovered) => setHoveredId(hovered ? arm.source.id : null)}
              onDoubleClick={() => animateTrimTo(arm.source.id, 1)}
              index={index}
            />
          ))}

          <circle
            cx={center.x}
            cy={center.y}
            r={baseRadius * 1.55}
            fill="transparent"
            stroke="transparent"
            strokeWidth={baseRadius * 1.5}
            style={{ cursor: 'pointer' }}
            onPointerDown={(event) => {
              clearLongPress();
              clearCenterLongPress();
              event.currentTarget.setPointerCapture(event.pointerId);
              centerLongPressTimerRef.current = window.setTimeout(() => {
                animateAllTrimsToPatch();
              }, 650);
            }}
            onPointerUp={(event) => {
              clearCenterLongPress();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          />
        </svg>
      </div>

      <div style={styles.bottomBar}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Trim</span>
          <span style={styles.statValue}>{selectedSource ? `${formatPercent((trims[selectedSource.id] ?? 1) / 1.5)} of max` : 'Select an arm'}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Runtime</span>
          <span style={styles.statValue}>{selectedSource ? `${selectedSource.mode} ${formatPercent(selectedSource.runtimeNorm)}` : 'Animated ranges'}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>FX</span>
          <span style={styles.statValue}>
            {selectedSource
              ? `Verb ${formatPercent(selectedSource.reverb)} Delay ${formatPercent(Math.max(selectedSource.delayA, selectedSource.delayB))} Grain ${formatPercent(selectedSource.granular)}`
              : 'Facets, plates, shards'}
          </span>
        </div>
      </div>
    </div>
  );
};

interface ScaffoldArmProps {
  slot: ArmSlot;
  center: Point;
  baseRadius: number;
  maxArmLength: number;
  morphology: SnowflakeMorphology;
  time: number;
}

interface SnowflakePlateLatticeProps {
  center: Point;
  baseRadius: number;
  maxArmLength: number;
  complexity: number;
  morphology: SnowflakeMorphology;
  time: number;
}

function SnowflakePlateLattice({
  center,
  baseRadius,
  maxArmLength,
  complexity,
  morphology,
  time,
}: SnowflakePlateLatticeProps) {
  const allRings = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92];
  const rings = allRings.slice(0, morphology.ringCount + 1);

  return (
    <g opacity={0.78 + Math.sin(time * 0.32) * 0.025}>
      {rings.map((t, index) => {
        const threshold = 0.08 + index * 0.13;
        const reveal = clamp((complexity - threshold) / 0.2, 0, 1);
        if (reveal <= 0) return null;
        const radius = baseRadius + maxArmLength * t;
        const previousRadius = baseRadius + maxArmLength * (rings[index - 1] ?? 0.12);
        const points = Array.from({ length: 6 }, (_, slot) => polar(center, slotAngle(slot), radius));
        const previousPoints = Array.from({ length: 6 }, (_, slot) => polar(center, slotAngle(slot), previousRadius));
        return (
          <g key={t}>
            <polygon
              points={points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}
              fill="rgba(210,238,255,0.34)"
              fillOpacity={morphology.crystalFill * reveal * (0.6 + index * 0.1)}
              stroke="rgba(205,236,255,0.62)"
              strokeOpacity={(0.24 + morphology.plateStrength * 0.22 + index * 0.034) * reveal}
              strokeWidth={(0.95 + morphology.ringWeight * 0.52) * reveal}
            />
            {points.map((point, slot) => {
              const previous = previousPoints[slot]!;
              const next = points[(slot + 1) % 6]!;
              const mid = {
                x: point.x + (next.x - point.x) * 0.5,
                y: point.y + (next.y - point.y) * 0.5,
              };
              return (
                <g key={slot}>
                  <line
                    x1={previous.x}
                    y1={previous.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="rgba(205,236,255,0.38)"
                    strokeOpacity={(0.04 + morphology.plateStrength * 0.06 + index * 0.008) * reveal}
                    strokeWidth={(0.5 + morphology.ringWeight * 0.18) * reveal}
                    strokeLinecap="round"
                  />
                  {index > 1 && morphology.plateStrength > 0.72 && (
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={mid.x}
                      y2={mid.y}
                      stroke="rgba(205,236,255,0.38)"
                      strokeOpacity={(0.04 + morphology.plateStrength * 0.04) * reveal}
                      strokeWidth={(0.42 + morphology.ringWeight * 0.16) * reveal}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

interface OverlappingCrystalFieldProps {
  center: Point;
  baseRadius: number;
  maxArmLength: number;
  complexity: number;
  morphology: SnowflakeMorphology;
  time: number;
}

interface MiniCrystalProps {
  point: Point;
  rotation: number;
  radius: number;
  width: number;
  opacity: number;
  morphology: SnowflakeMorphology;
}

const MiniCrystal: React.FC<MiniCrystalProps> = ({
  point,
  rotation,
  radius,
  width,
  opacity,
  morphology,
}) => {
  const arms = morphology.family === 'broadPlate' ? 6 : 8;
  return (
    <g opacity={opacity}>
      {Array.from({ length: arms }, (_, index) => {
        const angle = rotation + (index * Math.PI * 2) / arms;
        const inner = {
          x: point.x - Math.cos(angle) * radius * 0.12,
          y: point.y - Math.sin(angle) * radius * 0.12,
        };
        const outer = {
          x: point.x + Math.cos(angle) * radius,
          y: point.y + Math.sin(angle) * radius,
        };
        const tineBase = {
          x: point.x + Math.cos(angle) * radius * 0.55,
          y: point.y + Math.sin(angle) * radius * 0.55,
        };
        return (
          <g key={index}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="rgba(235,248,255,0.76)"
              strokeWidth={width}
              strokeLinecap="round"
            />
            {([-1, 1] as const).map((side) => {
              const tineAngle = angle + side * morphology.secondaryAngle;
              const tineEnd = {
                x: tineBase.x + Math.cos(tineAngle) * radius * 0.34,
                y: tineBase.y + Math.sin(tineAngle) * radius * 0.34,
              };
              return (
                <line
                  key={side}
                  x1={tineBase.x}
                  y1={tineBase.y}
                  x2={tineEnd.x}
                  y2={tineEnd.y}
                  stroke="rgba(235,248,255,0.5)"
                  strokeWidth={Math.max(0.5, width * 0.62)}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        );
      })}
      {morphology.plateStrength > 0.45 && (
        <polygon
          points={hexagonPoints(point, rotation + Math.PI / 6, radius * 0.42)}
          fill="rgba(235,248,255,0.1)"
          stroke="rgba(235,248,255,0.44)"
          strokeWidth={Math.max(0.5, width * 0.55)}
        />
      )}
    </g>
  );
};

function OverlappingCrystalField({
  center,
  baseRadius,
  maxArmLength,
  complexity,
  morphology,
  time,
}: OverlappingCrystalFieldProps) {
  const ringCount = morphology.family === 'fernDendrite' ? 4 : 3;
  const rings = Array.from({ length: ringCount }, (_, index) => 0.28 + index * (morphology.family === 'broadPlate' ? 0.16 : 0.18));
  const reveal = clamp((complexity - 0.3) / 0.52, 0, 1);
  if (reveal <= 0) return null;

  return (
    <g opacity={reveal}>
      {rings.map((t, ringIndex) => {
        const radius = baseRadius + maxArmLength * morphology.armFullness * t;
        const nextRadius = baseRadius + maxArmLength * morphology.armFullness * Math.min(0.94, t + 0.12);
        const motifRadius = maxArmLength * (0.042 + morphology.plateStrength * 0.022) * (1 - ringIndex * 0.08);
        return (
          <g key={t}>
            {Array.from({ length: 6 }, (_, slot) => {
              const angle = slotAngle(slot);
              const nextAngle = slotAngle((slot + 1) % 6);
              const armPoint = polar(center, angle, radius);
              const nextArmPoint = polar(center, nextAngle, radius);
              const betweenAngle = angle + Math.PI / 6;
              const betweenPoint = polar(center, betweenAngle, radius * (0.92 + morphology.plateStrength * 0.03));
              const outerBetween = polar(center, betweenAngle, nextRadius);
              const sectorStart = polar(center, angle, radius * 0.95);
              const sectorNext = polar(center, nextAngle, radius * 0.95);
              const sectorOuterStart = polar(center, angle, nextRadius);
              const sectorOuterNext = polar(center, nextAngle, nextRadius);
              const sectorOpacity = (0.035 + morphology.crystalFill * 0.16) * (ringIndex + 1) * 0.34;

              return (
                <g key={slot}>
                  <polygon
                    points={[
                      `${sectorStart.x.toFixed(2)},${sectorStart.y.toFixed(2)}`,
                      `${sectorOuterStart.x.toFixed(2)},${sectorOuterStart.y.toFixed(2)}`,
                      `${outerBetween.x.toFixed(2)},${outerBetween.y.toFixed(2)}`,
                      `${sectorOuterNext.x.toFixed(2)},${sectorOuterNext.y.toFixed(2)}`,
                      `${sectorNext.x.toFixed(2)},${sectorNext.y.toFixed(2)}`,
                      `${betweenPoint.x.toFixed(2)},${betweenPoint.y.toFixed(2)}`,
                    ].join(' ')}
                    fill="rgba(215,240,255,0.55)"
                    fillOpacity={sectorOpacity * 0.72}
                    stroke="rgba(220,244,255,0.38)"
                    strokeOpacity={(0.06 + morphology.plateStrength * 0.08) * reveal}
                    strokeWidth={0.56 + morphology.ringWeight * 0.08}
                  />
                  <line
                    x1={armPoint.x}
                    y1={armPoint.y}
                    x2={betweenPoint.x}
                    y2={betweenPoint.y}
                    stroke="rgba(235,248,255,0.42)"
                    strokeOpacity={(0.18 + morphology.plateStrength * 0.08) * reveal}
                    strokeWidth={Math.max(0.75, morphology.branchWidth * 0.34)}
                    strokeLinecap="round"
                  />
                  <line
                    x1={betweenPoint.x}
                    y1={betweenPoint.y}
                    x2={nextArmPoint.x}
                    y2={nextArmPoint.y}
                    stroke="rgba(235,248,255,0.38)"
                    strokeOpacity={(0.16 + morphology.plateStrength * 0.06) * reveal}
                    strokeWidth={Math.max(0.68, morphology.branchWidth * 0.3)}
                    strokeLinecap="round"
                  />
                  <MiniCrystal
                    point={armPoint}
                    rotation={angle + time * 0.01}
                    radius={motifRadius * (0.8 + morphology.sideForkScale * 0.28)}
                    width={Math.max(0.72, morphology.branchWidth * 0.38)}
                    opacity={(0.36 + morphology.plateStrength * 0.28) * reveal}
                    morphology={morphology}
                  />
                  <MiniCrystal
                    point={betweenPoint}
                    rotation={betweenAngle + Math.PI / 6 - time * 0.006}
                    radius={motifRadius * (0.62 + morphology.plateStrength * 0.22)}
                    width={Math.max(0.6, morphology.branchWidth * 0.3)}
                    opacity={(0.28 + morphology.plateStrength * 0.24) * reveal}
                    morphology={morphology}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

const ScaffoldArm: React.FC<ScaffoldArmProps> = ({ slot, center, baseRadius, maxArmLength, morphology, time }) => {
  const angle = slotAngle(slot);
  const start = polar(center, angle, baseRadius * 0.92);
  const end = polar(center, angle, baseRadius + maxArmLength * morphology.armFullness);
  const branchTs = Array.from({ length: morphology.branchCount }, (_, index) => {
    const denominator = Math.max(1, morphology.branchCount - 1);
    return morphology.branchStart + (index / denominator) * (morphology.branchEnd - morphology.branchStart);
  });
  return (
    <g opacity={0.46 + morphology.plateStrength * 0.1 + Math.sin(time * 0.45 + slot) * 0.018}>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="rgba(230,244,255,0.48)"
        strokeWidth={Math.max(1.35, morphology.stemWidth * 0.4)}
        strokeLinecap="round"
      />
      {branchTs.map((t, index) => {
        const origin = polar(center, angle, baseRadius + maxArmLength * morphology.armFullness * t);
        const branchLength = maxArmLength * morphology.branchLength * (0.42 + morphology.plateStrength * 0.28) * (1 - Math.abs(t - 0.5) * morphology.branchTaper);
        return [-1, 1].map((side) => {
          const branchAngle = angle + side * morphology.branchAngle;
          const branchEnd = {
            x: origin.x + Math.cos(branchAngle) * branchLength,
            y: origin.y + Math.sin(branchAngle) * branchLength,
          };
          const forkBase = {
            x: origin.x + (branchEnd.x - origin.x) * 0.62,
            y: origin.y + (branchEnd.y - origin.y) * 0.62,
          };
          const forkEnd = {
            x: forkBase.x + Math.cos(branchAngle - side * morphology.secondaryAngle) * branchLength * 0.18,
            y: forkBase.y + Math.sin(branchAngle - side * morphology.secondaryAngle) * branchLength * 0.18,
          };
          const outerForkEnd = {
            x: forkBase.x + Math.cos(branchAngle + side * morphology.tertiaryAngle) * branchLength * 0.22,
            y: forkBase.y + Math.sin(branchAngle + side * morphology.tertiaryAngle) * branchLength * 0.22,
          };
          const innerSecondary = {
            x: branchEnd.x + Math.cos(branchAngle - side * morphology.secondaryAngle) * branchLength * 0.2,
            y: branchEnd.y + Math.sin(branchAngle - side * morphology.secondaryAngle) * branchLength * 0.2,
          };
          const outerSecondary = {
            x: branchEnd.x + Math.cos(branchAngle + side * morphology.tertiaryAngle) * branchLength * 0.18,
            y: branchEnd.y + Math.sin(branchAngle + side * morphology.tertiaryAngle) * branchLength * 0.18,
          };
          return (
            <g key={`${t}-${side}`}>
              <line
                x1={origin.x}
                y1={origin.y}
                x2={branchEnd.x}
                y2={branchEnd.y}
                stroke="rgba(230,244,255,0.34)"
                strokeWidth={Math.max(0.9, morphology.branchWidth * 0.48)}
                strokeLinecap="round"
              />
              <line
                x1={forkBase.x}
                y1={forkBase.y}
                x2={forkEnd.x}
                y2={forkEnd.y}
                stroke="rgba(230,244,255,0.26)"
                strokeWidth={Math.max(0.7, morphology.branchWidth * 0.34)}
                strokeLinecap="round"
              />
              <line
                x1={forkBase.x}
                y1={forkBase.y}
                x2={outerForkEnd.x}
                y2={outerForkEnd.y}
                stroke="rgba(230,244,255,0.24)"
                strokeWidth={Math.max(0.66, morphology.branchWidth * 0.32)}
                strokeLinecap="round"
              />
              {morphology.family !== 'broadPlate' && (
                <>
                  <line
                    x1={branchEnd.x}
                    y1={branchEnd.y}
                    x2={innerSecondary.x}
                    y2={innerSecondary.y}
                    stroke="rgba(230,244,255,0.2)"
                    strokeWidth={Math.max(0.55, morphology.branchWidth * 0.24)}
                    strokeLinecap="round"
                  />
                  <line
                    x1={branchEnd.x}
                    y1={branchEnd.y}
                    x2={outerSecondary.x}
                    y2={outerSecondary.y}
                    stroke="rgba(230,244,255,0.18)"
                    strokeWidth={Math.max(0.5, morphology.branchWidth * 0.22)}
                    strokeLinecap="round"
                  />
                </>
              )}
              {(index % 2 === 1 || morphology.plateStrength > 0.6) && (
                <polygon
                  points={hexagonPoints(branchEnd, Math.PI / 6, morphology.plateRadius * 0.32)}
                  fill="rgba(230,244,255,0.08)"
                  stroke="rgba(230,244,255,0.24)"
                  strokeWidth={0.64}
                />
              )}
            </g>
          );
        });
      })}
      <polygon
        points={hexagonPoints(end, angle + Math.PI / 6, morphology.plateRadius * (0.4 + morphology.terminalScale * 0.12))}
        fill="rgba(230,244,255,0.08)"
        stroke="rgba(230,244,255,0.24)"
        strokeWidth={0.7}
      />
    </g>
  );
};

interface ActiveArmProps {
  arm: ArmLayout;
  center: Point;
  baseRadius: number;
  maxArmLength: number;
  time: number;
  hovered: boolean;
  selected: boolean;
  compact: boolean;
  globalDynamics: number;
  morphology: SnowflakeMorphology;
  index: number;
  onPointerDown: (event: React.PointerEvent<SVGLineElement>) => void;
  onHoverChange: (hovered: boolean) => void;
  onDoubleClick: () => void;
}

const ActiveArm: React.FC<ActiveArmProps> = ({
  arm,
  center,
  baseRadius,
  maxArmLength,
  time,
  hovered,
  selected,
  compact,
  globalDynamics,
  morphology,
  index,
  onPointerDown,
  onHoverChange,
  onDoubleClick,
}) => {
  const { source, slot } = arm;
  const angle = slotAngle(slot);
  const seed = index * 13 + slot * 7;
  const valueNorm = snowflakeValueNorm(source.displayNorm);
  const rangeStartRadius = baseRadius + snowflakeValueNorm(source.displayRange.min) * maxArmLength;
  const rangeEndRadius = baseRadius + snowflakeValueNorm(source.displayRange.max) * maxArmLength;
  const currentRadius = baseRadius + valueNorm * maxArmLength;
  const authoredRadius = baseRadius + snowflakeValueNorm(source.authoredNorm) * maxArmLength;
  const structureRadius = baseRadius + maxArmLength * morphology.armFullness * (0.98 + source.score * 0.02);
  const start = polar(center, angle, baseRadius);
  const rangeStart = polar(center, angle, rangeStartRadius);
  const rangeEnd = polar(center, angle, rangeEndRadius);
  const current = polar(center, angle, currentRadius);
  const structureEnd = polar(center, angle, structureRadius);
  const authored = polar(center, angle, authoredRadius);
  const labelPoint = polar(center, angle, Math.min(baseRadius + maxArmLength * 1.08, structureRadius + maxArmLength * 0.08));
  const labelVisible = hovered || selected;
  const stemWidth = morphology.stemWidth * (0.74 + source.score * 0.28) + globalDynamics * 0.28;
  const branchDensity = 0.46 + source.reverb * 0.42 + source.granular * 0.16 + morphology.plateStrength * 0.1;
  const crystalComplexity = clamp01(0.46 + valueNorm * 0.34 + source.reverb * 0.1 + source.granular * 0.06 + morphology.plateStrength * 0.16);
  const delayCount = Math.round(Math.max(source.delayA, source.delayB) * 3);
  const shardCount = Math.round(source.granular * 4);
  const flashScale = source.flash ? 1.24 : 1;

  return (
    <g
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onDoubleClick={onDoubleClick}
    >
      <path
        d={linePath(center, slot, baseRadius, structureRadius, 0, time, seed)}
        stroke="rgba(235,247,255,0.62)"
        strokeOpacity={0.06 + source.reverb * 0.06}
        strokeWidth={stemWidth + source.reverb * 2.2}
        strokeLinecap="round"
        fill="none"
      />

      <line
        x1={rangeStart.x}
        y1={rangeStart.y}
        x2={rangeEnd.x}
        y2={rangeEnd.y}
        stroke="rgba(235,247,255,0.88)"
        strokeOpacity={hovered || selected ? 0.38 : 0}
        strokeWidth={hovered || selected ? 1.6 : 0}
        strokeLinecap="round"
        strokeDasharray="1 8"
      />

      <path
        d={linePath(center, slot, baseRadius, structureRadius, 0, time, seed)}
        stroke="rgba(120,200,248,0.34)"
        strokeOpacity={0.24}
        strokeWidth={stemWidth + 2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <path
        d={linePath(center, slot, baseRadius, structureRadius, 0, time, seed)}
        stroke="rgba(236,249,255,0.96)"
        strokeOpacity={0.34 + crystalComplexity * 0.22}
        strokeWidth={stemWidth * 0.86}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <path
        d={linePath(center, slot, baseRadius, currentRadius, 0, time, seed)}
        stroke={source.color}
        strokeOpacity={hovered || selected ? 0.34 : 0.1}
        strokeWidth={stemWidth + 0.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <line
        x1={start.x}
        y1={start.y}
        x2={structureEnd.x}
        y2={structureEnd.y}
        stroke="transparent"
        strokeWidth={36}
        strokeLinecap="round"
        style={{ cursor: 'grab', pointerEvents: 'stroke' }}
        onPointerDown={onPointerDown}
      />

      <FractalBranches
        center={center}
        slot={slot}
        baseRadius={baseRadius}
        currentRadius={structureRadius}
        maxArmLength={maxArmLength}
        density={branchDensity}
        complexity={crystalComplexity}
        morphology={morphology}
        time={time}
        activeColor={source.color}
        flash={source.flash}
        patternSeed={sourcePatternSeed(source.id)}
      />

      {Array.from({ length: delayCount }, (_, beadIndex) => (
        <DelayBead
          key={`bead-${beadIndex}`}
          source={source}
          center={center}
          slot={slot}
          beadIndex={beadIndex}
          beadCount={delayCount}
          baseRadius={baseRadius}
          currentRadius={structureRadius}
          time={time}
        />
      ))}

      {Array.from({ length: shardCount }, (_, shardIndex) => (
        <GranularShard
          key={`shard-${shardIndex}`}
          source={source}
          center={center}
          slot={slot}
          shardIndex={shardIndex}
          currentRadius={structureRadius}
          maxArmLength={maxArmLength}
          time={time}
        />
      ))}

      {globalDynamics > 0.05 && (
        <DynamicsRibs
          center={center}
          slot={slot}
          baseRadius={baseRadius}
          currentRadius={structureRadius}
          amount={globalDynamics}
        />
      )}

      <polygon
        points={hexagonPoints(current, angle + Math.PI / 6, 3.4 + crystalComplexity * 2.6)}
        fill={source.color}
        fillOpacity={hovered || selected ? 0.24 : 0.1}
        stroke="rgba(245,251,255,0.76)"
        strokeOpacity={hovered || selected ? 0.82 : 0.32}
        strokeWidth={0.7}
      />

      {(hovered || selected) && (
        <line
          x1={authored.x - Math.cos(angle + Math.PI / 2) * 6}
          y1={authored.y - Math.sin(angle + Math.PI / 2) * 6}
          x2={authored.x + Math.cos(angle + Math.PI / 2) * 6}
          y2={authored.y + Math.sin(angle + Math.PI / 2) * 6}
          stroke="rgba(255,255,255,0.62)"
          strokeWidth={1}
          strokeLinecap="round"
        />
      )}

      <TerminalCrystal
        point={structureEnd}
        angle={angle}
        color={source.color}
        size={(7 + crystalComplexity * 7) * flashScale}
        selected={hovered || selected}
        flashing={source.flash}
      />

      <g
        className="snow-prototype-arm-label"
        opacity={labelVisible ? 1 : 0}
        transform={`translate(0 ${labelVisible ? 0 : 4})`}
        style={{ pointerEvents: 'none' }}
      >
        <rect
          x={labelPoint.x - (compact ? 62 : 76)}
          y={labelPoint.y - 25}
          width={compact ? 124 : 152}
          height={50}
          rx={8}
          fill="rgba(5,10,20,0.82)"
          stroke={source.color}
          strokeOpacity={0.56}
        />
        <text
          x={labelPoint.x}
          y={labelPoint.y - 8}
          textAnchor="middle"
          fill="white"
          fontSize={compact ? 10 : 12}
          fontWeight={700}
        >
          {source.label}
        </text>
        <text
          x={labelPoint.x}
          y={labelPoint.y + 9}
          textAnchor="middle"
          fill="rgba(220,235,255,0.82)"
          fontSize={compact ? 9 : 10}
        >
          {source.mode} {formatPercent(source.runtimeNorm)} / patch {formatPercent(source.authoredNorm)}
        </text>
      </g>
    </g>
  );
};

interface TerminalCrystalProps {
  point: Point;
  angle: number;
  color: string;
  size: number;
  selected: boolean;
  flashing: boolean;
}

const TerminalCrystal: React.FC<TerminalCrystalProps> = ({ point, angle, color, size, selected, flashing }) => {
  const plateRadius = size * 0.44;
  const sideLength = size * 0.46;
  const forkLength = size * 0.34;
  const back = {
    x: point.x - Math.cos(angle) * size * 0.56,
    y: point.y - Math.sin(angle) * size * 0.56,
  };
  const tip = {
    x: point.x + Math.cos(angle) * size * 0.3,
    y: point.y + Math.sin(angle) * size * 0.3,
  };

  return (
    <g
      opacity={flashing ? 1 : 0.88}
      style={flashing ? { animation: 'snowPrototypePulse 420ms ease-out' } : undefined}
    >
      <line
        x1={back.x}
        y1={back.y}
        x2={tip.x}
        y2={tip.y}
        stroke="rgba(242,250,255,0.82)"
        strokeWidth={1.35}
        strokeLinecap="round"
      />
      <polygon
        points={hexagonPoints(point, angle + Math.PI / 6, plateRadius)}
        fill="rgba(242,250,255,0.18)"
        stroke="rgba(242,250,255,0.74)"
        strokeWidth={1.05}
      />
      {([-1, 1] as const).map((side) => {
        const branchAngle = angle + side * Math.PI / 3.15;
        const sideEnd = {
          x: point.x - Math.cos(angle) * size * 0.16 + Math.cos(branchAngle) * sideLength,
          y: point.y - Math.sin(angle) * size * 0.16 + Math.sin(branchAngle) * sideLength,
        };
        const feather = {
          x: sideEnd.x + Math.cos(angle) * forkLength,
          y: sideEnd.y + Math.sin(angle) * forkLength,
        };
        return (
          <g key={side}>
            <line
              x1={point.x}
              y1={point.y}
              x2={sideEnd.x}
              y2={sideEnd.y}
              stroke="rgba(242,250,255,0.76)"
              strokeWidth={1.05}
              strokeLinecap="round"
            />
            <line
              x1={sideEnd.x}
              y1={sideEnd.y}
              x2={feather.x}
              y2={feather.y}
              stroke="rgba(242,250,255,0.58)"
              strokeWidth={0.86}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {selected && (
        <circle
          cx={point.x}
          cy={point.y}
          r={size * 0.42}
          fill="none"
          stroke={color}
          strokeOpacity={0.32}
          strokeWidth={0.9}
        />
      )}
    </g>
  );
};

interface FractalBranchesProps {
  center: Point;
  slot: ArmSlot;
  baseRadius: number;
  currentRadius: number;
  maxArmLength: number;
  density: number;
  complexity: number;
  morphology: SnowflakeMorphology;
  time: number;
  activeColor: string;
  flash: boolean;
  patternSeed: number;
}

interface FractalSegment {
  start: Point;
  end: Point;
  width: number;
  opacity: number;
  threshold: number;
}

interface CrystalPlate {
  center: Point;
  radius: number;
  opacity: number;
  threshold: number;
}

function pushSegment(
  segments: FractalSegment[],
  start: Point,
  angle: number,
  length: number,
  width: number,
  opacity: number,
  threshold = 0,
): Point {
  const end = {
    x: start.x + Math.cos(angle) * length,
    y: start.y + Math.sin(angle) * length,
  };
  segments.push({
    start,
    end,
    width,
    opacity,
    threshold,
  });
  return end;
}

function addCrystalFacet(
  segments: FractalSegment[],
  plates: CrystalPlate[],
  origin: Point,
  mainAngle: number,
  side: -1 | 1,
  length: number,
  density: number,
  index: number,
  morphology: SnowflakeMorphology,
  patternSeed: number,
): void {
  const angleJitter = (seededNoise(patternSeed + index * 19 + side * 23) - 0.5) * morphology.branchJitter;
  const branchAngle = mainAngle + side * (morphology.branchAngle + angleJitter);
  const width = morphology.branchWidth * (0.74 + density * 0.28);
  const opacity = 0.52 + density * 0.17;
  const threshold = 0.04 + index * 0.055;
  const variant = 0.86 + seededNoise(patternSeed + index * 31 + side * 17) * 0.24;
  const scaledLength = length * variant;
  const end = pushSegment(segments, origin, branchAngle, scaledLength, width, opacity, threshold);
  const innerPoint = {
    x: origin.x + (end.x - origin.x) * 0.48,
    y: origin.y + (end.y - origin.y) * 0.48,
  };
  const outerPoint = {
    x: origin.x + (end.x - origin.x) * 0.72,
    y: origin.y + (end.y - origin.y) * 0.72,
  };
  const subLength = scaledLength * (0.24 + density * 0.06);
  const forkLength = scaledLength * (0.2 + density * 0.045);
  const inwardAngle = branchAngle - side * morphology.secondaryAngle;
  const outwardAngle = branchAngle + side * morphology.tertiaryAngle;
  const plateAngle = mainAngle + side * (morphology.branchAngle * 0.48);

  pushSegment(
    segments,
    innerPoint,
    inwardAngle,
    subLength * morphology.sideForkScale,
    morphology.branchWidth * (0.46 + density * 0.12),
    0.36 + density * 0.13,
    threshold + 0.1,
  );
  pushSegment(
    segments,
    innerPoint,
    outwardAngle,
    subLength * (0.56 + morphology.plateStrength * 0.28),
    morphology.branchWidth * (0.4 + density * 0.12),
    0.32 + density * 0.12,
    threshold + 0.2,
  );
  pushSegment(
    segments,
    outerPoint,
    inwardAngle,
    subLength * morphology.sideForkScale * 0.7,
    morphology.branchWidth * (0.38 + density * 0.1),
    0.32 + density * 0.12,
    threshold + 0.18,
  );
  pushSegment(
    segments,
    outerPoint,
    outwardAngle,
    subLength * (0.48 + morphology.plateStrength * 0.2),
    morphology.branchWidth * (0.34 + density * 0.1),
    0.28 + density * 0.1,
    threshold + 0.28,
  );
  pushSegment(
    segments,
    end,
    plateAngle,
    forkLength * (0.5 + morphology.plateStrength * 0.25),
    morphology.branchWidth * (0.44 + density * 0.12),
    0.42 + density * 0.12,
    threshold + 0.24,
  );
  pushSegment(
    segments,
    end,
    outwardAngle,
    forkLength * (0.64 + morphology.sideForkScale * 0.34),
    morphology.branchWidth * (0.38 + density * 0.1),
    0.32 + density * 0.12,
    threshold + 0.34,
  );

  if (density > 0.98 || index % 2 === 0) {
    const facetPoint = {
      x: origin.x + (end.x - origin.x) * 0.86,
      y: origin.y + (end.y - origin.y) * 0.86,
    };
    pushSegment(
      segments,
      facetPoint,
      inwardAngle,
      scaledLength * (0.08 + morphology.plateStrength * 0.08),
      morphology.branchWidth * (0.28 + density * 0.08),
      0.28 + density * 0.1,
      threshold + 0.42,
    );
  }

  if (index % 2 === 1 || density > 1.04) {
    plates.push({
      center: end,
      radius: morphology.plateRadius * (0.52 + density * 0.2),
      opacity: 0.18 + density * 0.1,
      threshold: threshold + 0.16,
    });
  }

  if (morphology.plateStrength > 0.55 && index % 2 === 0) {
    plates.push({
      center: outerPoint,
      radius: morphology.plateRadius * (0.34 + morphology.plateStrength * 0.16),
      opacity: 0.12 + morphology.plateStrength * 0.12,
      threshold: threshold + 0.08,
    });
  }
}

function addTerminalFacet(
  segments: FractalSegment[],
  plates: CrystalPlate[],
  tip: Point,
  mainAngle: number,
  maxArmLength: number,
  density: number,
  morphology: SnowflakeMorphology,
): void {
  const baseLength = maxArmLength * (0.026 + density * 0.012) * morphology.terminalScale;
  ([-1, 1] as const).forEach((side) => {
    const firstEnd = pushSegment(
      segments,
      tip,
      mainAngle + side * morphology.branchAngle,
      baseLength,
      morphology.branchWidth * (0.5 + density * 0.16),
      0.62,
      0.18,
    );
    pushSegment(
      segments,
      firstEnd,
      mainAngle + side * (morphology.branchAngle - morphology.secondaryAngle * 0.55),
      baseLength * (0.45 + morphology.sideForkScale * 0.22),
      morphology.branchWidth * (0.36 + density * 0.12),
      0.42,
      0.34,
    );
  });
  plates.push({
    center: tip,
    radius: morphology.plateRadius * (0.58 + morphology.terminalScale * 0.18),
    opacity: 0.2 + density * 0.1,
    threshold: 0.14,
  });
}

const FractalBranches: React.FC<FractalBranchesProps> = ({
  center,
  slot,
  baseRadius,
  currentRadius,
  maxArmLength,
  density,
  complexity,
  morphology,
  time,
  activeColor,
  flash,
  patternSeed,
}) => {
  const angle = slotAngle(slot);
  const armLength = Math.max(0, currentRadius - baseRadius);
  const segments: FractalSegment[] = [];
  const plates: CrystalPlate[] = [];
  const anchorBase = Array.from({ length: morphology.branchCount }, (_, index) => {
    const denominator = Math.max(1, morphology.branchCount - 1);
    return morphology.branchStart + (index / denominator) * (morphology.branchEnd - morphology.branchStart);
  });
  const anchors = anchorBase.filter((t) => t * armLength > 18);

  anchors.forEach((t, index) => {
    const origin = polar(center, angle, baseRadius + armLength * t);
    const pulse = 1 + Math.sin(time * 0.55 + slot * 0.7 + index * 0.5) * 0.012;
    const uniqueScale = 0.9 + seededNoise(patternSeed + index * 43) * 0.18;
    const profile = 1 - Math.abs(t - 0.5) * morphology.branchTaper;
    const branchLength = armLength * morphology.branchLength * (0.78 + density * 0.24) * profile * pulse * uniqueScale;
    ([-1, 1] as const).forEach((side) => {
      addCrystalFacet(
        segments,
        plates,
        origin,
        angle,
        side,
        branchLength,
        density,
        index,
        morphology,
        patternSeed,
      );
    });
  });

  const tip = polar(center, angle, currentRadius);
  addTerminalFacet(segments, plates, tip, angle, maxArmLength, density, morphology);

  return (
    <g opacity={flash ? 0.96 : 0.86}>
      {segments.map((segment, index) => {
        const reveal = clamp((complexity - segment.threshold) / 0.18, 0, 1);
        if (reveal <= 0) return null;
        const end = {
          x: segment.start.x + (segment.end.x - segment.start.x) * reveal,
          y: segment.start.y + (segment.end.y - segment.start.y) * reveal,
        };
        return (
          <g key={index}>
            <line
              x1={segment.start.x}
              y1={segment.start.y}
              x2={end.x}
              y2={end.y}
              stroke="rgba(130,205,245,0.34)"
              strokeOpacity={segment.opacity * 0.26 * reveal}
              strokeWidth={segment.width + 1.45}
              strokeLinecap="round"
            />
            <line
              x1={segment.start.x}
              y1={segment.start.y}
              x2={end.x}
              y2={end.y}
              stroke="rgba(238,250,255,0.96)"
              strokeOpacity={segment.opacity * reveal}
              strokeWidth={segment.width}
              strokeLinecap="round"
            />
            <line
              x1={segment.start.x}
              y1={segment.start.y}
              x2={end.x}
              y2={end.y}
              stroke={activeColor}
              strokeOpacity={0.04 * reveal}
              strokeWidth={segment.width + 2.7}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {plates.map((plate, index) => {
        const reveal = clamp((complexity - plate.threshold) / 0.18, 0, 1);
        if (reveal <= 0) return null;
        return (
          <polygon
            key={`plate-${index}`}
            points={hexagonPoints(plate.center, Math.PI / 6, plate.radius * (0.45 + reveal * 0.55))}
            fill="rgba(238,250,255,0.2)"
            fillOpacity={plate.opacity * reveal}
            stroke="rgba(238,250,255,0.5)"
            strokeOpacity={(plate.opacity + 0.08) * reveal}
            strokeWidth={0.72}
          />
        );
      })}
    </g>
  );
};

interface DelayBeadProps {
  source: SourceVisual;
  center: Point;
  slot: ArmSlot;
  beadIndex: number;
  beadCount: number;
  baseRadius: number;
  currentRadius: number;
  time: number;
}

const DelayBead: React.FC<DelayBeadProps> = ({
  source,
  center,
  slot,
  beadIndex,
  beadCount,
  baseRadius,
  currentRadius,
  time,
}) => {
  const amount = Math.max(source.delayA, source.delayB);
  const angle = slotAngle(slot);
  const side = source.delayA >= source.delayB ? 1 : -1;
  const t = (beadIndex + 1) / (beadCount + 1);
  const radius = baseRadius + (currentRadius - baseRadius) * t;
  const base = polar(center, angle, radius);
  const offset = (4 + amount * 8 + (beadIndex % 2) * 4) * side;
  const perp = angle + Math.PI / 2;
  const pulse = (Math.sin(time * (1.8 + amount) - beadIndex * 0.9) + 1) / 2;
  return (
    <polygon
      points={hexagonPoints(
        {
          x: base.x + Math.cos(perp) * offset,
          y: base.y + Math.sin(perp) * offset,
        },
        angle + Math.PI / 6,
        1.2 + amount * 1.35 * (0.65 + pulse * 0.35),
      )}
      fill="rgba(238,249,255,0.7)"
      fillOpacity={0.16 + amount * (0.08 + pulse * 0.1)}
      stroke="rgba(238,249,255,0.36)"
      strokeWidth={0.4}
    />
  );
};

interface GranularShardProps {
  source: SourceVisual;
  center: Point;
  slot: ArmSlot;
  shardIndex: number;
  currentRadius: number;
  maxArmLength: number;
  time: number;
}

const GranularShard: React.FC<GranularShardProps> = ({
  source,
  center,
  slot,
  shardIndex,
  currentRadius,
  maxArmLength,
  time,
}) => {
  const angle = slotAngle(slot);
  const spread = seededNoise(shardIndex + slot * 17) * 2 - 1;
  const radius = currentRadius - maxArmLength * (0.03 + seededNoise(shardIndex * 3 + 2) * 0.16);
  const base = polar(center, angle, radius);
  const perp = angle + Math.PI / 2;
  const drift = Math.sin(time * 1.7 + shardIndex) * 2.5;
  const point = {
    x: base.x + Math.cos(perp) * (spread * maxArmLength * 0.08 + drift),
    y: base.y + Math.sin(perp) * (spread * maxArmLength * 0.08 + drift),
  };
  const shardAngle = angle + spread * 0.8;
  const size = 2.2 + source.granular * 3.4;
  return (
    <polygon
      points={crystalPoints(point, shardAngle, size)}
      fill="rgba(238,249,255,0.72)"
      fillOpacity={0.12 + source.granular * 0.22}
      stroke="rgba(238,249,255,0.22)"
      strokeWidth={0.35}
    />
  );
};

interface DynamicsRibsProps {
  center: Point;
  slot: ArmSlot;
  baseRadius: number;
  currentRadius: number;
  amount: number;
}

const DynamicsRibs: React.FC<DynamicsRibsProps> = ({ center, slot, baseRadius, currentRadius, amount }) => {
  const angle = slotAngle(slot);
  const perp = angle + Math.PI / 2;
  const count = Math.round(2 + amount * 5);
  return (
    <g opacity={0.18 + amount * 0.34}>
      {Array.from({ length: count }, (_, index) => {
        const t = (index + 1) / (count + 1);
        const origin = polar(center, angle, baseRadius + (currentRadius - baseRadius) * t);
        const half = 4 + amount * 12;
        return (
          <line
            key={index}
            x1={origin.x - Math.cos(perp) * half}
            y1={origin.y - Math.sin(perp) * half}
            x2={origin.x + Math.cos(perp) * half}
            y2={origin.y + Math.sin(perp) * half}
            stroke="rgba(238,249,255,0.52)"
            strokeWidth={0.8}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    width: '100%',
    overflow: 'hidden',
    background: 'radial-gradient(circle at 50% 42%, #122033 0%, #090e18 54%, #05070d 100%)',
    color: '#f4f8ff',
    fontFamily: "Avenir, 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    boxSizing: 'border-box',
    padding: 'calc(14px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom)) calc(14px + env(safe-area-inset-left))',
  },
  topBar: {
    display: 'grid',
    gridTemplateColumns: 'minmax(150px, 1fr) auto minmax(150px, 1fr)',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  titleBlock: {
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 800,
    color: 'rgba(255,255,255,0.92)',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(220,235,255,0.54)',
  },
  modeBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  stage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    padding: '8px 0',
  },
  svg: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%',
    touchAction: 'none',
    filter: 'drop-shadow(0 0 36px rgba(93,156,255,0.16))',
  },
  bottomBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
    width: 'min(860px, 100%)',
    justifySelf: 'center',
  },
  stat: {
    minWidth: 0,
    borderTop: '1px solid rgba(220,235,255,0.16)',
    paddingTop: 9,
  },
  statLabel: {
    display: 'block',
    fontSize: 10,
    color: 'rgba(220,235,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 4,
  },
  statValue: {
    display: 'block',
    fontSize: 12,
    color: 'rgba(255,255,255,0.86)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default SnowflakePrototypePage;
