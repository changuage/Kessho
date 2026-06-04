#include "../KesshoProductEngineInternal.h"

bool KesshoProductEngine::activeSequencerMorphForPresetSource(
    uint32_t source_id,
    uint32_t drum_voice,
    float& morph) const {
  return activeSequencerSourceFieldForPresetSource(
      source_id,
      drum_voice,
      KESSHO_PRODUCT_STEP_FIELD_MORPH,
      morph);
}

bool KesshoProductEngine::activeSequencerDistanceForPresetSource(
    uint32_t source_id,
    uint32_t drum_voice,
    float& distance) const {
  return activeSequencerSourceFieldForPresetSource(
      source_id,
      drum_voice,
      KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
      distance);
}

bool KesshoProductEngine::activeSequencerExpressionForPresetSource(
    uint32_t source_id,
    uint32_t drum_voice,
    float& expression) const {
  return activeSequencerSourceFieldForPresetSource(
      source_id,
      drum_voice,
      KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
      expression);
}
