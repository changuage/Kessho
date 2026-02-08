/**
 * Journey Mode Types (Diamond Matrix Layout)
 * 
 * Data models for the Journey Mode feature - linking up to 4 presets
 * in a continuous loop with phrase lengths, morph durations, and
 * probabilistic transitions.
 * 
 * Layout: Diamond Matrix with START/END in center, presets at cardinal positions:
 *   - Center: START/END
 *   - Top (12:00): P2
 *   - Right (3:00): P3
 *   - Bottom (6:00): P4
 *   - Left (9:00): P1
 */

import { SavedPreset } from '../ui/state';

/**
 * Cardinal positions for diamond matrix layout
 */
export type DiamondPosition = 'center' | 'top' | 'right' | 'bottom' | 'left';

/**
 * Phases of journey playback
 * - idle: Not playing
 * - playing: Playing a preset
 * - morphing: Transitioning between presets
 * - self-loop: Self-loop animation (same preset, just visual feedback)
 * - ending: Fading out to end (connection to center)
 * - ended: Journey complete
 */
export type JourneyPhase = 'idle' | 'playing' | 'morphing' | 'self-loop' | 'ending' | 'ended';

/**
 * A node in the journey - represents a preset with its play duration
 */
export interface JourneyNode {
  id: string;                    // Unique identifier
  presetId: string;              // Reference to saved preset (empty string for center/empty slots)
  presetName: string;            // Display name (empty for empty slots)
  phraseLength: number;          // Duration to play this preset (in phrases) - min value when in dual mode
  phraseLengthMax?: number;      // Max value when in dual mode (undefined = single mode)
  position: DiamondPosition;     // Cardinal position in diamond layout
  color: string;                 // Node color from preset or assigned
}

/**
 * A connection between two nodes with morph settings
 */
export interface JourneyConnection {
  id: string;                    // Unique identifier
  fromNodeId: string;            // Source node
  toNodeId: string;              // Destination node
  morphDuration: number;         // Duration of morph transition (in phrases) - min value when in dual mode
  morphDurationMax?: number;     // Max value when in dual mode (undefined = single mode)
  probability: number;           // 0-1, chance of taking this path
}

/**
 * The complete journey configuration
 */
export interface JourneyConfig {
  id: string;                    // Unique identifier
  name: string;                  // Journey name
  nodes: JourneyNode[];          // All nodes (2-4)
  connections: JourneyConnection[]; // All connections between nodes
  autoAdvance: boolean;          // Auto-advance to next node or wait at end
  loopEnabled: boolean;          // Loop back to start when journey ends
}

/**
 * Runtime state of journey playback
 */
export interface JourneyState {
  phase: JourneyPhase;           // Current phase
  currentNodeId: string | null;  // Node currently playing
  nextNodeId: string | null;     // Node we're morphing to (if morphing)
  plannedNextNodeId: string | null; // Pre-selected next node (determined at start of playing phase)
  morphProgress: number;         // 0-1 progress through current morph
  phraseProgress: number;        // 0-1 progress through current phrase
  elapsedTime: number;           // Total elapsed time in ms
  phraseStartTime: number;       // When current phrase started
  morphStartTime: number;        // When current morph started
  resolvedPhraseDuration: number; // Randomized phrase duration (from dual mode range)
  resolvedMorphDuration: number;  // Randomized morph duration (from dual mode range)
}

/**
 * Callbacks for journey events
 */
export interface JourneyCallbacks {
  onNodeStart: (nodeId: string) => void;
  onNodeComplete: (nodeId: string) => void;
  onMorphStart: (fromId: string, toId: string) => void;
  onMorphProgress: (progress: number) => void;
  onMorphComplete: (fromId: string, toId: string) => void;
  onPhraseProgress: (progress: number) => void;
  onJourneyEnd: () => void;
}

/**
 * Color palette for journey nodes - uses colors from the app's design
 */
export const JOURNEY_NODE_COLORS = [
  '#4fc3f7', // Cyan - primary active color
  '#C4724E', // Muted orange - synth
  '#7B9A6D', // Sage green - granular
  '#D4A520', // Mustard gold - lead
  '#8B5CF6', // Purple - drum
  '#5A7B8A', // Slate blue - wave
  '#E8DCC4', // Warm cream - reverb
];

/**
 * Default values for journey configuration
 * All durations are in phrases (1 phrase = 16 seconds by default)
 */
export const JOURNEY_DEFAULTS = {
  phraseLength: 1,        // phrases to play before transitioning
  morphDuration: 0.5,     // phrases for morph transition (8 seconds at default)
  probability: 1.0,       // 100%
  minNodes: 2,
  maxNodes: 4,
};

/**
 * Generate a unique ID for journey elements
 */
export function generateJourneyId(): string {
  return `journey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a default journey node from a preset
 */
export function createJourneyNode(
  preset: SavedPreset | null,
  position: DiamondPosition,
  colorIndex: number
): JourneyNode {
  return {
    id: generateJourneyId(),
    presetId: preset?.name ?? '',
    presetName: preset?.name ?? '',
    phraseLength: JOURNEY_DEFAULTS.phraseLength,
    position,
    color: JOURNEY_NODE_COLORS[colorIndex % JOURNEY_NODE_COLORS.length],
  };
}

/**
 * Create an empty slot node for a position
 */
export function createEmptySlot(position: DiamondPosition): JourneyNode {
  return {
    id: generateJourneyId(),
    presetId: '',
    presetName: '',
    phraseLength: JOURNEY_DEFAULTS.phraseLength,
    position,
    color: '#444',
  };
}

/**
 * Create a default connection between two nodes
 */
export function createJourneyConnection(
  fromNodeId: string,
  toNodeId: string
): JourneyConnection {
  return {
    id: generateJourneyId(),
    fromNodeId,
    toNodeId,
    morphDuration: JOURNEY_DEFAULTS.morphDuration,
    probability: JOURNEY_DEFAULTS.probability,
  };
}

/**
 * Create a simple 2-node journey (equivalent to current morph behavior)
 */
export function createSimpleJourney(
  presetA: SavedPreset,
  presetB: SavedPreset
): JourneyConfig {
  const nodeA = createJourneyNode(presetA, 'left', 0);
  const nodeB = createJourneyNode(presetB, 'right', 1);
  
  const connAtoB = createJourneyConnection(nodeA.id, nodeB.id);
  const connBtoA = createJourneyConnection(nodeB.id, nodeA.id);
  
  return {
    id: generateJourneyId(),
    name: `${presetA.name} ↔ ${presetB.name}`,
    nodes: [nodeA, nodeB],
    connections: [connAtoB, connBtoA],
    autoAdvance: true,
    loopEnabled: true,
  };
}

/**
 * Create a full diamond journey config with all 4 slots + center (some may be empty)
 */
export function createDiamondJourney(
  presets: (SavedPreset | null)[] = []
): JourneyConfig {
  const positions: DiamondPosition[] = ['left', 'top', 'right', 'bottom'];
  const nodes: JourneyNode[] = positions.map((pos, i) => {
    const preset = presets[i] ?? null;
    return preset 
      ? createJourneyNode(preset, pos, i)
      : createEmptySlot(pos);
  });
  
  // Add center node (START/END)
  const centerNode: JourneyNode = {
    id: generateJourneyId(),
    presetId: '__CENTER__',
    presetName: 'START/END',
    phraseLength: 0,
    position: 'center',
    color: '#4fc3f7',
  };
  nodes.push(centerNode);
  
  return {
    id: generateJourneyId(),
    name: 'New Journey',
    nodes,
    connections: [],
    autoAdvance: true,
    loopEnabled: true,
  };
}

/**
 * Get x,y coordinates for a diamond position
 */
export function getDiamondCoordinates(
  position: DiamondPosition,
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number } {
  switch (position) {
    case 'center':
      return { x: centerX, y: centerY };
    case 'top':
      return { x: centerX, y: centerY - radius };
    case 'right':
      return { x: centerX + radius, y: centerY };
    case 'bottom':
      return { x: centerX, y: centerY + radius };
    case 'left':
      return { x: centerX - radius, y: centerY };
  }
}

/**
 * Calculate curved Bezier path between two diamond positions
 * Curves around the center to avoid overlapping
 */
export function calculateCurvedPath(
  fromPos: DiamondPosition,
  toPos: DiamondPosition,
  centerX: number,
  centerY: number,
  radius: number
): string {
  const from = getDiamondCoordinates(fromPos, centerX, centerY, radius);
  const to = getDiamondCoordinates(toPos, centerX, centerY, radius);
  
  // If either is center, draw straight line
  if (fromPos === 'center' || toPos === 'center') {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  
  // Check if this is an opposite connection (crosses center)
  const isOpposite = 
    (fromPos === 'left' && toPos === 'right') ||
    (fromPos === 'right' && toPos === 'left') ||
    (fromPos === 'top' && toPos === 'bottom') ||
    (fromPos === 'bottom' && toPos === 'top');
  
  // Determine curve direction: one connection curves one way, reverse curves other way
  const curveDirection = getCurveDirection(fromPos, toPos);
  
  if (isOpposite) {
    // For opposite connections, curve around the center using perpendicular offset
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    
    // Perpendicular to the line between from and to
    const lineX = to.x - from.x;
    const lineY = to.y - from.y;
    const lineLen = Math.sqrt(lineX * lineX + lineY * lineY);
    const perpX = -lineY / lineLen;
    const perpY = lineX / lineLen;
    
    // Offset perpendicular to the line, direction based on connection order
    const curveOffset = radius * 0.7 * curveDirection;
    
    const controlX = midX + perpX * curveOffset;
    const controlY = midY + perpY * curveOffset;
    
    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
  } else {
    // For adjacent connections, curve outward or inward from center
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    
    // Direction from center to midpoint (to push curve outward)
    const dirFromCenterX = midX - centerX;
    const dirFromCenterY = midY - centerY;
    const dirLen = Math.sqrt(dirFromCenterX * dirFromCenterX + dirFromCenterY * dirFromCenterY);
    
    // Normalize direction
    const normX = dirLen > 0 ? dirFromCenterX / dirLen : 0;
    const normY = dirLen > 0 ? dirFromCenterY / dirLen : 0;
    
    // Curve offset - push control point away from or toward center
    const curveOffset = radius * 0.6 * curveDirection;
    
    const controlX = midX + normX * curveOffset;
    const controlY = midY + normY * curveOffset;
    
    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
  }
}

/**
 * Determine curve direction (1 or -1) based on positions
 * Going "forward" around the diamond: clockwise
 * Going "backward": counterclockwise
 */
function getCurveDirection(from: DiamondPosition, to: DiamondPosition): number {
  const order: DiamondPosition[] = ['left', 'top', 'right', 'bottom'];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  
  // Calculate if going clockwise or counterclockwise
  const diff = (toIdx - fromIdx + 4) % 4;
  return diff <= 2 ? 1 : -1;
}

/**
 * Calculate node positions for N nodes on a ring (legacy - kept for compatibility)
 */
export function calculateNodePositions(nodeCount: number): DiamondPosition[] {
  const positions: DiamondPosition[] = ['left', 'top', 'right', 'bottom'];
  return positions.slice(0, nodeCount);
}

/**
 * Get the angle (radians) for a position value (0-1) - legacy
 */
export function positionToAngle(position: number): number {
  return position * 2 * Math.PI - Math.PI / 2;
}

/**
 * Get x,y coordinates for a position on a ring - legacy
 */
export function positionToCoordinates(
  position: number,
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number } {
  const angle = positionToAngle(position);
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}
