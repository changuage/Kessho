import { useEffect, useState } from 'react';
import {
  getMobileVisualMediaQuery,
  isMobileVisualViewport,
} from './mobileVisualPolicy';

function readQuery(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return isMobileVisualViewport();
}

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(readQuery);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = getMobileVisualMediaQuery();
    if (!media) return;
    const update = () => setIsMobile(isMobileVisualViewport());
    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return isMobile;
}
