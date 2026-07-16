#include "../KesshoProductEngineInternal.h"
#include "../generated/SampleLibraryRegistry.generated.h"

namespace {

uint32_t roundedU32(float value, uint32_t fallback) {
  if (!std::isfinite(value)) return fallback;
  const long rounded = std::lround(value);
  return rounded <= 0 ? 0u : static_cast<uint32_t>(rounded);
}

bool generatedSampleLibraryExists(uint32_t id) {
  for (const auto& library : kessho::product::generated::kGeneratedSampleLibraries) {
    if (library.libraryId == id) return true;
  }
  return false;
}

template <typename Selector>
bool generatedSampleDescriptorIdExists(uint32_t id, Selector selector) {
  if (id == 0u) return true;
  for (const auto& descriptor : kessho::product::generated::kGeneratedSampleDescriptors) {
    if (selector(descriptor) == id) return true;
  }
  return false;
}

uint32_t liveSampleLibraryId(float value) {
  const uint32_t id = roundedU32(value, kSampleLibraryPiano);
  return generatedSampleLibraryExists(id) ? id : kSampleLibraryPiano;
}

uint32_t liveSampleRoleId(float value) {
  const uint32_t id = roundedU32(value, kSampleRoleAny);
  return generatedSampleDescriptorIdExists(id, [](const auto& descriptor) {
    return static_cast<uint32_t>(descriptor.roleId);
  }) ? id : kSampleRoleAny;
}

uint32_t liveSampleArticulationId(float value) {
  const uint32_t id = roundedU32(value, kSampleArticulationAny);
  return generatedSampleDescriptorIdExists(id, [](const auto& descriptor) {
    return static_cast<uint32_t>(descriptor.articulationId);
  }) ? id : kSampleArticulationAny;
}

uint32_t liveSampleDynamicId(float value) {
  const uint32_t id = roundedU32(value, kSampleDynamicRegular);
  return generatedSampleDescriptorIdExists(id, [](const auto& descriptor) {
    return static_cast<uint32_t>(descriptor.dynamicId);
  }) ? id : kSampleDynamicRegular;
}

} // namespace

int32_t KesshoProductEngine::applySampleSourceParam(
    const KesshoProductEvent& event, SourceState& source, bool& release_voices) {
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LIBRARY_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ROLE_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ARTICULATION_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_SELECTION_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_DYNAMIC_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_FIXED_DYNAMIC_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LOOP_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_MAX_VOICES_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_VARIANT_MODE_ID:
      break;
    default:
      return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  if (!isSampleProductSource(event.target_id)) return KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LIBRARY_ID_ID: {
      const uint32_t next = liveSampleLibraryId(event.value);
      release_voices = source.sample_library_id != next;
      source.sample_library_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ROLE_ID_ID: {
      const uint32_t next = liveSampleRoleId(event.value);
      release_voices = source.sample_role_id != next;
      source.sample_role_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ARTICULATION_ID_ID: {
      const uint32_t next = liveSampleArticulationId(event.value);
      release_voices = source.sample_articulation_id != next;
      source.sample_articulation_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_SELECTION_MODE_ID: {
      const uint32_t next = clampU32(roundedU32(event.value, KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST), 0u, KESSHO_PRODUCT_SAMPLE_SELECTION_EXACT);
      release_voices = source.sample_selection_mode != next;
      source.sample_selection_mode = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_DYNAMIC_MODE_ID: {
      const uint32_t next = clampU32(roundedU32(event.value, KESSHO_PRODUCT_SAMPLE_DYNAMIC_VELOCITY), 0u, KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY);
      release_voices = source.sample_dynamic_mode != next;
      source.sample_dynamic_mode = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_FIXED_DYNAMIC_ID_ID: {
      const uint32_t next = liveSampleDynamicId(event.value);
      release_voices = source.sample_fixed_dynamic_id != next;
      source.sample_fixed_dynamic_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LOOP_ENABLED_ID: {
      const bool next = event.value >= 0.5f;
      release_voices = source.sample_loop_enabled != next;
      source.sample_loop_enabled = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_MAX_VOICES_ID: {
      const uint32_t next = clampU32(roundedU32(event.value, kSampleDefaultMaxVoices), 1u, 64u);
      release_voices = next < source.sample_max_voices;
      source.sample_max_voices = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_VARIANT_MODE_ID: {
      const uint32_t next = clampU32(roundedU32(event.value, KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE), 0u, KESSHO_PRODUCT_SAMPLE_VARIANT_ROUND_ROBIN);
      release_voices = source.sample_variant_mode != next;
      source.sample_variant_mode = next;
      break;
    }
    default:
      return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  return KESSHO_PRODUCT_OK;
}
