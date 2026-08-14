import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const snapshotPath = 'src/audio/coreProductSnapshot.ts';
const snapshot = read(snapshotPath);
const soundscapesSnapshotPath = 'src/audio/coreProductSoundscapesSnapshot.ts';
const soundscapesSnapshot = read(soundscapesSnapshotPath);
const snapshotEncoderPath = 'src/audio/coreProductSnapshotEncoder.ts';
const snapshotEncoder = read(snapshotEncoderPath);
const snapshotSequencerFaceEncoderPath = 'src/audio/coreProductSequencerFaceEncoder.ts';
const snapshotSequencerFaceEncoder = read(snapshotSequencerFaceEncoderPath);
const snapshotDefaultsPath = 'src/audio/coreProductSnapshotDefaults.ts';
const snapshotDefaults = read(snapshotDefaultsPath);
const snapshotSequencerFacePath = 'src/audio/coreProductSequencerFaceSnapshot.ts';
const snapshotSequencerFace = read(snapshotSequencerFacePath);
const snapshotReverbPath = 'src/audio/coreProductReverbSnapshot.ts';
const snapshotReverb = read(snapshotReverbPath);
const presetIdsPath = 'src/audio/CoreProductPresetIds.ts';
const presetIds = read(presetIdsPath);
const leadPatchPath = 'src/audio/CoreProductLeadPatch.ts';
const leadPatch = read(leadPatchPath);
const padPatchPath = 'src/audio/CoreProductPadPatch.ts';
const padPatch = read(padPatchPath);
const drumPatchPath = 'src/audio/CoreProductDrumPatch.ts';
const drumPatch = read(drumPatchPath);
const snapshotAuthoritySurface = `${snapshot}\n${soundscapesSnapshot}\n${snapshotEncoder}\n${snapshotSequencerFaceEncoder}\n${snapshotDefaults}\n${snapshotSequencerFace}\n${snapshotReverb}\n${presetIds}\n${leadPatch}\n${padPatch}\n${drumPatch}`;

const allowedImports = new Set([
  './generated/kesshoProductSchema',
  '../ui/state',
  './CoreProductModeIds',
  './fxRoutingGraph',
  './CoreProductDrumPatch',
  './CoreProductHarmonyControl',
  './CoreProductLeadPatch',
  './CoreProductPadPatch',
  './CoreProductPresetIds',
  './coreProductDelaySnapshot',
  './coreProductEvents',
  './coreProductAssets',
  './coreProductArrangementSchedulerUtils',
  './coreProductArrangementSnapshot',
  './coreProductSequencerMacroDefaults',
  './coreProductSequencerHold',
  './coreProductSequencerFaceSnapshot',
  './coreProductReverbSnapshot',
  './coreProductSampleSlotSnapshot',
  './coreProductSoundscapesSnapshot',
  './coreProductSnapshotDefaults',
  './coreProductSnapshotEncoder',
  './coreProductSnapshotPadVoiceRouting',
  './coreProductSnapshotState',
  './coreProductSnapshotTypes',
  './distanceMacro',
  './drumVoiceMidi',
  './euclideanPatterns',
  './granularMacroCore',
  './harmony/harmonyProjection',
  './harmonySeedMaterial',
  './outputTrims',
  './product/compileProductSourceMorphAutomation',
  './rng',
  './sequencerClockDivisions',
  './sequencerAudibility',
  './sequencerResumeQuantization',
  './sequencerSwing',
  './transport',
]);

const imports = Array.from(snapshot.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of imports) {
  assert(allowedImports.has(source), `${snapshotPath} imports unclassified dependency: ${source}`);
}
for (const source of allowedImports) {
  assert(imports.includes(source), `${snapshotPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const soundscapesAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './natureSampleCatalog',
  './natureSlots',
  './rng',
  './waterPresets',
  './waterLayerActivation',
]);
const soundscapesImports = Array.from(soundscapesSnapshot.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of soundscapesImports) {
  assert(soundscapesAllowedImports.has(source), `${soundscapesSnapshotPath} imports unclassified dependency: ${source}`);
}
for (const source of soundscapesAllowedImports) {
  assert(soundscapesImports.includes(source), `${soundscapesSnapshotPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const encoderAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './coreProductEvents',
  './coreProductSoundscapesSnapshot',
  './coreProductSnapshotDefaults',
  './coreProductSequencerFaceEncoder',
  './coreProductArrangementSnapshotEncoder',
  './coreProductHarmonySnapshotEncoder',
  './coreProductSnapshot',
]);
const encoderImports = Array.from(snapshotEncoder.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of encoderImports) {
  assert(encoderAllowedImports.has(source), `${snapshotEncoderPath} imports unclassified dependency: ${source}`);
}
for (const source of encoderAllowedImports) {
  assert(encoderImports.includes(source), `${snapshotEncoderPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const drumPatchAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './CoreProductGeneratedParamMetadata',
  './CoreProductPresetIds',
  './CoreProductSparseOverrides',
  './coreProductSnapshotState',
]);
const drumPatchImports = Array.from(drumPatch.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of drumPatchImports) {
  assert(drumPatchAllowedImports.has(source), `${drumPatchPath} imports unclassified dependency: ${source}`);
}
for (const source of drumPatchAllowedImports) {
  assert(drumPatchImports.includes(source), `${drumPatchPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const padPatchAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './CoreProductPresetIds',
  './padPresets',
  './coreProductSnapshotState',
  './distanceMacro',
  './CoreProductSparseOverrides',
  './CoreProductGeneratedParamMetadata',
]);
const padPatchImports = Array.from(padPatch.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of padPatchImports) {
  assert(padPatchAllowedImports.has(source), `${padPatchPath} imports unclassified dependency: ${source}`);
}
for (const source of padPatchAllowedImports) {
  assert(padPatchImports.includes(source), `${padPatchPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const leadPatchAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './lead4opfm',
  './distanceMacro',
  './coreProductSnapshotState',
  './CoreProductPresetIds',
  './CoreProductSparseOverrides',
  './CoreProductGeneratedParamMetadata',
]);
const leadPatchImports = Array.from(leadPatch.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of leadPatchImports) {
  assert(leadPatchAllowedImports.has(source), `${leadPatchPath} imports unclassified dependency: ${source}`);
}
for (const source of leadPatchAllowedImports) {
  assert(leadPatchImports.includes(source), `${leadPatchPath} import allowlist drifted; missing expected dependency: ${source}`);
}

for (const token of [
  'SNAPSHOT_AUTHORITY: GENERATED_SCHEMA_SERIALIZATION',
  'SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID',
  'SNAPSHOT_AUTHORITY: PRODUCT_CORE_LEAD_OVERRIDE_BRIDGE',
  'SNAPSHOT_AUTHORITY: PRODUCT_CORE_PAD_OVERRIDE_BRIDGE',
  'SNAPSHOT_AUTHORITY: PRODUCT_CORE_DRUM_OVERRIDE_BRIDGE',
  'SNAPSHOT_AUTHORITY: INITIAL_RNG_SEED_ONLY',
  'SNAPSHOT_AUTHORITY: SERIALIZE_PRODUCT_STATE',
  'SNAPSHOT_AUTHORITY: PACK_GENERATED_SNAPSHOT_BYTES',
]) {
  assert(snapshotAuthoritySurface.includes(token), `${snapshotPath} snapshot authority surface missing authority label: ${token}`);
}

for (const forbidden of [
  'Math.random',
  'Date.now',
  'performance.now',
  'setTimeout',
  'setInterval',
  'new AudioContext',
  'AudioWorklet',
  'fetch(',
  'XMLHttpRequest',
  'localStorage',
  'sessionStorage',
]) {
  assert(!snapshotAuthoritySurface.includes(forbidden), `${snapshotPath} snapshot authority surface must not own runtime or hidden state via ${forbidden}`);
}

assert(
  snapshotEncoder.includes('rejectLegacyExactBridge') &&
    snapshotEncoder.includes('exact patch fields are no longer accepted by web snapshot encoding') &&
    snapshotEncoder.includes('validateSparseOverride') &&
    snapshotEncoder.includes("rejectLegacyExactBridge('Pad', source, 'exactPadParamCount', 'exactPadParams')") &&
    snapshotEncoder.includes("rejectLegacyExactBridge('Lead', source, 'exactLeadParamCount', 'exactLeadParams')") &&
    snapshotEncoder.includes("rejectLegacyExactBridge('Drum', source, 'exactDrumParamCount', 'exactDrumParams')") &&
    !snapshotEncoder.includes('Math.min(source.exactPadParamCount') &&
    !snapshotEncoder.includes('Math.min(source.padOverrideCount') &&
    !snapshotEncoder.includes('Math.min(source.padOverrideIndices') &&
    !snapshotEncoder.includes('Math.min(source.exactLeadParamCount') &&
    !snapshotEncoder.includes('Math.min(source.leadOverrideCount') &&
    !snapshotEncoder.includes('Math.min(source.leadOverrideIndices') &&
    !snapshotEncoder.includes('Math.min(source.exactDrumParamCount') &&
    !snapshotEncoder.includes('Math.min(source.drumOverrideCount') &&
    !snapshotEncoder.includes('Math.min(source.drumOverrideIndices'),
  `${snapshotEncoderPath} must reject invalid exact/sparse bridge fields instead of clamping them while packing bytes`,
);

function functionBody(source, functionToken) {
  const startIndex = source.indexOf(functionToken);
  if (startIndex < 0) return '';
  const paramsOpenIndex = source.indexOf('(', startIndex);
  if (paramsOpenIndex < 0) return '';
  let paramsDepth = 0;
  let paramsCloseIndex = -1;
  for (let index = paramsOpenIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsCloseIndex = index;
        break;
      }
    }
  }
  if (paramsCloseIndex < 0) return '';
  let openIndex = -1;
  let returnTypeBraceDepth = 0;
  for (let index = paramsCloseIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (returnTypeBraceDepth > 0) {
      if (char === '{') returnTypeBraceDepth += 1;
      if (char === '}') returnTypeBraceDepth -= 1;
      continue;
    }
    if (char === '{') {
      const prefix = source.slice(paramsCloseIndex + 1, index).trim();
      if (prefix === ':') {
        returnTypeBraceDepth = 1;
        continue;
      }
      openIndex = index;
      break;
    }
    if (char === ';') return '';
  }
  if (openIndex < 0) return '';
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return '';
}

function assertCallInsideFunction(source, sourcePath, callToken, functionToken, message) {
  const body = functionBody(source, functionToken);
  assert(body.length > 0, `${sourcePath} missing bounded function for ${callToken}`);
  assert(body.includes(callToken), message);
}

function assertCallOrderInsideFunction(source, sourcePath, firstToken, secondToken, functionToken, message) {
  const body = functionBody(source, functionToken);
  assert(body.length > 0, `${sourcePath} missing bounded function for ${firstToken}`);
  const firstIndex = body.indexOf(firstToken);
  const secondIndex = body.indexOf(secondToken);
  assert(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex, message);
}

function assertCallInside(source, sourcePath, callToken, startToken, endToken, message) {
  const startIndex = source.indexOf(startToken);
  const endIndex = source.indexOf(endToken);
  const callIndex = source.indexOf(callToken, startIndex);
  assert(callIndex >= 0, `${sourcePath} missing call token ${callToken}`);
  assert(startIndex >= 0 && endIndex > startIndex, `${sourcePath} missing bounded region for ${callToken}`);
  assert(callIndex > startIndex && callIndex < endIndex, message);
}

function assertCallOrderInside(source, sourcePath, firstToken, secondToken, startToken, endToken, message) {
  const startIndex = source.indexOf(startToken);
  const endIndex = source.indexOf(endToken);
  assert(startIndex >= 0 && endIndex > startIndex, `${sourcePath} missing bounded region for ${firstToken}`);
  const firstIndex = source.indexOf(firstToken, startIndex);
  const secondIndex = source.indexOf(secondToken, startIndex);
  assert(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex && secondIndex < endIndex, message);
}

assertCallInside(
  padPatch,
  padPatchPath,
  'KESSHO_PRODUCT_PAD_PARAM_SPECS',
  'function exactPadParamsFromState',
  'function reconstructedPadParamsFromPresetIds',
  'Pad exact param specs must stay inside the Product Core Pad override bridge',
);
assertCallInsideFunction(
  padPatch,
  padPatchPath,
  'KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES',
  'function padParamUsesPresetSnap',
  'Pad generated endpoint reconstruction must use generated Product Core snap-param metadata',
);
assertCallInsideFunction(
  padPatch,
  padPatchPath,
  'generatedPadParamsFromPresetId(presetAId)',
  'function reconstructedPadParamsFromPresetIds',
  'Pad endpoint reconstruction must derive generated Product Core preset params without TypeScript exact preset tables',
);
assertCallInsideFunction(
  padPatch,
  padPatchPath,
  'applyPadDistanceParams',
  'function exactPadParamsFromState',
  'Pad exact params must apply source distance shaping inside the Product Core Pad override bridge',
);
assertCallInsideFunction(
  padPatch,
  padPatchPath,
  'applyPadDistanceParams',
  'function reconstructedPadParamsFromPresetIds',
  'Pad endpoint reconstruction must apply source distance shaping before bounded sparse override comparison',
);
assertCallInsideFunction(
  padPatch,
  padPatchPath,
  'padOverrideCount',
  'function exactPadPatchFromState',
  'Pad generated-endpoint custom controls must use bounded sparse override fields without exact snapshot fallback arrays',
);
assertCallInsideFunction(
  padPatch,
  padPatchPath,
  'matchesSelectedPadEndpointStateCacheParams',
  'function exactPadPatchFromState',
  'Pad cache suppression must stay bounded to selected generated endpoints instead of scanning every generated Pad preset',
);
assert(
  !padPatch.includes('matchesGeneratedPadStateCacheParams'),
  'Pad cache suppression must not use broad generated-preset matching',
);
assertCallInsideFunction(
  leadPatch,
  leadPatchPath,
  'morphPresets(',
  'function exactLeadParamsFromState',
  'Lead preset morphing must stay inside the Product Core Lead override bridge',
);
assertCallInsideFunction(
  leadPatch,
  leadPatchPath,
  'KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES',
  'function leadParamUsesPresetSnap',
  'Lead generated endpoint reconstruction must use generated Product Core snap-param metadata',
);
assertCallInside(
  leadPatch,
  leadPatchPath,
  'applyLeadDistanceParams',
  'function exactLeadPatchFromState',
  'const sparseOverrides = sparseParamOverridesFromDiff',
  'Lead endpoint reconstruction must apply source distance shaping before bounded sparse override handling',
);
assertCallOrderInside(
  leadPatch,
  leadPatchPath,
  'applyLeadEnvelopeOverrideParams',
  'applyLeadDistanceParams',
  'function exactLeadPatchFromState',
  'const sparseOverrides = sparseParamOverridesFromDiff',
  'Lead exact-patch fallback comparison must apply structured envelope overrides before source distance shaping',
);
assertCallInsideFunction(
  leadPatch,
  leadPatchPath,
  'leadOverrideCount',
  'function exactLeadPatchFromState',
  'Lead generated-endpoint and custom controls must use bounded sparse override fields without exact Lead compatibility fallback',
);
assert(
  !leadPatch.includes('exactLeadParamCount: KESSHO_PRODUCT_LEAD_PARAM_COUNT'),
  'Lead web patch builder must not emit exact Lead compatibility arrays for custom preset data',
);
assertCallInsideFunction(
  leadPatch,
  leadPatchPath,
  'generatedLeadParamsFromPresetId(presetAId)',
  'function reconstructedLeadParamsFromPresetIds',
  'Lead endpoint reconstruction must derive generated Product Core preset params without TypeScript exact preset tables',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'KESSHO_PRODUCT_DRUM_PARAM_SPECS',
  'function exactDrumParamsFromState',
  'Drum exact params must stay inside the Product Core Drum sparse override bridge',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'reconstructedDrumParamsFromPresetIds',
  'function exactDrumParamsFromState',
  'Drum exact params must compare host-edited controls against generated voice-preset reconstruction',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'hasOwnProperty.call(state, spec.key)',
  'function exactDrumParamsFromState',
  'Drum exact params must only layer explicit host-edited controls over generated reconstruction',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'drumOverrideCount',
  'function exactDrumPatchFromState',
  'Drum generated voice-preset custom controls must use bounded sparse override fields without falling back to exact Drum arrays',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'if (!presetPairs)',
  'function exactDrumPatchFromState',
  'Drum invalid generated voice preset IDs must emit no exact or sparse web patch payload before Product Core rejects the IDs',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'KESSHO_PRODUCT_DRUM_VOICE_PRESETS',
  'function findDrumVoicePreset',
  'Drum voice preset lookup must use generated Product Core preset params',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'generatedDrumVoicePresetPairs(presetAIds, presetBIds)',
  'function reconstructedDrumParamsFromPresetIds',
  'Drum reconstruction must validate all generated voice preset IDs before computing params',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'presetA.params[paramIndex]',
  'function reconstructedDrumParamsFromPresetPairs',
  'Drum voice preset reconstruction must read generated Product Core preset params',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'DRUM_PARAM_MASTER_LEVEL',
  'function reconstructedDrumParamsFromPresetPairs',
  'Drum source level must stay in structured source state when generated voice presets reconstruct the patch',
);
assertCallInsideFunction(
  drumPatch,
  drumPatchPath,
  'DRUM_PARAM_REVERB_SEND',
  'function reconstructedDrumParamsFromPresetPairs',
  'Drum source reverb send must stay in structured source state when generated voice presets reconstruct the patch',
);
assertCallInsideFunction(
  snapshot,
  snapshotPath,
  'exactDrumPatchFromState(state)',
  'function sourceFromState',
  'Drum snapshot source mapping must use the conditional sparse-override/exact-fallback bridge',
);
assertCallInsideFunction(
  snapshot,
  snapshotPath,
  'exactPadPatchFromState(',
  'function sourceFromState',
  'Pad snapshot source mapping must use the conditional sparse-override/exact-fallback bridge',
);
assertCallInsideFunction(
  snapshot,
  snapshotPath,
  'assignLeadAlgorithmOverrideFields',
  'function sourceFromState',
  'Lead algorithm mode must use structured Product Core preset-A override fields before the exact Lead bridge is considered',
);
assertCallInsideFunction(
  snapshot,
  snapshotPath,
  'assignLeadEnvelopeOverrideFields',
  'function sourceFromState',
  'Lead ADSR must use structured Product Core envelope override fields before the exact Lead bridge is considered',
);
assertCallInsideFunction(
  snapshot,
  snapshotPath,
  'exactLeadPatchFromState(',
  'function sourceFromState',
  'Lead snapshot source mapping must use the conditional exact Lead patch bridge',
);

for (const forbiddenImportUsage of [
  'writePadParams',
  'writeLeadParams',
  'writeDrumParams',
  'advanceCorePreviewHarmonyState',
  'getCoreHarmonyPreviewTickCount',
]) {
  assert(!snapshotAuthoritySurface.includes(forbiddenImportUsage), `${snapshotPath} snapshot authority surface contains musical-brain helper usage: ${forbiddenImportUsage}`);
}

assert(
    snapshot.includes('source.presetId = source.morph >= 0.5') &&
    snapshot.includes('source.presetId = sourcePresetId') &&
    snapshot.includes('sourcePresetAId') &&
    snapshot.includes('sourcePresetBId') &&
    snapshot.includes('leadEnvelopeOverrideEnabled') &&
    snapshot.includes('leadAlgorithmPresetAEnabled') &&
    snapshot.includes('drumVoicePresetAIds') &&
    snapshot.includes('drumVoicePresetBIds') &&
    snapshot.includes('drumVoiceMorphs') &&
    snapshot.includes('drumOverrideCount') &&
    snapshot.includes('drumOverrideIndices') &&
    snapshot.includes('drumOverrideValues'),
  `${snapshotPath} must preserve canonical Product Core preset endpoint, source preset ID, and Drum voice bridge fields`,
);

console.log('Kessho Product snapshot authority checks passed');
