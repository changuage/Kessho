import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const host = readFileSync(resolve(root, 'src/audio/coreProductEngineHost.ts'), 'utf8');
const sequencerTests = readFileSync(resolve(root, 'cpp/KesshoCore/tests/ProductSequencerTests.cpp'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function methodBody(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*(?:private\\s+)?(?:async\\s+)?${escaped}\\s*\\(`).exec(host);
  assert(definition, `core-product host is missing ${name}()`);
  const start = definition.index;
  const open = host.indexOf('{', start);
  assert(open >= 0, `core-product host method ${name}() has no body`);
  let depth = 0;
  for (let index = open; index < host.length; index += 1) {
    const char = host[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return host.slice(open + 1, index);
    }
  }
  throw new Error(`core-product host method ${name}() body was not balanced`);
}

function assertLiveSequencerMutation(methodName, eventCreator) {
  const body = methodBody(methodName);
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

assertLiveSequencerMutation('diceSynthEuclidLane', 'createCoreProductSequencerDiceEvent(');
assertLiveSequencerMutation('diceDrumEuclidLane', 'createCoreProductSequencerDiceEvent(');
assertLiveSequencerMutation('resetSynthEuclidLaneHome', 'createCoreProductSequencerResetHomeEvent(');
assertLiveSequencerMutation('resetDrumEuclidLaneHome', 'createCoreProductSequencerResetHomeEvent(');

const postSequencerBody = methodBody('postSequencerControlEvent');
assert(postSequencerBody.includes('if (this.runtimeReady)'), 'postSequencerControlEvent() must branch on runtime readiness');
assert(postSequencerBody.includes('this.runtime.postEvent(event)'), 'postSequencerControlEvent() must post the live event');
assert(
  postSequencerBody.indexOf('this.runtime.postEvent(event)') < postSequencerBody.indexOf('this.loadLatestSnapshot()') ||
    postSequencerBody.includes('const post = () => this.runtime.postEvent(event);'),
  'runtime-ready sequencer control events must post before any snapshot bootstrap path',
);

const updateBody = methodBody('applyLatestSnapshotUpdate');
assert(updateBody.includes('const previousSnapshot = this.latestProductSnapshot'), 'snapshot update must compare against last host snapshot');
assert(updateBody.includes('this.applySnapshotDiff(previousSnapshot, nextSnapshot)'), 'snapshot update must try dirty diff first');
assert(
  updateBody.indexOf('this.applySnapshotDiff(previousSnapshot, nextSnapshot)') <
    updateBody.indexOf('this.loadProductSnapshot(nextSnapshot, reloadReason)'),
  'snapshot update must only full-reload after dirty diff rejection',
);

const patchBody = methodBody('patchAdapterState');
assert(patchBody.includes('this.applyLatestSnapshotUpdate();'), 'adapter state patches must enter the dirty diff path');
assert(!patchBody.includes('this.loadProductSnapshot('), 'adapter state patches must not bypass dirty diff with direct snapshot loads');

const createSnapshotBody = methodBody('createLatestSnapshot');
for (const token of [
  'telemetryRngState',
  'rngSeed: this.latestTelemetry.rngSeed',
  'rngState: this.latestTelemetry.rngState',
  '...telemetryRngState, ...this.latestSliderState, ...this.adapterState',
]) {
  assert(createSnapshotBody.includes(token), `createLatestSnapshot() must reconcile ${token}`);
}

const telemetryBody = methodBody('handleTelemetry');
for (const token of [
  'this.reconcileSequencerUiState(hostTelemetry)',
  'this.updateRuntimeWalkPositions(hostTelemetry)',
]) {
  assert(telemetryBody.includes(token), `handleTelemetry() must reconcile Core-owned state from telemetry: ${token}`);
}

const sequencerUiBody = methodBody('reconcileSequencerUiState');
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
  const body = methodBody(methodName);
  for (const token of [
    'stepValueOverridesFromLane(lane',
    'lane.triggerToggles.map',
    'invokeDisplayCallback(',
  ]) {
    assert(body.includes(token), `${methodName}() must update host caches and UI callbacks from Product Core state: ${token}`);
  }
}

const canDiffBody = methodBody('canApplySnapshotDiff');
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

const sourceDiffBody = methodBody('appendSourceParamDiffs');
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

const evolutionDiffBody = methodBody('appendEvolutionDiffs');
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
]) {
  assert(sequencerTests.includes(token), `Product sequencer tests are missing reconciliation assertion: ${token}`);
}

console.log('Kessho Product host reconciliation checks passed');
