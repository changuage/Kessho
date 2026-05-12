#include "../KesshoProductEngineInternal.h"

namespace kessho::product::internal {

uint32_t scaleIntervals(uint32_t scale_id, int intervals[kMaxScaleNotes]) {
  switch (scale_id) {
    case 2:
      intervals[0] = 0;
      intervals[1] = 2;
      intervals[2] = 3;
      intervals[3] = 5;
      intervals[4] = 7;
      intervals[5] = 8;
      intervals[6] = 10;
      return 7;
    case 3:
      intervals[0] = 0;
      intervals[1] = 2;
      intervals[2] = 4;
      intervals[3] = 7;
      intervals[4] = 9;
      return 5;
    case 4:
      intervals[0] = 0;
      intervals[1] = 1;
      intervals[2] = 5;
      intervals[3] = 7;
      intervals[4] = 8;
      return 5;
    case 1:
    default:
      intervals[0] = 0;
      intervals[1] = 2;
      intervals[2] = 4;
      intervals[3] = 5;
      intervals[4] = 7;
      intervals[5] = 9;
      intervals[6] = 11;
      return 7;
  }
}

} // namespace kessho::product::internal
