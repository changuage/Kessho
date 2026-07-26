import React, { useCallback, useState } from 'react';
import SharedChordMatrix from './SharedChordMatrix';

export interface ExactVoicingEditorProps {
  notes: readonly number[];
  axis?: readonly number[];
  locked?: boolean;
  onChange: (notes: number[]) => void;
}

export const ExactVoicingEditor: React.FC<ExactVoicingEditorProps> = ({ notes, axis, locked = false, onChange }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const toggle = useCallback((midi: number, present: boolean) => {
    const next = present ? notes.filter((value) => value !== midi) : [...notes, midi].sort((a, b) => a - b);
    if (next.length === 0) return;
    setSelected(present ? null : midi);
    onChange(next);
  }, [notes, onChange]);
  return <div className="harmony-exact-voicing-editor"><SharedChordMatrix notes={notes} axis={axis} disabled={locked} onToggleNote={toggle} onMoveOctave={(midi, octaves) => onChange(notes.map((value) => value === midi ? Math.max(0, Math.min(127, value + octaves * 12)) : value).sort((a, b) => a - b))} /><span className="harmony-exact-selection">{selected == null ? 'Select a note' : `Selected ${selected}`}</span></div>;
};

export default ExactVoicingEditor;
