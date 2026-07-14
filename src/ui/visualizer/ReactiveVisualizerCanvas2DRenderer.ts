import type { ReactiveVisualizerFrame } from './ReactiveVisualizerRenderer';

const ENGINE_COLORS = [
  'rgba(232, 220, 196, 0.45)',
  'rgba(212, 165, 32, 0.42)',
  'rgba(139, 92, 246, 0.38)',
  'rgba(123, 154, 109, 0.4)',
  'rgba(232, 180, 74, 0.4)',
  'rgba(94, 168, 166, 0.36)',
  'rgba(176, 120, 90, 0.38)',
] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export class ReactiveVisualizerCanvas2DRenderer {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly engineAmounts = new Float32Array(ENGINE_COLORS.length);
  private phase = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d');
  }

  get available(): boolean {
    return this.context !== null;
  }

  render(frame: ReactiveVisualizerFrame): void {
    const ctx = this.context;
    if (!ctx) return;
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const snapshot = frame.snapshot;
    const controls = frame.controls;
    const pulses = snapshot.pulses;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.42;
    this.phase += 0.008 + Math.max(0, controls.motion) * 0.018 + Math.max(0, -controls.motion) * 0.035;

    ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
    const litBackground = Math.max(0, controls.background);
    const darkBackground = Math.max(0, -controls.background);
    const bgR = Math.round(16 + litBackground * 30);
    const bgG = Math.round(15 + litBackground * 28);
    const bgB = Math.round(14 + litBackground * 24);
    ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${0.12 + darkBackground * 0.14 + litBackground * 0.08 + Math.max(0, controls.diffusion) * 0.1})`;
    ctx.fillRect(0, 0, width, height);

    const symmetry = Math.max(4, Math.round(6 + Math.max(0, -controls.kaleidoscope) * 10 + Math.abs(controls.kaleidoscope) * 4));
    this.engineAmounts[0] = snapshot.pad + pulses.pad;
    this.engineAmounts[1] = snapshot.lead + pulses.lead;
    this.engineAmounts[2] = snapshot.drums + pulses.drums;
    this.engineAmounts[3] = snapshot.earth + pulses.earth;
    this.engineAmounts[4] = snapshot.granular + pulses.granular;
    this.engineAmounts[5] = snapshot.delay + pulses.delay;
    this.engineAmounts[6] = snapshot.reverb + pulses.reverb;

    ctx.globalCompositeOperation = 'lighter';
    const shapeSides = Math.max(3, Math.round(4 + controls.shape * (controls.shape > 0 ? 20 : 1)));
    const organicWarp = Math.max(0, controls.organic);
    const blobWarp = Math.max(0, -controls.edges);
    const reducedDetail = frame.quality.shaderDetail < 0.5;
    const engineLimit = reducedDetail ? 5 : ENGINE_COLORS.length;
    const pointBudget = reducedDetail ? 26 : 40;
    for (let ring = 0; ring < engineLimit; ring += 1) {
      const amount = this.engineAmounts[ring] ?? 0;
      const amp = clamp(amount + pulses.global * 0.25, 0, 1.2);
      if (amp < 0.02) continue;
      ctx.strokeStyle = ENGINE_COLORS[ring] ?? ENGINE_COLORS[0];
      ctx.lineWidth = 0.8 + amp * 2.4;
      ctx.beginPath();
      const sides = Math.max(3, shapeSides + Math.round((ring - 3) * 0.3));
      const pointsPerSide = Math.max(5, Math.round(pointBudget / sides * symmetry));
      const totalPoints = sides * pointsPerSide;
      for (let i = 0; i <= totalPoints; i += 1) {
        const unit = i / Math.max(1, totalPoints);
        const angle = unit * Math.PI * 2;
        const warp = Math.sin(unit * Math.PI * 2 * symmetry + this.phase * (ring * 0.7 + 1))
          + Math.sin(unit * Math.PI * 4 * symmetry * 0.5 + this.phase * 0.6 + ring) * 0.4;
        const breathe = Math.sin(this.phase * 0.3 + ring * 0.9) * 0.02;
        const sectorAngle = Math.PI * 2 / sides;
        const withinSector = ((angle % sectorAngle) + sectorAngle) % sectorAngle;
        const polyMod = Math.cos(withinSector - sectorAngle / 2);
        const stretchMod = 1 + organicWarp * Math.sin(angle * 2 + ring * 1.3 + this.phase * 0.2) * 0.15;
        const blobMod = 1 + blobWarp * (Math.sin(angle * 3 + ring * 2.1 + this.phase * 0.4) * 0.12
          + Math.sin(angle * 5 + ring * 1.3 - this.phase * 0.3) * 0.08);
        const baseR = radius * (0.18 + ring * 0.088 + warp * 0.02 * (1 + amp) + breathe);
        const r = baseR / Math.max(0.5, polyMod) * stretchMod * blobMod;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
