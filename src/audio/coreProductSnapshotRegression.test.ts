import assert from 'node:assert/strict';
import { createCoreProductSnapshot } from './coreProductSnapshot';
import { buildCoreProductSnapshotDiff } from './CoreProductRuntimeAdapter';
import {
  CORE_PRODUCT_SOURCE_IDS,
  CORE_PRODUCT_TIMING_FLAGS,
  CORE_PRODUCT_TRANSPORT_FLAGS,
  createCoreProductSequencerLaneParamEvent,
  resolveCoreProductRangeTargets,
} from './coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  SAMPLE_DYNAMIC_IDS_BY_KEY,
  SAMPLE_LIBRARY_IDS_BY_KEY,
} from './sampleLibraries/generated/sampleLibraryRegistry.generated';
import {
  normalizeSequencerChainState,
  resolveSequencerChainPosition,
} from './sequencerChain';
import { createDefaultSynthSequencerFaceState } from '../ui/sequencer/sequencerModeTypes';
import { applySampleLibrarySelectionDefaultsToFlatState } from './sampleLibraries/sampleLibrarySelectionDefaults';
import type { SampleLibraryKey, SampleSlotId } from './sampleLibraries/SampleLibraryTypes';
import {
  ORBIT_EVEN_REVERSE_THRESHOLD,
  TAU,
  adjustedOrbitSpeedValue,
  effectiveOrbitDirection,
  orbitClockedBpmPercent,
  orbitClockedLoopBeats,
  orbitAuthoredPhaseFromVisual,
  orbitPhaseOffsetTurns,
  orbitSpeedOffsetFactor,
  orbitSpeedOffsetStats,
  orbitVisualPhase,
  resolveAngularSpeed,
  snapOrbitPhase,
} from '../ui/sequencer/orbitSequencerMath';
import { generateOrbitConstellation } from '../ui/sequencer/orbitConstellation';
import { createDefaultOrbitNote, normalizeOrbitSequencerConfig } from '../ui/sequencer/orbitSequencerTypes';
import { createWalkerLayer } from '../ui/sequencer/anchorWalkerTypes';
import {
  isReleaseCommittedTransportTimingKey,
  isTransportClockStateKey,
} from '../ui/transportTimingPolicy';

assert.equal(isReleaseCommittedTransportTimingKey('phraseLength'), true);
assert.equal(isReleaseCommittedTransportTimingKey('sequencerMasterBPM'), true);
assert.equal(isReleaseCommittedTransportTimingKey('transportBarsPerPhrase'), true);
assert.equal(isReleaseCommittedTransportTimingKey('transportBeatsPerBar'), true);
assert.equal(isReleaseCommittedTransportTimingKey('synthLevel'), false);
assert.equal(isTransportClockStateKey('transportPrimaryClock'), true);

for (const paramId of [
  KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision,
  KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTempoMultiplier,
  KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing,
]) {
  assert.equal(
    createCoreProductSequencerLaneParamEvent('synth', 0, paramId, 1).flags,
    CORE_PRODUCT_TIMING_FLAGS.applyNextPhrase,
    'sequencer timing event constructors should default to next-phrase application',
  );
}

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

{
  const active16 = createCoreProductSnapshot({
    transportPrimaryClock: 'seconds',
    phraseLength: 16,
    transportBarsPerPhrase: 4,
    transportBeatsPerBar: 4,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
  });
  active16.transport.running = true;
  const requested32 = createCoreProductSnapshot({
    transportPrimaryClock: 'seconds',
    phraseLength: 32,
    transportBarsPerPhrase: 4,
    transportBeatsPerBar: 4,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
  });
  requested32.transport.running = true;
  const transitionDiff = buildCoreProductSnapshotDiff(active16, requested32, { forceSequencerClockRejoin: false });
  assert.equal(transitionDiff.applied, true, 'running phrase changes should remain dirty-diffable');
  if (transitionDiff.applied) {
    const transition = transitionDiff.events.find((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetTransport);
    assert(transition, 'running phrase changes should emit one pending transport transition');
    assert.equal(transition.value, 30);
    assert.equal(transition.value2, 4);
    assert.equal(transition.value3, 4);
    assert.equal(transition.value4, 32);
    assert.equal(transition.flags, CORE_PRODUCT_TRANSPORT_FLAGS.applyNextPhrase);
    assert.equal(
      transitionDiff.events.some((event) => event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneInitialStartDelaySeconds),
      false,
      'running phrase changes must not reset enabled lanes while waiting for the phrase boundary',
    );
    assert.equal(
      transitionDiff.events.some((event) => ([
        KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeLeftMs,
        KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeRightMs,
        KESSHO_PRODUCT_PARAM_IDS.FxDelayBBaseTimeMs,
      ] as number[]).includes(event.paramId ?? -1)),
      false,
      'tempo-synced delays must retime inside the atomic core transition rather than early host events',
    );
  }
}

{
  const activeClock = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1ClockDivision: 16,
  });
  activeClock.transport.running = true;
  const requestedClock = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1ClockDivision: 8,
  });
  requestedClock.transport.running = true;
  const clockDiff = buildCoreProductSnapshotDiff(activeClock, requestedClock, { forceSequencerClockRejoin: false });
  assert.equal(clockDiff.applied, true);
  if (clockDiff.applied) {
    const event = clockDiff.events.find((candidate) =>
      candidate.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision
    );
    assert(event, 'running sequencer clock changes should emit a lane timing event');
    assert.equal(event.flags, CORE_PRODUCT_TIMING_FLAGS.applyNextPhrase);
  }
}

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
      { laneIndex: 5, repeats: 16 },
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
  ['pad', CORE_PRODUCT_SOURCE_IDS.pad1],
  ['pad1', CORE_PRODUCT_SOURCE_IDS.pad1],
  ['pad2', CORE_PRODUCT_SOURCE_IDS.pad2],
  ['sample1', CORE_PRODUCT_SOURCE_IDS.sample1],
  ['sample2', CORE_PRODUCT_SOURCE_IDS.sample2],
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

{
  const snapshot = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'piano',
  });
  assert.equal(
    snapshot.synthLanes[0]?.targetSourceId,
    CORE_PRODUCT_SOURCE_IDS.lead1,
    'Legacy piano is not a Product Core sequencer source and should not alias to Sample 1 at runtime',
  );
}

{
  const sample2HydratedFallbackSnapshot = createCoreProductSnapshot({
    sample2Enabled: true,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
  });
  const sample2Source = sample2HydratedFallbackSnapshot.sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.sample2);
  assert(sample2Source, 'Sample 2 source should exist when enabled without explicit sample2LibraryKey');
  assert.equal(
    sample2Source.sampleLibraryId,
    SAMPLE_LIBRARY_IDS_BY_KEY['soft-string-spurs'],
    'Sample 2 missing library state should hydrate to the same Soft String Spurs library shown by the UI',
  );
  assert.equal(sample2Source.sampleSelectionMode, 1, 'Sample 2 missing setup should hydrate mapped sample selection');
  assert.equal(sample2Source.sampleDynamicMode, 0, 'Sample 2 missing setup should hydrate velocity dynamic mode');
  assert.equal(
    sample2Source.sampleFixedDynamicId,
    SAMPLE_DYNAMIC_IDS_BY_KEY['level-2'],
    'Sample 2 missing setup should preserve the delivered Soft String Spurs fixed-dynamic fallback',
  );
  assert.equal(sample2Source.enabled, true, 'Sample 2 missing setup should still honor the enabled flag');
  assert.equal(sample2HydratedFallbackSnapshot.synthLanes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2);
}

{
  const sample2SequencedFallbackSnapshot = createCoreProductSnapshot({
    sample2Enabled: false,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
  });
  const sample2Source = sample2SequencedFallbackSnapshot.sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.sample2);
  assert(sample2Source, 'Sample 2 source should exist when targeted by a Product Core sequencer');
  assert.equal(
    sample2Source.enabled,
    false,
    'Sample 2 should remain disabled when its explicit enabled flag is false, even when a synth lane targets it',
  );
  assert.equal(
    sample2Source.sampleLibraryId,
    SAMPLE_LIBRARY_IDS_BY_KEY['soft-string-spurs'],
    'Sequenced Sample 2 fallback should serialize the delivered Sample 2 library setup',
  );
}

for (const slotId of ['sample1', 'sample2'] as const satisfies readonly SampleSlotId[]) {
  const stateForLibrary = (libraryKey: SampleLibraryKey) => applySampleLibrarySelectionDefaultsToFlatState(
    {},
    slotId,
    libraryKey,
  );
  const baseState = stateForLibrary('piano');
  const baseSnapshot = createCoreProductSnapshot(baseState);
  const nextLibrarySnapshot = createCoreProductSnapshot(stateForLibrary('soft-string-spurs'));
  const libraryDiff = buildCoreProductSnapshotDiff(baseSnapshot, nextLibrarySnapshot);
  const expectedSourceId = slotId === 'sample1' ? CORE_PRODUCT_SOURCE_IDS.sample1 : CORE_PRODUCT_SOURCE_IDS.sample2;
  const expectedSampleSource = nextLibrarySnapshot.sources.find((source) => source.sourceId === expectedSourceId);
  assert(expectedSampleSource, `${slotId} source snapshot should exist after library change`);
  assert.equal(libraryDiff.applied, true, `${slotId} library changes should stay on the live dirty-diff path`);
  assert.equal(
    libraryDiff.applied && libraryDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceSampleLibraryId &&
      event.targetId === expectedSourceId &&
      event.value === expectedSampleSource.sampleLibraryId
    )),
    true,
    `${slotId} library changes should emit a live sample library event`,
  );

  const levelDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    [`${slotId}Level`]: 0.42,
  }));
  assert.equal(levelDiff.applied, true, `${slotId} level changes should stay on the live dirty-diff path`);
  assert(
    levelDiff.applied && levelDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceLevel &&
      event.targetId === expectedSourceId
    )),
    `${slotId} level changes should emit a source level event`,
  );

  const envelopeDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    [`${slotId}AttackMs`]: 12000,
    [`${slotId}DecayMs`]: 6000,
    [`${slotId}HoldMs`]: 19000,
    [`${slotId}ReleaseMs`]: 24000,
  }));
  assert.equal(envelopeDiff.applied, true, `${slotId} ADSR changes should stay on the live dirty-diff path`);
  for (const [paramId, expectedValue] of [
    [KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, 12],
    [KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, 6],
    [KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, 19],
    [KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, 24],
  ] as const) {
    assert(
      envelopeDiff.applied && envelopeDiff.events.some((event) => (
        event.paramId === paramId &&
        event.targetId === expectedSourceId &&
        Math.abs((event.value ?? -1) - expectedValue) < 0.0001
      )),
      `${slotId} ADSR change should emit Product source param ${paramId}`,
    );
  }
}

for (const mode of ['anchorWalker', 'orbit'] as const) {
  for (const [sourceValue, expectedSourceId] of [
    ['pad1', CORE_PRODUCT_SOURCE_IDS.pad1],
    ['pad2', CORE_PRODUCT_SOURCE_IDS.pad2],
    ['lead1', CORE_PRODUCT_SOURCE_IDS.lead1],
    ['sample1', CORE_PRODUCT_SOURCE_IDS.sample1],
    ['sample2', CORE_PRODUCT_SOURCE_IDS.sample2],
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
  for (const mode of ['anchorWalker', 'orbit'] as const) {
    const faces = createDefaultSynthSequencerFaceState();
    faces.slots[0] = {
      ...faces.slots[0]!,
      mode,
    };
    const snapshot = createCoreProductSnapshot({
      synthEuclideanMasterEnabled: true,
      synthEuclid1Enabled: false,
      synthSequencerFaces: faces,
    });
    assert.equal(
      snapshot.synthLanes[0]?.enabled,
      false,
      `${mode} should respect the parent synth lane mute gate`,
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
      targetSourceId: CORE_PRODUCT_SOURCE_IDS.sample2,
      notes: [
        createDefaultOrbitNote(0, {
          targetSourceId: CORE_PRODUCT_SOURCE_IDS.sample2,
        }),
      ],
    },
  };
  const snapshot = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
    synthSequencerFaces: faces,
  });
  assert.equal(snapshot.synthLanes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Orbit lane should preserve Sample 2 as target source');
  assert.equal(snapshot.synthLanes[0]?.orbit.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Orbit config should preserve Sample 2 as target source');
  assert.equal(snapshot.synthLanes[0]?.orbit.notes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Orbit note override should preserve Sample 2 as target source');
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'anchorWalker',
    anchorWalker: {
      ...firstSlot.anchorWalker,
      targetSourceId: CORE_PRODUCT_SOURCE_IDS.sample2,
      layers: firstSlot.anchorWalker.layers.map((layer, index) => (
        index === 0
          ? { ...layer, targetSourceId: CORE_PRODUCT_SOURCE_IDS.sample2 }
          : layer
      )),
    },
  };
  const snapshot = createCoreProductSnapshot({
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
    synthSequencerFaces: faces,
  });
  assert.equal(snapshot.synthLanes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Walker lane should preserve Sample 2 as target source');
  assert.equal(snapshot.synthLanes[0]?.anchorWalker.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Walker config should preserve Sample 2 as target source');
  assert.equal(snapshot.synthLanes[0]?.anchorWalker.layers[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Walker layer override should preserve Sample 2 as target source');
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
    orbit: {
      ...firstSlot.orbit,
      targetSourceId: 'sample2',
      notes: [
        {
          ...createDefaultOrbitNote(0, {
            pitchMode: 'fixedMidi',
            midiNote: 98,
          }),
          targetSourceId: 'sample2',
        },
      ],
    },
  } as unknown as typeof faces.slots[number];
  const snapshot = createCoreProductSnapshot({
    sample2Enabled: false,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
    synthSequencerFaces: faces,
  });
  const sample2Source = snapshot.sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.sample2);
  assert.equal(snapshot.synthLanes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Orbit string target should keep Sample 2 on the live lane');
  assert.equal(snapshot.synthLanes[0]?.orbit.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Orbit string target should serialize as source 8');
  assert.equal(snapshot.synthLanes[0]?.orbit.notes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Orbit note string override should serialize as source 8');
  assert.equal(sample2Source?.enabled, false, 'Orbit string Sample 2 target should not enable the Sample 2 source');
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'anchorWalker',
    anchorWalker: {
      ...firstSlot.anchorWalker,
      targetSourceId: 'sample2',
      layers: [
        {
          ...createWalkerLayer(0, { enabled: true }),
          targetSourceId: 'sample2',
        },
        createWalkerLayer(1, { enabled: false }),
        createWalkerLayer(2, { enabled: false }),
        createWalkerLayer(3, { enabled: false }),
      ],
    },
  } as unknown as typeof faces.slots[number];
  const snapshot = createCoreProductSnapshot({
    sample2Enabled: false,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid1Source: 'sample2',
    synthSequencerFaces: faces,
  });
  const sample2Source = snapshot.sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.sample2);
  assert.equal(snapshot.synthLanes[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Walker string target should keep Sample 2 on the live lane');
  assert.equal(snapshot.synthLanes[0]?.anchorWalker.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Walker string target should serialize as source 8');
  assert.equal(snapshot.synthLanes[0]?.anchorWalker.layers[0]?.targetSourceId, CORE_PRODUCT_SOURCE_IDS.sample2, 'Walker layer string override should serialize as source 8');
  assert.equal(sample2Source?.enabled, false, 'Walker string Sample 2 target should not enable the Sample 2 source');
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
  assert.equal(orbitClockedLoopBeats(16, '1/8', 1), 8, 'Orbit clocked loop should match a full 16-step 1/8 Euclid cycle');
  assert.equal(orbitClockedBpmPercent(16, '1/8', 1), 50, 'Orbit clocked speed should convert the Euclid cycle to BPM percent');
  assert.equal(orbitClockedLoopBeats(16, '1/16', 1), 4, 'Orbit clocked loop should follow clock division changes');
  assert.equal(orbitClockedLoopBeats(16, '1/8', 2), 4, 'Orbit clocked loop should follow lane tempo multiplier');
  assert.equal(orbitClockedLoopBeats(16, '1/8', 1, 0.5), 16, 'Orbit clocked loop should support half-clock timing');
  assert.equal(orbitClockedLoopBeats(16, '1/8', 1, 2), 4, 'Orbit clocked loop should support double-clock timing');
  assert.equal(orbitClockedBpmPercent(16, '1/8', 1, 2), 100, 'Orbit double-clock timing should map to the expected effective BPM percent');
}

{
  const config = normalizeOrbitSequencerConfig({
    speedOffset: -2,
    globalOffset: 0.125,
    evenOffset: 0.25,
    freeOffset: -0.5,
    notes: Array.from({ length: 8 }, (_, index) => createDefaultOrbitNote(index, {
      phase: (TAU * index) / 8,
    })),
    seed: 123,
  });
  assert.equal(config.speedOffset, -1, 'Orbit speed offset should normalize to the full -1..1 range');
  assert.equal(config.freeOffset, -0.5, 'Orbit free offset should support negative values');
  const legacyFreeConfig = normalizeOrbitSequencerConfig({
    pitchLayout: 'freeOrbit',
    snapSource: 'chordStep',
    notes: [createDefaultOrbitNote(0, {
      pitchMode: 'fixedMidi',
      speedMode: 'syncDivisor',
      speedValue: 4,
    })],
  });
  assert.equal('pitchLayout' in legacyFreeConfig, false, 'Orbit layout should no longer survive normalization');
  assert.equal(legacyFreeConfig.snapSource, 'harmonyEngine', 'Orbit snap source should normalize to Harmony');
  assert.equal(legacyFreeConfig.notes[0]?.pitchMode, 'harmonyBloom', 'Legacy Free Orbit nodes should normalize back to Bloom pitch');
  assert.equal(legacyFreeConfig.notes[0]?.speedMode, 'bpmPercent', 'Legacy Free Orbit nodes should normalize back to Bloom speed mode');
  assert.equal(legacyFreeConfig.notes[0]?.speedValue, 100, 'Legacy Free Orbit nodes should normalize to shared Bloom speed');
  const speedStats = orbitSpeedOffsetStats([
    { radiusNorm: 0 },
    { radiusNorm: 0.5 },
    { radiusNorm: 1 },
  ]);
  assert.equal(orbitSpeedOffsetFactor(0, -1, speedStats), 2, 'Negative speed offset should speed inner nodes');
  assert.equal(orbitSpeedOffsetFactor(0.5, -1, speedStats), 1, 'Negative speed offset should keep mean-radius notes neutral');
  assert.equal(orbitSpeedOffsetFactor(1, -1, speedStats), 0, 'Negative speed offset should slow outer nodes');
  assert.equal(orbitSpeedOffsetFactor(0, 1, speedStats), 0, 'Positive speed offset should slow inner nodes');
  assert.equal(orbitSpeedOffsetFactor(0.5, 1, speedStats), 1, 'Positive speed offset should keep mean-radius notes neutral');
  assert.equal(orbitSpeedOffsetFactor(1, 1, speedStats), 2, 'Positive speed offset should speed outer nodes');
  for (const offset of [0.25, 0.5, 1]) {
    const positiveAverage = (
      orbitSpeedOffsetFactor(0, offset, speedStats) +
      orbitSpeedOffsetFactor(0.5, offset, speedStats) +
      orbitSpeedOffsetFactor(1, offset, speedStats)
    ) / 3;
    const negativeAverage = (
      orbitSpeedOffsetFactor(0, -offset, speedStats) +
      orbitSpeedOffsetFactor(0.5, -offset, speedStats) +
      orbitSpeedOffsetFactor(1, -offset, speedStats)
    ) / 3;
    assert(Math.abs(positiveAverage - negativeAverage) < 1e-9, 'Equivalent positive/negative speed offsets should keep the same average factor');
    assert(Math.abs(positiveAverage - 1) < 1e-9, 'Orbit speed offset should preserve average speed');
  }
  assert.equal(
    resolveAngularSpeed('bpmPercent', adjustedOrbitSpeedValue('bpmPercent', 100, 1, -1, speedStats), 100, 120),
    0,
    'Orbit -1 speed offset should stop outer nodes in BPM percent mode',
  );
  assert.equal(
    resolveAngularSpeed('syncDivisor', adjustedOrbitSpeedValue('syncDivisor', 4, 1, -1, speedStats), 100, 120),
    0,
    'Orbit -1 speed offset should stop outer nodes in sync divisor mode',
  );

  const oddNodeOffset = orbitPhaseOffsetTurns({
    index: 0,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: 0,
  });
  const evenNodeOffset = orbitPhaseOffsetTurns({
    index: 1,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: 0,
  });
  assert.equal(oddNodeOffset, 0.125, 'Global offset should affect odd-indexed visible nodes');
  assert.equal(evenNodeOffset, 0.375, 'Even offset should add only to user-visible even nodes');

  const visualPhase = orbitVisualPhase(0.2, {
    index: 1,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  });
  const authoredPhase = orbitAuthoredPhaseFromVisual(visualPhase, {
    index: 1,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  });
  assert(Math.abs(authoredPhase - 0.2) < 1e-9, 'Visual/authored orbit phase conversion should round-trip');

  const snappedVisual = snapOrbitPhase(visualPhase, 8);
  const storedAuthored = orbitAuthoredPhaseFromVisual(snappedVisual, {
    index: 1,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  });
  const restoredSnappedVisual = orbitVisualPhase(storedAuthored, {
    index: 1,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  });
  assert(
    Math.abs(restoredSnappedVisual - snappedVisual) < 1e-9,
    'Quantizing should snap visual phase while storing inverse authored phase',
  );

  assert.equal(
    effectiveOrbitDirection('cw', 1, { evenOffset: ORBIT_EVEN_REVERSE_THRESHOLD + 0.01, evenReverseMode: 'negativeHalf' }),
    'cw',
    'Even reverse mode should not reverse above -0.5',
  );
  assert.equal(
    effectiveOrbitDirection('cw', 1, { evenOffset: ORBIT_EVEN_REVERSE_THRESHOLD, evenReverseMode: 'negativeHalf' }),
    'ccw',
    'Even reverse mode should reverse at -0.5',
  );
  assert.equal(
    effectiveOrbitDirection('cw', 0, { evenOffset: -1, evenReverseMode: 'negativeHalf' }),
    'cw',
    'Even offset should not reverse odd visible nodes',
  );

  for (const mode of ['auto', 'golden', 'fibonacci', 'pythagorean', 'harmonicRose', 'euclidean'] as const) {
    for (const nodeCount of [3, 5, 8, 13, 21, 32]) {
      const first = generateOrbitConstellation({
        mode,
        seed: 123,
        nodeCount,
        pitchRangeMin: 48,
        pitchRangeMax: 84,
      });
      const second = generateOrbitConstellation({
        mode,
        seed: 123,
        nodeCount,
        pitchRangeMin: 48,
        pitchRangeMax: 84,
      });
      assert.deepEqual(first, second, `Orbit constellation ${mode}/${nodeCount} should be deterministic`);
      assert.equal(first.length, nodeCount, `Orbit constellation ${mode}/${nodeCount} should keep node count`);
      for (const point of first) {
        assert(point.radiusNorm >= 0.08 && point.radiusNorm <= 1, 'Orbit constellation radius should stay in range');
        assert(point.phase >= 0 && point.phase < TAU, 'Orbit constellation phase should stay wrapped');
      }
    }
  }
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
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSpeedOffset &&
      event.value === 1
    )),
    'Orbit speed offset should emit a scalar orbit speed-offset event',
  );

  const globalOffsetFaces = structuredClone(faces);
  globalOffsetFaces.slots[0]!.orbit.globalOffset = 0.125;
  const globalOffsetDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    synthSequencerFaces: globalOffsetFaces,
  }));
  assert(
    globalOffsetDiff.applied && globalOffsetDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitGlobalOffset &&
      event.value === 0.125
    )),
    'Orbit global offset should emit a scalar live event',
  );

  const evenOffsetFaces = structuredClone(faces);
  evenOffsetFaces.slots[0]!.orbit.evenOffset = -0.5;
  evenOffsetFaces.slots[0]!.orbit.freeOffset = -0.25;
  const offsetDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    synthSequencerFaces: evenOffsetFaces,
  }));
  assert(
    offsetDiff.applied && offsetDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitEvenOffset &&
      event.value === -0.5
    )),
    'Orbit even offset should emit a scalar live event',
  );
  assert(
    offsetDiff.applied && offsetDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitFreeOffset &&
      event.value === -0.25
    )),
    'Orbit free offset should emit a scalar live event',
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
  assert(
    eightNodeSpeedDiff.applied && eightNodeSpeedDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitSpeedOffset &&
      event.value === 1
    )),
    'Orbit speed offset should emit one scalar speed-offset event for multi-node layouts',
  );

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

  const thirteenNodeFaces = structuredClone(faces);
  const thirteenNodePoints = generateOrbitConstellation({
    mode: 'auto',
    seed: thirteenNodeFaces.slots[0]!.orbit.seed,
    nodeCount: 13,
    pitchRangeMin: 48,
    pitchRangeMax: 84,
  });
  thirteenNodeFaces.slots[0]!.orbit = {
    ...thirteenNodeFaces.slots[0]!.orbit,
    quantizedOffset: 13,
    notes: thirteenNodePoints.map((point, index) => createDefaultOrbitNote(index, {
      id: `orbit-note-${index + 1}`,
      radiusNorm: point.radiusNorm,
      phase: point.phase,
      pitchMode: 'harmonyBloom',
      speedMode: 'bpmPercent',
      speedValue: point.speedValue ?? 100,
      direction: point.direction,
      midiNote: point.midiNote,
      harmonyDegree: point.harmonyDegree,
    })),
  };
  const thirteenNodeDiff = buildCoreProductSnapshotDiff(baseSnapshot, createCoreProductSnapshot({
    ...baseState,
    synthSequencerFaces: thirteenNodeFaces,
  }));
  assert.equal(thirteenNodeDiff.applied, true, 'Orbit 13-node Bloom layout should stay on the live dirty-diff path');
  assert(
    thirteenNodeDiff.applied && thirteenNodeDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteCount &&
      event.value === 13
    )),
    'Orbit 13-node Bloom layout should emit the native note count',
  );
  for (const noteIndex of [1, 2, 3, 12]) {
    assert(
      thirteenNodeDiff.applied && thirteenNodeDiff.events.some((event) => (
        event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNotePhase &&
        event.flags === noteIndex
      )),
      `Orbit 13-node Bloom layout should emit phase for node index ${noteIndex}`,
    );
  }
  assert(
    thirteenNodeDiff.applied && thirteenNodeDiff.events.some((event) => (
      event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerOrbitNoteEnabled &&
      event.flags === 12 &&
      event.value === 1
    )),
    'Orbit 13-node Bloom layout should enable newly-added node slots',
  );
}

{
  const faces = createDefaultSynthSequencerFaceState();
  const firstSlot = faces.slots[0]!;
  faces.slots[0] = {
    ...firstSlot,
    mode: 'orbit',
    orbit: {
      ...firstSlot.orbit,
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
