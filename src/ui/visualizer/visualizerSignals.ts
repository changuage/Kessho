export type VisualizerPulseKey =
  | 'global'
  | 'synth'
  | 'pad'
  | 'lead'
  | 'drums'
  | 'earth'
  | 'granular'
  | 'delay'
  | 'reverb'
  | 'dynamics'
  | 'sequencer';

export type VisualizerSequencerKind = 'synth' | 'drum';

export type VisualizerPulseSnapshot = Record<VisualizerPulseKey, number> & {
  synthStepPhase: number;
  drumStepPhase: number;
  synthHitDensity: number;
  drumHitDensity: number;
};

type PulseState = {
  value: number;
  updatedAt: number;
};

type SequencerState = {
  steps: number[];
  hitCounts: number[];
  updatedAt: number;
};

const PULSE_DECAY_MS: Record<VisualizerPulseKey, number> = {
  global: 1050,
  synth: 900,
  pad: 1200,
  lead: 780,
  drums: 520,
  earth: 1400,
  granular: 820,
  delay: 950,
  reverb: 1600,
  dynamics: 700,
  sequencer: 680,
};

const EMPTY_PULSE: PulseState = { value: 0, updatedAt: 0 };

const pulses: Record<VisualizerPulseKey, PulseState> = {
  global: { ...EMPTY_PULSE },
  synth: { ...EMPTY_PULSE },
  pad: { ...EMPTY_PULSE },
  lead: { ...EMPTY_PULSE },
  drums: { ...EMPTY_PULSE },
  earth: { ...EMPTY_PULSE },
  granular: { ...EMPTY_PULSE },
  delay: { ...EMPTY_PULSE },
  reverb: { ...EMPTY_PULSE },
  dynamics: { ...EMPTY_PULSE },
  sequencer: { ...EMPTY_PULSE },
};

const sequencers: Record<VisualizerSequencerKind, SequencerState> = {
  synth: { steps: [0, 0, 0, 0], hitCounts: [0, 0, 0, 0], updatedAt: 0 },
  drum: { steps: [0, 0, 0, 0, 0, 0], hitCounts: [0, 0, 0, 0, 0, 0], updatedAt: 0 },
};

const signalListeners = new Set<() => void>();
let visualizerSignalDemand = false;

export function setVisualizerSignalDemand(demand: boolean): void {
  visualizerSignalDemand = demand;
}

function notifySignalListeners(): void {
  for (const listener of signalListeners) listener();
}

export function subscribeVisualizerSignals(listener: () => void): () => void {
  signalListeners.add(listener);
  return () => {
    signalListeners.delete(listener);
  };
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function decayedPulse(key: VisualizerPulseKey, now: number): number {
  const pulse = pulses[key];
  if (pulse.value <= 0) return 0;
  const elapsed = Math.max(0, now - pulse.updatedAt);
  return clamp01(pulse.value * Math.exp(-elapsed / PULSE_DECAY_MS[key]));
}

export function emitVisualizerPulse(
  key: VisualizerPulseKey,
  amount = 1,
  at = nowMs(),
): void {
  if (!visualizerSignalDemand) return;
  const current = decayedPulse(key, at);
  pulses[key] = {
    value: clamp01(current + Math.max(0, amount)),
    updatedAt: at,
  };
  if (key !== 'global') {
    const globalCurrent = decayedPulse('global', at);
    pulses.global = {
      value: clamp01(globalCurrent + Math.max(0, amount) * 0.32),
      updatedAt: at,
    };
    publishVisualizerTransient('global', Math.max(0, amount) * 0.32, at);
  }
  publishVisualizerTransient(key, amount, at);
  notifySignalListeners();
}

export function emitVisualizerPulses(
  partial: Partial<Record<VisualizerPulseKey, number>>,
  at = nowMs(),
): void {
  for (const [key, amount] of Object.entries(partial)) {
    emitVisualizerPulse(key as VisualizerPulseKey, amount ?? 0, at);
  }
}

export function setVisualizerSequencerState(
  kind: VisualizerSequencerKind,
  steps: readonly number[],
  hitCounts: readonly number[],
): void {
  if (!visualizerSignalDemand) return;
  const prev = sequencers[kind];
  let moved = false;
  for (let index = 0; index < Math.max(prev.steps.length, steps.length); index += 1) {
    if ((prev.steps[index] ?? 0) !== (steps[index] ?? 0)) {
      moved = true;
      break;
    }
  }

  sequencers[kind] = {
    steps: Array.from(steps, (step) => Math.max(0, Math.floor(step))),
    hitCounts: Array.from(hitCounts, (count) => Math.max(0, Math.floor(count))),
    updatedAt: nowMs(),
  };
  publishVisualizerTelemetrySignal(
    kind === 'synth' ? 'synth' : 'drums',
    'density',
    hitDensity(sequencers[kind]),
  );

  notifySignalListeners();

  if (moved) {
    emitVisualizerPulse(kind === 'drum' ? 'drums' : 'synth', 0.26);
    emitVisualizerPulse('sequencer', 0.22);
  }
}

function stepPhase(state: SequencerState): number {
  const steps = state.steps;
  if (steps.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const step of steps) {
    const angle = ((step % 16) / 16) * Math.PI * 2;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  const angle = Math.atan2(y, x);
  return ((angle / (Math.PI * 2)) + 1) % 1;
}

function hitDensity(state: SequencerState): number {
  const hits = state.hitCounts;
  if (hits.length === 0) return 0;
  const total = hits.reduce((sum, count) => sum + count, 0);
  return clamp01(total / Math.max(1, hits.length * 16));
}

export function getVisualizerPulseSnapshot(at = nowMs()): VisualizerPulseSnapshot {
  return {
    global: decayedPulse('global', at),
    synth: decayedPulse('synth', at),
    pad: decayedPulse('pad', at),
    lead: decayedPulse('lead', at),
    drums: decayedPulse('drums', at),
    earth: decayedPulse('earth', at),
    granular: decayedPulse('granular', at),
    delay: decayedPulse('delay', at),
    reverb: decayedPulse('reverb', at),
    dynamics: decayedPulse('dynamics', at),
    sequencer: decayedPulse('sequencer', at),
    synthStepPhase: getVisualizerTransportPhase('synth', at),
    drumStepPhase: getVisualizerTransportPhase('drum', at),
    synthHitDensity: hitDensity(sequencers.synth),
    drumHitDensity: hitDensity(sequencers.drum),
  };
}

export function publishVisualizerTransportPhase(
  kind: VisualizerSequencerKind,
  phase: number,
  at = nowMs(),
): void {
  if (!visualizerSignalDemand) return;
  publishVisualizerTelemetrySignal(kind === 'synth' ? 'synth' : 'drums', 'phase', phase, at);
  notifySignalListeners();
}

export function getVisualizerTransportPhase(
  kind: VisualizerSequencerKind,
  at = nowMs(),
): number {
  return readVisualizerTelemetrySignal(kind === 'synth' ? 'synth' : 'drums', 'phase', at)
    ?? stepPhase(sequencers[kind]);
}
import {
  publishVisualizerTelemetrySignal,
  publishVisualizerTransient,
  readVisualizerTelemetrySignal,
} from './visualizerTelemetry';
