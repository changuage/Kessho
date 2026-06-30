/**
 * Snowflake V2 — Macro Computation
 *
 * 6 macros per arm:
 *   Ornament: reverbLevel × direction(diffusion vs decay)
 *   Fractal:  granularLevel × direction(granularV1Mode)
 *   Density:  max(delayASend, delayBSend) × direction(which delay wins)
 *   Structure: engine level mapped through a near-log curve from -1 to +1
 *   Aura: per-engine reverb send, 0 to +1
 *   Erosion: per-engine degrade send, 0 to +1
 *
 * All macros except Structure are 0 when their driving value is 0.
 * Structure is -1 when engine level is 0.
 */

import type { SliderState } from '../state';
import type { EngineGroupDef } from './engineGroups';

// Chosen so a normalized engine level of 0.1 maps to 0.5 before the -1..+1 shift.
const STRUCTURE_LOG_CURVE = 80;

export interface ArmMacros {
  /** -1 (angular) to +1 (round). Magnitude = reverbLevel. */
  ornament: number;
  /** -1 (clean) to +1 (granular). Magnitude = granularLevel. */
  fractal: number;
  /** -1 (delayB dominant) to +1 (delayA dominant). Magnitude = max delay send. */
  density: number;
  /** -1 (engine off) to +1 (engine at max). */
  structure: number;
  /** 0 (dry) to +1 (full per-engine reverb send). */
  aura: number;
  /** 0 (clean) to +1 (full per-engine degrade send). */
  erosion: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nearLogLevel(value: number): number {
  const clamped = clamp01(value);
  return Math.log1p(clamped * STRUCTURE_LOG_CURVE) / Math.log1p(STRUCTURE_LOG_CURVE);
}

/**
 * Compute the 6 macros for a single arm from audio state.
 * All values are per-engine from the routing matrix.
 */
export function computeArmMacros(
  engine: EngineGroupDef,
  state: SliderState,
): ArmMacros {
  // --- Ornament: global reverb level × sign(diffusion - decay) ---
  const reverbLevel = state.reverbLevel as number;
  const reverbDecay = state.reverbDecay as number;
  const reverbDiffusion = state.reverbDiffusion as number;
  let ornament = 0;
  if (reverbLevel > 0) {
    const direction = reverbDiffusion >= reverbDecay ? 1 : -1;
    ornament = reverbLevel * direction;
  }

  // --- Fractal: engine's granular send × sign(granularV1Mode) ---
  const granularSendKey = engine.sends.granular;
  const granularSend = granularSendKey ? (state[granularSendKey] as number) : 0;
  const granularV1Mode = state.granularV1Mode as string;
  let fractal = 0;
  if (granularSend > 0) {
    const direction = granularV1Mode === 'granular' ? 1 : -1;
    fractal = granularSend * direction;
  }

  // --- Density: max(delayASend, delayBSend) × sign(which wins) ---
  const delayAKey = engine.sends.delayA;
  const delayBKey = engine.sends.delayB;
  const delayASend = delayAKey ? (state[delayAKey] as number) : 0;
  const delayBSend = delayBKey ? (state[delayBKey] as number) : 0;
  let density = 0;
  const maxDelay = Math.max(delayASend, delayBSend);
  if (maxDelay > 0) {
    const direction = delayASend >= delayBSend ? 1 : -1;
    density = maxDelay * direction;
  }

  // --- Aura: engine's reverb send → frost/bloom styling ---
  const reverbSendKey = engine.sends.reverb;
  const aura = reverbSendKey ? clamp01(state[reverbSendKey] as number) : 0;

  // --- Erosion: engine's degrade send → noisy/corroded styling ---
  const degradeSendKey = engine.sends.degrade;
  const erosion = degradeSendKey ? clamp01(state[degradeSendKey] as number) : 0;

  // --- Structure: engine level → near-log -1 to +1 ---
  const levelValue = state[engine.levelKey] as number;
  const range = engine.levelMax - engine.levelMin;
  const normalizedLevel = range > 0
    ? clamp01((levelValue - engine.levelMin) / range)
    : 0;
  // Map 0→-1, 1→+1, with lower levels gaining structure sooner.
  const structure = nearLogLevel(normalizedLevel) * 2 - 1;

  return { ornament, fractal, density, structure, aura, erosion };
}
