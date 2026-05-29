import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';
import type {
  ProductEvolveOverridesCallback,
  ProductSynthNoteRangeEvolvedCallback,
} from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this port-to-host callback bridge with
// product-owned evolved sequencer telemetry/callback channels once Product Core
// owns evolve override state end to end.
export function setCoreProductDrumEvolveOverridesChangedCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductEvolveOverridesCallback | null,
): void {
  callHost<void>('setDrumEvolveOverridesChangedCallback', callback);
}

export function setCoreProductSynthEvolveOverridesChangedCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductEvolveOverridesCallback | null,
): void {
  callHost<void>('setSynthEvolveOverridesChangedCallback', callback);
}

export function setCoreProductSynthNoteRangeEvolvedCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductSynthNoteRangeEvolvedCallback | null,
): void {
  callHost<void>('setSynthNoteRangeEvolvedCallback', callback);
}
