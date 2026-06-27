import { DEFAULT_STATE, type SliderState } from '../ui/state';
import { ENGINE_GROUPS as SNOWFLAKE_ENGINE_GROUPS } from '../ui/snowflakeV2';

const SNOWFLAKE_WELCOME_STATE: SliderState = {
  ...DEFAULT_STATE,
  masterVolume: 0.85,
  tension: 0.15,
  reverbLevel: 0.5,
  reverbDecay: 0.7,
  reverbDiffusion: 0.3,
  synthLevel: 0.1,
  pad2Level: 0.1,
  granularLevel: 0,
  leadLevel: 1.0,
  lead1Level: 0.1,
  lead2Level: 0.1,
  pianoLevel: 0.1,
  drumLevel: 0.1,
  oceanSampleLevel: 0,
  padEnabled: true,
  pad2Enabled: true,
  leadEnabled: true,
  lead2Enabled: true,
  pianoEnabled: true,
  drumEnabled: true,
  granularEnabled: false,
  oceanSampleEnabled: false,
  waterEnabled: false,
  insectsEnabled: false,
  birdsEnabled: false,
  delayAEnabled: false,
  granularDelayEnabled: false,
};

const WELCOME_MACRO_MAGNITUDE = 0.5;
const WELCOME_STRUCTURE_LOG_CURVE = 80;

function randomWelcomeSign(): 1 | -1 {
  return Math.random() >= 0.5 ? 1 : -1;
}

function normalizedLevelForWelcomeStructure(structureMacro: number): number {
  const clamped = Math.max(-1, Math.min(1, structureMacro));
  const shifted = (clamped + 1) / 2;
  return Math.expm1(shifted * Math.log1p(WELCOME_STRUCTURE_LOG_CURVE)) / WELCOME_STRUCTURE_LOG_CURVE;
}

function setWelcomeValue(state: SliderState, key: keyof SliderState, value: number | boolean | string): void {
  (state as unknown as Record<string, number | boolean | string>)[String(key)] = value;
}

export function createSignedSnowflakeWelcomeState(): SliderState {
  const next: SliderState = { ...SNOWFLAKE_WELCOME_STATE };
  const activeEngineIds = new Set(SNOWFLAKE_ENGINE_GROUPS.slice(0, 6).map((engine) => engine.id));
  const fractalSign = randomWelcomeSign();

  setWelcomeValue(next, 'granularV1Mode', fractalSign > 0 ? 'granular' : 'clean');

  for (const engine of SNOWFLAKE_ENGINE_GROUPS) {
    const active = activeEngineIds.has(engine.id);
    if (engine.enabledKey) setWelcomeValue(next, engine.enabledKey, active);

    const level = active
      ? normalizedLevelForWelcomeStructure(WELCOME_MACRO_MAGNITUDE)
      : 0;
    setWelcomeValue(next, engine.levelKey, engine.levelMin + level * (engine.levelMax - engine.levelMin));

    for (const sendKey of Object.values(engine.sends)) {
      if (!sendKey) continue;
      setWelcomeValue(next, sendKey, 0);
    }

    if (!active) continue;
    if (engine.sends.granular) {
      setWelcomeValue(next, engine.sends.granular, WELCOME_MACRO_MAGNITUDE);
    }

    const densityPositive = randomWelcomeSign() > 0;
    const primaryDensitySend = densityPositive ? engine.sends.delayA : engine.sends.delayB;
    const fallbackDensitySend = densityPositive ? engine.sends.delayB : engine.sends.delayA;
    const densitySend = primaryDensitySend ?? fallbackDensitySend;
    if (densitySend) setWelcomeValue(next, densitySend, WELCOME_MACRO_MAGNITUDE);
  }

  return next;
}
