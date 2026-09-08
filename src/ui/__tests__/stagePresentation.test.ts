import { describe, expect, it } from 'vitest';
import { VISUAL_GROUND_Y } from '../../config/pixelArtConfig';
import { CAIS_STAGE_DEPTHS as depth, CAIS_STAGE_LAYOUT as layout } from '../stagePresentation';

describe('composição remasterizada do Cais', () => {
  it('reserva céu para a lua, água para os eventos e um plano amplo para os pés', () => {
    expect(layout.moon.y + layout.moon.radius).toBeLessThan(layout.skyBottomY);
    expect(layout.skyBottomY).toBeLessThan(layout.waterHorizonY);
    expect(layout.waterHorizonY).toBeLessThan(layout.dockSurfaceY);
    expect(layout.dockContactY).toBe(VISUAL_GROUND_Y);
    expect(layout.dockContactY - layout.dockSurfaceY).toBeGreaterThan(20);
    expect(layout.dockFrontY - layout.dockContactY).toBeGreaterThanOrEqual(20);
  });
  it('oculta discos distantes atrás da lua e mantém os eventos abaixo dos lutadores', () => {
    expect(depth.background).toBeLessThan(depth.distantUfo);
    expect(depth.distantUfo).toBeLessThan(depth.moon);
    expect(depth.moon).toBeLessThan(depth.witch);
    expect(depth.water).toBeLessThan(depth.ship);
    expect(depth.ship).toBeLessThan(depth.monster);
    expect(depth.monster).toBeLessThan(depth.fire);
    expect(Math.max(...Object.values(depth))).toBeLessThan(17); // sombras dos lutadores
  });
});
