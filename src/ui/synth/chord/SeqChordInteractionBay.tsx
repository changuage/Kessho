import React, { useMemo, useState } from 'react';
import type { HarmonyDraftChord, SharedHarmonyChordSlot } from '../../../audio/harmony/harmonyTypes';
import LiveChordKeyboard, { type LiveChordInputSource, type LiveChordScope } from '../../harmony/live/LiveChordKeyboard';
import SeqDraftControls, { type HarmonyDraftPlayRoute } from './SeqDraftControls';
import SeqLiveChordControls from './SeqLiveChordControls';
import SuggestionGrid, { type HarmonySuggestion } from '../../harmony/shared/SuggestionGrid';
import { ensureDraftIntent, resolveDraftNotes, updateDraftExactNotes, updateDraftIntent } from '../../harmony/shared/harmonyDraftHelpers';
import { deriveHarmonyPitchAxis } from '../../harmony/shared/harmonyPitchAxis';
import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from '../../../audio/harmony/harmonyScaleIntervals';

export interface SeqChordInteractionBayProps {
  seqId: number;
  draft: HarmonyDraftChord;
  slots: readonly SharedHarmonyChordSlot[];
  activeSlotId?: number | null;
  draftSlotId?: number | null;
  draftLocked?: boolean;
  useCount?: number;
  liveLatched?: boolean;
  draftActive?: boolean;
  liveActive?: boolean;
  onDraftChange: (draft: HarmonyDraftChord) => void;
  onDraftCapture: () => void;
  onDraftClear: () => void;
  onDraftPlay?: (route: HarmonyDraftPlayRoute) => void;
  onLiveSlot: (slotId: number) => void;
  onLiveHoldChange?: (held: boolean) => void;
  onLiveLatch: () => void;
  onLiveStop: () => void;
  onLiveRecord: () => void;
  onNoteDown: (midi: number, velocity: number, source: LiveChordInputSource) => void;
  onNoteUp: (midi: number, source: LiveChordInputSource) => void;
  suggestions?: readonly (HarmonySuggestion | null)[];
  onSuggestion?: (suggestion: HarmonySuggestion) => void;
  onSuggestionPress?: (suggestion: HarmonySuggestion) => void;
  onSuggestionRelease?: (suggestion: HarmonySuggestion) => void;
  onSuggestionSave?: (suggestion: HarmonySuggestion) => void;
  onSuggestionAssign?: (suggestion: HarmonySuggestion) => void;
  selectedStep?: number;
}

export const SeqChordInteractionBay: React.FC<SeqChordInteractionBayProps> = (props) => {
  const [selectedSuggestion, setSelectedSuggestion] = useState<HarmonySuggestion | null>(null);
  const axis = useMemo(() => deriveHarmonyPitchAxis([props.draft.exactMidiNotes]), [props.draft.exactMidiNotes]);
  const semanticNotes = useMemo(
    () => resolveDraftNotes(props.draft, props.draft.capturedContext.rootMidi, props.draft.capturedContext.scaleId),
    [props.draft],
  );
  const semanticIntent = ensureDraftIntent(props.draft);
  const scaleIntervals = HARMONY_SCALE_INTERVALS[Math.round(props.draft.capturedContext.scaleId)]
    ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const keyboardRoot = semanticIntent.rootMode === 'degree'
    ? props.draft.capturedContext.rootMidi + (scaleIntervals[semanticIntent.degree] ?? 0)
    : semanticIntent.rootNote;
  const scope: LiveChordScope = props.liveActive ? { kind: 'seq-live', seqId: props.seqId } : { kind: 'draft', owner: 'seq', seqId: props.seqId };
  const liveScope = props.liveActive;
  const activateScope = (next: 'draft' | 'live') => {
    if (next === 'draft') {
      props.onLiveStop();
      return;
    }
    const preferred = props.activeSlotId ?? props.slots.find((slot) => slot.chord)?.id;
    if (preferred != null) props.onLiveSlot(preferred);
  };
  return (
    <section className="seq-chord-interaction-bay" aria-label={`Seq ${props.seqId + 1} chord interaction`}>
      <div className="seq-chord-scope-switch" role="tablist" aria-label="Chord input scope">
        <button type="button" role="tab" aria-selected={!liveScope} className={!liveScope ? 'active' : ''} onClick={() => activateScope('draft')}>Draft</button>
        <button type="button" role="tab" aria-selected={liveScope} className={liveScope ? 'active' : ''} onClick={() => activateScope('live')}>Live</button>
        <span className="seq-chord-scope-status">{liveScope ? 'S1–S8 trigger' : props.draftSlotId == null ? 'Unsaved draft' : `Editing S${props.draftSlotId + 1}`}</span>
      </div>
      <LiveChordKeyboard
        scope={scope}
        notes={props.draft.exactMidiNotes}
        semanticNotes={semanticNotes}
        rootNote={keyboardRoot}
        scaleRootMidi={props.draft.capturedContext.rootMidi}
        scaleIntervals={scaleIntervals}
        selectedDegree={semanticIntent.degree + 1}
        active={props.draftActive || props.liveActive}
        onNoteDown={props.onNoteDown}
        onNoteUp={props.onNoteUp}
        onSetRoot={!liveScope ? (rootNote) => props.onDraftChange(updateDraftIntent(props.draft, { ...semanticIntent, rootMode: 'absolute', rootNote })) : undefined}
        onSetDegree={!liveScope ? (degree) => props.onDraftChange(updateDraftIntent(props.draft, { ...semanticIntent, rootMode: 'degree', degree: degree - 1 })) : undefined}
        onToggleExactNote={!liveScope ? (midi, present) => props.onDraftChange(updateDraftExactNotes(props.draft, present ? [...props.draft.exactMidiNotes, midi] : props.draft.exactMidiNotes.filter((note) => note !== midi))) : undefined}
        onMoveExactNote={!liveScope ? (midi, octaves) => props.onDraftChange(updateDraftExactNotes(props.draft, props.draft.exactMidiNotes.map((note) => note === midi ? Math.max(0, Math.min(127, note + octaves * 12)) : note))) : undefined}
      />
      <div className="seq-chord-scopes">
        <div className="seq-chord-draft-scope">
          {!liveScope ? <>
          <SeqDraftControls
            draft={props.draft}
            locked={props.draftLocked}
            useCount={props.useCount}
            sharedSlotLabel={props.draftSlotId == null ? 'Unsaved' : `Editing S${props.draftSlotId + 1}`}
            onChange={props.onDraftChange}
            onCapture={props.onDraftCapture}
            onClear={props.onDraftClear}
            onPlay={props.onDraftPlay}
          />
          </> : null}
        </div>
        {liveScope ? <SeqLiveChordControls
          seqId={props.seqId}
          slots={props.slots}
          activeSlotId={props.activeSlotId}
          latched={props.liveLatched}
          onPlaySlot={props.onLiveSlot}
          onHoldChange={props.onLiveHoldChange}
          onLatch={props.onLiveLatch}
          onStop={props.onLiveStop}
          onRecord={props.onLiveRecord}
        /> : null}
      </div>
      {(props.suggestions?.some(Boolean) ?? false) ? (
        <details className="seq-chord-suggestions">
          <summary>Suggestions{selectedSuggestion ? ` · ${selectedSuggestion.label}` : ''}</summary>
          <SuggestionGrid
            axis={axis}
            suggestions={props.suggestions ?? []}
            onSelect={(suggestion) => {
              setSelectedSuggestion(suggestion);
              props.onSuggestion?.(suggestion);
            }}
            onPress={(suggestion) => {
              setSelectedSuggestion(suggestion);
              props.onSuggestion?.(suggestion);
              props.onSuggestionPress?.(suggestion);
            }}
            onRelease={props.onSuggestionRelease}
            onSave={props.onSuggestionSave}
          />
          {selectedSuggestion && props.onSuggestionAssign ? (
            <div className="harmony-suggestion-action-dock">
              <strong>{selectedSuggestion.label}</strong>
              <button type="button" onClick={() => props.onSuggestionAssign?.(selectedSuggestion)}>Assign to Step {(props.selectedStep ?? 0) + 1}</button>
              <button type="button" onClick={() => props.onSuggestionSave?.(selectedSuggestion)}>Save suggestion</button>
            </div>
          ) : null}
        </details>
      ) : null}
    </section>
  );
};
export default SeqChordInteractionBay;
