import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * O Playwright não fornece um gamepad físico; um mock controlado da Gamepad
 * API é instalado antes do carregamento da página. O mock comprova a
 * arquitetura (detecção, atribuição, leitura, captura e desconexão), mas não
 * substitui o teste manual com um controle real.
 */

interface ControlsDebugRow {
  readonly label: string;
  readonly value: string;
  readonly selected: boolean;
}

interface ControlsDebugState {
  readonly player: number;
  readonly device: string;
  readonly selectedIndex: number;
  readonly capturing: boolean;
  readonly rows: readonly ControlsDebugRow[];
  readonly status: string;
}

interface StoredControls {
  readonly version: number;
  readonly keyboard: readonly { readonly bindings: Record<string, string> }[];
  readonly gamepad: readonly { readonly bindings: Record<string, number>; readonly pause: number }[];
  readonly touch: { readonly slots: Record<string, string> };
}

const GAMEPAD_MOCK_INIT = `(() => {
  const pads = new Map();
  let polled = false;
  function makePad(index, id) {
    return {
      index,
      id,
      connected: true,
      mapping: 'standard',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
      timestamp: 0,
      vibrationActuator: null,
    };
  }
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => {
      polled = true;
      return [0, 1, 2, 3].map((index) => pads.get(index) ?? null);
    },
  });
  window.__GAMEPAD_MOCK__ = {
    connect(index, id) {
      pads.set(index, makePad(index, id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)'));
      window.dispatchEvent(new Event('gamepadconnected'));
    },
    disconnect(index) {
      pads.delete(index);
      window.dispatchEvent(new Event('gamepaddisconnected'));
    },
    press(index, button, pressed) {
      const pad = pads.get(index);
      if (!pad) return;
      pad.buttons[button].pressed = pressed !== false;
      pad.buttons[button].value = pressed !== false ? 1 : 0;
    },
    axis(index, axisIndex, value) {
      const pad = pads.get(index);
      if (pad) pad.axes[axisIndex] = value;
    },
    polled: () => polled,
  };
})();`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) errors.push(`404 ${response.url()}`);
  });
  return errors;
}

async function mock(page: Page, script: string): Promise<void> {
  await page.evaluate(`window.__GAMEPAD_MOCK__.${script}`);
}

async function gamepadPolled(page: Page): Promise<boolean> {
  return page.evaluate('window.__GAMEPAD_MOCK__.polled()') as Promise<boolean>;
}

async function activeScenes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_SCENE_DEBUG__?: () => readonly string[];
    }).__RUA_SCENE_DEBUG__;
    return debug?.() ?? [];
  });
}

async function waitForScene(page: Page, scene: string): Promise<void> {
  await expect.poll(() => activeScenes(page)).toContain(scene);
}

async function controlsDebug(page: Page): Promise<ControlsDebugState | null> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_CONTROLS_DEBUG__?: () => ControlsDebugState;
    }).__RUA_CONTROLS_DEBUG__;
    return debug?.() ?? null;
  });
}

async function storedControls(page: Page): Promise<StoredControls | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('rua-de-aco:controls:v1');
    return raw ? JSON.parse(raw) as StoredControls : null;
  });
}

async function isPaused(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_PAUSE_DEBUG__?: () => { paused: boolean };
    }).__RUA_PAUSE_DEBUG__;
    return debug?.().paused ?? null;
  });
}

async function pauseListLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_PAUSE_LIST_DEBUG__?: () => { lines: readonly string[] };
    }).__RUA_PAUSE_LIST_DEBUG__;
    return debug?.().lines ?? [];
  });
}

async function assignedPadIndex(page: Page, player: 0 | 1): Promise<number | null> {
  return page.evaluate((slot) => {
    const debug = (window as typeof window & {
      __RUA_GAMEPAD_DEBUG__?: () => { assigned: readonly ({ index: number } | null)[] };
    }).__RUA_GAMEPAD_DEBUG__;
    return debug?.().assigned[slot]?.index ?? null;
  }, player);
}

/** Pressiona um botão do mock até o efeito observável, evitando janelas fixas
 * que podem cair entre frames quando a máquina está sob carga. */
async function pressUntil<T>(
  page: Page,
  padIndex: number,
  button: number,
  predicate: () => Promise<T>,
  expected: T,
): Promise<void> {
  await mock(page, `press(${padIndex}, ${button}, true)`);
  await expect.poll(predicate, { timeout: 10_000 }).toBe(expected);
  await mock(page, `press(${padIndex}, ${button}, false)`);
  // Garante que a soltura também foi observada por pelo menos um polling.
  await page.waitForTimeout(250);
}

async function fightPhase(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot: () => { phase: string } };
    }).__ruaWorld;
    return world?.snapshot().phase ?? null;
  });
}

async function fighterX(page: Page, index: number): Promise<number | null> {
  return page.evaluate((fighterIndex) => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot: () => { fighters: readonly { x: number }[] } };
    }).__ruaWorld;
    return world?.snapshot().fighters[fighterIndex]?.x ?? null;
  }, index);
}

async function activeMoveId(page: Page, index: number): Promise<string | null> {
  return page.evaluate((fighterIndex) => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot: () => { fighters: readonly { activeMoveId: string | null }[] } };
    }).__ruaWorld;
    return world?.snapshot().fighters[fighterIndex]?.activeMoveId ?? null;
  }, index);
}

async function tapInternal(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas sem dimensões para o toque.');
  await page.touchscreen.tap(
    box.x + x / 640 * box.width,
    box.y + y / 360 * box.height,
  );
}

async function enterMainMenu(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto('/');
  await waitForScene(page, 'StartScene');
  if (testInfo.project.name === 'chrome-mobile-landscape') {
    await tapInternal(page, 320, 180);
  } else {
    await page.keyboard.press('Enter');
  }
  await waitForScene(page, 'MainMenuScene');
}

async function openTrainingFight(page: Page, testInfo: TestInfo): Promise<void> {
  await enterMainMenu(page, testInfo);
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(70);
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(70);
  await page.keyboard.press('Enter');
  await waitForScene(page, 'CharacterSelectScene');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(220);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await waitForScene(page, 'FightScene');
}

async function openControlsScene(page: Page, testInfo: TestInfo): Promise<void> {
  await enterMainMenu(page, testInfo);
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('Enter');
  await waitForScene(page, 'SettingsScene');
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Enter');
  await waitForScene(page, 'ControlsScene');
}

async function selectRow(page: Page, targetIndex: number): Promise<void> {
  const state = await controlsDebug(page);
  if (!state) throw new Error('Tela de controles sem estado de depuração.');
  const delta = targetIndex - state.selectedIndex;
  const key = delta >= 0 ? 'KeyS' : 'KeyW';
  for (let step = 0; step < Math.abs(delta); step += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
  }
  await expect.poll(async () => (await controlsDebug(page))?.selectedIndex).toBe(targetIndex);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(GAMEPAD_MOCK_INIT);
});

test('gamepad mock é detectado, controla a luta, pausa e desconecta sem prender input', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chrome-mobile-landscape', 'Cenário coberto no desktop.');
  const errors = watchErrors(page);
  await openTrainingFight(page, testInfo);
  await expect.poll(() => gamepadPolled(page)).toBe(true);
  // A luta só aceita movimento depois da introdução (ROUND/FIGHT).
  await expect.poll(() => fightPhase(page), { timeout: 10_000 }).toBe('active');

  // Conecta e ativa: o primeiro controle ativo vira P1.
  await mock(page, "connect(0)");
  await pressUntil(page, 0, 0, () => assignedPadIndex(page, 0), 0);
  // Espera o jab disparado pela atribuição terminar.
  await expect.poll(() => activeMoveId(page, 0), { timeout: 10_000 }).toBeNull();

  // Perfil padrão: D-pad direita move o P1.
  const before = await fighterX(page, 0);
  expect(before).not.toBeNull();
  await mock(page, "press(0, 15, true)");
  await expect.poll(async () => (await fighterX(page, 0)) ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(before ?? 0);
  await mock(page, "press(0, 15, false)");
  await page.waitForTimeout(250);

  // Botão 9 pausa e retoma.
  await pressUntil(page, 0, 9, () => isPaused(page), true);
  await pressUntil(page, 0, 9, () => isPaused(page), false);

  // Desconecta segurando uma direção: o input não fica preso.
  await mock(page, "press(0, 15, true)");
  await page.waitForTimeout(200);
  await mock(page, "disconnect(0)");
  await page.waitForTimeout(200);
  const stopX = await fighterX(page, 0);
  await page.waitForTimeout(400);
  expect(await fighterX(page, 0)).toBe(stopX);

  // Teclado continua como fallback após a desconexão.
  await page.keyboard.press('Escape');
  await expect.poll(() => isPaused(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => isPaused(page)).toBe(false);

  expect(errors).toEqual([]);
});

test('remapeia teclado com conflito determinístico, restaura padrão e persiste', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chrome-mobile-landscape', 'Cenário coberto no desktop.');
  const errors = watchErrors(page);
  await openControlsScene(page, testInfo);

  // Linha FRACO (índice 6) captura KeyT.
  await selectRow(page, 6);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(true);
  await page.keyboard.press('KeyT');
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(false);
  await expect.poll(async () => (await controlsDebug(page))?.rows[6]?.value).toBe('T');
  await expect.poll(async () => (await storedControls(page))?.keyboard[0]?.bindings['light']).toBe('KeyT');

  // Conflito: FORTE também quer KeyT; troca determinística com FRACO.
  await selectRow(page, 7);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(true);
  await page.keyboard.press('KeyT');
  await expect.poll(async () => (await controlsDebug(page))?.rows[7]?.value).toBe('T');
  await expect.poll(async () => (await controlsDebug(page))?.rows[6]?.value).toBe('G');
  const swapped = await storedControls(page);
  expect(swapped?.keyboard[0]?.bindings['heavy']).toBe('KeyT');
  expect(swapped?.keyboard[0]?.bindings['light']).toBe('KeyG');

  // Tecla reservada é rejeitada com mensagem clara.
  await selectRow(page, 8);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.status).toContain('RESERVADA');
  await expect.poll(async () => (await storedControls(page))?.keyboard[0]?.bindings['special']).toBe('KeyH');

  // Restaurar perfil retorna aos padrões.
  await selectRow(page, 10);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.rows[6]?.value).toBe('F');
  await expect.poll(async () => (await storedControls(page))?.keyboard[0]?.bindings['light']).toBe('KeyF');

  // Novo remapeamento sobrevive ao reload da página.
  await selectRow(page, 6);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(true);
  await page.keyboard.press('KeyT');
  await expect.poll(async () => (await storedControls(page))?.keyboard[0]?.bindings['light']).toBe('KeyT');
  await page.reload();
  await waitForScene(page, 'StartScene');
  expect((await storedControls(page))?.keyboard[0]?.bindings['light']).toBe('KeyT');

  // A pausa apresenta o binding vigente.
  await openTrainingFight(page, testInfo);
  await page.keyboard.press('Escape');
  await expect.poll(() => isPaused(page)).toBe(true);
  await expect.poll(() => pauseListLines(page)).toContain('T FRACO | G FORTE | H ESP | R DEF');

  expect(errors).toEqual([]);
});

test('remapeia botão de gamepad com captura neutra e rótulos da família', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chrome-mobile-landscape', 'Cenário coberto no desktop.');
  const errors = watchErrors(page);
  await openControlsScene(page, testInfo);

  await mock(page, "connect(0)");
  await pressUntil(page, 0, 2, () => assignedPadIndex(page, 0), 0);

  // Dispositivo: TECLADO -> CONTROLE.
  await selectRow(page, 1);
  await page.keyboard.press('KeyD');
  await expect.poll(async () => (await controlsDebug(page))?.device).toBe('gamepad');

  // ESPECIAL captura o botão 5 (RB na família Xbox) após estado neutro.
  await selectRow(page, 8);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(true);
  // A captura exige uma leitura neutra completa antes de aceitar o botão.
  await page.waitForTimeout(400);
  await mock(page, "press(0, 5, true)");
  await expect.poll(async () => (await controlsDebug(page))?.capturing).toBe(false);
  await mock(page, "press(0, 5, false)");
  await expect.poll(async () => (await controlsDebug(page))?.rows[8]?.value).toBe('RB');
  await expect.poll(async () => (await storedControls(page))?.gamepad[0]?.bindings['special']).toBe(5);

  // O perfil do P2 permanece padrão.
  expect((await storedControls(page))?.gamepad[1]?.bindings['special']).toBe(2);

  expect(errors).toEqual([]);
});

test('mobile: touch preservado, posições remapeáveis e rótulos atualizados', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome-mobile-landscape', 'Fluxo exclusivo do projeto mobile touch.');
  const errors = watchErrors(page);
  await openControlsScene(page, testInfo);

  // Dispositivo: TECLADO -> CONTROLE -> TOUCH por toques na metade direita.
  await tapInternal(page, 500, 84);
  await tapInternal(page, 500, 84);
  await expect.poll(async () => (await controlsDebug(page))?.device).toBe('touch');

  // Posição superior direita (A/fraco) passa a executar o forte.
  await tapInternal(page, 500, 124);
  await expect.poll(async () => (await storedControls(page))?.touch.slots['ne']).toBe('heavy');
  expect((await storedControls(page))?.touch.slots['nw']).toBe('light');
  await expect.poll(() => page.locator('#touch-controls .pos-ne').getAttribute('data-action')).toBe('heavy');
  await expect.poll(() => page.locator('#touch-controls .pos-ne').textContent()).toBe('B');
  await expect.poll(() => page.locator('#touch-controls .pos-nw').getAttribute('data-action')).toBe('light');

  // Uma luta nova usa o mapeamento remapeado e o touch continua funcionando.
  await openTrainingFight(page, testInfo);
  await expect.poll(() => fightPhase(page), { timeout: 10_000 }).toBe('active');
  const heavyButton = page.locator('#touch-controls .pos-ne');
  await expect(heavyButton).toBeVisible();
  const box = await heavyButton.boundingBox();
  if (!box) throw new Error('Botão touch sem dimensões.');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => activeMoveId(page, 0), { timeout: 4000 }).not.toBeNull();

  expect(errors).toEqual([]);
});
