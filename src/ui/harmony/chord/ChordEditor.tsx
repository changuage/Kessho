import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHORD_MAX_NOTES,
  chordDegreeLabels,
  chordName,
  chordRootName,
  createFixedChord,
  previewChordNotes,
  recognizeChord,
  type Chord,
  type ChordExtension,
  type ChordNote,
  type ChordQuality,
} from '../../../audio/harmony/chord';
import { subscribeHarmonyMidiCapture } from '../../midiLearn/midiHarmonyCapture';
import { getLiveChordMidiPlacement, isLiveChordWhiteMidi } from '../live/liveKeyboardGeometry';
import '../live/liveChordKeyboard.css';
import './ChordEditor.css';

export interface ChordEditorProps {
  value: Chord;
  onChange: (next: Chord) => void;
  /** The key's root, as a MIDI note or pitch class. */
  keyRoot: number;
  /** Harmony scale id, as `Chord` and the native resolver use it. */
  scaleId: number;
  /** Adds the chord to the Palette; the button shows only when given. */
  onSave?: (chord: Chord) => void;
  /** Cap on Fixed notes: 8 for an authored chord, 32 inside a sequencer cell. */
  maxNotes?: number;
  disabled?: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SHAPES: ReadonlyArray<{ quality: ChordQuality; label: string }> = [
  { quality: 'diatonic', label: 'Diatonic' },
  { quality: 'major', label: 'Major' },
  { quality: 'minor', label: 'Minor' },
  { quality: 'sus4', label: 'Sus4' },
];
const EXTENSIONS: ReadonlyArray<{ extension: ChordExtension; label: string }> = [
  { extension: '6', label: '6' },
  { extension: '7', label: '7' },
  { extension: '9', label: '9' },
  { extension: '11', label: '11' },
  { extension: '13', label: '13' },
  { extension: 'dominant', label: 'Dominant' },
];

const noteLabel = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Segmented choice in Kessho's 6px control shape; `pressed` is the sage on-state. */
export const ChordSegment: React.FC<{
  label: string;
  options: ReadonlyArray<{ id: string; label: string; disabled?: boolean }>;
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}> = ({ label, options, value, onChange, disabled }) => (
  <div className="chord-segment" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        aria-pressed={value === option.id}
        disabled={disabled || option.disabled}
        onClick={() => onChange(option.id)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Stepper: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ label, value, min, max, onChange, disabled }) => (
  <div className="chord-stepper" role="group" aria-label={label}>
    <span>{label}</span>
    <button type="button" aria-label={`${label} down`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>-</button>
    <output aria-label={`${label} value`}>{value}</output>
    <button type="button" aria-label={`${label} up`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
  </div>
);

/**
 * The one editor for a `Chord`: Follow (degree, shape, extensions, voicing) or
 * Fixed (literal notes on a keyboard). Edits apply immediately; Synth's Notes
 * cells and Global's Voicing drawer both host it.
 */
export const ChordEditor: React.FC<ChordEditorProps> = ({
  value,
  onChange,
  keyRoot,
  scaleId,
  onSave,
  maxNotes = CHORD_MAX_NOTES,
  disabled = false,
}) => {
  const fixed = value.behavior === 'fixed';
  const keyPc = ((Math.round(keyRoot) % 12) + 12) % 12;
  const degreeLabels = useMemo(() => chordDegreeLabels(scaleId), [scaleId]);
  const name = useMemo(() => (value.behavior === 'follow'
    ? `${chordName(value, keyPc, scaleId)} (${chordRootName(value, keyPc, scaleId)})`
    : chordName(value, keyPc, scaleId)), [keyPc, scaleId, value]);
  const shown = useMemo(
    () => fixed ? value.notes.map((note) => note.midi) : value.notes.length > 0 ? value.notes.map((note) => note.midi) : previewChordNotes(value, keyPc, scaleId),
    [fixed, keyPc, scaleId, value],
  );
  const lowest = shown.length > 0 ? Math.min(...shown) : 60;
  const [octave, setOctave] = useState(() => clamp(Math.floor(lowest / 12) - 1, 0, 8));
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  // A wide editor shows two octaves; a phone keeps one with 44px keys and octave buttons.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= 560));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const range = useMemo(() => {
    const octaves = wide ? 2 : 1;
    const lowMidi = Math.min(127 - octaves * 12 + 1, (octave + 1) * 12);
    return {
      lowMidi,
      highMidi: lowMidi + octaves * 12 - 1,
      midis: Array.from({ length: octaves * 12 }, (_, index) => lowMidi + index),
      whiteKeyCount: octaves * 7,
    };
  }, [octave, wide]);

  const latest = useRef({ value, onChange, shown, maxNotes, fixed });
  latest.current = { value, onChange, shown, maxNotes, fixed };

  const pinNotes = useCallback((midis: readonly number[]) => {
    const current = latest.current;
    const sorted = [...new Set(midis.map((midi) => clamp(Math.round(midi), 0, 127)))].sort((a, b) => a - b).slice(0, current.maxNotes);
    const existing = new Map(current.value.notes.map((note) => [note.midi, note]));
    const notes: ChordNote[] = sorted.map((midi) => existing.get(midi) ?? { midi });
    current.onChange({ ...createFixedChord(notes), voicing: current.value.voicing, degree: current.value.degree, quality: current.value.quality, extensions: current.value.extensions });
  }, []);

  const toggleNote = useCallback((midi: number) => {
    const midis = latest.current.shown;
    pinNotes(midis.includes(midi) ? midis.filter((note) => note !== midi) : [...midis, midi]);
  }, [pinNotes]);

  // Held MIDI notes join the chord while the editor has focus.
  useEffect(() => {
    if (!hasFocus || disabled) return undefined;
    return subscribeHarmonyMidiCapture((event) => {
      if (event.kind !== 'noteOn') return;
      const midis = latest.current.shown;
      if (!midis.includes(event.midi)) pinNotes([...midis, event.midi]);
    });
  }, [disabled, hasFocus, pinNotes]);

  const setBehavior = (id: string) => {
    if (id === 'fixed' && !fixed) {
      const pinned = value.notes.length > 0 ? value.notes : previewChordNotes(value, keyPc, scaleId).map((midi) => ({ midi }));
      onChange({ ...value, behavior: 'fixed', notes: pinned.slice(0, maxNotes) });
    } else if (id === 'follow' && fixed) {
      const recognized = recognizeChord(value.notes.map((note) => note.midi), keyPc, scaleId);
      if (recognized) onChange({ ...value, ...recognized, behavior: 'follow', notes: [] });
    }
  };
  // Follow edits clear the native display cache so the preview always matches.
  const editFollow = (patch: Partial<Chord>) => onChange({ ...value, ...patch, notes: [] });
  const editVoicing = (patch: Partial<Chord['voicing']>) => editFollow({ voicing: { ...value.voicing, ...patch } });
  const toggleExtension = (extension: ChordExtension) => editFollow({
    extensions: value.extensions.includes(extension)
      ? value.extensions.filter((entry) => entry !== extension)
      : [...value.extensions, extension],
  });
  const degreeIndex = ((value.degree % degreeLabels.length) + degreeLabels.length) % degreeLabels.length;
  const shownSet = new Set(shown);
  const outside = shown.filter((midi) => midi < range.lowMidi || midi > range.highMidi).length;

  return (
    <section
      ref={sectionRef}
      className="chord-editor"
      aria-label="Chord editor"
      onFocus={() => setHasFocus(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHasFocus(false); }}
    >
      <header className="chord-editor-head">
        <strong className="chord-editor-name" aria-live="polite">{name}</strong>
        <ChordSegment
          label="Chord behaviour"
          value={value.behavior}
          disabled={disabled}
          onChange={setBehavior}
          options={[{ id: 'follow', label: 'Follow' }, { id: 'fixed', label: 'Fixed' }]}
        />
        {onSave ? <button type="button" className="chord-editor-action" disabled={disabled} onClick={() => onSave(value)}>Save</button> : null}
      </header>

      {fixed ? null : (
        <>
          <div className="chord-editor-row" role="group" aria-label="Degree">
            {degreeLabels.map((label, index) => (
              <button key={label} type="button" aria-pressed={degreeIndex === index} disabled={disabled} onClick={() => editFollow({ degree: index })}>{label}</button>
            ))}
          </div>
          <ChordSegment
            label="Shape"
            value={SHAPES.some((shape) => shape.quality === value.quality) ? value.quality : null}
            disabled={disabled}
            onChange={(id) => editFollow({ quality: id as ChordQuality })}
            options={SHAPES.map((shape) => ({ id: shape.quality, label: shape.label }))}
          />
          <details className="chord-editor-more">
            <summary>Extensions and voicing</summary>
            <div className="chord-editor-row" role="group" aria-label="Extensions">
              {EXTENSIONS.map((entry) => (
                <button key={entry.extension} type="button" aria-pressed={value.extensions.includes(entry.extension)} disabled={disabled} onClick={() => toggleExtension(entry.extension)}>{entry.label}</button>
              ))}
            </div>
            <div className="chord-editor-voicing">
              <Stepper label="Inversion" value={value.voicing.inversion} min={0} max={7} disabled={disabled} onChange={(inversion) => editVoicing({ inversion })} />
              <Stepper label="Register" value={value.voicing.register} min={-3} max={3} disabled={disabled} onChange={(register) => editVoicing({ register })} />
              <label className="chord-editor-spread">
                <span>Spread</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={value.voicing.spread}
                  disabled={disabled}
                  aria-label="Spread"
                  onChange={(event) => editVoicing({ spread: Number(event.currentTarget.value) })}
                />
              </label>
              <ChordSegment
                label="Bass"
                value={value.voicing.bass === 'root' ? 'root' : value.voicing.bass === 'inversion' ? 'inversion' : null}
                disabled={disabled}
                onChange={(id) => editVoicing({ bass: id === 'root' ? 'root' : 'inversion' })}
                options={[{ id: 'inversion', label: 'Inversion' }, { id: 'root', label: 'Root' }]}
              />
            </div>
          </details>
        </>
      )}

      <div className="chord-editor-keyboard">
        <div className="chord-editor-keys harmony-live-keyboard-keys" role="group" aria-label="Chord keyboard">
          {range.midis.map((midi) => {
            const black = !isLiveChordWhiteMidi(midi);
            const placement = getLiveChordMidiPlacement(midi, range);
            const on = shownSet.has(midi);
            return (
              <div
                key={midi}
                className={`harmony-live-key-slot ${black ? 'harmony-live-black-keys' : 'harmony-live-white-keys'}`}
                style={{ '--live-key-left': `${placement.left}%`, '--live-key-width': `${placement.width}%` } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={`harmony-live-key ${black ? 'black' : 'white'}${on ? ' retained' : ''}`}
                  aria-label={noteLabel(midi)}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggleNote(midi)}
                >
                  <strong>{NOTE_NAMES[((midi % 12) + 12) % 12]}</strong>
                  <small>{Math.floor(midi / 12) - 1}</small>
                </button>
              </div>
            );
          })}
        </div>
        <div className="chord-editor-octaves" role="group" aria-label="Keyboard octave">
          <button type="button" aria-label="Octave down" disabled={octave <= 0} onClick={() => setOctave(octave - 1)}>-</button>
          <output aria-label="Keyboard range">{noteLabel(range.lowMidi)}</output>
          <button type="button" aria-label="Octave up" disabled={octave >= 8} onClick={() => setOctave(octave + 1)}>+</button>
          {outside > 0 ? <span className="chord-editor-outside">{outside} more outside this octave</span> : null}
          {fixed && shown.length > 0 ? (
            <button type="button" className="chord-editor-action" disabled={disabled} onClick={() => pinNotes([])}>Clear</button>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default ChordEditor;
