# Rua de Aço

Vertical slice de um jogo de luta 2D para navegador com direção visual de arcade dos anos 1990. O projeto usa Phaser 4.1.0, TypeScript e Vite 8, sem React, servidor ou banco de dados.

Rafa Maré e Guto Barba estão jogáveis em uma luta melhor de três rounds no Cais da Cidade. Noir Reflexo, Astro Riso, Dante Sinal e Léo Violeta aparecem na seleção como **Em desenvolvimento** e já possuem definições individuais.

## Requisitos

- Node.js 20.19 ou superior;
- npm 10 ou superior;
- navegador moderno com WebGL ou Canvas 2D;
- HTTPS em produção para PWA e service worker.

## Instalação e execução

```bash
npm install
npm run dev
```

Comandos de validação:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## Renderização 16-bits

- viewport lógico: **320 × 180**;
- `Phaser.AUTO`, `Scale.FIT` e `Scale.CENTER_BOTH`;
- `pixelArt: true`, `antialias: false`, `roundPixels: true` e canvas opaco;
- CSS com `image-rendering: pixelated` e `crisp-edges`;
- fonte bitmap local dentro do canvas e Press Start 2P local para os controles HTML;
- sprites em posições inteiras e sem zoom fracionário de câmera.

A simulação de combate continua no espaço 640 × 360 para preservar frame data, alcance, CPU e testes. A camada visual projeta as coordenadas com fator 0,5. O combate roda em passo fixo de 60 Hz e não depende das colisões automáticas do Phaser.

## Controles

### Jogador 1

| Ação | Tecla |
| --- | --- |
| Esquerda / direita | A / D |
| Pular / agachar | W / S |
| Ataque fraco | F |
| Ataque forte | G |
| Especial | H |
| Defesa | R |
| Confirmar | Enter |
| Pausar / voltar | Escape |

### Jogador 2

| Ação | Tecla |
| --- | --- |
| Esquerda / direita | Setas esquerda / direita |
| Pular / agachar | Setas cima / baixo |
| Ataque fraco | J |
| Ataque forte | K |
| Especial | L |
| Defesa | U |

Em aparelhos com toque, o modo automático mostra o direcional à esquerda e os botões A, B, S e escudo à direita. O sistema aceita múltiplos dedos, cancela ações ao sair da área e libera todas as entradas em perda de foco ou mudança de orientação.

No treinamento:

- F1 ou **BOXES** alterna hitboxes, hurtboxes e pushboxes;
- F2 ou **REPOS.** reinicia posições;
- F3 ou **CPU** ativa/desativa a CPU;
- vida e energia são infinitas.

## Estrutura principal

```text
src/
  assets/      manifesto central de imagens e texturas
  ai/          máquina de estados e dificuldades da CPU
  audio/       áudio temporário sintetizado
  combat/      simulação, frame data, caixas e rounds
  config/      pixelArtConfig, sessão e preferências
  fighters/    dados de lutadores e descritores de sprites
  input/       teclado, comandos e multitouch
  pwa/         instalação e registro do service worker
  scenes/      oito cenas Phaser
  types/       contratos de combate e assets
  ui/          arena raster, retratos e sprites de luta
public/
  assets/
    fighters/  spritesheets planos de Rafa (192) e Guto (256)
    fonts/     fonte bitmap e fonte web local licenciada
    references/ seis conceitos e logo fornecidos
    stages/    camadas raster do Cais da Cidade
    ui/        molduras e painéis raster
  icons/
  manifest.webmanifest
  service-worker.js
scripts/
  generate-pixel-assets.mjs
  audit-fighter-sprites.mjs
```

`src/assets/assetManifest.ts` e `src/fighters/visual/` são as fontes das chaves, caminhos e dimensões. A `PreloadScene` carrega os strips como spritesheets, valida largura, altura, quantidade de frames e layout horizontal, e interrompe a navegação com um painel de diagnóstico se um recurso obrigatório estiver ausente ou mal recortado.

Os conceitos são tratados como `PortraitAsset` e aparecem no menu, seleção, ficha, apresentação versus, HUD e resultado. Eles nunca são usados como corpos durante a luta. Os corpos usam `FighterSpriteAsset` separado.

## Como adicionar um personagem

1. Crie `src/fighters/nomeDoPersonagem.ts` com um `FighterDefinition`.
2. Defina atributos, hurtboxes, habilidades, animações e movimentos por dados.
3. Adicione o conceito e seus crops em `src/assets/assetManifest.ts`.
4. Crie um descritor visual em `src/fighters/visual/` e registre-o no índice.
5. Coloque os PNGs de animação na pasta do lutador.
6. Adicione a definição a `src/fighters/index.ts`.
7. Marque `available: true` somente quando golpes, arte e testes estiverem completos.

Não ajuste tempos ou caixas com base no tamanho visual do PNG. A origem lógica permanece nos pés e as regras ficam no núcleo de combate.

## Contrato dos sprites de Rafa e Guto

Todos os PNGs ficam diretamente em `public/assets/fighters/rafa-mare/` ou `public/assets/fighters/guto-barba/`. Não crie subpastas `sprites`, `specials`, `effects` ou `portraits`.

Os dois lutadores compartilham estes nomes:

```text
idle.png
corrida.png
walk-backward.png
crouch.png
jump-neutral.png, jump-forward.png, jump-backward.png
fall.png, landing.png
standing-light.png, standing-heavy.png
forward-light.png, forward-heavy.png
crouch-light.png, crouch-heavy.png
air-light-neutral.png, air-heavy-neutral.png
air-light-forward.png, air-heavy-forward.png
air-light-backward.png, air-heavy-backward.png
block-standing.png, block-crouching.png
hit.png, knockdown.png, wake-up.png
grabbed-front.png, grabbed-lifted.png, thrown.png, frozen.png
victory.png, knockout.png
```

Rafa acrescenta `mao-da-mare`, `chute-da-ressaca` e `eco-tatuado`, cada qual com seu PNG de efeito. Guto acrescenta `muralha-norte` e seu efeito; Gancho do Urso usa os strips `startup`, `grab`, `hold`, `throw` e `recovery`; Abraço Glacial usa `startup`, `grab`, `hold`, `freeze`, `finish` e seu efeito. Guto nunca inclui a vítima dentro do próprio PNG.

Cada strip tem quatro frames horizontais: 192 × 192 por frame para Rafa e 256 × 256 para Guto. Ao substituir uma arte:

1. mantenha nome, transparência e quatro quadros realmente distintos;
2. preserve a referência conceitual em `public/assets/references/` sem alterá-la;
3. ajuste dimensões, origem, escala, offsets, efeitos e fases em `src/fighters/visual/`;
4. rode `node scripts/audit-fighter-sprites.mjs`, typecheck, testes e build.

`scripts/generate-pixel-assets.mjs` gera somente recursos compartilhados (fonte, cenário e UI); ele não escreve nas pastas de Rafa ou Guto. O jogo não executa geração de arte em tempo de execução.

## PWA e publicação

`vite.config.ts` usa `base: './'`, permitindo hospedagem na raiz ou em subdiretório. O build gera `precache-manifest.js`; após a primeira carga completa, o service worker mantém os arquivos disponíveis offline.

Para publicar:

1. execute `npm run build`;
2. envie todo o conteúdo de `dist/` para um host estático;
3. use HTTPS;
4. teste instalação, atualização, recarga e modo offline na URL final.

## Testes

Os testes cobrem dano, energia, hit stun, comandos, passo fixo, defesa, agarrões genéricos, projéteis, rounds, preferências, projeção 320 × 180, manifesto plano e dimensões reais dos spritesheets.

## Estado dos recursos

Definitivos nesta etapa:

- arquitetura de combate, entrada, CPU, persistência e PWA;
- resolução e pipeline de renderização 320 × 180;
- manifesto, validação e separação entre conceitos e sprites;
- sprites animados e estados de vítima separados de Rafa e Guto;
- uso correto dos seis conceitos e do logo fornecido;
- fluxo das oito cenas e integração visual.

Ainda provisórios:

- camadas raster do Cais da Cidade e tiles da interface;
- ícones PWA e áudio;
- balanceamento fino e animações cinematográficas.

Não há multiplayer online, replay, rollback netcode ou matchmaking nesta etapa.

Press Start 2P é distribuída localmente sob a SIL Open Font License; a licença está em `public/assets/fonts/PressStart2P-OFL.txt`.
