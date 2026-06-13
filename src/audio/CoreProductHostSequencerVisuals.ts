import type { CoreProductSnapshot } from './coreProductSnapshot';
import type { CoreProductAnchorWalkerVisualLaneState, CoreProductOrbitVisualLaneState, CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import type { SequencerStepToggleOverride } from './CoreProductHostSequencerAdapter';
import { defaultDrumEuclidPattern, defaultSynthEuclidPattern, euclideanMaskHit, euclideanPatternMask, resolveEuclidPatternParams } from './euclideanPatterns';
import { sequencerClockDivisionToNumericValue } from './sequencerClockDivisions';

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

type PublishSynthVisualStateInput<Name extends string, Lane> = {
  telemetry: CoreProductTelemetrySnapshot | null;
  visibleLaneCount: number;
  hasCallback: (name: Name) => boolean;
  publish: (name: Name, lanes: Array<Lane | null>) => void;
};
type PublishSynthOrbitVisualStateInput = PublishSynthVisualStateInput<'synthOrbitVisualState', CoreProductOrbitVisualLaneState>;
type PublishSynthAnchorWalkerVisualStateInput = PublishSynthVisualStateInput<'synthAnchorWalkerVisualState', CoreProductAnchorWalkerVisualLaneState>;

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
  return sequencerClockDivisionToNumericValue(state?.[key], fallback);
}

function defaultClockDivision(laneNumber: number): number {
  return laneNumber === 1 ? 8 : laneNumber === 2 ? 16 : laneNumber === 3 ? 12 : 4;
}

function visualLaneFromState(
  kind: SequencerVisualKind,
  state: Record<string, unknown> | null,
  laneIndex: number,
  toggles: SequencerStepToggleOverride[][],
): SequencerVisualLane {
  const laneNumber = laneIndex + 1;
  const prefix = kind === 'synth' ? `synthEuclid${laneNumber}` : `drumEuclid${laneNumber}`;
  const defaults = kind === 'synth'
    ? defaultSynthEuclidPattern(laneIndex)
    : defaultDrumEuclidPattern(laneIndex);
  const resolved = resolveEuclidPatternParams(
    String(state?.[`${prefix}Preset`] ?? 'custom'),
    numberFromState(state, `${prefix}Steps`, defaults.steps),
    numberFromState(state, `${prefix}Hits`, defaults.hits),
    numberFromState(state, `${prefix}Rotation`, defaults.rotation),
  );
  const mask = euclideanPatternMask(resolved.steps, resolved.hits, resolved.rotation);
  const enabled = kind === 'synth'
    ? booleanFromState(state, 'synthEuclideanMasterEnabled', false) && booleanFromState(state, `${prefix}Enabled`, laneNumber === 1)
    : booleanFromState(state, 'drumEnabled', false) && booleanFromState(state, 'drumEuclidMasterEnabled', false) && booleanFromState(state, `${prefix}Enabled`, false);
  return {
    enabled,
    stepCount: Math.max(1, Math.min(64, Math.round(resolved.steps))),
    clockDivision: clockDivisionFromState(state, `${prefix}ClockDivision`, defaultClockDivision(laneNumber)),
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
  let cycleHits = 0;
  for (let index = 0; index < lane.stepCount; index += 1) {
    if (laneHitAtStep(lane, index)) cycleHits += 1;
  }
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
  const synthTempo = Math.max(0.25, Math.min(12, numberFromState(input.state, 'synthEuclideanTempo', 1)));
  const drumTempo = Math.max(0.25, Math.min(4, numberFromState(input.state, 'drumEuclidTempo', 1)));
  const absoluteSampleTime = input.telemetry?.absoluteSampleTime ?? 0;
  const lanes = Array.from({ length: 4 }, (_, laneIndex) =>
    visualLaneFromState(kind, input.state, laneIndex, kind === 'synth' ? input.synthToggles : input.drumToggles),
  );
  const steps = lanes.map((lane, laneIndex) => {
    if (!lane.enabled || bpm <= 0 || input.sampleRate <= 0) return 0;
    const tempoMultiplier = kind === 'synth' ? synthTempo : drumTempo;
    const samplesPerStep = (60 / bpm) * input.sampleRate * 4 / Math.max(1, lane.clockDivision) / tempoMultiplier;
    const fallbackStep = samplesPerStep > 0
      ? Math.floor(absoluteSampleTime / samplesPerStep) % lane.stepCount
      : 0;
    const nativeStep = kind === 'synth'
      ? input.telemetry?.synthSequencerCurrentSteps?.[laneIndex]
      : input.telemetry?.drumSequencerCurrentSteps?.[laneIndex];
    if (typeof nativeStep === 'number' && Number.isFinite(nativeStep)) {
      const normalizedNative = Math.max(0, Math.floor(nativeStep)) % lane.stepCount;
      if (normalizedNative === 0 && fallbackStep !== 0) return fallbackStep;
      return normalizedNative;
    }
    return fallbackStep;
  });
  const hitCounts = lanes.map((lane, laneIndex) => {
    if (!lane.enabled || bpm <= 0 || input.sampleRate <= 0) return 0;
    const nativeHitCount = kind === 'synth'
      ? input.telemetry?.synthSequencerHitCounts?.[laneIndex]
      : input.telemetry?.drumSequencerHitCounts?.[laneIndex];
    if (typeof nativeHitCount === 'number' && Number.isFinite(nativeHitCount)) {
      const normalizedNative = Math.max(0, Math.floor(nativeHitCount));
      return normalizedNative;
    }
    const tempoMultiplier = kind === 'synth' ? synthTempo : drumTempo;
    const samplesPerStep = (60 / bpm) * input.sampleRate * 4 / Math.max(1, lane.clockDivision) / tempoMultiplier;
    const absoluteStep = samplesPerStep > 0 ? Math.floor(absoluteSampleTime / samplesPerStep) : 0;
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

function currentSynthVisualState<VisualLane>(lanes: Array<VisualLane | null> | undefined, visibleLaneCount: number): Array<VisualLane | null> {
  return Array.from({ length: visibleLaneCount }, (_, laneIndex) => lanes?.[laneIndex] ?? null);
}

export function currentCoreProductSynthOrbitVisualState(telemetry: CoreProductTelemetrySnapshot | null, visibleLaneCount: number): Array<CoreProductOrbitVisualLaneState | null> { return currentSynthVisualState(telemetry?.synthOrbitVisualLanes, visibleLaneCount); }
export function publishCoreProductSynthOrbitVisualState(input: PublishSynthOrbitVisualStateInput): void {
  if (!input.hasCallback('synthOrbitVisualState')) return;
  input.publish('synthOrbitVisualState', currentCoreProductSynthOrbitVisualState(input.telemetry, input.visibleLaneCount));
}

export function currentCoreProductSynthAnchorWalkerVisualState(telemetry: CoreProductTelemetrySnapshot | null, visibleLaneCount: number): Array<CoreProductAnchorWalkerVisualLaneState | null> { return currentSynthVisualState(telemetry?.synthAnchorWalkerVisualLanes, visibleLaneCount); }
export function publishCoreProductSynthAnchorWalkerVisualState(input: PublishSynthAnchorWalkerVisualStateInput): void {
  if (!input.hasCallback('synthAnchorWalkerVisualState')) return;
  input.publish('synthAnchorWalkerVisualState', currentCoreProductSynthAnchorWalkerVisualState(input.telemetry, input.visibleLaneCount));
}
