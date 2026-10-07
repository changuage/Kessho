#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <memory>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "../src/product/KesshoProductEngineInternal.h"

namespace {

using kessho::product::internal::ModulationRange;

constexpr uint32_t kStage5Frames = 128u;
constexpr uint32_t kStage5LowControlId = 501u;
constexpr uint32_t kStage5HighControlId = 502u;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product FX configuration test failed: " << message << "\n";
    std::exit(1);
  }
}

KesshoProductEvent setParam(uint32_t param_id, float value, uint32_t sample_offset = 0u) {
  KesshoProductEvent event{};
  event.sample_offset = sample_offset;
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = param_id;
  event.value = value;
  return event;
}

std::array<uint32_t, kFxConfigurationGroupCount> configurationCounts(
    const KesshoProductEngine& engine) {
  std::array<uint32_t, kFxConfigurationGroupCount> counts{};
  for (uint32_t index = 0u; index < kFxConfigurationGroupCount; ++index) {
    counts[index] = engine.fx_configuration_debug_counts[index];
  }
  return counts;
}

void requireOnlyGroupChanged(
    const std::array<uint32_t, kFxConfigurationGroupCount>& before,
    const std::array<uint32_t, kFxConfigurationGroupCount>& after,
    uint32_t changed_index,
    const char* message) {
  for (uint32_t index = 0u; index < kFxConfigurationGroupCount; ++index) {
    if (index == changed_index) {
      require(after[index] == before[index] + 1u, message);
    } else {
      require(after[index] == before[index], message);
    }
  }
}

uint32_t stage5ShapeFlags(uint32_t shape, float speed) {
  const uint32_t speed_bits = static_cast<uint32_t>(std::lround(speed * 1000.0f))
      << KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SHIFT;
  return KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE |
      (shape << KESSHO_PRODUCT_MODULATION_RANGE_SHAPE_SHIFT) |
      (KESSHO_PRODUCT_MODULATION_TIMING_FREE << KESSHO_PRODUCT_MODULATION_RANGE_TIMING_SHIFT) |
      speed_bits;
}

ModulationRange* applyStage5ShapeRange(
    KesshoProductEngine& engine,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    uint32_t shape,
    float speed) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  event.target_id = 0u;
  event.index = control_id;
  event.param_id = param_id;
  event.value = min_value;
  event.value2 = max_value;
  event.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SHAPE_LFO);
  event.value4 = (min_value + max_value) * 0.5f;
  event.flags = stage5ShapeFlags(shape, speed);
  engine.applyModulationRangeEvent(event);
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK,
      "Stage 5 shape range registration failed");
  ModulationRange* range = engine.findModulationRange(0u, param_id);
  require(range != nullptr && range->active, "Stage 5 shape range was not indexed");
  return range;
}

void disableStage5Range(KesshoProductEngine& engine, uint32_t param_id, uint32_t control_id) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  event.target_id = 0u;
  event.index = control_id;
  event.param_id = param_id;
  event.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_OFF);
  engine.applyModulationRangeEvent(event);
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK,
      "Stage 5 shape range deactivation failed");
}

void writeStage5Output(
    const KesshoProductEngine& engine,
    const std::array<float, kStage5Frames>& output_l,
    const std::array<float, kStage5Frames>& output_r) {
  const char* output_path = std::getenv("KESSHO_STAGE5_OUTPUT");
  if (output_path == nullptr || output_path[0] == '\0') return;

  // Binary order: version, frame count, complete interleaved float PCM,
  // reverb damp low/high, active-range count and last error code.
  std::ofstream output(output_path, std::ios::binary | std::ios::trunc);
  require(output.good(), "Stage 5 output path could not be opened");
  const uint32_t version = 1u;
  const uint32_t frames = kStage5Frames;
  output.write(reinterpret_cast<const char*>(&version), sizeof(version));
  output.write(reinterpret_cast<const char*>(&frames), sizeof(frames));
  for (uint32_t frame = 0u; frame < frames; ++frame) {
    output.write(reinterpret_cast<const char*>(&output_l[frame]), sizeof(float));
    output.write(reinterpret_cast<const char*>(&output_r[frame]), sizeof(float));
  }
  output.write(reinterpret_cast<const char*>(&engine.fx.reverb_damp_low), sizeof(float));
  output.write(reinterpret_cast<const char*>(&engine.fx.reverb_damp_high), sizeof(float));
  output.write(reinterpret_cast<const char*>(&engine.telemetry.modulation_range_count), sizeof(uint32_t));
  output.write(reinterpret_cast<const char*>(&engine.telemetry.last_error_code), sizeof(int32_t));
  require(output.good(), "Stage 5 output write failed");
}

void requireRuntimeModulationSharesFxBatch() {
  KesshoProductEngine engine(48000.0, kStage5Frames, 0u);
  require(engine.modules_ready, "Stage 5 engine modules were not ready");

  // Keep the measured pass independent of automatic reverb coupling while
  // retaining a warmed source and audible reverb tail.
  engine.fx.reverb_mix = 1.0f;
  engine.fx.reverb_type = 2u;
  engine.fx.reverb_quality = 1u;
  engine.fx.reverb_decay = 0.8f;
  engine.fx.reverb_size = 2.0f;
  engine.fx.reverb_damping = 0.2f;
  engine.fx.reverb_chord_wash = false;
  engine.fx.reverb_resolution_bloom = false;
  engine.reverb_wash_boost = 0.0f;
  engine.reverb_bloom_boost = 0.0f;
  auto& pad = engine.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad.enabled = true;
  pad.level = 1.0f;
  pad.dry_gain = 1.0f;
  pad.expression = 1.0f;
  pad.reverb_send = 1.0f;
  engine.configureFxModules(kFxConfigurationReverb);

  std::array<float, kStage5Frames> warm_l{};
  std::array<float, kStage5Frames> warm_r{};
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 1.0f;
  note.value3 = 0.8f;
  require(engine.enqueueEvent(note) == KESSHO_PRODUCT_OK, "Stage 5 warm note enqueue failed");
  for (uint32_t block = 0u; block < 16u; ++block) {
    engine.render(warm_l.data(), warm_r.data(), kStage5Frames);
  }

  ModulationRange* low = applyStage5ShapeRange(
      engine,
      KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_LOW_ID,
      kStage5LowControlId,
      0.15f,
      0.75f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      1.0f);
  ModulationRange* high = applyStage5ShapeRange(
      engine,
      KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID,
      kStage5HighControlId,
      0.25f,
      0.85f,
      KESSHO_PRODUCT_MODULATION_SHAPE_SINE,
      1.5f);
  require(engine.active_modulation_range_count == 2u,
      "Stage 5 fixture did not register both active ranges");

  const auto before = configurationCounts(engine);
  const float previous_low = low->current_value;
  const float previous_high = high->current_value;
  std::array<float, kStage5Frames> output_l{};
  std::array<float, kStage5Frames> output_r{};
  engine.render(output_l.data(), output_r.data(), kStage5Frames);
  const auto after = configurationCounts(engine);
  const bool baseline = std::getenv("KESSHO_STAGE5_BASELINE") != nullptr;
  const uint32_t expected_reverb_commits = baseline ? 2u : 1u;
  require(after[2] == before[2] + expected_reverb_commits,
      "Stage 5 isolated pass had the unexpected Reverb commit count");
  for (uint32_t index = 0u; index < kFxConfigurationGroupCount; ++index) {
    if (index != 2u) {
      require(after[index] == before[index],
          "Stage 5 isolated modulation pass rebuilt an unrelated FX group");
    }
  }
  require(std::fabs(low->current_value - previous_low) > 0.0000001f &&
      std::fabs(high->current_value - previous_high) > 0.0000001f,
      "Stage 5 ranges did not both change during the measured block");
  require(std::fabs(engine.fx.reverb_damp_low - low->current_value) < 0.000001f &&
      std::fabs(engine.fx.reverb_damp_high - high->current_value) < 0.000001f,
      "Stage 5 final Reverb damping values did not reach the FX state");
  float pcm_peak = 0.0f;
  for (uint32_t frame = 0u; frame < kStage5Frames; ++frame) {
    require(std::isfinite(output_l[frame]) && std::isfinite(output_r[frame]),
        "Stage 5 render produced non-finite PCM");
    pcm_peak = std::max(pcm_peak, std::fabs(output_l[frame]));
    pcm_peak = std::max(pcm_peak, std::fabs(output_r[frame]));
  }
  require(pcm_peak > 0.00001f, "Stage 5 warmed source/reverb render was silent");
  require(engine.fx_configuration_batch_depth == 0u &&
      engine.fx_configuration_pending_mask == 0u,
      "Stage 5 render retained FX batch state");
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK,
      "Stage 5 render reported an error");
  writeStage5Output(engine, output_l, output_r);

  disableStage5Range(engine, KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_LOW_ID, kStage5LowControlId);
  disableStage5Range(engine, KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID, kStage5HighControlId);
  const auto disabled_before = configurationCounts(engine);
  engine.render(output_l.data(), output_r.data(), kStage5Frames);
  require(configurationCounts(engine) == disabled_before,
      "deactivated Stage 5 ranges caused redundant FX commits");
  require(engine.active_modulation_range_count == 0u &&
      engine.fx_configuration_batch_depth == 0u &&
      engine.fx_configuration_pending_mask == 0u,
      "Stage 5 range deactivation retained runtime state");

  std::cout << "Stage 5 runtime modulation batch checks passed"
            << " (reverb_delta=" << expected_reverb_commits
            << ", pcm_peak=" << pcm_peak << ")\n";
}

} // namespace

int main() {
  auto engine_storage = std::make_unique<KesshoProductEngine>(48000.0, 128u, 0u);
  KesshoProductEngine& engine = *engine_storage;
  require(engine.modules_ready, "Product modules were not ready");

  // One scalar edit configures only its dependency group immediately.
  auto before = configurationCounts(engine);
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID, 4200.0f));
  auto after = configurationCounts(engine);
  requireOnlyGroupChanged(before, after, 0u, "single-group edit rebuilt unrelated groups");

  // Nested edits coalesce at the outermost end, and the pending mask clears.
  before = after;
  engine.beginFxConfigurationBatch();
  engine.beginFxConfigurationBatch();
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID, 0.4f));
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID, 0.62f));
  require(engine.fx_configuration_pending_mask == kFxConfigurationDelayA,
      "nested edits did not accumulate the Delay A bit");
  require(configurationCounts(engine) == before, "nested edit configured before outer end");
  engine.endFxConfigurationBatch();
  require(configurationCounts(engine) == before, "inner batch end flushed configuration");
  engine.endFxConfigurationBatch();
  after = configurationCounts(engine);
  requireOnlyGroupChanged(before, after, 0u, "same-boundary nested edits did not coalesce");
  require(engine.fx_configuration_pending_mask == 0u, "pending mask was not cleared after flush");

  // An event at the second sample boundary remains pending until that boundary.
  before = after;
  KesshoProductEvent boundary_event = setParam(
      KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID, 0.62f, 6u);
  require(engine.enqueueEvent(boundary_event) == KESSHO_PRODUCT_OK,
      "boundary event enqueue failed");
  float output_l[4]{};
  float output_r[4]{};
  engine.render(output_l, output_r, 4u);
  require(configurationCounts(engine) == before,
      "second-boundary event configured before its sample offset");
  float output_l2[2]{};
  float output_r2[2]{};
  engine.render(output_l2, output_r2, 2u);
  require(configurationCounts(engine) == before,
      "second-boundary event configured at the end of its block");
  float output_l3[1]{};
  float output_r3[1]{};
  engine.render(output_l3, output_r3, 1u);
  after = configurationCounts(engine);
  requireOnlyGroupChanged(before, after, 2u,
      "second-boundary event did not configure Reverb at its boundary");

  // Full reset configures every group and leaves no stale pending work.
  before = after;
  engine.beginFxConfigurationBatch();
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID, 0.35f));
  engine.reset();
  after = configurationCounts(engine);
  for (uint32_t index = 0u; index < kFxConfigurationGroupCount; ++index) {
    require(after[index] >= before[index] + 1u,
        "full reset missed a configuration group");
  }
  require(engine.fx_configuration_batch_depth == 0u && engine.fx_configuration_pending_mask == 0u,
      "full reset retained configuration batch state");

  // A Delay A -> Delay B routing dependency updates both delay groups only.
  before = after;
  KesshoProductEvent routing_event = setParam(
      KESSHO_PRODUCT_PARAM_ROUTING_FX_ROUTE_ENABLED_ID, 1.0f);
  routing_event.target_id = kFxNodeDelayA * kFxNodeCount + kFxNodeDelayB;
  engine.applyControlEvent(routing_event);
  after = configurationCounts(engine);
  require(after[0] == before[0] + 1u && after[1] == before[1] + 1u,
      "routing dependency did not update both delay groups");
  for (uint32_t index = 2u; index < kFxConfigurationGroupCount; ++index) {
    require(after[index] == before[index], "routing dependency rebuilt an unrelated group");
  }

  // Master and wet dynamics remain independently configurable.
  before = after;
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID, 0.7f));
  after = configurationCounts(engine);
  requireOnlyGroupChanged(before, after, 5u, "master dynamics edit rebuilt wet dynamics");
  before = after;
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_MIX_ID, 0.6f));
  after = configurationCounts(engine);
  requireOnlyGroupChanged(before, after, 6u, "wet dynamics edit rebuilt master dynamics");

  // Creative saturation is read directly by the graph, including quality.
  before = after;
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_QUALITY_ID, 2.0f));
  require(configurationCounts(engine) == before, "creative saturation rebuilt module groups");
  require(engine.fx.dynamics_saturation_quality == 2u, "creative saturation quality was lost");

  // Count actual derived work, not merely the published parameters. Keep both
  // delays active so mix edits do not introduce an activation dependency.
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_AENABLED_ID, 1.0f));
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_BENABLED_ID, 1.0f));
  const auto a_filters = engine.delay_a_module->debug_filter_configurations;
  const auto b_filters = engine.delay_b_module->debug_filter_configurations;
  const auto b_taps = engine.delay_b_module->debug_tap_configurations;
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID, 0.55f));
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID, 0.55f));
  require(engine.delay_a_module->debug_filter_configurations == a_filters &&
      engine.delay_b_module->debug_filter_configurations == b_filters &&
      engine.delay_b_module->debug_tap_configurations == b_taps,
      "mix-only edits rebuilt delay filters or taps");
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID, 4600.0f));
  require(engine.delay_a_module->debug_filter_configurations == a_filters + 1u,
      "Delay A filter dependency did not rebuild coefficients");
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_BTONE_ID, 0.83f));
  require(engine.delay_b_module->debug_filter_configurations == b_filters + 1u &&
      engine.delay_b_module->debug_tap_configurations == b_taps,
      "Delay B tone did not rebuild only filters");
  engine.applyControlEvent(setParam(KESSHO_PRODUCT_PARAM_FX_DELAY_BBASE_TIME_MS_ID, 730.0f));
  require(engine.delay_b_module->debug_filter_configurations == b_filters + 1u &&
      engine.delay_b_module->debug_tap_configurations == b_taps + 1u,
      "Delay B time did not rebuild only taps");

  requireRuntimeModulationSharesFxBatch();

  std::cout << "Kessho Product FX configuration checks passed"
            << " (groups=" << after[0] << "," << after[1] << "," << after[2]
            << "," << after[3] << "," << after[4] << "," << after[5] << "," << after[6]
            << ")\n";
  return 0;
}
