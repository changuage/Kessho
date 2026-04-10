export function isIOSLikeDevice(nav: Navigator = navigator): boolean {
  const userAgent = nav.userAgent || '';
  const platform = nav.platform || '';
  const maxTouchPoints = nav.maxTouchPoints ?? 0;

  return /iPad|iPhone|iPod/.test(userAgent) || (/^Mac/.test(platform) && maxTouchPoints > 1);
}

export function isMobileDevice(nav: Navigator = navigator): boolean {
  const userAgent = nav.userAgent || '';
  return isIOSLikeDevice(nav) || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}
