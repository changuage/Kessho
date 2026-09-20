import { createCoreProductParamEvent } from '../audio/coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from '../audio/generated/kesshoProductParams';
import type { ProductEvent } from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';

export function nextSpectralFreezeCaptureSerial(current: number): number {
  const next = (Math.trunc(current) + 1) >>> 0;
  return next === 0 ? 1 : next;
}

export function prepareSpectralFreezeCaptureForPlayback(state: SliderState): SliderState {
  if (!state.spectralFreezeEnabled || !state.spectralFreezeActive) return state;
  return {
    ...state,
    spectralFreezeCaptureSerial: nextSpectralFreezeCaptureSerial(state.spectralFreezeCaptureSerial),
  };
}

export function isSpectralFreezeGesturePatch(patch: Partial<SliderState>): boolean {
  return patch.spectralFreezeActive !== undefined ||
    patch.spectralFreezeCaptureSerial !== undefined;
}

export function createSpectralFreezeGestureEvents(
  state: SliderState,
  patch: Partial<SliderState>,
): ProductEvent[] {
  const events: ProductEvent[] = [];
  if (patch.spectralFreezeCaptureSerial !== undefined) {
    events.push(createCoreProductParamEvent(
      KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeCaptureSerial,
      state.spectralFreezeCaptureSerial,
    ));
  }
  if (patch.spectralFreezeActive !== undefined) {
    events.push(createCoreProductParamEvent(
      KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive,
      state.spectralFreezeActive ? 1 : 0,
    ));
  }
  return events;
}
