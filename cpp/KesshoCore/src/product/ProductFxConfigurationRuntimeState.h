#pragma once

#include <cstdint>

namespace kessho::product::internal {

struct ProductFxConfigurationRuntimeState {
  uint32_t fx_configuration_batch_depth = 0u;
  bool fx_configuration_pending = false;
  bool reverb_configuration_pending = false;
  bool spectral_freeze_configuration_pending = false;
};

} // namespace kessho::product::internal
