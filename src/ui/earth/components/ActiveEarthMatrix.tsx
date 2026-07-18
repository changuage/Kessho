import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { DualSliderRange } from '../../DualSlider';
import { useSliderHelp } from '../../SliderHelpOverlay';
import { QUANTIZATION, type SliderMode, type SliderState } from '../../state';
import { useAnimationVisibility } from '../../hooks/useAnimationVisibility';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { useRuntimeSliderIndicator } from '../../runtimeSliderState';
import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  TRACK_PAD_PX,
  clamp01,
  getDualHandle,
  getTouchGestureIntent,
  normToValue,
  normalizeQuantizedRange,
  pointerToTrackNorm,
  quantizeValue,
  releasePointerCaptureSafely,
  setSliderTouchSelectionLock,
  shiftRangePreservingWidth,
  stepDecimals,
  trackLeftCalc,
  trackWidthCalc,
  useRafCoalescedEmitter,
  valueToNorm,
  type MatrixCellHandle,
  type QuantizationRange,
} from '../../sliderSystem';
import '../../sliderSystem/matrixSurface.css';
import { INSECT_ENGINES } from '../../../audio/waterPresets';
import type { EarthTextureDebugState } from '../../../audio/engineSharedTypes';
import { EARTH_ENGINE_COLORS, SOURCE_COLORS } from '../../../designSystem/colors';
import { NatureSliceViz } from './NatureSliceViz';

type NumericSliderKey = {
  [K in keyof SliderState]: SliderState[K] extends number ? K : never
}[keyof SliderState];

type BooleanSliderKey = {
  [K in keyof SliderState]: SliderState[K] extends boolean ? K : never
}[keyof SliderState];

type PreviewKind =
  | 'master'
  | 'waves'
  | 'water'
  | 'nature'
  | 'birds'
  | 'frogs'
  | 'insects'
  | 'hardDrops'
  | 'waterDrops'
  | 'bubbling'
  | 'channels'
  | 'turbulence'
  | 'surf';
type CellHandle = MatrixCellHandle;
type SharedColumnId = 'level' | 'space' | 'delayA' | 'delayB' | 'granular';

type SliderRuntime = {
  mode: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
};

type MatrixControl = {
  key: NumericSliderKey;
  label: string;
  accent: string;
  format?: (value: number) => string;
  logarithmic?: boolean;
};

type SharedCell =
  | { kind: 'slider'; control: MatrixControl }
  | { kind: 'static'; text: string }
  | { kind: 'blocked'; text?: string };

type SharedRow = {
  id: string;
  label: string;
  detail?: string;
  accent: string;
  toggle: () => void;
  toggleTitle: string;
  cells: Record<SharedColumnId, SharedCell>;
};

type ChildRow = {
  id: string;
  label: string;
  family: string;
  accent: string;
  preview: PreviewKind;
  density: number;
  intensity: number;
  toggle: () => void;
  toggleTitle: string;
  level: MatrixControl;
  info?: string;
  textureDebugKey?: keyof EarthTextureDebugState;
};

type SelectorChip = {
  id: string;
  label: string;
  accent: string;
  active: boolean;
  onToggle: () => void;
};

type SelectorGroup = {
  label: string;
  chips: SelectorChip[];
};

type ActiveEarthMatrixProps = {
  state: SliderState;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  getEarthTextureDebugState: () => EarthTextureDebugState;
  textureDebugAvailable?: boolean;
};

const EMPTY_EARTH_TEXTURE_DEBUG_STATE: EarthTextureDebugState = {
  waves: null,
  birds: null,
  birds2: null,
  frogs: null,
};

const MOBILE_EARTH_MATRIX_QUERY = '(max-width: 760px)';
const ACTIVE_EARTH_MATRIX_HELP_KEY = 'activeEarthMatrix';

const SHARED_COLUMNS: Array<{ id: SharedColumnId; label: string }> = [
  { id: 'level', label: 'Level' },
  { id: 'space', label: 'Space' },
  { id: 'delayA', label: 'Delay A' },
  { id: 'delayB', label: 'Delay B' },
  { id: 'granular', label: 'Granular' },
];
const DEFAULT_SHARED_COLUMN: SharedColumnId = SHARED_COLUMNS[0]?.id ?? 'level';

const WATER_LAYER_KEYS: readonly NumericSliderKey[] = [
  'waterLayerHardDrops',
  'waterLayerWaterDrops',
  'waterLayerBubbling',
  'waterLayerChannels',
  'waterLayerTurbulence',
  'waterLayerSurf',
] as const;

const routeAccent = (color: string, amount = 40): string => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

function numeric(state: SliderState, key: NumericSliderKey): number {
  return Number(state[key] ?? 0) || 0;
}

function previewStyle(accent: string, density: number, intensity: number): CSSProperties {
  return {
    '--row-accent': accent,
    '--preview-density': String(clamp01(density)),
    '--preview-intensity': String(clamp01(intensity)),
  } as CSSProperties;
}

function sliderCell(control: MatrixControl): SharedCell {
  return { kind: 'slider', control };
}

function formatValue(control: MatrixControl, value: number, info: QuantizationRange): string {
  if (control.format) return control.format(value);
  if (info.min === 0 && info.max === 1) return `${Math.round(clamp01(value) * 100)}%`;
  const decimals = Math.min(3, stepDecimals(info.step));
  if (decimals === 0) return `${Math.round(value)}`;
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function rangeReadout(
  mode: SliderMode,
  control: MatrixControl,
  range: DualSliderRange | undefined,
  info: QuantizationRange,
): string {
  if (!range) return formatValue(control, info.min, info);
  const icon = mode === 'walk' ? '↝' : '⊡';
  return `${icon}${formatValue(control, range.min, info)}–${formatValue(control, range.max, info)}`;
}

function channelsMorphLabel(value: number): string {
  if (value < 0.3) return 'Stream';
  if (value > 0.7) return 'Wind';
  return 'Blend';
}

const MatrixPreview = memo(function MatrixPreview({
  kind,
  accent,
  density,
  intensity,
}: {
  kind: PreviewKind;
  accent: string;
  density: number;
  intensity: number;
}) {
  if (kind === 'waterDrops' || kind === 'frogs') {
    return (
      <div className={`earth-active-preview ${kind}`} style={previewStyle(accent, density, intensity)}>
        <span className="ring ring-a" />
        <span className="ring ring-b" />
        <span className="ring ring-c" />
      </div>
    );
  }

  if (kind === 'hardDrops' || kind === 'bubbling' || kind === 'insects') {
    return (
      <div className={`earth-active-preview ${kind}`} style={previewStyle(accent, density, intensity)}>
        <span className="node node-a" />
        <span className="node node-b" />
        <span className="node node-c" />
        <span className="node node-d" />
      </div>
    );
  }

  return (
    <div className={`earth-active-preview ${kind}`} style={previewStyle(accent, density, intensity)}>
      <span className="stroke stroke-a" />
      <span className="stroke stroke-b" />
      <span className="stroke stroke-c" />
      <span className="stroke stroke-d" />
    </div>
  );
});

function SectionToggle({
  active,
  onClick,
  title,
}: {
  active: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`layer-toggle ${active ? 'on' : ''}`}
      onClick={onClick}
      title={title}
    >
      {active ? '●' : '○'}
    </button>
  );
}

export function ActiveEarthMatrix({
  state,
  onParamChange,
  onSelectChange,
  sliderProps,
  getEarthTextureDebugState,
  textureDebugAvailable = true,
}: ActiveEarthMatrixProps) {
  const { announceHelp } = useSliderHelp();
  const anyWaterChildActive = WATER_LAYER_KEYS.some((key) => numeric(state, key) > 0.01);
  const anyNatureChildActive = state.birdsEnabled || state.birds2Enabled || state.frogsEnabled;
  const anyInsectChildActive = state.insectsEnabled || state.insects2Enabled;
  const announceMatrixHelp = useCallback(() => {
    announceHelp(ACTIVE_EARTH_MATRIX_HELP_KEY, { page: 'earth', label: 'Active Earth Matrix' });
  }, [announceHelp]);

  const ensureAudibleLevel = useCallback((key: NumericSliderKey, fallback: number) => {
    if (numeric(state, key) <= 0.01) {
      onParamChange(key, fallback);
    }
  }, [onParamChange, state]);

  const toggleBooleanChild = useCallback((
    enabledKey: BooleanSliderKey,
    levelKey?: NumericSliderKey,
    levelFallback = 0.5,
  ) => {
    const current = Boolean(state[enabledKey]);
    onSelectChange(enabledKey, (!current) as SliderState[typeof enabledKey]);
    if (!current && levelKey) {
      ensureAudibleLevel(levelKey, levelFallback);
    }
  }, [ensureAudibleLevel, onSelectChange, state]);

  const toggleWaves = useCallback(() => {
    const active = Boolean(state.oceanSampleEnabled);
    onSelectChange('oceanSampleEnabled', !active);
    if (!active) ensureAudibleLevel('oceanSampleLevel', 0.55);
  }, [ensureAudibleLevel, onSelectChange, state.oceanSampleEnabled]);

  const toggleWaterChild = useCallback((key: NumericSliderKey) => {
    const current = numeric(state, key);
    if (current > 0.01) {
      onParamChange(key, 0);
      const otherActive = WATER_LAYER_KEYS.some((otherKey) => otherKey !== key && numeric(state, otherKey) > 0.01);
      if (!otherActive) onSelectChange('waterEnabled', false);
      return;
    }

    onSelectChange('waterEnabled', true);
    ensureAudibleLevel('waterLevel', 0.65);
    onParamChange(key, 0.5);
  }, [ensureAudibleLevel, onParamChange, onSelectChange, state]);

  const disableWaterFamily = useCallback(() => {
    WATER_LAYER_KEYS.forEach((key) => onParamChange(key, 0));
    onSelectChange('waterEnabled', false);
  }, [onParamChange, onSelectChange]);

  const disableNatureFamily = useCallback(() => {
    onSelectChange('birdsEnabled', false);
    onSelectChange('birds2Enabled', false);
    onSelectChange('frogsEnabled', false);
  }, [onSelectChange]);

  const disableInsectsFamily = useCallback(() => {
    onSelectChange('insectsEnabled', false);
    onSelectChange('insects2Enabled', false);
  }, [onSelectChange]);

  const selectorGroups = useMemo<SelectorGroup[]>(() => [
    {
      label: 'Waves',
      chips: [
        {
          id: 'waves',
          label: 'Waves',
          accent: EARTH_ENGINE_COLORS.waves,
          active: Boolean(state.oceanSampleEnabled),
          onToggle: toggleWaves,
        },
      ],
    },
    {
      label: 'Water',
      chips: [
        {
          id: 'water-hard',
          label: 'Hard Drops',
          accent: EARTH_ENGINE_COLORS.waterHardDrops,
          active: numeric(state, 'waterLayerHardDrops') > 0.01,
          onToggle: () => toggleWaterChild('waterLayerHardDrops'),
        },
        {
          id: 'water-drops',
          label: 'Water Drops',
          accent: EARTH_ENGINE_COLORS.waterDrops,
          active: numeric(state, 'waterLayerWaterDrops') > 0.01,
          onToggle: () => toggleWaterChild('waterLayerWaterDrops'),
        },
        {
          id: 'water-bubbling',
          label: 'Bubbling',
          accent: EARTH_ENGINE_COLORS.waterBubbling,
          active: numeric(state, 'waterLayerBubbling') > 0.01,
          onToggle: () => toggleWaterChild('waterLayerBubbling'),
        },
        {
          id: 'water-channels',
          label: 'Channels',
          accent: EARTH_ENGINE_COLORS.waterChannels,
          active: numeric(state, 'waterLayerChannels') > 0.01,
          onToggle: () => toggleWaterChild('waterLayerChannels'),
        },
        {
          id: 'water-turbulence',
          label: 'Turbulence',
          accent: EARTH_ENGINE_COLORS.waterTurbulence,
          active: numeric(state, 'waterLayerTurbulence') > 0.01,
          onToggle: () => toggleWaterChild('waterLayerTurbulence'),
        },
        {
          id: 'water-surf',
          label: 'Surf',
          accent: EARTH_ENGINE_COLORS.waterSurf,
          active: numeric(state, 'waterLayerSurf') > 0.01,
          onToggle: () => toggleWaterChild('waterLayerSurf'),
        },
      ],
    },
    {
      label: 'Nature',
      chips: [
        {
          id: 'birds',
          label: 'Birds Alps',
          accent: EARTH_ENGINE_COLORS.birds,
          active: Boolean(state.birdsEnabled),
          onToggle: () => {
            if (!state.birdsEnabled) ensureAudibleLevel('natureLevel', 0.7);
            toggleBooleanChild('birdsEnabled', 'birdsLevel', 0.5);
          },
        },
        {
          id: 'birds2',
          label: 'Birds Fujian',
          accent: EARTH_ENGINE_COLORS.birds2,
          active: Boolean(state.birds2Enabled),
          onToggle: () => {
            if (!state.birds2Enabled) ensureAudibleLevel('natureLevel', 0.7);
            toggleBooleanChild('birds2Enabled', 'birds2Level', 0.5);
          },
        },
        {
          id: 'frogs',
          label: 'Frogs',
          accent: EARTH_ENGINE_COLORS.frogs,
          active: Boolean(state.frogsEnabled),
          onToggle: () => {
            if (!state.frogsEnabled) ensureAudibleLevel('natureLevel', 0.7);
            toggleBooleanChild('frogsEnabled', 'frogsLevel', 0.5);
          },
        },
      ],
    },
    {
      label: 'Insects',
      chips: [
        {
          id: 'insects1',
          label: 'Insects 1',
          accent: EARTH_ENGINE_COLORS.insects,
          active: Boolean(state.insectsEnabled),
          onToggle: () => toggleBooleanChild('insectsEnabled', 'insectsLevel', 0.5),
        },
        {
          id: 'insects2',
          label: 'Insects 2',
          accent: EARTH_ENGINE_COLORS.insects2,
          active: Boolean(state.insects2Enabled),
          onToggle: () => toggleBooleanChild('insects2Enabled', 'insects2Level', 0.5),
        },
      ],
    },
  ], [ensureAudibleLevel, state, toggleBooleanChild, toggleWaves, toggleWaterChild]);

  const sharedRows = useMemo<SharedRow[]>(() => {
    const rows: SharedRow[] = [];

    if (state.oceanSampleEnabled) {
      rows.push({
        id: 'shared-waves',
        label: 'Waves',
        detail: 'shared routing',
        accent: EARTH_ENGINE_COLORS.waves,
        toggle: () => onSelectChange('oceanSampleEnabled', false),
        toggleTitle: 'Disable Waves',
        cells: {
          level: sliderCell({ key: 'oceanSampleLevel', label: 'Waves Level', accent: routeAccent(EARTH_ENGINE_COLORS.waves, 44) }),
          space: sliderCell({ key: 'oceanReverbSend', label: 'Waves Reverb', accent: routeAccent(SOURCE_COLORS.reverb, 38) }),
          delayA: sliderCell({ key: 'oceanDelayASend', label: 'Waves Delay A', accent: routeAccent(SOURCE_COLORS.delayA, 34) }),
          delayB: sliderCell({ key: 'oceanDelayBSend', label: 'Waves Delay B', accent: routeAccent(SOURCE_COLORS.delayB, 30) }),
          granular: sliderCell({ key: 'granularWavesSend', label: 'Waves Granular', accent: routeAccent(SOURCE_COLORS.granular, 34) }),
        },
      });
    }

    if (anyWaterChildActive) {
      rows.push({
        id: 'shared-water',
        label: 'Water',
        detail: 'shared routing',
        accent: EARTH_ENGINE_COLORS.water,
        toggle: disableWaterFamily,
        toggleTitle: 'Disable Water layers',
        cells: {
          level: sliderCell({ key: 'waterLevel', label: 'Water Level', accent: routeAccent(EARTH_ENGINE_COLORS.water, 42) }),
          space: sliderCell({ key: 'waterReverbSend', label: 'Water Reverb', accent: routeAccent(SOURCE_COLORS.reverb, 38) }),
          delayA: sliderCell({ key: 'waterDelayASend', label: 'Water Delay A', accent: routeAccent(SOURCE_COLORS.delayA, 34) }),
          delayB: sliderCell({ key: 'waterDelayBSend', label: 'Water Delay B', accent: routeAccent(SOURCE_COLORS.delayB, 30) }),
          granular: sliderCell({ key: 'granularWaterSend', label: 'Water Granular', accent: routeAccent(SOURCE_COLORS.granular, 34) }),
        },
      });
    }

    if (anyNatureChildActive) {
      rows.push({
        id: 'shared-nature',
        label: 'Nature',
        detail: 'shared routing',
        accent: EARTH_ENGINE_COLORS.nature,
        toggle: disableNatureFamily,
        toggleTitle: 'Disable Nature sources',
        cells: {
          level: sliderCell({ key: 'natureLevel', label: 'Nature Level', accent: routeAccent(EARTH_ENGINE_COLORS.nature, 40) }),
          space: sliderCell({ key: 'natureReverbSend', label: 'Nature Reverb', accent: routeAccent(SOURCE_COLORS.reverb, 38) }),
          delayA: sliderCell({ key: 'natureDelayASend', label: 'Nature Delay A', accent: routeAccent(SOURCE_COLORS.delayA, 34) }),
          delayB: sliderCell({ key: 'natureDelayBSend', label: 'Nature Delay B', accent: routeAccent(SOURCE_COLORS.delayB, 30) }),
          granular: sliderCell({ key: 'granularNatureSend', label: 'Nature Granular', accent: routeAccent(SOURCE_COLORS.granular, 34) }),
        },
      });
    }

    if (anyInsectChildActive) {
      rows.push({
        id: 'shared-insects',
        label: 'Insects',
        detail: 'shared routing',
        accent: EARTH_ENGINE_COLORS.insects,
        toggle: disableInsectsFamily,
        toggleTitle: 'Disable Insect layers',
        cells: {
          level: sliderCell({ key: 'insectsSharedLevel', label: 'Insects Level', accent: routeAccent(EARTH_ENGINE_COLORS.insects, 40) }),
          space: sliderCell({ key: 'insectsReverbSend', label: 'Insects Reverb', accent: routeAccent(SOURCE_COLORS.reverb, 38) }),
          delayA: sliderCell({ key: 'insDelayASend', label: 'Insects Delay A', accent: routeAccent(SOURCE_COLORS.delayA, 34) }),
          delayB: sliderCell({ key: 'insDelayBSend', label: 'Insects Delay B', accent: routeAccent(SOURCE_COLORS.delayB, 30) }),
          granular: sliderCell({ key: 'granularInsectsSend', label: 'Insects Granular', accent: routeAccent(SOURCE_COLORS.granular, 34) }),
        },
      });
    }

    return rows;
  }, [anyInsectChildActive, anyNatureChildActive, anyWaterChildActive, disableInsectsFamily, disableNatureFamily, disableWaterFamily, onSelectChange, state]);

  const activeRows = useMemo<ChildRow[]>(() => {
    const rows: ChildRow[] = [];

    if (state.oceanSampleEnabled) {
      rows.push({
        id: 'child-waves',
        label: 'Waves',
        family: 'Waves',
        accent: EARTH_ENGINE_COLORS.waves,
        preview: 'waves',
        density: numeric(state, 'oceanSliceDensity'),
        intensity: numeric(state, 'oceanSampleLevel'),
        toggle: () => onSelectChange('oceanSampleEnabled', false),
        toggleTitle: 'Disable Waves',
        level: { key: 'oceanSampleLevel', label: 'Waves Level', accent: routeAccent(EARTH_ENGINE_COLORS.waves, 44) },
        textureDebugKey: 'waves',
      });
    }

    if (numeric(state, 'waterLayerHardDrops') > 0.01) {
      rows.push({
        id: 'child-water-hard',
        label: 'Hard Drops',
        family: 'Water',
        info: `Tone ${Math.round(numeric(state, 'waterHardDropTone') * 100)} • Rate ${numeric(state, 'waterHardDropRate').toFixed(2)}`,
        accent: EARTH_ENGINE_COLORS.waterHardDrops,
        preview: 'hardDrops',
        density: clamp01(numeric(state, 'waterHardDropRate') * 0.5),
        intensity: numeric(state, 'waterLayerHardDrops'),
        toggle: () => toggleWaterChild('waterLayerHardDrops'),
        toggleTitle: 'Disable Hard Drops',
        level: { key: 'waterLayerHardDrops', label: 'Hard Drops Level', accent: routeAccent(EARTH_ENGINE_COLORS.waterHardDrops, 38) },
      });
    }

    if (numeric(state, 'waterLayerWaterDrops') > 0.01) {
      rows.push({
        id: 'child-water-drops',
        label: 'Water Drops',
        family: 'Water',
        info: `Surface ripples • Rate ${numeric(state, 'waterWaterDropRate').toFixed(2)}`,
        accent: EARTH_ENGINE_COLORS.waterDrops,
        preview: 'waterDrops',
        density: clamp01(numeric(state, 'waterWaterDropRate') * 0.4),
        intensity: numeric(state, 'waterLayerWaterDrops'),
        toggle: () => toggleWaterChild('waterLayerWaterDrops'),
        toggleTitle: 'Disable Water Drops',
        level: { key: 'waterLayerWaterDrops', label: 'Water Drops Level', accent: routeAccent(EARTH_ENGINE_COLORS.waterDrops, 38) },
      });
    }

    if (numeric(state, 'waterLayerBubbling') > 0.01) {
      rows.push({
        id: 'child-water-bubbling',
        label: 'Bubbling',
        family: 'Water',
        info: `Air pockets • Rate ${numeric(state, 'waterBubblingRate').toFixed(2)}`,
        accent: EARTH_ENGINE_COLORS.waterBubbling,
        preview: 'bubbling',
        density: clamp01(numeric(state, 'waterBubblingRate') * 0.33),
        intensity: numeric(state, 'waterLayerBubbling'),
        toggle: () => toggleWaterChild('waterLayerBubbling'),
        toggleTitle: 'Disable Bubbling',
        level: { key: 'waterLayerBubbling', label: 'Bubbling Level', accent: routeAccent(EARTH_ENGINE_COLORS.waterBubbling, 38) },
      });
    }

    if (numeric(state, 'waterLayerChannels') > 0.01) {
      rows.push({
        id: 'child-water-channels',
        label: 'Channels',
        family: 'Water',
        info: `${channelsMorphLabel(numeric(state, 'waterChannelsMorph'))} • Speed ${numeric(state, 'waterChannelsSpeed').toFixed(2)}`,
        accent: EARTH_ENGINE_COLORS.waterChannels,
        preview: 'channels',
        density: numeric(state, 'waterChannelsSpeed'),
        intensity: numeric(state, 'waterLayerChannels'),
        toggle: () => toggleWaterChild('waterLayerChannels'),
        toggleTitle: 'Disable Channels',
        level: { key: 'waterLayerChannels', label: 'Channels Level', accent: routeAccent(EARTH_ENGINE_COLORS.waterChannels, 38) },
      });
    }

    if (numeric(state, 'waterLayerTurbulence') > 0.01) {
      rows.push({
        id: 'child-water-turbulence',
        label: 'Turbulence',
        family: 'Water',
        info: `Body motion • Intensity ${Math.round(numeric(state, 'waterIntensity') * 100)}%`,
        accent: EARTH_ENGINE_COLORS.waterTurbulence,
        preview: 'turbulence',
        density: numeric(state, 'waterIntensity'),
        intensity: numeric(state, 'waterLayerTurbulence'),
        toggle: () => toggleWaterChild('waterLayerTurbulence'),
        toggleTitle: 'Disable Turbulence',
        level: { key: 'waterLayerTurbulence', label: 'Turbulence Level', accent: routeAccent(EARTH_ENGINE_COLORS.waterTurbulence, 38) },
      });
    }

    if (numeric(state, 'waterLayerSurf') > 0.01) {
      rows.push({
        id: 'child-water-surf',
        label: 'Surf',
        family: 'Water',
        info: `Foam ${Math.round(numeric(state, 'waterSurfFoam') * 100)} • Depth ${Math.round(numeric(state, 'waterSurfDepth') * 100)}%`,
        accent: EARTH_ENGINE_COLORS.waterSurf,
        preview: 'surf',
        density: numeric(state, 'waterSurfFoam'),
        intensity: numeric(state, 'waterLayerSurf'),
        toggle: () => toggleWaterChild('waterLayerSurf'),
        toggleTitle: 'Disable Surf',
        level: { key: 'waterLayerSurf', label: 'Surf Level', accent: routeAccent(EARTH_ENGINE_COLORS.waterSurf, 38) },
      });
    }

    if (state.birdsEnabled) {
      rows.push({
        id: 'child-birds',
        label: 'Birds Alps',
        family: 'Nature',
        accent: EARTH_ENGINE_COLORS.birds,
        preview: 'birds',
        density: numeric(state, 'birdsSliceDensity'),
        intensity: numeric(state, 'birdsLevel') * numeric(state, 'natureLevel'),
        toggle: () => onSelectChange('birdsEnabled', false),
        toggleTitle: 'Disable Birds Alps',
        level: { key: 'birdsLevel', label: 'Birds Alps Level', accent: routeAccent(EARTH_ENGINE_COLORS.birds, 38) },
        textureDebugKey: 'birds',
      });
    }

    if (state.birds2Enabled) {
      rows.push({
        id: 'child-birds2',
        label: 'Birds Fujian',
        family: 'Nature',
        accent: EARTH_ENGINE_COLORS.birds2,
        preview: 'birds',
        density: numeric(state, 'birds2SliceDensity'),
        intensity: numeric(state, 'birds2Level') * numeric(state, 'natureLevel'),
        toggle: () => onSelectChange('birds2Enabled', false),
        toggleTitle: 'Disable Birds Fujian',
        level: { key: 'birds2Level', label: 'Birds Fujian Level', accent: routeAccent(EARTH_ENGINE_COLORS.birds2, 38) },
        textureDebugKey: 'birds2',
      });
    }

    if (state.frogsEnabled) {
      rows.push({
        id: 'child-frogs',
        label: 'Frogs',
        family: 'Nature',
        accent: EARTH_ENGINE_COLORS.frogs,
        preview: 'frogs',
        density: numeric(state, 'frogsSliceDensity'),
        intensity: numeric(state, 'frogsLevel') * numeric(state, 'natureLevel'),
        toggle: () => onSelectChange('frogsEnabled', false),
        toggleTitle: 'Disable Frogs',
        level: { key: 'frogsLevel', label: 'Frogs Level', accent: routeAccent(EARTH_ENGINE_COLORS.frogs, 38) },
        textureDebugKey: 'frogs',
      });
    }

    if (state.insectsEnabled) {
      rows.push({
        id: 'child-insects1',
        label: 'Insects 1',
        family: 'Insects',
        info: INSECT_ENGINES[state.insectsEngine] ?? 'Layer 1 engine',
        accent: EARTH_ENGINE_COLORS.insects,
        preview: 'insects',
        density: numeric(state, 'insectsDensity'),
        intensity: numeric(state, 'insectsLevel'),
        toggle: () => onSelectChange('insectsEnabled', false),
        toggleTitle: 'Disable Insects 1',
        level: { key: 'insectsLevel', label: 'Insects 1 Level', accent: routeAccent(EARTH_ENGINE_COLORS.insects, 38) },
      });
    }

    if (state.insects2Enabled) {
      rows.push({
        id: 'child-insects2',
        label: 'Insects 2',
        family: 'Insects',
        info: INSECT_ENGINES[state.insects2Engine] ?? 'Layer 2 engine',
        accent: EARTH_ENGINE_COLORS.insects2,
        preview: 'insects',
        density: numeric(state, 'insects2Density'),
        intensity: numeric(state, 'insects2Level'),
        toggle: () => onSelectChange('insects2Enabled', false),
        toggleTitle: 'Disable Insects 2',
        level: { key: 'insects2Level', label: 'Insects 2 Level', accent: routeAccent(EARTH_ENGINE_COLORS.insects2, 38) },
      });
    }

    return rows;
  }, [onSelectChange, state, toggleWaterChild]);

  const activeTextureDebugKeys = useMemo(
    () => textureDebugAvailable ? activeRows
      .map((row) => row.textureDebugKey)
      .filter((key): key is keyof EarthTextureDebugState => Boolean(key)) : [],
    [activeRows, textureDebugAvailable],
  );
  const [activeSharedColumn, setActiveSharedColumn] = useState<SharedColumnId>(DEFAULT_SHARED_COLUMN);
  const [isCompactLayout, setIsCompactLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_EARTH_MATRIX_QUERY).matches;
  });
  const activeSharedColumnConfig = useMemo(
    () => SHARED_COLUMNS.find((column) => column.id === activeSharedColumn) ?? SHARED_COLUMNS[0]!,
    [activeSharedColumn],
  );
  const [textureDebugState, setTextureDebugState] = useState<EarthTextureDebugState>(EMPTY_EARTH_TEXTURE_DEBUG_STATE);
  const sectionRef = useRef<HTMLElement>(null);
  const { canAnimate: canPollTextureDebug } = useAnimationVisibility(sectionRef, { rootMargin: '220px' });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(MOBILE_EARTH_MATRIX_QUERY);
    const updateLayout = () => setIsCompactLayout(mediaQuery.matches);
    updateLayout();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateLayout);
      return () => mediaQuery.removeEventListener('change', updateLayout);
    }

    mediaQuery.addListener(updateLayout);
    return () => mediaQuery.removeListener(updateLayout);
  }, []);

  const updateTextureDebugState = useCallback(() => {
    if (!textureDebugAvailable) return;
    const nextState = getEarthTextureDebugState();
    setTextureDebugState((prev) => {
      const changed = activeTextureDebugKeys.some((key) => !snapshotsEqual(prev[key], nextState[key]));
      return changed ? nextState : prev;
    });
  }, [activeTextureDebugKeys, getEarthTextureDebugState, textureDebugAvailable]);

  const textureDebugPollMs = useMemo(() => {
    if (activeTextureDebugKeys.length <= 1) return 180;
    if (activeTextureDebugKeys.length === 2) return 260;
    return 340;
  }, [activeTextureDebugKeys.length]);

  useVisibleInterval(updateTextureDebugState, textureDebugPollMs, {
    enabled: textureDebugAvailable && activeTextureDebugKeys.length > 0,
    isVisible: canPollTextureDebug,
  });

  return (
    <section ref={sectionRef} className="mixer-section earth-active-matrix">
      <div className="mixer-section-header" onMouseEnter={announceMatrixHelp}>Active Earth Matrix</div>

      <div className="earth-selector-groups">
        {selectorGroups.map((group) => (
          <div key={group.label} className="earth-selector-group">
            <div className="earth-selector-group-label">{group.label}</div>
            <div className="earth-selector-chip-row">
              {group.chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`earth-selector-chip${chip.active ? ' active' : ''}`}
                  onClick={chip.onToggle}
                  style={{ '--row-accent': chip.accent } as CSSProperties}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="earth-matrix-section">
        <div className="earth-matrix-section-head">
          <span className="earth-matrix-section-title">Shared Routing</span>
          <span className="earth-matrix-section-meta">{sharedRows.length} active</span>
        </div>
        {sharedRows.length > 0 ? (
          isCompactLayout ? (
            <>
              <div className="earth-matrix-mobile-picker" role="tablist" aria-label="Shared Earth routing columns">
                {SHARED_COLUMNS.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    className={`earth-matrix-mobile-picker-button${activeSharedColumn === column.id ? ' active' : ''}`}
                    onClick={() => setActiveSharedColumn(column.id)}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
              <div className="earth-matrix-mobile-column-note">
                Shared routing column: {activeSharedColumnConfig.label}
              </div>
              <div className="earth-matrix-mobile-list">
                {sharedRows.map((row) => (
                  <SharedMatrixMobileCard
                    key={`${row.id}:${activeSharedColumn}`}
                    row={row}
                    column={activeSharedColumnConfig}
                    state={state}
                    sliderProps={sliderProps}
                    onParamChange={onParamChange}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="earth-matrix-scroll">
              <div className="earth-shared-matrix-grid">
                <div className="earth-matrix-corner">Source</div>
                {SHARED_COLUMNS.map((column) => (
                  <div key={column.id} className="earth-matrix-header">
                    {column.label}
                  </div>
                ))}

                {sharedRows.map((row) => (
                  <SharedMatrixRow
                    key={row.id}
                    row={row}
                    state={state}
                    sliderProps={sliderProps}
                    onParamChange={onParamChange}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="earth-matrix-empty">Activate a source to expose its shared routing row.</div>
        )}
      </div>

      <div className="earth-matrix-section">
        <div className="earth-matrix-section-head">
          <span className="earth-matrix-section-title">Active Sources</span>
          <span className="earth-matrix-section-meta">{activeRows.length} active</span>
        </div>
        {activeRows.length > 0 ? (
          isCompactLayout ? (
            <div className="earth-matrix-mobile-list">
              {activeRows.map((row) => (
                <ChildMatrixMobileCard
                  key={row.id}
                  row={row}
                  state={state}
                  sliderProps={sliderProps}
                  onParamChange={onParamChange}
                  textureDebugState={textureDebugState}
                  textureDebugAvailable={textureDebugAvailable}
                />
              ))}
            </div>
          ) : (
            <div className="earth-matrix-scroll">
              <div className="earth-child-matrix-grid">
                <div className="earth-matrix-corner">Source</div>
                <div className="earth-matrix-header">Preview</div>
                <div className="earth-matrix-header">Level</div>
                <div className="earth-matrix-header">Info</div>

                {activeRows.map((row) => (
                  <ChildMatrixRow
                    key={row.id}
                    row={row}
                    state={state}
                    sliderProps={sliderProps}
                    onParamChange={onParamChange}
                    textureDebugState={textureDebugState}
                    textureDebugAvailable={textureDebugAvailable}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="earth-matrix-empty">Choose child sources above to build the active matrix.</div>
        )}
      </div>
    </section>
  );
}

function MatrixStaticCell({
  accent,
  text,
  blocked = false,
}: {
  accent: string;
  text?: string;
  blocked?: boolean;
}) {
  return (
    <div
      className={`earth-matrix-cell earth-matrix-static${blocked ? ' blocked' : ''}`}
      style={{ '--row-accent': accent } as CSSProperties}
    >
      <span className="earth-matrix-static-text">{text ?? '—'}</span>
    </div>
  );
}

function SharedCellView({
  rowId,
  columnId,
  cell,
  accent,
  state,
  sliderProps,
  onParamChange,
}: {
  rowId: string;
  columnId: SharedColumnId;
  cell: SharedCell;
  accent: string;
  state: SliderState;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  onParamChange: (key: keyof SliderState, value: number) => void;
}) {
  if (cell.kind === 'slider') {
    return (
      <EarthMatrixSliderCell
        control={cell.control}
        rowId={rowId}
        columnId={columnId}
        accent={accent}
        state={state}
        sliderProps={sliderProps}
        onParamChange={onParamChange}
      />
    );
  }

  return <MatrixStaticCell accent={accent} text={cell.text} blocked={cell.kind === 'blocked'} />;
}

function SharedMatrixRow({
  row,
  state,
  sliderProps,
  onParamChange,
}: {
  row: SharedRow;
  state: SliderState;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  onParamChange: (key: keyof SliderState, value: number) => void;
}) {
  return (
    <>
      <div
        className="earth-matrix-rowlabel group"
        title={row.detail}
        style={{ '--row-accent': row.accent } as CSSProperties}
      >
        <SectionToggle active onClick={row.toggle} title={row.toggleTitle} />
        <span className="earth-matrix-rowmeta">
          <span className="earth-matrix-rowname">{row.label}</span>
          {row.detail ? <span className="earth-matrix-rowdetail">{row.detail}</span> : null}
        </span>
      </div>

      {SHARED_COLUMNS.map((column) => {
        const cell = row.cells[column.id];
        return (
          <SharedCellView
            key={`${row.id}:${column.id}`}
            rowId={row.id}
            columnId={column.id}
            cell={cell}
            accent={row.accent}
            state={state}
            sliderProps={sliderProps}
            onParamChange={onParamChange}
          />
        );
      })}
    </>
  );
}

function SharedMatrixMobileCard({
  row,
  column,
  state,
  sliderProps,
  onParamChange,
}: {
  row: SharedRow;
  column: { id: SharedColumnId; label: string };
  state: SliderState;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  onParamChange: (key: keyof SliderState, value: number) => void;
}) {
  return (
    <div className="earth-matrix-mobile-card">
      <div
        className="earth-matrix-rowlabel group"
        title={row.detail}
        style={{ '--row-accent': row.accent } as CSSProperties}
      >
        <SectionToggle active onClick={row.toggle} title={row.toggleTitle} />
        <span className="earth-matrix-rowmeta">
          <span className="earth-matrix-rowname">{row.label}</span>
          {row.detail ? <span className="earth-matrix-rowdetail">{row.detail}</span> : null}
        </span>
      </div>

      <div className="earth-matrix-mobile-field">
        <span className="earth-matrix-mobile-field-label">{column.label}</span>
        <SharedCellView
          rowId={row.id}
          columnId={column.id}
          cell={row.cells[column.id]}
          accent={row.accent}
          state={state}
          sliderProps={sliderProps}
          onParamChange={onParamChange}
        />
      </div>
    </div>
  );
}

function ChildMatrixRow({
  row,
  state,
  sliderProps,
  onParamChange,
  textureDebugState,
  textureDebugAvailable,
}: {
  row: ChildRow;
  state: SliderState;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  onParamChange: (key: keyof SliderState, value: number) => void;
  textureDebugState: EarthTextureDebugState;
  textureDebugAvailable: boolean;
}) {
  return (
    <>
      <div
        className="earth-matrix-rowlabel sub"
        title={row.info ?? row.label}
        style={{ '--row-accent': row.accent } as CSSProperties}
      >
        <SectionToggle active onClick={row.toggle} title={row.toggleTitle} />
        <span className="earth-matrix-rowmeta">
          <span className="earth-matrix-rowname">{row.label}</span>
          <span className="earth-matrix-rowdetail">{row.family}</span>
        </span>
      </div>

      <div className="earth-matrix-preview-cell">
        <MatrixPreview
          kind={row.preview}
          accent={row.accent}
          density={row.density}
          intensity={row.intensity}
        />
      </div>

      <EarthMatrixSliderCell
        control={row.level}
        rowId={row.id}
        columnId="level"
        accent={row.accent}
        state={state}
        sliderProps={sliderProps}
        onParamChange={onParamChange}
      />

      <div
        className={`earth-matrix-cell earth-matrix-info-cell${row.textureDebugKey ? ' nature' : ''}`}
        style={{ '--row-accent': row.accent } as CSSProperties}
      >
        {row.textureDebugKey && textureDebugAvailable ? (
          <EarthTextureInfoCell
            debugKey={row.textureDebugKey}
            textureDebugState={textureDebugState}
            accent={row.accent}
            label={row.label}
          />
        ) : (
          <span className="earth-matrix-info-text">{row.info}</span>
        )}
      </div>
    </>
  );
}

function ChildMatrixMobileCard({
  row,
  state,
  sliderProps,
  onParamChange,
  textureDebugState,
  textureDebugAvailable,
}: {
  row: ChildRow;
  state: SliderState;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  onParamChange: (key: keyof SliderState, value: number) => void;
  textureDebugState: EarthTextureDebugState;
  textureDebugAvailable: boolean;
}) {
  return (
    <div className="earth-matrix-mobile-card">
      <div
        className="earth-matrix-rowlabel sub"
        title={row.info ?? row.label}
        style={{ '--row-accent': row.accent } as CSSProperties}
      >
        <SectionToggle active onClick={row.toggle} title={row.toggleTitle} />
        <span className="earth-matrix-rowmeta">
          <span className="earth-matrix-rowname">{row.label}</span>
          <span className="earth-matrix-rowdetail">{row.family}</span>
        </span>
      </div>

      <div className="earth-matrix-mobile-preview-row">
        <div className="earth-matrix-mobile-field">
          <span className="earth-matrix-mobile-field-label">Preview</span>
          <div className="earth-matrix-preview-cell">
            <MatrixPreview
              kind={row.preview}
              accent={row.accent}
              density={row.density}
              intensity={row.intensity}
            />
          </div>
        </div>

        <div className="earth-matrix-mobile-field earth-matrix-mobile-field-grow">
          <span className="earth-matrix-mobile-field-label">Level</span>
          <EarthMatrixSliderCell
            control={row.level}
            rowId={row.id}
            columnId="level"
            accent={row.accent}
            state={state}
            sliderProps={sliderProps}
            onParamChange={onParamChange}
          />
        </div>
      </div>

      <div className="earth-matrix-mobile-field">
        <span className="earth-matrix-mobile-field-label">Info</span>
        <div
          className={`earth-matrix-cell earth-matrix-info-cell${row.textureDebugKey ? ' nature' : ''}`}
          style={{ '--row-accent': row.accent } as CSSProperties}
        >
          {row.textureDebugKey && textureDebugAvailable ? (
            <EarthTextureInfoCell
              debugKey={row.textureDebugKey}
              textureDebugState={textureDebugState}
              accent={row.accent}
              label={row.label}
            />
          ) : (
            <span className="earth-matrix-info-text">{row.info}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function snapshotsEqual(
  a: EarthTextureDebugState[keyof EarthTextureDebugState] | null | undefined,
  b: EarthTextureDebugState[keyof EarthTextureDebugState] | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (
    a.fileName !== b.fileName ||
    a.active !== b.active ||
    a.inactiveReason !== b.inactiveReason ||
    a.assetId !== b.assetId ||
    a.seed !== b.seed ||
    a.sliceDuration !== b.sliceDuration ||
    a.fadeTime !== b.fadeTime ||
    a.density !== b.density ||
    a.strideSeconds !== b.strideSeconds ||
    a.activeSliceCount !== b.activeSliceCount ||
    a.playingSliceCount !== b.playingSliceCount ||
    a.activeSlices.length !== b.activeSlices.length
  ) {
    return false;
  }
  for (let i = 0; i < a.activeSlices.length; i += 1) {
    const sliceA = a.activeSlices[i];
    const sliceB = b.activeSlices[i];
    if (!sliceA || !sliceB) return false;
    if (
      sliceA.id !== sliceB.id ||
      sliceA.startTime !== sliceB.startTime ||
      sliceA.endTime !== sliceB.endTime ||
      sliceA.offset !== sliceB.offset ||
      sliceA.bufferDuration !== sliceB.bufferDuration ||
      sliceA.outputDuration !== sliceB.outputDuration ||
      sliceA.detuneCents !== sliceB.detuneCents ||
      sliceA.speedMultiplier !== sliceB.speedMultiplier ||
      sliceA.totalRate !== sliceB.totalRate ||
      sliceA.isPlaying !== sliceB.isPlaying
    ) {
      return false;
    }
  }
  return true;
}

function EarthTextureInfoCell({
  debugKey,
  textureDebugState,
  accent,
  label,
}: {
  debugKey: keyof EarthTextureDebugState;
  textureDebugState: EarthTextureDebugState;
  accent: string;
  label: string;
}) {
  const snapshot = textureDebugState[debugKey] ?? null;

  return (
    <NatureSliceViz
      snapshot={snapshot}
      accent={accent}
      label={label}
    />
  );
}

type EarthMatrixSliderCellProps = {
  control: MatrixControl;
  rowId: string;
  columnId: SharedColumnId | 'level';
  accent: string;
  state: SliderState;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntime;
  onParamChange: (key: keyof SliderState, value: number) => void;
};

function EarthMatrixSliderCell({
  control,
  rowId,
  columnId,
  accent,
  state,
  sliderProps,
  onParamChange,
}: EarthMatrixSliderCellProps) {
  const { announceSlider } = useSliderHelp();
  const quantization = (QUANTIZATION as Record<string, QuantizationRange>)[control.key as string];
  const cellId = `${rowId}:${columnId}:${String(control.key)}`;
  const runtime = sliderProps(control.key);
  const mode = runtime.mode !== 'single' && runtime.dualRange ? runtime.mode : 'single';
  const runtimeIndicator = useRuntimeSliderIndicator(
    String(control.key),
    mode,
    runtime.walkPosition,
    runtime.isFlashing,
  );
  const value = numeric(state, control.key);
  const range = quantization && mode !== 'single'
    ? normalizeQuantizedRange(runtime.dualRange, quantization, control.logarithmic)
    : undefined;
  const valueNorm = quantization ? valueToNorm(value, quantization, control.logarithmic) : 0;
  const rangeNorm = quantization && range
    ? {
        min: valueToNorm(range.min, quantization, control.logarithmic),
        max: valueToNorm(range.max, quantization, control.logarithmic),
      }
    : undefined;
  const walkNorm = rangeNorm
    ? rangeNorm.min + clamp01(runtimeIndicator.walkPosition ?? runtime.walkPosition ?? 0.5) * (rangeNorm.max - rangeNorm.min)
    : valueNorm;
  const fillLeft = rangeNorm ? trackLeftCalc(rangeNorm.min) : `${TRACK_PAD_PX}px`;
  const fillWidth = rangeNorm ? trackWidthCalc(rangeNorm.max - rangeNorm.min) : trackWidthCalc(valueNorm);
  const readout = quantization
    ? (mode === 'single'
      ? formatValue(control, value, quantization)
      : rangeReadout(mode, control, range, quantization))
    : '—';

  const [dragHandle, setDragHandle] = useState<CellHandle | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    handle: CellHandle;
    startPointerNorm: number;
    startRange?: DualSliderRange;
    startRangeNorm?: DualSliderRange;
  } | null>(null);
  const pendingTouchRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    pointerNorm: number;
    handle: CellHandle;
    startRange?: DualSliderRange;
    startRangeNorm?: DualSliderRange;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMetaRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const longPressConsumedRef = useRef(false);
  const dblClickGuardRef = useRef<{ time: number; cellId: string } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressMetaRef.current = null;
  }, []);

  useEffect(() => () => {
    clearLongPress();
    pendingTouchRef.current = null;
    setSliderTouchSelectionLock(false);
  }, [clearLongPress]);

  const announce = useCallback(() => {
    announceSlider(String(control.key), { label: control.label, page: 'earth' });
  }, [announceSlider, control.key, control.label]);

  const applyValueAtNorm = useCallback((pointerNorm: number) => {
    if (!quantization) return;
    const drag = dragRef.current;
    if (!drag) return;

    if (mode === 'single' || drag.handle === 'single' || !drag.startRange || !drag.startRangeNorm) {
      const next = quantizeValue(normToValue(pointerNorm, quantization, control.logarithmic), quantization);
      onParamChange(control.key, next);
      return;
    }

    if (!runtime.onDualRangeChange) return;

    if (drag.handle === 'min') {
      const nextMinNorm = Math.min(pointerNorm, drag.startRangeNorm.max);
      const nextMin = quantizeValue(normToValue(nextMinNorm, quantization, control.logarithmic), quantization);
      runtime.onDualRangeChange(control.key, Math.min(nextMin, drag.startRange.max), drag.startRange.max);
      return;
    }

    if (drag.handle === 'max') {
      const nextMaxNorm = Math.max(pointerNorm, drag.startRangeNorm.min);
      const nextMax = quantizeValue(normToValue(nextMaxNorm, quantization, control.logarithmic), quantization);
      runtime.onDualRangeChange(control.key, drag.startRange.min, Math.max(nextMax, drag.startRange.min));
      return;
    }

    const shifted = shiftRangePreservingWidth(
      drag.startRangeNorm,
      pointerNorm - drag.startPointerNorm,
    );
    const nextMinNorm = shifted.min;
    const nextMaxNorm = shifted.max;
    const nextMin = quantizeValue(normToValue(nextMinNorm, quantization, control.logarithmic), quantization);
    const nextMax = quantizeValue(normToValue(nextMaxNorm, quantization, control.logarithmic), quantization);
    runtime.onDualRangeChange(control.key, Math.min(nextMin, nextMax), Math.max(nextMin, nextMax));
  }, [control.key, control.logarithmic, mode, onParamChange, quantization, runtime]);
  const valueEmitter = useRafCoalescedEmitter(applyValueAtNorm);

  const handleKeyboard = useCallback((
    handle: 'single' | 'min' | 'max',
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (!quantization) return;
    const currentValue = handle === 'single'
      ? value
      : handle === 'min'
        ? (range?.min ?? value)
        : (range?.max ?? value);
    const increment = quantization.step * (event.shiftKey ? 10 : 1);
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = currentValue - increment;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = currentValue + increment;
    else if (event.key === 'Home') next = quantization.min;
    else if (event.key === 'End') next = quantization.max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    const quantized = quantizeValue(next, quantization);
    if (handle === 'single' || !range) {
      onParamChange(control.key, quantized);
    } else if (handle === 'min') {
      runtime.onDualRangeChange?.(control.key, Math.min(quantized, range.max), range.max);
    } else {
      runtime.onDualRangeChange?.(control.key, range.min, Math.max(quantized, range.min));
    }
  }, [control.key, onParamChange, quantization, range, runtime, value]);

  const scheduleLongPress = useCallback((pointerId: number, startX: number, startY: number) => {
    clearLongPress();
    longPressConsumedRef.current = false;
    setSliderTouchSelectionLock(true);
    longPressMetaRef.current = { pointerId, startX, startY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressConsumedRef.current = true;
      pendingTouchRef.current = null;
      dragRef.current = null;
      setDragging(false);
      setDragHandle(null);
      runtime.onCycleMode?.(control.key);
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_MS);
  }, [clearLongPress, control.key, runtime]);

  const maybeCancelLongPress = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const meta = longPressMetaRef.current;
    if (!meta || meta.pointerId !== pointerId) return;
    if (
      Math.abs(clientX - meta.startX) > LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(clientY - meta.startY) > LONG_PRESS_MOVE_TOLERANCE_PX
    ) {
      clearLongPress();
    }
  }, [clearLongPress]);

  if (!quantization) {
    return (
      <div className="earth-matrix-cell earth-matrix-static blocked">
        <span className="earth-matrix-static-text">—</span>
      </div>
    );
  }

  return (
    <div
      className={`earth-matrix-cell earth-matrix-cell-slider${columnId === 'level' ? ' level-col' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--row-accent': accent } as CSSProperties}
      title={control.label}
      role={mode === 'single' ? 'slider' : undefined}
      tabIndex={mode === 'single' ? 0 : -1}
      aria-label={mode === 'single' ? control.label : undefined}
      aria-valuemin={mode === 'single' ? quantization.min : undefined}
      aria-valuemax={mode === 'single' ? quantization.max : undefined}
      aria-valuenow={mode === 'single' ? value : undefined}
      onKeyDown={(event) => handleKeyboard('single', event)}
      onMouseEnter={announce}
      onFocus={announce}
      onDoubleClick={() => runtime.onCycleMode?.(control.key)}
      onPointerDown={(event) => {
        announce();
        clearLongPress();
        pendingTouchRef.current = null;

        const now = Date.now();
        const guard = dblClickGuardRef.current;
        const isPotentialDblClick = guard && guard.cellId === cellId && (now - guard.time) < 400;
        dblClickGuardRef.current = { time: now, cellId };
        if (isPotentialDblClick) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const pointerNorm = pointerToTrackNorm(event.clientX, rect);
        const nextHandle = mode === 'single' || !rangeNorm
          ? 'single'
          : getDualHandle(pointerNorm, rangeNorm, rect);

        if (event.pointerType === 'touch') {
          pendingTouchRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            pointerNorm,
            handle: nextHandle,
            startRange: range,
            startRangeNorm: rangeNorm,
          };
          setSliderTouchSelectionLock(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          scheduleLongPress(event.pointerId, event.clientX, event.clientY);
          return;
        }

        dragRef.current = {
          pointerId: event.pointerId,
          handle: nextHandle,
          startPointerNorm: pointerNorm,
          startRange: range,
          startRangeNorm: rangeNorm,
        };
        setDragHandle(nextHandle);
        setDragging(true);
        valueEmitter.flush(pointerNorm);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const pendingTouch = pendingTouchRef.current;
        if (pendingTouch?.pointerId === event.pointerId) {
          maybeCancelLongPress(event.pointerId, event.clientX, event.clientY);
          if (longPressConsumedRef.current) return;

          const intent = getTouchGestureIntent(
            pendingTouch.startX,
            pendingTouch.startY,
            event.clientX,
            event.clientY,
          );
          if (intent === 'pending') return;

          clearLongPress();
          pendingTouchRef.current = null;

          if (intent === 'scroll') {
            setSliderTouchSelectionLock(false);
            releasePointerCaptureSafely(event.currentTarget, event.pointerId);
            return;
          }

          event.preventDefault();
          dragRef.current = {
            pointerId: event.pointerId,
            handle: pendingTouch.handle,
            startPointerNorm: pendingTouch.pointerNorm,
            startRange: pendingTouch.startRange,
            startRangeNorm: pendingTouch.startRangeNorm,
          };
          setDragHandle(pendingTouch.handle);
          setDragging(true);
          valueEmitter.schedule(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
          return;
        }

        maybeCancelLongPress(event.pointerId, event.clientX, event.clientY);
        if (longPressConsumedRef.current) return;
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
        if (event.pointerType === 'touch') event.preventDefault();
        valueEmitter.schedule(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
      }}
      onPointerUp={(event) => {
        const pendingTouch = pendingTouchRef.current;
        if (pendingTouch?.pointerId === event.pointerId) {
          const shouldTap = !longPressConsumedRef.current;
          clearLongPress();
          pendingTouchRef.current = null;
          if (shouldTap) {
            dragRef.current = {
              pointerId: event.pointerId,
              handle: pendingTouch.handle,
              startPointerNorm: pendingTouch.pointerNorm,
              startRange: pendingTouch.startRange,
              startRangeNorm: pendingTouch.startRangeNorm,
            };
            valueEmitter.flush(pendingTouch.pointerNorm);
          }
          dragRef.current = null;
          setDragging(false);
          setDragHandle(null);
          longPressConsumedRef.current = false;
          setSliderTouchSelectionLock(false);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          return;
        }

        valueEmitter.flush();
        clearLongPress();
        dragRef.current = null;
        setDragging(false);
        setDragHandle(null);
        longPressConsumedRef.current = false;
        setSliderTouchSelectionLock(false);
        releasePointerCaptureSafely(event.currentTarget, event.pointerId);
      }}
      onPointerCancel={(event) => {
        valueEmitter.cancel();
        const drag = dragRef.current;
        if (drag) {
          if (mode === 'single' || drag.handle === 'single' || !drag.startRange) {
            onParamChange(control.key, value);
          } else {
            runtime.onDualRangeChange?.(control.key, drag.startRange.min, drag.startRange.max);
          }
        }
        clearLongPress();
        pendingTouchRef.current = null;
        dragRef.current = null;
        setDragging(false);
        setDragHandle(null);
        longPressConsumedRef.current = false;
        setSliderTouchSelectionLock(false);
        releasePointerCaptureSafely(event.currentTarget, event.pointerId);
      }}
    >
      <span className="earth-matrix-cell-track" />
      <span
        className={`earth-matrix-cell-fill${mode === 'walk' && rangeNorm ? ' walk' : ''}${mode === 'sampleHold' && rangeNorm ? ' sample-hold' : ''}`}
        style={{
          left: fillLeft,
          width: fillWidth,
          opacity: 0.18 + (range ? range.max : valueNorm) * 0.82,
        }}
      />
      {mode === 'single' ? (
        <span
          className="earth-matrix-cell-indicator single"
          style={{ left: trackLeftCalc(valueNorm) }}
        />
      ) : null}
      {mode === 'walk' && rangeNorm ? (
        <span
          className="earth-matrix-cell-indicator walk"
          style={{ left: trackLeftCalc(walkNorm) }}
        />
      ) : null}
      {mode === 'sampleHold' && rangeNorm ? (
        <span
          className={`earth-matrix-cell-indicator sample-hold${runtimeIndicator.isFlashing ? ' flashing' : ''}`}
          style={{ left: trackLeftCalc(walkNorm) }}
        />
      ) : null}
      {rangeNorm && range ? (
        <>
            <span
              className={`earth-matrix-cell-edge min${dragHandle === 'min' || dragHandle === 'both' ? ' active' : ''}`}
              style={{ left: trackLeftCalc(rangeNorm.min) }}
              role="slider"
              tabIndex={0}
              aria-label={`${control.label} minimum`}
              aria-valuemin={quantization.min}
              aria-valuemax={range.max}
              aria-valuenow={range.min}
              onKeyDown={(event) => handleKeyboard('min', event)}
            />
            <span
              className={`earth-matrix-cell-edge max${dragHandle === 'max' || dragHandle === 'both' ? ' active' : ''}`}
              style={{ left: trackLeftCalc(rangeNorm.max) }}
              role="slider"
              tabIndex={0}
              aria-label={`${control.label} maximum`}
              aria-valuemin={range.min}
              aria-valuemax={quantization.max}
              aria-valuenow={range.max}
              onKeyDown={(event) => handleKeyboard('max', event)}
            />
        </>
      ) : null}
      <span className="earth-matrix-cell-readout">
        {mode === 'single' ? (
          <span className="earth-matrix-cell-value">{readout}</span>
        ) : (
          <>
            <span className="earth-matrix-cell-mode">{mode === 'walk' ? '↝' : '⊡'}</span>
            <span className="earth-matrix-cell-range">{readout.slice(1)}</span>
          </>
        )}
      </span>
    </div>
  );
}
