import type { ProductCoreUnavailableError } from '../../audio/product/runtime/createProductionProductEngine';

export function ProductCoreUnavailableScreen({ error }: { error: ProductCoreUnavailableError }) {
  return (
    <main role="alert" className="product-core-unavailable">
      <h1>Audio engine unavailable</h1>
      <p>Kessho requires Product Core for production playback. The app did not start a fallback engine.</p>
      <details>
        <summary>Diagnostic details</summary>
        <code>{error.code}: {error.message}</code>
      </details>
    </main>
  );
}
