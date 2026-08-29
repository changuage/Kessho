#include "../KesshoProductEngineInternal.h"

#include <cmath>
#include <limits>
#include <new>

namespace {

using namespace kessho::product::internal;

uint64_t decodeFrameChunks(const KesshoProductEvent& event) {
  const auto chunk = [](float value) -> uint64_t {
    return static_cast<uint64_t>(std::clamp(std::lround(value), 0l, 65535l));
  };
  return chunk(event.value) |
      (chunk(event.value2) << 16u) |
      (chunk(event.value3) << 32u) |
      (chunk(event.value4) << 48u);
}

uint32_t packedProgramIndex(const KesshoProductEvent& event) {
  return event.index >> 16u;
}

uint32_t packedSlotIndex(const KesshoProductEvent& event) {
  return event.index & 0xffffu;
}

bool addFrames(uint64_t& total, uint64_t value) {
  if (value > std::numeric_limits<uint64_t>::max() - total) return false;
  total += value;
  return true;
}

} // namespace

void KesshoProductEngine::beginJourneySchedule(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  staging.~ProductJourneyScheduleBuffer();
  new (&staging) ProductJourneyScheduleBuffer{};
  staging.entry_count = static_cast<uint32_t>(std::lround(event.value));
  staging.program_count = static_cast<uint32_t>(std::lround(event.value2));
  const uint32_t encoded_loop = static_cast<uint32_t>(std::lround(event.value3));
  staging.loop_start_index = encoded_loop == 0u ? kProductJourneyNoIndex : encoded_loop - 1u;
  staging.revision = event.flags;
  staging.rng_state_after_plan = event.target_id;
  staging.upload_open = staging.entry_count > 0u &&
      staging.entry_count <= kProductJourneyMaxEntries &&
      staging.program_count <= kProductJourneyMaxPrograms;
  if (!staging.upload_open) telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
}

void KesshoProductEngine::setJourneyScheduleEntryHold(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.entry_count) return;
  ProductJourneyScheduleEntry& entry = staging.entries[event.index];
  entry.from_node_index = static_cast<uint8_t>(event.target_id & 0xffu);
  entry.to_node_index = static_cast<uint8_t>((event.target_id >> 8u) & 0xffu);
  entry.transition_program_index = static_cast<uint16_t>(event.param_id & 0xffffu);
  entry.flags = event.flags;
  entry.hold_frames = decodeFrameChunks(event);
  entry.hold_set = true;
}

void KesshoProductEngine::setJourneyScheduleEntryMorph(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.entry_count) return;
  staging.entries[event.index].morph_frames = decodeFrameChunks(event);
  staging.entries[event.index].morph_set = true;
}

void KesshoProductEngine::beginJourneyTransitionProgram(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.program_count) return;
  ProductJourneyTransitionProgram& program = staging.programs[event.index];
  program.~ProductJourneyTransitionProgram();
  new (&program) ProductJourneyTransitionProgram{};
  program.entry_count = static_cast<uint32_t>(std::lround(event.value));
  program.command_count = static_cast<uint32_t>(std::lround(event.value2));
  program.revision = event.flags;
  program.upload_open = program.entry_count <= kProductSceneMaxEntries &&
      program.command_count <= kProductSceneMaxCommands;
}

void KesshoProductEngine::setJourneyTransitionEntry(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  const uint32_t program_index = packedProgramIndex(event);
  const uint32_t slot = packedSlotIndex(event);
  if (!staging.upload_open || program_index >= staging.program_count) return;
  ProductJourneyTransitionProgram& program = staging.programs[program_index];
  if (!program.upload_open || slot >= program.entry_count) return;
  ProductSceneEntry& entry = program.entries[slot];
  entry.event_kind = static_cast<uint32_t>(std::lround(event.value4));
  entry.target_id = event.target_id;
  entry.index = event.flags >> KESSHO_PRODUCT_SCENE_ENTRY_INDEX_SHIFT;
  entry.param_id = event.param_id;
  entry.value_a = event.value;
  entry.value_b = event.value2;
  entry.threshold = std::clamp(event.value3, 0.0f, 1.0f);
  entry.interpolation = static_cast<ProductSceneInterpolation>(event.flags & KESSHO_PRODUCT_SCENE_INTERPOLATION_MASK);
}

void KesshoProductEngine::setJourneyTransitionCommandHeader(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  const uint32_t program_index = packedProgramIndex(event);
  const uint32_t slot = packedSlotIndex(event);
  if (!staging.upload_open || program_index >= staging.program_count) return;
  ProductJourneyTransitionProgram& program = staging.programs[program_index];
  if (!program.upload_open || slot >= program.command_count) return;
  ProductSceneCommand& command = program.commands[slot];
  command.event.event_kind = static_cast<uint32_t>(std::lround(event.value3));
  command.event.target_id = event.target_id;
  command.event.index = static_cast<uint32_t>(std::lround(event.value));
  command.event.param_id = event.param_id;
  command.event.flags = event.flags;
  command.threshold = std::clamp(event.value2, 0.0f, 1.0f);
  command.direction_mask = static_cast<uint32_t>(std::lround(event.value4));
  command.header_set = true;
}

void KesshoProductEngine::setJourneyTransitionCommandValues(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  const uint32_t program_index = packedProgramIndex(event);
  const uint32_t slot = packedSlotIndex(event);
  if (!staging.upload_open || program_index >= staging.program_count) return;
  ProductJourneyTransitionProgram& program = staging.programs[program_index];
  if (!program.upload_open || slot >= program.command_count) return;
  ProductSceneCommand& command = program.commands[slot];
  command.event.value = event.value;
  command.event.value2 = event.value2;
  command.event.value3 = event.value3;
  command.event.value4 = event.value4;
  command.values_set = true;
}

void KesshoProductEngine::commitJourneyTransitionProgram(const KesshoProductEvent& event) {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  if (!staging.upload_open || event.index >= staging.program_count) return;
  ProductJourneyTransitionProgram& program = staging.programs[event.index];
  if (!program.upload_open) return;
  for (uint32_t index = 0u; index < program.entry_count; ++index) {
    const uint32_t kind = program.entries[index].event_kind;
    if (kind != KESSHO_PRODUCT_EVENT_KIND_SET_PARAM && kind != KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  for (uint32_t index = 0u; index < program.command_count; ++index) {
    if (!program.commands[index].header_set || !program.commands[index].values_set) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  program.upload_open = false;
  program.committed = true;
}

void KesshoProductEngine::commitJourneySchedule() {
  ProductJourneyScheduleBuffer& staging = journey_schedule_runtime.buffers[journey_schedule_runtime.staging_buffer];
  if (!staging.upload_open) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  for (uint32_t index = 0u; index < staging.program_count; ++index) {
    if (!staging.programs[index].committed) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  uint64_t total = 0u;
  for (uint32_t index = 0u; index < staging.entry_count; ++index) {
    const ProductJourneyScheduleEntry& entry = staging.entries[index];
    if (!entry.hold_set || !entry.morph_set || entry.hold_frames == 0u ||
        (entry.transition_program_index != kProductJourneyNoProgram && entry.transition_program_index >= staging.program_count) ||
        !addFrames(total, entry.hold_frames) || !addFrames(total, entry.morph_frames)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
    if (index + 1u < staging.entry_count && entry.to_node_index != staging.entries[index + 1u].from_node_index) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  if (staging.loop_start_index != kProductJourneyNoIndex) {
    if (staging.loop_start_index >= staging.entry_count ||
        staging.entries[staging.entry_count - 1u].to_node_index != staging.entries[staging.loop_start_index].from_node_index) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
      return;
    }
  }
  staging.prepared_total_frames = total;
  staging.upload_open = false;
  std::swap(journey_schedule_runtime.active_buffer, journey_schedule_runtime.staging_buffer);
  journey_schedule_runtime.active = true;
  journey_schedule_runtime.running = false;
  journey_schedule_runtime.phase = ProductJourneyPhase::Off;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::setJourneyScheduleEnabled(bool enabled) {
  ProductJourneyScheduleRuntimeState& runtime = journey_schedule_runtime;
  if (!enabled) {
    runtime.running = false;
    runtime.phase = ProductJourneyPhase::Off;
    runtime.scene_apply_pending = false;
    journey_running = false;
    return;
  }
  if (!runtime.active) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  const ProductJourneyScheduleBuffer& active = runtime.buffers[runtime.active_buffer];
  runtime.schedule_index = 0u;
  runtime.active_program_index = kProductJourneyNoIndex;
  runtime.transition_count = 0u;
  runtime.phase = ProductJourneyPhase::Hold;
  runtime.phase_start_frame = transport.sample_frame;
  runtime.phase_end_frame = transport.sample_frame + active.entries[0].hold_frames;
  runtime.scene_position = 0.0f;
  runtime.previous_scene_position = 0.0f;
  runtime.scene_apply_pending = false;
  runtime.program_changed = false;
  runtime.running = true;
  auto_cycle_runtime.enabled = false;
  auto_cycle_runtime.phase = ProductAutoCyclePhase::Off;
  scene_program_runtime.position_dirty = false;
  journey_running = true;
  journey_phase = 0.0f;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::completeJourneySchedule() {
  ProductJourneyScheduleRuntimeState& runtime = journey_schedule_runtime;
  runtime.running = false;
  runtime.phase = ProductJourneyPhase::FinalHold;
  runtime.phase_start_frame = runtime.phase_end_frame;
  runtime.phase_end_frame = std::numeric_limits<uint64_t>::max();
  runtime.scene_apply_pending = false;
  runtime.program_changed = false;
  journey_running = false;
  journey_phase = 1.0f;
}

void KesshoProductEngine::scheduleJourneyRuntime() {
  ProductJourneyScheduleRuntimeState& runtime = journey_schedule_runtime;
  if (!runtime.running || !transport.running) return;
  ProductJourneyScheduleBuffer& active = runtime.buffers[runtime.active_buffer];
  if (runtime.schedule_index >= active.entry_count) return;

  if (runtime.phase == ProductJourneyPhase::Morph && runtime.phase_end_frame > runtime.phase_start_frame) {
    const uint64_t duration = runtime.phase_end_frame - runtime.phase_start_frame;
    const uint64_t elapsed = transport.sample_frame > runtime.phase_start_frame
        ? std::min(transport.sample_frame - runtime.phase_start_frame, duration)
        : 0u;
    const float next_position = static_cast<float>(
        static_cast<double>(elapsed) / static_cast<double>(duration));
    if (next_position != runtime.scene_position) {
      runtime.previous_scene_position = runtime.scene_position;
      runtime.scene_position = next_position;
      runtime.scene_apply_pending = runtime.active_program_index != kProductJourneyNoIndex &&
          runtime.active_program_index != kProductJourneyNoProgram;
    }
    journey_phase = runtime.scene_position;
  }

  for (uint32_t guard = 0u; guard < 4u && transport.sample_frame >= runtime.phase_end_frame; ++guard) {
    ProductJourneyScheduleEntry& entry = active.entries[runtime.schedule_index];
    if (runtime.phase == ProductJourneyPhase::Hold) {
      const bool self_loop = (entry.flags & 1u) != 0u;
      if (!self_loop && entry.morph_frames > 0u) {
        runtime.phase = ProductJourneyPhase::Morph;
        runtime.phase_start_frame = runtime.phase_end_frame;
        runtime.phase_end_frame = runtime.phase_start_frame + entry.morph_frames;
        runtime.active_program_index = entry.transition_program_index;
        runtime.previous_scene_position = 0.0f;
        runtime.scene_position = 0.0f;
        runtime.scene_apply_pending = entry.transition_program_index != kProductJourneyNoProgram;
        runtime.program_changed = runtime.scene_apply_pending;
        journey_phase = 0.0f;
        continue;
      }
    } else if (runtime.phase == ProductJourneyPhase::Morph) {
      runtime.previous_scene_position = runtime.scene_position;
      runtime.scene_position = 1.0f;
      runtime.scene_apply_pending = runtime.active_program_index != kProductJourneyNoIndex &&
          runtime.active_program_index != kProductJourneyNoProgram;
      journey_phase = 1.0f;
    }

    ++runtime.transition_count;
    uint32_t next_index = runtime.schedule_index + 1u;
    if (next_index >= active.entry_count) {
      if (active.loop_start_index == kProductJourneyNoIndex) {
        // Commit the morph endpoint before terminal state clears the pending scene update.
        scheduleSceneRuntimeEvents();
        completeJourneySchedule();
        return;
      }
      next_index = active.loop_start_index;
    }
    runtime.schedule_index = next_index;
    runtime.phase = ProductJourneyPhase::Hold;
    journey_phase = 0.0f;
    runtime.phase_start_frame = runtime.phase_end_frame;
    runtime.phase_end_frame = runtime.phase_start_frame + active.entries[next_index].hold_frames;
  }
}

uint64_t KesshoProductEngine::nextJourneyScheduleFrame() const {
  if (!journey_schedule_runtime.running || !transport.running ||
      journey_schedule_runtime.phase == ProductJourneyPhase::FinalHold) {
    return std::numeric_limits<uint64_t>::max();
  }
  return journey_schedule_runtime.phase_end_frame;
}
