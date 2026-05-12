# Kessho Product Patch Bridge Policy

## Scope

Exact Pad, Lead, and Drum parameter arrays are temporary parity bridges. They are allowed only while the Product Core finishes replacing legacy web/native tonal interpretation with generated Product Core preset IDs, generated Product Core preset metadata, and bounded user override fields.

This policy covers every exact patch count and array field currently present in C++, TypeScript, Swift, generated schema, module adapter patches, web snapshot encoding, and native snapshot encoding.

## Classification Values

- `CANONICAL_CORE_FIELD`: final Product Core-owned state, safe to keep as architecture.
- `TEMP_COMPAT_WEB_REFERENCE`: generated or adapter state copied from the web reference to preserve parity while Product Core reconstruction catches up.
- `TEMP_COMPAT_NATIVE_REFERENCE`: native-only compatibility state used to preserve ABI/snapshot shape while native is thin.
- `DEPRECATED_BRIDGE_FIELD`: host-authored exact patch state that must be retired and must not become the musical owner.

## Field Classification

| Field group | Concrete fields | Classification | Current owner | Retirement condition |
| --- | --- | --- | --- | --- |
| Generated source preset exact Pad patch | `KesshoProductGeneratedSourcePreset.exact_pad_param_count`, `KesshoProductGeneratedSourcePreset.exact_pad_params[0..52]`, `KesshoProductSourcePreset.exactPadParamCount`, `KesshoProductSourcePreset.exactPadParams[0..52]` | `TEMP_COMPAT_WEB_REFERENCE` | `scripts/generate-kessho-product-bindings.mjs`, generated C++/TS/Swift schema | Retire when C++ Product Core reconstructs every shipped Pad preset from generated Product Core preset IDs plus structured Product Core preset metadata and Pad preset probes pass without exact Pad arrays. |
| Generated source preset exact Lead patch | `KesshoProductGeneratedSourcePreset.exact_lead_param_count`, `KesshoProductGeneratedSourcePreset.exact_lead_params[0..79]`, `KesshoProductSourcePreset.exactLeadParamCount`, `KesshoProductSourcePreset.exactLeadParams[0..79]` | `TEMP_COMPAT_WEB_REFERENCE` | `scripts/generate-kessho-product-bindings.mjs`, generated C++/TS/Swift schema | Retire when C++ Product Core reconstructs every shipped Lead preset from generated Product Core preset IDs plus structured Product Core FM/operator/filter/envelope metadata and broader Lead preset probes pass without exact Lead arrays. |
| Generated source preset exact Drum patch | `KesshoProductGeneratedSourcePreset.exact_drum_param_count`, `KesshoProductGeneratedSourcePreset.exact_drum_params[0..125]`, `KesshoProductSourcePreset.exactDrumParamCount`, `KesshoProductSourcePreset.exactDrumParams[0..125]` | `TEMP_COMPAT_WEB_REFERENCE` | `scripts/generate-kessho-product-bindings.mjs`, generated C++/TS/Swift schema | Retire when C++ Product Core reconstructs Drum source patches from generated Drum voice preset IDs, voice morphs, and structured Product Core drum metadata, and Drum source probes pass without exact Drum arrays. |
| Product snapshot exact Pad override bridge | `KesshoProductSourceSnapshot.exact_pad_param_count`, `KesshoProductSourceSnapshot.exact_pad_params[0..52]`, `ProductSourceSnapshot.exactPadParamCount`, `ProductSourceSnapshot.exactPadParams[0..52]`, `NativeProductSourceSnapshot.exactPadParamCount`, `NativeProductSourceSnapshot.exactPadParams[0..52]` | `DEPRECATED_BRIDGE_FIELD` | Web/native snapshot adapters, serialized Product snapshot ABI | Retire when Pad user overrides are represented as generated Product Core source preset IDs plus bounded Product Core override fields or live Product Core events, and web/native snapshot builders no longer compute oscillator/filter/envelope tonal patches. |
| Product snapshot exact Lead override bridge | `KesshoProductSourceSnapshot.exact_lead_param_count`, `KesshoProductSourceSnapshot.exact_lead_params[0..79]`, `ProductSourceSnapshot.exactLeadParamCount`, `ProductSourceSnapshot.exactLeadParams[0..79]`, `NativeProductSourceSnapshot.exactLeadParamCount`, `NativeProductSourceSnapshot.exactLeadParams[0..79]` | `DEPRECATED_BRIDGE_FIELD` | Web/native snapshot adapters, serialized Product snapshot ABI | Retire when Lead user overrides are represented as generated Product Core source preset IDs plus bounded Product Core FM/operator/filter/envelope override fields or live Product Core events, and web/native snapshot builders no longer morph or interpret Lead tonal patches. |
| Product snapshot exact Drum override bridge | `KesshoProductSourceSnapshot.exact_drum_param_count`, `KesshoProductSourceSnapshot.exact_drum_params[0..125]`, `ProductSourceSnapshot.exactDrumParamCount`, `ProductSourceSnapshot.exactDrumParams[0..125]`, `NativeProductSourceSnapshot.exactDrumParamCount`, `NativeProductSourceSnapshot.exactDrumParams[0..125]` | `DEPRECATED_BRIDGE_FIELD` | Web/native snapshot adapters, serialized Product snapshot ABI | Retire when Drum user overrides are represented by generated Drum voice preset IDs, voice morphs, bounded Product Core drum override fields, and live Product Core events, with no host-authored exact Drum module patch arrays. |
| Shared module patch adapter exact Pad fields | `KesshoSourcePresetPatch.exact_pad_param_count`, `KesshoSourcePresetPatch.exact_pad_params[0..52]` | `TEMP_COMPAT_WEB_REFERENCE` | Product Core module adapter boundary | Retire when the generated exact Pad patch arrays retire and the shared Pad module accepts structured Product Core preset state directly. |
| Shared module patch adapter exact Lead fields | `KesshoSourcePresetPatch.exact_lead_param_count`, `KesshoSourcePresetPatch.exact_lead_params[0..79]` | `TEMP_COMPAT_WEB_REFERENCE` | Product Core module adapter boundary | Retire when the generated exact Lead patch arrays retire and the shared Lead module accepts structured Product Core preset state directly. |
| Shared module patch adapter exact Drum fields | `KesshoSourcePresetPatch.exact_drum_param_count`, `KesshoSourcePresetPatch.exact_drum_params[0..125]` | `TEMP_COMPAT_WEB_REFERENCE` | Product Core module adapter boundary | Retire when the generated exact Drum patch arrays retire and the shared Drum module accepts structured Product Core preset state directly. |

## Canonical Replacement Fields

The canonical path for source identity and musical ownership is:

- `preset_id` / `presetId`: `CANONICAL_CORE_FIELD`
- `morph`, `distance`, `expression`, `level`, sends, post-LPF, stereo width, and hold seconds: `CANONICAL_CORE_FIELD`
- `drum_voice_preset_a_ids`, `drum_voice_preset_b_ids`, `drum_voice_morphs` / `drumVoicePresetAIds`, `drumVoicePresetBIds`, `drumVoiceMorphs`: `CANONICAL_CORE_FIELD`
- Generated Product Core source preset profile fields: `CANONICAL_CORE_FIELD`

The snapshot adapter may map legacy preset keys into these generated fields. It may not be treated as the final owner of oscillator, filter, envelope, FM, or Drum tonal behavior.

## Enforcement

- `scripts/check-kessho-product-patch-bridges.mjs` fails if an exact patch field is not listed here with a classification and retirement condition.
- Web snapshot exact patch builders must carry a `PATCH_BRIDGE_RETIREMENT` label.
- Native snapshot exact patch serialization must carry a `PATCH_BRIDGE_RETIREMENT` label and must remain zero/default unless a dedicated Product Core override policy is added.
- New exact patch fields are forbidden unless this document classifies them and the static check is updated in the same change.
