import React from 'react';
import RelativeChordDotMap from './RelativeChordDotMap';
import type { HarmonySuggestion as AudioHarmonySuggestion } from '../../../audio/harmony/chordSuggestionEngine';

export interface HarmonySuggestion { id: string; label: string; notes: readonly number[]; exactMidiNotes?: readonly number[]; quality?: string; category?: string; triggerKey?: string; audioSuggestion?: AudioHarmonySuggestion; }
export interface SuggestionGridProps { suggestions: readonly (HarmonySuggestion | null)[]; onSelect?: (suggestion: HarmonySuggestion) => void; onPress?: (suggestion: HarmonySuggestion) => void; onRelease?: (suggestion: HarmonySuggestion) => void; onSave?: (suggestion: HarmonySuggestion) => void; disabled?: boolean; axis?: readonly number[]; }
const TRIGGERS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const;
export const SuggestionGrid: React.FC<SuggestionGridProps> = ({ suggestions, onSelect, onPress, onRelease, onSave, disabled = false, axis }) => <div className="harmony-suggestion-grid" aria-label="Chord suggestions">{suggestions.slice(0, 8).map((suggestion, index) => {
  if (!suggestion) return <span key={`empty-${index}`} className="harmony-suggestion-grid-empty" aria-label={`${TRIGGERS[index]} empty suggestion pad`}><kbd>{TRIGGERS[index]}</kbd><small>Empty</small></span>;
  const trigger = suggestion.triggerKey ?? TRIGGERS[index];
  const notes = suggestion.exactMidiNotes ?? suggestion.notes;
  return <button key={suggestion.id} type="button" disabled={disabled} aria-label={`${suggestion.label}, suggestion key ${trigger}, hold to play${suggestion.category ? `, ${suggestion.category}` : ''}`} onClick={() => onSelect?.(suggestion)} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); onPress?.(suggestion); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); onRelease?.(suggestion); }} onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); onRelease?.(suggestion); }} onBlur={() => onRelease?.(suggestion)} onKeyDown={(event) => { if (event.key.toUpperCase() === trigger && !event.repeat) { event.preventDefault(); if (event.shiftKey) onSave?.(suggestion); else onPress?.(suggestion); } }} onKeyUp={(event) => { if (event.key.toUpperCase() === trigger) onRelease?.(suggestion); }}><kbd aria-hidden="true">{trigger}</kbd><strong>{suggestion.label}</strong>{suggestion.category && <small>{suggestion.category}</small>}<RelativeChordDotMap notes={notes} axis={axis} /></button>;
})}</div>;
export default SuggestionGrid;
