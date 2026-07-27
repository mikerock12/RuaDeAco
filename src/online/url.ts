export function toWebSocketUrl(httpUrl: string): string {
  const url = new URL(httpUrl);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol === 'https:') url.protocol = 'wss:';
  else throw new Error('A origem multiplayer deve usar HTTP ou HTTPS.');
  return url.toString();
}

export function isSafeWebSocketEndpoint(candidateValue: string, httpBaseUrl: string): boolean {
  try {
    const candidate = new URL(candidateValue);
    const expected = new URL(toWebSocketUrl(httpBaseUrl));
    const basePath = expected.pathname.endsWith('/')
      ? expected.pathname
      : `${expected.pathname}/`;
    return candidate.protocol === expected.protocol
      && candidate.host === expected.host
      && candidate.username === ''
      && candidate.password === ''
      && candidate.search === ''
      && candidate.hash === ''
      && candidate.pathname.startsWith(basePath);
  } catch {
    return false;
  }
}
