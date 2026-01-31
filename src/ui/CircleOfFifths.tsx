import React from 'react';

// Circle of Fifths sequence: each step is +7 semitones mod 12
// Starting from C (0): C, G, D, A, E, B, F#/Gb, C#/Db, G#/Ab, D#/Eb, A#/Bb, F
const COF_SEQUENCE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // Semitone values
const COF_LABELS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'F'];

// Find the index in the circle for a given semitone value
function semitoneToCoFIndex(semitone: number): number {
  return COF_SEQUENCE.indexOf(semitone % 12);
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

interface CircleOfFifthsProps {
  homeRoot: number;           // Home key (0-11 semitone)
  currentStep: number;        // Current step offset from home (-6 to +6)
  driftRange: number;         // Max drift range (1-6)
  driftDirection: 'cw' | 'ccw' | 'random';
  enabled: boolean;
  size?: number;              // SVG size in pixels
}

export const CircleOfFifths: React.FC<CircleOfFifthsProps> = ({
  homeRoot,
  currentStep,
  driftRange,
  driftDirection,
  enabled,
  size = 180
}) => {
  const center = size / 2;
  const outerRadius = size * 0.42;
  const innerRadius = size * 0.25;
  const labelRadius = size * 0.34;

  const homeIndex = semitoneToCoFIndex(homeRoot);
  const currentIndex = (homeIndex + currentStep + 12) % 12;

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
    if (!enabled) return '#2a2a2a';
    if (index === currentIndex) return '#4ade80'; // Current key - bright green
    if (index === homeIndex) return '#3b82f6';    // Home key - blue
    if (inRangeIndices.has(index)) return '#374151'; // In range - dark gray
    return '#1f1f1f';                              // Out of range - darker
  };

  // Get label color
  const getLabelColor = (index: number): string => {
    if (!enabled) return '#666';
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
      
      {/* Center circle */}
      <circle cx={center} cy={center} r={innerRadius - 2} fill="#0f0f0f" />
      
      {/* Center text - current key */}
      <text
        x={center}
        y={center - size * 0.04}
        fill={enabled ? '#4ade80' : '#666'}
        fontSize={size * 0.12}
        fontFamily="sans-serif"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {COF_LABELS[currentIndex]}
      </text>
      
      {/* Step indicator */}
      <text
        x={center}
        y={center + size * 0.08}
        fill={enabled ? '#9ca3af' : '#555'}
        fontSize={size * 0.06}
        fontFamily="sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {currentStep === 0 ? 'home' : `${currentStep > 0 ? '+' : ''}${currentStep}`}
      </text>
      
      {/* Direction indicator */}
      {getDirectionIndicator()}
    </svg>
  );
};

export default CircleOfFifths;
