# Host Diagnostics

Product Core host diagnostics make fallback removal observable. Runtime behavior that is not backed by Product Core should either have a Product implementation path or crash at the explicit unsupported boundary.

## Counters

The host diagnostics surface tracks:

- `unsupportedControlCount`
- `unsupportedGetterCount`
- `runtimeFallbackDiagnosticCount`
- `audioCriticalFallbackCount`
- `dirtyDiffCount`
- `fullSnapshotReloadCount`
- `snapshotReloadCpuMs`
- `lastSnapshotReloadReason`

Production scripted interactions must keep unsupported and runtime fallback counters at zero. Any nonzero value is a release signal, not a value to smooth over in UI code.

## Snapshot Reloads

Full snapshot reloads are allowed only for classified structural changes, such as asset references, source identity, lane shape changes, manual step masks, and unsupported lane fields. Routine controls should use generated Product events or dirty snapshot diffs.

## Verification

- `npm run core:product:runtime-fallbacks`
- `npm run core:product:getter-policies`
- `npm run migration:unsupported-surface:gate`
- `npm run core:product:dirty-diff`
- `npm run core:product:host-reconciliation`
- `npm run core:product:browser-runtime`
