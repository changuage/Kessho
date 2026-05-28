import { useCapacitorMacAudioStatus } from './useCapacitorMacAudioStatus';
import { useSelectedAudioEngineCapacitorAudioSession } from './useSelectedAudioEngineCapacitorAudioSession';

type MacAudioStatusOptions = Parameters<typeof useCapacitorMacAudioStatus>[0];
type CapacitorAudioSessionOptions = Parameters<typeof useSelectedAudioEngineCapacitorAudioSession>[0];

type SelectedAudioEnginePlatformRuntimeSurfaceOptions = MacAudioStatusOptions & CapacitorAudioSessionOptions;

export function useSelectedAudioEnginePlatformRuntimeSurface(options: SelectedAudioEnginePlatformRuntimeSurfaceOptions) {
  const macAudioStatus = useCapacitorMacAudioStatus(options);

  useSelectedAudioEngineCapacitorAudioSession(options);

  return macAudioStatus;
}
