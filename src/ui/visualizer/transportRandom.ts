import { mulberry32 } from '../../audio/rng';
import {
  TRANSPORT_CONTROL_DEFINITIONS,
  TRANSPORT_DEFAULT_CONTROLS,
  normalizeTransportControls,
  type TransportControlDefinition,
  type TransportControls,
} from './visualizerTransportSchema';

const RANDOM_FIXED_CONTROLS = new Set<TransportControlDefinition['key']>([
  'medium', 'hybrid', 'motion', 'react', 'sunTaps', 'octaves', 'layers', 'apShape', 'leafTiers',
]);

export function createRandomTransportControls(seed: number): TransportControls {
  const random = mulberry32(seed >>> 0);
  const controls = normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS);
  for (const definition of TRANSPORT_CONTROL_DEFINITIONS) {
    if (RANDOM_FIXED_CONTROLS.has(definition.key)) continue;
    const minimum = definition.key === 'exposure' ? 1.25
      : definition.key === 'albedo' ? 0.5
      : definition.key === 'skyFill' ? 0.18
      : definition.key === 'waterBrilliance' ? 0.25
      : definition.min;
    const maximum = definition.key === 'contrast' ? 0.75
      : definition.key === 'vignette' ? 0.8
      : definition.max;
    const value = minimum + random() * (maximum - minimum);
    controls[definition.key] = definition.step === 1 ? Math.round(value) : value;
  }
  controls.medium = random() * 2 - 1;
  controls.hybrid = random() * 0.5;
  controls.motion = 0.2 + random() * 0.5;
  controls.react = 0.3 + random() * 0.7;
  controls.apShape = random() < 0.45 ? 1 + Math.floor(random() * 3) : 0;
  if (controls.apShape > 0) controls.apSpill = Math.max(0.12, controls.apSpill);
  return controls;
}
