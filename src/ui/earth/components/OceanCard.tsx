import type { SliderState } from '../../state';
import { EarthCard, EarthDualSliderRenderer, ParamSlider } from './EarthControls';

type OceanCardProps = {
  state: SliderState;
  ds: EarthDualSliderRenderer;
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
};

export function OceanCard({
  state,
  ds,
  expandedCards,
  onToggleCard,
  onParamChange,
  onSelectChange,
}: OceanCardProps) {
  return (
    <EarthCard
      cardId="ocean"
      title="Waves"
      accent="#00d4ff"
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
    >
      <div className="layer-row" style={{ marginBottom: 10 }}>
        <button
          className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
          onClick={() => onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)}
          title={state.oceanSampleEnabled ? 'Disable Ghetary Waves' : 'Enable Ghetary Waves'}
        >
          {state.oceanSampleEnabled ? '●' : '○'}
        </button>
        <span className="layer-label" style={{ minWidth: 100 }}>Ghetary Waves</span>
        <span className="layer-value">{state.oceanSampleEnabled ? 'ON' : 'OFF'}</span>
      </div>
      {ds('oceanSampleLevel', 'Waves Level', 'rgba(0,212,255,0.5)')}

      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Waves Filter
        </span>
      </div>
      <div className="param-row">
        <span className="param-label">Filter Type</span>
        <select
          className="earth-select"
          value={state.oceanFilterType}
          onChange={e =>
            onSelectChange(
              'oceanFilterType',
              e.target.value as SliderState['oceanFilterType'],
            )
          }
          style={{ flex: 1 }}
        >
          <option value="lowpass">Lowpass (Warm)</option>
          <option value="bandpass">Bandpass (Focused)</option>
          <option value="highpass">Highpass (Airy)</option>
          <option value="notch">Notch (Scoop)</option>
        </select>
        <span className="param-value">&nbsp;</span>
      </div>

      <ParamSlider
        paramKey="oceanFilterCutoff"
        label="Filter Cutoff"
        value={state.oceanFilterCutoff}
        min={40}
        max={12000}
        step={10}
        onChange={v => onParamChange('oceanFilterCutoff', v)}
        format={v => `${Math.round(v)} Hz`}
      />
      <ParamSlider
        paramKey="oceanFilterResonance"
        label="Filter Resonance"
        value={state.oceanFilterResonance}
        onChange={v => onParamChange('oceanFilterResonance', v)}
      />
    </EarthCard>
  );
}
