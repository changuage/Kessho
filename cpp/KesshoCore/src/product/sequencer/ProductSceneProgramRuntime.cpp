#include "../KesshoProductEngineInternal.h"

#include <cmath>

namespace {

using namespace kessho::product::internal;

float sceneValue(const ProductSceneEntry& entry, float position) {
  const float t = std::clamp(position, 0.0f, 1.0f);
  switch (entry.interpolation) {
    case ProductSceneInterpolation::Logarithmic:
      if (entry.value_a > 0.0f && entry.value_b > 0.0f) {
        return std::exp(std::log(entry.value_a) + (std::log(entry.value_b) - std::log(entry.value_a)) * t);
      }
      return entry.value_a + (entry.value_b - entry.value_a) * t;
    case ProductSceneInterpolation::DiscreteA:
      return t < entry.threshold ? entry.value_a : entry.value_b;
    case ProductSceneInterpolation::DiscreteB:
      return t <= entry.threshold ? entry.value_a : entry.value_b;
    case ProductSceneInterpolation::EnableGate:
      if (entry.value_a < 0.5f && entry.value_b >= 0.5f) return t > 0.0f ? entry.value_b : entry.value_a;
      if (entry.value_a >= 0.5f && entry.value_b < 0.5f) return t < 1.0f ? entry.value_a : entry.value_b;
      return t < entry.threshold ? entry.value_a : entry.value_b;
    case ProductSceneInterpolation::Linear:
    default:
      return entry.value_a + (entry.value_b - entry.value_a) * t;
  }
}

bool sceneValueChanged(float previous, float next) {
  const float epsilon = std::max(1.0e-6f, std::max(std::fabs(previous), std::fabs(next)) * 1.0e-6f);
  return std::fabs(previous - next) > epsilon;
}

template <typename Program>
bool applySourceLevelEntriesAsBatch(
    KesshoProductEngine& engine,
    Program& active,
    float position) {
  if (active.entry_count < 2u) return false;

  // Scene uploads commonly contain repeated source-level entries when a
  // snapshot expands a parameter group. Only the final value for each source
  // is observable after the block's scene update, so collapse that case to
  // one control event per source while retaining each entry's change cache.
  float final_values[kSourceCount]{};
  bool final_changed[kSourceCount]{};
  for (uint32_t index = 0u; index < active.entry_count; ++index) {
    ProductSceneEntry& entry = active.entries[index];
    if (entry.event_kind != KESSHO_PRODUCT_EVENT_KIND_SET_PARAM ||
        entry.param_id != KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID ||
        entry.target_id < 1u || entry.target_id > kSourceCount) {
      return false;
    }
    const float value = sceneValue(entry, position);
    final_values[entry.target_id - 1u] = value;
    final_changed[entry.target_id - 1u] = !entry.applied ||
        sceneValueChanged(entry.last_applied_value, value);
    entry.last_applied_value = value;
    entry.applied = true;
  }

  for (uint32_t source_index = 0u; source_index < kSourceCount; ++source_index) {
    if (!final_changed[source_index]) continue;
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.target_id = source_index + 1u;
    event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
    event.value = final_values[source_index];
    engine.applyControlEvent(event);
  }
  return true;
}

template <typename Program>
void applySceneProgram(
    KesshoProductEngine& engine,
    Program& active,
    float previous,
    float position,
    bool program_changed) {
  if (!applySourceLevelEntriesAsBatch(engine, active, position)) {
    for (uint32_t index = 0u; index < active.entry_count; ++index) {
      ProductSceneEntry& entry = active.entries[index];
      const float value = sceneValue(entry, position);
      if (entry.applied && !sceneValueChanged(entry.last_applied_value, value)) continue;
      KesshoProductEvent event{};
      event.event_kind = entry.event_kind;
      event.target_id = entry.target_id;
      event.index = entry.index;
      event.param_id = entry.param_id;
      event.value = value;
      engine.applyControlEvent(event);
      entry.last_applied_value = value;
      entry.applied = true;
    }
  }
  const bool forward = position > previous;
  const bool reverse = position < previous;
  for (uint32_t index = 0u; index < active.command_count; ++index) {
    const ProductSceneCommand& command = active.commands[index];
    const bool establish_side = program_changed && (
        (position >= command.threshold && (command.direction_mask & ProductSceneCommandForward) != 0u) ||
        (position < command.threshold && (command.direction_mask & ProductSceneCommandReverse) != 0u));
    const bool crossed_forward = forward && previous < command.threshold && position >= command.threshold;
    const bool crossed_reverse = reverse && previous >= command.threshold && position < command.threshold;
    if (establish_side ||
        (crossed_forward && (command.direction_mask & ProductSceneCommandForward) != 0u) ||
        (crossed_reverse && (command.direction_mask & ProductSceneCommandReverse) != 0u)) {
      engine.applyControlEvent(command.event);
    }
  }
}

} // namespace

void KesshoProductEngine::beginSceneProgram(const KesshoProductEvent& event) {
  ProductSceneProgramBuffer& staging = scene_program_runtime.buffers[scene_program_runtime.staging_buffer];
  staging = {};
  staging.entry_count = static_cast<uint32_t>(std::lround(event.value));
  staging.command_count = static_cast<uint32_t>(std::lround(event.value2));
  staging.revision = static_cast<uint32_t>(std::lround(event.value3));
  staging.upload_open = true;
}

void KesshoProductEngine::setSceneProgramEntry(const KesshoProductEvent& event) {
  ProductSceneProgramBuffer& staging = scene_program_runtime.buffers[scene_program_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.entry_count) return;
  ProductSceneEntry& entry = staging.entries[event.index];
  entry.event_kind = static_cast<uint32_t>(std::lround(event.value4));
  entry.target_id = event.target_id;
  entry.index = event.flags >> KESSHO_PRODUCT_SCENE_ENTRY_INDEX_SHIFT;
  entry.param_id = event.param_id;
  entry.value_a = event.value;
  entry.value_b = event.value2;
  entry.threshold = std::clamp(event.value3, 0.0f, 1.0f);
  entry.interpolation = static_cast<ProductSceneInterpolation>(event.flags & KESSHO_PRODUCT_SCENE_INTERPOLATION_MASK);
  entry.applied = false;
}

void KesshoProductEngine::setSceneProgramCommandHeader(const KesshoProductEvent& event) {
  ProductSceneProgramBuffer& staging = scene_program_runtime.buffers[scene_program_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.command_count) return;
  ProductSceneCommand& command = staging.commands[event.index];
  command.event.event_kind = static_cast<uint32_t>(std::lround(event.value3));
  command.event.target_id = event.target_id;
  command.event.index = static_cast<uint32_t>(std::lround(event.value));
  command.event.param_id = event.param_id;
  command.event.flags = event.flags;
  command.threshold = std::clamp(event.value2, 0.0f, 1.0f);
  command.direction_mask = static_cast<uint32_t>(std::lround(event.value4));
  command.header_set = true;
}

void KesshoProductEngine::setSceneProgramCommandValues(const KesshoProductEvent& event) {
  ProductSceneProgramBuffer& staging = scene_program_runtime.buffers[scene_program_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.command_count) return;
  ProductSceneCommand& command = staging.commands[event.index];
  command.event.value = event.value;
  command.event.value2 = event.value2;
  command.event.value3 = event.value3;
  command.event.value4 = event.value4;
  command.values_set = true;
}

void KesshoProductEngine::commitSceneProgram() {
  ProductSceneProgramBuffer& staging = scene_program_runtime.buffers[scene_program_runtime.staging_buffer];
  if (!staging.upload_open) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  for (uint32_t index = 0u; index < staging.entry_count; ++index) {
    const ProductSceneEntry& entry = staging.entries[index];
    if (entry.event_kind != KESSHO_PRODUCT_EVENT_KIND_SET_PARAM &&
        entry.event_kind != KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  for (uint32_t index = 0u; index < staging.command_count; ++index) {
    if (!staging.commands[index].header_set || !staging.commands[index].values_set) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  staging.upload_open = false;
  std::swap(scene_program_runtime.active_buffer, scene_program_runtime.staging_buffer);
  scene_program_runtime.active = true;
  scene_program_runtime.previous_position = scene_program_runtime.position;
  scene_program_runtime.position_dirty = true;
  scene_program_runtime.program_changed = true;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::setSceneProgramPosition(float position) {
  constexpr float kScenePositionSteps = 100.0f;
  const float next = std::round(std::clamp(position, 0.0f, 1.0f) * kScenePositionSteps) /
      kScenePositionSteps;
  if (next == scene_program_runtime.position && !scene_program_runtime.position_dirty) return;
  scene_program_runtime.previous_position = scene_program_runtime.position;
  scene_program_runtime.position = next;
  scene_program_runtime.position_dirty = true;
}

void KesshoProductEngine::scheduleSceneRuntimeEvents() {
  ProductJourneyScheduleRuntimeState& journey = journey_schedule_runtime;
  if (journey.scene_apply_pending && journey.active_program_index < kProductJourneyMaxPrograms) {
    ProductJourneyScheduleBuffer& schedule = journey.buffers[journey.active_buffer];
    if (journey.active_program_index < schedule.program_count) {
      applySceneProgram(
          *this,
          schedule.programs[journey.active_program_index],
          journey.previous_scene_position,
          journey.scene_position,
          journey.program_changed);
    }
    journey.previous_scene_position = journey.scene_position;
    journey.scene_apply_pending = false;
    journey.program_changed = false;
    return;
  }
  if (!scene_program_runtime.active || !scene_program_runtime.position_dirty) return;
  ProductSceneProgramBuffer& active = scene_program_runtime.buffers[scene_program_runtime.active_buffer];
  const float previous = scene_program_runtime.previous_position;
  const float position = scene_program_runtime.position;
  const bool program_changed = scene_program_runtime.program_changed;
  applySceneProgram(*this, active, previous, position, program_changed);
  scene_program_runtime.previous_position = position;
  scene_program_runtime.position_dirty = false;
  scene_program_runtime.program_changed = false;
}
