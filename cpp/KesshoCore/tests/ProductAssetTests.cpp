#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Asset test failed: " << message << "\n";
    std::exit(1);
  }
}

float peak(const std::vector<float>& values) {
  float result = 0.0f;
  for (float value : values) {
    require(std::isfinite(value), "non-finite output sample");
    result = std::max(result, std::fabs(value));
  }
  return result;
}

float stereoSpread(const std::vector<float>& left, const std::vector<float>& right) {
  float result = 0.0f;
  for (size_t i = 0; i < std::min(left.size(), right.size()); ++i) {
    require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite stereo sample");
    result = std::max(result, std::fabs(right[i] - left[i]));
  }
  return result;
}

uint32_t productHashU32(uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352du;
  value ^= value >> 15;
  value *= 0x846ca68bu;
  value ^= value >> 16;
  return value;
}

float productHashUnit(uint32_t value) {
  return static_cast<float>(productHashU32(value) & 0x00ffffffu) / static_cast<float>(0x01000000u);
}

uint32_t expectedSoundscapeRandomStart(uint32_t rng_seed, uint32_t asset_id, uint32_t frame_count) {
  const uint32_t sample_seed = productHashU32(rng_seed ^ asset_id ^ 0x51f15ca9u);
  const uint32_t requested_crossfade = static_cast<uint32_t>(std::max(1.0, 0.012 * 48000.0));
  const uint32_t crossfade_frames = std::min<uint32_t>(requested_crossfade, std::max<uint32_t>(1u, frame_count / 2u));
  const uint32_t max_start = frame_count > crossfade_frames + 1u
      ? frame_count - crossfade_frames - 1u
      : frame_count - 1u;
  return static_cast<uint32_t>(std::floor(productHashUnit(sample_seed ^ asset_id ^ 0xa341316cu) * static_cast<float>(max_start + 1u)));
}

KesshoProductSnapshotV2 makeSnapshot(uint32_t asset_id) {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 5;
  snapshot.rng.state = 5;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1].asset_id = asset_id;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

KesshoProductSnapshotV2 makeSoundscapeSnapshot(uint32_t asset_id) {
  KesshoProductSnapshotV2 snapshot = makeSnapshot(0);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1].enabled = 0;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].enabled = 1;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].asset_id = asset_id;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].level = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].dry_gain = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].reverb_send = 0.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].delay_a_send = 0.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].delay_b_send = 0.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].granular_send = 0.0f;
  return snapshot;
}

KesshoProductSnapshotV2 makeTextureSoundscapeSnapshot(
    uint32_t asset_id,
    bool parity_fixture = false,
    float slice_duration = 1.5f,
    float density = 1.0f,
    float fade_time = 0.1f) {
  using namespace kessho::product::internal;
  KesshoProductSnapshotV2 snapshot = makeSoundscapeSnapshot(asset_id);
  snapshot.asset_refs[0] = asset_id;
  snapshot.asset_ref_levels[0] = 1.0f;
  snapshot.soundscape_texture_param_count = kSoundscapeTextureParamCount;
  snapshot.soundscape_texture_params[kSoundscapeParityFixtureParam] = parity_fixture ? 1.0f : 0.0f;
  for (uint32_t slot = 0; slot < kSoundscapeTextureSlotCount; ++slot) {
    const uint32_t offset = kSoundscapeTextureParamStart + slot * kSoundscapeTextureParamStride;
    const uint32_t seed = 0x13572468u + slot * 0x10203u;
    snapshot.soundscape_texture_params[offset + kSoundscapeTextureParamSliceDuration] = slice_duration;
    snapshot.soundscape_texture_params[offset + kSoundscapeTextureParamDensity] = density;
    snapshot.soundscape_texture_params[offset + kSoundscapeTextureParamFadeTime] = fade_time;
    snapshot.soundscape_texture_params[offset + kSoundscapeTextureParamSeedLo] =
        static_cast<float>(seed & 0xffffu);
    snapshot.soundscape_texture_params[offset + kSoundscapeTextureParamSeedHi] =
        static_cast<float>((seed >> 16u) & 0xffffu);
  }
  return snapshot;
}

uint32_t distinctRecentSoundscapeOffsets(
    const kessho::product::internal::SoundscapeTextureRuntime& runtime,
    float threshold = 0.25f) {
  uint32_t distinct = 0u;
  for (uint32_t i = 0; i < runtime.recent_offset_count; ++i) {
    bool already_counted = false;
    for (uint32_t j = 0; j < i; ++j) {
      if (std::fabs(runtime.recent_offsets[i] - runtime.recent_offsets[j]) <= threshold) {
        already_counted = true;
        break;
      }
    }
    if (!already_counted) {
      ++distinct;
    }
  }
  return distinct;
}

void triggerPianoNoteWithVelocity(KesshoProductEngine* engine, float midi_note, float velocity) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  event.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  event.value = midi_note;
  event.value2 = velocity;
  event.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "piano event enqueue failed");
}

void triggerPianoNote(KesshoProductEngine* engine, float midi_note) {
  triggerPianoNoteWithVelocity(engine, midi_note, 1.0f);
}

void triggerPiano(KesshoProductEngine* engine) {
  triggerPianoNote(engine, 60.0f);
}

float renderPianoAttackProbe(float attack_seconds, bool via_param_event = false) {
  constexpr uint32_t piano_probe_asset_id = 7240;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "piano envelope probe engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot(piano_probe_asset_id);
  KesshoProductSourceSnapshot& piano = snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1];
  piano.attack_seconds = via_param_event ? 0.001f : attack_seconds;
  piano.decay_seconds = 0.01f;
  piano.sustain = 1.0f;
  piano.hold_seconds = 0.5f;
  piano.release_seconds = 0.1f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "piano envelope probe snapshot load failed");

  std::vector<float> sample_data(4096, 1.0f);
  const float* channels[1] = {sample_data.data()};
  require(
      kessho_product_register_asset_buffer(
          engine,
          piano_probe_asset_id,
          channels,
          1,
          static_cast<uint32_t>(sample_data.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "piano envelope probe asset registration failed");

  if (via_param_event) {
    KesshoProductEvent param_event{};
    param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    param_event.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
    param_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID;
    param_event.value = attack_seconds;
    require(kessho_product_enqueue_event(engine, &param_event) == KESSHO_PRODUCT_OK, "piano attack param enqueue failed");
  }

  std::vector<float> left(128);
  std::vector<float> right(128);
  triggerPianoNoteWithVelocity(engine, 60.0f, 1.0f);
  kessho_product_render(engine, left.data(), right.data(), 128);
  const float rendered_peak = std::max(peak(left), peak(right));
  kessho_product_destroy(engine);
  return rendered_peak;
}

} // namespace

int main() {
  constexpr uint32_t asset_id = 7001;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot(asset_id);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  triggerPiano(engine);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(peak(left) == 0.0f && peak(right) == 0.0f, "missing piano asset should not fake host playback");
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.asset_missing_count == 1, "missing asset telemetry not incremented");

  float sample_data[256]{};
  for (uint32_t i = 0; i < 256; ++i) {
    sample_data[i] = std::sin(static_cast<float>(i) * 0.07f);
  }
  const float* channels[1] = {sample_data};
  require(
      kessho_product_register_asset_buffer(engine, asset_id, channels, 1, 256, 48000.0, KESSHO_PRODUCT_ASSET_PIANO) ==
          KESSHO_PRODUCT_OK,
      "asset registration failed");
  telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.active_assets == 1, "registered asset telemetry mismatch");

  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  triggerPiano(engine);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(peak(left) > 0.001f || peak(right) > 0.001f, "registered asset did not render");

  require(kessho_product_unregister_asset_buffer(engine, asset_id) == KESSHO_PRODUCT_OK, "asset unregister failed");
  telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.active_assets == 0, "asset unregister telemetry mismatch");
  kessho_product_destroy(engine);

  constexpr uint32_t piano_asset_id_base = 7200;
  KesshoProductEngine* piano_select_engine = kessho_product_create(48000.0, 128, 0);
  require(piano_select_engine != nullptr, "piano selection engine create failed");
  KesshoProductSnapshotV2 piano_select_snapshot = makeSnapshot(piano_asset_id_base + 40);
  require(
      kessho_product_load_snapshot_v2(
          piano_select_engine,
          &piano_select_snapshot,
          sizeof(piano_select_snapshot)) == KESSHO_PRODUCT_OK,
      "piano selection snapshot load failed");
  float silent_piano_data[64]{};
  float high_piano_data[64]{};
  for (uint32_t i = 0; i < 64; ++i) {
    high_piano_data[i] = 0.5f;
  }
  const float* silent_piano_channels[1] = {silent_piano_data};
  const float* high_piano_channels[1] = {high_piano_data};
  require(
      kessho_product_register_asset_buffer(
          piano_select_engine,
          piano_asset_id_base + 40,
          silent_piano_channels,
          1,
          64,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "default piano selection asset registration failed");
  require(
      kessho_product_register_asset_buffer(
          piano_select_engine,
          piano_asset_id_base + 52,
          high_piano_channels,
          1,
          64,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "high piano selection asset registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  triggerPianoNote(piano_select_engine, 72.0f);
  kessho_product_render(piano_select_engine, left.data(), right.data(), 128);
  require(peak(left) > 0.001f || peak(right) > 0.001f, "piano did not select nearest registered sample");
  kessho_product_destroy(piano_select_engine);

  constexpr uint32_t piano_short_asset_id_base = piano_asset_id_base + 64;
  KesshoProductEngine* piano_variant_engine = kessho_product_create(48000.0, 128, 0);
  require(piano_variant_engine != nullptr, "piano variant engine create failed");
  KesshoProductSnapshotV2 piano_variant_snapshot = makeSnapshot(piano_asset_id_base + 40);
  require(
      kessho_product_load_snapshot_v2(
          piano_variant_engine,
          &piano_variant_snapshot,
          sizeof(piano_variant_snapshot)) == KESSHO_PRODUCT_OK,
      "piano variant snapshot load failed");
  float silent_variant_piano_data[64]{};
  float high_variant_piano_data[64]{};
  for (uint32_t i = 0; i < 64; ++i) {
    high_variant_piano_data[i] = 0.5f;
  }
  const float* silent_variant_piano_channels[1] = {silent_variant_piano_data};
  const float* high_variant_piano_channels[1] = {high_variant_piano_data};
  require(
      kessho_product_register_asset_buffer(
          piano_variant_engine,
          piano_asset_id_base + 40,
          silent_variant_piano_channels,
          1,
          64,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "regular piano variant asset registration failed");
  require(
      kessho_product_register_asset_buffer(
          piano_variant_engine,
          piano_short_asset_id_base + 40,
          high_variant_piano_channels,
          1,
          64,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "short piano variant asset registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  triggerPianoNoteWithVelocity(piano_variant_engine, 60.0f, 1.0f);
  kessho_product_render(piano_variant_engine, left.data(), right.data(), 128);
  require(peak(left) > 0.001f || peak(right) > 0.001f, "piano did not select Web-style short sample variant");
  kessho_product_destroy(piano_variant_engine);

  constexpr uint32_t piano_stereo_asset_id = piano_asset_id_base + 40;
  KesshoProductEngine* piano_stereo_engine = kessho_product_create(48000.0, 128, 0);
  require(piano_stereo_engine != nullptr, "piano stereo engine create failed");
  KesshoProductSnapshotV2 piano_stereo_snapshot = makeSnapshot(piano_stereo_asset_id);
  require(
      kessho_product_load_snapshot_v2(
          piano_stereo_engine,
          &piano_stereo_snapshot,
          sizeof(piano_stereo_snapshot)) == KESSHO_PRODUCT_OK,
      "piano stereo snapshot load failed");
  float stereo_piano_left[64]{};
  float stereo_piano_right[64]{};
  for (uint32_t i = 0; i < 64; ++i) {
    stereo_piano_left[i] = 0.5f;
    stereo_piano_right[i] = 0.0f;
  }
  const float* stereo_piano_channels[2] = {stereo_piano_left, stereo_piano_right};
  require(
      kessho_product_register_asset_buffer(
          piano_stereo_engine,
          piano_stereo_asset_id,
          stereo_piano_channels,
          2,
          64,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "stereo piano registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  triggerPiano(piano_stereo_engine);
  kessho_product_render(piano_stereo_engine, left.data(), right.data(), 128);
  require(peak(left) > 0.001f, "stereo piano left channel did not render");
  require(peak(right) < 0.000001f, "stereo piano right channel was collapsed from left");
  kessho_product_destroy(piano_stereo_engine);

  const float fast_attack_peak = renderPianoAttackProbe(0.001f);
  const float slow_attack_peak = renderPianoAttackProbe(0.5f);
  const float slow_attack_param_peak = renderPianoAttackProbe(0.5f, true);
  require(
      slow_attack_peak < fast_attack_peak * 0.2f,
      "piano source attack seconds did not shape Product Core sample playback");
  require(
      slow_attack_param_peak < fast_attack_peak * 0.2f,
      "piano source attack param event did not shape Product Core sample playback");

  constexpr uint32_t soundscape_asset_id = 7101;
  KesshoProductEngine* soundscape_engine = kessho_product_create(48000.0, 128, 0);
  require(soundscape_engine != nullptr, "soundscape engine create failed");
  KesshoProductSnapshotV2 soundscape_snapshot = makeSoundscapeSnapshot(soundscape_asset_id);
  require(
      kessho_product_load_snapshot_v2(soundscape_engine, &soundscape_snapshot, sizeof(soundscape_snapshot)) ==
          KESSHO_PRODUCT_OK,
      "soundscape snapshot load failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(soundscape_engine, left.data(), right.data(), 128);
  require(peak(left) == 0.0f && peak(right) == 0.0f, "missing soundscape asset should not fake host playback");
  telemetry = kessho_product_get_telemetry(soundscape_engine);
  require(telemetry.asset_missing_count == 1, "missing soundscape asset telemetry not incremented");

  float loop_data[32]{};
  for (uint32_t i = 0; i < 32; ++i) {
    loop_data[i] = std::sin(static_cast<float>(i) * 0.2f);
  }
  const float* loop_channels[1] = {loop_data};
  require(
      kessho_product_register_asset_buffer(
          soundscape_engine,
          soundscape_asset_id,
          loop_channels,
          1,
          32,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape asset registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(soundscape_engine, left.data(), right.data(), 128);
  require(peak(left) > 0.001f || peak(right) > 0.001f, "registered soundscape loop did not render");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(soundscape_engine, left.data(), right.data(), 128);
  require(peak(left) > 0.001f || peak(right) > 0.001f, "soundscape loop did not continue rendering");
  telemetry = kessho_product_get_telemetry(soundscape_engine);
  require(telemetry.active_assets == 1, "soundscape active asset telemetry mismatch");
  require(telemetry.active_voices >= 1, "soundscape loop voice did not remain active");
  kessho_product_destroy(soundscape_engine);

  constexpr uint32_t soundscape_layer_a_id = 7104;
  constexpr uint32_t soundscape_layer_b_id = 7105;
  KesshoProductEngine* soundscape_layer_engine = kessho_product_create(48000.0, 128, 0);
  require(soundscape_layer_engine != nullptr, "soundscape layer engine create failed");
  KesshoProductSnapshotV2 soundscape_layer_snapshot = makeSoundscapeSnapshot(soundscape_layer_a_id);
  soundscape_layer_snapshot.asset_refs[0] = soundscape_layer_a_id;
  soundscape_layer_snapshot.asset_ref_levels[0] = 1.0f;
  soundscape_layer_snapshot.asset_refs[1] = soundscape_layer_b_id;
  soundscape_layer_snapshot.asset_ref_levels[1] = 1.0f;
  require(
      kessho_product_load_snapshot_v2(
          soundscape_layer_engine,
          &soundscape_layer_snapshot,
          sizeof(soundscape_layer_snapshot)) == KESSHO_PRODUCT_OK,
      "soundscape layer snapshot load failed");
  float loop_layer_a[32]{};
  float loop_layer_b[32]{};
  for (uint32_t i = 0; i < 32; ++i) {
    loop_layer_a[i] = 0.25f;
    loop_layer_b[i] = 0.35f;
  }
  const float* loop_layer_a_channels[1] = {loop_layer_a};
  const float* loop_layer_b_channels[1] = {loop_layer_b};
  require(
      kessho_product_register_asset_buffer(
          soundscape_layer_engine,
          soundscape_layer_a_id,
          loop_layer_a_channels,
          1,
          32,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape layer A registration failed");
  require(
      kessho_product_register_asset_buffer(
          soundscape_layer_engine,
          soundscape_layer_b_id,
          loop_layer_b_channels,
          1,
          32,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape layer B registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(soundscape_layer_engine, left.data(), right.data(), 128);
  require(peak(left) > 0.35f || peak(right) > 0.35f, "layered soundscape assets did not mix");
  telemetry = kessho_product_get_telemetry(soundscape_layer_engine);
  require(telemetry.active_assets == 2, "layered soundscape active asset telemetry mismatch");
  require(telemetry.active_voices >= 2, "layered soundscape voices were not scheduled");
  kessho_product_destroy(soundscape_layer_engine);

  constexpr uint32_t soundscape_crossfade_id = 7106;
  KesshoProductEngine* soundscape_crossfade_engine = kessho_product_create(48000.0, 128, 0);
  require(soundscape_crossfade_engine != nullptr, "soundscape crossfade engine create failed");
  KesshoProductSnapshotV2 soundscape_crossfade_snapshot = makeSoundscapeSnapshot(soundscape_crossfade_id);
  require(
      kessho_product_load_snapshot_v2(
          soundscape_crossfade_engine,
          &soundscape_crossfade_snapshot,
          sizeof(soundscape_crossfade_snapshot)) == KESSHO_PRODUCT_OK,
      "soundscape crossfade snapshot load failed");
  float loop_crossfade_data[16]{};
  for (uint32_t i = 8; i < 16; ++i) {
    loop_crossfade_data[i] = 1.0f;
  }
  const float* loop_crossfade_channels[1] = {loop_crossfade_data};
  require(
      kessho_product_register_asset_buffer(
          soundscape_crossfade_engine,
          soundscape_crossfade_id,
          loop_crossfade_channels,
          1,
          16,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape crossfade registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(soundscape_crossfade_engine, left.data(), right.data(), 16);
  require(std::fabs(left[8]) > 0.1f, "soundscape crossfade test did not reach loop seam");
  require(
      std::fabs(left[15]) < std::fabs(left[8]) * 0.25f,
      "soundscape loop seam was not crossfaded toward loop start");
  kessho_product_destroy(soundscape_crossfade_engine);

  constexpr uint32_t soundscape_random_id = 7107;
  KesshoProductEngine* soundscape_random_engine = kessho_product_create(48000.0, 128, 0);
  require(soundscape_random_engine != nullptr, "soundscape randomization engine create failed");
  KesshoProductSnapshotV2 soundscape_random_snapshot = makeSoundscapeSnapshot(soundscape_random_id);
  require(
      kessho_product_load_snapshot_v2(
          soundscape_random_engine,
          &soundscape_random_snapshot,
          sizeof(soundscape_random_snapshot)) == KESSHO_PRODUCT_OK,
      "soundscape randomization snapshot load failed");
  float loop_random_data[256]{};
  const uint32_t expected_random_start = expectedSoundscapeRandomStart(
      soundscape_random_snapshot.rng.seed,
      soundscape_random_id,
      256);
  require(expected_random_start > 0u && expected_random_start < 256u, "soundscape randomization fixture seed is invalid");
  loop_random_data[expected_random_start] = 1.0f;
  const float* loop_random_channels[1] = {loop_random_data};
  require(
      kessho_product_register_asset_buffer(
          soundscape_random_engine,
          soundscape_random_id,
          loop_random_channels,
          1,
          256,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape randomization registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(soundscape_random_engine, left.data(), right.data(), 1);
  require(
      std::max(std::fabs(left[0]), std::fabs(right[0])) > 0.001f,
      "soundscape layer did not start at the deterministic randomized asset offset");
  kessho_product_destroy(soundscape_random_engine);

  constexpr uint32_t soundscape_texture_id = 7101;
  KesshoProductEngine* texture_engine = kessho_product_create(48000.0, 128, 0);
  require(texture_engine != nullptr, "soundscape texture engine create failed");
  KesshoProductSnapshotV2 texture_snapshot = makeTextureSoundscapeSnapshot(soundscape_texture_id);
  require(
      kessho_product_load_snapshot_v2(texture_engine, &texture_snapshot, sizeof(texture_snapshot)) ==
          KESSHO_PRODUCT_OK,
      "soundscape texture snapshot load failed");
  std::vector<float> texture_data(48000u * 36u);
  for (uint32_t i = 0; i < texture_data.size(); ++i) {
    texture_data[i] = 0.32f * std::sin(static_cast<float>(i) * 0.017f);
  }
  const float* texture_channels[1] = {texture_data.data()};
  require(
      kessho_product_register_asset_buffer(
          texture_engine,
          soundscape_texture_id,
          texture_channels,
          1,
          static_cast<uint32_t>(texture_data.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape texture asset registration failed");
  using namespace kessho::product::internal;
  bool texture_detune_varied = false;
  bool texture_speed_varied = false;
  for (uint32_t block = 0u; block < 14000u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(texture_engine, left.data(), right.data(), 128);
    const SoundscapeTextureRuntime& runtime =
        texture_engine->soundscape_texture_runtimes[kSoundscapeTextureSlotOcean];
    texture_detune_varied = texture_detune_varied || std::fabs(runtime.last_detune_cents) > 0.001f;
    texture_speed_varied = texture_speed_varied || std::fabs(runtime.last_speed_multiplier - 1.0f) > 0.001f;
    if (runtime.last_slice_id >= 20u) {
      break;
    }
  }
  const SoundscapeTextureRuntime& texture_runtime =
      texture_engine->soundscape_texture_runtimes[kSoundscapeTextureSlotOcean];
  require(texture_runtime.initialized, "normal soundscape texture mode did not initialize texture slices");
  require(texture_runtime.last_slice_id >= 20u, "normal soundscape texture mode did not schedule 20 slices");
  require(texture_runtime.last_max_offset > 10.0f, "soundscape texture max offset was too small for anti-repeat coverage");
  require(
      distinctRecentSoundscapeOffsets(texture_runtime) >= 4u,
      "soundscape texture recent-offset avoidance did not keep distinct offsets");
  require(texture_detune_varied, "soundscape texture detune variation stayed neutral in normal mode");
  require(texture_speed_varied, "soundscape texture speed variation stayed neutral in normal mode");
  telemetry = kessho_product_get_telemetry(texture_engine);
  require(
      telemetry.earth_texture_inactive_reasons[kSoundscapeTextureSlotOcean] ==
          KESSHO_PRODUCT_EARTH_TEXTURE_REASON_NONE,
      "normal soundscape texture telemetry did not report active texture mode");
  require(
      (telemetry.earth_texture_flags[kSoundscapeTextureSlotOcean] & KESSHO_PRODUCT_EARTH_TEXTURE_ACTIVE) != 0u,
      "normal soundscape texture telemetry did not set active flag");
  require(
      (telemetry.earth_texture_flags[kSoundscapeTextureSlotOcean] &
       KESSHO_PRODUCT_EARTH_TEXTURE_PARITY_FIXTURE) == 0u,
      "normal soundscape texture telemetry accidentally reported parity fixture mode");

  const uint32_t texture_seed_before_patch = texture_runtime.seed;
  const uint32_t texture_slice_before_patch = texture_runtime.last_slice_id;
  KesshoProductEvent texture_gain_event{};
  texture_gain_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  texture_gain_event.param_id = KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID;
  texture_gain_event.value = 0.92f;
  require(
      kessho_product_enqueue_event(texture_engine, &texture_gain_event) == KESSHO_PRODUCT_OK,
      "soundscape texture unrelated param enqueue failed");
  for (uint32_t block = 0u; block < 2500u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(texture_engine, left.data(), right.data(), 128);
    if (texture_engine->soundscape_texture_runtimes[kSoundscapeTextureSlotOcean].last_slice_id >
        texture_slice_before_patch) {
      break;
    }
  }
  const SoundscapeTextureRuntime& texture_runtime_after_patch =
      texture_engine->soundscape_texture_runtimes[kSoundscapeTextureSlotOcean];
  require(
      texture_runtime_after_patch.seed == texture_seed_before_patch,
      "soundscape texture seed reset after unrelated param patch");
  require(
      texture_runtime_after_patch.last_slice_id > texture_slice_before_patch,
      "soundscape texture sequence did not continue after unrelated param patch");
  kessho_product_destroy(texture_engine);

  KesshoProductEngine* parity_texture_engine = kessho_product_create(48000.0, 128, 0);
  require(parity_texture_engine != nullptr, "soundscape parity fixture engine create failed");
  KesshoProductSnapshotV2 parity_texture_snapshot = makeTextureSoundscapeSnapshot(soundscape_texture_id, true);
  require(
      kessho_product_load_snapshot_v2(
          parity_texture_engine,
          &parity_texture_snapshot,
          sizeof(parity_texture_snapshot)) == KESSHO_PRODUCT_OK,
      "soundscape parity fixture snapshot load failed");
  require(
      kessho_product_register_asset_buffer(
          parity_texture_engine,
          soundscape_texture_id,
          texture_channels,
          1,
          static_cast<uint32_t>(texture_data.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "soundscape parity fixture asset registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(parity_texture_engine, left.data(), right.data(), 128);
  telemetry = kessho_product_get_telemetry(parity_texture_engine);
  require(
      !parity_texture_engine->soundscape_texture_runtimes[kSoundscapeTextureSlotOcean].initialized,
      "soundscape parity fixture should stay on deterministic one-shot mode");
  require(
      telemetry.earth_texture_inactive_reasons[kSoundscapeTextureSlotOcean] ==
          KESSHO_PRODUCT_EARTH_TEXTURE_REASON_PARITY_FIXTURE_ENABLED,
      "soundscape parity fixture telemetry did not label parity mode");
  require(
      (telemetry.earth_texture_flags[kSoundscapeTextureSlotOcean] &
       KESSHO_PRODUCT_EARTH_TEXTURE_PARITY_FIXTURE) != 0u,
      "soundscape parity fixture telemetry did not set parity flag");
  kessho_product_destroy(parity_texture_engine);

  KesshoProductEngine* short_texture_engine = kessho_product_create(48000.0, 128, 0);
  require(short_texture_engine != nullptr, "short soundscape texture engine create failed");
  KesshoProductSnapshotV2 short_texture_snapshot = makeTextureSoundscapeSnapshot(soundscape_texture_id);
  require(
      kessho_product_load_snapshot_v2(
          short_texture_engine,
          &short_texture_snapshot,
          sizeof(short_texture_snapshot)) == KESSHO_PRODUCT_OK,
      "short soundscape texture snapshot load failed");
  std::vector<float> short_texture_data(4096u, 0.25f);
  const float* short_texture_channels[1] = {short_texture_data.data()};
  require(
      kessho_product_register_asset_buffer(
          short_texture_engine,
          soundscape_texture_id,
          short_texture_channels,
          1,
          static_cast<uint32_t>(short_texture_data.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "short soundscape texture asset registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(short_texture_engine, left.data(), right.data(), 128);
  telemetry = kessho_product_get_telemetry(short_texture_engine);
  require(
      telemetry.earth_texture_inactive_reasons[kSoundscapeTextureSlotOcean] ==
          KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_TOO_SHORT,
      "short soundscape texture telemetry did not report no-offset-variation reason");
  require(
      telemetry.earth_texture_max_offsets[kSoundscapeTextureSlotOcean] <= 0.0001f,
      "short soundscape texture telemetry reported usable max offset");
  kessho_product_destroy(short_texture_engine);

  constexpr uint32_t soundscape_water_policy_id = 7104;
  constexpr uint32_t soundscape_birds_policy_id = 7102;
  float policy_data[256]{};
  for (float& value : policy_data) {
    value = 1.0f;
  }
  const float* policy_channels[1] = {policy_data};
  KesshoProductEngine* water_policy_engine = kessho_product_create(48000.0, 128, 0);
  KesshoProductEngine* birds_policy_engine = kessho_product_create(48000.0, 128, 0);
  require(water_policy_engine != nullptr && birds_policy_engine != nullptr, "soundscape policy engine create failed");
  KesshoProductSnapshotV2 water_policy_snapshot = makeSoundscapeSnapshot(soundscape_water_policy_id);
  KesshoProductSnapshotV2 birds_policy_snapshot = makeSoundscapeSnapshot(soundscape_birds_policy_id);
  water_policy_snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].distance = 1.0f;
  birds_policy_snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1].distance = 1.0f;
  require(
      kessho_product_load_snapshot_v2(water_policy_engine, &water_policy_snapshot, sizeof(water_policy_snapshot)) ==
          KESSHO_PRODUCT_OK,
      "water soundscape policy snapshot load failed");
  require(
      kessho_product_load_snapshot_v2(birds_policy_engine, &birds_policy_snapshot, sizeof(birds_policy_snapshot)) ==
          KESSHO_PRODUCT_OK,
      "birds soundscape policy snapshot load failed");
  require(
      kessho_product_register_asset_buffer(
          water_policy_engine,
          soundscape_water_policy_id,
          policy_channels,
          1,
          256,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "water soundscape policy asset registration failed");
  require(
      kessho_product_register_asset_buffer(
          birds_policy_engine,
          soundscape_birds_policy_id,
          policy_channels,
          1,
          256,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "birds soundscape policy asset registration failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(water_policy_engine, left.data(), right.data(), 128);
  const float water_policy_spread = stereoSpread(left, right);
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(birds_policy_engine, left.data(), right.data(), 128);
  const float birds_policy_spread = stereoSpread(left, right);
  require(water_policy_spread > 0.0001f, "water soundscape policy did not render stereo spread");
  require(
      birds_policy_spread > water_policy_spread * 2.0f,
      "birds soundscape policy should render wider C++-owned stereo spread than water");
  kessho_product_destroy(water_policy_engine);
  kessho_product_destroy(birds_policy_engine);

  std::cout << "Kessho Product Asset tests passed\n";
  return 0;
}
