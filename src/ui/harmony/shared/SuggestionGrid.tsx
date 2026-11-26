import React from 'react';
import RelativeChordDotMap from './RelativeChordDotMap';

export interface HarmonySuggestion { id: string; label: string; notes: readonly number[]; exactMidiNotes?: readonly number[]; quality?: string; category?: string; triggerKey?: string; }
export interface SuggestionGridProps { suggestions: readonly (HarmonySuggestion | null)[]; onPress?: (suggestion: HarmonySuggestion) => void; onRelease?: (suggestion: HarmonySuggestion) => void; disabled?: boolean; axis?: readonly number[]; }
const TRIGGERS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const;

/** Eight suggestion pads: hold a pad (or its key) to preview the chord. */
export const SuggestionGrid: React.FC<SuggestionGridProps> = ({
  suggestions,
  onPress,
  onRelease,
  disabled = false,
  axis,
}) => (
  <div className="harmony-suggestion-grid-wrap">
    <div className="harmony-suggestion-grid" aria-label="Chord suggestions">
      {suggestions.slice(0, 8).map((suggestion, index) => {
        if (!suggestion) {
          return (
            <span key={`empty-${index}`} className="harmony-suggestion-grid-empty" aria-label={`${TRIGGERS[index]} empty suggestion pad`}>
              <kbd>{TRIGGERS[index]}</kbd>
              <small>Empty</small>
            </span>
          );
        }
        const trigger = suggestion.triggerKey ?? TRIGGERS[index];
        const notes = suggestion.exactMidiNotes ?? suggestion.notes;
        const releasePointer = (element: HTMLButtonElement, pointerId: number) => {
          if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture?.(pointerId);
          onRelease?.(suggestion);
        };
        return (
          <div className="harmony-suggestion-card" key={suggestion.id}>
            <button
              type="button"
              disabled={disabled}
              aria-label={`${suggestion.label}, suggestion key ${trigger}, hold to play${suggestion.category ? `, ${suggestion.category}` : ''}`}
              aria-keyshortcuts={trigger}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                onPress?.(suggestion);
              }}
              onPointerUp={(event) => releasePointer(event.currentTarget, event.pointerId)}
              onPointerCancel={(event) => releasePointer(event.currentTarget, event.pointerId)}
              onBlur={() => onRelease?.(suggestion)}
              onKeyDown={(event) => {
                if (event.key.toUpperCase() !== trigger || event.repeat) return;
                event.preventDefault();
                onPress?.(suggestion);
              }}
              onKeyUp={(event) => {
                if (event.key.toUpperCase() === trigger) onRelease?.(suggestion);
              }}
            >
              <kbd aria-hidden="true">{trigger}</kbd>
              <strong>{suggestion.label}</strong>
              {suggestion.category && <small>{suggestion.category}</small>}
              <RelativeChordDotMap notes={notes} axis={axis} />
            </button>
          </div>
        );
      })}
    </div>
  </div>
);
export default SuggestionGrid;
