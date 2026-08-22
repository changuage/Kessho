#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "ProductSnapshotTestHelpers.h"

namespace {
constexpr uint32_t kSampleRate = 48000u;
constexpr uint32_t kBlock = 128u;
constexpr uint32_t kSeconds = 30u;

void writeU16(std::ofstream& out, uint16_t v) { out.put(static_cast<char>(v & 0xff)); out.put(static_cast<char>((v >> 8) & 0xff)); }
void writeU32(std::ofstream& out, uint32_t v) { for (int i=0;i<4;++i) out.put(static_cast<char>((v >> (8*i)) & 0xff)); }

void writeFloatWav(const std::string& path, const std::vector<float>& left, const std::vector<float>& right) {
  const uint32_t frames = static_cast<uint32_t>(std::min(left.size(), right.size()));
  const uint16_t channels = 2, bits = 32, format = 3; // IEEE float
  const uint32_t dataBytes = frames * channels * sizeof(float);
  std::ofstream out(path, std::ios::binary);
  out.write("RIFF",4); writeU32(out,36u+dataBytes); out.write("WAVE",4);
  out.write("fmt ",4); writeU32(out,16); writeU16(out,format); writeU16(out,channels);
  writeU32(out,kSampleRate); writeU32(out,kSampleRate*channels*sizeof(float)); writeU16(out,channels*sizeof(float)); writeU16(out,bits);
  out.write("data",4); writeU32(out,dataBytes);
  for (uint32_t i=0;i<frames;++i) { out.write(reinterpret_cast<const char*>(&left[i]),4); out.write(reinterpret_cast<const char*>(&right[i]),4); }
}

void configureLane(KesshoProductSequencerLaneSnapshot& lane, uint32_t target, uint32_t steps, uint32_t fills, uint32_t div, float midi, float vel, float hold, uint32_t seed) {
  lane.enabled = 1;
  lane.target_source_id = target;
  lane.step_count = steps;
  lane.fill_count = fills;
  lane.clock_division = div;
  lane.probability = 0.92f;
  lane.ratchet = 1;
  lane.midi_note = midi;
  lane.velocity = vel;
  lane.hold_seconds = hold;
  lane.morph = 0.42f;
  lane.distance = 0.38f;
  lane.expression = 0.72f;
  lane.seed = seed;
  lane.manual_step_mask_low = steps >= 32 ? 0xffffffffu : ((1u << steps) - 1u);
}
}

int main(int argc, char** argv) {
  const std::string outPath = argc > 1 ? argv[1] : "product-core-native.wav";
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1;
  snapshot.transport.bpm = 78.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.harmony.root_midi = 48.0f;
  snapshot.harmony.scale_id = 1;
  snapshot.harmony.tension = 0.16f;
  snapshot.master.gain = 0.82f;
  snapshot.rng.seed = 260822u;
  snapshot.rng.state = 260822u;
  snapshot.evolution.amount = 0.28f;
  snapshot.evolution.state = 826u;

  for (uint32_t source=0; source<7; ++source) {
    snapshot.sources[source].enabled = (source < 4) ? 1 : 0;
    snapshot.sources[source].source_id = source + 1u;
    snapshot.sources[source].level = source < 2 ? 0.62f : 0.34f;
    snapshot.sources[source].dry_gain = 1.0f;
    snapshot.sources[source].expression = 0.78f;
    snapshot.sources[source].post_lpf_hz = 15000.0f;
    snapshot.sources[source].stereo_width = 0.92f;
  }

  snapshot.synth_euclid.lane_count = 3;
  configureLane(snapshot.synth_euclid.lanes[0], KESSHO_PRODUCT_SOURCE_PAD1, 8, 5, 16, 48.0f, 0.58f, 0.72f, 101u);
  configureLane(snapshot.synth_euclid.lanes[1], KESSHO_PRODUCT_SOURCE_PAD2, 12, 7, 16, 55.0f, 0.48f, 0.58f, 202u);
  configureLane(snapshot.synth_euclid.lanes[2], KESSHO_PRODUCT_SOURCE_LEAD1, 16, 3, 16, 72.0f, 0.31f, 0.18f, 303u);
  snapshot.drum_euclid.lane_count = 0;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);

  KesshoProductEngine* engine = kessho_product_create(static_cast<double>(kSampleRate), kBlock, 0);
  if (!engine) { std::cerr << "engine create failed\n"; return 2; }
  if (kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) != KESSHO_PRODUCT_OK) {
    std::cerr << "snapshot load failed\n"; kessho_product_destroy(engine); return 3;
  }

  const uint32_t total = kSampleRate * kSeconds;
  std::vector<float> left(total), right(total), blockL(kBlock), blockR(kBlock);
  uint32_t cursor = 0;
  while (cursor < total) {
    const uint32_t n = std::min(kBlock, total - cursor);
    std::fill(blockL.begin(), blockL.end(), 0.0f); std::fill(blockR.begin(), blockR.end(), 0.0f);
    kessho_product_render(engine, blockL.data(), blockR.data(), n);
    for (uint32_t i=0;i<n;++i) { left[cursor+i]=blockL[i]; right[cursor+i]=blockR[i]; }
    cursor += n;
  }
  kessho_product_destroy(engine);

  double sum = 0.0; float peak = 0.0f;
  for (uint32_t i=0;i<total;++i) { peak=std::max({peak,std::fabs(left[i]),std::fabs(right[i])}); sum += double(left[i])*left[i] + double(right[i])*right[i]; }
  const double rms = std::sqrt(sum / double(total*2u));
  std::cout << "raw peak=" << peak << " rms=" << rms << "\n";
  if (!(rms > 0.00005) || !std::isfinite(rms) || !std::isfinite(peak)) { std::cerr << "Product Core render is silent/invalid\n"; return 4; }

  const float gain = peak > 0.000001f ? std::min(2.5f, 0.86f / peak) : 1.0f;
  const uint32_t fadeFrames = kSampleRate / 2;
  for (uint32_t i=0;i<total;++i) {
    float env = 1.0f;
    if (i < fadeFrames) env = float(i) / float(fadeFrames);
    if (i > total - fadeFrames) env = std::min(env, float(total-i) / float(fadeFrames));
    left[i] *= gain * env; right[i] *= gain * env;
  }
  writeFloatWav(outPath,left,right);
  std::cout << "wrote " << outPath << " frames=" << total << " gain=" << gain << "\n";
  return 0;
}
