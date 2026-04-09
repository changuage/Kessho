import { useState } from 'react';
import type { SliderState } from '../../state';
import {
  EarthCard,
  EarthDualSliderRenderer,
  EarthPresetOption,
  EarthPresetOptions,
} from './EarthControls';

type WaterCardProps = {
  state: SliderState;
  ds: EarthDualSliderRenderer;
  waterPresetOptions: EarthPresetOption[];
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  onWaterSlotSave: (slotKey: 'waterMorphA' | 'waterMorphB') => void;
  enabled?: boolean;
};

function SubSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="earth-sub-section">
      <div className="earth-sub-header" onClick={() => setOpen(o => !o)}>
        <span className="earth-sub-chevron">{open ? '▼' : '▶'}</span>
        <span className="earth-sub-title">{title}</span>
        <span className="earth-sub-count">{count}</span>
      </div>
      {open && <div className="earth-sub-body">{children}</div>}
    </div>
  );
}

export function WaterCard({
  state,
  ds,
  waterPresetOptions,
  expandedCards,
  onToggleCard,
  onSelectChange,
  onWaterSlotSave,
  enabled,
}: WaterCardProps) {
  return (
    <EarthCard
      cardId="water"
      title="Water Engine"
      accent="#4a9eff"
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
      enabled={enabled}
    >
      <div className="earth-preset-row">
        <div className="earth-preset-slot">
          <select
            className="earth-select earth-preset-select"
            value={String(state.waterMorphA)}
            onChange={e =>
              onSelectChange('waterMorphA', Number(e.target.value) as SliderState['waterMorphA'])
            }
          >
            <EarthPresetOptions options={waterPresetOptions} />
          </select>
          <button
            type="button"
            className="earth-preset-save"
            onClick={() => onWaterSlotSave('waterMorphA')}
            title="Save the current Water engine state into slot A's L1 preset"
          >
            Save
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {ds('waterMorph', 'Morph', 'rgba(74,158,255,0.5)')}
        </div>

        <div className="earth-preset-slot">
          <select
            className="earth-select earth-preset-select"
            value={String(state.waterMorphB)}
            onChange={e =>
              onSelectChange('waterMorphB', Number(e.target.value) as SliderState['waterMorphB'])
            }
          >
            <EarthPresetOptions options={waterPresetOptions} />
          </select>
          <button
            type="button"
            className="earth-preset-save"
            onClick={() => onWaterSlotSave('waterMorphB')}
            title="Save the current Water engine state into slot B's L1 preset"
          >
            Save
          </button>
        </div>
      </div>

      {ds('waterIntensity', 'Intensity', 'rgba(74,158,255,0.5)')}
      {ds('waterDistance', 'Distance', 'rgba(74,158,255,0.5)')}
      {ds('waterDropSize', 'Drop Size', 'rgba(74,158,255,0.5)')}
      {ds('waterHardness', 'Hardness', 'rgba(74,158,255,0.5)')}
      {ds('waterGlassThickness', 'Glass', 'rgba(74,158,255,0.5)')}
      {ds('waterBaseFreq', 'Base Freq', 'rgba(74,158,255,0.5)', {
        format: v => `${Math.round(v)} Hz`,
      })}
      {ds('waterReverbSend', 'Reverb Send', 'rgba(139,92,246,0.5)')}

      <SubSection title="Discrete Layers" count={7} defaultOpen={false}>
        {ds('waterHardDropRate', 'Hard Drop Rate', 'rgba(74,158,255,0.5)')}
        {ds('waterHardDropLPF', 'Hard Drop LPF', 'rgba(74,158,255,0.5)', {
          logarithmic: true,
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterHardDropTone', 'Hard Drop Tone', 'rgba(74,158,255,0.5)')}
        {ds('waterWaterDropRate', 'Water Drop Rate', 'rgba(74,158,255,0.5)')}
        {ds('waterWaterDropLPF', 'Water Drop LPF', 'rgba(74,158,255,0.5)', {
          logarithmic: true,
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterBubblingRate', 'Bubbling Rate', 'rgba(74,158,255,0.5)')}
        {ds('waterBubblingLPF', 'Bubbling LPF', 'rgba(74,158,255,0.5)', {
          logarithmic: true,
          format: v => `${Math.round(v)} Hz`,
        })}
      </SubSection>

      <SubSection title="Density Loop" count={7} defaultOpen={false}>
        {ds('waterDensityHardSend', 'Hard Send', 'rgba(96,165,250,0.5)')}
        {ds('waterDensityWaterSend', 'Drop Send', 'rgba(96,165,250,0.5)')}
        {ds('waterDensityBubbleSend', 'Bubble Send', 'rgba(96,165,250,0.5)')}
        {ds('waterDensityFeedback', 'Feedback', 'rgba(96,165,250,0.5)')}
        {ds('waterDensityTone', 'Tone', 'rgba(96,165,250,0.5)', {
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterDensityRing', 'Ring Amount', 'rgba(96,165,250,0.5)')}
        {ds('waterDensityWet', 'Density Wet', 'rgba(96,165,250,0.5)')}
      </SubSection>

      <SubSection title="Surf" count={8} defaultOpen={false}>
        {ds('waterSurfDuration', 'Wave Duration', 'rgba(0,180,216,0.5)', {
          format: v => `${v.toFixed(1)}s`,
        })}
        {ds('waterSurfInterval', 'Wave Interval', 'rgba(0,180,216,0.5)', {
          format: v => `${v.toFixed(1)}s`,
        })}
        {ds('waterSurfFoam', 'Foam', 'rgba(0,180,216,0.5)')}
        {ds('waterSurfFoamBright', 'Foam Bright', 'rgba(0,180,216,0.5)')}
        {ds('waterSurfProximity', 'Proximity', 'rgba(0,180,216,0.5)', {
          format: v => v < 0.34 ? 'Far' : v > 0.66 ? 'Near' : 'Mid',
        })}
        {ds('waterSurfDepth', 'Depth', 'rgba(0,180,216,0.5)')}
        {ds('waterSurfBody', 'Body Freq', 'rgba(0,180,216,0.5)', {
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterSurfSpray', 'Spray Freq', 'rgba(0,180,216,0.5)', {
          format: v => `${Math.round(v)} Hz`,
        })}
      </SubSection>

      <SubSection title="Channels" count={2} defaultOpen={false}>
        {ds('waterChannelsMorph', 'Morph', 'rgba(0,150,136,0.5)', {
          format: v => v < 0.3 ? 'Stream' : v > 0.7 ? 'Wind' : 'Blend',
        })}
        {ds('waterChannelsSpeed', 'Speed', 'rgba(0,150,136,0.5)')}
      </SubSection>
    </EarthCard>
  );
}
