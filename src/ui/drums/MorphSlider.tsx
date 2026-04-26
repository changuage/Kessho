import React, { useEffect } from 'react';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { usePresets } from '../../presets/usePresets';
import { useRuntimeValue } from '../runtimeValueState';
import {
  getFactoryPresetNames,
  setUserPresets,
} from '../../audio/drumPresets';

interface MorphSliderProps {
  voice: DrumVoiceType;
  state: SliderState;
  getPresetNames: (voice: DrumVoiceType) => string[];
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
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
  getPresetNames,
  onParamChange,
  sliderProps: getSliderProps,
  SliderComponent,
}) => {
  const morph = MORPH_KEYS[voice];
  const engineScope = DRUM_ENGINE_SCOPES[voice];
  const { presets: enginePresets, load } = usePresets('engine', engineScope);
  const liveMorphValue = useRuntimeValue(String(morph.morph), state[morph.morph] as number);

  const autoEnabled = Boolean(state[AUTO_KEYS[voice]]);
  const animateMorphValue = autoEnabled && Boolean(state.drumMorphSliderAnimate);
  const morphValue = animateMorphValue
    ? (liveMorphValue ?? (state[morph.morph] as number))
    : (state[morph.morph] as number);
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

      <div className="vc-morph-slider">
        <SliderComponent
          label="Morph"
          value={morphValue}
          paramKey={morph.morph}
          onChange={onParamChange as (key: keyof SliderState, value: number) => void}
          format={(value: number) => String(Math.round(value * 100))}
          unit="%"
          {...getSliderProps(morph.morph)}
        />
      </div>

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
