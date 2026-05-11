#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"

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
  snapshot.rng.seed = 123;
  snapshot.rng.state = 123;
  snapshot.fx.delay_a_enabled = 1;
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
  snapshot.routing.delay_to_reverb = 0.2f;
  snapshot.routing.granular_to_reverb = 0.15f;
  snapshot.routing.delay_b_to_reverb = 0.4f;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
  }
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

std::vector<float> renderSnapshotFxTrace(uint32_t param_id, float value) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "snapshot FX event parity engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.fx.reverb_mix = 0.0f;
  if (param_id == KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID) {
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

} // namespace

int main() {
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
  granular_snapshot.fx.granular_mix = 1.0f;
  granular_snapshot.fx.reverb_mix = 0.0f;
  require(kessho_product_load_snapshot_v2(granular_engine, &granular_snapshot, sizeof(granular_snapshot)) == KESSHO_PRODUCT_OK, "granular snapshot load failed");
  triggerPad(granular_engine, 0.4f);
  require(renderFxPeak(granular_engine, 32) > 0.00001f, "granular send did not reach FX stem");
  kessho_product_destroy(granular_engine);

  KesshoProductEngine* spectral_engine = kessho_product_create(48000.0, 128, 0);
  require(spectral_engine != nullptr, "spectral engine create failed");
  KesshoProductSnapshotV2 spectral_snapshot = makeSnapshot();
  spectral_snapshot.fx.spectral_freeze_mix = 1.0f;
  spectral_snapshot.fx.reverb_mix = 0.0f;
  require(kessho_product_load_snapshot_v2(spectral_engine, &spectral_snapshot, sizeof(spectral_snapshot)) == KESSHO_PRODUCT_OK, "spectral snapshot load failed");
  triggerPad(spectral_engine, 0.4f);
  require(renderFxPeak(spectral_engine, 8) > 0.00001f, "spectral freeze did not reach FX stem");
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

  requireFxSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID,
      1.0f,
      "spectral freeze SetParam did not match snapshot-configured render");
  requireFxSnapshotEventParity(
      KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID,
      1.0f,
      "dynamics drive SetParam did not match snapshot-configured render");
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

  std::cout << "Kessho Product FX Routing tests passed\n";
  return 0;
}
