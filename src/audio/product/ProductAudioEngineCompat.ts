// TODO(product-core-runtime-closure): delete this deprecated alias after remaining
// non-product harness call sites move to SelectedProductRuntime or reference-only
// facades. Production UI must import SelectedProductRuntime/ProductEnginePort.
export type {
  SelectedProductRuntime as ProductAudioEngineCompat,
} from './SelectedProductRuntime';

export {
  selectedProductRuntime as audioEngine,
  preloadSelectedProductRuntime as preloadAudioEngine,
} from './SelectedProductRuntime';
