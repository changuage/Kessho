import React from 'react';
import { resolveEffectiveSliderValue } from '../sliderSystem/effectiveValue';
import type { DualSliderRange } from '../DualSlider';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { SliderMode, SliderState } from '../state';
import { useRuntimeSliderIndicator } from '../runtimeSliderState';
import { getRoutingSourceDef, ROUTING_SOURCE_REGISTRY } from '../routing';
import {
  FX_ROUTING_NODE_ACCENTS,
  FX_ROUTING_NODE_IDS,
  FX_ROUTING_NODE_LEVEL_KEYS,
  FX_ROUTING_NODE_LABELS,
  FX_ROUTING_NODE_ROW_IDS,
  canEnableFxRoute,
  fxRouteRuntimeKey,
  isFxRoutingNodeActive,
  setFxRoutePresence,
  type FxRoutingConnection,
  type FxRoutingNodeId,
} from '../routing/fxRoutingGraph';
import { NATURE_SLOT_KEYS } from '../../audio/natureSlots';
import { natureSampleLabel } from '../../audio/natureSampleCatalog';
import { INSECT_ENGINES } from '../../audio/waterPresets';
import { WATER_LAYER_ENABLED_BY_LEVEL } from '../../audio/waterLayerActivation';
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
  shiftRangePreservingWidth,
  setSliderTouchSelectionLock,
  trackLeftCalc,
  trackWidthCalc,
  useRafCoalescedEmitter,
  ModulationModeIcon,
} from '../sliderSystem';
import '../sliderSystem/matrixSurface.css';
import type {
  CellHandle, ColumnDragMemory, ColumnDragMemoryTarget, ColumnDragTarget,
  ColumnId, DragState, DynamicsRouteControl, MatrixRow, PendingCellTouchState,
  RouteControl, RoutingColumn, RoutingMatrixProps, RoutingSliderRuntime, SliderColumnId,
} from './routingMatrixTypes';
export type { RoutingMatrixProps } from './routingMatrixTypes';

const ROUTING_MATRIX_ACTIVE_FILTER_STORAGE_KEY = 'routing-matrix:show-active-only:v1';

const ROUTING_MATRIX_OVERVIEW_HELP_KEY = 'routingMatrixOverview';

const COLUMNS: RoutingColumn[] = [
  { id: 'level', label: 'Level', helpKey: 'routingMatrixLevelColumn', note: 'Drag the header left or right to trim every level in this column together.' },
  { id: 'delayA', label: 'Delay A', helpKey: 'routingMatrixDelayAColumn', note: 'Drag the header left or right to trim every Delay A send in this column together.' },
  { id: 'delayB', label: 'Delay B', helpKey: 'routingMatrixDelayBColumn', note: 'Drag the header left or right to trim every Delay B send in this column together.' },
  { id: 'granular', label: 'Granular', helpKey: 'routingMatrixGranularColumn', note: 'Drag the header left or right to trim every granular feed in this column together.' },
  { id: 'degrade', label: 'Degrade', helpKey: 'routingMatrixDegradeColumn', note: 'Drag the header left or right to trim every Degrade send in this column together.' },
  { id: 'freeze', label: 'Freeze', helpKey: 'routingMatrixFreezeColumn', note: 'Drag the header left or right to trim every Spectral Freeze send in this column together.' },
  { id: 'reverb', label: 'Reverb', helpKey: 'routingMatrixReverbColumn', note: 'Drag the header left or right to trim every reverb send in this column together.' },
  { id: 'dynamics', label: 'Dynamics', helpKey: 'routingMatrixTextureColumn', note: 'Click a cell to choose the exclusive Dynamics path: Skip, EQ 1, EQ 2, or Sidechain.' },
];
const DEFAULT_COLUMN = COLUMNS[0]!;
const PROCESSOR_ROW_IDS = new Set(['granular', 'delayAOut', 'delayBOut', 'degrade', 'reverb']);

const FX_ROW_DEFS: ReadonlyArray<{
  node: FxRoutingNodeId;
  id: string;
  accent: string;
  levelKey: keyof SliderState;
}> = [
  ...FX_ROUTING_NODE_IDS.map((node) => ({
    node,
    id: FX_ROUTING_NODE_ROW_IDS[node],
    accent: FX_ROUTING_NODE_ACCENTS[node],
    levelKey: FX_ROUTING_NODE_LEVEL_KEYS[node],
  })),
];

const fxEdgeId = (edge: Pick<FxRoutingConnection, 'from' | 'to'>): string => `${edge.from}>${edge.to}`;

const DYNAMICS_DESTINATIONS = [
  { value: 0, label: 'Skip', className: 'skip' },
  { value: 1, label: 'EQ 1', className: 'eq1' },
  { value: 2, label: 'EQ 2', className: 'eq2' },
  { value: 3, label: 'Sidechain', className: 'sidechain' },
] as const;

const DYNAMICS_ROUTE_BY_ROW: Record<string, DynamicsRouteControl> = Object.fromEntries(
  ROUTING_SOURCE_REGISTRY
    .filter((row) => row.dynamicsBusKey)
    .map((row) => [
      row.id,
      {
        key: row.dynamicsBusKey!,
        label: `${row.label} → Dynamics`,
      },
    ]),
) as Record<string, DynamicsRouteControl>;

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
      freeze: { kind: 'editable', route: { key: 'spectralFreezePad1Send', label: 'Pad 1 → Freeze' } },
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
      freeze: { kind: 'editable', route: { key: 'spectralFreezePad2Send', label: 'Pad 2 → Freeze' } },
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
      freeze: { kind: 'editable', route: { key: 'spectralFreezeLead1Send', label: 'Lead 1 → Freeze' } },
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
      freeze: { kind: 'editable', route: { key: 'spectralFreezeLead2Send', label: 'Lead 2 → Freeze' } },
      reverb: { kind: 'editable', route: { key: 'lead2ReverbSend', label: 'Lead 2 → Reverb' } },
    },
  },
  {
    id: 'sample1',
    label: 'Sample 1',
    accent: '#E8DCC4',
    cells: {
      level: { kind: 'editable', route: { key: 'sample1Level', label: 'Sample 1 Level' } },
      delayA: { kind: 'editable', route: { key: 'sample1DelayASend', label: 'Sample 1 -> Delay A' } },
      delayB: { kind: 'editable', route: { key: 'sample1DelayBSend', label: 'Sample 1 -> Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularSample1Send', label: 'Sample 1 -> Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeSample1Send', label: 'Sample 1 -> Degrade' } },
      freeze: { kind: 'editable', route: { key: 'spectralFreezeSample1Send', label: 'Sample 1 -> Freeze' } },
      reverb: { kind: 'editable', route: { key: 'sample1ReverbSend', label: 'Sample 1 -> Reverb' } },
    },
  },
  {
    id: 'sample2',
    label: 'Sample 2',
    accent: '#8EB6D8',
    cells: {
      level: { kind: 'editable', route: { key: 'sample2Level', label: 'Sample 2 Level' } },
      delayA: { kind: 'editable', route: { key: 'sample2DelayASend', label: 'Sample 2 -> Delay A' } },
      delayB: { kind: 'editable', route: { key: 'sample2DelayBSend', label: 'Sample 2 -> Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularSample2Send', label: 'Sample 2 -> Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeSample2Send', label: 'Sample 2 -> Degrade' } },
      freeze: { kind: 'editable', route: { key: 'spectralFreezeSample2Send', label: 'Sample 2 -> Freeze' } },
      reverb: { kind: 'editable', route: { key: 'sample2ReverbSend', label: 'Sample 2 -> Reverb' } },
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
      freeze: { kind: 'editable', route: { key: 'spectralFreezeDrumSend', label: 'Drums → Freeze' } },
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
      freeze: { kind: 'blocked', note: 'Granular does not currently feed Freeze.' },
      reverb: { kind: 'editable', route: { key: 'granularReverbSend', label: 'Granular → Reverb' } },
    },
  },
  {
    id: 'water',
    label: 'Water',
    accent: '#6F9AB1',
    earthFamily: 'water',
    cells: {
      level: { kind: 'editable', route: { key: 'waterLevel', label: 'Water Level' } },
      delayA: { kind: 'editable', route: { key: 'waterDelayASend', label: 'Water → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'waterDelayBSend', label: 'Water → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularWaterSend', label: 'Water → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeWaterSend', label: 'Water → Degrade' } },
      freeze: { kind: 'editable', route: { key: 'spectralFreezeWaterSend', label: 'Water → Freeze' } },
      reverb: { kind: 'editable', route: { key: 'waterReverbSend', label: 'Water → Reverb' } },
    },
  },
  {
    id: 'insects',
    label: 'Insects',
    accent: '#7B9A6D',
    earthFamily: 'insects',
    note: 'The current Earth engine exposes one shared insects dry master plus combined wet sends for both insect layers, so this row controls the family-level routing.',
    cells: {
      level: { kind: 'editable', route: { key: 'insectsSharedLevel', label: 'Insects Level' } },
      delayA: { kind: 'editable', route: { key: 'insDelayASend', label: 'Insects → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'insDelayBSend', label: 'Insects → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularInsectsSend', label: 'Insects → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeInsectsSend', label: 'Insects → Degrade' } },
      freeze: { kind: 'editable', route: { key: 'spectralFreezeInsectsSend', label: 'Insects → Freeze' } },
      reverb: { kind: 'editable', route: { key: 'insectsReverbSend', label: 'Insects → Reverb' } },
    },
  },
  {
    id: 'nature',
    label: 'Nature',
    accent: '#A6B98A',
    earthFamily: 'nature',
    note: 'Nature has a shared dry master plus one wet bus for the selected Nature samples. Individual source levels and texture shaping still live in the Active Earth Matrix.',
    cells: {
      level: { kind: 'editable', route: { key: 'natureLevel', label: 'Nature Level' } },
      delayA: { kind: 'editable', route: { key: 'natureDelayASend', label: 'Nature → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'natureDelayBSend', label: 'Nature → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularNatureSend', label: 'Nature → Granular' } },
      degrade: { kind: 'editable', route: { key: 'degradeNatureSend', label: 'Nature → Degrade' } },
      freeze: { kind: 'editable', route: { key: 'spectralFreezeNatureSend', label: 'Nature → Freeze' } },
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
      freeze: { kind: 'blocked', note: 'Delay A does not currently feed Freeze.' },
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
      freeze: { kind: 'blocked', note: 'Delay B does not currently feed Freeze.' },
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
      freeze: { kind: 'blocked', note: 'Degrade does not currently feed Freeze.' },
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
      freeze: { kind: 'blocked', note: 'Reverb-to-Freeze is controlled by Freeze routing mode.' },
      reverb: { kind: 'self' },
    },
  },
];

function fxMatrixRow(def: (typeof FX_ROW_DEFS)[number]): MatrixRow {
  const cell = (to: FxRoutingNodeId): MatrixRow['cells'][SliderColumnId] => (
    def.node === to ? { kind: 'self' } : { kind: 'fx', fxRoute: [def.node, to] }
  );
  return {
    id: def.id,
    label: FX_ROUTING_NODE_LABELS[def.node],
    accent: def.accent,
    fxNodeId: def.node,
    cells: {
      level: { kind: 'editable', route: { key: def.levelKey, label: `${FX_ROUTING_NODE_LABELS[def.node]} Level` } },
      delayA: cell('delayA'),
      delayB: cell('delayB'),
      granular: cell('granular'),
      degrade: cell('degrade'),
      freeze: cell('freeze'),
      reverb: cell('reverb'),
    },
  };
}

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
  if (row.childToggleId) return true;
  return getRoutingSourceDef(row.id)?.isEnabled(state) ?? true;
}

const blockedChildCells = (levelKey: keyof SliderState, label: string): MatrixRow['cells'] => ({
  level: { kind: 'editable', route: { key: levelKey, label: `${label} Level` } },
  delayA: { kind: 'blocked', note: 'Uses the parent family send.' },
  delayB: { kind: 'blocked', note: 'Uses the parent family send.' },
  granular: { kind: 'blocked', note: 'Uses the parent family send.' },
  degrade: { kind: 'blocked', note: 'Uses the parent family send.' },
  freeze: { kind: 'blocked', note: 'Uses the parent family send.' },
  reverb: { kind: 'blocked', note: 'Uses the parent family send.' },
});

function activeEarthChildRows(family: NonNullable<MatrixRow['earthFamily']>, state: SliderState): MatrixRow[] {
  if (family === 'nature') return NATURE_SLOT_KEYS.flatMap((keys) => {
    if (!state[keys.enabledKey]) return [];
    const sampleLabel = natureSampleLabel(state[keys.sampleIdKey], keys.slot);
    return [{
      id: `nature-child-${keys.slot}`,
      childToggleId: `nature${keys.slot}`,
      label: sampleLabel,
      accent: '#A6B98A',
      cells: blockedChildCells(keys.levelKey, sampleLabel),
    }];
  });
  if (family === 'insects') return ([
    ['insects1', 'insectsEnabled', 'insectsLevel', state.insectsEngine, 'Insect 1'],
    ['insects2', 'insects2Enabled', 'insects2Level', state.insects2Engine, 'Insect 2'],
  ] as const).flatMap(([id, enabledKey, levelKey, engineIndex, fallbackLabel]) => {
    if (!state[enabledKey]) return [];
    const label = INSECT_ENGINES[engineIndex] ?? fallbackLabel;
    return [{
      id: `insects-child-${id}`,
      childToggleId: id,
      label,
      accent: '#7B9A6D',
      cells: blockedChildCells(levelKey, label),
    }];
  });
  return ([
    ['waterHardDrops', 'Hard Drops', 'waterLayerHardDrops'],
    ['waterDrops', 'Water Drops', 'waterLayerWaterDrops'],
    ['waterBubbling', 'Bubbling', 'waterLayerBubbling'],
    ['waterChannels', 'Channels', 'waterLayerChannels'],
    ['waterTurbulence', 'Turbulence', 'waterLayerTurbulence'],
    ['waterSurf', 'Surf', 'waterLayerSurf'],
  ] as const).flatMap(([id, label, levelKey]) => state[WATER_LAYER_ENABLED_BY_LEVEL[levelKey]] ? [{
    id: `water-child-${id}`,
    childToggleId: id,
    label,
    accent: '#6F9AB1',
    cells: blockedChildCells(levelKey, label),
  }] : []);
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

function rangeDisplay(range?: DualSliderRange): string {
  if (!range) return '0%';
  return `${Math.round(range.min * 100)}–${Math.round(range.max * 100)}`;
}

function singleDisplay(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type RoutingMatrixCellIndicatorLayerProps = {
  routeKey: string;
  mode: SliderMode;
  runtimeStoreMode?: SliderMode;
  value: number;
  range?: DualSliderRange;
  fallbackWalkPosition?: number;
  fallbackFlashing?: boolean;
};

type FxCellDragState = {
  id: string;
  pointerId: number;
  handle: CellHandle;
  startAmount: number;
  startRange?: DualSliderRange;
  startPointerNorm: number;
  lastAmount?: number;
  lastRange?: DualSliderRange;
};

const RoutingMatrixCellIndicatorLayer = React.memo(function RoutingMatrixCellIndicatorLayer({
  routeKey,
  mode,
  runtimeStoreMode,
  value,
  range,
  fallbackWalkPosition,
  fallbackFlashing = false,
}: RoutingMatrixCellIndicatorLayerProps) {
  const runtimeIndicator = useRuntimeSliderIndicator(
    String(routeKey),
    runtimeStoreMode ?? mode,
    fallbackWalkPosition,
    fallbackFlashing,
  );
  const indicatorNorm = clamp01(resolveEffectiveSliderValue({
    authoredValue: value,
    mode,
    range: range ? [range.min, range.max] : undefined,
    runtimePosition: runtimeIndicator.walkPosition ?? fallbackWalkPosition,
  }));

  return (
    <>
      {mode === 'single' && (
        <span
          className="routing-matrix-cell-indicator single"
          style={{ left: trackLeftCalc(value) }}
        />
      )}
      {(mode === 'walk' || mode === 'shape') && range && (
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
  fxRoutingGraph,
  onFxRoutingGraphChange,
}: RoutingMatrixProps) {
  const { announceHelp, announceSlider } = useSliderHelp();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [activeMobileColumn, setActiveMobileColumn] = React.useState<ColumnId>('level');
  const [expandedEarthFamilies, setExpandedEarthFamilies] = React.useState<Set<string>>(() => new Set());
  const [showActiveOnly, setShowActiveOnly] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(ROUTING_MATRIX_ACTIVE_FILTER_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dragStateRef = React.useRef<DragState | null>(null);
  const fxDragStateRef = React.useRef<FxCellDragState | null>(null);
  const fxRoutingGraphRef = React.useRef(fxRoutingGraph);
  fxRoutingGraphRef.current = fxRoutingGraph;
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

  const effectiveRows = React.useMemo(() => {
    const sourceRows = ROWS.filter((row) => !PROCESSOR_ROW_IDS.has(row.id)).flatMap(row => {
    const source = getRoutingSourceDef(row.id);
    const registryRow = source
      ? {
          ...row,
          label: source.label,
          accent: source.accent,
          note: source.note ?? row.note,
          sourceToggle: source.toggleMode === 'disable-only-family' ? 'disable-only' as const : undefined,
        }
      : row;
    return registryRow.earthFamily && expandedEarthFamilies.has(registryRow.earthFamily)
      ? [registryRow, ...activeEarthChildRows(registryRow.earthFamily, state)]
      : [registryRow];
    });
    const processorRows = FX_ROW_DEFS
      .filter(({ node }) => isFxRoutingNodeActive(state, node))
      .map(fxMatrixRow);
    return [...sourceRows, ...processorRows];
  }, [expandedEarthFamilies, state]);
  const visibleRows = React.useMemo(
    () => (showActiveOnly ? effectiveRows.filter((row) => rowIsEnabled(row, state)) : effectiveRows),
    [effectiveRows, showActiveOnly, state],
  );
  const updateFxEdge = React.useCallback((id: string, patch: Partial<FxRoutingConnection>) => {
    const graph = fxRoutingGraphRef.current;
    const next = {
      ...graph,
      edges: graph.edges.map((edge) => fxEdgeId(edge) === id ? { ...edge, ...patch } : edge),
    };
    fxRoutingGraphRef.current = next;
    onFxRoutingGraphChange(next);
  }, [onFxRoutingGraphChange]);

  const enableFxEdge = React.useCallback((from: FxRoutingNodeId, to: FxRoutingNodeId, amount: number) => {
    const graph = fxRoutingGraphRef.current;
    const edges = setFxRoutePresence(graph.edges, from, to, true);
    if (!edges) return null;
    const connection: FxRoutingConnection = { from, to, amount };
    const next = {
      ...graph,
      edges: edges.map((edge) => edge.from === from && edge.to === to
        ? connection
        : edge as FxRoutingConnection),
    };
    fxRoutingGraphRef.current = next;
    onFxRoutingGraphChange(next);
    return connection;
  }, [onFxRoutingGraphChange]);

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
    fxDragStateRef.current = null;
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

  const cancelDrag = React.useCallback((dragId: string, pointerId: number) => {
    const drag = dragStateRef.current;
    if (!drag || drag.dragId !== dragId || drag.pointerId !== pointerId) return false;
    if (drag.kind === 'cell') {
      if (drag.mode === 'single' || !drag.startRange) {
        onParamChange(drag.key, drag.startValue);
      } else {
        drag.onDualRangeChange(drag.key, drag.startRange.min, drag.startRange.max);
      }
    } else {
      for (const target of drag.targets) {
        if (target.mode === 'single' || !target.startRange) {
          (onColumnParamChange ?? onParamChange)(target.key, target.startValue);
        } else {
          target.onDualRangeChange(target.key, target.startRange.min, target.startRange.max);
        }
      }
    }
    dragStateRef.current = null;
    setDraggingId(null);
    return true;
  }, [onColumnParamChange, onParamChange]);

  const resetInteraction = React.useCallback(() => {
    clearLongPress();
    pendingCellTouchRef.current = null;
    dragStateRef.current = null;
    fxDragStateRef.current = null;
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
      const shifted = shiftRangePreservingWidth(
        drag.startRange,
        pointerNorm - drag.startPointerNorm,
      );
      const nextMin = quantize01(shifted.min);
      nextRange = {
        min: nextMin,
        max: quantize01(nextMin + (drag.startRange.max - drag.startRange.min)),
      };
    }

    if (rangesEqual(drag.lastRange, nextRange)) return;
    drag.lastRange = nextRange;
    drag.onDualRangeChange(drag.key, nextRange.min, nextRange.max);
  }, [onParamChange]);
  const columnDragEmitter = useRafCoalescedEmitter(({ clientX, width }: { clientX: number; width: number }) => {
    applyColumnDrag(clientX, width);
  });
  const cellDragEmitter = useRafCoalescedEmitter(applyCellDrag);

  const applyFxCellDrag = React.useCallback((pointerNorm: number) => {
    const drag = fxDragStateRef.current;
    if (!drag) return;
    if (!drag.startRange || drag.handle === 'single') {
      const amount = quantize01(pointerNorm);
      if (drag.lastAmount === amount) return;
      drag.lastAmount = amount;
      updateFxEdge(drag.id, { amount });
      return;
    }

    let range: DualSliderRange;
    if (drag.handle === 'min') {
      range = { min: quantize01(Math.min(pointerNorm, drag.startRange.max)), max: drag.startRange.max };
    } else if (drag.handle === 'max') {
      range = { min: drag.startRange.min, max: quantize01(Math.max(pointerNorm, drag.startRange.min)) };
    } else {
      const shifted = shiftRangePreservingWidth(drag.startRange, pointerNorm - drag.startPointerNorm);
      const min = quantize01(shifted.min);
      range = { min, max: quantize01(min + (drag.startRange.max - drag.startRange.min)) };
    }
    if (rangesEqual(drag.lastRange, range)) return;
    drag.lastRange = range;
    updateFxEdge(drag.id, range);
  }, [updateFxEdge]);
  const fxCellDragEmitter = useRafCoalescedEmitter(applyFxCellDrag);

  const stopFxCellDrag = React.useCallback((id: string, pointerId: number) => {
    const drag = fxDragStateRef.current;
    if (!drag || drag.id !== id || drag.pointerId !== pointerId) return;
    fxDragStateRef.current = null;
    setDraggingId(null);
  }, []);

  const cancelFxCellDrag = React.useCallback((id: string, pointerId: number) => {
    const drag = fxDragStateRef.current;
    if (!drag || drag.id !== id || drag.pointerId !== pointerId) return;
    updateFxEdge(id, drag.startRange
      ? { min: drag.startRange.min, max: drag.startRange.max }
      : { amount: drag.startAmount });
    fxDragStateRef.current = null;
    setDraggingId(null);
  }, [updateFxEdge]);

  const renderRowLabel = React.useCallback((row: MatrixRow, rowEnabled: boolean, suffix = '') => {
    const disableOnly = row.sourceToggle === 'disable-only';
    const canToggle = !!onToggleSource && (!disableOnly || rowEnabled);
    const offInAll = !showActiveOnly && !rowEnabled;
    const note = row.note ?? row.label;
    const title = disableOnly && !rowEnabled && !showActiveOnly
      ? `${note} Choose child sources in the Active Earth Matrix to enable this family.`
      : canToggle
        ? `${note} Click or tap to ${disableOnly ? 'disable this family' : 'toggle this source'}.`
        : note;

    if (row.earthFamily) {
      const expanded = expandedEarthFamilies.has(row.earthFamily);
      return (
        <div
          key={`row:${row.id}${suffix}`}
          className={`routing-matrix-rowlabel routing-matrix-earth-parent${offInAll ? ' source-off' : ''}`}
          style={{ '--row-accent': offInAll ? '#7e8794' : row.accent } as React.CSSProperties}
        >
          <span className={`routing-matrix-earth-triangle${expanded ? ' is-expanded' : ''}`} aria-hidden="true" />
          <span>{row.label}</span>
          <button
            type="button"
            className="routing-matrix-earth-disclosure"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.label}`}
            onClick={() => setExpandedEarthFamilies((current) => {
              const next = new Set(current);
              if (next.has(row.earthFamily!)) next.delete(row.earthFamily!); else next.add(row.earthFamily!);
              return next;
            })}
          />
          <button
            type="button"
            className="routing-matrix-earth-toggle"
            aria-pressed={rowEnabled}
            aria-label={`${rowEnabled ? 'Disable' : 'Enable'} ${row.label}`}
            onClick={canToggle ? () => onToggleSource(row.id, !rowEnabled) : undefined}
          />
        </div>
      );
    }
    const childToggle = row.childToggleId && onToggleSource;
    return (
      <button
        key={`row:${row.id}${suffix}`}
        type="button"
        className={`routing-matrix-rowlabel routing-matrix-rowlabel-button${canToggle || childToggle ? ' is-toggleable' : ''}${row.childToggleId ? ' earth-child' : ''}${offInAll ? ' source-off' : ''}`}
        style={{ '--row-accent': offInAll ? '#7e8794' : row.accent } as React.CSSProperties}
        title={title}
        aria-pressed={canToggle ? rowEnabled : undefined}
        aria-disabled={!canToggle}
        tabIndex={canToggle ? 0 : -1}
        onClick={childToggle ? () => onToggleSource(row.childToggleId!, false) : canToggle ? () => onToggleSource(row.id, !rowEnabled) : undefined}
      >
        <span className={`routing-matrix-rowdot${offInAll ? ' is-off' : ''}`} style={{ backgroundColor: offInAll ? undefined : row.accent }} />
        <span>{row.label}</span>
      </button>
    );
  }, [expandedEarthFamilies, onToggleSource, showActiveOnly]);

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
          columnDragEmitter.schedule({
            clientX: event.clientX,
            width: event.currentTarget.getBoundingClientRect().width,
          });
        }}
        onPointerUp={(event) => {
          columnDragEmitter.flush();
          stopDrag(headerId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
        onPointerCancel={(event) => {
          columnDragEmitter.cancel();
          cancelDrag(headerId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
      >
        <span className="routing-matrix-header-label">{column.label}</span>
      </button>
    );
  }, [announceHelp, applyColumnDrag, cancelDrag, clearLongPress, draggingId, helpPage, resetInteraction, sliderProps, startColumnDrag, state, stopDrag, visibleRows]);

  const renderDynamicsCell = React.useCallback((row: MatrixRow, rowEnabled: boolean, suffix = '') => {
    if (row.fxNodeId) {
      const destinations = ['eq1', 'eq2', 'sidechain'] as const;
      const current = fxRoutingGraph.edges.find((edge) => edge.from === row.fxNodeId && destinations.includes(edge.to as typeof destinations[number]));
      const value = current ? destinations.indexOf(current.to as typeof destinations[number]) + 1 : 0;
      const option = DYNAMICS_DESTINATIONS[value] ?? DYNAMICS_DESTINATIONS[0]!;
      const baseEdges = fxRoutingGraph.edges.filter((edge) => edge.from !== row.fxNodeId || !destinations.includes(edge.to as typeof destinations[number]));
      const candidates = [1, 2, 3, 0].map((offset) => (value + offset) % 4);
      const nextValue = candidates.find((candidate) => {
        if (candidate === 0) return true;
        const to = destinations[candidate - 1]!;
        return to !== row.fxNodeId && canEnableFxRoute(baseEdges, row.fxNodeId!, to);
      }) ?? 0;
      const nextOption = DYNAMICS_DESTINATIONS[nextValue] ?? DYNAMICS_DESTINATIONS[0]!;
      const title = `${row.label} → Dynamics: ${option.label}. Click to change to ${nextOption.label}.`;
      return (
        <button
          key={`cell:${row.id}:dynamics${suffix}`}
          type="button"
          className={`routing-matrix-cell dynamics-route ${value > 0 ? 'active' : 'skip'} ${option.className}`}
          style={{ '--row-accent': row.accent } as React.CSSProperties}
          title={title}
          aria-label={title}
          onClick={() => {
            if (nextValue === 0) {
              onFxRoutingGraphChange({ ...fxRoutingGraph, edges: baseEdges });
              return;
            }
            const to = destinations[nextValue - 1]!;
            const next = setFxRoutePresence(baseEdges, row.fxNodeId!, to, true);
            if (!next) return;
            onFxRoutingGraphChange({
              ...fxRoutingGraph,
              edges: next.map((edge) => edge.from === row.fxNodeId && edge.to === to
                ? { ...edge, amount: 0.5 }
                : edge as FxRoutingConnection),
            });
          }}
        >
          <span className="routing-matrix-dynamics-rail" aria-hidden="true">
            {DYNAMICS_DESTINATIONS.map((destination) => (
              <span key={destination.value} className={`routing-matrix-dynamics-dot ${destination.className}${destination.value === value ? ' active' : ''}`} />
            ))}
          </span>
          <span className="routing-matrix-dynamics-label">{option.label}</span>
        </button>
      );
    }
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
        onMouseEnter={() => announceHelp('routingMatrixTextureColumn', { page: helpPage, label: 'Dynamics Column' })}
        onFocus={() => announceHelp('routingMatrixTextureColumn', { page: helpPage, label: 'Dynamics Column' })}
        onClick={() => {
          announceHelp('routingMatrixTextureColumn', { page: helpPage, label: 'Dynamics Column' });
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
  }, [announceHelp, fxRoutingGraph, helpPage, onFxRoutingGraphChange, onParamChange, showActiveOnly, state]);

  const renderFxRouteCell = React.useCallback((row: MatrixRow, route: readonly [FxRoutingNodeId, FxRoutingNodeId], suffix = '') => {
    const [from, to] = route;
    const edge = fxRoutingGraph.edges.find((candidate) => candidate.from === from && candidate.to === to);
    const locked = !edge && !canEnableFxRoute(fxRoutingGraph.edges, from, to);
    const amount = clamp01(edge?.amount ?? 0);
    const mode: SliderMode = edge?.mode === 'range' ? 'shape' : edge?.mode ?? 'single';
    const range = mode === 'single' ? undefined : {
      min: clamp01(edge?.min ?? amount),
      max: clamp01(edge?.max ?? amount),
    };
    const id = `${from}>${to}`;
    const activeHandle = draggingId === id ? fxDragStateRef.current?.handle ?? null : null;
    const title = locked
      ? `${FX_ROUTING_NODE_LABELS[from]} → ${FX_ROUTING_NODE_LABELS[to]} is locked by the current chain.`
      : `${FX_ROUTING_NODE_LABELS[from]} → ${FX_ROUTING_NODE_LABELS[to]}. Drag to adjust; edit routing modes in Nodes view.`;
    const handleKeyboard = (handle: 'single' | 'min' | 'max', event: React.KeyboardEvent<HTMLElement>) => {
      if (locked) return;
      if (!edge) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        enableFxEdge(from, to, 0.5);
        return;
      }
      const increment = event.shiftKey ? 0.1 : 0.01;
      const current = handle === 'single' ? amount : (range?.[handle] ?? amount);
      let next: number | null = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - increment;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + increment;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      const normalized = quantize01(next);
      if (handle === 'single' || !range) updateFxEdge(id, { amount: normalized });
      else if (handle === 'min') updateFxEdge(id, { min: Math.min(normalized, range.max) });
      else updateFxEdge(id, { max: Math.max(normalized, range.min) });
    };
    return (
      <div
        key={`cell:${row.id}:${to}${suffix}`}
        className={`routing-matrix-cell fx-route${edge ? ' connected' : ''}${edge?.muted ? ' muted' : ''}${locked ? ' locked' : ''}${draggingId === id ? ' dragging' : ''}`}
        style={{ '--row-accent': row.accent } as React.CSSProperties}
        title={title}
        aria-label={title}
        aria-disabled={locked}
        role={edge ? (range ? undefined : 'slider') : 'button'}
        tabIndex={locked || range ? -1 : 0}
        aria-valuemin={edge && !range ? 0 : undefined}
        aria-valuemax={edge && !range ? 1 : undefined}
        aria-valuenow={edge && !range ? amount : undefined}
        onKeyDown={(event) => handleKeyboard('single', event)}
        onPointerDown={(event) => {
          if (locked) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const pointerNorm = pointerToTrackNorm(event.clientX, rect);
          const activeEdge = edge ?? enableFxEdge(from, to, quantize01(pointerNorm));
          if (!activeEdge) return;
          const activeAmount = clamp01(activeEdge.amount);
          const activeRange = (activeEdge.mode ?? 'single') === 'single' ? undefined : {
            min: clamp01(activeEdge.min ?? activeAmount),
            max: clamp01(activeEdge.max ?? activeAmount),
          };
          const handle = activeRange ? getDualHandle(pointerNorm, activeRange, rect) : 'single';
          fxDragStateRef.current = {
            id,
            pointerId: event.pointerId,
            handle,
            startAmount: activeAmount,
            startRange: activeRange,
            startPointerNorm: pointerNorm,
            lastAmount: activeRange ? undefined : activeAmount,
            lastRange: activeRange,
          };
          setDraggingId(id);
          fxCellDragEmitter.flush(pointerNorm);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = fxDragStateRef.current;
          if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) return;
          if (event.pointerType === 'touch') event.preventDefault();
          fxCellDragEmitter.schedule(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
        }}
        onPointerUp={(event) => {
          fxCellDragEmitter.flush();
          stopFxCellDrag(id, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
        }}
        onPointerCancel={(event) => {
          fxCellDragEmitter.cancel();
          cancelFxCellDrag(id, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
        }}
      >
        <span className="routing-matrix-cell-track" />
        <span className={`routing-matrix-cell-fill${mode === 'walk' ? ' walk' : ''}${mode === 'sampleHold' ? ' sample-hold' : ''}`}
          style={{
            left: range ? trackLeftCalc(range.min) : `${TRACK_PAD_PX}px`,
            width: range ? trackWidthCalc(range.max - range.min) : trackWidthCalc(amount),
            opacity: 0.15 + (range ? range.max : amount) * 0.85,
          }} />
        {edge && !range && <span className="routing-matrix-cell-indicator single" style={{ left: trackLeftCalc(amount) }} />}
        {range && (
          <>
            <span
              className={`routing-matrix-cell-edge min${activeHandle === 'min' || activeHandle === 'both' ? ' active' : ''}`}
              style={{ left: trackLeftCalc(range.min) }}
              role="slider"
              tabIndex={0}
              aria-label={`${title} minimum`}
              aria-valuemin={0}
              aria-valuemax={range.max}
              aria-valuenow={range.min}
              onKeyDown={(event) => handleKeyboard('min', event)}
            />
            <span
              className={`routing-matrix-cell-edge max${activeHandle === 'max' || activeHandle === 'both' ? ' active' : ''}`}
              style={{ left: trackLeftCalc(range.max) }}
              role="slider"
              tabIndex={0}
              aria-label={`${title} maximum`}
              aria-valuemin={range.min}
              aria-valuemax={1}
              aria-valuenow={range.max}
              onKeyDown={(event) => handleKeyboard('max', event)}
            />
          </>
        )}
        {edge && range && <RoutingMatrixCellIndicatorLayer
          routeKey={fxRouteRuntimeKey(from, to)} runtimeStoreMode="walk" mode={mode} value={amount} range={range} />}
        <span className="routing-matrix-cell-readout">
          {edge ? (
            mode === 'single'
              ? <span className="routing-matrix-cell-value">{edge.muted ? 'Muted' : singleDisplay(amount)}</span>
              : <>
                  <span className="routing-matrix-cell-mode"><ModulationModeIcon mode={mode} /></span>
                  <span className="routing-matrix-cell-range">{rangeDisplay(range)}</span>
                </>
          ) : <span className="routing-matrix-cell-value">0%</span>}
        </span>
      </div>
    );
  }, [cancelFxCellDrag, draggingId, enableFxEdge, fxCellDragEmitter, fxRoutingGraph.edges, stopFxCellDrag, updateFxEdge]);

  const renderCell = React.useCallback((row: MatrixRow, rowEnabled: boolean, column: RoutingColumn, suffix = '') => {
    if (!isSliderColumnId(column.id)) {
      return renderDynamicsCell(row, rowEnabled, suffix);
    }

    const cell = row.cells[column.id];
    if (cell.kind === 'fx' && cell.fxRoute) return renderFxRouteCell(row, cell.fxRoute, suffix);
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
      ? (mode === 'single' ? singleDisplay(value) : rangeDisplay(range))
      : (cell.kind === 'self' ? 'Self' : '');
    const isWalk = mode === 'walk' && !!range;
    const isSampleHold = mode === 'sampleHold' && !!range;
    const activeHandle = draggingId === cellId
      && dragStateRef.current?.kind === 'cell'
      && dragStateRef.current.dragId === cellId
      ? dragStateRef.current.handle
      : null;
    const handleKeyboard = (
      handle: 'single' | 'min' | 'max',
      event: React.KeyboardEvent<HTMLElement>,
    ) => {
      if (!route || !runtime) return;
      const increment = event.shiftKey ? 0.1 : 0.01;
      const currentValue = handle === 'single' ? value : (range?.[handle] ?? value);
      let next: number | null = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = currentValue - increment;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = currentValue + increment;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      const normalized = quantize01(next);
      if (handle === 'single' || !range) {
        onParamChange(route.key, normalized);
      } else if (handle === 'min') {
        runtime.onDualRangeChange?.(route.key, Math.min(normalized, range.max), range.max);
      } else {
        runtime.onDualRangeChange?.(route.key, range.min, Math.max(normalized, range.min));
      }
    };

    return (
      <div
        key={cellId}
        className={`routing-matrix-cell ${cell.kind}${column.id === 'level' ? ' level-col' : ''}${draggingId === cellId ? ' dragging' : ''}${offInAll ? ' source-off' : ''}${runtime?.modulationConfig ? ` mod-${runtime.modulationConfig.source}` : ''}`}
        style={{ '--row-accent': offInAll ? '#7e8794' : runtime?.modulationConfig?.source === 'b' ? '#e58a2b' : runtime?.modulationConfig?.source === 'a' ? '#4d9aba' : row.accent } as React.CSSProperties}
        title={runtime?.modulationConfig ? `Mod ${runtime.modulationConfig.source.toUpperCase()}: ${route?.label ?? row.label}` : cell.note ?? row.note}
        aria-disabled={cell.kind !== 'editable' || !route}
        role={cell.kind === 'editable' && route && mode === 'single' ? 'slider' : undefined}
        tabIndex={cell.kind === 'editable' && route && mode === 'single' ? 0 : -1}
        aria-label={cell.kind === 'editable' && route && mode === 'single' ? route.label : undefined}
        aria-valuemin={cell.kind === 'editable' && route && mode === 'single' ? 0 : undefined}
        aria-valuemax={cell.kind === 'editable' && route && mode === 'single' ? 1 : undefined}
        aria-valuenow={cell.kind === 'editable' && route && mode === 'single' ? value : undefined}
        onKeyDown={(event) => handleKeyboard('single', event)}
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
          cellDragEmitter.flush(pointerNorm);
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
            cellDragEmitter.schedule(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
            return;
          }

          maybeCancelLongPress(event.pointerId, event.clientX, event.clientY);
          if (longPressConsumedRef.current) return;

          const drag = dragStateRef.current;
          if (!drag || drag.kind !== 'cell' || drag.dragId !== cellId || drag.pointerId !== event.pointerId) return;
          if (event.pointerType === 'touch') event.preventDefault();
          cellDragEmitter.schedule(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
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
              cellDragEmitter.flush(pendingTouch.startPointerNorm);
              stopDrag(cellId, event.pointerId);
            }
            releasePointerCaptureSafely(event.currentTarget, event.pointerId);
            resetInteraction();
            return;
          }

          cellDragEmitter.flush();
          stopDrag(cellId, event.pointerId);
          releasePointerCaptureSafely(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
        onPointerCancel={(event) => {
          cellDragEmitter.cancel();
          cancelDrag(cellId, event.pointerId);
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
                  role="slider"
                  tabIndex={0}
                  aria-label={`${route?.label ?? row.label} minimum`}
                  aria-valuemin={0}
                  aria-valuemax={range.max}
                  aria-valuenow={range.min}
                  onKeyDown={(event) => handleKeyboard('min', event)}
                />
                <span
                  className={`routing-matrix-cell-edge max${activeHandle === 'max' || activeHandle === 'both' ? ' active' : ''}`}
                  style={{ left: trackLeftCalc(range.max) }}
                  role="slider"
                  tabIndex={0}
                  aria-label={`${route?.label ?? row.label} maximum`}
                  aria-valuemin={range.min}
                  aria-valuemax={1}
                  aria-valuenow={range.max}
                  onKeyDown={(event) => handleKeyboard('max', event)}
                />
              </>
            )}
            <span className="routing-matrix-cell-readout">
              {mode === 'single' ? (
                <span className="routing-matrix-cell-value">{readout}</span>
              ) : (
                <>
                  <span className="routing-matrix-cell-mode">
                    {runtime?.modulationConfig?.source.toUpperCase()}
                    <ModulationModeIcon mode={mode} />
                  </span>
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
      </div>
    );
  }, [
    announceSlider,
    applyCellDrag,
    cancelDrag,
    clearLongPress,
    draggingId,
    helpPage,
    maybeCancelLongPress,
    onParamChange,
    resetInteraction,
    scheduleLongPress,
    showActiveOnly,
    renderDynamicsCell,
    renderFxRouteCell,
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
