import type { DualSliderRange } from '../DualSlider';
import type { SliderPageId } from '../sliderHelpCatalog';
import type { MatrixCellHandle, SliderRuntimeRendererProps } from '../sliderSystem';
import type { SliderMode, SliderState } from '../state';
import type { FxRoutingGraphState, FxRoutingNodeId } from '../routing/fxRoutingGraph';

export type SliderColumnId = 'level' | 'delayA' | 'delayB' | 'granular' | 'degrade' | 'freeze' | 'reverb';
export type ColumnId = SliderColumnId | 'dynamics';
export type CellHandle = MatrixCellHandle;
export interface RouteControl { key: keyof SliderState; label: string }
export interface MatrixCell { kind: 'editable' | 'self' | 'blocked' | 'fx'; route?: RouteControl; fxRoute?: readonly [FxRoutingNodeId, FxRoutingNodeId]; note?: string }
export interface MatrixRow {
  id: string; label: string; accent: string; note?: string; sourceToggle?: 'toggle' | 'disable-only';
  earthFamily?: 'water' | 'insects' | 'nature'; childToggleId?: string;
  fxNodeId?: FxRoutingNodeId;
  cells: Record<SliderColumnId, MatrixCell>;
}
export interface RoutingColumn { id: ColumnId; label: string; helpKey: string; note?: string }
export interface DynamicsRouteControl { key: keyof SliderState; label: string }
export type RoutingSliderRuntime = SliderRuntimeRendererProps<keyof SliderState>;
export interface ColumnDragTarget {
  key: keyof SliderState; mode: SliderMode; startValue: number; startRange?: DualSliderRange;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}
export interface ColumnDragMemoryTarget {
  key: keyof SliderState; mode: SliderMode; startValue: number; startRange?: DualSliderRange;
}
export interface ColumnDragMemory { targets: ColumnDragMemoryTarget[]; lastDelta: number }
export interface CellDragState {
  kind: 'cell'; dragId: string; pointerId: number; key: keyof SliderState; mode: SliderMode;
  handle: CellHandle; startValue: number; startRange?: DualSliderRange; startPointerNorm: number;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  lastValue?: number; lastRange?: DualSliderRange;
}
export interface PendingCellTouchState {
  pointerId: number; dragId: string; startX: number; startY: number; key: keyof SliderState;
  mode: SliderMode; handle: CellHandle; startValue: number; startRange?: DualSliderRange;
  startPointerNorm: number;
  onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
}
export interface ColumnDragState {
  kind: 'column'; columnId: ColumnId; dragId: string; pointerId: number; startClientX: number;
  targets: ColumnDragTarget[]; currentDelta: number;
  lastValues: Partial<Record<keyof SliderState, number>>;
  lastRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
}
export type DragState = CellDragState | ColumnDragState;
export interface RoutingMatrixProps {
  state: SliderState; isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onColumnParamChange?: (key: keyof SliderState, value: number) => void;
  onToggleSource?: (sourceId: string, enabled: boolean) => void;
  sliderProps: (paramKey: keyof SliderState) => RoutingSliderRuntime;
  helpPage?: SliderPageId;
  fxRoutingGraph: FxRoutingGraphState;
  onFxRoutingGraphChange: (graph: FxRoutingGraphState) => void;
}
