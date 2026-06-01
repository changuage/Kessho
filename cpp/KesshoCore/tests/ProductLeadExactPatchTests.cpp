#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductSchema.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Lead Exact Patch test failed: " << message << "\n";
    std::exit(1);
  }
}

using LeadParams = std::array<float, kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT>;

void failParamMismatch(const char* context, uint32_t param_index, float actual, float expected) {
  std::cerr << "Kessho Product Lead Exact Patch test failed: " << context
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
  snapshot.rng.seed = 91;
  snapshot.rng.state = 91;
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

float peakRange(const std::vector<float>& left, const std::vector<float>& right) {
  float peak = 0.0f;
  for (std::size_t index = 0; index < left.size(); ++index) {
    require(std::isfinite(left[index]) && std::isfinite(right[index]), "non-finite render sample");
    peak = std::max(peak, std::fabs(left[index]));
    peak = std::max(peak, std::fabs(right[index]));
  }
  return peak;
}

float renderPeakBlocks(KesshoProductEngine* engine, uint32_t blocks = 64u) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  float peak = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    peak = std::max(peak, peakRange(left, right));
  }
  return peak;
}

float renderGamelanPeakWithSparseGain(float gain) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  source.level = 1.0f;
  source.morph = 1.0f;
  source.distance = 1.0f;
  source.expression = 1.0f;
  source.hold_seconds = 0.18f;
  source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  source.lead_override_count = 2u;
  source.lead_override_indices[0] = 55u;
  source.lead_override_values[0] = 0.0f;
  source.lead_override_indices[1] = 62u;
  source.lead_override_values[1] = gain;

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  note.value = 64.0f;
  note.value2 = 0.9f;
  note.value3 = 0.18f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual lead note enqueue failed");

  const float peak = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return peak;
}

LeadParams exactLeadParamsFromPreset(uint32_t preset_id) {
  const auto* preset = kessho::product::internal::findSourcePreset(preset_id);
  require(preset != nullptr, "generated lead preset missing");
  const auto patch = kessho::product::internal::sourcePresetPatch(*preset);
  require(
      patch.exact_lead_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT,
      "generated lead preset lacks exact params");

  LeadParams params{};
  for (uint32_t index = 0; index < params.size(); ++index) {
    params[index] = patch.exact_lead_params[index];
  }
  return params;
}

LeadParams makeSentinelLeadParams() {
  LeadParams params{};
  params[0] = 4.0f;
  params[1] = 13.37f;
  params[2] = 0.42f;
  for (uint32_t op = 0; op < 4u; ++op) {
    const uint32_t base = 3u + op * 10u;
    params[base] = 0.75f + static_cast<float>(op) * 0.63f;
    params[base + 1u] = 0.21f + static_cast<float>(op) * 0.37f;
    params[base + 2u] = 0.19f + static_cast<float>(op) * 0.11f;
    params[base + 3u] = 0.12f + static_cast<float>(op) * 0.08f;
    params[base + 4u] = 0.88f - static_cast<float>(op) * 0.06f;
    params[base + 5u] = 0.03f + static_cast<float>(op) * 0.07f;
    params[base + 6u] = -7.5f + static_cast<float>(op) * 5.0f;
    params[base + 7u] = 0.72f + static_cast<float>(op) * 0.15f;
    params[base + 8u] = 0.004f + static_cast<float>(op) * 0.011f;
    params[base + 9u] = 0.003f + static_cast<float>(op) * 0.017f;
  }
  params[43] = 0.013f;
  params[44] = 0.271f;
  params[45] = 0.63f;
  params[46] = 1.73f;
  params[47] = 3210.0f;
  params[48] = 2.17f;
  params[49] = 2.0f;
  params[50] = 0.031f;
  params[51] = 0.293f;
  params[52] = 0.71f;
  params[53] = 0.149f;
  params[54] = 1130.0f;
  params[55] = 0.071f;
  params[56] = 0.023f;
  params[57] = 0.017f;
  params[58] = 18.5f;
  params[59] = 63.0f;
  params[60] = 2870.0f;
  params[61] = 2.0f;
  params[62] = 0.52f;
  params[63] = 0.77f;
  params[64] = -0.41f;
  params[65] = 0.58f;
  params[66] = 0.29f;
  params[67] = 1.37f;
  params[68] = 0.046f;
  params[69] = 5.0f;
  params[70] = 4.0f;
  params[71] = 8.5f;
  params[72] = 1.0f;
  params[73] = 0.12f;
  params[74] = 0.19f;
  params[75] = 0.31f;
  params[76] = 3770.0f;
  params[77] = 0.26f;
  params[78] = 0.34f;
  params[79] = 0.0f;
  return params;
}

void writeLeadSparseOverrides(KesshoProductSourceSnapshot& source, const LeadParams& params) {
  source.lead_override_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT;
  for (uint32_t index = 0; index < params.size(); ++index) {
    source.lead_override_indices[index] = index;
    source.lead_override_values[index] = params[index];
  }
}

void configureStressLeadSource(KesshoProductSourceSnapshot& source, uint32_t source_id, const LeadParams& params) {
  source.source_id = source_id;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  source.level = 1.0f;
  source.morph = 1.0f;
  source.distance = 1.0f;
  source.expression = 0.37f;
  source.hold_seconds = 0.18f;
  source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  writeLeadSparseOverrides(source, params);
}

void configureGeneratedEndpointLeadSourceWithoutSnapshotExact(
    KesshoProductSourceSnapshot& source,
    uint32_t source_id,
    float morph) {
  source.source_id = source_id;
  source.preset_id = morph < 0.5f
      ? kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES
      : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  source.level = 1.0f;
  source.morph = morph;
  source.distance = 1.0f;
  source.expression = 0.37f;
  source.hold_seconds = 0.18f;
  source.source_preset_a_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
}

void requireLeadModuleParamsEqual(
    KesshoProductEngine* engine,
    uint32_t lead_index,
    const LeadParams& expected,
    const char* context) {
  require(engine != nullptr, "engine missing for lead module param check");
  require(lead_index < 2u, "invalid lead module index");
  require(engine->lead_modules[lead_index] != nullptr, "lead module missing");
  require(
      engine->lead_modules[lead_index]->paramCount() ==
          static_cast<int>(kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT),
      "lead module param count mismatch");
  float* actual = engine->lead_modules[lead_index]->params();
  require(actual != nullptr, "lead module params missing");
  for (uint32_t index = 0; index < expected.size(); ++index) {
    requireParamClose(context, index, actual[index], expected[index]);
  }
}

void triggerLeadAndExpectParams(
    KesshoProductEngine* engine,
    uint32_t source_id,
    float morph,
    float distance,
    float expression,
    float synth_ratchet_factor,
    const LeadParams& expected,
    const char* context) {
  const uint32_t voice_index = engine->triggerVoice(
      source_id,
      64.0f,
      0.83f,
      0.22f,
      morph,
      distance,
      expression,
      113u,
      0u,
      false,
      0.0f,
      1.0e10f,
      1.0e10f,
      kPadVoiceNoPreference,
      synth_ratchet_factor);
  require(voice_index != kProductInvalidVoiceIndex, "lead trigger failed");
  requireLeadModuleParamsEqual(engine, source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u, expected, context);
}

void requireAllParamLeadSparseOverridesSurviveTrigger(uint32_t source_id) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "all-param sparse Lead engine create failed");

  const LeadParams expected = makeSentinelLeadParams();
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureStressLeadSource(snapshot.sources[source_id - 1u], source_id, expected);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "all-param sparse Lead snapshot load failed");

  triggerLeadAndExpectParams(engine, source_id, -1.0f, -1.0f, -1.0f, 1.0f, expected, "all-param sparse Lead params");
  kessho_product_destroy(engine);
}

float morphContinuous(float a, float b, float t) {
  return a + (b - a) * t;
}

float scaleLeadDistance(float distance) {
  const float safe_distance = std::clamp(distance, 0.0f, 1.0f);
  return 1.0f - std::pow(1.0f - safe_distance, 2.0f);
}

float leadDistanceAnchor(float distance, float start_value, float slight_value, float max_value) {
  const float safe_distance = scaleLeadDistance(distance);
  if (safe_distance <= 0.25f) {
    return start_value + (safe_distance / 0.25f) * (slight_value - start_value);
  }
  const float tail_t = (safe_distance - 0.25f) / 0.75f;
  return slight_value + tail_t * (max_value - slight_value);
}

float leadDistanceAdd(float base, float distance, float slight_delta, float max_delta, float min_value, float max_value) {
  return std::clamp(base + leadDistanceAnchor(distance, 0.0f, slight_delta, max_delta), min_value, max_value);
}

float leadDistanceMultiply(float base, float distance, float slight_mul, float max_mul, float min_value, float max_value) {
  return std::clamp(base * leadDistanceAnchor(distance, 1.0f, slight_mul, max_mul), min_value, max_value);
}

float leadDistanceAttack(float base, float distance, float slight_mul, float max_mul) {
  const float effective_base = base <= 0.005f ? base + 0.1f : base;
  return leadDistanceMultiply(effective_base, distance, slight_mul, max_mul, 0.001f, 2.0f);
}

void applyExpectedLeadDistance(LeadParams& params, uint32_t source_id, float distance) {
  if (distance <= 0.0001f) {
    return;
  }
  const bool lead2 = source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  const float shaped = scaleLeadDistance(distance);
  params[43] = leadDistanceAttack(params[43], distance, lead2 ? 1.25f : 1.2f, lead2 ? 3.6f : 3.2f);
  params[44] = leadDistanceMultiply(params[44], distance, lead2 ? 0.94f : 0.95f, lead2 ? 0.74f : 0.78f, 0.01f, 4.0f);
  params[45] = leadDistanceAdd(params[45], distance, lead2 ? -0.05f : -0.04f, lead2 ? -0.30f : -0.26f, 0.0f, 1.0f);
  params[46] = leadDistanceMultiply(params[46], distance, lead2 ? 1.15f : 1.12f, lead2 ? 2.0f : 1.9f, 0.01f, 8.0f);
  params[47] = std::max(80.0f, params[47] * (1.0f - shaped * 0.72f));
  params[48] = std::max(0.05f, params[48] * (1.0f - shaped * 0.18f));
  params[54] *= 1.0f - shaped * 0.55f;
  params[56] *= 1.0f - shaped * 0.92f;
  params[57] *= 1.0f - shaped * 0.82f;
  params[4] *= 1.0f - shaped * 0.34f;
  params[14] *= 1.0f - shaped * 0.30f;
  params[24] *= 1.0f - shaped * 0.24f;
  params[34] *= 1.0f - shaped * 0.18f;
  params[55] *= 1.0f - shaped * 0.62f;
  params[2] *= 1.0f - shaped * 0.12f;
  params[62] *= 1.0f - shaped * 0.15f;
}

LeadParams expectedEndpointMorphParams(float morph, uint32_t source_id = KESSHO_PRODUCT_SOURCE_LEAD1, float distance = 0.0f) {
  const float t = std::clamp(morph, 0.0f, 1.0f);
  const LeadParams a = exactLeadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  const LeadParams b = exactLeadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  LeadParams expected{};
  for (uint32_t index = 0; index < expected.size(); ++index) {
    expected[index] = morphContinuous(a[index], b[index], t);
  }
  for (const uint32_t index : kessho::product::generated::KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES) {
    expected[index] = t < 0.5f ? a[index] : b[index];
  }
  for (const uint32_t index : kessho::product::generated::KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES) {
    expected[index] = std::round(morphContinuous(a[index], b[index], t));
  }
  applyExpectedLeadDistance(expected, source_id, distance);
  return expected;
}

void requireEndpointLeadMorphMatchesWebPolicy(float morph) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "endpoint exact lead engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointLeadSourceWithoutSnapshotExact(
      snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u],
      KESSHO_PRODUCT_SOURCE_LEAD1,
      morph);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "endpoint exact lead snapshot load failed");

  const LeadParams expected = expectedEndpointMorphParams(morph, KESSHO_PRODUCT_SOURCE_LEAD1, 1.0f);
  triggerLeadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_LEAD1,
      morph,
      1.0f,
      0.37f,
      1.0f,
      expected,
      "endpoint exact lead morph params");
  kessho_product_destroy(engine);
}

void requireGeneratedEndpointLeadSnapshotDoesNotNeedExactPatch(uint32_t source_id, float morph) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "generated endpoint lead engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointLeadSourceWithoutSnapshotExact(snapshot.sources[source_id - 1u], source_id, morph);
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "generated endpoint lead snapshot load failed");

  const LeadParams expected = expectedEndpointMorphParams(morph, source_id, 1.0f);
  triggerLeadAndExpectParams(
      engine,
      source_id,
      -1.0f,
      1.0f,
      0.37f,
      1.0f,
      expected,
      "generated endpoint lead params without snapshot exact patch");
  kessho_product_destroy(engine);
}

void requireLeadEnvelopeOverrideDoesNotNeedSnapshotExact(uint32_t source_id, float morph) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "lead envelope override engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  configureGeneratedEndpointLeadSourceWithoutSnapshotExact(source, source_id, morph);
  source.distance = 0.0f;
  source.lead_envelope_override_enabled = 1u;
  source.attack_seconds = 0.047f;
  source.decay_seconds = 0.91f;
  source.sustain = 0.42f;
  source.release_seconds = 3.25f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "lead envelope override snapshot load failed");

  LeadParams expected = expectedEndpointMorphParams(morph);
  expected[43] = source.attack_seconds;
  expected[44] = source.decay_seconds;
  expected[45] = source.sustain;
  expected[46] = source.release_seconds;
  triggerLeadAndExpectParams(
      engine,
      source_id,
      -1.0f,
      0.0f,
      1.0f,
      1.0f,
      expected,
      "lead envelope override without snapshot exact patch");
  kessho_product_destroy(engine);
}

void requireLeadAlgorithmOverrideDoesNotNeedSnapshotExact(uint32_t source_id, float morph) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "lead algorithm override engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  configureGeneratedEndpointLeadSourceWithoutSnapshotExact(source, source_id, morph);
  source.distance = 0.0f;
  source.lead_algorithm_preset_a_enabled = 1u;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "lead algorithm override snapshot load failed");

  LeadParams expected = expectedEndpointMorphParams(morph);
  expected[0] =
      exactLeadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES)[0];
  triggerLeadAndExpectParams(
      engine,
      source_id,
      -1.0f,
      0.0f,
      1.0f,
      1.0f,
      expected,
      "lead algorithm override without snapshot exact patch");
  kessho_product_destroy(engine);
}

void requireLeadSparseOverrideDoesNotNeedSnapshotExact(uint32_t source_id, float morph) {
  constexpr uint32_t kLeadDriveParamIndex = 55u;
  constexpr uint32_t kLeadGainParamIndex = 62u;
  constexpr float kDriveOverride = 0.0f;
  constexpr float kGainOverride = 0.41f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "lead sparse override engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  configureGeneratedEndpointLeadSourceWithoutSnapshotExact(source, source_id, morph);
  source.distance = 0.0f;
  source.lead_override_count = 2u;
  source.lead_override_indices[0] = kLeadDriveParamIndex;
  source.lead_override_values[0] = kDriveOverride;
  source.lead_override_indices[1] = kLeadGainParamIndex;
  source.lead_override_values[1] = kGainOverride;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "lead sparse override snapshot load failed");

  const auto& loaded = engine->sources[source_id - 1u];
  require(loaded.source_preset_endpoint_valid, "lead sparse override snapshot did not compile generated endpoints");
  require(loaded.lead_override_count == 2u, "lead sparse override count did not load to structured SourceState");
  require(loaded.lead_override_indices[0] == kLeadDriveParamIndex, "lead sparse override drive index did not load");
  require(std::fabs(loaded.lead_override_values[0] - kDriveOverride) < 0.00001f, "lead sparse override drive value did not load");
  require(loaded.lead_override_indices[1] == kLeadGainParamIndex, "lead sparse override gain index did not load");
  require(std::fabs(loaded.lead_override_values[1] - kGainOverride) < 0.00001f, "lead sparse override gain value did not load");

  LeadParams expected = expectedEndpointMorphParams(morph, source_id, 0.0f);
  expected[kLeadDriveParamIndex] = kDriveOverride;
  expected[kLeadGainParamIndex] = kGainOverride;
  triggerLeadAndExpectParams(
      engine,
      source_id,
      -1.0f,
      0.0f,
      1.0f,
      1.0f,
      expected,
      "lead sparse override without snapshot exact patch");
  require(
      engine->sources[source_id - 1u].lead_override_count == 2u,
      "lead sparse override trigger lost structured Lead override state");
  kessho_product_destroy(engine);
}

void requireLeadRatchetScalesOnlyEnvelopeParams() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "ratchet exact lead engine create failed");

  LeadParams expected = makeSentinelLeadParams();
  const float factor = 0.5f;
  expected[43] = std::max(0.001f, expected[43] * factor);
  expected[44] = std::max(0.001f, expected[44] * factor);
  expected[46] = std::max(0.001f, expected[46] * factor);

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureStressLeadSource(snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u], KESSHO_PRODUCT_SOURCE_LEAD1, makeSentinelLeadParams());
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "ratchet exact lead snapshot load failed");

  triggerLeadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_LEAD1,
      -1.0f,
      -1.0f,
      -1.0f,
      factor,
      expected,
      "ratchet exact lead params");
  kessho_product_destroy(engine);
}

void requireStableEndpointLeadPatchIsCachedUntilRatchetScratchPatch() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "stable endpoint lead cache engine create failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureGeneratedEndpointLeadSourceWithoutSnapshotExact(
      snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u],
      KESSHO_PRODUCT_SOURCE_LEAD1,
      1.0f);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].distance = 0.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "stable endpoint lead cache snapshot load failed");

  auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  require(loaded.source_preset_endpoint_valid, "stable endpoint lead cache did not compile endpoints");
  require(loaded.applied_module_patch_ptr == nullptr, "stable endpoint lead cache started dirty");
  const uint32_t revision = loaded.source_preset_runtime_revision;
  const LeadParams expected = expectedEndpointMorphParams(1.0f, KESSHO_PRODUCT_SOURCE_LEAD1, 0.0f);

  triggerLeadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_LEAD1,
      1.0f,
      0.0f,
      1.0f,
      1.0f,
      expected,
      "stable endpoint lead cache first trigger");
  require(
      loaded.applied_module_patch_ptr == &loaded.source_preset_endpoint_b,
      "stable endpoint lead cache did not record endpoint B patch");
  require(
      loaded.applied_module_patch_revision == revision,
      "stable endpoint lead cache recorded wrong revision");
  const auto* cached_patch = loaded.applied_module_patch_ptr;

  triggerLeadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_LEAD1,
      1.0f,
      0.0f,
      1.0f,
      1.0f,
      expected,
      "stable endpoint lead cache repeated trigger");
  require(
      loaded.applied_module_patch_ptr == cached_patch,
      "stable endpoint lead cache lost cached patch on repeated trigger");
  require(
      loaded.applied_module_patch_revision == revision,
      "stable endpoint lead cache changed revision on repeated trigger");

  LeadParams ratcheted = expected;
  ratcheted[43] = std::max(0.001f, ratcheted[43] * 0.5f);
  ratcheted[44] = std::max(0.001f, ratcheted[44] * 0.5f);
  ratcheted[46] = std::max(0.001f, ratcheted[46] * 0.5f);
  triggerLeadAndExpectParams(
      engine,
      KESSHO_PRODUCT_SOURCE_LEAD1,
      1.0f,
      0.0f,
      1.0f,
      0.5f,
      ratcheted,
      "stable endpoint lead ratchet scratch trigger");
  require(
      loaded.applied_module_patch_ptr == nullptr && loaded.applied_module_patch_revision == 0u,
      "stable endpoint lead cache did not invalidate after ratchet scratch patch");

  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireAllParamLeadSparseOverridesSurviveTrigger(KESSHO_PRODUCT_SOURCE_LEAD1);
  requireAllParamLeadSparseOverridesSurviveTrigger(KESSHO_PRODUCT_SOURCE_LEAD2);
  requireEndpointLeadMorphMatchesWebPolicy(0.35f);
  requireEndpointLeadMorphMatchesWebPolicy(0.65f);
  requireGeneratedEndpointLeadSnapshotDoesNotNeedExactPatch(KESSHO_PRODUCT_SOURCE_LEAD1, 0.35f);
  requireGeneratedEndpointLeadSnapshotDoesNotNeedExactPatch(KESSHO_PRODUCT_SOURCE_LEAD2, 0.65f);
  requireLeadEnvelopeOverrideDoesNotNeedSnapshotExact(KESSHO_PRODUCT_SOURCE_LEAD1, 0.35f);
  requireLeadEnvelopeOverrideDoesNotNeedSnapshotExact(KESSHO_PRODUCT_SOURCE_LEAD2, 0.65f);
  requireLeadAlgorithmOverrideDoesNotNeedSnapshotExact(KESSHO_PRODUCT_SOURCE_LEAD1, 0.35f);
  requireLeadAlgorithmOverrideDoesNotNeedSnapshotExact(KESSHO_PRODUCT_SOURCE_LEAD2, 0.65f);
  requireLeadSparseOverrideDoesNotNeedSnapshotExact(KESSHO_PRODUCT_SOURCE_LEAD1, 0.35f);
  requireLeadSparseOverrideDoesNotNeedSnapshotExact(KESSHO_PRODUCT_SOURCE_LEAD2, 0.65f);
  requireLeadRatchetScalesOnlyEnvelopeParams();
  requireStableEndpointLeadPatchIsCachedUntilRatchetScratchPatch();

  const float low_gain_peak = renderGamelanPeakWithSparseGain(0.05f);
  const float high_gain_peak = renderGamelanPeakWithSparseGain(0.8f);
  require(high_gain_peak > low_gain_peak * 4.0f, "sparse LeadGamelan gain was overwritten by trigger macros");

  std::cout << "Kessho Product Lead Exact Patch tests passed\n";
  return 0;
}
