import React, { useCallback, useEffect, useState } from 'react';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumVoiceConfig } from '../../audio/drumVoiceConfig';
import MorphSlider from './MorphSlider';
import VoiceCardAdvanced from './VoiceCardAdvanced';
import DrumPresetManager from './DrumPresetManager';
import { useSliderHelp } from '../SliderHelpOverlay';

interface VoiceCardProps {
  voice: DrumVoiceType;
  config: DrumVoiceConfig;
  panelId: string;
  state: SliderState;
  isMobile: boolean;
  isExpanded: boolean;
  togglePanel: (id: string) => void;
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  getPresetNames: (voice: DrumVoiceType) => string[];
  triggerVoice: (voice: DrumVoiceType) => void;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  editingVoice?: string | null;
  onToggleEditing?: (voice: string) => void;
  isTriggered?: boolean;
  getAnalyserNode?: (voice: DrumVoiceType) => AnalyserNode | undefined;
  preloadAudioEngine?: () => Promise<unknown>;
}

const DELAY_SEND_KEYS: Partial<Record<DrumVoiceType, keyof SliderState>> = {
  sub: 'drumSubDelaySend',
  kick: 'drumKickDelaySend',
  click: 'drumClickDelaySend',
  beepHi: 'drumBeepHiDelaySend',
  beepLo: 'drumBeepLoDelaySend',
  noise: 'drumNoiseDelaySend',
  membrane: 'drumMembraneDelaySend',
};

const VARIATION_KEYS: Record<DrumVoiceType, { variation: keyof SliderState; distance: keyof SliderState }> = {
  sub: { variation: 'drumSubVariation', distance: 'drumSubDistance' },
  kick: { variation: 'drumKickVariation', distance: 'drumKickDistance' },
  click: { variation: 'drumClickVariation', distance: 'drumClickDistance' },
  beepHi: { variation: 'drumBeepHiVariation', distance: 'drumBeepHiDistance' },
  beepLo: { variation: 'drumBeepLoVariation', distance: 'drumBeepLoDistance' },
  noise: { variation: 'drumNoiseVariation', distance: 'drumNoiseDistance' },
  membrane: { variation: 'drumMembraneVariation', distance: 'drumMembraneDistance' },
};

const VoiceCard: React.FC<VoiceCardProps> = ({
  voice,
  config,
  state,
  onParamChange,
  sliderProps,
  getPresetNames,
  triggerVoice,
  SliderComponent,
  editingVoice,
  onToggleEditing,
  isTriggered = false,
  getAnalyserNode,
  preloadAudioEngine,
}) => {
  const isEditing = editingVoice === voice;
  const macros = VARIATION_KEYS[voice];
  const varVal = state[macros.variation] as number;
  const distVal = state[macros.distance] as number;
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | undefined>(undefined);
  const { announceHelp } = useSliderHelp();
  const delaySendKey = DELAY_SEND_KEYS[voice];
  const bindHelp = useCallback((helpKey: string) => ({
    onMouseEnter: () => announceHelp(helpKey),
    onPointerDown: () => announceHelp(helpKey),
    onFocus: () => announceHelp(helpKey),
  }), [announceHelp]);

  useEffect(() => {
    if (!isEditing || !getAnalyserNode) {
      setAnalyserNode(undefined);
      return;
    }

    let cancelled = false;

    const resolveAnalyserNode = async () => {
      try {
        await preloadAudioEngine?.();
        if (cancelled) return;
        const nextAnalyserNode = getAnalyserNode(voice);
        setAnalyserNode((prev) => (prev === nextAnalyserNode ? prev : nextAnalyserNode));
      } catch {
        if (!cancelled) {
          setAnalyserNode(undefined);
        }
      }
    };

    void resolveAnalyserNode();

    return () => {
      cancelled = true;
    };
  }, [getAnalyserNode, isEditing, isTriggered, preloadAudioEngine, voice]);

  return (
    <div
      className={`voice-card${isEditing ? ' editing' : ''}`}
      style={{ '--vc': config.color } as React.CSSProperties}
    >
      {/* ── Card body: sidebar (left) + sliders (right) ── */}
      <div className="voice-card-body">
        {/* Left sidebar */}
        <div className="vc-sidebar">
          <div className="vc-label-row">
            <span className={`vc-icon vc-icon-${voice}`}>{config.icon}</span>
            <span className="vc-name">{config.label}</span>
          </div>
          <div className="vc-btn-row">
            <button
              className={`vc-trigger-sm trigger-btn${isTriggered ? ' triggered' : ''}`}
              data-voice={voice}
              onClick={() => triggerVoice(voice)}
              title={`Test ${config.label}`}
              {...bindHelp('drumVoiceTrigger')}
            >
              ▶︎
            </button>
            {onToggleEditing && (
              <button
                className="vc-edit-btn"
                onClick={() => onToggleEditing(voice)}
                title={isEditing ? 'Close advanced' : 'Advanced parameters'}
                {...bindHelp('drumVoiceAdvanced')}
              >
                ✎
              </button>
            )}
          </div>
        </div>

        {/* Right side: morph row + macro sliders */}
        <div className="vc-sliders">
          {/* Morph row: preset A/B + morph slider */}
          <MorphSlider
            voice={voice}
            state={state}
            getPresetNames={getPresetNames}
            onParamChange={onParamChange}
            sliderProps={sliderProps}
            SliderComponent={SliderComponent}
          />

          {/* Macro sliders: Variation + Distance in 2-column grid */}
          <div className="vc-macros">
            <div className="vc-macro-slider">
              <SliderComponent
                label="Var"
                value={varVal}
                paramKey={macros.variation}
                onChange={onParamChange as (key: keyof SliderState, value: number) => void}
                format={(value: number) => String(Math.round(value * 100))}
                unit="%"
                {...sliderProps(macros.variation)}
              />
            </div>
            <div className="vc-macro-slider">
              <SliderComponent
                label="Dist"
                value={distVal}
                paramKey={macros.distance}
                onChange={onParamChange as (key: keyof SliderState, value: number) => void}
                format={(value: number) => String(Math.round(value * 100))}
                unit="%"
                {...sliderProps(macros.distance)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Advanced panel: shown when editing (✎ toggled) ── */}
      {isEditing && (
        <div className="voice-card-advanced">
          {/* Preset manager: first section above Tone */}
          <DrumPresetManager
            voice={voice}
            state={state}
            color={config.color}
            onParamChange={onParamChange}
          />

          <VoiceCardAdvanced
            voice={voice}
            config={config}
            state={state}
            onParamChange={onParamChange}
            sliderProps={sliderProps}
            SliderComponent={SliderComponent}
            isTriggered={isTriggered}
            analyserNode={analyserNode}
          />

          {/* Delay send at bottom of advanced */}
          {delaySendKey && (
            <div className="param-section">
              <div className="section-header">Send</div>
              <div className="section-body">
                <div className="param-row param-row--slider">
                  <SliderComponent
                    label="Delay Send"
                    value={state[delaySendKey] as number}
                    paramKey={delaySendKey}
                    onChange={onParamChange as (key: keyof SliderState, value: number) => void}
                    format={(value: number) => String(Math.round(value * 100))}
                    unit="%"
                    {...sliderProps(delaySendKey)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceCard;
