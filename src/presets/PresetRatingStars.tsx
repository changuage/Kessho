import React from 'react';
import { createPortal } from 'react-dom';

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
const EMPTY_STAR = '\u2606';
const RATING_VALUES = [0, 1, 2, 3, 4, 5] as const;
const POPOVER_WIDTH = 214;
const POPOVER_HEIGHT = 52;
const VIEWPORT_MARGIN = 8;

function normalizeRating(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function ratingColor(rating: number, color: string, emptyColor: string): string {
  if (rating <= 0) return emptyColor;
  const activeMix = Math.min(100, Math.round(12 + rating * 17.6));
  return `color-mix(in srgb, ${color} ${activeMix}%, ${emptyColor})`;
}

function ratingSurface(rating: number, color: string): string {
  if (rating <= 0) return 'rgba(255, 255, 255, 0.035)';
  const activeMix = Math.round(6 + rating * 2.4);
  return `color-mix(in srgb, ${color} ${activeMix}%, rgba(255, 255, 255, 0.04))`;
}

function ratingGlow(rating: number, color: string): string {
  if (rating <= 0) return 'transparent';
  const activeMix = Math.round(14 + Math.pow(rating / 5, 1.35) * 86);
  return `color-mix(in srgb, ${color} ${activeMix}%, transparent)`;
}

function ratingHalo(rating: number, color: string): string {
  if (rating <= 0) return 'none';
  const glow = ratingGlow(rating, color);
  const tight = Math.round(4 + rating * 1.3);
  const wide = Math.round(8 + rating * 3.2);
  const outer = Math.round(14 + rating * 4.4);
  return rating >= 4
    ? `0 0 ${tight}px ${glow}, 0 0 ${wide}px ${glow}, 0 0 ${outer}px ${glow}`
    : `0 0 ${tight}px ${glow}, 0 0 ${wide}px ${glow}`;
}

export const PresetRatingStars = React.memo(function PresetRatingStars({
  value,
  onChange,
  color = '#f2aa3a',
  emptyColor = '#3f444d',
  size = '0.7rem',
  hitSize = '1.5rem',
  disabled = false,
  className,
  style,
}: PresetRatingStarsProps) {
  const currentValue = normalizeRating(value);
  const interactive = Boolean(onChange) && !disabled;
  const [open, setOpen] = React.useState(false);
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const popoverId = React.useId();
  const indicatorColor = ratingColor(currentValue, color, emptyColor);

  const positionPopover = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const centeredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN, centeredLeft),
    );
    const belowTop = rect.bottom + 8;
    const top = belowTop + POPOVER_HEIGHT + VIEWPORT_MARGIN > viewportHeight
      ? Math.max(VIEWPORT_MARGIN, rect.top - POPOVER_HEIGHT - 8)
      : belowTop;

    setPopoverStyle({
      position: 'fixed',
      left,
      top,
      width: POPOVER_WIDTH,
      zIndex: 10000,
    });
  }, []);

  React.useEffect(() => {
    if (!open || !interactive) return undefined;
    positionPopover();

    const handleReposition = () => positionPopover();
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
    };
  }, [interactive, open, positionPopover]);

  React.useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => {
      optionRefs.current[currentValue]?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [currentValue, open]);

  React.useEffect(() => {
    if (!interactive && open) setOpen(false);
  }, [interactive, open]);

  const closeAndRestoreFocus = React.useCallback(() => {
    setOpen(false);
    window.setTimeout(() => buttonRef.current?.focus(), 0);
  }, []);

  const handleOptionSelect = React.useCallback((rating: number, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!interactive) return;
    if (rating !== currentValue) onChange?.(rating);
    closeAndRestoreFocus();
  }, [closeAndRestoreFocus, currentValue, interactive, onChange]);

  const handlePopoverKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }

    const focusedIndex = optionRefs.current.findIndex(option => option === document.activeElement);
    if (focusedIndex < 0) return;

    const nextIndexByKey: Record<string, number> = {
      ArrowRight: Math.min(RATING_VALUES.length - 1, focusedIndex + 1),
      ArrowDown: Math.min(RATING_VALUES.length - 1, focusedIndex + 1),
      ArrowLeft: Math.max(0, focusedIndex - 1),
      ArrowUp: Math.max(0, focusedIndex - 1),
      Home: 0,
      End: RATING_VALUES.length - 1,
    };
    const nextIndex = nextIndexByKey[event.key];
    if (typeof nextIndex !== 'number') return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  }, [closeAndRestoreFocus]);

  const popover = open && interactive && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={popoverRef}
        id={popoverId}
        role="radiogroup"
        aria-label="Preset rating"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handlePopoverKeyDown}
        style={{
          ...(popoverStyle ?? { position: 'fixed', left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN, width: POPOVER_WIDTH, zIndex: 10000 }),
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '7px 8px',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.16)',
          background: 'rgba(13, 17, 25, 0.96)',
          boxShadow: '0 14px 34px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {RATING_VALUES.map((rating, index) => {
          const selected = rating === currentValue;
          const optionColor = ratingColor(rating, color, emptyColor);
          return (
            <button
              key={rating}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={rating === 0 ? 'Clear preset rating' : `Set preset rating to ${rating} of 5`}
              title={rating === 0 ? 'No rating' : `${rating}/5`}
              onClick={(event) => handleOptionSelect(rating, event)}
              style={{
                width: 30,
                height: 36,
                minWidth: 30,
                padding: 0,
                borderRadius: 6,
                border: `1px solid ${selected ? optionColor : 'rgba(255, 255, 255, 0.1)'}`,
                background: selected ? ratingSurface(rating, color) : 'rgba(255, 255, 255, 0.035)',
                color: optionColor,
                cursor: 'pointer',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                font: 'inherit',
                lineHeight: 1,
                touchAction: 'manipulation',
                userSelect: 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  color: optionColor,
                  fontSize: size,
                  lineHeight: 1,
                  textShadow: ratingHalo(rating, color),
                }}
              >
                {rating > 0 ? STAR : EMPTY_STAR}
              </span>
              <span
                aria-hidden="true"
                style={{
                  color: selected ? '#f4f0e8' : 'rgba(244, 240, 232, 0.62)',
                  fontSize: '0.56rem',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {rating}
              </span>
            </button>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <span
        className={className}
        role="group"
        aria-label={`Preset rating: ${currentValue} of 5`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1,
          flexShrink: 0,
          ...style,
        }}
      >
        <button
          ref={buttonRef}
          type="button"
          disabled={!interactive}
          aria-label={interactive ? `Change preset rating, currently ${currentValue} of 5` : `Preset rating: ${currentValue} of 5`}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          title={interactive ? `Rate preset (${currentValue}/5)` : `Preset rating: ${currentValue}/5`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!interactive) return;
            if (!open) positionPopover();
            setOpen(prev => !prev);
          }}
          style={{
            width: hitSize,
            height: hitSize,
            minWidth: '24px',
            minHeight: '24px',
            padding: 0,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 6,
            background: 'transparent',
            color: currentValue > 0 ? indicatorColor : emptyColor,
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
            boxShadow: 'none',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              textShadow: ratingHalo(currentValue, color),
            }}
          >
            {currentValue > 0 ? STAR : EMPTY_STAR}
          </span>
        </button>
      </span>
      {popover}
    </>
  );
});
