import React, { useMemo, useState } from 'react';
import type { HarmonyDraftChord, SharedHarmonyChordSlot } from '../../../audio/harmony/harmonyTypes';
import LiveChordKeyboard, { type LiveChordScope } from '../../harmony/live/LiveChordKeyboard';
import SeqDraftControls from './SeqDraftControls';
import SeqLiveChordControls from './SeqLiveChordControls';
import SuggestionGrid, { type HarmonySuggestion } from '../../harmony/shared/SuggestionGrid';
import SharedChordMatrix from '../../harmony/shared/SharedChordMatrix';

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
  onDraftPlay?: () => void;
  onLiveSlot: (slotId: number) => void;
  onLiveHoldChange?: (held: boolean) => void;
  onLiveLatch: () => void;
  onLiveStop: () => void;
  onLiveRecord: () => void;
  onNoteDown: (midi: number, velocity: number, source: 'onscreen' | 'qwerty') => void;
  onNoteUp: (midi: number, source: 'onscreen' | 'qwerty') => void;
  suggestions?: readonly HarmonySuggestion[];
  onSuggestion?: (suggestion: HarmonySuggestion) => void;
  onSharedMatrixChange?: (notes: number[]) => void;
}

export const SeqChordInteractionBay: React.FC<SeqChordInteractionBayProps> = (props) => {
  const [expanded, setExpanded] = useState(false);
  const axis = useMemo(() => { const notes = props.draft.exactMidiNotes; const low = notes.length ? Math.max(0, Math.min(...notes) - 6) : 54; const high = notes.length ? Math.min(127, Math.max(...notes) + 6) : 78; return Array.from({ length: high - low + 1 }, (_, index) => low + index); }, [props.draft.exactMidiNotes]);
  const scope: LiveChordScope = props.liveActive ? { kind: 'seq-live', seqId: props.seqId } : { kind: 'draft', owner: 'seq', seqId: props.seqId };
  const sharedSlot = props.draftSlotId == null ? null : props.slots[props.draftSlotId];
  return <section className={`seq-chord-interaction-bay${expanded ? " expanded" : ""}`} aria-expanded={expanded}><LiveChordKeyboard scope={scope} notes={props.draft.exactMidiNotes} active={props.draftActive || props.liveActive} onNoteDown={props.onNoteDown} onNoteUp={props.onNoteUp} /><div className="seq-chord-scopes"><SeqDraftControls axis={axis} draft={props.draft} locked={props.draftLocked} useCount={props.useCount} sharedSlotLabel={props.draftSlotId == null ? 'Unsaved' : `Editing S${props.draftSlotId + 1}`} onChange={props.onDraftChange} onCapture={props.onDraftCapture} onClear={props.onDraftClear} onPlay={props.onDraftPlay} /><button type="button" className="seq-edit-all-notes" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Collapse notes" : "Edit all notes"}</button>{expanded && sharedSlot?.chord && props.onSharedMatrixChange ? <SharedChordMatrix axis={axis} notes={sharedSlot.chord.exactMidiNotes} disabled={sharedSlot.locked} onToggleNote={(midi, present) => props.onSharedMatrixChange?.(present ? sharedSlot.chord!.exactMidiNotes.filter((note) => note !== midi) : [...sharedSlot.chord!.exactMidiNotes, midi])} /> : null}<SuggestionGrid axis={axis} suggestions={props.suggestions ?? []} onSelect={props.onSuggestion} /><SeqLiveChordControls seqId={props.seqId} slots={props.slots} activeSlotId={props.activeSlotId} latched={props.liveLatched} onPlaySlot={props.onLiveSlot} onHoldChange={props.onLiveHoldChange} onLatch={props.onLiveLatch} onStop={props.onLiveStop} onRecord={props.onLiveRecord} /></div></section>;
};
export default SeqChordInteractionBay;
