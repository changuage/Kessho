import React from 'react';

export interface SharedChordMatrixRow {
  id: string | number;
  notes: readonly number[];
  leading?: readonly React.ReactNode[];
  selected?: boolean;
  playing?: boolean;
  editable?: boolean;
  onSelect?: () => void;
}

export interface SharedChordMatrixShellProps {
  axis: readonly number[];
  rows: readonly SharedChordMatrixRow[];
  leadingHeaders?: readonly React.ReactNode[];
  disabled?: boolean;
  editable?: boolean;
  className?: string;
  ariaLabel?: string;
  onToggleNote?: (row: SharedChordMatrixRow, midi: number, present: boolean) => void;
  onMoveOctave?: (row: SharedChordMatrixRow, midi: number, octaves: number) => void;
}

export interface SharedChordMatrixProps {
  notes: readonly number[];
  axis?: readonly number[];
  disabled?: boolean;
  editable?: boolean;
  onToggleNote?: (midi: number, present: boolean) => void;
  onMoveOctave?: (midi: number, octaves: number) => void;
}

export const SharedChordMatrixShell: React.FC<SharedChordMatrixShellProps> = ({ axis, rows, leadingHeaders = [], disabled = false, editable = true, className = '', ariaLabel = 'Exact chord notes', onToggleNote, onMoveOctave }) => (
  <div className="harmony-shared-chord-matrix-shell" role="grid" aria-label={ariaLabel}>
    <table className={`harmony-shared-chord-matrix-table ${className}`.trim()}>
      <thead><tr>{leadingHeaders.map((header, index) => <th key={`leading-${index}`} scope="col" className="harmony-shared-matrix-leading">{header}</th>)}{axis.map((midi) => <th key={midi} scope="col" className="harmony-shared-matrix-pitch seq-chord-matrix-pitch"><span>{['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((midi % 12) + 12) % 12]}</span><small>{Math.floor(midi / 12) - 1}</small></th>)}</tr></thead>
      <tbody>{rows.map((row) => {
        const noteSet = new Set(row.notes);
        return <tr key={row.id} className={`${row.selected ? 'selected ' : ''}${row.playing ? 'playing' : ''}`} aria-selected={row.selected} onClick={row.onSelect}>
          {row.leading?.map((cell, index) => <td key={`leading-${index}`} className="harmony-shared-matrix-leading">{cell}</td>)}
          {axis.map((midi) => {
            const present = noteSet.has(midi);
            return <td key={midi} className={`harmony-shared-matrix-note seq-chord-matrix-note${present ? ' on' : ''}`}>
              <button type="button" role="gridcell" disabled={disabled || !editable || row.editable === false} aria-label={`${midi} ${present ? 'on' : 'off'}`} onClick={(event) => { event.stopPropagation(); onToggleNote?.(row, midi, present); }} onDoubleClick={(event) => { event.stopPropagation(); if (present) onMoveOctave?.(row, midi, 1); }} title={present ? `Remove ${midi}` : `Add ${midi}`}>{present ? '●' : ''}</button>
            </td>;
          })}
        </tr>;
      })}</tbody>
    </table>
  </div>
);

export const SharedChordMatrix: React.FC<SharedChordMatrixProps> = ({ notes, axis, disabled = false, editable = true, onToggleNote, onMoveOctave }) => {
  const columns = axis?.length ? axis : Array.from({ length: Math.max(13, (notes.length ? Math.max(...notes) - Math.min(...notes) : 12) + 1) }, (_, i) => (notes.length ? Math.min(...notes) : 60) + i);
  const row: SharedChordMatrixRow = { id: 'exact', notes };
  return <SharedChordMatrixShell axis={columns} rows={[row]} disabled={disabled} editable={editable} onToggleNote={(_row, midi, present) => onToggleNote?.(midi, present)} onMoveOctave={(_row, midi, octaves) => onMoveOctave?.(midi, octaves)} ariaLabel="Exact chord notes" />;
};

export default SharedChordMatrix;
