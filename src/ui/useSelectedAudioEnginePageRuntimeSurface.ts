import {
  useSelectedAudioEnginePageRuntimeBridgeOptions,
  type SelectedAudioEnginePageRuntimeBridgeOptionGroups,
} from './useSelectedAudioEnginePageRuntimeBridgeOptions';
import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges';

export function useSelectedAudioEnginePageRuntimeSurface(options: SelectedAudioEnginePageRuntimeBridgeOptionGroups) {
  const selectedPageRuntimeBridgeOptions = useSelectedAudioEnginePageRuntimeBridgeOptions(options);
  return useSelectedAudioEnginePageRuntimeBridges(selectedPageRuntimeBridgeOptions);
}
