#pragma once

#include <stdint.h>

#include "KesshoCore/KesshoTypes.h"

namespace kessho::core {

struct SmoothedValue {
  float current = 0.0f;
  float target = 0.0f;
  float step = 0.0f;
  uint32_t frames_remaining = 0;

  void reset(float value);
  void setImmediate(float value);
  void setRamp(float value, uint32_t frames);
  float next();
};

struct Transport {
  uint64_t sample_frame = 0;
  bool running = false;

  void reset();
  void start();
  void stop();
  void advance(int frames);
};

class Engine {
public:
  Engine(double sample_rate, int max_block_size);

  bool isValid() const;
  void reset();
  void start();
  void stop();
  bool isRunning() const;
  void render(float* out_l, float* out_r, int frames);

  bool setRenderMode(int render_mode);
  void setSmokeTone(float frequency_hz, float amplitude);
  bool applySnapshot(const KesshoCoreSnapshotV1& snapshot);
  bool setTransportSignature(uint32_t beats_per_bar, uint32_t bars_per_phrase);
  bool pushParamEvent(const KesshoParamEvent& event);
  bool pushMidiEvent(const KesshoMidiEvent& event);
  bool pushTransportEvent(const KesshoTransportEvent& event);
  int eventQueueDepth() const;
  uint32_t midiEventsProcessed() const;
  void setSeed(uint32_t seed);
  uint32_t seed() const;
  uint32_t rngState() const;
  float nextRandomFloat();
  uint64_t sampleFrame() const;
  double sampleRate() const;
  int maxBlockSize() const;
  int renderMode() const;
  void fillTransportInfo(KesshoTransportInfo& info) const;

private:
  struct QueuedEvent {
    KesshoEventType type = KESSHO_EVENT_PARAM;
    uint32_t sample_offset = 0;
    uint32_t sequence = 0;
    KesshoParamEvent param{};
    KesshoMidiEvent midi{};
    KesshoTransportEvent transport{};
  };

  double sample_rate_ = 48000.0;
  int max_block_size_ = 128;
  int render_mode_ = KESSHO_RENDER_SILENCE;
  float bpm_ = 120.0f;
  uint32_t beats_per_bar_ = 4;
  uint32_t bars_per_phrase_ = 4;
  SmoothedValue master_gain_;
  SmoothedValue smoke_amplitude_;
  float smoke_frequency_hz_ = 220.0f;
  double smoke_phase_ = 0.0;
  uint32_t rng_seed_ = KESSHO_CORE_DEFAULT_SEED;
  uint32_t rng_state_ = KESSHO_CORE_DEFAULT_SEED;
  QueuedEvent event_queue_[KESSHO_CORE_MAX_EVENTS]{};
  int event_count_ = 0;
  uint32_t next_event_sequence_ = 1;
  uint32_t midi_events_processed_ = 0;
  Transport transport_;

  bool pushEvent(const QueuedEvent& event);
  void sortEvents();
  void applyEvent(const QueuedEvent& event);
  void compactEventsAfterRender(int frames, int first_unprocessed_event);
  void applyParamEvent(const KesshoParamEvent& event);
  void applyTransportEvent(const KesshoTransportEvent& event);
  void renderSilence(float* out_l, float* out_r, int frames);
  void renderSmokeSine(float* out_l, float* out_r, int frames);
};

} // namespace kessho::core

struct KesshoEngine {
  kessho::core::Engine impl;
};
