  void resetInteractionSignals();
  void setInteractionDemand(uint32_t demand_mask, uint32_t source_mask);
  void updateInteractionSignals(uint32_t frames);
  void resetInteractionEvents();
  void emitInteractionEvent(
      uint32_t type,
      uint32_t parent,
      uint32_t child,
      uint32_t origin,
      uint32_t tap,
      uint64_t sample_frame,
      float value,
      float strength);
  void emitVoiceInteractionEvent(
      uint32_t source_id,
      uint32_t origin,
      uint64_t sample_frame,
      float midi_note,
      float strength);
  void emitTransportClockInteractionEvents();
  uint32_t drainInteractionEvents(
      KesshoProductInteractionEvent* out_events,
      uint32_t max_event_count,
      uint32_t* out_overflow_count);
