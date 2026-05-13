import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function write(path, contents) {
  const absolutePath = resolve(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const allowedClassifications = [
  'CANONICAL_CORE_FIELD',
  'TEMP_COMPAT_WEB_REFERENCE',
  'TEMP_COMPAT_NATIVE_REFERENCE',
  'DEPRECATED_BRIDGE_FIELD',
];

const familySpecs = [
  {
    family: 'Pad',
    snake: 'pad',
    camel: 'Pad',
    range: '[0..52]',
    generatedWhy: 'Preserves factory web Pad patch parity while generated Product Core preset IDs are canonical.',
    generatedReconstructability:
      'Factory patch is reconstructable today by generated preset ID lookup; user edits still need bounded Pad override fields or events before this exact array can retire.',
    generatedRetirement:
      'Retire when C++ Product Core reconstructs all shipped Pad presets from generated preset IDs plus structured Pad metadata and Pad preset probes pass without exact Pad arrays.',
    snapshotWhy: 'Carries legacy host-authored Pad oscillator/filter/envelope overrides across the Product snapshot ABI.',
    snapshotReconstructability:
      'Not fully reconstructable yet from preset ID plus bounded user overrides; this field is the legacy override payload that must be replaced.',
    snapshotRetirement:
      'Retire when Pad user overrides are represented as generated Product Core source preset IDs plus bounded Pad override fields or live Product Core events.',
    replacementOwner: 'C++ Product Core Pad source preset resolver and bounded Pad override/event owner',
  },
  {
    family: 'Lead',
    snake: 'lead',
    camel: 'Lead',
    range: '[0..79]',
    generatedWhy: 'Preserves factory web Lead FM/operator/filter/envelope parity while generated Product Core preset IDs are canonical.',
    generatedReconstructability:
      'Factory patch is reconstructable today by generated preset ID lookup; user edits still need bounded Lead override fields or events before this exact array can retire.',
    generatedRetirement:
      'Retire when C++ Product Core reconstructs all shipped Lead presets from generated preset IDs plus structured Lead FM/operator/filter/envelope metadata and Lead probes pass without exact Lead arrays.',
    snapshotWhy: 'Carries legacy host-authored Lead FM/operator/filter/envelope overrides across the Product snapshot ABI.',
    snapshotReconstructability:
      'Not fully reconstructable yet from preset ID plus bounded user overrides; this field is the legacy override payload that must be replaced.',
    snapshotRetirement:
      'Retire when Lead user overrides are represented as generated Product Core source preset IDs plus bounded Lead FM/operator/filter/envelope override fields or live Product Core events.',
    replacementOwner: 'C++ Product Core Lead source preset resolver and bounded Lead override/event owner',
  },
  {
    family: 'Drum',
    snake: 'drum',
    camel: 'Drum',
    range: '[0..125]',
    generatedWhy: 'Preserves factory web Drum patch parity while Drum voice preset IDs and morphs become the canonical bridge.',
    generatedReconstructability:
      'Factory DrumDefault is reconstructable by generated preset ID lookup today; voice-family patches are reconstructable from drum voice preset A/B IDs plus morphs and are covered by a source reconstruction proof.',
    generatedRetirement:
      'Retire when Drum source patches reconstruct from generated Drum source preset ID, drum voice preset IDs, voice morphs, and structured Product Core drum metadata, with Drum source probes passing without exact Drum arrays.',
    snapshotWhy: 'Carries legacy host-authored Drum module overrides across the Product snapshot ABI.',
    snapshotReconstructability:
      'Partially replaced: canonical Drum voice preset IDs and morphs reconstruct voice-family patches, but arbitrary exact Drum snapshot overrides still need bounded Product Core override fields or events.',
    snapshotRetirement:
      'Retire when Drum user overrides are represented by generated Drum voice preset IDs, voice morphs, bounded Product Core drum override fields, and live Product Core events.',
    replacementOwner: 'C++ Product Core Drum source and drum voice preset resolver',
  },
];

const surfaces = [
  {
    id: 'generated-cpp-schema',
    classification: 'TEMP_COMPAT_WEB_REFERENCE',
    owner: 'scripts/generate-kessho-product-bindings.mjs and cpp/KesshoCore/generated/KesshoProductSchema.h',
    why: (spec) => spec.generatedWhy,
    reconstructability: (spec) => spec.generatedReconstructability,
    retirement: (spec) => spec.generatedRetirement,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `KesshoProductGeneratedSourcePreset.exact_${spec.snake}_param_count`,
      `KesshoProductGeneratedSourcePreset.exact_${spec.snake}_params${spec.range}`,
    ],
  },
  {
    id: 'generated-host-schema',
    classification: 'TEMP_COMPAT_WEB_REFERENCE',
    owner: 'scripts/generate-kessho-product-bindings.mjs, src/audio/generated/kesshoProductSchema.ts, and KesshoNativeSwift/Generated/KesshoProductSchema.swift',
    why: (spec) => spec.generatedWhy,
    reconstructability: (spec) => spec.generatedReconstructability,
    retirement: (spec) => spec.generatedRetirement,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `KesshoProductSourcePreset.exact${spec.camel}ParamCount`,
      `KesshoProductSourcePreset.exact${spec.camel}Params${spec.range}`,
    ],
  },
  {
    id: 'snapshot-c-abi',
    classification: 'DEPRECATED_BRIDGE_FIELD',
    owner: 'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    why: (spec) => spec.snapshotWhy,
    reconstructability: (spec) => spec.snapshotReconstructability,
    retirement: (spec) => spec.snapshotRetirement,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `KesshoProductSourceSnapshot.exact_${spec.snake}_param_count`,
      `KesshoProductSourceSnapshot.exact_${spec.snake}_params${spec.range}`,
    ],
  },
  {
    id: 'snapshot-web',
    classification: 'DEPRECATED_BRIDGE_FIELD',
    owner: 'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLegacyPresetCompat.ts',
    why: (spec) => spec.snapshotWhy,
    reconstructability: (spec) => spec.snapshotReconstructability,
    retirement: (spec) => spec.snapshotRetirement,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `ProductSourceSnapshot.exact${spec.camel}ParamCount`,
      `ProductSourceSnapshot.exact${spec.camel}Params${spec.range}`,
    ],
  },
  {
    id: 'snapshot-native',
    classification: 'TEMP_COMPAT_NATIVE_REFERENCE',
    owner: 'KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreSnapshot.swift',
    why: () => 'Preserves native snapshot serialization shape while native remains a thin Product Core bridge and does not author exact patch arrays.',
    reconstructability: (spec) =>
      spec.family === 'Drum'
        ? 'Native emits zero/default exact arrays; Drum source state reconstructs through generated source preset ID plus drum voice preset IDs and morphs.'
        : `Native emits zero/default exact arrays; ${spec.family} source state reconstructs through generated source preset ID until bounded override fields/events exist.`,
    retirement: (spec) =>
      `Retire when native ${spec.family} snapshot serialization no longer carries exact ${spec.family} patch ABI fields and generated preset IDs plus bounded overrides cover the same behavior.`,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `NativeProductSourceSnapshot.exact${spec.camel}ParamCount`,
      `NativeProductSourceSnapshot.exact${spec.camel}Params${spec.range}`,
    ],
  },
  {
    id: 'source-state',
    classification: 'DEPRECATED_BRIDGE_FIELD',
    owner: 'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    why: (spec) => `Stores decoded legacy exact ${spec.family} snapshot overrides inside Product Core source state until bounded override state exists.`,
    reconstructability: (spec) => spec.snapshotReconstructability,
    retirement: (spec) =>
      `Retire when SourceState stores ${spec.family} preset ID plus bounded ${spec.family} override state instead of exact ${spec.family} patch arrays.`,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `SourceState.exact_${spec.snake}_param_count`,
      `SourceState.exact_${spec.snake}_params${spec.range}`,
    ],
  },
  {
    id: 'module-adapter',
    classification: 'TEMP_COMPAT_WEB_REFERENCE',
    owner: 'cpp/KesshoCore/src/modules/KesshoModule.h, cpp/KesshoCore/src/product/ProductPresetBridge.h, and Product Core module source wrappers',
    why: (spec) => `Allows generated ${spec.family} preset patches and deprecated snapshot overrides to cross the shared module adapter boundary.`,
    reconstructability: (spec) =>
      `Adapter can receive reconstructed ${spec.family} state from generated preset IDs today; final replacement is structured Product Core ${spec.family} preset/override state without exact arrays.`,
    retirement: (spec) =>
      `Retire when the shared ${spec.family} module accepts structured Product Core preset and override state directly.`,
    replacementOwner: (spec) => spec.replacementOwner,
    fields: (spec) => [
      `KesshoSourcePresetPatch.exact_${spec.snake}_param_count`,
      `KesshoSourcePresetPatch.exact_${spec.snake}_params${spec.range}`,
    ],
  },
];

function buildSunsetEntries() {
  const entries = [];
  for (const spec of familySpecs) {
    for (const surface of surfaces) {
      for (const fieldName of surface.fields(spec)) {
        entries.push({
          fieldName,
          sourceFamily: spec.family,
          classification: surface.classification,
          owner: surface.owner,
          whyItExists: surface.why(spec),
          reconstructabilityFromPresetIdAndUserOverrides: surface.reconstructability(spec),
          retirementCondition: surface.retirement(spec),
          replacementProductCoreOwner: surface.replacementOwner(spec),
        });
      }
    }
  }
  return entries;
}

const sunsetEntries = buildSunsetEntries();
const reconstructionProofs = [
  {
    id: 'drum-voice-preset-ids-reconstruct-exact-sub-patch',
    sourceFamily: 'Drum',
    claim:
      'A Drum source with exact_drum_param_count = 0 reconstructs the sub voice patch from DrumDefault preset ID plus drum_voice_preset_a_ids, drum_voice_preset_b_ids, and drum_voice_morphs, matching an equivalent exact_drum_params snapshot patch.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.preset_id',
      'KesshoProductSourceSnapshot.drum_voice_preset_a_ids[0]',
      'KesshoProductSourceSnapshot.drum_voice_preset_b_ids[0]',
      'KesshoProductSourceSnapshot.drum_voice_morphs[0]',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/sources/DrumSource.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requireDrumVoicePresetIdsReconstructExactDrumPatch',
  },
];

const policyPath = 'docs/kessho-product-patch-bridge-policy.md';
const reportPath = 'docs/reports/kessho-product-patch-bridges.json';
const policy = read(policyPath);

for (const classification of allowedClassifications) {
  assert(policy.includes(`\`${classification}\``), `${policyPath} must define ${classification}`);
}

for (const heading of [
  'Field name',
  'Source family',
  'Classification',
  'Owner',
  'Why it exists',
  'Reconstructability from preset ID + user overrides',
  'Retirement condition',
  'Replacement Product Core owner',
]) {
  assert(policy.includes(heading), `${policyPath} must include sunset table column: ${heading}`);
}

for (const entry of sunsetEntries) {
  assert(policy.includes(entry.fieldName), `${policyPath} must classify exact patch field/range: ${entry.fieldName}`);
  assert(policy.includes(`\`${entry.classification}\``), `${policyPath} must include classification ${entry.classification}`);
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'pass',
  command: 'node scripts/check-kessho-product-patch-bridges.mjs',
  reportName: 'kessho-product-patch-bridges',
  allowedClassifications,
  sunsetEntries,
  reconstructionProofs,
  blocker: [],
  deferred: sunsetEntries
    .filter((entry) => entry.classification !== 'CANONICAL_CORE_FIELD')
    .map((entry) => ({
      fieldName: entry.fieldName,
      sourceFamily: entry.sourceFamily,
      classification: entry.classification,
      retirementCondition: entry.retirementCondition,
    })),
};

write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const consumedReport = JSON.parse(read(reportPath));
assert(consumedReport.schemaVersion === 1, `${reportPath} schemaVersion must be 1`);
assert(
  Array.isArray(consumedReport.sunsetEntries) && consumedReport.sunsetEntries.length === sunsetEntries.length,
  `${reportPath} sunsetEntries length mismatch`,
);
assert(
  Array.isArray(consumedReport.reconstructionProofs) && consumedReport.reconstructionProofs.length >= 1,
  `${reportPath} must include at least one source reconstruction proof`,
);

const requiredReportKeys = [
  'fieldName',
  'sourceFamily',
  'classification',
  'owner',
  'whyItExists',
  'reconstructabilityFromPresetIdAndUserOverrides',
  'retirementCondition',
  'replacementProductCoreOwner',
];
const seenFields = new Set();
for (const entry of consumedReport.sunsetEntries) {
  for (const key of requiredReportKeys) {
    assert(typeof entry[key] === 'string' && entry[key].length > 0, `${reportPath} entry missing ${key}: ${entry.fieldName}`);
  }
  assert(allowedClassifications.includes(entry.classification), `${reportPath} uses unsupported classification: ${entry.classification}`);
  assert(!seenFields.has(entry.fieldName), `${reportPath} contains duplicate sunset field: ${entry.fieldName}`);
  seenFields.add(entry.fieldName);
}
for (const entry of sunsetEntries) {
  assert(seenFields.has(entry.fieldName), `${reportPath} missing generated sunset field: ${entry.fieldName}`);
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

const sourceState = read('cpp/KesshoCore/src/product/ProductVoiceState.h');
for (const token of [
  'exact_pad_param_count',
  'exact_pad_params',
  'exact_lead_param_count',
  'exact_lead_params',
  'exact_drum_param_count',
  'exact_drum_params',
]) {
  assert(sourceState.includes(token), `SourceState exact patch bridge field missing expected policy coverage token: ${token}`);
}

const drumSource = read('cpp/KesshoCore/src/product/sources/DrumSource.cpp');
for (const token of [
  'drumVoiceMorphPatch',
  'KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT',
  'drum_voice_preset_a_ids',
  'drum_voice_preset_b_ids',
  'drum_voice_morphs',
  'drumParamUsesPresetSnap',
  'patch.exact_drum_params[param_index]',
]) {
  assert(drumSource.includes(token), `Drum reconstruction bridge proof missing source token: ${token}`);
}

const sourceWrapperTests = read('cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp');
assert(
  sourceWrapperTests.includes('requireDrumVoicePresetIdsReconstructExactDrumPatch'),
  'Product source wrapper tests must include Drum voice preset ID reconstruction proof',
);

console.log(`Kessho Product patch bridge policy checks passed; wrote ${reportPath}`);
