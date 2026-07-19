#include "KesshoProductEngineInternal.h"
extern "C" {

int32_t kessho_product_debug_render_events(
    KesshoProductEngine* engine,
    KesshoSequencerEvent* out_events,
    uint32_t max_event_count, uint32_t frames) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if (out_events == nullptr && max_event_count > 0u) return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  engine->advanceModulationRanges(frames);
  engine->sortControlEvents();
  uint32_t control_index = 0;
  uint32_t copied_count = 0u;
  uint32_t generated_count = 0u;
  uint32_t cursor = 0u;
  while (cursor < frames) {
    while (
        control_index < engine->control_event_count &&
        engine->control_events[control_index].event.sample_offset == cursor) {
      engine->applyControlEvent(engine->control_events[control_index].event);
      ++control_index;
    }
    engine->applyPendingTransportTransition();
    engine->applyPendingSequencerAudibilityTransitions();
    engine->advanceHarmonyClock();
    uint32_t control_segment_end = frames;
    if (control_index < engine->control_event_count) {
      control_segment_end = std::min(control_segment_end, engine->control_events[control_index].event.sample_offset);
    }
    if (engine->transport.transition_pending &&
        engine->transport.pending_apply_frame > engine->transport.sample_frame) {
      const uint64_t frames_until_transition =
          engine->transport.pending_apply_frame - engine->transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_transition, frames - cursor)));
    }
    if (engine->pending_phrase_timing_event_count > 0u &&
        engine->pending_phrase_timing_apply_frame > engine->transport.sample_frame) {
      const uint64_t frames_until_timing =
          engine->pending_phrase_timing_apply_frame - engine->transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_timing, frames - cursor)));
    }
    const uint64_t next_audibility_frame = engine->nextPendingSequencerAudibilityFrame();
    if (next_audibility_frame != UINT64_MAX && next_audibility_frame > engine->transport.sample_frame) {
      const uint64_t frames_until_audibility = next_audibility_frame - engine->transport.sample_frame;
      control_segment_end = std::min<uint32_t>(
          control_segment_end,
          cursor + static_cast<uint32_t>(std::min<uint64_t>(frames_until_audibility, frames - cursor)));
    }
    if (control_segment_end <= cursor) {
      control_segment_end = cursor + 1u;
    }
    const uint32_t control_segment_frames = control_segment_end - cursor;
    engine->generateSequencerEvents(control_segment_frames, true);
    generated_count += engine->sequencer_events.count;
    const uint32_t available = max_event_count > copied_count ? max_event_count - copied_count : 0u;
    const uint32_t copy_count = std::min<uint32_t>(engine->sequencer_events.count, available);
    for (uint32_t i = 0; i < copy_count; ++i) {
      out_events[copied_count + i] = engine->sequencer_events.events[i];
      out_events[copied_count + i].sample_offset += cursor;
    }
    copied_count += copy_count;
    if (engine->transport.running) {
      engine->transport.sample_frame += control_segment_frames;
    }
    cursor = control_segment_end;
  }
  engine->sequencer_events.count = std::min<uint32_t>(
      generated_count,
      kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS);
  engine->compactControlEvents(frames, control_index);
  engine->updateTelemetry(frames);
  return static_cast<int32_t>(copied_count);
}

} // extern "C"
