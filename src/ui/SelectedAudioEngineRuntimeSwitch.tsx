import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { AudioEngineRuntimeSwitch } from './AudioEngineRuntimeSwitch';

type SelectedAudioEngineRuntimeSwitchProps = {
  currentMode: AudioEngineRuntimeMode;
  modes: readonly AudioEngineRuntimeMode[];
  onModeChange: (mode: AudioEngineRuntimeMode) => void;
  visible: boolean;
  floating?: boolean;
};

export function SelectedAudioEngineRuntimeSwitch({
  currentMode,
  modes,
  onModeChange,
  visible,
  floating = false,
}: SelectedAudioEngineRuntimeSwitchProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <AudioEngineRuntimeSwitch
      currentMode={currentMode}
      modes={modes}
      onModeChange={onModeChange}
      labelVariant="reference"
      floating={floating}
    />
  );
}
