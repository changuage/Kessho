#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <iterator>
#include <vector>

#include "KesshoCore/KesshoCore.h"
#include "KesshoCore/KesshoTypes.h"
#include "kessho_pad.h"

namespace {

constexpr uint32_t kInputMagic = 0x3150474bu;  // KGP1
constexpr uint32_t kOutputMagic = 0x314f474bu; // KGO1
constexpr double kSampleRate = 48000.0;
constexpr int kBlockSize = 128;
constexpr int kTotalFrames = 48000 * 30;
constexpr int kPadParamCount = 108;
constexpr int kDynamicsParamCount = 82;
constexpr int kMaxNotesPerChord = PAD_NUM_VOICES;

struct Note {
  float frequency = 0.0f;
  float velocity = 0.0f;
  int route = 0;
};

struct Chord {
  std::vector<Note> notes;
};

void fail(const char* message) {
  std::cerr << message << "\n";
  std::exit(1);
}

uint32_t readU32(const std::vector<uint8_t>& bytes, size_t& offset) {
  if (offset + sizeof(uint32_t) > bytes.size()) {
    fail("unexpected end of fixture input while reading u32");
  }
  uint32_t value = 0;
  std::memcpy(&value, bytes.data() + offset, sizeof(value));
  offset += sizeof(value);
  return value;
}

int32_t readI32(const std::vector<uint8_t>& bytes, size_t& offset) {
  if (offset + sizeof(int32_t) > bytes.size()) {
    fail("unexpected end of fixture input while reading i32");
  }
  int32_t value = 0;
  std::memcpy(&value, bytes.data() + offset, sizeof(value));
  offset += sizeof(value);
  return value;
}

float readF32(const std::vector<uint8_t>& bytes, size_t& offset) {
  if (offset + sizeof(float) > bytes.size()) {
    fail("unexpected end of fixture input while reading f32");
  }
  float value = 0.0f;
  std::memcpy(&value, bytes.data() + offset, sizeof(value));
  offset += sizeof(value);
  return value;
}

void writeU32(std::ostream& out, uint32_t value) {
  out.write(reinterpret_cast<const char*>(&value), sizeof(value));
}

void writeF64(std::ostream& out, double value) {
  out.write(reinterpret_cast<const char*>(&value), sizeof(value));
}

void configureDryDynamics(KesshoModule* module) {
  float* params = kessho_module_get_params_ptr(module);
  if (params == nullptr) {
    fail("native dry dynamics params pointer was null");
  }
  std::fill(params, params + kDynamicsParamCount, 0.0f);
  params[0] = 1.0f;
  params[1] = 0.0f;
  params[2] = 1.0f;
  params[3] = 0.0f;
  kessho_module_commit_params(module);
}

void triggerChord(KesshoModule* module, const Chord& chord) {
  kessho_module_all_notes_off(module);
  for (const Note& note : chord.notes) {
    if (kessho_module_note_on(module, note.frequency, note.velocity, 0.0f, note.route % PAD_NUM_VOICES) != 1) {
      fail("native fixture failed to trigger pad note");
    }
  }
}

} // namespace

int main() {
  const std::vector<uint8_t> input{
      std::istreambuf_iterator<char>(std::cin),
      std::istreambuf_iterator<char>()};
  size_t offset = 0;
  if (readU32(input, offset) != kInputMagic) {
    fail("invalid golden profile fixture input magic");
  }
  const uint32_t with_dry_dynamics = readU32(input, offset);
  const uint32_t chord_frames = readU32(input, offset);
  const uint32_t chord_count = readU32(input, offset);
  if (chord_frames == 0 || chord_count == 0 || chord_count > 32) {
    fail("invalid golden profile fixture chord schedule");
  }

  std::vector<float> pad_params(kPadParamCount);
  for (float& value : pad_params) {
    value = readF32(input, offset);
  }

  std::vector<Chord> chords(chord_count);
  for (Chord& chord : chords) {
    const uint32_t note_count = readU32(input, offset);
    if (note_count > kMaxNotesPerChord) {
      fail("golden profile fixture chord has too many notes");
    }
    chord.notes.resize(note_count);
    for (Note& note : chord.notes) {
      note.frequency = readF32(input, offset);
      note.velocity = readF32(input, offset);
      note.route = readI32(input, offset);
    }
  }

  KesshoModule* source = kessho_module_create(KESSHO_MODULE_PAD, kSampleRate, kBlockSize);
  if (source == nullptr) {
    fail("failed to create native pad source module");
  }
  float* source_params = kessho_module_get_params_ptr(source);
  if (source_params == nullptr) {
    kessho_module_destroy(source);
    fail("native pad source params pointer was null");
  }
  std::copy(pad_params.begin(), pad_params.end(), source_params);
  kessho_module_commit_params(source);

  KesshoModule* dynamics = nullptr;
  if (with_dry_dynamics != 0) {
    dynamics = kessho_module_create(KESSHO_MODULE_DYNAMICS_DRIFT, kSampleRate, kBlockSize);
    if (dynamics == nullptr) {
      kessho_module_destroy(source);
      fail("failed to create native dry dynamics module");
    }
    configureDryDynamics(dynamics);
  }

  std::vector<float> left(kBlockSize);
  std::vector<float> right(kBlockSize);
  std::vector<float> output(kTotalFrames * 2);
  int written = 0;
  int next_chord_frame = 0;
  uint32_t chord_index = 0;
  double elapsed_ms = 0.0;
  double peak_block_ms = 0.0;
  uint32_t blocks = 0;
  uint32_t missed_blocks = 0;
  const double realtime_block_budget_ms = (static_cast<double>(kBlockSize) / kSampleRate) * 1000.0;

  while (written < kTotalFrames) {
    if (written >= next_chord_frame) {
      triggerChord(source, chords[chord_index % chords.size()]);
      chord_index += 1;
      next_chord_frame += static_cast<int>(chord_frames);
    }

    const int frames = std::min(kBlockSize, kTotalFrames - written);
    std::fill(left.begin(), left.begin() + frames, 0.0f);
    std::fill(right.begin(), right.begin() + frames, 0.0f);
    const auto start = std::chrono::steady_clock::now();
    if (kessho_module_process_planar_stereo(source, left.data(), right.data(), left.data(), right.data(), frames) != 1) {
      fail("native source module process failed");
    }
    if (dynamics != nullptr &&
        kessho_module_process_planar_stereo(dynamics, left.data(), right.data(), left.data(), right.data(), frames) != 1) {
      fail("native dry dynamics module process failed");
    }
    const auto end = std::chrono::steady_clock::now();
    const double block_ms = std::chrono::duration<double, std::milli>(end - start).count();
    elapsed_ms += block_ms;
    peak_block_ms = std::max(peak_block_ms, block_ms);
    if (block_ms > realtime_block_budget_ms) {
      missed_blocks += 1;
    }
    blocks += 1;

    for (int i = 0; i < frames; ++i) {
      output[(written + i) * 2] = left[i];
      output[(written + i) * 2 + 1] = right[i];
    }
    written += frames;
  }

  if (dynamics != nullptr) {
    kessho_module_destroy(dynamics);
  }
  kessho_module_destroy(source);

  writeU32(std::cout, kOutputMagic);
  writeF64(std::cout, elapsed_ms);
  writeF64(std::cout, peak_block_ms);
  writeU32(std::cout, blocks);
  writeU32(std::cout, missed_blocks);
  std::cout.write(
      reinterpret_cast<const char*>(output.data()),
      static_cast<std::streamsize>(output.size() * sizeof(float)));
  return std::cout.good() ? 0 : 1;
}
