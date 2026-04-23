import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { SliderState, SliderMode } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { useSliderHelp } from '../SliderHelpOverlay';
import { usePresets } from '../../presets/usePresets';
import { useRuntimeSliderPosition } from '../runtimeSliderState';
import { useRuntimeValue } from '../runtimeValueState';
import {
  getFactoryPresetNames,
  setUserPresets,
} from '../../audio/drumPresets';

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

const AUTO_KEYS: Record<DrumVoiceType, keyof SliderState> = {
  sub: 'drumSubMorphAuto',
  kick: 'drumKickMorphAuto',
  click: 'drumClickMorphAuto',
  beepHi: 'drumBeepHiMorphAuto',
  beepLo: 'drumBeepLoMorphAuto',
  noise: 'drumNoiseMorphAuto',
  membrane: 'drumMembraneMorphAuto',
};

const MODE_LABELS: Record<SliderMode, string> = {
  single: '',
  walk: '⟷ Walk',
  sampleHold: '⟷ S&H',
};

const DRUM_ENGINE_SCOPES: Record<DrumVoiceType, string> = {
  sub: 'drumSub',
  kick: 'drumKick',
  click: 'drumClick',
  beepHi: 'drumBeepHi',
  beepLo: 'drumBeepLo',
  noise: 'drumNoise',
  membrane: 'drumMembrane',
};

function createRuntimeDrumPreset(
  voice: DrumVoiceType,
  name: string,
  data: Record<string, unknown>,
  tags?: string[],
) {
  const params: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' || typeof value === 'string') {
      params[key] = value;
    }
  }
  return {
    name,
    voice,
    params,
    tags: tags ?? [],
  };
}

const MorphSlider: React.FC<MorphSliderProps> = ({
  voice,
  state,
  color,
  getPresetNames,
  onParamChange,
  sliderProps: getSliderProps,
}) => {
  const morph = MORPH_KEYS[voice];
  const engineScope = DRUM_ENGINE_SCOPES[voice];
  const { presets: enginePresets, load } = usePresets('engine', engineScope);
  const sp = getSliderProps(morph.morph);
  const isDual = sp.mode !== 'single';
  const liveWalkPosition = useRuntimeSliderPosition(String(morph.morph), sp.mode, sp.walkPosition);
  const liveMorphValue = useRuntimeValue(String(morph.morph), state[morph.morph] as number);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  const { announceSlider } = useSliderHelp();
  const announceHelp = useCallback(() => {
    announceSlider(String(morph.morph), { label: 'Morph' });
  }, [announceSlider, morph.morph]);

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
      const clientX = 'touches' in e
        ? (e.touches.length > 0 ? e.touches[0]!.clientX : rect.left)
        : e.clientX;
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

  const autoEnabled = Boolean(state[AUTO_KEYS[voice]]);
  const animateMorphValue = autoEnabled && Boolean(state.drumMorphSliderAnimate);
  const morphValue = animateMorphValue
    ? (liveMorphValue ?? (state[morph.morph] as number))
    : (state[morph.morph] as number);
  const modeColor = sp.mode === 'walk' ? '#a5c4d4' : sp.mode === 'sampleHold' ? '#D4A520' : color;
  const factoryPresetNames = getFactoryPresetNames(voice);
  const knownPresetNames = getPresetNames(voice);
  const summaryByName = new Map(enginePresets.map(preset => [preset.name, preset]));
  const userPresetNames: string[] = [];
  const cloudPresetNames: string[] = [];

  for (const name of knownPresetNames) {
    if (factoryPresetNames.includes(name)) continue;
    const summary = summaryByName.get(name);
    if (summary?.library === 'cloud') {
      cloudPresetNames.push(name);
    } else {
      userPresetNames.push(name);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const syncRuntimePresets = async () => {
      const runtimeNames = Array.from(new Set(enginePresets.map(preset => preset.name)));

      if (!runtimeNames.length) {
        setUserPresets(voice, []);
        return;
      }

      const runtimePresets = await Promise.all(runtimeNames.map(async (name) => {
        const entry = await load(name);
        if (!entry) return null;
        const version = entry.versions.find(v => v.v === entry.currentVersion)
          || entry.versions[entry.versions.length - 1];
        if (!version) return null;
        return createRuntimeDrumPreset(voice, entry.name, version.data, entry.tags);
      }));

      if (!cancelled) {
        setUserPresets(voice, runtimePresets.filter((preset): preset is ReturnType<typeof createRuntimeDrumPreset> => Boolean(preset)));
      }
    };

    syncRuntimePresets().catch((error) => {
      console.warn(`Failed to sync drum L1 presets for ${voice}:`, error);
      if (!cancelled) setUserPresets(voice, []);
    });

    return () => {
      cancelled = true;
    };
  }, [enginePresets, load, voice]);

  return (
    <div className="vc-morph-row">
      <span className="morph-label">A</span>
      <div className="morph-slot-wrap">
        <select
          value={String(state[morph.a])}
          onChange={(e) => onParamChange(morph.a, e.target.value as SliderState[keyof SliderState])}
          data-voice={voice}
          data-slot="A"
          title="Preset A"
        >
          <optgroup label="Stock">
            {factoryPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </optgroup>
          {userPresetNames.length > 0 && (
            <optgroup label="My Presets">
              {userPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
          {cloudPresetNames.length > 0 && (
            <optgroup label="Cloud">
              {cloudPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {/* Single mode: standard range input */}
      {!isDual && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={morphValue}
          data-key={`morph-${voice}`}
          onChange={(e) => {
            announceHelp();
            onParamChange(morph.morph, parseFloat(e.target.value) as SliderState[keyof SliderState]);
          }}
          onMouseEnter={announceHelp}
          onPointerDown={announceHelp}
          onFocus={announceHelp}
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
        const walkPos = liveWalkPosition ?? sp.walkPosition ?? 0.5;
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
              onMouseEnter={announceHelp}
              onPointerDown={announceHelp}
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
                onMouseDown={(e) => { e.preventDefault(); announceHelp(); setDragging('min'); }}
                onTouchStart={(e) => { e.stopPropagation(); announceHelp(); setDragging('min'); }}
              />
              {/* Max thumb */}
              <div
                className="morph-dual-thumb"
                style={{ left: `${maxPct}%`, borderColor: modeColor }}
                onMouseDown={(e) => { e.preventDefault(); announceHelp(); setDragging('max'); }}
                onTouchStart={(e) => { e.stopPropagation(); announceHelp(); setDragging('max'); }}
              />
            </div>
          </div>
        );
      })()}

      <div className="morph-slot-wrap">
        <select
          value={String(state[morph.b])}
          onChange={(e) => onParamChange(morph.b, e.target.value as SliderState[keyof SliderState])}
          data-voice={voice}
          data-slot="B"
          title="Preset B"
        >
          <optgroup label="Stock">
            {factoryPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </optgroup>
          {userPresetNames.length > 0 && (
            <optgroup label="My Presets">
              {userPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
          {cloudPresetNames.length > 0 && (
            <optgroup label="Cloud">
              {cloudPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <span className="morph-label">B</span>
    </div>
  );
};

export default MorphSlider;
