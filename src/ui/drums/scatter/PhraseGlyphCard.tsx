import React, { useRef } from 'react';
import { resolveTriggerClip } from '../../sequencer/triggerClip';
import type { GeneratedDrumPhrase } from './scatterTypes';

interface PhraseGlyphCardProps {
  phrase: GeneratedDrumPhrase;
  selected?: boolean;
  pinned?: boolean;
  onHold?: () => void;
  onPrint?: () => void;
  onPin?: () => void;
  onMutate?: () => void;
  onDragStart?: (phrase: GeneratedDrumPhrase) => void;
}

const PhraseGlyphCard: React.FC<PhraseGlyphCardProps> = ({
  phrase,
  selected = false,
  pinned = false,
  onHold,
  onPrint,
  onPin,
  onMutate,
  onDragStart,
}) => {
  const holdTimerRef = useRef<number | null>(null);
  const pattern = resolveTriggerClip(phrase.triggerClip);
  const contourPoints = phrase.pitch.map((value, index) => {
    const t = phrase.pitch.length <= 1 ? 0 : index / (phrase.pitch.length - 1);
    const x = 4 + t * 92;
    const y = 28 - Math.max(-12, Math.min(12, value)) * 0.85;
    return `${x},${Math.max(4, Math.min(52, y))}`;
  }).join(' ');

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  return (
    <div
      className={`scatter-phrase-card${selected ? ' selected' : ''}${pinned ? ' pinned' : ''}`}
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
        <div className="scatter-phrase-card__dots">
          {pattern.map((enabled, index) => {
            const prob = phrase.probability[index] ?? 1;
            const ratchet = phrase.ratchet[index] ?? 1;
            return (
              <span
                key={index}
                className={[
                  'scatter-phrase-dot',
                  enabled ? 'on' : '',
                  ratchet > 1 ? 'ratchet' : '',
                  (phrase.slice[index] ?? 0) > 0 ? 'slice' : '',
                  (phrase.reverse[index] ?? 0) > 0 ? 'reverse' : '',
                ].filter(Boolean).join(' ')}
                style={{ opacity: enabled ? Math.max(0.25, prob) : 0.18 }}
              >
                {ratchet > 1 ? ratchet : ''}
              </span>
            );
          })}
        </div>
        <svg className="scatter-phrase-card__contour" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={contourPoints} />
        </svg>
      </div>
      <div className="scatter-phrase-card__meta">
        <span>{phrase.summary.steps}</span>
        <span>{phrase.summary.contour}</span>
      </div>
      <div className="scatter-phrase-card__actions">
        {onPrint && <button type="button" onClick={onPrint} title="Print">Print</button>}
        {onPin && <button type="button" onClick={onPin} title={pinned ? 'Pinned' : 'Pin'}>{pinned ? 'On' : 'Pin'}</button>}
        {onMutate && <button type="button" onClick={onMutate} title="Mutate">New</button>}
      </div>
    </div>
  );
};

export default PhraseGlyphCard;
