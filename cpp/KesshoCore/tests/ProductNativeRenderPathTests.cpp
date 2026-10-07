#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <atomic>
#include <thread>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoNativeProductRuntime.h"
#include "KesshoProductEventIds.h"
#include "KesshoProductParamIds.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr uint32_t kBlockFrames = 128;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product native render path test failed: " << message << "\n";
    std::exit(1);
  }
}

class NativeProductEngine {
 public:
  NativeProductEngine(double sample_rate, uint32_t max_block_size)
      : engine_(kessho_product_create(sample_rate, max_block_size, 0)) {}

  ~NativeProductEngine() {
    if (engine_ != nullptr) {
      kessho_product_destroy(engine_);
    }
  }

  NativeProductEngine(const NativeProductEngine&) = delete;
  NativeProductEngine& operator=(const NativeProductEngine&) = delete;

  bool valid() const { return engine_ != nullptr; }

  int32_t loadSnapshot(const KesshoProductSnapshotV2& snapshot) {
    return kessho_product_load_snapshot_v2(engine_, &snapshot, sizeof(snapshot));
  }

  int32_t enqueueEvent(const KesshoProductEvent& event) {
    return kessho_product_enqueue_event(engine_, &event);
  }

  int32_t enqueueEvents(const KesshoProductEvent* events, uint32_t event_count) {
    return kessho_product_enqueue_events(engine_, events, event_count);
  }

  void render(float* out_l, float* out_r, uint32_t frames) {
    kessho_product_render(engine_, out_l, out_r, frames);
  }

  int32_t copyTelemetry(KesshoProductTelemetry& telemetry) {
    return kessho_product_copy_telemetry(engine_, &telemetry);
  }

  int32_t registerAsset(
      uint32_t asset_id,
      const float* const* channels,
      uint32_t channel_count,
      uint32_t frame_count,
      double sample_rate) {
    return kessho_product_register_asset_buffer(
        engine_,
        asset_id,
        channels,
        channel_count,
        frame_count,
        sample_rate,
        0);
  }

  int32_t unregisterAsset(uint32_t asset_id) {
    return kessho_product_unregister_asset_buffer(engine_, asset_id);
  }

 private:
  KesshoProductEngine* engine_ = nullptr;
};

KesshoProductSnapshotV2 makeNativeSmokeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 0.8f;
  snapshot.rng.seed = 23;
  snapshot.rng.state = 23;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = i == KESSHO_PRODUCT_SOURCE_PAD1 - 1 ? 1u : 0u;
    snapshot.sources[i].source_id = i + 1u;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.85f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

KesshoProductEvent startEvent() {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  return event;
}

KesshoProductEvent manualPadNote() {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  event.value = 60.0f;
  event.value2 = 0.75f;
  event.value3 = 0.45f;
  return event;
}

float renderPeak(NativeProductEngine& engine) {
  std::array<float, kBlockFrames> left{};
  std::array<float, kBlockFrames> right{};
  float peak = 0.0f;
  for (uint32_t block = 0; block < 64; ++block) {
    left.fill(0.0f);
    right.fill(0.0f);
    engine.render(left.data(), right.data(), kBlockFrames);
    for (uint32_t frame = 0; frame < kBlockFrames; ++frame) {
      require(std::isfinite(left[frame]) && std::isfinite(right[frame]), "non-finite native render sample");
      peak = std::max(peak, std::max(std::fabs(left[frame]), std::fabs(right[frame])));
    }
  }
  return peak;
}

void runNativeRenderSmoke() {
  NativeProductEngine engine(48000.0, kBlockFrames);
  require(engine.valid(), "native wrapper failed to create Product Core engine");
  const KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  require(engine.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK, "native wrapper failed to load snapshot");
  const std::array<KesshoProductEvent, 2> events{startEvent(), manualPadNote()};
  require(engine.enqueueEvents(events.data(), static_cast<uint32_t>(events.size())) == KESSHO_PRODUCT_OK, "native wrapper failed to enqueue events");
  require(renderPeak(engine) > 0.00001f, "native wrapper render stayed silent");

  KesshoProductTelemetry telemetry{};
  require(engine.copyTelemetry(telemetry) == KESSHO_PRODUCT_OK, "native wrapper failed to copy telemetry");
  require(telemetry.sample_rate == 48000.0, "native telemetry sample rate mismatch");
  require(telemetry.block_size == kBlockFrames, "native telemetry block size mismatch");
}

void runNativeAssetSmoke() {
  NativeProductEngine engine(48000.0, kBlockFrames);
  require(engine.valid(), "native asset wrapper failed to create Product Core engine");
  std::array<float, 256> left{};
  std::array<float, 256> right{};
  for (size_t i = 0; i < left.size(); ++i) {
    left[i] = std::sin(static_cast<float>(i) * 0.03f) * 0.2f;
    right[i] = std::cos(static_cast<float>(i) * 0.03f) * 0.2f;
  }
  const float* channels[] = {left.data(), right.data()};
  require(engine.registerAsset(9001, channels, 2, static_cast<uint32_t>(left.size()), 48000.0) == KESSHO_PRODUCT_OK, "native asset registration failed");
  require(engine.unregisterAsset(9001) == KESSHO_PRODUCT_OK, "native asset unregister failed");
}

float renderPeak(const float* left, const float* right, uint32_t frames) {
  float peak = 0.0f;
  for (uint32_t frame = 0; frame < frames; ++frame) {
    require(std::isfinite(left[frame]) && std::isfinite(right[frame]), "non-finite native runtime render sample");
    peak = std::max(peak, std::max(std::fabs(left[frame]), std::fabs(right[frame])));
  }
  return peak;
}

void runNativeRuntimeAdapterSmoke() {
  kessho::product::native::NativeProductRuntime runtime({48000.0, kBlockFrames, 0});
  require(runtime.valid(), "native runtime adapter failed to create Product Core engine");
  const KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  require(runtime.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK, "native runtime adapter failed to load snapshot");
  require(runtime.setInteractionDemand(
      KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS | KESSHO_PRODUCT_INTERACTION_DEMAND_ENVELOPE,
      KESSHO_PRODUCT_INTERACTION_SOURCE_MASK_ALL) == KESSHO_PRODUCT_OK,
      "native runtime adapter failed to set interaction demand");
  const std::array<KesshoProductEvent, 2> events{startEvent(), manualPadNote()};
  require(runtime.enqueueEvents(events.data(), static_cast<uint32_t>(events.size())) == KESSHO_PRODUCT_OK, "native runtime adapter failed to enqueue events");
  require(runtime.queuedEventCount() == events.size(), "native runtime adapter queue depth mismatch before render");
  float peak = 0.0f;
  for (uint32_t block = 0; block < 64; ++block) {
    require(runtime.renderIntoPreallocatedBuffers(kBlockFrames) == KESSHO_PRODUCT_OK, "native runtime adapter render callback failed");
    peak = std::max(peak, renderPeak(runtime.preallocatedLeft(), runtime.preallocatedRight(), kBlockFrames));
  }
  require(peak > 0.00001f, "native runtime adapter render stayed silent");
  require(runtime.queuedEventCount() == 0, "native runtime adapter did not drain queued events on render thread");
  KesshoProductTelemetry telemetry{};
  require(runtime.copyTelemetry(telemetry) == KESSHO_PRODUCT_OK, "native runtime adapter failed telemetry double-buffer copy");
  require(telemetry.sample_rate == 48000.0, "native runtime adapter telemetry sample rate mismatch");
  require(telemetry.block_size == kBlockFrames, "native runtime adapter telemetry block size mismatch");
  require(runtime.droppedEventCount() == 0, "native runtime adapter dropped events unexpectedly");
  std::array<KesshoProductInteractionEvent, 16> interaction_events{};
  uint32_t interaction_overflow = 0u;
  const uint32_t interaction_count = runtime.drainInteractionEvents(
      interaction_events.data(), static_cast<uint32_t>(interaction_events.size()), &interaction_overflow);
  require(interaction_count >= 2u && interaction_overflow == 0u,
      "native runtime adapter did not publish interaction events");
  require(interaction_events[0].type == KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_STARTED,
      "native interaction event order changed");
  KesshoProductInteractionSignalSnapshot interaction_signals{};
  require(runtime.copyInteractionSignals(interaction_signals) == KESSHO_PRODUCT_OK &&
          interaction_signals.version == KESSHO_PRODUCT_INTERACTION_VERSION,
      "native runtime adapter did not publish interaction signals");
  require(runtime.telemetryPublicationCount() <= 4u, "native telemetry published more often than every 16 blocks");
  const uint64_t publications_before_request = runtime.telemetryPublicationCount();
  runtime.requestTelemetryRefresh();
  require(runtime.renderIntoPreallocatedBuffers(kBlockFrames) == KESSHO_PRODUCT_OK, "native requested telemetry render failed");
  require(
      runtime.telemetryPublicationCount() == publications_before_request + 1u,
      "native explicit diagnostic request did not publish exactly once");
  require(runtime.reset() == KESSHO_PRODUCT_OK, "native runtime adapter reset failed");
  require(runtime.queuedEventCount() == 0, "native runtime adapter reset left queued events");
}

void runNativeCaptureClockConcurrencySmoke() {
  kessho::product::native::NativeProductRuntime runtime({48000.0, kBlockFrames, 0});
  require(runtime.valid(), "native capture clock runtime failed to create Product Core engine");
  KesshoProductCaptureClock initial{};
  require(runtime.copyCaptureClock(initial) == KESSHO_PRODUCT_OK,
      "native capture clock did not publish its initial snapshot");
  require(initial.schema_version == KESSHO_PRODUCT_CAPTURE_CLOCK_SCHEMA_VERSION,
      "native capture clock schema mismatch");
  require(initial.reserved == 0u && std::isfinite(initial.current_bpm) && initial.current_bpm > 0.0,
      "native capture clock initial BPM is invalid");
  KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  snapshot.transport.running = 1u;
  require(runtime.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK,
      "native capture clock tempo snapshot failed");

  std::atomic<bool> stop_reader{false};
  std::atomic<bool> reader_failed{false};
  std::thread reader([&]() {
    while (!stop_reader.load(std::memory_order_acquire)) {
      KesshoProductCaptureClock clock{};
      const int32_t result = runtime.copyCaptureClock(clock);
      if (result == KESSHO_PRODUCT_OK) {
        if (clock.schema_version != KESSHO_PRODUCT_CAPTURE_CLOCK_SCHEMA_VERSION ||
            clock.reserved != 0u ||
            !std::isfinite(clock.current_beat) ||
            !std::isfinite(clock.current_bpm) ||
            clock.current_bpm <= 0.0 ||
            (std::fabs(clock.current_bpm - 120.0) > 0.001 &&
             std::fabs(clock.current_bpm - 60.0) > 0.001)) {
          reader_failed.store(true, std::memory_order_release);
          return;
        }
      } else if (result != KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL) {
        reader_failed.store(true, std::memory_order_release);
        return;
      }
    }
  });
  for (uint32_t block = 0u; block < 256u; ++block) {
    if (block == 64u) {
      KesshoProductEvent tempo{};
      tempo.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT;
      tempo.value = 60.0f;
      require(runtime.enqueueEvent(tempo) == KESSHO_PRODUCT_OK,
          "native capture clock tempo change enqueue failed");
    }
    require(runtime.renderIntoPreallocatedBuffers(kBlockFrames) == KESSHO_PRODUCT_OK,
        "native capture clock concurrent render failed");
  }
  stop_reader.store(true, std::memory_order_release);
  reader.join();
  require(!reader_failed.load(std::memory_order_acquire),
      "native capture clock reader observed a torn publication");
  KesshoProductCaptureClock final{};
  require(runtime.copyCaptureClock(final) == KESSHO_PRODUCT_OK &&
          std::fabs(final.current_bpm - 60.0) <= 0.001,
      "native capture clock did not publish the tempo change");
}

KesshoProductSequencerVariationBank makeNativeVariationBank() {
  KesshoProductSequencerVariationBank bank{};
  bank.schema_version = KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION;
  bank.enabled = 1u;
  bank.chain_length = 1u;
  bank.chain[0] = 0u;
  bank.play_variation = 0u;
  auto& variation = bank.variations[0];
  variation.step_count = 2u;
  variation.clock_division = 64u;
  variation.trigger_mask = 0x3u;
  variation.pitch_root = 60.0f;
  variation.steps[0].mode = KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_SINGLE;
  variation.steps[0].note_count = 1u;
  variation.steps[0].gate_beats = 0.5f;
  variation.steps[0].notes[0].midi_note = 0.0f;
  variation.steps[0].notes[0].velocity = 1.0f;
  variation.steps[1] = variation.steps[0];
  return bank;
}

void runNativeRecordedCaptureSmoke() {
  kessho::product::native::NativeProductRuntime runtime({48000.0, kBlockFrames, 0});
  KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  snapshot.transport.running = 1u;
  require(runtime.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK,
      "native recording snapshot failed");
  uint64_t origin_sample = 0u;
  double origin_beat = 0.0;
  require(runtime.setRecordedCapture(true, 0u, 0u, 0u, 4.0) == KESSHO_PRODUCT_OK,
      "native manual recording arm failed");
  require(!runtime.copyRecordedCaptureOrigin(origin_sample, origin_beat),
      "native recording must await render-thread origin acknowledgement");
  float left[kBlockFrames]{};
  float right[kBlockFrames]{};
  require(runtime.renderCallback(left, right, kBlockFrames) == KESSHO_PRODUCT_OK,
      "native recording arm render failed");
  require(runtime.copyRecordedCaptureOrigin(origin_sample, origin_beat),
      "native recording origin was not published");
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.75f;
  note.value3 = 0.25f;
  require(runtime.enqueueEvent(note) == KESSHO_PRODUCT_OK, "native recording note enqueue failed");
  require(runtime.renderCallback(left, right, kBlockFrames) == KESSHO_PRODUCT_OK,
      "native recording note render failed");
  KesshoProductGeneratedSequencerCaptureEvent events[4]{};
  uint32_t overflow = 0u;
  require(runtime.drainRecordedCaptureEvents(events, 4u, &overflow) == 1u && overflow == 0u,
      "native recording should drain its captured manual attack");
  require(events[0].midi_note == 60.0f && events[0].velocity == 0.75f,
      "native recording should preserve captured note payload");
  KesshoProductEvent tempo{};
  tempo.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT;
  tempo.value = 60.0f;
  require(runtime.enqueueEvent(tempo) == KESSHO_PRODUCT_OK,
      "native recording tempo change enqueue failed");
  require(runtime.renderCallback(left, right, kBlockFrames) == KESSHO_PRODUCT_OK,
      "native recording tempo render failed");
  KesshoProductCaptureClock tempo_clock{};
  require(runtime.copyCaptureClock(tempo_clock) == KESSHO_PRODUCT_OK &&
          std::fabs(tempo_clock.current_bpm - 60.0) <= 0.001,
      "native recording did not consume the authoritative tempo clock");
  require(runtime.setRecordedCapture(false, 0u, 0u, 0u, 0.0) == KESSHO_PRODUCT_OK,
      "native recording stop should accept the bridge zero duration");
  require(runtime.renderCallback(left, right, kBlockFrames) == KESSHO_PRODUCT_OK,
      "native recording stop render failed");
  require(!runtime.recordedCaptureActive(), "native recording should stop on the render thread");
  require(runtime.setRecordedCapture(true, 0u, 0u, 0u, 4.0) == KESSHO_PRODUCT_OK,
      "native recording rearm failed");
  require(!runtime.copyRecordedCaptureOrigin(origin_sample, origin_beat),
      "native rearm must not expose the prior session origin");
}

void runNativeVariationMailboxSmoke() {
  kessho::product::native::NativeProductRuntime runtime({48000.0, kBlockFrames, 0});
  require(runtime.valid(), "native variation runtime failed to create Product Core engine");
  KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  snapshot.synth_euclid.lane_count = 1u;
  auto& lane = snapshot.synth_euclid.lanes[0];
  lane.enabled = 1u;
  lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  lane.step_count = 2u;
  lane.fill_count = 2u;
  lane.clock_division = 16u;
  lane.probability = 1.0f;
  lane.ratchet = 1u;
  lane.midi_note = 60.0f;
  lane.velocity = 1.0f;
  lane.hold_seconds = 0.1f;
  lane.expression = 1.0f;
  lane.seed = 1u;
  require(runtime.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK,
      "native variation runtime failed to load snapshot");

  KesshoProductSequencerVariationBank invalid{};
  invalid.schema_version = KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION;
  invalid.enabled = 1u;
  invalid.chain_length = 1u;
  invalid.chain[0] = 0u;
  require(runtime.setSequencerVariationBank(
      KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, invalid, nullptr) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "native variation runtime accepted an empty enabled bank");
  require(runtime.selectSequencerVariation(
      KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 0u) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "native variation runtime accepted selection before a bank");

  const KesshoProductSequencerVariationBank bank = makeNativeVariationBank();
  uint64_t native_revision = 0u;
  require(runtime.setSequencerVariationBank(
      KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, bank, &native_revision) == KESSHO_PRODUCT_OK,
      "native variation runtime rejected a valid bank");
  require(native_revision == 1u, "native variation runtime assigned an unexpected revision");
  require(runtime.selectSequencerVariation(
      KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 1u) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "native variation runtime accepted an empty variation selection");
  require(runtime.selectSequencerVariation(
      KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, 0u) == KESSHO_PRODUCT_OK,
      "native variation runtime rejected a populated variation selection");

  require(runtime.renderIntoPreallocatedBuffers(kBlockFrames) == KESSHO_PRODUCT_OK,
      "native variation runtime failed to drain the bank mailbox");
  KesshoProductSequencerVariationRuntime published{};
  require(runtime.copySequencerVariationRuntime(
      KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, published) == KESSHO_PRODUCT_OK,
      "native variation runtime failed to copy its published state");
  require(published.revision == native_revision,
      "native variation runtime did not publish the accepted revision");

  std::atomic<bool> stop_reader{false};
  std::atomic<bool> reader_failed{false};
  std::thread reader([&]() {
    while (!stop_reader.load(std::memory_order_acquire)) {
      KesshoProductSequencerVariationRuntime value{};
      if (runtime.copySequencerVariationRuntime(
              KESSHO_PRODUCT_SEQUENCER_SYNTH, 0u, value) == KESSHO_PRODUCT_OK &&
          (value.schema_version != KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION ||
           value.active_variation >= KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT ||
           value.active_step >= KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS)) {
        reader_failed.store(true, std::memory_order_release);
        return;
      }
    }
  });
  for (uint32_t block = 0u; block < 256u; ++block) {
    require(runtime.renderIntoPreallocatedBuffers(kBlockFrames) == KESSHO_PRODUCT_OK,
        "native variation runtime concurrent render failed");
  }
  stop_reader.store(true, std::memory_order_release);
  reader.join();
  require(!reader_failed.load(std::memory_order_acquire),
      "native variation runtime reader observed a torn publication");
}

} // namespace

int main() {
  const KesshoProductCapabilityReport report = kessho_product_get_capability_report();
  require(report.supports_native_bridge == 0, "supports_native_bridge must remain 0 until BG3 signoff");
  runNativeRenderSmoke();
  runNativeAssetSmoke();
  runNativeRuntimeAdapterSmoke();
  runNativeCaptureClockConcurrencySmoke();
  runNativeVariationMailboxSmoke();
  runNativeRecordedCaptureSmoke();
  std::cout << "Kessho Product native render path tests passed\n";
  return 0;
}
