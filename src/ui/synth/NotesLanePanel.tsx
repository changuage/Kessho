import React, { useState } from 'react';
import type { Chord, ChordNote } from '../../audio/harmony/chord';
import { ChordEditor, ChordSegment } from '../harmony/chord/ChordEditor';
import DragNumber from '../drums/DragNumber';
import {
  resolveNotesCellArticulation,
  notesCellNotes,
  type LaneDirection,
  type NotesAdvance,
  type NotesArticulation,
  type NotesCell,
  type NotesCellArticulation,
  type NotesCellKind,
  type NotesLane,
} from '../sequencer/synthSequenceVariations';
import './notesLane.css';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const noteName = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const DIRECTION_ORDER: readonly LaneDirection[] = ['forward', 'reverse', 'pingpong'];
const DIRECTION_LABEL: Record<LaneDirection, string> = { forward: 'Forward', reverse: 'Reverse', pingpong: 'Ping-pong' };
const DIRECTION_GLYPH: Record<LaneDirection, string> = { forward: '→', reverse: '←', pingpong: '↔' };

export interface NotesLanePanelProps {
  lane: NotesLane;
  cells: readonly NotesCell[];
  /** Selected cell indices; the last is the one the editor shows. Empty closes the editor. */
  selected: readonly number[];
  hasClipboard: boolean;
  canUndo: boolean;
  keyRoot: number;
  scaleId: number;
  /** Beats in one grid step, the default for a cell's length. */
  gateMax: number;
  disabled?: boolean;
  onSelect: (index: number, additive: boolean) => void;
  onClose: () => void;
  onLaneChange: (patch: Partial<NotesLane>) => void;
  onKind: (kind: NotesCellKind) => void;
  onArticulation: (articulation: NotesCellArticulation) => void;
  onChord: (chord: Chord) => void;
  onIntervals: (intervals: ChordNote[]) => void;
  onGate: (beats: number) => void;
  onCopy: () => void;
  onPlace: () => void;
  onUndo: () => void;
  /** The ARP configuration editor for the shown cell, when it plays as Arp. */
  arpEditor: React.ReactNode;
}

function cellMark(cell: NotesCell): { text: string; stack: boolean; label: string } {
  if (cell.kind === 'rest') return { text: '', stack: false, label: 'rest' };
  if (cell.kind === 'harmony') return { text: 'H', stack: false, label: 'harmony' };
  const notes = notesCellNotes(cell);
  if (cell.chord?.behavior === 'fixed' && notes.length === 1) return { text: noteName(notes[0]!.midi), stack: false, label: noteName(notes[0]!.midi) };
  return { text: '', stack: true, label: cell.chord?.behavior === 'follow' ? 'follow chord' : `${notes.length} note chord` };
}

/** Semitone buttons for one octave of a Harmony cell's intervals. */
const HarmonyIntervals: React.FC<{
  intervals: readonly ChordNote[];
  disabled?: boolean;
  onChange: (intervals: ChordNote[]) => void;
}> = ({ intervals, disabled, onChange }) => {
  const [octave, setOctave] = useState(0);
  const base = octave * 12;
  const toggle = (interval: number) => {
    const present = intervals.some((note) => note.midi === interval);
    const next = present ? intervals.filter((note) => note.midi !== interval) : [...intervals, { midi: interval, velocity: 1 }];
    onChange([...next].sort((a, b) => a.midi - b.midi));
  };
  return (
    <div className="notes-intervals">
      <div className="chord-editor-row" role="group" aria-label="Intervals">
        {Array.from({ length: 12 }, (_, offset) => {
          const interval = base + offset;
          return (
            <button
              key={interval}
              type="button"
              aria-pressed={intervals.some((note) => note.midi === interval)}
              aria-label={`Interval ${interval > 0 ? '+' : ''}${interval}`}
              disabled={disabled}
              onClick={() => toggle(interval)}
            >
              {interval}
            </button>
          );
        })}
      </div>
      <div className="chord-stepper" role="group" aria-label="Interval octave">
        <span>Octave</span>
        <button type="button" aria-label="Interval octave down" disabled={disabled || octave <= -4} onClick={() => setOctave(octave - 1)}>-</button>
        <output aria-label="Interval octave value">{octave}</output>
        <button type="button" aria-label="Interval octave up" disabled={disabled || octave >= 3} onClick={() => setOctave(octave + 1)}>+</button>
      </div>
    </div>
  );
};

/**
 * The Notes lane: its cells, its settings, and one inline editor beneath it
 * for the selected cell. It owns no musical state; the Synth page applies
 * every change to the selected variation.
 */
export const NotesLanePanel: React.FC<NotesLanePanelProps> = ({
  lane, cells, selected, hasClipboard, canUndo, keyRoot, scaleId, gateMax, disabled = false,
  onSelect, onClose, onLaneChange, onKind, onArticulation, onChord, onIntervals, onGate, onCopy, onPlace, onUndo, arpEditor,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const shownIndex = selected.length > 0 ? selected[selected.length - 1]! : null;
  const shown = shownIndex == null ? null : cells[shownIndex] ?? null;
  const selectionLabel = selected.length > 1
    ? `Cells ${[...selected].sort((a, b) => a - b).map((index) => index + 1).join(', ')}`
    : shownIndex == null ? '' : `Cell ${shownIndex + 1}`;
  const effective = shown ? resolveNotesCellArticulation(shown, lane) : 'chord';
  const direction = DIRECTION_ORDER.includes(lane.direction) ? lane.direction : 'forward';

  return (
    <div className="notes-lane seq-lane" data-testid="notes-lane">
      <div className="notes-lane-header">
        <span className="notes-lane-title">Notes</span>
        <button
          type="button"
          className="notes-lane-settings-btn"
          aria-expanded={settingsOpen}
          aria-controls="notes-lane-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Settings
        </button>
      </div>
      <div className="notes-lane-body">
      {settingsOpen ? (
        <div className="notes-lane-settings" id="notes-lane-settings" role="group" aria-label="Notes lane settings">
          <DragNumber
            value={lane.length}
            min={1}
            max={32}
            label="Length"
            disabled={disabled}
            onChange={(length) => onLaneChange({ length })}
          />
          <button
            type="button"
            className="seq-spark-ctrl-btn notes-lane-direction"
            aria-label={`Direction ${DIRECTION_LABEL[direction]}`}
            title={`Direction ${DIRECTION_LABEL[direction]}`}
            disabled={disabled}
            onClick={() => onLaneChange({ direction: DIRECTION_ORDER[(DIRECTION_ORDER.indexOf(direction) + 1) % DIRECTION_ORDER.length]! })}
          >
            {DIRECTION_GLYPH[direction]}
          </button>
          <span className="notes-setting-label">Advance</span>
          <ChordSegment
            label="Advance"
            value={lane.advance}
            disabled={disabled}
            onChange={(advance) => onLaneChange({ advance: advance as NotesAdvance })}
            options={[{ id: 'steps', label: 'Steps' }, { id: 'hits', label: 'Hits' }]}
          />
          <span className="notes-setting-label">Articulation</span>
          <ChordSegment
            label="Default articulation"
            value={lane.articulation}
            disabled={disabled}
            onChange={(articulation) => onLaneChange({ articulation: articulation as NotesArticulation })}
            options={[{ id: 'chord', label: 'Chord' }, { id: 'arp', label: 'Arp' }]}
          />
        </div>
      ) : null}
      <div className="notes-lane-cells" role="group" aria-label="Notes cells">
        {Array.from({ length: lane.length }, (_, index) => {
          const cell = cells[index];
          const mark = cell ? cellMark(cell) : { text: '', stack: false, label: 'rest' };
          const isSelected = selected.includes(index);
          return (
            <button
              key={index}
              type="button"
              className="notes-cell"
              aria-pressed={isSelected}
              aria-label={`Notes cell ${index + 1}, ${mark.label}`}
              disabled={disabled}
              onClick={(event) => onSelect(index, event.shiftKey)}
            >
              <span className="notes-cell-mark">{mark.stack ? <span className="notes-cell-stack" aria-hidden="true" /> : mark.text}</span>
              <small>{index + 1}</small>
            </button>
          );
        })}
      </div>
      {shown && shownIndex != null ? (
        <section
          className="notes-editor"
          aria-label="Notes cell editor"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
              const target = event.target as HTMLElement;
              if (target instanceof HTMLInputElement && target.type === 'number') return;
              event.preventDefault();
              onUndo();
            }
          }}
        >
          <header className="notes-editor-head">
            <strong>{selectionLabel}</strong>
            <button type="button" className="chord-editor-action notes-editor-close" onClick={onClose}>Close</button>
          </header>
          <ChordSegment
            label="Cell kind"
            value={shown.kind}
            disabled={disabled}
            onChange={(kind) => onKind(kind as NotesCellKind)}
            options={[{ id: 'rest', label: 'Rest' }, { id: 'harmony', label: 'Harmony' }, { id: 'chord', label: 'Chord' }]}
          />
          {shown.kind === 'chord' && shown.chord ? (
            <ChordEditor value={shown.chord} onChange={onChord} keyRoot={keyRoot} scaleId={scaleId} maxNotes={32} disabled={disabled} />
          ) : null}
          {shown.kind === 'harmony' ? (
            <HarmonyIntervals intervals={shown.intervals ?? []} disabled={disabled} onChange={onIntervals} />
          ) : null}
          {shown.kind === 'rest' ? null : (
            <>
              <div className="notes-editor-line">
                <span>Articulation</span>
                <ChordSegment
                  label="Articulation"
                  value={shown.articulation}
                  disabled={disabled}
                  onChange={(articulation) => onArticulation(articulation as NotesCellArticulation)}
                  options={[{ id: 'inherit', label: 'Inherit' }, { id: 'chord', label: 'Chord' }, { id: 'arp', label: 'Arp' }]}
                />
                <label className="notes-editor-gate">
                  <span>Length</span>
                  <input
                    type="number"
                    min={0}
                    max={gateMax}
                    step={0.01}
                    value={shown.gateBeats}
                    disabled={disabled}
                    aria-label="Cell length in beats"
                    onChange={(event) => onGate(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              {effective === 'arp' ? arpEditor : null}
            </>
          )}
          <div className="notes-editor-actions" role="group" aria-label="Cell actions">
            <button type="button" className="chord-editor-action" disabled={disabled} onClick={onCopy}>Copy</button>
            <button type="button" className="chord-editor-action" disabled={disabled || !hasClipboard} onClick={onPlace}>Place</button>
            <button type="button" className="chord-editor-action" disabled={disabled || !canUndo} onClick={onUndo}>Undo</button>
          </div>
        </section>
      ) : null}
      </div>
    </div>
  );
};

export default NotesLanePanel;
