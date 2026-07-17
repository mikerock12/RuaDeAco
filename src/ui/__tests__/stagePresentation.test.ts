import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISUAL_GROUND_Y } from '../../config/pixelArtConfig';
import {
  CAIS_SKYLINE_BUILDINGS,
  CAIS_SKY_STARS,
  CAIS_STAGE_DEPTHS,
  CAIS_STAGE_LAYOUT,
  MOON_PIXEL_ROWS,
  resolveBoatPose,
} from '../stagePresentation';

describe('composição visual do Cais da Cidade', () => {
  it('mantém lua, barco, água e piso em planos coerentes', () => {
    const { moon, boat, skyBottomY, waterHorizonY, dockSurfaceY, dockContactY, dockFrontY } = CAIS_STAGE_LAYOUT;
    expect(moon.y + moon.radius).toBeLessThan(skyBottomY);
    expect(boat.y).toBeLessThanOrEqual(waterHorizonY);
    expect(waterHorizonY).toBeLessThan(dockSurfaceY);
    expect(dockSurfaceY).toBeLessThan(dockContactY);
    expect(dockContactY).toBe(VISUAL_GROUND_Y);
    expect(dockFrontY).toBeGreaterThan(dockContactY);
    expect(dockFrontY - dockSurfaceY).toBeGreaterThanOrEqual(50);
    expect(MOON_PIXEL_ROWS.length).toBeGreaterThanOrEqual(18);
  });

  it('mantém lua e estrelas no céu, atrás do skyline', () => {
    const { moon, skyBottomY } = CAIS_STAGE_LAYOUT;
    const lowestBuildingTop = Math.min(...CAIS_SKYLINE_BUILDINGS.map((building) => building.top));
    expect(moon.y + moon.radius).toBeLessThan(skyBottomY);
    expect(moon.y + moon.radius).toBeLessThan(lowestBuildingTop);
    expect(CAIS_SKY_STARS.every(([, y]) => y < lowestBuildingTop)).toBe(true);
    expect(CAIS_STAGE_DEPTHS.moon).toBeLessThan(CAIS_STAGE_DEPTHS.skyline);
    expect(CAIS_STAGE_DEPTHS.stars).toBeLessThan(CAIS_STAGE_DEPTHS.skyline);
  });

  it('move o barco em passos inteiros e dentro de um alcance discreto', () => {
    for (const elapsed of [0, 420, 650, 7_000, 14_000, 28_000]) {
      const pose = resolveBoatPose(elapsed);
      expect(Number.isInteger(pose.x)).toBe(true);
      expect(Number.isInteger(pose.y)).toBe(true);
      expect(Math.abs(pose.x - CAIS_STAGE_LAYOUT.boat.x)).toBeLessThanOrEqual(CAIS_STAGE_LAYOUT.boat.driftX);
      expect(pose.y).toBeGreaterThanOrEqual(CAIS_STAGE_LAYOUT.boat.y);
      expect(pose.y).toBeLessThanOrEqual(CAIS_STAGE_LAYOUT.boat.y + CAIS_STAGE_LAYOUT.boat.bobY);
      expect(pose.lightAlpha).toBeGreaterThanOrEqual(0.55);
      expect(pose.lightAlpha).toBeLessThanOrEqual(0.9);
    }
  });

  it('cria uma única composição procedural, sem alterar colisões do combate', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/ui/CaisStageView.ts'), 'utf8');
    expect(source).toContain("setName('cais-full-moon')");
    expect(source).toContain("setName('cais-distant-skyline')");
    expect(source).toContain("setName('cais-distant-boat')");
    expect(source).toContain("setName('cais-dock-polish')");
    expect(source).not.toContain("ASSET_MANIFEST.stage.far.key");
    expect(source).not.toContain('setCollision');
    expect(source).not.toContain('physics.add');
  });
});
