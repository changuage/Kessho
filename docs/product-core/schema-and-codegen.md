# Product Schema And Codegen

Product schemas live under `cpp/KesshoCore/schema/` and are the authority for stable Product IDs, defaults, generated constants, Product events, snapshot ABI fields, source preset metadata, and parameter accounting.

## Inputs

- `cpp/KesshoCore/schema/kessho_product.schema.json`
- `cpp/KesshoCore/schema/kessho_product_events.schema.json`
- `cpp/KesshoCore/schema/kessho_product_params.schema.json`

## Generated Outputs

- `cpp/KesshoCore/generated/KesshoProductSchemaHash.h`
- `cpp/KesshoCore/generated/KesshoProductSchema.h`
- `cpp/KesshoCore/generated/KesshoProductDefaults.h`
- `cpp/KesshoCore/generated/KesshoProductParamIds.h`
- `cpp/KesshoCore/generated/KesshoProductEventIds.h`
- `src/audio/generated/kesshoProductSchema.ts`
- `src/audio/generated/kesshoProductParams.ts`
- `src/audio/generated/kesshoProductEvents.ts`

Generated files are regenerated with `npm run core:product:generate` and verified by `npm run core:product:schema`.

## Rules

- Do not hand-maintain Product parameter IDs that exist in schema.
- Do not add Product defaults outside schema when a schema field already exists.
- Common live controls should travel as generated Product events or generated snapshot fields.
- Product schema hash changes require generated file updates and ABI/runtime verification.

## Remaining Direction

Native bridge structs should be generated from the same schema before a native Product release. Until then, native Product release remains out of active web-default scope and must not be reported as implemented in the capability report.
