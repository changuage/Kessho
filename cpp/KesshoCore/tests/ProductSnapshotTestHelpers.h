#pragma once

#include <cstdint>

#include "../src/product/KesshoProductEngineInternal.h"

namespace kessho::product::tests {

inline void applyGeneratedSourcePreset(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t preset_id) {
  using namespace kessho::product::internal;
  if (source_id < 1u || source_id > 7u) {
    return;
  }
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.source_id = source_id;
  source.preset_id = preset_id;
  const auto patch = sourcePresetPatch(findSourcePreset(preset_id));
  if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
    source.exact_pad_param_count = patch.exact_pad_param_count;
    for (uint32_t index = 0; index < source.exact_pad_param_count; ++index) {
      source.exact_pad_params[index] = patch.exact_pad_params[index];
    }
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    source.exact_lead_param_count = patch.exact_lead_param_count;
    for (uint32_t index = 0; index < source.exact_lead_param_count; ++index) {
      source.exact_lead_params[index] = patch.exact_lead_params[index];
    }
  }
}

inline void applyGeneratedSourceDefaults(KesshoProductSnapshotV2& snapshot) {
  using namespace kessho::product::internal;
  for (uint32_t index = 0; index < 7u; ++index) {
    const uint32_t source_id = index + 1u;
    const uint32_t preset_id = snapshot.sources[index].preset_id == 0u
        ? defaultSourcePresetId(source_id)
        : snapshot.sources[index].preset_id;
    applyGeneratedSourcePreset(snapshot, source_id, preset_id);
  }
}

} // namespace kessho::product::tests
