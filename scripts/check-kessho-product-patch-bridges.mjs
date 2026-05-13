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

const policyPath = 'docs/kessho-product-patch-bridge-policy.md';
const policy = read(policyPath);

for (const classification of [
  'CANONICAL_CORE_FIELD',
  'TEMP_COMPAT_WEB_REFERENCE',
  'TEMP_COMPAT_NATIVE_REFERENCE',
  'DEPRECATED_BRIDGE_FIELD',
]) {
  assert(policy.includes(`\`${classification}\``), `${policyPath} must define ${classification}`);
}

const requiredPolicyTokens = [
  'KesshoProductGeneratedSourcePreset.exact_pad_param_count',
  'KesshoProductGeneratedSourcePreset.exact_pad_params[0..52]',
  'KesshoProductGeneratedSourcePreset.exact_lead_param_count',
  'KesshoProductGeneratedSourcePreset.exact_lead_params[0..79]',
  'KesshoProductGeneratedSourcePreset.exact_drum_param_count',
  'KesshoProductGeneratedSourcePreset.exact_drum_params[0..125]',
  'KesshoProductSourceSnapshot.exact_pad_param_count',
  'KesshoProductSourceSnapshot.exact_pad_params[0..52]',
  'KesshoProductSourceSnapshot.exact_lead_param_count',
  'KesshoProductSourceSnapshot.exact_lead_params[0..79]',
  'KesshoProductSourceSnapshot.exact_drum_param_count',
  'KesshoProductSourceSnapshot.exact_drum_params[0..125]',
  'ProductSourceSnapshot.exactPadParamCount',
  'ProductSourceSnapshot.exactPadParams[0..52]',
  'ProductSourceSnapshot.exactLeadParamCount',
  'ProductSourceSnapshot.exactLeadParams[0..79]',
  'ProductSourceSnapshot.exactDrumParamCount',
  'ProductSourceSnapshot.exactDrumParams[0..125]',
  'NativeProductSourceSnapshot.exactPadParamCount',
  'NativeProductSourceSnapshot.exactPadParams[0..52]',
  'NativeProductSourceSnapshot.exactLeadParamCount',
  'NativeProductSourceSnapshot.exactLeadParams[0..79]',
  'NativeProductSourceSnapshot.exactDrumParamCount',
  'NativeProductSourceSnapshot.exactDrumParams[0..125]',
  'KesshoSourcePresetPatch.exact_pad_param_count',
  'KesshoSourcePresetPatch.exact_pad_params[0..52]',
  'KesshoSourcePresetPatch.exact_lead_param_count',
  'KesshoSourcePresetPatch.exact_lead_params[0..79]',
  'KesshoSourcePresetPatch.exact_drum_param_count',
  'KesshoSourcePresetPatch.exact_drum_params[0..125]',
];

for (const token of requiredPolicyTokens) {
  assert(policy.includes(token), `${policyPath} must classify exact patch field/range: ${token}`);
}

for (const rowLabel of [
  'Generated source preset exact Pad patch',
  'Generated source preset exact Lead patch',
  'Generated source preset exact Drum patch',
  'Product snapshot exact Pad override bridge',
  'Product snapshot exact Lead override bridge',
  'Product snapshot exact Drum override bridge',
  'Shared module patch adapter exact Pad fields',
  'Shared module patch adapter exact Lead fields',
  'Shared module patch adapter exact Drum fields',
]) {
  const row = policy.split('\n').find((line) => line.includes(`| ${rowLabel} |`));
  assert(row, `${policyPath} missing classification row: ${rowLabel}`);
  assert(row.includes('Retire when'), `${rowLabel} must include a retirement condition`);
  assert(
    row.includes('TEMP_COMPAT_WEB_REFERENCE') || row.includes('TEMP_COMPAT_NATIVE_REFERENCE') ||
      row.includes('DEPRECATED_BRIDGE_FIELD') || row.includes('CANONICAL_CORE_FIELD'),
    `${rowLabel} must include an explicit classification`,
  );
}

const webSnapshot = read('src/audio/coreProductSnapshot.ts');
const webLegacyCompat = read('src/audio/CoreProductLegacyPresetCompat.ts');
const webPatchBridgeSurface = `${webSnapshot}\n${webLegacyCompat}`;
for (const token of [
  'PATCH_BRIDGE_RETIREMENT: exact Pad',
  'PATCH_BRIDGE_RETIREMENT: exact Lead',
  'PATCH_BRIDGE_RETIREMENT: exact Drum',
]) {
  assert(webPatchBridgeSurface.includes(token), `src/audio/coreProductSnapshot.ts/CoreProductLegacyPresetCompat.ts missing ${token}`);
}
assert(
  webSnapshot.includes('source.exactDrumParamCount = 0;'),
  'Web Product snapshot must not emit host-owned exact Drum arrays while Drum voice preset IDs are the canonical bridge',
);

const nativeSnapshot = read('KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreSnapshot.swift');
assert(
  nativeSnapshot.includes('PATCH_BRIDGE_RETIREMENT: exact Pad/Lead/Drum'),
  'Native Product snapshot must label exact patch serialization as temporary compatibility',
);
assert(
  nativeSnapshot.includes('exactPadParamCount: 0') &&
    nativeSnapshot.includes('exactLeadParamCount: 0') &&
    nativeSnapshot.includes('exactDrumParamCount: 0'),
  'Native Product snapshot defaults must not author exact patch arrays',
);

const generator = read('scripts/generate-kessho-product-bindings.mjs');
for (const token of ['exactPadParamsForPreset', 'exactLeadParamsForPreset', 'exactDrumParamsForPreset']) {
  assert(generator.includes(token), `Generator must remain the only source of generated exact patch arrays: ${token}`);
}

console.log('Kessho Product patch bridge policy checks passed');
