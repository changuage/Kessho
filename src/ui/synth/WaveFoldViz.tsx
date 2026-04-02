/**
 * WaveFoldViz — Static oscilloscope showing one (or two) cycles of the dominant
 * oscillator waveform after wave folding.
 *
 * Fold algorithms match kessho_dsp.h WaveFolder exactly:
 *   0 = Buchla 259 triangle foldback
 *   1 = Sinusoidal (sin(x·gain·π/2))
 *   2 = Serge (3-stage tanh cascade)
 *
 * Oscillator waveforms: 0=sine, 1=triangle, 2=sawtooth, 3=square
 * Dominant osc = whichever has greater effective level after oscMix crossfade.
 */
import React, { useRef, useEffect } from 'react';

interface WaveFoldVizProps {
  foldAmount: number;   // 0..1
  foldMode: number;     // 0=Buchla, 1=Sine, 2=Serge
  oscAWave: string;     // 'sine'|'triangle'|'sawtooth'|'square'
  oscBWave: string;
  oscALevel: number;    // 0..1
  oscBLevel: number;
  oscMix: number;       // 0=A only, 1=B only
}

const WAVE_MAP: Record<string, number> = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };

/** Generate waveform cycles, normalized to [-1, 1] */
function generateWaveform(wave: number, N: number, cycles: number): Float32Array {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const phase = (i / N) * cycles;
    const t = phase - Math.floor(phase); // wrap to [0, 1)
    switch (wave) {
      case 1: // Triangle
        buf[i] = 1 - 4 * Math.abs(t - 0.5);
        break;
      case 2: // Sawtooth
        buf[i] = 2 * t - 1;
        break;
      case 3: // Square
        buf[i] = t < 0.5 ? 1 : -1;
        break;
      default: // Sine
        buf[i] = Math.sin(2 * Math.PI * t);
        break;
    }
  }
  return buf;
}

/** Build 256-point fold LUT — identical to C++ WaveFolder::set_fold */
function computeFoldTable(amount: number, mode: number): Float32Array {
  const N = 256;
  const table = new Float32Array(N);
  const gain = 1 + amount * 7;
  for (let i = 0; i < N; i++) {
    const x = (i * 2) / N - 1;
    const xg = x * gain;
    switch (mode) {
      case 1:
        table[i] = Math.sin(xg * Math.PI / 2);
        break;
      case 2: {
        let s = Math.tanh(xg);
        s = Math.tanh(s * gain * 0.5);
        s = Math.tanh(s * gain * 0.25);
        table[i] = s;
        break;
      }
      default:
        table[i] = 4 * Math.abs(0.25 * xg - Math.floor(0.25 * xg + 0.5)) - 1;
        break;
    }
  }
  return table;
}

function sampleLinear(buffer: Float32Array, position: number): number {
  if (buffer.length === 0) return 0;
  if (buffer.length === 1) return buffer[0] ?? 0;
  const clamped = Math.max(0, Math.min(buffer.length - 1, position));
  const i0 = Math.min(buffer.length - 2, Math.floor(clamped));
  const frac = clamped - i0;
  const left = buffer[i0] ?? 0;
  const right = buffer[i0 + 1] ?? left;
  return left + frac * (right - left);
}

/** Apply fold LUT to a sample — matches C++ WaveFolder::process */
function applyFold(input: number, table: Float32Array): number {
  return sampleLinear(table, (input + 1) * 127.5);
}

const DEFAULT_MODE_COLOR = '#60c0ff';
const MODE_COLORS = [DEFAULT_MODE_COLOR, '#80ff80', '#ff8060'] as const;

function getModeColor(modeIndex: number): string {
  return MODE_COLORS[modeIndex] ?? DEFAULT_MODE_COLOR;
}

const WaveFoldViz: React.FC<WaveFoldVizProps> = ({
  foldAmount, foldMode, oscAWave, oscBWave, oscALevel, oscBLevel, oscMix,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevRef = useRef('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Skip redraw if nothing changed
    const key = `${foldAmount},${foldMode},${oscAWave},${oscBWave},${oscALevel},${oscBLevel},${oscMix}`;
    if (prevRef.current === key) return;
    prevRef.current = key;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.clearRect(0, 0, W, H);

    const pad = 4 * dpr;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    // Zero-crossing line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(pad, pad + plotH / 2);
    ctx.lineTo(pad + plotW, pad + plotH / 2);
    ctx.stroke();

    // Determine dominant oscillator via effective level after oscMix crossfade
    const effA = oscALevel * Math.cos(oscMix * Math.PI / 2);
    const effB = oscBLevel * Math.sin(oscMix * Math.PI / 2);
    const wave = effB > effA ? (WAVE_MAP[oscBWave] ?? 0) : (WAVE_MAP[oscAWave] ?? 0);
    const cycles = (wave === 2 || wave === 3) ? 2 : 1;

    // Generate one cycle and blend dry/wet by fold amount for smooth transition
    const N = 512;
    const waveform = generateWaveform(wave, N, cycles);
    // Coerce foldMode to number — HTML <select> returns strings ("0","1","2")
    // which would cause switch(mode) strict-equality to always hit default (Buchla).
    const modeNum = typeof foldMode === 'string' ? parseInt(foldMode, 10) : (foldMode | 0);
    const modeIndex = modeNum < 0 ? 0 : modeNum > 2 ? 2 : modeNum;
    const table = computeFoldTable(foldAmount, modeIndex);
    const folded = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const dry = waveform[i] ?? 0;
      const wet = applyFold(dry, table);
      folded[i] = dry + foldAmount * (wet - dry);
    }

    // Draw dry reference faintly so mode-specific fold differences remain obvious.
    if (foldAmount > 0.001) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let px = 0; px <= plotW; px++) {
        const idx = (px / plotW) * (N - 1);
        const val = sampleLinear(waveform, idx);
        const y = pad + plotH * (1 - (val + 1) * 0.5);
        if (px === 0) ctx.moveTo(pad + px, y);
        else ctx.lineTo(pad + px, y);
      }
      ctx.stroke();
    }

    // Draw folded waveform
    const color = foldAmount > 0.001
      ? getModeColor(modeIndex)
      : 'rgba(255,255,255,0.5)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let px = 0; px <= plotW; px++) {
      const idx = (px / plotW) * (N - 1);
      const val = sampleLinear(folded, idx);
      const y = pad + plotH * (1 - (val + 1) * 0.5);
      if (px === 0) ctx.moveTo(pad + px, y);
      else ctx.lineTo(pad + px, y);
    }
    ctx.stroke();

    // Glow
    ctx.strokeStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba');
    ctx.lineWidth = 2.5 * dpr;
    ctx.stroke();
  }, [foldAmount, foldMode, oscAWave, oscBWave, oscALevel, oscBLevel, oscMix]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '80px',
        height: '48px',
        borderRadius: '4px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
};

export default WaveFoldViz;
