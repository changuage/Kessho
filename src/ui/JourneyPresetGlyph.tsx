import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { DiamondPosition } from '../audio/journeyTypes';
import type { JourneyPresetPreview } from '../presets/types';

const POSITION_ORDER: DiamondPosition[] = ['center', 'top', 'right', 'bottom', 'left'];
const COORDS: Record<DiamondPosition, { x: number; y: number }> = {
  center: { x: 16, y: 16 },
  top: { x: 16, y: 5.5 },
  right: { x: 26.5, y: 16 },
  bottom: { x: 16, y: 26.5 },
  left: { x: 5.5, y: 16 },
};
const CENTER_POINT = COORDS.center;
const GLYPH_RADIUS = COORDS.right.x - COORDS.center.x;
const OUTER_POSITION_ORDER: DiamondPosition[] = ['left', 'top', 'right', 'bottom'];

type Point = { x: number; y: number };

type ConnectionGeometry = { path: string } | null;

interface JourneyPresetGlyphProps {
  preview?: JourneyPresetPreview;
  color?: string;
  mutedColor?: string;
  style?: CSSProperties;
}

function getCurveDirection(from: DiamondPosition, to: DiamondPosition): number {
  const fromIdx = OUTER_POSITION_ORDER.indexOf(from);
  const toIdx = OUTER_POSITION_ORDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return 1;
  const diff = (toIdx - fromIdx + OUTER_POSITION_ORDER.length) % OUTER_POSITION_ORDER.length;
  return diff <= 2 ? 1 : -1;
}

function buildConnectionGeometry(fromPosition: DiamondPosition, toPosition: DiamondPosition): ConnectionGeometry {
  const from = COORDS[fromPosition];
  const to = COORDS[toPosition];
  if (!from || !to) return null;

  if (fromPosition === toPosition) {
    const outwardX = from.x - CENTER_POINT.x;
    const outwardY = from.y - CENTER_POINT.y;
    const outwardLength = Math.hypot(outwardX, outwardY) || 1;
    const normalX = outwardX / outwardLength;
    const normalY = outwardY / outwardLength;
    const tangentX = -normalY;
    const tangentY = normalX;
    const loopRadius = 3.4;
    const loopCenter = {
      x: from.x + normalX * 2.4,
      y: from.y + normalY * 2.4,
    };
    const start = {
      x: loopCenter.x - tangentX * loopRadius,
      y: loopCenter.y - tangentY * loopRadius,
    };
    const end = {
      x: loopCenter.x + tangentX * loopRadius,
      y: loopCenter.y + tangentY * loopRadius,
    };
    return {
      path: `M ${start.x} ${start.y} A ${loopRadius} ${loopRadius} 0 1 1 ${end.x} ${end.y}`,
    };
  }

  if (fromPosition === 'center' || toPosition === 'center') {
    return {
      path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    };
  }

  const isOpposite =
    (fromPosition === 'left' && toPosition === 'right') ||
    (fromPosition === 'right' && toPosition === 'left') ||
    (fromPosition === 'top' && toPosition === 'bottom') ||
    (fromPosition === 'bottom' && toPosition === 'top');
  const curveDirection = getCurveDirection(fromPosition, toPosition);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  let control: Point;

  if (isOpposite) {
    const lineX = to.x - from.x;
    const lineY = to.y - from.y;
    const lineLength = Math.hypot(lineX, lineY) || 1;
    const perpX = -lineY / lineLength;
    const perpY = lineX / lineLength;
    const curveOffset = GLYPH_RADIUS * 0.7 * curveDirection;
    control = {
      x: midX + perpX * curveOffset,
      y: midY + perpY * curveOffset,
    };
  } else {
    const dirFromCenterX = midX - CENTER_POINT.x;
    const dirFromCenterY = midY - CENTER_POINT.y;
    const dirLength = Math.hypot(dirFromCenterX, dirFromCenterY) || 1;
    const curveOffset = GLYPH_RADIUS * 0.6 * curveDirection;
    control = {
      x: midX + (dirFromCenterX / dirLength) * curveOffset,
      y: midY + (dirFromCenterY / dirLength) * curveOffset,
    };
  }

  return {
    path: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
  };
}

export const JourneyPresetGlyph = React.memo(function JourneyPresetGlyph({
  preview,
  color = '#B8E0FF',
  mutedColor = 'rgba(184,224,255,0.42)',
  style,
}: JourneyPresetGlyphProps) {
  const nodes = useMemo(() => {
    const byPosition = new Map<DiamondPosition, { position: DiamondPosition; filled: boolean }>();
    for (const node of preview?.nodes ?? []) {
      byPosition.set(node.position, {
        position: node.position,
        filled: Boolean(byPosition.get(node.position)?.filled || node.filled),
      });
    }
    for (const connection of preview?.connections ?? []) {
      byPosition.set(connection.from, byPosition.get(connection.from) ?? { position: connection.from, filled: connection.from === 'center' });
      byPosition.set(connection.to, byPosition.get(connection.to) ?? { position: connection.to, filled: connection.to === 'center' });
    }
    return [...byPosition.values()].sort((left, right) => POSITION_ORDER.indexOf(left.position) - POSITION_ORDER.indexOf(right.position));
  }, [preview]);

  if (!preview || (!nodes.length && !preview.connections.length)) {
    return (
      <span aria-hidden style={{ lineHeight: 1, ...style }}>
        ⟡
      </span>
    );
  }

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 32 32"
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible', ...style }}
    >
      {preview.connections.map((connection, index) => {
        const geometry = buildConnectionGeometry(connection.from, connection.to);
        if (!geometry) return null;
        return (
          <g
            key={`${connection.from}:${connection.to}:${index}`}
            opacity={0.78}
          >
            <path
              d={geometry.path}
              fill="none"
              stroke={color}
              strokeOpacity={0.72}
              strokeWidth={1.45}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {nodes.map((node) => {
        const point = COORDS[node.position];
        const isCenter = node.position === 'center';
        return (
          <circle
            key={node.position}
            cx={point.x}
            cy={point.y}
            r={isCenter ? 1.85 : 2.15}
            fill={node.filled ? color : 'rgba(0,0,0,0.28)'}
            stroke={node.filled ? 'rgba(255,255,255,0.36)' : mutedColor}
            strokeWidth={0.9}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
});
