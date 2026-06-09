#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <new>

#include "KesshoCore/KesshoCore.h"

struct KesshoModule {
  int type = 0;
  std::unique_ptr<kessho::core::IKesshoModule> impl;
};

namespace {

std::unique_ptr<kessho::core::IKesshoModule> createModule(int module_type) {
  switch (module_type) {
    case KESSHO_MODULE_DYNAMICS_DRIFT:
      return kessho::core::createDynamicsDriftModule();
    case KESSHO_MODULE_DYNAMICS_DEGRADE:
      return kessho::core::createDynamicsErosionModule();
    case KESSHO_MODULE_REVERB:
      return kessho::core::createReverbModule();
    case KESSHO_MODULE_GRANULAR:
      return kessho::core::createGranularModule();
    case KESSHO_MODULE_SPECTRAL_FREEZE:
      return kessho::core::createSpectralFreezeModule();
    case KESSHO_MODULE_LEAD_FM:
      return kessho::core::createLeadFmModule();
    case KESSHO_MODULE_PAD:
      return kessho::core::createPadModule();
    case KESSHO_MODULE_DRUM:
      return kessho::core::createDrumModule();
    case KESSHO_MODULE_SOUNDSCAPES:
      return kessho::core::createSoundscapesModule();
    case KESSHO_MODULE_DELAY_A:
      return kessho::core::createDelayAModule();
    case KESSHO_MODULE_DELAY_B:
      return kessho::core::createDelayBModule();
    default:
      return nullptr;
  }
}

bool moduleSelfCheck(kessho::core::IKesshoModule& module, int max_block_size) {
  const int param_count = module.paramCount();
  if (param_count < 0 || (param_count > 0 && module.params() == nullptr)) {
    return false;
  }

  const int tap_count = module.outputTapCount();
  if (tap_count <= 0 || tap_count > KESSHO_MODULE_MAX_OUTPUT_TAPS) {
    return false;
  }

  constexpr int kSelfCheckFrames = 16;
  const int frames = std::max(1, std::min(max_block_size, kSelfCheckFrames));
  std::array<float, kSelfCheckFrames> input_l{};
  std::array<float, kSelfCheckFrames> input_r{};
  std::array<std::array<float, kSelfCheckFrames>, KESSHO_MODULE_MAX_OUTPUT_TAPS> output_l{};
  std::array<std::array<float, kSelfCheckFrames>, KESSHO_MODULE_MAX_OUTPUT_TAPS> output_r{};
  std::array<float*, KESSHO_MODULE_MAX_OUTPUT_TAPS> output_l_ptrs{};
  std::array<float*, KESSHO_MODULE_MAX_OUTPUT_TAPS> output_r_ptrs{};

  for (int bus = 0; bus < tap_count; ++bus) {
    output_l_ptrs[bus] = output_l[bus].data();
    output_r_ptrs[bus] = output_r[bus].data();
  }

  module.processPlanarStereoTaps(
      input_l.data(),
      input_r.data(),
      output_l_ptrs.data(),
      output_r_ptrs.data(),
      static_cast<uint32_t>(tap_count),
      frames);

  for (int bus = 0; bus < tap_count; ++bus) {
    for (int i = 0; i < frames; ++i) {
      if (!std::isfinite(output_l[bus][i]) || !std::isfinite(output_r[bus][i])) {
        return false;
      }
    }
  }

  return true;
}

} // namespace

KesshoModule* kessho_module_create(int module_type, double sample_rate, int max_block_size) {
  auto impl = createModule(module_type);
  if (!impl || !impl->prepare(sample_rate, max_block_size)) {
    return nullptr;
  }

  KesshoModule* module = new (std::nothrow) KesshoModule{};
  if (module == nullptr) {
    return nullptr;
  }

  module->type = module_type;
  module->impl = std::move(impl);
  return module;
}

void kessho_module_destroy(KesshoModule* module) {
  delete module;
}

void kessho_module_reset(KesshoModule* module) {
  if (module != nullptr && module->impl) {
    module->impl->reset();
  }
}

int kessho_module_self_check(int module_type, double sample_rate, int max_block_size) {
  auto impl = createModule(module_type);
  if (!impl || !impl->prepare(sample_rate, max_block_size)) {
    return 0;
  }

  return moduleSelfCheck(*impl, max_block_size) ? 1 : 0;
}

int kessho_module_get_param_count(KesshoModule* module) {
  return module != nullptr && module->impl ? module->impl->paramCount() : 0;
}

float* kessho_module_get_params_ptr(KesshoModule* module) {
  return module != nullptr && module->impl ? module->impl->params() : nullptr;
}

void kessho_module_commit_params(KesshoModule* module) {
  if (module != nullptr && module->impl) {
    module->impl->commitParams();
  }
}

int kessho_module_note_on(
    KesshoModule* module,
    float frequency,
    float velocity,
    float hold_seconds,
    int lead_index) {
  if (module == nullptr || !module->impl) {
    return 0;
  }

  return module->impl->noteOn(frequency, velocity, hold_seconds, lead_index);
}

int kessho_module_note_off(KesshoModule* module, int voice_index) {
  if (module == nullptr || !module->impl) {
    return 0;
  }

  return module->impl->noteOff(voice_index);
}

int kessho_module_kill_voice(KesshoModule* module, int voice_index) {
  if (module == nullptr || !module->impl) {
    return 0;
  }

  return module->impl->killVoice(voice_index);
}

void kessho_module_all_notes_off(KesshoModule* module) {
  if (module != nullptr && module->impl) {
    module->impl->allNotesOff();
  }
}

int kessho_module_get_active_voice_count(KesshoModule* module) {
  return module != nullptr && module->impl ? module->impl->activeVoiceCount() : 0;
}

int kessho_module_get_output_tap_count(KesshoModule* module) {
  return module != nullptr && module->impl ? module->impl->outputTapCount() : 0;
}

int kessho_module_process_interleaved(
    KesshoModule* module,
    const float* input_interleaved,
    float* output_interleaved,
    int frames) {
  if (module == nullptr || !module->impl || input_interleaved == nullptr || output_interleaved == nullptr ||
      frames <= 0) {
    return 0;
  }

  module->impl->processInterleaved(input_interleaved, output_interleaved, frames);
  return 1;
}

int kessho_module_process_planar_stereo(
    KesshoModule* module,
    const float* input_l,
    const float* input_r,
    float* output_l,
    float* output_r,
    int frames) {
  if (module == nullptr || !module->impl || input_l == nullptr || input_r == nullptr ||
      output_l == nullptr || output_r == nullptr || frames <= 0) {
    return 0;
  }

  module->impl->processPlanarStereo(input_l, input_r, output_l, output_r, frames);
  return 1;
}

int kessho_module_process_planar_stereo_taps(
    KesshoModule* module,
    const float* input_l,
    const float* input_r,
    float* const* output_l,
    float* const* output_r,
    uint32_t output_bus_count,
    int frames) {
  if (module == nullptr || !module->impl || input_l == nullptr || input_r == nullptr ||
      output_l == nullptr || output_r == nullptr || output_bus_count == 0 ||
      output_bus_count > KESSHO_MODULE_MAX_OUTPUT_TAPS || frames <= 0) {
    return 0;
  }

  if (output_bus_count > static_cast<uint32_t>(module->impl->outputTapCount())) {
    return 0;
  }

  for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
    if (output_l[bus] == nullptr || output_r[bus] == nullptr) {
      return 0;
    }
  }

  module->impl->processPlanarStereoTaps(input_l, input_r, output_l, output_r, output_bus_count, frames);
  return 1;
}
