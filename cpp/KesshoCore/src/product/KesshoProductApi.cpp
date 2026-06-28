#include "KesshoProductEngineInternal.h"
#include "generated/SampleLibraryRegistry.generated.h"

namespace {

const kessho::product::generated::GeneratedSampleDescriptor* findGeneratedSampleDescriptor(uint32_t asset_id) {
  for (const auto& descriptor : kessho::product::generated::kGeneratedSampleDescriptors) {
    if (descriptor.assetId == asset_id) {
      return &descriptor;
    }
  }
  return nullptr;
}

uint32_t scaledLoopFrame(uint32_t encoded_frame, double asset_sample_rate, uint32_t encoded_sample_rate) {
  if (encoded_sample_rate == 0u || asset_sample_rate <= 0.0) {
    return encoded_frame;
  }
  return static_cast<uint32_t>(std::max(
      0.0,
      std::round(static_cast<double>(encoded_frame) * asset_sample_rate / static_cast<double>(encoded_sample_rate))));
}

} // namespace

extern "C" {

int32_t kessho_product_get_abi_version(void) {
  return KESSHO_PRODUCT_ABI_VERSION;
}

KesshoProductCapabilityReport kessho_product_get_capability_report(void) {
  KesshoProductCapabilityReport report{};
  report.abi_version = KESSHO_PRODUCT_ABI_VERSION;
  report.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  report.supports_full_product_graph = 1;
  report.supports_synth_sequencer = 1;
  report.supports_drum_sequencer = 1;
  report.supports_journey_morph_clock = 1;
  report.supports_harmony_core = 1;
  report.supports_core_asset_rendering = 1;
  report.supports_native_bridge = 0;
  report.supports_recordable_stems = 1;
  report.supports_cpu_telemetry = 1;
  report.legacy_fallback_count = 0;
  report.unsupported_method_count = 0;
  return report;
}

KesshoProductEngine* kessho_product_create(double sample_rate, uint32_t max_block_size, uint32_t flags) {
  if (sample_rate <= 0.0 || max_block_size == 0u ||
      max_block_size > kessho::product::generated::KESSHO_PRODUCT_MAX_BLOCK_SIZE) {
    return nullptr;
  }
  KesshoProductEngine* engine = new (std::nothrow) KesshoProductEngine(sample_rate, max_block_size, flags);
  if (engine == nullptr) {
    return nullptr;
  }
  if (!engine->modules_ready) {
    delete engine;
    return nullptr;
  }
  return engine;
}

void kessho_product_destroy(KesshoProductEngine* engine) {
  delete engine;
}

void kessho_product_reset(KesshoProductEngine* engine) {
  if (engine == nullptr) {
    return;
  }
  engine->reset();
}

void kessho_product_reset_parity_fx(KesshoProductEngine* engine) {
  if (engine == nullptr) {
    return;
  }
  engine->resetSonicParityFxRuntime();
}

int32_t kessho_product_load_snapshot_v2(
    KesshoProductEngine* engine,
    const void* snapshot_bytes,
    uint32_t snapshot_byte_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (snapshot_bytes == nullptr || snapshot_byte_count < sizeof(KesshoProductSnapshotV2)) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
    return KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT;
  }
  const KesshoProductSnapshotV2* snapshot = static_cast<const KesshoProductSnapshotV2*>(snapshot_bytes);
  return engine->loadSnapshot(*snapshot);
}

int32_t kessho_product_enqueue_event(KesshoProductEngine* engine, const KesshoProductEvent* event) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (event == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  return engine->enqueueEvent(*event);
}

int32_t kessho_product_enqueue_events(
    KesshoProductEngine* engine,
    const KesshoProductEvent* events,
    uint32_t event_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (events == nullptr && event_count > 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  for (uint32_t i = 0; i < event_count; ++i) {
    const int32_t result = engine->enqueueEvent(events[i]);
    if (result != KESSHO_PRODUCT_OK) {
      return result;
    }
  }
  return KESSHO_PRODUCT_OK;
}

void kessho_product_render(KesshoProductEngine* engine, float* out_l, float* out_r, uint32_t frames) {
  if (engine == nullptr || out_l == nullptr || out_r == nullptr) {
    return;
  }
  engine->render(out_l, out_r, frames);
}

int32_t kessho_product_get_stem(
    KesshoProductEngine* engine,
    uint32_t stem_id,
    float* out_l,
    float* out_r,
    uint32_t frames) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_l == nullptr || out_r == nullptr || stem_id >= kStemCount) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  const uint32_t copy_frames = std::min<uint32_t>(frames, engine->last_stem_frames);
  for (uint32_t i = 0; i < copy_frames; ++i) {
    out_l[i] = engine->stem_l[stem_id][i];
    out_r[i] = engine->stem_r[stem_id][i];
  }
  for (uint32_t i = copy_frames; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_get_graph_tap(KesshoProductEngine* engine, uint32_t tap_id, float* out_l, float* out_r, uint32_t frames) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_l == nullptr || out_r == nullptr || tap_id >= KESSHO_PRODUCT_GRAPH_TAP_COUNT) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  if (!engine->graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      out_l[i] = 0.0f;
      out_r[i] = 0.0f;
    }
    return KESSHO_PRODUCT_OK;
  }
  const float* tap_l = nullptr;
  const float* tap_r = nullptr;
#define KESSHO_PRODUCT_GRAPH_TAP_CASE(id, left, right) case id: tap_l = engine->left; tap_r = engine->right; break
#define KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(id, target) case id: tap_l = engine->graph_sidechain_input_l[target]; tap_r = engine->graph_sidechain_input_r[target]; break
#define KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(id, target) case id: tap_l = engine->graph_sidechain_output_l[target]; tap_r = engine->graph_sidechain_output_r[target]; break
#define KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(id, target) case id: tap_l = engine->sidechain_gains[target]; tap_r = engine->sidechain_gains[target]; break
  switch (tap_id) {
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_REVERB_INPUT, graph_reverb_input_l, graph_reverb_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_INPUT, graph_delay_a_input_l, graph_delay_a_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_INPUT, graph_delay_b_input_l, graph_delay_b_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_INPUT, graph_granular_input_l, graph_granular_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DYNAMICS_INPUT, graph_dynamics_input_l, graph_dynamics_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DYNAMICS_OUTPUT, graph_dynamics_output_l, graph_dynamics_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_MASTER_PRE_LIMITER, graph_master_pre_limiter_l, graph_master_pre_limiter_r);
    case KESSHO_PRODUCT_GRAPH_TAP_MASTER_POST_LIMITER:
      tap_l = engine->stem_l[KESSHO_PRODUCT_STEM_MASTER]; tap_r = engine->stem_r[KESSHO_PRODUCT_STEM_MASTER]; break;
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_OUTPUT, graph_delay_a_output_l, graph_delay_a_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_REVERB_SEND, graph_delay_a_reverb_send_l, graph_delay_a_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_TO_DELAY_B_SEND, graph_delay_a_to_delay_b_send_l, graph_delay_a_to_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_TO_GRANULAR_SEND, graph_delay_a_to_granular_send_l, graph_delay_a_to_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_OUTPUT, graph_delay_b_output_l, graph_delay_b_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_REVERB_SEND, graph_delay_b_reverb_send_l, graph_delay_b_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_TO_DELAY_A_SEND, graph_delay_b_to_delay_a_send_l, graph_delay_b_to_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_TO_GRANULAR_SEND, graph_delay_b_to_granular_send_l, graph_delay_b_to_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_OUTPUT, graph_granular_output_l, graph_granular_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_REVERB_SEND, graph_granular_reverb_send_l, graph_granular_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_TO_DELAY_A_SEND, graph_granular_to_delay_a_send_l, graph_granular_to_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_TO_DELAY_B_SEND, graph_granular_to_delay_b_send_l, graph_granular_to_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DIFFUSE_INPUT, graph_diffuse_input_l, graph_diffuse_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DIFFUSE_OUTPUT, graph_diffuse_output_l, graph_diffuse_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DIFFUSE_REVERB_SEND, graph_diffuse_reverb_send_l, graph_diffuse_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_REVERB_PRECONDITIONER_OUTPUT, graph_reverb_preconditioner_output_l, graph_reverb_preconditioner_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_REVERB_OUTPUT, graph_reverb_output_l, graph_reverb_output_r);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PAD1_INPUT, kessho::product::internal::kSidechainPad1);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PAD1_OUTPUT, kessho::product::internal::kSidechainPad1);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PAD1_GAIN_TRACE, kessho::product::internal::kSidechainPad1);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SPECTRAL_FREEZE_INPUT, graph_spectral_freeze_input_l, graph_spectral_freeze_input_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SPECTRAL_FREEZE_OUTPUT, graph_spectral_freeze_output_l, graph_spectral_freeze_output_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DRUM_DRY, graph_drum_dry_l, graph_drum_dry_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DRUM_REVERB_SEND, graph_drum_reverb_send_l, graph_drum_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DRUM_DELAY_A_SEND, graph_drum_delay_a_send_l, graph_drum_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DRUM_DELAY_B_SEND, graph_drum_delay_b_send_l, graph_drum_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_DRUM_GRANULAR_SEND, graph_drum_granular_send_l, graph_drum_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD1_DRY, graph_pad1_dry_l, graph_pad1_dry_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD1_REVERB_SEND, graph_pad1_reverb_send_l, graph_pad1_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD1_DELAY_A_SEND, graph_pad1_delay_a_send_l, graph_pad1_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD1_DELAY_B_SEND, graph_pad1_delay_b_send_l, graph_pad1_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD1_GRANULAR_SEND, graph_pad1_granular_send_l, graph_pad1_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD1_DIFFUSE_SEND, graph_pad1_diffuse_send_l, graph_pad1_diffuse_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD2_DRY, graph_pad2_dry_l, graph_pad2_dry_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD2_REVERB_SEND, graph_pad2_reverb_send_l, graph_pad2_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD2_DELAY_A_SEND, graph_pad2_delay_a_send_l, graph_pad2_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD2_DELAY_B_SEND, graph_pad2_delay_b_send_l, graph_pad2_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD2_GRANULAR_SEND, graph_pad2_granular_send_l, graph_pad2_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PAD2_DIFFUSE_SEND, graph_pad2_diffuse_send_l, graph_pad2_diffuse_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DRY, graph_lead1_dry_l, graph_lead1_dry_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD1_REVERB_SEND, graph_lead1_reverb_send_l, graph_lead1_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DELAY_A_SEND, graph_lead1_delay_a_send_l, graph_lead1_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DELAY_B_SEND, graph_lead1_delay_b_send_l, graph_lead1_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD1_GRANULAR_SEND, graph_lead1_granular_send_l, graph_lead1_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DIFFUSE_SEND, graph_lead1_diffuse_send_l, graph_lead1_diffuse_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DRY, graph_lead2_dry_l, graph_lead2_dry_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD2_REVERB_SEND, graph_lead2_reverb_send_l, graph_lead2_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DELAY_A_SEND, graph_lead2_delay_a_send_l, graph_lead2_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DELAY_B_SEND, graph_lead2_delay_b_send_l, graph_lead2_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD2_GRANULAR_SEND, graph_lead2_granular_send_l, graph_lead2_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_LEAD2_DIFFUSE_SEND, graph_lead2_diffuse_send_l, graph_lead2_diffuse_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PIANO_DRY, graph_piano_dry_l, graph_piano_dry_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PIANO_REVERB_SEND, graph_piano_reverb_send_l, graph_piano_reverb_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PIANO_DELAY_A_SEND, graph_piano_delay_a_send_l, graph_piano_delay_a_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PIANO_DELAY_B_SEND, graph_piano_delay_b_send_l, graph_piano_delay_b_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PIANO_GRANULAR_SEND, graph_piano_granular_send_l, graph_piano_granular_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_PIANO_DIFFUSE_SEND, graph_piano_diffuse_send_l, graph_piano_diffuse_send_r);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_OCEAN_DRY, graph_soundscape_layer_dry_l[kessho::product::internal::kSoundscapeLayerOcean], graph_soundscape_layer_dry_r[kessho::product::internal::kSoundscapeLayerOcean]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_DRY, graph_soundscape_layer_dry_l[kessho::product::internal::kSoundscapeLayerWater], graph_soundscape_layer_dry_r[kessho::product::internal::kSoundscapeLayerWater]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_INSECTS_DRY, graph_soundscape_layer_dry_l[kessho::product::internal::kSoundscapeLayerInsects], graph_soundscape_layer_dry_r[kessho::product::internal::kSoundscapeLayerInsects]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_NATURE_DRY, graph_soundscape_layer_dry_l[kessho::product::internal::kSoundscapeLayerNature], graph_soundscape_layer_dry_r[kessho::product::internal::kSoundscapeLayerNature]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_OCEAN_REVERB_SEND, graph_soundscape_layer_reverb_send_l[kessho::product::internal::kSoundscapeLayerOcean], graph_soundscape_layer_reverb_send_r[kessho::product::internal::kSoundscapeLayerOcean]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_OCEAN_DELAY_A_SEND, graph_soundscape_layer_delay_a_send_l[kessho::product::internal::kSoundscapeLayerOcean], graph_soundscape_layer_delay_a_send_r[kessho::product::internal::kSoundscapeLayerOcean]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_OCEAN_DELAY_B_SEND, graph_soundscape_layer_delay_b_send_l[kessho::product::internal::kSoundscapeLayerOcean], graph_soundscape_layer_delay_b_send_r[kessho::product::internal::kSoundscapeLayerOcean]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_OCEAN_GRANULAR_SEND, graph_soundscape_layer_granular_send_l[kessho::product::internal::kSoundscapeLayerOcean], graph_soundscape_layer_granular_send_r[kessho::product::internal::kSoundscapeLayerOcean]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_REVERB_SEND, graph_soundscape_layer_reverb_send_l[kessho::product::internal::kSoundscapeLayerWater], graph_soundscape_layer_reverb_send_r[kessho::product::internal::kSoundscapeLayerWater]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_DELAY_A_SEND, graph_soundscape_layer_delay_a_send_l[kessho::product::internal::kSoundscapeLayerWater], graph_soundscape_layer_delay_a_send_r[kessho::product::internal::kSoundscapeLayerWater]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_DELAY_B_SEND, graph_soundscape_layer_delay_b_send_l[kessho::product::internal::kSoundscapeLayerWater], graph_soundscape_layer_delay_b_send_r[kessho::product::internal::kSoundscapeLayerWater]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_GRANULAR_SEND, graph_soundscape_layer_granular_send_l[kessho::product::internal::kSoundscapeLayerWater], graph_soundscape_layer_granular_send_r[kessho::product::internal::kSoundscapeLayerWater]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_INSECTS_REVERB_SEND, graph_soundscape_layer_reverb_send_l[kessho::product::internal::kSoundscapeLayerInsects], graph_soundscape_layer_reverb_send_r[kessho::product::internal::kSoundscapeLayerInsects]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_INSECTS_DELAY_A_SEND, graph_soundscape_layer_delay_a_send_l[kessho::product::internal::kSoundscapeLayerInsects], graph_soundscape_layer_delay_a_send_r[kessho::product::internal::kSoundscapeLayerInsects]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_INSECTS_DELAY_B_SEND, graph_soundscape_layer_delay_b_send_l[kessho::product::internal::kSoundscapeLayerInsects], graph_soundscape_layer_delay_b_send_r[kessho::product::internal::kSoundscapeLayerInsects]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_INSECTS_GRANULAR_SEND, graph_soundscape_layer_granular_send_l[kessho::product::internal::kSoundscapeLayerInsects], graph_soundscape_layer_granular_send_r[kessho::product::internal::kSoundscapeLayerInsects]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_NATURE_REVERB_SEND, graph_soundscape_layer_reverb_send_l[kessho::product::internal::kSoundscapeLayerNature], graph_soundscape_layer_reverb_send_r[kessho::product::internal::kSoundscapeLayerNature]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_NATURE_DELAY_A_SEND, graph_soundscape_layer_delay_a_send_l[kessho::product::internal::kSoundscapeLayerNature], graph_soundscape_layer_delay_a_send_r[kessho::product::internal::kSoundscapeLayerNature]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_NATURE_DELAY_B_SEND, graph_soundscape_layer_delay_b_send_l[kessho::product::internal::kSoundscapeLayerNature], graph_soundscape_layer_delay_b_send_r[kessho::product::internal::kSoundscapeLayerNature]);
    KESSHO_PRODUCT_GRAPH_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_NATURE_GRANULAR_SEND, graph_soundscape_layer_granular_send_l[kessho::product::internal::kSoundscapeLayerNature], graph_soundscape_layer_granular_send_r[kessho::product::internal::kSoundscapeLayerNature]);
    case KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_STEM:
      tap_l = engine->stem_l[KESSHO_PRODUCT_STEM_SOUNDSCAPE]; tap_r = engine->stem_r[KESSHO_PRODUCT_STEM_SOUNDSCAPE]; break;
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PAD2_INPUT, kessho::product::internal::kSidechainPad2);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PAD2_OUTPUT, kessho::product::internal::kSidechainPad2);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PAD2_GAIN_TRACE, kessho::product::internal::kSidechainPad2);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_LEAD1_INPUT, kessho::product::internal::kSidechainLead1);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_LEAD1_OUTPUT, kessho::product::internal::kSidechainLead1);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_LEAD1_GAIN_TRACE, kessho::product::internal::kSidechainLead1);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_LEAD2_INPUT, kessho::product::internal::kSidechainLead2);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_LEAD2_OUTPUT, kessho::product::internal::kSidechainLead2);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_LEAD2_GAIN_TRACE, kessho::product::internal::kSidechainLead2);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PIANO_INPUT, kessho::product::internal::kSidechainPiano);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PIANO_OUTPUT, kessho::product::internal::kSidechainPiano);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_PIANO_GAIN_TRACE, kessho::product::internal::kSidechainPiano);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_GRANULAR_INPUT, kessho::product::internal::kSidechainGranular);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_GRANULAR_OUTPUT, kessho::product::internal::kSidechainGranular);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_GRANULAR_GAIN_TRACE, kessho::product::internal::kSidechainGranular);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_DELAY_A_INPUT, kessho::product::internal::kSidechainDelayA);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_DELAY_A_OUTPUT, kessho::product::internal::kSidechainDelayA);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_DELAY_A_GAIN_TRACE, kessho::product::internal::kSidechainDelayA);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_DELAY_B_INPUT, kessho::product::internal::kSidechainDelayB);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_DELAY_B_OUTPUT, kessho::product::internal::kSidechainDelayB);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_DELAY_B_GAIN_TRACE, kessho::product::internal::kSidechainDelayB);
    KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_REVERB_INPUT, kessho::product::internal::kSidechainReverb);
    KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_REVERB_OUTPUT, kessho::product::internal::kSidechainReverb);
    KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE(KESSHO_PRODUCT_GRAPH_TAP_SIDECHAIN_REVERB_GAIN_TRACE, kessho::product::internal::kSidechainReverb);
    default:
      return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
#undef KESSHO_PRODUCT_GRAPH_TAP_CASE
#undef KESSHO_PRODUCT_SIDECHAIN_INPUT_TAP_CASE
#undef KESSHO_PRODUCT_SIDECHAIN_OUTPUT_TAP_CASE
#undef KESSHO_PRODUCT_SIDECHAIN_GAIN_TAP_CASE
  const uint32_t copy_frames = std::min<uint32_t>(frames, engine->last_stem_frames);
  for (uint32_t i = 0; i < copy_frames; ++i) {
    out_l[i] = tap_l[i];
    out_r[i] = tap_r[i];
  }
  for (uint32_t i = copy_frames; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_set_graph_taps_enabled(KesshoProductEngine* engine, uint32_t enabled) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
#if defined(KESSHO_DISABLE_GRAPH_TAPS)
  (void)enabled;
  engine->graph_taps_enabled = false;
#else
  engine->graph_taps_enabled = enabled != 0u;
#endif
  return KESSHO_PRODUCT_OK;
}

KesshoProductTelemetry kessho_product_get_telemetry(KesshoProductEngine* engine) {
  KesshoProductTelemetry telemetry{};
  if (engine == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
    return telemetry;
  }
  return engine->telemetry;
}

int32_t kessho_product_copy_telemetry(
    KesshoProductEngine* engine,
    KesshoProductTelemetry* out_telemetry) {
  if (engine == nullptr || out_telemetry == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  *out_telemetry = engine->telemetry;
  return KESSHO_PRODUCT_OK;
}

uint32_t kessho_product_drain_generated_sequencer_capture_events(
    KesshoProductEngine* engine,
    KesshoProductGeneratedSequencerCaptureEvent* out_events,
    uint32_t max_event_count,
    uint32_t* out_overflow_count) {
  auto* ring = engine == nullptr ? nullptr : &engine->generated_sequencer_capture_ring;
  if (out_overflow_count != nullptr) *out_overflow_count = ring == nullptr ? 0u : ring->overflowCount();
  if (ring == nullptr || out_events == nullptr || max_event_count == 0u) return 0u;
  uint32_t count = 0u;
  while (count < max_event_count && ring->pop(out_events[count])) ++count;
  return count;
}

int32_t kessho_product_copy_granular_waveform(
    KesshoProductEngine* engine,
    float* out_peaks,
    uint32_t bin_count) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (out_peaks == nullptr || bin_count == 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  if (engine->granular_module == nullptr) {
    std::fill(out_peaks, out_peaks + bin_count, 0.0f);
    return KESSHO_PRODUCT_OK;
  }
  return engine->granular_module->copyGranularWaveform(out_peaks, bin_count) == 1
      ? KESSHO_PRODUCT_OK
      : KESSHO_PRODUCT_ERROR_INVALID_PARAM;
}

int32_t kessho_product_copy_sequencer_ui_state(
    KesshoProductEngine* engine,
    KesshoProductSequencerUiState* out_state) {
  if (engine == nullptr || out_state == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  engine->copySequencerUiState(*out_state);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_register_asset_buffer(
    KesshoProductEngine* engine,
    uint32_t asset_id,
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double asset_sample_rate,
    uint32_t flags) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (asset_id == 0u || channels == nullptr || channel_count == 0u || channel_count > 2u ||
      channels[0] == nullptr || frame_count == 0u || asset_sample_rate <= 0.0) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
    return KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
  }

  uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
      if (!engine->assets[i].active) {
        slot = i;
        break;
      }
    }
  }
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  }

  AssetSlot& asset = engine->assets[slot];
  asset.active = true;
  asset.asset_id = asset_id;
  asset.channel_count = channel_count;
  asset.frame_count = frame_count;
  asset.sample_rate = asset_sample_rate;
  asset.flags = flags;
  asset.loop_start_frame = 0u;
  asset.loop_end_frame = 0u;
  asset.loop_crossfade_frames = 0u;
  if (const auto* descriptor = findGeneratedSampleDescriptor(asset_id)) {
    if (descriptor->hasLoop) {
      const uint32_t loop_start = std::min(
          frame_count,
          scaledLoopFrame(descriptor->encodedLoopStartFrame, asset_sample_rate, descriptor->encodedSampleRate));
      const uint32_t loop_end = std::min(
          frame_count,
          scaledLoopFrame(descriptor->encodedLoopEndFrame, asset_sample_rate, descriptor->encodedSampleRate));
      if (loop_end > loop_start + 8u) {
        asset.loop_start_frame = loop_start;
        asset.loop_end_frame = loop_end;
        asset.loop_crossfade_frames = std::min<uint32_t>(
            scaledLoopFrame(descriptor->encodedLoopCrossfadeFrames, asset_sample_rate, descriptor->encodedSampleRate),
            std::max<uint32_t>(1u, (loop_end - loop_start) / 2u));
        asset.flags |= KESSHO_PRODUCT_ASSET_LOOP;
      }
    }
  }
  asset.channels[0] = channels[0];
  asset.channels[1] = channel_count > 1u ? channels[1] : channels[0];
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_unregister_asset_buffer(KesshoProductEngine* engine, uint32_t asset_id) {
  if (engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  const uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    return KESSHO_PRODUCT_ERROR_INVALID_ASSET_ID;
  }
  engine->assets[slot] = {};
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

} // extern "C"
