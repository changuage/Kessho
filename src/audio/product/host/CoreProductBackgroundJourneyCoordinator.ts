import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import { IOS_WEB_BACKGROUND_JOURNEY_LIMITS, type BackgroundJourneyPlan } from '../journey/compileBackgroundJourneyPlan';
import { createCoreProductJourneyScheduleEnabledEvent, createCoreProductJourneyScheduleEvents } from '../journey/createBackgroundJourneyEvents';
import type { ProductBackgroundJourneyReadiness } from '../ports/ProductJourneyPort';
import type { CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';

type Dependencies = {
  runtime: CoreProductRuntime;
  assets: CoreProductAssetRegistrar;
  telemetry: () => CoreProductTelemetrySnapshot | null;
  isDocumentVisible: () => boolean;
  waitForVisibleDelay?: (delayMs: number) => Promise<boolean>;
  post: (event: ReturnType<typeof createCoreProductJourneyScheduleEnabledEvent>) => void;
  stopLegacyMorphClock: () => void;
};

function waitForDocumentVisibleDelay(delayMs: number, isDocumentVisible: () => boolean): Promise<boolean> {
  if (!isDocumentVisible()) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (visible: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange);
      resolve(visible);
    };
    const handleVisibilityChange = (): void => {
      if (!isDocumentVisible()) finish(false);
    };

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange);
    timer = setTimeout(() => finish(isDocumentVisible()), delayMs);
  });
}

export class CoreProductBackgroundJourneyCoordinator {
  private readiness: ProductBackgroundJourneyReadiness = { status: 'idle' };
  private uploadGeneration = 0;
  private uploadCompletion: Promise<void> | null = null;
  private resolveUploadCompletion: (() => void) | null = null;
  private assetReadinessRevision = 0;

  constructor(private readonly dependencies: Dependencies) {}

  async prepare(plan: BackgroundJourneyPlan, states: readonly Record<string, unknown>[]): Promise<ProductBackgroundJourneyReadiness> {
    const requestedGeneration = this.uploadGeneration;
    while (this.uploadCompletion) await this.uploadCompletion;
    if (requestedGeneration !== this.uploadGeneration) return { status: 'idle' };
    const { assets, runtime } = this.dependencies;
    if (!this.dependencies.isDocumentVisible()) return this.fail({ status: 'not-ready', reason: 'document-hidden' });
    const completion = new Promise<void>((resolve) => { this.resolveUploadCompletion = resolve; });
    this.uploadCompletion = completion;
    const generation = ++this.uploadGeneration;
    try {
      const prediction = assets.predictSceneAssetBytes(
        states,
        runtime.audioContext?.sampleRate ?? this.dependencies.telemetry()?.sampleRate ?? 48_000,
      );
      if (!prediction.complete) return this.fail({ status: 'not-ready', reason: 'asset-metadata-missing' });
      if (prediction.decodedBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes) {
        return this.fail({ status: 'not-ready', reason: 'asset-soft-budget', registeredAssetBytes: prediction.decodedBytes });
      }
      if (assets.registeredDecodedAssetByteLength() + prediction.largestPendingDecodeBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetHardBytes) {
        return this.fail({ status: 'not-ready', reason: 'decode-peak-budget', registeredAssetBytes: prediction.decodedBytes });
      }
      const assetResult = await assets.ensureSceneAssets(states);
      if (generation !== this.uploadGeneration) return this.discardReadiness();
      if (!this.dependencies.isDocumentVisible()) {
        return this.fail({ status: 'not-ready', reason: 'document-hidden' });
      }
      if (assetResult.status === 'not-ready') {
        return this.fail({
          status: 'not-ready',
          reason: assetResult.reason,
          requiredBytes: assetResult.requiredBytes,
          limitBytes: assetResult.hardBytes,
        });
      }
      const closure = assets.backgroundAssetClosure();
      if (!closure.ready || closure.pendingRegistrationAssetIds.length > 0) {
        return this.fail({ status: 'not-ready', reason: 'asset-closure-incomplete', registeredAssetBytes: closure.registeredDecodedBytes });
      }
      if (closure.registeredDecodedBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes) {
        return this.fail({ status: 'not-ready', reason: 'asset-soft-budget', registeredAssetBytes: closure.registeredDecodedBytes });
      }
      if (assets.hostDecodedBytes() > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.hostDecodedBytes) {
        return this.fail({ status: 'not-ready', reason: 'host-cache-budget', registeredAssetBytes: closure.registeredDecodedBytes });
      }
      const events = createCoreProductJourneyScheduleEvents(plan);
      this.readiness = { status: 'preparing', uploadedEvents: 0, totalEvents: events.length };
      for (let offset = 0; offset < events.length; offset += 24) {
        if (generation !== this.uploadGeneration) return this.discardReadiness();
        if (!this.dependencies.isDocumentVisible()) {
          return this.fail({ status: 'not-ready', reason: 'document-hidden', registeredAssetBytes: closure.registeredDecodedBytes });
        }
        runtime.postEvents(events.slice(offset, offset + 24));
        this.readiness = { status: 'preparing', uploadedEvents: Math.min(events.length, offset + 24), totalEvents: events.length };
        if (!await this.waitForVisibleDelay(40)) {
          return this.fail({ status: 'not-ready', reason: 'document-hidden', registeredAssetBytes: closure.registeredDecodedBytes });
        }
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!this.dependencies.isDocumentVisible() || !await this.waitForVisibleDelay(25)) {
          return this.fail({ status: 'not-ready', reason: 'document-hidden', registeredAssetBytes: closure.registeredDecodedBytes });
        }
        if (generation !== this.uploadGeneration) return this.discardReadiness();
        runtime.requestTelemetryOnce('manual');
        const telemetry = this.dependencies.telemetry();
        if (telemetry?.journeyScheduleRevision === plan.revision) {
          this.assetReadinessRevision = closure.readinessRevision;
          return this.setReadiness({
            status: 'ready',
            revision: plan.revision,
            preparedFrames: telemetry.journeyPreparedTotalFrames ?? Number(plan.totalFrames),
            scheduleEntries: plan.entries.length,
            registeredAssetBytes: closure.registeredDecodedBytes,
          });
        }
      }
      return this.fail({ status: 'not-ready', reason: 'upload-timeout', registeredAssetBytes: closure.registeredDecodedBytes });
    } catch {
      return this.fail({ status: 'not-ready', reason: 'runtime-error' });
    } finally {
      if (this.uploadCompletion === completion) {
        this.resolveUploadCompletion?.();
        this.resolveUploadCompletion = null;
        this.uploadCompletion = null;
      }
    }
  }

  start(revision: number): boolean {
    if (this.readiness.status !== 'ready' || this.readiness.revision !== (revision >>> 0)) return false;
    const closure = this.dependencies.assets.backgroundAssetClosure();
    if (!this.dependencies.isDocumentVisible() || !closure.ready ||
        closure.readinessRevision !== this.assetReadinessRevision ||
        closure.registeredDecodedBytes > IOS_WEB_BACKGROUND_JOURNEY_LIMITS.registeredAssetSoftBytes) {
      this.fail({
        status: 'not-ready',
        reason: this.dependencies.isDocumentVisible() ? 'asset-closure-incomplete' : 'document-hidden',
        registeredAssetBytes: closure.registeredDecodedBytes,
      });
      return false;
    }
    this.dependencies.stopLegacyMorphClock();
    this.dependencies.post(createCoreProductJourneyScheduleEnabledEvent(true));
    return true;
  }

  stop(): void {
    this.uploadGeneration += 1;
    this.dependencies.post(createCoreProductJourneyScheduleEnabledEvent(false));
  }

  discard(): void {
    this.uploadGeneration += 1;
    this.dependencies.post(createCoreProductJourneyScheduleEnabledEvent(false));
    this.dependencies.assets.clearSceneAssets();
    this.assetReadinessRevision = 0;
    this.setReadiness({ status: 'idle' });
  }

  getReadiness(): ProductBackgroundJourneyReadiness { return this.readiness; }

  estimateAssets(states: readonly Record<string, unknown>[]): { complete: boolean; decodedBytes: number; sharedAssetReuse: number } {
    return this.dependencies.assets.estimateRegisteredSceneAssetBytes(states);
  }

  private waitForVisibleDelay(delayMs: number): Promise<boolean> {
    return this.dependencies.waitForVisibleDelay?.(delayMs) ??
      waitForDocumentVisibleDelay(delayMs, this.dependencies.isDocumentVisible);
  }

  private setReadiness(readiness: ProductBackgroundJourneyReadiness): ProductBackgroundJourneyReadiness {
    this.readiness = readiness;
    return readiness;
  }

  private fail(readiness: Extract<ProductBackgroundJourneyReadiness, { status: 'not-ready' }>): ProductBackgroundJourneyReadiness {
    this.dependencies.assets.clearSceneAssets();
    this.assetReadinessRevision = 0;
    return this.setReadiness(readiness);
  }

  private discardReadiness(): ProductBackgroundJourneyReadiness {
    this.dependencies.assets.clearSceneAssets();
    this.assetReadinessRevision = 0;
    return this.setReadiness({ status: 'idle' });
  }
}
