#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  sequencerControls: read('src/ui/useSelectedAudioEngineSequencerControls.ts'),
  sequencerUiPatchBridge: read('src/audio/product/host/CoreProductSequencerUiPatchBridge.ts'),
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
  'sequencerUiPatchCount',
  'lastSequencerUiPatchKind',
  'lastSequencerUiRevision',
  'lastAppliedSequencerUiRevision',
]) {
  check(`diagnostics-field:${token}`, files.diagnosticsType.includes(token), `ProductRuntimeDiagnostics missing ${token}`);
  check(`host-diagnostics-field:${token}`, files.hostDiagnostics.includes(token), `CoreProductHostDiagnostics missing ${token}`);
}

check(
  'commit-revision-allocates-next',
  files.commitResolvedState.includes('nextProductControlRevision(productEngine.getCommittedStateRevision())'),
  'visible-state commits must allocate the next Product revision from the committed revision',
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
  files.audioSync.includes('commitVisibleSliderStateForProduct') &&
    files.audioSync.includes('requiresResolvedCommit') &&
    files.audioSync.includes("reason === 'morph-control-change'"),
  'audio sync must route trigger-critical state through resolved commits',
);

check(
  'manual-trigger-core-no-external-state',
  files.manualTriggers.includes('commitThenTrigger(productEngine, resolved') &&
    files.manualTriggers.includes('productEngine.auditionSynthNote(note))') &&
    files.manualTriggers.includes('productEngine.triggerDrumVoice(voice, 0.8))') &&
    !files.manualTriggers.includes('productEngine.auditionSynthNote(note, externalState)') &&
    !files.manualTriggers.includes('productEngine.triggerDrumVoice(voice, 0.8, externalState)'),
  'core-product manual triggers must commit current state and not pass externalState to Product triggers',
);

check(
  'sequencer-ui-patch-revision-type',
  files.productTypes.includes('readonly revision?: number') &&
    files.productTypes.includes('export type ProductSequencerUiPatch = ProductSequencerUiPatchRevision &'),
  'ProductSequencerUiPatch must carry an optional revision',
);
check(
  'sequencer-ui-revision-allocated',
  files.sequencerControls.includes('sequencerUiRevisionRef') &&
    files.sequencerControls.includes('revision: sequencerUiRevisionRef.current'),
  'sequencer UI bridge must allocate a revision per patch operation',
);
check(
  'sequencer-ui-revision-recorded',
  files.sequencerUiPatchBridge.includes("recordSequencerUiPatch', patch.revision ?? 0, patch.kind") &&
    files.hostDiagnostics.includes('recordSequencerUiPatch(revision: number, kind: string)'),
  'sequencer UI patch bridge must record applied revisions in diagnostics',
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
  'drum-morph-authority-revisioned',
  files.drumMorph.includes('drumMorphAuthorityRevision') &&
    files.drumMorph.includes('getDrumMorphAuthorityRevision') &&
    count(files.drumMorph, 'bumpDrumMorphAuthorityRevision()') >= 8,
  'drum morph hidden authority must expose and bump an authority revision',
);
check(
  'drum-morph-authority-commit',
  files.app.includes('getDrumMorphAuthorityRevision() !== drumMorphAuthorityRevisionBefore') &&
    files.app.includes('scheduleProductRuntimeParamUpdate(newState as SliderState') &&
    files.app.includes("reason: 'morph-control-change'") &&
    files.app.includes('triggerCritical: true'),
  'drum morph authority mutations must commit the resulting visible state immediately',
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
