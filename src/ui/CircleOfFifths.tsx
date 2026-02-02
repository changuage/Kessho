import React from 'react';

// Circle of Fifths sequence: each step is +7 semitones mod 12
// Starting from C (0): C, G, D, A, E, B, F#/Gb, C#/Db, G#/Ab, D#/Eb, A#/Bb, F
const COF_SEQUENCE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // Semitone values
const COF_LABELS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'F'];

// Find the index in the circle for a given semitone value
function semitoneToCoFIndex(semitone: number): number {
  return COF_SEQUENCE.indexOf(((semitone % 12) + 12) % 12);
}

// Get the semitone value for a given CoF index
export function cofIndexToSemitone(cofIndex: number): number {
  // Handle negative indices (wrap around)
  const normalizedIndex = ((cofIndex % 12) + 12) % 12;
  return COF_SEQUENCE[normalizedIndex];
}

// Calculate the effective root note based on home key and step offset
export function calculateDriftedRoot(homeRoot: number, stepOffset: number): number {
  const homeIndex = semitoneToCoFIndex(homeRoot);
  const driftedIndex = (homeIndex + stepOffset + 12) % 12;
  return COF_SEQUENCE[driftedIndex];
}

// Calculate shortest path on Circle of Fifths between two semitones
// Returns: { steps: number (positive=CW, negative=CCW), path: number[] (semitones) }
export function calculateCoFPath(fromSemitone: number, toSemitone: number): { steps: number; path: number[] } {
  const fromIndex = semitoneToCoFIndex(fromSemitone);
  const toIndex = semitoneToCoFIndex(toSemitone);
  
  // Calculate clockwise and counter-clockwise distances
  const cwDistance = (toIndex - fromIndex + 12) % 12;
  const ccwDistance = (fromIndex - toIndex + 12) % 12;
  
  // Choose shortest path (prefer CW if equal)
  const useCW = cwDistance <= ccwDistance;
  const steps = useCW ? cwDistance : -ccwDistance;
  
  // Build path of semitones
  const path: number[] = [];
  const direction = useCW ? 1 : -1;
  for (let i = 0; i <= Math.abs(steps); i++) {
    const pathIndex = (fromIndex + i * direction + 12) % 12;
    path.push(COF_SEQUENCE[pathIndex]);
  }
  
  return { steps, path };
}

// Get the intermediate root note during a morph based on position (0-100)
export function getMorphedRootNote(
  fromSemitone: number, 
  toSemitone: number, 
  morphPosition: number // 0-100
): { currentRoot: number; cofStep: number; totalSteps: number } {
  if (fromSemitone === toSemitone) {
    return { currentRoot: fromSemitone, cofStep: 0, totalSteps: 0 };
  }
  
  const { steps, path } = calculateCoFPath(fromSemitone, toSemitone);
  const totalSteps = Math.abs(steps);
  
  if (totalSteps === 0) {
    return { currentRoot: fromSemitone, cofStep: 0, totalSteps: 0 };
  }
  
  // Divide 100% evenly among the steps
  // 1 step: change at 50%
  // 2 steps: change at 33%, 66%
  // 3 steps: change at 25%, 50%, 75%
  // N steps: change at 100/(N+1), 200/(N+1), ... N*100/(N+1)
  const segmentSize = 100 / (totalSteps + 1);
  const pathIndex = Math.min(Math.floor((morphPosition + segmentSize / 2) / segmentSize), totalSteps);
  
  return { 
    currentRoot: path[pathIndex], 
    cofStep: steps > 0 ? pathIndex : -pathIndex,
    totalSteps 
  };
}

interface CircleOfFifthsProps {
  homeRoot: number;           // Home key (0-11 semitone)
  currentStep: number;        // Current step offset from home (-6 to +6)
  driftRange: number;         // Max drift range (1-6)
  driftDirection: 'cw' | 'ccw' | 'random';
  enabled: boolean;
  size?: number;              // SVG size in pixels
  // Morph visualization props
  isMorphing?: boolean;       // Whether a morph is in progress
  morphStartRoot?: number;    // Starting root note for the morph path
  morphTargetRoot?: number;   // Target root note during morph
  morphProgress?: number;     // 0-100 morph progress
}

export const CircleOfFifths: React.FC<CircleOfFifthsProps> = ({
  homeRoot,
  currentStep,
  driftRange,
  driftDirection,
  enabled,
  size = 180,
  isMorphing = false,
  morphStartRoot,
  morphTargetRoot,
  morphProgress = 0
}) => {
  const center = size / 2;
  const outerRadius = size * 0.42;
  const innerRadius = size * 0.25;
  const labelRadius = size * 0.34;

  const homeIndex = semitoneToCoFIndex(homeRoot);
  
  // During morph, calculate currentIndex from the captured start root, not the changing homeRoot
  // Outside of morph, use homeRoot + currentStep as normal
  const morphStartIndex = morphStartRoot !== undefined ? semitoneToCoFIndex(morphStartRoot) : homeIndex;
  const currentIndex = isMorphing && morphStartRoot !== undefined
    ? (morphStartIndex + currentStep + 12) % 12
    : (homeIndex + currentStep + 12) % 12;
  
  // Calculate morph path for visualization
  // Use morphStartRoot (captured at morph start) instead of recalculating from current state
  const morphTargetIndex = morphTargetRoot !== undefined ? semitoneToCoFIndex(morphTargetRoot) : undefined;
  const morphPath = isMorphing && morphStartRoot !== undefined && morphTargetRoot !== undefined
    ? calculateCoFPath(morphStartRoot, morphTargetRoot)
    : null;
  
  // Get indices that are part of the morph path
  const morphPathIndices = new Set<number>();
  if (morphPath) {
    for (const semitone of morphPath.path) {
      const cofIndex = semitoneToCoFIndex(semitone);
      morphPathIndices.add(cofIndex);
    }
  }

  // Calculate which keys are in the drift range
  const inRangeIndices = new Set<number>();
  for (let i = -driftRange; i <= driftRange; i++) {
    inRangeIndices.add((homeIndex + i + 12) % 12);
  }

  // Generate arc path for a segment
  const getArcPath = (index: number, radius1: number, radius2: number): string => {
    const startAngle = (index - 0.5) * (360 / 12) - 90;
    const endAngle = (index + 0.5) * (360 / 12) - 90;
    
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    const x1o = center + radius2 * Math.cos(startRad);
    const y1o = center + radius2 * Math.sin(startRad);
    const x2o = center + radius2 * Math.cos(endRad);
    const y2o = center + radius2 * Math.sin(endRad);
    
    const x1i = center + radius1 * Math.cos(endRad);
    const y1i = center + radius1 * Math.sin(endRad);
    const x2i = center + radius1 * Math.cos(startRad);
    const y2i = center + radius1 * Math.sin(startRad);
    
    return `M ${x1o} ${y1o} A ${radius2} ${radius2} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${radius1} ${radius1} 0 0 0 ${x2i} ${y2i} Z`;
  };

  // Get label position
  const getLabelPos = (index: number) => {
    const angle = index * (360 / 12) - 90;
    const rad = (angle * Math.PI) / 180;
    return {
      x: center + labelRadius * Math.cos(rad),
      y: center + labelRadius * Math.sin(rad)
    };
  };

  // Get segment color
  const getSegmentColor = (index: number): string => {
    if (!enabled && !isMorphing) return '#2a2a2a';
    
    // During morph, highlight the path in purple shades
    if (isMorphing && morphPathIndices.has(index)) {
      if (index === currentIndex) return '#a855f7'; // Current position during morph - bright purple
      if (index === morphTargetIndex) return '#7c3aed'; // Target key - darker purple
      return '#6b21a8'; // Path keys - medium purple
    }
    
    if (index === currentIndex) return '#4ade80'; // Current key - bright green
    if (index === homeIndex) return '#3b82f6';    // Home key - blue
    if (inRangeIndices.has(index)) return '#374151'; // In range - dark gray
    return '#1f1f1f';                              // Out of range - darker
  };

  // Get label color
  const getLabelColor = (index: number): string => {
    if (!enabled && !isMorphing) return '#666';
    
    // During morph, use contrasting colors for path
    if (isMorphing && morphPathIndices.has(index)) {
      if (index === currentIndex) return '#000';   // Current - dark for contrast on purple
      if (index === morphTargetIndex) return '#fff'; // Target - white
      return '#e9d5ff'; // Path keys - light purple
    }
    
    if (index === currentIndex) return '#000';     // Current - dark for contrast
    if (index === homeIndex) return '#fff';        // Home - white
    if (inRangeIndices.has(index)) return '#9ca3af'; // In range - light gray
    return '#4b5563';                              // Out of range - dim
  };

  // Direction indicator arrow
  const getDirectionIndicator = () => {
    if (!enabled || driftDirection === 'random') return null;
    
    const arrowSize = size * 0.06;
    const arrowRadius = size * 0.48;
    const angle = driftDirection === 'cw' ? -45 : -135;
    const rad = (angle * Math.PI) / 180;
    const x = center + arrowRadius * Math.cos(rad);
    const y = center + arrowRadius * Math.sin(rad);
    
    const rotation = driftDirection === 'cw' ? angle + 90 : angle - 90;
    
    return (
      <polygon
        points={`0,${-arrowSize} ${arrowSize},${arrowSize} ${-arrowSize},${arrowSize}`}
        transform={`translate(${x}, ${y}) rotate(${rotation})`}
        fill="#6b7280"
      />
    );
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', margin: '0 auto' }}
    >
      {/* Background */}
      <circle cx={center} cy={center} r={outerRadius} fill="#1a1a1a" />
      
      {/* Segments */}
      {COF_SEQUENCE.map((_, index) => (
        <path
          key={index}
          d={getArcPath(index, innerRadius, outerRadius)}
          fill={getSegmentColor(index)}
          stroke="#0a0a0a"
          strokeWidth={1}
        />
      ))}
      
      {/* Labels */}
      {COF_LABELS.map((label, index) => {
        const pos = getLabelPos(index);
        return (
          <text
            key={label}
            x={pos.x}
            y={pos.y}
            fill={getLabelColor(index)}
            fontSize={size * 0.08}
            fontFamily="sans-serif"
            fontWeight={index === currentIndex || index === homeIndex ? 'bold' : 'normal'}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {label}
          </text>
        );
      })}
      
      {/* Center circle - purple border during morph */}
      <circle 
        cx={center} 
        cy={center} 
        r={innerRadius - 2} 
        fill="#0f0f0f" 
        stroke={isMorphing ? '#a855f7' : 'none'}
        strokeWidth={isMorphing ? 2 : 0}
      />
      
      {/* Center text - current key */}
      <text
        x={center}
        y={center - size * 0.04}
        fill={isMorphing ? '#a855f7' : (enabled ? '#4ade80' : '#666')}
        fontSize={size * 0.12}
        fontFamily="sans-serif"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {COF_LABELS[currentIndex]}
      </text>
      
      {/* Step indicator / morph progress */}
      <text
        x={center}
        y={center + size * 0.08}
        fill={isMorphing ? '#c084fc' : (enabled ? '#9ca3af' : '#555')}
        fontSize={size * 0.06}
        fontFamily="sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {isMorphing 
          ? `→ ${morphTargetIndex !== undefined ? COF_LABELS[morphTargetIndex] : '?'} (${Math.round(morphProgress)}%)`
          : (currentStep === 0 ? 'home' : `${currentStep > 0 ? '+' : ''}${currentStep}`)
        }
      </text>
      
      {/* Direction indicator */}
      {getDirectionIndicator()}
    </svg>
  );
};

export default CircleOfFifths;
