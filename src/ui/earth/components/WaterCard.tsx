import { useEffect, useState } from 'react';
import { PresetRatingStars } from '../../../presets/PresetRatingStars';
import type { SliderState } from '../../state';
import {
  EarthCard,
  EarthDualSliderRenderer,
  EarthPresetOption,
  EarthPresetOptions,
} from './EarthControls';
import { blurSelectAfterChange } from '../../shared/selectFocus';

type WaterCardProps = {
  state: SliderState;
  ds: EarthDualSliderRenderer;
  waterPresetOptions: EarthPresetOption[];
  selectedWaterPreset: string;
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  onWaterPresetSelect: (value: string) => void;
  onWaterPresetLoadToSlot: (value: string, slot: 'A' | 'B') => void;
  onWaterPresetSave: () => void;
  onWaterPresetRate?: (option: EarthPresetOption, rating: number) => void;
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
  selectedWaterPreset,
  expandedCards,
  onToggleCard,
  onSelectChange,
  onWaterPresetSelect,
  onWaterPresetLoadToSlot,
  onWaterPresetSave,
  onWaterPresetRate,
  enabled,
}: WaterCardProps) {
  const hardDropsOpen = state.waterLayerHardDropsEnabled;
  const waterDropsOpen = state.waterLayerWaterDropsEnabled;
  const bubblingOpen = state.waterLayerBubblingEnabled;
  const turbulenceOpen = state.waterLayerTurbulenceEnabled;
  const surfOpen = state.waterLayerSurfEnabled;
  const channelsOpen = state.waterLayerChannelsEnabled;
  const anyWaterOpen = hardDropsOpen || waterDropsOpen || bubblingOpen || turbulenceOpen || surfOpen || channelsOpen;
  const selectedOption = waterPresetOptions.find(item => item.value === selectedWaterPreset);
  const handleToggleWaterEnabled = () => {
    const nextEnabled = !state.waterEnabled;
    onSelectChange('waterEnabled', nextEnabled);
  };

  return (
    <EarthCard
      cardId="water"
      title="Water"
      accent="#4a9eff"
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
      enabled={enabled}
      onToggleEnabled={handleToggleWaterEnabled}
      enableTitle={state.waterEnabled ? 'Disable Water' : 'Enable Water'}
    >
      <div className="sc-preset-loader earth-water-loader">
        <select
          className="sc-preset-loader-select"
          value={selectedWaterPreset}
          onChange={(e) => {
            onWaterPresetSelect(e.target.value);
            blurSelectAfterChange(e.currentTarget);
          }}
          title="Select Water preset"
        >
          <EarthPresetOptions options={waterPresetOptions} />
        </select>
        {selectedOption && onWaterPresetRate && (
          <PresetRatingStars
            value={selectedOption.rating ?? 0}
            onChange={(rating) => onWaterPresetRate(selectedOption, rating)}
            color="#4a9eff"
            size="0.55rem"
          />
        )}
        <button
          type="button"
          className="sc-preset-loader-slot"
          style={{ '--slot-color': '#4a9eff' } as React.CSSProperties}
          onClick={() => onWaterPresetLoadToSlot(selectedWaterPreset, 'A')}
          title="Load into Slot A"
        >
          A
        </button>
        <button
          type="button"
          className="sc-preset-loader-slot"
          style={{ '--slot-color': '#8b5cf6' } as React.CSSProperties}
          onClick={() => onWaterPresetLoadToSlot(selectedWaterPreset, 'B')}
          title="Load into Slot B"
        >
          B
        </button>
        <button
          type="button"
          className="sc-preset-loader-save"
          onClick={onWaterPresetSave}
          title="Save the current Water engine state as an L1 preset"
        >
          💾
        </button>
      </div>

      <div className="sc-morph-row earth-water-morph-row">
        <span className="sc-morph-tag" style={{ color: '#4a9eff' }}>A</span>
        <div className="sc-preset-slot">
          <select
            className="sc-preset-select"
            value={String(state.waterMorphA)}
            onChange={(e) => {
              onSelectChange('waterMorphA', Number(e.target.value) as SliderState['waterMorphA']);
              blurSelectAfterChange(e.currentTarget);
            }}
          >
            <EarthPresetOptions options={waterPresetOptions} />
          </select>
        </div>

        <div className="sc-morph-slider">
          {ds('waterMorph', 'Morph', 'rgba(74,158,255,0.5)')}
        </div>

        <div className="sc-preset-slot">
          <select
            className="sc-preset-select"
            value={String(state.waterMorphB)}
            onChange={(e) => {
              onSelectChange('waterMorphB', Number(e.target.value) as SliderState['waterMorphB']);
              blurSelectAfterChange(e.currentTarget);
            }}
          >
            <EarthPresetOptions options={waterPresetOptions} />
          </select>
        </div>
        <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>B</span>
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
