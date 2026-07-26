import type { CoreProductTelemetrySnapshot } from '../coreProductTelemetry';

/** Evidence source weights.  These are deliberately advisory and never feed Engine state. */
export const HARMONY_EVIDENCE_WEIGHTS = Object.freeze({
  playedChord: 1.0,
  progression: 0.92,
  seqTrigger: 0.78,
  slot: 0.52,
  baseline: 0.18,
  livePlay: 0.88,
  recognition: 0.95,
} as const);

export type HarmonyEvidenceKind = keyof typeof HARMONY_EVIDENCE_WEIGHTS;
export type HarmonyEvidenceScope = 'playing' | 'preview';

export interface HarmonyEvidenceEvent {
  kind: HarmonyEvidenceKind;
  scope?: HarmonyEvidenceScope;
  notes?: readonly number[];
  rootPitchClass?: number;
  bassMidi?: number;
  /** 0..1 event gain (velocity, confidence, or explicit weighting). */
  strength?: number;
  /** Muted/inaudible sources are intentionally ignored. */
  audible?: boolean;
  confirmed?: boolean;
  timestampMs?: number;
  /** Optional stable identity for diagnostics and trigger correlation. */
  id?: string;
  /** Optional function hint, e.g. dominant -> tonic. */
  functionHint?: 'tonic' | 'predominant' | 'dominant' | 'other';
}

export interface WeightedHarmonyEvidence extends HarmonyEvidenceEvent {
  weight: number;
  ageMs: number;
  repetitionFactor: number;
}

export interface HarmonyEvidenceSnapshot {
  nowMs: number;
  events: readonly WeightedHarmonyEvidence[];
}

export interface HarmonyEvidenceAccumulatorOptions {
  maxEvents?: number;
  halfLifeMs?: number;
}

const MAX_EVENTS = 96;
const HALF_LIFE_MS = 9000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pitchClass = (value: number) => ((Math.round(value) % 12) + 12) % 12;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function eventKey(event: HarmonyEvidenceEvent): string {
  const notes = Array.from(new Set((event.notes ?? []).map((note) => pitchClass(note)))).sort((a, b) => a - b).join(',');
  return `${event.kind}|${event.scope ?? 'playing'}|${event.rootPitchClass ?? ''}|${notes}`;
}

/**
 * Small bounded ring-like store for recent evidence.  It applies exponential decay
 * and a sqrt diminishing-return factor to repeated chord identities.
 */
export class HarmonyEvidenceAccumulator {
  private readonly maxEvents: number;
  private readonly halfLifeMs: number;
  private readonly events: HarmonyEvidenceEvent[] = [];
  private nowMs = 0;

  constructor(options: HarmonyEvidenceAccumulatorOptions = {}) {
    this.maxEvents = clamp(Math.round(options.maxEvents ?? MAX_EVENTS), 8, MAX_EVENTS);
    this.halfLifeMs = Math.max(250, options.halfLifeMs ?? HALF_LIFE_MS);
  }

  add(event: HarmonyEvidenceEvent, nowMs = event.timestampMs ?? this.nowMs): void {
    if (event.audible === false) return;
    const normalizedNow = finite(nowMs) ? nowMs : this.nowMs;
    this.nowMs = Math.max(this.nowMs, normalizedNow);
    const copy: HarmonyEvidenceEvent = {
      ...event,
      scope: event.scope ?? (event.kind === 'livePlay' ? 'preview' : 'playing'),
      strength: clamp(event.strength ?? 1, 0, 1),
      timestampMs: finite(event.timestampMs) ? event.timestampMs : normalizedNow,
      ...(finite(event.rootPitchClass) ? { rootPitchClass: pitchClass(event.rootPitchClass!) } : {}),
      ...(finite(event.bassMidi) ? { bassMidi: Math.round(event.bassMidi!) } : {}),
      ...(event.notes ? { notes: event.notes.filter(finite).slice(0, 8).map((note) => Math.round(note)) } : {}),
    };
    this.events.push(copy);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  advance(nowMs: number): void {
    if (finite(nowMs)) this.nowMs = Math.max(this.nowMs, nowMs);
  }

  clear(): void {
    this.events.length = 0;
  }

  snapshot(nowMs = this.nowMs): HarmonyEvidenceSnapshot {
    const current = finite(nowMs) ? Math.max(this.nowMs, nowMs) : this.nowMs;
    this.nowMs = current;
    const recentCounts = new Map<string, number>();
    const events: WeightedHarmonyEvidence[] = [];
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]!;
      const timestamp = event.timestampMs ?? current;
      const ageMs = Math.max(0, current - timestamp);
      const decay = Math.pow(0.5, ageMs / this.halfLifeMs);
      if (decay < 0.002) continue;
      const key = eventKey(event);
      const repetition = (recentCounts.get(key) ?? 0) + 1;
      recentCounts.set(key, repetition);
      const repetitionFactor = 1 / Math.sqrt(repetition);
      const base = HARMONY_EVIDENCE_WEIGHTS[event.kind] ?? 0;
      const weight = base * clamp(event.strength ?? 1, 0, 1) * decay * repetitionFactor * (event.confirmed ? 1.2 : 1);
      if (weight <= 0) continue;
      events.push({ ...event, weight, ageMs, repetitionFactor });
    }
    events.reverse();
    return { nowMs: current, events };
  }
}

export interface HarmonySeqTelemetryLane {
  laneId: string;
  enabled: boolean;
  muted?: boolean;
  hitCount: number;
  currentStep?: number;
  midiNotes?: readonly number[];
  rootPitchClass?: number;
  bassMidi?: number;
}

/** A resolved trigger observation supplied by a Seq/runtime event bridge. */
export interface HarmonySeqTriggerObservation {
  laneId: string;
  triggerOrdinal: number;
  timestampMs: number;
  notes?: readonly number[];
  rootPitchClass?: number;
  bassMidi?: number;
  audible: boolean;
  source?: 'seq' | 'progression' | 'slot';
}

export interface HarmonySeqTelemetryEvidenceInput {
  nowMs: number;
  lanes: readonly HarmonySeqTelemetryLane[];
  previousHitCounts?: Readonly<Record<string, number>>;
}

export interface HarmonySeqTelemetryEvidenceResult {
  events: HarmonyEvidenceEvent[];
  hitCounts: Record<string, number>;
}

/** Convert already-resolved trigger events without inspecting configured steps. */
export function harmonyEvidenceFromTriggerObservations(observations: readonly HarmonySeqTriggerObservation[]): HarmonyEvidenceEvent[] {
  const events: HarmonyEvidenceEvent[] = [];
  for (const observation of observations.slice(-32)) {
    if (!observation.audible) continue;
    const notes = observation.notes?.filter(finite).slice(0, 8).map((note) => Math.round(note));
    events.push({
      kind: observation.source === 'slot' ? 'slot' : observation.source === 'progression' ? 'progression' : 'seqTrigger',
      scope: 'playing',
      ...(notes && notes.length > 0 ? { notes } : {}),
      ...(observation.rootPitchClass !== undefined ? { rootPitchClass: observation.rootPitchClass } : {}),
      ...(observation.bassMidi !== undefined ? { bassMidi: observation.bassMidi } : {}),
      audible: true,
      timestampMs: observation.timestampMs,
      id: `seq:${observation.laneId}:${Math.round(observation.triggerOrdinal)}`,
    });
  }
  return events;
}

/**
 * Convert actual hit-count deltas into evidence.  Configured steps alone are not
 * evidence: a lane must be enabled, audible, and report a newly observed trigger.
 */
export function harmonyEvidenceFromSeqTelemetry(input: HarmonySeqTelemetryEvidenceInput): HarmonySeqTelemetryEvidenceResult {
  const events: HarmonyEvidenceEvent[] = [];
  const hitCounts: Record<string, number> = {};
  for (const lane of input.lanes.slice(0, 8)) {
    const count = Math.max(0, Math.round(lane.hitCount));
    hitCounts[lane.laneId] = count;
    if (!lane.enabled || lane.muted || count <= (input.previousHitCounts?.[lane.laneId] ?? 0)) continue;
    const step = Number.isFinite(lane.currentStep) ? Math.max(0, Math.round(lane.currentStep!)) : 0;
    const note = lane.midiNotes?.[step % Math.max(1, lane.midiNotes.length)] ?? undefined;
    // A hit ordinal without resolved pitch payload is telemetry, not tonal
    // evidence. Keep the count for the next delta comparison but do not let
    // payload-less triggers manufacture an Engine-like context.
    if (note === undefined && lane.rootPitchClass === undefined && lane.bassMidi === undefined) continue;
    events.push({
      kind: 'seqTrigger',
      scope: 'playing',
      ...(note !== undefined ? { notes: [note] } : {}),
      ...(lane.rootPitchClass !== undefined ? { rootPitchClass: lane.rootPitchClass } : {}),
      ...(lane.bassMidi !== undefined ? { bassMidi: lane.bassMidi } : {}),
      strength: 1,
      audible: true,
      timestampMs: input.nowMs,
      id: `seq:${lane.laneId}:${count}`,
    });
  }
  return { events, hitCounts };
}

/** Adapter for the Product telemetry shape; callers supply lane MIDI metadata. */
export function harmonyEvidenceFromProductTelemetry(
  telemetry: CoreProductTelemetrySnapshot,
  previousHitCounts: Readonly<Record<string, number>> = {},
  nowMs = Date.now(),
): HarmonySeqTelemetryEvidenceResult {
  const lanes: HarmonySeqTelemetryLane[] = [];
  const synthCounts = telemetry.synthSequencerHitCounts ?? [];
  const synthSteps = telemetry.synthSequencerCurrentSteps ?? [];
  const synthUi = telemetry.sequencerUiState?.synthLanes ?? [];
  for (let index = 0; index < Math.min(4, synthCounts.length); index += 1) {
    const lane = synthUi[index];
    // Product telemetry currently exposes hit ordinals/current step but not the
    // resolved chord payload. Do not mistake a configured single-note lane for
    // a chord; M16's richer trigger bridge can provide resolved `notes`.
    lanes.push({ laneId: `synth:${index}`, enabled: lane?.enabled ?? true, hitCount: synthCounts[index] ?? 0, currentStep: synthSteps[index] });
  }
  return harmonyEvidenceFromSeqTelemetry({ nowMs, lanes, previousHitCounts });
}
