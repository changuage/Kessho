import type { DrumVoiceType } from './drumSynth';

export type DrumParamType = 'range' | 'select';

export interface DrumParamDef {
  key: string;
  label: string;
  type: DrumParamType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  def: number | string;
  curve?: 'attack';
  options?: string[];
}

export interface DrumVoiceConfig {
  label: string;
  icon: string;
  color: string;
  sections: Record<string, DrumParamDef[]>;
}

export const DRUM_VOICES: Record<DrumVoiceType, DrumVoiceConfig> = {
  sub: {
    label: 'Sub',
    icon: '◉\uFE0E',
    color: '#ef4444',
    sections: {
      Tone: [
        { key: 'drumSubFreq', label: 'Frequency', type: 'range', min: 20, max: 100, step: 1, unit: 'Hz', def: 50 },
        { key: 'drumSubTone', label: 'Tone', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0.1 },
        { key: 'drumSubShape', label: 'Shape', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumSubDrive', label: 'Drive', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumSubSub', label: 'Sub Oct', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
      ],
      Envelope: [
        { key: 'drumSubAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 0, curve: 'attack' },
        { key: 'drumSubDecay', label: 'Decay', type: 'range', min: 10, max: 2800, step: 1, unit: 'ms', def: 150 },
        { key: 'drumSubLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.8 },
      ],
      'Pitch Env': [
        { key: 'drumSubPitchEnv', label: 'Amount', type: 'range', min: 0, max: 48, step: 1, unit: 'st', def: 0 },
        { key: 'drumSubPitchDecay', label: 'Decay', type: 'range', min: 1, max: 500, step: 1, unit: 'ms', def: 50 },
      ],
      Variation: [
        { key: 'drumSubVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumSubDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
  kick: {
    label: 'Kick',
    icon: '⬤\uFE0E',
    color: '#f97316',
    sections: {
      Tone: [
        { key: 'drumKickFreq', label: 'Frequency', type: 'range', min: 30, max: 120, step: 1, unit: 'Hz', def: 55 },
        { key: 'drumKickClick', label: 'Click', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.3 },
        { key: 'drumKickBody', label: 'Body', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumKickPunch', label: 'Punch', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumKickTail', label: 'Tail', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumKickTone', label: 'Tone', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0 },
      ],
      Envelope: [
        { key: 'drumKickAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 0, curve: 'attack' },
        { key: 'drumKickDecay', label: 'Decay', type: 'range', min: 20, max: 2800, step: 1, unit: 'ms', def: 200 },
        { key: 'drumKickLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.7 },
      ],
      'Pitch Env': [
        { key: 'drumKickPitchEnv', label: 'Amount', type: 'range', min: 0, max: 48, step: 1, unit: 'st', def: 24 },
        { key: 'drumKickPitchDecay', label: 'Decay', type: 'range', min: 1, max: 500, step: 1, unit: 'ms', def: 30 },
      ],
      Variation: [
        { key: 'drumKickVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumKickDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
  click: {
    label: 'Click',
    icon: '▫\uFE0E',
    color: '#eab308',
    sections: {
      Tone: [
        { key: 'drumClickPitch', label: 'Pitch', type: 'range', min: 500, max: 15000, step: 10, unit: 'Hz', def: 2000 },
        { key: 'drumClickFilter', label: 'Filter', type: 'range', min: 500, max: 20000, step: 10, unit: 'Hz', def: 4000 },
        { key: 'drumClickTone', label: 'Tone', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0.3 },
        { key: 'drumClickResonance', label: 'Resonance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.4 },
        { key: 'drumClickExciterColor', label: 'Exciter Color', type: 'range', min: -1, max: 1, step: 0.01, def: 0 },
      ],
      Mode: [
        { key: 'drumClickMode', label: 'Mode', type: 'select', options: ['impulse', 'noise', 'tonal', 'granular'], def: 'impulse' },
        { key: 'drumClickGrainCount', label: 'Grains', type: 'range', min: 1, max: 8, step: 1, def: 1 },
        { key: 'drumClickGrainSpread', label: 'Grain Spread', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumClickStereoWidth', label: 'Stereo Width', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
      ],
      Envelope: [
        { key: 'drumClickAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 0, curve: 'attack' },
        { key: 'drumClickDecay', label: 'Decay', type: 'range', min: 1, max: 140, step: 1, unit: 'ms', def: 5 },
        { key: 'drumClickLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.6 },
        { key: 'drumClickPitchEnv', label: 'Pitch Env', type: 'range', min: 0, max: 48, step: 1, unit: 'st', def: 0 },
      ],
      Variation: [
        { key: 'drumClickVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumClickDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
  beepHi: {
    label: 'Metal',
    icon: '⊡\uFE0E',
    color: '#22c55e',
    sections: {
      Tone: [
        { key: 'drumBeepHiFreq', label: 'Frequency', type: 'range', min: 200, max: 12000, step: 10, unit: 'Hz', def: 4000 },
        { key: 'drumBeepHiTone', label: 'Tone', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0.2 },
        { key: 'drumBeepHiInharmonic', label: 'Inharmonic', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepHiPartials', label: 'Partials', type: 'range', min: 1, max: 8, step: 1, def: 1 },
        { key: 'drumBeepHiBrightness', label: 'Brightness', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0.5 },
      ],
      'FM Synthesis': [
        { key: 'drumBeepHiModRatio', label: 'Mod Ratio', type: 'range', min: 0.5, max: 12, step: 0.5, unit: ':1', def: 2 },
        { key: 'drumBeepHiModRatioFine', label: 'Ratio Fine', type: 'range', min: -0.5, max: 0.5, step: 0.01, def: 0.01 },
        { key: 'drumBeepHiModPhase', label: 'Mod Phase', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepHiFeedback', label: 'FM Feedback', type: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { key: 'drumBeepHiModEnvDecay', label: 'Mod Env Decay', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepHiModEnvEnd', label: 'Mod Env End', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.2 },
        { key: 'drumBeepHiNoiseInMod', label: 'Noise in Mod', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepHiNoiseDecay', label: 'Noise Decay', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
      ],
      Shimmer: [
        { key: 'drumBeepHiShimmer', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepHiShimmerRate', label: 'Rate', type: 'range', min: 0.5, max: 20, step: 0.1, unit: 'Hz', def: 4 },
      ],
      Envelope: [
        { key: 'drumBeepHiAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 1, curve: 'attack' },
        { key: 'drumBeepHiDecay', label: 'Decay', type: 'range', min: 10, max: 2800, step: 1, unit: 'ms', def: 80 },
        { key: 'drumBeepHiLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
      Variation: [
        { key: 'drumBeepHiVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepHiDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
  beepLo: {
    label: 'Pluck',
    icon: '⋰\uFE0E',
    color: '#06b6d4',
    sections: {
      Tone: [
        { key: 'drumBeepLoFreq', label: 'Frequency', type: 'range', min: 40, max: 800, step: 1, unit: 'Hz', def: 400 },
        { key: 'drumBeepLoTone', label: 'Tone', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0.1 },
        { key: 'drumBeepLoBody', label: 'Body', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.3 },
      ],
      'Modal Resonator': [
        { key: 'drumBeepLoModal', label: 'Modal Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepLoModalGain', label: 'Modal Gain', type: 'range', min: 0, max: 2, step: 0.01, unit: 'x', def: 1 },
        { key: 'drumBeepLoModalQ', label: 'Modal Q', type: 'range', min: 1, max: 60, step: 1, def: 10 },
        { key: 'drumBeepLoModalInharmonic', label: 'Inharmonic', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepLoModalSpread', label: 'Spread', type: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { key: 'drumBeepLoModalCut', label: 'Cut / Tilt', type: 'range', min: -1, max: 1, step: 0.01, def: 0 },
      ],
      Pluck: [
        { key: 'drumBeepLoOscGain', label: 'Osc Gain', type: 'range', min: 0, max: 2, step: 0.01, unit: 'x', def: 1 },
        { key: 'drumBeepLoPluck', label: 'Pluck', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepLoPluckDamp', label: 'Damp', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
      'Pitch Env': [
        { key: 'drumBeepLoPitchEnv', label: 'Amount', type: 'range', min: 0, max: 24, step: 1, unit: 'st', def: 0 },
        { key: 'drumBeepLoPitchDecay', label: 'Decay', type: 'range', min: 1, max: 500, step: 1, unit: 'ms', def: 50 },
      ],
      Envelope: [
        { key: 'drumBeepLoAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 2, curve: 'attack' },
        { key: 'drumBeepLoDecay', label: 'Decay', type: 'range', min: 10, max: 2800, step: 1, unit: 'ms', def: 100 },
        { key: 'drumBeepLoLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
      Variation: [
        { key: 'drumBeepLoVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumBeepLoDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
  noise: {
    label: 'Noise',
    icon: '≋\uFE0E',
    color: '#8b5cf6',
    sections: {
      Filter: [
        { key: 'drumNoiseFilterFreq', label: 'Frequency', type: 'range', min: 100, max: 20000, step: 10, unit: 'Hz', def: 8000 },
        { key: 'drumNoiseFilterQ', label: 'Q', type: 'range', min: 0.1, max: 20, step: 0.1, def: 1 },
        { key: 'drumNoiseFilterType', label: 'Type', type: 'select', options: ['lowpass', 'bandpass', 'highpass'], def: 'highpass' },
        { key: 'drumNoiseFilterEnv', label: 'Filter Env', type: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { key: 'drumNoiseFilterEnvDecay', label: 'Env Decay', type: 'range', min: 5, max: 2000, step: 1, unit: 'ms', def: 100 },
        { key: 'drumNoiseColorLFO', label: 'Color LFO', type: 'range', min: 0, max: 20, step: 0.1, unit: 'Hz', def: 0 },
      ],
      Texture: [
        { key: 'drumNoiseDensity', label: 'Density', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 1 },
        { key: 'drumNoiseFormant', label: 'Formant', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumNoiseBreath', label: 'Breath', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
      ],
      Particle: [
        { key: 'drumNoiseParticleSize', label: 'Grain Size', type: 'range', min: 1, max: 50, step: 1, unit: 'ms', def: 5 },
        { key: 'drumNoiseParticleRandom', label: 'Random', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumNoiseParticleRandomRate', label: 'Random Rate', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
      Ratchet: [
        { key: 'drumNoiseRatchetCount', label: 'Count', type: 'range', min: 0, max: 8, step: 1, def: 0 },
        { key: 'drumNoiseRatchetTime', label: 'Time', type: 'range', min: 5, max: 100, step: 1, unit: 'ms', def: 30 },
      ],
      Envelope: [
        { key: 'drumNoiseAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 0, curve: 'attack' },
        { key: 'drumNoiseDecay', label: 'Decay', type: 'range', min: 5, max: 2800, step: 1, unit: 'ms', def: 30 },
        { key: 'drumNoiseLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.4 },
      ],
      Variation: [
        { key: 'drumNoiseVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumNoiseDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
  membrane: {
    label: 'Membrane',
    icon: '※\uFE0E',
    color: '#e11d48',
    sections: {
      Exciter: [
        { key: 'drumMembraneExciter', label: 'Type', type: 'select', options: ['impulse', 'noise', 'stick', 'brush', 'mallet'], def: 'impulse' },
        { key: 'drumMembraneExcPos', label: 'Position', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.3 },
        { key: 'drumMembraneExcBright', label: 'Brightness', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumMembraneExcDur', label: 'Duration', type: 'range', min: 0.5, max: 50, step: 0.5, unit: 'ms', def: 3 },
      ],
      Membrane: [
        { key: 'drumMembraneSize', label: 'Size', type: 'range', min: 40, max: 600, step: 1, unit: 'Hz', def: 180 },
        { key: 'drumMembraneTension', label: 'Tension', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumMembraneDamping', label: 'Damping', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.3 },
        { key: 'drumMembraneMaterial', label: 'Material', type: 'select', options: ['skin', 'metal', 'wood', 'glass', 'plastic'], def: 'skin' },
        { key: 'drumMembraneNonlin', label: 'Nonlinearity', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
      ],
      'Wire Buzz': [
        { key: 'drumMembraneWireMix', label: 'Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumMembraneWireDensity', label: 'Density', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumMembraneWireTone', label: 'Tone', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumMembraneWireDecay', label: 'Decay', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
      Tone: [
        { key: 'drumMembraneBody', label: 'Body', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
        { key: 'drumMembraneRing', label: 'Ring', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.2 },
        { key: 'drumMembraneOvertones', label: 'Overtones', type: 'range', min: 1, max: 8, step: 1, def: 4 },
      ],
      'Pitch Env': [
        { key: 'drumMembranePitchEnv', label: 'Amount', type: 'range', min: 0, max: 24, step: 1, unit: 'st', def: 3 },
        { key: 'drumMembranePitchDecay', label: 'Decay', type: 'range', min: 1, max: 500, step: 1, unit: 'ms', def: 40 },
      ],
      Envelope: [
        { key: 'drumMembraneAttack', label: 'Attack', type: 'range', min: 0, max: 5000, step: 1, unit: 'ms', def: 0, curve: 'attack' },
        { key: 'drumMembraneDecay', label: 'Decay', type: 'range', min: 10, max: 7000, step: 1, unit: 'ms', def: 250 },
        { key: 'drumMembraneLevel', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.6 },
      ],
      Variation: [
        { key: 'drumMembraneVariation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0 },
        { key: 'drumMembraneDistance', label: 'Distance', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
      ],
    },
  },
};

export const DRUM_DELAY_PARAMS: DrumParamDef[] = [
  { key: 'drumDelayNoteL', label: 'Note L', type: 'select', options: ['1/16', '1/8', '1/8d', '1/4', '1/4d', '3/8', '1/2'], def: '1/8d' },
  { key: 'drumDelayNoteR', label: 'Note R', type: 'select', options: ['1/16', '1/8', '1/8d', '1/4', '1/4d', '3/8', '1/2'], def: '1/4' },
  { key: 'drumDelayFeedback', label: 'Feedback', type: 'range', min: 0, max: 0.95, step: 0.01, unit: '%', def: 0.4 },
  { key: 'drumDelayMix', label: 'Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.3 },
  { key: 'drumDelayFilter', label: 'Filter', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', def: 0.5 },
];

export const DRUM_VOICE_ORDER: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
