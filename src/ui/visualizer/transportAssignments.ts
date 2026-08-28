import {
  TRANSPORT_CONTROL_DEFINITIONS,
  type TransportControlKey,
  type TransportControls,
  type ReadonlyTransportControls,
} from './visualizerTransportSchema';
import type { VisualizerPulseKey } from './visualizerSignals';
import type { VisualizerTelemetrySignal } from './visualizerTelemetry';

export const TRANSPORT_ASSIGNMENT_MAX_ROUTES = 24;

export const TRANSPORT_ASSIGNMENT_SOURCES = [
  'global',
  'synth',
  'pad',
  'lead',
  'drums',
  'earth',
  'granular',
  'delay',
  'reverb',
  'dynamics',
  'sequencer',
] as const satisfies readonly VisualizerPulseKey[];

export const TRANSPORT_ASSIGNMENT_SIGNALS = [
  'level',
  'transient',
  'density',
  'phase',
] as const satisfies readonly VisualizerTelemetrySignal[];

export const TRANSPORT_ASSIGNMENT_SOURCE_KEYS = TRANSPORT_ASSIGNMENT_SOURCES;
export const TRANSPORT_ASSIGNMENT_SIGNAL_KEYS = TRANSPORT_ASSIGNMENT_SIGNALS;
export const TRANSPORT_ASSIGNMENT_SIGNAL_COUNT = TRANSPORT_ASSIGNMENT_SIGNALS.length;

export type TransportAssignmentPolarity = 'unipolar' | 'bipolar';

export interface TransportAssignment {
  readonly id: string;
  readonly source: VisualizerPulseKey;
  readonly signal: VisualizerTelemetrySignal;
  readonly target: TransportControlKey;
  readonly amount: number;
  readonly polarity: TransportAssignmentPolarity;
  readonly enabled: boolean;
}

export interface CompiledTransportAssignments {
  readonly routeCount: number;
  readonly sourceSignalIndex: Uint16Array;
  readonly targetIndex: Uint8Array;
  readonly amount: Float32Array;
  /** 0 = unipolar, 1 = bipolar. */
  readonly polarity: Uint8Array;
  readonly enabled: Uint8Array;
}

const MAX_ASSIGNMENT_ID_LENGTH = 48;
const BLOCKED_REACTIVE_TARGETS = new Set<TransportControlKey>([
  'medium', 'hybrid', 'react', 'octaves', 'churn', 'drift', 'flutter', 'layers',
  'leafTiers', 'apShape', 'apBars', 'sunTaps', 'waterLayering', 'foldType', 'segments',
]);

export function isTransportAssignmentTarget(value: unknown): value is TransportControlKey {
  return typeof value === 'string' && !BLOCKED_REACTIVE_TARGETS.has(value as TransportControlKey)
    && TRANSPORT_CONTROL_DEFINITIONS.some((definition) => definition.key === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sourceIndex(value: unknown): number {
  for (let index = 0; index < TRANSPORT_ASSIGNMENT_SOURCES.length; index += 1) {
    if (TRANSPORT_ASSIGNMENT_SOURCES[index]! === value) return index;
  }
  return -1;
}

function signalIndex(value: unknown): number {
  for (let index = 0; index < TRANSPORT_ASSIGNMENT_SIGNALS.length; index += 1) {
    if (TRANSPORT_ASSIGNMENT_SIGNALS[index]! === value) return index;
  }
  return -1;
}

function targetIndex(value: unknown): number {
  if (!isTransportAssignmentTarget(value)) return -1;
  for (let index = 0; index < TRANSPORT_CONTROL_DEFINITIONS.length; index += 1) {
    if (TRANSPORT_CONTROL_DEFINITIONS[index]!.key === value) return index;
  }
  return -1;
}

export interface TransportAssignmentSmoothingState {
  readonly delta: Float32Array;
  lastTimeMs: number;
}

export function createTransportAssignmentSmoothingState(): TransportAssignmentSmoothingState {
  return { delta: new Float32Array(TRANSPORT_CONTROL_DEFINITIONS.length), lastTimeMs: Number.NaN };
}

export function smoothTransportAssignmentControls(
  state: TransportAssignmentSmoothingState,
  base: ReadonlyTransportControls,
  mapped: ReadonlyTransportControls,
  timeMs: number,
  output: TransportControls,
): TransportControls {
  const elapsed = Number.isFinite(state.lastTimeMs) && Number.isFinite(timeMs)
    ? Math.max(0, Math.min(100, timeMs - state.lastTimeMs)) * 0.001
    : 0;
  state.lastTimeMs = Number.isFinite(timeMs) ? timeMs : state.lastTimeMs;
  for (let index = 0; index < TRANSPORT_CONTROL_DEFINITIONS.length; index += 1) {
    const definition = TRANSPORT_CONTROL_DEFINITIONS[index]!;
    const baseValue = clamp(base[definition.key], definition.min, definition.max);
    const target = isTransportAssignmentTarget(definition.key)
      ? clamp(mapped[definition.key], definition.min, definition.max) - baseValue
      : 0;
    const current = state.delta[index] ?? 0;
    const tau = Math.abs(target) > Math.abs(current) ? 0.14 : 0.42;
    const next = current + (target - current) * (elapsed > 0 ? 1 - Math.exp(-elapsed / tau) : 0);
    state.delta[index] = Math.abs(next) < 0.000001 ? 0 : next;
    output[definition.key] = clamp(baseValue + next, definition.min, definition.max);
  }
  return output;
}

function normalizeId(value: unknown, fallback: number, used: Set<string>): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const normalized = raw
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ASSIGNMENT_ID_LENGTH);
  const base = normalized || `route-${fallback}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    const suffixText = `-${suffix}`;
    id = `${base.slice(0, Math.max(1, MAX_ASSIGNMENT_ID_LENGTH - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

export function sanitizeTransportAssignments(value: unknown): TransportAssignment[] {
  if (!Array.isArray(value)) return [];
  const result: TransportAssignment[] = [];
  const usedIds = new Set<string>();
  for (let index = 0; index < value.length && result.length < TRANSPORT_ASSIGNMENT_MAX_ROUTES; index += 1) {
    const input = value[index];
    if (!isRecord(input)) continue;
    if (sourceIndex(input.source) < 0 || signalIndex(input.signal) < 0 || targetIndex(input.target) < 0) continue;
    const rawAmount = input.amount;
    const amount = typeof rawAmount === 'number' && Number.isFinite(rawAmount)
      ? clamp(rawAmount, -1, 1)
      : 0;
    result.push({
      id: normalizeId(input.id, result.length + 1, usedIds),
      source: input.source as VisualizerPulseKey,
      signal: input.signal as VisualizerTelemetrySignal,
      target: input.target as TransportControlKey,
      amount,
      polarity: input.polarity === 'bipolar' ? 'bipolar' : 'unipolar',
      enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    });
  }
  return result;
}

export function compileTransportAssignments(
  assignments: readonly TransportAssignment[],
): CompiledTransportAssignments {
  const sourceSignalIndex = new Uint16Array(TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  const targetIndices = new Uint8Array(TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  const amounts = new Float32Array(TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  const polarities = new Uint8Array(TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  const enabled = new Uint8Array(TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  let routeCount = 0;

  for (let index = 0; index < assignments.length && routeCount < TRANSPORT_ASSIGNMENT_MAX_ROUTES; index += 1) {
    const assignment = assignments[index];
    if (!assignment) continue;
    const source = sourceIndex(assignment.source);
    const signal = signalIndex(assignment.signal);
    const target = targetIndex(assignment.target);
    if (source < 0 || signal < 0 || target < 0) continue;
    sourceSignalIndex[routeCount] = source * TRANSPORT_ASSIGNMENT_SIGNAL_COUNT + signal;
    targetIndices[routeCount] = target;
    amounts[routeCount] = Number.isFinite(assignment.amount) ? clamp(assignment.amount, -1, 1) : 0;
    polarities[routeCount] = assignment.polarity === 'bipolar' ? 1 : 0;
    enabled[routeCount] = assignment.enabled ? 1 : 0;
    routeCount += 1;
  }

  return {
    routeCount,
    sourceSignalIndex,
    targetIndex: targetIndices,
    amount: amounts,
    polarity: polarities,
    enabled,
  };
}

export function evaluateTransportAssignments(
  compiled: CompiledTransportAssignments,
  baseControls: ReadonlyTransportControls,
  signals: Float32Array,
  output: TransportControls,
): TransportControls {
  for (let index = 0; index < TRANSPORT_CONTROL_DEFINITIONS.length; index += 1) {
    const definition = TRANSPORT_CONTROL_DEFINITIONS[index]!;
    const baseValue = baseControls[definition.key];
    output[definition.key] = Number.isFinite(baseValue)
      ? clamp(baseValue, definition.min, definition.max)
      : definition.defaultValue;
  }

  const routeCount = Math.min(compiled.routeCount, TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  for (let index = 0; index < routeCount; index += 1) {
    if (!compiled.enabled[index]) continue;
    const targetIndexValue = compiled.targetIndex[index];
    const target = targetIndexValue === undefined
      ? undefined
      : TRANSPORT_CONTROL_DEFINITIONS[targetIndexValue];
    if (!target) continue;
    const signalIndexValue = compiled.sourceSignalIndex[index];
    const rawSignalValue = signalIndexValue !== undefined && signalIndexValue < signals.length
      ? signals[signalIndexValue]
      : 0;
    const rawSignal = typeof rawSignalValue === 'number' ? rawSignalValue : 0;
    let normalizedSignal = Number.isFinite(rawSignal) ? clamp(rawSignal, 0, 1) : 0;
    if (compiled.polarity[index]) normalizedSignal = normalizedSignal * 2 - 1;
    output[target.key] += normalizedSignal * (compiled.amount[index] ?? 0) * (target.max - target.min);
  }

  for (let index = 0; index < TRANSPORT_CONTROL_DEFINITIONS.length; index += 1) {
    const definition = TRANSPORT_CONTROL_DEFINITIONS[index]!;
    const clamped = clamp(output[definition.key], definition.min, definition.max);
    output[definition.key] = definition.step === 1 ? Math.round(clamped) : clamped;
  }
  return output;
}
