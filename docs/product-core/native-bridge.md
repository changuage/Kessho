# Product Core Native Bridge Scope

Product Core is intended to be the shared audio engine for web and native targets, but the active release scope is the web `core-product` runtime.

## Current Decision

Native Product runtime is out of active web-default release scope.

The repository must not report the native bridge as implemented until the native audio render path exists, is tested, and is included in Product Core CI. `native-product` and `test-product` runtime query modes are placeholders only: development builds throw if they are selected, and production builds resolve back to `core-product`.

`ProductEnginePort.getCapabilityReport()` must continue to report `supportsNativeBridge: false` and `nativeBridge: deferred-for-web-default` until the native render, asset, telemetry, and CI requirements below are complete.

## Required Before Enabling

- Native build output for the Product Core C ABI.
- Platform audio render adapter that calls Product Core directly on the realtime audio thread.
- Snapshot and Product event round-trip tests using the same generated Product contract as the web runtime.
- Asset registration and telemetry copy tests for the native host.
- CI coverage for native ABI layout, offline render smoke, event/snapshot routing, asset registration, and telemetry.
- `supports_native_bridge` may be set to `1` only after the native bridge tests above pass.

## Non-Goals For Web Default

- Do not send realtime audio buffers over the Capacitor JavaScript bridge.
- Do not treat the archived SwiftUI proof as active Product Core CI coverage.
- Do not add native-only product commands that bypass `ProductEnginePort`.
- Do not use `web-ts` as a native fallback.

## Release Contract

For the web-default release, native bridge status is explicitly deferred with signoff. The release blocker is satisfied by documenting the deferral, keeping unimplemented runtime modes guarded, and preventing capability reports or CI from implying native support.
