// Minimal test worklet - just outputs a sine wave
class TestToneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.playing = false;
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this.playing = true;
        console.log('TestToneProcessor: started');
      } else if (e.data.type === 'stop') {
        this.playing = false;
      }
    };
    
    console.log('TestToneProcessor: constructor complete');
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    
    const outL = output[0];
    const outR = output[1];
    
    for (let i = 0; i < outL.length; i++) {
      if (this.playing) {
        // 440 Hz sine wave
        this.phase += 440 / sampleRate;
        if (this.phase >= 1) this.phase -= 1;
        const sample = Math.sin(this.phase * 2 * Math.PI) * 0.3;
        outL[i] = sample;
        outR[i] = sample;
      } else {
        outL[i] = 0;
        outR[i] = 0;
      }
    }
    
    return true;
  }
}

registerProcessor('test-tone-processor', TestToneProcessor);
