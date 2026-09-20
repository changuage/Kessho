import type { CoreProductEvent } from '../../coreProductEvents';
import type { DecodedCoreProductAsset } from '../../coreProductAssets';
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
  }

  suspend(): Promise<unknown> {
    return this.enqueue(() => this.plugin.stopNativeProductRuntime());
  }

  expectSnapshot(): void {
    this.snapshotExpected = true;
  }

  loadSnapshot(snapshot: ArrayBuffer): Promise<unknown> {
    const snapshotBase64 = bytesToBase64(new Uint8Array(snapshot));
    return this.enqueue(async () => {
      const result = await this.plugin.loadNativeProductSnapshot({ snapshotBase64 });
      this.snapshotExpected = false;
      const staged = this.stagedEvents.splice(0);
      if (staged.length > 0) {
        await this.plugin.enqueueNativeProductEvents({
          eventsBase64: bytesToBase64(encodeMacNativeProductEvents(staged)),
        });
      }
      return result;
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
