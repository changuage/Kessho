#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::configurePianoSampleVoiceEnvelope(
      Voice& voice,
      const SourceState& source,
      float velocity,
      float distance,
      uint32_t resolved_seed,
      uint32_t asset_slot) {
  const auto seconds_to_frames = [this](float seconds) -> uint32_t {
    if (!std::isfinite(seconds) || seconds <= 0.0f || sample_rate <= 0.0) {
      return 1u;
    }
    return std::max<uint32_t>(1u, static_cast<uint32_t>(std::ceil(static_cast<double>(seconds) * sample_rate)));
  };

  const float piano_distance = clampFloat(distance, 0.0f, 1.0f);
  const float attack_base_unmodulated = resolveModulatedValue(
      KESSHO_PRODUCT_SOURCE_PIANO,
      KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID,
      source.attack_seconds,
      resolved_seed);
  const float decay_base_unmodulated = resolveModulatedValue(
      KESSHO_PRODUCT_SOURCE_PIANO,
      KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID,
      source.decay_seconds,
      resolved_seed);
  const float sustain_base_unmodulated = resolveModulatedValue(
      KESSHO_PRODUCT_SOURCE_PIANO,
      KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID,
      source.sustain,
      resolved_seed);
  const float release_base_unmodulated = resolveModulatedValue(
      KESSHO_PRODUCT_SOURCE_PIANO,
      KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID,
      source.release_seconds,
      resolved_seed);
  const float hold_base_unmodulated = resolveModulatedValue(
      KESSHO_PRODUCT_SOURCE_PIANO,
      KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID,
      source.hold_seconds,
      resolved_seed);
  const float attack_base = (std::abs(piano_distance) <= 0.0001f || attack_base_unmodulated > 0.005f)
      ? attack_base_unmodulated
      : attack_base_unmodulated + 0.1f;
  const float attack_seconds = clampFloat(
      distanceMultiply(attack_base, piano_distance, 1.35f, 4.5f),
      0.001f,
      2.0f);
  const float decay_seconds = clampFloat(
      distanceMultiply(decay_base_unmodulated, piano_distance, 0.96f, 0.80f),
      0.01f,
      4.0f);
  const float hold = clampFloat(hold_base_unmodulated, 0.0f, 4.0f);
  const float hold_seconds = clampFloat(distanceAdd(hold, piano_distance, -0.03f, -0.18f), 0.0f, 4.0f);
  const float release_seconds = clampFloat(
      distanceMultiply(release_base_unmodulated, piano_distance, 1.12f, 1.80f),
      0.01f,
      8.0f);

  voice.piano_sample_voice = true;
  voice.pan = 0.0f;
  voice.envelope_attack_frames = seconds_to_frames(attack_seconds);
  voice.envelope_decay_frames = seconds_to_frames(decay_seconds);
  voice.envelope_hold_frames = hold_seconds <= 0.0f
      ? 0u
      : static_cast<uint32_t>(std::ceil(static_cast<double>(hold_seconds) * sample_rate));
  voice.envelope_release_frames = seconds_to_frames(release_seconds);
  voice.envelope_sustain = clampFloat(distanceAdd(sustain_base_unmodulated, piano_distance, -0.04f, -0.22f), 0.0f, 1.0f);
  voice.amplitude = clampFloat(velocity, 0.0f, 1.0f);

  const uint64_t envelope_stop_frames =
      static_cast<uint64_t>(voice.envelope_attack_frames) +
      static_cast<uint64_t>(voice.envelope_decay_frames) +
      static_cast<uint64_t>(voice.envelope_hold_frames) +
      static_cast<uint64_t>(voice.envelope_release_frames) +
      static_cast<uint64_t>(seconds_to_frames(kPianoEnvelopePostReleaseTailSeconds));
  const double step = std::max(0.000001, voice.sample_step);
  const uint32_t source_duration_frames = std::max<uint32_t>(
      1u,
      static_cast<uint32_t>(std::ceil(static_cast<double>(assets[asset_slot].frame_count) / step)));
  voice.remaining_frames = std::min<uint32_t>(
      source_duration_frames,
      static_cast<uint32_t>(std::min<uint64_t>(envelope_stop_frames, UINT32_MAX)));
  voice.total_frames = std::max(1u, voice.remaining_frames);
}
