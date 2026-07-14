import type { ReactiveVisualizerControls } from './ReactiveVisualizerRenderer';

export type VisualizerLayerId = 'shapes' | 'atmosphere' | 'glitch' | 'kaleidoscope' | 'pointCloud';

export type VisualizerQualityMode = 'auto' | 'mobileSafe' | 'desktopBeauty';

export type VisualizerPerformanceMacroId = 'soft' | 'pulse' | 'particles' | 'glitch' | 'bright';
export type VisualizerLayerMacroId =
  | 'formation'
  | 'weather'
  | 'fragmentation'
  | 'symmetry'
  | 'material'
  | 'age'
  | 'depth';

export interface VisualizerLayerDefinition {
  id: VisualizerLayerId;
  label: string;
  shortLabel: string;
  description: string;
  kind: 'source' | 'effect';
}

export interface VisualizerPerformanceMacros {
  soft: number;
  pulse: number;
  particles: number;
  glitch: number;
  bright: number;
}

export type VisualizerLayerMacros = Record<VisualizerLayerMacroId, number>;

export const VISUALIZER_LAYER_DEFS: VisualizerLayerDefinition[] = [
  {
    id: 'shapes',
    label: 'Shapes',
    shortLabel: 'Shapes',
    kind: 'source',
    description: 'Orb/SDF layer driven by synth, lead, and impact energy.',
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    shortLabel: 'Atmos',
    kind: 'source',
    description: 'Nebula/aurora field driven by pad, reverb, delay, and earth.',
  },
  {
    id: 'glitch',
    label: 'Glitch',
    shortLabel: 'Glitch',
    kind: 'effect',
    description: 'Transforms source layers positioned below it in the single-pass effect stack.',
  },
  {
    id: 'kaleidoscope',
    label: 'Kaleidoscope',
    shortLabel: 'Kaleido',
    kind: 'effect',
    description: 'Folds source layers positioned below it in the single-pass effect stack.',
  },
  {
    id: 'pointCloud',
    label: 'Point Cloud',
    shortLabel: 'Points',
    kind: 'effect',
    description: 'Converts source layers positioned below it into dots.',
  },
];

export const DEFAULT_LAYER_STACK: VisualizerLayerId[] = [
  'shapes',
  'atmosphere',
  'glitch',
  'kaleidoscope',
  'pointCloud',
];

export const DEFAULT_VISUALIZER_MACROS: VisualizerPerformanceMacros = {
  soft: 0.5,
  pulse: 0.5,
  particles: 0.5,
  glitch: 0.5,
  bright: 0.5,
};

export const DEFAULT_VISUALIZER_LAYER_MACROS: VisualizerLayerMacros = {
  formation: 0.5,
  weather: 0.5,
  fragmentation: 0.5,
  symmetry: 0.5,
  material: 0.5,
  age: 0.5,
  depth: 0.5,
};

const LAYER_TO_INDEX: Record<VisualizerLayerId, number> = {
  shapes: 0,
  atmosphere: 1,
  glitch: 2,
  kaleidoscope: 3,
  pointCloud: 4,
};

const INDEX_TO_LAYER: VisualizerLayerId[] = [
  'shapes',
  'atmosphere',
  'glitch',
  'kaleidoscope',
  'pointCloud',
];

export function clampBipolar(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeLayerOrder(order: readonly number[] | undefined): number[] {
  const layerCount = DEFAULT_LAYER_STACK.length;
  const taken = new Set<number>();
  const next = new Array(layerCount).fill(0);

  for (let index = 0; index < layerCount; index += 1) {
    const fallback = index;
    const raw = order?.[index] ?? fallback;
    let position = Number.isFinite(raw) ? Math.round(raw) : fallback;
    position = Math.max(0, Math.min(layerCount - 1, position));

    while (taken.has(position) && position < layerCount - 1) position += 1;
    while (taken.has(position) && position > 0) position -= 1;
    if (taken.has(position)) {
      position = Array.from({ length: layerCount }, (_, candidate) => candidate)
        .find((candidate) => !taken.has(candidate)) ?? fallback;
    }

    next[index] = position;
    taken.add(position);
  }

  return next;
}

export function stackToLayerOrder(stack: readonly VisualizerLayerId[]): number[] {
  const normalizedStack: VisualizerLayerId[] = [];

  for (const layer of stack) {
    if (!DEFAULT_LAYER_STACK.includes(layer)) continue;
    if (normalizedStack.includes(layer)) continue;
    normalizedStack.push(layer);
  }

  for (const layer of DEFAULT_LAYER_STACK) {
    if (!normalizedStack.includes(layer)) normalizedStack.push(layer);
  }

  const order = new Array(DEFAULT_LAYER_STACK.length).fill(0);
  normalizedStack.forEach((layer, position) => {
    order[LAYER_TO_INDEX[layer]] = position;
  });
  return normalizeLayerOrder(order);
}

export function layerOrderToStack(order: readonly number[] | undefined): VisualizerLayerId[] {
  const normalized = normalizeLayerOrder(order);
  return INDEX_TO_LAYER
    .map((id, index) => ({ id, position: normalized[index] ?? index }))
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.id);
}

export function moveLayerInStack(
  stack: readonly VisualizerLayerId[],
  layer: VisualizerLayerId,
  direction: -1 | 1,
): VisualizerLayerId[] {
  const next = [...stack];
  const index = next.indexOf(layer);
  if (index < 0) return [...DEFAULT_LAYER_STACK];

  const target = Math.max(0, Math.min(next.length - 1, index + direction));
  if (target === index) return next;

  next.splice(index, 1);
  next.splice(target, 0, layer);
  return next;
}

export function updateControlsPatch(
  previous: ReactiveVisualizerControls,
  patch: Partial<ReactiveVisualizerControls>,
): ReactiveVisualizerControls {
  return {
    ...previous,
    ...patch,
    layerOrder: normalizeLayerOrder(patch.layerOrder ?? previous.layerOrder),
  };
}
