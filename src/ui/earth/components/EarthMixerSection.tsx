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

        <div className="mixer-group-label">Levels</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.waterEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('waterEnabled', !state.waterEnabled)}
            title={state.waterEnabled ? 'Disable Water' : 'Enable Water'}
          >
            {state.waterEnabled ? '●' : '○'}
          </button>
          {ds('waterLevel', 'Water', 'rgba(74,158,255,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)}
            title={state.oceanSampleEnabled ? 'Disable Waves' : 'Enable Waves'}
          >
            {state.oceanSampleEnabled ? '●' : '○'}
          </button>
          {ds('oceanSampleLevel', 'Waves', 'rgba(0,212,255,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.birdsEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('birdsEnabled', !state.birdsEnabled)}
            title={state.birdsEnabled ? 'Disable Birds — Alps' : 'Enable Birds — Alps'}
          >
            {state.birdsEnabled ? '●' : '○'}
          </button>
          {ds('birdsLevel', 'Birds — Alps', 'rgba(165,196,212,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.birds2Enabled ? 'on' : ''}`}
            onClick={() => onSelectChange('birds2Enabled', !state.birds2Enabled)}
            title={state.birds2Enabled ? 'Disable Birds — Fujian' : 'Enable Birds — Fujian'}
          >
            {state.birds2Enabled ? '●' : '○'}
          </button>
          {ds('birds2Level', 'Birds — Fujian', 'rgba(142,197,212,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.frogsEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('frogsEnabled', !state.frogsEnabled)}
            title={state.frogsEnabled ? 'Disable Frogs' : 'Enable Frogs'}
          >
            {state.frogsEnabled ? '●' : '○'}
          </button>
          {ds('frogsLevel', 'Frogs', 'rgba(180,180,80,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.insectsEnabled ? 'on' : ''}`}
            onClick={() => onSelectChange('insectsEnabled', !state.insectsEnabled)}
            title={state.insectsEnabled ? 'Disable Insects 1' : 'Enable Insects 1'}
          >
            {state.insectsEnabled ? '●' : '○'}
          </button>
          {ds('insectsLevel', 'Insects 1', 'rgba(46,204,113,0.5)')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <button
            className={`layer-toggle ${state.insects2Enabled ? 'on' : ''}`}
            onClick={() => onSelectChange('insects2Enabled', !state.insects2Enabled)}
            title={state.insects2Enabled ? 'Disable Insects 2' : 'Enable Insects 2'}
          >
            {state.insects2Enabled ? '●' : '○'}
          </button>
          {ds('insects2Level', 'Insects 2', 'rgba(39,174,96,0.5)')}
        </div>

        <div className="mixer-group-label">Reverb Sends</div>
        {ds('oceanReverbSend', 'Waves Reverb', 'rgba(139,92,246,0.5)')}
        {ds('birdsReverbSend', 'Birds Alps Reverb', 'rgba(139,92,246,0.45)')}
        {ds('birds2ReverbSend', 'Birds Fujian Reverb', 'rgba(139,92,246,0.45)')}
        {ds('frogsReverbSend', 'Frogs Reverb', 'rgba(139,92,246,0.4)')}
        {ds('waterReverbSend', 'Water Reverb', 'rgba(139,92,246,0.5)')}
        {ds('insectsReverbSend', 'Insects Reverb', 'rgba(139,92,246,0.5)')}

        <div className="mixer-group-label">Delay Sends</div>
        {ds('oceanDelayASend', 'Waves → Delay A', 'rgba(168,85,247,0.4)')}
        {ds('oceanDelayBSend', 'Waves → Delay B', 'rgba(168,85,247,0.4)')}
        {ds('birdsDelayASend', 'Birds Alps → Delay A', 'rgba(168,85,247,0.35)')}
        {ds('birdsDelayBSend', 'Birds Alps → Delay B', 'rgba(168,85,247,0.35)')}
        {ds('birds2DelayASend', 'Birds Fujian → Delay A', 'rgba(168,85,247,0.35)')}
        {ds('birds2DelayBSend', 'Birds Fujian → Delay B', 'rgba(168,85,247,0.35)')}
        {ds('frogsDelayASend', 'Frogs → Delay A', 'rgba(168,85,247,0.35)')}
        {ds('frogsDelayBSend', 'Frogs → Delay B', 'rgba(168,85,247,0.35)')}

        <div className="mixer-group-label">Granular Routing</div>
        {ds('granularWavesSend', 'Waves → Granular', 'rgba(168,85,247,0.5)')}
        {ds('granularWaterSend', 'Water → Granular', 'rgba(168,85,247,0.5)')}
        {ds('granularInsectsSend', 'Insects → Granular', 'rgba(168,85,247,0.5)')}
      </div>
    </div>
  );
}
