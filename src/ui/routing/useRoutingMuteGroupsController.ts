import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../state';
import {
  captureRoutingMuteGroupSlot,
  createRoutingMuteGroupTransitionController,
  normalizeRoutingMuteGroupsState,
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
  saveSlot: (slotIndex: number) => void;
  saveSelectedSlot: () => void;
  clearSelectedSlot: () => void;
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

  const saveSlot = useCallback((slotIndex: number) => {
    const targetSlotIndex = clampSlotIndex(slotIndex);
    const slot = captureRoutingMuteGroupSlot(stateRef.current);
    onRoutingMuteGroupsChangeRef.current(setRoutingMuteGroupSlot(
      muteGroupsRef.current,
      targetSlotIndex,
      slot,
    ));
    setSelectedSlotIndex(targetSlotIndex);
  }, []);

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

  const saveSelectedSlot = useCallback(() => {
    saveSlot(selectedSlotIndex);
  }, [saveSlot, selectedSlotIndex]);

  const clearSelectedSlot = useCallback(() => {
    const targetSlotIndex = clampSlotIndex(selectedSlotIndex);
    onRoutingMuteGroupsChangeRef.current(setRoutingMuteGroupSlot(
      muteGroupsRef.current,
      targetSlotIndex,
      null,
    ));
    if (activeSlotIndexRef.current === targetSlotIndex) {
      controller.release();
    }
  }, [controller, selectedSlotIndex]);

  return {
    activeSlotIndex,
    selectedSlotIndex,
    selectSlot,
    pressSlot,
    saveSlot,
    saveSelectedSlot,
    clearSelectedSlot,
  };
}
