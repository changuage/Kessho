#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

#include "kessho_reverb.h"

namespace {

constexpr int kSampleRate = 48000;
constexpr int kBlockSize = 128;
constexpr int kPreludeBlocks = 64;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product reverb dependency test failed: " << message << "\n";
    std::exit(1);
  }
}

float maxAbs(const std::vector<float>& samples) {
  float peak = 0.0f;
  for (const float sample : samples) {
    require(std::isfinite(sample), "reverb output was not finite");
    peak = std::max(peak, std::fabs(sample));
  }
  return peak;
}

float diffRms(const std::vector<float>& left, const std::vector<float>& right) {
  require(left.size() == right.size(), "PCM comparison lengths differed");
  double sum = 0.0;
  for (size_t index = 0; index < left.size(); ++index) {
    const double difference = static_cast<double>(left[index]) - right[index];
    sum += difference * difference;
  }
  return static_cast<float>(std::sqrt(sum / static_cast<double>(std::max<size_t>(1, left.size()))));
}

void configureInitial(KesshoReverbInstance* instance, float width = 0.85f, float warp = 0.2f) {
  reverb_instance_begin_parameter_update(instance);
  reverb_instance_set_type(instance, 1);
  reverb_instance_set_quality(instance, 0);
  reverb_instance_set_params(instance, 0.82f, 2.4f, 0.5f, 0.88f, 0.24f, 24.0f, width);
  reverb_instance_set_shimmer(instance, 0.15f, 12.0f);
  reverb_instance_set_slow_mod(instance, 0.04f, 0.2f);
  reverb_instance_set_reverse(instance, 0.08f, 2.0f);
  reverb_instance_set_chorus(instance, 0.35f, 12.0f);
  reverb_instance_set_mod_character(instance, 2);
  reverb_instance_set_multiband_damp(instance, 0.08f, 0.34f, 900.0f);
  reverb_instance_set_input_tone(instance, 0.0f);
  reverb_instance_set_shimmer_feedback(instance, 0.12f);
  reverb_instance_set_warp(instance, warp);
  reverb_instance_set_cross_feed(instance, 0.2f);
  reverb_instance_set_early_reflections(instance, 0.35f);
  reverb_instance_set_air_absorption(instance, 0.25f);
  reverb_instance_set_saturation_mode(instance, 1);
  reverb_instance_set_transient_smooth(instance, 0.3f);
  reverb_instance_set_er_lp_freq(instance, 2500.0f);
  reverb_instance_set_bloom(instance, 0.25f);
  reverb_instance_end_parameter_update(instance);
}

std::vector<float> render(KesshoReverbInstance* instance, int blocks, bool impulse) {
  float* input = reverb_instance_get_input_ptr(instance);
  float* output = reverb_instance_get_output_ptr(instance);
  require(input != nullptr && output != nullptr, "reverb buffers were unavailable");

  std::vector<float> samples;
  samples.reserve(static_cast<size_t>(blocks * kBlockSize * 2));
  for (int block = 0; block < blocks; ++block) {
    std::fill(input, input + kBlockSize * 2, 0.0f);
    if (impulse && block == 0) {
      input[0] = 0.8f;
      input[1] = 0.45f;
    }
    reverb_instance_process_block(instance, kBlockSize);
    samples.insert(samples.end(), output, output + kBlockSize * 2);
  }
  return samples;
}

void applyFinalGroupedEdit(KesshoReverbInstance* instance) {
  reverb_instance_begin_parameter_update(instance);
  reverb_instance_set_params(instance, 0.9f, 2.8f, 0.5f, 0.88f, 0.24f, 24.0f, 0.35f);
  reverb_instance_set_warp(instance, 0.6f);
  reverb_instance_set_bloom(instance, 0.4f);
  reverb_instance_end_parameter_update(instance);
}

void applyFinalUnbatchedEdit(KesshoReverbInstance* instance) {
  reverb_instance_set_params(instance, 0.9f, 2.8f, 0.5f, 0.88f, 0.24f, 24.0f, 0.35f);
  reverb_instance_set_warp(instance, 0.6f);
  reverb_instance_set_bloom(instance, 0.4f);
}

// Optional Stage 6 output layout (little-endian native test binary):
// uint32 magic/version/frame-count, then float metadata[6] in the order
// {stage_peak, stage_rms, final_size, final_modulation, final_er, planar_rms},
// followed by the complete interleaved PCM sequence (L0,R0,L1,R1,...).
constexpr uint32_t kStage6OutputMagic = 0x36565250u;
constexpr uint32_t kStage6OutputVersion = 1u;

struct Stage6RenderResult {
  std::vector<float> samples;
  float peak = 0.0f;
  float rms = 0.0f;
};

void configureStage6Initial(KesshoReverbInstance* instance) {
  reverb_instance_begin_parameter_update(instance);
  reverb_instance_set_type(instance, 1);
  reverb_instance_set_quality(instance, 1);
  reverb_instance_set_params(instance, 0.9f, 2.1f, 0.4f, 0.76f, 0.34f, 17.0f, 0.88f);
  reverb_instance_set_shimmer(instance, 0.1f, 7.0f);
  reverb_instance_set_slow_mod(instance, 0.035f, 0.25f);
  reverb_instance_set_reverse(instance, 0.0f, 2.0f);
  reverb_instance_set_chorus(instance, 0.4f, 9.0f);
  reverb_instance_set_mod_character(instance, 2);
  reverb_instance_set_multiband_damp(instance, 0.07f, 0.3f, 1100.0f);
  reverb_instance_set_input_tone(instance, 0.05f);
  reverb_instance_set_shimmer_feedback(instance, 0.08f);
  reverb_instance_set_warp(instance, 0.18f);
  reverb_instance_set_cross_feed(instance, 0.16f);
  reverb_instance_set_early_reflections(instance, 0.25f);
  reverb_instance_set_air_absorption(instance, 0.2f);
  reverb_instance_set_saturation_mode(instance, 1);
  reverb_instance_set_transient_smooth(instance, 0.2f);
  reverb_instance_set_er_lp_freq(instance, 2800.0f);
  reverb_instance_set_bloom(instance, 0.12f);
  reverb_instance_end_parameter_update(instance);
}

void fillStage6Input(int block, int blockSize, int frameOffset,
                     std::vector<float>& left, std::vector<float>& right) {
  left.resize(static_cast<size_t>(blockSize));
  right.resize(static_cast<size_t>(blockSize));
  for (int frame = 0; frame < blockSize; ++frame) {
    const int absoluteFrame = frameOffset + frame;
    const float phase = static_cast<float>(absoluteFrame) * 0.017f;
    const float pulse =
        ((block == 0 || block == 40 || block == 48 || block == 80) && frame == 0) ? 0.7f : 0.0f;
    left[static_cast<size_t>(frame)] = 0.14f * std::sin(phase) + pulse;
    right[static_cast<size_t>(frame)] = 0.11f * std::cos(phase * 0.73f) + pulse * 0.72f;
  }
}

void applyStage6Transition(KesshoReverbInstance* instance, int block) {
  if (block == 16) {
    reverb_instance_set_quality(instance, 0); // short Ultra transition
  } else if (block == 24) {
    reverb_instance_set_quality(instance, 2); // short Lite transition
  } else if (block == 32) {
    reverb_instance_begin_parameter_update(instance);
    reverb_instance_set_params(instance, 0.9f, 2.75f, 0.4f, 0.76f, 0.58f, 17.0f, 0.88f);
    reverb_instance_set_early_reflections(instance, 0.52f);
    reverb_instance_set_er_lp_freq(instance, 1900.0f);
    reverb_instance_end_parameter_update(instance);
  } else if (block == 40) {
    require(reverb_instance_reset(instance, static_cast<float>(kSampleRate)) == 1,
            "stage 6 reset failed");
    configureStage6Initial(instance);
  } else if (block == 48) {
    reverb_instance_set_type(instance, 4); // Dattorro plate
    reverb_instance_set_quality(instance, 1);
    reverb_instance_set_params(instance, 0.86f, 2.35f, 0.45f, 0.8f, 0.42f, 11.0f, 0.9f);
    reverb_instance_set_early_reflections(instance, 0.38f);
  } else if (block == 80) {
    reverb_instance_set_type(instance, 5); // Dattorro shimmer
    reverb_instance_set_shimmer(instance, 0.45f, 12.0f);
    reverb_instance_set_shimmer_feedback(instance, 0.32f);
    reverb_instance_set_params(instance, 0.88f, 2.8f, 0.45f, 0.82f, 0.64f, 11.0f, 0.9f);
  }
}

Stage6RenderResult renderStage6(KesshoReverbInstance* instance, bool planar) {
  constexpr int kStage6Blocks = 128;
  Stage6RenderResult result;
  std::vector<float> left;
  std::vector<float> right;
  std::vector<float> outputLeft;
  std::vector<float> outputRight;
  int frameOffset = 0;
  double squareSum = 0.0;
  for (int block = 0; block < kStage6Blocks; ++block) {
    const int blockSize = block % 4 == 0 ? 128 : (block % 4 == 1 ? 96 : (block % 4 == 2 ? 64 : 128));
    applyStage6Transition(instance, block);
    fillStage6Input(block, blockSize, frameOffset, left, right);
    if (planar) {
      outputLeft.assign(static_cast<size_t>(blockSize), 0.0f);
      outputRight.assign(static_cast<size_t>(blockSize), 0.0f);
      reverb_instance_process_planar_block(
          instance, left.data(), right.data(), outputLeft.data(), outputRight.data(), blockSize);
      for (int frame = 0; frame < blockSize; ++frame) {
        result.samples.push_back(outputLeft[static_cast<size_t>(frame)]);
        result.samples.push_back(outputRight[static_cast<size_t>(frame)]);
      }
    } else {
      float* input = reverb_instance_get_input_ptr(instance);
      float* output = reverb_instance_get_output_ptr(instance);
      require(input != nullptr && output != nullptr, "stage 6 interleaved buffers unavailable");
      for (int frame = 0; frame < blockSize; ++frame) {
        input[frame * 2] = left[static_cast<size_t>(frame)];
        input[frame * 2 + 1] = right[static_cast<size_t>(frame)];
      }
      reverb_instance_process_block(instance, blockSize);
      result.samples.insert(result.samples.end(), output, output + blockSize * 2);
    }
    frameOffset += blockSize;
  }
  result.peak = maxAbs(result.samples);
  for (const float sample : result.samples) {
    squareSum += static_cast<double>(sample) * static_cast<double>(sample);
  }
  result.rms = static_cast<float>(std::sqrt(squareSum / static_cast<double>(std::max<size_t>(1, result.samples.size()))));
  return result;
}

void writeStage6Output(const char* path, const Stage6RenderResult& interleaved,
                       const Stage6RenderResult& planar) {
  std::ofstream output(path, std::ios::binary);
  require(output.good(), "stage 6 output could not be opened");
  const uint32_t frameCount = static_cast<uint32_t>(interleaved.samples.size() / 2u);
  const float metadata[6] = {
      interleaved.peak,
      interleaved.rms,
      2.8f,
      0.64f,
      0.38f,
      planar.rms,
  };
  output.write(reinterpret_cast<const char*>(&kStage6OutputMagic), sizeof(kStage6OutputMagic));
  output.write(reinterpret_cast<const char*>(&kStage6OutputVersion), sizeof(kStage6OutputVersion));
  output.write(reinterpret_cast<const char*>(&frameCount), sizeof(frameCount));
  output.write(reinterpret_cast<const char*>(metadata), sizeof(metadata));
  output.write(reinterpret_cast<const char*>(interleaved.samples.data()),
               static_cast<std::streamsize>(interleaved.samples.size() * sizeof(float)));
  require(output.good(), "stage 6 output write failed");
}

void runStage6Fixture() {
  KesshoReverbInstance* interleaved = reverb_instance_create(static_cast<float>(kSampleRate));
  KesshoReverbInstance* planar = reverb_instance_create(static_cast<float>(kSampleRate));
  require(interleaved != nullptr && planar != nullptr, "stage 6 instances could not be created");
  configureStage6Initial(interleaved);
  configureStage6Initial(planar);
  const Stage6RenderResult interleavedResult = renderStage6(interleaved, false);
  const Stage6RenderResult planarResult = renderStage6(planar, true);
  require(interleavedResult.peak > 1.0e-5f, "stage 6 reverb output was silent");
  require(planarResult.peak > 1.0e-5f, "stage 6 planar reverb output was silent");
  require(diffRms(interleavedResult.samples, planarResult.samples) < 1.0e-7f,
          "stage 6 planar/interleaved PCM differed");
  if (const char* outputPath = std::getenv("KESSHO_STAGE6_OUTPUT"); outputPath != nullptr && *outputPath != '\0') {
    writeStage6Output(outputPath, interleavedResult, planarResult);
  }
  reverb_instance_destroy(planar);
  reverb_instance_destroy(interleaved);
}

// Optional Stage 7 raw-output layout (little-endian native test binary):
// uint32 magic/version/sample-rate/block-size/active-frame-count/tail-frame-count,
// then float settings[7] in the order {decay, size, damping, diffusion,
// modulation, predelay-ms, width}, followed by float32 interleaved PCM.
constexpr uint32_t kStage7OutputMagic = 0x37565250u;
constexpr uint32_t kStage7OutputVersion = 1u;

uint32_t nextStage7Random(uint32_t& state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state;
}

void configureStage7Balanced(KesshoReverbInstance* instance) {
  reverb_instance_begin_parameter_update(instance);
  reverb_instance_set_type(instance, 1);
  reverb_instance_set_quality(instance, 1); // actual type-1 Balanced FDN
  reverb_instance_set_params(instance, 0.96f, 2.65f, 0.62f, 0.94f, 0.35f, 25.0f, 0.98f);
  reverb_instance_set_shimmer(instance, 0.05f, 12.0f);
  reverb_instance_set_slow_mod(instance, 0.025f, 0.10f);
  reverb_instance_set_reverse(instance, 0.0f, 2.6f);
  reverb_instance_set_chorus(instance, 0.12f, 16.0f);
  reverb_instance_set_mod_character(instance, 2);
  reverb_instance_set_multiband_damp(instance, 0.35f, 0.68f, 720.0f);
  reverb_instance_set_input_tone(instance, -0.18f);
  reverb_instance_set_shimmer_feedback(instance, 0.02f);
  reverb_instance_set_warp(instance, 0.7f);
  reverb_instance_set_cross_feed(instance, 0.58f);
  reverb_instance_set_early_reflections(instance, 0.02f);
  reverb_instance_set_air_absorption(instance, 0.42f);
  reverb_instance_set_saturation_mode(instance, 1);
  reverb_instance_set_transient_smooth(instance, 0.08f);
  reverb_instance_set_er_lp_freq(instance, 1800.0f);
  reverb_instance_set_bloom(instance, -0.2f);
  reverb_instance_end_parameter_update(instance);
}

void runStage7Fixture() {
  constexpr int kBlockFrames = 128;
  constexpr int kActiveBlocks = 256;
  constexpr int kTailBlocks = 1024;
  constexpr int kActiveFrames = kActiveBlocks * kBlockFrames;
  constexpr int kTailFrames = kTailBlocks * kBlockFrames;
  constexpr int kTotalFrames = kActiveFrames + kTailFrames;

  KesshoReverbInstance* instance = reverb_instance_create(static_cast<float>(kSampleRate));
  require(instance != nullptr, "stage 7 Balanced instance could not be created");
  configureStage7Balanced(instance);
  float* input = reverb_instance_get_input_ptr(instance);
  float* output = reverb_instance_get_output_ptr(instance);
  require(input != nullptr && output != nullptr, "stage 7 Balanced buffers unavailable");

  std::vector<float> samples;
  samples.reserve(static_cast<size_t>(kTotalFrames) * 2u);
  uint32_t randomState = 0x6d2b79f5u;
  for (int block = 0; block < kActiveBlocks + kTailBlocks; ++block) {
    const bool active = block < kActiveBlocks;
    for (int frame = 0; frame < kBlockFrames; ++frame) {
      const int absoluteFrame = block * kBlockFrames + frame;
      if (!active) {
        input[frame * 2] = 0.0f;
        input[frame * 2 + 1] = 0.0f;
        continue;
      }
      const float noise =
          (static_cast<float>(nextStage7Random(randomState) & 0xffffu) / 32768.0f - 1.0f) * 0.015f;
      const float time = static_cast<float>(absoluteFrame) / static_cast<float>(kSampleRate);
      const float pad = std::sin(6.2831853071795864769f * 146.83f * time) * 0.035f
                      + std::sin(6.2831853071795864769f * 220.0f * time) * 0.024f;
      const float percussion = (frame == 0 && block % 32 == 0) ? 0.35f : 0.0f;
      input[frame * 2] = pad + noise + percussion;
      input[frame * 2 + 1] = pad * 0.72f - noise * 0.4f + percussion * 0.8f;
    }
    reverb_instance_process_block(instance, kBlockFrames);
    samples.insert(samples.end(), output, output + kBlockFrames * 2);
  }

  const float peak = maxAbs(samples);
  require(peak > 1.0e-5f, "stage 7 Balanced render was silent");
  if (const char* outputPath = std::getenv("KESSHO_STAGE7_OUTPUT");
      outputPath != nullptr && *outputPath != '\0') {
    std::ofstream file(outputPath, std::ios::binary);
    require(file.good(), "stage 7 output could not be opened");
    const uint32_t sampleRate = static_cast<uint32_t>(kSampleRate);
    const uint32_t blockFrames = static_cast<uint32_t>(kBlockFrames);
    const uint32_t activeFrames = static_cast<uint32_t>(kActiveFrames);
    const uint32_t tailFrames = static_cast<uint32_t>(kTailFrames);
    const float settings[7] = {0.96f, 2.65f, 0.62f, 0.94f, 0.35f, 25.0f, 0.98f};
    file.write(reinterpret_cast<const char*>(&kStage7OutputMagic), sizeof(kStage7OutputMagic));
    file.write(reinterpret_cast<const char*>(&kStage7OutputVersion), sizeof(kStage7OutputVersion));
    file.write(reinterpret_cast<const char*>(&sampleRate), sizeof(sampleRate));
    file.write(reinterpret_cast<const char*>(&blockFrames), sizeof(blockFrames));
    file.write(reinterpret_cast<const char*>(&activeFrames), sizeof(activeFrames));
    file.write(reinterpret_cast<const char*>(&tailFrames), sizeof(tailFrames));
    file.write(reinterpret_cast<const char*>(settings), sizeof(settings));
    file.write(reinterpret_cast<const char*>(samples.data()),
               static_cast<std::streamsize>(samples.size() * sizeof(float)));
    require(file.good(), "stage 7 output write failed");
  }
  std::cout << "Stage 7 Balanced fixture passed (frames=" << kTotalFrames
            << ", active=" << kActiveFrames << ", tail=" << kTailFrames
            << ", peak=" << peak << ")\n";
  reverb_instance_destroy(instance);
}

} // namespace

int main() {
  KesshoReverbInstance* actual = reverb_instance_create(static_cast<float>(kSampleRate));
  KesshoReverbInstance* expected = reverb_instance_create(static_cast<float>(kSampleRate));
  require(actual != nullptr && expected != nullptr, "reverb instances could not be created");

  reverb_instance_reset_update_counters(actual);
  reverb_instance_reset_update_counters(expected);
  configureInitial(actual);
  configureInitial(expected);
  const unsigned int initialPresetUpdates = reverb_instance_get_preset_update_count(actual);
  const unsigned int initialPredelayUpdates = reverb_instance_get_predelay_update_count(actual);
  require(initialPresetUpdates == 1u, "initial batch rebuilt preset more than once");
  require(initialPredelayUpdates == 1u, "initial batch missed predelay rebuild");

  const std::vector<float> actualPrelude = render(actual, kPreludeBlocks, true);
  const std::vector<float> expectedPrelude = render(expected, kPreludeBlocks, true);
  require(maxAbs(actualPrelude) > 1.0e-5f, "active reverb tail was silent");
  require(diffRms(actualPrelude, expectedPrelude) < 1.0e-7f, "initial PCM differed between instances");

  reverb_instance_reset_update_counters(actual);
  configureInitial(actual);
  const unsigned int identicalPresetUpdates = reverb_instance_get_preset_update_count(actual);
  const unsigned int identicalPredelayUpdates = reverb_instance_get_predelay_update_count(actual);
  require(identicalPresetUpdates == 0u, "identical commit rebuilt preset");
  require(identicalPredelayUpdates == 0u, "identical commit rebuilt predelay");

  reverb_instance_reset_update_counters(actual);
  reverb_instance_begin_parameter_update(actual);
  reverb_instance_set_params(actual, 0.82f, 2.4f, 0.5f, 0.88f, 0.24f, 24.0f, 0.35f);
  reverb_instance_end_parameter_update(actual);
  const std::vector<float> actualWidth = render(actual, 1, false);
  const unsigned int widthPresetUpdates = reverb_instance_get_preset_update_count(actual);
  const unsigned int widthPredelayUpdates = reverb_instance_get_predelay_update_count(actual);
  require(widthPresetUpdates == 0u, "width-only edit rebuilt preset");
  require(widthPredelayUpdates == 0u, "width-only edit rebuilt predelay");

  reverb_instance_begin_parameter_update(expected);
  reverb_instance_set_params(expected, 0.82f, 2.4f, 0.5f, 0.88f, 0.24f, 24.0f, 0.35f);
  reverb_instance_end_parameter_update(expected);
  const std::vector<float> expectedWidth = render(expected, 1, false);
  require(diffRms(actualWidth, expectedWidth) < 1.0e-7f, "width-only PCM differed from baseline");

  reverb_instance_reset_update_counters(actual);
  applyFinalGroupedEdit(actual);
  const std::vector<float> actualGrouped = render(actual, 1, false);
  const unsigned int groupedPresetUpdates = reverb_instance_get_preset_update_count(actual);
  const unsigned int groupedPredelayUpdates = reverb_instance_get_predelay_update_count(actual);
  require(groupedPresetUpdates <= 1u, "grouped dependencies rebuilt preset repeatedly");
  require(groupedPredelayUpdates == 0u, "grouped edit rebuilt unchanged predelay");

  applyFinalUnbatchedEdit(expected);
  const std::vector<float> expectedGrouped = render(expected, 1, false);
  require(diffRms(actualGrouped, expectedGrouped) < 1.0e-7f, "grouped dependency PCM differed from baseline");

  KesshoReverbInstance* second = reverb_instance_create(static_cast<float>(kSampleRate));
  require(second != nullptr, "second reverb instance could not be created");
  configureInitial(second);
  reverb_instance_reset_update_counters(second);
  reverb_instance_begin_parameter_update(second);
  reverb_instance_set_params(second, 0.82f, 2.4f, 0.5f, 0.88f, 0.24f, 24.0f, 0.3f);
  reverb_instance_end_parameter_update(second);
  require(reverb_instance_get_preset_update_count(second) == 0u, "second instance leaked preset dirty state");
  require(reverb_instance_reset(second, static_cast<float>(kSampleRate)) == 1, "reverb reset failed");
  reverb_instance_reset_update_counters(second);
  configureInitial(second);
  require(reverb_instance_get_preset_update_count(second) == 1u, "reset did not restore preset dirty state");
  require(reverb_instance_get_predelay_update_count(second) == 1u, "reset did not restore predelay dirty state");
  require(maxAbs(render(second, kPreludeBlocks, true)) > 1.0e-5f, "reset reverb tail was silent");

  runStage6Fixture();
  runStage7Fixture();

  reverb_instance_destroy(second);
  reverb_instance_destroy(expected);
  reverb_instance_destroy(actual);
  std::cout << "Kessho Product reverb dependency checks passed"
            << " (preset updates initial/identical/width/grouped="
            << initialPresetUpdates << "/" << identicalPresetUpdates << "/" << widthPresetUpdates << "/"
            << groupedPresetUpdates << ", predelay initial/identical/width/grouped="
            << initialPredelayUpdates << "/" << identicalPredelayUpdates << "/" << widthPredelayUpdates << "/"
            << groupedPredelayUpdates << ")\n";
  return 0;
}
