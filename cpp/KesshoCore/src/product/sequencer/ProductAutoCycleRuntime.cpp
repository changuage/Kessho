#include "../KesshoProductEngineInternal.h"

namespace {

using namespace kessho::product::internal;

constexpr float kEndpointTolerance = 0.05f;
constexpr uint32_t kScenePositionSteps = 100u;

bool isMorphPhase(ProductAutoCyclePhase phase) {
  return phase == ProductAutoCyclePhase::Entry ||
      phase == ProductAutoCyclePhase::MorphAB ||
      phase == ProductAutoCyclePhase::MorphBA;
}

float phasePosition(const ProductAutoCycleRuntimeState& runtime, uint64_t frame) {
  if (!isMorphPhase(runtime.phase) || runtime.phase_end_frame <= runtime.phase_start_frame) {
    return runtime.position;
  }
  const double elapsed = static_cast<double>(frame - runtime.phase_start_frame);
  const double duration = static_cast<double>(runtime.phase_end_frame - runtime.phase_start_frame);
  const float progress = static_cast<float>(std::clamp(elapsed / duration, 0.0, 1.0));
  if (runtime.phase == ProductAutoCyclePhase::Entry) {
    return runtime.entry_start_position +
        (runtime.entry_target_position - runtime.entry_start_position) * progress;
  }
  return runtime.phase == ProductAutoCyclePhase::MorphAB ? progress : 1.0f - progress;
}

uint64_t phaseFrames(
    const KesshoProductEngine& engine,
    ProductAutoCyclePhase phase,
    const ProductAutoCycleRuntimeState& runtime) {
  const double phrases = phase == ProductAutoCyclePhase::Hold
      ? 1.0
      : (phase == ProductAutoCyclePhase::PlayA || phase == ProductAutoCyclePhase::PlayB)
          ? runtime.play_phrases
          : runtime.transition_phrases;
  return std::max<uint64_t>(
      1u,
      static_cast<uint64_t>(std::llround(engine.transport.samplesPerPhrase(engine.sample_rate) * phrases)));
}

void beginPhase(
    KesshoProductEngine& engine,
    ProductAutoCyclePhase phase,
    uint64_t frame) {
  ProductAutoCycleRuntimeState& runtime = engine.auto_cycle_runtime;
  runtime.phase = phase;
  runtime.phase_start_frame = frame;
  runtime.phase_end_frame = frame + phaseFrames(engine, phase, runtime);
  switch (phase) {
    case ProductAutoCyclePhase::PlayA:
      runtime.position = 0.0f;
      engine.harmony.cof_current_step = 0;
      engine.harmony.cof_phrase_counter = 0u;
      break;
    case ProductAutoCyclePhase::PlayB:
      runtime.position = 1.0f;
      engine.harmony.cof_current_step = 0;
      engine.harmony.cof_phrase_counter = 0u;
      break;
    case ProductAutoCyclePhase::MorphAB:
      runtime.position = 0.0f;
      break;
    case ProductAutoCyclePhase::MorphBA:
      runtime.position = 1.0f;
      break;
    default:
      break;
  }
}

void advancePhase(KesshoProductEngine& engine, uint64_t frame) {
  ProductAutoCycleRuntimeState& runtime = engine.auto_cycle_runtime;
  switch (runtime.phase) {
    case ProductAutoCyclePhase::Hold:
      beginPhase(engine, ProductAutoCyclePhase::Entry, frame);
      break;
    case ProductAutoCyclePhase::Entry:
      beginPhase(
          engine,
          runtime.entry_target_position <= 0.0f
              ? ProductAutoCyclePhase::PlayA
              : ProductAutoCyclePhase::PlayB,
          frame);
      break;
    case ProductAutoCyclePhase::PlayA:
      beginPhase(engine, ProductAutoCyclePhase::MorphAB, frame);
      break;
    case ProductAutoCyclePhase::MorphAB:
      beginPhase(engine, ProductAutoCyclePhase::PlayB, frame);
      break;
    case ProductAutoCyclePhase::PlayB:
      beginPhase(engine, ProductAutoCyclePhase::MorphBA, frame);
      break;
    case ProductAutoCyclePhase::MorphBA:
      beginPhase(engine, ProductAutoCyclePhase::PlayA, frame);
      break;
    case ProductAutoCyclePhase::Off:
    default:
      return;
  }
  runtime.transition_count += 1u;
}

uint64_t nextQuantizedPositionFrame(const ProductAutoCycleRuntimeState& runtime, uint64_t frame) {
  if (!isMorphPhase(runtime.phase) || runtime.phase_end_frame <= frame) return runtime.phase_end_frame;
  const uint64_t duration = runtime.phase_end_frame - runtime.phase_start_frame;
  const uint64_t elapsed = frame - runtime.phase_start_frame;
  const uint64_t current_step = std::min<uint64_t>(
      kScenePositionSteps - 1u,
      (elapsed * kScenePositionSteps) / duration);
  const uint64_t next_elapsed = ((current_step + 1u) * duration + kScenePositionSteps - 1u) /
      kScenePositionSteps;
  return std::min(runtime.phase_end_frame, runtime.phase_start_frame + next_elapsed);
}

} // namespace

void KesshoProductEngine::configureGlobalAutoCycle(const KesshoProductEvent& event) {
  if (journey_schedule_runtime.running && (event.flags & 1u) != 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  if ((event.flags & 2u) != 0u) {
    auto_cycle_runtime.play_phrases = std::clamp(event.value2, 0.0f, 1024.0f);
    auto_cycle_runtime.transition_phrases = std::clamp(event.value3, 0.0f, 1024.0f);
    return;
  }
  ProductAutoCycleRuntimeState next{};
  next.enabled = (event.flags & 1u) != 0u;
  next.entry_start_position = std::clamp(event.value, 0.0f, 1.0f);
  next.entry_target_position = next.entry_start_position <= 0.5f ? 0.0f : 1.0f;
  next.position = next.entry_start_position;
  next.play_phrases = std::clamp(event.value2, 0.0f, 1024.0f);
  next.transition_phrases = std::clamp(event.value3, 0.0f, 1024.0f);
  next.revision = static_cast<uint32_t>(std::lround(event.value4));
  auto_cycle_runtime = next;
  if (!next.enabled) {
    auto_cycle_runtime.phase = ProductAutoCyclePhase::Off;
    return;
  }
  if (next.entry_start_position <= kEndpointTolerance) {
    beginPhase(*this, ProductAutoCyclePhase::PlayA, transport.sample_frame);
  } else if (next.entry_start_position >= 1.0f - kEndpointTolerance) {
    beginPhase(*this, ProductAutoCyclePhase::PlayB, transport.sample_frame);
  } else {
    beginPhase(*this, ProductAutoCyclePhase::Hold, transport.sample_frame);
  }
  setSceneProgramPosition(auto_cycle_runtime.position);
}

void KesshoProductEngine::scheduleGlobalAutoCycle() {
  ProductAutoCycleRuntimeState& runtime = auto_cycle_runtime;
  if (!runtime.enabled || !transport.running) return;
  const uint64_t frame = transport.sample_frame;
  uint32_t guard = 0u;
  while (frame >= runtime.phase_end_frame && guard++ < 8u) {
    advancePhase(*this, runtime.phase_end_frame);
  }
  runtime.position = std::clamp(phasePosition(runtime, frame), 0.0f, 1.0f);
  setSceneProgramPosition(runtime.position);
  runtime.next_position_frame = nextQuantizedPositionFrame(runtime, frame);
}

uint64_t KesshoProductEngine::nextGlobalAutoCycleFrame() const {
  if (!auto_cycle_runtime.enabled || !transport.running) return UINT64_MAX;
  return std::min(auto_cycle_runtime.phase_end_frame, auto_cycle_runtime.next_position_frame);
}
