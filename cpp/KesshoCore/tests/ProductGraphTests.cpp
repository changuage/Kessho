#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductSchema.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "../src/product/generated/SampleLibraryRegistry.generated.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Graph test failed: " << message << "\n";
    std::exit(1);
  }
}

void enableGraphTaps(KesshoProductEngine* engine, const char* message) {
  require(kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK, message);
}

float peak(const std::vector<float>& values) {
  float result = 0.0f;
  for (float value : values) {
    require(std::isfinite(value), "non-finite output sample");
    result = std::max(result, std::fabs(value));
  }
  return result;
}

void applySourcePreset(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t preset_id) {
  require(source_id >= 1u && source_id <= kessho::product::internal::kSourceCount, "test preset source id out of range");
  const auto* preset = findSourcePreset(preset_id);
  require(sourcePresetMatchesSource(source_id, preset), "test preset id does not match source");
  kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);
}

void applySourceDefaults(KesshoProductSnapshotV2& snapshot) {
  for (uint32_t i = 0; i < kessho::product::internal::kSourceCount; ++i) {
    const uint32_t source_id = i + 1u;
    KesshoProductSourceSnapshot& source = snapshot.sources[i];
    source.source_id = source_id;
    applySourcePreset(snapshot, source_id, defaultSourcePresetId(source_id));
  }
}

float renderPeakForStem(
    KesshoProductEngine* engine,
    uint32_t stem_id,
    std::vector<float>& left,
    std::vector<float>& right,
    std::vector<float>& stem_l,
    std::vector<float>& stem_r,
    uint32_t blocks) {
  require(kessho_product_set_stems_enabled(engine, 1u) == KESSHO_PRODUCT_OK, "stem enable failed");
  float result = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    result = std::max(result, std::max(peak(left), peak(right)));
    require(
        kessho_product_get_stem(engine, stem_id, stem_l.data(), stem_r.data(), static_cast<uint32_t>(stem_l.size())) ==
            KESSHO_PRODUCT_OK,
        "stem read failed");
    result = std::max(result, std::max(peak(stem_l), peak(stem_r)));
  }
  return result;
}

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 0;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 77;
  snapshot.rng.state = 77;
  for (uint32_t i = 0; i < kessho::product::internal::kSourceCount; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.8f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  applySourceDefaults(snapshot);
  return snapshot;
}

void requireDirectGraphCoverage() {
  KesshoProductEngine direct(48000.0, 128, 0);
  direct.graph_taps_enabled = true;
  SourceState& pad = direct.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad.enabled = true;
  pad.source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL;
  direct.compileSourcePresetRuntime(pad);
  require(pad.source_preset_patch_valid, "direct graph pad preset did not compile");
  pad.level = 0.5f;
  pad.dry_gain = 1.0f;
  pad.reverb_send = 0.25f;
  pad.delay_a_send = 0.0f;
  pad.delay_b_send = 0.0f;
  pad.granular_send = 0.0f;

  float dry_l[4] = {1.0f, 0.5f, 0.25f, 0.125f};
  float dry_r[4] = {0.5f, 0.25f, 0.125f, 0.0625f};
  float out_l[4]{};
  float out_r[4]{};
  direct.mixSourceBuffer(KESSHO_PRODUCT_SOURCE_PAD1, dry_l, dry_r, dry_l, dry_r, out_l, out_r, 0u, 4u);
  require(std::fabs(out_l[0] - 0.5f) < 0.001f, "direct graph source mix left mismatch");
  require(std::fabs(out_r[0] - 0.25f) < 0.001f, "direct graph source mix right mismatch");
  require(std::fabs(direct.stem_l[KESSHO_PRODUCT_SOURCE_PAD1][0] - 0.5f) < 0.001f, "direct graph stem mix mismatch");
  require(std::fabs(direct.reverb_bus_l[0] - 0.25f) < 0.001f, "direct graph pre-fader send bus mix mismatch");

  direct.triggerVoice(KESSHO_PRODUCT_SOURCE_PAD1, 60.0f, 0.8f, 0.2f);
  std::vector<float> module_l(128);
  std::vector<float> module_r(128);
  float module_peak = 0.0f;
  for (uint32_t block = 0; block < 16u; ++block) {
    std::fill(module_l.begin(), module_l.end(), 0.0f);
    std::fill(module_r.begin(), module_r.end(), 0.0f);
    direct.renderProductModules(module_l.data(), module_r.data(), 0u, 128u);
    module_peak = std::max(module_peak, std::max(peak(module_l), peak(module_r)));
  }
  require(module_peak > 0.001f, "direct product graph render produced silence");
}

void requireFxSidechainGraphCapture() {
  KesshoProductEngine direct(48000.0, 128, 0);
  direct.graph_taps_enabled = true;
  direct.resetSidechainRuntime();
  const uint32_t targets[] = {
      kSidechainGranular,
      kSidechainDelayA,
      kSidechainDelayB,
      kSidechainReverb,
  };
  float input_l[4] = {1.0f, 0.5f, 0.25f, 0.125f};
  float input_r[4] = {0.5f, 0.25f, 0.125f, 0.0625f};
  float out_l[4]{};
  float out_r[4]{};
  for (uint32_t target : targets) {
    direct.mixFxBuffer(input_l, input_r, out_l, out_r, 0u, 4u, 0.5f, target);
    require(std::fabs(direct.graph_sidechain_input_l[target][0] - 0.5f) < 0.00001f, "FX sidechain input graph tap mismatch");
    require(std::fabs(direct.graph_sidechain_input_r[target][0] - 0.25f) < 0.00001f, "FX sidechain input graph tap right mismatch");
    require(std::fabs(direct.graph_sidechain_output_l[target][0] - 0.5f) < 0.00001f, "FX sidechain output graph tap mismatch");
    require(std::fabs(direct.graph_sidechain_output_r[target][0] - 0.25f) < 0.00001f, "FX sidechain output graph tap right mismatch");
    require(std::fabs(direct.sidechain_gains[target][0] - 1.0f) < 0.00001f, "FX sidechain gain trace default mismatch");
  }
}

void requireGranularPrimedOnSourceStart() {
  KesshoProductEngine direct(48000.0, 128, 0);
  direct.graph_taps_enabled = true;
  SourceState& piano = direct.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u];
  piano.enabled = true;
  piano.source_id = KESSHO_PRODUCT_SOURCE_PIANO;
  piano.level = 1.0f;
  piano.dry_gain = 1.0f;
  piano.expression = 1.0f;
  piano.granular_send = 1.0f;
  piano.granular_send_gain = 0.0f;
  piano.attack_seconds = 0.001f;
  piano.decay_seconds = 0.02f;
  piano.sustain = 1.0f;
  piano.hold_seconds = 0.1f;
  piano.release_seconds = 0.1f;
  piano.post_lpf_hz = 20000.0f;
  piano.stereo_width = 1.0f;
  piano.sample_library_id = kessho::product::internal::kSampleLibraryPiano;
  piano.sample_role_id = kessho::product::internal::kSampleRoleAny;
  piano.sample_articulation_id = kessho::product::internal::kSampleArticulationAny;
  piano.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
  piano.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY;
  piano.sample_fixed_dynamic_id = kessho::product::internal::kSampleDynamicRegular;
  piano.sample_loop_enabled = false;
  piano.sample_max_voices = kessho::product::internal::kSampleDefaultMaxVoices;
  piano.sample_variant_mode = KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
  direct.fx.granular_enabled = true;
  direct.fx.granular_mix = 0.75f;
  direct.granular_mix_gain = 0.0f;
  direct.routing.granular_to_reverb = 0.25f;
  direct.granular_reverb_send_gain = 0.0f;

  float piano_samples[256];
  std::fill(piano_samples, piano_samples + 256, 1.0f);
  direct.assets[0].active = true;
  direct.assets[0].asset_id = kessho::product::internal::kPianoShortAssetIdBase + (60u - kessho::product::internal::kPianoBaseMidi + 1u);
  direct.assets[0].channels[0] = piano_samples;
  direct.assets[0].channel_count = 1u;
  direct.assets[0].frame_count = 256u;
  direct.assets[0].sample_rate = 48000.0;
  direct.assets[0].flags = KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_PIANO;

  require(
      direct.triggerVoice(KESSHO_PRODUCT_SOURCE_PIANO, 60.0f, 1.0f, 0.2f) != kProductInvalidVoiceIndex,
      "granular prime piano trigger failed");
  require(std::fabs(piano.granular_send_gain - 1.0f) < 0.00001f, "source-start granular send was not primed");
  require(std::fabs(direct.granular_mix_gain - 0.75f) < 0.00001f, "source-start granular return was not primed");
  require(std::fabs(direct.granular_reverb_send_gain - 0.25f) < 0.00001f, "source-start granular reverb return was not primed");

  float out_l[8]{};
  float out_r[8]{};
  direct.renderSampleVoices(out_l, out_r, 0u, 8u);
  require(direct.graph_piano_granular_send_l[0] > 0.001f, "effective piano granular send missed the transient");
  require(direct.granular_bus_l[0] > 0.001f, "granular bus missed the primed piano transient");
}

void requireSoundscapeLayerRouteGraphCoverage() {
  KesshoProductEngine direct(48000.0, 128, 0);
  direct.graph_taps_enabled = true;
  SourceState& source = direct.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  source.enabled = true;
  source.source_id = KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_OCEAN_SAMPLE;
  source.dry_gain = 1.0f;
  source.reverb_send = 0.9f;
  source.delay_a_send = 0.8f;
  source.delay_b_send = 0.7f;
  source.granular_send = 0.6f;
  source.soundscape_texture_param_count = kSoundscapeLayerRouteParamCount;
  source.soundscape_texture_params[kSoundscapeLayerOcean * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteReverb] = 0.25f;
  source.soundscape_texture_params[kSoundscapeLayerOcean * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteDelayA] = 0.10f;
  source.soundscape_texture_params[kSoundscapeLayerOcean * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteDelayB] = 0.15f;
  source.soundscape_texture_params[kSoundscapeLayerOcean * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteGranular] = 0.20f;
  source.soundscape_texture_params[kSoundscapeLayerWater * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteReverb] = 0.75f;
  source.soundscape_texture_params[kSoundscapeLayerWater * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteDelayA] = 0.30f;
  source.soundscape_texture_params[kSoundscapeLayerWater * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteDelayB] = 0.35f;
  source.soundscape_texture_params[kSoundscapeLayerWater * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteGranular] = 0.40f;
  source.asset_ref_count = 2u;
  source.asset_refs[0] = kSoundscapeAssetOcean;
  source.asset_ref_levels[0] = 0.2f;
  source.asset_refs[1] = kSoundscapeAssetWater;
  source.asset_ref_levels[1] = 0.4f;

  float ocean_samples[16];
  float water_samples[16];
  std::fill(ocean_samples, ocean_samples + 16, 1.0f);
  std::fill(water_samples, water_samples + 16, 0.5f);
  direct.assets[0].active = true;
  direct.assets[0].asset_id = kSoundscapeAssetOcean;
  direct.assets[0].channels[0] = ocean_samples;
  direct.assets[0].channel_count = 1u;
  direct.assets[0].frame_count = 16u;
  direct.assets[0].sample_rate = 48000.0;
  direct.assets[0].flags = KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE;
  direct.assets[1] = direct.assets[0];
  direct.assets[1].asset_id = kSoundscapeAssetWater;
  direct.assets[1].channels[0] = water_samples;

  for (uint32_t slot = 0; slot < 2u; ++slot) {
    Voice& voice = direct.voices[slot];
    voice.active = true;
    voice.source_id = KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
    voice.asset_slot = slot;
    voice.sample_voice = true;
    voice.looping = true;
    voice.sample_step = 1.0;
    voice.amplitude = 1.0f;
    voice.remaining_frames = 16u;
    voice.total_frames = 16u;
  }

  float out_l[4]{};
  float out_r[4]{};
  direct.renderSampleVoices(out_l, out_r, 0u, 4u);
  const float ocean_dry = direct.graph_soundscape_layer_dry_l[kSoundscapeLayerOcean][0];
  const float water_dry = direct.graph_soundscape_layer_dry_l[kSoundscapeLayerWater][0];
  require(ocean_dry > 0.0001f && water_dry > 0.0001f, "soundscape layer dry graph taps stayed silent");
  const float ocean_reverb = direct.graph_soundscape_layer_reverb_send_l[kSoundscapeLayerOcean][0];
  const float ocean_delay_a = direct.graph_soundscape_layer_delay_a_send_l[kSoundscapeLayerOcean][0];
  const float water_reverb = direct.graph_soundscape_layer_reverb_send_l[kSoundscapeLayerWater][0];
  const float water_delay_a = direct.graph_soundscape_layer_delay_a_send_l[kSoundscapeLayerWater][0];
  const float water_granular = direct.graph_soundscape_layer_granular_send_l[kSoundscapeLayerWater][0];
  require(
      std::fabs(ocean_reverb * 0.10f - ocean_delay_a * 0.25f) < 0.00001f,
      "ocean layer reverb send did not use layer route");
  require(
      std::fabs(ocean_reverb - ocean_dry * 0.25f) < 0.00001f,
      "ocean layer reverb send did not use level-scaled layer signal");
  require(
      std::fabs(water_reverb * 0.30f - water_delay_a * 0.75f) < 0.00001f,
      "water layer reverb send did not use layer route");
  require(
      std::fabs(water_reverb - water_dry * 0.75f) < 0.00001f,
      "water layer reverb send did not use level-scaled layer signal");
  require(
      std::fabs(water_granular * 0.30f - water_delay_a * 0.40f) < 0.00001f,
      "water layer Delay A send did not use layer route");
  require(
      std::fabs(water_reverb - ocean_reverb) > 0.00001f,
      "water layer granular send did not use layer route");
  require(
      std::fabs(direct.reverb_bus_l[0] - (ocean_reverb + water_reverb)) < 0.00001f,
      "soundscape reverb bus did not use per-layer routes");
}

} // namespace

int main() {
  requireDirectGraphCoverage();
  requireFxSidechainGraphCapture();
  requireGranularPrimedOnSourceStart();
  requireSoundscapeLayerRouteGraphCoverage();

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  enableGraphTaps(engine, "graph tap enable failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  applySourcePreset(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.8f;
  note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual note enqueue failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  require(
      renderPeakForStem(engine, KESSHO_PRODUCT_STEM_PAD1, left, right, stem_l, stem_r, 32u) > 0.001f,
      "manual pad note did not reach master output");
  require(
      kessho_product_get_stem(engine, 99, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "invalid stem id should be rejected");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  applySourcePreset(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].reverb_send = 0.35f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].delay_a_send = 0.25f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].delay_b_send = 0.2f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].granular_send = 0.3f;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.delay_a_time_left_ms = 10.0f;
  snapshot.fx.delay_a_time_right_ms = 10.0f;
  snapshot.fx.delay_a_mix = 0.35f;
  snapshot.fx.delay_a_filter_hz = 12000.0f;
  snapshot.fx.delay_b_enabled = 1;
  snapshot.fx.delay_b_activity = 1.0f;
  snapshot.fx.delay_b_base_time_ms = 20.0f;
  snapshot.fx.delay_b_mix = 0.35f;
  snapshot.fx.delay_b_tone = 1.0f;
  snapshot.fx.granular_enabled = 1;
  snapshot.fx.granular_mix = 0.25f;
  snapshot.fx.reverb_mix = 0.35f;
  snapshot.routing.delay_a_to_delay_b = 0.2f;
  snapshot.routing.delay_a_to_granular = 0.2f;
  snapshot.routing.delay_b_to_delay_a = 0.2f;
  snapshot.routing.delay_b_to_granular = 0.2f;
  snapshot.routing.delay_b_to_reverb = 0.2f;
  snapshot.routing.delay_to_reverb = 0.2f;
  snapshot.routing.granular_to_reverb = 0.2f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "graph tap snapshot load failed");
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "graph tap note enqueue failed");
  float graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_COUNT]{};
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    for (uint32_t tap = KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT; tap < KESSHO_PRODUCT_GRAPH_TAP_COUNT; ++tap) {
      require(
          kessho_product_get_graph_tap(engine, tap, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK,
          "graph tap read failed");
      graph_tap_peaks[tap] = std::max(graph_tap_peaks[tap], std::max(peak(stem_l), peak(stem_r)));
    }
  }
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT] > 0.00001f, "reverb input graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_INPUT] > 0.00001f, "Delay A input graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_INPUT] > 0.00001f, "Delay B input graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_INPUT] > 0.00001f, "granular input graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD1_DRY] > 0.00001f, "pad1 dry graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD1_REVERB_SEND] > 0.00001f, "pad1 reverb send graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD1_DELAY_A_SEND] > 0.00001f, "pad1 Delay A send graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD1_DELAY_B_SEND] > 0.00001f, "pad1 Delay B send graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD1_GRANULAR_SEND] > 0.00001f, "pad1 granular send graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_DYNAMICS_INPUT] > 0.00001f, "dynamics input graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_DYNAMICS_OUTPUT] > 0.00001f, "dynamics output graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_MASTER_PRE_LIMITER] > 0.00001f, "master pre-limiter graph tap stayed silent");
  require(graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_MASTER_POST_LIMITER] > 0.00001f, "master post-limiter graph tap stayed silent");
  require(
      kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_COUNT, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "invalid graph tap id should be rejected");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  applySourcePreset(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD2,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].enabled = 0;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].enabled = 1;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].level = 0.55f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].reverb_send = 0.3f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].delay_a_send = 0.2f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].delay_b_send = 0.18f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].granular_send = 0.22f;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.delay_a_time_left_ms = 10.0f;
  snapshot.fx.delay_a_time_right_ms = 10.0f;
  snapshot.fx.delay_a_mix = 0.2f;
  snapshot.fx.delay_b_enabled = 1;
  snapshot.fx.delay_b_activity = 1.0f;
  snapshot.fx.delay_b_base_time_ms = 20.0f;
  snapshot.fx.delay_b_mix = 0.2f;
  snapshot.fx.granular_enabled = 1;
  snapshot.fx.granular_mix = 0.2f;
  snapshot.fx.reverb_mix = 0.2f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "pad2 graph tap snapshot load failed");
  KesshoProductEvent pad2_note{};
  pad2_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  pad2_note.target_id = KESSHO_PRODUCT_SOURCE_PAD2;
  pad2_note.value = 64.0f;
  pad2_note.value2 = 0.75f;
  pad2_note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &pad2_note) == KESSHO_PRODUCT_OK, "graph tap pad2 note enqueue failed");
  float pad2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_COUNT]{};
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    for (uint32_t tap = KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT; tap < KESSHO_PRODUCT_GRAPH_TAP_COUNT; ++tap) {
      require(
          kessho_product_get_graph_tap(engine, tap, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK,
          "pad2 graph tap read failed");
      pad2_graph_tap_peaks[tap] = std::max(pad2_graph_tap_peaks[tap], std::max(peak(stem_l), peak(stem_r)));
    }
  }
  require(pad2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD2_DRY] > 0.00001f, "pad2 dry graph tap stayed silent");
  require(pad2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD2_REVERB_SEND] > 0.00001f, "pad2 reverb send graph tap stayed silent");
  require(pad2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD2_DELAY_A_SEND] > 0.00001f, "pad2 Delay A send graph tap stayed silent");
  require(pad2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD2_DELAY_B_SEND] > 0.00001f, "pad2 Delay B send graph tap stayed silent");
  require(pad2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PAD2_GRANULAR_SEND] > 0.00001f, "pad2 granular send graph tap stayed silent");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].enabled = 0;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].enabled = 1;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].level = 0.5f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].reverb_send = 0.3f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].delay_a_send = 0.2f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].delay_b_send = 0.18f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].granular_send = 0.22f;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.delay_b_enabled = 1;
  snapshot.fx.delay_b_activity = 1.0f;
  snapshot.fx.granular_enabled = 1;
  snapshot.fx.reverb_mix = 0.2f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead1 graph tap snapshot load failed");
  KesshoProductEvent lead1_tap_note{};
  lead1_tap_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  lead1_tap_note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead1_tap_note.value = 64.0f;
  lead1_tap_note.value2 = 0.75f;
  lead1_tap_note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &lead1_tap_note) == KESSHO_PRODUCT_OK, "graph tap lead1 note enqueue failed");
  float lead1_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_COUNT]{};
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    for (uint32_t tap = KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT; tap < KESSHO_PRODUCT_GRAPH_TAP_COUNT; ++tap) {
      require(
          kessho_product_get_graph_tap(engine, tap, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK,
          "lead1 graph tap read failed");
      lead1_graph_tap_peaks[tap] = std::max(lead1_graph_tap_peaks[tap], std::max(peak(stem_l), peak(stem_r)));
    }
  }
  require(lead1_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DRY] > 0.00001f, "lead1 dry graph tap stayed silent");
  require(lead1_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD1_REVERB_SEND] > 0.00001f, "lead1 reverb send graph tap stayed silent");
  require(lead1_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DELAY_A_SEND] > 0.00001f, "lead1 Delay A send graph tap stayed silent");
  require(lead1_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DELAY_B_SEND] > 0.00001f, "lead1 Delay B send graph tap stayed silent");
  require(lead1_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD1_GRANULAR_SEND] > 0.00001f, "lead1 granular send graph tap stayed silent");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].enabled = 0;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].enabled = 1;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].level = 0.5f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].reverb_send = 0.3f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].delay_a_send = 0.2f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].delay_b_send = 0.18f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].granular_send = 0.22f;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.delay_b_enabled = 1;
  snapshot.fx.delay_b_activity = 1.0f;
  snapshot.fx.granular_enabled = 1;
  snapshot.fx.reverb_mix = 0.2f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead2 graph tap snapshot load failed");
  KesshoProductEvent lead2_tap_note{};
  lead2_tap_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  lead2_tap_note.target_id = KESSHO_PRODUCT_SOURCE_LEAD2;
  lead2_tap_note.value = 67.0f;
  lead2_tap_note.value2 = 0.75f;
  lead2_tap_note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &lead2_tap_note) == KESSHO_PRODUCT_OK, "graph tap lead2 note enqueue failed");
  float lead2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_COUNT]{};
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    for (uint32_t tap = KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT; tap < KESSHO_PRODUCT_GRAPH_TAP_COUNT; ++tap) {
      require(
          kessho_product_get_graph_tap(engine, tap, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK,
          "lead2 graph tap read failed");
      lead2_graph_tap_peaks[tap] = std::max(lead2_graph_tap_peaks[tap], std::max(peak(stem_l), peak(stem_r)));
    }
  }
  require(lead2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DRY] > 0.00001f, "lead2 dry graph tap stayed silent");
  require(lead2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD2_REVERB_SEND] > 0.00001f, "lead2 reverb send graph tap stayed silent");
  require(lead2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DELAY_A_SEND] > 0.00001f, "lead2 Delay A send graph tap stayed silent");
  require(lead2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DELAY_B_SEND] > 0.00001f, "lead2 Delay B send graph tap stayed silent");
  require(lead2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_LEAD2_GRANULAR_SEND] > 0.00001f, "lead2 granular send graph tap stayed silent");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].enabled = 0;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].enabled = 1;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].asset_id = 1002u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].level = 0.5f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].reverb_send = 0.3f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].delay_a_send = 0.2f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].delay_b_send = 0.18f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].granular_send = 0.22f;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.delay_b_enabled = 1;
  snapshot.fx.delay_b_activity = 1.0f;
  snapshot.fx.granular_enabled = 1;
  snapshot.fx.reverb_mix = 0.2f;
  std::vector<float> piano_graph_sample(512);
  for (uint32_t i = 0; i < piano_graph_sample.size(); ++i) {
    piano_graph_sample[i] = std::sin(static_cast<float>(i) * 0.08f) * 0.4f;
  }
  const float* piano_graph_channels[1] = {piano_graph_sample.data()};
  require(
      kessho_product_register_asset_buffer(engine, 1002u, piano_graph_channels, 1u, static_cast<uint32_t>(piano_graph_sample.size()), 48000.0, KESSHO_PRODUCT_ASSET_PIANO) ==
          KESSHO_PRODUCT_OK,
      "piano graph asset registration failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "piano graph tap snapshot load failed");
  KesshoProductEvent piano_tap_note{};
  piano_tap_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  piano_tap_note.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  piano_tap_note.value = 60.0f;
  piano_tap_note.value2 = 0.9f;
  piano_tap_note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &piano_tap_note) == KESSHO_PRODUCT_OK, "graph tap piano note enqueue failed");
  float piano_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_COUNT]{};
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    for (uint32_t tap = KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT; tap < KESSHO_PRODUCT_GRAPH_TAP_COUNT; ++tap) {
      require(
          kessho_product_get_graph_tap(engine, tap, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK,
          "piano graph tap read failed");
      piano_graph_tap_peaks[tap] = std::max(piano_graph_tap_peaks[tap], std::max(peak(stem_l), peak(stem_r)));
    }
  }
  require(piano_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PIANO_DRY] > 0.00001f, "piano dry graph tap stayed silent");
  require(piano_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PIANO_REVERB_SEND] > 0.00001f, "piano reverb send graph tap stayed silent");
  require(piano_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PIANO_DELAY_A_SEND] > 0.00001f, "piano Delay A send graph tap stayed silent");
  require(piano_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PIANO_DELAY_B_SEND] > 0.00001f, "piano Delay B send graph tap stayed silent");
  require(piano_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PIANO_GRANULAR_SEND] > 0.00001f, "piano granular send graph tap stayed silent");

  kessho_product_reset(engine);
  enableGraphTaps(engine, "sample2 graph taps enable failed");
  snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& sample2_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_SAMPLE2 - 1u];
  sample2_source.enabled = 1;
  sample2_source.level = 0.7f;
  sample2_source.reverb_send = 0.25f;
  sample2_source.delay_a_send = 0.2f;
  sample2_source.delay_b_send = 0.18f;
  sample2_source.granular_send = 0.22f;
  sample2_source.sample_library_id = kessho::product::generated::kSampleLibraryIdSoftStringSpurs;
  sample2_source.sample_role_id = kessho::product::generated::kSampleRoleIdHarmonic;
  sample2_source.sample_articulation_id = kessho::product::generated::kSampleArticulationIdHarmonic;
  sample2_source.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_MAPPED;
  sample2_source.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
  sample2_source.sample_fixed_dynamic_id = kessho::product::generated::kSampleDynamicIdSingle;
  sample2_source.sample_loop_enabled = 1;
  sample2_source.sample_max_voices = 12u;
  std::vector<float> sample2_graph_sample(4096);
  for (uint32_t i = 0; i < sample2_graph_sample.size(); ++i) {
    sample2_graph_sample[i] = std::sin(static_cast<float>(i) * 0.05f) * 0.35f;
  }
  const float* sample2_graph_channels[1] = {sample2_graph_sample.data()};
  require(
      kessho_product_register_asset_buffer(engine, 8201u, sample2_graph_channels, 1u, static_cast<uint32_t>(sample2_graph_sample.size()), 24000.0, KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_LOOP) ==
          KESSHO_PRODUCT_OK,
      "sample2 graph asset registration failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sample2 graph tap snapshot load failed");
  KesshoProductEvent sample2_tap_note{};
  sample2_tap_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  sample2_tap_note.target_id = KESSHO_PRODUCT_SOURCE_SAMPLE2;
  sample2_tap_note.value = 60.0f;
  sample2_tap_note.value2 = 0.9f;
  sample2_tap_note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &sample2_tap_note) == KESSHO_PRODUCT_OK, "graph tap sample2 note enqueue failed");
  float sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_COUNT]{};
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    for (uint32_t tap = KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT; tap < KESSHO_PRODUCT_GRAPH_TAP_COUNT; ++tap) {
      require(
          kessho_product_get_graph_tap(engine, tap, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK,
          "sample2 graph tap read failed");
      sample2_graph_tap_peaks[tap] = std::max(sample2_graph_tap_peaks[tap], std::max(peak(stem_l), peak(stem_r)));
    }
  }
  require(sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_DRY] > 0.00001f, "sample2 dry graph tap stayed silent");
  require(sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_REVERB_SEND] > 0.00001f, "sample2 reverb send graph tap stayed silent");
  require(sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_DELAY_A_SEND] > 0.00001f, "sample2 Delay A send graph tap stayed silent");
  require(sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_DELAY_B_SEND] > 0.00001f, "sample2 Delay B send graph tap stayed silent");
  require(sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_GRANULAR_SEND] > 0.00001f, "sample2 granular send graph tap stayed silent");
  require(sample2_graph_tap_peaks[KESSHO_PRODUCT_GRAPH_TAP_PIANO_DRY] < 0.000001f, "sample2 leaked into the piano/sample1 dry graph tap");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].enabled = 1;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead snapshot load failed");
  KesshoProductEvent lead_note{};
  lead_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  lead_note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_note.value = 72.0f;
  lead_note.value2 = 0.85f;
  lead_note.value3 = 0.24f;
  require(kessho_product_enqueue_event(engine, &lead_note) == KESSHO_PRODUCT_OK, "manual lead note enqueue failed");
  require(
      renderPeakForStem(engine, KESSHO_PRODUCT_STEM_LEAD1, left, right, stem_l, stem_r, 32u) > 0.001f,
      "manual lead note did not reach master output");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  applySourcePreset(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].enabled = 1;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].asset_id = 1001u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sample plus synth snapshot load failed");
  std::vector<float> piano_sample(512);
  for (uint32_t i = 0; i < piano_sample.size(); ++i) {
    piano_sample[i] = std::sin(static_cast<float>(i) * 0.08f) * 0.4f;
  }
  const float* piano_channels[1] = {piano_sample.data()};
  require(
      kessho_product_register_asset_buffer(engine, 1001u, piano_channels, 1u, static_cast<uint32_t>(piano_sample.size()), 48000.0, KESSHO_PRODUCT_ASSET_PIANO) ==
          KESSHO_PRODUCT_OK,
      "piano asset registration failed");
  note = {};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.8f;
  note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "simultaneous pad note enqueue failed");
  KesshoProductEvent piano_note{};
  piano_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  piano_note.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  piano_note.value = 60.0f;
  piano_note.value2 = 0.9f;
  piano_note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &piano_note) == KESSHO_PRODUCT_OK, "simultaneous piano note enqueue failed");
  float simultaneous_master_peak = 0.0f;
  float simultaneous_pad_peak = 0.0f;
  float simultaneous_piano_peak = 0.0f;
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
    simultaneous_master_peak = std::max(simultaneous_master_peak, std::max(peak(left), peak(right)));
    require(
        kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_PAD1, stem_l.data(), stem_r.data(), 128) ==
            KESSHO_PRODUCT_OK,
        "simultaneous pad stem read failed");
    simultaneous_pad_peak = std::max(simultaneous_pad_peak, std::max(peak(stem_l), peak(stem_r)));
    require(
        kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_PIANO, stem_l.data(), stem_r.data(), 128) ==
            KESSHO_PRODUCT_OK,
        "simultaneous piano stem read failed");
    simultaneous_piano_peak = std::max(simultaneous_piano_peak, std::max(peak(stem_l), peak(stem_r)));
  }
  require(simultaneous_master_peak > 0.001f, "simultaneous sample plus synth did not reach master output");
  require(simultaneous_pad_peak > 0.001f, "simultaneous pad stem was silent");
  require(simultaneous_piano_peak > 0.001f, "simultaneous piano stem was silent");

  KesshoProductEvent journey{};
  journey.event_kind = KESSHO_PRODUCT_EVENT_KIND_START_JOURNEY_MORPH_CLOCK;
  require(kessho_product_enqueue_event(engine, &journey) == KESSHO_PRODUCT_OK, "journey start enqueue failed");
  KesshoProductEvent start{};
  start.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  require(kessho_product_enqueue_event(engine, &start) == KESSHO_PRODUCT_OK, "transport start enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_morph_running == 1, "journey clock did not start");
  require(telemetry.journey_morph_phase > 0.0f, "journey clock phase did not advance");
  require(telemetry.transport_running == 1, "transport did not start");
  KesshoProductTelemetry copied_telemetry{};
  require(
      kessho_product_copy_telemetry(engine, &copied_telemetry) == KESSHO_PRODUCT_OK,
      "telemetry copy failed");
  require(copied_telemetry.transport_running == 1, "copied telemetry missed transport state");
  require(copied_telemetry.journey_morph_running == 1, "copied telemetry missed journey state");
  require(copied_telemetry.rng_seed == 77u, "copied telemetry missed RNG seed");
  require(copied_telemetry.rng_state == 77u, "copied telemetry missed RNG state");

  KesshoProductEvent stop_journey{};
  stop_journey.event_kind = KESSHO_PRODUCT_EVENT_KIND_STOP_JOURNEY_MORPH_CLOCK;
  require(kessho_product_enqueue_event(engine, &stop_journey) == KESSHO_PRODUCT_OK, "journey stop enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
  telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_morph_running == 0, "journey clock did not stop");

  kessho_product_destroy(engine);
  std::cout << "Kessho Product Graph tests passed\n";
  return 0;
}
