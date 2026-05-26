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
];

const familySpecs = [
  {
    family: 'Pad',
    snake: 'pad',
    camel: 'Pad',
    range: '[0..52]',
    generatedWhy: 'Preserves factory web Pad patch parity while generated Product Core preset IDs are canonical.',
    generatedReconstructability:
      'Factory patch is reconstructable today by generated preset endpoint ID lookup plus morph; generated-endpoint user edits now use bounded sparse Pad override fields while invalid/non-reconstructable web endpoint IDs emit no exact fallback and are rejected by Product Core.',
    generatedRetirement:
      'Retire when C++ Product Core reconstructs all shipped Pad presets from generated preset IDs plus structured Pad metadata and Pad preset probes pass without exact Pad arrays.',
    snapshotWhy: 'Carries legacy host-authored Pad oscillator/filter/envelope overrides across the Product snapshot ABI.',
    snapshotReconstructability:
      'Partially replaced: generated Pad preset endpoint IDs, morph, source distance, and bounded sparse Pad overrides reconstruct generated-endpoint custom Pad patches; web snapshots no longer emit exact Pad arrays for invalid/non-reconstructable endpoint IDs, and remaining exact Pad arrays must be owner-family, complete, and finite legacy/imported snapshot payloads.',
    snapshotRetirement:
      'Retire when all Pad sources are reconstructable from generated Product Core source preset IDs plus bounded Pad override fields or live Product Core events.',
    replacementOwner: 'C++ Product Core Pad source preset resolver and bounded Pad override/event owner',
  },
  {
    family: 'Lead',
    snake: 'lead',
    camel: 'Lead',
    range: '[0..79]',
    generatedWhy: 'Preserves factory web Lead FM/operator/filter/envelope parity while generated Product Core preset IDs are canonical.',
    generatedReconstructability:
      'Factory patch is reconstructable today by generated preset endpoint ID lookup plus morph; generated-endpoint and custom Lead preset edits now use bounded sparse Lead override fields while invalid/non-reconstructable web endpoint IDs emit no exact fallback.',
    generatedRetirement:
      'Retire when C++ Product Core reconstructs all shipped Lead presets from generated preset IDs plus structured Lead FM/operator/filter/envelope metadata and Lead probes pass without exact Lead arrays.',
    snapshotWhy: 'Carries legacy host-authored Lead FM/operator/filter/envelope overrides across the Product snapshot ABI.',
    snapshotReconstructability:
      'Partially replaced: generated Lead preset endpoint IDs, morph, source distance, structured algorithm/envelope fields, and bounded sparse Lead overrides reconstruct generated-endpoint and custom Lead patches; web snapshots no longer emit exact Lead arrays for invalid/non-reconstructable endpoint IDs, and remaining exact Lead arrays must be owner-family, complete, and finite.',
    snapshotRetirement:
      'Retire when all Lead sources are reconstructable from generated Product Core source preset IDs plus bounded Lead override fields or live Product Core events.',
    replacementOwner: 'C++ Product Core Lead source preset resolver and bounded Lead override/event owner',
  },
  {
    family: 'Drum',
    snake: 'drum',
    camel: 'Drum',
    range: '[0..125]',
    generatedWhy: 'Preserves factory web Drum patch parity while generated Drum voice preset IDs, morphs, and sparse Drum overrides are canonical.',
    generatedReconstructability:
      'Factory DrumDefault is reconstructable by generated preset ID lookup today; voice-family patches are reconstructable from drum voice preset A/B IDs plus morphs, while invalid web Drum voice preset IDs emit no exact or sparse fallback payload and are rejected by Product Core.',
    generatedRetirement:
      'Retire when Drum source patches reconstruct from generated Drum source preset ID, drum voice preset IDs, voice morphs, and structured Product Core drum metadata, with Drum source probes passing without exact Drum arrays.',
    snapshotWhy:
      'Carries legacy host-authored Drum module overrides across the Product snapshot ABI for older sessions and imported compatibility snapshots.',
    snapshotReconstructability:
      'Partially replaced: canonical Drum voice preset IDs, morphs, source level, source reverb send, and bounded sparse Drum overrides reconstruct voice-family custom patches; web snapshots no longer emit exact or sparse Drum patch payloads for invalid voice preset IDs, and remaining exact Drum arrays must be owner-family, complete, and finite legacy/imported snapshot payloads.',
    snapshotRetirement:
      'Retire when Drum user overrides are represented by generated Drum voice preset IDs, voice morphs, bounded Product Core drum override fields, and live Product Core events.',
    replacementOwner: 'C++ Product Core Drum source resolver, drum voice preset resolver, and bounded Drum override/event owner',
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
    owner: 'scripts/generate-kessho-product-bindings.mjs and src/audio/generated/kesshoProductSchema.ts',
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
    owner: (spec) => spec.family === 'Drum'
      ? 'src/audio/coreProductSnapshot.ts and src/audio/CoreProductDrumPatch.ts'
      : spec.family === 'Pad'
      ? 'src/audio/coreProductSnapshot.ts and src/audio/CoreProductPadPatch.ts'
      : spec.family === 'Lead'
      ? 'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts'
      : 'src/audio/coreProductSnapshot.ts',
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
    id: 'source-state',
    classification: 'DEPRECATED_BRIDGE_FIELD',
    owner: 'cpp/KesshoCore/src/product/ProductVoiceState.h, cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp, and cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    why: (spec) => `Stores decoded legacy exact ${spec.family} snapshot overrides inside Product Core source state for remaining non-reconstructable ${spec.family} sources.`,
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
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead algorithm/envelope fields, and this bounded override count reconstruct generated-endpoint custom Lead patches without full exact arrays.',
  ),
  leadStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.lead_override_indices[0..79]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Identifies which generated Lead runtime params are overridden by the bounded sparse Lead override payload.',
    'Generated Lead preset endpoint IDs, morph, source distance, and structured Lead fields reconstruct the base patch; these indices identify only the differing user controls.',
  ),
  leadStructuredOverrideEntry(
    'KesshoProductSourceSnapshot.lead_override_values[0..79]',
    'cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h and cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
    'Carries bounded sparse Lead user override values across the Product snapshot ABI.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead fields, and these values reconstruct generated-endpoint custom Lead patches without full exact arrays.',
  ),
  leadStructuredOverrideEntry(
    'ProductSourceSnapshot.leadOverrideCount',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts',
    'Web snapshot serialization emits only the number of Lead controls that differ from generated endpoint reconstruction.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead fields, and this bounded override count reconstruct generated-endpoint custom Lead patches.',
  ),
  leadStructuredOverrideEntry(
    'ProductSourceSnapshot.leadOverrideIndices[0..79]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts',
    'Web snapshot serialization identifies the sparse Lead controls that differ from generated endpoint reconstruction.',
    'Generated Lead preset endpoint IDs, morph, source distance, and structured Lead fields reconstruct the base patch; these indices identify only the differing user controls.',
  ),
  leadStructuredOverrideEntry(
    'ProductSourceSnapshot.leadOverrideValues[0..79]',
    'src/audio/coreProductSnapshot.ts and src/audio/CoreProductLeadPatch.ts',
    'Web snapshot serialization carries bounded sparse Lead values instead of full exact Lead arrays for generated-endpoint custom controls.',
    'Generated Lead preset endpoint IDs, morph, source distance, structured Lead fields, and these values reconstruct generated-endpoint custom Lead patches.',
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
      'A generated-endpoint Pad source with exact_pad_param_count = 0 and bounded pad_override_* fields loads and triggers without promoting SourceState back to exact Pad patch state.',
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
      'A generated-endpoint Lead source with exact_lead_param_count = 0 and bounded lead_override_* fields loads and triggers without promoting SourceState back to exact Lead patch state.',
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
      'A generated-voice Drum source with exact_drum_param_count = 0 and bounded drum_override_* fields loads and triggers without promoting SourceState back to exact Drum patch state.',
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
  {
    id: 'runtime-param-events-use-structured-overrides',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Runtime generated Pad, Lead, and Drum SetParam events for reconstructable sources update bounded sparse override state and live module patches without promoting SourceState back to exact patch state.',
    canonicalInputs: [
      'KesshoProductEvent.kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM',
      'generated Pad/Lead/Drum runtime param IDs',
      'SourceState exact_*_param_count = 0',
      'generated endpoint or voice-preset source state',
      'bounded *_override_count/index/value storage',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
      'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requireRuntimeParamEventsUseStructuredOverrides',
  },
  {
    id: 'partial-exact-patch-fallbacks-are-rejected',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Partial exact patch counts are rejected as invalid state instead of being completed into full compatibility arrays at runtime.',
    canonicalInputs: [
      'KesshoProductSourceSnapshot.exact_*_param_count',
      'SourceState.exact_*_param_count',
      'generated Pad/Lead/Drum runtime param IDs',
    ],
    proofSurfaces: [
      'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
      'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
      'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
    ],
    testEntrypoint: 'requirePartialExactPatchFallbacksAreRejected',
  },
  {
    id: 'invalid-exact-patch-fallbacks-are-rejected',
    sourceFamily: 'Pad/Lead/Drum',
    claim:
      'Legacy exact patch arrays are accepted only on their owning source family with complete finite payloads; wrong-family, oversized, or non-finite exact bridge fields are rejected instead of clamped, ignored, or zero-filled.',
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
const webLeadPatch = read('src/audio/CoreProductLeadPatch.ts');
const webPadPatch = read('src/audio/CoreProductPadPatch.ts');
const webDrumPatch = read('src/audio/CoreProductDrumPatch.ts');
const webSnapshotEncoder = read('src/audio/coreProductSnapshotEncoder.ts');
const webPresetIds = read('src/audio/CoreProductPresetIds.ts');
const webPatchBridgeSurface = `${webSnapshot}\n${webLeadPatch}\n${webPadPatch}\n${webDrumPatch}`;
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
    webDrumPatch.includes('DRUM_PARAM_MASTER_LEVEL') &&
    webDrumPatch.includes('DRUM_PARAM_REVERB_SEND') &&
    webDrumPatch.includes('exactDrumParamCount: 0') &&
    webDrumPatch.includes('drumOverrideCount') &&
    webDrumPatch.includes('drumOverrideIndices') &&
    webDrumPatch.includes('drumOverrideValues') &&
    webDrumPatch.includes('KESSHO_PRODUCT_DRUM_PARAM_COUNT') &&
    !webDrumPatch.includes('if (!presetA || !presetB) continue'),
  'Web Product snapshot must use bounded Drum override fields only when generated Drum preset IDs, morphs, source level, and source reverb send reconstruct the patch; invalid voice preset IDs must emit no exact or sparse patch payload',
);
assert(
  webSnapshot.includes('exactPadPatchFromState(') &&
    webPadPatch.includes('function exactPadPatchFromState') &&
    webPadPatch.includes('if (!canReconstructGeneratedPadParams(presetAId, presetBId))') &&
    webPadPatch.includes('applyPadDistanceParams') &&
    webPadPatch.includes('exactPadParamCount: 0') &&
    webPadPatch.includes('padOverrideCount') &&
    webPadPatch.includes('padOverrideIndices') &&
    webPadPatch.includes('padOverrideValues') &&
    webPadPatch.includes('KESSHO_PRODUCT_PAD_PARAM_COUNT') &&
    webPadPatch.includes('matchesSelectedPadEndpointStateCacheParams') &&
    !webPadPatch.includes('matchesGeneratedPadStateCacheParams') &&
    !webPadPatch.includes('exactPadParamCount: KESSHO_PRODUCT_PAD_PARAM_COUNT'),
  'Web Product snapshot must use bounded Pad override fields when generated Pad preset endpoint IDs reconstruct the patch, must limit cache suppression to documented selected/default endpoint state, and must not emit exact Pad fallback arrays for invalid endpoints',
);
assert(
  webSnapshot.includes('exactLeadPatchFromState(') &&
    webLeadPatch.includes('function exactLeadPatchFromState') &&
    webLeadPatch.includes('if (!canReconstruct)') &&
    webLeadPatch.includes('leadEnvelopeOverrideFromState') &&
    webLeadPatch.includes('leadAlgorithmPresetAEnabledFromState') &&
    webLeadPatch.includes('applyLeadDistanceParams') &&
    webSnapshot.includes('function generatedLeadAnchorPresetId') &&
    webSnapshot.includes('hasLeadCustomPresetData(state, leadIndex)') &&
    webSnapshot.includes('assignLeadAlgorithmOverrideFields') &&
    webSnapshot.includes('assignLeadEnvelopeOverrideFields') &&
    webLeadPatch.includes('exactLeadParamCount: 0') &&
    webLeadPatch.includes('leadOverrideCount') &&
    webLeadPatch.includes('leadOverrideIndices') &&
    webLeadPatch.includes('leadOverrideValues') &&
    webLeadPatch.includes('KESSHO_PRODUCT_LEAD_PARAM_COUNT') &&
    !webLeadPatch.includes('exactLeadParamCount: KESSHO_PRODUCT_LEAD_PARAM_COUNT') &&
    !webSnapshot.includes('source.sourcePresetAId = 0;\n    source.sourcePresetBId = 0'),
  'Web Product snapshot must use bounded Lead override fields when generated Lead preset endpoint IDs or custom Lead anchors reconstruct the patch and must not emit exact Lead fallback arrays for invalid or custom endpoints',
);
assert(
  webSnapshotEncoder.includes('validateExactBridge') &&
    webSnapshotEncoder.includes('validateSparseOverride') &&
    webSnapshotEncoder.includes('exactCount !== 0 && count !== 0') &&
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
  assert(generator.includes(token), `Generator must remain the only source of generated exact patch arrays: ${token}`);
}
for (const token of [
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
  'pad_override_count',
  'pad_override_indices',
  'pad_override_values',
  'exact_lead_param_count',
  'exact_lead_params',
  'lead_override_count',
  'lead_override_indices',
  'lead_override_values',
  'exact_drum_param_count',
  'exact_drum_params',
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
  assert(sourceState.includes(token), `SourceState exact patch bridge field missing expected policy coverage token: ${token}`);
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
    productSnapshot.includes('exact_pad_param_count = 0u') &&
    productSnapshot.includes('exact_drum_param_count = 0u'),
  'Snapshot loader must load dedicated Soundscape snapshot fields and clear overloaded exact Pad/Drum bridge fields',
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
const productPresetBridge = read('cpp/KesshoCore/src/product/ProductPresetBridge.h');
const sourcePresetBridge = read('cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp');
const productSources = read('cpp/KesshoCore/src/product/sources/ProductSources.cpp');
const productEvents = read('cpp/KesshoCore/src/product/KesshoProductEvents.cpp');
const productEngine = read('cpp/KesshoCore/src/product/KesshoProductEngine.cpp');
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
for (const [surface, source] of [
  ['snapshot loader', productSnapshot],
  ['trigger allocator', sourceVoiceAllocator],
]) {
  assert(
    source.includes('applyDrumSourceMixFieldsToPatch'),
    `Drum ${surface} must apply structured source level/reverb to exact Drum patches`,
  );
}
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
  productSnapshot.includes('validDrumExactParamCount') &&
    productEvents.includes('source.exact_pad_param_count != kProductPadRuntimeParamCount') &&
    productEvents.includes('source.exact_lead_param_count != kProductLeadRuntimeParamCount') &&
    productEvents.includes('source.exact_drum_param_count != kProductDrumRuntimeParamCount'),
  'Product source exact fallback must reject partial exact patch state instead of promoting it',
);
assert(
  productSnapshot.includes('validSparseOverrideBlock') &&
    productSnapshot.includes('source.exact_pad_param_count != 0u && source.pad_override_count != 0u') &&
    productSnapshot.includes('source.exact_lead_param_count != 0u && source.lead_override_count != 0u') &&
    productSnapshot.includes('source.exact_drum_param_count != 0u && source.drum_override_count != 0u') &&
    productSnapshot.includes('indices[slot] >= param_count || !std::isfinite(values[slot])') &&
    !productSnapshot.includes('source.pad_override_count,\n              kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT') &&
    !productSnapshot.includes('source.lead_override_count,\n              kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT') &&
    !productSnapshot.includes('source.drum_override_count,\n              kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT'),
  'Product snapshot loader must reject invalid sparse override blocks instead of clamping counts, indices, or mixed exact/sparse state',
);
assert(
  productSnapshot.includes('validExactParamBlock') &&
    productSnapshot.includes('!pad_source && source.exact_pad_param_count != 0u') &&
    productSnapshot.includes('!lead_source && source.exact_lead_param_count != 0u') &&
    productSnapshot.includes('!drum_source && source.exact_drum_param_count != 0u') &&
    productSnapshot.includes('!std::isfinite(values[slot])') &&
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
    productSnapshot.includes('generatedPadEndpointIdsValidIfPresent') &&
    productSnapshot.includes('generatedLeadEndpointIdsValidIfPresent') &&
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
  sourceWrapperTests.includes('requireDrumVoicePresetIdsReconstructExactDrumPatch'),
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
