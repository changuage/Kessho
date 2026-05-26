#include "../KesshoProductEngineInternal.h"

namespace kessho::product::internal {

namespace {

uint32_t writeIntervals(int intervals[kMaxScaleNotes], const int* values, uint32_t count) {
  for (uint32_t i = 0u; i < count && i < kMaxScaleNotes; ++i) {
    intervals[i] = values[i];
  }
  return std::min(count, kMaxScaleNotes);
}

} // namespace

uint32_t scaleIntervals(uint32_t scale_id, int intervals[kMaxScaleNotes]) {
  static constexpr int major[] = {0, 2, 4, 5, 7, 9, 11};
  static constexpr int aeolian[] = {0, 2, 3, 5, 7, 8, 10};
  static constexpr int major_pentatonic[] = {0, 2, 4, 7, 9};
  static constexpr int octatonic_half_whole[] = {0, 1, 3, 4, 6, 7, 9, 10};
  static constexpr int lydian[] = {0, 2, 4, 6, 7, 9, 11};
  static constexpr int mixolydian[] = {0, 2, 4, 5, 7, 9, 10};
  static constexpr int minor_pentatonic[] = {0, 3, 5, 7, 10};
  static constexpr int dorian[] = {0, 2, 3, 5, 7, 9, 10};
  static constexpr int harmonic_minor[] = {0, 2, 3, 5, 7, 8, 11};
  static constexpr int melodic_minor[] = {0, 2, 3, 5, 7, 9, 11};
  static constexpr int phrygian_dominant[] = {0, 1, 4, 5, 7, 8, 10};
  switch (scale_id) {
    case 2:
      return writeIntervals(intervals, aeolian, 7u);
    case 3:
      return writeIntervals(intervals, major_pentatonic, 5u);
    case 4:
      return writeIntervals(intervals, octatonic_half_whole, 8u);
    case 5:
      return writeIntervals(intervals, lydian, 7u);
    case 6:
      return writeIntervals(intervals, mixolydian, 7u);
    case 7:
      return writeIntervals(intervals, minor_pentatonic, 5u);
    case 8:
      return writeIntervals(intervals, dorian, 7u);
    case 9:
      return writeIntervals(intervals, harmonic_minor, 7u);
    case 10:
      return writeIntervals(intervals, melodic_minor, 7u);
    case 11:
      return writeIntervals(intervals, phrygian_dominant, 7u);
    case 1:
    default:
      return writeIntervals(intervals, major, 7u);
  }
}

} // namespace kessho::product::internal
