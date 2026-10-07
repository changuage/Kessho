#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define KESSHO_PRODUCT_CAPTURE_CLOCK_SCHEMA_VERSION 2u

// Read-only transport position used while a generated capture is armed.  It
// carries no persisted notes and has no playback authority.
typedef struct KesshoProductCaptureClock {
  uint32_t schema_version;
  uint32_t reserved;
  uint64_t current_sample;
  double current_beat;
  double current_bpm;
} KesshoProductCaptureClock;

#ifdef __cplusplus
}

static_assert(offsetof(KesshoProductCaptureClock, schema_version) == 0u,
              "capture clock schema offset changed");
static_assert(offsetof(KesshoProductCaptureClock, reserved) == 4u,
              "capture clock reserved offset changed");
static_assert(offsetof(KesshoProductCaptureClock, current_sample) == 8u,
              "capture clock sample offset changed");
static_assert(offsetof(KesshoProductCaptureClock, current_beat) == 16u,
              "capture clock beat offset changed");
static_assert(offsetof(KesshoProductCaptureClock, current_bpm) == 24u,
              "capture clock BPM offset changed");
static_assert(sizeof(KesshoProductCaptureClock) == 32u,
              "capture clock ABI size changed");
#endif
