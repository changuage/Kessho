#include "../KesshoProductEngineInternal.h"

float KesshoProductEngine::sourceTransientAuditionGainForFrame(
    SourceState& source,
    uint64_t absolute_frame) {
  if (source.transient_audition_gain_frame == 0u && audio_render_sample_frame > 0u) {
    source.transient_audition_gain_frame = audio_render_sample_frame;
  }
  if (absolute_frame > source.transient_audition_gain_frame &&
      source.transient_audition_gain_ramp_remaining > 0u) {
    const uint64_t elapsed_u64 = absolute_frame - source.transient_audition_gain_frame;
    const uint32_t elapsed = static_cast<uint32_t>(
        std::min<uint64_t>(elapsed_u64, source.transient_audition_gain_ramp_remaining));
    source.transient_audition_gain +=
        source.transient_audition_gain_delta * static_cast<float>(elapsed);
    source.transient_audition_gain_ramp_remaining -= elapsed;
    source.transient_audition_gain_frame += elapsed;
    if (source.transient_audition_gain_ramp_remaining == 0u) {
      source.transient_audition_gain = source.transient_audition_gain_target;
      source.transient_audition_gain_delta = 0.0f;
    }
  }
  const bool active =
      source.transient_audition_hold_count > 0u ||
      absolute_frame < source.transient_audition_until_frame;
  const float target = active ? 1.0f : 0.0f;
  if (target != source.transient_audition_gain_target) {
    const uint32_t ramp_frames = std::max<uint32_t>(
        1u,
        static_cast<uint32_t>(std::ceil(0.003 * sample_rate)));
    source.transient_audition_gain_target = target;
    source.transient_audition_gain_ramp_remaining = ramp_frames;
    source.transient_audition_gain_delta =
        (target - source.transient_audition_gain) / static_cast<float>(ramp_frames);
    source.transient_audition_gain_frame = absolute_frame;
  }
  return clampFloat(source.transient_audition_gain, 0.0f, 1.0f);
}

float KesshoProductEngine::sourceOutputGainForFrame(SourceState& source, uint64_t absolute_frame) {
  const float authored_gain = sourceEnableGainForFrame(source, absolute_frame);
  const float audition_gain = sourceTransientAuditionGainForFrame(source, absolute_frame);
  return std::max(authored_gain, audition_gain);
}

void KesshoProductEngine::retainSourceTransientAudition(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) return;
  SourceState& source = sources[source_id - 1u];
  source.transient_audition_hold_count =
      std::min<uint32_t>(source.transient_audition_hold_count + 1u, kMaxProductMidiNoteSlots);
}

void KesshoProductEngine::releaseSourceTransientAudition(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) return;
  SourceState& source = sources[source_id - 1u];
  if (source.transient_audition_hold_count > 0u) --source.transient_audition_hold_count;
  if (source.transient_audition_hold_count == 0u) {
    const float release_seconds = clampFloat(std::max(0.02f, source.release_seconds), 0.02f, 20.0f);
    source.transient_audition_until_frame = std::max(
        source.transient_audition_until_frame,
        audio_render_sample_frame + static_cast<uint64_t>(std::ceil(release_seconds * sample_rate)));
  }
}

void KesshoProductEngine::extendSourceTransientAudition(uint32_t source_id, float hold_seconds) {
  if (source_id < 1u || source_id > kSourceCount) return;
  SourceState& source = sources[source_id - 1u];
  const float audible_seconds = clampFloat(
      std::max(0.001f, hold_seconds) + std::max(0.02f, source.release_seconds),
      0.021f,
      40.0f);
  source.transient_audition_until_frame = std::max(
      source.transient_audition_until_frame,
      audio_render_sample_frame + static_cast<uint64_t>(std::ceil(audible_seconds * sample_rate)));
}
