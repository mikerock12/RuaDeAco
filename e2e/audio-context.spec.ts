import { expect, test, type CDPSession, type Page, type Response } from '@playwright/test';

interface GameAudioDebugState {
  readonly contextState: AudioContextState | 'uninitialized';
  readonly requestedTrack: string | null;
  readonly pendingTrack: string | null;
  readonly currentTrack: string | null;
  readonly loadingTracks: readonly string[];
  readonly activeVoices: number;
  readonly unlockListenersAttached: boolean;
  readonly autoplayBlocked: boolean;
}

interface WebAudioContextEvent {
  readonly context: {
    readonly contextId: string;
    readonly contextState: string;
  };
}

interface WebAudioNodeEvent {
  readonly node: {
    readonly nodeType: string;
  };
}

interface WebAudioObservation {
  readonly states: string[];
  bufferSources: number;
}

interface AudioResponseInfo {
  readonly status: number;
  readonly url: string;
}

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
}

async function gameAudioState(page: Page): Promise<GameAudioDebugState | null> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_AUDIO_DEBUG__?: () => GameAudioDebugState;
    }).__RUA_AUDIO_DEBUG__;
    return debug?.() ?? null;
  });
}

async function activeScenes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_SCENE_DEBUG__?: () => readonly string[];
    }).__RUA_SCENE_DEBUG__;
    return debug?.() ?? [];
  });
}

async function observeWebAudio(page: Page): Promise<{
  readonly observation: WebAudioObservation;
  readonly session: CDPSession;
}> {
  const session = await page.context().newCDPSession(page);
  const observation: WebAudioObservation = { states: [], bufferSources: 0 };
  session.on('WebAudio.contextCreated', (event: WebAudioContextEvent) => {
    observation.states.push(event.context.contextState);
  });
  session.on('WebAudio.contextChanged', (event: WebAudioContextEvent) => {
    observation.states.push(event.context.contextState);
  });
  session.on('WebAudio.audioNodeCreated', (event: WebAudioNodeEvent) => {
    if (event.node.nodeType.includes('BufferSource')) observation.bufferSources += 1;
  });
  await session.send('WebAudio.enable');
  return { observation, session };
}

function trackAudioResponses(page: Page): AudioResponseInfo[] {
  const responses: AudioResponseInfo[] = [];
  page.on('response', (response: Response) => {
    if (/\/assets\/audio\/music\/.*\.(?:ogg|mp3|wav)(?:\?.*)?$/u.test(response.url())) {
      responses.push({ status: response.status(), url: response.url() });
    }
  });
  return responses;
}

function trackBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = { consoleErrors: [], pageErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  return diagnostics;
}

function assertMusicResponses(responses: readonly AudioResponseInfo[]): void {
  const wav = responses.filter(({ url }) => /\.wav(?:\?|$)/u.test(url));
  const compact = responses.filter(({ url }) => /\.(?:ogg|mp3)(?:\?|$)/u.test(url));
  const successful = compact.filter(({ status }) => status >= 200 && status < 300);
  expect(wav, 'O jogo não pode requisitar WAV.').toHaveLength(0);
  expect(successful, 'A música do menu deve carregar OGG ou MP3.').toHaveLength(1);
  expect(compact.some(({ status }) => status === 404), 'Nenhum áudio pode retornar 404.').toBe(false);
}

async function openStartScene(page: Page): Promise<{
  readonly audioResponses: AudioResponseInfo[];
  readonly diagnostics: BrowserDiagnostics;
  readonly observation: WebAudioObservation;
  readonly session: CDPSession;
  readonly canvas: ReturnType<Page['locator']>;
}> {
  const diagnostics = trackBrowserDiagnostics(page);
  const audioResponses = trackAudioResponses(page);
  const { observation, session } = await observeWebAudio(page);

  await page.goto('/');
  expect(await page.evaluate(() => navigator.userAgent)).toContain('Chrome/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const target = window as typeof window & {
      __RUA_AUDIO_DEBUG__?: unknown;
      __RUA_SCENE_DEBUG__?: () => readonly string[];
    };
    return typeof target.__RUA_AUDIO_DEBUG__ === 'function'
      && target.__RUA_SCENE_DEBUG__?.().includes('StartScene');
  });

  expect(await activeScenes(page)).toContain('StartScene');
  expect(await activeScenes(page)).not.toContain('MainMenuScene');
  expect(await gameAudioState(page)).toMatchObject({
    requestedTrack: null,
    pendingTrack: null,
    currentTrack: null,
    activeVoices: 0,
    unlockListenersAttached: false,
  });
  expect(observation.bufferSources).toBe(0);

  return { audioResponses, diagnostics, observation, session, canvas };
}

async function assertMenuMusicStarted(
  page: Page,
  audioResponses: readonly AudioResponseInfo[],
  diagnostics: BrowserDiagnostics,
  observation: WebAudioObservation,
): Promise<GameAudioDebugState> {
  await waitForMenuMusic(page);
  await expect.poll(() => activeScenes(page)).toContain('MainMenuScene');
  await expect.poll(() => gameAudioState(page)).toMatchObject({
    contextState: 'running',
    requestedTrack: 'main-menu',
    pendingTrack: null,
    currentTrack: 'main-menu',
    activeVoices: 1,
    unlockListenersAttached: false,
  });
  await expect.poll(() => audioResponses.length).toBeGreaterThan(0);

  const state = await gameAudioState(page);
  if (!state) throw new Error('Diagnóstico de áudio indisponível após abrir o menu.');
  assertMusicResponses(audioResponses);
  expect(observation.states).toContain('running');
  expect(observation.bufferSources).toBe(1);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  return state;
}

async function waitForMenuMusic(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const target = window as typeof window & {
      __RUA_AUDIO_DEBUG__?: () => GameAudioDebugState;
      __RUA_SCENE_DEBUG__?: () => readonly string[];
    };
    const audio = target.__RUA_AUDIO_DEBUG__?.();
    return target.__RUA_SCENE_DEBUG__?.().includes('MainMenuScene')
      && audio?.contextState === 'running'
      && audio.currentTrack === 'main-menu'
      && audio.activeVoices === 1;
  });
}

test('Enter abre o menu e inicia uma única música no Chrome real', async ({ page }, testInfo) => {
  const { audioResponses, diagnostics, observation, session } = await openStartScene(page);
  const interactionAt = performance.now();

  await page.keyboard.press('Enter');
  await waitForMenuMusic(page);
  const startDelayMs = Math.round(performance.now() - interactionAt);
  const finalState = await assertMenuMusicStarted(page, audioResponses, diagnostics, observation);
  expect(startDelayMs).toBeLessThan(2_000);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect((await gameAudioState(page))?.activeVoices).toBe(1);
  expect(observation.bufferSources).toBe(1);

  console.log(JSON.stringify({
    project: testInfo.project.name,
    interaction: 'Enter',
    startDelayMs,
    finalState,
    webAudioStates: observation.states,
    musicResponses: audioResponses,
  }));
  await session.detach();
});

test.describe('entrada por toque', () => {
  test.use({
    hasTouch: true,
    viewport: { width: 720, height: 405 },
  });

  test('toque no canvas abre o menu e inicia uma única música', async ({ page }, testInfo) => {
    const { audioResponses, diagnostics, observation, session, canvas } = await openStartScene(page);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas visível sem dimensões para o toque inicial.');
    const interactionAt = performance.now();

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await waitForMenuMusic(page);
    const startDelayMs = Math.round(performance.now() - interactionAt);
    const finalState = await assertMenuMusicStarted(page, audioResponses, diagnostics, observation);
    expect(startDelayMs).toBeLessThan(2_000);

    console.log(JSON.stringify({
      project: testInfo.project.name,
      interaction: 'touch',
      startDelayMs,
      finalState,
      webAudioStates: observation.states,
      musicResponses: audioResponses,
    }));
    await session.detach();
  });
});
