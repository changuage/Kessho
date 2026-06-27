import type {
  ProductDrumTriggerCallback,
  ProductEvolveOverridesCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSequencerUiState,
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthNoteRangeEvolvedCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../ProductEngineTypes';

export type ProductEngineSequencerPort = {
  getSequencerUiState(): ProductSequencerUiState | null;
  setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void;
  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void;
  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void;
  setSynthOrbitVisualStateCallback(callback: ProductSynthOrbitVisualStateCallback | null): void;
  setSynthAnchorWalkerVisualStateCallback(callback: ProductSynthAnchorWalkerVisualStateCallback | null): void;
  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void;
  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void;
  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void;
  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void;
  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void;
};
