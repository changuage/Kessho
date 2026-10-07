import type { CoreProductEvent } from '../../coreProductEvents';
import type { DecodedCoreProductAsset } from '../../coreProductAssets';
import { encodeSynthSequenceVariationBank } from '../synthSequenceVariationEncoder';
import type { SynthSequenceVariationBank } from '../../../ui/sequencer/synthSequenceVariations';
import type {
  RecordedNoteCaptureBatch,
  RecordedNoteCaptureStartRequest,
} from '../../../ui/sequencer/recordedNoteCaptureTypes';
import type {
  ProductRuntimeSnapshotMetadata,
  ProductSnapshotAppliedReceipt,
} from '../ProductEngineTypes';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import {
  PRODUCT_INTERACTION_SOURCE_COUNT,
  PRODUCT_INTERACTION_VERSION,
  type ProductInteractionEvent,
  type ProductInteractionSignalSnapshot,
} from '../../productInteractionVocabulary';
import { KESSHO_PRODUCT_SCHEMA_HASH } from '../../generated/kesshoProductSchema';
import {
  getMacNativeProductRuntimePlugin,
  type KesshoNativeProductRuntimePlugin,
} from '../../../native/capacitorAudioSession';

const EVENT_BYTES = 40;
const TELEMETRY_BYTES = 14912;
const INTERACTION_SIGNAL_BYTES = 192;
const INTERACTION_EVENT_BYTES = 40;
const SYNTH_SEQUENCE_VARIATION_RUNTIME_BYTES = 32;
const SYNTH_SEQUENCE_VARIATION_LANE_COUNT = 4;
const SYNTH_SEQUENCE_VARIATION_COMMIT_POLL_MS = 50;
// Core accepts low-BPM test/session states below the normal UI slider floor.
// Eight minutes covers a 32-step 1/4 variation at 20 BPM, including the
// slowest supported lane tempo multiplier, while lifecycle changes cancel
// immediately instead of waiting for this bound.
const SYNTH_SEQUENCE_VARIATION_COMMIT_TIMEOUT_MS = 8 * 60_000;
const FX_ROUTE_COUNT = 100;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function waitNativeControlBoundary(delayMs = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export type MacNativeSynthSequenceVariationRuntime = {
  schemaVersion: number;
  activeVariation: number;
  chainPosition: number;
  activeStep: number;
  revision: number;
  nextBoundaryFrame: number;
};

export function decodeMacNativeSynthSequenceVariationRuntime(
  encoded: string,
): MacNativeSynthSequenceVariationRuntime {
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== SYNTH_SEQUENCE_VARIATION_RUNTIME_BYTES) {
    throw new Error(
      `Native Product Core synth variation runtime is ${bytes.byteLength} bytes; ` +
      `expected ${SYNTH_SEQUENCE_VARIATION_RUNTIME_BYTES}`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    schemaVersion: view.getUint32(0, true),
    activeVariation: view.getUint32(4, true),
    chainPosition: view.getUint32(8, true),
    activeStep: view.getUint32(12, true),
    revision: Number(view.getBigUint64(16, true)),
    nextBoundaryFrame: Number(view.getBigUint64(24, true)),
  };
}

export function encodeMacNativeProductEvents(events: readonly CoreProductEvent[]): Uint8Array {
  const bytes = new Uint8Array(EVENT_BYTES * events.length);
  const view = new DataView(bytes.buffer);
  events.forEach((event, index) => {
    const offset = index * EVENT_BYTES;
    view.setUint32(offset, event.sampleOffset ?? 0, true);
    view.setUint32(offset + 4, event.eventKind, true);
    view.setUint32(offset + 8, event.targetId ?? 0, true);
    view.setUint32(offset + 12, event.index ?? 0, true);
    view.setUint32(offset + 16, event.paramId ?? 0, true);
    view.setFloat32(offset + 20, event.value ?? 0, true);
    view.setFloat32(offset + 24, event.value2 ?? 0, true);
    view.setFloat32(offset + 28, event.value3 ?? 0, true);
    view.setFloat32(offset + 32, event.value4 ?? 0, true);
    view.setUint32(offset + 36, event.flags ?? 0, true);
  });
  return bytes;
}

function readUint64(view: DataView, offset: number): number {
  return Number(view.getBigUint64(offset, true));
}

export function decodeMacNativeProductTelemetry(encoded: string): CoreProductTelemetrySnapshot {
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== TELEMETRY_BYTES) {
    throw new Error(`Native Product Core telemetry is ${bytes.byteLength} bytes; expected ${TELEMETRY_BYTES}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const schemaHash = view.getUint32(0, true);
  if (schemaHash !== KESSHO_PRODUCT_SCHEMA_HASH) {
    throw new Error(`Native Product Core schema mismatch: ${schemaHash.toString(16)}`);
  }
  const runtimeWalkCount = Math.min(view.getUint32(156, true), 96);
  const runtimeWalkValues: Record<number, number> = {};
  for (let index = 0; index < runtimeWalkCount; index += 1) {
    const controlId = view.getUint32(160 + index * 4, true);
    if (controlId !== 0) runtimeWalkValues[controlId] = view.getFloat32(544 + index * 4, true);
  }
  const u32s = (offset: number, count: number) => Array.from({ length: count }, (_, index) => view.getUint32(offset + index * 4, true));
  const f32s = (offset: number, count: number) => Array.from({ length: count }, (_, index) => view.getFloat32(offset + index * 4, true));
  return {
    schemaHash,
    sampleRate: view.getFloat64(8, true),
    blockSize: view.getUint32(16, true),
    transportRunning: view.getUint32(20, true) !== 0,
    absoluteSampleTime: readUint64(view, 24),
    beatPosition: view.getFloat64(32, true),
    barIndex: readUint64(view, 40),
    phraseIndex: readUint64(view, 48),
    activeSources: view.getUint32(56, true),
    activeVoices: view.getUint32(60, true),
    activeAssets: view.getUint32(64, true),
    activeGrains: view.getUint32(68, true),
    renderCpuPercent: view.getFloat32(72, true),
    renderCpuPeakPercent: view.getFloat32(76, true),
    renderP95Ms: view.getFloat32(80, true),
    renderP99Ms: view.getFloat32(84, true),
    missedQuantumCount: view.getUint32(88, true),
    sequencerEventCount: view.getUint32(96, true),
    controlQueueDepth: view.getUint32(100, true),
    assetMissingCount: view.getUint32(104, true),
    lastErrorCode: view.getInt32(108, true),
    journeyMorphRunning: view.getUint32(112, true) !== 0,
    journeyMorphPhase: view.getFloat32(116, true),
    harmonyRootMidi: view.getFloat32(120, true),
    harmonyScaleId: view.getUint32(124, true),
    harmonyTension: view.getFloat32(128, true),
    harmonyChordDegree: view.getUint32(132, true),
    harmonyChordMidi: f32s(136, 4),
    runtimeWalkCount,
    runtimeWalkValues,
    rngSeed: view.getUint32(928, true),
    rngState: view.getUint32(932, true),
    sourcePresetIds: u32s(936, 8),
    masterInputPeak: view.getFloat32(968, true),
    masterOutputPeak: view.getFloat32(972, true),
    masterOutputRms: view.getFloat32(976, true),
    masterLimiterGainReductionDb: view.getFloat32(980, true),
    dynamicsSaturationDrive: view.getFloat32(984, true),
    sequencerUiStateRevision: view.getUint32(988, true),
    masterTruePeak: view.getFloat32(992, true),
    masterTruePeakDbtp: view.getFloat32(996, true),
    masterIntegratedLufs: view.getFloat32(1000, true),
    granularWriteHeadPosition: view.getFloat32(1004, true),
    granularVoicePositions: f32s(1008, 4) as [number, number, number, number],
    pad1FilterFreq: view.getFloat32(1024, true),
    pad1Lfo1Value: view.getFloat32(1028, true),
    pad2FilterFreq: view.getFloat32(1032, true),
    pad2Lfo1Value: view.getFloat32(1036, true),
    synthSequencerHitCounts: u32s(1040, 16),
    drumSequencerHitCounts: u32s(1104, 16),
    synthSequencerCurrentSteps: u32s(1168, 16),
    drumSequencerCurrentSteps: u32s(1232, 16),
    synthArpCurrentSteps: u32s(1296, 16),
    transportBpm: view.getFloat32(14076, true),
    transportBeatsPerBar: view.getUint32(14080, true),
    transportBarsPerPhrase: view.getUint32(14084, true),
    transportPhraseSeconds: view.getFloat32(14088, true),
    transportTransitionPending: view.getUint32(14092, true) !== 0,
    transportPendingBpm: view.getFloat32(14096, true),
    transportPendingBeatsPerBar: view.getUint32(14100, true),
    transportPendingBarsPerPhrase: view.getUint32(14104, true),
    transportPendingPhraseSeconds: view.getFloat32(14108, true),
    transportPendingApplyFrame: readUint64(view, 14112),
    transportTransitionRevision: view.getUint32(14120, true),
    transportPhraseProgress: view.getFloat32(14124, true),
    sourceMorphAutomationEnabledMask: view.getUint32(14128, true),
    sourceMorphValues: f32s(14132, 11),
    autoStopEnabled: view.getUint32(14176, true) !== 0,
    autoStopTargetSampleFrame: readUint64(view, 14184),
    synthArpCurrentMidis: f32s(14192, 16),
    scatterCurrentPhraseId: view.getUint32(14256, true),
    scatterCurrentVoice: view.getUint32(14260, true),
    scatterCurrentStep: view.getUint32(14264, true),
    scatterPulseCount: view.getUint32(14268, true),
    sceneProgramRevision: view.getUint32(14272, true),
    scenePosition: view.getFloat32(14276, true),
    routingMuteGroupRevision: view.getUint32(14280, true),
    routingMuteGroupActiveSlot: view.getUint32(14284, true),
    routingMuteGroupNextSlot: view.getUint32(14288, true),
    routingMuteGroupMask: view.getUint32(14292, true),
    routingMuteGroupNextChangeFrame: readUint64(view, 14296),
    routingMuteGroupTransitionProgress: view.getFloat32(14304, true),
    routingMuteGroupsEnabled: view.getUint32(14308, true) !== 0,
    routingMuteGroupTraceRevision: view.getUint32(14312, true),
    autoCycleRevision: view.getUint32(14316, true),
    autoCyclePhase: view.getUint32(14320, true),
    autoCyclePosition: view.getFloat32(14324, true),
    autoCyclePhaseStartFrame: readUint64(view, 14328),
    autoCyclePhaseEndFrame: readUint64(view, 14336),
    autoCycleTransitionCount: view.getUint32(14344, true),
    autoCycleEnabled: view.getUint32(14348, true) !== 0,
    journeyScheduleRevision: view.getUint32(14352, true),
    journeySchedulePhase: view.getUint32(14356, true),
    journeyCurrentNodeIndex: view.getUint32(14360, true),
    journeyNextNodeIndex: view.getUint32(14364, true),
    journeyScheduleIndex: view.getUint32(14368, true),
    journeyLoopIndex: view.getUint32(14372, true),
    journeyHoldProgress: view.getFloat32(14376, true),
    journeyMorphProgress: view.getFloat32(14380, true),
    journeyPreparedTotalFrames: readUint64(view, 14384),
    journeyTransitionCount: view.getUint32(14392, true),
    journeyScheduleRunning: view.getUint32(14396, true) !== 0,
    journeyRngStateAfterPlan: view.getUint32(14400, true),
    journeyScheduleEntryCount: view.getUint32(14404, true),
    harmonyPlayDispatchCount: readUint64(view, 14408),
    harmonyPlayLastDispatchFrame: readUint64(view, 14416),
    harmonyPlayDispatchLatencyMs: view.getFloat32(14424, true),
    harmonyNotePoolMidi: f32s(14432, Math.min(view.getUint32(14428, true), 8)),
    harmonyNextNotePoolMidi: f32s(14468, Math.min(view.getUint32(14464, true), 8)),
    harmonyNextSource: view.getUint32(14500, true),
    harmonyNextStepIndex: view.getInt32(14504, true),
    fxRouteEffectiveAmounts: f32s(14508, FX_ROUTE_COUNT),
  };
}

export function decodeMacNativeProductInteractionSignals(encoded: string): ProductInteractionSignalSnapshot {
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== INTERACTION_SIGNAL_BYTES) {
    throw new Error(`Native Product Core interaction signals are ${bytes.byteLength} bytes; expected ${INTERACTION_SIGNAL_BYTES}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, true);
  if (version !== 0 && version !== PRODUCT_INTERACTION_VERSION) {
    throw new Error(`Native Product Core interaction version mismatch: ${version}`);
  }
  const values = (offset: number) => Array.from(
    { length: PRODUCT_INTERACTION_SOURCE_COUNT },
    (_, index) => view.getFloat32(offset + index * 4, true),
  );
  return {
    version,
    revision: view.getUint32(4, true),
    demandMask: view.getUint32(8, true),
    sourceMask: view.getUint32(12, true),
    validSourceMask: view.getUint32(16, true),
    sampleFrame: readUint64(view, 24),
    envelope: values(32),
    peak: values(72),
    rms: values(112),
    onsetStrength: values(152),
  };
}

export function decodeMacNativeProductInteractionEvents(encoded: string): ProductInteractionEvent[] {
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength % INTERACTION_EVENT_BYTES !== 0) {
    throw new Error(`Native Product Core interaction events are ${bytes.byteLength} bytes; expected 40-byte records`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const events = new Array<ProductInteractionEvent>(bytes.byteLength / INTERACTION_EVENT_BYTES);
  for (let index = 0; index < events.length; index += 1) {
    const offset = index * INTERACTION_EVENT_BYTES;
    events[index] = {
      type: view.getUint32(offset, true) as ProductInteractionEvent['type'],
      parent: view.getUint32(offset + 4, true) as ProductInteractionEvent['parent'],
      child: view.getUint32(offset + 8, true) as ProductInteractionEvent['child'],
      origin: view.getUint32(offset + 12, true) as ProductInteractionEvent['origin'],
      tap: view.getUint32(offset + 16, true) as ProductInteractionEvent['tap'],
      flags: view.getUint32(offset + 20, true),
      sampleFrame: readUint64(view, offset + 24),
      value: view.getFloat32(offset + 32, true),
      strength: view.getFloat32(offset + 36, true),
    };
  }
  return events;
}

export class MacNativeProductRuntime {
  private chain: Promise<unknown> = Promise.resolve();
  private prepared = false;
  private snapshotExpected = false;
  private readonly stagedEvents: CoreProductEvent[] = [];
  private readonly captureListeners = new Set<(batch: RecordedNoteCaptureBatch) => void>();
  private nativeCaptureClockBeat: number | null = null;
  private nativeCaptureClockBpm: number | null = null;
  private nativeCaptureClockPerformanceMs: number | null = null;
  private nativeCaptureListenerInstall: Promise<void> | null = null;
  private nativeCaptureListenerHandle: { remove: () => Promise<void> | void } | null = null;
  private activeSynthSequenceVariationIndices: readonly (number | null)[] =
    Array.from({ length: SYNTH_SEQUENCE_VARIATION_LANE_COUNT }, () => null);
  private readonly synthSequenceVariationRuntimeListeners = new Set<
    (indices: readonly (number | null)[]) => void
  >();
  private synthSequenceVariationRuntimeTimer: ReturnType<typeof setInterval> | null = null;
  private synthSequenceVariationRuntimePollInFlight = false;
  private running = false;
  private lifecycleGeneration = 0;

  static createIfAvailable(): MacNativeProductRuntime | null {
    const plugin = getMacNativeProductRuntimePlugin();
    return plugin ? new MacNativeProductRuntime(plugin) : null;
  }

  private constructor(private readonly plugin: KesshoNativeProductRuntimePlugin) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.chain.then(operation, operation);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    await this.enqueue(() => this.plugin.prepareNativeProductRuntime());
    this.prepared = true;
  }

  async resume(): Promise<void> {
    await this.prepare();
    await this.enqueue(() => this.plugin.startNativeProductRuntime());
    this.running = true;
    this.lifecycleGeneration += 1;
    this.syncSynthSequenceVariationRuntimePolling();
  }

  suspend(): Promise<unknown> {
    this.running = false;
    this.lifecycleGeneration += 1;
    return this.enqueue(() => this.plugin.stopNativeProductRuntime()).finally(async () => {
      this.stopSynthSequenceVariationRuntimePolling();
      this.publishSynthSequenceVariationRuntime([null, null, null, null]);
      this.nativeCaptureClockBeat = null;
      this.nativeCaptureClockBpm = null;
      this.nativeCaptureClockPerformanceMs = null;
      await this.disposeCaptureListener();
    });
  }

  expectSnapshot(): void {
    this.snapshotExpected = true;
  }

  loadSnapshot(
    snapshot: ArrayBuffer,
    metadata?: ProductRuntimeSnapshotMetadata,
  ): Promise<ProductSnapshotAppliedReceipt> {
    const snapshotBase64 = bytesToBase64(new Uint8Array(snapshot));
    return this.enqueue(async () => {
      await this.plugin.loadNativeProductSnapshot({
        snapshotBase64,
      });
      this.snapshotExpected = false;
      const staged = this.stagedEvents.splice(0);
      if (staged.length > 0) {
        await this.plugin.enqueueNativeProductEvents({
          eventsBase64: bytesToBase64(encodeMacNativeProductEvents(staged)),
        });
      }
      return {
        revision: metadata?.revision ?? 0,
        applied: true,
        encodedSnapshotHash: metadata?.encodedSnapshotHash ?? '',
      };
    });
  }

  postEvents(events: readonly CoreProductEvent[]): void {
    if (events.length === 0) return;
    if (this.snapshotExpected) {
      this.stagedEvents.push(...events);
      return;
    }
    const eventsBase64 = bytesToBase64(encodeMacNativeProductEvents(events));
    void this.enqueue(() => this.plugin.enqueueNativeProductEvents({ eventsBase64 })).catch((error) => {
      console.error('Native Product Core event delivery failed:', error);
    });
  }

  async commitSynthSequenceVariationBank(
    laneIndex: number,
    bank: SynthSequenceVariationBank | null,
  ): Promise<boolean> {
    if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= SYNTH_SEQUENCE_VARIATION_LANE_COUNT) {
      throw new RangeError(`Invalid synth variation lane: ${laneIndex}`);
    }
    if (!this.running) {
      throw new Error('Native synth variation bank transaction requires a running audio runtime');
    }
    const lifecycleGeneration = this.lifecycleGeneration;
    await this.prepare();
    if (lifecycleGeneration !== this.lifecycleGeneration || !this.running) {
      throw new Error('Native synth variation bank transaction cancelled by the audio lifecycle');
    }
    const payload = encodeSynthSequenceVariationBank(bank);
    const staged = await this.enqueue(() => this.plugin.setNativeSynthSequenceVariationBank({
      laneIndex,
      bankBase64: bytesToBase64(new Uint8Array(payload)),
    }));
    if (staged.result !== 1) {
      throw new Error(`Native synth variation bank transaction failed: ${staged.result}`);
    }
    const expectedNativeRevision = Number(staged.nativeRevision);
    if (!Number.isSafeInteger(expectedNativeRevision) || expectedNativeRevision <= 0) {
      throw new Error(`Native synth variation bank transaction returned invalid revision: ${String(staged.nativeRevision)}`);
    }
    let lastRuntimeReadError: unknown = null;
    const deadline = Date.now() + SYNTH_SEQUENCE_VARIATION_COMMIT_TIMEOUT_MS;
    for (;;) {
      if (lifecycleGeneration !== this.lifecycleGeneration || !this.running) {
        throw new Error('Native synth variation bank transaction cancelled by the audio lifecycle');
      }
      try {
        const runtime = decodeMacNativeSynthSequenceVariationRuntime(
          (await this.enqueue(() => this.plugin.getNativeSynthSequenceVariationRuntime({ laneIndex }))).runtimeBase64,
        );
        if (runtime.revision === expectedNativeRevision) return true;
        if (runtime.revision > expectedNativeRevision) {
          throw new Error(
            `Native synth variation bank transaction superseded by revision ${runtime.revision}`,
          );
        }
        lastRuntimeReadError = null;
      } catch (error) {
        if (error instanceof Error && error.message.includes('superseded by revision')) throw error;
        // Native runtime publication may report an unavailable read while the
        // render thread swaps its compact telemetry buffer. Retry that bounded
        // read just like a bank that has not reached its next boundary yet.
        lastRuntimeReadError = error;
      }
      if (Date.now() >= deadline) break;
      await waitNativeControlBoundary(SYNTH_SEQUENCE_VARIATION_COMMIT_POLL_MS);
    }
    const readError = lastRuntimeReadError
      ? `: ${lastRuntimeReadError instanceof Error ? lastRuntimeReadError.message : String(lastRuntimeReadError)}`
      : '';
    throw new Error(
      `Native synth variation bank transaction did not reach revision ${expectedNativeRevision} before timeout${readError}`,
    );
  }

  getActiveSynthSequenceVariationIndices(): readonly (number | null)[] {
    return this.activeSynthSequenceVariationIndices;
  }

  private publishSynthSequenceVariationRuntime(next: readonly (number | null)[]): void {
    if (next.every((value, index) => value === this.activeSynthSequenceVariationIndices[index])) return;
    this.activeSynthSequenceVariationIndices = next;
    for (const listener of this.synthSequenceVariationRuntimeListeners) listener(next);
  }

  subscribeSynthSequenceVariationRuntime(
    listener: (indices: readonly (number | null)[]) => void,
  ): () => void {
    this.synthSequenceVariationRuntimeListeners.add(listener);
    listener(this.activeSynthSequenceVariationIndices);
    this.syncSynthSequenceVariationRuntimePolling();
    return () => {
      this.synthSequenceVariationRuntimeListeners.delete(listener);
      this.syncSynthSequenceVariationRuntimePolling();
    };
  }

  private syncSynthSequenceVariationRuntimePolling(): void {
    if (!this.running || this.synthSequenceVariationRuntimeListeners.size === 0 || this.synthSequenceVariationRuntimeTimer !== null) return;
    // Runtime telemetry is a compact 32-byte read per lane; poll at the same
    // coarse cadence as native Product telemetry instead of serializing state.
    this.synthSequenceVariationRuntimeTimer = setInterval(() => {
      void this.pollSynthSequenceVariationRuntime();
    }, 250);
    void this.pollSynthSequenceVariationRuntime();
  }

  private stopSynthSequenceVariationRuntimePolling(): void {
    if (this.synthSequenceVariationRuntimeTimer === null) return;
    clearInterval(this.synthSequenceVariationRuntimeTimer);
    this.synthSequenceVariationRuntimeTimer = null;
  }

  private async pollSynthSequenceVariationRuntime(): Promise<void> {
    if (!this.running || this.synthSequenceVariationRuntimeListeners.size === 0 || this.synthSequenceVariationRuntimePollInFlight) return;
    this.synthSequenceVariationRuntimePollInFlight = true;
    try {
      const runtimes = await Promise.all(Array.from(
        { length: SYNTH_SEQUENCE_VARIATION_LANE_COUNT },
        async (_, laneIndex) => decodeMacNativeSynthSequenceVariationRuntime(
          (await this.enqueue(() => this.plugin.getNativeSynthSequenceVariationRuntime({ laneIndex }))).runtimeBase64,
        ),
      ));
      const next = runtimes.map((runtime) => (
        runtime.schemaVersion === 1 && runtime.activeVariation < SYNTH_SEQUENCE_VARIATION_LANE_COUNT
          ? runtime.activeVariation
          : null
      ));
      if (!this.running) return;
      this.publishSynthSequenceVariationRuntime(next);
    } catch (error) {
      console.warn('Native synth variation runtime telemetry failed:', error);
    } finally {
      this.synthSequenceVariationRuntimePollInFlight = false;
    }
  }

  subscribeRecordedNoteCapture(listener: (batch: RecordedNoteCaptureBatch) => void): () => void {
    void this.ensureCaptureListener().catch(() => undefined);
    this.captureListeners.add(listener);
    return () => this.captureListeners.delete(listener);
  }

  setRecordedNoteCapture(request: RecordedNoteCaptureStartRequest): void {
    // The native bridge owns the same generated capture control event and
    // clocked ring.  It is intentionally explicit so a missing bridge cannot
    // report a browser-only success on macOS.
    void this.ensureCaptureListener().then(() => this.enqueue(
      () => this.plugin.setNativeProductCapture({ requestJson: JSON.stringify(request) }),
    )).catch((error) => {
      const batch: RecordedNoteCaptureBatch = {
        sessionToken: request.sessionToken,
        originBeat: request.originBeat ?? 0,
        clockBeat: request.originBeat ?? 0,
        events: [],
        phase: 'error',
        finalEventId: null,
        overflowCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      for (const listener of this.captureListeners) listener(batch);
    });
  }

  getRecordedNoteCaptureClockBeat(): number | null {
    if (this.nativeCaptureClockBeat === null) return null;
    const now = typeof performance !== 'undefined' ? performance.now() : null;
    const elapsedSeconds = now !== null && this.nativeCaptureClockPerformanceMs !== null
      ? Math.max(0, (now - this.nativeCaptureClockPerformanceMs) / 1000)
      : 0;
    const bpm = this.nativeCaptureClockBpm;
    return bpm !== null && Number.isFinite(bpm)
      ? this.nativeCaptureClockBeat + elapsedSeconds * bpm / 60
      : this.nativeCaptureClockBeat;
  }

  private ensureCaptureListener(): Promise<void> {
    if (this.nativeCaptureListenerInstall) return this.nativeCaptureListenerInstall;
    this.nativeCaptureListenerInstall = this.plugin.addListener(
      'recordedCaptureBatch',
      (batch) => {
        if (Number.isFinite(batch.clockBeat)) {
          this.nativeCaptureClockBeat = batch.clockBeat;
          this.nativeCaptureClockBpm = Number.isFinite(batch.clockBpm ?? NaN) ? batch.clockBpm ?? null : null;
          this.nativeCaptureClockPerformanceMs = typeof performance !== 'undefined' ? performance.now() : null;
        }
        for (const listener of this.captureListeners) listener(batch);
      },
    ).then((handle) => {
      this.nativeCaptureListenerHandle = handle;
    }).catch((error) => {
      this.nativeCaptureListenerInstall = null;
      console.error('Native Product Core capture listener failed:', error);
      throw error;
    });
    return this.nativeCaptureListenerInstall;
  }

  private async disposeCaptureListener(): Promise<void> {
    const handle = this.nativeCaptureListenerHandle;
    this.nativeCaptureListenerHandle = null;
    this.nativeCaptureListenerInstall = null;
    if (handle) await handle.remove();
  }

  registerAsset(asset: DecodedCoreProductAsset): Promise<unknown> {
    if (asset.sourceUrl) {
      const url = new URL(asset.sourceUrl, window.location.href);
      if (url.origin === window.location.origin) {
        return this.enqueue(() => this.plugin.registerNativeProductFileAsset({
          assetId: asset.assetId,
          assetPath: url.pathname,
          flags: asset.flags,
        }));
      }
    }
    return this.enqueue(() => this.plugin.registerNativeProductDecodedAsset({
      assetId: asset.assetId,
      sampleRate: asset.sampleRate,
      flags: asset.flags,
      channelsBase64: asset.channels.map((channel) => bytesToBase64(
        new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength),
      )),
    }));
  }

  unregisterAsset(assetId: number): Promise<unknown> {
    return this.enqueue(() => this.plugin.unregisterNativeProductAsset({ assetId }));
  }

  reset(): void {
    void this.enqueue(() => this.plugin.resetNativeProductRuntime()).catch((error) => {
      console.error('Native Product Core reset failed:', error);
    });
  }

  setInteractionDemand(demandMask: number, sourceMask: number): void {
    void this.enqueue(() => this.plugin.setNativeProductInteractionDemand({ demandMask, sourceMask })).catch((error) => {
      console.error('Native Product Core interaction demand failed:', error);
    });
  }

  async telemetry(): Promise<CoreProductTelemetrySnapshot> {
    const result = await this.enqueue(() => this.plugin.getNativeProductTelemetry());
    return {
      ...decodeMacNativeProductTelemetry(result.telemetryBase64),
      interactionSignals: decodeMacNativeProductInteractionSignals(result.interactionBase64),
      interactionEvents: decodeMacNativeProductInteractionEvents(result.interactionEventsBase64),
      interactionEventOverflowCount: result.interactionEventOverflowCount,
    };
  }
}
