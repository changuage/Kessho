/**
 * Ocean Waves AudioWorklet
 * 
 * Simplified version without rock/pebble modal synthesis for lower CPU usage.
 * Two independent wave generators that can overlap.
 */

// Seeded RNG for deterministic randomness
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class OceanProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.rng = mulberry32(12345);
    this._sampleRate = 48000;
    
    // Master filter states
    this.masterLpfL = 0;
    this.masterLpfR = 0;
    this.masterHpfL = 0;
    this.masterHpfR = 0;
    
    // Foam layer filter
    this.foamLpfL = 0;
    this.foamLpfR = 0;
    
    // Deep rumble layer
    this.rumbleLpfL = 0;
    this.rumbleLpfR = 0;
    
    // Initialize generators
    this.gen1 = this.createGenerator(0);
    this.gen2 = this.createGenerator(0.5);
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'setSeed') {
        this.rng = mulberry32(e.data.seed);
        this.gen1 = this.createGenerator(0);
        this.gen2 = this.createGenerator(0.5);
      }
      if (e.data.type === 'setSampleRate') {
        this._sampleRate = e.data.sampleRate;
      }
    };
  }

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
      // Rock params kept for API compatibility but ignored
      { name: 'pebblesMin', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'pebblesMax', defaultValue: 0.3, minValue: 0, maxValue: 1 },
      { name: 'pebbleSizeMin', defaultValue: 0.2, minValue: 0, maxValue: 1 },
      { name: 'pebbleSizeMax', defaultValue: 0.6, minValue: 0, maxValue: 1 },
      { name: 'rockLevel', defaultValue: 0.6, minValue: 0, maxValue: 1 },
      { name: 'rockFreqMin', defaultValue: 260, minValue: 100, maxValue: 500 },
      { name: 'rockFreqMax', defaultValue: 550, minValue: 300, maxValue: 1200 },
      { name: 'rockQBase', defaultValue: 18, minValue: 5, maxValue: 50 },
      { name: 'rockDecayMin', defaultValue: 8, minValue: 3, maxValue: 50 },
      { name: 'rockDecayMax', defaultValue: 60, minValue: 20, maxValue: 150 },
      { name: 'rockBrightness', defaultValue: 0.85, minValue: 0, maxValue: 1 },
      { name: 'rockAttack', defaultValue: 0.5, minValue: 0.2, maxValue: 3 },
    ];
  }

  createGenerator(phaseOffset) {
    return {
      timeSinceLastWave: Math.floor(this._sampleRate * 8 * phaseOffset),
      nextWaveInterval: Math.floor(this._sampleRate * (5 + this.rng() * 5)),
      currentWave: {
        active: false,
        phase: 0,
        duration: this._sampleRate * 6,
        amplitude: 0.7 + this.rng() * 0.3,
        panOffset: (this.rng() - 0.5) * 0.6,
        foam: 0.3,
        depth: 0.5,
      },
      lpfStateL: 0,
      lpfStateR: 0,
    };
  }

  randomRange(min, max) {
    return min + this.rng() * (max - min);
  }

  startNewWave(gen, genId, durationMin, durationMax, intervalMin, intervalMax, foamMin, foamMax, depthMin, depthMax) {
    // Calculate normalized positions for UI display
    const durationValue = this.randomRange(durationMin, durationMax);
    const intervalValue = this.randomRange(intervalMin, intervalMax);
    const foamValue = this.randomRange(foamMin, foamMax);
    const depthValue = this.randomRange(depthMin, depthMax);
    
    gen.currentWave = {
      active: true,
      phase: 0,
      duration: Math.floor(this._sampleRate * durationValue),
      amplitude: 0.6 + this.rng() * 0.4,
      panOffset: (this.rng() - 0.5) * 0.8,
      foam: foamValue,
      depth: depthValue,
    };
    gen.timeSinceLastWave = 0;
    
    // Notify main thread of wave parameters for UI indicator
    // Only send from gen1 to avoid too frequent updates
    if (genId === 1) {
      this.port.postMessage({
        type: 'waveStarted',
        duration: durationMax > durationMin 
          ? (durationValue - durationMin) / (durationMax - durationMin) 
          : 0.5,
        interval: intervalMax > intervalMin 
          ? (intervalValue - intervalMin) / (intervalMax - intervalMin) 
          : 0.5,
        foam: foamMax > foamMin 
          ? (foamValue - foamMin) / (foamMax - foamMin) 
          : 0.5,
        depth: depthMax > depthMin 
          ? (depthValue - depthMin) / (depthMax - depthMin) 
          : 0.5,
      });
    }
  }

  waveEnvelope(phase) {
    if (phase < 0.25) {
      const t = phase / 0.25;
      return t * t;
    } else if (phase < 0.35) {
      return 1;
    } else {
      const t = (phase - 0.35) / 0.65;
      return Math.pow(1 - t, 1.5);
    }
  }

  foamEnvelope(phase) {
    if (phase < 0.2 || phase > 0.6) return 0;
    const t = (phase - 0.2) / 0.4;
    return Math.sin(t * Math.PI);
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    
    const outL = output[0];
    const outR = output[1];
    const blockSize = outL.length;
    
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
          this.gen1, 1, waveDurationMin, waveDurationMax,
          waveIntervalMin, waveIntervalMax,
          foamMin, foamMax, depthMin, depthMax
        );
        this.gen1.nextWaveInterval = Math.floor(this._sampleRate * this.randomRange(waveIntervalMin, waveIntervalMax));
      }
      
      if (this.gen1.currentWave.active) {
        const wave = this.gen1.currentWave;
        wave.phase += 1 / wave.duration;
        
        if (wave.phase >= 1) {
          wave.active = false;
        } else {
          const env = this.waveEnvelope(wave.phase) * wave.amplitude;
          const foamEnv = this.foamEnvelope(wave.phase) * wave.amplitude;
          
          const noise = (this.rng() - 0.5) * 2;
          this.gen1.lpfStateL += (noise - this.gen1.lpfStateL) * 0.03;
          const noiseR = (this.rng() - 0.5) * 2;
          this.gen1.lpfStateR += (noiseR - this.gen1.lpfStateR) * 0.03;
          
          const panL = 0.5 + wave.panOffset * 0.5;
          const panR = 0.5 - wave.panOffset * 0.5;
          
          sampleL += this.gen1.lpfStateL * env * panL;
          sampleR += this.gen1.lpfStateR * env * panR;
          
          const foamNoise = (this.rng() - 0.5) * 2;
          foamL += foamNoise * foamEnv * panL * 0.5 * wave.foam;
          foamR += foamNoise * foamEnv * panR * 0.5 * wave.foam;
          
          depthAmount += env * wave.depth;
        }
      }
      
      // Process generator 2
      this.gen2.timeSinceLastWave++;
      if (!this.gen2.currentWave.active && this.gen2.timeSinceLastWave >= this.gen2.nextWaveInterval) {
        this.startNewWave(
          this.gen2, 2, waveDurationMin, waveDurationMax,
          waveIntervalMin, waveIntervalMax,
          foamMin, foamMax, depthMin, depthMax
        );
        const wave2Offset = this.randomRange(wave2OffsetMin, wave2OffsetMax);
        this.gen2.nextWaveInterval = Math.floor(this._sampleRate * (this.randomRange(waveIntervalMin, waveIntervalMax) + wave2Offset));
      }
      
      if (this.gen2.currentWave.active) {
        const wave = this.gen2.currentWave;
        wave.phase += 1 / wave.duration;
        
        if (wave.phase >= 1) {
          wave.active = false;
        } else {
          const env = this.waveEnvelope(wave.phase) * wave.amplitude * 0.7;
          const foamEnv = this.foamEnvelope(wave.phase) * wave.amplitude * 0.7;
          
          const noise = (this.rng() - 0.5) * 2;
          this.gen2.lpfStateL += (noise - this.gen2.lpfStateL) * 0.04;
          const noiseR = (this.rng() - 0.5) * 2;
          this.gen2.lpfStateR += (noiseR - this.gen2.lpfStateR) * 0.04;
          
          const panL = 0.5 - wave.panOffset * 0.5;
          const panR = 0.5 + wave.panOffset * 0.5;
          
          sampleL += this.gen2.lpfStateL * env * panL;
          sampleR += this.gen2.lpfStateR * env * panR;
          
          const foamNoise = (this.rng() - 0.5) * 2;
          foamL += foamNoise * foamEnv * panL * 0.4 * wave.foam;
          foamR += foamNoise * foamEnv * panR * 0.4 * wave.foam;
          
          depthAmount += env * wave.depth;
        }
      }
      
      // Deep rumble layer
      const rumbleNoise = (this.rng() - 0.5) * 2;
      this.rumbleLpfL += (rumbleNoise - this.rumbleLpfL) * 0.005;
      this.rumbleLpfR += ((this.rng() - 0.5) * 2 - this.rumbleLpfR) * 0.005;
      
      // Foam filtering
      this.foamLpfL += (foamL - this.foamLpfL) * 0.3;
      this.foamLpfR += (foamR - this.foamLpfR) * 0.3;
      
      // Combine layers
      const avgDepth = (depthMin + depthMax) / 2;
      const combinedL = sampleL + this.rumbleLpfL * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfL;
      const combinedR = sampleR + this.rumbleLpfR * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfR;
      
      // Master lowpass
      this.masterLpfL += (combinedL - this.masterLpfL) * 0.35;
      this.masterLpfR += (combinedR - this.masterLpfR) * 0.35;
      
      // DC blocking highpass
      this.masterHpfL += (this.masterLpfL - this.masterHpfL) * 0.0005;
      this.masterHpfR += (this.masterLpfR - this.masterHpfR) * 0.0005;
      
      // Final output with soft clipping
      const finalL = (this.masterLpfL - this.masterHpfL) * intensity * 0.6;
      const finalR = (this.masterLpfR - this.masterHpfR) * intensity * 0.6;
      
      outL[i] = Math.tanh(finalL);
      outR[i] = Math.tanh(finalR);
    }

    return true;
  }
}

registerProcessor('ocean-processor', OceanProcessor);
