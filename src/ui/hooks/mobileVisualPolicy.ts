export const MOBILE_VISUAL_QUERY = '(max-width: 767px), (pointer: coarse)';

const mediaQueries = new WeakMap<Window, MediaQueryList | null>();

export function getMobileVisualMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;

  if (mediaQueries.has(window)) return mediaQueries.get(window) ?? null;

  try {
    const media = window.matchMedia(MOBILE_VISUAL_QUERY);
    mediaQueries.set(window, media);
    return media;
  } catch {
    mediaQueries.set(window, null);
    return null;
  }
}

export function isMobileVisualViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 767 || Boolean(getMobileVisualMediaQuery()?.matches);
}
