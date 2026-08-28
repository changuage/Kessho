import type { DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import { getRoutingSourceDef, ROUTING_SOURCE_REGISTRY } from '../routing';
import {
  FX_ROUTING_NODE_ACCENTS,
  FX_ROUTING_NODE_IDS,
  FX_ROUTING_NODE_LEVEL_KEYS,
  FX_ROUTING_NODE_LABELS,
  FX_ROUTING_NODE_ROW_IDS,
  type FxRoutingConnection,
  type FxRoutingNodeId,
} from '../routing/fxRoutingGraph';
import { NATURE_SLOT_KEYS } from '../../audio/natureSlots';
import { natureSampleLabel } from '../../audio/natureSampleCatalog';
import { INSECT_ENGINES } from '../../audio/waterPresets';
import { WATER_LAYER_ENABLED_BY_LEVEL } from '../../audio/waterLayerActivation';
import {
  clamp01,
  normalizeUnitRange,
  quantize01,
  rangesEqual,
} from '../sliderSystem/matrixMath';
import type {
  ColumnDragMemory,
  ColumnDragMemoryTarget,
  ColumnDragTarget,
  ColumnId,
  DynamicsRouteControl,
  MatrixRow,
  RouteControl,
  RoutingColumn,
  RoutingSliderRuntime,
  SliderColumnId,
} from './routingMatrixTypes';

export const COLUMNS: RoutingColumn[] = [
  { id: 'level', label: 'Level', helpKey: 'routingMatrixLevelColumn', note: 'Drag the header left or right to trim every level in this column together.' },
  { id: 'delayA', label: 'Delay A', helpKey: 'routingMatrixDelayAColumn', note: 'Drag the header left or right to trim every Delay A send in this column together.' },
  { id: 'delayB', label: 'Delay B', helpKey: 'routingMatrixDelayBColumn', note: 'Drag the header left or right to trim every Delay B send in this column together.' },
  { id: 'granular', label: 'Granular', helpKey: 'routingMatrixGranularColumn', note: 'Drag the header left or right to trim every granular feed in this column together.' },
  { id: 'degrade', label: 'Degrade', helpKey: 'routingMatrixDegradeColumn', note: 'Drag the header left or right to trim every Degrade send in this column together.' },
  { id: 'freeze', label: 'Freeze', helpKey: 'routingMatrixFreezeColumn', note: 'Drag the header left or right to trim every Spectral Freeze send in this column together.' },
  { id: 'reverb', label: 'Reverb', helpKey: 'routingMatrixReverbColumn', note: 'Drag the header left or right to trim every reverb send in this column together.' },
  { id: 'creativeSaturation', label: 'Saturator', helpKey: 'routingMatrixSaturationColumn', note: 'FX processor rows can route directly into the creative Saturator.' },
  { id: 'dynamics', label: 'Dynamics', helpKey: 'routingMatrixTextureColumn', note: 'Click a cell to choose the exclusive Dynamics path: Skip, EQ 1, EQ 2, or Sidechain.' },
];
export const DEFAULT_COLUMN = COLUMNS[0]!;
export const PROCESSOR_ROW_IDS = new Set(['granular', 'delayAOut', 'delayBOut', 'degrade', 'reverb']);

export const FX_ROW_DEFS: ReadonlyArray<{
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

export const fxEdgeId = (edge: Pick<FxRoutingConnection, 'from' | 'to'>): string => `${edge.from}>${edge.to}`;

export const DYNAMICS_DESTINATIONS = [
  { value: 0, label: 'Skip', className: 'skip' },
  { value: 1, label: 'EQ 1', className: 'eq1' },
  { value: 2, label: 'EQ 2', className: 'eq2' },
  { value: 3, label: 'Sidechain', className: 'sidechain' },
] as const;

export const DYNAMICS_ROUTE_BY_ROW: Record<string, DynamicsRouteControl> = Object.fromEntries(
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

export const ROWS: MatrixRow[] = [
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Legacy Granular routing does not expose Saturator.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Legacy Delay A routing does not expose Saturator.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Legacy Delay B routing does not expose Saturator.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Legacy Degrade routing does not expose Saturator.' },
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
      creativeSaturation: { kind: 'blocked', note: 'Legacy Reverb routing does not expose Saturator.' },
    },
  },
];

export function fxMatrixRow(def: (typeof FX_ROW_DEFS)[number]): MatrixRow {
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
      creativeSaturation: cell('creativeSaturation'),
    },
  };
}

export function scaleRangeTowardZero(range: DualSliderRange, delta: number): DualSliderRange {
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

export function columnTargetIsSingle(target: Pick<ColumnDragTarget, 'mode' | 'startRange'> | Pick<ColumnDragMemoryTarget, 'mode' | 'startRange'>): boolean {
  return target.mode === 'single' || !target.startRange;
}

export function stripColumnDragTarget(target: ColumnDragTarget): ColumnDragMemoryTarget {
  return {
    key: target.key,
    mode: target.mode,
    startValue: target.startValue,
    startRange: target.startRange,
  };
}

export function computeColumnTargetValue(target: ColumnDragMemoryTarget, delta: number): number {
  return quantize01(target.startValue + delta);
}

export function computeColumnTargetRange(target: ColumnDragMemoryTarget, delta: number): DualSliderRange | undefined {
  if (columnTargetIsSingle(target) || !target.startRange) return undefined;
  return scaleRangeTowardZero(target.startRange, delta);
}

export function columnDragMemoryMatches(memory: ColumnDragMemory, targets: ColumnDragTarget[]): boolean {
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

export function cellValue(state: SliderState, route: RouteControl | undefined): number {
  if (!route) return 0;
  return clamp01(Number(state[route.key] ?? 0) || 0);
}

export function isSliderColumnId(columnId: ColumnId): columnId is SliderColumnId {
  return columnId !== 'dynamics';
}

export function dynamicsDestinationIndex(value: unknown): number {
  const index = Math.round(Number(value ?? 0));
  return Math.max(0, Math.min(DYNAMICS_DESTINATIONS.length - 1, Number.isFinite(index) ? index : 0));
}

export function rowIsEnabled(row: MatrixRow, state: SliderState): boolean {
  if (row.childToggleId) return true;
  return getRoutingSourceDef(row.id)?.isEnabled(state) ?? true;
}

export const blockedChildCells = (levelKey: keyof SliderState, label: string): MatrixRow['cells'] => ({
  level: { kind: 'editable', route: { key: levelKey, label: `${label} Level` } },
  delayA: { kind: 'blocked', note: 'Uses the parent family send.' },
  delayB: { kind: 'blocked', note: 'Uses the parent family send.' },
  granular: { kind: 'blocked', note: 'Uses the parent family send.' },
  degrade: { kind: 'blocked', note: 'Uses the parent family send.' },
  freeze: { kind: 'blocked', note: 'Uses the parent family send.' },
  reverb: { kind: 'blocked', note: 'Uses the parent family send.' },
  creativeSaturation: { kind: 'blocked', note: 'Direct source routing to Saturator is not supported.' },
});

export function activeEarthChildRows(family: NonNullable<MatrixRow['earthFamily']>, state: SliderState): MatrixRow[] {
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

export function getResolvedMode(runtime: RoutingSliderRuntime | null): SliderMode {
  if (!runtime) return 'single';
  return runtime.mode !== 'single' && runtime.dualRange ? runtime.mode : 'single';
}

export function getColumnTargets(
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

export function rangeDisplay(range?: DualSliderRange): string {
  if (!range) return '0%';
  return `${Math.round(range.min * 100)}–${Math.round(range.max * 100)}`;
}

export function singleDisplay(value: number): string {
  return `${Math.round(value * 100)}%`;
}
