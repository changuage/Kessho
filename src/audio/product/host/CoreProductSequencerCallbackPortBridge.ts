import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

type DrumTriggerCallback = (voice: unknown, velocity: number) => void;
type SequencerStepPositionCallback = (steps: number[], hitCounts: number[]) => void;
type SequencerEvolveTriggerCallback = (laneIndex: number) => void;

// TODO(product-core-burn-down): replace this port-to-host callback bridge with
// product-owned sequencer telemetry/callback channels once Product Core owns
// these display callbacks end to end.
export function setCoreProductDrumTriggerCallback(
  callHost: CoreProductHostMethodCall,
  callback: DrumTriggerCallback | null,
): void {
  callHost<void>('setDrumTriggerCallback', callback);
}

export function setCoreProductDrumStepPositionCallback(
  callHost: CoreProductHostMethodCall,
  callback: SequencerStepPositionCallback | null,
): void {
  callHost<void>('setDrumStepPositionCallback', callback);
}

export function setCoreProductSynthStepPositionCallback(
  callHost: CoreProductHostMethodCall,
  callback: SequencerStepPositionCallback | null,
): void {
  callHost<void>('setSynthStepPositionCallback', callback);
}

export function setCoreProductDrumEuclidEvolveTriggerCallback(
  callHost: CoreProductHostMethodCall,
  callback: SequencerEvolveTriggerCallback | null,
): void {
  callHost<void>('setDrumEuclidEvolveTriggerCallback', callback);
}

export function setCoreProductSynthEuclidEvolveTriggerCallback(
  callHost: CoreProductHostMethodCall,
  callback: SequencerEvolveTriggerCallback | null,
): void {
  callHost<void>('setSynthEuclidEvolveTriggerCallback', callback);
}
