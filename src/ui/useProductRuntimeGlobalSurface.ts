import { useSelectedAudioEngineGlobalRuntimeSurface } from './useSelectedAudioEngineGlobalRuntimeSurface';
import type { GlobalPageProps } from './global/GlobalPage';

type ProductRuntimeGlobalProps = Pick<
  GlobalPageProps,
  | 'runtimeComparison'
  | 'onResetCofDrift'
  | 'isRecording'
  | 'recordFormats'
  | 'recordStems'
  | 'recordingAvailable'
  | 'recordingDuration'
  | 'stemRecordingAvailable'
  | 'formatRecordingTime'
  | 'onRecordFormatsChange'
  | 'onRecordStemsChange'
>;

type ProductRuntimeGlobalRecordingProps = Pick<
  ProductRuntimeGlobalProps,
  | 'isRecording'
  | 'recordFormats'
  | 'recordStems'
  | 'recordingAvailable'
  | 'recordingDuration'
  | 'stemRecordingAvailable'
  | 'formatRecordingTime'
  | 'onRecordFormatsChange'
  | 'onRecordStemsChange'
>;

type ProductRuntimeGlobalSurfaceOptions = {
  playbackIsRunning: boolean;
  stopProductPlayback: () => void;
  runtimeComparison: ProductRuntimeGlobalProps['runtimeComparison'];
  onResetCofDrift: ProductRuntimeGlobalProps['onResetCofDrift'];
  recordingProps: ProductRuntimeGlobalRecordingProps;
};

export function useProductRuntimeGlobalSurface({
  stopProductPlayback,
  ...options
}: ProductRuntimeGlobalSurfaceOptions) {
  // TODO(product-runtime-compat-10D): selected global runtime surface remains the compatibility
  // implementation while the product/global page surface exposes product runtime naming.
  return useSelectedAudioEngineGlobalRuntimeSurface({
    ...options,
    stopSelectedPlayback: stopProductPlayback,
  });
}
