#include "../KesshoProductEngineInternal.h"

namespace {
constexpr float kReverbWashDecayPerVisualFrame = 0.92f;
constexpr float kReverbBloomDecayPerVisualFrame = 0.95f;
constexpr float kReverbBoostEpsilon = 0.001f;
}

  void KesshoProductEngine::resetReverbHarmonyCoupling() {
  reverb_wash_boost = 0.0f;
  reverb_bloom_boost = 0.0f;
  reverb_prev_chord_tension = 0.0f;
  reverb_last_chord_degree = 0u;
  reverb_last_phrase_index = 0u;
  reverb_harmony_runtime_initialized = false;
  reverb_harmony_boost_active_last_block = false;
}

  void KesshoProductEngine::advanceReverbHarmonyCoupling(uint32_t frames) {
  if (frames == 0u || sample_rate <= 0.0) {
    return;
  }

  bool triggered = false;
  const bool coupling_enabled = fx.reverb_chord_wash || fx.reverb_resolution_bloom;
  if (transport.running && coupling_enabled) {
    int intervals[kMaxScaleNotes]{};
    const uint32_t scale_count = std::max(1u, scaleIntervals(harmony.scale_id, intervals));
    const uint64_t phrase = transport.phraseIndex(sample_rate);
    const uint64_t bar = transport.barIndex(sample_rate);
    const uint32_t chord_degree =
        circleOfFifthsProgressionDegree(rng_seed, harmony.tension, bar, phrase, scale_count);
    const float chord_tension =
        clampFloat(std::fmod(clampFloat(harmony.tension, 0.0f, 1.0f), 0.5f) * 2.0f, 0.0f, 1.0f);

    if (!reverb_harmony_runtime_initialized) {
      reverb_harmony_runtime_initialized = true;
      reverb_last_phrase_index = phrase;
      reverb_last_chord_degree = chord_degree;
      reverb_prev_chord_tension = chord_tension;
    } else if (phrase != reverb_last_phrase_index) {
      if (fx.reverb_chord_wash && chord_degree != reverb_last_chord_degree) {
        reverb_wash_boost = 1.0f;
        triggered = true;
      }
      if (fx.reverb_resolution_bloom && chord_tension < reverb_prev_chord_tension - 0.15f) {
        reverb_bloom_boost = 1.0f;
        triggered = true;
      }
      reverb_last_phrase_index = phrase;
      reverb_last_chord_degree = chord_degree;
      reverb_prev_chord_tension = chord_tension;
    }
  }

  const bool boost_active_before_decay =
      reverb_wash_boost > kReverbBoostEpsilon ||
      reverb_bloom_boost > kReverbBoostEpsilon ||
      triggered;
  const bool boost_active = boost_active_before_decay || reverb_harmony_boost_active_last_block;
  if (boost_active) {
    configureReverbModule();
  }

  const float visual_frames =
      std::max(0.0f, static_cast<float>(frames) / std::max(1.0f, static_cast<float>(sample_rate) / 60.0f));
  if (reverb_wash_boost > kReverbBoostEpsilon) {
    reverb_wash_boost *= std::pow(kReverbWashDecayPerVisualFrame, visual_frames);
    if (reverb_wash_boost <= kReverbBoostEpsilon) {
      reverb_wash_boost = 0.0f;
    }
  }
  if (reverb_bloom_boost > kReverbBoostEpsilon) {
    reverb_bloom_boost *= std::pow(kReverbBloomDecayPerVisualFrame, visual_frames);
    if (reverb_bloom_boost <= kReverbBoostEpsilon) {
      reverb_bloom_boost = 0.0f;
    }
  }
  const bool boost_active_after_decay =
      reverb_wash_boost > kReverbBoostEpsilon ||
      reverb_bloom_boost > kReverbBoostEpsilon;
  reverb_harmony_boost_active_last_block =
      boost_active_after_decay ||
      (boost_active_before_decay && !boost_active_after_decay);
}

  float KesshoProductEngine::reverbPreCompressorGainDbForLevel(float level_db) const {
  const float threshold = clampFloat(fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
  const float knee = clampFloat(fx.reverb_pre_comp_knee, 0.0f, 40.0f);
  const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  if (ratio <= 1.0f) {
    return 0.0f;
  }
  constexpr float strength = 0.04f;
  if (knee <= 0.0f) {
    if (level_db <= threshold) {
      return 0.0f;
    }
    return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
  }

  const float lower = threshold - knee * 0.5f;
  const float upper = threshold + knee * 0.5f;
  if (level_db <= lower) {
    return 0.0f;
  }
  if (level_db >= upper) {
    return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
  }

  const float x = level_db - lower;
  return ((1.0f / ratio) - 1.0f) * x * x / (2.0f * knee) * strength;
}

  float KesshoProductEngine::reverbPreconditionerSoftLimit(float value) const {
  constexpr float limit = 1.047f;
  const float abs_value = std::abs(value);
  if (abs_value <= limit) {
    return value;
  }
  return std::copysign(limit + std::tanh((abs_value - limit) * 6.0f) * 0.005f, value);
}

  void KesshoProductEngine::processReverbPreconditioner(uint32_t start, uint32_t frames, float input_peak) {
  if (frames == 0u || sample_rate <= 0.0) {
    return;
  }
  const float attack_ms = clampFloat(fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
  const float release_ms = clampFloat(fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
  if (input_peak <= 1.0e-9f) {
    if (std::abs(reverb_pre_comp_gain - 1.0f) > 0.000001f) {
      const float block_release_coeff = std::exp(
          -static_cast<float>(frames) /
          std::max(1.0f, release_ms * 0.001f * static_cast<float>(sample_rate)));
      reverb_pre_comp_gain = 1.0f + (reverb_pre_comp_gain - 1.0f) * block_release_coeff;
      if (std::abs(reverb_pre_comp_gain - 1.0f) <= 0.000001f) {
        reverb_pre_comp_gain = 1.0f;
      }
    }
    return;
  }
  const float attack_coeff = std::exp(-1.0f / std::max(1.0f, attack_ms * 0.001f * static_cast<float>(sample_rate)));
  const float release_coeff = std::exp(-1.0f / std::max(1.0f, release_ms * 0.001f * static_cast<float>(sample_rate)));
  const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  const float ratio_depth = clampFloat((ratio - 1.0f) / 4.0f, 0.0f, 1.0f);
  const float native_auto_makeup = 1.0f + ratio_depth * 0.18f;
  const float input_makeup = clampFloat(fx.reverb_pre_comp_makeup, 0.5f, 4.0f);

  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float left = reverb_bus_l[frame];
    const float right = reverb_bus_r[frame];
    const float detector = std::max(std::max(std::abs(left), std::abs(right)), 1.0e-9f);
    const float level_db = 20.0f * std::log10(detector);
    const float target_gain = std::pow(10.0f, reverbPreCompressorGainDbForLevel(level_db) / 20.0f);
    const float coeff = target_gain < reverb_pre_comp_gain ? attack_coeff : release_coeff;
    reverb_pre_comp_gain = target_gain + (reverb_pre_comp_gain - target_gain) * coeff;
    const float gain = reverb_pre_comp_gain * native_auto_makeup * input_makeup;
    reverb_bus_l[frame] = reverbPreconditionerSoftLimit(left * gain);
    reverb_bus_r[frame] = reverbPreconditionerSoftLimit(right * gain);
  }
}

  void KesshoProductEngine::renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  const bool spectral_freeze_active =
      fx.spectral_freeze_enabled && fx.spectral_freeze_mix > 0.0f;
  const bool reverb_active =
      reverb_module != nullptr && frames > 0u && (!(fx.reverb_mix <= 0.0f) || spectral_freeze_active);
  if (!graph_taps_enabled && !reverb_active) {
    return;
  }
  float reverb_input_peak = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    reverb_input_peak = std::max(
        reverb_input_peak,
        std::max(std::abs(reverb_bus_l[frame]), std::abs(reverb_bus_r[frame])));
    if (graph_taps_enabled) {
      graph_reverb_input_l[frame] = reverb_bus_l[frame];
      graph_reverb_input_r[frame] = reverb_bus_r[frame];
    }
  }
  if (!reverb_active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  processReverbPreconditioner(start, frames, reverb_input_peak);
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      graph_reverb_preconditioner_output_l[frame] = reverb_bus_l[frame];
      graph_reverb_preconditioner_output_r[frame] = reverb_bus_r[frame];
    }
  }
  if (spectral_freeze_active && fx.spectral_freeze_routing == 0u) {
    if (processSpectralFreezeBranch(reverb_bus_l + start, reverb_bus_r + start, module_l, module_r, start, frames)) {
      const float live_gain = 1.0f - clampFloat(fx.spectral_freeze_reverb_crossfade, 0.0f, 1.0f);
      for (uint32_t i = 0; i < frames; ++i) {
        const uint32_t frame = start + i;
        reverb_bus_l[frame] = module_l[i] + reverb_bus_l[frame] * live_gain;
        reverb_bus_r[frame] = module_r[i] + reverb_bus_r[frame] * live_gain;
      }
    }
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  reverb_module->processPlanarStereo(reverb_bus_l + start, reverb_bus_r + start, module_l, module_r, static_cast<int>(frames));
  if (spectral_freeze_active && fx.spectral_freeze_routing == 1u) {
    if (processSpectralFreezeBranch(module_l, module_r, module_tap_l[0], module_tap_r[0], start, frames)) {
      for (uint32_t i = 0; i < frames; ++i) {
        module_l[i] = module_tap_l[0][i];
        module_r[i] = module_tap_r[0][i];
      }
    }
  }
  const float return_gain = fx.reverb_mix * kessho::product::generated::KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM;
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      graph_reverb_output_l[frame] = module_l[i] * return_gain;
      graph_reverb_output_r[frame] = module_r[i] * return_gain;
    }
  }
  mixFxBuffer(
      module_l,
      module_r,
      out_l,
      out_r,
      start,
      frames,
      return_gain,
      kSidechainReverb);
}
