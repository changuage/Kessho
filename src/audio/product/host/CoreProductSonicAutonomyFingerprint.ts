import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';

function hashValue(hash: number, value: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.imul((hash ^ normalized) >>> 0, 0x01000193) >>> 0;
}

function hashArray(hash: number, values: readonly number[] | undefined, scale = 1): number {
  if (values === undefined) return hashValue(hash, 0);
  hash = hashValue(hash, values.length);
  for (const value of values) hash = hashValue(hash, value * scale);
  return hash;
}

export function deriveCoreProductSonicAutonomyFingerprint(
  telemetry: CoreProductTelemetrySnapshot,
): string {
  let hash = 0x811c9dc5;
  for (const value of [
    telemetry.rngState ?? 0,
    telemetry.transportRunning ? 1 : 0,
    telemetry.transportTransitionRevision ?? 0,
    telemetry.sourceMorphAutomationEnabledMask ?? 0,
    telemetry.autoStopEnabled ? 1 : 0,
    (telemetry.harmonyRootMidi ?? 0) * 1_000_000,
    telemetry.harmonyScaleId ?? 0,
    (telemetry.harmonyTension ?? 0) * 1_000_000,
    telemetry.harmonyChordDegree ?? 0,
    telemetry.harmonyActiveSource ?? 0,
    telemetry.harmonyActiveSlotId ?? -1,
    telemetry.harmonyActiveStepIndex ?? -1,
    telemetry.harmonyNextSource ?? 0,
    telemetry.harmonyNextStepIndex ?? -1,
    telemetry.scatterCurrentPhraseId ?? 0,
    telemetry.scatterCurrentVoice ?? 0,
    telemetry.scatterCurrentStep ?? 0,
    telemetry.scatterPulseCount ?? 0,
    telemetry.sceneProgramRevision ?? 0,
    (telemetry.scenePosition ?? 0) * 1_000_000,
    telemetry.routingMuteGroupRevision ?? 0,
    telemetry.routingMuteGroupActiveSlot ?? 0,
    telemetry.routingMuteGroupNextSlot ?? 0,
    telemetry.routingMuteGroupMask ?? 0,
    telemetry.routingMuteGroupTraceRevision ?? 0,
    telemetry.journeyScheduleRevision ?? 0,
    telemetry.journeyScheduleIndex ?? 0,
    telemetry.journeySchedulePhase ?? 0,
    telemetry.journeyTransitionCount ?? 0,
    telemetry.autoCycleRevision ?? 0,
    telemetry.autoCyclePhase ?? 0,
    (telemetry.autoCyclePosition ?? 0) * 1_000_000,
    telemetry.autoCycleTransitionCount ?? 0,
  ]) {
    hash = hashValue(hash, value);
  }
  hash = hashArray(hash, telemetry.sourceMorphValues, 1_000_000);
  hash = hashArray(hash, telemetry.harmonyChordMidi, 1_000_000);
  hash = hashArray(hash, telemetry.harmonyNotePoolMidi, 1_000_000);
  hash = hashArray(hash, telemetry.harmonyNextNotePoolMidi, 1_000_000);
  hash = hashArray(hash, telemetry.synthArpCurrentSteps);
  hash = hashArray(hash, telemetry.synthArpCurrentMidis, 1_000_000);
  hash = hashArray(hash, telemetry.synthSequencerHitCounts);
  hash = hashArray(hash, telemetry.drumSequencerHitCounts);
  return hash.toString(16).padStart(8, '0');
}

export type CoreProductSonicAutonomyObservation = {
  readonly fingerprint: string;
  readonly revision: number;
};

export class CoreProductSonicAutonomyTracker {
  private fingerprint: string | null = null;
  private revision = 0;

  observe(telemetry: CoreProductTelemetrySnapshot): CoreProductSonicAutonomyObservation {
    const fingerprint = deriveCoreProductSonicAutonomyFingerprint(telemetry);
    if (this.fingerprint !== null && fingerprint !== this.fingerprint) this.revision += 1;
    this.fingerprint = fingerprint;
    return { fingerprint, revision: this.revision };
  }
}
