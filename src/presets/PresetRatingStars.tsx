import React from 'react';

export interface PresetRatingStarsProps {
  value?: number;
  onChange?: (rating: number) => void;
  color?: string;
  emptyColor?: string;
  size?: string;
  hitSize?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const STAR = '\u2605';
const RATING_VALUES = [1, 2, 3, 4, 5] as const;

function normalizeRating(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

export const PresetRatingStars = React.memo(function PresetRatingStars({
  value,
  onChange,
  color = '#d4a55a',
  emptyColor = '#444',
  size = '0.7rem',
  hitSize = '1.5rem',
  disabled = false,
  className,
  style,
}: PresetRatingStarsProps) {
  const currentValue = normalizeRating(value);
  const interactive = Boolean(onChange) && !disabled;

  return (
    <span
      className={className}
      role="group"
      aria-label={`Preset rating: ${currentValue} of 5`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        lineHeight: 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {RATING_VALUES.map((rating) => (
        <button
          key={rating}
          type="button"
          disabled={!interactive}
          aria-pressed={currentValue === rating}
          aria-label={currentValue === rating ? 'Clear preset rating' : `Set preset rating to ${rating} of 5`}
          title={currentValue === rating ? 'Clear preset rating' : `Rate ${rating}/5`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!interactive) return;
            onChange?.(currentValue === rating ? 0 : rating);
          }}
          style={{
            width: hitSize,
            height: hitSize,
            minWidth: '24px',
            minHeight: '24px',
            padding: 0,
            border: 0,
            background: 'none',
            color: rating <= currentValue ? color : emptyColor,
            cursor: interactive ? 'pointer' : 'default',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: 'inherit',
            fontSize: size,
            lineHeight: 1,
            opacity: disabled ? 0.5 : 1,
            touchAction: 'manipulation',
            userSelect: 'none',
          }}
        >
          {STAR}
        </button>
      ))}
    </span>
  );
});
