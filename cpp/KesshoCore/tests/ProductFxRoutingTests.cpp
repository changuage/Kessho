#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "KesshoProductSchema.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product FX Routing test failed: " << message << "\n";
    std::exit(1);
  }
}

float peak(const std::vector<float>& left, const std::vector<float>& right) {
  float result = 0.0f;
  for (size_t i = 0; i < left.size(); ++i) {
    require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite output sample");
    result = std::max(result, std::fabs(left[i]));
    result = std::max(result, std::fabs(right[i]));
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
  snapshot.harmony.root_midi = 60.0f;
  snapshot.harmony.scale_id = 1;
  snapshot.harmony.tension = 0.3f;
  snapshot.master.gain = 1.0f;
  snapshot.master.limiter_ceiling_db = -0.5f;
  snapshot.rng.seed = 123;
  snapshot.rng.state = 123;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.granular_enabled = 0;
  snapshot.fx.granular_feedback = 0.1f;
  snapshot.fx.granular_feedback_lpf_hz = 8000.0f;
  snapshot.fx.granular_buffer_seconds = 16.0f;
  snapshot.fx.granular_grain_shape = 0;
  snapshot.fx.granular_bus_diffusion = 0.0f;
  snapshot.fx.granular_timing_randomness = 0.35f;
  snapshot.fx.granular_chord_bias = 0.0f;
  snapshot.fx.granular_legacy_jitter_ms = 10.0f;
  snapshot.fx.granular_legacy_probability = 0.8f;
  snapshot.fx.granular_legacy_pitch_mode = 1;
  snapshot.fx.granular_legacy_pitch_spread = 2.0f;
  snapshot.fx.granular_legacy_max_grains = 64;
  snapshot.fx.granular_legacy_feedback = 0.1f;
  for (uint32_t i = 0; i < 4u; ++i) {
    snapshot.fx.granular_voices[i].enabled = i == 0u ? 1u : 0u;
    snapshot.fx.granular_voices[i].mode = 1u;
    snapshot.fx.granular_voices[i].slice = i * 4u;
    snapshot.fx.granular_voices[i].speed = 1.0f;
    snapshot.fx.granular_voices[i].scan_rate = 1.0f;
    snapshot.fx.granular_voices[i].pitch = 0.0f;
    snapshot.fx.granular_voices[i].write_follow = 0.0f;
    snapshot.fx.granular_voices[i].density = 20.0f;
    snapshot.fx.granular_voices[i].grain_size_ms = 80.0f;
    snapshot.fx.granular_voices[i].spray = 0.3f;
    snapshot.fx.granular_voices[i].grain_octave_probability = 0.0f;
    snapshot.fx.granular_voices[i].attack_seconds = 0.003f;
    snapshot.fx.granular_voices[i].decay_seconds = 0.5f;
    snapshot.fx.granular_voices[i].gain = 0.5f;
    snapshot.fx.granular_voices[i].pan = 0.0f;
    snapshot.fx.granular_voices[i].blur = 0.0f;
    snapshot.fx.granular_voices[i].stereo_spread = 0.5f;
  }
  snapshot.fx.delay_a_time_left_ms = 500.0f;
  snapshot.fx.delay_a_time_right_ms = 375.0f;
  snapshot.fx.delay_a_feedback = 0.4f;
  snapshot.fx.delay_a_filter_hz = 2000.0f;
  snapshot.fx.delay_a_width = 0.5f;
  snapshot.fx.delay_a_cross_feed_filter_hz = 8000.0f;
  snapshot.fx.delay_b_activity = 0.3f;
  snapshot.fx.delay_b_repeats = 0.3f;
  snapshot.fx.delay_b_base_time_ms = 500.0f;
  snapshot.fx.delay_b_tone = 0.5f;
  snapshot.fx.delay_b_warp_intensity = 0.5f;
  snapshot.fx.delay_b_spread = 0.5f;
  snapshot.fx.reverb_mix = 0.12f;
  snapshot.fx.reverb_type = 2;
  snapshot.fx.reverb_quality = 1;
  snapshot.fx.reverb_decay = 0.9f;
  snapshot.fx.reverb_size = 2.0f;
  snapshot.fx.reverb_damping = 0.2f;
  snapshot.fx.reverb_diffusion = 1.0f;
  snapshot.fx.reverb_modulation = 0.4f;
  snapshot.fx.reverb_predelay_ms = 60.0f;
  snapshot.fx.reverb_width = 0.85f;
  snapshot.fx.reverb_shimmer_amount = 0.0f;
  snapshot.fx.reverb_shimmer_pitch = 12.0f;
  snapshot.fx.reverb_slow_rate_hz = 0.05f;
  snapshot.fx.reverb_slow_depth = 0.0f;
  snapshot.fx.reverb_reverse_amount = 0.0f;
  snapshot.fx.reverb_reverse_length_sec = 2.0f;
  snapshot.fx.reverb_chorus_rate_hz = 0.5f;
  snapshot.fx.reverb_chorus_depth = 12.0f;
  snapshot.fx.reverb_mod_character = 2;
  snapshot.fx.reverb_damp_low = 0.1f;
  snapshot.fx.reverb_damp_high = 0.3f;
  snapshot.fx.reverb_crossover_hz = 800.0f;
  snapshot.fx.reverb_input_tone = 0.0f;
  snapshot.fx.reverb_shimmer_feedback = 0.0f;
  snapshot.fx.reverb_warp = 0.0f;
  snapshot.fx.reverb_cross_feed = 0.0f;
  snapshot.fx.reverb_early_reflections = 0.3f;
  snapshot.fx.reverb_air_absorption = 0.2f;
  snapshot.fx.reverb_saturation_mode = 0;
  snapshot.fx.reverb_transient_smooth = 0.0f;
  snapshot.fx.reverb_er_lp_freq = 2500.0f;
  snapshot.fx.spectral_freeze_enabled = 0;
  snapshot.fx.spectral_freeze_active = 0;
  snapshot.fx.spectral_freeze_slushy = 0;
  snapshot.fx.spectral_freeze_mix = 1.0f;
  snapshot.fx.spectral_freeze_speed = 0.3f;
  snapshot.fx.spectral_freeze_decay = 1.0f;
  snapshot.fx.spectral_freeze_phase_jitter = 0.0f;
  snapshot.fx.spectral_freeze_routing = 0u;
  snapshot.fx.spectral_freeze_reverb_crossfade = 1.0f;
  snapshot.fx.dynamics_character_bias = 0.5f;
  snapshot.fx.dynamics_character_lpg_amount = 0.5f;
  snapshot.fx.dynamics_character_resonance = 0.2f;
  snapshot.fx.dynamics_character_stereo = 0.5f;
  snapshot.fx.dynamics_character_rate = 0.3f;
  snapshot.fx.dynamics_character_damp = 0.5f;
  snapshot.fx.dynamics_degrade_wobble_speed = 0.35f;
  snapshot.fx.dynamics_degrade_tone = 0.5f;
  snapshot.fx.dynamics_degrade_lp = 1.0f;
  snapshot.fx.dynamics_saturation_tone = 0.5f;
  snapshot.fx.dynamics_saturation_bias = 0.5f;
  snapshot.fx.dynamics_end_comp_threshold = -18.0f;
  snapshot.fx.dynamics_end_comp_knee = 12.0f;
  snapshot.fx.dynamics_end_comp_ratio = 2.0f;
  snapshot.fx.dynamics_end_comp_attack_ms = 10.0f;
  snapshot.fx.dynamics_end_comp_release_ms = 180.0f;
  snapshot.fx.dynamics_end_comp_makeup = 1.0f;
  snapshot.fx.dynamics_end_comp_mix = 1.0f;
  snapshot.fx.dynamics_end_comp_detector_hp = 0.25f;
  snapshot.fx.dynamics_end_comp_detector_tilt = 0.5f;
  snapshot.fx.dynamics_end_comp_auto_makeup = 0.7f;
  snapshot.fx.dynamics_end_comp_program_release = 0.65f;
  snapshot.fx.sidechain_key_a = 2u;
  snapshot.fx.sidechain_key_b = 0u;
  snapshot.fx.sidechain_key_a_weight = 1.0f;
  snapshot.fx.sidechain_key_b_weight = 0.7f;
  snapshot.fx.sidechain_amount = 0.5f;
  snapshot.fx.sidechain_threshold = -24.0f;
  snapshot.fx.sidechain_ratio = 4.0f;
  snapshot.fx.sidechain_knee = 6.0f;
  snapshot.fx.sidechain_attack_ms = 5.0f;
  snapshot.fx.sidechain_hold_ms = 20.0f;
  snapshot.fx.sidechain_release_ms = 180.0f;
  snapshot.fx.sidechain_makeup = 1.0f;
  snapshot.fx.sidechain_mix = 1.0f;
  snapshot.fx.sidechain_curve = 0.5f;
  snapshot.fx.sidechain_detector_lp = 1.0f;
  snapshot.routing.delay_to_reverb = 0.2f;
  snapshot.routing.granular_to_reverb = 0.15f;
  snapshot.routing.delay_b_to_reverb = 0.4f;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

void triggerPad(KesshoProductEngine* engine, float hold_seconds) {
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.9f;
  note.value3 = hold_seconds;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual note enqueue failed");
}

void triggerLead(KesshoProductEngine* engine, float hold_seconds) {
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  note.value = 72.0f;
  note.value2 = 0.85f;
  note.value3 = hold_seconds;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual lead enqueue failed");
}

void triggerKick(KesshoProductEngine* engine, float velocity = 1.0f) {
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
  note.value = 37.0f;
  note.value2 = velocity;
  note.value3 = 0.05f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual kick enqueue failed");
}

float renderFxPeak(KesshoProductEngine* engine, uint32_t blocks) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> fx_l(128);
  std::vector<float> fx_r(128);
  float result = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
    require(kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_FX, fx_l.data(), fx_r.data(), 128) == KESSHO_PRODUCT_OK, "FX stem read failed");
    result = std::max(result, peak(fx_l, fx_r));
  }
  return result;
}

float renderMasterPeak(KesshoProductEngine* engine, uint32_t blocks) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  float result = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
    result = std::max(result, peak(left, right));
  }
  return result;
}

std::vector<float> renderMasterTrace(KesshoProductEngine* engine, uint32_t blocks) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> trace;
  trace.reserve(static_cast<size_t>(blocks) * 128u * 2u);
  for (uint32_t block = 0; block < blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
    for (uint32_t i = 0; i < 128u; ++i) {
      require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite trace sample");
      trace.push_back(left[i]);
      trace.push_back(right[i]);
    }
  }
  return trace;
}

float maxAbsDiff(const std::vector<float>& a, const std::vector<float>& b) {
  require(a.size() == b.size(), "trace size mismatch");
  float result = 0.0f;
  for (size_t i = 0; i < a.size(); ++i) {
    result = std::max(result, std::fabs(a[i] - b[i]));
  }
  return result;
}

struct RenderPeaks {
  float master = 0.0f;
  float fx = 0.0f;
};

RenderPeaks renderMasterAndFxPeaks(KesshoProductEngine* engine, uint32_t blocks) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> fx_l(128);
  std::vector<float> fx_r(128);
  RenderPeaks peaks{};
  for (uint32_t block = 0; block < blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
    peaks.master = std::max(peaks.master, peak(left, right));
    require(kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_FX, fx_l.data(), fx_r.data(), 128) == KESSHO_PRODUCT_OK, "FX stem read failed");
    peaks.fx = std::max(peaks.fx, peak(fx_l, fx_r));
  }
  return peaks;
}

float renderPadKickPeak(const KesshoProductSnapshotV2& snapshot) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "sidechain engine create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sidechain snapshot load failed");
  triggerKick(engine, 1.0f);
  triggerPad(engine, 0.5f);
  std::vector<float> left(128);
  std::vector<float> right(128);
  float result = 0.0f;
  for (uint32_t block = 0; block < 8u; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
    if (block > 0u) {
      result = std::max(result, peak(left, right));
    }
  }
  kessho_product_destroy(engine);
  return result;
}

void requireSidechainDucksPadTarget() {
  KesshoProductSnapshotV2 baseline = makeSnapshot();
  baseline.fx.reverb_mix = 0.0f;
  baseline.fx.delay_a_mix = 0.0f;
  baseline.fx.delay_b_mix = 0.0f;
  baseline.fx.dynamics_enabled = 0u;
  baseline.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1].level = 0.0f;

  KesshoProductSnapshotV2 ducked = baseline;
  ducked.fx.sidechain_enabled = 1u;
  ducked.fx.sidechain_key_a = 2u;
  ducked.fx.sidechain_key_a_weight = 1.0f;
  ducked.fx.sidechain_amount = 1.0f;
  ducked.fx.sidechain_threshold = -60.0f;
  ducked.fx.sidechain_ratio = 20.0f;
  ducked.fx.sidechain_attack_ms = 0.1f;
  ducked.fx.sidechain_hold_ms = 250.0f;
  ducked.fx.sidechain_release_ms = 1500.0f;
  ducked.fx.sidechain_makeup = 1.0f;
  ducked.fx.sidechain_mix = 1.0f;
  ducked.fx.sidechain_pad1_target = 1.0f;

  const float baseline_peak = renderPadKickPeak(baseline);
  const float ducked_peak = renderPadKickPeak(ducked);
  require(baseline_peak > 0.00001f, "sidechain baseline had no signal");
  require(ducked_peak < baseline_peak * 0.75f, "sidechain kick did not duck Pad 1 output");
}

void applyDelayParamToSnapshot(KesshoProductSnapshotV2& snapshot, uint32_t param_id, float value) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID:
      snapshot.fx.delay_a_feedback = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_APING_PONG_ID:
      snapshot.fx.delay_a_ping_pong = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_TYPE_ID:
      snapshot.fx.delay_a_filter_type = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BPATTERN_ID:
      snapshot.fx.delay_b_pattern = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_ID:
      snapshot.fx.delay_b_warp = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID:
      snapshot.fx.delay_b_spread = value;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID:
      snapshot.routing.delay_a_to_granular = value;
      break;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_REVERB_ID:
      snapshot.routing.delay_b_to_reverb = value;
      break;
    default:
      require(false, "unsupported delay snapshot param test");
  }
}

void applyReverbParamToSnapshot(KesshoProductSnapshotV2& snapshot, uint32_t param_id, float value) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_REVERB_TYPE_ID:
      snapshot.fx.reverb_type = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_QUALITY_ID:
      snapshot.fx.reverb_quality = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID:
      snapshot.fx.reverb_decay = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID:
      snapshot.fx.reverb_size = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID:
      snapshot.fx.reverb_shimmer_amount = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MOD_CHARACTER_ID:
      snapshot.fx.reverb_mod_character = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID:
      snapshot.fx.reverb_damp_high = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WARP_ID:
      snapshot.fx.reverb_warp = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SATURATION_MODE_ID:
      snapshot.fx.reverb_saturation_mode = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_ER_LP_FREQ_ID:
      snapshot.fx.reverb_er_lp_freq = value;
      break;
    default:
      require(false, "unsupported reverb snapshot param test");
  }
}

void applyGranularParamToSnapshot(KesshoProductSnapshotV2& snapshot, uint32_t param_id, float value) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_ENABLED_ID:
      snapshot.fx.granular_enabled = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID:
      snapshot.fx.granular_feedback = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_GRAIN_SHAPE_ID:
      snapshot.fx.granular_grain_shape = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID:
      snapshot.fx.granular_legacy_probability = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_DENSITY_ID:
      snapshot.fx.granular_voices[0].density = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_GAIN_ID:
      snapshot.fx.granular_voices[0].gain = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_PITCH_ID:
      snapshot.fx.granular_voices[0].pitch = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_REVERSE_ID:
      snapshot.fx.granular_voices[0].reverse = value >= 0.5f ? 1u : 0u;
      break;
    default:
      require(false, "unsupported granular snapshot param test");
  }
}

void applySpectralFreezeParamToSnapshot(KesshoProductSnapshotV2& snapshot, uint32_t param_id, float value) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID:
      snapshot.fx.spectral_freeze_mix = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ENABLED_ID:
      snapshot.fx.spectral_freeze_enabled = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ACTIVE_ID:
      snapshot.fx.spectral_freeze_active = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SLUSHY_ID:
      snapshot.fx.spectral_freeze_slushy = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SPEED_ID:
      snapshot.fx.spectral_freeze_speed = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DECAY_ID:
      snapshot.fx.spectral_freeze_decay = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_PHASE_JITTER_ID:
      snapshot.fx.spectral_freeze_phase_jitter = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ROUTING_ID:
      snapshot.fx.spectral_freeze_routing = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_REVERB_CROSSFADE_ID:
      snapshot.fx.spectral_freeze_reverb_crossfade = value;
      break;
    default:
      require(false, "unsupported spectral freeze snapshot param test");
  }
}

void applyDynamicsParamToSnapshot(KesshoProductSnapshotV2& snapshot, uint32_t param_id, float value) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_ENABLED_ID:
      snapshot.fx.dynamics_enabled = value >= 0.5f ? 1u : 0u;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MIX_ID:
      snapshot.fx.dynamics_character_mix = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MODE_ID:
      snapshot.fx.dynamics_character_mode = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_MIX_ID:
      snapshot.fx.dynamics_degrade_mix = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_ALIAS_ID:
      snapshot.fx.dynamics_degrade_alias = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID:
      snapshot.fx.dynamics_mod_slow_wow = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_FLUTTER_FLUTTER_ID:
      snapshot.fx.dynamics_mod_flutter_flutter = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_NOISE_ALIAS_ID:
      snapshot.fx.dynamics_mod_noise_alias = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID:
      snapshot.fx.dynamics_saturation_drive = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_MODE_ID:
      snapshot.fx.dynamics_saturation_mode = static_cast<uint32_t>(value);
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_THRESHOLD_ID:
      snapshot.fx.dynamics_end_comp_threshold = value;
      break;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MIX_ID:
      snapshot.fx.dynamics_end_comp_mix = value;
      break;
    default:
      require(false, "unsupported dynamics snapshot param test");
  }
}

void configureDelayATestSnapshot(KesshoProductSnapshotV2& snapshot) {
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_a_send = 1.0f;
  snapshot.fx.delay_a_enabled = 1;
  snapshot.fx.delay_a_time_left_ms = 120.0f;
  snapshot.fx.delay_a_time_right_ms = 180.0f;
  snapshot.fx.delay_a_mix = 1.0f;
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.routing.delay_to_reverb = 0.0f;
}

void configureDelayBTestSnapshot(KesshoProductSnapshotV2& snapshot) {
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_b_send = 1.0f;
  snapshot.fx.delay_b_enabled = 1;
  snapshot.fx.delay_b_base_time_ms = 120.0f;
  snapshot.fx.delay_b_mix = 1.0f;
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.routing.delay_b_to_reverb = 0.0f;
}

void configureReverbTestSnapshot(KesshoProductSnapshotV2& snapshot) {
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].reverb_send = 1.0f;
  snapshot.fx.reverb_mix = 1.0f;
  snapshot.routing.delay_to_reverb = 0.0f;
  snapshot.routing.granular_to_reverb = 0.0f;
}

void configureGranularTestSnapshot(KesshoProductSnapshotV2& snapshot) {
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].granular_send = 1.0f;
  snapshot.fx.granular_enabled = 1;
  snapshot.fx.granular_mix = 1.0f;
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.routing.granular_to_reverb = 0.0f;
}

void configureSpectralFreezeTestSnapshot(KesshoProductSnapshotV2& snapshot) {
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].reverb_send = 1.0f;
  snapshot.fx.spectral_freeze_enabled = 1;
  snapshot.fx.spectral_freeze_active = 1;
  snapshot.fx.spectral_freeze_mix = 1.0f;
  snapshot.fx.spectral_freeze_decay = 1.0f;
  snapshot.fx.spectral_freeze_routing = 0u;
  snapshot.fx.spectral_freeze_reverb_crossfade = 1.0f;
  snapshot.fx.reverb_mix = 0.5f;
}

void configureDynamicsTestSnapshot(KesshoProductSnapshotV2& snapshot) {
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.dynamics_enabled = 1;
  snapshot.fx.dynamics_character_enabled = 1;
  snapshot.fx.dynamics_character_mode = 2;
  snapshot.fx.dynamics_character_mix = 0.35f;
  snapshot.fx.dynamics_character_age = 0.2f;
  snapshot.fx.dynamics_character_bias = 0.44f;
  snapshot.fx.dynamics_character_lpg_amount = 0.7f;
  snapshot.fx.dynamics_character_resonance = 0.35f;
  snapshot.fx.dynamics_character_stereo = 0.65f;
  snapshot.fx.dynamics_character_env_follow = 0.45f;
  snapshot.fx.dynamics_character_depth = 0.72f;
  snapshot.fx.dynamics_character_rate = 0.18f;
  snapshot.fx.dynamics_character_damp = 0.62f;
  snapshot.fx.dynamics_degrade_enabled = 1;
  snapshot.fx.dynamics_degrade_mix = 0.45f;
  snapshot.fx.dynamics_degrade_age = 0.35f;
  snapshot.fx.dynamics_degrade_generation = 0.3f;
  snapshot.fx.dynamics_degrade_alias = 0.25f;
  snapshot.fx.dynamics_degrade_wow = 0.45f;
  snapshot.fx.dynamics_degrade_flutter = 0.28f;
  snapshot.fx.dynamics_degrade_drift = 0.42f;
  snapshot.fx.dynamics_degrade_wobble_speed = 0.4f;
  snapshot.fx.dynamics_degrade_tone = 0.42f;
  snapshot.fx.dynamics_degrade_hp = 0.08f;
  snapshot.fx.dynamics_degrade_lp = 0.82f;
  snapshot.fx.dynamics_degrade_noise = 0.3f;
  snapshot.fx.dynamics_degrade_saturation = 0.36f;
  snapshot.fx.dynamics_degrade_corrosion = 0.28f;
  snapshot.fx.dynamics_mod_slow_wow = 0.18f;
  snapshot.fx.dynamics_mod_flutter_flutter = 0.12f;
  snapshot.fx.dynamics_mod_noise_alias = 0.02f;
  snapshot.fx.dynamics_saturation_enabled = 1;
  snapshot.fx.dynamics_saturation_mode = 1;
  snapshot.fx.dynamics_saturation_drive = 0.22f;
  snapshot.fx.dynamics_saturation_tone = 0.48f;
  snapshot.fx.dynamics_saturation_bias = 0.52f;
  snapshot.fx.dynamics_end_comp_enabled = 1;
  snapshot.fx.dynamics_end_comp_threshold = -18.0f;
  snapshot.fx.dynamics_end_comp_knee = 10.0f;
  snapshot.fx.dynamics_end_comp_ratio = 2.8f;
  snapshot.fx.dynamics_end_comp_attack_ms = 12.0f;
  snapshot.fx.dynamics_end_comp_release_ms = 220.0f;
  snapshot.fx.dynamics_end_comp_makeup = 1.1f;
  snapshot.fx.dynamics_end_comp_mix = 0.8f;
  snapshot.fx.dynamics_end_comp_detector_hp = 0.32f;
  snapshot.fx.dynamics_end_comp_detector_tilt = 0.55f;
  snapshot.fx.dynamics_end_comp_auto_makeup = 0.6f;
  snapshot.fx.dynamics_end_comp_program_release = 0.7f;
}

std::vector<float> renderDelayParamTrace(uint32_t param_id, float value, bool delay_b, bool as_event) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "delay param parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  if (delay_b) {
    configureDelayBTestSnapshot(snapshot);
  } else {
    configureDelayATestSnapshot(snapshot);
  }
  if (!as_event) {
    applyDelayParamToSnapshot(snapshot, param_id, value);
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "delay param parity load failed");
  if (as_event) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = param_id;
    event.value = value;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "delay param event enqueue failed");
  }
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 160);
  kessho_product_destroy(engine);
  return trace;
}

void requireDelayParamSnapshotEventParity(uint32_t param_id, float value, bool delay_b, const char* message) {
  const std::vector<float> snapshot_trace = renderDelayParamTrace(param_id, value, delay_b, false);
  const std::vector<float> event_trace = renderDelayParamTrace(param_id, value, delay_b, true);
  require(maxAbsDiff(snapshot_trace, event_trace) < 0.00001f, message);
}

void requireDelayParamChangesTrace(uint32_t param_id, float value, bool delay_b, const char* message) {
  const std::vector<float> baseline_trace = renderDelayParamTrace(param_id, 0.0f, delay_b, false);
  const std::vector<float> changed_trace = renderDelayParamTrace(param_id, value, delay_b, false);
  require(maxAbsDiff(baseline_trace, changed_trace) > 0.00001f, message);
}

std::vector<float> renderReverbParamTrace(uint32_t param_id, float value, bool as_event) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "reverb param parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureReverbTestSnapshot(snapshot);
  if (!as_event) {
    applyReverbParamToSnapshot(snapshot, param_id, value);
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "reverb param parity load failed");
  if (as_event) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = param_id;
    event.value = value;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "reverb param event enqueue failed");
  }
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 160);
  kessho_product_destroy(engine);
  return trace;
}

void requireReverbParamSnapshotEventParity(uint32_t param_id, float value, const char* message) {
  const std::vector<float> snapshot_trace = renderReverbParamTrace(param_id, value, false);
  const std::vector<float> event_trace = renderReverbParamTrace(param_id, value, true);
  require(maxAbsDiff(snapshot_trace, event_trace) < 0.00001f, message);
}

void requireReverbParamChangesTrace(uint32_t param_id, float baseline, float value, const char* message) {
  const std::vector<float> baseline_trace = renderReverbParamTrace(param_id, baseline, false);
  const std::vector<float> changed_trace = renderReverbParamTrace(param_id, value, false);
  require(maxAbsDiff(baseline_trace, changed_trace) > 0.00001f, message);
}

std::vector<float> renderGranularParamTrace(uint32_t param_id, float value, bool as_event) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "granular param parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGranularTestSnapshot(snapshot);
  if (!as_event) {
    applyGranularParamToSnapshot(snapshot, param_id, value);
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "granular param parity load failed");
  if (as_event) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = param_id;
    event.value = value;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "granular param event enqueue failed");
  }
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 160);
  kessho_product_destroy(engine);
  return trace;
}

void requireGranularParamSnapshotEventParity(uint32_t param_id, float value, const char* message) {
  const std::vector<float> snapshot_trace = renderGranularParamTrace(param_id, value, false);
  const std::vector<float> event_trace = renderGranularParamTrace(param_id, value, true);
  require(maxAbsDiff(snapshot_trace, event_trace) < 0.00001f, message);
}

void requireGranularParamChangesTrace(uint32_t param_id, float baseline, float value, const char* message) {
  const std::vector<float> baseline_trace = renderGranularParamTrace(param_id, baseline, false);
  const std::vector<float> changed_trace = renderGranularParamTrace(param_id, value, false);
  require(maxAbsDiff(baseline_trace, changed_trace) > 0.00001f, message);
}

std::vector<float> renderSpectralFreezeParamTrace(uint32_t param_id, float value, bool as_event) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "spectral freeze param parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureSpectralFreezeTestSnapshot(snapshot);
  if (!as_event) {
    applySpectralFreezeParamToSnapshot(snapshot, param_id, value);
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "spectral freeze param parity load failed");
  if (as_event) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = param_id;
    event.value = value;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "spectral freeze param event enqueue failed");
  }
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 48);
  kessho_product_destroy(engine);
  return trace;
}

void requireSpectralFreezeParamSnapshotEventParity(uint32_t param_id, float value, const char* message) {
  const std::vector<float> snapshot_trace = renderSpectralFreezeParamTrace(param_id, value, false);
  const std::vector<float> event_trace = renderSpectralFreezeParamTrace(param_id, value, true);
  require(maxAbsDiff(snapshot_trace, event_trace) < 0.00001f, message);
}

void requireSpectralFreezeParamChangesTrace(uint32_t param_id, float baseline, float value, const char* message) {
  const std::vector<float> baseline_trace = renderSpectralFreezeParamTrace(param_id, baseline, false);
  const std::vector<float> changed_trace = renderSpectralFreezeParamTrace(param_id, value, false);
  require(maxAbsDiff(baseline_trace, changed_trace) > 0.00001f, message);
}

std::vector<float> renderDynamicsParamTrace(uint32_t param_id, float value, bool as_event) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "dynamics param parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureDynamicsTestSnapshot(snapshot);
  if (!as_event) {
    applyDynamicsParamToSnapshot(snapshot, param_id, value);
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "dynamics param parity load failed");
  if (as_event) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = param_id;
    event.value = value;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "dynamics param event enqueue failed");
  }
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 48);
  kessho_product_destroy(engine);
  return trace;
}

void requireDynamicsParamSnapshotEventParity(uint32_t param_id, float value, const char* message) {
  const std::vector<float> snapshot_trace = renderDynamicsParamTrace(param_id, value, false);
  const std::vector<float> event_trace = renderDynamicsParamTrace(param_id, value, true);
  require(maxAbsDiff(snapshot_trace, event_trace) < 0.00001f, message);
}

void requireDynamicsParamChangesTrace(uint32_t param_id, float baseline, float value, const char* message) {
  const std::vector<float> baseline_trace = renderDynamicsParamTrace(param_id, baseline, false);
  const std::vector<float> changed_trace = renderDynamicsParamTrace(param_id, value, false);
  require(maxAbsDiff(baseline_trace, changed_trace) > 0.00001f, message);
}

float renderMasterGainSampleHoldRangePeak(float value) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "master sample-hold range engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_mix = 0.0f;
  snapshot.fx.delay_b_mix = 0.0f;
  snapshot.fx.dynamics_enabled = 0u;
  snapshot.master.gain = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].level = 0.45f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].dry_gain = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].expression = 0.7f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "master sample-hold range snapshot load failed");

  KesshoProductEvent range{};
  range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  range.target_id = 0u;
  range.index = 301u;
  range.param_id = KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID;
  range.value = value;
  range.value2 = value;
  range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  range.value4 = value;
  range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &range) == KESSHO_PRODUCT_OK, "master sample-hold range enqueue failed");

  triggerPad(engine, 0.4f);
  const float result = renderMasterPeak(engine, 16);
  kessho_product_destroy(engine);
  return result;
}

void requireProductParamSampleHoldRangeChangesMaster() {
  const float quiet_peak = renderMasterGainSampleHoldRangePeak(0.2f);
  const float loud_peak = renderMasterGainSampleHoldRangePeak(0.8f);
  require(loud_peak > 0.00001f, "target-0 sample-hold range produced no master signal");
  require(quiet_peak < loud_peak * 0.55f, "target-0 sample-hold range did not apply Product Core master param");
}

float renderDryMasterPeakWithGain(float master_gain) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "master gain staging engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.master.gain = master_gain;
  snapshot.master.limiter_ceiling_db = 0.0f;
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_mix = 0.0f;
  snapshot.fx.delay_b_mix = 0.0f;
  snapshot.fx.granular_mix = 0.0f;
  snapshot.fx.granular_enabled = 0u;
  snapshot.fx.spectral_freeze_enabled = 0u;
  snapshot.fx.dynamics_enabled = 0u;
  snapshot.fx.dynamics_drive = 0.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].level = 0.25f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].dry_gain = 0.8f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].expression = 0.6f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "master gain staging snapshot load failed");
  triggerPad(engine, 0.4f);
  const float result = renderMasterPeak(engine, 16);
  kessho_product_destroy(engine);
  return result;
}

void requireMasterGainStagingScalesBeforeLimiter() {
  const float quiet_peak = renderDryMasterPeakWithGain(0.25f);
  const float loud_peak = renderDryMasterPeakWithGain(1.0f);
  require(quiet_peak > 0.00001f, "quiet master gain staging probe produced no signal");
  require(loud_peak > quiet_peak * 3.0f, "master gain staging did not scale before limiter");
  require(loud_peak < quiet_peak * 4.5f, "master gain staging scaled outside expected linear range");
}

void requireMasterTelemetryReportsLimiterSaturationAndLoudness() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "master telemetry engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.master.gain = 1.8f;
  snapshot.master.limiter_ceiling_db = -24.0f;
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_mix = 0.0f;
  snapshot.fx.delay_b_mix = 0.0f;
  snapshot.fx.granular_mix = 0.0f;
  snapshot.fx.granular_enabled = 0u;
  snapshot.fx.spectral_freeze_enabled = 0u;
  snapshot.fx.dynamics_enabled = 1u;
  snapshot.fx.dynamics_saturation_enabled = 1u;
  snapshot.fx.dynamics_saturation_drive = 0.42f;
  snapshot.fx.dynamics_saturation_mode = 2u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].level = 1.5f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].dry_gain = 2.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].expression = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "master telemetry snapshot load failed");
  triggerPad(engine, 1.0f);
  const float limited_peak = renderMasterPeak(engine, 32);
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(limited_peak <= 0.0645f, "master telemetry limiter probe did not clamp output");
  require(telemetry.master_input_peak > telemetry.master_output_peak, "telemetry did not report pre-limiter peak above output");
  require(telemetry.master_output_peak > 0.00001f, "telemetry master output peak missing");
  require(telemetry.master_output_rms > 0.000001f, "telemetry master loudness RMS missing");
  require(telemetry.master_true_peak >= telemetry.master_output_peak, "telemetry master true peak below sample peak");
  require(std::isfinite(telemetry.master_true_peak_dbtp), "telemetry master true peak dBTP missing");
  require(telemetry.master_true_peak_dbtp <= 0.25f, "telemetry master true peak dBTP exceeded limiter ceiling");
  require(std::isfinite(telemetry.master_integrated_lufs), "telemetry master integrated LUFS missing");
  require(telemetry.master_integrated_lufs > -100.0f, "telemetry master integrated LUFS stayed at silence");
  require(telemetry.master_limiter_gain_reduction_db > 1.0f, "telemetry limiter gain reduction missing");
  require(std::fabs(telemetry.dynamics_saturation_drive - 0.42f) < 0.001f, "telemetry dynamics saturation drive mismatch");
  kessho_product_destroy(engine);
}

void requireDisabledFxBypassKeepsDryAndSilencesFxStem() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "disabled FX bypass engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_enabled = 0u;
  snapshot.fx.delay_a_mix = 0.0f;
  snapshot.fx.delay_b_enabled = 0u;
  snapshot.fx.delay_b_mix = 0.0f;
  snapshot.fx.granular_enabled = 0u;
  snapshot.fx.granular_mix = 0.0f;
  snapshot.fx.spectral_freeze_enabled = 0u;
  snapshot.fx.spectral_freeze_mix = 0.0f;
  snapshot.fx.dynamics_enabled = 0u;
  snapshot.fx.dynamics_drive = 0.0f;
  snapshot.routing.delay_to_reverb = 0.0f;
  snapshot.routing.delay_a_to_delay_b = 0.0f;
  snapshot.routing.delay_b_to_delay_a = 0.0f;
  snapshot.routing.delay_a_to_granular = 0.0f;
  snapshot.routing.delay_b_to_granular = 0.0f;
  snapshot.routing.delay_b_to_reverb = 0.0f;
  snapshot.routing.granular_to_reverb = 0.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].reverb_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_a_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_b_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].granular_send = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "disabled FX bypass snapshot load failed");
  triggerPad(engine, 0.4f);
  const RenderPeaks peaks = renderMasterAndFxPeaks(engine, 64);
  require(peaks.master > 0.00001f, "disabled FX bypass suppressed dry signal");
  require(peaks.fx <= 0.000001f, "disabled FX bypass leaked wet FX stem");
  kessho_product_destroy(engine);
}

void requireProductResetClearsFxTails() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "FX tail reset engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].reverb_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_a_send = 1.0f;
  snapshot.fx.reverb_mix = 1.0f;
  snapshot.fx.delay_a_enabled = 1u;
  snapshot.fx.delay_a_mix = 1.0f;
  snapshot.fx.delay_a_feedback = 0.55f;
  snapshot.routing.delay_to_reverb = 0.4f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "FX tail reset snapshot load failed");
  triggerPad(engine, 0.15f);
  const RenderPeaks active = renderMasterAndFxPeaks(engine, 80);
  require(active.fx > 0.00001f, "FX tail reset probe did not build a wet tail");
  kessho_product_reset(engine);
  const RenderPeaks reset = renderMasterAndFxPeaks(engine, 16);
  require(reset.master <= 0.000001f, "Product reset did not clear master output tail");
  require(reset.fx <= 0.000001f, "Product reset did not clear FX stem tail");
  kessho_product_destroy(engine);
}

void requireModuleSourceFxSendsArePreFader() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pre-fader module send engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].enabled = 1u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].level = 0.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].dry_gain = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].delay_a_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].delay_b_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].granular_send = 1.0f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1].reverb_send = 1.0f;
  snapshot.fx.delay_a_enabled = 1u;
  snapshot.fx.delay_a_time_left_ms = 48.0f;
  snapshot.fx.delay_a_time_right_ms = 72.0f;
  snapshot.fx.delay_a_feedback = 0.25f;
  snapshot.fx.delay_a_mix = 1.0f;
  snapshot.fx.delay_b_enabled = 1u;
  snapshot.fx.delay_b_activity = 1.0f;
  snapshot.fx.delay_b_mix = 1.0f;
  snapshot.fx.granular_enabled = 1u;
  snapshot.fx.granular_mix = 1.0f;
  snapshot.fx.reverb_mix = 1.0f;
  snapshot.routing.delay_to_reverb = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pre-fader module send snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK,
      "pre-fader module send graph tap enable failed");
  triggerLead(engine, 0.45f);
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> fx_l(128);
  std::vector<float> fx_r(128);
  std::vector<float> tap_l(128);
  std::vector<float> tap_r(128);
  float master_peak = 0.0f;
  float fx_peak = 0.0f;
  float dry_peak = 0.0f;
  float reverb_send_peak = 0.0f;
  float delay_a_send_peak = 0.0f;
  float delay_b_send_peak = 0.0f;
  float granular_send_peak = 0.0f;
  for (uint32_t block = 0; block < 96u; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
    master_peak = std::max(master_peak, peak(left, right));
    require(kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_FX, fx_l.data(), fx_r.data(), 128) == KESSHO_PRODUCT_OK, "pre-fader FX stem read failed");
    fx_peak = std::max(fx_peak, peak(fx_l, fx_r));
    require(kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DRY, tap_l.data(), tap_r.data(), 128) == KESSHO_PRODUCT_OK, "pre-fader Lead dry graph tap read failed");
    dry_peak = std::max(dry_peak, peak(tap_l, tap_r));
    require(kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_LEAD1_REVERB_SEND, tap_l.data(), tap_r.data(), 128) == KESSHO_PRODUCT_OK, "pre-fader Lead reverb graph tap read failed");
    reverb_send_peak = std::max(reverb_send_peak, peak(tap_l, tap_r));
    require(kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DELAY_A_SEND, tap_l.data(), tap_r.data(), 128) == KESSHO_PRODUCT_OK, "pre-fader Lead Delay A graph tap read failed");
    delay_a_send_peak = std::max(delay_a_send_peak, peak(tap_l, tap_r));
    require(kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DELAY_B_SEND, tap_l.data(), tap_r.data(), 128) == KESSHO_PRODUCT_OK, "pre-fader Lead Delay B graph tap read failed");
    delay_b_send_peak = std::max(delay_b_send_peak, peak(tap_l, tap_r));
    require(kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_LEAD1_GRANULAR_SEND, tap_l.data(), tap_r.data(), 128) == KESSHO_PRODUCT_OK, "pre-fader Lead granular graph tap read failed");
    granular_send_peak = std::max(granular_send_peak, peak(tap_l, tap_r));
  }
  require(dry_peak <= 0.000001f, "zero-level Lead dry graph tap should stay silent");
  require(reverb_send_peak > 0.00001f, "zero-level Lead reverb send was muted by source level");
  require(delay_a_send_peak > 0.00001f, "zero-level Lead Delay A send was muted by source level");
  require(delay_b_send_peak > 0.00001f, "zero-level Lead Delay B send was muted by source level");
  require(granular_send_peak > 0.00001f, "zero-level Lead granular send was muted by source level");
  require(master_peak > 0.00001f, "pre-fader Lead FX sends did not reach master output");
  require(fx_peak > 0.00001f, "pre-fader Lead FX sends did not reach FX stem");
  kessho_product_destroy(engine);
}

std::vector<float> renderSnapshotFxTrace(uint32_t param_id, float value) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "snapshot FX event parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.fx.reverb_mix = 0.0f;
  if (param_id == KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID) {
    configureSpectralFreezeTestSnapshot(snapshot);
    snapshot.fx.spectral_freeze_mix = value;
  } else if (param_id == KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID) {
    snapshot.fx.dynamics_drive = value;
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot FX event parity load failed");
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 12);
  kessho_product_destroy(engine);
  return trace;
}

std::vector<float> renderEventFxTrace(uint32_t param_id, float value) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "live FX event parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.fx.reverb_mix = 0.0f;
  if (param_id == KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID) {
    configureSpectralFreezeTestSnapshot(snapshot);
  }
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "live FX event parity load failed");

  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = param_id;
  event.value = value;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "live FX param event enqueue failed");
  triggerPad(engine, 0.4f);
  std::vector<float> trace = renderMasterTrace(engine, 12);
  kessho_product_destroy(engine);
  return trace;
}

void requireFxSnapshotEventParity(uint32_t param_id, float value, const char* message) {
  const std::vector<float> snapshot_trace = renderSnapshotFxTrace(param_id, value);
  const std::vector<float> event_trace = renderEventFxTrace(param_id, value);
  require(maxAbsDiff(snapshot_trace, event_trace) < 0.00001f, message);
}

void requireDirectFxCoverage() {
  KesshoProductEngine direct(48000.0, 128, 0);
  for (uint32_t source = 0; source < kDynamicsModSourceCount; ++source) {
    for (uint32_t target = 0; target < kDynamicsModTargetCount; ++target) {
      direct.fx.dynamics_mod[source][target] = 0.0f;
    }
  }
  direct.fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWow] = 0.25f;
  direct.fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWow] = 0.5f;
  const float mod_sources[kDynamicsModSourceCount] = {1.0f, 0.5f, 0.0f, 0.0f, 0.0f};
  require(
      std::fabs(direct.dynamicsModRoute(mod_sources, kDynamicsModTargetWow) - 0.5f) < 0.001f,
      "direct dynamics modulation route mismatch");
  for (uint32_t source = 0; source < kDynamicsModSourceCount; ++source) {
    for (uint32_t target = 0; target < kDynamicsModTargetCount; ++target) {
      const float value = static_cast<float>((source + 1u) * (target + 2u)) / 40.0f;
      KesshoProductEvent event{};
      event.param_id = KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID + source * kDynamicsModTargetCount + target;
      event.value = value;
      require(direct.applyDynamicsModParamEvent(event), "direct dynamics modulation matrix event was not handled");
      require(
          std::fabs(direct.fx.dynamics_mod[source][target] - value) < 0.001f,
          "direct dynamics modulation matrix event mapped to wrong cell");
    }
  }

  direct.fx.sidechain_enabled = true;
  direct.fx.sidechain_key_a = kSidechainKeyKick;
  direct.fx.sidechain_key_b = kSidechainKeyOff;
  direct.fx.sidechain_key_a_weight = 1.0f;
  direct.fx.sidechain_amount = 1.0f;
  direct.fx.sidechain_mix = 1.0f;
  direct.fx.sidechain_threshold = -60.0f;
  direct.fx.sidechain_ratio = 20.0f;
  direct.fx.sidechain_knee = 0.0f;
  direct.fx.sidechain_attack_ms = 0.1f;
  direct.fx.sidechain_hold_ms = 0.0f;
  direct.fx.sidechain_release_ms = 20.0f;
  direct.fx.sidechain_targets[kSidechainPad1] = 1.0f;
  require(
      direct.sidechainTargetForSource(KESSHO_PRODUCT_SOURCE_PAD1) == kSidechainPad1,
      "direct sidechain source target mismatch");
  require(direct.sidechainTargetAmount(kSidechainPad1) > 0.99f, "direct sidechain target amount mismatch");
  direct.triggerSidechainDuck(1u, 1.0f);
  direct.renderSidechainGains(0u, 16u);
  require(direct.sidechainGain(kSidechainPad1, 0u) < 1.0f, "direct sidechain duck should lower gain");
  for (uint32_t block = 0; block < 24u; ++block) {
    direct.renderSidechainGains(0u, 128u);
  }
  require(direct.sidechainGain(kSidechainPad1, 127u) > 0.99f, "direct sidechain release did not return to unity");

  float in_l[4] = {1.0f, 0.5f, 0.25f, 0.125f};
  float in_r[4] = {0.5f, 0.25f, 0.125f, 0.0625f};
  float out_l[4]{};
  float out_r[4]{};
  direct.mixFxBuffer(in_l, in_r, out_l, out_r, 0u, 4u, 0.5f, kSidechainTargetCount);
  require(std::fabs(out_l[0] - 0.5f) < 0.001f, "direct FX bus mix left mismatch");
  require(std::fabs(out_r[0] - 0.25f) < 0.001f, "direct FX bus mix right mismatch");
}

} // namespace

int main() {
  requireDirectFxCoverage();

  KesshoProductEngine* reverb_engine = kessho_product_create(48000.0, 128, 0);
  require(reverb_engine != nullptr, "reverb engine create failed");
  KesshoProductSnapshotV2 reverb_snapshot = makeSnapshot();
  reverb_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].reverb_send = 1.0f;
  reverb_snapshot.fx.reverb_mix = 1.0f;
  require(kessho_product_load_snapshot_v2(reverb_engine, &reverb_snapshot, sizeof(reverb_snapshot)) == KESSHO_PRODUCT_OK, "reverb snapshot load failed");
  triggerPad(reverb_engine, 0.4f);
  require(renderFxPeak(reverb_engine, 64) > 0.00001f, "reverb send did not reach FX stem");
  kessho_product_destroy(reverb_engine);

  KesshoProductEngine* delay_engine = kessho_product_create(48000.0, 128, 0);
  require(delay_engine != nullptr, "delay engine create failed");
  KesshoProductSnapshotV2 delay_snapshot = makeSnapshot();
  delay_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_a_send = 1.0f;
  delay_snapshot.fx.delay_a_time_left_ms = 120.0f;
  delay_snapshot.fx.delay_a_time_right_ms = 180.0f;
  delay_snapshot.fx.delay_a_mix = 1.0f;
  delay_snapshot.fx.reverb_mix = 0.0f;
  require(kessho_product_load_snapshot_v2(delay_engine, &delay_snapshot, sizeof(delay_snapshot)) == KESSHO_PRODUCT_OK, "delay snapshot load failed");
  triggerPad(delay_engine, 0.4f);
  require(renderFxPeak(delay_engine, 120) > 0.00001f, "Delay A send did not reach FX stem");
  kessho_product_destroy(delay_engine);

  KesshoProductEngine* granular_engine = kessho_product_create(48000.0, 128, 0);
  require(granular_engine != nullptr, "granular engine create failed");
  KesshoProductSnapshotV2 granular_snapshot = makeSnapshot();
  granular_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].granular_send = 1.0f;
  granular_snapshot.fx.granular_enabled = 1;
  granular_snapshot.fx.granular_mix = 1.0f;
  granular_snapshot.fx.reverb_mix = 0.0f;
  require(kessho_product_load_snapshot_v2(granular_engine, &granular_snapshot, sizeof(granular_snapshot)) == KESSHO_PRODUCT_OK, "granular snapshot load failed");
  triggerPad(granular_engine, 0.4f);
  require(renderFxPeak(granular_engine, 32) > 0.00001f, "granular send did not reach FX stem");
  std::vector<float> granular_waveform(512u, 0.0f);
  require(
      kessho_product_copy_granular_waveform(
          granular_engine,
          granular_waveform.data(),
          static_cast<uint32_t>(granular_waveform.size())) == KESSHO_PRODUCT_OK,
      "granular waveform copy failed");
  require(
      std::any_of(granular_waveform.begin(), granular_waveform.end(), [](float value) {
        return value > 0.000001f;
      }),
      "granular waveform copy did not expose recorded buffer peaks");
  const KesshoProductTelemetry granular_telemetry = kessho_product_get_telemetry(granular_engine);
  require(granular_telemetry.active_grains > 0u, "granular telemetry did not report active grains");
  require(
      granular_telemetry.granular_write_head > 0.0f && granular_telemetry.granular_write_head <= 1.0f,
      "granular telemetry write head was not normalized");
  for (float position : granular_telemetry.granular_voice_positions) {
    require(position >= 0.0f && position <= 1.0f, "granular telemetry voice position was not normalized");
  }
  kessho_product_destroy(granular_engine);

  KesshoProductEngine* granular_input_only_engine = kessho_product_create(48000.0, 128, 0);
  require(granular_input_only_engine != nullptr, "granular input-only engine create failed");
  KesshoProductSnapshotV2 granular_input_only_snapshot = makeSnapshot();
  granular_input_only_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].granular_send = 1.0f;
  granular_input_only_snapshot.fx.granular_enabled = 1;
  granular_input_only_snapshot.fx.granular_mix = 0.0f;
  granular_input_only_snapshot.fx.reverb_mix = 0.0f;
  granular_input_only_snapshot.routing.granular_to_reverb = 0.0f;
  granular_input_only_snapshot.routing.granular_to_delay_a = 0.0f;
  granular_input_only_snapshot.routing.granular_to_delay_b = 0.0f;
  require(
      kessho_product_load_snapshot_v2(
          granular_input_only_engine,
          &granular_input_only_snapshot,
          sizeof(granular_input_only_snapshot)) == KESSHO_PRODUCT_OK,
      "granular input-only snapshot load failed");
  triggerPad(granular_input_only_engine, 0.4f);
  require(renderFxPeak(granular_input_only_engine, 48) < 0.000001f, "granular input-only path should not leak to FX stem");
  const KesshoProductTelemetry granular_input_only_telemetry = kessho_product_get_telemetry(granular_input_only_engine);
  require(
      granular_input_only_telemetry.active_grains > 0u,
      "granular input-only visual telemetry did not report active grains");
  require(
      granular_input_only_telemetry.granular_write_head > 0.0f &&
          granular_input_only_telemetry.granular_write_head <= 1.0f,
      "granular input-only visual telemetry write head was not advancing");
  for (float position : granular_input_only_telemetry.granular_voice_positions) {
    require(position >= 0.0f && position <= 1.0f, "granular input-only voice position was not normalized");
  }
  kessho_product_destroy(granular_input_only_engine);

  KesshoProductEngine* spectral_engine = kessho_product_create(48000.0, 128, 0);
  require(spectral_engine != nullptr, "spectral engine create failed");
  KesshoProductSnapshotV2 spectral_snapshot = makeSnapshot();
  spectral_snapshot.fx.spectral_freeze_mix = 1.0f;
  spectral_snapshot.fx.spectral_freeze_enabled = 1;
  spectral_snapshot.fx.spectral_freeze_active = 1;
  spectral_snapshot.fx.spectral_freeze_reverb_crossfade = 1.0f;
  spectral_snapshot.fx.reverb_mix = 0.5f;
  spectral_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].reverb_send = 1.0f;
  require(kessho_product_load_snapshot_v2(spectral_engine, &spectral_snapshot, sizeof(spectral_snapshot)) == KESSHO_PRODUCT_OK, "spectral snapshot load failed");
  triggerPad(spectral_engine, 0.4f);
  require(renderFxPeak(spectral_engine, 80) > 0.00001f, "spectral freeze did not reach FX stem");
  kessho_product_destroy(spectral_engine);

  KesshoProductEngine* dynamics_engine = kessho_product_create(48000.0, 128, 0);
  require(dynamics_engine != nullptr, "dynamics engine create failed");
  KesshoProductSnapshotV2 dynamics_snapshot = makeSnapshot();
  dynamics_snapshot.fx.dynamics_drive = 1.0f;
  dynamics_snapshot.fx.reverb_mix = 0.0f;
  require(kessho_product_load_snapshot_v2(dynamics_engine, &dynamics_snapshot, sizeof(dynamics_snapshot)) == KESSHO_PRODUCT_OK, "dynamics snapshot load failed");
  triggerPad(dynamics_engine, 0.4f);
  std::vector<float> dynamics_l(128);
  std::vector<float> dynamics_r(128);
  kessho_product_render(dynamics_engine, dynamics_l.data(), dynamics_r.data(), 128);
  require(peak(dynamics_l, dynamics_r) > 0.00001f, "dynamics/master chain suppressed signal");
  kessho_product_destroy(dynamics_engine);

  KesshoProductEngine* limiter_engine = kessho_product_create(48000.0, 128, 0);
  require(limiter_engine != nullptr, "limiter engine create failed");
  KesshoProductSnapshotV2 limiter_snapshot = makeSnapshot();
  limiter_snapshot.master.gain = 1.5f;
  limiter_snapshot.master.limiter_ceiling_db = -24.0f;
  limiter_snapshot.fx.reverb_mix = 0.0f;
  limiter_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].level = 1.5f;
  limiter_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].dry_gain = 2.0f;
  limiter_snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].expression = 1.0f;
  require(kessho_product_load_snapshot_v2(limiter_engine, &limiter_snapshot, sizeof(limiter_snapshot)) == KESSHO_PRODUCT_OK, "limiter snapshot load failed");
  triggerPad(limiter_engine, 1.5f);
  const float limited_peak = renderMasterPeak(limiter_engine, 64);
  require(limited_peak <= 0.0645f, "master limiter ceiling did not clamp snapshot output");

  KesshoProductEvent ceiling_event{};
  ceiling_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  ceiling_event.param_id = KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID;
  ceiling_event.value = 0.0f;
  require(kessho_product_enqueue_event(limiter_engine, &ceiling_event) == KESSHO_PRODUCT_OK, "limiter ceiling event enqueue failed");
  triggerPad(limiter_engine, 1.5f);
  const float open_peak = renderMasterPeak(limiter_engine, 64);
  require(open_peak > limited_peak * 1.5f, "master limiter ceiling event did not open master output");
  kessho_product_destroy(limiter_engine);

  requireMasterGainStagingScalesBeforeLimiter();
  requireMasterTelemetryReportsLimiterSaturationAndLoudness();
  requireDisabledFxBypassKeepsDryAndSilencesFxStem();
  requireProductResetClearsFxTails();
  requireModuleSourceFxSendsArePreFader();

  requireProductParamSampleHoldRangeChangesMaster();

  requireFxSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID,
      1.0f,
      "spectral freeze SetParam did not match snapshot-configured render");
  requireSpectralFreezeParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ACTIVE_ID,
      1.0f,
      "spectral freeze active SetParam did not match snapshot-configured render");
  requireSpectralFreezeParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SLUSHY_ID,
      1.0f,
      "spectral freeze slushy SetParam did not match snapshot-configured render");
  requireSpectralFreezeParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DECAY_ID,
      0.2f,
      "spectral freeze decay SetParam did not match snapshot-configured render");
  requireSpectralFreezeParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_PHASE_JITTER_ID,
      0.4f,
      "spectral freeze phase jitter SetParam did not match snapshot-configured render");
  requireFxSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID,
      1.0f,
      "dynamics drive SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MIX_ID,
      0.68f,
      "dynamics character mix SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_CHARACTER_MODE_ID,
      1.0f,
      "dynamics character mode SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_ALIAS_ID,
      0.82f,
      "dynamics degrade alias SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID,
      0.88f,
      "dynamics modulation slow-to-wow SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_FLUTTER_FLUTTER_ID,
      0.64f,
      "dynamics modulation flutter-to-flutter SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_NOISE_ALIAS_ID,
      0.71f,
      "dynamics modulation noise-to-alias SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID,
      0.55f,
      "dynamics saturation drive SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_MODE_ID,
      4.0f,
      "dynamics saturation mode SetParam did not match snapshot-configured render");
  requireDynamicsParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_THRESHOLD_ID,
      -32.0f,
      "dynamics end-compressor threshold SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID,
      0.82f,
      false,
      "Delay A feedback SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DELAY_APING_PONG_ID,
      1.0f,
      false,
      "Delay A ping-pong SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_TYPE_ID,
      2.0f,
      false,
      "Delay A filter type SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DELAY_BPATTERN_ID,
      3.0f,
      true,
      "Delay B pattern SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_ID,
      2.0f,
      true,
      "Delay B warp SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID,
      1.0f,
      true,
      "Delay B spread SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID,
      1.0f,
      false,
      "Delay A granular send SetParam did not match snapshot-configured render");
  requireDelayParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_REVERB_ID,
      1.0f,
      true,
      "Delay B reverb send SetParam did not match snapshot-configured render");
  requireReverbParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID,
      0.98f,
      "reverb decay SetParam did not match snapshot-configured render");
  requireReverbParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_REVERB_TYPE_ID,
      5.0f,
      "reverb type SetParam did not match snapshot-configured render");
  requireReverbParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID,
      0.6f,
      "reverb shimmer SetParam did not match snapshot-configured render");
  requireReverbParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_REVERB_SATURATION_MODE_ID,
      2.0f,
      "reverb saturation mode SetParam did not match snapshot-configured render");
  requireReverbParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_REVERB_ER_LP_FREQ_ID,
      600.0f,
      "reverb early-reflection low-pass SetParam did not match snapshot-configured render");
  requireGranularParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID,
      0.5f,
      "granular feedback SetParam did not match snapshot-configured render");
  requireGranularParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_GRAIN_SHAPE_ID,
      2.0f,
      "granular grain shape SetParam did not match snapshot-configured render");
  requireGranularParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_DENSITY_ID,
      36.0f,
      "granular voice density SetParam did not match snapshot-configured render");
  requireGranularParamSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_GAIN_ID,
      0.75f,
      "granular voice gain SetParam did not match snapshot-configured render");
  requireDelayParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID,
      0.82f,
      false,
      "Delay A feedback parameter did not change C++ render");
  requireDelayParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_DELAY_BPATTERN_ID,
      3.0f,
      true,
      "Delay B pattern parameter did not change C++ render");
  requireReverbParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID,
      0.1f,
      0.98f,
      "reverb decay parameter did not change C++ render");
  requireReverbParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_REVERB_TYPE_ID,
      0.0f,
      5.0f,
      "reverb type parameter did not change C++ render");
  requireGranularParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_ENABLED_ID,
      0.0f,
      1.0f,
      "granular enabled parameter did not change C++ render");
  requireGranularParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_GAIN_ID,
      0.0f,
      1.0f,
      "granular voice gain parameter did not change C++ render");
  requireSpectralFreezeParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_ENABLED_ID,
      0.0f,
      1.0f,
      "spectral freeze enabled parameter did not change C++ render");
  requireSpectralFreezeParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID,
      0.0f,
      1.0f,
      "spectral freeze mix parameter did not change C++ render");
  requireDynamicsParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_ENABLED_ID,
      0.0f,
      1.0f,
      "dynamics enabled parameter did not change C++ render");
  requireDynamicsParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_MIX_ID,
      0.0f,
      0.85f,
      "dynamics degrade mix parameter did not change C++ render");
  requireDynamicsParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_MOD_SLOW_WOW_ID,
      0.0f,
      1.0f,
      "dynamics modulation matrix parameter did not change C++ render");
  requireDynamicsParamChangesTrace(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MIX_ID,
      0.0f,
      1.0f,
      "dynamics end-compressor mix parameter did not change C++ render");
  requireSidechainDucksPadTarget();

  std::cout << "Kessho Product FX Routing tests passed\n";
  return 0;
}
