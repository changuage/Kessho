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
 * - Rocks: modal synthesis with 4 inharmonic resonators for realistic stone collision sounds
 * 
 * Parameters (all have min/max versions):
 * - intensity: Overall volume (0-1)
 * - waveDurationMin/Max: How long each wave lasts in seconds (2-15)
 * - waveIntervalMin/Max: Time between wave starts in seconds (3-20)
 * - wave2OffsetMin/Max: Second wave generator additional offset in seconds (0-10)
 * - foamMin/Max: High frequency content for breaking waves (0-1)
 * - depthMin/Max: Low frequency rumble amount (0-1)
 * - pebblesMin/Max: Rock collision density during retreat (0-1)
 * - pebbleSizeMin/Max: Size of rocks - 0=small/high freq, 1=large/low freq
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
  pebbles: number;       // This wave's pebble density
  pebbleSize: number;    // This wave's pebble size
}

// Individual rock collision event with 4-mode modal synthesis
interface RockEvent {
  active: boolean;
  phase: number;         // 0-1 progress through decay
  duration: number;      // Duration in samples
  baseFreq: number;      // Base frequency for modal synthesis
  amplitude: number;     // Overall amplitude
  pan: number;           // Stereo position
  size: number;          // 0-1, affects decay time and character
  // Mode frequencies with jitter applied
  modeFreqs: [number, number, number, number];
  // Mode Q values
  modeQs: [number, number, number, number];
  // 4 modal resonator states (each needs 2 state variables)
  m0_bp1: number; m0_bp2: number;
  m1_bp1: number; m1_bp2: number;
  m2_bp1: number; m2_bp2: number;
  m3_bp1: number; m3_bp2: number;
  // Impulse phase (0-1 over first few ms)
  impulsePhase: number;
  impulseDuration: number;
}

// Mode ratios extracted from real Ghetary beach rock sample analysis
// These closely-spaced ratios create the characteristic "thunk" of stone vs metallic "ping"
const MODE_RATIOS = [1.00, 1.30, 1.52, 2.27];
// Mode gains from sample - note mode 3 (1.52x) is actually the loudest
const MODE_GAINS = [0.80, 0.64, 1.00, 0.71];

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

// Max concurrent rock voices (voice pool with stealing)
const MAX_ROCKS = 12;

class OceanProcessor extends AudioWorkletProcessor {
  private rng: () => number;
  private sampleRate = 48000;
  
  // Two wave generators
  private gen1: WaveGenerator;
  private gen2: WaveGenerator;
  
  // Rock event pool (modal synthesis voices)
  private rocks: RockEvent[] = [];
  
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
  
  // Rock output lowpass for smoothing
  private rockLpfL = 0;
  private rockLpfR = 0;

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
      // Rock modal synthesis parameters (extracted from Ghetary beach rock sample)
      { name: 'rockLevel', defaultValue: 0.6, minValue: 0, maxValue: 1 },       // Rock output level
      { name: 'rockFreqMin', defaultValue: 260, minValue: 100, maxValue: 500 }, // Base freq for large rocks (~258Hz from sample)
      { name: 'rockFreqMax', defaultValue: 550, minValue: 300, maxValue: 1200 },// Base freq for small rocks (~554Hz from sample)
      { name: 'rockQBase', defaultValue: 18, minValue: 5, maxValue: 50 },       // Lower Q for less ringing (real rocks are damped)
      { name: 'rockDecayMin', defaultValue: 8, minValue: 3, maxValue: 50 },     // Very short decay from sample (8ms)
      { name: 'rockDecayMax', defaultValue: 60, minValue: 20, maxValue: 150 },  // Longer decay from sample (61ms)
      { name: 'rockBrightness', defaultValue: 0.85, minValue: 0, maxValue: 1 }, // High brightness from sample (0.89)
      { name: 'rockAttack', defaultValue: 0.5, minValue: 0.2, maxValue: 3 },    // Sharp attack for initial click
    ];
  }

  constructor() {
    super();
    
    this.rng = mulberry32(12345);
    this.sampleRate = 48000; // Will be updated from context
    
    // Initialize generators
    this.gen1 = this.createGenerator(0);
    this.gen2 = this.createGenerator(0.5); // Start offset
    
    // Initialize rock voice pool
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
        pebbles: 0.2,
        pebbleSize: 0.4,
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
    depthMax: number,
    pebblesMin: number,
    pebblesMax: number,
    pebbleSizeMin: number,
    pebbleSizeMax: number
  ): void {
    gen.currentWave = {
      active: true,
      phase: 0,
      duration: Math.floor(this.sampleRate * this.randomRange(durationMin, durationMax)),
      amplitude: 0.6 + this.rng() * 0.4,
      panOffset: (this.rng() - 0.5) * 0.8, // Random stereo position
      foam: this.randomRange(foamMin, foamMax),
      depth: this.randomRange(depthMin, depthMax),
      pebbles: this.randomRange(pebblesMin, pebblesMax),
      pebbleSize: this.randomRange(pebbleSizeMin, pebbleSizeMax),
    };
    gen.timeSinceLastWave = 0;
  }

  // Spawn a new rock collision using modal synthesis
  // Now uses external parameters for full control
  private spawnRock(
    rockSize: number, 
    wavePan: number,
    freqMin: number,
    freqMax: number,
    qBase: number,
    decayMin: number,
    decayMax: number,
    attackMs: number
  ): void {
    // Find inactive slot, or steal oldest voice
    let target: RockEvent | null = null;
    let oldestPhase = 0;
    let oldestRock: RockEvent | null = null;
    
    for (const rock of this.rocks) {
      if (!rock.active) {
        target = rock;
        break;
      }
      // Track oldest for voice stealing
      if (rock.phase > oldestPhase) {
        oldestPhase = rock.phase;
        oldestRock = rock;
      }
    }
    
    // Voice stealing if no free slot
    if (!target && oldestRock) {
      target = oldestRock;
    }
    if (!target) return;
    
    // Size determines base frequency: large rocks = lower (freqMin), small = higher (freqMax)
    const baseFreq = freqMin + (1 - rockSize) * (freqMax - freqMin);
    const freqJitter = 0.92 + this.rng() * 0.16; // ±8% variation
    
    // Calculate mode frequencies with per-mode jitter
    const modeFreqs: [number, number, number, number] = [
      baseFreq * freqJitter * MODE_RATIOS[0] * (0.96 + this.rng() * 0.08),
      baseFreq * freqJitter * MODE_RATIOS[1] * (0.94 + this.rng() * 0.12),
      baseFreq * freqJitter * MODE_RATIOS[2] * (0.92 + this.rng() * 0.16),
      baseFreq * freqJitter * MODE_RATIOS[3] * (0.90 + this.rng() * 0.20),
    ];
    
    // Q values: larger rocks ring longer (higher Q), smaller rocks are more damped
    // Now uses external qBase parameter
    const q = qBase + rockSize * (qBase * 0.8);
    const modeQs: [number, number, number, number] = [
      q * (0.9 + this.rng() * 0.2),
      q * 0.75 * (0.9 + this.rng() * 0.2),
      q * 0.55 * (0.9 + this.rng() * 0.2),
      q * 0.40 * (0.9 + this.rng() * 0.2),
    ];
    
    // Duration: larger rocks decay longer (using external params)
    const durationMs = decayMin + rockSize * (decayMax - decayMin);
    
    // Impulse duration: now uses external attackMs parameter with some randomness
    const impulseDurationMs = attackMs * (0.8 + this.rng() * 0.4);
    
    target.active = true;
    target.phase = 0;
    target.duration = Math.floor(this.sampleRate * durationMs / 1000);
    target.baseFreq = baseFreq * freqJitter;
    target.amplitude = 0.4 + this.rng() * 0.6;
    target.pan = wavePan + (this.rng() - 0.5) * 1.2;
    target.pan = Math.max(-1, Math.min(1, target.pan));
    target.size = rockSize;
    target.modeFreqs = modeFreqs;
    target.modeQs = modeQs;
    target.impulsePhase = 0;
    target.impulseDuration = Math.floor(this.sampleRate * impulseDurationMs / 1000);
    
    // Reset filter states
    target.m0_bp1 = 0; target.m0_bp2 = 0;
    target.m1_bp1 = 0; target.m1_bp2 = 0;
    target.m2_bp1 = 0; target.m2_bp2 = 0;
    target.m3_bp1 = 0; target.m3_bp2 = 0;
  }

  // Process a single modal resonator, returns filtered sample
  private processMode(
    input: number,
    freq: number,
    Q: number,
    bp1: number,
    bp2: number
  ): [number, number, number] {
    const omega = 2 * Math.PI * freq / this.sampleRate;
    // State-variable filter bandpass
    const newBp1 = bp1 + omega * (input - bp1 - bp2 / Q);
    const newBp2 = bp2 + omega * newBp1;
    return [newBp1, newBp1, newBp2]; // [output, new bp1, new bp2]
  }

  // Process a single rock collision, returns stereo sample
  // brightness: 0-1, controls how much higher modes are present
  private processRock(rock: RockEvent, brightness: number): [number, number] {
    if (!rock.active) return [0, 0];
    
    rock.phase += 1 / rock.duration;
    if (rock.phase >= 1) {
      rock.active = false;
      return [0, 0];
    }
    
    // Generate excitation signal with sharp transient
    // Real rock impacts have a sharp broadband "click" + ringing modes
    let excitation = 0;
    let transientNoise = 0;
    
    if (rock.impulsePhase < 1) {
      // Very sharp impulse with noise burst for realistic attack
      const impulseEnv = Math.exp(-rock.impulsePhase * 6); // Faster decay
      // Mix of impulse and filtered noise for organic sound
      const noiseComponent = (this.rng() - 0.5) * 2;
      excitation = impulseEnv * (0.6 + noiseComponent * 0.4);
      
      // Add high-frequency transient "click" - the characteristic stone sound
      // This is separate from the modal synthesis and provides the initial crack
      const clickEnv = Math.exp(-rock.impulsePhase * 12); // Very fast
      transientNoise = noiseComponent * clickEnv * 0.5;
      
      rock.impulsePhase += 1 / rock.impulseDuration;
    } else {
      // Minimal sustain noise
      excitation = (this.rng() - 0.5) * 0.02;
    }
    
    // Process 4 modal resonators in parallel
    let [out0, newBp1_0, newBp2_0] = this.processMode(excitation, rock.modeFreqs[0], rock.modeQs[0], rock.m0_bp1, rock.m0_bp2);
    let [out1, newBp1_1, newBp2_1] = this.processMode(excitation, rock.modeFreqs[1], rock.modeQs[1], rock.m1_bp1, rock.m1_bp2);
    let [out2, newBp1_2, newBp2_2] = this.processMode(excitation, rock.modeFreqs[2], rock.modeQs[2], rock.m2_bp1, rock.m2_bp2);
    let [out3, newBp1_3, newBp2_3] = this.processMode(excitation, rock.modeFreqs[3], rock.modeQs[3], rock.m3_bp1, rock.m3_bp2);
    
    // Update states
    rock.m0_bp1 = newBp1_0; rock.m0_bp2 = newBp2_0;
    rock.m1_bp1 = newBp1_1; rock.m1_bp2 = newBp2_1;
    rock.m2_bp1 = newBp1_2; rock.m2_bp2 = newBp2_2;
    rock.m3_bp1 = newBp1_3; rock.m3_bp2 = newBp2_3;
    
    // Mix modes with gain rolloff, brightness controls how much higher modes contribute
    // At brightness=0, mostly fundamental; at brightness=1, all modes equal
    const g0 = 1.0;
    const g1 = 0.35 + brightness * 0.50;  // 0.35 - 0.85
    const g2 = 0.25 + brightness * 0.45;  // 0.25 - 0.70
    const g3 = 0.15 + brightness * 0.40;  // 0.15 - 0.55
    const modalSum = out0 * g0 + out1 * g1 + out2 * g2 + out3 * g3;
    
    // Add the transient click to the modal output
    // This gives the initial high-frequency "crack" before the modes ring
    const combined = modalSum + transientNoise * (0.3 + brightness * 0.4);
    
    // Amplitude envelope: sharp attack, exponential decay
    // Larger rocks decay slower
    const decayRate = 5 + (1 - rock.size) * 10; // 5-15: larger = slower decay
    const env = Math.exp(-rock.phase * decayRate) * rock.amplitude;
    
    // Apply panning
    const panL = Math.cos((rock.pan + 1) * Math.PI / 4);
    const panR = Math.sin((rock.pan + 1) * Math.PI / 4);
    
    const sample = combined * env * 0.4;
    return [sample * panL, sample * panR];
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

  // Pebble/rock density envelope: varies through wave retreat
  // Creates a more natural "crash → sustain → tail" pattern
  private rockDensityEnvelope(phase: number): number {
    if (phase < 0.35 || phase > 0.98) return 0;
    
    // Crash: quick burst at start of retreat (0.35-0.45)
    const crashPeak = phase >= 0.35 && phase < 0.50 
      ? Math.exp(-Math.pow((phase - 0.42) / 0.06, 2)) * 1.5 
      : 0;
    
    // Sustain: steady density during main retreat (0.45-0.80)
    const sustain = phase >= 0.45 && phase < 0.85
      ? 0.6 * (1 - (phase - 0.45) / 0.40 * 0.3) // Slight decrease
      : 0;
    
    // Tail: sparse clicks as wave recedes (0.80-0.98)
    const tail = phase >= 0.80 && phase < 0.98
      ? 0.25 * Math.exp(-(phase - 0.80) / 0.15)
      : 0;
    
    return crashPeak + sustain + tail;
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
    const pebblesMin = parameters.pebblesMin[0];
    const pebblesMax = parameters.pebblesMax[0];
    const pebbleSizeMin = parameters.pebbleSizeMin[0];
    const pebbleSizeMax = parameters.pebbleSizeMax[0];
    // New rock modal synthesis parameters
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
          
          // Spawn rocks during retreat phase with density curve
          if (wave.pebbles > 0) {
            const rockEnv = this.rockDensityEnvelope(wave.phase);
            if (rockEnv > 0) {
              // Probability based on rock density parameter and envelope
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
          
          // Depth contribution
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
          
          // Spawn rocks for gen2 as well with density curve
          if (wave.pebbles > 0) {
            const rockEnv = this.rockDensityEnvelope(wave.phase);
            if (rockEnv > 0) {
              const spawnProb = wave.pebbles * rockEnv * 0.010;
              if (this.rng() < spawnProb) {
                this.spawnRock(
                  wave.pebbleSize, -wave.panOffset, // Opposite pan
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
      
      // Apply rock level - minimal filtering to preserve high-frequency transients
      // Higher coefficient = less filtering, more highs preserved
      this.rockLpfL += (rockL * rockLevel - this.rockLpfL) * 0.8;
      this.rockLpfR += (rockR * rockLevel - this.rockLpfR) * 0.8;
      
      // Deep rumble layer (constant low frequency texture, modulated by depth)
      const rumbleNoise = (this.rng() - 0.5) * 2;
      this.rumbleLpfL += (rumbleNoise - this.rumbleLpfL) * 0.005;
      this.rumbleLpfR += ((this.rng() - 0.5) * 2 - this.rumbleLpfR) * 0.005;
      
      // Foam high-pass filter (remove low frequencies from foam)
      this.foamLpfL += (foamL - this.foamLpfL) * 0.3;
      this.foamLpfR += (foamR - this.foamLpfR) * 0.3;
      
      // Combine layers - depth modulates rumble
      const avgDepth = (depthMin + depthMax) / 2;
      const combinedL = sampleL + this.rumbleLpfL * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfL + this.rockLpfL;
      const combinedR = sampleR + this.rumbleLpfR * (depthAmount + avgDepth * 0.2) * 0.4 + this.foamLpfR + this.rockLpfR;
      
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

    return true;
  }
}

registerProcessor('ocean-processor', OceanProcessor);
