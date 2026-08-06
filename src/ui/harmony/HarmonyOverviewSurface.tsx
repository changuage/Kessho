import React, { useEffect, useMemo, useState } from 'react';
import type { HarmonyChordSlot } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';
import type { HarmonySequenceStep } from '../../audio/harmony/harmonyTypes';
import { analyzeOverviewBank, applyHarmonyOverviewAction, makeUniqueHarmonySlot, overviewFocusTarget, overviewRows, planOverviewEmptyUnusedSlot, planOverviewReplaceReferences, toggleHarmonyOverviewNote, updateHarmonyOverviewDuration, updateHarmonyOverviewSource, virtualizeOverviewRows, type HarmonyOverviewMode, type HarmonyOverviewRow } from './harmonyOverviewModel';
import type { HarmonyReferenceState } from '../../audio/harmony/harmonyBankAnalysis';
import LiveChordKeyboard from './live/LiveChordKeyboard';
import { SharedChordMatrixShell, type SharedChordMatrixRow } from './shared/SharedChordMatrix';
import HarmonyCompactChordRow from './shared/HarmonyCompactChordRow';
import { deriveHarmonyPitchAxis } from './shared/harmonyPitchAxis';


export interface HarmonyOverviewSurfaceProps {
  progression: HarmonyProgression;
  slots: readonly HarmonyChordSlot[];
  sequence?: readonly HarmonySequenceStep[] | null;
  progressions?: HarmonyReferenceState['progressions'];
  seqPlayChoices?: HarmonyReferenceState['seqPlayChoices'];
  pitchAxis?: readonly number[];
  mode?: HarmonyOverviewMode;
  selectedIndex?: number;
  readOnly?: boolean;
  onModeChange?: (mode: HarmonyOverviewMode) => void;
  onProgressionChange?: (progression: HarmonyProgression, selectedIndex: number) => void;
  onSlotsChange?: (slots: HarmonyChordSlot[]) => void;
  onOverviewStateChange?: (next: {
    progression: HarmonyProgression;
    slots: HarmonyChordSlot[];
    sequence?: readonly HarmonySequenceStep[] | null;
    progressions?: HarmonyReferenceState['progressions'];
    seqPlayChoices?: HarmonyReferenceState['seqPlayChoices'];
  }, selectedIndex: number) => void;
  onPlay?: (notes: readonly number[]) => void;
  onPlayStart?: (notes: readonly number[], slotId?: number | null, relativeOffset?: number) => void;
  keyboardRoot?: number;
  onPlayRelease?: () => void;
  onLatch?: () => void;
  onStop?: () => void;
  onPrint?: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
  selectedSuggestionLabel?: string | null;
  onSuggestionReplace?: () => void;
  onSuggestionInsert?: () => void;
  onSuggestionSave?: () => void;
  suggestions?: React.ReactNode;
  suggestionsOpen?: boolean;
  onSuggestionsOpenChange?: (open: boolean) => void;
}

const MODES: readonly HarmonyOverviewMode[] = ['arrange', 'edit', 'manage'];

export function HarmonyOverviewSurface({ progression, slots, sequence = null, progressions, seqPlayChoices, pitchAxis, keyboardRoot = 60, mode = 'arrange', selectedIndex: selectedIndexProp = 0, readOnly = false, onModeChange, onProgressionChange, onSlotsChange, onOverviewStateChange, onPlay, onPlayStart, onPlayRelease, onLatch, onStop, onPrint, canUndo = false, onUndo, selectedSuggestionLabel, onSuggestionReplace, onSuggestionInsert, onSuggestionSave, suggestions, suggestionsOpen, onSuggestionsOpenChange }: HarmonyOverviewSurfaceProps) {
  const [selectedIndex, setSelectedIndex] = useState(selectedIndexProp);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSelectedIndex(selectedIndexProp), [selectedIndexProp]);
  const rows = useMemo(() => overviewRows(progression, slots), [progression, slots]);
  const visibleWindow = useMemo(() => virtualizeOverviewRows(rows, scrollTop, 380, 48), [rows, scrollTop]);
  const selectedRow = rows[Math.max(0, Math.min(rows.length - 1, selectedIndex))] ?? rows[0];
  const stableFocusId = overviewFocusTarget(rows, focusedRowId, selectedIndex);
  const visibleFocusId = visibleWindow.rows.some((row) => row.id === stableFocusId) ? stableFocusId : visibleWindow.rows[0]?.id ?? null;
  const axis = useMemo(
    () => pitchAxis?.length ? [...pitchAxis] : deriveHarmonyPitchAxis(rows.map((row) => row.exactMidiNotes)),
    [pitchAxis, rows],
  );

  const publish = (
    nextProgression: HarmonyProgression,
    nextSlots: HarmonyChordSlot[],
    nextIndex: number,
    nextSequence: readonly HarmonySequenceStep[] | null = sequence,
    nextProgressions: HarmonyReferenceState['progressions'] = undefined,
    nextSeqPlayChoices = seqPlayChoices,
  ) => {
    setSelectedIndex(nextIndex);
    if (onOverviewStateChange) onOverviewStateChange({
      progression: nextProgression,
      slots: nextSlots,
      sequence: nextSequence,
      progressions: nextProgressions,
      seqPlayChoices: nextSeqPlayChoices,
    }, nextIndex);
    else {
      onProgressionChange?.(nextProgression, nextIndex);
      if (nextSlots !== slots) onSlotsChange?.(nextSlots);
    }
  };

  const applyAction = (action: 'add' | 'duplicate' | 'moveUp' | 'moveDown' | 'delete') => {
    if (readOnly) return;
    const result = applyHarmonyOverviewAction(progression, selectedIndex, action);
    if (!result.ok) { setError(result.error ?? 'Overview action failed'); return; }
    setError(null);
    publish(result.progression, slots.slice() as HarmonyChordSlot[], result.selectedIndex);
  };
  const updateDuration = (row: HarmonyOverviewRow, unit: 'bar' | 'phrase', value: 1 | 2 | 4 | 8) => {
    if (readOnly) return;
    publish(updateHarmonyOverviewDuration(progression, row.index, unit, value), slots.slice() as HarmonyChordSlot[], row.index);
  };
  const updateSource = (row: HarmonyOverviewRow, value: string) => {
    if (readOnly) return;
    const slotId = value === 'auto' ? null : Number(value.replace('slot:', ''));
    publish(updateHarmonyOverviewSource(progression, row.index, slotId), slots.slice() as HarmonyChordSlot[], row.index);
  };
  const toggleExactNote = (row: HarmonyOverviewRow, note: number) => {
    if (readOnly || row.slotId == null) return;
    const slot = slots.find((entry) => entry.id === row.slotId);
    if (!slot?.chord) return;
    const nextSlots = toggleHarmonyOverviewNote(slots, slot.id, note);
    publish(progression, nextSlots, row.index);
  };

  const makeUnique = () => {
    if (readOnly || selectedRow?.slotId == null) return;
    const result = makeUniqueHarmonySlot(slots, selectedRow.slotId);
    if (!result.ok) { setError(result.error ?? 'Make Unique failed'); return; }
    setError(null);
    const nextProgression = selectedRow ? { ...progression, events: progression.events.map((event, index) => index === selectedRow.index ? { ...event, source: { type: 'slot' as const, slotId: result.slotId! } } : event) } : progression;
    publish(nextProgression, result.slots, selectedRow?.index ?? selectedIndex);
  };

  const bankAnalysis = useMemo(
    () => analyzeOverviewBank({ slots: slots as never, progression, progressions, sequence, seqPlayChoices }),
    [progression, progressions, seqPlayChoices, sequence, slots],
  );
  const usage = bankAnalysis.usageBySlot;
  const [replaceSource, setReplaceSource] = useState<number | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<number | null>(null);
  const replaceReferences = () => {
    if (readOnly || replaceSource == null || replaceTarget == null) return;
    const plan = planOverviewReplaceReferences({ slots: slots as never, progression, progressions, sequence, seqPlayChoices }, replaceSource, replaceTarget);
    if (!plan.ok || !plan.after) { setError(plan.error ?? 'Replace References failed'); return; }
    setError(null);
    publish(
      plan.after.progression ?? progression,
      plan.after.slots as HarmonyChordSlot[],
      selectedIndex,
      plan.after.sequence ?? sequence,
      plan.after.progressions,
      plan.after.seqPlayChoices,
    );
  };
  const emptyUnused = (slotId: number) => {
    if (readOnly) return;
    const plan = planOverviewEmptyUnusedSlot({ slots: slots as never, progression, progressions, sequence, seqPlayChoices }, slotId);
    if (!plan.ok || !plan.after) { setError(plan.error ?? 'Slot is referenced'); return; }
    setError(null);
    publish(
      progression,
      plan.after.slots as HarmonyChordSlot[],
      selectedIndex,
      plan.after.sequence ?? sequence,
      plan.after.progressions,
      plan.after.seqPlayChoices,
    );
  };
  const print = () => { if (readOnly || !onPrint) return; onPrint(); };

  const playStart = (notes: readonly number[], slotId?: number | null) => { onPlayStart?.(notes, slotId); onPlay?.(notes); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (readOnly || event.target !== event.currentTarget || !selectedRow) return;
    if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); applyAction('moveUp'); return; }
    if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); applyAction('moveDown'); return; }
    const key = event.key.toLowerCase();
    if (key === ' ') { event.preventDefault(); onLatch?.(); }
    if (key === 'escape') { event.preventDefault(); onStop?.(); }
  };

  return <section className="harmony-overview-surface" aria-label="Harmony combined overview" tabIndex={0} onKeyDown={handleKeyDown} onBlur={() => { setPlayingIndex(null); onPlayRelease?.(); }}>
    <header className="harmony-overview-header"><div><strong>Combined Overview</strong><small>Authored Harmony rows · {rows.length}/{64}</small></div><div className="harmony-overview-mode-tabs">{MODES.map((entry) => <button key={entry} type="button" className={mode === entry ? 'active' : ''} onClick={() => onModeChange?.(entry)}>{entry[0]!.toUpperCase() + entry.slice(1)}</button>)}</div></header>
    {mode === 'arrange' && <>
      <div className="harmony-overview-action-bar" aria-label="Arrange actions">
        <button type="button" onClick={() => applyAction('add')} disabled={readOnly || rows.length >= 64}>Add event</button>
        <button type="button" onClick={onLatch} disabled={readOnly}>Latch</button>
        <button type="button" onClick={onStop} disabled={readOnly}>Stop</button>
        <details className="harmony-overview-more-actions">
          <summary>Selected event</summary>
          <div>
            <button type="button" onClick={() => applyAction('duplicate')} disabled={readOnly || rows.length >= 64}>Duplicate</button>
            <button type="button" onClick={makeUnique} disabled={readOnly || selectedRow?.slotId == null}>Make unique</button>
            <button type="button" onClick={() => applyAction('moveUp')} disabled={readOnly || selectedIndex <= 0}>Move up</button>
            <button type="button" onClick={() => applyAction('moveDown')} disabled={readOnly || selectedIndex >= rows.length - 1}>Move down</button>
            <button type="button" onClick={() => applyAction('delete')} disabled={readOnly || rows.length <= 1}>Delete</button>
            <button type="button" onClick={print} disabled={readOnly || !onPrint}>Print exact notes</button>
          </div>
        </details>
      </div>
      <div className="harmony-overview-row-viewport" data-virtualized={rows.length > 24 || undefined} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {visibleWindow.totalHeight > 0 && <div className="harmony-compact-chord-list" style={{ height: visibleWindow.totalHeight, position: 'relative' }}>
          {visibleWindow.rows.map((row) => (
            <HarmonyCompactChordRow
              key={row.id}
              indexLabel={`E${row.index + 1}`}
              slotLabel={row.source.type === 'auto' ? 'Generated' : `S${row.slotId! + 1}`}
              title={row.label}
              notes={row.exactMidiNotes}
              axis={axis}
              sourceValue={row.source.type === 'auto' ? 'auto' : `slot:${row.source.slotId}`}
              sourceOptions={[
                { value: 'auto', label: 'Auto' },
                ...slots.map((slot) => ({ value: `slot:${slot.id}`, label: `S${slot.id + 1} · ${slot.chord?.recognizedLabel || slot.name || 'Empty'}`, disabled: !slot.chord })),
              ]}
              durationUnit={row.duration.unit}
              durationValue={row.duration.value}
              relationship={row.relation?.summary}
              selected={selectedIndex === row.index}
              playing={playingIndex === row.index}
              disabled={readOnly}
              tabIndex={visibleFocusId === row.id ? 0 : -1}
              style={{ position: rows.length > 24 ? 'absolute' : 'relative', top: rows.length > 24 ? row.index * 48 : undefined }}
              onFocus={() => setFocusedRowId(row.id)}
              onSelect={() => { setSelectedIndex(row.index); setFocusedRowId(row.id); }}
              onSourceChange={(value) => updateSource(row, value)}
              onDurationChange={(unit, value) => updateDuration(row, unit, value)}
              onPlayStart={() => { setPlayingIndex(row.index); playStart(row.exactMidiNotes, row.slotId); }}
              onPlayEnd={() => { setPlayingIndex(null); onPlayRelease?.(); }}
            />
          ))}
        </div>}
      </div>
      <LiveChordKeyboard scope={{ kind: 'harmony-takeover' }} notes={selectedRow?.exactMidiNotes ?? []} rootNote={keyboardRoot % 12} octave={Math.floor(keyboardRoot / 12) - 1} disabled={readOnly} active={!readOnly} onNoteDown={(midi) => { if (selectedRow) { const relativeOffset = ((midi - keyboardRoot) % 12 + 12) % 12; setPlayingIndex(selectedRow.index); onPlayStart?.([midi], selectedRow.slotId, relativeOffset); } }} onNoteUp={() => { setPlayingIndex(null); onPlayRelease?.(); }} onReleaseAll={() => { setPlayingIndex(null); onPlayRelease?.(); }} />
    </>}
    {mode === 'edit' && selectedRow && <div className="harmony-overview-edit">
      <header><strong>Edit Notes · shared progression matrix</strong><small>Every event stays aligned. Editing an S-slot updates each event that references it.</small></header>
      <SharedChordMatrixShell
        axis={axis}
        rows={rows.map((row): SharedChordMatrixRow => ({
          id: row.id,
          notes: row.exactMidiNotes,
          selected: row.index === selectedIndex,
          playing: row.index === playingIndex,
          editable: row.slotId != null,
          onSelect: () => setSelectedIndex(row.index),
          leading: [
            <button key="event" type="button" className="harmony-matrix-event" onClick={() => setSelectedIndex(row.index)}>E{row.index + 1}</button>,
            <select key="source" value={row.source.type === 'auto' ? 'auto' : `slot:${row.source.slotId}`} disabled={readOnly} aria-label={`E${row.index + 1} chord source`} onClick={(event) => event.stopPropagation()} onChange={(event) => updateSource(row, event.target.value)}><option value="auto">Auto</option>{slots.map((slot) => <option key={slot.id} value={`slot:${slot.id}`} disabled={!slot.chord}>S{slot.id + 1} · {slot.chord?.recognizedLabel || slot.name}</option>)}</select>,
            <select key="duration" value={`${row.duration.value}:${row.duration.unit}`} disabled={readOnly} aria-label={`E${row.index + 1} duration`} onClick={(event) => event.stopPropagation()} onChange={(event) => { const [value, unit] = event.target.value.split(':'); updateDuration(row, unit as 'bar' | 'phrase', Number(value) as 1 | 2 | 4 | 8); }}>{(['bar', 'phrase'] as const).flatMap((unit) => ([1, 2, 4, 8] as const).map((value) => <option key={`${value}:${unit}`} value={`${value}:${unit}`}>{value}{unit === 'bar' ? 'B' : 'P'}</option>))}</select>,
          ],
        }))}
        leadingHeaders={['Event', 'Chord', 'Len']}
        disabled={readOnly}
        onToggleNote={(matrixRow, note) => {
          const row = rows.find((candidate) => candidate.id === matrixRow.id);
          if (row) toggleExactNote(row, note);
        }}
        ariaLabel="All progression exact notes"
      />
      <div className="harmony-overview-edit-status"><strong>E{selectedRow.index + 1} · {selectedRow.label}</strong><span>{selectedRow.slotId == null ? 'Auto · choose an S-slot to edit notes' : `S${selectedRow.slotId + 1} · ${rows.filter((row) => row.slotId === selectedRow.slotId).length} progression use(s)`}</span></div>
      <div className="harmony-overview-edit-actions"><button type="button" onClick={makeUnique} disabled={readOnly || selectedRow.slotId == null}>Make Unique</button><button type="button" onPointerDown={() => playStart(selectedRow.exactMidiNotes, selectedRow.slotId)} onPointerUp={onPlayRelease} disabled={readOnly || selectedRow.exactMidiNotes.length === 0}>Hold to preview</button><button type="button" onClick={onUndo} disabled={readOnly || !canUndo}>Undo</button><button type="button" onClick={() => onModeChange?.('arrange')}>Done editing notes</button></div>
    </div>}
    {mode === 'manage' && <div className="harmony-overview-manage"><header><strong>Manage Pool</strong><small>Usage includes both Harmony endpoints and persisted Seq 1–4 choices</small></header><div className="harmony-overview-pool-rows">{slots.map((slot) => { const refs = [...bankAnalysis.progressionReferences, ...bankAnalysis.sequenceReferences].filter((ref) => ref.slotId === slot.id); return <div key={slot.id} className="harmony-overview-pool-row"><span>S{slot.id + 1}</span><strong>{slot.name}</strong><small>{usage[slot.id] ?? 0} uses · {slot.locked ? 'Locked' : 'Open'}{refs.length ? ` · ${refs.map((ref) => `${ref.kind === 'sequence' ? 'Seq' : 'E'}:${ref.id}`).join(', ')}` : ''}</small><button type="button" onClick={() => emptyUnused(slot.id)} disabled={readOnly || refs.length > 0 || slot.locked || !slot.chord}>Empty</button></div>; })}</div><div className="harmony-overview-replace"><select value={replaceSource ?? ''} onChange={(event) => setReplaceSource(event.target.value === '' ? null : Number(event.target.value))}><option value="">Source</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>S{slot.id + 1}</option>)}</select><select value={replaceTarget ?? ''} onChange={(event) => setReplaceTarget(event.target.value === '' ? null : Number(event.target.value))}><option value="">Target</option>{slots.map((slot) => <option key={slot.id} value={slot.id} disabled={!slot.chord || slot.id === replaceSource}>S{slot.id + 1}</option>)}</select><button type="button" onClick={replaceReferences} disabled={readOnly}>Replace References</button><button type="button" onClick={onUndo} disabled={readOnly || !canUndo}>Undo</button></div></div>}
    {error && <div className="harmony-overview-error" role="alert">{error}</div>}
    {suggestions && <details className="harmony-overview-suggestions" open={suggestionsOpen} onToggle={(event) => onSuggestionsOpenChange?.(event.currentTarget.open)}><summary>Suggestions <kbd>/</kbd>{selectedSuggestionLabel ? ` · ${selectedSuggestionLabel}` : ''}</summary>{suggestions}{mode === 'edit' && selectedSuggestionLabel && <div className="harmony-overview-suggestion-actions"><strong>{selectedSuggestionLabel}</strong><button type="button" onClick={onSuggestionSave} disabled={readOnly}>Save suggestion</button></div>}</details>}
    {mode === 'arrange' && selectedSuggestionLabel && <div className="harmony-overview-suggestion-actions" aria-label="Selected suggestion actions"><strong>Selected · {selectedSuggestionLabel}</strong><small>{slots.find((slot) => !slot.chord)?.id != null ? `Next empty S${slots.find((slot) => !slot.chord)!.id + 1}` : 'Pool full · matching slots may be reused'}</small><button type="button" onClick={onSuggestionReplace} disabled={readOnly}>Replace E{selectedIndex + 1}</button><button type="button" onClick={onSuggestionInsert} disabled={readOnly || rows.length >= 64}>Insert after</button><button type="button" onClick={onSuggestionSave} disabled={readOnly}>Save S#</button>{!slots.some((slot) => !slot.chord) && <button type="button" onClick={() => onModeChange?.('manage')}>Manage pool</button>}</div>}
  </section>;
}

export default HarmonyOverviewSurface;
