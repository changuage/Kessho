# Kessho Code Standards

## Morph Endpoint Detection

**Rule:** All morph slider endpoint checks MUST use the shared helpers from `src/audio/morphUtils.ts`. Never use inline threshold comparisons or raw `=== 0` / `=== 100` checks.

### Shared Helpers

```typescript
import { isAtEndpoint0, isAtEndpoint1, isInMidMorph, getEndpoint } from './audio/morphUtils';
```

| Helper | Returns `true` when |
|---|---|
| `isAtEndpoint0(position)` | `position === 0` (0-1 scale) |
| `isAtEndpoint0(position, true)` | `position === 0` (0-100 scale) |
| `isAtEndpoint1(position)` | `position === 1` (0-1 scale) |
| `isAtEndpoint1(position, true)` | `position === 100` (0-100 scale) |
| `isInMidMorph(position, scale100?)` | Not at either endpoint |
| `getEndpoint(position, scale100?)` | `0`, `1`, or `null` |

### Usage

**Main morph** (0-100 scale) — always pass `true` as the second argument:

```typescript
// ✅ Correct
if (isAtEndpoint0(morphPosition, true)) { /* at preset A */ }
if (isAtEndpoint1(morphPosition, true)) { /* at preset B */ }
const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);

// ❌ Wrong — inline checks
if (morphPosition === 0) { ... }
if (morphPosition <= 1) { ... }
if (morphPosition >= 99) { ... }
```

**Drum morph** (0-1 scale) — omit the second argument (defaults to `false`):

```typescript
// ✅ Correct
if (isAtEndpoint0(drumMorphPosition)) { /* at drum preset A */ }
if (isAtEndpoint1(drumMorphPosition)) { /* at drum preset B */ }

// ❌ Wrong — inline tolerance checks
const isAtEndpoint0 = drumMorphPosition < 0.001;  // shadows import!
const atEnd = currentMorph > 0.99;
```

### Why Exact Match

All morph sliders produce integer values (main morph: 0-100) or clean float values (drum morph: stepped 0-1). Tolerance-based checks (`< 0.001`, `> 0.999`, `<= 1`, `>= 99`) are unnecessary and create inconsistency. Exact match (`=== 0`, `=== 100`, `=== 1`) is correct and simple.

### Where This Applies

- `handleSliderChange` — morph preset endpoint updates (Rule 2)
- `handleDualModeToggle` — dual range override capture at endpoints
- `handleDualRangeChange` — dual range override capture at endpoints
- `handleMorphSliderChange` — endpoint tracking, CoF viz, override clearing
- `lerpPresets` — engine toggle snap behavior at endpoints
- Journey mode morph animation — CoF viz clearing at endpoints
- Drum morph `handleSliderChange` — mid-morph override clearing, preset reset logic
- UI display labels — "Full A" / "Full B" text
