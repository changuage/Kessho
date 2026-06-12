import { useCallback, useMemo, useState } from 'react';
import {
  MAX_ORBIT_NOTES,
  createDefaultOrbitNote,
  normalizeOrbitSequencerConfig,
  type OrbitNoteConfig,
  type OrbitSequencerConfig,
  type OrbitSplineConfig,
} from './orbitSequencerTypes';
import { wrapRadians } from './orbitSequencerMath';

export interface UseOrbitSequencerArgs {
  config: OrbitSequencerConfig;
  onChange: (config: OrbitSequencerConfig) => void;
}

function nextNoteId(notes: readonly OrbitNoteConfig[]): string {
  let maxIndex = 0;
  for (const note of notes) {
    const match = /(\d+)$/.exec(note.id);
    if (match) maxIndex = Math.max(maxIndex, Number.parseInt(match[1] ?? '0', 10));
  }
  return `orbit-note-${maxIndex + 1}`;
}

function hashUnit(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

const KIRLIAN_RADIUS_PITCHES = [48, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];

function pitchForRadius(radiusNorm: number): number {
  const index = Math.max(0, Math.min(
    KIRLIAN_RADIUS_PITCHES.length - 1,
    Math.floor(radiusNorm * (KIRLIAN_RADIUS_PITCHES.length - 1)),
  ));
  return KIRLIAN_RADIUS_PITCHES[index] ?? 60;
}

export function useOrbitSequencer({ config, onChange }: UseOrbitSequencerArgs) {
  const safeConfig = useMemo(() => normalizeOrbitSequencerConfig(config), [config]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const selectedNote = useMemo(() => (
    selectedNoteId ? safeConfig.notes.find((note) => note.id === selectedNoteId) ?? null : null
  ), [safeConfig.notes, selectedNoteId]);

  const updateConfig = useCallback((patch: Partial<OrbitSequencerConfig>) => {
    onChange(normalizeOrbitSequencerConfig({ ...safeConfig, ...patch }));
  }, [onChange, safeConfig]);

  const updateNote = useCallback((noteId: string, patch: Partial<OrbitNoteConfig>) => {
    updateConfig({
      notes: safeConfig.notes.map((note) => (
        note.id === noteId ? { ...note, ...patch } : note
      )),
    });
  }, [safeConfig.notes, updateConfig]);

  const addNote = useCallback((radiusNorm: number, phase: number) => {
    if (safeConfig.notes.length >= MAX_ORBIT_NOTES) return;
    const note = createDefaultOrbitNote(safeConfig.notes.length, {
      id: nextNoteId(safeConfig.notes),
      radiusNorm,
      phase: wrapRadians(phase),
      pitchMode: 'fixedMidi',
      midiNote: pitchForRadius(radiusNorm),
      speedMode: 'bpmPercent',
      speedValue: 100,
      seed: safeConfig.seed + safeConfig.notes.length + 1,
    });
    setSelectedNoteId(note.id);
    updateConfig({ notes: [...safeConfig.notes, note] });
  }, [safeConfig.notes, safeConfig.seed, updateConfig]);

  const moveNote = useCallback((noteId: string, radiusNorm: number, phase: number) => {
    updateNote(noteId, {
      radiusNorm: Math.max(0.06, Math.min(1, radiusNorm)),
      phase: wrapRadians(phase),
    });
  }, [updateNote]);

  const deleteSelected = useCallback(() => {
    if (!selectedNote) return;
    const nextNotes = safeConfig.notes.filter((note) => note.id !== selectedNote.id);
    setSelectedNoteId(null);
    updateConfig({ notes: nextNotes });
  }, [safeConfig.notes, selectedNote, updateConfig]);

  const updateSpline = useCallback((patch: Partial<OrbitSplineConfig>) => {
    updateConfig({
      spline: {
        ...safeConfig.spline,
        ...patch,
      },
    });
  }, [safeConfig.spline, updateConfig]);

  const toggleSplineSpin = useCallback(() => {
    updateConfig({
      spline: {
        ...safeConfig.spline,
        spinEnabled: !safeConfig.spline.spinEnabled,
        baseAngle: safeConfig.spline.spinEnabled ? 0 : safeConfig.spline.baseAngle,
      },
    });
  }, [safeConfig.spline, updateConfig]);

  const toggleSplineDirection = useCallback(() => {
    updateSpline({
      spinDirection: safeConfig.spline.spinDirection === 'cw' ? 'ccw' : 'cw',
    });
  }, [safeConfig.spline.spinDirection, updateSpline]);

  const straightenSpline = useCallback(() => {
    updateSpline({
      handle1: { x: 0, y: -0.3 },
      handle2: { x: 0, y: -0.65 },
      tip: { x: 0, y: -1 },
    });
  }, [updateSpline]);

  const duplicateSelected = useCallback(() => {
    if (!selectedNote || safeConfig.notes.length >= MAX_ORBIT_NOTES) return;
    const note = {
      ...selectedNote,
      id: nextNoteId(safeConfig.notes),
      phase: wrapRadians(selectedNote.phase + 0.21),
      radiusNorm: Math.max(0.06, Math.min(1, selectedNote.radiusNorm + 0.06)),
      seed: selectedNote.seed + 101,
    };
    setSelectedNoteId(note.id);
    updateConfig({ notes: [...safeConfig.notes, note] });
  }, [safeConfig.notes, selectedNote, updateConfig]);

  const randomizeOrbits = useCallback(() => {
    updateConfig({
      notes: safeConfig.notes.map((note, index) => {
        const a = hashUnit(safeConfig.seed + index * 17 + 1);
        const r = hashUnit(safeConfig.seed + index * 17 + 7);
        const s = hashUnit(safeConfig.seed + index * 17 + 11);
        return {
          ...note,
          phase: a * Math.PI * 2,
          radiusNorm: 0.18 + r * 0.78,
          speedValue: note.speedMode === 'syncDivisor'
            ? [1, 2, 3, 4, 6, 8][Math.floor(s * 6)] ?? 2
            : 50 + Math.round(s * 250),
        };
      }),
      seed: safeConfig.seed + 1,
    });
  }, [safeConfig.notes, safeConfig.seed, updateConfig]);

  const resetPhase = useCallback(() => {
    updateConfig({
      notes: safeConfig.notes.map((note, index) => ({
        ...note,
        phase: wrapRadians((Math.PI * 2 * index) / Math.max(1, safeConfig.notes.length)),
      })),
      spline: {
        ...safeConfig.spline,
        baseAngle: 0,
      },
    });
  }, [safeConfig.notes, safeConfig.spline, updateConfig]);

  const setTriggerLineCount = useCallback((count: 1 | 2 | 3 | 4 | 5) => {
    updateConfig({ triggerLineCount: count });
  }, [updateConfig]);

  return {
    config: safeConfig,
    selectedNote,
    selectedNoteId,
    setSelectedNoteId,
    updateConfig,
    updateNote,
    updateSpline,
    addNote,
    moveNote,
    deleteSelected,
    duplicateSelected,
    randomizeOrbits,
    resetPhase,
    setTriggerLineCount,
    toggleSplineSpin,
    toggleSplineDirection,
    straightenSpline,
  };
}
