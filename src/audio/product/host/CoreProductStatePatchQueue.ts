import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { ProductResolvedStateApplyMode, ProductResolvedStateCommitReceipt } from '../ProductEngineTypes';

export type CoreProductStateApplyOptions = {
  forceFullSnapshot?: boolean;
  revision?: number;
  commitReason?: string;
  triggerCritical?: boolean;
  applyMode?: ProductResolvedStateApplyMode;
};

export type CoreProductPatchApplyReceipt = Omit<ProductResolvedStateCommitReceipt, 'revision'>;

type PendingPatchReceipt = {
  resolve: (receipt: CoreProductPatchApplyReceipt) => void;
  reject: (error: unknown) => void;
};

type CoreProductStatePatchQueueOptions = {
  latestSliderState: () => Record<string, unknown> | null;
  applyProductState: (
    sliderState: Record<string, unknown>,
    fallbackReloadReason: SnapshotReloadReason,
    options?: CoreProductStateApplyOptions,
  ) => Promise<CoreProductPatchApplyReceipt>;
};

export class CoreProductStatePatchQueue {
  private pendingPatch: Record<string, unknown> | null = null;
  private pendingReason: SnapshotReloadReason | null = null;
  private flushQueued = false;
  private readonly pendingReceipts: PendingPatchReceipt[] = [];

  constructor(private readonly options: CoreProductStatePatchQueueOptions) {}

  apply(
    patch: Record<string, unknown>,
    fallbackReloadReason: SnapshotReloadReason,
    options?: CoreProductStateApplyOptions,
  ): Promise<CoreProductPatchApplyReceipt> {
    if (
      options?.forceFullSnapshot === true ||
      options?.triggerCritical === true ||
      typeof options?.revision === 'number' ||
      options?.applyMode === 'full-snapshot'
    ) {
      return this.options.applyProductState({ ...(this.options.latestSliderState() ?? {}), ...patch }, fallbackReloadReason, options);
    }
    const pendingPatch = this.pendingPatch ?? (this.pendingPatch = {});
    Object.assign(pendingPatch, patch);
    this.pendingReason = fallbackReloadReason;
    const receipt = new Promise<CoreProductPatchApplyReceipt>((resolve, reject) => {
      this.pendingReceipts.push({ resolve, reject });
    });
    this.queueFlush();
    return receipt;
  }

  private queueFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    const flush = () => { void this.flushPendingPatch(); };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(flush);
      return;
    }
    if (typeof queueMicrotask === 'function') { queueMicrotask(flush); return; }
    void Promise.resolve().then(flush);
  }

  private async flushPendingPatch(): Promise<void> {
    this.flushQueued = false;
    const pending = this.pendingPatch;
    const reason = this.pendingReason ?? 'product-patch';
    const receipts = this.pendingReceipts.splice(0);
    this.pendingPatch = null;
    this.pendingReason = null;
    if (!pending) {
      const noop: CoreProductPatchApplyReceipt = { applied: false, mode: 'deferred' };
      for (const { resolve } of receipts) resolve(noop);
      return;
    }
    try {
      const receipt = await this.options.applyProductState({ ...(this.options.latestSliderState() ?? {}), ...pending }, reason);
      for (const { resolve } of receipts) resolve(receipt);
    } catch (error) {
      for (const { reject } of receipts) reject(error);
    }
  }
}
