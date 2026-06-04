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
  'DEPRECATED_BRIDGE_FIELD',
  'RESERVED_ABI_FIELD',
];

const familySpecs = [
  {
    family: 'Pad',
    snake: 'pad',
    camel: 'Pad',
    range: '[0..52]',
    snapshotWhy: 'Retains the former Pad exact patch ABI slots as zero-only reserved fields for binary layout stability.',
    snapshotReconstructability:
      'Generated Pad preset endpoint IDs, morph, source distance, and bounded sparse Pad overrides reconstruct generated-endpoint custom Pad patches; any nonzero exact Pad count or nonzero/non-finite exact Pad value is rejected.',
    snapshotRetirement:
      'Retire only when the Product snapshot ABI can take a breaking layout revision.',
    replacementOwner: 'C++ Product Core Pad source preset resolver and bounded Pad override/event owner',
  },
  {
    family: 'Lead',
    snake: 'lead',
    camel: 'Lead',
    range: '[0..79]',
    snapshotWhy: 'Retains the former Lead exact patch ABI slots as zero-only reserved fields for binary layout stability.',
    snapshotReconstructability:
      'Generated Lead preset endpoint IDs, morph, source distance, structured algorithm/envelope fields, and bounded sparse Lead overrides reconstruct generated-endpoint and custom Lead patches; any nonzero exact Lead count or nonzero/non-finite exact Lead value is rejected.',
    snapshotRetirement:
      'Retire only when the Product snapshot ABI can take a breaking layout revision.',
    replacementOwner: 'C++ Product Core Lead source preset resolver and bounded Lead override/event owner',
  },
  {
    family: 'Drum',
    snake: 'drum',
    camel: 'Drum',
    range: '[0..125]',
    snapshotWhy:
      'Retains the former Drum exact patch ABI slots as zero-only reserved fields for binary layout stability.',
    snapshotReconstructability:
      'Canonical Drum voice preset IDs, morphs, source level, source reverb send, and bounded sparse Drum overrides reconstruct voice-family custom patches; any nonzero exact Drum count or nonzero/non-finite exact Drum value is rejected.',
    snapshotRetirement:
      'Retire only when the Product snapshot ABI can take a breaking layout revision.',
    replacementOwner: 'C++ Product Core Drum source resolver, drum voice preset resolver, and bounded Drum override/event owner',
  },
];

const surfaces = [
  {
    id: 'snapshot-c-abi',
    classification: 'RESERVED_ABI_FIELD',
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
          owner: typeof surface.owner === 'function' ? surface.owner(spec) : surface.owner,
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

function padStructuredOverrideEntry(fieldName, owner, whyItExists, reconstructabilityFromPresetIdAndUserOverrides) {
  return {
    fieldName,
    sourceFamily: 'Pad',
    classification: 'CANONICAL_CORE_FIELD',
    owner,
    whyItExists,
    reconstructabilityFromPresetIdAndUserOverrides,
    retirementCondition:
      'Keep for saved sessions; live `SetSourceOverride` covers routine Pad edits. Retire when module-native structured patch inputs replace the snapshot ABI.',
    replacementProductCoreOwner: 'C++ Product Core Pad source preset resolver and bounded Pad override/event owner',
  };
}

function leadStructuredOverrideEntry(fieldName, owner, whyItExists, reconstructabilityFromPresetIdAndUserOverrides) {
  return {
    fieldName,
    sourceFamily: 'Lead',
    classification: 'CANONICAL_CORE_FIELD',
    owner,
    whyItExists,
    reconstructabilityFromPresetIdAndUserOverrides,
    retirementCondition:
      'Keep for saved sessions; live `SetSourceOverride` covers routine Lead edits. Retire when module-native structured patch inputs replace the snapshot ABI.',
    replacementProductCoreOwner: 'C++ Product Core Lead source preset resolver and bounded Lead override/event owner',
  };
}

function drumStructuredOverrideEntry(fieldName, owner, whyItExists, reconstructabilityFromPresetIdAndUserOverrides) {
  return {
    fieldName,
    sourceFamily: 'Drum',
    classification: 'CANONICAL_CORE_FIELD',
    owner,
    whyItExists,
    reconstructabilityFromPresetIdAndUserOverrides,
    retirementCondition:
      'Keep for saved sessions; live `SetSourceOverride` covers routine Drum edits. Retire when module-native structured patch inputs replace the snapshot ABI.',
    replacementProductCoreOwner: 'C++ Product Core Drum source resolver, drum voice preset resolver, and bounded Drum override/event owner',
  };
}

const padStructuredOverrideEntries = [
  padStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.pad_override_count',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries the bounded sparse Pad user override count across the Product snapshot ABI.',
    'Generated Pad preset endpoint IDs, morph, source distance, and this bounded override count reconstruct generated-endpoint custom Pad patches without full exact arrays.',
  ),
  padStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.pad_override_indices[0..52]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Identifies which generated Pad runtime params are overridden by the bounded sparse Pad override payload.',
    'Generated Pad preset endpoint IDs, morph, and source distance reconstruct the base patch; these indices identify only the differing user controls.',
  ),
  padStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.pad_override_values[0..52]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries bounded sparse Pad user override values across the Product snapshot ABI.',
    'Generated Pad preset endpoint IDs, morph, source distance, and these values reconstruct generated-endpoint custom Pad patches without full exact arrays.',
  ),
  padStructuredOverrideEntry(
    'ProductSourceSnapshot.padOverrideCount',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductPadPatch.ts',
    'Web snapshot serialization emits only the number of Pad controls that differ from generated endpoint reconstruction.',
    'Generated Pad preset endpoint IDs, morph, source distance, and this bounded override count reconstruct generated-endpoint custom Pad patches.',
  ),
  padStructuredOverrideEntry(
    'ProductSourceSnapshot.padOverrideIndices[0..52]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductPadPatch.ts',
    'Web snapshot serialization identifies the sparse Pad controls that differ from generated endpoint reconstruction.',
    'Generated Pad preset endpoint IDs, morph, and source distance reconstruct the base patch; these indices identify only the differing user controls.',
  ),
  padStructuredOverrideEntry(
    'ProductSourceSnapshot.padOverrideValues[0..52]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductPadPatch.ts',
    'Web snapshot serialization carries bounded sparse Pad values instead of full exact Pad arrays for generated-endpoint custom controls.',
    'Generated Pad preset endpoint IDs, morph, source distance, and these values reconstruct generated-endpoint custom Pad patches.',
  ),
  padStructuredOverrideEntry(
    'SourceState.pad_override_count',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    'Stores the bounded sparse Pad override count in Product Core source state.',
    'Generated endpoint patches are reconstructed in Product Core and then patched by the bounded sparse override count.',
  ),
  padStructuredOverrideEntry(
    'SourceState.pad_override_indices[0..52]',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    'Stores bounded sparse Pad override param indices in Product Core source state.',
    'Generated endpoint patches are reconstructed in Product Core and then patched only at the indexed overridden params.',
  ),
  padStructuredOverrideEntry(
    'SourceState.pad_override_values[0..52]',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    'Stores bounded sparse Pad override values in Product Core source state.',
    'Generated endpoint patches are reconstructed in Product Core and then patched with the bounded sparse override values.',
  ),
];

const leadStructuredOverrideEntries = [
  leadStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.lead_override_count',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries the bounded sparse Lead user override count across the Product snapshot ABI.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead algorithm/envelope fields, and this bounded override count reconstruct generated-endpoint and custom Lead patches without full exact arrays.',
  ),
  leadStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.lead_override_indices[0..79]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Identifies which generated Lead runtime params are overridden by the bounded sparse Lead override payload.',
    'Generated Lead preset endpoint IDs, morph, source distance, and structured Lead fields reconstruct the base patch; these indices identify only the differing generated-endpoint or custom Lead controls.',
  ),
  leadStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.lead_override_values[0..79]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries bounded sparse Lead user override values across the Product snapshot ABI.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead fields, and these values reconstruct generated-endpoint and custom Lead patches without full exact arrays.',
  ),
  leadStructuredOverrideEntry(
    'ProductSourceSnapshot.leadOverrideCount',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts',
    'Web snapshot serialization emits only the number of Lead controls that differ from generated endpoint reconstruction.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead fields, and this bounded override count reconstruct generated-endpoint and custom Lead patches.',
  ),
  leadStructuredOverrideEntry(
    'ProductSourceSnapshot.leadOverrideIndices[0..79]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts',
    'Web snapshot serialization identifies the sparse Lead controls that differ from generated endpoint reconstruction.',
    'Generated Lead preset endpoint IDs, morph, source distance, and structured Lead fields reconstruct the base patch; these indices identify only the differing generated-endpoint or custom Lead controls.',
  ),
  leadStructuredOverrideEntry(
    'ProductSourceSnapshot.leadOverrideValues[0..79]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts',
    'Web snapshot serialization carries bounded sparse Lead values instead of full exact Lead arrays for generated-endpoint and custom Lead controls.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead fields, and these values reconstruct generated-endpoint and custom Lead patches.',
  ),
  leadStructuredOverrideEntry(
    'SourceState.lead_override_count',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    'Stores the bounded sparse Lead override count in Product Core source state.',
    'Generated endpoint patches are reconstructed in Product Core and then patched by the bounded sparse override count.',
  ),
  leadStructuredOverrideEntry(
    'SourceState.lead_override_indices[0..79]',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    'Stores bounded sparse Lead override param indices in Product Core source state.',
    'Generated endpoint patches are reconstructed in Product Core and then patched only at the indexed overridden params.',
  ),
  leadStructuredOverrideEntry(
    'SourceState.lead_override_values[0..79]',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    'Stores bounded sparse Lead override values in Product Core source state.',
    'Generated endpoint patches are reconstructed in Product Core and then patched with the bounded sparse override values.',
  ),
];

const drumStructuredOverrideEntries = [
  drumStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.drum_override_count',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries the bounded sparse Drum user override count across the Product snapshot ABI.',
    'Generated Drum voice preset IDs, morphs, source level, source reverb send, and this bounded override count reconstruct generated-voice custom Drum patches without full exact arrays.',
  ),
  drumStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.drum_override_indices[0..125]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Identifies which generated Drum runtime params are overridden by the bounded sparse Drum override payload.',
    'Generated Drum voice preset IDs, morphs, source level, and source reverb send reconstruct the base patch; these indices identify only the differing user controls.',
  ),
  drumStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.drum_override_values[0..125]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries bounded sparse Drum user override values across the Product snapshot ABI.',
    'Generated Drum voice preset IDs, morphs, source level, source reverb send, and these values reconstruct generated-voice custom Drum patches without full exact arrays.',
  ),
  drumStructuredOverrideEntry(
    'ProductSourceSnapshot.drumOverrideCount',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductDrumPatch.ts',
    'Web snapshot serialization emits only the number of Drum controls that differ from generated voice-preset reconstruction.',
    'Generated Drum voice preset IDs, morphs, source level, source reverb send, and this bounded override count reconstruct generated-voice custom Drum patches.',
  ),
  drumStructuredOverrideEntry(
    'ProductSourceSnapshot.drumOverrideIndices[0..125]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductDrumPatch.ts',
    'Web snapshot serialization identifies the sparse Drum controls that differ from generated voice-preset reconstruction.',
    'Generated Drum voice preset IDs, morphs, source level, and source reverb send reconstruct the base patch; these indices identify only the differing user controls.',
  ),
  drumStructuredOverrideEntry(
    'ProductSourceSnapshot.drumOverrideValues[0..125]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductDrumPatch.ts',
    'Web snapshot serialization carries bounded sparse Drum values instead of full exact Drum arrays for generated-voice custom controls.',
    'Generated Drum voice preset IDs, morphs, source level, source reverb send, and these values reconstruct generated-voice custom Drum patches.',
  ),
  drumStructuredOverrideEntry(
    'SourceState.drum_override_count',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp',
    'Stores the bounded sparse Drum override count in Product Core source state.',
    'Generated Drum voice patches are reconstructed in Product Core and then patched by the bounded sparse override count.',
  ),
  drumStructuredOverrideEntry(
    'SourceState.drum_override_indices[0..125]',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp',
    'Stores bounded sparse Drum override param indices in Product Core source state.',
    'Generated Drum voice patches are reconstructed in Product Core and then patched only at the indexed overridden params.',
  ),
  drumStructuredOverrideEntry(
    'SourceState.drum_override_values[0..125]',
    'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp',
    'Stores bounded sparse Drum override values in Product Core source state.',
    'Generated Drum voice patches are reconstructed in Product Core and then patched with the bounded sparse override values.',
  ),
];

const sunsetEntries = [
  ...buildSunsetEntries(),
  ...padStructuredOverrideEntries,
  ...leadStructuredOverrideEntries,
  ...drumStructuredOverrideEntries,
];
const reconstructionProofs = [
  {
    id: 'pad-sparse-overrides-stay-structured',
    sourceFamily: 'Pad',
    claim:
      'A generated-endpoint Pad source with bounded pad_override_* fields loads and triggers with SourceState-owned sparse override state and no SourceState exact Pad fields.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.source_preset_a_id',
      'KesshoProductSourceSnapshot.source_preset_b_id',
      'KesshoProductSourceSnapshot.morph',
      'KesshoProductSourceSnapshot.distance',
      'KesshoProductSourceSnapshot.pad_override_count',
      'KesshoProductSourceSnapshot.pad_override_indices',
      'KesshoProductSourceSnapshot.pad_override_values',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requirePadOverridesStayStructured',
  },
  {
    id: 'lead-sparse-overrides-stay-structured',
    sourceFamily: 'Lead',
    claim:
      'A generated-endpoint Lead source with bounded lead_override_* fields loads and triggers with SourceState-owned sparse override state and no SourceState exact Lead fields.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.source_preset_a_id',
      'KesshoProductSourceSnapshot.source_preset_b_id',
      'KesshoProductSourceSnapshot.morph',
      'KesshoProductSourceSnapshot.distance',
      'KesshoProductSourceSnapshot.lead_envelope_override_enabled',
      'KesshoProductSourceSnapshot.lead_algorithm_preset_a_enabled',
      'KesshoProductSourceSnapshot.lead_override_count',
      'KesshoProductSourceSnapshot.lead_override_indices',
      'KesshoProductSourceSnapshot.lead_override_values',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
      'cpp/KesshoCore/tests/ProductLeadExactPatchTests.cpp',
    ],
    testEntrypoint: 'requireLeadOverridesStayStructured',
  },
  {
    id: 'drum-sparse-overrides-stay-structured',
    sourceFamily: 'Drum',
    claim:
      'A generated-voice Drum source with bounded drum_override_* fields loads and triggers with SourceState-owned sparse override state and no SourceState exact Drum fields.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.preset_id',
      'KesshoProductSourceSnapshot.drum_voice_preset_a_ids',
      'KesshoProductSourceSnapshot.drum_voice_preset_b_ids',
      'KesshoProductSourceSnapshot.drum_voice_morphs',
      'KesshoProductSourceSnapshot.drum_override_count',
      'KesshoProductSourceSnapshot.drum_override_indices',
      'KesshoProductSourceSnapshot.drum_override_values',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requireDrumOverridesStayStructured',
  },
  {
    id: 'drum-voice-preset-ids-reconstruct-sparse-sub-patch',
    sourceFamily: 'Drum',
    claim:
      'A Drum source reconstructs the sub voice patch from DrumDefault preset ID plus drum_voice_preset_a_ids, drum_voice_preset_b_ids, and drum_voice_morphs, matching equivalent bounded sparse Drum overrides.',
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
    testEntrypoint: 'requireDrumVoicePresetIdsReconstructSparseDrumOverrides',
  },
  {
    id: 'runtime-param-events-use-structured-overrides',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Runtime generated Pad, Lead, and Drum SetParam events for reconstructable sources update bounded sparse override state and live module patches without SourceState exact fallback state.',
    canonicalInputs: [
      'KesshoProductEvent.kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM',
      'generated Pad/Lead/Drum runtime param IDs',
      'SourceState has no exact_* fields',
      'generated endpoint or voice-preset source state',
      'bounded *_override_count/index/value storage',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
      'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
      'cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp',
      'cpp/KesshoCore/src/product/sources/SourceOverrideRuntimeEvents.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requireRuntimeParamEventsUseStructuredOverrides',
  },
  {
    id: 'partial-exact-patch-fallbacks-are-rejected',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Any nonempty exact snapshot ABI payload is rejected as invalid state instead of being completed into full compatibility arrays at runtime.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.exact_*_param_count',
      'KesshoProductSourceSnapshot.exact_*_params',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requirePartialExactPatchFallbacksAreRejected',
  },
  {
    id: 'invalid-exact-patch-fallbacks-are-rejected',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Legacy exact patch arrays are reserved zero-only ABI slots; wrong-family, oversized, nonzero, or non-finite exact bridge fields are rejected instead of clamped, ignored, copied, or zero-filled.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.exact_pad_param_count',
      'KesshoProductSourceSnapshot.exact_pad_params',
      'KesshoProductSourceSnapshot.exact_lead_param_count',
      'KesshoProductSourceSnapshot.exact_lead_params',
      'KesshoProductSourceSnapshot.exact_drum_param_count',
      'KesshoProductSourceSnapshot.exact_drum_params',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requireInvalidExactPatchFallbacksAreRejected',
  },
  {
    id: 'invalid-source-preset-fallbacks-are-rejected',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Unknown source preset IDs and Drum voice preset IDs are rejected at snapshot and live-event boundaries instead of falling back to defaults or sibling endpoints.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.preset_id',
      'KesshoProductSourceSnapshot.drum_voice_preset_a_ids',
      'KesshoProductSourceSnapshot.drum_voice_preset_b_ids',
      'KesshoProductEvent.kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/ProductPresetBridge.h',
      'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
      'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
      'cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp',
      'cpp/KesshoCore/src/product/sources/DrumSource.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requireInvalidSourcePresetFallbacksAreRejected',
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
for (const retiredWebExactField of [
  'ProductSourceSnapshot.exactPadParamCount',
  'ProductSourceSnapshot.exactPadParams',
  'ProductSourceSnapshot.exactLeadParamCount',
  'ProductSourceSnapshot.exactLeadParams',
  'ProductSourceSnapshot.exactDrumParamCount',
  'ProductSourceSnapshot.exactDrumParams',
]) {
  assert(!policy.includes(retiredWebExactField), `${policyPath} must not reclassify retired web exact snapshot field: ${retiredWebExactField}`);
}
for (const retiredGeneratedExactField of [
  'KesshoProductGeneratedSourcePreset.exact_pad_param_count',
  'KesshoProductGeneratedSourcePreset.exact_pad_params',
  'KesshoProductGeneratedSourcePreset.exact_lead_param_count',
  'KesshoProductGeneratedSourcePreset.exact_lead_params',
  'KesshoProductGeneratedSourcePreset.exact_drum_param_count',
  'KesshoProductGeneratedSourcePreset.exact_drum_params',
]) {
  assert(
    !policy.includes(retiredGeneratedExactField),
    `${policyPath} must not reclassify retired generated source preset exact field: ${retiredGeneratedExactField}`,
  );
}
for (const retiredSourceStateExactField of [
  'SourceState.exact_pad_param_count',
  'SourceState.exact_pad_params',
  'SourceState.exact_lead_param_count',
  'SourceState.exact_lead_params',
  'SourceState.exact_drum_param_count',
  'SourceState.exact_drum_params',
]) {
  assert(!policy.includes(retiredSourceStateExactField), `${policyPath} must not reclassify retired SourceState exact field: ${retiredSourceStateExactField}`);
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
const webSoundscapesSnapshot = read('src/audio/coreProductSoundscapesSnapshot.ts');
const webSnapshotTypes = read('src/audio/coreProductSnapshotTypes.ts');
const webLeadPatch = read('src/audio/CoreProductLeadPatch.ts');
const webPadPatch = read('src/audio/CoreProductPadPatch.ts');
const webDrumPatch = read('src/audio/CoreProductDrumPatch.ts');
const webSnapshotEncoder = read('src/audio/coreProductSnapshotEncoder.ts');
const generatedSchema = read('src/audio/generated/kesshoProductSchema.ts');
const generatedCppSchema = read('cpp/KesshoCore/generated/KesshoProductSchema.h');
const webPresetIds = read('src/audio/CoreProductPresetIds.ts');
const webPatchBridgeSurface = `${webSnapshot}\n${webLeadPatch}\n${webPadPatch}\n${webDrumPatch}`;
for (const retiredWebExactField of [
  'exactPadParamCount',
  'exactPadParams',
  'exactLeadParamCount',
  'exactLeadParams',
  'exactDrumParamCount',
  'exactDrumParams',
]) {
  assert(!webSnapshotTypes.includes(retiredWebExactField), `ProductSourceSnapshot must not expose retired exact snapshot field: ${retiredWebExactField}`);
  assert(!generatedSchema.includes(`"${retiredWebExactField}"`), `Generated TypeScript source presets must not carry retired exact patch field: ${retiredWebExactField}`);
}
const generatedSourcePresetStructStart = generatedCppSchema.indexOf('struct KesshoProductGeneratedSourcePreset {');
const generatedSourcePresetStructEnd = generatedCppSchema.indexOf('};', generatedSourcePresetStructStart);
assert(
  generatedSourcePresetStructStart >= 0 && generatedSourcePresetStructEnd > generatedSourcePresetStructStart,
  'Generated C++ schema must define KesshoProductGeneratedSourcePreset',
);
const generatedSourcePresetStruct = generatedCppSchema.slice(generatedSourcePresetStructStart, generatedSourcePresetStructEnd);
assert(
  !generatedSourcePresetStruct.includes('exact_'),
  'Generated C++ generic source preset rows must not regain exact Pad/Lead/Drum patch fields',
);
assert(
  !generatedSourcePresetStruct.includes('profile_') && !generatedSchema.includes('"profile":'),
  'Generated generic source preset rows must not regain profile-derived module fallback metadata',
);
for (const retiredCppExactField of [
  'exact_pad_param_count',
  'exact_pad_params',
  'exact_lead_param_count',
  'exact_lead_params',
  'exact_drum_param_count',
  'exact_drum_params',
]) {
  assert(
    !generatedCppSchema.includes(retiredCppExactField),
    `Generated C++ source schema must not carry retired exact patch field: ${retiredCppExactField}`,
  );
}
for (const token of [
  'struct KesshoProductGeneratedPadSourcePreset',
  'KESSHO_PRODUCT_PAD_SOURCE_PRESETS[]',
  'struct KesshoProductGeneratedLeadSourcePreset',
  'KESSHO_PRODUCT_LEAD_SOURCE_PRESETS[]',
  'struct KesshoProductGeneratedDrumSourcePreset',
  'KESSHO_PRODUCT_DRUM_SOURCE_PRESETS[]',
]) {
  assert(
    generatedCppSchema.includes(token),
    `Generated C++ schema must carry family-specific source preset patch table after retiring generic exact rows: ${token}`,
  );
}
for (const token of [
  'PATCH_BRIDGE_RETIREMENT: exact Pad',
  'PATCH_BRIDGE_RETIREMENT: exact Lead',
  'PATCH_BRIDGE_RETIREMENT: exact Drum',
]) {
  assert(webPatchBridgeSurface.includes(token), `src/audio/coreProductSnapshot.ts/Product Core patch modules missing ${token}`);
}
assert(
  webSnapshot.includes('exactDrumPatchFromState(state)') &&
    webDrumPatch.includes('function exactDrumPatchFromState') &&
    webDrumPatch.includes('function generatedDrumVoicePresetPairs') &&
    webDrumPatch.includes('const presetPairs = generatedDrumVoicePresetPairs(presetAIds, presetBIds)') &&
    webDrumPatch.includes('if (!presetPairs)') &&
    webDrumPatch.includes("generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumLevel')") &&
    webDrumPatch.includes("generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumReverbSend')") &&
    webDrumPatch.includes('drumOverrideCount') &&
    webDrumPatch.includes('drumOverrideIndices') &&
    webDrumPatch.includes('drumOverrideValues') &&
    webDrumPatch.includes('KESSHO_PRODUCT_DRUM_PARAM_COUNT') &&
    !webDrumPatch.includes('exactDrumParamCount:') &&
    !webDrumPatch.includes('if (!presetA || !presetB) continue'),
  'Web Product snapshot must use bounded Drum override fields only when generated Drum preset IDs, morphs, source level, and source reverb send reconstruct the patch; invalid voice preset IDs must emit no sparse patch payload and must not expose exact snapshot fields',
);
assert(
  webSnapshot.includes('exactPadPatchFromState(') &&
    webPadPatch.includes('function exactPadPatchFromState') &&
    webPadPatch.includes('if (!canReconstructGeneratedPadParams(presetAId, presetBId))') &&
    webPadPatch.includes('applyPadDistanceParams') &&
    webPadPatch.includes('padOverrideCount') &&
    webPadPatch.includes('padOverrideIndices') &&
    webPadPatch.includes('padOverrideValues') &&
    webPadPatch.includes('KESSHO_PRODUCT_PAD_PARAM_COUNT') &&
    webPadPatch.includes('matchesSelectedPadEndpointStateCacheParams') &&
    !webPadPatch.includes('matchesGeneratedPadStateCacheParams') &&
    !webPadPatch.includes('exactPadParamCount:'),
  'Web Product snapshot must use bounded Pad override fields when generated Pad preset endpoint IDs reconstruct the patch, must limit cache suppression to documented selected/default endpoint state, and must not expose exact Pad snapshot fields',
);
assert(
  webSnapshot.includes('exactLeadPatchFromState(') &&
    webLeadPatch.includes('function exactLeadPatchFromState') &&
    webLeadPatch.includes('if (!canReconstruct)') &&
    webLeadPatch.includes('leadEnvelopeOverrideFromState') &&
    webLeadPatch.includes('leadAlgorithmPresetAEnabledFromState') &&
    webLeadPatch.includes('applyLeadDistanceParams') &&
    webLeadPatch.includes('function generatedLeadAnchorPresetId') &&
    webLeadPatch.includes('hasLeadCustomPresetData(state, leadIndex)') &&
    webLeadPatch.includes('hasLeadCustomPresetEndpointData(state, leadIndex') &&
    webSnapshot.includes('assignLeadAlgorithmOverrideFields') &&
    webSnapshot.includes('assignLeadEnvelopeOverrideFields') &&
    webLeadPatch.includes('leadOverrideCount') &&
    webLeadPatch.includes('leadOverrideIndices') &&
    webLeadPatch.includes('leadOverrideValues') &&
    webLeadPatch.includes('KESSHO_PRODUCT_LEAD_PARAM_COUNT') &&
    !webLeadPatch.includes('exactLeadParamCount:') &&
    !webSnapshot.includes('source.sourcePresetAId = 0;\n    source.sourcePresetBId = 0'),
  'Web Product snapshot must use bounded Lead override fields when generated Lead preset endpoint IDs or custom Lead anchors reconstruct the patch and must not expose exact Lead snapshot fields for invalid or custom endpoints',
);
assert(
  webSnapshotEncoder.includes('rejectLegacyExactBridge') &&
    webSnapshotEncoder.includes('exact patch fields are no longer accepted by web snapshot encoding') &&
    webSnapshotEncoder.includes('validateSparseOverride') &&
    webSnapshotEncoder.includes("rejectLegacyExactBridge('Pad', source, 'exactPadParamCount', 'exactPadParams')") &&
    webSnapshotEncoder.includes('for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_PAD_PARAM_COUNT; paramIndex += 1) f32(0)') &&
    !webSnapshotEncoder.includes('Math.min(source.padOverrideCount') &&
    !webSnapshotEncoder.includes('Math.min(source.leadOverrideCount') &&
    !webSnapshotEncoder.includes('Math.min(source.drumOverrideCount') &&
    !webSnapshotEncoder.includes('Math.min(source.padOverrideIndices') &&
    !webSnapshotEncoder.includes('Math.min(source.leadOverrideIndices') &&
    !webSnapshotEncoder.includes('Math.min(source.drumOverrideIndices'),
  'Web Product snapshot encoder must reject invalid exact/sparse bridge fields instead of clamping counts or sparse override indices',
);

const generator = read('scripts/generate-kessho-product-bindings.mjs');
for (const token of ['exactPadParamsForPreset', 'exactLeadParamsForPreset', 'exactDrumParamsForPreset']) {
  assert(
    generator.includes(token),
    `Generator must derive family-specific source preset patch params without attaching them to generic source rows: ${token}`,
  );
}
for (const token of [
  'padSourcePresetRows',
  'KESSHO_PRODUCT_PAD_SOURCE_PRESETS',
  'leadSourcePresetRows',
  'KESSHO_PRODUCT_LEAD_SOURCE_PRESETS',
  'drumSourcePresetRows',
  'KESSHO_PRODUCT_DRUM_SOURCE_PRESETS',
  'padPresetSnapParamIndices',
  'KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES',
  'leadPresetSnapParamIndices',
  'KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES',
  'leadPresetRoundParamIndices',
  'KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES',
  'drumPresetSnapParamIndices',
  'KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES',
  'params: preset.params',
]) {
  assert(generator.includes(token), `Generator must own generated source reconstruction metadata: ${token}`);
}

const sourceState = read('cpp/KesshoCore/src/product/ProductVoiceState.h');
const productSnapshot = read('cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp');
for (const token of [
  'exact_pad_param_count',
  'exact_pad_params',
  'exact_lead_param_count',
  'exact_lead_params',
  'exact_drum_param_count',
  'exact_drum_params',
]) {
  assert(!sourceState.includes(token), `SourceState must not retain retired exact patch bridge field: ${token}`);
}
for (const token of [
  'pad_override_count',
  'pad_override_indices',
  'pad_override_values',
  'lead_override_count',
  'lead_override_indices',
  'lead_override_values',
  'drum_override_count',
  'drum_override_indices',
  'drum_override_values',
  'source_preset_a_id',
  'source_preset_b_id',
  'lead_envelope_override_enabled',
  'lead_algorithm_preset_a_enabled',
  'soundscape_texture_param_count',
  'soundscape_texture_params',
  'soundscape_module_param_count',
  'soundscape_module_params',
]) {
  assert(sourceState.includes(token), `SourceState structured Product Core field missing expected policy coverage token: ${token}`);
}

const soundscapeAssets = read('cpp/KesshoCore/src/product/assets/ProductAssets.cpp');
const soundscapeGraph = read('cpp/KesshoCore/src/product/KesshoProductGraph.cpp');
const soundscapeRender = read('cpp/KesshoCore/src/product/KesshoProductRender.cpp');
const soundscapeSource = read('cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp');
for (const [surface, source] of [
  ['soundscape assets', soundscapeAssets],
  ['soundscape graph', soundscapeGraph],
  ['soundscape render', soundscapeRender],
  ['soundscape source', soundscapeSource],
]) {
  assert(
    !source.includes('exact_pad_param') && !source.includes('exact_drum_param'),
    `Product Core ${surface} must read Soundscape-owned params, not overloaded exact Pad/Drum bridge arrays`,
  );
}
assert(
  productSnapshot.includes('soundscape_texture_param_count') &&
    productSnapshot.includes('soundscape_module_param_count') &&
    productSnapshot.includes('snapshot.soundscape_texture_param_count') &&
    productSnapshot.includes('snapshot.soundscape_module_param_count') &&
    productSnapshot.includes('exactParamBlockEmpty'),
  'Snapshot loader must load dedicated Soundscape snapshot fields and reject overloaded exact Pad/Drum bridge fields',
);
const soundscapeCaseStart = webSnapshot.indexOf('case CORE_PRODUCT_SOURCE_IDS.soundscape:');
const soundscapeCaseEnd = webSnapshot.indexOf('default:', soundscapeCaseStart);
assert(soundscapeCaseStart >= 0 && soundscapeCaseEnd > soundscapeCaseStart, 'Web Product snapshot missing bounded Soundscape source case');
const soundscapeCase = webSnapshot.slice(soundscapeCaseStart, soundscapeCaseEnd);
assert(
  !soundscapeCase.includes('exactPadParamCount') &&
    !soundscapeCase.includes('exactPadParams') &&
    !soundscapeCase.includes('exactDrumParamCount') &&
    !soundscapeCase.includes('exactDrumParams') &&
    webSnapshot.includes('soundscapeSnapshotPayloadFromState') &&
    webSoundscapesSnapshot.includes('textureParamCount: SOUNDSCAPE_TEXTURE_PARAM_COUNT') &&
    webSoundscapesSnapshot.includes('moduleParamCount: SOUNDSCAPES_PRODUCT_PARAM_COUNT') &&
    webSnapshot.includes('soundscape: {'),
  'Web Soundscape snapshot payload must use dedicated Soundscape fields instead of overloaded exact Pad/Drum arrays',
);

const drumSource = read('cpp/KesshoCore/src/product/sources/DrumSource.cpp');
const sourceVoiceAllocator = read('cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp');
const productPresetBridge = `${read('cpp/KesshoCore/src/product/ProductPresetBridge.h')}\n${read('cpp/KesshoCore/src/product/ProductSourcePresetPatch.h')}`;
const sourcePresetBridge = read('cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp');
const productSources = [
  'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp',
  'cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp',
  'cpp/KesshoCore/src/product/sources/SourceOverrideRuntimeEvents.cpp',
].map((path) => read(path)).join('\n');
const productEvents = read('cpp/KesshoCore/src/product/KesshoProductEvents.cpp');
const productEngine = read('cpp/KesshoCore/src/product/KesshoProductEngine.cpp');
const sourceModuleInterface = read('cpp/KesshoCore/src/modules/KesshoModule.h');
const padModule = read('cpp/KesshoCore/src/modules/KesshoPadModule.cpp');
const leadModule = read('cpp/KesshoCore/src/modules/KesshoLeadFmModule.cpp');
const drumModule = read('cpp/KesshoCore/src/modules/KesshoDrumModule.cpp');
for (const token of ['findPadSourcePresetPatch', 'findLeadSourcePresetPatch', 'findDrumSourcePresetPatch']) {
  assert(productPresetBridge.includes(token), `Product preset bridge must use family-specific generated source patch lookup: ${token}`);
}
for (const token of [
  'preset.exact_pad_param_count',
  'preset.exact_pad_params',
  'preset.exact_lead_param_count',
  'preset.exact_lead_params',
  'preset.exact_drum_param_count',
  'preset.exact_drum_params',
]) {
  assert(!productPresetBridge.includes(token), `Product preset bridge must not read retired generic source exact field: ${token}`);
}
for (const token of [
  'float tone =',
  'float brightness =',
  'float texture =',
  'float motion =',
  'float attack = 0.5f',
  'float release = 0.5f',
  'float body =',
  'float transient =',
]) {
  assert(!sourceModuleInterface.includes(token), `Shared source preset patch must not keep profile fallback field: ${token}`);
}
for (const token of [
  'patch.tone',
  'patch.brightness',
  'patch.texture',
  'patch.motion',
  'patch.attack',
  'patch.release',
  'patch.body',
  'patch.transient',
]) {
  assert(!`${productPresetBridge}\n${padModule}\n${leadModule}`.includes(token), `Product module patch path must not read profile fallback field: ${token}`);
}
assert(
  padModule.includes('patch.exact_pad_param_count != KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT') &&
    padModule.includes('!std::isfinite(patch.exact_pad_params[i])') &&
    !padModule.includes('PAD_WAVE_SAWTOOTH : tone') &&
    !padModule.includes('PAD_FOLD_SERGE : texture'),
  'Pad module source preset patch path must reject incomplete/non-finite patches instead of synthesizing profile fallback params',
);
assert(
  leadModule.includes('patch.exact_lead_param_count != KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT') &&
    leadModule.includes('!std::isfinite(patch.exact_lead_params[index])') &&
    !leadModule.includes('LEAD_FM_ALG_DX17 : tone') &&
    !leadModule.includes('params_[kParamGain] = std::clamp(0.18f + body'),
  'Lead module source preset patch path must reject incomplete/non-finite patches instead of synthesizing profile fallback params',
);
assert(
  drumModule.includes('patch.exact_drum_param_count != KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT') &&
    drumModule.includes('!std::isfinite(patch.exact_drum_params[index])') &&
    !drumModule.includes('std::isfinite(patch.exact_drum_params[index]) ? patch.exact_drum_params[index] : defaults[index]'),
  'Drum module source preset patch path must reject non-finite patches instead of default-filling malformed params',
);
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
assert(
  productPresetBridge.includes('KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES'),
  'Drum snap-param reconstruction must use generated Product Core snap-param metadata',
);
for (const token of [
  'applyDrumSourceMixFieldsToPatch',
  'applyDrumStructuredOverridesToPatch',
  'kProductDrumMasterLevelParam',
  'kProductDrumReverbSendParam',
]) {
  assert(productPresetBridge.includes(token), `Drum structured source mix field helper missing token: ${token}`);
}
for (const token of [
  'applyDrumStructuredOverridesToPatch',
  'source.drum_override_count',
  'source.drum_override_indices',
  'source.drum_override_values',
]) {
  assert(sourcePresetBridge.includes(token), `Drum sparse override compilation missing token: ${token}`);
}
assert(
  productSnapshot.includes('compileSourcePresetRuntime(sources[i])') &&
    productSnapshot.includes('applyStructuredSourceOverridesToModule(source.source_id)'),
  'Drum snapshot loader must compile structured source patches and apply sparse overrides to modules',
);
assert(
  sourceVoiceAllocator.includes('applyDrumSourceMixFieldsToPatch'),
  'Drum trigger allocator must apply structured source level/reverb to module-boundary Drum patches',
);
for (const token of [
  'applyPadStructuredOverridesToPatch',
  'resolveSourcePresetEndpointPatch',
  'source.pad_override_count > 0u',
  'source.lead_override_count > 0u',
  'KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES',
  'KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES',
  'KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES',
]) {
  assert(productPresetBridge.includes(token), `Pad/Lead endpoint morph reconstruction must use generated metadata: ${token}`);
}
assert(
  sourceVoiceAllocator.includes('resolveSourcePresetEndpointPatch'),
  'Source voice allocator must use the shared Pad/Lead endpoint patch resolver',
);
for (const token of [
  'KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT',
  'KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT',
  'resolveSourcePresetEndpointPatch',
  'applyStructuredSourceOverridesToModule',
  'applyRuntimeSourceOverrideParam',
  'compileSourcePresetRuntime(source)',
]) {
  assert(productSources.includes(token), `Live source override event path missing token: ${token}`);
}
assert(
  productEvents.includes('KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE') &&
    productEvents.includes('applySourceOverrideEvent(event)') &&
    productEvents.includes('applyRuntimeSourceOverrideParam('),
  'Product events dispatcher must validate/apply live source override events and normalize reconstructable runtime params',
);
for (const token of ['seedExactParams', 'seedExactPadRuntimePatch', 'seedExactLeadRuntimePatch', 'seedExactDrumRuntimePatch']) {
  assert(!productEvents.includes(token), `Product runtime events must not complete partial exact fallback patches with ${token}`);
}
assert(
  productSnapshot.includes('exactParamBlockEmpty') &&
    productSnapshot.includes('count != 0u') &&
    productSnapshot.includes('values[slot] != 0.0f') &&
    !productEvents.includes('source.exact_pad_param_count') &&
    !productEvents.includes('source.exact_lead_param_count') &&
    !productEvents.includes('source.exact_drum_param_count'),
  'Product source exact fallback must reject nonempty exact snapshot ABI payloads and must not keep runtime exact fallback state',
);
assert(
  productSnapshot.includes('validSparseOverrideBlock') &&
    productSnapshot.includes('indices[slot] >= param_count || !std::isfinite(values[slot])') &&
    !productSnapshot.includes('source.pad_override_count,\n              kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT') &&
    !productSnapshot.includes('source.lead_override_count,\n              kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT') &&
    !productSnapshot.includes('source.drum_override_count,\n              kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT'),
  'Product snapshot loader must reject invalid sparse override blocks instead of clamping counts, indices, or mixed exact/sparse state',
);
assert(
  productSnapshot.includes('exactParamBlockEmpty') &&
    productSnapshot.includes('source.exact_pad_param_count') &&
    productSnapshot.includes('source.exact_lead_param_count') &&
    productSnapshot.includes('source.exact_drum_param_count') &&
    productSnapshot.includes('!std::isfinite(values[slot])') &&
    productSnapshot.includes('values[slot] != 0.0f') &&
    !productSnapshot.includes('std::min<uint32_t>(\n        source.exact_pad_param_count') &&
    !productSnapshot.includes('std::min<uint32_t>(\n        source.exact_lead_param_count') &&
    !productSnapshot.includes('std::min<uint32_t>(\n        source.exact_drum_param_count') &&
    !productSnapshot.includes('std::isfinite(source.exact_pad_params[param_index])') &&
    !productSnapshot.includes('std::isfinite(source.exact_lead_params[param_index])') &&
    !productSnapshot.includes('std::isfinite(source.exact_drum_params[param_index])'),
  'Product snapshot loader must reject invalid exact bridge fields instead of clamping counts, zero-filling values, or ignoring wrong-family exact arrays',
);
assert(
  productPresetBridge.includes('validSourcePresetForSource') &&
    productPresetBridge.includes('defaultDrumVoicePreset') &&
    productPresetBridge.includes('KesshoProductGeneratedSourcePreset& preset') &&
    !productPresetBridge.includes('sourcePresetPatch(\n    const kessho::product::generated::KesshoProductGeneratedSourcePreset*') &&
    productSnapshot.includes('validGeneratedDrumVoicePresetIds') &&
    productSnapshot.includes('generatedPadEndpointPatchValid') &&
    productSnapshot.includes('generatedLeadEndpointPatchValid') &&
    productSources.includes('validSourcePresetForSource(event.target_id, preset_id)') &&
    productSources.includes('findDrumVoicePreset(voice_index, preset_id) == nullptr') &&
    sourcePresetBridge.includes('sourcePresetMatchesSource(source.source_id, preset)') &&
    productEngine.includes('defaultDrumVoicePreset(voice.index)') &&
    productEngine.includes('drum_voice_preset_a_ids[voice.index] = default_preset->id') &&
    webPresetIds.includes('presetKeyIsExplicit') &&
    webPresetIds.includes('const lookupKey = presetKeyIsExplicit(key) ? key : fallbackKey') &&
    webPresetIds.includes('return KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === sourceFamily && preset.key === normalized)?.id ?? 0') &&
    webPresetIds.includes('const name = presetKeyIsExplicit(presetName) ? String(presetName) : voice.defaultPreset') &&
    !webPresetIds.includes('const fallback = normalizePresetKey') &&
    !webPresetIds.includes('candidate.defaultForVoice') &&
    !drumSource.includes('patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT') &&
    !drumSource.includes('preset_a = preset_b') &&
    !drumSource.includes('preset_b = preset_a') &&
    !webDrumPatch.includes('let fallback') &&
    !webDrumPatch.includes('if (!presetA) presetA = presetB') &&
    !webDrumPatch.includes('if (!presetB) presetB = presetA'),
  'Source preset and Drum voice preset lookup must reject missing generated IDs instead of falling back to defaults or sibling endpoints',
);

const sourceWrapperTests = read('cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp');
const padExactPatchTests = read('cpp/KesshoCore/tests/ProductPadExactPatchTests.cpp');
const leadExactPatchTests = read('cpp/KesshoCore/tests/ProductLeadExactPatchTests.cpp');
assert(
  sourceWrapperTests.includes('requireDrumVoicePresetIdsReconstructSparseDrumOverrides'),
  'Product source wrapper tests must include Drum voice preset ID reconstruction proof',
);
assert(
  sourceWrapperTests.includes('requireDrumOverridesStayStructured'),
  'Product source wrapper tests must include Drum sparse override structured-state proof',
);
assert(
  sourceWrapperTests.includes('requireDrumLiveOverrideEventStaysStructured'),
  'Product source wrapper tests must include Drum live sparse override event proof',
);
assert(
  sourceWrapperTests.includes('requirePadOverridesStayStructured'),
  'Product source wrapper tests must include Pad sparse override structured-state proof',
);
assert(
  sourceWrapperTests.includes('requirePadLiveOverrideEventStaysStructured'),
  'Product source wrapper tests must include Pad live sparse override event proof',
);
assert(
  sourceWrapperTests.includes('requireLeadOverridesStayStructured') &&
    leadExactPatchTests.includes('requireLeadSparseOverrideDoesNotNeedSnapshotExact'),
  'Product source wrapper and Lead exact patch tests must include Lead sparse override structured-state proof',
);
assert(
  sourceWrapperTests.includes('requireLeadLiveOverrideEventStaysStructured'),
  'Product source wrapper tests must include Lead live sparse override event proof',
);
assert(
  sourceWrapperTests.includes('requireRuntimeParamEventsUseStructuredOverrides'),
  'Product source wrapper tests must include runtime param to sparse override proof',
);
assert(
  sourceWrapperTests.includes('requirePartialExactPatchFallbacksAreRejected'),
  'Product source wrapper tests must reject partial exact fallback patches',
);
assert(
  sourceWrapperTests.includes('requireInvalidSourcePresetFallbacksAreRejected'),
  'Product source wrapper tests must reject invalid source preset fallback paths',
);
assert(
  sourceWrapperTests.includes('requireInvalidSparseOverrideFallbacksAreRejected'),
  'Product source wrapper tests must reject invalid sparse override fallback paths',
);
assert(
  sourceWrapperTests.includes('requireInvalidExactPatchFallbacksAreRejected'),
  'Product source wrapper tests must reject invalid exact patch fallback paths',
);
assert(
  padExactPatchTests.includes('requireGeneratedEndpointPadSnapshotDoesNotNeedExactPatch'),
  'Product Pad exact patch tests must prove generated endpoint snapshots load without exact Pad arrays',
);
assert(
  leadExactPatchTests.includes('requireGeneratedEndpointLeadSnapshotDoesNotNeedExactPatch'),
  'Product Lead exact patch tests must prove generated endpoint snapshots load without exact Lead arrays',
);

console.log(`Kessho Product patch bridge policy checks passed; wrote ${reportPath}`);
