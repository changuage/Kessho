import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DualSliderRange } from '../../DualSlider';
import { QUANTIZATION, type SliderMode, type SliderState } from '../../state';

type BooleanSliderKey = {
  [K in keyof SliderState]: SliderState[K] extends boolean ? K : never
}[keyof SliderState];

type NumericSliderKey = {
  [K in keyof SliderState]: SliderState[K] extends number ? K : never
}[keyof SliderState];

type ZoneGroup = 'nature' | 'water' | 'samples';
type ZoneId =
  | 'birds'
  | 'birds2'
  | 'insects1'
  | 'insects2'
  | 'frogs'
  | 'hardDrops'
  | 'waterDrops'
  | 'bubbling'
  | 'turbulence'
  | 'surf'
  | 'channels'
  | 'waves';

type ZoneExtras = Record<string, number>;

type ZoneSpec = {
  id: ZoneId;
  label: string;
  shortLabel: string;
  accent: string;
  group: ZoneGroup;
  weight: number;
  enabled: (state: SliderState) => boolean;
  levelKey: NumericSliderKey;
  booleanKey?: BooleanSliderKey;
  reverbKey?: NumericSliderKey;
  toggleValue?: number;
  sub?: boolean;
  density: (state: SliderState) => number;
  intensity: (state: SliderState) => number;
  extras?: (state: SliderState) => ZoneExtras;
};

type ZoneData = Omit<ZoneSpec, 'enabled' | 'density' | 'intensity' | 'extras'> & {
  enabled: boolean;
  level: number;
  reverb: number;
  levelRail: ZoneRail;
  reverbRail: ZoneRail;
  densityValue: number;
  intensityValue: number;
  extras: ZoneExtras;
};

type DragAxis = 'pending' | 'level' | 'reverb';
type RailKind = 'level' | 'reverb';
type RailDragTarget = 'single' | 'min' | 'max' | 'range';
type QuantizationRange = { min: number; max: number; step: number };

type ZoneRail = {
  key?: NumericSliderKey;
  mode: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  currentValue: number;
};

type EarthSceneMixerProps = {
  state: SliderState;
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
};

const GROUP_LABELS: Record<ZoneGroup, string> = {
  nature: 'Nature',
  water: 'Water Layers',
  samples: 'Samples',
};

const DEAD_ZONE_PX = 5;
const BAR_HANDLE_PX = 12;
const LEVEL_SNAP = 0.05;
const WATER_LAYER_KEYS: readonly NumericSliderKey[] = [
  'waterLayerHardDrops',
  'waterLayerWaterDrops',
  'waterLayerBubbling',
  'waterLayerChannels',
  'waterLayerTurbulence',
  'waterLayerSurf',
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function numericValue(state: SliderState, key: NumericSliderKey | undefined): number {
  if (!key) return 0;
  const raw = state[key];
  return typeof raw === 'number' ? raw : 0;
}

function quantizationFor(key: NumericSliderKey): QuantizationRange | undefined {
  return (QUANTIZATION as Record<string, QuantizationRange>)[key];
}

function quantizeValue(key: NumericSliderKey, value: number): number {
  const q = quantizationFor(key);
  if (!q) return value;
  const clamped = clamp(value, q.min, q.max);
  return q.min + Math.round((clamped - q.min) / q.step) * q.step;
}

function valueFromRailClientY(rect: DOMRect, clientY: number): number {
  return clamp(1 - ((clientY - rect.top) / rect.height), 0, 1);
}

function railClientY(rect: DOMRect, value: number): number {
  return rect.top + (1 - clamp(value, 0, 1)) * rect.height;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ZONE_SPECS: readonly ZoneSpec[] = [
  {
    id: 'birds',
    label: 'Birds — Alps',
    shortLabel: 'Birds',
    accent: '#a5c4d4',
    group: 'nature',
    weight: 3,
    enabled: (state) => Boolean(state.birdsEnabled),
    levelKey: 'birdsLevel',
    booleanKey: 'birdsEnabled',
    toggleValue: 0.6,
    reverbKey: 'birdsReverbSend',
    density: (state) => state.birdsSliceDensity ?? 0.45,
    intensity: (state) => state.birdsLevel ?? 0,
    extras: (state) => ({ sliceDuration: state.birdsSliceDuration ?? 11.5 }),
  },
  {
    id: 'birds2',
    label: 'Birds — Fujian',
    shortLabel: 'Birds 2',
    accent: '#8ec5d4',
    group: 'nature',
    weight: 2,
    enabled: (state) => Boolean(state.birds2Enabled),
    levelKey: 'birds2Level',
    booleanKey: 'birds2Enabled',
    toggleValue: 0.52,
    reverbKey: 'birds2ReverbSend',
    density: (state) => state.birds2SliceDensity ?? 0.48,
    intensity: (state) => state.birds2Level ?? 0,
    extras: (state) => ({ sliceDuration: state.birds2SliceDuration ?? 10.8 }),
  },
  {
    id: 'insects1',
    label: 'Insects I',
    shortLabel: 'Insects I',
    accent: '#2ecc71',
    group: 'nature',
    weight: 2,
    enabled: (state) => Boolean(state.insectsEnabled),
    levelKey: 'insectsLevel',
    booleanKey: 'insectsEnabled',
    toggleValue: 0.55,
    reverbKey: 'insectsReverbSend',
    density: (state) => state.insectsDensity ?? 0,
    intensity: (state) => state.insectsTemperature ?? 0,
    extras: (state) => ({ motion: state.insectsMotion ?? 0 }),
  },
  {
    id: 'insects2',
    label: 'Insects II',
    shortLabel: 'Insects II',
    accent: '#27ae60',
    group: 'nature',
    weight: 2,
    enabled: (state) => Boolean(state.insects2Enabled),
    levelKey: 'insects2Level',
    booleanKey: 'insects2Enabled',
    toggleValue: 0.42,
    reverbKey: 'insectsReverbSend',
    density: (state) => state.insects2Density ?? 0,
    intensity: (state) => state.insects2Temperature ?? 0,
    extras: (state) => ({ motion: state.insects2Motion ?? 0 }),
  },
  {
    id: 'frogs',
    label: 'Frogs',
    shortLabel: 'Frogs',
    accent: '#b4b450',
    group: 'nature',
    weight: 2,
    enabled: (state) => Boolean(state.frogsEnabled),
    levelKey: 'frogsLevel',
    booleanKey: 'frogsEnabled',
    toggleValue: 0.5,
    reverbKey: 'frogsReverbSend',
    density: (state) => state.frogsSliceDensity ?? 0.52,
    intensity: (state) => state.frogsLevel ?? 0,
    extras: (state) => ({ sliceDuration: state.frogsSliceDuration ?? 9.2 }),
  },
  {
    id: 'hardDrops',
    label: 'Hard Drops',
    shortLabel: 'Hard',
    accent: '#5e8fb6',
    group: 'water',
    weight: 1,
    enabled: (state) => Boolean(state.waterEnabled) && (state.waterLayerHardDrops ?? 0) > 0.01,
    levelKey: 'waterLayerHardDrops',
    toggleValue: 0.35,
    sub: true,
    density: (state) => clamp((state.waterHardDropRate ?? 0) * 0.5, 0, 1),
    intensity: (state) => clamp(((state.waterHardness ?? 0) * 0.65) + ((state.waterHardDropTone ?? 0) * 0.35), 0, 1),
    extras: (state) => ({
      tone: state.waterHardDropTone ?? 0,
    }),
  },
  {
    id: 'waterDrops',
    label: 'Water Drops',
    shortLabel: 'Drops',
    accent: '#5aa2ce',
    group: 'water',
    weight: 1.1,
    enabled: (state) => Boolean(state.waterEnabled) && (state.waterLayerWaterDrops ?? 0) > 0.01,
    levelKey: 'waterLayerWaterDrops',
    toggleValue: 0.55,
    sub: true,
    density: (state) => clamp((state.waterWaterDropRate ?? 0) * 0.5, 0, 1),
    intensity: (state) => clamp(((state.waterDropSize ?? 0) * 0.7) + ((state.waterLevel ?? 0) * 0.3), 0, 1),
  },
  {
    id: 'bubbling',
    label: 'Bubbling',
    shortLabel: 'Bubbles',
    accent: '#4ab6cb',
    group: 'water',
    weight: 1,
    enabled: (state) => Boolean(state.waterEnabled) && (state.waterLayerBubbling ?? 0) > 0.01,
    levelKey: 'waterLayerBubbling',
    toggleValue: 0.6,
    sub: true,
    density: (state) => clamp((state.waterBubblingRate ?? 0) * 0.5, 0, 1),
    intensity: (state) => clamp((state.waterIntensity ?? 0) * 0.5 + (state.waterLevel ?? 0) * 0.5, 0, 1),
  },
  {
    id: 'channels',
    label: 'Channels',
    shortLabel: 'Channels',
    accent: '#2a6d98',
    group: 'water',
    weight: 1,
    enabled: (state) => Boolean(state.waterEnabled) && (state.waterLayerChannels ?? 0) > 0.01,
    levelKey: 'waterLayerChannels',
    toggleValue: 0.45,
    sub: true,
    density: (state) => clamp(state.waterChannelsSpeed ?? 0, 0, 1),
    intensity: (state) => clamp(state.waterChannelsMorph ?? 0, 0, 1),
    extras: (state) => ({
      morph: state.waterChannelsMorph ?? 0,
    }),
  },
  {
    id: 'turbulence',
    label: 'Turbulence',
    shortLabel: 'Turb',
    accent: '#3d7ca3',
    group: 'water',
    weight: 1,
    enabled: (state) => Boolean(state.waterEnabled) && (state.waterLayerTurbulence ?? 0) > 0.01,
    levelKey: 'waterLayerTurbulence',
    toggleValue: 0.45,
    sub: true,
    density: (state) => clamp((state.waterIntensity ?? 0) * 0.7 + (state.waterDistance ?? 0) * 0.3, 0, 1),
    intensity: (state) => clamp((((state.waterHardDropBaseFreq ?? state.waterBaseFreq ?? 0) +
      (state.waterWaterDropBaseFreq ?? state.waterBaseFreq ?? 0)) * 0.5) / 8000, 0, 1),
  },
  {
    id: 'surf',
    label: 'Surf',
    shortLabel: 'Surf',
    accent: '#2f7cb3',
    group: 'water',
    weight: 1.1,
    enabled: (state) => Boolean(state.waterEnabled) && (state.waterLayerSurf ?? 0) > 0.01,
    levelKey: 'waterLayerSurf',
    toggleValue: 0.5,
    sub: true,
    density: (state) => {
      const interval = state.waterSurfInterval ?? 12;
      return clamp(1 - ((interval - 3) / 22), 0, 1);
    },
    intensity: (state) => clamp(((state.waterSurfFoam ?? 0) * 0.5) + ((state.waterSurfProximity ?? 0) * 0.5), 0, 1),
    extras: (state) => ({
      foam: state.waterSurfFoam ?? 0,
      proximity: state.waterSurfProximity ?? 0,
      depth: state.waterSurfDepth ?? 0,
    }),
  },
  {
    id: 'waves',
    label: 'Waves',
    shortLabel: 'Waves',
    accent: '#00d4ff',
    group: 'samples',
    weight: 1,
    enabled: (state) => Boolean(state.oceanSampleEnabled),
    levelKey: 'oceanSampleLevel',
    booleanKey: 'oceanSampleEnabled',
    toggleValue: 0.55,
    reverbKey: 'oceanReverbSend',
    density: (state) => state.oceanSliceDensity ?? 0.38,
    intensity: (state) => clamp((state.oceanFilterResonance ?? 0) * 0.75 + (state.oceanSampleLevel ?? 0) * 0.25, 0, 1),
    extras: (state) => ({
      cutoff: state.oceanFilterCutoff ?? 8000,
      resonance: state.oceanFilterResonance ?? 0.1,
      sliceDuration: state.oceanSliceDuration ?? 22,
    }),
  },
];

const SceneVisual = memo(function SceneVisual({
  zone,
  highlighted,
}: {
  zone: ZoneData;
  highlighted: boolean;
}) {
  const levelBoost = highlighted ? 0.08 : 0;

  if (zone.id === 'birds' || zone.id === 'birds2') {
    const baseBirds = zone.id === 'birds2'
      ? [
          { x: 30, y: 14, scale: 0.82, fade: 7.3, delay: 0 },
          { x: 95, y: 36, scale: 0.74, fade: 8.7, delay: 2.3 },
          { x: 150, y: 10, scale: 0.84, fade: 8, delay: 4.7 },
          { x: 215, y: 40, scale: 0.74, fade: 9.3, delay: 1 },
          { x: 280, y: 18, scale: 0.82, fade: 8, delay: 6 },
          { x: 340, y: 32, scale: 0.74, fade: 7.3, delay: 3.3 },
          { x: 400, y: 12, scale: 0.78, fade: 8.7, delay: 7.3 },
          { x: 450, y: 38, scale: 0.72, fade: 8, delay: 1.7 },
          { x: 485, y: 24, scale: 0.72, fade: 9.3, delay: 4.3 },
        ]
      : [
          { x: 40, y: 18, scale: 1, fade: 8, delay: 0 },
          { x: 110, y: 42, scale: 0.88, fade: 9.3, delay: 2.7 },
          { x: 180, y: 12, scale: 1.02, fade: 7.3, delay: 5.3 },
          { x: 240, y: 50, scale: 0.88, fade: 8.7, delay: 1.3 },
          { x: 310, y: 22, scale: 0.96, fade: 10, delay: 6.7 },
          { x: 370, y: 38, scale: 0.88, fade: 8, delay: 4 },
          { x: 430, y: 14, scale: 1, fade: 9.3, delay: 8 },
          { x: 480, y: 46, scale: 0.8, fade: 8.7, delay: 4.7 },
        ];
    const count = clamp(
      Math.round(lerp(zone.id === 'birds2' ? 4 : 3, baseBirds.length, zone.densityValue)),
      1,
      baseBirds.length,
    );
    const motion = 0.55 + zone.densityValue * 1.45;
    const visibleBirds = baseBirds.slice(0, count);
    return (
      <svg viewBox="0 0 500 64" preserveAspectRatio="none" aria-hidden="true">
        <g
          className="earth-scene-bird-flock"
          style={{
            animationDuration: `${zone.id === 'birds2' ? 15 / motion : 20 / motion}s`,
            animationDirection: zone.id === 'birds2' ? 'reverse' : 'normal',
          }}
        >
          {visibleBirds.map((bird, index) => {
            const opacity = 0.42 + zone.level * 0.46 + levelBoost + (index % 3) * 0.07;
            return (
              <g
                key={`${zone.id}-bird-${index}`}
                className="earth-scene-bird-mark"
                transform={`translate(${bird.x} ${bird.y}) scale(${bird.scale})`}
                style={{
                  opacity,
                  animationDuration: `${bird.fade / motion}s`,
                  animationDelay: `${-bird.delay}s`,
                }}
              >
                <path
                  className="earth-scene-bird-wing"
                  d="M0,0 Q5,-5 10,0 Q15,-5 20,0"
                  fill="none"
                  stroke={zone.accent}
                  strokeWidth={zone.id === 'birds2' ? 1.55 : 1.8}
                  strokeLinecap="round"
                  style={{
                    animationDuration: `${(zone.id === 'birds2' ? 1.5 : 2.1) + (index % 4) * 0.28}s`,
                    animationDelay: `${-(0.1 + index * 0.35)}s`,
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
    );
  }

  if (zone.id === 'insects1' || zone.id === 'insects2') {
    const points = zone.id === 'insects2'
      ? [
          { x: 60, y: 16, r: 2.8, fade: 7, delay: 0, pulse: 2, pulseDelay: 0.3 },
          { x: 180, y: 28, r: 2.5, fade: 6, delay: 2.5, pulse: 2.4, pulseDelay: 1.2 },
          { x: 310, y: 12, r: 2.6, fade: 7.5, delay: 5, pulse: 1.8, pulseDelay: 0.7 },
          { x: 430, y: 24, r: 2.8, fade: 6.5, delay: 1, pulse: 2.2, pulseDelay: 2 },
          { x: 240, y: 32, r: 2.5, fade: 5.5, delay: 3.5, pulse: 2.6, pulseDelay: 1.6 },
        ]
      : [
          { x: 70, y: 14, r: 3.2, fade: 6, delay: 0, pulse: 1.2, pulseDelay: 0 },
          { x: 160, y: 26, r: 2.8, fade: 7, delay: 2, pulse: 1.6, pulseDelay: 0.3 },
          { x: 250, y: 10, r: 3, fade: 5.5, delay: 4, pulse: 1, pulseDelay: 0.8 },
          { x: 340, y: 30, r: 2.6, fade: 6.5, delay: 1, pulse: 1.4, pulseDelay: 0.15 },
          { x: 430, y: 18, r: 3, fade: 7.5, delay: 5, pulse: 1.1, pulseDelay: 1.1 },
          { x: 110, y: 32, r: 2.4, fade: 6, delay: 3, pulse: 1.3, pulseDelay: 0.6 },
          { x: 390, y: 8, r: 2.8, fade: 5.5, delay: 6, pulse: 1.5, pulseDelay: 0.45 },
        ];
    const count = clamp(
      Math.round(lerp(zone.id === 'insects2' ? 2 : 3, points.length, zone.densityValue)),
      1,
      points.length,
    );
    const tempo = 0.7 + zone.intensityValue * 1.4 + (zone.extras.motion ?? 0) * 0.4;
    return (
      <svg viewBox="0 0 500 40" preserveAspectRatio="none" aria-hidden="true">
        {points.slice(0, count).map((point, index) => {
          const opacity = 0.48 + zone.level * 0.34 + levelBoost;
          return (
            <g
              key={`${zone.id}-dot-${index}`}
              className="earth-scene-insect-cluster"
              style={{
                animationDuration: `${point.fade / tempo}s`,
                animationDelay: `${-point.delay}s`,
              }}
            >
              {zone.id === 'insects2' && (
                <>
                  <line x1={point.x - 7} y1={point.y - 3} x2={point.x - 3} y2={point.y - 6} stroke={hexToRgba(zone.accent, 0.5)} strokeWidth="1.35" opacity="0.65" />
                  <line x1={point.x + 7} y1={point.y - 3} x2={point.x + 3} y2={point.y - 6} stroke={hexToRgba(zone.accent, 0.5)} strokeWidth="1.35" opacity="0.65" />
                </>
              )}
              <circle
                className={zone.id === 'insects2' ? 'earth-scene-insect-pulse-alt' : 'earth-scene-insect-pulse'}
                cx={point.x}
                cy={point.y}
                r={point.r * 1.12}
                fill={hexToRgba(zone.accent, opacity)}
                style={{
                  animationDuration: `${point.pulse / tempo}s`,
                  animationDelay: `${-point.pulseDelay}s`,
                }}
              />
            </g>
          );
        })}
      </svg>
    );
  }

  if (zone.id === 'frogs') {
    const sources = [
      { x: 50, y: 25, r: 4, fade: 14, delay: 0, ripple: 3.5, rippleDelay: 0, secondDelay: 1.8 },
      { x: 140, y: 32, r: 3.5, fade: 16, delay: 5, ripple: 4, rippleDelay: 0.5, secondDelay: 2.5 },
      { x: 240, y: 18, r: 3.8, fade: 13, delay: 10, ripple: 3.8, rippleDelay: 1, secondDelay: -1 },
      { x: 330, y: 36, r: 3.5, fade: 15, delay: 3, ripple: 4.2, rippleDelay: 1.5, secondDelay: 3.5 },
      { x: 420, y: 22, r: 4, fade: 14, delay: 8, ripple: 3.6, rippleDelay: 2, secondDelay: -1 },
      { x: 480, y: 30, r: 3.2, fade: 12, delay: 13, ripple: 4.5, rippleDelay: 0.8, secondDelay: -1 },
    ];
    const count = clamp(Math.round(lerp(2, sources.length, zone.densityValue)), 1, sources.length);
    const pulse = 0.7 + zone.densityValue * 1.1;
    return (
      <svg viewBox="0 0 500 50" preserveAspectRatio="none" aria-hidden="true">
        {sources.slice(0, count).map((source, index) => {
          return (
            <g
              key={`${zone.id}-frog-${index}`}
              className="earth-scene-frog-source"
              style={{
                animationDuration: `${source.fade / pulse}s`,
                animationDelay: `${-source.delay}s`,
              }}
            >
              <circle cx={source.x} cy={source.y} r={source.r} fill={hexToRgba('#1a3a28', 0.64 + zone.level * 0.18)} />
              <circle
                className="earth-scene-ripple-ring"
                cx={source.x}
                cy={source.y}
                r="3"
                fill="none"
                stroke={hexToRgba(zone.accent, 0.48)}
                strokeWidth="2.6"
                style={{ animationDuration: `${source.ripple / pulse}s`, animationDelay: `${-source.rippleDelay}s` }}
              />
              {source.secondDelay >= 0 && (
                <circle
                  className="earth-scene-ripple-ring"
                  cx={source.x}
                  cy={source.y}
                  r="3"
                  fill="none"
                  stroke={hexToRgba(zone.accent, 0.36)}
                  strokeWidth="2.1"
                  style={{ animationDuration: `${source.ripple / pulse}s`, animationDelay: `${-source.secondDelay}s` }}
                />
              )}
              <circle
                className="earth-scene-ripple-ring"
                cx={source.x}
                cy={source.y}
                r="3"
                fill="none"
                stroke={hexToRgba(zone.accent, 0.22)}
                strokeWidth="1.55"
                style={{ animationDuration: `${(source.ripple + 0.7) / pulse}s`, animationDelay: `${-(source.rippleDelay + 0.9)}s` }}
              />
            </g>
          );
        })}
      </svg>
    );
  }

  if (zone.id === 'hardDrops') {
    const drops = [
      { x: 40, y: 8, opacity: 0.7, duration: 1.5, delay: 0 },
      { x: 105, y: 6, opacity: 0.6, duration: 1.9, delay: 0.5 },
      { x: 160, y: 9, opacity: 0.65, duration: 1.7, delay: 1.1 },
      { x: 230, y: 7, opacity: 0.6, duration: 2.1, delay: 0.3 },
      { x: 290, y: 8, opacity: 0.7, duration: 1.6, delay: 1.5 },
      { x: 345, y: 6, opacity: 0.55, duration: 2, delay: 0.8 },
      { x: 410, y: 10, opacity: 0.65, duration: 1.8, delay: 1.9 },
      { x: 470, y: 7, opacity: 0.6, duration: 2.2, delay: 1.3 },
    ];
    const count = clamp(Math.round(lerp(3, drops.length, zone.densityValue)), 1, drops.length);
    const fallRate = 0.7 + zone.densityValue * 1.2;
    const tone = zone.extras.tone ?? 0;
    return (
      <svg viewBox="0 0 500 40" preserveAspectRatio="none" aria-hidden="true">
        {drops.slice(0, count).map((drop, index) => {
          const scale = 0.9 + tone * 0.16 + (index % 2) * 0.06;
          return (
            <path
              key={`hard-drop-${index}`}
              className="earth-scene-harddrop-node"
              d={`M${drop.x},${drop.y + 9} Q${drop.x},${drop.y + 4} ${drop.x + 2.4},${drop.y + 2} Q${drop.x},${drop.y - 0.8} ${drop.x - 2.4},${drop.y + 2} Q${drop.x},${drop.y + 4} ${drop.x},${drop.y + 9} Z`}
              fill={hexToRgba(zone.accent, drop.opacity * (0.9 + zone.level * 0.34 + levelBoost))}
              style={{
                transformOrigin: `${drop.x}px ${drop.y}px`,
                animationDuration: `${drop.duration / fallRate}s`,
                animationDelay: `${-drop.delay}s`,
                transform: `scale(${scale})`,
              }}
            />
          );
        })}
      </svg>
    );
  }

  if (zone.id === 'waterDrops') {
    // Each drop fades in, ripples once (rings expand), then fades out
    const drops = [
      { x: 55, y: 21, r: 2.4, fade: 7, fadeDelay: 0 },
      { x: 155, y: 21, r: 2.1, fade: 8, fadeDelay: 2.5 },
      { x: 260, y: 21, r: 2.5, fade: 7.5, fadeDelay: 5.5 },
      { x: 360, y: 21, r: 2.0, fade: 8.5, fadeDelay: 1 },
      { x: 450, y: 21, r: 2.3, fade: 7, fadeDelay: 4 },
    ];
    const count = clamp(Math.round(lerp(2, drops.length, zone.densityValue)), 1, drops.length);
    const pulse = 0.5 + zone.densityValue * 0.8;
    return (
      <svg viewBox="0 0 500 42" preserveAspectRatio="none" aria-hidden="true">
        {drops.slice(0, count).map((drop, index) => {
          // Ring expansion matches the fade duration so it expands exactly once
          const fadeDur = drop.fade / pulse;
          return (
            <g
              key={`water-drop-ring-${index}`}
              className="earth-scene-waterdrop-source"
              style={{
                animationDuration: `${fadeDur}s`,
                animationDelay: `${-drop.fadeDelay}s`,
              }}
            >
              <g transform={`translate(${drop.x} ${drop.y})`}>
                <circle
                  cx="0" cy="0" r={drop.r * 0.5}
                  fill={hexToRgba('#e9fbff', 0.64 + zone.level * 0.2)}
                  className="earth-scene-waterdrop-dot"
                  style={{ animationDuration: `${fadeDur}s`, animationDelay: `${-drop.fadeDelay}s` }}
                />
                {/* Inner ring — expands once over the full fade cycle */}
                <g
                  className="earth-scene-waterdrop-ring"
                  style={{ animationDuration: `${fadeDur}s`, animationDelay: `${-drop.fadeDelay}s` }}
                >
                  <circle cx="0" cy="0" r="3" fill="none" stroke={hexToRgba(zone.accent, 0.72)} strokeWidth="2.2" />
                </g>
                {/* Mid ring — starts slightly later, expands wider */}
                <g
                  className="earth-scene-waterdrop-ring earth-scene-waterdrop-ring-mid"
                  style={{ animationDuration: `${fadeDur}s`, animationDelay: `${-(drop.fadeDelay - fadeDur * 0.12)}s` }}
                >
                  <circle cx="0" cy="0" r="3" fill="none" stroke={hexToRgba(zone.accent, 0.48)} strokeWidth="1.6" />
                </g>
                {/* Outer ring — starts later still */}
                <g
                  className="earth-scene-waterdrop-ring earth-scene-waterdrop-ring-outer"
                  style={{ animationDuration: `${fadeDur}s`, animationDelay: `${-(drop.fadeDelay - fadeDur * 0.25)}s` }}
                >
                  <circle cx="0" cy="0" r="3" fill="none" stroke={hexToRgba(zone.accent, 0.28)} strokeWidth="1.0" />
                </g>
              </g>
            </g>
          );
        })}
      </svg>
    );
  }

  if (zone.id === 'bubbling') {
    const bubbles = [
      { x: 80, y: 35, r: 3.5, duration: 2.5, delay: 0 },
      { x: 170, y: 33, r: 2.8, duration: 3, delay: 0.5 },
      { x: 260, y: 36, r: 3.3, duration: 2.8, delay: 1.2 },
      { x: 350, y: 34, r: 2.5, duration: 3.2, delay: 1.8 },
      { x: 430, y: 37, r: 3, duration: 2.6, delay: 0.3 },
      { x: 130, y: 38, r: 2.3, duration: 3.5, delay: 2.2 },
      { x: 400, y: 32, r: 1.8, duration: 2.2, delay: 1.5 },
    ];
    const count = clamp(Math.round(lerp(2, bubbles.length, zone.densityValue)), 1, bubbles.length);
    return (
      <svg viewBox="0 0 500 42" preserveAspectRatio="none" aria-hidden="true">
        {bubbles.slice(0, count).map((bubble, index) => {
          return (
            <circle
              key={`bubble-${index}`}
              className="earth-scene-bubble-node"
              cx={bubble.x}
              cy={bubble.y}
              r={bubble.r}
              fill="none"
              stroke={hexToRgba(zone.accent, 0.44 + zone.level * 0.24)}
              strokeWidth={bubble.r > 3 ? 2.3 : 1.8}
              style={{ animationDuration: `${bubble.duration}s`, animationDelay: `${-bubble.delay}s` }}
            />
          );
        })}
      </svg>
    );
  }

  if (zone.id === 'turbulence') {
    const flow = 0.6 + zone.densityValue * 1.3;
    return (
      <svg viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
        <g className="earth-scene-turbulence-track" style={{ animationDuration: `${9 / flow}s` }}>
          <path
            d="M-60 18 C-40 8,-20 28,0 15 C20 5,40 30,60 20 C80 10,100 25,120 18 C140 8,160 28,180 15 C200 5,220 30,240 20 C260 10,280 25,300 18 C320 8,340 28,360 15 C380 5,400 30,420 20 C440 10,460 25,480 18 C500 8,520 28,540 15 C560 5,580 30,600 20 C620 10,640 25,660 18"
            stroke={hexToRgba(zone.accent, 0.6)}
            strokeWidth="2.2"
            fill="none"
          />
          <path
            d="M-60 26 C-30 32,-10 18,20 28 C50 35,70 15,100 24 C130 32,150 18,180 28 C210 35,230 15,260 24 C290 32,310 18,340 28 C370 35,390 15,420 24 C450 32,470 18,500 28 C530 35,550 15,580 24 C610 32,630 18,660 28"
            stroke={hexToRgba(zone.accent, 0.45)}
            strokeWidth="1.55"
            fill="none"
          />
        </g>
      </svg>
    );
  }

  if (zone.id === 'surf') {
    const flow = 0.7 + zone.densityValue * 1.25;
    const foam = zone.extras.foam ?? 0;
    const proximity = zone.extras.proximity ?? 0;
    return (
      <svg viewBox="0 0 600 50" preserveAspectRatio="none" aria-hidden="true">
        <g className="earth-scene-surf-track" style={{ animationDuration: `${6 / flow}s` }}>
          <path
            d="M-40 30 Q-30 22,-20 30 Q-10 38,0 30 Q10 22,20 30 Q30 38,40 30 Q50 22,60 30 Q70 38,80 30 Q90 22,100 30 Q110 38,120 30 Q130 22,140 30 Q150 38,160 30 Q170 22,180 30 Q190 38,200 30 Q210 22,220 30 Q230 38,240 30 Q250 22,260 30 Q270 38,280 30 Q290 22,300 30 Q310 38,320 30 Q330 22,340 30 Q350 38,360 30 Q370 22,380 30 Q390 38,400 30 Q410 22,420 30 Q430 38,440 30 Q450 22,460 30 Q470 38,480 30 Q490 22,500 30 Q510 38,520 30 Q530 22,540 30 Q550 38,560 30 Q570 22,580 30 Q590 38,600 30 Q610 22,620 30 Q630 38,640 30"
            stroke={hexToRgba(zone.accent, 0.56 + proximity * 0.12)}
            strokeWidth="2.1"
            fill="none"
          />
          <path
            d="M-40 38 Q-30 32,-20 38 Q-10 44,0 38 Q10 32,20 38 Q30 44,40 38 Q50 32,60 38 Q70 44,80 38 Q90 32,100 38 Q110 44,120 38 Q130 32,140 38 Q150 44,160 38 Q170 32,180 38 Q190 44,200 38 Q210 32,220 38 Q230 44,240 38 Q250 32,260 38 Q270 44,280 38 Q290 32,300 38 Q310 44,320 38 Q330 32,340 38 Q350 44,360 38 Q370 32,380 38 Q390 44,400 38 Q410 32,420 38 Q430 44,440 38 Q450 32,460 38 Q470 44,480 38 Q490 32,500 38 Q510 44,520 38 Q530 32,540 38 Q550 44,560 38 Q570 32,580 38 Q590 44,600 38 Q610 32,620 38 Q630 44,640 38"
            stroke={hexToRgba(zone.accent, 0.4)}
            strokeWidth="1.45"
            fill="none"
          />
          {Array.from({ length: 10 }, (_, index) => (
            <circle
              key={`surf-foam-${index}`}
              className="earth-scene-surf-foam"
              cx={index * 40}
              cy={17 + (index % 4)}
              r={1.2 + (index % 3) * 0.3}
              fill={hexToRgba('#ffffff', 0.18 + foam * 0.26)}
              style={{ animationDuration: `${1.8 + (index % 4) * 0.25}s`, animationDelay: `${-(index * 0.35)}s` }}
            />
          ))}
        </g>
      </svg>
    );
  }

  if (zone.id === 'channels') {
    const flow = 0.55 + zone.densityValue * 1.4;
    const morph = zone.extras.morph ?? 0;
    // Flowing wind aesthetic — parallel undulating streams with dash-offset animation
    const streams = [
      { y: 8, amp: 3.5, freq: 0.012, phase: 0, w: 0.8, op: 0.55 },
      { y: 14, amp: 5, freq: 0.009, phase: 1.2, w: 1.0, op: 0.65 },
      { y: 20, amp: 6, freq: 0.007, phase: 2.8, w: 1.2, op: 0.7 },
      { y: 26, amp: 5, freq: 0.01, phase: 0.6, w: 1.0, op: 0.6 },
      { y: 32, amp: 3.8, freq: 0.013, phase: 3.5, w: 0.7, op: 0.48 },
    ];
    // Build a gentle wavy path for each wind stream
    const buildWindPath = (s: typeof streams[0]) => {
      const pts: string[] = [];
      for (let x = -60; x <= 720; x += 8) {
        const y = s.y + Math.sin(x * s.freq + s.phase) * s.amp
                      + Math.sin(x * s.freq * 2.3 + s.phase * 1.7) * s.amp * 0.3;
        pts.push(x === -60 ? `M${x} ${y}` : `L${x} ${y}`);
      }
      return pts.join(' ');
    };
    return (
      <svg viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
        <g className="earth-scene-channel-track" style={{ animationDuration: `${14 / flow}s` }}>
          {streams.map((s, i) => (
            <path
              key={`wind-${i}`}
              d={buildWindPath(s)}
              stroke={hexToRgba(zone.accent, s.op + morph * 0.1)}
              strokeWidth={s.w}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${12 + i * 3} ${6 + i * 2}`}
              className="earth-scene-channel-wind"
              style={{
                animationDuration: `${(3.5 + i * 0.7) / flow}s`,
                animationDirection: i % 2 === 0 ? 'normal' : 'reverse',
              }}
            />
          ))}
        </g>
      </svg>
    );
  }

  // Waves — Hokusai style with breathing amplitude (peaks grow and shrink)
  const baseAmplitude = 8 + zone.intensityValue * 10 + (zone.extras.resonance ?? 0) * 4.5;
  const cut = clamp(((zone.extras.cutoff ?? 8000) - 1500) / 9000, 0, 1);
  const waveSpeed = 0.8 + zone.densityValue * 1.35;
  const baseDuration = 11 + (zone.extras.sliceDuration ?? 22) * 0.08;
  const a = baseAmplitude;
  const period = 120;
  // Hokusai wave mirrored: curling crest on left → steep face down → long trough
  const buildHokusaiWave = (baseY: number, scale: number) => {
    const parts: string[] = [];
    for (let i = -1; i < 7; i++) {
      const x0 = i * period;
      parts.push(
        `${i === -1 ? 'M' : 'L'}${x0} ${baseY}`,
        // Rise into steep face then crest
        `C${x0 + period * 0.08} ${baseY + a * 0.04 * scale},${x0 + period * 0.14} ${baseY - a * 0.15 * scale},${x0 + period * 0.12} ${baseY - a * 0.45 * scale}`,
        // Curl tip — hooks forward
        `C${x0 + period * 0.09} ${baseY - a * 0.7 * scale},${x0 + period * 0.13} ${baseY - a * 0.95 * scale},${x0 + period * 0.17} ${baseY - a * scale}`,
        // Peak descends steeply
        `C${x0 + period * 0.20} ${baseY - a * 0.95 * scale},${x0 + period * 0.24} ${baseY - a * 0.7 * scale},${x0 + period * 0.30} ${baseY - a * 0.3 * scale}`,
        // Long gentle trough back to baseline
        `C${x0 + period * 0.40} ${baseY},${x0 + period * 0.55} ${baseY + a * 0.06 * scale},${x0 + period} ${baseY}`,
      );
    }
    return parts.join(' ');
  };
  return (
    <svg viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
      <g
        className="earth-scene-wave-track-back"
        style={{ animationDuration: `${baseDuration / waveSpeed}s` }}
      >
        <path
          d={buildHokusaiWave(26, 0.45)}
          stroke={hexToRgba(zone.accent, 0.28)}
          strokeWidth="1.15"
          fill="none"
          className="earth-scene-wave-breathe"
          style={{ animationDuration: `${8 + baseDuration * 0.4}s` }}
        />
      </g>
      <g
        className="earth-scene-wave-track"
        style={{ animationDuration: `${(baseDuration * 0.72) / waveSpeed}s` }}
      >
        <path
          d={buildHokusaiWave(30, 1)}
          stroke={hexToRgba(zone.accent, 0.65)}
          strokeWidth="1.8"
          fill="none"
          className="earth-scene-wave-breathe"
          style={{ animationDuration: `${6 + baseDuration * 0.35}s` }}
        />
        <path
          d={buildHokusaiWave(34, 0.55)}
          stroke={hexToRgba(zone.accent, 0.35)}
          strokeWidth="1.1"
          fill="none"
          className="earth-scene-wave-breathe"
          style={{ animationDuration: `${10 + baseDuration * 0.3}s` }}
        />
      </g>
      {Array.from({ length: 6 }, (_, index) => {
        const cx = index * period + period * 0.86;
        return (
          <circle
            key={`wave-foam-${index}`}
            className="earth-scene-wave-foam"
            cx={cx}
            cy={30 - a * 0.7 - (index % 2) * 1.5}
            r={1.0 + (index % 3) * 0.25}
            fill={hexToRgba('#ffffff', 0.1 + cut * 0.16)}
            style={{ animationDuration: `${2.2 + index * 0.3}s`, animationDelay: `${-index * 0.4}s` }}
          />
        );
      })}
    </svg>
  );
});

const SceneRail = memo(function SceneRail({
  zone,
  kind,
  highlighted,
  onPointerDown,
  onDoubleClick,
}: {
  zone: ZoneData;
  kind: RailKind;
  highlighted: boolean;
  onPointerDown: (
    zone: ZoneData,
    kind: RailKind,
    element: HTMLDivElement,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onDoubleClick: (zone: ZoneData, kind: RailKind) => void;
}) {
  const rail = kind === 'level' ? zone.levelRail : zone.reverbRail;
  const dualRange = rail.mode !== 'single' && rail.dualRange && rail.key ? rail.dualRange : null;
  const isDualMode = Boolean(dualRange);
  const minValue = dualRange ? dualRange.min : rail.currentValue;
  const maxValue = dualRange ? dualRange.max : rail.currentValue;
  const walkValue = rail.walkPosition != null ? clamp(rail.walkPosition, 0, 1) : null;

  return (
    <div
      className={`earth-scene-${kind}-bar earth-scene-rail${rail.key ? ' is-active' : ' is-disabled'}${isDualMode ? ' is-dual' : ''}${highlighted ? ' is-highlighted' : ''}`}
      onPointerDown={(event) => onPointerDown(zone, kind, event.currentTarget, event)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(zone, kind);
      }}
      title={rail.key ? `${kind === 'level' ? 'Level' : 'Reverb'} rail • double-click to cycle single / walk / S&H` : undefined}
    >
      <div className="earth-scene-rail-track" />
      {isDualMode && (
        <>
          <div
            className="earth-scene-rail-range"
            style={{
              bottom: `${minValue * 100}%`,
              height: `${Math.max((maxValue - minValue) * 100, 0)}%`,
              opacity: 0.18 + zone.level * 0.18,
            }}
          />
          <div
            className="earth-scene-rail-fill earth-scene-rail-fill-min"
            style={{ height: `${minValue * 100}%`, opacity: 0.18 + minValue * 0.34 }}
          />
        </>
      )}
      <div
        className="earth-scene-rail-fill earth-scene-rail-fill-max"
        style={{ height: `${maxValue * 100}%`, opacity: 0.26 + maxValue * 0.46 }}
      />
      {walkValue != null && (
        <div
          className="earth-scene-rail-walk"
          style={{ bottom: `${walkValue * 100}%` }}
        />
      )}
      {rail.key && (
        <>
          <div
            className="earth-scene-rail-handle earth-scene-rail-handle-max"
            style={{ bottom: `${maxValue * 100}%` }}
          />
          {isDualMode && (
            <div
              className="earth-scene-rail-handle earth-scene-rail-handle-min"
              style={{ bottom: `${minValue * 100}%` }}
            />
          )}
        </>
      )}
    </div>
  );
});

const SceneZone = memo(function SceneZone({
  zone,
  highlighted,
  dragAxis,
  onHover,
  onPointerDown,
  onRailPointerDown,
  onRailDoubleClick,
}: {
  zone: ZoneData;
  highlighted: boolean;
  dragAxis: DragAxis | null;
  onHover: (zoneId: ZoneId | null) => void;
  onPointerDown: (zone: ZoneData, element: HTMLDivElement, event: ReactPointerEvent<HTMLDivElement>) => void;
  onRailPointerDown: (
    zone: ZoneData,
    kind: RailKind,
    element: HTMLDivElement,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onRailDoubleClick: (zone: ZoneData, kind: RailKind) => void;
}) {
  const visualOpacity = 0.18 + zone.level * 0.9;
  const visualScale = zone.id === 'waves'
    ? 1 + zone.reverb * 0.015
    : 1 + zone.reverb * 0.05;
  const infoLabel = dragAxis === 'reverb' ? `${zone.label} Reverb` : zone.label;
  const infoValue = `${Math.round((dragAxis === 'reverb' ? zone.reverb : zone.level) * 100)}%`;
  const visualFilter = `brightness(${1.08 + zone.level * 0.34}) saturate(${1.06 + zone.level * 0.28})`;

  return (
    <div
      className={`earth-scene-zone${zone.sub ? ' subzone' : ''}${highlighted ? ' highlighted' : ''}${dragAxis ? ' dragging' : ''}${dragAxis === 'level' ? ' drag-level' : ''}${dragAxis === 'reverb' ? ' drag-reverb' : ''}`}
      style={{
        flex: '1 1 0%',
        ['--zone-accent' as const]: zone.accent,
        ['--zone-accent-soft' as const]: hexToRgba(zone.accent, 0.12),
      } as CSSProperties}
      onPointerDown={(event) => onPointerDown(zone, event.currentTarget, event)}
      onPointerEnter={() => onHover(zone.id)}
      onPointerLeave={() => onHover(null)}
    >
      <SceneRail
        zone={zone}
        kind="reverb"
        highlighted={highlighted && dragAxis === 'reverb'}
        onPointerDown={onRailPointerDown}
        onDoubleClick={onRailDoubleClick}
      />
      <SceneRail
        zone={zone}
        kind="level"
        highlighted={highlighted && dragAxis === 'level'}
        onPointerDown={onRailPointerDown}
        onDoubleClick={onRailDoubleClick}
      />
      <div
        className="earth-scene-zone-visual"
        style={{ opacity: visualOpacity, transform: `scale(${visualScale})`, filter: visualFilter }}
      >
        <SceneVisual zone={zone} highlighted={highlighted} />
      </div>
      <div className="earth-scene-zone-info">
        <span className="earth-scene-zone-info-label">{infoLabel}</span>
        <span className="earth-scene-zone-info-value">{infoValue}</span>
      </div>
    </div>
  );
});

const SceneEngineRow = memo(function SceneEngineRow({
  zone,
  highlighted,
  onHover,
  onToggle,
}: {
  zone: ZoneData;
  highlighted: boolean;
  onHover: (zoneId: ZoneId | null) => void;
  onToggle: (zone: ZoneData) => void;
}) {
  return (
    <button
      type="button"
      className={`earth-scene-engine-row${zone.sub ? ' sub' : ''}${zone.enabled ? '' : ' disabled'}${highlighted ? ' highlighted' : ''}`}
      onClick={() => onToggle(zone)}
      onMouseEnter={() => onHover(zone.id)}
      onMouseLeave={() => onHover(null)}
      title={zone.enabled ? `Disable ${zone.label}` : `Enable ${zone.label}`}
    >
      <span className={`earth-scene-engine-dot${zone.enabled ? ' on' : ' off'}`} style={{ background: zone.accent }} />
      <span className="earth-scene-engine-name">{zone.label}</span>
      <span className="earth-scene-engine-value">{zone.enabled ? `${Math.round(zone.level * 100)}%` : '—'}</span>
    </button>
  );
});

export function EarthSceneMixer({ state, onParamChange, onSelectChange, sliderProps }: EarthSceneMixerProps) {
  const dragRef = useRef<{
    zone: ZoneData;
    element: HTMLDivElement;
    startX: number;
    startY: number;
    axis: DragAxis;
  } | null>(null);
  const railDragRef = useRef<{
    zone: ZoneData;
    kind: RailKind;
    key: NumericSliderKey;
    element: HTMLDivElement;
    target: RailDragTarget;
    startValue: number;
    startMin: number;
    startMax: number;
  } | null>(null);

  const [hoveredZoneId, setHoveredZoneId] = useState<ZoneId | null>(null);
  const [dragState, setDragState] = useState<{ zoneId: ZoneId; axis: DragAxis } | null>(null);
  const [railDragState, setRailDragState] = useState<{ zoneId: ZoneId; axis: Exclude<DragAxis, 'pending'> } | null>(null);

  const zones = useMemo<ZoneData[]>(
    () => ZONE_SPECS.map((spec) => {
      const levelSlider = sliderProps(spec.levelKey);
      const reverbSlider = spec.reverbKey ? sliderProps(spec.reverbKey) : null;
      const extras = spec.extras ? spec.extras(state) : {};
      const zone: ZoneData = {
        ...spec,
        enabled: spec.enabled(state),
        level: numericValue(state, spec.levelKey),
        reverb: numericValue(state, spec.reverbKey),
        levelRail: {
          key: spec.levelKey,
          mode: levelSlider.mode,
          dualRange: levelSlider.dualRange,
          walkPosition: levelSlider.walkPosition,
          currentValue: numericValue(state, spec.levelKey),
        },
        reverbRail: {
          key: spec.reverbKey,
          mode: reverbSlider?.mode ?? 'single',
          dualRange: reverbSlider?.dualRange,
          walkPosition: reverbSlider?.walkPosition,
          currentValue: numericValue(state, spec.reverbKey),
        },
        densityValue: clamp(spec.density(state), 0, 1),
        intensityValue: clamp(spec.intensity(state), 0, 1),
        extras,
      };
      return zone;
    }),
    [sliderProps, state],
  );

  const groupedZones = useMemo(
    () => ({
      nature: zones.filter((zone) => zone.group === 'nature'),
      water: zones.filter((zone) => zone.group === 'water'),
      samples: zones.filter((zone) => zone.group === 'samples'),
    }),
    [zones],
  );

  const activeZones = useMemo(
    () => zones.filter((zone) => zone.enabled),
    [zones],
  );

  const sceneHeight = useMemo(() => {
    return clamp(activeZones.length * 46, 220, 520);
  }, [activeZones]);

  const setLevelForZone = useCallback((zone: ZoneData, clientX: number) => {
    const rect = dragRef.current?.element.getBoundingClientRect();
    if (!rect) return;
    const value = clamp((clientX - rect.left) / rect.width, 0, 1);
    onParamChange(zone.levelKey, snap(value, LEVEL_SNAP));
  }, [onParamChange]);

  const setReverbForZone = useCallback((zone: ZoneData, clientY: number) => {
    if (!zone.reverbKey) return;
    const rect = dragRef.current?.element.getBoundingClientRect();
    if (!rect) return;
    const value = clamp(1 - ((clientY - rect.top) / rect.height), 0, 1);
    onParamChange(zone.reverbKey, snap(value, LEVEL_SNAP));
  }, [onParamChange]);

  const handleRailValueChange = useCallback((drag: NonNullable<typeof railDragRef.current>, clientY: number) => {
    const rect = drag.element.getBoundingClientRect();
    const rawValue = valueFromRailClientY(rect, clientY);
    const slider = sliderProps(drag.key);
    const q = quantizationFor(drag.key);
    if (!q) return;

    if (drag.target === 'single' || slider.mode === 'single' || !slider.dualRange) {
      onParamChange(drag.key, quantizeValue(drag.key, rawValue));
      return;
    }

    if (drag.target === 'min') {
      slider.onDualRangeChange(
        drag.key,
        Math.min(quantizeValue(drag.key, rawValue), drag.startMax),
        drag.startMax,
      );
      return;
    }

    if (drag.target === 'max') {
      slider.onDualRangeChange(
        drag.key,
        drag.startMin,
        Math.max(quantizeValue(drag.key, rawValue), drag.startMin),
      );
      return;
    }

    const delta = rawValue - drag.startValue;
    let nextMin = drag.startMin + delta;
    let nextMax = drag.startMax + delta;
    const span = drag.startMax - drag.startMin;
    if (nextMin < q.min) {
      nextMin = q.min;
      nextMax = q.min + span;
    }
    if (nextMax > q.max) {
      nextMax = q.max;
      nextMin = q.max - span;
    }
    nextMin = quantizeValue(drag.key, nextMin);
    nextMax = quantizeValue(drag.key, nextMax);
    if (nextMax < nextMin) {
      nextMax = nextMin;
    }
    slider.onDualRangeChange(drag.key, nextMin, nextMax);
  }, [onParamChange, sliderProps]);

  useEffect(() => {
    if (!dragState) return undefined;

    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.axis === 'pending') {
        const dx = Math.abs(event.clientX - drag.startX);
        const dy = Math.abs(event.clientY - drag.startY);
        if (Math.max(dx, dy) < DEAD_ZONE_PX) return;

        drag.axis = dy > dx && drag.zone.reverbKey ? 'reverb' : 'level';
        setDragState({ zoneId: drag.zone.id, axis: drag.axis });
      }

      if (drag.axis === 'reverb') {
        setReverbForZone(drag.zone, event.clientY);
      } else {
        setLevelForZone(drag.zone, event.clientX);
      }
    };

    const handleUp = () => {
      setDragState(null);
      setHoveredZoneId(null);
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragState, setLevelForZone, setReverbForZone]);

  useEffect(() => {
    if (!railDragState) return undefined;

    const handleMove = (event: PointerEvent) => {
      const drag = railDragRef.current;
      if (!drag) return;
      handleRailValueChange(drag, event.clientY);
    };

    const handleUp = () => {
      setRailDragState(null);
      setHoveredZoneId(null);
      railDragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [handleRailValueChange, railDragState]);

  const handleZonePointerDown = useCallback((
    zone: ZoneData,
    element: HTMLDivElement,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    dragRef.current = {
      zone,
      element,
      startX: event.clientX,
      startY: event.clientY,
      axis: 'pending',
    };
    setHoveredZoneId(zone.id);
    setDragState({ zoneId: zone.id, axis: 'pending' });
  }, []);

  const handleHover = useCallback((zoneId: ZoneId | null) => {
    setHoveredZoneId((current) => (dragState || railDragState ? current : zoneId));
  }, [dragState, railDragState]);

  const handleRailPointerDown = useCallback((
    zone: ZoneData,
    kind: RailKind,
    element: HTMLDivElement,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rail = kind === 'level' ? zone.levelRail : zone.reverbRail;
    if (!rail.key) return;

    const rect = element.getBoundingClientRect();
    const clientY = event.clientY;
    const currentValue = rail.currentValue;
    const minValue = rail.dualRange?.min ?? currentValue;
    const maxValue = rail.dualRange?.max ?? currentValue;
    let target: RailDragTarget = 'single';

    if (rail.mode !== 'single' && rail.dualRange) {
      const minY = railClientY(rect, minValue);
      const maxY = railClientY(rect, maxValue);
      if (Math.abs(clientY - minY) <= BAR_HANDLE_PX) {
        target = 'min';
      } else if (Math.abs(clientY - maxY) <= BAR_HANDLE_PX) {
        target = 'max';
      } else if (clientY >= maxY && clientY <= minY) {
        target = 'range';
      } else {
        target = Math.abs(clientY - minY) < Math.abs(clientY - maxY) ? 'min' : 'max';
      }
    }

    railDragRef.current = {
      zone,
      kind,
      key: rail.key,
      element,
      target,
      startValue: valueFromRailClientY(rect, clientY),
      startMin: minValue,
      startMax: maxValue,
    };
    setHoveredZoneId(zone.id);
    setRailDragState({ zoneId: zone.id, axis: kind });
    handleRailValueChange(railDragRef.current, clientY);
  }, [handleRailValueChange]);

  const handleRailDoubleClick = useCallback((zone: ZoneData, kind: RailKind) => {
    const rail = kind === 'level' ? zone.levelRail : zone.reverbRail;
    if (!rail.key) return;
    sliderProps(rail.key).onCycleMode(rail.key);
  }, [sliderProps]);

  const handleToggle = useCallback((zone: ZoneData) => {
    if (zone.booleanKey) {
      const nextEnabled = !zone.enabled;
      onSelectChange(zone.booleanKey, nextEnabled as SliderState[typeof zone.booleanKey]);
      if (nextEnabled && zone.level <= 0.01) {
        onParamChange(zone.levelKey, zone.toggleValue ?? 0.5);
      }
      return;
    }

    if (!state.waterEnabled) {
      WATER_LAYER_KEYS.forEach((key) => {
        if (key !== zone.levelKey && typeof state[key] === 'number' && (state[key] as number) > 0.01) {
          onParamChange(key, 0);
        }
      });
    }
    onParamChange(zone.levelKey, zone.enabled ? 0 : (zone.toggleValue ?? 0.5));
  }, [onParamChange, state, state.waterEnabled]);

  const activeZoneHeight = useMemo(() => `min(56vh, ${sceneHeight}px)`, [sceneHeight]);
  const highlightedZoneId = railDragState?.zoneId ?? dragState?.zoneId ?? hoveredZoneId;
  const activeDragAxis = railDragState?.axis ?? (dragState && dragState.axis !== 'pending' ? dragState.axis : null);

  return (
    <div className="earth-scene-container">
      <div className="earth-scene-header">
        <span className="earth-scene-title">Earth Scene</span>
        <span className="earth-scene-hint">toggle on the left • drag strip ↔ / ↕ • drag rails for ranges • double-click rails for walk / S&amp;H</span>
      </div>
      <div className="earth-scene-split">
        <div className="earth-scene-engines" aria-label="Earth scene engines">
          {(Object.keys(GROUP_LABELS) as ZoneGroup[]).map((group) => {
            const groupZones = groupedZones[group];
            if (groupZones.length === 0) return null;
            return (
              <div key={group} className="earth-scene-group">
                <div className="earth-scene-group-header">
                  <span className="earth-scene-group-label">{GROUP_LABELS[group]}</span>
                  <span className="earth-scene-group-line" />
                </div>
                {groupZones.map((zone) => (
                  <SceneEngineRow
                    key={zone.id}
                    zone={zone}
                    highlighted={highlightedZoneId === zone.id}
                    onHover={handleHover}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div className="earth-scene-view">
          {activeZones.length === 0 ? (
            <div className="earth-scene-empty">Enable a layer to build the environment</div>
          ) : (
            <div className="earth-scene-strips" style={{ height: activeZoneHeight }}>
              {activeZones.map((zone) => (
                <SceneZone
                  key={zone.id}
                  zone={zone}
                  highlighted={highlightedZoneId === zone.id}
                  dragAxis={highlightedZoneId === zone.id ? activeDragAxis : null}
                  onHover={handleHover}
                  onPointerDown={handleZonePointerDown}
                  onRailPointerDown={handleRailPointerDown}
                  onRailDoubleClick={handleRailDoubleClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
