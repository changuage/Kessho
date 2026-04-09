import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type {
  EarthTexturePlayerDebugSnapshot,
  EarthTextureSliceDebug,
} from '../../../audio/earthTexturePlayer';

type NatureSliceVizProps = {
  snapshot: EarthTexturePlayerDebugSnapshot | null | undefined;
  accent: string;
  label?: string;
};

type LaneSlice = EarthTextureSliceDebug & {
  lane: number;
};

type SliceLayout = {
  slices: LaneSlice[];
  laneCount: number;
  peakOverlap: number;
  timeStart: number;
  timeEnd: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatSemitones(cents: number): string {
  const semitones = cents / 100;
  const rounded = Math.round(semitones * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}st`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function assignSliceLanes(snapshot: EarthTexturePlayerDebugSnapshot | null | undefined): SliceLayout {
  if (!snapshot || snapshot.activeSlices.length === 0) {
    const now = snapshot?.nowTime ?? 0;
    return {
      slices: [],
      laneCount: 1,
      peakOverlap: 0,
      timeStart: now,
      timeEnd: now + Math.max(1, snapshot?.sliceDuration ?? 1),
    };
  }

  const sorted = [...snapshot.activeSlices].sort((a, b) => a.startTime - b.startTime);
  const laneEnds: number[] = [];
  const slices: LaneSlice[] = [];

  for (const slice of sorted) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= slice.startTime + 1e-4);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(slice.endTime);
    } else {
      laneEnds[lane] = slice.endTime;
    }
    slices.push({ ...slice, lane });
  }

  const lookBack = Math.min(1.2, Math.max(0.35, snapshot.sliceDuration * 0.12));
  const timeStart = Math.min(snapshot.nowTime - lookBack, ...sorted.map((slice) => slice.startTime));
  const timeEnd = Math.max(snapshot.nowTime + 0.45, ...sorted.map((slice) => slice.endTime));

  return {
    slices,
    laneCount: Math.max(1, laneEnds.length),
    peakOverlap: laneEnds.length,
    timeStart,
    timeEnd,
  };
}

export function NatureSliceViz({ snapshot, accent, label = 'Texture' }: NatureSliceVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const layout = useMemo(() => assignSliceLanes(snapshot), [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padX = 8;
    const padY = 6;
    const innerWidth = Math.max(1, width - padX * 2);
    const innerHeight = Math.max(1, height - padY * 2);
    const laneGap = 4;
    const laneCount = Math.max(1, layout.laneCount);
    const laneHeight = clamp(
      (innerHeight - (laneCount - 1) * laneGap) / laneCount,
      8,
      14,
    );
    const windowDuration = Math.max(0.5, layout.timeEnd - layout.timeStart);
    const nowX = padX + ((snapshot?.nowTime ?? layout.timeStart) - layout.timeStart) / windowDuration * innerWidth;

    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let lane = 0; lane < laneCount; lane += 1) {
      const laneY = padY + lane * (laneHeight + laneGap) + laneHeight + 0.5;
      ctx.beginPath();
      ctx.moveTo(padX, laneY);
      ctx.lineTo(width - padX, laneY);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(245,249,255,0.2)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(nowX, padY - 1);
    ctx.lineTo(nowX, height - padY + 1);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!snapshot || layout.slices.length === 0) {
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(245,249,255,0.42)';
      ctx.fillText('Waiting for texture slices…', padX, height * 0.62);
      return;
    }

    ctx.font = '8px monospace';
    ctx.textBaseline = 'middle';

    for (const slice of layout.slices) {
      const x = padX + ((slice.startTime - layout.timeStart) / windowDuration) * innerWidth;
      const endX = padX + ((slice.endTime - layout.timeStart) / windowDuration) * innerWidth;
      const barWidth = Math.max(6, endX - x);
      const y = padY + slice.lane * (laneHeight + laneGap);
      const centerY = y + laneHeight * 0.5;
      const pitchNorm = clamp(slice.detuneCents / 200, -1, 1);
      const speedNorm = clamp((slice.speedMultiplier - 0.8) / 0.4, 0, 1);

      ctx.fillStyle = slice.isPlaying ? `${accent}22` : `${accent}12`;
      ctx.strokeStyle = slice.isPlaying ? `${accent}dd` : `${accent}99`;
      ctx.lineWidth = slice.isPlaying ? 1.6 : 1.1;

      drawRoundedRect(ctx, x, y, barWidth, laneHeight, 5);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = slice.isPlaying ? `${accent}ff` : `${accent}b0`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 7, centerY);
      ctx.lineTo(x + 7, centerY - pitchNorm * (laneHeight * 0.55));
      ctx.stroke();

      const speedX = x + 14 + speedNorm * Math.max(10, barWidth - 28);
      ctx.fillStyle = slice.isPlaying ? `${accent}ff` : `${accent}c8`;
      ctx.beginPath();
      ctx.arc(speedX, y + laneHeight - 3.25, 1.8, 0, Math.PI * 2);
      ctx.fill();

      const pitchLabel = formatSemitones(slice.detuneCents);
      const speedLabel = `${slice.speedMultiplier.toFixed(2)}x`;
      ctx.fillStyle = 'rgba(245,249,255,0.86)';

      if (barWidth > 58) {
        ctx.fillText(pitchLabel, x + 13, centerY);
      }
      if (barWidth > 98) {
        const speedWidth = ctx.measureText(speedLabel).width;
        ctx.fillText(speedLabel, endX - speedWidth - 8, centerY);
      }
    }
  }, [accent, layout, snapshot]);

  const liveCount = snapshot?.playingSliceCount ?? 0;
  const stagedCount = snapshot?.activeSliceCount ?? 0;

  return (
    <div
      className="earth-nature-slice-panel"
      style={{ '--row-accent': accent } as CSSProperties}
      title="Each lane is one slice. The vertical line inside a slice shows pitch detune in semitones, and the bottom dot shows playback-speed variation."
    >
      <div className="earth-nature-slice-meta">
        <span>{snapshot ? `${snapshot.sliceDuration.toFixed(1)}s` : '—'}</span>
        <span>{snapshot ? `dens ${Math.round(snapshot.density * 100)}%` : 'dens —'}</span>
        <span>{liveCount} live</span>
        <span>{stagedCount > 0 ? `x${layout.peakOverlap} peak` : 'idle'}</span>
      </div>
      <canvas
        ref={canvasRef}
        className="earth-nature-slice-canvas"
        aria-label={`${label} texture slice overlap visualization`}
      />
    </div>
  );
}
