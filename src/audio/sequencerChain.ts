import { DRUM_EUCLIDEAN_LANE_COUNT, SYNTH_EUCLIDEAN_LANE_COUNT } from './sequencerLaneCounts';
import {
  defaultDrumEuclidPattern,
  defaultSynthEuclidPattern,
  resolveEuclidPatternParams,
} from './euclideanPatterns';
import { sequencerClockDivisionToNumericValue } from './sequencerClockDivisions';

export type SequencerChainKind = 'synth' | 'drum';

export type SequencerChainEntry = {
  laneIndex: number;
  repeats: number;
};

export type SequencerChainState = {
  version: 1;
  enabled: boolean;
  entries: SequencerChainEntry[];
};

export type SequencerChainLaneRuntime = {
  laneIndex: number;
  durationSeconds: number;
};

export type SequencerChainRuntimePosition = {
  activeEntryIndex: number;
  activeLaneIndex: number;
  cycleSeconds: number;
  entryElapsedSeconds: number;
  entryDurationSeconds: number;
  nextBoundarySeconds: number;
};

export const SYNTH_SEQUENCER_CHAIN_LANE_COUNT = SYNTH_EUCLIDEAN_LANE_COUNT;
export const DRUM_SEQUENCER_CHAIN_LANE_COUNT = DRUM_EUCLIDEAN_LANE_COUNT;
export const SEQUENCER_CHAIN_LANE_COUNT = SYNTH_SEQUENCER_CHAIN_LANE_COUNT;
export const SEQUENCER_CHAIN_MAX_LANE_COUNT = DRUM_SEQUENCER_CHAIN_LANE_COUNT;
export const SEQUENCER_CHAIN_MAX_ENTRIES = 16;
export const SEQUENCER_CHAIN_MAX_REPEATS = 16;

export function createDefaultSequencerChainState(): SequencerChainState {
  return {
    version: 1,
    enabled: false,
    entries: [],
  };
}

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeEntry(value: unknown): SequencerChainEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<SequencerChainEntry>;
  return {
    laneIndex: integerInRange(record.laneIndex, 0, 0, SEQUENCER_CHAIN_MAX_LANE_COUNT - 1),
    repeats: integerInRange(record.repeats, 1, 1, SEQUENCER_CHAIN_MAX_REPEATS),
  };
}

export function normalizeSequencerChainState(value: unknown): SequencerChainState {
  const fallback = createDefaultSequencerChainState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Partial<SequencerChainState>;
  const entries = Array.isArray(record.entries)
    ? record.entries
        .map(normalizeEntry)
        .filter((entry): entry is SequencerChainEntry => entry !== null)
        .slice(0, SEQUENCER_CHAIN_MAX_ENTRIES)
    : [];
  return {
    version: 1,
    enabled: record.enabled === true,
    entries,
  };
}

function numberFromState(state: Record<string, unknown> | null | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromState(state: Record<string, unknown> | null | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function defaultClockDivision(laneNumber: number): number {
  return laneNumber === 1 ? 8 : laneNumber === 2 ? 16 : laneNumber === 3 ? 12 : 4;
}

function effectiveSequencerBpm(state: Record<string, unknown> | null | undefined): number {
  const storedBpm = Math.max(1, numberFromState(state, 'sequencerMasterBPM', 120));
  if (state?.transportPrimaryClock !== 'seconds') return storedBpm;
  const beatsPerBar = Math.max(1, numberFromState(state, 'transportBeatsPerBar', 4));
  const barsPerPhrase = Math.max(1, numberFromState(state, 'transportBarsPerPhrase', 4));
  const phraseSeconds = Math.max(0.001, numberFromState(state, 'phraseLength', 16));
  return Math.max(1, (barsPerPhrase * beatsPerBar * 60) / phraseSeconds);
}

export function sequencerChainStateKey(kind: SequencerChainKind): 'synthSequencerChain' | 'drumSequencerChain' {
  return kind === 'synth' ? 'synthSequencerChain' : 'drumSequencerChain';
}

export function sequencerChainLaneCount(kind: SequencerChainKind): number {
  return kind === 'drum' ? DRUM_SEQUENCER_CHAIN_LANE_COUNT : SYNTH_SEQUENCER_CHAIN_LANE_COUNT;
}

export function sequencerChainEnabledForLane(
  kind: SequencerChainKind,
  state: Record<string, unknown> | null | undefined,
  laneIndex: number,
): boolean {
  const laneNumber = laneIndex + 1;
  if (kind === 'synth') {
    return booleanFromState(state, 'synthEuclideanMasterEnabled', false) &&
      booleanFromState(state, `synthEuclid${laneNumber}Enabled`, laneNumber === 1);
  }
  return booleanFromState(state, 'drumEnabled', false) &&
    booleanFromState(state, 'drumEuclidMasterEnabled', false) &&
    booleanFromState(state, `drumEuclid${laneNumber}Enabled`, false);
}

export function sequencerChainLaneDurationSeconds(
  kind: SequencerChainKind,
  state: Record<string, unknown> | null | undefined,
  laneIndex: number,
): number {
  const laneNumber = laneIndex + 1;
  const prefix = kind === 'synth' ? `synthEuclid${laneNumber}` : `drumEuclid${laneNumber}`;
  const defaults = kind === 'synth'
    ? defaultSynthEuclidPattern(laneIndex)
    : defaultDrumEuclidPattern(laneIndex);
  const resolved = resolveEuclidPatternParams(
    String(state?.[`${prefix}Preset`] ?? 'custom'),
    numberFromState(state, `${prefix}Steps`, defaults.steps),
    numberFromState(state, `${prefix}Hits`, defaults.hits),
    numberFromState(state, `${prefix}Rotation`, defaults.rotation),
  );
  const bpm = effectiveSequencerBpm(state);
  const tempo = kind === 'synth'
    ? Math.max(0.25, Math.min(12, numberFromState(state, 'synthEuclideanTempo', 1)))
    : Math.max(0.25, Math.min(4, numberFromState(state, 'drumEuclidTempo', 1)));
  const clockDivision = sequencerClockDivisionToNumericValue(
    state?.[`${prefix}ClockDivision`],
    defaultClockDivision(laneNumber),
  );
  return Math.max(0.001, resolved.steps * (60 / bpm) * 4 / Math.max(1, clockDivision) / tempo);
}

export function sequencerChainRuntimeLanes(
  kind: SequencerChainKind,
  state: Record<string, unknown> | null | undefined,
): SequencerChainLaneRuntime[] {
  return Array.from({ length: sequencerChainLaneCount(kind) }, (_, laneIndex) => ({
    laneIndex,
    durationSeconds: sequencerChainLaneDurationSeconds(kind, state, laneIndex),
  }));
}

export function sequencerChainPlayableRuntimeLanes(
  kind: SequencerChainKind,
  state: Record<string, unknown> | null | undefined,
): SequencerChainLaneRuntime[] {
  return sequencerChainRuntimeLanes(kind, state)
    .filter((lane) => sequencerChainEnabledForLane(kind, state, lane.laneIndex));
}

export function resolveSequencerChainPosition(
  chain: unknown,
  lanes: readonly SequencerChainLaneRuntime[],
  elapsedSeconds: number,
): SequencerChainRuntimePosition | null {
  const normalized = normalizeSequencerChainState(chain);
  if (!normalized.enabled || normalized.entries.length === 0) return null;

  const expanded = normalized.entries
    .map((entry, entryIndex) => {
      const lane = lanes.find((candidate) => candidate.laneIndex === entry.laneIndex);
      if (!lane) return null;
      const laneDuration = Math.max(0.001, lane.durationSeconds);
      return {
        entryIndex,
        laneIndex: entry.laneIndex,
        durationSeconds: laneDuration * entry.repeats,
      };
    })
    .filter((entry): entry is { entryIndex: number; laneIndex: number; durationSeconds: number } => entry !== null);
  if (expanded.length === 0) return null;
  const cycleSeconds = expanded.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  if (!Number.isFinite(cycleSeconds) || cycleSeconds <= 0) return null;

  const cycleElapsed = ((elapsedSeconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
  let cursor = 0;
  for (const entry of expanded) {
    const nextCursor = cursor + entry.durationSeconds;
    if (cycleElapsed < nextCursor) {
      const entryElapsedSeconds = cycleElapsed - cursor;
      return {
        activeEntryIndex: entry.entryIndex,
        activeLaneIndex: entry.laneIndex,
        cycleSeconds,
        entryElapsedSeconds,
        entryDurationSeconds: entry.durationSeconds,
        nextBoundarySeconds: Math.max(0.001, nextCursor - cycleElapsed),
      };
    }
    cursor = nextCursor;
  }

  const first = expanded[0];
  if (!first) return null;
  return {
    activeEntryIndex: first.entryIndex,
    activeLaneIndex: first.laneIndex,
    cycleSeconds,
    entryElapsedSeconds: 0,
    entryDurationSeconds: first.durationSeconds,
    nextBoundarySeconds: first.durationSeconds,
  };
}
