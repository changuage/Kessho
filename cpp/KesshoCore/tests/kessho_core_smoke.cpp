#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoCore.h"
#include "kessho_drum.h"
#include "kessho_dynamics_character.h"
#include "kessho_dynamics_degrade.h"
#include "kessho_granular.h"
#include "kessho_lead_fm.h"
#include "kessho_pad.h"
#include "kessho_reverb.h"
#include "kessho_soundscapes.h"
#include "kessho_spectral_freeze.h"

namespace {

constexpr int kLeadFmParamCount = 80;
constexpr int kLeadFmParamRelease = 46;
constexpr int kLeadFmParamOutputSelect = 79;
constexpr int kPadParamCount = 108;
constexpr int kPadParamAttack = 33;
constexpr int kPadParamRelease = 36;
constexpr int kPadParamLevel = 52;
constexpr int kPadParamReverbSend = 106;
constexpr int kPadParamOutputSelect = 107;
constexpr int kDrumParamCount = 126;
constexpr int kDrumParamReverbSend = 123;
constexpr int kDrumParamOutputSelect = 125;
constexpr int kSoundscapesParamCount = 96;
constexpr int kSoundscapesParamWaterActive = 0;
constexpr int kSoundscapesParamWaterPreset = 1;
constexpr int kSoundscapesParamWaterLayerMix = 23;
constexpr int kSoundscapesParamWaterLayerDensity = 29;
constexpr int kSoundscapesParamInsectsActive = 61;
constexpr int kSoundscapesParamInsectsEngine = 62;
constexpr int kGranularParamCount = 199;
constexpr int kSoundscapesParamOutputSelect = 95;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "KesshoCore smoke test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(double actual, double expected, double tolerance, const char* message) {
  require(std::fabs(actual - expected) <= tolerance, message);
}

bool allZero(const std::vector<float>& values) {
  for (float value : values) {
    if (value != 0.0f) {
      return false;
    }
  }

  return true;
}

float maxAbs(const std::vector<float>& values) {
  float peak = 0.0f;
  for (float value : values) {
    require(std::isfinite(value), "render produced a non-finite sample");
    peak = std::max(peak, std::fabs(value));
  }

  return peak;
}

float maxAbsRange(const std::vector<float>& values, size_t start, size_t end) {
  float peak = 0.0f;
  for (size_t i = start; i < end && i < values.size(); ++i) {
    const float value = values[i];
    require(std::isfinite(value), "render produced a non-finite sample");
    peak = std::max(peak, std::fabs(value));
  }

  return peak;
}

float diffRms(const std::vector<float>& a, const std::vector<float>& b) {
  require(a.size() == b.size(), "diffRms inputs must match");
  double sum = 0.0;
  for (size_t i = 0; i < a.size(); ++i) {
    const double diff = static_cast<double>(a[i]) - static_cast<double>(b[i]);
    sum += diff * diff;
  }

  return static_cast<float>(std::sqrt(sum / static_cast<double>(a.size())));
}

} // namespace

int main() {
  constexpr double sample_rate = 48000.0;
  constexpr int block_size = 128;

  require(kessho_create(0.0, block_size) == nullptr, "invalid sample rate should fail");
  require(kessho_create(sample_rate, 0) == nullptr, "invalid block size should fail");

  KesshoEngine* engine = kessho_create(sample_rate, block_size);
  require(engine != nullptr, "engine create returned null");
  require(kessho_get_sample_rate(engine) == sample_rate, "sample rate getter mismatch");
  require(kessho_get_max_block_size(engine) == block_size, "block size getter mismatch");
  require(kessho_is_running(engine) == 0, "new engine should be stopped");

  std::vector<float> left(block_size, 1.0f);
  std::vector<float> right(block_size, 1.0f);
  kessho_render(engine, left.data(), right.data(), block_size);
  require(allZero(left) && allZero(right), "stopped render must produce silence");
  require(kessho_get_sample_frame(engine) == 0, "stopped render must not advance transport");

  kessho_start(engine);
  require(kessho_is_running(engine) == 1, "start should mark engine running");
  kessho_render(engine, left.data(), right.data(), block_size);
  require(allZero(left) && allZero(right), "default running render must remain silent");
  require(kessho_get_sample_frame(engine) == block_size, "running silence should advance transport");

  require(kessho_set_render_mode(engine, KESSHO_RENDER_SMOKE_SINE) == 1, "failed to enable smoke sine mode");
  require(kessho_set_render_mode(engine, 999) == 0, "invalid render mode should be rejected");
  kessho_set_smoke_tone(engine, 440.0f, 0.2f);

  KesshoCoreSnapshotV1 snapshot{};
  require(kessho_get_abi_version() == KESSHO_CORE_ABI_VERSION, "ABI version getter mismatch");

  snapshot.version = KESSHO_CORE_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_CORE_SNAPSHOT_SCHEMA_HASH;
  snapshot.bpm = 120.0f;
  snapshot.master_gain = 1.0f;
  snapshot.render_mode = KESSHO_RENDER_SMOKE_SINE;
  snapshot.smoke_frequency_hz = 440.0f;
  snapshot.smoke_amplitude = 0.2f;
  snapshot.flags = 0;
  snapshot.beats_per_bar = 4;
  snapshot.bars_per_phrase = 4;
  snapshot.seed = 42;
  require(kessho_apply_snapshot_v1(engine, &snapshot) == 1, "valid snapshot should apply");
  require(kessho_get_seed(engine) == 42, "snapshot seed should apply");
  snapshot.version = 999;
  require(kessho_apply_snapshot_v1(engine, &snapshot) == 0, "invalid snapshot version should be rejected");

  kessho_reset(engine);
  kessho_start(engine);
  std::vector<float> first_left(block_size);
  std::vector<float> first_right(block_size);
  kessho_render(engine, first_left.data(), first_right.data(), block_size);
  require(maxAbs(first_left) > 0.05f, "smoke sine should produce non-zero output");
  require(maxAbs(first_left) <= 0.201f, "smoke sine exceeded configured amplitude");
  require(diffRms(first_left, first_right) < 1.0e-8f, "smoke sine should be mono-identical");

  kessho_reset(engine);
  kessho_start(engine);
  std::vector<float> repeat_left(block_size);
  std::vector<float> repeat_right(block_size);
  kessho_render(engine, repeat_left.data(), repeat_right.data(), block_size);
  require(diffRms(first_left, repeat_left) < 1.0e-8f, "reset smoke render should be deterministic");
  require(diffRms(first_right, repeat_right) < 1.0e-8f, "reset right render should be deterministic");

  KesshoCoreStats stats{};
  require(kessho_get_stats(engine, &stats) == 1, "stats call failed");
  require(stats.sample_frame == block_size, "stats sample frame mismatch");
  require(stats.running == 1, "stats running flag mismatch");
  require(stats.render_mode == KESSHO_RENDER_SMOKE_SINE, "stats render mode mismatch");

  kessho_set_seed(engine, 12345);
  const float random_a = kessho_next_random_float(engine);
  const float random_b = kessho_next_random_float(engine);
  require(random_a >= 0.0f && random_a < 1.0f, "first random value out of range");
  require(random_b >= 0.0f && random_b < 1.0f, "second random value out of range");
  require(random_a != random_b, "random sequence should advance");
  kessho_set_seed(engine, 12345);
  requireNear(kessho_next_random_float(engine), random_a, 1.0e-8, "seeded random sequence should repeat");
  requireNear(kessho_next_random_float(engine), random_b, 1.0e-8, "seeded random sequence second value should repeat");

  kessho_reset(engine);
  kessho_start(engine);
  int frames_remaining = 24000;
  while (frames_remaining > 0) {
    const int frames = std::min(block_size, frames_remaining);
    kessho_render(engine, left.data(), right.data(), frames);
    frames_remaining -= frames;
  }
  KesshoTransportInfo transport_info{};
  require(kessho_get_transport_info(engine, &transport_info) == 1, "transport info call failed");
  require(transport_info.sample_frame == 24000, "transport info sample frame mismatch");
  require(transport_info.beat_index == 1, "transport beat index mismatch");
  require(transport_info.bar_index == 0, "transport bar index mismatch");
  require(transport_info.phrase_index == 0, "transport phrase index mismatch");
  requireNear(transport_info.beat_phase, 0.0, 1.0e-9, "transport beat phase mismatch");
  requireNear(transport_info.bar_phase, 0.25, 1.0e-9, "transport bar phase mismatch");
  requireNear(transport_info.phrase_phase, 0.0625, 1.0e-9, "transport phrase phase mismatch");
  require(transport_info.seed == 12345, "transport info seed mismatch");

  KesshoParamEvent mute_event{};
  mute_event.sample_offset = block_size / 2;
  mute_event.param_id = KESSHO_PARAM_SMOKE_AMPLITUDE;
  mute_event.value = 0.0f;
  mute_event.ramp_frames = 0;
  require(kessho_push_param_event(engine, &mute_event) == 1, "failed to push sample-offset param event");
  require(kessho_get_event_queue_depth(engine) == 1, "param event queue depth mismatch");

  kessho_reset(engine);
  kessho_start(engine);
  std::vector<float> event_left(block_size);
  std::vector<float> event_right(block_size);
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(kessho_get_event_queue_depth(engine) == 0, "param event should be consumed");
  require(maxAbsRange(event_left, 0, block_size / 2) > 0.05f, "param event fired too early");
  require(maxAbsRange(event_left, block_size / 2, block_size) == 0.0f, "sample-offset mute event did not apply exactly");

  KesshoParamEvent future_event{};
  future_event.sample_offset = block_size + 8;
  future_event.param_id = KESSHO_PARAM_SMOKE_AMPLITUDE;
  future_event.value = 0.2f;
  future_event.ramp_frames = 0;
  require(kessho_push_param_event(engine, &future_event) == 1, "failed to push future param event");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(kessho_get_event_queue_depth(engine) == 1, "future param event should remain queued");
  kessho_render(engine, event_left.data(), event_right.data(), 9);
  require(kessho_get_event_queue_depth(engine) == 0, "future param event should fire in the next block");
  require(maxAbsRange(event_left, 0, 9) > 0.0f, "future param event did not restore amplitude");

  KesshoParamEvent same_offset_a{};
  same_offset_a.sample_offset = 0;
  same_offset_a.param_id = KESSHO_PARAM_SMOKE_AMPLITUDE;
  same_offset_a.value = 0.2f;
  KesshoParamEvent same_offset_b = same_offset_a;
  same_offset_b.value = 0.0f;
  kessho_reset(engine);
  kessho_start(engine);
  require(kessho_push_param_event(engine, &same_offset_a) == 1, "failed to push same-offset param event A");
  require(kessho_push_param_event(engine, &same_offset_b) == 1, "failed to push same-offset param event B");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(maxAbs(event_left) == 0.0f, "same-offset param events did not preserve insertion ordering");

  kessho_reset(engine);
  kessho_start(engine);
  require(kessho_push_param_event(engine, &same_offset_b) == 1, "failed to push reverse same-offset event B");
  require(kessho_push_param_event(engine, &same_offset_a) == 1, "failed to push reverse same-offset event A");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(maxAbs(event_left) > 0.05f, "reverse same-offset param events did not preserve insertion ordering");

  KesshoMidiEvent midi_event{};
  midi_event.sample_offset = 4;
  midi_event.source_id = 7;
  midi_event.status = 0x90;
  midi_event.channel = 1;
  midi_event.data1 = 60;
  midi_event.data2 = 100;
  midi_event.normalized_value = 100.0f / 127.0f;
  midi_event.raw_size = 3;
  midi_event.raw_bytes[0] = 0x90;
  midi_event.raw_bytes[1] = 60;
  midi_event.raw_bytes[2] = 100;
  require(kessho_push_midi_event(engine, &midi_event) == 1, "failed to push MIDI event");
  const uint32_t midi_before = kessho_get_midi_events_processed(engine);
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(
      kessho_get_midi_events_processed(engine) == midi_before + 1,
      "MIDI event was not processed at its sample offset");

  KesshoMidiEvent future_midi_event = midi_event;
  future_midi_event.sample_offset = block_size + 5;
  future_midi_event.raw_size = KESSHO_CORE_MIDI_RAW_BYTES + 4;
  for (uint8_t i = 0; i < KESSHO_CORE_MIDI_RAW_BYTES; ++i) {
    future_midi_event.raw_bytes[i] = i;
  }
  const uint32_t midi_after_immediate = kessho_get_midi_events_processed(engine);
  require(kessho_push_midi_event(engine, &future_midi_event) == 1, "failed to push future MIDI event");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(
      kessho_get_midi_events_processed(engine) == midi_after_immediate,
      "future MIDI event fired before its carried offset");
  require(kessho_get_event_queue_depth(engine) == 1, "future MIDI event should remain queued");
  kessho_render(engine, event_left.data(), event_right.data(), 6);
  require(
      kessho_get_midi_events_processed(engine) == midi_after_immediate + 1,
      "future MIDI event did not fire after block carry-over");
  require(kessho_get_event_queue_depth(engine) == 0, "future MIDI event should be consumed");

  KesshoTransportEvent invalid_transport_event{};
  invalid_transport_event.sample_offset = 0;
  invalid_transport_event.command = 999;
  require(
      kessho_push_transport_event(engine, &invalid_transport_event) == 0,
      "invalid transport command should be rejected");

  KesshoTransportEvent start_event{};
  start_event.sample_offset = block_size / 4;
  start_event.command = KESSHO_TRANSPORT_START;
  kessho_reset(engine);
  kessho_stop(engine);
  require(kessho_push_transport_event(engine, &start_event) == 1, "failed to push transport start event");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(kessho_is_running(engine) == 1, "transport start event did not start engine");
  require(
      kessho_get_sample_frame(engine) == static_cast<uint64_t>(block_size - start_event.sample_offset),
      "transport start event did not advance only post-start frames");
  require(maxAbsRange(event_left, 0, start_event.sample_offset) == 0.0f, "transport start event fired too early");
  require(
      maxAbsRange(event_left, start_event.sample_offset, block_size) > 0.05f,
      "transport start event did not render post-start signal");

  KesshoTransportEvent stop_event{};
  stop_event.sample_offset = (block_size * 3) / 4;
  stop_event.command = KESSHO_TRANSPORT_STOP;
  kessho_reset(engine);
  kessho_start(engine);
  require(kessho_push_transport_event(engine, &stop_event) == 1, "failed to push transport stop event");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(kessho_is_running(engine) == 0, "transport stop event did not stop engine");
  require(
      kessho_get_sample_frame(engine) == static_cast<uint64_t>(stop_event.sample_offset),
      "transport stop event did not advance only pre-stop frames");
  require(maxAbsRange(event_left, 0, stop_event.sample_offset) > 0.05f, "transport stop event fired too early");
  require(
      maxAbsRange(event_left, stop_event.sample_offset, block_size) == 0.0f,
      "transport stop event did not silence post-stop frames");

  KesshoTransportEvent reset_event{};
  reset_event.sample_offset = block_size / 2;
  reset_event.command = KESSHO_TRANSPORT_RESET;
  kessho_reset(engine);
  kessho_start(engine);
  require(kessho_push_transport_event(engine, &reset_event) == 1, "failed to push transport reset event");
  kessho_render(engine, event_left.data(), event_right.data(), block_size);
  require(kessho_is_running(engine) == 1, "transport reset event should leave engine running");
  require(
      kessho_get_sample_frame(engine) == static_cast<uint64_t>(block_size - reset_event.sample_offset),
      "transport reset event did not restart sample frame at its sample offset");
  require(maxAbsRange(event_left, 0, reset_event.sample_offset) > 0.05f, "transport reset pre-roll missing");
  require(
      maxAbsRange(event_left, reset_event.sample_offset, block_size) > 0.05f,
      "transport reset post-roll missing");

  KesshoMixer* mixer = kessho_mixer_create();
  require(mixer != nullptr, "mixer create returned null");
  KesshoMixerRoute mixer_route{};
  mixer_route.source_bus = 0;
  mixer_route.target_bus = 0;
  mixer_route.gain_l = 0.5f;
  mixer_route.gain_r = 0.25f;
  mixer_route.enabled = 1;
  require(kessho_mixer_set_route(mixer, 0, &mixer_route) == 1, "mixer route 0 should be accepted");
  mixer_route.source_bus = 1;
  mixer_route.target_bus = 0;
  mixer_route.gain_l = 2.0f;
  mixer_route.gain_r = -0.5f;
  require(kessho_mixer_set_route(mixer, 1, &mixer_route) == 1, "mixer route 1 should be accepted");
  mixer_route.source_bus = 0;
  mixer_route.target_bus = 1;
  mixer_route.gain_l = -0.25f;
  mixer_route.gain_r = 0.1f;
  require(kessho_mixer_set_route(mixer, 2, &mixer_route) == 1, "mixer route 2 should be accepted");
  mixer_route.source_bus = 1;
  mixer_route.target_bus = 2;
  mixer_route.gain_l = 99.0f;
  mixer_route.gain_r = 99.0f;
  mixer_route.enabled = 0;
  require(kessho_mixer_set_route(mixer, 4, &mixer_route) == 1, "disabled mixer route should be accepted");
  require(kessho_mixer_set_route(mixer, KESSHO_MIXER_MAX_ROUTES, &mixer_route) == 0, "out-of-range mixer route should fail");
  mixer_route.source_bus = KESSHO_MIXER_MAX_INPUT_BUSES;
  mixer_route.target_bus = 0;
  require(kessho_mixer_set_route(mixer, 3, &mixer_route) == 0, "out-of-range mixer source should fail");

  KesshoMixerStats mixer_stats{};
  require(kessho_mixer_get_stats(mixer, &mixer_stats) == 1, "mixer stats call failed");
  require(mixer_stats.route_slots == 5, "mixer route slots mismatch");
  require(mixer_stats.active_routes == 3, "mixer active route count mismatch");

  KesshoMixerRoute stored_route{};
  require(kessho_mixer_get_route(mixer, 2, &stored_route) == 1, "mixer get route failed");
  require(stored_route.source_bus == 0 && stored_route.target_bus == 1, "mixer stored route mismatch");

  constexpr int mixer_frames = 4;
  const std::vector<float> mixer_in0_l{1.0f, 2.0f, 3.0f, 4.0f};
  const std::vector<float> mixer_in0_r{10.0f, 20.0f, 30.0f, 40.0f};
  const std::vector<float> mixer_in1_l{0.5f, -0.5f, 1.5f, -1.5f};
  const std::vector<float> mixer_in1_r{2.0f, 4.0f, 6.0f, 8.0f};
  const float* mixer_inputs_l[] = {mixer_in0_l.data(), mixer_in1_l.data()};
  const float* mixer_inputs_r[] = {mixer_in0_r.data(), mixer_in1_r.data()};
  std::vector<float> mixer_out0_l(mixer_frames, 99.0f);
  std::vector<float> mixer_out0_r(mixer_frames, 99.0f);
  std::vector<float> mixer_out1_l(mixer_frames, 99.0f);
  std::vector<float> mixer_out1_r(mixer_frames, 99.0f);
  std::vector<float> mixer_out2_l(mixer_frames, 99.0f);
  std::vector<float> mixer_out2_r(mixer_frames, 99.0f);
  float* mixer_outputs_l[] = {mixer_out0_l.data(), mixer_out1_l.data(), mixer_out2_l.data()};
  float* mixer_outputs_r[] = {mixer_out0_r.data(), mixer_out1_r.data(), mixer_out2_r.data()};
  require(
      kessho_mixer_process_planar_stereo(
          mixer,
          mixer_inputs_l,
          mixer_inputs_r,
          2,
          mixer_outputs_l,
          mixer_outputs_r,
          3,
          mixer_frames) == 1,
      "mixer planar process failed");

  for (int i = 0; i < mixer_frames; ++i) {
    requireNear(
        mixer_out0_l[i],
        mixer_in0_l[i] * 0.5f + mixer_in1_l[i] * 2.0f,
        1.0e-6,
        "mixer main left mix mismatch");
    requireNear(
        mixer_out0_r[i],
        mixer_in0_r[i] * 0.25f + mixer_in1_r[i] * -0.5f,
        1.0e-6,
        "mixer main right mix mismatch");
    requireNear(mixer_out1_l[i], mixer_in0_l[i] * -0.25f, 1.0e-6, "mixer send left mismatch");
    requireNear(mixer_out1_r[i], mixer_in0_r[i] * 0.1f, 1.0e-6, "mixer send right mismatch");
    requireNear(mixer_out2_l[i], 0.0, 1.0e-8, "disabled mixer route should not write left output");
    requireNear(mixer_out2_r[i], 0.0, 1.0e-8, "disabled mixer route should not write right output");
  }

  float* alias_outputs_l[] = {const_cast<float*>(mixer_in0_l.data())};
  float* alias_outputs_r[] = {mixer_out0_r.data()};
  require(
      kessho_mixer_process_planar_stereo(
          mixer,
          mixer_inputs_l,
          mixer_inputs_r,
          2,
          alias_outputs_l,
          alias_outputs_r,
          1,
          mixer_frames) == 0,
      "mixer should reject input/output aliasing");

  kessho_mixer_clear_routes(mixer);
  require(kessho_mixer_get_stats(mixer, &mixer_stats) == 1, "mixer stats after clear failed");
  require(mixer_stats.route_slots == 0, "mixer route slots should clear");
  require(mixer_stats.active_routes == 0, "mixer active route count should clear");
  require(
      kessho_mixer_process_planar_stereo(
          mixer,
          mixer_inputs_l,
          mixer_inputs_r,
          2,
          mixer_outputs_l,
          mixer_outputs_r,
          3,
          mixer_frames) == 1,
      "mixer clear process failed");
  require(allZero(mixer_out0_l) && allZero(mixer_out1_l) && allZero(mixer_out2_l), "cleared mixer should zero left outputs");
  require(allZero(mixer_out0_r) && allZero(mixer_out1_r) && allZero(mixer_out2_r), "cleared mixer should zero right outputs");
  kessho_mixer_destroy(mixer);

  require(kessho_module_create(999, sample_rate, block_size) == nullptr, "invalid module type should fail");
  KesshoModule* dynamics_module =
      kessho_module_create(KESSHO_MODULE_DYNAMICS_CHARACTER, sample_rate, block_size);
  KesshoModule* dynamics_module_b =
      kessho_module_create(KESSHO_MODULE_DYNAMICS_CHARACTER, sample_rate, block_size);
  require(dynamics_module != nullptr, "dynamics character module create failed");
  require(dynamics_module_b != nullptr, "dynamics character module should allow concurrent instances");
  require(
      kessho_module_get_param_count(dynamics_module) == KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT,
      "dynamics character module param count mismatch");
  require(
      kessho_module_get_param_count(dynamics_module_b) == KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT,
      "second dynamics character module param count mismatch");
  float* dynamics_params = kessho_module_get_params_ptr(dynamics_module);
  float* dynamics_params_b = kessho_module_get_params_ptr(dynamics_module_b);
  require(dynamics_params != nullptr, "dynamics character module params pointer was null");
  require(dynamics_params_b != nullptr, "second dynamics character module params pointer was null");
  require(dynamics_params != dynamics_params_b, "dynamics character module params should be instance-owned");
  dynamics_params[0] = 1.0f; // active
  dynamics_params[2] = 1.0f; // dry
  dynamics_params[3] = 0.0f; // wet
  kessho_module_commit_params(dynamics_module);
  dynamics_params_b[0] = 1.0f; // active
  dynamics_params_b[2] = 0.0f; // dry
  dynamics_params_b[3] = 0.0f; // wet
  kessho_module_commit_params(dynamics_module_b);

  std::vector<float> module_input(block_size * 2);
  std::vector<float> module_output(block_size * 2);
  for (int i = 0; i < block_size; ++i) {
    const float sample = std::sin(static_cast<float>(i) * 0.05f) * 0.2f;
    module_input[static_cast<size_t>(i) * 2] = sample;
    module_input[static_cast<size_t>(i) * 2 + 1] = sample * 0.5f;
  }
  require(
      kessho_module_process_interleaved(
          dynamics_module,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "dynamics character module process failed");
  require(diffRms(module_input, module_output) < 1.0e-7f, "dynamics dry module path should pass input");
  std::vector<float> module_left(block_size);
  std::vector<float> module_right(block_size);
  for (int i = 0; i < block_size; ++i) {
    module_left[static_cast<size_t>(i)] = std::sin(static_cast<float>(i) * 0.05f) * 0.2f;
    module_right[static_cast<size_t>(i)] = std::cos(static_cast<float>(i) * 0.04f) * 0.1f;
  }
  const std::vector<float> expected_left = module_left;
  const std::vector<float> expected_right = module_right;
  require(
      kessho_module_process_planar_stereo(
          dynamics_module,
          module_left.data(),
          module_right.data(),
          module_left.data(),
          module_right.data(),
          block_size) == 1,
      "dynamics character planar module process failed");
  require(diffRms(module_left, expected_left) < 1.0e-7f, "dynamics planar dry left path should pass input");
  require(diffRms(module_right, expected_right) < 1.0e-7f, "dynamics planar dry right path should pass input");
  std::fill(module_output.begin(), module_output.end(), 1.0f);
  require(
      kessho_module_process_interleaved(
          dynamics_module_b,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "second dynamics character module process failed");
  require(maxAbs(module_output) == 0.0f, "second dynamics module params should not affect first module state");
  std::fill(module_left.begin(), module_left.end(), 1.0f);
  std::fill(module_right.begin(), module_right.end(), 1.0f);
  require(
      kessho_module_process_planar_stereo(
          dynamics_module_b,
          module_left.data(),
          module_right.data(),
          module_left.data(),
          module_right.data(),
          block_size) == 1,
      "second dynamics character planar module process failed");
  require(maxAbs(module_left) == 0.0f, "second dynamics planar left path should be silent");
  require(maxAbs(module_right) == 0.0f, "second dynamics planar right path should be silent");
  kessho_module_destroy(dynamics_module_b);
  kessho_module_destroy(dynamics_module);

  KesshoModule* degrade_module =
      kessho_module_create(KESSHO_MODULE_DYNAMICS_DEGRADE, sample_rate, block_size);
  KesshoModule* degrade_module_b =
      kessho_module_create(KESSHO_MODULE_DYNAMICS_DEGRADE, sample_rate, block_size);
  require(degrade_module != nullptr, "dynamics degrade module create failed");
  require(degrade_module_b != nullptr, "dynamics degrade module should allow concurrent instances");
  require(kessho_module_get_param_count(degrade_module) == 6, "dynamics degrade module param count mismatch");
  require(kessho_module_get_param_count(degrade_module_b) == 6, "second dynamics degrade module param count mismatch");
  float* degrade_params = kessho_module_get_params_ptr(degrade_module);
  float* degrade_params_b = kessho_module_get_params_ptr(degrade_module_b);
  require(degrade_params != nullptr, "dynamics degrade module params pointer was null");
  require(degrade_params_b != nullptr, "second dynamics degrade module params pointer was null");
  require(degrade_params != degrade_params_b, "dynamics degrade module params should be instance-owned");
  degrade_params[0] = 1.0f; // enabled
  degrade_params[1] = 0.0f; // mix
  kessho_module_commit_params(degrade_module);
  degrade_params_b[0] = 1.0f; // enabled
  degrade_params_b[1] = 0.8f; // mix
  degrade_params_b[2] = 0.58f; // alias
  degrade_params_b[3] = 0.34f; // generation
  degrade_params_b[4] = 0.3f; // corrosion
  degrade_params_b[5] = 0.25f; // wear
  kessho_module_commit_params(degrade_module_b);

  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          degrade_module,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "dynamics degrade dry module process failed");
  require(diffRms(module_input, module_output) < 1.0e-7f, "dynamics degrade dry path should pass input");
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          degrade_module_b,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "dynamics degrade colored module process failed");
  require(diffRms(module_input, module_output) > 1.0e-5f, "dynamics degrade colored path should alter input");

  module_left = expected_left;
  module_right = expected_right;
  require(
      kessho_module_process_planar_stereo(
          degrade_module,
          module_left.data(),
          module_right.data(),
          module_left.data(),
          module_right.data(),
          block_size) == 1,
      "dynamics degrade planar dry module process failed");
  require(diffRms(module_left, expected_left) < 1.0e-7f, "dynamics degrade planar dry left path should pass input");
  require(diffRms(module_right, expected_right) < 1.0e-7f, "dynamics degrade planar dry right path should pass input");
  kessho_module_destroy(degrade_module_b);
  kessho_module_destroy(degrade_module);

  KesshoModule* reverb_module =
      kessho_module_create(KESSHO_MODULE_REVERB, sample_rate, block_size);
  KesshoModule* reverb_module_b =
      kessho_module_create(KESSHO_MODULE_REVERB, sample_rate, block_size);
  require(reverb_module != nullptr, "reverb module create failed");
  require(reverb_module_b != nullptr, "reverb module should allow concurrent instances");
  require(kessho_module_get_param_count(reverb_module) == 31, "reverb module param count mismatch");
  require(kessho_module_get_param_count(reverb_module_b) == 31, "second reverb module param count mismatch");
  float* reverb_params = kessho_module_get_params_ptr(reverb_module);
  float* reverb_params_b = kessho_module_get_params_ptr(reverb_module_b);
  require(reverb_params != nullptr, "reverb module params pointer was null");
  require(reverb_params_b != nullptr, "second reverb module params pointer was null");
  require(reverb_params != reverb_params_b, "reverb module params should be instance-owned");
  reverb_params[0] = 1.0f;    // hall
  reverb_params[1] = 2.0f;    // lite
  reverb_params[2] = 0.45f;   // decay
  reverb_params[3] = 0.85f;   // size
  reverb_params[5] = 0.62f;   // diffusion
  reverb_params[6] = 0.12f;   // modulation
  reverb_params[7] = 0.0f;    // predelay
  reverb_params[8] = 0.7f;    // width
  reverb_params[15] = 0.24f;  // chorus rate
  reverb_params[16] = 4.0f;   // chorus depth
  reverb_params[18] = 0.08f;  // low damping
  reverb_params[19] = 0.34f;  // high damping
  reverb_params[20] = 900.0f; // crossover
  reverb_params[25] = 0.45f;  // early reflections
  kessho_module_commit_params(reverb_module);
  kessho_module_destroy(reverb_module_b);

  std::vector<float> reverb_input(block_size * 2);
  std::vector<float> reverb_output(block_size * 2);
  float reverb_peak = 0.0f;
  for (int block = 0; block < 64; ++block) {
    std::fill(reverb_input.begin(), reverb_input.end(), 0.0f);
    std::fill(reverb_output.begin(), reverb_output.end(), 0.0f);
    if (block == 0) {
      reverb_input[0] = 0.8f;
      reverb_input[1] = 0.45f;
    }
    require(
        kessho_module_process_interleaved(
            reverb_module,
            reverb_input.data(),
            reverb_output.data(),
            block_size) == 1,
        "reverb interleaved module process failed");
    reverb_peak = std::max(reverb_peak, maxAbs(reverb_output));
  }
  require(reverb_peak > 1.0e-5f, "reverb interleaved module should produce a non-zero tail");

  kessho_module_reset(reverb_module);
  std::vector<float> reverb_left(block_size);
  std::vector<float> reverb_right(block_size);
  std::vector<float> reverb_out_left(block_size);
  std::vector<float> reverb_out_right(block_size);
  float reverb_planar_peak = 0.0f;
  for (int block = 0; block < 64; ++block) {
    std::fill(reverb_left.begin(), reverb_left.end(), 0.0f);
    std::fill(reverb_right.begin(), reverb_right.end(), 0.0f);
    std::fill(reverb_out_left.begin(), reverb_out_left.end(), 0.0f);
    std::fill(reverb_out_right.begin(), reverb_out_right.end(), 0.0f);
    if (block == 0) {
      reverb_left[0] = 0.7f;
      reverb_right[0] = 0.35f;
    }
    require(
        kessho_module_process_planar_stereo(
            reverb_module,
            reverb_left.data(),
            reverb_right.data(),
            reverb_out_left.data(),
            reverb_out_right.data(),
            block_size) == 1,
        "reverb planar module process failed");
    reverb_planar_peak = std::max(reverb_planar_peak, maxAbs(reverb_out_left));
    reverb_planar_peak = std::max(reverb_planar_peak, maxAbs(reverb_out_right));
  }
  require(reverb_planar_peak > 1.0e-5f, "reverb planar module should produce a non-zero tail");
  kessho_module_destroy(reverb_module);

  KesshoModule* delay_a_module =
      kessho_module_create(KESSHO_MODULE_DELAY_A, sample_rate, block_size);
  KesshoModule* delay_a_module_b =
      kessho_module_create(KESSHO_MODULE_DELAY_A, sample_rate, block_size);
  require(delay_a_module != nullptr, "delay A module create failed");
  require(delay_a_module_b != nullptr, "delay A module should allow concurrent instances");
  require(kessho_module_get_param_count(delay_a_module) == 16, "delay A module param count mismatch");
  require(
      kessho_module_get_output_tap_count(delay_a_module) == KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT,
      "delay A output tap count mismatch");
  float* delay_a_params = kessho_module_get_params_ptr(delay_a_module);
  float* delay_a_params_b = kessho_module_get_params_ptr(delay_a_module_b);
  require(delay_a_params != nullptr, "delay A module params pointer was null");
  require(delay_a_params_b != nullptr, "second delay A module params pointer was null");
  require(delay_a_params != delay_a_params_b, "delay A module params should be instance-owned");
  delay_a_params[0] = 1.0f;    // enabled
  delay_a_params[1] = 10.0f;   // left ms
  delay_a_params[2] = 15.0f;   // right ms
  delay_a_params[3] = 0.45f;   // feedback
  delay_a_params[4] = 0.65f;   // mix
  delay_a_params[5] = 2800.0f; // filter
  delay_a_params[6] = 0.0f;    // lowpass
  delay_a_params[7] = 0.35f;   // reverb send
  delay_a_params[8] = 0.35f;   // modulation rate
  delay_a_params[9] = 0.0f;    // modulation depth
  delay_a_params[10] = 1.0f;   // ping pong
  delay_a_params[11] = 0.0f;   // duck
  delay_a_params[12] = 0.7f;   // width
  delay_a_params[13] = 0.25f;  // delay B send
  delay_a_params[14] = 6000.0f;// crossfeed filter
  delay_a_params[15] = 0.2f;   // granular send
  kessho_module_commit_params(delay_a_module);
  kessho_module_destroy(delay_a_module_b);

  std::vector<float> delay_a_input(block_size * 2);
  std::vector<float> delay_a_output(block_size * 2);
  float delay_a_peak = 0.0f;
  for (int block = 0; block < 24; ++block) {
    std::fill(delay_a_input.begin(), delay_a_input.end(), 0.0f);
    std::fill(delay_a_output.begin(), delay_a_output.end(), 0.0f);
    if (block == 0) {
      delay_a_input[0] = 0.75f;
      delay_a_input[1] = -0.25f;
    }
    require(
        kessho_module_process_interleaved(
            delay_a_module,
            delay_a_input.data(),
            delay_a_output.data(),
            block_size) == 1,
        "delay A interleaved module process failed");
    delay_a_peak = std::max(delay_a_peak, maxAbs(delay_a_output));
  }
  require(delay_a_peak > 1.0e-5f, "delay A module should produce a non-zero delayed tail");

  kessho_module_reset(delay_a_module);
  std::vector<float> delay_a_left(block_size);
  std::vector<float> delay_a_right(block_size);
  std::vector<float> delay_a_main_l(block_size);
  std::vector<float> delay_a_main_r(block_size);
  std::vector<float> delay_a_reverb_l(block_size);
  std::vector<float> delay_a_reverb_r(block_size);
  std::vector<float> delay_a_cross_l(block_size);
  std::vector<float> delay_a_cross_r(block_size);
  std::vector<float> delay_a_granular_l(block_size);
  std::vector<float> delay_a_granular_r(block_size);
  std::array<float*, KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT> delay_a_tap_l{
    delay_a_main_l.data(),     // KESSHO_MODULE_DELAY_A_TAP_MAIN
    delay_a_reverb_l.data(),   // KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND
    delay_a_cross_l.data(),    // KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND
    delay_a_granular_l.data(), // KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND
  };
  std::array<float*, KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT> delay_a_tap_r{
    delay_a_main_r.data(),     // KESSHO_MODULE_DELAY_A_TAP_MAIN
    delay_a_reverb_r.data(),   // KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND
    delay_a_cross_r.data(),    // KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND
    delay_a_granular_r.data(), // KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND
  };
  float delay_a_tap_peak = 0.0f;
  for (int block = 0; block < 24; ++block) {
    std::fill(delay_a_left.begin(), delay_a_left.end(), 0.0f);
    std::fill(delay_a_right.begin(), delay_a_right.end(), 0.0f);
    std::fill(delay_a_main_l.begin(), delay_a_main_l.end(), 0.0f);
    std::fill(delay_a_main_r.begin(), delay_a_main_r.end(), 0.0f);
    std::fill(delay_a_reverb_l.begin(), delay_a_reverb_l.end(), 0.0f);
    std::fill(delay_a_reverb_r.begin(), delay_a_reverb_r.end(), 0.0f);
    std::fill(delay_a_cross_l.begin(), delay_a_cross_l.end(), 0.0f);
    std::fill(delay_a_cross_r.begin(), delay_a_cross_r.end(), 0.0f);
    std::fill(delay_a_granular_l.begin(), delay_a_granular_l.end(), 0.0f);
    std::fill(delay_a_granular_r.begin(), delay_a_granular_r.end(), 0.0f);
    if (block == 0) {
      delay_a_left[0] = 0.5f;
      delay_a_right[0] = 0.2f;
    }
    require(
        kessho_module_process_planar_stereo_taps(
            delay_a_module,
            delay_a_left.data(),
            delay_a_right.data(),
            delay_a_tap_l.data(),
            delay_a_tap_r.data(),
            static_cast<uint32_t>(delay_a_tap_l.size()),
            block_size) == 1,
        "delay A tap module process failed");
    delay_a_tap_peak = std::max(delay_a_tap_peak, maxAbs(delay_a_main_l));
    delay_a_tap_peak = std::max(delay_a_tap_peak, maxAbs(delay_a_reverb_l));
    delay_a_tap_peak = std::max(delay_a_tap_peak, maxAbs(delay_a_cross_l));
    delay_a_tap_peak = std::max(delay_a_tap_peak, maxAbs(delay_a_granular_l));
  }
  require(delay_a_tap_peak > 1.0e-5f, "delay A taps should produce non-zero delayed output");
  kessho_module_destroy(delay_a_module);

  KesshoModule* delay_b_module =
      kessho_module_create(KESSHO_MODULE_DELAY_B, sample_rate, block_size);
  KesshoModule* delay_b_module_b =
      kessho_module_create(KESSHO_MODULE_DELAY_B, sample_rate, block_size);
  require(delay_b_module != nullptr, "delay B module create failed");
  require(delay_b_module_b != nullptr, "delay B module should allow concurrent instances");
  require(kessho_module_get_param_count(delay_b_module) == 24, "delay B module param count mismatch");
  require(
      kessho_module_get_output_tap_count(delay_b_module) == KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT,
      "delay B output tap count mismatch");
  float* delay_b_params = kessho_module_get_params_ptr(delay_b_module);
  float* delay_b_params_b = kessho_module_get_params_ptr(delay_b_module_b);
  require(delay_b_params != nullptr, "delay B module params pointer was null");
  require(delay_b_params_b != nullptr, "second delay B module params pointer was null");
  require(delay_b_params != delay_b_params_b, "delay B module params should be instance-owned");
  delay_b_params[0] = 1.0f;    // enabled
  delay_b_params[1] = 0.8f;    // activity
  delay_b_params[2] = 0.35f;   // repeats
  delay_b_params[3] = 30.0f;   // base time ms
  delay_b_params[4] = 0.5f;    // tone
  delay_b_params[5] = 0.2f;    // vibrato
  delay_b_params[6] = 0.7f;    // mix
  delay_b_params[7] = 0.25f;   // reverb send
  delay_b_params[8] = 0.2f;    // granular send
  delay_b_params[9] = 0.15f;   // Delay A send
  delay_b_params[10] = 0.0f;   // clocked mode
  delay_b_params[11] = 1.0f;   // golden pattern
  delay_b_params[12] = 2.0f;   // pitch drift
  delay_b_params[13] = 0.55f;  // warp intensity
  delay_b_params[14] = 0.8f;   // spread
  delay_b_params[15] = 0.0f;   // reserved
  kessho_module_commit_params(delay_b_module);
  kessho_module_destroy(delay_b_module_b);

  std::vector<float> delay_b_left(block_size);
  std::vector<float> delay_b_right(block_size);
  std::vector<float> delay_b_main_l(block_size);
  std::vector<float> delay_b_main_r(block_size);
  std::vector<float> delay_b_reverb_l(block_size);
  std::vector<float> delay_b_reverb_r(block_size);
  std::vector<float> delay_b_cross_l(block_size);
  std::vector<float> delay_b_cross_r(block_size);
  std::vector<float> delay_b_granular_l(block_size);
  std::vector<float> delay_b_granular_r(block_size);
  std::array<float*, KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT> delay_b_tap_l{
    delay_b_main_l.data(),     // KESSHO_MODULE_DELAY_B_TAP_MAIN
    delay_b_reverb_l.data(),   // KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND
    delay_b_cross_l.data(),    // KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND
    delay_b_granular_l.data(), // KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND
  };
  std::array<float*, KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT> delay_b_tap_r{
    delay_b_main_r.data(),     // KESSHO_MODULE_DELAY_B_TAP_MAIN
    delay_b_reverb_r.data(),   // KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND
    delay_b_cross_r.data(),    // KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND
    delay_b_granular_r.data(), // KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND
  };
  float delay_b_tap_peak = 0.0f;
  for (int block = 0; block < 24; ++block) {
    std::fill(delay_b_left.begin(), delay_b_left.end(), 0.0f);
    std::fill(delay_b_right.begin(), delay_b_right.end(), 0.0f);
    std::fill(delay_b_main_l.begin(), delay_b_main_l.end(), 0.0f);
    std::fill(delay_b_main_r.begin(), delay_b_main_r.end(), 0.0f);
    std::fill(delay_b_reverb_l.begin(), delay_b_reverb_l.end(), 0.0f);
    std::fill(delay_b_reverb_r.begin(), delay_b_reverb_r.end(), 0.0f);
    std::fill(delay_b_cross_l.begin(), delay_b_cross_l.end(), 0.0f);
    std::fill(delay_b_cross_r.begin(), delay_b_cross_r.end(), 0.0f);
    std::fill(delay_b_granular_l.begin(), delay_b_granular_l.end(), 0.0f);
    std::fill(delay_b_granular_r.begin(), delay_b_granular_r.end(), 0.0f);
    if (block == 0) {
      delay_b_left[0] = 0.7f;
      delay_b_right[0] = -0.25f;
    }
    require(
        kessho_module_process_planar_stereo_taps(
            delay_b_module,
            delay_b_left.data(),
            delay_b_right.data(),
            delay_b_tap_l.data(),
            delay_b_tap_r.data(),
            static_cast<uint32_t>(delay_b_tap_l.size()),
            block_size) == 1,
        "delay B tap module process failed");
    delay_b_tap_peak = std::max(delay_b_tap_peak, maxAbs(delay_b_main_l));
    delay_b_tap_peak = std::max(delay_b_tap_peak, maxAbs(delay_b_reverb_l));
    delay_b_tap_peak = std::max(delay_b_tap_peak, maxAbs(delay_b_cross_l));
    delay_b_tap_peak = std::max(delay_b_tap_peak, maxAbs(delay_b_granular_l));
  }
  require(delay_b_tap_peak > 1.0e-5f, "delay B taps should produce non-zero delayed output");
  kessho_module_destroy(delay_b_module);

  KesshoModule* granular_module =
      kessho_module_create(KESSHO_MODULE_GRANULAR, sample_rate, block_size);
  KesshoModule* granular_module_b =
      kessho_module_create(KESSHO_MODULE_GRANULAR, sample_rate, block_size);
  require(granular_module != nullptr, "granular module create failed");
  require(granular_module_b != nullptr, "granular module should allow concurrent instances");
  require(kessho_module_get_param_count(granular_module) == kGranularParamCount, "granular module param count mismatch");
  require(kessho_module_get_param_count(granular_module_b) == kGranularParamCount, "second granular module param count mismatch");
  float* granular_params = kessho_module_get_params_ptr(granular_module);
  float* granular_params_b = kessho_module_get_params_ptr(granular_module_b);
  require(granular_params != nullptr, "granular module params pointer was null");
  require(granular_params_b != nullptr, "second granular module params pointer was null");
  require(granular_params != granular_params_b, "granular module params should be instance-owned");
  granular_params[0] = 0.0f; // disabled pass-through
  kessho_module_commit_params(granular_module);
  granular_params_b[0] = 1.0f;  // enabled
  granular_params_b[3] = 1.0f;  // wet level
  granular_params_b[11] = static_cast<float>(KESSHO_MODE_CLEAN);
  granular_params_b[24] = 1.0f; // voice 0 gain
  kessho_module_commit_params(granular_module_b);

  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          granular_module,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "granular disabled module process failed");
  require(diffRms(module_input, module_output) < 1.0e-7f, "granular disabled module should pass input");

  module_left = expected_left;
  module_right = expected_right;
  require(
      kessho_module_process_planar_stereo(
          granular_module,
          module_left.data(),
          module_right.data(),
          module_left.data(),
          module_right.data(),
          block_size) == 1,
      "granular disabled planar module process failed");
  require(diffRms(module_left, expected_left) < 1.0e-7f, "granular disabled planar left should pass input");
  require(diffRms(module_right, expected_right) < 1.0e-7f, "granular disabled planar right should pass input");

  float granular_peak = 0.0f;
  for (int block = 0; block < 8; ++block) {
    for (int i = 0; i < block_size; ++i) {
      const float t = static_cast<float>(block * block_size + i) / static_cast<float>(sample_rate);
      module_input[static_cast<size_t>(i) * 2] = std::sin(2.0f * 3.14159265358979323846f * 220.0f * t) * 0.35f;
      module_input[static_cast<size_t>(i) * 2 + 1] =
          std::sin(2.0f * 3.14159265358979323846f * 330.0f * t) * 0.22f;
    }
    std::fill(module_output.begin(), module_output.end(), 0.0f);
    require(
        kessho_module_process_interleaved(
            granular_module_b,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "granular active module process failed");
    granular_peak = std::max(granular_peak, maxAbs(module_output));
  }
  require(granular_peak > 1.0e-5f, "granular active module should produce non-zero output");
  kessho_module_destroy(granular_module_b);
  kessho_module_destroy(granular_module);

  KesshoModule* spectral_module =
      kessho_module_create(KESSHO_MODULE_SPECTRAL_FREEZE, sample_rate, block_size);
  KesshoModule* spectral_module_b =
      kessho_module_create(KESSHO_MODULE_SPECTRAL_FREEZE, sample_rate, block_size);
  require(spectral_module != nullptr, "spectral freeze module create failed");
  require(spectral_module_b != nullptr, "spectral freeze module should allow concurrent instances");
  require(kessho_module_get_param_count(spectral_module) == 6, "spectral freeze module param count mismatch");
  require(
      kessho_module_get_param_count(spectral_module_b) == 6,
      "second spectral freeze module param count mismatch");
  float* spectral_params = kessho_module_get_params_ptr(spectral_module);
  float* spectral_params_b = kessho_module_get_params_ptr(spectral_module_b);
  require(spectral_params != nullptr, "spectral freeze module params pointer was null");
  require(spectral_params_b != nullptr, "second spectral freeze module params pointer was null");
  require(spectral_params != spectral_params_b, "spectral freeze module params should be instance-owned");
  spectral_params[3] = 0.0f; // dry pass-through
  kessho_module_commit_params(spectral_module);
  spectral_params_b[0] = 1.0f; // freeze
  spectral_params_b[1] = 1.0f; // slushy
  spectral_params_b[2] = 0.35f; // speed
  spectral_params_b[3] = 1.0f; // wet
  spectral_params_b[4] = 0.1f; // decay
  spectral_params_b[5] = 0.04f; // phase jitter
  kessho_module_commit_params(spectral_module_b);

  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          spectral_module,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "spectral freeze dry module process failed");
  require(diffRms(module_input, module_output) < 1.0e-7f, "spectral freeze dry module should pass input");

  module_left = expected_left;
  module_right = expected_right;
  require(
      kessho_module_process_planar_stereo(
          spectral_module,
          module_left.data(),
          module_right.data(),
          module_left.data(),
          module_right.data(),
          block_size) == 1,
      "spectral freeze dry planar module process failed");
  require(diffRms(module_left, expected_left) < 1.0e-7f, "spectral freeze planar dry left should pass input");
  require(diffRms(module_right, expected_right) < 1.0e-7f, "spectral freeze planar dry right should pass input");

  float spectral_peak = 0.0f;
  for (int block = 0; block < 32; ++block) {
    for (int i = 0; i < block_size; ++i) {
      const float t = static_cast<float>(block * block_size + i) / static_cast<float>(sample_rate);
      module_input[static_cast<size_t>(i) * 2] = std::sin(2.0f * 3.14159265358979323846f * 196.0f * t) * 0.28f;
      module_input[static_cast<size_t>(i) * 2 + 1] =
          std::sin(2.0f * 3.14159265358979323846f * 247.0f * t) * 0.22f;
    }
    std::fill(module_output.begin(), module_output.end(), 0.0f);
    require(
        kessho_module_process_interleaved(
            spectral_module_b,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "spectral freeze active module process failed");
    spectral_peak = std::max(spectral_peak, maxAbs(module_output));
  }
  require(spectral_peak > 1.0e-5f, "spectral freeze active module should produce non-zero output");
  kessho_module_destroy(spectral_module_b);
  kessho_module_destroy(spectral_module);

  KesshoModule* lead_fm_module =
      kessho_module_create(KESSHO_MODULE_LEAD_FM, sample_rate, block_size);
  KesshoModule* lead_fm_module_b =
      kessho_module_create(KESSHO_MODULE_LEAD_FM, sample_rate, block_size);
  require(lead_fm_module != nullptr, "lead-fm module create failed");
  require(lead_fm_module_b != nullptr, "lead-fm module should allow concurrent instances");
  require(kessho_module_get_param_count(lead_fm_module) == kLeadFmParamCount, "lead-fm module param count mismatch");
  require(
      kessho_module_get_param_count(lead_fm_module_b) == kLeadFmParamCount,
      "second lead-fm module param count mismatch");
  float* lead_fm_params = kessho_module_get_params_ptr(lead_fm_module);
  float* lead_fm_params_b = kessho_module_get_params_ptr(lead_fm_module_b);
  require(lead_fm_params != nullptr, "lead-fm module params pointer was null");
  require(lead_fm_params_b != nullptr, "second lead-fm module params pointer was null");
  require(lead_fm_params != lead_fm_params_b, "lead-fm module params should be instance-owned");

  lead_fm_params[kLeadFmParamRelease] = 0.01f;
  lead_fm_params[kLeadFmParamOutputSelect] = 0.0f;
  kessho_module_commit_params(lead_fm_module);
  lead_fm_params_b[kLeadFmParamRelease] = 0.01f;
  lead_fm_params_b[kLeadFmParamOutputSelect] = 1.0f;
  kessho_module_commit_params(lead_fm_module_b);
  require(
      kessho_module_note_on(lead_fm_module, 440.0f, 0.8f, 0.02f, 0) == 1,
      "lead-fm module note-on failed");
  require(kessho_module_get_active_voice_count(lead_fm_module) == 1, "lead-fm active count mismatch");

  std::fill(module_input.begin(), module_input.end(), 0.0f);
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  float lead_fm_peak = 0.0f;
  for (int block = 0; block < 48; ++block) {
    require(
        kessho_module_process_interleaved(
            lead_fm_module,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "lead-fm interleaved module process failed");
    lead_fm_peak = std::max(lead_fm_peak, maxAbs(module_output));
  }
  require(lead_fm_peak > 1.0e-5f, "lead-fm module should produce non-zero output after note-on");
  require(kessho_module_get_active_voice_count(lead_fm_module) == 0, "lead-fm hold/release should expire");

  require(
      kessho_module_note_on(lead_fm_module_b, 330.0f, 0.75f, 0.05f, 1) == 1,
      "second lead-fm module note-on failed");
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          lead_fm_module_b,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "lead-fm lead2 module process failed");
  require(maxAbs(module_output) > 1.0e-5f, "lead-fm lead2 output selection should produce signal");
  kessho_module_all_notes_off(lead_fm_module_b);
  kessho_module_destroy(lead_fm_module_b);
  kessho_module_destroy(lead_fm_module);

  KesshoModule* pad_module =
      kessho_module_create(KESSHO_MODULE_PAD, sample_rate, block_size);
  KesshoModule* pad_module_b =
      kessho_module_create(KESSHO_MODULE_PAD, sample_rate, block_size);
  require(pad_module != nullptr, "pad module create failed");
  require(pad_module_b != nullptr, "pad module should allow concurrent instances");
  require(kessho_module_get_param_count(pad_module) == kPadParamCount, "pad module param count mismatch");
  require(kessho_module_get_param_count(pad_module_b) == kPadParamCount, "second pad module param count mismatch");
  float* pad_params = kessho_module_get_params_ptr(pad_module);
  float* pad_params_b = kessho_module_get_params_ptr(pad_module_b);
  require(pad_params != nullptr, "pad module params pointer was null");
  require(pad_params_b != nullptr, "second pad module params pointer was null");
  require(pad_params != pad_params_b, "pad module params should be instance-owned");
  pad_params[kPadParamRelease] = 0.01f;
  pad_params[kPadParamLevel] = 0.55f;
  pad_params[kPadParamOutputSelect] = 0.0f;
  kessho_module_commit_params(pad_module);
  pad_params_b[kPadParamRelease + 53] = 0.01f;
  pad_params_b[kPadParamLevel + 53] = 0.5f;
  pad_params_b[kPadParamOutputSelect] = 3.0f; // prefader pad 2
  kessho_module_commit_params(pad_module_b);

  require(kessho_module_note_on(pad_module, 220.0f, 0.8f, 0.0f, 0) == 1, "pad module note-on failed");
  require(kessho_module_get_active_voice_count(pad_module) == 1, "pad active count mismatch");
  std::fill(module_input.begin(), module_input.end(), 0.0f);
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  float pad_peak = 0.0f;
  for (int block = 0; block < 8; ++block) {
    require(
        kessho_module_process_interleaved(
            pad_module,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "pad interleaved module process failed");
    pad_peak = std::max(pad_peak, maxAbs(module_output));
  }
  require(pad_peak > 1.0e-5f, "pad module should produce non-zero output after note-on");
  require(kessho_module_note_off(pad_module, 0) == 1, "pad module note-off failed");
  for (int block = 0; block < 8; ++block) {
    require(
        kessho_module_process_interleaved(
            pad_module,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "pad release-tail process failed");
  }
  require(kessho_module_get_active_voice_count(pad_module) == 0, "pad note-off release should end voice");

  require(
      kessho_module_note_on(pad_module_b, 330.0f, 0.75f, 0.0f, PAD_NUM_VOICES) == 1,
      "second pad module note-on failed");
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          pad_module_b,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "pad pad2 module process failed");
  require(maxAbs(module_output) > 1.0e-5f, "pad pad2 output selection should produce signal");
  require(kessho_module_kill_voice(pad_module_b, 0) == 1, "pad kill-voice failed");
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          pad_module_b,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "pad kill-voice module process failed");
  require(maxAbs(module_output) < 1.0e-8f, "pad kill-voice should hard-stop output");
  kessho_module_destroy(pad_module_b);
  kessho_module_destroy(pad_module);

  KesshoModule* pad_tap_module =
      kessho_module_create(KESSHO_MODULE_PAD, sample_rate, block_size);
  require(pad_tap_module != nullptr, "pad tap module create failed");
  require(
      kessho_module_get_output_tap_count(pad_tap_module) == KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT,
      "pad tap count should expose the public pad tap count");
  float* pad_tap_params = kessho_module_get_params_ptr(pad_tap_module);
  require(pad_tap_params != nullptr, "pad tap module params pointer was null");
  pad_tap_params[kPadParamAttack] = 0.0f;
  pad_tap_params[kPadParamRelease] = 0.01f;
  pad_tap_params[kPadParamLevel] = 0.65f;
  pad_tap_params[kPadParamReverbSend] = 0.45f;
  pad_tap_params[kPadParamOutputSelect] = 0.0f;
  kessho_module_commit_params(pad_tap_module);

  constexpr uint32_t pad_tap_bus_count = KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT;
  std::vector<float> pad_tap_input_l(block_size, 0.0f);
  std::vector<float> pad_tap_input_r(block_size, 0.0f);
  std::vector<std::vector<float>> pad_tap_output_l(pad_tap_bus_count, std::vector<float>(block_size));
  std::vector<std::vector<float>> pad_tap_output_r(pad_tap_bus_count, std::vector<float>(block_size));
  float* pad_tap_outputs_l[pad_tap_bus_count]{};
  float* pad_tap_outputs_r[pad_tap_bus_count]{};
  for (uint32_t bus = 0; bus < pad_tap_bus_count; ++bus) {
    pad_tap_outputs_l[bus] = pad_tap_output_l[bus].data();
    pad_tap_outputs_r[bus] = pad_tap_output_r[bus].data();
  }
  require(
      kessho_module_process_planar_stereo_taps(
          pad_tap_module,
          pad_tap_input_l.data(),
          pad_tap_input_r.data(),
          pad_tap_outputs_l,
          pad_tap_outputs_r,
          static_cast<uint32_t>(kessho_module_get_output_tap_count(pad_tap_module)) + 1,
          block_size) == 0,
      "pad tap process should reject an invalid bus count");
  require(
      kessho_module_process_planar_stereo_taps(
          pad_tap_module,
          pad_tap_input_l.data(),
          pad_tap_input_r.data(),
          nullptr,
          pad_tap_outputs_r,
          pad_tap_bus_count,
          block_size) == 0,
      "pad tap process should reject null left output arrays");
  require(
      kessho_module_process_planar_stereo_taps(
          pad_tap_module,
          pad_tap_input_l.data(),
          pad_tap_input_r.data(),
          pad_tap_outputs_l,
          nullptr,
          pad_tap_bus_count,
          block_size) == 0,
      "pad tap process should reject null right output arrays");

  require(kessho_module_note_on(pad_tap_module, 246.94f, 0.85f, 0.0f, 0) == 1, "pad tap module note-on failed");
  require(
      kessho_module_process_planar_stereo_taps(
          pad_tap_module,
          pad_tap_input_l.data(),
          pad_tap_input_r.data(),
          pad_tap_outputs_l,
          pad_tap_outputs_r,
          pad_tap_bus_count,
          block_size) == 1,
      "pad tap planar module process failed");
  const float pad_main_tap_peak_l = maxAbs(pad_tap_output_l[KESSHO_MODULE_TAP_MAIN]);
  const float pad_main_tap_peak_r = maxAbs(pad_tap_output_r[KESSHO_MODULE_TAP_MAIN]);
  const float pad_reverb_tap_peak_l = maxAbs(pad_tap_output_l[KESSHO_MODULE_TAP_REVERB_SEND]);
  const float pad_reverb_tap_peak_r = maxAbs(pad_tap_output_r[KESSHO_MODULE_TAP_REVERB_SEND]);
  require(
      pad_main_tap_peak_l > 1.0e-5f || pad_main_tap_peak_r > 1.0e-5f,
      "pad main tap should produce non-zero output");
  require(
      pad_reverb_tap_peak_l > 1.0e-5f || pad_reverb_tap_peak_r > 1.0e-5f,
      "pad reverb-send tap should produce non-zero output");
  require(maxAbs(pad_tap_output_l[KESSHO_MODULE_TAP_PREFADER_PAD1]) > 1.0e-5f, "pad prefader pad1 tap should be finite/non-zero");
  require(maxAbs(pad_tap_output_l[KESSHO_MODULE_TAP_PREFADER_PAD2]) == 0.0f, "pad prefader pad2 tap should stay silent");
  require(maxAbs(pad_tap_output_l[KESSHO_MODULE_TAP_POSTFADER_PAD1]) > 1.0e-5f, "pad postfader pad1 tap should be finite/non-zero");
  require(maxAbs(pad_tap_output_l[KESSHO_MODULE_TAP_POSTFADER_PAD2]) == 0.0f, "pad postfader pad2 tap should stay silent");
  kessho_module_destroy(pad_tap_module);

  KesshoModule* drum_module =
      kessho_module_create(KESSHO_MODULE_DRUM, sample_rate, block_size);
  KesshoModule* drum_module_b =
      kessho_module_create(KESSHO_MODULE_DRUM, sample_rate, block_size);
  require(drum_module != nullptr, "drum module create failed");
  require(drum_module_b != nullptr, "drum module should allow concurrent instances");
  require(kessho_module_get_param_count(drum_module) == kDrumParamCount, "drum module param count mismatch");
  require(
      kessho_module_get_param_count(drum_module_b) == kDrumParamCount,
      "second drum module param count mismatch");
  float* drum_params = kessho_module_get_params_ptr(drum_module);
  float* drum_params_b = kessho_module_get_params_ptr(drum_module_b);
  require(drum_params != nullptr, "drum module params pointer was null");
  require(drum_params_b != nullptr, "second drum module params pointer was null");
  require(drum_params != drum_params_b, "drum module params should be instance-owned");

  drum_params[kDrumParamOutputSelect] = 0.0f;
  kessho_module_commit_params(drum_module);
  drum_params_b[kDrumParamReverbSend] = 0.35f;
  drum_params_b[kDrumParamOutputSelect] = 1.0f;
  kessho_module_commit_params(drum_module_b);

  require(
      kessho_module_note_on(drum_module, 0.0f, 0.85f, 0.0f, DRUM_VOICE_KICK) == 1,
      "drum module kick trigger failed");
  require(kessho_module_get_active_voice_count(drum_module) == 0, "drum trigger should queue until process");
  std::fill(module_input.begin(), module_input.end(), 0.0f);
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  float drum_peak = 0.0f;
  for (int block = 0; block < 6; ++block) {
    require(
        kessho_module_process_interleaved(
            drum_module,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "drum interleaved module process failed");
    drum_peak = std::max(drum_peak, maxAbs(module_output));
  }
  require(drum_peak > 1.0e-5f, "drum module should produce non-zero output after trigger");

  require(
      kessho_module_note_on(drum_module_b, 0.0f, 0.72f, 0.0f, DRUM_VOICE_NOISE) == 1,
      "second drum module noise trigger failed");
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  require(
      kessho_module_process_interleaved(
          drum_module_b,
          module_input.data(),
          module_output.data(),
          block_size) == 1,
      "drum reverb-bus module process failed");
  require(maxAbs(module_output) > 1.0e-5f, "drum reverb bus output selection should produce signal");
  kessho_module_all_notes_off(drum_module_b);
  kessho_module_destroy(drum_module_b);
  kessho_module_destroy(drum_module);

  KesshoModule* soundscapes_module =
      kessho_module_create(KESSHO_MODULE_SOUNDSCAPES, sample_rate, block_size);
  KesshoModule* soundscapes_module_b =
      kessho_module_create(KESSHO_MODULE_SOUNDSCAPES, sample_rate, block_size);
  require(soundscapes_module != nullptr, "soundscapes module create failed");
  require(soundscapes_module_b != nullptr, "soundscapes module should allow concurrent instances");
  require(
      kessho_module_get_param_count(soundscapes_module) == kSoundscapesParamCount,
      "soundscapes module param count mismatch");
  require(
      kessho_module_get_param_count(soundscapes_module_b) == kSoundscapesParamCount,
      "second soundscapes module param count mismatch");
  float* soundscapes_params = kessho_module_get_params_ptr(soundscapes_module);
  float* soundscapes_params_b = kessho_module_get_params_ptr(soundscapes_module_b);
  require(soundscapes_params != nullptr, "soundscapes module params pointer was null");
  require(soundscapes_params_b != nullptr, "second soundscapes module params pointer was null");
  require(soundscapes_params != soundscapes_params_b, "soundscapes module params should be instance-owned");

  soundscapes_params[kSoundscapesParamWaterActive] = 1.0f;
  soundscapes_params[kSoundscapesParamWaterPreset] = 2.0f; // waterfall
  soundscapes_params[kSoundscapesParamWaterLayerMix + 0] = 0.2f;
  soundscapes_params[kSoundscapesParamWaterLayerMix + 1] = 0.4f;
  soundscapes_params[kSoundscapesParamWaterLayerMix + 2] = 0.8f;
  soundscapes_params[kSoundscapesParamWaterLayerMix + 3] = 0.5f;
  soundscapes_params[kSoundscapesParamWaterLayerMix + 4] = 1.0f;
  for (int i = 0; i < 6; ++i) {
    soundscapes_params[kSoundscapesParamWaterLayerDensity + i] = 1.0f;
  }
  soundscapes_params[kSoundscapesParamOutputSelect] = 0.0f;
  kessho_module_commit_params(soundscapes_module);

  std::fill(module_input.begin(), module_input.end(), 0.0f);
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  float soundscapes_water_peak = 0.0f;
  for (int block = 0; block < 384; ++block) {
    require(
        kessho_module_process_interleaved(
            soundscapes_module,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "soundscapes water module process failed");
    soundscapes_water_peak = std::max(soundscapes_water_peak, maxAbs(module_output));
  }
  require(soundscapes_water_peak > 1.0e-5f, "soundscapes water module should produce signal");

  soundscapes_params_b[kSoundscapesParamInsectsActive] = 1.0f;
  soundscapes_params_b[kSoundscapesParamInsectsEngine] = 3.0f; // cicada
  soundscapes_params_b[kSoundscapesParamOutputSelect] = 1.0f;
  kessho_module_commit_params(soundscapes_module_b);
  std::fill(module_output.begin(), module_output.end(), 0.0f);
  float soundscapes_insects_peak = 0.0f;
  for (int block = 0; block < 256; ++block) {
    require(
        kessho_module_process_interleaved(
            soundscapes_module_b,
            module_input.data(),
            module_output.data(),
            block_size) == 1,
        "soundscapes insects module process failed");
    soundscapes_insects_peak = std::max(soundscapes_insects_peak, maxAbs(module_output));
  }
  require(soundscapes_insects_peak > 1.0e-5f, "soundscapes insects output selection should produce signal");
  kessho_module_all_notes_off(soundscapes_module_b);
  kessho_module_destroy(soundscapes_module_b);
  kessho_module_destroy(soundscapes_module);

  require(dynamics_character_init(static_cast<float>(sample_rate)) == 0, "legacy dynamics init failed");
  float* legacy_input = dynamics_character_get_input_ptr();
  float* legacy_output = dynamics_character_get_output_ptr();
  float* legacy_params = dynamics_character_get_params_ptr();
  require(legacy_input != nullptr, "legacy dynamics input pointer was null");
  require(legacy_output != nullptr, "legacy dynamics output pointer was null");
  require(legacy_params != nullptr, "legacy dynamics params pointer was null");
  legacy_params[0] = 1.0f; // active
  legacy_params[2] = 1.0f; // dry
  legacy_params[3] = 0.0f; // wet
  dynamics_character_commit_params();
  std::copy(module_input.begin(), module_input.end(), legacy_input);
  dynamics_character_process_block(block_size);
  std::vector<float> legacy_render(legacy_output, legacy_output + module_input.size());
  require(diffRms(module_input, legacy_render) < 1.0e-7f, "legacy dynamics dry path should pass input");
  dynamics_character_destroy();

  require(dynamics_degrade_init(static_cast<float>(sample_rate)) == 0, "legacy dynamics degrade init failed");
  float* legacy_degrade_input = dynamics_degrade_get_input_ptr();
  float* legacy_degrade_output = dynamics_degrade_get_output_ptr();
  require(legacy_degrade_input != nullptr, "legacy dynamics degrade input pointer was null");
  require(legacy_degrade_output != nullptr, "legacy dynamics degrade output pointer was null");
  dynamics_degrade_set_params(1, 0.0f, 0.6f, 0.3f, 0.2f, 0.1f);
  std::copy(module_input.begin(), module_input.end(), legacy_degrade_input);
  dynamics_degrade_process_block(block_size);
  std::vector<float> legacy_degrade_render(
      legacy_degrade_output,
      legacy_degrade_output + module_input.size());
  require(
      diffRms(module_input, legacy_degrade_render) < 1.0e-7f,
      "legacy dynamics degrade dry path should pass input");
  dynamics_degrade_destroy();

  require(reverb_init(static_cast<float>(sample_rate)) == 0, "legacy reverb init failed");
  float* legacy_reverb_input = reverb_get_input_ptr();
  float* legacy_reverb_output = reverb_get_output_ptr();
  require(legacy_reverb_input != nullptr, "legacy reverb input pointer was null");
  require(legacy_reverb_output != nullptr, "legacy reverb output pointer was null");
  reverb_set_type(1);
  reverb_set_quality(2);
  reverb_set_params(0.45f, 0.85f, 0.5f, 0.62f, 0.12f, 0.0f, 0.7f);
  reverb_set_multiband_damp(0.08f, 0.34f, 900.0f);
  float legacy_reverb_peak = 0.0f;
  for (int block = 0; block < 64; ++block) {
    std::fill(legacy_reverb_input, legacy_reverb_input + block_size * 2, 0.0f);
    if (block == 0) {
      legacy_reverb_input[0] = 0.8f;
      legacy_reverb_input[1] = 0.45f;
    }
    reverb_process_block(block_size);
    for (int i = 0; i < block_size * 2; ++i) {
      require(std::isfinite(legacy_reverb_output[i]), "legacy reverb produced a non-finite sample");
      legacy_reverb_peak = std::max(legacy_reverb_peak, std::fabs(legacy_reverb_output[i]));
    }
  }
  require(legacy_reverb_peak > 1.0e-5f, "legacy reverb should produce a non-zero tail");
  reverb_destroy();

  require(granular_init(static_cast<float>(sample_rate), 1.0f) == 0, "legacy granular init failed");
  float* legacy_granular_input = granular_get_input_ptr();
  float* legacy_granular_output = granular_get_output_ptr();
  require(legacy_granular_input != nullptr, "legacy granular input pointer was null");
  require(legacy_granular_output != nullptr, "legacy granular output pointer was null");
  granular_set_enabled(0);
  std::copy(module_input.begin(), module_input.end(), legacy_granular_input);
  granular_process_block(block_size);
  std::vector<float> legacy_granular_render(
      legacy_granular_output,
      legacy_granular_output + module_input.size());
  require(
      diffRms(module_input, legacy_granular_render) < 1.0e-7f,
      "legacy granular disabled path should pass input");
  granular_destroy();

  require(spectral_freeze_init(static_cast<float>(sample_rate)) == 0, "legacy spectral freeze init failed");
  float* legacy_spectral_input = spectral_freeze_get_input_ptr();
  float* legacy_spectral_output = spectral_freeze_get_output_ptr();
  require(legacy_spectral_input != nullptr, "legacy spectral freeze input pointer was null");
  require(legacy_spectral_output != nullptr, "legacy spectral freeze output pointer was null");
  spectral_freeze_set_mix(0.0f);
  std::copy(module_input.begin(), module_input.end(), legacy_spectral_input);
  spectral_freeze_process_block(block_size);
  std::vector<float> legacy_spectral_render(
      legacy_spectral_output,
      legacy_spectral_output + module_input.size());
  require(
      diffRms(module_input, legacy_spectral_render) < 1.0e-7f,
      "legacy spectral freeze dry path should pass input");
  spectral_freeze_destroy();

  require(pad_init(static_cast<float>(sample_rate)) == 0, "legacy pad init failed");
  pad_set_release(0, 0.01f);
  pad_note_on(0, 220.0f, 0.8f);
  pad_process_block(block_size);
  float* legacy_pad_output = pad_get_output_ptr();
  float* legacy_pad_reverb = pad_get_reverb_send_ptr();
  require(legacy_pad_output != nullptr, "legacy pad output pointer was null");
  require(legacy_pad_reverb != nullptr, "legacy pad reverb pointer was null");
  std::vector<float> legacy_pad_render(legacy_pad_output, legacy_pad_output + block_size * 2);
  require(maxAbs(legacy_pad_render) > 1.0e-5f, "legacy pad should produce non-zero output");
  pad_destroy();

  require(lead_fm_init(static_cast<float>(sample_rate)) == 0, "legacy lead-fm init failed");
  lead_fm_set_release(0.01f);
  lead_fm_note_on_ex(440.0f, 0.8f, 0.02f, 0);
  lead_fm_process_block(block_size);
  float* legacy_lead_output = lead_fm_get_output_ptr();
  float* legacy_lead_output2 = lead_fm_get_output2_ptr();
  require(legacy_lead_output != nullptr, "legacy lead-fm output pointer was null");
  require(legacy_lead_output2 != nullptr, "legacy lead-fm output2 pointer was null");
  std::vector<float> legacy_lead_render(legacy_lead_output, legacy_lead_output + block_size * 2);
  std::vector<float> legacy_lead2_render(legacy_lead_output2, legacy_lead_output2 + block_size * 2);
  require(maxAbs(legacy_lead_render) > 1.0e-5f, "legacy lead-fm lead1 should produce non-zero output");
  require(maxAbs(legacy_lead2_render) == 0.0f, "legacy lead-fm lead1 should not bleed into lead2 output");
  lead_fm_destroy();

  require(drum_init(static_cast<float>(sample_rate)) == 0, "legacy drum init failed");
  drum_trigger(DRUM_VOICE_KICK, 0.82f, 0);
  drum_process_block(block_size);
  float* legacy_drum_output = drum_get_output_ptr();
  float* legacy_drum_reverb = drum_get_reverb_send_ptr();
  require(legacy_drum_output != nullptr, "legacy drum output pointer was null");
  require(legacy_drum_reverb != nullptr, "legacy drum reverb pointer was null");
  std::vector<float> legacy_drum_render(legacy_drum_output, legacy_drum_output + block_size * 2);
  require(maxAbs(legacy_drum_render) > 1.0e-5f, "legacy drum should produce non-zero output");
  drum_destroy();

  kessho_stop(engine);
  require(kessho_is_running(engine) == 0, "stop should mark engine stopped");
  kessho_destroy(engine);

  std::cout << "KesshoCore smoke tests passed\n";
  return 0;
}
