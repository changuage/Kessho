import React, { useEffect, useState } from 'react';
import { chordName, type Chord } from '../../../audio/harmony/chord';
import './ChordEditor.css';
import './PaletteRow.css';

export interface PaletteRowProps {
  palette: readonly Chord[];
  keyRoot: number;
  scaleId: number;
  /** Where Place puts the chord, for the button's accessible name; null when nothing is selected. */
  targetLabel: string | null;
  disabled?: boolean;
  /** Receives the selected chip's index; hosts copy it with `placeChordFromPalette`. */
  onPlace: (index: number) => void;
  onRemove: (index: number) => void;
}

/**
 * The Palette: one row of up to 16 saved chords. A chip selects; Place copies
 * it into the current target. Pressing a chip never plays it.
 */
export const PaletteRow: React.FC<PaletteRowProps> = ({ palette, keyRoot, scaleId, targetLabel, disabled = false, onPlace, onRemove }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const keyPc = ((Math.round(keyRoot) % 12) + 12) % 12;
  useEffect(() => {
    if (selected != null && selected >= palette.length) setSelected(null);
  }, [palette.length, selected]);
  const chord = selected == null ? null : palette[selected] ?? null;
  const chordLabel = chord ? chordName(chord, keyPc, scaleId) : '';
  return (
    <div className="palette-row" role="group" aria-label="Palette">
      <div className="palette-row-head">
        <strong>Palette</strong>
        <span className="palette-row-count">{palette.length}/16</span>
      </div>
      {palette.length === 0 ? <span className="palette-row-empty">Empty</span> : (
        <div className="palette-row-chips">
          {palette.map((saved, index) => {
            const label = chordName(saved, keyPc, scaleId);
            return (
              <button
                key={index}
                type="button"
                className="palette-chip"
                aria-pressed={selected === index}
                aria-label={`Palette chord ${label}`}
                disabled={disabled}
                onClick={() => setSelected(selected === index ? null : index)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div className="palette-row-actions" role="group" aria-label="Palette actions">
        <button
          type="button"
          className="chord-editor-action"
          disabled={disabled || !chord || !targetLabel}
          aria-label={chord && targetLabel ? `Place ${chordLabel} into ${targetLabel}` : 'Place'}
          onClick={() => { if (selected != null) onPlace(selected); }}
        >
          Place
        </button>
        <button
          type="button"
          className="chord-editor-action"
          disabled={disabled || !chord}
          aria-label={chord ? `Remove ${chordLabel} from the Palette` : 'Remove'}
          onClick={() => { if (selected != null) onRemove(selected); }}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

export default PaletteRow;
