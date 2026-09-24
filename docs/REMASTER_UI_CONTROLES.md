# Remaster de interface e controles — setembro de 2026

Referência principal: [guia do usuário](../public/assets/remaster/RuaDeAco_Update_Visual_Jogabilidade.md). As oito imagens da pasta são referências de composição; nomes, retratos e mapeamentos reais do jogo prevalecem sobre textos ilustrativos nelas.

## Implementação

- Componentes comuns de painel, foco, cantos e ícones em código: azul escuro, ciano e dourado. Abertura, menu, seleção, arena, configurações, controles, resultado e online usam molduras mais finas.
- Menu central compacto; retratos laterais menores; grade de seleção 2 × 3 e ficha com habilidades e confirmação destacada.
- Online mantém o tema orbital, distingue a ação de criar sala, mostra o lado real do jogador (P1 ou P2), prontidão e ping por cor/barras. Corrigido o reposicionamento dos números decorativos laterais.
- HUD de 64 para 44 unidades: redução de 31,25%. Barras finas, retratos menores, timer central e treino com dano/combo na base.
- Analógico fixo com knob contínuo em 360°, dead zone radial de 18% e saída digital de oito direções. Captura mantém a direção fora da base; soltar, cancelar, perder foco, girar ou ocultar o jogo limpa o input.
- Botões em diamante: H acima, L à esquerda, S à direita e D abaixo. Cada botão mede pelo menos 44 CSS px. Arraste entre ações e dedos independentes continuam funcionando.
- Opacidade inicial de 40%, com aumento enquanto pressionado. Preferências já salvas e remapeamentos são preservados. Os IDs antigos de posições são mantidos apenas para compatibilidade do armazenamento.
- Faíscas de acerto e bloqueio diferentes, limitadas a seis contatos simultâneos, desenhadas num único objeto reutilizado. Sons de movimento sem contato, acerto leve/forte e bloqueio distintos.
- Tremor de 60–110 ms nos impactos relevantes; flash suave de até 10% por no máximo 100 ms. Movimento reduzido desativa tremor, flash e pulsação de seleção. Hitstop continua sendo o existente na simulação, sem pausa artificial adicional.
- Cais recebe parallax horizontal suave de até três pixels na lua e no reflexo, sem deslocar o piso dos lutadores. A opção de movimento reduzido o desativa.
- Eventos carregam índices opcionais dos lados para que efeitos de duelos espelhados não confundam personagens iguais. Esses metadados não participam das regras ou do hash do estado.
- Referências de aproximadamente 17 MB ficam versionadas, mas fora do precache: o jogador não baixa os mockups para jogar.

## Decisões da revisão

A redução do HUD, o analógico e a legibilidade trazem benefício direto ao celular. Molduras, ícones e efeitos foram construídos em código para evitar novas texturas grandes. Não é necessário reproduzir cada brilho do mockup, pois isso reduziria contraste e aumentaria poluição.

Os retratos e sprites aprovados continuam os mesmos. A arte e ambientação já remasterizadas do Cais, da Cozinha e do Sítio são reaproveitadas. Não há mudança de dano, janelas, comandos, física ou protocolo de inputs; a compatibilidade digital é mantida.

## Validação

A suíte unitária cobre oito direções, dead zone, limite radial, posição dos contatos, reaproveitamento de efeitos, pausa e estado determinístico preservado. A suíte de navegador cobre 568×320, 640×360 e 812×375, multitouch real via CDP, diamante, opacidade, arraste, perda de foco, orientação, remapeamento e todos os fluxos de telas. Os testes online usam dois clientes e Worker local, incluindo seleção das três arenas e comparação de hashes.

As capturas locais ficam em tmp/remaster-audit, fora do Git. Não houve teste em aparelho Android físico nesta rodada; emulação de navegador não mede conforto do polegar, latência do touchscreen nem consumo de bateria. Esses pontos precisam de teste manual no dispositivo do usuário.

## Rodada de 20/09/2026 — fluidez do direcional e alcance dos botões

Três defeitos de sensação foram medidos e corrigidos. Nenhum deles tocou em
dano, frame data, física ou protocolo: a mudança é toda na camada de entrada.

**Setores do analógico.** Os oito setores tinham 45° cada, então bastavam 23°
de desvio do polegar para o jogo somar `down` ou `up`: o jogador tentava andar
e o lutador agachava ou pulava. Agora o horizontal puro vai até 30°, a diagonal
ocupa 30°–60° e a vertical pura começa aos 60°. `up` exige 38°, porque um salto
acidental custa mais caro que um agachamento acidental. Os quartos de círculo
continuam saindo: a diagonal tem 30° de folga.

**Zona morta.** De 18% para 12% do raio da base. O knob já acompanhava o dedo
antes de o lutador reagir, e essa distância era sentida como atraso.

**Tamanho e alcance dos botões.** De `clamp(44px, 12dvh, 56px)` para
`clamp(58px, 17dvh, 76px)` — em paisagem de celular, de ~45px para ~64px. 44px
é o mínimo de acessibilidade, não um alvo confortável para jogar sem olhar.
Em 24/09/2026 os botões passaram a `clamp(78px, 23dvh, 104px)` e o vão
compartilhado de 18% para 20% da largura, para o agarrão caber melhor no
polegar. A face de cada botão continua exclusiva.

**Acorde com um polegar só.** Cada dedo acionava exatamente um botão, então
fraco + forte — o agarrão — exigia dois dedos na mesma mão, o que era inviável
na prática. O diamante inteiro passa a receber o toque e um dedo pousado no vão
entre dois botões vizinhos aciona os dois. O alcance extra é de 18% da largura
do botão, calibrado para que toda a face de um botão continue exclusiva,
inclusive a borda voltada para o vizinho: só o vão de ~13px é compartilhado.
Botões opostos do diamante ficam longe demais para coincidir.

Medições que não indicaram defeito, registradas para não serem reinvestigadas:
latência de comando é de 1 frame, a inversão de direção também é de 1 frame, e
a simulação roda a 60,8 passos por segundo. Os totais de golpe vão de 12 frames
(Astro, fraco) a 36 (Guto, forte), dentro do costume do gênero.

## Velocidades e cadência da caminhada — 20/09/2026

Aprovado pelo usuário depois da rodada acima, já como decisão de jogabilidade.

**Velocidades: +22% uniforme.** A escolha do percentual único é deliberada:
multiplicar todos pelo mesmo fator preserva exatamente as proporções entre os
seis, então nenhum confronto muda de equilíbrio — o jogo é o mesmo, só mais
solto. As razões entre avanço e recuo de cada lutador também foram mantidas.

| Lutador | antes | agora | travessia do palco útil (568px) |
| --- | ---: | ---: | ---: |
| Astro Riso | 201 px/s | 246 px/s | 2,8 s → 2,3 s |
| Rafa Maré | 183 px/s | 222 px/s | 3,1 s → 2,6 s |
| Léo Violeta | 174 px/s | 213 px/s | 3,3 s → 2,7 s |
| Dante Sinal | 171 px/s | 210 px/s | 3,3 s → 2,7 s |
| Noir Reflexo | 159 px/s | 195 px/s | 3,6 s → 2,9 s |
| Guto Barba | 105 px/s | 129 px/s | 5,4 s → 4,4 s |

**Cadência: recalculada, não só acelerada.** O que faz o pé patinar é a razão
entre deslocamento e quadros da animação. Ela estava desigual — de 13,3 px por
quadro no Noir a 18,3 no Rafa, que por isso patinava bem mais que os demais.
As taxas foram recalculadas para ~15 px por quadro em todos, e não apenas
multiplicadas pelos mesmos 22%:

| Lutador | andar, antes → agora | recuar, antes → agora | px por quadro |
| --- | --- | --- | ---: |
| Rafa Maré | 10 → 15 fps | 8 → 12 fps | 18,3 → 14,8 |
| Guto Barba | 7 → 9 fps | 6 → 7 fps | 15,0 → 14,3 |
| Noir Reflexo | 12 → 13 fps | 10 → 12 fps | 13,3 → 15,0 |
| Astro Riso | 13 → 16 fps | 10 → 13 fps | 15,5 → 15,4 |
| Dante Sinal | 10 → 14 fps | 8 → 13 fps | 17,1 → 15,0 |
| Léo Violeta | 12 → 14 fps | 10 → 11 fps | 14,5 → 15,2 |

A faixa cai de 13,3–18,3 para 14,3–15,4. Como a animação de andar usa a arte de
corrida, a velocidade maior também aproxima o que se vê do que acontece.

Dano, frame data, hitboxes e protocolo de inputs continuam intactos; a latência
de comando segue em 1 frame. Os testes de stats oficiais dos lutadores foram
atualizados com os novos valores e seguem guardando a regressão.

## Andar e pular menos travados — 24/09/2026

O +22% de 20/09 ainda deixava o passeio longo e o pulo preso no chão.

- Andar e recuar, e o deslocamento horizontal do pulo, subiram mais 15% no mesmo fator para os seis. A cadência foi recalculada para continuar perto de 15 px por quadro.
- A gravidade caiu cerca de 6%, sem aumentar o impulso vertical: o arco dura um pouco mais e não corta o topo da tela.
- No ar, segurar esquerda ou direita corrige o drift (72% do valor anterior + 28% do alvo por frame). Soltar a direção mantém o impulso da decolagem.
- O pouso dura 3 frames em vez de 6. Cima apertado ou segurado durante o pouso sai no primeiro frame livre, sem precisar tocar de novo.
- Motor `lockstep-v4-kitchen-pot`, porque posição e tempo de voo mudam o hash.
