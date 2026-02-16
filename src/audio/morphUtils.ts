/**
 * Shared Morph Utilities
 * 
 * Common logic for both main preset morph and drum voice morph systems.
 * Provides consistent interpolation, dual range handling, and state management.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * State at a single endpoint for a dual-capable parameter
 * Can be either single mode (just a value) or dual mode (min/max range)
 */
export interface EndpointState {
  isDualMode: boolean;
  value: number;        // Single mode value, or reference value
  range?: { min: number; max: number };  // Only present if isDualMode
}

/**
 * Dual range override that stores state at BOTH endpoints for interpolation
 */
export interface DualRangeOverride {
  endpoint0?: EndpointState;  // State at morph=0
  endpoint1?: EndpointState;  // State at morph=1
}

/**
 * Result of dual range interpolation
 */
export interface InterpolatedDualRange {
  isDualMode: boolean;
  range?: { min: number; max: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if morph position is at endpoint 0 (exact match)
 * @param position - Morph position (0-1 for drum, 0-100 for main)
 * @param scale100 - Whether position is on 0-100 scale (main morph) or 0-1 scale (drum morph)
 */
export function isAtEndpoint0(position: number, _scale100: boolean = false): boolean {
  return position === 0;
}

/**
 * Check if morph position is at endpoint 1 (exact match)
 * @param position - Morph position (0-1 for drum, 0-100 for main)
 * @param scale100 - Whether position is on 0-100 scale (main morph) or 0-1 scale (drum morph)
 */
export function isAtEndpoint1(position: number, scale100: boolean = false): boolean {
  return position === (scale100 ? 100 : 1);
}

/**
 * Check if morph position is in mid-morph (not at either endpoint)
 * @param position - Morph position (0-1 for drum, 0-100 for main)
 * @param scale100 - Whether position is on 0-100 scale (main morph) or 0-1 scale (drum morph)
 */
export function isInMidMorph(position: number, scale100: boolean = false): boolean {
  return !isAtEndpoint0(position, scale100) && !isAtEndpoint1(position, scale100);
}

/**
 * Get which endpoint we're at, or null if mid-morph
 * @param position - Morph position (0-1 for drum, 0-100 for main)
 * @param scale100 - Whether position is on 0-100 scale (main morph) or 0-1 scale (drum morph)
 */
export function getEndpoint(position: number, scale100: boolean = false): 0 | 1 | null {
  if (isAtEndpoint0(position, scale100)) return 0;
  if (isAtEndpoint1(position, scale100)) return 1;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DUAL RANGE INTERPOLATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interpolate dual range between two endpoint states
 * 
 * Mimics lerpPresets behavior:
 * - Dual A → Dual B: morph min→min, max→max
 * - Dual A → Single B: both min and max morph toward B's single value
 * - Single A → Dual B: start both at A's value, morph to B's min/max
 * - Mode only changes when range effectively collapses (min ≈ max)
 * 
 * @param state0 - State at endpoint 0 (morph=0)
 * @param state1 - State at endpoint 1 (morph=1)
 * @param morphPosition - Current morph position (0-1, normalized)
 * @returns Interpolated dual range result
 */
export function interpolateDualRange(
  state0: EndpointState,
  state1: EndpointState,
  morphPosition: number
): InterpolatedDualRange {
  let morphedMin: number;
  let morphedMax: number;
  
  if (state0.isDualMode && state1.isDualMode) {
    // Dual → Dual: morph min→min, max→max
    const range0 = state0.range!;
    const range1 = state1.range!;
    morphedMin = range0.min + (range1.min - range0.min) * morphPosition;
    morphedMax = range0.max + (range1.max - range0.max) * morphPosition;
  } else if (state0.isDualMode && !state1.isDualMode) {
    // Dual → Single: both min and max morph toward single value
    const range0 = state0.range!;
    const val1 = state1.value;
    morphedMin = range0.min + (val1 - range0.min) * morphPosition;
    morphedMax = range0.max + (val1 - range0.max) * morphPosition;
  } else if (!state0.isDualMode && state1.isDualMode) {
    // Single → Dual: start both at single value, morph to min/max
    const val0 = state0.value;
    const range1 = state1.range!;
    morphedMin = val0 + (range1.min - val0) * morphPosition;
    morphedMax = val0 + (range1.max - val0) * morphPosition;
  } else {
    // Single → Single: no dual mode involved
    return { isDualMode: false };
  }
  
  // Determine if effectively dual (min !== max)
  const isEffectivelyDual = Math.abs(morphedMax - morphedMin) > 0.001;
  
  if (isEffectivelyDual) {
    return { isDualMode: true, range: { min: morphedMin, max: morphedMax } };
  } else {
    return { isDualMode: false };
  }
}

/**
 * Interpolate all dual ranges from an override record
 * 
 * @param overrides - Record of param name to dual range override
 * @param morphPosition - Current morph position (0-1, normalized)
 * @param currentValues - Current slider values for fallback when endpoint not defined
 * @returns Record of param name to interpolated dual range
 */
export function interpolateAllDualRanges(
  overrides: Record<string, DualRangeOverride>,
  morphPosition: number,
  currentValues: Record<string, number>
): Record<string, InterpolatedDualRange> {
  const result: Record<string, InterpolatedDualRange> = {};
  
  for (const param of Object.keys(overrides)) {
    const override = overrides[param];
    const state0 = override.endpoint0;
    const state1 = override.endpoint1;
    
    // Need at least one endpoint defined
    if (!state0 && !state1) continue;
    
    // Get effective state at each endpoint (use current value if not overridden)
    const effectiveState0: EndpointState = state0 || {
      isDualMode: false,
      value: currentValues[param] ?? 0
    };
    
    const effectiveState1: EndpointState = state1 || {
      isDualMode: false,
      value: currentValues[param] ?? 0
    };
    
    result[param] = interpolateDualRange(effectiveState0, effectiveState1, morphPosition);
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// NUMERIC VALUE INTERPOLATION
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
export function shouldUseExpLerp(paramName: string): boolean {
  const expParams = ['Freq', 'Decay', 'Attack', 'Filter', 'Rate', 'Speed'];
  return expParams.some(exp => paramName.includes(exp));
}

/**
 * Interpolate a numeric parameter value with appropriate curve
 */
export function interpolateValue(
  key: string,
  valueA: number,
  valueB: number,
  t: number,
  useSmooth: boolean = true
): number {
  const effectiveT = useSmooth ? smoothstep(t) : t;
  
  if (shouldUseExpLerp(key)) {
    return expLerp(valueA, valueB, effectiveT);
  }
  
  return lerp(valueA, valueB, effectiveT);
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERRIDE STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create or update a dual range override at a specific endpoint
 * Preserves the other endpoint's state
 */
export function setEndpointState(
  existing: DualRangeOverride | undefined,
  endpoint: 0 | 1,
  state: EndpointState
): DualRangeOverride {
  const result = existing ? { ...existing } : {};
  
  if (endpoint === 0) {
    result.endpoint0 = state;
  } else {
    result.endpoint1 = state;
  }
  
  return result;
}

/**
 * Create an endpoint state for single mode
 */
export function createSingleState(value: number): EndpointState {
  return { isDualMode: false, value };
}

/**
 * Create an endpoint state for dual mode
 */
export function createDualState(value: number, min: number, max: number): EndpointState {
  return { isDualMode: true, value, range: { min, max } };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track previous values for change detection
 */
export class ChangeTracker<T> {
  private previous: Map<string, T> = new Map();
  
  /**
   * Check if a value changed and update the tracker
   * @returns true if the value changed
   */
  checkAndUpdate(key: string, value: T): boolean {
    const prev = this.previous.get(key);
    this.previous.set(key, value);
    return prev !== undefined && prev !== value;
  }
  
  /**
   * Get the previous value (before the last update)
   */
  getPrevious(key: string): T | undefined {
    return this.previous.get(key);
  }
  
  /**
   * Clear all tracked values
   */
  clear(): void {
    this.previous.clear();
  }
}
