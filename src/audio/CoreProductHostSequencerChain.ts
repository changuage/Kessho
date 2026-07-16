import { createCoreProductSequencerLaneParamEvent, type CoreProductEvent } from './coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  normalizeSequencerChainState,
  sequencerChainPlayableRuntimeLanes,
  sequencerChainStateKey,
  type SequencerChainKind,
} from './sequencerChain';

type SequencerChainRuntimeOptions = {
  post: (event: CoreProductEvent) => void;
};

type NativeChainEntry = {
  laneIndex: number;
  durationSeconds: number;
};

const CHAIN_KINDS: SequencerChainKind[] = ['synth', 'drum'];

function runtimeState(
  sliderState: Record<string, unknown> | null | undefined,
  adapterState: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!sliderState && Object.keys(adapterState).length === 0) return null;
  return { ...(sliderState ?? {}), ...adapterState };
}

function nativeChainEntries(state: Record<string, unknown>, kind: SequencerChainKind): NativeChainEntry[] {
  const chain = normalizeSequencerChainState(state[sequencerChainStateKey(kind)]);
  if (!chain.enabled) return [];
  const lanes = sequencerChainPlayableRuntimeLanes(kind, state);
  return chain.entries.flatMap((entry) => {
    const lane = lanes.find((candidate) => candidate.laneIndex === entry.laneIndex);
    return lane
      ? [{
          laneIndex: entry.laneIndex,
          durationSeconds: Math.max(0.001, Math.min(4096, lane.durationSeconds * entry.repeats)),
        }]
      : [];
  });
}

export class CoreProductHostSequencerChain {
  private state: Record<string, unknown> | null = null;
  private running = false;
  private readonly lastConfigKey: Record<SequencerChainKind, string> = { synth: '', drum: '' };

  constructor(private readonly options: SequencerChainRuntimeOptions) {}

  start(sliderState: Record<string, unknown> | null | undefined, adapterState: Record<string, unknown>): void {
    this.state = runtimeState(sliderState, adapterState);
    this.running = true;
    this.forceApply();
  }

  update(
    sliderState: Record<string, unknown> | null | undefined,
    adapterState: Record<string, unknown>,
    force = false,
  ): void {
    this.state = runtimeState(sliderState, adapterState);
    if (!this.running) return;
    if (force) {
      this.forceApply();
      return;
    }
    for (const kind of CHAIN_KINDS) this.apply(kind);
  }

  stop(): void {
    if (this.running) {
      for (const kind of CHAIN_KINDS) this.postConfiguration(kind, []);
    }
    this.running = false;
    this.state = null;
    this.lastConfigKey.synth = '';
    this.lastConfigKey.drum = '';
  }

  forceApply(): void {
    if (!this.running) return;
    this.lastConfigKey.synth = '';
    this.lastConfigKey.drum = '';
    for (const kind of CHAIN_KINDS) this.apply(kind);
  }

  active(sliderState: Record<string, unknown> | null | undefined, adapterState: Record<string, unknown>): boolean {
    const state = runtimeState(sliderState, adapterState);
    if (!state) return false;
    return normalizeSequencerChainState(state.synthSequencerChain).enabled ||
      normalizeSequencerChainState(state.drumSequencerChain).enabled;
  }

  private apply(kind: SequencerChainKind): void {
    const entries = this.state ? nativeChainEntries(this.state, kind) : [];
    const key = JSON.stringify(entries);
    if (this.lastConfigKey[kind] === key) return;
    this.lastConfigKey[kind] = key;
    this.postConfiguration(kind, entries);
  }

  private postConfiguration(kind: SequencerChainKind, entries: readonly NativeChainEntry[]): void {
    this.options.post(createCoreProductSequencerLaneParamEvent(
      kind,
      0,
      KESSHO_PRODUCT_PARAM_IDS.SequencerChainEnabled,
      0,
    ));
    this.options.post(createCoreProductSequencerLaneParamEvent(
      kind,
      0,
      KESSHO_PRODUCT_PARAM_IDS.SequencerChainEntryCount,
      entries.length,
    ));
    entries.forEach((entry, index) => {
      this.options.post(createCoreProductSequencerLaneParamEvent(
        kind,
        index,
        KESSHO_PRODUCT_PARAM_IDS.SequencerChainEntryLane,
        entry.laneIndex,
      ));
      this.options.post(createCoreProductSequencerLaneParamEvent(
        kind,
        index,
        KESSHO_PRODUCT_PARAM_IDS.SequencerChainEntryDurationSeconds,
        entry.durationSeconds,
      ));
    });
    if (entries.length > 0) {
      this.options.post(createCoreProductSequencerLaneParamEvent(
        kind,
        0,
        KESSHO_PRODUCT_PARAM_IDS.SequencerChainEnabled,
        1,
      ));
    }
  }
}
