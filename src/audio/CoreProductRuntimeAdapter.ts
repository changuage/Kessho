import type { CoreProductEvent } from './coreProductEvents';
import { CORE_PRODUCT_SOURCE_IDS, coreProductDrumRuntimeParamId, coreProductPadRuntimeParamId, createCoreProductJourneyStateEvent, createCoreProductParamEvent, createCoreProductSequencerLaneParamEvent, createCoreProductSourcePresetEvent } from './coreProductEvents';
import { usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from './coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_DRUM_PARAM_COUNT, KESSHO_PRODUCT_PAD_PARAM_COUNT } from './generated/kesshoProductSchema';

export const MAX_SNAPSHOT_DIFF_EVENTS = 384;

export type SnapshotReloadReason =
  | 'none' | 'initial-snapshot' | 'runtime-start' | 'runtime-bootstrap' | 'manual-piano-asset' | 'explicit-reset-request' | 'asset-reference-change' | 'asset-reference-level-change' | 'harmony-mode-change' | 'source-structure-change' | 'exact-patch-change' | 'sequencer-structure-change' | 'dirty-diff-event-budget' | 'adapter-update';

type SequencerKind = 'synth' | 'drum';
type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];
type ProductLaneSnapshot = CoreProductSnapshot['synthLanes'][number];
type ProductGranularVoiceSnapshot = CoreProductSnapshot['fx']['granularVoices'][number];
type ProductParamIdName = keyof typeof KESSHO_PRODUCT_PARAM_IDS;
type ExactPatchKind = 'pad' | 'lead' | 'drum';
type SnapshotScalar = number | boolean;

export type CoreProductSnapshotDiffResult = { applied: true; events: CoreProductEvent[] } | { applied: false; reason: SnapshotReloadReason };

export function shouldForwardCoreProductRngDiffs(latestSliderState: Record<string, unknown> | null, latestTelemetry: CoreProductTelemetrySnapshot | null): boolean {
  if (!latestSliderState) return false;
  if (Object.prototype.hasOwnProperty.call(latestSliderState, 'rngSeed')) return true;
  if (Object.prototype.hasOwnProperty.call(latestSliderState, 'rngState')) return true;
  if (usesLegacyGranularRuntimeSeed(latestSliderState)) return true;
  return !latestTelemetry && Object.prototype.hasOwnProperty.call(latestSliderState, 'seed');
}

class CoreProductRuntimeAdapter {
  buildSnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot, options: { forwardRngDiffs?: boolean } = {}): CoreProductSnapshotDiffResult {
    if (!this.canApplySnapshotDiff(previous, next)) {
      return { applied: false, reason: this.classifySnapshotReloadReason(previous, next) };
    }

    const events: CoreProductEvent[] = [];
    this.appendTransportDiffs(events, previous, next);
    this.appendHarmonyDiffs(events, previous, next);
    this.appendJourneyDiffs(events, previous, next);
    this.appendSourceParamDiffs(events, previous.sources, next.sources);
    this.appendPadExactPatchDiffs(events, previous.sources, next.sources);
    this.appendDrumExactPatchDiffs(events, previous.sources, next.sources);
    this.appendSequencerLaneDiffs(events, 'synth', previous.synthLanes, next.synthLanes);
    this.appendSequencerLaneDiffs(events, 'drum', previous.drumLanes, next.drumLanes);
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
    if (previous.harmony.chordMode !== next.harmony.chordMode) return 'harmony-mode-change';
    if (previous.harmony.voicingMode !== next.harmony.voicingMode) return 'harmony-mode-change';
    if (previous.sources.length !== next.sources.length) return 'source-structure-change';
    for (let index = 0; index < next.sources.length; index += 1) {
      const previousSource = previous.sources[index];
      const nextSource = next.sources[index];
      if (!previousSource || !nextSource) return 'source-structure-change';
      if (previousSource.sourceId !== nextSource.sourceId) return 'source-structure-change';
      if (previousSource.assetId !== nextSource.assetId) return 'source-structure-change';
      const soundscapeFadeCanCoverPatchRemoval =
        soundscapeFadeCanCoverAssetRemoval && nextSource.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape;
      if (!soundscapeFadeCanCoverPatchRemoval) {
        if (this.padPatchChanged(previousSource, nextSource) && !this.canApplyPadExactPatchDiff(previousSource, nextSource)) return 'exact-patch-change';
        if (this.leadPatchChanged(previousSource, nextSource)) return 'exact-patch-change';
        if (this.drumPatchChanged(previousSource, nextSource) && !this.canApplyDrumExactPatchDiff(previousSource, nextSource)) return 'exact-patch-change';
      }
    }
    if (!this.canApplyLaneDiffs(previous.synthLanes, next.synthLanes)) return 'sequencer-structure-change';
    if (!this.canApplyLaneDiffs(previous.drumLanes, next.drumLanes)) return 'sequencer-structure-change';
    return 'adapter-update';
  }

  private canApplySnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean {
    const soundscapeFadeCanCoverAssetRemoval = this.soundscapeFadeCanCoverAssetRemoval(previous, next);
    if (!soundscapeFadeCanCoverAssetRemoval && this.assetRefsChanged(previous.assetRefs, next.assetRefs)) return false;
    if (!soundscapeFadeCanCoverAssetRemoval && this.assetRefLevelsChanged(previous.assetRefLevels, next.assetRefLevels)) return false;
    if (previous.harmony.chordMode !== next.harmony.chordMode) return false;
    if (previous.harmony.voicingMode !== next.harmony.voicingMode) return false;
    if (previous.sources.length !== next.sources.length) return false;
    for (let index = 0; index < next.sources.length; index += 1) {
      const previousSource = previous.sources[index];
      const nextSource = next.sources[index];
      if (!previousSource || !nextSource) return false;
      if (previousSource.sourceId !== nextSource.sourceId) return false;
      if (previousSource.assetId !== nextSource.assetId) return false;
      const soundscapeFadeCanCoverPatchRemoval =
        soundscapeFadeCanCoverAssetRemoval && nextSource.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape;
      if (!soundscapeFadeCanCoverPatchRemoval) {
        if (this.padPatchChanged(previousSource, nextSource) && !this.canApplyPadExactPatchDiff(previousSource, nextSource)) return false;
        if (this.leadPatchChanged(previousSource, nextSource)) return false;
        if (this.drumPatchChanged(previousSource, nextSource) && !this.canApplyDrumExactPatchDiff(previousSource, nextSource)) return false;
      }
    }
    return this.canApplyLaneDiffs(previous.synthLanes, next.synthLanes) &&
      this.canApplyLaneDiffs(previous.drumLanes, next.drumLanes);
  }

  private padPatchChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    return this.patchChanged(previous.exactPadParamCount, next.exactPadParamCount, previous.exactPadParams, next.exactPadParams, 'pad', previous.sourceId, next.sourceId);
  }

  private canApplyPadExactPatchDiff(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    if (!this.isPadSourceId(previous.sourceId) || previous.sourceId !== next.sourceId) return false;
    return previous.exactPadParamCount === KESSHO_PRODUCT_PAD_PARAM_COUNT && next.exactPadParamCount === KESSHO_PRODUCT_PAD_PARAM_COUNT;
  }

  private canApplyDrumExactPatchDiff(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    return previous.sourceId === CORE_PRODUCT_SOURCE_IDS.drum && previous.sourceId === next.sourceId && previous.exactDrumParamCount === KESSHO_PRODUCT_DRUM_PARAM_COUNT && next.exactDrumParamCount === KESSHO_PRODUCT_DRUM_PARAM_COUNT;
  }

  private isPadSourceId(sourceId: number): boolean {
    return sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 || sourceId === CORE_PRODUCT_SOURCE_IDS.pad2;
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

  private leadPatchChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    return this.patchChanged(previous.exactLeadParamCount, next.exactLeadParamCount, previous.exactLeadParams, next.exactLeadParams, 'lead', previous.sourceId, next.sourceId);
  }

  private drumPatchChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
    return this.patchChanged(previous.exactDrumParamCount, next.exactDrumParamCount, previous.exactDrumParams, next.exactDrumParams, 'drum', previous.sourceId, next.sourceId);
  }

  private patchChanged(previousCount: number, nextCount: number, previousParams: readonly number[], nextParams: readonly number[], patchKind: ExactPatchKind, previousSourceId: number, nextSourceId: number): boolean {
    if (previousCount !== nextCount) return true;
    const count = Math.max(previousCount, nextCount);
    for (let index = 0; index < count; index += 1) {
      if (this.valuesDiffer(
        this.requiredExactPatchParam(previousParams, index, patchKind, previousSourceId),
        this.requiredExactPatchParam(nextParams, index, patchKind, nextSourceId),
      )) {
        return true;
      }
    }
    return false;
  }

  private requiredExactPatchParam(params: readonly number[], index: number, patchKind: ExactPatchKind, sourceId: number): number {
    const value = params[index];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Core Product ${patchKind} patch for source ${sourceId} is missing required param ${index}`);
    }
    return value;
  }

  private canApplyLaneDiffs(previous: ProductLaneSnapshot[], next: ProductLaneSnapshot[]): boolean {
    if (previous.length !== next.length) return false;
    for (let index = 0; index < next.length; index += 1) {
      const previousLane = previous[index];
      const nextLane = next[index];
      if (!previousLane || !nextLane) return false;
      if (this.valuesDiffer(previousLane.morph, nextLane.morph)) return false;
      if (this.valuesDiffer(previousLane.distance, nextLane.distance)) return false;
      if (this.valuesDiffer(previousLane.expression, nextLane.expression)) return false;
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
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, previous.attackSeconds, next.attackSeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, previous.decaySeconds, next.decaySeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, previous.sustain, next.sustain, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, previous.holdSeconds, next.holdSeconds, targetId);
      this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, previous.releaseSeconds, next.releaseSeconds, targetId);
    }
  }

  private appendPadExactPatchDiffs(
    events: CoreProductEvent[],
    previousSources: ProductSourceSnapshot[],
    nextSources: ProductSourceSnapshot[],
  ): void {
    this.appendExactPatchDiffs(events, previousSources, nextSources, 'pad', KESSHO_PRODUCT_PAD_PARAM_COUNT, (previous, next) => this.canApplyPadExactPatchDiff(previous, next), (next, paramIndex) => coreProductPadRuntimeParamId(next.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2 ? 1 : 0, paramIndex));
  }

  private appendDrumExactPatchDiffs(
    events: CoreProductEvent[],
    previousSources: ProductSourceSnapshot[],
    nextSources: ProductSourceSnapshot[],
  ): void {
    this.appendExactPatchDiffs(events, previousSources, nextSources, 'drum', KESSHO_PRODUCT_DRUM_PARAM_COUNT, (previous, next) => this.canApplyDrumExactPatchDiff(previous, next), (_next, paramIndex) => coreProductDrumRuntimeParamId(paramIndex));
  }

  private appendExactPatchDiffs(events: CoreProductEvent[], previousSources: ProductSourceSnapshot[], nextSources: ProductSourceSnapshot[], patchKind: Exclude<ExactPatchKind, 'lead'>, paramCount: number, canApply: (previous: ProductSourceSnapshot, next: ProductSourceSnapshot) => boolean, paramId: (next: ProductSourceSnapshot, paramIndex: number) => number): void {
    for (let sourceIndex = 0; sourceIndex < nextSources.length; sourceIndex += 1) {
      const previous = previousSources[sourceIndex];
      const next = nextSources[sourceIndex];
      if (!previous || !next || !canApply(previous, next)) continue;
      const previousParams = patchKind === 'pad' ? previous.exactPadParams : previous.exactDrumParams;
      const nextParams = patchKind === 'pad' ? next.exactPadParams : next.exactDrumParams;
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        this.appendParamDiff(events, paramId(next, paramIndex), this.requiredExactPatchParam(previousParams, paramIndex, patchKind, previous.sourceId), this.requiredExactPatchParam(nextParams, paramIndex, patchKind, next.sourceId));
      }
    }
  }

  private appendSequencerLaneDiffs(
    events: CoreProductEvent[],
    sequencer: SequencerKind,
    previousLanes: ProductLaneSnapshot[],
    nextLanes: ProductLaneSnapshot[],
  ): void {
    for (let laneIndex = 0; laneIndex < nextLanes.length; laneIndex += 1) {
      const previous = previousLanes[laneIndex];
      const next = nextLanes[laneIndex];
      if (!previous || !next) continue;
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneEnabled, previous.enabled, next.enabled);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTargetSource, previous.targetSourceId, next.targetSourceId);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneStepCount, previous.stepCount, next.stepCount);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneFillCount, previous.fillCount, next.fillCount);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneRotation, previous.rotation, next.rotation);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision, previous.clockDivision, next.clockDivision);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, previous.swing, next.swing);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneProbability, previous.probability, next.probability);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneRatchet, previous.ratchet, next.ratchet);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTrigCondition, previous.trigCondition, next.trigCondition);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, previous.midiNote, next.midiNote);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneVelocity, previous.velocity, next.velocity);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneHoldSeconds, previous.holdSeconds, next.holdSeconds);
      this.appendLaneParamDiff(events, sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSeed, previous.seed, next.seed);
    }
  }

  private appendGranularVoiceDiffs(
    events: CoreProductEvent[],
    previousVoices: ProductGranularVoiceSnapshot[],
    nextVoices: ProductGranularVoiceSnapshot[],
  ): void {
    const fields: Array<[string, keyof ProductGranularVoiceSnapshot]> = [
      ['Enabled', 'enabled'],
      ['Mode', 'mode'],
      ['Slice', 'slice'],
      ['Speed', 'speed'],
      ['ScanRate', 'scanRate'],
      ['Reverse', 'reverse'],
      ['Pitch', 'pitch'],
      ['WriteFollow', 'writeFollow'],
      ['Density', 'density'],
      ['GrainSizeMs', 'grainSizeMs'],
      ['Spray', 'spray'],
      ['GrainOctaveProbability', 'grainOctaveProbability'],
      ['AttackSeconds', 'attackSeconds'],
      ['DecaySeconds', 'decaySeconds'],
      ['Gain', 'gain'],
      ['Pan', 'pan'],
      ['Blur', 'blur'],
      ['StereoSpread', 'stereoSpread'],
      ['PositionLfoRate', 'positionLfoRate'],
      ['PositionLfoDepth', 'positionLfoDepth'],
      ['PanLfoRate', 'panLfoRate'],
      ['ReverseLfoRate', 'reverseLfoRate'],
      ['RecordLfoRate', 'recordLfoRate'],
      ['EuclidGated', 'euclidGated'],
      ['EuclidMuted', 'euclidMuted'],
    ];
    for (let voiceIndex = 0; voiceIndex < 4; voiceIndex += 1) {
      const previous = previousVoices[voiceIndex];
      const next = nextVoices[voiceIndex];
      if (!previous || !next) continue;
      for (const [suffix, key] of fields) {
        const paramName = `FxGranularV${voiceIndex + 1}${suffix}` as ProductParamIdName;
        this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS[paramName], previous[key] as SnapshotScalar, next[key] as SnapshotScalar);
      }
    }
  }

  private appendFxRoutingMasterDiffs(
    events: CoreProductEvent[],
    previous: CoreProductSnapshot,
    next: CoreProductSnapshot,
  ): void {
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularMix, previous.fx.granularMix, next.fx.granularMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularEnabled, previous.fx.granularEnabled, next.fx.granularEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularFreeze, previous.fx.granularFreeze, next.fx.granularFreeze);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularFreezeWithFeedback, previous.fx.granularFreezeWithFeedback, next.fx.granularFreezeWithFeedback);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularFeedback, previous.fx.granularFeedback, next.fx.granularFeedback);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularFeedbackLpfHz, previous.fx.granularFeedbackLpfHz, next.fx.granularFeedbackLpfHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularReverbLpfHz, previous.fx.granularReverbLpfHz, next.fx.granularReverbLpfHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularOutputLpfHz, previous.fx.granularOutputLpfHz, next.fx.granularOutputLpfHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularBufferSeconds, previous.fx.granularBufferSeconds, next.fx.granularBufferSeconds);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularGrainShape, previous.fx.granularGrainShape, next.fx.granularGrainShape);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularBusDiffusion, previous.fx.granularBusDiffusion, next.fx.granularBusDiffusion);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularTimingRandomness, previous.fx.granularTimingRandomness, next.fx.granularTimingRandomness);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularChordBias, previous.fx.granularChordBias, next.fx.granularChordBias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyJitterMs, previous.fx.granularLegacyJitterMs, next.fx.granularLegacyJitterMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyProbability, previous.fx.granularLegacyProbability, next.fx.granularLegacyProbability);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyPitchMode, previous.fx.granularLegacyPitchMode, next.fx.granularLegacyPitchMode);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyPitchSpread, previous.fx.granularLegacyPitchSpread, next.fx.granularLegacyPitchSpread);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyMaxGrains, previous.fx.granularLegacyMaxGrains, next.fx.granularLegacyMaxGrains);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyFeedback, previous.fx.granularLegacyFeedback, next.fx.granularLegacyFeedback);
    this.appendGranularVoiceDiffs(events, previous.fx.granularVoices, next.fx.granularVoices);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAEnabled, previous.fx.delayAEnabled, next.fx.delayAEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeLeftMs, previous.fx.delayATimeLeftMs, next.fx.delayATimeLeftMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeRightMs, previous.fx.delayATimeRightMs, next.fx.delayATimeRightMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAFeedback, previous.fx.delayAFeedback, next.fx.delayAFeedback);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAMix, previous.fx.delayAMix, next.fx.delayAMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAFilterHz, previous.fx.delayAFilterHz, next.fx.delayAFilterHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAFilterType, previous.fx.delayAFilterType, next.fx.delayAFilterType);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAModRateHz, previous.fx.delayAModRateHz, next.fx.delayAModRateHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAModDepthMs, previous.fx.delayAModDepthMs, next.fx.delayAModDepthMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAPingPong, previous.fx.delayAPingPong, next.fx.delayAPingPong);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayADuck, previous.fx.delayADuck, next.fx.delayADuck);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayAWidth, previous.fx.delayAWidth, next.fx.delayAWidth);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayACrossFeedFilterHz, previous.fx.delayACrossFeedFilterHz, next.fx.delayACrossFeedFilterHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBEnabled, previous.fx.delayBEnabled, next.fx.delayBEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBActivity, previous.fx.delayBActivity, next.fx.delayBActivity);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBRepeats, previous.fx.delayBRepeats, next.fx.delayBRepeats);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBBaseTimeMs, previous.fx.delayBBaseTimeMs, next.fx.delayBBaseTimeMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBTone, previous.fx.delayBTone, next.fx.delayBTone);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBVibrato, previous.fx.delayBVibrato, next.fx.delayBVibrato);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix, previous.fx.delayBMix, next.fx.delayBMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBSpaceMode, previous.fx.delayBSpaceMode, next.fx.delayBSpaceMode);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBPattern, previous.fx.delayBPattern, next.fx.delayBPattern);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBWarp, previous.fx.delayBWarp, next.fx.delayBWarp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBWarpIntensity, previous.fx.delayBWarpIntensity, next.fx.delayBWarpIntensity);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDelayBSpread, previous.fx.delayBSpread, next.fx.delayBSpread);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbMix, previous.fx.reverbMix, next.fx.reverbMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbType, previous.fx.reverbType, next.fx.reverbType);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbQuality, previous.fx.reverbQuality, next.fx.reverbQuality);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbDecay, previous.fx.reverbDecay, next.fx.reverbDecay);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbSize, previous.fx.reverbSize, next.fx.reverbSize);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbDamping, previous.fx.reverbDamping, next.fx.reverbDamping);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbDiffusion, previous.fx.reverbDiffusion, next.fx.reverbDiffusion);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbModulation, previous.fx.reverbModulation, next.fx.reverbModulation);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPredelayMs, previous.fx.reverbPredelayMs, next.fx.reverbPredelayMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbWidth, previous.fx.reverbWidth, next.fx.reverbWidth);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerAmount, previous.fx.reverbShimmerAmount, next.fx.reverbShimmerAmount);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerPitch, previous.fx.reverbShimmerPitch, next.fx.reverbShimmerPitch);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbSlowRateHz, previous.fx.reverbSlowRateHz, next.fx.reverbSlowRateHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbSlowDepth, previous.fx.reverbSlowDepth, next.fx.reverbSlowDepth);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbReverseAmount, previous.fx.reverbReverseAmount, next.fx.reverbReverseAmount);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbReverseLengthSec, previous.fx.reverbReverseLengthSec, next.fx.reverbReverseLengthSec);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbChorusRateHz, previous.fx.reverbChorusRateHz, next.fx.reverbChorusRateHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbChorusDepth, previous.fx.reverbChorusDepth, next.fx.reverbChorusDepth);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbModCharacter, previous.fx.reverbModCharacter, next.fx.reverbModCharacter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbDampLow, previous.fx.reverbDampLow, next.fx.reverbDampLow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbDampHigh, previous.fx.reverbDampHigh, next.fx.reverbDampHigh);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbCrossoverHz, previous.fx.reverbCrossoverHz, next.fx.reverbCrossoverHz);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbInputTone, previous.fx.reverbInputTone, next.fx.reverbInputTone);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerFeedback, previous.fx.reverbShimmerFeedback, next.fx.reverbShimmerFeedback);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbWarp, previous.fx.reverbWarp, next.fx.reverbWarp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbCrossFeed, previous.fx.reverbCrossFeed, next.fx.reverbCrossFeed);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbEarlyReflections, previous.fx.reverbEarlyReflections, next.fx.reverbEarlyReflections);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbAirAbsorption, previous.fx.reverbAirAbsorption, next.fx.reverbAirAbsorption);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbSaturationMode, previous.fx.reverbSaturationMode, next.fx.reverbSaturationMode);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbTransientSmooth, previous.fx.reverbTransientSmooth, next.fx.reverbTransientSmooth);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbErLpFreq, previous.fx.reverbErLpFreq, next.fx.reverbErLpFreq);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompThreshold, previous.fx.reverbPreCompThreshold, next.fx.reverbPreCompThreshold);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompKnee, previous.fx.reverbPreCompKnee, next.fx.reverbPreCompKnee);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompRatio, previous.fx.reverbPreCompRatio, next.fx.reverbPreCompRatio);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompAttackMs, previous.fx.reverbPreCompAttackMs, next.fx.reverbPreCompAttackMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompReleaseMs, previous.fx.reverbPreCompReleaseMs, next.fx.reverbPreCompReleaseMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompMakeup, previous.fx.reverbPreCompMakeup, next.fx.reverbPreCompMakeup);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbChordWash, previous.fx.reverbChordWash, next.fx.reverbChordWash);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxReverbResolutionBloom, previous.fx.reverbResolutionBloom, next.fx.reverbResolutionBloom);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeMix, previous.fx.spectralFreezeMix, next.fx.spectralFreezeMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeEnabled, previous.fx.spectralFreezeEnabled, next.fx.spectralFreezeEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive, previous.fx.spectralFreezeActive, next.fx.spectralFreezeActive);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeSlushy, previous.fx.spectralFreezeSlushy, next.fx.spectralFreezeSlushy);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeSpeed, previous.fx.spectralFreezeSpeed, next.fx.spectralFreezeSpeed);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeDecay, previous.fx.spectralFreezeDecay, next.fx.spectralFreezeDecay);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezePhaseJitter, previous.fx.spectralFreezePhaseJitter, next.fx.spectralFreezePhaseJitter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeRouting, previous.fx.spectralFreezeRouting, next.fx.spectralFreezeRouting);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeReverbCrossfade, previous.fx.spectralFreezeReverbCrossfade, next.fx.spectralFreezeReverbCrossfade);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDrive, previous.fx.dynamicsDrive, next.fx.dynamicsDrive);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEnabled, previous.fx.dynamicsEnabled, next.fx.dynamicsEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterEnabled, previous.fx.dynamicsCharacterEnabled, next.fx.dynamicsCharacterEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterMode, previous.fx.dynamicsCharacterMode, next.fx.dynamicsCharacterMode);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterMix, previous.fx.dynamicsCharacterMix, next.fx.dynamicsCharacterMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterAge, previous.fx.dynamicsCharacterAge, next.fx.dynamicsCharacterAge);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterBias, previous.fx.dynamicsCharacterBias, next.fx.dynamicsCharacterBias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterLpgAmount, previous.fx.dynamicsCharacterLpgAmount, next.fx.dynamicsCharacterLpgAmount);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterResonance, previous.fx.dynamicsCharacterResonance, next.fx.dynamicsCharacterResonance);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterStereo, previous.fx.dynamicsCharacterStereo, next.fx.dynamicsCharacterStereo);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterEnvFollow, previous.fx.dynamicsCharacterEnvFollow, next.fx.dynamicsCharacterEnvFollow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterDepth, previous.fx.dynamicsCharacterDepth, next.fx.dynamicsCharacterDepth);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterRate, previous.fx.dynamicsCharacterRate, next.fx.dynamicsCharacterRate);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterDamp, previous.fx.dynamicsCharacterDamp, next.fx.dynamicsCharacterDamp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeEnabled, previous.fx.dynamicsDegradeEnabled, next.fx.dynamicsDegradeEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeMix, previous.fx.dynamicsDegradeMix, next.fx.dynamicsDegradeMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeAge, previous.fx.dynamicsDegradeAge, next.fx.dynamicsDegradeAge);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeGeneration, previous.fx.dynamicsDegradeGeneration, next.fx.dynamicsDegradeGeneration);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeAlias, previous.fx.dynamicsDegradeAlias, next.fx.dynamicsDegradeAlias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeWow, previous.fx.dynamicsDegradeWow, next.fx.dynamicsDegradeWow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeFlutter, previous.fx.dynamicsDegradeFlutter, next.fx.dynamicsDegradeFlutter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeDrift, previous.fx.dynamicsDegradeDrift, next.fx.dynamicsDegradeDrift);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeWobbleSpeed, previous.fx.dynamicsDegradeWobbleSpeed, next.fx.dynamicsDegradeWobbleSpeed);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeTone, previous.fx.dynamicsDegradeTone, next.fx.dynamicsDegradeTone);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeHp, previous.fx.dynamicsDegradeHp, next.fx.dynamicsDegradeHp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeLp, previous.fx.dynamicsDegradeLp, next.fx.dynamicsDegradeLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeNoise, previous.fx.dynamicsDegradeNoise, next.fx.dynamicsDegradeNoise);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeSaturation, previous.fx.dynamicsDegradeSaturation, next.fx.dynamicsDegradeSaturation);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeCorrosion, previous.fx.dynamicsDegradeCorrosion, next.fx.dynamicsDegradeCorrosion);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWow, previous.fx.dynamicsModSlowWow, next.fx.dynamicsModSlowWow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowFlutter, previous.fx.dynamicsModSlowFlutter, next.fx.dynamicsModSlowFlutter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowLp, previous.fx.dynamicsModSlowLp, next.fx.dynamicsModSlowLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWet, previous.fx.dynamicsModSlowWet, next.fx.dynamicsModSlowWet);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowDropout, previous.fx.dynamicsModSlowDropout, next.fx.dynamicsModSlowDropout);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowAlias, previous.fx.dynamicsModSlowAlias, next.fx.dynamicsModSlowAlias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterWow, previous.fx.dynamicsModFlutterWow, next.fx.dynamicsModFlutterWow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterFlutter, previous.fx.dynamicsModFlutterFlutter, next.fx.dynamicsModFlutterFlutter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterLp, previous.fx.dynamicsModFlutterLp, next.fx.dynamicsModFlutterLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterWet, previous.fx.dynamicsModFlutterWet, next.fx.dynamicsModFlutterWet);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterDropout, previous.fx.dynamicsModFlutterDropout, next.fx.dynamicsModFlutterDropout);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterAlias, previous.fx.dynamicsModFlutterAlias, next.fx.dynamicsModFlutterAlias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomWow, previous.fx.dynamicsModRandomWow, next.fx.dynamicsModRandomWow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomFlutter, previous.fx.dynamicsModRandomFlutter, next.fx.dynamicsModRandomFlutter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomLp, previous.fx.dynamicsModRandomLp, next.fx.dynamicsModRandomLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomWet, previous.fx.dynamicsModRandomWet, next.fx.dynamicsModRandomWet);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomDropout, previous.fx.dynamicsModRandomDropout, next.fx.dynamicsModRandomDropout);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomAlias, previous.fx.dynamicsModRandomAlias, next.fx.dynamicsModRandomAlias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvWow, previous.fx.dynamicsModEnvWow, next.fx.dynamicsModEnvWow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvFlutter, previous.fx.dynamicsModEnvFlutter, next.fx.dynamicsModEnvFlutter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvLp, previous.fx.dynamicsModEnvLp, next.fx.dynamicsModEnvLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvWet, previous.fx.dynamicsModEnvWet, next.fx.dynamicsModEnvWet);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvDropout, previous.fx.dynamicsModEnvDropout, next.fx.dynamicsModEnvDropout);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvAlias, previous.fx.dynamicsModEnvAlias, next.fx.dynamicsModEnvAlias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseWow, previous.fx.dynamicsModNoiseWow, next.fx.dynamicsModNoiseWow);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseFlutter, previous.fx.dynamicsModNoiseFlutter, next.fx.dynamicsModNoiseFlutter);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseLp, previous.fx.dynamicsModNoiseLp, next.fx.dynamicsModNoiseLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseWet, previous.fx.dynamicsModNoiseWet, next.fx.dynamicsModNoiseWet);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseDropout, previous.fx.dynamicsModNoiseDropout, next.fx.dynamicsModNoiseDropout);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseAlias, previous.fx.dynamicsModNoiseAlias, next.fx.dynamicsModNoiseAlias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationEnabled, previous.fx.dynamicsSaturationEnabled, next.fx.dynamicsSaturationEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationMode, previous.fx.dynamicsSaturationMode, next.fx.dynamicsSaturationMode);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationDrive, previous.fx.dynamicsSaturationDrive, next.fx.dynamicsSaturationDrive);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationTone, previous.fx.dynamicsSaturationTone, next.fx.dynamicsSaturationTone);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationBias, previous.fx.dynamicsSaturationBias, next.fx.dynamicsSaturationBias);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompEnabled, previous.fx.dynamicsEndCompEnabled, next.fx.dynamicsEndCompEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompThreshold, previous.fx.dynamicsEndCompThreshold, next.fx.dynamicsEndCompThreshold);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompKnee, previous.fx.dynamicsEndCompKnee, next.fx.dynamicsEndCompKnee);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompRatio, previous.fx.dynamicsEndCompRatio, next.fx.dynamicsEndCompRatio);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompAttackMs, previous.fx.dynamicsEndCompAttackMs, next.fx.dynamicsEndCompAttackMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompReleaseMs, previous.fx.dynamicsEndCompReleaseMs, next.fx.dynamicsEndCompReleaseMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMakeup, previous.fx.dynamicsEndCompMakeup, next.fx.dynamicsEndCompMakeup);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMix, previous.fx.dynamicsEndCompMix, next.fx.dynamicsEndCompMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompDetectorHp, previous.fx.dynamicsEndCompDetectorHp, next.fx.dynamicsEndCompDetectorHp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompDetectorTilt, previous.fx.dynamicsEndCompDetectorTilt, next.fx.dynamicsEndCompDetectorTilt);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompAutoMakeup, previous.fx.dynamicsEndCompAutoMakeup, next.fx.dynamicsEndCompAutoMakeup);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompProgramRelease, previous.fx.dynamicsEndCompProgramRelease, next.fx.dynamicsEndCompProgramRelease);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainEnabled, previous.fx.sidechainEnabled, next.fx.sidechainEnabled);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyA, previous.fx.sidechainKeyA, next.fx.sidechainKeyA);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyB, previous.fx.sidechainKeyB, next.fx.sidechainKeyB);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyAWeight, previous.fx.sidechainKeyAWeight, next.fx.sidechainKeyAWeight);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyBWeight, previous.fx.sidechainKeyBWeight, next.fx.sidechainKeyBWeight);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainAmount, previous.fx.sidechainAmount, next.fx.sidechainAmount);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainThreshold, previous.fx.sidechainThreshold, next.fx.sidechainThreshold);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainRatio, previous.fx.sidechainRatio, next.fx.sidechainRatio);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainKnee, previous.fx.sidechainKnee, next.fx.sidechainKnee);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainAttackMs, previous.fx.sidechainAttackMs, next.fx.sidechainAttackMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainHoldMs, previous.fx.sidechainHoldMs, next.fx.sidechainHoldMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainReleaseMs, previous.fx.sidechainReleaseMs, next.fx.sidechainReleaseMs);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainMakeup, previous.fx.sidechainMakeup, next.fx.sidechainMakeup);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainMix, previous.fx.sidechainMix, next.fx.sidechainMix);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainCurve, previous.fx.sidechainCurve, next.fx.sidechainCurve);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainDetectorHp, previous.fx.sidechainDetectorHp, next.fx.sidechainDetectorHp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainDetectorLp, previous.fx.sidechainDetectorLp, next.fx.sidechainDetectorLp);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad1Target, previous.fx.sidechainPad1Target, next.fx.sidechainPad1Target);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad2Target, previous.fx.sidechainPad2Target, next.fx.sidechainPad2Target);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainLead1Target, previous.fx.sidechainLead1Target, next.fx.sidechainLead1Target);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainLead2Target, previous.fx.sidechainLead2Target, next.fx.sidechainLead2Target);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainPianoTarget, previous.fx.sidechainPianoTarget, next.fx.sidechainPianoTarget);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainGranularTarget, previous.fx.sidechainGranularTarget, next.fx.sidechainGranularTarget);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainDelayATarget, previous.fx.sidechainDelayATarget, next.fx.sidechainDelayATarget);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainDelayBTarget, previous.fx.sidechainDelayBTarget, next.fx.sidechainDelayBTarget);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.FxSidechainReverbTarget, previous.fx.sidechainReverbTarget, next.fx.sidechainReverbTarget);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToDelayB, previous.routing.delayAToDelayB, next.routing.delayAToDelayB);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToDelayA, previous.routing.delayBToDelayA, next.routing.delayBToDelayA);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingDelayToReverb, previous.routing.delayToReverb, next.routing.delayToReverb);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToReverb, previous.routing.granularToReverb, next.routing.granularToReverb);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToGranular, previous.routing.delayAToGranular, next.routing.delayAToGranular);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToGranular, previous.routing.delayBToGranular, next.routing.delayBToGranular);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToReverb, previous.routing.delayBToReverb, next.routing.delayBToReverb);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDelayA, previous.routing.granularToDelayA, next.routing.granularToDelayA);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDelayB, previous.routing.granularToDelayB, next.routing.granularToDelayB);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.MasterGain, previous.master.gain, next.master.gain);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.MasterLimiterCeilingDb, previous.master.limiterCeilingDb, next.master.limiterCeilingDb);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.MasterSaturationMode, previous.master.saturationMode, next.master.saturationMode);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.MasterSaturationDrive, previous.master.saturationDrive, next.master.saturationDrive);
    this.appendParamDiff(events, KESSHO_PRODUCT_PARAM_IDS.MasterSaturationTone, previous.master.saturationTone, next.master.saturationTone);
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

export function buildCoreProductSnapshotDiff(
  previous: CoreProductSnapshot,
  next: CoreProductSnapshot,
  options: { forwardRngDiffs?: boolean } = {},
): CoreProductSnapshotDiffResult {
  return runtimeAdapter.buildSnapshotDiff(previous, next, options);
}
