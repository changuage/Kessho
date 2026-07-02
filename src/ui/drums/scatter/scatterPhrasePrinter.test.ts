import assert from 'node:assert/strict';

import { DEFAULT_STATE } from '../../state';
import type { TrigCondition } from '../../../audio/drumSeqTypes';
import { seqEuclidean } from '../../../audio/drumSequencer';
import { drumVoiceBaseMidi } from '../../../audio/drumVoiceMidi';
import { drumPitchUiValuesToEngineOffsets } from '../../sequencer/drumPitchSequencer';
import { createEmptyStepOverrides } from '../../sequencer/stepOverrideSerialization';
import { createBitmapTriggerClip, resolveTriggerClip, serializeTriggerClip } from '../../sequencer/triggerClip';
import type { SubLaneKind, SubLaneState } from '../../sequencer/useEuclideanSequencer';
import { generateScatterPhrase } from './scatterPhraseGenerator';
import { printGeneratedPhraseToLane } from './scatterPhrasePrinter';
import { statePatchForScatterStep } from './scatterPreviewState';
import { scatterPhraseCooldownMs, scatterPhraseStepMs } from './useScatterSequencerRuntime';
import type { EngineScatterState, GeneratedDrumPhrase } from './scatterTypes';

type ScatterPhraseSubLane = SubLaneKind;

const AUDIBLE_SUB_LANES: ScatterPhraseSubLane[] = ['pitch', 'expression', 'morph', 'distance'];
const DISABLED_SCATTER_SUB_LANES: ScatterPhraseSubLane[] = ['nudge', 'slice', 'reverse'];

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

function enabledIndexes(pattern: readonly boolean[]): number[] {
  const indexes: number[] = [];
  pattern.forEach((enabled, index) => {
    if (enabled) indexes.push(index);
  });
  return indexes;
}

function activeValues(values: readonly number[], pattern: readonly boolean[]): number[] {
  return enabledIndexes(pattern).map((index) => values[index] ?? 0);
}

function roundedVariation(values: readonly number[], indexes: readonly number[], scale = 1): number {
  return new Set(indexes.map((index) => Math.round((values[index] ?? 0) * scale))).size;
}

function generatedEngineState(overrides: Partial<EngineScatterState> = {}): EngineScatterState {
  const rules = {
    anchor: 1,
    breath: 0.55,
    memory: 0.5,
    motion: 0.6,
    fracture: 0.2,
    spread: 0.45,
    ...(overrides.rules ?? {}),
  };
  return {
    enabled: true,
    triggerProbability: 0.5,
    burstProbability: 0.5,
    feelX: -0.75,
    feelY: 0,
    ...overrides,
    rules,
  };
}

function activeRange(values: readonly number[], pattern: readonly boolean[]): number {
  const active = activeValues(values, pattern);
  if (active.length < 2) return 0;
  return Math.max(...active) - Math.min(...active);
}

function hasAdjacentHits(pattern: readonly boolean[]): boolean {
  return pattern.some((enabled, index) => enabled && Boolean(pattern[(index + 1) % pattern.length]));
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
  const activePattern = resolveTriggerClip(phrase.triggerClip);

  assert.equal(result.stepOverrides.triggerClips?.[0]?.origin, 'manual', 'replace should print scatter as a manual step pattern');
  assert.deepEqual(resolveTriggerClip(result.stepOverrides.triggerClips![0]!), activePattern, 'replace should preserve the exact scatter trigger pattern in the step sequencer');
  assert.deepEqual(
    Array.from(result.stepOverrides.triggerToggles[0] ?? []),
    activePattern.map((enabled, step) => [step, enabled] as [number, boolean]),
    'replace should write every trigger step as runtime toggles',
  );
  assert.deepEqual(result.stepOverrides.probability[0], phrase.probability, 'replace should write probability');
  assert.deepEqual(result.stepOverrides.ratchet[0], activeValues(phrase.ratchet, activePattern), 'replace should write ratchet per active hit');
  assert.deepEqual(result.stepOverrides.trigCondition[0], phrase.trigCondition, 'replace should write trig conditions');
  for (const lane of AUDIBLE_SUB_LANES) {
    assert.deepEqual(result.stepOverrides[lane][0], activeValues(phrase[lane], activePattern), `replace should write ${lane} values only for active trigger hits`);
    assert.equal(result.subLaneStates[0]![lane].enabled, phrase.subLaneEnabled[lane], `replace should write ${lane} enabled state`);
    assert.equal(result.subLaneStates[0]![lane].steps, enabledIndexes(activePattern).length, `replace should size ${lane} lane to active trigger hits`);
    assert.equal(result.subLaneStates[0]![lane].direction, phrase.directions[lane], `replace should write ${lane} direction`);
  }
  for (const lane of DISABLED_SCATTER_SUB_LANES) {
    assert.equal(result.stepOverrides[lane][0], null, `replace should not wire ${lane} from scatter`);
    assert.equal(result.subLaneStates[0]![lane].enabled, false, `replace should disable ${lane} for scatter`);
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

  assert.equal(result.stepOverrides.triggerClips?.[5]?.origin, 'manual', 'lane 6 should print scatter as a manual step pattern');
  assert.deepEqual(
    Array.from(result.stepOverrides.triggerToggles[5] ?? []),
    resolveTriggerClip(phrase.triggerClip).map((enabled, step) => [step, enabled] as [number, boolean]),
    'lane 6 should receive the exact phrase trigger pattern as runtime toggles',
  );
  assert.deepEqual(result.stepOverrides.morph[5], [phrase.morph[0], phrase.morph[2], phrase.morph[5], phrase.morph[7]], 'lane 6 should receive phrase morph values per active hit');
}

{
  const phrase: GeneratedDrumPhrase = {
    ...makePhrase(),
    triggerClip: createBitmapTriggerClip({
      steps: 8,
      bits: [true, false, true, false, false, true, false, false],
      origin: 'scatter',
      label: 'Tail rest test',
    }),
    ratchet: [1, 8, 2, 8, 8, 3, 8, 8],
    pitch: [10, 99, 11, 99, 99, 12, 99, 99],
    expression: [0.71, 0, 0.82, 0, 0, 0.93, 0, 0],
    morph: [0.2, 0, 0.4, 0, 0, 0.6, 0, 0],
    distance: [0.3, 0, 0.5, 0, 0, 0.7, 0, 0],
  };
  const result = printGeneratedPhraseToLane({
    phrase,
    laneIndex: 0,
    mode: 'replace',
    currentStepOverrides: createEmptyStepOverrides(6),
    currentSubLaneStates: makeSubLaneStates(6),
  });

  assert.deepEqual(result.stepOverrides.pitch[0], [10, 11, 12], 'printed scatter pitch should skip empty trigger steps and tail rests');
  assert.deepEqual(result.stepOverrides.expression[0], [0.71, 0.82, 0.93], 'printed scatter expression should be indexed by active hits');
  assert.deepEqual(result.stepOverrides.morph[0], [0.2, 0.4, 0.6], 'printed scatter morph should be indexed by active hits');
  assert.deepEqual(result.stepOverrides.distance[0], [0.3, 0.5, 0.7], 'printed scatter distance should be indexed by active hits');
  assert.deepEqual(result.stepOverrides.ratchet[0], [1, 2, 3], 'printed scatter ratchet should be indexed by active hits');
  assert.equal(result.subLaneStates[0]!.pitch.steps, 3, 'printed scatter pitch lane should end at the last active hit, not at tail rests');
}

{
  const engineState: EngineScatterState = {
    enabled: true,
    triggerProbability: 1,
    burstProbability: 1,
    feelX: 0,
    feelY: -0.95,
    rules: {
      anchor: 1,
      breath: 0,
      memory: 0.5,
      motion: 1,
      fracture: 0.6,
      spread: 1,
    },
  };
  const phrase = generateScatterPhrase({
    engine: 'click',
    engineState,
    previousPhrases: [],
    seed: 1729,
  });
  const pattern = resolveTriggerClip(phrase.triggerClip);
  const hits = enabledIndexes(pattern);

  assert.ok(hits.length > 1, 'dense scatter phrase should produce multiple hits');
  assert.ok(roundedVariation(phrase.pitch, hits) > 1, 'generated scatter phrase should vary pitch on active hits');
  assert.ok(hits.some((step) => (phrase.pitch[step] ?? 0) < 0), 'generated scatter phrase should include negative pitch offsets');
  assert.ok(hits.some((step) => (phrase.pitch[step] ?? 0) > 0), 'generated scatter phrase should include positive pitch offsets');
  assert.ok(
    Math.max(...hits.map((step) => Math.abs(phrase.pitch[step] ?? 0))) >= 16,
    'generated scatter pitch variation should be large enough to hear on drum engines',
  );
  assert.ok(roundedVariation(phrase.morph, hits, 100) > 1, 'generated scatter phrase should vary morph on active hits');
  assert.ok(roundedVariation(phrase.distance, hits, 100) > 1, 'generated scatter phrase should vary distance on active hits');
  assert.equal(phrase.subLaneEnabled.pitch, true, 'pitch sub-lane should be enabled when generated pitch varies');
  assert.equal(phrase.subLaneEnabled.morph, true, 'morph sub-lane should be enabled when generated morph varies');
  assert.equal(phrase.subLaneEnabled.distance, true, 'distance sub-lane should be enabled when generated distance varies');
  assert.equal(phrase.subLaneEnabled.nudge, false, 'scatter generator should not enable nudge');
  assert.equal(phrase.subLaneEnabled.slice, false, 'scatter generator should not enable slice');
  assert.equal(phrase.subLaneEnabled.reverse, false, 'scatter generator should not enable reverse');
  assert.deepEqual(phrase.nudge, new Array(hits.length).fill(0), 'scatter generator should emit neutral nudge values');
  assert.ok(phrase.slice.every((value) => value === 0), 'scatter generator should emit neutral slice values');
  assert.ok(phrase.reverse.every((value) => value === 0), 'scatter generator should emit neutral reverse values');
}

{
  for (const burstProbability of [0, 0.25, 0.5, 0.75, 1]) {
    const phrase = generateScatterPhrase({
      engine: 'click',
      engineState: generatedEngineState({
        triggerProbability: 0.05,
        burstProbability,
        feelX: -1,
        feelY: 0.05,
        rules: {
          anchor: 1,
          breath: 1,
          memory: 0.5,
          motion: 0.45,
          fracture: 0,
          spread: 0.2,
        },
      }),
      previousPhrases: [],
      seed: 2400,
    });
    const pattern = resolveTriggerClip(phrase.triggerClip);
    const expectedHits = Math.max(1, Math.min(pattern.length, Math.round(pattern.length * burstProbability)));

    assert.equal(
      enabledIndexes(pattern).length,
      expectedHits,
      `burst ${burstProbability} should map to hit count as a percentage of generated steps`,
    );
    assert.equal(phrase.triggerClip.origin, 'euclidean', 'scatter-generated rhythms should be printable as Euclidean lane controls');
    assert.equal(phrase.triggerClip.generator?.kind, 'euclidean', 'scatter-generated trigger clips should carry Euclidean steps/hits/rotation metadata');
    assert.deepEqual(
      pattern,
      seqEuclidean(phrase.summary.steps, phrase.summary.hits, phrase.summary.rotation ?? 0),
      'scatter-generated trigger pattern should exactly match its Euclidean steps/hits/rotation',
    );
  }
}

{
  const engineState = generatedEngineState({
    triggerProbability: 1,
    burstProbability: 0.4,
    feelX: 1,
    feelY: 0.9,
    rules: {
      anchor: 0,
      breath: 0,
      memory: 0.5,
      motion: 0.75,
      fracture: 1,
      spread: 0.6,
    },
  });

  for (let seed = 6000; seed < 6080; seed += 1) {
    const phrase = generateScatterPhrase({
      engine: 'click',
      engineState,
      previousPhrases: [],
      seed,
    });
    const pattern = resolveTriggerClip(phrase.triggerClip);
    const hits = enabledIndexes(pattern).length;

    if (hits <= Math.floor(pattern.length / 2)) {
      assert.equal(
        hasAdjacentHits(pattern),
        false,
        `sparse Euclidean-rooted scatter phrase should not create avoidable adjacent hits for ${pattern.length} steps / ${hits} hits`,
      );
    }
  }
}

{
  const lowTriggerPhrase = generateScatterPhrase({
    engine: 'noise',
    engineState: generatedEngineState({
      triggerProbability: 0.05,
      burstProbability: 0.5,
      feelX: 0.85,
      feelY: 0.7,
    }),
    previousPhrases: [],
    seed: 3017,
  });
  const highTriggerPhrase = generateScatterPhrase({
    engine: 'noise',
    engineState: generatedEngineState({
      triggerProbability: 1,
      burstProbability: 0.5,
      feelX: 0.85,
      feelY: 0.7,
    }),
    previousPhrases: [],
    seed: 3017,
  });

  assert.deepEqual(
    serializeTriggerClip(highTriggerPhrase.triggerClip),
    serializeTriggerClip(lowTriggerPhrase.triggerClip),
    'trigger probability should not shape the generated rhythm',
  );
  assert.deepEqual(highTriggerPhrase.pitch, lowTriggerPhrase.pitch, 'trigger probability should not shape generated pitch cells');
  assert.deepEqual(highTriggerPhrase.expression, lowTriggerPhrase.expression, 'trigger probability should not shape generated expression cells');
  assert.deepEqual(highTriggerPhrase.morph, lowTriggerPhrase.morph, 'trigger probability should not shape generated morph cells');
  assert.deepEqual(highTriggerPhrase.distance, lowTriggerPhrase.distance, 'trigger probability should not shape generated distance cells');
}

{
  const phrase = generateScatterPhrase({
    engine: 'click',
    engineState: generatedEngineState({
      triggerProbability: 1,
      burstProbability: 0.55,
      feelX: 0.9,
      feelY: 0.75,
      rules: {
        anchor: 0.65,
        breath: 0.3,
        memory: 0.5,
        motion: 0.9,
        fracture: 0.7,
        spread: 0.8,
      },
    }),
    previousPhrases: [],
    seed: 4091,
  });
  const pattern = resolveTriggerClip(phrase.triggerClip);
  const hits = enabledIndexes(pattern);
  const result = printGeneratedPhraseToLane({
    phrase,
    laneIndex: 2,
    mode: 'replace',
    currentStepOverrides: createEmptyStepOverrides(6),
    currentSubLaneStates: makeSubLaneStates(6),
  });

  assert.ok(hits.length > 1, 'generated phrase should have multiple trigger hits for hit-indexed print coverage');
  assert.deepEqual(phrase.probability, new Array(pattern.length).fill(1), 'scatter-generated trigger hits should not add hidden per-hit probability gates');
  assert.ok(phrase.trigCondition.every((condition) => condition[0] === 1 && condition[1] === 1), 'scatter-generated trigger hits should not add hidden trig-condition skips');
  assert.equal(result.stepOverrides.pitch[2]?.length, hits.length, 'printed pitch cells should match trigger-hit count');
  assert.equal(result.stepOverrides.expression[2]?.length, hits.length, 'printed expression cells should match trigger-hit count');
  assert.equal(result.stepOverrides.morph[2]?.length, hits.length, 'printed morph cells should match trigger-hit count');
  assert.equal(result.stepOverrides.distance[2]?.length, hits.length, 'printed distance cells should match trigger-hit count');
  assert.equal(result.stepOverrides.ratchet[2]?.length, hits.length, 'printed ratchet cells should match trigger-hit count');
}

{
  const stableState = generatedEngineState({
    triggerProbability: 1,
    burstProbability: 0.8,
    feelX: -1,
    feelY: -0.85,
    rules: {
      anchor: 1,
      breath: 1,
      memory: 0.5,
      motion: 0.35,
      fracture: 0,
      spread: 0.15,
    },
  });
  const extremeState = generatedEngineState({
    triggerProbability: 1,
    burstProbability: 0.8,
    feelX: 1,
    feelY: 0.95,
    rules: {
      anchor: 0.2,
      breath: 0,
      memory: 0.5,
      motion: 0.9,
      fracture: 0.9,
      spread: 0.85,
    },
  });
  const stableExpressionRange = Array.from({ length: 12 }, (_, index) => {
    const phrase = generateScatterPhrase({ engine: 'click', engineState: stableState, previousPhrases: [], seed: 5200 + index });
    return activeRange(phrase.expression, resolveTriggerClip(phrase.triggerClip));
  }).reduce((sum, range) => sum + range, 0) / 12;
  const extremeExpressionRange = Array.from({ length: 12 }, (_, index) => {
    const phrase = generateScatterPhrase({ engine: 'click', engineState: extremeState, previousPhrases: [], seed: 5200 + index });
    return activeRange(phrase.expression, resolveTriggerClip(phrase.triggerClip));
  }).reduce((sum, range) => sum + range, 0) / 12;

  assert.ok(
    extremeExpressionRange > stableExpressionRange + 0.08,
    'expression should become more extreme when Feel X is unstable and Feel Y is high',
  );
}

{
  const lowWalkPhrase = generateScatterPhrase({
    engine: 'click',
    engineState: generatedEngineState({
      burstProbability: 0.65,
      feelX: -0.8,
      feelY: 0,
      randomWalk: 0,
      randomWalkEnabled: true,
    }),
    previousPhrases: [],
    seed: 6100,
  });
  const highWalkPhrase = generateScatterPhrase({
    engine: 'click',
    engineState: generatedEngineState({
      burstProbability: 0.65,
      feelX: -0.8,
      feelY: 0,
      randomWalk: 1,
      randomWalkEnabled: true,
    }),
    previousPhrases: [],
    seed: 6100,
  });

  assert.notEqual(lowWalkPhrase.summary.contour, 'randomWalk', 'low Walk should not force random-walk contours');
  assert.equal(highWalkPhrase.summary.contour, 'randomWalk', 'Walk should shape the next generated phrase when generation runs');
}

{
  const regularPhrase = generateScatterPhrase({
    engine: 'click',
    engineState: generatedEngineState({
      burstProbability: 0.65,
      feelX: -0.8,
      feelY: 0,
      randomWalk: 1,
      randomWalkEnabled: false,
    }),
    previousPhrases: [],
    seed: 6100,
  });

  assert.notEqual(regularPhrase.summary.contour, 'randomWalk', 'regular chance mode should ignore stored Walk amount');
}

{
  const phrase = makePhrase();
  const clickPhrase: GeneratedDrumPhrase = {
    ...phrase,
    engine: 'click',
    pitch: [12, ...phrase.pitch.slice(1)],
  };
  const patch = statePatchForScatterStep(clickPhrase, 0, {
    ...DEFAULT_STATE,
    drumClickPresetA: 'Data Point',
    drumClickPresetB: 'Data Point',
    drumClickPitch: 1000,
    drumClickFilter: 4000,
  });

  assert.equal(patch.drumClickPitch, 2000, 'scatter preview pitch should transpose the click pitch parameter');
  assert.equal(patch.drumClickFilter, 8000, 'scatter preview pitch should transpose click filter for impulse/noise click modes');
  assert.equal(patch.drumClickMorph, clickPhrase.morph[0], 'scatter preview should still patch the routed morph parameter');
  assert.equal(patch.drumClickDistance, clickPhrase.distance[0], 'scatter preview should still patch the routed distance parameter');
  assert.equal(patch.drumClickPresetB, undefined, 'scatter preview should not replace a visible matching B preset');

  const routedMorphPatch = statePatchForScatterStep(clickPhrase, 0, {
    ...DEFAULT_STATE,
    drumClickPresetA: 'Data Point',
    drumClickPresetB: 'Seed Pod',
  });
  assert.equal(routedMorphPatch.drumClickPresetB, undefined, 'scatter preview should preserve an existing distinct morph endpoint');
}

{
  const clickBaseMidi = drumVoiceBaseMidi('click');
  const phrasePitch = [-48, -7, -1, 7, 12, 48];
  const engineOffsets = drumPitchUiValuesToEngineOffsets(
    phrasePitch,
    { mode: 'semitones', root: clickBaseMidi, scale: 'Chromatic' },
    clickBaseMidi,
  );

  assert.deepEqual(engineOffsets, phrasePitch, 'scatter print pitch settings should preserve semitone offsets exactly');
}

{
  const phrase = {
    ...makePhrase(),
    clockDiv: '1/8' as const,
    triggerClip: createBitmapTriggerClip({
      steps: 8,
      bits: [true, false, false, false, false, false, false, true],
      origin: 'scatter',
      label: 'Cooldown test',
    }),
  };
  const stepMs = scatterPhraseStepMs(phrase, 120);
  assert.equal(stepMs, 250, 'scatter runtime should derive phrase timing from the phrase clock division');
  assert.equal(scatterPhraseCooldownMs(phrase, 120), 2250, 'scatter runtime cooldown should cover the full phrase plus a guard step');
}

console.log('Scatter phrase printer tests passed');
