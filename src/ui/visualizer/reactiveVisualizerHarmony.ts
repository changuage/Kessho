import { calculateDriftedRoot } from '../../audio/harmony';
import type { ProductEngineState } from '../../audio/product/ProductEngineTypes';

type VisualizerHarmonyEngineState = Pick<ProductEngineState, 'harmonyState' | 'cofCurrentStep' | 'isRunning'>;

function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function reactiveVisualizerRootPitchClass(options: {
  rootNote: number;
  cofCurrentStep: number;
  cofDriftEnabled: boolean;
  engineState: VisualizerHarmonyEngineState | null | undefined;
}): number {
  const liveRoot = finiteNumber(options.engineState?.harmonyState?.effectiveRoot);
  if (liveRoot !== null) return pitchClass(liveRoot);

  const rootNote = pitchClass(options.rootNote);
  if (!options.cofDriftEnabled) return rootNote;

  const stateStep = finiteNumber(options.cofCurrentStep) ?? 0;
  const engineStep = finiteNumber(options.engineState?.cofCurrentStep);
  const step = options.engineState?.isRunning && engineStep !== null ? engineStep : stateStep;
  return pitchClass(calculateDriftedRoot(rootNote, Math.round(step)));
}

export function reactiveVisualizerRootSignal(options: Parameters<typeof reactiveVisualizerRootPitchClass>[0]): number {
  return reactiveVisualizerRootPitchClass(options) / 12;
}
