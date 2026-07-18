/**
 * Drum Voice Morph System
 * 
 * Interpolates between two presets (A and B) for each drum voice.
 * Supports automatic morphing with different modes.
 */

import type { SliderState } from '../ui/state';
import { 
  DrumVoiceType, 
  DrumVoicePreset, 
  getPreset 
} from './drumPresets';
import {
  clampMorphPosition,
  lerp,
  expLerp,
  smoothstep,
  shouldUseExpLerp,
} from './morphUtils';
import {
  getProductDrumMorphOverrides,
  type ProductDrumMorphDualRangeOverride,
  type ProductDrumMorphDualRangeOverrides,
  type ProductDrumMorphEndpointState,
  type ProductDrumMorphOverride,
  type ProductDrumMorphOverrides,
  type ProductDrumMorphOverrideState,
  type ProductInterpolatedDrumMorphDualRange,
} from '../product-control/drumMorphOverrideState';

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
// DRUM MORPH OVERRIDES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Override storage for drum morph parameters
 * Supports both endpoint overrides (at morph 0 or 1) and mid-morph overrides.
 * 
 * Structure: voice -> param -> override data
 * - value: the user's manually set value
 * - morphPosition: the morph position when override was set (0-1)
 * - isEndpoint: true if set at exactly 0 or 1, false for mid-morph
 */
export type DrumMorphOverride = ProductDrumMorphOverride;
export type DrumMorphEndpointState = ProductDrumMorphEndpointState;
export type DrumMorphDualRangeOverride = ProductDrumMorphDualRangeOverride;
export type InterpolatedDualRange = ProductInterpolatedDrumMorphDualRange;
export type DrumMorphOverrides = ProductDrumMorphOverrides;
export type DrumMorphDualRangeOverrides = ProductDrumMorphDualRangeOverrides;

// ═══════════════════════════════════════════════════════════════════════════
// INTERPOLATION HELPERS (re-exported from shared utils)
// ═══════════════════════════════════════════════════════════════════════════

// Re-export shared interpolation functions for backward compatibility
export { lerp, expLerp, smoothstep, shouldUseExpLerp } from './morphUtils';

/**
 * Interpolate between two parameter values
 */
function interpolateParam(
  key: string,
  valueA: number | string,
  valueB: number | string,
  t: number
): number | string {
  // String values (like mode) - use A until t > 0.5, then B
  if (typeof valueA === 'string' || typeof valueB === 'string') {
    return t < 0.5 ? valueA : valueB;
  }
  
  // Numeric values - interpolate using shared utility
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
 * Applies user overrides - endpoint overrides replace preset values,
 * mid-morph overrides blend toward destination
 * 
 * @param presetA - Preset A (at morph=0)
 * @param presetB - Preset B (at morph=1)
 * @param morph - Current morph position (0-1)
 * @param overrides - Optional overrides from user edits
 */
export function interpolatePresets(
  presetA: DrumVoicePreset,
  presetB: DrumVoicePreset,
  morph: number,
  overrides?: Record<string, DrumMorphOverride>
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  const keys = getParamKeys(presetA, presetB);
  const morphPosition = clampMorphPosition(morph);

  for (const key of keys) {
    let valueA: number | string | undefined = presetA.params[key];
    let valueB: number | string | undefined = presetB.params[key];
    
    // Check for override
    if (overrides && overrides[key]) {
      const override = overrides[key];
      
      if (override.isEndpoint) {
        // Endpoint override: replace the appropriate preset value.
        if (override.morphPosition === 0) {
          valueA = override.value;
        } else if (override.morphPosition === 1) {
          valueB = override.value;
        }
      } else {
        // Mid-morph override: blend from override value toward destination
        // Destination is determined by which direction we're moving
        const overridePos = override.morphPosition;
        
        if (typeof valueA === 'number' && typeof valueB === 'number') {
          // Determine destination based on morph direction from override position
          // If morph > overridePos, we're moving toward B, so blend toward B
          // If morph < overridePos, we're moving toward A, so blend toward A
          if (morphPosition >= overridePos) {
            // Moving toward B: blend from override to valueB
            const destValue = valueB;
            const totalDistance = 1 - overridePos;
            const currentDistance = morphPosition - overridePos;
            const blendFactor = totalDistance > 0 ? currentDistance / totalDistance : 1;
            result[key] = override.value + (destValue - override.value) * blendFactor;
          } else {
            // Moving toward A: blend from override to valueA
            const destValue = valueA;
            const totalDistance = overridePos;
            const currentDistance = overridePos - morphPosition;
            const blendFactor = totalDistance > 0 ? currentDistance / totalDistance : 1;
            result[key] = override.value + (destValue - override.value) * blendFactor;
          }
          continue; // Skip normal interpolation
        }
      }
    }
    
    // If one preset doesn't have the param, use the other's value
    if (valueA === undefined) {
      result[key] = valueB!;
    } else if (valueB === undefined) {
      result[key] = valueA;
    } else {
      result[key] = interpolateParam(key, valueA, valueB, morphPosition);
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

export const VOICE_MORPH_KEYS: Record<DrumVoiceType, {
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
  membrane: {
    presetA: 'drumMembranePresetA',
    presetB: 'drumMembranePresetB',
    morph: 'drumMembraneMorph',
    auto: 'drumMembraneMorphAuto',
    speed: 'drumMembraneMorphSpeed',
    mode: 'drumMembraneMorphMode',
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
 * Applies user overrides at endpoints when available
 * @param morphOverride - Optional morph value to use instead of state value (for per-trigger randomization)
 */
export function getMorphedParams(
  state: SliderState,
  voice: DrumVoiceType,
  morphOverride?: number,
  drumMorphOverrideState?: ProductDrumMorphOverrideState,
): Record<string, number | string> {
  const morphState = getMorphStateFromSliders(state, voice);
  
  // If no presets loaded, return empty
  if (!morphState.presetA || !morphState.presetB) {
    // Return current slider values as fallback
    return {};
  }
  
  // Use override morph value if provided, otherwise use state value
  const morphValue = morphOverride !== undefined ? morphOverride : morphState.morph;
  
  const overrides = drumMorphOverrideState
    ? getProductDrumMorphOverrides(drumMorphOverrideState, voice)
    : {};
  
  return interpolatePresets(
    morphState.presetA,
    morphState.presetB,
    morphValue,
    Object.keys(overrides).length > 0 ? overrides : undefined
  );
}

/**
 * Apply morphed preset values back to state object
 * This creates a merged state with interpolated drum params
 */
export function applyMorphToState(
  state: SliderState,
  voice: DrumVoiceType,
  drumMorphOverrideState?: ProductDrumMorphOverrideState,
): Partial<SliderState> {
  const morphedParams = getMorphedParams(state, voice, undefined, drumMorphOverrideState);
  const result: Partial<SliderState> = {};
  
  for (const [key, value] of Object.entries(morphedParams)) {
    (result as Record<string, unknown>)[key] = value;
  }
  
  return result;
}

/**
 * Get all morphed drum parameters for all voices
 */
export function getAllMorphedDrumParams(
  state: SliderState,
  drumMorphOverrideState?: ProductDrumMorphOverrideState,
): Partial<SliderState> {
  const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
  let result: Partial<SliderState> = {};
  
  for (const voice of voices) {
    const morphedParams = applyMorphToState(state, voice, drumMorphOverrideState);
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
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
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
    
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    
    for (const voice of voices) {
      const keys = VOICE_MORPH_KEYS[voice];
      const autoMorph = state[keys.auto] as boolean;
      
      if (!autoMorph) continue;
      
      const voiceState = this.voiceStates.get(voice)!;
      const speed = state[keys.speed] as number;
      const mode = state[keys.mode] as MorphMode;
      const previousPhase = voiceState.phase;
      
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
        if (result.phase < previousPhase) {
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
   * Synchronize a voice to an explicit morph position without advancing time.
   * Used when the UI changes the stored morph value and we want runtime motion
   * to resume smoothly from that position instead of snapping back to zero.
   */
  setVoiceState(voice: DrumVoiceType, morph: number, direction?: number): void {
    const voiceState = this.voiceStates.get(voice);
    if (!voiceState) return;
    const nextMorph = Math.max(0, Math.min(1, Number.isFinite(morph) ? morph : 0));
    voiceState.phase = nextMorph;
    voiceState.lastMorph = nextMorph;
    voiceState.direction = direction ?? (nextMorph >= 0.999 ? -1 : 1);
  }
  
  /**
   * Reset all voices
   */
  reset(): void {
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    for (const voice of voices) {
      this.resetVoice(voice);
    }
    this.lastUpdateTime = 0;
  }

  syncClock(currentTime: number): void {
    this.lastUpdateTime = currentTime;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

export const drumMorphManager = new DrumMorphManager();
