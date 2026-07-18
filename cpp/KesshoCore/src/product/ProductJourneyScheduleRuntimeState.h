#pragma once

#include <cstdint>

#include "ProductSceneProgramRuntimeState.h"

namespace kessho::product::internal {

constexpr uint32_t kProductJourneyMaxEntries = 512u;
constexpr uint32_t kProductJourneyMaxPrograms = 20u;
constexpr uint32_t kProductJourneyNoIndex = 0xffffffffu;
constexpr uint32_t kProductJourneyNoProgram = 0xffffu;

enum class ProductJourneyPhase : uint32_t {
  Off = 0u,
  Hold = 1u,
  Morph = 2u,
  FinalHold = 3u,
};

struct ProductJourneyScheduleEntry {
  uint64_t hold_frames = 0u;
  uint64_t morph_frames = 0u;
  uint16_t transition_program_index = kProductJourneyNoProgram;
  uint8_t from_node_index = 0u;
  uint8_t to_node_index = 0u;
  uint32_t flags = 0u;
  bool hold_set = false;
  bool morph_set = false;
};

struct ProductJourneyTransitionProgram {
  ProductSceneEntry entries[kProductSceneMaxEntries]{};
  ProductSceneCommand commands[kProductSceneMaxCommands]{};
  uint32_t entry_count = 0u;
  uint32_t command_count = 0u;
  uint32_t revision = 0u;
  bool upload_open = false;
  bool committed = false;
};

struct ProductJourneyScheduleBuffer {
  ProductJourneyScheduleEntry entries[kProductJourneyMaxEntries]{};
  ProductJourneyTransitionProgram programs[kProductJourneyMaxPrograms]{};
  uint32_t entry_count = 0u;
  uint32_t program_count = 0u;
  uint32_t loop_start_index = kProductJourneyNoIndex;
  uint32_t revision = 0u;
  uint32_t rng_state_after_plan = 0u;
  uint64_t prepared_total_frames = 0u;
  bool upload_open = false;
};

struct ProductJourneyScheduleRuntimeState {
  ProductJourneyScheduleBuffer buffers[2]{};
  uint32_t active_buffer = 0u;
  uint32_t staging_buffer = 1u;
  uint32_t schedule_index = 0u;
  uint32_t active_program_index = kProductJourneyNoIndex;
  uint32_t transition_count = 0u;
  uint32_t scene_position_step = 0u;
  uint64_t phase_start_frame = 0u;
  uint64_t phase_end_frame = 0u;
  uint64_t next_scene_apply_frame = 0u;
  float scene_position = 0.0f;
  float previous_scene_position = 0.0f;
  ProductJourneyPhase phase = ProductJourneyPhase::Off;
  bool active = false;
  bool running = false;
  bool scene_apply_pending = false;
  bool program_changed = false;
};

} // namespace kessho::product::internal
