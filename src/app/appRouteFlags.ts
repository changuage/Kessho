export function isSonicParityRoute(): boolean {
  return readSearchFlag('parity');
}

export function isMobileWebEvidenceRoute(): boolean {
  return readSearchFlag('mobileEvidence');
}

export function isSnowflakePrototypeRoute(): boolean {
  return readSearchFlag('snowflakePrototype');
}

export function isSnowflakeGeneratorRoute(): boolean {
  return readSearchFlag('snowflakeGenerator');
}

export function clearSnowflakeGeneratorRoute(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('snowflakeGenerator');
  const nextSearch = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`);
}

export function clearSnowflakePrototypeRoute(): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
}

function readSearchFlag(name: string): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(name) === '1';
}
