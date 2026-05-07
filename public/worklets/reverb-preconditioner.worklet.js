class ReverbPreconditionerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdDb = -36;
    this.kneeDb = 20;
    this.ratio = 5;
    this.attackMs = 0.7;
    this.releaseMs = 700;
    this.inputMakeupGain = 2.9;
    this.gain = 1;
    this.attackCoeff = 0;
    this.releaseCoeff = 0;
    this.nativeAutoMakeup = 1;
    this.configure({});
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'params') {
      this.configure(message);
    } else if (message.type === 'reset') {
      this.gain = 1;
    }
  }

  configure(message) {
    this.thresholdDb = this.bound(message.thresholdDb, this.thresholdDb, -60, 0);
    this.kneeDb = this.bound(message.kneeDb, this.kneeDb, 0, 40);
    this.ratio = this.bound(message.ratio, this.ratio, 1, 20);
    this.attackMs = this.bound(message.attackMs, this.attackMs, 0.1, 30);
    this.releaseMs = this.bound(message.releaseMs, this.releaseMs, 20, 1000);
    this.inputMakeupGain = this.bound(message.inputMakeupGain, this.inputMakeupGain, 0.5, 4);
    this.attackCoeff = Math.exp(-1 / Math.max(1, (this.attackMs / 1000) * sampleRate));
    this.releaseCoeff = Math.exp(-1 / Math.max(1, (this.releaseMs / 1000) * sampleRate));
    const ratioDepth = Math.max(0, Math.min(1, (this.ratio - 1) / 4));
    this.nativeAutoMakeup = 1 + ratioDepth * 0.18;
  }

  bound(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  compressorGainDbForLevel(levelDb) {
    const threshold = this.thresholdDb;
    const knee = this.kneeDb;
    const ratio = this.ratio;
    if (ratio <= 1) return 0;
    const strength = 0.04;
    if (knee <= 0) {
      if (levelDb <= threshold) return 0;
      return ((threshold + (levelDb - threshold) / ratio) - levelDb) * strength;
    }

    const lower = threshold - knee * 0.5;
    const upper = threshold + knee * 0.5;
    if (levelDb <= lower) return 0;
    if (levelDb >= upper) {
      return ((threshold + (levelDb - threshold) / ratio) - levelDb) * strength;
    }

    const x = levelDb - lower;
    return ((1 / ratio) - 1) * x * x / (2 * knee) * strength;
  }

  processGain(left, right) {
    const detector = Math.max(Math.abs(left), Math.abs(right), 1e-9);
    const levelDb = 20 * Math.log10(detector);
    const targetGain = Math.pow(10, this.compressorGainDbForLevel(levelDb) / 20);
    const coeff = targetGain < this.gain ? this.attackCoeff : this.releaseCoeff;
    this.gain = targetGain + (this.gain - targetGain) * coeff;
    return this.gain * this.nativeAutoMakeup;
  }

  softLimit(value) {
    const limit = 1.047;
    const abs = Math.abs(value);
    if (abs <= limit) return value;
    return Math.sign(value) * (limit + Math.tanh((abs - limit) * 6) * 0.005);
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const inLeft = input[0];
    const inRight = input[1] || inLeft;
    const outLeft = output[0];
    const outRight = output[1] || outLeft;
    if (!outLeft) return true;

    for (let i = 0; i < outLeft.length; i += 1) {
      const left = inLeft?.[i] || 0;
      const right = inRight?.[i] || 0;
      const gain = this.processGain(left, right) * this.inputMakeupGain;
      outLeft[i] = this.softLimit(left * gain);
      if (outRight) outRight[i] = this.softLimit(right * gain);
    }
    return true;
  }
}

registerProcessor('reverb-preconditioner', ReverbPreconditionerProcessor);
