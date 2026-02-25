import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { SliderState, SliderMode } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';

interface DualSliderRange {
  min: number;
  max: number;
}

interface MorphSliderProps {
  voice: DrumVoiceType;
  state: SliderState;
  color: string;
  getPresetNames: (voice: DrumVoiceType) => string[];
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    onCycleMode: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  };
}

const MORPH_KEYS: Record<DrumVoiceType, { a: keyof SliderState; b: keyof SliderState; morph: keyof SliderState }> = {
  sub: { a: 'drumSubPresetA', b: 'drumSubPresetB', morph: 'drumSubMorph' },
  kick: { a: 'drumKickPresetA', b: 'drumKickPresetB', morph: 'drumKickMorph' },
  click: { a: 'drumClickPresetA', b: 'drumClickPresetB', morph: 'drumClickMorph' },
  beepHi: { a: 'drumBeepHiPresetA', b: 'drumBeepHiPresetB', morph: 'drumBeepHiMorph' },
  beepLo: { a: 'drumBeepLoPresetA', b: 'drumBeepLoPresetB', morph: 'drumBeepLoMorph' },
  noise: { a: 'drumNoisePresetA', b: 'drumNoisePresetB', morph: 'drumNoiseMorph' },
  membrane: { a: 'drumMembranePresetA', b: 'drumMembranePresetB', morph: 'drumMembraneMorph' },
};

const MODE_LABELS: Record<SliderMode, string> = {
  single: '',
  walk: '⟷ Walk',
  sampleHold: '⟷ S&H',
};

const MorphSlider: React.FC<MorphSliderProps> = ({
  voice,
  state,
  color,
  getPresetNames,
  onParamChange,
  sliderProps: getSliderProps,
}) => {
  const morph = MORPH_KEYS[voice];
  const sp = getSliderProps(morph.morph);
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
      sp.onCycleMode(morph.morph);
    }, 400);
  }, [sp, morph.morph]);

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
        sp.onDualRangeChange(morph.morph, Math.min(newValue, sp.dualRange!.max), sp.dualRange!.max);
      } else {
        sp.onDualRangeChange(morph.morph, sp.dualRange!.min, Math.max(newValue, sp.dualRange!.min));
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
  }, [dragging, isDual, sp, morph.morph]);

  const morphValue = state[morph.morph] as number;
  const modeColor = sp.mode === 'walk' ? '#a5c4d4' : sp.mode === 'sampleHold' ? '#D4A520' : color;

  return (
    <div className="vc-morph-row">
      <span className="morph-label">A</span>
      <select
        value={String(state[morph.a])}
        onChange={(e) => onParamChange(morph.a, e.target.value as SliderState[keyof SliderState])}
        data-voice={voice}
        data-slot="A"
        title="Preset A"
      >
        {getPresetNames(voice).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>

      {/* Single mode: standard range input */}
      {!isDual && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={morphValue}
          data-key={`morph-${voice}`}
          onChange={(e) => onParamChange(morph.morph, parseFloat(e.target.value) as SliderState[keyof SliderState])}
          onDoubleClick={() => sp.onCycleMode(morph.morph)}
          onTouchStart={handleLongPressStart}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          title="Double-click or long-press to cycle mode"
        />
      )}

      {/* Dual mode: custom dual-thumb track */}
      {isDual && (() => {
        const dMin = sp.dualRange?.min ?? 0;
        const dMax = sp.dualRange?.max ?? 1;
        const walkPos = sp.walkPosition ?? 0.5;
        const walkPct = (dMin + walkPos * (dMax - dMin)) * 100;
        const minPct = dMin * 100;
        const maxPct = dMax * 100;

        return (
          <div className="morph-dual-wrap">
            <div className="morph-dual-mode" style={{ color: modeColor }}>
              {MODE_LABELS[sp.mode]}
            </div>
            <div
              className="morph-dual-track"
              ref={trackRef}
              onDoubleClick={() => sp.onCycleMode(morph.morph)}
              onTouchStart={handleLongPressStart}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
            >
              {/* Filled range */}
              <div
                className="morph-dual-fill"
                style={{
                  left: `${minPct}%`,
                  width: `${maxPct - minPct}%`,
                  background: `color-mix(in srgb, ${modeColor} 35%, transparent)`,
                }}
              />
              {/* Walk position indicator */}
              <div
                className="morph-dual-walk"
                style={{
                  left: `${walkPct}%`,
                  background: modeColor,
                }}
              />
              {/* Min thumb */}
              <div
                className="morph-dual-thumb"
                style={{ left: `${minPct}%`, borderColor: modeColor }}
                onMouseDown={(e) => { e.preventDefault(); setDragging('min'); }}
                onTouchStart={(e) => { e.stopPropagation(); setDragging('min'); }}
              />
              {/* Max thumb */}
              <div
                className="morph-dual-thumb"
                style={{ left: `${maxPct}%`, borderColor: modeColor }}
                onMouseDown={(e) => { e.preventDefault(); setDragging('max'); }}
                onTouchStart={(e) => { e.stopPropagation(); setDragging('max'); }}
              />
            </div>
          </div>
        );
      })()}

      <select
        value={String(state[morph.b])}
        onChange={(e) => onParamChange(morph.b, e.target.value as SliderState[keyof SliderState])}
        data-voice={voice}
        data-slot="B"
        title="Preset B"
      >
        {getPresetNames(voice).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <span className="morph-label">B</span>
    </div>
  );
};

export default MorphSlider;
