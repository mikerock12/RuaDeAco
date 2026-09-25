# Agarrão universal e finalizações de fase

Publicado em 20/09/2026 (commits `a934842` e `827ee8b`) e refeito em
25/09/2026: o agarrão foi reconstruído sobre as folhas aprovadas de vítima,
as finalizações do Cais e da Cozinha foram reencenadas e o Sítio ganhou a sua.

## Como jogar

Todos os seis personagens agarram com **fraco + forte juntos**: F+G no P1,
J+K no P2, L+H no touch e os botões equivalentes no gamepad. Remapeamentos são
respeitados. O jogo tolera até três frames entre os dois botões no início de
um ataque normal, desde que ambos continuem pressionados.

É um golpe de curta distância, sem custo de energia, com seis frames de
preparação e 125 de dano. Pega o adversário pelo peito, agacha, levanta o
corpo acima da cabeça e o crava de costas no chão. Defesa não bloqueia; salto e
distância evitam o agarrão. Errar deixa recuperação. Segurar os botões não
repete o golpe. Os agarrões especiais de Guto continuam disponíveis.

## O que mudou no agarrão (25/09/2026)

A versão anterior girava o sprite da vítima ao redor dos pés e somava essa
rotação à inclinação que a arte `grabbed-lifted` já tinha pintada. O corpo
acabava de cabeça para baixo, fora da tela, e depois flutuava até o chão.

Agora a vítima é presa pelo **ponto de pega**: o centro de massa horizontal e a
altura do peito medidos em cada quadro das folhas `grabbed-front.png` e
`grabbed-lifted.png` de cada lutador (`npm run measure:grab-victims` gera
`src/fighters/grabVictimLandmarks.ts`). Esse ponto é colado nas mãos do
atacante em todos os frames, e a rotação acontece ao redor dele.

As folhas `grabbed-lifted` não são iguais entre os lutadores: Rafa, Guto e
Astro já deitam o corpo na própria arte; Noir e Léo inclinam parcialmente; a
folha de Dante só tem poses em pé. `GRAB_LIFT_ART` em
`src/fighters/grabArtTiming.ts` declara quais quadros usar e quanto o último
já inclina; o código completa a rotação até o tronco deitado, sempre com a
cabeça para a frente do atacante. Sequência por frame do atacante:

| Frames | Atacante | Vítima |
| --- | --- | --- |
| 6–13 | pega e agacha | em pé, `grabbed-front`, peito nas mãos |
| 14–28 | levanta | sai do chão e tomba para trás até ficar deitada |
| 29–34 | sustenta acima da cabeça | deitada de costas sobre as mãos |
| 35–45 | balança e crava | segue as mãos até encostar no chão, à frente do atacante |
| 46 | soltura | entra direto em `knockdown` pelo quadro deitado (sem a fase `thrown`) |

A soltura "cravada" (`slam` em `GrabDefinition`) evita que a vítima levante e
caia de novo pela animação normal de queda. Ela acorda depois dos 42 frames
habituais de knockdown, cerca de meio segundo antes do que na versão anterior
(que somava 32 frames de `thrown`); o atacante continua livre 44 frames antes
dela. Dano, alcance e frames de preparação não mudaram.

## Finalização de fase

Nas três arenas, ao sofrer a segunda derrota (inclusive em uma luta de três
rounds), o perdedor fica tonto. O vencedor tem oito segundos para se aproximar
e agir. Um agarrão conectado inicia uma sequência de cinco segundos. Golpe
comum encerra normalmente. Sem ação, a janela expira e confirma a vitória.
Empate, primeira derrota e treinamento não abrem a janela. A CPU vencedora
também sabe se aproximar e finalizar.

Os primeiros 60 frames são o mesmo levantamento do agarrão; em vez de cravar,
o atacante arremessa o corpo (pose 8 da folha). Tudo é função pura do frame,
do atacante e da vítima em `src/combat/stageFinisher.ts`: simulação, desenho
e sons leem as mesmas curvas, e os dois clientes online chegam ao mesmo hash.

### Cais da Cidade

O corpo voa em arco, dá uma cambalhota e cai na água logo atrás da borda do
cais, sempre à frente do atacante (`caisMonsterX`). O monstro emerge em escala
1,35, virado para o atacante, com as mandíbulas abertas; a vítima reaparece
presa nelas (frames 134–159), a boca fecha no frame 160, seguem três mordidas
com respingos carmesim e o mergulho. O corte horizontal na textura do monstro
faz a linha d'água. Faixa final: "O CAIS COBRA SUA ALMA".

### Cozinha Macabra

Ver [COZINHA_MACABRA.md](COZINHA_MACABRA.md): mergulho de cabeça no panelão,
pernas para fora, corte na borda, caveira e ossos em pixel art.

### Sítio

Ver [SITIO.md](SITIO.md): as portas do galpão se abrem, um mascarado com
tridente aparece e o corpo é arremessado sobre as pontas.

## Fontes e reexportação

- Folhas do atacante: `art-source/fighters/universal-grab-v2/` e
  `npm run assets:grab` (inalteradas nesta rodada).
- Pontos de pega da vítima: `npm run measure:grab-victims`.
- Monstro: `art-source/stages/cais-finisher-v2/monster.png`.
- Adereços do Sítio e da Cozinha (arte pixel autoral em grades de texto):
  `art-source/stages/sitio-finisher/` e
  `art-source/stages/cozinha-macabra/skull-bones.txt`, rasterizados por
  `npm run assets:finisher`.

Os sons são síntese original: tensão grave, rugido, impacto na água, mordidas,
queda na panela, colher, estalo de ossos, rangido de madeira, estocada e porta
batendo. Respeitam volume geral, efeitos e mute; buffers são reutilizados.

## Online e validação

A arena, a janela, a fase e a conclusão da finalização entram no estado
canônico. Eventos de som são emitidos uma vez por frame fixo e usam índices de
jogador, inclusive em espelhos. A versão do motor passou a
`lockstep-v5-finisher-restage`, porque posições e trajetórias mudaram o hash.
Não há alteração necessária no Worker.

Cobertura unitária (`universalGrabFinisher.test.ts`): os 36 pares de lutadores
(corpo nunca sai da tela nem fica de cabeça para baixo, soltura já deitada),
ponto de pega nas mãos, janela nas três arenas, monstro dentro da tela e virado
para o atacante, vítima nas mandíbulas, panelão, tridente, recuo do vencedor
no Sítio, espelho, hashes iguais entre dois clientes e CPU. O Playwright
percorre as três finalizações no desktop e no celular emulado
(`universal-grab-finisher.spec.ts`, na suíte `test:e2e:ci`).
