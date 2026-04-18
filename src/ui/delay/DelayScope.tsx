import React, { useRef, useEffect, useCallback } from 'react';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';

export interface DelayScopeProps {
  echoAnalyser: AnalyserNode | null;
  clockedAnalyser: AnalyserNode | null;
  echoPingPong: boolean;
  clockedWarp: string;
}

const BUFFER_SIZE = 240; // ~4 seconds at 60fps (drawn every 2nd frame = 30fps)
const ECHO_COLOR = 'rgba(185, 201, 255,';
const CLOCKED_COLOR = 'rgba(159, 229, 240,';

const DelayScope: React.FC<DelayScopeProps> = ({
  echoAnalyser,
  clockedAnalyser,
  echoPingPong,
  clockedWarp,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const echoBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_SIZE));
  const clockedBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_SIZE));
  const writeIndexRef = useRef(0);
  const echoDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const clockedDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const { canAnimate } = useAnimationVisibility(containerRef);
  const hasActiveAnalysers = Boolean(echoAnalyser || clockedAnalyser);
  const shouldAnimate = canAnimate && hasActiveAnalysers;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getCappedCanvasDpr();
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const wi = writeIndexRef.current;
    const echoBuf = echoBufferRef.current;
    const clockedBuf = clockedBufferRef.current;

    // Sample analysers
    if (echoAnalyser) {
      if (!echoDataRef.current || echoDataRef.current.length !== echoAnalyser.fftSize) {
        echoDataRef.current = new Uint8Array(new ArrayBuffer(echoAnalyser.fftSize));
      }
      echoAnalyser.getByteTimeDomainData(echoDataRef.current);
      let peak = 0;
      for (let i = 0; i < echoDataRef.current.length; i++) {
        peak = Math.max(peak, Math.abs(echoDataRef.current[i]! - 128));
      }
      echoBuf[wi] = peak / 128;
    } else {
      echoBuf[wi] = 0;
    }

    if (clockedAnalyser) {
      if (!clockedDataRef.current || clockedDataRef.current.length !== clockedAnalyser.fftSize) {
        clockedDataRef.current = new Uint8Array(new ArrayBuffer(clockedAnalyser.fftSize));
      }
      clockedAnalyser.getByteTimeDomainData(clockedDataRef.current);
      let peak = 0;
      for (let i = 0; i < clockedDataRef.current.length; i++) {
        peak = Math.max(peak, Math.abs(clockedDataRef.current[i]! - 128));
      }
      clockedBuf[wi] = peak / 128;
    } else {
      clockedBuf[wi] = 0;
    }

    writeIndexRef.current = (wi + 1) % BUFFER_SIZE;

    const laneH = h / 2 - 2;
    const barW = Math.max(1, w / BUFFER_SIZE);

    // ── Echo Line (top lane) ──
    ctx.fillStyle = 'rgba(185, 201, 255, 0.4)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('ECHO LINE', 6, 3);

    for (let i = 0; i < BUFFER_SIZE; i++) {
      const bufIdx = (writeIndexRef.current + i) % BUFFER_SIZE;
      const peak = echoBuf[bufIdx]!;
      if (peak < 0.005) continue;
      const x = i * barW;
      const barH = peak * laneH;
      const alpha = 0.3 + peak * 0.7;

      if (echoPingPong && i % 2 === 0) {
        // L above center
        ctx.fillStyle = `${ECHO_COLOR} ${alpha})`;
        ctx.fillRect(x, laneH / 2 - barH, barW, barH);
      } else if (echoPingPong) {
        // R below center
        ctx.fillStyle = `${ECHO_COLOR} ${alpha * 0.8})`;
        ctx.fillRect(x, laneH / 2, barW, barH);
      } else {
        ctx.fillStyle = `${ECHO_COLOR} ${alpha})`;
        ctx.fillRect(x, laneH - barH, barW, barH);
      }
    }

    // ── Divider ──
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // ── Clocked Space (bottom lane) ──
    ctx.fillStyle = 'rgba(159, 229, 240, 0.4)';
    ctx.fillText('CLOCKED SPACE', 6, h / 2 + 3);
    const bottomY = h / 2 + 2;

    for (let i = 0; i < BUFFER_SIZE; i++) {
      const bufIdx = (writeIndexRef.current + i) % BUFFER_SIZE;
      const peak = clockedBuf[bufIdx]!;
      if (peak < 0.005) continue;
      const x = i * barW;
      const barH = peak * laneH;
      const alpha = 0.3 + peak * 0.7;

      if (clockedWarp === 'grainCrossfade' && i % 3 === 0) {
        // Dotted bars for grain warp
        ctx.fillStyle = `${CLOCKED_COLOR} ${alpha * 0.5})`;
        for (let dy = 0; dy < barH; dy += 3) {
          ctx.fillRect(x, bottomY + laneH - dy - 1, barW, 1);
        }
      } else {
        let color = CLOCKED_COLOR;
        if (clockedWarp === 'filterSweep') {
          const hue = 20 + (peak * 180);
          color = `hsla(${hue}, 70%, 65%,`;
        }
        ctx.fillStyle = `${color} ${alpha})`;
        ctx.fillRect(x, bottomY + laneH - barH, barW, barH);
      }
    }
  }, [echoAnalyser, clockedAnalyser, echoPingPong, clockedWarp]);

  useEffect(() => {
    let frame = 0;
    let running = true;
    const cancelLoop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    const loop = () => {
      if (!running) return;
      frame++;
      if (frame % 2 === 0) draw();
      if (shouldAnimate) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
      }
    };
    draw();
    if (shouldAnimate) {
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => {
      running = false;
      cancelLoop();
    };
  }, [draw, shouldAnimate]);

  return (
    <div ref={containerRef} className="delay-scope">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default DelayScope;
