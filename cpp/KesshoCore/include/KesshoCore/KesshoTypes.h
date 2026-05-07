#pragma once

#include <stdint.h>

#define KESSHO_CORE_ABI_VERSION 2
#define KESSHO_CORE_SNAPSHOT_VERSION 1
#define KESSHO_CORE_SNAPSHOT_SCHEMA_HASH 0x4b435632u
#define KESSHO_CORE_MAX_EVENTS 256
#define KESSHO_CORE_MIDI_RAW_BYTES 16
#define KESSHO_CORE_DEFAULT_SEED 1u
#define KESSHO_MIXER_MAX_INPUT_BUSES 16
#define KESSHO_MIXER_MAX_OUTPUT_BUSES 8
#define KESSHO_MIXER_MAX_ROUTES 64
#define KESSHO_MODULE_MAX_OUTPUT_TAPS 8
#define KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT 6
#define KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT 4
#define KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT 4

typedef enum KesshoRenderMode {
  KESSHO_RENDER_SILENCE = 0,
  KESSHO_RENDER_SMOKE_SINE = 1
} KesshoRenderMode;

typedef enum KesshoEventType {
  KESSHO_EVENT_PARAM = 1,
  KESSHO_EVENT_MIDI = 2,
  KESSHO_EVENT_TRANSPORT = 3,
  KESSHO_EVENT_PRESET = 4
} KesshoEventType;

typedef enum KesshoParamId {
  KESSHO_PARAM_MASTER_GAIN = 1,
  KESSHO_PARAM_RENDER_MODE = 2,
  KESSHO_PARAM_SMOKE_FREQUENCY_HZ = 3,
  KESSHO_PARAM_SMOKE_AMPLITUDE = 4,
  KESSHO_PARAM_BPM = 5,
  KESSHO_PARAM_BEATS_PER_BAR = 6,
  KESSHO_PARAM_BARS_PER_PHRASE = 7,
  KESSHO_PARAM_RNG_SEED = 8
} KesshoParamId;

typedef enum KesshoTransportCommand {
  KESSHO_TRANSPORT_STOP = 0,
  KESSHO_TRANSPORT_START = 1,
  KESSHO_TRANSPORT_RESET = 2,
  KESSHO_TRANSPORT_CONTINUE = 3
} KesshoTransportCommand;

typedef enum KesshoModuleType {
  KESSHO_MODULE_DYNAMICS_CHARACTER = 1,
  KESSHO_MODULE_DYNAMICS_DEGRADE = 2,
  KESSHO_MODULE_REVERB = 3,
  KESSHO_MODULE_GRANULAR = 4,
  KESSHO_MODULE_SPECTRAL_FREEZE = 5,
  KESSHO_MODULE_LEAD_FM = 6,
  KESSHO_MODULE_PAD = 7,
  KESSHO_MODULE_DRUM = 8,
  KESSHO_MODULE_SOUNDSCAPES = 9,
  KESSHO_MODULE_DELAY_A = 10,
  KESSHO_MODULE_DELAY_B = 11
} KesshoModuleType;

typedef enum KesshoModuleOutputTap {
  KESSHO_MODULE_TAP_MAIN = 0,
  KESSHO_MODULE_TAP_REVERB_SEND = 1,
  KESSHO_MODULE_TAP_PREFADER_PAD1 = 2,
  KESSHO_MODULE_TAP_PREFADER_PAD2 = 3,
  KESSHO_MODULE_TAP_POSTFADER_PAD1 = 4,
  KESSHO_MODULE_TAP_POSTFADER_PAD2 = 5,
  KESSHO_MODULE_DELAY_A_TAP_MAIN = 0,
  KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND = 1,
  KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND = 2,
  KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND = 3,
  KESSHO_MODULE_DELAY_B_TAP_MAIN = 0,
  KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND = 1,
  KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND = 2,
  KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND = 3
} KesshoModuleOutputTap;

typedef struct KesshoParamEvent {
  uint32_t sample_offset;
  uint32_t param_id;
  float value;
  uint32_t ramp_frames;
} KesshoParamEvent;

typedef struct KesshoMidiEvent {
  uint32_t sample_offset;
  uint32_t source_id;
  uint8_t status;
  uint8_t channel;
  uint8_t data1;
  uint8_t data2;
  float normalized_value;
  uint8_t raw_size;
  uint8_t raw_bytes[KESSHO_CORE_MIDI_RAW_BYTES];
} KesshoMidiEvent;

typedef struct KesshoTransportEvent {
  uint32_t sample_offset;
  uint32_t command;
} KesshoTransportEvent;

typedef struct KesshoCoreSnapshotV1 {
  uint32_t version;
  uint32_t schema_hash;
  float bpm;
  float master_gain;
  int render_mode;
  float smoke_frequency_hz;
  float smoke_amplitude;
  uint32_t flags;
  uint32_t beats_per_bar;
  uint32_t bars_per_phrase;
  uint32_t seed;
  uint32_t reserved0;
} KesshoCoreSnapshotV1;

typedef struct KesshoCoreStats {
  uint64_t sample_frame;
  double sample_rate;
  int max_block_size;
  int running;
  int render_mode;
  int event_queue_depth;
  uint32_t midi_events_processed;
} KesshoCoreStats;

typedef struct KesshoTransportInfo {
  uint64_t sample_frame;
  double sample_rate;
  double bpm;
  uint32_t beats_per_bar;
  uint32_t bars_per_phrase;
  uint64_t beat_index;
  uint64_t bar_index;
  uint64_t phrase_index;
  double beat_phase;
  double bar_phase;
  double phrase_phase;
  double seconds;
  uint32_t seed;
  uint32_t rng_state;
} KesshoTransportInfo;

typedef struct KesshoMixerRoute {
  uint32_t source_bus;
  uint32_t target_bus;
  float gain_l;
  float gain_r;
  uint32_t enabled;
} KesshoMixerRoute;

typedef struct KesshoMixerStats {
  uint32_t route_slots;
  uint32_t active_routes;
} KesshoMixerStats;
