import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { laneDefaults } from './coreProductSnapshotDefaults';
import type { CoreProductSnapshot } from './coreProductSnapshot';

type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];

const ANCHOR_WALKER_BYTES = 332;
const ORBIT_BYTES = 2896;
export const KESSHO_PRODUCT_SEQUENCER_MODE_STATE_BYTES = ANCHOR_WALKER_BYTES + ORBIT_BYTES;

function bool(value: unknown): number {
  return value ? 1 : 0;
}

export function encodeCoreProductSequencerFaceModes(
  view: DataView,
  initialOffset: number,
  lanes: ProductLaneSnapshot[],
): number {
  let offset = initialOffset;
  const u32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };
  const i32 = (value: number) => {
    view.setInt32(offset, value | 0, true);
    offset += 4;
  };
  const f32 = (value: number) => {
    view.setFloat32(offset, Number.isFinite(value) ? value : 0, true);
    offset += 4;
  };

  for (let index = 0; index < 16; index += 1) {
    const lane = lanes[index] ?? laneDefaults(CORE_PRODUCT_SOURCE_IDS.pad1, 60);
    const walker = lane.anchorWalker;
    u32(bool(walker.enabled));
    u32(walker.mode);
    u32(walker.playMode);
    u32(walker.targetSourceId);
    u32(walker.anchorSource);
    f32(walker.manualAnchorMidi);
    u32(walker.snapSource);
    u32(walker.customPitchClassMask);
    u32(walker.triggerMode);
    u32(walker.boundaryMode);
    u32(walker.keyboardRange);
    u32(bool(walker.showLinkedOutputs));
    u32(walker.autoRate);
    u32(walker.autoFeel);
    f32(walker.swing);
    u32(bool(walker.leadMode));
    u32(bool(walker.mwToVelocity));
    u32(bool(walker.pitchWheelWalk));
    for (let patternIndex = 0; patternIndex < 16; patternIndex += 1) i32(walker.gesturePattern[patternIndex] ?? 0);
    u32(walker.gesturePatternLength);
    i32(walker.activePadDelta);
    u32(walker.layerPreset);
    f32(walker.spreadSeconds);
    u32(walker.layerCount);
    for (let layerIndex = 0; layerIndex < 4; layerIndex += 1) {
      const layer = walker.layers[layerIndex];
      u32(bool(layer?.enabled));
      i32(layer?.transposeSemitones ?? 0);
      i32(layer?.diatonicOffset ?? 0);
      u32(layer?.tuning ?? 2);
      u32(layer?.motion ?? 0);
      f32(layer?.delaySeconds ?? 0);
      f32(layer?.gateRatio ?? 0.75);
      f32(layer?.velocityScale ?? 1);
      f32(layer?.velocityOffset ?? 0);
      u32(layer?.targetSourceId ?? 0);
    }
    f32(walker.outputRangeMin);
    f32(walker.outputRangeMax);
    u32(walker.seed);
    u32(0);

    const orbit = lane.orbit;
    u32(bool(orbit.enabled));
    u32(orbit.targetSourceId);
    u32(orbit.triggerLineCount);
    u32(orbit.clockMode);
    f32(orbit.bpmPercent);
    u32(bool(orbit.quantizeToHarmony));
    u32(orbit.snapSource);
    f32(orbit.pitchRangeMin);
    f32(orbit.pitchRangeMax);
    f32(orbit.splineH1X);
    f32(orbit.splineH1Y);
    f32(orbit.splineH2X);
    f32(orbit.splineH2Y);
    f32(orbit.splineTipX);
    f32(orbit.splineTipY);
    u32(bool(orbit.splineSpinEnabled));
    i32(orbit.splineSpinDirection);
    f32(orbit.splineBaseAngle);
    u32(orbit.noteCount);
    u32(orbit.seed);
    for (let noteIndex = 0; noteIndex < 32; noteIndex += 1) {
      const note = orbit.notes[noteIndex];
      u32(bool(note?.enabled));
      f32(note?.radiusNorm ?? 0.5);
      f32(note?.phase ?? 0);
      u32(note?.speedMode ?? 1);
      f32(note?.speedValue ?? 1);
      i32(note?.direction ?? 1);
      u32(note?.pitchMode ?? 1);
      f32(note?.midiNote ?? 60);
      i32(note?.harmonyDegree ?? 0);
      f32(note?.pitchRangeMin ?? 48);
      f32(note?.pitchRangeMax ?? 84);
      f32(note?.velocity ?? 0.8);
      u32(bool(note?.velocityRangeEnabled));
      f32(note?.velocityMin ?? 0.6);
      f32(note?.velocityMax ?? 1);
      f32(note?.gateBeats ?? 0.5);
      u32(bool(note?.gateRangeEnabled));
      f32(note?.gateMinBeats ?? 0.25);
      f32(note?.gateMaxBeats ?? 0.75);
      f32(note?.probability ?? 1);
      u32(note?.targetSourceId ?? 0);
      u32(note?.seed ?? 1);
    }
  }
  return offset;
}
