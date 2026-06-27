#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCoreProductHostHarness, methodBody } from './lib/kesshoProductBehaviorHarness.mjs';

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
  liveTriggerUiCallbacks: read('src/ui/useLiveTriggerUiCallbacks.ts'),
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
  sequencerVisualBridge: read('src/audio/product/host/CoreProductSequencerVisualBridge.ts'),
  drumMorph: read('src/audio/drumMorph.ts'),
  sequencerClock: read('src/audio/CoreProductHostSequencerClock.ts'),
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
    files.hostCommitService.includes('patchReceipt.applied || (') &&
    files.host.includes('applyProductStatePatch: (patch, reason, options) => this.applyProductStatePatch(patch, reason, options)'),
  'trigger-critical sequencer transport start commits must advance Product revision even while runtime start work is deferred',
);

{
  const harness = loadCoreProductHostHarness();
  const receipt = await harness.host.commitResolvedState({
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

{
  const clockHarness = loadCoreProductHostHarness();
  const rejoin = clockHarness.context.shouldRejoinCoreProductSequencerClocks;
  const runningSynthBase = {
    synthEuclideanMasterEnabled: true,
    transportPrimaryClock: 'seconds',
    phraseLength: 16,
    sequencerMasterBPM: 120,
    transportBarsPerPhrase: 4,
    transportBeatsPerBar: 4,
    synthEuclidClockSource: 'localBeat',
    synthEuclidJoinPolicy: 'bar',
  };
  check(
    'preset-morph-does-not-rejoin-default-synth-lane',
    rejoin(
      runningSynthBase,
      {
        ...runningSynthBase,
        synthEuclid1Enabled: true,
        padMorph: 0.42,
      },
    ) === false &&
      rejoin(
        { ...runningSynthBase, synthEuclid2Enabled: false },
        { ...runningSynthBase, synthEuclid2Enabled: true },
      ) === true &&
      rejoin(
        { ...runningSynthBase, sequencerMasterBPM: 120 },
        { ...runningSynthBase, sequencerMasterBPM: 121 },
      ) === true,
    'preset morph/full resolved patches must not rejoin an already-default synth lane, while real lane enables and timing edits still rejoin',
  );
}

{
  const visualPublishes = [];
  const harness = loadCoreProductHostHarness({
    globals: {
      publishCoreProductSequencerVisuals: (input) => {
        visualPublishes.push(Boolean(input.telemetry?.transportRunning));
        input.publish('synthStepPosition', [2, 0, 0, 0], [5, 0, 0, 0]);
        input.publish('drumStepPosition', [3, 0, 0, 0], [7, 0, 0, 0]);
      },
    },
  });
  const noTelemetryCalls = [];
  harness.host.running = true;
  harness.host.latestTelemetry = null;
  harness.host.setSynthStepPositionCallback((steps, hitCounts) => noTelemetryCalls.push({ steps, hitCounts }));

  const telemetryCalls = [];
  harness.host.latestTelemetry = { transportRunning: true, sampleRate: 48000 };
  harness.host.setSynthStepPositionCallback((steps, hitCounts) => telemetryCalls.push({ steps, hitCounts }));

  check(
    'running-step-callback-registration-preserves-playhead',
    noTelemetryCalls.length === 0 &&
      visualPublishes.length === 1 &&
      telemetryCalls.some((call) => call.steps[0] === 2 && call.hitCounts[0] === 5),
    'running sequencer step callback registration must not publish a synthetic zero playhead reset',
  );
}

{
  const callbackRegistrationBody = methodBody(files.sequencerVisualBridge, 'publishStepCallbackRegistration');
  check(
    'running-step-callback-no-zero-reset-static',
    files.host.includes('this.sequencerVisuals.publishStepCallbackRegistration(callback, this.running, this.latestTelemetry, PRODUCT_VISIBLE_DRUM_LANE_COUNT)') &&
      files.host.includes('this.sequencerVisuals.publishStepCallbackRegistration(callback, this.running, this.latestTelemetry, PRODUCT_VISIBLE_SYNTH_LANE_COUNT)') &&
      callbackRegistrationBody.includes('if (running)') &&
      callbackRegistrationBody.includes('if (telemetry) this.publish(telemetry)') &&
      !files.host.includes('callback?.([0, 0, 0, 0], [0, 0, 0, 0]);') &&
      files.sequencerClock.includes('resolvedSequencerLaneEnabled') &&
      files.sequencerClock.includes("kind === 'synth' && laneNumber === 1"),
    'running callback registration and clock rejoin decisions must preserve existing playhead state',
  );
}

check(
  'preset-load-trigger-critical',
  files.presetSync.includes("reason: 'preset-load'") &&
    files.presetSync.includes('forceFullSnapshot: true') &&
    files.presetSync.includes('triggerCritical: true'),
  'preset load must be a trigger-critical full-snapshot resolved transaction',
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
    files.audioSync.includes('isMorphControlPatchKey') &&
    !files.audioSync.includes("reason === 'morph-control-change'"),
  'audio sync must route explicit trigger-critical state through ProductControl patch commits without promoting morph-only controls to full reloads',
);
check(
  'audio-sync-sequencer-transport-resolved',
  files.audioSync.includes('SEQUENCER_TRANSPORT_TRIGGER_KEYS') &&
    files.audioSync.includes('requiresSequencerTransportResolvedCommit(patch)') &&
    files.audioSync.includes('resolvedCommitTriggerCritical(reason, forceFullSnapshot, patch, options)'),
  'sequencer master transport keys must route through immediate resolved ProductControl commits',
);
check(
  'audio-sync-sequencer-lane-enabled-resolved',
  files.audioSync.includes('SEQUENCER_LANE_ENABLED_KEY_PATTERNS') &&
    files.audioSync.includes('/^synthEuclid[1-4]Enabled$/') &&
    files.audioSync.includes('/^drumEuclid[1-6]Enabled$/') &&
    count(files.audioSync, 'requiresSequencerLaneEnabledResolvedCommit(patch)') >= 3,
  'sequencer lane enable/mute keys must route through immediate trigger-critical ProductControl commits',
);
check(
  'audio-sync-sequencer-target-resolved',
  files.audioSync.includes('SEQUENCER_TARGET_KEY_PATTERNS') &&
    files.audioSync.includes('/^synthEuclid[1-4]Source$/') &&
    files.audioSync.includes('/^drumEuclid[1-6]Target(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)$/') &&
    count(files.audioSync, 'requiresSequencerTargetResolvedCommit(patch)') >= 3,
  'sequencer source/target keys must route through immediate trigger-critical ProductControl commits so running lanes update selected engines',
);
check(
  'audio-sync-source-core-resolved-full-snapshot-boundary',
  files.audioSync.includes('SOURCE_PRESET_ENDPOINT_RESOLVED_COMMIT_KEYS') &&
    files.audioSync.includes('SOURCE_PRESET_DATA_RESOLVED_COMMIT_KEY_PATTERNS') &&
    files.audioSync.includes("'lead2PresetC'") &&
    files.audioSync.includes('requiresSourceCoreResolvedCommit(patch)') &&
    methodBody(files.audioSync, 'resolvedCommitTriggerCritical').includes('requiresSourceCoreResolvedCommit(patch)') &&
    files.audioSync.includes('requiresSourceCoreFullSnapshot(patch, reason, options)') &&
    files.audioSync.includes("if (reason === 'preset-load') return true;") &&
    files.audioSync.includes('Object.keys(patch).some(isSourceCoreResolvedCommitPatchKey)') &&
    files.audioSync.includes("'drumKickPresetA'") &&
    files.audioSync.includes('return false;') &&
    !files.audioSync.includes('KESSHO_PRODUCT_PAD_PARAM_SPECS') &&
    !files.audioSync.includes('KESSHO_PRODUCT_DRUM_PARAM_SPECS') &&
    files.presetSync.includes("reason: 'preset-load'") &&
    files.presetSync.includes('triggerCritical: true') &&
    files.presetSync.includes('forceFullSnapshot: true'),
  'source preset endpoint/data edits must use resolved full-snapshot commits while morph-only controls stay off the full-snapshot path',
);

check(
  'manual-trigger-core-resolved-state',
  files.manualTriggers.includes('commitProductControlActionThenTrigger(') &&
    files.manualTriggers.includes("type: 'manual-trigger/request'") &&
    files.manualTriggers.includes('(_revision, resolvedSliders) => productEngine.auditionSynthNote(note, resolvedSliders),') &&
    files.manualTriggers.includes('(_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, 0.8, resolvedSliders),') &&
    !files.manualTriggers.includes('createInitialProductControlState(') &&
    !files.manualTriggers.includes('productEngine.auditionSynthNote(note, externalState)') &&
    !files.manualTriggers.includes('productEngine.triggerDrumVoice(voice, 0.8, externalState)'),
  'core-product manual triggers must commit current ProductControl state and pass resolved sliders to Product triggers',
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
  files.sequencerControls.includes('createCoreProductSynthSequencerStepOverrideEvents(overrides') &&
    files.sequencerControls.includes("sequencerPatch('synthStepOverrides', overrides)") &&
    files.sequencerStepOverrideEvents.includes('createCoreProductSequencerStepValueEvent') &&
    !files.productTypes.includes("kind: 'synth-step-overrides'"),
  'synth step overrides must use generated ProductEvent batches instead of the sequencer UI patch bridge',
);
check(
  'drum-step-overrides-generated-events',
  files.sequencerControls.includes('createCoreProductDrumSequencerStepOverrideEvents(overrides') &&
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
  files.liveTriggerUiCallbacks.includes('if (morph.lead1 < 0 && morph.lead2 < 0) return;') &&
    count(files.liveTriggerUiCallbacks, 'if (morphPosition < 0) return;') >= 3 &&
    !files.liveTriggerUiCallbacks.includes("removeRuntimeTriggerPositions(['padMorph']);") &&
    !files.liveTriggerUiCallbacks.includes("removeRuntimeTriggerPositions(['pad2Morph']);") &&
    !files.liveTriggerUiCallbacks.includes('const keysToClear = morphKey ? [morphKey] : morphKeys;'),
  'sequencer morph callbacks must latch prior runtime morph values when inactive sentinels arrive between triggers',
);

check(
  'morph-sub-lane-disable-clears-runtime-lock',
  files.synthPage.includes('morphSubLaneRuntimeOwnersRef') &&
    files.synthPage.includes('runtimeMorphKeyForLaneSource') &&
    files.synthPage.includes('keysToClear.add(owner.key)') &&
    files.synthPage.includes('activeKeys.forEach((key) => keysToClear.delete(key))') &&
    files.synthPage.includes('removeRuntimeValues(keysToClear)'),
  'explicitly disabling or retargeting a morph sub-lane must clear stale runtime morph values that lock preset morph sliders',
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
