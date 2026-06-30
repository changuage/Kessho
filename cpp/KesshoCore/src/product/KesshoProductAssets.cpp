#include "KesshoProductEngineInternal.h"
#include "generated/SampleLibraryRegistry.generated.h"

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

uint32_t hashU32(uint32_t value) {
  value ^= value >> 16u;
  value *= 0x7feb352du;
  value ^= value >> 15u;
  value *= 0x846ca68bu;
  value ^= value >> 16u;
  return value;
}

uint32_t clampedVelocityByte(float velocity) {
  return static_cast<uint32_t>(std::lround(clampFloat(velocity, 0.0f, 1.0f) * 127.0f));
}

bool sampleDynamicMatches(
    const kessho::product::generated::GeneratedSampleDescriptor& descriptor,
    const kessho::product::internal::SourceState& source,
    float midi_note,
    float velocity) {
  using namespace kessho::product::generated;
  if (source.sample_dynamic_mode == KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY &&
      source.sample_library_id == kSampleLibraryPiano) {
    const uint8_t wanted_dynamic = chooseShortPianoSampleVariant(midi_note, velocity)
        ? kSampleDynamicIdShort
        : kSampleDynamicIdRegular;
    return descriptor.dynamicId == wanted_dynamic;
  }
  if (source.sample_dynamic_mode == KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED) {
    return source.sample_fixed_dynamic_id == 0u || descriptor.dynamicId == source.sample_fixed_dynamic_id;
  }
  const uint32_t velocity_byte = clampedVelocityByte(velocity);
  return velocity_byte >= descriptor.velocityMin && velocity_byte <= descriptor.velocityMax;
}

float sampleDescriptorScore(
    const kessho::product::generated::GeneratedSampleDescriptor& descriptor,
    const kessho::product::internal::SourceState& source,
    float midi_note,
    float velocity,
    bool mapped_only,
    bool relax_dynamic) {
  using namespace kessho::product::internal;
  if (descriptor.libraryId != source.sample_library_id) {
    return -1.0f;
  }
  if (source.sample_role_id != kSampleRoleAny && descriptor.roleId != source.sample_role_id) {
    return -1.0f;
  }
  if (source.sample_articulation_id != kSampleArticulationAny &&
      descriptor.articulationId != source.sample_articulation_id) {
    return -1.0f;
  }
  if (!relax_dynamic && !sampleDynamicMatches(descriptor, source, midi_note, velocity)) {
    return -1.0f;
  }
  const int target_midi = std::max(0, std::min(127, static_cast<int>(std::lround(midi_note))));
  if (source.sample_selection_mode == KESSHO_PRODUCT_SAMPLE_SELECTION_EXACT) {
    return descriptor.rootMidi == static_cast<uint8_t>(target_midi) ? 0.0f : -1.0f;
  }
  const bool mapped =
      target_midi >= static_cast<int>(descriptor.loMidi) &&
      target_midi <= static_cast<int>(descriptor.hiMidi);
  if (mapped_only && !mapped) {
    return -1.0f;
  }
  return std::abs(static_cast<float>(descriptor.rootMidi) - static_cast<float>(target_midi));
}

uint32_t sampleVariantTieIndex(const kessho::product::internal::SourceState& source, uint32_t key, uint32_t tie_count) {
  if (tie_count <= 1u || source.sample_variant_mode == KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE) {
    return 0u;
  }
  if (source.sample_variant_mode == KESSHO_PRODUCT_SAMPLE_VARIANT_ROUND_ROBIN) {
    return key % tie_count;
  }
  return hashU32(key ^ (source.source_id * 0x9e3779b9u) ^ (source.sample_library_id * 0x85ebca6bu)) % tie_count;
}

bool nearlyEqual(float left, float right) {
  return std::abs(left - right) <= 1.0e-5f;
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
  telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  return kProductInvalidVoiceIndex;
}

  void KesshoProductEngine::markActiveVoiceListDirty() {
  active_voice_list_dirty = true;
}

  void KesshoProductEngine::rebuildActiveVoiceList() {
  active_voice_count = 0u;
  active_source_mask = 0u;
  for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES; ++i) {
    Voice& voice = voices[i];
    if (!voice.active) {
      continue;
    }
    if (voice.source_id < 1u || voice.source_id > kSourceCount) {
      voice.active = false;
      continue;
    }
    active_voice_indices[active_voice_count++] = static_cast<uint16_t>(i);
    active_source_mask |= 1u << (voice.source_id - 1u);
  }
  active_voice_list_dirty = false;
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
    markActiveVoiceListDirty();
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
  if (asset.loop_end_frame > asset.loop_start_frame + 8u) {
    const uint32_t loop_length = asset.loop_end_frame - asset.loop_start_frame;
    if (asset.loop_crossfade_frames > 0u) {
      return std::min<uint32_t>(asset.loop_crossfade_frames, std::max<uint32_t>(1u, loop_length / 2u));
    }
    return std::min<uint32_t>(requested, std::max<uint32_t>(1u, loop_length / 2u));
  }
  return std::min<uint32_t>(requested, std::max<uint32_t>(1u, asset.frame_count / 2u));
}

  uint32_t KesshoProductEngine::findSampleAssetSlot(
      const SourceState& source,
      float midi_note,
      float velocity,
      uint32_t variant_counter,
      float& out_root_midi,
      uint32_t& out_asset_id) const {
  using namespace kessho::product::generated;
  out_root_midi = clampFloat(midi_note, 0.0f, 127.0f);
  out_asset_id = 0u;

  const auto scan = [&](bool mapped_only, bool relax_dynamic) -> uint32_t {
    float best_registered_score = 1000000.0f;
    uint32_t registered_ties = 0u;
    float best_missing_score = 1000000.0f;
    uint32_t best_missing_asset_id = 0u;
    float best_missing_root_midi = out_root_midi;

    for (const auto& descriptor : kGeneratedSampleDescriptors) {
      const float score = sampleDescriptorScore(descriptor, source, midi_note, velocity, mapped_only, relax_dynamic);
      if (score < 0.0f) {
        continue;
      }
      const uint32_t asset_slot = findAssetSlot(descriptor.assetId);
      const bool registered =
          asset_slot != kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
          (assets[asset_slot].flags & (KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_PIANO)) != 0u;
      if (registered) {
        if (score < best_registered_score - 1.0e-5f) {
          best_registered_score = score;
          registered_ties = 1u;
        } else if (nearlyEqual(score, best_registered_score)) {
          ++registered_ties;
        }
      } else if (score < best_missing_score - 1.0e-5f) {
        best_missing_score = score;
        best_missing_asset_id = descriptor.assetId;
        best_missing_root_midi = static_cast<float>(descriptor.rootMidi);
      }
    }

    if (registered_ties == 0u) {
      out_asset_id = best_missing_asset_id;
      out_root_midi = best_missing_root_midi;
      return kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS;
    }

    const uint32_t target_tie = sampleVariantTieIndex(
        source,
        variant_counter ^ (static_cast<uint32_t>(std::lround(clampFloat(midi_note, 0.0f, 127.0f))) << 8u) ^
            clampedVelocityByte(velocity),
        registered_ties);
    uint32_t seen_tie = 0u;
    for (const auto& descriptor : kGeneratedSampleDescriptors) {
      const float score = sampleDescriptorScore(descriptor, source, midi_note, velocity, mapped_only, relax_dynamic);
      if (score < 0.0f || !nearlyEqual(score, best_registered_score)) {
        continue;
      }
      const uint32_t asset_slot = findAssetSlot(descriptor.assetId);
      if (asset_slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS ||
          (assets[asset_slot].flags & (KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_PIANO)) == 0u) {
        continue;
      }
      if (seen_tie++ == target_tie) {
        out_asset_id = descriptor.assetId;
        out_root_midi = static_cast<float>(descriptor.rootMidi);
        return asset_slot;
      }
    }
    return kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS;
  };

  const bool mapped_mode = source.sample_selection_mode == KESSHO_PRODUCT_SAMPLE_SELECTION_MAPPED;
  uint32_t slot = scan(mapped_mode, false);
  if (slot != kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    return slot;
  }
  if (out_asset_id != 0u &&
      source.sample_library_id == kSampleLibraryPiano &&
      source.sample_dynamic_mode == KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY) {
    const uint32_t desired_missing_asset_id = out_asset_id;
    const float desired_missing_root_midi = out_root_midi;
    slot = scan(mapped_mode, true);
    if (slot != kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
      return slot;
    }
    out_asset_id = desired_missing_asset_id;
    out_root_midi = desired_missing_root_midi;
  }
  if (out_asset_id != 0u || !mapped_mode) {
    return slot;
  }
  return scan(false, false);
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
  const bool loop_region =
      looping &&
      asset.loop_end_frame > asset.loop_start_frame + 1u &&
      asset.loop_end_frame <= asset.frame_count;
  const auto wrap_loop_frame = [&](int64_t frame) -> uint32_t {
    if (loop_region) {
      const int64_t start = static_cast<int64_t>(asset.loop_start_frame);
      const int64_t end = static_cast<int64_t>(asset.loop_end_frame);
      const int64_t length = std::max<int64_t>(1, end - start);
      if (frame >= end) {
        frame = start + ((frame - start) % length);
      }
      if (frame < 0) {
        frame = 0;
      }
      return static_cast<uint32_t>(std::min<int64_t>(frame, static_cast<int64_t>(asset.frame_count - 1u)));
    }
    const int64_t count = static_cast<int64_t>(asset.frame_count);
    frame %= count;
    if (frame < 0) {
      frame += count;
    }
    return static_cast<uint32_t>(frame);
  };
  if (frame_position < 0.0) {
    frame_position = 0.0;
  }
  const double base_position = std::floor(frame_position);
  uint32_t frame0 = static_cast<uint32_t>(base_position);
  if (frame0 >= asset.frame_count) {
    if (!looping) {
      return 0.0f;
    }
    frame0 = wrap_loop_frame(static_cast<int64_t>(frame0));
  }
  uint32_t frame1 = frame0 + 1u;
  if ((loop_region && frame1 >= asset.loop_end_frame) || frame1 >= asset.frame_count) {
    frame1 = looping ? wrap_loop_frame(static_cast<int64_t>(frame1)) : frame0;
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
      return assetSample(asset, channel, wrap_loop_frame(frame));
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
    markActiveVoiceListDirty();
    return;
  }

  float sample_l = 0.0f;
  float sample_r = 0.0f;
  if (voice.sample_voice) {
    const AssetSlot& asset = assets[voice.asset_slot];
    if (asset.frame_count == 0u || asset.channels[0] == nullptr) {
      voice.active = false;
      markActiveVoiceListDirty();
      return;
    }
    uint32_t frame = static_cast<uint32_t>(voice.sample_position);
    const bool loop_region =
        voice.looping &&
        asset.loop_end_frame > asset.loop_start_frame + 1u &&
        asset.loop_end_frame <= asset.frame_count;
    const uint32_t loop_end_frame = loop_region ? asset.loop_end_frame : asset.frame_count;
    if (frame >= loop_end_frame) {
      if (!voice.looping) {
        voice.active = false;
        markActiveVoiceListDirty();
        return;
      }
      const double loop_start = loop_region ? static_cast<double>(asset.loop_start_frame) : 0.0;
      const double loop_length = static_cast<double>(std::max<uint32_t>(
          1u,
          loop_region ? (asset.loop_end_frame - asset.loop_start_frame) : asset.frame_count));
      while (voice.sample_position >= static_cast<double>(loop_end_frame)) {
        voice.sample_position = loop_start + std::fmod(std::max(0.0, voice.sample_position - loop_start), loop_length);
        frame = static_cast<uint32_t>(voice.sample_position);
      }
    }
    sample_l = assetSampleInterpolated(asset, 0u, voice.sample_position, voice.looping);
    sample_r = asset.channel_count > 1u ? assetSampleInterpolated(asset, 1u, voice.sample_position, voice.looping) : sample_l;
    const uint32_t crossfade_frames = voice.loop_crossfade_frames;
    if (voice.looping && crossfade_frames > 1u && loop_end_frame > crossfade_frames) {
      const uint32_t loop_start_frame = loop_region ? asset.loop_start_frame : 0u;
      const uint32_t crossfade_start = loop_end_frame - crossfade_frames;
      if (frame >= crossfade_start) {
        const uint32_t crossfade_offset = frame - crossfade_start;
        const uint32_t wrapped_frame = loop_start_frame + crossfade_offset;
        const float mix = static_cast<float>(crossfade_offset + 1u) / static_cast<float>(crossfade_frames);
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
      markActiveVoiceListDirty();
    }
  }
  out_l = sample_l * voice.amplitude;
  out_r = sample_r * voice.amplitude;
}
