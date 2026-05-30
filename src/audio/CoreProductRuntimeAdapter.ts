import type { CoreProductEvent } from './coreProductEvents';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductHarmonyControlClearManualIntentEvent, createCoreProductHarmonyControlSetManualIntentEvent, createCoreProductHarmonySequenceSetEnabledEvent, createCoreProductHarmonySequenceSetStepEvent, createCoreProductHarmonySlotSetEvent, createCoreProductJourneyStateEvent, createCoreProductParamEvent, createCoreProductSequencerLaneParamEvent, createCoreProductSourceOverrideCommitEvent, createCoreProductSourceOverrideSlotEvent, createCoreProductSourcePresetEvent } from './coreProductEvents';
import { usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from './coreProductSnapshot';
import { appendCoreProductSourcePresetEndpointDiffs, canApplyCoreProductSourcePresetEndpointIdDiff, coreProductSourcePresetEndpointIdsChanged } from './CoreProductRuntimeAdapterSourcePresets';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { KESSHO_PRODUCT_PARAM_IDS, KESSHO_PRODUCT_PARAMS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_DRUM_PARAM_COUNT, KESSHO_PRODUCT_LEAD_PARAM_COUNT, KESSHO_PRODUCT_PAD_PARAM_COUNT } from './generated/kesshoProductSchema';
import { HARMONY_QUALITY_IDS, type HarmonyChordQuality } from './CoreProductHarmonyControl';

export const MAX_SNAPSHOT_DIFF_EVENTS = 384;

export type SnapshotReloadReason =
  | 'none' | 'initial-snapshot' | 'runtime-start' | 'runtime-bootstrap' | 'manual-piano-asset' | 'explicit-reset-request' | 'asset-reference-change' | 'asset-reference-level-change' | 'soundscape-param-change' | 'harmony-mode-change' | 'source-structure-change' | 'pad-override-change' | 'lead-override-change' | 'drum-override-change' | 'sequencer-structure-change' | 'dirty-diff-event-budget' | 'product-patch';

type SequencerKind = 'synth' | 'drum';
type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];
type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];
type SnapshotScalar = number | boolean;

export type CoreProductSnapshotDiffOptions = { forwardRngDiffs?: boolean; forceSequencerClockRejoin?: boolean };

export type CoreProductSnapshotDiffResult = { applied: true; events: CoreProductEvent[] } | { applied: false; reason: SnapshotReloadReason };

export function shouldForwardCoreProductRngDiffs(latestSliderState: Record<string, unknown> | null, latestTelemetry: CoreProductTelemetrySnapshot | null): boolean {
  if (!latestSliderState) return false;
  if (Object.prototype.hasOwnProperty.call(latestSliderState, 'rngSeed')) return true;
  if (Object.prototype.hasOwnProperty.call(latestSliderState, 'rngState')) return true;
  if (usesLegacyGranularRuntimeSeed(latestSliderState)) return true;
  return !latestTelemetry && Object.prototype.hasOwnProperty.call(latestSliderState, 'seed');
}

class CoreProductRuntimeAdapter {
  buildSnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot, options: CoreProductSnapshotDiffOptions = {}): CoreProductSnapshotDiffResult {
    if (!this.canApplySnapshotDiff(previous, next)) {
      return { applied: false, reason: this.classifySnapshotReloadReason(previous, next) };
    }

    const events: CoreProductEvent[] = [];
    this.appendTransportDiffs(events, previous, next);
    this.appendHarmonyDiffs(events, previous, next);
    this.appendJourneyDiffs(events, previous, next);
    this.appendSourceParamDiffs(events, previous.sources, next.sources);
    appendCoreProductSourcePresetEndpointDiffs(events, previous.sources, next.sources);
    this.appendSourceOverrideDiffs(events, previous.sources, next.sources);
    this.appendSequencerLaneDiffs(events, 'synth', previous.synthLanes, next.synthLanes, options.forceSequencerClockRejoin === true);
    this.appendSequencerLaneDiffs(events, 'drum', previous.drumLanes, next.drumLanes, options.forceSequencerClockRejoin === true);
    this.appendFxRoutingMasterDiffs(events, previous, next);
    this.appendEvolutionDiffs(events, previous, next);
    this.appendRngDiffs(events, previous, next, options.forwardRngDiffs === true);

    if (events.length > MAX_SNAPSHOT_DIFF_EVENTS) {
      return { applied: false, reason: 'dirty-diff-event-budget' };
    }
    return { applied: true, events };
  }

  private classifySnapshotReloadReason(previous: CoreProductSnapshot, next: CoreProductSnapshot): SnapshotReloadReason {
    const soundscapeFadeCanCoverAssetRemoval = this.soundscapeFadeCanCoverAssetRemoval(previous, next);
    if (!soundscapeFadeCanCoverAssetRemoval && this.assetRefsChanged(previous.assetRefs, next.assetRefs)) return 'asset-reference-change';
    if (!soundscapeFadeCanCoverAssetRemoval && this.assetRefLevelsChanged(previous.assetRefLevels, next.assetRefLevels)) return 'asset-reference-level-change';
    if (!soundscapeFadeCanCoverAssetRemoval && this.soundscapeSnapshotChanged(previous, next)) return 'soundscape-param-change';
    if (previous.harmony.chordMode !== next.harmony.chordMode) return 'harmony-mode-change';
    if (previous.harmony.voicingMode !== next.harmony.voicingMode) return 'harmony-mode-change';
    if (previous.sources.length !== next.sources.length) return 'source-structure-change';
    for (let index = 0; index < next.sources.length; index += 1) {
      const previousSource = previous.sources[index];
      const nextSource = next.sources[index];
      if (!previousSource || !nextSource) return 'source-structure-change';
      if (previousSource.sourceId !== nextSource.sourceId) return 'source-structure-change';
      if (previousSource.assetId !== nextSource.assetId) return 'source-structure-change';
      if (this.legacyExactBridgeFieldsPresent(previousSource) || this.legacyExactBridgeFieldsPresent(nextSource)) return 'source-structure-change';
      if (coreProductSourcePresetEndpointIdsChanged(previousSource, nextSource) && !canApplyCoreProductSourcePresetEndpointIdDiff(previousSource, nextSource)) return 'source-structure-change';
      const soundscapeFadeCanCoverPatchRemoval =
        soundscapeFadeCanCoverAssetRemoval && nextSource.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape;
      if (!soundscapeFadeCanCoverPatchRemoval) {
        if (this.padOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'pad-override-change';
        if (this.leadOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'lead-override-change';
        if (this.drumOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return 'drum-override-change';
      }
    }
    if (!this.canApplyLaneDiffs(previous.synthLanes, next.synthLanes)) return 'sequencer-structure-change';
    if (!this.canApplyLaneDiffs(previous.drumLanes, next.drumLanes)) return 'sequencer-structure-change';
    return 'product-patch';
  }

  private canApplySnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean {
    const soundscapeFadeCanCoverAssetRemoval = this.soundscapeFadeCanCoverAssetRemoval(previous, next);
    if (!soundscapeFadeCanCoverAssetRemoval && this.assetRefsChanged(previous.assetRefs, next.assetRefs)) return false;
    if (!soundscapeFadeCanCoverAssetRemoval && this.assetRefLevelsChanged(previous.assetRefLevels, next.assetRefLevels)) return false;
    if (!soundscapeFadeCanCoverAssetRemoval && this.soundscapeSnapshotChanged(previous, next)) return false;
    if (previous.harmony.chordMode !== next.harmony.chordMode) return false;
    if (previous.harmony.voicingMode !== next.harmony.voicingMode) return false;
    if (previous.sources.length !== next.sources.length) return false;
    for (let index = 0; index < next.sources.length; index += 1) {
      const previousSource = previous.sources[index];
      const nextSource = next.sources[index];
      if (!previousSource || !nextSource) return false;
      if (previousSource.sourceId !== nextSource.sourceId) return false;
      if (previousSource.assetId !== nextSource.assetId) return false;
      if (this.legacyExactBridgeFieldsPresent(previousSource) || this.legacyExactBridgeFieldsPresent(nextSource)) return false;
      if (coreProductSourcePresetEndpointIdsChanged(previousSource, nextSource) && !canApplyCoreProductSourcePresetEndpointIdDiff(previousSource, nextSource)) return false;
      const soundscapeFadeCanCoverPatchRemoval =
        soundscapeFadeCanCoverAssetRemoval && nextSource.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape;
      if (!soundscapeFadeCanCoverPatchRemoval) {
        if (this.padOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return false;
        if (this.leadOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return false;
        if (this.drumOverrideChanged(previousSource, nextSource) && !this.canApplySourceOverrideDiff(previousSource, nextSource)) return false;
      }
    }
    return this.canApplyLaneDiffs(previous.synthLanes, next.synthLanes) &&
      this.canApplyLaneDiffs(previous.drumLanes, next.drumLanes);
  }

  private legacyExactBridgeFieldsPresent(source: ProductSourceSnapshot): boolean {
    const sourceShape = source as unknown as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(sourceShape, 'exactPadParamCount') ||
      Object.prototype.hasOwnProperty.call(sourceShape, 'exactPadParams') ||
      Object.prototype.hasOwnProperty.call(sourceShape, 'exactLeadParamCount') ||
      Object.prototype.hasOwnProperty.call(sourceShape, 'exactLeadParams') ||
      Object.prototype.hasOwnProperty.call(sourceShape, 'exactDrumParamCount') ||
      Object.prototype.hasOwnProperty.call(sourceShape, 'exactDrumParams');
  }

  private padOverrideChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    const padSource =
      previous.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 ||
      previous.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2 ||
      next.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 ||
      next.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2;
    if (!padSource) return false;
    if (previous.padOverrideCount !== next.padOverrideCount) return true;
    for (let slot = 0; slot < next.padOverrideCount; slot += 1) {
      if ((previous.padOverrideIndices[slot] ?? 0) !== (next.padOverrideIndices[slot] ?? 0)) return true;
      if (this.valuesDiffer(previous.padOverrideValues[slot] ?? 0, next.padOverrideValues[slot] ?? 0)) return true;
    }
    return false;
  }

  private leadOverrideChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    const leadSource =
      previous.sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 ||
      previous.sourceId === CORE_PRODUCT_SOURCE_IDS.lead2 ||
      next.sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 ||
      next.sourceId === CORE_PRODUCT_SOURCE_IDS.lead2;
    if (!leadSource) return false;
    if (previous.leadOverrideCount !== next.leadOverrideCount) return true;
    for (let slot = 0; slot < next.leadOverrideCount; slot += 1) {
      if ((previous.leadOverrideIndices[slot] ?? 0) !== (next.leadOverrideIndices[slot] ?? 0)) return true;
      if (this.valuesDiffer(previous.leadOverrideValues[slot] ?? 0, next.leadOverrideValues[slot] ?? 0)) return true;
    }
    return false;
  }

  private drumOverrideChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    if (previous.sourceId !== CORE_PRODUCT_SOURCE_IDS.drum && next.sourceId !== CORE_PRODUCT_SOURCE_IDS.drum) return false;
    if (previous.drumOverrideCount !== next.drumOverrideCount) return true;
    for (let slot = 0; slot < next.drumOverrideCount; slot += 1) {
      if ((previous.drumOverrideIndices[slot] ?? 0) !== (next.drumOverrideIndices[slot] ?? 0)) return true;
      if (this.valuesDiffer(previous.drumOverrideValues[slot] ?? 0, next.drumOverrideValues[slot] ?? 0)) return true;
    }
    return false;
  }

  private canApplySourceOverrideDiff(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    if (previous.sourceId !== next.sourceId) return false;
    switch (next.sourceId) {
      case CORE_PRODUCT_SOURCE_IDS.pad1:
      case CORE_PRODUCT_SOURCE_IDS.pad2:
        return next.sourcePresetAId > 0 &&
          next.sourcePresetBId > 0 &&
          this.overrideBlockValid(next.padOverrideCount, next.padOverrideIndices, next.padOverrideValues, KESSHO_PRODUCT_PAD_PARAM_COUNT);
      case CORE_PRODUCT_SOURCE_IDS.lead1:
      case CORE_PRODUCT_SOURCE_IDS.lead2:
        return next.sourcePresetAId > 0 &&
          next.sourcePresetBId > 0 &&
          this.overrideBlockValid(next.leadOverrideCount, next.leadOverrideIndices, next.leadOverrideValues, KESSHO_PRODUCT_LEAD_PARAM_COUNT);
      case CORE_PRODUCT_SOURCE_IDS.drum:
        return next.presetId > 0 &&
          this.overrideBlockValid(next.drumOverrideCount, next.drumOverrideIndices, next.drumOverrideValues, KESSHO_PRODUCT_DRUM_PARAM_COUNT);
      default:
        return false;
    }
  }

  private overrideBlockValid(count: number, indices: readonly number[], values: readonly number[], paramCount: number): boolean {
    if (!Number.isInteger(count) || count < 0 || count > paramCount) return false;
    for (let slot = 0; slot < count; slot += 1) {
      const paramIndex = indices[slot];
      const value = values[slot];
      if (typeof paramIndex !== 'number' || !Number.isInteger(paramIndex) || paramIndex < 0 || paramIndex >= paramCount) return false;
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    }
    return true;
  }

  private soundscapeFadeCanCoverAssetRemoval(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean {
    if (!this.assetRefsChanged(previous.assetRefs, next.assetRefs)) return false;
    const previousSoundscape = previous.sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape);
    const nextSoundscape = next.sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape);
    if (!previousSoundscape?.enabled || nextSoundscape?.enabled) return false;
    const previousRefs = new Set(previous.assetRefs.filter((assetId) => assetId > 0));
    const nextRefs = new Set(next.assetRefs.filter((assetId) => assetId > 0));
    return nextRefs.size === 0 || [...nextRefs].every((assetId) => previousRefs.has(assetId));
  }

  private canApplyLaneDiffs(previous: ProductLaneSnapshot[], next: ProductLaneSnapshot[]): boolean {
    if (previous.length !== next.length) return false;
    for (let index = 0; index < next.length; index += 1) {
      const previousLane = previous[index];
      const nextLane = next[index];
      if (!previousLane || !nextLane) return false;
      if (previousLane.barReset !== nextLane.barReset) return false;
      if (previousLane.phraseReset !== nextLane.phraseReset) return false;
      if (previousLane.manualStepMaskLow !== nextLane.manualStepMaskLow) return false;
      if (previousLane.manualStepMaskHigh !== nextLane.manualStepMaskHigh) return false;
    }
    return true;
  }

  private appendTransportDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
  ): void {
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportRunning, previous.transport.running, next.transport.running);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportBpm, previous.transport.bpm, next.transport.bpm);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportBeatsPerBar, previous.transport.beatsPerBar, next.transport.beatsPerBar);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportBarsPerPhrase, previous.transport.barsPerPhrase, next.transport.barsPerPhrase);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportSwing, previous.transport.swing, next.transport.swing);
  }

  private appendHarmonyDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
  ): void {
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.HarmonyRootMidi, previous.harmony.rootMidi, next.harmony.rootMidi);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.HarmonyScaleId, previous.harmony.scaleId, next.harmony.scaleId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.HarmonyTension, previous.harmony.tension, next.harmony.tension);
    if (this.harmonyPoolFrameChanged(previous.harmony, next.harmony)) {
      if (next.harmony.activeSource === 3) {
        events.push(createCoreProductHarmonyControlSetManualIntentEvent({
          degree: next.harmony.resolvedHarmonyFrame.degree,
          quality: this.harmonyQuality(next.harmony.resolvedHarmonyFrame.quality),
          strength: next.harmony.manualControl.strength,
        }));
      } else if (next.harmony.activeSource === 2 && next.harmony.activeSlotId >= 0) {
        events.push(createCoreProductHarmonySlotSetEvent(next.harmony.activeSlotId, {
          degree: next.harmony.resolvedHarmonyFrame.degree,
          quality: this.harmonyQuality(next.harmony.resolvedHarmonyFrame.quality),
          strength: next.harmony.manualControl.strength,
        }));
      } else if (next.harmony.activeSource === 1 && next.harmony.activeStepIndex >= 0) {
        events.push(createCoreProductHarmonySequenceSetEnabledEvent(next.harmony.chordSequenceEnabled));
        events.push(createCoreProductHarmonySequenceSetStepEvent(next.harmony.activeStepIndex, {
          degree: next.harmony.resolvedHarmonyFrame.degree,
          quality: this.harmonyQuality(next.harmony.resolvedHarmonyFrame.quality),
          strength: next.harmony.manualControl.strength,
        }));
      } else if (previous.harmony.activeSource !== 0) {
        events.push(createCoreProductHarmonyControlClearManualIntentEvent());
      }
    }
  }

  private harmonyPoolFrameChanged(previous: CoreProductSnapshot['harmony'], next: CoreProductSnapshot['harmony']): boolean {
    if (previous.activeSource !== next.activeSource) return true;
    if (previous.activeSlotId !== next.activeSlotId) return true;
    if (previous.activeStepIndex !== next.activeStepIndex) return true;
    if (previous.notePoolCount !== next.notePoolCount) return true;
    if (previous.nextNotePoolCount !== next.nextNotePoolCount) return true;
    for (let index = 0; index < 8; index += 1) {
      if ((previous.notePoolMidi[index] ?? 0) !== (next.notePoolMidi[index] ?? 0)) return true;
      if ((previous.nextNotePoolMidi[index] ?? 0) !== (next.nextNotePoolMidi[index] ?? 0)) return true;
    }
    return false;
  }

  private harmonyQuality(quality: string): HarmonyChordQuality {
    return Object.prototype.hasOwnProperty.call(HARMONY_QUALITY_IDS, quality)
      ? quality as HarmonyChordQuality
      : 'auto';
  }

  private appendJourneyDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
  ): void {
    if (
      previous.journey.enabled !== next.journey.enabled ||
      this.valuesDiffer(previous.journey.morphPhase, next.journey.morphPhase) ||
      this.valuesDiffer(previous.journey.morphRateBars, next.journey.morphRateBars)
    ) {
      events.push(createCoreProductJourneyStateEvent(
        next.journey.enabled,
        next.journey.morphPhase,
        next.journey.morphRateBars,
      ));
    }
  }

  private appendSourceParamDiffs(
    events: CoreProductEvent[],
    previousSources: ProductSourceSnapshot[],
    nextSources: ProductSourceSnapshot[],
  ): void {
    for (let index = 0; index < nextSources.length; index += 1) {
      const previous = previousSources[index];
      const next = nextSources[index];
      if (!previous || !next) continue;
      const targetId = next.sourceId;
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceEnabled, previous.enabled, next.enabled, targetId);
      if (previous.presetId !== next.presetId) {
        events.push(createCoreProductSourcePresetEvent(targetId, next.presetId));
      }
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, previous.level, next.level, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, previous.morph, next.morph, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, previous.distance, next.distance, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, previous.expression, next.expression, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDryGain, previous.dryGain, next.dryGain, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, previous.reverbSend, next.reverbSend, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, previous.delayASend, next.delayASend, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, previous.delayBSend, next.delayBSend, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, previous.granularSend, next.granularSend, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, previous.diffuseSend, next.diffuseSend, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, previous.postLpfHz, next.postLpfHz, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, previous.stereoWidth, next.stereoWidth, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking, previous.postLpfKeyTracking, next.postLpfKeyTracking, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLeadEnvelopeOverrideEnabled, previous.leadEnvelopeOverrideEnabled, next.leadEnvelopeOverrideEnabled, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLeadAlgorithmPresetAEnabled, previous.leadAlgorithmPresetAEnabled, next.leadAlgorithmPresetAEnabled, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, previous.attackSeconds, next.attackSeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, previous.decaySeconds, next.decaySeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, previous.sustain, next.sustain, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, previous.holdSeconds, next.holdSeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, previous.releaseSeconds, next.releaseSeconds, targetId);
    }
  }

  private appendSourceOverrideDiffs(events: CoreProductEvent[], previousSources: ProductSourceSnapshot[], nextSources: ProductSourceSnapshot[]): void {
    for (let sourceIndex = 0; sourceIndex < nextSources.length; sourceIndex += 1) {
      const previous = previousSources[sourceIndex];
      const next = nextSources[sourceIndex];
      if (!previous || !next || !this.canApplySourceOverrideDiff(previous, next)) continue;
      if (this.padOverrideChanged(previous, next)) {
        this.appendOverrideBlockEvents(events, next.sourceId, next.padOverrideCount, next.padOverrideIndices, next.padOverrideValues);
      }
      if (this.leadOverrideChanged(previous, next)) {
        this.appendOverrideBlockEvents(events, next.sourceId, next.leadOverrideCount, next.leadOverrideIndices, next.leadOverrideValues);
      }
      if (this.drumOverrideChanged(previous, next)) {
        this.appendOverrideBlockEvents(events, next.sourceId, next.drumOverrideCount, next.drumOverrideIndices, next.drumOverrideValues);
      }
    }
  }

  private appendOverrideBlockEvents(
    events: CoreProductEvent[],
    sourceId: number,
    overrideCount: number,
    overrideIndices: readonly number[],
    overrideValues: readonly number[],
  ): void {
    for (let slot = 0; slot < overrideCount; slot += 1) {
      events.push(createCoreProductSourceOverrideSlotEvent(
        sourceId,
        slot,
        overrideIndices[slot] ?? 0,
        overrideValues[slot] ?? 0,
      ));
    }
    events.push(createCoreProductSourceOverrideCommitEvent(sourceId, overrideCount));
  }

  private appendSequencerLaneDiffs(events: CoreProductEvent[], sequencer: SequencerKind, previousLanes: ProductLaneSnapshot[], nextLanes: ProductLaneSnapshot[], forceClockRejoin: boolean): void {
    for (let laneIndex = 0; laneIndex < nextLanes.length; laneIndex += 1) {
      const previous = previousLanes[laneIndex];
      const next = nextLanes[laneIndex];
      if (!previous || !next) continue;
      const nextInitialDelay = next.initialStartDelaySeconds ?? -1;
      const previousInitialDelay = previous.initialStartDelaySeconds ?? -1;
      if ((forceClockRejoin && next.enabled) || (nextInitialDelay >= 0 && this.valuesDiffer(previousInitialDelay, nextInitialDelay))) {
        events.push(createCoreProductSequencerLaneParamEvent(sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneInitialStartDelaySeconds, nextInitialDelay));
      }
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneEnabled, previous.enabled, next.enabled);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTargetSource, previous.targetSourceId, next.targetSourceId);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneStepCount, previous.stepCount, next.stepCount);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneFillCount, previous.fillCount, next.fillCount);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneRotation, previous.rotation, next.rotation);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision, previous.clockDivision, next.clockDivision);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTempoMultiplier, previous.tempoMultiplier, next.tempoMultiplier);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, previous.swing, next.swing);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneProbability, previous.probability, next.probability);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneRatchet, previous.ratchet, next.ratchet);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTrigCondition, previous.trigCondition, next.trigCondition);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, previous.midiNote, next.midiNote);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneVelocity, previous.velocity, next.velocity);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneHoldSeconds, previous.holdSeconds, next.holdSeconds);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMorph, previous.morph, next.morph);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneDistance, previous.distance, next.distance);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneExpression, previous.expression, next.expression);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSeed, previous.seed, next.seed);
    }
  }

  private appendFxRoutingMasterDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
  ): void {
    for (const param of KESSHO_PRODUCT_PARAMS) {
      if (!param.path.startsWith('fx.') && !param.path.startsWith('routing.') && !param.path.startsWith('master.')) continue;
      this.appendParamDiff(
        events,
        param.id,
        this.snapshotRuntimeParamValue(previous, param.path),
        this.snapshotRuntimeParamValue(next, param.path),
      );
    }
  }

  private snapshotRuntimeParamValue(snapshot: CoreProductSnapshot, path: string): SnapshotScalar {
    if (path.startsWith('fx.')) return this.fxRuntimeParamValue(snapshot.fx, path.slice(3));
    if (path.startsWith('routing.')) return this.requiredSnapshotScalar(snapshot.routing, path.slice(8), path);
    if (path.startsWith('master.')) return this.requiredSnapshotScalar(snapshot.master, path.slice(7), path);
    throw new Error(`Unsupported Product Core runtime diff path ${path}`);
  }

  private fxRuntimeParamValue(fx: CoreProductSnapshot['fx'], path: string): SnapshotScalar {
    const voiceMatch = /^granular\.voices\.(\d+)\.(.+)$/.exec(path);
    if (voiceMatch) {
      return this.requiredSnapshotScalar(fx.granularVoices[Number(voiceMatch[1])], voiceMatch[2]!, `fx.${path}`);
    }
    const tapeHeadMatch = /^delayB\.tapeHead([1-4])(Level|Pan)$/.exec(path);
    if (tapeHeadMatch) {
      const index = Number(tapeHeadMatch[1]) - 1;
      return tapeHeadMatch[2] === 'Level'
        ? fx.delayBTapeHeadLevels[index] ?? 0
        : fx.delayBTapeHeadPans[index] ?? 0.5;
    }
    const sidechainTargetMatch = /^sidechain\.targets\.(pad1|pad2|lead1|lead2|piano|granular|delayA|delayB|reverb)$/.exec(path);
    if (sidechainTargetMatch) {
      const key = `sidechain${this.capitalized(sidechainTargetMatch[1]!)}Target`;
      return this.requiredSnapshotScalar(fx, key, `fx.${path}`);
    }
    return this.requiredSnapshotScalar(fx, this.flattenRuntimePath(path), `fx.${path}`);
  }

  private requiredSnapshotScalar(container: unknown, key: string, path: string): SnapshotScalar {
    const value = (container as Record<string, unknown> | undefined)?.[key];
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    throw new Error(`Core Product snapshot path ${path} is missing scalar field ${key}`);
  }

  private flattenRuntimePath(path: string): string {
    return path.split('.').map((part, index) => index === 0 ? part : this.capitalized(part)).join('');
  }

  private capitalized(value: string): string {
    return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
  }

  private appendEvolutionDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
  ): void {
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.EvolutionAmount, previous.evolution.amount, next.evolution.amount);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.EvolutionState, previous.evolution.state, next.evolution.state);
  }

  private appendRngDiffs(events: CoreProductEvent[], previous: CoreProductSnapshot, next: CoreProductSnapshot, forwardRngDiffs: boolean): void {
    if (!forwardRngDiffs) return;
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RngSeed, previous.rng.seed, next.rng.seed);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RngState, previous.rng.state, next.rng.state);
  }

  private appendParamDiff(
    events: CoreProductEvent[],
    paramId: number,
    previous: SnapshotScalar,
    next: SnapshotScalar,
    targetId = 0,
    index = 0,
  ): void {
    if (!this.valuesDiffer(previous, next)) return;
    events.push(createCoreProductParamEvent(paramId, this.eventValue(next), targetId, index));
  }

  private appendLaneParamDiff(
    events: CoreProductEvent[],
    sequencer: SequencerKind,
    laneIndex: number,
    paramId: number,
    previous: SnapshotScalar,
    next: SnapshotScalar,
  ): void {
    if (!this.valuesDiffer(previous, next)) return;
    events.push(createCoreProductSequencerLaneParamEvent(sequencer, laneIndex, paramId, this.eventValue(next)));
  }

  private assetRefsChanged(previous: number[], next: number[]): boolean {
    if (previous.length !== next.length) return true;
    for (let index = 0; index < next.length; index += 1) {
      if (previous[index] !== next[index]) return true;
    }
    return false;
  }

  private assetRefLevelsChanged(previous: number[], next: number[]): boolean {
    if (previous.length !== next.length) return true;
    for (let index = 0; index < next.length; index += 1) {
      if (this.valuesDiffer(previous[index] ?? 0, next[index] ?? 0)) return true;
    }
    return false;
  }

  private soundscapeSnapshotChanged(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean {
    const previousSoundscape = previous.soundscape;
    const nextSoundscape = next.soundscape;
    if (!previousSoundscape && !nextSoundscape) return false;
    if (!previousSoundscape || !nextSoundscape) return true;
    return this.paramBlockChanged(
      previousSoundscape.textureParamCount,
      nextSoundscape.textureParamCount,
      previousSoundscape.textureParams,
      nextSoundscape.textureParams,
    ) || this.paramBlockChanged(
      previousSoundscape.moduleParamCount,
      nextSoundscape.moduleParamCount,
      previousSoundscape.moduleParams,
      nextSoundscape.moduleParams,
    );
  }

  private paramBlockChanged(previousCount: number, nextCount: number, previousParams: readonly number[], nextParams: readonly number[]): boolean {
    if (previousCount !== nextCount) return true;
    for (let index = 0; index < nextCount; index += 1) {
      if (this.valuesDiffer(previousParams[index] ?? 0, nextParams[index] ?? 0)) return true;
    }
    return false;
  }

  private valuesDiffer(previous: SnapshotScalar, next: SnapshotScalar): boolean {
    if (typeof previous === 'boolean' || typeof next === 'boolean') {
      return previous !== next;
    }
    return Math.abs(previous - next) > 0.000001;
  }

  private eventValue(value: SnapshotScalar): number {
    return value === true ? 1 : value === false ? 0 : value;
  }
}

const runtimeAdapter = new CoreProductRuntimeAdapter();

export function buildCoreProductSnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot, options: CoreProductSnapshotDiffOptions = {}): CoreProductSnapshotDiffResult {
  return runtimeAdapter.buildSnapshotDiff(previous, next, options);
}
