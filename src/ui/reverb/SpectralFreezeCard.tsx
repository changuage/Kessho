import React from 'react';
import type { SelectRenderer } from '../../app/AppControls';
import type { SliderRendererProps, SliderRuntimeRendererProps } from '../sliderSystem';
import type { SliderState } from '../state';

interface SpectralFreezeCardProps {
  state: SliderState;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntimeRendererProps<keyof SliderState>;
  SliderComponent: React.ComponentType<SliderRendererProps<keyof SliderState>>;
  SelectComponent: SelectRenderer;
}

export function nextSpectralFreezeCaptureSerial(current: number): number {
  const next = (Math.trunc(current) + 1) >>> 0;
  return next === 0 ? 1 : next;
}

export default function SpectralFreezeCard({
  state,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent: Slider,
  SelectComponent: Select,
}: SpectralFreezeCardProps) {
  const isStretch = state.spectralFreezeMode === 'stretch' || state.spectralFreezeMode === 'livingStretch';
  const isLiving = state.spectralFreezeMode === 'livingStretch';
  const usesRefresh = state.spectralFreezeMode === 'slushy' || isLiving;

  const capture = () => {
    onSelectChange('spectralFreezeEnabled', true);
    onParamChange('spectralFreezeCaptureSerial', nextSpectralFreezeCaptureSerial(state.spectralFreezeCaptureSerial));
    onSelectChange('spectralFreezeActive', true);
  };

  const toggleEngine = () => {
    if (state.spectralFreezeEnabled) {
      if (state.spectralFreezeActive) onSelectChange('spectralFreezeActive', false);
      onSelectChange('spectralFreezeEnabled', false);
      return;
    }
    onSelectChange('spectralFreezeEnabled', true);
  };

  const status = !state.spectralFreezeEnabled
    ? 'Engine off'
    : state.spectralFreezeActive
      ? (state.spectralFreezeMode === 'slushy' ? 'Slushy' : isStretch ? 'Stretching' : 'Frozen')
      : 'Recording';

  return (
    <div className="reverb-section-card reverb-freeze-card">
      <div className="reverb-section-head">
        <span className="reverb-section-title">Spectral Freeze</span>
        <span className="reverb-section-note">16-second spectral memory</span>
      </div>
      <div className="reverb-section-body">
        <div className="reverb-grid-2 reverb-freeze-row">
          <button
            className={`reverb-mode-btn${state.spectralFreezeEnabled ? ' active reverb-mode-btn-freeze' : ''}`}
            onClick={toggleEngine}
            aria-pressed={state.spectralFreezeEnabled}
          >
            {state.spectralFreezeEnabled ? 'Engine On' : 'Engine Off'}
          </button>
          <button
            className={`reverb-mode-btn reverb-capture-btn${state.spectralFreezeActive ? ' active reverb-mode-btn-freeze' : ''}`}
            onClick={state.spectralFreezeActive ? () => onSelectChange('spectralFreezeActive', false) : capture}
            aria-pressed={state.spectralFreezeActive}
          >
            {state.spectralFreezeActive ? 'Release' : 'Capture & Freeze'}
          </button>
        </div>
        <div className="reverb-freeze-status" role="status">{status}</div>

        {state.spectralFreezeEnabled && (
          <>
            <Select
              label="Mode"
              value={state.spectralFreezeMode}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'slushy', label: 'Slushy' },
                { value: 'stretch', label: 'Stretch' },
                { value: 'livingStretch', label: 'Living Stretch' },
              ]}
              onChange={(value) => onSelectChange('spectralFreezeMode', value as SliderState['spectralFreezeMode'])}
            />

            {isStretch && (
              <>
                <div className="reverb-grid-2">
                  <Slider label="Speed" value={state.spectralFreezeStretchSpeed} paramKey="spectralFreezeStretchSpeed" onChange={onParamChange} {...sliderProps('spectralFreezeStretchSpeed')} />
                  <Select
                    label="Direction"
                    value={state.spectralFreezeDirection}
                    options={[
                      { value: 'forward', label: 'Forward' },
                      { value: 'reverse', label: 'Reverse' },
                      { value: 'pingpong', label: 'Ping-pong' },
                    ]}
                    onChange={(value) => onSelectChange('spectralFreezeDirection', value as SliderState['spectralFreezeDirection'])}
                  />
                </div>
                <Slider label="Position" value={state.spectralFreezePosition} paramKey="spectralFreezePosition" onChange={onParamChange} {...sliderProps('spectralFreezePosition')} />
              </>
            )}

            {usesRefresh && (
              <div className="reverb-grid-2">
                <Slider label="Refresh" value={state.spectralFreezeRefresh} paramKey="spectralFreezeRefresh" onChange={onParamChange} {...sliderProps('spectralFreezeRefresh')} />
                <Slider label="Input Sensitivity" value={state.spectralFreezeInputSensitivity} paramKey="spectralFreezeInputSensitivity" onChange={onParamChange} {...sliderProps('spectralFreezeInputSensitivity')} />
              </div>
            )}

            <div className="reverb-grid-2">
              <Slider label="Level" value={state.spectralFreezeMix} paramKey="spectralFreezeMix" onChange={onParamChange} {...sliderProps('spectralFreezeMix')} />
              <Slider label="Sustain" value={state.spectralFreezeSustain} paramKey="spectralFreezeSustain" onChange={onParamChange} {...sliderProps('spectralFreezeSustain')} />
            </div>
            <div className="reverb-grid-2">
              <Slider label="Diffusion" value={state.spectralFreezeDiffusion} paramKey="spectralFreezeDiffusion" onChange={onParamChange} {...sliderProps('spectralFreezeDiffusion')} />
              <Slider label="Tone" value={state.spectralFreezeTone} paramKey="spectralFreezeTone" onChange={onParamChange} {...sliderProps('spectralFreezeTone')} />
            </div>
            <Slider label="Width" value={state.spectralFreezeWidth} paramKey="spectralFreezeWidth" onChange={onParamChange} {...sliderProps('spectralFreezeWidth')} />
          </>
        )}
      </div>
    </div>
  );
}
