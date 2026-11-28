import type React from 'react';

export const PAD_VOICE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const PAD_VOICE_MASK_ALL = 0xff;
export const PAD_VOICE_DEFAULT_MASK = 1 << 7;

/** How one of the eight shared pad voices is used: not at all, by Pad 1 or by Pad 2. */
export type PadVoiceAssignment = 'off' | 'pad1' | 'pad2';

export function padVoiceAssignment(voiceMask: number, pad2Assign: number, voice: number): PadVoiceAssignment {
  const bit = 1 << (voice - 1);
  if (((voiceMask & PAD_VOICE_MASK_ALL) & bit) === 0) return 'off';
  return ((pad2Assign & PAD_VOICE_MASK_ALL) & bit) !== 0 ? 'pad2' : 'pad1';
}

export function padVoiceButtonStyle(voice: number, assignment: PadVoiceAssignment): React.CSSProperties | undefined {
  if (assignment === 'off') return undefined;
  const hue = assignment === 'pad2' ? 260 + voice * 15 : 210 + voice * 25;
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 60%, 35%), hsl(${hue}, 60%, 25%))`,
    borderColor: `hsl(${hue}, 60%, 50%)`,
  };
}

export function padVoiceAssignmentLabel(assignment: PadVoiceAssignment): string {
  if (assignment === 'pad2') return 'Pad 2';
  if (assignment === 'pad1') return 'Pad 1';
  return 'Off';
}

/** Off, then Pad 1, then Pad 2, then off again. */
export function cyclePadVoiceAssignment(
  voiceMask: number,
  pad2Assign: number,
  voice: number,
): { voiceMask: number; pad2Assign: number } {
  const bit = 1 << (voice - 1);
  const assignment = padVoiceAssignment(voiceMask, pad2Assign, voice);
  let nextMask = voiceMask & PAD_VOICE_MASK_ALL;
  let nextAssign = pad2Assign & PAD_VOICE_MASK_ALL;
  if (assignment === 'off') {
    nextMask |= bit;
    nextAssign &= ~bit;
  } else if (assignment === 'pad1') {
    nextMask |= bit;
    nextAssign |= bit;
  } else {
    nextMask &= ~bit;
    nextAssign &= ~bit;
  }
  return { voiceMask: nextMask, pad2Assign: nextAssign };
}
