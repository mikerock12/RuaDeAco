# Auditoria independente — jogabilidade mobile

Análise: 06/09/2026; validação complementada em 07/09/2026. Base local: `01aa260` (`web-beta`); o GitHub `master`
tem também `84328d0`, que reorganiza o README. Nenhuma issue ou PR aberta
foi encontrada na consulta inicial. Esta análise confronta o plano com o
código, a execução no Chrome e os testes; não é pesquisa de preferência do público.

## Parecer

O plano acerta ao preservar o motor e adiar ranking, rollback e elenco novo.
Sua ordem, porém, privilegia impacto audiovisual antes de problemas de
controle, leitura e custo no celular. Para o foco atual, um especial que o
polegar consegue executar, uma pausa legível e uma primeira abertura
sustentável valem mais que outro palco ou uma nova direção de arte.

A experiência ainda pede playtest em aparelhos reais. A presença de muitos
testes comprova contratos técnicos específicos, não diversão, conforto ou
retenção. Não há evidência suficiente para prometer que novos samples,
combos universais ou uma troca de estilo farão as pessoas gostar mais.

## Método e limites

Foram lidos os nove Markdown próprios existentes (plano, README, beta Android,
contexto, quatro documentos técnicos e README do servidor), o workflow de
publicação e o histórico recente local/remoto. Também foram inspecionados
input, HUD, cenas, áudio, CPU, dados de golpes, colisões, PWA, build e testes.

Duas passagens orientaram o trabalho: diagnóstico dos fluxos e recursos
existentes; depois revisão das premissas do plano a partir das evidências.
Esta é uma auditoria documental separada, realizada nesta tarefa, sem alegar
uma segunda pessoa ou avaliação cega.

O jogo foi aberto em Chrome real automatizado, com toque e telas de
640×360, 812×375 e 568×320; houve conferência visual das capturas. As
regressões abrangem também desktop. Não foram usados Android físico,
Safari/iOS, rede móvel real ou medição de temperatura/consumo de bateria.
O Chrome foi executado sem janela nos testes; emulação de toque não equivale
a latência física do painel.

## Achados, consequência e decisão

| Prioridade | Evidência | Consequência | Decisão |
| --- | --- | --- | --- |
| P0 | `touchDpadActions` usava limiar independente de 0,2 em cada eixo, sem limite externo | Andar com pequeno desvio podia pular; arrastar para longe mantinha movimento | Corrigido: oito setores, centro neutro, margem de arraste |
| P0 | `.dpad` tinha `pointer-events: none`; só as quatro setas recebiam início do toque | A diagonal entre setas não podia iniciar diretamente | Corrigido: cluster inteiro recebe o toque |
| P1 | Ataque permanecia associado ao botão inicial, com margem de 40 CSS px | Deslizar entre botões não trocava de golpe de modo previsível | Corrigido: reconhecimento dos botões por posição e liberação fora da área |
| P1 | Pausa mobile concentrava a lista completa em texto de 8 px e linhas de 9 px | O jogador precisava decifrar a lista durante a primeira sessão | Corrigido: quatro páginas, comandos separados de custos, texto de 14–16 px lógicos |
| P1 | Menus mobile ensinavam WASD/Enter | Instruções não correspondiam ao dispositivo | Corrigido no menu principal e nos fluxos de seleção/arena |
| P1 | `pixelText.setText` media palavras novamente mesmo com string igual | Trabalho evitável de CPU a cada frame da HUD | Corrigido: cache por instância, invalidado por texto/tamanho/espaçamento |
| P1 | `PreloadScene` carrega folhas dos seis lutadores antes do menu | Custo de memória e abertura elevado para celular | Próxima rodada: medir e carregar por necessidade |
| P1 | Precache percorre todos os arquivos de `public` | Guias de produção e formatos de áudio alternativos entram no download offline | Reavaliar manifesto sem quebrar instalação/offline |
| P1 | Lista completa online continua diferente da pausa offline | Usuário online não recebe o mesmo guia durante a partida | Ampliar depois com mapeamento do slot local P1/P2 e aviso de luta em andamento |
| P2 | Botões da HUD e menus ainda escalam com o canvas | Em tela pequena alguns alvos ficam abaixo de 44 CSS px | Botões principais de combate têm mínimo de 44 CSS px; revisar demais telas com safe areas reais |
| P2 | Inventário de animações afirma “assets perfeitos” e cita Cortina Óptica | Documento confunde aprovação técnica com qualidade; o código usa Bomba de Fumaça | Atualizar linguagem e manter código como referência |

P0 = controle fundamental; P1 = alta consequência na primeira sessão;
P2 = polimento e clareza. Não foi feita mudança de dano, frame data ou física.

## Colisões: o plano estava olhando a camada errada

O chute frontal do Guto tem uma caixa fonte em `gutoBarba.ts`, mas
`FighterRuntime` chama `buildCalibratedMoveHitboxes`. O perfil efetivo usa
`x=52, y=-118, width=58, height=62`, e não a largura 90 citada no plano.
Portanto, “diminuir a caixa suspeita” sem conferir essa materialização não é
uma correção demonstrada.

A auditoria existente examina ocupação alpha nos frames ativos e foi executada:
92 fases corporais, 72 normais e 6 projéteis. O limiar de 5% evita caixas
sem apoio visual, mas aceita folga considerável. Esse resultado não decide:

- se o alcance atinge na distância que a pose comunica;
- se um golpe classificado como baixo é percebido como baixo;
- se os dois lados e ambos os cantos mantêm a mesma coerência;
- se a combinação startup/alcance/recovery é justa.

A melhoria correta é acrescentar revisão dessas situações e testes de
alcance efetivo por golpe. Não ajustar um limite global de alpha até todos
os personagens passarem sem entender as poses.

## Carregamento e orçamento mobile

Medição local dos arquivos atuais, antes de uma estratégia de carregamento:

| Medida | Valor |
| --- | --- |
| Arquivos em `public` | 280 |
| Volume total em `public` | 70,21 MiB |
| PNGs na pasta dos lutadores | 236 |
| Esses PNGs em disco | 26,51 MiB |
| Estimativa RGBA: soma largura × altura × 4 | 266,50 MiB |
| Bundle principal depois das melhorias iniciais | aproximadamente 1,65 MB; 430 KB gzip |

266,50 MiB é uma estimativa do raster decodificado desses arquivos, **não**
uma medida de heap/GPU nem do consumo total do aplicativo. A alocação real
depende de texturas carregadas, navegador, cópias e driver.

Sugestão para a próxima rodada: carregar primeiro menu/retratos, depois os
dois lutadores e palco escolhidos; testar retorno à seleção, troca de elenco,
mesmo lutador nos dois slots e offline. Retirar apenas referências de produção
do precache quando comprovadamente não forem usadas. Preservar os originais
no pipeline. Evitar reduzir PNGs indiscriminadamente: isso pode destruir
legibilidade e não corrige o trabalho da HUD.

## Classificação dos ciclos do plano

| Ciclo | Valor real | O que alterar |
| --- | --- | --- |
| 0 — higiene | Alto | Manter escopo por tema e testes; acrescentar CI em PR e mobile. Não gastar a rodada limpando arquivos históricos |
| 1 — impacto | Alto, depois do controle | Separar light/heavy/block e som de erro/whiff. Limitar efeitos, respeitar mudo e oferecer redução de flash/shake. Os 400 ms de flash de super existentes merecem revisão |
| 2 — direção visual | Médio para agora | Polir contraste, fonte e consistência antes de refazer seis personagens. Decisão A/B é direção artística, não bug comprovado |
| 3 — cadeias | Alto com ressalvas | Não exigir a mesma cadeia para todos. Confirmar inputs com polegares, medir janela, vantagem e risco por arquétipo. Usar hitboxes calibradas |
| 4 — CPU | Alto | Usar observação atrasada já existente. Anti-air, punish e plano por personagem, preservando erros no fácil. Não inferir diversão de frequência de ataque |
| 5 — primeira sessão | Muito alto; antecipar | Comandos e botões de treino já existem. Melhorar apresentação e ensinar defesa/especial com feedback. Dummy e gravação vêm depois do fluxo básico |
| 6 — online | Alto após base local | Reconexão de lobby já implementada. Medir RTT/jitter, stalls e localização real; delay comum deve ser negociado antes da luta. Revanche continua valiosa |
| 7 — conteúdo | Médio, posterior | Segundo palco aumenta variedade, mas não resolve input ou memória. Licença exige decisão do titular; não escolher uma automaticamente |
| 8 — expansão | Baixo no foco atual | Adiar ranking, matchmaking, elenco, campanha e rollback até estabilidade e sessões repetidas |

O hint `sam` não equivale a fixar o Durable Object em GRU. A documentação
da Cloudflare o trata como preferência de localização; o resultado precisa
ser medido. Ver [Data location](https://developers.cloudflare.com/durable-objects/reference/data-location/).

## O que foi implementado nesta rodada

- Direcional com oito setores, tolerância de arraste limitada e início em diagonais.
- Separação do dono do direcional e liberação das capturas ao interromper.
- Troca de ataque por arraste, com ações simultâneas preservadas por dedo.
- Identificação curta dos quatro botões.
- Pausa offline paginada por dispositivo: como jogar, chão, ar e especiais.
- Sequências de direções com `>`, simultâneas com `+`, custos em linha própria.
- Botão de pausa touch maior, ferramentas de treino escondidas durante a pausa
  e leitura de dano/combo centralizada fora dos clusters.
- Instruções por toque no menu e na seleção.
- Cache de layout que não mede novamente a HUD inalterada.
- CI reutilizável e testes de regressão mobile. Detalhes em [CI.md](CI.md).

Não foram produzidos novos samples, sprites, cenários ou APK. Não houve
mudança de netcode ou balanceamento. O guia da pausa continua sendo ajuda
consultável, não um tutorial interativo concluído.

## Verificação e evidências

- Referência inicial: 438 testes do cliente aprovados.
- Após as melhorias: 463 testes do cliente e 66 do servidor aprovados;
  verificação de tipos e build aprovados.
- Auditoria de hitboxes: 92 fases corporais / 72 normais / 6 projéteis.
- Novos E2E navegam do início ao treino só com toque; conferem páginas,
  pausa, retorno, múltiplos dedos, diagonais, arraste, orientação e especial.
- Suíte offline local completa: 16 cenários aprovados e 12 combinações de
  cenário/dispositivo não aplicáveis ignoradas explicitamente.
- A suíte de CI também inclui testes existentes de remapeamento, retratos,
  textos e pausa; o job online sobe Vite/Worker locais com secret efêmero.
- Evidências locais: `tmp/mobile-audit/`, `test-results/` e
  `playwright-report/`. São artefatos de execução, não arte aprovada.

Os testes online passaram no runner Linux do GitHub. No Windows desta tarefa,
o Wrangler local apresentou atraso de inputs: em uma captura ambos os clientes
concordavam no hash do frame 60, mas tinham captura 774/simulação 75 e ping
entre 885 e 7192 ms em loopback. A causa desse atraso local ainda não foi
determinada; não é uma medição da rede de produção.

A validação do CI revelou diferenças entre headless shell e Chromium completo
no gesto rápido e uma corrida no RPC de logs do pool de testes. A configuração
final usa Chromium completo e console direto no Vitest do servidor. O teste
de rotação aguarda o refresh final de layout. O gesto de três direções usa
o relógio controlado do Playwright para que a demora de CDP/trace no runner
não altere o intervalo entre toques. Ele não mede latência física. Janelas
de golpes, tipos, hashes, verificações de erro e asserts de gameplay foram
preservados.

Acompanhar o resultado da versão atual no [PR #1](https://github.com/mikerock12/RuaDeAco/pull/1)
e em suas checagens; configuração criada não é sinônimo de execução aprovada.

## Como decidir se melhorou para quem joga

Usar 5–8 iniciantes, ao menos um Android de entrada, um Android intermediário
e um iPhone. Em sessões de 10–15 minutos, registrar tarefas e falhas sem
ensinar verbalmente os comandos durante a tentativa.

1. Abrir e chegar à luta; registrar tempo e pedidos de ajuda.
2. Andar, agachar, pular e defender em pé/agachado; registrar ações involuntárias.
3. Executar cada especial olhando a lista; registrar acertos em dez tentativas.
4. Pausar, girar e voltar; verificar ausência de teclas presas.
5. Jogar três rounds contra CPU fácil e decidir espontaneamente se quer revanche.
6. Jogar por 15 minutos; registrar tempo de frame, travamentos e aquecimento.

Metas propostas para avaliação, não resultados já obtidos: nenhum input
preso; pelo menos 8/10 execuções após entender o comando; quatro de cinco
iniciantes completam defesa/especial sem ajuda; nenhuma perda de progresso
por pausa/orientação; sem degradação perceptível ao longo da sessão. Ajustar
o orçamento de frame a partir do aparelho alvo e publicar P50/P95, não só FPS médio.
