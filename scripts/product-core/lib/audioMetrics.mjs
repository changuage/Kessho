export function assertBelow(name, value, threshold) {
  if (!Number.isFinite(value) || value >= threshold) {
    throw new Error(`${name} ${value} must be below ${threshold}`);
  }
}

export function countNonFinite(samples) {
  let count = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) count += 1;
  }
  return count;
}

export function maxAbs(samples) {
  let peak = 0;
  for (const sample of samples) {
    if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

export function maxSampleDelta(samples) {
  let maxDelta = 0;
  let previous = null;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;
    if (previous !== null) maxDelta = Math.max(maxDelta, Math.abs(sample - previous));
    previous = sample;
  }
  return maxDelta;
}

export function rms(samples) {
  let sumSquares = 0;
  let count = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;
    sumSquares += sample * sample;
    count += 1;
  }
  return Math.sqrt(sumSquares / Math.max(1, count));
}

export function windowedRms(samples, windowSize) {
  const size = Math.max(1, Math.trunc(windowSize));
  const windows = [];
  for (let offset = 0; offset < samples.length; offset += size) {
    windows.push(rms(samples.slice(offset, offset + size)));
  }
  return windows;
}

export function detectImpulseBurst(samples, threshold) {
  const bursts = [];
  let active = false;
  let start = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(Number.isFinite(samples[index]) ? samples[index] : 0);
    if (value >= threshold) {
      if (!active) {
        active = true;
        start = index;
        peak = value;
      } else {
        peak = Math.max(peak, value);
      }
    } else if (active) {
      bursts.push({ start, end: index - 1, peak });
      active = false;
    }
  }
  if (active) bursts.push({ start, end: samples.length - 1, peak });
  return bursts;
}

export function estimateTailDecayCurve(samples, sampleRate, options = {}) {
  const windowMs = options.windowMs ?? 50;
  const windowSize = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  return windowedRms(samples, windowSize).map((value, index) => ({
    timeSeconds: (index * windowSize) / sampleRate,
    rms: value,
  }));
}

export function roundMetric(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function percentile(values, ratio) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.floor((finite.length - 1) * ratio)));
  return finite[index];
}

export function sampleStats(samples, options = {}) {
  const silenceThreshold = options.silenceThreshold ?? 1e-5;
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let nonFiniteCount = 0;
  let denormalCount = 0;
  let maxAdjacentDelta = 0;
  let maxFrameDelta = 0;
  let silentRun = 0;
  let maxSilentRunFrames = 0;
  let previous = null;
  let meanAbsSum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    if (!Number.isFinite(value)) {
      nonFiniteCount += 1;
      continue;
    }
    const abs = Math.abs(value);
    peak = Math.max(peak, abs);
    sumSquares += value * value;
    sum += value;
    meanAbsSum += abs;
    if (abs > 0 && abs < 1e-30) denormalCount += 1;
    if (previous !== null) maxAdjacentDelta = Math.max(maxAdjacentDelta, Math.abs(value - previous));
    if (index >= 2 && Number.isFinite(samples[index - 2])) {
      maxFrameDelta = Math.max(maxFrameDelta, Math.abs(value - samples[index - 2]));
    }
    previous = value;
    if (abs < silenceThreshold) {
      silentRun += 1;
      maxSilentRunFrames = Math.max(maxSilentRunFrames, Math.ceil(silentRun / 2));
    } else {
      silentRun = 0;
    }
  }

  const count = samples.length;
  return {
    count,
    nonFiniteCount,
    denormalCount,
    peak,
    rms: Math.sqrt(sumSquares / Math.max(1, count)),
    mean: sum / Math.max(1, count),
    meanAbs: count > 0 ? meanAbsSum / count : 0,
    maxAdjacentDelta,
    maxFrameDelta,
    maxSilentRunFrames,
  };
}

export function blockRms(samples) {
  let sumSquares = 0;
  for (const sample of samples) {
    if (Number.isFinite(sample)) sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / Math.max(1, samples.length));
}

export function maxBlockEdge(previousBlock, nextBlock) {
  if (!previousBlock || !nextBlock || previousBlock.length < 2 || nextBlock.length < 2) return 0;
  return Math.max(
    Math.abs(nextBlock[0] - previousBlock[previousBlock.length - 2]),
    Math.abs(nextBlock[1] - previousBlock[previousBlock.length - 1]),
  );
}
