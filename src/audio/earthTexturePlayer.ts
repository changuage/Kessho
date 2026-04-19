type ActiveSlice = {
  id: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startTime: number;
  endTime: number;
  offset: number;
  bufferDuration: number;
  outputDuration: number;
  detuneCents: number;
  speedMultiplier: number;
  totalRate: number;
};

export type EarthTextureSliceDebug = {
  id: number;
  startTime: number;
  endTime: number;
  offset: number;
  bufferDuration: number;
  outputDuration: number;
  detuneCents: number;
  speedMultiplier: number;
  totalRate: number;
  isPlaying: boolean;
};

export type EarthTexturePlayerDebugSnapshot = {
  fileName: string;
  sliceDuration: number;
  fadeTime: number;
  density: number;
  strideSeconds: number;
  nowTime: number;
  activeSliceCount: number;
  playingSliceCount: number;
  activeSlices: EarthTextureSliceDebug[];
};

export type EarthTexturePlayerConfig = {
  fileName: string;
  sliceDuration: number;
  fadeTime: number;
  density: number;
  schedulerLookAheadMs?: number;
  schedulerIntervalMs?: number;
};

const RANDOM_PITCH_RANGE_CENTS = 200;
const RANDOM_SPEED_VARIATION = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function randomSigned(amount: number): number {
  return (Math.random() * 2 - 1) * amount;
}

function resolveSampleUrl(fileName: string): string {
  const root = new URL(import.meta.env.BASE_URL, window.location.origin);
  const encoded = fileName.split('/').map((part) => encodeURIComponent(part)).join('/');
  return new URL(`samples/${encoded}`, root).toString();
}

function makePowerCurve(forward: boolean): Float32Array {
  const size = 64;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const t = i / (size - 1);
    curve[i] = forward
      ? Math.sin(t * Math.PI * 0.5)
      : Math.cos(t * Math.PI * 0.5);
  }
  return curve;
}

type EarthTextureSchedulerGroup = {
  players: Set<EarthTexturePlayer>;
  timer: number | null;
};

export class EarthTexturePlayer {
  private static readonly minimumQueuedSlices = 4;

  private static readonly decodedBufferCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
  private static readonly loadPromiseCache = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer | null>>>();
  private static readonly schedulerGroups = new WeakMap<AudioContext, EarthTextureSchedulerGroup>();
  private static readonly missingFileCache = new Set<string>();

  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly fadeInCurve = makePowerCurve(true);
  private readonly fadeOutCurve = makePowerCurve(false);
  private readonly schedulerLookAheadSec: number;
  private readonly schedulerIntervalMs: number;

  private fileName: string;
  private sliceDuration: number;
  private fadeTime: number;
  private density: number;

  private nextStartTime = 0;
  private running = false;
  private recentOffsets: number[] = [];
  private readonly activeSlices = new Set<ActiveSlice>();
  private nextSliceId = 1;

  constructor(ctx: AudioContext, output: AudioNode, config: EarthTexturePlayerConfig) {
    this.ctx = ctx;
    this.output = output;
    this.fileName = config.fileName;
    this.sliceDuration = config.sliceDuration;
    this.fadeTime = config.fadeTime;
    this.density = config.density;
    this.schedulerLookAheadSec = (config.schedulerLookAheadMs ?? 500) / 1000;
    this.schedulerIntervalMs = config.schedulerIntervalMs ?? 140;
  }

  private getSharedDecodedBufferCache(): Map<string, AudioBuffer> {
    let cache = EarthTexturePlayer.decodedBufferCache.get(this.ctx);
    if (!cache) {
      cache = new Map();
      EarthTexturePlayer.decodedBufferCache.set(this.ctx, cache);
    }
    return cache;
  }

  private getSharedLoadPromiseCache(): Map<string, Promise<AudioBuffer | null>> {
    let cache = EarthTexturePlayer.loadPromiseCache.get(this.ctx);
    if (!cache) {
      cache = new Map();
      EarthTexturePlayer.loadPromiseCache.set(this.ctx, cache);
    }
    return cache;
  }

  private static getSchedulerGroup(ctx: AudioContext): EarthTextureSchedulerGroup {
    let group = EarthTexturePlayer.schedulerGroups.get(ctx);
    if (!group) {
      group = { players: new Set(), timer: null };
      EarthTexturePlayer.schedulerGroups.set(ctx, group);
    }
    return group;
  }

  private get buffer(): AudioBuffer | null {
    return this.getSharedDecodedBufferCache().get(this.fileName) ?? null;
  }

  async ensureLoaded(): Promise<AudioBuffer | null> {
    if (EarthTexturePlayer.missingFileCache.has(this.fileName)) return null;

    const sharedBuffers = this.getSharedDecodedBufferCache();
    const existing = sharedBuffers.get(this.fileName);
    if (existing) return existing;

    const sharedPromises = this.getSharedLoadPromiseCache();
    const pending = sharedPromises.get(this.fileName);
    if (pending) return pending;

    const loadPromise = (async () => {
      try {
        const response = await fetch(resolveSampleUrl(this.fileName));
        if (!response.ok) {
          if (response.status === 404) {
            const alreadyMarkedMissing = EarthTexturePlayer.missingFileCache.has(this.fileName);
            EarthTexturePlayer.missingFileCache.add(this.fileName);
            if (!alreadyMarkedMissing) {
              console.warn(`Earth texture sample not found: ${this.fileName}`);
            }
            return null;
          }

          console.warn(`Failed to load Earth texture sample ${this.fileName}: HTTP ${response.status}`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrayBuffer);
        sharedBuffers.set(this.fileName, decoded);
        return decoded;
      } catch (error) {
        console.warn(`Failed to load Earth texture sample ${this.fileName}:`, error);
        return null;
      } finally {
        sharedPromises.delete(this.fileName);
      }
    })();

    sharedPromises.set(this.fileName, loadPromise);
    return loadPromise;
  }

  update(config: Partial<Pick<EarthTexturePlayerConfig, 'sliceDuration' | 'fadeTime' | 'density'>>): void {
    if (typeof config.sliceDuration === 'number') this.sliceDuration = config.sliceDuration;
    if (typeof config.fadeTime === 'number') this.fadeTime = config.fadeTime;
    if (typeof config.density === 'number') this.density = clamp(config.density, 0, 1);
  }

  async start(): Promise<void> {
    if (this.running && (this.activeSlices.size > 0 || this.nextStartTime > 0)) {
      return;
    }
    this.running = true;
    const buffer = await this.ensureLoaded();
    if (!this.running || !buffer) return;

    if (this.nextStartTime <= 0) {
      this.nextStartTime = this.ctx.currentTime + 0.025;
    }

    this.scheduleAhead();
    this.registerWithSharedScheduler();
  }

  stop(): void {
    this.running = false;
    this.nextStartTime = 0;
    this.unregisterFromSharedScheduler();

    const now = this.ctx.currentTime;
    for (const slice of Array.from(this.activeSlices)) {
      try {
        slice.gain.gain.cancelScheduledValues(now);
        slice.gain.gain.setTargetAtTime(0, now, 0.05);
        slice.source.stop(now + 0.25);
      } catch {
        // Ignore stale sources.
      }
    }
  }

  dispose(): void {
    this.stop();
    this.recentOffsets = [];
  }

  getActiveSliceCount(): number {
    return this.activeSlices.size;
  }

  getDebugSnapshot(): EarthTexturePlayerDebugSnapshot | null {
    const nowTime = this.ctx.currentTime;
    const activeSlices = Array.from(this.activeSlices)
      .map((slice) => ({
        id: slice.id,
        startTime: slice.startTime,
        endTime: slice.endTime,
        offset: slice.offset,
        bufferDuration: slice.bufferDuration,
        outputDuration: slice.outputDuration,
        detuneCents: slice.detuneCents,
        speedMultiplier: slice.speedMultiplier,
        totalRate: slice.totalRate,
        isPlaying: nowTime >= slice.startTime && nowTime <= slice.endTime,
      }))
      .sort((a, b) => a.startTime - b.startTime);

    return {
      fileName: this.fileName,
      sliceDuration: this.sliceDuration,
      fadeTime: this.fadeTime,
      density: this.density,
      strideSeconds: this.computeStrideSeconds(),
      nowTime,
      activeSliceCount: activeSlices.length,
      playingSliceCount: activeSlices.filter((slice) => slice.isPlaying).length,
      activeSlices,
    };
  }

  private registerWithSharedScheduler(): void {
    const group = EarthTexturePlayer.getSchedulerGroup(this.ctx);
    group.players.add(this);
    EarthTexturePlayer.ensureSharedScheduler(this.ctx);
  }

  private unregisterFromSharedScheduler(): void {
    const group = EarthTexturePlayer.getSchedulerGroup(this.ctx);
    group.players.delete(this);
    if (group.players.size === 0 && group.timer !== null) {
      clearTimeout(group.timer);
      group.timer = null;
    }
  }

  private static ensureSharedScheduler(ctx: AudioContext): void {
    const group = EarthTexturePlayer.getSchedulerGroup(ctx);
    if (group.timer !== null || group.players.size === 0) return;

    const tick = () => {
      group.timer = null;
      if (group.players.size === 0) return;
      for (const player of Array.from(group.players)) {
        player.scheduleAhead();
      }
      EarthTexturePlayer.ensureSharedScheduler(ctx);
    };

    let nextIntervalMs = Infinity;
    for (const player of group.players) {
      nextIntervalMs = Math.min(nextIntervalMs, player.schedulerIntervalMs);
    }
    group.timer = window.setTimeout(tick, Number.isFinite(nextIntervalMs) ? nextIntervalMs : 140);
  }

  private scheduleAhead(): void {
    if (!this.running || !this.buffer) return;

    const horizon = this.ctx.currentTime + this.schedulerLookAheadSec;
    if (this.nextStartTime <= 0) {
      this.nextStartTime = this.ctx.currentTime + 0.025;
    }

    while (this.nextStartTime < horizon || this.activeSlices.size < EarthTexturePlayer.minimumQueuedSlices) {
      const scheduled = this.scheduleSlice(this.nextStartTime);
      if (!scheduled) break;
      this.nextStartTime += this.computeStrideSeconds(scheduled.outputDuration, scheduled.fade);
    }
  }

  private computeStrideSeconds(outputDuration = Math.max(4, this.sliceDuration), fade = clamp(this.fadeTime, 0.1, outputDuration * 0.45)): number {
    const duration = Math.max(1.5, outputDuration);
    const density = clamp(this.density, 0, 1);
    const silenceGapAtZero = clamp(Math.min(fade * 0.45, duration * 0.14), 0.18, 1.25);
    const handoffOverlap = fade;
    const denseOverlap = clamp(fade + duration * 0.16, fade * 1.25, duration * 0.42);

    const overlapOrGap = density <= 0.25
      ? lerp(-silenceGapAtZero, handoffOverlap, density / 0.25)
      : lerp(handoffOverlap, denseOverlap, (density - 0.25) / 0.75);

    return clamp(duration - overlapOrGap, 0.35, duration + silenceGapAtZero);
  }

  private scheduleSlice(when: number): { outputDuration: number; fade: number } | null {
    if (!this.buffer) return null;

    const bufferDuration = clamp(this.sliceDuration, 1.5, Math.max(1.5, this.buffer.duration - 0.05));
    const detuneCents = randomSigned(RANDOM_PITCH_RANGE_CENTS);
    const speedMultiplier = 1 + randomSigned(RANDOM_SPEED_VARIATION);
    const totalRate = Math.max(0.25, speedMultiplier * Math.pow(2, detuneCents / 1200));
    const outputDuration = bufferDuration / totalRate;
    const fade = clamp(this.fadeTime, 0.1, outputDuration * 0.45);
    const maxOffset = Math.max(0, this.buffer.duration - bufferDuration - 0.02);
    const offset = this.pickOffset(maxOffset, bufferDuration);

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.setValueAtTime(speedMultiplier, when);
    source.detune.setValueAtTime(detuneCents, when);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.setValueCurveAtTime(this.fadeInCurve, when, fade);
    if (outputDuration > fade * 2) {
      env.gain.setValueAtTime(1, when + fade);
      env.gain.setValueAtTime(1, when + outputDuration - fade);
    }
    env.gain.setValueCurveAtTime(this.fadeOutCurve, when + outputDuration - fade, fade);

    source.connect(env);
    env.connect(this.output);

    const slice: ActiveSlice = {
      id: this.nextSliceId++,
      source,
      gain: env,
      startTime: when,
      endTime: when + outputDuration,
      offset,
      bufferDuration,
      outputDuration,
      detuneCents,
      speedMultiplier,
      totalRate,
    };
    this.activeSlices.add(slice);

    source.onended = () => {
      this.activeSlices.delete(slice);
      try {
        source.disconnect();
        env.disconnect();
      } catch {
        // Ignore.
      }

      if (this.running) {
        if (this.nextStartTime <= this.ctx.currentTime) {
          this.nextStartTime = this.ctx.currentTime + 0.025;
        }
        this.scheduleAhead();
        this.registerWithSharedScheduler();
      }
    };

    source.start(when, offset, bufferDuration);
    return { outputDuration, fade };
  }

  private pickOffset(maxOffset: number, duration: number): number {
    if (maxOffset <= 0.0001) return 0;

    const exclusionDistance = Math.min(duration * 0.75, Math.max(2.5, maxOffset * 0.12));
    let candidate = Math.random() * maxOffset;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      candidate = Math.random() * maxOffset;
      const tooClose = this.recentOffsets.some((recent) => Math.abs(recent - candidate) < exclusionDistance);
      if (!tooClose) break;
    }

    this.recentOffsets.push(candidate);
    if (this.recentOffsets.length > 6) {
      this.recentOffsets.shift();
    }

    return candidate;
  }
}
