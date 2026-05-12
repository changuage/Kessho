import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const host = readFileSync(resolve(root, 'src/audio/coreProductEngineHost.ts'), 'utf8');
const telemetry = readFileSync(resolve(root, 'src/audio/coreProductTelemetry.ts'), 'utf8');
const doc = readFileSync(resolve(root, 'docs/kessho-product-control-classification.md'), 'utf8');
const worklet = readFileSync(resolve(root, 'public/worklets/kessho-core-product.worklet.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function methodBody(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*(?:private\\s+)?(?:async\\s+)?${escaped}\\s*\\(`).exec(source);
  assert(definition, `missing method ${name}()`);
  const start = definition.index;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`method ${name}() body was not balanced`);
}

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
  "'harmony-mode-change'",
  "'source-structure-change'",
  "'exact-patch-change'",
  "'sequencer-structure-change'",
  "'dirty-diff-event-budget'",
  "'adapter-update'",
]) {
  assert(host.includes(reason), `SnapshotReloadReason is missing ${reason}`);
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
assert(diffBody.includes("this.pendingSnapshotReloadReason = 'dirty-diff-event-budget'"), 'dirty diff event budget fallback must be classified');
assert(diffBody.includes('events.length > MAX_SNAPSHOT_DIFF_EVENTS'), 'dirty diff must remain bounded by MAX_SNAPSHOT_DIFF_EVENTS');

const classifyBody = methodBody(host, 'classifySnapshotReloadReason');
for (const token of [
  "assetRefsChanged(previous.assetRefs, next.assetRefs)) return 'asset-reference-change'",
  "previous.harmony.chordMode !== next.harmony.chordMode) return 'harmony-mode-change'",
  "previousSource.sourceId !== nextSource.sourceId) return 'source-structure-change'",
  "previousSource.assetId !== nextSource.assetId) return 'source-structure-change'",
  "this.padPatchChanged(previousSource, nextSource)) return 'exact-patch-change'",
  "this.leadPatchChanged(previousSource, nextSource)) return 'exact-patch-change'",
  "canApplyLaneDiffs(previous.synthLanes, next.synthLanes)) return 'sequencer-structure-change'",
]) {
  assert(classifyBody.includes(token), `snapshot reload reason classifier is missing ${token}`);
}

const canDiffBody = methodBody(host, 'canApplySnapshotDiff');
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
  'postLpfHz',
  'stereoWidth',
  'postLpfKeyTracking',
]) {
  assert(!canDiffBody.includes(`previousSource.${field}`), `high-frequency source ${field} must not be structural`);
  assert(!canDiffBody.includes(`nextSource.${field}`), `high-frequency source ${field} must not be structural`);
}

const sourceDiffBody = methodBody(host, 'appendSourceParamDiffs');
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
  'KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz',
  'KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth',
  'KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking',
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

console.log('Kessho Product dirty-diff classification checks passed');
