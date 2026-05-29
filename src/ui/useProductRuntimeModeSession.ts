import { isMobileDevice } from '../platform';
import {
  DEFAULT_STATE,
  MOBILE_STATE,
  decodeStateFromUrl,
  type SliderState,
} from './state';
import {
  readProductRuntimeSwitchState,
  useProductRuntimeMode,
} from './useProductRuntimeNavigationCore';

type ResolveProductRuntimeModeInitialStateOptions = {
  normalizeState: (state: SliderState) => SliderState;
};

export function resolveProductRuntimeModeInitialState({
  normalizeState,
}: ResolveProductRuntimeModeInitialStateOptions): SliderState {
  const urlState = readProductRuntimeSwitchState() ?? decodeStateFromUrl(window.location.search);
  const mobileDefaultState = isMobileDevice() || window.innerWidth < 768;
  return normalizeState(urlState || (mobileDefaultState ? MOBILE_STATE : DEFAULT_STATE));
}

export function useProductRuntimeModeSession() {
  return {
    productRuntimeMode: useProductRuntimeMode(),
  };
}
