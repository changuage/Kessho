import type { CoreProductEvent } from './coreProductEvents';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductSequencerLaneParamEvent } from './coreProductEvents';
import type { CoreProductSnapshot } from './coreProductSnapshot';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';

type SequencerKind = 'synth' | 'drum';
type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];
type SnapshotScalar = number | boolean;

function valuesDiffer(previous: SnapshotScalar, next: SnapshotScalar): boolean {
  if (typeof previous === 'boolean' || typeof next === 'boolean') {
    return previous !== next;
  }
  return Math.abs(previous - next) > 0.000001;
}

function eventValue(value: SnapshotScalar): number {
  return value === true ? 1 : value === false ? 0 : value;
}

function appendLaneParamDiff(
  events: CoreProductEvent[],
  sequencer: SequencerKind,
  laneIndex: number,
  paramId: number,
  previous: SnapshotScalar,
  next: SnapshotScalar,
): void {
  if (!valuesDiffer(previous, next)) return;
  events.push(createCoreProductSequencerLaneParamEvent(sequencer, laneIndex, paramId, eventValue(next)));
}

function appendIndexedLaneParamDiff(
  events: CoreProductEvent[],
  sequencer: SequencerKind,
  laneIndex: number,
  paramId: number,
  previous: SnapshotScalar,
  next: SnapshotScalar,
  itemIndex: number,
): void {
  if (!valuesDiffer(previous, next)) return;
  events.push(createCoreProductSequencerLaneParamEvent(sequencer, laneIndex, paramId, eventValue(next), itemIndex & 0xff));
}

function anchorWalkerLayerDiffDefaults(index: number): ProductLaneSnapshot['anchorWalker']['layers'][number] {
  return {
    enabled: index === 0,
    transposeSemitones: 0,
    diatonicOffset: 0,
    tuning: 2,
    motion: 0,
    delaySeconds: 0,
    gateRatio: 0.75,
    velocityScale: 1,
    velocityOffset: 0,
    targetSourceId: 0,
  };
}

function anchorWalkerDiffDefaults(): ProductLaneSnapshot['anchorWalker'] {
  return {
    enabled: true,
    mode: 0,
    playMode: 0,
    targetSourceId: CORE_PRODUCT_SOURCE_IDS.lead1,
    anchorSource: 0,
    manualAnchorMidi: 60,
    snapSource: 0,
    customPitchClassMask: 0x0ab5,
    triggerMode: 0,
    boundaryMode: 0,
    keyboardRange: 0,
    showLinkedOutputs: false,
    autoRate: 0,
    autoFeel: 0,
    swing: 0,
    leadMode: false,
    mwToVelocity: false,
    pitchWheelWalk: false,
    gesturePattern: [1, -1, 2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    gesturePatternLength: 4,
    activePadDelta: 0,
    layerPreset: 0,
    spreadSeconds: 0,
    layerCount: 1,
    layers: Array.from({ length: 4 }, (_, index) => anchorWalkerLayerDiffDefaults(index)),
    outputRangeMin: 36,
    outputRangeMax: 96,
    seed: 1001,
  };
}

function orbitNoteDiffDefaults(index: number): ProductLaneSnapshot['orbit']['notes'][number] {
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

function orbitDiffDefaults(): ProductLaneSnapshot['orbit'] {
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
    notes: Array.from({ length: 32 }, (_, index) => orbitNoteDiffDefaults(index)),
  };
}

export function appendSequencerModeConfigDiffs(
  events: CoreProductEvent[],
  sequencer: SequencerKind,
  laneIndex: number,
  previous: ProductLaneSnapshot,
  next: ProductLaneSnapshot,
): void {
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMode, previous.sequencerMode, next.sequencerMode);

  const prevWalker = previous.anchorWalker ?? anchorWalkerDiffDefaults();
  const nextWalker = next.anchorWalker ?? anchorWalkerDiffDefaults();
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerMode, prevWalker.mode, nextWalker.mode);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerPlayMode, prevWalker.playMode, nextWalker.playMode);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerAnchorSource, prevWalker.anchorSource, nextWalker.anchorSource);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerManualAnchorMidi, prevWalker.manualAnchorMidi, nextWalker.manualAnchorMidi);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerSnapSource, prevWalker.snapSource, nextWalker.snapSource);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerCustomPitchClassMask, prevWalker.customPitchClassMask, nextWalker.customPitchClassMask);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerTriggerMode, prevWalker.triggerMode, nextWalker.triggerMode);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerBoundaryMode, prevWalker.boundaryMode, nextWalker.boundaryMode);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerKeyboardRange, prevWalker.keyboardRange, nextWalker.keyboardRange);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerShowLinkedOutputs, prevWalker.showLinkedOutputs, nextWalker.showLinkedOutputs);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerAutoRate, prevWalker.autoRate, nextWalker.autoRate);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerAutoFeel, prevWalker.autoFeel, nextWalker.autoFeel);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLeadMode, prevWalker.leadMode, nextWalker.leadMode);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerMwToVelocity, prevWalker.mwToVelocity, nextWalker.mwToVelocity);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerPitchWheelWalk, prevWalker.pitchWheelWalk, nextWalker.pitchWheelWalk);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerGesturePatternLength, prevWalker.gesturePatternLength, nextWalker.gesturePatternLength);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerActivePadDelta, prevWalker.activePadDelta, nextWalker.activePadDelta);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerPreset, prevWalker.layerPreset, nextWalker.layerPreset);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerSpreadMs, prevWalker.spreadSeconds * 1000, nextWalker.spreadSeconds * 1000);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerOutputRangeMin, prevWalker.outputRangeMin, nextWalker.outputRangeMin);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerOutputRangeMax, prevWalker.outputRangeMax, nextWalker.outputRangeMax);
  for (let index = 0; index < 16; index += 1) {
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerGesturePatternStep, prevWalker.gesturePattern[index] ?? 0, nextWalker.gesturePattern[index] ?? 0, index);
  }
  for (let index = 0; index < 4; index += 1) {
    const previousLayer = prevWalker.layers[index];
    const nextLayer = nextWalker.layers[index];
    if (!previousLayer || !nextLayer) continue;
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerEnabled, previousLayer.enabled, nextLayer.enabled, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerTranspose, previousLayer.transposeSemitones, nextLayer.transposeSemitones, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerDiatonicOffset, previousLayer.diatonicOffset, nextLayer.diatonicOffset, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerTuning, previousLayer.tuning, nextLayer.tuning, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerMotion, previousLayer.motion, nextLayer.motion, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerDelayMs, previousLayer.delaySeconds * 1000, nextLayer.delaySeconds * 1000, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerGateRatio, previousLayer.gateRatio, nextLayer.gateRatio, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerVelocityScale, previousLayer.velocityScale, nextLayer.velocityScale, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerVelocityOffset, previousLayer.velocityOffset, nextLayer.velocityOffset, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerAnchorWalkerLayerTargetSource, previousLayer.targetSourceId, nextLayer.targetSourceId, index);
  }

  const prevOrbit = previous.orbit ?? orbitDiffDefaults();
  const nextOrbit = next.orbit ?? orbitDiffDefaults();
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitTriggerLineCount, prevOrbit.triggerLineCount, nextOrbit.triggerLineCount);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitBpmPercent, prevOrbit.bpmPercent, nextOrbit.bpmPercent);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitQuantizeToHarmony, prevOrbit.quantizeToHarmony, nextOrbit.quantizeToHarmony);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSnapSource, prevOrbit.snapSource, nextOrbit.snapSource);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitPitchRangeMin, prevOrbit.pitchRangeMin, nextOrbit.pitchRangeMin);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitPitchRangeMax, prevOrbit.pitchRangeMax, nextOrbit.pitchRangeMax);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineH1X, prevOrbit.splineH1X, nextOrbit.splineH1X);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineH1Y, prevOrbit.splineH1Y, nextOrbit.splineH1Y);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineH2X, prevOrbit.splineH2X, nextOrbit.splineH2X);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineH2Y, prevOrbit.splineH2Y, nextOrbit.splineH2Y);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineTipX, prevOrbit.splineTipX, nextOrbit.splineTipX);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineTipY, prevOrbit.splineTipY, nextOrbit.splineTipY);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineSpinEnabled, prevOrbit.splineSpinEnabled, nextOrbit.splineSpinEnabled);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineSpinDirection, prevOrbit.splineSpinDirection, nextOrbit.splineSpinDirection);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSplineBaseAngle, prevOrbit.splineBaseAngle, nextOrbit.splineBaseAngle);
  appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteCount, prevOrbit.noteCount, nextOrbit.noteCount);
  for (let index = 0; index < 32; index += 1) {
    const previousNote = prevOrbit.notes[index];
    const nextNote = nextOrbit.notes[index];
    if (!previousNote || !nextNote) continue;
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteEnabled, previousNote.enabled, nextNote.enabled, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteRadius, previousNote.radiusNorm, nextNote.radiusNorm, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePhase, previousNote.phase, nextNote.phase, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteSpeedMode, previousNote.speedMode, nextNote.speedMode, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteSpeedValue, previousNote.speedValue, nextNote.speedValue, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteDirection, previousNote.direction, nextNote.direction, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePitchMode, previousNote.pitchMode, nextNote.pitchMode, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteMidi, previousNote.midiNote, nextNote.midiNote, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteHarmonyDegree, previousNote.harmonyDegree, nextNote.harmonyDegree, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteVelocity, previousNote.velocity, nextNote.velocity, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteVelocityMin, previousNote.velocityMin, nextNote.velocityMin, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteVelocityMax, previousNote.velocityMax, nextNote.velocityMax, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteGateBeats, previousNote.gateBeats, nextNote.gateBeats, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteGateMinBeats, previousNote.gateMinBeats, nextNote.gateMinBeats, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteGateMaxBeats, previousNote.gateMaxBeats, nextNote.gateMaxBeats, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteProbability, previousNote.probability, nextNote.probability, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteTargetSource, previousNote.targetSourceId, nextNote.targetSourceId, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteSeed, previousNote.seed, nextNote.seed, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePitchRangeMin, previousNote.pitchRangeMin, nextNote.pitchRangeMin, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePitchRangeMax, previousNote.pitchRangeMax, nextNote.pitchRangeMax, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteVelocityRangeEnabled, previousNote.velocityRangeEnabled, nextNote.velocityRangeEnabled, index);
    appendIndexedLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteGateRangeEnabled, previousNote.gateRangeEnabled, nextNote.gateRangeEnabled, index);
  }
}
