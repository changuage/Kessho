#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::resetGranularPhraseRuntime() {
  granular_last_phrase_index = 0u;
  granular_phrase_runtime_initialized = false;
}

void KesshoProductEngine::advanceGranularPhraseReseed() {
  if (granular_module == nullptr || !transport.running || sample_rate <= 0.0) return;
  const uint64_t phrase = transport.phraseIndex(sample_rate);
  if (!granular_phrase_runtime_initialized) {
    granular_phrase_runtime_initialized = true;
    granular_last_phrase_index = phrase;
    return;
  }
  if (phrase == granular_last_phrase_index) return;
  granular_last_phrase_index = phrase;
  granular_module->setRandomSeed(rng_state);
}
