import { MAX_ORBIT_TRIGGER_LINES } from './orbitSequencerMath';

export type OrbitSpeedMode = 'bpmPercent' | 'syncDivisor';
export type OrbitDirection = 'cw' | 'ccw';
export type OrbitPitchMode = 'fixedMidi' | 'harmonyDegree' | 'rangeSnap' | 'harmonyBloom';
export type OrbitTriggerLineCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type OrbitEvenReverseMode = 'off' | 'negativeHalf';
export type OrbitConstellationMode = 'auto' | 'golden' | 'fibonacci' | 'pythagorean' | 'harmonicRose' | 'euclidean';

export interface OrbitNoteConfig {
  id: string;
  enabled: boolean;
  radiusNorm: number;
  phase: number;
  speedMode: OrbitSpeedMode;
  speedValue: number;
  direction: OrbitDirection;
  pitchMode: OrbitPitchMode;
  midiNote: number;
  harmonyDegree: number;
  pitchRangeMin: number;
  pitchRangeMax: number;
  velocity: number;
  velocityRangeEnabled: boolean;
  velocityMin: number;
  velocityMax: number;
  gateBeats: number;
  gateRangeEnabled: boolean;
  gateMinBeats: number;
  gateMaxBeats: number;
  probability: number;
  targetSourceId: 'follow' | number;
  seed: number;
}

export interface OrbitSplineConfig {
  handle1: { x: number; y: number };
  handle2: { x: number; y: number };
  tip: { x: number; y: number };
  spinEnabled: boolean;
  spinDirection: OrbitDirection;
  baseAngle: number;
}

export interface OrbitSequencerConfig {
  enabled: boolean;
  targetSourceId: number;
  triggerLineCount: OrbitTriggerLineCount;
  clockMode: 'transport' | 'freeBpmPercent';
  bpmPercent: number;
  speedOffset: number;
  globalOffset: number;
  evenOffset: number;
  freeOffset: number;
  evenReverseMode: OrbitEvenReverseMode;
  constellationMode: OrbitConstellationMode;
  quantizedOffset: number;
  dragQuantize: boolean;
  quantizeToHarmony: boolean;
  snapSource: 'harmonyEngine';
  pitchRangeMin: number;
  pitchRangeMax: number;
  spline: OrbitSplineConfig;
  notes: OrbitNoteConfig[];
  seed: number;
}

export interface OrbitRuntimeViewState {
  baseLineAngle: number;
  lineAngles: number[];
  notePositions: Array<{ id: string; x: number; y: number; flash: number }>;
  lastTriggerIds: string[];
}

export interface OrbitRuntimeVisualState {
  noteCount: number;
  baseAngle: number;
  noteAngles: number[];
  noteFlashes: number[];
}

export const MAX_ORBIT_NOTES = 32;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function createDefaultOrbitNote(index: number, patch: Partial<OrbitNoteConfig> = {}): OrbitNoteConfig {
  const phase = finiteNumber(patch.phase, (Math.PI * 2 * index) / 8);
  return {
    id: patch.id ?? `orbit-note-${index + 1}`,
    enabled: patch.enabled ?? true,
    radiusNorm: clamp(finiteNumber(patch.radiusNorm, 0.36 + (index % 3) * 0.18), 0.08, 1),
    phase,
    speedMode: patch.speedMode ?? 'bpmPercent',
    speedValue: clamp(finiteNumber(patch.speedValue, 100), 0.125, 800),
    direction: patch.direction ?? 'cw',
    pitchMode: patch.pitchMode ?? 'fixedMidi',
    midiNote: clamp(finiteNumber(patch.midiNote, 60 + index), 0, 127),
    harmonyDegree: Math.round(finiteNumber(patch.harmonyDegree, index % 7)),
    pitchRangeMin: clamp(finiteNumber(patch.pitchRangeMin, 48), 0, 127),
    pitchRangeMax: clamp(finiteNumber(patch.pitchRangeMax, 84), 0, 127),
    velocity: clamp(finiteNumber(patch.velocity, 0.82), 0, 1),
    velocityRangeEnabled: patch.velocityRangeEnabled ?? false,
    velocityMin: clamp(finiteNumber(patch.velocityMin, 0.6), 0, 1),
    velocityMax: clamp(finiteNumber(patch.velocityMax, 1), 0, 1),
    gateBeats: clamp(finiteNumber(patch.gateBeats, 0.5), 0.05, 8),
    gateRangeEnabled: patch.gateRangeEnabled ?? false,
    gateMinBeats: clamp(finiteNumber(patch.gateMinBeats, 0.25), 0.05, 8),
    gateMaxBeats: clamp(finiteNumber(patch.gateMaxBeats, 0.75), 0.05, 8),
    probability: clamp(finiteNumber(patch.probability, 1), 0, 1),
    targetSourceId: patch.targetSourceId ?? 'follow',
    seed: Math.max(1, Math.round(finiteNumber(patch.seed, 2001 + index))),
  };
}

export function createDefaultOrbitSequencerConfig(slotIndex = 0): OrbitSequencerConfig {
  const demoNotes: Array<Partial<OrbitNoteConfig>> = [
    { radiusNorm: 0.375, phase: Math.PI * 1.5, midiNote: 60, pitchMode: 'harmonyBloom', speedMode: 'bpmPercent', speedValue: 100 },
    { radiusNorm: 0.65, phase: 0, midiNote: 64, pitchMode: 'harmonyBloom', speedMode: 'bpmPercent', speedValue: 100 },
    { radiusNorm: 0.9, phase: Math.PI * 0.5, midiNote: 67, pitchMode: 'harmonyBloom', speedMode: 'bpmPercent', speedValue: 100 },
  ];
  return {
    enabled: true,
    targetSourceId: 3,
    triggerLineCount: 1,
    clockMode: 'transport',
    bpmPercent: 100,
    speedOffset: 0,
    globalOffset: 0,
    evenOffset: 0,
    freeOffset: 0,
    evenReverseMode: 'off',
    constellationMode: 'auto',
    quantizedOffset: 4,
    dragQuantize: true,
    quantizeToHarmony: true,
    snapSource: 'harmonyEngine',
    pitchRangeMin: 48,
    pitchRangeMax: 84,
    spline: {
      handle1: { x: 0, y: -0.3 },
      handle2: { x: 0, y: -0.65 },
      tip: { x: 0, y: -1 },
      spinEnabled: false,
      spinDirection: 'cw',
      baseAngle: 0,
    },
    notes: demoNotes.map((note, index) => createDefaultOrbitNote(index, {
      ...note,
      harmonyDegree: (index * 2) % 7,
    })),
    seed: 3001 + slotIndex,
  };
}

function normalizePoint(value: unknown, fallback: { x: number; y: number }): { x: number; y: number } {
  const record = typeof value === 'object' && value !== null ? value as Partial<{ x: number; y: number }> : {};
  return {
    x: clamp(finiteNumber(record.x, fallback.x), -1.2, 1.2),
    y: clamp(finiteNumber(record.y, fallback.y), -1.2, 1.2),
  };
}

function normalizeOrbitNote(value: unknown, index: number, fallback: OrbitNoteConfig): OrbitNoteConfig {
  const record = typeof value === 'object' && value !== null ? value as Partial<OrbitNoteConfig> : {};
  const pitchRangeMin = clamp(finiteNumber(record.pitchRangeMin, fallback.pitchRangeMin), 0, 127);
  const pitchRangeMax = clamp(finiteNumber(record.pitchRangeMax, fallback.pitchRangeMax), pitchRangeMin, 127);
  const velocityMin = clamp(finiteNumber(record.velocityMin, fallback.velocityMin), 0, 1);
  const velocityMax = clamp(finiteNumber(record.velocityMax, fallback.velocityMax), velocityMin, 1);
  const gateMinBeats = clamp(finiteNumber(record.gateMinBeats, fallback.gateMinBeats), 0.05, 8);
  const gateMaxBeats = clamp(finiteNumber(record.gateMaxBeats, fallback.gateMaxBeats), gateMinBeats, 8);
  return createDefaultOrbitNote(index, {
    ...fallback,
    ...record,
    id: typeof record.id === 'string' && record.id.length > 0 ? record.id : fallback.id,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    speedMode: enumValue(record.speedMode, ['bpmPercent', 'syncDivisor'] as const, fallback.speedMode),
    direction: enumValue(record.direction, ['cw', 'ccw'] as const, fallback.direction),
    pitchMode: enumValue(record.pitchMode, ['fixedMidi', 'harmonyDegree', 'rangeSnap', 'harmonyBloom'] as const, fallback.pitchMode),
    velocityRangeEnabled: typeof record.velocityRangeEnabled === 'boolean' ? record.velocityRangeEnabled : fallback.velocityRangeEnabled,
    gateRangeEnabled: typeof record.gateRangeEnabled === 'boolean' ? record.gateRangeEnabled : fallback.gateRangeEnabled,
    pitchRangeMin,
    pitchRangeMax,
    velocityMin,
    velocityMax,
    gateMinBeats,
    gateMaxBeats,
    targetSourceId: record.targetSourceId === 'follow'
      ? 'follow'
      : Math.max(1, Math.min(7, Math.round(finiteNumber(record.targetSourceId, fallback.targetSourceId === 'follow' ? 3 : fallback.targetSourceId)))),
  });
}

export function normalizeOrbitSequencerConfig(value: unknown, slotIndex = 0): OrbitSequencerConfig {
  const fallback = createDefaultOrbitSequencerConfig(slotIndex);
  const rawRecord = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const record = rawRecord as Partial<OrbitSequencerConfig>;
  const pitchRangeMin = clamp(finiteNumber(record.pitchRangeMin, fallback.pitchRangeMin), 0, 127);
  const pitchRangeMax = clamp(finiteNumber(record.pitchRangeMax, fallback.pitchRangeMax), pitchRangeMin, 127);
  const rawNotes = Array.isArray(record.notes) ? record.notes.slice(0, MAX_ORBIT_NOTES) : fallback.notes;
  const rawSpline = typeof record.spline === 'object' && record.spline !== null ? record.spline as Partial<OrbitSplineConfig> : {};
  const legacyFreeLayout = rawRecord.pitchLayout === 'freeOrbit';
  const notes = rawNotes.map((note, index) => {
    const normalized = normalizeOrbitNote(note, index, fallback.notes[index] ?? createDefaultOrbitNote(index));
    return legacyFreeLayout
      ? {
        ...normalized,
        pitchMode: 'harmonyBloom' as const,
        speedMode: 'bpmPercent' as const,
        speedValue: 100,
      }
      : normalized;
  });
  return {
    ...fallback,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    targetSourceId: Math.max(1, Math.min(7, Math.round(finiteNumber(record.targetSourceId, fallback.targetSourceId)))),
    triggerLineCount: Math.max(1, Math.min(MAX_ORBIT_TRIGGER_LINES, Math.round(finiteNumber(record.triggerLineCount, fallback.triggerLineCount)))) as OrbitTriggerLineCount,
    clockMode: enumValue(record.clockMode, ['transport', 'freeBpmPercent'] as const, fallback.clockMode),
    bpmPercent: clamp(finiteNumber(record.bpmPercent, fallback.bpmPercent), 1, 800),
    speedOffset: clamp(finiteNumber(record.speedOffset, fallback.speedOffset), -1, 1),
    globalOffset: clamp(finiteNumber(record.globalOffset, fallback.globalOffset), -1, 1),
    evenOffset: clamp(finiteNumber(record.evenOffset, fallback.evenOffset), -1, 1),
    freeOffset: clamp(finiteNumber(record.freeOffset, fallback.freeOffset), -1, 1),
    evenReverseMode: enumValue(record.evenReverseMode, ['off', 'negativeHalf'] as const, fallback.evenReverseMode),
    constellationMode: enumValue(record.constellationMode, ['auto', 'golden', 'fibonacci', 'pythagorean', 'harmonicRose', 'euclidean'] as const, fallback.constellationMode),
    quantizedOffset: Math.max(1, Math.min(32, Math.round(finiteNumber(record.quantizedOffset, fallback.quantizedOffset)))),
    dragQuantize: typeof record.dragQuantize === 'boolean' ? record.dragQuantize : fallback.dragQuantize,
    quantizeToHarmony: typeof record.quantizeToHarmony === 'boolean' ? record.quantizeToHarmony : fallback.quantizeToHarmony,
    snapSource: 'harmonyEngine',
    pitchRangeMin,
    pitchRangeMax,
    spline: {
      handle1: normalizePoint(rawSpline.handle1, fallback.spline.handle1),
      handle2: normalizePoint(rawSpline.handle2, fallback.spline.handle2),
      tip: normalizePoint(rawSpline.tip, fallback.spline.tip),
      spinEnabled: typeof rawSpline.spinEnabled === 'boolean' ? rawSpline.spinEnabled : fallback.spline.spinEnabled,
      spinDirection: enumValue(rawSpline.spinDirection, ['cw', 'ccw'] as const, fallback.spline.spinDirection),
      baseAngle: finiteNumber(rawSpline.baseAngle, fallback.spline.baseAngle),
    },
    notes,
    seed: Math.max(1, Math.round(finiteNumber(record.seed, fallback.seed))),
  };
}
