import type { CSSProperties } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import {
  PRODUCT_RUNTIME_SWITCH_COLUMN_COUNT,
  productRuntimeModeLabel,
  productRuntimeModeTitle,
} from './productRuntimeUi';

type RuntimeModeSwitchProps = {
  currentMode: ProductRuntimeSelectionMode;
  modes: readonly ProductRuntimeSelectionMode[];
  onModeChange: (mode: ProductRuntimeSelectionMode) => void;
  floating?: boolean;
  labelVariant?: 'short' | 'reference';
  testId?: string;
  variant?: 'main' | 'scene';
};

const styles = {
  root: {
    display: 'grid',
    gridTemplateColumns: `repeat(${PRODUCT_RUNTIME_SWITCH_COLUMN_COUNT}, minmax(0, 1fr))`,
    width: 'min(270px, 100%)',
    minHeight: '36px',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.24)',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
  } as CSSProperties,
  floating: {
    position: 'fixed',
    top: 'calc(14px + env(safe-area-inset-top))',
    right: '14px',
    zIndex: 1200,
    width: 'min(270px, calc(100vw - 28px))',
    backdropFilter: 'blur(12px)',
  } as CSSProperties,
  button: {
    minWidth: 0,
    padding: '8px 10px',
    border: 'none',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.58)',
    cursor: 'pointer',
    fontSize: '0.72rem',
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transition: 'background 0.16s ease, color 0.16s ease',
  } as CSSProperties,
  activeButton: {
    background: 'rgba(103, 232, 249, 0.16)',
    color: '#67e8f9',
    boxShadow: 'inset 0 -2px 0 rgba(103, 232, 249, 0.55)',
  } as CSSProperties,
};

export function RuntimeModeSwitch({
  currentMode,
  modes,
  onModeChange,
  floating = false,
  labelVariant = 'short',
  testId = 'main-audio-engine-switch',
  variant = 'main',
}: RuntimeModeSwitchProps): JSX.Element | null {
  if (modes.length <= 1) return null;

  const sceneVariant = variant === 'scene';
  const labelForMode = (mode: ProductRuntimeSelectionMode): string => {
    if (labelVariant === 'reference' && mode === 'web-ts') return 'Web TS';
    if (labelVariant === 'reference' && mode === 'core-product') return 'Product Core';
    return productRuntimeModeLabel(mode);
  };

  return (
    <div
      className={sceneVariant ? 'scene-engine-switch-buttons' : undefined}
      style={sceneVariant ? undefined : { ...styles.root, ...(floating ? styles.floating : {}) }}
      role="group"
      aria-label="Product runtime"
      data-testid={testId}
    >
      {modes.map((mode, index) => (
        <button
          key={mode}
          type="button"
          data-testid={`${testId}-${mode}`}
          className={sceneVariant ? `scene-engine-switch-btn${currentMode === mode ? ' active' : ''}` : undefined}
          style={sceneVariant ? undefined : {
            ...styles.button,
            ...(index === modes.length - 1 ? { borderRight: 'none' } : {}),
            ...(currentMode === mode ? styles.activeButton : {}),
          }}
          aria-pressed={currentMode === mode}
          onClick={() => onModeChange(mode)}
          title={productRuntimeModeTitle(mode)}
        >
          {labelForMode(mode)}
        </button>
      ))}
    </div>
  );
}
