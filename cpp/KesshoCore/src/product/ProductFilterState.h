#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

struct BiquadState {
  float x1 = 0.0f, x2 = 0.0f, y1 = 0.0f, y2 = 0.0f;
};

struct ProductBiquadLowpassState {
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
  BiquadState left{}, right{};
};

enum ProductBiquadFilterType : uint32_t {
  kProductBiquadLowpass = 0u,
  kProductBiquadHighpass = 1u,
};

struct ProductBiquadFilterState {
  float coeff_cutoff = -1.0f;
  uint32_t coeff_type = kProductBiquadLowpass;
  float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
  BiquadState left{}, right{};
};

struct ProductEqBiquadState {
  float coeff_freq = -1.0f;
  float coeff_gain_db = 0.0f;
  float coeff_q = -1.0f;
  float coeff_slope = -1.0f;
  uint32_t coeff_type = kDynamicsEqEdgeBell;
  float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
  BiquadState left{}, right{};
};

struct ProductTerminalEqState {
  ProductEqBiquadState low{};
  ProductEqBiquadState mid{};
  ProductEqBiquadState high{};
};

struct SourcePostChainState {
  float post_lpf_hz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
  float stereo_width = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
  BiquadState stage1_left{}, stage1_right{}, stage2_left{}, stage2_right{};
};

struct PadPostChainState : SourcePostChainState {
  PadPostChainState() { post_lpf_hz = kDefaultPadPostLpfHz; stereo_width = kDefaultPadStereoWidth; }
};

struct LeadPostChainState : SourcePostChainState {
  LeadPostChainState() { post_lpf_hz = kDefaultLeadPostLpfHz; stereo_width = kDefaultLeadStereoWidth; }
};

} // namespace kessho::product::internal
