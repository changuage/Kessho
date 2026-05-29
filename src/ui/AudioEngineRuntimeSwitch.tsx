import type { AudioEngineRuntimeMode } from './useAudioEngineRuntimeNavigation';
import { RuntimeModeSwitch } from './RuntimeModeSwitch';

type AudioEngineRuntimeSwitchProps = {
  currentMode: AudioEngineRuntimeMode;
  modes: readonly AudioEngineRuntimeMode[];
  onModeChange: (mode: AudioEngineRuntimeMode) => void;
  floating?: boolean;
  labelVariant?: 'short' | 'reference';
  testId?: string;
  variant?: 'main' | 'scene';
};

export function AudioEngineRuntimeSwitch({
  currentMode,
  modes,
  onModeChange,
  floating = false,
  labelVariant = 'short',
  testId = 'main-audio-engine-switch',
  variant = 'main',
}: AudioEngineRuntimeSwitchProps): JSX.Element | null {
  return (
    <RuntimeModeSwitch
      currentMode={currentMode}
      modes={modes}
      onModeChange={onModeChange}
      floating={floating}
      labelVariant={labelVariant}
      testId={testId}
      variant={variant}
    />
  );
}
