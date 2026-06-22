import React, { useCallback, useRef } from 'react';

interface FeelField2DProps {
  value: { x: number; y: number };
  color: string;
  size?: 'mini' | 'large';
  disabled?: boolean;
  onChange: (value: { x: number; y: number }) => void;
  onGenerate?: () => void;
}

function clampFeel(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

const FeelField2D: React.FC<FeelField2DProps> = ({
  value,
  color,
  size = 'mini',
  disabled = false,
  onChange,
  onGenerate,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const updateFromEvent = useCallback((event: PointerEvent | React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = clampFeel(((event.clientX - rect.left) / rect.width) * 2 - 1);
    const y = clampFeel(1 - ((event.clientY - rect.top) / rect.height) * 2);
    onChange({ x, y });
  }, [onChange]);

  return (
    <div
      ref={ref}
      className={`scatter-feel-field scatter-feel-field--${size}${disabled ? ' disabled' : ''}`}
      style={{
        '--engine-color': color,
        '--feel-x': value.x,
        '--feel-y': value.y,
      } as React.CSSProperties}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onGenerate?.();
      }}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromEvent(event);
        const target = event.currentTarget;
        const onMove = (moveEvent: PointerEvent) => updateFromEvent(moveEvent);
        const onUp = () => {
          target.removeEventListener('pointermove', onMove);
          target.removeEventListener('pointerup', onUp);
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
      }}
    >
      <span className="scatter-feel-field__mist" />
      {size === 'large' && (
        <>
          <span className="scatter-feel-hint left">fall</span>
          <span className="scatter-feel-hint right">rise</span>
          <span className="scatter-feel-hint top">fracture</span>
          <span className="scatter-feel-hint bottom">pulse</span>
        </>
      )}
      <span className="scatter-feel-field__puck" />
    </div>
  );
};

export default FeelField2D;
