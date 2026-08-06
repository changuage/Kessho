import React, { useEffect, useRef, useState } from 'react';
import RelativeChordDotMap from './RelativeChordDotMap';
import type { HarmonySuggestion as AudioHarmonySuggestion } from '../../../audio/harmony/chordSuggestionEngine';

export interface HarmonySuggestion { id: string; label: string; notes: readonly number[]; exactMidiNotes?: readonly number[]; quality?: string; category?: string; triggerKey?: string; audioSuggestion?: AudioHarmonySuggestion; }
export interface SuggestionGridProps { suggestions: readonly (HarmonySuggestion | null)[]; onSelect?: (suggestion: HarmonySuggestion) => void; onPress?: (suggestion: HarmonySuggestion) => void; onRelease?: (suggestion: HarmonySuggestion) => void; onSave?: (suggestion: HarmonySuggestion) => void; disabled?: boolean; axis?: readonly number[]; }
const TRIGGERS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const;
const LONG_PRESS_MS = 450;

export const SuggestionGrid: React.FC<SuggestionGridProps> = ({
  suggestions,
  onSelect,
  onPress,
  onRelease,
  onSave,
  disabled = false,
  axis,
}) => {
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => () => cancelTimer(), []);
  const openMenu = (index: number, suggestion: HarmonySuggestion) => {
    cancelTimer();
    onRelease?.(suggestion);
    setMenuIndex(index);
  };
  const menuSuggestion = menuIndex == null ? null : suggestions[menuIndex] ?? null;
  return <div className="harmony-suggestion-grid-wrap">
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
            aria-label={`${suggestion.label}, suggestion key ${trigger}, hold to play, Shift saves to next open slot${suggestion.category ? `, ${suggestion.category}` : ''}`}
            aria-keyshortcuts={trigger}
            onContextMenu={(event) => { event.preventDefault(); openMenu(index, suggestion); }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              if (event.shiftKey) onSave?.(suggestion);
              else {
                onPress?.(suggestion);
                timerRef.current = setTimeout(() => openMenu(index, suggestion), LONG_PRESS_MS);
              }
            }}
            onPointerUp={(event) => { cancelTimer(); releasePointer(event.currentTarget, event.pointerId); }}
            onPointerCancel={(event) => { cancelTimer(); releasePointer(event.currentTarget, event.pointerId); }}
            onBlur={() => { cancelTimer(); onRelease?.(suggestion); }}
            onKeyDown={(event) => {
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); openMenu(index, suggestion); return; }
              if (event.key.toUpperCase() !== trigger || event.repeat) return;
              event.preventDefault();
              if (event.shiftKey) onSave?.(suggestion);
              else onPress?.(suggestion);
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
          <button type="button" className="harmony-suggestion-menu-trigger" aria-label={`Actions for ${suggestion.label}`} aria-haspopup="menu" onClick={() => openMenu(index, suggestion)}>…</button>
        </div>
      );
      })}
    </div>
    {menuSuggestion && <div className="harmony-card-action-sheet harmony-suggestion-action-sheet" role="menu" aria-label={`${menuSuggestion.label} actions`}>
      <div><strong>{menuSuggestion.label}</strong><button type="button" aria-label="Close suggestion actions" onClick={() => setMenuIndex(null)}>×</button></div>
      <button type="button" role="menuitem" onPointerDown={() => onPress?.(menuSuggestion)} onPointerUp={() => onRelease?.(menuSuggestion)}>Hold to preview</button>
      <button type="button" role="menuitem" disabled={disabled} onClick={() => { onSelect?.(menuSuggestion); setMenuIndex(null); }}>Use here</button>
      <button type="button" role="menuitem" disabled={disabled} onClick={() => { onSave?.(menuSuggestion); setMenuIndex(null); }}>Save to next open slot</button>
    </div>}
  </div>;
};
export default SuggestionGrid;
