import { clampEuclideanTriggerSteps } from './sequencerLimits';

export type TriggerClipOrigin =
  | 'euclidean'
  | 'scatter'
  | 'recorded'
  | 'manual'
  | 'preset'
  | 'legacy';

export type TriggerGeneratorRef =
  | {
      kind: 'euclidean';
      preset: string;
      steps: number;
      hits: number;
      rotation: number;
    }
  | {
      kind: 'scatter';
      phraseId: string;
      seed: number;
      engine: string;
      feelX: number;
      feelY: number;
      chaos: number;
      label: string;
    }
  | {
      kind: 'recorded';
      takeId: string;
      quantize: number;
    }
  | {
      kind: 'manual';
    };

export interface TriggerClip {
  steps: number;
  basePattern: boolean[];
  edits: Map<number, boolean>;
  origin: TriggerClipOrigin;
  generator: TriggerGeneratorRef | null;
  dirty: boolean;
  label?: string;
}

export interface SerializedTriggerClip {
  steps: number;
  basePattern: boolean[];
  edits?: { step: number; value: boolean }[];
  origin: TriggerClipOrigin;
  generator?: TriggerGeneratorRef | null;
  dirty?: boolean;
  label?: string;
}

function cloneGenerator(generator: TriggerGeneratorRef | null | undefined): TriggerGeneratorRef | null {
  if (!generator) return null;
  return { ...generator } as TriggerGeneratorRef;
}

function isTriggerClipOrigin(value: unknown): value is TriggerClipOrigin {
  return value === 'euclidean'
    || value === 'scatter'
    || value === 'recorded'
    || value === 'manual'
    || value === 'preset'
    || value === 'legacy';
}

function positiveModulo(value: number, divisor: number): number {
  const safeDivisor = Math.max(1, Math.round(divisor));
  return ((Math.round(value) % safeDivisor) + safeDivisor) % safeDivisor;
}

function rotateArray<T>(values: readonly T[], delta: number): T[] {
  if (values.length <= 1) return [...values];
  const shift = positiveModulo(delta, values.length);
  return values.map((_, index) => values[positiveModulo(index - shift, values.length)]!);
}

function cloneEditMap(edits: Map<number, boolean> | undefined, steps: number): Map<number, boolean> {
  const next = new Map<number, boolean>();
  if (!edits) return next;
  for (const [step, value] of edits) {
    if (Number.isInteger(step) && step >= 0 && step < steps) {
      next.set(step, Boolean(value));
    }
  }
  return next;
}

export function clampStepCount(value: number): number {
  return clampEuclideanTriggerSteps(value);
}

export function normalizeBasePattern(bits: boolean[], steps: number): boolean[] {
  const safeSteps = clampStepCount(steps);
  return Array.from({ length: safeSteps }, (_, index) => Boolean(bits[index]));
}

export function serializeTriggerClip(clip: TriggerClip | null): SerializedTriggerClip | null {
  if (!clip) return null;
  const steps = clampStepCount(clip.steps);
  const edits = [...clip.edits.entries()]
    .filter(([step]) => Number.isInteger(step) && step >= 0 && step < steps)
    .sort(([left], [right]) => left - right)
    .map(([step, value]) => ({ step, value: Boolean(value) }));
  return {
    steps,
    basePattern: normalizeBasePattern(clip.basePattern, steps),
    ...(edits.length ? { edits } : {}),
    origin: clip.origin,
    generator: cloneGenerator(clip.generator),
    dirty: clip.dirty === true,
    ...(clip.label ? { label: clip.label } : {}),
  };
}

export function deserializeTriggerClip(serialized: SerializedTriggerClip | null | undefined): TriggerClip | null {
  if (!serialized || typeof serialized !== 'object') return null;
  const steps = clampStepCount(Number(serialized.steps));
  const edits = new Map<number, boolean>();
  if (Array.isArray(serialized.edits)) {
    for (const edit of serialized.edits) {
      if (!edit || typeof edit !== 'object') continue;
      const step = (edit as { step?: unknown }).step;
      const value = (edit as { value?: unknown }).value;
      if (typeof step === 'number' && Number.isInteger(step) && step >= 0 && step < steps) {
        edits.set(step, Boolean(value));
      }
    }
  }
  return {
    steps,
    basePattern: normalizeBasePattern(Array.isArray(serialized.basePattern) ? serialized.basePattern : [], steps),
    edits,
    origin: isTriggerClipOrigin(serialized.origin) ? serialized.origin : 'legacy',
    generator: cloneGenerator(serialized.generator),
    dirty: serialized.dirty === true || edits.size > 0,
    ...(typeof serialized.label === 'string' && serialized.label.trim() ? { label: serialized.label } : {}),
  };
}

export function resolveTriggerClip(clip: TriggerClip): boolean[] {
  const base = normalizeBasePattern(clip.basePattern, clip.steps);
  for (const [step, value] of clip.edits) {
    if (Number.isInteger(step) && step >= 0 && step < base.length) {
      base[step] = Boolean(value);
    }
  }
  return base;
}

export function countTriggerHits(clip: TriggerClip): number {
  return resolveTriggerClip(clip).reduce((count, enabled) => count + (enabled ? 1 : 0), 0);
}

export function setTriggerClipStep(clip: TriggerClip, step: number, value: boolean): TriggerClip {
  const steps = clampStepCount(clip.steps);
  const safeStep = positiveModulo(step, steps);
  const base = normalizeBasePattern(clip.basePattern, steps);
  const edits = cloneEditMap(clip.edits, steps);
  const nextValue = Boolean(value);
  if ((base[safeStep] ?? false) === nextValue) {
    edits.delete(safeStep);
  } else {
    edits.set(safeStep, nextValue);
  }
  return {
    ...clip,
    steps,
    basePattern: base,
    edits,
    dirty: edits.size > 0,
  };
}

export function toggleTriggerClipStep(clip: TriggerClip, step: number): TriggerClip {
  const resolved = resolveTriggerClip(clip);
  const safeStep = positiveModulo(step, resolved.length);
  return setTriggerClipStep(clip, safeStep, !resolved[safeStep]);
}

export function flattenTriggerClipEdits(clip: TriggerClip): TriggerClip {
  return {
    ...clip,
    steps: clampStepCount(clip.steps),
    basePattern: resolveTriggerClip(clip),
    edits: new Map(),
    dirty: false,
  };
}

export function flattenTriggerClipToManual(clip: TriggerClip, label = 'Step'): TriggerClip {
  const flattened = flattenTriggerClipEdits(clip);
  return {
    ...flattened,
    origin: 'manual',
    generator: { kind: 'manual' },
    label,
  };
}

export function retagTriggerClipAsEuclidean(clip: TriggerClip, preset = 'custom', label = 'Euclid'): TriggerClip {
  const flattened = flattenTriggerClipEdits(clip);
  const hits = countTriggerHits(flattened);
  return {
    ...flattened,
    origin: 'euclidean',
    generator: {
      kind: 'euclidean',
      preset,
      steps: flattened.steps,
      hits,
      rotation: 0,
    },
    label,
  };
}

export function rotateTriggerClip(clip: TriggerClip, delta: number): TriggerClip {
  const flattened = flattenTriggerClipEdits(clip);
  const basePattern = rotateArray(flattened.basePattern, delta);
  const generator = flattened.generator?.kind === 'euclidean'
    ? {
        ...flattened.generator,
        rotation: positiveModulo(flattened.generator.rotation + delta, flattened.steps),
      }
    : flattened.generator;
  return {
    ...flattened,
    basePattern,
    generator,
  };
}

export function resizeTriggerClip(clip: TriggerClip, steps: number): TriggerClip {
  const safeSteps = clampStepCount(steps);
  const basePattern = normalizeBasePattern(resolveTriggerClip(clip), safeSteps);
  const generator = clip.generator?.kind === 'euclidean'
    ? {
        ...clip.generator,
        steps: safeSteps,
        hits: Math.min(clip.generator.hits, safeSteps),
        rotation: positiveModulo(clip.generator.rotation, safeSteps),
      }
    : clip.generator;
  return {
    ...clip,
    steps: safeSteps,
    basePattern,
    edits: new Map(),
    generator,
    dirty: false,
  };
}

export function createBitmapTriggerClip(args: {
  steps: number;
  bits: boolean[];
  origin: TriggerClipOrigin;
  generator?: TriggerGeneratorRef | null;
  label?: string;
}): TriggerClip {
  const steps = clampStepCount(args.steps);
  return {
    steps,
    basePattern: normalizeBasePattern(args.bits, steps),
    edits: new Map(),
    origin: args.origin,
    generator: cloneGenerator(args.generator),
    dirty: false,
    ...(args.label ? { label: args.label } : {}),
  };
}
