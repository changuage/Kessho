import type { CoreProductSnapshot } from './coreProductSnapshotTypes';

type HarmonySnapshotWriter = {
  u32(value: number): void;
  i32(value: number): void;
  f32(value: number): void;
  fixedUtf8(value: string, bytes: number): void;
};

export function encodeCoreProductHarmonySnapshot(
  harmony: CoreProductSnapshot['harmony'],
  writer: HarmonySnapshotWriter,
): void {
  const { u32, i32, f32, fixedUtf8 } = writer;
  f32(harmony.rootMidi);
  u32(harmony.scaleId);
  f32(harmony.tension);
  u32(harmony.chordMode);
  u32(harmony.voicingMode);
  u32(harmony.controlMode);
  u32(harmony.controlStrength);
  u32(harmony.activeSource);
  i32(harmony.activeSlotId);
  i32(harmony.activeStepIndex);
  u32(harmony.manualControlAvailable ? 1 : 0);
  u32(harmony.notePoolCount);
  for (let index = 0; index < 8; index += 1) f32(harmony.notePoolMidi[index] ?? 0);
  f32(harmony.bassMidi);
  u32(harmony.nextNotePoolCount);
  for (let index = 0; index < 8; index += 1) f32(harmony.nextNotePoolMidi[index] ?? 0);
  u32(harmony.nextSource);
  i32(harmony.nextStepIndex);
  f32(harmony.chordIntervalSeconds);
  fixedUtf8(harmony.seedMaterial, 128);
  u32(harmony.nextPhraseIndex);
  u32(Math.floor(harmony.nextPhraseIndex / 0x1_0000_0000));
  u32(harmony.nextProgressionPhraseIndex);
  u32(Math.floor(harmony.nextProgressionPhraseIndex / 0x1_0000_0000));
  f32(harmony.phraseLengthSeconds);
  f32(harmony.progressionPhraseSeconds);
  f32(harmony.voicingSpread);
  f32(harmony.detuneCents);
  u32(harmony.scaleMode);
  u32(harmony.phrasesUntilChange);
  i32(harmony.currentDegree);
  u32(harmony.progressionEnabled ? 1 : 0);
  for (let index = 0; index < 8; index += 1) i32(harmony.progressionPattern[index] ?? 0);
  u32(harmony.progressionStepEnabledMask);
  u32(harmony.progressionSteps);
  u32(harmony.progressionStep);
  u32(harmony.progressionPhraseMultiplier);
  u32(harmony.progressionPhraseCounter);
  u32(harmony.tensionArcType);
  u32(harmony.tensionArcPhrasesRemaining);
  u32(harmony.cofEnabled ? 1 : 0);
  i32(harmony.cofCurrentStep);
  u32(harmony.cofPhraseCounter);
  i32(harmony.cofHomeRoot);
  u32(harmony.cofDriftRate);
  u32(harmony.cofDriftDirection);
  u32(harmony.cofDriftRange);
}
