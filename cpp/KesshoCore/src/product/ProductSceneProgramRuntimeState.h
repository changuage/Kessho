#pragma once

#include <cstdint>

#include "KesshoCore/KesshoProductEvents.h"
#include "KesshoProductSceneCapacities.h"

namespace kessho::product::internal {

constexpr uint32_t kProductSceneMaxEntries = generated::KESSHO_PRODUCT_SCENE_MAX_ENTRIES;
constexpr uint32_t kProductSceneMaxCommands = generated::KESSHO_PRODUCT_SCENE_MAX_COMMANDS;

enum class ProductSceneInterpolation : uint32_t {
  Linear = 0u,
  Logarithmic = 1u,
  DiscreteA = 2u,
  DiscreteB = 3u,
  EnableGate = 4u,
};

enum ProductSceneCommandDirection : uint32_t {
  ProductSceneCommandForward = 1u,
  ProductSceneCommandReverse = 2u,
  ProductSceneCommandBoth = ProductSceneCommandForward | ProductSceneCommandReverse,
};

struct ProductSceneEntry {
  uint32_t event_kind = 0u;
  uint32_t target_id = 0u;
  uint32_t index = 0u;
  uint32_t param_id = 0u;
  float value_a = 0.0f;
  float value_b = 0.0f;
  float threshold = 0.5f;
  ProductSceneInterpolation interpolation = ProductSceneInterpolation::Linear;
  float last_applied_value = 0.0f;
  bool applied = false;
};

struct ProductSceneCommand {
  KesshoProductEvent event{};
  float threshold = 0.5f;
  uint32_t direction_mask = ProductSceneCommandBoth;
  bool header_set = false;
  bool values_set = false;
};

struct ProductSceneProgramBuffer {
  ProductSceneEntry entries[kProductSceneMaxEntries]{};
  ProductSceneCommand commands[kProductSceneMaxCommands]{};
  uint32_t entry_count = 0u;
  uint32_t command_count = 0u;
  uint32_t revision = 0u;
  bool upload_open = false;
};

struct ProductSceneProgramRuntimeState {
  ProductSceneProgramBuffer buffers[2]{};
  uint32_t active_buffer = 0u;
  uint32_t staging_buffer = 1u;
  float position = 0.0f;
  float previous_position = 0.0f;
  bool position_dirty = false;
  bool program_changed = false;
  bool active = false;
};

} // namespace kessho::product::internal
