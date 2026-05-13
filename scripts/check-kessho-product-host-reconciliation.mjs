import {
  addEvidence,
  assert,
  loadCoreProductHostHarness,
  methodBody,
  readProjectFile,
  runCheckWithReport,
} from './lib/kesshoProductBehaviorHarness.mjs';

const host = readProjectFile('src/audio/coreProductEngineHost.ts');
const runtimeAdapter = readProjectFile('src/audio/CoreProductRuntimeAdapter.ts');
const hostRuntimeSurface = `${host}\n${runtimeAdapter}`;
const sequencerTests = readProjectFile('cpp/KesshoCore/tests/ProductSequencerTests.cpp');

function hostMethodBody(name) {
  return methodBody(hostRuntimeSurface, name);
}

function assertLiveSequencerMutation(methodName, eventCreator) {
  const body = hostMethodBody(methodName);
  assert(body.includes(`this.postSequencerControlEvent(${eventCreator}`), `${methodName}() must post a live Product Core event`);
  for (const forbidden of [
    'this.patchAdapterState(',
    'this.applyLatestSnapshotUpdate(',
    'this.loadProductSnapshot(',
    'this.latestProductSnapshot',
    'this.latestSliderState',
    'this.adapterState',
  ]) {
    assert(!body.includes(forbidden), `${methodName}() must not refresh stale adapter snapshots with ${forbidden}`);
  }
}

function makeLane(overrides = {}) {
  return {
    enabled: true,
    targetSourceId: 1,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    mutationFlags: 1,
    triggerToggles: [[0, true], [3, false]],
    probability: [0.25, 0.5],
    ratchet: [1, 2],
    trigCondition: [[1, 2]],
    midiNote: [60, 64],
    expression: [0.2, 0.8],
    morph: [0.3, 0.7],
    distance: [0.1, 0.9],
    ...overrides,
  };
}

function makeSequencerUiTelemetry({ revision, targetId, laneIndex, changeKind, lane, sequencer }) {
  const synthLanes = [];
  const drumLanes = [];
  if (sequencer === 'synth') {
    synthLanes[laneIndex] = lane;
  } else {
    drumLanes[laneIndex] = lane;
  }
  return {
    schemaHash: 1,
    transportRunning: false,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    sequencerUiStateRevision: revision,
    sequencerUiState: {
      schemaHash: 1,
      revision,
      synthLaneCount: 4,
      drumLaneCount: 4,
      evolutionAmount: 0.42,
      evolutionState: 1234,
      lastChangedTargetId: targetId,
      lastChangedLaneIndex: laneIndex,
      lastChangeKind: changeKind,
      synthLanes,
      drumLanes,
    },
  };
}

await runCheckWithReport({
  scriptUrl: import.meta.url,
  reportName: 'kessho-product-host-reconciliation-latest.json',
  run: async (report) => {
    assertLiveSequencerMutation('diceSynthEuclidLane', 'createCoreProductSequencerDiceEvent(');
    assertLiveSequencerMutation('diceDrumEuclidLane', 'createCoreProductSequencerDiceEvent(');
    assertLiveSequencerMutation('resetSynthEuclidLaneHome', 'createCoreProductSequencerResetHomeEvent(');
    assertLiveSequencerMutation('resetDrumEuclidLaneHome', 'createCoreProductSequencerResetHomeEvent(');

    const postSequencerBody = hostMethodBody('postSequencerControlEvent');
    assert(postSequencerBody.includes('if (this.runtimeReady)'), 'postSequencerControlEvent() must branch on runtime readiness');
    assert(postSequencerBody.includes('this.runtime.postEvent(event)'), 'postSequencerControlEvent() must post the live event');
    assert(
      postSequencerBody.indexOf('this.runtime.postEvent(event)') < postSequencerBody.indexOf('this.loadLatestSnapshot()') ||
        postSequencerBody.includes('const post = () => this.runtime.postEvent(event);'),
      'runtime-ready sequencer control events must post before any snapshot bootstrap path',
    );

    const updateBody = hostMethodBody('applyLatestSnapshotUpdate');
    assert(updateBody.includes('const previousSnapshot = this.latestProductSnapshot'), 'snapshot update must compare against last host snapshot');
    assert(updateBody.includes('this.applySnapshotDiff(previousSnapshot, nextSnapshot)'), 'snapshot update must try dirty diff first');
    assert(
      updateBody.indexOf('this.applySnapshotDiff(previousSnapshot, nextSnapshot)') <
        updateBody.indexOf('this.loadProductSnapshot(nextSnapshot, reloadReason)'),
      'snapshot update must only full-reload after dirty diff rejection',
    );

    const loadSnapshotBody = hostMethodBody('loadProductSnapshot');
    assert(
      loadSnapshotBody.includes('this.flushSequencerStepToggles();'),
      'full snapshot reloads must replay reconciled sequencer UI caches after load',
    );

    const patchBody = hostMethodBody('patchAdapterState');
    assert(patchBody.includes('this.applyLatestSnapshotUpdate();'), 'adapter state patches must enter the dirty diff path');
    assert(!patchBody.includes('this.loadProductSnapshot('), 'adapter state patches must not bypass dirty diff with direct snapshot loads');

    const createSnapshotBody = hostMethodBody('createLatestSnapshot');
    for (const token of [
      'telemetryRngState',
      'rngSeed: this.latestTelemetry.rngSeed',
      'rngState: this.latestTelemetry.rngState',
      '...telemetryRngState, ...this.latestSliderState, ...this.adapterState',
    ]) {
      assert(createSnapshotBody.includes(token), `createLatestSnapshot() must reconcile ${token}`);
    }

    const telemetryBody = hostMethodBody('handleTelemetry');
    for (const token of [
      'this.reconcileSequencerUiState(hostTelemetry)',
      'this.updateRuntimeWalkPositions(hostTelemetry)',
    ]) {
      assert(telemetryBody.includes(token), `handleTelemetry() must reconcile Core-owned state from telemetry: ${token}`);
    }

    const sequencerUiBody = hostMethodBody('reconcileSequencerUiState');
    for (const token of [
      'telemetry.sequencerUiState',
      'this.lastSequencerUiStateRevision',
      'state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.synth',
      'state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.drum',
      'CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE',
      'CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME',
    ]) {
      assert(sequencerUiBody.includes(token), `reconcileSequencerUiState() must preserve Core-owned mutation state: ${token}`);
    }

    for (const methodName of ['reconcileSynthSequencerLane', 'reconcileDrumSequencerLane']) {
      const body = hostMethodBody(methodName);
      for (const token of [
        'stepValueOverridesFromLane(lane',
        'lane.triggerToggles.map',
        'invokeDisplayCallback(',
      ]) {
        assert(body.includes(token), `${methodName}() must update host caches and UI callbacks from Product Core state: ${token}`);
      }
    }

    const canDiffBody = hostMethodBody('canApplySnapshotDiff');
    for (const field of [
      'enabled',
      'level',
      'morph',
      'distance',
      'expression',
      'dryGain',
      'reverbSend',
      'delayASend',
      'delayBSend',
      'granularSend',
      'postLpfHz',
      'stereoWidth',
      'postLpfKeyTracking',
    ]) {
      assert(!canDiffBody.includes(`previousSource.${field}`), `source ${field} must not force a full snapshot reload`);
      assert(!canDiffBody.includes(`nextSource.${field}`), `source ${field} must not force a full snapshot reload`);
    }

    const sourceDiffBody = hostMethodBody('appendSourceParamDiffs');
    for (const token of [
      'KESSHO_PRODUCT_PARAM_IDS.SourceLevel',
      'KESSHO_PRODUCT_PARAM_IDS.SourceMorph',
      'KESSHO_PRODUCT_PARAM_IDS.SourceDistance',
      'KESSHO_PRODUCT_PARAM_IDS.SourceExpression',
      'KESSHO_PRODUCT_PARAM_IDS.SourceDryGain',
      'KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend',
      'KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend',
      'KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend',
      'KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend',
    ]) {
      assert(sourceDiffBody.includes(token), `unrelated UI source update must be a live diff event: ${token}`);
    }

    const evolutionDiffBody = hostMethodBody('appendEvolutionDiffs');
    assert(evolutionDiffBody.includes('KESSHO_PRODUCT_PARAM_IDS.EvolutionAmount'), 'evolution amount must be diffable');
    assert(evolutionDiffBody.includes('KESSHO_PRODUCT_PARAM_IDS.EvolutionState'), 'evolution state must be diffable');

    for (const token of [
      'unrelated source-level diff must preserve Core-owned dice state',
      'unrelated source-level diff must preserve reset-home lane state',
      'unrelated source diff overwrote evolution amount',
      'unrelated source diff overwrote evolution state',
      'requireLaneMutationStateEqual(',
      'laneHasGeneratedOverrides(',
      'kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state)',
      'sequencer UI state should expose detailed diced override values',
      'sequencer UI state should expose reset-home override clearing',
      'sequencer UI state should expose Core-owned evolution state',
      'full snapshot reload plus reconciled UI replay must preserve Core-owned dice state',
      'full snapshot reload must preserve reconciled Core-owned RNG state',
      'full snapshot reload must preserve reconciled Core-owned evolution state',
    ]) {
      assert(sequencerTests.includes(token), `Product sequencer tests are missing reconciliation assertion: ${token}`);
    }
    addEvidence(report, {
      id: 'static-host-reconciliation-contract',
      summary: 'Static host/Core reconciliation and Product Core C++ preservation assertions are present.',
      details: {
        liveSequencerMethods: [
          'diceSynthEuclidLane',
          'diceDrumEuclidLane',
          'resetSynthEuclidLaneHome',
          'resetDrumEuclidLaneHome',
        ],
        cppPreservationAssertions: 13,
      },
    });

    const harness = loadCoreProductHostHarness();
    harness.host.runtimeReady = true;
    const synthOverridePayloads = [];
    const drumOverridePayloads = [];
    const synthEvolveTriggers = [];
    harness.host.setSynthEvolveOverridesChangedCallback((laneIndex, payload) => {
      synthOverridePayloads.push({ laneIndex, payload });
    });
    harness.host.setDrumEvolveOverridesChangedCallback((laneIndex, payload) => {
      drumOverridePayloads.push({ laneIndex, payload });
    });
    harness.host.setSynthEuclidEvolveTriggerCallback((laneIndex) => {
      synthEvolveTriggers.push(laneIndex);
    });

    harness.host.diceSynthEuclidLane(1, 0.42);
    harness.host.resetDrumEuclidLaneHome(2);
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-dice' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 1 &&
          Math.abs(event.intensity - 0.42) < 1.0e-6),
      'diceSynthEuclidLane() must post a live dice event',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-reset-home' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 2),
      'resetDrumEuclidLaneHome() must post a live reset-home event',
    );
    assert(synthEvolveTriggers.includes(1), 'diceSynthEuclidLane() must preserve UI evolve trigger callback behavior');

    const synthLane = makeLane();
    harness.host.reconcileSequencerUiState(makeSequencerUiTelemetry({
      revision: 1,
      targetId: harness.context.CORE_PRODUCT_SEQUENCER_IDS.synth,
      laneIndex: 1,
      changeKind: 3,
      lane: synthLane,
      sequencer: 'synth',
    }));
    assert(harness.host.lastSequencerUiStateRevision === 1, 'synth reconciliation must record Core UI revision');
    assert(
      JSON.stringify(harness.host.synthStepToggleOverrides[1]) === JSON.stringify([
        { step: 0, value: true },
        { step: 3, value: false },
      ]),
      'synth reconciliation must copy trigger toggle overrides into host cache',
    );
    assert(
      harness.host.synthStepValueOverrides[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote && entry.value === 60),
      'synth reconciliation must copy Product Core step values into host cache',
    );
    assert(
      synthOverridePayloads.length === 1 &&
        synthOverridePayloads[0].laneIndex === 1 &&
        Array.isArray(synthOverridePayloads[0].payload.pitch),
      'synth reconciliation must notify UI with detailed diced override payload',
    );

    const resetLane = makeLane({
      mutationFlags: 0,
      triggerToggles: [],
      probability: null,
      ratchet: null,
      trigCondition: null,
      midiNote: null,
      expression: null,
      morph: null,
      distance: null,
    });
    harness.host.reconcileSequencerUiState(makeSequencerUiTelemetry({
      revision: 2,
      targetId: harness.context.CORE_PRODUCT_SEQUENCER_IDS.drum,
      laneIndex: 2,
      changeKind: 4,
      lane: resetLane,
      sequencer: 'drum',
    }));
    assert(harness.host.lastSequencerUiStateRevision === 2, 'drum reset-home reconciliation must record Core UI revision');
    assert(harness.host.drumStepToggleOverrides[2].length === 0, 'reset-home reconciliation must clear drum trigger overrides');
    assert(
      drumOverridePayloads.length === 1 &&
        Array.isArray(drumOverridePayloads[0].payload.probability[2]) &&
        drumOverridePayloads[0].payload.probability[2].length === 0,
      'reset-home reconciliation must notify UI with explicit empty lane override payload',
    );

    const eventCountBeforeReload = harness.runtime.events.length;
    harness.host.loadProductSnapshot({ transport: { bpm: 120 } }, 'adapter-update');
    const replayedEvents = harness.runtime.events.slice(eventCountBeforeReload);
    assert(harness.runtime.snapshots.length === 1, 'full snapshot reload must call runtime.loadSnapshot');
    assert(
      replayedEvents.some((event) => event.type === 'sequencer-clear-steps' && event.sequencer === 'synth' && event.laneIndex === 1) &&
        replayedEvents.some((event) => event.type === 'sequencer-step' && event.sequencer === 'synth' && event.laneIndex === 1),
      'full snapshot reload must replay reconciled synth dice state from host cache',
    );
    addEvidence(report, {
      id: 'host-reconciliation-behavior',
      summary: 'Host harness posts live dice/reset events, reconciles Core sequencer UI telemetry, and replays cached Core-owned state after full reload.',
      details: {
        liveEvents: harness.runtime.events.slice(0, eventCountBeforeReload),
        synthOverridePayloads,
        drumOverridePayloads,
        replayedEvents,
      },
    });

    let capturedSnapshotState = null;
    const rngHarness = loadCoreProductHostHarness({
      globals: {
        createCoreProductSnapshot: (state) => {
          capturedSnapshotState = state;
          return { state, transport: { bpm: 120 } };
        },
      },
    });
    rngHarness.host.latestTelemetry = {
      rngSeed: 123,
      rngState: 456,
      transportRunning: false,
      activeSources: 0,
      activeVoices: 0,
      activeAssets: 0,
      sequencerEventCount: 0,
      controlQueueDepth: 0,
      assetMissingCount: 0,
      lastErrorCode: 0,
      schemaHash: 1,
    };
    rngHarness.host.latestSliderState = {
      seed: 999,
      sourceLevel: 0.5,
    };
    rngHarness.host.adapterState = {
      sourceLevel: 0.75,
    };
    rngHarness.host.createLatestSnapshot();
    assert(capturedSnapshotState.rngSeed === 123, 'createLatestSnapshot() must prefer reconciled Core RNG seed');
    assert(capturedSnapshotState.rngState === 456, 'createLatestSnapshot() must prefer reconciled Core RNG state');
    assert(capturedSnapshotState.sourceLevel === 0.75, 'adapter state must remain the final host overlay after telemetry and slider state');
    addEvidence(report, {
      id: 'rng-state-reconciliation-behavior',
      summary: 'Host snapshot creation carries reconciled Core RNG state while preserving host adapter overrides.',
      details: {
        capturedSnapshotState,
      },
    });

    console.log('Kessho Product host reconciliation checks passed');
  },
});
