type ModeMap = Readonly<Record<string, number>>;

function mappedModeId(value: unknown, values: ModeMap, fallback: number): number {
  return typeof value === 'string' ? values[value] ?? fallback : fallback;
}

export function delayAFilterTypeId(value: unknown): number {
  return mappedModeId(value, { highpass: 1, bandpass: 2 }, 0);
}

export function delayBPatternId(value: unknown): number {
  return mappedModeId(value, { golden: 1, mirror: 2, dotted: 3 }, 0);
}

export function delayBTapeSpacingId(value: unknown): number {
  return mappedModeId(value, { triplet: 1, golden: 2, silver: 3 }, 0);
}

export function delayBWarpId(value: unknown): number {
  return mappedModeId(value, { filterSweep: 1, pitchDrift: 2, grainCrossfade: 3 }, 0);
}

export function reverbTypeId(value: unknown): number {
  return mappedModeId(value, { plate: 0, hall: 1, darkHall: 3, dattorroPlate: 4, dattorroShimmer: 5 }, 2);
}

export function reverbQualityId(value: unknown): number {
  return mappedModeId(value, { ultra: 0, lite: 2 }, 1);
}

export function reverbModCharacterId(value: unknown): number {
  return mappedModeId(value, { sine: 0, drift: 1 }, 2);
}

export function reverbSaturationModeId(value: unknown): number {
  return mappedModeId(value, { tape: 1, tube: 2 }, 0);
}

export function dynamicsCharacterModeId(value: unknown): number {
  return mappedModeId(value, { abyssWater: 1, shallowWater: 2 }, 0);
}

export function dynamicsCharacterQualityId(value: unknown): number {
  return mappedModeId(value, { eco: 0, hq: 2 }, 1);
}

export function dynamicsDegradeQualityId(value: unknown): number {
  return mappedModeId(value, { classic: 0, hq: 2 }, 1);
}

export function dynamicsEndCompModeId(value: unknown): number {
  return mappedModeId(value, { clarity: 1, glue: 2, punch: 3, twoBand: 4 }, 0);
}

export function dynamicsSaturationModeId(value: unknown): number {
  return mappedModeId(value, { tape: 1, tube: 2, diode: 3, fold: 4 }, 0);
}

export function dynamicsSaturationQualityId(value: unknown): number {
  return mappedModeId(value, { eco: 0, hq: 2 }, 1);
}

export function sidechainKeyId(value: unknown): number {
  return mappedModeId(value, { sub: 1, kick: 2, click: 3, beepHi: 4, beepLo: 5, noise: 6, membrane: 7 }, 0);
}

export function granularShapeId(value: unknown): number {
  return mappedModeId(value, { sawUp: 1, sawDown: 2, square: 3 }, 0);
}

export function granularVoiceModeId(value: unknown): number {
  return mappedModeId(value, { clean: 0, legacy: 1 }, 1);
}

export function granularQualityId(value: unknown): number {
  return mappedModeId(value, { eco: 0, hq: 2 }, 1);
}

export function granularPitchModeId(value: unknown): number {
  return mappedModeId(value, { octaves: 1, fifths: 2, chord: 3, scale: 4, free: 5 }, 0);
}

export function granularCloudStyleId(value: unknown): number {
  return mappedModeId(value, { mosaic: 1, bloom: 2, tide: 3, orbit: 4, stars: 5 }, 0);
}

export function granularAnchorPatternId(value: unknown): number {
  return mappedModeId(value, { reverse: 1, pendulum: 2, random: 3 }, 0);
}

export function granularLegacyPitchModeId(value: unknown): number {
  return value === 'random' ? 0 : 1;
}
