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
  const configSteps = new Array(8).fill(0);
  const configDirections = new Array(8).fill(0);
  configSteps[5] = 7;
  configDirections[5] = 1;
  return {
    enabled: true,
    targetSourceId: 1,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    mutationFlags: 1,
    triggerToggles: [[0, true], [3, false]],
    probabilityOverrideSetLow: 0b11,
    probabilityOverrideSetHigh: 0,
    probability: [0.25, 0.5],
    ratchetOverrideSetLow: 0b11,
    ratchetOverrideSetHigh: 0,
    ratchet: [1, 2],
    trigConditionOverrideSetLow: 0b1,
    trigConditionOverrideSetHigh: 0,
    trigCondition: [[1, 2]],
    midiNoteOverrideSetLow: 0b11,
    midiNoteOverrideSetHigh: 0,
    midiNote: [60, 64],
    expressionOverrideSetLow: 0b11,
    expressionOverrideSetHigh: 0,
    expression: [0.2, 0.8],
    expressionRangeSetLow: 0b10,
    expressionRangeSetHigh: 0,
    expressionRangeMaxes: [0, 0.9],
    morphOverrideSetLow: 0b11,
    morphOverrideSetHigh: 0,
    morph: [0.3, 0.7],
    distanceOverrideSetLow: 0b11,
    distanceOverrideSetHigh: 0,
    distance: [0.1, 0.9],
    stepValueConfigEnabledMask: 1 << 5,
    stepValueConfigSteps: configSteps,
    stepValueConfigDirections: configDirections,
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
    assertLiveSequencerMutation('resetDrumEuclidLaneHome', 'createCoreProductSequencerResetHomeEvent(');
    const resetSynthBody = hostMethodBody('resetSynthEuclidLaneHome');
    assert(
      resetSynthBody.includes("this.restoreSequencerLaneHome('synth', laneIndex)") &&
        !resetSynthBody.includes('createCoreProductSequencerResetHomeEvent('),
      'resetSynthEuclidLaneHome() must mirror Web synth reset by no-oping until a home snapshot exists',
    );
    const presetHomeBody = hostMethodBody('setSequencerPresetHomeSnapshots');
    assert(
      presetHomeBody.includes("this.captureSequencerHomeLanes('synth', false, true)") &&
        presetHomeBody.includes("this.captureSequencerHomeLanes('drum', false, true)"),
      'preset restore must force-replace Product synth/drum home snapshots',
    );
    assert(
      hostMethodBody('captureSequencerHomeLanes').includes('this.captureSequencerHomeLane(sequencer, laneIndex, force, requireContent)'),
      'bulk Product home capture must forward the force flag to per-lane capture',
    );
    for (const methodName of ['start', 'resume', 'suspend', 'stop', 'dispose']) {
      assert(
        hostMethodBody(methodName).includes('this.sequencerEvolveClock.reset();'),
        `${methodName}() must reset Product sequencer evolve clock state at transport lifecycle boundaries`,
      );
    }

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
    assert(updateBody.includes('this.applySnapshotDiff(previousSnapshot, nextSnapshot, forceSequencerClockRejoin)'), 'snapshot update must try dirty diff first');
    assert(
      updateBody.indexOf('this.applySnapshotDiff(previousSnapshot, nextSnapshot, forceSequencerClockRejoin)') <
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
      '...this.latestSliderState, ...this.adapterState',
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
        'coreProductStepValueOverridesFromLane(lane',
        'coreProductStepValueConfigsFromLane(lane',
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
      'diffuseSend',
      'postLpfHz',
      'stereoWidth',
      'postLpfKeyTracking',
      'attackSeconds',
      'decaySeconds',
      'sustain',
      'holdSeconds',
      'releaseSeconds',
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
      'KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend',
      'KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds',
      'KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds',
      'KESSHO_PRODUCT_PARAM_IDS.SourceSustain',
      'KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds',
      'KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds',
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
      'drum MIDI step override should become per-trigger pitch offset',
      'sequence-bound pitch should read trigger step phase instead of emitted hit phase',
      'synth emitted hit 1 should skip suppressed hit and use pitch index 1',
      'synth telemetry should expose emitted-hit sub-lane phase for visuals',
      'synth ratchet sub-lane should skip suppressed trigger phases',
      'synth morph pingpong step 3 should fold to index 1',
      'synth distance reverse step 0 should use index 2',
      'drum emitted hit 1 should skip suppressed pitch hit and use index 1',
      'Product pad preset morph endpoint B should reach exact module params',
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
        cppPreservationAssertions: 19,
      },
    });

    const harness = loadCoreProductHostHarness();
    harness.host.runtimeReady = true;
    const synthOverridePayloads = [];
    const drumOverridePayloads = [];
    const synthEvolveTriggers = [];
    const drumEvolveTriggers = [];
    const synthNoteRangePayloads = [];
    harness.host.setSynthEvolveOverridesChangedCallback((laneIndex, payload) => {
      synthOverridePayloads.push({ laneIndex, payload });
    });
    harness.host.setDrumEvolveOverridesChangedCallback((laneIndex, payload) => {
      drumOverridePayloads.push({ laneIndex, payload });
    });
    harness.host.setSynthEuclidEvolveTriggerCallback((laneIndex) => {
      synthEvolveTriggers.push(laneIndex);
    });
    harness.host.setDrumEuclidEvolveTriggerCallback((laneIndex) => {
      drumEvolveTriggers.push(laneIndex);
    });
    harness.host.setSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) => {
      synthNoteRangePayloads.push({ laneIndex, noteMin, noteMax });
    });

    const directSubLaneEvolve = harness.context.evolveCoreProductSequencerSubLaneConfigs;
    assert(typeof directSubLaneEvolve === 'function', 'Product sub-lane evolve helper must be behavior-testable from the host harness');
    const expressionField = harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression;
    const forwardDirection = harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
    const expressionConfig = [{ field: expressionField, steps: 5, direction: forwardDirection }];
    const expressionValues = [
      { step: 0, field: expressionField, value: 0.25 },
      { step: 1, field: expressionField, value: 0.5 },
      { step: 2, field: expressionField, value: 0.5 },
      { step: 3, field: expressionField, value: 0.5 },
      { step: 4, field: expressionField, value: 0.5 },
    ];
    const lengthConfig = { enabled: true, everyBars: 1, evolution: 1, methods: { subLaneLengthDrift: true }, enabledSubLanes: ['expression'] };
    assert(
      directSubLaneEvolve('synth', expressionConfig, expressionValues, lengthConfig, 1) === null,
      'Product sub-lane evolve hash must not let signed negative values bypass chance gates',
    );
    const growResult = directSubLaneEvolve('synth', expressionConfig, expressionValues, lengthConfig, 11);
    assert(
      growResult?.configs?.[0]?.steps === 6 &&
        growResult.subLaneStates?.expression?.steps === 6 &&
        growResult.valueOverrides?.length === 6 &&
        growResult.valueOverrides[5]?.value === 0.5,
      'Product synth length evolve must duplicate the last visible value and publish the evolved sub-lane steps',
    );
    const directionResult = directSubLaneEvolve('synth', expressionConfig, expressionValues, { enabled: true, everyBars: 1, evolution: 1, methods: { subLaneDirectionFlip: true }, enabledSubLanes: ['expression'] }, 24);
    assert(
      directionResult?.subLaneStates?.expression?.direction === 'reverse' &&
        directionResult.directionPayloads?.expressionDirection === 'reverse',
      'Product sub-lane direction evolve must use an unsigned hash selection and publish UI direction state',
    );
    const evolveClock = harness.context.createCoreProductSequencerEvolveClock();
    const evolvePublishes = [];
    const swingWrites = [];
    evolveClock.tick({
      telemetry: { transportRunning: true, synthSequencerCurrentSteps: [1, 0, 0, 0], drumSequencerCurrentSteps: [0, 0, 0, 0] },
      synthConfigs: [{ enabled: true, everyBars: 1, evolution: 1, writeOffset: 0, mutationMode: 'biased', methods: { swingDrift: true } }],
      drumConfigs: [],
      post: () => {},
      publish: (name, laneIndex) => evolvePublishes.push({ name, laneIndex }),
      getSwing: () => 0,
      setSwing: (_sequencer, laneIndex, swing) => swingWrites.push({ laneIndex, swing }),
    });
    evolveClock.tick({
      telemetry: { transportRunning: true, synthSequencerCurrentSteps: [0, 0, 0, 0], drumSequencerCurrentSteps: [0, 0, 0, 0] },
      synthConfigs: [{ enabled: true, everyBars: 1, evolution: 1, writeOffset: 0, mutationMode: 'biased', methods: { swingDrift: true } }],
      drumConfigs: [],
      post: () => {},
      publish: (name, laneIndex) => evolvePublishes.push({ name, laneIndex }),
      getSwing: () => 0,
      setSwing: (_sequencer, laneIndex, swing) => swingWrites.push({ laneIndex, swing }),
    });
    assert(
      swingWrites.length === 0 &&
        evolvePublishes.some((entry) => entry.name === 'synthEuclidEvolve' && entry.laneIndex === 0),
      'Product evolve clock must publish visible evolve feedback for scheduled host-owned passes even when clamped values do not change',
    );

    harness.host.setSynthPitchBindingModes(['sequence']);
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-lane-param' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.paramId === 'SequencerLanePitchBindingMode' &&
          event.value === 1),
      'Product host must post live synth pitch binding mode events',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-lane-param' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 1 &&
          event.paramId === 'SequencerLanePitchBindingMode' &&
          event.value === 0),
      'Product host must reset omitted synth pitch binding modes to polyrhythmic',
    );
    harness.host.synthNoteRangeOverrides = [{ min: 40, max: 52 }, null, null, null];
    harness.host.running = true;
    harness.host.stop();
    assert(
      harness.host.synthNoteRangeOverrides.every((entry) => entry === null),
      'Product host stop must clear synth note-range evolve overrides so restart uses current slider state',
    );
    harness.host.latestProductSnapshot = { transport: { bpm: 120 }, synthLanes: [], drumLanes: [{ midiNote: 37 }] };
    harness.host.setDrumSubLaneEnabled([{ pitch: true }]);
    harness.host.setDrumStepOverrides({
      pitch: [[-3, 7]],
      pitchDirection: ['reverse'],
    });
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 0 &&
          event.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote &&
          event.step === 0 &&
          event.value === 34),
      'Product host must convert drum pitch offsets to absolute Core MIDI values',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-sublane-config' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 0 &&
          event.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote &&
          event.steps === 2 &&
          event.direction === harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse),
      'Product host must replay drum pitch sub-lane direction/length into Core',
    );

    const beforeEmptySynthResetEvents = harness.runtime.events.length;
    const beforeEmptySynthResetPayloads = synthOverridePayloads.length;
    harness.host.resetSynthEuclidLaneHome(3);
    assert(
      harness.runtime.events.length === beforeEmptySynthResetEvents &&
        synthOverridePayloads.length === beforeEmptySynthResetPayloads,
      'resetSynthEuclidLaneHome() must no-op before Product/Web synth home is captured',
    );
    const swingHomeStore = harness.context.createCoreProductSequencerHomeStore();
    swingHomeStore.capture('synth', 0, { toggles: [], values: [], configs: [], swing: 0.12 });
    swingHomeStore.capture('synth', 0, { toggles: [], values: [], configs: [], swing: 0.34 });
    assert(
      Math.abs(swingHomeStore.restore('synth', 0)?.swing - 0.12) < 1.0e-6,
      'Product evolve home capture must preserve swing-only homes instead of overwriting them on later evolve passes',
    );
    const emptyContentStore = harness.context.createCoreProductSequencerHomeStore();
    emptyContentStore.capture('drum', 0, { toggles: [], values: [], configs: [], swing: 0 }, { requireContent: true });
    assert(
      emptyContentStore.restore('drum', 0) === null,
      'Product preset/step home capture must still ignore empty lanes when requireContent is requested',
    );
    harness.host.diceSynthEuclidLane(1, 0.42);
    harness.host.diceDrumEuclidLane(3, 0.73);
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
        event.type === 'sequencer-dice' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 3 &&
          Math.abs(event.intensity - 0.73) < 1.0e-6),
      'diceDrumEuclidLane() must post a live dice event',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-reset-home' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 2),
      'resetDrumEuclidLaneHome() must post a live reset-home event',
    );
    assert(synthEvolveTriggers.includes(1), 'diceSynthEuclidLane() must preserve UI evolve trigger callback behavior');
    assert(drumEvolveTriggers.includes(3), 'diceDrumEuclidLane() must preserve UI evolve trigger callback behavior');
    harness.host.latestSliderState = { synthEuclid1NoteMin: 62, synthEuclid1NoteMax: 74 };
    harness.host.setSynthPitchSettings([{ mode: 'noteRange', root: 60, scale: 'Major' }]);
    harness.host.setSynthStepOverrides({ expression: [[0.5, 0.6]], expressionDirection: ['forward'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.synthNoteRangeOverrides[0] = { min: 68, max: 80 };
    harness.host.resetSynthEuclidLaneHome(0);
    assert(harness.host.synthNoteRangeOverrides[0] === null, 'Product synth reset-home must clear the current note-range evolve override');
    assert(
      synthNoteRangePayloads.some((entry) => entry.laneIndex === 0 && entry.noteMin === 62 && entry.noteMax === 74),
      'Product synth reset-home must restore captured note-range min/max through the UI callback',
    );
    const noteRangeConfig = {
      enabled: true,
      evolution: 1,
      everyBars: 1,
      writeOffset: 0,
      mutationMode: 'biased',
      methods: { pitchWalk: true },
      enabledSubLanes: ['pitch'],
    };
    let anchoredNoteRange = null;
    for (let seed = 1; seed < 1000 && !anchoredNoteRange?.range; seed += 1) {
      anchoredNoteRange = harness.context.evolveCoreProductSynthNoteRange({
        laneIndex: 0,
        config: noteRangeConfig,
        seed,
        state: { synthEuclid1NoteMin: 60, synthEuclid1NoteMax: 72 },
        pitchSettings: [{ mode: 'noteRange', root: 60, scale: 'Major' }],
        current: { min: 90, max: 96 },
        home: { min: 60, max: 72 },
      });
    }
    assert(anchoredNoteRange?.range, 'Product synth note-range evolve test must find a deterministic changed seed');
    assert(
      Math.abs(((anchoredNoteRange.range.min + anchoredNoteRange.range.max) * 0.5) - 66) <= 12,
      'Product synth note-range evolve must stay anchored to captured home, not the current evolved override',
    );
    const noteRangeMergeStart = synthNoteRangePayloads.length;
    harness.host.setSynthPitchSettings([
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
    ]);
    harness.host.setSynthStepOverrides({ expression: [null, null, [0.25, 0.35]], expressionDirection: [null, null, 'forward'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.latestSliderState = { synthEuclid3NoteMin: 55, synthEuclid3NoteMax: 67 };
    harness.host.setSynthPitchSettings([
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'noteRange', root: 60, scale: 'Major' },
    ]);
    harness.host.captureSequencerHomeLane('synth', 2);
    harness.host.synthNoteRangeOverrides[2] = { min: 80, max: 92 };
    harness.host.resetSynthEuclidLaneHome(2);
    assert(
      synthNoteRangePayloads.slice(noteRangeMergeStart).some((entry) => entry.laneIndex === 2 && entry.noteMin === 55 && entry.noteMax === 67),
      'Product synth note-range home capture must merge note-range home into an existing step-content home',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-lane-param' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.paramId === 'SequencerLaneMidiNote' &&
          event.value === 68),
      'Product synth reset-home must restore the Product lane MIDI note to the captured note-range center',
    );

    harness.host.setEvolvedSequencerLaneSwing('drum', 2, 0.33);
    assert(harness.host.adapterState.drumEuclid3Swing === 0.33, 'Product host swing evolve must update adapter state for preset/UI continuity');
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-lane-param' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 2 &&
          event.paramId === 'SequencerLaneSwing' &&
          event.value === 0.33),
      'Product host swing evolve must post a live Product lane swing event',
    );
    assert(
      drumOverridePayloads.some((entry) => entry.laneIndex === 2 && entry.payload.swing === 0.33),
      'Product host swing evolve must notify UI/preset refs through the evolve override callback',
    );
    const beforeDrumSwingResetEvents = harness.runtime.events.length;
    harness.host.resetDrumEuclidLaneHome(2);
    const drumSwingResetEvents = harness.runtime.events.slice(beforeDrumSwingResetEvents);
    assert(harness.host.adapterState.drumEuclid3Swing === 0, 'Product host reset-home must restore cached lane swing into adapter state');
    assert(
      drumSwingResetEvents.some((event) =>
        event.type === 'sequencer-lane-param' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 2 &&
          event.paramId === 'SequencerLaneSwing' &&
          event.value === 0),
      'Product host reset-home must replay restored lane swing to Product Core',
    );
    assert(
      drumOverridePayloads.some((entry) => entry.laneIndex === 2 && entry.payload.swing === 0),
      'Product host reset-home must notify UI/preset refs with restored lane swing',
    );

    harness.host.latestProductSnapshot = {
      transport: { bpm: 120 },
      synthLanes: [{ midiNote: 60 }],
      drumLanes: [{ midiNote: 37 }],
    };
    harness.host.setSynthSubLaneEnabled([{ pitch: true, expression: true }]);
    harness.host.setDrumSubLaneEnabled([{ pitch: true, expression: true }]);
    harness.host.setSynthEuclidSwings([0.11]);
    harness.host.setSynthStepOverrides({ pitch: [[64, 67]], expression: [[0.1, 0.2]], pitchDirection: ['forward'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setSynthEuclidSwings([0.22]);
    harness.host.setSynthStepOverrides({ pitch: [[72, 74]], expression: [[0.3, 0.4]], pitchDirection: ['reverse'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setSynthStepOverrides({ pitch: [[55, 56]], expression: [[0.8, 0.9]], pitchDirection: ['forward'] });
    const beforeSynthPresetResetEvents = harness.runtime.events.length;
    harness.host.resetSynthEuclidLaneHome(0);
    const synthPresetResetEvents = harness.runtime.events.slice(beforeSynthPresetResetEvents);
    const synthPresetResetPayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      synthPresetResetPayload.swing === 0.22 &&
        Array.isArray(synthPresetResetPayload.pitch) &&
        synthPresetResetPayload.pitch[0] === 12 &&
        synthPresetResetPayload.pitch[1] === 14 &&
        Array.isArray(synthPresetResetPayload.expression) &&
        synthPresetResetPayload.expression[0] === 0.3,
      'Product synth reset-home must restore the latest loaded preset home, not a stale edit or previous preset',
    );
    harness.host.setSynthPitchSettings([{ mode: 'semitones', root: 48, scale: 'Major' }]);
    harness.host.setSynthStepOverrides({ pitch: [[60, 64]], expression: [[0.5, 0.6]], pitchDirection: ['forward'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setSynthStepOverrides({ pitch: [[55, 56]], expression: [[0.8, 0.9]], pitchDirection: ['reverse'] });
    harness.host.resetSynthEuclidLaneHome(0);
    const synthRootResetPayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Array.isArray(synthRootResetPayload.pitch) &&
        synthRootResetPayload.pitch[0] === 12 &&
        synthRootResetPayload.pitch[1] === 16,
      'Product synth reset-home must convert Core MIDI back through the current synth pitch root',
    );
    harness.host.setSynthPitchSettings([{ mode: 'notes', root: 60, scale: 'Major' }]);
    harness.host.setSynthStepOverrides({ pitch: [[60, 62, 67]], expression: [[0.2, 0.3, 0.4]], pitchDirection: ['forward'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setSynthStepOverrides({ pitch: [[55, 56]], expression: [[0.8, 0.9]], pitchDirection: ['reverse'] });
    harness.host.resetSynthEuclidLaneHome(0);
    const synthScaleResetPayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Array.isArray(synthScaleResetPayload.pitch) &&
        synthScaleResetPayload.pitch[0] === 0 &&
        synthScaleResetPayload.pitch[1] === 1 &&
        synthScaleResetPayload.pitch[2] === 4,
      'Product synth reset-home must convert Core MIDI back to scale-degree offsets in notes mode',
    );
    assert(
      synthPresetResetEvents.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote &&
          event.step === 0 &&
        event.value === 72),
      'Product synth preset-home reset must replay the forced preset MIDI values to Core',
    );
    harness.host.setSynthSubLaneEnabled([{ expression: true, morph: true, distance: true }]);
    harness.host.setSynthStepOverrides({
      expression: [[0.45, 0.5, 0.55]],
      expressionRanges: [{ min: 0.2, max: 0.7 }],
      expressionDirection: ['pingpong'],
      morph: [[0.25, 0.35]],
      morphRanges: [{ min: 0.1, max: 0.6 }],
      morphDirection: ['reverse'],
      distance: [[0.3]],
      distanceRanges: [{ min: 0.3, max: 0.8 }],
      distanceDirection: ['forward'],
    });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setSynthStepOverrides({ expression: [[0.9]], expressionDirection: ['forward'] });
    const beforeSynthRangeResetEvents = harness.runtime.events.length;
    harness.host.resetSynthEuclidLaneHome(0);
    const synthRangeResetEvents = harness.runtime.events.slice(beforeSynthRangeResetEvents);
    const synthRangeResetPayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      synthRangeResetPayload.expressionRanges?.min === 0.2 &&
        synthRangeResetPayload.expressionRanges.max === 0.7 &&
        synthRangeResetPayload.morphRanges?.min === 0.1 &&
        synthRangeResetPayload.distanceRanges?.max === 0.8,
      'Product synth reset-home must restore range-mode sub-lane payloads for UI/preset refs',
    );
    assert(
      synthRangeResetPayload.subLaneStates?.expression?.enabled === true &&
        synthRangeResetPayload.subLaneStates.expression.valueMode === 'range' &&
        synthRangeResetPayload.subLaneStates.expression.rangeMin === 0.2 &&
        synthRangeResetPayload.subLaneStates.expression.rangeMax === 0.7 &&
        synthRangeResetPayload.subLaneStates.expression.steps === 3 &&
        synthRangeResetPayload.subLaneStates.expression.direction === 'pingpong',
      'Product synth reset-home must restore range-mode sub-lane state and sequencing metadata',
    );
    assert(
      synthRangeResetEvents.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          event.flags === harness.context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue &&
          event.value === 0.2 &&
          event.value2 === 0.7),
      'Product synth reset-home must replay range-mode step-value events to Core',
    );

    harness.host.setDrumEuclidSwings([0.15]);
    harness.host.setDrumStepOverrides({ pitch: [[1, 2]], expression: [[0.2, 0.3]], pitchDirection: ['forward'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setDrumEuclidSwings([0.35]);
    harness.host.setDrumStepOverrides({ pitch: [[5, 6]], expression: [[0.4, 0.5]], pitchDirection: ['reverse'] });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setDrumStepOverrides({ pitch: [[9, 10]], expression: [[0.8, 0.9]], pitchDirection: ['forward'] });
    harness.host.resetDrumEuclidLaneHome(0);
    const drumPresetResetPayload = drumOverridePayloads.at(-1)?.payload ?? {};
    assert(
      drumPresetResetPayload.swing === 0.35 &&
        Array.isArray(drumPresetResetPayload.pitch?.[0]) &&
        drumPresetResetPayload.pitch[0][0] === 5 &&
        drumPresetResetPayload.pitch[0][1] === 6 &&
        Array.isArray(drumPresetResetPayload.expression?.[0]) &&
        drumPresetResetPayload.expression[0][0] === 0.4,
      'Product drum reset-home must restore the latest loaded preset home, not a stale edit or previous preset',
    );
    harness.host.setSynthSubLaneEnabled([{ pitch: true, expression: true }]);
    harness.host.setSynthPitchSettings([{ mode: 'semitones', root: 60, scale: 'Major' }]);
    harness.host.setSynthEuclidSwings([0.18]);
    harness.host.setSynthStepOverrides({ pitch: [[61]], expression: [[0.1]], pitchDirection: ['forward'] });
    harness.host.captureSynthEuclidLaneHome(0, { steps: 1, direction: 'forward', scaleQuantize: false });
    harness.host.setSynthEuclidSwings([0.28]);
    harness.host.setSynthStepOverrides({ pitch: [[72, 74]], expression: [[0.6, 0.7]], pitchDirection: ['reverse'] });
    harness.host.captureSynthEuclidLaneHome(0, { steps: 8, direction: 'pingpong', scaleQuantize: true });
    harness.host.setSynthStepOverrides({ pitch: [[55]], expression: [[0.95]], pitchDirection: ['forward'] });
    harness.host.resetSynthEuclidLaneHome(0);
    const synthSequencePresetResetPayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Math.abs((synthSequencePresetResetPayload.swing ?? 0) - 0.28) < 1.0e-6 &&
        Array.isArray(synthSequencePresetResetPayload.pitch) &&
        synthSequencePresetResetPayload.pitch[0] === 12 &&
        synthSequencePresetResetPayload.pitch[1] === 14 &&
        synthSequencePresetResetPayload.pitchSettings?.[0]?.mode === 'semitones' &&
        synthSequencePresetResetPayload.subLaneStates?.pitch?.steps === 8 &&
        synthSequencePresetResetPayload.subLaneStates.pitch.direction === 'pingpong' &&
        synthSequencePresetResetPayload.subLaneStates?.pitch?.scaleQuantize === true &&
        Array.isArray(synthSequencePresetResetPayload.expression) &&
        synthSequencePresetResetPayload.expression[0] === 0.6,
      'Product synth sequence preset lane-home capture must make reset restore the loaded sequence preset home',
    );
    harness.host.setDrumSubLaneEnabled([{ pitch: true, expression: true }]);
    harness.host.setDrumEuclidSwings([0.19]);
    harness.host.setDrumStepOverrides({ pitch: [[1]], expression: [[0.1]], pitchDirection: ['forward'] });
    harness.host.captureDrumEuclidLaneHome(0, { mode: 'semitones', root: 60, scale: 'Major' }, { scaleQuantize: false });
    harness.host.setDrumEuclidSwings([0.39]);
    harness.host.setDrumStepOverrides({ pitch: [[5, 6]], expression: [[0.45, 0.55]], pitchDirection: ['reverse'] });
    harness.host.captureDrumEuclidLaneHome(0, { mode: 'notes', root: 60, scale: 'Minor' }, { scaleQuantize: true });
    harness.host.setDrumStepOverrides({ pitch: [[9]], expression: [[0.95]], pitchDirection: ['forward'] });
    harness.host.resetDrumEuclidLaneHome(0);
    const drumSequencePresetResetPayload = drumOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Math.abs((drumSequencePresetResetPayload.swing ?? 0) - 0.39) < 1.0e-6 &&
        Array.isArray(drumSequencePresetResetPayload.pitch?.[0]) &&
        drumSequencePresetResetPayload.pitch[0][0] === 5 &&
        drumSequencePresetResetPayload.pitch[0][1] === 6 &&
        drumSequencePresetResetPayload.pitchSettings?.[0]?.mode === 'notes' &&
        drumSequencePresetResetPayload.pitchSettings[0].scale === 'Minor' &&
        drumSequencePresetResetPayload.subLaneStates?.pitch?.scaleQuantize === true &&
        Array.isArray(drumSequencePresetResetPayload.expression?.[0]) &&
        drumSequencePresetResetPayload.expression[0][0] === 0.45,
      'Product drum sequence preset lane-home capture must make reset restore the loaded sequence preset home',
    );
    harness.host.setDrumSubLaneEnabled([{ expression: true, morph: true, distance: true }]);
    harness.host.setDrumStepOverrides({
      expression: [[0.44, 0.48]],
      expressionRanges: [{ min: 0.25, max: 0.75 }],
      expressionDirection: ['reverse'],
      morph: [[0.2]],
      morphRanges: [{ min: 0.2, max: 0.55 }],
      morphDirection: ['pingpong'],
      distance: [[0.1, 0.2, 0.3]],
      distanceRanges: [{ min: 0.15, max: 0.65 }],
      distanceDirection: ['forward'],
    });
    harness.host.setSequencerPresetHomeSnapshots();
    harness.host.setDrumStepOverrides({ expression: [[0.95]], expressionDirection: ['forward'] });
    harness.host.resetDrumEuclidLaneHome(0);
    const drumRangeResetPayload = drumOverridePayloads.at(-1)?.payload ?? {};
    assert(
      drumRangeResetPayload.expressionRanges?.[0]?.min === 0.25 &&
        drumRangeResetPayload.expressionRanges[0].max === 0.75 &&
        drumRangeResetPayload.morphRanges?.[0]?.max === 0.55 &&
        drumRangeResetPayload.distanceRanges?.[0]?.min === 0.15,
      'Product drum reset-home must restore range-mode lane-array payloads for UI/preset refs',
    );
    assert(
      drumRangeResetPayload.subLaneStates?.expression?.enabled === true &&
        drumRangeResetPayload.subLaneStates.expression.valueMode === 'range' &&
        drumRangeResetPayload.subLaneStates.expression.rangeMin === 0.25 &&
        drumRangeResetPayload.subLaneStates.expression.rangeMax === 0.75 &&
        drumRangeResetPayload.subLaneStates.expression.steps === 2 &&
        drumRangeResetPayload.subLaneStates.expression.direction === 'reverse',
      'Product drum reset-home must restore range-mode sub-lane state and sequencing metadata',
    );

    harness.host.setSynthSubLaneEnabled([{}, { expression: true }]);
    harness.host.setEvolvedSequencerSubLaneConfigs('synth', 1, {
      configs: [{
        field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression,
        steps: 9,
        direction: harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse,
      }],
      valueOverrides: [
        { step: 0, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.25 },
        { step: 1, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 2, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 3, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 4, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 5, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 6, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 7, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
        { step: 8, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.5 },
      ],
      changedValueFields: [harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression],
      subLaneStates: { expression: { steps: 9, direction: 'reverse' } },
      directionPayloads: { expressionDirection: 'reverse' },
    });
    assert(
      harness.host.synthStepValueConfigs[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          entry.steps === 9 &&
          entry.direction === harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse),
      'Product host sub-lane evolve must update host replay config cache',
    );
    assert(
      harness.host.synthStepValueOverrides[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          entry.step === 8 &&
          entry.value === 0.5),
      'Product host sub-lane length evolve must update duplicated step-value cache entries',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-sublane-config' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 1 &&
          event.steps === 9),
      'Product host sub-lane evolve must post live sub-lane config events',
    );
    assert(
      harness.runtime.events.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 1 &&
          event.step === 8 &&
          event.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          event.value === 0.5),
      'Product host sub-lane length evolve must post live duplicated step-value events',
    );
    assert(
      synthOverridePayloads.some((entry) =>
        entry.laneIndex === 1 &&
          entry.payload.subLaneStates?.expression?.steps === 9 &&
          entry.payload.expressionDirection === 'reverse' &&
          Array.isArray(entry.payload.expression) &&
          entry.payload.expression.length === 9 &&
          entry.payload.expression[8] === 0.5),
      'Product host sub-lane evolve must notify UI/preset refs with length, direction, and resized values',
    );
    harness.host.setSynthPitchSettings([null, { mode: 'semitones', root: 48, scale: 'Major' }]);
    harness.host.setEvolvedSequencerSubLaneConfigs('synth', 1, {
      configs: [{
        field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote,
        steps: 2,
        direction: harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.forward,
      }],
      valueOverrides: [
        { step: 0, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, value: 60 },
        { step: 1, field: harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, value: 64 },
      ],
      changedValueFields: [harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote],
      subLaneStates: { pitch: { steps: 2, direction: 'forward' } },
      directionPayloads: { pitchDirection: 'forward' },
    });
    const synthPitchEvolvePayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Array.isArray(synthPitchEvolvePayload.pitch) &&
        synthPitchEvolvePayload.pitch[0] === 12 &&
        synthPitchEvolvePayload.pitch[1] === 16,
      'Product synth sub-lane evolve must convert Core MIDI pitch payloads through the current pitch root',
    );

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
      harness.host.synthStepValueOverrides[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          entry.step === 1 &&
          entry.range === true &&
          entry.value === 0.8 &&
          entry.value2 === 0.9),
      'synth reconciliation must copy Product Core range step values into host cache',
    );
    assert(
      synthOverridePayloads.some((entry) => entry.laneIndex === 1 && Array.isArray(entry.payload.pitch)),
      'synth reconciliation must notify UI with detailed diced override payload',
    );
    assert(
      synthOverridePayloads.some((entry) =>
        entry.laneIndex === 1 &&
          Array.isArray(entry.payload.trigCondition) &&
          entry.payload.trigCondition[0]?.[0] === 1 &&
          entry.payload.trigCondition[0]?.[1] === 2),
      'synth reconciliation must notify UI with Product Core trig-condition payloads',
    );
    assert(
      harness.host.synthStepValueConfigs[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          entry.steps === 7 &&
          entry.direction === harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse),
      'synth reconciliation must copy Product Core sub-lane step config into host cache',
    );
    assert(
      synthOverridePayloads.some((entry) =>
        entry.laneIndex === 1 &&
          entry.payload.subLaneStates?.expression?.steps === 7 &&
          entry.payload.subLaneStates.expression.direction === 'reverse'),
      'synth reconciliation must notify UI with Product Core sub-lane length/direction metadata',
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
      stepValueConfigEnabledMask: 0,
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
      drumOverridePayloads.some((entry) =>
        Array.isArray(entry.payload.probability?.[2]) &&
          entry.payload.probability[2].length === 0),
      'reset-home reconciliation must notify UI with explicit empty lane override payload',
    );
    assert(
      drumOverridePayloads.some((entry) =>
        entry.laneIndex === 2 &&
          entry.payload.subLaneStates?.pitch?.enabled === false &&
          entry.payload.subLaneStates.expression?.enabled === false &&
          entry.payload.subLaneStates.morph?.enabled === false &&
          entry.payload.subLaneStates.distance?.enabled === false),
      'reset-home reconciliation must explicitly clear Product-supported sub-lane UI state',
    );

    const eventCountBeforeReload = harness.runtime.events.length;
    harness.host.loadProductSnapshot({ transport: { bpm: 120 } }, 'adapter-update');
    const replayedEvents = harness.runtime.events.slice(eventCountBeforeReload);
    assert(harness.runtime.snapshots.length === 1, 'full snapshot reload must call runtime.loadSnapshot');
    assert(
      replayedEvents.some((event) => event.type === 'sequencer-clear-steps' && event.sequencer === 'synth' && event.laneIndex === 1) &&
        replayedEvents.some((event) => event.type === 'sequencer-step' && event.sequencer === 'synth' && event.laneIndex === 1) &&
        replayedEvents.some((event) => event.type === 'sequencer-sublane-config' && event.sequencer === 'synth' && event.laneIndex === 1) &&
        replayedEvents.some((event) => event.type === 'sequencer-lane-param' && event.paramId === 'SequencerLanePitchBindingMode'),
      'full snapshot reload must replay reconciled synth dice state and pitch binding from host cache',
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
