# Migration Status

The web-ts to product-core migration is operating in fast behavioral port mode. The target is user-visible behavioral parity with the old web-ts app through product-core APIs, not a 1:1 port of web-ts internals.

Current runtime ownership rule:

- Production app code reaches audio through `ProductEnginePort` / `productEngine`.
- `WebProductEngine` is the temporary web adapter for the product runtime.
- `coreProductEngineHost` and `src/audio/product/host/*` own product host internals.
- `web-ts` stays reference/parity only and is not a production runtime.
