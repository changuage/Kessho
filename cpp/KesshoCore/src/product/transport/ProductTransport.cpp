#include "../KesshoProductEngineInternal.h"

void ProductTransport::reset() {
  sample_frame = 0;
}

double ProductTransport::samplesPerBeat(double sample_rate) const {
  return sample_rate * 60.0 / std::max(1.0f, bpm);
}
