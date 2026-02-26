import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { SliderState, SliderMode } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumVoiceConfig } from '../../audio/drumVoiceConfig';
import MorphSlider from './MorphSlider';
import VoiceCardAdvanced from './VoiceCardAdvanced';

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
  analyserNode?: AnalyserNode;
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
  editingVoice,
  onToggleEditing,
  isTriggered = false,
  analyserNode,
}) => {
  const isEditing = editingVoice === voice;
  const macros = VARIATION_KEYS[voice];
  const varVal = state[macros.variation] as number;
  const distVal = state[macros.distance] as number;

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
            >
              ▶︎
            </button>
            {onToggleEditing && (
              <button
                className="vc-edit-btn"
                onClick={() => onToggleEditing(voice)}
                title={isEditing ? 'Close advanced' : 'Advanced parameters'}
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
            color={config.color}
            getPresetNames={getPresetNames}
            onParamChange={onParamChange}
            sliderProps={sliderProps as any}
          />

          {/* Macro sliders: Variation + Distance in 2-column grid */}
          <div className="vc-macros">
            <MacroSlider
              label="Var"
              value={varVal}
              color={config.color}
              paramKey={macros.variation}
              onChange={(v) => onParamChange(macros.variation, v as SliderState[keyof SliderState])}
              sliderProps={sliderProps as any}
            />
            <MacroSlider
              label="Dist"
              value={distVal}
              color={config.color}
              paramKey={macros.distance}
              onChange={(v) => onParamChange(macros.distance, v as SliderState[keyof SliderState])}
              sliderProps={sliderProps as any}
            />
          </div>
        </div>
      </div>

      {/* ── Advanced panel: shown when editing (✎ toggled) ── */}
      {isEditing && (
        <div className="voice-card-advanced">
          <VoiceCardAdvanced
            voice={voice}
            config={config}
            state={state}
            onParamChange={onParamChange}
            isTriggered={isTriggered}
            analyserNode={analyserNode}
          />

          {/* Delay send at bottom of advanced */}
          {state.drumDelayEnabled && DELAY_SEND_KEYS[voice] && (
            <div className="param-section">
              <div className="section-header">Send</div>
              <div className="section-body">
                <div className="param-row">
                  <label>Delay Send</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state[DELAY_SEND_KEYS[voice]!] as number}
                    data-key={DELAY_SEND_KEYS[voice]!}
                    onChange={(e) => onParamChange(DELAY_SEND_KEYS[voice]!, parseFloat(e.target.value) as SliderState[keyof SliderState])}
                  />
                  <span className="val">
                    {Math.round((state[DELAY_SEND_KEYS[voice]!] as number) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Compact macro slider (Variation / Distance) with dual slider support ── */
interface DualSliderRange { min: number; max: number; }

const MODE_LABELS: Record<SliderMode, string> = {
  single: '',
  walk: '\u27f7W',
  sampleHold: '\u27f7S',
};

const MacroSlider: React.FC<{
  label: string;
  value: number;
  color: string;
  paramKey: keyof SliderState;
  onChange: (v: number) => void;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    onCycleMode: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  };
}> = ({ label, value, color, paramKey, onChange, sliderProps: getSliderProps }) => {
  const sp = getSliderProps(paramKey);
  const isDual = sp.mode !== 'single';
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);

  // Long press for mobile mode cycling
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleLongPressStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      sp.onCycleMode(paramKey);
    }, 400);
  }, [sp, paramKey]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Drag handling for dual-range thumbs
  useEffect(() => {
    if (!dragging || !isDual || !sp.dualRange) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newValue = Math.round(pct * 100) / 100;

      if (dragging === 'min') {
        sp.onDualRangeChange(paramKey, Math.min(newValue, sp.dualRange!.max), sp.dualRange!.max);
      } else {
        sp.onDualRangeChange(paramKey, sp.dualRange!.min, Math.max(newValue, sp.dualRange!.min));
      }
    };

    const handleEnd = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragging, isDual, sp, paramKey]);

  const modeColor = sp.mode === 'walk' ? '#a5c4d4' : sp.mode === 'sampleHold' ? '#D4A520' : color;

  if (!isDual) {
    return (
      <div className="vc-macro-item">
        <label>{label}</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onDoubleClick={() => sp.onCycleMode(paramKey)}
          onTouchStart={handleLongPressStart}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          title="Double-click or long-press to cycle mode"
        />
        <span className="val">{Math.round(value * 100)}%</span>
      </div>
    );
  }

  // Dual mode
  const dMin = sp.dualRange?.min ?? 0;
  const dMax = sp.dualRange?.max ?? 1;
  const walkPos = sp.walkPosition ?? 0.5;
  const walkPct = (dMin + walkPos * (dMax - dMin)) * 100;
  const minPct = dMin * 100;
  const maxPct = dMax * 100;

  return (
    <div className="vc-macro-item vc-macro-dual">
      <label>
        {label}
        <span className="macro-dual-mode" style={{ color: modeColor }}>{MODE_LABELS[sp.mode]}</span>
      </label>
      <div
        className="macro-dual-track"
        ref={trackRef}
        onDoubleClick={() => sp.onCycleMode(paramKey)}
        onTouchStart={handleLongPressStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
      >
        <div
          className="macro-dual-fill"
          style={{
            left: `${minPct}%`,
            width: `${maxPct - minPct}%`,
            background: `color-mix(in srgb, ${modeColor} 35%, transparent)`,
          }}
        />
        <div
          className="macro-dual-walk"
          style={{ left: `${walkPct}%`, background: modeColor }}
        />
        <div
          className="macro-dual-thumb"
          style={{ left: `${minPct}%`, borderColor: modeColor }}
          onMouseDown={(e) => { e.preventDefault(); setDragging('min'); }}
          onTouchStart={(e) => { e.stopPropagation(); setDragging('min'); }}
        />
        <div
          className="macro-dual-thumb"
          style={{ left: `${maxPct}%`, borderColor: modeColor }}
          onMouseDown={(e) => { e.preventDefault(); setDragging('max'); }}
          onTouchStart={(e) => { e.stopPropagation(); setDragging('max'); }}
        />
      </div>
      <span className="val" style={{ fontSize: '0.5rem' }}>
        {Math.round(dMin * 100)}-{Math.round(dMax * 100)}%
      </span>
    </div>
  );
};

export default VoiceCard;
