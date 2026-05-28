import { useSelectedAudioEnginePlaybackUiProps } from './useSelectedAudioEnginePlaybackUiProps';

type ProductRuntimePlaybackUiPropsOptions = Parameters<typeof useSelectedAudioEnginePlaybackUiProps>[0];

export function useProductRuntimePlaybackUiProps(options: ProductRuntimePlaybackUiPropsOptions) {
  return useSelectedAudioEnginePlaybackUiProps(options);
}
