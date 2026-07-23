export const PAGE_CPU_VITE_DISABLE_HMR_ENV = 'KESSHO_VITE_DISABLE_HMR';
export const PAGE_CPU_LEGACY_VITE_DISABLE_HMR_ENV = 'KESSHO_SEQUENCER_UI_PROOF_DISABLE_HMR';
export const PAGE_CPU_VITE_CACHE_DIR_ENV = 'KESSHO_VITE_CACHE_DIR';
export const PAGE_CPU_MAX_TRANSIENT_RETRIES = 1;

export function createPageCpuViteEnv(baseEnv, cacheDir) {
  return {
    ...baseEnv,
    BROWSER: 'none',
    [PAGE_CPU_VITE_DISABLE_HMR_ENV]: '1',
    [PAGE_CPU_LEGACY_VITE_DISABLE_HMR_ENV]: '1',
    [PAGE_CPU_VITE_CACHE_DIR_ENV]: cacheDir,
  };
}

/**
 * Only classify failures which are known to be caused by a page/context race
 * or an audio startup race. Everything else remains a hard measurement error.
 */
export function classifyPageCpuTransientError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/execution context was destroyed|no execution context available|cannot find context with specified id/i.test(message)) {
    return 'execution-context-destroyed';
  }
  if (
    /timed out waiting for product snapshot revision\s*-1\b[^\n]*to be applied/i.test(message) ||
    /product snapshot.*revision\s*-1.*tim(?:e|ed) out/i.test(message)
  ) {
    return 'initial-product-snapshot-revision-minus-one-timeout';
  }
  if (/capture\s+(?:rms|peak) stayed silent/i.test(message)) {
    return 'silent-capture';
  }
  return null;
}

export function createPageCpuRetryEntry({ attempt, status, error, reason = null }) {
  return {
    attempt,
    status,
    transient: Boolean(reason),
    reason,
    error: error instanceof Error ? error.message : error == null ? null : String(error),
  };
}

export function shouldRetryPageCpuAttempt({ attempt, reason }) {
  return Boolean(reason) && Number.isInteger(attempt) && attempt <= PAGE_CPU_MAX_TRANSIENT_RETRIES;
}
