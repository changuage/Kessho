import assert from 'node:assert/strict';
import type { PitchBindingMode } from '../../audio/drumSeqTypes';

import {
  commitGeneratedCaptureToEuclid,
  type CommitGeneratedCaptureArgs,
} from './commitGeneratedCaptureToEuclid';
import {
  capturedMidisToSemitonePitchValues,
  chooseCaptureRootMidi,
} from './generatedSequencerCapturePitch';
import {
  captureStepCount,
  createCaptureScratch,
  markCaptureStepVisited,
  writeCaptureEventToStep,
} from './generatedSequencerCaptureScratch';
import { resolveTriggerClip } from './triggerClip';
import type {
  LaneKind,
  PitchSettings,
  StepOverrides,
  SubLaneKind,
  SubLaneState,
} from './useEuclideanSequencer';

function makeStepOverrides(laneCount = 4): StepOverrides {
  return {
    triggerToggles: Array.from({ length: laneCount }, () => new Map<number, boolean>()),
    probability: Array.from({ length: laneCount }, () => null),
    ratchet: Array.from({ length: laneCount }, () => null),
    trigCondition: Array.from({ length: laneCount }, () => null),
    expression: Array.from({ length: laneCount }, () => null),
    pitch: Array.from({ length: laneCount }, () => null),
    morph: Array.from({ length: laneCount }, () => null),
    distance: Array.from({ length: laneCount }, () => null),
    nudge: Array.from({ length: laneCount }, () => null),
    slice: Array.from({ length: laneCount }, () => null),
    reverse: Array.from({ length: laneCount }, () => null),
    expressionDirection: Array.from({ length: laneCount }, () => null),
    morphDirection: Array.from({ length: laneCount }, () => null),
    distanceDirection: Array.from({ length: laneCount }, () => null),
    nudgeDirection: Array.from({ length: laneCount }, () => null),
    pitchDirection: Array.from({ length: laneCount }, () => null),
    sliceDirection: Array.from({ length: laneCount }, () => null),
    reverseDirection: Array.from({ length: laneCount }, () => null),
  };
}

function makeSubLaneState(overrides: Partial<SubLaneState> = {}): SubLaneState {
  return {
    enabled: false,
    steps: 5,
    direction: 'forward',
    ...overrides,
  };
}

function makeSubLaneStates(laneCount = 4): Record<SubLaneKind, SubLaneState>[] {
  return Array.from({ length: laneCount }, () => ({
    pitch: makeSubLaneState({ scaleQuantize: true }),
    expression: makeSubLaneState({ valueMode: 'range', rangeMin: 0.2, rangeMax: 0.9 }),
    morph: makeSubLaneState(),
    distance: makeSubLaneState(),
    nudge: makeSubLaneState(),
    slice: makeSubLaneState(),
    reverse: makeSubLaneState(),
  }));
}

function applyStateAction<T>(previous: T, action: T | ((prev: T) => T)): T {
  return typeof action === 'function'
    ? (action as (prev: T) => T)(previous)
    : action;
}

function testCaptureScratch(): void {
  const empty = createCaptureScratch(16);
  assert.equal(empty.stepCount, 16);
  assert.equal(empty.cells.length, 16);
  assert.equal(captureStepCount(empty), 0);

  let scratch = createCaptureScratch(4);
  scratch = writeCaptureEventToStep(scratch, 1, 0, {
    eventId: 1,
    midiNote: 60,
    velocity: 0.7,
    gateSeconds: 0.15,
  });
  assert.equal(captureStepCount(scratch), 1);
  assert.equal(scratch.cells[1]?.hasNote, true);

  scratch = markCaptureStepVisited(scratch, 1, 1);
  assert.equal(scratch.cells[1]?.hasNote, false, 'new-cycle visit should clear old notes for silence overwrite');
  assert.equal(scratch.cells[1]?.sourceEventId, null);
  assert.equal(captureStepCount(scratch), 0);

  scratch = writeCaptureEventToStep(scratch, 2, 1, {
    eventId: 2,
    midiNote: 62,
    velocity: 0.5,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 2, 1, {
    eventId: 3,
    midiNote: 67,
    velocity: 0.9,
    gateSeconds: 0.2,
  });
  assert.equal(captureStepCount(scratch), 2);
  assert.equal(scratch.cells[2]?.sourceEventId, 3, 'last event should win per step');
  assert.equal(scratch.cells[2]?.midiNote, 67);
  assert.equal(scratch.cells[2]?.velocity, 0.9);
}

function testCaptureScratchKeepsLatestCycleOnly(): void {
  let scratch = createCaptureScratch(8);
  scratch = writeCaptureEventToStep(scratch, 1, 0, {
    eventId: 100,
    midiNote: 60,
    velocity: 0.5,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 5, 0, {
    eventId: 101,
    midiNote: 64,
    velocity: 0.8,
    gateSeconds: 0.1,
  });
  assert.equal(captureStepCount(scratch), 2);

  scratch = markCaptureStepVisited(scratch, 0, 1);
  assert.equal(captureStepCount(scratch), 0, 'new cycle should clear the previous full pass');
  assert.equal(scratch.cells[1]?.hasNote, false);
  assert.equal(scratch.cells[5]?.hasNote, false);

  scratch = writeCaptureEventToStep(scratch, 3, 1, {
    eventId: 102,
    midiNote: 67,
    velocity: 1,
    gateSeconds: 0.1,
  });

  assert.equal(captureStepCount(scratch), 1);
  assert.equal(scratch.cells[3]?.hasNote, true);
  assert.equal(scratch.cells[3]?.midiNote, 67);
  assert.equal(scratch.cells[1]?.hasNote, false);
  assert.equal(scratch.cells[5]?.hasNote, false);
}

function testCapturedPitchConversion(): void {
  const melody = capturedMidisToSemitonePitchValues([60, 64, 67]);
  assert.equal(melody.rootMidi, 60);
  assert.deepEqual(melody.pitchValues, [0, 4, 7]);
  assert.deepEqual(melody.pitchSettings, {
    mode: 'semitones',
    root: 60,
    scale: 'Chromatic',
  });

  assert.equal(chooseCaptureRootMidi([]), 60);
  const empty = capturedMidisToSemitonePitchValues([null, null]);
  assert.equal(empty.rootMidi, 60);
  assert.deepEqual(empty.pitchValues, [0, 0]);

  const clamped = capturedMidisToSemitonePitchValues([0, 127]);
  assert.deepEqual(clamped.pitchValues, [-48, 48]);

  const scaleCaptured = capturedMidisToSemitonePitchValues([60, 63, 67], {
    root: 60,
    scale: 'Minor',
    scaleIntervals: [0, 2, 3, 5, 7, 8, 10],
  });
  assert.deepEqual(scaleCaptured.pitchValues, [0, 2, 4]);
  assert.deepEqual(scaleCaptured.pitchSettings, {
    mode: 'semitones',
    root: 60,
    scale: 'Minor',
  });
}

function testCommitGeneratedCaptureToEuclid(): void {
  const targetLaneIndex = 1;
  let scratch = createCaptureScratch(4);
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 10,
    midiNote: 60,
    velocity: 0.5,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 2, 0, {
    eventId: 11,
    midiNote: 67,
    velocity: 0.8,
    gateSeconds: 0.1,
  });

  const params: Array<[number, string, number]> = [];
  const selects: Array<[number, string, unknown]> = [];
  let selectedMode: [number, 'euclid'] | null = null;
  let selectedPitchBinding: [number, PitchBindingMode] | null = null;
  let openLane: LaneKind | null = null;
  let stepOverrides = makeStepOverrides();
  let subLaneStates = makeSubLaneStates();
  let pitchSettings: PitchSettings[] = Array.from({ length: 4 }, () => ({
    mode: 'semitones',
    root: 48,
    scale: 'Major',
  }));

  const seq: CommitGeneratedCaptureArgs['seq'] = {
    setParam: (laneIndex, suffix, value) => params.push([laneIndex, suffix, value]),
    setParamSelect: (laneIndex, suffix, value) => selects.push([laneIndex, suffix, value]),
    setStepOverrides: (action) => {
      stepOverrides = applyStateAction(stepOverrides, action);
    },
    setSubLaneStates: (action) => {
      subLaneStates = applyStateAction(subLaneStates, action);
    },
    setPitchSettings: (action) => {
      pitchSettings = applyStateAction(pitchSettings, action);
    },
    setOpenLane: (action) => {
      openLane = typeof action === 'function'
        ? action('trigger')
        : action;
    },
  };

  commitGeneratedCaptureToEuclid({
    scratch,
    targetLaneIndex,
    seq,
    setSequencerMode: (laneIndex, mode) => {
      selectedMode = [laneIndex, mode];
    },
    setPitchBindingMode: (laneIndex, mode) => {
      selectedPitchBinding = [laneIndex, mode];
    },
    sourceMode: 'orbit',
  });

  assert.deepEqual(selectedMode, [targetLaneIndex, 'euclid']);
  assert.deepEqual(selectedPitchBinding, [targetLaneIndex, 'polyrhythmic']);
  assert.deepEqual(selects, [[targetLaneIndex, 'Preset', 'custom']]);
  assert.deepEqual(params, [
    [targetLaneIndex, 'Steps', 4],
    [targetLaneIndex, 'Hits', 2],
    [targetLaneIndex, 'Rotation', 0],
  ]);
  assert.equal(openLane, 'pitch');

  const triggerClip = stepOverrides.triggerClips?.[targetLaneIndex];
  assert.equal(triggerClip?.origin, 'recorded');
  assert.equal(triggerClip?.label, 'Orbit capture');
  assert.deepEqual(resolveTriggerClip(triggerClip!), [true, false, true, false]);
  assert.equal(stepOverrides.triggerToggles[targetLaneIndex]?.size, 0);
  assert.deepEqual(stepOverrides.pitch[targetLaneIndex], [0, 7]);
  assert.deepEqual(stepOverrides.expression[targetLaneIndex], [0.5, 0.8]);
  assert.deepEqual(stepOverrides.nudge[targetLaneIndex], [0, 0]);
  assert.deepEqual(stepOverrides.probability[targetLaneIndex], [1, 1, 1, 1]);
  assert.deepEqual(stepOverrides.trigCondition[targetLaneIndex], [[1, 1], [1, 1], [1, 1], [1, 1]]);
  assert.equal(stepOverrides.pitchDirection[targetLaneIndex], 'forward');
  assert.equal(stepOverrides.expressionDirection[targetLaneIndex], 'forward');

  assert.equal(subLaneStates[targetLaneIndex]?.pitch.enabled, true);
  assert.equal(subLaneStates[targetLaneIndex]?.pitch.steps, 2);
  assert.equal(subLaneStates[targetLaneIndex]?.pitch.scaleQuantize, false);
  assert.equal(subLaneStates[targetLaneIndex]?.expression.enabled, true);
  assert.equal(subLaneStates[targetLaneIndex]?.expression.steps, 2);
  assert.equal(subLaneStates[targetLaneIndex]?.expression.valueMode, 'sequence');
  assert.equal(subLaneStates[targetLaneIndex]?.expression.rangeMin, 0.2, 'existing expression range should be preserved');
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.enabled, false);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.steps, 2);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.followTriggerHits, true);
  assert.deepEqual(pitchSettings[targetLaneIndex], {
    mode: 'semitones',
    root: 60,
    scale: 'Chromatic',
  });
}

function testCommitGeneratedCaptureWritesNudge(): void {
  const targetLaneIndex = 1;
  let scratch = createCaptureScratch(4);
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 40,
    midiNote: 60,
    velocity: 0.5,
    gateSeconds: 0.1,
    targetStepFloat: 0,
  });
  scratch = writeCaptureEventToStep(scratch, 2, 0, {
    eventId: 41,
    midiNote: 64,
    velocity: 0.8,
    gateSeconds: 0.1,
    targetStepFloat: 1.5,
  });

  let stepOverrides = makeStepOverrides();
  let subLaneStates = makeSubLaneStates();
  let pitchSettings: PitchSettings[] = Array.from({ length: 4 }, () => ({
    mode: 'semitones',
    root: 48,
    scale: 'Major',
  }));

  const seq: CommitGeneratedCaptureArgs['seq'] = {
    setParam: () => {},
    setParamSelect: () => {},
    setStepOverrides: (action) => {
      stepOverrides = applyStateAction(stepOverrides, action);
    },
    setSubLaneStates: (action) => {
      subLaneStates = applyStateAction(subLaneStates, action);
    },
    setPitchSettings: (action) => {
      pitchSettings = applyStateAction(pitchSettings, action);
    },
    setOpenLane: () => {},
  };

  commitGeneratedCaptureToEuclid({
    scratch,
    targetLaneIndex,
    seq,
    setSequencerMode: () => {},
    setPitchBindingMode: () => {},
    sourceMode: 'anchorWalker',
  });

  assert.deepEqual(stepOverrides.nudge[targetLaneIndex], [0, -0.25]);
  assert.equal(stepOverrides.nudgeDirection[targetLaneIndex], 'forward');
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.enabled, true);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.steps, 2);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.followTriggerHits, true);
  assert.deepEqual(pitchSettings[targetLaneIndex], {
    mode: 'semitones',
    root: 60,
    scale: 'Chromatic',
  });
}

function testCommitUsesLatestCaptureCycle(): void {
  const targetLaneIndex = 0;
  let scratch = createCaptureScratch(8);
  scratch = writeCaptureEventToStep(scratch, 1, 0, {
    eventId: 30,
    midiNote: 60,
    velocity: 0.4,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 5, 0, {
    eventId: 31,
    midiNote: 64,
    velocity: 0.6,
    gateSeconds: 0.1,
  });
  scratch = markCaptureStepVisited(scratch, 0, 1);
  scratch = writeCaptureEventToStep(scratch, 2, 1, {
    eventId: 32,
    midiNote: 60,
    velocity: 0.8,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 6, 1, {
    eventId: 33,
    midiNote: 64,
    velocity: 1,
    gateSeconds: 0.1,
  });

  const params: Array<[number, string, number]> = [];
  let stepOverrides = makeStepOverrides();
  let subLaneStates = makeSubLaneStates();
  let pitchSettings: PitchSettings[] = Array.from({ length: 4 }, () => ({
    mode: 'semitones',
    root: 48,
    scale: 'Major',
  }));

  const seq: CommitGeneratedCaptureArgs['seq'] = {
    setParam: (laneIndex, suffix, value) => params.push([laneIndex, suffix, value]),
    setParamSelect: () => {},
    setStepOverrides: (action) => {
      stepOverrides = applyStateAction(stepOverrides, action);
    },
    setSubLaneStates: (action) => {
      subLaneStates = applyStateAction(subLaneStates, action);
    },
    setPitchSettings: (action) => {
      pitchSettings = applyStateAction(pitchSettings, action);
    },
    setOpenLane: () => {},
  };

  commitGeneratedCaptureToEuclid({
    scratch,
    targetLaneIndex,
    seq,
    setSequencerMode: () => {},
    setPitchBindingMode: () => {},
    sourceMode: 'anchorWalker',
  });

  assert.deepEqual(params, [
    [targetLaneIndex, 'Steps', 8],
    [targetLaneIndex, 'Hits', 2],
    [targetLaneIndex, 'Rotation', 0],
  ]);
  const triggerClip = stepOverrides.triggerClips?.[targetLaneIndex];
  assert.equal(triggerClip?.origin, 'recorded');
  assert.equal(triggerClip?.label, 'Walker capture');
  assert.deepEqual(
    resolveTriggerClip(triggerClip!),
    [false, false, true, false, false, false, true, false],
  );
  assert.equal(stepOverrides.triggerToggles[targetLaneIndex]?.size, 0);
  assert.deepEqual(stepOverrides.pitch[targetLaneIndex], [0, 4]);
  assert.deepEqual(stepOverrides.expression[targetLaneIndex], [0.8, 1]);
  assert.equal(subLaneStates[targetLaneIndex]?.pitch.steps, 2);
  assert.deepEqual(pitchSettings[targetLaneIndex], {
    mode: 'semitones',
    root: 60,
    scale: 'Chromatic',
  });
}

function testSameStepCapturePacksPitchAndDistributesTriggers(): void {
  const targetLaneIndex = 0;
  let scratch = createCaptureScratch(8);
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 20,
    midiNote: 60,
    velocity: 0.4,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 21,
    midiNote: 64,
    velocity: 0.6,
    gateSeconds: 0.1,
  });
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 22,
    midiNote: 67,
    velocity: 0.8,
    gateSeconds: 0.1,
  });

  const params: Array<[number, string, number]> = [];
  let stepOverrides = makeStepOverrides();
  let subLaneStates = makeSubLaneStates();
  let pitchSettings: PitchSettings[] = Array.from({ length: 4 }, () => ({
    mode: 'semitones',
    root: 48,
    scale: 'Major',
  }));

  const seq: CommitGeneratedCaptureArgs['seq'] = {
    setParam: (laneIndex, suffix, value) => params.push([laneIndex, suffix, value]),
    setParamSelect: () => {},
    setStepOverrides: (action) => {
      stepOverrides = applyStateAction(stepOverrides, action);
    },
    setSubLaneStates: (action) => {
      subLaneStates = applyStateAction(subLaneStates, action);
    },
    setPitchSettings: (action) => {
      pitchSettings = applyStateAction(pitchSettings, action);
    },
    setOpenLane: () => {},
  };

  commitGeneratedCaptureToEuclid({
    scratch,
    targetLaneIndex,
    seq,
    setSequencerMode: () => {},
    setPitchBindingMode: () => {},
  });

  assert.deepEqual(params, [
    [targetLaneIndex, 'Steps', 8],
    [targetLaneIndex, 'Hits', 3],
    [targetLaneIndex, 'Rotation', 0],
  ]);
  const triggerClip = stepOverrides.triggerClips?.[targetLaneIndex];
  assert.equal(triggerClip?.origin, 'recorded');
  assert.equal(
    resolveTriggerClip(triggerClip!).filter(Boolean).length,
    3,
    'colliding capture events should be redistributed as three trigger hits',
  );
  assert.equal(stepOverrides.triggerToggles[targetLaneIndex]?.size, 0);
  assert.deepEqual(stepOverrides.pitch[targetLaneIndex], [0, 4, 7]);
  assert.deepEqual(stepOverrides.expression[targetLaneIndex], [0.4, 0.6, 0.8]);
  assert.equal(subLaneStates[targetLaneIndex]?.pitch.steps, 3);
  assert.equal(subLaneStates[targetLaneIndex]?.expression.steps, 3);
  assert.deepEqual(pitchSettings[targetLaneIndex], {
    mode: 'semitones',
    root: 60,
    scale: 'Chromatic',
  });
}

function testEmptyCaptureDoesNotOverwriteEuclidLane(): void {
  const targetLaneIndex = 2;
  const params: Array<[number, string, number]> = [];
  const selects: Array<[number, string, unknown]> = [];
  let selectedMode: [number, 'euclid'] | null = null;
  let selectedPitchBinding: [number, PitchBindingMode] | null = null;
  let stepOverrides = makeStepOverrides();
  let subLaneStates = makeSubLaneStates();
  let pitchSettings: PitchSettings[] = Array.from({ length: 4 }, () => ({
    mode: 'semitones',
    root: 48,
    scale: 'Major',
  }));

  const seq: CommitGeneratedCaptureArgs['seq'] = {
    setParam: (laneIndex, suffix, value) => params.push([laneIndex, suffix, value]),
    setParamSelect: (laneIndex, suffix, value) => selects.push([laneIndex, suffix, value]),
    setStepOverrides: (action) => {
      stepOverrides = applyStateAction(stepOverrides, action);
    },
    setSubLaneStates: (action) => {
      subLaneStates = applyStateAction(subLaneStates, action);
    },
    setPitchSettings: (action) => {
      pitchSettings = applyStateAction(pitchSettings, action);
    },
    setOpenLane: () => {},
  };

  const previousStepOverrides = stepOverrides;
  const previousSubLaneStates = subLaneStates;
  const previousPitchSettings = pitchSettings;

  commitGeneratedCaptureToEuclid({
    scratch: createCaptureScratch(8),
    targetLaneIndex,
    seq,
    setSequencerMode: (laneIndex, mode) => {
      selectedMode = [laneIndex, mode];
    },
    setPitchBindingMode: (laneIndex, mode) => {
      selectedPitchBinding = [laneIndex, mode];
    },
  });

  assert.equal(selectedMode, null);
  assert.equal(selectedPitchBinding, null);
  assert.deepEqual(selects, []);
  assert.deepEqual(params, []);
  assert.equal(stepOverrides, previousStepOverrides);
  assert.equal(subLaneStates, previousSubLaneStates);
  assert.equal(pitchSettings, previousPitchSettings);
}

testCaptureScratch();
testCaptureScratchKeepsLatestCycleOnly();
testCapturedPitchConversion();
testCommitGeneratedCaptureToEuclid();
testCommitGeneratedCaptureWritesNudge();
testCommitUsesLatestCaptureCycle();
testSameStepCapturePacksPitchAndDistributesTriggers();
testEmptyCaptureDoesNotOverwriteEuclidLane();
