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
    fighters/  strips provisórios 96 × 96 de Rafa e Guto
    fonts/     fonte bitmap e fonte web local licenciada
    references/ seis conceitos e logo fornecidos
    stages/    camadas raster do Cais da Cidade
    ui/        molduras e painéis raster
  icons/
  manifest.webmanifest
  service-worker.js
art-source/
  fighters/    fontes direcionais dos sprites provisórios
scripts/
  generate-pixel-assets.mjs
  prepare-generated-fighter-sprites.py
```

`src/assets/assetManifest.ts` é a fonte única das chaves e caminhos. A `PreloadScene` carrega todas as imagens, valida cada textura com `textures.exists` e interrompe a navegação com um painel de diagnóstico se um recurso obrigatório estiver ausente.

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

## Como substituir os sprites provisórios

Rafa e Guto usam dez strips separados:

```text
idle.png
walk.png
jump.png
crouch.png
light-attack.png
heavy-attack.png
special.png
hit.png
knockdown.png
victory.png
```

Cada strip atual tem quatro frames de 96 × 96. Para trocar por arte definitiva:

1. substitua os PNGs mantendo o nome e a transparência;
2. mantenha dimensões consistentes por frame;
3. atualize `frameWidth`, `frameHeight`, origem, escala e offset no arquivo em `src/fighters/visual/` se necessário;
4. não altere as imagens em `public/assets/references/`;
5. rode typecheck, testes e build.

Os scripts de geração existem para reproduzir os placeholders do vertical slice. As imagens já geradas estão versionáveis e o jogo não executa geração em tempo de execução.

## PWA e publicação

`vite.config.ts` usa `base: './'`, permitindo hospedagem na raiz ou em subdiretório. O build gera `precache-manifest.js`; após a primeira carga completa, o service worker mantém os arquivos disponíveis offline.

Para publicar:

1. execute `npm run build`;
2. envie todo o conteúdo de `dist/` para um host estático;
3. use HTTPS;
4. teste instalação, atualização, recarga e modo offline na URL final.

## Testes

Os testes cobrem dano, energia, hit stun, comandos, passo fixo, defesa, armadura, projéteis, rounds, preferências, projeção 320 × 180, manifesto de assets e dimensões 96 × 96 dos frames.

## Estado dos recursos

Definitivos nesta etapa:

- arquitetura de combate, entrada, CPU, persistência e PWA;
- resolução e pipeline de renderização 320 × 180;
- manifesto, validação e separação entre conceitos e sprites;
- uso correto dos seis conceitos e do logo fornecido;
- fluxo das oito cenas e integração visual.

Ainda provisórios:

- sprites animados de Rafa e Guto;
- camadas raster do Cais da Cidade e tiles da interface;
- ícones PWA e áudio;
- balanceamento fino e animações cinematográficas.

Não há multiplayer online, replay, rollback netcode ou matchmaking nesta etapa.

Press Start 2P é distribuída localmente sob a SIL Open Font License; a licença está em `public/assets/fonts/PressStart2P-OFL.txt`.
