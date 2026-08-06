import { useEffect, useRef, useState } from 'react';
import type { HarmonyChordSlot } from '../../audio/CoreProductHarmonyControl';

const SLOT_KEYS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const;
const LONG_PRESS_MS = 450;

export interface HarmonySlotStripProps {
  slots: readonly HarmonyChordSlot[];
  activeSlotId?: number | null;
  selectedSlotId?: number | null;
  context?: 'detail' | 'overview';
  disabled?: boolean;
  onSelect?: (slotId: number) => void;
  onPreviewStart?: (slotId: number) => void;
  onPreviewEnd?: () => void;
  onSaveCurrent?: (slotId: number) => void;
  onAssign?: (slotId: number) => void;
  onClear?: (slotId: number) => void;
}

export function slotChordLabel(slot: HarmonyChordSlot | undefined): string {
  const recognized = slot?.chord?.recognizedLabel?.trim();
  if (recognized && recognized.toLowerCase() !== 'custom') return recognized;
  const intent = slot?.chord?.intent;
  if (!intent) return slot?.name?.trim() || 'Empty';
  const root = intent.rootMode === 'degree'
    ? `Degree ${intent.degree + 1}`
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((intent.rootNote % 12) + 12) % 12];
  return `${root}${intent.quality === 'maj' ? '' : intent.quality}`;
}

export function HarmonySlotStrip({ slots, activeSlotId = null, selectedSlotId = null, context = 'detail', disabled = false, onSelect, onPreviewStart, onPreviewEnd, onSaveCurrent, onAssign, onClear }: HarmonySlotStripProps) {
  const [menuSlotId, setMenuSlotId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const cancelTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => () => cancelTimer(), []);
  const openMenu = (slotId: number) => {
    cancelTimer();
    longPressedRef.current = true;
    onPreviewEnd?.();
    setMenuSlotId(slotId);
  };

  return (
    <div className="harmony-slot-strip-wrap">
      <div className="harmony-slot-strip" aria-label="Harmony chord slots">
        {Array.from({ length: 8 }, (_, index) => {
          const slot = slots[index];
          const label = slotChordLabel(slot);
          return (
            <div key={index} className="harmony-slot-card">
              <button
                type="button"
                className={`${activeSlotId === index ? 'active ' : ''}${selectedSlotId === index ? 'selected ' : ''}${slot?.locked ? 'locked' : ''}`.trim()}
                aria-label={`S${index + 1}: ${label}; ${SLOT_KEYS[index]} preview`}
                aria-keyshortcuts={SLOT_KEYS[index]}
                aria-pressed={selectedSlotId === index}
                disabled={disabled}
                onClick={() => {
                  if (longPressedRef.current) { longPressedRef.current = false; return; }
                  onSelect?.(index);
                }}
                onContextMenu={(event) => { event.preventDefault(); openMenu(index); }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || disabled) return;
                  longPressedRef.current = false;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  onPreviewStart?.(index);
                  timerRef.current = setTimeout(() => openMenu(index), LONG_PRESS_MS);
                }}
                onPointerUp={(event) => {
                  cancelTimer();
                  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  onPreviewEnd?.();
                }}
                onPointerCancel={() => { cancelTimer(); onPreviewEnd?.(); }}
                onBlur={() => { cancelTimer(); onPreviewEnd?.(); }}
              >
                <span>S{index + 1}</span>
                <small title={slot?.chord ? label : undefined}>{slot?.chord ? label : '—'}</small>
                <kbd aria-hidden="true">{SLOT_KEYS[index]}</kbd>
              </button>
              <button type="button" className="harmony-slot-menu-trigger" aria-label={`Actions for S${index + 1}`} aria-haspopup="menu" onClick={() => openMenu(index)}>…</button>
            </div>
          );
        })}
      </div>
      {menuSlotId != null && <div className="harmony-card-action-sheet" role="menu" aria-label={`S${menuSlotId + 1} actions`}>
        <div><strong>S{menuSlotId + 1} · {slotChordLabel(slots[menuSlotId])}</strong><button type="button" aria-label="Close slot actions" onClick={() => setMenuSlotId(null)}>×</button></div>
        <button type="button" role="menuitem" disabled={!slots[menuSlotId]?.chord} onPointerDown={() => onPreviewStart?.(menuSlotId)} onPointerUp={onPreviewEnd}>Hold to preview</button>
        {context === 'overview' && <button type="button" role="menuitem" disabled={!slots[menuSlotId]?.chord || disabled} onClick={() => { onAssign?.(menuSlotId); setMenuSlotId(null); }}>Assign to selected event</button>}
        <button type="button" role="menuitem" disabled={disabled || slots[menuSlotId]?.locked} onClick={() => { onSaveCurrent?.(menuSlotId); setMenuSlotId(null); }}>Save current chord here</button>
        {onClear && <button type="button" role="menuitem" className="destructive" disabled={disabled || slots[menuSlotId]?.locked || !slots[menuSlotId]?.chord} onClick={() => { onClear(menuSlotId); setMenuSlotId(null); }}>Clear slot</button>}
      </div>}
    </div>
  );
}
