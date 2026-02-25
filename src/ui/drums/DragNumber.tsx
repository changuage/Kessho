import React, { useRef, useState } from 'react';

interface DragNumberProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
  shapeByDrag?: boolean;
  disabled?: boolean;
}

const SEQ_DRAG_NUM_SLOW_FACTOR = 1.8;

const DragNumber: React.FC<DragNumberProps> = ({
  value,
  min,
  max,
  label,
  onChange,
  shapeByDrag = false,
  disabled = false,
}) => {
  const [dragging, setDragging] = useState(false);
  const [ghostValue, setGhostValue] = useState<number | null>(null);
  const startY = useRef(0);
  const startValue = useRef(value);

  const range = max - min;
  const basePxPerStep = Math.max(2, Math.min(40, 500 / Math.max(1, range)));
  const pxPerStep = basePxPerStep * SEQ_DRAG_NUM_SLOW_FACTOR;

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

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
    const next = clamp(Math.round(startValue.current + delta));
    setGhostValue(next);
    onChange(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    setGhostValue(null);
    (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
  };

  const display = ghostValue ?? value;

  return (
    <label style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
      <span className="seq-drag-num-label">{label}</span>
      <button
        type="button"
        className={`seq-drag-num${dragging ? ' dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={`${label}: drag up/down`}
      >
        {display}
      </button>
    </label>
  );
};

export default DragNumber;
