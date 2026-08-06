import React, { useState } from 'react';
import type { HarmonyBassMode, HarmonyChordAlteration, HarmonyDraftChord, HarmonyChordQuality, HarmonyChordExtension } from '../../../audio/harmony/harmonyTypes';
import QualityExtensionControls from '../../harmony/shared/QualityExtensionControls';
import RecognitionResolution from '../../harmony/shared/RecognitionResolution';
import { ensureDraftIntent, updateDraftIntent } from '../../harmony/shared/harmonyDraftHelpers';

export interface SeqDraftControlsProps {
  draft: HarmonyDraftChord;
  locked?: boolean;
  sharedSlotLabel?: string;
  useCount?: number;
  onChange: (draft: HarmonyDraftChord) => void;
  onCapture: () => void;
  onClear: () => void;
  onPlay?: (route: HarmonyDraftPlayRoute) => void;
}

export type HarmonyDraftPlayRoute = 'track' | 'harmony';

export const SeqDraftControls: React.FC<SeqDraftControlsProps> = ({ draft, locked = false, sharedSlotLabel = 'Unsaved', useCount = 0, onChange, onCapture, onClear, onPlay }) => {
  const [route, setRoute] = useState<HarmonyDraftPlayRoute>('track');
  const semanticIntent = ensureDraftIntent(draft);
  const quality = draft.quality ?? draft.intent?.quality ?? null;
  const extensions = draft.extensions ?? (draft.intent?.extensions as HarmonyChordExtension[] | undefined) ?? [];
  const status = draft.dirty ? 'Unsaved' : draft.intentSource === 'confirmed' ? 'Confirmed' : draft.intentSource === 'inferred' ? 'Inferred' : 'Custom';
  const rootLabel = semanticIntent.rootMode === 'degree' ? `Degree ${semanticIntent.degree + 1}` : `Root ${semanticIntent.rootNote}`;
  const updateAdvanced = (patch: Partial<typeof semanticIntent>) => onChange(updateDraftIntent(draft, { ...semanticIntent, ...patch }, {}));
  const alterations = semanticIntent.alterations ?? [];
  const toggleAlteration = (alteration: HarmonyChordAlteration) => updateAdvanced({
    alterations: alterations.includes(alteration)
      ? alterations.filter((entry) => entry !== alteration)
      : [...alterations, alteration],
  });
  const ownershipLabel = draft.dirty || sharedSlotLabel === 'Unsaved' ? 'DRAFT · unsaved' : `${sharedSlotLabel} · saved`;
  return <section className="seq-draft-controls" aria-label="Seq draft chord">
    <header><strong>{rootLabel}</strong><span>{ownershipLabel} · {useCount} uses</span><span>{status}</span></header>
    <QualityExtensionControls quality={quality} extensions={extensions} disabled={locked} onQualityChange={(next: HarmonyChordQuality) => onChange(updateDraftIntent(draft, { ...semanticIntent, quality: next }, {}))} onExtensionsChange={(next) => onChange(updateDraftIntent(draft, { ...semanticIntent, extensions: next }, {}))} />
    <details className="seq-draft-advanced">
      <summary>Advanced voicing</summary>
      <div className="seq-draft-advanced-grid">
        <label>Playback<select value={draft.playbackBehavior} disabled={locked} onChange={(event) => onChange({ ...draft, playbackBehavior: event.target.value as HarmonyDraftChord['playbackBehavior'], dirty: true })}><option value="auto">Auto</option><option value="relative">Relative</option><option value="exact">Exact</option></select></label>
        <label>Route<select value={route} onChange={(event) => setRoute(event.target.value as HarmonyDraftPlayRoute)}><option value="track">Track</option><option value="harmony">Harmony</option></select></label>
        <label>Octave<input type="number" min={0} max={8} value={semanticIntent.octave} disabled={locked} onChange={(event) => updateAdvanced({ octave: Number(event.target.value) })} /></label>
        <label>Inversion<input type="number" min={0} max={7} value={semanticIntent.inversion} disabled={locked} onChange={(event) => updateAdvanced({ inversion: Number(event.target.value) })} /></label>
        <label>Spread<input type="range" min={0} max={1} step={0.05} value={semanticIntent.spread} disabled={locked} onChange={(event) => updateAdvanced({ spread: Number(event.target.value) })} /></label>
        <label>Bass<select value={semanticIntent.bassMode} disabled={locked} onChange={(event) => updateAdvanced({ bassMode: event.target.value as HarmonyBassMode })}><option value="off">Off</option><option value="root">Root</option><option value="fifth">Fifth</option><option value="captured">Captured</option></select></label>
        {semanticIntent.bassMode === 'captured' && <label>Bass note<input type="number" min={0} max={127} value={semanticIntent.bassNote ?? 36} disabled={locked} onChange={(event) => updateAdvanced({ bassNote: Number(event.target.value) })} /></label>}
        <label className="seq-draft-preserve"><input type="checkbox" checked={semanticIntent.preserveCapturedVoicing} disabled={locked} onChange={(event) => updateAdvanced({ preserveCapturedVoicing: event.target.checked })} />Preserve exact voicing</label>
      </div>
      <div className="seq-draft-alterations" aria-label="Chord alterations">
        {(['b5', '#5', 'b9', '#9', '#11', 'b13', 'omit3', 'omit5'] as const).map((alteration) => <button key={alteration} type="button" className={alterations.includes(alteration) ? 'active' : ''} disabled={locked} onClick={() => toggleAlteration(alteration)}>{alteration}</button>)}
      </div>
    </details>
    <RecognitionResolution draft={draft} disabled={locked} onChange={onChange} />
    <div className="seq-draft-actions"><button type="button" onClick={() => onPlay?.(route)} disabled={!onPlay || draft.exactMidiNotes.length === 0}>Play</button><button type="button" onClick={onClear} disabled={locked}>Clear draft</button><button type="button" onClick={onCapture} disabled={locked || (draft.exactMidiNotes.length === 0 && !draft.intent)}>Capture</button></div>
  </section>;
};
export default SeqDraftControls;
