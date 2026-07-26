import React from 'react';
import type { ProductChordPlayConfig, ProductChordResolvedStep } from '../../../audio/productPlaySequencer';
import type { ProductArpHarmonyContext } from '../../../audio/productArpeggiator';
import type { HarmonyChordSlot } from '../../../audio/CoreProductHarmonyControl';
import { sharedChordResolvedMidiPool } from '../../../audio/harmony/harmonyChordAdapters';

export interface SeqChordChoiceLaneProps {
  config: ProductChordPlayConfig;
  harmony: ProductArpHarmonyContext;
  slots?: readonly HarmonyChordSlot[];
  resolvedSteps: readonly ProductChordResolvedStep[];
  selectedStep: number;
  activeChoiceIndex?: number | null;
  onSelectStep: (step: number) => void;
  onLoadSlot?: (slotId: number) => void;
  onUpdateConfig: (patch: Partial<ProductChordPlayConfig>) => void;
}

/** Compact shared choice lane. Rhythm remains owned by the trigger lane. */
export const SeqChordChoiceLane: React.FC<SeqChordChoiceLaneProps> = ({ config, harmony, slots = harmony.chordSlots, resolvedSteps, selectedStep, activeChoiceIndex = null, onSelectStep, onLoadSlot, onUpdateConfig }) => <section className="seq-chord-choice-lane" aria-label="Shared chord choices">
  <header><strong>Chord choices</strong><span>{config.choiceLength} choices · {config.flow}</span></header>
  <div className="seq-chord-choice-grid">{Array.from({ length: Math.min(16, Math.max(1, config.choiceLength)) }, (_, step) => { const entry = config.steps[step] ?? { slotId: step % 8 }; const slot = slots[entry.slotId]; const detail = resolvedSteps.find((item) => item.sourceStep === step); const notes = detail?.notes ?? (slot?.chord ? sharedChordResolvedMidiPool(slot.chord, { rootMidi: harmony.rootMidi, scaleId: harmony.scaleId, tension: harmony.tension }) : []); return <div key={step} role="button" tabIndex={0} className={`seq-chord-choice-cell${selectedStep === step ? ' selected' : ''}${activeChoiceIndex === detail?.choiceIndex ? ' playing' : ''}`} onClick={() => { onSelectStep(step); onLoadSlot?.(entry.slotId); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { onSelectStep(step); onLoadSlot?.(entry.slotId); } }} title={notes.join(' ')}><span>{step + 1}</span><select value={entry.slotId} onChange={(event) => { const slotId = Number(event.target.value); onUpdateConfig({ steps: config.steps.map((current, index) => index === step ? { ...current, slotId } : current) }); onSelectStep(step); onLoadSlot?.(slotId); }}>{Array.from({ length: 8 }, (_, slotId) => <option key={slotId} value={slotId}>S{slotId + 1}</option>)}</select><small>{slot?.chord?.recognizedLabel ?? 'Empty'}</small></div>; })}</div>
</section>;

export default SeqChordChoiceLane;
