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
const hostDiagnostics = readProjectFile('src/audio/product/host/CoreProductHostDiagnostics.ts');
const snapshotCoordinator = readProjectFile('src/audio/product/host/CoreProductSnapshotCoordinator.ts');
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
    sourcePresetAId: 0,
    sourcePresetBId: 0,
    leadEnvelopeOverrideEnabled: false,
    leadAlgorithmPresetAEnabled: false,
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
    padOverrideCount: 0,
    padOverrideIndices: [],
    padOverrideValues: [],
    leadOverrideCount: 0,
    leadOverrideIndices: [],
    leadOverrideValues: [],
    drumOverrideCount: 0,
    drumOverrideIndices: [],
    drumOverrideValues: [],
    drumVoicePresetAIds: [],
    drumVoicePresetBIds: [],
    drumVoiceMorphs: [],
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
    tempoMultiplier: 1,
  };
}

function makeSnapshot({ laneCount = 4 } = {}) {
  const lanes = Array.from({ length: laneCount }, (_, index) => makeLane(index));
  return {
    assetRefs: [11, 12],
    assetRefLevels: [0.75, 0.5],
    soundscape: {
      textureParamCount: 2,
      textureParams: [0.1, 0.2],
      moduleParamCount: 2,
      moduleParams: [0.3, 0.4],
    },
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
      delayBTapeHeadLevels: [1, 1, 1, 1],
      delayBTapeHeadPans: [0.5, 0.5, 0.5, 0.5],
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

function capitalized(value) {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function flattenRuntimePath(path) {
  return path.split('.').map((part, index) => index === 0 ? part : capitalized(part)).join('');
}

function hydrateGeneratedSnapshotScalars(snapshot, params) {
  const defaultValue = (param) => param.type === 'bool' ? false : 0;
  for (const param of params) {
    if (typeof param?.path !== 'string') continue;
    if (param.path.startsWith('fx.granular.voices.')) {
      const match = /^fx\.granular\.voices\.(\d+)\.(.+)$/.exec(param.path);
      if (!match) continue;
      const voice = snapshot.fx.granularVoices[Number(match[1])];
      if (voice && !Object.prototype.hasOwnProperty.call(voice, match[2])) {
        voice[match[2]] = defaultValue(param);
      }
      continue;
    }
    if (/^fx\.delayB\.tapeHead[1-4](Level|Pan)$/.test(param.path)) continue;
    if (param.path.startsWith('fx.sidechain.targets.')) {
      const target = param.path.slice('fx.sidechain.targets.'.length);
      const key = `sidechain${capitalized(target)}Target`;
      if (!Object.prototype.hasOwnProperty.call(snapshot.fx, key)) snapshot.fx[key] = defaultValue(param);
      continue;
    }
    if (param.path.startsWith('fx.')) {
      const key = flattenRuntimePath(param.path.slice(3));
      if (!Object.prototype.hasOwnProperty.call(snapshot.fx, key)) snapshot.fx[key] = defaultValue(param);
      continue;
    }
    if (param.path.startsWith('routing.')) {
      const key = param.path.slice(8);
      if (!Object.prototype.hasOwnProperty.call(snapshot.routing, key)) snapshot.routing[key] = defaultValue(param);
      continue;
    }
    if (param.path.startsWith('master.')) {
      const key = param.path.slice(7);
      if (!Object.prototype.hasOwnProperty.call(snapshot.master, key)) snapshot.master[key] = defaultValue(param);
    }
  }
  return snapshot;
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
      "lastSnapshotReloadReason: string | null = 'none'",
      'type SnapshotReloadReason',
    ]) {
      assert(`${hostDiagnostics}\n${runtimeAdapter}`.includes(token), `core-product diagnostics are missing dirty-diff diagnostic token: ${token}`);
    }

    for (const token of [
      'pendingSnapshotReloadReason',
      'this.diagnostics.recordDirtyDiff()',
      'this.diagnostics.recordFullSnapshotReload(result.reason, result.cpuMs)',
      'loadCoreProductSnapshot({',
      'applyCoreProductSnapshotUpdate({',
    ]) {
      assert(host.includes(token), `core-product host is missing snapshot coordinator token: ${token}`);
    }

    for (const reason of [
      "'initial-snapshot'",
      "'runtime-start'",
      "'runtime-bootstrap'",
      "'manual-piano-asset'",
      "'explicit-reset-request'",
      "'asset-reference-change'",
      "'asset-reference-level-change'",
      "'soundscape-param-change'",
      "'harmony-mode-change'",
      "'source-structure-change'",
      "'pad-override-change'",
      "'lead-override-change'",
      "'drum-override-change'",
      "'sequencer-structure-change'",
      "'dirty-diff-event-budget'",
      "'adapter-update'",
    ]) {
      assert(`${host}\n${runtimeAdapter}`.includes(reason), `SnapshotReloadReason is missing ${reason}`);
    }

    const updateBody = methodBody(host, 'applyLatestSnapshotUpdate');
    assert(updateBody.includes('this.diagnostics.recordDirtyDiff()'), 'dirty diff applications must increment diagnostics dirtyDiffCount');
    assert(updateBody.includes('pendingReloadReason: this.pendingSnapshotReloadReason'), 'full reloads must preserve classified fallback reason');
    assert(updateBody.includes('this.pendingSnapshotReloadReason = null'), 'pending reload reason must clear after snapshot update');

    const loadBody = methodBody(snapshotCoordinator, 'loadCoreProductSnapshot');
    for (const token of [
      'const startMs = options.nowMs()',
      'options.runtime.loadSnapshot(encodeCoreProductSnapshot(options.snapshot));',
      'cpuMs: Math.max(0, options.nowMs() - startMs)',
    ]) {
      assert(loadBody.includes(token), `full snapshot reload telemetry is missing ${token}`);
    }

    const diffBody = methodBody(snapshotCoordinator, 'applyCoreProductSnapshotUpdate');
    assert(diffBody.includes('buildCoreProductSnapshotDiff(options.previousSnapshot, options.nextSnapshot'), 'host dirty diff must delegate to the focused runtime adapter');
    assert(diffBody.includes('options.pendingReloadReason ?? diff.reason ?? options.fallbackReloadReason'), 'dirty diff fallback reason must be preserved from the runtime adapter');
    assert(diffBody.includes("reason: 'initial-snapshot'"), 'initial snapshots must be classified separately');
    assert(runtimeAdapter.includes("reason: 'dirty-diff-event-budget'"), 'dirty diff event budget fallback must be classified');
    assert(runtimeAdapter.includes('events.length > MAX_SNAPSHOT_DIFF_EVENTS'), 'dirty diff must remain bounded by MAX_SNAPSHOT_DIFF_EVENTS');

    const classifyBody = methodBody(runtimeAdapter, 'classifySnapshotReloadReason');
    for (const token of [
      "assetRefsChanged(previous.assetRefs, next.assetRefs)) return 'asset-reference-change'",
      "soundscapeSnapshotChanged(previous, next)) return 'soundscape-param-change'",
      "previous.harmony.chordMode !== next.harmony.chordMode) return 'harmony-mode-change'",
      "previousSource.sourceId !== nextSource.sourceId) return 'source-structure-change'",
      "previousSource.assetId !== nextSource.assetId) return 'source-structure-change'",
      "this.legacyExactBridgeFieldsPresent(previousSource) || this.legacyExactBridgeFieldsPresent(nextSource)) return 'source-structure-change'",
      "this.padOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'pad-override-change'",
      "this.leadOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'lead-override-change'",
      "this.drumOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'drum-override-change'",
      'coreProductSourcePresetEndpointIdsChanged(previousSource, nextSource) && !canApplyCoreProductSourcePresetEndpointIdDiff(previousSource, nextSource)',
      "canApplyLaneDiffs(previous.synthLanes, next.synthLanes)) return 'sequencer-structure-change'",
    ]) {
      assert(classifyBody.includes(token), `snapshot reload reason classifier is missing ${token}`);
    }
    for (const forbidden of [
      'exact-patch-change',
      'padPatchChanged',
      'leadPatchChanged',
      'drumPatchChanged',
      'canApplyPadExactPatchDiff',
      'canApplyLeadExactPatchDiff',
      'canApplyDrumExactPatchDiff',
      'appendPadExactPatchDiffs',
      'appendLeadExactPatchDiffs',
      'appendDrumExactPatchDiffs',
    ]) {
      assert(!runtimeAdapter.includes(forbidden), `runtime adapter must not retain legacy exact patch dirty-diff path: ${forbidden}`);
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
    const canLaneDiffBody = methodBody(runtimeAdapter, 'canApplyLaneDiffs');
    for (const field of ['morph', 'distance', 'expression']) {
      assert(!canLaneDiffBody.includes(`previousLane.${field}`), `high-frequency lane ${field} must not be structural`);
      assert(!canLaneDiffBody.includes(`nextLane.${field}`), `high-frequency lane ${field} must not be structural`);
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
    const sourceOverrideDiffBody = methodBody(runtimeAdapter, 'appendSourceOverrideDiffs');
    for (const token of [
      'padOverrideChanged(previous, next)',
      'leadOverrideChanged(previous, next)',
      'drumOverrideChanged(previous, next)',
    ]) {
      assert(sourceOverrideDiffBody.includes(token), `sparse source override dirty diff path is missing ${token}`);
    }
    const sourceOverrideEventBody = methodBody(runtimeAdapter, 'appendOverrideBlockEvents');
    for (const token of [
      'createCoreProductSourceOverrideSlotEvent',
      'createCoreProductSourceOverrideCommitEvent',
    ]) {
      assert(sourceOverrideEventBody.includes(token), `sparse source override event path is missing ${token}`);
    }
    const laneDiffBody = methodBody(runtimeAdapter, 'appendSequencerLaneDiffs');
    for (const token of [
      'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMorph',
      'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneDistance',
      'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneExpression',
    ]) {
      assert(laneDiffBody.includes(token), `high-frequency lane control must be dirty diff event: ${token}`);
    }

    const hostTelemetryBody = methodBody(host, 'withHostDiagnostics');
    const perfBody = methodBody(host, 'createPerfSnapshot');
    const diagnosticsSnapshotBody = methodBody(hostDiagnostics, 'snapshot');
    const diagnosticsEnrichBody = methodBody(hostDiagnostics, 'enrichTelemetry');
    for (const token of [
      'dirtyDiffCount',
      'fullSnapshotReloadCount',
      'unsupportedControlCount',
      'snapshotReloadCpuMs',
      'lastSnapshotReloadReason',
    ]) {
      assert(telemetry.includes(`${token}?:`), `telemetry type is missing ${token}`);
      assert(diagnosticsSnapshotBody.includes(token), `host diagnostics snapshot is missing ${token}`);
      assert(perfBody.includes(token), `perf snapshot is missing ${token}`);
      assert(doc.includes(`\`${token}\``), `control classification doc is missing ${token}`);
    }
    assert(hostTelemetryBody.includes('this.diagnostics.enrichTelemetry'), 'host telemetry enrichment must delegate to CoreProductHostDiagnostics');
    assert(diagnosticsEnrichBody.includes('...this.snapshot()'), 'host diagnostics telemetry enrichment must include diagnostics snapshot fields');

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
    assert(unsupportedControlBody.includes('this.diagnostics.reportRuntimeFallback(method, classification)'), 'missing method fallback must delegate to diagnostics');
    const unsupportedRangeBody = methodBody(host, 'reportUnsupportedRangeKey');
    assert(unsupportedRangeBody.includes('this.diagnostics.reportUnsupportedRangeKey(key)'), 'unsupported range fallback must delegate to diagnostics');
    const unsupportedRecordBody = methodBody(hostDiagnostics, 'recordUnsupportedMethod');
    assert(unsupportedRecordBody.includes('this.unsupportedControlCount += 1'), 'diagnostics must increment unsupportedControlCount');

    const processBody = methodBody(worklet, 'process');
    assert(!processBody.includes("type: 'snapshot'"), 'audio render callback must not request full snapshots');
    assert(!processBody.includes('loadSnapshot'), 'audio render callback must not load full snapshots');
    const normalizeBody = methodBody(worklet, 'normalizeEvent');
    assert(
      normalizeBody.includes("case PRODUCT_EVENT_IDS.SetSourcePreset") &&
        normalizeBody.includes("normalized.index = this.optionalUint(event, 'index', 0, 0xffffffff);") &&
        normalizeBody.includes("normalized.value2 = this.optionalFloat(event, 'value2', 0, 0, 1);") &&
        normalizeBody.includes("normalized.flags = this.optionalUint(event, 'flags', 0, 0xffffffff);"),
      'Product source preset worklet events must preserve endpoint index, morph, and flags for live preset morph updates',
    );
    assert(
      normalizeBody.includes("case PRODUCT_EVENT_IDS.SetSourceOverride") &&
        normalizeBody.includes("normalized.paramId = this.optionalUint(event, 'paramId', 0, 0xffffffff);") &&
        normalizeBody.includes("normalized.value = this.optionalFloat(event, 'value', 0);") &&
        normalizeBody.includes("normalized.flags = this.requireUint(event, 'flags', 1, 0xffffffff);"),
      'Product source override worklet events must preserve slot, param, value, and commit flags',
    );
    addEvidence(report, {
      id: 'static-dirty-diff-contract',
      summary: 'Static dirty-diff classification, telemetry, and render-path guards passed.',
      details: {
        reloadReasonsAudited: 14,
        diffableSourceControlsAudited: 18,
      },
    });

    const adapterHarness = loadRuntimeAdapterHarness();
    const makeHydratedSnapshot = (options) =>
      hydrateGeneratedSnapshotScalars(makeSnapshot(options), adapterHarness.context.KESSHO_PRODUCT_PARAMS);
    const base = makeHydratedSnapshot();
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

    const tempoNext = clone(base);
    tempoNext.synthLanes[0].tempoMultiplier = 2;
    const tempoDiff = adapterHarness.buildCoreProductSnapshotDiff(base, tempoNext);
    assert(tempoDiff.applied === true, 'synth tempo multiplier changes must dirty-diff without a full snapshot reload');
    assert(
      tempoDiff.events.some((event) => event.paramId === 'SequencerLaneTempoMultiplier' && event.value === 2),
      'synth tempo multiplier dirty diff did not emit a lane tempo event',
    );

    const laneMacroNext = clone(base);
    laneMacroNext.synthLanes[0].morph = 0.41;
    laneMacroNext.synthLanes[0].distance = 0.52;
    laneMacroNext.synthLanes[0].expression = 0.63;
    const laneMacroDiff = adapterHarness.buildCoreProductSnapshotDiff(base, laneMacroNext);
    assert(laneMacroDiff.applied === true, 'synth lane macro changes must dirty-diff without a full snapshot reload');
    assert(
      laneMacroDiff.events.some((event) => event.paramId === 'SequencerLaneMorph' && Math.abs(event.value - 0.41) < 1.0e-6) &&
        laneMacroDiff.events.some((event) => event.paramId === 'SequencerLaneDistance' && Math.abs(event.value - 0.52) < 1.0e-6) &&
        laneMacroDiff.events.some((event) => event.paramId === 'SequencerLaneExpression' && Math.abs(event.value - 0.63) < 1.0e-6),
      'synth lane macro dirty diff did not emit lane macro events',
    );

    const assetNext = clone(base);
    assetNext.assetRefs = [11, 99];
    const assetDiff = adapterHarness.buildCoreProductSnapshotDiff(base, assetNext);
    assert(assetDiff.applied === false && assetDiff.reason === 'asset-reference-change', 'asset reference changes must full-reload with classified reason');

    const assetLevelNext = clone(base);
    assetLevelNext.assetRefLevels = [0.75, 0.9];
    const assetLevelDiff = adapterHarness.buildCoreProductSnapshotDiff(base, assetLevelNext);
    assert(assetLevelDiff.applied === false && assetLevelDiff.reason === 'asset-reference-level-change', 'asset reference level changes must full-reload with classified reason');

    const soundscapeParamNext = clone(base);
    soundscapeParamNext.soundscape.moduleParams[1] = 0.72;
    const soundscapeParamDiff = adapterHarness.buildCoreProductSnapshotDiff(base, soundscapeParamNext);
    assert(soundscapeParamDiff.applied === false && soundscapeParamDiff.reason === 'soundscape-param-change', 'soundscape structured param changes must full-reload with classified reason');

    const soundscapeOffBase = clone(base);
    soundscapeOffBase.sources[1] = makeSource(7);
    soundscapeOffBase.sources[1].assetId = 7001;
    const soundscapeOffNext = clone(soundscapeOffBase);
    soundscapeOffNext.sources[1].enabled = false;
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

    const legacyPadExactNext = clone(base);
    legacyPadExactNext.sources[0].exactPadParamCount = adapterHarness.context.KESSHO_PRODUCT_PAD_PARAM_COUNT;
    legacyPadExactNext.sources[0].exactPadParams = Array.from(
      { length: adapterHarness.context.KESSHO_PRODUCT_PAD_PARAM_COUNT },
      (_, index) => index / adapterHarness.context.KESSHO_PRODUCT_PAD_PARAM_COUNT,
    );
    const legacyPadExactDiff = adapterHarness.buildCoreProductSnapshotDiff(base, legacyPadExactNext);
    assert(
      legacyPadExactDiff.applied === false && legacyPadExactDiff.reason === 'source-structure-change',
      'legacy Pad exact patch fields must be rejected as source structure changes instead of dirty-diffed',
    );

    const padOverrideBase = clone(base);
    padOverrideBase.sources[0].sourcePresetAId = 1001;
    padOverrideBase.sources[0].sourcePresetBId = 1002;
    const padOverrideNext = clone(padOverrideBase);
    padOverrideNext.sources[0].padOverrideCount = 1;
    padOverrideNext.sources[0].padOverrideIndices = [15];
    padOverrideNext.sources[0].padOverrideValues = [0.87];
    const padOverrideDiff = adapterHarness.buildCoreProductSnapshotDiff(padOverrideBase, padOverrideNext);
    assert(
      padOverrideDiff.applied === true &&
        padOverrideDiff.events.some((event) =>
          event.type === 'source-override-slot' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.pad1 &&
            event.slotIndex === 0 &&
            event.paramIndex === 15 &&
            Math.abs(event.value - 0.87) < 1.0e-6) &&
        padOverrideDiff.events.some((event) =>
          event.type === 'source-override-commit' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.pad1 &&
            event.overrideCount === 1),
      'Product Pad sparse override changes must dirty-diff through source override events',
    );

    const leadOverrideBase = clone(base);
    leadOverrideBase.sources[0] = makeSource(adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.lead1);
    leadOverrideBase.sources[0].sourcePresetAId = 2001;
    leadOverrideBase.sources[0].sourcePresetBId = 2002;
    const leadOverrideNext = clone(leadOverrideBase);
    leadOverrideNext.sources[0].leadOverrideCount = 1;
    leadOverrideNext.sources[0].leadOverrideIndices = [62];
    leadOverrideNext.sources[0].leadOverrideValues = [0.41];
    const leadOverrideDiff = adapterHarness.buildCoreProductSnapshotDiff(leadOverrideBase, leadOverrideNext);
    assert(
      leadOverrideDiff.applied === true &&
        leadOverrideDiff.events.some((event) =>
          event.type === 'source-override-slot' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.lead1 &&
            event.slotIndex === 0 &&
            event.paramIndex === 62 &&
            Math.abs(event.value - 0.41) < 1.0e-6) &&
        leadOverrideDiff.events.some((event) =>
          event.type === 'source-override-commit' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.lead1 &&
            event.overrideCount === 1),
      'Product Lead sparse override changes must dirty-diff through source override events',
    );

    const drumOverrideBase = clone(base);
    drumOverrideBase.sources[0] = makeSource(adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum);
    const drumOverrideNext = clone(drumOverrideBase);
    drumOverrideNext.sources[0].drumOverrideCount = 1;
    drumOverrideNext.sources[0].drumOverrideIndices = [0];
    drumOverrideNext.sources[0].drumOverrideValues = [72];
    const drumOverrideDiff = adapterHarness.buildCoreProductSnapshotDiff(drumOverrideBase, drumOverrideNext);
    assert(
      drumOverrideDiff.applied === true &&
        drumOverrideDiff.events.some((event) =>
          event.type === 'source-override-slot' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum &&
            event.slotIndex === 0 &&
            event.paramIndex === 0 &&
            event.value === 72) &&
        drumOverrideDiff.events.some((event) =>
          event.type === 'source-override-commit' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum &&
            event.overrideCount === 1),
      'Product Drum sparse override changes must dirty-diff through source override events',
    );

    const legacyLeadExactBase = clone(base);
    legacyLeadExactBase.sources[0] = makeSource(adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.lead1);
    const legacyLeadExactNext = clone(legacyLeadExactBase);
    legacyLeadExactNext.sources[0].exactLeadParamCount = adapterHarness.context.KESSHO_PRODUCT_LEAD_PARAM_COUNT;
    legacyLeadExactNext.sources[0].exactLeadParams = Array.from(
      { length: adapterHarness.context.KESSHO_PRODUCT_LEAD_PARAM_COUNT },
      (_, index) => index / adapterHarness.context.KESSHO_PRODUCT_LEAD_PARAM_COUNT,
    );
    const legacyLeadExactDiff = adapterHarness.buildCoreProductSnapshotDiff(legacyLeadExactBase, legacyLeadExactNext);
    assert(
      legacyLeadExactDiff.applied === false && legacyLeadExactDiff.reason === 'source-structure-change',
      'legacy Lead exact patch fields must be rejected as source structure changes instead of dirty-diffed',
    );

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

    const legacyDrumExactBase = clone(base);
    legacyDrumExactBase.sources[0] = makeSource(adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum);
    const legacyDrumExactNext = clone(legacyDrumExactBase);
    legacyDrumExactNext.sources[0].exactDrumParamCount = adapterHarness.context.KESSHO_PRODUCT_DRUM_PARAM_COUNT;
    legacyDrumExactNext.sources[0].exactDrumParams = Array.from(
      { length: adapterHarness.context.KESSHO_PRODUCT_DRUM_PARAM_COUNT },
      (_, index) => index / adapterHarness.context.KESSHO_PRODUCT_DRUM_PARAM_COUNT,
    );
    const legacyDrumExactDiff = adapterHarness.buildCoreProductSnapshotDiff(legacyDrumExactBase, legacyDrumExactNext);
    assert(
      legacyDrumExactDiff.applied === false && legacyDrumExactDiff.reason === 'source-structure-change',
      'legacy Drum exact patch fields must be rejected as source structure changes instead of dirty-diffed',
    );

    const endpointBase = clone(base);
    endpointBase.sources[0] = makeSource(adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.lead1);
    endpointBase.sources[0].sourcePresetAId = 2001;
    endpointBase.sources[0].sourcePresetBId = 2002;
    const endpointNext = clone(endpointBase);
    endpointNext.sources[0].sourcePresetBId = 2001;
    const endpointDiff = adapterHarness.buildCoreProductSnapshotDiff(endpointBase, endpointNext);
    assert(
      endpointDiff.applied === true &&
        endpointDiff.events.some((event) =>
          event.type === 'source-preset-endpoint' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.lead1 &&
            event.endpoint === 'B' &&
            event.presetId === 2001 &&
            event.voiceIndex === 0),
      'source preset endpoint ID changes must dirty-diff so Product Core sequencer playheads stay running',
    );

    const drumEndpointBase = clone(base);
    drumEndpointBase.sources[0] = makeSource(adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum);
    drumEndpointBase.sources[0].drumVoicePresetAIds = [3101, 3201, 3301, 3401, 3501, 3601, 3701];
    drumEndpointBase.sources[0].drumVoicePresetBIds = [3101, 3202, 3301, 3401, 3501, 3601, 3714];
    drumEndpointBase.sources[0].drumVoiceMorphs = [0, 0.75, 0, 0, 0, 0, 1];
    const drumEndpointNext = clone(drumEndpointBase);
    drumEndpointNext.sources[0].drumVoicePresetBIds[1] = 3203;
    drumEndpointNext.sources[0].drumVoicePresetBIds[6] = 3716;
    const drumEndpointDiff = adapterHarness.buildCoreProductSnapshotDiff(drumEndpointBase, drumEndpointNext);
    assert(
      drumEndpointDiff.applied === true &&
        drumEndpointDiff.events.some((event) =>
          event.type === 'source-preset-endpoint' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum &&
            event.endpoint === 'B' &&
            event.presetId === 3203 &&
            event.voiceIndex === 1 &&
            Math.abs(event.morph - 0.75) < 1.0e-6) &&
        drumEndpointDiff.events.some((event) =>
          event.type === 'source-preset-endpoint' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum &&
            event.endpoint === 'B' &&
            event.presetId === 3716 &&
            event.voiceIndex === 6 &&
            Math.abs(event.morph - 1) < 1.0e-6),
      'Product Drum preset B changes must dirty-diff with the current drum voice morph without a full snapshot reload',
    );

    const drumMorphOnlyNext = clone(drumEndpointBase);
    drumMorphOnlyNext.sources[0].drumVoiceMorphs[1] = 0.25;
    const drumMorphOnlyDiff = adapterHarness.buildCoreProductSnapshotDiff(drumEndpointBase, drumMorphOnlyNext);
    assert(
      drumMorphOnlyDiff.applied === true &&
        drumMorphOnlyDiff.events.some((event) =>
          event.type === 'source-preset-endpoint' &&
            event.targetId === adapterHarness.context.CORE_PRODUCT_SOURCE_IDS.drum &&
            event.endpoint === 'A' &&
            event.presetId === 3201 &&
            event.voiceIndex === 1 &&
            Math.abs(event.morph - 0.25) < 1.0e-6),
      'Product Drum morph-only changes must dirty-diff through a generated source preset endpoint event',
    );

    const drumEndpointWithLegacyExactNext = clone(drumEndpointBase);
    drumEndpointWithLegacyExactNext.sources[0].exactDrumParamCount = adapterHarness.context.KESSHO_PRODUCT_DRUM_PARAM_COUNT;
    drumEndpointWithLegacyExactNext.sources[0].exactDrumParams = Array.from(
      { length: adapterHarness.context.KESSHO_PRODUCT_DRUM_PARAM_COUNT },
      () => 0,
    );
    drumEndpointWithLegacyExactNext.sources[0].drumVoicePresetAIds[6] = 3716;
    const drumEndpointWithLegacyExactDiff = adapterHarness.buildCoreProductSnapshotDiff(drumEndpointBase, drumEndpointWithLegacyExactNext);
    assert(
      drumEndpointWithLegacyExactDiff.applied === false &&
        drumEndpointWithLegacyExactDiff.reason === 'source-structure-change',
      'Product Drum preset endpoint dirty-diffs must reject legacy exact patch fields instead of letting them overwrite live A/B preset state',
    );

    const budgetBase = makeHydratedSnapshot({ laneCount: 24 });
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
        legacyPadExactReloadReason: legacyPadExactDiff.reason,
        legacyLeadExactReloadReason: legacyLeadExactDiff.reason,
        legacyDrumExactReloadReason: legacyDrumExactDiff.reason,
        padOverrideReloadReason: padOverrideDiff.reason,
        leadOverrideReloadReason: leadOverrideDiff.reason,
        drumOverrideReloadReason: drumOverrideDiff.reason,
        drumEndpointLegacyExactReloadReason: drumEndpointWithLegacyExactDiff.reason,
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
    let hostDiagnosticsSnapshot = hostHarness.host.getProductRuntimeDiagnostics();
    assert(hostDiagnosticsSnapshot.fullSnapshotReloadCount === 1, 'initial update must load a full snapshot');
    assert(hostDiagnosticsSnapshot.lastSnapshotReloadReason === 'initial-snapshot', 'initial update must classify as initial-snapshot');
    assert(hostHarness.runtime.snapshots.length === 1, 'initial update must call runtime.loadSnapshot');

    hostHarness.host.applyLatestSnapshotUpdate();
    hostDiagnosticsSnapshot = hostHarness.host.getProductRuntimeDiagnostics();
    assert(hostDiagnosticsSnapshot.dirtyDiffCount === 1, 'applied dirty diff must increment dirtyDiffCount');
    assert(hostDiagnosticsSnapshot.fullSnapshotReloadCount === 1, 'applied dirty diff must not load a full snapshot');
    assert(hostHarness.runtime.events.some((event) => event.type === 'dirty-param'), 'applied dirty diff must post runtime events');

    hostHarness.host.applyLatestSnapshotUpdate();
    hostDiagnosticsSnapshot = hostHarness.host.getProductRuntimeDiagnostics();
    assert(hostDiagnosticsSnapshot.fullSnapshotReloadCount === 2, 'rejected dirty diff must load a full snapshot');
    assert(hostDiagnosticsSnapshot.lastSnapshotReloadReason === 'asset-reference-change', 'rejected dirty diff must preserve adapter reload reason');
    assert(hostHarness.host.pendingSnapshotReloadReason === null, 'pending reload reason must clear after full snapshot reload');
    addEvidence(report, {
      id: 'host-dirty-diff-vs-full-snapshot-behavior',
      summary: 'Host snapshot updates use initial full load, then dirty diff, then classified structural reload.',
      details: {
        dirtyDiffCount: hostDiagnosticsSnapshot.dirtyDiffCount,
        fullSnapshotReloadCount: hostDiagnosticsSnapshot.fullSnapshotReloadCount,
        lastSnapshotReloadReason: hostDiagnosticsSnapshot.lastSnapshotReloadReason,
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
