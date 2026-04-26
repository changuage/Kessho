import { useEffect, useState } from 'react';
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

const WATER_BLUE = 'rgba(74,158,255,0.5)';
const WATER_DETAIL_BLUE = 'rgba(96,165,250,0.5)';
const SURF_CYAN = 'rgba(0,180,216,0.5)';
const CHANNEL_TEAL = 'rgba(0,150,136,0.5)';
const REVERB_VIOLET = 'rgba(139,92,246,0.5)';

function SubSection({
  title,
  count,
  defaultOpen = false,
  syncOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  syncOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (syncOpen !== undefined) setOpen(syncOpen);
  }, [syncOpen]);

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
  const hardDropsOpen = Number(state.waterLayerHardDrops) > 0.01;
  const waterDropsOpen = Number(state.waterLayerWaterDrops) > 0.01;
  const bubblingOpen = Number(state.waterLayerBubbling) > 0.01;
  const turbulenceOpen = Number(state.waterLayerTurbulence) > 0.01;
  const surfOpen = Number(state.waterLayerSurf) > 0.01;
  const channelsOpen = Number(state.waterLayerChannels) > 0.01;
  const anyWaterOpen = hardDropsOpen || waterDropsOpen || bubblingOpen || turbulenceOpen || surfOpen || channelsOpen;

  return (
    <EarthCard
      cardId="water"
      title="Water"
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
            title="Save the current Water state into slot A's L1 preset"
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
            title="Save the current Water state into slot B's L1 preset"
          >
            Save
          </button>
        </div>
      </div>

      <SubSection title="Shared Water Body" count={3} defaultOpen syncOpen={anyWaterOpen}>
        {ds('waterIntensity', 'Intensity', WATER_BLUE)}
        {ds('waterDistance', 'Distance', WATER_BLUE)}
        {ds('waterReverbSend', 'Reverb Send', REVERB_VIOLET)}
      </SubSection>

      <SubSection title="Hard Drops" count={6} defaultOpen={false} syncOpen={hardDropsOpen}>
        {ds('waterLayerHardDrops', 'Level', WATER_BLUE)}
        {ds('waterHardDropBaseFreq', 'Base Freq', WATER_BLUE, {
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterHardDropRate', 'Event Rate', WATER_BLUE)}
        {ds('waterHardDropLPF', 'Low-pass', WATER_BLUE, {
          logarithmic: true,
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterHardDropTone', 'Character', WATER_BLUE)}
        {ds('waterHardness', 'Hardness', WATER_BLUE)}
      </SubSection>

      <SubSection title="Water Drops" count={5} defaultOpen={false} syncOpen={waterDropsOpen}>
        {ds('waterLayerWaterDrops', 'Level', WATER_BLUE)}
        {ds('waterWaterDropBaseFreq', 'Base Freq', WATER_BLUE, {
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterWaterDropRate', 'Event Rate', WATER_BLUE)}
        {ds('waterWaterDropLPF', 'Low-pass', WATER_BLUE, {
          logarithmic: true,
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterDropSize', 'Drop Size', WATER_BLUE)}
      </SubSection>

      <SubSection title="Bubbling" count={3} defaultOpen={false} syncOpen={bubblingOpen}>
        {ds('waterLayerBubbling', 'Level', WATER_BLUE)}
        {ds('waterBubblingRate', 'Event Rate', WATER_BLUE)}
        {ds('waterBubblingLPF', 'Low-pass', WATER_BLUE, {
          logarithmic: true,
          format: v => `${Math.round(v)} Hz`,
        })}
      </SubSection>

      <SubSection title="Turbulence" count={2} defaultOpen={false} syncOpen={turbulenceOpen}>
        {ds('waterLayerTurbulence', 'Level', WATER_BLUE)}
        {ds('waterGlassThickness', 'Glass', WATER_BLUE)}
      </SubSection>

      <SubSection title="Density Loop" count={7} defaultOpen={false}>
        {ds('waterDensityHardSend', 'Hard Drops Send', WATER_DETAIL_BLUE)}
        {ds('waterDensityWaterSend', 'Water Drops Send', WATER_DETAIL_BLUE)}
        {ds('waterDensityBubbleSend', 'Bubbling Send', WATER_DETAIL_BLUE)}
        {ds('waterDensityFeedback', 'Feedback', WATER_DETAIL_BLUE)}
        {ds('waterDensityTone', 'Tone', WATER_DETAIL_BLUE, {
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterDensityRing', 'Ring Amount', WATER_DETAIL_BLUE)}
        {ds('waterDensityWet', 'Return Level', WATER_DETAIL_BLUE)}
      </SubSection>

      <SubSection title="Surf" count={9} defaultOpen={false} syncOpen={surfOpen}>
        {ds('waterLayerSurf', 'Level', SURF_CYAN)}
        {ds('waterSurfDuration', 'Wave Duration', SURF_CYAN, {
          format: v => `${v.toFixed(1)}s`,
        })}
        {ds('waterSurfInterval', 'Wave Interval', SURF_CYAN, {
          format: v => `${v.toFixed(1)}s`,
        })}
        {ds('waterSurfFoam', 'Foam', SURF_CYAN)}
        {ds('waterSurfFoamBright', 'Foam Bright', SURF_CYAN)}
        {ds('waterSurfProximity', 'Proximity', SURF_CYAN, {
          format: v => v < 0.34 ? 'Far' : v > 0.66 ? 'Near' : 'Mid',
        })}
        {ds('waterSurfDepth', 'Depth', SURF_CYAN)}
        {ds('waterSurfBody', 'Body Freq', SURF_CYAN, {
          format: v => `${Math.round(v)} Hz`,
        })}
        {ds('waterSurfSpray', 'Spray Freq', SURF_CYAN, {
          format: v => `${Math.round(v)} Hz`,
        })}
      </SubSection>

      <SubSection title="Channels" count={3} defaultOpen={false} syncOpen={channelsOpen}>
        {ds('waterLayerChannels', 'Level', CHANNEL_TEAL)}
        {ds('waterChannelsMorph', 'Stream / Wind', CHANNEL_TEAL, {
          format: v => v < 0.3 ? 'Stream' : v > 0.7 ? 'Wind' : 'Blend',
        })}
        {ds('waterChannelsSpeed', 'Speed', CHANNEL_TEAL)}
      </SubSection>
    </EarthCard>
  );
}
