#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "../src/product/KesshoProductEngineInternal.h"

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

void applySourceDefaults(KesshoProductSnapshotV2& snapshot) {
  for (uint32_t i = 0; i < 7; ++i) {
    const uint32_t source_id = i + 1u;
    KesshoProductSourceSnapshot& source = snapshot.sources[i];
    source.source_id = source_id;
    source.preset_id = defaultSourcePresetId(source_id);
    const auto patch = sourcePresetPatch(findSourcePreset(source.preset_id));
    if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
      source.exact_pad_param_count = patch.exact_pad_param_count;
      for (uint32_t param_index = 0; param_index < source.exact_pad_param_count; ++param_index) {
        source.exact_pad_params[param_index] = patch.exact_pad_params[param_index];
      }
    }
    if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
      source.exact_lead_param_count = patch.exact_lead_param_count;
      for (uint32_t param_index = 0; param_index < source.exact_lead_param_count; ++param_index) {
        source.exact_lead_params[param_index] = patch.exact_lead_params[param_index];
      }
    }
  }
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
      lane.morph_override_set_low != 0u ||
      lane.morph_override_set_high != 0u ||
      lane.distance_override_set_low != 0u ||
      lane.distance_override_set_high != 0u;
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
  require(actual.morph_override_set_low == expected.morph_override_set_low, message);
  require(actual.morph_override_set_high == expected.morph_override_set_high, message);
  require(actual.distance_override_set_low == expected.distance_override_set_low, message);
  require(actual.distance_override_set_high == expected.distance_override_set_high, message);
  for (uint32_t i = 0; i < 64u; ++i) {
    require(std::fabs(actual.probability_overrides[i] - expected.probability_overrides[i]) < 0.000001f, message);
    require(actual.ratchet_overrides[i] == expected.ratchet_overrides[i], message);
    require(actual.trig_condition_numerators[i] == expected.trig_condition_numerators[i], message);
    require(actual.trig_condition_denominators[i] == expected.trig_condition_denominators[i], message);
    require(std::fabs(actual.midi_note_overrides[i] - expected.midi_note_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.expression_overrides[i] - expected.expression_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.morph_overrides[i] - expected.morph_overrides[i]) < 0.000001f, message);
    require(std::fabs(actual.distance_overrides[i] - expected.distance_overrides[i]) < 0.000001f, message);
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
    float value3 = 0.0f) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  event.target_id = target_id;
  event.index = lane_index;
  event.param_id = step;
  event.value = value;
  event.value2 = value2;
  event.value3 = value3;
  event.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | field;
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
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
          lane.expression_overrides[step]);
    }
    if (maskHas(lane.morph_override_set_low, lane.morph_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_MORPH,
          lane.morph_overrides[step]);
    }
    if (maskHas(lane.distance_override_set_low, lane.distance_override_set_high, step)) {
      enqueueSequencerStep(
          engine,
          target_id,
          lane_index,
          step,
          KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
          lane.distance_overrides[step]);
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

void requireDirectSequencerCoverage() {
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
  expectOffsets(direct_events.events, direct_events.count, {0, 24000, 48000, 72000});

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

} // namespace

int main() {
  requireDirectSequencerCoverage();

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
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 24000, 48000, 72000});
  require(events[0].source_id == KESSHO_PRODUCT_SOURCE_PAD1, "synth event source mismatch");
  require(events[1].source_id == KESSHO_PRODUCT_SOURCE_DRUM, "drum event source mismatch");
  KesshoProductTelemetry loop_telemetry = kessho_product_get_telemetry(engine);
  require(loop_telemetry.transport_running == 1, "transport should remain running after first sequencer pass");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "64-step loop product snapshot should load");
  KesshoSequencerEvent loop_events[64]{};
  event_count = kessho_product_debug_render_events(engine, loop_events, 64, 384000);
  require(event_count == 32, "16-step synth plus drum pattern should loop for 64 steps");
  expectOffsets(loop_events, static_cast<uint32_t>(event_count), {0, 24000, 48000, 72000, 96000, 120000, 144000, 168000});
  loop_telemetry = kessho_product_get_telemetry(engine);
  require(loop_telemetry.transport_running == 1, "transport should keep running through a 64-step sequencer render");

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
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 8, "SetSequencerLane should update step count, fill, and clock division");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 12000, 24000, 36000, 48000, 60000, 72000, 84000});
  require(events[0].source_id == KESSHO_PRODUCT_SOURCE_LEAD1, "SetSequencerLane target source did not affect events");
  require(std::fabs(events[0].midi_note - 72.0f) < 0.001f, "SetSequencerLane MIDI note did not affect events");
  require(events[0].velocity >= 0.49f && events[0].velocity <= 0.51f, "SetSequencerLane velocity did not affect events");
  require(events[0].hold_seconds >= 0.249f && events[0].hold_seconds <= 0.251f, "SetSequencerLane hold did not affect events");

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
  mute_step.param_id = 0;
  mute_step.value = 0.0f;
  mute_step.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE;
  require(kessho_product_enqueue_event(engine, &mute_step) == KESSHO_PRODUCT_OK, "sequencer mute-step enqueue failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "step toggle overrides should add and mute C++ sequencer hits");
  expectOffsets(events, static_cast<uint32_t>(event_count), {6000, 24000, 48000, 72000});
  require(!hasOffset(events, static_cast<uint32_t>(event_count), 0), "muted step override should suppress the base Euclid hit");

  kessho_product_reset(engine);
  snapshot = makeSnapshot();
  snapshot.drum_euclid.lane_count = 0;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "dice snapshot load failed");
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 4, "home synth lane should generate one bar of base Euclid hits");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 24000, 48000, 72000});
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
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 24000, 48000, 72000});
  require(std::fabs(events[0].midi_note - 60.0f) < 0.001f, "sequencer reset-home should clear pitch dice overrides");
  const LaneState reset_home_lane_state = engine->synth_lanes[0];
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
  auto enqueue_step_value = [&](uint32_t step, uint32_t field, float value, float value2 = 0.0f) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
    event.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    event.index = 0;
    event.param_id = step;
    event.value = value;
    event.value2 = value2;
    event.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | field;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "sequencer step-value enqueue failed");
  };
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, 72.0f);
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, 0.4f);
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_MORPH, 0.6f);
  enqueue_step_value(0, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, 0.7f);
  enqueue_step_value(4, KESSHO_PRODUCT_STEP_FIELD_RATCHET, 2.0f);
  enqueue_step_value(8, KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION, 2.0f, 2.0f);
  enqueue_step_value(12, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, 0.0f);
  event_count = kessho_product_debug_render_events(engine, events, 32, 96000);
  require(event_count == 3, "step value overrides should affect probability, ratchet, and trig conditions");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 24000, 27000});
  require(!hasOffset(events, static_cast<uint32_t>(event_count), 48000), "step trig condition should suppress first-bar 2:2 hit");
  require(!hasOffset(events, static_cast<uint32_t>(event_count), 72000), "step probability should suppress probability-zero hit");
  require(std::fabs(events[0].midi_note - 72.0f) < 0.001f, "step MIDI override did not affect event pitch");
  require(events[0].expression >= 0.39f && events[0].expression <= 0.41f, "step expression override did not affect event expression");
  require(events[0].morph >= 0.59f && events[0].morph <= 0.61f, "step morph override did not affect event morph");
  require(events[0].distance >= 0.69f && events[0].distance <= 0.71f, "step distance override did not affect event distance");

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
  require(saw_synth_expression_range, "source sample-hold range did not affect sequencer event expression");
  require(saw_drum_morph_range, "drum morph range did not affect sequencer event morph");

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
  event_count = kessho_product_debug_render_events(engine, events, 32, 6000);
  require(event_count == 3, "ratchet 3 should generate three events in one 16th step");
  expectOffsets(events, static_cast<uint32_t>(event_count), {0, 2000, 4000});

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

  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.schema_hash == KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH, "telemetry schema hash mismatch");
  require(telemetry.active_assets == 1, "telemetry active asset count mismatch");

  kessho_product_destroy(engine);
  std::cout << "Kessho Product Core tests passed\n";
  return 0;
}
