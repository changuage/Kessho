import { runtimeWalkConfigChanged, runtimeWalkConfigFromState } from '../../CoreProductHostRuntimeGuards';
import { coreProductSequencerClockRejoinMask, type CoreProductSequencerClockRejoinMask } from '../../CoreProductHostSequencerClock';
import type { CoreProductHostSequencerChain } from '../../CoreProductHostSequencerChain';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import { SYNTH_EUCLIDEAN_LANE_COUNT } from '../../sequencerLaneCounts';
import type { SynthSequenceVariationBank } from '../../../ui/sequencer/synthSequenceVariations';
import { CoreProductAssetNotReadyError, type CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';
import type { CoreProductArrangementBridge } from './CoreProductArrangementBridge';
import type { CoreProductLeadPresetDataLoader } from './CoreProductLeadPresetDataLoader';
import type { CoreProductModulationRangeBridge } from './CoreProductModulationRangeBridge';
import { productSamplePlaybackTriggerCriticalChange } from './CoreProductSamplePlaybackChange';
import type { CoreProductPatchApplyReceipt, CoreProductStateApplyOptions } from './CoreProductStatePatchQueue';
import { CoreProductSynthSequenceVariationSynchronizer } from './CoreProductSynthSequenceVariationSynchronizer';

type HostStateApplyContext = {
  runtime: CoreProductRuntime;
  assetRegistrar: CoreProductAssetRegistrar;
  leadPresetDataLoader: CoreProductLeadPresetDataLoader;
  sequencerChain: CoreProductHostSequencerChain;
  modulationRangeBridge: CoreProductModulationRangeBridge;
  arrangementBridge: CoreProductArrangementBridge;
  latestSliderState: () => Record<string, unknown> | null;
  setLatestSliderState: (state: Record<string, unknown>) => void;
  adapterState: () => Record<string, unknown>;
  setAdapterState: (state: Record<string, unknown>) => void;
  setLatestProductSnapshot: (snapshot: CoreProductSnapshot) => void;
  runtimeReady: () => boolean;
  running: () => boolean;
  start: (state: Record<string, unknown>) => Promise<void>;
  applyLatestSnapshotUpdate: (reason: SnapshotReloadReason, mask: CoreProductSequencerClockRejoinMask, options?: CoreProductStateApplyOptions) => Promise<CoreProductPatchApplyReceipt>;
  createLatestSnapshot: () => CoreProductSnapshot;
  publishStateIfHarmonyChanged: () => void;
};

/** Applies resolved host state and serializes the variation banks it targets. */
export class CoreProductHostStateApplyCoordinator {
  private readonly variations = new CoreProductSynthSequenceVariationSynchronizer(SYNTH_EUCLIDEAN_LANE_COUNT);
  private sequencerTransportStartInFlight = false;
  private readonly variationRuntime = () => this.context.runtimeReady() && this.context.running() ? this.context.runtime : null;

  constructor(private readonly context: HostStateApplyContext) {}

  setVariationTargetsFromState(state: Record<string, unknown>): void {
    this.variations.setTargetsFromState(state.synthSequenceVariationBanks);
  }

  commitVariationBank(laneIndex: number, bank: SynthSequenceVariationBank | null): Promise<boolean> {
    return this.variations.commit(laneIndex, bank, this.variationRuntime);
  }

  syncVariations(): Promise<void> {
    // A preloaded/suspended runtime cannot produce an audio-boundary receipt.
    // Keep the target pending until the lifecycle is actually running.
    return this.variations.sync(this.variationRuntime);
  }

  replayVariations(): Promise<void> {
    return this.variations.replay(this.variationRuntime);
  }

  async apply(
    sliderState: Record<string, unknown>,
    fallbackReloadReason: SnapshotReloadReason,
    options?: CoreProductStateApplyOptions,
  ): Promise<CoreProductPatchApplyReceipt> {
    const host = this.context;
    const previousSliderState = host.latestSliderState();
    const previousWalkConfig = runtimeWalkConfigFromState(previousSliderState);
    host.setLatestSliderState(sliderState);
    this.setVariationTargetsFromState(sliderState);
    const nextWalkConfig = runtimeWalkConfigFromState(host.latestSliderState());
    const sequencerClockRejoinMask = coreProductSequencerClockRejoinMask(previousSliderState, sliderState);
    host.setAdapterState(host.leadPresetDataLoader.syncPresetData(sliderState, host.adapterState()));
    if (!host.running() && !this.sequencerTransportStartInFlight &&
        (sliderState.drumEuclidMasterEnabled === true || sliderState.synthEuclideanMasterEnabled === true)) {
      this.sequencerTransportStartInFlight = true;
      void host.start(sliderState)
        .catch((error) => {
          console.warn('Failed to start Product Core sequencer transport:', error);
        })
        .finally(() => {
          this.sequencerTransportStartInFlight = false;
        });
      return { applied: false, mode: 'deferred' };
    }
    const samplePlaybackCritical = host.running() &&
      productSamplePlaybackTriggerCriticalChange(previousSliderState, host.latestSliderState());
    host.assetRegistrar.updateRequiredAssetsForState();
    const shouldRefreshAssetsAndAck = host.runtimeReady() &&
      (host.assetRegistrar.hasMissingDefaultAssetsForState() || samplePlaybackCritical);
    let receipt: CoreProductPatchApplyReceipt;
    if (shouldRefreshAssetsAndAck) {
      const assetResult = await host.assetRegistrar.ensureDefaultAssetsForState();
      if (assetResult.status === 'not-ready') throw new CoreProductAssetNotReadyError(assetResult);
      receipt = await host.applyLatestSnapshotUpdate('asset-reference-change', sequencerClockRejoinMask, {
        ...options,
        triggerCritical: true,
        forceFullSnapshot: samplePlaybackCritical,
      });
    } else if (options?.applyMode === 'event') {
      host.setLatestProductSnapshot(host.createLatestSnapshot());
      host.sequencerChain.update(host.latestSliderState(), host.adapterState(), host.sequencerChain.active(host.latestSliderState(), host.adapterState()));
      receipt = { applied: true, mode: 'event' };
    } else {
      receipt = await host.applyLatestSnapshotUpdate(fallbackReloadReason, sequencerClockRejoinMask, options);
    }
    if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) host.modulationRangeBridge.flushRuntimeWalkRanges();
    if (host.running()) host.arrangementBridge.update(host.latestSliderState(), host.adapterState());
    await this.syncVariations();
    host.publishStateIfHarmonyChanged();
    return receipt;
  }
}
