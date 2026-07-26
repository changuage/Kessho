import React, { useMemo, useState } from 'react';
import type { HarmonyDraftChord, HarmonyChordQuality, HarmonyChordExtension } from '../../../audio/harmony/harmonyTypes';
import QualityExtensionControls from '../../harmony/shared/QualityExtensionControls';
import ExactVoicingEditor from '../../harmony/shared/ExactVoicingEditor';
import RelativeChordDotMap from '../../harmony/shared/RelativeChordDotMap';
import { ensureDraftIntent, updateDraftExactNotes, updateDraftIntent } from '../../harmony/shared/harmonyDraftHelpers';

export interface SeqDraftControlsProps {
  draft: HarmonyDraftChord;
  locked?: boolean;
  sharedSlotLabel?: string;
  useCount?: number;
  axis?: readonly number[];
  onChange: (draft: HarmonyDraftChord) => void;
  onCapture: () => void;
  onClear: () => void;
  onPlay?: (route: HarmonyDraftPlayRoute) => void;
}

export type HarmonyDraftPlayRoute = 'track' | 'harmony';

export const SeqDraftControls: React.FC<SeqDraftControlsProps> = ({ draft, locked = false, sharedSlotLabel = 'Unsaved', useCount = 0, axis, onChange, onCapture, onClear, onPlay }) => {
  const [route, setRoute] = useState<HarmonyDraftPlayRoute>('track');
  const quality = draft.quality ?? draft.intent?.quality ?? null;
  const extensions = draft.extensions ?? (draft.intent?.extensions as HarmonyChordExtension[] | undefined) ?? [];
  const mode = draft.intent?.rootMode ?? 'root';
  const status = draft.dirty ? 'Unsaved' : draft.intentSource === 'confirmed' ? 'Confirmed' : draft.intentSource === 'inferred' ? 'Inferred' : 'Custom';
  const rootLabel = useMemo(() => mode === 'degree' ? `Degree ${(draft.intent?.degree ?? 0) + 1}` : `Root ${draft.intent?.rootNote ?? '--'}`, [draft.intent, mode]);
  const semanticIntent = ensureDraftIntent(draft);
  const ownershipLabel = draft.dirty || sharedSlotLabel === 'Unsaved' ? 'DRAFT · unsaved' : `${sharedSlotLabel} · saved`;
  return <section className="seq-draft-controls" aria-label="Seq draft chord">
    <header><strong>Draft</strong><span>{ownershipLabel} · Shared · {useCount} uses</span><span>{draft.playbackBehavior ? `${draft.playbackBehavior[0]?.toUpperCase() ?? ''}${draft.playbackBehavior.slice(1)}` : 'Auto'}</span><span>{status}</span></header>
    <div className="seq-draft-root-row"><button type="button" className={mode === 'root' ? 'active' : ''} disabled={locked} onClick={() => onChange(updateDraftIntent(draft, { ...semanticIntent, rootMode: 'absolute' }, {}))}>Root</button><button type="button" className={mode === 'degree' ? 'active' : ''} disabled={locked} onClick={() => onChange(updateDraftIntent(draft, { ...semanticIntent, rootMode: 'degree' }, {}))}>Degree</button><input type="number" min={0} max={11} value={semanticIntent.rootNote} disabled={locked} aria-label="Draft root note" onChange={(event) => onChange(updateDraftIntent(draft, { ...semanticIntent, rootNote: Number(event.target.value), rootMode: 'absolute' }, {}))} /><input type="number" min={0} max={6} value={semanticIntent.degree} disabled={locked} aria-label="Draft scale degree" onChange={(event) => onChange(updateDraftIntent(draft, { ...semanticIntent, degree: Number(event.target.value), rootMode: 'degree' }, {}))} /><span>{rootLabel}</span><select value={draft.playbackBehavior} disabled={locked} onChange={(event) => onChange({ ...draft, playbackBehavior: event.target.value as HarmonyDraftChord['playbackBehavior'], dirty: true })}><option value="auto">Auto</option><option value="relative">Relative</option><option value="exact">Exact</option></select></div>
    <QualityExtensionControls quality={quality} extensions={extensions} disabled={locked} onQualityChange={(next: HarmonyChordQuality) => onChange(updateDraftIntent(draft, { ...semanticIntent, quality: next }, {}))} onExtensionsChange={(next) => onChange(updateDraftIntent(draft, { ...semanticIntent, extensions: next }, {}))} />
    <RelativeChordDotMap notes={draft.exactMidiNotes} axis={axis} />
    <ExactVoicingEditor notes={draft.exactMidiNotes} axis={axis} locked={locked} onChange={(notes) => onChange(updateDraftExactNotes({ ...draft, source: 'matrix' }, notes))} />
    <div className="seq-draft-actions"><span className="seq-draft-route" aria-label="Draft play route"><strong>Route</strong><button type="button" className={route === 'track' ? 'active' : ''} onClick={() => setRoute('track')}>Track</button><button type="button" className={route === 'harmony' ? 'active' : ''} onClick={() => setRoute('harmony')}>Harmony</button></span><button type="button" onClick={() => onPlay?.(route)} disabled={!onPlay || draft.exactMidiNotes.length === 0}>Play</button><button type="button" onClick={onClear} disabled={locked}>Clear draft</button><button type="button" onClick={onCapture} disabled={locked || (draft.exactMidiNotes.length === 0 && !draft.intent)}>Capture</button></div>
  </section>;
};
export default SeqDraftControls;
