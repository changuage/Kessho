import React from 'react';
import type { SharedHarmonyChordSlot } from '../../../audio/harmony/harmonyTypes';

export interface SeqLiveChordControlsProps {
  seqId: number;
  slots: readonly SharedHarmonyChordSlot[];
  activeSlotId?: number | null;
  latched?: boolean;
  disabled?: boolean;
  onPlaySlot: (slotId: number) => void;
  onHoldChange?: (held: boolean) => void;
  onLatch: () => void;
  onStop: () => void;
  onRecord: () => void;
}

export const SeqLiveChordControls: React.FC<SeqLiveChordControlsProps> = ({ seqId, slots, activeSlotId = null, latched = false, disabled = false, onPlaySlot, onHoldChange, onLatch, onStop, onRecord }) => <section className="seq-live-chord-controls" aria-label={`Seq ${seqId + 1} live chord`}>
  <header><strong>Live</strong><span>SEQ {seqId + 1} · slot trigger</span>{latched ? <span className="latched">Latched</span> : null}</header>
  <div className="seq-live-slot-pads" role="list" aria-label="Shared chord slots">{slots.slice(0, 8).map((slot) => <button key={slot.id} role="listitem" type="button" disabled={disabled || !slot.chord} className={activeSlotId === slot.id ? 'active' : ''} aria-label={`S${slot.id + 1} ${slot.chord?.recognizedLabel ?? 'Empty'}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); onPlaySlot(slot.id); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); onHoldChange?.(false); }} onPointerCancel={() => onHoldChange?.(false)}><span>S{slot.id + 1}</span><small>{slot.chord?.recognizedLabel ?? 'Empty'}</small></button>)}</div>
  <div className="seq-live-actions"><button type="button" disabled={disabled} onPointerDown={() => onHoldChange?.(true)} onPointerUp={() => onHoldChange?.(false)}>Hold</button><button type="button" disabled={disabled} onClick={onLatch}>{latched ? 'Unlatch' : 'Latch'}</button><button type="button" onClick={onStop}>Stop</button><button type="button" disabled={disabled || activeSlotId == null} onClick={onRecord}>Record selected</button></div>
</section>;
export default SeqLiveChordControls;
