import type { DynamicsVisualTelemetrySnapshot } from './engine';
import type { TransportDebugSnapshot } from './transport';
import type { CoreProductSnapshot } from './coreProductSnapshot';
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
  const saturationDrive = Math.max(0, telemetry.dynamicsSaturationDrive ?? telemetry.masterSaturationDrive ?? 0);
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
      characterEnv: Math.max(outputRms, outputPeak * 0.5),
      characterReductionDb: 0,
      dropoutGain: saturationDrive > 0 ? Math.max(0.25, 1 - Math.min(0.75, saturationDrive * 0.25)) : 1,
      endInputPeak: inputPeak,
      endOutputPeak: outputPeak,
      endReductionDb: limiterReductionDb,
      endDetectorDb: detectorDb,
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
