import { productEngine } from './ProductEngineProxy';
import {
  getProductRuntimeMode,
} from './ProductAudioRuntimeSelection';
import {
  getLoadedReferenceSelectedRuntimeTarget,
  invokeReferenceSelectedRuntimeMethod,
  preloadReferenceSelectedRuntime,
} from '../reference/ReferenceSelectedRuntime';
import type { DawOutputRoutingConfig } from '../dawOutputRouting';
import type {
  ProductDrumVoice,
  ProductDynamicsVisualTelemetry,
  ProductExternalState,
  ProductManualSynthNote,
  ProductMidiMessage,
  ProductRange,
  ProductRangeMap,
} from './ProductEngineTypes';

type SelectedRuntimeTarget = Record<string, unknown>;

export type SelectedProductRuntime = SelectedRuntimeTarget & {
  start(state?: unknown): Promise<void>;
  stop(): void;
  suspend(): void | Promise<void>;
  resume(): void | Promise<void>;
  setOutputGain(target: number, durationSeconds?: number): void;
  setDawOutputRouting(config: DawOutputRoutingConfig): void;
  setDawOutputDeviceId?(deviceId: string | null): Promise<boolean>;
  resetCofDrift(): void;
  pushMidiMessage(message: ProductMidiMessage): void;
  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void>;
  triggerDrumVoice(voice: ProductDrumVoice, velocity?: number, externalState?: ProductExternalState): Promise<void>;
  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry;
  getCurrentPadFilterFreq(pad: 'pad1' | 'pad2'): number;
  getCurrentPadLfoValue(pad: 'pad1' | 'pad2'): number;
  getGranularActiveGrainCount(): number;
  getGranularWriteHeadPosition(): number;
  getGranularVoicePositions(): readonly number[];
  setGranularUiActive(active: boolean): void;
  setStateChangeCallback(callback: unknown): void;
  setVisualTelemetryActive(active: boolean): void;
  setDrumTriggerCallback(callback: unknown): void;
  setDrumStepPositionCallback(callback: unknown): void;
  setSynthStepPositionCallback(callback: unknown): void;
  setDrumEuclidEvolveTriggerCallback(callback: unknown): void;
  setSynthEuclidEvolveTriggerCallback(callback: unknown): void;
  setRuntimeWalkPositionsCallback(callback: unknown): void;
  setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void;
  setDrumParamSHRange(key: string, range: ProductRange | null): void;
  setDualRanges(ranges: ProductRangeMap): void;
  setRuntimeWalkRanges(ranges: ProductRangeMap): void;
  setLeadExpressionCallback(callback: unknown): void;
  setLeadMorphCallback(callback: unknown): void;
  setPadMorphTriggerCallback(callback: unknown): void;
  setPad2MorphTriggerCallback(callback: unknown): void;
  setLeadDistanceCallback(callback: unknown): void;
  setPadDistanceTriggerCallback(callback: unknown): void;
  setPad2DistanceTriggerCallback(callback: unknown): void;
  setPianoDistanceTriggerCallback(callback: unknown): void;
  setLeadDelayCallback(callback: unknown): void;
  setDrumMorphTriggerCallback(callback: unknown): void;
  setDrumParamSHTriggerCallback(callback: unknown): void;
  setGranularSHTriggerCallback(callback: unknown): void;
  setJourneyMorphClockCallback(callback: unknown): void;
  startJourneyMorphClock(): void;
  stopJourneyMorphClock(): void;
  setDrumEvolveOverridesChangedCallback(callback: unknown): void;
  setSynthEvolveOverridesChangedCallback(callback: unknown): void;
  setSynthNoteRangeEvolvedCallback(callback: unknown): void;
  setDrumEuclidEvolveConfigs(configs: readonly unknown[]): void;
  setSynthEuclidEvolveConfigs(configs: readonly unknown[]): void;
  setDrumEuclidClockDivs(divs: readonly unknown[]): void;
  setSynthEuclidClockDivs(divs: readonly unknown[]): void;
  setDrumEuclidSwings(swings: readonly unknown[]): void;
  setSynthEuclidSwings(swings: readonly unknown[]): void;
  setDrumSubLaneEnabled(states: unknown): void;
  setSynthSubLaneEnabled(states: unknown): void;
  setSynthPitchSettings(settings: readonly unknown[]): void;
  setSynthPitchBindingModes(modes: readonly unknown[]): void;
  setDrumStepOverrides(overrides: unknown): void;
  setSynthStepOverrides(overrides: unknown): void;
  setSequencerPresetHomeSnapshots(): void;
  resetSynthEuclidLaneHome(laneIndex: number): void;
  captureSynthEuclidLaneHome(laneIndex: number, pitchState?: { steps?: number; direction?: string; scaleQuantize?: boolean } | null): void;
  diceSynthEuclidLane(laneIndex: number, intensity?: number): void;
  resetDrumEuclidLaneHome(laneIndex: number): void;
  captureDrumEuclidLaneHome(
    laneIndex: number,
    pitchSettings?: unknown,
    pitchState?: { steps?: number; direction?: string; scaleQuantize?: boolean } | null,
  ): void;
  diceDrumEuclidLane(laneIndex: number, intensity?: number): void;
};

function getLoadedSelectedRuntimeTarget(): SelectedRuntimeTarget | null {
  if (getProductRuntimeMode() === 'core-product') {
    return productEngine as unknown as SelectedRuntimeTarget;
  }
  return getLoadedReferenceSelectedRuntimeTarget();
}

function invokeSelectedRuntimeMethod(method: string, args: readonly unknown[]): unknown {
  const runtimeMode = getProductRuntimeMode();
  const loadedTarget = getLoadedSelectedRuntimeTarget();
  if (loadedTarget) {
    const value = loadedTarget[method];
    if (typeof value !== 'function') {
      throw new Error(`Selected runtime ${method} is not implemented by ${runtimeMode}`);
    }
    return (value as (...invokeArgs: unknown[]) => unknown).apply(loadedTarget, [...args]);
  }

  if (runtimeMode === 'core-product') {
    throw new Error(`Selected runtime ${method} is unavailable before core-product has initialized`);
  }

  return invokeReferenceSelectedRuntimeMethod(runtimeMode, method, args);
}

export const selectedProductRuntime = new Proxy({} as SelectedRuntimeTarget, {
  get(_target, property) {
    if (property === 'then') return undefined;
    if (typeof property !== 'string') return undefined;
    const loadedTarget = getLoadedSelectedRuntimeTarget();
    if (loadedTarget) {
      const value = loadedTarget[property];
      return typeof value === 'function' ? value.bind(loadedTarget) : value;
    }
    return (...args: readonly unknown[]) => invokeSelectedRuntimeMethod(property, args);
  },
}) as unknown as SelectedProductRuntime;

export function preloadSelectedProductRuntime(): Promise<SelectedProductRuntime | unknown> {
  if (getProductRuntimeMode() === 'core-product') {
    return productEngine.preload().then(() => productEngine);
  }
  return preloadReferenceSelectedRuntime();
}
