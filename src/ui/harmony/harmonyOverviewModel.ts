import { HARMONY_PROGRESSION_CAPACITY, reduceHarmonyProgression, type HarmonyChordSlot } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyProgression, HarmonyProgressionEvent } from '../../audio/harmony/harmonyTypes';
import { analyzeHarmonyBank, planEmptyUnusedHarmonySlot, planReplaceHarmonySlotReferences, type HarmonyReferenceState } from '../../audio/harmony/harmonyBankAnalysis';
import type { ProductPlayConfig } from '../../audio/productPlaySequencer';

export type HarmonyOverviewMode = 'arrange' | 'edit' | 'manage';

export interface HarmonyOverviewRow {
  id: string;
  index: number;
  source: HarmonyProgressionEvent['source'];
  duration: HarmonyProgressionEvent['duration'];
  slotId: number | null;
  label: string;
  exactMidiNotes: readonly number[];
  relation: HarmonyVoiceLeadingRelation | null;
}

export interface HarmonyVoiceLeadingRelation {
  commonTones: number;
  bassDelta: number | null;
  topDelta: number | null;
  totalMovement: number;
  summary: string;
}

export interface HarmonyOverviewWindow {
  rows: readonly HarmonyOverviewRow[];
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

/** Stable event-id focus target for virtualized rows. If a focused row is
 * outside the current window, retain its id and restore tab stop on re-entry. */
export function overviewFocusTarget(rows: readonly HarmonyOverviewRow[], focusedId: string | null, selectedIndex = 0): string | null {
  if (focusedId && rows.some((row) => row.id === focusedId)) return focusedId;
  return rows[Math.max(0, Math.min(rows.length - 1, selectedIndex))]?.id ?? null;
}

export interface HarmonyOverviewActionResult {
  ok: boolean;
  progression: HarmonyProgression;
  selectedIndex: number;
  error?: string;
}

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(Math.max(0, length - 1), Math.round(index)));

export function analyzeHarmonyVoiceLeading(previous: readonly number[], current: readonly number[]): HarmonyVoiceLeadingRelation | null {
  if (previous.length === 0 || current.length === 0) return null;
  const before = [...new Set(previous.map(Math.round))].sort((a, b) => a - b);
  const after = [...new Set(current.map(Math.round))].sort((a, b) => a - b);
  const beforeSet = new Set(before);
  const commonTones = after.filter((note) => beforeSet.has(note)).length;
  const paired = Math.min(before.length, after.length);
  let totalMovement = Math.abs(before.length - after.length) * 12;
  for (let index = 0; index < paired; index += 1) totalMovement += Math.abs(after[index]! - before[index]!);
  const bassDelta = after[0]! - before[0]!;
  const topDelta = after[after.length - 1]! - before[before.length - 1]!;
  const direction = bassDelta === 0 ? 'bass same' : `bass ${bassDelta > 0 ? '↑' : '↓'}${Math.abs(bassDelta)}`;
  return {
    commonTones,
    bassDelta,
    topDelta,
    totalMovement,
    summary: `${commonTones} common · ${direction} · move ${totalMovement}`,
  };
}

export function overviewRows(progression: HarmonyProgression, slots: readonly HarmonyChordSlot[]): HarmonyOverviewRow[] {
  let previousNotes: readonly number[] = [];
  return progression.events.map((event, index) => {
    const slotId = event.source.type === 'slot' ? event.source.slotId : null;
    const slot = slotId == null ? null : slots.find((entry) => entry.id === slotId);
    const exactMidiNotes = slot?.chord?.exactMidiNotes ?? [];
    const relation = index === 0 ? null : analyzeHarmonyVoiceLeading(previousNotes, exactMidiNotes);
    previousNotes = exactMidiNotes;
    return { id: event.id, index, source: event.source, duration: event.duration, slotId, label: slot?.chord?.recognizedLabel || slot?.name || (slotId == null ? 'Auto' : `S${slotId + 1}`), exactMidiNotes, relation };
  });
}

export function virtualizeOverviewRows(rows: readonly HarmonyOverviewRow[], scrollTop: number, viewportHeight: number, rowHeight = 76, overscan = 4): HarmonyOverviewWindow {
  if (rows.length <= 24) return { rows, start: 0, end: rows.length, offsetTop: 0, totalHeight: rows.length * rowHeight };
  const safeHeight = Math.max(rowHeight, viewportHeight);
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan);
  const end = Math.min(rows.length, Math.ceil((Math.max(0, scrollTop) + safeHeight) / rowHeight) + overscan);
  return { rows: rows.slice(start, end), start, end, offsetTop: start * rowHeight, totalHeight: rows.length * rowHeight };
}

function result(progression: HarmonyProgression, selectedIndex: number): HarmonyOverviewActionResult {
  return { ok: true, progression, selectedIndex: clampIndex(selectedIndex, progression.events.length) };
}

export function applyHarmonyOverviewAction(progression: HarmonyProgression, selectedIndex: number, action: 'add' | 'duplicate' | 'moveUp' | 'moveDown' | 'delete'): HarmonyOverviewActionResult {
  if (action === 'add') {
    if (progression.events.length >= HARMONY_PROGRESSION_CAPACITY) return { ok: false, progression, selectedIndex, error: 'Progression capacity is 64 events' };
    const next = reduceHarmonyProgression(progression, { type: 'insert', afterId: progression.events[selectedIndex]?.id ?? null });
    return result(next, selectedIndex + 1);
  }
  const selected = progression.events[clampIndex(selectedIndex, progression.events.length)];
  if (!selected) return { ok: false, progression, selectedIndex, error: 'No progression event selected' };
  if (action === 'duplicate') {
    if (progression.events.length >= HARMONY_PROGRESSION_CAPACITY) return { ok: false, progression, selectedIndex, error: 'Progression capacity is 64 events' };
    const next = reduceHarmonyProgression(progression, { type: 'duplicate', id: selected.id });
    return result(next, selectedIndex + 1);
  }
  if (action === 'moveUp' || action === 'moveDown') {
    const next = reduceHarmonyProgression(progression, { type: 'move', id: selected.id, direction: action === 'moveUp' ? 'up' : 'down' });
    return result(next, action === 'moveUp' ? selectedIndex - 1 : selectedIndex + 1);
  }
  if (progression.events.length <= 1) return { ok: false, progression, selectedIndex, error: 'At least one event is required' };
  const next = reduceHarmonyProgression(progression, { type: 'delete', id: selected.id });
  return result(next, Math.min(selectedIndex, next.events.length - 1));
}

export function makeUniqueHarmonySlot(slots: readonly HarmonyChordSlot[], sourceId: number): { ok: boolean; slots: HarmonyChordSlot[]; slotId: number | null; error?: string } {
  const source = slots.find((slot) => slot.id === sourceId);
  const target = slots.find((slot) => !slot.locked && !slot.chord);
  if (!source?.chord) return { ok: false, slots: slots.slice() as HarmonyChordSlot[], slotId: null, error: 'Source slot is empty' };
  if (!target) return { ok: false, slots: slots.slice() as HarmonyChordSlot[], slotId: null, error: 'No empty slot is available' };
  const chord = { ...source.chord, intent: source.chord.intent ? { ...source.chord.intent, extensions: [...source.chord.intent.extensions], capturedMidiNotes: [...source.chord.intent.capturedMidiNotes] } : null, exactMidiNotes: [...source.chord.exactMidiNotes] };
  return { ok: true, slots: slots.map((slot) => slot.id === target.id ? { ...slot, chord, name: `${source.name} copy` } : slot), slotId: target.id };
}

export function updateHarmonyOverviewDuration(progression: HarmonyProgression, index: number, unit: HarmonyProgressionEvent['duration']['unit'], value: HarmonyProgressionEvent['duration']['value']): HarmonyProgression {
  return { ...progression, events: progression.events.map((event, eventIndex) => eventIndex === index ? { ...event, duration: { unit, value } } : event) };
}

export function updateHarmonyOverviewSource(progression: HarmonyProgression, index: number, slotId: number | null): HarmonyProgression {
  return {
    ...progression,
    events: progression.events.map((event, eventIndex) => eventIndex === index
      ? { ...event, source: slotId == null ? { type: 'auto' as const } : { type: 'slot' as const, slotId } }
      : event),
  };
}

export function toggleHarmonyOverviewNote(slots: readonly HarmonyChordSlot[], slotId: number, note: number): HarmonyChordSlot[] {
  return slots.map((slot) => {
    if (slot.id !== slotId || !slot.chord) return slot;
    const exactMidiNotes = slot.chord.exactMidiNotes.includes(note) ? slot.chord.exactMidiNotes.filter((value) => value !== note) : [...slot.chord.exactMidiNotes, note].sort((a, b) => a - b);
    return { ...slot, chord: { ...slot.chord, exactMidiNotes } };
  });
}

export function analyzeOverviewBank(state: HarmonyReferenceState) {
  return analyzeHarmonyBank(state);
}

export function planOverviewReplaceReferences(state: HarmonyReferenceState, sourceId: number, targetId: number) {
  return planReplaceHarmonySlotReferences(state, sourceId, targetId);
}

export function planOverviewEmptyUnusedSlot(state: HarmonyReferenceState, slotId: number) {
  return planEmptyUnusedHarmonySlot(state, slotId);
}

export function productPlayConfigsToHarmonySeqChoices(
  configs: readonly ProductPlayConfig[],
): NonNullable<HarmonyReferenceState['seqPlayChoices']> {
  return configs.map((config, lane) => ({
    lane,
    steps: config.chord.steps.map((step, index) => ({ id: index, slotId: step.slotId })),
  }));
}

/** Apply an atomic Manage Pool reference plan while retaining every unrelated
 * Product Play field and structurally sharing lanes whose choices did not move. */
export function applyHarmonySeqChoiceReferences(
  configs: readonly ProductPlayConfig[],
  choices: HarmonyReferenceState['seqPlayChoices'],
): ProductPlayConfig[] {
  if (!choices) return configs.slice();
  return configs.map((config, lane) => {
    const nextLane = choices.find((candidate) => Number(candidate.lane) === lane);
    if (!nextLane) return config;
    let changed = false;
    const steps = config.chord.steps.map((step, index) => {
      const slotId = nextLane.steps[index]?.slotId ?? nextLane.steps[index]?.chordSlotId ?? step.slotId;
      if (slotId === step.slotId) return step;
      changed = true;
      return { ...step, slotId };
    });
    return changed ? { ...config, chord: { ...config.chord, steps } } : config;
  });
}
