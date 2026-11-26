import React, { useEffect, useMemo, useState } from 'react';
import type { HarmonyProgression } from '../../audio/harmony/harmonyTypes';
import type { Chord } from '../../audio/harmony/chord';
import { chordPaletteSaveBlock, placeChordFromPalette, removeChordFromPalette, saveChordToPalette } from '../../audio/harmony/chordPalette';
import { ChordEditor } from './chord/ChordEditor';
import PaletteRow from './chord/PaletteRow';
import { applyHarmonyOverviewAction, overviewFocusTarget, overviewRows, setHarmonyOverviewChord, setHarmonyOverviewSource, updateHarmonyOverviewDuration, virtualizeOverviewRows, type HarmonyOverviewRow } from './harmonyOverviewModel';
import LiveChordKeyboard from './live/LiveChordKeyboard';
import HarmonyCompactChordRow from './shared/HarmonyCompactChordRow';
import { deriveHarmonyPitchAxis } from './shared/harmonyPitchAxis';

export interface HarmonyOverviewSurfaceProps {
  progression: HarmonyProgression;
  /** Key used to name chord events. */
  keyRoot: number;
  scaleId: number;
  selectedIndex?: number;
  readOnly?: boolean;
  onProgressionChange?: (progression: HarmonyProgression, selectedIndex: number) => void;
  /** Saved chords shared with Synth's Notes editor. */
  palette?: readonly Chord[];
  onPaletteChange?: (palette: Chord[]) => void;
  /** The engine's current degree; an Auto event switched to Chord starts there. */
  fallbackDegree?: number;
  onPlayStart?: (notes: readonly number[], relativeOffset?: number) => void;
  onPlayRelease?: () => void;
  onLatch?: () => void;
  onStop?: () => void;
}

export function HarmonyOverviewSurface({ progression, keyRoot, scaleId, selectedIndex: selectedIndexProp = 0, readOnly = false, palette = [], fallbackDegree = 0, onPaletteChange, onProgressionChange, onPlayStart, onPlayRelease, onLatch, onStop }: HarmonyOverviewSurfaceProps) {
  const [selectedIndex, setSelectedIndex] = useState(selectedIndexProp);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSelectedIndex(selectedIndexProp), [selectedIndexProp]);
  const rows = useMemo(() => overviewRows(progression, { rootPitchClass: ((Math.round(keyRoot) % 12) + 12) % 12, scaleId }), [progression, keyRoot, scaleId]);
  const visibleWindow = useMemo(() => virtualizeOverviewRows(rows, scrollTop, 380, 48), [rows, scrollTop]);
  const selectedRow = rows[Math.max(0, Math.min(rows.length - 1, selectedIndex))] ?? rows[0];
  const stableFocusId = overviewFocusTarget(rows, focusedRowId, selectedIndex);
  const visibleFocusId = visibleWindow.rows.some((row) => row.id === stableFocusId) ? stableFocusId : visibleWindow.rows[0]?.id ?? null;
  const axis = useMemo(() => deriveHarmonyPitchAxis(rows.map((row) => row.exactMidiNotes)), [rows]);

  const publish = (next: HarmonyProgression, nextIndex: number) => {
    setSelectedIndex(nextIndex);
    onProgressionChange?.(next, nextIndex);
  };
  const applyAction = (action: 'add' | 'duplicate' | 'moveUp' | 'moveDown' | 'delete') => {
    if (readOnly) return;
    const result = applyHarmonyOverviewAction(progression, selectedIndex, action);
    if (!result.ok) { setError(result.error ?? 'Overview action failed'); return; }
    setError(null);
    publish(result.progression, result.selectedIndex);
  };
  const setSource = (index: number, type: 'auto' | 'chord') => {
    if (!readOnly) publish(setHarmonyOverviewSource(progression, index, type, fallbackDegree), index);
  };
  const updateDuration = (row: HarmonyOverviewRow, unit: 'bar' | 'phrase', value: 1 | 2 | 4 | 8) => {
    if (!readOnly) publish(updateHarmonyOverviewDuration(progression, row.index, unit, value), row.index);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (readOnly || event.target !== event.currentTarget || !selectedRow) return;
    if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); applyAction('moveUp'); return; }
    if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); applyAction('moveDown'); return; }
    const key = event.key.toLowerCase();
    if (key === ' ') { event.preventDefault(); onLatch?.(); }
    if (key === 'escape') { event.preventDefault(); onStop?.(); }
  };

  return <section className="harmony-overview-surface" aria-label="Harmony progression" tabIndex={0} onKeyDown={handleKeyDown} onBlur={() => { setPlayingIndex(null); onPlayRelease?.(); }}>
    <header className="harmony-overview-header"><div><strong>Progression</strong><small>{rows.length}/64</small></div></header>
    <div className="harmony-overview-action-bar" aria-label="Progression actions">
      <button type="button" onClick={() => applyAction('add')} disabled={readOnly || rows.length >= 64}>Add event</button>
      <button type="button" onClick={onLatch} disabled={readOnly}>Latch</button>
      <button type="button" onClick={onStop} disabled={readOnly}>Stop</button>
      <details className="harmony-overview-more-actions">
        <summary>Selected event</summary>
        <div>
          <button type="button" onClick={() => applyAction('duplicate')} disabled={readOnly || rows.length >= 64}>Duplicate</button>
          <button type="button" onClick={() => applyAction('moveUp')} disabled={readOnly || selectedIndex <= 0}>Move up</button>
          <button type="button" onClick={() => applyAction('moveDown')} disabled={readOnly || selectedIndex >= rows.length - 1}>Move down</button>
          <button type="button" onClick={() => applyAction('delete')} disabled={readOnly || rows.length <= 1}>Delete</button>
        </div>
      </details>
    </div>
    <div className="harmony-overview-row-viewport" data-virtualized={rows.length > 24 || undefined} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      {visibleWindow.totalHeight > 0 && <div className="harmony-compact-chord-list" style={{ height: rows.length > 24 ? visibleWindow.totalHeight : undefined, position: 'relative' }}>
        {visibleWindow.rows.map((row) => (
          <HarmonyCompactChordRow
            key={row.id}
            indexLabel={`E${row.index + 1}`}
            slotLabel={row.source.type === 'auto' ? 'Generated' : 'Chord'}
            title={row.label}
            notes={row.exactMidiNotes}
            axis={axis}
            sourceValue={row.source.type}
            sourceOptions={[{ value: 'auto', label: 'Auto' }, { value: 'chord', label: 'Chord' }]}
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
            onSourceChange={(value) => setSource(row.index, value === 'chord' ? 'chord' : 'auto')}
            onDurationChange={(unit, value) => updateDuration(row, unit, value)}
            onPlayStart={() => { setPlayingIndex(row.index); onPlayStart?.(row.exactMidiNotes); }}
            onPlayEnd={() => { setPlayingIndex(null); onPlayRelease?.(); }}
          />
        ))}
      </div>}
    </div>
    {selectedRow ? <section className="harmony-voicing" aria-label={`Voicing, event ${selectedRow.index + 1}`}>
      <div className="harmony-voicing-head">
        <strong>{`E${selectedRow.index + 1}`}</strong>
      </div>
      {selectedRow.source.type === 'chord' ? <ChordEditor
        key={selectedRow.id}
        value={selectedRow.source.chord}
        keyRoot={keyRoot}
        scaleId={scaleId}
        disabled={readOnly}
        onChange={(chord) => publish(setHarmonyOverviewChord(progression, selectedRow.index, chord), selectedRow.index)}
        onSave={onPaletteChange ? (chord) => onPaletteChange(saveChordToPalette(palette, chord).palette) : undefined}
        saveBlockedReason={chordPaletteSaveBlock(palette, selectedRow.source.chord)}
      /> : null}
      {onPaletteChange ? <PaletteRow
        palette={palette}
        keyRoot={keyRoot}
        scaleId={scaleId}
        targetLabel={`event ${selectedRow.index + 1}`}
        disabled={readOnly}
        onPlace={(index) => {
          const chord = placeChordFromPalette(palette, index);
          if (chord) publish(setHarmonyOverviewChord(progression, selectedRow.index, chord), selectedRow.index);
        }}
        onRemove={(index) => onPaletteChange(removeChordFromPalette(palette, index))}
      /> : null}
    </section> : null}
    <LiveChordKeyboard scope={{ kind: 'harmony-takeover' }} notes={selectedRow?.exactMidiNotes ?? []} rootNote={keyRoot % 12} octave={Math.floor(keyRoot / 12) - 1} disabled={readOnly} active={!readOnly} onNoteDown={(midi) => { if (selectedRow) { const relativeOffset = ((midi - keyRoot) % 12 + 12) % 12; setPlayingIndex(selectedRow.index); onPlayStart?.([midi], relativeOffset); } }} onNoteUp={() => { setPlayingIndex(null); onPlayRelease?.(); }} onReleaseAll={() => { setPlayingIndex(null); onPlayRelease?.(); }} />
    {error && <div className="harmony-overview-error" role="alert">{error}</div>}
  </section>;
}

export default HarmonyOverviewSurface;
