import React, { useEffect, useRef, useCallback } from 'react';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { SliderState } from '../state';

interface EnvelopeVisualizerProps {
  voice: DrumVoiceType;
  state: SliderState;
  analyserNode?: AnalyserNode;
  isTriggered: boolean;
}

// ── Constants matching prototype ──
const SPECT_COLS_DEFAULT = 128;
const SPECT_CAPTURE_MS = 25;

const VOICE_FREQ_CEILING: Record<DrumVoiceType, number> = {
  sub: 400,
  kick: 800,
  click: 12000,
  beepHi: 16000,
  beepLo: 4000,
  noise: 18000,
  membrane: 6000,
};

const VOICE_COLORS: Record<DrumVoiceType, string> = {
  sub: '#22c55e',
  kick: '#ef4444',
  click: '#eab308',
  beepHi: '#3b82f6',
  beepLo: '#f97316',
  noise: '#a5c4d4',
  membrane: '#a855f7',
};

interface SpectState {
  columns: Uint8Array[];
  waveform: Uint8Array | null;
  peak: number;
  startTime: number;
  capturing: boolean;
  fadeAlpha: number;
  maxCols: number;
  captureDurationMs: number;
}

// Heatmap color: magnitude 0-255 → RGB
function spectColor(mag: number): string {
  if (mag < 32)  return `rgb(0,0,${mag * 2})`;
  if (mag < 96)  return `rgb(0,${(mag - 32) * 4},${64 + (mag - 32) * 3})`;
  if (mag < 192) return `rgb(${(mag - 96) * 2.5},255,${255 - (mag - 96) * 2.5})`;
  return `rgb(255,${255 - (mag - 192) * 4},${(mag - 192) * 4})`;
}

const EnvelopeVisualizer: React.FC<EnvelopeVisualizerProps> = ({ voice, state, analyserNode, isTriggered }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const spectRef = useRef<SpectState | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const prevTriggeredRef = useRef(false);

  // Get voice-specific envelope params for static curve
  const getEnvelopeParams = useCallback(() => {
    const cap = voice.charAt(0).toUpperCase() + voice.slice(1);
    const levelKey = (`drum${cap}Level`) as keyof SliderState;
    const decayKey = (`drum${cap}Decay`) as keyof SliderState;
    const attackKey = (`drum${cap}Attack`) as keyof SliderState;
    return {
      level: Number(state[levelKey] ?? 0.6),
      decay: Number(state[decayKey] ?? 200),
      attack: Number(state[attackKey] ?? 1),
    };
  }, [voice, state]);

  // Draw the static envelope region (top 42%)
  const drawEnvelopeRegion = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const pad = { top: 12, right: 4, bottom: 10, left: 4 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    if (plotW < 10 || plotH < 10) return;

    const { level, decay, attack } = getEnvelopeParams();
    const maxTime = Math.max(0.01, (attack + decay) / 1000);
    const ox = x + pad.left;
    const oy = y + pad.top;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
      const gy = oy + (plotH * i / 3);
      ctx.beginPath();
      ctx.moveTo(ox, gy);
      ctx.lineTo(ox + plotW, gy);
      ctx.stroke();
    }

    // Time axis
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    const tSteps = maxTime > 0.5 ? 4 : 3;
    for (let i = 0; i <= tSteps; i++) {
      const t = maxTime * i / tSteps;
      const tx = ox + (plotW * i / tSteps);
      const label = t >= 1 ? t.toFixed(1) + 's' : Math.round(t * 1000) + 'ms';
      ctx.fillText(label, tx, y + h - 1);
    }

    // Envelope curve points
    const attackSec = attack / 1000;
    const pts = [
      { t: 0, v: 0 },
      { t: attackSec, v: level },
      { t: attackSec + decay / 1000, v: 0 },
    ];

    // Filled area
    ctx.beginPath();
    ctx.moveTo(ox, oy + plotH);
    pts.forEach(pt => {
      ctx.lineTo(ox + (pt.t / maxTime) * plotW, oy + plotH - pt.v * plotH);
    });
    ctx.lineTo(ox + (pts[pts.length - 1].t / maxTime) * plotW, oy + plotH);
    ctx.closePath();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = VOICE_COLORS[voice] ?? '#22c55e';
    ctx.fill();

    // Curve stroke
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.strokeStyle = VOICE_COLORS[voice] ?? '#22c55e';
    ctx.lineWidth = 1.5;
    let started = false;
    pts.forEach(pt => {
      const px = ox + (pt.t / maxTime) * plotW;
      const py = oy + plotH - pt.v * plotH;
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Legend
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = VOICE_COLORS[voice] ?? '#22c55e';
    ctx.globalAlpha = 0.6;
    ctx.fillText(voice.toUpperCase(), x + w - pad.right - 2, y + pad.top + 8);
    ctx.globalAlpha = 1;
  }, [voice, getEnvelopeParams]);

  // Draw the full combined visualization
  const drawCombinedViz = useCallback((canvas: HTMLCanvasElement) => {
    const ss = spectRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 14, right: 8, bottom: 14, left: 8 };

    const envH = Math.floor((h - pad.top - pad.bottom) * 0.42);
    const gap = 6;
    const liveY = pad.top + envH + gap;
    const liveH = h - liveY - pad.bottom;
    const plotW = w - pad.left - pad.right;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    ctx.fillRect(0, 0, w, h);

    // ═══ TOP: Envelope Curves (always visible) ═══
    drawEnvelopeRegion(ctx, pad.left, pad.top, plotW, envH);

    // ═══ BOTTOM: Live analysis ═══
    if (!ss || (ss.fadeAlpha < 0.01 && !ss.capturing)) return;
    const alpha = ss.fadeAlpha;
    ctx.globalAlpha = alpha;

    // Separator
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, liveY - 2);
    ctx.lineTo(pad.left + plotW, liveY - 2);
    ctx.stroke();

    // Split: spectrogram 68%, waveform+meter 32%
    const spectW = Math.floor(plotW * 0.68);
    const waveX = pad.left + spectW + 6;
    const waveW = plotW - spectW - 6;

    // ── Spectrogram ──
    if (ss.columns.length > 0) {
      const bins = ss.columns[0].length;
      const ceiling = VOICE_FREQ_CEILING[voice] ?? 10000;
      const nyquist = analyserNode ? analyserNode.context.sampleRate / 2 : 22050;
      const maxBin = Math.min(bins, Math.round(ceiling / nyquist * bins));
      const colW = spectW / (ss.maxCols || SPECT_COLS_DEFAULT);
      const binH = liveH / maxBin;

      for (let c = 0; c < ss.columns.length; c++) {
        const col = ss.columns[c];
        const x = pad.left + c * colW;
        for (let b = 0; b < maxBin; b++) {
          const mag = col[b];
          if (mag < 8) continue;
          ctx.fillStyle = spectColor(mag);
          const y = liveY + liveH - (b + 1) * binH;
          ctx.fillRect(x, y, colW + 0.5, binH + 0.5);
        }
      }

      // Frequency axis labels
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'right';
      const ceil = ceiling;
      const freqMarks = ceil <= 500
        ? [50, 100, 200, 300, 400]
        : ceil <= 1000
          ? [100, 250, 500, 750, 1000]
          : ceil <= 5000
            ? [200, 500, 1000, 2000, 4000]
            : [500, 1000, 2000, 5000, 10000];
      for (const f of freqMarks) {
        const bin = Math.round(f / nyquist * bins);
        if (bin >= maxBin) continue;
        const y = liveY + liveH - bin * binH;
        if (y < liveY + 6 || y > liveY + liveH - 4) continue;
        const label = f >= 1000 ? (f / 1000) + 'k' : f + '';
        ctx.fillText(label, pad.left + spectW - 2, y + 3);
      }

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SPECTRUM', pad.left + 2, liveY + 8);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('awaiting signal...', pad.left + spectW / 2, liveY + liveH / 2);
    }

    // ── Waveform ──
    if (ss.waveform) {
      const wfH = Math.floor(liveH * 0.55);
      const wfY = liveY;

      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(waveX, wfY, waveW, wfH);

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(waveX, wfY + wfH / 2);
      ctx.lineTo(waveX + waveW, wfY + wfH / 2);
      ctx.stroke();

      // Waveform line
      ctx.beginPath();
      ctx.strokeStyle = VOICE_COLORS[voice] ?? '#a5c4d4';
      ctx.lineWidth = 1.2;
      const wfLen = ss.waveform.length;
      for (let i = 0; i < waveW; i++) {
        const idx = Math.floor(i * wfLen / waveW);
        const v = (ss.waveform[idx] - 128) / 128;
        const y = wfY + wfH / 2 - v * (wfH / 2 - 2);
        if (i === 0) ctx.moveTo(waveX + i, y);
        else ctx.lineTo(waveX + i, y);
      }
      ctx.stroke();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WAVE', waveX + 2, wfY + 8);

      // ── Level meter ──
      const meterY = wfY + wfH + 4;
      const meterH = liveH - wfH - 8;
      if (meterH > 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(waveX, meterY, waveW, meterH);

        const peak = Math.min(1, ss.peak);
        const barW = peak * (waveW - 4);
        const grad = ctx.createLinearGradient(waveX + 2, 0, waveX + waveW - 2, 0);
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(0.6, '#eab308');
        grad.addColorStop(0.85, '#ef4444');
        ctx.fillStyle = grad;
        ctx.fillRect(waveX + 2, meterY + 2, barW, meterH - 4);

        // dB text
        const db = peak > 0.001 ? (20 * Math.log10(peak)).toFixed(0) : '-∞';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(db + 'dB', waveX + waveW - 3, meterY + meterH / 2 + 3);

        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('LEVEL', waveX + 2, meterY + 8);
      }
    }

    ctx.globalAlpha = 1;
  }, [voice, analyserNode, drawEnvelopeRegion]);

  // Start spectrogram capture when trigger fires
  useEffect(() => {
    if (!isTriggered || prevTriggeredRef.current === isTriggered) return;
    prevTriggeredRef.current = isTriggered;
    if (!analyserNode) return;

    // Clean up previous capture
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    // Dynamic capture duration from envelope
    const { attack, decay } = getEnvelopeParams();
    const maxTimeSec = (attack + decay) / 1000;
    const captureDurationMs = Math.max(1500, maxTimeSec * 1000 + 200);
    const maxCols = Math.max(SPECT_COLS_DEFAULT, Math.ceil(captureDurationMs / SPECT_CAPTURE_MS));

    const ss: SpectState = {
      columns: [],
      waveform: null,
      peak: 0,
      startTime: performance.now(),
      capturing: true,
      fadeAlpha: 1.0,
      maxCols,
      captureDurationMs,
    };
    spectRef.current = ss;
    if (labelRef.current) labelRef.current.textContent = 'live';

    // FFT capture interval
    captureTimerRef.current = setInterval(() => {
      if (!ss.capturing) {
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        return;
      }
      const elapsed = performance.now() - ss.startTime;
      if (elapsed > ss.captureDurationMs) {
        ss.capturing = false;
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        // Begin fade
        if (labelRef.current) labelRef.current.textContent = 'fading...';
        fadeTimerRef.current = setInterval(() => {
          ss.fadeAlpha -= 0.02;
          if (ss.fadeAlpha <= 0) {
            ss.fadeAlpha = 0;
            if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
            if (labelRef.current) labelRef.current.textContent = 'envelopes';
          }
        }, 30);
        return;
      }

      const bins = analyserNode.frequencyBinCount;
      const col = new Uint8Array(bins);
      analyserNode.getByteFrequencyData(col);
      ss.columns.push(col);
      if (ss.columns.length > ss.maxCols) ss.columns.shift();

      // Waveform
      const wf = new Uint8Array(analyserNode.fftSize);
      analyserNode.getByteTimeDomainData(wf);
      ss.waveform = wf;

      // Peak level
      let mx = 0;
      for (let i = 0; i < wf.length; i++) {
        const v = Math.abs(wf[i] - 128) / 128;
        if (v > mx) mx = v;
      }
      ss.peak = Math.max(ss.peak * 0.92, mx);
    }, SPECT_CAPTURE_MS);

    // Render loop
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderLoop = () => {
      drawCombinedViz(canvas);
      if (ss.capturing || ss.fadeAlpha > 0.01) {
        rafRef.current = requestAnimationFrame(renderLoop);
      } else {
        // Fully faded — draw static envelope only
        drawCombinedViz(canvas);
      }
    };
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [isTriggered, analyserNode, getEnvelopeParams, drawCombinedViz]);

  // Reset trigger tracking when trigger goes false
  useEffect(() => {
    if (!isTriggered) {
      prevTriggeredRef.current = false;
    }
  }, [isTriggered]);

  // Draw static envelope on mount or param change (no live data)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ss = spectRef.current;
    if (ss && (ss.capturing || ss.fadeAlpha > 0.01)) return; // live viz active
    drawCombinedViz(canvas);
  }, [state, voice, drawCombinedViz]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="env-visualizer-wrap">
      <span ref={labelRef} className="viz-mode-label">envelopes</span>
      <canvas ref={canvasRef} className="env-visualizer" />
    </div>
  );
};

export default EnvelopeVisualizer;
