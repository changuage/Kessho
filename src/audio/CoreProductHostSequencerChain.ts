import { createCoreProductSequencerLaneParamEvent, type CoreProductEvent } from './coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  SEQUENCER_CHAIN_LANE_COUNT,
  normalizeSequencerChainState,
  resolveSequencerChainPosition,
  sequencerChainEnabledForLane,
  sequencerChainPlayableRuntimeLanes,
  sequencerChainStateKey,
  type SequencerChainKind,
} from './sequencerChain';

type SequencerChainRuntimeOptions = {
  post: (event: CoreProductEvent) => void;
  nowMs: () => number;
};

type ChainRuntimeKindState = {
  anchorSeconds: number;
  key: string;
  lastDesired: boolean[] | null;
};

const CHAIN_KINDS: SequencerChainKind[] = ['synth', 'drum'];

function sameEnabledState(left: readonly boolean[] | null, right: readonly boolean[]): boolean {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < right.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function chainKey(state: Record<string, unknown>, kind: SequencerChainKind): string {
  return JSON.stringify(normalizeSequencerChainState(state[sequencerChainStateKey(kind)]));
}

function runtimeState(
  sliderState: Record<string, unknown> | null | undefined,
  adapterState: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!sliderState && Object.keys(adapterState).length === 0) return null;
  return { ...(sliderState ?? {}), ...adapterState };
}

export class CoreProductHostSequencerChain {
  private state: Record<string, unknown> | null = null;
  private running = false;
  private timer: number | null = null;
  private readonly kindState: Record<SequencerChainKind, ChainRuntimeKindState>;

  constructor(private readonly options: SequencerChainRuntimeOptions) {
    const nowSeconds = this.nowSeconds();
    this.kindState = {
      synth: { anchorSeconds: nowSeconds, key: '', lastDesired: null },
      drum: { anchorSeconds: nowSeconds, key: '', lastDesired: null },
    };
  }

  start(sliderState: Record<string, unknown> | null | undefined, adapterState: Record<string, unknown>): void {
    const state = runtimeState(sliderState, adapterState);
    this.state = state ? { ...state } : null;
    this.running = true;
    const nowSeconds = this.nowSeconds();
    for (const kind of CHAIN_KINDS) {
      this.kindState[kind].anchorSeconds = nowSeconds;
      this.kindState[kind].key = this.state ? chainKey(this.state, kind) : '';
      this.kindState[kind].lastDesired = null;
    }
    this.applyAndSchedule();
  }

  update(sliderState: Record<string, unknown> | null | undefined, adapterState: Record<string, unknown>, force = false): void {
    const state = runtimeState(sliderState, adapterState);
    this.state = state ? { ...state } : null;
    if (!this.running) return;
    const nowSeconds = this.nowSeconds();
    for (const kind of CHAIN_KINDS) {
      const nextKey = this.state ? chainKey(this.state, kind) : '';
      const runtime = this.kindState[kind];
      if (nextKey !== runtime.key) {
        runtime.anchorSeconds = nowSeconds;
        runtime.key = nextKey;
        runtime.lastDesired = null;
      }
    }
    if (force) {
      for (const kind of CHAIN_KINDS) this.kindState[kind].lastDesired = null;
    }
    this.applyAndSchedule();
  }

  stop(): void {
    this.running = false;
    this.state = null;
    this.clearTimer();
    for (const kind of CHAIN_KINDS) {
      this.kindState[kind].lastDesired = null;
    }
  }

  forceApply(): void {
    if (!this.running) return;
    for (const kind of CHAIN_KINDS) {
      this.kindState[kind].lastDesired = null;
    }
    this.applyAndSchedule();
  }

  active(sliderState: Record<string, unknown> | null | undefined, adapterState: Record<string, unknown>): boolean {
    const state = runtimeState(sliderState, adapterState);
    if (!state) return false;
    return normalizeSequencerChainState(state.synthSequencerChain).enabled ||
      normalizeSequencerChainState(state.drumSequencerChain).enabled;
  }

  private nowSeconds(): number {
    return this.options.nowMs() / 1000;
  }

  private desiredEnabled(kind: SequencerChainKind, nowSeconds: number): { enabled: boolean[]; nextBoundarySeconds: number | null } {
    const state = this.state;
    const base = Array.from({ length: SEQUENCER_CHAIN_LANE_COUNT }, (_, laneIndex) =>
      sequencerChainEnabledForLane(kind, state, laneIndex)
    );
    if (!state) return { enabled: base, nextBoundarySeconds: null };

    const chain = normalizeSequencerChainState(state[sequencerChainStateKey(kind)]);
    const position = resolveSequencerChainPosition(
      chain,
      sequencerChainPlayableRuntimeLanes(kind, state),
      nowSeconds - this.kindState[kind].anchorSeconds,
    );
    if (!position) return { enabled: base, nextBoundarySeconds: null };

    return {
      enabled: base.map((enabled, laneIndex) => enabled && laneIndex === position.activeLaneIndex),
      nextBoundarySeconds: position.nextBoundarySeconds,
    };
  }

  private applyAndSchedule(): void {
    this.clearTimer();
    if (!this.running) return;
    const nowSeconds = this.nowSeconds();
    let nextBoundarySeconds: number | null = null;

    for (const kind of CHAIN_KINDS) {
      const desired = this.desiredEnabled(kind, nowSeconds);
      const runtime = this.kindState[kind];
      if (!sameEnabledState(runtime.lastDesired, desired.enabled)) {
        for (let laneIndex = 0; laneIndex < desired.enabled.length; laneIndex += 1) {
          if (runtime.lastDesired?.[laneIndex] === desired.enabled[laneIndex]) continue;
          this.options.post(createCoreProductSequencerLaneParamEvent(
            kind,
            laneIndex,
            KESSHO_PRODUCT_PARAM_IDS.SequencerLaneEnabled,
            desired.enabled[laneIndex] ? 1 : 0,
          ));
        }
        runtime.lastDesired = [...desired.enabled];
      }
      if (desired.nextBoundarySeconds !== null) {
        nextBoundarySeconds = nextBoundarySeconds === null
          ? desired.nextBoundarySeconds
          : Math.min(nextBoundarySeconds, desired.nextBoundarySeconds);
      }
    }

    if (nextBoundarySeconds !== null) {
      const delayMs = Math.max(16, Math.min(60000, Math.ceil(nextBoundarySeconds * 1000) + 1));
      this.timer = window.setTimeout(() => this.applyAndSchedule(), delayMs);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
