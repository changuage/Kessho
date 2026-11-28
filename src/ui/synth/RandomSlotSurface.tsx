import React from 'react';
import type { SliderState } from '../state';
import {
  SYNTH_RANDOM_PARAM_SPECS,
  synthRandomKey,
  synthRandomSettingsFromState,
  type SynthRandomClockSource,
  type SynthRandomTensionMode,
} from '../sequencer/synthRandomSlot';
import type { SelectRenderer } from '../../app/AppControls';
import type { SliderRendererProps, SliderRuntimeRendererProps } from '../sliderSystem';
import {
  PAD_VOICE_NUMBERS,
  cyclePadVoiceAssignment,
  padVoiceAssignment,
  padVoiceAssignmentLabel,
  padVoiceButtonStyle,
} from './padVoiceAssignment';

const CLOCK_OPTIONS: ReadonlyArray<{ value: SynthRandomClockSource; label: string }> = [
  { value: 'globalPhrase', label: 'Global Phrase' },
  { value: 'localPhrase', label: 'Local Phrase' },
  { value: 'globalBeat', label: 'Global Beat Phrase' },
  { value: 'localBeat', label: 'Local Beat Phrase' },
];

const TENSION_OPTIONS: ReadonlyArray<{ value: SynthRandomTensionMode; label: string }> = [
  { value: 'follow', label: 'Follow' },
  { value: 'locked', label: 'Locked' },
  { value: 'bypass', label: 'Bypass' },
];

const formatOctaveOffset = (value: number): string => {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
};

export interface RandomSlotSurfaceProps {
  /** Slot number, 1 to 6. */
  laneNumber: number;
  state: SliderState;
  isPadSource: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => SliderRuntimeRendererProps<keyof SliderState>;
  SliderComponent: React.ComponentType<SliderRendererProps<keyof SliderState>>;
  SelectComponent: SelectRenderer;
}

/**
 * The controls of one Random slot. Every slider is the shared slider bound to
 * the slot's own `synthEuclid<N>Random*` key, so Mod A/B, moving ranges and
 * preset morph behave exactly as they do everywhere else.
 */
export const RandomSlotSurface: React.FC<RandomSlotSurfaceProps> = ({
  laneNumber,
  state,
  isPadSource,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent: Slider,
  SelectComponent: Select,
}) => {
  const settings = synthRandomSettingsFromState(state as unknown as Record<string, unknown>, laneNumber);
  const key = <P extends keyof typeof SYNTH_RANDOM_PARAM_SPECS>(param: P) => synthRandomKey(laneNumber, param) as keyof SliderState;
  const numeric = (param: 'WaveSpread' | 'Octave' | 'Density' | 'NotesOctave' | 'OctaveRange' | 'TensionValue') => (
    state[synthRandomKey(laneNumber, param)] as number
  );
  const setSelect = (param: keyof typeof SYNTH_RANDOM_PARAM_SPECS, value: unknown) => (
    onSelectChange(key(param), value as SliderState[keyof SliderState])
  );

  return (
    <div className="random-slot-surface" data-random-mode={settings.Mode}>
      {settings.Mode === 'chords' ? (
        <>
          <div className="random-slot-row">
            <label className="random-slot-field">
              <span>Voices</span>
              <select
                className="synth-source-select"
                aria-label={`Slot ${laneNumber} chord voices`}
                value={settings.VoiceCount}
                onChange={(event) => onParamChange(key('VoiceCount'), Number(event.target.value))}
              >
                {PAD_VOICE_NUMBERS.map((voice) => (
                  <option key={voice} value={voice}>{voice}</option>
                ))}
              </select>
            </label>
            {isPadSource ? (
              <button
                type="button"
                className={`sc-toggle-btn small${settings.PadSplit ? ' on' : ''}`}
                aria-pressed={settings.PadSplit}
                title="Play the chord across Pad 1 and Pad 2 by voice assignment"
                onClick={() => setSelect('PadSplit', !settings.PadSplit)}
              >
                Split pads
              </button>
            ) : null}
            <button
              type="button"
              className={`sc-toggle-btn small${settings.FitEnvelope ? ' on' : ''}`}
              aria-pressed={settings.FitEnvelope}
              title="Shorten each voice's hold so staggered entries finish before the next chord"
              onClick={() => setSelect('FitEnvelope', !settings.FitEnvelope)}
            >
              Fit chord
            </button>
          </div>
          <Slider
            label="Wave Spread"
            value={numeric('WaveSpread')}
            paramKey={key('WaveSpread')}
            onChange={onParamChange}
            {...sliderProps(key('WaveSpread'))}
          />
          <div className="synth-wave-spread-scale" aria-hidden="true">
            <span>0</span><span>1/16</span><span>⅛</span><span>¼</span><span>½</span><span>1</span>
          </div>
          <Slider
            label="Octave Offset"
            value={numeric('Octave')}
            paramKey={key('Octave')}
            format={formatOctaveOffset}
            unit=" oct"
            onChange={onParamChange}
            {...sliderProps(key('Octave'))}
          />
          <div className="synth-octave-scale" aria-label="Octave offset range from -4 to +4 octaves">
            <span>-4</span><span>-2</span><span>0</span><span>+2</span><span>+4</span>
          </div>
          {isPadSource ? (
            <div className="random-slot-voices">
              <span className="random-slot-voices-label">Voices</span>
              <div className="voice-mask-row">
                {PAD_VOICE_NUMBERS.map((voice) => {
                  const assignment = padVoiceAssignment(settings.VoiceMask, settings.Pad2VoiceAssign, voice);
                  return (
                    <button
                      key={voice}
                      type="button"
                      className={`voice-mask-btn ${assignment !== 'off' ? 'active' : ''}`}
                      style={padVoiceButtonStyle(voice, assignment)}
                      title={`Voice ${voice}: ${padVoiceAssignmentLabel(assignment)}`}
                      onClick={() => {
                        const next = cyclePadVoiceAssignment(settings.VoiceMask, settings.Pad2VoiceAssign, voice);
                        onParamChange(key('VoiceMask'), next.voiceMask);
                        onParamChange(key('Pad2VoiceAssign'), next.pad2Assign);
                      }}
                    >
                      {voice}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Slider
            label="Note Density"
            value={numeric('Density')}
            paramKey={key('Density')}
            unit="/phrase"
            onChange={onParamChange}
            {...sliderProps(key('Density'))}
          />
          <Slider
            label="Octave Offset"
            value={numeric('NotesOctave')}
            paramKey={key('NotesOctave')}
            format={formatOctaveOffset}
            unit=" oct"
            onChange={onParamChange}
            {...sliderProps(key('NotesOctave'))}
          />
          <div className="synth-octave-scale" aria-label="Octave offset range from -4 to +4 octaves">
            <span>-4</span><span>-2</span><span>0</span><span>+2</span><span>+4</span>
          </div>
          <Slider
            label="Octave Range"
            value={numeric('OctaveRange')}
            paramKey={key('OctaveRange')}
            unit=" oct"
            onChange={onParamChange}
            {...sliderProps(key('OctaveRange'))}
          />
          <div className="synth-octave-scale synth-octave-scale-span" aria-label="Random note span from 1 to 4 octaves">
            <span>1</span><span>2</span><span>3</span><span>4 oct</span>
          </div>
          <div className="random-slot-row">
            <Select
              label="Clock"
              value={settings.PhraseSource}
              options={CLOCK_OPTIONS.map((option) => ({ ...option }))}
              onChange={(value: string) => setSelect('PhraseSource', value)}
            />
            <Select
              label="Tension"
              value={settings.TensionMode}
              options={TENSION_OPTIONS.map((option) => ({ ...option }))}
              onChange={(value: string) => setSelect('TensionMode', value)}
            />
          </div>
          {settings.TensionMode !== 'bypass' ? (
            <Slider
              label={settings.TensionMode === 'locked' ? 'Tension (locked)' : 'Tension offset'}
              value={numeric('TensionValue')}
              paramKey={key('TensionValue')}
              onChange={onParamChange}
              {...sliderProps(key('TensionValue'))}
            />
          ) : null}
        </>
      )}
    </div>
  );
};
