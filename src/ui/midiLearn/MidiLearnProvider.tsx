import React from 'react';
import {
  addCapacitorMidiInputsChangedListener,
  addCapacitorMidiMessageListener,
  connectCapacitorMidiInput,
  disconnectCapacitorMidiInput,
  getCapacitorMidiRoutingStatus,
  isCapacitorMidiRoutingAvailable,
  refreshCapacitorMidiInputs,
  setCapacitorMidiConnectedInputs,
  startCapacitorMidiRouting,
} from '../../native/capacitorMidiRouting';
import { dispatchMidiMappedParameterUpdate, midiUpdateFromBinding } from '../../native/midi/midiParameterEventAdapter';
import { detectMidiRoutingConflicts } from '../../native/midi/midiRoutingConflicts';
import { createMidiBindingFromCapturedSourceAndSlider } from '../../native/midi/midiRoutingLearn';
import {
  routeMidiMessageToParameter,
  type KesshoMidiBindingV2,
  type KesshoMidiRoutingProfileV2,
} from '../../native/midi/midiRoutingProfile';
import { loadKesshoMidiRoutingProfileV2, saveKesshoMidiRoutingProfileV2 } from '../../native/midi/midiRoutingStore';
import {
  createMidiID,
  formatMidiMessageLabel,
  formatMidiSourceLabel,
  sourceFromMidiMessage,
  type KesshoMidiEndpointInfo,
  type KesshoMidiMessage,
  type KesshoMidiStatus,
} from '../../native/midi/midiTypes';
import { midiMessageToProductLiveNoteEvent } from '../../native/midi/midiLiveNoteAdapter';
import type { ProductLiveNoteEvent } from '../../audio/product/liveNoteEvents';
import type { SliderState } from '../state';
import { MidiLearnContext, type MidiActivityEntry } from './useMidiLearn';
import { midiLearnReducer, type MidiLearnGlobalState } from './midiLearnStateMachine';
import { MidiLearnButton } from './MidiLearnButton';
import { MidiLearnBar } from './MidiLearnBar';
import './midiLearn.css';

const ACTIVITY_LIMIT = 48;
const MONITOR_THROTTLE_MS = 48;

export interface MidiLearnProviderProps {
  children: React.ReactNode;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onMidiMessage?: (message: KesshoMidiMessage) => void;
  onLiveNoteEvent?: (event: ProductLiveNoteEvent) => void;
  onOpenMidiPage?: () => void;
}

function sortedIDs(ids: Iterable<number>): number[] {
  return Array.from(ids).sort((left, right) => left - right);
}

export function MidiLearnProvider({
  children,
  onParamChange,
  onMidiMessage,
  onLiveNoteEvent,
  onOpenMidiPage,
}: MidiLearnProviderProps) {
  const [learnState, dispatchLearn] = React.useReducer(midiLearnReducer, { mode: 'off' } as MidiLearnGlobalState);
  const [profile, setProfileState] = React.useState<KesshoMidiRoutingProfileV2>(() => loadKesshoMidiRoutingProfileV2());
  const [inputs, setInputs] = React.useState<KesshoMidiEndpointInfo[]>([]);
  const [status, setStatus] = React.useState<KesshoMidiStatus | null>(null);
  const [activity, setActivity] = React.useState<MidiActivityEntry[]>([]);
  const [selectedBindingID, setSelectedBindingID] = React.useState<string | null>(null);
  const profileRef = React.useRef(profile);
  const learnStateRef = React.useRef(learnState);
  const onParamChangeRef = React.useRef(onParamChange);
  const onMidiMessageRef = React.useRef(onMidiMessage);
  const onLiveNoteEventRef = React.useRef(onLiveNoteEvent);
  const lastMonitorUpdateRef = React.useRef(0);

  React.useEffect(() => {
    profileRef.current = profile;
    saveKesshoMidiRoutingProfileV2(profile);
  }, [profile]);

  React.useEffect(() => {
    learnStateRef.current = learnState;
  }, [learnState]);

  React.useEffect(() => {
    onParamChangeRef.current = onParamChange;
  }, [onParamChange]);

  React.useEffect(() => {
    onMidiMessageRef.current = onMidiMessage;
  }, [onMidiMessage]);

  React.useEffect(() => {
    onLiveNoteEventRef.current = onLiveNoteEvent;
  }, [onLiveNoteEvent]);

  const bridgeAvailable = isCapacitorMidiRoutingAvailable();
  const conflicts = React.useMemo(() => detectMidiRoutingConflicts(profile), [profile]);

  const applyInputSnapshot = React.useCallback((snapshot: { inputs: KesshoMidiEndpointInfo[]; connectedInputIDs: number[] } | null) => {
    if (!snapshot) return;
    setInputs(snapshot.inputs);
    setProfileState((current) => ({
      ...current,
      connectedInputIDs: sortedIDs(snapshot.connectedInputIDs),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const startService = React.useCallback(async () => {
    if (!isCapacitorMidiRoutingAvailable()) {
      dispatchLearn({ type: 'ERROR', message: 'MIDI not available' });
      return;
    }
    const nextStatus = await startCapacitorMidiRouting();
    setStatus(nextStatus);
    const storedIDs = sortedIDs(profileRef.current.connectedInputIDs);
    const snapshot = storedIDs.length > 0
      ? await setCapacitorMidiConnectedInputs(storedIDs)
      : await refreshCapacitorMidiInputs();
    applyInputSnapshot(snapshot);
  }, [applyInputSnapshot]);

  const refreshInputs = React.useCallback(async () => {
    if (!isCapacitorMidiRoutingAvailable()) return;
    const snapshot = await refreshCapacitorMidiInputs();
    applyInputSnapshot(snapshot);
    setStatus(await getCapacitorMidiRoutingStatus());
  }, [applyInputSnapshot]);

  React.useEffect(() => {
    let cancelled = false;
    let removeMessages: (() => Promise<void>) | null = null;
    let removeInputs: (() => Promise<void>) | null = null;

    if (!isCapacitorMidiRoutingAvailable()) return () => { cancelled = true; };

    void (async () => {
      try {
        await startService();
        if (cancelled) return;
        removeMessages = await addCapacitorMidiMessageListener((message) => {
          handleMidiMessage(message);
        });
        removeInputs = await addCapacitorMidiInputsChangedListener((snapshot) => {
          applyInputSnapshot(snapshot);
        });
      } catch (error) {
        if (!cancelled) {
          dispatchLearn({ type: 'ERROR', message: error instanceof Error ? error.message : 'MIDI start failed' });
        }
      }
    })();

    return () => {
      cancelled = true;
      void removeMessages?.();
      void removeInputs?.();
    };
  }, [applyInputSnapshot, startService]);

  const setProfile = React.useCallback((nextProfile: KesshoMidiRoutingProfileV2) => {
    setProfileState({
      ...nextProfile,
      version: 2,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const handleMidiMessage = React.useCallback((message: KesshoMidiMessage) => {
    onMidiMessageRef.current?.(message);

    const now = performance.now();
    if (now - lastMonitorUpdateRef.current >= MONITOR_THROTTLE_MS) {
      lastMonitorUpdateRef.current = now;
      setActivity((current) => [{
        id: createMidiID('activity'),
        message,
        label: formatMidiMessageLabel(message),
        receivedAt: Date.now(),
      }, ...current].slice(0, ACTIVITY_LIMIT));
    }

    if (message.kind === 'controlChange' && learnStateRef.current.mode !== 'off') {
      dispatchLearn({
        type: 'MIDI_MESSAGE_CAPTURED',
        message,
        sourceLabel: formatMidiSourceLabel(sourceFromMidiMessage(message)),
      });
    }

    const liveNoteEvent = midiMessageToProductLiveNoteEvent(message);
    if (liveNoteEvent) {
      onLiveNoteEventRef.current?.(liveNoteEvent);
      return;
    }

    for (const binding of profileRef.current.bindings) {
      const routed = routeMidiMessageToParameter(message, binding);
      if (!routed) continue;
      const update = midiUpdateFromBinding(binding, routed.value, message.timestamp);
      dispatchMidiMappedParameterUpdate(update, {
        applyUiValue: onParamChangeRef.current,
      });
    }
  }, []);

  const enableLearn = React.useCallback(async () => {
    await startService();
    dispatchLearn({ type: 'ENABLE_LEARN' });
  }, [startService]);

  const toggleLearn = React.useCallback(() => {
    if (learnStateRef.current.mode === 'off') {
      void enableLearn();
    } else {
      dispatchLearn({ type: 'DISABLE_LEARN' });
    }
  }, [enableLearn]);

  const assignCapturedToSlider = React.useCallback((targetKey: keyof SliderState, targetLabel: string) => {
    const currentLearn = learnStateRef.current;
    if (currentLearn.mode !== 'captured') return null;
    dispatchLearn({ type: 'SLIDER_DRAGGED', targetKey, targetLabel });
    const result = createMidiBindingFromCapturedSourceAndSlider(
      currentLearn.message,
      targetKey,
      profileRef.current,
      { replaceExistingTargetBinding: true, allowDuplicateSource: true },
    );
    if (!result.binding) return null;
    setProfile(result.profile);
    setSelectedBindingID(result.binding.id);
    dispatchLearn({ type: 'ASSIGNMENT_CREATED', bindingID: result.binding.id, targetKey });
    window.setTimeout(() => {
      if (learnStateRef.current.mode === 'assigned') dispatchLearn({ type: 'CANCEL_CAPTURED_SOURCE' });
    }, 900);
    return result.binding;
  }, [setProfile]);

  const notifySliderDrag = React.useCallback((targetKey: keyof SliderState, targetLabel: string) => {
    assignCapturedToSlider(targetKey, targetLabel);
  }, [assignCapturedToSlider]);

  const updateBinding = React.useCallback((
    bindingID: string,
    updater: (binding: KesshoMidiBindingV2) => KesshoMidiBindingV2,
  ) => {
    setProfileState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      bindings: current.bindings.map((binding) => (
        binding.id === bindingID ? { ...updater(binding), updatedAt: new Date().toISOString() } : binding
      )),
    }));
  }, []);

  const removeBinding = React.useCallback((bindingID: string) => {
    setProfileState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      bindings: current.bindings.filter((binding) => binding.id !== bindingID),
    }));
    setSelectedBindingID((current) => current === bindingID ? null : current);
  }, []);

  const duplicateBinding = React.useCallback((bindingID: string) => {
    setProfileState((current) => {
      const source = current.bindings.find((binding) => binding.id === bindingID);
      if (!source) return current;
      const now = new Date().toISOString();
      return {
        ...current,
        updatedAt: now,
        bindings: [{ ...source, id: createMidiID('midi-binding'), createdAt: now, updatedAt: now }, ...current.bindings],
      };
    });
  }, []);

  const toggleInput = React.useCallback(async (input: KesshoMidiEndpointInfo, enabled: boolean) => {
    if (!isCapacitorMidiRoutingAvailable()) return;
    const snapshot = enabled
      ? await connectCapacitorMidiInput(input.uniqueID)
      : await disconnectCapacitorMidiInput(input.uniqueID);
    applyInputSnapshot(snapshot);
  }, [applyInputSnapshot]);

  const value = React.useMemo(() => ({
    learnState,
    profile,
    inputs,
    status,
    activity,
    conflicts,
    selectedBindingID,
    bridgeAvailable,
    toggleLearn,
    enableLearn,
    disableLearn: () => dispatchLearn({ type: 'DISABLE_LEARN' }),
    cancelCapturedSource: () => dispatchLearn({ type: 'CANCEL_CAPTURED_SOURCE' }),
    openMidiPage: () => onOpenMidiPage?.(),
    setSelectedBindingID,
    setProfile,
    refreshInputs,
    toggleInput,
    assignCapturedToSlider,
    notifySliderDrag,
    updateBinding,
    removeBinding,
    duplicateBinding,
  }), [
    activity,
    assignCapturedToSlider,
    bridgeAvailable,
    conflicts,
    inputs,
    learnState,
    onOpenMidiPage,
    profile,
    refreshInputs,
    selectedBindingID,
    setProfile,
    status,
    toggleInput,
    toggleLearn,
    updateBinding,
    removeBinding,
    duplicateBinding,
    notifySliderDrag,
  ]);

  return (
    <MidiLearnContext.Provider value={value}>
      {children}
      <MidiLearnButton />
      <MidiLearnBar />
    </MidiLearnContext.Provider>
  );
}
