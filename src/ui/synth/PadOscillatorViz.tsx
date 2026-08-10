import React, { useEffect, useRef } from 'react';
import { getCappedCanvasDpr } from '../hooks/useAnimationVisibility';
import {
  PAD_PREVIEW_SAMPLE_COUNT,
  PAD_REFERENCE_PITCH_HZ,
  applyPreviewPhaseDistortion,
  resolveMixProminence,
  resolvePreviewFrequency,
  resolveVisualizerCycleCount,
  samplePadWave,
  type PadWaveSource,
} from './padOscillatorVizMath';

export interface PadOscillatorVizProps {
  oscAWave: PadWaveSource;
  oscAPosition: number;
  oscAPhaseDistortion: number;
  oscAPitchSemitones: number;
  oscAHzOffset: number;
  oscALevel: number;
  oscBWave: PadWaveSource;
  oscBPosition: number;
  oscBPhaseDistortion: number;
  oscBPitchSemitones: number;
  oscBHzOffset: number;
  oscBLevel: number;
  oscMix: number;
}

const A_COLOR = '#65c9ff';
const B_COLOR = '#d19bff';

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function formatSignedPercent(value: number): string {
  const percent = Math.round(Math.max(-1, Math.min(1, finite(value))) * 100);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

function waveLabel(wave: PadWaveSource): string {
  switch (wave) {
    case 'complexSine': return 'Complex Sine';
    case 'complexTriangle': return 'Complex Triangle';
    case 'harmonic': return 'Harmonic';
    case 'sawtooth': return 'Saw';
    case 'triangle': return 'Triangle';
    case 'square': return 'Square';
    default: return 'Sine';
  }
}

function sourceTrace(
  samples: Float32Array,
  wave: PadWaveSource,
  position: number,
  phaseDistortion: number,
  cycles: number,
): void {
  for (let index = 0; index < samples.length; index += 1) {
    const phase = (index / (samples.length - 1)) * cycles;
    samples[index] = samplePadWave(wave, position, applyPreviewPhaseDistortion(phase, phaseDistortion));
  }
}

const PadOscillatorViz: React.FC<PadOscillatorVizProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<Float32Array[]>([]);
  const aCycles = resolveVisualizerCycleCount(resolvePreviewFrequency(PAD_REFERENCE_PITCH_HZ, props.oscAPitchSemitones, props.oscAHzOffset));
  const bCycles = resolveVisualizerCycleCount(resolvePreviewFrequency(PAD_REFERENCE_PITCH_HZ, props.oscBPitchSemitones, props.oscBHzOffset));

  const accessibleDescription = (
    `Static oscillator preview. A: ${waveLabel(props.oscAWave)}, ${aCycles.toFixed(1)} visible cycles, pitch ${props.oscAPitchSemitones.toFixed(2)} semitones, phase distortion ${formatSignedPercent(props.oscAPhaseDistortion)}. B: ${waveLabel(props.oscBWave)}, ${bCycles.toFixed(1)} visible cycles, pitch ${props.oscBPitchSemitones.toFixed(2)} semitones, phase distortion ${formatSignedPercent(props.oscBPhaseDistortion)}. Mix ${Math.round(Math.max(0, Math.min(1, props.oscMix)) * 100)}%.`
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const aSamples = frameRef.current[0] ?? new Float32Array(PAD_PREVIEW_SAMPLE_COUNT);
    const bSamples = frameRef.current[1] ?? new Float32Array(PAD_PREVIEW_SAMPLE_COUNT);
    frameRef.current[0] = aSamples;
    frameRef.current[1] = bSamples;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = getCappedCanvasDpr();
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if (width < 2 || height < 2) return;

      const pad = 5 * dpr;
      const plotWidth = Math.max(1, width - pad * 2);
      const plotHeight = Math.max(1, height - pad * 2);
      const prominence = resolveMixProminence(props.oscMix, props.oscALevel, props.oscBLevel);
      sourceTrace(aSamples, props.oscAWave, props.oscAPosition, props.oscAPhaseDistortion, aCycles);
      sourceTrace(bSamples, props.oscBWave, props.oscBPosition, props.oscBPhaseDistortion, bCycles);

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(pad, pad + plotHeight * 0.5);
      ctx.lineTo(pad + plotWidth, pad + plotHeight * 0.5);
      ctx.stroke();

      const drawTrace = (samples: Float32Array, color: string, opacity: number, dash: number[] = []) => {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.35 * dpr;
        ctx.setLineDash(dash.map(value => value * dpr));
        ctx.beginPath();
        for (let index = 0; index < samples.length; index += 1) {
          const value = Math.max(-1, Math.min(1, finite(samples[index] ?? 0)));
          const x = pad + (index / (samples.length - 1)) * plotWidth;
          const y = pad + (1 - (value + 1) * 0.5) * plotHeight;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      };

      if (prominence.first === 'a') {
        drawTrace(aSamples, A_COLOR, prominence.aOpacity);
        drawTrace(bSamples, B_COLOR, prominence.bOpacity, [3, 3]);
      } else {
        drawTrace(bSamples, B_COLOR, prominence.bOpacity, [3, 3]);
        drawTrace(aSamples, A_COLOR, prominence.aOpacity);
      }
    };

    draw();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    props.oscAWave,
    props.oscAPosition,
    props.oscAPhaseDistortion,
    props.oscALevel,
    aCycles,
    props.oscBWave,
    props.oscBPosition,
    props.oscBPhaseDistortion,
    props.oscBLevel,
    bCycles,
    props.oscMix,
  ]);

  return (
    <div className="pad-oscillator-viz" role="img" aria-label={accessibleDescription}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="pad-oscillator-viz-labels" aria-hidden="true"><span>A</span><span>B</span></span>
    </div>
  );
};

export default PadOscillatorViz;
