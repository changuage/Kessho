import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { SliderState } from '../state';
import type { HarmonyProjection, HarmonyLiveLayer } from '../../audio/harmony/harmonyProjection';
import { analyzePlayingAndPreview, type TonalContextDisplay } from '../../audio/harmony/tonalContextAnalysis';
import type { HarmonyEvidenceEvent } from '../../audio/harmony/harmonyEvidence';
import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from '../../audio/harmony/harmonyScaleIntervals';
import {
  createHarmonyWorkspaceHistory,
  harmonyHistoryCanRedo,
  harmonyHistoryCanUndo,
  reduceHarmonyWorkspaceHistory,
  redoHarmonyWorkspaceHistory,
  undoHarmonyWorkspaceHistory,
  type HarmonyAuthoredSnapshot,
  type HarmonyAuthoredCommand,
  type HarmonyWorkspaceHistoryState,
  type HarmonyWorkspaceView,
} from './harmonyWorkspaceState';

const VIEW_STORAGE_KEY = 'kessho.harmony.workspace.view';
const HARMONY_KEYS = [
  'rootNote', 'scaleMode', 'manualScale', 'tension', 'cofDriftEnabled', 'cofDriftRate', 'cofDriftDirection', 'cofDriftRange', 'cofCurrentStep',
  'harmonyChordSlots', 'harmonyChordSlotsA', 'harmonyChordSlotsB',
  'harmonyProgression', 'harmonyProgressionA', 'harmonyProgressionB',
  'manualHarmonyControl',
] as const;

function notesFromUnknown(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((note): note is number => typeof note === 'number' && Number.isFinite(note)).slice(0, 8).map((note) => Math.round(note));
}

function eventFromSlot(slot: HarmonyProjection['slots'][number], kind: HarmonyEvidenceEvent['kind'], timestampMs: number, engineRootPitchClass: number, scaleId: number): HarmonyEvidenceEvent | null {
  const chord = slot.chord;
  if (!chord) return null;
  const notes = notesFromUnknown(chord.exactMidiNotes);
  const intervals = HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const rootPitchClass = chord.intent?.rootMode === 'degree'
    ? (engineRootPitchClass + (intervals[((chord.intent.degree % intervals.length) + intervals.length) % intervals.length] ?? 0)) % 12
    : chord.intent?.rootNote;
  if (notes.length === 0 && rootPitchClass === undefined) return null;
  return { kind, scope: 'playing', ...(notes.length > 0 ? { notes } : {}), ...(rootPitchClass !== undefined ? { rootPitchClass } : {}), confirmed: chord.intentSource === 'confirmed', audible: true, timestampMs };
}

function eventFromLiveLayer(
  layer: HarmonyLiveLayer | null | undefined,
  timestampMs: number,
  engineRootPitchClass: number,
  scaleId: number,
): HarmonyEvidenceEvent | null {
  if (!layer) return null;
  const draft = layer.draft ?? null;
  const frame = layer.frame;
  const notes = notesFromUnknown(draft?.exactMidiNotes ?? frame?.currentNotePool);
  const intent = draft?.intent ?? null;
  const intervals = HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const rootPitchClass = intent?.rootMode === 'degree' && typeof intent.degree === 'number'
    ? (engineRootPitchClass + (intervals[((Math.round(intent.degree) % intervals.length) + intervals.length) % intervals.length] ?? 0)) % 12
    : typeof intent?.rootNote === 'number' ? intent.rootNote : frame ? frame.rootMidi % 12 : undefined;
  if (notes.length === 0 && rootPitchClass === undefined) return null;
  return { kind: 'livePlay', scope: 'preview', ...(notes.length > 0 ? { notes } : {}), ...(rootPitchClass !== undefined ? { rootPitchClass } : {}), audible: true, timestampMs };
}

/**
 * Read-only workspace bridge. It derives advisory Playing/Preview labels from
 * canonical progression + authored slots + a weak baseline. No state or Engine
 * mutation occurs, and Seq trigger payloads can be layered in separately via
 * harmonyEvidenceFromTriggerObservations when Product exposes them.
 */
export function deriveHarmonyWorkspaceTonalContext(projection: HarmonyProjection, nowMs = Date.now(), isRunning = false): TonalContextDisplay {
  const playingEvidence: HarmonyEvidenceEvent[] = [];
  const progression = projection.progression;
  for (let index = 0; index < progression.length && index < 64; index += 1) {
    const event = progression[index]!;
    const slot = event.slotId === null ? null : projection.slots.find((candidate) => candidate.id === event.slotId) ?? null;
    const slotEvent = slot ? eventFromSlot(slot, 'progression', nowMs - (progression.length - index) * 250, projection.engine.effectiveRootNote, projection.engine.scaleId) : null;
    if (slotEvent) playingEvidence.push(slotEvent);
  }
  for (const slot of projection.slots.slice(0, 8)) {
    if (!slot.chord || (!slot.locked && slot.chord.intentSource !== 'confirmed')) continue;
    const event = eventFromSlot(slot, 'slot', nowMs - 100, projection.engine.effectiveRootNote, projection.engine.scaleId);
    if (event) playingEvidence.push(event);
  }
  if (isRunning) {
    // A temporary live layer is Preview evidence only. Playing continues to
    // describe the audible progression frame underneath the preview.
    const underlyingNotes = projection.underlyingFrame.currentNotePool.slice(0, 8);
    playingEvidence.push({ kind: 'playedChord', scope: 'playing', notes: underlyingNotes, rootPitchClass: projection.underlyingFrame.rootMidi % 12, confirmed: true, audible: true, timestampMs: nowMs });
  }
  const baselineNotes = projection.underlyingFrame.currentNotePool.slice(0, 8);
  playingEvidence.push({ kind: 'baseline', scope: 'playing', notes: baselineNotes, rootPitchClass: projection.engine.effectiveRootNote, strength: 1, audible: true, timestampMs: nowMs });
  const previewEvent = eventFromLiveLayer(projection.liveLayer, nowMs, projection.engine.effectiveRootNote, projection.engine.scaleId);
  return analyzePlayingAndPreview({
    engine: { rootPitchClass: projection.engine.effectiveRootNote, scaleId: projection.engine.scaleId, scaleName: projection.engine.scaleName },
    playingEvidence,
    previewEvidence: previewEvent ? [previewEvent] : undefined,
    nowMs,
  });
}

function snapshot(value: SliderState): HarmonyAuthoredSnapshot {
  const record = value as unknown as Record<string, unknown>;
  return Object.fromEntries(HARMONY_KEYS.filter((key) => key in record).map((key) => [key, record[key]]));
}

function mergeSnapshot(value: SliderState, next: HarmonyAuthoredSnapshot): SliderState {
  return { ...(value as unknown as Record<string, unknown>), ...next } as unknown as SliderState;
}

function readInitialView(): HarmonyWorkspaceView {
  if (typeof window === 'undefined') return 'simple';
  try {
    const value = window.sessionStorage.getItem(VIEW_STORAGE_KEY);
    return value === 'detail' || value === 'overview' || value === 'simple' ? value : 'simple';
  } catch {
    return 'simple';
  }
}

export interface HarmonyWorkspaceController {
  view: HarmonyWorkspaceView;
  setView: (view: HarmonyWorkspaceView) => void;
  history: HarmonyWorkspaceHistoryState;
  canUndo: boolean;
  canRedo: boolean;
  onStateChange: React.Dispatch<React.SetStateAction<SliderState>>;
  onTransientStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  undo: () => void;
  redo: () => void;
  commitCommand: (command: HarmonyAuthoredCommand) => void;
  /** Apply one authored update with an explicit local-history command. */
  commitAuthoredStateChange: (updater: React.SetStateAction<SliderState>, before?: HarmonyAuthoredSnapshot, label?: string) => void;
}

export function useHarmonyWorkspaceController(
  state: SliderState,
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>,
): HarmonyWorkspaceController {
  const [view, setViewState] = useState<HarmonyWorkspaceView>(readInitialView);
  const [history, setHistory] = useState(() => createHarmonyWorkspaceHistory(snapshot(state)));

  useEffect(() => {
    try { window.sessionStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* preference storage is optional */ }
  }, [view]);

  const setView = useCallback((next: HarmonyWorkspaceView) => setViewState(next), []);
  const dispatch = useCallback<React.Dispatch<React.SetStateAction<SliderState>>>((updater) => {
    if (!onStateChange) return;
    onStateChange((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      const before = snapshot(previous);
      const after = snapshot(next);
      setHistory((current) => reduceHarmonyWorkspaceHistory(current, { type: 'authored', before, after, label: 'Harmony edit' }));
      return next;
    });
  }, [onStateChange]);

  const undo = useCallback(() => {
    if (!onStateChange) return;
    setHistory((current) => {
      const next = undoHarmonyWorkspaceHistory(current);
      if (next !== current) onStateChange((previous) => mergeSnapshot(previous, next.present));
      return next;
    });
  }, [onStateChange]);

  const redo = useCallback(() => {
    if (!onStateChange) return;
    setHistory((current) => {
      const next = redoHarmonyWorkspaceHistory(current);
      if (next !== current) onStateChange((previous) => mergeSnapshot(previous, next.present));
      return next;
    });
  }, [onStateChange]);

  const commitCommand = useCallback((command: HarmonyAuthoredCommand) => {
    if (!onStateChange || command.type === 'held-notes' || command.type === 'preview' || command.type === 'focus' || command.type === 'view/select') return;
    setHistory((current) => {
      const next = reduceHarmonyWorkspaceHistory(current, command);
      if (next !== current) onStateChange((previous) => mergeSnapshot(previous, next.present));
      return next;
    });
  }, [onStateChange]);

  const commitAuthoredStateChange = useCallback((updater: React.SetStateAction<SliderState>, beforeOverride?: HarmonyAuthoredSnapshot, label = 'Harmony edit') => {
    if (!onStateChange) return;
    onStateChange((previous) => {
      const before = beforeOverride ?? snapshot(previous);
      const next = typeof updater === 'function' ? updater(previous) : updater;
      const after = snapshot(next);
      setHistory((current) => reduceHarmonyWorkspaceHistory(current, { type: 'authored', before, after, label }));
      return next;
    });
  }, [onStateChange]);

  return useMemo(() => ({ view, setView, history, canUndo: harmonyHistoryCanUndo(history), canRedo: harmonyHistoryCanRedo(history), onStateChange: dispatch, onTransientStateChange: onStateChange, undo, redo, commitCommand, commitAuthoredStateChange }), [commitAuthoredStateChange, commitCommand, dispatch, history, onStateChange, redo, setView, undo, view]);
}

export { snapshot as captureHarmonyAuthoredSnapshot };
