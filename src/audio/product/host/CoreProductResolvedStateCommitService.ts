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
  applyProductStatePatch: (patch: Record<string, unknown>, reason: SnapshotReloadReason) => void;
  postProductEvent: (event: ProductEvent) => void;
};

export class CoreProductResolvedStateCommitService {
  constructor(private readonly options: CoreProductResolvedStateCommitServiceOptions) {}

  commitResolvedState(commit: ProductResolvedStateCommit): ProductResolvedStateCommitReceipt {
    this.options.diagnostics.recordPendingCommit(commit.revision, commit.reason, commit.triggerCritical);
    try {
      const patchKeyCount = Object.keys(commit.patch).length;
      const eventCount = commit.events?.length ?? 0;
      if (patchKeyCount > 0) {
        this.options.applyProductStatePatch(commit.patch, snapshotReloadReasonForProductPatch(commit.reason));
      }
      if (eventCount > 0) {
        for (const event of commit.events ?? []) this.options.postProductEvent(event);
      }
      const receipt: ProductResolvedStateCommitReceipt = {
        revision: commit.revision,
        applied: true,
        mode: eventCount > 0 ? 'event' : (patchKeyCount > 0 ? 'full-snapshot' : 'noop'),
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

  recordSequencerUiPatch(revision: number, kind: string): void {
    this.options.diagnostics.recordSequencerUiPatch(revision, kind);
  }
}
