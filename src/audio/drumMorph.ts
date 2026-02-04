/**
 * Drum Voice Morph System
 * 
 * Interpolates between two presets (A and B) for each drum voice.
 * Supports automatic morphing with different modes.
 */

import { SliderState } from '../ui/state';
import { 
  DrumVoiceType, 
  DrumVoicePreset, 
  getPreset 
} from './drumPresets';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MorphMode = 'linear' | 'pingpong' | 'random';

export interface MorphState {
  presetA: DrumVoicePreset | null;
  presetB: DrumVoicePreset | null;
  morph: number;       // 0-1, where 0 = A, 1 = B
  autoMorph: boolean;
  speed: number;       // cycles per minute
  mode: MorphMode;
  // Internal state for auto-morph
  direction: number;   // 1 or -1 for pingpong
  phase: number;       // 0-1 for linear/pingpong cycle position
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERPOLATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Linear interpolation between two numbers
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Exponential interpolation for frequency/time values
 * Better for parameters that are perceived logarithmically
 */
export function expLerp(a: number, b: number, t: number): number {
  if (a <= 0 || b <= 0) return lerp(a, b, t);
  return a * Math.pow(b / a, t);
}

/**
 * Smoothstep interpolation for more pleasing transitions
 */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Determine if a parameter should use exponential interpolation
 */
function shouldUseExpLerp(paramName: string): boolean {
  const expParams = [
    'Freq', 'Decay', 'Attack', 'Filter', 'Rate', 'Speed'
  ];
  return expParams.some(exp => paramName.includes(exp));
}

/**
 * Interpolate between two parameter values
 */
export function interpolateParam(
  key: string,
  valueA: number | string,
  valueB: number | string,
  t: number
): number | string {
  // String values (like mode) - use A until t > 0.5, then B
  if (typeof valueA === 'string' || typeof valueB === 'string') {
    return t < 0.5 ? valueA : valueB;
  }
  
  // Numeric values - interpolate
  const smoothT = smoothstep(t);
  
  if (shouldUseExpLerp(key)) {
    return expLerp(valueA, valueB, smoothT);
  }
  
  return lerp(valueA, valueB, smoothT);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET INTERPOLATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all unique parameter keys from two presets
 */
function getParamKeys(presetA: DrumVoicePreset, presetB: DrumVoicePreset): string[] {
  const keys = new Set<string>();
  Object.keys(presetA.params).forEach(k => keys.add(k));
  Object.keys(presetB.params).forEach(k => keys.add(k));
  return Array.from(keys);
}

/**
 * Interpolate between two presets and return the parameter values
 */
export function interpolatePresets(
  presetA: DrumVoicePreset,
  presetB: DrumVoicePreset,
  morph: number
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  const keys = getParamKeys(presetA, presetB);
  
  for (const key of keys) {
    const valueA = presetA.params[key];
    const valueB = presetB.params[key];
    
    // If one preset doesn't have the param, use the other's value
    if (valueA === undefined) {
      result[key] = valueB;
    } else if (valueB === undefined) {
      result[key] = valueA;
    } else {
      result[key] = interpolateParam(key, valueA, valueB, morph);
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-MORPH SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update auto-morph phase based on elapsed time
 * Returns new phase and morph value
 */
export function updateAutoMorph(
  phase: number,
  direction: number,
  mode: MorphMode,
  speed: number,
  deltaTime: number
): { phase: number; direction: number; morph: number } {
  // Speed is in cycles per minute
  const cyclesPerSecond = speed / 60;
  const phaseDelta = cyclesPerSecond * deltaTime;
  
  let newPhase = phase;
  let newDirection = direction;
  let morph = 0;
  
  switch (mode) {
    case 'linear':
      // Continuous 0 → 1 → 0 → 1...
      newPhase = (phase + phaseDelta) % 1;
      morph = newPhase;
      break;
      
    case 'pingpong':
      // 0 → 1 → 0 → 1 with smooth reversals
      newPhase = phase + phaseDelta * direction;
      if (newPhase >= 1) {
        newPhase = 1 - (newPhase - 1);
        newDirection = -1;
      } else if (newPhase <= 0) {
        newPhase = -newPhase;
        newDirection = 1;
      }
      morph = newPhase;
      break;
      
    case 'random':
      // Random jumps at interval
      newPhase = phase + phaseDelta;
      if (newPhase >= 1) {
        newPhase = 0;
        morph = Math.random();
      } else {
        // Keep previous morph value until next jump
        morph = phase; // This will be the stored morph value
      }
      break;
  }
  
  return { phase: newPhase, direction: newDirection, morph };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const VOICE_MORPH_KEYS: Record<DrumVoiceType, {
  presetA: keyof SliderState;
  presetB: keyof SliderState;
  morph: keyof SliderState;
  auto: keyof SliderState;
  speed: keyof SliderState;
  mode: keyof SliderState;
}> = {
  sub: {
    presetA: 'drumSubPresetA',
    presetB: 'drumSubPresetB',
    morph: 'drumSubMorph',
    auto: 'drumSubMorphAuto',
    speed: 'drumSubMorphSpeed',
    mode: 'drumSubMorphMode',
  },
  kick: {
    presetA: 'drumKickPresetA',
    presetB: 'drumKickPresetB',
    morph: 'drumKickMorph',
    auto: 'drumKickMorphAuto',
    speed: 'drumKickMorphSpeed',
    mode: 'drumKickMorphMode',
  },
  click: {
    presetA: 'drumClickPresetA',
    presetB: 'drumClickPresetB',
    morph: 'drumClickMorph',
    auto: 'drumClickMorphAuto',
    speed: 'drumClickMorphSpeed',
    mode: 'drumClickMorphMode',
  },
  beepHi: {
    presetA: 'drumBeepHiPresetA',
    presetB: 'drumBeepHiPresetB',
    morph: 'drumBeepHiMorph',
    auto: 'drumBeepHiMorphAuto',
    speed: 'drumBeepHiMorphSpeed',
    mode: 'drumBeepHiMorphMode',
  },
  beepLo: {
    presetA: 'drumBeepLoPresetA',
    presetB: 'drumBeepLoPresetB',
    morph: 'drumBeepLoMorph',
    auto: 'drumBeepLoMorphAuto',
    speed: 'drumBeepLoMorphSpeed',
    mode: 'drumBeepLoMorphMode',
  },
  noise: {
    presetA: 'drumNoisePresetA',
    presetB: 'drumNoisePresetB',
    morph: 'drumNoiseMorph',
    auto: 'drumNoiseMorphAuto',
    speed: 'drumNoiseMorphSpeed',
    mode: 'drumNoiseMorphMode',
  },
};

/**
 * Get the current morph state from SliderState for a voice
 */
export function getMorphStateFromSliders(
  state: SliderState,
  voice: DrumVoiceType
): MorphState {
  const keys = VOICE_MORPH_KEYS[voice];
  
  const presetAName = state[keys.presetA] as string;
  const presetBName = state[keys.presetB] as string;
  
  return {
    presetA: getPreset(voice, presetAName) || null,
    presetB: getPreset(voice, presetBName) || null,
    morph: state[keys.morph] as number,
    autoMorph: state[keys.auto] as boolean,
    speed: state[keys.speed] as number,
    mode: state[keys.mode] as MorphMode,
    direction: 1,
    phase: 0,
  };
}

/**
 * Get morphed parameters for a voice, ready to apply to synthesis
 * Returns interpolated values between preset A and B based on morph position
 * @param morphOverride - Optional morph value to use instead of state value (for per-trigger randomization)
 */
export function getMorphedParams(
  state: SliderState,
  voice: DrumVoiceType,
  morphOverride?: number
): Record<string, number | string> {
  const morphState = getMorphStateFromSliders(state, voice);
  
  // If no presets loaded, return empty
  if (!morphState.presetA || !morphState.presetB) {
    // Return current slider values as fallback
    return {};
  }
  
  // Use override morph value if provided, otherwise use state value
  const morphValue = morphOverride !== undefined ? morphOverride : morphState.morph;
  
  return interpolatePresets(
    morphState.presetA,
    morphState.presetB,
    morphValue
  );
}

/**
 * Apply morphed preset values back to state object
 * This creates a merged state with interpolated drum params
 */
export function applyMorphToState(
  state: SliderState,
  voice: DrumVoiceType
): Partial<SliderState> {
  const morphedParams = getMorphedParams(state, voice);
  const result: Partial<SliderState> = {};
  
  for (const [key, value] of Object.entries(morphedParams)) {
    (result as Record<string, unknown>)[key] = value;
  }
  
  return result;
}

/**
 * Get all morphed drum parameters for all voices
 */
export function getAllMorphedDrumParams(state: SliderState): Partial<SliderState> {
  const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
  let result: Partial<SliderState> = {};
  
  for (const voice of voices) {
    const morphedParams = applyMorphToState(state, voice);
    result = { ...result, ...morphedParams };
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRUM MORPH MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages auto-morph state for all voices
 * Call update() on each animation frame to progress auto-morphs
 */
export class DrumMorphManager {
  private voiceStates: Map<DrumVoiceType, {
    phase: number;
    direction: number;
    lastMorph: number;
  }> = new Map();
  
  private lastUpdateTime: number = 0;
  
  constructor() {
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
    for (const voice of voices) {
      this.voiceStates.set(voice, {
        phase: 0,
        direction: 1,
        lastMorph: 0,
      });
    }
  }
  
  /**
   * Update auto-morph for all voices
   * Returns new morph values for voices with auto-morph enabled
   */
  update(
    state: SliderState,
    currentTime: number
  ): Map<DrumVoiceType, number> {
    const deltaTime = this.lastUpdateTime === 0 
      ? 0 
      : (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;
    
    const newMorphValues = new Map<DrumVoiceType, number>();
    
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
    
    for (const voice of voices) {
      const keys = VOICE_MORPH_KEYS[voice];
      const autoMorph = state[keys.auto] as boolean;
      
      if (!autoMorph) continue;
      
      const voiceState = this.voiceStates.get(voice)!;
      const speed = state[keys.speed] as number;
      const mode = state[keys.mode] as MorphMode;
      
      const result = updateAutoMorph(
        voiceState.phase,
        voiceState.direction,
        mode,
        speed,
        deltaTime
      );
      
      voiceState.phase = result.phase;
      voiceState.direction = result.direction;
      
      // For random mode, only update on phase reset
      if (mode === 'random') {
        if (result.phase < voiceState.phase) {
          voiceState.lastMorph = result.morph;
        }
        newMorphValues.set(voice, voiceState.lastMorph);
      } else {
        newMorphValues.set(voice, result.morph);
      }
    }
    
    return newMorphValues;
  }
  
  /**
   * Reset phase for a specific voice
   */
  resetVoice(voice: DrumVoiceType): void {
    const voiceState = this.voiceStates.get(voice);
    if (voiceState) {
      voiceState.phase = 0;
      voiceState.direction = 1;
      voiceState.lastMorph = 0;
    }
  }
  
  /**
   * Reset all voices
   */
  reset(): void {
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
    for (const voice of voices) {
      this.resetVoice(voice);
    }
    this.lastUpdateTime = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

export const drumMorphManager = new DrumMorphManager();
