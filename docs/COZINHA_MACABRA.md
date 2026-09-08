# Cozinha Macabra

Arena baseada na fotografia fornecida pelo usuário, adaptada para a pixel art de Rua de Aço.

## Como jogar

Em CPU, versus local ou treino, confirme os dois lutadores. Na tela **Arena e confronto**, use os botões **< / >** para escolher **Cozinha Macabra** e toque em **Lutar**. Teclado e gamepad usam as direções de P1; no teclado padrão, A/D. A arena escolhida é mantida nas próximas seleções da sessão.

No online, o criador da sala (P1) escolhe Cais da Cidade ou Cozinha Macabra pelas setas da linha Arena. No teclado/gamepad, navegue até essa linha com cima/baixo e altere com esquerda/direita. P2 vê a escolha automaticamente. Os dois confirmam em Ficar pronto. Mudar a arena cancela as confirmações; o servidor recusa um pronto atrasado que se refira à arena anterior. A arena persistida também é restaurada ao reconectar no lobby.

Os dois clientes usam a arena do início sincronizado, incluindo sua trilha. Morcegos, ratos e bruxa são ambientação local e não alteram o estado determinístico da luta.

## Composição e movimento

- A arquitetura da foto foi preservada: churrasqueira de tijolos à esquerda, janela e mesa ao centro, fogão e armários à direita.
- O único fogão da arena pertence à animação da bruxa; os fogões estáticos foram removidos do fundo.
- Bruxa em quatro poses mexendo um panelão verde sobre o fogão, com vapor discreto.
- Revoadas de 2 a 5 morcegos saem da boca da churrasqueira, em intervalos de 8–14 segundos depois da primeira aparição.
- Até 3 ratos atravessam o piso em sentidos e faixas variados; novas tentativas aparecem a cada 4–8,5 segundos.
- As criaturas ficam atrás dos lutadores, sem colisão, dano, alteração de RNG do combate ou participação no hash online.
- A pausa congela toda a ambientação. A cena libera os objetos ao sair.
- Pools fixos: 5 morcegos, 3 ratos, 1 bruxa e 6 pequenas partículas de vapor. Retomar uma aba não dispara eventos acumulados.

## Arte e reprodução

A arte foi criada com a ferramenta integrada de geração de imagens, usando a foto como referência. As fontes, a fotografia original e os prompts finais estão em:

- `art-source/stages/cozinha-macabra/reference.jpeg`
- `art-source/stages/cozinha-macabra/background-source.png`
- `art-source/stages/cozinha-macabra/witch-source.png`
- `art-source/stages/cozinha-macabra/fauna-source.png`
- `art-source/stages/cozinha-macabra/prompts.json`

A foto originalmente recebida como `public/assets/stages/cozinha.jpeg` foi preservada em `art-source`, fora do precache e do pacote web. Nenhum arquivo original de arte do Cais foi substituído.

`npm run assets:kitchen` reproduz o recorte, registro e redução nearest-neighbor a partir dessas fontes, preservando o alpha. A arte consumida pelo jogo fica em `public/assets/stages/cozinha-macabra/`:

| Arquivo | Dimensões | Uso |
| --- | --- | --- |
| background.png | 640 × 360 | Fundo |
| witch.png | 640 × 160 | Quatro poses de 160 × 160 |
| bat.png | 160 × 32 | Quatro poses de 40 × 32 |
| rat.png | 160 × 24 | Quatro poses de 40 × 24 |

Os quatro PNGs somam aproximadamente 675 KiB e 1,3 MiB em RGBA decodificado (estimativa das texturas, não uma medição de RAM total). As fontes de geração não são distribuídas no site.

## Trilha sonora

A arena toca a música fornecida pelo usuário em loop (cerca de 1min57s), respeitando volume e mute existentes. A trilha depende da arena escolhida; o Cais mantém sua própria música. Ao voltar ao menu, a trilha muda pelo crossfade do AudioManager.

Original preservado: `art-source/audio/cozinha-macabra-original.mpeg`. O arquivo contém áudio MP3 e uma imagem de capa; apenas o áudio é distribuído no jogo. O MP3 foi extraído sem recodificação e o OGG segue o fallback de formatos do catálogo.

Arquivos: `public/assets/audio/music/cozinha-macabra.mp3` e `public/assets/audio/music/cozinha-macabra.ogg`. Reprodução da exportação com FFmpeg:

```sh
ffmpeg -i art-source/audio/cozinha-macabra-original.mpeg -map 0:a:0 -c:a copy -map_metadata -1 public/assets/audio/music/cozinha-macabra.mp3
ffmpeg -i art-source/audio/cozinha-macabra-original.mpeg -map 0:a:0 -c:a libvorbis -q:a 4 -map_metadata -1 public/assets/audio/music/cozinha-macabra.ogg
```

## Verificação

`kitchenAmbience.test.ts` cobre a origem das revoadas, intervalos, sentidos dos ratos, limites de objetos e retomada após tempos inválidos ou muito longos. `kitchen-stage.spec.ts` integra o CI e verifica seleção por toque/teclado, entrada na arena, reprodução da trilha da cozinha, troca de música no retorno ao menu, animações, pausa, retorno e descarte na saída em desktop e celular emulado.

A animação não depende de timers ou tweens externos à atualização da cena. Não foram alterados dano, balanceamento, simulação ou dimensões da área de luta.
