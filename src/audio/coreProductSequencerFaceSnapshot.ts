import { normalizeSynthSequencerFaceState, type SequencerMode } from '../ui/sequencer/sequencerModeTypes';
import type { AnchorWalkerConfig, AnchorWalkerLayerConfig, SnapSource, WalkerBoundaryMode, WalkerPlayMode, WalkerTriggerMode } from '../ui/sequencer/anchorWalkerTypes';
import type { OrbitNoteConfig, OrbitSequencerConfig } from '../ui/sequencer/orbitSequencerTypes';
import type { ProductAnchorWalkerLayerSnapshot, ProductAnchorWalkerSnapshot, ProductOrbitNoteSnapshot, ProductOrbitSequencerSnapshot } from './coreProductSnapshotTypes';
import { clamp } from './coreProductSnapshotState';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';

export const SEQUENCER_MODE_IDS: Record<SequencerMode, number> = {
  euclid: 0,
  anchorWalker: 1,
  orbit: 2,
};

const ANCHOR_WALKER_MODE_IDS = {
  hybrid: 0,
  compactPad: 1,
} as const;

const WALKER_PLAY_MODE_IDS: Record<WalkerPlayMode, number> = {
  hybridPlay: 0,
  gridPattern: 1,
};

const ANCHOR_SOURCE_IDS = {
  harmonyRoot: 0,
  manualLatch: 3,
} as const;

const PRODUCT_SEQUENCER_MIN_SOURCE_ID = CORE_PRODUCT_SOURCE_IDS.pad1;
const PRODUCT_SEQUENCER_MAX_SOURCE_ID = CORE_PRODUCT_SOURCE_IDS.sample2;

const SNAP_SOURCE_IDS: Record<SnapSource, number> = {
  harmonyEngine: 0,
  manualVoicing: 1,
  chordStep: 2,
  customPitchClasses: 3,
  liveBlueKeys: 4,
};

const WALKER_TRIGGER_MODE_IDS: Record<WalkerTriggerMode, number> = {
  gestureHold: 0,
  stepGrid: 1,
  autoClock: 2,
};

const WALKER_BOUNDARY_MODE_IDS: Record<WalkerBoundaryMode, number> = {
  fold: 0,
  wrap: 1,
  clamp: 2,
};

const WALKER_LAYER_PRESET_IDS: Record<string, number> = {
  solo: 0,
  openFifths: 1,
  triadRoll: 2,
  seventhCloud: 3,
  wideFour: 4,
  wideFourRoll: 5,
  counterWalker: 6,
};

const WALKER_LAYER_TUNING_IDS = {
  rawTranspose: 0,
  snapAfterTranspose: 1,
  diatonicOffset: 2,
} as const;

const WALKER_LAYER_MOTION_IDS = {
  linked: 0,
  inverted: 1,
} as const;

const ORBIT_SPEED_MODE_IDS = {
  bpmPercent: 0,
  syncDivisor: 1,
} as const;

const ORBIT_PITCH_MODE_IDS = {
  fixedMidi: 0,
  harmonyDegree: 1,
  rangeSnap: 2,
  harmonyBloom: 3,
} as const;

const ORBIT_EVEN_REVERSE_MODE_IDS = {
  off: 0,
  negativeHalf: 1,
} as const;

const ORBIT_CONSTELLATION_MODE_IDS = {
  auto: 0,
  golden: 1,
  fibonacci: 2,
  pythagorean: 3,
  harmonicRose: 4,
  euclidean: 5,
} as const;

function productSourceIdFromAlias(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const source = value.trim().toLowerCase();
  if (source === 'pad' || source === 'pad1') return CORE_PRODUCT_SOURCE_IDS.pad1;
  if (source === 'pad2') return CORE_PRODUCT_SOURCE_IDS.pad2;
  if (source === 'lead' || source === 'lead1') return CORE_PRODUCT_SOURCE_IDS.lead1;
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'sample1') return CORE_PRODUCT_SOURCE_IDS.sample1;
  if (source === 'sample2') return CORE_PRODUCT_SOURCE_IDS.sample2;
  return null;
}

function productSourceId(value: unknown): number {
  const aliasSourceId = productSourceIdFromAlias(value);
  if (aliasSourceId != null) return aliasSourceId;
  const numericValue = typeof value === 'number' && Number.isFinite(value)
    ? value
    : CORE_PRODUCT_SOURCE_IDS.lead1;
  return Math.round(clamp(numericValue, PRODUCT_SEQUENCER_MIN_SOURCE_ID, PRODUCT_SEQUENCER_MAX_SOURCE_ID));
}

function pitchClassMaskFromClasses(classes: readonly number[]): number {
  let mask = 0;
  for (const pitchClass of classes) {
    const bit = ((Math.round(pitchClass) % 12) + 12) % 12;
    mask |= 1 << bit;
  }
  return mask || 0x0fff;
}

function fixedPattern(pattern: readonly number[], length: number): number[] {
  return Array.from({ length: 16 }, (_, index) => (
    index < Math.min(Math.max(1, length), 16)
      ? Math.round(clamp(pattern[index] ?? pattern[0] ?? 1, -7, 7))
      : 0
  ));
}

function productAnchorWalkerLayer(layer: AnchorWalkerLayerConfig): ProductAnchorWalkerLayerSnapshot {
  return {
    enabled: layer.enabled,
    transposeSemitones: Math.round(clamp(layer.transposeSemitones, -48, 48)),
    diatonicOffset: Math.round(clamp(layer.diatonicOffset, -14, 14)),
    tuning: WALKER_LAYER_TUNING_IDS[layer.tuning] ?? 2,
    motion: WALKER_LAYER_MOTION_IDS[layer.motion] ?? 0,
    delaySeconds: clamp(layer.delayMs, 0, 500) / 1000,
    gateRatio: clamp(layer.gateRatio, 0.05, 1),
    velocityScale: clamp(layer.velocityScale, 0, 2),
    velocityOffset: clamp(layer.velocityOffset, -1, 1),
    targetSourceId: layer.targetSourceId === 'follow' ? 0 : productSourceId(layer.targetSourceId),
  };
}

export function productAnchorWalkerFromConfig(
  config: AnchorWalkerConfig,
  slotIndex: number,
  targetSourceId = config.targetSourceId,
): ProductAnchorWalkerSnapshot {
  const snapSource = config.snapSource === 'customPitchClasses' ? 'customPitchClasses' : 'harmonyEngine';
  const triggerMode = config.playMode === 'gridPattern' ? 'stepGrid' : 'gestureHold';
  const layers = Array.from({ length: 4 }, (_, index) => productAnchorWalkerLayer(
    config.layers[index] ?? config.layers[0] ?? {
      id: `fallback-${index}`,
      enabled: index === 0,
      label: `L${index + 1}`,
      transposeSemitones: 0,
      diatonicOffset: 0,
      tuning: 'diatonicOffset',
      motion: 'linked',
      delayMs: index * config.spreadMs,
      gateRatio: 0.75,
      velocityScale: 1,
      velocityOffset: 0,
      targetSourceId: 'follow',
    },
  ));
  return {
    enabled: config.enabled,
    mode: ANCHOR_WALKER_MODE_IDS[config.mode] ?? 0,
    playMode: WALKER_PLAY_MODE_IDS[config.playMode] ?? 0,
    targetSourceId: productSourceId(targetSourceId),
    anchorSource: ANCHOR_SOURCE_IDS[config.anchorSource] ?? 0,
    manualAnchorMidi: clamp(config.manualAnchorMidi, 0, 127),
    snapSource: SNAP_SOURCE_IDS[snapSource] ?? 0,
    customPitchClassMask: pitchClassMaskFromClasses(config.customPitchClasses),
    triggerMode: WALKER_TRIGGER_MODE_IDS[triggerMode] ?? 0,
    boundaryMode: WALKER_BOUNDARY_MODE_IDS[config.boundaryMode] ?? 0,
    keyboardRange: 0,
    showLinkedOutputs: false,
    autoRate: 0,
    autoFeel: 0,
    swing: 0,
    leadMode: false,
    mwToVelocity: false,
    pitchWheelWalk: false,
    gesturePattern: fixedPattern(config.gesturePattern, config.gesturePatternLength),
    gesturePatternLength: Math.round(clamp(config.gesturePatternLength, 1, 16)),
    activePadDelta: Math.round(clamp(config.activePadDelta, -7, 7)),
    layerPreset: WALKER_LAYER_PRESET_IDS[config.layerPreset] ?? 0,
    spreadSeconds: clamp(config.spreadMs, 0, 500) / 1000,
    layerCount: layers.filter((layer) => layer.enabled).length || 1,
    layers,
    outputRangeMin: clamp(config.outputRangeMin, 0, 127),
    outputRangeMax: clamp(config.outputRangeMax, config.outputRangeMin, 127),
    seed: Math.max(1, Math.round(config.seed || (1001 + slotIndex))),
  };
}

function productOrbitNoteFromConfig(note: OrbitNoteConfig, index: number): ProductOrbitNoteSnapshot {
  const velocityMin = clamp(note.velocityMin, 0, 1);
  const gateMin = clamp(note.gateMinBeats, 0.05, 8);
  const pitchMin = clamp(note.pitchRangeMin, 0, 127);
  return {
    enabled: note.enabled,
    radiusNorm: clamp(note.radiusNorm, 0.08, 1),
    phase: note.phase,
    speedMode: ORBIT_SPEED_MODE_IDS[note.speedMode] ?? 1,
    speedValue: clamp(note.speedValue, 0.125, 800),
    direction: note.direction === 'ccw' ? -1 : 1,
    pitchMode: ORBIT_PITCH_MODE_IDS[note.pitchMode] ?? 1,
    midiNote: clamp(note.midiNote, 0, 127),
    harmonyDegree: Math.round(clamp(note.harmonyDegree, -32, 32)),
    pitchRangeMin: pitchMin,
    pitchRangeMax: clamp(note.pitchRangeMax, pitchMin, 127),
    velocity: clamp(note.velocity, 0, 1),
    velocityRangeEnabled: note.velocityRangeEnabled,
    velocityMin,
    velocityMax: clamp(note.velocityMax, velocityMin, 1),
    gateBeats: clamp(note.gateBeats, 0.05, 8),
    gateRangeEnabled: note.gateRangeEnabled,
    gateMinBeats: gateMin,
    gateMaxBeats: clamp(note.gateMaxBeats, gateMin, 8),
    probability: clamp(note.probability, 0, 1),
    targetSourceId: note.targetSourceId === 'follow' ? 0 : productSourceId(note.targetSourceId),
    seed: Math.max(1, Math.round(note.seed || (2001 + index))),
  };
}

export function productOrbitFromConfig(
  config: OrbitSequencerConfig,
  slotIndex: number,
  targetSourceId = config.targetSourceId,
): ProductOrbitSequencerSnapshot {
  const pitchMin = clamp(config.pitchRangeMin, 0, 127);
  return {
    enabled: config.enabled,
    targetSourceId: productSourceId(targetSourceId),
    triggerLineCount: Math.round(clamp(config.triggerLineCount, 1, 8)),
    clockMode: config.clockMode === 'freeBpmPercent' ? 1 : 0,
    bpmPercent: clamp(config.bpmPercent, 1, 800),
    speedOffset: clamp(config.speedOffset, -1, 1),
    globalOffset: clamp(config.globalOffset, -1, 1),
    evenOffset: clamp(config.evenOffset, -1, 1),
    freeOffset: clamp(config.freeOffset, -1, 1),
    evenReverseMode: ORBIT_EVEN_REVERSE_MODE_IDS[config.evenReverseMode] ?? 0,
    constellationMode: ORBIT_CONSTELLATION_MODE_IDS[config.constellationMode] ?? 0,
    quantizeToHarmony: config.quantizeToHarmony,
    snapSource: SNAP_SOURCE_IDS[config.snapSource] ?? 0,
    pitchRangeMin: pitchMin,
    pitchRangeMax: clamp(config.pitchRangeMax, pitchMin, 127),
    splineH1X: clamp(config.spline.handle1.x, -1.2, 1.2),
    splineH1Y: clamp(config.spline.handle1.y, -1.2, 1.2),
    splineH2X: clamp(config.spline.handle2.x, -1.2, 1.2),
    splineH2Y: clamp(config.spline.handle2.y, -1.2, 1.2),
    splineTipX: clamp(config.spline.tip.x, -1.2, 1.2),
    splineTipY: clamp(config.spline.tip.y, -1.2, 1.2),
    splineSpinEnabled: config.spline.spinEnabled,
    splineSpinDirection: config.spline.spinDirection === 'ccw' ? -1 : 1,
    splineBaseAngle: config.spline.baseAngle,
    noteCount: Math.min(config.notes.length, 32),
    seed: Math.max(1, Math.round(config.seed || (3001 + slotIndex))),
    notes: Array.from({ length: 32 }, (_, index) => (
      productOrbitNoteFromConfig(config.notes[index] ?? {
        id: `empty-${index}`,
        enabled: false,
        radiusNorm: 0.5,
        phase: 0,
        speedMode: 'syncDivisor',
        speedValue: 1,
        direction: 'cw',
        pitchMode: 'harmonyDegree',
        midiNote: 60,
        harmonyDegree: 0,
        pitchRangeMin: 48,
        pitchRangeMax: 84,
        velocity: 0.8,
        velocityRangeEnabled: false,
        velocityMin: 0.6,
        velocityMax: 1,
        gateBeats: 0.5,
        gateRangeEnabled: false,
        gateMinBeats: 0.25,
        gateMaxBeats: 0.75,
        probability: 1,
        targetSourceId: 'follow',
        seed: 2001 + index,
      }, index)
    )),
  };
}

export function synthSequencerFaceSlotsFromState(state: Record<string, unknown> | undefined) {
  return normalizeSynthSequencerFaceState(state?.synthSequencerFaces).slots;
}

export function synthSequencerFacesUseSourceId(state: Record<string, unknown> | undefined, sourceId: number): boolean {
  return synthSequencerFaceSlotsFromState(state).some((slot) => {
    if (slot.mode === 'anchorWalker') {
      if (!slot.anchorWalker.enabled) return false;
      if (slot.anchorWalker.targetSourceId === sourceId) return true;
      return slot.anchorWalker.layers.some((layer) => (
        layer.enabled &&
        layer.targetSourceId !== 'follow' &&
        layer.targetSourceId === sourceId
      ));
    }
    if (slot.mode === 'orbit') {
      if (!slot.orbit.enabled) return false;
      if (slot.orbit.targetSourceId === sourceId) return true;
      return slot.orbit.notes.some((note) => (
        note.enabled &&
        note.targetSourceId !== 'follow' &&
        note.targetSourceId === sourceId
      ));
    }
    return false;
  });
}
