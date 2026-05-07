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
          {Array.from({ length: 6 }, (_, slot) => (
            <ScaffoldArm
              key={`scaffold-${slot}`}
              slot={slot as ArmSlot}
              center={center}
              baseRadius={baseRadius}
              maxArmLength={maxArmLength}
              time={time}
            />
          ))}

          <circle
            cx={center.x}
            cy={center.y}
            r={baseRadius * (0.82 + globalFx.dynamics * 0.08)}
            fill="rgba(235,247,255,0.12)"
            stroke="rgba(235,247,255,0.42)"
            strokeWidth={1}
          />
          <polygon
            points={hexagonPoints(center, -Math.PI / 2, baseRadius * 0.52)}
            fill="rgba(245,251,255,0.16)"
            stroke="rgba(245,251,255,0.64)"
            strokeWidth={0.9}
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
                stroke="rgba(235,247,255,0.42)"
                strokeWidth={0.75}
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
              globalCharacter={globalFx.character}
              globalDynamics={globalFx.dynamics}
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
              : 'Feathers, beads, shards'}
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
  time: number;
}

const ScaffoldArm: React.FC<ScaffoldArmProps> = ({ slot, center, baseRadius, maxArmLength, time }) => {
  const angle = slotAngle(slot);
  const start = polar(center, angle, baseRadius * 0.92);
  const end = polar(center, angle, baseRadius + maxArmLength);
  const branchTs = [0.22, 0.36, 0.5, 0.64, 0.78];
  return (
    <g opacity={0.3 + Math.sin(time * 0.45 + slot) * 0.025}>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="rgba(230,244,255,0.32)"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      {branchTs.map((t, index) => {
        const origin = polar(center, angle, baseRadius + maxArmLength * t);
        const branchLength = maxArmLength * (0.095 - index * 0.009);
        return [-1, 1].map((side) => {
          const branchAngle = angle + side * (Math.PI / 5.6);
          const branchEnd = {
            x: origin.x + Math.cos(branchAngle) * branchLength,
            y: origin.y + Math.sin(branchAngle) * branchLength,
          };
          return (
            <line
              key={`${t}-${side}`}
              x1={origin.x}
              y1={origin.y}
              x2={branchEnd.x}
              y2={branchEnd.y}
              stroke="rgba(230,244,255,0.18)"
              strokeWidth={0.68}
              strokeLinecap="round"
            />
          );
        });
      })}
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
  globalCharacter: number;
  globalDynamics: number;
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
  globalCharacter,
  globalDynamics,
  index,
  onPointerDown,
  onHoverChange,
  onDoubleClick,
}) => {
  const { source, slot } = arm;
  const angle = slotAngle(slot);
  const seed = index * 13 + slot * 7;
  const rangeStartRadius = baseRadius + source.displayRange.min * maxArmLength;
  const rangeEndRadius = baseRadius + source.displayRange.max * maxArmLength;
  const currentRadius = baseRadius + source.displayNorm * maxArmLength;
  const authoredRadius = baseRadius + source.authoredNorm * maxArmLength;
  const start = polar(center, angle, baseRadius);
  const rangeStart = polar(center, angle, rangeStartRadius);
  const rangeEnd = polar(center, angle, rangeEndRadius);
  const current = polar(center, angle, currentRadius);
  const authored = polar(center, angle, authoredRadius);
  const labelPoint = polar(center, angle, Math.min(baseRadius + maxArmLength * 1.08, currentRadius + maxArmLength * 0.13));
  const labelVisible = hovered || selected;
  const stemWidth = 1.2 + source.score * 1.8 + globalDynamics * 0.35;
  const wobble = globalCharacter * 0.28 + source.granular * 0.08;
  const branchDensity = 0.65 + source.reverb * 0.55 + source.granular * 0.14;
  const delayCount = Math.round(Math.max(source.delayA, source.delayB) * 4);
  const shardCount = Math.round(source.granular * 5);
  const flashScale = source.flash ? 1.24 : 1;

  return (
    <g
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onDoubleClick={onDoubleClick}
    >
      <path
        d={linePath(center, slot, baseRadius, rangeEndRadius, wobble * 0.4, time, seed)}
        stroke="rgba(235,247,255,0.62)"
        strokeOpacity={0.1 + source.reverb * 0.12}
        strokeWidth={stemWidth + source.reverb * 2.8}
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
        d={linePath(center, slot, baseRadius, currentRadius, wobble, time, seed)}
        stroke="rgba(226,243,255,0.94)"
        strokeOpacity={0.82 + source.score * 0.12}
        strokeWidth={stemWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <line
        x1={start.x}
        y1={start.y}
        x2={current.x}
        y2={current.y}
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
        currentRadius={currentRadius}
        maxArmLength={maxArmLength}
        density={branchDensity}
        time={time}
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
          currentRadius={currentRadius}
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
          currentRadius={currentRadius}
          maxArmLength={maxArmLength}
          time={time}
        />
      ))}

      {globalDynamics > 0.05 && (
        <DynamicsRibs
          center={center}
          slot={slot}
          baseRadius={baseRadius}
          currentRadius={currentRadius}
          amount={globalDynamics}
        />
      )}

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
        point={current}
        angle={angle}
        color={source.color}
        size={(8 + source.score * 5) * flashScale}
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
  const sideAngle = angle + Math.PI / 2;
  const short = size * 0.56;
  const tine = size * 0.42;
  const back = {
    x: point.x - Math.cos(angle) * size * 0.34,
    y: point.y - Math.sin(angle) * size * 0.34,
  };
  const tip = {
    x: point.x + Math.cos(angle) * size * 0.26,
    y: point.y + Math.sin(angle) * size * 0.26,
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
        stroke="rgba(242,250,255,0.9)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {([-1, 1] as const).map((side) => {
        const across = {
          x: point.x + Math.cos(sideAngle) * side * short,
          y: point.y + Math.sin(sideAngle) * side * short,
        };
        const branchAngle = angle + side * Math.PI / 4.6;
        const feather = {
          x: point.x - Math.cos(angle) * size * 0.05 + Math.cos(branchAngle) * tine,
          y: point.y - Math.sin(angle) * size * 0.05 + Math.sin(branchAngle) * tine,
        };
        return (
          <g key={side}>
            <line
              x1={point.x}
              y1={point.y}
              x2={across.x}
              y2={across.y}
              stroke="rgba(242,250,255,0.82)"
              strokeWidth={0.95}
              strokeLinecap="round"
            />
            <line
              x1={point.x}
              y1={point.y}
              x2={feather.x}
              y2={feather.y}
              stroke="rgba(242,250,255,0.72)"
              strokeWidth={0.85}
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
  time: number;
}

interface FractalSegment {
  start: Point;
  end: Point;
  width: number;
  opacity: number;
}

function addFractalBranch(
  segments: FractalSegment[],
  start: Point,
  angle: number,
  length: number,
  depth: number,
  side: -1 | 1,
  density: number,
): void {
  if (length < 3 || depth < 0) return;
  const end = {
    x: start.x + Math.cos(angle) * length,
    y: start.y + Math.sin(angle) * length,
  };
  segments.push({
    start,
    end,
    width: 0.38 + depth * 0.28 + density * 0.18,
    opacity: 0.34 + depth * 0.14 + density * 0.13,
  });
  if (depth === 0) return;

  const childStarts = depth > 1 ? [0.44, 0.72] : [0.58];
  childStarts.forEach((t, index) => {
    const childStart = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
    const childAngle = angle + side * (0.58 - depth * 0.06 + index * 0.08);
    addFractalBranch(
      segments,
      childStart,
      childAngle,
      length * (0.42 - index * 0.08),
      depth - 1,
      side,
      density,
    );
  });
}

const FractalBranches: React.FC<FractalBranchesProps> = ({
  center,
  slot,
  baseRadius,
  currentRadius,
  maxArmLength,
  density,
  time,
}) => {
  const angle = slotAngle(slot);
  const armLength = Math.max(0, currentRadius - baseRadius);
  const branchCount = Math.round(2 + density * 3);
  const segments: FractalSegment[] = [];
  const anchors = Array.from({ length: branchCount }, (_, index) => 0.16 + (index / Math.max(1, branchCount - 1)) * 0.68);

  anchors.forEach((t, index) => {
    const origin = polar(center, angle, baseRadius + armLength * t);
    const pulse = 0.96 + Math.sin(time * 0.9 + slot * 0.7 + index * 0.5) * 0.035;
    const branchLength = armLength * (0.32 - t * 0.18 + density * 0.055) * pulse;
    const spread = 0.76 - t * 0.2 + density * 0.04;
    ([-1, 1] as const).forEach((side) => {
      addFractalBranch(
        segments,
        origin,
        angle + side * spread,
        branchLength,
        2,
        side,
        density,
      );
    });
  });

  const terminalAnchors = [0.9, 0.98];
  terminalAnchors.forEach((t, index) => {
    const origin = polar(center, angle, baseRadius + armLength * t);
    ([-1, 1] as const).forEach((side) => {
      addFractalBranch(
        segments,
        origin,
        angle + side * (0.48 + index * 0.1),
        maxArmLength * (0.035 + density * 0.02),
        1,
        side,
        density,
      );
    });
  });

  return (
    <g opacity={0.82}>
      {segments.map((segment, index) => (
        <line
          key={index}
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke="rgba(232,247,255,0.92)"
          strokeOpacity={segment.opacity}
          strokeWidth={segment.width}
          strokeLinecap="round"
        />
      ))}
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
    <circle
      cx={base.x + Math.cos(perp) * offset}
      cy={base.y + Math.sin(perp) * offset}
      r={0.95 + amount * 1.6 * (0.65 + pulse * 0.35)}
      fill="rgba(238,249,255,0.76)"
      fillOpacity={0.26 + amount * (0.12 + pulse * 0.14)}
      stroke="rgba(238,249,255,0.44)"
      strokeWidth={0.45}
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
