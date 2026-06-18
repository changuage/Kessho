export const JOURNEY_COLORS = {
  bgDeep: '#100f0e',
  bgTop: '#171615',
  bgMid: '#1c1b19',
  bgLow: '#21201e',
  glass: 'rgba(22, 21, 19, 0.5)',
  glassStrong: 'rgba(18, 17, 15, 0.82)',
  cream: '#E8DCC4',
  creamMuted: 'rgba(232, 220, 196, 0.62)',
  icy: '#B8E0FF',
  icySoft: 'rgba(220, 235, 255, 0.7)',
  sage: '#7B9A6D',
  clay: '#C4724E',
  gold: '#D4A520',
  violet: '#8B5CF6',
  slate: '#5A7B8A',
  danger: '#FF4444',
  stop: '#ED5A24',
} as const;

export const TAB_HERO_COLORS = {
  global: '#5A9CFF',
  synth: '#E07A84',
  drums: '#A870E8',
  earth: '#6AAE82',
  granular: '#E8B44A',
  delay: '#5EA8A6',
  dynamics: '#CC7DB8',
  reverb: '#B0785A',
  routing: '#7ABFE8',
  visualizer: '#9CCFBD',
} as const;

export const SOURCE_COLORS = {
  global: TAB_HERO_COLORS.global,
  synth: TAB_HERO_COLORS.synth,
  pad1: TAB_HERO_COLORS.synth,
  pad2: '#B96A72',
  lead1: JOURNEY_COLORS.gold,
  lead2: '#BFA45A',
  piano: JOURNEY_COLORS.cream,
  drums: TAB_HERO_COLORS.drums,
  earth: TAB_HERO_COLORS.earth,
  waves: JOURNEY_COLORS.slate,
  water: '#6F9AB1',
  insects: JOURNEY_COLORS.sage,
  nature: '#A6B98A',
  granular: TAB_HERO_COLORS.granular,
  delayA: TAB_HERO_COLORS.delay,
  delayB: '#32C7C7',
  reverb: TAB_HERO_COLORS.reverb,
  dynamics: TAB_HERO_COLORS.dynamics,
  routing: TAB_HERO_COLORS.routing,
  visualizer: TAB_HERO_COLORS.visualizer,
} as const;

export const DYNAMICS_ENGINE_COLORS = {
  main: SOURCE_COLORS.dynamics,
  sidechain: JOURNEY_COLORS.icy,
  drift: JOURNEY_COLORS.sage,
  degrade: JOURNEY_COLORS.violet,
  erosion: JOURNEY_COLORS.violet,
  saturation: JOURNEY_COLORS.gold,
  endChain: JOURNEY_COLORS.clay,
} as const;

export const EARTH_ENGINE_COLORS = {
  waves: SOURCE_COLORS.waves,
  water: SOURCE_COLORS.water,
  waterHardDrops: '#7FA8BA',
  waterDrops: '#6F9AB1',
  waterBubbling: '#82AFA6',
  waterChannels: '#648EA5',
  waterTurbulence: SOURCE_COLORS.waves,
  waterSurf: '#8AAFB9',
  nature: SOURCE_COLORS.nature,
  birds: SOURCE_COLORS.nature,
  birds2: '#91AA7D',
  frogs: JOURNEY_COLORS.gold,
  insects: SOURCE_COLORS.insects,
  insects2: '#6E8E60',
} as const;

export const DRUM_ENGINE_COLORS = {
  sub: JOURNEY_COLORS.sage,
  kick: JOURNEY_COLORS.clay,
  click: JOURNEY_COLORS.gold,
  beepHi: JOURNEY_COLORS.icy,
  beepLo: JOURNEY_COLORS.slate,
  noise: JOURNEY_COLORS.violet,
  membrane: '#C08A68',
} as const;

export const GRANULAR_VOICE_COLORS = [
  TAB_HERO_COLORS.granular,
  JOURNEY_COLORS.sage,
  JOURNEY_COLORS.cream,
  TAB_HERO_COLORS.delay,
] as const;

export const SEQUENCER_LANE_COLORS = [
  JOURNEY_COLORS.icy,
  JOURNEY_COLORS.gold,
  JOURNEY_COLORS.sage,
  JOURNEY_COLORS.cream,
  JOURNEY_COLORS.violet,
  JOURNEY_COLORS.clay,
] as const;

export const SEQUENCER_SUB_LANE_COLORS = {
  pitch: JOURNEY_COLORS.icy,
  expression: JOURNEY_COLORS.gold,
  morph: JOURNEY_COLORS.violet,
  distance: JOURNEY_COLORS.slate,
  slice: JOURNEY_COLORS.sage,
  reverse: JOURNEY_COLORS.clay,
} as const;
