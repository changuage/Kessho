import type { PresetContentCandidate, PresetContentNodeType } from './contentNodes';

export interface HarmonyContentInstance {
  id: string;
  refSlot: string;
  contentType: PresetContentNodeType;
  content: Record<string, unknown>;
}

const HARMONY_CONTEXT_KEYS = ['rootNote', 'scaleMode', 'manualScale', 'tension', 'voicingSpread'] as const;

export function buildHarmonyContentInstances(state: Record<string, unknown>): HarmonyContentInstance[] {
  const instances: HarmonyContentInstance[] = [];
  for (const [suffix, key] of [['a', 'harmonyChordSlotsA'], ['b', 'harmonyChordSlotsB']] as const) {
    if (Array.isArray(state[key])) instances.push({
      id: `harmony.chord.${suffix}`,
      refSlot: `harmony.program.chord-bank-${suffix}`,
      contentType: 'harmonyChordBank',
      content: { slots: state[key] },
    });
  }
  for (const [suffix, key, refSuffix] of [
    ['active', 'harmonyProgression', 'active'],
    ['a', 'harmonyProgressionA', 'a'],
    ['b', 'harmonyProgressionB', 'b'],
  ] as const) {
    if (state[key] && typeof state[key] === 'object') instances.push({
      id: `harmony.progression.${suffix}`,
      refSlot: `harmony.program.sequence-bank-${refSuffix}`,
      contentType: 'harmonySequenceBank',
      content: { progression: state[key] },
    });
  }
  instances.push({
    id: 'harmony.context',
    refSlot: 'harmony.program.context',
    contentType: 'harmonyContext',
    content: Object.fromEntries(HARMONY_CONTEXT_KEYS.map(key => [key, state[key]]).filter(([, value]) => value !== undefined)),
  });
  return instances;
}

export function harmonyContentCandidates(instances: readonly HarmonyContentInstance[]): PresetContentCandidate[] {
  return instances.map(instance => ({ id: instance.id, contentType: instance.contentType, content: instance.content }));
}

export function hydrateHarmonyContentRef(
  refSlot: string,
  contentType: string,
  content: Record<string, unknown>,
): Record<string, unknown> | null {
  if (refSlot === 'harmony.program.context' && contentType === 'harmonyContext') return content;
  const chord = /^harmony\.program\.chord-bank-([ab])$/.exec(refSlot);
  if (chord && contentType === 'harmonyChordBank') {
    return { [`harmonyChordSlots${chord[1]!.toUpperCase()}`]: content.slots };
  }
  const sequence = /^harmony\.program\.sequence-bank-([ab])$/.exec(refSlot);
  if (sequence && contentType === 'harmonySequenceBank') {
    if (content.progression !== undefined) {
      return { [`harmonyProgression${sequence[1]!.toUpperCase()}`]: content.progression };
    }
    return { [`harmonyChordSequence${sequence[1]!.toUpperCase()}`]: content.steps };
  }
  if (refSlot === 'harmony.program.sequence-bank-active' && contentType === 'harmonySequenceBank') {
    if (content.progression !== undefined) return { harmonyProgression: content.progression };
    return { harmonyChordSequence: content.steps };
  }
  return null;
}

export function stripHarmonyContentFromL4Override(data: Record<string, unknown>): Record<string, unknown> {
  const moved = new Set<string>([
    ...HARMONY_CONTEXT_KEYS,
    'harmonyChordSlotsA', 'harmonyChordSlotsB',
    'harmonyProgression', 'harmonyProgressionA', 'harmonyProgressionB',
  ]);
  return Object.fromEntries(Object.entries(data).filter(([key]) => !moved.has(key)));
}
