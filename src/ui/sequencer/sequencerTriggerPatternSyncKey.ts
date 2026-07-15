type SequencerTriggerPatternModel = {
  trigger: {
    pattern: readonly boolean[];
  };
};

/**
 * Stable audio-sync key for the only SequencerState data consumed by Product
 * play-pattern resolution. Timing and visual model fields are intentionally
 * excluded so those edits cannot cause a destructive step-payload rebuild.
 */
export function sequencerTriggerPatternSyncKey(
  models: readonly SequencerTriggerPatternModel[],
): string {
  return JSON.stringify(models.map((model) => model.trigger.pattern));
}
