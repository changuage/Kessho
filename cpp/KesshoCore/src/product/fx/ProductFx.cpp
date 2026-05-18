#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!modules_ready || frames == 0u) {
    return;
  }
  const bool granular_feeds_delay =
      routing.granular_to_delay_a > 0.0001f || routing.granular_to_delay_b > 0.0001f;
  const bool delay_feeds_granular =
      routing.delay_a_to_granular > 0.0001f || routing.delay_b_to_granular > 0.0001f;
  if (granular_feeds_delay && !delay_feeds_granular) {
    renderGranular(out_l, out_r, start, frames);
    renderDelayModule(delay_a_module.get(), delay_a_bus_l, delay_a_bus_r, delay_b_bus_l, delay_b_bus_r, out_l, out_r, start, frames);
    renderDelayModule(delay_b_module.get(), delay_b_bus_l, delay_b_bus_r, delay_a_bus_l, delay_a_bus_r, out_l, out_r, start, frames);
  } else {
    renderDelayModule(delay_a_module.get(), delay_a_bus_l, delay_a_bus_r, delay_b_bus_l, delay_b_bus_r, out_l, out_r, start, frames);
    renderDelayModule(delay_b_module.get(), delay_b_bus_l, delay_b_bus_r, delay_a_bus_l, delay_a_bus_r, out_l, out_r, start, frames);
    renderGranular(out_l, out_r, start, frames);
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    delay_a_cross_carry_l[i] = graph_delay_b_to_delay_a_send_l[frame];
    delay_a_cross_carry_r[i] = graph_delay_b_to_delay_a_send_r[frame];
  }
  renderReverb(out_l, out_r, start, frames);
}
