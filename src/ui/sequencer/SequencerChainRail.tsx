import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeSequencerChainState,
  resolveSequencerChainPosition,
  sequencerChainPlayableRuntimeLanes,
  sequencerChainLaneCount,
  sequencerChainStateKey,
  type SequencerChainKind,
  type SequencerChainRuntimePosition,
  type SequencerChainState,
} from '../../audio/sequencerChain';

export type SequencerChainLaneSummary = {
  name: string;
  color: string;
};

type SequencerChainRailProps = {
  chain: SequencerChainState;
  lanes: SequencerChainLaneSummary[];
  selectedLaneIndex: number;
  activeEntryIndex?: number | null;
  onChange: (chain: SequencerChainState) => void;
  onSelectLane?: (laneIndex: number) => void;
};

export function useSequencerChainUiPosition(options: {
  kind: SequencerChainKind;
  state: Record<string, unknown>;
  chain: unknown;
  running: boolean;
}): SequencerChainRuntimePosition | null {
  const { kind, state, chain, running } = options;
  const chainKey = useMemo(() => JSON.stringify(normalizeSequencerChainState(chain)), [chain]);
  const anchorRef = useRef(Date.now() / 1000);
  const [position, setPosition] = useState<SequencerChainRuntimePosition | null>(null);

  useEffect(() => {
    anchorRef.current = Date.now() / 1000;
  }, [chainKey, running]);

  useEffect(() => {
    const normalized = normalizeSequencerChainState(chain);
    if (!running || !normalized.enabled || normalized.entries.length === 0) {
      setPosition(null);
      return;
    }

    const tick = () => {
      setPosition(resolveSequencerChainPosition(
        normalized,
        sequencerChainPlayableRuntimeLanes(kind, state),
        Date.now() / 1000 - anchorRef.current,
      ));
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [chain, chainKey, kind, running, state]);

  return position;
}

export function createSequencerChainUiRuntimeState(
  kind: SequencerChainKind,
  state: Record<string, unknown>,
  clockDivs: readonly unknown[],
): Record<string, unknown> {
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const next = {
    ...state,
    [sequencerChainStateKey(kind)]: state[sequencerChainStateKey(kind)],
  };
  const laneCount = sequencerChainLaneCount(kind);
  for (let laneIndex = 0; laneIndex < Math.min(clockDivs.length, laneCount); laneIndex += 1) {
    next[`${prefix}${laneIndex + 1}ClockDivision`] = clockDivs[laneIndex];
  }
  return next;
}

export function sequencerChainBadgeLabel(chain: SequencerChainState, laneIndex: number): string | null {
  const normalized = normalizeSequencerChainState(chain);
  const entryIndex = normalized.entries.findIndex((entry) => entry.laneIndex === laneIndex);
  if (entryIndex < 0) return null;
  const entry = normalized.entries[entryIndex];
  if (!entry) return null;
  return `Chain ${entryIndex + 1} x${entry.repeats}`;
}

const SequencerChainRail: React.FC<SequencerChainRailProps> = ({
  chain,
  lanes,
  selectedLaneIndex,
  activeEntryIndex = null,
  onChange,
  onSelectLane,
}) => {
  const normalized = normalizeSequencerChainState(chain);

  const commit = (next: SequencerChainState) => onChange(normalizeSequencerChainState(next));
  const setEntryRepeats = (entryIndex: number, repeats: number) => {
    commit({
      ...normalized,
      entries: normalized.entries.map((entry, index) => (
        index === entryIndex ? { ...entry, repeats } : entry
      )),
    });
  };

  const addLane = (laneIndex: number) => {
    commit({
      ...normalized,
      enabled: true,
      entries: [
        ...normalized.entries,
        { laneIndex, repeats: 1 },
      ],
    });
  };

  return (
    <div className={`seq-chain-rail${normalized.enabled ? ' on' : ''}`}>
      <button
        type="button"
        className={`seq-chain-toggle${normalized.enabled ? ' on' : ''}`}
        onClick={() => commit({ ...normalized, enabled: !normalized.enabled })}
      >
        Chain
      </button>
      <div className="seq-chain-strip">
        {normalized.entries.map((entry, entryIndex) => {
          const lane = lanes[entry.laneIndex] ?? lanes[0] ?? { name: `Seq ${entry.laneIndex + 1}`, color: '#888' };
          const active = normalized.enabled && activeEntryIndex === entryIndex;
          return (
            <div
              key={`${entryIndex}-${entry.laneIndex}`}
              className={`seq-chain-chip${active ? ' active' : ''}`}
              style={{ '--sc': lane.color } as React.CSSProperties}
            >
              <button
                type="button"
                className="seq-chain-chip-name"
                onClick={() => onSelectLane?.(entry.laneIndex)}
              >
                {lane.name}
              </button>
              <div className="seq-chain-repeat-controls">
                <button
                  type="button"
                  onClick={() => setEntryRepeats(entryIndex, entry.repeats - 1)}
                  disabled={entry.repeats <= 1}
                  title="Decrease repeats"
                >
                  -
                </button>
                <span>x{entry.repeats}</span>
                <button
                  type="button"
                  onClick={() => setEntryRepeats(entryIndex, entry.repeats + 1)}
                  disabled={entry.repeats >= 16}
                  title="Increase repeats"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="seq-chain-remove"
                onClick={() => commit({
                  ...normalized,
                  entries: normalized.entries.filter((_, index) => index !== entryIndex),
                })}
                title="Remove from chain"
              >
                x
              </button>
            </div>
          );
        })}
        <div className="seq-chain-add-group">
          {lanes.map((lane, laneIndex) => (
            <button
              key={laneIndex}
              type="button"
              className={`seq-chain-add${selectedLaneIndex === laneIndex ? ' selected' : ''}`}
              style={{ '--sc': lane.color } as React.CSSProperties}
              onClick={() => addLane(laneIndex)}
              title={`Add ${lane.name} to chain`}
              aria-label={`Add ${lane.name} to chain`}
            >
              +{laneIndex + 1}
            </button>
          ))}
        </div>
      </div>
      {normalized.entries.length > 0 && (
        <button
          type="button"
          className="seq-chain-clear"
          onClick={() => commit({ ...normalized, enabled: false, entries: [] })}
        >
          Clear
        </button>
      )}
    </div>
  );
};

export default SequencerChainRail;
