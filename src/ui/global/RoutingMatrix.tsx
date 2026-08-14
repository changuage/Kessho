import React from 'react';
import { resolveEffectiveSliderValue } from '../sliderSystem/effectiveValue';
import type { DualSliderRange } from '../DualSlider';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { SliderMode, SliderState } from '../state';
import { useRuntimeSliderIndicator } from '../runtimeSliderState';
import { getRoutingSourceDef } from '../routing';
import {
  FX_ROUTING_NODE_LABELS,
  canEnableFxRoute,
  fxRouteRuntimeKey,
  isFxRoutingNodeActive,
  setFxRoutePresence,
  type FxRoutingConnection,
  type FxRoutingNodeId,
} from '../routing/fxRoutingGraph';
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
  CellHandle, ColumnDragMemory, ColumnDragTarget,
  ColumnId, DragState, MatrixRow, PendingCellTouchState,
  RoutingColumn, RoutingMatrixProps,
} from './routingMatrixTypes';
export type { RoutingMatrixProps } from './routingMatrixTypes';

const ROUTING_MATRIX_ACTIVE_FILTER_STORAGE_KEY = 'routing-matrix:show-active-only:v1';

const ROUTING_MATRIX_OVERVIEW_HELP_KEY = 'routingMatrixOverview';
import {
  COLUMNS,
  DEFAULT_COLUMN,
  PROCESSOR_ROW_IDS,
  FX_ROW_DEFS,
  DYNAMICS_DESTINATIONS,
  DYNAMICS_ROUTE_BY_ROW,
  ROWS,
  activeEarthChildRows,
  cellValue,
  columnDragMemoryMatches,
  fxMatrixRow,
  fxEdgeId,
  dynamicsDestinationIndex,
  getColumnTargets,
  getResolvedMode,
  isSliderColumnId,
  rangeDisplay,
  rowIsEnabled,
  scaleRangeTowardZero,
  singleDisplay,
  stripColumnDragTarget,
} from './routingMatrixModel';
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
