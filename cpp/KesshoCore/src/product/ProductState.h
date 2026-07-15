#pragma once
#include "ProductBuffers.h"
#include "ProductForwardDecls.h"
#include "ProductGraphState.h"
#include "ProductFxState.h"
#include "ProductMidiRuntimeState.h"
#include "ProductModulationState.h"
#include "ProductPresetBridge.h"
#include "ProductSequencerState.h"
#include "ProductTransportState.h"
#include "ProductVoiceState.h"
#include "KesshoCore/KesshoProductGeneratedSequencerCapture.h"
#include <array>
#include <memory>
#include "../modules/KesshoModule.h"
#include "kessho_drum.h"
#include "kessho_pad.h"

using namespace kessho::product::internal;
struct KesshoProductEngine : ProductGraphState {
  explicit KesshoProductEngine(double in_sample_rate, uint32_t in_max_block_size, uint32_t in_flags);

  double sample_rate = 48000.0;
  uint32_t max_block_size = 128;
  uint32_t flags = 0;
  ProductTransport transport{};
  HarmonyState harmony{};
  SourceState sources[kSourceCount]{};
  LaneState synth_lanes[kMaxLaneCount]{};
  LaneState drum_lanes[kMaxLaneCount]{};
  uint32_t synth_lane_count = 4;
  uint32_t drum_lane_count = 8;
  AssetSlot assets[kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS]{};
  Voice voices[kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES]{};
  uint16_t active_voice_indices[kessho::product::generated::KESSHO_PRODUCT_MAX_VOICES]{};
  uint32_t active_voice_count = 0u;
  uint32_t active_source_mask = 0u;
  bool active_voice_list_dirty = true;
  ModulationRange modulation_ranges[kMaxModulationRanges]{};
  uint32_t active_modulation_range_count = 0u;
  uint32_t source_modulation_param_masks[kSourceCount]{};
  uint32_t drum_source_modulation_param_masks[DRUM_NUM_VOICE_TYPES]{};
  uint32_t drum_runtime_modulation_masks[DRUM_NUM_VOICE_TYPES][4]{};
  uint16_t source_modulation_route_indices[kSourceCount][kSourceModulationParamSlotCount]{};
  uint16_t drum_source_modulation_route_indices[DRUM_NUM_VOICE_TYPES][kSourceModulationParamSlotCount]{};
  uint16_t drum_runtime_modulation_route_indices[DRUM_NUM_VOICE_TYPES][kProductDrumRuntimeParamCount]{};
  ProductFxSampleHoldOwner fx_sample_hold_owners[kProductSampleHoldTriggerReverb + 1]{};
  QueuedProductEvent control_events[kessho::product::generated::KESSHO_PRODUCT_MAX_CONTROL_EVENTS]{};
  uint32_t control_event_count = 0;
  uint32_t next_control_sequence = 1;
  // One coalesced clock-division, tempo-multiplier, and swing edit per lane.
  static constexpr uint32_t kMaxPendingPhraseTimingEvents = kMaxLaneCount * 2u * 3u;
  KesshoProductEvent pending_phrase_timing_events[kMaxPendingPhraseTimingEvents]{};
  uint32_t pending_phrase_timing_event_count = 0u;
  uint64_t pending_phrase_timing_apply_frame = 0u;
  KesshoProductGeneratedSequencerCaptureConfig generated_sequencer_capture_config{};
  kessho::product::GeneratedSequencerCaptureRing<2048> generated_sequencer_capture_ring{};
  uint64_t generated_sequencer_capture_event_counter = 1u;
  bool snapshot_loaded_once = false;
  SequencerBuffer sequencer_events{};
  KesshoProductTelemetry telemetry{};
  uint64_t debug_voice_spawn_sequence = 0u;
  float stem_l[kStemCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float stem_r[kStemCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float silent_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float silent_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_tap_l[kModuleTapCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float module_tap_r[kModuleTapCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float reverb_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float reverb_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_a_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_a_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_b_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_b_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_a_cross_carry_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float delay_a_cross_carry_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float granular_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float granular_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float degrade_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float degrade_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float dynamics_eq1_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float dynamics_eq1_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float dynamics_eq2_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float dynamics_eq2_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float dynamics_sidechain_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float dynamics_sidechain_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float diffuse_bus_l[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float diffuse_bus_r[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};

  float reverb_pre_comp_gain = 1.0f;
  float reverb_wash_boost = 0.0f;
  float reverb_bloom_boost = 0.0f;
  float reverb_prev_chord_tension = 0.0f;
  uint32_t reverb_last_chord_degree = 0u;
  uint64_t reverb_last_phrase_index = 0u;
  bool reverb_harmony_runtime_initialized = false;
  bool reverb_harmony_boost_active_last_block = false;
  uint64_t granular_last_phrase_index = 0u;
  bool granular_phrase_runtime_initialized = false;
  ProductBiquadLowpassState granular_output_lpf{};
  ProductBiquadLowpassState granular_reverb_lpf{};
  float granular_reverb_comp_gain = 1.0f;
  float granular_reverb_comp_attack_coeff = 0.0f;
  float granular_reverb_comp_release_coeff = 0.0f;
  double granular_reverb_comp_coeff_sample_rate = 0.0;
  float granular_mix_gain = 0.0f;
  float granular_reverb_send_gain = 0.0f;
  float granular_delay_a_send_gain = 0.0f;
  float granular_delay_b_send_gain = 0.0f;
  float granular_degrade_send_gain = 0.0f;
  float granular_control_smooth_coeff = 0.999f;
  double granular_control_smooth_coeff_sample_rate = 0.0;
  uint64_t granular_return_gain_frame = UINT64_MAX;
  ProductBiquadFilterState diffuse_highpass{};
  ProductBiquadFilterState diffuse_lowpass{};
  ProductTerminalEqState dynamics_eq1_state{};
  ProductTerminalEqState dynamics_eq2_state{};
  SidechainEnvelope sidechain_bus_envelope{};
  float sidechain_bus_gains[kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  float diffuse_delay_l[kDiffuseDelayMaxFrames]{};
  float diffuse_delay_r[kDiffuseDelayMaxFrames]{};
  uint32_t diffuse_delay_index = 0u;
  bool diffuse_bus_active_this_block = false;
  bool diffuse_runtime_active = false;
  uint32_t diffuse_idle_frames_remaining = 0u;
  uint32_t last_stem_frames = 0;
  float master_gain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_GAIN;
  float master_limiter_ceiling_db = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB;
  float master_limiter_ceiling_gain = dbToGain(kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB);
  float master_true_peak_prev_l = 0.0f;
  float master_true_peak_prev_r = 0.0f;
  double master_integrated_loudness_energy = 0.0;
  uint64_t master_integrated_loudness_frames = 0;
  uint32_t master_telemetry_block_counter = 0u;
  bool drum_module_trigger_pending = false;
  FxState fx{};
  RoutingState routing{};
  uint32_t rng_seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t rng_state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t sequencer_evolve_rng_stream_seed = 0u;
  uint32_t sequencer_evolve_rng_stream_state = 0u;
  bool sequencer_evolve_rng_stream_initialized = false;
  uint32_t sequencer_ui_state_revision = 1u;
  uint32_t sequencer_ui_last_changed_target_id = 0u;
  uint32_t sequencer_ui_last_changed_lane_index = 0xffffffffu;
  uint32_t sequencer_ui_last_change_kind = 0u;
  float evolution_amount = 0.0f;
  uint32_t evolution_state = 0u;
  bool journey_running = false;
  float journey_phase = 0.0f;
  float journey_rate_bars = 8.0f;
  bool modules_ready = false;
  std::unique_ptr<kessho::core::IKesshoModule> pad_module{};
  std::unique_ptr<kessho::core::IKesshoModule> lead_modules[2]{};
  std::unique_ptr<kessho::core::IKesshoModule> drum_module{};
  std::unique_ptr<kessho::core::IKesshoModule> delay_a_module{};
  std::unique_ptr<kessho::core::IKesshoModule> delay_b_module{};
  std::unique_ptr<kessho::core::IKesshoModule> reverb_module{};
  std::unique_ptr<kessho::core::IKesshoModule> granular_module{};
  std::unique_ptr<kessho::core::IKesshoModule> spectral_freeze_module{};
  std::unique_ptr<kessho::core::IKesshoModule> dynamics_drift_module{};
  std::unique_ptr<kessho::core::IKesshoModule> dynamics_degrade_send_module{};
  std::unique_ptr<kessho::core::IKesshoModule> soundscapes_module{};
  std::array<float, kSoundscapeModuleParamCount> soundscapes_module_param_cache{};
  bool soundscapes_module_params_configured = false;
  SoundscapeTextureRuntime soundscape_texture_runtimes[kSoundscapeTextureSlotCount]{};
  float soundscape_texture_delay[kSoundscapeTextureSlotCount][kSoundscapeTextureHaasDelayMaxFrames]{};
  uint32_t soundscape_texture_delay_index[kSoundscapeTextureSlotCount]{};
  uint64_t product_render_frame = 0u;
  uint32_t pad_voice_cursors[2]{};
  uint32_t pad_voice_release_frames[PAD_NUM_PADS][PAD_NUM_VOICES]{};
  MidiNoteRuntimeSlot midi_note_slots[kMaxProductMidiNoteSlots]{};
  MidiControllerRuntimeState midi_controller_state[kSourceCount][kProductMidiChannelCount]{};
  bool midi_sustain_down[kSourceCount][kProductMidiChannelCount]{};
  uint32_t next_midi_note_slot = 0u;
  PadPostChainState pad_post_chains[PAD_NUM_PADS]{};
  PadPostChainState pad_send_post_chains[PAD_NUM_PADS]{};
  LeadPostChainState lead_post_chains[2]{};

  bool prepareProductModules();
  float dynamicsModRoute(const float sources[kDynamicsModSourceCount], uint32_t target) const;
  void configureDynamicsDriftModule();
  void configureFxModules();
  void retimeTempoSyncedFx(float previous_bpm);
  void configureReverbModule();
  void resetReverbHarmonyCoupling();
  void advanceReverbHarmonyCoupling(uint32_t frames);
  void resetGranularPhraseRuntime();
  void advanceGranularPhraseReseed();
  void updateGranularControlSmoothCoeff();
  void updateGranularReverbCompressorCoeffs();
  bool sourceRuntimeActive(uint32_t source_id) const;
  void snapGranularReturnGainsToTargets();
  void primeGranularControlsForSourceStart(uint32_t source_id);
  float granularSendGainForFrame(uint32_t source_id, float target, uint64_t absolute_frame);
  void advanceGranularReturnGains(uint64_t absolute_frame);
  void setMasterLimiterCeilingDb(float value);
  void resetMasterTelemetryState();
  void resetSidechainRuntime();
  float sidechainTargetAmount(uint32_t target) const;
  float sidechainBusAmount() const;
  uint32_t sidechainTargetForSource(uint32_t source_id) const;
  float sidechainGain(uint32_t target, uint32_t frame) const;
  float sidechainBusGain(uint32_t frame) const;
  void triggerSidechainDuck(uint32_t drum_voice, float velocity);
  float advanceSidechainEnvelope(SidechainEnvelope& envelope);
  void renderSidechainGains(uint32_t start, uint32_t frames);
  uint32_t normalizedDynamicsBus(float value) const;
  uint32_t dynamicsBusForSource(uint32_t source_id) const;
  uint32_t dynamicsBusForSoundscapeLayer(uint32_t layer) const;
  void routeTerminalSample(
      uint32_t bus,
      float* out_l,
      float* out_r,
      uint32_t frame,
      float left,
      float right);
  void renderDynamicsBuses(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void loadDefaults();
  void reset();
  void resetSonicParityFxRuntime();
  void resetDiffuseRuntime();
  int32_t loadSnapshot(const KesshoProductSnapshotV2& snapshot);
  void loadLaneSnapshots(
      const KesshoProductSequencerSnapshot& snapshot,
      LaneState* lanes,
      uint32_t fallback_source,
      bool preserve_running_runtime = false);
  int32_t enqueueEvent(const KesshoProductEvent& event);
  int32_t validateEvent(const KesshoProductEvent& event) const;
  void sortControlEvents();
  float manualNoteHoldSeconds(uint32_t source_id, float requested_seconds) const;
  void applyControlEvent(const KesshoProductEvent& event);
  void applyPendingTransportTransition();
  void applyPendingSequencerAudibilityTransitions();
  uint64_t nextPendingSequencerAudibilityFrame() const;
  bool isSequencerLaneTimingEvent(const KesshoProductEvent& event) const;
  void stageNextPhraseTimingEvent(const KesshoProductEvent& event);
  uint32_t resolveMidiTargetSource(const KesshoProductEvent& event, uint32_t status) const;
  void applyMidiEvent(const KesshoProductEvent& event);
  void clearStepOverride(LaneState& lane, uint32_t step);
  void clearPendingRatchets(LaneState& lane);
  void clearPendingArpRatchets(LaneState& lane);
  void resetSequencerLaneRuntime(LaneState& lane, bool wait_for_join_boundary = true);
  bool stepMaskHas(uint32_t low, uint32_t high, uint32_t step) const;
  void setStepMask(uint32_t& low, uint32_t& high, uint32_t step);
  void clearStepMask(uint32_t& low, uint32_t& high, uint32_t step);
  float stepFloatValue(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const float values[64],
      float fallback) const;
  float stepFloatRangeValue(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const float values[64],
      uint32_t range_low,
      uint32_t range_high,
      const float range_maxes[64],
      float fallback,
      uint32_t sample_seed) const;
  uint32_t stepU32Value(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const uint32_t values[64],
      uint32_t fallback) const;
  void setStepOverride(LaneState& lane, uint32_t step, bool enabled);
  void clearLaneStepOverrides(LaneState& lane);
  uint32_t stepFieldId(uint32_t field) const;
  bool validStepFieldId(uint32_t field_id) const;
  void applyStepFieldConfig(LaneState& lane, const KesshoProductEvent& event);
  uint32_t subLaneStepForField(
      const LaneState& lane,
      uint32_t field,
      uint32_t trigger_step,
      int64_t absolute_step,
      uint64_t hit_count_phase) const;
  void clearStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step);
  void setStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step, float value, float value2, float value3 = 0.0f, float value4 = 0.0f, uint32_t flags = 0u);
  void applySequencerStepEvent(const KesshoProductEvent& event);
  void applySynthArpConfigEvent(const KesshoProductEvent& event);
  void applySynthArpStepEvent(const KesshoProductEvent& event);
  void applyCommitSynthArpPatternEvent(const KesshoProductEvent& event);
  bool isSequencerLaneParam(uint32_t param_id) const;
  void applySequencerLaneParamEvent(const KesshoProductEvent& event);
  void applyAnchorWalkerPerformanceEvent(const KesshoProductEvent& event);
  LaneState* sequencerLanesForEvent(const KesshoProductEvent& event, uint32_t& lane_count);
  void applyResetSequencerLaneHomeEvent(const KesshoProductEvent& event);
  bool dicePatternHit(uint32_t step, uint32_t steps, uint32_t fills, uint32_t rotation) const;
  bool dicePatternMatchesBase(const LaneState& lane, uint32_t rotation, uint32_t fills) const;
  void captureSequencerEvolveHome(LaneState& lane);
  void clearSequencerEvolveHome(LaneState& lane);
  void applyParityEvolveSequencerLaneEvent(const KesshoProductEvent& event);
  void applyDiceSequencerLaneEvent(const KesshoProductEvent& event);
  void applyJourneyStateEvent(const KesshoProductEvent& event);
  bool applyGranularVoiceParamEvent(const KesshoProductEvent& event);
  bool applyGranularParamEvent(const KesshoProductEvent& event);
  bool applyDynamicsModParamEvent(const KesshoProductEvent& event);
  bool applyDynamicsEqParamEvent(const KesshoProductEvent& event);
  bool applyRoutingParamEvent(const KesshoProductEvent& event);
  void applyParam(const KesshoProductEvent& event);
  bool isSourceParam(uint32_t param_id) const;
  bool isSourceTarget(uint32_t target_id) const;
  bool isDrumRangeTarget(uint32_t target_id) const;
  bool isSoundscapeAssetLevelRangeTarget(uint32_t target_id) const;
  uint32_t soundscapeAssetIdForLevelRangeTarget(uint32_t target_id) const;
  uint32_t sourceEnableFadeFrames(uint32_t source_id) const;
  bool sourceRenderActive(const SourceState& source) const;
  void setSourceEnabled(SourceState& source, bool enabled, bool immediate);
  float sourceEnableGainForFrame(SourceState& source, uint64_t absolute_frame);
  ModulationRange* findModulationRange(uint32_t target_id, uint32_t param_id);
  const ModulationRange* findModulationRange(uint32_t target_id, uint32_t param_id) const;
  ModulationRange* findOrAllocateModulationRange(uint32_t target_id, uint32_t param_id);
  uint32_t sourceModulationParamSlot(uint32_t param_id) const;
  uint32_t sourceModulationParamMaskBit(uint32_t param_id) const;
  void resetModulationRouteCache();
  void rebuildModulationRouteCache();
  bool drumRuntimeModulationActive(uint32_t drum_voice) const;
  bool drumRuntimeParamModulated(uint32_t drum_voice, uint32_t param_index) const;
  void applyModulationRangeEvent(const KesshoProductEvent& event);
  void applySourcePresetEvent(const KesshoProductEvent& event);
  void clearEndpointStructuredOverridesForPresetChange(SourceState& source, uint32_t source_id, uint32_t endpoint_index);
  bool activeSequencerMorphForPresetSource(uint32_t source_id, uint32_t drum_voice, float& morph) const;
  bool activeSequencerDistanceForPresetSource(uint32_t source_id, uint32_t drum_voice, float& distance) const;
  bool activeSequencerExpressionForPresetSource(uint32_t source_id, uint32_t drum_voice, float& expression) const;
  bool activeSequencerSourceFieldForPresetSource(uint32_t source_id, uint32_t drum_voice, uint32_t step_field, float& value) const;
  void applySourceOverrideEvent(const KesshoProductEvent& event);
  bool applyRuntimeSourceOverrideParam(uint32_t source_id, uint32_t param_index, float value);
  bool sourceOverrideStorage(SourceState& source, uint32_t source_id, uint32_t*& count, uint32_t*& indices, float*& values) const;
  bool activeSequencerEndpointMorphAnchor(uint32_t source_id, SourceState& source, float& morph_anchor) const;
  bool applyStructuredSourceOverridesToModule(uint32_t source_id);
  bool applyStructuredSourceOverridesToModuleAtMorph(uint32_t source_id, float morph);
  bool applyStructuredSourceOverridesToModuleAtMorphAndDistance(uint32_t source_id, float morph, float distance);
  bool applyStructuredSourceOverridesToModuleForCurrentMorph(uint32_t source_id);
  void compileSourcePresetRuntime(SourceState& source);
  void compileSourcePresetEndpoints(SourceState& source);
  void applySourcePresetMacros(const SourceState& source, float& morph, float& distance, float& expression) const;
  kessho::core::KesshoSourcePresetPatch drumVoiceMorphPatch(const SourceState& source) const;
  void applyDrumVoiceMorphToPatch(
      kessho::core::KesshoSourcePresetPatch& patch,
      const SourceState& source,
      uint32_t voice_index,
      float morph) const;
  bool sourceMacrosDifferFromDefaults(float morph, float distance, float expression) const;
  float modulationRangeSample(const ModulationRange& range, float fallback, uint32_t sample_seed) const;
  float resolveModulatedValue(uint32_t target_id, uint32_t param_id, float fallback, uint32_t sample_seed);
  void applyModulationRangeValue(const ModulationRange& range);
  void applyRuntimeWalkValue(const ModulationRange& range);
  uint32_t sampleHoldTriggerBusForParam(uint32_t param_id) const;
  uint32_t sampleHoldTriggerBusForEvent(const KesshoProductEvent& event) const;
  void resetFxSampleHoldOwners();
  float fxSampleHoldSourceStrength(uint32_t bus, uint32_t source_id, float drum_delay_send) const;
  bool shouldTriggerFxSampleHoldBus(uint32_t bus, uint32_t source_id, float strength) const;
  void triggerFxSampleHoldRanges(uint32_t source_id, float delay_a_strength, float delay_b_strength, float granular_strength, float reverb_strength, uint32_t sample_seed);
  void advanceModulationRanges(uint32_t frames);
  void applySourceParam(const KesshoProductEvent& event);
  void compactControlEvents(uint32_t frames, uint32_t first_unprocessed);
  bool trigConditionPass(uint32_t trig_condition, uint64_t absolute_sample) const;
  bool stepTrigConditionPass(const LaneState& lane, uint32_t step, int64_t absolute_step) const;
  bool manualMaskHit(const LaneState& lane, uint32_t step) const;
  float resolveHarmonyMidi(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample) const;
  void updateHarmonyTelemetry(uint64_t absolute_sample);
  void markSequencerUiStateChanged(uint32_t target_id, uint32_t lane_index, uint32_t change_kind);
  void copySequencerLaneUiState(const LaneState& lane, KesshoProductSequencerLaneUiState& out) const;
  void copySequencerUiState(KesshoProductSequencerUiState& out) const;
  KesshoProductDebugSourceState debugSourceState(uint32_t source_id) const;
  void recordDebugVoiceSpawn(uint32_t source_id, uint32_t voice_id, uint32_t sample_seed);
  float evolutionDepth() const;
  float evolvedLaneValue(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample,
      uint32_t component,
      float base,
      float depth,
      float min_value,
      float max_value) const;
  void generateLaneEvents(
      LaneState* lanes,
      uint32_t lane_count,
      uint32_t frames,
      SequencerBuffer& out);
  void generateSequencerEvents(uint32_t frames);
  uint32_t findAssetSlot(uint32_t asset_id) const;
  bool pianoAssetRootMidi(uint32_t asset_id, float& out_midi, bool* out_short_variant = nullptr) const;
  uint32_t findPianoAssetSlot(float midi_note, float velocity, float& out_root_midi) const;
  uint32_t allocateVoice();
  void markActiveVoiceListDirty();
  void rebuildActiveVoiceList();
  bool hasActiveSourceVoice(uint32_t source_id) const;
  bool soundscapeWantsAsset(const SourceState& source, uint32_t asset_id) const;
  float soundscapeAssetRefLevel(const SourceState& source, uint32_t asset_id) const;
  void applySoundscapeAssetLevelValue(uint32_t asset_id, float value);
  bool soundscapeModuleParamsAvailable(const SourceState& source) const;
  bool soundscapeModuleShouldRun(const SourceState& source) const;
  bool soundscapeAssetUsesModule(const SourceState& source, uint32_t asset_id) const;
  bool isSoundscapeTextureAsset(uint32_t asset_id) const;
  bool shouldUseSoundscapeTextureSlices(const SourceState& source, uint32_t asset_id) const;
  bool hasActiveSoundscapeVoice(uint32_t asset_id) const;
  bool hasActiveLegacySoundscapeVoice(uint32_t asset_id) const;
  void releaseUnwantedSoundscapeVoices(const SourceState& source);
  void releaseLegacySoundscapeVoices(uint32_t asset_id);
  void releaseSoundscapeTextureVoice(Voice& voice, float release_asset_level);
  void stopSoundscapeTransportRuntime();
  void reportMissingSourceAsset(SourceState& source);
  void reportMissingSourceAsset(SourceState& source, uint32_t asset_id);
  bool triggerModuleSource(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float morph,
      float distance,
      float expression,
      const kessho::core::KesshoSourcePresetPatch* preset_patch,
      float drum_delay_send,
      bool scale_velocity_by_expression,
      float drum_pitch_offset,
      float drum_ratchet_decay_cap,
      float drum_ratchet_attack_cap,
      float synth_ratchet_factor,
      uint32_t sample_seed,
      uint32_t pad_voice_index = kPadVoiceNoPreference,
      uint32_t* out_module_voice_index = nullptr);
  uint32_t triggerVoice(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float event_morph = -1.0f,
      float event_distance = -1.0f,
      float event_expression = -1.0f,
      uint32_t sample_seed = 0u,
      uint32_t asset_id_override = 0u,
      bool scale_velocity_by_expression = true,
      float drum_pitch_offset = 0.0f,
      float drum_ratchet_decay_cap = 1.0e10f,
      float drum_ratchet_attack_cap = 1.0e10f,
      uint32_t pad_voice_index = kPadVoiceNoPreference,
      float synth_ratchet_factor = 1.0f);
  bool applySourceExactRuntimeRanges(uint32_t source_id, uint32_t param_id_base, float* params, uint32_t param_count, uint32_t sample_seed);
  void configurePianoSampleVoiceEnvelope(Voice& voice, const SourceState& source, float velocity, float distance, uint32_t resolved_seed, uint32_t asset_slot);
  void ensureSoundscapeVoice();
  void releaseSourceVoices(uint32_t source_id);
  void killSourceVoices(uint32_t source_id);
  void resetMidiRuntimeState();
  void clearMidiRuntimeForSource(uint32_t source_id);
  void clearMidiRuntimeForSampleVoice(uint32_t voice_index);
  void trackMidiNoteOn(
      uint32_t source_id,
      uint32_t channel,
      uint32_t note,
      uint32_t pad_voice_index,
      uint32_t lead_voice_index,
      uint32_t sample_voice_index);
  void applyMidiNoteOff(uint32_t source_id, uint32_t channel, uint32_t note);
  void applyMidiSustain(uint32_t source_id, uint32_t channel, bool sustain_down);
  void applyMidiControlChange(uint32_t source_id, uint32_t channel, uint32_t controller, uint32_t value);
  void applyMidiPitchBend(uint32_t source_id, uint32_t channel, uint32_t lsb, uint32_t msb);
  void applyMidiPitchBendToActiveNotes(uint32_t source_id, uint32_t channel);
  void applyMidiChannelPressure(uint32_t source_id, uint32_t channel, uint32_t pressure);
  void applyMidiPolyPressure(uint32_t source_id, uint32_t channel, uint32_t note, uint32_t pressure);
  float midiPitchBendSemitones(uint32_t source_id, uint32_t channel) const;
  float midiControllerVelocityScale(uint32_t source_id, uint32_t channel, uint32_t note) const;
  void releaseMidiSlot(MidiNoteRuntimeSlot& slot);
  void schedulePadVoiceRelease(uint32_t pad_index, uint32_t voice_index, float hold_seconds);
  void clearPadVoiceReleases(uint32_t source_id);
  void advancePadVoiceReleases(uint32_t frames);
  void resetPadPostChains();
  float resolveSourcePostLpfHz(uint32_t source_id) const;
  float resolveSourceStereoWidth(uint32_t source_id) const;
  void updatePadPostChainCoefficients(PadPostChainState& chain);
  float processPadPostLpfSample(const PadPostChainState& chain, BiquadState& state, float input) const;
  void processPadPostChain(PadPostChainState& chain, uint32_t source_id, float* left, float* right, uint32_t frames);
  void resetLeadPostChains();
  void updateLeadPostChainCoefficients(LeadPostChainState& chain);
  float processLeadPostLpfSample(const LeadPostChainState& chain, BiquadState& state, float input) const;
  void processLeadPostChain(uint32_t lead_index, uint32_t source_id, float* left, float* right, uint32_t frames);
  void updateVoicePostChainCoefficients(Voice& voice, float cutoff_hz);
  float processVoicePostLpfSample(const Voice& voice, BiquadState& state, float input) const;
  void processVoicePostChain(Voice& voice, float& left, float& right);
  void updateProductBiquadCoefficients(ProductBiquadFilterState& filter, float cutoff_hz, uint32_t type);
  float processProductBiquadSample(const ProductBiquadFilterState& filter, BiquadState& state, float input) const;
  void mixPadSourceBuffer(
      uint32_t source_id,
      const float* dry_l,
      const float* dry_r,
      const float* send_l,
      const float* send_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);
  void recordSourceGraphTaps(
      uint32_t source_id,
      uint32_t frame,
      const SourceState& source,
      float dry_left,
      float dry_right,
      float ducked_left,
      float ducked_right,
      float send_left,
      float send_right,
      float effective_granular_send);
  void triggerSequencerEvent(const KesshoSequencerEvent& event);
  uint32_t sampleFadeFrames(double seconds, uint32_t limit_frames) const;
  uint32_t loopCrossfadeFrames(const AssetSlot& asset) const;
  uint32_t findSampleAssetSlot(
      const SourceState& source,
      float midi_note,
      float velocity,
      uint32_t variant_counter,
      float& out_root_midi,
      uint32_t& out_asset_id) const;
  double soundscapeRandomStartFrame(const AssetSlot& asset, uint32_t sample_seed) const;
  SoundscapeLayerPolicy soundscapeLayerPolicy(uint32_t asset_id) const;
  float soundscapeLayerLevel(const AssetSlot& asset, uint32_t sample_seed) const;
  float soundscapeLayerPan(const AssetSlot& asset, uint32_t sample_seed, float distance) const;
  float soundscapeLayerPlaybackRate(const AssetSlot& asset, uint32_t sample_seed) const;
  uint32_t soundscapeLayerIndexForAsset(uint32_t asset_id) const;
  uint32_t soundscapeTextureSlotForAsset(uint32_t asset_id) const;
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
  void releaseSoundscapeTextureVoices(uint32_t asset_id);
  void ensureSoundscapeTextureVoice(SourceState& source, uint32_t asset_id, uint32_t asset_slot);
  void configureSoundscapeTextureSpatialRuntime(uint32_t asset_id, SoundscapeTextureRuntime& runtime) const;
  void processSoundscapeTextureSpatialForSlot(uint32_t slot, float& left, float& right);
  float soundscapeLayerRouteSend(const SourceState& source, uint32_t layer, uint32_t route, float fallback) const;
  float sampleVoiceEnvelope(const Voice& voice) const;
  float assetSample(const AssetSlot& asset, uint32_t channel, uint32_t frame) const;
  float assetSampleInterpolated(const AssetSlot& asset, uint32_t channel, double frame_position, bool looping) const;
  void renderVoiceSample(Voice& voice, float& out_l, float& out_r);
  void mixSourceBuffer(
      uint32_t source_id,
      const float* dry_in_l,
      const float* dry_in_r,
      const float* send_in_l,
      const float* send_in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);
  void renderPadModule(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void renderSingleModuleSource(
      kessho::core::IKesshoModule* module,
      uint32_t source_id,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);
  void renderDrumModule(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void configureSoundscapesModuleFromSource();
  void renderSoundscapesModule(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  uint32_t computeActiveModuleMask() const;
  void renderProductModules(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void mixFxBuffer(
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames,
      float gain,
      uint32_t sidechain_target);
  float reverbPreCompressorGainDbForLevel(float level_db) const;
  float reverbPreconditionerSoftLimit(float value) const;
  void processReverbPreconditioner(uint32_t start, uint32_t frames, float input_peak);
  void renderDelayModule(
      kessho::core::IKesshoModule* module,
      float* input_l,
      float* input_r,
      float* cross_l,
      float* cross_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames);
  void configureGranularLowpass(ProductBiquadLowpassState& state, float cutoff_hz) const;
  float processGranularLowpass(const ProductBiquadLowpassState& filter, BiquadState& state, float input) const;
  float granularCompressorGainDbForLevel(float level_db) const;
  void renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void renderDiffuseBus(float* out_l, float* out_r, uint32_t frames);
  void renderSampleVoices(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void renderSegment(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  bool processSpectralFreezeBranch(float* input_l, float* input_r, float* output_l, float* output_r, uint32_t start, uint32_t frames);
  void renderDegradeSend(float* out_l, float* out_r, uint32_t start, uint32_t frames);
  void renderDynamics(float* out_l, float* out_r, uint32_t frames);
  void applyMaster(float* out_l, float* out_r, uint32_t frames);
  void clearAudioOutput(float* out_l, float* out_r, uint32_t frames);
  void clearStemOutput(uint32_t frames);
  void clearBusOutput(uint32_t frames);
  void clearGraphTapOutput(uint32_t frames);
  void clearOutput(float* out_l, float* out_r, uint32_t frames);
  void advanceJourney(uint32_t frames);
  void render(float* out_l, float* out_r, uint32_t frames);
  void updateTelemetry(uint32_t frames);
};
