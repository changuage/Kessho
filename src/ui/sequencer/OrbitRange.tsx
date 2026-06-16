interface OrbitRangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export function OrbitRange({
  label,
  value,
  min,
  max,
  step,
  format = (next) => next.toFixed(2),
  onChange,
}: OrbitRangeProps) {
  return (
    <label className="orbit-range">
      <span className="orbit-range__head">
        <span>{label}</span>
        <span>{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default OrbitRange;
