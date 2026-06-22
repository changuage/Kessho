import React, { useRef } from 'react';
import { resolveTriggerClip } from '../../sequencer/triggerClip';
import type { GeneratedDrumPhrase } from './scatterTypes';

interface PhraseGlyphCardProps {
  phrase: GeneratedDrumPhrase;
  selected?: boolean;
  onHold?: () => void;
  onDragStart?: (phrase: GeneratedDrumPhrase) => void;
}

const PhraseGlyphCard: React.FC<PhraseGlyphCardProps> = ({
  phrase,
  selected = false,
  onHold,
  onDragStart,
}) => {
  const holdTimerRef = useRef<number | null>(null);
  const pattern = resolveTriggerClip(phrase.triggerClip);
  const glyphPoints = pattern.map((enabled, index) => {
    const t = pattern.length <= 1 ? 0 : index / (pattern.length - 1);
    const x = 4 + t * 92;
    const value = phrase.pitch[index] ?? 0;
    const y = 28 - Math.max(-12, Math.min(12, value)) * 0.85;
    return {
      enabled,
      index,
      x,
      y: Math.max(4, Math.min(52, y)),
      probability: phrase.probability[index] ?? 1,
      ratchet: phrase.ratchet[index] ?? 1,
      slice: phrase.slice[index] ?? 0,
      reverse: phrase.reverse[index] ?? 0,
    };
  });
  const enabledGlyphPoints = glyphPoints.filter((point) => point.enabled);
  const connectorSegments = enabledGlyphPoints.slice(1).map((point, index) => ({
    from: enabledGlyphPoints[index],
    to: point,
  })).filter((segment): segment is { from: (typeof glyphPoints)[number]; to: (typeof glyphPoints)[number] } => Boolean(segment.from));

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  return (
    <div
      className={`scatter-phrase-card${selected ? ' selected' : ''}`}
      draggable={Boolean(onDragStart)}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', phrase.id);
        onDragStart?.(phrase);
      }}
      onPointerDown={() => {
        if (!onHold) return;
        clearHold();
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = null;
          onHold();
        }, 420);
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
    >
      <div className="scatter-phrase-card__glyph" aria-label={phrase.label}>
        <div className="scatter-phrase-card__map" aria-hidden="true">
          <svg viewBox="0 0 100 56" preserveAspectRatio="none">
            {connectorSegments.map((segment) => (
              <line
                key={`${segment.from.index}-${segment.to.index}`}
                x1={segment.from.x}
                y1={segment.from.y}
                x2={segment.to.x}
                y2={segment.to.y}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {glyphPoints.map((point) => (
            <span
              key={point.index}
              className={[
                'scatter-phrase-map-dot',
                point.enabled ? 'on' : 'off',
                point.ratchet > 1 ? 'ratchet' : '',
                point.slice > 0 ? 'slice' : '',
                point.reverse > 0 ? 'reverse' : '',
              ].filter(Boolean).join(' ')}
              style={{
                left: `${point.x}%`,
                top: `${(point.y / 56) * 100}%`,
                opacity: point.enabled ? Math.max(0.28, point.probability) : 0.16,
              }}
            />
          ))}
        </div>
      </div>
      <div className="scatter-phrase-card__meta">
        <span>{phrase.summary.steps}</span>
        <span>{phrase.summary.contour}</span>
      </div>
    </div>
  );
};

export default PhraseGlyphCard;
