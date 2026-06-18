import React from 'react';
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
  onPrint,
  onPin,
  onMutate,
  onDragStart,
}) => {
  const pattern = phrase.triggerClip.basePattern;
  return (
    <div
      className={`scatter-phrase-card${selected ? ' selected' : ''}${pinned ? ' pinned' : ''}`}
      draggable={Boolean(onDragStart)}
      onDragStart={() => onDragStart?.(phrase)}
    >
      <div className="scatter-phrase-card__top">
        <span>{phrase.label}</span>
        <span>{phrase.feel.zone}</span>
      </div>
      <div className="scatter-phrase-card__dots">
        {pattern.map((enabled, index) => {
          const prob = phrase.probability[index] ?? 1;
          const ratchet = phrase.ratchet[index] ?? 1;
          return (
            <span
              key={index}
              className={`scatter-phrase-dot${enabled ? ' on' : ''}${ratchet > 1 ? ' ratchet' : ''}`}
              style={{ opacity: enabled ? Math.max(0.25, prob) : 0.18 }}
            >
              {ratchet > 1 ? ratchet : ''}
            </span>
          );
        })}
      </div>
      <div className="scatter-phrase-card__contour">
        {phrase.pitch.map((value, index) => (
          <span
            key={index}
            style={{ height: `${28 + Math.max(-12, Math.min(12, value)) * 2}px` }}
          />
        ))}
      </div>
      <div className="scatter-phrase-card__actions">
        {onPrint && <button type="button" onClick={onPrint}>Print</button>}
        {onPin && <button type="button" onClick={onPin}>{pinned ? 'Pinned' : 'Pin'}</button>}
        {onMutate && <button type="button" onClick={onMutate}>Mutate</button>}
      </div>
    </div>
  );
};

export default PhraseGlyphCard;
