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
#include "../src/product/KesshoProductEngineInternal.h"
#include "../src/product/ProductDynamicsConstants.h"
#include "kessho_dynamics_drift.h"

namespace {

constexpr int kSampleRate = 48000;
constexpr int kBlockSize = 128;
constexpr int kMasterTelemetry[] = {
    0, 1, 6, 7, 8, 9, 16, 17, 18, 19, 20, 21};
constexpr size_t kMasterTelemetryCount = sizeof(kMasterTelemetry) / sizeof(kMasterTelemetry[0]);

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product dynamics master-role test failed: " << message << "\n";
    std::exit(1);
  }
}

float maxAbsDiff(const std::vector<float>& left, const std::vector<float>& right) {
  require(left.size() == right.size(), "PCM comparison lengths differed");
  float difference = 0.0f;
  for (size_t index = 0; index < left.size(); ++index) {
    require(std::isfinite(left[index]) && std::isfinite(right[index]), "PCM was not finite");
    difference = std::max(difference, std::fabs(left[index] - right[index]));
  }
  return difference;
}

float maxAbs(const std::vector<float>& signal) {
  float peak = 0.0f;
  for (const float sample : signal) {
    require(std::isfinite(sample), "PCM was not finite");
    peak = std::max(peak, std::fabs(sample));
  }
  return peak;
}

void copyParams(KesshoDynamicsDriftInstance* instance, const float* source) {
  require(instance != nullptr && source != nullptr, "dynamics parameter source was unavailable");
  float* destination = dynamics_drift_instance_get_params_ptr(instance);
  require(destination != nullptr, "dynamics parameter destination was unavailable");
  std::copy(source, source + KESSHO_DYNAMICS_DRIFT_PARAM_COUNT, destination);
  dynamics_drift_instance_commit_params(instance);
}

void writeCaptureIfRequested(
    const std::vector<float>& pcm,
    const std::vector<float>& telemetry,
    const std::vector<float>& alternate_pcm,
    const std::vector<float>& alternate_telemetry,
    uint32_t frame_count,
    uint32_t block_count,
    uint32_t alternate_frame_count,
    uint32_t alternate_block_count) {
  const char* output_path = std::getenv("KESSHO_STAGE8_OUTPUT");
  if (output_path == nullptr || output_path[0] == '\0') return;

  // Little-endian v2: magic, version, segment count, telemetry field count,
  // then (sample rate, block size, frame count, block count) for the 48 kHz
  // and 44.1 kHz segments. Each segment stores interleaved L/R PCM followed
  // by selected-telemetry records in kMasterTelemetry order.
  const std::array<uint32_t, 12> header = {
      0x38544753u,
      2u,
      2u,
      static_cast<uint32_t>(kMasterTelemetryCount),
      static_cast<uint32_t>(kSampleRate),
      static_cast<uint32_t>(kBlockSize),
      frame_count,
      block_count,
      44100u,
      static_cast<uint32_t>(kBlockSize),
      alternate_frame_count,
      alternate_block_count};
  std::ofstream output(output_path, std::ios::binary | std::ios::trunc);
  require(output.good(), "could not open requested dynamics capture output");
  output.write(
      reinterpret_cast<const char*>(header.data()),
      static_cast<std::streamsize>(header.size() * sizeof(uint32_t)));
  output.write(
      reinterpret_cast<const char*>(pcm.data()),
      static_cast<std::streamsize>(pcm.size() * sizeof(float)));
  output.write(
      reinterpret_cast<const char*>(telemetry.data()),
      static_cast<std::streamsize>(telemetry.size() * sizeof(float)));
  output.write(
      reinterpret_cast<const char*>(alternate_pcm.data()),
      static_cast<std::streamsize>(alternate_pcm.size() * sizeof(float)));
  output.write(
      reinterpret_cast<const char*>(alternate_telemetry.data()),
      static_cast<std::streamsize>(alternate_telemetry.size() * sizeof(float)));
  require(output.good(), "could not write requested dynamics capture output");
  std::cout << "Stage8 capture written: " << output_path
            << " (48k_frames=" << frame_count
            << ", 48k_blocks=" << block_count
            << ", 44.1k_frames=" << alternate_frame_count
            << ", 44.1k_blocks=" << alternate_block_count
            << ", telemetry_fields=" << kMasterTelemetryCount << ")\n";
}

void processDirect(
    KesshoDynamicsDriftInstance* instance,
    const std::vector<float>& input_l,
    const std::vector<float>& input_r,
    std::vector<float>& output_l,
    std::vector<float>& output_r,
    std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT>& telemetry) {
  require(input_l.size() == kBlockSize && input_r.size() == kBlockSize, "direct input block size differed");
  float* input = dynamics_drift_instance_get_input_ptr(instance);
  float* output = dynamics_drift_instance_get_output_ptr(instance);
  require(input != nullptr && output != nullptr, "direct dynamics buffers were unavailable");
  for (int index = 0; index < kBlockSize; ++index) {
    input[index * 2] = input_l[index];
    input[index * 2 + 1] = input_r[index];
  }
  dynamics_drift_instance_process_block(instance, kBlockSize);
  output_l.resize(kBlockSize);
  output_r.resize(kBlockSize);
  for (int index = 0; index < kBlockSize; ++index) {
    output_l[index] = output[index * 2];
    output_r[index] = output[index * 2 + 1];
  }
  const float* direct_telemetry = dynamics_drift_instance_get_telemetry_ptr(instance);
  require(direct_telemetry != nullptr, "direct dynamics telemetry was unavailable");
  std::copy(
      direct_telemetry,
      direct_telemetry + KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT,
      telemetry.begin());
}

void configureMasterAndWet(KesshoProductEngine& engine) {
  engine.fx.dynamics_master_saturation_enabled = true;
  engine.fx.dynamics_master_saturation_mode = 4u;
  engine.fx.dynamics_master_saturation_quality = 2u;
  engine.fx.dynamics_master_saturation_tone = 0.23f;
  engine.fx.dynamics_master_saturation_bias = 0.77f;
  engine.fx.dynamics_drive = 0.72f;
  engine.fx.dynamics_end_comp_enabled = true;
  engine.fx.dynamics_end_comp_mode = 4u;
  engine.fx.dynamics_end_comp_threshold = -22.0f;
  engine.fx.dynamics_end_comp_knee = 8.0f;
  engine.fx.dynamics_end_comp_ratio = 3.5f;
  engine.fx.dynamics_end_comp_attack_ms = 7.0f;
  engine.fx.dynamics_end_comp_release_ms = 140.0f;
  engine.fx.dynamics_end_comp_makeup = 1.08f;
  engine.fx.dynamics_end_comp_mix = 0.78f;
  engine.fx.dynamics_end_comp_detector_hp = 0.34f;
  engine.fx.dynamics_end_comp_detector_tilt = 0.62f;
  engine.fx.dynamics_end_comp_auto_makeup = 0.75f;
  engine.fx.dynamics_end_comp_program_release = 0.58f;
  engine.fx.dynamics_end_comp_peak_blend = 0.38f;
  engine.fx.dynamics_end_comp_clarity = 0.44f;
  engine.fx.dynamics_end_comp_two_band_amount = 0.67f;
  engine.fx.dynamics_end_comp_band_split = 0.43f;

  engine.fx.dynamics_enabled = true;
  engine.fx.dynamics_drift_enabled = true;
  engine.fx.dynamics_drift_mode = 2u;
  engine.fx.dynamics_drift_quality = 2u;
  engine.fx.dynamics_drift_mix = 0.64f;
  engine.fx.dynamics_drift_diffusion = 0.82f;
  engine.fx.dynamics_drift_age = 0.36f;
  engine.fx.dynamics_drift_depth = 0.72f;
  engine.fx.dynamics_drift_rate = 0.48f;
  engine.fx.dynamics_drift_damp = 0.56f;
  engine.fx.dynamics_drift_stereo = 0.76f;
  engine.fx.dynamics_drift_env_follow = 0.55f;
  engine.fx.dynamics_erosion_enabled = true;
  engine.fx.dynamics_erosion_mix = 0.52f;
  engine.fx.dynamics_erosion_age = 0.42f;
  engine.fx.dynamics_erosion_generation = 0.38f;
  engine.fx.dynamics_erosion_alias = 0.31f;
  engine.fx.dynamics_erosion_wow = 0.45f;
  engine.fx.dynamics_erosion_flutter = 0.35f;
  engine.fx.dynamics_erosion_drift = 0.28f;
  engine.fx.dynamics_erosion_corrosion = 0.24f;
  engine.configureDynamicsDriftModule();
}

void configureTransition(KesshoProductEngine& engine) {
  engine.fx.dynamics_master_saturation_mode = 1u;
  engine.fx.dynamics_master_saturation_quality = 1u;
  engine.fx.dynamics_master_saturation_tone = 0.81f;
  engine.fx.dynamics_master_saturation_bias = 0.36f;
  engine.fx.dynamics_drive = 0.38f;
  engine.fx.dynamics_end_comp_mode = 2u;
  engine.fx.dynamics_end_comp_mix = 0.41f;
  engine.fx.dynamics_end_comp_clarity = 0.19f;
  engine.fx.dynamics_end_comp_two_band_amount = 0.0f;
  engine.fx.dynamics_end_comp_band_split = 0.68f;
  engine.configureDynamicsDriftModule();
}

} // namespace

int main() {
  KesshoProductEngine engine(static_cast<double>(kSampleRate), kBlockSize, 0u);
  require(engine.modules_ready, "Product modules were not ready");
  configureMasterAndWet(engine);
  engine.dynamics_drift_module->reset();
  engine.configureDynamicsDriftModule();

  const float* master_params = engine.dynamics_drift_module->params();
  const float* wet_params = engine.dynamics_degrade_send_module->params();
  require(master_params != nullptr && wet_params != nullptr, "Product dynamics parameters were unavailable");
  require(master_params[kDynActive] > 0.5f, "Product master settings did not activate dynamics");
  require(std::fabs(master_params[kDynDry] - 1.0f) < 0.000001f, "Product master dry setting was not full dry");
  require(std::fabs(master_params[kDynWet]) < 0.000001f, "Product master wet setting was not zero");
  require(wet_params[kDynActive] > 0.5f, "Product degrade settings did not activate wet dynamics");

  KesshoDynamicsDriftInstance* role = dynamics_drift_instance_create_with_role(kSampleRate, 1);
  KesshoDynamicsDriftInstance* full = dynamics_drift_instance_create(kSampleRate);
  KesshoDynamicsDriftInstance* wet = dynamics_drift_instance_create(kSampleRate);
  require(role != nullptr && full != nullptr && wet != nullptr, "direct dynamics instances could not be created");
  copyParams(role, master_params);
  copyParams(full, master_params);
  copyParams(wet, wet_params);

  std::vector<float> input_l(kBlockSize), input_r(kBlockSize);
  std::vector<float> product_l(kBlockSize), product_r(kBlockSize);
  std::vector<float> product_wet_l(kBlockSize), product_wet_r(kBlockSize);
  std::vector<float> role_l, role_r, full_l, full_r, wet_l, wet_r;
  std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT> role_telemetry{};
  std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT> full_telemetry{};
  std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT> wet_telemetry{};
  uint64_t rendered_frames = 0u;
  float largest_product_role_difference = 0.0f;
  float largest_full_role_difference = 0.0f;
  std::vector<float> capture_pcm;
  std::vector<float> capture_telemetry;
  bool measuring_loud_segment = false;
  bool measuring_quiet_segment = false;
  uint32_t quiet_block_count = 0u;
  float loud_end_gain_reduction_db = 0.0f;
  float quiet_first_gain_reduction_db = 0.0f;
  float quiet_last_gain_reduction_db = 0.0f;
  float quiet_output_peak = 0.0f;
  float quiet_input_peak = 0.0f;

  const auto renderAndCompare = [&](float level_l, float level_r) {
    for (int index = 0; index < kBlockSize; ++index) {
      const float frame = static_cast<float>(rendered_frames + static_cast<uint64_t>(index));
      input_l[index] = level_l * (0.36f * std::sin(frame * 0.011f) + 0.12f * std::cos(frame * 0.037f));
      input_r[index] = level_r * (0.34f * std::sin(frame * 0.013f + 0.2f) - 0.11f * std::cos(frame * 0.031f));
    }
    engine.dynamics_drift_module->processPlanarStereo(
        input_l.data(), input_r.data(), product_l.data(), product_r.data(), kBlockSize);
    engine.dynamics_degrade_send_module->processPlanarStereo(
        input_l.data(), input_r.data(), product_wet_l.data(), product_wet_r.data(), kBlockSize);
    processDirect(role, input_l, input_r, role_l, role_r, role_telemetry);
    processDirect(full, input_l, input_r, full_l, full_r, full_telemetry);
    processDirect(wet, input_l, input_r, wet_l, wet_r, wet_telemetry);
    largest_product_role_difference = std::max(
        largest_product_role_difference,
        std::max(maxAbsDiff(product_l, role_l), maxAbsDiff(product_r, role_r)));
    largest_full_role_difference = std::max(
        largest_full_role_difference,
        std::max(maxAbsDiff(full_l, role_l), maxAbsDiff(full_r, role_r)));
    for (const int telemetry_index : kMasterTelemetry) {
      require(
          std::isfinite(role_telemetry[telemetry_index]) && std::isfinite(full_telemetry[telemetry_index]),
          "master telemetry was not finite");
      require(
          std::fabs(role_telemetry[telemetry_index] - full_telemetry[telemetry_index]) < 1.0e-6f,
          "master telemetry differed from the full path");
    }
    require(
        maxAbs(product_wet_l) > 1.0e-8f || maxAbs(product_wet_r) > 1.0e-8f,
        "Product Degrade-send instance did not remain active");
    for (int index = 0; index < kBlockSize; ++index) {
      capture_pcm.push_back(role_l[index]);
      capture_pcm.push_back(role_r[index]);
    }
    for (const int telemetry_index : kMasterTelemetry) {
      capture_telemetry.push_back(role_telemetry[telemetry_index]);
    }
    if (measuring_loud_segment) {
      loud_end_gain_reduction_db = std::max(loud_end_gain_reduction_db, role_telemetry[8]);
    }
    if (measuring_quiet_segment) {
      if (quiet_block_count == 0u) quiet_first_gain_reduction_db = role_telemetry[8];
      quiet_last_gain_reduction_db = role_telemetry[8];
      quiet_input_peak = std::max(quiet_input_peak, role_telemetry[6]);
      quiet_output_peak = std::max(quiet_output_peak, std::max(maxAbs(role_l), maxAbs(role_r)));
      ++quiet_block_count;
    }
    rendered_frames += kBlockSize;
  };

  for (int block = 0; block < 8; ++block) renderAndCompare(1.0f, 1.0f);
  measuring_loud_segment = true;
  for (int block = 0; block < 64; ++block) renderAndCompare(2.5f, 2.5f);
  measuring_loud_segment = false;
  measuring_quiet_segment = true;
  for (int block = 0; block < 192; ++block) renderAndCompare(0.22f, 0.22f);
  measuring_quiet_segment = false;
  require(quiet_block_count * static_cast<uint32_t>(kBlockSize) >= static_cast<uint32_t>(kSampleRate / 2),
          "quiet master-release segment was shorter than 0.5 seconds");
  require(quiet_input_peak > 0.01f, "quiet master-release input was not nonzero");
  require(quiet_output_peak > 0.0001f, "quiet master-release output was silent");
  require(
      loud_end_gain_reduction_db > quiet_last_gain_reduction_db + 0.01f,
      "end compressor gain reduction did not respond to the loudness change");
  require(
      quiet_first_gain_reduction_db > quiet_last_gain_reduction_db + 0.001f,
      "end compressor program release did not change during the quiet segment");
  require(
      dynamics_drift_instance_get_test_master_skipped_wet_frames(role) == rendered_frames,
      "master role did not skip wet work for every rendered frame");
  require(
      dynamics_drift_instance_get_test_wet_work_frames(full) == rendered_frames,
      "generic full path did not retain wet work");
  require(
      dynamics_drift_instance_get_test_wet_work_frames(wet) == rendered_frames,
      "simultaneous wet instance did not retain wet work");

  configureTransition(engine);
  master_params = engine.dynamics_drift_module->params();
  copyParams(role, master_params);
  copyParams(full, master_params);
  for (int block = 0; block < 8; ++block) renderAndCompare(1.0f, 1.0f);

  require(dynamics_drift_instance_reset(role, static_cast<float>(kSampleRate)) == 1, "master role reset failed");
  require(dynamics_drift_instance_reset(full, static_cast<float>(kSampleRate)) == 1, "full path reset failed");
  require(engine.dynamics_drift_module->prepare(kSampleRate, kBlockSize), "Product master reprepare failed");
  engine.configureDynamicsDriftModule();
  master_params = engine.dynamics_drift_module->params();
  copyParams(role, master_params);
  copyParams(full, master_params);
  rendered_frames = 0u;
  for (int block = 0; block < 4; ++block) renderAndCompare(1.0f, 1.0f);
  require(
      dynamics_drift_instance_get_test_master_skipped_wet_frames(role) == rendered_frames,
      "master role did not retain its role across reset/reprepare");

  require(largest_product_role_difference < 1.0e-7f, "Product master output differed from the explicit master role");
  require(largest_full_role_difference < 1.0e-7f, "full and master PCM differed for Product master settings");

  constexpr int kAlternateSampleRate = 44100;
  const auto alternate_engine = std::make_unique<KesshoProductEngine>(
      static_cast<double>(kAlternateSampleRate), kBlockSize, 0u);
  require(alternate_engine->modules_ready, "44.1 kHz Product modules were not ready");
  configureMasterAndWet(*alternate_engine);
  alternate_engine->dynamics_drift_module->reset();
  require(
      alternate_engine->dynamics_drift_module->prepare(kAlternateSampleRate, kBlockSize),
      "44.1 kHz Product master reprepare failed");
  alternate_engine->dynamics_degrade_send_module->reset();
  require(
      alternate_engine->dynamics_degrade_send_module->prepare(kAlternateSampleRate, kBlockSize),
      "44.1 kHz Product wet reprepare failed");
  alternate_engine->configureDynamicsDriftModule();
  const float* alternate_master_params = alternate_engine->dynamics_drift_module->params();
  const float* alternate_wet_params = alternate_engine->dynamics_degrade_send_module->params();
  require(
      alternate_master_params != nullptr && alternate_wet_params != nullptr,
      "44.1 kHz Product dynamics parameters were unavailable");

  KesshoDynamicsDriftInstance* alternate_role =
      dynamics_drift_instance_create_with_role(static_cast<float>(kAlternateSampleRate), 1);
  KesshoDynamicsDriftInstance* alternate_full =
      dynamics_drift_instance_create(static_cast<float>(kAlternateSampleRate));
  KesshoDynamicsDriftInstance* alternate_wet =
      dynamics_drift_instance_create(static_cast<float>(kAlternateSampleRate));
  require(
      alternate_role != nullptr && alternate_full != nullptr && alternate_wet != nullptr,
      "44.1 kHz direct dynamics instances could not be created");
  require(
      dynamics_drift_instance_reset(alternate_role, static_cast<float>(kAlternateSampleRate)) == 1 &&
          dynamics_drift_instance_reset(alternate_full, static_cast<float>(kAlternateSampleRate)) == 1 &&
          dynamics_drift_instance_reset(alternate_wet, static_cast<float>(kAlternateSampleRate)) == 1,
      "44.1 kHz direct dynamics reset failed");
  copyParams(alternate_role, alternate_master_params);
  copyParams(alternate_full, alternate_master_params);
  copyParams(alternate_wet, alternate_wet_params);

  std::vector<float> alternate_input_l(kBlockSize), alternate_input_r(kBlockSize);
  std::vector<float> alternate_product_l(kBlockSize), alternate_product_r(kBlockSize);
  std::vector<float> alternate_product_wet_l(kBlockSize), alternate_product_wet_r(kBlockSize);
  std::vector<float> alternate_role_l, alternate_role_r, alternate_full_l, alternate_full_r;
  std::vector<float> alternate_wet_l, alternate_wet_r;
  std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT> alternate_role_telemetry{};
  std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT> alternate_full_telemetry{};
  std::array<float, KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT> alternate_wet_telemetry{};
  float alternate_product_role_difference = 0.0f;
  float alternate_full_role_difference = 0.0f;
  float alternate_output_peak = 0.0f;
  std::vector<float> alternate_capture_pcm;
  std::vector<float> alternate_capture_telemetry;
  for (int block = 0; block < 8; ++block) {
    for (int index = 0; index < kBlockSize; ++index) {
      const float frame = static_cast<float>(block * kBlockSize + index);
      alternate_input_l[index] = 0.48f * std::sin(frame * 0.017f) + 0.07f * std::cos(frame * 0.043f);
      alternate_input_r[index] = 0.41f * std::sin(frame * 0.019f + 0.3f) - 0.09f * std::cos(frame * 0.029f);
    }
    alternate_engine->dynamics_drift_module->processPlanarStereo(
        alternate_input_l.data(),
        alternate_input_r.data(),
        alternate_product_l.data(),
        alternate_product_r.data(),
        kBlockSize);
    alternate_engine->dynamics_degrade_send_module->processPlanarStereo(
        alternate_input_l.data(),
        alternate_input_r.data(),
        alternate_product_wet_l.data(),
        alternate_product_wet_r.data(),
        kBlockSize);
    processDirect(
        alternate_role,
        alternate_input_l,
        alternate_input_r,
        alternate_role_l,
        alternate_role_r,
        alternate_role_telemetry);
    processDirect(
        alternate_full,
        alternate_input_l,
        alternate_input_r,
        alternate_full_l,
        alternate_full_r,
        alternate_full_telemetry);
    processDirect(
        alternate_wet,
        alternate_input_l,
        alternate_input_r,
        alternate_wet_l,
        alternate_wet_r,
        alternate_wet_telemetry);
    alternate_product_role_difference = std::max(
        alternate_product_role_difference,
        std::max(
            maxAbsDiff(alternate_product_l, alternate_role_l),
            maxAbsDiff(alternate_product_r, alternate_role_r)));
    alternate_full_role_difference = std::max(
        alternate_full_role_difference,
        std::max(
            maxAbsDiff(alternate_full_l, alternate_role_l),
            maxAbsDiff(alternate_full_r, alternate_role_r)));
    alternate_output_peak = std::max(
        alternate_output_peak,
        std::max(maxAbs(alternate_role_l), maxAbs(alternate_role_r)));
    for (int index = 0; index < kBlockSize; ++index) {
      alternate_capture_pcm.push_back(alternate_role_l[index]);
      alternate_capture_pcm.push_back(alternate_role_r[index]);
    }
    for (const int telemetry_index : kMasterTelemetry) {
      alternate_capture_telemetry.push_back(alternate_role_telemetry[telemetry_index]);
    }
    require(
        maxAbs(alternate_product_wet_l) > 1.0e-8f || maxAbs(alternate_product_wet_r) > 1.0e-8f,
        "44.1 kHz Product Degrade-send instance did not remain active");
    for (const int telemetry_index : kMasterTelemetry) {
      require(
          std::isfinite(alternate_role_telemetry[telemetry_index]) &&
              std::isfinite(alternate_full_telemetry[telemetry_index]),
          "44.1 kHz master telemetry was not finite");
    }
  }
  require(alternate_output_peak > 0.0001f, "44.1 kHz master output was silent");
  require(
      alternate_product_role_difference < 1.0e-7f && alternate_full_role_difference < 1.0e-7f,
      "44.1 kHz Product and full master PCM differed from the explicit role");
  require(
      dynamics_drift_instance_get_test_master_skipped_wet_frames(alternate_role) == 8u * kBlockSize,
      "44.1 kHz master role did not skip wet work after reset/reprepare");
  require(
      dynamics_drift_instance_get_test_wet_work_frames(alternate_full) == 8u * kBlockSize &&
          dynamics_drift_instance_get_test_wet_work_frames(alternate_wet) == 8u * kBlockSize,
      "44.1 kHz full/wet roles did not retain wet work after reset/reprepare");

  require(capture_pcm.size() % 2u == 0u, "dynamics capture PCM was not stereo interleaved");
  require(
      capture_telemetry.size() % kMasterTelemetryCount == 0u,
      "dynamics capture telemetry records were incomplete");
  require(
      alternate_capture_pcm.size() % 2u == 0u,
      "44.1 kHz dynamics capture PCM was not stereo interleaved");
  require(
      alternate_capture_telemetry.size() % kMasterTelemetryCount == 0u,
      "44.1 kHz dynamics capture telemetry records were incomplete");
  writeCaptureIfRequested(
      capture_pcm,
      capture_telemetry,
      alternate_capture_pcm,
      alternate_capture_telemetry,
      static_cast<uint32_t>(capture_pcm.size() / 2u),
      static_cast<uint32_t>(capture_telemetry.size() / kMasterTelemetryCount),
      static_cast<uint32_t>(alternate_capture_pcm.size() / 2u),
      static_cast<uint32_t>(alternate_capture_telemetry.size() / kMasterTelemetryCount));

  std::cout << "Kessho Product dynamics master-role checks passed"
            << " (PCM max Product/role=" << largest_product_role_difference
            << ", full/role=" << largest_full_role_difference
            << ", loud GR dB=" << loud_end_gain_reduction_db
            << ", quiet GR first/last dB=" << quiet_first_gain_reduction_db
            << "/" << quiet_last_gain_reduction_db
            << ", quiet input/output peak=" << quiet_input_peak
            << "/" << quiet_output_peak
            << ", 44.1 kHz PCM max Product/role=" << alternate_product_role_difference
            << ", 44.1 kHz full/role=" << alternate_full_role_difference
            << ", skipped after reset="
            << dynamics_drift_instance_get_test_master_skipped_wet_frames(role)
            << ", wet frames=" << dynamics_drift_instance_get_test_wet_work_frames(wet) << ")\n";

  dynamics_drift_instance_destroy(alternate_wet);
  dynamics_drift_instance_destroy(alternate_full);
  dynamics_drift_instance_destroy(alternate_role);
  dynamics_drift_instance_destroy(wet);
  dynamics_drift_instance_destroy(full);
  dynamics_drift_instance_destroy(role);
  return 0;
}
