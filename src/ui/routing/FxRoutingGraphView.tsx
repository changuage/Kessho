import React from 'react';
import { SliderPrimitive } from '../sliderSystem';
import { resolveEffectiveSliderValue } from '../sliderSystem/effectiveValue';
import { useRuntimeSliderIndicator } from '../runtimeSliderState';
import type { SliderMode, SliderState } from '../state';
import { getPadPresetDisplayName } from '../../audio/padPresets';
import { PRESET_POOL_ICON } from '../../presets/presetPool';
import { ROUTING_SOURCE_REGISTRY, type RoutingSourceDef } from './routingSourceRegistry';
import {
  FX_ROUTING_NODE_ACCENTS,
  FX_ROUTING_NODE_IDS,
  FX_ROUTING_NODE_LABELS,
  canEnableFxRoute,
  fxRouteRuntimeKey,
  isFxRoutingNodeActive,
  resolveFxRoutingApproachFanOffsets,
  resolveFxRoutingFanOffsets,
  resolveFxRoutingHorizontalLaneOffset,
  resolveFxRoutingHorizontalBounds,
  resolveFxRoutingNodeRanks,
  resolveFxRoutingRoutedFanOffsets,
  resolveFxRoutingVerticalLaneOffset,
  sampleFxRoutingHorizontalWire,
  sampleFxRoutingVerticalWire,
  setFxRoutePresence,
  type FxRoutingConnection,
  type FxRoutingGraphState,
  type FxRoutingNodeId,
} from './fxRoutingGraph';
import './routing.css';

const LABELS = FX_ROUTING_NODE_LABELS;
const NODE_HALF_WIDTH = 42;
const NODE_HALF_HEIGHT = 31;
const SOURCE_WIDTH = 142;
const SOURCE_HEIGHT = 48;
const MASTER_RADIUS = 38;
const NODE_RACK_HEIGHT = 116;
const SOUND_SOURCE_ORDER = [
  'pad1', 'pad2', 'lead1', 'lead2', 'sample1', 'sample2', 'drums', 'waves', 'water', 'insects', 'nature',
] as const;
const SOUND_SOURCES = SOUND_SOURCE_ORDER
  .map((id) => ROUTING_SOURCE_REGISTRY.find((source) => source.id === id))
  .filter((source): source is RoutingSourceDef => Boolean(source));
const MODE_ORDER: SliderMode[] = ['single', 'shape', 'walk', 'sampleHold'];

type Point = { x: number; y: number };
type SurfaceSize = { width: number; height: number };
type PopupPoint = Point & { below: boolean };
type DragReadout = Point & { value: number; label: 'Level' | 'Send' };
type SliderRuntime = {
  mode: SliderMode;
  dualRange?: { min: number; max: number };
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
};
type MasterSelection = 'master' | 'masterSaturation' | 'masterCompression';
type SourceRoute = {
  id: string;
  source: RoutingSourceDef;
  to: FxRoutingNodeId;
  key: keyof SliderState;
  disconnectKey: keyof SliderState;
  amount: number;
  valueLabel: 'Level' | 'Send';
};
type EditableRoute =
  | { kind: 'source'; id: string; label: string; key: keyof SliderState; amount: number; accent: string }
  | { kind: 'processor'; id: string; label: string; edge: FxRoutingConnection; accent: string };
type WireDrag =
  | { kind: 'processor'; id: string; startY: number; startAmount: number; moved: boolean; label: 'Send' }
  | { kind: 'source'; key: keyof SliderState; startY: number; startAmount: number; moved: boolean; label: 'Level' | 'Send' };

const clampAmount = (value: number): number => Math.max(0, Math.min(1, value));
const edgeId = (edge: Pick<FxRoutingConnection, 'from' | 'to'>): string => `${edge.from}>${edge.to}`;
const hexVertices = (width: number, height: number): Point[] => [
  { x: -width, y: 0 }, { x: -width * 0.62, y: -height }, { x: width * 0.62, y: -height },
  { x: width, y: 0 }, { x: width * 0.62, y: height }, { x: -width * 0.62, y: height },
];
const hexPoints = (width: number, height: number): string => hexVertices(width, height)
  .map(({ x, y }) => `${x},${y}`).join(' ');
const sourceSymbol = (source: RoutingSourceDef): string => {
  if (source.id === 'drums') return '⋮';
  if (['waves', 'water', 'insects', 'nature'].includes(source.id)) return '≈';
  return '∿';
};
const sourceTargets = (
  source: RoutingSourceDef,
  state: SliderState,
  activeNodes: ReadonlySet<FxRoutingNodeId>,
): FxRoutingNodeId[] => {
  const dynamicsBus = Number(source.dynamicsBusKey ? state[source.dynamicsBusKey] : 0);
  if (dynamicsBus > 0) {
    const target: FxRoutingNodeId = dynamicsBus === 1 ? 'eq1' : dynamicsBus === 2 ? 'eq2' : 'sidechain';
    return activeNodes.has(target) ? [target] : [];
  }
  return Object.entries(source.sends).flatMap(([target, key]) => (
    activeNodes.has(target as FxRoutingNodeId) && Number(state[key as keyof SliderState] ?? 0) > 0.0001
      ? [target as FxRoutingNodeId]
      : []
  ));
};

function synthPresetName(state: SliderState, source: 'pad1' | 'pad2' | 'lead1' | 'lead2'): string {
  const morphKey = source === 'pad1' ? 'padMorph' : source === 'pad2' ? 'pad2Morph' : source === 'lead1' ? 'lead1Morph' : 'lead2Morph';
  const useSecond = Number(state[morphKey] ?? 0) >= 0.5;
  const presetKey = source === 'pad1'
    ? useSecond ? 'padPresetB' : 'padPresetA'
    : source === 'pad2'
      ? useSecond ? 'pad2PresetB' : 'pad2PresetA'
      : source === 'lead1'
        ? useSecond ? 'lead1PresetB' : 'lead1PresetA'
        : useSecond ? 'lead2PresetD' : 'lead2PresetC';
  const id = String(state[presetKey] ?? '').trim();
  if (source === 'pad1' || source === 'pad2') return getPadPresetDisplayName(id, source);
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function routePath(from: Point, to: Point, laneOffset = 0, vertical = false): string {
  if (vertical) {
    const bend = Math.max(42, Math.abs(to.y - from.y) * 0.42);
    return `M${from.x} ${from.y} C${from.x + laneOffset} ${from.y + bend},${to.x + laneOffset * 0.2} ${to.y - bend},${to.x} ${to.y}`;
  }
  const bend = Math.max(42, Math.abs(to.x - from.x) * 0.42);
  return `M${from.x} ${from.y} C${from.x + bend} ${from.y + laneOffset},${to.x - bend} ${to.y + laneOffset * 0.2},${to.x} ${to.y}`;
}

function assignFanOffsets(
  items: readonly { id: string; oppositeY: number }[],
  maxSpread: number,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.oppositeY - b.oppositeY || a.id.localeCompare(b.id));
  const offsets = resolveFxRoutingFanOffsets(sorted.length, maxSpread);
  return new Map(sorted.map((item, index) => [item.id, offsets[index]!]));
}

function hexPort(point: Point, side: -1 | 1, yOffset = 0): Point {
  const y = Math.max(-NODE_HALF_HEIGHT, Math.min(NODE_HALF_HEIGHT, yOffset));
  const x = NODE_HALF_WIDTH * (1 - 0.38 * Math.abs(y / NODE_HALF_HEIGHT));
  return { x: point.x + side * x, y: point.y + y };
}

function verticalHexPort(point: Point, side: -1 | 1, xOffset = 0): Point {
  return {
    x: point.x + Math.max(-NODE_HALF_WIDTH * 0.58, Math.min(NODE_HALF_WIDTH * 0.58, xOffset)),
    y: point.y + side * NODE_HALF_HEIGHT,
  };
}

function ellipsePort(point: Point, side: -1 | 1, radiusX: number, radiusY: number, yOffset = 0): Point {
  const y = Math.max(-radiusY * 0.92, Math.min(radiusY * 0.92, yOffset));
  const x = radiusX * Math.sqrt(Math.max(0, 1 - (y * y) / (radiusY * radiusY)));
  return { x: point.x + side * x, y: point.y + y };
}

function verticalEllipsePort(point: Point, side: -1 | 1, radiusX: number, radiusY: number, xOffset = 0): Point {
  const x = Math.max(-radiusX * 0.92, Math.min(radiusX * 0.92, xOffset));
  const y = radiusY * Math.sqrt(Math.max(0, 1 - (x * x) / (radiusX * radiusX)));
  return { x: point.x + x, y: point.y + side * y };
}

function depthGroups(
  nodes: readonly FxRoutingNodeId[],
  edges: readonly FxRoutingConnection[],
): FxRoutingNodeId[][] {
  const nodeSet = new Set(nodes);
  const predecessors = new Map(nodes.map((node) => [node, [] as FxRoutingNodeId[]]));
  for (const edge of edges) {
    if (nodeSet.has(edge.from) && nodeSet.has(edge.to)) predecessors.get(edge.to)?.push(edge.from);
  }
  const remaining = new Set(nodes);
  const depths = new Map<FxRoutingNodeId, number>();
  while (remaining.size > 0) {
    let progressed = false;
    for (const node of nodes) {
      if (!remaining.has(node)) continue;
      const parents = predecessors.get(node) ?? [];
      if (parents.some((parent) => remaining.has(parent))) continue;
      depths.set(node, parents.reduce((depth, parent) => Math.max(depth, (depths.get(parent) ?? 0) + 1), 0));
      remaining.delete(node);
      progressed = true;
    }
    if (!progressed) break;
  }
  const groups = new Map<number, FxRoutingNodeId[]>();
  for (const node of nodes) {
    const depth = depths.get(node) ?? 0;
    groups.set(depth, [...(groups.get(depth) ?? []), node]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

function mobileNodeRows(nodes: readonly FxRoutingNodeId[], edges: readonly FxRoutingConnection[]): FxRoutingNodeId[][] {
  return depthGroups(nodes, edges).flatMap((group) => {
    const rows: FxRoutingNodeId[][] = [];
    for (let index = 0; index < group.length; index += 3) rows.push(group.slice(index, index + 3));
    return rows;
  });
}

function layoutNodes(
  nodes: readonly FxRoutingNodeId[],
  edges: readonly FxRoutingConnection[],
  sourceRanks: Partial<Record<FxRoutingNodeId, readonly number[]>>,
  sourceLinks: readonly { rank: number; targets: readonly FxRoutingNodeId[] }[],
  size: SurfaceSize,
  vertical = false,
  verticalTop = 72,
  verticalBottom = size.height - 72,
): Partial<Record<FxRoutingNodeId, Point>> {
  if (nodes.length === 0) return {};
  const nodeRanks = resolveFxRoutingNodeRanks(nodes, edges, sourceRanks, sourceLinks);
  const groups = depthGroups(nodes, edges).map((group) => group
    .map((node, index) => ({ node, rank: nodeRanks[node] ?? (group.length === 1 ? 0.5 : index / (group.length - 1)) }))
    .sort((a, b) => a.rank - b.rank || nodes.indexOf(a.node) - nodes.indexOf(b.node))
    .map(({ node }) => node));
  if (vertical) {
    const rows = groups.flatMap((group) => {
      const result: FxRoutingNodeId[][] = [];
      for (let index = 0; index < group.length; index += 3) result.push(group.slice(index, index + 3));
      return result;
    });
    return Object.fromEntries(rows.flatMap((row, rowIndex) => row.map((node, columnIndex) => [node, {
      x: row.length === 1
        ? 62 + Math.max(0.08, Math.min(0.92, nodeRanks[node] ?? 0.5)) * (size.width - 124)
        : 62 + columnIndex * ((size.width - 124) / (row.length - 1)),
      y: rows.length === 1
        ? (verticalTop + verticalBottom) / 2
        : verticalTop + rowIndex * ((verticalBottom - verticalTop) / (rows.length - 1)),
    }])));
  }

  const maxDepth = Math.max(0, groups.length - 1);
  const { left, right } = resolveFxRoutingHorizontalBounds(size.width);
  const top = 72;
  const bottom = Math.max(top, size.height - 72);

  if (maxDepth === 0 && nodes.length > 3) {
    const columns = Math.min(3, Math.ceil(Math.sqrt(nodes.length)));
    const rows = Math.ceil(nodes.length / columns);
    return Object.fromEntries(nodes.map((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [node, {
        x: columns === 1 ? (left + right) / 2 : left + column * ((right - left) / (columns - 1)),
        y: rows === 1 ? size.height / 2 : top + row * ((bottom - top) / (rows - 1)),
      }];
    }));
  }

  return Object.fromEntries(groups.flatMap((group, depth) => group.map((node, index) => [node, {
    x: maxDepth === 0 ? (left + right) / 2 : left + depth * ((right - left) / maxDepth),
    y: group.length === 1
      ? top + Math.max(0.08, Math.min(0.92, nodeRanks[node] ?? 0.5)) * (bottom - top)
      : top + index * ((bottom - top) / (group.length - 1)),
  }])));
}

const NODE_PRIMARY_CONTROLS: Record<FxRoutingNodeId, { key: keyof SliderState; label: string }> = {
  delayA: { key: 'delayAMix', label: 'Level' },
  delayB: { key: 'granularDelayMix', label: 'Level' },
  granular: { key: 'granularLevel', label: 'Level' },
  degrade: { key: 'degradeLevel', label: 'Level' },
  freeze: { key: 'spectralFreezeMix', label: 'Level' },
  reverb: { key: 'reverbLevel', label: 'Level' },
  eq1: { key: 'dynamicsEq1Mix', label: 'Dry / Wet' },
  eq2: { key: 'dynamicsEq2Mix', label: 'Dry / Wet' },
  sidechain: { key: 'sidechainMix', label: 'Dry / Wet' },
  creativeSaturation: { key: 'dynamicsSaturationDrive', label: 'Drive' },
};

interface PopupSliderProps {
  label: string;
  value: number;
  accent: string;
  mode: SliderMode;
  range?: { min: number; max: number };
  onChange: (value: number) => void;
  onRangeChange: (min: number, max: number) => void;
  onCycleMode: () => void;
  indicatorValue?: number;
  displayValue?: string;
  isFlashing?: boolean;
}

function PopupSlider({
  label, value, accent, mode, range, onChange, onRangeChange, onCycleMode,
  indicatorValue, displayValue, isFlashing,
}: PopupSliderProps) {
  return <SliderPrimitive
    className="fx-popup-slider"
    label={label}
    mode={mode}
    value={clampAmount(value) * 100}
    range={mode === 'single' ? undefined : {
      min: clampAmount(range?.min ?? value) * 100,
      max: clampAmount(range?.max ?? value) * 100,
    }}
    indicatorValue={indicatorValue == null ? undefined : indicatorValue * 100}
    displayValue={displayValue}
    isFlashing={isFlashing}
    hero={accent}
    variant="full"
    density="compact"
    formatValue={(next) => `${Math.round(next)}%`}
    minRangeGap={1}
    onValueChange={(next) => onChange(next / 100)}
    onRangeChange={(next) => onRangeChange(next.min / 100, next.max / 100)}
    onModeCycle={onCycleMode}
  />;
}

function RuntimePopupSlider({
  paramKey,
  runtime,
  ...props
}: PopupSliderProps & { paramKey: keyof SliderState; runtime?: SliderRuntime }) {
  const mode = runtime?.mode ?? props.mode;
  const range = runtime?.dualRange ?? props.range;
  const indicator = useRuntimeSliderIndicator(
    String(paramKey),
    mode,
    runtime?.walkPosition,
    runtime?.isFlashing,
  );
  const liveValue = clampAmount(resolveEffectiveSliderValue({
    authoredValue: props.value,
    mode,
    range: range ? [range.min, range.max] : undefined,
    runtimePosition: indicator.walkPosition,
  }));
  return <PopupSlider {...props} mode={mode} range={range}
    indicatorValue={liveValue} displayValue={`${Math.round(liveValue * 100)}%`}
    isFlashing={indicator.isFlashing} />;
}

function FxRoutePopupSlider({
  edge,
  ...props
}: PopupSliderProps & { edge: FxRoutingConnection }) {
  const indicator = useRuntimeSliderIndicator(fxRouteRuntimeKey(edge.from, edge.to), 'walk');
  const liveValue = clampAmount(resolveEffectiveSliderValue({
    authoredValue: props.value,
    mode: props.mode,
    range: props.range ? [props.range.min, props.range.max] : undefined,
    runtimePosition: indicator.walkPosition,
  }));
  return <PopupSlider {...props} indicatorValue={liveValue}
    displayValue={`${Math.round(liveValue * 100)}%`} />;
}

function LiveParamValue({
  paramKey,
  value,
  runtime,
}: { paramKey: keyof SliderState; value: number; runtime?: SliderRuntime }) {
  const mode = runtime?.mode ?? 'single';
  const indicator = useRuntimeSliderIndicator(
    String(paramKey),
    mode,
    runtime?.walkPosition,
    runtime?.isFlashing,
  );
  const liveValue = resolveEffectiveSliderValue({
    authoredValue: value,
    mode,
    range: runtime?.dualRange ? [runtime.dualRange.min, runtime.dualRange.max] : undefined,
    runtimePosition: indicator.walkPosition,
  });
  return <>{Math.round(clampAmount(liveValue) * 100)}</>;
}

interface FxRoutingGraphViewProps {
  state: SliderState;
  graph: FxRoutingGraphState;
  mobile?: boolean;
  readOnly?: boolean;
  onChange?: (graph: FxRoutingGraphState) => void;
  onParamChange?: (key: keyof SliderState, value: number) => void;
  onToggleSource?: (sourceId: string, enabled: boolean) => void;
  onToggleFxNode?: (node: FxRoutingNodeId, enabled: boolean) => void;
  onBooleanParamChange?: (key: keyof SliderState, value: boolean) => void;
  sliderProps?: (key: keyof SliderState) => SliderRuntime;
  onOpenSynthPresetPool?: (source: 'pad1' | 'pad2' | 'lead1' | 'lead2') => void;
}

export default function FxRoutingGraphView({
  state,
  graph,
  mobile = false,
  readOnly = false,
  onChange,
  onParamChange,
  onToggleSource,
  onToggleFxNode,
  onBooleanParamChange,
  sliderProps,
  onOpenSynthPresetPool,
}: FxRoutingGraphViewProps) {
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const rackToggleRef = React.useRef<HTMLButtonElement>(null);
  const [size, setSize] = React.useState<SurfaceSize>({ width: 1000, height: 625 });
  const [rackOpen, setRackOpen] = React.useState(false);
  const [rackDragOffset, setRackDragOffset] = React.useState(0);
  const rackDragStart = React.useRef<number | null>(null);
  const rackDragOffsetRef = React.useRef(0);
  const [connectFrom, setConnectFrom] = React.useState<FxRoutingNodeId | null>(null);
  const [connectSource, setConnectSource] = React.useState<string | null>(null);
  const [connectionPointer, setConnectionPointer] = React.useState<{ svg: Point; client: Point } | null>(null);
  const [selectedEdge, setSelectedEdge] = React.useState<string | null>(null);
  const [selectedSourceEdge, setSelectedSourceEdge] = React.useState<string | null>(null);
  const [selectedNode, setSelectedNode] = React.useState<FxRoutingNodeId | null>(null);
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);
  const [selectedMaster, setSelectedMaster] = React.useState<MasterSelection | null>(null);
  const [popupPoint, setPopupPoint] = React.useState<PopupPoint>({ x: 0, y: 0, below: false });
  const [dragReadout, setDragReadout] = React.useState<DragReadout | null>(null);
  const wireDrag = React.useRef<WireDrag | null>(null);
  const capturedPointer = React.useRef<{ element: Element; pointerId: number } | null>(null);
  const lastWireDragMoved = React.useRef(false);
  const graphRef = React.useRef(graph);
  graphRef.current = graph;

  React.useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    const measure = () => {
      const next = { width: surface.clientWidth, height: surface.clientHeight };
      if (next.width > 0 && next.height > 0) setSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(surface);
    return () => observer?.disconnect();
  }, []);

  const activeNodes = React.useMemo(
    () => FX_ROUTING_NODE_IDS.filter((node) => isFxRoutingNodeActive(state, node)),
    [state],
  );
  const activeNodeSet = React.useMemo(() => new Set(activeNodes), [activeNodes]);
  const sourceRows = React.useMemo(
    () => SOUND_SOURCES.filter((source) => source.isEnabled(state)),
    [state],
  );
  const rackVisible = !readOnly;
  const mobileSourceRowCount = Math.max(1, Math.ceil(sourceRows.length / 2));
  const mobileFxRows = React.useMemo(() => mobileNodeRows(activeNodes, graph.edges), [activeNodes, graph.edges]);
  const mobileSurfaceHeight = Math.max(
    680,
    300 + mobileSourceRowCount * 62 + Math.max(1, mobileFxRows.length) * 96,
  );
  const graphHeight = Math.max(320, size.height - (rackVisible && !mobile ? NODE_RACK_HEIGHT : 0));
  const graphSize = { width: size.width, height: graphHeight };
  const mobileSourceBottom = 58 + (mobileSourceRowCount - 1) * 62 + SOURCE_HEIGHT / 2;
  const mobileFxTop = mobileSourceBottom + 84;
  const mobileMasterY = graphHeight - 152;
  const sourcePositions = React.useMemo(() => Object.fromEntries(sourceRows.map((source, index) => {
    if (!mobile) return [source.id, {
      x: 106,
      y: sourceRows.length === 1 ? graphHeight / 2 : 58 + index * ((graphHeight - 116) / (sourceRows.length - 1)),
    }] as const;
    const rowLength = Math.min(2, sourceRows.length - Math.floor(index / 2) * 2);
    const column = index % 2;
    return [source.id, {
      x: rowLength === 1
        ? size.width / 2
        : SOURCE_WIDTH / 2 + 14 + column * (size.width - SOURCE_WIDTH - 28),
      y: 58 + Math.floor(index / 2) * 62,
    }] as const;
  })), [graphHeight, mobile, size.width, sourceRows]);
  const sourceNodeLinks = React.useMemo(() => sourceRows.flatMap((source) => {
    const point = sourcePositions[source.id];
    if (!point) return [];
    return [{
      rank: mobile ? point.x / Math.max(1, size.width) : point.y / Math.max(1, graphHeight),
      targets: sourceTargets(source, state, activeNodeSet),
    }];
  }), [activeNodeSet, graphHeight, mobile, size.width, sourcePositions, sourceRows, state]);
  const sourceNodeRanks = React.useMemo(() => {
    const ranks: Partial<Record<FxRoutingNodeId, number[]>> = {};
    for (const link of sourceNodeLinks) for (const target of link.targets) (ranks[target] ??= []).push(link.rank);
    return ranks;
  }, [sourceNodeLinks]);
  const positions = React.useMemo(
    () => layoutNodes(
      activeNodes,
      graph.edges,
      sourceNodeRanks,
      sourceNodeLinks,
      graphSize,
      mobile,
      mobileFxTop,
      mobileMasterY - 126,
    ),
    [activeNodes, graph.edges, graphHeight, mobile, mobileFxTop, mobileMasterY, size.width, sourceNodeLinks, sourceNodeRanks],
  );
  const masterPosition = mobile
    ? { x: size.width / 2, y: mobileMasterY }
    : { x: resolveFxRoutingHorizontalBounds(size.width).masterX, y: graphHeight / 2 };
  const masterSaturationActive = Boolean(state.masterSaturationEnabled);
  const masterCompressionActive = Boolean(state.endCompEnabled);
  const activeFxCount = activeNodes.length + Number(masterSaturationActive) + Number(masterCompressionActive);
  const closeRack = React.useCallback(() => {
    setRackDragOffset(0);
    rackDragOffsetRef.current = 0;
    rackDragStart.current = null;
    setRackOpen(false);
    requestAnimationFrame(() => rackToggleRef.current?.focus());
  }, []);
  const startRackDrag = (clientY: number) => { rackDragStart.current = clientY; };
  const moveRackDrag = (clientY: number) => {
    if (rackDragStart.current == null) return;
    const offset = Math.max(0, rackDragStart.current - clientY);
    if (offset >= 32) { closeRack(); return; }
    rackDragOffsetRef.current = offset;
    setRackDragOffset(offset);
  };
  const endRackDrag = (clientY: number) => {
    const shouldClose = rackDragOffsetRef.current >= 32
      || (rackDragStart.current != null && rackDragStart.current - clientY >= 32);
    rackDragStart.current = null;
    if (shouldClose) closeRack();
    else { rackDragOffsetRef.current = 0; setRackDragOffset(0); }
  };

  const sourceTargetKey = React.useCallback((sourceId: string, node: FxRoutingNodeId): keyof SliderState | undefined => {
    const source = SOUND_SOURCES.find((candidate) => candidate.id === sourceId);
    if (!source) return undefined;
    if (node === 'eq1' || node === 'eq2' || node === 'sidechain') return source.dynamicsBusKey;
    return source.sends[node as keyof typeof source.sends];
  }, []);
  const sourceRoutes: SourceRoute[] = React.useMemo(() => sourceRows.flatMap((source): SourceRoute[] => {
    const dynamicsBus = Number(source.dynamicsBusKey ? state[source.dynamicsBusKey] : 0);
    if (dynamicsBus > 0 && source.dynamicsBusKey) {
      const to: FxRoutingNodeId = dynamicsBus === 1 ? 'eq1' : dynamicsBus === 2 ? 'eq2' : 'sidechain';
      return positions[to] ? [{
        id: `${source.id}>${to}`,
        source,
        to,
        key: source.levelKey,
        disconnectKey: source.dynamicsBusKey,
        amount: Number(state[source.levelKey] ?? 0),
        valueLabel: 'Level',
      }] : [];
    }
    return Object.entries(source.sends).flatMap(([to, key]) => {
      const target = positions[to as FxRoutingNodeId];
      const amount = Number(state[key as keyof SliderState] ?? 0);
      return target && amount > 0.0001 ? [{
        id: `${source.id}>${to}`,
        source,
        to: to as FxRoutingNodeId,
        key: key as keyof SliderState,
        disconnectKey: key as keyof SliderState,
        amount,
        valueLabel: 'Send',
      }] : [];
    });
  }), [positions, sourceRows, state]);

  const connectionOffsets = React.useMemo(() => {
    const sourceOutput = new Map<string, number>();
    const nodeInput = new Map<string, number>();
    const nodeOutput = new Map<string, number>();
    const masterInput = new Map<string, number>();

    for (const source of sourceRows) {
      const items = sourceRoutes
        .filter((route) => route.source.id === source.id)
        .map((route) => ({
          id: `source:${route.id}`,
          oppositeY: mobile ? positions[route.to]?.x ?? 0 : positions[route.to]?.y ?? 0,
        }));
      for (const [id, offset] of assignFanOffsets(
        items,
        mobile ? SOURCE_WIDTH * 0.3 : SOURCE_HEIGHT * 0.3,
      )) sourceOutput.set(id, offset);
    }
    for (const node of activeNodes) {
      const target = positions[node];
      if (!target) continue;
      const incoming = [
        ...sourceRoutes.filter((route) => route.to === node).flatMap((route) => {
          const from = sourcePositions[route.source.id];
          return from ? [{ id: `source:${route.id}`, from }] : [];
        }),
        ...graph.edges.filter((edge) => edge.to === node && positions[edge.from]).map((edge) => ({
          id: `edge:${edgeId(edge)}`,
          from: positions[edge.from]!,
        })),
      ];
      for (const [id, offset] of resolveFxRoutingApproachFanOffsets(
        incoming,
        target,
        mobile ? NODE_HALF_WIDTH * 0.55 : NODE_HALF_HEIGHT * 0.62,
        mobile,
      )) nodeInput.set(id, offset);

      const outgoing = [
        ...graph.edges.filter((edge) => edge.from === node && positions[edge.to]).map((edge) => ({
          id: `edge:${edgeId(edge)}`,
          oppositeY: mobile ? positions[edge.to]?.x ?? 0 : positions[edge.to]?.y ?? 0,
        })),
        { id: `master:${node}`, oppositeY: mobile ? masterPosition.x : masterPosition.y },
      ];
      for (const [id, offset] of assignFanOffsets(
        outgoing,
        mobile ? NODE_HALF_WIDTH * 0.55 : NODE_HALF_HEIGHT * 0.62,
      )) nodeOutput.set(id, offset);
    }
    const masterItems = activeNodes.flatMap((node) => {
      const from = positions[node];
      return from ? [{ id: `master:${node}`, from }] : [];
    });
    for (const [id, offset] of resolveFxRoutingApproachFanOffsets(
      masterItems,
      masterPosition,
      MASTER_RADIUS * 0.66,
      mobile,
    )) masterInput.set(id, offset);
    return { sourceOutput, nodeInput, nodeOutput, masterInput };
  }, [activeNodes, graph.edges, masterPosition.x, masterPosition.y, mobile, positions, sourcePositions, sourceRows, sourceRoutes]);

  const mobileLaneOffsets = React.useMemo(() => {
    const result = new Map<string, number>();
    if (!mobile) return result;
    const wires: { id: string; from: Point; to: Point; endpoints: FxRoutingNodeId[] }[] = [];
    for (const edge of graph.edges) {
      const from = positions[edge.from];
      const to = positions[edge.to];
      if (!from || !to) continue;
      const id = `edge:${edgeId(edge)}`;
      wires.push({
        id,
        from: verticalHexPort(from, 1, connectionOffsets.nodeOutput.get(id)),
        to: verticalHexPort(to, -1, connectionOffsets.nodeInput.get(id)),
        endpoints: [edge.from, edge.to],
      });
    }
    for (const route of sourceRoutes) {
      const source = sourcePositions[route.source.id];
      const target = positions[route.to];
      if (!source || !target) continue;
      const id = `source:${route.id}`;
      wires.push({
        id,
        from: verticalEllipsePort(source, 1, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2, connectionOffsets.sourceOutput.get(id)),
        to: verticalHexPort(target, -1, connectionOffsets.nodeInput.get(id)),
        endpoints: [route.to],
      });
    }
    for (const node of activeNodes) {
      const point = positions[node];
      if (!point) continue;
      const id = `master:${node}`;
      wires.push({
        id,
        from: verticalHexPort(point, 1, connectionOffsets.nodeOutput.get(id)),
        to: verticalEllipsePort(masterPosition, -1, MASTER_RADIUS, MASTER_RADIUS, connectionOffsets.masterInput.get(id)),
        endpoints: [node],
      });
    }
    const occupiedPaths: Point[][] = [];
    wires.sort((a, b) => Math.abs(a.to.y - a.from.y) - Math.abs(b.to.y - b.from.y) || a.id.localeCompare(b.id));
    for (const wire of wires) {
      const lane = resolveFxRoutingVerticalLaneOffset({
        from: wire.from,
        to: wire.to,
        maxOffset: Math.min(90, graphHeight * 0.16),
        preferredSide: wire.to.x >= wire.from.x ? 1 : -1,
        obstacles: activeNodes.filter((node) => !wire.endpoints.includes(node)).flatMap((node) => {
          const point = positions[node];
          return point ? [{ ...point, halfWidth: NODE_HALF_WIDTH, halfHeight: NODE_HALF_HEIGHT }] : [];
        }),
        occupiedPaths,
      });
      result.set(wire.id, lane);
      occupiedPaths.push(sampleFxRoutingVerticalWire(wire.from, wire.to, lane));
    }
    return result;
  }, [activeNodes, connectionOffsets, graph.edges, graphHeight, masterPosition.x, masterPosition.y, mobile, positions, sourcePositions, sourceRoutes]);

  const desktopLaneOffsets = React.useMemo(() => {
    const result = new Map<string, number>();
    if (mobile) return result;
    const wires: { id: string; from: Point; to: Point; endpoints: FxRoutingNodeId[] }[] = [];
    for (const edge of graph.edges) {
      const from = positions[edge.from];
      const to = positions[edge.to];
      if (!from || !to) continue;
      const id = `edge:${edgeId(edge)}`;
      wires.push({
        id,
        from: hexPort(from, 1, connectionOffsets.nodeOutput.get(id)),
        to: hexPort(to, -1, connectionOffsets.nodeInput.get(id)),
        endpoints: [edge.from, edge.to],
      });
    }
    for (const route of sourceRoutes) {
      const source = sourcePositions[route.source.id];
      const target = positions[route.to];
      if (!source || !target) continue;
      const id = `source:${route.id}`;
      wires.push({
        id,
        from: ellipsePort(source, 1, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2, connectionOffsets.sourceOutput.get(id)),
        to: hexPort(target, -1, connectionOffsets.nodeInput.get(id)),
        endpoints: [route.to],
      });
    }
    for (const node of activeNodes) {
      const point = positions[node];
      if (!point) continue;
      const id = `master:${node}`;
      wires.push({
        id,
        from: hexPort(point, 1, connectionOffsets.nodeOutput.get(id)),
        to: ellipsePort(masterPosition, -1, MASTER_RADIUS, MASTER_RADIUS, connectionOffsets.masterInput.get(id)),
        endpoints: [node],
      });
    }

    const occupiedPaths: Point[][] = [];
    const maxOffset = Math.min(110, graphHeight * 0.18);
    wires.sort((a, b) => Math.abs(a.to.x - a.from.x) - Math.abs(b.to.x - b.from.x) || a.id.localeCompare(b.id));
    for (const wire of wires) {
      const lane = resolveFxRoutingHorizontalLaneOffset({
        from: wire.from,
        to: wire.to,
        maxOffset,
        preferredSide: wire.to.y > wire.from.y ? 1 : -1,
        obstacles: activeNodes.filter((node) => !wire.endpoints.includes(node)).flatMap((node) => {
          const point = positions[node];
          return point ? [{ ...point, halfWidth: NODE_HALF_WIDTH, halfHeight: NODE_HALF_HEIGHT }] : [];
        }),
        occupiedPaths,
      });
      result.set(wire.id, lane);
      occupiedPaths.push(sampleFxRoutingHorizontalWire(wire.from, wire.to, lane));
    }
    return result;
  }, [activeNodes, connectionOffsets, graph.edges, graphHeight, masterPosition.x, masterPosition.y, mobile, positions, sourcePositions, sourceRoutes]);

  const routedNodeOutputOffsets = React.useMemo(() => {
    const result = new Map(connectionOffsets.nodeOutput);
    const laneOffsets = mobile ? mobileLaneOffsets : desktopLaneOffsets;
    for (const node of activeNodes) {
      const origin = positions[node];
      if (!origin) continue;
      const originPosition = mobile ? origin.x : origin.y;
      const items = graph.edges
        .filter((edge) => edge.from === node && positions[edge.to])
        .map((edge) => {
          const id = `edge:${edgeId(edge)}`;
          const destination = positions[edge.to]!;
          return {
            id,
            originPosition,
            destinationPosition: mobile ? destination.x : destination.y,
            laneOffset: laneOffsets.get(id) ?? 0,
          };
        });
      const masterId = `master:${node}`;
      items.push({
        id: masterId,
        originPosition,
        destinationPosition: mobile ? masterPosition.x : masterPosition.y,
        laneOffset: laneOffsets.get(masterId) ?? 0,
      });
      for (const [id, offset] of resolveFxRoutingRoutedFanOffsets(
        items,
        mobile ? NODE_HALF_WIDTH * 0.55 : NODE_HALF_HEIGHT * 0.62,
      )) result.set(id, offset);
    }
    return result;
  }, [activeNodes, connectionOffsets.nodeOutput, desktopLaneOffsets, graph.edges, masterPosition.x, masterPosition.y, mobile, mobileLaneOffsets, positions]);

  const showPopup = (clientX: number, clientY: number) => setPopupPoint({
    x: Math.max(170, Math.min(window.innerWidth - 170, clientX)),
    y: clientY,
    below: clientY < 260,
  });
  const openMasterPopup = (selection: MasterSelection, clientX: number, clientY: number) => {
    if (readOnly) return;
    clearSelection();
    setSelectedMaster(selection);
    showPopup(clientX, clientY);
  };
  const clearSelection = React.useCallback(() => {
    setSelectedEdge(null);
    setSelectedSourceEdge(null);
    setSelectedNode(null);
    setSelectedSource(null);
    setSelectedMaster(null);
  }, []);
  const clientPoint = (event: Pick<PointerEvent, 'clientX' | 'clientY'>): { svg: Point; client: Point } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      client: { x: event.clientX, y: event.clientY },
      svg: { x: (event.clientX - rect.left) * (size.width / rect.width), y: (event.clientY - rect.top) * (size.height / rect.height) },
    };
  };

  const updateEdge = React.useCallback((id: string, patch: Partial<FxRoutingConnection>) => {
    if (readOnly || !onChange) return;
    const current = graphRef.current;
    onChange({ ...current, edges: current.edges.map((edge) => edgeId(edge) === id ? { ...edge, ...patch } : edge) });
  }, [onChange, readOnly]);

  const finishPointerInteraction = React.useCallback(() => {
    const captured = capturedPointer.current;
    if (captured && 'hasPointerCapture' in captured.element
      && (captured.element as Element & { hasPointerCapture(id: number): boolean }).hasPointerCapture(captured.pointerId)) {
      (captured.element as Element & { releasePointerCapture(id: number): void }).releasePointerCapture(captured.pointerId);
    }
    capturedPointer.current = null;
    lastWireDragMoved.current = Boolean(wireDrag.current?.moved);
    wireDrag.current = null;
    setDragReadout(null);
    setConnectFrom(null);
    setConnectSource(null);
    setConnectionPointer(null);
  }, []);

  const capturePointer = (event: React.PointerEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    capturedPointer.current = { element: event.currentTarget, pointerId: event.pointerId };
  };

  React.useEffect(() => {
    if (readOnly) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (rackOpen) {
        setRackOpen(false);
        requestAnimationFrame(() => rackToggleRef.current?.focus());
      }
      clearSelection();
      finishPointerInteraction();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [clearSelection, finishPointerInteraction, rackOpen, readOnly]);

  React.useEffect(() => {
    if (readOnly) return undefined;
    const move = (event: PointerEvent) => {
      if (connectFrom || connectSource) {
        event.preventDefault();
        const point = clientPoint(event);
        if (point) setConnectionPointer(point);
      }
      const drag = wireDrag.current;
      if (!drag) return;
      if (Math.abs(event.clientY - drag.startY) > 2) drag.moved = true;
      const amount = clampAmount(drag.startAmount + (drag.startY - event.clientY) / 180);
      if (drag.kind === 'processor') updateEdge(drag.id, { amount });
      else onParamChange?.(drag.key, amount);
      setDragReadout({ x: event.clientX, y: event.clientY, value: amount, label: drag.label });
    };
    const up = (event: PointerEvent) => {
      if (connectFrom || connectSource) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGGElement>('[data-node]');
        const node = target?.dataset.node as FxRoutingNodeId | undefined;
        if (node && activeNodeSet.has(node)) {
          if (connectSource && sourceTargetKey(connectSource, node)) connectSourceTo(connectSource, node);
          else if (connectFrom && connectFrom !== node && canEnableFxRoute(graphRef.current.edges, connectFrom, node)) {
            setPresence(connectFrom, node, true);
          }
        }
      }
      finishPointerInteraction();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [activeNodeSet, connectFrom, connectSource, finishPointerInteraction, onParamChange, readOnly, size, sourceTargetKey, updateEdge]);

  const setPresence = (from: FxRoutingNodeId, to: FxRoutingNodeId, enabled: boolean) => {
    if (readOnly || !onChange) return;
    const next = setFxRoutePresence(graph.edges, from, to, enabled);
    if (!next) return;
    const old = graph.edges.find((edge) => edge.from === from && edge.to === to);
    onChange({
      ...graph,
      edges: next.map((edge) => edge.from === from && edge.to === to
        ? { ...edge, amount: old?.amount ?? 0.5 }
        : edge as FxRoutingConnection),
    });
  };
  const connectSourceTo = (sourceId: string, node: FxRoutingNodeId) => {
    const key = sourceTargetKey(sourceId, node);
    if (!key || !onParamChange) return;
    const bus = node === 'eq1' ? 1 : node === 'eq2' ? 2 : node === 'sidechain' ? 3 : null;
    onParamChange(key, bus ?? Math.max(0.5, Number(state[key] ?? 0)));
  };
  const beginConnection = (event: React.PointerEvent, from: { fx?: FxRoutingNodeId; source?: string }) => {
    if (readOnly) return;
    capturePointer(event as React.PointerEvent<SVGElement>);
    clearSelection();
    setConnectFrom(from.fx ?? null);
    setConnectSource(from.source ?? null);
    const point = clientPoint(event.nativeEvent);
    if (point) setConnectionPointer(point);
  };

  const selected = graph.edges.find((edge) => edgeId(edge) === selectedEdge) ?? null;
  const selectedSourceRoute = sourceRoutes.find((route) => route.id === selectedSourceEdge) ?? null;
  const selectedSourceDef = sourceRows.find((source) => source.id === selectedSource) ?? null;
  const selectedRuntime = selectedSourceRoute ? sliderProps?.(selectedSourceRoute.key) : undefined;
  const selectedMode: SliderMode = selected
    ? selected.mode === 'range' ? 'shape' : selected.mode ?? 'single'
    : selectedRuntime?.mode ?? 'single';
  const selectedAmount = selected?.amount ?? selectedSourceRoute?.amount ?? 0;
  const selectedMin = selected?.min ?? selectedRuntime?.dualRange?.min ?? selectedAmount;
  const selectedMax = selected?.max ?? selectedRuntime?.dualRange?.max ?? selectedAmount;
  const selectedRouteAccent = selected
    ? FX_ROUTING_NODE_ACCENTS[selected.from]
    : selectedSourceRoute?.source.accent ?? '#E8DCC4';
  const cycleProcessorMode = (edge: FxRoutingConnection) => {
    const current = edge.mode === 'range' ? 'shape' : edge.mode ?? 'single';
    const next = MODE_ORDER[(MODE_ORDER.indexOf(current) + 1) % MODE_ORDER.length]!;
    const defaultMin = Math.max(0, edge.amount - 0.1);
    const defaultMax = Math.min(1, edge.amount + 0.1);
    updateEdge(edgeId(edge), next === 'single'
      ? { mode: 'single', min: undefined, max: undefined }
      : { mode: next === 'shape' ? 'range' : next, min: edge.min ?? defaultMin, max: edge.max ?? defaultMax });
  };
  const cycleRouteMode = () => selected
    ? cycleProcessorMode(selected)
    : selectedSourceRoute && selectedRuntime?.onCycleMode?.(selectedSourceRoute.key);
  const updateSelectedAmount = (amount: number) => {
    if (selected) updateEdge(edgeId(selected), { amount });
    else if (selectedSourceRoute) onParamChange?.(selectedSourceRoute.key, amount);
  };
  const updateSelectedRange = (min: number, max: number) => {
    if (selected) updateEdge(edgeId(selected), { min, max });
    else if (selectedSourceRoute) selectedRuntime?.onDualRangeChange?.(selectedSourceRoute.key, min, max);
  };

  const sourceOutput = (point: Point, offset = 0): Point => mobile
    ? verticalEllipsePort(point, 1, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2, offset)
    : ellipsePort(point, 1, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2, offset);
  const nodeInput = (point: Point, offset = 0): Point => mobile
    ? verticalHexPort(point, -1, offset)
    : hexPort(point, -1, offset);
  const nodeOutput = (point: Point, offset = 0): Point => mobile
    ? verticalHexPort(point, 1, offset)
    : hexPort(point, 1, offset);
  const masterInput = (offset = 0): Point => mobile
    ? verticalEllipsePort(masterPosition, -1, MASTER_RADIUS, MASTER_RADIUS, offset)
    : ellipsePort(masterPosition, -1, MASTER_RADIUS, MASTER_RADIUS, offset);
  const connectionOrigin = connectFrom && positions[connectFrom]
    ? nodeOutput(positions[connectFrom]!)
    : connectSource && sourcePositions[connectSource]
      ? sourceOutput(sourcePositions[connectSource]!)
      : null;
  const selectedIncoming: EditableRoute[] = selectedNode ? [
    ...sourceRoutes.filter((route) => route.to === selectedNode).map((route): EditableRoute => ({
      kind: 'source', id: route.id, label: route.source.label, key: route.key, amount: route.amount, accent: route.source.accent,
    })),
    ...graph.edges.filter((edge) => edge.to === selectedNode).map((edge): EditableRoute => ({
      kind: 'processor', id: edgeId(edge), label: LABELS[edge.from], edge, accent: FX_ROUTING_NODE_ACCENTS[edge.from],
    })),
  ] : [];
  const selectedOutgoing: EditableRoute[] = selectedNode
    ? graph.edges.filter((edge) => edge.from === selectedNode).map((edge): EditableRoute => ({
      kind: 'processor', id: edgeId(edge), label: LABELS[edge.to], edge, accent: FX_ROUTING_NODE_ACCENTS[edge.from],
    }))
    : selectedSourceDef
      ? sourceRoutes.filter((route) => route.source.id === selectedSourceDef.id).map((route): EditableRoute => ({
        kind: 'source', id: route.id, label: LABELS[route.to], key: route.key, amount: route.amount, accent: route.source.accent,
      }))
      : [];
  const selectedPrimary = selectedNode
    ? NODE_PRIMARY_CONTROLS[selectedNode]
    : selectedSourceDef ? { key: selectedSourceDef.levelKey, label: 'Level' } : null;
  const selectedPrimaryRuntime = selectedPrimary ? sliderProps?.(selectedPrimary.key) : undefined;
  const selectedSynthPresetSource = selectedSourceDef && (
    selectedSourceDef.id === 'pad1' || selectedSourceDef.id === 'pad2'
    || selectedSourceDef.id === 'lead1' || selectedSourceDef.id === 'lead2'
  ) ? selectedSourceDef.id : null;

  const routeSlider = (route: EditableRoute) => {
    if (route.kind === 'processor') {
      const mode: SliderMode = route.edge.mode === 'range' ? 'shape' : route.edge.mode ?? 'single';
      return <FxRoutePopupSlider key={route.id} edge={route.edge}
        label={route.label} value={route.edge.amount} accent={route.accent} mode={mode}
        range={route.edge.min == null || route.edge.max == null ? undefined : { min: route.edge.min, max: route.edge.max }}
        onChange={(amount) => updateEdge(route.id, { amount })}
        onRangeChange={(min, max) => updateEdge(route.id, { min, max })}
        onCycleMode={() => cycleProcessorMode(route.edge)} />;
    }
    const runtime = sliderProps?.(route.key);
    return <RuntimePopupSlider key={route.id} paramKey={route.key} runtime={runtime}
      label={route.label} value={route.amount} accent={route.accent} mode={runtime?.mode ?? 'single'} range={runtime?.dualRange}
      onChange={(amount) => onParamChange?.(route.key, amount)}
      onRangeChange={(min, max) => runtime?.onDualRangeChange?.(route.key, min, max)}
      onCycleMode={() => runtime?.onCycleMode?.(route.key)} />;
  };

  const paramSlider = (key: keyof SliderState, label: string, accent: string) => {
    const runtime = sliderProps?.(key);
    return <RuntimePopupSlider key={String(key)} paramKey={key} runtime={runtime}
      label={label} value={Number(state[key] ?? 0)} accent={accent}
      mode={runtime?.mode ?? 'single'} range={runtime?.dualRange}
      onChange={(amount) => onParamChange?.(key, amount)}
      onRangeChange={(min, max) => runtime?.onDualRangeChange?.(key, min, max)}
      onCycleMode={() => runtime?.onCycleMode?.(key)} />;
  };

  return (
    <div ref={surfaceRef} className={`fx-node-surface journey-style${mobile ? ' mobile-flow' : ''}${readOnly ? ' read-only' : ''}`}
      style={mobile ? { height: mobileSurfaceHeight, minHeight: 680 } : undefined}
      role={readOnly ? 'img' : undefined} aria-label="Audio routing graph">
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`}
        onPointerDown={(event) => { if (event.target === event.currentTarget) clearSelection(); }}>
        <defs>
          <filter id="fxJourneyGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="fxJourneyHalo">
            <stop offset="0%" stopColor="rgba(184,224,255,.09)" />
            <stop offset="60%" stopColor="rgba(24,32,64,.04)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <ellipse className="fx-journey-frame" cx={mobile ? size.width / 2 : size.width * 0.57} cy={graphHeight / 2}
          rx={Math.max(80, size.width * (mobile ? 0.42 : 0.32))} ry={Math.max(80, graphHeight * (mobile ? 0.43 : 0.38))} />
        <ellipse className="fx-journey-halo" cx={mobile ? size.width / 2 : size.width * 0.57} cy={graphHeight / 2}
          rx={Math.max(80, size.width * (mobile ? 0.38 : 0.25))} ry={Math.max(80, graphHeight * (mobile ? 0.4 : 0.36))} />

        <g className="fx-node-master-wires">
          {activeNodes.map((node) => {
            const point = positions[node];
            const id = `master:${node}`;
            return point ? <path key={id} style={{ '--wire-color': FX_ROUTING_NODE_ACCENTS[node] } as React.CSSProperties}
              d={routePath(
                nodeOutput(point, routedNodeOutputOffsets.get(id)),
                masterInput(connectionOffsets.masterInput.get(id)),
                mobile ? mobileLaneOffsets.get(id) ?? 0 : desktopLaneOffsets.get(id) ?? 0,
                mobile,
              )} /> : null;
          })}
        </g>

        <g className="fx-node-source-wires">
          {sourceRoutes.map((route) => {
            const sourcePoint = sourcePositions[route.source.id];
            const target = positions[route.to];
            if (!sourcePoint || !target) return null;
            const laneOffset = mobile
              ? mobileLaneOffsets.get(`source:${route.id}`) ?? 0
              : desktopLaneOffsets.get(`source:${route.id}`) ?? 0;
            const anchorId = `source:${route.id}`;
            const d = routePath(
              sourceOutput(sourcePoint, connectionOffsets.sourceOutput.get(anchorId)),
              nodeInput(target, connectionOffsets.nodeInput.get(anchorId)),
              laneOffset,
              mobile,
            );
            return <g key={route.id} className="fx-node-wire source-wire" data-source-edge={route.id}
              style={{ '--wire-color': route.source.accent } as React.CSSProperties}>
              <path className="hover" d={d} />
              <path className="visible" d={d} style={{ opacity: 0.2 + route.amount * 0.4, strokeWidth: 1 + route.amount * 2 }} />
              {!readOnly && <path className="hit" d={d}
                onPointerDown={(event) => {
                  capturePointer(event);
                  lastWireDragMoved.current = false;
                  wireDrag.current = { kind: 'source', key: route.key, startY: event.clientY, startAmount: route.amount, moved: false, label: route.valueLabel };
                  setDragReadout({ x: event.clientX, y: event.clientY, value: route.amount, label: route.valueLabel });
                  clearSelection();
                }}
                onPointerUp={finishPointerInteraction}
                onPointerCancel={finishPointerInteraction}
                onClick={(event) => {
                  event.stopPropagation();
                  if (lastWireDragMoved.current) return;
                  clearSelection(); setSelectedSourceEdge(route.id); showPopup(event.clientX, event.clientY);
                }} />}
            </g>;
          })}
        </g>

        <g className="fx-node-wires">
          {graph.edges.filter((edge) => positions[edge.from] && positions[edge.to]).map((edge) => {
            const id = edgeId(edge);
            const anchorId = `edge:${id}`;
            const d = routePath(
              nodeOutput(positions[edge.from]!, routedNodeOutputOffsets.get(anchorId)),
              nodeInput(positions[edge.to]!, connectionOffsets.nodeInput.get(anchorId)),
              mobile ? mobileLaneOffsets.get(anchorId) ?? 0 : desktopLaneOffsets.get(anchorId) ?? 0,
              mobile,
            );
            return <g key={id} data-edge={id} data-from={edge.from} data-to={edge.to}
              style={{ '--wire-color': FX_ROUTING_NODE_ACCENTS[edge.from] } as React.CSSProperties}
              className={`fx-node-wire${edge.muted ? ' muted' : ''}`}>
              <path className="hover" d={d} />
              <path className="visible" d={d} style={{ strokeWidth: 1.25 + clampAmount(edge.amount) * 2.5 }} />
              {!readOnly && <path className="hit" d={d}
                onPointerDown={(event) => {
                  capturePointer(event);
                  lastWireDragMoved.current = false;
                  wireDrag.current = { kind: 'processor', id, startY: event.clientY, startAmount: edge.amount, moved: false, label: 'Send' };
                  setDragReadout({ x: event.clientX, y: event.clientY, value: edge.amount, label: 'Send' });
                  clearSelection();
                }}
                onPointerUp={finishPointerInteraction}
                onPointerCancel={finishPointerInteraction}
                onClick={(event) => {
                  event.stopPropagation();
                  if (lastWireDragMoved.current) return;
                  clearSelection(); setSelectedEdge(id); showPopup(event.clientX, event.clientY);
                }} />}
            </g>;
          })}
        </g>

        {!readOnly && (connectFrom || connectSource) && <g className="fx-node-ghost-wires">
          {activeNodes.flatMap((node) => {
            const target = positions[node];
            if (!target) return [];
            const locked = connectFrom
              ? connectFrom === node || !canEnableFxRoute(graph.edges, connectFrom, node)
              : !sourceTargetKey(connectSource!, node);
            if (locked || !connectionOrigin) return [];
            return <path key={`ghost:${node}`} d={routePath(connectionOrigin, nodeInput(target), 0, mobile)} />;
          })}
          {connectionOrigin && connectionPointer && <g className="fx-node-live-connection">
            <path d={routePath(connectionOrigin, connectionPointer.svg, 0, mobile)} />
            <circle cx={connectionPointer.svg.x} cy={connectionPointer.svg.y} r="5" />
          </g>}
        </g>}

        <g className="fx-journey-sources">
          {sourceRows.map((source) => {
            const point = sourcePositions[source.id]!;
            const level = clampAmount(Number(state[source.levelKey] ?? 0));
            const runtime = sliderProps?.(source.levelKey);
            const sourceConnections = sourceRoutes.filter((route) => route.source.id === source.id);
            return <g key={source.id} data-source={source.id} transform={`translate(${point.x} ${point.y})`}
              className="fx-source-pill" style={{ '--node-accent': source.accent, '--node-level': level } as React.CSSProperties}
              role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0}
              onPointerDown={(event) => beginConnection(event, { source: source.id })}
              onClick={(event) => {
                if (readOnly) return;
                event.stopPropagation(); clearSelection(); setSelectedSource(source.id); showPopup(event.clientX, event.clientY);
              }}>
              <rect className="halo" x={-SOURCE_WIDTH / 2 - 6} y={-SOURCE_HEIGHT / 2 - 5} width={SOURCE_WIDTH + 12} height={SOURCE_HEIGHT + 10} rx={(SOURCE_HEIGHT + 10) / 2} />
              <rect className="shell" x={-SOURCE_WIDTH / 2} y={-SOURCE_HEIGHT / 2} width={SOURCE_WIDTH} height={SOURCE_HEIGHT} rx={SOURCE_HEIGHT / 2} />
              <rect className="core" x={-SOURCE_WIDTH / 2 + 9} y={-SOURCE_HEIGHT / 2 + 7} width={SOURCE_WIDTH - 18} height={SOURCE_HEIGHT - 14} rx={(SOURCE_HEIGHT - 14) / 2} />
              <text className="icon" x={-SOURCE_WIDTH / 2 + 25} y="5" textAnchor="middle">{sourceSymbol(source)}</text>
              <text className="name" x={-SOURCE_WIDTH / 2 + 45} y="-3">{source.label}</text>
              <text className="value" x={-SOURCE_WIDTH / 2 + 45} y="14">
                <LiveParamValue paramKey={source.levelKey} value={level} runtime={runtime} />
              </text>
              {(sourceConnections.length > 0 ? sourceConnections : [{ id: `${source.id}:empty` }]).map((route) => {
                const id = `source:${route.id}`;
                const port = mobile
                  ? verticalEllipsePort(
                    { x: 0, y: 0 }, 1, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2,
                    connectionOffsets.sourceOutput.get(id),
                  )
                  : ellipsePort(
                    { x: 0, y: 0 }, 1, SOURCE_WIDTH / 2, SOURCE_HEIGHT / 2,
                    connectionOffsets.sourceOutput.get(id),
                  );
                return <circle key={id} cx={port.x} cy={port.y} r="3" className="port output route-port" />;
              })}
            </g>;
          })}
        </g>

        <g className="fx-journey-processors">
          {activeNodes.map((node) => {
            const point = positions[node]!;
            const primary = NODE_PRIMARY_CONTROLS[node];
            const level = clampAmount(Number(state[primary.key] ?? 0));
            const runtime = sliderProps?.(primary.key);
            const incomingIds = [
              ...sourceRoutes.filter((route) => route.to === node).map((route) => `source:${route.id}`),
              ...graph.edges.filter((edge) => edge.to === node && positions[edge.from]).map((edge) => `edge:${edgeId(edge)}`),
            ];
            const outgoingIds = [
              ...graph.edges.filter((edge) => edge.from === node && positions[edge.to]).map((edge) => `edge:${edgeId(edge)}`),
              `master:${node}`,
            ];
            const locked = connectFrom
              ? connectFrom === node || !canEnableFxRoute(graph.edges, connectFrom, node)
              : connectSource !== null && !sourceTargetKey(connectSource, node);
            return <g key={node} data-node={node} transform={`translate(${point.x} ${point.y})`}
              className={`fx-journey-node${locked ? ' locked' : ''}`}
              style={{ '--node-accent': FX_ROUTING_NODE_ACCENTS[node] } as React.CSSProperties}
              role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0}
              onPointerDown={(event) => beginConnection(event, { fx: node })}
              onClick={(event) => {
                if (readOnly) return;
                event.stopPropagation(); clearSelection(); setSelectedNode(node); showPopup(event.clientX, event.clientY);
              }}
              >
              <polygon className="glow" points={hexPoints(NODE_HALF_WIDTH + 5, NODE_HALF_HEIGHT + 4)} />
              <polygon className="body" points={hexPoints(NODE_HALF_WIDTH, NODE_HALF_HEIGHT)} />
              <polygon className="inner" points={hexPoints(NODE_HALF_WIDTH - 9, NODE_HALF_HEIGHT - 8)} />
              {(incomingIds.length > 0 ? incomingIds : [`${node}:empty-in`]).map((id) => {
                const port = mobile
                  ? verticalHexPort({ x: 0, y: 0 }, -1, connectionOffsets.nodeInput.get(id))
                  : hexPort({ x: 0, y: 0 }, -1, connectionOffsets.nodeInput.get(id));
                return <circle key={id} cx={port.x} cy={port.y} r="3" className="port input route-port" />;
              })}
              {outgoingIds.map((id) => {
                const port = mobile
                  ? verticalHexPort({ x: 0, y: 0 }, 1, routedNodeOutputOffsets.get(id))
                  : hexPort({ x: 0, y: 0 }, 1, routedNodeOutputOffsets.get(id));
                return <circle key={id} cx={port.x} cy={port.y} r="3" className="port output route-port" />;
              })}
              <text className="node-name" x="0" y="-3" textAnchor="middle">{LABELS[node]}</text>
              <text className="node-value" x="0" y="12" textAnchor="middle">
                <LiveParamValue paramKey={primary.key} value={level} runtime={runtime} />
              </text>
            </g>;
          })}
        </g>

        <g transform={`translate(${masterPosition.x} ${masterPosition.y})`} className="fx-journey-master"
          data-master-node="master"
          role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0}
          onClick={(event) => openMasterPopup('master', event.clientX, event.clientY)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            openMasterPopup('master', rect.left + rect.width / 2, rect.top + rect.height / 2);
          }}>
          <circle r={MASTER_RADIUS + 9} className="outer" />
          <circle r={MASTER_RADIUS} className="body" />
          <circle r={MASTER_RADIUS - 10} className="inner" />
          {(activeNodes.length > 0 ? activeNodes : ['empty']).map((node) => {
            const id = `master:${node}`;
            const port = mobile
              ? verticalEllipsePort(
                { x: 0, y: 0 }, -1, MASTER_RADIUS, MASTER_RADIUS,
                connectionOffsets.masterInput.get(id),
              )
              : ellipsePort(
                { x: 0, y: 0 }, -1, MASTER_RADIUS, MASTER_RADIUS,
                connectionOffsets.masterInput.get(id),
              );
            return <circle key={id} cx={port.x} cy={port.y} r="3" className="port input route-port" />;
          })}
          <text x="0" y="4" textAnchor="middle">MASTER</text>
          <text x="0" y={MASTER_RADIUS + 18} textAnchor="middle" className="sub">MASTER FX</text>
          <g className="fx-master-chain" transform={`translate(${-84} ${MASTER_RADIUS + 28})`}>
            <g className={masterSaturationActive ? 'active master-stage' : 'off master-stage'} role={readOnly ? undefined : 'button'}
              data-master-stage="saturation"
              tabIndex={readOnly ? undefined : 0} onClick={(event) => {
                event.stopPropagation(); openMasterPopup('masterSaturation', event.clientX, event.clientY);
              }} onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                openMasterPopup('masterSaturation', rect.left + rect.width / 2, rect.top + rect.height / 2);
              }}>
              <rect x="0" y="0" width="52" height="18" rx="9" />
              <text x="26" y="12" textAnchor="middle">SAT <LiveParamValue
                paramKey="masterSaturationDrive"
                value={Number(state.masterSaturationDrive ?? 0)}
                runtime={sliderProps?.('masterSaturationDrive')}
              /></text>
            </g>
            <text className="arrow" x="58" y="12">›</text>
            <g className={masterCompressionActive ? 'active master-stage' : 'off master-stage'} transform="translate(64 0)"
              data-master-stage="compression"
              role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0} onClick={(event) => {
                event.stopPropagation(); openMasterPopup('masterCompression', event.clientX, event.clientY);
              }} onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                openMasterPopup('masterCompression', rect.left + rect.width / 2, rect.top + rect.height / 2);
              }}>
              <rect x="0" y="0" width="52" height="18" rx="9" />
              <text x="26" y="12" textAnchor="middle">COMP</text>
            </g>
            <text className="arrow" x="122" y="12">›</text>
            <g className="active" transform="translate(128 0)">
              <rect x="0" y="0" width="40" height="18" rx="9" />
              <text x="20" y="12" textAnchor="middle">LIM</text>
            </g>
          </g>
        </g>
      </svg>

      {rackVisible && mobile && !selected && !selectedSourceRoute && !selectedNode && !selectedSourceDef && !selectedMaster
        && <button ref={rackToggleRef} type="button"
        className={`fx-node-rack-toggle${rackOpen ? ' open' : ''}`} aria-expanded={rackOpen} aria-controls="fx-node-mobile-rack"
        aria-label={`${rackOpen ? 'Close' : 'Open'} engines and FX, ${sourceRows.length} sound and ${activeFxCount} FX active`}
        onClick={() => setRackOpen((open) => !open)}>
        <span className="fx-node-rack-toggle-icon" aria-hidden="true"><span /><span /><span /></span>
      </button>}

      {rackVisible && mobile && rackOpen && <button type="button" className="fx-node-rack-backdrop"
        aria-label="Close engine and FX switches" onClick={closeRack} />}

      {rackVisible && (!mobile || rackOpen) && <div id={mobile ? 'fx-node-mobile-rack' : undefined}
        className={`fx-node-rack${mobile ? ' mobile-sheet' : ''}`}
        style={mobile && rackDragOffset > 0 ? { transform: `translateY(${-rackDragOffset}px)`, opacity: Math.max(0, 1 - rackDragOffset / 180) } : undefined}
        role={mobile ? 'region' : undefined} aria-labelledby={mobile ? 'fx-node-rack-title' : undefined}
        aria-label={mobile ? undefined : 'Engine and FX switches'}>
        {mobile && <div className="fx-node-rack-sheet-header">
          <div><strong id="fx-node-rack-title">Engines &amp; FX</strong>
            <span>{sourceRows.length} sound · {activeFxCount} FX active</span></div>
        </div>}
        <div className="fx-node-rack-row fx-rack-sources">
          <span className="fx-node-rack-label">Sound</span>
          <div className="fx-node-rack-items">
            {SOUND_SOURCES.map((source) => {
              const active = source.isEnabled(state);
              return <button key={source.id} type="button" className={active ? 'active' : ''} aria-pressed={active}
                aria-label={`${source.label}, ${active ? 'on' : 'off'}`}
                style={{ '--node-accent': source.accent } as React.CSSProperties}
                onClick={() => onToggleSource?.(source.id, !active)}>
                <span>{source.label}</span>
              </button>;
            })}
          </div>
        </div>
        <div className="fx-node-rack-row fx-rack-processors">
          <span className="fx-node-rack-label">FX</span>
          <div className="fx-node-rack-items">
            {FX_ROUTING_NODE_IDS.map((node) => {
              const active = activeNodeSet.has(node);
              return <button key={node} type="button" className={active ? 'active' : ''} aria-pressed={active}
                aria-label={`${LABELS[node]}, ${active ? 'on' : 'off'}`}
                style={{ '--node-accent': FX_ROUTING_NODE_ACCENTS[node] } as React.CSSProperties}
                onClick={() => onToggleFxNode?.(node, !active)}>
                <span>{LABELS[node]}</span>
              </button>;
            })}
            <button type="button" className={masterSaturationActive ? 'active' : ''}
              aria-pressed={masterSaturationActive}
              aria-label={`Master Saturation, ${masterSaturationActive ? 'on' : 'off'}`}
              style={{ '--node-accent': '#D69A62' } as React.CSSProperties}
              onClick={() => onBooleanParamChange?.('masterSaturationEnabled', !masterSaturationActive)}>
              <span>Master Sat</span>
            </button>
            <button type="button" className={masterCompressionActive ? 'active' : ''}
              aria-pressed={masterCompressionActive}
              aria-label={`Master Compression, ${masterCompressionActive ? 'on' : 'off'}`}
              style={{ '--node-accent': '#B8E0FF' } as React.CSSProperties}
              onClick={() => onBooleanParamChange?.('endCompEnabled', !masterCompressionActive)}>
              <span>Master Comp</span>
            </button>
          </div>
        </div>
        {mobile && <button type="button" className="fx-node-rack-drag-handle" aria-label="Close engine and FX switches"
          onClick={closeRack}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            startRackDrag(event.clientY);
          }}
          onPointerMove={(event) => {
            moveRackDrag(event.clientY);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            endRackDrag(event.clientY);
          }}
          onPointerCancel={() => { rackDragStart.current = null; rackDragOffsetRef.current = 0; setRackDragOffset(0); }}>
          <span aria-hidden="true" />
        </button>}
      </div>}

      {(dragReadout || ((connectFrom || connectSource) && connectionPointer)) && <div className="fx-drag-readout"
        style={{ left: (dragReadout?.x ?? connectionPointer!.client.x) + 14, top: (dragReadout?.y ?? connectionPointer!.client.y) - 14 }}>
        <span>{dragReadout?.label ?? 'Send'}</span>
        <strong>{Math.round((dragReadout?.value ?? 0.5) * 100)}%</strong>
      </div>}

      {!readOnly && (selected || selectedSourceRoute) && <div data-popup="true"
        tabIndex={-1}
        className={`fx-route-popup journey-popup route-control-popup${popupPoint.below ? ' below' : ''}`}
        style={{ left: popupPoint.x, top: popupPoint.y, '--node-accent': selectedRouteAccent } as React.CSSProperties}>
        <div className="fx-route-popup-title">
          <strong>{selected ? `${LABELS[selected.from]} → ${LABELS[selected.to]}` : `${selectedSourceRoute!.source.label} → ${LABELS[selectedSourceRoute!.to]}`}</strong>
        </div>
        {selectedSourceRoute ? <RuntimePopupSlider paramKey={selectedSourceRoute.key} runtime={selectedRuntime}
          label={selectedSourceRoute.valueLabel} value={selectedAmount} accent={selectedRouteAccent}
          mode={selectedMode} range={{ min: selectedMin, max: selectedMax }} onChange={updateSelectedAmount}
          onRangeChange={updateSelectedRange} onCycleMode={cycleRouteMode} />
          : <FxRoutePopupSlider edge={selected!} label="Send" value={selectedAmount} accent={selectedRouteAccent}
            mode={selectedMode} range={{ min: selectedMin, max: selectedMax }} onChange={updateSelectedAmount}
            onRangeChange={updateSelectedRange} onCycleMode={cycleRouteMode} />}
        <div className="fx-route-popup-actions">
          {selected && <button type="button" onClick={() => updateEdge(edgeId(selected), { muted: !selected.muted })}>{selected.muted ? 'Unmute' : 'Mute'}</button>}
          <button type="button" className="danger" onClick={() => {
            if (selected) setPresence(selected.from, selected.to, false);
            else if (selectedSourceRoute) onParamChange?.(selectedSourceRoute.disconnectKey, 0);
            setSelectedEdge(null); setSelectedSourceEdge(null);
          }}>Delete Connection</button>
          <button type="button" onClick={() => { setSelectedEdge(null); setSelectedSourceEdge(null); }}>Done</button>
        </div>
      </div>}

      {!readOnly && (selectedNode || selectedSourceDef) && <div data-popup="true"
        tabIndex={-1}
        className={`fx-route-popup journey-popup node-popup${popupPoint.below ? ' below' : ''}`}
        style={{ left: popupPoint.x, top: popupPoint.y, '--node-accent': selectedNode ? FX_ROUTING_NODE_ACCENTS[selectedNode] : selectedSourceDef!.accent } as React.CSSProperties}>
        <div className="fx-node-popup-title"><span />
          <strong>{selectedNode
            ? LABELS[selectedNode]
            : `${selectedSourceDef!.label}${selectedSynthPresetSource ? ` - ${synthPresetName(state, selectedSynthPresetSource)}` : ''}`}</strong>
          {selectedSynthPresetSource ? <button type="button" className="fx-node-preset-pool"
            title={`Edit ${selectedSourceDef!.label} preset pool`}
            aria-label={`Edit ${selectedSourceDef!.label} preset pool`}
            onClick={() => onOpenSynthPresetPool?.(selectedSynthPresetSource)}>{PRESET_POOL_ICON}</button> : <b><LiveParamValue paramKey={selectedPrimary!.key}
            value={Number(state[selectedPrimary!.key] ?? 0)} runtime={selectedPrimaryRuntime} />%</b>}
        </div>
        <RuntimePopupSlider paramKey={selectedPrimary!.key} runtime={selectedPrimaryRuntime}
          label={selectedPrimary!.label} value={Number(state[selectedPrimary!.key] ?? 0)}
          accent={selectedNode ? FX_ROUTING_NODE_ACCENTS[selectedNode] : selectedSourceDef!.accent}
          mode={selectedPrimaryRuntime?.mode ?? 'single'} range={selectedPrimaryRuntime?.dualRange}
          onChange={(amount) => onParamChange?.(selectedPrimary!.key, amount)}
          onRangeChange={(min, max) => selectedPrimaryRuntime?.onDualRangeChange?.(selectedPrimary!.key, min, max)}
          onCycleMode={() => selectedPrimaryRuntime?.onCycleMode?.(selectedPrimary!.key)} />
        {selectedIncoming.length > 0 && <div className="fx-node-popup-section">
          <div className="fx-route-popup-section-label">Receives</div>
          {selectedIncoming.map(routeSlider)}
        </div>}
        {selectedOutgoing.length > 0 && <div className="fx-node-popup-section">
          <div className="fx-route-popup-section-label">Sends</div>
          {selectedOutgoing.map(routeSlider)}
        </div>}
        {selectedIncoming.length === 0 && selectedOutgoing.length === 0 && <div className="fx-route-popup-meta">No active connections</div>}
        <div className="fx-route-popup-actions">
          <button type="button" className="danger" onClick={() => {
            if (selectedNode) onToggleFxNode?.(selectedNode, false);
            else if (selectedSourceDef) onToggleSource?.(selectedSourceDef.id, false);
            setSelectedNode(null); setSelectedSource(null);
          }}>Turn Off</button>
          <button type="button" onClick={() => { setSelectedNode(null); setSelectedSource(null); }}>Done</button>
        </div>
      </div>}

      {!readOnly && selectedMaster && <div data-popup="true"
        tabIndex={-1}
        className={`fx-route-popup journey-popup node-popup master-popup${popupPoint.below ? ' below' : ''}`}
        style={{
          left: popupPoint.x,
          top: popupPoint.y,
          '--node-accent': selectedMaster === 'masterSaturation' ? '#D69A62' : '#B8E0FF',
        } as React.CSSProperties}>
        <div className="fx-node-popup-title"><span />
          <strong>{selectedMaster === 'master'
            ? 'Master'
            : selectedMaster === 'masterSaturation' ? 'Master Saturation' : 'Master Compression'}</strong>
          {selectedMaster === 'masterSaturation' && <b><LiveParamValue
            paramKey="masterSaturationDrive" value={Number(state.masterSaturationDrive ?? 0)}
            runtime={sliderProps?.('masterSaturationDrive')} />%</b>}
          {selectedMaster === 'masterCompression' && <b><LiveParamValue
            paramKey="endCompMix" value={Number(state.endCompMix ?? 0)}
            runtime={sliderProps?.('endCompMix')} />%</b>}
        </div>

        {selectedMaster === 'master' && <>
          <div className="fx-route-popup-meta">
            All active sound engines and FX returns meet here, then pass through Master Saturation, Master Compression, and the safety limiter.
          </div>
          {sourceRows.length > 0 && <div className="fx-node-popup-section">
            <div className="fx-route-popup-section-label">Sound inputs</div>
            {sourceRows.map((source) => paramSlider(source.levelKey, source.label, source.accent))}
          </div>}
          {activeNodes.length > 0 && <div className="fx-node-popup-section">
            <div className="fx-route-popup-section-label">FX returns</div>
            {activeNodes.map((node) => {
              const control = NODE_PRIMARY_CONTROLS[node];
              return paramSlider(control.key, LABELS[node], FX_ROUTING_NODE_ACCENTS[node]);
            })}
          </div>}
        </>}

        {selectedMaster === 'masterSaturation' && <>
          <div className="fx-master-popup-info">
            <span>Color <b>{state.masterSaturationMode}</b></span>
            <span>Quality <b>{state.masterSaturationQuality}</b></span>
            <span>Position <b>Before compression</b></span>
          </div>
          <div className="fx-route-popup-meta">
            Colors the complete mix with the same processing and controls as the modular Saturator, while retaining independent audio memory.
          </div>
          <div className="fx-node-popup-section">
            {paramSlider('masterSaturationDrive', 'Drive', '#D69A62')}
            {paramSlider('masterSaturationTone', 'Tone', '#D69A62')}
            {paramSlider('masterSaturationBias', 'Bias', '#D69A62')}
          </div>
        </>}

        {selectedMaster === 'masterCompression' && <>
          <div className="fx-master-popup-info">
            <span>Mode <b>{state.endCompMode}</b></span>
            <span>Threshold <b>{Number(state.endCompThreshold).toFixed(1)} dB</b></span>
            <span>Ratio <b>{Number(state.endCompRatio).toFixed(1)}:1</b></span>
            <span>Timing <b>{Math.round(Number(state.endCompAttackMs))} / {Math.round(Number(state.endCompReleaseMs))} ms</b></span>
          </div>
          <div className="fx-route-popup-meta">
            Glues the complete mix after Master Saturation and before the final safety limiter.
          </div>
          <div className="fx-node-popup-section">
            {paramSlider('endCompMix', 'Dry / Wet', '#B8E0FF')}
            {paramSlider('endCompClarity', 'Clarity', '#B8E0FF')}
          </div>
        </>}

        <div className="fx-route-popup-actions">
          {selectedMaster === 'masterSaturation' && <button type="button" className="danger" onClick={() => {
            onBooleanParamChange?.('masterSaturationEnabled', false); setSelectedMaster(null);
          }}>Turn Off</button>}
          {selectedMaster === 'masterCompression' && <button type="button" className="danger" onClick={() => {
            onBooleanParamChange?.('endCompEnabled', false); setSelectedMaster(null);
          }}>Turn Off</button>}
          <button type="button" onClick={() => setSelectedMaster(null)}>Done</button>
        </div>
      </div>}
    </div>
  );
}
