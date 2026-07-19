import type { CoreProductEvent } from './coreProductEvents';
import { cloneDecodedCoreProductAssetForTransfer, type DecodedCoreProductAsset } from './coreProductAssets';
import type {
  ProductRuntimeSnapshotMetadata,
  ProductSnapshotAppliedReceipt,
} from './product/ProductEngineTypes';
import type { CoreProductTelemetrySnapshot, CoreProductVisualTelemetrySnapshot } from './coreProductTelemetry';
import {
  DAW_OUTPUT_MAX_CHANNELS,
  createDefaultDawOutputRoutingConfig,
  sanitizeDawOutputRoutingConfig,
  type DawOutputRoutingConfig,
} from './dawOutputRouting';
import { CORE_PRODUCT_RUNTIME_ASSET_VERSION } from './generated/coreProductRuntimeAssetVersion';
import { isIOSLikeDevice, isMobileDevice } from '../platform';
import { logProductStateDebug } from '../debug/productStateDebug';
import { ProductBrowserAudioSession } from './product/browser/ProductBrowserAudioSession';

export type AssetTransferOwnership = 'retain-host-copy' | 'transfer';

const CORE_PRODUCT_GRAPH_TAP_COUNT = 116;
const CORE_PRODUCT_TELEMETRY_DESKTOP_INTERVAL_MS = 250;
const CORE_PRODUCT_TELEMETRY_MOBILE_INTERVAL_MS = 500;
const CORE_PRODUCT_VISUAL_TELEMETRY_DESKTOP_INTERVAL_MS = 33;
const CORE_PRODUCT_VISUAL_TELEMETRY_MOBILE_INTERVAL_MS = 67;
const CORE_PRODUCT_RUNTIME_ASSET_RETRY_COUNT = 2;
const SNAPSHOT_APPLIED_TIMEOUT_MS = 4000;
const CORE_PRODUCT_GRAPH_CAPTURE_ALLOWED =
  import.meta.env.DEV || import.meta.env.VITE_KESSHO_ENABLE_GRAPH_CAPTURE === 'true';

type RuntimeMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | {
      type: 'snapshot-applied';
      revision: number;
      encodedSnapshotHash: string;
      workletSourceSummaryHash?: string;
      appliedAtFrame?: number;
    }
  | { type: 'perf'; cpuPercent: number; peakPercent: number; sequencerEventCount?: number; controlQueueDepth?: number }
  | { type: 'telemetry'; telemetry: CoreProductTelemetrySnapshot }
  | { type: 'visual-telemetry'; telemetry: CoreProductVisualTelemetrySnapshot }
  | { type: 'graph-capture-chunk'; tapId: number; frameCount: number; left: Float32Array; right: Float32Array }
  | { type: 'graph-capture-flushed'; tapId: number; stopped?: boolean }
  | { type: 'asset-release-complete'; assetId: number }
  | { type: 'asset-release-failed'; assetId: number; result: number }
  | { type: 'asset-registration-complete'; assetId: number }
  | { type: 'asset-registration-failed'; assetId: number; result: number; message: string };

export type CoreProductGraphTapCaptureChunk = {
  tapId: number;
  frameCount: number;
  left: Float32Array;
  right: Float32Array;
};

type GraphTapCaptureSession = {
  tapId: number;
  chunks: CoreProductGraphTapCaptureChunk[];
  resolveFlush: (() => void) | null;
  rejectFlush: ((error: Error) => void) | null;
};

type PendingSnapshotReceipt = {
  metadata: ProductRuntimeSnapshotMetadata;
  resolve: (receipt: ProductSnapshotAppliedReceipt) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type AudioContextWithSinkId = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

function createProductAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('Core Product runtime requires AudioContext support');
  }
  const preferStableMobileBuffers = isMobileDevice() || isIOSLikeDevice();
  return new AudioContextCtor(preferStableMobileBuffers ? { latencyHint: 'playback' } : undefined);
}

function runtimeAssetDelay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withRuntimeAssetRetries<T>(operation: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= CORE_PRODUCT_RUNTIME_ASSET_RETRY_COUNT; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= CORE_PRODUCT_RUNTIME_ASSET_RETRY_COUNT) break;
      await runtimeAssetDelay(100 * (attempt + 1));
    }
  }
  throw lastError;
}

export class CoreProductRuntime {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private outputGain: GainNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private mediaSessionAudio: HTMLAudioElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private playbackRevision = 0;
  private playbackRequested = false;
  private readonly browserAudioSession = new ProductBrowserAudioSession(() => {
    if (this.playbackRequested) {
      void this.resumeAfterInterruption().catch((error: unknown) => {
        console.warn('Core Product interruption recovery failed:', error);
      });
    }
  });
  private lastError: string | null = null;
  private telemetryTimer: number | null = null;
  private visualTelemetryTimer: number | null = null;
  private telemetryCallback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;
  private visualTelemetryCallback: ((telemetry: CoreProductVisualTelemetrySnapshot) => void) | null = null;
  private assetReleaseCallback: ((assetId: number) => void) | null = null;
  private assetReleaseFailureCallback: ((assetId: number, result: number) => void) | null = null;
  private telemetryPollingEnabled = false;
  private transportRunningForTelemetry = false;
  private visualTelemetryActive = false;
  private granularWaveformTelemetryActive = false;
  private simpleSequencerVisualDemandMask = 0;
  private perfMonitorEnabled = false;
  private dawOutputRouting: DawOutputRoutingConfig = createDefaultDawOutputRoutingConfig();
  private dawOutputDeviceId: string | null = null;
  private readonly pendingSnapshotReceipts = new Map<number, PendingSnapshotReceipt>();
  private readonly pendingAssetRegistrations = new Map<number, {
    resolve: () => void;
    reject: (error: Error) => void;
    promise: Promise<void>;
  }>();
  private readonly graphTapCaptureSessions = new Map<number, GraphTapCaptureSession>();
  private readonly handleVisibilityChange = (): void => {
    const hidden = !this.isDocumentVisible();
    this.node?.port.postMessage({ type: 'host-visibility', hidden });
    this.syncTelemetryLoop();
    this.syncVisualTelemetryLoop();
    this.syncMeterDemand();
    this.syncStemDemand();
    if (this.isDocumentVisible()) {
      this.requestTelemetryOnce('visibility-resume');
    }
  };

  get audioContext(): AudioContext | null {
    return this.context;
  }

  get outputNode(): AudioNode | null {
    return this.outputGain ?? this.node;
  }

  setOutputGain(target: number, durationSeconds = 0): void {
    const context = this.context;
    const gain = this.outputGain?.gain;
    if (!context || !gain) return;
    const now = context.currentTime;
    const value = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 1));
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (durationSeconds > 0) {
      gain.linearRampToValueAtTime(value, now + Math.max(0.01, durationSeconds));
    } else {
      gain.setValueAtTime(value, now);
    }
  }

  get error(): string | null {
    return this.lastError;
  }

  async ensureStarted(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
      return;
    }

    this.readyPromise = this.initializeRuntime().catch((error: unknown) => {
      this.readyPromise = null;
      throw error;
    });
    await this.readyPromise;
  }

  private async initializeRuntime(): Promise<void> {
    const context = createProductAudioContext();
    this.context = context;
    this.prepareMediaSessionPlayback(context);
    this.publishParityStartupPhase('context-created');
    if (this.dawOutputDeviceId) {
      await this.applyDawOutputDeviceId(context);
    }
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    const productAssetUrl = (path: string, attempt = 0): URL => {
      const url = new URL(path, base);
      url.searchParams.set('v', CORE_PRODUCT_RUNTIME_ASSET_VERSION);
      if (attempt > 0) url.searchParams.set('retry', String(attempt));
      return url;
    };
    await withRuntimeAssetRetries((attempt) =>
      context.audioWorklet.addModule(productAssetUrl('worklets/kessho-core-product.worklet.js', attempt))
    );
    this.publishParityStartupPhase('worklet-module-loaded');
    const wasmUrl = productAssetUrl('worklets/kessho_core.wasm');
    const wasmBinary = await withRuntimeAssetRetries(async (attempt) => {
      const attemptWasmUrl = productAssetUrl('worklets/kessho_core.wasm', attempt);
      const response = await fetch(attemptWasmUrl, {
        cache: attempt > 0 ? 'reload' : 'default',
      });
      if (!response.ok) throw new Error(`Failed to fetch ${wasmUrl}: ${response.status}`);
      return response.arrayBuffer();
    });
    this.publishParityStartupPhase('wasm-fetched');

    await new Promise<void>((resolve, reject) => {
      const node = this.createProductWorkletNode(context, wasmBinary, wasmUrl.toString());
      this.publishParityStartupPhase('worklet-node-created');
      const outputGain = context.createGain();
      outputGain.gain.value = 1;
      this.configureOutputNode(outputGain);
      this.node = node;
      this.outputGain = outputGain;
      this.bindVisibilityTelemetrySync();
      node.port.postMessage({ type: 'host-visibility', hidden: !this.isDocumentVisible() });
      if (this.perfMonitorEnabled) {
        node.port.postMessage({ type: 'enablePerf', enabled: true });
      }
      node.port.onmessage = (event: MessageEvent<RuntimeMessage>) => {
        const message = event.data;
        if (message.type === 'ready') {
          this.publishParityStartupPhase('ready');
          this.postDawOutputRouting();
          this.syncMeterDemand();
          this.syncStemDemand();
          this.syncSimpleSequencerVisualDemand();
          resolve();
          return;
        }
        if (message.type === 'error') {
          this.publishParityStartupPhase('error');
          if (new URLSearchParams(window.location.search).get('parity') === '1') {
            document.documentElement.dataset.coreProductRuntimeError = message.message;
          }
          this.lastError = message.message;
          const runtimeError = new Error(message.message);
          this.rejectPendingSnapshotReceipts(runtimeError);
          for (const session of this.graphTapCaptureSessions.values()) {
            session.rejectFlush?.(runtimeError);
            session.resolveFlush = null;
            session.rejectFlush = null;
          }
          reject(runtimeError);
          return;
        }
        if (message.type === 'snapshot-applied') {
          this.handleSnapshotApplied(message);
          return;
        }
        if (message.type === 'telemetry') {
          if (!this.isDocumentVisible()) return;
          this.telemetryCallback?.(message.telemetry);
          return;
        }
        if (message.type === 'visual-telemetry') {
          if (!this.isDocumentVisible()) return;
          this.visualTelemetryCallback?.(message.telemetry);
          return;
        }
        if (message.type === 'asset-release-complete') {
          this.assetReleaseCallback?.(message.assetId);
          return;
        }
        if (message.type === 'asset-release-failed') {
          this.assetReleaseFailureCallback?.(message.assetId, message.result);
          return;
        }
        if (message.type === 'asset-registration-complete') {
          this.pendingAssetRegistrations.get(message.assetId)?.resolve();
          this.pendingAssetRegistrations.delete(message.assetId);
          return;
        }
        if (message.type === 'asset-registration-failed') {
          this.pendingAssetRegistrations.get(message.assetId)?.reject(new Error(message.message));
          this.pendingAssetRegistrations.delete(message.assetId);
          return;
        }
        if (message.type === 'graph-capture-chunk') {
          const session = this.graphTapCaptureSessions.get(message.tapId);
          if (session) {
            session.chunks.push({
              tapId: message.tapId,
              frameCount: message.frameCount,
              left: message.left,
              right: message.right,
            });
          }
          return;
        }
        if (message.type === 'graph-capture-flushed') {
          const session = this.graphTapCaptureSessions.get(message.tapId);
          if (session?.resolveFlush) {
            session.resolveFlush();
            session.resolveFlush = null;
            session.rejectFlush = null;
          }
        }
      };
      node.connect(outputGain);
      this.connectOutputToBrowserSink(context, outputGain);
      this.syncTelemetryLoop();
      this.syncVisualTelemetryLoop();
    });
  }

  private publishParityStartupPhase(phase: string): void {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('parity') !== '1') return;
    document.documentElement.dataset.coreProductRuntimePhase = phase;
  }

  resumeFromUserGesture(): Promise<void> {
    return this.requestResume();
  }

  async resume(): Promise<void> {
    await this.requestResume();
  }

  private async resumeAfterInterruption(): Promise<void> {
    if (!this.playbackRequested) return;
    await this.requestResume();
  }

  private async requestResume(): Promise<void> {
    const revision = ++this.playbackRevision;
    this.playbackRequested = true;
    const ready = this.ensureStarted();
    const resumed = this.context?.resume() ?? Promise.resolve();
    const carrierPlayed = this.connectMediaSessionPlayback();
    this.browserAudioSession.setPlaybackRequested(true);
    this.publishParityAudioContextState();
    await Promise.all([ready, resumed, carrierPlayed]);
    if (revision !== this.playbackRevision) {
      if (!this.playbackRequested) await this.context?.suspend();
      return;
    }
    if (this.context?.state !== 'running') await this.context?.resume();
    if (revision !== this.playbackRevision && !this.playbackRequested) {
      await this.context?.suspend();
      return;
    }
    this.publishParityAudioContextState();
  }

  private publishParityAudioContextState(): void {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('parity') !== '1') return;
    document.documentElement.dataset.coreProductAudioContextState = this.context?.state ?? 'missing';
  }

  async suspend(): Promise<void> {
    ++this.playbackRevision;
    this.playbackRequested = false;
    this.browserAudioSession.setPlaybackRequested(false);
    this.pauseMediaSessionPlayback();
    await this.context?.suspend();
  }

  dispose(): void {
    ++this.playbackRevision;
    this.playbackRequested = false;
    this.browserAudioSession.dispose();
    if (this.telemetryTimer !== null) {
      window.clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    if (this.visualTelemetryTimer !== null) {
      window.clearInterval(this.visualTelemetryTimer);
      this.visualTelemetryTimer = null;
    }
    this.unbindVisibilityTelemetrySync();
    this.node?.disconnect();
    this.outputGain?.disconnect();
    this.mediaStreamDest?.disconnect();
    this.disconnectMediaSessionPlayback();
    this.rejectPendingSnapshotReceipts(new Error('Core Product runtime disposed before pending snapshots were applied'));
    const registrationError = new Error('Core Product runtime disposed before pending asset registrations completed');
    for (const pending of this.pendingAssetRegistrations.values()) pending.reject(registrationError);
    this.pendingAssetRegistrations.clear();
    const context = this.context;
    this.node = null;
    this.outputGain = null;
    this.mediaStreamDest = null;
    this.context = null;
    this.readyPromise = null;
    if (context && context.state !== 'closed') {
      void context.close();
    }
  }

  setTelemetryCallback(callback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null): void {
    this.telemetryCallback = callback;
  }

  setAssetReleaseCallback(callback: ((assetId: number) => void) | null): void {
    this.assetReleaseCallback = callback;
  }

  setAssetReleaseFailureCallback(callback: ((assetId: number, result: number) => void) | null): void {
    this.assetReleaseFailureCallback = callback;
  }

  setTelemetryPollingEnabled(enabled: boolean): void {
    if (this.telemetryPollingEnabled === enabled) return;
    this.telemetryPollingEnabled = enabled;
    this.syncTelemetryLoop();
    this.syncMeterDemand();
  }

  setTelemetryTransportRunning(running: boolean): void {
    if (this.transportRunningForTelemetry === running) return;
    this.transportRunningForTelemetry = running;
    this.syncTelemetryLoop();
  }

  setVisualTelemetryCallback(callback: ((telemetry: CoreProductVisualTelemetrySnapshot) => void) | null): void {
    this.visualTelemetryCallback = callback;
  }

  setVisualTelemetryActive(active: boolean): void {
    this.visualTelemetryActive = active;
    this.syncVisualTelemetryLoop();
    this.syncMeterDemand();
    this.syncStemDemand();
  }

  setGranularWaveformTelemetryActive(active: boolean): void {
    this.granularWaveformTelemetryActive = active;
  }

  setSimpleSequencerVisualPlanActive(active: { padChord: boolean; randomTiming: boolean }): void {
    this.simpleSequencerVisualDemandMask =
      (active.padChord ? 1 : 0) |
      (active.randomTiming ? 2 : 0);
    this.syncSimpleSequencerVisualDemand();
  }

  setPerfMonitorEnabled(enabled: boolean): void {
    this.perfMonitorEnabled = enabled;
    this.node?.port.postMessage({ type: 'enablePerf', enabled });
    this.syncMeterDemand();
  }

  setDawOutputRouting(config: DawOutputRoutingConfig): void {
    this.dawOutputRouting = sanitizeDawOutputRoutingConfig(config);
    this.configureBrowserSinkChannelCount();
    this.postDawOutputRouting();
  }

  async setDawOutputDeviceId(deviceId: string | null): Promise<boolean> {
    this.dawOutputDeviceId = deviceId && deviceId !== 'default' ? deviceId : null;
    return this.applyDawOutputDeviceId();
  }

  private prepareMediaSessionPlayback(context: AudioContext): void {
    if (!isIOSLikeDevice() || this.mediaSessionAudio) return;
    const audio = new Audio();
    audio.loop = false;
    audio.volume = 1;
    audio.setAttribute('playsinline', 'true');
    (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
    const destination = context.createMediaStreamDestination();
    this.mediaStreamDest = destination;
    audio.srcObject = destination.stream;
    this.mediaSessionAudio = audio;
  }

  private connectMediaSessionPlayback(): Promise<void> {
    if (!isIOSLikeDevice()) return Promise.resolve();
    if (this.context) this.prepareMediaSessionPlayback(this.context);
    const audio = this.mediaSessionAudio;
    const stream = this.mediaStreamDest?.stream ?? null;
    if (!audio || !stream) return Promise.resolve();
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    return audio.play().catch((error: unknown) => {
      console.warn('Core Product media session carrier play failed:', error);
    });
  }

  private disconnectMediaSessionPlayback(): void {
    this.pauseMediaSessionPlayback();
    if (this.mediaSessionAudio) {
      this.mediaSessionAudio.srcObject = null;
    }
  }

  postEvent(event: CoreProductEvent): void {
    this.requireNode('postEvent').port.postMessage({ type: 'event', event });
  }

  postEvents(events: readonly CoreProductEvent[]): void {
    if (events.length === 0) return;
    this.requireNode('postEvents').port.postMessage({
      type: 'events',
      events: [...events],
    });
  }

  requestTelemetryOnce(_reason: 'visibility-resume' | 'manual' = 'manual'): void {
    this.node?.port.postMessage({ type: 'request-telemetry' });
  }

  loadSnapshot(
    snapshot: ArrayBuffer,
    metadata?: ProductRuntimeSnapshotMetadata,
  ): Promise<ProductSnapshotAppliedReceipt> {
    const node = this.requireNode('loadSnapshot');
    if (!metadata) {
      node.port.postMessage({ type: 'snapshot', snapshot }, [snapshot]);
      return Promise.resolve({
        revision: 0,
        applied: true,
        encodedSnapshotHash: '',
      });
    }

    const pending = new Promise<ProductSnapshotAppliedReceipt>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingSnapshotReceipts.delete(metadata.revision);
        reject(new Error(
          `Timed out waiting for Product snapshot revision ${metadata.revision} ` +
          `(${metadata.encodedSnapshotHash}) to be applied by the audio thread`,
        ));
      }, SNAPSHOT_APPLIED_TIMEOUT_MS);
      this.pendingSnapshotReceipts.set(metadata.revision, {
        metadata,
        resolve,
        reject,
        timeout,
      });
    });

    node.port.postMessage({ type: 'snapshot', snapshot, metadata }, [snapshot]);
    return pending;
  }

  reset(): void {
    this.requireNode('reset').port.postMessage({ type: 'reset' });
  }

  resetParityFx(): void {
    this.requireNode('resetParityFx').port.postMessage({ type: 'reset-parity-fx' });
  }

  startGraphTapCapture(tapId: number, chunkFrames: number): void {
    this.assertGraphCaptureAllowed();
    const node = this.requireNode('startGraphTapCapture');
    const normalizedTapId = this.normalizeGraphTapId(tapId);
    const normalizedChunkFrames = Math.max(128, Math.round(chunkFrames || 4096));
    this.graphTapCaptureSessions.set(normalizedTapId, {
      tapId: normalizedTapId,
      chunks: [],
      resolveFlush: null,
      rejectFlush: null,
    });
    node.port.postMessage({
      type: 'graph-capture-start',
      tapId: normalizedTapId,
      chunkFrames: normalizedChunkFrames,
    });
  }

  async flushGraphTapCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> {
    return this.requestGraphTapFlush(tapId, false);
  }

  async stopGraphTapCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> {
    return this.requestGraphTapFlush(tapId, true);
  }

  registerAsset(
    asset: DecodedCoreProductAsset,
    ownership: AssetTransferOwnership = 'retain-host-copy',
  ): Promise<void> {
    const pending = this.pendingAssetRegistrations.get(asset.assetId);
    if (pending) return pending.promise;
    const transferAsset = ownership === 'retain-host-copy'
      ? cloneDecodedCoreProductAssetForTransfer(asset)
      : asset;
    const node = this.requireNode('registerAsset');
    let resolveRegistration: (() => void) | null = null;
    let rejectRegistration: ((error: Error) => void) | null = null;
    const registration = new Promise<void>((resolve, reject) => {
      resolveRegistration = resolve;
      rejectRegistration = reject;
    });
    this.pendingAssetRegistrations.set(asset.assetId, {
      resolve: () => resolveRegistration?.(),
      reject: (error) => rejectRegistration?.(error),
      promise: registration,
    });
    node.port.postMessage({
      type: 'register-asset',
      assetId: transferAsset.assetId,
      sampleRate: transferAsset.sampleRate,
      flags: transferAsset.flags,
      channels: transferAsset.channels,
    }, transferAsset.channels.map((channel) => channel.buffer));
    return registration;
  }

  requestAssetRelease(assetId: number): void {
    const normalizedAssetId = Math.trunc(Number(assetId));
    if (!Number.isFinite(normalizedAssetId) || normalizedAssetId <= 0) {
      throw new Error(`Core Product asset id is invalid: ${String(assetId)}`);
    }
    this.requireNode('requestAssetRelease').port.postMessage({
      type: 'unregister-asset',
      assetId: normalizedAssetId,
    });
  }

  unregisterAsset(assetId: number): void {
    this.requestAssetRelease(assetId);
  }

  private handleSnapshotApplied(message: Extract<RuntimeMessage, { type: 'snapshot-applied' }>): void {
    logProductStateDebug({
      stage: 'snapshot-applied',
      revision: message.revision,
      encodedSnapshotHash: message.encodedSnapshotHash,
      workletSourceSummaryHash: message.workletSourceSummaryHash ?? null,
      appliedAtFrame: message.appliedAtFrame ?? null,
    });
    const pending = this.pendingSnapshotReceipts.get(message.revision);
    if (!pending) return;
    if (pending.metadata.encodedSnapshotHash !== message.encodedSnapshotHash) {
      window.clearTimeout(pending.timeout);
      this.pendingSnapshotReceipts.delete(message.revision);
      pending.reject(new Error(
        `Product snapshot ack hash mismatch for revision ${message.revision}: ` +
        `expected ${pending.metadata.encodedSnapshotHash}, got ${message.encodedSnapshotHash}`,
      ));
      return;
    }
    window.clearTimeout(pending.timeout);
    this.pendingSnapshotReceipts.delete(message.revision);
    pending.resolve({
      revision: message.revision,
      applied: true,
      encodedSnapshotHash: message.encodedSnapshotHash,
      ...(message.workletSourceSummaryHash ? { workletSourceSummaryHash: message.workletSourceSummaryHash } : {}),
      ...(typeof message.appliedAtFrame === 'number' ? { appliedAtFrame: message.appliedAtFrame } : {}),
    });
  }

  private rejectPendingSnapshotReceipts(error: Error): void {
    for (const pending of this.pendingSnapshotReceipts.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingSnapshotReceipts.clear();
  }

  private requireNode(operation: string): AudioWorkletNode {
    if (!this.node) {
      throw new Error(`Core Product runtime cannot ${operation} before the product worklet is initialized`);
    }
    return this.node;
  }

  private createProductWorkletNode(
    context: AudioContext,
    wasmBinary: ArrayBuffer,
    wasmUrl: string,
  ): AudioWorkletNode {
    const processorOptions = {
      wasmBinary,
      wasmUrl,
      graphCaptureAllowed: CORE_PRODUCT_GRAPH_CAPTURE_ALLOWED,
    };

    if (isIOSLikeDevice()) {
      return new AudioWorkletNode(context, 'kessho-core-product', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions,
      });
    }

    const multichannelOptions: AudioWorkletNodeOptions = {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [DAW_OUTPUT_MAX_CHANNELS],
      channelCount: DAW_OUTPUT_MAX_CHANNELS,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions,
    };

    try {
      return new AudioWorkletNode(context, 'kessho-core-product', multichannelOptions);
    } catch (error) {
      console.warn('Core Product multichannel output unavailable; falling back to stereo output.', error);
      return new AudioWorkletNode(context, 'kessho-core-product', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        processorOptions,
      });
    }
  }

  private configureOutputNode(node: AudioNode): void {
    const channelCount = isIOSLikeDevice() ? 2 : DAW_OUTPUT_MAX_CHANNELS;
    try {
      node.channelCount = channelCount;
    } catch {
      // Some AudioNode implementations clamp channelCount. The worklet still renders safely.
    }
    try {
      node.channelCountMode = 'explicit';
    } catch {
      // Best effort only; output routing remains controlled by the worklet.
    }
    try {
      node.channelInterpretation = 'discrete';
    } catch {
      // Best effort only; unsupported browsers will downmix.
    }
  }

  private async applyDawOutputDeviceId(context: AudioContext | null = this.context): Promise<boolean> {
    if (!context || isIOSLikeDevice()) return false;
    const contextWithSink = context as AudioContextWithSinkId;
    if (typeof contextWithSink.setSinkId !== 'function') return false;
    try {
      await contextWithSink.setSinkId(this.dawOutputDeviceId ?? '');
      this.configureBrowserSinkChannelCount(context);
      return true;
    } catch (error) {
      console.warn('Core Product DAW output device selection failed:', error);
      return false;
    }
  }

  private postDawOutputRouting(): void {
    this.node?.port.postMessage({
      type: 'daw-output-routing',
      config: this.dawOutputRouting,
    });
  }

  private connectOutputToBrowserSink(context: AudioContext, output: AudioNode): void {
    if (isIOSLikeDevice()) {
      const destination = this.mediaStreamDest ?? context.createMediaStreamDestination();
      this.mediaStreamDest = destination;
      output.connect(destination);
      const audio = this.mediaSessionAudio;
      if (audio && audio.srcObject !== destination.stream) {
        audio.srcObject = destination.stream;
      }
      return;
    }
    this.configureBrowserSinkChannelCount(context);
    output.connect(context.destination);
  }

  private configureBrowserSinkChannelCount(context: AudioContext | null = this.context): void {
    if (!context || isIOSLikeDevice()) return;
    const destination = context.destination;
    const desiredChannelCount = this.dawOutputRouting.enabled
      ? this.dawOutputRouting.channelCount
      : 2;
    const maxChannelCount = Number.isFinite(destination.maxChannelCount)
      ? Math.max(2, destination.maxChannelCount)
      : desiredChannelCount;
    const channelCount = Math.max(2, Math.min(desiredChannelCount, maxChannelCount));

    try {
      destination.channelCount = channelCount;
    } catch {
      // Output devices can reject channel-count changes; stereo playback still works.
    }
    try {
      destination.channelCountMode = 'explicit';
    } catch {
      // Best effort only.
    }
    try {
      destination.channelInterpretation = 'discrete';
    } catch {
      // Best effort only.
    }
  }

  private pauseMediaSessionPlayback(): void {
    this.mediaSessionAudio?.pause();
  }

  private normalizeGraphTapId(tapId: number): number {
    const normalized = Math.trunc(Number(tapId));
    if (!Number.isFinite(normalized) || normalized < 0 || normalized >= CORE_PRODUCT_GRAPH_TAP_COUNT) {
      throw new Error(`Core Product graph tap id is invalid: ${String(tapId)}`);
    }
    return normalized;
  }

  private async requestGraphTapFlush(tapId: number, stopped: boolean): Promise<CoreProductGraphTapCaptureChunk[]> {
    this.assertGraphCaptureAllowed();
    const node = this.requireNode(stopped ? 'stopGraphTapCapture' : 'flushGraphTapCapture');
    const normalizedTapId = this.normalizeGraphTapId(tapId);
    const session = this.graphTapCaptureSessions.get(normalizedTapId);
    if (!session) {
      throw new Error(`Core Product graph tap ${normalizedTapId} capture has not been started`);
    }
    if (session.resolveFlush) {
      throw new Error(`Core Product graph tap ${normalizedTapId} capture is already flushing`);
    }
    await new Promise<void>((resolve, reject) => {
      session.resolveFlush = resolve;
      session.rejectFlush = reject;
      node.port.postMessage({
        type: stopped ? 'graph-capture-stop' : 'graph-capture-flush',
        tapId: normalizedTapId,
      });
    });
    const chunks = session.chunks.splice(0);
    if (stopped) {
      this.graphTapCaptureSessions.delete(normalizedTapId);
    }
    return chunks;
  }

  private telemetryIntervalMs(): number {
    return isMobileDevice() || isIOSLikeDevice()
      ? CORE_PRODUCT_TELEMETRY_MOBILE_INTERVAL_MS
      : CORE_PRODUCT_TELEMETRY_DESKTOP_INTERVAL_MS;
  }

  private visualTelemetryIntervalMs(): number {
    return isMobileDevice() || isIOSLikeDevice()
      ? CORE_PRODUCT_VISUAL_TELEMETRY_MOBILE_INTERVAL_MS
      : CORE_PRODUCT_VISUAL_TELEMETRY_DESKTOP_INTERVAL_MS;
  }

  private shouldPollTelemetry(): boolean {
    return this.telemetryPollingEnabled && this.transportRunningForTelemetry && this.isDocumentVisible();
  }

  private syncTelemetryLoop(): void {
    if (this.telemetryTimer !== null) {
      window.clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    if (!this.node || !this.shouldPollTelemetry()) return;
    const requestTelemetry = () => {
      if (!this.shouldPollTelemetry()) return;
      this.node?.port.postMessage({ type: 'request-telemetry' });
    };
    requestTelemetry();
    this.telemetryTimer = window.setInterval(requestTelemetry, this.telemetryIntervalMs());
  }

  private syncVisualTelemetryLoop(): void {
    if (this.visualTelemetryTimer !== null) {
      window.clearInterval(this.visualTelemetryTimer);
      this.visualTelemetryTimer = null;
    }
    if (!this.visualTelemetryActive || !this.node || !this.isDocumentVisible()) {
      return;
    }
    const requestVisualTelemetry = () => {
      if (!this.isDocumentVisible()) return;
      this.node?.port.postMessage({
        type: 'request-visual-telemetry',
        includeGranularWaveform: this.granularWaveformTelemetryActive,
      });
    };
    requestVisualTelemetry();
    this.visualTelemetryTimer = window.setInterval(requestVisualTelemetry, this.visualTelemetryIntervalMs());
  }

  private syncMeterDemand(): void {
    if (!this.node) return;
    const enabled = this.isDocumentVisible() && (
      this.telemetryPollingEnabled || this.visualTelemetryActive || this.perfMonitorEnabled
    );
    this.node.port.postMessage({ type: 'meter-demand', enabled });
  }

  private syncStemDemand(): void {
    if (!this.node) return;
    const enabled = this.isDocumentVisible() && this.visualTelemetryActive;
    this.node.port.postMessage({ type: 'stem-demand', enabled });
  }

  private syncSimpleSequencerVisualDemand(): void {
    this.node?.port.postMessage({
      type: 'simple-sequencer-visual-demand',
      mask: this.simpleSequencerVisualDemandMask,
    });
  }

  private assertGraphCaptureAllowed(): void {
    if (!CORE_PRODUCT_GRAPH_CAPTURE_ALLOWED) {
      throw new Error('Core Product graph capture is disabled in this build.');
    }
  }

  private isDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  private bindVisibilityTelemetrySync(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private unbindVisibilityTelemetrySync(): void {
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
