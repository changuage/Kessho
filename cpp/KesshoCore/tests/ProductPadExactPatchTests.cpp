#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductSchema.h"
#include "ProductSnapshotTestHelpers.h"

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
  require(
      preset->exact_pad_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT,
      "generated pad preset lacks exact params");

  PadParams params{};
  for (uint32_t index = 0; index < params.size(); ++index) {
    params[index] = preset->exact_pad_params[index];
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
  params[21] = 450.0f;
  params[22] = 1850.0f;
  params[23] = 0.12f;
  params[24] = 0.91f;
  params[25] = 24.0f;
  params[26] = 0.33f;
  params[27] = 1.0f;
  params[28] = 0.0f;
  params[29] = 540.0f;
  params[30] = 0.18f;
  params[31] = 1.4f;
  params[32] = 2.0f;
  params[33] = 0.012f;
  params[34] = 0.42f;
  params[35] = 0.36f;
  params[36] = 1.7f;
  params[37] = 0.18f;
  params[38] = 0.09f;
  params[39] = 5.0f;
  params[40] = 6.0f;
  params[41] = 0.37f;
  params[42] = 0.05f;
  params[43] = 1.0f;
  params[44] = 4.0f;
  params[45] = 1.0f;
  params[46] = 0.021f;
  params[47] = 0.31f;
  params[48] = 0.12f;
  params[49] = 0.61f;
  params[50] = 0.27f;
  params[51] = 2.0f;
  params[52] = 0.5f;
  return params;
}

void writePadExactParams(KesshoProductSourceSnapshot& source, const PadParams& params) {
  source.exact_pad_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT;
  for (uint32_t index = 0; index < params.size(); ++index) {
    source.exact_pad_params[index] = params[index];
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
  writePadExactParams(source, params);
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
  source.exact_pad_param_count = 0u;
  for (float& value : source.exact_pad_params) {
    value = 0.0f;
  }
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

void requireSnapshotExactPadParamsSurviveTrigger(uint32_t source_id) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "all-param exact pad engine create failed");

  const PadParams expected = makeSentinelPadParams();
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configureStressPadSource(snapshot.sources[source_id - 1u], source_id, expected);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "all-param exact pad snapshot load failed");

  triggerPadAndExpectParams(engine, source_id, -1.0f, -1.0f, -1.0f, expected, "snapshot exact pad params");
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
  params[33] = padDistanceAttack(params[33], distance, 1.35f, 4.0f);
  params[34] = padDistanceMultiply(params[34], distance, 1.08f, 1.35f, 0.01f, 8.0f);
  params[35] = padDistanceAdd(params[35], distance, -0.03f, -0.18f, 0.0f, 1.0f);
  params[36] = padDistanceMultiply(params[36], distance, 1.18f, 2.40f, 0.01f, 30.0f);
  params[15] = padDistanceAdd(params[15], distance, -0.04f, -0.22f, 0.0f, 2.0f);
  params[16] = padDistanceAdd(params[16], distance, 0.04f, 0.18f, 0.0f, 1.0f);
  params[17] = padDistanceAdd(params[17], distance, -0.05f, -0.30f, 0.0f, 1.0f);
  params[21] = padDistanceMultiply(params[21], distance, 0.85f, 0.45f, 40.0f, 8000.0f);
  params[22] = padDistanceMultiply(params[22], distance, 0.92f, 0.55f, 40.0f, 8000.0f);
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
  configureStressPadSource(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u], KESSHO_PRODUCT_SOURCE_PAD1, makeSentinelPadParams());
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "endpoint exact pad snapshot load failed");

  const PadParams expected = expectedEndpointMorphParams(morph, 1.0f);
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

  const PadParams expected = expectedEndpointMorphParams(morph, 1.0f);
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

void requireNamedPluckPresetParams() {
  const PadParams soft = exactPadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK);
  requireParamClose("PadSoftPluck filter cutoff max", 22u, soft[22], 2200.0f);
  requireParamClose("PadSoftPluck warmth", 16u, soft[16], 0.6f);
  requireParamClose("PadSoftPluck output trim", 52u, soft[52], 0.5f);

  const PadParams buchla = exactPadParamsFromPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK);
  requireParamClose("PadBuchlaPluck fold amount", 18u, buchla[18], 0.45f);
  requireParamClose("PadBuchlaPluck attack", 33u, buchla[33], 0.005f);
  requireParamClose("PadBuchlaPluck mod env enabled", 45u, buchla[45], 1.0f);
}

} // namespace

int main() {
  requireNamedPluckPresetParams();
  requireSnapshotExactPadParamsSurviveTrigger(KESSHO_PRODUCT_SOURCE_PAD1);
  requireSnapshotExactPadParamsSurviveTrigger(KESSHO_PRODUCT_SOURCE_PAD2);
  requireEndpointPadMorphMatchesWebPolicy(0.35f);
  requireEndpointPadMorphMatchesWebPolicy(0.65f);
  requireGeneratedEndpointPadSnapshotDoesNotNeedExactPatch(KESSHO_PRODUCT_SOURCE_PAD1, 0.35f);
  requireGeneratedEndpointPadSnapshotDoesNotNeedExactPatch(KESSHO_PRODUCT_SOURCE_PAD2, 0.65f);

  std::cout << "Kessho Product Pad Exact Patch tests passed\n";
  return 0;
}
