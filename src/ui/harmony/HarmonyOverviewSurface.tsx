import React, { useEffect, useMemo, useState } from 'react';
import type { HarmonyChordSlot } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';
import type { HarmonySequenceStep } from '../../audio/harmony/harmonyTypes';
import { analyzeOverviewBank, applyHarmonyOverviewAction, makeUniqueHarmonySlot, overviewRows, planOverviewEmptyUnusedSlot, planOverviewReplaceReferences, toggleHarmonyOverviewNote, updateHarmonyOverviewDuration, virtualizeOverviewRows, type HarmonyOverviewMode } from './harmonyOverviewModel';
import RelativeChordDotMap from './shared/RelativeChordDotMap';
import LiveChordKeyboard from './live/LiveChordKeyboard';


export interface HarmonyOverviewSurfaceProps {
  progression: HarmonyProgression;
  slots: readonly HarmonyChordSlot[];
  sequence?: readonly HarmonySequenceStep[] | null;
  pitchAxis?: readonly number[];
  mode?: HarmonyOverviewMode;
  selectedIndex?: number;
  readOnly?: boolean;
  onModeChange?: (mode: HarmonyOverviewMode) => void;
  onProgressionChange?: (progression: HarmonyProgression, selectedIndex: number) => void;
  onSlotsChange?: (slots: HarmonyChordSlot[]) => void;
  onOverviewStateChange?: (next: { progression: HarmonyProgression; slots: HarmonyChordSlot[]; sequence?: readonly HarmonySequenceStep[] | null }, selectedIndex: number) => void;
  onPlay?: (notes: readonly number[]) => void;
  onPlayStart?: (notes: readonly number[], slotId?: number | null, relativeOffset?: number) => void;
  keyboardRoot?: number;
  onPlayRelease?: () => void;
  onLatch?: () => void;
  onStop?: () => void;
  onPrint?: () => void;
  selectedSuggestionLabel?: string | null;
  onSuggestionReplace?: () => void;
  onSuggestionInsert?: () => void;
  onSuggestionSave?: () => void;
  suggestions?: React.ReactNode;
}

const MODES: readonly HarmonyOverviewMode[] = ['arrange', 'edit', 'manage'];

export function HarmonyOverviewSurface({ progression, slots, sequence = null, pitchAxis, keyboardRoot = 60, mode = 'arrange', selectedIndex: selectedIndexProp = 0, readOnly = false, onModeChange, onProgressionChange, onSlotsChange, onOverviewStateChange, onPlay, onPlayStart, onPlayRelease, onLatch, onStop, onPrint, selectedSuggestionLabel, onSuggestionReplace, onSuggestionInsert, onSuggestionSave, suggestions }: HarmonyOverviewSurfaceProps) {
  const [selectedIndex, setSelectedIndex] = useState(selectedIndexProp);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Array<{ progression: HarmonyProgression; slots: HarmonyChordSlot[]; sequence: HarmonySequenceStep[] | null; selectedIndex: number }>>([]);
  useEffect(() => setSelectedIndex(selectedIndexProp), [selectedIndexProp]);
  const rows = useMemo(() => overviewRows(progression, slots), [progression, slots]);
  const visibleWindow = useMemo(() => virtualizeOverviewRows(rows, scrollTop, 380), [rows, scrollTop]);
  const selectedRow = rows[Math.max(0, Math.min(rows.length - 1, selectedIndex))] ?? rows[0];
  const axis = pitchAxis ?? Array.from({ length: 49 }, (_, index) => 36 + index);

  const remember = () => setUndoStack((stack) => [...stack.slice(-19), { progression: { ...progression, events: progression.events.map((event) => ({ ...event, source: { ...event.source }, duration: { ...event.duration } })) }, slots: slots.slice() as HarmonyChordSlot[], sequence: sequence ? sequence.map((step) => ({ ...step })) : null, selectedIndex }]);
  const publish = (nextProgression: HarmonyProgression, nextSlots: HarmonyChordSlot[], nextIndex: number, nextSequence: readonly HarmonySequenceStep[] | null = sequence) => {
    setSelectedIndex(nextIndex);
    if (onOverviewStateChange) onOverviewStateChange({ progression: nextProgression, slots: nextSlots, sequence: nextSequence }, nextIndex);
    else {
      onProgressionChange?.(nextProgression, nextIndex);
      if (nextSlots !== slots) onSlotsChange?.(nextSlots);
    }
  };
  const undo = () => {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot || readOnly) return;
    setUndoStack((stack) => stack.slice(0, -1));
    publish(snapshot.progression, snapshot.slots, snapshot.selectedIndex, snapshot.sequence);
  };

  const applyAction = (action: 'add' | 'duplicate' | 'moveUp' | 'moveDown' | 'delete') => {
    if (readOnly) return;
    const result = applyHarmonyOverviewAction(progression, selectedIndex, action);
    if (!result.ok) { setError(result.error ?? 'Overview action failed'); return; }
    setError(null);
    remember();
    publish(result.progression, slots.slice() as HarmonyChordSlot[], result.selectedIndex);
  };
  const updateDuration = (unit: 'bar' | 'phrase', value: 1 | 2 | 4 | 8) => {
    if (readOnly || !selectedRow) return;
    remember();
    const nextProgression = updateHarmonyOverviewDuration(progression, selectedRow.index, unit, value);
    publish(nextProgression, slots.slice() as HarmonyChordSlot[], selectedRow.index);
  };
  const toggleExactNote = (note: number) => {
    if (readOnly || !selectedRow || selectedRow.slotId == null) return;
    const slot = slots.find((entry) => entry.id === selectedRow.slotId);
    if (!slot?.chord) return;
    remember();
    const nextSlots = toggleHarmonyOverviewNote(slots, slot.id, note);
    publish(progression, nextSlots, selectedRow.index);
  };

  const makeUnique = () => {
    if (readOnly || selectedRow?.slotId == null) return;
    const result = makeUniqueHarmonySlot(slots, selectedRow.slotId);
    if (!result.ok) { setError(result.error ?? 'Make Unique failed'); return; }
    setError(null);
    remember();
    const nextProgression = selectedRow ? { ...progression, events: progression.events.map((event, index) => index === selectedRow.index ? { ...event, source: { type: 'slot' as const, slotId: result.slotId! } } : event) } : progression;
    publish(nextProgression, result.slots, selectedRow?.index ?? selectedIndex);
  };

  const bankAnalysis = useMemo(() => analyzeOverviewBank({ slots: slots as never, progression, sequence }), [progression, sequence, slots]);
  const usage = bankAnalysis.usageBySlot;
  const [replaceSource, setReplaceSource] = useState<number | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<number | null>(null);
  const replaceReferences = () => {
    if (readOnly || replaceSource == null || replaceTarget == null) return;
    const plan = planOverviewReplaceReferences({ slots: slots as never, progression, sequence }, replaceSource, replaceTarget);
    if (!plan.ok || !plan.after) { setError(plan.error ?? 'Replace References failed'); return; }
    setError(null);
    remember();
    publish(plan.after.progression ?? progression, plan.after.slots as HarmonyChordSlot[], selectedIndex, plan.after.sequence ?? sequence);
  };
  const emptyUnused = (slotId: number) => {
    if (readOnly) return;
    const plan = planOverviewEmptyUnusedSlot({ slots: slots as never, progression, sequence }, slotId);
    if (!plan.ok || !plan.after) { setError(plan.error ?? 'Slot is referenced'); return; }
    setError(null);
    remember();
    publish(progression, plan.after.slots as HarmonyChordSlot[], selectedIndex, plan.after.sequence ?? sequence);
  };
  const print = () => { if (readOnly || !onPrint) return; remember(); onPrint(); };

  const playStart = (notes: readonly number[], slotId?: number | null) => { onPlayStart?.(notes, slotId); onPlay?.(notes); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (readOnly || event.target !== event.currentTarget || !selectedRow) return;
    if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); applyAction('moveUp'); return; }
    if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); applyAction('moveDown'); return; }
    const key = event.key.toLowerCase();
    const keyboardIndex = ['1', 'q', '2', 'w', '3', '4', 'r', '5', 't', '6', 'y', '7'].indexOf(key);
    if (keyboardIndex >= 0) { event.preventDefault(); setPlayingIndex(selectedRow.index); onPlayStart?.([keyboardRoot + keyboardIndex], selectedRow.slotId, keyboardIndex); }
    if (key === ' ') { event.preventDefault(); onLatch?.(); }
    if (key === 'escape') { event.preventDefault(); onStop?.(); }
  };

  return <section className="harmony-overview-surface" aria-label="Harmony combined overview" tabIndex={0} onKeyDown={handleKeyDown} onBlur={() => { setPlayingIndex(null); onPlayRelease?.(); }}>
    <header className="harmony-overview-header"><div><strong>Combined Overview</strong><small>Authored Harmony rows · {rows.length}/{64}</small></div><div className="harmony-overview-mode-tabs">{MODES.map((entry) => <button key={entry} type="button" className={mode === entry ? 'active' : ''} onClick={() => onModeChange?.(entry)}>{entry[0]!.toUpperCase() + entry.slice(1)}</button>)}</div></header>
    {mode === 'arrange' && <>
      <div className="harmony-overview-action-bar" aria-label="Arrange actions"><button type="button" onClick={() => applyAction('add')} disabled={readOnly || rows.length >= 64}>Add</button><button type="button" onClick={() => applyAction('duplicate')} disabled={readOnly || rows.length >= 64}>Duplicate</button><button type="button" onClick={makeUnique} disabled={readOnly || selectedRow?.slotId == null}>Make Unique</button><button type="button" onClick={() => applyAction('moveUp')} disabled={readOnly || selectedIndex <= 0}>Move up ↑</button><button type="button" onClick={() => applyAction('moveDown')} disabled={readOnly || selectedIndex >= rows.length - 1}>Move down ↓</button><button type="button" onClick={() => applyAction('delete')} disabled={readOnly || rows.length <= 1}>Delete</button><button type="button" onClick={undo} disabled={readOnly || undoStack.length === 0}>Undo</button><button type="button" onClick={print} disabled={readOnly || !onPrint}>Print</button><button type="button" onClick={onLatch} disabled={readOnly}>Latch</button><button type="button" onClick={onStop} disabled={readOnly}>Stop</button></div>
      <div className="harmony-overview-row-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>{visibleWindow.totalHeight > 0 && <div style={{ height: visibleWindow.totalHeight, position: 'relative' }}>{visibleWindow.rows.map((row) => <button key={row.id} type="button" className={`harmony-overview-row${selectedIndex === row.index ? ' selected' : ''}${playingIndex === row.index ? ' playing' : ''}`} style={{ position: rows.length > 24 ? 'absolute' : 'relative', top: rows.length > 24 ? row.index * 76 : undefined }} onClick={() => setSelectedIndex(row.index)} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setPlayingIndex(row.index); playStart(row.exactMidiNotes, row.slotId); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); setPlayingIndex(null); onPlayRelease?.(); }} onPointerCancel={() => { setPlayingIndex(null); onPlayRelease?.(); }}><span className="harmony-overview-row-index">E{row.index + 1}</span><strong>{row.label}</strong><small>{row.source.type === 'auto' ? 'Auto' : `S${row.slotId! + 1}`} · {row.duration.unit} {row.duration.value}</small><RelativeChordDotMap notes={row.exactMidiNotes} axis={axis} /><span className="harmony-overview-row-play">{playingIndex === row.index ? 'Playing' : 'Play'}</span></button>)}</div>}</div>
      {selectedRow && <div className="harmony-overview-duration" aria-label="Selected event duration"><span>Event E{selectedRow.index + 1} duration</span><select value={selectedRow.duration.unit} disabled={readOnly} onChange={(event) => updateDuration(event.target.value as 'bar' | 'phrase', selectedRow.duration.value)}><option value="bar">Bars</option><option value="phrase">Phrases</option></select><select value={selectedRow.duration.value} disabled={readOnly} onChange={(event) => updateDuration(selectedRow.duration.unit, Number(event.target.value) as 1 | 2 | 4 | 8)}>{[1, 2, 4, 8].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>}
      <LiveChordKeyboard scope={{ kind: 'harmony-takeover' }} notes={selectedRow?.exactMidiNotes ?? []} rootNote={keyboardRoot % 12} octave={Math.floor(keyboardRoot / 12) - 1} disabled={readOnly} active={!readOnly} onNoteDown={(midi) => { if (selectedRow) { setPlayingIndex(selectedRow.index); onPlayStart?.([midi], selectedRow.slotId, midi - keyboardRoot); } }} onNoteUp={() => { setPlayingIndex(null); onPlayRelease?.(); }} onReleaseAll={() => { setPlayingIndex(null); onPlayRelease?.(); }} />
    </>}
    {mode === 'edit' && selectedRow && <div className="harmony-overview-edit"><header><strong>Edit Notes · E{selectedRow.index + 1} · {selectedRow.slotId == null ? 'Auto' : `S${selectedRow.slotId + 1}`}</strong><small>{selectedRow.slotId == null ? 'Auto events have no editable shared slot.' : `${usage[selectedRow.slotId] ?? 0} shared use(s) · exact notes author the slot immediately`}</small></header><div className="harmony-overview-exact-matrix" aria-label="Exact note matrix">{axis.map((note) => <button key={note} type="button" className={selectedRow.exactMidiNotes.includes(note) ? 'filled' : ''} onClick={() => toggleExactNote(note)} disabled={readOnly || selectedRow.slotId == null} aria-label={`${note} ${selectedRow.exactMidiNotes.includes(note) ? 'on' : 'off'}`}>{note}</button>)}</div><RelativeChordDotMap notes={selectedRow.exactMidiNotes} axis={axis} /><div className="harmony-overview-note-list">{selectedRow.exactMidiNotes.length ? selectedRow.exactMidiNotes.map((note) => <span key={note}>{note}</span>) : <em>No exact notes</em>}</div><button type="button" onClick={makeUnique} disabled={readOnly || selectedRow.slotId == null}>Make Unique</button><button type="button" onClick={() => playStart(selectedRow.exactMidiNotes, selectedRow.slotId)} disabled={readOnly}>Play row</button><button type="button" onClick={undo} disabled={readOnly || undoStack.length === 0}>Undo</button><button type="button" onClick={() => onModeChange?.('arrange')}>Return to relative view</button></div>}
    {mode === 'manage' && <div className="harmony-overview-manage"><header><strong>Manage Pool</strong><small>Usage includes progression and Seq Play references</small></header><div className="harmony-overview-pool-rows">{slots.map((slot) => { const refs = [...bankAnalysis.progressionReferences, ...bankAnalysis.sequenceReferences].filter((ref) => ref.slotId === slot.id); return <div key={slot.id} className="harmony-overview-pool-row"><span>S{slot.id + 1}</span><strong>{slot.name}</strong><small>{usage[slot.id] ?? 0} uses · {slot.locked ? 'Locked' : 'Open'}{refs.length ? ` · ${refs.map((ref) => `${ref.kind === 'sequence' ? 'Seq' : 'E'}:${ref.id}`).join(', ')}` : ''}</small><button type="button" onClick={() => emptyUnused(slot.id)} disabled={readOnly || refs.length > 0 || slot.locked || !slot.chord}>Empty</button></div>; })}</div><div className="harmony-overview-replace"><select value={replaceSource ?? ''} onChange={(event) => setReplaceSource(event.target.value === '' ? null : Number(event.target.value))}><option value="">Source</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>S{slot.id + 1}</option>)}</select><select value={replaceTarget ?? ''} onChange={(event) => setReplaceTarget(event.target.value === '' ? null : Number(event.target.value))}><option value="">Target</option>{slots.map((slot) => <option key={slot.id} value={slot.id} disabled={!slot.chord || slot.id === replaceSource}>S{slot.id + 1}</option>)}</select><button type="button" onClick={replaceReferences} disabled={readOnly}>Replace References</button><button type="button" onClick={undo} disabled={readOnly || undoStack.length === 0}>Undo</button></div></div>}
    {error && <div className="harmony-overview-error" role="alert">{error}</div>}
    {suggestions && <div className="harmony-overview-suggestions">{suggestions}{mode === 'edit' && selectedSuggestionLabel && <div className="harmony-overview-suggestion-actions"><strong>Selected · {selectedSuggestionLabel}</strong><button type="button" onClick={onSuggestionSave} disabled={readOnly}>Save S#</button></div>}</div>}
    {mode === 'arrange' && selectedSuggestionLabel && <div className="harmony-overview-suggestion-actions" aria-label="Selected suggestion actions"><strong>Selected · {selectedSuggestionLabel}</strong><small>{slots.find((slot) => !slot.chord)?.id != null ? `Next empty S${slots.find((slot) => !slot.chord)!.id + 1}` : 'Pool full · matching slots may be reused'}</small><button type="button" onClick={onSuggestionReplace} disabled={readOnly}>Replace E{selectedIndex + 1}</button><button type="button" onClick={onSuggestionInsert} disabled={readOnly || rows.length >= 64}>Insert after</button><button type="button" onClick={onSuggestionSave} disabled={readOnly}>Save S#</button>{!slots.some((slot) => !slot.chord) && <button type="button" onClick={() => onModeChange?.('manage')}>Manage pool</button>}</div>}
  </section>;
}

export default HarmonyOverviewSurface;
