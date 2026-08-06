  float sourceTransientAuditionGainForFrame(SourceState& source, uint64_t absolute_frame);
  float sourceOutputGainForFrame(SourceState& source, uint64_t absolute_frame);
  void retainSourceTransientAudition(uint32_t source_id);
  void releaseSourceTransientAudition(uint32_t source_id);
  void extendSourceTransientAudition(uint32_t source_id, float hold_seconds);
