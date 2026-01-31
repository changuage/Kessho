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
Scales are positioned along the tension spectrum:

| Scale | Tension Value | Level |
|-------|---------------|-------|
| E Major Pentatonic | 0.00 | consonant |
| E Major (Ionian) | 0.05 | consonant |
| E Lydian | 0.10 | consonant |
| E Mixolydian | 0.18 | consonant |
| E Minor Pentatonic | 0.22 | consonant |
| E Dorian | 0.25 | consonant |
| E Aeolian | 0.35 | color |
| E Harmonic Minor | 0.50 | color |
| E Melodic Minor | 0.55 | color |
| E Octatonic Half-Whole | 0.85 | high |
| E Phrygian Dominant | 0.90 | high |

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