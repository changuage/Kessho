import React from 'react';
import type { DualSliderRange } from '../DualSlider';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { SliderPageId } from '../sliderHelpCatalog';
import type { SliderMode, SliderState } from '../state';

type ColumnId = 'level' | 'delayA' | 'delayB' | 'granular' | 'reverb';
type CellHandle = 'single' | 'min' | 'max' | 'both';

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
  cells: Record<ColumnId, MatrixCell>;
}

interface RoutingSliderRuntime {
  mode: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode: (key: keyof SliderState) => void;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}

interface ColumnDragTarget {
  key: keyof SliderState;
  mode: SliderMode;
  startValue: number;
  startRange?: DualSliderRange;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
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

interface ColumnDragState {
  kind: 'column';
  dragId: string;
  pointerId: number;
  startClientX: number;
  targets: ColumnDragTarget[];
  lastValues: Partial<Record<keyof SliderState, number>>;
  lastRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
}

type DragState = CellDragState | ColumnDragState;

export interface RoutingMatrixProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  sliderProps: (paramKey: keyof SliderState) => RoutingSliderRuntime;
  helpPage?: SliderPageId;
  showNote?: boolean;
}

const TRACK_PAD_PX = 6;
const EDGE_HANDLE_PX = 8;
const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

const COLUMNS: Array<{ id: ColumnId; label: string; note?: string }> = [
  { id: 'level', label: 'Level', note: 'Drag the header left or right to trim every level in this column together.' },
  { id: 'delayA', label: 'Delay A', note: 'Drag the header left or right to trim every Delay A send in this column together.' },
  { id: 'delayB', label: 'Delay B', note: 'Drag the header left or right to trim every Delay B send in this column together.' },
  { id: 'granular', label: 'Granular', note: 'Drag the header left or right to trim every granular feed in this column together.' },
  { id: 'reverb', label: 'Reverb', note: 'Drag the header left or right to trim every reverb send in this column together.' },
];
const DEFAULT_COLUMN = COLUMNS[0]!;

const ROWS: MatrixRow[] = [
  {
    id: 'pad1',
    label: 'Pad 1',
    accent: '#d7a96d',
    note: 'Pad 1 now has its own Delay A, Delay B, Granular, and Reverb sends.',
    cells: {
      level: { kind: 'editable', route: { key: 'synthLevel', label: 'Pad 1 Level' } },
      delayA: { kind: 'editable', route: { key: 'pad1DelayASend', label: 'Pad 1 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'pad1DelayBSend', label: 'Pad 1 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularPad1Send', label: 'Pad 1 → Granular' } },
      reverb: { kind: 'editable', route: { key: 'pad1ReverbSend', label: 'Pad 1 → Reverb' } },
    },
  },
  {
    id: 'pad2',
    label: 'Pad 2',
    accent: '#c79457',
    note: 'Pad 2 now has its own Delay A, Delay B, Granular, and Reverb sends.',
    cells: {
      level: { kind: 'editable', route: { key: 'pad2Level', label: 'Pad 2 Level' } },
      delayA: { kind: 'editable', route: { key: 'pad2DelayASend', label: 'Pad 2 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'pad2DelayBSend', label: 'Pad 2 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularPad2Send', label: 'Pad 2 → Granular' } },
      reverb: { kind: 'editable', route: { key: 'pad2ReverbSend', label: 'Pad 2 → Reverb' } },
    },
  },
  {
    id: 'lead1',
    label: 'Lead 1',
    accent: '#9fc1ff',
    cells: {
      level: { kind: 'editable', route: { key: 'lead1Level', label: 'Lead 1 Level' } },
      delayA: { kind: 'editable', route: { key: 'lead1DelayASend', label: 'Lead 1 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'lead1DelayBSend', label: 'Lead 1 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularLead1Send', label: 'Lead 1 → Granular' } },
      reverb: { kind: 'editable', route: { key: 'lead1ReverbSend', label: 'Lead 1 → Reverb' } },
    },
  },
  {
    id: 'lead2',
    label: 'Lead 2',
    accent: '#7da3ff',
    cells: {
      level: { kind: 'editable', route: { key: 'lead2Level', label: 'Lead 2 Level' } },
      delayA: { kind: 'editable', route: { key: 'lead2DelayASend', label: 'Lead 2 → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'lead2DelayBSend', label: 'Lead 2 → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularLead2Send', label: 'Lead 2 → Granular' } },
      reverb: { kind: 'editable', route: { key: 'lead2ReverbSend', label: 'Lead 2 → Reverb' } },
    },
  },
  {
    id: 'drums',
    label: 'Drums',
    accent: '#f29f78',
    note: 'Drums now trim straight into the shared Delay A and Delay B buses. Delay A timing and tone live with the shared Simple Delay controls.',
    cells: {
      level: { kind: 'editable', route: { key: 'drumLevel', label: 'Drums Level' } },
      delayA: { kind: 'editable', route: { key: 'drumDelayASend', label: 'Drums → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'drumDelayBSend', label: 'Drums → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularDrumSend', label: 'Drums → Granular' } },
      reverb: { kind: 'editable', route: { key: 'drumReverbSend', label: 'Drums → Reverb' } },
    },
  },
  {
    id: 'granular',
    label: 'Granular',
    accent: '#93d7d1',
    note: 'Granular → Delay B uses the current Clocked Space frontend for bus voicing. The matrix cell trims the source-send amount.',
    cells: {
      level: { kind: 'editable', route: { key: 'granularLevel', label: 'Granular Level' } },
      delayA: { kind: 'editable', route: { key: 'granularDelayASend', label: 'Granular → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'granularDelayBSend', label: 'Granular → Delay B' } },  // overridden dynamically
      granular: { kind: 'self' },
      reverb: { kind: 'editable', route: { key: 'granularReverbSend', label: 'Granular → Reverb' } },
    },
  },
  {
    id: 'waves',
    label: 'Waves',
    accent: '#78d8f6',
    cells: {
      level: { kind: 'editable', route: { key: 'oceanSampleLevel', label: 'Waves Level' } },
      delayA: { kind: 'editable', route: { key: 'oceanDelayASend', label: 'Waves → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'oceanDelayBSend', label: 'Waves → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularWavesSend', label: 'Waves → Granular' } },
      reverb: { kind: 'editable', route: { key: 'oceanReverbSend', label: 'Waves → Reverb' } },
    },
  },
  {
    id: 'water',
    label: 'Water',
    accent: '#62b5ff',
    cells: {
      level: { kind: 'editable', route: { key: 'waterLevel', label: 'Water Level' } },
      delayA: { kind: 'editable', route: { key: 'waterDelayASend', label: 'Water → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'waterDelayBSend', label: 'Water → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularWaterSend', label: 'Water → Granular' } },
      reverb: { kind: 'editable', route: { key: 'waterReverbSend', label: 'Water → Reverb' } },
    },
  },
  {
    id: 'insects',
    label: 'Insects',
    accent: '#78d98d',
    note: 'The current Earth engine exposes one shared wet bus for both insect layers, so this row controls their combined sends.',
    cells: {
      level: { kind: 'editable', route: { key: 'insectsLevel', label: 'Insects Level' } },
      delayA: { kind: 'editable', route: { key: 'insDelayASend', label: 'Insects → Delay A' } },
      delayB: { kind: 'editable', route: { key: 'insDelayBSend', label: 'Insects → Delay B' } },
      granular: { kind: 'editable', route: { key: 'granularInsectsSend', label: 'Insects → Granular' } },
      reverb: { kind: 'editable', route: { key: 'insectsReverbSend', label: 'Insects → Reverb' } },
    },
  },
  {
    id: 'delayAOut',
    label: 'Delay A Out',
    accent: '#b9c9ff',
    cells: {
      level: { kind: 'editable', route: { key: 'delayAMix', label: 'Delay A Level' } },
      delayA: { kind: 'self' },
      delayB: { kind: 'editable', route: { key: 'delayAToBSend', label: 'Delay A → Delay B' } },
      granular: { kind: 'editable', route: { key: 'delayAGranularSend', label: 'Delay A → Granular' } },
      reverb: { kind: 'editable', route: { key: 'delayAReverbSend', label: 'Delay A → Reverb' } },
    },
  },
  {
    id: 'delayBOut',
    label: 'Delay B Out',
    accent: '#9fe5f0',
    cells: {
      level: { kind: 'self' },
      delayA: { kind: 'editable', route: { key: 'delayBToASend', label: 'Delay B → Delay A' } },
      delayB: { kind: 'self' },
      granular: { kind: 'editable', route: { key: 'delayBGranularSend', label: 'Delay B → Granular' } },  // overridden dynamically
      reverb: { kind: 'editable', route: { key: 'granularDelayReverbSend', label: 'Delay B → Reverb' } },
    },
  },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function quantize01(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

function normalizeRange(range?: DualSliderRange): DualSliderRange | undefined {
  if (!range) return undefined;
  const min = quantize01(Math.min(range.min, range.max));
  const max = quantize01(Math.max(range.min, range.max));
  return { min, max };
}

function rangesEqual(a?: DualSliderRange, b?: DualSliderRange): boolean {
  if (!a || !b) return false;
  return a.min === b.min && a.max === b.max;
}

function cellValue(state: SliderState, route: RouteControl | undefined): number {
  if (!route) return 0;
  return clamp01(Number(state[route.key] ?? 0) || 0);
}

function getResolvedMode(runtime: RoutingSliderRuntime | null): SliderMode {
  if (!runtime) return 'single';
  return runtime.mode !== 'single' && runtime.dualRange ? runtime.mode : 'single';
}

function getColumnTargets(
  columnId: ColumnId,
  state: SliderState,
  sliderProps: (paramKey: keyof SliderState) => RoutingSliderRuntime,
): ColumnDragTarget[] {
  const seen = new Set<keyof SliderState>();
  const targets: ColumnDragTarget[] = [];

  for (const row of ROWS) {
    const cell = row.cells[columnId];
    if (cell.kind !== 'editable' || !cell.route || seen.has(cell.route.key)) continue;
    seen.add(cell.route.key);
    const runtime = sliderProps(cell.route.key);
    const mode = getResolvedMode(runtime);
    targets.push({
      key: cell.route.key,
      mode,
      startValue: quantize01(Number(state[cell.route.key] ?? 0) || 0),
      startRange: mode === 'single' ? undefined : normalizeRange(runtime.dualRange),
      onDualRangeChange: runtime.onDualRangeChange,
    });
  }

  return targets;
}

function pointerToTrackNorm(clientX: number, rect: DOMRect): number {
  const innerWidth = Math.max(1, rect.width - TRACK_PAD_PX * 2);
  return clamp01((clientX - rect.left - TRACK_PAD_PX) / innerWidth);
}

function getDualHandle(norm: number, range: DualSliderRange, rect: DOMRect): CellHandle {
  const innerWidth = Math.max(1, rect.width - TRACK_PAD_PX * 2);
  const threshold = Math.min(0.18, EDGE_HANDLE_PX / innerWidth);
  const bandWidth = range.max - range.min;

  if (bandWidth <= threshold * 2 && norm >= range.min && norm <= range.max) {
    return 'both';
  }
  if (norm < range.min - threshold) return 'min';
  if (norm <= range.min + threshold) return 'min';
  if (norm > range.max + threshold) return 'max';
  if (norm >= range.max - threshold) return 'max';
  return 'both';
}

function rangeDisplay(mode: SliderMode, range?: DualSliderRange): string {
  if (!range) return '0%';
  const icon = mode === 'walk' ? '↝' : '⊡';
  return `${icon}${Math.round(range.min * 100)}–${Math.round(range.max * 100)}`;
}

function singleDisplay(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function trackLeftCalc(value: number): string {
  return `calc(${TRACK_PAD_PX}px + (100% - ${TRACK_PAD_PX * 2}px) * ${clamp01(value)})`;
}

function trackWidthCalc(value: number): string {
  return `calc((100% - ${TRACK_PAD_PX * 2}px) * ${clamp01(value)})`;
}

function releaseCapture(target: EventTarget & HTMLElement, pointerId: number): void {
  if (target.hasPointerCapture(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
}

export default function RoutingMatrix({
  state,
  isMobile,
  onParamChange,
  sliderProps,
  helpPage = 'routing',
  showNote = true,
}: RoutingMatrixProps) {
  const { announceSlider } = useSliderHelp();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [activeMobileColumn, setActiveMobileColumn] = React.useState<ColumnId>('level');
  const dragStateRef = React.useRef<DragState | null>(null);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMetaRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const longPressConsumedRef = React.useRef(false);
  const dblClickGuardRef = React.useRef<{ time: number; cellId: string } | null>(null);
  const activeColumn = React.useMemo(
    () => COLUMNS.find((column) => column.id === activeMobileColumn) ?? DEFAULT_COLUMN,
    [activeMobileColumn],
  );

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

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressMetaRef.current = null;
  }, []);

  React.useEffect(() => () => clearLongPress(), [clearLongPress]);

  const stopDrag = React.useCallback((dragId: string, pointerId: number) => {
    const drag = dragStateRef.current;
    if (!drag || drag.dragId !== dragId || drag.pointerId !== pointerId) return false;
    dragStateRef.current = null;
    setDraggingId(null);
    return true;
  }, []);

  const resetInteraction = React.useCallback(() => {
    clearLongPress();
    dragStateRef.current = null;
    setDraggingId(null);
    longPressConsumedRef.current = false;
  }, [clearLongPress]);

  const startColumnDrag = React.useCallback((dragId: string, pointerId: number, startClientX: number, targets: ColumnDragTarget[]) => {
    dragStateRef.current = {
      kind: 'column',
      dragId,
      pointerId,
      startClientX,
      targets,
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
    key: keyof SliderState,
    onCycleMode: (key: keyof SliderState) => void,
  ) => {
    clearLongPress();
    longPressConsumedRef.current = false;
    longPressMetaRef.current = { pointerId, startX, startY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressConsumedRef.current = true;
      dragStateRef.current = null;
      setDraggingId(null);
      onCycleMode(key);
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

    for (const target of drag.targets) {
      if (target.mode === 'single' || !target.startRange) {
        const next = quantize01(target.startValue + delta);
        if (drag.lastValues[target.key] === next) continue;
        drag.lastValues[target.key] = next;
        onParamChange(target.key, next);
        continue;
      }

      const widthNorm = target.startRange.max - target.startRange.min;
      const nextMin = quantize01(clamp01(Math.min(target.startRange.min + delta, 1 - widthNorm)));
      const nextRange = { min: nextMin, max: quantize01(nextMin + widthNorm) };
      if (rangesEqual(drag.lastRanges[target.key], nextRange)) continue;
      drag.lastRanges[target.key] = nextRange;
      target.onDualRangeChange(target.key, nextRange.min, nextRange.max);
    }
  }, [onParamChange]);

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

  const renderColumnHeader = React.useCallback((column: { id: ColumnId; label: string; note?: string }, className?: string) => {
    const headerId = `column:${column.id}`;
    const targets = getColumnTargets(column.id, state, sliderProps);

    return (
      <button
        key={column.id}
        type="button"
        className={`routing-matrix-header routing-matrix-header-button${className ? ` ${className}` : ''}${draggingId === headerId ? ' dragging' : ''}`}
        title={column.note}
        disabled={targets.length === 0}
        onPointerDown={(event) => {
          if (targets.length === 0) return;
          clearLongPress();
          startColumnDrag(headerId, event.pointerId, event.clientX, targets);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragStateRef.current;
          if (!drag || drag.kind !== 'column' || drag.dragId !== headerId || drag.pointerId !== event.pointerId) return;
          applyColumnDrag(event.clientX, event.currentTarget.getBoundingClientRect().width);
        }}
        onPointerUp={(event) => {
          stopDrag(headerId, event.pointerId);
          releaseCapture(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
        onPointerCancel={(event) => {
          stopDrag(headerId, event.pointerId);
          releaseCapture(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
      >
        <span className="routing-matrix-header-label">{column.label}</span>
        <span className="routing-matrix-header-meta">all</span>
      </button>
    );
  }, [applyColumnDrag, clearLongPress, draggingId, resetInteraction, sliderProps, startColumnDrag, state, stopDrag]);

  const renderCell = React.useCallback((row: MatrixRow, column: { id: ColumnId; label: string; note?: string }, suffix = '') => {
    const cell = row.cells[column.id];
    const value = cellValue(state, cell.route);
    const cellId = `cell:${row.id}:${column.id}${suffix}`;
    const runtime = cell.kind === 'editable' && cell.route ? sliderProps(cell.route.key) : null;
    const mode = getResolvedMode(runtime);
    const range = mode === 'single' ? undefined : normalizeRange(runtime?.dualRange);
    const indicatorNorm = range
      ? clamp01(range.min + (clamp01(runtime?.walkPosition ?? value) * (range.max - range.min)))
      : value;
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
        className={`routing-matrix-cell ${cell.kind}${column.id === 'level' ? ' level-col' : ''}${draggingId === cellId ? ' dragging' : ''}`}
        style={{ '--row-accent': row.accent } as React.CSSProperties}
        title={cell.note ?? row.note}
        disabled={cell.kind !== 'editable'}
        onMouseEnter={() => {
          if (cell.kind !== 'editable' || !cell.route) return;
          announceSlider(String(cell.route.key), { page: helpPage });
        }}
        onFocus={() => {
          if (cell.kind !== 'editable' || !cell.route) return;
          announceSlider(String(cell.route.key), { page: helpPage });
        }}
        onDoubleClick={() => {
          if (cell.kind !== 'editable' || !cell.route || !runtime) return;
          runtime.onCycleMode(cell.route.key);
        }}
        onPointerDown={(event) => {
          if (cell.kind !== 'editable' || !cell.route || !runtime) return;
          announceSlider(String(cell.route.key), { page: helpPage });
          clearLongPress();

          const now = Date.now();
          const guard = dblClickGuardRef.current;
          const isPotentialDblClick = guard && guard.cellId === cellId && (now - guard.time) < 400;
          dblClickGuardRef.current = { time: now, cellId };
          if (isPotentialDblClick) return;

          const rect = event.currentTarget.getBoundingClientRect();
          const pointerNorm = pointerToTrackNorm(event.clientX, rect);
          const nextMode = getResolvedMode(runtime);
          const nextRange = nextMode === 'single' ? undefined : normalizeRange(runtime.dualRange);
          const handle = nextMode === 'single' || !nextRange
            ? 'single'
            : getDualHandle(pointerNorm, nextRange, rect);

          if (handle === 'single') {
            const next = quantize01(pointerNorm);
            onParamChange(cell.route.key, next);
          } else if (handle === 'min' && nextRange) {
            const min = quantize01(Math.min(pointerNorm, nextRange.max));
            runtime.onDualRangeChange(cell.route.key, min, nextRange.max);
          } else if (handle === 'max' && nextRange) {
            const max = quantize01(Math.max(pointerNorm, nextRange.min));
            runtime.onDualRangeChange(cell.route.key, nextRange.min, max);
          }

          startCellDrag(
            cellId,
            event.pointerId,
            cell.route.key,
            nextMode,
            handle,
            value,
            nextRange,
            pointerNorm,
            runtime.onDualRangeChange,
          );
          event.currentTarget.setPointerCapture(event.pointerId);

          if (event.pointerType === 'touch') {
            scheduleLongPress(event.pointerId, event.clientX, event.clientY, cell.route.key, runtime.onCycleMode);
          }
        }}
        onPointerMove={(event) => {
          maybeCancelLongPress(event.pointerId, event.clientX, event.clientY);
          if (longPressConsumedRef.current) return;

          const drag = dragStateRef.current;
          if (!drag || drag.kind !== 'cell' || drag.dragId !== cellId || drag.pointerId !== event.pointerId) return;
          applyCellDrag(pointerToTrackNorm(event.clientX, event.currentTarget.getBoundingClientRect()));
        }}
        onPointerUp={(event) => {
          stopDrag(cellId, event.pointerId);
          releaseCapture(event.currentTarget, event.pointerId);
          resetInteraction();
        }}
        onPointerCancel={(event) => {
          stopDrag(cellId, event.pointerId);
          releaseCapture(event.currentTarget, event.pointerId);
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
            {mode === 'single' && (
              <span
                className="routing-matrix-cell-indicator single"
                style={{ left: trackLeftCalc(value) }}
              />
            )}
            {isWalk && (
              <span
                className="routing-matrix-cell-indicator walk"
                style={{ left: trackLeftCalc(indicatorNorm) }}
              />
            )}
            {isSampleHold && (
              <span
                className={`routing-matrix-cell-indicator sample-hold${runtime?.isFlashing ? ' flashing' : ''}`}
                style={{ left: trackLeftCalc(indicatorNorm) }}
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
    sliderProps,
    startCellDrag,
    state,
    stopDrag,
  ]);

  return (
    <div className={`routing-matrix${isMobile ? ' mobile' : ''}`}>
      {showNote && (
        <div className="routing-matrix-note">
          Drag cells left or right like miniature sliders. In walk and sample-hold mode, drag the band edges to set the range or drag the band center to slide the whole range. Double-click on desktop or long-press on touch to cycle `single`, `walk`, and `S&amp;H`.
        </div>
      )}

      {isMobile ? (
        <>
          <div className="routing-matrix-mobile-picker" role="tablist" aria-label="Routing matrix columns">
            {COLUMNS.map((column) => (
              <button
                key={column.id}
                type="button"
                className={`routing-matrix-mobile-picker-button${activeMobileColumn === column.id ? ' active' : ''}`}
                onClick={() => setActiveMobileColumn(column.id)}
              >
                {column.label}
              </button>
            ))}
          </div>

          <div className="routing-matrix-mobile-column-note">
            {activeColumn.note}
          </div>

          <div className="routing-matrix-mobile-head">
            <div className="routing-matrix-corner">Source</div>
            {renderColumnHeader(activeColumn, 'routing-matrix-mobile-header')}
          </div>

          <div className="routing-matrix-mobile-list">
            {effectiveRows.map((row) => (
              <div key={`${row.id}:${activeMobileColumn}`} className="routing-matrix-mobile-row">
                <div className="routing-matrix-rowlabel" title={row.note}>
                  <span className="routing-matrix-rowdot" style={{ backgroundColor: row.accent }} />
                  <span>{row.label}</span>
                </div>
                {renderCell(row, activeColumn, ':mobile')}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="routing-matrix-scroll">
          <div className="routing-matrix-grid">
            <div className="routing-matrix-corner">Source</div>
            {COLUMNS.map((column) => renderColumnHeader(column))}

            {effectiveRows.map((row) => (
              <React.Fragment key={row.id}>
                <div className="routing-matrix-rowlabel" title={row.note}>
                  <span className="routing-matrix-rowdot" style={{ backgroundColor: row.accent }} />
                  <span>{row.label}</span>
                </div>
                {COLUMNS.map((column) => renderCell(row, column))}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
