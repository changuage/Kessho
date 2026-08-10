#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductSchema.h"
#include "ProductSnapshotTestHelpers.h"
#include "kessho_pad.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Pad Exact Patch test failed: " << message << "\n";
    std::exit(1);
  }
}

using PadParams = std::array<float, kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT>;

bool isDiscretePadParam(uint32_t index) {
  for (const uint32_t discrete_index : kessho::product::generated::KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES) {
    if (index == discrete_index) {
      return true;
    }
  }
  return false;
}

void failParamMismatch(const char* context, uint32_t param_index, float actual, float expected) {
  std::cerr << "Kessho Product Pad Exact Patch test failed: " << context
            << " param[" << param_index << "] expected " << expected
            << " but got " << actual << "\n";
  std::exit(1);
}

void requireParamClose(const char* context, uint32_t param_index, float actual, float expected) {
  const float tolerance = 0.00001f * std::max(1.0f, std::fabs(expected));
  if (!std::isfinite(actual) || std::fabs(actual - expected) > tolerance) {
    failParamMismatch(context, param_index, actual, expected);
  }
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
  snapshot.rng.seed = 137;
  snapshot.rng.state = 137;
  for (uint32_t index = 0; index < 7u; ++index) {
    snapshot.sources[index].enabled = 1;
    snapshot.sources[index].source_id = index + 1u;
    snapshot.sources[index].level = 1.0f;
    snapshot.sources[index].dry_gain = 1.0f;
    snapshot.sources[index].expression = 1.0f;
    snapshot.sources[index].post_lpf_hz = 18000.0f;
    snapshot.sources[index].stereo_width = 1.0f;
  }
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

PadParams exactPadParamsFromPreset(uint32_t preset_id) {
  const auto* preset = kessho::product::internal::findSourcePreset(preset_id);
  require(preset != nullptr, "generated pad preset missing");
  const auto patch = kessho::product::internal::sourcePresetPatch(*preset);
  require(
      patch.exact_pad_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT,
      "generated pad preset lacks exact params");

  PadParams params{};
  for (uint32_t index = 0; index < params.size(); ++index) {
    params[index] = patch.exact_pad_params[index];
  }
  return params;
}

PadParams makeSentinelPadParams() {
  PadParams params{};
  params[0] = 3.0f;
  params[1] = -1.0f;
  params[2] = 3.25f;
  params[3] = 0.44f;
  params[4] = 1.0f;
  params[5] = 1.0f;
  params[6] = -4.5f;
  params[7] = 0.31f;
  params[8] = 0.27f;
  params[9] = 1.0f;
  params[10] = -2.0f;
  params[11] = 0.0f;
  params[12] = 0.22f;
  params[13] = 1.0f;
  params[14] = 0.07f;
  params[15] = 0.13f;
  params[16] = 0.67f;
  params[17] = 0.24f;
  params[18] = 0.47f;
  params[19] = 2.0f;
  params[20] = 2.0f;
  params[21] = 1150.0f;
  params[22] = 0.12f;
  params[23] = 0.91f;
  params[24] = 24.0f;
  params[25] = 0.33f;
  params[26] = 1.0f;
  params[27] = 0.0f;
  params[28] = 540.0f;
  params[29] = 0.18f;
  params[30] = 1.4f;
  params[31] = 2.0f;
  params[32] = 0.012f;
  params[33] = 0.42f;
  params[34] = 0.36f;
  params[35] = 1.7f;
  params[36] = 0.18f;
  params[37] = 0.09f;
  params[38] = 5.0f;
  params[39] = 6.0f;
  params[40] = 0.37f;
  params[41] = 0.05f;
  params[42] = 1.0f;
  params[43] = 4.0f;
  params[44] = 1.0f;
  params[45] = 0.021f;
  params[46] = 0.31f;
  params[47] = 0.12f;
  params[48] = 0.61f;
  params[49] = 0.27f;
  params[50] = 2.0f;
  params[51] = 0.0f;
  params[52] = 0.0f;
  params[53] = 0.0f;
  params[54] = 0.0f;
  params[55] = 0.42f;
  params[56] = 2.0f;
  params[57] = 0.5f;
  return params;
}

void writePadSparseOverrides(KesshoProductSourceSnapshot& source, const PadParams& params) {
  source.pad_override_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT;
  for (uint32_t index = 0; index < params.size(); ++index) {
    source.pad_override_indices[index] = index;
    source.pad_override_values[index] = params[index];
  }
}

void configureStressPadSource(KesshoProductSourceSnapshot& source, uint32_t source_id, const PadParams& params) {
  source.source_id = source_id;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
  source.level = 1.0f;
  source.morph = 1.0f;
  source.distance = 1.0f;
  source.expression = 0.37f;
  source.hold_seconds = 0.18f;
  source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK;
  source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
  writePadSparseOverrides(source, params);
}

void configureGeneratedEndpointPadSourceWithoutSnapshotExact(
    KesshoProductSourceSnapshot& source,
    uint32_t source_id,
    float morph) {
  source.source_id = source_id;
  source.preset_id = morph < 0.5f
      ? kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK
      : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
  source.level = 1.0f;
  source.morph = morph;
  source.distance = 1.0f;
  source.expression = 0.37f;
  source.hold_seconds = 0.18f;
  source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK;
  source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
}

void requirePadModuleParamsEqual(
    KesshoProductEngine* engine,
    uint32_t pad_index,
    const PadParams& expected,
    const char* context) {
  require(engine != nullptr, "engine missing for pad module param check");
  require(pad_index < 2u, "invalid pad module index");
  require(engine->pad_module != nullptr, "pad module missing");
  require(
      engine->pad_module->paramCount() >=
          static_cast<int>(kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT * 2u),
      "pad module param count mismatch");
  float* actual = engine->pad_module->params();
  require(actual != nullptr, "pad module params missing");
  const uint32_t base = pad_index * kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT;
  for (uint32_t index = 0; index < expected.size(); ++index) {
    requireParamClose(context, index, actual[base + index], expected[index]);
  }
}

void triggerPadAndExpectParams(
    KesshoProductEngine* engine,
    uint32_t source_id,
    float morph,
    float distance,
    float expression,
    const PadParams& expected,
    const char* context) {
  const uint32_t voice_index = engine->triggerVoice(
      source_id,
      60.0f,
      0.83f,
      0.22f,
      morph,
      distance,
      expression,
      211u,
      0u,
      false,
      0.0f,
      1.0e10f,
      1.0e10f);
  require(voice_index != kProductInvalidVoiceIndex, "pad trigger failed");
  requirePadModuleParamsEqual(engine, source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u, expected, context);
}

float renderPadPeakBlocks(KesshoProductEngine* engine, uint32_t blocks) {
  require(engine != nullptr, "pad render peak engine missing");
  require(engine->pad_module != nullptr, "pad render peak module missing");
  std::array<float, 128> left{};
  std::array<float, 128> right{};
  std::array<float, 128> silent{};
  float peak = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    engine->pad_module->processPlanarStereo(
        silent.data(),
        silent.data(),
        left.data(),
        right.data(),
        static_cast<int>(left.size()));
    for (uint32_t frame = 0; frame < left.size(); ++frame) {
      require(std::isfinite(left[frame]) && std::isfinite(right[frame]), "pad render produced non-finite sample");
      peak = std::max(peak, std::fabs(left[frame]));
      peak = std::max(peak, std::fabs(right[frame]));
    }
  }
  return peak;
}

float maxInterleavedPeak(const float* interleaved, int frames, const char* context) {
  require(interleaved != nullptr, context);
  float peak = 0.0f;
  for (int frame = 0; frame < frames; ++frame) {
    const float left = interleaved[frame * 2];
    const float right = interleaved[frame * 2 + 1];
    require(std::isfinite(left) && std::isfinite(right), context);
    peak = std::max(peak, std::fabs(left));
    peak = std::max(peak, std::fabs(right));
  }
  return peak;
}

void requirePadGainSafetyAndLadderRender() {
  KesshoPadInstance* pad = pad_instance_create(48000.0f);
  require(pad != nullptr, "pad safety instance create failed");

  pad_instance_set_level(pad, 0, 2.0f);
  pad_instance_set_reverb_send(pad, 2.0f);
  pad_instance_set_attack(pad, 0, 0.001f);
  pad_instance_set_decay(pad, 0, 0.01f);
  pad_instance_set_sustain(pad, 0, 1.0f);
  pad_instance_set_release(pad, 0, 8.0f);
  pad_instance_set_osc_a_level(pad, 0, 1.0f);
  pad_instance_set_osc_b_level(pad, 0, 1.0f);
  pad_instance_set_sub_enabled(pad, 0, 1);
  pad_instance_set_sub_level(pad, 0, 0.8f);
  pad_instance_set_filter_type(pad, 0, PAD_FILTER_LADDER_LP);
  pad_instance_set_filter_cutoff(pad, 0, 8400.0f);
  pad_instance_set_filter_q(pad, 0, 8.0f);
  pad_instance_set_filter_resonance(pad, 0, 1.0f);
  pad_instance_set_hardness(pad, 0, 1.0f);
  pad_instance_set_warmth(pad, 0, 0.8f);
  pad_instance_set_presence(pad, 0, 0.7f);

  const float chord[] = {261.6256f, 329.6276f, 391.9954f, 493.8833f, 659.2551f, 783.9909f};
  for (int voice = 0; voice < 6; ++voice) {
    pad_instance_set_voice_pad(pad, voice, 0);
    pad_instance_note_on(pad, voice, chord[voice], 1.0f);
  }

  float main_peak = 0.0f;
  float reverb_peak = 0.0f;
  float prefader_peak = 0.0f;
  float postfader_peak = 0.0f;
  for (int block = 0; block < 48; ++block) {
    pad_instance_process_block(pad, 128);
    main_peak = std::max(main_peak, maxInterleavedPeak(pad_instance_get_output_ptr(pad), 128, "pad main safety output"));
    reverb_peak = std::max(reverb_peak, maxInterleavedPeak(pad_instance_get_reverb_send_ptr(pad), 128, "pad reverb safety output"));
    prefader_peak = std::max(prefader_peak, maxInterleavedPeak(pad_instance_get_prefader_pad1_ptr(pad), 128, "pad prefader safety output"));
    postfader_peak = std::max(postfader_peak, maxInterleavedPeak(pad_instance_get_postfader_pad1_ptr(pad), 128, "pad postfader safety output"));
  }

  require(main_peak > 0.01f, "pad safety render did not produce audible output");
  require(main_peak < 0.999f, "pad safety main output exceeded limiter bounds");
  require(reverb_peak < 0.999f, "pad safety reverb send exceeded limiter bounds");
  require(postfader_peak < 0.999f, "pad safety postfader tap exceeded limiter bounds");
  require(prefader_peak > postfader_peak, "pad prefader tap was unexpectedly calibrated with postfader trim");

  pad_instance_set_level(pad, 0, -1.0f);
  pad_instance_process_block(pad, 128);
  require(
      maxInterleavedPeak(pad_instance_get_output_ptr(pad), 128, "pad negative level clamp output") <= 0.000001f,
      "pad negative level did not clamp to silence");
  require(
      maxInterleavedPeak(pad_instance_get_prefader_pad1_ptr(pad), 128, "pad negative level prefader") > 0.0001f,
      "pad negative level clamp incorrectly muted prefader tap");

  pad_instance_set_filter_type(pad, 0, 99);
  pad_instance_set_level(pad, 0, 1.0f);
  pad_instance_process_block(pad, 128);
  require(
      maxInterleavedPeak(pad_instance_get_output_ptr(pad), 128, "pad filter clamp output") < 0.999f,
      "pad out-of-range filter type render exceeded limiter bounds");

  pad_instance_destroy(pad);
}

void requirePadRuntimeOverride(
    KesshoProductEngine* engine,
    uint32_t source_id,
    uint32_t param_index,
    float value,
    const char* context) {
  require(engine != nullptr, "pad override engine missing");
  require(
      engine->applyRuntimeSourceOverrideParam(source_id, param_index, value),
      context);
}

PadParams expectedEndpointMorphParams(float morph, float distance);

uint32_t padRuntimeParamId(uint32_t source_id, uint32_t param_index) {
  const uint32_t base = source_id == KESSHO_PRODUCT_SOURCE_PAD2
      ? kProductPad2RuntimeParamIdBase
      : kProductPadRuntimeParamIdBase;
  return base + param_index;
}

void applyPadExactSampleHoldRange(
    KesshoProductEngine* engine,
    uint32_t source_id,
    uint32_t param_index,
    float value) {
  KesshoProductEvent range{};
  range.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  range.target_id = source_id;
  range.index = 9900u + param_index;
  range.param_id = padRuntimeParamId(source_id, param_index);
  range.value = value;
  range.value2 = value;
  range.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  range.value4 = value;
  range.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE;
  engine->applyModulationRangeEvent(range);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "pad exact sample-hold range apply failed");
}

void triggerPadVoice(
    KesshoProductEngine* engine,
    uint32_t source_id,
    uint32_t pad_voice_index,
    float hold_seconds) {
  const uint32_t voice_index = engine->triggerVoice(
      source_id,
      60.0f,
      1.0f,
      hold_seconds,
      1.0f,
      0.0f,
      1.0f,
      911u,
      0u,
      false,
      0.0f,
      1.0e10f,
      1.0e10f,
      pad_voice_index);
  require(voice_index != kProductInvalidVoiceIndex, "pad voice trigger failed");
}

void requireAllParamPadSparseOverridesSurviveTrigger(uint32_t source_id) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "all-param sparse Pad engine create failed");

  const PadParams expected = makeSentinelPadParams();
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureStressPadSource(snapshot.sources[source_id - 1u], source_id, expected);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "all-param sparse Pad snapshot load failed");

  triggerPadAndExpectParams(engine, source_id, -1.0f, -1.0f, -1.0f, expected, "all-param sparse Pad params");
  kessho_product_destroy(engine);
}

void requirePadRetriggerRespectsLongAttack() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad retrigger attack engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointPadSourceWithoutSnapshotExact(
      snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u],
      KESSHO_PRODUCT_SOURCE_PAD1,
      1.0f);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].distance = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pad retrigger attack snapshot load failed");

  requirePadRuntimeOverride(engine, KESSHO_PRODUCT_SOURCE_PAD1, 32u, 0.001f, "pad retrigger fast attack override failed");
  requirePadRuntimeOverride(engine, KESSHO_PRODUCT_SOURCE_PAD1, 33u, 0.01f, "pad retrigger decay override failed");
  requirePadRuntimeOverride(engine, KESSHO_PRODUCT_SOURCE_PAD1, 34u, 1.0f, "pad retrigger sustain override failed");

  triggerPadVoice(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, 20.0f);
  const float loud_peak = renderPadPeakBlocks(engine, 12u);
  require(loud_peak > 0.02f, "pad retrigger setup did not reach an audible envelope level");

  requirePadRuntimeOverride(engine, KESSHO_PRODUCT_SOURCE_PAD1, 32u, 10.4f, "pad retrigger long attack override failed");
  triggerPadVoice(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, 20.0f);
  const float retrigger_peak = renderPadPeakBlocks(engine, 1u);
  require(
      retrigger_peak < 0.02f && retrigger_peak < loud_peak * 0.2f,
      "pad retrigger reused the previous envelope level instead of starting the long attack from silence");

  kessho_product_destroy(engine);
}

void requirePadExactSampleHoldRangeAppliesOnTrigger() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad exact sample-hold engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointPadSourceWithoutSnapshotExact(
      snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u],
      KESSHO_PRODUCT_SOURCE_PAD1,
      1.0f);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].distance = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pad exact sample-hold snapshot load failed");

  constexpr uint32_t kAttackParamIndex = 33u;
  constexpr float kSampledAttack = 7.25f;
  applyPadExactSampleHoldRange(engine, KESSHO_PRODUCT_SOURCE_PAD1, kAttackParamIndex, kSampledAttack);

  PadParams expected = expectedEndpointMorphParams(1.0f, 0.0f);
  expected[kAttackParamIndex] = kSampledAttack;
  triggerPadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      1.0f,
      0.0f,
      1.0f,
      expected,
      "pad exact sample-hold trigger params");

  const ModulationRange* range = engine->findModulationRange(
      KESSHO_PRODUCT_SOURCE_PAD1,
      padRuntimeParamId(KESSHO_PRODUCT_SOURCE_PAD1, kAttackParamIndex));
  require(range != nullptr, "pad exact sample-hold range missing after trigger");
  require(range->sample_hold_counter > 0u, "pad exact sample-hold did not sample on trigger");
  require(
      range->last_trigger_source == KESSHO_PRODUCT_SOURCE_PAD1,
      "pad exact sample-hold recorded wrong trigger source");

  kessho_product_destroy(engine);
}

float morphContinuous(float a, float b, float t) {
  return a + (b - a) * t;
}

constexpr float kDistanceSlightPoint = 0.25f;
constexpr float kDistanceStrength = 2.0f;
constexpr float kAttackDistanceBaseBoostSeconds = 0.1f;
constexpr float kAttackDistanceZeroThresholdSeconds = 0.005f;

float scalePadDistance(float distance) {
  const float safe_distance = std::clamp(distance, 0.0f, 1.0f);
  return kDistanceStrength <= 1.0f ? safe_distance : 1.0f - std::pow(1.0f - safe_distance, kDistanceStrength);
}

float padDistanceAnchor(float distance, float start_value, float slight_value, float max_value) {
  const float safe_distance = scalePadDistance(distance);
  if (safe_distance <= kDistanceSlightPoint) {
    return start_value + (safe_distance / kDistanceSlightPoint) * (slight_value - start_value);
  }
  const float tail_t = (safe_distance - kDistanceSlightPoint) / (1.0f - kDistanceSlightPoint);
  return slight_value + tail_t * (max_value - slight_value);
}

float padDistanceAdd(float base, float distance, float slight_delta, float max_delta, float min_value, float max_value) {
  return std::clamp(base + padDistanceAnchor(distance, 0.0f, slight_delta, max_delta), min_value, max_value);
}

float padDistanceMultiply(float base, float distance, float slight_mul, float max_mul, float min_value, float max_value) {
  return std::clamp(base * padDistanceAnchor(distance, 1.0f, slight_mul, max_mul), min_value, max_value);
}

float padDistanceAttack(float base, float distance, float slight_mul, float max_mul) {
  if (std::fabs(distance) <= 0.0001f) {
    return std::clamp(base, 0.001f, 16.0f);
  }
  const float effective_base = base <= kAttackDistanceZeroThresholdSeconds
      ? base + kAttackDistanceBaseBoostSeconds
      : base;
  return padDistanceMultiply(effective_base, distance, slight_mul, max_mul, 0.001f, 16.0f);
}

void applyExpectedPadDistance(PadParams& params, float distance) {
  if (distance <= 0.0001f) {
    return;
  }
  params[32] = padDistanceAttack(params[32], distance, 1.35f, 4.0f);
  params[33] = padDistanceMultiply(params[33], distance, 1.08f, 1.35f, 0.01f, 8.0f);
  params[34] = padDistanceAdd(params[34], distance, -0.03f, -0.18f, 0.0f, 1.0f);
  params[35] = padDistanceMultiply(params[35], distance, 1.18f, 2.40f, 0.01f, 30.0f);
  params[15] = padDistanceAdd(params[15], distance, -0.04f, -0.22f, 0.0f, 2.0f);
  params[16] = padDistanceAdd(params[16], distance, 0.04f, 0.18f, 0.0f, 1.0f);
  params[17] = padDistanceAdd(params[17], distance, -0.05f, -0.30f, 0.0f, 1.0f);
  params[21] = padDistanceMultiply(params[21], distance, 0.85f, 0.45f, 40.0f, 8000.0f);
}

PadParams expectedEndpointMorphParams(float morph, float distance = 0.0f) {
  const float t = std::clamp(morph, 0.0f, 1.0f);
  const PadParams a = exactPadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK);
  const PadParams b = exactPadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK);
  PadParams expected{};
  for (uint32_t index = 0; index < expected.size(); ++index) {
    expected[index] = isDiscretePadParam(index) ? (t < 0.5f ? a[index] : b[index]) : morphContinuous(a[index], b[index], t);
  }
  applyExpectedPadDistance(expected, distance);
  return expected;
}

void requireEndpointPadMorphMatchesWebPolicy(float morph) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "endpoint exact pad engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointPadSourceWithoutSnapshotExact(
      snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u],
      KESSHO_PRODUCT_SOURCE_PAD1,
      morph);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "endpoint exact pad snapshot load failed");

  const PadParams expected = expectedEndpointMorphParams(morph);
  triggerPadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      morph,
      1.0f,
      0.37f,
      expected,
      "endpoint exact pad morph params");
  kessho_product_destroy(engine);
}

void requireGeneratedEndpointPadSnapshotDoesNotNeedExactPatch(uint32_t source_id, float morph) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "generated endpoint pad engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointPadSourceWithoutSnapshotExact(snapshot.sources[source_id - 1u], source_id, morph);
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "generated endpoint pad snapshot load failed");

  const PadParams expected = expectedEndpointMorphParams(morph);
  triggerPadAndExpectParams(
      engine,
      source_id,
      -1.0f,
      1.0f,
      0.37f,
      expected,
      "generated endpoint pad params without snapshot exact patch");
  kessho_product_destroy(engine);
}

void requireStableEndpointPadPatchIsCachedAcrossTriggers() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "stable endpoint pad cache engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointPadSourceWithoutSnapshotExact(
      snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u],
      KESSHO_PRODUCT_SOURCE_PAD1,
      1.0f);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].distance = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "stable endpoint pad cache snapshot load failed");

  auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  require(loaded.source_preset_endpoint_valid, "stable endpoint pad cache did not compile endpoints");
  require(loaded.applied_module_patch_ptr == nullptr, "stable endpoint pad cache started dirty");
  const uint32_t revision = loaded.source_preset_runtime_revision;
  const PadParams expected = expectedEndpointMorphParams(1.0f, 0.0f);

  triggerPadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      1.0f,
      0.0f,
      1.0f,
      expected,
      "stable endpoint pad cache first trigger");
  require(
      loaded.applied_module_patch_ptr == &loaded.source_preset_endpoint_b,
      "stable endpoint pad cache did not record endpoint B patch");
  require(
      loaded.applied_module_patch_revision == revision,
      "stable endpoint pad cache recorded wrong revision");
  const auto* cached_patch = loaded.applied_module_patch_ptr;

  triggerPadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      1.0f,
      0.0f,
      1.0f,
      expected,
      "stable endpoint pad cache repeated trigger");
  require(
      loaded.applied_module_patch_ptr == cached_patch,
      "stable endpoint pad cache lost cached patch on repeated trigger");
  require(
      loaded.applied_module_patch_revision == revision,
      "stable endpoint pad cache changed revision on repeated trigger");

  KesshoProductEvent endpoint_event{};
  endpoint_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  endpoint_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  endpoint_event.index = 2u;
  endpoint_event.value = static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT);
  engine->applySourcePresetEvent(endpoint_event);
  require(
      loaded.source_preset_runtime_revision != revision,
      "stable endpoint pad cache did not bump revision after endpoint change");
  require(
      loaded.applied_module_patch_ptr == nullptr && loaded.applied_module_patch_revision == 0u,
      "stable endpoint pad cache did not invalidate after endpoint change");

  kessho_product_destroy(engine);
}

void requireNamedPluckPresetParams() {
  const PadParams soft = exactPadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK);
  requireParamClose("PadSoftPluck oscillator wave", 0u, soft[0], 6.0f);
  requireParamClose("PadSoftPluck oscillator position", 2u, soft[2], 0.18f);
  requireParamClose("PadSoftPluck filter cutoff", 21u, soft[21], 1500.0f);
  requireParamClose("PadSoftPluck warmth", 16u, soft[16], 0.68f);
  requireParamClose("PadSoftPluck output trim", 57u, soft[57], 0.5f);

  const PadParams buchla = exactPadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK);
  requireParamClose("PadBuchlaPluck oscillator wave", 0u, buchla[0], 6.0f);
  requireParamClose("PadBuchlaPluck oscillator position", 2u, buchla[2], 0.38f);
  requireParamClose("PadBuchlaPluck fold amount", 18u, buchla[18], 0.32f);
  requireParamClose("PadBuchlaPluck attack", 32u, buchla[32], 0.003f);
  requireParamClose("PadBuchlaPluck mod env enabled", 44u, buchla[44], 1.0f);
}

void requireLegacyPadExactPatchConversion() {
  constexpr uint32_t kLegacyPadParamCount = kessho::core::KESSHO_LEGACY_SOURCE_PRESET_PAD_PARAM_COUNT;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "legacy Pad exact patch engine create failed");

  kessho::core::KesshoSourcePresetPatch patch{};
  patch.exact_pad_param_count = kLegacyPadParamCount;
  for (uint32_t index = 0u; index < kLegacyPadParamCount; ++index) {
    patch.exact_pad_params[index] = static_cast<float>(index) * 0.03125f;
  }
  patch.exact_pad_params[0] = 3.0f;
  patch.exact_pad_params[1] = 1.0f;
  patch.exact_pad_params[2] = 25.0f;
  patch.exact_pad_params[5] = -1.0f;
  patch.exact_pad_params[6] = 50.0f;
  patch.exact_pad_params[16] = 0.4f;
  patch.exact_pad_params[51] = 0.77f;

  require(engine->pad_module->setSourcePresetPatch(0, patch) == 1, "legacy Pad exact patch was rejected");
  const float* params = engine->pad_module->params();
  require(params != nullptr, "legacy Pad conversion params pointer was null");
  const float expected_drift = std::clamp(0.20f + 0.4f * 0.55f + 25.0f * 0.0025f, 0.0f, 1.0f);
  requireParamClose("legacy Pad A pitch", 1u, params[1], 12.25f);
  requireParamClose("legacy Pad A position", 2u, params[2], 0.0f);
  requireParamClose("legacy Pad B pitch", 5u, params[5], -11.5f);
  requireParamClose("legacy Pad B position", 6u, params[6], 0.0f);
  requireParamClose("legacy Pad drift", 55u, params[55], expected_drift);
  requireParamClose("legacy Pad phase reset", 56u, params[56], 2.0f);
  requireParamClose("legacy Pad output trim", 57u, params[57], 0.77f);

  require(engine->pad_module->setSourcePresetPatch(1, patch) == 1, "legacy Pad 2 exact patch was rejected");
  const float* pad2_params = engine->pad_module->params() + kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT;
  requireParamClose("legacy Pad 2 pitch", 1u, pad2_params[1], 12.25f);
  requireParamClose("legacy Pad 2 output trim", 57u, pad2_params[57], 0.77f);

  patch.exact_pad_params[1] = 3.0f;
  patch.exact_pad_params[2] = 0.0f;
  patch.exact_pad_params[5] = -3.0f;
  patch.exact_pad_params[6] = 0.0f;
  require(engine->pad_module->setSourcePresetPatch(0, patch) == 1, "overshoot legacy Pad exact patch was rejected");
  params = engine->pad_module->params();
  requireParamClose("overshoot legacy Pad A pitch", 1u, params[1], 24.0f);
  requireParamClose("overshoot legacy Pad B pitch", 5u, params[5], -24.0f);

  patch.exact_pad_params[1] = std::numeric_limits<float>::quiet_NaN();
  patch.exact_pad_params[5] = std::numeric_limits<float>::infinity();
  require(engine->pad_module->setSourcePresetPatch(0, patch) == 1, "non-finite legacy Pad exact pitch was rejected");
  params = engine->pad_module->params();
  requireParamClose("non-finite legacy Pad A pitch", 1u, params[1], 0.0f);
  requireParamClose("non-finite legacy Pad B pitch", 5u, params[5], 0.0f);
  kessho_product_destroy(engine);
}

void requireWrongPadExactPatchCountsRejected() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "wrong-count Pad exact patch engine create failed");
  kessho::core::KesshoSourcePresetPatch patch{};
  for (uint32_t count = 0u; count <= 64u; ++count) {
    if (count == kessho::core::KESSHO_LEGACY_SOURCE_PRESET_PAD_PARAM_COUNT ||
        count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
      continue;
    }
    patch.exact_pad_param_count = count;
    require(
        engine->pad_module->setSourcePresetPatch(0, patch) == 0,
        "Pad module accepted a non-current/non-legacy exact patch count");
  }
  kessho_product_destroy(engine);
}

void requireLegacyPadSnapshotConversion() {
  constexpr uint32_t kLegacyPadParamCount = kessho::core::KESSHO_LEGACY_SOURCE_PRESET_PAD_PARAM_COUNT;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "legacy Pad snapshot engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  source.exact_pad_param_count = kLegacyPadParamCount;
  source.pad_override_count = 0u;
  for (uint32_t index = 0u; index < kLegacyPadParamCount; ++index) {
    source.exact_pad_params[index] = static_cast<float>(index) * 0.0175f;
  }
  source.exact_pad_params[1] = 2.0f;
  source.exact_pad_params[2] = -12.0f;
  source.exact_pad_params[5] = -1.0f;
  source.exact_pad_params[6] = 8.0f;
  source.exact_pad_params[16] = 0.5f;
  source.exact_pad_params[51] = 0.66f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "legacy Pad snapshot was rejected");
  const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  require(loaded.pad_override_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT, "legacy Pad snapshot did not become current sparse overrides");
  require(loaded.source_preset_patch_valid, "legacy Pad snapshot lost generated endpoint patch state");
  requireParamClose("legacy Pad snapshot A pitch", 1u, loaded.pad_override_values[1], 23.88f);
  requireParamClose("legacy Pad snapshot B pitch", 5u, loaded.pad_override_values[5], -11.92f);
  requireParamClose("legacy Pad snapshot output trim", 57u, loaded.pad_override_values[57], 0.66f);

  source.exact_pad_params[1] = 3.0f;
  source.exact_pad_params[2] = 0.0f;
  source.exact_pad_params[5] = -3.0f;
  source.exact_pad_params[6] = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "overshoot legacy Pad snapshot was rejected");
  requireParamClose("overshoot legacy Pad snapshot A pitch", 1u, loaded.pad_override_values[1], 24.0f);
  requireParamClose("overshoot legacy Pad snapshot B pitch", 5u, loaded.pad_override_values[5], -24.0f);

  source.exact_pad_params[1] = std::numeric_limits<float>::quiet_NaN();
  source.exact_pad_params[5] = std::numeric_limits<float>::infinity();
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "non-finite legacy Pad snapshot pitch was rejected");
  requireParamClose("non-finite legacy Pad snapshot A pitch", 1u, loaded.pad_override_values[1], 0.0f);
  requireParamClose("non-finite legacy Pad snapshot B pitch", 5u, loaded.pad_override_values[5], 0.0f);
  kessho_product_destroy(engine);
}

void requireWrongPadSnapshotCountsRejected() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "wrong-count Pad snapshot engine create failed");
  for (uint32_t count = 1u; count <= 64u; ++count) {
    if (count == kessho::core::KESSHO_LEGACY_SOURCE_PRESET_PAD_PARAM_COUNT) continue;
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
    source.exact_pad_param_count = count;
    source.pad_override_count = 0u;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "Product snapshot accepted a non-legacy exact Pad count");
  }
  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireNamedPluckPresetParams();
  requireAllParamPadSparseOverridesSurviveTrigger(KESSHO_PRODUCT_SOURCE_PAD1);
  requireAllParamPadSparseOverridesSurviveTrigger(KESSHO_PRODUCT_SOURCE_PAD2);
  requireEndpointPadMorphMatchesWebPolicy(0.35f);
  requireEndpointPadMorphMatchesWebPolicy(0.65f);
  requireGeneratedEndpointPadSnapshotDoesNotNeedExactPatch(KESSHO_PRODUCT_SOURCE_PAD1, 0.35f);
  requireGeneratedEndpointPadSnapshotDoesNotNeedExactPatch(KESSHO_PRODUCT_SOURCE_PAD2, 0.65f);
  requireStableEndpointPadPatchIsCachedAcrossTriggers();
  requirePadRetriggerRespectsLongAttack();
  requirePadExactSampleHoldRangeAppliesOnTrigger();
  requirePadGainSafetyAndLadderRender();
  requireLegacyPadExactPatchConversion();
  requireWrongPadExactPatchCountsRejected();
  requireLegacyPadSnapshotConversion();
  requireWrongPadSnapshotCountsRejected();

  std::cout << "Kessho Product Pad Exact Patch tests passed\n";
  return 0;
}
