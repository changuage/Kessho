import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';
import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductEvent,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
} from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this port-to-host command bridge with
// product-owned command/event dispatch once WebProductEngine no longer adapts
// Product host method names for routine runtime actions.
export function setCoreProductOutputGain(
  callHost: CoreProductHostMethodCall,
  target: number,
  durationSeconds: number,
): void {
  callHost<void>('setOutputGain', target, durationSeconds);
}

export function updateCoreProductSnapshotPatch(
  callHost: CoreProductHostMethodCall,
  reason: ProductSnapshotPatchReason,
  patch: ProductSnapshotPatch,
): void {
  callHost<void>('updateSnapshotPatch', reason, patch);
}

export function postCoreProductEvent(callHost: CoreProductHostMethodCall, event: ProductEvent): void {
  callHost<void>('postProductEvent', event);
}

export function pushCoreProductMidiMessage(callHost: CoreProductHostMethodCall, message: unknown): void {
  callHost<void>('pushMidiMessage', message);
}

export function registerCoreProductAsset(
  callHost: CoreProductHostMethodCall,
  asset: ProductAssetRegistration,
): ProductAssetHandle {
  callHost<void>('registerAsset', asset);
  return { assetId: asset.assetId };
}

export function unregisterCoreProductAsset(callHost: CoreProductHostMethodCall, assetId: number): void {
  callHost<void>('unregisterAsset', assetId);
}

export function auditionCoreProductSynthNote(
  callHost: CoreProductHostMethodCall,
  note: unknown,
  externalState?: unknown,
): Promise<void> {
  return callHost<Promise<void>>('auditionSynthNote', note, externalState);
}

export function triggerCoreProductDrumVoice(
  callHost: CoreProductHostMethodCall,
  voice: unknown,
  velocity: number,
  externalState?: unknown,
): Promise<void> {
  return callHost<Promise<void>>('triggerDrumVoice', voice, velocity, externalState);
}
