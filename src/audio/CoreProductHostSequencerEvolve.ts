import { createCoreProductSequencerDiceEvent, type CoreProductEvent } from './coreProductEvents';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { diceFlagsForEvolveConfig, type NormalizedSequencerEvolveConfig } from './CoreProductHostSequencerEvolveConfig';
import { clampSequencerSwing, evolveCoreProductSequencerSwing } from './CoreProductHostSequencerSwing';
import { evolveCoreProductSequencerSubLaneConfigs, type CoreProductSubLaneEvolveResult } from './CoreProductHostSequencerSubLaneEvolve';
import type { SequencerKind, SequencerStepValueConfig } from './CoreProductHostSequencerAdapter';

type EvolveName = 'synthEuclidEvolve' | 'drumEuclidEvolve';

type EvolveTickInput = {
  telemetry: CoreProductTelemetrySnapshot;
  synthConfigs?: unknown;
  drumConfigs?: unknown;
  post: (event: CoreProductEvent) => void;
  publish: (name: EvolveName, laneIndex: number) => void;
  getSwing?: (sequencer: 'synth' | 'drum', laneIndex: number) => number;
  setSwing?: (sequencer: 'synth' | 'drum', laneIndex: number, swing: number) => void;
  getSubLaneConfigs?: (sequencer: SequencerKind, laneIndex: number) => SequencerStepValueConfig[];
  setSubLaneConfigs?: (sequencer: SequencerKind, laneIndex: number, result: CoreProductSubLaneEvolveResult) => void;
};

function evolveSeed(kind: EvolveName, laneIndex: number, bar: number): number {
  const kindSeed = kind === 'synthEuclidEvolve' ? 0x51f15ca9 : 0x2c1b3c6d;
  return (Math.imul(bar + 1, 0x9e3779b1) ^ Math.imul(laneIndex + 1, 0x85ebca6b) ^ kindSeed) >>> 0;
}

function tickConfigs(
  name: EvolveName,
  configs: unknown,
  lastBars: number[],
  bar: number,
  input: EvolveTickInput,
): void {
  const lanes = (Array.isArray(configs) ? configs : []).slice(0, 4) as NormalizedSequencerEvolveConfig[];
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const config = lanes[laneIndex];
    if (!config?.enabled || config.evolution <= 0) continue;
    const flags = diceFlagsForEvolveConfig(config);
    const canHostMutate =
      (config.methods?.swingDrift === true && !!input.getSwing && !!input.setSwing) ||
      ((config.methods?.subLaneLengthDrift === true || config.methods?.subLaneDirectionFlip === true) && !!input.getSubLaneConfigs && !!input.setSubLaneConfigs);
    if (flags === 0 && !canHostMutate) continue;
    if (lastBars[laneIndex] == null || lastBars[laneIndex]! < 0) {
      lastBars[laneIndex] = bar;
      continue;
    }
    const everyBars = Math.max(1, Math.round(config.everyBars || 4));
    if (bar - lastBars[laneIndex]! < everyBars) continue;
    lastBars[laneIndex] = bar;
    const sequencer = name === 'synthEuclidEvolve' ? 'synth' : 'drum';
    const seed = evolveSeed(name, laneIndex, bar);
    let hostMutated = false;
    if (config.methods?.swingDrift && input.getSwing && input.setSwing) {
      const currentSwing = clampSequencerSwing(input.getSwing(sequencer, laneIndex));
      const nextSwing = evolveCoreProductSequencerSwing(currentSwing, config.evolution, seed);
      if (Math.abs(nextSwing - currentSwing) > 0.000001) {
        input.setSwing(sequencer, laneIndex, nextSwing);
        hostMutated = true;
      }
    }
    if (input.getSubLaneConfigs && input.setSubLaneConfigs) {
      const subLaneResult = evolveCoreProductSequencerSubLaneConfigs(sequencer, input.getSubLaneConfigs(sequencer, laneIndex), config, seed);
      if (subLaneResult) {
        input.setSubLaneConfigs(sequencer, laneIndex, subLaneResult);
        hostMutated = true;
      }
    }
    if (flags !== 0) {
      input.post(createCoreProductSequencerDiceEvent(sequencer, laneIndex, config.evolution, seed, flags));
    }
    if (hostMutated || flags !== 0) {
      input.publish(name, laneIndex);
    }
  }
}

export function createCoreProductSequencerEvolveClock() {
  const synthLastBars = [-1, -1, -1, -1];
  const drumLastBars = [-1, -1, -1, -1];
  const reset = () => {
    synthLastBars.fill(-1);
    drumLastBars.fill(-1);
  };
  return {
    reset,
    tick(input: EvolveTickInput): void {
      if (!input.telemetry.transportRunning || typeof input.telemetry.barIndex !== 'number') {
        reset();
        return;
      }
      const bar = Math.max(0, Math.floor(input.telemetry.barIndex));
      tickConfigs('synthEuclidEvolve', input.synthConfigs, synthLastBars, bar, input);
      tickConfigs('drumEuclidEvolve', input.drumConfigs, drumLastBars, bar, input);
    },
  };
}
