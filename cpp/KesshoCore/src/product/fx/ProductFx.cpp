#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::beginFxConfigurationBatch() {
  ++fx_configuration_batch_depth;
}

void KesshoProductEngine::endFxConfigurationBatch() {
  if (fx_configuration_batch_depth == 0u) return;
  --fx_configuration_batch_depth;
  if (fx_configuration_batch_depth != 0u) return;
  const uint32_t configure_mask = fx_configuration_pending_mask;
  fx_configuration_pending_mask = 0u;
  if (configure_mask != 0u) configureFxModules(configure_mask);
  if (soundscapes_module_params_dirty) configureSoundscapesModuleFromSource();
}

void KesshoProductEngine::renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  renderFxGraph(out_l, out_r, start, frames);
}

void KesshoProductEngine::configureFxModulesForRoute(uint8_t from, uint8_t to) {
  uint32_t group_mask = 0u;
  if (from == kFxNodeDelayA || to == kFxNodeDelayA) group_mask |= kFxConfigurationDelayA;
  if (from == kFxNodeDelayB || to == kFxNodeDelayB) group_mask |= kFxConfigurationDelayB;
  if (group_mask != 0u) configureFxModules(group_mask);
}

void KesshoProductEngine::retimeTempoSyncedFx(float previous_bpm) {
  configureSpectralFreezeModule();
  if (!std::isfinite(previous_bpm) || !std::isfinite(transport.bpm) ||
      previous_bpm <= 0.0f || transport.bpm <= 0.0f ||
      std::fabs(previous_bpm - transport.bpm) <= 0.0001f) {
    return;
  }
  const float tempo_ratio = previous_bpm / transport.bpm;
  fx.delay_a_time_left_ms = clampFloat(fx.delay_a_time_left_ms * tempo_ratio, 10.0f, 5000.0f);
  fx.delay_a_time_right_ms = clampFloat(fx.delay_a_time_right_ms * tempo_ratio, 10.0f, 5000.0f);
  fx.delay_b_base_time_ms = clampFloat(fx.delay_b_base_time_ms * tempo_ratio, 20.0f, 5000.0f);

  // A live tempo drag can produce many control events per second. Only publish
  // the three affected delay parameters instead of rebuilding every FX module.
  if (delay_a_module) {
    float* params = delay_a_module->params();
    if (params != nullptr && delay_a_module->paramCount() >= 3) {
      params[1] = fx.delay_a_time_left_ms;
      params[2] = fx.delay_a_time_right_ms;
      delay_a_module->commitParams();
    }
  }
  if (delay_b_module) {
    float* params = delay_b_module->params();
    if (params != nullptr && delay_b_module->paramCount() >= 4) {
      params[3] = fx.delay_b_base_time_ms;
      delay_b_module->commitParams();
    }
  }
}
