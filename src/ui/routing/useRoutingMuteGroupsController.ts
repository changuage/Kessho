import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../state';
import {
  captureRoutingMuteGroupSlot,
  createRoutingMuteGroupTransitionController,
  incrementSlotRevision,
  isRoutingMuteGroupSlotStored,
  normalizeRoutingMuteGroupsState,
  normalizeRoutingMuteGroupSlot,
  ROUTING_MUTE_GROUP_SLOT_COUNT,
  setRoutingMuteGroupSlot,
  type RoutingMuteGroupsState,
} from './routingMuteGroups';

type UseRoutingMuteGroupsControllerOptions = {
  state: SliderState;
  routingMuteGroups: RoutingMuteGroupsState;
  onRoutingMuteGroupsChange: (state: RoutingMuteGroupsState) => void;
  onRuntimeLevelChange: (key: keyof SliderState, value: number | null) => void;
  onBooleanParamChange: (key: keyof SliderState, value: boolean) => void;
};

export type RoutingMuteGroupsController = {
  activeSlotIndex: number | null;
  selectedSlotIndex: number;
  selectSlot: (slotIndex: number) => void;
  pressSlot: (slotIndex: number) => void;
  saveSlot: (slotIndex: number) => SaveSlotResult;
  saveSelectedSlot: () => SaveSlotResult;
  clearSlot: (slotIndex: number) => void;
  clearSelectedSlot: () => void;
};

export type SaveSlotResult = {
  slotIndex: number;
  wasStored: boolean;
  revision: number;
};

function clampSlotIndex(slotIndex: number): number {
  if (!Number.isInteger(slotIndex)) return 0;
  return Math.max(0, Math.min(ROUTING_MUTE_GROUP_SLOT_COUNT - 1, slotIndex));
}

export function useRoutingMuteGroupsController({
  state,
  routingMuteGroups,
  onRoutingMuteGroupsChange,
  onRuntimeLevelChange,
  onBooleanParamChange,
}: UseRoutingMuteGroupsControllerOptions): RoutingMuteGroupsController {
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);

  const stateRef = useRef(state);
  const muteGroupsRef = useRef(normalizeRoutingMuteGroupsState(routingMuteGroups));
  const activeSlotIndexRef = useRef<number | null>(null);
  const onRuntimeLevelChangeRef = useRef(onRuntimeLevelChange);
  const onBooleanParamChangeRef = useRef(onBooleanParamChange);
  const onRoutingMuteGroupsChangeRef = useRef(onRoutingMuteGroupsChange);

  stateRef.current = state;
  muteGroupsRef.current = normalizeRoutingMuteGroupsState(routingMuteGroups);
  onRuntimeLevelChangeRef.current = onRuntimeLevelChange;
  onBooleanParamChangeRef.current = onBooleanParamChange;
  onRoutingMuteGroupsChangeRef.current = onRoutingMuteGroupsChange;

  const controller = useMemo(
    () => createRoutingMuteGroupTransitionController({
      getState: () => stateRef.current,
      onRuntimeLevelChange: (key, value) => onRuntimeLevelChangeRef.current(key, value),
      onBooleanParamChange: (key, value) => onBooleanParamChangeRef.current(key, value),
      onActiveSlotChange: (slotIndex) => {
        activeSlotIndexRef.current = slotIndex;
        setActiveSlotIndex(slotIndex);
      },
    }),
    [],
  );

  useEffect(() => () => controller.cancel(), [controller]);

  const selectSlot = useCallback((slotIndex: number) => {
    setSelectedSlotIndex(clampSlotIndex(slotIndex));
  }, []);

  const saveSlot = useCallback((slotIndex: number): SaveSlotResult => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    const normalizedGroups = normalizeRoutingMuteGroupsState(muteGroupsRef.current);
    const previousSlot = normalizedGroups.slots[targetSlotIndex];
    const wasStored = isRoutingMuteGroupSlotStored(previousSlot);
    const revision = incrementSlotRevision(previousSlot);
    const slot = normalizeRoutingMuteGroupSlot(captureRoutingMuteGroupSlot(stateRef.current, {
      effectiveMutedSourceIds: controller.getEffectiveMutedSourceIds(),
      revision,
    }));
    onRoutingMuteGroupsChangeRef.current(setRoutingMuteGroupSlot(
      normalizedGroups,
      targetSlotIndex,
      slot,
    ));
    setSelectedSlotIndex(targetSlotIndex);
    return { slotIndex: targetSlotIndex, wasStored, revision };
  }, [controller]);

  const pressSlot = useCallback((slotIndex: number) => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    setSelectedSlotIndex(targetSlotIndex);

    const slot = muteGroupsRef.current.slots[targetSlotIndex];
    if (!slot) return;

    if (activeSlotIndexRef.current === targetSlotIndex) {
      controller.release();
      return;
    }

    controller.recall(slot, targetSlotIndex);
  }, [controller]);

  const saveSelectedSlot = useCallback((): SaveSlotResult => {
    return saveSlot(selectedSlotIndex);
  }, [saveSlot, selectedSlotIndex]);

  const clearSlot = useCallback((slotIndex: number) => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    onRoutingMuteGroupsChangeRef.current(setRoutingMuteGroupSlot(
      muteGroupsRef.current,
      targetSlotIndex,
      null,
    ));
    if (activeSlotIndexRef.current === targetSlotIndex) {
      controller.release();
    }
    setSelectedSlotIndex(targetSlotIndex);
  }, [controller]);

  const clearSelectedSlot = useCallback(() => {
    clearSlot(selectedSlotIndex);
  }, [clearSlot, selectedSlotIndex]);

  return {
    activeSlotIndex,
    selectedSlotIndex,
    selectSlot,
    pressSlot,
    saveSlot,
    saveSelectedSlot,
    clearSlot,
    clearSelectedSlot,
  };
}
