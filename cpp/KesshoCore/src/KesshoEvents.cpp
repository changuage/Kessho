#include "KesshoEngineInternal.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "KesshoCore/KesshoCore.h"

namespace kessho::core {

uint32_t sanitizeOffset(uint32_t offset) {
  return offset > 0x3fffffffu ? 0x3fffffffu : offset;
}

void SmoothedValue::reset(float value) {
  current = value;
  target = value;
  step = 0.0f;
  frames_remaining = 0;
}

void SmoothedValue::setImmediate(float value) {
  reset(value);
}

void SmoothedValue::setRamp(float value, uint32_t frames) {
  if (frames == 0) {
    setImmediate(value);
    return;
  }

  target = value;
  frames_remaining = frames;
  step = (target - current) / static_cast<float>(frames);
}

float SmoothedValue::next() {
  if (frames_remaining == 0) {
    return current;
  }

  current += step;
  --frames_remaining;
  if (frames_remaining == 0) {
    current = target;
    step = 0.0f;
  }
  return current;
}

bool Engine::pushEvent(const QueuedEvent& event) {
  if (event_count_ >= KESSHO_CORE_MAX_EVENTS) {
    return false;
  }

  event_queue_[event_count_] = event;
  event_queue_[event_count_].sample_offset = sanitizeOffset(event.sample_offset);
  event_queue_[event_count_].sequence = next_event_sequence_++;
  ++event_count_;
  return true;
}

bool Engine::pushParamEvent(const KesshoParamEvent& event) {
  if (!std::isfinite(event.value)) {
    return false;
  }

  QueuedEvent queued{};
  queued.type = KESSHO_EVENT_PARAM;
  queued.sample_offset = event.sample_offset;
  queued.param = event;
  queued.param.sample_offset = queued.sample_offset;
  return pushEvent(queued);
}

bool Engine::pushMidiEvent(const KesshoMidiEvent& event) {
  QueuedEvent queued{};
  queued.type = KESSHO_EVENT_MIDI;
  queued.sample_offset = event.sample_offset;
  queued.midi = event;
  queued.midi.sample_offset = queued.sample_offset;
  queued.midi.raw_size = std::min<uint8_t>(event.raw_size, KESSHO_CORE_MIDI_RAW_BYTES);
  if (queued.midi.raw_size < KESSHO_CORE_MIDI_RAW_BYTES) {
    std::memset(
        queued.midi.raw_bytes + queued.midi.raw_size,
        0,
        KESSHO_CORE_MIDI_RAW_BYTES - queued.midi.raw_size);
  }
  return pushEvent(queued);
}

bool Engine::pushTransportEvent(const KesshoTransportEvent& event) {
  if (event.command > KESSHO_TRANSPORT_CONTINUE) {
    return false;
  }

  QueuedEvent queued{};
  queued.type = KESSHO_EVENT_TRANSPORT;
  queued.sample_offset = event.sample_offset;
  queued.transport = event;
  queued.transport.sample_offset = queued.sample_offset;
  return pushEvent(queued);
}

int Engine::eventQueueDepth() const {
  return event_count_;
}

uint32_t Engine::midiEventsProcessed() const {
  return midi_events_processed_;
}

void Engine::sortEvents() {
  for (int i = 1; i < event_count_; ++i) {
    QueuedEvent key = event_queue_[i];
    int j = i - 1;
    while (j >= 0 &&
           (key.sample_offset < event_queue_[j].sample_offset ||
            (key.sample_offset == event_queue_[j].sample_offset &&
             key.sequence < event_queue_[j].sequence))) {
      event_queue_[j + 1] = event_queue_[j];
      --j;
    }
    event_queue_[j + 1] = key;
  }
}

void Engine::applyEvent(const QueuedEvent& event) {
  switch (event.type) {
    case KESSHO_EVENT_PARAM:
      applyParamEvent(event.param);
      break;
    case KESSHO_EVENT_MIDI:
      ++midi_events_processed_;
      break;
    case KESSHO_EVENT_TRANSPORT:
      applyTransportEvent(event.transport);
      break;
    case KESSHO_EVENT_PRESET:
    default:
      break;
  }
}

void Engine::compactEventsAfterRender(int frames, int first_unprocessed_event) {
  int write = 0;
  for (int read = first_unprocessed_event; read < event_count_; ++read) {
    QueuedEvent event = event_queue_[read];
    if (event.sample_offset >= static_cast<uint32_t>(frames)) {
      event.sample_offset -= static_cast<uint32_t>(frames);
      switch (event.type) {
        case KESSHO_EVENT_PARAM:
          event.param.sample_offset = event.sample_offset;
          break;
        case KESSHO_EVENT_MIDI:
          event.midi.sample_offset = event.sample_offset;
          break;
        case KESSHO_EVENT_TRANSPORT:
          event.transport.sample_offset = event.sample_offset;
          break;
        case KESSHO_EVENT_PRESET:
        default:
          break;
      }
      event_queue_[write++] = event;
    }
  }

  event_count_ = write;
}

void Engine::applyParamEvent(const KesshoParamEvent& event) {
  switch (event.param_id) {
    case KESSHO_PARAM_MASTER_GAIN:
      master_gain_.setRamp(std::clamp(event.value, 0.0f, 1.0f), event.ramp_frames);
      break;
    case KESSHO_PARAM_RENDER_MODE:
      setRenderMode(static_cast<int>(event.value));
      break;
    case KESSHO_PARAM_SMOKE_FREQUENCY_HZ:
      if (std::isfinite(event.value)) {
        smoke_frequency_hz_ = std::clamp(event.value, 0.0f, static_cast<float>(sample_rate_ * 0.45));
      }
      break;
    case KESSHO_PARAM_SMOKE_AMPLITUDE:
      smoke_amplitude_.setRamp(std::clamp(event.value, 0.0f, 1.0f), event.ramp_frames);
      break;
    case KESSHO_PARAM_BPM:
      bpm_ = std::clamp(event.value, 1.0f, 400.0f);
      break;
    case KESSHO_PARAM_BEATS_PER_BAR:
      setTransportSignature(static_cast<uint32_t>(std::lround(std::clamp(event.value, 1.0f, 64.0f))), bars_per_phrase_);
      break;
    case KESSHO_PARAM_BARS_PER_PHRASE:
      setTransportSignature(beats_per_bar_, static_cast<uint32_t>(std::lround(std::clamp(event.value, 1.0f, 256.0f))));
      break;
    case KESSHO_PARAM_RNG_SEED:
      setSeed(static_cast<uint32_t>(std::clamp(event.value, 1.0f, 16777215.0f)));
      break;
    default:
      break;
  }
}

void Engine::applyTransportEvent(const KesshoTransportEvent& event) {
  switch (event.command) {
    case KESSHO_TRANSPORT_STOP:
      transport_.stop();
      break;
    case KESSHO_TRANSPORT_START:
    case KESSHO_TRANSPORT_CONTINUE:
      transport_.start();
      break;
    case KESSHO_TRANSPORT_RESET:
      reset();
      transport_.start();
      break;
    default:
      break;
  }
}

} // namespace kessho::core

int kessho_push_param_event(KesshoEngine* engine, const KesshoParamEvent* event) {
  if (engine == nullptr || event == nullptr) {
    return 0;
  }
  return engine->impl.pushParamEvent(*event) ? 1 : 0;
}

int kessho_push_midi_event(KesshoEngine* engine, const KesshoMidiEvent* event) {
  if (engine == nullptr || event == nullptr) {
    return 0;
  }
  return engine->impl.pushMidiEvent(*event) ? 1 : 0;
}

int kessho_push_transport_event(KesshoEngine* engine, const KesshoTransportEvent* event) {
  if (engine == nullptr || event == nullptr) {
    return 0;
  }
  return engine->impl.pushTransportEvent(*event) ? 1 : 0;
}

int kessho_get_event_queue_depth(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.eventQueueDepth() : 0;
}

uint32_t kessho_get_midi_events_processed(KesshoEngine* engine) {
  return engine != nullptr ? engine->impl.midiEventsProcessed() : 0;
}
