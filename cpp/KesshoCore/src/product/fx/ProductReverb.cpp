#include "../KesshoProductEngineInternal.h"

namespace {
constexpr float kReverbWashDecayPerVisualFrame = 0.92f;
constexpr float kReverbBloomDecayPerVisualFrame = 0.95f;
constexpr float kReverbBoostEpsilon = 0.001f;
} // namespace

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

  const bool boost_active_before_decay = reverb_wash_boost > kReverbBoostEpsilon ||
      reverb_bloom_boost > kReverbBoostEpsilon || triggered;
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
  const bool boost_active_after_decay = reverb_wash_boost > kReverbBoostEpsilon ||
      reverb_bloom_boost > kReverbBoostEpsilon;
  reverb_harmony_boost_active_last_block = boost_active_after_decay ||
      (boost_active_before_decay && !boost_active_after_decay);
}

bool KesshoProductEngine::prepareReverbInput(uint32_t start, uint32_t frames) {
  const bool spectral_freeze_enabled =
      fx.spectral_freeze_enabled && fx.spectral_freeze_mix > 0.0f;
  const bool degrade_send_active = routing.reverb_to_degrade > 0.0001f && routing.degrade_to_reverb <= 0.0001f;
  const bool reverb_active =
      reverb_module != nullptr && frames > 0u &&
      (fx_graph_rendering || !(fx.reverb_mix <= 0.0f) || degrade_send_active || spectral_freeze_enabled);
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
    return false;
  }
  processReverbPreconditioner(start, frames, reverb_input_peak);
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      graph_reverb_preconditioner_output_l[frame] = reverb_bus_l[frame];
      graph_reverb_preconditioner_output_r[frame] = reverb_bus_r[frame];
    }
  }
  return true;
}

void KesshoProductEngine::renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (reverb_module == nullptr || frames == 0u) {
    return;
  }
  const bool degrade_send_active = routing.reverb_to_degrade > 0.0001f && routing.degrade_to_reverb <= 0.0001f;
  reverb_module->processPlanarStereo(reverb_bus_l + start, reverb_bus_r + start, module_l, module_r, static_cast<int>(frames));
  const float reverb_output_trim = kessho::product::generated::KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM;
  const float return_gain = fx.reverb_mix * reverb_output_trim;
  const float degrade_gain = routing.reverb_to_degrade * kessho::product::generated::KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM;
  if (fx_graph_rendering) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowReverb, transport.sample_frame + i);
      fx_node_output_l[kFxNodeReverb][frame] = module_l[i] * reverb_output_trim * mute_gain;
      fx_node_output_r[kFxNodeReverb][frame] = module_r[i] * reverb_output_trim * mute_gain;
      if (graph_taps_enabled) {
        graph_reverb_output_l[frame] = fx_node_output_l[kFxNodeReverb][frame] * fx.reverb_mix;
        graph_reverb_output_r[frame] = fx_node_output_r[kFxNodeReverb][frame] * fx.reverb_mix;
      }
    }
    return;
  }
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      graph_reverb_output_l[frame] = module_l[i] * return_gain;
      graph_reverb_output_r[frame] = module_r[i] * return_gain;
    }
  }
  if (degrade_send_active) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowReverb, transport.sample_frame + i);
      degrade_bus_l[frame] += module_l[i] * degrade_gain * mute_gain;
      degrade_bus_r[frame] += module_r[i] * degrade_gain * mute_gain;
    }
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowReverb, transport.sample_frame + i);
    const float left = module_l[i] * return_gain * mute_gain;
    const float right = module_r[i] * return_gain * mute_gain;
    routeTerminalSample(routing.dynamics_routes[kDynamicsRouteReverb], out_l, out_r, frame, left, right);
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
    }
  }
}
