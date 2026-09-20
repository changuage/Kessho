import type { VisualizerPulseKey } from './visualizerSignals';
import {
  readProductInteractionVisualizerSignal,
  resetProductInteractionSignalSnapshot,
} from '../../audio/productInteractionSignalStore';

export type VisualizerTelemetrySignal = 'level' | 'transient' | 'density' | 'phase';

const CHANNELS: VisualizerPulseKey[] = [
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
];

const CHANNEL_INDEX: Record<VisualizerPulseKey, number> = {
  global: 0,
  synth: 1,
  pad: 2,
  lead: 3,
  drums: 4,
  earth: 5,
  granular: 6,
  delay: 7,
  reverb: 8,
  dynamics: 9,
  sequencer: 10,
};

const SIGNAL_INDEX: Record<VisualizerTelemetrySignal, number> = {
  level: 0,
  transient: 1,
  density: 2,
  phase: 3,
};

const SIGNAL_COUNT = 4;
const values = new Float32Array(CHANNELS.length * SIGNAL_COUNT);
const updatedAt = new Float64Array(CHANNELS.length * SIGNAL_COUNT);
const valid = new Uint8Array(CHANNELS.length * SIGNAL_COUNT);

function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function offset(channel: VisualizerPulseKey, signal: VisualizerTelemetrySignal): number {
  return CHANNEL_INDEX[channel] * SIGNAL_COUNT + SIGNAL_INDEX[signal];
}

export function publishVisualizerTelemetrySignal(
  channel: VisualizerPulseKey,
  signal: VisualizerTelemetrySignal,
  value: number,
  at = nowMs(),
): void {
  const index = offset(channel, signal);
  values[index] = clamp01(value);
  updatedAt[index] = at;
  valid[index] = 1;
}

export function publishVisualizerTransient(
  channel: VisualizerPulseKey,
  amount: number,
  at = nowMs(),
): void {
  const index = offset(channel, 'transient');
  const elapsed = Math.max(0, at - (updatedAt[index] ?? 0));
  const current = valid[index] ? (values[index] ?? 0) * Math.exp(-elapsed / 520) : 0;
  values[index] = clamp01(current + Math.max(0, amount));
  updatedAt[index] = at;
  valid[index] = 1;
}

export function readVisualizerTelemetrySignal(
  channel: VisualizerPulseKey,
  signal: VisualizerTelemetrySignal,
  at = nowMs(),
): number | null {
  const interactionValue = readProductInteractionVisualizerSignal(channel, signal, at);
  const index = offset(channel, signal);
  if (!valid[index]) return interactionValue;
  const elapsed = Math.max(0, at - (updatedAt[index] ?? 0));
  const value = values[index] ?? 0;
  if (signal === 'phase') return value;
  if (signal === 'transient') return Math.max(interactionValue ?? 0, clamp01(value * Math.exp(-elapsed / 700)));
  const staleMs = signal === 'level' ? 220 : 500;
  if (elapsed <= staleMs) return Math.max(interactionValue ?? 0, value);
  const releaseMs = signal === 'level' ? 900 : 1400;
  const decayed = value * Math.exp(-(elapsed - staleMs) / releaseMs);
  return decayed < 0.001 ? interactionValue : Math.max(interactionValue ?? 0, clamp01(decayed));
}

export function resetVisualizerTelemetry(): void {
  values.fill(0);
  updatedAt.fill(0);
  valid.fill(0);
  resetProductInteractionSignalSnapshot();
}
