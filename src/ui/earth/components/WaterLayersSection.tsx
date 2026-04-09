import type { SliderState } from '../../state';
import { LAYER_KEYS, LAYER_LABELS, type LayerKey } from '../../../audio/waterPresets';
import { EarthDualSliderRenderer } from './EarthControls';

const LAYER_STATE_KEY: Record<LayerKey, keyof SliderState> = {
  hardDrops: 'waterLayerHardDrops',
  waterDrops: 'waterLayerWaterDrops',
  turbulence: 'waterLayerTurbulence',
  bubbling: 'waterLayerBubbling',
  surf: 'waterLayerSurf',
  channels: 'waterLayerChannels',
};

type WaterLayersSectionProps = {
  state: SliderState;
  ds: EarthDualSliderRenderer;
  onParamChange: (key: keyof SliderState, value: number) => void;
};

export function WaterLayersSection({ state, ds, onParamChange }: WaterLayersSectionProps) {
  return (
    <div className="mixer-section">
      <div className="mixer-section-header">Water Layers</div>
      <div className="mixer-section-body">
        {LAYER_KEYS.map(key => {
          const stateKey = LAYER_STATE_KEY[key];
          const level = state[stateKey] as number;
          return (
            <div
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}
            >
              <button
                className={`layer-toggle ${level > 0.01 ? 'on' : ''}`}
                onClick={() => onParamChange(stateKey, level > 0.01 ? 0 : 0.5)}
                title={level > 0.01 ? 'Mute layer' : 'Unmute layer'}
              >
                {level > 0.01 ? '●' : '○'}
              </button>
              {ds(stateKey, LAYER_LABELS[key], 'rgba(74,158,255,0.5)')}
            </div>
          );
        })}
      </div>
    </div>
  );
}
