#include "KesshoProductEngineInternal.h"

namespace {

bool decodePianoAssetRootMidi(uint32_t asset_id, uint32_t base_asset_id, bool short_variant, float& out_midi, bool* out_short_variant) {
  if (asset_id <= base_asset_id) {
    return false;
  }
  const uint32_t index = asset_id - base_asset_id;
  if (index == 0u || index > kessho::product::internal::kPianoSampleCount) {
    return false;
  }
  out_midi = static_cast<float>(kessho::product::internal::kPianoBaseMidi + index - 1u);
  if (out_short_variant != nullptr) {
    *out_short_variant = short_variant;
  }
  return true;
}

bool chooseShortPianoSampleVariant(float midi_note, float velocity) {
  const int note_key = std::max(0, static_cast<int>(std::lround(midi_note)));
  const int velocity_key = std::max(0, std::min(127, static_cast<int>(std::lround(clampFloat(velocity, 0.0f, 1.0f) * 127.0f))));
  return ((note_key * 31 + velocity_key) % 2) != 0;
}

} // namespace

  uint32_t KesshoProductEngine::findAssetSlot(uint32_t asset_id) const {
  for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
    if (assets[i].active && assets[i].asset_id == asset_id) {
      return i;
    }
  }
  return kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS;
}

  bool KesshoProductEngine::pianoAssetRootMidi(uint32_t asset_id, float& out_midi, bool* out_short_variant) const {
  return decodePianoAssetRootMidi(asset_id, kPianoAssetIdBase, false, out_midi, out_short_variant) ||
      decodePianoAssetRootMidi(asset_id, kPianoShortAssetIdBase, true, out_midi, out_short_variant);
}

  uint32_t KesshoProductEngine::findPianoAssetSlot(float midi_note, float velocity, float& out_root_midi) const {
  uint32_t best_slot = kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS;
  float best_score = 1000000.0f;
  float best_root = 60.0f;
  const bool wants_short_variant = chooseShortPianoSampleVariant(midi_note, velocity);
  for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
    const AssetSlot& asset = assets[i];
    if (!asset.active || (asset.flags & KESSHO_PRODUCT_ASSET_PIANO) == 0u) {
      continue;
    }
    float root_midi = 60.0f;
    bool short_variant = false;
    const bool known_piano_asset = pianoAssetRootMidi(asset.asset_id, root_midi, &short_variant);
    if (!known_piano_asset) {
      root_midi = midi_note;
      short_variant = wants_short_variant;
    }
    const float distance = std::abs(root_midi - midi_note);
    const float variant_penalty = short_variant == wants_short_variant ? 0.0f : 0.25f;
    const float legacy_penalty = known_piano_asset ? 0.0f : 0.5f;
    const float score = distance + variant_penalty + legacy_penalty;
    if (score < best_score) {
      best_score = score;
      best_slot = i;
      best_root = root_midi;
    }
  }
  out_root_midi = best_root;
  return best_slot;
}

  uint32_t KesshoProductEngine::allocateVoice() {
  for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES; ++i) {
    if (!voices[i].active) {
      return i;
    }
  }
  return 0;
}

  bool KesshoProductEngine::hasActiveSourceVoice(uint32_t source_id) const {
  for (const Voice& voice : voices) {
    if (voice.active && voice.source_id == source_id) {
      return true;
    }
  }
  return false;
}

  void KesshoProductEngine::releaseSoundscapeTextureVoice(Voice& voice, float release_asset_level) {
  if (!voice.soundscape_texture_voice) {
    return;
  }
  if (voice.start_delay_frames > 0u) {
    voice.active = false;
    return;
  }
  const uint32_t release_frames = std::max<uint32_t>(
      1u,
      static_cast<uint32_t>(std::ceil(static_cast<double>(kSoundscapeSourceToggleFadeSeconds) * sample_rate)));
  if (!voice.looping &&
      voice.envelope_attack_frames == 0u &&
      voice.envelope_release_frames == voice.total_frames &&
      voice.envelope_release_frames > 1u) {
    return;
  }
  const float current_envelope = sampleVoiceEnvelope(voice);
  const uint32_t remaining = std::min<uint32_t>(std::max(1u, voice.remaining_frames), release_frames);
  voice.looping = false;
  voice.soundscape_releasing = true;
  voice.soundscape_asset_level = std::isfinite(release_asset_level)
      ? clampFloat(release_asset_level, 0.0f, 2.0f)
      : clampFloat(voice.soundscape_asset_level, 0.0f, 2.0f);
  voice.amplitude *= clampFloat(current_envelope, 0.0f, 1.0f);
  voice.start_delay_frames = 0u;
  voice.age_frames = 0u;
  voice.remaining_frames = remaining;
  voice.total_frames = remaining;
  voice.envelope_attack_frames = 0u;
  voice.envelope_release_frames = remaining;
}

  void KesshoProductEngine::releaseLegacySoundscapeVoices(uint32_t asset_id) {
  for (Voice& voice : voices) {
    if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
        !voice.sample_voice || voice.soundscape_texture_voice ||
        voice.asset_slot >= kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS ||
        !assets[voice.asset_slot].active ||
        assets[voice.asset_slot].asset_id != asset_id) {
      continue;
    }
    voice.looping = false;
    voice.start_delay_frames = 0u;
    voice.remaining_frames = std::min<uint32_t>(
        voice.remaining_frames,
        static_cast<uint32_t>(0.02 * sample_rate));
    voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
  }
}

  void KesshoProductEngine::releaseUnwantedSoundscapeVoices(const SourceState& source) {
  for (Voice& voice : voices) {
    if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE || !voice.sample_voice) {
      continue;
    }
    const uint32_t asset_id = voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS
        ? assets[voice.asset_slot].asset_id
        : 0u;
    if (asset_id == 0u || !soundscapeWantsAsset(source, asset_id)) {
      if (voice.soundscape_texture_voice) {
        releaseSoundscapeTextureVoice(voice, voice.soundscape_asset_level);
        continue;
      }
      voice.looping = false;
      voice.start_delay_frames = 0u;
      voice.remaining_frames = std::min<uint32_t>(voice.remaining_frames, static_cast<uint32_t>(0.02 * sample_rate));
      voice.total_frames = std::max<uint32_t>(1u, voice.remaining_frames);
    }
  }
}

  void KesshoProductEngine::reportMissingSourceAsset(SourceState& source) {
  reportMissingSourceAsset(source, source.asset_id);
}

  void KesshoProductEngine::reportMissingSourceAsset(SourceState& source, uint32_t asset_id) {
  if (asset_id == 0u || source.last_missing_asset_id == asset_id) {
    return;
  }
  source.last_missing_asset_id = asset_id;
  ++telemetry.asset_missing_count;
  telemetry.last_error_code = KESSHO_PRODUCT_ERROR_MISSING_ASSET;
}

  uint32_t KesshoProductEngine::sampleFadeFrames(double seconds, uint32_t limit_frames) const {
  if (limit_frames <= 1u || sample_rate <= 0.0) {
    return 0u;
  }
  const uint32_t requested = static_cast<uint32_t>(std::max(1.0, seconds * sample_rate));
  return std::min<uint32_t>(requested, std::max<uint32_t>(1u, limit_frames));
}

  uint32_t KesshoProductEngine::loopCrossfadeFrames(const AssetSlot& asset) const {
  if (asset.frame_count <= 4u || sample_rate <= 0.0) {
    return 0u;
  }
  const uint32_t requested = static_cast<uint32_t>(std::max(1.0, kLoopCrossfadeSeconds * sample_rate));
  return std::min<uint32_t>(requested, std::max<uint32_t>(1u, asset.frame_count / 2u));
}

  float KesshoProductEngine::sampleVoiceEnvelope(const Voice& voice) const {
  if (voice.soundscape_texture_voice) {
    float envelope = 1.0f;
    if (voice.envelope_attack_frames > 1u && voice.age_frames < voice.envelope_attack_frames) {
      const float t = clampFloat(
          static_cast<float>(voice.age_frames) / static_cast<float>(voice.envelope_attack_frames),
          0.0f,
          1.0f);
      envelope = std::min(envelope, std::sin(t * static_cast<float>(kTwoPi * 0.25)));
    }
    if (voice.envelope_release_frames > 1u && voice.total_frames >= voice.envelope_release_frames) {
      const uint32_t release_start = voice.total_frames - voice.envelope_release_frames;
      if (voice.age_frames >= release_start) {
        const float t = clampFloat(
            static_cast<float>(voice.age_frames - release_start) /
                static_cast<float>(voice.envelope_release_frames),
            0.0f,
            1.0f);
        envelope = std::min(envelope, std::cos(t * static_cast<float>(kTwoPi * 0.25)));
      }
    }
    return clampFloat(envelope, 0.0f, 1.0f);
  }

  if (voice.piano_sample_voice) {
    const uint32_t attack_frames = std::max(1u, voice.envelope_attack_frames);
    const uint32_t decay_frames = std::max(1u, voice.envelope_decay_frames);
    const uint32_t hold_frames = voice.envelope_hold_frames;
    const uint32_t release_frames = std::max(1u, voice.envelope_release_frames);
    const float sustain = clampFloat(voice.envelope_sustain, 0.0f, 1.0f);
    const float quiet = 0.0001f;
    const uint32_t age = voice.age_frames;
    if (age < attack_frames) {
      return clampFloat(static_cast<float>(age + 1u) / static_cast<float>(attack_frames), 0.0f, 1.0f);
    }
    const uint32_t decay_age = age - attack_frames;
    if (decay_age < decay_frames) {
      const float t = static_cast<float>(decay_age + 1u) / static_cast<float>(decay_frames);
      return clampFloat(1.0f + (sustain - 1.0f) * t, 0.0f, 1.0f);
    }
    const uint32_t hold_age = decay_age - decay_frames;
    if (hold_age < hold_frames) {
      return sustain;
    }
    const uint32_t release_age = hold_age - hold_frames;
    if (release_age < release_frames) {
      const float t = static_cast<float>(release_age + 1u) / static_cast<float>(release_frames);
      return clampFloat(sustain + (quiet - sustain) * t, 0.0f, 1.0f);
    }
    return quiet;
  }

  float envelope = 1.0f;
  const uint32_t attack_frames = sampleFadeFrames(kSampleAttackSeconds, voice.total_frames / 2u);
  if (attack_frames > 1u && voice.age_frames < attack_frames) {
    envelope = std::min(envelope, static_cast<float>(voice.age_frames + 1u) / static_cast<float>(attack_frames));
  }
  if (!voice.looping) {
    const uint32_t release_frames = sampleFadeFrames(kSampleReleaseSeconds, voice.total_frames);
    if (release_frames > 1u && voice.remaining_frames < release_frames) {
      envelope = std::min(
          envelope,
          static_cast<float>(voice.remaining_frames) / static_cast<float>(release_frames));
    }
  }
  return clampFloat(envelope, 0.0f, 1.0f);
}

  float KesshoProductEngine::assetSample(const AssetSlot& asset, uint32_t channel, uint32_t frame) const {
  const uint32_t resolved_channel = channel < asset.channel_count ? channel : 0u;
  const float* data = asset.channels[resolved_channel] != nullptr ? asset.channels[resolved_channel] : asset.channels[0];
  return data != nullptr && frame < asset.frame_count ? data[frame] : 0.0f;
}

  float KesshoProductEngine::assetSampleInterpolated(
      const AssetSlot& asset,
      uint32_t channel,
      double frame_position,
      bool looping) const {
  if (asset.frame_count == 0u || !std::isfinite(frame_position)) {
    return 0.0f;
  }
  if (frame_position < 0.0) {
    frame_position = 0.0;
  }
  const double base_position = std::floor(frame_position);
  uint32_t frame0 = static_cast<uint32_t>(base_position);
  if (frame0 >= asset.frame_count) {
    if (!looping) {
      return 0.0f;
    }
    frame0 %= asset.frame_count;
  }
  uint32_t frame1 = frame0 + 1u;
  if (frame1 >= asset.frame_count) {
    frame1 = looping ? 0u : frame0;
  }
  const float frac = clampFloat(static_cast<float>(frame_position - base_position), 0.0f, 1.0f);
  if (frac <= 1.0e-7f) {
    return assetSample(asset, channel, frame0);
  }
  if (asset.frame_count < 4u) {
    const float sample0 = assetSample(asset, channel, frame0);
    const float sample1 = assetSample(asset, channel, frame1);
    return sample0 + (sample1 - sample0) * frac;
  }

  const auto sample_at = [&](int64_t frame) -> float {
    if (looping) {
      const int64_t count = static_cast<int64_t>(asset.frame_count);
      frame %= count;
      if (frame < 0) {
        frame += count;
      }
      return assetSample(asset, channel, static_cast<uint32_t>(frame));
    }
    if (frame < 0 || frame >= static_cast<int64_t>(asset.frame_count)) {
      return 0.0f;
    }
    return assetSample(asset, channel, static_cast<uint32_t>(frame));
  };

  const int64_t base = static_cast<int64_t>(std::floor(frame_position));
  const float p0 = sample_at(base - 1);
  const float p1 = sample_at(base);
  const float p2 = sample_at(base + 1);
  const float p3 = sample_at(base + 2);
  const float t2 = frac * frac;
  const float t3 = t2 * frac;
  return 0.5f * (
      (2.0f * p1) +
      (-p0 + p2) * frac +
      (2.0f * p0 - 5.0f * p1 + 4.0f * p2 - p3) * t2 +
      (-p0 + 3.0f * p1 - 3.0f * p2 + p3) * t3);
}

  void KesshoProductEngine::renderVoiceSample(Voice& voice, float& out_l, float& out_r) {
  out_l = 0.0f;
  out_r = 0.0f;
  if (!voice.active) {
    return;
  }
  if (voice.start_delay_frames > 0u) {
    --voice.start_delay_frames;
    return;
  }
  if (voice.remaining_frames == 0u) {
    voice.active = false;
    return;
  }

  float sample_l = 0.0f;
  float sample_r = 0.0f;
  if (voice.sample_voice) {
    const AssetSlot& asset = assets[voice.asset_slot];
    if (asset.frame_count == 0u || asset.channels[0] == nullptr) {
      voice.active = false;
      return;
    }
    uint32_t frame = static_cast<uint32_t>(voice.sample_position);
    if (frame >= asset.frame_count) {
      if (!voice.looping) {
        voice.active = false;
        return;
      }
      while (frame >= asset.frame_count) {
        voice.sample_position -= static_cast<double>(asset.frame_count);
        frame = static_cast<uint32_t>(voice.sample_position);
      }
    }
    sample_l = assetSampleInterpolated(asset, 0u, voice.sample_position, voice.looping);
    sample_r = asset.channel_count > 1u ? assetSampleInterpolated(asset, 1u, voice.sample_position, voice.looping) : sample_l;
    const uint32_t crossfade_frames = voice.loop_crossfade_frames;
    if (voice.looping && crossfade_frames > 1u && asset.frame_count > crossfade_frames) {
      const uint32_t crossfade_start = asset.frame_count - crossfade_frames;
      if (frame >= crossfade_start) {
        const uint32_t wrapped_frame = frame - crossfade_start;
        const float mix = static_cast<float>(wrapped_frame + 1u) / static_cast<float>(crossfade_frames);
        const float next_l = assetSample(asset, 0u, wrapped_frame);
        const float next_r = asset.channel_count > 1u ? assetSample(asset, 1u, wrapped_frame) : next_l;
        sample_l = sample_l * (1.0f - mix) + next_l * mix;
        sample_r = sample_r * (1.0f - mix) + next_r * mix;
      }
    }
    const float envelope = sampleVoiceEnvelope(voice);
    sample_l *= envelope;
    sample_r *= envelope;
    voice.sample_position += voice.sample_step;
  } else if (voice.drum_voice) {
    const float envelope = static_cast<float>(voice.remaining_frames) / static_cast<float>(std::max(1u, voice.total_frames));
    const float noise = hashUnit(static_cast<uint32_t>(voice.remaining_frames) ^ rng_state ^ voice.source_id) * 2.0f - 1.0f;
    sample_l = (std::sin(voice.phase) * 0.7f + noise * 0.3f) * envelope;
    sample_r = sample_l;
    voice.phase += kTwoPi * voice.frequency / sample_rate;
  } else {
    const float envelope = std::min(
        1.0f,
        static_cast<float>(voice.remaining_frames) / static_cast<float>(std::max(1u, voice.total_frames / 3u)));
    sample_l = std::sin(voice.phase) * envelope;
    sample_r = sample_l;
    voice.phase += kTwoPi * voice.frequency / sample_rate;
  }

  ++voice.age_frames;
  if (!voice.looping) {
    --voice.remaining_frames;
    if (voice.remaining_frames == 0u) {
      voice.active = false;
    }
  }
  out_l = sample_l * voice.amplitude;
  out_r = sample_r * voice.amplitude;
}
