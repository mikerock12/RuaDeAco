export type MusicTrack = 'main-menu' | 'character-select' | 'cais-da-cidade';

export type MusicFormat = 'ogg' | 'mp3';

export interface MusicSource {
  readonly format: MusicFormat;
  readonly mimeType: string;
  readonly path: string;
}

export interface MusicTrackDefinition {
  readonly id: MusicTrack;
  readonly loop: true;
  readonly sources: readonly MusicSource[];
}

export const MUSIC_CATALOG: Readonly<Record<MusicTrack, MusicTrackDefinition>> = {
  'main-menu': {
    id: 'main-menu',
    loop: true,
    sources: [
      { format: 'ogg', mimeType: 'audio/ogg; codecs=vorbis', path: 'assets/audio/music/menu-principal.ogg' },
      { format: 'mp3', mimeType: 'audio/mpeg', path: 'assets/audio/music/menu-principal.mp3' },
    ],
  },
  'character-select': {
    id: 'character-select',
    loop: true,
    sources: [
      { format: 'ogg', mimeType: 'audio/ogg; codecs=vorbis', path: 'assets/audio/music/selecao-personagens.ogg' },
      { format: 'mp3', mimeType: 'audio/mpeg', path: 'assets/audio/music/selecao-personagens.mp3' },
    ],
  },
  'cais-da-cidade': {
    id: 'cais-da-cidade',
    loop: true,
    sources: [
      { format: 'ogg', mimeType: 'audio/ogg; codecs=vorbis', path: 'assets/audio/music/cais-da-cidade.ogg' },
      { format: 'mp3', mimeType: 'audio/mpeg', path: 'assets/audio/music/cais-da-cidade.mp3' },
    ],
  },
};

export const MUSIC_TRACK_BY_SCENE = {
  MainMenuScene: 'main-menu',
  CharacterSelectScene: 'character-select',
  FightScene: 'cais-da-cidade',
} as const satisfies Readonly<Record<string, MusicTrack>>;

export function musicAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const cleanPath = path.replace(/^\/+/, '');
  const cleanBase = baseUrl.length > 0 ? baseUrl : './';
  return `${cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`}${cleanPath}`;
}
