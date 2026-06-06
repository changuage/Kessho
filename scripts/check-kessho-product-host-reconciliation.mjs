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
const snapshotCoordinator = readProjectFile('src/audio/product/host/CoreProductSnapshotCoordinator.ts');
const sequencerUiAdapter = readProjectFile('src/audio/product/host/CoreProductSequencerUiAdapter.ts');
const sequencerHomeCaptureEventBridge = readProjectFile('src/audio/product/host/CoreProductSequencerHomeCaptureEventBridge.ts');
const sequencerLaneParamBridge = readProjectFile('src/audio/product/host/CoreProductSequencerLaneParamBridge.ts');
const sequencerPitchSettingEventBridge = readProjectFile('src/audio/product/host/CoreProductSequencerPitchSettingEventBridge.ts');
const sequencerSubLaneEnabledEventBridge = readProjectFile('src/audio/product/host/CoreProductSequencerSubLaneEnabledEventBridge.ts');
const sequencerControlEventBridge = readProjectFile('src/audio/product/host/CoreProductSequencerControlEventBridge.ts');
const sequencerMorphFeedbackBridge = readProjectFile('src/audio/product/host/CoreProductSequencerMorphFeedbackBridge.ts');
const manualSynthDiceBridge = readProjectFile('src/audio/product/host/CoreProductManualSynthDiceBridge.ts');
const hostRuntimeSurface = `${host}\n${runtimeAdapter}\n${snapshotCoordinator}\n${sequencerUiAdapter}\n${sequencerHomeCaptureEventBridge}\n${sequencerLaneParamBridge}\n${sequencerPitchSettingEventBridge}\n${sequencerSubLaneEnabledEventBridge}\n${sequencerControlEventBridge}\n${sequencerMorphFeedbackBridge}\n${manualSynthDiceBridge}`;
const sequencerTests = readProjectFile('cpp/KesshoCore/tests/ProductSequencerTests.cpp');

function hostMethodBody(name) {
  return methodBody(hostRuntimeSurface, name);
}

function assertLiveSequencerMutation(methodName, eventCreator) {
  const body = hostMethodBody(methodName);
  assert(body.includes(`this.postProductEvent(${eventCreator}`), `${methodName}() must delegate to the ProductEvent queue path`);
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

function setPitchSettingsViaEvents(harness, sequencer, settings) {
  for (const event of harness.context.createCoreProductSequencerPitchSettingEvents(sequencer, settings)) {
    harness.host.postProductEvent(event);
  }
}

const SUB_LANE_ENABLED_FIELD_KEYS = [
  ['pitch', 'midiNote'],
  ['expression', 'expression'],
  ['morph', 'morph'],
  ['distance', 'distance'],
];

function setSubLaneEnabledViaEvents(harness, sequencer, states) {
  const context = harness.context;
  const laneCount = Math.max(4, Math.min(16, Array.isArray(states) ? states.length || 4 : 4));
  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    const state = states?.[laneIndex] ?? {};
    for (const [key, fieldKey] of SUB_LANE_ENABLED_FIELD_KEYS) {
      harness.host.postProductEvent({
        eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
        targetId: context.CORE_PRODUCT_SEQUENCER_IDS[sequencer],
        index: laneIndex,
        paramId: context.CORE_PRODUCT_STEP_VALUE_FIELDS[fieldKey] / (1 << 8),
        value: state[key] === true ? 1 : 0,
        value2: 1,
        value3: context.CORE_PRODUCT_SUBLANE_DIRECTIONS.forward,
        flags: context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.active |
          context.CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig |
          context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.subLaneEnabledState,
      });
    }
  }
}

function setEvolveConfigsViaEvents(harness, sequencer, configs) {
  const events = harness.context.createCoreProductSequencerEvolveConfigEvents(sequencer, configs);
  for (const event of events) harness.host.postProductEvent(event);
}

function setDrumStepOverridesViaEvents(harness, overrides) {
  const context = harness.context;
  const emptyLanes = [[], [], [], []];
  const toggles = context.normalizeSequencerStepToggleOverrides(overrides, emptyLanes);
  const values = context.normalizeDrumSequencerStepOffsetOverrides(overrides, emptyLanes);
  const configs = context.normalizeSequencerStepValueConfigs(overrides, emptyLanes, true);
  const laneCount = Math.max(toggles.length, values.length, configs.length);
  const baseFlags = context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideState;
  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    harness.host.postProductEvent({
      eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
      targetId: context.CORE_PRODUCT_SEQUENCER_IDS.drum,
      index: laneIndex,
      flags: context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane | baseFlags,
    });
    for (const config of configs[laneIndex] ?? []) {
      harness.host.postProductEvent({
        eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
        targetId: context.CORE_PRODUCT_SEQUENCER_IDS.drum,
        index: laneIndex,
        paramId: config.field / (1 << 8),
        value: 1,
        value2: config.steps,
        value3: config.direction,
        flags: context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.active |
          context.CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig |
          baseFlags,
      });
    }
    for (const toggle of toggles[laneIndex] ?? []) {
      harness.host.postProductEvent({
        eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
        targetId: context.CORE_PRODUCT_SEQUENCER_IDS.drum,
        index: laneIndex,
        paramId: toggle.step,
        value: toggle.value ? 1 : 0,
        flags: context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | baseFlags,
      });
    }
    for (const value of values[laneIndex] ?? []) {
      harness.host.postProductEvent({
        eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
        targetId: context.CORE_PRODUCT_SEQUENCER_IDS.drum,
        index: laneIndex,
        paramId: value.step,
        value: value.value,
        value2: value.value2 ?? 0,
        flags: context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.active |
          value.field |
          (value.range ? context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue : 0) |
          (value.field === context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote
            ? context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.drumPitchOffsetValue
            : 0) |
          baseFlags,
      });
    }
  }
  harness.host.postProductEvent({
    eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: context.CORE_PRODUCT_SEQUENCER_IDS.drum,
    index: 0,
    flags: baseFlags | context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideCommit,
  });
}

function captureSequencerLaneHomeViaEvents(harness, sequencer, laneIndex, pitchState, options = {}) {
  const context = harness.context;
  const pitchFlags = pitchState && typeof pitchState === 'object'
    ? context.CORE_PRODUCT_HOME_CAPTURE_FLAGS.hasPitchState |
      (typeof pitchState.scaleQuantize === 'boolean' ? context.CORE_PRODUCT_HOME_CAPTURE_FLAGS.pitchScaleQuantizeSet : 0) |
      (pitchState.scaleQuantize === true ? context.CORE_PRODUCT_HOME_CAPTURE_FLAGS.pitchScaleQuantize : 0)
    : 0;
  const directionIds = {
    forward: context.CORE_PRODUCT_SUBLANE_DIRECTIONS.forward,
    reverse: context.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse,
    pingpong: context.CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong,
  };
  harness.host.postProductEvent({
    eventKind: context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: context.CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: laneIndex,
    value: (options.force === false ? 0 : context.CORE_PRODUCT_HOME_CAPTURE_FLAGS.force) |
      (options.requireContent ? context.CORE_PRODUCT_HOME_CAPTURE_FLAGS.requireContent : 0) |
      pitchFlags,
    value2: typeof pitchState?.steps === 'number' ? pitchState.steps : 0,
    value3: directionIds[pitchState?.direction] ?? -1,
    flags: context.CORE_PRODUCT_STEP_TOGGLE_FLAGS.homeCaptureState,
  });
}

function setSequencerPresetHomeSnapshotsViaEvents(harness, drumPitchStates, synthPitchStates) {
  const synthLaneCount = Math.max(4, Math.min(16, Array.isArray(synthPitchStates) ? synthPitchStates.length || 4 : 4));
  for (let laneIndex = 0; laneIndex < synthLaneCount; laneIndex += 1) {
    captureSequencerLaneHomeViaEvents(harness, 'synth', laneIndex, synthPitchStates?.[laneIndex], { force: true });
  }
  const drumLaneCount = Math.max(4, Math.min(16, Array.isArray(drumPitchStates) ? drumPitchStates.length || 4 : 4));
  for (let laneIndex = 0; laneIndex < drumLaneCount; laneIndex += 1) {
    captureSequencerLaneHomeViaEvents(harness, 'drum', laneIndex, drumPitchStates?.[laneIndex], { force: true });
  }
}

function captureDrumLaneHomeViaEvents(harness, laneIndex, pitchSettings, pitchState) {
  if (pitchSettings) {
    const settings = Array.from({ length: laneIndex + 1 }, () => undefined);
    settings[laneIndex] = pitchSettings;
    setPitchSettingsViaEvents(harness, 'drum', settings);
  }
  captureSequencerLaneHomeViaEvents(harness, 'drum', laneIndex, pitchState, { force: true });
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
    swing: 0.27,
    baseMidiNote: 60,
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

function makeProductLane(overrides = {}) {
  return {
    enabled: true,
    targetSourceId: 1,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    swing: 0,
    probability: 1,
    ratchet: 1,
    trigCondition: 0,
    midiNote: 60,
    velocity: 1,
    holdSeconds: 0.25,
    morph: 0.5,
    distance: 0.5,
    expression: 0.5,
    seed: 1234,
    barReset: false,
    phraseReset: false,
    manualStepMaskLow: 0,
    manualStepMaskHigh: 0,
    tempoMultiplier: 1,
    initialStartDelaySeconds: 0,
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
    assert(
      host.includes('applyCoreProductSequencerHomeCaptureEvent({') &&
        host.includes('this.captureSequencerHomeLane(captureSequencer, captureLaneIndex, force, requireContent, undefined, pitchState)') &&
        sequencerHomeCaptureEventBridge.includes('CORE_PRODUCT_HOME_CAPTURE_FLAGS.force') &&
        sequencerHomeCaptureEventBridge.includes('decodePitchState(event, valueFlags)'),
      'preset restore and lane-home capture must route through Product home-capture events with force and pitch metadata',
    );
    assert(
      hostMethodBody('captureSequencerHomeLanes').includes('this.captureSequencerHomeLane(sequencer, laneIndex, force, requireContent'),
      'bulk Product home capture must forward the force flag to per-lane capture',
    );
    const resetSequencerEvolveStateBody = hostMethodBody('resetSequencerEvolveState');
    assert(
      resetSequencerEvolveStateBody.includes('this.sequencerEvolveBridge.reset();'),
      'resetSequencerEvolveState() must reset Product sequencer evolve clock state',
    );
    for (const methodName of ['start', 'resume', 'suspend', 'stop', 'dispose']) {
      assert(
        hostMethodBody(methodName).includes('this.resetSequencerEvolveState();'),
        `${methodName}() must reset Product sequencer evolve clock state at transport lifecycle boundaries`,
      );
    }

    const manualFastPathHarness = loadCoreProductHostHarness();
    const manualFastPathHost = manualFastPathHarness.host;
    const manualFastPathRuntime = manualFastPathHarness.runtime;
    const manualFastPathSliderState = { padEnabled: true, leadEnabled: true, drumEnabled: true };
    const manualFastPathSnapshot = {
      transport: { bpm: 120 },
      sources: [
        { sourceId: 1, enabled: true },
        { sourceId: 3, enabled: true },
        { sourceId: 5, enabled: true },
      ],
    };
    manualFastPathRuntime.audioContext = { state: 'running', sampleRate: 48000, currentTime: 0 };
    manualFastPathHost.runtimeReady = true;
    manualFastPathHost.latestSliderState = manualFastPathSliderState;
    manualFastPathHost.latestProductSnapshot = manualFastPathSnapshot;
    await manualFastPathHost.auditionSynthNote({ source: 'pad1', midi: 60, velocity: 0.75, durationMs: 120 }, manualFastPathSliderState);
    await manualFastPathHost.auditionSynthNotes([
      { source: 'pad1', midi: 64, velocity: 0.7, durationMs: 120 },
      { source: 'lead1', midi: 67, velocity: 0.68, durationMs: 120 },
    ], manualFastPathSliderState);
    await manualFastPathHost.triggerDrumVoice('snare', 0.8, manualFastPathSliderState);
    manualFastPathHost.pushMidiMessage({ data: [0x90, 60, 100], timestamp: 12.5 });
    manualFastPathHost.enqueueLiveNoteEvent({ kind: 'live-note-on', eventID: 'test-live-on', source: 'ui-pad', instrument: 'lead1', channel: 2, note: 72, velocity: 0.5, timestampMs: 12500 });
    manualFastPathHost.enqueueLiveNoteEvent({ kind: 'live-note-off', eventID: 'test-live-off', source: 'ui-pad', instrument: 'lead1', channel: 2, note: 72, velocity: 0, timestampMs: 12550 });
    assert(
      manualFastPathHost.latestProductSnapshot === manualFastPathSnapshot,
      'manual Product note/MIDI fast path must not rebuild or dirty-diff an already compiled runtime snapshot',
    );
    assert(
      manualFastPathHost.latestSliderState === manualFastPathSliderState,
      'manual Product note/MIDI fast path must not copy UI state on repeated trigger posts',
    );
    assert(manualFastPathRuntime.snapshots.length === 0, 'manual Product note/MIDI fast path must not load a snapshot');
    assert(
      manualFastPathRuntime.events.filter((event) => event.type === 'manual-note').length === 3 &&
        manualFastPathRuntime.events.filter((event) => event.type === 'drum-trigger').length === 1 &&
        manualFastPathRuntime.events.filter((event) => event.type === 'host-midi').length === 1 &&
        manualFastPathRuntime.events.filter((event) => event.type === 'live-note-midi').length === 2,
      'manual Product note/MIDI fast path must still post compact Product runtime events',
    );
    assert(
      manualFastPathRuntime.events.some((event) =>
        event.type === 'live-note-midi' &&
          event.targetId === 3 &&
          event.status === 0x92 &&
          event.data1 === 72 &&
          event.data2 === 64) &&
        manualFastPathRuntime.events.some((event) =>
          event.type === 'live-note-midi' &&
          event.status === 0x82 &&
          event.data2 === 0),
      'Product live-note enqueue must compile to targeted Core MIDI note-on/off events',
    );

    const postSequencerBody = hostMethodBody('postSequencerControlEvent');
    assert(postSequencerBody.includes('if (this.runtimeReady)'), 'postSequencerControlEvent() must branch on runtime readiness');
    assert(postSequencerBody.includes('this.runtime.postEvent(event)'), 'postSequencerControlEvent() must post the live event');
    assert(
      postSequencerBody.indexOf('this.runtime.postEvent(event)') < postSequencerBody.indexOf('this.loadLatestSnapshot()') ||
        postSequencerBody.includes('const post = () => this.runtime.postEvent(event);'),
      'runtime-ready sequencer control events must post before any snapshot bootstrap path',
    );
    const postManualSynthDiceBody = hostMethodBody('postManualSynthDiceEvent');
    for (const token of [
      'if (this.runtimeReady)',
      'this.runtime.postEvent(event)',
      'this.runtime.ensureStarted().then',
      "this.loadLatestSnapshot('runtime-bootstrap')",
    ]) {
      assert(postManualSynthDiceBody.includes(token), `manual synth dice cold post path is missing ${token}`);
    }
    const postProductEventBody = hostMethodBody('postProductEvent');
    assert(
      postProductEventBody.includes('if (this.handleSequencerUiProductEvent(event)) return;') &&
        postProductEventBody.indexOf('this.handleSequencerUiProductEvent(event)') < postProductEventBody.indexOf('Core Product runtime cannot enqueue product events'),
      'postProductEvent() must handle Product sequencer UI events before the generic runtime-ready guard',
    );
    const applyManualSynthDiceBody = hostMethodBody('applyManualSynthDice');
    assert(
      applyManualSynthDiceBody.includes('post: (event) => this.postManualSynthDiceEvent(event)'),
      'manual synth dice must route native dice events through the host cold-runtime post helper',
    );
    const sequencerEventBody = hostMethodBody('handleSequencerUiProductEvent');
    for (const token of [
      'KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane',
      'applyCoreProductSequencerEvolveConfigEvent({',
      'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision',
      'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing',
      'KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode',
      "patchCoreProductSequencerLaneAdapterParam(this.adapterState, sequencer, laneIndex, 'ClockDivision', normalizeClockDivisionValue(event.value, 16))",
      "patchCoreProductSequencerLaneAdapterParam(this.adapterState, sequencer, laneIndex, 'Swing', normalizeSequencerSwing(event.value, 0))",
      'patchCoreProductSynthPitchBindingModeFromEvent(this.adapterState, laneIndex, event)',
      'if (this.runtimeReady) this.runtime.postEvent(event)',
      'handleCoreProductSequencerControlEvent({',
      'restoreLaneHome: (restoreSequencer, restoreLaneIndex) => this.restoreSequencerLaneHome(restoreSequencer, restoreLaneIndex)',
      "if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane && sequencer === 'synth')",
      "this.applyManualSynthDice(laneIndex, typeof event.value === 'number' ? event.value : 1)",
      'armManualDice: (diceSequencer, diceLaneIndex) => this.armSequencerManualDice(diceSequencer, diceLaneIndex)',
      'postControlEvent: (controlEvent) => this.postSequencerControlEvent(controlEvent)',
      'publish: (name, publishLaneIndex) => this.invokeDisplayCallback(name, publishLaneIndex)',
    ]) {
      assert(sequencerEventBody.includes(token), `ProductEvent sequencer UI handler is missing ${token}`);
    }
    const armManualDiceBody = manualSynthDiceBridge;
    for (const token of [
      "if (options.sequencer === 'synth')",
      "laneStepStateSignature(options.cache, 'synth', options.laneIndex)",
      'options.arm(options.sequencer, options.laneIndex)',
    ]) {
      assert(armManualDiceBody.includes(token), `ProductEvent manual dice arming helper is missing ${token}`);
    }
    const manualSynthDiceBody = manualSynthDiceBridge;
    for (const token of [
      'options.captureHome()',
      'options.armManualDice()',
      "sequencer: 'synth'",
      'const config = manualSynthDiceConfig(options.adapterState, options.laneIndex, options.intensity)',
      "nativeEvolveFlagsForEvolveConfig(config, 'synth')",
      'if (nativeFlags !== 0)',
      'createCoreProductSequencerDiceEvent(',
      'CORE_PRODUCT_EVOLVE_FLAGS.manualCommit',
      'CORE_PRODUCT_EVOLVE_FLAGS.modeParity',
      "options.publish('synthEuclidEvolve', options.laneIndex)",
    ]) {
      assert(manualSynthDiceBody.includes(token), `ProductEvent manual synth dice path is missing ${token}`);
    }
    assert(!manualSynthDiceBody.includes('options.runtimeReady && nativeFlags !== 0'), 'manual synth dice bridge must not drop native dice while Product runtime is still bootstrapping');
    const controlEventBody = hostMethodBody('handleCoreProductSequencerControlEvent');
    for (const token of [
      'KESSHO_PRODUCT_EVENT_IDS.ResetSequencerLaneHome',
      'KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane',
      'options.restoreLaneHome(options.sequencer, options.laneIndex)',
      "if (options.sequencer === 'synth') return true",
      'options.armManualDice(options.sequencer, options.laneIndex)',
      'options.postControlEvent(options.event)',
      "options.publish(options.sequencer === 'synth' ? 'synthEuclidEvolve' : 'drumEuclidEvolve', options.laneIndex)",
    ]) {
      assert(controlEventBody.includes(token), `ProductEvent sequencer control bridge is missing ${token}`);
    }
    const laneParamEventBody = hostMethodBody('patchCoreProductSequencerLaneAdapterParam');
    for (const token of [
      "const prefix = sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid'",
      "`${prefix}${laneIndex + 1}${suffix}`",
      'return { ...adapterState',
    ]) {
      assert(laneParamEventBody.includes(token), `ProductEvent sequencer lane-param adapter patch is missing ${token}`);
    }
    const pitchBindingPatchBody = hostMethodBody('patchCoreProductSynthPitchBindingModeFromEvent');
    for (const token of [
      'sequencerPitchBindingModeFromEventId',
      "event.value === 1 ? 'sequence' : 'polyrhythmic'",
      'synthPitchBindingModes: modes',
    ]) {
      assert(pitchBindingPatchBody.includes(token), `ProductEvent synth pitch-binding cache patch is missing ${token}`);
    }

    const updateBody = hostMethodBody('applyLatestSnapshotUpdate');
    const coordinatorBody = methodBody(snapshotCoordinator, 'applyCoreProductSnapshotUpdate');
    assert(updateBody.includes('previousSnapshot: this.latestProductSnapshot'), 'snapshot update must compare against last host snapshot');
    assert(updateBody.includes('applyCoreProductSnapshotUpdate'), 'snapshot update must delegate through the dirty-diff coordinator');
    assert(coordinatorBody.includes('if (options.forceFullSnapshot)'), 'snapshot coordinator must expose an explicit forced full-snapshot branch');
    assert(coordinatorBody.includes('buildCoreProductSnapshotDiff(options.previousSnapshot, options.nextSnapshot'), 'snapshot coordinator must try dirty diff first');
    assert(
      coordinatorBody.indexOf('buildCoreProductSnapshotDiff(options.previousSnapshot, options.nextSnapshot') <
        coordinatorBody.indexOf('return loadSnapshotUpdate(options, options.pendingReloadReason ?? diff.reason ?? options.fallbackReloadReason)'),
      'non-forced snapshot update must only full-reload after dirty diff rejection',
    );

    const loadSnapshotBody = hostMethodBody('afterProductSnapshotLoad');
    assert(
      loadSnapshotBody.includes('this.flushSequencerStepToggles();'),
      'full snapshot reloads must replay reconciled sequencer UI caches after load',
    );

    assert(
      !host.includes('patchAdapterState('),
      'adapter state patches must stay retired; source data changes must enter through resolved ProductControl commits',
    );

    const createSnapshotBody = hostMethodBody('createLatestSnapshot');
    const createHostSnapshotBody = methodBody(snapshotCoordinator, 'createCoreProductHostSnapshot');
    assert(
      createSnapshotBody.includes('createCoreProductHostSnapshot({') &&
        createSnapshotBody.includes('latestSliderState: this.latestSliderState') &&
        createSnapshotBody.includes('adapterState: this.adapterState') &&
        createSnapshotBody.includes('latestTelemetry: this.latestTelemetry'),
      'host createLatestSnapshot() must delegate snapshot state reconciliation to CoreProductSnapshotCoordinator',
    );
    for (const token of [
      'telemetryRngState',
      'rngSeed: state.latestTelemetry.rngSeed',
      'rngState: state.latestTelemetry.rngState',
      '...state.latestSliderState, ...state.adapterState',
    ]) {
      assert(createHostSnapshotBody.includes(token), `createCoreProductHostSnapshot() must reconcile ${token}`);
    }

    const telemetryBody = hostMethodBody('handleTelemetry');
    for (const token of [
      'this.reconcileSequencerUiState(hostTelemetry)',
      'this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry)',
      'this.updateSequencerMorphFeedback(hostTelemetry)',
    ]) {
      assert(telemetryBody.includes(token), `handleTelemetry() must reconcile Core-owned state from telemetry: ${token}`);
    }
    assert(
      telemetryBody.indexOf('this.reconcileSequencerUiState(hostTelemetry)') <
        telemetryBody.indexOf('this.tickSequencerEvolveClock(hostTelemetry)'),
      'handleTelemetry() must reconcile Core-owned sequencer UI state before the evolve tick reads the host cache',
    );

    const sequencerUiBody = hostMethodBody('reconcileSequencerUiState');
    for (const token of [
      'reconcileCoreProductSequencerUiState({',
      'this.lastSequencerUiStateRevision',
      'setSynthLaneState:',
      'setDrumLaneState:',
      'setLaneSwing:',
      'setSynthNoteRangeOverride:',
      'publishNoteRange:',
    ]) {
      assert(sequencerUiBody.includes(token), `reconcileSequencerUiState() must preserve Core-owned mutation state: ${token}`);
    }

    const sequencerUiAdapterBody = methodBody(sequencerUiAdapter, 'reconcileCoreProductSequencerUiState');
    for (const token of [
      'options.telemetry.sequencerUiState',
      'state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.synth',
      'state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.drum',
      'CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE',
      'CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME',
    ]) {
      assert(sequencerUiAdapterBody.includes(token), `CoreProductSequencerUiAdapter must preserve Core-owned mutation state: ${token}`);
    }

    for (const methodName of ['reconcileSynthSequencerLane', 'reconcileDrumSequencerLane']) {
      const body = methodBody(sequencerUiAdapter, `function ${methodName}`);
      for (const token of [
        'coreProductStepValueOverridesFromLane(lane',
        'coreProductStepValueConfigsFromLaneOrPrevious(lane',
        'lane.triggerToggles.map',
        'options.setLaneSwing(',
        'options.publish(',
      ]) {
        assert(body.includes(token), `${methodName}() must update host caches and UI callbacks from Product Core state: ${token}`);
      }
    }
    assert(
      methodBody(sequencerUiAdapter, 'function reconcileSynthSequencerLane').includes('reconcileCoreProductSequencerSynthNoteRange('),
      'reconcileSynthSequencerLane() must publish native note-range evolve bounds from Product Core state',
    );

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

    const laneParamHarness = loadCoreProductHostHarness();
    const clockDivisionParamId = laneParamHarness.context.KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision;
    const swingParamId = laneParamHarness.context.KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing;
    laneParamHarness.host.postProductEvent({
      eventKind: laneParamHarness.context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane,
      targetId: laneParamHarness.context.CORE_PRODUCT_SEQUENCER_IDS.synth,
      index: 2,
      paramId: clockDivisionParamId,
      value: 8,
    });
    assert(
      laneParamHarness.host.adapterState.synthEuclid3ClockDivision === 8 &&
        laneParamHarness.runtime.events.length === 0,
      'pre-runtime Product clock-division events must update host adapter state without bootstrapping audio',
    );
    laneParamHarness.host.runtimeReady = true;
    laneParamHarness.host.postProductEvent({
      eventKind: laneParamHarness.context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane,
      targetId: laneParamHarness.context.CORE_PRODUCT_SEQUENCER_IDS.drum,
      index: 1,
      paramId: swingParamId,
      value: 0.27,
    });
    assert(
      Math.abs(laneParamHarness.host.adapterState.drumEuclid2Swing - 0.27) < 1.0e-6 &&
        laneParamHarness.runtime.events.some((event) =>
          event.eventKind === laneParamHarness.context.KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane &&
            event.targetId === laneParamHarness.context.CORE_PRODUCT_SEQUENCER_IDS.drum &&
            event.index === 1 &&
            event.paramId === swingParamId),
      'live Product swing events must update host adapter state and post to the runtime',
    );
    addEvidence(report, {
      id: 'sequencer-lane-param-product-event-routing',
      summary: 'Clock division and swing ProductEvents update host adapter state without forcing pre-runtime audio bootstrap.',
      details: {
        synthClockDivision: laneParamHarness.host.adapterState.synthEuclid3ClockDivision,
        drumSwing: laneParamHarness.host.adapterState.drumEuclid2Swing,
        runtimeEvents: laneParamHarness.runtime.events,
      },
    });

    const generatedStepEventHarness = loadCoreProductHostHarness();
    generatedStepEventHarness.host.runtimeReady = true;
    const stepEventContext = generatedStepEventHarness.context;
    generatedStepEventHarness.host.postProductEvent({
      eventKind: stepEventContext.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
      targetId: stepEventContext.CORE_PRODUCT_SEQUENCER_IDS.synth,
      index: 1,
      flags: stepEventContext.CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane,
    });
    generatedStepEventHarness.host.postProductEvent({
      eventKind: stepEventContext.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
      targetId: stepEventContext.CORE_PRODUCT_SEQUENCER_IDS.synth,
      index: 1,
      paramId: stepEventContext.CORE_PRODUCT_STEP_VALUE_FIELDS.expression / (1 << 8),
      value: 1,
      value2: 2,
      value3: stepEventContext.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse,
      flags: stepEventContext.CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | stepEventContext.CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig,
    });
    generatedStepEventHarness.host.postProductEvent({
      eventKind: stepEventContext.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
      targetId: stepEventContext.CORE_PRODUCT_SEQUENCER_IDS.synth,
      index: 1,
      paramId: 0,
      value: 0.73,
      flags: stepEventContext.CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | stepEventContext.CORE_PRODUCT_STEP_VALUE_FIELDS.expression,
    });
    assert(
      generatedStepEventHarness.host.sequencerCache.synth.configs[1].some((entry) =>
        entry.field === stepEventContext.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          entry.steps === 2 &&
          entry.direction === stepEventContext.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) &&
        generatedStepEventHarness.host.sequencerCache.synth.values[1].some((entry) =>
          entry.field === stepEventContext.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
            entry.step === 0 &&
            Math.abs(entry.value - 0.73) < 1.0e-6) &&
        generatedStepEventHarness.runtime.events.some((event) =>
          event.eventKind === stepEventContext.KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep &&
            event.targetId === stepEventContext.CORE_PRODUCT_SEQUENCER_IDS.synth &&
            event.index === 1),
      'generated synth step ProductEvents must reconcile host cache and post to live runtime',
    );
    addEvidence(report, {
      id: 'synth-step-override-generated-event-routing',
      summary: 'Generated synth step ProductEvents update host cache and post to live runtime.',
      details: {
        configs: generatedStepEventHarness.host.sequencerCache.synth.configs[1],
        values: generatedStepEventHarness.host.sequencerCache.synth.values[1],
        runtimeEvents: generatedStepEventHarness.runtime.events,
      },
    });

    const stepValueHarness = loadCoreProductHostHarness();
    stepValueHarness.host.runtimeReady = true;
    const { CORE_PRODUCT_STEP_VALUE_FIELDS, CORE_PRODUCT_SUBLANE_DIRECTIONS } = stepValueHarness.context;
    setSubLaneEnabledViaEvents(stepValueHarness, 'synth', [{ expression: true, morph: true }]);
    const beforeSynthStepValueEvents = stepValueHarness.runtime.events.length;
    stepValueHarness.host.setSynthStepOverrides({
      expression: [[0.55, 0.65]],
      expressionDirection: ['forward'],
      morph: [[0.2, 0.8]],
      morphDirection: ['reverse'],
      ratchet: [[1, 3]],
    });
    const synthStepValueEvents = stepValueHarness.runtime.events.slice(beforeSynthStepValueEvents);
    assert(
      synthStepValueEvents.some((event) =>
        event.type === 'sequencer-sublane-config' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.morph &&
          event.steps === 2 &&
          event.direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse),
      'Product host must post live synth preset-morph sub-lane direction/length into Core',
    );
    assert(
      synthStepValueEvents.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.step === 1 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.morph &&
          event.value === 0.8),
      'Product host must post live synth preset-morph step values into Core',
    );
    assert(
      synthStepValueEvents.some((event) =>
        event.type === 'sequencer-sublane-config' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet &&
          event.steps === 2),
      'Product host must post live synth ratchet sub-lane length into Core',
    );
    assert(
      synthStepValueEvents.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          event.step === 1 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet &&
          event.value === 3),
      'Product host must post live synth ratchet step values into Core',
    );

    setSubLaneEnabledViaEvents(stepValueHarness, 'drum', [{ expression: true, morph: true }]);
    const beforeDrumStepValueEvents = stepValueHarness.runtime.events.length;
    setDrumStepOverridesViaEvents(stepValueHarness, {
      expressionDirection: ['reverse'],
      morph: [[0.1, 0.6]],
      morphDirection: ['pingpong'],
      ratchet: [[2, 4]],
    });
    const drumStepValueEvents = stepValueHarness.runtime.events.slice(beforeDrumStepValueEvents);
    assert(
      drumStepValueEvents.some((event) =>
        event.type === 'sequencer-sublane-config' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 0 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.morph &&
          event.steps === 2 &&
          event.direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong),
      'Product host must post live drum preset-morph sub-lane direction/length into Core',
    );
    assert(
      drumStepValueEvents.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 0 &&
          event.step === 1 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.morph &&
          event.value === 0.6),
      'Product host must post live drum preset-morph step values into Core',
    );
    assert(
      drumStepValueEvents.some((event) =>
        event.type === 'sequencer-sublane-config' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 0 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet &&
          event.steps === 2 &&
          event.direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse),
      'Product host must post live drum ratchet sub-lane direction/length into Core',
    );
    assert(
      drumStepValueEvents.some((event) =>
        event.type === 'sequencer-step-value' &&
          event.sequencer === 'drum' &&
          event.laneIndex === 0 &&
          event.step === 1 &&
          event.field === CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet &&
          event.value === 4),
      'Product host must post live drum ratchet step values into Core',
    );
    addEvidence(report, {
      id: 'sequencer-morph-ratchet-live-routing',
      summary: 'UI-style synth/drum preset-morph and ratchet overrides post live Core step-value/config events.',
      details: {
        synthStepValueEvents,
        drumStepValueEvents,
      },
    });

    const morphFeedbackHarness = loadCoreProductHostHarness();
    morphFeedbackHarness.host.runtimeReady = true;
    const morphFeedbackPadValues = [];
    const morphFeedbackLeadValues = [];
    const morphFeedbackDrumValues = [];
    morphFeedbackHarness.host.setPadMorphTriggerCallback((value) => morphFeedbackPadValues.push(value));
    morphFeedbackHarness.host.setLeadMorphCallback((value) => morphFeedbackLeadValues.push(value));
    morphFeedbackHarness.host.setDrumMorphTriggerCallback((voice, value) => morphFeedbackDrumValues.push({ voice, value }));
    morphFeedbackHarness.host.latestProductSnapshot = {
      transport: { bpm: 120 },
      synthLanes: [
        makeProductLane({ targetSourceId: morphFeedbackHarness.context.CORE_PRODUCT_SOURCE_IDS.pad1, morph: 0.11 }),
        makeProductLane({ targetSourceId: morphFeedbackHarness.context.CORE_PRODUCT_SOURCE_IDS.lead2, morph: 0.22, seed: 5678 }),
      ],
      drumLanes: [
        makeProductLane({
          targetSourceId: morphFeedbackHarness.context.CORE_PRODUCT_SOURCE_IDS.drum,
          midiNote: 37,
          morph: 0.33,
          seed: (0x80000000 | (1 << 25) | 4321) >>> 0,
        }),
      ],
    };
    setSubLaneEnabledViaEvents(morphFeedbackHarness, 'synth', [{ morph: true }, { morph: true }]);
    morphFeedbackHarness.host.setSynthStepOverrides({
      morph: [[0.2, 0.8], [0.35, 0.65]],
      morphDirection: ['forward', 'reverse'],
    });
    setSubLaneEnabledViaEvents(morphFeedbackHarness, 'drum', [{ morph: true }]);
    setDrumStepOverridesViaEvents(morphFeedbackHarness, {
      morph: [[0.1, 0.6]],
      morphDirection: ['pingpong'],
    });
    morphFeedbackPadValues.length = 0;
    morphFeedbackLeadValues.length = 0;
    morphFeedbackDrumValues.length = 0;
    const morphFeedbackTelemetryBase = {
      schemaHash: 0,
      sampleRate: 48000,
      transportRunning: true,
      activeSources: 0,
      activeVoices: 0,
      activeAssets: 0,
      sequencerEventCount: 0,
      controlQueueDepth: 0,
      assetMissingCount: 0,
      lastErrorCode: 0,
    };
    morphFeedbackHarness.runtime.telemetryCallback({
      ...morphFeedbackTelemetryBase,
      synthSequencerHitCounts: [1, 1, 0, 0],
      drumSequencerHitCounts: [1, 0, 0, 0],
      synthSequencerCurrentSteps: [0, 0, 0, 0],
      drumSequencerCurrentSteps: [0, 0, 0, 0],
    });
    morphFeedbackHarness.runtime.telemetryCallback({
      ...morphFeedbackTelemetryBase,
      synthSequencerHitCounts: [2, 2, 0, 0],
      drumSequencerHitCounts: [2, 0, 0, 0],
      synthSequencerCurrentSteps: [1, 1, 0, 0],
      drumSequencerCurrentSteps: [1, 0, 0, 0],
    });
    const activeMorphFeedbackPadValues = morphFeedbackPadValues.filter((value) => value >= 0);
    const activeMorphFeedbackDrumValues = morphFeedbackDrumValues.filter((entry) => entry.value >= 0);
    assert(
      activeMorphFeedbackPadValues[0] === 0.2 && activeMorphFeedbackPadValues[1] === 0.8,
      'Product sequencer morph hits must publish pad morph values for live slider override',
    );
    assert(
      morphFeedbackLeadValues.some((value) => value.lead1 === -1 && value.lead2 === 0.65) &&
        morphFeedbackLeadValues.some((value) => value.lead1 === -1 && value.lead2 === 0.35),
      'Product sequencer morph hits must publish lead target morph values for live slider override',
    );
    assert(
      activeMorphFeedbackDrumValues.some((entry) => entry.voice === 'kick' && entry.value === 0.1) &&
        activeMorphFeedbackDrumValues.some((entry) => entry.voice === 'kick' && entry.value === 0.6),
      'Product sequencer morph hits must publish drum voice morph values for live slider override',
    );
    morphFeedbackHarness.runtime.telemetryCallback({
      ...morphFeedbackTelemetryBase,
      transportRunning: false,
      synthSequencerHitCounts: [2, 2, 0, 0],
      drumSequencerHitCounts: [2, 0, 0, 0],
      synthSequencerCurrentSteps: [1, 1, 0, 0],
      drumSequencerCurrentSteps: [1, 0, 0, 0],
    });
    assert(
      morphFeedbackPadValues.includes(-2) &&
        morphFeedbackLeadValues.some((value) => value.lead1 === -2 && value.lead2 === -2) &&
        morphFeedbackDrumValues.some((entry) => entry.voice === 'kick' && entry.value === -2),
      'Product sequencer morph feedback must clear live slider overrides when transport is stopped',
    );
    addEvidence(report, {
      id: 'sequencer-morph-live-slider-feedback',
      summary: 'Product Core sequencer preset-morph hits publish synth/drum UI callbacks so active engine morph sliders follow the sounding value.',
      details: {
        pad: morphFeedbackPadValues,
        lead: morphFeedbackLeadValues,
        drum: morphFeedbackDrumValues,
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

    const beforeEvolveConfigEvents = harness.runtime.events.length;
    setEvolveConfigsViaEvents(harness, 'synth', [{
      enabled: true,
      evolution: 0.6,
      everyBars: 2,
      writeOffset: 'auto',
      mutationMode: 'strict',
      methods: { pitchWalk: true },
      enabledSubLanes: ['pitch'],
    }]);
    setEvolveConfigsViaEvents(harness, 'drum', [{
      enabled: true,
      evolution: 0.75,
      everyBars: 3,
      writeOffset: 2,
      methods: { ghostNotes: true },
      enabledSubLanes: ['expression', 'distance'],
    }]);
    assert(
      harness.host.adapterState.synthEuclidEvolveConfigs[0]?.enabled === true &&
        harness.host.adapterState.synthEuclidEvolveConfigs[0]?.mutationMode === 'strict' &&
        harness.host.adapterState.synthEuclidEvolveConfigs[0]?.methods?.pitchWalk === true &&
        harness.host.adapterState.synthEuclidEvolveConfigs[0]?.enabledSubLanes?.includes('pitch') &&
        harness.host.adapterState.drumEuclidEvolveConfigs[0]?.enabled === true &&
        harness.host.adapterState.drumEuclidEvolveConfigs[0]?.writeOffset === 2 &&
        harness.host.adapterState.drumEuclidEvolveConfigs[0]?.methods?.ghostNotes === true &&
        harness.host.adapterState.drumEuclidEvolveConfigs[0]?.enabledSubLanes?.includes('expression') &&
        harness.host.adapterState.drumEuclidEvolveConfigs[0]?.enabledSubLanes?.includes('distance'),
      'Product generated evolve config events must update host synth/drum evolve adapter state',
    );
    assert(
      harness.runtime.events.length === beforeEvolveConfigEvents,
      'Product evolve config events are host-only cache commits and must not post the host param marker to the runtime',
    );

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
    const eventCountBeforePitchBindingEvent = harness.runtime.events.length;
    const runtimeReadyBeforePitchBindingEvent = harness.host.runtimeReady;
    harness.host.runtimeReady = false;
    harness.host.postProductEvent({
      eventKind: 8,
      targetId: 1,
      index: 1,
      paramId: 'SequencerLanePitchBindingMode',
      value: 0,
      value2: 1,
    });
    assert(
      harness.host.adapterState.synthPitchBindingModes[1] === 'linked',
      'ProductEvent synth pitch binding mode route must preserve linked UI cache state',
    );
    assert(
      harness.runtime.events.length === eventCountBeforePitchBindingEvent,
      'pre-runtime ProductEvent synth pitch binding mode route must update host cache without bootstrapping audio',
    );
    harness.host.runtimeReady = runtimeReadyBeforePitchBindingEvent;
    harness.host.synthNoteRangeOverrides = [{ min: 40, max: 52 }, null, null, null];
    harness.host.running = true;
    harness.host.stop();
    assert(
      harness.host.synthNoteRangeOverrides.every((entry) => entry === null),
      'Product host stop must clear synth note-range evolve overrides so restart uses current slider state',
    );
    harness.host.latestProductSnapshot = { transport: { bpm: 120 }, synthLanes: [], drumLanes: [{ midiNote: 37 }] };
    setSubLaneEnabledViaEvents(harness, 'drum', [{ pitch: true }]);
    setDrumStepOverridesViaEvents(harness, {
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
    const beforeManualSynthPayloads = synthOverridePayloads.length;
    harness.host.diceSynthEuclidLane(1, 0.42);
    harness.host.diceDrumEuclidLane(3, 0.73);
    harness.host.resetDrumEuclidLaneHome(2);
    const manualSynthDiceEvent = harness.runtime.events.find((event) =>
      event.type === 'sequencer-dice' &&
        event.sequencer === 'synth' &&
        event.laneIndex === 1);
    assert(manualSynthDiceEvent, 'diceSynthEuclidLane() must route synth manual dice through native Product Core dice');
    assert(
      Math.abs((manualSynthDiceEvent.value ?? manualSynthDiceEvent.intensity) - 0.42) < 1.0e-6,
      'diceSynthEuclidLane() must preserve the requested manual dice intensity in the native event',
    );
    const manualSynthDiceFlags = (manualSynthDiceEvent.flags ?? 0) >>> 0;
    assert(
      (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_EVOLVE_FLAGS.modeParity >>> 0)) !== 0 &&
        (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_EVOLVE_FLAGS.manualCommit >>> 0)) !== 0 &&
        (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_EVOLVE_FLAGS.valueDrift >>> 0)) !== 0 &&
        (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_EVOLVE_FLAGS.valueScramble >>> 0)) !== 0 &&
        (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_DICE_FLAGS.expression >>> 0)) !== 0 &&
        (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_DICE_FLAGS.morph >>> 0)) !== 0 &&
        (manualSynthDiceFlags & (harness.context.CORE_PRODUCT_DICE_FLAGS.distance >>> 0)) !== 0,
      'diceSynthEuclidLane() must post native parity evolve flags for synth value sub-lanes',
    );
    const coldManualSynthDiceHarness = loadCoreProductHostHarness();
    coldManualSynthDiceHarness.host.runtimeReady = false;
    coldManualSynthDiceHarness.host.postProductEvent({
      eventKind: coldManualSynthDiceHarness.context.KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane,
      targetId: coldManualSynthDiceHarness.context.CORE_PRODUCT_SEQUENCER_IDS.synth,
      index: 0,
      value: 0.51,
    });
    await Promise.resolve();
    assert(coldManualSynthDiceHarness.host.runtimeReady === true, 'pre-runtime ProductEvent synth manual dice must initialize Product runtime ownership before posting');
    assert(coldManualSynthDiceHarness.runtime.snapshots.length === 1, 'pre-runtime ProductEvent synth manual dice must bootstrap Product with one compiled snapshot');
    assert(
      coldManualSynthDiceHarness.runtime.events.some((event) =>
        event.type === 'sequencer-dice' &&
          event.sequencer === 'synth' &&
          event.laneIndex === 0 &&
          Math.abs((event.value ?? event.intensity) - 0.51) < 1.0e-6),
      'pre-runtime ProductEvent synth manual dice must still post the compact native Product dice event',
    );
    harness.host.reconcileSequencerUiState(makeSequencerUiTelemetry({
      revision: 40,
      targetId: harness.context.CORE_PRODUCT_SEQUENCER_IDS.synth,
      laneIndex: 1,
      changeKind: 3,
      lane: makeLane({ swing: 0.31 }),
      sequencer: 'synth',
    }));
    assert(
      synthOverridePayloads.slice(beforeManualSynthPayloads).some((entry) =>
        entry.laneIndex === 1 &&
          entry.payload.manualDiceHome === true),
      'diceSynthEuclidLane() must tag the following synth UI-state reconciliation as manual dice home for UI/preset refs',
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
    setPitchSettingsViaEvents(harness, 'synth', [{ mode: 'noteRange', root: 60, scale: 'Major' }]);
    harness.host.setSynthStepOverrides({ expression: [[0.5, 0.6]], expressionDirection: ['forward'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
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
    setPitchSettingsViaEvents(harness, 'synth', [
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
    ]);
    harness.host.setSynthStepOverrides({ expression: [null, null, [0.25, 0.35]], expressionDirection: [null, null, 'forward'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
    harness.host.latestSliderState = { synthEuclid3NoteMin: 55, synthEuclid3NoteMax: 67 };
    setPitchSettingsViaEvents(harness, 'synth', [
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

    harness.host.captureSequencerHomeLane('drum', 2, true);
    harness.host.reconcileSequencerUiState(makeSequencerUiTelemetry({
      revision: 50,
      targetId: harness.context.CORE_PRODUCT_SEQUENCER_IDS.drum,
      laneIndex: 2,
      changeKind: 3,
      lane: makeLane({ swing: 0.33, baseMidiNote: 38 }),
      sequencer: 'drum',
    }));
    assert(harness.host.adapterState.drumEuclid3Swing === 0.33, 'Product native swing evolve UI state must update adapter state for preset/UI continuity');
    assert(
      drumOverridePayloads.some((entry) => entry.laneIndex === 2 && entry.payload.swing === 0.33),
      'Product native swing evolve UI state must notify UI/preset refs through the evolve override callback',
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
    setSubLaneEnabledViaEvents(harness, 'synth', [{ pitch: true, expression: true }]);
    setSubLaneEnabledViaEvents(harness, 'drum', [{ pitch: true, expression: true }]);
    harness.host.setSynthEuclidSwings([0.11]);
    harness.host.setSynthStepOverrides({ pitch: [[64, 67]], expression: [[0.1, 0.2]], pitchDirection: ['forward'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
    harness.host.setSynthEuclidSwings([0.22]);
    harness.host.setSynthStepOverrides({ pitch: [[72, 74]], expression: [[0.3, 0.4]], pitchDirection: ['reverse'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
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
    setPitchSettingsViaEvents(harness, 'synth', [{ mode: 'semitones', root: 48, scale: 'Major' }]);
    harness.host.setSynthStepOverrides({ pitch: [[60, 64]], expression: [[0.5, 0.6]], pitchDirection: ['forward'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
    harness.host.setSynthStepOverrides({ pitch: [[55, 56]], expression: [[0.8, 0.9]], pitchDirection: ['reverse'] });
    harness.host.resetSynthEuclidLaneHome(0);
    const synthRootResetPayload = synthOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Array.isArray(synthRootResetPayload.pitch) &&
        synthRootResetPayload.pitch[0] === 12 &&
        synthRootResetPayload.pitch[1] === 16,
      'Product synth reset-home must convert Core MIDI back through the current synth pitch root',
    );
    setPitchSettingsViaEvents(harness, 'synth', [{ mode: 'notes', root: 60, scale: 'Major' }]);
    harness.host.setSynthStepOverrides({ pitch: [[60, 62, 67]], expression: [[0.2, 0.3, 0.4]], pitchDirection: ['forward'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
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
    setSubLaneEnabledViaEvents(harness, 'synth', [{ expression: true, morph: true, distance: true }]);
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
    setSequencerPresetHomeSnapshotsViaEvents(harness);
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
    setDrumStepOverridesViaEvents(harness, { pitch: [[1, 2]], expression: [[0.2, 0.3]], pitchDirection: ['forward'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
    harness.host.setDrumEuclidSwings([0.35]);
    setDrumStepOverridesViaEvents(harness, { pitch: [[5, 6]], expression: [[0.4, 0.5]], pitchDirection: ['reverse'] });
    setSequencerPresetHomeSnapshotsViaEvents(harness);
    setDrumStepOverridesViaEvents(harness, { pitch: [[9, 10]], expression: [[0.8, 0.9]], pitchDirection: ['forward'] });
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
    setSubLaneEnabledViaEvents(harness, 'synth', [{ pitch: true, expression: true }]);
    setPitchSettingsViaEvents(harness, 'synth', [{ mode: 'semitones', root: 60, scale: 'Major' }]);
    harness.host.setSynthEuclidSwings([0.18]);
    harness.host.setSynthStepOverrides({ pitch: [[61]], expression: [[0.1]], pitchDirection: ['forward'] });
    captureSequencerLaneHomeViaEvents(harness, 'synth', 0, { steps: 1, direction: 'forward', scaleQuantize: false });
    harness.host.setSynthEuclidSwings([0.28]);
    harness.host.setSynthStepOverrides({ pitch: [[72, 74]], expression: [[0.6, 0.7]], pitchDirection: ['reverse'] });
    captureSequencerLaneHomeViaEvents(harness, 'synth', 0, { steps: 8, direction: 'pingpong', scaleQuantize: true });
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
    setSubLaneEnabledViaEvents(harness, 'drum', [{ pitch: true, expression: true }]);
    harness.host.setDrumEuclidSwings([0.19]);
    setDrumStepOverridesViaEvents(harness, { pitch: [[1]], expression: [[0.1]], pitchDirection: ['forward'] });
    captureDrumLaneHomeViaEvents(harness, 0, { mode: 'semitones', root: 60, scale: 'Major' }, { steps: 1, direction: 'forward', scaleQuantize: false });
    harness.host.setDrumEuclidSwings([0.39]);
    setDrumStepOverridesViaEvents(harness, { pitch: [[5, 6]], expression: [[0.45, 0.55]], pitchDirection: ['reverse'] });
    captureDrumLaneHomeViaEvents(harness, 0, { mode: 'notes', root: 60, scale: 'Minor' }, { steps: 8, direction: 'pingpong', scaleQuantize: true });
    setDrumStepOverridesViaEvents(harness, { pitch: [[9]], expression: [[0.95]], pitchDirection: ['forward'] });
    harness.host.resetDrumEuclidLaneHome(0);
    const drumSequencePresetResetPayload = drumOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Math.abs((drumSequencePresetResetPayload.swing ?? 0) - 0.39) < 1.0e-6 &&
        Array.isArray(drumSequencePresetResetPayload.pitch?.[0]) &&
        drumSequencePresetResetPayload.pitch[0][0] === 5 &&
        drumSequencePresetResetPayload.pitch[0][1] === 6 &&
        drumSequencePresetResetPayload.pitchSettings?.[0]?.mode === 'notes' &&
        drumSequencePresetResetPayload.pitchSettings[0].scale === 'Minor' &&
        drumSequencePresetResetPayload.subLaneStates?.pitch?.steps === 8 &&
        drumSequencePresetResetPayload.subLaneStates.pitch.direction === 'pingpong' &&
        drumSequencePresetResetPayload.subLaneStates?.pitch?.scaleQuantize === true &&
        Array.isArray(drumSequencePresetResetPayload.expression?.[0]) &&
        drumSequencePresetResetPayload.expression[0][0] === 0.45,
      'Product drum sequence preset lane-home capture must make reset restore the loaded sequence preset home',
    );
    setSubLaneEnabledViaEvents(harness, 'drum', [{ expression: true, morph: true, distance: true }]);
    setDrumStepOverridesViaEvents(harness, {
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
    setSequencerPresetHomeSnapshotsViaEvents(harness);
    setDrumStepOverridesViaEvents(harness, { expression: [[0.95]], expressionDirection: ['forward'] });
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
      JSON.stringify(harness.host.sequencerCache.synth.toggles[1]) === JSON.stringify([
        { step: 0, value: true },
        { step: 3, value: false },
      ]),
      'synth reconciliation must copy trigger toggle overrides into host cache',
    );
    assert(
      harness.host.sequencerCache.synth.values[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote && entry.value === 60),
      'synth reconciliation must copy Product Core step values into host cache',
    );
    assert(
      harness.host.sequencerCache.synth.values[1].some((entry) =>
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
      harness.host.sequencerCache.synth.configs[1].some((entry) =>
        entry.field === harness.context.CORE_PRODUCT_STEP_VALUE_FIELDS.expression &&
          entry.steps === 7 &&
          entry.direction === harness.context.CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse),
      'synth reconciliation must copy Product Core sub-lane step config into host cache',
    );
    assert(
      Math.abs(harness.host.adapterState.synthEuclid2Swing - 0.27) < 1.0e-6,
      'synth reconciliation must copy Product Core lane swing into host adapter state',
    );
    assert(
      synthOverridePayloads.some((entry) =>
        entry.laneIndex === 1 &&
          entry.payload.swing === 0.27 &&
          entry.payload.subLaneStates?.expression?.steps === 7 &&
          entry.payload.subLaneStates.expression.direction === 'reverse'),
      'synth reconciliation must notify UI with Product Core swing and sub-lane length/direction metadata',
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
    assert(harness.host.sequencerCache.drum.toggles[2].length === 0, 'reset-home reconciliation must clear drum trigger overrides');
    assert(
      Math.abs(harness.host.adapterState.drumEuclid3Swing - 0.27) < 1.0e-6,
      'drum reset-home reconciliation must copy Product Core lane swing into host adapter state',
    );
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

    const drumDicedExpression = [0.12, 0.24, 0.36, 0.46, 0.58, 0.66, 0.72, 0.84];
    setSubLaneEnabledViaEvents(harness, 'drum', [{}, {}, { expression: true }]);
    harness.host.runtimeReady = true;
    harness.host.postProductEvent({
      eventKind: harness.context.KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane,
      targetId: harness.context.CORE_PRODUCT_SEQUENCER_IDS.drum,
      index: 2,
      value: 1,
    });
    setDrumStepOverridesViaEvents(harness, {
      expression: [null, null, [0, 0, 0, 0, 0, 0, 0, 0]],
      expressionDirection: [null, null, 'forward'],
    });
    harness.host.reconcileSequencerUiState(makeSequencerUiTelemetry({
      revision: 3,
      targetId: harness.context.CORE_PRODUCT_SEQUENCER_IDS.drum,
      laneIndex: 2,
      changeKind: 3,
      lane: makeLane({
        expression: drumDicedExpression,
        expressionRangeSetLow: undefined,
        expressionRangeSetHigh: undefined,
        expressionRangeMaxes: undefined,
        stepValueConfigEnabledMask: undefined,
        stepValueConfigSteps: undefined,
        stepValueConfigDirections: undefined,
      }),
      sequencer: 'drum',
    }));
    setDrumStepOverridesViaEvents(harness, {
      expression: [null, null, [0, 0, 0, 0, 0, 0, 0, 0]],
      expressionDirection: [null, null, 'forward'],
    });
    harness.host.resetDrumEuclidLaneHome(2);
    const drumDiceResetPayload = drumOverridePayloads.at(-1)?.payload ?? {};
    assert(
      Array.isArray(drumDiceResetPayload.expression?.[2]) &&
        drumDiceResetPayload.expression[2][3] === 0.46 &&
        drumDiceResetPayload.subLaneStates?.expression?.steps === 8,
      'drum dice reconciliation must capture Product Core diced sub-lane state as the next reset home',
    );

    const eventCountBeforeReload = harness.runtime.events.length;
    harness.host.runtimeReady = true;
    harness.host.loadLatestSnapshot('adapter-update');
    const replayedEvents = harness.runtime.events.slice(eventCountBeforeReload);
    assert(harness.runtime.snapshots.length === 1, 'full snapshot reload must call runtime.loadSnapshot');
    assert(
      replayedEvents.some((event) => event.type === 'sequencer-clear-steps' && event.sequencer === 'synth' && event.laneIndex === 1) &&
        replayedEvents.some((event) => event.type === 'sequencer-step' && event.sequencer === 'synth' && event.laneIndex === 1) &&
        replayedEvents.some((event) => event.type === 'sequencer-lane-param' && event.paramId === 'SequencerLanePitchBindingMode'),
      'full snapshot reload must replay reconciled synth dice step state and pitch binding from host cache',
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
