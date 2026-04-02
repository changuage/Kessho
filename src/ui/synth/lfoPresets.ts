/**
 * LFO Presets — named combinations of dest, wave, rate, depth
 * Each preset sets all four LFO parameters at once.
 */

export interface LfoPreset {
  id: string;
  name: string;
  /** Category for grouping in the dropdown */
  category: 'filter' | 'tremolo' | 'pitch' | 'timbral';
  dest: 'filterCutoff' | 'filterBCutoff' | 'amplitude' | 'pitch' | 'oscBLevel';
  wave: 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sampleHold' | 'randomSmooth' | 'randomWalk';
  rate: number;   // Hz  (0.05–20)
  depth: number;  // 0–1
  /** Short description shown as tooltip/subtitle */
  description: string;
}

export const LFO_PRESETS: LfoPreset[] = [
  // ─── Filter ───────────────────────────────────────
  {
    id: 'go-with-the-flow',
    name: 'Go with the Flow',
    category: 'filter',
    dest: 'filterCutoff',
    wave: 'randomWalk',
    rate: 0.09,
    depth: 1.0,
    description: 'Slow random filter drift — organic, evolving pads',
  },
  {
    id: 'slow-filter-sweep',
    name: 'Slow Filter Sweep',
    category: 'filter',
    dest: 'filterCutoff',
    wave: 'sine',
    rate: 0.15,
    depth: 0.7,
    description: 'Gentle sine sweep across the filter range',
  },
  {
    id: 'auto-wah',
    name: 'Auto-Wah',
    category: 'filter',
    dest: 'filterCutoff',
    wave: 'triangle',
    rate: 2.0,
    depth: 0.6,
    description: 'Medium-speed triangle wah effect',
  },
  {
    id: 'sample-hold-filter',
    name: 'Glitch Filter',
    category: 'filter',
    dest: 'filterCutoff',
    wave: 'sampleHold',
    rate: 4.0,
    depth: 0.8,
    description: 'Stepped random filter — retro/glitchy',
  },
  {
    id: 'filter-pulse',
    name: 'Filter Pulse',
    category: 'filter',
    dest: 'filterCutoff',
    wave: 'square',
    rate: 1.0,
    depth: 0.5,
    description: 'Square wave filter gate — rhythmic on/off brightness',
  },

  // ─── Tremolo ──────────────────────────────────────
  {
    id: 'gentle-tremolo',
    name: 'Gentle Tremolo',
    category: 'tremolo',
    dest: 'amplitude',
    wave: 'sine',
    rate: 3.0,
    depth: 0.3,
    description: 'Subtle sine volume swell',
  },
  {
    id: 'vintage-tremolo',
    name: 'Vintage Tremolo',
    category: 'tremolo',
    dest: 'amplitude',
    wave: 'triangle',
    rate: 5.0,
    depth: 0.5,
    description: 'Classic triangle tremolo — guitar amp style',
  },
  {
    id: 'hard-gate-trem',
    name: 'Hard Gate',
    category: 'tremolo',
    dest: 'amplitude',
    wave: 'square',
    rate: 4.0,
    depth: 0.8,
    description: 'Square tremolo — choppy sidechain-like pump',
  },
  {
    id: 'random-ducking',
    name: 'Random Ducking',
    category: 'tremolo',
    dest: 'amplitude',
    wave: 'randomSmooth',
    rate: 2.0,
    depth: 0.4,
    description: 'Smooth random volume — breathing, organic feel',
  },

  // ─── Pitch ────────────────────────────────────────
  {
    id: 'subtle-vibrato',
    name: 'Subtle Vibrato',
    category: 'pitch',
    dest: 'pitch',
    wave: 'sine',
    rate: 5.0,
    depth: 0.08,
    description: 'Classic vibrato — ±16 cents, natural and vocal',
  },
  {
    id: 'slow-pitch-drift',
    name: 'Tape Drift',
    category: 'pitch',
    dest: 'pitch',
    wave: 'randomWalk',
    rate: 0.1,
    depth: 0.05,
    description: 'Slow random pitch wander — worn tape / VHS feel',
  },
  {
    id: 'wide-vibrato',
    name: 'Wide Vibrato',
    category: 'pitch',
    dest: 'pitch',
    wave: 'sine',
    rate: 5.5,
    depth: 0.25,
    description: 'Expressive vibrato — ±50 cents, strings/voice style',
  },
  {
    id: 'fast-pitch-wobble',
    name: 'Fast Wobble',
    category: 'pitch',
    dest: 'pitch',
    wave: 'triangle',
    rate: 8.0,
    depth: 0.15,
    description: 'Fast pitch wobble — retro synth / lo-fi character',
  },
  {
    id: 'slow-pitch-wobble',
    name: 'Slow Wobble',
    category: 'pitch',
    dest: 'pitch',
    wave: 'triangle',
    rate: 0.5,
    depth: 0.12,
    description: 'Slow pitch undulation — dreamy, underwater feel',
  },
  {
    id: 'tape-warble',
    name: 'Tape Warble',
    category: 'pitch',
    dest: 'pitch',
    wave: 'randomSmooth',
    rate: 3.0,
    depth: 0.06,
    description: 'Irregular pitch flutter — cassette tape emulation',
  },

  // ─── Timbral ──────────────────────────────────────
  {
    id: 'osc-b-pulse',
    name: 'Osc B Pulse',
    category: 'timbral',
    dest: 'oscBLevel',
    wave: 'sine',
    rate: 0.3,
    depth: 0.6,
    description: 'Slow Osc B fade in/out — evolving timbre',
  },
  {
    id: 'timbral-shimmer',
    name: 'Timbral Shimmer',
    category: 'timbral',
    dest: 'oscBLevel',
    wave: 'triangle',
    rate: 2.5,
    depth: 0.4,
    description: 'Medium Osc B modulation — shimmering overtones',
  },
  {
    id: 'filter-b-sweep',
    name: 'Filter B Sweep',
    category: 'timbral',
    dest: 'filterBCutoff',
    wave: 'sine',
    rate: 0.2,
    depth: 0.7,
    description: 'Slow Filter B sweep — dual-filter movement',
  },
  {
    id: 'filter-b-random',
    name: 'Filter B Random',
    category: 'timbral',
    dest: 'filterBCutoff',
    wave: 'randomSmooth',
    rate: 1.5,
    depth: 0.5,
    description: 'Random Filter B movement — complex timbral shifts',
  },
];

/** Category labels for display */
export const LFO_PRESET_CATEGORIES: Record<string, string> = {
  filter: 'Filter',
  tremolo: 'Tremolo',
  pitch: 'Pitch',
  timbral: 'Timbral',
};
