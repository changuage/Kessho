import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addCapacitorMidiInputsChangedListener,
  addCapacitorMidiMessageListener,
  connectCapacitorMidiInput,
  createMidiBindingFromMessage,
  disconnectCapacitorMidiInput,
  formatMidiMessageLabel,
  formatMidiSourceLabel,
  getAvailableMidiRouteTargets,
  getMidiRouteTargetLabel,
  getMidiRouteTargetRange,
  isCapacitorMidiRoutingAvailable,
  isCapacitorNativeShell,
  loadKesshoMidiRoutingProfile,
  refreshCapacitorMidiInputs,
  routeMidiMessageToParameter,
  saveKesshoMidiRoutingProfile,
  setCapacitorMidiConnectedInputs,
  startCapacitorMidiRouting,
  type KesshoMidiBinding,
  type KesshoMidiControlSource,
  type KesshoMidiEndpointInfo,
  type KesshoMidiInputSnapshot,
  type KesshoMidiMessage,
  type KesshoMidiValueCurve,
} from '../../native/capacitorMidiRouting';
import type { SliderState } from '../state';

interface MidiRoutingPanelProps {
  onParamChange: (key: keyof SliderState, value: number) => void;
  onMidiMessage: (message: KesshoMidiMessage) => void;
}

const MIDI_CURVES: readonly KesshoMidiValueCurve[] = ['linear', 'exponential', 'logarithmic', 'stepped'];

function sortedIDs(ids: Iterable<number>): number[] {
  return Array.from(ids).sort((left, right) => left - right);
}

function sameSource(left: KesshoMidiControlSource, right: KesshoMidiControlSource): boolean {
  return left.kind === right.kind &&
    (left.channel ?? null) === (right.channel ?? null) &&
    (left.number ?? null) === (right.number ?? null) &&
    (left.endpointUniqueID ?? null) === (right.endpointUniqueID ?? null);
}

function sourceMatchesBinding(binding: KesshoMidiBinding, candidate: KesshoMidiBinding): boolean {
  return binding.targetKey === candidate.targetKey && sameSource(binding.source, candidate.source);
}

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export default function MidiRoutingPanel({ onParamChange, onMidiMessage }: MidiRoutingPanelProps) {
  const routeTargets = useMemo(() => getAvailableMidiRouteTargets(), []);
  const initialProfile = useMemo(() => loadKesshoMidiRoutingProfile(), []);
  const fallbackTarget = routeTargets[0]?.key ?? 'masterVolume';

  const [nativeShell, setNativeShell] = useState(false);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  const [inputs, setInputs] = useState<KesshoMidiEndpointInfo[]>([]);
  const [connectedInputIDs, setConnectedInputIDs] = useState<Set<number>>(
    () => new Set(initialProfile.connectedInputIDs),
  );
  const [bindings, setBindings] = useState<KesshoMidiBinding[]>(initialProfile.bindings);
  const [selectedTarget, setSelectedTarget] = useState<keyof SliderState>(fallbackTarget);
  const [learnTarget, setLearnTarget] = useState<keyof SliderState | null>(null);
  const [latestMessage, setLatestMessage] = useState<KesshoMidiMessage | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const bindingsRef = useRef(bindings);
  const learnTargetRef = useRef<keyof SliderState | null>(learnTarget);
  const onParamChangeRef = useRef(onParamChange);
  const onMidiMessageRef = useRef(onMidiMessage);

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    learnTargetRef.current = learnTarget;
  }, [learnTarget]);

  useEffect(() => {
    onParamChangeRef.current = onParamChange;
  }, [onParamChange]);

  useEffect(() => {
    onMidiMessageRef.current = onMidiMessage;
  }, [onMidiMessage]);

  useEffect(() => {
    saveKesshoMidiRoutingProfile({
      version: 1,
      connectedInputIDs: sortedIDs(connectedInputIDs),
      bindings,
    });
  }, [bindings, connectedInputIDs]);

  const applySnapshot = useCallback((snapshot: KesshoMidiInputSnapshot | null) => {
    if (!snapshot) return;
    setInputs(snapshot.inputs);
    setConnectedInputIDs(new Set(snapshot.connectedInputIDs));
  }, []);

  const refreshInputs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const snapshot = await refreshCapacitorMidiInputs();
      applySnapshot(snapshot);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Could not refresh MIDI inputs.');
    } finally {
      setIsRefreshing(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    let removeMessageListener: (() => Promise<void>) | null = null;
    let removeInputsListener: (() => Promise<void>) | null = null;

    setNativeShell(isCapacitorNativeShell());
    setBridgeAvailable(isCapacitorMidiRoutingAvailable());

    if (!isCapacitorMidiRoutingAvailable()) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        await startCapacitorMidiRouting();
        if (cancelled) return;

        const storedIDs = sortedIDs(initialProfile.connectedInputIDs);
        const snapshot = storedIDs.length > 0
          ? await setCapacitorMidiConnectedInputs(storedIDs)
          : await refreshCapacitorMidiInputs();
        if (!cancelled) {
          applySnapshot(snapshot);
          setLastError(null);
        }

        removeMessageListener = await addCapacitorMidiMessageListener((message) => {
          setLatestMessage(message);
          onMidiMessageRef.current(message);

          const target = learnTargetRef.current;
          if (target) {
            const learned = createMidiBindingFromMessage(message, target);
            if (learned) {
              setBindings((current) => [
                learned,
                ...current.filter((binding) => !sourceMatchesBinding(binding, learned)),
              ]);
              setLearnTarget(null);
            }
          }

          for (const binding of bindingsRef.current) {
            const routed = routeMidiMessageToParameter(message, binding);
            if (routed) {
              onParamChangeRef.current(routed.key, routed.value);
            }
          }
        });

        removeInputsListener = await addCapacitorMidiInputsChangedListener((nextSnapshot) => {
          applySnapshot(nextSnapshot);
        });
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : 'Could not start MIDI routing.');
        }
      }
    })();

    return () => {
      cancelled = true;
      void removeMessageListener?.();
      void removeInputsListener?.();
    };
  }, [applySnapshot, initialProfile]);

  const handleInputToggle = useCallback(async (input: KesshoMidiEndpointInfo, enabled: boolean) => {
    try {
      const snapshot = enabled
        ? await connectCapacitorMidiInput(input.uniqueID)
        : await disconnectCapacitorMidiInput(input.uniqueID);
      applySnapshot(snapshot);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : `Could not ${enabled ? 'connect' : 'disconnect'} MIDI input.`);
    }
  }, [applySnapshot]);

  const addBindingFromLatest = useCallback(() => {
    if (!latestMessage) return;
    const binding = createMidiBindingFromMessage(latestMessage, selectedTarget);
    if (!binding) return;
    setBindings((current) => [
      binding,
      ...current.filter((item) => !sourceMatchesBinding(item, binding)),
    ]);
  }, [latestMessage, selectedTarget]);

  const updateBinding = useCallback((
    id: string,
    updater: (binding: KesshoMidiBinding) => KesshoMidiBinding,
  ) => {
    setBindings((current) => current.map((binding) => {
      if (binding.id !== id) return binding;
      return {
        ...updater(binding),
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const removeBinding = useCallback((id: string) => {
    setBindings((current) => current.filter((binding) => binding.id !== id));
  }, []);

  if (!nativeShell) {
    return null;
  }

  return (
    <section
      className="routing-card midi-routing-card"
      style={{ '--sc': '#a5c4d4' } as React.CSSProperties}
    >
      <div className="routing-card-header midi-routing-header">
        <span className="routing-card-title">MIDI Routing</span>
        <span className={`midi-routing-status ${bridgeAvailable ? 'online' : 'offline'}`}>
          {bridgeAvailable ? 'Native' : 'Unavailable'}
        </span>
      </div>

      <div className="midi-routing-body">
        {!bridgeAvailable ? (
          <div className="midi-routing-empty">Native MIDI bridge unavailable in this shell.</div>
        ) : (
          <>
            <div className="midi-routing-toolbar">
              <select
                className="midi-routing-select"
                value={selectedTarget}
                aria-label="MIDI route target"
                onChange={(event) => setSelectedTarget(event.currentTarget.value as keyof SliderState)}
              >
                {routeTargets.map((target) => (
                  <option key={target.key} value={target.key}>
                    {target.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`midi-routing-button ${learnTarget ? 'active' : ''}`}
                onClick={() => setLearnTarget((current) => current ? null : selectedTarget)}
              >
                {learnTarget ? 'Listening' : 'Learn'}
              </button>

              <button
                type="button"
                className="midi-routing-button"
                disabled={!latestMessage}
                onClick={addBindingFromLatest}
              >
                Add
              </button>

              <button
                type="button"
                className="midi-routing-icon-button"
                aria-label="Refresh MIDI inputs"
                disabled={isRefreshing}
                onClick={() => void refreshInputs()}
              >
                R
              </button>
            </div>

            <div className="midi-routing-grid">
              <div className="midi-routing-pane">
                <div className="midi-routing-pane-title">Inputs</div>
                {inputs.length === 0 ? (
                  <div className="midi-routing-empty">No MIDI inputs detected.</div>
                ) : (
                  <div className="midi-input-list">
                    {inputs.map((input) => {
                      const isConnected = connectedInputIDs.has(input.uniqueID);
                      return (
                        <label key={input.uniqueID} className="midi-input-row">
                          <input
                            type="checkbox"
                            checked={isConnected}
                            onChange={(event) => void handleInputToggle(input, event.currentTarget.checked)}
                          />
                          <span className="midi-input-copy">
                            <span>{input.name}</span>
                            {input.manufacturer ? <small>{input.manufacturer}</small> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="midi-routing-pane">
                <div className="midi-routing-pane-title">Last Message</div>
                <div className="midi-routing-latest">{formatMidiMessageLabel(latestMessage)}</div>
                {lastError ? <div className="midi-routing-error">{lastError}</div> : null}
              </div>
            </div>

            <div className="midi-bindings-list">
              {bindings.length === 0 ? (
                <div className="midi-routing-empty">Learn or add a MIDI message to create a route.</div>
              ) : (
                bindings.map((binding) => {
                  const range = getMidiRouteTargetRange(binding.targetKey) ?? { min: 0, max: 1 };
                  const minValue = clampToRange(binding.minimumValue, range.min, range.max);
                  const maxValue = clampToRange(binding.maximumValue, range.min, range.max);

                  return (
                    <div key={binding.id} className={`midi-binding-row ${binding.enabled ? '' : 'disabled'}`}>
                      <label className="midi-binding-enable">
                        <input
                          type="checkbox"
                          checked={binding.enabled}
                          onChange={(event) => updateBinding(binding.id, (current) => ({
                            ...current,
                            enabled: event.currentTarget.checked,
                          }))}
                        />
                      </label>

                      <div className="midi-binding-source">{formatMidiSourceLabel(binding.source)}</div>

                      <select
                        className="midi-routing-select midi-binding-target"
                        value={binding.targetKey}
                        aria-label={`${binding.targetLabel} target`}
                        onChange={(event) => {
                          const targetKey = event.currentTarget.value as keyof SliderState;
                          const targetRange = getMidiRouteTargetRange(targetKey) ?? { min: 0, max: 1 };
                          updateBinding(binding.id, (current) => ({
                            ...current,
                            targetKey,
                            targetLabel: getMidiRouteTargetLabel(targetKey),
                            minimumValue: targetRange.min,
                            maximumValue: targetRange.max,
                          }));
                        }}
                      >
                        {routeTargets.map((target) => (
                          <option key={target.key} value={target.key}>
                            {target.label}
                          </option>
                        ))}
                      </select>

                      <input
                        className="midi-routing-number"
                        type="number"
                        value={minValue}
                        min={range.min}
                        max={range.max}
                        step="0.01"
                        aria-label={`${binding.targetLabel} minimum`}
                        onChange={(event) => {
                          const next = Number(event.currentTarget.value);
                          updateBinding(binding.id, (current) => ({
                            ...current,
                            minimumValue: clampToRange(next, range.min, range.max),
                          }));
                        }}
                      />

                      <input
                        className="midi-routing-number"
                        type="number"
                        value={maxValue}
                        min={range.min}
                        max={range.max}
                        step="0.01"
                        aria-label={`${binding.targetLabel} maximum`}
                        onChange={(event) => {
                          const next = Number(event.currentTarget.value);
                          updateBinding(binding.id, (current) => ({
                            ...current,
                            maximumValue: clampToRange(next, range.min, range.max),
                          }));
                        }}
                      />

                      <select
                        className="midi-routing-select midi-binding-curve"
                        value={binding.curve}
                        aria-label={`${binding.targetLabel} curve`}
                        onChange={(event) => updateBinding(binding.id, (current) => ({
                          ...current,
                          curve: event.currentTarget.value as KesshoMidiValueCurve,
                        }))}
                      >
                        {MIDI_CURVES.map((curve) => (
                          <option key={curve} value={curve}>
                            {curve}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="midi-routing-icon-button danger"
                        aria-label={`Remove ${binding.targetLabel} MIDI route`}
                        onClick={() => removeBinding(binding.id)}
                      >
                        x
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
