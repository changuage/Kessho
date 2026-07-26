/** Bounded, audio-thread-free voice-leading metrics used by Harmony suggestions. */

export interface VoiceLeadingScore {
  score: number;
  voiceLeading: number;
  bassMotion: number;
  commonToneCount: number;
  semitoneMotion: number;
  totalMotion: number;
  dissonance: number;
  registerJump: number;
}

export interface VoiceLeadingOptions {
  /** Weight a lower-register move slightly more than an inner voice. */
  bassWeight?: number;
  /** Penalize changes with many notes a little more. */
  missingVoicePenalty?: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const pc = (value: number) => ((Math.round(value) % 12) + 12) % 12;

function finiteNotes(notes: readonly number[] | null | undefined): number[] {
  return (notes ?? []).filter((note): note is number => Number.isFinite(note)).map(Math.round).sort((a, b) => a - b);
}

/** Dissonance is deliberately conservative: adjacent chromatic notes and tritones
 * are the two reliable high-cost signals without attempting to identify every chord. */
function dissonance(notes: readonly number[]): number {
  const pcs = [...new Set(notes.map(pc))];
  let adjacent = 0;
  let tritone = 0;
  for (let i = 0; i < pcs.length; i += 1) {
    for (let j = i + 1; j < pcs.length; j += 1) {
      const distance = Math.min((pcs[j]! - pcs[i]! + 12) % 12, (pcs[i]! - pcs[j]! + 12) % 12);
      if (distance === 1) adjacent += 1;
      if (distance === 6) tritone += 1;
    }
  }
  return clamp(adjacent * 0.16 + tritone * 0.08);
}

/** Minimum-cost assignment between at most eight voices. Register is retained in
 * the cost so abrupt octave jumps are visible to the suggestion reranker. */
function minimumMotion(from: readonly number[], to: readonly number[]): number {
  if (from.length === 0 || to.length === 0) return Math.max(from.length, to.length) * 12;
  const source = from.length <= to.length ? from : to;
  const target = from.length <= to.length ? to : from;
  const count = target.length;
  const memo = new Map<string, number>();
  const solve = (index: number, used: number): number => {
    if (index >= source.length) return 0;
    const key = `${index}:${used}`;
    const prior = memo.get(key);
    if (prior !== undefined) return prior;
    let best = Infinity;
    const note = source[index]!;
    for (let targetIndex = 0; targetIndex < count; targetIndex += 1) {
      if (used & (1 << targetIndex)) continue;
      const targetNote = target[targetIndex]!;
      // Keep register in the cost; pitch-class common tones are tracked separately.
      const distance = Math.abs(note - targetNote);
      best = Math.min(best, distance + solve(index + 1, used | (1 << targetIndex)));
    }
    memo.set(key, best);
    return best;
  };
  const matched = solve(0, 0);
  return matched + Math.abs(from.length - to.length) * 7;
}

export function analyzeVoiceLeading(
  fromNotes: readonly number[] | null | undefined,
  toNotes: readonly number[] | null | undefined,
  options: VoiceLeadingOptions = {},
): VoiceLeadingScore {
  const from = finiteNotes(fromNotes);
  const to = finiteNotes(toNotes);
  if (from.length === 0 && to.length === 0) {
    return { score: 1, voiceLeading: 1, bassMotion: 1, commonToneCount: 0, semitoneMotion: 0, totalMotion: 0, dissonance: 0, registerJump: 0 };
  }
  const totalMotion = minimumMotion(from, to);
  const maxVoices = Math.max(from.length, to.length, 1);
  const semitoneMotion = clamp(totalMotion / (maxVoices * 12));
  const common = new Set(from.map(pc));
  const commonToneCount = to.filter((note) => common.has(pc(note))).length;
  const commonToneRatio = commonToneCount / maxVoices;
  const bassFrom = from[0];
  const bassTo = to[0];
  const rawBassMotion = bassFrom === undefined || bassTo === undefined ? 12 : Math.min(Math.abs(bassFrom - bassTo), Math.abs(bassFrom - bassTo - 12), Math.abs(bassFrom - bassTo + 12));
  const bassMotion = clamp(rawBassMotion / 12);
  const fromCenter = from.length ? (from[0]! + from[from.length - 1]!) / 2 : 0;
  const toCenter = to.length ? (to[0]! + to[to.length - 1]!) / 2 : 0;
  const spreadJump = from.length && to.length ? Math.abs((from[from.length - 1]! - from[0]!) - (to[to.length - 1]! - to[0]!)) / 24 : 1;
  const registerJump = from.length && to.length ? clamp(Math.max(spreadJump, Math.abs(toCenter - fromCenter) / 24)) : 1;
  const targetDissonance = dissonance(to);
  const missingVoicePenalty = options.missingVoicePenalty ?? 0.025;
  const voiceLeading = clamp(1 - semitoneMotion * 0.72 - registerJump * 0.24 - Math.abs(from.length - to.length) * missingVoicePenalty);
  const bassWeight = options.bassWeight ?? 0.2;
  const score = clamp(voiceLeading * 0.48 + commonToneRatio * 0.2 + (1 - bassMotion) * bassWeight + (1 - targetDissonance) * 0.12 + (1 - registerJump) * 0.15);
  return { score, voiceLeading, bassMotion: 1 - bassMotion, commonToneCount, semitoneMotion, totalMotion, dissonance: targetDissonance, registerJump };
}

export const voiceLeadingScore = analyzeVoiceLeading;
export const scoreVoiceLeading = analyzeVoiceLeading;
