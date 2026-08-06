import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardScope } from '../../keyboard/useKeyboardScope';
import { subscribeHarmonyMidiCapture } from '../harmonyDraftChord';
import '../shared/harmonyWorkspace.css';
import {
  deriveLiveChordMidiRange,
  getLiveChordMidiPlacement,
  isLiveChordWhiteMidi,
  liveChordQwertyBase,
  LIVE_CHORD_KEY_MAP,
} from './liveKeyboardGeometry';
import './liveChordKeyboard.css';
export {
  getLiveChordKeyPlacement,
  getLiveChordMidiPlacement,
  deriveLiveChordMidiRange,
  isLiveChordWhiteMidi,
  liveChordBaseMidi,
  liveChordQwertyBase,
  LIVE_CHORD_BLACK_KEYS,
  LIVE_CHORD_CHROMATIC_KEYS,
  LIVE_CHORD_KEY_MAP,
  LIVE_CHORD_WHITE_KEYS,
} from './liveKeyboardGeometry';

export type LiveChordScope =
  | { kind: 'draft'; owner: 'harmony-detail' }
  | { kind: 'draft'; owner: 'seq'; seqId: number }
  | { kind: 'harmony-takeover' }
  | { kind: 'seq-live'; seqId: number };

export type LiveChordInputSource = 'onscreen' | 'qwerty' | 'midi';

export interface LiveChordKeyboardProps {
  scope: LiveChordScope;
  /** Retained/authored exact MIDI notes. */
  notes?: readonly number[];
  /** Resolved notes implied by the current semantic chord identity. */
  semanticNotes?: readonly number[];
  rootNote?: number;
  previewRootNote?: number;
  scaleRootMidi?: number;
  scaleIntervals?: readonly number[];
  selectedDegree?: number;
  rerootSemitones?: number;
  octave?: number;
  disabled?: boolean;
  active?: boolean;
  onNoteDown: (midi: number, velocity: number, source: LiveChordInputSource) => void;
  onNoteUp: (midi: number, source: LiveChordInputSource) => void;
  onScopeFocus?: () => void;
  onReleaseAll?: () => void;
  onSetRoot?: (pitchClass: number) => void;
  onSetDegree?: (degree: number) => void;
  onToggleExactNote?: (midi: number, present: boolean) => void;
  onMoveExactNote?: (midi: number, octaves: number) => void;
  onRerootChange?: (semitones: number) => void;
  /** Commands adjacent to the piano (quality, extension, slot, etc.) share
   * the same claimed keyboard scope so a previously focused control cannot
   * steal musical input. */
  onCommandKeyDown?: (event: KeyboardEvent) => void;
  className?: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const RELATIVE_DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'] as const;
const SHORTCUT_BY_OFFSET: Readonly<Record<number, string>> = Object.fromEntries(Object.entries(LIVE_CHORD_KEY_MAP).map(([key, offset]) => [offset, key.toUpperCase()]));

function clampMidi(midi: number): number { return Math.max(0, Math.min(127, Math.round(midi))); }
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ['text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(target.type);
}
function releaseFocusedControl(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('button, select, summary, [role="button"], [tabindex]')) target.blur();
}
function scopeLabel(scope: LiveChordScope): string {
  if (scope.kind === 'draft') return scope.owner === 'seq' ? `SEQ ${scope.seqId + 1} DRAFT` : 'DRAFT';
  if (scope.kind === 'harmony-takeover') return 'HARMONY TAKEOVER';
  return `SEQ ${scope.seqId + 1} LIVE`;
}
function scopeId(scope: LiveChordScope): string { return scopeLabel(scope).toLowerCase().replace(/\s+/g, '-'); }

export const LiveChordKeyboard: React.FC<LiveChordKeyboardProps> = ({
  scope,
  notes = [],
  semanticNotes = [],
  rootNote = 0,
  previewRootNote = rootNote,
  scaleRootMidi = rootNote,
  scaleIntervals = [0, 2, 4, 5, 7, 9, 11],
  selectedDegree,
  rerootSemitones = 0,
  octave = 4,
  disabled = false,
  active = true,
  onNoteDown,
  onNoteUp,
  onScopeFocus,
  onReleaseAll,
  onSetRoot,
  onSetDegree,
  onToggleExactNote,
  onMoveExactNote,
  onRerootChange,
  onCommandKeyDown,
  className,
}) => {
  const held = useRef(new Map<string, number>());
  const midiSustainDownRef = useRef(false);
  const sustainedMidiIdsRef = useRef(new Set<string>());
  const [heldMidis, setHeldMidis] = useState<ReadonlySet<number>>(() => new Set());
  const [selectedMidi, setSelectedMidi] = useState<number | null>(null);
  const callbacksRef = useRef({ onNoteDown, onNoteUp, onScopeFocus, onReleaseAll });
  callbacksRef.current = { onNoteDown, onNoteUp, onScopeFocus, onReleaseAll };
  const [announcement, setAnnouncement] = useState('Ready');
  const noteSet = useMemo(() => new Set(notes.map(clampMidi)), [notes]);
  const semanticNoteSet = useMemo(() => new Set(semanticNotes.map(clampMidi)), [semanticNotes]);
  const notePitchClasses = useMemo(() => new Set([...noteSet].map((midi) => midi % 12)), [noteSet]);
  const semanticPitchClasses = useMemo(() => new Set([...semanticNoteSet].map((midi) => midi % 12)), [semanticNoteSet]);
  const heldPitchClasses = useMemo(() => new Set([...heldMidis].map((midi) => midi % 12)), [heldMidis]);
  const range = useMemo(
    () => deriveLiveChordMidiRange([], octave),
    [octave],
  );
  const qwertyBase = useMemo(() => liveChordQwertyBase(range, octave), [octave, range]);
  const rootPitchClass = ((Math.round(rootNote) % 12) + 12) % 12;
  const previewRootPitchClass = ((Math.round(previewRootNote) % 12) + 12) % 12;
  const scaleRootPitchClass = ((Math.round(scaleRootMidi) % 12) + 12) % 12;
  const rootMarkerMidi = useMemo(() => {
    const candidates = range.midis.filter((midi) => midi % 12 === previewRootPitchClass);
    return candidates[0] ?? null;
  }, [previewRootPitchClass, range]);
  const syncHeldState = useCallback(() => setHeldMidis(new Set(held.current.values())), []);
  const holdNote = useCallback((id: string, midi: number) => {
    if (held.current.has(id)) return false;
    held.current.set(id, midi);
    syncHeldState();
    return true;
  }, [syncHeldState]);
  const releaseNote = useCallback((id: string, source: LiveChordInputSource, announce = true) => {
    const midi = held.current.get(id);
    if (midi == null) return false;
    held.current.delete(id);
    syncHeldState();
    if (announce) setAnnouncement(`${scopeLabel(scope)} released`);
    callbacksRef.current.onNoteUp(midi, source);
    return true;
  }, [scope, syncHeldState]);
  const releaseAll = useCallback(() => {
    const callbacks = callbacksRef.current;
    held.current.forEach((midi, id) => callbacks.onNoteUp(
      midi,
      id.startsWith('q:') ? 'qwerty' : id.startsWith('m:') ? 'midi' : 'onscreen',
    ));
    held.current.clear();
    midiSustainDownRef.current = false;
    sustainedMidiIdsRef.current.clear();
    syncHeldState();
    callbacks.onReleaseAll?.();
  }, [syncHeldState]);
  useEffect(() => () => releaseAll(), [releaseAll]);
  useEffect(() => { if (!active || disabled) releaseAll(); }, [active, disabled, releaseAll]);
  useEffect(() => () => releaseAll(), [
    scope.kind,
    scope.kind === 'draft' ? scope.owner : scope.kind === 'seq-live' ? scope.seqId : null,
    scope.kind === 'draft' && scope.owner === 'seq' ? scope.seqId : null,
    releaseAll,
  ]);
  const keyboardScope = useKeyboardScope({
    enabled: active && !disabled,
    priority: scope.kind === 'seq-live' ? 20 : 10,
    requiresClaim: true,
    onKeyDown: (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEditingTarget(event.target)) return;
      const offset = LIVE_CHORD_KEY_MAP[event.key.toLowerCase()];
      if (offset == null) {
        onCommandKeyDown?.(event);
        return;
      }
      event.preventDefault();
      releaseFocusedControl(event.target);
      const id = `q:${event.key.toLowerCase()}`;
      if (held.current.has(id)) return;
      const midi = clampMidi(qwertyBase + offset);
      if (!holdNote(id, midi)) return;
      callbacksRef.current.onScopeFocus?.();
      setAnnouncement(`${scopeLabel(scope)} ${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1} held`);
      callbacksRef.current.onNoteDown(midi, 0.85, 'qwerty');
    },
    onKeyUp: (event) => {
      const id = `q:${event.key.toLowerCase()}`;
      if (!held.current.has(id)) return;
      releaseNote(id, 'qwerty');
    },
    onBlur: releaseAll,
  });
  const ownsPersistentDetailScope = scope.kind === 'draft' && scope.owner === 'harmony-detail';
  useEffect(() => {
    if (!ownsPersistentDetailScope || !active || disabled) return;
    keyboardScope.claim();
    callbacksRef.current.onScopeFocus?.();
    return () => keyboardScope.release();
  }, [active, disabled, keyboardScope, ownsPersistentDetailScope]);
  useEffect(() => subscribeHarmonyMidiCapture((event) => {
    if (!active || disabled || !keyboardScope.isActive()) return;
    if (event.kind === 'noteOn') {
      const midi = clampMidi(event.midi);
      const id = `m:${midi}`;
      sustainedMidiIdsRef.current.delete(id);
      if (!holdNote(id, midi)) return;
      setAnnouncement(`${scopeLabel(scope)} ${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1} held`);
      callbacksRef.current.onNoteDown(midi, event.velocity, 'midi');
      return;
    }
    if (event.kind === 'noteOff') {
      const id = `m:${clampMidi(event.midi)}`;
      if (midiSustainDownRef.current && held.current.has(id)) {
        sustainedMidiIdsRef.current.add(id);
        return;
      }
      releaseNote(id, 'midi');
      return;
    }
    midiSustainDownRef.current = event.down;
    if (event.down) return;
    for (const id of sustainedMidiIdsRef.current) releaseNote(id, 'midi', false);
    sustainedMidiIdsRef.current.clear();
  }), [active, disabled, holdNote, keyboardScope, releaseNote, scope]);
  const renderKey = (midi: number) => {
    const pitchClass = ((midi % 12) + 12) % 12;
    const black = !isLiveChordWhiteMidi(midi);
    const relativeDegree = ((pitchClass - rootPitchClass) % 12 + 12) % 12;
    const relativeLabel = RELATIVE_DEGREE_LABELS[relativeDegree];
    const takeover = scope.kind === 'harmony-takeover';
    const keyId = `p:${midi}`;
    const isRetained = notePitchClasses.has(pitchClass);
    const isSemantic = semanticPitchClasses.has(pitchClass);
    const isHeld = heldPitchClasses.has(pitchClass);
    const isRoot = midi === rootMarkerMidi;
    const isSelected = selectedMidi === midi;
    const placement = getLiveChordMidiPlacement(midi, range);
    const shortcutOffset = midi - qwertyBase;
    const shortcut = SHORTCUT_BY_OFFSET[shortcutOffset] ?? '';
    const keyClass = [
      'harmony-live-key',
      black ? 'black' : 'white',
      isRetained ? 'retained' : '',
      isSemantic ? 'semantic' : '',
      isHeld ? 'held' : '',
      isRoot ? 'root' : '',
      isSelected ? 'selected' : '',
    ].filter(Boolean).join(' ');
    const start = () => {
      if (disabled || !holdNote(keyId, midi)) return;
      setSelectedMidi(midi);
      keyboardScope.claim();
      callbacksRef.current.onScopeFocus?.();
      setAnnouncement(`${scopeLabel(scope)} ${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1} held`);
      callbacksRef.current.onNoteDown(midi, 0.85, 'onscreen');
    };
    const stop = () => releaseNote(keyId, 'onscreen');
    return (
      <div
        key={midi}
        className={`harmony-live-key-slot ${black ? 'harmony-live-black-keys' : 'harmony-live-white-keys'}`}
        style={{ '--live-key-left': `${placement.left}%`, '--live-key-width': `${placement.width}%` } as React.CSSProperties}
      >
        <button
          type="button"
          className={keyClass}
          disabled={disabled}
          aria-label={`${takeover ? `relative ${relativeLabel}, ` : ''}${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1}, ${isRetained ? 'retained, ' : ''}${isSemantic ? 'semantic chord, ' : ''}${black ? 'black' : 'white'} key${shortcut ? `, shortcut ${shortcut}` : ''}`}
          aria-keyshortcuts={`${shortcut} Enter Space`.trim()}
          aria-pressed={isRetained || isHeld}
          title={`${takeover ? `${relativeLabel} · ` : ''}${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1}${shortcut ? ` · ${shortcut}` : ''}`}
          onPointerDown={(event) => {
            if (event.button !== 0 || disabled) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            start();
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
            stop();
          }}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
              event.preventDefault();
              start();
            }
          }}
          onKeyUp={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              stop();
            }
          }}
          onFocus={() => setSelectedMidi(midi)}
        >
          <span>{isRoot ? 'Root' : isSemantic ? 'Shape' : ''}</span>
          <strong>{takeover ? relativeLabel : NOTE_NAMES[pitchClass]}</strong>
          <small>{takeover ? NOTE_NAMES[pitchClass] : `${Math.floor(midi / 12) - 1}${shortcut ? ` · ${shortcut}` : ''}`}</small>
        </button>
      </div>
    );
  };
  const selectedPitchClass = selectedMidi == null ? null : ((selectedMidi % 12) + 12) % 12;
  const selectedScaleOffset = selectedPitchClass == null
    ? null
    : ((selectedPitchClass - scaleRootPitchClass) % 12 + 12) % 12;
  const selectedScaleDegree = selectedScaleOffset == null ? -1 : scaleIntervals.indexOf(selectedScaleOffset);
  const selectedRetainedMidi = selectedMidi == null
    ? null
    : [...noteSet]
      .filter((midi) => midi % 12 === selectedPitchClass)
      .sort((left, right) => Math.abs(left - selectedMidi) - Math.abs(right - selectedMidi))[0] ?? null;
  const selectedIsRetained = selectedRetainedMidi != null;
  const selectedRerootSemitones = selectedPitchClass == null
    ? 0
    : ((selectedPitchClass - rootPitchClass) % 12 + 12) % 12;
  const canMoveDown = selectedRetainedMidi != null && selectedRetainedMidi >= 12;
  const canMoveUp = selectedRetainedMidi != null && selectedRetainedMidi <= 115;
  return (
    <section
      className={`harmony-live-keyboard ${className ?? ''}`}
      data-live-scope={scope.kind}
      data-keyboard-owner={scopeLabel(scope)}
      role="group"
      aria-label={`${scopeLabel(scope)} piano`}
      aria-describedby={`${scopeId(scope)}-instructions`}
      onFocusCapture={() => {
        keyboardScope.claim();
        callbacksRef.current.onScopeFocus?.();
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (ownsPersistentDetailScope) return;
        keyboardScope.release();
        releaseAll();
      }}
    >
      <span className="harmony-sr-only" aria-live="polite">{announcement}</span>
      <span id={`${scopeId(scope)}-instructions`} className="harmony-sr-only">Use the visible piano keys for touch. QWERTY A through J plays scoped notes; release stops held notes.</span>
      <header className="harmony-live-keyboard-header">
        <strong>{scopeLabel(scope)}</strong>
        <span>{noteSet.size > 0 ? `${noteSet.size} retained` : 'Play a chord'}</span>
        {heldMidis.size > 0 ? <button type="button" onClick={releaseAll} disabled={disabled}>Release</button> : null}
      </header>
      <div className="harmony-live-keyboard-keys">
        {range.midis.map(renderKey)}
      </div>
      {selectedMidi != null && (onSetRoot || onSetDegree || onToggleExactNote || onMoveExactNote || onRerootChange) ? (
        <div className="harmony-live-keyboard-context" role="toolbar" aria-label={`${NOTE_NAMES[selectedPitchClass!]}${Math.floor(selectedMidi / 12) - 1} actions`}>
          <strong>{NOTE_NAMES[selectedPitchClass!]}{Math.floor(selectedMidi / 12) - 1}</strong>
          {onRerootChange && selectedRerootSemitones !== rerootSemitones ? (
            <button type="button" onClick={() => onRerootChange(selectedRerootSemitones)}>
              Preview from {RELATIVE_DEGREE_LABELS[selectedRerootSemitones]}
            </button>
          ) : null}
          {(onSetRoot || (onSetDegree && selectedScaleDegree >= 0)) ? (
            <details className="harmony-live-keyboard-identity">
              <summary>Identify</summary>
              <span>
                {onSetRoot && selectedPitchClass !== rootPitchClass ? (
                  <button type="button" onClick={() => onSetRoot(selectedPitchClass!)}>Root {NOTE_NAMES[selectedPitchClass!]}</button>
                ) : null}
                {onSetDegree && selectedScaleDegree >= 0 && selectedDegree !== selectedScaleDegree + 1 ? (
                  <button type="button" onClick={() => onSetDegree(selectedScaleDegree + 1)}>Degree {selectedScaleDegree + 1}</button>
                ) : null}
              </span>
            </details>
          ) : null}
          {onToggleExactNote ? (
            <button type="button" onClick={() => onToggleExactNote(selectedRetainedMidi ?? selectedMidi, !selectedIsRetained)}>
              {selectedIsRetained ? 'Remove note' : 'Add note'}
            </button>
          ) : null}
          {onMoveExactNote && selectedIsRetained ? (
            <span className="harmony-live-keyboard-octave-actions">
              <button type="button" aria-label="Move note down one octave" disabled={!canMoveDown} onClick={() => onMoveExactNote(selectedRetainedMidi!, -1)}>−8ve</button>
              <button type="button" aria-label="Move note up one octave" disabled={!canMoveUp} onClick={() => onMoveExactNote(selectedRetainedMidi!, 1)}>+8ve</button>
            </span>
          ) : null}
          {onRerootChange && rerootSemitones !== 0 ? (
            <button type="button" onClick={() => onRerootChange(0)}>Reset preview</button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default LiveChordKeyboard;
