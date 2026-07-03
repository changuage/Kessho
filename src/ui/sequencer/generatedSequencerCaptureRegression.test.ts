import assert from 'node:assert/strict';
import {
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  createCoreProductGeneratedSequencerCaptureEvent,
} from '../../audio/coreProductEvents';
import type { ProductEvent } from '../../audio/product/ProductEngineTypes';
import type { CoreProductTelemetrySnapshot } from '../../audio/coreProductTelemetry';
import type { PitchBindingMode } from '../../audio/drumSeqTypes';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../audio/generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../audio/generated/kesshoProductParams';
import { CoreProductGeneratedSequencerCaptureTelemetryHistory } from '../../audio/product/host/CoreProductGeneratedSequencerCaptureTelemetryHistory';
import type { SliderState } from '../state';

import {
  commitGeneratedCaptureToEuclid,
  type CommitGeneratedCaptureArgs,
  type GeneratedCaptureStepCommit,
} from './commitGeneratedCaptureToEuclid';
import { firstEventRelativeTargetStep } from './useGeneratedSequenceCapture';
import {
  buildProductGeneratedCaptureStepCommitEvents,
  generatedCaptureStepPatchForState,
} from './generatedCaptureProductCommit';
import {
  chooseGeneratedCaptureStopAction,
  generatedCaptureStepPastHalf,
} from './generatedSequencerCapturePhrase';
import { createDefaultSynthSequencerFaceState } from './sequencerModeTypes';
import {
  capturedMidisToNotePitchValues,
  capturedMidisToSemitonePitchValues,
  chooseCaptureRootMidi,
} from './generatedSequencerCapturePitch';
import {
  captureScratchForDisplay,
  captureStepCount,
  createCaptureScratch,
  markCaptureStepVisited,
  writeCaptureEventToStep,
} from './generatedSequencerCaptureScratch';
import type { CaptureSession } from './generatedSequencerCaptureTypes';
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

function triggerToggleEntries(
  stepOverrides: StepOverrides,
  laneIndex: number,
): Array<[number, boolean]> {
  return Array.from(stepOverrides.triggerToggles[laneIndex] ?? []);
}

function requireStepCommit(value: GeneratedCaptureStepCommit | null): GeneratedCaptureStepCommit {
  if (value === null) assert.fail('expected generated capture Step commit payload');
  return value;
}

function productGeneratedCapturePitchEventValues(events: readonly ProductEvent[]): number[] {
  const stepValueFieldMask = 0xff00;
  return events
    .filter((event) => (
      typeof event.flags === 'number' &&
      (event.flags & stepValueFieldMask) === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote
    ))
    .map((event) => Number(event.value));
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

function makeCaptureSession(
  scratch: ReturnType<typeof createCaptureScratch>,
  completedScratch: ReturnType<typeof createCaptureScratch> | null,
  commitCycleIndex: number | null,
): CaptureSession {
  return {
    active: true,
    sourceLaneIndex: 0,
    targetLaneIndex: 0,
    sourceMode: 'orbit',
    startMode: 'sequencerBoundary',
    originStepFloat: null,
    originPlayheadStep: null,
    targetStepCount: scratch.stepCount,
    startedAtSample: null,
    startedAtMs: 0,
    status: commitCycleIndex === null ? 'recording' : 'committing',
    scratch,
    completedScratch,
    commitCycleIndex,
    overflowCount: 0,
  };
}

function testCaptureDisplayScratchTracksPrintablePhrase(): void {
  let completed = createCaptureScratch(4);
  completed = writeCaptureEventToStep(completed, 1, 0, {
    eventId: 110,
    midiNote: 60,
    velocity: 0.7,
    gateSeconds: 0.1,
  });
  let scratch = markCaptureStepVisited(completed, 0, 1);

  assert.equal(
    captureScratchForDisplay(makeCaptureSession(scratch, completed, null)),
    completed,
    'preview should keep showing the last printable phrase until the new cycle captures notes',
  );

  scratch = writeCaptureEventToStep(scratch, 2, 1, {
    eventId: 111,
    midiNote: 64,
    velocity: 0.8,
    gateSeconds: 0.1,
  });

  assert.equal(
    captureScratchForDisplay(makeCaptureSession(scratch, completed, null)),
    scratch,
    'preview should switch to the rolling phrase once the new cycle has notes',
  );
  assert.equal(
    captureScratchForDisplay(makeCaptureSession(scratch, completed, 0)),
    completed,
    'saving should preview the exact completed phrase selected for commit',
  );
}

function testGeneratedCaptureStopPolicy(): void {
  assert.equal(generatedCaptureStepPastHalf(7, 16), false);
  assert.equal(generatedCaptureStepPastHalf(8, 16), true);
  assert.deepEqual(
    chooseGeneratedCaptureStopAction({
      currentStepIndex: 3,
      stepCount: 16,
      completedCycleIndex: 4,
    }),
    { kind: 'commitCycle', cycleIndex: 4 },
    'stopping before halfway should print the previous completed phrase',
  );
  assert.deepEqual(
    chooseGeneratedCaptureStopAction({
      currentStepIndex: 8,
      stepCount: 16,
      completedCycleIndex: 4,
    }),
    { kind: 'finishCurrentPhrase' },
    'stopping at or after halfway should finish and save the current phrase',
  );
  assert.deepEqual(
    chooseGeneratedCaptureStopAction({
      currentStepIndex: 3,
      stepCount: 16,
      completedCycleIndex: null,
    }),
    { kind: 'finishCurrentPhrase' },
    'the first phrase should finish even if stop happens before halfway',
  );
}

function testFirstEventOrbitTimingUnwrapsPhraseBoundary(): void {
  const origin = 30;
  const stepCount = 32;
  const wrappedSteps = [30, 31, 1, 5, 5];
  let previous: number | null = null;
  const relativeSteps = wrappedSteps.map((step) => {
    const relative = firstEventRelativeTargetStep(step, origin, stepCount, previous);
    previous = relative;
    return relative;
  });

  assert.deepEqual(
    relativeSteps,
    [0, 1, 3, 7, 7],
    'Orbit first-trigger capture should unwrap wrapped target steps instead of clamping them to slot 1',
  );
}

function testGeneratedCaptureHistorySurvivesDisable(): void {
  const history = new CoreProductGeneratedSequencerCaptureTelemetryHistory();
  const telemetry = {
    generatedSequencerCaptureEvents: [{
      eventId: 1,
      absoluteSample: 128,
      sourceLaneIndex: 0,
      sourceMode: 'orbit',
      targetSourceId: 1,
      midiNote: 60,
      velocity: 0.75,
      gateSeconds: 0.2,
      sourceStepIndex: 1,
      sourceLayerIndex: null,
      sourceNoteIndex: null,
      targetStepIndex: 1,
      targetStepFloat: 1.15,
      nudge: 0.15,
    }],
    generatedSequencerCaptureOverflowCount: 2,
  } as CoreProductTelemetrySnapshot;

  const captured = history.withHistory(telemetry);
  const afterDisable = history.clearForEvent(
    createCoreProductGeneratedSequencerCaptureEvent({
      enabled: false,
      sourceLaneIndex: 0,
      targetLaneIndex: 0,
      sourceMode: 'orbit',
    }),
    captured,
  );
  assert.equal(
    afterDisable?.generatedSequencerCaptureEvents?.length,
    1,
    'disabling Product capture must not erase events before the UI commit flush reads them',
  );
  assert.equal(afterDisable?.generatedSequencerCaptureOverflowCount, 2);

  const afterEnable = history.clearForEvent(
    createCoreProductGeneratedSequencerCaptureEvent({
      enabled: true,
      sourceLaneIndex: 0,
      targetLaneIndex: 0,
      sourceMode: 'orbit',
    }),
    captured,
  );
  assert.equal(afterEnable?.generatedSequencerCaptureEvents?.length, 0);
  assert.equal(afterEnable?.generatedSequencerCaptureOverflowCount, 0);
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

  const exactCaptured = capturedMidisToNotePitchValues([60, 63, 67]);
  assert.deepEqual(exactCaptured.pitchValues, [60, 63, 67]);
  assert.deepEqual(exactCaptured.pitchSettings, {
    mode: 'notes',
    root: 60,
    scale: 'Chromatic',
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
  assert.deepEqual(triggerToggleEntries(stepOverrides, targetLaneIndex), [
    [0, true],
    [1, false],
    [2, true],
    [3, false],
  ]);
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
  const stepCommitRef: { current: GeneratedCaptureStepCommit | null } = { current: null };

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
    capturePitchReference: {
      root: 60,
      scale: 'Harmony',
      scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
    },
    sourceMode: 'anchorWalker',
    onStepCommit: (commit) => {
      stepCommitRef.current = commit;
    },
  });

  assert.deepEqual(stepOverrides.nudge[targetLaneIndex], [0, -0.25]);
  assert.equal(stepOverrides.nudgeDirection[targetLaneIndex], 'forward');
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.enabled, true);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.steps, 2);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.followTriggerHits, true);
  assert.deepEqual(pitchSettings[targetLaneIndex], {
    mode: 'semitones',
    root: 60,
    scale: 'Harmony',
  });

  const stepCommit = requireStepCommit(stepCommitRef.current);
  assert.equal(stepCommit.sourceMode, 'anchorWalker');
  assert.equal(stepCommit.targetLaneIndex, targetLaneIndex);
  assert.deepEqual(stepCommit.pitchMidiValues, [60, 64]);
  assert.deepEqual(stepCommit.pitchValues, [0, 2]);

  const productEvents = buildProductGeneratedCaptureStepCommitEvents(stepCommit);
  assert.equal(
    productEvents.every((event) => event.index === targetLaneIndex),
    true,
    'generated capture handoff must only clear/write the captured lane',
  );
  const lastEvent = productEvents[productEvents.length - 1];
  assert.equal(lastEvent?.eventKind, KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane);
  assert.equal(lastEvent?.paramId, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMode);
  assert.equal(lastEvent?.value, 0, 'Product handoff should switch audible mode to Step after writing the lane');

  const triggerEvents = productEvents.filter((event) => (
    event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep &&
    event.flags === CORE_PRODUCT_STEP_TOGGLE_FLAGS.active
  ));
  assert.deepEqual(
    triggerEvents.map((event) => [event.paramId, event.value === 1]),
    [
      [0, true],
      [1, false],
      [2, true],
      [3, false],
    ],
  );
  assert.deepEqual(
    productGeneratedCapturePitchEventValues(productEvents),
    [60, 64],
    'Product Step handoff must write captured MIDI notes to the audio thread',
  );
  const faces = createDefaultSynthSequencerFaceState();
  faces.slots[targetLaneIndex] = {
    ...faces.slots[targetLaneIndex]!,
    mode: 'anchorWalker',
  };
  const patch = generatedCaptureStepPatchForState({
    synthSequencerFaces: faces,
    synthPitchSettings: [
      { mode: 'semitones', root: 48, scale: 'Major' },
      { mode: 'semitones', root: 55, scale: 'Harmony' },
      { mode: 'notes', root: 60, scale: 'Chromatic' },
    ],
    synthStepOverrides: {
      triggerToggles: [
        [],
        [{ step: 0, value: true }, { step: 1, value: true }],
        [{ step: 3, value: true }],
      ],
      probability: [null, [0.25], [0.5]],
      ratchet: [null, [4], [2]],
      trigCondition: [null, [[2, 3]], [[1, 2]]],
      expression: [null, [0.1], [0.2]],
      pitch: [null, [99, 98, 97], [70]],
      morph: [null, [0.3], [0.4]],
      distance: [null, [0.5], [0.6]],
      nudge: [null, [0.75], [0.8]],
      expressionDirection: [null, 'reverse', 'forward'],
      pitchDirection: [null, 'reverse', 'forward'],
      morphDirection: [null, 'reverse', 'forward'],
      distanceDirection: [null, 'reverse', 'forward'],
      nudgeDirection: [null, 'reverse', 'forward'],
    },
  } as unknown as SliderState, stepCommit);
  assert.equal(
    (patch.synthSequencerFaces as typeof faces).slots[targetLaneIndex]?.mode,
    'euclid',
    'Product control patch must persist the Step mode handoff',
  );
  const stepOverridePatch = patch.synthStepOverrides as {
    triggerToggles: unknown[];
    pitch: unknown[];
    expression: unknown[];
    nudge: unknown[];
    ratchet: unknown[];
    morph: unknown[];
    distance: unknown[];
  };
  assert.deepEqual(
    stepOverridePatch.triggerToggles[targetLaneIndex],
    [
      { step: 0, value: true },
      { step: 1, value: false },
      { step: 2, value: true },
      { step: 3, value: false },
    ],
    'Product control patch must replace stale target-lane trigger toggles',
  );
  assert.deepEqual(stepOverridePatch.pitch[targetLaneIndex], [0, 2]);
  assert.deepEqual(stepOverridePatch.expression[targetLaneIndex], [0.5, 0.8]);
  assert.deepEqual(stepOverridePatch.nudge[targetLaneIndex], [0, -0.25]);
  assert.deepEqual(stepOverridePatch.ratchet[targetLaneIndex], null);
  assert.deepEqual(stepOverridePatch.morph[targetLaneIndex], null);
  assert.deepEqual(stepOverridePatch.distance[targetLaneIndex], null);
  assert.deepEqual(stepOverridePatch.pitch[2], [70], 'other lanes should be preserved');
  const pitchSettingsPatch = patch.synthPitchSettings as unknown[];
  assert.deepEqual(
    pitchSettingsPatch[targetLaneIndex],
    { mode: 'semitones', root: 60, scale: 'Harmony' },
    'Product control patch must freeze generated capture pitch settings as Harmony-relative Step offsets',
  );
  assert.deepEqual(
    pitchSettingsPatch[2],
    { mode: 'notes', root: 60, scale: 'Chromatic' },
    'other lane pitch settings should be preserved',
  );
}

function testCommitExpandsGridForSubstepCaptureCollisions(): void {
  const targetLaneIndex = 0;
  let scratch = createCaptureScratch(4);
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 50,
    midiNote: 60,
    velocity: 0.5,
    gateSeconds: 0.1,
    targetStepFloat: 0,
  });
  scratch = writeCaptureEventToStep(scratch, 0, 0, {
    eventId: 51,
    midiNote: 64,
    velocity: 0.6,
    gateSeconds: 0.1,
    targetStepFloat: 0.25,
  });
  scratch = writeCaptureEventToStep(scratch, 2, 0, {
    eventId: 52,
    midiNote: 67,
    velocity: 0.8,
    gateSeconds: 0.1,
    targetStepFloat: 2,
  });

  const params: Array<[number, string, number]> = [];
  let stepOverrides = makeStepOverrides();
  let subLaneStates = makeSubLaneStates();
  let stepCommit: GeneratedCaptureStepCommit | null = null;

  const seq: CommitGeneratedCaptureArgs['seq'] = {
    setParam: (laneIndex, suffix, value) => params.push([laneIndex, suffix, value]),
    setParamSelect: () => {},
    setStepOverrides: (action) => {
      stepOverrides = applyStateAction(stepOverrides, action);
    },
    setSubLaneStates: (action) => {
      subLaneStates = applyStateAction(subLaneStates, action);
    },
    setPitchSettings: () => {},
    setOpenLane: () => {},
  };

  commitGeneratedCaptureToEuclid({
    scratch,
    targetLaneIndex,
    seq,
    setSequencerMode: () => {},
    onStepCommit: (commit) => {
      stepCommit = commit;
    },
  });

  assert.deepEqual(params, [
    [targetLaneIndex, 'Steps', 8],
    [targetLaneIndex, 'Hits', 3],
    [targetLaneIndex, 'Rotation', 0],
  ]);
  assert.deepEqual(
    resolveTriggerClip(stepOverrides.triggerClips![targetLaneIndex]!),
    [true, true, false, false, true, false, false, false],
  );
  assert.deepEqual(stepOverrides.pitch[targetLaneIndex], [0, 4, 7]);
  assert.deepEqual(stepOverrides.expression[targetLaneIndex], [0.5, 0.6, 0.8]);
  assert.deepEqual(stepOverrides.nudge[targetLaneIndex], [0, -0.5, 0]);
  assert.equal(subLaneStates[targetLaneIndex]?.pitch.steps, 3);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.steps, 3);
  assert.equal(subLaneStates[targetLaneIndex]?.nudge.enabled, true);
  assert.equal(requireStepCommit(stepCommit).stepCount, 8);
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
  assert.deepEqual(triggerToggleEntries(stepOverrides, targetLaneIndex), [
    [0, false],
    [1, false],
    [2, true],
    [3, false],
    [4, false],
    [5, false],
    [6, true],
    [7, false],
  ]);
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
  assert.equal(
    triggerToggleEntries(stepOverrides, targetLaneIndex).filter(([, enabled]) => enabled).length,
    3,
  );
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
testCaptureDisplayScratchTracksPrintablePhrase();
testGeneratedCaptureStopPolicy();
testFirstEventOrbitTimingUnwrapsPhraseBoundary();
testGeneratedCaptureHistorySurvivesDisable();
testCapturedPitchConversion();
testCommitGeneratedCaptureToEuclid();
testCommitGeneratedCaptureWritesNudge();
testCommitExpandsGridForSubstepCaptureCollisions();
testCommitUsesLatestCaptureCycle();
testSameStepCapturePacksPitchAndDistributesTriggers();
testEmptyCaptureDoesNotOverwriteEuclidLane();
