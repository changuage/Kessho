import React from 'react';
import type { DualSliderRange } from '../DualSlider';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { SliderPageId } from '../sliderHelpCatalog';
import type { SliderMode, SliderState } from '../state';
import { useRuntimeSliderIndicator } from '../runtimeSliderState';
import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  TRACK_PAD_PX,
  clamp01,
  getDualHandle,
  getTouchGestureIntent,
  normalizeUnitRange,
  pointerToTrackNorm,
  quantize01,
  rangesEqual,
  releasePointerCaptureSafely,
  setSliderTouchSelectionLock,
  trackLeftCalc,
  trackWidthCalc,
  type MatrixCellHandle,
} from '../sliderSystem';
import '../sliderSystem/matrixSurface.css';

type SliderColumnId = 'level' | 'delayA' | 'delayB' | 'granular' | 'degrade' | 'reverb';
type ColumnId = SliderColumnId | 'dynamics';
type CellHandle = MatrixCellHandle;

interface RouteControl {
  key: keyof SliderState;
  label: string;
}

interface MatrixCell {
  kind: 'editable' | 'self' | 'blocked';
  route?: RouteControl;
  note?: string;
}

interface MatrixRow {
  id: string;
  label: string;
  accent: string;
  note?: string;
  sourceToggle?: 'toggle' | 'disable-only';
  cells: Record<SliderColumnId, MatrixCell>;
}

interface RoutingColumn {
  id: ColumnId;
  label: string;
  helpKey: string;
  note?: string;
}

interface DynamicsRouteControl {
  key: keyof SliderState;
  label: string;
}

interface RoutingSliderRuntime {
  mode: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
}

interface ColumnDragTarget {
  key: keyof SliderState;
  mode: SliderMode;
  startValue: number;
  startRange?: DualSliderRange;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}

interface ColumnDragMemoryTarget {
  key: keyof SliderState;
  mode: SliderMode;
  startValue: number;
  startRange?: DualSliderRange;
}

interface ColumnDragMemory {
  targets: ColumnDragMemoryTarget[];
  lastDelta: number;
}

interface CellDragState {
  kind: 'cell';
  dragId: string;
  pointerId: number;
  key: keyof SliderState;
  mode: SliderMode;
  handle: CellHandle;
  startValue: number;
  startRange?: DualSliderRange;
  startPointerNorm: number;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  lastValue?: number;
  lastRange?: DualSliderRange;
}

interface PendingCellTouchState {
  pointerId: number;
  dragId: string;
  startX: number;
  startY: number;
  key: keyof SliderState;
  mode: SliderMode;
  handle: CellHandle;
  startValue: number;
  startRange?: DualSliderRange;
  startPointerNorm: number;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}

interface ColumnDragState {
  kind: 'column';
  columnId: ColumnId;
  dragId: string;
  pointerId: number;
  startClientX: number;
  targets: ColumnDragTarget[];
  currentDelta: number;
  lastValues: Partial<Record<keyof SliderState, number>>;
  lastRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
}

type DragState = CellDragState | ColumnDragState;

export interface RoutingMatrixProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onColumnParamChange?: (key: keyof SliderState, value: number) => void;
  onToggleSource?: (sourceId: string, enabled: boolean) => void;
  sliderProps: (paramKey: keyof SliderState) => RoutingSliderRuntime;
  helpPage?: SliderPageId;
}

const ROUTING_MATRIX_ACTIVE_FILTER_STORAGE_KEY = 'routing-matrix:show-active-only:v1';

const ROUTING_MATRIX_OVERVIEW_HELP_KEY = 'routingMatrixOverview';

const COLUMNS: RoutingColumn[] = [
  { id: 'level', label: 'Level', helpKey: 'routingMatrixLevelColumn', note: 'Drag the header left or right to trim every level in this column together.' },
  { id: 'delayA', label: 'Delay A', helpKey: 'routingMatrixDelayAColumn', note: 'Drag the header left or right to trim every Delay A send in this column together.' },
  { id: 'delayB', label: 'Delay B', helpKey: 'routingMatrixDelayBColumn', note: 'Drag the header left or right to trim every Delay B send in this column together.' },
  { id: 'granular', label: 'Granular', helpKey: 'routingMatrixGranularColumn', note: 'Drag the header left or right to trim every granular feed in this column together.' },
  { id: 'degrade', label: 'Degrade', helpKey: 'routingMatrixDegradeColumn', note: 'Drag the header left or right to trim every Degrade send in this column together.' },
  { id: 'reverb', label: 'Reverb', helpKey: 'routingMatrixReverbColumn', note: 'Drag the header left or right to trim every reverb send in this column together.' },
  { id: 'dynamics', label: 'Dynamics', helpKey: 'routingMatrixDynamicsColumn', note: 'Click a cell to choose the terminal Dynamics Bus path: Skip, EQ 1, EQ 2, or Sidechain.' },
];
const DEFAULT_COLUMN = COLUMNS[0]!;

const DYNAMICS_DESTINATIONS = [
  { value: 0, label: 'Skip', className: 'skip' },
  { value: 1, label: 'EQ 1', className: 'eq1' },
  { value: 2, label: 'EQ 2', className: 'eq2' },
  { value: 3, label: 'Sidechain', className: 'sidechain' },
] as const;

const DYNAMICS_ROUTE_BY_ROW: Record<string, DynamicsRouteControl> = {
  pad1: { key: 'dynamicsPad1Bus', label: 'Pad 1 → Dynamics Bus' },
  pad2: { key: 'dynamicsPad2Bus', label: 'Pad 2 → Dynamics Bus' },
  lead1: { key: 'dynamicsLead1Bus', label: 'Lead 1 → Dynamics Bus' },
  lead2: { key: 'dynamicsLead2Bus', label: 'Lead 2 → Dynamics Bus' },
  piano: { key: 'dynamicsPianoBus', label: 'Piano → Dynamics Bus' },
  drums: { key: 'dynamicsDrumBus', label: 'Drums → Dynamics Bus' },
  granular: { key: 'dynamicsGranularBus', label: 'Granular → Dynamics Bus' },
  waves: { key: 'dynamicsWavesBus', label: 'Waves → Dynamics Bus' },
  water: { key: 'dynamicsWaterBus', label: 'Water → Dynamics Bus' },
  insects: { key: 'dynamicsInsectsBus', label: 'Insects → Dynamics Bus' },
  nature: { key: 'dynamicsNatureBus', label: 'Nature → Dynamics Bus' },
  delayAOut: { key: 'dynamicsDelayABus', label: 'Delay A → Dynamics Bus' },
  delayBOut: { key: 'dynamicsDelayBBus', label: 'Delay B → Dynamics Bus' },
  degrade: { key: 'dynamicsDegradeBus', label: 'Degrade → Dynamics Bus' },
  reverb: { key: 'dynamicsReverbBus', label: 'Reverb → Dynamics Bus' },
};

const ROWS: MatrixRow[] = [
  {
    id: 'pad1',
    label: 'Pad 1',
    accent: '#E07A84',
    note: 'Pad 1 now has its own Delay A, Delay B, Granular, Degrade, and Reverb sends.',
    cells: {
      level: { kind: 'editable', route: { key: 'synthLevel', label: 'Pad 1 Level' } },
      delayA: { kind: 'editable', route: { key: 'pad1DelayASend', label: 'Pad 1 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'pad1DelayBSend', label: 'Pad 1 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularPad1Send', label: 'Pad 1 → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradePad1Send', label: 'Pad 1 → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'pad1ReverbSend', label: 'Pad 1 → Reverb' } },
    },
  },
  {
    id: 'pad2',
    label: 'Pad 2',
    accent: '#B96A72',
    note: 'Pad 2 now has its own Delay A, Delay B, Granular, Degrade, and Reverb sends.',
    cells: {
      level: { kind: 'editable', route: { key: 'pad2Level', label: 'Pad 2 Level' } },
      delayA: { kind: 'editable', route: { key: 'pad2DelayASend', label: 'Pad 2 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'pad2DelayBSend', label: 'Pad 2 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularPad2Send', label: 'Pad 2 → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradePad2Send', label: 'Pad 2 → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'pad2ReverbSend', label: 'Pad 2 → Reverb' } },
    },
  },
  {
    id: 'lead1',
    label: 'Lead 1',
    accent: '#D4A520',
    cells: {
      level: { kind: 'editable', route: { key: 'lead1Level', label: 'Lead 1 Level' } },
      delayA: { kind: 'editable', route: { key: 'lead1DelayASend', label: 'Lead 1 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'lead1DelayBSend', label: 'Lead 1 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularLead1Send', label: 'Lead 1 → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeLead1Send', label: 'Lead 1 → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'lead1ReverbSend', label: 'Lead 1 → Reverb' } },
    },
  },
  {
    id: 'lead2',
    label: 'Lead 2',
    accent: '#BFA45A',
    cells: {
      level: { kind: 'editable', route: { key: 'lead2Level', label: 'Lead 2 Level' } },
      delayA: { kind: 'editable', route: { key: 'lead2DelayASend', label: 'Lead 2 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'lead2DelayBSend', label: 'Lead 2 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularLead2Send', label: 'Lead 2 → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeLead2Send', label: 'Lead 2 → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'lead2ReverbSend', label: 'Lead 2 → Reverb' } },
    },
  },
  {
    id: 'piano',
    label: 'Piano',
    accent: '#E8DCC4',
    cells: {
      level: { kind: 'editable', route: { key: 'pianoLevel', label: 'Piano Level' } },
      delayA: { kind: 'editable', route: { key: 'pianoDelayASend', label: 'Piano → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'pianoDelayBSend', label: 'Piano → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularPianoSend', label: 'Piano → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradePianoSend', label: 'Piano → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'pianoReverbSend', label: 'Piano → Reverb' } },
    },
  },
  {
    id: 'drums',
    label: 'Drums',
    accent: '#A870E8',
    note: 'Drums now trim straight into the shared Delay A and Delay B buses. Delay A timing and tone live with the shared Simple Delay controls.',
    cells: {
      level: { kind: 'editable', route: { key: 'drumLevel', label: 'Drums Level' } },
      delayA: { kind: 'editable', route: { key: 'drumDelayASend', label: 'Drums → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'drumDelayBSend', label: 'Drums → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularDrumSend', label: 'Drums → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeDrumSend', label: 'Drums → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'drumReverbSend', label: 'Drums → Reverb' } },
    },
  },
  {
    id: 'granular',
    label: 'Granular',
    accent: '#E8B44A',
    note: 'Granular → Delay B uses the current Clocked Space frontend for bus voicing. The matrix cell trims the source-send amount.',
    cells: {
      level: { kind: 'editable', route: { key: 'granularLevel', label: 'Granular Level' } },
      delayA: { kind: 'editable', route: { key: 'granularDelayASend', label: 'Granular → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'granularDelayBSend', label: 'Granular → Delay B' } },  // overridden dynamically
      granular: { kind: 'self' },
      degrade: { kind: 'editable', route: { key: 'granularDegradeSend', label: 'Granular → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'granularReverbSend', label: 'Granular → Reverb' } },
    },
  },
  {
    id: 'waves',
    label: 'Waves',
    accent: '#5A7B8A',
    cells: {
      level: { kind: 'editable', route: { key: 'oceanSampleLevel', label: 'Waves Level' } },
      delayA: { kind: 'editable', route: { key: 'oceanDelayASend', label: 'Waves → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'oceanDelayBSend', label: 'Waves → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularWavesSend', label: 'Waves → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeWavesSend', label: 'Waves → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'oceanReverbSend', label: 'Waves → Reverb' } },
    },
  },
  {
    id: 'water',
    label: 'Water',
    accent: '#6F9AB1',
    cells: {
      level: { kind: 'editable', route: { key: 'waterLevel', label: 'Water Level' } },
      delayA: { kind: 'editable', route: { key: 'waterDelayASend', label: 'Water → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'waterDelayBSend', label: 'Water → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularWaterSend', label: 'Water → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeWaterSend', label: 'Water → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'waterReverbSend', label: 'Water → Reverb' } },
    },
  },
  {
    id: 'insects',
    label: 'Insects',
    accent: '#7B9A6D',
    sourceToggle: 'disable-only',
    note: 'The current Earth engine exposes one shared insects dry master plus combined wet sends for both insect layers, so this row controls the family-level routing.',
    cells: {
      level: { kind: 'editable', route: { key: 'insectsSharedLevel', label: 'Insects Level' } },
      delayA: { kind: 'editable', route: { key: 'insDelayASend', label: 'Insects → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'insDelayBSend', label: 'Insects → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularInsectsSend', label: 'Insects → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeInsectsSend', label: 'Insects → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'insectsReverbSend', label: 'Insects → Reverb' } },
    },
  },
  {
    id: 'nature',
    label: 'Nature',
    accent: '#A6B98A',
    sourceToggle: 'disable-only',
    note: 'Nature now has a shared dry master plus one wet bus for Birds Alps, Birds Fujian, and Frogs. Individual source levels and texture shaping still live in the Active Earth Matrix.',
    cells: {
      level: { kind: 'editable', route: { key: 'natureLevel', label: 'Nature Level' } },
      delayA: { kind: 'editable', route: { key: 'natureDelayASend', label: 'Nature → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'natureDelayBSend', label: 'Nature → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularNatureSend', label: 'Nature → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeNatureSend', label: 'Nature → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'natureReverbSend', label: 'Nature → Reverb' } },
    },
  },
  {
    id: 'delayAOut',
    label: 'Delay A Out',
    accent: '#32C8C8',
    cells: {
      level: { kind: 'editable', route: { key: 'delayAMix', label: 'Delay A Level' } },
      delayA: { kind: 'self' },
      delayB: { kind: 'editable', route: { key: 'delayAToBSend', label: 'Delay A → Delay B' } },
      granular: { kind: 'editable', route: { key: 'delayAGranularSend', label: 'Delay A → Granular' } },
      degrade: { kind: 'editable', route: { key: 'delayADegradeSend', label: 'Delay A → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'delayAReverbSend', label: 'Delay A → Reverb' } },
    },
  },
  {
    id: 'delayBOut',
    label: 'Delay B Out',
    accent: '#32C7C7',
    note: 'Level trims the direct Clocked Space return. Reverb and Granular sends stay independent, so mute those too for total silence.',
    cells: {
      level: { kind: 'editable', route: { key: 'granularDelayMix', label: 'Delay B Level' } },
      delayA: { kind: 'editable', route: { key: 'delayBToASend', label: 'Delay B → Delay A' } },
      delayB: { kind: 'self' },
      granular: { kind: 'editable', route: { key: 'delayBGranularSend', label: 'Delay B → Granular' } },  // overridden dynamically
      degrade: { kind: 'editable', route: { key: 'delayBDegradeSend', label: 'Delay B → Degrade' } },
      reverb: { kind: 'editable', route: { key: 'granularDelayReverbSend', label: 'Delay B → Reverb' } },
    },
  },
  {
    id: 'degrade',
    label: 'Degrade',
    accent: '#A980FF',
    note: 'Degrade is the return for the Drift and Erosion processors. It can feed Reverb, but Reverb and Degrade cannot feed each other at the same time.',
    cells: {
      level: { kind: 'editable', route: { key: 'degradeLevel', label: 'Degrade Level' } },
      delayA: { kind: 'blocked', note: 'Degrade does not currently feed Delay A.' },
      delayB: { kind: 'blocked', note: 'Degrade does not currently feed Delay B.' },
      granular: { kind: 'blocked', note: 'Degrade does not currently feed Granular.' },
      degrade: { kind: 'self' },
      reverb: { kind: 'editable', route: { key: 'degradeReverbSend', label: 'Degrade → Reverb' } },
    },
  },
  {
    id: 'reverb',
    label: 'Reverb',
    accent: '#D49660',
    note: 'Reverb is a return bus here. Its routing row trims the wet output level while source sends still live on their own rows.',
    cells: {
      level: { kind: 'editable', route: { key: 'reverbLevel', label: 'Reverb Level' } },
      delayA: { kind: 'blocked', note: 'Reverb does not currently feed Delay A.' },
      delayB: { kind: 'blocked', note: 'Reverb does not currently feed Delay B.' },
      granular: { kind: 'blocked', note: 'Reverb does not currently feed Granular.' },
      degrade: { kind: 'editable', route: { key: 'reverbDegradeSend', label: 'Reverb → Degrade' } },
      reverb: { kind: 'self' },
    },
  },
];

function scaleRangeTowardZero(range: DualSliderRange, delta: number): DualSliderRange {
  const startMin = clamp01(range.min);
  const startMax = clamp01(range.max);
  if (startMax <= 0.0005) {
    const point = quantize01(clamp01(delta));
    return { min: point, max: point };
  }

  const scaledMax = clamp01(startMax + delta);
  const scale = scaledMax / startMax;
  return {
    min: quantize01(clamp01(startMin * scale)),
    max: quantize01(clamp01(startMax * scale)),
  };
}

function columnTargetIsSingle(target: Pick<ColumnDragTarget, 'mode' | 'startRange'> | Pick<ColumnDragMemoryTarget, 'mode' | 'startRange'>): boolean {
  return target.mode === 'single' || !target.startRange;
}

function stripColumnDragTarget(target: ColumnDragTarget): ColumnDragMemoryTarget {
  return {
    key: target.key,
    mode: target.mode,
    startValue: target.startValue,
    startRange: target.startRange,
  };
}

function computeColumnTargetValue(target: ColumnDragMemoryTarget, delta: number): number {
  return quantize01(target.startValue + delta);
}

function computeColumnTargetRange(target: ColumnDragMemoryTarget, delta: number): DualSliderRange | undefined {
  if (columnTargetIsSingle(target) || !target.startRange) return undefined;
  return scaleRangeTowardZero(target.startRange, delta);
}

function columnDragMemoryMatches(memory: ColumnDragMemory, targets: ColumnDragTarget[]): boolean {
  if (memory.targets.length !== targets.length) return false;

  for (const target of targets) {
    const memoryTarget = memory.targets.find((entry) => entry.key === target.key);
    if (!memoryTarget) return false;
    if (columnTargetIsSingle(memoryTarget) !== columnTargetIsSingle(target)) return false;

    if (columnTargetIsSingle(memoryTarget)) {
      if (Math.abs(computeColumnTargetValue(memoryTarget, memory.lastDelta) - target.startValue) > 0.0005) {
        return false;
      }
      continue;
    }

    const expectedRange = computeColumnTargetRange(memoryTarget, memory.lastDelta);
    if (!expectedRange || !rangesEqual(expectedRange, target.startRange)) {
      return false;
    }
  }

  return true;
}

function cellValue(state: SliderState, route: RouteControl | undefined): number {
  if (!route) return 0;
  return clamp01(Number(state[route.key] ?? 0) || 0);
}

function isSliderColumnId(columnId: ColumnId): columnId is SliderColumnId {
  return columnId !== 'dynamics';
}

function dynamicsDestinationIndex(value: unknown): number {
  const index = Math.round(Number(value ?? 0));
  return Math.max(0, Math.min(DYNAMICS_DESTINATIONS.length - 1, Number.isFinite(index) ? index : 0));
}

function rowIsEnabled(row: MatrixRow, state: SliderState): boolean {
  switch (row.id) {
    case 'pad1':
      return !!state.padEnabled;
    case 'pad2':
      return !!state.pad2Enabled;
    case 'lead1':
      return !!state.leadEnabled;
    case 'lead2':
      return !!state.lead2Enabled;
    case 'piano':
      return !!state.pianoEnabled;
    case 'drums':
      return !!state.drumEnabled;
    case 'granular':
      return !!state.granularEnabled;
    case 'waves':
      return !!state.oceanSampleEnabled;
    case 'water':
      return !!state.waterEnabled;
    case 'insects':
      return !!(state.insectsEnabled || state.insects2Enabled);
    case 'nature':
      return !!(state.birdsEnabled || state.birds2Enabled || state.frogsEnabled);
    case 'delayAOut':
      return !!state.delayAEnabled;
    case 'delayBOut':
      return !!state.granularDelayEnabled;
    case 'degrade':
      return !!((state.dynamicsEnabled || state.degradeEnabled) && (state.driftEnabled || state.erosionEnabled));
    case 'reverb':
      return !!state.reverbEnabled || (state.reverbDegradeSend ?? 0) > 0.0001 || (state.degradeReverbSend ?? 0) > 0.0001;
    default:
      return true;
  }
}

function getResolvedMode(runtime: RoutingSliderRuntime | null): SliderMode {
  if (!runtime) return 'single';
  return runtime.mode !== 'single' && runtime.dualRange ? runtime.mode : 'single';
}

function getColumnTargets(
  columnId: ColumnId,
  rows: MatrixRow[],
  state: SliderState,
  sliderProps: (paramKey: keyof SliderState) => RoutingSliderRuntime,
): ColumnDragTarget[] {
  if (!isSliderColumnId(columnId)) return [];
  const seen = new Set<keyof SliderState>();
  const targets: ColumnDragTarget[] = [];

  for (const row of rows) {
    if (!rowIsEnabled(row, state)) continue;
    const cell = row.cells[columnId];
    if (cell.kind !== 'editable' || !cell.route || seen.has(cell.route.key)) continue;
    seen.add(cell.route.key);
    const runtime = sliderProps(cell.route.key);
    const mode = getResolvedMode(runtime);
    targets.push({
      key: cell.route.key,
      mode,
      startValue: quantize01(Number(state[cell.route.key] ?? 0) || 0),
      startRange: mode === 'single' ? undefined : normalizeUnitRange(runtime.dualRange),
      onDualRangeChange: runtime.onDualRangeChange ?? (() => undefined),
    });
  }

  return targets;
}

function rangeDisplay(mode: SliderMode, range?: DualSliderRange): string {
  if (!range) return '0%';
  const icon = mode === 'walk' ? '↝' : '⊡';
  return `${icon}${Math.round(range.min * 100)}–${Math.round(range.max * 100)}`;
}

function singleDisplay(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type RoutingMatrixCellIndicatorLayerProps = {
  routeKey: keyof SliderState;
  mode: SliderMode;
  value: number;
  range?: DualSliderRange;
  fallbackWalkPosition?: number;
  fallbackFlashing?: boolean;
};

const RoutingMatrixCellIndicatorLayer = React.memo(function RoutingMatrixCellIndicatorLayer({
  routeKey,
  mode,
  value,
  range,
  fallbackWalkPosition,
  fallbackFlashing = false,
}: RoutingMatrixCellIndicatorLayerProps) {
  const runtimeIndicator = useRuntimeSliderIndicator(
    String(routeKey),
    mode,
    fallbackWalkPosition,
    fallbackFlashing,
  );
  const indicatorNorm = range
    ? clamp01(
      range.min + (clamp01(runtimeIndicator.walkPosition ?? fallbackWalkPosition ?? value) * (range.max - range.min)),
    )
    : value;

  return (
    <>
      {mode === 'single' && (
        <span
          className="routing-matrix-cell-indicator single"
          style={{ left: trackLeftCalc(value) }}
        />
      )}
      {mode === 'walk' && range && (
        <span
          className="routing-matrix-cell-indicator walk"
          style={{ left: trackLeftCalc(indicatorNorm) }}
        />
      )}
      {mode === 'sampleHold' && range && (
        <span
          className={`routing-matrix-cell-indicator sample-hold${runtimeIndicator.isFlashing ? ' flashing' : ''}`}
          style={{ left: trackLeftCalc(indicatorNorm) }}
        />
      )}
    </>
  );
});

export default function RoutingMatrix({
  state,
  isMobile,
  onParamChange,
  onColumnParamChange,
  onToggleSource,
  sliderProps,
  helpPage = 'routing',
}: RoutingMatrixProps) {
  const { announceHelp, announceSlider } = useSliderHelp();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [activeMobileColumn, setActiveMobileColumn] = React.useState<ColumnId>('level');
  const [showActiveOnly, setShowActiveOnly] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(ROUTING_MATRIX_ACTIVE_FILTER_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dragStateRef = React.useRef<DragState | null>(null);
  const pendingCellTouchRef = React.useRef<PendingCellTouchState | null>(null);
  const columnDragMemoryRef = React.useRef<Partial<Record<ColumnId, ColumnDragMemory>>>({});
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMetaRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const longPressActionRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    announceHelp(ROUTING_MATRIX_OVERVIEW_HELP_KEY, {
      page: helpPage,
      label: 'FX Routing Matrix',
    });
  }, [announceHelp, helpPage]);
  const longPressConsumedRef = React.useRef(false);
  const dblClickGuardRef = React.useRef<{ time: number; cellId: string } | null>(null);
  const activeColumn = React.useMemo(
    () => COLUMNS.find((column) => column.id === activeMobileColumn) ?? DEFAULT_COLUMN,
    [activeMobileColumn],
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        ROUTING_MATRIX_ACTIVE_FILTER_STORAGE_KEY,
        showActiveOnly ? '1' : '0',
      );
    } catch {
      // Ignore storage failures; the filter can stay in-memory.
    }
  }, [showActiveOnly]);

  // Bidirectional mutual exclusion: Granular ↔ Delay B
  const granularToDelayBActive = (state.granularDelayBSend ?? 0) > 0.0001;
  const delayBToGranularActive = (state.delayBGranularSend ?? 0) > 0.0001;
  const effectiveRows = React.useMemo(() => ROWS.map(row => {
    if (row.id === 'granular' && delayBToGranularActive) {
      return { ...row, cells: { ...row.cells, delayB: { kind: 'blocked' as const, note: 'Blocked while Delay B → Granular is active' } } };
    }
    if (row.id === 'delayBOut' && granularToDelayBActive) {
      return { ...row, cells: { ...row.cells, granular: { kind: 'blocked' as const, note: 'Blocked while Granular → Delay B is active' } } };
    }
    return row;
  }), [granularToDelayBActive, delayBToGranularActive]);
  const visibleRows = React.useMemo(
    () => (showActiveOnly ? effectiveRows.filter((row) => rowIsEnabled(row, state)) : effectiveRows),
    [effectiveRows, showActiveOnly, state],
  );

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressMetaRef.current = null;
    longPressActionRef.current = null;
  }, []);

  React.useEffect(() => () => {
    clearLongPress();
    pendingCellTouchRef.current = null;
    setSliderTouchSelectionLock(false);
  }, [clearLongPress]);

  const stopDrag = React.useCallback((dragId: string, pointerId: number) => {
    const drag = dragStateRef.current;
    if (!drag || drag.dragId !== dragId || drag.pointerId !== pointerId) return false;
    if (drag.kind === 'column') {
      columnDragMemoryRef.current[drag.columnId] = {
        targets: drag.targets.map(stripColumnDragTarget),
        lastDelta: drag.currentDelta,
      };
    }
    dragStateRef.current = null;
    setDraggingId(null);
    return true;
  }, []);

  const resetInteraction = React.useCallback(() => {
    clearLongPress();
    pendingCellTouchRef.current = null;
    dragStateRef.current = null;
    setDraggingId(null);
    longPressConsumedRef.current = false;
    setSliderTouchSelectionLock(false);
  }, [clearLongPress]);

  const startColumnDrag = React.useCallback((
    columnId: ColumnId,
    dragId: string,
    pointerId: number,
    startClientX: number,
    width: number,
    targets: ColumnDragTarget[],
  ) => {
    const savedMemory = columnDragMemoryRef.current[columnId];
    const activeMemory = savedMemory && columnDragMemoryMatches(savedMemory, targets)
      ? savedMemory
      : null;
    const baseTargets = activeMemory
      ? targets.map((target) => {
          const memoryTarget = activeMemory.targets.find((entry) => entry.key === target.key);
          return memoryTarget ? {
            ...target,
            mode: memoryTarget.mode,
            startValue: memoryTarget.startValue,
            startRange: memoryTarget.startRange,
          } : target;
        })
      : targets;
    const initialDelta = activeMemory?.lastDelta ?? 0;

    dragStateRef.current = {
      kind: 'column',
      columnId,
      dragId,
      pointerId,
      startClientX: startClientX - initialDelta * Math.max(1, width),
      targets: baseTargets,
      currentDelta: initialDelta,
      lastValues: Object.fromEntries(
        targets
          .filter((target) => target.mode === 'single' || !target.startRange)
          .map((target) => [target.key, target.startValue]),
      ),
      lastRanges: Object.fromEntries(
        targets
          .filter((target) => target.mode !== 'single' && target.startRange)
          .map((target) => [target.key, target.startRange as DualSliderRange]),
      ),
    };
    setDraggingId(dragId);
  }, []);

  const startCellDrag = React.useCallback((
    dragId: string,
    pointerId: number,
    key: keyof SliderState,
    mode: SliderMode,
    handle: CellHandle,
    startValue: number,
    startRange: DualSliderRange | undefined,
    startPointerNorm: number,
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void,
  ) => {
    dragStateRef.current = {
      kind: 'cell',
      dragId,
      pointerId,
      key,
      mode,
      handle,
      startValue,
      startRange,
      startPointerNorm,
      onDualRangeChange,
      lastValue: handle === 'single' ? startValue : undefined,
      lastRange: handle === 'single' ? undefined : startRange,
    };
    setDraggingId(dragId);
  }, []);

  const scheduleLongPress = React.useCallback((
    pointerId: number,
    startX: number,
    startY: number,
    action: () => void,
  ) => {
    clearLongPress();
    longPressConsumedRef.current = false;
    setSliderTouchSelectionLock(true);
    longPressMetaRef.current = { pointerId, startX, startY };
    longPressActionRef.current = action;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressConsumedRef.current = true;
      pendingCellTouchRef.current = null;
      dragStateRef.current = null;
      setDraggingId(null);
      longPressActionRef.current?.();
      longPressActionRef.current = null;
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_MS);
  }, [clearLongPress]);

  const maybeCancelLongPress = React.useCallback((pointerId: number, clientX: number, clientY: number) => {
    const meta = longPressMetaRef.current;
    if (!meta || meta.pointerId !== pointerId) return;
    if (Math.abs(clientX - meta.startX) > LONG_PRESS_MOVE_TOLERANCE_PX || Math.abs(clientY - meta.startY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const applyColumnDrag = React.useCallback((clientX: number, width: number) => {
    const drag = dragStateRef.current;
    if (!drag || drag.kind !== 'column') return;
    const delta = (clientX - drag.startClientX) / Math.max(1, width);
    drag.currentDelta = delta;

    for (const target of drag.targets) {
      if (target.mode === 'single' || !target.startRange) {
        const next = quantize01(target.startValue + delta);
        if (drag.lastValues[target.key] === next) continue;
        drag.lastValues[target.key] = next;
        (onColumnParamChange ?? onParamChange)(target.key, next);
        continue;
      }

      const nextRange = scaleRangeTowardZero(target.startRange, delta);
      if (rangesEqual(drag.lastRanges[target.key], nextRange)) continue;
      drag.lastRanges[target.key] = nextRange;
      target.onDualRangeChange(target.key, nextRange.min, nextRange.max);
    }
  }, [onColumnParamChange, onParamChange]);

  const applyCellDrag = React.useCallback((pointerNorm: number) => {
    const drag = dragStateRef.current;
    if (!drag || drag.kind !== 'cell') return;

    if (drag.mode === 'single' || !drag.startRange || drag.handle === 'single') {
      const next = quantize01(pointerNorm);
      if (drag.lastValue === next) return;
      drag.lastValue = next;
      onParamChange(drag.key, next);
      return;
    }

    let nextRange: DualSliderRange;
    if (drag.handle === 'min') {
      nextRange = {
        min: quantize01(Math.min(pointerNorm, drag.startRange.max)),
        max: drag.startRange.max,
      };
    } else if (drag.handle === 'max') {
      nextRange = {
        min: drag.startRange.min,
        max: quantize01(Math.max(pointerNorm, drag.startRange.min)),
      };
    } else {
      const widthNorm = drag.startRange.max - drag.startRange.min;
      const rawMin = drag.startRange.min + (pointerNorm - drag.startPointerNorm);
      const nextMin = quantize01(Math.min(Math.max(0, rawMin), 1 - widthNorm));
      nextRange = {
        min: nextMin,
        max: quantize01(nextMin + widthNorm),
      };
    }

    if (rangesEqual(drag.lastRange, nextRange)) return;
    drag.lastRange = nextRange;
    drag.onDualRangeChange(drag.key, nextRange.min, nextRange.max);
  }, [onParamChange]);

  const renderRowLabel = React.useCallback((row: MatrixRow, rowEnabled: boolean, suffix = '') => {
    const disableOnly = row.sourceToggle === 'disable-only';
    const canToggle = !showActiveOnly && !!onToggleSource && (!disableOnly || rowEnabled);
    const offInAll = !showActiveOnly && !rowEnabled;
    const note = row.note ?? row.label;
    const title = disableOnly && !rowEnabled && !showActiveOnly
      ? `${note} Choose child sources in the Active Earth Matrix to enable this family.`
      : canToggle
        ? `${note} Click or tap to ${disableOnly ? 'disable this family' : 'toggle this source'}.`
        : note;

    return (
      <button
        key={`row:${row.id}${suffix}`}
        type="button"
        className={`routing-matrix-rowlabel routing-matrix-rowlabel-button${canToggle ? ' is-toggleable' : ''}${offInAll ? ' source-off' : ''}`}
        style={{ '--row-accent': offInAll ? '#7e8794' : row.accent } as React.CSSProperties}
        title={title}
        aria-pressed={canToggle ? rowEnabled : undefined}
        aria-disabled={!canToggle}
        tabIndex={canToggle ? 0 : -1}
        onClick={canToggle ? () => onToggleSource(row.id, !rowEnabled) : undefined}
      >
        <span className={`routing-matrix-rowdot${offInAll ? ' is-off' : ''}`} style={{ backgroundColor: offInAll ? undefined : row.accent }} />
        <span>{row.label}</span>
      </button>
    );
  }, [onToggleSource, showActiveOnly]);

  const renderSourceHeader = React.useCallback((suffix = '') => (
    <button
      key={`source-header${suffix}`}
      type="button"
      className="routing-matrix-corner routing-matrix-corner-button"
      aria-pressed={showActiveOnly}
      title={showActiveOnly ? 'Showing only active sources. Click to show every source.' : 'Showing every source. Click to show only active sources.'}
      onClick={() => setShowActiveOnly((prev) => !prev)}
    >
      <span className="routing-matrix-header-label">Source</span>
      <span className="routing-matrix-header-meta">{showActiveOnly ? 'on' : 'all'}</span>
    </button>
  ), [showActiveOnly]);

  const renderColumnHeader = React.useCallback((column: RoutingColumn, className?: string) => {
    const headerId = `column:${column.id}`;
    const targets = getColumnTargets(column.id, visibleRows, state, sliderProps);
    const isSliderColumn = isSliderColumnId(column.id);

    return (
      <button
        key={column.id}
        type="button"
        className={`routing-matrix-header routing-matrix-header-button${!isSliderColumn ? ' destination' : ''}${className ? ` ${className}` : ''}${draggingId === headerId ? ' dragging' : ''}`}
        title={column.note}
        disabled={isSliderColumn && targets.length === 0}
        onMouseEnter={() => announceHelp(column.helpKey, { page: helpPage, label: `${column.label} Column` })}
        onFocus={() => announceHelp(column.helpKey, { page: helpPage, label: `${column.label} Column` })}
        onPointerDown={(event) => {
          if (!isSliderColumn || targets.length === 0) return;
          announceHelp(column.helpKey, { page: helpPage, label: `${column.label} Column` });
          clearLongPress();
          startColumnDrag(column.id, headerId, event.pointerId, event.clientX, event.currentTarget.getBoundingClientRect().width, targets);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragStateRef.current;
          if (!drag || drag.kind !== 'column' || drag.dragId !== headerId || drag.pointerId !== event.pointerId) return;
          applyColumnDrag(event.clientX, event.currentTarget.getBoundingClientRect().width);
        }}
        onPointerUp={(event) => {
          stopDrag(headerId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
        onPointerCancel={(event) => {
          stopDrag(headerId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
      >
        <span className="routing-matrix-header-label">{column.label}</span>
      </button>
    );
  }, [announceHelp, applyColumnDrag, clearLongPress, draggingId, helpPage, resetInteraction, sliderProps, startColumnDrag, state, stopDrag, visibleRows]);

  const renderDynamicsCell = React.useCallback((row: MatrixRow, rowEnabled: boolean, suffix = '') => {
    const route = DYNAMICS_ROUTE_BY_ROW[row.id];
    const offInAll = !showActiveOnly && !rowEnabled;
    if (!route) {
      return (
        <button
          key={`cell:${row.id}:dynamics${suffix}`}
          type="button"
          className={`routing-matrix-cell blocked${offInAll ? ' source-off' : ''}`}
          style={{ '--row-accent': offInAll ? '#7e8794' : row.accent } as React.CSSProperties}
          disabled
        >
          <span className="routing-matrix-cell-static" />
        </button>
      );
    }

    const value = dynamicsDestinationIndex(state[route.key]);
    const option = DYNAMICS_DESTINATIONS[value] ?? DYNAMICS_DESTINATIONS[0]!;
    const nextOption = DYNAMICS_DESTINATIONS[(value + 1) % DYNAMICS_DESTINATIONS.length] ?? DYNAMICS_DESTINATIONS[0]!;
    const active = value > 0;
    const title = `${route.label}: ${option.label}. Click to change to ${nextOption.label}.`;

    return (
      <button
        key={`cell:${row.id}:dynamics${suffix}`}
        type="button"
        className={`routing-matrix-cell dynamics-route ${active ? 'active' : 'skip'} ${option.className}${offInAll ? ' source-off' : ''}`}
        style={{ '--row-accent': offInAll ? '#7e8794' : row.accent } as React.CSSProperties}
        title={title}
        aria-label={title}
        onMouseEnter={() => announceHelp('routingMatrixDynamicsColumn', { page: helpPage, label: 'Dynamics Column' })}
        onFocus={() => announceHelp('routingMatrixDynamicsColumn', { page: helpPage, label: 'Dynamics Column' })}
        onClick={() => {
          announceHelp('routingMatrixDynamicsColumn', { page: helpPage, label: 'Dynamics Column' });
          onParamChange(route.key, nextOption.value);
        }}
      >
        <span className="routing-matrix-dynamics-rail" aria-hidden="true">
          {DYNAMICS_DESTINATIONS.map((destination) => (
            <span
              key={destination.value}
              className={`routing-matrix-dynamics-dot ${destination.className}${destination.value === value ? ' active' : ''}`}
            />
          ))}
        </span>
        <span className="routing-matrix-dynamics-label">{option.label}</span>
      </button>
    );
  }, [announceHelp, helpPage, onParamChange, showActiveOnly, state]);

  const renderCell = React.useCallback((row: MatrixRow, rowEnabled: boolean, column: RoutingColumn, suffix = '') => {
    if (!isSliderColumnId(column.id)) {
      return renderDynamicsCell(row, rowEnabled, suffix);
    }

    const cell = row.cells[column.id];
    const route = cell.kind === 'editable' ? (cell.route ?? null) : null;
    const value = cellValue(state, cell.route);
    const cellId = `cell:${row.id}:${column.id}${suffix}`;
    const offInAll = !showActiveOnly && !rowEnabled;
    const runtime = route ? sliderProps(route.key) : null;
    const mode = getResolvedMode(runtime);
    const range = mode === 'single' ? undefined : normalizeUnitRange(runtime?.dualRange);
    const fillLeft = range ? trackLeftCalc(range.min) : `${TRACK_PAD_PX}px`;
    const fillWidth = range ? trackWidthCalc(range.max - range.min) : trackWidthCalc(value);
    const readout = cell.kind === 'editable'
      ? (mode === 'single' ? singleDisplay(value) : rangeDisplay(mode, range))
      : (cell.kind === 'self' ? 'Self' : '');
    const isWalk = mode === 'walk' && !!range;
    const isSampleHold = mode === 'sampleHold' && !!range;
    const activeHandle = draggingId === cellId
      && dragStateRef.current?.kind === 'cell'
      && dragStateRef.current.dragId === cellId
      ? dragStateRef.current.handle
      : null;

    return (
      <button
        key={cellId}
        type="button"
        className={`routing-matrix-cell ${cell.kind}${column.id === 'level' ? ' level-col' : ''}${draggingId === cellId ? ' dragging' : ''}${offInAll ? ' source-off' : ''}`}
        style={{ '--row-accent': offInAll ? '#7e8794' : row.accent } as React.CSSProperties}
        title={cell.note ?? row.note}
        disabled={cell.kind !== 'editable' || !route}
        onMouseEnter={() => {
          if (!route) return;
          announceSlider(String(route.key), { page: helpPage });
        }}
        onFocus={() => {
          if (!route) return;
          announceSlider(String(route.key), { page: helpPage });
        }}
        onDoubleClick={() => {
          if (!route || !runtime) return;
          runtime.onCycleMode?.(route.key);
        }}
        onPointerDown={(event) => {
          if (!route || !runtime) return;
          announceSlider(String(route.key), { page: helpPage });
          clearLongPress();
          pendingCellTouchRef.current = null;

          const now = Date.now();
          const guard = dblClickGuardRef.current;
          const isPotentialDblClick = guard && guard.cellId === cellId && (now - guard.time) < 400;
          dblClickGuardRef.current = { time: now, cellId };
          if (isPotentialDblClick) return;

          const rect = event.currentTarget.getBoundingClientRect();
          const pointerNorm = pointerToTrackNorm(event.clientX, rect);
          const nextMode = getResolvedMode(runtime);
          const nextRange = nextMode === 'single' ? undefined : normalizeUnitRange(runtime.dualRange);
          const handle = nextMode === 'single' || !nextRange
            ? 'single'
            : getDualHandle(pointerNorm, nextRange, rect);

          if (event.pointerType === 'touch') {
            pendingCellTouchRef.current = {
              pointerId: event.pointerId,
              dragId: cellId,
              startX: event.clientX,
              startY: event.clientY,
              key: route.key,
              mode: nextMode,
              handle,
              startValue: value,
              startRange: nextRange,
              startPointerNorm: pointerNorm,
              onDualRangeChange: runtime.onDualRangeChange ?? (() => undefined),
            };
            setSliderTouchSelectionLock(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            scheduleLongPress(event.pointerId, event.clientX, event.clientY, () => {
              runtime.onCycleMode?.(route.key);
            });
            return;
          }

          startCellDrag(
            cellId,
            event.pointerId,
            route.key,
            nextMode,
            handle,
            value,
            nextRange,
            pointerNorm,
            runtime.onDualRangeChange ?? (() => undefined),
          );
          applyCellDrag(pointerNorm);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pendingTouch = pendingCellTouchRef.current;
          if (pendingTouch?.pointerId === event.pointerId && pendingTouch.dragId === cellId) {
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
            pendingCellTouchRef.current = null;

            if (intent === 'scroll') {
              setSliderTouchSelectionLock(false);
              releasePointerCaptureSafely(event.currentTarget, event.pointerId);
              return;
            }

            event.preventDefault();
            startCellDrag(
              pendingTouch.dragId,
              event.pointerId,
              pendingTouch.key,
              pendingTouch.mode,
              pendingTouch.handle,
              pendingTouch.startValue,
              pendingTouch.startRange,
              pendingTouch.startPointerNorm,
              pendingTouch.onDualRangeChange,
            );
            applyCellDrag(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
            return;
          }

          maybeCancelLongPress(event.pointerId, event.clientX, event.clientY);
          if (longPressConsumedRef.current) return;

          const drag = dragStateRef.current;
          if (!drag || drag.kind !== 'cell' || drag.dragId !== cellId || drag.pointerId !== event.pointerId) return;
          if (event.pointerType === 'touch') event.preventDefault();
          applyCellDrag(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
        }}
        onPointerUp={(event) => {
          const pendingTouch = pendingCellTouchRef.current;
          if (pendingTouch?.pointerId === event.pointerId && pendingTouch.dragId === cellId) {
            if (!longPressConsumedRef.current) {
              startCellDrag(
                pendingTouch.dragId,
                event.pointerId,
                pendingTouch.key,
                pendingTouch.mode,
                pendingTouch.handle,
                pendingTouch.startValue,
                pendingTouch.startRange,
                pendingTouch.startPointerNorm,
                pendingTouch.onDualRangeChange,
              );
              applyCellDrag(pendingTouch.startPointerNorm);
              stopDrag(cellId, event.pointerId);
            }
            releasePointerCaptureSafely(event.currentTarget, event.pointerId);
            resetInteraction();
            return;
          }

          stopDrag(cellId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
        onPointerCancel={(event) => {
          stopDrag(cellId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
      >
        {cell.kind === 'editable' && (
          <>
            <span className="routing-matrix-cell-track" />
            <span
              className={`routing-matrix-cell-fill${isWalk ? ' walk' : ''}${isSampleHold ? ' sample-hold' : ''}`}
              style={{
                left: fillLeft,
                width: fillWidth,
                opacity: 0.15 + (range ? range.max : value) * 0.85,
              }}
            />
            {route && (
              <RoutingMatrixCellIndicatorLayer
                routeKey={route.key}
                mode={mode}
                value={value}
                range={range}
                fallbackWalkPosition={runtime?.walkPosition}
                fallbackFlashing={runtime?.isFlashing}
              />
            )}
            {range && (
              <>
                <span
                  className={`routing-matrix-cell-edge min${activeHandle === 'min' || activeHandle === 'both' ? ' active' : ''}`}
                  style={{ left: trackLeftCalc(range.min) }}
                />
                <span
                  className={`routing-matrix-cell-edge max${activeHandle === 'max' || activeHandle === 'both' ? ' active' : ''}`}
                  style={{ left: trackLeftCalc(range.max) }}
                />
              </>
            )}
            <span className="routing-matrix-cell-readout">
              {mode === 'single' ? (
                <span className="routing-matrix-cell-value">{readout}</span>
              ) : (
                <>
                  <span className="routing-matrix-cell-mode">{mode === 'walk' ? '↝' : '⊡'}</span>
                  <span className="routing-matrix-cell-range">
                    {range ? `${Math.round(range.min * 100)}–${Math.round(range.max * 100)}` : singleDisplay(value)}
                  </span>
                </>
              )}
            </span>
          </>
        )}
        {cell.kind !== 'editable' && (
          <span className="routing-matrix-cell-static">{readout}</span>
        )}
      </button>
    );
  }, [
    announceSlider,
    applyCellDrag,
    clearLongPress,
    draggingId,
    helpPage,
    maybeCancelLongPress,
    onParamChange,
    resetInteraction,
    scheduleLongPress,
    showActiveOnly,
    renderDynamicsCell,
    sliderProps,
    startCellDrag,
    state,
    stopDrag,
  ]);

  return (
    <div
      className={`routing-matrix${isMobile ? ' mobile' : ''}`}
      onMouseEnter={() => announceHelp(ROUTING_MATRIX_OVERVIEW_HELP_KEY, {
        page: helpPage,
        label: 'FX Routing Matrix',
      })}
    >
      {isMobile ? (
        <>
          <div className="routing-matrix-mobile-picker" role="tablist" aria-label="Routing matrix columns">
            {COLUMNS.map((column) => (
              <button
                key={column.id}
                type="button"
                className={`routing-matrix-mobile-picker-button${activeMobileColumn === column.id ? ' active' : ''}`}
                onClick={() => {
                  setActiveMobileColumn(column.id);
                  announceHelp(column.helpKey, { page: helpPage, label: `${column.label} Column` });
                }}
                onFocus={() => announceHelp(column.helpKey, { page: helpPage, label: `${column.label} Column` })}
              >
                {column.label}
              </button>
            ))}
          </div>

          <div className="routing-matrix-mobile-head">
            {renderSourceHeader(':mobile')}
            {renderColumnHeader(activeColumn, 'routing-matrix-mobile-header')}
          </div>

          <div className="routing-matrix-mobile-list">
            {visibleRows.map((row) => {
              const rowEnabled = rowIsEnabled(row, state);
              return (
                <div key={`${row.id}:${activeMobileColumn}`} className="routing-matrix-mobile-row">
                  {renderRowLabel(row, rowEnabled, ':mobile')}
                  {renderCell(row, rowEnabled, activeColumn, ':mobile')}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="routing-matrix-scroll">
          <div className="routing-matrix-grid">
            {renderSourceHeader()}
            {COLUMNS.map((column) => renderColumnHeader(column))}

            {visibleRows.map((row) => {
              const rowEnabled = rowIsEnabled(row, state);
              return (
                <React.Fragment key={row.id}>
                  {renderRowLabel(row, rowEnabled)}
                  {COLUMNS.map((column) => renderCell(row, rowEnabled, column))}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
