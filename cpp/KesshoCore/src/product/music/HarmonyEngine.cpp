#include "../KesshoProductEngineInternal.h"

#include <cstdio>

namespace {

using kessho::product::internal::HarmonyState;

struct HarmonyRng {
  uint32_t state = 1u;

  double next() {
    uint32_t t = (state += 0x6d2b79f5u);
    t = (t ^ (t >> 15u)) * (t | 1u);
    t ^= t + ((t ^ (t >> 7u)) * (t | 61u));
    return static_cast<double>(t ^ (t >> 14u)) / 4294967296.0;
  }

  int32_t integer(int32_t low, int32_t high) {
    return static_cast<int32_t>(std::floor(next() * static_cast<double>(high - low + 1))) + low;
  }
};

uint32_t xmur3(const char* text) {
  const size_t length = std::strlen(text);
  uint32_t h = 1779033703u ^ static_cast<uint32_t>(length);
  for (size_t index = 0u; index < length; ++index) {
    h = (h ^ static_cast<uint8_t>(text[index])) * 3432918353u;
    h = (h << 13u) | (h >> 19u);
  }
  h = (h ^ (h >> 16u)) * 2246822507u;
  h = (h ^ (h >> 13u)) * 3266489909u;
  return h ^ (h >> 16u);
}

HarmonyRng phraseRng(const HarmonyState& harmony, uint64_t phrase_index) {
  char material[192]{};
  std::snprintf(
      material,
      sizeof(material),
      "%s|phrase:%llu",
      harmony.seed_material,
      static_cast<unsigned long long>(phrase_index));
  return {xmur3(material)};
}

uint64_t harmonyIntervalFrames(double sample_rate, float seconds) {
  if (!std::isfinite(seconds) || seconds <= 0.0f) return 0u;
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::llround(sample_rate * seconds)));
}

constexpr uint32_t kScaleIds[] = {3u, 1u, 5u, 6u, 7u, 8u, 2u, 9u, 10u, 4u, 11u};
constexpr double kScaleTensions[] = {0.0, 0.08, 0.18, 0.28, 0.38, 0.48, 0.55, 0.65, 0.75, 0.88, 0.95};

uint32_t selectScale(HarmonyRng& rng, float tension) {
  uint32_t candidates[11]{};
  double weights[11]{};
  uint32_t count = 0u;
  double total = 0.0;
  for (uint32_t index = 0u; index < 11u; ++index) {
    const bool eligible = tension <= 0.5f
        ? index < 6u
        : tension <= 0.8f
          ? index < 9u
          : index >= 6u;
    if (!eligible) continue;
    candidates[count] = kScaleIds[index];
    weights[count] = std::pow(1.0 / (std::fabs(kScaleTensions[index] - tension) + 0.05), 1.5);
    total += weights[count];
    ++count;
  }
  double random = rng.next() * total;
  for (uint32_t index = 0u; index < count; ++index) {
    random -= weights[index];
    if (random <= 0.0) return candidates[index];
  }
  return count > 0u ? candidates[count - 1u] : 1u;
}

uint32_t selectDegree(HarmonyRng& rng, float chord_tension, int32_t previous_degree, uint32_t degree_count) {
  if (degree_count != 7u) return 0u;
  double weights[7]{};
  double total = 0.0;
  for (uint32_t index = 0u; index < 7u; ++index) {
    weights[index] = index == 0u || index == 3u || index == 4u
        ? 1.0
        : 0.2 + static_cast<double>(chord_tension) * 0.8;
    if (static_cast<int32_t>(index) == previous_degree) weights[index] *= 0.3;
    total += weights[index];
  }
  double random = rng.next() * total;
  for (uint32_t index = 0u; index < 7u; ++index) {
    random -= weights[index];
    if (random <= 0.0) return index;
  }
  return 0u;
}

double consonance(int32_t midi, const int32_t* existing, uint32_t count) {
  static constexpr double scores[12] = {1.0, 0.15, 0.4, 0.75, 0.8, 0.85, 0.1, 0.9, 0.65, 0.7, 0.35, 0.2};
  if (count == 0u) return 1.0;
  double sum = 0.0;
  for (uint32_t index = 0u; index < count; ++index) {
    sum += scores[std::abs(midi - existing[index]) % 12];
  }
  return sum / static_cast<double>(count);
}

bool contains(const int32_t* notes, uint32_t count, int32_t note) {
  for (uint32_t index = 0u; index < count; ++index) if (notes[index] == note) return true;
  return false;
}

void appendUnique(int32_t* notes, uint32_t& count, uint32_t capacity, int32_t note) {
  if (count < capacity && !contains(notes, count, note)) notes[count++] = note;
}

uint32_t availableScaleNotes(uint32_t scale_id, int32_t root_note, int32_t out[32]) {
  int intervals[kMaxScaleNotes]{};
  const uint32_t interval_count = scaleIntervals(scale_id, intervals);
  const int32_t root_base = 36 + root_note;
  uint32_t count = 0u;
  for (int32_t octave = 0; octave < 8; ++octave) {
    for (uint32_t index = 0u; index < interval_count; ++index) {
      const int32_t midi = root_base + octave * 12 + intervals[index];
      if (midi >= root_base && midi <= root_base + 36 && count < 32u) out[count++] = midi;
    }
  }
  return count;
}

void degreeChordIntervals(uint32_t scale_id, uint32_t degree, int32_t& third, int32_t& fifth, int32_t& seventh) {
  // [third, fifth, seventh], kept in schema scale-ID order. These mirror the
  // explicit qualities in scales.ts; a few intentionally differ from a
  // mechanically stacked diatonic seventh (for example Ionian vii°).
  static constexpr int32_t major[7][3] = {{4,7,11},{3,7,10},{3,7,10},{4,7,11},{4,7,10},{3,7,10},{3,6,9}};
  static constexpr int32_t aeolian[7][3] = {{3,7,10},{3,6,9},{4,7,11},{3,7,10},{3,7,10},{4,7,11},{4,7,10}};
  static constexpr int32_t lydian[7][3] = {{4,7,11},{4,7,10},{3,7,10},{3,6,9},{4,7,11},{3,7,10},{3,7,10}};
  static constexpr int32_t mixolydian[7][3] = {{4,7,10},{3,7,10},{3,6,9},{4,7,11},{3,7,10},{3,7,10},{4,7,11}};
  static constexpr int32_t dorian[7][3] = {{3,7,10},{3,7,10},{4,7,11},{4,7,10},{3,7,10},{3,6,9},{4,7,11}};
  static constexpr int32_t harmonic_minor[7][3] = {{3,7,11},{3,6,10},{4,8,11},{3,7,10},{4,7,10},{4,7,11},{3,6,9}};
  static constexpr int32_t melodic_minor[7][3] = {{3,7,11},{3,7,10},{4,8,11},{4,7,10},{4,7,10},{3,6,10},{3,6,10}};
  static constexpr int32_t phrygian_dominant[7][3] = {{4,7,10},{4,7,11},{3,7,10},{3,7,10},{3,6,9},{4,7,11},{3,7,10}};
  const int32_t (*table)[3] = major;
  switch (scale_id) {
    case 2u: table = aeolian; break;
    case 5u: table = lydian; break;
    case 6u: table = mixolydian; break;
    case 8u: table = dorian; break;
    case 9u: table = harmonic_minor; break;
    case 10u: table = melodic_minor; break;
    case 11u: table = phrygian_dominant; break;
    default: break;
  }
  third = table[degree % 7u][0];
  fifth = table[degree % 7u][1];
  seventh = table[degree % 7u][2];
}

uint32_t buildChord(
    HarmonyRng& rng,
    uint32_t scale_id,
    float tension,
    float voicing_spread,
    float detune_cents,
    int32_t root_note,
    uint32_t degree_index,
    float out[8]) {
  int intervals[kMaxScaleNotes]{};
  const uint32_t interval_count = scaleIntervals(scale_id, intervals);
  const float chord_tension = std::fmod(tension, 0.5f) * 2.0f;
  const int32_t root_base = 36 + root_note;
  const int32_t base_root = root_base + rng.integer(0, 1) * 12;
  const bool has_degrees = interval_count == 7u;
  const uint32_t degree = has_degrees ? degree_index % 7u : 0u;
  const int32_t degree_root = has_degrees ? intervals[degree] : 0;
  const int32_t chord_root = base_root + degree_root;
  int32_t selected[16]{chord_root};
  uint32_t selected_count = 1u;
  int32_t available[32]{};
  const uint32_t available_count = availableScaleNotes(scale_id, root_note, available);
  const double consonance_threshold = 0.6 - static_cast<double>(chord_tension) * 0.4;

  if (has_degrees) {
    int32_t third_interval = 4;
    int32_t fifth_interval = 7;
    int32_t seventh_interval = 11;
    degreeChordIntervals(scale_id, degree, third_interval, fifth_interval, seventh_interval);
    const int32_t third = chord_root + third_interval;
    const int32_t fifth = chord_root + fifth_interval;
    const int32_t seventh = chord_root + seventh_interval;
    if (chord_tension < 0.3f) {
      appendUnique(selected, selected_count, 16u, third);
      appendUnique(selected, selected_count, 16u, fifth);
      if (chord_tension >= 0.2f && rng.next() < 0.3) {
        const int32_t suspension = chord_root + (rng.next() < 0.5 ? 2 : 5);
        for (uint32_t index = 0u; index < selected_count; ++index) {
          if (selected[index] == third) selected[index] = suspension;
        }
      }
    } else if (chord_tension < 0.6f) {
      appendUnique(selected, selected_count, 16u, third);
      appendUnique(selected, selected_count, 16u, fifth);
      appendUnique(selected, selected_count, 16u, seventh);
    } else if (chord_tension < 0.8f) {
      appendUnique(selected, selected_count, 16u, third);
      appendUnique(selected, selected_count, 16u, fifth);
      appendUnique(selected, selected_count, 16u, seventh);
      if (chord_root + 14 <= 84) appendUnique(selected, selected_count, 16u, chord_root + 14);
    } else if (rng.next() < 0.5) {
      int32_t note = chord_root;
      for (uint32_t index = 0u; index < 4u; ++index) {
        note += 5;
        if (note <= 84) appendUnique(selected, selected_count, 16u, note);
      }
    } else {
      int32_t root_index = -1;
      for (uint32_t index = 0u; index < available_count; ++index) if (available[index] == chord_root) root_index = index;
      if (root_index >= 0) {
        for (uint32_t distance = 1u; distance <= 4u; ++distance) {
          const uint32_t index = static_cast<uint32_t>(root_index) + distance;
          if (index < available_count && consonance(available[index], selected, selected_count) >= consonance_threshold) {
            appendUnique(selected, selected_count, 16u, available[index]);
          }
        }
      }
    }
  } else {
    bool has_fifth = false;
    for (uint32_t index = 0u; index < interval_count; ++index) has_fifth = has_fifth || intervals[index] == 7;
    if (has_fifth) appendUnique(selected, selected_count, 16u, chord_root + 7);
    const uint32_t note_count = static_cast<uint32_t>(chord_tension < 0.5f ? rng.integer(3, 4) : rng.integer(4, 5));
    int32_t remaining[32]{};
    uint32_t remaining_count = 0u;
    for (uint32_t index = 0u; index < available_count; ++index) {
      if (!contains(selected, selected_count, available[index])) remaining[remaining_count++] = available[index];
    }
    for (uint32_t index = remaining_count; index > 1u; --index) {
      const uint32_t swap = static_cast<uint32_t>(std::floor(rng.next() * static_cast<double>(index)));
      std::swap(remaining[index - 1u], remaining[swap]);
    }
    while (selected_count < note_count && remaining_count > 0u) {
      const int32_t note = remaining[--remaining_count];
      if (consonance(note, selected, selected_count) >= consonance_threshold) appendUnique(selected, selected_count, 16u, note);
    }
  }

  int32_t voiced[16]{};
  uint32_t voiced_count = 0u;
  for (uint32_t index = 0u; index < selected_count; ++index) {
    const int32_t note = selected[index];
    if (voicing_spread > 0.5f && rng.next() < static_cast<double>(voicing_spread) * 0.5) {
      const int32_t shifted = note + (rng.next() < 0.5 ? -12 : 12);
      if (shifted >= 36 && shifted <= 84 && !contains(voiced, voiced_count, shifted)) {
        appendUnique(voiced, voiced_count, 16u, shifted);
        continue;
      }
    }
    appendUnique(voiced, voiced_count, 16u, note);
  }
  std::sort(voiced, voiced + voiced_count);
  voiced_count = std::min<uint32_t>(voiced_count, 6u);
  for (uint32_t index = 0u; index < voiced_count; ++index) {
    out[index] = static_cast<float>(voiced[index]);
    (void)(rng.next() * static_cast<double>(detune_cents * 2.0f) - detune_cents);
  }
  // voiceLeadChord consumes a second detune draw for every note whenever a
  // previous chord exists. Snapshot-backed runtime harmony always has one.
  for (uint32_t index = 0u; index < voiced_count; ++index) {
    (void)(rng.next() * static_cast<double>(detune_cents * 2.0f) - detune_cents);
  }
  return voiced_count;
}

int32_t driftedRoot(int32_t home_root, int32_t step) {
  static constexpr int32_t cof[12] = {0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5};
  int32_t home_index = 0;
  for (int32_t index = 0; index < 12; ++index) if (cof[index] == ((home_root % 12) + 12) % 12) home_index = index;
  return cof[((home_index + step) % 12 + 12) % 12];
}

} // namespace

void KesshoProductEngine::resetHarmonyClock() {
  harmony.harmony_tick_index = 0u;
  harmony.progression_phrase_index = harmony.next_progression_phrase_index;
  harmony.harmony_rng_state = rng_seed == 0u ? 1u : rng_seed;
  const uint64_t interval = harmonyIntervalFrames(sample_rate, harmony.chord_interval_seconds);
  const uint32_t chords_per_phrase = interval == 0u ? 1u : std::max<uint32_t>(
      1u,
      static_cast<uint32_t>(std::llround(
          static_cast<double>(harmony.phrase_length_seconds) /
          std::max(0.001, static_cast<double>(harmony.chord_interval_seconds)))));
  // The snapshot/current chord is tick zero of the phrase. The next clock tick
  // is therefore tick one; starting again at zero mislabeled an in-phrase
  // chord change as a phrase boundary.
  harmony.chord_sub_tick = chords_per_phrase > 1u ? 1u : 0u;
  harmony.next_harmony_frame = interval == 0u || harmony.control_mode != 0u
      ? UINT64_MAX
      : transport.sample_frame + interval;
}

void KesshoProductEngine::advanceHarmonyClock() {
  if (!transport.running || harmony.next_harmony_frame == UINT64_MAX ||
      transport.sample_frame < harmony.next_harmony_frame) return;
  const uint64_t interval = harmonyIntervalFrames(sample_rate, harmony.chord_interval_seconds);
  if (interval == 0u) {
    harmony.next_harmony_frame = UINT64_MAX;
    return;
  }
  const uint32_t chords_per_phrase = std::max<uint32_t>(
      1u,
      static_cast<uint32_t>(std::llround(
          static_cast<double>(harmony.phrase_length_seconds) /
          std::max(0.001, static_cast<double>(harmony.chord_interval_seconds)))));
  while (transport.sample_frame >= harmony.next_harmony_frame) {
    ++harmony.harmony_tick_index;
    const bool phrase_boundary = harmony.chord_sub_tick == 0u;
    bool staged_voicing_change = false;
    if (phrase_boundary) {
      staged_voicing_change = harmony.voicing_spread != harmony.requested_voicing_spread;
      arrangement.synth_octave = arrangement.requested_synth_octave;
      arrangement.wave_spread = arrangement.requested_wave_spread;
      harmony.voicing_spread = harmony.requested_voicing_spread;
    }
    const uint64_t phrase_index = phrase_boundary
        ? harmony.next_phrase_index++
        : harmony.next_phrase_index > 0u ? harmony.next_phrase_index - 1u : 0u;
    const uint64_t progression_index = harmony.next_progression_phrase_index + static_cast<uint64_t>(std::floor(
        static_cast<double>(harmony.harmony_tick_index - 1u) * harmony.phrase_length_seconds /
        std::max(0.001, static_cast<double>(harmony.progression_phrase_seconds))));
    harmony.progression_phrase_index = progression_index;
    HarmonyRng random = phraseRng(harmony, phrase_index);
    const float chord_tension = std::fmod(harmony.tension, 0.5f) * 2.0f;
    bool force_new_chord = staged_voicing_change;

    if (phrase_boundary && harmony.cof_enabled) {
      ++harmony.cof_phrase_counter;
      if (harmony.cof_phrase_counter >= harmony.cof_drift_rate) {
        harmony.cof_phrase_counter = 0u;
        int32_t direction = harmony.cof_drift_direction == 2u
            ? (random.next() < 0.5 ? 1 : -1)
            : harmony.cof_drift_direction == 0u ? 1 : -1;
        int32_t next = harmony.cof_current_step + direction;
        if (std::abs(next) > static_cast<int32_t>(harmony.cof_drift_range)) next = harmony.cof_current_step - direction;
        if (std::abs(next) > static_cast<int32_t>(harmony.cof_drift_range)) next = harmony.cof_current_step;
        force_new_chord = next != harmony.cof_current_step;
        harmony.cof_current_step = next;
      }
    }
    const int32_t root_note = harmony.cof_enabled
        ? driftedRoot(harmony.cof_home_root, harmony.cof_current_step)
        : harmony.cof_home_root;
    harmony.root_midi = static_cast<float>(60 + root_note);

    int32_t progression_degree = -1;
    if (phrase_boundary && harmony.progression_enabled) {
      const uint32_t next_step = static_cast<uint32_t>(
          progression_index / std::max<uint32_t>(1u, harmony.progression_phrase_multiplier)) %
          harmony.progression_steps;
      const bool changed = next_step != harmony.progression_step;
      harmony.progression_step = next_step;
      harmony.progression_phrase_counter = static_cast<uint32_t>(
          progression_index % std::max<uint32_t>(1u, harmony.progression_phrase_multiplier));
      if (changed && (harmony.progression_step_enabled_mask & (1u << next_step)) != 0u) {
        force_new_chord = true;
        progression_degree = harmony.progression_pattern[next_step];
      }
    }

    if (phrase_boundary) {
      if (harmony.tension_arc_phrases_remaining > 0u) {
        --harmony.tension_arc_phrases_remaining;
        if (harmony.tension_arc_phrases_remaining == 0u) harmony.tension_arc_type = 0u;
      } else if (harmony.tension_arc_type == 0u) {
        const uint32_t frequency = std::max<uint32_t>(
            3u,
            static_cast<uint32_t>(std::llround(12.0 - static_cast<double>(chord_tension) * 10.0)));
        if (phrase_index > 0u && phrase_index % frequency == 0u &&
            random.next() < 0.4 + static_cast<double>(chord_tension) * 0.3) {
          harmony.tension_arc_type = 1u;
          harmony.tension_arc_phrases_remaining = static_cast<uint32_t>(random.integer(3, 5));
        }
      }
      if (harmony.tension_arc_type == 2u) {
        progression_degree = harmony.tension_arc_phrases_remaining > 1u ? 4 : 0;
        force_new_chord = true;
      }
    }

    const bool needs_new_chord = !phrase_boundary || force_new_chord || harmony.phrases_until_change <= 1u;
    if (needs_new_chord) {
      const uint32_t scale_id = harmony.scale_mode == 1u ? harmony.scale_id : selectScale(random, harmony.tension);
      int intervals[kMaxScaleNotes]{};
      const uint32_t degree_count = scaleIntervals(scale_id, intervals) == 7u ? 7u : 0u;
      const uint32_t degree = progression_degree >= 0
          ? static_cast<uint32_t>(progression_degree)
          : selectDegree(random, chord_tension, harmony.current_degree, degree_count);
      float chord[8]{};
      const uint32_t count = buildChord(
          random,
          scale_id,
          harmony.tension,
          harmony.voicing_spread,
          harmony.detune_cents,
          root_note,
          degree,
          chord);
      harmony.scale_id = scale_id;
      harmony.note_pool_count = count;
      for (uint32_t index = 0u; index < 8u; ++index) {
        harmony.note_pool_midi[index] = index < count ? chord[index] : 0.0f;
        if (index < 4u) harmony.chord_midi[index] = index < count ? chord[index] : chord[count > 0u ? count - 1u : 0u];
      }
      harmony.current_degree = static_cast<int32_t>(degree);
      harmony.chord_degree = degree;
      harmony.active_step_index = static_cast<int32_t>(degree);
      if (phrase_boundary) {
        harmony.phrases_until_change = std::max<uint32_t>(
            1u,
            static_cast<uint32_t>(std::llround(
                static_cast<double>(harmony.chord_interval_seconds) /
                std::max(0.001, static_cast<double>(harmony.phrase_length_seconds)))));
      }
    } else if (phrase_boundary && harmony.phrases_until_change > 0u) {
      --harmony.phrases_until_change;
    }
    if (phrase_boundary) {
      arrangement.chord_generator_pending = arrangement.chord_generator_enabled;
    }
    harmony.harmony_rng_state = random.state;
    harmony.chord_sub_tick = (harmony.chord_sub_tick + 1u) % chords_per_phrase;
    harmony.next_harmony_frame += interval;
  }
}

void KesshoProductEngine::updateHarmonyTelemetry(uint64_t absolute_sample) {
  if (harmony.note_pool_count > 0u) {
    harmony.chord_degree = harmony.current_degree >= 0 ? static_cast<uint32_t>(harmony.current_degree) : 0u;
    for (uint32_t i = 0; i < 4u; ++i) {
      harmony.chord_midi[i] = i < harmony.note_pool_count
          ? harmony.note_pool_midi[i]
          : harmony.note_pool_midi[harmony.note_pool_count - 1u];
    }
    return;
  }
  int intervals[kMaxScaleNotes]{};
  const uint32_t scale_count = scaleIntervals(harmony.scale_id, intervals);
  const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
  const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
  harmony.chord_degree = circleOfFifthsProgressionDegree(rng_seed, harmony.tension, bar, phrase, scale_count);
  const uint32_t degrees[4] = {
      harmony.chord_degree % scale_count,
      (harmony.chord_degree + 2u) % scale_count,
      (harmony.chord_degree + 4u) % scale_count,
      (harmony.chord_degree + 7u) % scale_count,
  };
  for (uint32_t i = 0; i < 4u; ++i) {
    const int octave = i == 3u ? 12 : 0;
    harmony.chord_midi[i] = clampFloat(harmony.root_midi + static_cast<float>(intervals[degrees[i]] + octave), 0.0f, 127.0f);
  }
}
