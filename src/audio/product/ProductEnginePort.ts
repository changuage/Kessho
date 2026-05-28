import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductEngineLifecycleState,
  ProductEngineStartOptions,
  ProductEngineState,
  ProductEvent,
  ProductSequencerUiPatch,
  ProductSequencerUiState,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
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
  pushMidiMessage(message: unknown): void;

  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle>;
  unregisterAsset(assetId: number): void;
  auditionSynthNote(note: unknown, externalState?: unknown): Promise<void>;
  triggerDrumVoice(voice: unknown, velocity?: number, externalState?: unknown): Promise<void>;

  getLifecycleState(): ProductEngineLifecycleState;
  getProductState(): ProductEngineState;
  getTelemetry(): ProductTelemetrySnapshot | null;
  getSequencerUiState(): ProductSequencerUiState | null;
  getDynamicsVisualTelemetry(): unknown;
  getDiagnostics(): ProductRuntimeDiagnostics;
  getCapabilityReport(): ProductRuntimeCapabilityReport;

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void;
  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void;
  setDrumTriggerCallback(callback: ((voice: unknown, velocity: number) => void) | null): void;
  setDrumStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void;
  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void;
  setDrumEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void;
  setSynthEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void;
  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null): void;
  setDrumMorphRange(voice: unknown, range: { min: number; max: number } | null): void;
  setDrumParamSHRange(key: string, range: { min: number; max: number } | null): void;
  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void;
  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void;
  setLeadExpressionCallback(callback: ((expression: Record<string, number>) => void) | null): void;
  setLeadMorphCallback(callback: ((morph: { lead1: number; lead2: number }) => void) | null): void;
  setPadMorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void;
  setPad2MorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void;
  setLeadDistanceCallback(callback: ((distance: { lead1: number; lead2: number }) => void) | null): void;
  setPadDistanceTriggerCallback(callback: ((distance: number) => void) | null): void;
  setPad2DistanceTriggerCallback(callback: ((distance: number) => void) | null): void;
  setPianoDistanceTriggerCallback(callback: ((distance: number) => void) | null): void;
  setLeadDelayCallback(callback: ((delay: Record<string, number | string>) => void) | null): void;
  setDrumMorphTriggerCallback(callback: ((voice: unknown, morphPosition: number) => void) | null): void;
  setDrumParamSHTriggerCallback(callback: ((voice: unknown, key: string, position: number) => void) | null): void;
  setGranularSHTriggerCallback(callback: ((positions: Record<string, number>) => void) | null): void;
  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void;
  startJourneyMorphClock(): void;
  stopJourneyMorphClock(): void;
  setDrumEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void;
  setSynthEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void;
  setSynthNoteRangeEvolvedCallback(callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null): void;
  applySequencerUiPatch(patch: ProductSequencerUiPatch): void;
  setPerfMonitorEnabled(enabled: boolean): void;
  setVisualTelemetryActive(active: boolean): void;
  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void;
};
