import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { ProductRuntimeSnapshotMetadata } from '../ProductEngineTypes';

export class CoreProductSnapshotAckMetadataFactory {
  private revision = -1;

  create(reason: SnapshotReloadReason | string, triggerCritical: boolean, revision = this.nextRevision()): Omit<ProductRuntimeSnapshotMetadata, 'encodedSnapshotHash'> {
    return { revision, reason, triggerCritical };
  }

  private nextRevision(): number {
    const revision = this.revision;
    this.revision = revision <= Number.MIN_SAFE_INTEGER + 1 ? -1 : revision - 1;
    return revision;
  }
}
