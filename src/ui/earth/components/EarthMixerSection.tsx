import type { SliderState } from '../../state';
import { EarthDualSliderRenderer } from './EarthControls';

type EarthMixerSectionProps = {
  state: SliderState;
  ds: EarthDualSliderRenderer;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
};

export function EarthMixerSection({ state, ds, onSelectChange }: EarthMixerSectionProps) {
  return (
    <div className="mixer-section">
      <div className="mixer-section-header">Earth Mixer</div>
      <div className="mixer-section-body">
        {ds('earthLevel', 'Earth Master', 'rgba(255,215,0,0.5)')}
        <div className="section-divider" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <button
            className={`layer-toggle ${state.waterEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('waterEnabled', !state.waterEnabled)}
            title={state.waterEnabled ? 'Disable Water' : 'Enable Water'}
          >
            {state.waterEnabled ? '●' : '○'}
          </button>
          {ds('waterLevel', 'Water', 'rgba(74,158,255,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <button
            className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)}
            title={state.oceanSampleEnabled ? 'Disable Ghetary Waves' : 'Enable Ghetary Waves'}
          >
            {state.oceanSampleEnabled ? '●' : '○'}
          </button>
          {ds('oceanSampleLevel', 'Waves', 'rgba(0,212,255,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <button
            className={`layer-toggle ${state.insectsEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('insectsEnabled', !state.insectsEnabled)}
            title={state.insectsEnabled ? 'Disable Insect 1' : 'Enable Insect 1'}
          >
            {state.insectsEnabled ? '●' : '○'}
          </button>
          {ds('insectsLevel', 'Insect 1', 'rgba(46,204,113,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <button
            className={`layer-toggle ${state.insects2Enabled ? 'on' : ''}`}
            onClick={() => onSelectChange('insects2Enabled', !state.insects2Enabled)}
            title={state.insects2Enabled ? 'Disable Insect 2' : 'Enable Insect 2'}
          >
            {state.insects2Enabled ? '●' : '○'}
          </button>
          {ds('insects2Level', 'Insect 2', 'rgba(39,174,96,0.5)')}
        </div>

        <div className="section-divider" />

        {ds('oceanReverbSend', 'Waves Reverb', 'rgba(139,92,246,0.5)')}
        {ds('waterReverbSend', 'Water Reverb', 'rgba(139,92,246,0.5)')}
        {ds('insectsReverbSend', 'Insect Reverb', 'rgba(139,92,246,0.5)')}

        <div className="section-divider" />

        {ds('granularWavesSend', 'Waves → Granular', 'rgba(168,85,247,0.5)')}
        {ds('granularWaterSend', 'Water → Granular', 'rgba(168,85,247,0.5)')}
        {ds('granularInsectsSend', 'Insects → Granular', 'rgba(168,85,247,0.5)')}
      </div>
    </div>
  );
}
