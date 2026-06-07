import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type {
  ProductEvent,
  ProductResolvedStateApplyMode,
  ProductResolvedStateCommit,
  ProductResolvedStateCommitReceipt,
} from '../ProductEngineTypes';
import { snapshotReloadReasonForProductPatch } from './CoreProductPatchClassifier';
import type { CoreProductHostDiagnostics } from './CoreProductHostDiagnostics';

type CoreProductResolvedStateCommitServiceOptions = {
  diagnostics: CoreProductHostDiagnostics;
  applyProductStatePatch: (
    patch: Record<string, unknown>,
    reason: SnapshotReloadReason,
    options?: {
      forceFullSnapshot?: boolean;
      revision: number;
      commitReason: string;
      triggerCritical: boolean;
      applyMode?: ProductResolvedStateApplyMode;
    },
  ) => Promise<Omit<ProductResolvedStateCommitReceipt, 'revision'>>;
  postProductEvent: (event: ProductEvent) => void;
};

function isSequencerTransportStartPatch(patch: Record<string, unknown>): boolean {
  return patch.synthEuclideanMasterEnabled === true || patch.drumEuclidMasterEnabled === true;
}

export class CoreProductResolvedStateCommitService {
  constructor(private readonly options: CoreProductResolvedStateCommitServiceOptions) {}

  async commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt> {
    this.options.diagnostics.recordPendingCommit(commit.revision, commit.reason, commit.triggerCritical);
    try {
      const patchKeyCount = Object.keys(commit.patch).length;
      const eventCount = commit.events?.length ?? 0;
      let patchReceipt: Omit<ProductResolvedStateCommitReceipt, 'revision'> | null = null;
      if (patchKeyCount > 0) {
        patchReceipt = await this.options.applyProductStatePatch(
          commit.patch,
          snapshotReloadReasonForProductPatch(commit.reason),
          {
            forceFullSnapshot: commit.applyMode === 'full-snapshot',
            revision: commit.revision,
            commitReason: commit.reason,
            triggerCritical: commit.triggerCritical,
            ...(commit.applyMode ? { applyMode: commit.applyMode } : {}),
          },
        );
      }
      if (eventCount > 0) {
        for (const event of commit.events ?? []) this.options.postProductEvent(event);
      }
      const applied = patchReceipt
        ? patchReceipt.applied || (
          commit.triggerCritical && isSequencerTransportStartPatch(commit.patch)
        )
        : true;
      const receipt: ProductResolvedStateCommitReceipt = {
        revision: commit.revision,
        applied,
        mode: patchReceipt?.mode ?? (eventCount > 0 ? 'event' : 'noop'),
        ...(patchReceipt?.audioThreadApplied !== undefined ? { audioThreadApplied: patchReceipt.audioThreadApplied } : {}),
        ...(patchReceipt?.encodedSnapshotHash ? { encodedSnapshotHash: patchReceipt.encodedSnapshotHash } : {}),
        ...(patchReceipt?.workletSourceSummaryHash ? { workletSourceSummaryHash: patchReceipt.workletSourceSummaryHash } : {}),
        ...(typeof patchReceipt?.appliedAtFrame === 'number' ? { appliedAtFrame: patchReceipt.appliedAtFrame } : {}),
      };
      this.options.diagnostics.recordCommitReceipt(receipt);
      return receipt;
    } catch (error) {
      this.options.diagnostics.recordCommitFailure();
      throw error;
    }
  }

  getCommittedStateRevision(): number {
    return this.options.diagnostics.snapshot().lastCommittedRevision;
  }

  recordSoundTrigger(): void {
    this.options.diagnostics.recordProductTrigger(this.getCommittedStateRevision());
  }
}
