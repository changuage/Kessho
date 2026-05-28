import { getProductEngineRuntimeMode } from './ProductEngineProxy';

export type AudioEngineRuntimeMode = 'web-ts' | 'core-product' | 'core-smoke';

const PRODUCT_AUDIO_ENGINE_RUNTIME_MODES = ['core-product'] as const satisfies readonly AudioEngineRuntimeMode[];
const REFERENCE_AUDIO_ENGINE_RUNTIME_MODES = ['core-product', 'web-ts', 'core-smoke'] as const satisfies readonly AudioEngineRuntimeMode[];
export const AUDIO_ENGINE_PARAM = 'engine';
export const AUDIO_ENGINE_SWITCHER_PARAM = 'engineAB';

function isDevRuntime(): boolean {
  return Boolean((import.meta.env as unknown as { DEV?: boolean }).DEV);
}

function normalizeReferenceRuntimeMode(mode: string | null): AudioEngineRuntimeMode | null {
  if (mode === 'web-ts' || mode === 'web-audio') return 'web-ts';
  if (mode === 'core-smoke') return 'core-smoke';
  return null;
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isReferenceRuntimeEnabled(params: URLSearchParams): boolean {
  return (
    isLocalDevHost() ||
    params.get(AUDIO_ENGINE_SWITCHER_PARAM) === '1' ||
    params.get('parity') === '1' ||
    normalizeReferenceRuntimeMode(params.get(AUDIO_ENGINE_PARAM)) !== null
  );
}

function getProductionAudioEngineRuntimeMode(): Extract<AudioEngineRuntimeMode, 'core-product'> {
  const mode = getProductEngineRuntimeMode();
  if (mode !== 'core-product') {
    throw new Error(`${mode} runtime is not implemented as a production audio engine mode`);
  }
  return mode;
}

export function getAudioEngineRuntimeMode(): AudioEngineRuntimeMode {
  if (typeof window === 'undefined') return getProductionAudioEngineRuntimeMode();
  if (!isDevRuntime()) return getProductionAudioEngineRuntimeMode();
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get(AUDIO_ENGINE_PARAM);
    if (mode === 'core-product') return getProductionAudioEngineRuntimeMode();
    if (mode === 'native-product' || mode === 'test-product') return getProductionAudioEngineRuntimeMode();
    const referenceMode = normalizeReferenceRuntimeMode(mode);
    if (referenceMode && isReferenceRuntimeEnabled(params)) return referenceMode;
    return getProductionAudioEngineRuntimeMode();
  } catch {
    return getProductionAudioEngineRuntimeMode();
  }
}

export function getAudioEngineRuntimeModes(): readonly AudioEngineRuntimeMode[] {
  if (typeof window === 'undefined') return PRODUCT_AUDIO_ENGINE_RUNTIME_MODES;
  if (!isDevRuntime()) return PRODUCT_AUDIO_ENGINE_RUNTIME_MODES;
  try {
    const params = new URLSearchParams(window.location.search);
    return isReferenceRuntimeEnabled(params) ? REFERENCE_AUDIO_ENGINE_RUNTIME_MODES : PRODUCT_AUDIO_ENGINE_RUNTIME_MODES;
  } catch {
    return PRODUCT_AUDIO_ENGINE_RUNTIME_MODES;
  }
}
