import { useEffect, useRef, useState } from 'react';
import {
  isRoutingMuteGroupSlotStored,
  ROUTING_MUTE_GROUP_SLOT_COUNT,
  routingMuteGroupSlotMuteCount,
  type RoutingMuteGroupsState,
} from './routingMuteGroups';
import type { SaveSlotResult } from './useRoutingMuteGroupsController';

type RoutingMuteGroupsPanelProps = {
  muteGroups: RoutingMuteGroupsState;
  activeSlotIndex: number | null;
  selectedSlotIndex: number;
  onSelectSlot: (slotIndex: number) => void;
  onPressSlot: (slotIndex: number) => void;
  onSaveSlot: (slotIndex: number) => SaveSlotResult;
  onSaveSelectedSlot: () => SaveSlotResult;
  onClearSlot: (slotIndex: number) => void;
  onClearSelectedSlot: () => void;
};

const LONG_PRESS_MS = 540;
const SAVE_FLASH_MS = 950;

type SaveFlashState = {
  slotIndex: number;
  kind: 'saved' | 'overwritten';
  nonce: number;
};

export default function RoutingMuteGroupsPanel({
  muteGroups,
  activeSlotIndex,
  selectedSlotIndex,
  onSelectSlot,
  onPressSlot,
  onSaveSlot,
  onSaveSelectedSlot,
  onClearSlot,
  onClearSelectedSlot,
}: RoutingMuteGroupsPanelProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const saveFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveFlash, setSaveFlash] = useState<SaveFlashState | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearSaveFlashTimer = () => {
    if (saveFlashTimerRef.current) {
      clearTimeout(saveFlashTimerRef.current);
      saveFlashTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearLongPressTimer();
    clearSaveFlashTimer();
  }, []);

  const flashSavedSlot = (result: SaveSlotResult) => {
    const nextFlash: SaveFlashState = {
      slotIndex: result.slotIndex,
      kind: result.wasStored ? 'overwritten' : 'saved',
      nonce: Date.now(),
    };
    clearSaveFlashTimer();
    setSaveFlash(nextFlash);
    setStatusMessage(
      result.wasStored
        ? `Overwrote mute group ${result.slotIndex + 1}`
        : `Saved mute group ${result.slotIndex + 1}`,
    );
    saveFlashTimerRef.current = setTimeout(() => {
      setSaveFlash((current) => (
        current?.slotIndex === nextFlash.slotIndex && current.nonce === nextFlash.nonce
          ? null
          : current
      ));
      saveFlashTimerRef.current = null;
    }, SAVE_FLASH_MS);
  };

  const clearExactSlot = (slotIndex: number) => {
    onClearSlot(slotIndex);
    setStatusMessage(`Cleared mute group ${slotIndex + 1}`);
  };

  const clearSelectedSlot = () => {
    onClearSelectedSlot();
    setStatusMessage(`Cleared mute group ${selectedSlotIndex + 1}`);
  };

  const handlePointerDown = (slotIndex: number) => {
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      flashSavedSlot(onSaveSlot(slotIndex));
      navigator.vibrate?.(35);
    }, LONG_PRESS_MS);
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const slots = Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, (_, index) => {
    const slot = muteGroups.slots[index] ?? null;
    const stored = isRoutingMuteGroupSlotStored(slot);
    const active = activeSlotIndex === index;
    const selected = selectedSlotIndex === index;
    const mutedCount = routingMuteGroupSlotMuteCount(slot);
    const flashKind = saveFlash?.slotIndex === index ? saveFlash.kind : null;
    const slotClassName = [
      'routing-mute-slot',
      stored ? 'stored' : 'empty',
      active ? 'active' : '',
      selected ? 'selected' : '',
      flashKind === 'saved' ? 'just-saved' : '',
      flashKind === 'overwritten' ? 'overwritten' : '',
    ].filter(Boolean).join(' ');
    const label = `Mute group ${index + 1}`;
    const status = flashKind === 'saved'
      ? 'Saved!'
      : flashKind === 'overwritten'
        ? 'Overwritten!'
        : active
          ? 'Active'
          : stored
            ? mutedCount > 0 ? `${mutedCount} off` : 'Saved'
            : 'Empty';

    return (
      <button
        key={index}
        type="button"
        className={slotClassName}
        aria-label={`${label}. ${status}. ${active ? 'Active' : selected ? 'Selected' : 'Inactive'}.`}
        aria-pressed={active}
        title={`${label} - ${status}. Long press to save current mute scene.`}
        onPointerDown={() => handlePointerDown(index)}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={() => {
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
          }
          onPressSlot(index);
        }}
        onFocus={() => onSelectSlot(index)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (event.shiftKey) {
              flashSavedSlot(onSaveSlot(index));
            } else {
              onPressSlot(index);
            }
          } else if (event.key === 's' || event.key === 'S') {
            event.preventDefault();
            flashSavedSlot(onSaveSlot(index));
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            clearExactSlot(index);
          }
        }}
      >
        <span className="routing-mute-slot-number">{index + 1}</span>
        <span className="routing-mute-slot-count">{status}</span>
      </button>
    );
  });

  return (
    <div className="routing-mute-groups" aria-label="Mute groups">
      <div className="routing-mute-groups-head">
        <div className="routing-mute-groups-title">Mute Groups</div>
        <div className="routing-mute-groups-actions">
          <button
            type="button"
            className="routing-mute-action"
            onClick={() => flashSavedSlot(onSaveSelectedSlot())}
            aria-label={`Save current mute scene into mute group ${selectedSlotIndex + 1}`}
            title={`Save current mute scene into slot ${selectedSlotIndex + 1}`}
          >
            Save Current
          </button>
          <button
            type="button"
            className="routing-mute-action"
            onClick={clearSelectedSlot}
            aria-label={`Clear mute group ${selectedSlotIndex + 1}`}
            title={`Clear slot ${selectedSlotIndex + 1}`}
          >
            Clear Slot
          </button>
        </div>
      </div>
      <div className="routing-mute-slots-scroll">
        <div className="routing-mute-slots" role="group" aria-label="Mute group slots">
          <div className="routing-mute-rowlabel">Slots</div>
          {slots}
        </div>
      </div>
      <p className="routing-mute-groups-status" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}
