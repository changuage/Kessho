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
  writer.u32(arrangement.chordSequencerEnabled ? 1 : 0);
  writer.u32(arrangement.chordSequencerSourceId);
  writer.u32(arrangement.chordSequencerVoiceCount);
  writer.u32(arrangement.chordSequencerStepCount);
  writer.u32(arrangement.chordSequencerEnabledMask);
  writer.f32(arrangement.chordSequencerStepSeconds);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.chordSequencerProbability[index] ?? 0);
  for (let index = 0; index < 8; index += 1) writer.u32(arrangement.chordSequencerHoldSteps[index] ?? 1);
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
  writer.u32(arrangement.chordSequencerPadSplit ? 1 : 0);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.sourceHoldSeconds[index] ?? 0.5);
  writer.u32(arrangement.pad1FitEnvelopeToChord ? 1 : 0);
  writer.u32(arrangement.pad2FitEnvelopeToChord ? 1 : 0);
  for (let index = 0; index < 8; index += 1) writer.u32(arrangement.chordSlotNoteCount[index] ?? 0);
  for (let index = 0; index < 64; index += 1) writer.f32(arrangement.chordSlotMidi[index] ?? 0);
  for (let index = 0; index < 8; index += 1) writer.i32(arrangement.chordStepSlotId[index] ?? -1);
  writer.u32(arrangement.chordSlotLaneEnabled ? 1 : 0);
  writer.u32(arrangement.chordExpressionMask);
  writer.u32(arrangement.chordMorphMask);
  writer.u32(arrangement.chordDistanceMask);
  writer.u32(arrangement.chordNudgeMask);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.chordExpression[index] ?? 1);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.chordMorph[index] ?? 0.5);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.chordDistance[index] ?? 0.5);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.chordNudge[index] ?? 0);
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.chordLaneValues[index] ?? index + 1);
  for (let index = 0; index < 5; index += 1) writer.u32(arrangement.chordSubLaneSteps[index] ?? 1);
  for (let index = 0; index < 5; index += 1) writer.u32(arrangement.chordSubLaneDirections[index] ?? 0);
  writer.u32(arrangement.chordPlaybackMode);
  writer.f32(arrangement.chordArpSpeedSeconds);
  writer.f32(arrangement.chordArpGate);
  writer.u32(arrangement.chordArpPatternLength);
  writer.u32(arrangement.chordArpActiveMask);
  for (let index = 0; index < 16; index += 1) writer.u32(arrangement.chordArpTone[index] ?? 1);
  for (let index = 0; index < 16; index += 1) writer.i32(arrangement.chordArpOctave[index] ?? 0);
  writer.u32(arrangement.chordStrumDirection);
  writer.f32(arrangement.chordStrumSpreadSeconds);
  writer.f32(arrangement.chordStrumCurve);
  writer.f32(arrangement.chordStrumGate);
  writer.f32(arrangement.chordStrumVelocityFalloff);
  writer.f32(arrangement.leadInitialDelaySeconds);
}
