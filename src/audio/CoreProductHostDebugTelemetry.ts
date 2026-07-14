import type { DynamicsVisualTelemetrySnapshot } from './engineSharedTypes';
import type { TransportDebugSnapshot } from './transport';
import { createCoreProductSnapshot, type CoreProductSnapshot } from './coreProductSnapshot';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { gainToDb } from './CoreProductHostRuntimeGuards';
import { logProductStateDebug, productStateDebugEnabled } from '../debug/productStateDebug';

export function createCoreProductDynamicsVisualTelemetry(
  telemetry: CoreProductTelemetrySnapshot | null,
  contextTime: number,
): DynamicsVisualTelemetrySnapshot {
  if (!telemetry) {
    return {
      contextTime,
      endCompHandledByWorklet: false,
      endCompReductionDb: 0,
      worklet: null,
      sidechainEvents: [],
    };
  }
  const inputPeak = Math.max(0, telemetry.masterInputPeak ?? 0);
  const outputPeak = Math.max(0, telemetry.masterTruePeak ?? telemetry.masterOutputPeak ?? 0);
  const outputRms = Math.max(0, telemetry.masterOutputRms ?? 0);
  const limiterReductionDb = Math.max(0, telemetry.masterLimiterGainReductionDb ?? 0);
  const saturationDrive = Math.max(0, telemetry.dynamicsSaturationDrive ?? 0);
  const detectorDb = Number.isFinite(telemetry.masterIntegratedLufs ?? NaN)
    ? telemetry.masterIntegratedLufs!
    : gainToDb(inputPeak);
  return {
    contextTime,
    endCompHandledByWorklet: true,
    endCompReductionDb: limiterReductionDb,
    worklet: {
      inputPeak,
      outputPeak,
      wetPeak: outputPeak,
      driftEnv: Math.max(outputRms, outputPeak * 0.5),
      driftReductionDb: 0,
      dropoutGain: saturationDrive > 0 ? Math.max(0.25, 1 - Math.min(0.75, saturationDrive * 0.25)) : 1,
      endInputPeak: inputPeak,
      endOutputPeak: outputPeak,
      endReductionDb: limiterReductionDb,
      endDetectorDb: detectorDb,
      driftCombRisk: 0,
      driftMinDelayMs: 0,
      driftDiffusion: 0,
      erosionEventEnv: 0,
      erosionEventGainDb: 0,
      erosionProfileAmount: 0,
      endLowReductionDb: 0,
      endHighReductionDb: 0,
      endClarityBoostDb: 0,
      endBandSplitHz: 170,
      endCompMode: 0,
      masterSatOversamplingFactor: 1,
      timestamp: contextTime,
    },
    sidechainEvents: [],
  };
}

export function createCoreProductTransportDebugState(
  telemetry: CoreProductTelemetrySnapshot | null,
  transport: CoreProductSnapshot['transport'] | undefined,
): TransportDebugSnapshot | null {
  if (!telemetry || !transport) return null;
  const effectiveBpm = Number.isFinite(telemetry.transportBpm ?? NaN) && telemetry.transportBpm! > 0
    ? telemetry.transportBpm!
    : Number.isFinite(transport.bpm) && transport.bpm > 0 ? transport.bpm : 120;
  const beatsPerBar = Math.max(1, telemetry.transportBeatsPerBar ?? transport.beatsPerBar ?? 4);
  const barsPerPhrase = Math.max(1, telemetry.transportBarsPerPhrase ?? transport.barsPerPhrase ?? 4);
  const effectivePhraseSeconds = Number.isFinite(telemetry.transportPhraseSeconds ?? NaN) && telemetry.transportPhraseSeconds! > 0
    ? telemetry.transportPhraseSeconds!
    : (60 / effectiveBpm) * beatsPerBar * barsPerPhrase;
  const progress = Math.max(0, Math.min(1, telemetry.transportPhraseProgress ?? 0));
  const pendingTransitionIn = telemetry.transportTransitionPending &&
      Number.isFinite(telemetry.transportPendingApplyFrame ?? NaN) &&
      Number.isFinite(telemetry.absoluteSampleTime ?? NaN) &&
      Number.isFinite(telemetry.sampleRate ?? NaN) && telemetry.sampleRate! > 0
    ? Math.max(0, (telemetry.transportPendingApplyFrame! - telemetry.absoluteSampleTime!) / telemetry.sampleRate!)
    : null;
  return {
    effectiveBpm,
    effectivePhraseSeconds,
    nextPhraseBoundaryIn: telemetry.transportRunning
      ? pendingTransitionIn ?? Math.max(0, (1 - progress) * effectivePhraseSeconds)
      : 0,
    pendingBpm: telemetry.transportTransitionPending ? telemetry.transportPendingBpm ?? null : null,
    pendingPhraseSeconds: telemetry.transportTransitionPending ? telemetry.transportPendingPhraseSeconds ?? null : null,
    pendingTransitionIn,
    transitionRevision: telemetry.transportTransitionRevision ?? 0,
    nextHarmonyEventIn: null,
    nextProgressionStepIn: null,
  };
}

export type CoreProductSonicParityDebugStateOptions = {
  engineMode: string;
  running: boolean;
  runtimeReady: boolean;
  runtimeError: unknown;
  hasOutputNode: boolean;
  latestProductSnapshot: CoreProductSnapshot | null;
  latestSliderState: Record<string, unknown> | null;
  latestTelemetry: CoreProductTelemetrySnapshot | null;
  runtimeWalkDebug: unknown;
};

/**
 * REFERENCE / A-B TESTING PATH
 *
 * This debug shape is required for sonic parity, smoke tests, product-test,
 * and A/B comparison. It remains active while reference validation exists.
 *
 * Status: Keep Active — Archive Later
 */
export function createCoreProductSonicParityDebugState({
  engineMode,
  running,
  runtimeReady,
  runtimeError,
  hasOutputNode,
  latestProductSnapshot,
  latestSliderState,
  latestTelemetry,
  runtimeWalkDebug,
}: CoreProductSonicParityDebugStateOptions): Record<string, unknown> {
  const snapshot = latestProductSnapshot ?? createCoreProductSnapshot(latestSliderState ?? undefined);
  return {
    engineMode,
    running,
    runtimeReady,
    runtimeError,
    hasOutputNode,
    snapshot: {
      master: snapshot.master,
      sources: snapshot.sources.map((source) => ({
        sourceId: source.sourceId,
        enabled: source.enabled,
        level: source.level,
        dryGain: source.dryGain,
        reverbSend: source.reverbSend,
        delayASend: source.delayASend,
        delayBSend: source.delayBSend,
        granularSend: source.granularSend,
        diffuseSend: source.diffuseSend,
        distance: source.distance,
        postLpfHz: source.postLpfHz,
        stereoWidth: source.stereoWidth,
        presetId: source.presetId,
        expression: source.expression,
        soundscapes: source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape ? {
          textureParamCount: snapshot.soundscape.textureParamCount,
          routeParams: snapshot.soundscape.textureParams.slice(0, 16),
          textureParams: snapshot.soundscape.textureParams.slice(17, 37),
          waterActive: snapshot.soundscape.moduleParams[0],
          waterSeed: snapshot.soundscape.moduleParams[60],
          insectsActive: snapshot.soundscape.moduleParams[61],
          insectsSeed: snapshot.soundscape.moduleParams[77],
          insects2Active: snapshot.soundscape.moduleParams[78],
          insects2Seed: snapshot.soundscape.moduleParams[94],
        } : undefined,
      })),
    },
    latestTelemetry,
    runtimeWalkDebug,
  };
}

export function logCoreProductDebugTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
  if (!productStateDebugEnabled()) return;
  const relevantSources = (telemetry.productDebugSourceStates ?? []).filter((source) =>
    source.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 ||
    source.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2 ||
    source.sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 ||
    source.sourceId === CORE_PRODUCT_SOURCE_IDS.lead2,
  );
  const recentSpawns = (telemetry.productDebugVoiceSpawns ?? [])
    .filter((spawn) =>
      spawn.sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 ||
      spawn.sourceId === CORE_PRODUCT_SOURCE_IDS.pad2 ||
      spawn.sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 ||
      spawn.sourceId === CORE_PRODUCT_SOURCE_IDS.lead2,
    )
    .slice(-8);
  logProductStateDebug({
    stage: 'cpp-product-telemetry',
    transportRunning: telemetry.transportRunning,
    absoluteSampleTime: telemetry.absoluteSampleTime ?? null,
    activeSources: relevantSources.map((source) => ({
      sourceId: source.sourceId,
      presetId: source.presetId,
      sourcePresetAId: source.sourcePresetAId,
      sourcePresetBId: source.sourcePresetBId,
      sourceRevision: source.sourceRevision,
      sourceStateHash: source.sourceStateHash,
      compiledSourceHash: source.compiledSourceHash,
      overrideBlockHash: source.overrideBlockHash,
    })),
    recentVoiceSpawns: recentSpawns.map((spawn) => ({
      triggerSequence: spawn.triggerSequence,
      triggerSample: spawn.triggerSample,
      sourceId: spawn.sourceId,
      voiceId: spawn.voiceId,
      presetId: spawn.presetId,
      sourceRevision: spawn.sourceRevision,
      sourceStateHash: spawn.sourceStateHash,
      compiledSourceHash: spawn.compiledSourceHash,
      overrideBlockHash: spawn.overrideBlockHash,
      triggerContextHash: spawn.triggerContextHash,
    })),
  });
}
