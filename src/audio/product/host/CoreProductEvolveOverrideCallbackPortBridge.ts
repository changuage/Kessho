import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

type EvolveOverrideCallback = (laneIndex: number, overrides: unknown) => void;
type SynthNoteRangeEvolvedCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

// TODO(product-core-burn-down): replace this port-to-host callback bridge with
// product-owned evolved sequencer telemetry/callback channels once Product Core
// owns evolve override state end to end.
export function setCoreProductDrumEvolveOverridesChangedCallback(
  callHost: CoreProductHostMethodCall,
  callback: EvolveOverrideCallback | null,
): void {
  callHost<void>('setDrumEvolveOverridesChangedCallback', callback);
}

export function setCoreProductSynthEvolveOverridesChangedCallback(
  callHost: CoreProductHostMethodCall,
  callback: EvolveOverrideCallback | null,
): void {
  callHost<void>('setSynthEvolveOverridesChangedCallback', callback);
}

export function setCoreProductSynthNoteRangeEvolvedCallback(
  callHost: CoreProductHostMethodCall,
  callback: SynthNoteRangeEvolvedCallback | null,
): void {
  callHost<void>('setSynthNoteRangeEvolvedCallback', callback);
}
