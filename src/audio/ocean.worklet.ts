/**
 * Ocean Waves AudioWorklet
 * 
 * Two independent wave generators that can overlap.
 * Each wave generator produces periodic "wave events" with controllable timing.
 * All parameters support min/max ranges for natural variation.
 * 
 * Features:
 * - Wave body: filtered noise with rise/fall envelope
 * - Foam: high-frequency spray during wave crest
 * - Depth: low-frequency rumble
 * 
 * Parameters (all have min/max versions):
 * - intensity: Overall volume (0-1)
 * - waveDurationMin/Max: How long each wave lasts in seconds (2-15)
 * - waveIntervalMin/Max: Time between wave starts in seconds (3-20)
 * - wave2OffsetMin/Max: Second wave generator additional offset in seconds (0-10)
 * - foamMin/Max: High frequency content for breaking waves (0-1)
 * - depthMin/Max: Low frequency rumble amount (0-1)
 */

// Seeded RNG for deterministic randomness
function mulberry32(seed: number): () => number {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface WaveEvent {
  active: boolean;
  phase: number;         // 0-1 progress through the wave
  duration: number;      // Duration in samples
  amplitude: number;     // Random amplitude variation
  panOffset: number;     // Stereo position (-1 to 1)
  foam: number;          // This wave's foam amount
  depth: number;         // This wave's depth amount
}

interface WaveGenerator {
  timeSinceLastWave: number;  // Samples since last wave started
  nextWaveInterval: number;   // Samples until next wave
  currentWave: WaveEvent;
  // Filter states for this generator
  lpfStateL: number;
  lpfStateR: number;
  hpfStateL: number;
  hpfStateR: number;
}

class OceanProcessor extends AudioWorkletProcessor {
  private rng: () => number;
  private sampleRate = 48000;
  
  // Two wave generators
  private gen1: WaveGenerator;
  private gen2: WaveGenerator;
  
  // Master filter states
  private masterLpfL = 0;
  private masterLpfR = 0;
  private masterHpfL = 0;
  private masterHpfR = 0;
  
  // Foam layer filter
  private foamLpfL = 0;
  private foamLpfR = 0;
  
  // Deep rumble layer
  private rumbleLpfL = 0;
  private rumbleLpfR = 0;

  // Performance monitoring
  private perfEnabled = false;
  private perfTotalTime = 0;
  private perfCount = 0;
  private perfSamplesSinceReport = 0;
  private perfReportInterval = 48000; // ~1 second

  static get parameterDescriptors() {
    return [
      { name: 'intensity', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'waveDurationMin', defaultValue: 4, minValue: 2, maxValue: 15 },
      { name: 'waveDurationMax', defaultValue: 10, minValue: 2, maxValue: 15 },
      { name: 'waveIntervalMin', defaultValue: 5, minValue: 3, maxValue: 20 },
      { name: 'waveIntervalMax', defaultValue: 12, minValue: 3, maxValue: 20 },
      { name: 'wave2OffsetMin', defaultValue: 2, minValue: 0, maxValue: 10 },
      { name: 'wave2OffsetMax', defaultValue: 6, minValue: 0, maxValue: 10 },
      { name: 'foamMin', defaultValue: 0.2, minValue: 0, maxValue: 1 },
      { name: 'foamMax', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'depthMin', defaultValue: 0.3, minValue: 0, maxValue: 1 },
      { name: 'depthMax', defaultValue: 0.7, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    
    this.rng = mulberry32(12345);
    this.sampleRate = 48000; // Will be updated from context
    
    // Initialize generators
    this.gen1 = this.createGenerator(0);
    this.gen2 = this.createGenerator(0.5); // Start offset
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'enablePerf') {
        this.perfEnabled = e.data.enabled;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      }
      if (e.data.type === 'setSeed') {
        this.rng = mulberry32(e.data.seed);
        this.gen1 = this.createGenerator(0);
        this.gen2 = this.createGenerator(0.5);
      }
      if (e.data.type === 'setSampleRate') {
        this.sampleRate = e.data.sampleRate;
      }
    };
  }

  private createGenerator(phaseOffset: number): WaveGenerator {
    return {
      timeSinceLastWave: Math.floor(this.sampleRate * 8 * phaseOffset), // Offset start
      nextWaveInterval: Math.floor(this.sampleRate * (5 + this.rng() * 5)),
      currentWave: {
        active: false,
        phase: 0,
        duration: this.sampleRate * 6,
        amplitude: 0.7 + this.rng() * 0.3,
        panOffset: (this.rng() - 0.5) * 0.6,
        foam: 0.3,
        depth: 0.5,
      },
      lpfStateL: 0,
      lpfStateR: 0,
      hpfStateL: 0,
      hpfStateR: 0,
    };
  }

  // Random value between min and max
  private randomRange(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  private startNewWave(
    gen: WaveGenerator, 
    durationMin: number, 
    durationMax: number,
    foamMin: number,
    foamMax: number,
    depthMin: number,
    depthMax: number
  ): void {
    gen.currentWave = {
      active: true,
      phase: 0,
      duration: Math.floor(this.sampleRate * this.randomRange(durationMin, durationMax)),
      amplitude: 0.6 + this.rng() * 0.4,
      panOffset: (this.rng() - 0.5) * 0.8, // Random stereo position
      foam: this.randomRange(foamMin, foamMax),
      depth: this.randomRange(depthMin, depthMax),
    };
    gen.timeSinceLastWave = 0;
  }

  // Wave envelope: gentle rise, peak, long tail
  private waveEnvelope(phase: number): number {
    if (phase < 0.25) {
      // Rising - exponential curve
      const t = phase / 0.25;
      return t * t;
    } else if (phase < 0.35) {
      // Peak plateau
      return 1;
    } else {
      // Long decay
      const t = (phase - 0.35) / 0.65;
      return Math.pow(1 - t, 1.5);
    }
  }

  // Foam envelope: peaks during wave crest
  private foamEnvelope(phase: number): number {
    if (phase < 0.2 || phase > 0.6) return 0;
    const t = (phase - 0.2) / 0.4;
    return Math.sin(t * Math.PI);
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    
    const outL = output[0];
    const outR = output[1];
    const blockSize = outL.length;
    
    // Get parameters
    const intensity = parameters.intensity[0];
    const waveDurationMin = parameters.waveDurationMin[0];
    const waveDurationMax = parameters.waveDurationMax[0];
    const waveIntervalMin = parameters.waveIntervalMin[0];
    const waveIntervalMax = parameters.waveIntervalMax[0];
    const wave2OffsetMin = parameters.wave2OffsetMin[0];
    const wave2OffsetMax = parameters.wave2OffsetMax[0];
    const foamMin = parameters.foamMin[0];
    const foamMax = parameters.foamMax[0];
    const depthMin = parameters.depthMin[0];
    const depthMax = parameters.depthMax[0];

    const perfStart = this.perfEnabled ? performance.now() : 0;

    for (let i = 0; i < blockSize; i++) {
      let sampleL = 0;
      let sampleR = 0;
      let foamL = 0;
      let foamR = 0;
      let depthAmount = 0;
      
      // Process generator 1
      this.gen1.timeSinceLastWave++;
      if (!this.gen1.currentWave.active && this.gen1.timeSinceLastWave >= this.gen1.nextWaveInterval) {
        this.startNewWave(
          this.gen1, waveDurationMin, waveDurationMax, 
          foamMin, foamMax, depthMin, depthMax
        );
        // Randomize next interval
        this.gen1.nextWaveInterval = Math.floor(this.sampleRate * this.randomRange(waveIntervalMin, waveIntervalMax));
      }
      
      if (this.gen1.currentWave.active) {
        const wave = this.gen1.currentWave;
        wave.phase += 1 / wave.duration;
        
        if (wave.phase >= 1) {
          wave.active = false;
        } else {
          const env = this.waveEnvelope(wave.phase) * wave.amplitude;
          const foamEnv = this.foamEnvelope(wave.phase) * wave.amplitude;
          
          // Generate filtered noise for wave body
          const noise = (this.rng() - 0.5) * 2;
          this.gen1.lpfStateL += (noise - this.gen1.lpfStateL) * 0.03;
          const noiseR = (this.rng() - 0.5) * 2;
          this.gen1.lpfStateR += (noiseR - this.gen1.lpfStateR) * 0.03;
          
          // Apply panning
          const panL = 0.5 + wave.panOffset * 0.5;
          const panR = 0.5 - wave.panOffset * 0.5;
          
          sampleL += this.gen1.lpfStateL * env * panL;
          sampleR += this.gen1.lpfStateR * env * panR;
          
          // Foam (higher frequency noise during crest)
          const foamNoise = (this.rng() - 0.5) * 2;
          foamL += foamNoise * foamEnv * panL * 0.5 * wave.foam;
          foamR += foamNoise * foamEnv * panR * 0.5 * wave.foam;
          
          // Depth contribution
          depthAmount += env * wave.depth;
        }
      }
      
      // Process generator 2
      this.gen2.timeSinceLastWave++;
      if (!this.gen2.currentWave.active && this.gen2.timeSinceLastWave >= this.gen2.nextWaveInterval) {
        this.startNewWave(
          this.gen2, waveDurationMin, waveDurationMax,
          foamMin, foamMax, depthMin, depthMax
        );
        // Second generator has an additional offset
        const wave2Offset = this.randomRange(wave2OffsetMin, wave2OffsetMax);
        this.gen2.nextWaveInterval = Math.floor(this.sampleRate * (this.randomRange(waveIntervalMin, waveIntervalMax) + wave2Offset));
      }
      
      if (this.gen2.currentWave.active) {
        const wave = this.gen2.currentWave;
        wave.phase += 1 / wave.duration;
        
        if (wave.phase >= 1) {
          wave.active = false;
        } else {
          const env = this.waveEnvelope(wave.phase) * wave.amplitude * 0.7; // Slightly quieter
          const foamEnv = this.foamEnvelope(wave.phase) * wave.amplitude * 0.7;
          
          const noise = (this.rng() - 0.5) * 2;
          this.gen2.lpfStateL += (noise - this.gen2.lpfStateL) * 0.04; // Slightly different character
          const noiseR = (this.rng() - 0.5) * 2;
          this.gen2.lpfStateR += (noiseR - this.gen2.lpfStateR) * 0.04;
          
          const panL = 0.5 - wave.panOffset * 0.5; // Opposite pan tendency
          const panR = 0.5 + wave.panOffset * 0.5;
          
          sampleL += this.gen2.lpfStateL * env * panL;
          sampleR += this.gen2.lpfStateR * env * panR;
          
          const foamNoise = (this.rng() - 0.5) * 2;
          foamL += foamNoise * foamEnv * panL * 0.4 * wave.foam;
          foamR += foamNoise * foamEnv * panR * 0.4 * wave.foam;
          
          depthAmount += env * wave.depth;
        }
      }
      
      // Deep rumble layer (constant low frequency texture, modulated by depth)
      const rumbleNoise = (this.rng() - 0.5) * 2;
      this.rumbleLpfL += (rumbleNoise - this.rumbleLpfL) * 0.005;
      this.rumbleLpfR += ((this.rng() - 0.5) * 2 - this.rumbleLpfR) * 0.005;
      
      // Foam high-pass filter (remove low frequencies from foam)
      this.foamLpfL += (foamL - this.foamLpfL) * 0.3;
      this.foamLpfR += (foamR - this.foamLpfR) * 0.3;
      
      // Combine layers - depth modulates rumble
      const avgDepth = (depthMin + depthMax) / 2;
      const combinedL = sampleL + this.rumbleLpfL * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfL;
      const combinedR = sampleR + this.rumbleLpfR * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfR;
      
      // Master smoothing - higher coefficient preserves more transients
      this.masterLpfL += (combinedL - this.masterLpfL) * 0.35;
      this.masterLpfR += (combinedR - this.masterLpfR) * 0.35;
      
      // High-pass to remove DC
      this.masterHpfL += (this.masterLpfL - this.masterHpfL) * 0.0005;
      this.masterHpfR += (this.masterLpfR - this.masterHpfR) * 0.0005;
      
      const finalL = (this.masterLpfL - this.masterHpfL) * intensity * 0.6;
      const finalR = (this.masterLpfR - this.masterHpfR) * intensity * 0.6;
      
      // Soft clip
      outL[i] = Math.tanh(finalL);
      outR[i] = Math.tanh(finalR);
    }

    // Performance reporting
    if (this.perfEnabled) {
      const elapsed = performance.now() - perfStart;
      this.perfTotalTime += elapsed;
      this.perfCount++;
      this.perfSamplesSinceReport += blockSize;
      
      if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
        const avgMs = this.perfTotalTime / this.perfCount;
        const budgetMs = (blockSize / this.sampleRate) * 1000;
        this.port.postMessage({
          type: 'perf',
          name: 'ocean',
          cpuPercent: (avgMs / budgetMs) * 100,
          avgTimeMs: avgMs,
        });
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      }
    }

    return true;
  }
}

registerProcessor('ocean-processor', OceanProcessor);
