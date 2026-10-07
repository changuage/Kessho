export const PAGE_CPU_VITE_DISABLE_HMR_ENV = 'KESSHO_VITE_DISABLE_HMR';
export const PAGE_CPU_LEGACY_VITE_DISABLE_HMR_ENV = 'KESSHO_SEQUENCER_UI_PROOF_DISABLE_HMR';
export const PAGE_CPU_VITE_CACHE_DIR_ENV = 'KESSHO_VITE_CACHE_DIR';
export const PAGE_CPU_MAX_TRANSIENT_RETRIES = 1;
export const PAGE_CPU_DEFAULT_BROWSER_PROFILE = 'desktop';
export const PAGE_CPU_BROWSER_PROFILES = Object.freeze({
  // An omitted Playwright context uses the same desktop defaults as before.
  desktop: Object.freeze({ id: 'desktop', label: 'Desktop', context: undefined }),
  phone: Object.freeze({
    id: 'phone',
    label: 'Phone',
    context: Object.freeze({
      viewport: Object.freeze({ width: 390, height: 844 }),
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }),
  }),
  tablet: Object.freeze({
    id: 'tablet',
    label: 'Tablet (coarse pointer)',
    context: Object.freeze({
      viewport: Object.freeze({ width: 1024, height: 1366 }),
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    }),
  }),
});

export function parsePageCpuBrowserProfile(value) {
  const profile = value == null
    ? PAGE_CPU_DEFAULT_BROWSER_PROFILE
    : String(value).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PAGE_CPU_BROWSER_PROFILES, profile)) {
    throw new Error(`Unknown browser profile: ${profile}. Known: ${Object.keys(PAGE_CPU_BROWSER_PROFILES).join(', ')}`);
  }
  return profile;
}

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
