# Development Learnings

## Windows Group Policy Bypass for Node.js

### Problem
On some Windows systems (especially corporate environments), group policy restrictions block execution of `npm`, `npx`, and other Node.js commands even when Node.js is installed.

**Symptoms:**
- `npm run dev` → "npm is not recognized" or "This program is blocked by group policy"
- `npx vite` → same errors
- `where.exe node` → returns nothing even though Node.js is installed

**Verification:**
```powershell
Test-Path "C:\Program Files\nodejs\npm.cmd"  # Returns True if Node.js is installed
```

### Solution
Bypass the restriction by calling `node.exe` directly with the script path:

```powershell
# Instead of:
npm run dev

# Use:
& "C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js"
```

### Why This Works
- Group policy blocks `npm.cmd` and `npx.cmd` batch files
- But `node.exe` itself is not blocked
- Vite's CLI is just a JavaScript file that can be executed directly by node

### Other Commands
```powershell
# npm install equivalent (if npm is blocked)
# May need to manually download dependencies or use a different machine

# Running any npm script
i
```

---

## Scale Tension Weighting System

### Overview
The scale selection system uses a weighted probability algorithm to choose scales based on a tension slider (0.0 - 1.0). The goal is to have predictable, musical scale transitions where each tension value has a "home" scale that dominates the probability.

### Scale Positions (tensionValue)
Scales are positioned along the tension spectrum. Scale names are now **generic** (the root note is a separate parameter):

| Scale | Tension Value | Level |
|-------|---------------|-------|
| Major Pentatonic | 0.00 | consonant |
| Major (Ionian) | 0.05 | consonant |
| Lydian | 0.10 | consonant |
| Mixolydian | 0.18 | consonant |
| Minor Pentatonic | 0.22 | consonant |
| Dorian | 0.25 | consonant |
| Aeolian | 0.35 | color |
| Harmonic Minor | 0.50 | color |
| Melodic Minor | 0.55 | color |
| Octatonic Half-Whole | 0.85 | high |
| Phrygian Dominant | 0.90 | high |

### Weighting Formula
```typescript
weight = Math.pow(1 / (distance + 0.05), 1.5)
```

Where:
- `distance` = absolute difference between scale's tensionValue and current tension slider value
- `0.05` = offset constant (controls sharpness of probability peaks)
- `1.5` = power exponent (controls how fast probability falls off with distance)

### Probability Distribution at Key Tension Values

| Tension | Maj Pent | Major | Lydian | Mixolydian | Minor Pent | Dorian | Aeolian | Harm Minor | Mel Minor | Octatonic | Phryg Dom |
|---------|----------|-------|--------|------------|------------|--------|---------|------------|-----------|-----------|-----------|
| 0.00 | **55.7%** | 19.7% | 10.7% | 5.6% | 4.4% | 3.8% | - | - | - | - | - |
| 0.05 | 17.2% | **48.7%** | 17.2% | 7.1% | 5.3% | 4.4% | - | - | - | - | - |
| 0.10 | 9.3% | 17.1% | **48.3%** | 11.5% | 7.7% | 6.0% | - | - | - | - | - |
| 0.25 | 3.3% | 4.4% | 6.1% | 13.1% | 24.2% | **48.9%** | - | - | - | - | - |
| 0.35 | 2.4% | 3.0% | 3.7% | 5.9% | 8.0% | 10.5% | **54.7%** | 6.8% | 4.9% | - | - |
| 0.50 | 1.6% | 1.8% | 2.1% | 2.8% | 3.4% | 3.9% | 7.1% | **57.1%** | 20.2% | - | - |
| 0.85 | - | - | - | - | - | - | - | - | - | **73.9%** | 26.1% |

### Tension Bands (Candidate Filtering)
Before weighting, scales are filtered by tension band:
- **≤ 0.25**: Only consonant scales (Major, Lydian, Mixolydian, Dorian, etc.)
- **0.26 - 0.55**: Consonant + Color scales (adds Aeolian, Harmonic/Melodic Minor)
- **0.56 - 0.80**: Color + High tension scales
- **> 0.80**: Only High tension scales (Octatonic, Phrygian Dominant)

### Design Goals
1. **~75% probability** for Maj Pent + Major at tension 0.0
2. **~50-60% peak** for each scale at its home tension value
3. **Smooth transitions** - neighboring scales always have some probability
4. **Musical progression** - low tension = bright/major, high tension = dark/dissonant

### Tuning Parameters
- **Offset (0.05)**: Lower = sharper peaks, higher = flatter distribution
  - 0.05 → ~75% for top 2 scales at their home position
  - 0.08 → ~67% for top 2 scales
  - 0.10 → ~60% for top 2 scales
- **Power (1.5)**: Higher = faster falloff from peak
  - 1.0 → linear falloff
  - 1.5 → moderate curve (current)
  - 2.0 → sharp dropoff

---

## Circle of Fifths Morph System

### Overview
When morphing between presets with different root notes, the key transition follows the Circle of Fifths (CoF) for smooth, musical modulation rather than abrupt key changes.

### Key Components

#### 1. Direction-Aware Morphing
The morph system tracks which direction the user is moving:
- **A → B (0% → 100%)**: Captures A's current root (accounting for any active CoF drift)
- **B → A (100% → 0%)**: Captures B's current root

This is critical because the slider position semantics (0=A, 100=B) don't change, but the *musical* direction of the morph matters for calculating the correct CoF path.

#### 2. CoF Path Calculation
```typescript
// Calculate shortest path on Circle of Fifths
calculateCoFPath(fromSemitone, toSemitone): { steps, path }

// Steps can be positive (clockwise/sharps) or negative (counter-clockwise/flats)
// Path is array of semitones to traverse
```

Example: E(4) → G(7)
- Clockwise: E→B→F#→C#→G#→D#→A#→F→C→G = 9 steps
- Counter-clockwise: E→A→D→G = 3 steps
- **Result**: CCW is shorter, path = [E, A, D, G], steps = -3

#### 3. Morph Position to CoF Step Mapping
Key changes are distributed evenly across the morph:
```typescript
// For N steps, change at positions: 100/(N+1), 200/(N+1), ... N*100/(N+1)
// Example: 3 steps → change at 25%, 50%, 75%
segmentSize = 100 / (totalSteps + 1)
pathIndex = floor((morphPosition + segmentSize/2) / segmentSize)
```

#### 4. Smart CoF Toggle
When presets have different `cofDriftEnabled` values:

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| **Off → On** | Turn ON immediately (t > 0) | Allow CoF walk during morph |
| **On → Off** | Stay ON until arrival (t < 100) | Complete CoF walk before disabling |
| **Same** | Use that value | No special handling needed |

### Implementation Details

```typescript
// In lerpPresets():
if (direction === 'toB') {
  fromRoot = capturedStartRoot ?? stateA.rootNote;
  toRoot = stateB.rootNote;
  cofMorphT = t; // 0→100 maps directly
} else {
  fromRoot = capturedStartRoot ?? stateB.rootNote;
  toRoot = stateA.rootNote;
  cofMorphT = 100 - t; // Invert for B→A direction
}
```

### State Management

| Ref | Purpose |
|-----|---------|
| `morphCapturedStartRootRef` | Captures the effective root when morph begins |
| `morphDirectionRef` | Tracks 'toA' or 'toB' direction |
| `lastMorphEndpointRef` | Tracks last visited endpoint (0 or 100) |

### Visual Feedback
The Circle of Fifths UI component shows:
- **Blue segment**: Home key of current preset
- **Green segment**: Current key position during morph
- **Highlighted path**: All keys that will be traversed
- **Gray segments**: Keys within drift range (when CoF drift enabled)