  double soundscapeRandomStartFrame(const AssetSlot& asset, uint32_t sample_seed) const;
  SoundscapeLayerPolicy soundscapeLayerPolicy(uint32_t asset_id) const;
  float soundscapeLayerLevel(const AssetSlot& asset, uint32_t sample_seed) const;
  float soundscapeLayerPan(const AssetSlot& asset, uint32_t sample_seed, float distance) const;
  float soundscapeLayerPlaybackRate(const AssetSlot& asset, uint32_t sample_seed) const;
  uint32_t soundscapeLayerIndexForAsset(uint32_t asset_id) const;
  uint32_t soundscapeTextureSlotForAsset(uint32_t asset_id) const;
  uint32_t soundscapeTextureAssetId(const SourceState& source, uint32_t slot) const;
  bool soundscapeTextureSlotEnabled(const SourceState& source, uint32_t slot) const;
  bool soundscapeParityFixtureEnabled(const SourceState& source) const;
  bool soundscapeTextureParamsAvailable(const SourceState& source) const;
  float soundscapeTextureParam(
      const SourceState& source,
      uint32_t slot,
      uint32_t param,
      float fallback) const;
  uint32_t soundscapeTextureSeed(const SourceState& source, uint32_t slot, uint32_t fallback) const;
  float soundscapeTextureRandom(uint32_t slot);
  double soundscapeTexturePickOffset(uint32_t slot, double max_offset, double duration);
  double soundscapeTextureStrideSeconds(double output_duration, double fade, float density) const;
  void resetSoundscapeTextureRuntime(uint32_t slot);
  void resetSoundscapeTextureRuntimes();
  void suspendSoundscapeTextureRuntimes();
  void releaseSoundscapeTextureVoices(uint32_t texture_slot);
  void ensureSoundscapeTextureVoice(SourceState& source, uint32_t texture_slot, uint32_t asset_id, uint32_t asset_slot);
  void configureSoundscapeTextureSpatialRuntime(uint32_t asset_id, SoundscapeTextureRuntime& runtime) const;
  void processSoundscapeTextureSpatialForSlot(uint32_t slot, float& left, float& right);
  void processSoundscapeTextureFilter(Voice& voice, const SourceState& source, float& left, float& right);
