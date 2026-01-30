/**
 * Ocean Waves AudioWorklet
 * 
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

// Mode ratios from real beach rock sample analysis
const MODE_RATIOS = [1.00, 1.30, 1.52, 2.27];
const MODE_GAINS = [0.80, 0.64, 1.00, 0.71];

// Max concurrent rock voices
const MAX_ROCKS = 12;

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
    
    // Rock output lowpass for smoothing
    this.rockLpfL = 0;
    this.rockLpfR = 0;
    
    // Initialize generators
    this.gen1 = this.createGenerator(0);
    this.gen2 = this.createGenerator(0.5);
    
    // Initialize rock voice pool
    this.rocks = [];
    for (let i = 0; i < MAX_ROCKS; i++) {
      this.rocks.push({
        active: false,
        phase: 0,
        duration: 0,
        baseFreq: 400,
        amplitude: 0,
        pan: 0,
        size: 0.5,
        modeFreqs: [400, 588, 836, 1144],
        modeQs: [40, 32, 26, 20],
        m0_bp1: 0, m0_bp2: 0,
        m1_bp1: 0, m1_bp2: 0,
        m2_bp1: 0, m2_bp2: 0,
        m3_bp1: 0, m3_bp2: 0,
        impulsePhase: 0,
        impulseDuration: 0,
      });
    }
    
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
        pebbles: 0.2,
        pebbleSize: 0.4,
      },
      lpfStateL: 0,
      lpfStateR: 0,
      hpfStateL: 0,
      hpfStateR: 0,
    };
  }

  randomRange(min, max) {
    return min + this.rng() * (max - min);
  }

  startNewWave(gen, durationMin, durationMax, foamMin, foamMax, depthMin, depthMax, pebblesMin, pebblesMax, pebbleSizeMin, pebbleSizeMax) {
    gen.currentWave = {
      active: true,
      phase: 0,
      duration: Math.floor(this._sampleRate * this.randomRange(durationMin, durationMax)),
      amplitude: 0.6 + this.rng() * 0.4,
      panOffset: (this.rng() - 0.5) * 0.8,
      foam: this.randomRange(foamMin, foamMax),
      depth: this.randomRange(depthMin, depthMax),
      pebbles: this.randomRange(pebblesMin, pebblesMax),
      pebbleSize: this.randomRange(pebbleSizeMin, pebbleSizeMax),
    };
    gen.timeSinceLastWave = 0;
  }

  spawnRock(rockSize, wavePan, freqMin, freqMax, qBase, decayMin, decayMax, attackMs) {
    let target = null;
    let oldestPhase = 0;
    let oldestRock = null;
    
    for (const rock of this.rocks) {
      if (!rock.active) {
        target = rock;
        break;
      }
      if (rock.phase > oldestPhase) {
        oldestPhase = rock.phase;
        oldestRock = rock;
      }
    }
    
    if (!target && oldestRock) {
      target = oldestRock;
    }
    if (!target) return;
    
    const baseFreq = freqMin + (1 - rockSize) * (freqMax - freqMin);
    const freqJitter = 0.92 + this.rng() * 0.16;
    
    const modeFreqs = [
      baseFreq * freqJitter * MODE_RATIOS[0] * (0.96 + this.rng() * 0.08),
      baseFreq * freqJitter * MODE_RATIOS[1] * (0.94 + this.rng() * 0.12),
      baseFreq * freqJitter * MODE_RATIOS[2] * (0.92 + this.rng() * 0.16),
      baseFreq * freqJitter * MODE_RATIOS[3] * (0.90 + this.rng() * 0.20),
    ];
    
    const q = qBase + rockSize * (qBase * 0.8);
    const modeQs = [
      q * (0.9 + this.rng() * 0.2),
      q * 0.75 * (0.9 + this.rng() * 0.2),
      q * 0.55 * (0.9 + this.rng() * 0.2),
      q * 0.40 * (0.9 + this.rng() * 0.2),
    ];
    
    const durationMs = decayMin + rockSize * (decayMax - decayMin);
    const impulseDurationMs = attackMs * (0.8 + this.rng() * 0.4);
    
    target.active = true;
    target.phase = 0;
    target.duration = Math.floor(this._sampleRate * durationMs / 1000);
    target.baseFreq = baseFreq * freqJitter;
    target.amplitude = 0.4 + this.rng() * 0.6;
    target.pan = wavePan + (this.rng() - 0.5) * 1.2;
    target.pan = Math.max(-1, Math.min(1, target.pan));
    target.size = rockSize;
    target.modeFreqs = modeFreqs;
    target.modeQs = modeQs;
    target.impulsePhase = 0;
    target.impulseDuration = Math.floor(this._sampleRate * impulseDurationMs / 1000);
    
    target.m0_bp1 = 0; target.m0_bp2 = 0;
    target.m1_bp1 = 0; target.m1_bp2 = 0;
    target.m2_bp1 = 0; target.m2_bp2 = 0;
    target.m3_bp1 = 0; target.m3_bp2 = 0;
  }

  processMode(input, freq, Q, bp1, bp2) {
    const omega = 2 * Math.PI * freq / this._sampleRate;
    const newBp1 = bp1 + omega * (input - bp1 - bp2 / Q);
    const newBp2 = bp2 + omega * newBp1;
    return [newBp1, newBp1, newBp2];
  }

  processRock(rock, brightness) {
    if (!rock.active) return [0, 0];
    
    rock.phase += 1 / rock.duration;
    if (rock.phase >= 1) {
      rock.active = false;
      return [0, 0];
    }
    
    let excitation = 0;
    let transientNoise = 0;
    
    if (rock.impulsePhase < 1) {
      const impulseEnv = Math.exp(-rock.impulsePhase * 6);
      const noiseComponent = (this.rng() - 0.5) * 2;
      excitation = impulseEnv * (0.6 + noiseComponent * 0.4);
      
      const clickEnv = Math.exp(-rock.impulsePhase * 12);
      transientNoise = noiseComponent * clickEnv * 0.5;
      
      rock.impulsePhase += 1 / rock.impulseDuration;
    } else {
      excitation = (this.rng() - 0.5) * 0.02;
    }
    
    let [out0, newBp1_0, newBp2_0] = this.processMode(excitation, rock.modeFreqs[0], rock.modeQs[0], rock.m0_bp1, rock.m0_bp2);
    let [out1, newBp1_1, newBp2_1] = this.processMode(excitation, rock.modeFreqs[1], rock.modeQs[1], rock.m1_bp1, rock.m1_bp2);
    let [out2, newBp1_2, newBp2_2] = this.processMode(excitation, rock.modeFreqs[2], rock.modeQs[2], rock.m2_bp1, rock.m2_bp2);
    let [out3, newBp1_3, newBp2_3] = this.processMode(excitation, rock.modeFreqs[3], rock.modeQs[3], rock.m3_bp1, rock.m3_bp2);
    
    rock.m0_bp1 = newBp1_0; rock.m0_bp2 = newBp2_0;
    rock.m1_bp1 = newBp1_1; rock.m1_bp2 = newBp2_1;
    rock.m2_bp1 = newBp1_2; rock.m2_bp2 = newBp2_2;
    rock.m3_bp1 = newBp1_3; rock.m3_bp2 = newBp2_3;
    
    const g0 = 1.0;
    const g1 = 0.35 + brightness * 0.50;
    const g2 = 0.25 + brightness * 0.45;
    const g3 = 0.15 + brightness * 0.40;
    const modalSum = out0 * g0 + out1 * g1 + out2 * g2 + out3 * g3;
    
    const combined = modalSum + transientNoise * (0.3 + brightness * 0.4);
    
    const decayRate = 5 + (1 - rock.size) * 10;
    const env = Math.exp(-rock.phase * decayRate) * rock.amplitude;
    
    const panL = Math.cos((rock.pan + 1) * Math.PI / 4);
    const panR = Math.sin((rock.pan + 1) * Math.PI / 4);
    
    const sample = combined * env * 0.4;
    return [sample * panL, sample * panR];
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

  rockDensityEnvelope(phase) {
    if (phase < 0.35 || phase > 0.98) return 0;
    
    const crashPeak = phase >= 0.35 && phase < 0.50 
      ? Math.exp(-Math.pow((phase - 0.42) / 0.06, 2)) * 1.5 
      : 0;
    
    const sustain = phase >= 0.45 && phase < 0.85
      ? 0.6 * (1 - (phase - 0.45) / 0.40 * 0.3)
      : 0;
    
    const tail = phase >= 0.80 && phase < 0.98
      ? 0.25 * Math.exp(-(phase - 0.80) / 0.15)
      : 0;
    
    return crashPeak + sustain + tail;
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
    const pebblesMin = parameters.pebblesMin[0];
    const pebblesMax = parameters.pebblesMax[0];
    const pebbleSizeMin = parameters.pebbleSizeMin[0];
    const pebbleSizeMax = parameters.pebbleSizeMax[0];
    const rockLevel = parameters.rockLevel[0];
    const rockFreqMin = parameters.rockFreqMin[0];
    const rockFreqMax = parameters.rockFreqMax[0];
    const rockQBase = parameters.rockQBase[0];
    const rockDecayMin = parameters.rockDecayMin[0];
    const rockDecayMax = parameters.rockDecayMax[0];
    const rockBrightness = parameters.rockBrightness[0];
    const rockAttack = parameters.rockAttack[0];

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
          foamMin, foamMax, depthMin, depthMax,
          pebblesMin, pebblesMax, pebbleSizeMin, pebbleSizeMax
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
          
          if (wave.pebbles > 0) {
            const rockEnv = this.rockDensityEnvelope(wave.phase);
            if (rockEnv > 0) {
              const spawnProb = wave.pebbles * rockEnv * 0.012;
              if (this.rng() < spawnProb) {
                this.spawnRock(
                  wave.pebbleSize, wave.panOffset,
                  rockFreqMin, rockFreqMax, rockQBase,
                  rockDecayMin, rockDecayMax, rockAttack
                );
              }
            }
          }
          
          depthAmount += env * wave.depth;
        }
      }
      
      // Process generator 2
      this.gen2.timeSinceLastWave++;
      if (!this.gen2.currentWave.active && this.gen2.timeSinceLastWave >= this.gen2.nextWaveInterval) {
        this.startNewWave(
          this.gen2, waveDurationMin, waveDurationMax,
          foamMin, foamMax, depthMin, depthMax,
          pebblesMin, pebblesMax, pebbleSizeMin, pebbleSizeMax
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
          
          if (wave.pebbles > 0) {
            const rockEnv = this.rockDensityEnvelope(wave.phase);
            if (rockEnv > 0) {
              const spawnProb = wave.pebbles * rockEnv * 0.010;
              if (this.rng() < spawnProb) {
                this.spawnRock(
                  wave.pebbleSize, -wave.panOffset,
                  rockFreqMin, rockFreqMax, rockQBase,
                  rockDecayMin, rockDecayMax, rockAttack
                );
              }
            }
          }
          
          depthAmount += env * wave.depth;
        }
      }
      
      // Process all active rock voices
      let rockL = 0;
      let rockR = 0;
      for (const rock of this.rocks) {
        if (rock.active) {
          const [rl, rr] = this.processRock(rock, rockBrightness);
          rockL += rl;
          rockR += rr;
        }
      }
      
      this.rockLpfL += (rockL * rockLevel - this.rockLpfL) * 0.8;
      this.rockLpfR += (rockR * rockLevel - this.rockLpfR) * 0.8;
      
      const rumbleNoise = (this.rng() - 0.5) * 2;
      this.rumbleLpfL += (rumbleNoise - this.rumbleLpfL) * 0.005;
      this.rumbleLpfR += ((this.rng() - 0.5) * 2 - this.rumbleLpfR) * 0.005;
      
      this.foamLpfL += (foamL - this.foamLpfL) * 0.3;
      this.foamLpfR += (foamR - this.foamLpfR) * 0.3;
      
      const avgDepth = (depthMin + depthMax) / 2;
      const combinedL = sampleL + this.rumbleLpfL * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfL + this.rockLpfL;
      const combinedR = sampleR + this.rumbleLpfR * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfR + this.rockLpfR;
      
      this.masterLpfL += (combinedL - this.masterLpfL) * 0.35;
      this.masterLpfR += (combinedR - this.masterLpfR) * 0.35;
      
      this.masterHpfL += (this.masterLpfL - this.masterHpfL) * 0.0005;
      this.masterHpfR += (this.masterLpfR - this.masterHpfR) * 0.0005;
      
      const finalL = (this.masterLpfL - this.masterHpfL) * intensity * 0.6;
      const finalR = (this.masterLpfR - this.masterHpfR) * intensity * 0.6;
      
      outL[i] = Math.tanh(finalL);
      outR[i] = Math.tanh(finalR);
    }

    return true;
  }
}

registerProcessor('ocean-processor', OceanProcessor);
