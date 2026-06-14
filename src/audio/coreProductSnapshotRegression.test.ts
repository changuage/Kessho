import assert from 'node:assert/strict';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import { buildCoreProductSnapshotDiff } from './CoreProductRuntimeAdapter';
import { CORE_PRODUCT_SOURCE_IDS, resolveCoreProductRangeTargets } from './coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  normalizeSequencerChainState,
  resolveSequencerChainPosition,
} from './sequencerChain';
import { createDefaultSynthSequencerFaceState } from '../ui/sequencer/sequencerModeTypes';
import { TAU, resolveAngularSpeed } from '../ui/sequencer/orbitSequencerMath';
import { createDefaultOrbitNote } from '../ui/sequencer/orbitSequencerTypes';

const disabledDelaySnapshot = createCoreProductSnapshot({
  padEnabled: true,
  synthLevel: 1,
  pad1DelayASend: 1,
  pad1DelayBSend: 1,
  delayAEnabled: false,
  delayAMix: 1,
  delayAReverbSend: 1,
  delayAToBSend: 1,
  delayAGranularSend: 1,
  delayADegradeSend: 1,
  granularDelayEnabled: false,
  granularDelayMix: 1,
  granularDelayReverbSend: 1,
  delayBToASend: 1,
  delayBGranularSend: 1,
  delayBDegradeSend: 1,
  granularDelayASend: 1,
  granularDelayBSend: 1,
});

const pad1Source = disabledDelaySnapshot.sources.find((source) => source.delayASend > 0.9 && source.delayBSend > 0.9);
assert(pad1Source, 'regression fixture should keep active source delay sends');
assert.equal(disabledDelaySnapshot.fx.delayAEnabled, false, 'Delay A disabled flag must not be auto-enabled by active sends');
assert.equal(disabledDelaySnapshot.fx.delayAMix, 0, 'Delay A mix should resolve to silence while disabled');
assert.equal(disabledDelaySnapshot.fx.delayBEnabled, false, 'Delay B disabled flag must not be auto-enabled by active sends');
assert.equal(disabledDelaySnapshot.fx.delayBMix, 0, 'Delay B mix should resolve to silence while disabled');

const delayAEnableTargets = resolveCoreProductRangeTargets('delayAEnabled');
assert.equal(delayAEnableTargets.length, 1, 'Delay A enable should have one live Product Core target');
assert.equal(delayAEnableTargets[0]?.paramId, KESSHO_PRODUCT_PARAM_IDS.FxDelayAEnabled);
assert.equal(delayAEnableTargets[0]?.mapValue?.(0, {}), 0);
assert.equal(delayAEnableTargets[0]?.mapValue?.(1, {}), 1);

const delayBEnableTargets = resolveCoreProductRangeTargets('granularDelayEnabled');
assert.equal(delayBEnableTargets.length, 1, 'Delay B enable should have one live Product Core target');
assert.equal(delayBEnableTargets[0]?.paramId, KESSHO_PRODUCT_PARAM_IDS.FxDelayBEnabled);
assert.equal(delayBEnableTargets[0]?.mapValue?.(0, {}), 0);
assert.equal(delayBEnableTargets[0]?.mapValue?.(1, {}), 1);

{
  const chain = normalizeSequencerChainState({
    enabled: true,
    entries: [
      { laneIndex: 0, repeats: 2 },
      { laneIndex: 8, repeats: 99 },
      { laneIndex: 1, repeats: 2 },
    ],
  });
  assert.deepEqual(chain, {
    version: 1,
    enabled: true,
    entries: [
      { laneIndex: 0, repeats: 2 },
      { laneIndex: 3, repeats: 16 },
      { laneIndex: 1, repeats: 2 },
    ],
  });

  const positionA = resolveSequencerChainPosition(chain, [
    { laneIndex: 0, durationSeconds: 1 },
    { laneIndex: 1, durationSeconds: 1 },
    { laneIndex: 2, durationSeconds: 1 },
    { laneIndex: 3, durationSeconds: 1 },
  ], 1.5);
  assert.equal(positionA?.activeLaneIndex, 0, 'chain should repeat Seq 1 before advancing');
  assert.equal(positionA?.activeEntryIndex, 0);

  const positionB = resolveSequencerChainPosition(chain, [
    { laneIndex: 0, durationSeconds: 1 },
    { laneIndex: 1, durationSeconds: 1 },
    { laneIndex: 2, durationSeconds: 1 },
    { laneIndex: 3, durationSeconds: 1 },
  ], 18.25);
  assert.equal(positionB?.activeLaneIndex, 1, 'chain should advance to Seq 2 after earlier repeats');
  assert.equal(positionB?.activeEntryIndex, 2);

  const positionWithSkippedLane = resolveSequencerChainPosition(chain, [
    { laneIndex: 0, durationSeconds: 1 },
    { laneIndex: 1, durationSeconds: 1 },
  ], 2.25);
  assert.equal(positionWithSkippedLane?.activeLaneIndex, 1, 'chain should skip entries for lanes that are not playable');
  assert.equal(positionWithSkippedLane?.activeEntryIndex, 2);
}

const synthSourceAliasCases = [
  ['lead', CORE_PRODUCT_SOURCE_IDS.lead1],
  ['lead1', CORE_PRODUCT_SOURCE_IDS.lead1],
  ['lead2', CORE_PRODUCT_SOURCE_IDS.lead2],
  ['piano', CORE_PRODUCT_SOURCE_IDS.piano],
  ['pad', CORE_PRODUCT_SOURCE_IDS.pad1],
  ['pad1', CORE_PRODUCT_SOURCE_IDS.pad1],
  ['pad2', CORE_PRODUCT_SOURCE_IDS.pad2],
  ['synth1', CORE_PRODUCT_SOURCE_IDS.pad1],
] as const;

for (const [sourceValue, expectedSourceId] of synthSourceAliasCases) {
  const snapshot = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: sourceValue,
  });
  assert.equal(
    snapshot.synthLanes[0]?.targetSourceId,
    expectedSourceId,
    `Product synth sequencer source ${sourceValue} should map to the intended source ID`,
  );
}

for (const mode of ['anchorWalker', 'orbit'] as const) {
  for (const [sourceValue, expectedSourceId] of [
    ['pad1', CORE_PRODUCT_SOURCE_IDS.pad1],
    ['pad2', CORE_PRODUCT_SOURCE_IDS.pad2],
    ['lead1', CORE_PRODUCT_SOURCE_IDS.lead1],
  ] as const) {
    const faces = createDefaultSynthSequencerFaceState();
    faces.slots[0] = {
      ...faces.slots[0]!,
      mode,
    };
    const snapshot = createCoreProductSnapshot({
      synthEuclideanMasterEnabled: true,
      synthEuclid1Enabled: true,
      synthEuclid1Source: sourceValue,
      synthSequencerFaces: faces,
    });
    assert.equal(
      snapshot.synthLanes[0]?.targetSourceId,
      expectedSourceId,
      `${mode} lane should follow Seq source ${sourceValue}`,
    );
    if (mode === 'orbit') {
      assert.equal(
        snapshot.synthLanes[0]?.orbit.targetSourceId,
        expectedSourceId,
        `Orbit face target should follow Seq source ${sourceValue}`,
      );
    } else {
      assert.equal(
        snapshot.synthLanes[0]?.anchorWalker.targetSourceId,
        expectedSourceId,
        `Walker face target should follow Seq source ${sourceValue}`,
      );
    }
  }
}

{
  const nativeBaseAt60Bpm = TAU * (60 / 60) * 1 * 0.25;
  assert.equal(
    resolveAngularSpeed('bpmPercent', 100, 100, 60),
    nativeBaseAt60Bpm,
    'Orbit visualizer speed should match Product Core base angular velocity at 60 BPM',
  );
  assert.equal(
    resolveAngularSpeed('syncDivisor', 800, 100, 120),
    resolveAngularSpeed('syncDivisor', 64, 100, 120),
    'Orbit visualizer sync divisors should use the same max clamp as Product Core',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
  };
  const baseState = {
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthSequencerFaces: faces,
  };
  const baseSnapshot = createCoreProductSnapshot(baseState);

  const speedFaces = structuredClone(faces);
  speedFaces.slots[0]!.orbit.speedOffset = 1;
  const speedDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    synthSequencerFaces: speedFaces,
  }));
  assert.equal(speedDiff.applied, true, 'Orbit speed offset should stay on the live dirty-diff path');
  assert(
    speedDiff.applied && speedDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteSpeedValue
    )),
    'Orbit speed offset should emit note speed-value events',
  );

  const eightNodeFaces = structuredClone(faces);
  eightNodeFaces.slots[0]!.orbit = {
    ...eightNodeFaces.slots[0]!.orbit,
    quantizedOffset: 8,
    notes: Array.from({ length: 8 }, (_, index) => createDefaultOrbitNote(index, {
      id: `orbit-note-${index + 1}`,
      radiusNorm: 0.2 + index * 0.1,
      phase: (TAU * index) / 8,
      pitchMode: 'harmonyBloom',
      speedMode: 'bpmPercent',
      speedValue: 100,
      midiNote: 60 + index,
      harmonyDegree: index % 7,
    })),
  };
  const eightNodeBaseState = {
    ...baseState,
    synthSequencerFaces: eightNodeFaces,
  };
  const eightNodeBaseSnapshot = createCoreProductSnapshot(eightNodeBaseState);
  const eightNodeSpeedFaces = structuredClone(eightNodeFaces);
  eightNodeSpeedFaces.slots[0]!.orbit.speedOffset = 1;
  const eightNodeSpeedDiff = buildCoreProductSnapshotDiff(eightNodeBaseSnapshot, createCoreProductSnapshot({
    ...eightNodeBaseState,
    synthSequencerFaces: eightNodeSpeedFaces,
  }));
  assert.equal(eightNodeSpeedDiff.applied, true, 'Orbit 8-node speed offset should stay on the live dirty-diff path');
  const eightNodeSpeedEventIndices = new Set(eightNodeSpeedDiff.applied
    ? eightNodeSpeedDiff.events
      .filter((event) => (
        event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteSpeedValue &&
        event.index === 0
      ))
      .map((event) => event.flags ?? 0)
    : []);
  for (let noteIndex = 0; noteIndex < 8; noteIndex += 1) {
    assert(
      eightNodeSpeedEventIndices.has(noteIndex),
      `Orbit speed offset should emit speed-value event for visible node index ${noteIndex}`,
    );
  }

  const phaseFaces = structuredClone(faces);
  phaseFaces.slots[0]!.orbit.notes = phaseFaces.slots[0]!.orbit.notes.map((note) => ({
    ...note,
    phase: note.phase + TAU * 0.25,
  }));
  const phaseDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    synthSequencerFaces: phaseFaces,
  }));
  assert.equal(phaseDiff.applied, true, 'Orbit phase changes should stay on the live dirty-diff path');
  assert(
    phaseDiff.applied && phaseDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePhase
    )),
    'Orbit phase changes should emit note phase events',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
  };
  const baseState = {
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthSequencerFaces: faces,
  };
  const baseSnapshot = createCoreProductSnapshot(baseState);

  const fiveNodeFaces = structuredClone(faces);
  fiveNodeFaces.slots[0]!.orbit = {
    ...fiveNodeFaces.slots[0]!.orbit,
    quantizedOffset: 5,
    notes: Array.from({ length: 5 }, (_, index) => createDefaultOrbitNote(index, {
      id: `orbit-note-${index + 1}`,
      radiusNorm: 0.24 + index * 0.14,
      phase: (TAU * index) / 5,
      pitchMode: 'harmonyBloom',
      speedMode: 'bpmPercent',
      speedValue: 100,
      midiNote: 60 + index,
      harmonyDegree: (index * 2) % 7,
    })),
  };
  const fiveNodeDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    synthSequencerFaces: fiveNodeFaces,
  }));
  assert.equal(fiveNodeDiff.applied, true, 'Orbit 5-node Bloom layout should stay on the live dirty-diff path');
  assert(
    fiveNodeDiff.applied && fiveNodeDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteCount &&
      event.value === 5
    )),
    'Orbit 5-node Bloom layout should emit the native note count',
  );
  for (const noteIndex of [3, 4]) {
    assert(
      fiveNodeDiff.applied && fiveNodeDiff.events.some((event) => (
        event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePhase &&
        event.flags === noteIndex
      )),
      `Orbit 5-node Bloom layout should emit phase for node index ${noteIndex}`,
    );
  }
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
    orbit: {
      ...firstSlot.orbit,
      pitchLayout: 'harmonyBloom',
      notes: firstSlot.orbit.notes.map((note, index) => ({
        ...note,
        pitchMode: index === 0 ? 'harmonyBloom' : note.pitchMode,
        speedMode: index === 0 ? 'bpmPercent' : note.speedMode,
        speedValue: index === 0 ? 100 : note.speedValue,
      })),
    },
  };
  const snapshot = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthSequencerFaces: faces,
  });
  assert.equal(snapshot.synthLanes[0]?.orbit.notes[0]?.pitchMode, 3, 'Orbit Harmony Bloom pitch mode should encode as Product Core mode 3');
  assert.equal(snapshot.synthLanes[0]?.orbit.notes[0]?.speedValue, 100, 'Orbit Harmony Bloom note should preserve shared loop speed');
}
