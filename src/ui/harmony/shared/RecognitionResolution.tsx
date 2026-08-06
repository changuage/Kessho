import type { HarmonyDraftChord } from '../../../audio/harmony/harmonyTypes';
import { adoptDraftRecognitionCandidate } from './harmonyDraftHelpers';

export interface RecognitionResolutionProps<T extends HarmonyDraftChord> {
  draft: T;
  disabled?: boolean;
  onChange: (draft: T) => void;
}

export function RecognitionResolution<T extends HarmonyDraftChord>({ draft, disabled = false, onChange }: RecognitionResolutionProps<T>) {
  const candidates = draft.recognitionCandidates?.slice(0, 3) ?? [];
  if (!draft.recognitionMismatch && !draft.requiresSemanticSelection) return null;
  const useExactOnly = () => onChange({
    ...draft,
    playbackBehavior: 'exact',
    recognitionMismatch: false,
    requiresSemanticSelection: false,
    dirty: true,
  } as T);
  const keepIntent = () => onChange({
    ...draft,
    playbackBehavior: 'relative',
    recognitionMismatch: false,
    requiresSemanticSelection: false,
    dirty: true,
  } as T);
  return (
    <div className="harmony-recognition-resolution" role="status" aria-label="Chord recognition choices">
      <div>
        <strong>{draft.recognitionMismatch ? 'Exact voicing differs from Relative intent' : 'Choose how this chord should follow Harmony'}</strong>
        <small>Relative keeps the chord identity when Harmony moves. Exact keeps these MIDI notes fixed.</small>
      </div>
      <div className="harmony-recognition-actions">
        {candidates.map((candidate) => (
          <button key={`${candidate.label}-${candidate.intent.rootNote}-${candidate.intent.quality}`} type="button" disabled={disabled} onClick={() => onChange(adoptDraftRecognitionCandidate(draft, candidate) as T)}>
            Use {candidate.label} relatively · {Math.round(candidate.confidence * 100)}%
          </button>
        ))}
        {draft.intent && <button type="button" disabled={disabled} onClick={keepIntent}>Keep current intent</button>}
        <button type="button" disabled={disabled} onClick={useExactOnly}>Use Exact only</button>
      </div>
    </div>
  );
}

export default RecognitionResolution;
