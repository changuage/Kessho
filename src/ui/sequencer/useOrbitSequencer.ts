import { useCallback, useMemo, useState } from 'react';
import {
  MAX_ORBIT_NOTES,
  createDefaultOrbitNote,
  normalizeOrbitSequencerConfig,
  type OrbitNoteConfig,
  type OrbitPitchLayout,
  type OrbitSequencerConfig,
  type OrbitSplineConfig,
  type OrbitTriggerLineCount,
} from './orbitSequencerTypes';
import { TAU, snapOrbitPhase, wrapRadians } from './orbitSequencerMath';

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

export function orbitHashUnit(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

const KIRLIAN_RADIUS_PITCHES = [48, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
export const ORBIT_LOOP_BEAT_OPTIONS = [1, 2, 4, 8, 16] as const;
export const ORBIT_BLOOM_NOTE_OPTIONS = [3, 5, 8, 13, 21, 32] as const;
export const ORBIT_QUANTIZED_OFFSET_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 12, 13, 16, 21, 32] as const;

function pitchForRadius(radiusNorm: number): number {
  const index = Math.max(0, Math.min(
    KIRLIAN_RADIUS_PITCHES.length - 1,
    Math.floor(radiusNorm * (KIRLIAN_RADIUS_PITCHES.length - 1)),
  ));
  return KIRLIAN_RADIUS_PITCHES[index] ?? 60;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loopBeatsToBpmPercent(loopBeats: number): number {
  return clamp(400 / Math.max(0.5, loopBeats), 1, 800);
}

export function loopBeatsFromBpmPercent(bpmPercent: number): number {
  const raw = 400 / clamp(bpmPercent, 1, 800);
  return ORBIT_LOOP_BEAT_OPTIONS.reduce((best, option) => (
    Math.abs(option - raw) < Math.abs(best - raw) ? option : best
  ), ORBIT_LOOP_BEAT_OPTIONS[2]);
}

function bloomRadius(index: number, count: number): number {
  if (count <= 1) return 0.5;
  return clamp(0.24 + (index / (count - 1)) * 0.7, 0.08, 1);
}

function bloomPhase(index: number, count: number): number {
  return wrapRadians((index * TAU) / Math.max(1, count));
}

function quantizedOffsetForNodeCount(count: number): number | null {
  return ORBIT_QUANTIZED_OFFSET_OPTIONS.includes(count as (typeof ORBIT_QUANTIZED_OFFSET_OPTIONS)[number])
    ? count
    : null;
}

function notePatchForLayout(note: OrbitNoteConfig, layout: OrbitPitchLayout): Partial<OrbitNoteConfig> {
  if (layout === 'harmonyBloom') {
    return {
      pitchMode: 'harmonyBloom',
      speedMode: 'bpmPercent',
      speedValue: 100,
    };
  }
  if (note.pitchMode === 'harmonyBloom') {
    return {
      pitchMode: 'fixedMidi',
      midiNote: pitchForRadius(note.radiusNorm),
    };
  }
  return {};
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
    const isBloomLayout = safeConfig.pitchLayout === 'harmonyBloom';
    const note = createDefaultOrbitNote(safeConfig.notes.length, {
      id: nextNoteId(safeConfig.notes),
      radiusNorm,
      phase: wrapRadians(phase),
      pitchMode: isBloomLayout ? 'harmonyBloom' : 'fixedMidi',
      midiNote: pitchForRadius(radiusNorm),
      speedMode: 'bpmPercent',
      speedValue: 100,
      seed: safeConfig.seed + safeConfig.notes.length + 1,
    });
    setSelectedNoteId(note.id);
    updateConfig({ notes: [...safeConfig.notes, note] });
  }, [safeConfig.notes, safeConfig.pitchLayout, safeConfig.seed, updateConfig]);

  const makeBloomNote = useCallback((index: number, count: number, patch: Partial<OrbitNoteConfig> = {}) => {
    const radiusNorm = patch.radiusNorm ?? bloomRadius(index, count);
    return createDefaultOrbitNote(index, {
      id: patch.id ?? `orbit-note-${index + 1}`,
      radiusNorm,
      phase: patch.phase ?? bloomPhase(index, count),
      pitchMode: patch.pitchMode ?? (safeConfig.pitchLayout === 'harmonyBloom' ? 'harmonyBloom' : 'fixedMidi'),
      midiNote: patch.midiNote ?? pitchForRadius(radiusNorm),
      speedMode: patch.speedMode ?? 'bpmPercent',
      speedValue: patch.speedValue ?? 100,
      seed: patch.seed ?? (safeConfig.seed + index + 1),
      ...patch,
    });
  }, [safeConfig.pitchLayout, safeConfig.seed]);

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

  const setLoopBeats = useCallback((loopBeats: number) => {
    updateConfig({ bpmPercent: loopBeatsToBpmPercent(loopBeats) });
  }, [updateConfig]);

  const setSpeedOffset = useCallback((speedOffset: number) => {
    updateConfig({ speedOffset: clamp(speedOffset, -0.9, 1) });
  }, [updateConfig]);

  const setBloomNoteCount = useCallback((count: number) => {
    const nextCount = Math.max(1, Math.min(MAX_ORBIT_NOTES, Math.round(count)));
    const nextQuantizedOffset = quantizedOffsetForNodeCount(nextCount);
    const nextNotes = Array.from({ length: nextCount }, (_, index) => {
      const existing = safeConfig.notes[index];
      const radiusNorm = bloomRadius(index, nextCount);
      if (existing) {
        return {
          ...existing,
          ...notePatchForLayout(existing, safeConfig.pitchLayout),
          radiusNorm,
          phase: bloomPhase(index, nextCount),
        };
      }
      return makeBloomNote(index, nextCount);
    });
    setSelectedNoteId((current) => (
      current && nextNotes.some((note) => note.id === current) ? current : null
    ));
    updateConfig({
      notes: nextNotes,
      ...(nextQuantizedOffset !== null ? { quantizedOffset: nextQuantizedOffset } : {}),
    });
  }, [makeBloomNote, safeConfig.notes, safeConfig.pitchLayout, updateConfig]);

  const rebloomNotes = useCallback(() => {
    const count = Math.max(1, safeConfig.notes.length);
    const nextQuantizedOffset = quantizedOffsetForNodeCount(count);
    updateConfig({
      notes: safeConfig.notes.map((note, index) => ({
        ...note,
        ...notePatchForLayout(note, safeConfig.pitchLayout),
        radiusNorm: bloomRadius(index, count),
        phase: bloomPhase(index, count),
        midiNote: note.pitchMode === 'fixedMidi' ? pitchForRadius(bloomRadius(index, count)) : note.midiNote,
      })),
      ...(nextQuantizedOffset !== null ? { quantizedOffset: nextQuantizedOffset } : {}),
    });
  }, [safeConfig.notes, safeConfig.pitchLayout, updateConfig]);

  const setPitchLayout = useCallback((pitchLayout: OrbitPitchLayout) => {
    updateConfig({
      pitchLayout,
      notes: safeConfig.notes.map((note) => ({
        ...note,
        ...notePatchForLayout(note, pitchLayout),
      })),
    });
  }, [safeConfig.notes, updateConfig]);

  const toggleDragQuantize = useCallback(() => {
    const nextDragQuantize = !safeConfig.dragQuantize;
    const nextQuantizedOffset = nextDragQuantize
      ? quantizedOffsetForNodeCount(safeConfig.notes.length) ?? safeConfig.quantizedOffset
      : safeConfig.quantizedOffset;
    updateConfig({
      dragQuantize: nextDragQuantize,
      quantizedOffset: nextQuantizedOffset,
      notes: nextDragQuantize
        ? safeConfig.notes.map((note) => ({
          ...note,
          phase: snapOrbitPhase(note.phase, nextQuantizedOffset),
        }))
        : safeConfig.notes,
    });
  }, [safeConfig.dragQuantize, safeConfig.notes, safeConfig.quantizedOffset, updateConfig]);

  const setQuantizedOffset = useCallback((quantizedOffset: number) => {
    const division = Math.max(1, Math.min(32, Math.round(quantizedOffset)));
    updateConfig({
      quantizedOffset: division,
      notes: safeConfig.notes.map((note, index) => ({
        ...note,
        phase: wrapRadians(((index % division) * TAU) / division),
      })),
    });
  }, [safeConfig.notes, updateConfig]);

  const setEvenOffset = useCallback((evenOffset: number) => {
    const next = clamp(evenOffset, -1, 1);
    const delta = next - safeConfig.evenOffset;
    updateConfig({
      evenOffset: next,
      notes: safeConfig.notes.map((note, index) => ({
        ...note,
        phase: index % 2 === 1 ? wrapRadians(note.phase + delta * TAU) : note.phase,
      })),
    });
  }, [safeConfig.evenOffset, safeConfig.notes, updateConfig]);

  const setFreeOffset = useCallback((freeOffset: number) => {
    const next = clamp(freeOffset, 0, 1);
    const delta = next - safeConfig.freeOffset;
    updateConfig({
      freeOffset: next,
      notes: safeConfig.notes.map((note, index) => {
        const jitter = orbitHashUnit(safeConfig.seed + index * 97 + 41) - 0.5;
        return {
          ...note,
          phase: wrapRadians(note.phase + delta * jitter * TAU),
        };
      }),
    });
  }, [safeConfig.freeOffset, safeConfig.notes, safeConfig.seed, updateConfig]);

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

  const invertDirections = useCallback(() => {
    updateConfig({
      notes: safeConfig.notes.map((note) => ({
        ...note,
        direction: note.direction === 'cw' ? 'ccw' : 'cw',
      })),
    });
  }, [safeConfig.notes, updateConfig]);

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
        const a = orbitHashUnit(safeConfig.seed + index * 17 + 1);
        const r = orbitHashUnit(safeConfig.seed + index * 17 + 7);
        const s = orbitHashUnit(safeConfig.seed + index * 17 + 11);
        return {
          ...note,
          phase: a * Math.PI * 2,
          radiusNorm: 0.18 + r * 0.78,
          speedValue: safeConfig.pitchLayout === 'harmonyBloom'
            ? note.speedValue
            : (
              note.speedMode === 'syncDivisor'
                ? [1, 2, 3, 4, 6, 8][Math.floor(s * 6)] ?? 2
                : 50 + Math.round(s * 250)
            ),
        };
      }),
      seed: safeConfig.seed + 1,
    });
  }, [safeConfig.notes, safeConfig.pitchLayout, safeConfig.seed, updateConfig]);

  const resetPhase = useCallback(() => {
    const nextQuantizedOffset = quantizedOffsetForNodeCount(safeConfig.notes.length);
    updateConfig({
      notes: safeConfig.notes.map((note, index) => ({
        ...note,
        phase: wrapRadians((Math.PI * 2 * index) / Math.max(1, safeConfig.notes.length)),
      })),
      spline: {
        ...safeConfig.spline,
        baseAngle: 0,
      },
      ...(nextQuantizedOffset !== null ? { quantizedOffset: nextQuantizedOffset } : {}),
    });
  }, [safeConfig.notes, safeConfig.spline, updateConfig]);

  const setTriggerLineCount = useCallback((count: OrbitTriggerLineCount) => {
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
    setPitchLayout,
    setLoopBeats,
    setSpeedOffset,
    setBloomNoteCount,
    rebloomNotes,
    setQuantizedOffset,
    setEvenOffset,
    setFreeOffset,
    toggleDragQuantize,
    addNote,
    moveNote,
    deleteSelected,
    duplicateSelected,
    randomizeOrbits,
    resetPhase,
    setTriggerLineCount,
    toggleSplineSpin,
    toggleSplineDirection,
    invertDirections,
    straightenSpline,
  };
}
