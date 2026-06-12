#include "../KesshoProductEngineInternal.h"

namespace {

bool sourceStructuredOverrideAnchorMatchesEndpoint(const SourceState& source, float endpoint_morph) {
  return source.structured_override_morph_anchor_enabled &&
      std::fabs(clampFloat(source.structured_override_morph_anchor, 0.0f, 1.0f) - endpoint_morph) <= 0.001f;
}

} // namespace

void KesshoProductEngine::clearEndpointStructuredOverridesForPresetChange(
    SourceState& source,
    uint32_t source_id,
    uint32_t endpoint_index) {
  const float changed_endpoint_morph = endpoint_index == 1u ? 0.0f : 1.0f;
  if (isPadProductSource(source_id)) {
    if (source.pad_override_count == 0u) return;
    if (source.structured_override_morph_anchor_enabled &&
        !sourceStructuredOverrideAnchorMatchesEndpoint(source, changed_endpoint_morph)) {
      return;
    }
    source.pad_override_count = 0u;
    for (uint32_t slot = 0u; slot < kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT; ++slot) {
      source.pad_override_indices[slot] = 0u;
      source.pad_override_values[slot] = 0.0f;
    }
    source.structured_override_morph_anchor_enabled = false;
    source.structured_override_morph_anchor = source.morph;
    return;
  }
  if (isLeadProductSource(source_id)) {
    if (source.lead_override_count == 0u) return;
    if (source.structured_override_morph_anchor_enabled &&
        !sourceStructuredOverrideAnchorMatchesEndpoint(source, changed_endpoint_morph)) {
      return;
    }
    source.lead_override_count = 0u;
    for (uint32_t slot = 0u; slot < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++slot) {
      source.lead_override_indices[slot] = 0u;
      source.lead_override_values[slot] = 0.0f;
    }
    source.structured_override_morph_anchor_enabled = false;
    source.structured_override_morph_anchor = source.morph;
  }
}
