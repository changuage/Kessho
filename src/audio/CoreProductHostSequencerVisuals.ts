import type { CoreProductSnapshot } from './coreProductSnapshot';
import type { CoreProductAnchorWalkerVisualLaneState, CoreProductOrbitVisualLaneState, CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import type { SequencerStepToggleOverride } from './CoreProductHostSequencerAdapter';
import { defaultDrumEuclidPattern, defaultSynthEuclidPattern, resolveEuclidPatternParams } from './euclideanPatterns';

type SequencerVisualKind = 'synth' | 'drum';

type SequencerVisualLane = {
  enabled: boolean;
  stepCount: number;
};

type PublishSequencerVisualsInput = {
  telemetry: CoreProductTelemetrySnapshot | null;
  snapshot: CoreProductSnapshot | null;
  state: Record<string, unknown> | null;
  synthToggles: SequencerStepToggleOverride[][];
  drumToggles: SequencerStepToggleOverride[][];
  synthVisibleLaneCount: number;
  drumVisibleLaneCount: number;
  sampleRate: number;
  diagnostics?: {
    derivedVisualFallbackCount: number;
  };
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

function zeroLaneValues(laneCount: number): number[] {
  const count = Math.max(0, Math.trunc(laneCount));
  const values = new Array<number>(count);
  for (let index = 0; index < count; index += 1) values[index] = 0;
  return values;
}

function numberFromState(state: Record<string, unknown> | null, key: string, fallback: number): number { const value = state?.[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function booleanFromState(state: Record<string, unknown> | null, key: string, fallback: boolean): boolean { const value = state?.[key]; return typeof value === 'boolean' ? value : fallback; }

function visualLaneFromState(
  kind: SequencerVisualKind,
  state: Record<string, unknown> | null,
  laneIndex: number,
  _toggles: SequencerStepToggleOverride[][],
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
  const stepCount = Math.max(1, Math.min(64, Math.round(resolved.steps)));
  const enabled = kind === 'synth'
    ? booleanFromState(state, 'synthEuclideanMasterEnabled', false) && booleanFromState(state, `${prefix}Enabled`, laneNumber === 1)
    : booleanFromState(state, 'drumEnabled', false) && booleanFromState(state, 'drumEuclidMasterEnabled', false) && booleanFromState(state, `${prefix}Enabled`, false);
  return {
    enabled,
    stepCount,
  };
}

function visualPositionsFor(
  kind: SequencerVisualKind,
  input: PublishSequencerVisualsInput,
): { steps: number[]; hitCounts: number[] } {
  const bpm = input.snapshot?.transport.bpm ?? 120;
  const visibleLaneCount = kind === 'synth' ? input.synthVisibleLaneCount : input.drumVisibleLaneCount;
  const toggles = kind === 'synth' ? input.synthToggles : input.drumToggles;
  const lanes = new Array<SequencerVisualLane>(visibleLaneCount);
  for (let laneIndex = 0; laneIndex < visibleLaneCount; laneIndex += 1) {
    lanes[laneIndex] = visualLaneFromState(kind, input.state, laneIndex, toggles);
  }
  const steps = new Array<number>(visibleLaneCount);
  const hitCounts = new Array<number>(visibleLaneCount);
  for (let laneIndex = 0; laneIndex < visibleLaneCount; laneIndex += 1) {
    const lane = lanes[laneIndex];
    if (!lane || !lane.enabled || bpm <= 0 || input.sampleRate <= 0) {
      steps[laneIndex] = 0;
      hitCounts[laneIndex] = 0;
      continue;
    }
    const nativeStep = kind === 'synth'
      ? input.telemetry?.synthSequencerCurrentSteps?.[laneIndex]
      : input.telemetry?.drumSequencerCurrentSteps?.[laneIndex];
    if (typeof nativeStep === 'number' && Number.isFinite(nativeStep)) {
      steps[laneIndex] = Math.max(0, Math.floor(nativeStep)) % lane.stepCount;
    } else {
      input.diagnostics && (input.diagnostics.derivedVisualFallbackCount += 1);
      steps[laneIndex] = 0;
    }
    const nativeHitCount = kind === 'synth'
      ? input.telemetry?.synthSequencerHitCounts?.[laneIndex]
      : input.telemetry?.drumSequencerHitCounts?.[laneIndex];
    if (typeof nativeHitCount === 'number' && Number.isFinite(nativeHitCount)) {
      hitCounts[laneIndex] = Math.max(0, Math.floor(nativeHitCount));
      continue;
    }
    input.diagnostics && (input.diagnostics.derivedVisualFallbackCount += 1);
    hitCounts[laneIndex] = 0;
  }
  return { steps, hitCounts };
}

export function publishCoreProductSequencerVisuals(input: PublishSequencerVisualsInput): void {
  if (!input.telemetry?.transportRunning) {
    input.publish('synthStepPosition', zeroLaneValues(input.synthVisibleLaneCount), zeroLaneValues(input.synthVisibleLaneCount));
    input.publish('drumStepPosition', zeroLaneValues(input.drumVisibleLaneCount), zeroLaneValues(input.drumVisibleLaneCount));
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
