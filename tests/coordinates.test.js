import { describe, it, expect } from 'vitest';
import { canvasClickToYawPitch, arrivalBearing } from '../virtual-tour-utils.js';

// ── canvasClickToYawPitch ─────────────────────────────────────────────────────

describe('canvasClickToYawPitch', () => {
  const W = 1280, H = 720;
  const fov = 90; // degrees

  it('center click returns the current yaw and pitch unchanged', () => {
    const result = canvasClickToYawPitch(W / 2, H / 2, W, H, 0, 0, fov);
    expect(result.yaw).toBeCloseTo(0);
    expect(result.pitch).toBeCloseTo(0);
  });

  it('center click preserves non-zero current yaw and pitch', () => {
    const result = canvasClickToYawPitch(W / 2, H / 2, W, H, 1.5, -0.3, fov);
    expect(result.yaw).toBeCloseTo(1.5);
    expect(result.pitch).toBeCloseTo(-0.3);
  });

  it('left edge click decreases yaw by half the horizontal FOV', () => {
    const halfFovRad = (fov * Math.PI / 180) / 2;
    const result = canvasClickToYawPitch(0, H / 2, W, H, 0, 0, fov);
    expect(result.yaw).toBeCloseTo(-halfFovRad);
  });

  it('right edge click increases yaw by half the horizontal FOV', () => {
    const halfFovRad = (fov * Math.PI / 180) / 2;
    const result = canvasClickToYawPitch(W, H / 2, W, H, 0, 0, fov);
    expect(result.yaw).toBeCloseTo(halfFovRad);
  });

  it('top edge click produces positive pitch (looking up)', () => {
    const result = canvasClickToYawPitch(W / 2, 0, W, H, 0, 0, fov);
    expect(result.pitch).toBeGreaterThan(0);
  });

  it('bottom edge click produces negative pitch (looking down)', () => {
    const result = canvasClickToYawPitch(W / 2, H, W, H, 0, 0, fov);
    expect(result.pitch).toBeLessThan(0);
  });

  it('pitch is clamped to +π/2 at maximum upward extreme', () => {
    // Extremely high FOV + click at top edge forces pitch above π/2
    const result = canvasClickToYawPitch(W / 2, 0, W, H, 0, Math.PI / 2, 170);
    expect(result.pitch).toBeLessThanOrEqual(Math.PI / 2);
  });

  it('pitch is clamped to -π/2 at maximum downward extreme', () => {
    const result = canvasClickToYawPitch(W / 2, H, W, H, 0, -Math.PI / 2, 170);
    expect(result.pitch).toBeGreaterThanOrEqual(-Math.PI / 2);
  });

  it('yaw result respects current yaw offset', () => {
    const currentYaw = Math.PI / 4; // 45°
    const halfFovRad = (fov * Math.PI / 180) / 2;
    const result = canvasClickToYawPitch(0, H / 2, W, H, currentYaw, 0, fov);
    expect(result.yaw).toBeCloseTo(currentYaw - halfFovRad);
  });

  it('pitch result respects current pitch offset', () => {
    const currentPitch = 0.3;
    const result = canvasClickToYawPitch(W / 2, H / 2, W, H, 0, currentPitch, fov);
    expect(result.pitch).toBeCloseTo(currentPitch);
  });

  it('yaw scales correctly with different FOV values', () => {
    const fov60 = 60;
    const halfFov60 = (fov60 * Math.PI / 180) / 2;
    const result = canvasClickToYawPitch(W, H / 2, W, H, 0, 0, fov60);
    expect(result.yaw).toBeCloseTo(halfFov60);
  });

  it('aspect ratio is accounted for in vertical FOV (wider canvas = smaller vertical range)', () => {
    const squareResult = canvasClickToYawPitch(512 / 2, 0, 512, 512, 0, 0, fov);     // 1:1
    const wideResult   = canvasClickToYawPitch(1280 / 2, 0, 1280, 720, 0, 0, fov);   // 16:9
    // Wider canvas means smaller vertical FOV per pixel → less pitch change at top edge
    expect(wideResult.pitch).toBeLessThan(squareResult.pitch);
  });
});

// ── arrivalBearing ────────────────────────────────────────────────────────────

describe('arrivalBearing', () => {
  it('returns null when fromNode has no map position', () => {
    expect(arrivalBearing({ mapX: null, mapY: null }, { mapX: 100, mapY: 100 })).toBeNull();
  });

  it('returns null when toNode has no map position', () => {
    expect(arrivalBearing({ mapX: 100, mapY: 100 }, { mapX: null, mapY: null })).toBeNull();
  });

  it('returns null when fromNode mapX is undefined', () => {
    expect(arrivalBearing({ mapY: 0 }, { mapX: 100, mapY: 0 })).toBeNull();
  });

  it('node due east (positive X, same Y) → yaw ≈ +π/2', () => {
    const from = { mapX: 0, mapY: 0 };
    const to   = { mapX: 100, mapY: 0 };
    expect(arrivalBearing(from, to)).toBeCloseTo(Math.PI / 2);
  });

  it('node due west (negative X, same Y) → yaw ≈ -π/2', () => {
    const from = { mapX: 100, mapY: 0 };
    const to   = { mapX: 0, mapY: 0 };
    expect(arrivalBearing(from, to)).toBeCloseTo(-Math.PI / 2);
  });

  it('node due north (negative Y = up on map) → yaw ≈ 0', () => {
    // mapY decreases as you go north (Y-down canvas coords)
    const from = { mapX: 0, mapY: 100 };
    const to   = { mapX: 0, mapY: 0 };
    expect(arrivalBearing(from, to)).toBeCloseTo(0);
  });

  it('node due south (positive Y = down on map) → yaw ≈ ±π', () => {
    const from = { mapX: 0, mapY: 0 };
    const to   = { mapX: 0, mapY: 100 };
    expect(Math.abs(arrivalBearing(from, to))).toBeCloseTo(Math.PI);
  });

  it('node northeast → yaw between 0 and π/2', () => {
    const from = { mapX: 0, mapY: 100 };
    const to   = { mapX: 100, mapY: 0 }; // right and up
    const bearing = arrivalBearing(from, to);
    expect(bearing).toBeGreaterThan(0);
    expect(bearing).toBeLessThan(Math.PI / 2);
  });

  it('node northwest → yaw between -π/2 and 0', () => {
    const from = { mapX: 100, mapY: 100 };
    const to   = { mapX: 0, mapY: 0 }; // left and up
    const bearing = arrivalBearing(from, to);
    expect(bearing).toBeGreaterThan(-Math.PI / 2);
    expect(bearing).toBeLessThan(0);
  });

  it('returns a value in [-π, π] range for any direction', () => {
    const pairs = [
      [{ mapX: 0, mapY: 0 }, { mapX: 1, mapY: 1 }],
      [{ mapX: 5, mapY: 3 }, { mapX: 2, mapY: 8 }],
      [{ mapX: 100, mapY: 50 }, { mapX: 0, mapY: 200 }]
    ];
    for (const [from, to] of pairs) {
      const b = arrivalBearing(from, to);
      expect(b).toBeGreaterThanOrEqual(-Math.PI);
      expect(b).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('same position → returns Math.PI (atan2(0,-0) IEEE 754 quirk)', () => {
    // When from === to, dx=0 and dy=-(0)=-0, so Math.atan2(0,-0) = Math.PI.
    // The app guards against this by only calling arrivalBearing when nodes
    // have distinct map positions, so this edge case is never reached in practice.
    const node = { mapX: 50, mapY: 50 };
    expect(arrivalBearing(node, node)).toBeCloseTo(Math.PI);
  });

  it('returns null when fromNode mapY is null', () => {
    expect(arrivalBearing({ mapX: 50, mapY: null }, { mapX: 100, mapY: 50 })).toBeNull();
  });

  it('returns null when toNode mapY is null', () => {
    expect(arrivalBearing({ mapX: 0, mapY: 0 }, { mapX: 10, mapY: null })).toBeNull();
  });
});
