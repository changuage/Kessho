import React, { useMemo } from 'react';
import type { ProductChordPlayConfig, ProductChordResolvedStep } from '../../../audio/productPlaySequencer';
import type { ProductArpHarmonyContext } from '../../../audio/productArpeggiator';
import type { HarmonyChordSlot } from '../../../audio/CoreProductHarmonyControl';
import { sharedChordResolvedMidiPool } from '../../../audio/harmony/harmonyChordAdapters';
import HarmonyCompactChordRow from '../../harmony/shared/HarmonyCompactChordRow';
import { deriveHarmonyPitchAxis } from '../../harmony/shared/harmonyPitchAxis';

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

/**
 * Compact Seq 1–4 matrix. The row owns only the slot reference; note cells
 * are a projection of the shared slot so editing a slot remains global.
 */
export const SeqChordChoiceLane: React.FC<SeqChordChoiceLaneProps> = ({
  config,
  harmony,
  slots = harmony.chordSlots,
  resolvedSteps,
  selectedStep,
  activeChoiceIndex = null,
  onSelectStep,
  onLoadSlot,
  onUpdateConfig,
}) => {
  const rowCount = Math.min(16, Math.max(1, config.choiceLength));
  const rows = useMemo(() => Array.from({ length: rowCount }, (_, step) => {
    const entry = config.steps[step] ?? { slotId: step % 8 };
    const slot = slots[entry.slotId];
    const detail = resolvedSteps.find((item) => item.sourceStep === step);
    const notes = slot?.chord?.exactMidiNotes?.length
      ? slot.chord.exactMidiNotes
      : slot?.chord
        ? sharedChordResolvedMidiPool(slot.chord, { rootMidi: harmony.rootMidi, scaleId: harmony.scaleId, tension: harmony.tension })
        : [];
    return {
      id: step,
      slotId: entry.slotId,
      title: slot?.chord?.recognizedLabel ?? 'Empty',
      notes,
      choiceIndex: detail?.choiceIndex ?? step,
    };
  }), [config.steps, harmony.rootMidi, harmony.scaleId, harmony.tension, resolvedSteps, rowCount, slots]);
  const axis = useMemo(() => deriveHarmonyPitchAxis(rows.map((row) => row.notes)), [rows]);

  return (
    <section className="seq-chord-choice-lane" aria-label="Seq chord choices">
      <header className="seq-chord-matrix-heading">
        <div><strong>Chord choices</strong><span>{rowCount} steps · shared S1–S8</span></div>
        <div className="seq-chord-choice-controls" aria-label="Chord playback settings">
          <label>Style <select value={config.style} aria-label="Chord style" onChange={(event) => onUpdateConfig({ style: event.target.value as ProductChordPlayConfig['style'] })}><option value="straight">Straight</option><option value="strum">Strum</option></select></label>
          <label>Steps <select value={config.choiceLength} aria-label="Chord choice length" onChange={(event) => onUpdateConfig({ choiceLength: Number(event.target.value) })}>{[4, 8, 12, 16].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <details className="seq-chord-playback-options">
            <summary>Playback</summary>
            <div>
              <label>Flow <select value={config.flow} aria-label="Chord flow" onChange={(event) => onUpdateConfig({ flow: event.target.value as ProductChordPlayConfig['flow'] })}><option value="forward">Forward</option><option value="reverse">Reverse</option><option value="pingpong">Pingpong</option></select></label>
              <label>Gate <select value={Math.round(config.gate * 100)} aria-label="Chord gate" onChange={(event) => onUpdateConfig({ gate: Number(event.target.value) / 100 })}>{[50, 65, 75, 86, 100].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
              <label>Voices <select value={config.voiceCount} aria-label="Chord voices" onChange={(event) => onUpdateConfig({ voiceCount: Number(event.target.value) })}>{[3, 4, 5, 6, 8, 12].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
          </details>
        </div>
      </header>
      <div className="harmony-compact-chord-list seq-chord-choice-rows">
        {rows.map((row) => (
          <HarmonyCompactChordRow
            key={row.id}
            indexLabel={String(row.id + 1).padStart(2, '0')}
            slotLabel={`S${row.slotId + 1}`}
            title={row.title}
            meta={row.notes.length ? `${row.notes.length} notes` : 'No chord saved'}
            notes={row.notes}
            axis={axis}
            selected={selectedStep === row.id}
            playing={activeChoiceIndex != null && activeChoiceIndex === row.choiceIndex}
            onSelect={() => { onSelectStep(row.id); onLoadSlot?.(row.slotId); }}
            trailing={(
              <select
                value={row.slotId}
                aria-label={`Step ${row.id + 1} slot`}
                onChange={(event) => {
                  const slotId = Number(event.target.value);
                  onUpdateConfig({ steps: config.steps.map((current, index) => index === row.id ? { ...current, slotId } : current) });
                  onSelectStep(row.id);
                  onLoadSlot?.(slotId);
                }}
              >
                {Array.from({ length: 8 }, (_, slotId) => <option key={slotId} value={slotId}>S{slotId + 1}</option>)}
              </select>
            )}
          />
        ))}
      </div>
    </section>
  );
};

export default SeqChordChoiceLane;
