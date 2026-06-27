import { useRef } from 'react';
import {
  isRoutingMuteGroupSlotStored,
  ROUTING_MUTE_GROUP_SLOT_COUNT,
  routingMuteGroupSlotMuteCount,
  type RoutingMuteGroupsState,
} from './routingMuteGroups';

type RoutingMuteGroupsPanelProps = {
  muteGroups: RoutingMuteGroupsState;
  activeSlotIndex: number | null;
  selectedSlotIndex: number;
  onSelectSlot: (slotIndex: number) => void;
  onPressSlot: (slotIndex: number) => void;
  onSaveSlot: (slotIndex: number) => void;
  onSaveSelectedSlot: () => void;
  onClearSelectedSlot: () => void;
};

const LONG_PRESS_MS = 540;

export default function RoutingMuteGroupsPanel({
  muteGroups,
  activeSlotIndex,
  selectedSlotIndex,
  onSelectSlot,
  onPressSlot,
  onSaveSlot,
  onSaveSelectedSlot,
  onClearSelectedSlot,
}: RoutingMuteGroupsPanelProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (slotIndex: number) => {
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onSaveSlot(slotIndex);
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
    const label = `Mute group ${index + 1}`;
    const status = stored ? `${mutedCount} muted controls` : 'Empty';

    return (
      <button
        key={index}
        type="button"
        className={`routing-mute-slot${stored ? ' stored' : ' empty'}${active ? ' active' : ''}${selected ? ' selected' : ''}`}
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
          if (event.key === 's' || event.key === 'S') {
            event.preventDefault();
            onSaveSlot(index);
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            onSelectSlot(index);
            onClearSelectedSlot();
          }
        }}
      >
        <span className="routing-mute-slot-number">{index + 1}</span>
        <span className="routing-mute-slot-count">{stored ? mutedCount : '-'}</span>
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
            onClick={onSaveSelectedSlot}
            aria-label={`Save current mute scene into mute group ${selectedSlotIndex + 1}`}
            title={`Save current mute scene into slot ${selectedSlotIndex + 1}`}
          >
            Save Current
          </button>
          <button
            type="button"
            className="routing-mute-action"
            onClick={onClearSelectedSlot}
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
    </div>
  );
}
