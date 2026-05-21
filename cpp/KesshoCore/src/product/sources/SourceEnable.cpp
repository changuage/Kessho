#include "../KesshoProductEngineInternal.h"

uint32_t KesshoProductEngine::sourceEnableFadeFrames(uint32_t source_id) const {
  const float seconds = source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE
      ? kSoundscapeSourceToggleFadeSeconds
      : kSourceToggleFadeSeconds;
  return std::max<uint32_t>(
      1u,
      static_cast<uint32_t>(std::ceil(static_cast<double>(seconds) * sample_rate)));
}

bool KesshoProductEngine::sourceRenderActive(const SourceState& source) const {
  return source.enabled ||
      source.enabled_gain > 0.0001f ||
      source.enabled_gain_target > 0.0001f ||
      source.enabled_gain_ramp_remaining > 0u;
}

void KesshoProductEngine::setSourceEnabled(SourceState& source, bool enabled, bool immediate) {
  const float target = enabled ? 1.0f : 0.0f;
  if (!immediate && source.enabled == enabled && source.enabled_gain_target == target) {
    return;
  }
  if (immediate) {
    source.enabled = enabled;
    source.enabled_gain = target;
    source.enabled_gain_target = target;
    source.enabled_gain_delta = 0.0f;
    source.enabled_gain_ramp_remaining = 0u;
    source.enabled_gain_frame = transport.sample_frame;
    return;
  }

  const float current = sourceEnableGainForFrame(source, transport.sample_frame);
  source.enabled = enabled;
  source.enabled_gain_target = target;
  const uint32_t ramp_frames = sourceEnableFadeFrames(source.source_id);
  source.enabled_gain_ramp_remaining = ramp_frames;
  source.enabled_gain_delta = (target - current) / static_cast<float>(ramp_frames);
  source.enabled_gain = current;
  source.enabled_gain_frame = transport.sample_frame;
}

float KesshoProductEngine::sourceEnableGainForFrame(SourceState& source, uint64_t absolute_frame) {
  if (source.enabled_gain_frame == 0u && transport.sample_frame > 0u) {
    source.enabled_gain_frame = transport.sample_frame;
  }
  if (absolute_frame <= source.enabled_gain_frame || source.enabled_gain_ramp_remaining == 0u) {
    if (source.enabled_gain_ramp_remaining == 0u) {
      source.enabled_gain = source.enabled_gain_target;
    }
    source.enabled_gain_frame = std::max(source.enabled_gain_frame, absolute_frame);
    return clampFloat(source.enabled_gain, 0.0f, 1.0f);
  }

  const uint64_t elapsed_u64 = absolute_frame - source.enabled_gain_frame;
  const uint32_t elapsed = static_cast<uint32_t>(
      std::min<uint64_t>(elapsed_u64, source.enabled_gain_ramp_remaining));
  source.enabled_gain += source.enabled_gain_delta * static_cast<float>(elapsed);
  source.enabled_gain_ramp_remaining -= elapsed;
  source.enabled_gain_frame += elapsed;
  if (source.enabled_gain_ramp_remaining == 0u) {
    source.enabled_gain = source.enabled_gain_target;
    source.enabled_gain_delta = 0.0f;
  }
  return clampFloat(source.enabled_gain, 0.0f, 1.0f);
}
