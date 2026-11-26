import { HARMONY_PROGRESSION_CAPACITY, reduceHarmonyProgression } from '../../audio/CoreProductHarmonyControl';
import { chordName, createFollowChord, previewChordNotes, type Chord } from '../../audio/harmony/chord';
import type { HarmonyProgression, HarmonyProgressionEvent } from '../../audio/harmony/harmonyTypes';

export interface HarmonyOverviewRow {
  id: string;
  index: number;
  source: HarmonyProgressionEvent['source'];
  duration: HarmonyProgressionEvent['duration'];
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
    summary: `${commonTones} common, ${direction}, move ${totalMovement}`,
  };
}

export function overviewRows(progression: HarmonyProgression, key: { rootPitchClass: number; scaleId: number }): HarmonyOverviewRow[] {
  let previousNotes: readonly number[] = [];
  return progression.events.map((event, index) => {
    const chord = event.source.type === 'chord' ? event.source.chord : null;
    const exactMidiNotes = chord ? previewChordNotes(chord, key.rootPitchClass, key.scaleId).map(Math.round) : [];
    const relation = index === 0 ? null : analyzeHarmonyVoiceLeading(previousNotes, exactMidiNotes);
    previousNotes = exactMidiNotes;
    return { id: event.id, index, source: event.source, duration: event.duration, label: chord ? chordName(chord, key.rootPitchClass, key.scaleId) : 'Auto', exactMidiNotes, relation };
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

export function updateHarmonyOverviewDuration(progression: HarmonyProgression, index: number, unit: HarmonyProgressionEvent['duration']['unit'], value: HarmonyProgressionEvent['duration']['value']): HarmonyProgression {
  return { ...progression, events: progression.events.map((event, eventIndex) => eventIndex === index ? { ...event, duration: { unit, value } } : event) };
}

/** Switch one event between Auto and Chord. Auto to Chord starts from a Follow
 * chord on `fallbackDegree` (the event's current engine degree); an event that
 * is already a Chord keeps it. */
export function setHarmonyOverviewSource(progression: HarmonyProgression, index: number, type: 'auto' | 'chord', fallbackDegree = 0): HarmonyProgression {
  const current = progression.events[index]?.source.type;
  if (current === undefined || current === type) return progression;
  return {
    ...progression,
    events: progression.events.map((event, eventIndex) => {
      if (eventIndex !== index) return event;
      if (type === 'auto') return { ...event, source: { type: 'auto' as const } };
      if (event.source.type === 'chord') return event;
      return { ...event, source: { type: 'chord' as const, chord: createFollowChord(Math.round(fallbackDegree)) } };
    }),
  };
}

/** Set one event's chord (an edit, or a copy placed from the Palette). */
export function setHarmonyOverviewChord(progression: HarmonyProgression, index: number, chord: Chord): HarmonyProgression {
  return {
    ...progression,
    events: progression.events.map((event, eventIndex) => eventIndex === index ? { ...event, source: { type: 'chord' as const, chord } } : event),
  };
}
