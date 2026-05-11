#pragma once

#include <stdint.h>

#include "KesshoCore/KesshoProductTypes.h"

typedef struct KesshoProductAssetInfo {
  uint32_t asset_id;
  uint32_t channel_count;
  uint32_t frame_count;
  double sample_rate;
  uint32_t flags;
} KesshoProductAssetInfo;
