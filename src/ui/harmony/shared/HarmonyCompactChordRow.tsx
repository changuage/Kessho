import React from 'react';
import RelativeChordDotMap from './RelativeChordDotMap';

export interface HarmonyCompactChordRowProps {
  indexLabel: string;
  slotLabel: string;
  title: string;
  meta?: string;
  notes: readonly number[];
  axis: readonly number[];
  sourceValue?: string;
  sourceOptions?: readonly { value: string; label: string; disabled?: boolean }[];
  durationUnit?: 'bar' | 'phrase';
  durationValue?: 1 | 2 | 4 | 8;
  relationship?: string | null;
  selected?: boolean;
  playing?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  onSourceChange?: (value: string) => void;
  onDurationChange?: (unit: 'bar' | 'phrase', value: 1 | 2 | 4 | 8) => void;
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
  trailing?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  tabIndex?: number;
}

export const HarmonyCompactChordRow: React.FC<HarmonyCompactChordRowProps> = ({
  indexLabel,
  slotLabel,
  title,
  meta,
  notes,
  axis,
  sourceValue,
  sourceOptions = [],
  durationUnit,
  durationValue,
  relationship,
  selected = false,
  playing = false,
  disabled = false,
  onSelect,
  onSourceChange,
  onDurationChange,
  onPlayStart,
  onPlayEnd,
  trailing,
  className = '',
  style,
  onFocus,
  tabIndex = selected ? 0 : -1,
}) => {
  const releasePreview = (element: HTMLButtonElement, pointerId: number) => {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
    onPlayEnd?.();
  };
  if (sourceOptions.length === 0 || sourceValue == null || durationUnit == null || durationValue == null) {
    return (
      <div className={`harmony-compact-chord-row harmony-compact-chord-row--legacy${selected ? ' selected' : ''}${playing ? ' playing' : ''} ${className}`.trim()} style={style}>
        <button type="button" className="harmony-compact-chord-legacy-select" tabIndex={tabIndex} aria-pressed={selected} onFocus={onFocus} onClick={onSelect}>
          <span className="harmony-compact-chord-index">{indexLabel}</span>
          <span className="harmony-compact-chord-identity"><strong>{title}</strong><small>{slotLabel}</small></span>
          <span className="harmony-compact-chord-legacy-meta">{meta}</span>
          <RelativeChordDotMap notes={notes} axis={axis} />
        </button>
        {trailing ? <span className="harmony-compact-chord-trailing">{trailing}</span> : null}
      </div>
    );
  }
  return (
    <div
      className={`harmony-compact-chord-row${selected ? ' selected' : ''}${playing ? ' playing' : ''} ${className}`.trim()}
      style={style}
      data-event={indexLabel}
    >
      <button
        type="button"
        className="harmony-compact-chord-index"
        tabIndex={tabIndex}
        aria-pressed={selected}
        aria-label={`Select ${indexLabel}, ${title}`}
        onFocus={onFocus}
        onClick={onSelect}
      >
        {indexLabel}
      </button>
      <label className="harmony-compact-chord-source">
        <span className="harmony-sr-only">{indexLabel} chord source</span>
        <select
          value={sourceValue}
          disabled={disabled}
          aria-label={`${indexLabel} chord source`}
          onFocus={onSelect}
          onChange={(event) => onSourceChange?.(event.target.value)}
        >
          {sourceOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
        </select>
        <small>{slotLabel}</small>
      </label>
      <button type="button" className="harmony-compact-chord-identity" onClick={onSelect} disabled={disabled}>
        <strong>{title}</strong>
        <small>{relationship ?? 'Starting chord'}</small>
      </button>
      <div className="harmony-compact-chord-visual" aria-label={relationship ?? 'Starting chord'}>
        <RelativeChordDotMap notes={notes} axis={axis} />
      </div>
      <label className="harmony-compact-chord-duration">
        <span className="harmony-sr-only">{indexLabel} duration</span>
        <select
          value={`${durationValue}:${durationUnit}`}
          disabled={disabled}
          aria-label={`${indexLabel} duration`}
          onFocus={onSelect}
          onChange={(event) => {
            const [value, unit] = event.target.value.split(':');
            onDurationChange?.(unit as 'bar' | 'phrase', Number(value) as 1 | 2 | 4 | 8);
          }}
        >
          {(['bar', 'phrase'] as const).flatMap((unit) => ([1, 2, 4, 8] as const).map((value) => (
            <option key={`${value}:${unit}`} value={`${value}:${unit}`}>{value}{unit === 'bar' ? 'B' : 'P'}</option>
          )))}
        </select>
      </label>
      <button
        type="button"
        className="harmony-compact-chord-preview"
        disabled={disabled || notes.length === 0}
        aria-label={`Hold to preview ${indexLabel} ${title}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          onSelect?.();
          onPlayStart?.();
        }}
        onPointerUp={(event) => releasePreview(event.currentTarget, event.pointerId)}
        onPointerCancel={(event) => releasePreview(event.currentTarget, event.pointerId)}
        onBlur={onPlayEnd}
      >
        {playing ? '■' : '▶'}
      </button>
    </div>
  );
};

export default HarmonyCompactChordRow;
