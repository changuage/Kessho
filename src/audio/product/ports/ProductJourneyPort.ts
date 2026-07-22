import type { BackgroundJourneyPlan } from '../journey/compileBackgroundJourneyPlan';
import type { ProductStateRecord } from '../ProductEngineTypes';

export type ProductBackgroundJourneyReadiness =
  | { status: 'idle' }
  | { status: 'preparing'; uploadedEvents: number; totalEvents: number }
  | {
      status: 'ready';
      revision: number;
      preparedFrames: number;
      scheduleEntries: number;
      registeredAssetBytes: number;
    }
  | {
      status: 'not-ready';
      reason: 'document-hidden' | 'asset-closure-incomplete' | 'asset-soft-budget' | 'decode-peak-budget' | 'host-cache-budget' | 'asset-metadata-missing' | 'sample-rate-unavailable' | 'hard-budget' | 'release-failed' | 'runtime-unavailable' | 'upload-timeout' | 'runtime-error';
      registeredAssetBytes?: number;
      requiredBytes?: number;
      limitBytes?: number;
    };

export type ProductEngineJourneyPort = {
  prepareBackgroundJourney(plan: BackgroundJourneyPlan, states: readonly ProductStateRecord[]): Promise<ProductBackgroundJourneyReadiness>;
  startBackgroundJourney(revision: number): boolean;
  stopBackgroundJourney(): void;
  discardBackgroundJourney(): void;
  getBackgroundJourneyReadiness(): ProductBackgroundJourneyReadiness;
  estimateBackgroundJourneyAssets(states: readonly ProductStateRecord[]): { complete: boolean; decodedBytes: number; sharedAssetReuse: number };
};
