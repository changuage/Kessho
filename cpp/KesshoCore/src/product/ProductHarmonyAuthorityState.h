#pragma once

#include <cstdint>

namespace kessho::product::internal {

struct HarmonyIntentRecipe {
  uint32_t present = 0u;
  uint32_t quality = 0u;
  int32_t inversion = 0;
  float spread = 0.5f;
  uint32_t bass_mode = 0u;
  float bass_note = -1.0f;
  uint32_t extension_mask = 0u;
  uint32_t alteration_mask = 0u;
};

struct HarmonyAuthorityState {
  // Fixed-capacity semantic caches are rebuilt on snapshot/event changes and
  // only indexed from the render/sequencer path.
  uint32_t authority_revision = 0u;
  uint32_t cached_scale_degree_count = 0u;
  uint32_t cached_scale_degree_map[7]{};
  uint32_t cached_recipe_ids[8]{};
  uint32_t slot_playback_behavior[8]{};
  uint32_t slot_intent_present[8]{};
  uint32_t slot_intent_quality[8]{};
  uint32_t slot_intent_root_mode[8]{};
  int32_t slot_intent_degree[8]{};
  float slot_intent_root_note[8]{};
  int32_t slot_intent_inversion[8]{};
  float slot_intent_spread[8]{};
  int32_t slot_intent_octave[8]{};
  uint32_t slot_intent_bass_mode[8]{};
  float slot_intent_bass_note[8]{};
  uint32_t slot_intent_extension_mask[8]{};
  uint32_t slot_intent_alteration_mask[8]{};
  float slot_captured_root_midi[8]{};
  uint32_t slot_captured_scale_id[8]{};
  uint32_t cached_voice_leading_candidate_count = 0u;
  uint32_t cached_voice_leading_candidate_note_counts[8]{};
  float cached_voice_leading_candidates[8][8]{};

  uint32_t takeover_anchor_count = 0u;
  float takeover_anchor_source[12]{};
  float takeover_anchor_target[12]{};
  float takeover_anchor_weight[12]{};
  float takeover_progress = 0.0f;
  float takeover_target_root_midi = 60.0f;
  uint32_t takeover_target_scale_id = 1u;
  uint64_t harmony_play_dispatch_count = 0u;
  uint64_t harmony_play_last_dispatch_frame = 0u;
  float harmony_play_last_dispatch_latency_ms = 0.0f;

  uint32_t morph_endpoint_count = 0u;
  float morph_endpoint_root_midi[2] = {60.0f, 60.0f};
  uint32_t morph_endpoint_scale_id[2] = {1u, 1u};
  float morph_endpoint_tension[2] = {0.35f, 0.35f};
  uint32_t morph_plan_revision = 0u;
  float morph_plan_phase = 0.0f;
  uint32_t morph_plan_slot_playback_behavior[8]{};
  uint32_t morph_common_pair_count = 0u;
  float morph_common_pair_source[8]{};
  float morph_common_pair_target[8]{};
  uint32_t morph_voice_pair_count = 0u;
  float morph_voice_pair_source[8]{};
  float morph_voice_pair_target[8]{};
  uint32_t morph_unmatched_a_count = 0u;
  float morph_unmatched_a[8]{};
  uint32_t morph_unmatched_b_count = 0u;
  float morph_unmatched_b[8]{};
  uint32_t morph_cof_root_path_count = 0u;
  float morph_cof_root_path[13]{};
  uint32_t morph_scale_handover_from = 1u;
  uint32_t morph_scale_handover_to = 1u;
  float morph_scale_handover_at = 0.5f;

  uint32_t live_gesture_revision = 0u;
  uint32_t live_gesture_scope = 0u;
  uint32_t live_gesture_target = 0u;
  uint32_t live_gesture_phase = 0u;
  uint32_t live_gesture_playback_behavior = 0u;
  uint32_t live_gesture_intent_present = 0u;
  uint32_t live_gesture_intent_quality = 0u;
  uint32_t live_gesture_intent_root_mode = 0u;
  int32_t live_gesture_intent_degree = 0;
  float live_gesture_intent_root_note = 0.0f;
  int32_t live_gesture_intent_inversion = 0;
  float live_gesture_intent_spread = 0.5f;
  int32_t live_gesture_intent_octave = 4;
  uint32_t live_gesture_intent_bass_mode = 0u;
  float live_gesture_intent_bass_note = -1.0f;
  uint32_t live_gesture_intent_extension_mask = 0u;
  uint32_t live_gesture_intent_alteration_mask = 0u;
  float live_gesture_captured_root_midi = 60.0f;
  uint32_t live_gesture_captured_scale_id = 1u;
  uint32_t live_gesture_note_count = 0u;
  float live_gesture_notes[8]{};
  uint64_t live_gesture_expires_at_frame = UINT64_MAX;
};

} // namespace kessho::product::internal
