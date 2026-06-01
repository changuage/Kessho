#pragma once

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kSequencerPitchBindingHit = 0u;
constexpr uint32_t kSequencerPitchBindingStep = 1u;
constexpr uint32_t kSequencerPitchModeSemitones = 0u;
constexpr uint32_t kSequencerPitchModeNotes = 1u;
constexpr uint32_t kSequencerPitchModeNoteRange = 2u;
constexpr uint32_t kSequencerPitchScaleChromatic = 0u;
constexpr uint32_t kSequencerPitchScaleMajor = 1u;
constexpr uint32_t kSequencerPitchScaleMinor = 2u;
constexpr uint32_t kSequencerPitchScaleCount = 19u;

} // namespace kessho::product::internal
