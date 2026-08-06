/**
 * Browser URL policy for the standalone Point Clouds Product Core bundle.
 *
 * A direct file page and an opaque srcdoc frame cannot consume blob:null
 * subresources from AudioWorklet. The generated embedded asset contract keeps
 * byte-identical data URL forms for those origins while retaining blob URLs
 * for the regular HTTP path.
 */

export type EmbeddedProductCoreAssetLocation = {
  protocol?: string | null;
  origin?: string | null;
};

export function isFileOrOpaqueOrigin(
  location: EmbeddedProductCoreAssetLocation | null | undefined,
): boolean {
  return location?.protocol === 'file:' || location?.origin === 'null';
}

export function selectEmbeddedProductCoreAssetUrl(
  kind: 'worklet' | 'wasm',
  blobOrHttpUrl: string,
  dataUrl: string | undefined,
  directFileOrigin: boolean,
): string {
  if (!directFileOrigin) return blobOrHttpUrl;
  if (dataUrl && /^data:/i.test(dataUrl)) return dataUrl;
  // Keep the compatibility path for older generated assets only when they
  // already provide a safe URL. Never pass blob:null to AudioWorklet/fetch.
  if (/^data:/i.test(blobOrHttpUrl)) return blobOrHttpUrl;
  throw new Error(`Embedded Product Core ${kind} asset is missing a data URL for file/opaque origin`);
}
