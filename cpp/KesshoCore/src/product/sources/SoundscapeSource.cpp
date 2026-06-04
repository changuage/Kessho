#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::ensureSoundscapeTextureVoice(
      SourceState& source,
      uint32_t asset_id,
      uint32_t asset_slot) {
  const uint32_t texture_slot = soundscapeTextureSlotForAsset(asset_id);
  if (texture_slot >= kSoundscapeTextureSlotCount ||
      asset_slot >= kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS ||
      !assets[asset_slot].active ||
      assets[asset_slot].frame_count == 0u ||
      assets[asset_slot].sample_rate <= 0.0f) {
    return;
  }
  SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[texture_slot];
  configureSoundscapeTextureSpatialRuntime(asset_id, runtime);
  const uint32_t seed = soundscapeTextureSeed(source, texture_slot, hashU32(rng_seed ^ asset_id ^ 0x51f15ca9u));
  if (!runtime.initialized || runtime.seed != seed) {
    releaseSoundscapeTextureVoices(asset_id);
    runtime = {};
    runtime.initialized = true;
    runtime.seed = seed;
    runtime.rng_state = seed;
    runtime.next_slice_id = 1u;
    runtime.next_start_frame = product_render_frame +
        static_cast<uint64_t>(std::max(1.0, std::round(kSoundscapeTextureInitialDelaySeconds * sample_rate)));
  }
  uint32_t queued_count = 0u;
  uint64_t latest_end_frame = product_render_frame;
  for (const Voice& voice : voices) {
    if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
        !voice.sample_voice || !voice.soundscape_texture_voice ||
        voice.asset_slot >= kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS ||
        !assets[voice.asset_slot].active ||
        assets[voice.asset_slot].asset_id != asset_id) {
      continue;
    }
    ++queued_count;
    latest_end_frame = std::max<uint64_t>(
        latest_end_frame,
        product_render_frame +
            static_cast<uint64_t>(voice.start_delay_frames) +
            static_cast<uint64_t>(voice.remaining_frames));
  }
  const uint64_t lookahead_frame = product_render_frame +
      static_cast<uint64_t>(std::max(1.0, std::round(kSoundscapeTextureLookAheadSeconds * sample_rate)));
  if (runtime.next_start_frame < product_render_frame) {
    runtime.next_start_frame = product_render_frame +
        static_cast<uint64_t>(std::max(1.0, std::round(kSoundscapeTextureInitialDelaySeconds * sample_rate)));
  }
  const AssetSlot& asset = assets[asset_slot];
  while (queued_count < kSoundscapeTextureMinimumQueuedSlices || runtime.next_start_frame < lookahead_frame) {
    const double asset_duration = static_cast<double>(asset.frame_count) / std::max(1.0, static_cast<double>(asset.sample_rate));
    const double slice_duration = std::min(
        std::max(
            static_cast<double>(soundscapeTextureParam(
                source,
                texture_slot,
                kSoundscapeTextureParamSliceDuration,
                texture_slot == kSoundscapeTextureSlotFrogs ? 18.0f : 20.0f)),
            1.5),
        std::max(1.5, asset_duration - 0.05));
    const float density = clampFloat(
        soundscapeTextureParam(
            source,
            texture_slot,
            kSoundscapeTextureParamDensity,
            texture_slot == kSoundscapeTextureSlotOcean ? 0.38f : 0.48f),
        0.0f,
        1.0f);
    const float detune_cents = (soundscapeTextureRandom(texture_slot) * 2.0f - 1.0f) * kSoundscapeTexturePitchRangeCents;
    const float speed_multiplier = 1.0f + (soundscapeTextureRandom(texture_slot) * 2.0f - 1.0f) * kSoundscapeTextureSpeedVariation;
    const double total_rate =
        std::max(0.25, static_cast<double>(speed_multiplier) * std::pow(2.0, static_cast<double>(detune_cents) / 1200.0));
    const double output_duration = slice_duration / total_rate;
    const double requested_fade = std::max(
        0.0,
        static_cast<double>(soundscapeTextureParam(
            source,
            texture_slot,
            kSoundscapeTextureParamFadeTime,
            texture_slot == kSoundscapeTextureSlotOcean ? 5.5f : 3.1f)));
    const double fade = std::min(std::max(requested_fade, 0.1), output_duration * 0.45);
    const double max_offset = std::max(0.0, asset_duration - slice_duration - 0.02);
    const double offset = soundscapeTexturePickOffset(texture_slot, max_offset, slice_duration);

    const uint32_t slice_id = runtime.next_slice_id++;
    if (runtime.next_slice_id == 0u) {
      runtime.next_slice_id = 1u;
    }
    const uint32_t voice_index = allocateVoice();
    Voice& voice = voices[voice_index];
    voice = {};
    voice.active = true;
    voice.source_id = KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
    voice.sample_voice = true;
    voice.soundscape_texture_voice = true;
    voice.soundscape_texture_slice_id = slice_id;
    voice.soundscape_texture_start_frame = runtime.next_start_frame;
    voice.soundscape_texture_start_offset_seconds = static_cast<float>(offset);
    voice.soundscape_asset_level = soundscapeAssetRefLevel(source, asset_id);
    voice.asset_slot = asset_slot;
    voice.frequency = 0.0f;
    voice.amplitude = 1.0f;
    voice.pan = 0.0f;
    voice.looping = false;
    voice.sample_position = offset * static_cast<double>(asset.sample_rate);
    voice.sample_step = (static_cast<double>(asset.sample_rate) / sample_rate) * total_rate;
    voice.start_delay_frames = runtime.next_start_frame > product_render_frame
        ? static_cast<uint32_t>(std::min<uint64_t>(
            runtime.next_start_frame - product_render_frame,
            static_cast<uint64_t>(UINT32_MAX)))
        : 0u;
    voice.remaining_frames = std::max<uint32_t>(
        1u,
        static_cast<uint32_t>(std::ceil(output_duration * sample_rate)));
    voice.total_frames = voice.remaining_frames;
    voice.envelope_attack_frames = fade <= 0.0
        ? 0u
        : static_cast<uint32_t>(std::ceil(fade * sample_rate));
    voice.envelope_release_frames = voice.envelope_attack_frames;

    runtime.last_slice_id = slice_id;
    runtime.last_start_frame = runtime.next_start_frame;
    runtime.last_offset_seconds = static_cast<float>(offset);
    runtime.last_slice_duration = static_cast<float>(slice_duration);
    runtime.last_output_duration = static_cast<float>(output_duration);
    runtime.last_detune_cents = detune_cents;
    runtime.last_speed_multiplier = speed_multiplier;
    runtime.last_total_rate = static_cast<float>(total_rate);
    runtime.last_density = density;
    runtime.last_fade_time = static_cast<float>(fade);
    runtime.last_asset_duration = static_cast<float>(asset_duration);
    runtime.last_max_offset = static_cast<float>(max_offset);

    latest_end_frame = std::max<uint64_t>(
        latest_end_frame,
        runtime.next_start_frame + static_cast<uint64_t>(voice.remaining_frames));
    runtime.next_start_frame += static_cast<uint64_t>(
        std::max(1.0, std::round(soundscapeTextureStrideSeconds(output_duration, fade, density) * sample_rate)));
    ++queued_count;

    if (runtime.next_start_frame > latest_end_frame + static_cast<uint64_t>(sample_rate * 180.0)) {
      break;
    }
  }
}

  void KesshoProductEngine::ensureSoundscapeVoice() {
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  if (!sourceRenderActive(source)) {
    releaseSourceVoices(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
    resetSoundscapeTextureRuntimes();
    return;
  }
  releaseUnwantedSoundscapeVoices(source);
  if (source.asset_ref_count == 0u) {
    resetSoundscapeTextureRuntimes();
    return;
  }
  const bool use_texture_slices =
      soundscapeTextureParamsAvailable(source) && !soundscapeParityFixtureEnabled(source);
  for (uint32_t ref_index = 0; ref_index < source.asset_ref_count; ++ref_index) {
    const uint32_t asset_id = source.asset_refs[ref_index];
    if (asset_id == 0u || soundscapeAssetUsesModule(source, asset_id)) {
      continue;
    }
    const uint32_t slot = findAssetSlot(asset_id);
    if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
      reportMissingSourceAsset(source, asset_id);
      continue;
    }
    if ((assets[slot].flags & KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == 0u) {
      continue;
    }
    const bool texture_asset = soundscapeTextureSlotForAsset(asset_id) < kSoundscapeTextureSlotCount;
    if (use_texture_slices && texture_asset) {
      releaseLegacySoundscapeVoices(asset_id);
      ensureSoundscapeTextureVoice(source, asset_id, slot);
      continue;
    }
    if (texture_asset) {
      releaseSoundscapeTextureVoices(asset_id);
    }
    if (hasActiveLegacySoundscapeVoice(asset_id)) {
      continue;
    }
    triggerVoice(
        KESSHO_PRODUCT_SOURCE_SOUNDSCAPE,
        60.0f,
        1.0f,
        static_cast<float>(static_cast<double>(assets[slot].frame_count) / std::max(1.0, assets[slot].sample_rate)),
        source.morph,
        source.distance,
        source.expression,
        hashU32(rng_seed ^ asset_id ^ 0x51f15ca9u),
        asset_id);
  }
}
