/**
 * DLA Snowflake Worker
 * 
 * Computes Diffusion-Limited Aggregation in 6 separate 60° wedges,
 * each with its own complexity based on the associated audio parameter.
 * Results are mirrored for 12-fold symmetry.
 */

interface DLAParams {
  armComplexities: number[];  // 6 values, one per arm (0-1)
  maxParticlesPerArm: number;
  maxRadius: number;
  particleRadius: number;
  gridSize: number;
}

interface DLAPoint {
  x: number;
  y: number;
  radius: number;
  arm: number;  // Which arm this point belongs to (0-5)
}

interface WorkerMessage {
  type: 'start' | 'stop' | 'updateParams';
  params?: Partial<DLAParams>;
}

interface WorkerResponse {
  type: 'points' | 'complete' | 'progress';
  points?: DLAPoint[];
  progress?: number;
}

// State
let isRunning = false;
let params: DLAParams = {
  armComplexities: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  maxParticlesPerArm: 400,
  maxRadius: 180,
  particleRadius: 1.5,
  gridSize: 400,
};

// Per-arm state
let armGrids: boolean[][][] = [];  // 6 grids, one per arm
let stuckPoints: DLAPoint[] = [];
let armMaxRadius: number[] = [];

// Initialize grids for all arms
function initGrids() {
  const size = params.gridSize;
  armGrids = Array(6).fill(null).map(() => 
    Array(size).fill(null).map(() => Array(size).fill(false))
  );
  stuckPoints = [];
  armMaxRadius = Array(6).fill(5);
}

// Convert world coords to grid coords
function toGrid(x: number, y: number): { gx: number; gy: number } {
  const half = params.gridSize / 2;
  return {
    gx: Math.floor(x + half),
    gy: Math.floor(y + half),
  };
}

// Check if position has a neighbor in arm's grid
function hasNeighbor(arm: number, gx: number, gy: number): boolean {
  const size = params.gridSize;
  const grid = armGrids[arm];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && grid[nx][ny]) {
        return true;
      }
    }
  }
  return false;
}

// Seed the initial spine for an arm (grows along positive X axis in wedge space)
function seedSpine(arm: number, complexity: number) {
  const spineLength = Math.floor(8 + complexity * 12);  // 8-20 based on complexity
  const grid = armGrids[arm];
  
  for (let i = 0; i < spineLength; i++) {
    const x = i * 2;
    const y = 0;
    const { gx, gy } = toGrid(x, y);
    if (gx >= 0 && gx < params.gridSize && gy >= 0 && gy < params.gridSize) {
      grid[gx][gy] = true;
      stuckPoints.push({ x, y, radius: params.particleRadius, arm });
    }
  }
  armMaxRadius[arm] = spineLength * 2;
}

// Random walk step with complexity-based behavior
function randomStep(complexity: number): { dx: number; dy: number } {
  const angle = Math.random() * Math.PI * 2;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  
  // Radial drift - lower complexity = more radial (straighter arms)
  const drift = (1 - complexity) * 0.4 + 0.1;
  dx += drift;
  
  // Branchiness - higher complexity = more lateral movement
  if (Math.random() < complexity * 0.4) {
    dy += (Math.random() - 0.5) * complexity * 1.5;
  }
  
  const len = Math.sqrt(dx * dx + dy * dy);
  return { dx: dx / len * 2, dy: dy / len * 2 };
}

// Run DLA for a single arm
async function growArm(arm: number, complexity: number): Promise<DLAPoint[]> {
  const grid = armGrids[arm];
  const newPoints: DLAPoint[] = [];
  
  // Calculate particles for this arm based on complexity
  const targetParticles = Math.floor(50 + complexity * params.maxParticlesPerArm);
  const stickiness = 0.4 + complexity * 0.4;
  const maxSteps = 500 + complexity * 2000;
  
  let particlesStuck = 0;
  
  while (isRunning && particlesStuck < targetParticles) {
    // Spawn walker on circle just outside current max radius
    const spawnRadius = armMaxRadius[arm] + 8;
    
    // Spawn within the 30° half-wedge (will be mirrored)
    const spawnAngle = Math.random() * (Math.PI / 6);  // 0 to 30 degrees
    let x = Math.cos(spawnAngle) * spawnRadius;
    let y = Math.sin(spawnAngle) * spawnRadius;
    
    let steps = 0;
    let stuck = false;
    
    while (steps < maxSteps && !stuck) {
      steps++;
      
      // Random walk step
      const { dx, dy } = randomStep(complexity);
      x += dx;
      y += dy;
      
      // Keep y positive (we'll mirror later)
      y = Math.abs(y);
      
      // Fold into wedge if needed
      if (y > x * 0.577) {  // tan(30°) ≈ 0.577
        // Reflect across the 30° line
        const angle = Math.atan2(y, x);
        const r = Math.sqrt(x * x + y * y);
        const newAngle = Math.PI / 6 - (angle - Math.PI / 6);
        x = r * Math.cos(Math.max(0, newAngle));
        y = r * Math.sin(Math.max(0, newAngle));
      }
      
      // Check bounds
      const dist = Math.sqrt(x * x + y * y);
      if (dist > params.maxRadius || dist > armMaxRadius[arm] + 30 || dist < 1) {
        break;  // Respawn
      }
      
      // Check grid for neighbor
      const { gx, gy } = toGrid(x, y);
      if (gx >= 0 && gx < params.gridSize && gy >= 0 && gy < params.gridSize) {
        if (hasNeighbor(arm, gx, gy)) {
          if (Math.random() < stickiness) {
            grid[gx][gy] = true;
            const point = { x, y, radius: params.particleRadius, arm };
            stuckPoints.push(point);
            newPoints.push(point);
            particlesStuck++;
            stuck = true;
            
            if (dist > armMaxRadius[arm]) {
              armMaxRadius[arm] = Math.min(dist, params.maxRadius);
            }
          }
        }
      }
    }
    
    // Yield occasionally
    if (particlesStuck % 20 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return newPoints;
}

// Run DLA simulation for all arms
async function runDLA() {
  initGrids();
  
  // Seed all arms
  for (let arm = 0; arm < 6; arm++) {
    const complexity = params.armComplexities[arm];
    seedSpine(arm, complexity);
  }
  
  // Send initial points
  self.postMessage({
    type: 'points',
    points: [...stuckPoints],
  } as WorkerResponse);
  
  // Grow each arm
  for (let arm = 0; arm < 6 && isRunning; arm++) {
    const complexity = params.armComplexities[arm];
    const newPoints = await growArm(arm, complexity);
    
    // Send batch update for this arm
    if (newPoints.length > 0) {
      self.postMessage({
        type: 'points',
        points: newPoints,
        progress: (arm + 1) / 6,
      } as WorkerResponse);
    }
  }
  
  self.postMessage({
    type: 'complete',
    points: stuckPoints,
  } as WorkerResponse);
  
  isRunning = false;
}

// Handle messages from main thread
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, params: newParams } = e.data;
  
  switch (type) {
    case 'start':
      if (newParams) {
        params = { ...params, ...newParams };
      }
      isRunning = true;
      runDLA();
      break;
      
    case 'stop':
      isRunning = false;
      break;
      
    case 'updateParams':
      if (newParams) {
        params = { ...params, ...newParams };
      }
      break;
  }
};

export {};
