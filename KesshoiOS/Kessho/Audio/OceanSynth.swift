import AVFoundation

/// Ocean wave synthesizer with discrete wave events (matching web app's ocean.worklet.js)
/// Two independent wave generators that can overlap, with foam and rumble layers
class OceanSynth {
    let node: AVAudioSourceNode
    
    private var enabled: Bool = false
    private var level: Float = 0.3
    
    // Wave timing parameters (matching web app)
    private var intensity: Float = 0.5
    private var waveDurationMin: Float = 4.0     // seconds
    private var waveDurationMax: Float = 10.0
    private var waveIntervalMin: Float = 5.0     // seconds between waves
    private var waveIntervalMax: Float = 12.0
    private var foamMin: Float = 0.2
    private var foamMax: Float = 0.5
    private var depthMin: Float = 0.3
    private var depthMax: Float = 0.7
    
    // Wave generators (matching web app's 2-generator system)
    private struct WaveGenerator {
        var timeSinceLastWave: Int = 0
        var nextWaveInterval: Int = 44100 * 5
        var wave: Wave = Wave()
        var lpfStateL: Float = 0
        var lpfStateR: Float = 0
    }
    
    private struct Wave {
        var active: Bool = false
        var phase: Float = 0
        var duration: Int = 44100 * 6  // samples
        var amplitude: Float = 0.7
        var panOffset: Float = 0
        var foam: Float = 0.3
        var depth: Float = 0.5
    }
    
    private var gen1: WaveGenerator
    private var gen2: WaveGenerator
    
    // Filter states
    private var masterLpfL: Float = 0
    private var masterLpfR: Float = 0
    private var masterHpfL: Float = 0
    private var masterHpfR: Float = 0
    private var foamLpfL: Float = 0
    private var foamLpfR: Float = 0
    private var rumbleLpfL: Float = 0
    private var rumbleLpfR: Float = 0
    
    private let sampleRate: Float = 44100
    
    init() {
        // Initialize generators with phase offsets
        gen1 = WaveGenerator()
        gen1.timeSinceLastWave = Int(sampleRate * 8 * 0)  // Start immediately
        gen1.nextWaveInterval = Int(sampleRate * 5)
        
        gen2 = WaveGenerator()
        gen2.timeSinceLastWave = Int(sampleRate * 8 * 0.5)  // Offset start
        gen2.nextWaveInterval = Int(sampleRate * 7)
        
        node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self, self.enabled else {
                let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
                for frame in 0..<Int(frameCount) {
                    for buffer in ablPointer {
                        buffer.mData?.assumingMemoryBound(to: Float.self)[frame] = 0
                    }
                }
                return noErr
            }
            
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard ablPointer.count >= 2,
                  let leftBuffer = ablPointer[0].mData?.assumingMemoryBound(to: Float.self),
                  let rightBuffer = ablPointer[1].mData?.assumingMemoryBound(to: Float.self)
            else { return noErr }
            
            for frame in 0..<Int(frameCount) {
                let (left, right) = self.generateStereoSample()
                leftBuffer[frame] = left
                rightBuffer[frame] = right
            }
            
            return noErr
        }
    }
    
    // System random for organic wave variation (matching web app's Math.random())
    // NOTE: Now using seeded RNG for determinism, matching web app's mulberry32
    private var rngFn: (() -> Double)?
    
    private func rng() -> Float {
        if let fn = rngFn {
            return Float(fn())
        }
        return Float.random(in: 0...1)  // Fallback if no seed set
    }
    
    private func randomRange(_ min: Float, _ max: Float) -> Float {
        return min + rng() * (max - min)
    }
    
    /// Set the RNG seed for deterministic wave generation (matches web app)
    func setSeed(_ seed: Int) {
        rngFn = mulberry32(UInt32(seed & 0xFFFFFFFF))
    }
    
    /// Wave envelope: attack² / peak / decay^1.5 (matching web app)
    private func waveEnvelope(_ phase: Float) -> Float {
        if phase < 0.25 {
            let t = phase / 0.25
            return t * t  // Attack
        } else if phase < 0.35 {
            return 1.0    // Peak
        } else {
            let t = (phase - 0.35) / 0.65
            return pow(1 - t, 1.5)  // Decay
        }
    }
    
    /// Foam envelope: active during middle of wave
    private func foamEnvelope(_ phase: Float) -> Float {
        if phase < 0.2 || phase > 0.6 { return 0 }
        let t = (phase - 0.2) / 0.4
        return sin(t * .pi)
    }
    
    private func startNewWave(_ gen: inout WaveGenerator) {
        gen.wave = Wave(
            active: true,
            phase: 0,
            duration: Int(sampleRate * randomRange(waveDurationMin, waveDurationMax)),
            amplitude: 0.6 + rng() * 0.4,
            panOffset: (rng() - 0.5) * 0.8,
            foam: randomRange(foamMin, foamMax),
            depth: randomRange(depthMin, depthMax)
        )
        gen.timeSinceLastWave = 0
    }
    
    private func generateStereoSample() -> (Float, Float) {
        var sampleL: Float = 0
        var sampleR: Float = 0
        var foamL: Float = 0
        var foamR: Float = 0
        var depthAmount: Float = 0
        
        // === Process Generator 1 ===
        gen1.timeSinceLastWave += 1
        if !gen1.wave.active && gen1.timeSinceLastWave >= gen1.nextWaveInterval {
            startNewWave(&gen1)
            gen1.nextWaveInterval = Int(sampleRate * randomRange(waveIntervalMin, waveIntervalMax))
        }
        
        if gen1.wave.active {
            gen1.wave.phase += 1.0 / Float(gen1.wave.duration)
            
            if gen1.wave.phase >= 1 {
                gen1.wave.active = false
            } else {
                let env = waveEnvelope(gen1.wave.phase) * gen1.wave.amplitude
                let foamEnv = foamEnvelope(gen1.wave.phase) * gen1.wave.amplitude
                
                // Filtered noise for wave body
                let noise = (rng() - 0.5) * 2
                gen1.lpfStateL += (noise - gen1.lpfStateL) * 0.03
                let noiseR = (rng() - 0.5) * 2
                gen1.lpfStateR += (noiseR - gen1.lpfStateR) * 0.03
                
                let panL = 0.5 + gen1.wave.panOffset * 0.5
                let panR = 0.5 - gen1.wave.panOffset * 0.5
                
                sampleL += gen1.lpfStateL * env * panL
                sampleR += gen1.lpfStateR * env * panR
                
                // Foam
                let foamNoise = (rng() - 0.5) * 2
                foamL += foamNoise * foamEnv * panL * 0.5 * gen1.wave.foam
                foamR += foamNoise * foamEnv * panR * 0.5 * gen1.wave.foam
                
                depthAmount += env * gen1.wave.depth
            }
        }
        
        // === Process Generator 2 ===
        gen2.timeSinceLastWave += 1
        if !gen2.wave.active && gen2.timeSinceLastWave >= gen2.nextWaveInterval {
            startNewWave(&gen2)
            let wave2Offset = randomRange(2, 6)
            gen2.nextWaveInterval = Int(sampleRate * (randomRange(waveIntervalMin, waveIntervalMax) + wave2Offset))
        }
        
        if gen2.wave.active {
            gen2.wave.phase += 1.0 / Float(gen2.wave.duration)
            
            if gen2.wave.phase >= 1 {
                gen2.wave.active = false
            } else {
                let env = waveEnvelope(gen2.wave.phase) * gen2.wave.amplitude * 0.7
                let foamEnv = foamEnvelope(gen2.wave.phase) * gen2.wave.amplitude * 0.7
                
                let noise = (rng() - 0.5) * 2
                gen2.lpfStateL += (noise - gen2.lpfStateL) * 0.04
                let noiseR = (rng() - 0.5) * 2
                gen2.lpfStateR += (noiseR - gen2.lpfStateR) * 0.04
                
                // Opposite pan from gen1
                let panL = 0.5 - gen2.wave.panOffset * 0.5
                let panR = 0.5 + gen2.wave.panOffset * 0.5
                
                sampleL += gen2.lpfStateL * env * panL
                sampleR += gen2.lpfStateR * env * panR
                
                let foamNoise = (rng() - 0.5) * 2
                foamL += foamNoise * foamEnv * panL * 0.4 * gen2.wave.foam
                foamR += foamNoise * foamEnv * panR * 0.4 * gen2.wave.foam
                
                depthAmount += env * gen2.wave.depth
            }
        }
        
        // === Deep rumble layer ===
        let rumbleNoise = (rng() - 0.5) * 2
        rumbleLpfL += (rumbleNoise - rumbleLpfL) * 0.005
        rumbleLpfR += ((rng() - 0.5) * 2 - rumbleLpfR) * 0.005
        
        // === Foam filtering ===
        foamLpfL += (foamL - foamLpfL) * 0.3
        foamLpfR += (foamR - foamLpfR) * 0.3
        
        // === Combine layers ===
        let avgDepth = (depthMin + depthMax) / 2
        let combinedL = sampleL + rumbleLpfL * (depthAmount + avgDepth * 0.2) * 0.4 + foamLpfL
        let combinedR = sampleR + rumbleLpfR * (depthAmount + avgDepth * 0.2) * 0.4 + foamLpfR
        
        // === Master lowpass ===
        masterLpfL += (combinedL - masterLpfL) * 0.35
        masterLpfR += (combinedR - masterLpfR) * 0.35
        
        // === DC blocking highpass ===
        masterHpfL += (masterLpfL - masterHpfL) * 0.0005
        masterHpfR += (masterLpfR - masterHpfR) * 0.0005
        
        // === Final output with soft clipping ===
        let finalL = (masterLpfL - masterHpfL) * intensity * 0.6
        let finalR = (masterLpfR - masterHpfR) * intensity * 0.6
        
        return (tanh(finalL) * level, tanh(finalR) * level)
    }
    
    // MARK: - Public Interface
    
    func setEnabled(_ enabled: Bool) {
        self.enabled = enabled
    }
    
    func setLevel(_ level: Float) {
        self.level = min(max(level, 0), 1)
    }
    
    func setIntensity(_ intensity: Float) {
        self.intensity = min(max(intensity, 0), 1)
    }
    
    func setWaveDuration(min: Float, max: Float) {
        self.waveDurationMin = Swift.max(min, 2)
        self.waveDurationMax = Swift.max(max, waveDurationMin + 1)
    }
    
    func setWaveInterval(min: Float, max: Float) {
        self.waveIntervalMin = Swift.max(min, 3)
        self.waveIntervalMax = Swift.max(max, waveIntervalMin + 1)
    }
    
    func setFoam(min: Float, max: Float) {
        self.foamMin = Swift.min(Swift.max(min, 0), 1)
        self.foamMax = Swift.min(Swift.max(max, 0), 1)
    }
    
    func setDepth(min: Float, max: Float) {
        self.depthMin = Swift.min(Swift.max(min, 0), 1)
        self.depthMax = Swift.min(Swift.max(max, 0), 1)
    }
}
