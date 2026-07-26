import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardScope } from '../../keyboard/useKeyboardScope';
import '../shared/harmonyWorkspace.css';
import { LIVE_CHORD_BLACK_KEYS, LIVE_CHORD_KEY_MAP, LIVE_CHORD_WHITE_KEYS } from './liveKeyboardGeometry';
export { LIVE_CHORD_BLACK_KEYS, LIVE_CHORD_KEY_MAP, LIVE_CHORD_WHITE_KEYS } from './liveKeyboardGeometry';

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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SHORTCUT_BY_PITCH: Readonly<Record<number, string>> = Object.fromEntries(Object.entries(LIVE_CHORD_KEY_MAP).map(([key, pitch]) => [pitch, key.toUpperCase()]));

function clampMidi(midi: number): number { return Math.max(0, Math.min(127, Math.round(midi))); }
function scopeLabel(scope: LiveChordScope): string {
  if (scope.kind === 'draft') return 'DRAFT';
  if (scope.kind === 'harmony-takeover') return 'HARMONY TAKEOVER';
  return `SEQ ${scope.seqId + 1} LIVE`;
}
function scopeId(scope: LiveChordScope): string { return scopeLabel(scope).toLowerCase().replace(/\s+/g, '-'); }

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
  const callbacksRef = useRef({ onNoteDown, onNoteUp, onScopeFocus, onReleaseAll });
  callbacksRef.current = { onNoteDown, onNoteUp, onScopeFocus, onReleaseAll };
  const [announcement, setAnnouncement] = useState('Ready');
  const baseMidi = Math.max(0, Math.min(108, Math.round(octave) * 12));
  const noteSet = useMemo(() => new Set(notes.map(clampMidi)), [notes]);
  const releaseAll = useCallback(() => {
    const callbacks = callbacksRef.current;
    held.current.forEach((midi, id) => callbacks.onNoteUp(midi, id.startsWith('q:') ? 'qwerty' : 'onscreen'));
    held.current.clear();
    callbacks.onReleaseAll?.();
  }, []);
  useEffect(() => () => releaseAll(), [releaseAll]);
  useEffect(() => { if (!active || disabled) releaseAll(); }, [active, disabled, releaseAll]);
  useEffect(() => () => releaseAll(), [scope.kind, scope.kind === 'draft' ? scope.owner : scope.kind === 'seq-live' ? scope.seqId : null, releaseAll]);
  useKeyboardScope({
    enabled: active && !disabled,
    priority: scope.kind === 'seq-live' ? 20 : 10,
    onKeyDown: (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      const offset = LIVE_CHORD_KEY_MAP[event.key.toLowerCase()];
      if (offset == null) return;
      event.preventDefault();
      const id = `q:${event.key.toLowerCase()}`;
      if (held.current.has(id)) return;
      const midi = clampMidi(baseMidi + offset);
      held.current.set(id, midi);
      callbacksRef.current.onScopeFocus?.();
      setAnnouncement(`${scopeLabel(scope)} ${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1} held`);
      callbacksRef.current.onNoteDown(midi, 0.85, 'qwerty');
    },
    onKeyUp: (event) => {
      const id = `q:${event.key.toLowerCase()}`;
      const midi = held.current.get(id);
      if (midi == null) return;
      held.current.delete(id);
      setAnnouncement(`${scopeLabel(scope)} released`);
      callbacksRef.current.onNoteUp(midi, 'qwerty');
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
        aria-label={`${NOTE_NAMES[pitchClass % 12]}${Math.floor(midi / 12) - 1}, ${black ? 'black' : 'white'} key, degree ${pitchClass}, ${SHORTCUT_BY_PITCH[pitchClass] ?? 'touch'}`}
        aria-pressed={isOn || held.current.has(keyId)}
        title={`${NOTE_NAMES[pitchClass % 12]}${Math.floor(midi / 12) - 1} · degree ${pitchClass} · ${SHORTCUT_BY_PITCH[pitchClass] ?? 'touch'}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          callbacksRef.current.onScopeFocus?.();
          held.current.set(keyId, midi);
          setAnnouncement(`${scopeLabel(scope)} ${NOTE_NAMES[pitchClass % 12]}${Math.floor(midi / 12) - 1} held`);
          callbacksRef.current.onNoteDown(midi, 0.85, 'onscreen');
        }}
        onPointerUp={(event) => {
          if (!held.current.has(keyId)) return;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
          held.current.delete(keyId);
          setAnnouncement(`${scopeLabel(scope)} released`);
          callbacksRef.current.onNoteUp(midi, 'onscreen');
        }}
        onPointerCancel={() => {
          if (!held.current.has(keyId)) return;
          held.current.delete(keyId);
          callbacksRef.current.onNoteUp(midi, 'onscreen');
        }}
        onPointerLeave={(event) => {
          if (event.buttons === 0 || !held.current.has(keyId)) return;
          held.current.delete(keyId);
          callbacksRef.current.onNoteUp(midi, 'onscreen');
        }}
      >
        <span>{pitchClass === rootNote ? 'Root' : ''}</span>
        <strong>{NOTE_NAMES[pitchClass % 12]}</strong>
        <small>{SHORTCUT_BY_PITCH[pitchClass] ?? ''} · degree {pitchClass}</small>
      </button>
    );
  };
  return (
    <section className={`harmony-live-keyboard ${className ?? ''}`} data-live-scope={scope.kind} data-keyboard-owner={scopeLabel(scope)} role="group" aria-label={`${scopeLabel(scope)} piano`} aria-describedby={`${scopeId(scope)}-instructions`}>
      <span className="harmony-sr-only" aria-live="polite">{announcement}</span>
      <span id={`${scopeId(scope)}-instructions`} className="harmony-sr-only">Use the visible piano keys for touch. QWERTY A through J plays scoped notes; release stops held notes.</span>
      <header className="harmony-live-keyboard-header"><strong>{scopeLabel(scope)}</strong><span>QWERTY A–J · Touch</span><button type="button" onClick={releaseAll} disabled={disabled}>Release</button></header>
      <div className="harmony-live-keyboard-keys" onFocus={callbacksRef.current.onScopeFocus}>
        <div className="harmony-live-white-keys">{LIVE_CHORD_WHITE_KEYS.map((pitch) => renderKey(pitch, false))}</div>
        <div className="harmony-live-black-keys">{LIVE_CHORD_BLACK_KEYS.map((pitch) => renderKey(pitch, true))}</div>
      </div>
    </section>
  );
};

export default LiveChordKeyboard;
