# Agarrão universal e finalização do Cais

Implementação local de 14/09/2026. Ainda não publicada.

## Como jogar

Todos os seis personagens agora agarram com **fraco + forte juntos**: F+G no P1,
J+K no P2, L+H no touch e os botões equivalentes no gamepad. Remapeamentos são
respeitados. O jogo tolera até três frames entre os dois botões no início de
um ataque normal, desde que ambos continuem pressionados.

É um golpe de curta distância, sem custo de energia, com seis frames de
preparação e 125 de dano. Pega o adversário, levanta e o arremessa para baixo,
provocando queda. Defesa não bloqueia; salto e distância evitam o agarrão.
Errar deixa recuperação. Segurar os botões não repete o golpe.
Os agarrões especiais de Guto continuam disponíveis.

## Finalização de fase

No Cais, ao sofrer a segunda derrota (inclusive em uma luta de três rounds),
o perdedor fica tonto. O vencedor tem oito segundos para se aproximar e agir.
Um agarrão conectado inicia uma sequência de cinco segundos: levantamento,
arremesso para o lago, água deslocada, monstro emergindo, mordidas e submersão.
Golpe comum encerra normalmente. Sem ação, a janela expira e confirma a vitória.
Empate, primeira derrota e treinamento não abrem a janela. As outras arenas
mantêm o encerramento normal. A CPU vencedora também sabe se aproximar e finalizar.

Cada lutador tem uma folha própria de 12 poses para o agarrão, preservando
roupa, identidade e proporções. A sequência inclui alcance, pegada, agachamento,
levantamento, sustentação acima da cabeça, arremesso e recuperação. Os pontos
de contato são medidos nas mãos de cada arte e interpolados para suavizar a vítima.
O agarrão que erra passa à recuperação sem simular um levantamento.

O monstro tem outra folha de 12 poses exclusiva para a finalização. A vítima
percorre uma trajetória contínua até o lago, perde escala com a distância,
flutua brevemente e é capturada pela boca. Ondas, respingos, ataque, mastigação
e mergulho acompanham a sequência. Os encontros decorativos ficam suspensos.
O anúncio fica no alto, fora da área da sequência.

Fontes e prompts: `art-source/fighters/universal-grab-v2/` e
`art-source/stages/cais-finisher-v2/monster.png`.
Execute `npm run assets:grab` para reconstruir as sete folhas e os pontos das mãos.
O exportador remove a chave magenta, recorta componentes, aplica uma escala
única por personagem e alinha as solas. As fontes são preservadas.
O manifesto registra SHA-256, recortes e transformações; a auditoria verifica
essas evidências além de transparência, dimensões e baseline.
A primeira variante Rafa com fundo quadriculado foi preservada apenas como fonte
descartada; a versão usada é `rafa-mare-keyed.png`.

Os sons são síntese original: tensão grave, rugido, impacto na água e três
mordidas com estalos e ruído de mastigação. Não usam amostras de Mortal Kombat.
Respeitam volume geral, efeitos e mute; buffers são reutilizados.

## Online e validação

A arena, a janela, a fase e a conclusão da finalização entram no estado
canônico. Eventos de som são emitidos uma vez por frame fixo e usam índices
de jogador, inclusive em espelhos. O protocolo continua com oito ações;
fraco e forte trafegam juntos. A versão do motor passou a
`lockstep-v3-grab-art` para impedir partida entre versões incompatíveis.
Não há alteração necessária no Worker.

Cobertura: os 36 pares de lutadores, alcance, defesa, salto, tolerância dos
botões, timeout, pausa, espelho, CPU e hashes após serialização dos inputs.
Playwright testa F+G no desktop e dois toques simultâneos no celular, percorre
as fases da sequência e verifica o resultado e ausência de erros de textura.
A suíte foi adicionada a `test:e2e:ci`.

Validação em navegador e celular emulado; toque e desempenho em aparelho
Android físico ainda precisam ser conferidos.
