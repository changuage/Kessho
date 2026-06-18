import { useCallback, useMemo, useState } from 'react';
import {
  MAX_ORBIT_NOTES,
  createDefaultOrbitNote,
  normalizeOrbitSequencerConfig,
  type OrbitConstellationMode,
  type OrbitEvenReverseMode,
  type OrbitNoteConfig,
  type OrbitSequencerConfig,
  type OrbitSplineConfig,
  type OrbitTriggerLineCount,
} from './orbitSequencerTypes';
import { generateOrbitConstellation } from './orbitConstellation';
import {
  TAU,
  clampUnitOffset,
  isUserVisibleEvenOrbitNode,
  oppositeOrbitDirection,
  orbitAuthoredPhaseFromVisual,
  orbitHashUnit,
  orbitVisualPhase,
  snapOrbitPhase,
  wrapRadians,
} from './orbitSequencerMath';

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

const KIRLIAN_RADIUS_PITCHES = [48, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
export const ORBIT_LOOP_BEAT_OPTIONS = [1, 2, 4, 8, 16] as const;
export const ORBIT_BLOOM_NOTE_OPTIONS = [3, 5, 8, 13, 21, 32] as const;
export const ORBIT_QUANTIZED_OFFSET_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 12, 13, 16, 21, 32] as const;
const ORBIT_CONSTELLATION_BLOOM_MIN_NOTES = 13;
const STRAIGHT_NODE_VISUAL_PHASE = Math.PI * 0.5;

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

export function loopBeatsToBpmPercent(loopBeats: number): number {
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

function shouldUseConstellationBloom(count: number): boolean {
  return count >= ORBIT_CONSTELLATION_BLOOM_MIN_NOTES;
}

function quantizedOffsetForNodeCount(count: number): number | null {
  return ORBIT_QUANTIZED_OFFSET_OPTIONS.includes(count as (typeof ORBIT_QUANTIZED_OFFSET_OPTIONS)[number])
    ? count
    : null;
}

function normalizeUiOrbitConfig(value: OrbitSequencerConfig): OrbitSequencerConfig {
  const normalized = normalizeOrbitSequencerConfig(value);
  return normalized.globalOffset === 0 ? normalized : { ...normalized, globalOffset: 0 };
}

function orbitVisualPhaseArgs(config: OrbitSequencerConfig, index: number) {
  return {
    index,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  };
}

function bloomNotePatch(): Partial<OrbitNoteConfig> {
  return {
    pitchMode: 'harmonyBloom',
    speedMode: 'bpmPercent',
    speedValue: 100,
  };
}

export function useOrbitSequencer({ config, onChange }: UseOrbitSequencerArgs) {
  const safeConfig = useMemo(() => normalizeUiOrbitConfig(config), [config]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const selectedNote = useMemo(() => (
    selectedNoteId ? safeConfig.notes.find((note) => note.id === selectedNoteId) ?? null : null
  ), [safeConfig.notes, selectedNoteId]);

  const updateConfig = useCallback((patch: Partial<OrbitSequencerConfig>) => {
    onChange(normalizeUiOrbitConfig({ ...safeConfig, ...patch }));
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
      pitchMode: 'harmonyBloom',
      midiNote: pitchForRadius(radiusNorm),
      speedMode: 'bpmPercent',
      speedValue: 100,
      seed: safeConfig.seed + safeConfig.notes.length + 1,
    });
    setSelectedNoteId(note.id);
    updateConfig({ notes: [...safeConfig.notes, note] });
  }, [safeConfig.notes, safeConfig.seed, updateConfig]);

  const makeBloomNote = useCallback((index: number, count: number, patch: Partial<OrbitNoteConfig> = {}) => {
    const radiusNorm = patch.radiusNorm ?? bloomRadius(index, count);
    return createDefaultOrbitNote(index, {
      id: patch.id ?? `orbit-note-${index + 1}`,
      radiusNorm,
      phase: patch.phase ?? bloomPhase(index, count),
      pitchMode: patch.pitchMode ?? 'harmonyBloom',
      midiNote: patch.midiNote ?? pitchForRadius(radiusNorm),
      speedMode: patch.speedMode ?? 'bpmPercent',
      speedValue: patch.speedValue ?? 100,
      seed: patch.seed ?? (safeConfig.seed + index + 1),
      ...patch,
    });
  }, [safeConfig.seed]);

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
    updateConfig({
      clockMode: 'freeBpmPercent',
      bpmPercent: loopBeatsToBpmPercent(loopBeats),
    });
  }, [updateConfig]);

  const setSpeedOffset = useCallback((speedOffset: number) => {
    updateConfig({ speedOffset: clampUnitOffset(speedOffset) });
  }, [updateConfig]);

  const setBloomNoteCount = useCallback((count: number) => {
    const nextCount = Math.max(1, Math.min(MAX_ORBIT_NOTES, Math.round(count)));
    const nextQuantizedOffset = quantizedOffsetForNodeCount(nextCount);
    const constellationPoints = shouldUseConstellationBloom(nextCount)
      ? generateOrbitConstellation({
        mode: safeConfig.constellationMode,
        seed: safeConfig.seed,
        nodeCount: nextCount,
        pitchRangeMin: safeConfig.pitchRangeMin,
        pitchRangeMax: safeConfig.pitchRangeMax,
      })
      : null;
    const nextNotes = Array.from({ length: nextCount }, (_, index) => {
      const existing = safeConfig.notes[index];
      const point = constellationPoints?.[index] ?? null;
      const radiusNorm = point?.radiusNorm ?? bloomRadius(index, nextCount);
      const phase = point?.phase ?? bloomPhase(index, nextCount);
      if (existing) {
        return {
          ...existing,
          ...bloomNotePatch(),
          radiusNorm,
          phase,
          ...(point
            ? {
              harmonyDegree: point.harmonyDegree,
              midiNote: existing.pitchMode === 'fixedMidi' ? point.midiNote : existing.midiNote,
              speedValue: point.speedValue ?? existing.speedValue,
              direction: point.direction ?? existing.direction,
            }
            : {}),
        };
      }
      return makeBloomNote(index, nextCount, point
        ? {
          radiusNorm,
          phase,
          harmonyDegree: point.harmonyDegree,
          midiNote: point.midiNote,
          speedValue: point.speedValue,
          direction: point.direction,
        }
        : {});
    });
    setSelectedNoteId((current) => (
      current && nextNotes.some((note) => note.id === current) ? current : null
    ));
    updateConfig({
      notes: nextNotes,
      ...(nextQuantizedOffset !== null ? { quantizedOffset: nextQuantizedOffset } : {}),
    });
  }, [
    makeBloomNote,
    safeConfig.constellationMode,
    safeConfig.notes,
    safeConfig.pitchRangeMax,
    safeConfig.pitchRangeMin,
    safeConfig.seed,
    updateConfig,
  ]);

  const rebloomNotes = useCallback(() => {
    const count = Math.max(1, safeConfig.notes.length);
    const nextQuantizedOffset = quantizedOffsetForNodeCount(count);
    const constellationPoints = shouldUseConstellationBloom(count)
      ? generateOrbitConstellation({
        mode: safeConfig.constellationMode,
        seed: safeConfig.seed,
        nodeCount: count,
        pitchRangeMin: safeConfig.pitchRangeMin,
        pitchRangeMax: safeConfig.pitchRangeMax,
      })
      : null;
    updateConfig({
      notes: safeConfig.notes.map((note, index) => {
        const point = constellationPoints?.[index] ?? null;
        const radiusNorm = point?.radiusNorm ?? bloomRadius(index, count);
        return {
          ...note,
          ...bloomNotePatch(),
          radiusNorm,
          phase: point?.phase ?? bloomPhase(index, count),
          harmonyDegree: point?.harmonyDegree ?? note.harmonyDegree,
          midiNote: note.pitchMode === 'fixedMidi'
            ? point?.midiNote ?? pitchForRadius(radiusNorm)
            : note.midiNote,
          speedValue: point?.speedValue ?? note.speedValue,
          direction: point?.direction ?? note.direction,
        };
      }),
      ...(nextQuantizedOffset !== null ? { quantizedOffset: nextQuantizedOffset } : {}),
    });
  }, [
    safeConfig.constellationMode,
    safeConfig.notes,
    safeConfig.pitchRangeMax,
    safeConfig.pitchRangeMin,
    safeConfig.seed,
    updateConfig,
  ]);

  const toggleDragQuantize = useCallback(() => {
    const nextDragQuantize = !safeConfig.dragQuantize;
    const nextQuantizedOffset = nextDragQuantize
      ? quantizedOffsetForNodeCount(safeConfig.notes.length) ?? safeConfig.quantizedOffset
      : safeConfig.quantizedOffset;
    updateConfig({
      dragQuantize: nextDragQuantize,
      quantizedOffset: nextQuantizedOffset,
    });
  }, [safeConfig.dragQuantize, safeConfig.notes, safeConfig.quantizedOffset, updateConfig]);

  const spaceNotesByQuantizedOffset = useCallback((quantizedOffset = safeConfig.quantizedOffset) => {
    const notes = safeConfig.notes;
    if (notes.length === 0) return;
    const division = Math.max(1, Math.min(32, Math.round(quantizedOffset)));
    const anchorVisualPhase = orbitVisualPhase(notes[0]!.phase, orbitVisualPhaseArgs(safeConfig, 0));
    updateConfig({
      quantizedOffset: division,
      notes: notes.map((note, index) => {
        const visualPhase = wrapRadians(anchorVisualPhase + (TAU * index) / division);
        return {
          ...note,
          phase: orbitAuthoredPhaseFromVisual(visualPhase, orbitVisualPhaseArgs(safeConfig, index)),
        };
      }),
    });
  }, [safeConfig, updateConfig]);

  const quantizeNotesToGrid = useCallback(() => {
    updateConfig({
      notes: safeConfig.notes.map((note, index) => {
        const visualPhase = orbitVisualPhase(note.phase, orbitVisualPhaseArgs(safeConfig, index));
        const snappedVisualPhase = snapOrbitPhase(visualPhase, safeConfig.quantizedOffset);
        return {
          ...note,
          phase: orbitAuthoredPhaseFromVisual(snappedVisualPhase, orbitVisualPhaseArgs(safeConfig, index)),
        };
      }),
    });
  }, [safeConfig.evenOffset, safeConfig.freeOffset, safeConfig.globalOffset, safeConfig.notes, safeConfig.quantizedOffset, safeConfig.seed, updateConfig]);

  const setEvenOffset = useCallback((evenOffset: number) => {
    updateConfig({ evenOffset: clampUnitOffset(evenOffset) });
  }, [updateConfig]);

  const setFreeOffset = useCallback((freeOffset: number) => {
    updateConfig({ freeOffset: clampUnitOffset(freeOffset) });
  }, [updateConfig]);

  const setEvenReverseMode = useCallback((evenReverseMode: OrbitEvenReverseMode) => {
    updateConfig({ evenReverseMode });
  }, [updateConfig]);

  const setConstellationMode = useCallback((constellationMode: OrbitConstellationMode) => {
    updateConfig({ constellationMode });
  }, [updateConfig]);

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
        direction: oppositeOrbitDirection(note.direction),
      })),
    });
  }, [safeConfig.notes, updateConfig]);

  const invertEvenDirections = useCallback(() => {
    updateConfig({
      notes: safeConfig.notes.map((note, index) => (
        isUserVisibleEvenOrbitNode(index)
          ? { ...note, direction: oppositeOrbitDirection(note.direction) }
          : note
      )),
    });
  }, [safeConfig.notes, updateConfig]);

  const invertOddDirections = useCallback(() => {
    updateConfig({
      notes: safeConfig.notes.map((note, index) => (
        !isUserVisibleEvenOrbitNode(index)
          ? { ...note, direction: oppositeOrbitDirection(note.direction) }
          : note
      )),
    });
  }, [safeConfig.notes, updateConfig]);

  const straightenSpline = useCallback(() => {
    updateConfig({
      globalOffset: 0,
      evenOffset: 0,
      freeOffset: 0,
      spline: {
        ...safeConfig.spline,
        handle1: { x: 0, y: -1 / 3 },
        handle2: { x: 0, y: -2 / 3 },
        tip: { x: 0, y: -1 },
        spinEnabled: false,
        baseAngle: 0,
      },
      notes: safeConfig.notes.map((note) => ({
        ...note,
        phase: STRAIGHT_NODE_VISUAL_PHASE,
      })),
    });
  }, [safeConfig.notes, safeConfig.spline, updateConfig]);

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
        return {
          ...note,
          phase: a * Math.PI * 2,
          radiusNorm: 0.18 + r * 0.78,
          speedValue: note.speedValue,
        };
      }),
      seed: safeConfig.seed + 1,
    });
  }, [safeConfig.notes, safeConfig.seed, updateConfig]);

  const constellateNotes = useCallback((mode: OrbitConstellationMode = safeConfig.constellationMode) => {
    const count = Math.max(1, safeConfig.notes.length);
    const points = generateOrbitConstellation({
      mode,
      seed: safeConfig.seed + 1,
      nodeCount: count,
      pitchRangeMin: safeConfig.pitchRangeMin,
      pitchRangeMax: safeConfig.pitchRangeMax,
    });
    updateConfig({
      notes: safeConfig.notes.map((note, index) => {
        const point = points[index];
        if (!point) return note;
        return {
          ...note,
          radiusNorm: point.radiusNorm,
          phase: point.phase,
          harmonyDegree: point.harmonyDegree,
          midiNote: note.pitchMode === 'fixedMidi' ? point.midiNote : note.midiNote,
          speedValue: point.speedValue ?? note.speedValue,
          direction: point.direction ?? note.direction,
        };
      }),
      seed: safeConfig.seed + 1,
    });
  }, [safeConfig.constellationMode, safeConfig.notes, safeConfig.pitchRangeMax, safeConfig.pitchRangeMin, safeConfig.seed, updateConfig]);

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
    setLoopBeats,
    setSpeedOffset,
    setBloomNoteCount,
    rebloomNotes,
    spaceNotesByQuantizedOffset,
    quantizeNotesToGrid,
    setEvenOffset,
    setFreeOffset,
    setEvenReverseMode,
    setConstellationMode,
    toggleDragQuantize,
    addNote,
    moveNote,
    deleteSelected,
    duplicateSelected,
    randomizeOrbits,
    constellateNotes,
    resetPhase,
    setTriggerLineCount,
    toggleSplineSpin,
    toggleSplineDirection,
    invertDirections,
    invertEvenDirections,
    invertOddDirections,
    straightenSpline,
  };
}
