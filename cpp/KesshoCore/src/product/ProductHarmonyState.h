#pragma once

#include "../../generated/KesshoProductSchema.h"
#include "ProductHarmonyAuthorityState.h"
#include "ProductMath.h"

namespace kessho::product::internal {

struct HarmonyState : HarmonyAuthorityState {
  float root_midi = 60.0f;
  uint32_t scale_id = 1;
  float tension = 0.35f;
  uint32_t chord_mode = 0;
  uint32_t voicing_mode = 0;
  uint32_t control_mode = 0;
  uint32_t control_strength = 0;
  uint32_t active_source = 0;
  int32_t active_slot_id = -1;
  int32_t active_step_index = -1;
  bool manual_control_available = true;
  uint32_t note_pool_count = 0;
  float note_pool_midi[8]{};
  float bass_midi = -1.0f;
  uint32_t next_note_pool_count = 0;
  float next_note_pool_midi[8]{};
  uint32_t next_source = 0;
  int32_t next_step_index = -1;
  uint32_t chord_degree = 0;
  float chord_midi[4] = {60.0f, 64.0f, 67.0f, 72.0f};
  float chord_interval_seconds = 0.0f;
  uint64_t next_harmony_frame = UINT64_MAX;
  uint64_t harmony_tick_index = 0u;
  uint64_t progression_phrase_index = 0u;
  uint32_t chord_sub_tick = 0u;
  uint32_t harmony_rng_state = 1u;
  char seed_material[128]{};
  uint64_t next_phrase_index = 1u;
  uint64_t next_progression_phrase_index = 1u;
  float phrase_length_seconds = 16.0f;
  float progression_phrase_seconds = 16.0f;
  float voicing_spread = 0.5f;
  float requested_voicing_spread = 0.5f;
  float detune_cents = 8.0f;
  uint32_t scale_mode = 0u;
  uint32_t phrases_until_change = 1u;
  int32_t current_degree = 0;
  bool progression_enabled = false;
  int32_t progression_pattern[8]{};
  uint32_t progression_step_enabled_mask = 0xffu;
  uint32_t progression_steps = 4u;
  uint32_t progression_step = 0u;
  uint32_t progression_phrase_multiplier = 1u;
  uint32_t progression_phrase_counter = 0u;
  uint32_t tension_arc_type = 0u;
  uint32_t tension_arc_phrases_remaining = 0u;
  bool cof_enabled = false;
  int32_t cof_current_step = 0;
  uint32_t cof_phrase_counter = 0u;
  int32_t cof_home_root = 4;
  uint32_t cof_drift_rate = 2u;
  uint32_t cof_drift_direction = 0u;
  uint32_t cof_drift_range = 3u;
  bool canonical_progression_present = false;
  bool canonical_progression_enabled = false;
  uint32_t canonical_progression_event_count = 1u;
  uint32_t canonical_progression_current_event = 0u;
  uint32_t canonical_progression_bars_per_phrase = 4u;
  uint32_t canonical_progression_source[64]{};
  uint32_t canonical_progression_slot_id[64]{};
  uint32_t canonical_progression_duration_unit[64]{};
  uint32_t canonical_progression_duration_value[64]{};

};

uint32_t buildSemanticHarmonyVoicing(
    const HarmonyState& harmony,
    const HarmonyIntentRecipe& recipe,
    float root_midi,
    float* output);

} // namespace kessho::product::internal
