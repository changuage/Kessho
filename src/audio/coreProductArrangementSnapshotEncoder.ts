import type { CoreProductSnapshot } from './coreProductSnapshotTypes';

type ArrangementWriter = {
  u32: (value: number) => void;
  i32: (value: number) => void;
  f32: (value: number) => void;
};

export function encodeCoreProductArrangementSnapshot(
  arrangement: CoreProductSnapshot['arrangement'],
  writer: ArrangementWriter,
): void {
  writer.u32(arrangement.chordGeneratorEnabled ? 1 : 0);
  writer.u32(arrangement.chordGeneratorSourceId);
  writer.u32(arrangement.chordGeneratorVoiceCount);
  writer.u32(arrangement.leadRandomEnabled ? 1 : 0);
  writer.u32(arrangement.leadRandomSourceId);
  writer.f32(arrangement.leadPhraseSeconds);
  writer.f32(arrangement.leadDensity);
  writer.i32(arrangement.leadOctave);
  writer.u32(arrangement.leadOctaveRange);
  writer.f32(arrangement.leadHoldSeconds);
  writer.f32(arrangement.leadVelocityMin);
  writer.f32(arrangement.leadVelocityMax);
  writer.u32(arrangement.rngState);
  writer.f32(arrangement.waveSpread);
  writer.i32(arrangement.synthOctave);
  writer.f32(arrangement.leadChordBias);
  writer.u32(arrangement.synthVoiceMask);
  writer.u32(arrangement.pad2VoiceAssign);
  writer.u32(arrangement.padEuclidOwnedVoiceMask);
  writer.u32(arrangement.chordGeneratorPadSplit ? 1 : 0);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.sourceHoldSeconds[index] ?? 0.5);
  writer.u32(arrangement.pad1FitEnvelopeToChord ? 1 : 0);
  writer.u32(arrangement.pad2FitEnvelopeToChord ? 1 : 0);
  writer.f32(arrangement.leadInitialDelaySeconds);
}
