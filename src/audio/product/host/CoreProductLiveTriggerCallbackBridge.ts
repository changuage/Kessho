import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

type CoreProductLiveTriggerCallbackName =
  | 'leadExpression'
  | 'leadMorph'
  | 'padMorph'
  | 'pad2Morph'
  | 'leadDistance'
  | 'padDistance'
  | 'pad2Distance'
  | 'pianoDistance'
  | 'leadDelay'
  | 'drumMorph'
  | 'drumParamSH'
  | 'granularSH';

const CORE_PRODUCT_LIVE_TRIGGER_CALLBACK_METHODS: Record<CoreProductLiveTriggerCallbackName, string> = {
  leadExpression: 'setLeadExpressionCallback',
  leadMorph: 'setLeadMorphCallback',
  padMorph: 'setPadMorphTriggerCallback',
  pad2Morph: 'setPad2MorphTriggerCallback',
  leadDistance: 'setLeadDistanceCallback',
  padDistance: 'setPadDistanceTriggerCallback',
  pad2Distance: 'setPad2DistanceTriggerCallback',
  pianoDistance: 'setPianoDistanceTriggerCallback',
  leadDelay: 'setLeadDelayCallback',
  drumMorph: 'setDrumMorphTriggerCallback',
  drumParamSH: 'setDrumParamSHTriggerCallback',
  granularSH: 'setGranularSHTriggerCallback',
};

// TODO(product-core-burn-down): keep this host callback-name bridge temporary.
// Live source/FX telemetry should become product-owned callback channels or
// ProductEvents instead of WebProductEngine carrying host method strings.
export function setCoreProductLiveTriggerCallback(
  callHost: CoreProductHostMethodCall,
  name: CoreProductLiveTriggerCallbackName,
  callback: unknown,
): void {
  callHost<void>(CORE_PRODUCT_LIVE_TRIGGER_CALLBACK_METHODS[name], callback);
}
