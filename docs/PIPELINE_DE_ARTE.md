# Pipeline de arte e sprites

Detalhamento técnico da camada visual, retirado do README para mantê-lo curto.
Vale para quem for substituir arte ou adicionar personagens.

## Renderização 16-bits

- viewport lógico: **640 × 360**;
- `Phaser.AUTO`, `Scale.FIT` e `Scale.CENTER_BOTH`;
- `pixelArt: true`, `antialias: false`, `roundPixels: true` e canvas opaco;
- CSS com `image-rendering: pixelated` e `crisp-edges`;
- fonte bitmap local dentro do canvas e Press Start 2P local para os controles HTML;
- sprites em posições inteiras e sem zoom fracionário de câmera.

A simulação de combate roda no espaço 640 × 360 para preservar frame data,
alcance, CPU e testes. A camada visual projeta as coordenadas com fator 0,5.
O combate usa passo fixo de 60 Hz e não depende das colisões automáticas do
Phaser.

## Fontes da verdade

`src/assets/assetManifest.ts` e `src/fighters/visual/` definem chaves, caminhos
e dimensões. A `PreloadScene` carrega os strips como spritesheets, valida
largura, altura, quantidade de frames e layout horizontal, e interrompe a
navegação com um painel de diagnóstico se um recurso obrigatório estiver
ausente ou mal recortado.

Os conceitos são tratados como `PortraitAsset` e aparecem no menu, seleção,
ficha, apresentação versus, HUD e resultado. Eles nunca são usados como corpos
durante a luta; os corpos usam `FighterSpriteAsset` separado.

## Como adicionar um personagem

1. Crie `src/fighters/nomeDoPersonagem.ts` com um `FighterDefinition`.
2. Defina atributos, hurtboxes, habilidades, animações e movimentos por dados.
3. Adicione o conceito e seus crops em `src/assets/assetManifest.ts`.
4. Crie um descritor visual em `src/fighters/visual/` e registre-o no índice.
5. Coloque os PNGs de animação na pasta do lutador.
6. Adicione a definição a `src/fighters/index.ts`.
7. Marque `available: true` somente quando golpes, arte e testes estiverem
   completos.

Não ajuste tempos ou caixas com base no tamanho visual do PNG. A origem lógica
permanece nos pés e as regras ficam no núcleo de combate.

## Contrato dos sprites

Todos os PNGs ficam diretamente em `public/assets/fighters/<lutador>/`. Não
crie subpastas `sprites`, `specials`, `effects` ou `portraits`.

Nomes compartilhados:

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

Rafa acrescenta `mao-da-mare`, `chute-da-ressaca` e `eco-tatuado`, cada qual com
seu PNG de efeito. Guto acrescenta `muralha-norte` e seu efeito; Gancho do Urso
usa os strips `startup`, `grab`, `hold`, `throw` e `recovery`; Abraço Glacial usa
`startup`, `grab`, `hold`, `freeze`, `finish` e seu efeito. Guto nunca inclui a
vítima dentro do próprio PNG.

Cada strip tem quatro frames horizontais: 256 × 256 por frame para Rafa e
288 × 288 para Guto. Ao substituir uma arte:

1. mantenha nome, transparência e quatro quadros realmente distintos;
2. preserve a referência conceitual em `public/assets/references/` sem alterá-la;
3. ajuste dimensões, origem, escala, offsets, efeitos e fases em
   `src/fighters/visual/`;
4. rode `npm run validate:sprites`, typecheck, testes e build.

`scripts/generate-pixel-assets.mjs` gera somente recursos compartilhados (fonte,
cenário e UI); ele não escreve nas pastas dos lutadores. O jogo não executa
geração de arte em tempo de execução.

## Estrutura de pastas

```text
src/
  assets/      manifesto central de imagens e texturas
  ai/          máquina de estados e dificuldades da CPU
  audio/       áudio sintetizado
  combat/      simulação, frame data, caixas e rounds
  config/      pixelArtConfig, sessão e preferências
  fighters/    dados de lutadores e descritores de sprites
  input/       teclado, comandos, gamepad e multitouch
  online/      sessão, protocolo, lockstep e hash de estado
  pwa/         instalação e registro do service worker
  scenes/      onze cenas Phaser
  types/       contratos de combate e assets
  ui/          arena raster, retratos e sprites de luta
public/
  assets/
    fighters/  spritesheets planos por lutador
    fonts/     fonte bitmap e fonte web local licenciada
    references/ conceitos e logo fornecidos
    stages/    camadas raster do Cais da Cidade
    ui/        molduras e painéis raster
  icons/
  manifest.webmanifest
  service-worker.js
scripts/
  generate-pixel-assets.mjs
  audit-fighter-sprites.mjs
  audit-fighter-hitboxes.mjs
```

## Licença de fonte

Press Start 2P é distribuída localmente sob a SIL Open Font License; a licença
está em `public/assets/fonts/PressStart2P-OFL.txt`.
