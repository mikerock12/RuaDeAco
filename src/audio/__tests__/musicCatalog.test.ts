import { describe, expect, it } from 'vitest';
import {
  MUSIC_CATALOG,
  MUSIC_TRACK_BY_SCENE,
  musicAssetUrl,
} from '../musicCatalog';

describe('catálogo de músicas', () => {
  it('declara as três faixas reais em loop', () => {
    expect(Object.keys(MUSIC_CATALOG)).toEqual([
      'main-menu',
      'character-select',
      'cais-da-cidade',
    ]);
    expect(Object.values(MUSIC_CATALOG).every((track) => track.loop)).toBe(true);
    expect(Object.values(MUSIC_CATALOG).flatMap((track) => track.sources).map((source) => source.format))
      .toEqual(['ogg', 'mp3', 'ogg', 'mp3', 'ogg', 'mp3']);
  });

  it('mapeia cada cena que inicia música para a faixa correta', () => {
    expect(MUSIC_TRACK_BY_SCENE).toEqual({
      MainMenuScene: 'main-menu',
      CharacterSelectScene: 'character-select',
      FightScene: 'cais-da-cidade',
    });
  });

  it('respeita o caminho base usado na publicação do GitHub Pages', () => {
    expect(musicAssetUrl('assets/audio/music/menu-principal.ogg', '/RuaDeAco/'))
      .toBe('/RuaDeAco/assets/audio/music/menu-principal.ogg');
    expect(musicAssetUrl('/assets/audio/music/menu-principal.mp3', './'))
      .toBe('./assets/audio/music/menu-principal.mp3');
  });
});
