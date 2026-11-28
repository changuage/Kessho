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
  for (let index = 0; index < 8; index += 1) writer.f32(arrangement.sourceHoldSeconds[index] ?? 0.5);
  writer.u32(arrangement.padEuclidOwnedVoiceMask);
}
