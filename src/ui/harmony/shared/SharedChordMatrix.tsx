import React from 'react';

export interface SharedChordMatrixProps {
  notes: readonly number[];
  axis?: readonly number[];
  disabled?: boolean;
  editable?: boolean;
  onToggleNote?: (midi: number, present: boolean) => void;
  onMoveOctave?: (midi: number, octaves: number) => void;
}

export const SharedChordMatrix: React.FC<SharedChordMatrixProps> = ({ notes, axis, disabled = false, editable = true, onToggleNote, onMoveOctave }) => {
  const columns = axis?.length ? axis : Array.from({ length: Math.max(13, (notes.length ? Math.max(...notes) - Math.min(...notes) : 12) + 1) }, (_, i) => (notes.length ? Math.min(...notes) : 60) + i);
  const noteSet = new Set(notes);
  return <div className="harmony-shared-chord-matrix" role="grid" aria-label="Exact chord notes">
    {columns.map((midi) => {
      const present = noteSet.has(midi);
      return <button key={midi} type="button" role="gridcell" disabled={disabled || !editable} className={`harmony-matrix-cell${present ? ' on' : ''}`} onClick={() => onToggleNote?.(midi, present)} onDoubleClick={() => present && onMoveOctave?.(midi, 1)} title={present ? `Remove ${midi}` : `Add ${midi}`}>{present ? '●' : '·'}<small>{midi}</small></button>;
    })}
  </div>;
};

export default SharedChordMatrix;
