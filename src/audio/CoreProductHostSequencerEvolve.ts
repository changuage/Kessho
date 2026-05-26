import { createCoreProductSequencerDiceEvent, type CoreProductEvent } from './coreProductEvents';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { diceFlagsForEvolveConfig, type NormalizedSequencerEvolveConfig } from './CoreProductHostSequencerEvolveConfig';
import { clampSequencerSwing, evolveCoreProductSequencerSwing } from './CoreProductHostSequencerSwing';
import { evolveCoreProductSequencerSubLaneConfigs, type CoreProductSubLaneEvolveResult } from './CoreProductHostSequencerSubLaneEvolve';
import type { SequencerKind, SequencerStepValueConfig, SequencerStepValueOverride } from './CoreProductHostSequencerAdapter';
type EvolveName = 'synthEuclidEvolve' | 'drumEuclidEvolve';
type LaneCycleState = { previousStep: number; cycle: number }; type SynthNoteRangeEvolveResult = { handled: boolean; changed: boolean };

type EvolveTickInput = {
  telemetry: CoreProductTelemetrySnapshot;
  synthConfigs?: unknown;
  drumConfigs?: unknown;
  post: (event: CoreProductEvent) => void;
  publish: (name: EvolveName, laneIndex: number) => void;
  getSwing?: (sequencer: 'synth' | 'drum', laneIndex: number) => number;
  setSwing?: (sequencer: 'synth' | 'drum', laneIndex: number, swing: number) => void;
  getEnabledSubLanes?: (sequencer: SequencerKind, laneIndex: number) => string[] | undefined;
  getSubLaneConfigs?: (sequencer: SequencerKind, laneIndex: number) => SequencerStepValueConfig[];
  getStepValueOverrides?: (sequencer: SequencerKind, laneIndex: number) => SequencerStepValueOverride[];
  setSubLaneConfigs?: (sequencer: SequencerKind, laneIndex: number, result: CoreProductSubLaneEvolveResult) => void;
  evolveSynthNoteRange?: (laneIndex: number, config: NormalizedSequencerEvolveConfig, seed: number, bar: number) => SynthNoteRangeEvolveResult;
};

function evolveSeed(kind: EvolveName, laneIndex: number, bar: number): number {
  const kindSeed = kind === 'synthEuclidEvolve' ? 0x51f15ca9 : 0x2c1b3c6d;
  return (Math.imul(bar + 1, 0x9e3779b1) ^ Math.imul(laneIndex + 1, 0x85ebca6b) ^ kindSeed) >>> 0;
}

function diceWriteOffset(config: NormalizedSequencerEvolveConfig): number { return config.writeOffset === 'auto' ? -1 : typeof config.writeOffset === 'number' && config.writeOffset > 0 ? Math.round(config.writeOffset) : 0; }
function configAllowsSubLane(config: NormalizedSequencerEvolveConfig, lane: string): boolean { return !config.enabledSubLanes || config.enabledSubLanes.includes(lane); }

function tickConfigs(name: EvolveName, configs: unknown, lastBars: number[], cycles: LaneCycleState[], input: EvolveTickInput): void {
  const lanes = (Array.isArray(configs) ? configs : []).slice(0, 4) as NormalizedSequencerEvolveConfig[];
  const currentSteps = name === 'synthEuclidEvolve' ? input.telemetry.synthSequencerCurrentSteps : input.telemetry.drumSequencerCurrentSteps;
  for (let laneIndex = 0; laneIndex < 4; laneIndex += 1) {
    const currentStep = currentSteps?.[laneIndex];
    const cycle = cycles[laneIndex] ?? (cycles[laneIndex] = { previousStep: -1, cycle: 0 });
    if (typeof currentStep !== 'number' || !Number.isFinite(currentStep)) { cycle.previousStep = -1; continue; }
    const step = Math.max(0, Math.floor(currentStep));
    const wrapped = cycle.previousStep >= 0 && step < cycle.previousStep;
    cycle.previousStep = step;
    if (!wrapped) continue;
    const bar = ++cycle.cycle;
    const config = lanes[laneIndex];
    if (!config?.enabled || config.evolution <= 0) continue;
    const sequencer = name === 'synthEuclidEvolve' ? 'synth' : 'drum';
    const enabledSubLanes = input.getEnabledSubLanes?.(sequencer, laneIndex);
    const effectiveConfig = enabledSubLanes ? { ...config, enabledSubLanes: config.enabledSubLanes ? config.enabledSubLanes.filter((lane) => enabledSubLanes.includes(lane)) : enabledSubLanes } : config;
    const canHostMutate = (effectiveConfig.methods?.swingDrift === true && !!input.getSwing && !!input.setSwing) ||
      ((effectiveConfig.methods?.subLaneLengthDrift === true || effectiveConfig.methods?.subLaneDirectionFlip === true) && !!input.getSubLaneConfigs && !!input.setSubLaneConfigs) ||
      (sequencer === 'synth' && effectiveConfig.methods?.pitchWalk === true && configAllowsSubLane(effectiveConfig, 'pitch') && !!input.evolveSynthNoteRange);
    const everyBars = Math.max(1, Math.round(config.everyBars || 4));
    if (bar - lastBars[laneIndex]! < everyBars) continue;
    lastBars[laneIndex] = bar;
    const seed = evolveSeed(name, laneIndex, bar);
    let hostMutated = false;
    const noteRangeResult = sequencer === 'synth' && effectiveConfig.methods?.pitchWalk && input.evolveSynthNoteRange ? input.evolveSynthNoteRange(laneIndex, effectiveConfig, seed, bar) : null;
    if (noteRangeResult?.changed) hostMutated = true;
    const diceConfig = noteRangeResult?.handled ? { ...effectiveConfig, methods: { ...effectiveConfig.methods, pitchWalk: false } } : effectiveConfig;
    const flags = diceFlagsForEvolveConfig(diceConfig);
    if (flags === 0 && !canHostMutate && !hostMutated) continue;
    if (config.methods?.swingDrift && input.getSwing && input.setSwing) {
      const currentSwing = clampSequencerSwing(input.getSwing(sequencer, laneIndex));
      const nextSwing = evolveCoreProductSequencerSwing(currentSwing, config.evolution, seed);
      if (Math.abs(nextSwing - currentSwing) > 0.000001) {
        input.setSwing(sequencer, laneIndex, nextSwing);
        hostMutated = true;
      }
    }
    if (input.getSubLaneConfigs && input.setSubLaneConfigs) {
      const subLaneResult = evolveCoreProductSequencerSubLaneConfigs(sequencer, input.getSubLaneConfigs(sequencer, laneIndex), input.getStepValueOverrides?.(sequencer, laneIndex) ?? [], effectiveConfig, seed);
      if (subLaneResult) {
        input.setSubLaneConfigs(sequencer, laneIndex, subLaneResult);
        hostMutated = true;
      }
    }
    if (flags !== 0) input.post(createCoreProductSequencerDiceEvent(sequencer, laneIndex, config.evolution, seed, flags, diceWriteOffset(config), bar));
    if (hostMutated || flags !== 0 || canHostMutate) input.publish(name, laneIndex);
  }
}

export function createCoreProductSequencerEvolveClock() {
  const synthLastBars = [0, 0, 0, 0];
  const drumLastBars = [0, 0, 0, 0];
  const synthCycles = Array.from({ length: 4 }, () => ({ previousStep: -1, cycle: 0 }));
  const drumCycles = Array.from({ length: 4 }, () => ({ previousStep: -1, cycle: 0 }));
  const reset = () => { synthLastBars.fill(0); drumLastBars.fill(0); for (const cycle of [...synthCycles, ...drumCycles]) { cycle.previousStep = -1; cycle.cycle = 0; } };
  return {
    reset,
    tick(input: EvolveTickInput): void {
      if (!input.telemetry.transportRunning) { reset(); return; }
      tickConfigs('synthEuclidEvolve', input.synthConfigs, synthLastBars, synthCycles, input);
      tickConfigs('drumEuclidEvolve', input.drumConfigs, drumLastBars, drumCycles, input);
    },
  };
}
