#include "ChordResolver.h"

#include "../KesshoProductEngineInternal.h"

namespace kessho::product::music {

namespace {

constexpr uint32_t kMaxVoices = KESSHO_PRODUCT_CHORD_MAX_NOTES;
constexpr uint32_t kMaxOut = kMaxVoices + 1u;

struct Voicing {
  float v[kMaxVoices];
  uint32_t n = 0u;
};

int floorDiv(int a, int b) {
  int q = a / b;
  if ((a % b != 0) && ((a < 0) != (b < 0))) --q;
  return q;
}

float foldMidi(float m) {
  if (!std::isfinite(m)) return 60.0f;
  if (m < 0.0f) m += 12.0f * std::ceil(-m / 12.0f);
  if (m > 127.0f) m -= 12.0f * std::ceil((m - 127.0f) / 12.0f);
  return std::min(std::max(m, 0.0f), 127.0f);
}

void sortAscending(float* a, uint32_t n) {
  for (uint32_t i = 1u; i < n; ++i) {
    const float x = a[i];
    uint32_t j = i;
    while (j > 0u && a[j - 1u] > x) {
      a[j] = a[j - 1u];
      --j;
    }
    a[j] = x;
  }
}

// Semitone offset of scale step (idx + steps) above scale step idx.
int stepOffset(const int* intervals, int count, int idx, int steps) {
  const int total = idx + steps;
  return intervals[total % count] + 12 * (total / count) - intervals[idx];
}

// Chord tones as ascending, de-duplicated semitone offsets from the root.
void chordTones(const KesshoProductChordIntent& in, const int* intervals, int count, int idx, Voicing& t) {
  int tones[16];
  uint32_t n = 0u;
  const uint32_t ext = in.extensions;
  const bool seventh = (ext & KESSHO_PRODUCT_CHORD_EXT_SEVENTH) != 0u;
  const bool dominant = (ext & KESSHO_PRODUCT_CHORD_EXT_DOMINANT) != 0u;
  const uint32_t q = in.quality;

  if (q == KESSHO_PRODUCT_CHORD_QUALITY_DIATONIC || q >= KESSHO_PRODUCT_CHORD_QUALITY_COUNT) {
    tones[n++] = 0;
    tones[n++] = stepOffset(intervals, count, idx, 2);
    tones[n++] = stepOffset(intervals, count, idx, 4);
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_SIXTH) != 0u) tones[n++] = stepOffset(intervals, count, idx, 5);
    if (seventh) tones[n++] = dominant ? 10 : stepOffset(intervals, count, idx, 6);
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_NINTH) != 0u) tones[n++] = stepOffset(intervals, count, idx, 8);
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_ELEVENTH) != 0u) tones[n++] = stepOffset(intervals, count, idx, 10);
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_THIRTEENTH) != 0u) tones[n++] = stepOffset(intervals, count, idx, 12);
  } else {
    static constexpr int triads[KESSHO_PRODUCT_CHORD_QUALITY_COUNT][3] = {
        {0, 4, 7}, {0, 4, 7}, {0, 3, 7}, {0, 3, 6}, {0, 4, 8}, {0, 2, 7}, {0, 5, 7}};
    for (int i = 0; i < 3; ++i) tones[n++] = triads[q][i];
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_SIXTH) != 0u) tones[n++] = 9;
    if (seventh) {
      int s = 11;
      if (q == KESSHO_PRODUCT_CHORD_QUALITY_MINOR) s = 10;
      if (q == KESSHO_PRODUCT_CHORD_QUALITY_DIMINISHED) s = 9;  // dim7
      tones[n++] = dominant ? 10 : s;
    }
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_NINTH) != 0u) tones[n++] = 14;
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_ELEVENTH) != 0u) tones[n++] = 17;
    if ((ext & KESSHO_PRODUCT_CHORD_EXT_THIRTEENTH) != 0u) tones[n++] = 21;
  }

  // Sort, drop duplicates, cap (highest extensions fall off first).
  float f[16];
  for (uint32_t i = 0u; i < n; ++i) f[i] = static_cast<float>(tones[i]);
  sortAscending(f, n);
  t.n = 0u;
  for (uint32_t i = 0u; i < n && t.n < kMaxVoices; ++i) {
    if (t.n == 0u || f[i] != t.v[t.n - 1u]) t.v[t.n++] = f[i];
  }
}

// Inversion, then spread, then re-sort (the order is part of the musical rule).
Voicing voice(const Voicing& base, int inversion, float spread, float shift) {
  Voicing r = base;
  const uint32_t n = r.n;
  if (n == 0u) return r;
  const int rot = ((inversion % static_cast<int>(n)) + static_cast<int>(n)) % static_cast<int>(n);
  for (int i = 0; i < rot; ++i) {
    r.v[0] += 12.0f;
    sortAscending(r.v, n);
  }
  const float s = std::min(std::max(std::isfinite(spread) ? spread : 0.0f, 0.0f), 1.0f);
  const uint32_t k = static_cast<uint32_t>(std::lround(s * static_cast<float>((n - 1u) / 2u)));
  for (uint32_t j = 0u, idx = 1u; j < k && idx < n; ++j, idx += 2u) r.v[idx] += 12.0f;
  sortAscending(r.v, n);
  for (uint32_t i = 0u; i < n; ++i) r.v[i] += shift;
  return r;
}

float costAgainst(const Voicing& v, float root, const KesshoProductChordNote* prev, uint32_t prev_count) {
  float cost = 0.0f;
  for (uint32_t i = 0u; i < v.n; ++i) {
    float best = 1.0e9f;
    for (uint32_t p = 0u; p < prev_count; ++p) best = std::min(best, std::fabs(root + v.v[i] - prev[p].midi));
    cost += best;
  }
  return cost;
}

} // namespace

uint32_t resolveChord(const KesshoProductChordIntent& intent,
                      const KesshoProductChordNote* notes, uint32_t note_count,
                      const ChordFrame& frame, const ChordResolveOptions& options,
                      KesshoProductChordNote* out, uint32_t out_capacity) {
  if (out == nullptr || out_capacity == 0u) return 0u;

  if (intent.behavior == KESSHO_PRODUCT_CHORD_BEHAVIOR_FIXED) {
    if (notes == nullptr) return 0u;
    const uint32_t n = std::min(std::min(note_count, out_capacity), kMaxVoices);
    for (uint32_t i = 0u; i < n; ++i) {
      out[i] = notes[i];
      out[i].midi = foldMidi(notes[i].midi);
    }
    return n;
  }

  int intervals[kessho::product::internal::kMaxScaleNotes];
  int count = static_cast<int>(kessho::product::internal::scaleIntervals(frame.scale_id, intervals));
  if (count <= 0) {
    intervals[0] = 0;
    count = 1;
  }
  const int degree = std::min(std::max(intent.degree, -4096), 4096);
  const int octave = floorDiv(degree, count);
  const int idx = degree - octave * count;
  const int reg = std::min(std::max(intent.register_octave, -3), 3);
  const float root = frame.root_midi + static_cast<float>(intervals[idx] + 12 * octave + 12 * reg);

  Voicing tones;
  chordTones(intent, intervals, count, idx, tones);

  const uint32_t v = tones.n;
  const int own_rot = ((intent.inversion % static_cast<int>(v)) + static_cast<int>(v)) % static_cast<int>(v);
  Voicing chosen = voice(tones, own_rot, intent.spread, 0.0f);

  if (options.smooth && options.previous != nullptr && options.previous_count > 0u) {
    float best_cost = costAgainst(chosen, root, options.previous, options.previous_count);
    int best_shift = 0;
    int best_rot = own_rot;
    for (int shift = -12; shift <= 12; shift += 12) {
      for (int rot = 0; rot < static_cast<int>(v); ++rot) {
        const Voicing cand = voice(tones, rot, intent.spread, static_cast<float>(shift));
        const float cost = costAgainst(cand, root, options.previous, options.previous_count);
        const bool better = cost < best_cost ||
            (cost == best_cost &&
             (std::abs(shift) < std::abs(best_shift) ||
              (std::abs(shift) == std::abs(best_shift) && rot == own_rot && best_rot != own_rot)));
        if (better) {
          best_cost = cost;
          best_shift = shift;
          best_rot = rot;
          chosen = cand;
        }
      }
    }
  }

  float result[kMaxOut];
  uint32_t n = 0u;
  const float lowest = root + chosen.v[0];
  if (intent.bass_mode != KESSHO_PRODUCT_CHORD_BASS_NONE) {
    float pc = std::fmod(root, 12.0f);
    if (pc < 0.0f) pc += 12.0f;
    if (intent.bass_mode == KESSHO_PRODUCT_CHORD_BASS_PITCH_CLASS) pc = static_cast<float>(intent.bass_pitch_class % 12u);
    // Octave strictly below the lowest voice.
    result[n++] = pc + 12.0f * (std::ceil((lowest - pc) / 12.0f) - 1.0f);
  }
  for (uint32_t i = 0u; i < chosen.n; ++i) result[n++] = root + chosen.v[i];

  const uint32_t written = std::min(n, out_capacity);
  for (uint32_t i = 0u; i < written; ++i) {
    out[i] = KesshoProductChordNote{foldMidi(result[i]), 1.0f, 0.0f, 0.0f, 0u};
  }
  return written;
}

} // namespace kessho::product::music
