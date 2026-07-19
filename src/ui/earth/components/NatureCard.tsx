import { useEffect } from 'react';
import type { SliderState } from '../../state';
import { NATURE_SAMPLE_CATALOG, natureSampleDefinition, natureSlotTitle, type NatureSlotNumber } from '../../../audio/natureSampleCatalog';
import { NATURE_SLOT_KEYS } from '../../../audio/natureSlots';
import { EarthCard, type EarthDualSliderRenderer } from './EarthControls';

type NatureCardProps = {
  slot: NatureSlotNumber;
  accent: string;
  state: SliderState;
  ds: EarthDualSliderRenderer;
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  enabled?: boolean;
};

export function NatureCard({
  slot,
  accent,
  state,
  ds,
  expandedCards,
  onToggleCard,
  onSelectChange,
  enabled,
}: NatureCardProps) {
  const keys = NATURE_SLOT_KEYS[slot - 1]!;
  const cardId = `nature${slot}`;
  const title = natureSlotTitle(state[keys.sampleIdKey], slot);
  const isEnabled = Boolean(state[keys.enabledKey]);
  const sample = natureSampleDefinition(state[keys.sampleIdKey], slot);

  useEffect(() => {
    const currentDuration = Number(state[keys.sliceDurationKey]);
    if (Number.isFinite(currentDuration) && currentDuration > sample.durationSeconds) {
      onSelectChange(keys.sliceDurationKey, sample.durationSeconds as SliderState[typeof keys.sliceDurationKey]);
    }
  }, [keys.sliceDurationKey, onSelectChange, sample.durationSeconds, state[keys.sliceDurationKey]]);

  const handleSampleChange = (sampleId: SliderState[typeof keys.sampleIdKey]) => {
    const nextSample = natureSampleDefinition(sampleId, slot);
    onSelectChange(keys.sampleIdKey, sampleId);
    if (Number(state[keys.sliceDurationKey]) > nextSample.durationSeconds) {
      onSelectChange(keys.sliceDurationKey, nextSample.durationSeconds as SliderState[typeof keys.sliceDurationKey]);
    }
  };

  return (
    <EarthCard
      cardId={cardId}
      title={title}
      accent={accent}
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
      enabled={enabled}
      onToggleEnabled={() => {
        if (!isEnabled) onSelectChange('natureMasterEnabled', true);
        onSelectChange(keys.enabledKey, !isEnabled);
      }}
      enableTitle={isEnabled ? `Disable ${title}` : `Enable ${title}`}
    >
      <div className="param-row">
        <span className="param-label">Sample</span>
        <select
          className="earth-select"
          value={sample.id}
          onChange={(event) => handleSampleChange(event.target.value as SliderState[typeof keys.sampleIdKey])}
          style={{ flex: 1 }}
        >
          {NATURE_SAMPLE_CATALOG.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
        </select>
        <span className="param-value">{sample.durationSeconds.toFixed(1)} s</span>
      </div>
      {ds(keys.levelKey, 'Level', `${accent}88`)}
      {ds(keys.sliceDurationKey, 'Slice Duration', `${accent}55`, {
        max: sample.durationSeconds,
        format: (v) => `${v.toFixed(1)} s`,
      })}
      {ds(keys.sliceDensityKey, 'Slice Density', `${accent}44`)}
      <div className="earth-section-label" style={{ marginTop: 6, marginBottom: 4 }}>Nature {slot} Filter</div>
      <div className="param-row">
        <span className="param-label">Filter Type</span>
        <select
          className="earth-select"
          value={state[keys.filterTypeKey]}
          onChange={(event) => onSelectChange(keys.filterTypeKey, event.target.value as SliderState[typeof keys.filterTypeKey])}
          style={{ flex: 1 }}
        >
          <option value="lowpass">Lowpass (Warm)</option>
          <option value="bandpass">Bandpass (Focused)</option>
          <option value="highpass">Highpass (Airy)</option>
          <option value="notch">Notch (Scoop)</option>
        </select>
        <span className="param-value">&nbsp;</span>
      </div>
      {ds(keys.filterCutoffKey, 'Filter Cutoff', `${accent}33`, { format: (v) => `${Math.round(v)} Hz`, logarithmic: true })}
      {ds(keys.filterResonanceKey, 'Filter Resonance', `${accent}28`)}
    </EarthCard>
  );
}
