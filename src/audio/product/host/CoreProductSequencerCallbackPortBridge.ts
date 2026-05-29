import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';
import type {
  ProductDrumTriggerCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
} from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this port-to-host callback bridge with
// product-owned sequencer telemetry/callback channels once Product Core owns
// these display callbacks end to end.
export function setCoreProductDrumTriggerCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductDrumTriggerCallback | null,
): void {
  callHost<void>('setDrumTriggerCallback', callback);
}

export function setCoreProductDrumStepPositionCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductSequencerStepPositionCallback | null,
): void {
  callHost<void>('setDrumStepPositionCallback', callback);
}

export function setCoreProductSynthStepPositionCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductSequencerStepPositionCallback | null,
): void {
  callHost<void>('setSynthStepPositionCallback', callback);
}

export function setCoreProductDrumEuclidEvolveTriggerCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductSequencerEvolveTriggerCallback | null,
): void {
  callHost<void>('setDrumEuclidEvolveTriggerCallback', callback);
}

export function setCoreProductSynthEuclidEvolveTriggerCallback(
  callHost: CoreProductHostMethodCall,
  callback: ProductSequencerEvolveTriggerCallback | null,
): void {
  callHost<void>('setSynthEuclidEvolveTriggerCallback', callback);
}
