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
  <header><strong>Live</strong><span>SEQ {seqId + 1} LIVE</span>{latched ? <span className="latched">Latched</span> : null}</header>
  <div className="seq-live-slot-pads">{slots.map((slot) => <button key={slot.id} type="button" disabled={disabled || !slot.chord} className={activeSlotId === slot.id ? 'active' : ''} onPointerDown={() => onPlaySlot(slot.id)} onPointerUp={() => onHoldChange?.(false)} onPointerCancel={() => onHoldChange?.(false)}>{`S${slot.id + 1}`}<small>{slot.chord?.recognizedLabel ?? 'Empty'}</small></button>)}</div>
  <div className="seq-live-actions"><button type="button" disabled={disabled} onPointerDown={() => onHoldChange?.(true)} onPointerUp={() => onHoldChange?.(false)}>Hold</button><button type="button" disabled={disabled} onClick={onLatch}>{latched ? 'Unlatch' : 'Latch'}</button><button type="button" onClick={onStop}>Stop</button><button type="button" disabled={disabled || activeSlotId == null} onClick={onRecord}>Record</button></div>
</section>;
export default SeqLiveChordControls;
