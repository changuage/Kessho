# web-ts Reference Engine

`web-ts` is the legacy TypeScript/Web Audio engine. It remains in the repository as a reference implementation during migration.

Allowed uses:

- parity and regression probes;
- browser comparison tools;
- migration harnesses;
- development-only engine switching.

Disallowed uses:

- production runtime default;
- Product Core fallback for missing behavior;
- production UI contracts that require Web Audio node access;
- silent replacement for Product Core crashes.

The production runtime default is `core-product`. Remaining `web-ts` access should move behind explicit reference harnesses and should not be used to justify keeping unsupported Product Core host methods alive.

`npm run migration:no-web-ts-bundle` scans the production build output for forbidden legacy runtime markers after `npm run build`.
