import type { DynamicsVisualTelemetrySnapshot } from './engineSharedTypes';
import type { TransportDebugSnapshot } from './transport';
import { createCoreProductSnapshot, type CoreProductSnapshot } from './coreProductSnapshot';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { gainToDb } from './CoreProductHostRuntimeGuards';

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
  const effectiveBpm = Number.isFinite(transport.bpm) && transport.bpm > 0 ? transport.bpm : 120;
  const beatsPerBar = Math.max(1, transport.beatsPerBar || 4);
  const barsPerPhrase = Math.max(1, transport.barsPerPhrase || 4);
  const beatDurationSec = 60 / effectiveBpm;
  const effectivePhraseSeconds = beatDurationSec * beatsPerBar * barsPerPhrase;
  const beatsPerPhrase = beatsPerBar * barsPerPhrase;
  const beatPosition = Number.isFinite(telemetry.beatPosition ?? NaN) ? telemetry.beatPosition! : 0;
  const beatInPhrase = ((beatPosition % beatsPerPhrase) + beatsPerPhrase) % beatsPerPhrase;
  const remainingBeats = beatInPhrase === 0 && telemetry.transportRunning
    ? beatsPerPhrase
    : Math.max(0, beatsPerPhrase - beatInPhrase);
  return {
    effectiveBpm,
    effectivePhraseSeconds,
    nextPhraseBoundaryIn: telemetry.transportRunning ? remainingBeats * beatDurationSec : 0,
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
