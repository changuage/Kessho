import type {
  ProductEvent,
  ProductResolvedStateCommit,
  ProductResolvedStateCommitReceipt,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
} from '../ProductEngineTypes';

export type ProductEngineControlPort = {
  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void;
  commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt>;
  getCommittedStateRevision(): number;
  enqueueEvent(event: ProductEvent): void;
  enqueueEvents(events: readonly ProductEvent[]): void;
};
