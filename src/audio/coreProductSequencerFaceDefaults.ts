import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import type {
  ProductAnchorWalkerLayerSnapshot,
  ProductAnchorWalkerSnapshot,
  ProductOrbitNoteSnapshot,
  ProductOrbitSequencerSnapshot,
} from './coreProductSnapshotTypes';

export function anchorWalkerLayerDefaults(index: number): ProductAnchorWalkerLayerSnapshot {
  return {
    enabled: index < 3,
    transposeSemitones: 0,
    diatonicOffset: index === 1 ? 2 : index === 2 ? 4 : 0,
    tuning: 2,
    motion: 0,
    delaySeconds: index * 0.035,
    gateRatio: 0.75,
    velocityScale: index === 1 ? 0.9 : index === 2 ? 0.82 : 1,
    velocityOffset: 0,
    targetSourceId: 0,
  };
}

export function anchorWalkerDefaults(): ProductAnchorWalkerSnapshot {
  return {
    enabled: true,
    mode: 0,
    targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
    anchorSource: 0,
    manualAnchorMidi: 60,
    snapSource: 0,
    customPitchClassMask: 0x0ab5,
    autoRate: 4,
    autoFeel: 0,
    swing: 0,
    leadMode: true,
    mwToVelocity: false,
    pitchWheelWalk: false,
    gesturePattern: [2, -1, 2, -1, 4, -1, 2, -1, 0, 0, 0, 0, 0, 0, 0, 0],
    gesturePatternLength: 8,
    activePadDelta: 1,
    layerPreset: 2,
    spreadSeconds: 0.035,
    layerCount: 3,
    layers: Array.from({ length: 4 }, (_, index) => anchorWalkerLayerDefaults(index)),
    outputRangeMin: 36,
    outputRangeMax: 96,
    seed: 1001,
  };
}

export function orbitNoteDefaults(index: number): ProductOrbitNoteSnapshot {
  const demoNotes = [
    { radiusNorm: 0.375, phase: Math.PI * 1.5, midiNote: 60, speedMode: 1, speedValue: 1 },
    { radiusNorm: 0.65, phase: 0, midiNote: 64, speedMode: 1, speedValue: 2 },
    { radiusNorm: 0.9, phase: Math.PI * 0.5, midiNote: 67, speedMode: 1, speedValue: 4 },
  ];
  const demo = demoNotes[index];
  return {
    enabled: index < demoNotes.length,
    radiusNorm: demo?.radiusNorm ?? 0.5,
    phase: demo?.phase ?? 0,
    speedMode: demo?.speedMode ?? 0,
    speedValue: demo?.speedValue ?? 100,
    direction: 1,
    pitchMode: 0,
    midiNote: demo?.midiNote ?? 60,
    harmonyDegree: (index * 2) % 7,
    pitchRangeMin: 48,
    pitchRangeMax: 84,
    velocity: 0.82,
    velocityRangeEnabled: false,
    velocityMin: 0.6,
    velocityMax: 1,
    gateBeats: 0.5,
    gateRangeEnabled: false,
    gateMinBeats: 0.25,
    gateMaxBeats: 0.75,
    probability: 1,
    targetSourceId: 0,
    seed: 2001 + index,
  };
}

export function orbitSequencerDefaults(): ProductOrbitSequencerSnapshot {
  return {
    enabled: true,
    targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
    triggerLineCount: 1,
    clockMode: 0,
    bpmPercent: 100,
    quantizeToHarmony: true,
    snapSource: 0,
    pitchRangeMin: 48,
    pitchRangeMax: 84,
    splineH1X: 0,
    splineH1Y: -0.3,
    splineH2X: 0,
    splineH2Y: -0.65,
    splineTipX: 0,
    splineTipY: -1,
    splineSpinEnabled: false,
    splineSpinDirection: 1,
    splineBaseAngle: 0,
    noteCount: 3,
    seed: 3001,
    notes: Array.from({ length: 32 }, (_, index) => orbitNoteDefaults(index)),
  };
}
