import type { MotionFringes } from './motion-fringes';

export function platformFringe(motion: Pick<MotionFringes, 'rect'>, id: string | number, geometry: {
  left: number; right: number; supportY: number; anchorX: number; color: number;
}): void {
  const { left, right, supportY, anchorX, color } = geometry;
  motion.rect(`platform:${id}`, (left + right) / 2, supportY - 1, right - left, 2, color, { x: anchorX, y: supportY });
}

export function connectorFringe(motion: Pick<MotionFringes, 'segment'>, id: string | number, geometry: {
  ax: number; ay: number; bx: number; by: number; color: number;
}): void {
  const { ax, ay, bx, by, color } = geometry;
  motion.segment(`connector:${id}:a`, `connector:${id}:b`, ax, ay - 1, bx, by - 1, 2, color);
}
