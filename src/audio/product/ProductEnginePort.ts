import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductDrumMorphCallback,
  ProductDrumParamSampleHoldCallback,
  ProductDrumTriggerCallback,
  ProductDrumVoice,
  ProductDynamicsVisualTelemetry,
  ProductEngineLifecycleState,
  ProductEngineStartOptions,
  ProductEngineState,
  ProductEvent,
  ProductEvolveOverridesCallback,
  ProductExternalState,
  ProductLeadDelayCallback,
  ProductLeadExpressionCallback,
  ProductLeadPairCallback,
  ProductManualSynthNote,
  ProductMidiMessage,
  ProductRange,
  ProductRangeMap,
  ProductRuntimeWalkPositionsCallback,
  ProductScalarCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSequencerUiPatch,
  ProductSequencerUiState,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductSynthNoteRangeEvolvedCallback,
  ProductTelemetrySnapshot,
} from './ProductEngineTypes';
import type { ProductEngineRuntimeMode } from './ProductRuntimeMode';
import type { ProductRuntimeCapabilityReport } from './ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';

/**
 * Product runtime boundary.
 * Production UI may import this file. It must not expose Web Audio node objects.
 */
export type ProductEnginePort = {
  readonly mode: ProductEngineRuntimeMode;

  preload(): Promise<void>;
  start(options?: ProductEngineStartOptions): Promise<void>;
  stop(): Promise<void>;
  suspend(): void;
  resume(): void;
  setOutputGain(target: number, durationSeconds?: number): void;
  resetCofDrift(): void;

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void;
  enqueueEvent(event: ProductEvent): void;
  enqueueEvents(events: readonly ProductEvent[]): void;
  pushMidiMessage(message: ProductMidiMessage): void;

  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle>;
  unregisterAsset(assetId: number): void;
  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void>;
  triggerDrumVoice(voice: ProductDrumVoice, velocity?: number, externalState?: ProductExternalState): Promise<void>;

  getLifecycleState(): ProductEngineLifecycleState;
  getProductState(): ProductEngineState;
  getTelemetry(): ProductTelemetrySnapshot | null;
  getSequencerUiState(): ProductSequencerUiState | null;
  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry;
  getDiagnostics(): ProductRuntimeDiagnostics;
  getCapabilityReport(): ProductRuntimeCapabilityReport;

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void;
  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void;
  setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void;
  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void;
  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void;
  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void;
  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void;
  setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void;
  setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void;
  setDrumParamSHRange(key: string, range: ProductRange | null): void;
  setDualRanges(ranges: ProductRangeMap): void;
  setRuntimeWalkRanges(ranges: ProductRangeMap): void;
  setLeadExpressionCallback(callback: ProductLeadExpressionCallback | null): void;
  setLeadMorphCallback(callback: ProductLeadPairCallback | null): void;
  setPadMorphTriggerCallback(callback: ProductScalarCallback | null): void;
  setPad2MorphTriggerCallback(callback: ProductScalarCallback | null): void;
  setLeadDistanceCallback(callback: ProductLeadPairCallback | null): void;
  setPadDistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setPad2DistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setPianoDistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setLeadDelayCallback(callback: ProductLeadDelayCallback | null): void;
  setDrumMorphTriggerCallback(callback: ProductDrumMorphCallback | null): void;
  setDrumParamSHTriggerCallback(callback: ProductDrumParamSampleHoldCallback | null): void;
  setGranularSHTriggerCallback(callback: ProductRuntimeWalkPositionsCallback | null): void;
  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void;
  startJourneyMorphClock(): void;
  stopJourneyMorphClock(): void;
  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void;
  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void;
  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void;
  applySequencerUiPatch(patch: ProductSequencerUiPatch): void;
  setPerfMonitorEnabled(enabled: boolean): void;
  setVisualTelemetryActive(active: boolean): void;
  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void;
};
