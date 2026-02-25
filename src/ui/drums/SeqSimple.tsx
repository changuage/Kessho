/**
 * SeqSimple — Standalone stochastic trigger sequencer.
 *
 * Completely separate from the Euclidean sequencer. Each enabled voice runs
 * its own independent Poisson-process timer: after triggering, it schedules
 * its next firing using an exponential random delay. This means voices never
 * cluster — they fire at stochastically independent times.
 *
 * The "density" slider per voice controls the mean rate (higher = more frequent).
 * The global "speed" slider scales all mean intervals.
 *
 * Controls:
 *   - Master on/off toggle
 *   - Speed slider (global rate multiplier)
 *   - Per-voice: enable toggle + density slider (controls mean inter-trigger time)
 *   - Visual flash on trigger
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { DRUM_VOICES as VOICE_CONFIG, DRUM_VOICE_ORDER } from '../../audio/drumVoiceConfig';

interface SeqSimpleProps {
  triggerVoice: (voice: DrumVoiceType) => void;
  drumEnabled: boolean;
  masterEnabled?: boolean;
  onEnableDrums?: () => void;
}

interface VoiceState {
  enabled: boolean;
  density: number; // 0–1, higher = more frequent
}

const DEFAULT_VOICE_STATES: Record<DrumVoiceType, VoiceState> = {
  sub:      { enabled: true,  density: 0.10 },
  kick:     { enabled: true,  density: 0.15 },
  click:    { enabled: true,  density: 0.20 },
  beepHi:   { enabled: false, density: 0.15 },
  beepLo:   { enabled: false, density: 0.15 },
  noise:    { enabled: true,  density: 0.12 },
  membrane: { enabled: true,  density: 0.18 },
};

// Mean interval range for the Poisson process
const MIN_MEAN_MS = 200;   // fastest mean interval at speed=1, density=1
const MAX_MEAN_MS = 40000; // slowest mean interval at speed=0, density→0

/**
 * Compute mean inter-trigger interval for a voice.
 * speed (0–1) and density (0–1) both reduce the mean interval (more triggers).
 * Uses exponential mapping for natural feel.
 */
function meanInterval(speed: number, density: number): number {
  if (density <= 0) return Infinity;
  // Combined rate factor: speed and density multiply
  const rate = speed * density;
  if (rate <= 0) return Infinity;
  // Exponential curve: rate 1 → MIN_MEAN_MS, rate→0 → MAX_MEAN_MS
  return MIN_MEAN_MS * Math.pow(MAX_MEAN_MS / MIN_MEAN_MS, 1 - rate);
}

/**
 * Exponential random variate — the time between events in a Poisson process.
 * Returns a random delay with the given mean, producing natural irregular spacing.
 * Clamps to a minimum of 80ms to prevent audio overlap.
 */
function exponentialRandom(mean: number): number {
  // -mean * ln(U) where U ~ Uniform(0,1), but avoid ln(0)
  const u = Math.max(1e-10, Math.random());
  return Math.max(80, -mean * Math.log(u));
}

const SeqSimple: React.FC<SeqSimpleProps> = ({ triggerVoice, drumEnabled, masterEnabled, onEnableDrums }) => {
  const [active, setActive] = useState(false);
  const [speed, setSpeed] = useState(0.25); // default: slow
  const [voices, setVoices] = useState<Record<DrumVoiceType, VoiceState>>(() => ({ ...DEFAULT_VOICE_STATES }));
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});

  // Refs so per-voice timers always read latest state
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const triggerRef = useRef(triggerVoice);
  triggerRef.current = triggerVoice;
  const drumEnabledRef = useRef(drumEnabled);
  drumEnabledRef.current = drumEnabled;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Auto-enable drums when simple sequencer is activated
  useEffect(() => {
    if (active && !drumEnabled && onEnableDrums) {
      onEnableDrums();
    }
  }, [active, drumEnabled, onEnableDrums]);

  // Turn off simple sequencer only when master stop is *pressed* (true → false)
  const prevMasterEnabled = useRef(masterEnabled);
  useEffect(() => {
    if (prevMasterEnabled.current === true && masterEnabled === false && active) {
      setActive(false);
    }
    prevMasterEnabled.current = masterEnabled;
  }, [masterEnabled, active]);

  // Per-voice timeout handles
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const toggleVoice = useCallback((voice: DrumVoiceType) => {
    setVoices(prev => ({
      ...prev,
      [voice]: { ...prev[voice], enabled: !prev[voice].enabled },
    }));
  }, []);

  const setVoiceDensity = useCallback((voice: DrumVoiceType, density: number) => {
    setVoices(prev => ({
      ...prev,
      [voice]: { ...prev[voice], density: Math.max(0, Math.min(1, density)) },
    }));
  }, []);

  const flashVoice = useCallback((voice: string) => {
    setFlashing(prev => ({ ...prev, [voice]: true }));
    setTimeout(() => {
      setFlashing(prev => ({ ...prev, [voice]: false }));
    }, 150);
  }, []);

  // Schedule next trigger for a single voice (Poisson process)
  const scheduleVoice = useCallback((voice: DrumVoiceType) => {
    // Clear any existing timer for this voice
    const existing = timersRef.current[voice];
    if (existing) clearTimeout(existing);

    const tick = () => {
      if (!activeRef.current) return;
      const vs = voicesRef.current[voice];
      if (!vs.enabled) return;

      // Fire trigger if drums are enabled
      if (drumEnabledRef.current) {
        triggerRef.current(voice);
        flashVoice(voice);
      }

      // Schedule next with fresh exponential random delay
      const mean = meanInterval(speedRef.current, vs.density);
      const delay = exponentialRandom(mean);
      timersRef.current[voice] = setTimeout(tick, delay);
    };

    // Initial delay — also exponential so first triggers are staggered
    const vs = voicesRef.current[voice];
    const mean = meanInterval(speedRef.current, vs.density);
    const initialDelay = exponentialRandom(mean);
    timersRef.current[voice] = setTimeout(tick, initialDelay);
  }, [flashVoice]);

  // Clear all voice timers
  const clearAllTimers = useCallback(() => {
    Object.values(timersRef.current).forEach(t => { if (t) clearTimeout(t); });
    timersRef.current = {};
  }, []);

  // Start/stop per-voice timers when active state changes
  useEffect(() => {
    if (active) {
      // Start independent timer for each enabled voice
      DRUM_VOICE_ORDER.forEach(voice => {
        if (voicesRef.current[voice].enabled) {
          scheduleVoice(voice);
        }
      });
    } else {
      clearAllTimers();
    }
    return () => clearAllTimers();
  }, [active, scheduleVoice, clearAllTimers]);

  // When a voice is toggled on/off while active, start/stop its timer
  useEffect(() => {
    if (!active) return;
    DRUM_VOICE_ORDER.forEach(voice => {
      const vs = voices[voice];
      const hasTimer = !!timersRef.current[voice];
      if (vs.enabled && !hasTimer) {
        scheduleVoice(voice);
      } else if (!vs.enabled && hasTimer) {
        clearTimeout(timersRef.current[voice]!);
        timersRef.current[voice] = null;
      }
    });
  }, [active, voices, scheduleVoice]);

  // Display: approximate average interval for reference
  const avgMean = meanInterval(speed, 0.15); // representative density
  const avgDisplay = avgMean >= 1000
    ? `~${(avgMean / 1000).toFixed(1)}s`
    : `~${Math.round(avgMean)}ms`;

  return (
    <div className="seq-simple">
      {/* Header: on/off toggle + speed */}
      <div className="seq-simple-top">
        <button
          className={`seq-simple-power${active ? ' on' : ''}`}
          onClick={() => setActive(a => !a)}
          title={active ? 'Turn off stochastic triggers' : 'Turn on stochastic triggers'}
        >
          {active ? '● On' : '○ Off'}
        </button>
        <div className="seq-simple-speed-wrap">
          <span className="seq-simple-speed-label">Rate</span>
          <input
            type="range"
            min={0.01}
            max={1}
            step={0.01}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="seq-simple-speed-slider"
          />
          <span className="seq-simple-speed-val">{avgDisplay}</span>
        </div>
      </div>

      {/* Per-voice rows */}
      <div className="seq-simple-voices">
        {DRUM_VOICE_ORDER.map((voice) => {
          const vs = voices[voice];
          const cfg = VOICE_CONFIG[voice];
          const isFlash = flashing[voice];
          const densityPct = Math.round(vs.density * 100);

          return (
            <div
              key={voice}
              className={`seq-simple-voice${vs.enabled ? ' enabled' : ''}${isFlash ? ' flash' : ''}`}
              style={{ '--vc': cfg.color } as React.CSSProperties}
            >
              {/* Toggle + icon + name */}
              <button
                className={`seq-simple-voice-btn${vs.enabled ? ' on' : ''}`}
                onClick={() => toggleVoice(voice)}
                style={vs.enabled ? { color: cfg.color, borderColor: cfg.color } : undefined}
              >
                <span className="seq-simple-voice-icon">{cfg.icon}</span>
                <span className="seq-simple-voice-name">{cfg.label}</span>
              </button>

              {/* Density slider */}
              <div className="seq-simple-voice-prob">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={vs.density}
                  disabled={!vs.enabled}
                  onChange={(e) => setVoiceDensity(voice, parseFloat(e.target.value))}
                  className="seq-simple-voice-slider"
                  style={{ accentColor: vs.enabled ? cfg.color : '#444' }}
                />
                <span
                  className="seq-simple-voice-val"
                  style={{ color: vs.enabled ? cfg.color : '#555' }}
                >
                  {densityPct}%
                </span>
              </div>

              {/* Trigger test button */}
              <button
                className="seq-simple-voice-test"
                onClick={() => { triggerVoice(voice); flashVoice(voice); }}
                title={`Test ${cfg.label}`}
                style={{ color: cfg.color }}
              >
                ♪
              </button>
            </div>
          );
        })}
      </div>

      <div className="seq-simple-hint">
        Each voice triggers independently at random intervals (Poisson process)
      </div>
    </div>
  );
};

export default SeqSimple;
