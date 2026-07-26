import type { HarmonyChordSlot } from '../../audio/CoreProductHarmonyControl';

export interface HarmonySlotStripProps {
  slots: readonly HarmonyChordSlot[];
  activeSlotId?: number | null;
  selectedSlotId?: number | null;
  onSelect?: (slotId: number) => void;
}

export function HarmonySlotStrip({ slots, activeSlotId = null, selectedSlotId = null, onSelect }: HarmonySlotStripProps) {
  return (
    <div className="harmony-slot-strip" aria-label="Harmony chord slots">
      {Array.from({ length: 8 }, (_, index) => {
        const slot = slots[index];
        const label = slot?.chord?.intent?.quality ?? slot?.name ?? 'Empty';
        return (
          <button
            key={index}
            type="button"
            className={`${activeSlotId === index ? 'active ' : ''}${selectedSlotId === index ? 'selected ' : ''}${slot?.locked ? 'locked' : ''}`.trim()}
            aria-label={`S${index + 1}: ${label}`}
            aria-pressed={selectedSlotId === index}
            onClick={() => onSelect?.(index)}
          >
            <span>S{index + 1}</span>
            <small>{slot?.chord ? (slot.chord.intent?.quality ?? 'Chord') : '—'}</small>
          </button>
        );
      })}
    </div>
  );
}
