const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

class DynamicsDegradeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'alias', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'generation', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'corrosion', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'wear', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.held = [];
    this.phase = [];
    this.lowpass = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const enabled = (parameters.enabled?.[0] ?? 0) > 0.5;
    const mix = clamp01(parameters.mix?.[0] ?? 0);
    const alias = clamp01(parameters.alias?.[0] ?? 0);
    const generation = clamp01(parameters.generation?.[0] ?? 0);
    const corrosion = clamp01(parameters.corrosion?.[0] ?? 0);
    const wear = clamp01(parameters.wear?.[0] ?? 0);

    if (!input || input.length === 0 || !enabled || mix <= 0.0001) {
      for (let channel = 0; channel < output.length; channel++) {
        const source = input?.[channel] ?? input?.[0];
        if (source) output[channel].set(source);
        else output[channel].fill(0);
      }
      return true;
    }

    const aliasFocus = Math.pow(alias, 1.35);
    const destructive = clamp01(aliasFocus * (0.6 + corrosion * 0.55));
    const damage = clamp01(aliasFocus * 0.34 + generation * 0.2 + corrosion * 0.14);
    const rateRatio = Math.max(0.2, 1 / (1 + aliasFocus * 3.2 + generation * 0.7 + corrosion * 0.55));
    const bitDepth = Math.max(9, 16 - aliasFocus * 3.2 - generation * 1.1 - corrosion * 1.1);
    const quantSteps = Math.max(8, Math.pow(2, bitDepth));
    const cutoffHz = Math.max(1500, sampleRate * 0.45 * (1 - wear * 0.46 - generation * 0.24 - corrosion * 0.1));
    const alpha = Math.min(1, 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate));
    const fold = 1 + corrosion * 0.58 + generation * 0.2 + destructive * 0.34;

    for (let channel = 0; channel < output.length; channel++) {
      const source = input[channel] ?? input[0];
      const dest = output[channel];
      if (!source) {
        dest.fill(0);
        continue;
      }

      let held = this.held[channel] ?? 0;
      let phase = this.phase[channel] ?? 1;
      let lp = this.lowpass[channel] ?? 0;

      for (let i = 0; i < dest.length; i++) {
        const dry = source[i] || 0;
        phase += rateRatio;
        if (phase >= 1) {
          phase -= Math.floor(phase);
          held = dry;
        }

        let wet = Math.round(held * quantSteps) / quantSteps;
        wet = Math.tanh(wet * fold) / Math.tanh(fold);
        lp += (wet - lp) * alpha;
        wet = lp + (wet - lp) * (0.08 + damage * 0.18 + destructive * 0.18);
        dest[i] = dry + (wet - dry) * mix;
      }

      this.held[channel] = held;
      this.phase[channel] = phase;
      this.lowpass[channel] = lp;
    }

    return true;
  }
}

try {
  registerProcessor('dynamics-degrade', DynamicsDegradeProcessor);
} catch (error) {
  if (error?.name !== 'NotSupportedError') throw error;
}
