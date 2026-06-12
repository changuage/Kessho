#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::resetSonicParityFxRuntime() {
  control_event_count = 0;
  sequencer_events.clear();
  for (Voice& voice : voices) {
    voice = {};
  }
  active_voice_count = 0u;
  active_source_mask = 0u;
  active_voice_list_dirty = true;
  pad_voice_cursors[0] = 0;
  pad_voice_cursors[1] = 0;
  clearPadVoiceReleases(0u);
  if (delay_a_module) {
    delay_a_module->reset();
  }
  if (delay_b_module) {
    delay_b_module->reset();
  }
  if (reverb_module) {
    reverb_module->reset();
  }
  if (granular_module) {
    granular_module->reset();
  }
  if (spectral_freeze_module) {
    spectral_freeze_module->reset();
  }
  if (dynamics_drift_module) {
    dynamics_drift_module->reset();
  }
  if (dynamics_degrade_send_module) {
    dynamics_degrade_send_module->reset();
  }
  if (soundscapes_module) {
    soundscapes_module->reset();
    soundscapes_module_params_configured = false;
  }
  granular_output_lpf = {};
  granular_reverb_lpf = {};
  granular_reverb_comp_gain = 1.0f;
  reverb_pre_comp_gain = 1.0f;
  resetReverbHarmonyCoupling();
  resetGranularPhraseRuntime();
  std::fill(delay_a_cross_carry_l, delay_a_cross_carry_l + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  std::fill(delay_a_cross_carry_r, delay_a_cross_carry_r + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  resetSidechainRuntime();
  resetDiffuseRuntime();
  configureFxModules();
  configureSoundscapesModuleFromSource();
}
