export function isSonicParityRoute(): boolean {
  return readSearchFlag('parity');
}

export function isMobileWebEvidenceRoute(): boolean {
  return readSearchFlag('mobileEvidence');
}

function readSearchFlag(name: string): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(name) === '1';
}
