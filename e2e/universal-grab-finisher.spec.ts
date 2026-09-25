import { test, expect } from '@playwright/test';
import { clickCanvas } from './helpers/selection';
import type { CombatWorld } from '../src/combat/CombatWorld';

type W = Window & { __ruaWorld: CombatWorld; __RUA_SCENE_DEBUG__:()=>string[];
  __RUA_CAPTURE_DEBUG__: { pause():void; resume():void; step(held?:string[],pressed?:string[]):void };
  __RUA_FIGHTER_DEBUG__:()=>{bodySprites:{name:string;visible:boolean;texture:string}[]};
  __RUA_UI_LAYOUT_DEBUG__?:()=>{name:string;text:string}[];
};
test('agarrão por teclado/multitoque e finalização completa do Cais', async ({ page, isMobile, context }, info) => {
  test.setTimeout(120000);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('__MISSING'))errors.push(m.text());});
  const scenes=()=>page.evaluate(()=>(window as unknown as W).__RUA_SCENE_DEBUG__?.());
  const tap=(x:number,y:number)=>clickCanvas(page,x,y,isMobile);
  // Sempre com ?.: entre fases o mundo pode sumir, e um TypeError esconderia
  // o estado real em que o teste parou.
  const phase = () => page.evaluate(()=>(window as unknown as W).__ruaWorld?.phase);
  // O preload decodifica as sete folhas novas do agarrão além do elenco inteiro:
  // com cache frio o boot passa dos 10 s padrão de expect.
  await page.goto('/'); await expect.poll(scenes,{timeout:45000}).toContain('StartScene'); await tap(320,180);
  await expect.poll(scenes).toContain('MainMenuScene'); await tap(320,154);
  await expect.poll(scenes).toContain('CharacterSelectScene');
  await tap(502,302); await page.waitForTimeout(200); await tap(502,302); await page.waitForTimeout(200); await tap(320,306);
  await expect.poll(scenes).toContain('FightScene');
  await expect.poll(phase).toBe('active');
  // Establish the final-round situation without playing two whole matches.
  await page.evaluate(()=>{const w=(window as unknown as W).__ruaWorld; w.fighters[0].resetPosition(280,1);w.fighters[1].resetPosition(350,-1);w.fighters[0].roundWins=1;w.fighters[1].health=0;});
  await expect.poll(phase).toBe('finishReady');
  await page.screenshot({path:info.outputPath('finalize.png')});
  // Os dois botões precisam cair dentro da tolerância de três frames. O toque já
  // envia um evento único com dois pontos; no teclado as duas teclas são
  // despachadas sem aguardar a primeira resposta, senão a latência de um runner
  // lento separa o acorde e sai um golpe comum, que encerra a luta.
  const chord = async () => {
    if(isMobile){
      const points=[];
      for(const action of ['light','heavy']) { const box=await page.locator('#touch-controls button[data-action='+action+']').boundingBox(); if(!box)throw Error('Botão ausente'); points.push({x:box.x+box.width/2,y:box.y+box.height/2,id:points.length}); }
      const cdp=await context.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      await page.waitForTimeout(100); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
    } else {
      await Promise.all([page.keyboard.down('f'),page.keyboard.down('g')]);
      await page.waitForTimeout(80);
      await Promise.all([page.keyboard.up('f'),page.keyboard.up('g')]);
    }
  };
  await chord();
  // A janela dura oito segundos: enquanto ela seguir aberta, um acorde perdido
  // por jitter ainda pode ser repetido após a recuperação do golpe errado.
  for(let attempt=0; attempt<4 && await phase()==='finishReady'; attempt++){ await page.waitForTimeout(500); await chord(); }
  await expect.poll(phase).toBe('stageFinish');
  await page.evaluate(()=>(window as unknown as W).__RUA_CAPTURE_DEBUG__.pause());
  for(const target of [35,85,151,186,275]) {
    await page.evaluate(f=>{const w=window as unknown as W; while(w.__ruaWorld.phaseFrame<f)w.__RUA_CAPTURE_DEBUG__.step();},target);
    await page.waitForTimeout(100); await page.screenshot({path:info.outputPath('finisher-'+target+'.png')});
    if(target===186) expect(await page.evaluate(()=>(window as unknown as W).__RUA_FIGHTER_DEBUG__().bodySprites.find(s=>s.name===(window as unknown as W).__ruaWorld.fighters[1].id+'-fighter-sprite')!.visible)).toBe(false);
  }
  await page.evaluate(()=>{const w=window as unknown as W; while(w.__ruaWorld.phase!=='matchOver') w.__RUA_CAPTURE_DEBUG__.step();});
  await expect.poll(scenes).toContain('ResultScene'); expect(errors).toEqual([]);
});

test('finalização da cozinha: panela sem ácido, bruxa mexe e sobram ossos', async ({ page, isMobile, context }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('__MISSING')) errors.push(m.text()); });
  const scenes = () => page.evaluate(() => (window as unknown as W).__RUA_SCENE_DEBUG__?.());
  const tap = (x: number, y: number) => clickCanvas(page, x, y, isMobile);
  const phase = () => page.evaluate(() => (window as unknown as W).__ruaWorld?.phase);
  const stage = () => page.evaluate(() => (window as unknown as W & {
    __RUA_STAGE_DEBUG__?: () => { ambience?: { potOpen: boolean; bonesVisible: boolean; acidVisible: boolean } };
  }).__RUA_STAGE_DEBUG__?.());
  await page.goto('/');
  await expect.poll(scenes, { timeout: 45000 }).toContain('StartScene');
  await tap(320, 180);
  await expect.poll(scenes).toContain('MainMenuScene');
  await tap(320, 154);
  await expect.poll(scenes).toContain('CharacterSelectScene');
  const fase = () => page.evaluate(() => (window as unknown as W).__RUA_UI_LAYOUT_DEBUG__?.().find(e => e.name === 'character-select-phase')?.text);
  const arena = () => page.evaluate(() => (window as unknown as W).__RUA_UI_LAYOUT_DEBUG__?.().find(e => e.name === 'arena-name')?.text);
  await tap(502, 302);
  await expect.poll(fase).toContain('JOGADOR 2');
  await tap(502, 302);
  await expect.poll(arena).toBe('CAIS DA CIDADE');
  if (isMobile) await tap(590, 86);
  else await page.keyboard.press('KeyD');
  await expect.poll(arena).toBe('COZINHA MACABRA');
  await tap(320, 306);
  await expect.poll(scenes).toContain('FightScene');
  await expect.poll(phase).toBe('active');
  await expect.poll(() => page.evaluate(() => (window as unknown as W & {
    __RUA_STAGE_DEBUG__?: () => { arena?: string };
  }).__RUA_STAGE_DEBUG__?.().arena)).toBe('cozinha-macabra');
  if (isMobile) {
    const width = await page.locator('.touch-button[data-action="light"]').evaluate(el => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(72);
  }
  await page.evaluate(() => {
    const w = (window as unknown as W).__ruaWorld;
    w.fighters[0].resetPosition(280, 1);
    w.fighters[1].resetPosition(350, -1);
    w.fighters[0].roundWins = 1;
    w.fighters[1].health = 0;
  });
  await expect.poll(phase).toBe('finishReady');
  const chord = async () => {
    if (isMobile) {
      const points = [];
      for (const action of ['light', 'heavy']) {
        const box = await page.locator('#touch-controls button[data-action=' + action + ']').boundingBox();
        if (!box) throw Error('Botão ausente');
        points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: points.length });
      }
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await page.waitForTimeout(100);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await Promise.all([page.keyboard.down('f'), page.keyboard.down('g')]);
      await page.waitForTimeout(80);
      await Promise.all([page.keyboard.up('f'), page.keyboard.up('g')]);
    }
  };
  await chord();
  for (let attempt = 0; attempt < 4 && await phase() === 'finishReady'; attempt++) {
    await page.waitForTimeout(500);
    await chord();
  }
  await expect.poll(phase).toBe('stageFinish');
  await page.evaluate(() => (window as unknown as W).__RUA_CAPTURE_DEBUG__.pause());
  const bodyVisible = () => page.evaluate(() => {
    const w = window as unknown as W;
    const id = w.__ruaWorld.fighters[1].id;
    return w.__RUA_FIGHTER_DEBUG__().bodySprites.find(s => s.name === id + '-fighter-sprite')!.visible;
  });
  for (const target of [40, 130, 230]) {
    await page.evaluate(f => {
      const w = window as unknown as W;
      while (w.__ruaWorld.phase === 'stageFinish' && w.__ruaWorld.phaseFrame < f) w.__RUA_CAPTURE_DEBUG__.step();
    }, target);
    await page.waitForTimeout(80);
    const ambience = (await stage())?.ambience;
    if (target === 40) {
      expect(ambience?.potOpen).toBe(false);
      expect(ambience?.acidVisible).toBe(true);
      expect(await bodyVisible()).toBe(true);
    }
    if (target === 130) {
      expect(ambience?.potOpen).toBe(true);
      expect(ambience?.acidVisible).toBe(false);
      expect(ambience?.bonesVisible).toBe(false);
      expect(await bodyVisible()).toBe(true);
    }
    if (target === 230) {
      expect(ambience?.potOpen).toBe(true);
      expect(ambience?.acidVisible).toBe(false);
      expect(ambience?.bonesVisible).toBe(true);
      expect(await bodyVisible()).toBe(false);
    }
    await page.screenshot({ path: info.outputPath('kitchen-finisher-' + target + '.png') });
  }
  await page.evaluate(() => {
    const w = window as unknown as W;
    while (w.__ruaWorld.phase !== 'matchOver') w.__RUA_CAPTURE_DEBUG__.step();
  });
  await expect.poll(scenes).toContain('ResultScene');
  expect(errors).toEqual([]);
});

test('finalização do Sítio: portas do galpão, mascarado com tridente e corpo empalado', async ({ page, isMobile, context }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('__MISSING')) errors.push(m.text()); });
  const scenes = () => page.evaluate(() => (window as unknown as W).__RUA_SCENE_DEBUG__?.());
  const tap = (x: number, y: number) => clickCanvas(page, x, y, isMobile);
  const phase = () => page.evaluate(() => (window as unknown as W).__ruaWorld?.phase);
  const stage = () => page.evaluate(() => (window as unknown as W & {
    __RUA_STAGE_DEBUG__?: () => { arena?: string; ambience?: { doorsOpen: number; farmerVisible: boolean; tridentTip: { x: number; y: number } | null } };
  }).__RUA_STAGE_DEBUG__?.());
  await page.goto('/');
  await expect.poll(scenes, { timeout: 45000 }).toContain('StartScene');
  await tap(320, 180);
  await expect.poll(scenes).toContain('MainMenuScene');
  await tap(320, 154);
  await expect.poll(scenes).toContain('CharacterSelectScene');
  const fase = () => page.evaluate(() => (window as unknown as W).__RUA_UI_LAYOUT_DEBUG__?.().find(e => e.name === 'character-select-phase')?.text);
  const arena = () => page.evaluate(() => (window as unknown as W).__RUA_UI_LAYOUT_DEBUG__?.().find(e => e.name === 'arena-name')?.text);
  await tap(502, 302);
  await expect.poll(fase).toContain('JOGADOR 2');
  await tap(502, 302);
  await expect.poll(arena).toBe('CAIS DA CIDADE');
  for (const expected of ['COZINHA MACABRA', 'SITIO']) {
    if (isMobile) await tap(590, 86);
    else await page.keyboard.press('KeyD');
    await expect.poll(arena).toBe(expected);
  }
  await tap(320, 306);
  await expect.poll(scenes).toContain('FightScene');
  await expect.poll(phase).toBe('active');
  await expect.poll(async () => (await stage())?.arena).toBe('sitio');
  await page.evaluate(() => {
    const w = (window as unknown as W).__ruaWorld;
    w.fighters[0].resetPosition(280, 1);
    w.fighters[1].resetPosition(350, -1);
    w.fighters[0].roundWins = 1;
    w.fighters[1].health = 0;
  });
  await expect.poll(phase).toBe('finishReady');
  const chord = async () => {
    if (isMobile) {
      const points = [];
      for (const action of ['light', 'heavy']) {
        const box = await page.locator('#touch-controls button[data-action=' + action + ']').boundingBox();
        if (!box) throw Error('Botão ausente');
        points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: points.length });
      }
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await page.waitForTimeout(100);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await Promise.all([page.keyboard.down('f'), page.keyboard.down('g')]);
      await page.waitForTimeout(80);
      await Promise.all([page.keyboard.up('f'), page.keyboard.up('g')]);
    }
  };
  await chord();
  for (let attempt = 0; attempt < 4 && await phase() === 'finishReady'; attempt++) {
    await page.waitForTimeout(500);
    await chord();
  }
  await expect.poll(phase).toBe('stageFinish');
  await page.evaluate(() => (window as unknown as W).__RUA_CAPTURE_DEBUG__.pause());
  const bodyVisible = () => page.evaluate(() => {
    const w = window as unknown as W;
    const id = w.__ruaWorld.fighters[1].id;
    return w.__RUA_FIGHTER_DEBUG__().bodySprites.find(s => s.name === id + '-fighter-sprite')!.visible;
  });
  for (const target of [20, 90, 130, 290]) {
    await page.evaluate(f => {
      const w = window as unknown as W;
      while (w.__ruaWorld.phase === 'stageFinish' && w.__ruaWorld.phaseFrame < f) w.__RUA_CAPTURE_DEBUG__.step();
    }, target);
    await page.waitForTimeout(80);
    const ambience = (await stage())?.ambience;
    if (target === 20) {
      expect(ambience?.doorsOpen).toBe(0);
      expect(ambience?.farmerVisible).toBe(false);
    }
    if (target === 90) {
      expect(ambience?.doorsOpen).toBe(1);
      expect(ambience?.farmerVisible).toBe(true);
      expect(await bodyVisible()).toBe(true);
    }
    if (target === 130) {
      // Empalado: o corpo fica à vista sobre o tridente, dentro da abertura do galpão.
      expect(ambience?.farmerVisible).toBe(true);
      expect(await bodyVisible()).toBe(true);
      const victim = await page.evaluate(() => { const v = (window as unknown as W).__ruaWorld.fighters[1]; return { x: v.x, y: v.y }; });
      expect(victim.y).toBeGreaterThan(129);
      expect(victim.y).toBeLessThan(216);
    }
    if (target === 290) {
      expect(ambience?.doorsOpen).toBe(0);
      expect(ambience?.farmerVisible).toBe(false);
      expect(await bodyVisible()).toBe(false);
    }
    await page.screenshot({ path: info.outputPath('sitio-finisher-' + target + '.png') });
  }
  await page.evaluate(() => {
    const w = window as unknown as W;
    while (w.__ruaWorld.phase !== 'matchOver') w.__RUA_CAPTURE_DEBUG__.step();
  });
  await expect.poll(scenes).toContain('ResultScene');
  expect(errors).toEqual([]);
});

const fighters = ['rafa-mare','noir-reflexo','astro-riso','dante-sinal','leo-violeta','guto-barba'];
for (const [index, id] of fighters.entries()) test('sprites próprios do agarrão: '+id, async ({page,isMobile},info)=>{
  test.skip(isMobile, 'O multitoque é coberto pela finalização completa; aqui auditamos as seis artes.');
  test.setTimeout(120000);
  const scenes=()=>page.evaluate(()=>(window as unknown as W).__RUA_SCENE_DEBUG__?.());
  await page.goto('/'); await expect.poll(scenes,{timeout:45000}).toContain('StartScene');
  await clickCanvas(page,320,180,false);
  await expect.poll(scenes).toContain('MainMenuScene'); await clickCanvas(page,320,154,false);
  await expect.poll(scenes).toContain('CharacterSelectScene');
  const box=(await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+(112+(index%3)*94)*box.width/640,box.y+(150+Math.floor(index/3)*102)*box.height/360);
  await page.waitForTimeout(100);
  // Confirma cada fase esperando o rótulo mudar. Com 300ms fixos, um runner
  // carregado perde o clique e a luta nunca começa.
  const fase = () => page.evaluate(()=>(window as unknown as W).__RUA_UI_LAYOUT_DEBUG__?.().find(e=>e.name==='character-select-phase')?.text);
  const confirmar = async (x:number, y:number) => {
    const antes = await fase();
    await clickCanvas(page,x,y,false);
    await expect.poll(fase).not.toBe(antes);
  };
  await confirmar(502,302);
  await confirmar(502,302);
  await clickCanvas(page,320,306,false);
  await expect.poll(scenes).toContain('FightScene');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as W).__ruaWorld?.phase)).toBe('active');
  await page.evaluate(()=>{
    const w=window as unknown as W; w.__RUA_CAPTURE_DEBUG__.pause();
    w.__ruaWorld.fighters[0].resetPosition(280,1); w.__ruaWorld.fighters[1].resetPosition(350,-1);
    w.__RUA_CAPTURE_DEBUG__.step(['light','heavy'],['light','heavy']);
  });
  expect(await page.evaluate(()=>(window as unknown as W).__ruaWorld.fighters[0].id)).toBe(id);
  for(const frame of [14,24,36,41]){
    await page.evaluate(f=>{const w=window as unknown as W; for(let i=0;i<90&&w.__ruaWorld.fighters[0].stateFrame<f;i++)w.__RUA_CAPTURE_DEBUG__.step();},frame);
    await page.waitForTimeout(80);
    const bodies=await page.evaluate(()=>(window as unknown as W).__RUA_FIGHTER_DEBUG__().bodySprites);
    expect(bodies.some(s=>s.texture===id+'-universalGrab-v2'&&s.visible)).toBe(true);
    await page.screenshot({path:info.outputPath('grab-'+id+'-'+frame+'.jpg'),type:'jpeg',quality:75});
  }
});
