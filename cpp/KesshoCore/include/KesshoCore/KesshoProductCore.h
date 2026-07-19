#pragma once

#include "KesshoCore/KesshoProductAssets.h"
#include "KesshoCore/KesshoProductEvents.h"
#include "KesshoCore/KesshoProductGeneratedSequencerCapture.h"
#include "KesshoCore/KesshoProductSimpleSequencerVisual.h"
#include "KesshoCore/KesshoProductSnapshot.h"
#include "KesshoCore/KesshoProductTelemetry.h"
#include "KesshoCore/KesshoProductTypes.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KesshoProductEngine KesshoProductEngine;

int32_t kessho_product_get_abi_version(void);
KesshoProductCapabilityReport kessho_product_get_capability_report(void);

KesshoProductEngine* kessho_product_create(
    double sample_rate,
    uint32_t max_block_size,
    uint32_t flags);

void kessho_product_destroy(KesshoProductEngine* engine);
void kessho_product_reset(KesshoProductEngine* engine);
void kessho_product_reset_parity_fx(KesshoProductEngine* engine);

int32_t kessho_product_load_snapshot_v2(
    KesshoProductEngine* engine,
    const void* snapshot_bytes,
    uint32_t snapshot_byte_count);

int32_t kessho_product_enqueue_event(
    KesshoProductEngine* engine,
    const KesshoProductEvent* event);

int32_t kessho_product_enqueue_events(
    KesshoProductEngine* engine,
    const KesshoProductEvent* events,
    uint32_t event_count);

void kessho_product_render(
    KesshoProductEngine* engine,
    float* out_l,
    float* out_r,
    uint32_t frames);

int32_t kessho_product_get_stem(
    KesshoProductEngine* engine,
    uint32_t stem_id,
    float* out_l,
    float* out_r,
    uint32_t frames);

int32_t kessho_product_get_graph_tap(
    KesshoProductEngine* engine,
    uint32_t tap_id,
    float* out_l,
    float* out_r,
    uint32_t frames);

int32_t kessho_product_set_graph_taps_enabled(
    KesshoProductEngine* engine,
    uint32_t enabled);

int32_t kessho_product_set_stems_enabled(
    KesshoProductEngine* engine,
    uint32_t enabled);

KesshoProductTelemetry kessho_product_get_telemetry(KesshoProductEngine* engine);

int32_t kessho_product_copy_telemetry(
    KesshoProductEngine* engine,
    KesshoProductTelemetry* out_telemetry);

int32_t kessho_product_refresh_telemetry(KesshoProductEngine* engine);

int32_t kessho_product_set_meter_demand(
    KesshoProductEngine* engine,
    uint32_t enabled);

int32_t kessho_product_set_debug_voice_spawn_demand(
    KesshoProductEngine* engine,
    uint32_t enabled);

int32_t kessho_product_set_simple_sequencer_visual_demand(
    KesshoProductEngine* engine,
    uint32_t demand_mask);

uint32_t kessho_product_drain_simple_sequencer_visual_events(
    KesshoProductEngine* engine,
    KesshoProductSimpleSequencerVisualEvent* out_events,
    uint32_t max_event_count,
    uint32_t* out_overflow_count);

uint64_t kessho_product_get_telemetry_refresh_count(KesshoProductEngine* engine);

uint32_t kessho_product_drain_generated_sequencer_capture_events(
    KesshoProductEngine* engine,
    KesshoProductGeneratedSequencerCaptureEvent* out_events,
    uint32_t max_event_count,
    uint32_t* out_overflow_count);

int32_t kessho_product_copy_granular_waveform(
    KesshoProductEngine* engine,
    float* out_peaks,
    uint32_t bin_count);

int32_t kessho_product_copy_sequencer_ui_state(
    KesshoProductEngine* engine,
    KesshoProductSequencerUiState* out_state);

int32_t kessho_product_register_asset_buffer(
    KesshoProductEngine* engine,
    uint32_t asset_id,
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double asset_sample_rate,
    uint32_t flags);

int32_t kessho_product_unregister_asset_buffer(
    KesshoProductEngine* engine,
    uint32_t asset_id);

int32_t kessho_product_debug_render_events(
    KesshoProductEngine* engine,
    KesshoSequencerEvent* out_events,
    uint32_t max_event_count,
    uint32_t frames);

#ifdef __cplusplus
}
#endif
