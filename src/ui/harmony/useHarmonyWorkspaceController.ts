import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { SliderState } from '../state';
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
  'harmonyChordSlots', 'harmonyChordSlotsA', 'harmonyChordSlotsB', 'harmonyChordSequence', 'harmonyChordSequenceA', 'harmonyChordSequenceB',
  'harmonyProgression', 'harmonyProgressionA', 'harmonyProgressionB', 'harmonyChordSequenceEnabled', 'harmonyChordSequenceLength', 'harmonyChordSequenceStepIndex',
  'manualHarmonyControl', 'harmonyGenerationSeed',
] as const;

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

  return useMemo(() => ({ view, setView, history, canUndo: harmonyHistoryCanUndo(history), canRedo: harmonyHistoryCanRedo(history), onStateChange: dispatch, onTransientStateChange: onStateChange, undo, redo, commitCommand }), [commitCommand, dispatch, history, onStateChange, redo, setView, undo, view]);
}
