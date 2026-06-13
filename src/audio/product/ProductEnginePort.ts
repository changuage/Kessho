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
  ProductResolvedStateCommit,
  ProductResolvedStateCommitReceipt,
  ProductRuntimeWalkPositionsCallback,
  ProductScalarCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSequencerUiState,
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductSynthNoteRangeEvolvedCallback,
  ProductTelemetrySnapshot,
} from './ProductEngineTypes';
import type { ProductLiveNoteEvent } from './liveNoteEvents';
import type { ProductEngineRuntimeMode } from './ProductRuntimeMode';
import type { ProductRuntimeCapabilityReport } from './ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import type { DawOutputRoutingConfig } from '../dawOutputRouting';

/**
 * Product runtime boundary.
 * Production UI may import this file. It must not expose Web Audio node objects.
 */
export type ProductEngineLifecyclePort = {
  readonly mode: ProductEngineRuntimeMode;

  preload(): Promise<void>;
  start(options?: ProductEngineStartOptions): Promise<void>;
  stop(): Promise<void>;
  suspend(): void;
  resume(): void;
  getLifecycleState(): ProductEngineLifecycleState;
  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void;
};

export type ProductEngineCommandPort = {
  setOutputGain(target: number, durationSeconds?: number): void;
  setDawOutputRouting(config: DawOutputRoutingConfig): void;
  setDawOutputDeviceId(deviceId: string | null): Promise<boolean>;
  resetCofDrift(): void;
  pushMidiMessage(message: ProductMidiMessage): void;
  enqueueLiveNoteEvent(event: ProductLiveNoteEvent): Promise<void> | void;
  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void>;
  triggerDrumVoice(voice: ProductDrumVoice, velocity?: number, externalState?: ProductExternalState): Promise<void>;
};

export type ProductEngineControlPort = {
  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void;
  commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt>;
  getCommittedStateRevision(): number;
  enqueueEvent(event: ProductEvent): void;
  enqueueEvents(events: readonly ProductEvent[]): void;
};

export type ProductEngineAssetPort = {
  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle>;
  unregisterAsset(assetId: number): void;
};

export type ProductEngineTelemetryPort = {
  getProductState(): ProductEngineState;
  getTelemetry(): ProductTelemetrySnapshot | null;
  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry;
  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void;
  setVisualTelemetryActive(active: boolean): void;
};

export type ProductEngineSequencerPort = {
  getSequencerUiState(): ProductSequencerUiState | null;
  setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void;
  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void;
  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void;
  setSynthOrbitVisualStateCallback(callback: ProductSynthOrbitVisualStateCallback | null): void;
  setSynthAnchorWalkerVisualStateCallback(callback: ProductSynthAnchorWalkerVisualStateCallback | null): void;
  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void;
  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void;
  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void;
  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void;
  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void;
};

export type ProductEngineModulationPort = {
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
  setGranularUiActive(active: boolean): void;
  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void;
  startJourneyMorphClock(): void;
  stopJourneyMorphClock(): void;
};

export type ProductEngineDiagnosticsPort = {
  getDiagnostics(): ProductRuntimeDiagnostics;
  getCapabilityReport(): ProductRuntimeCapabilityReport;
  setPerfMonitorEnabled(enabled: boolean): void;
  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void;
};

export type ProductEnginePort =
  ProductEngineLifecyclePort &
  ProductEngineCommandPort &
  ProductEngineControlPort &
  ProductEngineAssetPort &
  ProductEngineTelemetryPort &
  ProductEngineSequencerPort &
  ProductEngineModulationPort &
  ProductEngineDiagnosticsPort;
