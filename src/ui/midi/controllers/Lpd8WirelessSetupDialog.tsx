import React from 'react';
import { MIDI_MAPPABLE_PARAMS } from '../../../native/midi/midiMappableParams';
import type { KesshoMidiBindingV2 } from '../../../native/midi/midiRoutingProfile';
import {
  createMidiID,
  formatMidiSourceLabel,
  type KesshoMidiControlSource,
  type KesshoMidiEndpointInfo,
  type KesshoMidiValueCurve,
} from '../../../native/midi/midiTypes';
import { useMidiLearn } from '../../midiLearn/useMidiLearn';
import {
  LPD8_WIRELESS_CONTROLS,
  LPD8_WIRELESS_SYSTEM_BUTTONS,
  createEmptyLpd8WirelessSurfaceState,
  loadLpd8WirelessSurfaceState,
  resolveLpd8WirelessInput,
  saveLpd8WirelessSurfaceState,
  type Lpd8WirelessControlAssignment,
  type Lpd8WirelessControlDefinition,
  type Lpd8WirelessSurfaceState,
} from './lpd8WirelessSurface';
import './lpd8Wireless.css';

const MIDI_TARGETS = MIDI_MAPPABLE_PARAMS.filter((param) => (
  typeof param.defaultValue === 'number' && param.isPerformanceSafe
));

type Lpd8WirelessSetupDialogProps = {
  open: boolean;
  onClose: () => void;
};

function assignmentBinding(
  assignment: Lpd8WirelessControlAssignment | undefined,
  bindings: readonly KesshoMidiBindingV2[],
): KesshoMidiBindingV2 | null {
  if (!assignment?.bindingID) return null;
  return bindings.find((binding) => binding.id === assignment.bindingID) ?? null;
}

function inputLabel(input: KesshoMidiEndpointInfo): string {
  const transport = input.isBluetooth || input.transport === 'bluetooth' ? 'Bluetooth' : input.transport;
  return `${input.displayName ?? input.name}${transport ? ` · ${transport}` : ''}`;
}

function sourceFor(
  assignment: Lpd8WirelessControlAssignment,
  input: KesshoMidiEndpointInfo,
): KesshoMidiControlSource {
  return {
    kind: 'controlChange',
    channel: assignment.channel,
    number: assignment.ccNumber,
    endpointUniqueID: input.uniqueID,
    endpointName: input.name,
  };
}

function updateAssignment(
  state: Lpd8WirelessSurfaceState,
  controlID: string,
  updater: (assignment: Lpd8WirelessControlAssignment) => Lpd8WirelessControlAssignment,
): Lpd8WirelessSurfaceState {
  const current = state.assignments[controlID] ?? {
    controlID,
    ccNumber: null,
    channel: 0,
    bindingID: null,
  };
  return {
    ...state,
    assignments: {
      ...state.assignments,
      [controlID]: updater(current),
    },
  };
}

export function Lpd8WirelessSetupDialog({ open, onClose }: Lpd8WirelessSetupDialogProps) {
  const {
    activity,
    inputs,
    profile,
    removeBinding,
    setProfile,
    updateBinding,
  } = useMidiLearn();
  const [surfaceState, setSurfaceState] = React.useState<Lpd8WirelessSurfaceState>(() => (
    typeof window === 'undefined'
      ? createEmptyLpd8WirelessSurfaceState()
      : loadLpd8WirelessSurfaceState()
  ));
  const [selectedControlID, setSelectedControlID] = React.useState('knob-1');
  const [learningControlID, setLearningControlID] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState('Select a control, then learn or enter its CC source.');
  const [targetKey, setTargetKey] = React.useState(() => String(MIDI_TARGETS[0]?.key ?? ''));
  const [minimumValue, setMinimumValue] = React.useState(MIDI_TARGETS[0]?.min ?? 0);
  const [maximumValue, setMaximumValue] = React.useState(MIDI_TARGETS[0]?.max ?? 1);
  const [curve, setCurve] = React.useState<KesshoMidiValueCurve>(MIDI_TARGETS[0]?.defaultCurve ?? 'linear');
  const [invert, setInvert] = React.useState(false);
  const [smoothingMs, setSmoothingMs] = React.useState(10);
  const lastLearnActivityID = React.useRef<string | null>(null);

  const connectedInputs = React.useMemo(() => inputs.filter((input) => input.isConnected), [inputs]);
  const selectedInput = React.useMemo(
    () => resolveLpd8WirelessInput(inputs, surfaceState),
    [inputs, surfaceState],
  );
  const selectedControl = LPD8_WIRELESS_CONTROLS.find((control) => control.id === selectedControlID)
    ?? LPD8_WIRELESS_CONTROLS[0]
    ?? null;
  const selectedAssignment = selectedControl
    ? surfaceState.assignments[selectedControl.id]
    : undefined;
  const selectedBinding = assignmentBinding(selectedAssignment, profile.bindings);

  React.useEffect(() => {
    if (typeof window !== 'undefined') saveLpd8WirelessSurfaceState(surfaceState);
  }, [surfaceState]);

  React.useEffect(() => {
    if (!open || !selectedInput) return;
    setSurfaceState((current) => {
      if (
        current.inputUniqueID === selectedInput.uniqueID &&
        current.inputName === selectedInput.name &&
        current.inputPersistentIdentity === (selectedInput.persistentIdentity ?? null)
      ) return current;
      return {
        ...current,
        inputUniqueID: selectedInput.uniqueID,
        inputName: selectedInput.name,
        inputPersistentIdentity: selectedInput.persistentIdentity ?? null,
      };
    });
  }, [open, selectedInput]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  React.useEffect(() => {
    const target = selectedBinding
      ? MIDI_TARGETS.find((candidate) => candidate.key === selectedBinding.target.key)
      : MIDI_TARGETS[0];
    if (!target) return;
    setTargetKey(String(target.key));
    setMinimumValue(selectedBinding?.transform.minimumValue ?? target.min);
    setMaximumValue(selectedBinding?.transform.maximumValue ?? target.max);
    setCurve(selectedBinding?.transform.curve ?? target.defaultCurve);
    setInvert(selectedBinding?.transform.invert ?? false);
    setSmoothingMs(selectedBinding?.transform.smoothingMs ?? (selectedControl?.kind === 'pad' ? 0 : 10));
  }, [selectedBinding?.id, selectedControl?.id, selectedControl?.kind]);

  React.useEffect(() => {
    if (!learningControlID) return;
    const latest = activity[0];
    if (!latest || latest.id === lastLearnActivityID.current) return;
    lastLearnActivityID.current = latest.id;
    if (selectedInput && latest.message.endpointUniqueID !== selectedInput.uniqueID) return;
    if (latest.message.kind !== 'controlChange') {
      setNotice(`${latest.label} received. Kessho parameter routing currently expects CC; switch the pad to CC mode and try again.`);
      return;
    }
    if (typeof latest.message.data1 !== 'number' || typeof latest.message.channel !== 'number') return;

    setSurfaceState((current) => updateAssignment(current, learningControlID, (assignment) => ({
      ...assignment,
      ccNumber: latest.message.data1 ?? assignment.ccNumber,
      channel: latest.message.channel ?? assignment.channel,
    })));
    setSelectedControlID(learningControlID);
    setLearningControlID(null);
    setNotice(`${latest.label} learned. Choose a Kessho target and apply the mapping.`);
  }, [activity, learningControlID, selectedInput]);

  const latestMessage = activity[0]?.message;
  const liveControlID = React.useMemo(() => {
    if (!latestMessage || latestMessage.kind !== 'controlChange') return null;
    if (selectedInput && latestMessage.endpointUniqueID !== selectedInput.uniqueID) return null;
    if (typeof latestMessage.data1 !== 'number' || typeof latestMessage.channel !== 'number') return null;
    return LPD8_WIRELESS_CONTROLS.find((control) => {
      const assignment = surfaceState.assignments[control.id];
      return assignment?.ccNumber === latestMessage.data1 && assignment?.channel === latestMessage.channel;
    })?.id ?? null;
  }, [latestMessage, selectedInput, surfaceState.assignments]);

  const chooseInput = React.useCallback((input: KesshoMidiEndpointInfo) => {
    const now = new Date().toISOString();
    const bindingIDs = new Set(Object.values(surfaceState.assignments)
      .map((assignment) => assignment.bindingID)
      .filter((id): id is string => typeof id === 'string'));
    setSurfaceState((current) => ({
      ...current,
      inputUniqueID: input.uniqueID,
      inputName: input.name,
      inputPersistentIdentity: input.persistentIdentity ?? null,
    }));
    if (bindingIDs.size > 0) {
      setProfile({
        ...profile,
        updatedAt: now,
        bindings: profile.bindings.map((binding) => bindingIDs.has(binding.id)
          ? {
            ...binding,
            source: {
              ...binding.source,
              endpointUniqueID: input.uniqueID,
              endpointName: input.name,
            },
            updatedAt: now,
          }
          : binding),
      });
    }
  }, [profile, setProfile, surfaceState.assignments]);

  const armLearn = React.useCallback((control: Lpd8WirelessControlDefinition) => {
    lastLearnActivityID.current = activity[0]?.id ?? null;
    setSelectedControlID(control.id);
    setLearningControlID(control.id);
    setNotice(`Listening for ${control.label}. Move/press it on the LPD8 Wireless.`);
  }, [activity]);

  const applyMapping = React.useCallback(() => {
    if (!selectedControl || !selectedAssignment) return;
    if (!selectedInput) {
      setNotice('Connect and select the LPD8 Wireless input before applying a mapping.');
      return;
    }
    if (selectedAssignment.ccNumber === null) {
      setNotice('Learn the control or enter a CC number first.');
      return;
    }
    const target = MIDI_TARGETS.find((candidate) => String(candidate.key) === targetKey);
    if (!target) {
      setNotice('Choose a valid Kessho target.');
      return;
    }

    const now = new Date().toISOString();
    const source = sourceFor(selectedAssignment, selectedInput);
    const nextBinding: KesshoMidiBindingV2 = selectedBinding
      ? {
        ...selectedBinding,
        enabled: true,
        source: {
          kind: source.kind,
          channel: source.channel ?? null,
          number: source.number ?? null,
          endpointUniqueID: source.endpointUniqueID ?? null,
          endpointName: source.endpointName ?? null,
        },
        target: { key: target.key, label: target.label, group: target.group },
        transform: {
          minimumValue,
          maximumValue,
          curve,
          invert,
          pickupMode: selectedControl.kind === 'knob' ? 'soft-takeover' : 'none',
          smoothingMs: Math.max(0, Math.min(250, Math.round(smoothingMs))),
        },
        learn: {
          ...selectedBinding.learn,
          createdFromMessageLabel: formatMidiSourceLabel(source),
          learnedAt: now,
        },
        updatedAt: now,
      }
      : {
        id: createMidiID('midi-binding'),
        enabled: true,
        source: {
          kind: source.kind,
          channel: source.channel ?? null,
          number: source.number ?? null,
          endpointUniqueID: source.endpointUniqueID ?? null,
          endpointName: source.endpointName ?? null,
        },
        target: { key: target.key, label: target.label, group: target.group },
        transform: {
          minimumValue,
          maximumValue,
          curve,
          invert,
          pickupMode: selectedControl.kind === 'knob' ? 'soft-takeover' : 'none',
          smoothingMs: Math.max(0, Math.min(250, Math.round(smoothingMs))),
        },
        learn: {
          createdFromMessageLabel: formatMidiSourceLabel(source),
          learnedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      };

    if (selectedBinding) {
      updateBinding(selectedBinding.id, () => nextBinding);
    } else {
      setProfile({
        ...profile,
        updatedAt: now,
        bindings: [nextBinding, ...profile.bindings],
      });
      setSurfaceState((current) => updateAssignment(current, selectedControl.id, (assignment) => ({
        ...assignment,
        bindingID: nextBinding.id,
      })));
    }
    setNotice(`${selectedControl.label} → ${target.label} mapped.`);
  }, [
    curve,
    invert,
    maximumValue,
    minimumValue,
    profile,
    selectedAssignment,
    selectedBinding,
    selectedControl,
    selectedInput,
    setProfile,
    smoothingMs,
    targetKey,
    updateBinding,
  ]);

  const clearMapping = React.useCallback(() => {
    if (!selectedControl || !selectedAssignment) return;
    if (selectedAssignment.bindingID) removeBinding(selectedAssignment.bindingID);
    setSurfaceState((current) => updateAssignment(current, selectedControl.id, (assignment) => ({
      ...assignment,
      bindingID: null,
    })));
    setNotice(`${selectedControl.label} mapping cleared. Its learned CC source is preserved.`);
  }, [removeBinding, selectedAssignment, selectedControl]);

  const selectTarget = React.useCallback((nextKey: string) => {
    setTargetKey(nextKey);
    const target = MIDI_TARGETS.find((candidate) => String(candidate.key) === nextKey);
    if (!target) return;
    setMinimumValue(target.min);
    setMaximumValue(target.max);
    setCurve(target.defaultCurve);
  }, []);

  if (!open) return null;

  const mappedCount = LPD8_WIRELESS_CONTROLS.filter((control) => (
    assignmentBinding(surfaceState.assignments[control.id], profile.bindings) !== null
  )).length;

  const renderControl = (control: Lpd8WirelessControlDefinition) => {
    const assignment = surfaceState.assignments[control.id];
    const binding = assignmentBinding(assignment, profile.bindings);
    const selected = selectedControlID === control.id;
    const learning = learningControlID === control.id;
    const live = liveControlID === control.id;
    return (
      <button
        key={control.id}
        type="button"
        className={`lpd8-control ${control.kind} ${selected ? 'selected' : ''} ${learning ? 'learning' : ''} ${live ? 'live' : ''}`}
        onClick={() => setSelectedControlID(control.id)}
        onDoubleClick={() => armLearn(control)}
        aria-pressed={selected}
        title="Click to edit · double-click to MIDI learn"
      >
        {control.kind === 'knob' ? <span className="lpd8-knob-cap"><i /></span> : <span className="lpd8-pad-face" />}
        <strong>{control.label}</strong>
        <small>{binding ? binding.target.label : assignment?.ccNumber === null ? 'Unassigned' : `CC ${assignment?.ccNumber}`}</small>
      </button>
    );
  };

  return (
    <div className="lpd8-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="lpd8-dialog" role="dialog" aria-modal="true" aria-labelledby="lpd8-dialog-title">
        <header className="lpd8-dialog-header">
          <div>
            <span className="lpd8-eyebrow">MIDI controller surface</span>
            <h2 id="lpd8-dialog-title">Akai LPD8 Wireless</h2>
            <p>{mappedCount}/16 controls mapped · Kessho-side CC profile</p>
          </div>
          <button type="button" className="lpd8-close" onClick={onClose} aria-label="Close LPD8 setup">×</button>
        </header>

        <div className="lpd8-device-bar">
          <label>
            <span>MIDI input</span>
            <select value={selectedInput?.uniqueID ?? ''} onChange={(event) => {
              const id = Number(event.currentTarget.value);
              const input = connectedInputs.find((candidate) => candidate.uniqueID === id);
              if (input) chooseInput(input);
            }}>
              {connectedInputs.length === 0 ? <option value="">No connected MIDI inputs</option> : null}
              {connectedInputs.map((input) => (
                <option key={input.uniqueID} value={input.uniqueID}>{inputLabel(input)}</option>
              ))}
            </select>
          </label>
          <div className={`lpd8-connection ${selectedInput ? 'connected' : ''}`}>
            <i />
            <span>{selectedInput ? inputLabel(selectedInput) : 'Waiting for controller'}</span>
          </div>
          <button type="button" onClick={() => selectedControl && armLearn(selectedControl)} disabled={!selectedControl}>
            {learningControlID ? 'Listening…' : 'Learn selected'}
          </button>
        </div>

        <div className="lpd8-workspace">
          <div className="lpd8-surface-column">
            <div className="lpd8-device-shell" aria-label="LPD8 Wireless visual controller">
              <div className="lpd8-brand">
                <strong>AKAI</strong>
                <span>LPD8 WIRELESS</span>
              </div>
              <div className="lpd8-system-buttons" aria-label="Controller-local mode buttons">
                {LPD8_WIRELESS_SYSTEM_BUTTONS.map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="lpd8-pads">
                {LPD8_WIRELESS_CONTROLS.filter((control) => control.kind === 'pad').map(renderControl)}
              </div>
              <div className="lpd8-knobs">
                {LPD8_WIRELESS_CONTROLS.filter((control) => control.kind === 'knob').map(renderControl)}
              </div>
            </div>
            <div className="lpd8-hint">
              <strong>{learningControlID ? 'MIDI Learn armed' : 'Visual assignment'}</strong>
              <span>{notice}</span>
            </div>
          </div>

          <aside className="lpd8-inspector">
            <header>
              <div>
                <span>{selectedControl?.kind === 'pad' ? 'PAD / CC MODE' : 'ROTARY CC'}</span>
                <h3>{selectedControl?.label ?? 'Control'}</h3>
              </div>
              {selectedBinding ? <em>Mapped</em> : null}
            </header>

            <div className="lpd8-source-grid">
              <label>
                <span>CC</span>
                <input
                  type="number"
                  min={0}
                  max={127}
                  value={selectedAssignment?.ccNumber ?? ''}
                  placeholder="Learn"
                  onChange={(event) => {
                    if (!selectedControl) return;
                    const raw = event.currentTarget.value;
                    const number = raw === '' ? null : Math.max(0, Math.min(127, Math.round(Number(raw))));
                    setSurfaceState((current) => updateAssignment(current, selectedControl.id, (assignment) => ({
                      ...assignment,
                      ccNumber: Number.isFinite(number) ? number : null,
                    })));
                  }}
                />
              </label>
              <label>
                <span>Channel</span>
                <select
                  value={(selectedAssignment?.channel ?? 0) + 1}
                  onChange={(event) => {
                    if (!selectedControl) return;
                    const channel = Math.max(0, Math.min(15, Number(event.currentTarget.value) - 1));
                    setSurfaceState((current) => updateAssignment(current, selectedControl.id, (assignment) => ({
                      ...assignment,
                      channel,
                    })));
                  }}
                >
                  {Array.from({ length: 16 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>Ch {index + 1}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Kessho parameter</span>
              <select value={targetKey} onChange={(event) => selectTarget(event.currentTarget.value)}>
                {MIDI_TARGETS.map((target) => (
                  <option key={String(target.key)} value={String(target.key)}>{target.group} / {target.label}</option>
                ))}
              </select>
            </label>

            <div className="lpd8-source-grid">
              <label>
                <span>Min</span>
                <input type="number" value={minimumValue} onChange={(event) => setMinimumValue(Number(event.currentTarget.value))} />
              </label>
              <label>
                <span>Max</span>
                <input type="number" value={maximumValue} onChange={(event) => setMaximumValue(Number(event.currentTarget.value))} />
              </label>
            </div>

            <label>
              <span>Curve</span>
              <select value={curve} onChange={(event) => setCurve(event.currentTarget.value as KesshoMidiValueCurve)}>
                {(['linear', 'logarithmic', 'exponential', 'stepped'] as const).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <div className="lpd8-source-grid">
              <label>
                <span>Smoothing ms</span>
                <input type="number" min={0} max={250} value={smoothingMs} onChange={(event) => setSmoothingMs(Number(event.currentTarget.value))} />
              </label>
              <label className="lpd8-check">
                <input type="checkbox" checked={invert} onChange={(event) => setInvert(event.currentTarget.checked)} />
                <span>Invert range</span>
              </label>
            </div>

            <div className="lpd8-inspector-actions">
              <button type="button" className="primary" onClick={applyMapping}>Apply mapping</button>
              <button type="button" onClick={() => selectedControl && armLearn(selectedControl)}>Relearn CC</button>
              <button type="button" className="danger" onClick={clearMapping} disabled={!selectedBinding}>Clear</button>
            </div>

            <div className="lpd8-note">
              <strong>Pad behavior</strong>
              <span>For parameter control, use the LPD8 Wireless pads in CC mode. Note-mode pads remain on Kessho’s live-note path and are intentionally not hijacked by this editor.</span>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

export default Lpd8WirelessSetupDialog;
