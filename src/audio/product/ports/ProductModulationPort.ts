import type {
  ProductDrumMorphCallback,
  ProductDrumParamSampleHoldCallback,
  ProductDrumVoice,
  ProductLeadDelayCallback,
  ProductLeadExpressionCallback,
  ProductLeadPairCallback,
  ProductRange,
  ProductRangeMap,
  ProductRuntimeWalkPositionsCallback,
  ProductScalarCallback,
} from '../ProductEngineTypes';

export type ProductEngineModulationPort = {
  setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void;
  setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void;
  setDrumParamSHRange(key: string, range: ProductRange | null): void;
  setDualRanges(ranges: ProductRangeMap): void;
  setRuntimeWalkRanges(ranges: ProductRangeMap): void;
  setLeadExpressionCallback(callback: ProductLeadExpressionCallback | null): void;
  setLeadMorphCallback(callback: ProductLeadPairCallback | null): void;
  setPadMorphTriggerCallback(callback: ProductScalarCallback | null): void;
  setPad2MorphTriggerCallback(callback: ProductScalarCallback | null): void;
  setLeadDistanceCallback(callback: ProductLeadPairCallback | null): void;
  setPadDistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setPad2DistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setPianoDistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setSample1DistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setSample2DistanceTriggerCallback(callback: ProductScalarCallback | null): void;
  setLeadDelayCallback(callback: ProductLeadDelayCallback | null): void;
  setDrumMorphTriggerCallback(callback: ProductDrumMorphCallback | null): void;
  setDrumParamSHTriggerCallback(callback: ProductDrumParamSampleHoldCallback | null): void;
  setGranularSHTriggerCallback(callback: ProductRuntimeWalkPositionsCallback | null): void;
  setGranularUiActive(active: boolean): void;
  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void;
  startJourneyMorphClock(): void;
  stopJourneyMorphClock(): void;
};
