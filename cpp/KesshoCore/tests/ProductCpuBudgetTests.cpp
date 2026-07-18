#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <algorithm>
#include <ctime>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product CPU test failed: " << message << "\n";
    std::exit(1);
  }
}

struct RenderCpuStats {
  double average_percent = 0.0;
  double peak_percent = 0.0;
  double p95_ms = 0.0;
  double p99_ms = 0.0;
  uint32_t missed_quantum_count = 0;
};

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 0.8f;
  snapshot.rng.seed = 11;
  snapshot.rng.state = 11;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.6f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  snapshot.synth_euclid.lane_count = 2;
  for (uint32_t lane = 0; lane < 2; ++lane) {
    snapshot.synth_euclid.lanes[lane].enabled = 1;
    snapshot.synth_euclid.lanes[lane].target_source_id = lane == 0 ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_LEAD1;
    snapshot.synth_euclid.lanes[lane].step_count = 16;
    snapshot.synth_euclid.lanes[lane].fill_count = 5;
    snapshot.synth_euclid.lanes[lane].clock_division = 16;
    snapshot.synth_euclid.lanes[lane].probability = 1.0f;
    snapshot.synth_euclid.lanes[lane].ratchet = 2;
    snapshot.synth_euclid.lanes[lane].midi_note = 60.0f + static_cast<float>(lane * 7);
    snapshot.synth_euclid.lanes[lane].velocity = 0.8f;
    snapshot.synth_euclid.lanes[lane].hold_seconds = 0.12f;
    snapshot.synth_euclid.lanes[lane].expression = 0.8f;
    snapshot.synth_euclid.lanes[lane].seed = 100 + lane;
  }
  snapshot.drum_euclid.lane_count = 1;
  snapshot.drum_euclid.lanes[0] = snapshot.synth_euclid.lanes[0];
  snapshot.drum_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
  snapshot.drum_euclid.lanes[0].midi_note = 36.0f;
  snapshot.drum_euclid.lanes[0].hold_seconds = 0.08f;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

void disableAllFx(KesshoProductSnapshotV2& snapshot) {
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
  snapshot.routing.granular_to_reverb = 0.0f;
  snapshot.routing.delay_a_to_granular = 0.0f;
  snapshot.routing.delay_b_to_granular = 0.0f;
  snapshot.routing.delay_a_to_delay_b = 0.0f;
  snapshot.routing.delay_b_to_delay_a = 0.0f;
  snapshot.routing.delay_b_to_reverb = 0.0f;
}

void enableFxStress(KesshoProductSnapshotV2& snapshot) {
  snapshot.fx.reverb_mix = 0.5f;
  snapshot.fx.reverb_decay = 0.8f;
  snapshot.fx.delay_a_enabled = 1u;
  snapshot.fx.delay_a_mix = 0.35f;
  snapshot.fx.delay_a_feedback = 0.45f;
  snapshot.fx.delay_a_time_left_ms = 120.0f;
  snapshot.fx.delay_a_time_right_ms = 180.0f;
  snapshot.fx.delay_b_enabled = 1u;
  snapshot.fx.delay_b_mix = 0.25f;
  snapshot.fx.delay_b_activity = 0.5f;
  snapshot.fx.delay_b_repeats = 0.45f;
  snapshot.fx.granular_enabled = 1u;
  snapshot.fx.granular_mix = 0.2f;
  snapshot.fx.granular_voices[0].enabled = 1u;
  snapshot.fx.granular_voices[0].density = 24.0f;
  snapshot.fx.dynamics_enabled = 1u;
  snapshot.fx.dynamics_drive = 0.35f;
  snapshot.fx.dynamics_drift_enabled = 1u;
  snapshot.fx.dynamics_drift_mix = 0.25f;
  snapshot.fx.dynamics_erosion_enabled = 1u;
  snapshot.fx.dynamics_erosion_mix = 0.2f;
  snapshot.fx.dynamics_saturation_enabled = 1u;
  snapshot.fx.dynamics_saturation_drive = 0.2f;
  snapshot.fx.dynamics_end_comp_enabled = 1u;
  snapshot.fx.dynamics_end_comp_mix = 0.35f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].reverb_send = 0.5f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].delay_a_send = 0.4f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].granular_send = 0.25f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].delay_b_send = 0.35f;
  snapshot.routing.delay_to_reverb = 0.25f;
  snapshot.routing.granular_to_reverb = 0.2f;
  snapshot.routing.delay_a_to_granular = 0.15f;
  snapshot.routing.delay_b_to_reverb = 0.25f;
}

void enableSourceMorphAutomation(KesshoProductSnapshotV2& snapshot) {
  for (uint32_t target = 0u; target < KESSHO_PRODUCT_SOURCE_MORPH_AUTOMATION_COUNT; ++target) {
    snapshot.sonic_runtime.source_morph[target].enabled = 1u;
    snapshot.sonic_runtime.source_morph[target].mode = target % 3u;
    snapshot.sonic_runtime.source_morph[target].phrases_per_cycle = 8.0f;
    snapshot.sonic_runtime.source_morph[target].seed = 1000u + target;
  }
}

double percentile(std::vector<double> values, double percentile_value) {
  require(!values.empty(), "percentile input stayed empty");
  std::sort(values.begin(), values.end());
  const double rank = percentile_value * static_cast<double>(values.size() - 1u);
  const size_t lo = static_cast<size_t>(std::floor(rank));
  const size_t hi = static_cast<size_t>(std::ceil(rank));
  if (lo == hi) {
    return values[lo];
  }
  const double t = rank - static_cast<double>(lo);
  return values[lo] + (values[hi] - values[lo]) * t;
}

using EngineSetup = void (*)(KesshoProductEngine*);
using EngineTick = void (*)(KesshoProductEngine*, uint32_t);

void enableMusicalArpRuntime(KesshoProductEngine* engine) {
  for (uint32_t lane = 0u; lane < 2u; ++lane) {
    KesshoProductEvent config{};
    config.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_CONFIG;
    config.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    config.index = lane;
    config.param_id = 0xffffu;
    config.value = 1.0f;
    config.value2 = 16.0f;
    config.value3 = 4.0f;
    config.flags = KESSHO_PRODUCT_ARP_MUSICAL_CONFIG |
        (lane == 0u ? 4u : 5u);
    require(kessho_product_enqueue_event(engine, &config) == KESSHO_PRODUCT_OK, "musical ARP CPU config enqueue failed");
    for (uint32_t step = 0u; step < 16u; ++step) {
      KesshoProductEvent arp_step{};
      arp_step.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_STEP;
      arp_step.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
      arp_step.index = lane;
      arp_step.param_id = step;
      arp_step.value = -1.0f;
      arp_step.value2 = 1.0f;
      arp_step.value3 = static_cast<float>(static_cast<int32_t>(step % 5u) - 2);
      arp_step.value4 = -1.0f;
      require(kessho_product_enqueue_event(engine, &arp_step) == KESSHO_PRODUCT_OK, "musical ARP CPU step enqueue failed");
    }
    KesshoProductEvent commit{};
    commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SYNTH_ARP_PATTERN;
    commit.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    commit.index = lane;
    require(kessho_product_enqueue_event(engine, &commit) == KESSHO_PRODUCT_OK, "musical ARP CPU commit enqueue failed");
  }
}

void enableScatterRuntime(KesshoProductEngine* engine) {
  constexpr uint32_t param_ids[] = {
      KESSHO_PRODUCT_SCATTER_PARAM_ENABLED,
      KESSHO_PRODUCT_SCATTER_PARAM_TRIGGER_PROBABILITY,
      KESSHO_PRODUCT_SCATTER_PARAM_BURST_PROBABILITY,
      KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK,
      KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK_ENABLED,
      KESSHO_PRODUCT_SCATTER_PARAM_FEEL_X,
      KESSHO_PRODUCT_SCATTER_PARAM_FEEL_Y,
      KESSHO_PRODUCT_SCATTER_PARAM_ANCHOR,
      KESSHO_PRODUCT_SCATTER_PARAM_BREATH,
      KESSHO_PRODUCT_SCATTER_PARAM_MEMORY,
      KESSHO_PRODUCT_SCATTER_PARAM_MOTION,
      KESSHO_PRODUCT_SCATTER_PARAM_FRACTURE,
      KESSHO_PRODUCT_SCATTER_PARAM_SPREAD,
  };
  constexpr float values[] = {
      1.0f, 1.0f, 0.72f, 0.8f, 1.0f, 0.85f, 0.9f,
      0.35f, 0.2f, 0.7f, 0.9f, 0.85f, 0.8f,
  };
  static_assert(std::size(param_ids) == std::size(values));
  for (uint32_t voice = 0u; voice < 7u; ++voice) {
    for (uint32_t param = 0u; param < std::size(param_ids); ++param) {
      KesshoProductEvent event{};
      event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_VOICE_PARAM;
      event.index = voice;
      event.param_id = param_ids[param];
      event.value = values[param];
      require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "Scatter CPU config enqueue failed");
    }
  }
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCATTER_CONFIG;
  require(kessho_product_enqueue_event(engine, &commit) == KESSHO_PRODUCT_OK, "Scatter CPU commit enqueue failed");
  KesshoProductEvent enabled{};
  enabled.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_ENABLED;
  enabled.value = 1.0f;
  require(kessho_product_enqueue_event(engine, &enabled) == KESSHO_PRODUCT_OK, "Scatter CPU enable enqueue failed");
}

void enableMaximumSceneRuntime(KesshoProductEngine* engine) {
  ProductSceneProgramBuffer& active = engine->scene_program_runtime.buffers[0];
  active.entry_count = kProductSceneMaxEntries;
  for (uint32_t index = 0u; index < active.entry_count; ++index) {
    ProductSceneEntry& entry = active.entries[index];
    entry.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    entry.target_id = 1u + index % 8u;
    entry.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
    entry.value_a = 0.2f + static_cast<float>(index % 5u) * 0.03f;
    entry.value_b = 0.8f - static_cast<float>(index % 5u) * 0.03f;
  }
  engine->scene_program_runtime.active_buffer = 0u;
  engine->scene_program_runtime.active = true;
  engine->scene_program_runtime.position_dirty = true;
}

void advanceMaximumSceneRuntime(KesshoProductEngine* engine, uint32_t block) {
  // Eight four-bar phrases at 120 BPM per half-cycle. This is the shortest
  // production scene cadence and still crosses every 1% runtime quantum.
  constexpr uint32_t half_cycle_blocks = 24000u;
  const uint32_t phase = block % (half_cycle_blocks * 2u);
  const float position = phase <= half_cycle_blocks
      ? static_cast<float>(phase) / static_cast<float>(half_cycle_blocks)
      : static_cast<float>(half_cycle_blocks * 2u - phase) / static_cast<float>(half_cycle_blocks);
  engine->setSceneProgramPosition(position);
}

void enableMaximumAutoCycleRuntime(KesshoProductEngine* engine) {
  enableMaximumSceneRuntime(engine);
  KesshoProductEvent config{};
  config.event_kind = KESSHO_PRODUCT_EVENT_KIND_CONFIGURE_GLOBAL_AUTO_CYCLE;
  config.value = 0.0f;
  config.value2 = 1.0f;
  config.value3 = 8.0f;
  config.value4 = 1.0f;
  config.flags = 1u;
  engine->configureGlobalAutoCycle(config);
}

void enableMaximumJourneyRuntime(KesshoProductEngine* engine) {
  enableMaximumSceneRuntime(engine);
  ProductSceneProgramBuffer& scene = engine->scene_program_runtime.buffers[0];
  ProductJourneyScheduleRuntimeState& runtime = engine->journey_schedule_runtime;
  ProductJourneyScheduleBuffer& schedule = runtime.buffers[0];
  ProductJourneyTransitionProgram& program = schedule.programs[0];
  program.entry_count = scene.entry_count;
  std::copy(scene.entries, scene.entries + scene.entry_count, program.entries);
  program.committed = true;
  schedule.entry_count = 1u;
  schedule.program_count = 1u;
  schedule.loop_start_index = 0u;
  schedule.entries[0].hold_frames = 128u;
  // The shortest production Journey morph is the default half phrase: eight
  // seconds at 120 BPM with four four-beat bars per phrase.
  schedule.entries[0].morph_frames = 384000u;
  schedule.entries[0].transition_program_index = 0u;
  schedule.entries[0].from_node_index = 0u;
  schedule.entries[0].to_node_index = 0u;
  schedule.entries[0].hold_set = true;
  schedule.entries[0].morph_set = true;
  runtime.active_buffer = 0u;
  runtime.active = true;
  runtime.running = true;
  runtime.phase = ProductJourneyPhase::Hold;
  runtime.phase_start_frame = 0u;
  runtime.phase_end_frame = schedule.entries[0].hold_frames;
  engine->scene_program_runtime.active = false;
}

RenderCpuStats renderCpuStats(
    const KesshoProductSnapshotV2& snapshot,
    uint32_t blocks,
    EngineSetup setup = nullptr,
    EngineTick tick = nullptr) {
  constexpr uint32_t frames = 128;
  // The disabled-FX path is cheap enough that a short fresh-process run is
  // dominated by cold code/data pages and CPU frequency ramp. Warm through a
  // substantial render window before timing so repeated benchmark processes
  // measure steady render cost rather than process startup effects.
  constexpr uint32_t warmup_blocks = 4096;
  constexpr uint32_t timed_blocks_per_sample = 5;
  KesshoProductEngine* engine = kessho_product_create(48000.0, frames, 0);
  require(engine != nullptr, "engine create failed");
  const int32_t load_result = kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot));
  if (load_result != KESSHO_PRODUCT_OK) {
    std::cerr << "snapshot load result=" << load_result
              << " last_error=" << kessho_product_get_telemetry(engine).last_error_code << "\n";
  }
  require(load_result == KESSHO_PRODUCT_OK, "snapshot load failed");
  if (setup != nullptr) setup(engine);

  std::vector<float> left(frames);
  std::vector<float> right(frames);
  for (uint32_t block = 0; block < warmup_blocks; ++block) {
    if (tick != nullptr) tick(engine, block);
    kessho_product_render(engine, left.data(), right.data(), frames);
  }

  std::vector<double> block_ms;
  block_ms.reserve(blocks);
  const std::clock_t start_clock = std::clock();
  for (uint32_t block = 0; block < blocks;) {
    const uint32_t sample_blocks = std::min(timed_blocks_per_sample, blocks - block);
    const std::clock_t sample_start_clock = std::clock();
    for (uint32_t sample_block = 0; sample_block < sample_blocks; ++sample_block) {
      if (tick != nullptr) tick(engine, warmup_blocks + block + sample_block);
      kessho_product_render(engine, left.data(), right.data(), frames);
    }
    const std::clock_t sample_end_clock = std::clock();
    const double sample_ms = 1000.0 * static_cast<double>(sample_end_clock - sample_start_clock) /
                             static_cast<double>(CLOCKS_PER_SEC);
    const double per_block_ms = sample_ms / static_cast<double>(sample_blocks);
    for (uint32_t sample_block = 0; sample_block < sample_blocks; ++sample_block) {
      block_ms.push_back(per_block_ms);
    }
    block += sample_blocks;
  }
  const std::clock_t end_clock = std::clock();
  const double elapsed_ms = 1000.0 * static_cast<double>(end_clock - start_clock) / static_cast<double>(CLOCKS_PER_SEC);
  const double rendered_ms = static_cast<double>(blocks * frames) * 1000.0 / 48000.0;
  const double quantum_ms = static_cast<double>(frames) * 1000.0 / 48000.0;
  RenderCpuStats stats{};
  stats.average_percent = (elapsed_ms / rendered_ms) * 100.0;
  stats.p95_ms = percentile(block_ms, 0.95);
  stats.p99_ms = percentile(block_ms, 0.99);
  for (double block_elapsed_ms : block_ms) {
    stats.peak_percent = std::max(stats.peak_percent, (block_elapsed_ms / quantum_ms) * 100.0);
    if (block_elapsed_ms > quantum_ms) {
      ++stats.missed_quantum_count;
    }
  }
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.absolute_sample_time == (blocks + warmup_blocks) * frames, "sample time did not advance as expected");
  kessho_product_destroy(engine);
  return stats;
}

double maximumJourneyUploadRenderMs(const KesshoProductSnapshotV2& snapshot) {
  constexpr uint32_t frames = 128u;
  KesshoProductEngine* engine = kessho_product_create(48000.0, frames, 0u);
  require(engine != nullptr, "Journey upload CPU engine create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "Journey upload CPU snapshot load failed");
  float left[frames]{};
  float right[frames]{};
  for (uint32_t block = 0u; block < 4096u; ++block) {
    kessho_product_render(engine, left, right, frames);
  }

  ProductJourneyScheduleBuffer& staging = engine->journey_schedule_runtime.buffers[
      engine->journey_schedule_runtime.staging_buffer];
  for (uint32_t program_index = 0u; program_index < kProductJourneyMaxPrograms; ++program_index) {
    ProductJourneyTransitionProgram& program = staging.programs[program_index];
    for (uint32_t entry_index = 0u; entry_index < kProductSceneMaxEntries; ++entry_index) {
      program.entries[entry_index].value_a = static_cast<float>(entry_index);
      program.entries[entry_index].value_b = static_cast<float>(program_index);
    }
    for (uint32_t command_index = 0u; command_index < kProductSceneMaxCommands; ++command_index) {
      program.commands[command_index].event.value = static_cast<float>(command_index);
    }
  }

  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE;
  begin.value = static_cast<float>(kProductJourneyMaxEntries);
  begin.value2 = static_cast<float>(kProductJourneyMaxPrograms);
  begin.value3 = 1.0f;
  require(kessho_product_enqueue_event(engine, &begin) == KESSHO_PRODUCT_OK,
      "maximum Journey upload begin enqueue failed");
  const std::clock_t start = std::clock();
  kessho_product_render(engine, left, right, frames);
  const std::clock_t end = std::clock();
  const double elapsed_ms = 1000.0 * static_cast<double>(end - start) /
      static_cast<double>(CLOCKS_PER_SEC);
  kessho_product_destroy(engine);
  return elapsed_ms;
}

void printCpuStats(const char* label, const RenderCpuStats& stats) {
  std::cout << label << " "
            << stats.average_percent << "% avg, "
            << stats.peak_percent << "% peak, p95 " << stats.p95_ms
            << " ms, p99 " << stats.p99_ms << " ms, missed "
            << stats.missed_quantum_count << "\n";
}

} // namespace

int main() {
  constexpr uint32_t blocks = 3000;
  constexpr uint32_t max_allowed_missed_quantums = 0;
  constexpr double quantum_ms = 128.0 * 1000.0 / 48000.0;
  KesshoProductSnapshotV2 disabled_snapshot = makeSnapshot();
  disableAllFx(disabled_snapshot);
  const RenderCpuStats disabled_stats = renderCpuStats(disabled_snapshot, blocks);
  printCpuStats("Kessho Product CPU measured: disabled FX", disabled_stats);
  require(disabled_stats.average_percent < 25.0, "disabled-FX product render CPU budget exceeded");
  require(disabled_stats.p95_ms < quantum_ms * 0.5, "disabled-FX product render p95 budget exceeded");
  require(disabled_stats.p99_ms < quantum_ms, "disabled-FX product render p99 budget exceeded");
  require(
      disabled_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "disabled-FX product render missed too many simulated quantums");

  KesshoProductSnapshotV2 automation_snapshot = disabled_snapshot;
  enableSourceMorphAutomation(automation_snapshot);
  const RenderCpuStats automation_stats = renderCpuStats(automation_snapshot, blocks);
  const RenderCpuStats automation_trailing_baseline = renderCpuStats(disabled_snapshot, blocks);
  const double automation_baseline_average =
      (disabled_stats.average_percent + automation_trailing_baseline.average_percent) * 0.5;
  printCpuStats("Kessho Product CPU measured: source morph automation", automation_stats);
  require(
      automation_stats.average_percent <= automation_baseline_average * 1.03,
      "source morph automation mean CPU regression exceeded three percent");
  require(automation_stats.p99_ms < quantum_ms, "source morph automation render p99 budget exceeded");
  require(
      automation_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "source morph automation render missed too many simulated quantums");

  KesshoProductSnapshotV2 arp_snapshot = disabled_snapshot;
  arp_snapshot.harmony.note_pool_count = 8u;
  for (uint32_t note = 0u; note < 8u; ++note) {
    arp_snapshot.harmony.note_pool_midi[note] = 60.0f + static_cast<float>(note * 2u);
  }
  const RenderCpuStats arp_stats = renderCpuStats(arp_snapshot, blocks, enableMusicalArpRuntime);
  printCpuStats("Kessho Product CPU measured: musical ARP runtime", arp_stats);
  require(arp_stats.p99_ms < quantum_ms, "musical ARP runtime render p99 budget exceeded");
  require(
      arp_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "musical ARP runtime render missed too many simulated quantums");

  const RenderCpuStats scatter_stats = renderCpuStats(disabled_snapshot, blocks, enableScatterRuntime);
  printCpuStats("Kessho Product CPU measured: active Scatter runtime", scatter_stats);
  require(scatter_stats.p99_ms < quantum_ms, "active Scatter runtime render p99 budget exceeded");
  require(
      scatter_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "active Scatter runtime render missed too many simulated quantums");

  KesshoProductSnapshotV2 scatter_scheduler_snapshot = disabled_snapshot;
  scatter_scheduler_snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].enabled = 0u;
  const RenderCpuStats scatter_scheduler_baseline = renderCpuStats(scatter_scheduler_snapshot, blocks);
  const RenderCpuStats scatter_scheduler_stats = renderCpuStats(
      scatter_scheduler_snapshot, blocks, enableScatterRuntime);
  printCpuStats("Kessho Product CPU measured: Scatter scheduler only", scatter_scheduler_stats);
  require(
      scatter_scheduler_stats.average_percent <= scatter_scheduler_baseline.average_percent * 1.03,
      "Scatter scheduler mean CPU regression exceeded three percent");
  require(scatter_scheduler_stats.p99_ms < quantum_ms, "Scatter scheduler render p99 budget exceeded");
  require(
      scatter_scheduler_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "Scatter scheduler render missed too many simulated quantums");

  const RenderCpuStats scene_stats = renderCpuStats(
      disabled_snapshot, blocks, enableMaximumSceneRuntime, advanceMaximumSceneRuntime);
  printCpuStats("Kessho Product CPU measured: maximum active scene morph", scene_stats);
  require(
      scene_stats.average_percent <= disabled_stats.average_percent * 1.05,
      "maximum active scene morph mean CPU regression exceeded five percent");
  require(scene_stats.p99_ms < quantum_ms, "maximum active scene morph render p99 budget exceeded");
  require(
      scene_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "maximum active scene morph render missed too many simulated quantums");

  const RenderCpuStats auto_cycle_stats = renderCpuStats(
      disabled_snapshot, blocks, enableMaximumAutoCycleRuntime);
  printCpuStats("Kessho Product CPU measured: maximum Product auto-cycle", auto_cycle_stats);
  require(
      auto_cycle_stats.average_percent <= disabled_stats.average_percent * 1.05,
      "maximum Product auto-cycle mean CPU regression exceeded five percent");
  require(auto_cycle_stats.p99_ms < quantum_ms, "maximum Product auto-cycle render p99 budget exceeded");
  require(
      auto_cycle_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "maximum Product auto-cycle render missed too many simulated quantums");

  const RenderCpuStats journey_baseline_stats = renderCpuStats(disabled_snapshot, blocks);
  const RenderCpuStats journey_stats = renderCpuStats(
      disabled_snapshot, blocks, enableMaximumJourneyRuntime);
  const RenderCpuStats journey_trailing_baseline_stats = renderCpuStats(disabled_snapshot, blocks);
  const double journey_baseline_average =
      (journey_baseline_stats.average_percent + journey_trailing_baseline_stats.average_percent) * 0.5;
  printCpuStats("Kessho Product CPU measured: maximum Product Journey", journey_stats);
  require(
      journey_stats.average_percent <= journey_baseline_average * 1.05,
      "maximum Product Journey mean CPU regression exceeded five percent");
  require(journey_stats.p99_ms < quantum_ms, "maximum Product Journey render p99 budget exceeded");
  require(
      journey_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "maximum Product Journey render missed too many simulated quantums");
  const double journey_upload_ms = maximumJourneyUploadRenderMs(disabled_snapshot);
  std::cout << "Kessho Product CPU measured: maximum Journey upload " << journey_upload_ms << " ms\n";
  require(journey_upload_ms < quantum_ms, "maximum Journey upload missed a simulated render quantum");

  KesshoProductSnapshotV2 active_snapshot = makeSnapshot();
  enableFxStress(active_snapshot);
  const RenderCpuStats active_stats = renderCpuStats(active_snapshot, blocks);
  printCpuStats("Kessho Product CPU measured: active FX", active_stats);
  require(active_stats.average_percent < 35.0, "active-FX product render CPU smoke budget exceeded");
  require(active_stats.p95_ms < quantum_ms * 0.75, "active-FX product render p95 budget exceeded");
  require(active_stats.p99_ms < quantum_ms, "active-FX product render p99 budget exceeded");
  require(
      active_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "active-FX product render missed too many simulated quantums");

  std::cout << "Kessho Product CPU smoke passed: disabled FX "
            << disabled_stats.average_percent << "% avg, "
            << disabled_stats.peak_percent << "% peak, p95 " << disabled_stats.p95_ms
            << " ms, p99 " << disabled_stats.p99_ms << " ms, missed "
            << disabled_stats.missed_quantum_count << "; active FX "
            << active_stats.average_percent << "% avg, "
            << active_stats.peak_percent << "% peak, p95 " << active_stats.p95_ms
            << " ms, p99 " << active_stats.p99_ms << " ms, missed "
            << active_stats.missed_quantum_count << "\n";
  return 0;
}
