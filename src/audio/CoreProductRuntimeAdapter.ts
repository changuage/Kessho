import type { CoreProductEvent } from './coreProductEvents';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductHarmonyControlClearManualIntentEvent, createCoreProductHarmonyControlSetManualIntentEvent, createCoreProductHarmonySequenceSetEnabledEvent, createCoreProductHarmonySequenceSetStepEvent, createCoreProductHarmonySlotSetEvent, createCoreProductJourneyStateEvent, createCoreProductParamEvent, createCoreProductSequencerLaneParamEvent, createCoreProductSourceOverrideCommitEvent, createCoreProductSourceOverrideSlotEvent, createCoreProductSourcePresetEvent, createCoreProductTransportTransitionEvent } from './coreProductEvents';
import { usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from './coreProductSnapshot';
import {
  appendCoreProductSourcePresetEndpointDiffs,
  canApplyCoreProductSourcePresetEndpointIdDiff,
  coreProductSourcePresetEndpointIdsChanged,
  isPadOrLeadEndpointSource,
} from './CoreProductRuntimeAdapterSourcePresets';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { KESSHO_PRODUCT_PARAM_IDS, KESSHO_PRODUCT_PARAMS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_DRUM_PARAM_COUNT, KESSHO_PRODUCT_LEAD_PARAM_COUNT, KESSHO_PRODUCT_PAD_PARAM_COUNT } from './generated/kesshoProductSchema';
import { HARMONY_QUALITY_IDS, type HarmonyChordQuality } from './CoreProductHarmonyControl';
import { appendSequencerModeConfigDiffs } from './CoreProductRuntimeAdapterSequencerFaces';
import type { CoreProductSequencerClockRejoinMask } from './CoreProductHostSequencerClock';
import { coreProductSequencerAudibilityFlags } from './sequencerResumeQuantization';

export const MAX_SNAPSHOT_DIFF_EVENTS = 1024;

export type SnapshotReloadReason =
  | 'none' | 'initial-snapshot' | 'runtime-start' | 'runtime-bootstrap' | 'manual-sample-asset' | 'explicit-reset-request' | 'asset-reference-change' | 'asset-reference-level-change' | 'soundscape-param-change' | 'harmony-mode-change' | 'source-structure-change' | 'pad-override-change' | 'lead-override-change' | 'drum-override-change' | 'sequencer-structure-change' | 'dirty-diff-event-budget' | 'product-patch';

type SequencerKind = 'synth' | 'drum';
type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];
type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];
type SnapshotScalar = number | boolean;

export type CoreProductSnapshotDiffOptions = {
  forwardRngDiffs?: boolean;
  sequencerClockRejoinMask?: CoreProductSequencerClockRejoinMask;
};

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
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.HarmonyVoicingSpread,
      previous.harmony.voicingSpread, next.harmony.voicingSpread);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementSynthOctave,
      previous.arrangement?.synthOctave ?? 0, next.arrangement?.synthOctave ?? 0);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementWaveSpread,
      previous.arrangement?.waveSpread ?? 0, next.arrangement?.waveSpread ?? 0);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementChordGeneratorEnabled,
      previous.arrangement?.chordGeneratorEnabled ?? false, next.arrangement?.chordGeneratorEnabled ?? false);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementChordGeneratorSourceId,
      previous.arrangement?.chordGeneratorSourceId ?? CORE_PRODUCT_SOURCE_IDS.sample1,
      next.arrangement?.chordGeneratorSourceId ?? CORE_PRODUCT_SOURCE_IDS.sample1);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementChordGeneratorVoiceCount,
      previous.arrangement?.chordGeneratorVoiceCount ?? 6, next.arrangement?.chordGeneratorVoiceCount ?? 6);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementChordGeneratorPadSplit,
      previous.arrangement?.chordGeneratorPadSplit ?? false, next.arrangement?.chordGeneratorPadSplit ?? false);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadRandomEnabled,
      previous.arrangement?.leadRandomEnabled ?? false, next.arrangement?.leadRandomEnabled ?? false);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadRandomSourceId,
      previous.arrangement?.leadRandomSourceId ?? CORE_PRODUCT_SOURCE_IDS.lead1,
      next.arrangement?.leadRandomSourceId ?? CORE_PRODUCT_SOURCE_IDS.lead1);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadPhraseSeconds,
      previous.arrangement?.leadPhraseSeconds ?? 16, next.arrangement?.leadPhraseSeconds ?? 16);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadDensity,
      previous.arrangement?.leadDensity ?? 0.5, next.arrangement?.leadDensity ?? 0.5);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadOctave,
      previous.arrangement?.leadOctave ?? 1, next.arrangement?.leadOctave ?? 1);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadOctaveRange,
      previous.arrangement?.leadOctaveRange ?? 2, next.arrangement?.leadOctaveRange ?? 2);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadHoldSeconds,
      previous.arrangement?.leadHoldSeconds ?? 0.5, next.arrangement?.leadHoldSeconds ?? 0.5);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadVelocityMin,
      previous.arrangement?.leadVelocityMin ?? 0.5, next.arrangement?.leadVelocityMin ?? 0.5);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadVelocityMax,
      previous.arrangement?.leadVelocityMax ?? 0.9, next.arrangement?.leadVelocityMax ?? 0.9);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadChordBias,
      previous.arrangement?.leadChordBias ?? 0.78, next.arrangement?.leadChordBias ?? 0.78);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.ArrangementLeadInitialDelaySeconds,
      previous.arrangement?.leadInitialDelaySeconds ?? 0, next.arrangement?.leadInitialDelaySeconds ?? 0);
    this.appendJourneyDiffs(events, previous, next);
    this.appendSourceParamDiffs(events, previous.sources, next.sources);
    appendCoreProductSourcePresetEndpointDiffs(events, previous.sources, next.sources); this.appendSourceOverrideDiffs(events, previous.sources, next.sources);
    this.appendSequencerLaneDiffs(events, 'synth', previous.synthLanes, next.synthLanes, options.sequencerClockRejoinMask?.synth ?? 0);
    this.appendSequencerLaneDiffs(events, 'drum', previous.drumLanes, next.drumLanes, options.sequencerClockRejoinMask?.drum ?? 0);
    const runningBpmTransition = previous.transport.running && next.transport.running && this.valuesDiffer(previous.transport.bpm, next.transport.bpm);
    this.appendFxRoutingMasterDiffs(events, previous, next, runningBpmTransition);
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
      if (this.sourcePresetEndpointBodyChanged(previousSource, nextSource)) return 'source-structure-change';
      if (
        coreProductSourcePresetEndpointIdsChanged(previousSource, nextSource) &&
        !canApplyCoreProductSourcePresetEndpointIdDiff(previousSource, nextSource)
      ) return 'source-structure-change';
      const soundscapeFadeCanCoverPatchRemoval =
        soundscapeFadeCanCoverAssetRemoval && nextSource.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape;
      if (!soundscapeFadeCanCoverPatchRemoval) {
        if (this.padOverrideChanged(previousSource, nextSource)) return 'pad-override-change';
        if (this.leadOverrideChanged(previousSource, nextSource)) return 'lead-override-change';
        if (this.drumOverrideChanged(previousSource, nextSource)) return 'drum-override-change';
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
    // Harmony authority fields are consumed by the native cache as one atomic
    // snapshot.  Do not emit a partial dirty diff that would leave the audio
    // thread with stale semantic/playback/gesture inputs.
    if (this.harmonyAuthorityFieldsChanged(previous.harmony, next.harmony)) return false;
    if (previous.sources.length !== next.sources.length) return false;
    for (let index = 0; index < next.sources.length; index += 1) {
      const previousSource = previous.sources[index];
      const nextSource = next.sources[index];
      if (!previousSource || !nextSource) return false;
      if (previousSource.sourceId !== nextSource.sourceId) return false;
      if (previousSource.assetId !== nextSource.assetId) return false;
      if (this.legacyExactBridgeFieldsPresent(previousSource) || this.legacyExactBridgeFieldsPresent(nextSource)) return false;
      if (this.sourcePresetEndpointBodyChanged(previousSource, nextSource)) return false;
      if (
        coreProductSourcePresetEndpointIdsChanged(previousSource, nextSource) &&
        !canApplyCoreProductSourcePresetEndpointIdDiff(previousSource, nextSource)
      ) return false;
      const soundscapeFadeCanCoverPatchRemoval =
        soundscapeFadeCanCoverAssetRemoval && nextSource.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape;
      if (!soundscapeFadeCanCoverPatchRemoval) {
        if (this.padOverrideChanged(previousSource, nextSource)) return false;
        if (this.leadOverrideChanged(previousSource, nextSource)) return false;
        if (this.drumOverrideChanged(previousSource, nextSource)) return false;
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

  private sourcePresetEndpointBodyChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    if (previous.sourceId !== next.sourceId) return false;
    if (isPadOrLeadEndpointSource(next.sourceId)) {
      return (previous.sourcePresetAId ?? 0) !== (next.sourcePresetAId ?? 0) ||
        (previous.sourcePresetBId ?? 0) !== (next.sourcePresetBId ?? 0);
    }
    if (next.sourceId !== CORE_PRODUCT_SOURCE_IDS.drum) return false;
    return this.u32ArrayChanged(previous.drumVoicePresetAIds, next.drumVoicePresetAIds) ||
      this.u32ArrayChanged(previous.drumVoicePresetBIds, next.drumVoicePresetBIds);
  }

  private u32ArrayChanged(previous: readonly number[] | undefined, next: readonly number[] | undefined): boolean {
    const length = Math.max(previous?.length ?? 0, next?.length ?? 0);
    for (let index = 0; index < length; index += 1) {
      if ((previous?.[index] ?? 0) !== (next?.[index] ?? 0)) return true;
    }
    return false;
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
    const timingChanged =
      this.valuesDiffer(previous.transport.bpm, next.transport.bpm) ||
      previous.transport.beatsPerBar !== next.transport.beatsPerBar ||
      previous.transport.barsPerPhrase !== next.transport.barsPerPhrase ||
      this.valuesDiffer(previous.transport.phraseSeconds, next.transport.phraseSeconds);
    if (timingChanged && previous.transport.running && next.transport.running) {
      events.push(createCoreProductTransportTransitionEvent({
        bpm: next.transport.bpm,
        beatsPerBar: next.transport.beatsPerBar,
        barsPerPhrase: next.transport.barsPerPhrase,
        phraseSeconds: next.transport.phraseSeconds,
      }));
    } else {
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportBpm, previous.transport.bpm, next.transport.bpm);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportBeatsPerBar, previous.transport.beatsPerBar, next.transport.beatsPerBar);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.TransportBarsPerPhrase, previous.transport.barsPerPhrase, next.transport.barsPerPhrase);
    }
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

  private harmonyAuthorityFieldsChanged(previous: CoreProductSnapshot['harmony'], next: CoreProductSnapshot['harmony']): boolean {
    const scalarKeys = [
      'canonicalProgressionVersion', 'canonicalProgressionEnabled', 'canonicalProgressionEventCount',
      'canonicalProgressionCurrentEvent', 'canonicalProgressionBarsPerPhrase',
      'liveGestureRevision', 'liveGestureScope', 'liveGestureTarget', 'liveGesturePhase',
      'liveGesturePlaybackBehavior', 'liveGestureIntentQuality', 'liveGestureIntentRootMode',
      'liveGestureIntentDegree', 'liveGestureIntentRootNote', 'liveGestureCapturedRootMidi',
      'liveGestureCapturedScaleId', 'liveGestureNoteCount', 'liveGestureExpiresAtFrame',
      'takeoverAnchorCount', 'takeoverTargetRootMidi', 'takeoverTargetScaleId', 'takeoverProgress',
    ] as const;
    const arrayKeys = [
      'canonicalProgressionSource', 'canonicalProgressionSlotId', 'canonicalProgressionDurationUnit',
      'canonicalProgressionDurationValue', 'harmonySlotPlaybackBehavior', 'harmonySlotIntentQuality',
      'harmonySlotIntentRootMode', 'harmonySlotIntentDegree', 'harmonySlotIntentRootNote',
      'harmonySlotIntentInversion', 'harmonySlotIntentSpread', 'harmonySlotIntentOctave',
      'harmonySlotIntentBassMode', 'harmonySlotIntentStrength', 'harmonySlotIntentSource',
      'harmonySlotIntentExtensionMask', 'harmonySlotIntentAlterationMask', 'harmonySlotCapturedRootMidi',
      'harmonySlotCapturedScaleId', 'liveGestureNotes', 'takeoverAnchorSource', 'takeoverAnchorTarget',
      'takeoverAnchorWeight',
    ] as const;
    const previousShape = previous as unknown as Record<string, unknown>;
    const nextShape = next as unknown as Record<string, unknown>;
    for (const key of scalarKeys) {
      if (previousShape[key] !== nextShape[key]) return true;
    }
    for (const key of arrayKeys) {
      const previousValues = Array.isArray(previousShape[key]) ? previousShape[key] as unknown[] : [];
      const nextValues = Array.isArray(nextShape[key]) ? nextShape[key] as unknown[] : [];
      if (previousValues.length !== nextValues.length) return true;
      for (let index = 0; index < nextValues.length; index += 1) {
        if (previousValues[index] !== nextValues[index]) return true;
      }
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
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, previous.level, next.level, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, previous.morph, next.morph, targetId);
      if (
        previous.presetId !== next.presetId &&
        (!isPadOrLeadEndpointSource(targetId) || coreProductSourcePresetEndpointIdsChanged(previous, next))
      ) {
        events.push(createCoreProductSourcePresetEvent(targetId, next.presetId));
      }
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
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth, previous.leadVibratoDepth, next.leadVibratoDepth, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate, previous.leadVibratoRate, next.leadVibratoRate, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide, previous.leadGlide, next.leadGlide, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, previous.attackSeconds, next.attackSeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, previous.decaySeconds, next.decaySeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, previous.sustain, next.sustain, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, previous.holdSeconds, next.holdSeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, previous.releaseSeconds, next.releaseSeconds, targetId);
      this.appendSampleSourceParamDiffs(events, previous, next, targetId);
    }
  }

  private appendSampleSourceParamDiffs(
    events: CoreProductEvent[],
    previous: ProductSourceSnapshot,
    next: ProductSourceSnapshot,
    targetId: number,
  ): void {
    if (targetId !== CORE_PRODUCT_SOURCE_IDS.sample1 && targetId !== CORE_PRODUCT_SOURCE_IDS.sample2) return;
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleLibraryId, previous.sampleLibraryId, next.sampleLibraryId, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleRoleId, previous.sampleRoleId, next.sampleRoleId, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleArticulationId, previous.sampleArticulationId, next.sampleArticulationId, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleSelectionMode, previous.sampleSelectionMode, next.sampleSelectionMode, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleDynamicMode, previous.sampleDynamicMode, next.sampleDynamicMode, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleFixedDynamicId, previous.sampleFixedDynamicId, next.sampleFixedDynamicId, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleLoopEnabled, previous.sampleLoopEnabled, next.sampleLoopEnabled, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleMaxVoices, previous.sampleMaxVoices, next.sampleMaxVoices, targetId);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSampleVariantMode, previous.sampleVariantMode, next.sampleVariantMode, targetId);
  }

  private appendSourceOverrideDiffs(events: CoreProductEvent[], previousSources: ProductSourceSnapshot[], nextSources: ProductSourceSnapshot[]): void {
    for (let sourceIndex = 0; sourceIndex < nextSources.length; sourceIndex += 1) {
      const previous = previousSources[sourceIndex];
      const next = nextSources[sourceIndex];
      if (!previous || !next || !this.canApplySourceOverrideDiff(previous, next)) continue;
      const endpointChanged = coreProductSourcePresetEndpointIdsChanged(previous, next);
      const morphAnchor = endpointChanged ? next.morph : undefined;
      if (this.padOverrideChanged(previous, next)) {
        this.appendOverrideBlockEvents(events, next.sourceId, next.padOverrideCount, next.padOverrideIndices, next.padOverrideValues, morphAnchor);
      }
      if (this.leadOverrideChanged(previous, next)) {
        this.appendOverrideBlockEvents(events, next.sourceId, next.leadOverrideCount, next.leadOverrideIndices, next.leadOverrideValues, morphAnchor);
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
    morphAnchor?: number,
  ): void {
    for (let slot = 0; slot < overrideCount; slot += 1) {
      events.push(createCoreProductSourceOverrideSlotEvent(
        sourceId,
        slot,
        overrideIndices[slot] ?? 0,
        overrideValues[slot] ?? 0,
      ));
    }
    events.push(createCoreProductSourceOverrideCommitEvent(sourceId, overrideCount, morphAnchor));
  }

  private appendSequencerLaneDiffs(events: CoreProductEvent[], sequencer: SequencerKind, previousLanes: ProductLaneSnapshot[], nextLanes: ProductLaneSnapshot[], clockRejoinMask: number): void {
    for (let laneIndex = 0; laneIndex < nextLanes.length; laneIndex += 1) {
      const previous = previousLanes[laneIndex];
      const next = nextLanes[laneIndex];
      if (!previous || !next) continue;
      const nextInitialDelay = next.initialStartDelaySeconds ?? -1;
      const previousInitialDelay = previous.initialStartDelaySeconds ?? -1;
      const laneClockRejoin = (clockRejoinMask & (1 << laneIndex)) !== 0;
      if ((laneClockRejoin && next.enabled) || (nextInitialDelay >= 0 && this.valuesDiffer(previousInitialDelay, nextInitialDelay))) {
        events.push(createCoreProductSequencerLaneParamEvent(sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneInitialStartDelaySeconds, nextInitialDelay));
      }
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneEnabled, previous.enabled, next.enabled);
      if (previous.muted !== next.muted) {
        events.push(createCoreProductSequencerLaneParamEvent(
          sequencer,
          laneIndex,
          KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMuted,
          next.muted ? 1 : 0,
          next.muted ? 0 : coreProductSequencerAudibilityFlags(next.resumeQuantization),
        ));
      }
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
      appendSequencerModeConfigDiffs(events, sequencer, laneIndex, previous, next);
    }
  }

  private appendFxRoutingMasterDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
    deferTempoSyncedDelayTimes: boolean,
  ): void {
    const nodeCount = next.routing.fxEdgeMask.length;
    const edgeEnabled = (routing: CoreProductSnapshot['routing'], from: number, to: number) =>
      ((routing.fxEdgeMask[from] ?? 0) & (1 << to)) !== 0;
    for (let from = 0; from < nodeCount; from += 1) {
      for (let to = 0; to < nodeCount; to += 1) {
        if (edgeEnabled(previous.routing, from, to) && !edgeEnabled(next.routing, from, to)) {
          this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteEnabled, 1, 0, from * nodeCount + to);
        }
      }
    }
    for (let from = 0; from < nodeCount; from += 1) {
      for (let to = 0; to < nodeCount; to += 1) {
        const edge = from * nodeCount + to;
        this.appendParamDiff(
          events,
          KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteAmount,
          previous.routing.fxRouteAmount[edge] ?? 0,
          next.routing.fxRouteAmount[edge] ?? 0,
          edge,
        );
        this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteMode,
          previous.routing.fxRouteMode[edge] ?? 0, next.routing.fxRouteMode[edge] ?? 0, edge);
        this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteMin,
          previous.routing.fxRouteMin[edge] ?? 0, next.routing.fxRouteMin[edge] ?? 0, edge);
        this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteMax,
          previous.routing.fxRouteMax[edge] ?? 0, next.routing.fxRouteMax[edge] ?? 0, edge);
      }
    }
    for (let from = 0; from < nodeCount; from += 1) {
      for (let to = 0; to < nodeCount; to += 1) {
        if (!edgeEnabled(previous.routing, from, to) && edgeEnabled(next.routing, from, to)) {
          this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteEnabled, 0, 1, from * nodeCount + to);
        }
      }
    }
    for (const param of KESSHO_PRODUCT_PARAMS) {
      if (!param.path.startsWith('fx.') && !param.path.startsWith('routing.') && !param.path.startsWith('master.')) continue;
      if (param.path.includes('*')) continue;
      if (param.id === KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteAmount ||
          param.id === KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteEnabled ||
          param.id === KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteMode ||
          param.id === KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteMin ||
          param.id === KESSHO_PRODUCT_PARAM_IDS.RoutingFxRouteMax) continue;
      if (deferTempoSyncedDelayTimes && (
        param.id === KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeLeftMs ||
        param.id === KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeRightMs ||
        param.id === KESSHO_PRODUCT_PARAM_IDS.FxDelayBBaseTimeMs
      )) continue;
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
    if (path.startsWith('routing.')) return this.requiredSnapshotScalar(snapshot.routing, this.flattenRuntimePath(path.slice(8)), path);
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
    const dynamicsDegradeChildMatch = /^dynamics\.degrade\.(drift|erosion)\.(.+)$/.exec(path);
    if (dynamicsDegradeChildMatch) {
      const [, child, field] = dynamicsDegradeChildMatch;
      const key = `dynamics${this.capitalized(child!)}${this.capitalized(field!)}`;
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
