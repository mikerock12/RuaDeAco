import { describe, expect, it } from 'vitest';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import { FIGHTER_SPRITE_ASSETS } from '../../fighters/visual';
import type { SpriteSheetAsset } from '../../types/assets';
import {
  animatedSpriteSheetContractErrors,
  isFlatFighterAssetPath,
  jumpArcPhaseFrames,
  moveAnimationFrameIndex,
  phaserAnimationKey,
  spriteSheetFrameIndex,
  spriteSheetManifestErrors,
  spriteSheetContractErrors,
  spriteSheetPreloadConfig,
} from '../spriteSheetContract';

const sheet: SpriteSheetAsset = {
  key: 'guto-barba-idle',
  path: 'assets/fighters/guto-barba/idle.png',
  frameWidth: 256,
  frameHeight: 256,
  frames: 4,
  layout: 'horizontal',
};

describe('spriteSheetContract', () => {
  it('aceita uma spritesheet horizontal com dimensões e contagem exatas', () => {
    expect(spriteSheetContractErrors(sheet, { width: 1024, height: 256 })).toEqual([]);
  });

  it('rejeita a folha inteira que faria o Phaser cair no frame __BASE', () => {
    expect(spriteSheetContractErrors(sheet, { width: 768, height: 192 })).toEqual([
      'altura 192, esperada 256 (uma linha horizontal)',
      'largura 768, esperada 1024 para 4 frames',
    ]);
  });

  it('rejeita largura não divisível pelo frame declarado', () => {
    expect(spriteSheetContractErrors(sheet, { width: 1000, height: 256 })).toContain(
      'largura 1000 não é divisível por frameWidth 256',
    );
  });

  it('aceita somente caminhos planos na pasta do lutador', () => {
    expect(isFlatFighterAssetPath(sheet, 'guto-barba')).toBe(true);
    expect(isFlatFighterAssetPath({ ...sheet, path: 'assets/fighters/guto-barba/sprites/idle.png' }, 'guto-barba')).toBe(false);
    expect(isFlatFighterAssetPath({ ...sheet, path: 'assets/fighters/rafa-mare/idle.png' }, 'guto-barba')).toBe(false);
  });

  it('mantém namespaces de textura e animação distintos', () => {
    expect(phaserAnimationKey(sheet.key)).toBe('guto-barba-idle:animation');
  });

  it('gera o mesmo intervalo exato usado pelo preload', () => {
    expect(spriteSheetPreloadConfig(sheet)).toEqual({
      frameWidth: 256,
      frameHeight: 256,
      startFrame: 0,
      endFrame: 3,
    });
  });

  it('rejeita frameRate ausente ou inválido antes de registrar no Phaser', () => {
    const animation = { ...sheet, frameRate: 10, repeat: 0 } as const;
    expect(animatedSpriteSheetContractErrors(animation)).toEqual([]);
    expect(animatedSpriteSheetContractErrors({ ...animation, frameRate: undefined as unknown as number }))
      .toEqual(['frameRate inválido (undefined)']);
    expect(animatedSpriteSheetContractErrors({ ...animation, frameRate: Number.NaN }))
      .toEqual(['frameRate inválido (NaN)']);
    expect(animatedSpriteSheetContractErrors({ ...animation, repeat: -2 }))
      .toEqual(['repeat inválido (-2)']);
  });

  it('sincroniza quadros ao relógio da simulação e cobre fases curtas', () => {
    const animation = { frames: 4, frameRate: 10, repeat: 0 } as const;
    expect([0, 5, 6, 23, 80].map((frame) => spriteSheetFrameIndex(animation, frame)))
      .toEqual([0, 0, 1, 3, 3]);
    expect([0, 1, 2, 3].map((frame) => spriteSheetFrameIndex(animation, frame, 4)))
      .toEqual([0, 1, 2, 3]);
  });

  it('rejeita chaves e caminhos duplicados no manifest', () => {
    expect(spriteSheetManifestErrors([sheet, { ...sheet }])).toEqual([
      'chave duplicada: guto-barba-idle',
      'caminho duplicado: assets/fighters/guto-barba/idle.png',
    ]);
  });

  it('torna os quatro frames alcançáveis e reserva o frame 2 para impacto', () => {
    for (const fighter of [rafaMare, gutoBarba]) {
      for (const move of Object.values(fighter.moves)) {
        const reached = new Set(
          Array.from({ length: move.totalFrames }, (_, frame) =>
            moveAnimationFrameIndex(move, frame)),
        );
        expect([...reached].sort()).toEqual([0, 1, 2, 3]);
        for (const timed of move.hitboxes) {
          for (let frame = timed.range.from; frame <= timed.range.to; frame += 1) {
            expect(moveAnimationFrameIndex(move, frame)).toBe(2);
          }
        }
      }
    }
    expect(moveAnimationFrameIndex(rafaMare.moves.maoDaMare!, 13)).toBe(2);
    expect(moveAnimationFrameIndex(rafaMare.moves.ecoTatuado!, 12)).toBe(2);
  });

  it('cobre os quatro frames do arco e toca efeitos attached uma única vez', () => {
    for (const fighter of [rafaMare, gutoBarba]) {
      const arcFrames = jumpArcPhaseFrames(fighter.stats);
      const reached = Array.from({ length: arcFrames }, (_, frame) =>
        spriteSheetFrameIndex({ frames: 4, frameRate: 8, repeat: 0 }, frame, arcFrames));
      expect(new Set(reached)).toEqual(new Set([0, 1, 2, 3]));
    }

    const attached = FIGHTER_SPRITE_ASSETS.flatMap(({ effects }) => effects)
      .filter(({ usage }) => usage === 'attached');
    for (const effect of attached) {
      expect(effect.repeat).toBe(0);
      const duration = effect.activeRange!.to - effect.activeRange!.from + 1;
      const frames = Array.from({ length: duration }, (_, frame) =>
        spriteSheetFrameIndex(effect, frame, duration));
      expect(frames[0]).toBe(0);
      expect(frames[frames.length - 1]).toBe(3);
      expect(frames.every((frame, index) => index === 0 || frame >= frames[index - 1]!)).toBe(true);
    }
  });
});
