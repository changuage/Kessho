import {
  addEvidence,
  assert,
  loadCoreProductHostHarness,
  loadRuntimeAdapterHarness,
  methodBody,
  readProjectFile,
  runCheckWithReport,
} from './lib/kesshoProductBehaviorHarness.mjs';

const host = readProjectFile('src/audio/coreProductEngineHost.ts');
const runtimeAdapter = readProjectFile('src/audio/CoreProductRuntimeAdapter.ts');
const telemetry = readProjectFile('src/audio/coreProductTelemetry.ts');
const doc = readProjectFile('docs/kessho-product-control-classification.md');
const worklet = readProjectFile('public/worklets/kessho-core-product.worklet.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSource(sourceId = 1) {
  return {
    enabled: true,
    sourceId,
    presetId: 1,
    assetId: 0,
    level: 0.4,
    morph: 0.1,
    distance: 0.2,
    expression: 0.3,
    dryGain: 1,
    reverbSend: 0.1,
    delayASend: 0.1,
    delayBSend: 0.1,
    granularSend: 0.1,
    diffuseSend: 0.1,
    postLpfHz: 18000,
    stereoWidth: 1,
    postLpfKeyTracking: 0,
    attackSeconds: 0.005,
    decaySeconds: 0.65,
    sustain: 0.72,
    holdSeconds: 0.5,
    releaseSeconds: 1.4,
    exactPadParamCount: 2,
    exactPadParams: [0.1, 0.2],
    exactLeadParamCount: 2,
    exactLeadParams: [0.3, 0.4],
    exactDrumParamCount: 2,
    exactDrumParams: [0.5, 0.6],
  };
}

function makeLane(index = 0) {
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
    trigCondition: 1,
    midiNote: 60 + index,
    velocity: 0.8,
    holdSeconds: 0.25,
    morph: 0,
    distance: 0,
    expression: 0,
    seed: 100 + index,
    barReset: false,
    phraseReset: false,
    manualStepMaskLow: 0,
    manualStepMaskHigh: 0,
  };
}

function makeSnapshot({ laneCount = 4 } = {}) {
  const lanes = Array.from({ length: laneCount }, (_, index) => makeLane(index));
  return {
    assetRefs: [11, 12],
    assetRefLevels: [0.75, 0.5],
    transport: {
      running: false,
      bpm: 120,
      beatsPerBar: 4,
      barsPerPhrase: 4,
      swing: 0,
    },
    harmony: {
      rootMidi: 60,
      scaleId: 0,
      tension: 0,
      chordMode: 0,
      voicingMode: 0,
    },
    sources: [makeSource(1), makeSource(2)],
    synthLanes: clone(lanes),
    drumLanes: clone(lanes),
    journey: {
      enabled: false,
      morphPhase: 0,
      morphRateBars: 4,
    },
    fx: {
      granularVoices: Array.from({ length: 4 }, () => ({})),
    },
    routing: {},
    master: {},
    evolution: {
      amount: 0,
      state: 1,
    },
    rng: {
      seed: 1,
      state: 2,
    },
  };
}

function mutateBudgetLane(lane, index) {
  lane.enabled = false;
  lane.targetSourceId = 2;
  lane.stepCount = 32;
  lane.fillCount = 9;
  lane.rotation = 3;
  lane.clockDivision = 8;
  lane.swing = 0.25;
  lane.probability = 0.5;
  lane.ratchet = 2;
  lane.trigCondition = 2;
  lane.midiNote = 72 + index;
  lane.velocity = 0.55;
  lane.holdSeconds = 0.5;
  lane.seed = 2000 + index;
}

await runCheckWithReport({
  scriptUrl: import.meta.url,
  reportName: 'kessho-product-dirty-diff-classification-latest.json',
  run: async (report) => {
    for (const token of [
      'dirtyDiffCount = 0',
      'fullSnapshotReloadCount = 0',
      'unsupportedControlCount = 0',
      'snapshotReloadCpuMs = 0',
      "lastSnapshotReloadReason: SnapshotReloadReason = 'none'",
      'pendingSnapshotReloadReason',
      'type SnapshotReloadReason',
    ]) {
      assert(host.includes(token), `core-product host is missing dirty-diff diagnostic token: ${token}`);
    }

    for (const reason of [
      "'initial-snapshot'",
      "'runtime-start'",
      "'runtime-bootstrap'",
      "'manual-piano-asset'",
      "'explicit-reset-request'",
      "'asset-reference-change'",
      "'asset-reference-level-change'",
      "'harmony-mode-change'",
      "'source-structure-change'",
      "'exact-patch-change'",
      "'sequencer-structure-change'",
      "'dirty-diff-event-budget'",
      "'adapter-update'",
    ]) {
      assert(`${host}\n${runtimeAdapter}`.includes(reason), `SnapshotReloadReason is missing ${reason}`);
    }

    const updateBody = methodBody(host, 'applyLatestSnapshotUpdate');
    assert(updateBody.includes('this.dirtyDiffCount += 1'), 'dirty diff applications must increment dirtyDiffCount');
    assert(updateBody.includes('this.pendingSnapshotReloadReason ?? reason'), 'full reloads must preserve classified fallback reason');
    assert(updateBody.includes("previousSnapshot ? (this.pendingSnapshotReloadReason ?? reason) : 'initial-snapshot'"), 'initial snapshots must be classified separately');

    const loadBody = methodBody(host, 'loadProductSnapshot');
    for (const token of [
      'const startMs = this.nowMs()',
      'this.runtime.loadSnapshot(encodeCoreProductSnapshot(snapshot));',
      'this.fullSnapshotReloadCount += 1',
      'this.snapshotReloadCpuMs +=',
      'this.lastSnapshotReloadReason = reason',
    ]) {
      assert(loadBody.includes(token), `full snapshot reload telemetry is missing ${token}`);
    }

    const diffBody = methodBody(host, 'applySnapshotDiff');
    assert(diffBody.includes('buildCoreProductSnapshotDiff(previous, next'), 'host dirty diff must delegate to the focused runtime adapter');
    assert(diffBody.includes('this.pendingSnapshotReloadReason = diff.reason'), 'dirty diff fallback reason must be preserved from the runtime adapter');
    assert(runtimeAdapter.includes("reason: 'dirty-diff-event-budget'"), 'dirty diff event budget fallback must be classified');
    assert(runtimeAdapter.includes('events.length > MAX_SNAPSHOT_DIFF_EVENTS'), 'dirty diff must remain bounded by MAX_SNAPSHOT_DIFF_EVENTS');

    const classifyBody = methodBody(runtimeAdapter, 'classifySnapshotReloadReason');
    for (const token of [
      "assetRefsChanged(previous.assetRefs, next.assetRefs)) return 'asset-reference-change'",
      "previous.harmony.chordMode !== next.harmony.chordMode) return 'harmony-mode-change'",
      "previousSource.sourceId !== nextSource.sourceId) return 'source-structure-change'",
      "previousSource.assetId !== nextSource.assetId) return 'source-structure-change'",
      'this.padPatchChanged(previousSource, nextSource)',
      "return 'exact-patch-change'",
      'this.leadPatchChanged(previousSource, nextSource)',
      "canApplyLaneDiffs(previous.synthLanes, next.synthLanes)) return 'sequencer-structure-change'",
    ]) {
      assert(classifyBody.includes(token), `snapshot reload reason classifier is missing ${token}`);
    }

    const canDiffBody = methodBody(runtimeAdapter, 'canApplySnapshotDiff');
    for (const field of [
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
      assert(!canDiffBody.includes(`previousSource.${field}`), `high-frequency source ${field} must not be structural`);
      assert(!canDiffBody.includes(`nextSource.${field}`), `high-frequency source ${field} must not be structural`);
    }

    const sourceDiffBody = methodBody(runtimeAdapter, 'appendSourceParamDiffs');
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
      'KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz',
      'KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth',
      'KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking',
      'KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds',
      'KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds',
      'KESSHO_PRODUCT_PARAM_IDS.SourceSustain',
      'KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds',
      'KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds',
    ]) {
      assert(sourceDiffBody.includes(token), `high-frequency source control must be dirty diff event: ${token}`);
    }

    const hostTelemetryBody = methodBody(host, 'withHostDiagnostics');
    const perfBody = methodBody(host, 'createPerfSnapshot');
    for (const token of [
      'dirtyDiffCount',
      'fullSnapshotReloadCount',
      'unsupportedControlCount',
      'snapshotReloadCpuMs',
      'lastSnapshotReloadReason',
    ]) {
      assert(telemetry.includes(`${token}?:`), `telemetry type is missing ${token}`);
      assert(hostTelemetryBody.includes(token), `host telemetry enrichment is missing ${token}`);
      assert(perfBody.includes(token), `perf snapshot is missing ${token}`);
      assert(doc.includes(`\`${token}\``), `control classification doc is missing ${token}`);
    }

    for (const token of [
      '## Live Product Core Events',
      '## Bounded Dirty Diffs',
      '## Structural Full Snapshot Reloads',
      '## Unsupported',
      'Full snapshot reloads are structural fallbacks only',
    ]) {
      assert(doc.includes(token), `control classification doc is missing ${token}`);
    }

    for (const method of [
      'setSynthEuclidClockDivs',
      'setDrumEuclidClockDivs',
      'setSynthEuclidSwings',
      'setDrumEuclidSwings',
      'diceSynthEuclidLane',
      'resetSynthEuclidLaneHome',
      'diceDrumEuclidLane',
      'resetDrumEuclidLaneHome',
    ]) {
      const body = methodBody(host, method);
      assert(!body.includes('loadProductSnapshot('), `${method}() must not full-reload for high-frequency sequencer controls`);
    }

    const unsupportedControlBody = methodBody(host, 'reportRuntimeFallback');
    assert(unsupportedControlBody.includes('this.unsupportedControlCount += 1'), 'missing method fallback must increment unsupportedControlCount');
    const unsupportedRangeBody = methodBody(host, 'reportUnsupportedRangeKey');
    assert(unsupportedRangeBody.includes('this.unsupportedControlCount += 1'), 'unsupported range fallback must increment unsupportedControlCount');

    const processBody = methodBody(worklet, 'process');
    assert(!processBody.includes("type: 'snapshot'"), 'audio render callback must not request full snapshots');
    assert(!processBody.includes('loadSnapshot'), 'audio render callback must not load full snapshots');
    addEvidence(report, {
      id: 'static-dirty-diff-contract',
      summary: 'Static dirty-diff classification, telemetry, and render-path guards passed.',
      details: {
        reloadReasonsAudited: 13,
        diffableSourceControlsAudited: 18,
      },
    });

    const adapterHarness = loadRuntimeAdapterHarness();
    const base = makeSnapshot();
    const sourceNext = clone(base);
    sourceNext.sources[0].level = 0.77;
    const sourceDiff = adapterHarness.buildCoreProductSnapshotDiff(base, sourceNext);
    assert(sourceDiff.applied === true, 'source level updates must be dirty-diffable');
    assert(
      sourceDiff.events.some((event) =>
        event.type === 'param' &&
          event.paramId === 'SourceLevel' &&
          event.targetId === base.sources[0].sourceId &&
          Math.abs(event.value - 0.77) < 1.0e-6),
      'source level dirty diff did not emit SourceLevel event',
    );

    const evolutionNext = clone(base);
    evolutionNext.evolution.amount = 0.64;
    evolutionNext.evolution.state = 99;
    const evolutionDiff = adapterHarness.buildCoreProductSnapshotDiff(base, evolutionNext);
    assert(evolutionDiff.applied === true, 'evolution state must be dirty-diffable');
    assert(
      evolutionDiff.events.some((event) => event.paramId === 'EvolutionAmount' && Math.abs(event.value - 0.64) < 1.0e-6) &&
        evolutionDiff.events.some((event) => event.paramId === 'EvolutionState' && event.value === 99),
      'evolution dirty diff did not emit amount/state events',
    );

    const assetNext = clone(base);
    assetNext.assetRefs = [11, 99];
    const assetDiff = adapterHarness.buildCoreProductSnapshotDiff(base, assetNext);
    assert(assetDiff.applied === false && assetDiff.reason === 'asset-reference-change', 'asset reference changes must full-reload with classified reason');

    const assetLevelNext = clone(base);
    assetLevelNext.assetRefLevels = [0.75, 0.9];
    const assetLevelDiff = adapterHarness.buildCoreProductSnapshotDiff(base, assetLevelNext);
    assert(assetLevelDiff.applied === false && assetLevelDiff.reason === 'asset-reference-level-change', 'asset reference level changes must full-reload with classified reason');

    const soundscapeOffBase = clone(base);
    soundscapeOffBase.sources[1] = makeSource(7);
    soundscapeOffBase.sources[1].assetId = 7001;
    const soundscapeOffNext = clone(soundscapeOffBase);
    soundscapeOffNext.sources[1].enabled = false;
    soundscapeOffNext.sources[1].exactPadParams[0] = 0;
    soundscapeOffNext.sources[1].exactDrumParams[0] = 0;
    soundscapeOffNext.assetRefs = [];
    soundscapeOffNext.assetRefLevels = [];
    const soundscapeOffDiff = adapterHarness.buildCoreProductSnapshotDiff(soundscapeOffBase, soundscapeOffNext);
    assert(
      soundscapeOffDiff.applied === true &&
        soundscapeOffDiff.events.some((event) =>
          event.type === 'param' &&
            event.paramId === 'SourceEnabled' &&
            event.targetId === 7 &&
            event.value === 0),
      'soundscape source-off asset removal must dirty-diff so Product Core can fade it out',
    );

    const patchNext = clone(base);
    patchNext.sources[0].exactPadParams[0] = 0.9;
    const patchDiff = adapterHarness.buildCoreProductSnapshotDiff(base, patchNext);
    assert(patchDiff.applied === false && patchDiff.reason === 'exact-patch-change', 'exact patch changes must full-reload with classified reason');

    const holdNext = clone(base);
    holdNext.sources[0].holdSeconds = 0.95;
    const holdDiff = adapterHarness.buildCoreProductSnapshotDiff(base, holdNext);
    assert(
      holdDiff.applied === true &&
        holdDiff.events.some((event) =>
          event.paramId === 'SourceHoldSeconds' &&
          event.targetId === 1 &&
          event.value === 0.95),
      'source hold changes must dirty-diff through generated Product source-hold events',
    );

    const drumPatchNext = clone(base);
    drumPatchNext.sources[0].exactDrumParams[0] = 0.95;
    const drumPatchDiff = adapterHarness.buildCoreProductSnapshotDiff(base, drumPatchNext);
    assert(drumPatchDiff.applied === false && drumPatchDiff.reason === 'exact-patch-change', 'exact drum patch changes must full-reload with classified reason');

    const budgetBase = makeSnapshot({ laneCount: 24 });
    const budgetNext = clone(budgetBase);
    budgetNext.synthLanes.forEach(mutateBudgetLane);
    budgetNext.drumLanes.forEach(mutateBudgetLane);
    const budgetDiff = adapterHarness.buildCoreProductSnapshotDiff(budgetBase, budgetNext);
    assert(
      budgetDiff.applied === false && budgetDiff.reason === 'dirty-diff-event-budget',
      'oversized dirty diff must fall back to dirty-diff-event-budget',
    );
    addEvidence(report, {
      id: 'runtime-adapter-diff-behavior',
      summary: 'Runtime adapter behaviorally distinguishes dirty diffs from structural full snapshot fallbacks.',
      details: {
        sourceDiffEvents: sourceDiff.events.length,
        evolutionDiffEvents: evolutionDiff.events.length,
        assetReloadReason: assetDiff.reason,
        exactPatchReloadReason: patchDiff.reason,
        budgetReloadReason: budgetDiff.reason,
        maxSnapshotDiffEvents: adapterHarness.MAX_SNAPSHOT_DIFF_EVENTS,
      },
    });

    const hostSnapshots = [
      { id: 'initial', transport: { running: false, bpm: 120, beatsPerBar: 4, barsPerPhrase: 4, swing: 0 } },
      { id: 'dirty', transport: { running: false, bpm: 120, beatsPerBar: 4, barsPerPhrase: 4, swing: 0 } },
      { id: 'structural', transport: { running: false, bpm: 120, beatsPerBar: 4, barsPerPhrase: 4, swing: 0 } },
    ];
    let nextSnapshotIndex = 0;
    const hostHarness = loadCoreProductHostHarness({
      globals: {
        createCoreProductSnapshot: () => hostSnapshots[nextSnapshotIndex++],
        encodeCoreProductSnapshot: (snapshot) => ({ encodedSnapshotId: snapshot.id }),
        buildCoreProductSnapshotDiff: (_previous, next) => {
          if (next.id === 'dirty') {
            return { applied: true, events: [eventForHost('dirty-param')] };
          }
          return { applied: false, reason: 'asset-reference-change' };
        },
      },
    });
    hostHarness.host.runtimeReady = true;
    hostHarness.host.applyLatestSnapshotUpdate();
    assert(hostHarness.host.fullSnapshotReloadCount === 1, 'initial update must load a full snapshot');
    assert(hostHarness.host.lastSnapshotReloadReason === 'initial-snapshot', 'initial update must classify as initial-snapshot');
    assert(hostHarness.runtime.snapshots.length === 1, 'initial update must call runtime.loadSnapshot');

    hostHarness.host.applyLatestSnapshotUpdate();
    assert(hostHarness.host.dirtyDiffCount === 1, 'applied dirty diff must increment dirtyDiffCount');
    assert(hostHarness.host.fullSnapshotReloadCount === 1, 'applied dirty diff must not load a full snapshot');
    assert(hostHarness.runtime.events.some((event) => event.type === 'dirty-param'), 'applied dirty diff must post runtime events');

    hostHarness.host.applyLatestSnapshotUpdate();
    assert(hostHarness.host.fullSnapshotReloadCount === 2, 'rejected dirty diff must load a full snapshot');
    assert(hostHarness.host.lastSnapshotReloadReason === 'asset-reference-change', 'rejected dirty diff must preserve adapter reload reason');
    assert(hostHarness.host.pendingSnapshotReloadReason === null, 'pending reload reason must clear after full snapshot reload');
    addEvidence(report, {
      id: 'host-dirty-diff-vs-full-snapshot-behavior',
      summary: 'Host snapshot updates use initial full load, then dirty diff, then classified structural reload.',
      details: {
        dirtyDiffCount: hostHarness.host.dirtyDiffCount,
        fullSnapshotReloadCount: hostHarness.host.fullSnapshotReloadCount,
        lastSnapshotReloadReason: hostHarness.host.lastSnapshotReloadReason,
        postedEvents: hostHarness.runtime.events,
        loadedSnapshots: hostHarness.runtime.snapshots,
      },
    });

    let liveSnapshotIndex = 0;
    const liveReloadHarness = loadCoreProductHostHarness({
      globals: {
        createCoreProductSnapshot: () => clone({
          id: `live-${liveSnapshotIndex++}`,
          transport: { running: false, bpm: 120, beatsPerBar: 4, barsPerPhrase: 4, swing: 0 },
        }),
        encodeCoreProductSnapshot: (snapshot) => clone(snapshot),
        buildCoreProductSnapshotDiff: () => ({ applied: false, reason: 'sequencer-structure-change' }),
      },
    });
    await liveReloadHarness.host.start({ sequencerMasterBPM: 120 });
    liveReloadHarness.host.updateParams({ sequencerMasterBPM: 121 });
    const reloadedSnapshot = liveReloadHarness.runtime.snapshots[liveReloadHarness.runtime.snapshots.length - 1];
    assert(
      reloadedSnapshot.transport.running === true &&
        liveReloadHarness.host.latestProductSnapshot.transport.running === true,
      'running Product full snapshot reloads must preserve transport running',
    );
    addEvidence(report, {
      id: 'host-live-full-reload-transport-preservation',
      summary: 'A structural full snapshot reload while Product Core is playing keeps C++ transport running.',
      details: {
        snapshotCount: liveReloadHarness.runtime.snapshots.length,
        reloadedTransport: reloadedSnapshot.transport,
        postedEvents: liveReloadHarness.runtime.events,
      },
    });

    console.log('Kessho Product dirty-diff classification checks passed');
  },
});

function eventForHost(type) {
  return { type };
}
