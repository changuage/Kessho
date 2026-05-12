#include "KesshoProductCoreBridge/KesshoProductCoreBridge.h"

#include <algorithm>
#include <cstddef>
#include <memory>
#include <unordered_map>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"

namespace {

struct OwnedAssetBuffer {
  std::vector<std::vector<float>> channels;
  std::vector<const float*> channel_pointers;
};

struct NativeProductCoreBridge {
  KesshoProductEngine* engine = nullptr;
  std::unordered_map<uint32_t, OwnedAssetBuffer> assets;

  ~NativeProductCoreBridge() {
    if (engine != nullptr) {
      kessho_product_destroy(engine);
      engine = nullptr;
    }
  }
};

NativeProductCoreBridge* bridgeFromHandle(KesshoNativeProductCoreHandle handle) {
  return static_cast<NativeProductCoreBridge*>(handle);
}

KesshoNativeProductCapabilityReport convertCapabilityReport(
    const KesshoProductCapabilityReport& report) {
  KesshoNativeProductCapabilityReport native{};
  native.abi_version = report.abi_version;
  native.schema_hash = report.schema_hash;
  native.supports_full_product_graph = report.supports_full_product_graph;
  native.supports_synth_sequencer = report.supports_synth_sequencer;
  native.supports_drum_sequencer = report.supports_drum_sequencer;
  native.supports_journey_morph_clock = report.supports_journey_morph_clock;
  native.supports_harmony_core = report.supports_harmony_core;
  native.supports_core_asset_rendering = report.supports_core_asset_rendering;
  native.supports_native_bridge = 1;
  native.supports_recordable_stems = report.supports_recordable_stems;
  native.supports_cpu_telemetry = report.supports_cpu_telemetry;
  native.legacy_fallback_count = report.legacy_fallback_count;
  native.unsupported_method_count = report.unsupported_method_count;
  return native;
}

KesshoNativeProductTelemetry convertTelemetry(const KesshoProductTelemetry& telemetry) {
  KesshoNativeProductTelemetry native{};
  native.schema_hash = telemetry.schema_hash;
  native.sample_rate = telemetry.sample_rate;
  native.block_size = telemetry.block_size;
  native.transport_running = telemetry.transport_running;
  native.absolute_sample_time = telemetry.absolute_sample_time;
  native.beat_position = telemetry.beat_position;
  native.bar_index = telemetry.bar_index;
  native.phrase_index = telemetry.phrase_index;
  native.active_sources = telemetry.active_sources;
  native.active_voices = telemetry.active_voices;
  native.active_assets = telemetry.active_assets;
  native.active_grains = telemetry.active_grains;
  native.render_cpu_percent = telemetry.render_cpu_percent;
  native.render_cpu_peak_percent = telemetry.render_cpu_peak_percent;
  native.render_p95_ms = telemetry.render_p95_ms;
  native.render_p99_ms = telemetry.render_p99_ms;
  native.missed_quantum_count = telemetry.missed_quantum_count;
  native.sequencer_event_count = telemetry.sequencer_event_count;
  native.control_queue_depth = telemetry.control_queue_depth;
  native.asset_missing_count = telemetry.asset_missing_count;
  native.last_error_code = telemetry.last_error_code;
  native.journey_morph_running = telemetry.journey_morph_running;
  native.journey_morph_phase = telemetry.journey_morph_phase;
  native.harmony_root_midi = telemetry.harmony_root_midi;
  native.harmony_scale_id = telemetry.harmony_scale_id;
  native.harmony_tension = telemetry.harmony_tension;
  native.harmony_chord_degree = telemetry.harmony_chord_degree;
  for (size_t i = 0; i < 4; ++i) {
    native.harmony_chord_midi[i] = telemetry.harmony_chord_midi[i];
  }
  native.rng_seed = telemetry.rng_seed;
  native.rng_state = telemetry.rng_state;
  for (size_t i = 0; i < 7; ++i) {
    native.source_preset_ids[i] = telemetry.source_preset_ids[i];
  }
  native.master_input_peak = telemetry.master_input_peak;
  native.master_output_peak = telemetry.master_output_peak;
  native.master_output_rms = telemetry.master_output_rms;
  native.master_limiter_gain_reduction_db = telemetry.master_limiter_gain_reduction_db;
  native.master_saturation_drive = telemetry.master_saturation_drive;
  native.dynamics_saturation_drive = telemetry.dynamics_saturation_drive;
  native.master_true_peak = telemetry.master_true_peak;
  native.master_true_peak_dbtp = telemetry.master_true_peak_dbtp;
  native.master_integrated_lufs = telemetry.master_integrated_lufs;
  return native;
}

} // namespace

int32_t kessho_native_product_get_abi_version(void) {
  return kessho_product_get_abi_version();
}

KesshoNativeProductCapabilityReport kessho_native_product_get_capability_report(void) {
  return convertCapabilityReport(kessho_product_get_capability_report());
}

KesshoNativeProductCoreHandle kessho_native_product_create(
    double sample_rate,
    uint32_t max_block_size,
    uint32_t flags) {
  std::unique_ptr<NativeProductCoreBridge> bridge(new (std::nothrow) NativeProductCoreBridge());
  if (!bridge) {
    return nullptr;
  }

  bridge->engine = kessho_product_create(sample_rate, max_block_size, flags);
  if (bridge->engine == nullptr) {
    return nullptr;
  }

  return bridge.release();
}

void kessho_native_product_destroy(KesshoNativeProductCoreHandle handle) {
  delete bridgeFromHandle(handle);
}

void kessho_native_product_reset(KesshoNativeProductCoreHandle handle) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    return;
  }
  kessho_product_reset(bridge->engine);
}

int32_t kessho_native_product_load_snapshot(
    KesshoNativeProductCoreHandle handle,
    const void* snapshot_bytes,
    uint32_t snapshot_byte_count) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  return kessho_product_load_snapshot_v2(bridge->engine, snapshot_bytes, snapshot_byte_count);
}

int32_t kessho_native_product_enqueue_event(
    KesshoNativeProductCoreHandle handle,
    uint32_t sample_offset,
    uint32_t event_kind,
    uint32_t target_id,
    uint32_t index,
    uint32_t param_id,
    float value,
    float value2,
    float value3,
    float value4,
    uint32_t flags) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }

  KesshoProductEvent event{};
  event.sample_offset = sample_offset;
  event.event_kind = event_kind;
  event.target_id = target_id;
  event.index = index;
  event.param_id = param_id;
  event.value = value;
  event.value2 = value2;
  event.value3 = value3;
  event.value4 = value4;
  event.flags = flags;
  return kessho_product_enqueue_event(bridge->engine, &event);
}

int32_t kessho_native_product_render(
    KesshoNativeProductCoreHandle handle,
    float* out_l,
    float* out_r,
    uint32_t frames) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr || out_l == nullptr || out_r == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  kessho_product_render(bridge->engine, out_l, out_r, frames);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_native_product_get_stem(
    KesshoNativeProductCoreHandle handle,
    uint32_t stem_id,
    float* out_l,
    float* out_r,
    uint32_t frames) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  return kessho_product_get_stem(bridge->engine, stem_id, out_l, out_r, frames);
}

KesshoNativeProductTelemetry kessho_native_product_get_telemetry(
    KesshoNativeProductCoreHandle handle) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    KesshoProductTelemetry telemetry{};
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
    return convertTelemetry(telemetry);
  }
  return convertTelemetry(kessho_product_get_telemetry(bridge->engine));
}

int32_t kessho_native_product_copy_sequencer_ui_state(
    KesshoNativeProductCoreHandle handle,
    void* out_state,
    uint32_t byte_count) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr || out_state == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (byte_count < sizeof(KesshoProductSequencerUiState)) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  return kessho_product_copy_sequencer_ui_state(
      bridge->engine,
      static_cast<KesshoProductSequencerUiState*>(out_state));
}

int32_t kessho_native_product_register_interleaved_asset(
    KesshoNativeProductCoreHandle handle,
    uint32_t asset_id,
    const float* interleaved_pcm,
    uint32_t frame_count,
    uint32_t channel_count,
    double sample_rate,
    uint32_t flags) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (
      asset_id == 0u ||
      interleaved_pcm == nullptr ||
      frame_count == 0u ||
      channel_count == 0u ||
      channel_count > 2u ||
      sample_rate <= 0.0) {
    return KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
  }

  kessho_product_unregister_asset_buffer(bridge->engine, asset_id);
  bridge->assets.erase(asset_id);

  OwnedAssetBuffer asset;
  asset.channels.resize(channel_count);
  asset.channel_pointers.resize(channel_count);
  try {
    for (uint32_t channel = 0; channel < channel_count; ++channel) {
      asset.channels[channel].resize(frame_count);
    }
  } catch (...) {
    return KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  }

  for (uint32_t frame = 0; frame < frame_count; ++frame) {
    for (uint32_t channel = 0; channel < channel_count; ++channel) {
      asset.channels[channel][frame] = interleaved_pcm[frame * channel_count + channel];
    }
  }

  try {
    bridge->assets.emplace(asset_id, std::move(asset));
  } catch (...) {
    return KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  }
  OwnedAssetBuffer& stored = bridge->assets[asset_id];
  for (uint32_t channel = 0; channel < channel_count; ++channel) {
    stored.channel_pointers[channel] = stored.channels[channel].data();
  }

  const int32_t result = kessho_product_register_asset_buffer(
      bridge->engine,
      asset_id,
      stored.channel_pointers.data(),
      channel_count,
      frame_count,
      sample_rate,
      flags);
  if (result != KESSHO_PRODUCT_OK) {
    bridge->assets.erase(asset_id);
  }
  return result;
}

int32_t kessho_native_product_unregister_asset(
    KesshoNativeProductCoreHandle handle,
    uint32_t asset_id) {
  NativeProductCoreBridge* bridge = bridgeFromHandle(handle);
  if (bridge == nullptr || bridge->engine == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  const int32_t result = kessho_product_unregister_asset_buffer(bridge->engine, asset_id);
  bridge->assets.erase(asset_id);
  return result;
}
