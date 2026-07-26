import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useKeyboardScope } from '../../keyboard/useKeyboardScope';
import '../shared/harmonyWorkspace.css';

export type LiveChordScope =
  | { kind: 'draft'; owner: 'harmony-detail' | 'seq'; seqId?: number }
  | { kind: 'harmony-takeover' }
  | { kind: 'seq-live'; seqId: number };

export interface LiveChordKeyboardProps {
  scope: LiveChordScope;
  notes?: readonly number[];
  rootNote?: number;
  octave?: number;
  disabled?: boolean;
  active?: boolean;
  onNoteDown: (midi: number, velocity: number, source: 'onscreen' | 'qwerty') => void;
  onNoteUp: (midi: number, source: 'onscreen' | 'qwerty') => void;
  onScopeFocus?: () => void;
  onReleaseAll?: () => void;
  className?: string;
}

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11] as const;
const BLACK_KEYS = [1, 3, 6, 8, 10] as const;
const KEY_MAP: Readonly<Record<string, number>> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SHORTCUTS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J'] as const;

function clampMidi(midi: number): number { return Math.max(0, Math.min(127, Math.round(midi))); }
function scopeLabel(scope: LiveChordScope): string {
  if (scope.kind === 'draft') return 'DRAFT';
  if (scope.kind === 'harmony-takeover') return 'HARMONY TAKEOVER';
  return `SEQ ${scope.seqId + 1} LIVE`;
}

export const LiveChordKeyboard: React.FC<LiveChordKeyboardProps> = ({
  scope,
  notes = [],
  rootNote = 0,
  octave = 4,
  disabled = false,
  active = true,
  onNoteDown,
  onNoteUp,
  onScopeFocus,
  onReleaseAll,
  className,
}) => {
  const held = useRef(new Map<string, number>());
  const baseMidi = Math.max(0, Math.min(108, Math.round(octave) * 12));
  const noteSet = useMemo(() => new Set(notes.map(clampMidi)), [notes]);
  const releaseAll = useCallback(() => {
    held.current.forEach((midi, id) => onNoteUp(midi, id.startsWith('q:') ? 'qwerty' : 'onscreen'));
    held.current.clear();
    onReleaseAll?.();
  }, [onNoteUp, onReleaseAll]);
  useEffect(() => releaseAll, [releaseAll]);
  useKeyboardScope({
    enabled: active && !disabled,
    priority: scope.kind === 'seq-live' ? 20 : 10,
    onKeyDown: (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const offset = KEY_MAP[event.key.toLowerCase()];
      if (offset == null) return;
      event.preventDefault();
      const id = `q:${event.key.toLowerCase()}`;
      if (held.current.has(id)) return;
      const midi = clampMidi(baseMidi + offset);
      held.current.set(id, midi);
      onScopeFocus?.();
      onNoteDown(midi, 0.85, 'qwerty');
    },
    onKeyUp: (event) => {
      const id = `q:${event.key.toLowerCase()}`;
      const midi = held.current.get(id);
      if (midi == null) return;
      held.current.delete(id);
      onNoteUp(midi, 'qwerty');
    },
    onBlur: releaseAll,
  });
  const renderKey = (pitchClass: number, black: boolean) => {
    const midi = clampMidi(baseMidi + pitchClass);
    const keyId = `p:${midi}`;
    const isOn = noteSet.has(midi);
    return (
      <button
        key={pitchClass}
        type="button"
        className={`harmony-live-key ${black ? 'black' : 'white'}${isOn ? ' active' : ''}${held.current.has(keyId) ? ' held' : ''}`}
        disabled={disabled}
        aria-label={`${midi} ${black ? 'black' : 'white'} key`}
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return;
          event.preventDefault();
          onScopeFocus?.();
          held.current.set(keyId, midi);
          onNoteDown(midi, 0.85, 'onscreen');
        }}
        onPointerUp={() => {
          if (!held.current.has(keyId)) return;
          held.current.delete(keyId);
          onNoteUp(midi, 'onscreen');
        }}
        onPointerCancel={() => {
          if (!held.current.has(keyId)) return;
          held.current.delete(keyId);
          onNoteUp(midi, 'onscreen');
        }}
        onPointerLeave={(event) => {
          if (event.buttons === 0 || !held.current.has(keyId)) return;
          held.current.delete(keyId);
          onNoteUp(midi, 'onscreen');
        }}
      >
        <span>{pitchClass === rootNote ? 'Root' : ''}</span>
        <strong>{NOTE_NAMES[pitchClass % 12]}</strong>
        <small>{SHORTCUTS[pitchClass % 12]} · {pitchClass}</small>
      </button>
    );
  };
  return (
    <section className={`harmony-live-keyboard ${className ?? ''}`} data-live-scope={scope.kind} aria-label={`${scopeLabel(scope)} piano`}>
      <header className="harmony-live-keyboard-header"><strong>{scopeLabel(scope)}</strong><span>QWERTY A–K · MIDI · Touch</span><button type="button" onClick={releaseAll} disabled={disabled}>Release</button></header>
      <div className="harmony-live-keyboard-keys" onFocus={onScopeFocus}>
        <div className="harmony-live-white-keys">{WHITE_KEYS.map((pitch) => renderKey(pitch, false))}</div>
        <div className="harmony-live-black-keys">{BLACK_KEYS.map((pitch) => renderKey(pitch, true))}</div>
      </div>
    </section>
  );
};

export default LiveChordKeyboard;
