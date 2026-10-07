import type {
  ProductDrumTriggerCallback,
  ProductEvolveOverridesCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSequencerUiState,
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthNoteRangeEvolvedCallback,
  ProductSynthOrbitVisualStateCallback,
  ProductRecordedNoteCaptureBatch,
  ProductRecordedNoteCaptureRequest,
  ProductRecordedNoteCaptureSubscription,
} from '../ProductEngineTypes';
import type { SynthSequenceVariationBank } from '../../../ui/sequencer/synthSequenceVariations';

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
  subscribeRecordedNoteCapture(listener: (batch: ProductRecordedNoteCaptureBatch) => void): ReturnType<ProductRecordedNoteCaptureSubscription>;
  setRecordedNoteCapture(request: ProductRecordedNoteCaptureRequest): void;
  getRecordedNoteCaptureClockBeat(): number | null;
  commitSynthSequenceVariationBank(laneIndex: number, bank: SynthSequenceVariationBank | null): Promise<boolean>;
  getActiveSynthSequenceVariationIndices(): readonly (number | null)[];
  subscribeSynthSequenceVariationRuntime(listener: (indices: readonly (number | null)[]) => void): () => void;
};
