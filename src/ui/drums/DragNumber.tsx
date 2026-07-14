import React, { useRef, useState } from 'react';

interface DragNumberProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
  step?: number;
  shapeByDrag?: boolean;
  disabled?: boolean;
  displayValue?: React.ReactNode;
  commitOnRelease?: boolean;
}

const SEQ_DRAG_NUM_SLOW_FACTOR = 1.8;

const DragNumber: React.FC<DragNumberProps> = ({
  value,
  min,
  max,
  label,
  onChange,
  step = 1,
  shapeByDrag = false,
  disabled = false,
  displayValue,
  commitOnRelease = false,
}) => {
  const [dragging, setDragging] = useState(false);
  const [ghostValue, setGhostValue] = useState<number | null>(null);
  const startY = useRef(0);
  const startValue = useRef(value);
  const ghostValueRef = useRef<number | null>(null);

  const effectiveStep = Number.isFinite(step) && step > 0 ? step : 1;
  const range = max - min;
  const stepCount = Math.max(1, range / effectiveStep);
  const basePxPerStep = Math.max(2, Math.min(40, 500 / stepCount));
  const pxPerStep = basePxPerStep * SEQ_DRAG_NUM_SLOW_FACTOR;

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const quantize = (v: number) => {
    const stepped = min + Math.round((v - min) / effectiveStep) * effectiveStep;
    return Number(clamp(stepped).toFixed(6));
  };
  const format = (v: number) => (
    effectiveStep < 1
      ? v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
      : String(v)
  );

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const totalY = startY.current - e.clientY; // positive = drag up = increase
    let delta: number;
    if (shapeByDrag) {
      const sign = Math.sign(totalY);
      const shaped = Math.pow(Math.abs(totalY), 1.12);
      delta = sign * shaped / pxPerStep;
    } else {
      delta = totalY / pxPerStep;
    }
    const next = quantize(startValue.current + delta * effectiveStep);
    ghostValueRef.current = next;
    setGhostValue(next);
    if (!commitOnRelease) onChange(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    if (commitOnRelease && ghostValueRef.current !== null) onChange(ghostValueRef.current);
    setDragging(false);
    ghostValueRef.current = null;
    setGhostValue(null);
    (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    ghostValueRef.current = null;
    setGhostValue(null);
    (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
  };

  const display = displayValue ?? (ghostValue !== null ? format(ghostValue) : format(value));

  return (
    <label style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
      <span className="seq-drag-num-label">{label}</span>
      <button
        type="button"
        className={`seq-drag-num${dragging ? ' dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        title={`${label}: drag up/down`}
      >
        {display}
      </button>
    </label>
  );
};

export default DragNumber;
