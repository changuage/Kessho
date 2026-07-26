import React from 'react';
import RelativeChordDotMap from './RelativeChordDotMap';

export interface HarmonySuggestion { id: string; label: string; notes: readonly number[]; quality?: string; }
export interface SuggestionGridProps { suggestions: readonly HarmonySuggestion[]; onSelect?: (suggestion: HarmonySuggestion) => void; disabled?: boolean; axis?: readonly number[]; }
const TRIGGERS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const;
export const SuggestionGrid: React.FC<SuggestionGridProps> = ({ suggestions, onSelect, disabled = false, axis }) => <div className="harmony-suggestion-grid" aria-label="Chord suggestions">{suggestions.slice(0, 8).map((suggestion, index) => <button key={suggestion.id} type="button" disabled={disabled} onClick={() => onSelect?.(suggestion)}><kbd>{TRIGGERS[index]}</kbd><strong>{suggestion.label}</strong><RelativeChordDotMap notes={suggestion.notes} axis={axis} /></button>)}</div>;
export default SuggestionGrid;
