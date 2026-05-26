import { delayNoteToSeconds } from './delayBuses';
import { booleanFromState, clamp, numberFromState, stringFromState } from './coreProductSnapshotState';

export function delayDivisionMs(state: Record<string, unknown> | undefined, key: string, fallback: string, bpm: number): number {
  return delayNoteToSeconds(stringFromState(state, key, fallback), bpm) * 1000;
}

export function delayBTapeHeadMaskFromState(state: Record<string, unknown> | undefined): number {
  let mask = 0;
  if (booleanFromState(state, 'delayBTapeHead1Enabled', true)) mask |= 1 << 0;
  if (booleanFromState(state, 'delayBTapeHead2Enabled', true)) mask |= 1 << 1;
  if (booleanFromState(state, 'delayBTapeHead3Enabled', true)) mask |= 1 << 2;
  if (booleanFromState(state, 'delayBTapeHead4Enabled', true)) mask |= 1 << 3;
  return mask;
}

export function delayBTapeHeadLevelsFromState(state: Record<string, unknown> | undefined): number[] {
  return [
    clamp(numberFromState(state, 'delayBTapeHead1Level', 0.72), 0, 1),
    clamp(numberFromState(state, 'delayBTapeHead2Level', 0.8), 0, 1),
    clamp(numberFromState(state, 'delayBTapeHead3Level', 0.88), 0, 1),
    clamp(numberFromState(state, 'delayBTapeHead4Level', 1), 0, 1),
  ];
}

export function delayBTapeHeadPansFromState(state: Record<string, unknown> | undefined): number[] {
  return [
    clamp(numberFromState(state, 'delayBTapeHead1Pan', 0.28), 0, 1),
    clamp(numberFromState(state, 'delayBTapeHead2Pan', 0.72), 0, 1),
    clamp(numberFromState(state, 'delayBTapeHead3Pan', 0.38), 0, 1),
    clamp(numberFromState(state, 'delayBTapeHead4Pan', 0.62), 0, 1),
  ];
}
