import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

type JourneyMorphClockCallback = (now: number) => void;

// TODO(product-core-burn-down): replace this port-to-host dispatch bridge with
// product-owned journey morph clock/control events once the clock no longer
// relies on the temporary web Product host callback surface.
export function resetCoreProductCofDrift(callHost: CoreProductHostMethodCall): void {
  callHost<void>('resetCofDrift');
}

export function setCoreProductJourneyMorphClockCallback(
  callHost: CoreProductHostMethodCall,
  callback: JourneyMorphClockCallback | null,
): void {
  callHost<void>('setJourneyMorphClockCallback', callback);
}

export function startCoreProductJourneyMorphClock(callHost: CoreProductHostMethodCall): void {
  callHost<void>('startJourneyMorphClock');
}

export function stopCoreProductJourneyMorphClock(callHost: CoreProductHostMethodCall): void {
  callHost<void>('stopJourneyMorphClock');
}
