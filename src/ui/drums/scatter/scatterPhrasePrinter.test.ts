import assert from 'node:assert/strict';

import type { TrigCondition } from '../../../audio/drumSeqTypes';
import { createEmptyStepOverrides } from '../../sequencer/stepOverrideSerialization';
import { createBitmapTriggerClip, serializeTriggerClip } from '../../sequencer/triggerClip';
import type { SubLaneKind, SubLaneState } from '../../sequencer/useEuclideanSequencer';
import { printGeneratedPhraseToLane } from './scatterPhrasePrinter';
import type { GeneratedDrumPhrase } from './scatterTypes';

type ScatterPhraseSubLane = SubLaneKind;

const SUB_LANES: ScatterPhraseSubLane[] = ['pitch', 'expression', 'morph', 'distance', 'nudge', 'slice', 'reverse'];

function laneState(enabled = false): SubLaneState {
  return {
    enabled,
    steps: 8,
    direction: 'forward',
    valueMode: 'sequence',
  };
}

function makeSubLaneStates(laneCount = 6): Record<SubLaneKind, SubLaneState>[] {
  return Array.from({ length: laneCount }, () => ({
    pitch: laneState(),
    expression: laneState(),
    morph: laneState(),
    distance: laneState(),
    nudge: laneState(),
    slice: laneState(),
    reverse: laneState(),
  }));
}

function makePhrase(): GeneratedDrumPhrase {
  const trigCondition: TrigCondition[] = [[1, 1], [1, 2], [2, 3], [1, 4], [1, 1], [2, 2], [1, 3], [1, 1]];
  return {
    id: 'kick-test-1',
    seed: 1,
    createdAt: 1,
    engine: 'kick',
    label: 'Kick test',
    triggerClip: createBitmapTriggerClip({
      steps: 8,
      bits: [true, false, true, false, false, true, false, true],
      origin: 'scatter',
      label: 'Kick test',
    }),
    clockDiv: '1/16',
    swing: 0.07,
    probability: [0.9, 1, 0.65, 1, 1, 0.75, 1, 0.5],
    ratchet: [1, 1, 2, 1, 1, 3, 1, 1],
    trigCondition,
    pitch: [0, 1, -1, 2, -2, 3, -3, 0],
    expression: [0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94],
    morph: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    distance: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    nudge: [0, -0.15, 0.1, 0.25],
    slice: [0, 1, 0, 2, 0, 3, 0, 4],
    reverse: [0, 0, 1, 0, 1, 0, 0, 1],
    directions: {
      pitch: 'forward',
      expression: 'pingpong',
      morph: 'reverse',
      distance: 'forward',
      nudge: 'forward',
      slice: 'reverse',
      reverse: 'forward',
    },
    subLaneEnabled: {
      pitch: true,
      expression: true,
      morph: true,
      distance: true,
      nudge: true,
      slice: true,
      reverse: true,
    },
    feel: { x: 0.2, y: 0.7, chaos: 0.85, zone: 'scatter' },
    summary: {
      steps: 8,
      hits: 4,
      contour: 'scatter',
      hasRatchet: true,
      hasSlice: true,
      hasReverse: true,
    },
  };
}

{
  const phrase = makePhrase();
  const previous = createEmptyStepOverrides(6);
  previous.probability[1] = [0.11, 0.22];
  previous.pitch[1] = [9, 8, 7];
  const result = printGeneratedPhraseToLane({
    phrase,
    laneIndex: 0,
    mode: 'replace',
    currentStepOverrides: previous,
    currentSubLaneStates: makeSubLaneStates(6),
  });

  assert.deepEqual(
    serializeTriggerClip(result.stepOverrides.triggerClips?.[0] ?? null),
    serializeTriggerClip(phrase.triggerClip),
    'replace should copy the phrase trigger clip exactly',
  );
  assert.deepEqual(result.stepOverrides.probability[0], phrase.probability, 'replace should write probability');
  assert.deepEqual(result.stepOverrides.ratchet[0], phrase.ratchet, 'replace should write ratchet');
  assert.deepEqual(result.stepOverrides.trigCondition[0], phrase.trigCondition, 'replace should write trig conditions');
  for (const lane of SUB_LANES) {
    assert.deepEqual(result.stepOverrides[lane][0], phrase[lane], `replace should write ${lane} lane values`);
    assert.equal(result.subLaneStates[0]![lane].enabled, phrase.subLaneEnabled[lane], `replace should write ${lane} enabled state`);
    assert.equal(result.subLaneStates[0]![lane].direction, phrase.directions[lane], `replace should write ${lane} direction`);
  }
  assert.deepEqual(result.stepOverrides.probability[1], [0.11, 0.22], 'printing lane 0 should preserve lane 1 probability');
  assert.deepEqual(result.stepOverrides.pitch[1], [9, 8, 7], 'printing lane 0 should preserve lane 1 pitch');
  assert.equal(result.clockDiv, phrase.clockDiv, 'replace should return phrase clock division');
  assert.equal(result.swing, phrase.swing, 'replace should return phrase swing');
  assert.equal(result.targetVoice, 'kick', 'replace should target the phrase engine');
}

{
  const phrase = makePhrase();
  const result = printGeneratedPhraseToLane({
    phrase,
    laneIndex: 5,
    mode: 'replace',
    currentStepOverrides: createEmptyStepOverrides(6),
    currentSubLaneStates: makeSubLaneStates(6),
  });

  assert.deepEqual(
    serializeTriggerClip(result.stepOverrides.triggerClips?.[5] ?? null),
    serializeTriggerClip(phrase.triggerClip),
    'replace should print into active lane 6',
  );
  assert.deepEqual(result.stepOverrides.morph[5], phrase.morph, 'lane 6 should receive phrase morph lane');
}

console.log('Scatter phrase printer tests passed');
