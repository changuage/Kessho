#pragma once

#include "KesshoCore/KesshoProductSequencerVariations.h"

namespace kessho::product::internal {

// Validate the complete bank before a host mailbox reserves its only pending
// slot.  The render-thread normalizer remains the final authority; this
// shared preflight prevents an accepted native receipt from waiting forever
// on a bank the core cannot apply.
bool validateSequencerVariationBank(
    const KesshoProductSequencerVariationBank& bank);

} // namespace kessho::product::internal
