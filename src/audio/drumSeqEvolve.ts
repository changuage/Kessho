import type { SequencerSnapshot, SequencerState } from './drumSeqTypes';
import { seqEuclidean } from './drumSequencer';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function chance(rng: () => number, amount: number): boolean {
  return rng() < amount;
}

function drift(value: number, delta: number, rng: () => number): number {
  return value + (rng() * 2 - 1) * delta;
}


function randomActiveStep(s: SequencerState): number | null {
  const active: number[] = [];
  for (let i = 0; i < s.trigger.pattern.length; i++) {
    if (s.trigger.pattern[i]) active.push(i);
  }
  if (active.length === 0) return null;
  return active[Math.floor(s.rng() * active.length)] ?? null;
}

export function captureHomeSnapshot(s: SequencerState): SequencerSnapshot {
  return {
    trigger: {
      steps: s.trigger.steps,
      hits: s.trigger.hits,
      rotation: s.trigger.rotation,
      probability: [...s.trigger.probability],
      ratchet: [...s.trigger.ratchet],
      pattern: [...s.trigger.pattern],
    },
    pitch: {
      offsets: [...s.pitch.offsets],
      root: s.pitch.root,
      scale: s.pitch.scale,
    },
    expression: {
      velocities: [...s.expression.velocities],
    },
    morph: {
      values: [...s.morph.values],
    },
    distance: {
      values: [...s.distance.values],
    },
    swing: s.swing,
  };
}

export function evolveSequencer(s: SequencerState, currentBar: number): SequencerState {
  if (!s.evolve.enabled) return s;
  if (currentBar - s.evolve.lastEvolveBar < s.evolve.everyBars) return s;

  const next: SequencerState = {
    ...s,
    trigger: {
      ...s.trigger,
      probability: [...s.trigger.probability],
      ratchet: [...s.trigger.ratchet],
      pattern: [...s.trigger.pattern],
      overrides: new Set(s.trigger.overrides),
    },
    pitch: { ...s.pitch, offsets: [...s.pitch.offsets] },
    expression: { ...s.expression, velocities: [...s.expression.velocities] },
    morph: { ...s.morph, values: [...s.morph.values] },
    distance: { ...s.distance, values: [...s.distance.values] },
    evolve: { ...s.evolve, lastEvolveBar: currentBar },
  };

  const intensity = clamp(next.evolve.intensity, 0, 1);
  const methods = next.evolve.methods;
  const home = next.evolve.home;

  // 1. Rotate Drift — shift rotation ±1, chance scales with intensity
  if (methods.rotateDrift && chance(next.rng, 0.4 + 0.4 * intensity)) {
    const dir = next.rng() < 0.5 ? 1 : -1;
    next.trigger.rotation = ((next.trigger.rotation + dir) % next.trigger.steps + next.trigger.steps) % next.trigger.steps;
  }

  // 2. Velocity Breath — drift scaled by intensity, clamp [0.2, 1.0]
  if (methods.velocityBreath && chance(next.rng, 1)) {
    next.expression.velocities = next.expression.velocities.map(
      (v) => clamp(drift(v, 0.08 * intensity, next.rng), 0.2, 1.0)
    );
  }

  // 3. Swing Drift — drift scaled by intensity
  if (methods.swingDrift && chance(next.rng, 1)) {
    next.swing = clamp(drift(next.swing, 0.03 * intensity, next.rng), 0, 0.75);
  }

  // 4. Probability Drift — only active steps, clamp [0.3, 1.0]
  if (methods.probDrift && chance(next.rng, 1)) {
    next.trigger.probability = next.trigger.probability.map((p, i) => {
      if (!next.trigger.pattern[i]) return p; // only active steps
      return clamp(drift(p, 0.08 * intensity, next.rng), 0.3, 1.0);
    });
  }

  // 5. Morph Drift — drift scaled by intensity
  if (methods.morphDrift && chance(next.rng, 1)) {
    next.morph.values = next.morph.values.map(
      (m) => clamp(drift(m, 0.05 * intensity, next.rng), 0, 1)
    );
  }

  // 6. Ghost Notes — skip mono voices (sub/kick), chance = 0.3 * intensity
  if (methods.ghostNotes && chance(next.rng, 0.3 * intensity)) {
    // Check if all active sources are mono (pool max ≤ 1)
    const monoVoices = new Set(['sub', 'kick']);
    const activeVoices = Object.entries(next.sources)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const isMonoOnly = activeVoices.length > 0 && activeVoices.every(v => monoVoices.has(v));
    if (!isMonoOnly) {
      const inactiveSteps: number[] = [];
      for (let i = 0; i < next.trigger.steps; i++) {
        if (!next.trigger.pattern[i] && !next.trigger.overrides.has(i)) {
          inactiveSteps.push(i);
        }
      }
      if (inactiveSteps.length > 0) {
        const count = Math.min(2, Math.ceil(inactiveSteps.length * 0.15));
        for (let c = 0; c < count && inactiveSteps.length > 0; c++) {
          const pick = Math.floor(next.rng() * inactiveSteps.length);
          const idx = inactiveSteps.splice(pick, 1)[0]!;
          next.trigger.overrides.add(idx);
          next.trigger.pattern[idx] = true;
          next.trigger.probability[idx] = 0.15 + next.rng() * 0.2;
          next.expression.velocities[idx] = 0.2 + next.rng() * 0.2;
          next.distance.values[idx] = 0.6 + next.rng() * 0.2;
        }
      }
    }
  }

  // 7. Ratchet Spray — toggle 1↔2, chance = 0.2 * intensity
  if (methods.ratchetSpray && chance(next.rng, 0.2 * intensity)) {
    const idx = randomActiveStep(next);
    if (idx !== null) {
      next.trigger.ratchet[idx] = next.trigger.ratchet[idx] >= 2 ? 1 : 2;
    }
  }

  // 8. Hit Drift — ±1 hits, chance = 0.15 * intensity
  if (methods.hitDrift && chance(next.rng, 0.15 * intensity)) {
    const dir = next.rng() < 0.5 ? -1 : 1;
    const newHits = clamp(next.trigger.hits + dir, 1, next.trigger.steps - 1);
    if (newHits !== next.trigger.hits) {
      next.trigger.hits = newHits;
      next.trigger.overrides.clear();
    }
  }

  // 9. Pitch Walk — ±1 scale degree, clamp ±3 from home, chance = 0.25 * intensity
  if (methods.pitchWalk && chance(next.rng, 0.25 * intensity)) {
    const idx = Math.floor(next.rng() * next.pitch.offsets.length);
    const dir = next.rng() < 0.5 ? -1 : 1;
    const orig = home ? (home.pitch.offsets[idx] ?? 0) : 0;
    const newVal = next.pitch.offsets[idx] + dir;
    if (Math.abs(newVal - orig) <= 3) {
      next.pitch.offsets[idx] = newVal;
    }
  }

  // Regenerate pattern from (possibly changed) hits/rotation
  next.trigger.pattern = seqEuclidean(next.trigger.steps, next.trigger.hits, next.trigger.rotation);

  // Home gravity: 15% * (1.2 - intensity) chance to revert one param toward home
  if (home && chance(next.rng, 0.15 * (1.2 - intensity))) {
    const gravityTargets = ['rotation', 'swing', 'probability', 'velocities'];
    const target = gravityTargets[Math.floor(next.rng() * gravityTargets.length)];
    switch (target) {
      case 'rotation':
        if (next.trigger.rotation !== home.trigger.rotation) {
          const diff = next.trigger.rotation - home.trigger.rotation;
          const step = diff > 0 ? -1 : 1;
          next.trigger.rotation = ((next.trigger.rotation + step) % next.trigger.steps + next.trigger.steps) % next.trigger.steps;
          next.trigger.pattern = seqEuclidean(next.trigger.steps, next.trigger.hits, next.trigger.rotation);
          next.trigger.overrides.clear();
        }
        break;
      case 'swing':
        next.swing += (home.swing - next.swing) * 0.3;
        break;
      case 'probability':
        for (let i = 0; i < next.trigger.steps; i++) {
          const hp = home.trigger.probability[i] ?? 1;
          next.trigger.probability[i] += (hp - next.trigger.probability[i]) * 0.2;
        }
        break;
      case 'velocities':
        for (let i = 0; i < next.expression.velocities.length; i++) {
          const hv = home.expression.velocities[i] ?? 0.5;
          next.expression.velocities[i] += (hv - next.expression.velocities[i]) * 0.2;
        }
        break;
    }
  }

  return next;
}

export function resetSequencerToHome(s: SequencerState): SequencerState {
  if (!s.evolve.home) return s;
  const home = s.evolve.home;
  return {
    ...s,
    swing: home.swing,
    trigger: {
      ...s.trigger,
      steps: home.trigger.steps,
      hits: home.trigger.hits,
      rotation: home.trigger.rotation,
      probability: [...home.trigger.probability],
      ratchet: [...home.trigger.ratchet],
      pattern: [...home.trigger.pattern],
      overrides: new Set<number>(),
    },
    pitch: { ...s.pitch, offsets: [...home.pitch.offsets], root: home.pitch.root, scale: home.pitch.scale },
    expression: { ...s.expression, velocities: [...home.expression.velocities] },
    morph: { ...s.morph, values: [...home.morph.values] },
    distance: { ...s.distance, values: [...home.distance.values] },
  };
}
