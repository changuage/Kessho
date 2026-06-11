#!/usr/bin/env node
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const assetDir = process.env.LEAD4OPFM_V2_ASSET_DIR || join(homedir(), 'Downloads');

const repoBankPath = resolve(root, 'src/audio/lead4opfmV2PresetBank.json');
const presetPackPath = join(assetDir, 'kessho-lead4opfm-v2-preset-pack.json');
const cloudPayloadPath = join(assetDir, 'kessho-lead4opfm-v2-cloud-upsert-payload.json');
const localBackupPath = join(assetDir, 'kessho-lead4opfm-v2-local-import-backup.json');

const waveformValues = new Set(['sine', 'triangle', 'sawtooth', 'square']);
const lfoTargetValues = new Set(['all', 'mod1', 'mod2', 'mod3', 'mod4', 'filter', 'pitch', 'detune', 'amp', 'pan', 'none']);
const pitchEnvTargetValues = new Set(['carriers', 'carrier1', 'carrier2', 'all']);
const requiredArchiveRows = new Set([
  '5f99e8e0-8687-46a6-86a5-40bbef681585',
  '9f764548-ba9e-4b47-960c-ad1a9dbb4100',
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(path) {
  assert(existsSync(path), `Missing asset: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`);
}

function assertRange(value, min, max, label) {
  assertFiniteNumber(value, label);
  assert(value >= min && value <= max, `${label}=${value} outside ${min}..${max}`);
}

function assertLeadPresetShape(preset, index) {
  const label = `${preset?.name ?? `preset ${index}`}`;
  assert(typeof preset?.id === 'string' && preset.id.length > 0, `${label} missing id`);
  assert(typeof preset.name === 'string' && preset.name.length > 0, `${label} missing name`);
  assert(preset.engine === 'Lead4opFM', `${label} engine must be Lead4opFM`);
  assert(['parallel', 'stack', 'split', 'cross', 'dx17'].includes(preset.algorithm), `${label} invalid algorithm`);
  assert(preset.params && typeof preset.params === 'object', `${label} missing params`);

  const params = preset.params;
  assert(waveformValues.has(params.carrier1Waveform), `${label} invalid carrier1Waveform`);
  assert(waveformValues.has(params.carrier2Waveform), `${label} invalid carrier2Waveform`);
  assertRange(params.stereoSpread, 0, 1, `${label}.params.stereoSpread`);
  assert(params.pitchEnv && typeof params.pitchEnv === 'object', `${label} missing pitchEnv`);
  assertFiniteNumber(params.pitchEnv.depthCents, `${label}.params.pitchEnv.depthCents`);
  assertRange(params.pitchEnv.attack, 0, 10, `${label}.params.pitchEnv.attack`);
  assertRange(params.pitchEnv.decay, 0.001, 30, `${label}.params.pitchEnv.decay`);
  assert(pitchEnvTargetValues.has(params.pitchEnv.target), `${label} invalid pitchEnv target`);
  assertRange(params.pitchEnv.velocityDepth, 0, 1, `${label}.params.pitchEnv.velocityDepth`);

  if (params.lfo) {
    assertFiniteNumber(params.lfo.rate, `${label}.params.lfo.rate`);
    assertFiniteNumber(params.lfo.depth, `${label}.params.lfo.depth`);
    assert(lfoTargetValues.has(params.lfo.target ?? 'all'), `${label} invalid lfo target`);
  }

  for (const operatorKey of ['mod1', 'mod2', 'mod3', 'mod4']) {
    const operator = params[operatorKey];
    assert(operator && typeof operator === 'object', `${label} missing ${operatorKey}`);
    assert(waveformValues.has(operator.waveform), `${label}.${operatorKey} invalid waveform`);
    if (operator.fixedHz !== undefined) assertRange(operator.fixedHz, 0, 20000, `${label}.${operatorKey}.fixedHz`);
    assertRange(operator.keyTrack, 0, 1, `${label}.${operatorKey}.keyTrack`);
    assertRange(operator.velocityToIndex, 0, 1, `${label}.${operatorKey}.velocityToIndex`);
    assertRange(operator.velocityToLevel, 0, 1, `${label}.${operatorKey}.velocityToLevel`);
    assertRange(operator.modRelease, 0, 30, `${label}.${operatorKey}.modRelease`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label} duplicate: ${value}`);
    seen.add(value);
  }
}

function assertSamePresetList(left, right, label) {
  assert(left.length === right.length, `${label} count mismatch: ${left.length} !== ${right.length}`);
  for (let index = 0; index < left.length; index += 1) {
    assert(
      stableJson(left[index]) === stableJson(right[index]),
      `${label} preset mismatch at index ${index}: ${left[index]?.name} !== ${right[index]?.name}`,
    );
  }
}

async function loadPresetUtils() {
  const result = await build({
    entryPoints: [resolve(root, 'src/presets/presetUtils.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const source = result.outputFiles[0]?.text;
  assert(source, 'Failed to compile preset utilities');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const repoBank = readJson(repoBankPath);
const presetPack = readJson(presetPackPath);
const cloudPayload = readJson(cloudPayloadPath);
const localBackup = readJson(localBackupPath);
const { getPresetScope, isPresetCompatibleWithSlot, normalizePresetEntry } = await loadPresetUtils();

assert(Array.isArray(repoBank), 'Repo Lead4opFM v2 bank must be an array');
assert(repoBank.length === 37, `Repo Lead4opFM v2 bank must contain 37 presets, got ${repoBank.length}`);
assertUnique(repoBank.map((preset) => preset.id), 'Repo Lead4opFM v2 preset id');
assertUnique(repoBank.map((preset) => preset.name), 'Repo Lead4opFM v2 preset name');
repoBank.forEach(assertLeadPresetShape);

assert(localBackup.kesshoBackup === true, 'Local import backup must use kesshoBackup format');
assert(localBackup.count === 37, `Local import backup count must be 37, got ${localBackup.count}`);
assert(Array.isArray(localBackup.entries) && localBackup.entries.length === 37, 'Local import backup must contain 37 entries');
const localBackupPresets = localBackup.entries.map((entry) => {
  const normalized = normalizePresetEntry(entry);
  assert(normalized, `${entry.name} backup entry must normalize through PresetStore import`);
  assert(isPresetCompatibleWithSlot(normalized, 'engine', 'lead4opfm'), `${entry.name} backup entry must import into engine:lead4opfm`);
  assert(getPresetScope(normalized, 'engine') === 'lead4opfm', `${entry.name} normalized backup scope must be lead4opfm`);
  assert(entry.type === 'engine', `${entry.name} backup entry must be engine level`);
  assert(entry.scope === 'lead4opfm' && entry.engine === 'lead4opfm', `${entry.name} backup entry must be scoped to lead4opfm`);
  assert(entry.library === 'user', `${entry.name} local backup entry must import as user library`);
  assert(Array.isArray(entry.versions) && entry.versions.length === 1, `${entry.name} backup entry must contain one version`);
  return entry.versions[0].data;
});
assertSamePresetList(repoBank, localBackupPresets, 'Local import backup');

assert(Array.isArray(presetPack.retunedFactoryPresets) && presetPack.retunedFactoryPresets.length === 17, 'Preset pack must contain 17 retuned factory presets');
assert(Array.isArray(presetPack.newShowcasePresets) && presetPack.newShowcasePresets.length === 20, 'Preset pack must contain 20 showcase presets');
assert(Array.isArray(presetPack.archiveOrMerge) && presetPack.archiveOrMerge.length === 2, 'Preset pack must contain 2 archive/merge actions');
const packPresets = [...presetPack.retunedFactoryPresets, ...presetPack.newShowcasePresets].map((entry) => entry.preset);
assertSamePresetList(repoBank, packPresets, 'Preset pack');

assert(cloudPayload.schema === 'kessho-lead4opfm-v2-cloud-upsert-payload-v1', 'Unexpected cloud payload schema');
assert(Array.isArray(cloudPayload.actions) && cloudPayload.actions.length === 39, 'Cloud payload must contain 39 actions');
const actionCounts = cloudPayload.actions.reduce((counts, action) => {
  counts[action.action] = (counts[action.action] ?? 0) + 1;
  return counts;
}, {});
assert(actionCounts.upsert_version === 17, `Cloud payload must contain 17 upsert actions, got ${actionCounts.upsert_version ?? 0}`);
assert(actionCounts.create_preset === 20, `Cloud payload must contain 20 create actions, got ${actionCounts.create_preset ?? 0}`);
assert(actionCounts.archive_or_merge === 2, `Cloud payload must contain 2 archive actions, got ${actionCounts.archive_or_merge ?? 0}`);
const cloudPresets = cloudPayload.actions.filter((action) => action.payload).map((action) => action.payload);
assertSamePresetList(repoBank, cloudPresets, 'Cloud payload');
const archiveRows = new Set(cloudPayload.actions.filter((action) => action.action === 'archive_or_merge').map((action) => action.rowId));
for (const rowId of requiredArchiveRows) {
  assert(archiveRows.has(rowId), `Cloud payload missing archive/merge row ${rowId}`);
}
assert(
  cloudPayload.actions.some((action) => action.match?.currentName === 'CALIOPE' && action.renameTo === 'Calliope'),
  'Cloud payload must rename CALIOPE to Calliope',
);

console.log('Lead4opFM v2 preset assets passed');
