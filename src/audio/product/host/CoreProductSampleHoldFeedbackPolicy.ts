const SAMPLE_HOLD_FEEDBACK_CALLBACKS = [
  'leadExpression',
  'leadMorph',
  'padMorph',
  'pad2Morph',
  'leadDistance',
  'padDistance',
  'pad2Distance',
  'sample1Distance',
  'sample2Distance',
  'drumMorph',
  'drumParamSH',
  'granularSH',
] as const;

export type CoreProductSampleHoldFeedbackCallbackLookup = (name: string) => boolean;

export function shouldPublishCoreProductSampleHoldFeedback(
  hasCallback?: CoreProductSampleHoldFeedbackCallbackLookup,
): boolean {
  if (!hasCallback) return true;
  return SAMPLE_HOLD_FEEDBACK_CALLBACKS.some((name) => hasCallback(name));
}
