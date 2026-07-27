import { isSafeWebSocketEndpoint, toWebSocketUrl } from '../url';

describe('URLs do transporte online', () => {
  it('converte HTTP e HTTPS sem alterar host, porta ou caminho', () => {
    expect(toWebSocketUrl('http://127.0.0.1:8787/v1/'))
      .toBe('ws://127.0.0.1:8787/v1/');
    expect(toWebSocketUrl('https://game.example/api'))
      .toBe('wss://game.example/api');
  });

  it('recusa origem não HTTP e endpoints com host, query ou hash inesperados', () => {
    expect(() => toWebSocketUrl('ftp://game.example')).toThrow(/HTTP ou HTTPS/u);
    expect(isSafeWebSocketEndpoint(
      'wss://game.example/v1/rooms/ABCDE23456/ws',
      'https://game.example/',
    )).toBe(true);
    expect(isSafeWebSocketEndpoint(
      'wss://evil.example/v1/rooms/ABCDE23456/ws',
      'https://game.example/',
    )).toBe(false);
    expect(isSafeWebSocketEndpoint(
      'wss://game.example/v1/rooms/ABCDE23456/ws?ticket=segredo',
      'https://game.example/',
    )).toBe(false);
  });
});
