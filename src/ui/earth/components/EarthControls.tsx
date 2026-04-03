import React from 'react';
import { useSliderHelp } from '../../SliderHelpOverlay';
import type { SliderState } from '../../state';

export type EarthDualSliderOptions = {
  format?: (v: number) => string;
  logarithmic?: boolean;
};

export type EarthDualSliderRenderer = (
  key: keyof SliderState,
  label: string,
  fillColor: string,
  opts?: EarthDualSliderOptions,
) => React.ReactNode;

export type EarthPresetOption = {
  value: string;
  label: string;
  library: 'stock' | 'user' | 'cloud';
  stockIndex?: number;
  presetName?: string;
};

type EarthCardProps = {
  cardId: string;
  title: string;
  accent: string;
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  children: React.ReactNode;
};

export function EarthCard({
  cardId,
  title,
  accent,
  expandedCards,
  onToggleCard,
  children,
}: EarthCardProps) {
  const expanded = expandedCards.has(cardId);
  return (
    <div
      className={`earth-card${expanded ? ' expanded' : ''}`}
      style={{ '--sc': accent } as React.CSSProperties}
    >
      <div className="earth-card-header" onClick={() => onToggleCard(cardId)}>
        <span className="ec-name">{title}</span>
        <span className="ec-chevron">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && <div className="earth-card-body">{children}</div>}
    </div>
  );
}

export function EarthPresetOptions({ options }: { options: EarthPresetOption[] }) {
  const stock = options.filter(option => option.library === 'stock');
  const user = options.filter(option => option.library === 'user');
  const cloud = options.filter(option => option.library === 'cloud');

  return (
    <>
      <optgroup label="Stock">
        {stock.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </optgroup>
      {user.length > 0 && (
        <optgroup label="My Presets">
          {user.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      )}
      {cloud.length > 0 && (
        <optgroup label="Cloud">
          {cloud.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

type ParamSliderProps = {
  paramKey: keyof SliderState;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  labelColor?: string;
};

export function ParamSlider({
  paramKey,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  labelColor,
}: ParamSliderProps) {
  const { announceSlider } = useSliderHelp();
  const announceHelp = () => announceSlider(String(paramKey), { label });
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="param-row" onMouseEnter={announceHelp} onPointerDown={announceHelp}>
      <span
        className="param-label"
        style={labelColor ? { color: labelColor } : undefined}
      >
        {label}
      </span>
      <input
        className="param-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          announceHelp();
          onChange(Number(e.target.value));
        }}
        onFocus={announceHelp}
        style={{
          background: `linear-gradient(to right, rgba(165,196,212,0.5) 0%, rgba(165,196,212,0.5) ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`,
        }}
      />
      <span className="param-value">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}
