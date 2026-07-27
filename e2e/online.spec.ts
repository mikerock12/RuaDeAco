import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

interface OnlineLobbyDebug {
  readonly status: string;
  readonly roomCode: string | null;
  readonly slot: string | null;
  readonly phase: string | null;
  readonly players: readonly {
    readonly slot: string;
    readonly connected: boolean;
    readonly ready: boolean;
    readonly fighterId: string | null;
  }[];
  readonly inputDelay: number | null;
  readonly reconnectCount: number;
}

interface OnlineFightDebug {
  readonly slot: string | null;
  readonly inputDelay: number | null;
  readonly startFingerprint: string | null;
  readonly captureFrame: number | null;
  readonly simulationFrame: number | null;
  readonly waitingForPeer: boolean | null;
  readonly lastHashFrame: number | null;
  readonly lastHash: string | null;
}

interface WorldSnapshot {
  readonly fighters: readonly {
    readonly x: number;
    readonly health: number;
    readonly activeMoveId: string | null;
  }[];
}

interface PageDiagnostics {
  readonly errors: string[];
  readonly notFound: string[];
}

const auditRoot = resolve(process.cwd(), 'tmp', 'online-audit');
mkdirSync(auditRoot, { recursive: true });

async function activeScenes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (
    (window as typeof window & {
      __RUA_SCENE_DEBUG__?: () => readonly string[];
    }).__RUA_SCENE_DEBUG__?.() ?? []
  ));
}

async function waitScene(page: Page, scene: string): Promise<void> {
  await expect.poll(() => activeScenes(page), { timeout: 75_000 }).toContain(scene);
}

async function clickInternal(page: Page, x: number, y: number, touch = false): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas sem dimensões.');
  const targetX = box.x + x / 640 * box.width;
  const targetY = box.y + y / 360 * box.height;
  if (touch) await page.touchscreen.tap(targetX, targetY);
  else await page.mouse.click(targetX, targetY);
}

async function enterRoomCode(page: Page, roomCode: string, touch = false): Promise<void> {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (const character of roomCode) {
    if (touch) {
      const index = alphabet.indexOf(character);
      if (index < 0) throw new Error(`Caractere inválido no código: ${character}`);
      await clickInternal(
        page,
        82 + index % 8 * 68,
        166 + Math.floor(index / 8) * 36,
        true,
      );
    } else {
      await page.keyboard.press(
        /^\d$/u.test(character) ? `Digit${character}` : `Key${character}`,
      );
    }
    await page.waitForTimeout(15);
  }
}

async function lobbyDebug(page: Page): Promise<OnlineLobbyDebug | null> {
  return page.evaluate(() => (
    (window as typeof window & {
      __RUA_ONLINE_DEBUG__?: () => OnlineLobbyDebug;
    }).__RUA_ONLINE_DEBUG__?.() ?? null
  ));
}

async function fightDebug(page: Page): Promise<OnlineFightDebug | null> {
  return page.evaluate(() => (
    (window as typeof window & {
      __RUA_ONLINE_FIGHT_DEBUG__?: () => OnlineFightDebug;
    }).__RUA_ONLINE_FIGHT_DEBUG__?.() ?? null
  ));
}

async function worldSnapshot(page: Page): Promise<WorldSnapshot | null> {
  return page.evaluate(() => (
    (window as typeof window & {
      __ruaWorld?: { snapshot(): WorldSnapshot };
    }).__ruaWorld?.snapshot() ?? null
  ));
}

function collectDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { errors: [], notFound: [] };
  page.on('pageerror', (error) => diagnostics.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) diagnostics.notFound.push(response.url());
  });
  return diagnostics;
}

async function openOnline(page: Page, touch = false): Promise<void> {
  await page.goto('/');
  try {
    await page.waitForFunction(() => (
      (window as typeof window & {
        __RUA_SCENE_DEBUG__?: () => readonly string[];
      }).__RUA_SCENE_DEBUG__?.().includes('StartScene') ?? false
    ), { timeout: 35_000 });
  } catch {
    // A decodificação simultânea dos PNGs em dois contexts reais pode parar
    // no preload do Chrome local; um reload conserva o isolamento e reabre a
    // mesma build sem afrouxar as verificações de cena ou de assets.
    await page.reload();
    await waitScene(page, 'StartScene');
  }
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenuScene');
  if (touch) {
    await clickInternal(page, 320, 216, true);
  } else {
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('KeyS');
      await page.waitForTimeout(50);
    }
    await page.keyboard.press('Enter');
  }
  await waitScene(page, 'OnlineScene');
}

async function beginTouchAction(
  page: Page,
  action: 'left' | 'right' | 'light',
): Promise<() => Promise<void>> {
  const button = page.locator(`#touch-controls [data-action="${action}"]`).first();
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  if (!box) throw new Error(`Controle touch ${action} sem dimensões.`);
  const session = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  return async () => {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  };
}

async function createPair(
  browser: Browser,
  testInfo: TestInfo,
): Promise<{
  hostContext: BrowserContext;
  guestContext: BrowserContext;
  host: Page;
  guest: Page;
  hostDiagnostics: PageDiagnostics;
  guestDiagnostics: PageDiagnostics;
}> {
  const mobile = testInfo.project.name.includes('mobile');
  const contextOptions = mobile
    ? {
        viewport: { width: 720, height: 405 },
        screen: { width: 720, height: 405 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      }
    : {
        viewport: { width: 1280, height: 720 },
        screen: { width: 1280, height: 720 },
      };
  const hostContext = await browser.newContext(contextOptions);
  const guestContext = await browser.newContext(contextOptions);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const hostDiagnostics = collectDiagnostics(host);
  const guestDiagnostics = collectDiagnostics(guest);
  await Promise.all([openOnline(host, mobile), openOnline(guest, mobile)]);

  await host.waitForTimeout(120);
  await guest.waitForTimeout(120);
  await clickInternal(host, 320, 154, mobile);
  await expect.poll(async () => (await lobbyDebug(host))?.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/u);
  const roomCode = (await lobbyDebug(host))?.roomCode;
  if (!roomCode) throw new Error('Host não recebeu código de sala.');

  await clickInternal(guest, 320, 208, mobile);
  await enterRoomCode(guest, roomCode, mobile);
  if (mobile) await clickInternal(guest, 320, 318, true);
  else await guest.keyboard.press('Enter');
  await expect.poll(async () => (await lobbyDebug(guest))?.status).toBe('lobby');
  await expect.poll(async () => (await lobbyDebug(host))?.players.length).toBe(2);
  return {
    hostContext,
    guestContext,
    host,
    guest,
    hostDiagnostics,
    guestDiagnostics,
  };
}

async function selectAndStart(host: Page, guest: Page, touch: boolean): Promise<void> {
  await clickInternal(host, 90, 184, touch);
  await expect.poll(async () => (
    (await lobbyDebug(host))?.players.find((player) => player.slot === 'p1')?.fighterId
  )).toBe('rafa-mare');

  await clickInternal(guest, 549, 184, touch);
  await expect.poll(async () => (
    (await lobbyDebug(guest))?.players.find((player) => player.slot === 'p2')?.fighterId
  )).toBe('guto-barba');

  if (!touch) {
    expect(await guest.evaluate(() => (
      (window as typeof window & {
        __RUA_ONLINE_TRANSPORT_DEBUG__?: () => boolean;
      }).__RUA_ONLINE_TRANSPORT_DEBUG__?.() ?? false
    ))).toBe(true);
    await expect.poll(async () => (
      (await lobbyDebug(host))?.players.find((player) => player.slot === 'p2')?.connected
    ), { timeout: 5_000, intervals: [25] }).toBe(false);
    await expect.poll(async () => (await lobbyDebug(guest))?.status).toBe('lobby');
    await expect.poll(async () => (await lobbyDebug(guest))?.reconnectCount).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (
      (await lobbyDebug(guest))?.players.find((player) => player.slot === 'p2')?.fighterId
    )).toBe('guto-barba');
    await expect.poll(async () => (
      (await lobbyDebug(host))?.players.find((player) => player.slot === 'p2')?.connected
    )).toBe(true);
  }

  await clickInternal(host, 320, 298, touch);
  await expect.poll(async () => (
    (await lobbyDebug(host))?.players.find((player) => player.slot === 'p1')?.ready
  )).toBe(true);
  await clickInternal(guest, 320, 298, touch);
  await Promise.all([
    waitScene(host, 'FightScene'),
    waitScene(guest, 'FightScene'),
  ]);
}

async function assertNoOnlineCacheOrTicket(page: Page): Promise<void> {
  const audit = await page.evaluate(async () => {
    const debugValue = (window as typeof window & {
      __RUA_ONLINE_FIGHT_DEBUG__?: () => unknown;
      __RUA_ONLINE_DEBUG__?: () => unknown;
    }).__RUA_ONLINE_FIGHT_DEBUG__?.()
      ?? (window as typeof window & { __RUA_ONLINE_DEBUG__?: () => unknown }).__RUA_ONLINE_DEBUG__?.();
    const cachedUrls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) cachedUrls.push(request.url);
    }
    return {
      url: location.href,
      debug: JSON.stringify(debugValue),
      storage: sessionStorage.getItem('rua-de-aco.online-session.v1') ?? '',
      cachedUrls,
    };
  });
  expect(audit.url).not.toContain('ticket');
  expect(audit.url).not.toContain('token');
  expect(audit.debug).not.toMatch(/ticket|token|secret/iu);
  expect(audit.storage).not.toContain('socketTicket');
  expect(audit.storage).not.toContain('ticket.');
  expect(audit.cachedUrls.some((url) => url.includes('127.0.0.1:8787'))).toBe(false);
}

test('duas abas criam sala, mapeiam papéis e mantêm hash lockstep', async ({ browser }, testInfo) => {
  const pair = await createPair(browser, testInfo);
  try {
    await pair.host.screenshot({
      path: resolve(auditRoot, `${testInfo.project.name}-lobby.png`),
    });
    await selectAndStart(pair.host, pair.guest, testInfo.project.name.includes('mobile'));

    await expect.poll(async () => (await fightDebug(pair.host))?.inputDelay).toBe(8);
    await expect.poll(async () => (await fightDebug(pair.host))?.slot).toBe('p1');
    await expect.poll(async () => (await fightDebug(pair.guest))?.slot).toBe('p2');
    await expect.poll(async () => {
      const host = await fightDebug(pair.host);
      const guest = await fightDebug(pair.guest);
      return host?.startFingerprint !== null
        && host?.startFingerprint === guest?.startFingerprint;
    }).toBe(true);
    await expect.poll(async () => (await fightDebug(pair.host))?.lastHashFrame).toBeGreaterThanOrEqual(120);
    await expect.poll(async () => {
      const host = await fightDebug(pair.host);
      const guest = await fightDebug(pair.guest);
      return host?.lastHashFrame === guest?.lastHashFrame
        && host?.lastHash === guest?.lastHash
        && host?.lastHash !== null;
    }).toBe(true);

    const beforeMovement = await worldSnapshot(pair.host);
    const touch = testInfo.project.name.includes('mobile');
    const releaseMovement = touch
      ? await Promise.all([
          beginTouchAction(pair.host, 'right'),
          beginTouchAction(pair.guest, 'left'),
        ])
      : [
          async () => pair.host.keyboard.up('KeyD'),
          async () => pair.guest.keyboard.up('KeyA'),
        ];
    if (!touch) {
      await Promise.all([
        pair.host.keyboard.down('KeyD'),
        pair.guest.keyboard.down('KeyA'),
      ]);
    }
    await pair.host.waitForTimeout(800);
    await Promise.all(releaseMovement.map((release) => release()));
    await expect.poll(async () => {
      const [hostWorld, guestWorld] = await Promise.all([
        worldSnapshot(pair.host),
        worldSnapshot(pair.guest),
      ]);
      return hostWorld !== null && guestWorld !== null
        && Math.abs(hostWorld.fighters[0]!.x - guestWorld.fighters[0]!.x) <= 3
        && Math.abs(hostWorld.fighters[1]!.x - guestWorld.fighters[1]!.x) <= 3;
    }).toBe(true);
    const afterMovement = await worldSnapshot(pair.host);
    expect(afterMovement!.fighters[0]!.x).toBeGreaterThan(beforeMovement!.fighters[0]!.x);
    expect(afterMovement!.fighters[1]!.x).toBeLessThan(beforeMovement!.fighters[1]!.x);

    const releaseAttack = touch
      ? await beginTouchAction(pair.host, 'light')
      : async () => pair.host.keyboard.up('KeyF');
    if (!touch) await pair.host.keyboard.down('KeyF');
    await expect.poll(async () => {
      const [hostWorld, guestWorld] = await Promise.all([
        worldSnapshot(pair.host),
        worldSnapshot(pair.guest),
      ]);
      return hostWorld !== null && guestWorld !== null
        && hostWorld.fighters[0]!.activeMoveId !== null
        && hostWorld.fighters[0]!.activeMoveId === guestWorld.fighters[0]!.activeMoveId
        && hostWorld.fighters[1]!.health === guestWorld.fighters[1]!.health;
    }, { timeout: 5_000 }).toBe(true);
    await releaseAttack();

    const frameBeforePause = (await fightDebug(pair.host))?.simulationFrame ?? 0;
    await pair.host.keyboard.press('Escape');
    await pair.host.waitForTimeout(500);
    await expect.poll(async () => (
      ((await fightDebug(pair.host))?.simulationFrame ?? 0) > frameBeforePause + 10
    )).toBe(true);
    await pair.host.keyboard.press('Escape');

    const hashBeforeActions = (await fightDebug(pair.host))?.lastHashFrame ?? 0;
    await expect.poll(async () => {
      const host = await fightDebug(pair.host);
      const guest = await fightDebug(pair.guest);
      return (host?.lastHashFrame ?? 0) > hashBeforeActions
        && host?.lastHashFrame === guest?.lastHashFrame
        && host?.lastHash === guest?.lastHash;
    }, { timeout: 15_000 }).toBe(true);

    await assertNoOnlineCacheOrTicket(pair.host);
    await pair.host.screenshot({
      path: resolve(auditRoot, `${testInfo.project.name}-fight.png`),
    });

    await pair.guestContext.close();
    await waitScene(pair.host, 'ResultScene');
    await pair.host.screenshot({
      path: resolve(auditRoot, `${testInfo.project.name}-interrupted.png`),
    });
    const resultSession = await pair.host.evaluate(() => (
      (window as typeof window & {
        __RUA_SESSION_DEBUG__?: () => { mode: string; hasResult: boolean };
      }).__RUA_SESSION_DEBUG__?.()
    ));
    expect(resultSession).toEqual({ mode: 'online', hasResult: false });
    expect(pair.hostDiagnostics).toEqual({ errors: [], notFound: [] });
    expect(pair.guestDiagnostics).toEqual({ errors: [], notFound: [] });

    await clickInternal(pair.host, 320, 240, testInfo.project.name.includes('mobile'));
    await waitScene(pair.host, 'OnlineScene');
  } finally {
    await pair.hostContext.close();
    if (pair.guestContext.pages().length > 0) await pair.guestContext.close();
  }
});

test('trata sala inexistente e servidor indisponível sem sair da cena', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Caminhos de erro são cobertos no Chrome desktop.');

  const invalidContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    screen: { width: 1280, height: 720 },
  });
  const invalidPage = await invalidContext.newPage();
  try {
    await openOnline(invalidPage);
    await clickInternal(invalidPage, 320, 208);
    await enterRoomCode(invalidPage, 'AAAAAAAAAA');
    await invalidPage.keyboard.press('Enter');
    await expect.poll(async () => (await lobbyDebug(invalidPage))?.status).toBe('error');
    await expect(invalidPage.locator('.sr-only')).toContainText(/Sala não encontrada/iu);
    await expect.poll(() => activeScenes(invalidPage)).toContain('OnlineScene');
  } finally {
    await invalidContext.close();
  }

  const unavailableContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    screen: { width: 1280, height: 720 },
  });
  const unavailablePage = await unavailableContext.newPage();
  await unavailablePage.route('http://127.0.0.1:8787/**', (route) => route.abort('connectionrefused'));
  try {
    await openOnline(unavailablePage);
    await expect.poll(async () => (await lobbyDebug(unavailablePage))?.status).toBe('error');
    await expect(unavailablePage.locator('.sr-only')).toContainText(/indisponível/iu);
    await expect.poll(() => activeScenes(unavailablePage)).toContain('OnlineScene');
  } finally {
    await unavailableContext.close();
  }
});
