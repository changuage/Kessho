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
  rating?: number;
};

type EarthCardProps = {
  cardId: string;
  title: string;
  accent: string;
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  enabled?: boolean;
  onToggleEnabled?: () => void;
  enableTitle?: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function EarthCard({
  cardId,
  title,
  accent,
  expandedCards,
  onToggleCard,
  enabled,
  onToggleEnabled,
  enableTitle,
  subtitle,
  children,
}: EarthCardProps) {
  const expanded = expandedCards.has(cardId);
  const clickable = typeof onToggleCard === 'function';
  const handleHeaderToggle = () => {
    if (clickable) onToggleCard(cardId);
  };
  return (
    <div
      className={`earth-card${expanded ? ' expanded' : ''}`}
      style={{ '--sc': accent } as React.CSSProperties}
    >
      <div
        className={`earth-card-header${clickable ? ' clickable' : ''}`}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-expanded={clickable ? expanded : undefined}
        onClick={clickable ? handleHeaderToggle : undefined}
        onKeyDown={clickable ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          handleHeaderToggle();
        } : undefined}
      >
        <span className="ec-name">{title}</span>
        {subtitle && !expanded && (
          <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 400 }}>{subtitle}</span>
        )}
        <div className="ec-header-right">
          {enabled !== undefined && (
            onToggleEnabled ? (
              <button
                type="button"
                className={`ec-status-dot ec-status-dot-button ${enabled ? 'on' : 'off'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleEnabled();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
                title={enableTitle}
                aria-label={enableTitle}
                aria-pressed={enabled}
              />
            ) : (
              <span className={`ec-status-dot ${enabled ? 'on' : 'off'}`} />
            )
          )}
          {clickable ? <span className="ec-chevron">{expanded ? '▼' : '▶'}</span> : null}
        </div>
      </div>

      {expanded && <div className="earth-card-body">{children}</div>}
    </div>
  );
}

export function EarthPresetOptions({ options }: { options: EarthPresetOption[] }) {
  const sorted = [...options].sort((left, right) => left.label.localeCompare(right.label));

  return (
    <>
      {sorted.map((option) => (
        <option key={`${option.library}:${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
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
