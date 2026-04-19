import type { SliderState } from '../../state';
import { EarthCard, EarthDualSliderRenderer } from './EarthControls';

type OceanCardProps = {
  state: SliderState;
  ds: EarthDualSliderRenderer;
  expandedCards: Set<string>;
  onToggleCard?: (id: string) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  enabled?: boolean;
};

export function OceanCard({
  state,
  ds,
  expandedCards,
  onToggleCard,
  onSelectChange,
  enabled,
}: OceanCardProps) {
  return (
    <EarthCard
      cardId="ocean"
      title="Waves"
      accent="#00d4ff"
      expandedCards={expandedCards}
      onToggleCard={onToggleCard}
      enabled={enabled}
    >
      <div className="layer-row" style={{ marginBottom: 4 }}>
        <button
          className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
          onClick={() => onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)}
          title={state.oceanSampleEnabled ? 'Disable Ghetary Waves' : 'Enable Ghetary Waves'}
        >
          {state.oceanSampleEnabled ? '●' : '○'}
        </button>
        <span className="layer-label" style={{ minWidth: 'clamp(72px, 24vw, 100px)' }}>Ghetary Waves</span>
        <span className="layer-value">{state.oceanSampleEnabled ? 'ON' : 'OFF'}</span>
      </div>
      {ds('oceanSampleLevel', 'Waves Level', 'rgba(0,212,255,0.5)')}
      {ds('oceanSliceDuration', 'Slice Duration', 'rgba(0,212,255,0.35)', {
        format: (v) => `${v.toFixed(1)} s`,
      })}
      {ds('oceanSliceDensity', 'Slice Density', 'rgba(0,212,255,0.28)')}

      <div className="earth-section-label" style={{ marginTop: 6, marginBottom: 4 }}>
        Waves Filter
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

      {ds('oceanFilterCutoff', 'Filter Cutoff', 'rgba(0,212,255,0.24)', {
        format: (v) => `${Math.round(v)} Hz`,
        logarithmic: true,
      })}
      {ds('oceanFilterResonance', 'Filter Resonance', 'rgba(0,212,255,0.18)')}
    </EarthCard>
  );
}
