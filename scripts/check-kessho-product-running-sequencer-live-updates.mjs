#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCoreProductHostHarness } from './lib/kesshoProductBehaviorHarness.mjs';

const root = process.cwd();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-running-sequencer-live-updates-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-running-sequencer-live-updates-latest.md');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(source, token) {
  return source.split(token).length - 1;
}

function eventType(event) {
  return event?.type ?? event?.kind ?? event?.id ?? null;
}

async function settleMicrotasks(countToSettle = 4) {
  for (let index = 0; index < countToSettle; index += 1) {
    await new Promise((settle) => setTimeout(settle, 0));
  }
}

const files = {
  app: read('src/App.tsx'),
  audioSync: read('src/ui/useAudioEngineParamSync.ts'),
  commitResolvedState: read('src/product-control/commitResolvedState.ts'),
  diagnosticsType: read('src/audio/product/ProductRuntimeDiagnostics.ts'),
  hostDiagnostics: read('src/audio/product/host/CoreProductHostDiagnostics.ts'),
  hostCommitService: read('src/audio/product/host/CoreProductResolvedStateCommitService.ts'),
  host: read('src/audio/coreProductEngineHost.ts'),
  manualTriggers: read('src/ui/useSelectedAudioEngineManualTriggers.ts'),
  liveTriggerCallbacks: read('src/ui/useSelectedAudioEngineLiveTriggerCallbacks.ts'),
  synthPage: read('src/ui/synth/SynthPage.tsx'),
  morphPosition: read('src/ui/useMorphPositionRuntimeSurface.ts'),
  morphSlotLoad: read('src/ui/useMorphSlotLoadRuntimeSurface.ts'),
  presetSync: read('src/ui/usePresetEngineSync.ts'),
  productTypes: read('src/audio/product/ProductEngineTypes.ts'),
  productControlState: read('src/product-control/ProductControlState.ts'),
  controlReducer: read('src/product-control/controlReducer.ts'),
  drumMorphOverrideState: read('src/product-control/drumMorphOverrideState.ts'),
  sequencerHomeCaptureEvents: read('src/audio/product/ProductSequencerHomeCaptureEvents.ts'),
  sequencerHomeCaptureEventBridge: read('src/audio/product/host/CoreProductSequencerHomeCaptureEventBridge.ts'),
  sequencerEvolveConfigEvents: read('src/audio/product/ProductSequencerEvolveConfigEvents.ts'),
  sequencerEvolveConfigEventBridge: read('src/audio/product/host/CoreProductSequencerEvolveConfigEventBridge.ts'),
  sequencerStepOverrideEvents: read('src/audio/product/ProductSequencerStepOverrideEvents.ts'),
  sequencerControls: read('src/ui/useSelectedAudioEngineSequencerControls.ts'),
  sequencerStepOverrideEventBridge: read('src/audio/product/host/CoreProductSequencerStepOverrideEventBridge.ts'),
  drumMorph: read('src/audio/drumMorph.ts'),
  sequencerTests: read('cpp/KesshoCore/tests/ProductSequencerTests.cpp'),
};

const checks = [];
function check(id, condition, message) {
  assert(condition, message);
  checks.push({ id, status: 'pass' });
}

for (const token of [
  'lastResolvedRevision',
  'lastCommittedRevision',
  'lastTriggeredRevision',
  'pendingCommitCount',
  'lastCommitMode',
  'triggerBeforeCommitCount',
]) {
  check(`diagnostics-field:${token}`, files.diagnosticsType.includes(token), `ProductRuntimeDiagnostics missing ${token}`);
  check(`host-diagnostics-field:${token}`, files.hostDiagnostics.includes(token), `CoreProductHostDiagnostics missing ${token}`);
}

check(
  'commit-uses-persistent-reducer-state',
  files.commitResolvedState.includes('productControlStateByEngine') &&
    files.commitResolvedState.includes('alignProductControlStateRevision') &&
    files.commitResolvedState.includes('productEngine.getCommittedStateRevision()') &&
    files.commitResolvedState.includes('reduceVisibleSliderStateForProductCommit'),
  'visible-state commits must use persistent reducer state aligned to the committed Product revision',
);
check(
  'commit-before-trigger-blocks-stale',
  files.commitResolvedState.includes('committedRevision < resolved.revision') &&
    files.commitResolvedState.includes('was not committed before trigger'),
  'commitThenTrigger must reject trigger-critical stale commits',
);
check(
  'host-records-trigger-revision',
  files.host.includes('this.resolvedStateCommitService.recordSoundTrigger()') &&
    files.hostCommitService.includes('this.options.diagnostics.recordProductTrigger(this.getCommittedStateRevision())') &&
    files.hostDiagnostics.includes('committedRevision < this.lastResolvedRevision'),
  'host must record the committed revision used by sound triggers',
);
check(
  'sequencer-transport-start-commit-accepted',
  files.hostCommitService.includes('isSequencerTransportStartPatch') &&
    files.hostCommitService.includes("patchMode !== 'deferred' || (") &&
    files.host.includes('applyProductStatePatch: (patch, reason, options) => this.applyProductStatePatch(patch, reason, options)'),
  'trigger-critical sequencer transport start commits must advance Product revision even while runtime start work is deferred',
);

{
  const harness = loadCoreProductHostHarness();
  const receipt = harness.host.commitResolvedState({
    revision: 1,
    reason: 'sequencer-control-change',
    triggerCritical: true,
    patch: {
      synthEuclideanMasterEnabled: true,
      synthEuclid1Enabled: true,
      leadEnabled: true,
    },
  });
  await settleMicrotasks();
  check(
    'sequencer-transport-start-runtime-harness',
    receipt.applied === true &&
      receipt.mode === 'deferred' &&
      harness.host.getCommittedStateRevision() === 1 &&
      harness.runtime.events.some((event) => eventType(event) === 'start') &&
      harness.runtime.snapshots.length > 0,
    'sequencer transport start commit must be revisioned before the runtime start event plays',
  );
}

check(
  'preset-load-trigger-critical',
  files.presetSync.includes("reason: 'preset-load'") &&
    files.presetSync.includes('triggerCritical: true'),
  'preset load must be a trigger-critical resolved transaction',
);
check(
  'morph-position-trigger-critical',
  count(files.morphPosition, "reason: 'morph-control-change'") >= 3 &&
    count(files.morphPosition, 'triggerCritical: true') >= 3,
  'manual and auto morph position paths must be trigger-critical',
);
check(
  'morph-slot-midpoint-atomic',
  files.morphSlotLoad.includes('applyMidMorphSlotReplacement') &&
    files.morphSlotLoad.includes('scheduleProductRuntimeParamUpdate(nextState') &&
    files.morphSlotLoad.includes('triggerCritical: true'),
  'mid-morph slot replacement must commit the recomputed visible state immediately',
);
check(
  'audio-sync-resolved-critical-path',
  files.audioSync.includes('commitProductControlPatchForProduct') &&
    files.audioSync.includes('resolvedCommitTriggerCritical') &&
    files.audioSync.includes('requiresResolvedCommit') &&
    files.audioSync.includes("reason === 'morph-control-change'"),
  'audio sync must route trigger-critical state through ProductControl patch commits',
);
check(
  'audio-sync-sequencer-transport-resolved',
  files.audioSync.includes('SEQUENCER_TRANSPORT_TRIGGER_KEYS') &&
    files.audioSync.includes('requiresSequencerTransportResolvedCommit(patch)') &&
    files.audioSync.includes('resolvedCommitTriggerCritical(reason, forceFullSnapshot, patch, options)'),
  'sequencer master transport keys must route through immediate resolved ProductControl commits',
);
check(
  'audio-sync-source-core-full-snapshot',
  files.audioSync.includes('SOURCE_CORE_FULL_SNAPSHOT_KEYS') &&
    files.audioSync.includes('KESSHO_PRODUCT_PAD_PARAM_SPECS') &&
    files.audioSync.includes('KESSHO_PRODUCT_DRUM_PARAM_SPECS') &&
    files.audioSync.includes("'lead2PresetC'") &&
    files.audioSync.includes("'lead2UseCustomAdsr'") &&
    files.audioSync.includes('requiresSourceCoreFullSnapshot(patch, reason, options)') &&
    files.audioSync.includes('forceFullSnapshot'),
  'source preset and source-core parameter edits must force a resolved full-snapshot commit while running',
);

check(
  'manual-trigger-core-no-external-state',
  files.manualTriggers.includes('commitProductControlActionThenTrigger(') &&
    files.manualTriggers.includes("type: 'manual-trigger/request'") &&
    files.manualTriggers.includes('productEngine.auditionSynthNote(note),') &&
    files.manualTriggers.includes('productEngine.triggerDrumVoice(voice, 0.8),') &&
    !files.manualTriggers.includes('createInitialProductControlState(') &&
    !files.manualTriggers.includes('productEngine.auditionSynthNote(note, externalState)') &&
    !files.manualTriggers.includes('productEngine.triggerDrumVoice(voice, 0.8, externalState)'),
  'core-product manual triggers must commit current ProductControl state and not pass externalState to Product triggers',
);

check(
  'sequencer-ui-patch-retired',
  !files.productTypes.includes('ProductSequencerUiPatch') &&
    !files.sequencerControls.includes('applySequencerUiPatch') &&
    !files.host.includes('recordSequencerUiPatch(') &&
    !files.hostDiagnostics.includes('recordSequencerUiPatch('),
  'sequencer UI patch bridge must be retired in favor of generated Product events',
);
check(
  'sequencer-evolve-config-generated-events',
  files.sequencerControls.includes('commitCoreProductSequencerEvents(') &&
    files.sequencerControls.includes('commitProductControlActionForProduct') &&
    files.sequencerControls.includes("type: 'sequencer/edit'") &&
    files.sequencerControls.includes("sequencerPatch('drumEuclidEvolveConfigs', configs)") &&
    files.sequencerControls.includes("sequencerPatch('synthEuclidEvolveConfigs', configs)") &&
    files.sequencerEvolveConfigEvents.includes('createCoreProductSequencerEvolveConfigEvents') &&
    files.sequencerEvolveConfigEvents.includes('CORE_PRODUCT_HOST_PARAM_IDS.SequencerEvolveConfig') &&
    files.sequencerEvolveConfigEventBridge.includes('applyCoreProductSequencerEvolveConfigEvent') &&
    files.host.includes('applyCoreProductSequencerEvolveConfigEvent({'),
  'sequencer evolve configs must use generated Product event batches instead of the sequencer UI patch bridge',
);
check(
  'synth-step-overrides-generated-events',
  files.sequencerControls.includes('createCoreProductSynthSequencerStepOverrideEvents(overrides)') &&
    files.sequencerControls.includes("sequencerPatch('synthStepOverrides', overrides)") &&
    files.sequencerStepOverrideEvents.includes('createCoreProductSequencerStepValueEvent') &&
    !files.productTypes.includes("kind: 'synth-step-overrides'"),
  'synth step overrides must use generated ProductEvent batches instead of the sequencer UI patch bridge',
);
check(
  'drum-step-overrides-generated-events',
  files.sequencerControls.includes('createCoreProductDrumSequencerStepOverrideEvents(overrides)') &&
    files.sequencerControls.includes("sequencerPatch('drumStepOverrides', overrides)") &&
    files.sequencerStepOverrideEvents.includes('createCoreProductDrumSequencerStepOverrideEvents') &&
    files.sequencerStepOverrideEvents.includes('drumPitchOffsetValue') &&
    files.sequencerStepOverrideEventBridge.includes('applyCoreProductDrumSequencerStepOverrideEvent') &&
    files.sequencerStepOverrideEventBridge.includes('drumPitchOffsetEventToMidiEvent') &&
    !files.productTypes.includes("kind: 'drum-step-overrides'"),
  'drum step overrides must use generated ProductEvent batches with host-side pitch offset resolution instead of the sequencer UI patch bridge',
);
check(
  'sequencer-home-capture-generated-events',
  files.sequencerControls.includes('createCoreProductSequencerPresetHomeCaptureEvents(drumPitchStates, synthPitchStates)') &&
    files.sequencerControls.includes("createCoreProductSequencerLaneHomeCaptureEvent('synth', laneIndex, pitchState)") &&
    files.sequencerControls.includes("createCoreProductSequencerLaneHomeCaptureEvent('drum', laneIndex, pitchState)") &&
    files.sequencerControls.includes("sequencerPatch('sequencerPresetHomeSnapshots'") &&
    files.sequencerHomeCaptureEvents.includes('createCoreProductSequencerHomeCaptureEvent') &&
    files.sequencerHomeCaptureEventBridge.includes('applyCoreProductSequencerHomeCaptureEvent') &&
    files.sequencerHomeCaptureEventBridge.includes('pitchScaleQuantizeSet') &&
    !files.productTypes.includes("kind: 'preset-home-snapshots'") &&
    !files.productTypes.includes("kind: 'capture-synth-lane-home'") &&
    !files.productTypes.includes("kind: 'capture-drum-lane-home'"),
  'sequencer home capture must use generated ProductEvent markers instead of the sequencer UI patch bridge',
);
check(
  'sequencer-controls-no-direct-productevent-enqueue',
  !files.sequencerControls.includes('productEngine.enqueueEvent(') &&
    !files.sequencerControls.includes('productEngine.enqueueEvents('),
  'sequencer control UI must route generated ProductEvents through ProductControl resolved commits, not direct enqueue calls',
);

check(
  'running-arrangement-updates-after-state-commit',
  files.host.includes('if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState)'),
  'running Product host must update arrangement bridge after committed state changes',
);

check(
  'sequencer-morph-feedback-latches-inactive-sentinel',
  files.liveTriggerCallbacks.includes('if (morph.lead1 < 0 && morph.lead2 < 0) return;') &&
    count(files.liveTriggerCallbacks, 'if (morphPosition < 0) {\n        return;\n      }') >= 3 &&
    !files.liveTriggerCallbacks.includes("removeRuntimeTriggerPositions(['padMorph']);") &&
    !files.liveTriggerCallbacks.includes("removeRuntimeTriggerPositions(['pad2Morph']);") &&
    !files.liveTriggerCallbacks.includes('const keysToClear = morphKey ? [morphKey] : morphKeys;'),
  'sequencer morph callbacks must latch prior runtime morph values when inactive sentinels arrive between triggers',
);

check(
  'preset-endpoint-changes-preserve-sequencer-morph-latch',
  files.synthPage.includes('const handlePresetEndpointSelectChange = useCallback') &&
    !files.synthPage.includes('PRESET_ENDPOINT_RUNTIME_MORPH_KEY') &&
    !files.synthPage.includes('if (morphKey) removeRuntimeValues([String(morphKey)]);') &&
    !files.synthPage.includes('removeRuntimeValues(runtimeMorphKeys);'),
  'preset endpoint changes must not clear sequencer-owned runtime morph latches',
);

check(
  'drum-morph-product-control-state',
  files.productControlState.includes('drumMorphOverrides: ProductDrumMorphOverrideState') &&
    files.drumMorphOverrideState.includes('createInitialDrumMorphOverrideState') &&
    files.controlReducer.includes("case 'drum-morph/override-set'") &&
    files.controlReducer.includes("case 'drum-morph/endpoint-clear'") &&
    files.controlReducer.includes("case 'drum-morph/dual-range-set'") &&
    !files.drumMorph.includes('drumMorphAuthorityRevision') &&
    !files.drumMorph.includes('const drumMorphOverrides') &&
    !files.drumMorph.includes('const drumMorphDualRangeOverrides'),
  'drum morph override authority must live in ProductControl state/reducer, not module-level audio storage',
);
check(
  'drum-morph-product-control-commit',
  files.app.includes('dispatchProductControlActionForProductEngine(productRuntimePort, sourceState, action).drumMorphOverrides') &&
    files.app.includes("type: 'drum-morph/override-set'") &&
    files.app.includes('drumMorphProductControlChanged') &&
    files.app.includes('scheduleProductRuntimeParamUpdate(newState as SliderState') &&
    files.app.includes("reason: 'morph-control-change'") &&
    files.app.includes('triggerCritical: true') &&
    !files.app.includes('getDrumMorphAuthorityRevision'),
  'drum morph ProductControl mutations must commit the resulting visible state immediately',
);

for (const token of [
  'ratchet',
  'cross-block',
  'block_size',
  'pending',
  'tempo change',
]) {
  check(`ratchet-regression:${token}`, files.sequencerTests.includes(token), `ratchet regression coverage missing ${token}`);
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'pass',
  checks,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  reportMarkdownPath,
  [
    '# Kessho Product Running Sequencer Live Updates',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    '| Check | Status |',
    '| --- | --- |',
    ...checks.map((entry) => `| ${entry.id} | ${entry.status} |`),
    '',
  ].join('\n'),
);

console.log(`Kessho Product running sequencer live-update gate passed; wrote ${reportJsonPath}`);
