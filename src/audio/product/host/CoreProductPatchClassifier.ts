import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { ProductSnapshotPatchReason } from '../ProductEngineTypes';

export function snapshotReloadReasonForProductPatch(reason: ProductSnapshotPatchReason): SnapshotReloadReason {
  switch (reason) {
    case 'asset-reference-change':
      return 'asset-reference-change';
    case 'runtime-start':
      return 'runtime-start';
    case 'runtime-bootstrap':
      return 'runtime-bootstrap';
    case 'debug-force-reload':
      return 'explicit-reset-request';
    case 'preset-load':
      return 'explicit-reset-request';
    case 'sequencer-edit':
      return 'sequencer-structure-change';
    case 'transport-change':
    case 'sequencer-control-change':
    case 'journey-morph-change':
    case 'morph-control-change':
    case 'fx-control-change':
    case 'ui-control-change':
      return 'product-patch';
  }
}
