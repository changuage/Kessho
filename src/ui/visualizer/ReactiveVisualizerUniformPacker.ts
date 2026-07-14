import type { ReactiveVisualizerFrame } from './ReactiveVisualizerRenderer';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export class ReactiveVisualizerUniformPacker {
  readonly resolution = new Float32Array(2);
  readonly engineA = new Float32Array(4);
  readonly engineB = new Float32Array(4);
  readonly harmony = new Float32Array(4);
  readonly reactive = new Float32Array(4);
  readonly controlA = new Float32Array(4);
  readonly controlB = new Float32Array(4);
  readonly controlC = new Float32Array(4);
  readonly controlD = new Float32Array(4);
  readonly controlE = new Float32Array(4);
  readonly controlF = new Float32Array(4);
  readonly controlG = new Float32Array(4);
  readonly controlH = new Float32Array(4);
  readonly post = new Float32Array(4);
  readonly layerOrder = new Float32Array(4);
  readonly pointCloudA = new Float32Array(4);
  readonly pointCloudB = new Float32Array(4);
  readonly quality = new Float32Array(4);
  readonly environment = new Float32Array(4);
  readonly pulseA = new Float32Array(4);
  readonly pulseB = new Float32Array(4);
  time = 0;
  kaleidoPattern = 0;
  shapeSpread = 0;

  pack(frame: ReactiveVisualizerFrame): this {
    const snapshot = frame.snapshot;
    const controls = frame.controls;
    const pulses = snapshot.pulses;
    const triggerGain = 1.3
      + Math.max(0, controls.triggerResponse) * 0.72
      + Math.max(0, -controls.triggerResponse) * 0.36
      + Math.max(0, controls.impactFlash) * 0.66;
    this.resolution[0] = Math.max(1, Math.floor(frame.width * frame.dpr));
    this.resolution[1] = Math.max(1, Math.floor(frame.height * frame.dpr));
    this.time = frame.timeMs / 1000;
    this.write4(this.engineA, snapshot.pad, snapshot.lead, snapshot.drums, snapshot.earth, 0, 1);
    this.write4(this.engineB, snapshot.granular, snapshot.delay, snapshot.reverb, snapshot.dynamics, 0, 1);
    this.write4(this.harmony, snapshot.root, snapshot.tension, snapshot.spread, snapshot.detune, 0, 1);
    this.write4(
      this.reactive,
      pulses.global * triggerGain,
      pulses.sequencer * triggerGain,
      pulses.synthStepPhase,
      pulses.drumStepPhase,
      0,
      1,
    );
    this.write4(
      this.controlA,
      controls.style,
      controls.kaleidoscope + Math.max(0, controls.kaleidoscope) * snapshot.activeGrains * 0.0015,
      controls.triggerResponse,
      controls.ripples,
    );
    this.write4(this.controlB, controls.motion, controls.color + snapshot.brightness * 0.08, controls.diffusion, controls.backdropFade);
    this.write4(this.controlC, controls.shape, controls.organic, controls.edges, controls.pulseSync);
    this.write4(this.controlD, controls.noiseTurbulence, controls.noiseFlow, controls.noiseSpeed, controls.noiseColor);
    this.write4(this.controlE, controls.shapeSize, controls.noiseSize, controls.bloomSize, controls.kaleidoSize);
    this.write4(this.controlF, controls.glitchIntensity, controls.glitchScale, controls.glitchChromatic, controls.glitchRate);
    this.write4(this.controlG, controls.charAmount, controls.charStyle, controls.charGrain, controls.charDrift);
    this.write4(this.controlH, controls.kaleidoSegments, controls.kaleidoSpin, controls.kaleidoType, controls.kaleidoReflections);
    this.write4(this.post, controls.brightness, controls.vibrance, controls.saturation, controls.visualLimiter);
    this.kaleidoPattern = clamp(controls.kaleidoPattern, -1, 1);
    this.shapeSpread = clamp(controls.shapeSpread, -1, 1);

    const order = controls.layerOrder;
    this.layerOrder[0] = clamp(Math.round(order[0] ?? 0), 0, 4);
    this.layerOrder[1] = clamp(Math.round(order[1] ?? 1), 0, 4);
    this.layerOrder[2] = clamp(Math.round(order[2] ?? 2), 0, 4);
    this.layerOrder[3] = clamp(Math.round(order[3] ?? 3), 0, 4);
    this.pointCloudA[0] = clamp(Math.round(order[4] ?? 4), 0, 4);
    this.pointCloudA[1] = clamp(controls.pointCloudAmount, -1, 1);
    this.pointCloudA[2] = clamp(controls.pointCloudSize, -1, 1);
    this.pointCloudA[3] = clamp(controls.pointCloudDensity, -1, 1);
    this.pointCloudB[0] = clamp(controls.pointCloudScatter, -1, 1);
    this.pointCloudB[1] = clamp(controls.pointCloudColor, -1, 1);
    this.pointCloudB[2] = 0;
    this.pointCloudB[3] = 0;
    this.quality[0] = frame.quality.shaderDetail;
    this.quality[1] = frame.quality.maxPointCloudGrid;
    this.quality[2] = frame.quality.pointCloudDensityScale;
    this.quality[3] = frame.quality.maxShapes;
    this.environment[0] = clamp(frame.seed, 0.001, 0.999999);
    this.environment[1] = clamp(controls.background, -1, 1);
    this.environment[2] = clamp(controls.shapeCount * frame.quality.shapeCountScale, -1, 1);
    this.environment[3] = clamp(controls.noiseDensity * frame.quality.noiseDensityScale, -1, 1);
    this.write4(this.pulseA, pulses.synth * triggerGain, pulses.pad * triggerGain, pulses.lead * triggerGain, pulses.drums * triggerGain, 0, 1);
    this.write4(this.pulseB, pulses.earth * triggerGain, pulses.granular * triggerGain, pulses.delay * triggerGain, pulses.reverb * triggerGain, 0, 1);
    return this;
  }

  private write4(
    target: Float32Array,
    x: number,
    y: number,
    z: number,
    w: number,
    min = -1,
    max = 1,
  ): void {
    target[0] = clamp(x, min, max);
    target[1] = clamp(y, min, max);
    target[2] = clamp(z, min, max);
    target[3] = clamp(w, min, max);
  }
}
