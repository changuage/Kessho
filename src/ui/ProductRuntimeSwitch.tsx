import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { SelectedAudioEngineRuntimeSwitch } from './SelectedAudioEngineRuntimeSwitch';

export type ProductRuntimeMode = AudioEngineRuntimeMode;

type ProductRuntimeSwitchProps = {
  currentMode: ProductRuntimeMode;
  modes: readonly ProductRuntimeMode[];
  onModeChange: (mode: ProductRuntimeMode) => void;
  visible: boolean;
  floating?: boolean;
};

export function ProductRuntimeSwitch({
  currentMode,
  modes,
  onModeChange,
  visible,
  floating = false,
}: ProductRuntimeSwitchProps): JSX.Element | null {
  return (
    <SelectedAudioEngineRuntimeSwitch
      currentMode={currentMode}
      modes={modes}
      onModeChange={onModeChange}
      visible={visible}
      floating={floating}
    />
  );
}
