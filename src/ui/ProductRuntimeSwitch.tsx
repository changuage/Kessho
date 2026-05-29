import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { RuntimeModeSwitch } from './RuntimeModeSwitch';

export type ProductRuntimeSwitchMode = ProductRuntimeSelectionMode;

type ProductRuntimeSwitchProps = {
  currentMode: ProductRuntimeSwitchMode;
  modes: readonly ProductRuntimeSwitchMode[];
  onModeChange: (mode: ProductRuntimeSwitchMode) => void;
  visible: boolean;
  floating?: boolean;
  testId?: string;
  variant?: 'main' | 'scene';
};

export function ProductRuntimeSwitch({
  currentMode,
  modes,
  onModeChange,
  visible,
  floating = false,
  testId = 'main-product-runtime-switch',
  variant = 'main',
}: ProductRuntimeSwitchProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <RuntimeModeSwitch
      currentMode={currentMode}
      modes={modes}
      onModeChange={onModeChange}
      floating={floating}
      labelVariant="reference"
      testId={testId}
      variant={variant}
    />
  );
}
