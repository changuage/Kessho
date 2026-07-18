#include "../KesshoProductEngineInternal.h"

#include <cmath>

namespace {

using namespace kessho::product::internal;

constexpr const char* kScatterVoiceNames[kProductScatterVoiceCount] = {
    "sub", "kick", "click", "beepHi", "beepLo", "noise", "membrane"};

float clampUnit(float value) { return std::clamp(value, 0.0f, 1.0f); }
float clampFeel(float value) { return std::clamp(value, -1.0f, 1.0f); }
int32_t jsRound(float value) { return static_cast<int32_t>(std::floor(value + 0.5f)); }
int32_t clampPitch(float value) { return std::clamp(jsRound(value), -48, 48); }

uint32_t rotateLeft32(uint32_t value, uint32_t count) {
  return (value << count) | (value >> (32u - count));
}

uint32_t scatterStringSeed(uint32_t voice, uint32_t seed) {
  char material[48]{};
  uint32_t length = 0u;
  auto append = [&](const char* value) {
    while (*value != '\0') material[length++] = *value++;
  };
  append("scatter:");
  append(kScatterVoiceNames[std::min<uint32_t>(voice, kProductScatterVoiceCount - 1u)]);
  material[length++] = ':';
  char digits[10]{};
  uint32_t digit_count = 0u;
  do {
    digits[digit_count++] = static_cast<char>('0' + seed % 10u);
    seed /= 10u;
  } while (seed != 0u);
  while (digit_count > 0u) material[length++] = digits[--digit_count];

  uint32_t hash = 1779033703u ^ length;
  for (uint32_t index = 0u; index < length; ++index) {
    hash = (hash ^ static_cast<uint8_t>(material[index])) * 3432918353u;
    hash = rotateLeft32(hash, 13u);
  }
  hash = (hash ^ (hash >> 16u)) * 2246822507u;
  hash = (hash ^ (hash >> 13u)) * 3266489909u;
  return hash ^ (hash >> 16u);
}

float nextScatterRandom(uint32_t& state) {
  state += 0x6d2b79f5u;
  uint32_t value = state;
  value = (value ^ (value >> 15u)) * (value | 1u);
  value ^= value + (value ^ (value >> 7u)) * (value | 61u);
  return static_cast<float>(value ^ (value >> 14u)) / 4294967296.0f;
}

uint32_t randomInt(uint32_t& state, int32_t minimum, int32_t maximum) {
  return static_cast<uint32_t>(
      std::floor(nextScatterRandom(state) * static_cast<float>(maximum - minimum + 1)) + minimum);
}

uint32_t scatterZone(float chaos) {
  if (chaos < 0.2f) return 0u;
  if (chaos < 0.4f) return 1u;
  if (chaos < 0.6f) return 2u;
  if (chaos < 0.8f) return 3u;
  return 4u;
}

uint32_t phraseLength(uint32_t zone, uint32_t& rng) {
  constexpr uint32_t options[5][5] = {
      {2u, 3u, 4u, 0u, 0u}, {4u, 5u, 6u, 7u, 8u}, {8u, 12u, 0u, 0u, 0u},
      {8u, 12u, 16u, 0u, 0u}, {5u, 7u, 11u, 13u, 16u}};
  constexpr uint32_t counts[5] = {3u, 5u, 2u, 3u, 5u};
  return options[zone][std::min<uint32_t>(static_cast<uint32_t>(nextScatterRandom(rng) * counts[zone]), counts[zone] - 1u)];
}

void buildEuclideanLevel(
    int32_t level,
    const uint32_t* counts,
    const uint32_t* remainders,
    uint8_t* pattern,
    uint32_t& length) {
  if (level == -1) { pattern[length++] = 0u; return; }
  if (level == -2) { pattern[length++] = 1u; return; }
  for (uint32_t index = 0u; index < counts[level]; ++index) {
    buildEuclideanLevel(level - 1, counts, remainders, pattern, length);
  }
  if (remainders[level] != 0u) buildEuclideanLevel(level - 2, counts, remainders, pattern, length);
}

uint32_t euclideanMask(uint32_t steps, uint32_t hits, uint32_t rotation) {
  if (hits == 0u) return 0u;
  if (hits >= steps) return (1u << steps) - 1u;
  uint32_t counts[16]{};
  uint32_t remainders[16]{hits};
  uint32_t divisor = steps - hits;
  uint32_t level = 0u;
  while (remainders[level] > 1u) {
    counts[level] = divisor / remainders[level];
    remainders[level + 1u] = divisor % remainders[level];
    divisor = remainders[level++];
  }
  counts[level] = divisor;
  uint8_t pattern[16]{};
  uint32_t length = 0u;
  buildEuclideanLevel(static_cast<int32_t>(level), counts, remainders, pattern, length);
  uint32_t mask = 0u;
  for (uint32_t index = 0u; index < steps; ++index) {
    if (pattern[index] != 0u) mask |= 1u << ((index + rotation) % steps);
  }
  return mask;
}

uint32_t contourFor(float feel_x, uint32_t zone, float random_walk, uint32_t& rng) {
  const float instability = clampUnit((clampFeel(feel_x) + 1.0f) * 0.5f);
  const float scatter_chance = clampUnit(instability * 0.65f * (1.0f - random_walk * 0.45f));
  const float walk_chance = clampUnit(
      random_walk * 0.78f + (instability > 0.6f ? 0.28f : 0.0f) +
      (zone == 3u ? instability * 0.28f : 0.0f));
  if (instability > 0.82f && random_walk < 0.62f) return 6u;
  if (zone == 4u && nextScatterRandom(rng) < scatter_chance) return 6u;
  if (random_walk > 0.92f || nextScatterRandom(rng) < walk_chance) return 5u;
  if (zone == 0u) return nextScatterRandom(rng) < 0.5f ? 0u : 3u;
  return std::min<uint32_t>(static_cast<uint32_t>(nextScatterRandom(rng) * 5.0f), 4u);
}

float shapedContour(uint32_t contour, float phase) {
  if (contour == 0u) return phase;
  if (contour == 1u) return phase * phase;
  if (contour == 2u) return std::sqrt(phase);
  if (contour == 3u) return std::round(phase * 3.0f) / 3.0f;
  if (contour == 4u) return 0.5f + std::sin(phase * static_cast<float>(kTwoPi) - static_cast<float>(kTwoPi * 0.25)) * 0.5f;
  return phase;
}

bool variedUnit(const float* values, uint32_t mask, uint32_t steps) {
  int32_t first = INT32_MIN;
  for (uint32_t step = 0u; step < steps; ++step) {
    if ((mask & (1u << step)) == 0u) continue;
    const int32_t rounded = jsRound(values[step] * 100.0f);
    if (first == INT32_MIN) first = rounded;
    else if (rounded != first) return true;
  }
  return false;
}

bool variedPitch(const int32_t* values, uint32_t mask, uint32_t steps) {
  int32_t first = INT32_MIN;
  for (uint32_t step = 0u; step < steps; ++step) {
    if ((mask & (1u << step)) == 0u) continue;
    if (first == INT32_MIN) first = values[step];
    else if (values[step] != first) return true;
  }
  return false;
}

void ensureUnitVariation(float* values, uint32_t mask, uint32_t steps, uint32_t hits, float amount) {
  if (hits < 2u || variedUnit(values, mask, steps)) return;
  const float safe = std::clamp(amount, 0.03f, 0.35f);
  uint32_t ordinal = 0u;
  for (uint32_t step = 0u; step < steps; ++step) {
    if ((mask & (1u << step)) == 0u) continue;
    const float phase = static_cast<float>(ordinal) / static_cast<float>(hits - 1u);
    const float alternate = (ordinal % 2u == 0u ? -1.0f : 1.0f) * safe * 0.45f;
    values[step] = clampUnit(values[step] + (phase - 0.5f) * safe + alternate);
    ++ordinal;
  }
}

} // namespace

ProductScatterPhrase KesshoProductEngine::generateScatterPhrase(uint32_t voice, uint32_t seed) const {
  ProductScatterPhrase phrase{};
  const ProductScatterVoiceConfig& config = scatter_runtime.active[voice];
  uint32_t rng = scatterStringSeed(voice, seed);
  const float chaos = clampUnit((clampFeel(config.feel_y) + 1.0f) * 0.5f);
  const uint32_t zone = scatterZone(chaos);
  const float instability = clampUnit((clampFeel(config.feel_x) + 1.0f) * 0.5f);
  const float random_walk = config.random_walk_enabled ? clampUnit(config.random_walk) : 0.0f;
  const float motion = clampUnit(config.motion + chaos * 0.3f);
  const float fracture = clampUnit(config.fracture + chaos * 0.5f);
  const float spread = clampUnit(config.spread + chaos * 0.35f);
  phrase.seed = seed;
  phrase.id = hashU32(seed ^ voice * 0x9e3779b1u);
  phrase.voice = voice;
  phrase.zone = static_cast<ProductScatterZone>(zone);
  phrase.steps = phraseLength(zone, rng);
  phrase.hits = std::clamp<uint32_t>(
      static_cast<uint32_t>(std::max(1, jsRound(static_cast<float>(phrase.steps) * clampUnit(config.burst_probability)))),
      1u,
      phrase.steps);
  const float rotation_energy = clampUnit(
      instability * 0.5f + fracture * 0.25f + chaos * 0.2f - config.breath * 0.15f);
  const bool anchor_root = nextScatterRandom(rng) < clampUnit(config.anchor * (0.6f + (1.0f - rotation_energy) * 0.4f));
  const int32_t local_limit = std::max(1, jsRound(static_cast<float>(phrase.steps) * 0.18f));
  const int32_t local_rotation = static_cast<int32_t>(randomInt(rng, -local_limit, local_limit));
  const uint32_t free_rotation = randomInt(rng, 0, static_cast<int32_t>(phrase.steps - 1u));
  const int32_t raw_rotation = anchor_root ? 0 : (rotation_energy < 0.5f ? local_rotation : static_cast<int32_t>(free_rotation));
  phrase.rotation = static_cast<uint32_t>((raw_rotation % static_cast<int32_t>(phrase.steps) + static_cast<int32_t>(phrase.steps)) % static_cast<int32_t>(phrase.steps));
  phrase.trigger_mask = euclideanMask(phrase.steps, phrase.hits, phrase.rotation);
  const uint32_t contour = contourFor(config.feel_x, zone, random_walk, rng);
  phrase.contour = static_cast<ProductScatterContour>(contour);
  const bool rise = contour >= 5u || nextScatterRandom(rng) < 0.5f;
  float primary[kProductScatterMaxSteps]{};
  float walk = contour == 5u ? nextScatterRandom(rng) : 0.0f;
  const float walk_step = 0.16f + instability * 0.28f + chaos * 0.1f + random_walk * 0.22f;
  const float random_mix = clampUnit(std::max(0.0f, instability - 0.18f) * 0.95f + (chaos > 0.8f ? 0.08f : 0.0f));
  const float jitter = instability * 0.34f + chaos * 0.08f;
  for (uint32_t hit = 0u; hit < phrase.hits; ++hit) {
    if (contour == 6u) primary[hit] = nextScatterRandom(rng);
    else if (contour == 5u) {
      walk = clampUnit(walk + (nextScatterRandom(rng) - 0.5f) * walk_step);
      primary[hit] = walk;
    } else {
      const float phase = phrase.hits <= 1u ? 0.5f : static_cast<float>(hit) / static_cast<float>(phrase.hits - 1u);
      const float shaped = shapedContour(contour, phase);
      const float directed = rise ? shaped : 1.0f - shaped;
      primary[hit] = clampUnit(
          directed * (1.0f - random_mix) + nextScatterRandom(rng) * random_mix +
          (nextScatterRandom(rng) - 0.5f) * jitter);
    }
  }
  const float lane_randomness = clampUnit(instability * 0.72f + chaos * 0.16f);
  const int32_t pitch_spread = std::clamp(
      jsRound(12.0f + chaos * 16.0f + spread * 20.0f + motion * 8.0f + instability * 14.0f), 8, 48);
  const float expression_floor = clampUnit(0.7f - chaos * 0.22f - instability * 0.18f);
  const float expression_ceiling = clampUnit(0.92f + chaos * 0.04f + instability * 0.08f);
  uint32_t hit = 0u;
  for (uint32_t step = 0u; step < phrase.steps; ++step) {
    phrase.expression[step] = 0.78f;
    phrase.morph[step] = 0.5f;
    phrase.distance[step] = 0.5f;
    phrase.ratchet[step] = 1u;
    if ((phrase.trigger_mask & (1u << step)) == 0u) continue;
    const float value = primary[hit++];
    auto decorrelate = [&](float input, float amount) {
      const float safe = clampUnit(amount);
      return clampUnit(input * (1.0f - safe) + nextScatterRandom(rng) * safe);
    };
    const float pitch_value = decorrelate(value, lane_randomness);
    const float expression_value = decorrelate(value, lane_randomness * 0.8f + chaos * 0.08f);
    const float morph_value = decorrelate(value, lane_randomness * 0.65f);
    const float distance_value = decorrelate(1.0f - value, lane_randomness * 0.58f + spread * 0.15f);
    const float morph_depth = clampUnit(0.32f + motion * 0.48f + instability * 0.2f);
    const float distance_depth = clampUnit(0.54f + spread * 0.34f + instability * 0.18f);
    phrase.pitch[step] = clampPitch((pitch_value - 0.5f) * static_cast<float>(pitch_spread) * 2.0f);
    phrase.expression[step] = clampUnit(expression_floor + expression_value * (expression_ceiling - expression_floor));
    phrase.morph[step] = clampUnit(0.5f + (morph_value - 0.5f) * morph_depth * 2.0f);
    phrase.distance[step] = clampUnit(0.5f + (distance_value - 0.5f) * distance_depth * 2.0f);
  }
  ensureUnitVariation(phrase.expression, phrase.trigger_mask, phrase.steps, phrase.hits, 0.06f + motion * 0.08f + fracture * 0.08f + instability * 0.1f);
  ensureUnitVariation(phrase.morph, phrase.trigger_mask, phrase.steps, phrase.hits, 0.07f + motion * 0.18f + instability * 0.08f);
  ensureUnitVariation(phrase.distance, phrase.trigger_mask, phrase.steps, phrase.hits, 0.08f + spread * 0.16f + fracture * 0.08f + instability * 0.08f);
  if (phrase.hits >= 2u && !variedPitch(phrase.pitch, phrase.trigger_mask, phrase.steps)) {
    uint32_t ordinal = 0u;
    const int32_t interval = std::clamp(pitch_spread / 2, 2, 48);
    for (uint32_t step = 0u; step < phrase.steps; ++step) {
      if ((phrase.trigger_mask & (1u << step)) == 0u) continue;
      const float phase = static_cast<float>(ordinal) / static_cast<float>(phrase.hits - 1u);
      phrase.pitch[step] = clampPitch((ordinal % 2u == 0u ? -1.0f : 1.0f) * std::max(2, jsRound(interval + phase * interval)));
      ++ordinal;
    }
  }
  bool has_negative = false;
  bool has_positive = false;
  for (uint32_t step = 0u; step < phrase.steps; ++step) {
    if ((phrase.trigger_mask & (1u << step)) == 0u) continue;
    has_negative |= phrase.pitch[step] < 0;
    has_positive |= phrase.pitch[step] > 0;
  }
  if (phrase.hits >= 2u && (!has_negative || !has_positive)) {
    const int32_t amplitude = std::clamp(jsRound(static_cast<float>(pitch_spread) * 0.72f), 6, 48);
    uint32_t ordinal = 0u;
    for (uint32_t step = 0u; step < phrase.steps; ++step) {
      if ((phrase.trigger_mask & (1u << step)) == 0u) continue;
      const float phase = static_cast<float>(ordinal) / static_cast<float>(phrase.hits - 1u);
      const int32_t sweep = jsRound((phase * 2.0f - 1.0f) * amplitude);
      const int32_t alternate = jsRound((ordinal % 2u == 0u ? -1.0f : 1.0f) * amplitude * 0.28f);
      phrase.pitch[step] = clampPitch(phrase.pitch[step] * 0.25f + sweep * 0.55f + alternate * 0.2f);
      ++ordinal;
    }
  }
  bool has_ratchet = false;
  for (uint32_t step = 0u; step < phrase.steps; ++step) {
    if ((phrase.trigger_mask & (1u << step)) == 0u || zone == 0u) continue;
    if (nextScatterRandom(rng) < fracture * 0.3f) {
      phrase.ratchet[step] = randomInt(rng, 2, zone == 4u ? 4 : 3);
      has_ratchet = true;
    }
  }
  if (phrase.hits > 1u && !has_ratchet && (fracture > 0.22f || motion > 0.45f)) {
    uint32_t target = phrase.hits / 2u;
    for (uint32_t step = 0u, ordinal = 0u; step < phrase.steps; ++step) {
      if ((phrase.trigger_mask & (1u << step)) == 0u) continue;
      if (ordinal++ == target) { phrase.ratchet[step] = fracture > 0.66f ? 3u : 2u; break; }
    }
  }
  phrase.clock_division = chaos > 0.7f ? 16u : chaos > 0.35f ? 12u : 8u;
  phrase.swing = zone == 0u ? 0.0f : static_cast<float>(jsRound(chaos * 8.0f)) / 100.0f;
  return phrase;
}

void KesshoProductEngine::applyScatterVoiceParamEvent(const KesshoProductEvent& event) {
  ProductScatterVoiceConfig& config = scatter_runtime.staging[event.index];
  switch (event.param_id) {
    case KESSHO_PRODUCT_SCATTER_PARAM_ENABLED: config.enabled = event.value >= 0.5f; break;
    case KESSHO_PRODUCT_SCATTER_PARAM_TRIGGER_PROBABILITY: config.trigger_probability = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_BURST_PROBABILITY: config.burst_probability = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK: config.random_walk = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK_ENABLED: config.random_walk_enabled = event.value >= 0.5f; break;
    case KESSHO_PRODUCT_SCATTER_PARAM_FEEL_X: config.feel_x = clampFeel(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_FEEL_Y: config.feel_y = clampFeel(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_ANCHOR: config.anchor = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_BREATH: config.breath = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_MEMORY: config.memory = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_MOTION: config.motion = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_FRACTURE: config.fracture = clampUnit(event.value); break;
    case KESSHO_PRODUCT_SCATTER_PARAM_SPREAD: config.spread = clampUnit(event.value); break;
    default: break;
  }
}

void KesshoProductEngine::commitScatterConfig() {
  for (uint32_t voice = 0u; voice < kProductScatterVoiceCount; ++voice) {
    scatter_runtime.active[voice] = scatter_runtime.staging[voice];
    scatter_runtime.voices[voice].rng_state = hashU32(rng_seed ^ (voice + 1u) * 0x9e3779b1u);
  }
  scatter_runtime.selector_rng_state = hashU32(rng_seed ^ 0x51ed270bu);
}

void KesshoProductEngine::setScatterEnabled(bool enabled) {
  scatter_runtime.enabled = enabled;
  scatter_runtime.global_cooldown_until_frame = transport.sample_frame;
  scatter_runtime.next_selector_frame = transport.sample_frame;
  scatter_runtime.current_voice = UINT32_MAX;
  if (!enabled) scatter_runtime.current_phrase = {};
}

void KesshoProductEngine::scheduleScatterEvents(uint32_t frames, SequencerBuffer& out) {
  if (!scatter_runtime.enabled || !transport.running || frames == 0u) return;
  const uint64_t block_start = transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  const double selector_frames = transport.samplesPerBeat(sample_rate) * 0.25;
  if (scatter_runtime.next_selector_frame < block_start) {
    scatter_runtime.next_selector_frame = sequencerAlignForwardSampleFrame(block_start, selector_frames);
  }
  if (scatter_runtime.next_selector_frame < block_end && block_start >= scatter_runtime.global_cooldown_until_frame) {
    uint32_t candidates[kProductScatterVoiceCount]{};
    uint32_t candidate_count = 0u;
    for (uint32_t voice = 0u; voice < kProductScatterVoiceCount; ++voice) {
      ProductScatterVoiceRuntime& runtime = scatter_runtime.voices[voice];
      if (!scatter_runtime.active[voice].enabled || block_start < runtime.cooldown_until_frame) continue;
      if (nextScatterRandom(runtime.rng_state) <= scatter_runtime.active[voice].trigger_probability) {
        candidates[candidate_count++] = voice;
      }
    }
    if (candidate_count > 0u) {
      const uint32_t selected = std::min<uint32_t>(
          static_cast<uint32_t>(nextScatterRandom(scatter_runtime.selector_rng_state) * candidate_count),
          candidate_count - 1u);
      const uint32_t voice = candidates[selected];
      ProductScatterVoiceRuntime& runtime = scatter_runtime.voices[voice];
      const uint32_t seed = runtime.rng_state ^ (++runtime.phrase_counter * 0x85ebca6bu);
      scatter_runtime.current_phrase = generateScatterPhrase(voice, seed);
      scatter_runtime.current_phrase_id = scatter_runtime.current_phrase.id;
      scatter_runtime.current_voice = voice;
      scatter_runtime.phrase_start_frame = scatter_runtime.next_selector_frame;
      const double step_frames = sequencerSamplesPerStep(transport, sample_rate, scatter_runtime.current_phrase.clock_division);
      const uint64_t cooldown = static_cast<uint64_t>(std::llround(step_frames * (scatter_runtime.current_phrase.steps + 1u)));
      scatter_runtime.global_cooldown_until_frame = scatter_runtime.phrase_start_frame + cooldown;
      runtime.cooldown_until_frame = scatter_runtime.global_cooldown_until_frame;
      runtime.recent_phrase_ids[runtime.recent_phrase_write] = scatter_runtime.current_phrase.id;
      runtime.recent_phrase_write = (runtime.recent_phrase_write + 1u) % kProductScatterRecentPhraseCount;
      runtime.recent_phrase_count = std::min<uint32_t>(runtime.recent_phrase_count + 1u, kProductScatterRecentPhraseCount);
    }
  }
  while (scatter_runtime.next_selector_frame < block_end) {
    scatter_runtime.next_selector_frame += static_cast<uint64_t>(std::max(1.0, std::round(selector_frames)));
  }

  const ProductScatterPhrase& phrase = scatter_runtime.current_phrase;
  if (scatter_runtime.current_voice >= kProductScatterVoiceCount || phrase.steps == 0u) return;
  const double step_frames = sequencerSamplesPerStep(transport, sample_rate, phrase.clock_division);
  const uint64_t relative_start = block_start > scatter_runtime.phrase_start_frame
      ? block_start - scatter_runtime.phrase_start_frame
      : 0u;
  const uint64_t relative_end = block_end > scatter_runtime.phrase_start_frame
      ? block_end - scatter_runtime.phrase_start_frame
      : 0u;
  uint32_t first_step = static_cast<uint32_t>(std::floor(static_cast<double>(relative_start) / step_frames));
  if (first_step > 0u) --first_step;
  const uint32_t last_step = std::min<uint32_t>(
      phrase.steps,
      static_cast<uint32_t>(std::ceil(static_cast<double>(relative_end) / step_frames)) + 1u);
  if (first_step >= last_step) return;
  for (uint32_t step = first_step; step < last_step; ++step) {
    if ((phrase.trigger_mask & (1u << step)) == 0u) continue;
    const uint64_t step_frame = scatter_runtime.phrase_start_frame + static_cast<uint64_t>(std::llround(step_frames * step));
    const uint32_t ratchets = std::clamp<uint32_t>(phrase.ratchet[step], 1u, 8u);
    for (uint32_t ratchet = 0u; ratchet < ratchets; ++ratchet) {
      const uint64_t event_frame = step_frame + static_cast<uint64_t>(std::llround(step_frames * ratchet / ratchets));
      if (event_frame < block_start || event_frame >= block_end) continue;
      KesshoSequencerEvent event{};
      event.sample_offset = static_cast<uint32_t>(event_frame - block_start);
      event.source_id = KESSHO_PRODUCT_SOURCE_DRUM;
      event.lane_id = 0xfffdu;
      event.step_id = static_cast<uint16_t>(step);
      event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_TRIGGER_DRUM_VOICE);
      event.midi_note = midiNoteForDrumVoice(phrase.voice);
      event.velocity = std::clamp(phrase.expression[step] * (ratchet == 0u ? 1.0f : 0.82f), 0.12f, 1.0f);
      event.hold_seconds = 0.12f;
      event.morph = phrase.morph[step];
      event.distance = phrase.distance[step];
      event.expression = phrase.expression[step];
      event.send_granular = static_cast<float>(phrase.pitch[step]);
      event.send_delay_a = 1.0e10f;
      event.send_delay_b = 1.0e10f;
      event.flags = ratchet;
      if (!out.push(event)) return;
      scatter_runtime.current_step = step;
      ++scatter_runtime.pulse_count;
    }
  }
}
