import type { CoreProductSnapshot } from './coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import type { SequencerStepToggleOverride } from './CoreProductHostSequencerAdapter';
import { euclideanMaskHit, euclideanPatternMask, resolveEuclidPatternParams } from './euclideanPatterns';

type SequencerVisualKind = 'synth' | 'drum';

type SequencerVisualLane = {
  enabled: boolean;
  stepCount: number;
  clockDivision: number;
  manualStepMaskLow: number;
  manualStepMaskHigh: number;
  toggles: SequencerStepToggleOverride[];
};

type PublishSequencerVisualsInput = {
  telemetry: CoreProductTelemetrySnapshot | null;
  snapshot: CoreProductSnapshot | null;
  state: Record<string, unknown> | null;
  synthToggles: SequencerStepToggleOverride[][];
  drumToggles: SequencerStepToggleOverride[][];
  sampleRate: number;
  publish: (name: 'synthStepPosition' | 'drumStepPosition', steps: number[], hitCounts: number[]) => void;
};

const ZERO_STEPS = [0, 0, 0, 0];
const ZERO_HITS = [0, 0, 0, 0];

function numberFromState(state: Record<string, unknown> | null, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromState(state: Record<string, unknown> | null, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function clockDivisionFromState(state: Record<string, unknown> | null, key: string, fallback: number): number {
  const value = state?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(128, Math.round(value)));
  if (typeof value !== 'string') return fallback;
  const table: Record<string, number> = {
    '1/4': 4,
    '1/4T': 6,
    '1/8': 8,
    '1/8T': 12,
    '1/16': 16,
    '1/16T': 24,
    '1/32': 32,
    '1/32T': 48,
    '1/64': 64,
  };
  return table[value] ?? fallback;
}

function visualLaneFromState(
  kind: SequencerVisualKind,
  state: Record<string, unknown> | null,
  laneIndex: number,
  toggles: SequencerStepToggleOverride[][],
): SequencerVisualLane {
  const laneNumber = laneIndex + 1;
  const prefix = kind === 'synth' ? `synthEuclid${laneNumber}` : `drumEuclid${laneNumber}`;
  const defaultSteps = kind === 'synth'
    ? 16
    : laneNumber === 3 ? 12 : laneNumber === 2 ? 16 : 8;
  const defaultHits = kind === 'synth'
    ? laneNumber === 2 ? 3 : laneNumber === 3 ? 2 : laneNumber === 4 ? 6 : 4
    : laneNumber === 1 ? 5 : laneNumber === 3 ? 5 : 3;
  const defaultRotation = kind === 'synth'
    ? laneNumber === 2 ? 1 : laneNumber === 4 ? 2 : 0
    : 0;
  const resolved = resolveEuclidPatternParams(
    String(state?.[`${prefix}Preset`] ?? 'custom'),
    numberFromState(state, `${prefix}Steps`, defaultSteps),
    numberFromState(state, `${prefix}Hits`, defaultHits),
    numberFromState(state, `${prefix}Rotation`, defaultRotation),
  );
  const mask = euclideanPatternMask(resolved.steps, resolved.hits, resolved.rotation);
  const enabled = kind === 'synth'
    ? booleanFromState(state, 'synthEuclideanMasterEnabled', false) && booleanFromState(state, `${prefix}Enabled`, laneNumber === 1)
    : booleanFromState(state, 'drumEnabled', false) && booleanFromState(state, 'drumEuclidMasterEnabled', false) && booleanFromState(state, `${prefix}Enabled`, false);
  return {
    enabled,
    stepCount: Math.max(1, Math.min(64, Math.round(resolved.steps))),
    clockDivision: clockDivisionFromState(state, `${prefix}ClockDivision`, kind === 'synth' ? 16 : numberFromState(state, 'drumEuclidDivision', 16)),
    manualStepMaskLow: numberFromState(state, `${prefix}ManualStepMaskLow`, mask.low) >>> 0,
    manualStepMaskHigh: numberFromState(state, `${prefix}ManualStepMaskHigh`, mask.high) >>> 0,
    toggles: toggles[laneIndex] ?? [],
  };
}

function laneHitAtStep(lane: SequencerVisualLane, step: number): boolean {
  const override = lane.toggles.find((entry) => entry.step === step);
  if (override) return override.value;
  return euclideanMaskHit(lane.manualStepMaskLow, lane.manualStepMaskHigh, step);
}

function hitCountThroughStep(lane: SequencerVisualLane, absoluteStep: number, step: number): number {
  const cycleHits = Array.from({ length: lane.stepCount }, (_, index) => laneHitAtStep(lane, index))
    .filter(Boolean).length;
  const cycles = Math.max(0, Math.floor(absoluteStep / lane.stepCount));
  let count = cycles * cycleHits;
  for (let index = 0; index <= step; index += 1) {
    if (laneHitAtStep(lane, index)) count += 1;
  }
  return count;
}

function visualPositionsFor(
  kind: SequencerVisualKind,
  input: PublishSequencerVisualsInput,
): { steps: number[]; hitCounts: number[] } {
  const bpm = input.snapshot?.transport.bpm ?? 120;
  const absoluteSampleTime = input.telemetry?.absoluteSampleTime ?? 0;
  const lanes = Array.from({ length: 4 }, (_, laneIndex) =>
    visualLaneFromState(kind, input.state, laneIndex, kind === 'synth' ? input.synthToggles : input.drumToggles),
  );
  const steps = lanes.map((lane) => {
    if (!lane.enabled || bpm <= 0 || input.sampleRate <= 0) return 0;
    const samplesPerStep = (60 / bpm) * input.sampleRate * 4 / Math.max(1, lane.clockDivision);
    return Math.floor(absoluteSampleTime / samplesPerStep) % lane.stepCount;
  });
  const hitCounts = lanes.map((lane, laneIndex) => {
    if (!lane.enabled || bpm <= 0 || input.sampleRate <= 0) return 0;
    const samplesPerStep = (60 / bpm) * input.sampleRate * 4 / Math.max(1, lane.clockDivision);
    const absoluteStep = Math.floor(absoluteSampleTime / samplesPerStep);
    return hitCountThroughStep(lane, absoluteStep, steps[laneIndex] ?? 0);
  });
  return { steps, hitCounts };
}

export function publishCoreProductSequencerVisuals(input: PublishSequencerVisualsInput): void {
  if (!input.telemetry?.transportRunning) {
    input.publish('synthStepPosition', ZERO_STEPS, ZERO_HITS);
    input.publish('drumStepPosition', ZERO_STEPS, ZERO_HITS);
    return;
  }
  const synth = visualPositionsFor('synth', input);
  const drum = visualPositionsFor('drum', input);
  input.publish('synthStepPosition', synth.steps, synth.hitCounts);
  input.publish('drumStepPosition', drum.steps, drum.hitCounts);
}
