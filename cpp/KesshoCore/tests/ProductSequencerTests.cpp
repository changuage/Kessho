#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Core test failed: " << message << "\n";
    std::exit(1);
  }
}

float maxAbs(const std::vector<float>& values) {
  float peak = 0.0f;
  for (float value : values) {
    require(std::isfinite(value), "render produced non-finite samples");
    peak = std::max(peak, std::fabs(value));
  }
  return peak;
}

float renderPadModulePeakBlocks(KesshoProductEngine* engine, uint32_t blocks) {
  require(engine != nullptr, "pad render engine missing");
  require(engine->pad_module != nullptr, "pad render module missing");
  std::array<float, 128> left{};
  std::array<float, 128> right{};
  std::array<float, 128> silent{};
  float peak = 0.0f;
  for (uint32_t block = 0u; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    engine->pad_module->processPlanarStereo(
        silent.data(),
        silent.data(),
        left.data(),
        right.data(),
        static_cast<int>(left.size()));
    for (uint32_t frame = 0u; frame < left.size(); ++frame) {
      require(std::isfinite(left[frame]) && std::isfinite(right[frame]), "pad render produced non-finite samples");
      peak = std::max(peak, std::fabs(left[frame]));
      peak = std::max(peak, std::fabs(right[frame]));
    }
  }
  return peak;
}

void hardStopPadModuleVoices(KesshoProductEngine* engine) {
  require(engine != nullptr, "pad voice stop engine missing");
  require(engine->pad_module != nullptr, "pad voice stop module missing");
  constexpr int kPadModuleVoiceCount = 12;
  for (int voice_index = 0; voice_index < kPadModuleVoiceCount; ++voice_index) {
    engine->pad_module->killVoice(voice_index);
  }
}

void applyRuntimeParam(KesshoProductEngine* engine, uint32_t param_id, float value, const char* label) {
  require(engine != nullptr, "runtime param engine missing");
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = param_id;
  event.value = value;
  engine->applyParam(event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, label);
}

const MidiNoteRuntimeSlot* findMidiSlot(
    const KesshoProductEngine* engine,
    uint32_t source_id,
    uint32_t channel,
    uint32_t note) {
  for (const MidiNoteRuntimeSlot& slot : engine->midi_note_slots) {
    if (slot.active && slot.source_id == source_id && slot.channel == channel && slot.note == note) {
      return &slot;
    }
  }
  return nullptr;
}

uint32_t countMidiSlots(const KesshoProductEngine* engine, uint32_t source_id) {
  uint32_t count = 0u;
  for (const MidiNoteRuntimeSlot& slot : engine->midi_note_slots) {
    if (slot.active && slot.source_id == source_id) {
      ++count;
    }
  }
  return count;
}

uint32_t randomWalkSpeedFlags(float speed) {
  return static_cast<uint32_t>(std::lround(speed * KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SCALE))
      << KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SHIFT;
}

void applySourceDefaults(KesshoProductSnapshotV2& snapshot) {
  for (uint32_t i = 0; i < 7; ++i) {
    const uint32_t source_id = i + 1u;
    KesshoProductSourceSnapshot& source = snapshot.sources[i];
    source.source_id = source_id;
    source.attack_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS;
    source.decay_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS;
    source.sustain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN;
    source.hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
    source.release_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS;
    kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, defaultSourcePresetId(source_id));
  }
}

void appendDrumOverride(KesshoProductSourceSnapshot& source, uint32_t param_index, float value) {
  require(source.drum_override_count < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT, "too many Drum overrides");
  const uint32_t slot = source.drum_override_count++;
  source.drum_override_indices[slot] = param_index;
  source.drum_override_values[slot] = value;
}

float sourcePadOverrideValue(const SourceState& source, uint32_t param_index) {
  for (uint32_t slot = 0u; slot < source.pad_override_count; ++slot) {
    if (source.pad_override_indices[slot] == param_index) {
      return source.pad_override_values[slot];
    }
  }
  require(false, "Pad runtime override value missing");
  return 0.0f;
}

float alternateGeneratedPadParamValue(uint32_t param_index, float current) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_PAD_SOURCE_PRESETS) {
    if (param_index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT) {
      break;
    }
    const float value = preset.params[param_index];
    if (std::isfinite(value) && std::fabs(value - current) > 0.001f) {
      return value;
    }
  }
  return current + (std::fabs(current) > 0.001f ? std::fabs(current) * 0.25f : 0.25f);
}

void requireAllPadRuntimeParamsRefreshLiveModule(
    KesshoProductEngine* engine,
    uint32_t source_id,
    uint32_t runtime_param_base,
    float* module_params,
    uint32_t module_param_offset,
    const char* label) {
  require(module_params != nullptr, "pad runtime module params missing");
  for (uint32_t param_index = 0u; param_index < kProductPadRuntimeParamCount; ++param_index) {
    const float target_value = alternateGeneratedPadParamValue(
        param_index,
        module_params[module_param_offset + param_index]);
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = runtime_param_base + param_index;
    event.value = target_value;
    engine->applyParam(event);
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, label);
    require(
        std::fabs(module_params[module_param_offset + param_index] - target_value) < 0.001f,
        label);
    require(
        std::fabs(sourcePadOverrideValue(engine->sources[source_id - 1u], param_index) - target_value) < 0.001f,
        label);
  }
}

void compileDefaultPadEndpoints(KesshoProductEngine* engine, uint32_t source_id) {
  SourceState& source = engine->sources[source_id - 1u];
  source.source_preset_a_id = defaultSourcePresetId(source_id);
  source.source_preset_b_id = defaultSourcePresetId(source_id);
  engine->compileSourcePresetEndpoints(source);
  require(source.source_preset_endpoint_valid, "default Pad endpoint compile failed");
}

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 1234;
  snapshot.rng.state = 1234;

  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.8f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  applySourceDefaults(snapshot);

  snapshot.synth_euclid.lane_count = 1;
  snapshot.synth_euclid.lanes[0].enabled = 1;
  snapshot.synth_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  snapshot.synth_euclid.lanes[0].step_count = 16;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  snapshot.synth_euclid.lanes[0].rotation = 0;
  snapshot.synth_euclid.lanes[0].clock_division = 16;
  snapshot.synth_euclid.lanes[0].probability = 1.0f;
  snapshot.synth_euclid.lanes[0].ratchet = 1;
  snapshot.synth_euclid.lanes[0].midi_note = 60.0f;
  snapshot.synth_euclid.lanes[0].velocity = 1.0f;
  snapshot.synth_euclid.lanes[0].hold_seconds = 0.1f;
  snapshot.synth_euclid.lanes[0].expression = 0.8f;
  snapshot.synth_euclid.lanes[0].seed = 99;
  snapshot.synth_euclid.lanes[0].bar_reset = 1;

  snapshot.drum_euclid.lane_count = 1;
  snapshot.drum_euclid.lanes[0] = snapshot.synth_euclid.lanes[0];
  snapshot.drum_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
  snapshot.drum_euclid.lanes[0].midi_note = 36.0f;
  snapshot.drum_euclid.lanes[0].hold_seconds = 0.08f;
  return snapshot;
}

void expectOffsets(const KesshoSequencerEvent* events, uint32_t count, const std::vector<uint32_t>& offsets) {
  require(count >= offsets.size(), "not enough sequencer events");
  for (uint32_t offset : offsets) {
    bool found = false;
    for (uint32_t i = 0; i < count; ++i) {
      if (events[i].sample_offset == offset) {
        found = true;
        break;
      }
    }
    require(found, "expected sequencer offset was not generated");
  }
}

bool hasOffset(const KesshoSequencerEvent* events, uint32_t count, uint32_t offset) {
  for (uint32_t i = 0; i < count; ++i) {
    if (events[i].sample_offset == offset) {
      return true;
    }
  }
  return false;
}

struct RenderedSequencerEvent {
  KesshoSequencerEvent event{};
  uint32_t absolute_offset = 0;
};

std::vector<RenderedSequencerEvent> renderEventsInBlocks(
    KesshoProductEngine* engine,
    uint32_t block_size,
    uint32_t total_frames) {
  require(engine != nullptr, "cross-block render engine missing");
  require(block_size > 0u, "cross-block render block size must be positive");
  std::vector<RenderedSequencerEvent> rendered;
  uint32_t cursor = 0u;
  while (cursor < total_frames) {
    KesshoSequencerEvent block_events[64]{};
    const uint32_t frames = std::min(block_size, total_frames - cursor);
    const int32_t event_count = kessho_product_debug_render_events(engine, block_events, 64u, frames);
    require(event_count >= 0, "cross-block debug render failed");
    for (int32_t i = 0; i < event_count; ++i) {
      RenderedSequencerEvent rendered_event{};
      rendered_event.event = block_events[i];
      rendered_event.absolute_offset = cursor + block_events[i].sample_offset;
      rendered.push_back(rendered_event);
    }
    cursor += frames;
  }
  return rendered;
}

void expectAbsoluteOffsets(
    const std::vector<RenderedSequencerEvent>& events,
    const std::vector<uint32_t>& expected_offsets,
    const char* message) {
  require(events.size() == expected_offsets.size(), message);
  for (uint32_t expected : expected_offsets) {
    bool found = false;
    for (const RenderedSequencerEvent& event : events) {
      if (event.absolute_offset == expected) {
        found = true;
        break;
      }
    }
    require(found, message);
  }
  for (uint32_t i = 0u; i < events.size(); ++i) {
    for (uint32_t j = i + 1u; j < events.size(); ++j) {
      require(events[i].absolute_offset != events[j].absolute_offset, message);
    }
  }
}

std::vector<uint32_t> expectedRatchetOffsets(uint32_t ratchet, uint32_t parent_offset = 0u) {
  std::vector<uint32_t> offsets;
  const double samples_per_step = 6000.0;
  const double spacing = samples_per_step / static_cast<double>(ratchet);
  for (uint32_t i = 0u; i < ratchet; ++i) {
    offsets.push_back(parent_offset + static_cast<uint32_t>(std::llround(spacing * i)));
  }
  return offsets;
}

KesshoProductSnapshotV2 makeSingleRatchetSnapshot(
    uint32_t source_id,
    uint32_t ratchet,
    float initial_start_delay_seconds = 0.0f) {
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.transport.running = 1;
  const bool drum = source_id == KESSHO_PRODUCT_SOURCE_DRUM;
  snapshot.synth_euclid.lane_count = drum ? 0u : 1u;
  snapshot.drum_euclid.lane_count = drum ? 1u : 0u;
  auto& lane = drum ? snapshot.drum_euclid.lanes[0] : snapshot.synth_euclid.lanes[0];
  lane.enabled = 1;
  lane.target_source_id = source_id;
  lane.step_count = 1;
  lane.fill_count = 1;
  lane.manual_step_mask_low = 1u;
  lane.manual_step_mask_high = 0u;
  lane.clock_division = 16;
  lane.probability = 1.0f;
  lane.ratchet = ratchet;
  lane.initial_start_delay_seconds = initial_start_delay_seconds;
  if (drum) {
    lane.midi_note = 36.0f;
    lane.hold_seconds = 0.08f;
  } else {
    lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
    lane.midi_note = 60.0f;
    lane.hold_seconds = 0.1f;
  }
  return snapshot;
}

void requireProductSequencerRatchetCrossBlockTest() {
  constexpr double sample_rate = 48000.0;
  constexpr uint32_t step_frames = 6000u;
  const uint32_t ratchets[] = {1u, 2u, 3u, 4u, 8u};
  const uint32_t block_sizes[] = {64u, 128u, 256u};
  const uint32_t sources[] = {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_SOURCE_DRUM};

  for (uint32_t source_id : sources) {
    for (uint32_t ratchet : ratchets) {
      for (uint32_t block_size : block_sizes) {
        KesshoProductEngine* engine = kessho_product_create(sample_rate, 4096u, 0);
        require(engine != nullptr, "ratchet cross-block engine create failed");
        KesshoProductSnapshotV2 snapshot = makeSingleRatchetSnapshot(source_id, ratchet);
        require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet cross-block snapshot load failed");
        const std::vector<RenderedSequencerEvent> events = renderEventsInBlocks(engine, block_size, step_frames);
        expectAbsoluteOffsets(events, expectedRatchetOffsets(ratchet), "ratchet cross-block offsets should be complete and unique");
        const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
        if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
          require(telemetry.drum_sequencer_hit_counts[0] == 1u, "drum emitted hit count should increment once per parent ratchet step");
        } else {
          require(telemetry.synth_sequencer_hit_counts[0] == 1u, "synth emitted hit count should increment once per parent ratchet step");
        }
        kessho_product_destroy(engine);
      }
    }
  }
}

void requireProductSequencerRatchetNearBlockEndTest() {
  constexpr double sample_rate = 48000.0;
  constexpr uint32_t block_size = 64u;
  constexpr uint32_t parent_offset = 63u;
  KesshoProductEngine* engine = kessho_product_create(sample_rate, 4096u, 0);
  require(engine != nullptr, "ratchet near-block-end engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSingleRatchetSnapshot(
      KESSHO_PRODUCT_SOURCE_PAD1,
      4u,
      static_cast<float>(static_cast<double>(parent_offset) / sample_rate));
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet near-block-end snapshot load failed");
  const std::vector<RenderedSequencerEvent> events = renderEventsInBlocks(engine, block_size, 6063u);
  expectAbsoluteOffsets(events, expectedRatchetOffsets(4u, parent_offset), "ratchet parent near block end should drain future subhits");
  kessho_product_destroy(engine);
}

void requireProductSequencerRatchetPendingClearTests() {
  constexpr double sample_rate = 48000.0;

  {
    KesshoProductEngine* engine = kessho_product_create(sample_rate, 4096u, 0);
    require(engine != nullptr, "ratchet stop-clear engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSingleRatchetSnapshot(KESSHO_PRODUCT_SOURCE_PAD1, 8u);
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet stop-clear snapshot load failed");
    std::vector<RenderedSequencerEvent> events = renderEventsInBlocks(engine, 64u, 64u);
    expectAbsoluteOffsets(events, {0u}, "ratchet stop-clear setup should emit only the first subhit");
    require(engine->synth_lanes[0].pending_ratchet_count > 0u, "ratchet stop-clear setup should leave future subhits pending");
    KesshoProductEvent stop{};
    stop.event_kind = KESSHO_PRODUCT_EVENT_KIND_STOP;
    require(kessho_product_enqueue_event(engine, &stop) == KESSHO_PRODUCT_OK, "ratchet stop event enqueue failed");
    events = renderEventsInBlocks(engine, 64u, 6000u);
    require(events.empty(), "transport stop should clear pending ratchet subhits");
    require(engine->synth_lanes[0].pending_ratchet_count == 0u, "transport stop should empty pending ratchet queue");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(sample_rate, 4096u, 0);
    require(engine != nullptr, "ratchet snapshot-clear engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSingleRatchetSnapshot(KESSHO_PRODUCT_SOURCE_PAD1, 8u);
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet snapshot-clear snapshot load failed");
    std::vector<RenderedSequencerEvent> events = renderEventsInBlocks(engine, 64u, 64u);
    expectAbsoluteOffsets(events, {0u}, "ratchet snapshot-clear setup should emit only the first subhit");
    require(engine->synth_lanes[0].pending_ratchet_count > 0u, "ratchet snapshot-clear setup should leave future subhits pending");
    snapshot.transport.running = 0;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet snapshot-clear reload failed");
    require(engine->synth_lanes[0].pending_ratchet_count == 0u, "snapshot reload should empty pending ratchet queue");
    events = renderEventsInBlocks(engine, 64u, 6000u);
    require(events.empty(), "snapshot reload should not emit stale pending ratchets");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(sample_rate, 4096u, 0);
    require(engine != nullptr, "ratchet tempo-clear engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSingleRatchetSnapshot(KESSHO_PRODUCT_SOURCE_PAD1, 8u);
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet tempo-clear snapshot load failed");
    std::vector<RenderedSequencerEvent> events = renderEventsInBlocks(engine, 64u, 64u);
    expectAbsoluteOffsets(events, {0u}, "ratchet tempo-clear setup should emit only the first subhit");
    require(engine->synth_lanes[0].pending_ratchet_count > 0u, "ratchet tempo-clear setup should leave future subhits pending");
    KesshoProductEvent tempo{};
    tempo.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT;
    tempo.value = 60.0f;
    require(kessho_product_enqueue_event(engine, &tempo) == KESSHO_PRODUCT_OK, "ratchet tempo event enqueue failed");
    events = renderEventsInBlocks(engine, 64u, 6000u);
    require(events.empty(), "tempo change should clear pending ratchets with old absolute timing");
    require(engine->synth_lanes[0].pending_ratchet_count == 0u, "tempo change should empty pending ratchet queue");
    kessho_product_destroy(engine);
  }
}

bool laneHasGeneratedOverrides(const LaneState& lane) {
  return lane.step_override_set_low != 0u ||
      lane.step_override_set_high != 0u ||
      lane.probability_override_set_low != 0u ||
      lane.probability_override_set_high != 0u ||
      lane.ratchet_override_set_low != 0u ||
      lane.ratchet_override_set_high != 0u ||
      lane.trig_condition_override_set_low != 0u ||
      lane.trig_condition_override_set_high != 0u ||
      lane.midi_note_override_set_low != 0u ||
      lane.midi_note_override_set_high != 0u ||
      lane.expression_override_set_low != 0u ||
      lane.expression_override_set_high != 0u ||
      lane.expression_range_set_low != 0u ||
      lane.expression_range_set_high != 0u ||
      lane.morph_override_set_low != 0u ||
      lane.morph_override_set_high != 0u ||
      lane.morph_range_set_low != 0u ||
      lane.morph_range_set_high != 0u ||
      lane.distance_override_set_low != 0u ||
      lane.distance_override_set_high != 0u ||
      lane.distance_range_set_low != 0u ||
      lane.distance_range_set_high != 0u;
}

void requireLaneMutationStateEqual(const LaneState& actual, const LaneState& expected, const char* message) {
  require(actual.step_override_set_low == expected.step_override_set_low, message);
  require(actual.step_override_set_high == expected.step_override_set_high, message);
  require(actual.step_override_value_low == expected.step_override_value_low, message);
  require(actual.step_override_value_high == expected.step_override_value_high, message);
  require(actual.probability_override_set_low == expected.probability_override_set_low, message);
  require(actual.probability_override_set_high == expected.probability_override_set_high, message);
  require(actual.ratchet_override_set_low == expected.ratchet_override_set_low, message);
  require(actual.ratchet_override_set_high == expected.ratchet_override_set_high, message);
  require(actual.trig_condition_override_set_low == expected.trig_condition_override_set_low, message);
  require(actual.trig_condition_override_set_high == expected.trig_condition_override_set_high, message);
  require(actual.midi_note_override_set_low == expected.midi_note_override_set_low, message);
  require(actual.midi_note_override_set_high == expected.midi_note_override_set_high, message);
  require(actual.expression_override_set_low == expected.expression_override_set_low, message);
  require(actual.expression_override_set_high == expected.expression_override_set_high, message);
  require(actual.expression_range_set_low == expected.expression_range_set_low, message);
  require(actual.expression_range_set_high == expected.expression_range_set_high, message);
  require(actual.morph_override_set_low == expected.morph_override_set_low, message);
  require(actual.morph_override_set_high == expected.morph_override_set_high, message);
  require(actual.morph_range_set_low == expected.morph_range_set_low, message);
  require(actual.morph_range_set_high == expected.morph_range_set_high, message);
  require(actual.distance_override_set_low == expected.distance_override_set_low, message);
  require(actual.distance_override_set_high == expected.distance_override_set_high, message);
  require(actual.distance_range_set_low == expected.distance_range_set_low, message);
  require(actual.distance_range_set_high == expected.distance_range_set_high, message);
  for (uint32_t i = 0; i < 64u; ++i) {
    require(std::fabs(actual.probability_overrides[i] - expected.probability_overrides[i]) < 0.000001f, message);
    require(actual.ratchet_overrides[i] == expected.ratchet_overrides[i], message);
    require(actual.trig_condition_numerators[i] == expected.trig_condition_numerators[i], message);
    require(actual.trig_condition_denominators[i] == expected.trig_condition_denominators[i], message);
    require(std::fabs(actual.midi_note_overrides[i] - expected.midi_note_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.expression_overrides[i] - expected.expression_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.expression_range_maxes[i] - expected.expression_range_maxes[i]) < 0.000001f, message);
    require(std::fabs(actual.morph_overrides[i] - expected.morph_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.morph_range_maxes[i] - expected.morph_range_maxes[i]) < 0.000001f, message);
    require(std::fabs(actual.distance_overrides[i] - expected.distance_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.distance_range_maxes[i] - expected.distance_range_maxes[i]) < 0.000001f, message);
  }
  for (uint32_t i = 0; i < 8u; ++i) {
    require(actual.step_value_configs[i].enabled == expected.step_value_configs[i].enabled, message);
    require(actual.step_value_configs[i].steps == expected.step_value_configs[i].steps, message);
    require(actual.step_value_configs[i].direction == expected.step_value_configs[i].direction, message);
  }
}

bool maskHas(uint32_t low, uint32_t high, uint32_t step) {
  if (step < 32u) {
    return (low & (1u << step)) != 0u;
  }
  return (high & (1u << (step - 32u))) != 0u;
}

void enqueueSequencerStep(
    KesshoProductEngine* engine,
    uint32_t target_id,
    uint32_t lane_index,
    uint32_t step,
    uint32_t field,
    float value,
    float value2 = 0.0f,
    float value3 = 0.0f,
    uint32_t extra_flags = 0u) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  event.target_id = target_id;
  event.index = lane_index;
  event.param_id = step;
  event.value = value;
  event.value2 = value2;
  event.value3 = value3;
  event.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | field | extra_flags;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "sequencer UI replay enqueue failed");
}

void replaySequencerUiLane(
    KesshoProductEngine* engine,
    uint32_t target_id,
    uint32_t lane_index,
    const KesshoProductSequencerLaneUiState& lane) {
  KesshoProductEvent clear{};
  clear.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  clear.target_id = target_id;
  clear.index = lane_index;
  clear.flags = KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_LANE;
  require(kessho_product_enqueue_event(engine, &clear) == KESSHO_PRODUCT_OK, "sequencer UI replay clear failed");

  for (uint32_t field_id = 0; field_id < KESSHO_PRODUCT_SEQUENCER_UI_STATE_SUBLANES; ++field_id) {
    if ((lane.step_value_config_enabled_mask & (1u << field_id)) == 0u) {
      continue;
    }
    KesshoProductEvent config{};
    config.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
    config.target_id = target_id;
    config.index = lane_index;
    config.param_id = field_id;
    config.value = 1.0f;
    config.value2 = static_cast<float>(lane.step_value_config_steps[field_id]);
    config.value3 = static_cast<float>(lane.step_value_config_directions[field_id]);
    config.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG;
    require(kessho_product_enqueue_event(engine, &config) == KESSHO_PRODUCT_OK, "sequencer UI replay config failed");
  }

  for (uint32_t step = 0; step < KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS; ++step) {
    if (maskHas(lane.step_override_set_low, lane.step_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_TRIGGER,
          maskHas(lane.step_override_value_low, lane.step_override_value_high, step) ? 1.0f : 0.0f);
    }
    if (maskHas(lane.probability_override_set_low, lane.probability_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_PROBABILITY,
          lane.probability_overrides[step]);
    }
    if (maskHas(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_RATCHET,
          static_cast<float>(lane.ratchet_overrides[step]));
    }
    if (maskHas(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION,
          static_cast<float>(lane.trig_condition_numerators[step]),
          static_cast<float>(lane.trig_condition_denominators[step]));
    }
    if (maskHas(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE,
          lane.midi_note_overrides[step]);
    }
    if (maskHas(lane.expression_override_set_low, lane.expression_override_set_high, step)) {
      const bool is_range = maskHas(lane.expression_range_set_low, lane.expression_range_set_high, step);
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
          lane.expression_overrides[step],
          is_range ? lane.expression_range_maxes[step] : 0.0f,
          0.0f,
          is_range ? KESSHO_PRODUCT_STEP_TOGGLE_RANGE_VALUE : 0u);
    }
    if (maskHas(lane.morph_override_set_low, lane.morph_override_set_high, step)) {
      const bool is_range = maskHas(lane.morph_range_set_low, lane.morph_range_set_high, step);
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_MORPH,
          lane.morph_overrides[step],
          is_range ? lane.morph_range_maxes[step] : 0.0f,
          0.0f,
          is_range ? KESSHO_PRODUCT_STEP_TOGGLE_RANGE_VALUE : 0u);
    }
    if (maskHas(lane.distance_override_set_low, lane.distance_override_set_high, step)) {
      const bool is_range = maskHas(lane.distance_range_set_low, lane.distance_range_set_high, step);
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
          lane.distance_overrides[step],
          is_range ? lane.distance_range_maxes[step] : 0.0f,
          0.0f,
          is_range ? KESSHO_PRODUCT_STEP_TOGGLE_RANGE_VALUE : 0u);
    }
  }
}

void enqueueParam(
    KesshoProductEngine* engine,
    uint32_t event_kind,
    uint32_t target_id,
    uint32_t lane_index,
    uint32_t param_id,
    float value) {
  KesshoProductEvent event{};
  event.event_kind = event_kind;
  event.target_id = target_id;
  event.index = lane_index;
  event.param_id = param_id;
  event.value = value;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "param event enqueue failed");
}

void enqueueRuntimeWalkRange(
    KesshoProductEngine* engine,
    uint32_t target_id,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    float current_value,
    uint32_t extra_flags) {
  KesshoProductEvent range{};
  range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  range.target_id = target_id;
  range.index = control_id;
  range.param_id = param_id;
  range.value = min_value;
  range.value2 = max_value;
  range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK);
  range.value4 = current_value;
  range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE | extra_flags;
  require(kessho_product_enqueue_event(engine, &range) == KESSHO_PRODUCT_OK, "runtime walk range enqueue failed");
}

void enqueueRuntimeWalkRange(
    KesshoProductEngine* engine,
    uint32_t target_id,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    float current_value) {
  enqueueRuntimeWalkRange(
      engine,
      target_id,
      param_id,
      control_id,
      min_value,
      max_value,
      current_value,
      KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_GLOBAL | randomWalkSpeedFlags(4.25f));
}

bool granularVoiceParamOffset(uint32_t param_id, uint32_t& voice_index, uint32_t& offset) {
  if (param_id < KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID ||
      param_id > KESSHO_PRODUCT_PARAM_FX_GRANULAR_V4_EUCLID_MUTED_ID) {
    return false;
  }
  const uint32_t raw_offset = param_id - KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID;
  voice_index = raw_offset / kGranularVoiceParamCount;
  offset = raw_offset % kGranularVoiceParamCount;
  return voice_index < kGranularVoiceCount;
}

float granularVoiceRuntimeFieldValue(const GranularVoiceState& voice, uint32_t offset) {
  switch (offset) {
    case 3:
      return voice.speed;
    case 4:
      return voice.scan_rate;
    case 6:
      return voice.pitch;
    case 7:
      return voice.write_follow;
    case 8:
      return voice.density;
    case 9:
      return voice.grain_size_ms;
    case 10:
      return voice.spray;
    case 11:
      return voice.grain_octave_probability;
    case 12:
      return voice.attack_seconds;
    case 13:
      return voice.decay_seconds;
    case 14:
      return voice.gain;
    case 15:
      return voice.pan;
    case 16:
      return voice.blur;
    case 17:
      return voice.stereo_spread;
    case 18:
      return voice.position_lfo_rate;
    case 19:
      return voice.position_lfo_depth;
    case 20:
      return voice.pan_lfo_rate;
    case 21:
      return voice.reverse_lfo_rate;
    case 22:
      return voice.record_lfo_rate;
    default:
      require(false, "granular voice runtime probe missing field reader");
      return 0.0f;
  }
}

uint32_t granularModuleParamIndexForProductParam(uint32_t param_id) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID:
      return 4u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_LPF_HZ_ID:
      return 5u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUFFER_SECONDS_ID:
      return 6u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUS_DIFFUSION_ID:
      return 8u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_TIMING_RANDOMNESS_ID:
      return 9u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_CHORD_BIAS_ID:
      return kGranularChordBiasParam;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_JITTER_MS_ID:
      return kGranularLegacyParamStart;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID:
      return kGranularLegacyParamStart + 1u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_SPREAD_ID:
      return kGranularLegacyParamStart + 3u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID:
      return kGranularLegacyParamStart + 4u;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_FEEDBACK_ID:
      return kGranularLegacyParamStart + 5u;
    default:
      break;
  }

  uint32_t voice_index = 0u;
  uint32_t offset = 0u;
  if (granularVoiceParamOffset(param_id, voice_index, offset) &&
      (offset == 3u || offset == 4u || (offset >= 6u && offset <= 22u))) {
    return kGranularGlobalParamCount + voice_index * kGranularVoiceParamCount + offset;
  }
  return UINT32_MAX;
}

float productRuntimeFieldValue(const KesshoProductEngine& engine, uint32_t param_id) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID:
      return engine.master_gain;
    case KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID:
      return engine.master_limiter_ceiling_db;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_LEFT_MS_ID:
      return engine.fx.delay_a_time_left_ms;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_RIGHT_MS_ID:
      return engine.fx.delay_a_time_right_ms;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID:
      return engine.fx.delay_a_feedback;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID:
      return engine.fx.delay_a_mix;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID:
      return engine.fx.delay_a_filter_hz;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_RATE_HZ_ID:
      return engine.fx.delay_a_mod_rate_hz;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_DEPTH_MS_ID:
      return engine.fx.delay_a_mod_depth_ms;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ADUCK_ID:
      return engine.fx.delay_a_duck;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_AWIDTH_ID:
      return engine.fx.delay_a_width;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_ACROSS_FEED_FILTER_HZ_ID:
      return engine.fx.delay_a_cross_feed_filter_hz;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BACTIVITY_ID:
      return engine.fx.delay_b_activity;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BREPEATS_ID:
      return engine.fx.delay_b_repeats;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BBASE_TIME_MS_ID:
      return engine.fx.delay_b_base_time_ms;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTONE_ID:
      return engine.fx.delay_b_tone;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BVIBRATO_ID:
      return engine.fx.delay_b_vibrato;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID:
      return engine.fx.delay_b_mix;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_INTENSITY_ID:
      return engine.fx.delay_b_warp_intensity;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID:
      return engine.fx.delay_b_spread;
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD2_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD3_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD4_LEVEL_ID:
      return engine.fx.delay_b_tape_head_levels[param_id - KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_LEVEL_ID];
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_PAN_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD2_PAN_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD3_PAN_ID:
    case KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD4_PAN_ID:
      return engine.fx.delay_b_tape_head_pans[param_id - KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_PAN_ID];
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID:
      return engine.fx.granular_mix;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID:
      return engine.fx.granular_feedback;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_LPF_HZ_ID:
      return engine.fx.granular_feedback_lpf_hz;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_REVERB_LPF_HZ_ID:
      return engine.fx.granular_reverb_lpf_hz;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_OUTPUT_LPF_HZ_ID:
      return engine.fx.granular_output_lpf_hz;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUFFER_SECONDS_ID:
      return engine.fx.granular_buffer_seconds;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUS_DIFFUSION_ID:
      return engine.fx.granular_bus_diffusion;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_TIMING_RANDOMNESS_ID:
      return engine.fx.granular_timing_randomness;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_CHORD_BIAS_ID:
      return engine.fx.granular_chord_bias;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_JITTER_MS_ID:
      return engine.fx.granular_legacy_jitter_ms;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID:
      return engine.fx.granular_legacy_probability;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_SPREAD_ID:
      return engine.fx.granular_legacy_pitch_spread;
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID:
      return static_cast<float>(engine.fx.granular_legacy_max_grains);
    case KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_FEEDBACK_ID:
      return engine.fx.granular_legacy_feedback;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID:
      return engine.fx.reverb_mix;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID:
      return engine.fx.reverb_decay;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID:
      return engine.fx.reverb_size;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMPING_ID:
      return engine.fx.reverb_damping;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DIFFUSION_ID:
      return engine.fx.reverb_diffusion;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MODULATION_ID:
      return engine.fx.reverb_modulation;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PREDELAY_MS_ID:
      return engine.fx.reverb_predelay_ms;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID:
      return engine.fx.reverb_width;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID:
      return engine.fx.reverb_shimmer_amount;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_PITCH_ID:
      return engine.fx.reverb_shimmer_pitch;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_RATE_HZ_ID:
      return engine.fx.reverb_slow_rate_hz;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_DEPTH_ID:
      return engine.fx.reverb_slow_depth;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_AMOUNT_ID:
      return engine.fx.reverb_reverse_amount;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_REVERSE_LENGTH_SEC_ID:
      return engine.fx.reverb_reverse_length_sec;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_RATE_HZ_ID:
      return engine.fx.reverb_chorus_rate_hz;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_DEPTH_ID:
      return engine.fx.reverb_chorus_depth;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_LOW_ID:
      return engine.fx.reverb_damp_low;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMP_HIGH_ID:
      return engine.fx.reverb_damp_high;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSSOVER_HZ_ID:
      return engine.fx.reverb_crossover_hz;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_INPUT_TONE_ID:
      return engine.fx.reverb_input_tone;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_FEEDBACK_ID:
      return engine.fx.reverb_shimmer_feedback;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WARP_ID:
      return engine.fx.reverb_warp;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSS_FEED_ID:
      return engine.fx.reverb_cross_feed;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_EARLY_REFLECTIONS_ID:
      return engine.fx.reverb_early_reflections;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_AIR_ABSORPTION_ID:
      return engine.fx.reverb_air_absorption;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_TRANSIENT_SMOOTH_ID:
      return engine.fx.reverb_transient_smooth;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_ER_LP_FREQ_ID:
      return engine.fx.reverb_er_lp_freq;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_THRESHOLD_ID:
      return engine.fx.reverb_pre_comp_threshold;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_KNEE_ID:
      return engine.fx.reverb_pre_comp_knee;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RATIO_ID:
      return engine.fx.reverb_pre_comp_ratio;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_ATTACK_MS_ID:
      return engine.fx.reverb_pre_comp_attack_ms;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RELEASE_MS_ID:
      return engine.fx.reverb_pre_comp_release_ms;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_MAKEUP_ID:
      return engine.fx.reverb_pre_comp_makeup;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID:
      return engine.fx.spectral_freeze_mix;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SPEED_ID:
      return engine.fx.spectral_freeze_speed;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DECAY_ID:
      return engine.fx.spectral_freeze_decay;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_PHASE_JITTER_ID:
      return engine.fx.spectral_freeze_phase_jitter;
    case KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_REVERB_CROSSFADE_ID:
      return engine.fx.spectral_freeze_reverb_crossfade;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID:
      return engine.fx.dynamics_drive;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_MIX_ID:
      return engine.fx.dynamics_drift_mix;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_AGE_ID:
      return engine.fx.dynamics_drift_age;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_BIAS_ID:
      return engine.fx.dynamics_drift_bias;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_LPG_AMOUNT_ID:
      return engine.fx.dynamics_drift_lpg_amount;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_RESONANCE_ID:
      return engine.fx.dynamics_drift_resonance;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_STEREO_ID:
      return engine.fx.dynamics_drift_stereo;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_ENV_FOLLOW_ID:
      return engine.fx.dynamics_drift_env_follow;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_DEPTH_ID:
      return engine.fx.dynamics_drift_depth;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_RATE_ID:
      return engine.fx.dynamics_drift_rate;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_DAMP_ID:
      return engine.fx.dynamics_drift_damp;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_MIX_ID:
      return engine.fx.dynamics_erosion_mix;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_AGE_ID:
      return engine.fx.dynamics_erosion_age;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_GENERATION_ID:
      return engine.fx.dynamics_erosion_generation;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_ALIAS_ID:
      return engine.fx.dynamics_erosion_alias;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_WOW_ID:
      return engine.fx.dynamics_erosion_wow;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_FLUTTER_ID:
      return engine.fx.dynamics_erosion_flutter;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_DRIFT_ID:
      return engine.fx.dynamics_erosion_drift;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_WOBBLE_SPEED_ID:
      return engine.fx.dynamics_erosion_wobble_speed;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_TONE_ID:
      return engine.fx.dynamics_erosion_tone;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_HP_ID:
      return engine.fx.dynamics_degrade_hp;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DEGRADE_LP_ID:
      return engine.fx.dynamics_degrade_lp;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_NOISE_ID:
      return engine.fx.dynamics_erosion_noise;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_SATURATION_ID:
      return engine.fx.dynamics_erosion_saturation;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_CORROSION_ID:
      return engine.fx.dynamics_erosion_corrosion;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID:
      return engine.fx.dynamics_saturation_drive;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_TONE_ID:
      return engine.fx.dynamics_saturation_tone;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_BIAS_ID:
      return engine.fx.dynamics_saturation_bias;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_THRESHOLD_ID:
      return engine.fx.dynamics_end_comp_threshold;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_KNEE_ID:
      return engine.fx.dynamics_end_comp_knee;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_RATIO_ID:
      return engine.fx.dynamics_end_comp_ratio;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_ATTACK_MS_ID:
      return engine.fx.dynamics_end_comp_attack_ms;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_RELEASE_MS_ID:
      return engine.fx.dynamics_end_comp_release_ms;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MAKEUP_ID:
      return engine.fx.dynamics_end_comp_makeup;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MIX_ID:
      return engine.fx.dynamics_end_comp_mix;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_DETECTOR_HP_ID:
      return engine.fx.dynamics_end_comp_detector_hp;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_DETECTOR_TILT_ID:
      return engine.fx.dynamics_end_comp_detector_tilt;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_AUTO_MAKEUP_ID:
      return engine.fx.dynamics_end_comp_auto_makeup;
    case KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_PROGRAM_RELEASE_ID:
      return engine.fx.dynamics_end_comp_program_release;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_AWEIGHT_ID:
      return engine.fx.sidechain_key_a_weight;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KEY_BWEIGHT_ID:
      return engine.fx.sidechain_key_b_weight;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_AMOUNT_ID:
      return engine.fx.sidechain_amount;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_THRESHOLD_ID:
      return engine.fx.sidechain_threshold;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RATIO_ID:
      return engine.fx.sidechain_ratio;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_KNEE_ID:
      return engine.fx.sidechain_knee;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_ATTACK_MS_ID:
      return engine.fx.sidechain_attack_ms;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_HOLD_MS_ID:
      return engine.fx.sidechain_hold_ms;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RELEASE_MS_ID:
      return engine.fx.sidechain_release_ms;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_MAKEUP_ID:
      return engine.fx.sidechain_makeup;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_MIX_ID:
      return engine.fx.sidechain_mix;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_CURVE_ID:
      return engine.fx.sidechain_curve;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DETECTOR_HP_ID:
      return engine.fx.sidechain_detector_hp;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DETECTOR_LP_ID:
      return engine.fx.sidechain_detector_lp;
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD1_TARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD2_TARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_LEAD1_TARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_LEAD2_TARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PIANO_TARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_GRANULAR_TARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DELAY_ATARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_DELAY_BTARGET_ID:
    case KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_REVERB_TARGET_ID:
      return engine.fx.sidechain_targets[param_id - KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD1_TARGET_ID];
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_DELAY_B_ID:
      return engine.routing.delay_a_to_delay_b;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_DELAY_A_ID:
      return engine.routing.delay_b_to_delay_a;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_TO_REVERB_ID:
      return engine.routing.delay_to_reverb;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_REVERB_ID:
      return engine.routing.granular_to_reverb;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID:
      return engine.routing.delay_a_to_granular;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_GRANULAR_ID:
      return engine.routing.delay_b_to_granular;
    case KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_REVERB_ID:
      return engine.routing.delay_b_to_reverb;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DELAY_A_ID:
      return engine.routing.granular_to_delay_a;
    case KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_DELAY_B_ID:
      return engine.routing.granular_to_delay_b;
    case KESSHO_PRODUCT_PARAM_ROUTING_DEGRADE_TO_REVERB_ID:
      return engine.routing.degrade_to_reverb;
    case kProductPadRuntimeParamIdBase + 21u:
      return sourcePadOverrideValue(engine.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u], 21u);
    case kProductPad2RuntimeParamIdBase + 21u:
      return sourcePadOverrideValue(engine.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u], 21u);
    default:
      uint32_t voice_index = 0u;
      uint32_t offset = 0u;
      if (granularVoiceParamOffset(param_id, voice_index, offset)) {
        return granularVoiceRuntimeFieldValue(engine.fx.granular_voices[voice_index], offset);
      }
      require(false, "runtime walk product probe missing field reader");
      return 0.0f;
  }
}

float sourceRuntimeFieldValue(const SourceState& source, uint32_t param_id) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
      return source.level;
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
      return source.morph;
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
      return source.distance;
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
      return source.expression;
    case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
      return source.dry_gain;
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
      return source.reverb_send;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
      return source.delay_a_send;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
      return source.delay_b_send;
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
      return source.granular_send;
    case KESSHO_PRODUCT_PARAM_SOURCE_DIFFUSE_SEND_ID:
      return source.diffuse_send;
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
      return source.post_lpf_hz;
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
      return source.stereo_width;
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
      return source.post_lpf_key_tracking;
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
      return source.attack_seconds;
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
      return source.decay_seconds;
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
      return source.sustain;
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
      return source.hold_seconds;
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
      return source.release_seconds;
    default:
      require(false, "runtime walk source probe missing field reader");
      return 0.0f;
  }
}

void requireGranularModuleRuntimeFieldValue(
    const KesshoProductEngine& engine,
    uint32_t param_id,
    float expected,
    const char* label) {
  const uint32_t module_param_index = granularModuleParamIndexForProductParam(param_id);
  if (module_param_index == UINT32_MAX) {
    return;
  }
  require(engine.granular_module != nullptr, "granular module missing for runtime probe");
  const float* params = engine.granular_module->params();
  require(params != nullptr, "granular module params missing for runtime probe");
  require(
      static_cast<uint32_t>(engine.granular_module->paramCount()) > module_param_index,
      "granular module param index outside module range");
  require(std::fabs(params[module_param_index] - expected) < 0.001f, label);
}

uint32_t reverbModuleParamIndexForProductParam(uint32_t param_id) {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID:
      return 2u;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID:
      return 3u;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_DAMPING_ID:
      return 4u;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_MODULATION_ID:
      return 6u;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID:
      return 8u;
    case KESSHO_PRODUCT_PARAM_FX_REVERB_CROSS_FEED_ID:
      return 24u;
    default:
      return UINT32_MAX;
  }
}

void requireReverbModuleRuntimeFieldValue(
    const KesshoProductEngine& engine,
    uint32_t param_id,
    float expected,
    const char* label) {
  const uint32_t module_param_index = reverbModuleParamIndexForProductParam(param_id);
  if (module_param_index == UINT32_MAX) {
    return;
  }
  require(engine.reverb_module != nullptr, "reverb module missing for runtime probe");
  const float* params = engine.reverb_module->params();
  require(params != nullptr, "reverb module params missing for runtime probe");
  require(
      static_cast<uint32_t>(engine.reverb_module->paramCount()) > module_param_index,
      "reverb module param index outside module range");
  require(std::fabs(params[module_param_index] - expected) < 0.001f, label);
}

void requireTelemetryContainsRuntimeWalk(
    const KesshoProductTelemetry& telemetry,
    uint32_t control_id,
    float min_value,
    float max_value,
    const char* label) {
  for (uint32_t index = 0; index < telemetry.runtime_walk_count; ++index) {
    if (telemetry.runtime_walk_control_ids[index] != control_id) continue;
    const float value = telemetry.runtime_walk_values[index];
    require(value >= min_value && value <= max_value, label);
    return;
  }
  require(false, label);
}

void renderSilentBlocks(KesshoProductEngine* engine, uint32_t block_count) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  for (uint32_t block = 0; block < block_count; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128u);
  }
}

KesshoProductDebugVoiceSpawn latestDebugVoiceSpawnForSource(
    const KesshoProductTelemetry& telemetry,
    uint32_t source_id,
    const char* message) {
  bool found = false;
  KesshoProductDebugVoiceSpawn latest{};
  for (uint32_t i = 0; i < telemetry.debug_voice_spawn_count; ++i) {
    const KesshoProductDebugVoiceSpawn& spawn = telemetry.debug_voice_spawns[i];
    if (spawn.source_id != source_id) {
      continue;
    }
    if (!found || spawn.trigger_sequence > latest.trigger_sequence) {
      found = true;
      latest = spawn;
    }
  }
  require(found, message);
  return latest;
}

void requireRuntimeWalkMovementAcrossAudioAndFxTargets() {
  struct ProductProbe {
    uint32_t param_id;
    float min_value;
    float max_value;
    float current_value;
    const char* label;
  };
  const ProductProbe product_probes[] = {
      {KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID, 0.15f, 0.95f, 0.35f, "master gain runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID, 0.05f, 0.85f, 0.22f, "Delay A feedback runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID, 0.05f, 0.95f, 0.24f, "Delay B mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID, 0.05f, 0.95f, 0.26f, "granular mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID, 0.05f, 0.95f, 0.28f, "reverb mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID, 0.1f, 0.9f, 0.45f, "reverb decay runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID, 0.2f, 1.0f, 0.6f, "reverb width runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID, 0.05f, 0.95f, 0.30f, "spectral freeze mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID, 0.05f, 0.95f, 0.31f, "dynamics drive runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID, 0.05f, 0.95f, 0.32f, "dynamics saturation drive runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_WOBBLE_SPEED_ID, 0.05f, 0.95f, 0.35f, "dynamics degrade wobble-speed runtime walk did not move"},
      {kProductPadRuntimeParamIdBase + 21u, 250.0f, 3200.0f, 900.0f, "Pad 1 exact cutoff runtime walk did not move"},
      {kProductPad2RuntimeParamIdBase + 21u, 450.0f, 6200.0f, 1600.0f, "Pad 2 exact cutoff runtime walk did not move"},
  };

  KesshoProductEngine* product_walk = kessho_product_create(48000.0, 128, 0);
  require(product_walk != nullptr, "runtime walk product engine allocation failed");
  compileDefaultPadEndpoints(product_walk, KESSHO_PRODUCT_SOURCE_PAD1);
  compileDefaultPadEndpoints(product_walk, KESSHO_PRODUCT_SOURCE_PAD2);
  uint32_t control_id = 410u;
  for (const ProductProbe& probe : product_probes) {
    enqueueRuntimeWalkRange(product_walk, 0u, probe.param_id, control_id++, probe.min_value, probe.max_value, probe.current_value);
  }
  std::vector<float> left(128);
  std::vector<float> right(128);
  for (uint32_t block = 0; block < 8u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(product_walk, left.data(), right.data(), 128u);
  }
  const uint32_t product_probe_count = static_cast<uint32_t>(sizeof(product_probes) / sizeof(product_probes[0]));
  require(product_walk->telemetry.runtime_walk_count == product_probe_count, "runtime walk telemetry missed product/FX targets");

  control_id = 410u;
  for (const ProductProbe& probe : product_probes) {
    const ModulationRange* range = product_walk->findModulationRange(0u, probe.param_id);
    require(range != nullptr, probe.label);
    require(range->current_value >= probe.min_value && range->current_value <= probe.max_value, probe.label);
    require(std::fabs(range->current_value - probe.current_value) > 0.00001f, probe.label);
    require(std::fabs(productRuntimeFieldValue(*product_walk, probe.param_id) - range->current_value) < 0.0001f, probe.label);
    requireReverbModuleRuntimeFieldValue(*product_walk, probe.param_id, range->current_value, probe.label);
    requireTelemetryContainsRuntimeWalk(product_walk->telemetry, control_id++, probe.min_value, probe.max_value, probe.label);
  }
  kessho_product_destroy(product_walk);

  KesshoProductEngine* source_walk = kessho_product_create(48000.0, 128, 0);
  require(source_walk != nullptr, "runtime walk source engine allocation failed");
  source_walk->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level = 0.25f;
  source_walk->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].expression = 0.3f;
  enqueueRuntimeWalkRange(source_walk, KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 501u, 0.2f, 0.8f, 0.25f);
  enqueueRuntimeWalkRange(source_walk, KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, 502u, 0.15f, 0.9f, 0.3f);
  enqueueRuntimeWalkRange(source_walk, KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, 503u, 0.1f, 0.9f, 0.35f);
  for (uint32_t block = 0; block < 8u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(source_walk, left.data(), right.data(), 128u);
  }
  const ModulationRange* pad_level = source_walk->findModulationRange(KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID);
  const ModulationRange* lead_expression = source_walk->findModulationRange(KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID);
  const ModulationRange* drum_delay = source_walk->findModulationRange(KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID);
  require(pad_level != nullptr && std::fabs(source_walk->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level - pad_level->current_value) < 0.0001f, "Pad source level runtime walk did not apply");
  require(lead_expression != nullptr && std::fabs(source_walk->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].expression - lead_expression->current_value) < 0.0001f, "Lead expression runtime walk did not apply");
  require(drum_delay != nullptr && std::fabs(drum_delay->current_value - 0.35f) > 0.00001f, "Drum delay-send runtime walk did not move");
  require(source_walk->telemetry.runtime_walk_count == 3u, "runtime walk telemetry missed source/drum targets");
  requireTelemetryContainsRuntimeWalk(source_walk->telemetry, 501u, 0.2f, 0.8f, "Pad source runtime walk telemetry missing");
  requireTelemetryContainsRuntimeWalk(source_walk->telemetry, 502u, 0.15f, 0.9f, "Lead source runtime walk telemetry missing");
  requireTelemetryContainsRuntimeWalk(source_walk->telemetry, 503u, 0.1f, 0.9f, "Drum source runtime walk telemetry missing");
  kessho_product_destroy(source_walk);
}

void requireLowRateRuntimeWalkMovementAcrossAudioFxAndSourceTargets() {
  struct ProductProbe {
    uint32_t param_id;
    float min_value;
    float max_value;
    float current_value;
    const char* label;
  };
  const ProductProbe product_probes[] = {
      {KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID, 0.15f, 0.95f, 0.35f, "low-rate master gain runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID, -18.0f, -0.1f, -6.0f, "low-rate master limiter ceiling runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_LEFT_MS_ID, 40.0f, 900.0f, 240.0f, "low-rate Delay A left time runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_ATIME_RIGHT_MS_ID, 40.0f, 900.0f, 180.0f, "low-rate Delay A right time runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID, 0.05f, 0.85f, 0.22f, "low-rate Delay A feedback runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID, 0.05f, 0.85f, 0.25f, "low-rate Delay A mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AFILTER_HZ_ID, 400.0f, 8000.0f, 2400.0f, "low-rate Delay A filter runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_RATE_HZ_ID, 0.05f, 4.5f, 1.2f, "low-rate Delay A mod-rate runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AMOD_DEPTH_MS_ID, 1.0f, 45.0f, 12.0f, "low-rate Delay A mod-depth runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_ADUCK_ID, 0.05f, 0.95f, 0.33f, "low-rate Delay A duck runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_AWIDTH_ID, 0.05f, 0.95f, 0.52f, "low-rate Delay A width runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_ACROSS_FEED_FILTER_HZ_ID, 400.0f, 9000.0f, 2800.0f, "low-rate Delay A cross-feed filter runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BACTIVITY_ID, 0.05f, 0.95f, 0.24f, "low-rate Delay B activity runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BREPEATS_ID, 0.05f, 0.8f, 0.26f, "low-rate Delay B repeats runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BBASE_TIME_MS_ID, 40.0f, 1600.0f, 360.0f, "low-rate Delay B base-time runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BTONE_ID, 0.05f, 0.95f, 0.44f, "low-rate Delay B tone runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BVIBRATO_ID, 0.05f, 0.95f, 0.18f, "low-rate Delay B vibrato runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID, 0.05f, 0.95f, 0.24f, "low-rate Delay B mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BWARP_INTENSITY_ID, 0.05f, 0.95f, 0.38f, "low-rate Delay B warp-intensity runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BSPREAD_ID, 0.05f, 0.95f, 0.42f, "low-rate Delay B spread runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD1_LEVEL_ID, 0.05f, 0.95f, 0.45f, "low-rate Delay B head level runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DELAY_BTAPE_HEAD3_PAN_ID, 0.05f, 0.95f, 0.55f, "low-rate Delay B head pan runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID, 0.05f, 0.95f, 0.26f, "low-rate granular mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID, 0.05f, 0.95f, 0.28f, "low-rate reverb mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID, 0.1f, 0.9f, 0.45f, "low-rate reverb decay runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_SIZE_ID, 0.6f, 9.0f, 3.5f, "low-rate reverb size runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_DAMPING_ID, 0.05f, 0.95f, 0.36f, "low-rate reverb damping runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_DIFFUSION_ID, 0.05f, 0.95f, 0.66f, "low-rate reverb diffusion runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_MODULATION_ID, 0.05f, 0.95f, 0.41f, "low-rate reverb modulation runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_PREDELAY_MS_ID, 1.0f, 90.0f, 28.0f, "low-rate reverb predelay runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_WIDTH_ID, 0.2f, 1.0f, 0.6f, "low-rate reverb width runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_SHIMMER_AMOUNT_ID, 0.05f, 0.95f, 0.24f, "low-rate reverb shimmer runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_SLOW_DEPTH_ID, 0.05f, 0.95f, 0.18f, "low-rate reverb slow-depth runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_CHORUS_DEPTH_ID, 1.0f, 36.0f, 14.0f, "low-rate reverb chorus-depth runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_CROSS_FEED_ID, 0.05f, 0.95f, 0.22f, "low-rate reverb cross-feed runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_THRESHOLD_ID, -48.0f, -3.0f, -24.0f, "low-rate reverb pre-comp threshold runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_REVERB_PRE_COMP_RATIO_ID, 1.2f, 12.0f, 4.0f, "low-rate reverb pre-comp ratio runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_MIX_ID, 0.05f, 0.95f, 0.30f, "low-rate spectral freeze mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_SPEED_ID, 0.05f, 0.95f, 0.31f, "low-rate spectral freeze speed runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_DECAY_ID, 0.05f, 0.95f, 0.32f, "low-rate spectral freeze decay runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SPECTRAL_FREEZE_PHASE_JITTER_ID, 0.05f, 0.95f, 0.21f, "low-rate spectral freeze phase-jitter runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIVE_ID, 0.05f, 0.95f, 0.31f, "low-rate dynamics drive runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_MIX_ID, 0.05f, 0.95f, 0.29f, "low-rate dynamics drift mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_DRIFT_RATE_ID, 0.05f, 0.95f, 0.34f, "low-rate dynamics drift rate runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_MIX_ID, 0.05f, 0.95f, 0.27f, "low-rate dynamics degrade mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_AGE_ID, 0.05f, 0.95f, 0.36f, "low-rate dynamics degrade age runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_DRIVE_ID, 0.05f, 0.95f, 0.32f, "low-rate dynamics saturation drive runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_SATURATION_TONE_ID, 0.05f, 0.95f, 0.43f, "low-rate dynamics saturation tone runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_EROSION_WOBBLE_SPEED_ID, 0.05f, 0.95f, 0.35f, "low-rate dynamics degrade wobble-speed runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_THRESHOLD_ID, -48.0f, -3.0f, -18.0f, "low-rate dynamics end-comp threshold runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_ATTACK_MS_ID, 0.2f, 90.0f, 12.0f, "low-rate dynamics end-comp attack runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_DYNAMICS_END_COMP_MIX_ID, 0.05f, 0.95f, 0.62f, "low-rate dynamics end-comp mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_AMOUNT_ID, 0.05f, 0.95f, 0.34f, "low-rate sidechain amount runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_THRESHOLD_ID, -48.0f, -3.0f, -22.0f, "low-rate sidechain threshold runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_RATIO_ID, 1.2f, 12.0f, 4.5f, "low-rate sidechain ratio runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_SIDECHAIN_PAD1_TARGET_ID, 0.05f, 0.95f, 0.58f, "low-rate sidechain target runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_DELAY_B_ID, 0.05f, 0.95f, 0.37f, "low-rate Delay A to Delay B routing runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_DELAY_A_ID, 0.05f, 0.95f, 0.26f, "low-rate Delay B to Delay A routing runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_DELAY_TO_REVERB_ID, 0.05f, 0.95f, 0.48f, "low-rate Delay to Reverb routing runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_DELAY_ATO_GRANULAR_ID, 0.05f, 0.95f, 0.33f, "low-rate Delay A to Granular routing runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_DELAY_BTO_GRANULAR_ID, 0.05f, 0.95f, 0.35f, "low-rate Delay B to Granular routing runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_GRANULAR_TO_REVERB_ID, 0.05f, 1.5f, 0.4f, "low-rate Granular to Reverb routing runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_ROUTING_DEGRADE_TO_REVERB_ID, 0.05f, 0.95f, 0.41f, "low-rate Degrade to Reverb routing runtime walk did not move"},
      {kProductPadRuntimeParamIdBase + 21u, 250.0f, 3200.0f, 900.0f, "low-rate Pad 1 exact cutoff runtime walk did not move"},
      {kProductPad2RuntimeParamIdBase + 21u, 450.0f, 6200.0f, 1600.0f, "low-rate Pad 2 exact cutoff runtime walk did not move"},
  };

  const uint32_t low_rate_flags = randomWalkSpeedFlags(0.09f);
  constexpr uint32_t kLowRateRenderBlocks = 360u;

  KesshoProductEngine* product_walk = kessho_product_create(48000.0, 128, 0);
  require(product_walk != nullptr, "low-rate runtime walk product engine allocation failed");
  compileDefaultPadEndpoints(product_walk, KESSHO_PRODUCT_SOURCE_PAD1);
  compileDefaultPadEndpoints(product_walk, KESSHO_PRODUCT_SOURCE_PAD2);
  uint32_t control_id = 810u;
  for (const ProductProbe& probe : product_probes) {
    enqueueRuntimeWalkRange(product_walk, 0u, probe.param_id, control_id++, probe.min_value, probe.max_value, probe.current_value, low_rate_flags);
  }
  renderSilentBlocks(product_walk, kLowRateRenderBlocks);
  const uint32_t product_probe_count = static_cast<uint32_t>(sizeof(product_probes) / sizeof(product_probes[0]));
  require(product_walk->telemetry.runtime_walk_count == product_probe_count, "low-rate runtime walk telemetry missed product/FX targets");

  control_id = 810u;
  for (const ProductProbe& probe : product_probes) {
    const ModulationRange* range = product_walk->findModulationRange(0u, probe.param_id);
    require(range != nullptr, probe.label);
    require(range->mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK, probe.label);
    require(!range->random_walk_global, probe.label);
    require(std::fabs(range->random_walk_speed - 0.09f) < 0.001f, probe.label);
    require(range->current_value >= probe.min_value && range->current_value <= probe.max_value, probe.label);
    require(std::fabs(range->current_value - probe.current_value) > 0.00001f, probe.label);
    require(std::fabs(productRuntimeFieldValue(*product_walk, probe.param_id) - range->current_value) < 0.0001f, probe.label);
    requireReverbModuleRuntimeFieldValue(*product_walk, probe.param_id, range->current_value, probe.label);
    requireTelemetryContainsRuntimeWalk(product_walk->telemetry, control_id++, probe.min_value, probe.max_value, probe.label);
  }
  kessho_product_destroy(product_walk);

  struct SourceProbe {
    uint32_t target_id;
    uint32_t param_id;
    float min_value;
    float max_value;
    float current_value;
    const char* label;
  };
  const SourceProbe source_probes[] = {
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.31f, "low-rate Pad 1 source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD2, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.32f, "low-rate Pad 2 source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.33f, "low-rate Lead 1 source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_LEAD2, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.34f, "low-rate Lead 2 source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.35f, "low-rate Drum source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PIANO, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.36f, "low-rate Piano source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_SOUNDSCAPE, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.1f, 0.9f, 0.37f, "low-rate Soundscape source level runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, 0.1f, 0.9f, 0.38f, "low-rate source morph runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, 0.1f, 0.9f, 0.39f, "low-rate source distance runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, 0.1f, 0.9f, 0.40f, "low-rate source expression runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID, 0.1f, 0.9f, 0.41f, "low-rate source reverb-send runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID, 0.1f, 0.9f, 0.42f, "low-rate source Delay A send runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID, 0.1f, 0.9f, 0.43f, "low-rate source Delay B send runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID, 0.1f, 0.9f, 0.44f, "low-rate source granular send runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_DIFFUSE_SEND_ID, 0.1f, 0.9f, 0.45f, "low-rate source diffuse send runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID, 400.0f, 12000.0f, 3200.0f, "low-rate source post-LPF runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID, 0.1f, 0.9f, 0.46f, "low-rate source stereo-width runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID, 0.1f, 0.9f, 0.47f, "low-rate source LPF key-tracking runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID, 0.01f, 1.5f, 0.22f, "low-rate source attack runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID, 0.02f, 3.0f, 0.54f, "low-rate source decay runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID, 0.1f, 0.9f, 0.48f, "low-rate source sustain runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID, 0.05f, 4.0f, 0.9f, "low-rate source hold runtime walk did not move"},
      {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID, 0.02f, 4.0f, 0.7f, "low-rate source release runtime walk did not move"},
  };

  KesshoProductEngine* source_walk = kessho_product_create(48000.0, 128, 0);
  require(source_walk != nullptr, "low-rate runtime walk source engine allocation failed");
  control_id = 910u;
  for (const SourceProbe& probe : source_probes) {
    enqueueRuntimeWalkRange(
        source_walk,
        probe.target_id,
        probe.param_id,
        control_id++,
        probe.min_value,
        probe.max_value,
        probe.current_value,
        low_rate_flags);
  }
  enqueueRuntimeWalkRange(
      source_walk,
      KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE,
      KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID,
      control_id++,
      0.1f,
      0.9f,
      0.38f,
      low_rate_flags);
  renderSilentBlocks(source_walk, kLowRateRenderBlocks);

  const uint32_t source_probe_count = static_cast<uint32_t>(sizeof(source_probes) / sizeof(source_probes[0]));
  require(source_walk->telemetry.runtime_walk_count == source_probe_count + 1u, "low-rate runtime walk telemetry missed source/drum targets");
  control_id = 910u;
  for (const SourceProbe& probe : source_probes) {
    const ModulationRange* range = source_walk->findModulationRange(probe.target_id, probe.param_id);
    require(range != nullptr, probe.label);
    require(std::fabs(range->random_walk_speed - 0.09f) < 0.001f, probe.label);
    require(std::fabs(range->current_value - probe.current_value) > 0.00001f, probe.label);
    require(
        std::fabs(sourceRuntimeFieldValue(source_walk->sources[probe.target_id - 1u], probe.param_id) - range->current_value) < 0.0001f,
        probe.label);
    requireTelemetryContainsRuntimeWalk(source_walk->telemetry, control_id++, probe.min_value, probe.max_value, probe.label);
  }
  const ModulationRange* drum_delay = source_walk->findModulationRange(KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE, KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID);
  require(drum_delay != nullptr, "low-rate Drum voice delay-send runtime walk missing");
  require(std::fabs(drum_delay->random_walk_speed - 0.09f) < 0.001f, "low-rate Drum voice delay-send runtime walk speed mismatch");
  require(std::fabs(drum_delay->current_value - 0.38f) > 0.00001f, "low-rate Drum voice delay-send runtime walk did not move");
  requireTelemetryContainsRuntimeWalk(source_walk->telemetry, control_id++, 0.1f, 0.9f, "low-rate Drum voice runtime walk telemetry missing");
  kessho_product_destroy(source_walk);

  KesshoProductEngine* soundscape_asset_walk = kessho_product_create(48000.0, 128, 0);
  require(soundscape_asset_walk != nullptr, "low-rate soundscape asset runtime walk engine allocation failed");
  SourceState& soundscape_source = soundscape_asset_walk->sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  soundscape_source.enabled = true;
  struct SoundscapeAssetProbe {
    uint32_t asset_id;
    float current_value;
    const char* label;
  };
  const SoundscapeAssetProbe soundscape_asset_probes[] = {
      {kSoundscapeAssetBirds, 0.16f, "low-rate Birds soundscape asset runtime walk"},
      {kSoundscapeAssetBirds2, 0.12f, "low-rate Birds Fujian soundscape asset runtime walk"},
      {kSoundscapeAssetFrogs, 0.10f, "low-rate Frogs soundscape asset runtime walk"},
  };
  const uint32_t soundscape_asset_probe_count = static_cast<uint32_t>(sizeof(soundscape_asset_probes) / sizeof(soundscape_asset_probes[0]));
  soundscape_source.asset_ref_count = soundscape_asset_probe_count;
  for (uint32_t index = 0u; index < soundscape_asset_probe_count; ++index) {
    soundscape_source.asset_refs[index] = soundscape_asset_probes[index].asset_id;
    soundscape_source.asset_ref_levels[index] = soundscape_asset_probes[index].current_value;
    enqueueRuntimeWalkRange(
        soundscape_asset_walk,
        kSoundscapeAssetLevelRangeTargetBase + soundscape_asset_probes[index].asset_id,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
        1020u + index,
        0.0f,
        0.32f,
        soundscape_asset_probes[index].current_value,
        low_rate_flags);
  }
  renderSilentBlocks(soundscape_asset_walk, kLowRateRenderBlocks);
  require(
      soundscape_asset_walk->telemetry.runtime_walk_count == soundscape_asset_probe_count,
      "low-rate soundscape asset runtime walk telemetry missed asset-ref targets");
  for (uint32_t index = 0u; index < soundscape_asset_probe_count; ++index) {
    const SoundscapeAssetProbe& probe = soundscape_asset_probes[index];
    const uint32_t target_id = kSoundscapeAssetLevelRangeTargetBase + probe.asset_id;
    const ModulationRange* asset_level = soundscape_asset_walk->findModulationRange(
        target_id,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID);
    require(asset_level != nullptr, probe.label);
    require(std::fabs(asset_level->current_value - probe.current_value) > 0.00001f, probe.label);
    require(std::fabs(soundscape_source.asset_ref_levels[index] - asset_level->current_value) < 0.0001f,
        probe.label);
    requireTelemetryContainsRuntimeWalk(soundscape_asset_walk->telemetry, 1020u + index, 0.0f, 0.32f, probe.label);
  }
  kessho_product_destroy(soundscape_asset_walk);
}

void requireDrumExactRuntimeRangesApplyToSourceAndModule() {
  constexpr uint32_t kKickDecayParamIndex = 15u;
  const uint32_t kick_decay_param_id = kProductDrumRuntimeParamIdBase + kKickDecayParamIndex;
  const uint32_t kick_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + 1u;
  const uint32_t low_rate_flags = randomWalkSpeedFlags(0.09f);
  constexpr uint32_t kLowRateRenderBlocks = 360u;

  KesshoProductEngine* drum_walk = kessho_product_create(48000.0, 128, 0);
  require(drum_walk != nullptr, "drum exact runtime walk engine allocation failed");
  enqueueRuntimeWalkRange(
      drum_walk,
      kick_target,
      kick_decay_param_id,
      1001u,
      80.0f,
      900.0f,
      300.0f,
      low_rate_flags);
  renderSilentBlocks(drum_walk, kLowRateRenderBlocks);
  const ModulationRange* kick_decay = drum_walk->findModulationRange(kick_target, kick_decay_param_id);
  require(kick_decay != nullptr, "Drum exact kick decay runtime walk range missing");
  require(std::fabs(kick_decay->random_walk_speed - 0.09f) < 0.001f, "Drum exact kick decay runtime walk speed mismatch");
  require(std::fabs(kick_decay->current_value - 300.0f) > 0.00001f, "Drum exact kick decay runtime walk did not move");
  const SourceState& drum_source = drum_walk->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  require(drum_source.drum_override_count == 1u, "Drum runtime walk did not initialize sparse override state");
  require(drum_source.drum_override_indices[0] == kKickDecayParamIndex, "Drum runtime walk stored the wrong sparse override index");
  require(std::fabs(drum_source.drum_override_values[0] - kick_decay->current_value) < 0.001f, "Drum runtime walk did not update sparse override value");
  require(drum_walk->drum_module != nullptr, "drum module missing for exact runtime walk");
  const float* drum_params = drum_walk->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for exact runtime walk");
  require(std::fabs(drum_params[kKickDecayParamIndex] - kick_decay->current_value) < 0.001f, "Drum exact runtime walk did not update module params");
  requireTelemetryContainsRuntimeWalk(drum_walk->telemetry, 1001u, 80.0f, 900.0f, "Drum exact runtime walk telemetry missing");
  kessho_product_destroy(drum_walk);

  KesshoProductEngine* drum_sh = kessho_product_create(48000.0, 128, 0);
  require(drum_sh != nullptr, "drum exact sample-hold engine allocation failed");
  KesshoProductEvent range{};
  range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  range.target_id = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE;
  range.index = 1002u;
  range.param_id = kProductDrumRuntimeParamIdBase;
  range.value = 80.0f;
  range.value2 = 90.0f;
  range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  range.value4 = 85.0f;
  range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
  drum_sh->applyModulationRangeEvent(range);
  require(drum_sh->telemetry.last_error_code == KESSHO_PRODUCT_OK, "Drum exact sample-hold range was rejected");
  drum_sh->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].enabled = true;
  drum_sh->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 36.0f, 1.0f, 0.12f);
  require(drum_sh->drum_module != nullptr, "drum module missing for exact sample-hold");
  drum_params = drum_sh->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for exact sample-hold");
  require(drum_params[0] >= 80.0f && drum_params[0] <= 90.0f, "Drum exact sample-hold did not apply to triggered voice patch");
  kessho_product_destroy(drum_sh);
}

void requireLiveExactDrumParamsSurviveTriggerPatchSelection() {
  constexpr uint32_t kSubLevelParamIndex = 2u;

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "live exact drum patch selection engine allocation failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.level = 1.0f;
  source.expression = 1.0f;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
  appendDrumOverride(source, kSubLevelParamIndex, 0.8f);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "live exact drum patch selection snapshot load failed");
  require(engine->drum_module != nullptr, "drum module missing for live patch selection test");
  const float* drum_params = engine->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for live patch selection test");
  require(std::fabs(drum_params[kSubLevelParamIndex] - 0.8f) < 0.0001f, "exact drum patch did not initialize module params");

  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = kProductDrumRuntimeParamIdBase + kSubLevelParamIndex;
  event.value = 0.0f;
  engine->applyParam(event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "live exact drum param update failed");
  const SourceState& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  require(loaded.drum_override_count == 1u, "live exact drum param update missed source override count");
  require(loaded.drum_override_indices[0] == kSubLevelParamIndex, "live exact drum param update missed source override index");
  require(std::fabs(loaded.drum_override_values[0]) < 0.0001f, "live exact drum param update missed source state");
  require(std::fabs(drum_params[kSubLevelParamIndex]) < 0.0001f, "live exact drum param update missed module params");

  engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].enabled = true;
  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 36.0f, 1.0f, 0.12f);
  require(std::fabs(drum_params[kSubLevelParamIndex]) < 0.0001f, "drum trigger restored stale source preset over live exact params");
  kessho_product_destroy(engine);
}

void requireDrumSequencerMorphBuildsPerHitPresetPatch() {
  constexpr uint32_t kKickVoiceIndex = 1u;
  constexpr uint32_t kKickFreqParamIndex = 12u;
  const auto* preset_a = findDrumVoicePreset(kKickVoiceIndex, 3201u);
  const auto* preset_b = findDrumVoicePreset(kKickVoiceIndex, 3202u);
  const auto* preset_c = findDrumVoicePreset(kKickVoiceIndex, 3203u);
  require(preset_a != nullptr && preset_b != nullptr && preset_c != nullptr, "drum kick morph test presets missing");
  require(
      std::fabs(preset_a->params[kKickFreqParamIndex] - preset_b->params[kKickFreqParamIndex]) > 0.001f,
      "drum kick morph test presets must differ");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum sequencer morph patch engine allocation failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.enabled = 1;
  source.level = 1.0f;
  source.expression = 1.0f;
  source.drum_voice_preset_a_ids[kKickVoiceIndex] = preset_a->id;
  source.drum_voice_preset_b_ids[kKickVoiceIndex] = preset_b->id;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum sequencer morph patch snapshot load failed");
  require(engine->drum_module != nullptr, "drum module missing for sequencer morph patch test");
  const float* drum_params = engine->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for sequencer morph patch test");

  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 37.0f, 1.0f, 0.12f, 0.0f);
  require(
      std::fabs(drum_params[kKickFreqParamIndex] - preset_a->params[kKickFreqParamIndex]) < 0.001f,
      "drum trigger morph endpoint A did not reach per-hit exact patch");
  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 37.0f, 1.0f, 0.12f, 1.0f);
  require(
      std::fabs(drum_params[kKickFreqParamIndex] - preset_b->params[kKickFreqParamIndex]) < 0.001f,
      "drum trigger morph endpoint B did not reach per-hit exact patch");
  KesshoProductEvent preset_b_event{};
  preset_b_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  preset_b_event.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
  preset_b_event.index = 1u + kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT + kKickVoiceIndex;
  preset_b_event.value = static_cast<float>(preset_c->id);
  preset_b_event.value2 = 1.0f;
  preset_b_event.flags = 1u;
  engine->applySourcePresetEvent(preset_b_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "drum preset B endpoint event failed");
  require(
      engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_voice_preset_b_ids[kKickVoiceIndex] == preset_c->id,
      "drum preset B endpoint event missed source state");
  require(
      std::fabs(drum_params[kKickFreqParamIndex] - preset_c->params[kKickFreqParamIndex]) < 0.001f,
      "drum preset B endpoint event did not refresh current exact drum patch");
  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 37.0f, 1.0f, 0.12f, 1.0f);
  require(
      std::fabs(drum_params[kKickFreqParamIndex] - preset_c->params[kKickFreqParamIndex]) < 0.001f,
      "drum preset B endpoint event did not update per-hit morph patch");
  kessho_product_destroy(engine);
}

void requireDrumSequencerMembraneMorphHitsPresetB() {
  constexpr uint32_t kMembraneVoiceIndex = 6u;
  constexpr uint32_t kMembraneParamStart = 92u;
  constexpr uint32_t kMembraneParamCount = 12u;
  const auto* preset_a = findDrumVoicePreset(kMembraneVoiceIndex, 3701u);
  const auto* preset_b = findDrumVoicePreset(kMembraneVoiceIndex, 3716u);
  require(preset_a != nullptr && preset_b != nullptr, "drum membrane morph test presets missing");
  require(std::fabs(preset_a->params[kMembraneParamStart] - 3.0f) < 0.001f, "Snare Classic membrane pitch envelope bridge regressed");
  require(std::fabs(preset_b->params[kMembraneParamStart] - 0.0f) < 0.001f, "Ethereal Skin membrane pitch envelope bridge regressed");
  require(std::fabs(preset_b->params[kMembraneParamStart + 5u] - 100.0f) < 0.001f, "Ethereal Skin membrane size bridge regressed");
  require(
      std::fabs(preset_a->params[kMembraneParamStart] - preset_b->params[kMembraneParamStart]) > 0.001f ||
          std::fabs(preset_a->params[kMembraneParamStart + 1u] - preset_b->params[kMembraneParamStart + 1u]) > 0.001f,
      "drum membrane morph test presets must differ");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum membrane morph engine allocation failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 1;
  snapshot.drum_euclid.lanes[0].enabled = 1;
  snapshot.drum_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
  snapshot.drum_euclid.lanes[0].step_count = 4;
  snapshot.drum_euclid.lanes[0].fill_count = 4;
  snapshot.drum_euclid.lanes[0].clock_division = 16;
  snapshot.drum_euclid.lanes[0].manual_step_mask_low = 0x0fu;
  snapshot.drum_euclid.lanes[0].midi_note = 42.0f;
  snapshot.drum_euclid.lanes[0].morph = 0.0f;
  snapshot.drum_euclid.lanes[0].seed = 4242u;

  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.enabled = 1;
  source.level = 1.0f;
  source.expression = 1.0f;
  source.drum_voice_preset_a_ids[kMembraneVoiceIndex] = preset_a->id;
  source.drum_voice_preset_b_ids[kMembraneVoiceIndex] = preset_b->id;
  source.drum_voice_morphs[kMembraneVoiceIndex] = 0.1f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum membrane morph snapshot load failed");
  require(engine->drum_module != nullptr, "drum module missing for membrane morph test");

  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_DRUM,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_MORPH >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      4.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 0u, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.0f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 1u, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.0f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 2u, KESSHO_PRODUCT_STEP_FIELD_MORPH, 1.0f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 3u, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.0f);

  KesshoSequencerEvent events[8]{};
  const int32_t event_count = kessho_product_debug_render_events(engine, events, 8, 48000);
  require(event_count >= 4, "drum membrane morph sub-lane should emit four hits");
  require(std::fabs(events[2].midi_note - 42.0f) < 0.001f, "drum membrane morph test emitted wrong voice");
  require(events[2].morph >= 0.999f, "drum membrane morph sub-lane step 3 should emit preset B morph");

  engine->triggerSequencerEvent(events[2]);
  const float* drum_params = engine->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for membrane morph test");
  for (uint32_t offset = 0; offset < kMembraneParamCount; ++offset) {
    const uint32_t param_index = kMembraneParamStart + offset;
    require(
        std::fabs(drum_params[param_index] - preset_b->params[param_index]) < 0.001f,
        "drum membrane sequencer morph did not install preset B exact params");
  }
  kessho_product_destroy(engine);
}

void requireDrumSequencerMembranePresetBChangeUpdatesRunningMorph() {
  constexpr uint32_t kMembraneVoiceIndex = 6u;
  constexpr uint32_t kMembraneParamStart = 92u;
  constexpr uint32_t kMembraneParamCount = 12u;
  const auto* preset_a = findDrumVoicePreset(kMembraneVoiceIndex, 3701u);
  const auto* old_preset_b = findDrumVoicePreset(kMembraneVoiceIndex, 3714u);
  const auto* new_preset_b = findDrumVoicePreset(kMembraneVoiceIndex, 3716u);
  require(preset_a != nullptr && old_preset_b != nullptr && new_preset_b != nullptr, "drum membrane live preset B change test presets missing");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum membrane live preset B change engine allocation failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.enabled = 1;
  source.level = 1.0f;
  source.expression = 1.0f;
  source.drum_voice_preset_a_ids[kMembraneVoiceIndex] = preset_a->id;
  source.drum_voice_preset_b_ids[kMembraneVoiceIndex] = old_preset_b->id;
  source.drum_voice_morphs[kMembraneVoiceIndex] = 0.15f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum membrane live preset B snapshot load failed");
  require(engine->drum_module != nullptr, "drum module missing for live membrane preset B test");

  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 42.0f, 1.0f, 0.12f, 1.0f);
  const float* drum_params = engine->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for live membrane preset B test");
  for (uint32_t offset = 0; offset < kMembraneParamCount; ++offset) {
    const uint32_t param_index = kMembraneParamStart + offset;
    require(
        std::fabs(drum_params[param_index] - old_preset_b->params[param_index]) < 0.001f,
        "drum membrane live preset B test did not start from old preset B");
  }

  KesshoProductEvent preset_b_event{};
  preset_b_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  preset_b_event.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
  preset_b_event.index = 1u + kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT + kMembraneVoiceIndex;
  preset_b_event.value = static_cast<float>(new_preset_b->id);
  preset_b_event.value2 = 0.15f;
  preset_b_event.flags = 1u;
  engine->applySourcePresetEvent(preset_b_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "drum membrane live preset B endpoint event failed");

  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 42.0f, 1.0f, 0.12f, 1.0f);
  for (uint32_t offset = 0; offset < kMembraneParamCount; ++offset) {
    const uint32_t param_index = kMembraneParamStart + offset;
    require(
        std::fabs(drum_params[param_index] - new_preset_b->params[param_index]) < 0.001f,
        "drum membrane live preset B endpoint change did not update the running morph step");
  }

  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_DRUM, 42.0f, 1.0f, 0.12f, 0.0f);
  for (uint32_t offset = 0; offset < kMembraneParamCount; ++offset) {
    const uint32_t param_index = kMembraneParamStart + offset;
    require(
        std::fabs(drum_params[param_index] - preset_a->params[param_index]) < 0.001f,
        "drum membrane live preset B endpoint change broke preset A morph steps");
  }
  kessho_product_destroy(engine);
}

void requireLowRateGranularRuntimeWalkMovementAcrossEngineParams() {
  struct ProductProbe {
    uint32_t param_id;
    float min_value;
    float max_value;
    float current_value;
    const char* label;
  };
  const ProductProbe global_probes[] = {
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID, 0.05f, 0.95f, 0.26f, "granular mix runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID, 0.0f, 0.85f, 0.2f, "granular feedback runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_LPF_HZ_ID, 2000.0f, 10000.0f, 6500.0f, "granular feedback LPF runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_REVERB_LPF_HZ_ID, 600.0f, 9000.0f, 4000.0f, "granular reverb LPF runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_OUTPUT_LPF_HZ_ID, 800.0f, 12000.0f, 8000.0f, "granular output LPF runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUFFER_SECONDS_ID, 4.0f, 16.0f, 10.0f, "granular buffer seconds runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_BUS_DIFFUSION_ID, 0.0f, 1.0f, 0.25f, "granular diffusion runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_TIMING_RANDOMNESS_ID, 0.0f, 0.95f, 0.3f, "granular timing randomness runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_CHORD_BIAS_ID, 0.0f, 1.0f, 0.35f, "granular chord bias runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_JITTER_MS_ID, 0.0f, 30.0f, 8.0f, "granular legacy jitter runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PROBABILITY_ID, 0.0f, 1.0f, 0.7f, "granular legacy probability runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_PITCH_SPREAD_ID, 0.0f, 12.0f, 3.0f, "granular legacy pitch spread runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID, 16.0f, 112.0f, 64.0f, "granular legacy max grains runtime walk did not move"},
      {KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_FEEDBACK_ID, 0.0f, 0.35f, 0.12f, "granular legacy feedback runtime walk did not move"},
  };
  struct VoiceProbe {
    uint32_t offset;
    float min_value;
    float max_value;
    float current_value;
  };
  const VoiceProbe voice_probes[] = {
      {3u, 0.0f, 4.0f, 1.0f},
      {4u, 0.25f, 4.0f, 1.2f},
      {6u, -24.0f, 24.0f, 0.0f},
      {7u, 0.0f, 1.0f, 0.2f},
      {8u, 1.0f, 64.0f, 20.0f},
      {9u, 10.0f, 500.0f, 80.0f},
      {10u, 0.0f, 1.0f, 0.3f},
      {11u, 0.0f, 1.0f, 0.1f},
      {12u, 0.001f, 0.5f, 0.05f},
      {13u, 0.01f, 4.0f, 0.5f},
      {14u, 0.0f, 1.0f, 0.4f},
      {15u, -1.0f, 1.0f, 0.0f},
      {16u, 0.0f, 1.0f, 0.2f},
      {17u, 0.0f, 1.0f, 0.5f},
      {18u, 0.0f, 1.0f, 0.1f},
      {19u, 0.0f, 1.0f, 0.2f},
      {20u, 0.0f, 1.0f, 0.12f},
      {21u, 0.0f, 1.0f, 0.05f},
      {22u, 0.0f, 1.0f, 0.08f},
  };
  const uint32_t voice_bases[kGranularVoiceCount] = {
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V1_ENABLED_ID,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V2_ENABLED_ID,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V3_ENABLED_ID,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_V4_ENABLED_ID,
  };

  const uint32_t low_rate_flags = randomWalkSpeedFlags(0.09f);
  constexpr uint32_t kLowRateRenderBlocks = 360u;
  KesshoProductEngine* granular_walk = kessho_product_create(48000.0, 128, 0);
  require(granular_walk != nullptr, "low-rate granular runtime walk engine allocation failed");
  granular_walk->fx.granular_enabled = true;

  uint32_t control_id = 1100u;
  for (const ProductProbe& probe : global_probes) {
    enqueueRuntimeWalkRange(
        granular_walk,
        0u,
        probe.param_id,
        control_id++,
        probe.min_value,
        probe.max_value,
        probe.current_value,
        low_rate_flags);
  }
  for (uint32_t voice_index = 0u; voice_index < kGranularVoiceCount; ++voice_index) {
    granular_walk->fx.granular_voices[voice_index].enabled = true;
    for (const VoiceProbe& probe : voice_probes) {
      enqueueRuntimeWalkRange(
          granular_walk,
          0u,
          voice_bases[voice_index] + probe.offset,
          control_id++,
          probe.min_value,
          probe.max_value,
          probe.current_value,
          low_rate_flags);
    }
  }

  renderSilentBlocks(granular_walk, kLowRateRenderBlocks);
  const uint32_t global_probe_count = static_cast<uint32_t>(sizeof(global_probes) / sizeof(global_probes[0]));
  const uint32_t voice_probe_count = static_cast<uint32_t>(sizeof(voice_probes) / sizeof(voice_probes[0]));
  const uint32_t total_probe_count = global_probe_count + kGranularVoiceCount * voice_probe_count;
  require(granular_walk->telemetry.runtime_walk_count == total_probe_count, "low-rate granular runtime walk telemetry missed targets");

  control_id = 1100u;
  for (const ProductProbe& probe : global_probes) {
    const ModulationRange* range = granular_walk->findModulationRange(0u, probe.param_id);
    require(range != nullptr, probe.label);
    require(range->mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK, probe.label);
    require(!range->random_walk_global, probe.label);
    require(std::fabs(range->random_walk_speed - 0.09f) < 0.001f, probe.label);
    require(range->current_value >= probe.min_value && range->current_value <= probe.max_value, probe.label);
    require(std::fabs(range->current_value - probe.current_value) > 0.00001f, probe.label);
    const float expected = probe.param_id == KESSHO_PRODUCT_PARAM_FX_GRANULAR_LEGACY_MAX_GRAINS_ID
        ? static_cast<float>(std::lround(range->current_value))
        : range->current_value;
    require(std::fabs(productRuntimeFieldValue(*granular_walk, probe.param_id) - expected) < 0.001f, probe.label);
    requireGranularModuleRuntimeFieldValue(*granular_walk, probe.param_id, expected, probe.label);
    requireTelemetryContainsRuntimeWalk(granular_walk->telemetry, control_id++, probe.min_value, probe.max_value, probe.label);
  }
  for (uint32_t voice_index = 0u; voice_index < kGranularVoiceCount; ++voice_index) {
    for (const VoiceProbe& probe : voice_probes) {
      const uint32_t param_id = voice_bases[voice_index] + probe.offset;
      const ModulationRange* range = granular_walk->findModulationRange(0u, param_id);
      require(range != nullptr, "low-rate granular voice runtime walk range missing");
      require(range->mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK, "low-rate granular voice runtime walk mode mismatch");
      require(!range->random_walk_global, "low-rate granular voice runtime walk unexpectedly global");
      require(std::fabs(range->random_walk_speed - 0.09f) < 0.001f, "low-rate granular voice runtime walk speed mismatch");
      require(range->current_value >= probe.min_value && range->current_value <= probe.max_value, "low-rate granular voice runtime walk out of range");
      require(std::fabs(range->current_value - probe.current_value) > 0.00001f, "low-rate granular voice runtime walk did not move");
      require(std::fabs(productRuntimeFieldValue(*granular_walk, param_id) - range->current_value) < 0.001f, "low-rate granular voice runtime walk did not apply");
      requireGranularModuleRuntimeFieldValue(*granular_walk, param_id, range->current_value, "low-rate granular voice runtime walk did not reach module");
      requireTelemetryContainsRuntimeWalk(
          granular_walk->telemetry,
          control_id++,
          probe.min_value,
          probe.max_value,
          "low-rate granular voice runtime walk telemetry missing");
    }
  }
  kessho_product_destroy(granular_walk);
}

void requireDirectSequencerCoverage() {
  require(kessho::product::internal::euclidHit(3u, 16u, 4u, 0) == true, "direct Product Euclidean 16/4 should match web Bjorklund phase");
  require(kessho::product::internal::euclidHit(0u, 16u, 4u, 0) == false, "direct Product Euclidean 16/4 should not use bucket phase");
  require(kessho::product::internal::euclidHit(1u, 8u, 3u, 0) == true, "direct Product Euclidean 8/3 should match web Bjorklund phase");

  KesshoProductEngine direct(48000.0, 128, 0);
  direct.transport.running = true;
  direct.transport.bpm = 120.0f;
  direct.transport.beats_per_bar = 4u;
  direct.transport.bars_per_phrase = 4u;
  direct.synth_lane_count = 1u;
  direct.drum_lane_count = 0u;

  LaneState& lane = direct.synth_lanes[0];
  lane.enabled = true;
  lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  lane.step_count = 16u;
  lane.fill_count = 4u;
  lane.rotation = 0;
  lane.clock_division = 16u;
  lane.probability = 1.0f;
  lane.ratchet = 1u;
  lane.midi_note = 60.0f;
  lane.velocity = 0.8f;
  lane.hold_seconds = 0.1f;
  lane.expression = 0.7f;
  lane.seed = 99u;

  SequencerBuffer direct_events{};
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 96000u, direct_events);
  require(direct_events.count == 4u, "direct sequencer generator should produce one bar of hits");
  expectOffsets(direct_events.events, direct_events.count, {18000, 42000, 66000, 90000});

  direct.transport.swing = 0.5f;
  direct.resetSequencerLaneRuntime(lane);
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 96000u, direct_events);
  require(direct_events.count == 4u, "transport swing should not alter Product Euclidean lane event count");
  expectOffsets(direct_events.events, direct_events.count, {18000, 42000, 66000, 90000});
  direct.transport.swing = 0.0f;
  lane.swing = 0.5f;
  direct.resetSequencerLaneRuntime(lane);
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 96000u, direct_events);
  require(direct_events.count == 4u, "lane swing should preserve Product Euclidean lane event count");
  expectOffsets(direct_events.events, direct_events.count, {19500, 43500, 67500, 91500});
  lane.swing = 0.0f;

  direct.drum_lane_count = 1u;
  LaneState& drum_lane = direct.drum_lanes[0];
  drum_lane.enabled = true;
  drum_lane.target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
  drum_lane.step_count = 16u;
  drum_lane.fill_count = 4u;
  drum_lane.rotation = 0;
  drum_lane.clock_division = 16u;
  drum_lane.swing = 0.5f;
  drum_lane.probability = 1.0f;
  drum_lane.ratchet = 1u;
  drum_lane.midi_note = 36.0f;
  drum_lane.velocity = 1.0f;
  drum_lane.seed = 123u;
  direct.resetSequencerLaneRuntime(drum_lane);
  direct_events.clear();
  direct.generateLaneEvents(direct.drum_lanes, direct.drum_lane_count, 96000u, direct_events);
  require(direct_events.count == 4u, "drum lane swing should preserve Product Euclidean lane event count");
  expectOffsets(direct_events.events, direct_events.count, {19500, 43500, 67500, 91500});
  drum_lane.swing = 0.0f;

  direct.transport.sample_frame = 24000u;
  lane.fill_count = 0u;
  lane.manual_step_mask_low = 1u;
  lane.manual_step_mask_high = 0u;
  lane.bar_reset = true;
  direct.resetSequencerLaneRuntime(lane);
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 96000u, direct_events);
  require(direct_events.count == 1u, "bar-join sequencer should wait for the next bar before step zero");
  require(direct_events.events[0].sample_offset == 72000u, "bar-join sequencer event should land on the next bar boundary");

  direct.transport.sample_frame = 25000u;
  lane.bar_reset = false;
  lane.initial_start_delay_seconds = -1.0f;
  direct.resetSequencerLaneRuntime(lane);
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 12000u, direct_events);
  require(direct_events.count == 1u, "beat-join sequencer should wait only for the next lane step grid");
  require(direct_events.events[0].sample_offset == 5000u, "beat-join sequencer event should land on the next lane grid");

  direct.transport.sample_frame = 24000u;
  lane.bar_reset = true;
  lane.initial_start_delay_seconds = 0.125f;
  direct.resetSequencerLaneRuntime(lane);
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 24000u, direct_events);
  require(direct_events.count == 1u, "initial start delay should override native bar alignment for global-clock joins");
  require(direct_events.events[0].sample_offset == 6000u, "initial start delay should schedule from the current block start");
  lane.initial_start_delay_seconds = -1.0f;

  direct.transport.sample_frame = 0u;
  direct.resetSequencerLaneRuntime(lane);
  lane.bar_reset = true;
  lane.manual_step_mask_low = 0u;
  lane.manual_step_mask_high = 0u;
  lane.step_count = 8u;
  lane.fill_count = 0u;
  lane.clock_division = 8u;
  lane.manual_step_mask_low = (1u << 1u) | (1u << 4u);
  lane.manual_step_mask_high = 0u;
  lane.step_value_configs[5].enabled = true;
  lane.step_value_configs[5].steps = 2u;
  lane.step_value_configs[5].direction = KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD;
  direct.setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0u, 0.25f, 0.0f);
  direct.setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 1u, 0.75f, 0.0f);
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 60000u, direct_events);
  require(direct_events.count == 2u, "manual masked sequencer should produce two hit-clocked sub-lane events");
  require(std::fabs(direct_events.events[0].expression - 0.25f) < 0.001f, "first sub-lane event should use hit index zero");
  require(std::fabs(direct_events.events[1].expression - 0.75f) < 0.001f, "second sub-lane event should use hit index one");

  direct.clearLaneStepOverrides(lane);
  lane.seed = 4000u;
  lane.step_count = 64u;
  lane.fill_count = 1u;
  lane.clock_division = 16u;
  lane.midi_note = 73.0f;
  lane.manual_step_mask_low = 1u << 7u;
  lane.manual_step_mask_high = 0u;
  direct_events.clear();
  direct.generateLaneEvents(direct.synth_lanes, direct.synth_lane_count, 48000u, direct_events);
  require(direct_events.count == 1u, "arrangement lane manual mask should generate one quantized random-timing event");
  require(direct_events.events[0].sample_offset == 42000u, "arrangement lane event should use sixteenth-grid timing");
  require(std::fabs(direct_events.events[0].midi_note - 73.0f) < 0.001f, "arrangement lane should keep generated web MIDI instead of re-harmonizing");
  lane.manual_step_mask_low = 0u;
  lane.seed = 99u;
  lane.step_count = 16u;
  lane.fill_count = 4u;
  lane.clock_division = 16u;
  lane.midi_note = 60.0f;

  KesshoProductEvent lane_event{};
  lane_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE;
  lane_event.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  lane_event.index = 0u;
  lane_event.param_id = KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID;
  lane_event.value = 8.0f;
  direct.applySequencerLaneParamEvent(lane_event);
  require(direct.synth_lanes[0].step_count == 8u, "direct lane param event should update sequencer state");

  direct.clearLaneStepOverrides(direct.synth_lanes[0]);
  direct.setStepFieldOverride(
      direct.synth_lanes[0],
      KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
      0u,
      0.42f,
      0.0f);
  require(
      direct.stepFloatValue(
          0u,
          direct.synth_lanes[0].expression_override_set_low,
          direct.synth_lanes[0].expression_override_set_high,
          direct.synth_lanes[0].expression_overrides,
          0.7f) >= 0.419f,
      "direct step override should be readable without public C API indirection");
}

void requireControlEventEnqueueOrdering() {
  KesshoProductEngine direct(48000.0, 128, 0);
  KesshoProductEvent late{};
  late.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT;
  late.sample_offset = 96u;
  late.value = 100.0f;
  KesshoProductEvent early_a = late;
  early_a.sample_offset = 32u;
  early_a.value = 110.0f;
  KesshoProductEvent early_b = early_a;
  early_b.value = 120.0f;

  require(direct.enqueueEvent(late) == KESSHO_PRODUCT_OK, "late control event enqueue failed");
  require(direct.enqueueEvent(early_a) == KESSHO_PRODUCT_OK, "first early control event enqueue failed");
  require(direct.enqueueEvent(early_b) == KESSHO_PRODUCT_OK, "second early control event enqueue failed");
  require(direct.control_event_count == 3u, "sorted control queue should retain all events");
  require(direct.control_events[0].event.sample_offset == 32u, "control queue should insert earlier offsets first");
  require(direct.control_events[1].event.sample_offset == 32u, "control queue should keep same-offset events adjacent");
  require(direct.control_events[2].event.sample_offset == 96u, "control queue should keep later offsets last");
  require(direct.control_events[0].event.value == 110.0f, "same-offset control events should preserve enqueue order");
  require(direct.control_events[1].event.value == 120.0f, "same-offset control event FIFO order should be stable");
}

} // namespace

int main() {
  requireProductSequencerRatchetCrossBlockTest();
  requireProductSequencerRatchetNearBlockEndTest();
  requireProductSequencerRatchetPendingClearTests();
  requireDirectSequencerCoverage();
  requireControlEventEnqueueOrdering();
  requireRuntimeWalkMovementAcrossAudioAndFxTargets();
  requireLowRateRuntimeWalkMovementAcrossAudioFxAndSourceTargets();
  requireDrumExactRuntimeRangesApplyToSourceAndModule();
  requireLiveExactDrumParamsSurviveTriggerPatchSelection();
  requireDrumSequencerMorphBuildsPerHitPresetPatch();
  requireDrumSequencerMembraneMorphHitsPresetB();
  requireDrumSequencerMembranePresetBChangeUpdatesRunningMorph();
  requireLowRateGranularRuntimeWalkMovementAcrossEngineParams();

  constexpr double sample_rate = 48000.0;
  KesshoProductEngine* engine = kessho_product_create(sample_rate, 4096, 0);
  require(engine != nullptr, "product engine create failed");
  require(kessho_product_get_abi_version() == KESSHO_PRODUCT_ABI_VERSION, "ABI version mismatch");

  KesshoProductCapabilityReport capability = kessho_product_get_capability_report();
  require(capability.schema_hash == KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH, "capability schema hash mismatch");
  require(capability.supports_synth_sequencer == 1, "synth sequencer capability missing");
  require(capability.supports_drum_sequencer == 1, "drum sequencer capability missing");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "valid product snapshot should load");

  KesshoSequencerEvent events[32]{};
  int32_t event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 8, "4-in-16 synth plus drum lanes should generate 8 events in one bar");
  expectOffsets(events, static_cast<uint32_t>(event_count), {18000, 42000, 66000, 90000});
  require(events[0].source_id == KESSHO_PRODUCT_SOURCE_PAD1, "synth event source mismatch");
  require(events[1].source_id == KESSHO_PRODUCT_SOURCE_DRUM, "drum event source mismatch");
  KesshoProductTelemetry loop_telemetry = kessho_product_get_telemetry(engine);
  require(loop_telemetry.transport_running == 1, "transport should remain running after first sequencer pass");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lanes[0].fill_count = 1;
  snapshot.synth_euclid.lanes[0].manual_step_mask_low = 1u;
  snapshot.drum_euclid.lanes[0].fill_count = 1;
  snapshot.drum_euclid.lanes[0].manual_step_mask_low = 1u;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "sequencer visual telemetry snapshot should load");
  event_count = kessho_product_debug_render_events(engine, events, 32, 128);
  require(event_count == 2, "step-zero synth and drum events should render in first telemetry block");
  loop_telemetry = kessho_product_get_telemetry(engine);
  require(loop_telemetry.synth_sequencer_current_steps[0] == 0u, "synth visual telemetry should report current step zero");
  require(loop_telemetry.synth_sequencer_hit_counts[0] == 1u, "synth visual telemetry should include the current hit");
  require(loop_telemetry.drum_sequencer_current_steps[0] == 0u, "drum visual telemetry should report current step zero");
  require(loop_telemetry.drum_sequencer_hit_counts[0] == 1u, "drum visual telemetry should include the current hit");
  event_count = kessho_product_debug_render_events(engine, events, 32, 6000);
  loop_telemetry = kessho_product_get_telemetry(engine);
  require(loop_telemetry.synth_sequencer_current_steps[0] == 1u, "synth visual telemetry should advance past step zero");
  require(loop_telemetry.drum_sequencer_current_steps[0] == 1u, "drum visual telemetry should advance past step zero");
  require(loop_telemetry.synth_sequencer_hit_counts[0] == 1u, "synth visual telemetry hit phase should persist after a silent step");
  require(loop_telemetry.drum_sequencer_hit_counts[0] == 1u, "drum visual telemetry hit phase should persist after a silent step");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_PAD2;
  snapshot.synth_euclid.lanes[0].seed =
      kPadVoiceSeedFlag |
      (4u << kPadVoiceSeedShift) |
      4321u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "pad voice-target snapshot should load");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count >= 1, "pad voice-target lane should emit events");
  require(events[0].source_id == KESSHO_PRODUCT_SOURCE_PAD2, "pad voice-target lane should keep pad2 source");
  require(
      padVoiceIndexFromSequencerEventFlags(events[0].flags) == 3u,
      "pad voice-target lane should carry exact synth voice index into event flags");
  engine->pad_voice_cursors[1] = 0u;
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD2,
      60.0f,
      1.0f,
      0.1f,
      -1.0f,
      -1.0f,
      -1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      3u);
  require(engine->pad_voice_cursors[1] == 0u, "exact pad voice trigger should not consume pad2 round-robin cursor");
  engine->triggerVoice(KESSHO_PRODUCT_SOURCE_PAD2, 60.0f, 1.0f, 0.1f);
  require(engine->pad_voice_cursors[1] == 1u, "non-targeted pad trigger should keep round-robin behavior");
  engine->pad_voice_cursors[1] = 0u;
  KesshoProductEvent targeted_pad_note{};
  targeted_pad_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  targeted_pad_note.target_id = KESSHO_PRODUCT_SOURCE_PAD2;
  targeted_pad_note.value = 60.0f;
  targeted_pad_note.value2 = 1.0f;
  targeted_pad_note.value3 = 0.1f;
  targeted_pad_note.flags = sequencerPadVoiceEventFlags(3u);
  require(kessho_product_enqueue_event(engine, &targeted_pad_note) == KESSHO_PRODUCT_OK, "targeted pad note enqueue failed");
  std::vector<float> pad_left(128, 0.0f);
  std::vector<float> pad_right(128, 0.0f);
  kessho_product_render(engine, pad_left.data(), pad_right.data(), 128);
  require(engine->pad_voice_cursors[1] == 0u, "targeted pad note event should not consume pad2 round-robin cursor");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "64-step loop product snapshot should load");
  KesshoSequencerEvent loop_events[64]{};
  event_count = kessho_product_debug_render_events(engine, loop_events, 64, 384000);
  require(event_count == 32, "16-step synth plus drum pattern should loop for 64 steps");
  expectOffsets(loop_events, static_cast<uint32_t>(event_count), {18000, 42000, 66000, 90000, 114000, 138000, 162000, 186000});
  loop_telemetry = kessho_product_get_telemetry(engine);
  require(loop_telemetry.transport_running == 1, "transport should keep running through a 64-step sequencer render");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].fill_count = 1;
  snapshot.synth_euclid.lanes[0].manual_step_mask_low = 1u;
  snapshot.synth_euclid.lanes[0].initial_start_delay_seconds = 0.125f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "initial start delay product snapshot should load");
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 1, "initial start delay snapshot should emit one delayed step-zero event");
  require(events[0].sample_offset == 6000u, "initial start delay snapshot should apply global-clock first-start phase");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].clock_division = 8;
  snapshot.synth_euclid.lanes[0].tempo_multiplier = 2.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "synth tempo multiplier product snapshot should load");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "synth tempo multiplier should scale Product Core sequencer timing");
  expectOffsets(events, static_cast<uint32_t>(event_count), {18000, 42000, 66000, 90000});

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "transport running param snapshot load failed");
  enqueueParam(engine, KESSHO_PRODUCT_EVENT_KIND_SET_PARAM, 0, 0, KESSHO_PRODUCT_PARAM_TRANSPORT_RUNNING_ID, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 0, "TransportRunning SetParam should stop C++ sequencer event generation");
  enqueueParam(engine, KESSHO_PRODUCT_EVENT_KIND_SET_PARAM, 0, 0, KESSHO_PRODUCT_PARAM_TRANSPORT_RUNNING_ID, 1.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "TransportRunning SetParam should restart C++ sequencer event generation");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sequencer lane event snapshot load failed");
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID,
      0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 0, "SetSequencerLane enabled=false should mute the C++ lane");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sequencer lane param snapshot load failed");
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID,
      8.0f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID,
      8.0f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID,
      8.0f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TEMPO_MULTIPLIER_ID,
      2.0f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID,
      static_cast<float>(KESSHO_PRODUCT_SOURCE_LEAD1));
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID,
      72.0f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID,
      0.5f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID,
      0.25f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MORPH_ID,
      0.35f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_DISTANCE_ID,
      0.45f);
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_EXPRESSION_ID,
      0.55f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 16, "SetSequencerLane should update step count, fill, clock division, and tempo multiplier");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 6000, 12000, 18000, 24000, 30000, 36000, 42000});
  require(events[0].source_id == KESSHO_PRODUCT_SOURCE_LEAD1, "SetSequencerLane target source did not affect events");
  require(std::fabs(events[0].midi_note - 72.0f) < 0.001f, "SetSequencerLane MIDI note did not affect events");
  require(events[0].velocity >= 0.49f && events[0].velocity <= 0.51f, "SetSequencerLane velocity did not affect events");
  require(events[0].hold_seconds >= 0.249f && events[0].hold_seconds <= 0.251f, "SetSequencerLane hold did not affect events");
  require(events[0].morph < 0.0f, "inactive morph sub-lane should leave source morph in control");
  require(events[0].distance < 0.0f, "inactive distance sub-lane should leave source distance in control");
  require(events[0].expression < 0.0f, "inactive expression sub-lane should leave source expression in control");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_MORPH >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      1.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_DISTANCE >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      1.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_EXPRESSION >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      1.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 16, "active morph/distance/expression sub-lanes should preserve sequencer timing");
  require(events[0].morph >= 0.349f && events[0].morph <= 0.351f, "SetSequencerLane morph did not affect events");
  require(events[0].distance >= 0.449f && events[0].distance <= 0.451f, "SetSequencerLane distance did not affect events");
  require(events[0].expression >= 0.549f && events[0].expression <= 0.551f, "SetSequencerLane expression did not affect events");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sequencer lane SetParam snapshot load failed");
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0,
      KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID,
      0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 0, "SetParam sequencer lane probability should update the C++ lane");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "step toggle snapshot load failed");
  KesshoProductEvent clear_steps{};
  clear_steps.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  clear_steps.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  clear_steps.index = 0;
  clear_steps.flags = KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_LANE;
  require(kessho_product_enqueue_event(engine, &clear_steps) == KESSHO_PRODUCT_OK, "sequencer clear-step enqueue failed");
  KesshoProductEvent add_step{};
  add_step.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  add_step.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  add_step.index = 0;
  add_step.param_id = 1;
  add_step.value = 1.0f;
  add_step.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &add_step) == KESSHO_PRODUCT_OK, "sequencer add-step enqueue failed");
  KesshoProductEvent mute_step{};
  mute_step.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  mute_step.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  mute_step.index = 0;
  mute_step.param_id = 3;
  mute_step.value = 0.0f;
  mute_step.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &mute_step) == KESSHO_PRODUCT_OK, "sequencer mute-step enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "step toggle overrides should add and mute C++ sequencer hits");
  expectOffsets(events, static_cast<uint32_t>(event_count), {6000, 42000, 66000, 90000});
  require(!hasOffset(events, static_cast<uint32_t>(event_count), 18000), "muted step override should suppress the base Euclid hit");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "dice snapshot load failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "home synth lane should generate one bar of base Euclid hits");
  expectOffsets(events, static_cast<uint32_t>(event_count), {18000, 42000, 66000, 90000});
  KesshoProductTelemetry dice_seed_telemetry = kessho_product_get_telemetry(engine);
  require(dice_seed_telemetry.rng_seed == 1234u, "telemetry should expose snapshot RNG seed");
  require(dice_seed_telemetry.rng_state == 1234u, "telemetry should expose snapshot RNG state");
  KesshoProductEvent dice_lane{};
  dice_lane.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  dice_lane.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  dice_lane.index = 0;
  dice_lane.value = 1.0f;
  dice_lane.value2 = 4242.0f;
  require(kessho_product_enqueue_event(engine, &dice_lane) == KESSHO_PRODUCT_OK, "sequencer dice enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 384000);
  require(event_count > 0, "sequencer dice should keep C++ event generation active");
  bool saw_diced_offset = false;
  bool saw_diced_expression = false;
  bool saw_diced_pitch = false;
  for (int32_t i = 0; i < event_count; ++i) {
    saw_diced_offset = saw_diced_offset || ((events[i].sample_offset % 24000u) != 0u);
    saw_diced_expression = saw_diced_expression || (std::fabs(events[i].expression - 0.8f) > 0.05f);
    saw_diced_pitch = saw_diced_pitch || (std::fabs(events[i].midi_note - 60.0f) > 0.001f);
  }
  require(
      saw_diced_offset || saw_diced_expression || saw_diced_pitch,
      "sequencer dice should alter the C++ lane's generated event pattern or expression");
  dice_seed_telemetry = kessho_product_get_telemetry(engine);
  require(dice_seed_telemetry.rng_seed == 1234u, "dice should preserve C++ RNG seed");
  require(dice_seed_telemetry.rng_state != 1234u, "dice should advance C++ RNG state for later snapshot persistence");
  KesshoProductSequencerUiState sequencer_ui_state{};
  require(
      kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
      "sequencer UI state copy failed after dice");
  require(
      sequencer_ui_state.revision == dice_seed_telemetry.sequencer_ui_state_revision,
      "telemetry revision should match copied sequencer UI state revision");
  require(
      sequencer_ui_state.last_changed_target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH &&
          sequencer_ui_state.last_changed_lane_index == 0u &&
          sequencer_ui_state.last_change_kind == KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_DICE,
      "sequencer UI state should classify the latest dice mutation");
  require(
      (sequencer_ui_state.synth_lanes[0].mutation_flags & KESSHO_PRODUCT_SEQUENCER_UI_MUTATION_HAS_OVERRIDES) != 0u,
      "sequencer UI state should expose diced lane override state");
  require(
      sequencer_ui_state.synth_lanes[0].midi_note_override_set_low != 0u ||
          sequencer_ui_state.synth_lanes[0].expression_override_set_low != 0u ||
          sequencer_ui_state.synth_lanes[0].probability_override_set_low != 0u,
      "sequencer UI state should expose detailed diced override masks");
  require(
      std::fabs(sequencer_ui_state.synth_lanes[0].expression_overrides[0] -
          engine->synth_lanes[0].expression_overrides[0]) < 0.000001f,
      "sequencer UI state should expose detailed diced override values");
  const LaneState diced_lane_state = engine->synth_lanes[0];
  require(laneHasGeneratedOverrides(diced_lane_state), "sequencer dice should leave Core-owned lane override state");
  KesshoProductSnapshotV2 preserved_reload_snapshot = makeSnapshot();
  preserved_reload_snapshot.drum_euclid.lane_count = 0;
  preserved_reload_snapshot.rng.seed = dice_seed_telemetry.rng_seed;
  preserved_reload_snapshot.rng.state = dice_seed_telemetry.rng_state;
  require(
      kessho_product_load_snapshot_v2(engine, &preserved_reload_snapshot, sizeof(preserved_reload_snapshot)) ==
          KESSHO_PRODUCT_OK,
      "full snapshot reload with reconciled RNG state should load");
  require(
      kessho_product_get_telemetry(engine).rng_state == dice_seed_telemetry.rng_state,
      "full snapshot reload must preserve reconciled Core-owned RNG state");
  replaySequencerUiLane(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      sequencer_ui_state.synth_lanes[0]);
  event_count = kessho_product_debug_render_events(engine, events, 32, 384000);
  require(event_count > 0, "reconciled UI replay should restore diced event generation after full reload");
  requireLaneMutationStateEqual(
      engine->synth_lanes[0],
      diced_lane_state,
      "full snapshot reload plus reconciled UI replay must preserve Core-owned dice state");
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      KESSHO_PRODUCT_SOURCE_PAD1,
      0,
      KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
      0.42f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 384000);
  require(event_count > 0, "unrelated source-level diff should keep diced sequencer active");
  requireLaneMutationStateEqual(
      engine->synth_lanes[0],
      diced_lane_state,
      "unrelated source-level diff must preserve Core-owned dice state");
  KesshoProductEvent reset_lane_home{};
  reset_lane_home.event_kind = KESSHO_PRODUCT_EVENT_KIND_RESET_SEQUENCER_LANE_HOME;
  reset_lane_home.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  reset_lane_home.index = 0;
  require(kessho_product_enqueue_event(engine, &reset_lane_home) == KESSHO_PRODUCT_OK, "sequencer reset-home enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "sequencer reset-home should restore base event count");
  expectOffsets(events, static_cast<uint32_t>(event_count), {18000, 42000, 66000, 90000});
  const LaneState reset_home_lane_state = engine->synth_lanes[0];
  require(reset_home_lane_state.midi_note_override_set_low == 0u && reset_home_lane_state.midi_note_override_set_high == 0u, "sequencer reset-home should clear pitch dice overrides");
  require(!laneHasGeneratedOverrides(reset_home_lane_state), "reset-home should clear Core-owned lane override state");
  const uint32_t reset_revision = kessho_product_get_telemetry(engine).sequencer_ui_state_revision;
  require(
      kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
      "sequencer UI state copy failed after reset-home");
  require(sequencer_ui_state.revision == reset_revision, "reset-home UI state revision mismatch");
  require(
      sequencer_ui_state.last_changed_target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH &&
          sequencer_ui_state.last_changed_lane_index == 0u &&
          sequencer_ui_state.last_change_kind == KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME,
      "sequencer UI state should classify the latest reset-home mutation");
  require(
      (sequencer_ui_state.synth_lanes[0].mutation_flags & KESSHO_PRODUCT_SEQUENCER_UI_MUTATION_HAS_OVERRIDES) == 0u,
      "sequencer UI state should expose reset-home override clearing");
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      KESSHO_PRODUCT_SOURCE_PAD1,
      0,
      KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
      0.58f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "unrelated source-level diff should preserve reset-home event count");
  requireLaneMutationStateEqual(
      engine->synth_lanes[0],
      reset_home_lane_state,
      "unrelated source-level diff must preserve reset-home lane state");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "method-filtered dice snapshot load failed");
  KesshoProductEvent pitch_only_dice{};
  pitch_only_dice.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  pitch_only_dice.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  pitch_only_dice.index = 0;
  pitch_only_dice.value = 1.0f;
  pitch_only_dice.value2 = 5151.0f;
  pitch_only_dice.flags = KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE;
  require(kessho_product_enqueue_event(engine, &pitch_only_dice) == KESSHO_PRODUCT_OK, "method-filtered dice enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "method-filtered pitch dice should preserve trigger event count");
  const LaneState pitch_only_lane_state = engine->synth_lanes[0];
  require(pitch_only_lane_state.midi_note_override_set_low != 0u, "method-filtered pitch dice should set MIDI overrides");
  require(pitch_only_lane_state.step_override_set_low == 0u && pitch_only_lane_state.step_override_set_high == 0u, "method-filtered pitch dice should not alter trigger overrides");
  require(pitch_only_lane_state.probability_override_set_low == 0u && pitch_only_lane_state.probability_override_set_high == 0u, "method-filtered pitch dice should not alter probability overrides");
  require(pitch_only_lane_state.ratchet_override_set_low == 0u && pitch_only_lane_state.ratchet_override_set_high == 0u, "method-filtered pitch dice should not alter ratchet overrides");
  require(pitch_only_lane_state.expression_override_set_low == 0u && pitch_only_lane_state.expression_override_set_high == 0u, "method-filtered pitch dice should not alter expression overrides");
  require(pitch_only_lane_state.morph_override_set_low == 0u && pitch_only_lane_state.morph_override_set_high == 0u, "method-filtered pitch dice should not alter morph overrides");
  require(pitch_only_lane_state.distance_override_set_low == 0u && pitch_only_lane_state.distance_override_set_high == 0u, "method-filtered pitch dice should not alter distance overrides");

  bool native_synth_notes_pitch_walk_used_scale = false;
  for (uint32_t attempt = 0u; attempt < 96u && !native_synth_notes_pitch_walk_used_scale; ++attempt) {
    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.drum_euclid.lane_count = 0;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native synth notes pitch evolve snapshot load failed");
    LaneState& notes_lane = engine->synth_lanes[0];
    notes_lane.step_count = 1u;
    notes_lane.fill_count = 1u;
    notes_lane.midi_note = 60.0f;
    notes_lane.pitch_mode = kSequencerPitchModeNotes;
    notes_lane.pitch_root = 60.0f;
    notes_lane.pitch_scale_id = kSequencerPitchScaleMajor;
    engine->clearLaneStepOverrides(notes_lane);
    engine->setStepFieldOverride(notes_lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 0u, 62.0f, 0.0f);
    KesshoProductEvent notes_pitch_walk{};
    notes_pitch_walk.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
    notes_pitch_walk.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    notes_pitch_walk.index = 0u;
    notes_pitch_walk.value = 0.6f;
    notes_pitch_walk.value2 = static_cast<float>(5300u + attempt);
    notes_pitch_walk.flags =
        KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
        KESSHO_PRODUCT_EVOLVE_METHOD_PITCH_WALK |
        KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE;
    engine->applyParityEvolveSequencerLaneEvent(notes_pitch_walk);
    if (notes_lane.midi_note_override_set_low != 0u && std::fabs(notes_lane.midi_note_overrides[0] - 62.0f) > 0.001f) {
      native_synth_notes_pitch_walk_used_scale =
          std::fabs(notes_lane.midi_note_overrides[0] - 60.0f) < 0.001f ||
          std::fabs(notes_lane.midi_note_overrides[0] - 64.0f) < 0.001f;
      require(native_synth_notes_pitch_walk_used_scale, "native synth notes pitch walk must move by scale degrees instead of chromatic semitones");
    }
  }
  require(native_synth_notes_pitch_walk_used_scale, "native synth notes pitch walk should mutate scale-degree pitch within bounded attempts");

  bool native_drum_notes_pitch_walk_used_scale = false;
  for (uint32_t attempt = 0u; attempt < 96u && !native_drum_notes_pitch_walk_used_scale; ++attempt) {
    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.synth_euclid.lane_count = 0;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native drum notes pitch evolve snapshot load failed");
    LaneState& notes_drum_lane = engine->drum_lanes[0];
    notes_drum_lane.step_count = 1u;
    notes_drum_lane.fill_count = 1u;
    notes_drum_lane.midi_note = 36.0f;
    notes_drum_lane.pitch_mode = kSequencerPitchModeNotes;
    notes_drum_lane.pitch_scale_id = kSequencerPitchScaleMajor;
    engine->clearLaneStepOverrides(notes_drum_lane);
    engine->setStepFieldOverride(notes_drum_lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 0u, 38.0f, 0.0f);
    KesshoProductEvent drum_notes_pitch_walk{};
    drum_notes_pitch_walk.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
    drum_notes_pitch_walk.target_id = KESSHO_PRODUCT_SEQUENCER_DRUM;
    drum_notes_pitch_walk.index = 0u;
    drum_notes_pitch_walk.value = 0.6f;
    drum_notes_pitch_walk.value2 = static_cast<float>(5400u + attempt);
    drum_notes_pitch_walk.flags =
        KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
        KESSHO_PRODUCT_EVOLVE_METHOD_PITCH_WALK |
        KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE;
    engine->applyParityEvolveSequencerLaneEvent(drum_notes_pitch_walk);
    if (notes_drum_lane.midi_note_override_set_low != 0u && std::fabs(notes_drum_lane.midi_note_overrides[0] - 38.0f) > 0.001f) {
      native_drum_notes_pitch_walk_used_scale =
          std::fabs(notes_drum_lane.midi_note_overrides[0] - 36.0f) < 0.001f ||
          std::fabs(notes_drum_lane.midi_note_overrides[0] - 40.0f) < 0.001f;
      require(native_drum_notes_pitch_walk_used_scale, "native drum notes pitch walk must move by scale degrees instead of chromatic semitones");
    }
  }
  require(native_drum_notes_pitch_walk_used_scale, "native drum notes pitch walk should mutate scale-degree pitch within bounded attempts");

  bool native_synth_note_range_pitch_walk_changed = false;
  for (uint32_t attempt = 0u; attempt < 96u && !native_synth_note_range_pitch_walk_changed; ++attempt) {
    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.drum_euclid.lane_count = 0;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native synth noteRange pitch evolve snapshot load failed");
    LaneState& note_range_lane = engine->synth_lanes[0];
    note_range_lane.step_count = 1u;
    note_range_lane.fill_count = 1u;
    note_range_lane.midi_note = 70.0f;
    note_range_lane.pitch_mode = kSequencerPitchModeNoteRange;
    note_range_lane.note_range_min = 64.0f;
    note_range_lane.note_range_max = 76.0f;
    engine->clearSequencerEvolveHome(note_range_lane);
    engine->captureSequencerEvolveHome(note_range_lane);
    note_range_lane.note_range_min = 90.0f;
    note_range_lane.note_range_max = 96.0f;
    note_range_lane.midi_note = 93.0f;
    KesshoProductEvent note_range_pitch_walk{};
    note_range_pitch_walk.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
    note_range_pitch_walk.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    note_range_pitch_walk.index = 0u;
    note_range_pitch_walk.value = 1.0f;
    note_range_pitch_walk.value2 = static_cast<float>(5500u + attempt);
    note_range_pitch_walk.flags =
        KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
        KESSHO_PRODUCT_EVOLVE_METHOD_PITCH_WALK |
        KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE;
    engine->applyParityEvolveSequencerLaneEvent(note_range_pitch_walk);
    native_synth_note_range_pitch_walk_changed =
        std::fabs(note_range_lane.note_range_min - 90.0f) > 0.001f ||
        std::fabs(note_range_lane.note_range_max - 96.0f) > 0.001f;
    if (native_synth_note_range_pitch_walk_changed) {
      const float midpoint = (note_range_lane.note_range_min + note_range_lane.note_range_max) * 0.5f;
      const float home_midpoint = (note_range_lane.evolve_home.note_range_min + note_range_lane.evolve_home.note_range_max) * 0.5f;
      require(note_range_lane.note_range_min >= 36.0f, "native synth noteRange evolve must clamp low bound");
      require(note_range_lane.note_range_max <= 96.0f, "native synth noteRange evolve must clamp high bound");
      require(note_range_lane.note_range_max - note_range_lane.note_range_min >= 2.0f, "native synth noteRange evolve must preserve minimum range gap");
      require(std::fabs(midpoint - home_midpoint) <= 12.0f, "native synth noteRange evolve must keep midpoint anchored near home");
      require(std::fabs(note_range_lane.midi_note - midpoint) < 0.001f, "native synth noteRange evolve must update lane MIDI midpoint");
      require(note_range_lane.midi_note_override_set_low == 0u, "native synth noteRange evolve must not write MIDI step overrides");
      require(
          kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
          "native synth noteRange UI state copy failed");
      const KesshoProductSequencerLaneUiState& ui_note_range_lane = sequencer_ui_state.synth_lanes[0];
      require(
          std::fabs(ui_note_range_lane.note_range_min - note_range_lane.note_range_min) < 0.001f &&
              std::fabs(ui_note_range_lane.note_range_max - note_range_lane.note_range_max) < 0.001f,
          "native synth noteRange evolve must expose evolved bounds through sequencer UI state");
    }
  }
  require(native_synth_note_range_pitch_walk_changed, "native synth noteRange pitch walk should mutate bounds within bounded attempts");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.harmony.tension = 0.3f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native parity evolve snapshot load failed");
  KesshoProductEvent native_synth_evolve{};
  native_synth_evolve.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  native_synth_evolve.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  native_synth_evolve.index = 0;
  native_synth_evolve.value = 1.0f;
  native_synth_evolve.value2 = 6161.0f;
  native_synth_evolve.value3 = 3.0f;
  native_synth_evolve.value4 = 3.0f;
  native_synth_evolve.flags =
      KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
      KESSHO_PRODUCT_EVOLVE_METHOD_VALUE_DRIFT |
      KESSHO_PRODUCT_DICE_FIELD_EXPRESSION;
  require(kessho_product_enqueue_event(engine, &native_synth_evolve) == KESSHO_PRODUCT_OK, "native parity synth evolve enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "native parity synth value evolve should preserve trigger event count");
  require(engine->synth_lanes[0].evolve_home.captured, "native parity synth evolve should capture Core-owned home state");
  require(
      engine->synth_lanes[0].expression_override_set_low == (1u << 3u) &&
          engine->synth_lanes[0].expression_override_set_high == 0u,
      "native parity synth value evolve should honor write-offset masking");
  require(
      kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
      "native parity synth UI state copy failed");
  require(
      sequencer_ui_state.last_changed_target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH &&
          sequencer_ui_state.last_changed_lane_index == 0u &&
          sequencer_ui_state.last_change_kind == KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_DICE,
      "native parity synth evolve should publish a Core-owned dice UI revision");
  reset_lane_home = {};
  reset_lane_home.event_kind = KESSHO_PRODUCT_EVENT_KIND_RESET_SEQUENCER_LANE_HOME;
  reset_lane_home.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  reset_lane_home.index = 0;
  require(kessho_product_enqueue_event(engine, &reset_lane_home) == KESSHO_PRODUCT_OK, "native parity reset-home enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(!engine->synth_lanes[0].evolve_home.captured, "reset-home should clear native parity evolve home state");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native manual-commit snapshot load failed");
  KesshoProductEvent manual_commit_synth_evolve{};
  manual_commit_synth_evolve.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  manual_commit_synth_evolve.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  manual_commit_synth_evolve.index = 0;
  manual_commit_synth_evolve.value = 1.0f;
  manual_commit_synth_evolve.value2 = 7171.0f;
  manual_commit_synth_evolve.value3 = 3.0f;
  manual_commit_synth_evolve.value4 = 1.0f;
  manual_commit_synth_evolve.flags =
      KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
      KESSHO_PRODUCT_EVOLVE_MANUAL_COMMIT |
      KESSHO_PRODUCT_DICE_FIELD_EXPRESSION |
      KESSHO_PRODUCT_DICE_FIELD_MORPH |
      KESSHO_PRODUCT_DICE_FIELD_DISTANCE;
  require(kessho_product_enqueue_event(engine, &manual_commit_synth_evolve) == KESSHO_PRODUCT_OK, "native manual-commit synth evolve enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(
      maskHas(engine->synth_lanes[0].expression_override_set_low, engine->synth_lanes[0].expression_override_set_high, 3u) &&
          maskHas(engine->synth_lanes[0].morph_override_set_low, engine->synth_lanes[0].morph_override_set_high, 3u) &&
          maskHas(engine->synth_lanes[0].distance_override_set_low, engine->synth_lanes[0].distance_override_set_high, 3u),
      "native manual-commit synth dice must mutate every requested value sub-lane");

  KesshoProductEvent strict_synth_evolve{};
  strict_synth_evolve.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  strict_synth_evolve.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  strict_synth_evolve.index = 0;
  strict_synth_evolve.value = 1.0f;
  strict_synth_evolve.value3 = 0.0f;
  strict_synth_evolve.value4 = 1.0f;
  strict_synth_evolve.flags =
      KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
      KESSHO_PRODUCT_EVOLVE_MUTATION_STRICT |
      KESSHO_PRODUCT_EVOLVE_METHOD_VALUE_DRIFT |
      KESSHO_PRODUCT_DICE_FIELD_EXPRESSION;
  bool strict_sampled_beyond_biased_drift = false;
  for (uint32_t attempt = 0u; attempt < 48u && !strict_sampled_beyond_biased_drift; ++attempt) {
    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.drum_euclid.lane_count = 0;
    snapshot.harmony.tension = 0.3f;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native strict evolve snapshot load failed");
    strict_synth_evolve.value2 = static_cast<float>(8100u + attempt);
    engine->applyParityEvolveSequencerLaneEvent(strict_synth_evolve);
    for (uint32_t step = 0u; step < 16u; ++step) {
      if (maskHas(engine->synth_lanes[0].expression_override_set_low, engine->synth_lanes[0].expression_override_set_high, step)) {
        const float value = engine->synth_lanes[0].expression_overrides[step];
        if (value < 0.719f || value > 0.881f) {
          strict_sampled_beyond_biased_drift = true;
          break;
        }
      }
    }
  }
  require(
      strict_sampled_beyond_biased_drift,
      "native parity strict value drift should preserve web-ts random-resample semantics");

  KesshoProductEvent tension_synth_evolve{};
  tension_synth_evolve.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  tension_synth_evolve.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  tension_synth_evolve.index = 0;
  tension_synth_evolve.value = 1.0f;
  tension_synth_evolve.value3 = 0.0f;
  tension_synth_evolve.value4 = 1.0f;
  tension_synth_evolve.flags =
      KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
      KESSHO_PRODUCT_EVOLVE_METHOD_VALUE_DRIFT |
      KESSHO_PRODUCT_DICE_FIELD_EXPRESSION;
  bool encoded_tension_overrode_fallback = false;
  for (uint32_t attempt = 0u; attempt < 128u && !encoded_tension_overrode_fallback; ++attempt) {
    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.drum_euclid.lane_count = 0;
    snapshot.harmony.tension = 1.0f;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native tension fallback snapshot load failed");
    tension_synth_evolve.param_id = 0u;
    tension_synth_evolve.value2 = static_cast<float>(9100u + attempt);
    engine->applyParityEvolveSequencerLaneEvent(tension_synth_evolve);
    const bool fallback_mutated =
        engine->synth_lanes[0].expression_override_set_low != 0u ||
        engine->synth_lanes[0].expression_override_set_high != 0u;

    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.drum_euclid.lane_count = 0;
    snapshot.harmony.tension = 1.0f;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native encoded tension snapshot load failed");
    tension_synth_evolve.param_id = 1u + (KESSHO_PRODUCT_EVOLVE_TENSION_PARAM_SCALE * 3u) / 10u;
    engine->applyParityEvolveSequencerLaneEvent(tension_synth_evolve);
    const bool encoded_mutated =
        engine->synth_lanes[0].expression_override_set_low != 0u ||
        engine->synth_lanes[0].expression_override_set_high != 0u;
    encoded_tension_overrode_fallback = !fallback_mutated && encoded_mutated;
  }
  require(
      encoded_tension_overrode_fallback,
      "native parity evolve should use event-encoded effective tension before Product harmony fallback");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.harmony.tension = 0.3f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native RNG-stream evolve snapshot load failed");
  engine->synth_lanes[0].swing = 0.25f;
  KesshoProductEvent stream_rng_swing{};
  stream_rng_swing.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  stream_rng_swing.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  stream_rng_swing.index = 0;
  stream_rng_swing.param_id = 123456789u;
  stream_rng_swing.value = 1.0f;
  stream_rng_swing.value2 = 0.0f;
  stream_rng_swing.value3 = 0.0f;
  stream_rng_swing.value4 = 1.0f;
  stream_rng_swing.flags =
      KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
      KESSHO_PRODUCT_EVOLVE_RNG_STREAM |
      KESSHO_PRODUCT_EVOLVE_METHOD_SWING_DRIFT;
  engine->applyParityEvolveSequencerLaneEvent(stream_rng_swing);
  require(
      std::fabs(engine->synth_lanes[0].swing - 0.27824633f) < 0.000001f,
      "native parity evolve should consume the web-ts mulberry32 stream for first swing drift");
  engine->applyParityEvolveSequencerLaneEvent(stream_rng_swing);
  require(
      std::fabs(engine->synth_lanes[0].swing - 0.29497035f) < 0.000001f,
      "native parity evolve should preserve the web-ts RNG stream between native evolve events");
  require(
      kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
      "native parity swing evolve UI state copy failed");
  require(
      std::fabs(sequencer_ui_state.synth_lanes[0].swing - engine->synth_lanes[0].swing) < 0.000001f,
      "native parity swing evolve should expose lane swing through sequencer UI state");
  require(
      std::fabs(sequencer_ui_state.synth_lanes[0].midi_note - engine->synth_lanes[0].midi_note) < 0.000001f,
      "sequencer UI state should expose the Product-owned base MIDI note for host pitch parity");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "native parity drum evolve snapshot load failed");
  KesshoProductEvent native_drum_evolve{};
  native_drum_evolve.event_kind = KESSHO_PRODUCT_EVENT_KIND_DICE_SEQUENCER_LANE;
  native_drum_evolve.target_id = KESSHO_PRODUCT_SEQUENCER_DRUM;
  native_drum_evolve.index = 0;
  native_drum_evolve.value = 1.0f;
  native_drum_evolve.flags =
      KESSHO_PRODUCT_EVOLVE_MODE_PARITY |
      KESSHO_PRODUCT_EVOLVE_METHOD_ROTATE_DRIFT |
      KESSHO_PRODUCT_EVOLVE_METHOD_HIT_DRIFT |
      KESSHO_PRODUCT_DICE_FIELD_TRIGGER;
  const uint32_t start_hits = engine->drum_lanes[0].fill_count;
  const int32_t start_rotation = engine->drum_lanes[0].rotation;
  bool drum_native_changed = false;
  for (uint32_t attempt = 0u; attempt < 48u && !drum_native_changed; ++attempt) {
    native_drum_evolve.value2 = static_cast<float>(7000u + attempt);
    engine->applyParityEvolveSequencerLaneEvent(native_drum_evolve);
    drum_native_changed =
        engine->drum_lanes[0].fill_count != start_hits ||
        engine->drum_lanes[0].rotation != start_rotation;
  }
  require(drum_native_changed, "native parity drum evolve should own rotate/hit mutations in Product Core");
  require(engine->drum_lanes[0].evolve_home.captured, "native parity drum evolve should capture Core-owned home state");

  KesshoProductEvent evolution_amount{};
  evolution_amount.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  evolution_amount.param_id = KESSHO_PRODUCT_PARAM_EVOLUTION_AMOUNT_ID;
  evolution_amount.value = 0.75f;
  require(kessho_product_enqueue_event(engine, &evolution_amount) == KESSHO_PRODUCT_OK, "evolution amount enqueue failed");
  KesshoProductEvent evolution_state{};
  evolution_state.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  evolution_state.param_id = KESSHO_PRODUCT_PARAM_EVOLUTION_STATE_ID;
  evolution_state.value = 9876.0f;
  require(kessho_product_enqueue_event(engine, &evolution_state) == KESSHO_PRODUCT_OK, "evolution state enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "evolution update should preserve base event count");
  require(std::fabs(engine->evolution_amount - 0.75f) < 0.000001f, "evolution amount event did not persist");
  require(engine->evolution_state == 9876u, "evolution state event did not persist");
  require(
      kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
      "sequencer UI state copy failed after evolution");
  require(
      std::fabs(sequencer_ui_state.evolution_amount - 0.75f) < 0.000001f &&
          sequencer_ui_state.evolution_state == 9876u,
      "sequencer UI state should expose Core-owned evolution state");
  require(
      sequencer_ui_state.last_change_kind == KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_EVOLUTION,
      "sequencer UI state should classify the latest evolution mutation");
  KesshoProductTelemetry evolved_telemetry = kessho_product_get_telemetry(engine);
  preserved_reload_snapshot = makeSnapshot();
  preserved_reload_snapshot.drum_euclid.lane_count = 0;
  preserved_reload_snapshot.rng.seed = evolved_telemetry.rng_seed;
  preserved_reload_snapshot.rng.state = evolved_telemetry.rng_state;
  preserved_reload_snapshot.evolution.amount = sequencer_ui_state.evolution_amount;
  preserved_reload_snapshot.evolution.state = sequencer_ui_state.evolution_state;
  require(
      kessho_product_load_snapshot_v2(engine, &preserved_reload_snapshot, sizeof(preserved_reload_snapshot)) ==
          KESSHO_PRODUCT_OK,
      "full snapshot reload with reconciled evolution state should load");
  require(
      std::fabs(engine->evolution_amount - 0.75f) < 0.000001f && engine->evolution_state == 9876u,
      "full snapshot reload must preserve reconciled Core-owned evolution state");
  enqueueParam(
      engine,
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      KESSHO_PRODUCT_SOURCE_PAD1,
      0,
      KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
      0.61f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "unrelated source-level diff should keep evolved sequencer active");
  require(std::fabs(engine->evolution_amount - 0.75f) < 0.000001f, "unrelated source diff overwrote evolution amount");
  require(engine->evolution_state == 9876u, "unrelated source diff overwrote evolution state");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "step value snapshot load failed");
  auto enqueue_step_value = [&](uint32_t step, uint32_t field, float value, float value2 = 0.0f, uint32_t extra_flags = 0u) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
    event.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    event.index = 0;
    event.param_id = step;
    event.value = value;
    event.value2 = value2;
    event.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | field | extra_flags;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "sequencer step-value enqueue failed");
  };
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 72.0f);
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.4f);
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.6f);
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, 0.7f);
  enqueue_step_value(7, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 2.0f);
  enqueue_step_value(11, KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION, 2.0f, 2.0f);
  enqueue_step_value(15, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 3, "step value overrides should affect probability, ratchet, and trig conditions");
  expectOffsets(events, static_cast<uint32_t>(event_count), {18000, 42000, 45000});
  require(!hasOffset(events, static_cast<uint32_t>(event_count), 66000), "step trig condition should suppress first-bar 2:2 hit");
  require(!hasOffset(events, static_cast<uint32_t>(event_count), 90000), "step probability should suppress probability-zero hit");
  require(std::fabs(events[0].midi_note - 72.0f) < 0.001f, "step MIDI override did not affect event pitch");
  require(events[0].expression >= 0.39f && events[0].expression <= 0.41f, "step expression override did not affect event expression");
  require(events[0].morph >= 0.59f && events[0].morph <= 0.61f, "step morph override did not affect event morph");
  require(events[0].distance >= 0.69f && events[0].distance <= 0.71f, "step distance override did not affect event distance");

  auto setup_pitch_binding_fixture = [&]() {
    kessho_product_reset(engine);
    snapshot = makeSnapshot();
    snapshot.drum_euclid.lane_count = 0;
    snapshot.synth_euclid.lanes[0].step_count = 4;
    snapshot.synth_euclid.lanes[0].fill_count = 2;
    snapshot.synth_euclid.lanes[0].manual_step_mask_low = (1u << 0u) | (1u << 2u);
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "pitch binding snapshot load failed");
    enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE >> KESSHO_PRODUCT_STEP_FIELD_SHIFT, KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG, 1.0f, 4.0f, static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
    enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 0u, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 60.0f);
    enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 1u, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 61.0f);
    enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 2u, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 72.0f);
    enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 3u, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 73.0f);
  };
  setup_pitch_binding_fixture();
  event_count = kessho_product_debug_render_events(engine, events, 16, 24000);
  require(event_count >= 2, "pitch binding fixture should emit two events");
  require(std::fabs(events[0].midi_note - 60.0f) < 0.001f, "hit-bound pitch should start at first sub-lane note");
  require(std::fabs(events[1].midi_note - 61.0f) < 0.001f, "hit-bound pitch should advance by emitted hit count");
  setup_pitch_binding_fixture();
  KesshoProductEvent pitch_binding_mode{};
  pitch_binding_mode.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE;
  pitch_binding_mode.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  pitch_binding_mode.index = 0;
  pitch_binding_mode.param_id = KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_BINDING_MODE_ID;
  pitch_binding_mode.value = 1.0f;
  require(kessho_product_enqueue_event(engine, &pitch_binding_mode) == KESSHO_PRODUCT_OK, "pitch binding mode enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 16, 24000);
  require(event_count >= 2, "sequence-bound pitch fixture should emit two events");
  require(std::fabs(events[0].midi_note - 60.0f) < 0.001f, "sequence-bound pitch should read trigger step zero");
  require(std::fabs(events[1].midi_note - 72.0f) < 0.001f, "sequence-bound pitch should read trigger step phase instead of emitted hit phase");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].step_count = 4;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "synth emitted-hit sub-lane snapshot load failed");
  KesshoProductEvent emitted_hit_pitch_binding_mode{};
  emitted_hit_pitch_binding_mode.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE;
  emitted_hit_pitch_binding_mode.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  emitted_hit_pitch_binding_mode.index = 0;
  emitted_hit_pitch_binding_mode.param_id = KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_BINDING_MODE_ID;
  emitted_hit_pitch_binding_mode.value = 0.0f;
  require(kessho_product_enqueue_event(engine, &emitted_hit_pitch_binding_mode) == KESSHO_PRODUCT_OK, "emitted-hit pitch binding mode enqueue failed");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      4.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_EXPRESSION >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      4.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 60.0f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 61.0f);
  enqueue_step_value(2, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 62.0f);
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 63.0f);
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.1f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.2f);
  enqueue_step_value(2, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.3f);
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.4f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 18001);
  require(event_count == 3, "synth probability-zero step should suppress one emitted hit");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 12000, 18000});
  require(std::fabs(events[0].midi_note - 60.0f) < 0.001f, "synth emitted hit 0 should use pitch index 0");
  require(std::fabs(events[1].midi_note - 61.0f) < 0.001f, "synth emitted hit 1 should skip suppressed hit and use pitch index 1");
  require(std::fabs(events[2].midi_note - 62.0f) < 0.001f, "synth emitted hit 2 should use pitch index 2");
  require(events[0].expression >= 0.09f && events[0].expression <= 0.11f, "synth emitted hit 0 should use expression index 0");
  require(events[1].expression >= 0.19f && events[1].expression <= 0.21f, "synth emitted hit 1 should skip suppressed hit and use expression index 1");
  require(events[2].expression >= 0.29f && events[2].expression <= 0.31f, "synth emitted hit 2 should use expression index 2");
  KesshoProductTelemetry synth_emitted_hit_telemetry = kessho_product_get_telemetry(engine);
  require(synth_emitted_hit_telemetry.synth_sequencer_hit_counts[0] == 3u, "synth telemetry should expose emitted-hit sub-lane phase for visuals");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].step_count = 4;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "synth ratchet sub-lane snapshot load failed");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_RATCHET >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      2.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 1.0f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 3.0f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 5, "synth ratchet sub-lane should index by emitted trigger phase");
  uint32_t synth_step_two_events = 0u;
  for (int32_t i = 0; i < event_count; ++i) {
    if (events[i].step_id == 2u) {
      ++synth_step_two_events;
    }
  }
  require(synth_step_two_events == 3u, "synth ratchet sub-lane should skip suppressed trigger phases");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].step_count = 5;
  snapshot.synth_euclid.lanes[0].fill_count = 5;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "synth morph/distance sub-lane snapshot load failed");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_MORPH >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      3.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG));
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_DISTANCE >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      3.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_REVERSE));
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.1f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.2f);
  enqueue_step_value(2, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.3f);
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, 0.4f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, 0.5f);
  enqueue_step_value(2, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, 0.6f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24001);
  require(event_count == 5, "synth morph/distance sub-lanes should preserve trigger event count");
  require(events[0].morph >= 0.09f && events[0].morph <= 0.11f, "synth morph pingpong step 0 should use index 0");
  require(events[1].morph >= 0.19f && events[1].morph <= 0.21f, "synth morph pingpong step 1 should use index 1");
  require(events[2].morph >= 0.29f && events[2].morph <= 0.31f, "synth morph pingpong step 2 should use index 2");
  require(events[3].morph >= 0.19f && events[3].morph <= 0.21f, "synth morph pingpong step 3 should fold to index 1");
  require(events[4].morph >= 0.09f && events[4].morph <= 0.11f, "synth morph pingpong step 4 should fold to index 0");
  require(events[0].distance >= 0.59f && events[0].distance <= 0.61f, "synth distance reverse step 0 should use index 2");
  require(events[1].distance >= 0.49f && events[1].distance <= 0.51f, "synth distance reverse step 1 should use index 1");
  require(events[2].distance >= 0.39f && events[2].distance <= 0.41f, "synth distance reverse step 2 should use index 0");
  require(events[3].distance >= 0.59f && events[3].distance <= 0.61f, "synth distance reverse step 3 should wrap to index 2");
  require(events[4].distance >= 0.49f && events[4].distance <= 0.51f, "synth distance reverse step 4 should wrap to index 1");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lanes[0].step_count = 8;
  snapshot.drum_euclid.lanes[0].fill_count = 8;
  snapshot.drum_euclid.lanes[0].midi_note = 37.0f;
  snapshot.drum_euclid.lanes[0].seed =
      kDrumVoiceMaskSeedFlag |
      (((1u << 1u) | (1u << 2u)) << kDrumVoiceMaskSeedShift) |
      5151u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum voice-mask snapshot load failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 16, "multi-target drum lane should pick one voice per hit instead of layering voices");
  bool saw_kick_voice = false;
  bool saw_click_voice = false;
  for (int32_t i = 0; i < event_count; ++i) {
    saw_kick_voice = saw_kick_voice || std::fabs(events[i].midi_note - 37.0f) < 0.001f;
    saw_click_voice = saw_click_voice || std::fabs(events[i].midi_note - 38.0f) < 0.001f;
    require(
        std::fabs(events[i].midi_note - 37.0f) < 0.001f ||
            std::fabs(events[i].midi_note - 38.0f) < 0.001f,
        "multi-target drum lane selected a voice outside its encoded voice mask");
  }
  require(saw_kick_voice && saw_click_voice, "multi-target drum lane should rotate through encoded target voices");

  KesshoProductEvent voice_mask_seed_event{};
  voice_mask_seed_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_LANE;
  voice_mask_seed_event.target_id = KESSHO_PRODUCT_SEQUENCER_DRUM;
  voice_mask_seed_event.index = 0;
  voice_mask_seed_event.param_id = KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID;
  voice_mask_seed_event.value = static_cast<float>(
      kDrumVoiceMaskSeedFlag |
      (((1u << 0u) | (1u << 5u)) << kDrumVoiceMaskSeedShift) |
      6161u);
  require(kessho_product_enqueue_event(engine, &voice_mask_seed_event) == KESSHO_PRODUCT_OK, "drum voice-mask seed event enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 16, "live voice-mask seed event should preserve one drum voice per hit");
  bool saw_sub_voice = false;
  bool saw_noise_voice = false;
  for (int32_t i = 0; i < event_count; ++i) {
    saw_sub_voice = saw_sub_voice || std::fabs(events[i].midi_note - 36.0f) < 0.001f;
    saw_noise_voice = saw_noise_voice || std::fabs(events[i].midi_note - 41.0f) < 0.001f;
    require(
        std::fabs(events[i].midi_note - 36.0f) < 0.001f ||
            std::fabs(events[i].midi_note - 41.0f) < 0.001f,
        "live voice-mask seed event selected a voice outside its encoded mask");
  }
  require(saw_sub_voice && saw_noise_voice, "live voice-mask seed event should update the selected target set");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lanes[0].step_count = 4;
  snapshot.drum_euclid.lanes[0].fill_count = 4;
  snapshot.drum_euclid.lanes[0].midi_note = 37.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum pitch step-value snapshot load failed");
  auto enqueue_drum_step_value = [&](uint32_t step, uint32_t field, float value) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
    event.target_id = KESSHO_PRODUCT_SEQUENCER_DRUM;
    event.index = 0;
    event.param_id = step;
    event.value = value;
    event.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | field;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "drum sequencer step-value enqueue failed");
  };
  enqueue_drum_step_value(0, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 44.0f);
  enqueue_drum_step_value(0, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 2.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 5, "drum ratchet step override should add one trigger inside the first step");
  require(std::fabs(events[0].midi_note - 37.0f) < 0.001f, "drum MIDI step override must not change selected drum voice");
  require(std::fabs(events[0].send_granular - 7.0f) < 0.001f, "drum MIDI step override should become per-trigger pitch offset");
  require(std::fabs(events[0].velocity - events[1].velocity) < 0.001f, "drum ratchet retriggers should preserve the trigger velocity");
  require(events[0].send_delay_a > 0.049f && events[0].send_delay_a < 0.051f, "drum ratchet should pass decay cap in seconds");
  require(events[0].send_delay_b > 0.009f && events[0].send_delay_b < 0.010f, "drum ratchet should pass attack cap in seconds");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lanes[0].step_count = 4;
  snapshot.drum_euclid.lanes[0].fill_count = 4;
  snapshot.drum_euclid.lanes[0].midi_note = 37.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum pitch sub-lane snapshot load failed");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_DRUM,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      4.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueue_drum_step_value(0, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 37.0f);
  enqueue_drum_step_value(1, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 38.0f);
  enqueue_drum_step_value(2, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 39.0f);
  enqueue_drum_step_value(3, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 40.0f);
  enqueue_drum_step_value(1, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 18001);
  require(event_count == 3, "drum pitch sub-lane probability-zero step should suppress one emitted hit");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 12000, 18000});
  require(std::fabs(events[0].midi_note - 37.0f) < 0.001f, "drum pitch sub-lane must not change selected drum voice");
  require(std::fabs(events[1].midi_note - 37.0f) < 0.001f, "drum pitch sub-lane suppressed-hit phase must preserve selected drum voice");
  require(std::fabs(events[2].midi_note - 37.0f) < 0.001f, "drum pitch sub-lane wrap must preserve selected drum voice");
  require(std::fabs(events[0].send_granular - 0.0f) < 0.001f, "drum emitted hit 0 should use pitch index 0");
  require(std::fabs(events[1].send_granular - 1.0f) < 0.001f, "drum emitted hit 1 should skip suppressed pitch hit and use index 1");
  require(std::fabs(events[2].send_granular - 2.0f) < 0.001f, "drum emitted hit 2 should use pitch index 2");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lanes[0].step_count = 4;
  snapshot.drum_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum ratchet sub-lane snapshot load failed");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_DRUM,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_RATCHET >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      2.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 0u, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 1.0f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 1u, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 3.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 8, "drum ratchet sub-lane should index by emitted hit phase instead of trigger step");
  uint32_t step_three_events = 0u;
  for (int32_t i = 0; i < event_count; ++i) {
    if (events[i].step_id == 3u) {
      ++step_three_events;
    }
  }
  require(step_three_events == 3u, "drum ratchet sub-lane should wrap the second ratchet value onto hit three");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lanes[0].step_count = 4;
  snapshot.drum_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum emitted-hit sub-lane snapshot load failed");
  KesshoProductEvent drum_expression_sub_lane{};
  drum_expression_sub_lane.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  drum_expression_sub_lane.target_id = KESSHO_PRODUCT_SEQUENCER_DRUM;
  drum_expression_sub_lane.index = 0;
  drum_expression_sub_lane.param_id = KESSHO_PRODUCT_STEP_FIELD_EXPRESSION >> KESSHO_PRODUCT_STEP_FIELD_SHIFT;
  drum_expression_sub_lane.value = 1.0f;
  drum_expression_sub_lane.value2 = 4.0f;
  drum_expression_sub_lane.value3 = static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD);
  drum_expression_sub_lane.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG;
  require(kessho_product_enqueue_event(engine, &drum_expression_sub_lane) == KESSHO_PRODUCT_OK, "drum emitted-hit sub-lane config enqueue failed");
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 0u, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.1f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 1u, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.2f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 2u, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.3f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 3u, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.4f);
  enqueueSequencerStep(engine, KESSHO_PRODUCT_SEQUENCER_DRUM, 0u, 1u, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 3, "drum probability-zero step should suppress one emitted hit");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 12000, 18000});
  require(events[0].expression >= 0.09f && events[0].expression <= 0.11f, "drum emitted hit 0 should use expression index 0");
  require(events[1].expression >= 0.19f && events[1].expression <= 0.21f, "drum emitted hit 1 should skip suppressed hit and use expression index 1");
  require(events[2].expression >= 0.29f && events[2].expression <= 0.31f, "drum emitted hit 2 should use expression index 2");
  KesshoProductTelemetry emitted_hit_telemetry = kessho_product_get_telemetry(engine);
  require(emitted_hit_telemetry.drum_sequencer_hit_counts[0] == 3u, "drum telemetry should expose emitted-hit sub-lane phase for visuals");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].step_count = 4;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sub-lane snapshot load failed");
  KesshoProductEvent expression_sub_lane{};
  expression_sub_lane.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  expression_sub_lane.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  expression_sub_lane.index = 0;
  expression_sub_lane.param_id = KESSHO_PRODUCT_STEP_FIELD_EXPRESSION >> KESSHO_PRODUCT_STEP_FIELD_SHIFT;
  expression_sub_lane.value = 1.0f;
  expression_sub_lane.value2 = 3.0f;
  expression_sub_lane.value3 = static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_REVERSE);
  expression_sub_lane.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG;
  require(kessho_product_enqueue_event(engine, &expression_sub_lane) == KESSHO_PRODUCT_OK, "sub-lane config enqueue failed");
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.2f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.5f);
  enqueue_step_value(2, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.9f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 4, "reverse expression sub-lane should preserve trigger event count");
  require(events[0].expression >= 0.89f && events[0].expression <= 0.91f, "reverse sub-lane step 0 should read expression index 2");
  require(events[1].expression >= 0.49f && events[1].expression <= 0.51f, "reverse sub-lane step 1 should read expression index 1");
  require(events[2].expression >= 0.19f && events[2].expression <= 0.21f, "reverse sub-lane step 2 should read expression index 0");
  require(events[3].expression >= 0.89f && events[3].expression <= 0.91f, "reverse sub-lane step 3 should wrap to expression index 2");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].step_count = 4;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "long sub-lane snapshot load failed");
  KesshoProductEvent long_expression_sub_lane{};
  long_expression_sub_lane.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  long_expression_sub_lane.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  long_expression_sub_lane.index = 0;
  long_expression_sub_lane.param_id = KESSHO_PRODUCT_STEP_FIELD_EXPRESSION >> KESSHO_PRODUCT_STEP_FIELD_SHIFT;
  long_expression_sub_lane.value = 1.0f;
  long_expression_sub_lane.value2 = 6.0f;
  long_expression_sub_lane.value3 = static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD);
  long_expression_sub_lane.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG;
  require(kessho_product_enqueue_event(engine, &long_expression_sub_lane) == KESSHO_PRODUCT_OK, "long sub-lane config enqueue failed");
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.15f);
  enqueue_step_value(1, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.25f);
  enqueue_step_value(2, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.35f);
  enqueue_step_value(3, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.45f);
  enqueue_step_value(4, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.65f);
  enqueue_step_value(5, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.95f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 36000);
  require(event_count == 6, "long expression sub-lane should preserve trigger event count");
  require(maskHas(engine->synth_lanes[0].expression_override_set_low, engine->synth_lanes[0].expression_override_set_high, 5),
      "long expression sub-lane should accept override indexes beyond trigger steps");
  require(events[4].expression >= 0.64f && events[4].expression <= 0.66f, "long sub-lane step 4 should read expression index 4");
  require(events[5].expression >= 0.94f && events[5].expression <= 0.96f, "long sub-lane step 5 should read expression index 5");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lanes[0].step_count = 4;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "range sub-lane snapshot load failed");
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.2f, 0.3f, KESSHO_PRODUCT_STEP_TOGGLE_RANGE_VALUE);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 4, "expression range sub-lane should preserve trigger event count");
  for (int32_t i = 0; i < event_count; ++i) {
    require(events[i].expression >= 0.2f && events[i].expression <= 0.3f, "expression range sub-lane did not sample within range");
  }
  require(
      kessho_product_copy_sequencer_ui_state(engine, &sequencer_ui_state) == KESSHO_PRODUCT_OK,
      "sequencer UI state copy failed after range sub-lane");
  require(
      maskHas(sequencer_ui_state.synth_lanes[0].expression_range_set_low, sequencer_ui_state.synth_lanes[0].expression_range_set_high, 0),
      "sequencer UI state should expose expression range override mask");
  require(
      std::fabs(sequencer_ui_state.synth_lanes[0].expression_range_maxes[0] - 0.3f) < 0.000001f,
      "sequencer UI state should expose expression range max values");
  const LaneState range_lane_state = engine->synth_lanes[0];
  KesshoProductSnapshotV2 range_reload_snapshot = makeSnapshot();
  range_reload_snapshot.drum_euclid.lane_count = 0;
  range_reload_snapshot.synth_euclid.lanes[0].step_count = 4;
  range_reload_snapshot.synth_euclid.lanes[0].fill_count = 4;
  require(
      kessho_product_load_snapshot_v2(engine, &range_reload_snapshot, sizeof(range_reload_snapshot)) == KESSHO_PRODUCT_OK,
      "full snapshot reload before range UI replay should load");
  replaySequencerUiLane(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      sequencer_ui_state.synth_lanes[0]);
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 4, "range UI replay should preserve trigger event count");
  requireLaneMutationStateEqual(
      engine->synth_lanes[0],
      range_lane_state,
      "full snapshot reload plus reconciled UI replay must preserve range sub-lane state");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "modulation snapshot load failed");
  KesshoProductEvent synth_range{};
  synth_range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  synth_range.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  synth_range.index = 101u;
  synth_range.param_id = KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID;
  synth_range.value = 0.2f;
  synth_range.value2 = 0.25f;
  synth_range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  synth_range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &synth_range) == KESSHO_PRODUCT_OK, "synth modulation range enqueue failed");
  KesshoProductEvent drum_range{};
  drum_range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  drum_range.target_id = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE;
  drum_range.index = 102u;
  drum_range.param_id = KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID;
  drum_range.value = 0.35f;
  drum_range.value2 = 0.45f;
  drum_range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  drum_range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &drum_range) == KESSHO_PRODUCT_OK, "drum modulation range enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 8, "modulation ranges should preserve event generation");
  bool saw_synth_source_owned_expression = false;
  bool saw_drum_source_owned_morph = false;
  for (int32_t i = 0; i < event_count; ++i) {
    if (events[i].source_id == KESSHO_PRODUCT_SOURCE_PAD1) {
      saw_synth_source_owned_expression = saw_synth_source_owned_expression || events[i].expression < 0.0f;
    }
    if (events[i].source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      saw_drum_source_owned_morph = saw_drum_source_owned_morph || events[i].morph < 0.0f;
    }
  }
  require(saw_synth_source_owned_expression, "inactive expression sub-lane should leave source expression to trigger-time modulation");
  require(saw_drum_source_owned_morph, "inactive morph sub-lane should leave drum morph to trigger-time modulation");
  ModulationRange* synth_expression_range = engine->findModulationRange(
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID);
  ModulationRange* drum_morph_range = engine->findModulationRange(
      KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE,
      KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID);
  require(synth_expression_range != nullptr, "source expression modulation range missing after sequencer generation");
  require(drum_morph_range != nullptr, "drum morph modulation range missing after sequencer generation");
  const uint32_t source_owned_synth_expression_counter = synth_expression_range->sample_hold_counter;
  const uint32_t source_owned_drum_morph_counter = drum_morph_range->sample_hold_counter;
  bool triggered_synth_event = false;
  bool triggered_drum_event = false;
  for (int32_t i = 0; i < event_count; ++i) {
    if (!triggered_synth_event && events[i].source_id == KESSHO_PRODUCT_SOURCE_PAD1) {
      engine->triggerSequencerEvent(events[i]);
      triggered_synth_event = true;
    }
    if (!triggered_drum_event && events[i].source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      engine->triggerSequencerEvent(events[i]);
      triggered_drum_event = true;
    }
  }
  require(triggered_synth_event, "sequencer modulation test did not trigger synth event");
  require(triggered_drum_event, "sequencer modulation test did not trigger drum event");
  require(
      synth_expression_range->sample_hold_counter > source_owned_synth_expression_counter,
      "source-owned expression should be modulated at trigger when expression sub-lane is inactive");
  require(
      drum_morph_range->sample_hold_counter > source_owned_drum_morph_counter,
      "source-owned drum morph should be modulated at trigger when morph sub-lane is inactive");
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_SYNTH,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_EXPRESSION >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      1.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  enqueueSequencerStep(
      engine,
      KESSHO_PRODUCT_SEQUENCER_DRUM,
      0u,
      KESSHO_PRODUCT_STEP_FIELD_MORPH >> KESSHO_PRODUCT_STEP_FIELD_SHIFT,
      KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG,
      1.0f,
      1.0f,
      static_cast<float>(KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD));
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 8, "active modulation sub-lanes should preserve event generation");
  bool saw_synth_expression_range = false;
  bool saw_drum_morph_range = false;
  for (int32_t i = 0; i < event_count; ++i) {
    if (events[i].source_id == KESSHO_PRODUCT_SOURCE_PAD1) {
      saw_synth_expression_range = saw_synth_expression_range || (events[i].expression >= 0.2f && events[i].expression <= 0.25f);
    }
    if (events[i].source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      saw_drum_morph_range = saw_drum_morph_range || (events[i].morph >= 0.35f && events[i].morph <= 0.45f);
    }
  }
  require(saw_synth_expression_range, "active expression sub-lane did not sample source expression range into events");
  require(saw_drum_morph_range, "active morph sub-lane did not sample drum morph range into events");
  const uint32_t explicit_synth_expression_counter = synth_expression_range->sample_hold_counter;
  const uint32_t explicit_drum_morph_counter = drum_morph_range->sample_hold_counter;
  triggered_synth_event = false;
  triggered_drum_event = false;
  for (int32_t i = 0; i < event_count; ++i) {
    if (!triggered_synth_event && events[i].source_id == KESSHO_PRODUCT_SOURCE_PAD1) {
      engine->triggerSequencerEvent(events[i]);
      triggered_synth_event = true;
    }
    if (!triggered_drum_event && events[i].source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      engine->triggerSequencerEvent(events[i]);
      triggered_drum_event = true;
    }
  }
  require(triggered_synth_event, "explicit sequencer modulation test did not trigger synth event");
  require(triggered_drum_event, "explicit sequencer modulation test did not trigger drum event");
  require(
      synth_expression_range->sample_hold_counter == explicit_synth_expression_counter,
      "sequencer explicit expression should not be modulated twice at trigger");
  require(
      drum_morph_range->sample_hold_counter == explicit_drum_morph_counter,
      "sequencer explicit drum morph should not be modulated twice at trigger");

  {
    KesshoProductEngine route_cache(48000.0, 128, 0);
    const uint32_t source_params[] = {
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID,
        KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID,
    };
    auto apply_sample_hold_range = [&](uint32_t target_id, uint32_t param_id, uint32_t control_id, float min_value, float max_value) {
      KesshoProductEvent range{};
      range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
      range.target_id = target_id;
      range.index = control_id;
      range.param_id = param_id;
      range.value = min_value;
      range.value2 = max_value;
      range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
      range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
      route_cache.applyModulationRangeEvent(range);
      require(route_cache.telemetry.last_error_code == KESSHO_PRODUCT_OK, "route cache range apply failed");
    };
    const uint32_t route_target_id = KESSHO_PRODUCT_SOURCE_PAD1;
    const uint32_t route_param_id = KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID;
    uint32_t filler_count = 0u;
    for (uint32_t source_id = 1u; source_id <= kSourceCount && filler_count < 24u; ++source_id) {
      for (uint32_t param_id : source_params) {
        if (source_id == route_target_id && param_id == route_param_id) {
          continue;
        }
        apply_sample_hold_range(
            source_id,
            param_id,
            500u + filler_count,
            0.01f,
            0.02f);
        ++filler_count;
        if (filler_count >= 24u) {
          break;
        }
      }
    }
    require(filler_count == 24u, "route cache filler range count mismatch");
    apply_sample_hold_range(route_target_id, route_param_id, 900u, 0.42f, 0.43f);
    const uint32_t route_slot = route_cache.sourceModulationParamSlot(route_param_id);
    require(route_slot < kSourceModulationParamSlotCount, "source expression route slot missing");
    require(
        route_cache.source_modulation_route_indices[route_target_id - 1u][route_slot] == filler_count,
        "source modulation route cache did not point at high-index range");
    const float resolved = route_cache.resolveModulatedValue(route_target_id, route_param_id, 0.99f, 12345u);
    require(resolved >= 0.42f && resolved <= 0.43f, "source modulation route cache resolved outside range");
    KesshoProductEvent disable_range{};
    disable_range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
    disable_range.target_id = route_target_id;
    disable_range.param_id = route_param_id;
    disable_range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
    route_cache.applyModulationRangeEvent(disable_range);
    require(
        route_cache.source_modulation_route_indices[route_target_id - 1u][route_slot] == kInvalidModulationRouteIndex,
        "source modulation route cache did not clear disabled range");
    require(
        std::fabs(route_cache.resolveModulatedValue(route_target_id, route_param_id, 0.99f, 12345u) - 0.99f) < 0.000001f,
        "disabled source modulation route should resolve to fallback");
  }

  {
    KesshoProductEngine direct_sh(48000.0, 128, 0);
    direct_sh.master_gain = 1.0f;
    KesshoProductEvent product_range{};
    product_range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
    product_range.target_id = 0u;
    product_range.index = 301u;
    product_range.param_id = KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID;
    product_range.value = 0.2f;
    product_range.value2 = 0.8f;
    product_range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
    product_range.value4 = 0.2f;
    product_range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
    direct_sh.applyModulationRangeEvent(product_range);
    require(std::fabs(direct_sh.master_gain - 0.2f) < 0.0001f, "product-param sample-hold initial value mismatch");
    direct_sh.advanceModulationRanges(4800u);
    require(direct_sh.master_gain >= 0.2f && direct_sh.master_gain <= 0.8f, "product-param sample-hold left range");
    require(std::fabs(direct_sh.master_gain - 0.2f) > 0.0001f, "product-param sample-hold did not advance");
  }

  {
    KesshoProductEngine owned_sh(48000.0, 128, 0);
    owned_sh.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].enabled = true;
    owned_sh.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1].delay_a_send = 1.0f;
    owned_sh.fx.delay_a_enabled = true;
    owned_sh.fx.delay_a_feedback = 0.1f;
    KesshoProductEvent owned_range{};
    owned_range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
    owned_range.target_id = 0u;
    owned_range.index = 302u;
    owned_range.param_id = KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID;
    owned_range.value = 0.1f;
    owned_range.value2 = 0.9f;
    owned_range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
    owned_range.value4 = 0.1f;
    owned_range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE | KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_A;
    owned_sh.applyModulationRangeEvent(owned_range);
    require(std::fabs(owned_sh.fx.delay_a_feedback - 0.1f) < 0.0001f, "owned FX sample-hold initial value mismatch");
    owned_sh.advanceModulationRanges(4800u);
    require(std::fabs(owned_sh.fx.delay_a_feedback - 0.1f) < 0.0001f, "owned FX sample-hold should not use 10Hz timer");
    owned_sh.triggerVoice(KESSHO_PRODUCT_SOURCE_PAD1, 60.0f, 0.8f, 0.1f, -1.0f, -1.0f, -1.0f, 12345u);
    require(
        owned_sh.fx.delay_a_feedback >= 0.1f && owned_sh.fx.delay_a_feedback <= 0.9f,
        "owned FX sample-hold trigger left range");
    require(std::fabs(owned_sh.fx.delay_a_feedback - 0.1f) > 0.0001f, "owned FX sample-hold did not advance on source onset");
  }

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "walk modulation snapshot load failed");
  KesshoProductEvent walk_range{};
  walk_range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  walk_range.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  walk_range.index = 201u;
  walk_range.param_id = KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID;
  walk_range.value = 0.1f;
  walk_range.value2 = 0.9f;
  walk_range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK);
  walk_range.value4 = 0.5f;
  walk_range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &walk_range) == KESSHO_PRODUCT_OK, "walk modulation range enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 6000);
  KesshoProductTelemetry walk_telemetry = kessho_product_get_telemetry(engine);
  require(walk_telemetry.modulation_range_count == 1, "walk modulation range telemetry missing");
  require(walk_telemetry.runtime_walk_count == 1, "runtime walk telemetry missing");
  require(walk_telemetry.runtime_walk_control_ids[0] == 201u, "runtime walk telemetry control id mismatch");
  require(
      walk_telemetry.runtime_walk_values[0] >= 0.1f && walk_telemetry.runtime_walk_values[0] <= 0.9f,
      "runtime walk telemetry value out of range");

  {
    KesshoProductEngine configured_walk(48000.0, 128, 0);
    KesshoProductEvent configured_range = walk_range;
    configured_range.index = 202u;
    configured_range.flags =
        KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE |
        KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_GLOBAL |
        randomWalkSpeedFlags(4.25f);
    configured_walk.applyModulationRangeEvent(configured_range);
    ModulationRange* configured = configured_walk.findModulationRange(
        KESSHO_PRODUCT_SOURCE_PAD1,
        KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID);
    require(configured != nullptr, "configured runtime walk range missing");
    require(std::fabs(configured->random_walk_speed - 4.25f) < 0.001f, "runtime walk speed flag not decoded");
    require(configured->random_walk_global, "runtime walk global mode flag not decoded");
    const float configured_initial = configured->current_value;
    configured_walk.advanceModulationRanges(48000u);
    require(
        std::fabs(configured->current_value - configured_initial) > 0.00001f,
        "global runtime walk did not advance");
  }

  {
    KesshoProductEngine paired_walk(48000.0, 128, 0);
    KesshoProductEvent pair_a{};
    pair_a.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
    pair_a.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
    pair_a.index = 777u;
    pair_a.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
    pair_a.value = 0.2f;
    pair_a.value2 = 0.8f;
    pair_a.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK);
    pair_a.value4 = 0.4f;
    pair_a.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE | randomWalkSpeedFlags(1.0f);
    KesshoProductEvent pair_b = pair_a;
    pair_b.target_id = KESSHO_PRODUCT_SOURCE_PAD2;
    paired_walk.applyModulationRangeEvent(pair_a);
    paired_walk.applyModulationRangeEvent(pair_b);
    ModulationRange* pad1_range = paired_walk.findModulationRange(
        KESSHO_PRODUCT_SOURCE_PAD1,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID);
    ModulationRange* pad2_range = paired_walk.findModulationRange(
        KESSHO_PRODUCT_SOURCE_PAD2,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID);
    require(pad1_range != nullptr && pad2_range != nullptr, "paired runtime walk ranges missing");
    require(pad1_range->seed == pad2_range->seed, "paired runtime walk ranges should share a control seed");
    paired_walk.advanceModulationRanges(48000u);
    require(
        std::fabs(pad1_range->current_value - pad2_range->current_value) < 0.0001f,
        "paired runtime walk ranges with one slider should stay in sync");
  }

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lanes[0].probability = 0.0f;
  snapshot.drum_euclid.lanes[0].probability = 0.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "probability snapshot load failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 0, "probability 0 lanes must generate no events");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lanes[0].ratchet = 3;
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet snapshot load failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 24000);
  require(event_count == 3, "ratchet 3 should generate three events in one 16th step");
  expectOffsets(events, static_cast<uint32_t>(event_count), {18000, 20000, 22000});
  require(std::fabs(events[0].velocity - 1.0f) < 0.001f, "ratchet first hit should use lane velocity");
  require(std::fabs(events[1].velocity - 1.0f) < 0.001f, "ratchet second hit should preserve lane velocity");
  require(std::fabs(events[2].velocity - 1.0f) < 0.001f, "ratchet third hit should preserve lane velocity");
  require(events[0].send_delay_a > 0.32f && events[0].send_delay_a < 0.34f, "synth ratchet events should carry envelope-tightening factor");

  engine->pad_voice_release_frames[0][0] = 0u;
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      -1.0f,
      -1.0f,
      -1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      0.25f);
  require(
      engine->pad_voice_release_frames[0][0] == 2400u,
      "Product pad synth ratchets should shorten scheduled pad hold like the Web ratchet path");

  SourceState& lead_source = engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  lead_source.lead_envelope_override_enabled = true;
  lead_source.attack_seconds = 0.4f;
  lead_source.decay_seconds = 0.8f;
  lead_source.sustain = 1.0f;
  lead_source.release_seconds = 1.2f;
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      60.0f,
      1.0f,
      0.2f,
      -1.0f,
      -1.0f,
      -1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      0.5f);
  float* lead_params = engine->lead_modules[0] ? engine->lead_modules[0]->params() : nullptr;
  require(lead_params != nullptr, "lead module params should be available for synth ratchet parity check");
  require(std::fabs(lead_params[43] - 0.2f) < 0.001f, "Product lead synth ratchet should scale attack");
  require(std::fabs(lead_params[44] - 0.4f) < 0.001f, "Product lead synth ratchet should scale decay");
  require(std::fabs(lead_params[46] - 0.6f) < 0.001f, "Product lead synth ratchet should scale release");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& pad_morph_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad_morph_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  pad_morph_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "preset morph endpoint snapshot load failed");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      0.0f,
      0.0f,
      1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  float* pad_params = engine->pad_module ? engine->pad_module->params() : nullptr;
  require(pad_params != nullptr, "pad module params should be available for preset morph parity check");
  require(std::fabs(pad_params[14] - 0.15f) < 0.001f, "Product pad preset morph endpoint A should reach exact module params");
  KesshoProductEvent pad_endpoint_preset_event{};
  pad_endpoint_preset_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  pad_endpoint_preset_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_endpoint_preset_event.index = 1u;
  pad_endpoint_preset_event.value =
      static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT);
  engine->applySourcePresetEvent(pad_endpoint_preset_event);
  require(
      std::fabs(pad_params[14] - 0.36f) < 0.001f,
      "pad preset endpoint change should refresh live module before retrigger");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      1.0f,
      0.0f,
      1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  require(std::fabs(pad_params[14] - 0.36f) < 0.001f, "Product pad preset morph endpoint B should reach exact module params");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 1;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& pad_live_morph_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad_live_morph_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  pad_live_morph_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "live morph endpoint snapshot load failed");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      0.0f,
      0.0f,
      1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  pad_params = engine->pad_module ? engine->pad_module->params() : nullptr;
  require(pad_params != nullptr, "pad module params should be available for live morph preset change check");
  require(std::fabs(pad_params[14] - 0.15f) < 0.001f, "live morph preset change setup should start on endpoint A");
  engine->transport.running = true;
  LaneState& live_morph_lane = engine->synth_lanes[0];
  live_morph_lane.enabled = true;
  live_morph_lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  live_morph_lane.last_emitted_morph_valid = true;
  live_morph_lane.last_emitted_morph = 1.0f;
  live_morph_lane.last_emitted_sample_frame = 100u;
  float ignored_live_morph = 0.0f;
  require(
      !engine->activeSequencerMorphForPresetSource(
          KESSHO_PRODUCT_SOURCE_PAD1,
          DRUM_NUM_VOICE_TYPES,
          ignored_live_morph),
      "inactive morph sub-lane should not own preset morph from a stale latch");
  live_morph_lane.step_value_configs[engine->stepFieldId(KESSHO_PRODUCT_STEP_FIELD_MORPH)].enabled = true;
  float active_live_morph = 0.0f;
  require(
      engine->activeSequencerMorphForPresetSource(
          KESSHO_PRODUCT_SOURCE_PAD1,
          DRUM_NUM_VOICE_TYPES,
          active_live_morph) &&
          std::fabs(active_live_morph - 1.0f) < 0.001f,
      "active morph sub-lane should expose the latest preset morph latch");
  pad_endpoint_preset_event.index = 2u;
  pad_endpoint_preset_event.value =
      static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT);
  engine->applySourcePresetEvent(pad_endpoint_preset_event);
  require(
      std::fabs(pad_params[14] - 0.36f) < 0.001f,
      "preset endpoint change should refresh live module at active sequencer lane morph");
  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 1;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& pad_anchored_override_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad_anchored_override_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  pad_anchored_override_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  pad_anchored_override_source.morph = 0.0f;
  pad_anchored_override_source.pad_override_count = 1u;
  pad_anchored_override_source.pad_override_indices[0] = 14u;
  pad_anchored_override_source.pad_override_values[0] = 0.15f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "anchored Pad override snapshot load failed");
  pad_params = engine->pad_module ? engine->pad_module->params() : nullptr;
  require(pad_params != nullptr, "pad module params should be available for anchored override check");
  engine->transport.running = true;
  LaneState& anchored_override_lane = engine->synth_lanes[0];
  anchored_override_lane.enabled = true;
  anchored_override_lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  anchored_override_lane.last_emitted_morph_valid = true;
  anchored_override_lane.last_emitted_morph = 1.0f;
  anchored_override_lane.last_emitted_sample_frame = 150u;
  anchored_override_lane.step_value_configs[engine->stepFieldId(KESSHO_PRODUCT_STEP_FIELD_MORPH)].enabled = true;
  pad_endpoint_preset_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_endpoint_preset_event.index = 2u;
  pad_endpoint_preset_event.value =
      static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT);
  engine->applySourcePresetEvent(pad_endpoint_preset_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "anchored Pad preset B endpoint event failed");
  require(
      std::fabs(pad_params[14] - 0.36f) < 0.001f,
      "Pad preset endpoint change should not let base-morph sparse overrides pin the active sequencer timbre");
  KesshoProductEvent pad_direct_override_slot{};
  pad_direct_override_slot.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE;
  pad_direct_override_slot.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_direct_override_slot.index = 0u;
  pad_direct_override_slot.param_id = 14u;
  pad_direct_override_slot.value = 0.22f;
  pad_direct_override_slot.flags = KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT;
  engine->applySourceOverrideEvent(pad_direct_override_slot);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "Pad direct override slot event failed");
  KesshoProductEvent pad_direct_override_commit{};
  pad_direct_override_commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE;
  pad_direct_override_commit.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_direct_override_commit.index = 1u;
  pad_direct_override_commit.flags = KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT;
  engine->applySourceOverrideEvent(pad_direct_override_commit);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "Pad direct override commit event failed");
  require(
      std::fabs(pad_params[14] - 0.22f) < 0.001f,
      "direct Pad parameter edits should still update the active sequencer morph live");
  require(
      engine->applyStructuredSourceOverridesToModuleAtMorph(KESSHO_PRODUCT_SOURCE_PAD1, 0.0f),
      "anchored Pad direct override should still resolve endpoint A");
  require(
      std::fabs(pad_params[14] - 0.15f) < 0.001f,
      "direct Pad parameter edits made at sequenced endpoint B should not bleed into endpoint A");
  require(
      engine->applyStructuredSourceOverridesToModuleAtMorph(KESSHO_PRODUCT_SOURCE_PAD1, 1.0f),
      "anchored Pad direct override should still resolve endpoint B");
  require(
      std::fabs(pad_params[14] - 0.22f) < 0.001f,
      "direct Pad parameter edits made at sequenced endpoint B should be remembered at endpoint B");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 1;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& pad_live_morph_reload_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad_live_morph_reload_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  pad_live_morph_reload_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "live morph endpoint snapshot reload failed");
  pad_params = engine->pad_module ? engine->pad_module->params() : nullptr;
  require(pad_params != nullptr, "pad module params should be available after live morph reload");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      0.0f,
      0.0f,
      1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  require(std::fabs(pad_params[14] - 0.15f) < 0.001f, "live morph reload should start on endpoint A");
  engine->transport.running = true;
  LaneState& live_morph_reload_lane = engine->synth_lanes[0];
  live_morph_reload_lane.enabled = true;
  live_morph_reload_lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  live_morph_reload_lane.last_emitted_morph_valid = true;
  live_morph_reload_lane.last_emitted_morph = 1.0f;
  live_morph_reload_lane.last_emitted_sample_frame = 151u;
  live_morph_reload_lane.step_value_configs[engine->stepFieldId(KESSHO_PRODUCT_STEP_FIELD_MORPH)].enabled = true;
  pad_endpoint_preset_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_endpoint_preset_event.index = 2u;
  pad_endpoint_preset_event.value =
      static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT);
  engine->applySourcePresetEvent(pad_endpoint_preset_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "preset endpoint change after reload failed");
  require(
      std::fabs(pad_params[14] - 0.36f) < 0.001f,
      "preset endpoint change should refresh live module at active sequencer morph after reload");
  require(
      engine->applyStructuredSourceOverridesToModuleAtMorph(KESSHO_PRODUCT_SOURCE_PAD1, 0.0f),
      "manual trigger active morph regression setup should force endpoint A");
  require(
      std::fabs(pad_params[14] - 0.15f) < 0.001f,
      "manual trigger active morph regression setup should start from endpoint A");
  const uint32_t active_morph_manual_voice_index = engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      -1.0f,
      -1.0f,
      -1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  require(active_morph_manual_voice_index != kProductInvalidVoiceIndex, "manual trigger active morph regression note failed");
  require(
      std::fabs(pad_params[14] - 0.36f) < 0.001f,
      "manual trigger should use active sequencer morph instead of stored source morph");
  constexpr uint32_t kPadLiveAdsrAttackParamIndex = 33u;
  constexpr float kPadLiveAdsrAttack = 0.321f;
  KesshoProductEvent pad_live_adsr_event{};
  pad_live_adsr_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  pad_live_adsr_event.param_id = kProductPadRuntimeParamIdBase + kPadLiveAdsrAttackParamIndex;
  pad_live_adsr_event.value = kPadLiveAdsrAttack;
  engine->applyParam(pad_live_adsr_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "pad live ADSR param update failed");
  require(
      std::fabs(pad_params[kPadLiveAdsrAttackParamIndex] - kPadLiveAdsrAttack) < 0.001f,
      "pad live ADSR update should refresh module at active sequencer morph");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + 21u, 12000.0f, "pad live ADSR audio cutoff min update failed");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + 22u, 12000.0f, "pad live ADSR audio cutoff max update failed");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + 34u, 0.01f, "pad live ADSR audio decay update failed");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + 35u, 1.0f, "pad live ADSR audio sustain update failed");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + 36u, 0.05f, "pad live ADSR audio release update failed");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + 52u, 1.0f, "pad live ADSR audio level update failed");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + kPadLiveAdsrAttackParamIndex, 8.0f, "pad live ADSR audio long attack update failed");
  hardStopPadModuleVoices(engine);
  const uint32_t long_attack_voice_index = engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      2.0f,
      1.0f,
      0.0f,
      1.0f,
      123u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  require(long_attack_voice_index != kProductInvalidVoiceIndex, "pad live ADSR audio long attack trigger failed");
  const float long_attack_peak = renderPadModulePeakBlocks(engine, 1u);
  hardStopPadModuleVoices(engine);
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + kPadLiveAdsrAttackParamIndex, 0.001f, "pad live ADSR audio fast attack update failed");
  const uint32_t fast_attack_voice_index = engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      2.0f,
      1.0f,
      0.0f,
      1.0f,
      123u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  require(fast_attack_voice_index != kProductInvalidVoiceIndex, "pad live ADSR audio fast attack trigger failed");
  const float fast_attack_peak = renderPadModulePeakBlocks(engine, 1u);
  require(
      fast_attack_peak > 0.005f && fast_attack_peak > long_attack_peak * 20.0f,
      "pad live ADSR edit should audibly affect the next trigger while sequencer morph is latched");
  applyRuntimeParam(engine, kProductPadRuntimeParamIdBase + kPadLiveAdsrAttackParamIndex, kPadLiveAdsrAttack, "pad live ADSR attack restore failed");
  hardStopPadModuleVoices(engine);
  requireAllPadRuntimeParamsRefreshLiveModule(
      engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kProductPadRuntimeParamIdBase,
      pad_params,
      0u,
      "all Pad 1 runtime params should refresh module while sequencer morph is latched");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD2,
      64.0f,
      1.0f,
      0.2f,
      0.0f,
      0.0f,
      1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  live_morph_lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD2;
  live_morph_lane.last_emitted_sample_frame = 101u;
  requireAllPadRuntimeParamsRefreshLiveModule(
      engine,
      KESSHO_PRODUCT_SOURCE_PAD2,
      kProductPad2RuntimeParamIdBase,
      pad_params,
      kProductPadRuntimeParamCount,
      "all Pad 2 runtime params should refresh module while sequencer morph is latched");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 1;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& lead_live_override_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  lead_live_override_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  lead_live_override_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  lead_live_override_source.morph = 0.0f;
  lead_live_override_source.distance = 0.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead live morph override snapshot load failed");
  constexpr uint32_t kLeadLiveOverrideGainParamIndex = 62u;
  constexpr float kLeadLiveOverrideGain = 0.37f;
  const auto* lead_live_a_preset = findSourcePreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  const auto* lead_live_b_preset = findSourcePreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  require(lead_live_a_preset != nullptr && lead_live_b_preset != nullptr, "lead live morph override presets missing");
  const auto lead_live_a_patch = sourcePresetPatch(*lead_live_a_preset);
  const auto lead_live_b_patch = sourcePresetPatch(*lead_live_b_preset);
  uint32_t lead_live_probe_param_index = kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
  for (uint32_t param_index = 0u; param_index < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT; ++param_index) {
    if (param_index == kLeadLiveOverrideGainParamIndex) {
      continue;
    }
    if (std::fabs(lead_live_a_patch.exact_lead_params[param_index] - lead_live_b_patch.exact_lead_params[param_index]) > 0.001f) {
      lead_live_probe_param_index = param_index;
      break;
    }
  }
  require(
      lead_live_probe_param_index < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT,
      "lead live morph override presets must differ");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      60.0f,
      1.0f,
      0.2f,
      0.0f,
      0.0f,
      1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  lead_params = engine->lead_modules[0] ? engine->lead_modules[0]->params() : nullptr;
  require(lead_params != nullptr, "lead module params should be available for live morph override check");
  require(
      std::fabs(lead_params[lead_live_probe_param_index] - lead_live_a_patch.exact_lead_params[lead_live_probe_param_index]) < 0.001f,
      "lead live morph override setup should start on endpoint A");
  engine->transport.running = true;
  LaneState& lead_live_morph_lane = engine->synth_lanes[0];
  lead_live_morph_lane.enabled = true;
  lead_live_morph_lane.target_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_live_morph_lane.last_emitted_morph_valid = true;
  lead_live_morph_lane.last_emitted_morph = 1.0f;
  lead_live_morph_lane.last_emitted_sample_frame = 200u;
  lead_live_morph_lane.step_value_configs[engine->stepFieldId(KESSHO_PRODUCT_STEP_FIELD_MORPH)].enabled = true;
  KesshoProductEvent lead_live_override_slot{};
  lead_live_override_slot.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE;
  lead_live_override_slot.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_live_override_slot.index = 0u;
  lead_live_override_slot.param_id = kLeadLiveOverrideGainParamIndex;
  lead_live_override_slot.value = kLeadLiveOverrideGain;
  lead_live_override_slot.flags = KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT;
  engine->applySourceOverrideEvent(lead_live_override_slot);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live morph override slot event failed");
  KesshoProductEvent lead_live_override_commit{};
  lead_live_override_commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE;
  lead_live_override_commit.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_live_override_commit.index = 1u;
  lead_live_override_commit.flags = KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT;
  engine->applySourceOverrideEvent(lead_live_override_commit);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live morph override commit event failed");
  require(
      std::fabs(lead_params[lead_live_probe_param_index] - lead_live_b_patch.exact_lead_params[lead_live_probe_param_index]) < 0.001f,
      "lead override commit should refresh live module at active sequencer morph");
  require(
      std::fabs(lead_params[kLeadLiveOverrideGainParamIndex] - kLeadLiveOverrideGain) < 0.001f,
      "lead override commit should preserve sparse Lead override value");
  KesshoProductEvent lead_live_adsr_event{};
  lead_live_adsr_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  lead_live_adsr_event.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_live_adsr_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID;
  lead_live_adsr_event.value = 1.0f;
  engine->applyParam(lead_live_adsr_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live ADSR enable event failed");
  lead_live_adsr_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID;
  lead_live_adsr_event.value = 0.123f;
  engine->applyParam(lead_live_adsr_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live ADSR attack event failed");
  lead_live_adsr_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID;
  lead_live_adsr_event.value = 0.456f;
  engine->applyParam(lead_live_adsr_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live ADSR decay event failed");
  lead_live_adsr_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID;
  lead_live_adsr_event.value = 0.67f;
  engine->applyParam(lead_live_adsr_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live ADSR sustain event failed");
  lead_live_adsr_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID;
  lead_live_adsr_event.value = 1.23f;
  engine->applyParam(lead_live_adsr_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead live ADSR release event failed");
  require(std::fabs(lead_params[43] - 0.123f) < 0.001f, "lead live ADSR attack should update module while sequencer morph is latched");
  require(std::fabs(lead_params[44] - 0.456f) < 0.001f, "lead live ADSR decay should update module while sequencer morph is latched");
  require(std::fabs(lead_params[45] - 0.67f) < 0.001f, "lead live ADSR sustain should update module while sequencer morph is latched");
  require(std::fabs(lead_params[46] - 1.23f) < 0.001f, "lead live ADSR release should update module while sequencer morph is latched");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 1;
  snapshot.drum_euclid.lane_count = 0;
  KesshoProductSourceSnapshot& stale_lead_override_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  stale_lead_override_source.enabled = true;
  stale_lead_override_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  stale_lead_override_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  stale_lead_override_source.morph = 0.0f;
  stale_lead_override_source.lead_override_count = 1u;
  stale_lead_override_source.lead_override_indices[0] = lead_live_probe_param_index;
  stale_lead_override_source.lead_override_values[0] = lead_live_a_patch.exact_lead_params[lead_live_probe_param_index];
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "stale Lead endpoint override snapshot load failed");
  lead_params = engine->lead_modules[0] ? engine->lead_modules[0]->params() : nullptr;
  require(lead_params != nullptr, "lead module params should be available for stale endpoint override check");
  engine->transport.running = true;
  LaneState& stale_lead_endpoint_lane = engine->synth_lanes[0];
  stale_lead_endpoint_lane.enabled = true;
  stale_lead_endpoint_lane.target_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  stale_lead_endpoint_lane.last_emitted_morph_valid = true;
  stale_lead_endpoint_lane.last_emitted_morph = 0.0f;
  stale_lead_endpoint_lane.last_emitted_sample_frame = 220u;
  stale_lead_endpoint_lane.step_value_configs[engine->stepFieldId(KESSHO_PRODUCT_STEP_FIELD_MORPH)].enabled = true;
  KesshoProductEvent lead_endpoint_a_event{};
  lead_endpoint_a_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  lead_endpoint_a_event.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_endpoint_a_event.index = 1u;
  lead_endpoint_a_event.value =
      static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  engine->applySourcePresetEvent(lead_endpoint_a_event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "Lead preset A endpoint change with stale override failed");
  require(
      std::fabs(lead_params[lead_live_probe_param_index] - lead_live_b_patch.exact_lead_params[lead_live_probe_param_index]) < 0.001f,
      "Lead preset A endpoint change should clear stale exact overrides and refresh the active sequencer morph");

  kessho_product_reset(engine);
  SourceState& pad_preset_source = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad_preset_source.enabled = true;
  pad_preset_source.source_preset_endpoint_valid = false;
  pad_preset_source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  engine->compileSourcePresetRuntime(pad_preset_source);
  require(pad_preset_source.source_preset_patch_valid, "source preset patch should be compiled before trigger");
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      -1.0f,
      -1.0f,
      -1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  pad_params = engine->pad_module ? engine->pad_module->params() : nullptr;
  require(pad_params != nullptr, "pad module params should be available for compiled source preset check");
  require(std::fabs(pad_params[14] - 0.15f) < 0.001f, "compiled source preset should trigger without generated lookup");
  KesshoProductEvent pad_preset_event{};
  pad_preset_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  pad_preset_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_preset_event.value = static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT);
  engine->applySourcePresetEvent(pad_preset_event);
  engine->triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      1.0f,
      0.2f,
      -1.0f,
      -1.0f,
      -1.0f,
      0u,
      0u,
      true,
      0.0f,
      1.0e10f,
      1.0e10f,
      0u,
      1.0f);
  require(std::fabs(pad_params[14] - 0.36f) < 0.001f, "source preset event should refresh compiled patch before trigger");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 1;
  snapshot.drum_euclid.lane_count = 0;
  snapshot.transport.running = 1;
  snapshot.synth_euclid.lanes[0].enabled = 1;
  snapshot.synth_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  snapshot.synth_euclid.lanes[0].step_count = 4;
  snapshot.synth_euclid.lanes[0].fill_count = 4;
  snapshot.synth_euclid.lanes[0].clock_division = 16;
  snapshot.synth_euclid.lanes[0].probability = 1.0f;
  snapshot.synth_euclid.lanes[0].midi_note = 60.0f;
  snapshot.synth_euclid.lanes[0].hold_seconds = 0.12f;
  KesshoProductSourceSnapshot& running_endpoint_source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  running_endpoint_source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  running_endpoint_source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
  running_endpoint_source.morph = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "running Pad endpoint hot-swap snapshot load failed");
  renderSilentBlocks(engine, 60u);
  KesshoProductTelemetry running_before_telemetry = kessho_product_get_telemetry(engine);
  const KesshoProductDebugVoiceSpawn running_before_spawn = latestDebugVoiceSpawnForSource(
      running_before_telemetry,
      KESSHO_PRODUCT_SOURCE_PAD1,
      "running Pad endpoint hot-swap setup should produce sequencer triggers");
  KesshoProductEvent running_pad_endpoint_event{};
  running_pad_endpoint_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  running_pad_endpoint_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  running_pad_endpoint_event.index = 1u;
  running_pad_endpoint_event.value =
      static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT);
  require(
      kessho_product_enqueue_event(engine, &running_pad_endpoint_event) == KESSHO_PRODUCT_OK,
      "running Pad endpoint hot-swap event enqueue failed");
  renderSilentBlocks(engine, 60u);
  KesshoProductTelemetry running_after_telemetry = kessho_product_get_telemetry(engine);
  const KesshoProductDebugVoiceSpawn running_after_spawn = latestDebugVoiceSpawnForSource(
      running_after_telemetry,
      KESSHO_PRODUCT_SOURCE_PAD1,
      "running Pad endpoint hot-swap should keep producing sequencer triggers");
  require(
      running_after_spawn.trigger_sequence > running_before_spawn.trigger_sequence,
      "running Pad endpoint hot-swap should not stop sequencer triggers");
  require(
      running_after_spawn.source_state_hash != running_before_spawn.source_state_hash ||
          running_after_spawn.compiled_source_hash != running_before_spawn.compiled_source_hash,
      "running Pad endpoint hot-swap should change the next sequencer trigger source patch");
  require(
      engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].source_preset_a_id ==
          kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT,
      "running Pad endpoint hot-swap should update endpoint A state");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.schema_hash = 0;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH,
      "schema hash mismatch should be rejected");

  kessho_product_reset(engine);
  KesshoProductEvent bad_manual_target{};
  bad_manual_target.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  bad_manual_target.value = 60.0f;
  bad_manual_target.value2 = 0.8f;
  bad_manual_target.value3 = 0.2f;
  require(
      kessho_product_enqueue_event(engine, &bad_manual_target) == KESSHO_PRODUCT_ERROR_INVALID_SOURCE,
      "missing manual note target must be rejected");
  KesshoProductEvent bad_manual_velocity = bad_manual_target;
  bad_manual_velocity.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  bad_manual_velocity.value2 = 0.0f;
  require(
      kessho_product_enqueue_event(engine, &bad_manual_velocity) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "missing manual note velocity must be rejected");
  KesshoProductEvent bad_drum_target{};
  bad_drum_target.event_kind = KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE;
  bad_drum_target.target_id = 99u;
  bad_drum_target.value = 0.8f;
  require(
      kessho_product_enqueue_event(engine, &bad_drum_target) == KESSHO_PRODUCT_ERROR_INVALID_SOURCE,
      "unknown drum target must be rejected");
  KesshoProductEvent bad_param{};
  bad_param.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  bad_param.value = 0.5f;
  require(
      kessho_product_enqueue_event(engine, &bad_param) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "unknown product param must be rejected");
  KesshoProductEvent bad_sequencer_target{};
  bad_sequencer_target.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  bad_sequencer_target.target_id = 99u;
  bad_sequencer_target.index = 0u;
  bad_sequencer_target.param_id = 0u;
  bad_sequencer_target.value = 1.0f;
  bad_sequencer_target.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE;
  require(
      kessho_product_enqueue_event(engine, &bad_sequencer_target) == KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE,
      "unknown sequencer target must be rejected");
  KesshoProductEvent bad_unknown_command{};
  bad_unknown_command.event_kind = 999u;
  require(
      kessho_product_enqueue_event(engine, &bad_unknown_command) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "unknown product command must be rejected");

  snapshot = makeSnapshot();
  snapshot.drum_euclid.lanes[0].enabled = 1;
  snapshot.drum_euclid.lanes[0].step_count = 0;
  snapshot.drum_euclid.lanes[0].fill_count = 0;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) ==
          KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE,
      "empty enabled drum pattern must fail explicitly");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "manual render snapshot load failed");
  std::vector<float> left(128, 0.0f);
  std::vector<float> right(128, 0.0f);
  KesshoProductEvent drum_event{};
  drum_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE;
  drum_event.target_id = 1u;
  drum_event.value = 0.9f;
  require(kessho_product_enqueue_event(engine, &drum_event) == KESSHO_PRODUCT_OK, "drum trigger event enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(maxAbs(left) > 0.001f || maxAbs(right) > 0.001f, "manual drum trigger should render non-silence");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.transport.running = 0;
  snapshot.drum_euclid.lane_count = 0;
  snapshot.synth_euclid.lane_count = 1;
  snapshot.synth_euclid.lanes[0].enabled = 1;
  snapshot.synth_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  snapshot.synth_euclid.lanes[0].step_count = 16;
  snapshot.synth_euclid.lanes[0].fill_count = 1;
  snapshot.synth_euclid.lanes[0].manual_step_mask_low = 1u;
  snapshot.synth_euclid.lanes[0].clock_division = 16;
  snapshot.synth_euclid.lanes[0].bar_reset = 1;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "scheduled sequencer start snapshot load failed");
  KesshoProductEvent scheduled_start{};
  scheduled_start.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  scheduled_start.sample_offset = 64u;
  require(
      kessho_product_enqueue_event(engine, &scheduled_start) == KESSHO_PRODUCT_OK,
      "scheduled sequencer start enqueue failed");
  KesshoSequencerEvent scheduled_start_events[4]{};
  const int32_t scheduled_start_count =
      kessho_product_debug_render_events(engine, scheduled_start_events, 4, 128);
  require(scheduled_start_count > 0, "scheduled sequencer start should emit inside the current block");
  require(
      scheduled_start_events[0].sample_offset == scheduled_start.sample_offset,
      "scheduled sequencer start should preserve sample offset");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "MIDI snapshot load failed");
  KesshoProductEvent midi_note{};
  midi_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  midi_note.value = 0x90;
  midi_note.value2 = 64.0f;
  midi_note.value3 = 100.0f;
  midi_note.value4 = 100.0f / 127.0f;
  midi_note.flags = 3;
  require(kessho_product_enqueue_event(engine, &midi_note) == KESSHO_PRODUCT_OK, "MIDI note event enqueue failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(maxAbs(left) > 0.001f || maxAbs(right) > 0.001f, "MIDI note event should render through Product Core");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "MIDI lead tracking snapshot load failed");
  KesshoProductEvent midi_lead_a{};
  midi_lead_a.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_lead_a.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  midi_lead_a.index = 0u;
  midi_lead_a.value = 0x90;
  midi_lead_a.value2 = 60.0f;
  midi_lead_a.value3 = 100.0f;
  KesshoProductEvent midi_lead_b = midi_lead_a;
  midi_lead_b.value2 = 67.0f;
  require(kessho_product_enqueue_event(engine, &midi_lead_a) == KESSHO_PRODUCT_OK, "first MIDI lead note enqueue failed");
  require(kessho_product_enqueue_event(engine, &midi_lead_b) == KESSHO_PRODUCT_OK, "second MIDI lead note enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  const MidiNoteRuntimeSlot* first_lead_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 0u, 60u);
  const MidiNoteRuntimeSlot* second_lead_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 0u, 67u);
  require(first_lead_slot != nullptr, "first MIDI lead note should be tracked");
  require(second_lead_slot != nullptr, "second MIDI lead note should be tracked");
  require(first_lead_slot->lead_voice_index != kProductInvalidVoiceIndex, "first MIDI lead note should keep its module voice");
  require(second_lead_slot->lead_voice_index != kProductInvalidVoiceIndex, "second MIDI lead note should keep its module voice");
  require(first_lead_slot->lead_voice_index != second_lead_slot->lead_voice_index, "MIDI lead notes should keep distinct module voices");
  KesshoProductEvent midi_lead_off = midi_lead_a;
  midi_lead_off.value = 0x80;
  midi_lead_off.value3 = 0.0f;
  require(kessho_product_enqueue_event(engine, &midi_lead_off) == KESSHO_PRODUCT_OK, "MIDI lead note-off enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 0u, 60u) == nullptr, "MIDI lead note-off should release only the matching note");
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 0u, 67u) != nullptr, "MIDI lead note-off should not clear other held notes");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "MIDI controller snapshot load failed");
  KesshoProductEvent midi_lead_bend{};
  midi_lead_bend.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_lead_bend.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  midi_lead_bend.index = 0u;
  midi_lead_bend.value = 0xe0;
  midi_lead_bend.value2 = 127.0f;
  midi_lead_bend.value3 = 127.0f;
  require(kessho_product_enqueue_event(engine, &midi_lead_bend) == KESSHO_PRODUCT_OK, "MIDI pitch bend enqueue failed");
  require(kessho_product_enqueue_event(engine, &midi_lead_a) == KESSHO_PRODUCT_OK, "bent MIDI lead note enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(
      engine->midi_controller_state[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u][0u].pitch_bend == kProductMidiPitchBendMax,
      "Product core should retain MIDI pitch bend state");
  require(
      engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].post_lpf_tracking_midi > 61.9f,
      "MIDI pitch bend should apply to Product-owned note trigger pitch");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "MIDI pad tracking snapshot load failed");
  KesshoProductEvent midi_pad_a{};
  midi_pad_a.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_pad_a.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  midi_pad_a.index = 0u;
  midi_pad_a.value = 0x90;
  midi_pad_a.value2 = 60.0f;
  midi_pad_a.value3 = 100.0f;
  KesshoProductEvent midi_pad_b = midi_pad_a;
  midi_pad_b.value2 = 64.0f;
  require(kessho_product_enqueue_event(engine, &midi_pad_a) == KESSHO_PRODUCT_OK, "first MIDI pad note enqueue failed");
  require(kessho_product_enqueue_event(engine, &midi_pad_b) == KESSHO_PRODUCT_OK, "second MIDI pad note enqueue failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(engine, left.data(), right.data(), 128);
  const MidiNoteRuntimeSlot* first_pad_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, 60u);
  const MidiNoteRuntimeSlot* second_pad_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, 64u);
  require(first_pad_slot != nullptr, "first MIDI pad note should be tracked");
  require(second_pad_slot != nullptr, "second MIDI pad note should be tracked");
  require(countMidiSlots(engine, KESSHO_PRODUCT_SOURCE_PAD1) == 2u, "two MIDI pad notes should be tracked independently");
  require(first_pad_slot->pad_voice_index != second_pad_slot->pad_voice_index, "MIDI pad notes should keep distinct pad voices");
  KesshoProductEvent midi_pad_off{};
  midi_pad_off.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_pad_off.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  midi_pad_off.index = 0u;
  midi_pad_off.value = 0x80;
  midi_pad_off.value2 = 60.0f;
  midi_pad_off.value3 = 0.0f;
  require(kessho_product_enqueue_event(engine, &midi_pad_off) == KESSHO_PRODUCT_OK, "MIDI pad note-off enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, 60u) == nullptr, "MIDI pad note-off should release only the matching note");
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, 64u) != nullptr, "MIDI pad note-off should not clear other held notes");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1].asset_id = 1001;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "asset snapshot load failed");
  float sample_data[256]{};
  for (uint32_t i = 0; i < 256; ++i) {
    sample_data[i] = std::sin(static_cast<float>(i) * 0.1f) * 0.5f;
  }
  const float* channels[1] = {sample_data};
  require(
      kessho_product_register_asset_buffer(engine, 1001, channels, 1, 256, sample_rate, KESSHO_PRODUCT_ASSET_PIANO) ==
          KESSHO_PRODUCT_OK,
      "asset registration failed");
  KesshoProductEvent piano_event{};
  piano_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  piano_event.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  piano_event.value = 60.0f;
  piano_event.value2 = 0.9f;
  piano_event.value3 = 0.1f;
  require(kessho_product_enqueue_event(engine, &piano_event) == KESSHO_PRODUCT_OK, "piano note event enqueue failed");
  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(maxAbs(left) > 0.001f || maxAbs(right) > 0.001f, "registered piano asset should render through Product Core");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  const uint32_t midi_piano_asset_id = kPianoAssetIdBase + (60u - kPianoBaseMidi) + 1u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1].asset_id = midi_piano_asset_id;
  snapshot.synth_euclid.lane_count = 0;
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "MIDI piano tracking snapshot load failed");
  std::vector<float> long_piano_sample(48000, 0.0f);
  for (uint32_t i = 0; i < long_piano_sample.size(); ++i) {
    long_piano_sample[i] = std::sin(static_cast<float>(i) * 0.03f) * 0.5f;
  }
  const float* long_piano_channels[1] = {long_piano_sample.data()};
  require(
      kessho_product_register_asset_buffer(
          engine,
          midi_piano_asset_id,
          long_piano_channels,
          1,
          static_cast<uint32_t>(long_piano_sample.size()),
          sample_rate,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "MIDI piano asset registration failed");
  KesshoProductEvent midi_piano_a{};
  midi_piano_a.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_piano_a.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  midi_piano_a.index = 4u;
  midi_piano_a.value = 0x90;
  midi_piano_a.value2 = 60.0f;
  midi_piano_a.value3 = 100.0f;
  KesshoProductEvent midi_piano_b = midi_piano_a;
  midi_piano_b.value2 = 64.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_a) == KESSHO_PRODUCT_OK, "first MIDI piano note enqueue failed");
  require(kessho_product_enqueue_event(engine, &midi_piano_b) == KESSHO_PRODUCT_OK, "second MIDI piano note enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  const MidiNoteRuntimeSlot* first_piano_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 60u);
  const MidiNoteRuntimeSlot* second_piano_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 64u);
  require(first_piano_slot != nullptr, "first MIDI piano note should be tracked");
  require(second_piano_slot != nullptr, "second MIDI piano note should be tracked");
  const uint32_t first_piano_voice = first_piano_slot->sample_voice_index;
  const uint32_t second_piano_voice = second_piano_slot->sample_voice_index;
  require(first_piano_voice != second_piano_voice, "MIDI piano notes should keep distinct sample voices");
  const float first_piano_frequency_before_bend = engine->voices[first_piano_voice].frequency;
  const double first_piano_step_before_bend = engine->voices[first_piano_voice].sample_step;
  KesshoProductEvent midi_piano_bend = midi_piano_a;
  midi_piano_bend.value = 0xe0;
  midi_piano_bend.value2 = 127.0f;
  midi_piano_bend.value3 = 127.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_bend) == KESSHO_PRODUCT_OK, "MIDI piano pitch bend enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(
      engine->midi_controller_state[KESSHO_PRODUCT_SOURCE_PIANO - 1u][4u].pitch_bend == kProductMidiPitchBendMax,
      "Product core should retain MIDI piano pitch bend state");
  require(
      engine->voices[first_piano_voice].frequency > first_piano_frequency_before_bend * 1.11f,
      "MIDI pitch bend should retune held piano sample voices");
  require(
      engine->voices[first_piano_voice].sample_step > first_piano_step_before_bend * 1.11,
      "MIDI pitch bend should update held piano sample playback step");
  midi_piano_bend.value2 = 0.0f;
  midi_piano_bend.value3 = 64.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_bend) == KESSHO_PRODUCT_OK, "MIDI piano pitch bend reset enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  const uint32_t second_remaining_before = engine->voices[second_piano_voice].remaining_frames;
  KesshoProductEvent midi_piano_off = midi_piano_a;
  midi_piano_off.value = 0x80;
  midi_piano_off.value3 = 0.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_off) == KESSHO_PRODUCT_OK, "MIDI piano note-off enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 60u) == nullptr, "MIDI piano note-off should release only the matching note");
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 64u) != nullptr, "MIDI piano note-off should preserve other held notes");
  require(engine->voices[first_piano_voice].remaining_frames <= static_cast<uint32_t>(0.02 * sample_rate), "released MIDI piano voice should enter release tail");
  require(
      engine->voices[second_piano_voice].remaining_frames + 128u >= second_remaining_before,
      "unreleased MIDI piano voice should not be source-wide shortened");

  KesshoProductEvent midi_sustain{};
  midi_sustain.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_sustain.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  midi_sustain.index = 4u;
  midi_sustain.value = 0xb0;
  midi_sustain.value2 = 64.0f;
  midi_sustain.value3 = 127.0f;
  require(kessho_product_enqueue_event(engine, &midi_sustain) == KESSHO_PRODUCT_OK, "MIDI sustain down enqueue failed");
  KesshoProductEvent midi_piano_c = midi_piano_a;
  midi_piano_c.value2 = 67.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_c) == KESSHO_PRODUCT_OK, "sustained MIDI piano note enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  const MidiNoteRuntimeSlot* sustained_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 67u);
  require(sustained_slot != nullptr, "sustained MIDI piano note should be tracked");
  const uint32_t sustained_voice = sustained_slot->sample_voice_index;
  const uint32_t sustained_remaining_before = engine->voices[sustained_voice].remaining_frames;
  KesshoProductEvent midi_piano_c_off = midi_piano_c;
  midi_piano_c_off.value = 0x80;
  midi_piano_c_off.value3 = 0.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_c_off) == KESSHO_PRODUCT_OK, "sustained MIDI piano note-off enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  sustained_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 67u);
  require(sustained_slot != nullptr && sustained_slot->sustained, "sustain pedal should defer MIDI piano release");
  require(
      engine->voices[sustained_voice].remaining_frames + 128u >= sustained_remaining_before,
      "sustain-held MIDI piano voice should not be shortened on note-off");
  midi_sustain.value3 = 0.0f;
  require(kessho_product_enqueue_event(engine, &midi_sustain) == KESSHO_PRODUCT_OK, "MIDI sustain up enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 67u) == nullptr, "sustain up should release deferred MIDI piano note");
  require(engine->voices[sustained_voice].remaining_frames <= static_cast<uint32_t>(0.02 * sample_rate), "sustain-up MIDI piano voice should enter release tail");

  KesshoProductEvent midi_expression{};
  midi_expression.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_expression.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  midi_expression.index = 4u;
  midi_expression.value = 0xb0;
  midi_expression.value2 = 11.0f;
  midi_expression.value3 = 64.0f;
  KesshoProductEvent midi_channel_pressure{};
  midi_channel_pressure.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_channel_pressure.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  midi_channel_pressure.index = 4u;
  midi_channel_pressure.value = 0xd0;
  midi_channel_pressure.value2 = 32.0f;
  KesshoProductEvent midi_poly_pressure{};
  midi_poly_pressure.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
  midi_poly_pressure.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  midi_poly_pressure.index = 4u;
  midi_poly_pressure.value = 0xa0;
  midi_poly_pressure.value2 = 72.0f;
  midi_poly_pressure.value3 = 48.0f;
  require(kessho_product_enqueue_event(engine, &midi_expression) == KESSHO_PRODUCT_OK, "MIDI expression enqueue failed");
  require(kessho_product_enqueue_event(engine, &midi_channel_pressure) == KESSHO_PRODUCT_OK, "MIDI channel pressure enqueue failed");
  require(kessho_product_enqueue_event(engine, &midi_poly_pressure) == KESSHO_PRODUCT_OK, "MIDI poly pressure enqueue failed");
  KesshoProductEvent midi_piano_d = midi_piano_a;
  midi_piano_d.value2 = 72.0f;
  require(kessho_product_enqueue_event(engine, &midi_piano_d) == KESSHO_PRODUCT_OK, "controller-scaled MIDI piano note enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  const MidiControllerRuntimeState& piano_midi_state = engine->midi_controller_state[KESSHO_PRODUCT_SOURCE_PIANO - 1u][4u];
  require(piano_midi_state.cc_values[11] == 64u, "Product core should retain MIDI expression CC state");
  require(piano_midi_state.channel_pressure == 32u, "Product core should retain MIDI channel pressure state");
  require(piano_midi_state.poly_pressure[72] == 48u, "Product core should retain MIDI poly pressure state");
  const MidiNoteRuntimeSlot* controller_scaled_slot = findMidiSlot(engine, KESSHO_PRODUCT_SOURCE_PIANO, 4u, 72u);
  require(controller_scaled_slot != nullptr, "controller-scaled MIDI piano note should be tracked");
  require(
      engine->voices[controller_scaled_slot->sample_voice_index].amplitude < 0.5f,
      "MIDI expression CC should scale Product-owned trigger velocity");

  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.schema_hash == KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH, "telemetry schema hash mismatch");
  require(telemetry.active_assets >= 1, "telemetry active asset count mismatch");

  kessho_product_destroy(engine);
  std::cout << "Kessho Product Core tests passed\n";
  return 0;
}
