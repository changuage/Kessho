#include "KesshoCore/KesshoCore.h"

#include <algorithm>
#include <cmath>
#include <new>

namespace kessho::core {

class Mixer {
public:
  Mixer() {
    clearRoutes();
  }

  void clearRoutes() {
    for (KesshoMixerRoute& route : routes_) {
      route = {};
    }
    route_slots_ = 0;
  }

  bool setRoute(uint32_t route_index, const KesshoMixerRoute& route) {
    if (route_index >= KESSHO_MIXER_MAX_ROUTES ||
        route.source_bus >= KESSHO_MIXER_MAX_INPUT_BUSES ||
        route.target_bus >= KESSHO_MIXER_MAX_OUTPUT_BUSES ||
        !std::isfinite(route.gain_l) ||
        !std::isfinite(route.gain_r)) {
      return false;
    }

    routes_[route_index] = route;
    route_slots_ = std::max(route_slots_, route_index + 1);
    return true;
  }

  bool getRoute(uint32_t route_index, KesshoMixerRoute& route) const {
    if (route_index >= KESSHO_MIXER_MAX_ROUTES) {
      return false;
    }

    route = routes_[route_index];
    return true;
  }

  void fillStats(KesshoMixerStats& stats) const {
    stats.route_slots = route_slots_;
    stats.active_routes = activeRouteCount();
  }

  bool processPlanarStereo(
      const float* const* input_l,
      const float* const* input_r,
      uint32_t input_bus_count,
      float* const* output_l,
      float* const* output_r,
      uint32_t output_bus_count,
      int frames) const {
    if (input_l == nullptr || input_r == nullptr || output_l == nullptr || output_r == nullptr ||
        frames <= 0 ||
        input_bus_count > KESSHO_MIXER_MAX_INPUT_BUSES ||
        output_bus_count > KESSHO_MIXER_MAX_OUTPUT_BUSES) {
      return false;
    }

    for (uint32_t bus = 0; bus < input_bus_count; ++bus) {
      if (input_l[bus] == nullptr || input_r[bus] == nullptr) {
        return false;
      }
    }

    for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
      if (output_l[bus] == nullptr || output_r[bus] == nullptr) {
        return false;
      }
    }

    if (hasUnsafeOutputAlias(input_l, input_r, input_bus_count, output_l, output_r, output_bus_count)) {
      return false;
    }

    for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
      std::fill(output_l[bus], output_l[bus] + frames, 0.0f);
      std::fill(output_r[bus], output_r[bus] + frames, 0.0f);
    }

    for (uint32_t route_index = 0; route_index < route_slots_; ++route_index) {
      const KesshoMixerRoute& route = routes_[route_index];
      if (route.enabled == 0 ||
          route.source_bus >= input_bus_count ||
          route.target_bus >= output_bus_count) {
        continue;
      }

      const float* source_l = input_l[route.source_bus];
      const float* source_r = input_r[route.source_bus];
      float* target_l = output_l[route.target_bus];
      float* target_r = output_r[route.target_bus];
      const float gain_l = route.gain_l;
      const float gain_r = route.gain_r;

      for (int frame = 0; frame < frames; ++frame) {
        target_l[frame] += source_l[frame] * gain_l;
        target_r[frame] += source_r[frame] * gain_r;
      }
    }

    return true;
  }

private:
  KesshoMixerRoute routes_[KESSHO_MIXER_MAX_ROUTES]{};
  uint32_t route_slots_ = 0;

  bool hasUnsafeOutputAlias(
      const float* const* input_l,
      const float* const* input_r,
      uint32_t input_bus_count,
      float* const* output_l,
      float* const* output_r,
      uint32_t output_bus_count) const {
    for (uint32_t output_bus = 0; output_bus < output_bus_count; ++output_bus) {
      if (output_l[output_bus] == output_r[output_bus]) {
        return true;
      }

      for (uint32_t other_output_bus = output_bus + 1; other_output_bus < output_bus_count; ++other_output_bus) {
        if (output_l[output_bus] == output_l[other_output_bus] ||
            output_l[output_bus] == output_r[other_output_bus] ||
            output_r[output_bus] == output_l[other_output_bus] ||
            output_r[output_bus] == output_r[other_output_bus]) {
          return true;
        }
      }

      for (uint32_t input_bus = 0; input_bus < input_bus_count; ++input_bus) {
        if (output_l[output_bus] == input_l[input_bus] ||
            output_l[output_bus] == input_r[input_bus] ||
            output_r[output_bus] == input_l[input_bus] ||
            output_r[output_bus] == input_r[input_bus]) {
          return true;
        }
      }
    }

    return false;
  }

  uint32_t activeRouteCount() const {
    uint32_t count = 0;
    for (uint32_t route_index = 0; route_index < route_slots_; ++route_index) {
      if (routes_[route_index].enabled != 0) {
        ++count;
      }
    }
    return count;
  }
};

} // namespace kessho::core

struct KesshoMixer {
  kessho::core::Mixer impl;
};

KesshoMixer* kessho_mixer_create(void) {
  return new (std::nothrow) KesshoMixer{};
}

void kessho_mixer_destroy(KesshoMixer* mixer) {
  delete mixer;
}

void kessho_mixer_clear_routes(KesshoMixer* mixer) {
  if (mixer == nullptr) {
    return;
  }

  mixer->impl.clearRoutes();
}

int kessho_mixer_set_route(KesshoMixer* mixer, uint32_t route_index, const KesshoMixerRoute* route) {
  if (mixer == nullptr || route == nullptr) {
    return 0;
  }

  return mixer->impl.setRoute(route_index, *route) ? 1 : 0;
}

int kessho_mixer_get_route(KesshoMixer* mixer, uint32_t route_index, KesshoMixerRoute* route) {
  if (mixer == nullptr || route == nullptr) {
    return 0;
  }

  return mixer->impl.getRoute(route_index, *route) ? 1 : 0;
}

int kessho_mixer_get_stats(KesshoMixer* mixer, KesshoMixerStats* stats) {
  if (mixer == nullptr || stats == nullptr) {
    return 0;
  }

  mixer->impl.fillStats(*stats);
  return 1;
}

int kessho_mixer_process_planar_stereo(
    KesshoMixer* mixer,
    const float* const* input_l,
    const float* const* input_r,
    uint32_t input_bus_count,
    float* const* output_l,
    float* const* output_r,
    uint32_t output_bus_count,
    int frames) {
  if (mixer == nullptr) {
    return 0;
  }

  return mixer->impl.processPlanarStereo(
      input_l,
      input_r,
      input_bus_count,
      output_l,
      output_r,
      output_bus_count,
      frames)
      ? 1
      : 0;
}
