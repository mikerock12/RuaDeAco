# Plano de melhorias — Rua de Aço

> Plano de execução a partir da revisão de 05/09/2026 (demo publicada, `src/combat`, elenco, CPU, áudio e online).
> O estado real do Git prevalece sobre este arquivo.
>
> Objetivo: tirar o jogo da categoria “motor pronto” e colocá-lo na categoria “dá vontade de jogar o segundo round”.
>
> Não reabrir arquitetura. Não reescrever o lockstep. Não adicionar ranking antes do round ter peso.

---

## Revisão mobile — 06/09/2026

A auditoria independente está em [docs/AUDITORIA_MOBILE_2026-09-06.md](docs/AUDITORIA_MOBILE_2026-09-06.md).
A prioridade solicitada agora é jogar bem no celular. Por isso o ciclo **M0**
entra antes do impacto audiovisual. A fila original abaixo permanece como
referência; as correções desta revisão prevalecem sobre os diagnósticos antigos.

### Ciclo M0 — Controle confiável, leitura e regressões

- [x] Direcional com oito setores, centro neutro e margem de arraste limitada.
- [x] Iniciar diagonais no espaço entre as setas.
- [x] Deslizar entre ataques e liberar toques ao cancelar, pausar ou girar.
- [x] Identificar FRACO, FORTE, ESPECIAL e DEFESA nos botões.
- [x] Pausa com páginas legíveis de ajuda, golpes no chão, no ar e especiais.
- [x] Preservar comandos e custos dos seis lutadores, sem macros de combate.
- [x] Instruções de navegação por toque nos menus.
- [x] Reduzir medições repetidas do mesmo texto na HUD.
- [x] CI com tipos, unitários, build, navegador desktop/mobile e online local.
- [ ] Validar em aparelho Android físico e Safari/iOS; emulação não fecha este item.
- [ ] Playtest curto com iniciantes para medir execução de defesa e especiais.

**Pronto quando:** percorrer seleção, treino, pausa e saída sem teclado; manter
direção e defesa com dois dedos; executar as três direções de um especial sem
pulo involuntário; voltar de retrato sem ação presa; ler comandos sem ampliar
a tela. Testes de browser cobrem regressões; conforto do polegar e desempenho
sustentado exigem aparelhos reais.

### Fila revisada

| Ordem | Entrega | Critério para avançar |
| --- | --- | --- |
| 1 | M0: controles, leitura, retomada e CI | Fluxos acima aprovados e teste físico |
| 2 | Carregamento e memória mobile | Medir Android alvo; carregar só o necessário e validar offline |
| 3 | Impacto (ciclo 1) com opção de reduzir efeitos | Distinguir hit/block/whiff sem encobrir a ação |
| 4 | Primeira sessão e treino prático (parte do ciclo 5) | Iniciante defende alto/baixo e executa especial sem ajuda |
| 5 | Identidade do ground game + CPU (ciclos 3 e 4, separados) | Confirmes adequados a cada arquétipo e rival legível |
| 6 | Consistência visual (ciclo 2) | Melhorar contraste e linguagem sem refazer elenco |
| 7 | Online medido (ciclo 6) | RTT/jitter/stalls e FT2 em aparelhos brasileiros |
| 8 | Conteúdo (ciclo 7), depois ciclo 8 | Retenção e estabilidade verificadas |

### Correções factuais e de escopo

- A definição original do chute frontal do Guto **não é a caixa efetiva**:
  `FighterRuntime` materializa `collisionProfiles.ts`. Auditar a geometria
  calibrada, alcance e postura antes de alterar o golpe.
- `audit:hitboxes` já mede ocupação alpha em frames ativos (limiar corporal
  de 5%); não verifica só a existência de arquivos. Passar nessa métrica
  também não prova justiça, leitura de baixo/alto ou balanceamento.
- Reconexão de lobby já existe, com até três tentativas. O ciclo 6 deve
  validar e melhorar essa implementação; revanche ainda é pendente.
- O treino já tem botões touch para reposicionar, caixas e CPU. Melhorar
  ergonomia e dummy, sem listar esses botões como ausentes.
- O problema da pausa era concentração de informação em texto de 8 px. A
  lista já derivava comandos dos bindings; nesta rodada ganhou páginas touch.
- Não impor confirm jab → especial idêntico aos seis arquétipos. Um grappler
  pode precisar de pressão de alcance e ameaça de agarrão; decidir com testes.
- Região Cloudflare é um hint, não uma garantia de fixar a sala em GRU.
  Medir o resultado; não prometer redução de ping por configuração isolada.
- Documentação visual menciona projeção 0,5, mas o código usa
  `WORLD_TO_SCREEN = 1`. Nenhuma alteração de tamanho deve partir da escala antiga.
- Samples de áudio, novo palco, rearte, balanceamento e rollback não foram
  concluídos por esta rodada mobile.

---

## Princípio

A base técnica já passou do ponto em que a maioria dos jogos de luta indie morre:

- simulação determinística separada do Phaser
- frame data em dados
- lockstep com hash de estado
- 6 lutadores, 4 modos, treino, PWA, APK, bateria de testes

O gargalo agora é **sensação, cadeia de golpes, rival e primeira sessão**.

Cada ciclo abaixo tem:

1. o que fazer
2. o que não fazer
3. critério de pronto (pode jogar e dizer sim/não)

Se o critério não fecha, o ciclo não acabou.

---

## Ordem dos ciclos

| # | Ciclo | Por quê agora |
| --- | --- | --- |
| 0 | Higiene e trava de escopo | Evita misturar arte, netcode e elenco no mesmo commit |
| 1 | Impacto (som + hit spark + shake) | Muda a categoria do jogo numa sessão |
| 2 | Direção visual fechada | O primeiro segundo ainda mente sobre o que o jogo é |
| 3 | Cadeia de combate por lutador | O motor aceita cancel; o elenco quase não usa |
| 4 | CPU que ensina o matchup | Sem anti-air e punish o modo CPU é manequim |
| 5 | Treino e primeira sessão | Quem abre o link precisa entender o jogo em 3 minutos |
| 6 | Online jogável no Brasil | Delay + ping alto; rollback não é o primeiro remendo |
| 7 | Conteúdo mínimo de produto | Segundo palco, KO/intro, vitrine |
| 8 | Só então: rollback, ranking, elenco novo | Depois do round ter peso |

Não pular para 8. Não misturar 1 com 6.

---

## Ciclo 0 — Trava de escopo

### Fazer

- Tratar este plano como fila, não como lista de ideias.
- Um ciclo aberto por vez na branch de trabalho (`web-beta` / o fluxo já usado).
- Commit por tema. Nunca “SFX + hitbox do Guto + Worker” no mesmo commit.
- Antes de cada ciclo: `git status`, `git log -5`, ler o arquivo do lutador ou cena que vai mudar.
- Depois de cada ciclo que toca código: `npm run typecheck`, `npm test`, e abrir o jogo de verdade.

### Não fazer

- Recriar o projeto.
- Trocar Phaser, Vite ou o servidor “por precaução”.
- Adicionar lutador novo.
- Mexer em sprite aprovado de outro personagem para “aproveitar a passagem”.

### Pronto quando

- Este arquivo está no repositório ou na pasta de contexto do projeto.
- A fila acima está acordada. Se algo entrar na frente, entra no topo com motivo escrito, não no meio.

---

## Ciclo 1 — O golpe precisa bater

Prioridade máxima. Fighting game sem impacto soa protótipo, mesmo com motor bom.

### Som

Hoje hit, block, special, KO e round são oscilador (`AudioManager` / `TONES`). Música de menu, seleção e Cais já existe.

Gravar ou gerar **samples curtos**, 8-bit ou crunch, com corpo:

| ID | Uso | Duração alvo |
| --- | --- | --- |
| `hit-light` | jab / chute baixo | 80–120 ms |
| `hit-heavy` | heavy / sweep / knockdown | 120–180 ms |
| `block` | bloqueio em pé e agachado | 60–100 ms |
| `whiff` | golpe no ar | 60–90 ms |
| `special` | special e super | 200–350 ms |
| `ko` | nocaute | 400–700 ms |
| `round` | ROUND 1 / FIGHT / K.O. | 200–300 ms |

Manter o fallback de tom se o sample falhar. Não quebrar o unlock de áudio do browser.

### Visual de contato

O `hitStop` já está nos dados. Falta o par visível:

- spark pixelado no ponto de contato (1 sprite, 3–5 frames)
- flash de 1–2 frames no heavy / special / KO
- camera shake curto no heavy e no KO (amplitude pequena; o pixel art não perdoa shake largo)

### Não fazer neste ciclo

- Trilha nova.
- Crowd complexo.
- VFX de cada special.
- Rebalancear dano porque “agora o hit parece mais forte”.

### Pronto quando

- Light, heavy e block têm som diferente.
- Heavy e KO tremem a câmera sem desfocar o pixel.
- Spark nasce no contato, não no umbigo do sprite.
- Modo mudo continua funcionando.

---

## Ciclo 2 — Fechar a direção visual

O logo, a HUD e o Cais falam arcade 16-bit. Os lutadores e os retratos falam outro filme: pintura quase fotográfica, 4 frames de idle, folha com vazio enorme entre poses. O title ainda encosta o logo num retângulo preto.

### Decisão obrigatória (escolher uma e parar de misturar)

**Opção A — Arcade 16-bit de verdade**

- paleta curta, contorno forte, silhueta legível
- corpo na luta com altura visual estável (faixa 64–96 px no mundo 640×360)
- sem poro, sem prega fotográfica, sem retrato realista no menu
- idle com 6–8 frames apertados
- frame ativo do golpe com squash/stretch e leitura de impacto

**Opção B — Pixel-pintado contemporâneo**

- assume o look atual
- para de vender “16-BIT FIGHTING GAME” como se fosse Fatal Fury
- alinha logo, HUD, palco e retratos no mesmo contraste e na mesma granulação

A recomendação para este elenco, se o custo de pixelizar os 6 do zero for alto: **Opção B agora**, com um passe de consistência (retratos, logo no title, palco), e Opção A só se entrar artista dedicado.

### Passos deste ciclo, independentemente da opção

1. Tirar o retângulo preto atrás do logo na tela inicial.
2. Resolver acentos: `SELEÇÃO`, `CONFIGURAÇÕES`, `MARÉ`, `MÃO`. Ou a fonte pixel ganha os glyphs, ou o texto troca por palavra que cabe. Não deixar português aleijado na cara do jogador.
3. Idle sem oceano de vazio entre frames. A origem continua nos pés; tempo e caixa **não** se ajustam no tamanho do PNG.
4. Retratos e sprites do mesmo personagem precisam parecer a mesma pessoa na mesma linguagem.

### Não fazer neste ciclo

- Segundo palco.
- Recortar hitbox “no olho” para compensar sprite novo.
- Substituir sprite de um lutador e deixar os outros no estilo antigo “para ver depois”.

### Pronto quando

- Title, menu, seleção e luta parecem o mesmo jogo.
- Acento resolvido ou conscientemente evitado em todo o copy visível.
- Ninguém precisa explicar “é 16-bit mas os bonecos são outra coisa”.

---

## Ciclo 3 — Cada lutador precisa de uma cadeia

O motor já tem cancel, hitstun, blockstun, throw, knockdown e scaling. Quase ninguém usa.

Cancels atuais:

- Rafa: jab → Mão da Maré
- Dante: um normal → bomba / super
- Demais: normal isolado

Sem confirm de 2–3 hits o round vira “aperto e espero o recovery”. Arquétipo no papel, luta parecida na mão.

### Contrato mínimo por lutador

Antes de balancear dano, cada um precisa de:

1. Confirm de 2 hits a partir do light.
2. Special que vale a meter **no hit**, não no chute aleatório.
3. Mix depois do knockdown: baixo, throw ou cruzado — um só, desde que exista.
4. Anti-air com leitura clara (golpe ou hop + botão).

### Ordem do elenco

1. **Rafa Maré** — rushdown; o confirm e o avanço têm que fluir.
2. **Guto Barba** — grappler; throw e space do heavy precisam ser verdade. Auditar o chute frontal (`y: -118`, `width: 90`, `height: 46` no mundo 640×360). Isso não é tanque. É caixa suspeita. Se `audit:hitboxes` passou, o auditor está medindo existência, não verdade.
3. **Noir Reflexo** — counter/zoner; precisa controlar espaço, não só ter special bonito.
4. **Dante Sinal** — já tem um pedaço de cancel; completar o jogo de trapaça.
5. **Léo Violeta** — pressure; precisa de string, não de três independentes.
6. **Astro Riso** — mix; o mix só existe se o knockdown e o low/high forem reais.

### Regra permanente

Tempos e caixas nunca são ajustados pelo tamanho visual do PNG. Origem nos pés. Mudança de sprite não é mudança de frame data, a menos que a auditoria mostre desalinhamento real.

### Não fazer neste ciclo

- Super nova.
- Air specials “porque o contexto marca como provisório”. Ground game primeiro.
- Nerf/buff global de vida.

### Pronto quando

- Em treino, cada lutador confirma 2 hits no dummy e cancela para special no hit.
- Guto não pega o rival com uma caixa do tamanho do cais.
- Frame data do confirm está escrito no próprio move (startup, active, recovery, cancel window).

---

## Ciclo 4 — CPU que parece um rival

`CpuController` hoje: espera N frames, às vezes erra, às vezes bloqueia, aproxima, solta special por prioridade, throw perto, light/heavy no acaso.

Isso serve no fácil. No difícil vira boneco rápido que escolhe mal. O jogador não aprende o matchup.

### Fazer, nesta ordem

1. **Anti-air no hard:** se o oponente está no ar e a distância é a do anti-air do personagem, usar esse golpe. Um teste. Um comportamento. Já muda a sessão.
2. **Punish de recovery:** se o oponente acabou de whiffar na cara, não andar; meter o punish mais rápido do elenco.
3. **Respeito a projétil:** pular, bloquear ou andar para trás. Não atravessar a onda no automático.
4. **Plano por arquétipo**
   - Guto: andar, heavy, throw perto.
   - Rafa/Astro: pressionar e não recuar tanto.
   - Noir/Dante: segurar espaço, special à distância.
   - Léo: strings curtas, não special a cada decisão.
5. Fácil continua burro. O fácil que defende tudo ensina errado.

### Não fazer neste ciclo

- IA com árvore de decisão de 400 linhas.
- CPU que lê input do frame atual (trapaceia). A janela de reação já existe em `difficulties.ts`. Usar ela.
- Dificuldade dinâmica no meio do round.

### Pronto quando

- Pular no hard e tomar anti-air com frequência visível.
- Whiffar heavy na cara e levar punish.
- Fácil ainda perde para um player que só anda e jaba.

---

## Ciclo 5 — Primeira sessão e treino

Quem abre o link precisa entender o jogo em três minutos. Hoje: uma arena, sem tutorial, ficha com nome do golpe e sem comando real.

### Fazer

- Na ficha da seleção: comando de verdade (`↓ + G`, `→ → + H`), não só “Chute da Ressaca”.
- Command list na pausa da luta, já existe presenter — garantir que está completo e com o binding atual (controles são remapeáveis).
- Treino: frame advantage na tela (hit e block). Quem for balancear o elenco vai viver nisso.
- Modo “primeiro round” contra dummy que obriga:
  1. bloquear alto
  2. bloquear baixo
  3. soltar um special
- Dummy no treino: ficar parado, bloquear tudo, agachar, gravar 2 segundos. Record/playback curto basta.

### Não fazer neste ciclo

- Campanha.
- Narrador.
- Tutorial de dez telas.

### Pronto quando

- Um amigo que nunca abriu o jogo completa o primeiro round sem perguntar no chat quais são os botões de defesa e special.
- Treino mostra se o jab é plus ou minus.

---

## Ciclo 6 — Online jogável no Brasil

Lockstep com delay 8 + Worker fora da América do Sul + ping 134–203 ms é sala de amigo paciente, não produto.

Rollback **não** é o primeiro remendo.

### Fazer, nesta ordem

1. Rodar o Worker o mais perto possível do Brasil (GRU / região SA, o que a Cloudflare permitir no plano atual).
2. Delay adaptativo de verdade: a faixa 2–12 já existe; usar o RTT medido, não 8 para todo mundo.
3. Rematch sem desmontar a sala.
4. Reconexão no lobby. No meio do round, mensagem clara e saída limpa — não fingir que o estado volta.
5. Texto honesto na tela online: “beta por código, delay fixo, ping alto se o rival estiver longe”.

### Não fazer neste ciclo

- Matchmaking público.
- Ranking.
- Espectador.
- Rollback.

Matchmaking sem netcode bom só multiplica ragequit.

### Pronto quando

- Dois clientes no RS/SP jogam um FT2 sem a mensagem `AGUARDANDO INPUT DO RIVAL` a cada troca.
- Depois do K.O. dá para pedir revanche na mesma sala.
- Hash continua idêntico; divergência ainda aborta na hora.

---

## Ciclo 7 — Conteúdo mínimo de produto

Só depois dos ciclos 1–5. Palco novo não esconde golpe sem peso.

### Fazer

- Segundo palco, mesmo simples. Uma luta só no Cais parece demo de cenário.
- KO / intro: 1 pose + 1 frase por lutador. Sem cutscene.
- Limpar a raiz do repositório: `backups/`, `test_sprite.png`, `tmp/` e scripts Python de experimento não deveriam ser a cara do GitHub.
- `LICENSE`.
- Retratos no lugar certo do pipeline (`docs/PIPELINE_DE_ARTE.md`), não só em `references/` com `portraits/` vazio.
- Página curta de produto (itch ou o próprio README): 20 segundos de luta, 6 nomes, link da demo, controles.
- Versão: sair de `0.1.0` só quando o ciclo 1 e o 3 do Rafa/Guto estiverem prontos. Número sem sensação é vaidade.

### Não fazer neste ciclo

- Elenco 7.
- Steam page completa.
- Trailer de dois minutos com footage antigo.

### Pronto quando

- README + demo explicam o jogo sem o arquivo de contexto.
- Tem pelo menos duas arenas.
- O repositório público não parece oficina.

---

## Ciclo 8 — Depois. Não agora.

Estas itens são reais. Não são o próximo commit.

- Rollback netcode
- Ranking / ELO
- Matchmaking
- Reconexão no meio do round
- Elenco novo
- Modo arcade com chefes
- Electron / desktop store
- Balance fino de dano depois que a cadeia existir

Se alguém pedir ranking amanhã: o ciclo 6 ainda não fechou.

---

## Critérios transversais (valem em todo ciclo)

1. Não declarar validação visual sem abrir o jogo.
2. `npm run typecheck` e `npm test` antes de publicar.
3. Sprite novo não altera frame data por acidente.
4. Online continua determinístico: hash igual ou a luta aborta.
5. Copy em português correto, ou decisão explícita de fonte sem acento em **todo** o jogo.
6. Commits e PRs sem assinatura de modelo de IA.
7. Backup no Drive depois de ciclo grande, quando o autor pedir — não no automático.

---

## Mapa rápido do que já existe e não deve ser refeito

| Peça | Onde | Status |
| --- | --- | --- |
| Motor 60 Hz | `src/combat/` | Manter |
| Frame data / moves | `src/fighters/*.ts` | Completar cadeia, não redesenhar o tipo |
| Lockstep + hash | `src/online/` + `server/` | Manter; só delay e região no ciclo 6 |
| CPU | `src/ai/CpuController.ts` | Estender comportamento, não trocar a classe |
| Dificuldades | `src/ai/difficulties.ts` | Usar reaction/decision já existentes |
| Áudio | `src/audio/AudioManager.ts` | Trocar tons por sample no ciclo 1 |
| Treino F1/F2/F3 | cena de luta + docs de contexto | Acrescentar advantage |
| Pipeline de arte | `docs/PIPELINE_DE_ARTE.md` | Obedecer; retrato ≠ spritesheet |
| Auditoria de caixa | `npm run audit:hitboxes` | Corrigir o critério, não só rodar |

---

## Fila da próxima sessão de trabalho

Se for sentar hoje e fazer uma coisa só:

1. Samples de hit / block / KO e spark no contato.
2. Se sobrar tempo: hitbox do chute frontal do Guto.
3. Se ainda sobrar: confirm jab → special do Rafa, testado no treino.

Três itens. O resto espera o ciclo correspondente.
