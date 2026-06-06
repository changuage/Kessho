import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type {
  ProductEvent,
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
    options?: { forceFullSnapshot?: boolean },
  ) => ProductResolvedStateCommitReceipt['mode'];
  postProductEvent: (event: ProductEvent) => void;
};

function isSequencerTransportStartPatch(patch: Record<string, unknown>): boolean {
  return patch.synthEuclideanMasterEnabled === true || patch.drumEuclidMasterEnabled === true;
}

export class CoreProductResolvedStateCommitService {
  constructor(private readonly options: CoreProductResolvedStateCommitServiceOptions) {}

  commitResolvedState(commit: ProductResolvedStateCommit): ProductResolvedStateCommitReceipt {
    this.options.diagnostics.recordPendingCommit(commit.revision, commit.reason, commit.triggerCritical);
    try {
      const patchKeyCount = Object.keys(commit.patch).length;
      const eventCount = commit.events?.length ?? 0;
      let patchMode: ProductResolvedStateCommitReceipt['mode'] | null = null;
      if (patchKeyCount > 0) {
        patchMode = this.options.applyProductStatePatch(
          commit.patch,
          snapshotReloadReasonForProductPatch(commit.reason),
          { forceFullSnapshot: commit.applyMode === 'full-snapshot' },
        );
      }
      if (eventCount > 0) {
        for (const event of commit.events ?? []) this.options.postProductEvent(event);
      }
      const applied = patchMode !== 'deferred' || (
        commit.triggerCritical && isSequencerTransportStartPatch(commit.patch)
      );
      const receipt: ProductResolvedStateCommitReceipt = {
        revision: commit.revision,
        applied,
        mode: patchMode ?? (eventCount > 0 ? 'event' : 'noop'),
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
