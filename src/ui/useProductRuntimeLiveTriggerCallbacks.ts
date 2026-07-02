import type { MutableRefObject } from 'react';

import {
  useLiveTriggerUiCallbacks,
  type LiveTriggerActiveTab,
  type LiveTriggerUiMode,
} from './useLiveTriggerUiCallbacks';
import type { SliderState } from './state';

type ProductRuntimeLiveTriggerActiveTab = LiveTriggerActiveTab;
type ProductRuntimeLiveTriggerUiMode = LiveTriggerUiMode;

export type ProductRuntimeLiveTriggerCallbacksOptions = {
  activeTab: ProductRuntimeLiveTriggerActiveTab;
  setProductDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setProductDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setProductLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setProductLeadDistanceCallback: (callback: ((distance: { lead1: number; lead2: number }) => void) | null) => void;
  setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setProductLeadMorphCallback: (callback: ((morph: { lead1: number; lead2: number }) => void) | null) => void;
  setProductPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setProductPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setProductPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductSample1DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  setProductSample2DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  stateRef: MutableRefObject<SliderState>;
  uiMode: ProductRuntimeLiveTriggerUiMode;
};

export function useProductRuntimeLiveTriggerCallbacks({
  setProductDrumMorphTriggerCallback,
  setProductDrumParamSHTriggerCallback,
  setProductGranularSHTriggerCallback,
  setProductLeadDelayCallback,
  setProductLeadDistanceCallback,
  setProductLeadExpressionCallback,
  setProductLeadMorphCallback,
  setProductPad2DistanceTriggerCallback,
  setProductPad2MorphTriggerCallback,
  setProductPadDistanceTriggerCallback,
  setProductPadMorphTriggerCallback,
  setProductPianoDistanceTriggerCallback,
  setProductSample1DistanceTriggerCallback,
  setProductSample2DistanceTriggerCallback,
  ...options
}: ProductRuntimeLiveTriggerCallbacksOptions): void {
  useLiveTriggerUiCallbacks({
    ...options,
    setDrumMorphTriggerCallback: setProductDrumMorphTriggerCallback,
    setDrumParamSHTriggerCallback: setProductDrumParamSHTriggerCallback,
    setGranularSHTriggerCallback: setProductGranularSHTriggerCallback,
    setLeadDelayCallback: setProductLeadDelayCallback,
    setLeadDistanceCallback: setProductLeadDistanceCallback,
    setLeadExpressionCallback: setProductLeadExpressionCallback,
    setLeadMorphCallback: setProductLeadMorphCallback,
    setPad2DistanceTriggerCallback: setProductPad2DistanceTriggerCallback,
    setPad2MorphTriggerCallback: setProductPad2MorphTriggerCallback,
    setPadDistanceTriggerCallback: setProductPadDistanceTriggerCallback,
    setPadMorphTriggerCallback: setProductPadMorphTriggerCallback,
    setPianoDistanceTriggerCallback: setProductPianoDistanceTriggerCallback,
    setSample1DistanceTriggerCallback: setProductSample1DistanceTriggerCallback,
    setSample2DistanceTriggerCallback: setProductSample2DistanceTriggerCallback,
  });
}
