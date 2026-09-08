# Contexto do projeto — Rua de Aço

> **Arquivo único de continuidade.** Substitui o antigo `GEMINI.md` (cópia
> idêntica) e a pasta local `RuaDeAco_Contexto_GPTWork/`. Qualquer assistente
> que assumir o projeto deve ler só este arquivo, e o estado real do Git
> sempre prevalece sobre o que estiver escrito aqui.
>
> Última revisão: **08/09/2026**.
>
> Sítio implementado: dia ensolarado, galinhas, patos, cobra e lagarto garantidos;
> ovos, alimentação e disputas decorativas. Trilha própria e seleção online.
> Detalhes em [docs/SITIO.md](docs/SITIO.md). Tipos, build, 477 testes do cliente,
> 71 do servidor e E2E do Sítio em computador/celular aprovados localmente.
> CI 34211562131 aprovado: 477 testes do cliente, 71 do servidor,
> 20 cenários de navegador e 9 online. Worker publicado em 08/09/2026,
> versão 193d2555-d22e-4b80-819b-0ba52b9052d3. Login Cloudflare resolvido.
> O push em web-beta publica este cliente após o CI; confira a execução no GitHub.
>
> Nova arena: **Cozinha Macabra**, disponível em CPU, versus local, treino e online.
> Trilha própria em loop e um único fogão, integrado à bruxa animada.
> Foto adaptada, bruxa com panelão, morcegos e ratos animados; seleção por
> toque e direções de P1. Arte, prompts e implementação em
> [docs/COZINHA_MACABRA.md](docs/COZINHA_MACABRA.md). No online, P1 escolhe a arena para ambos.
> Trocar a arena cancela o pronto; cada confirmação valida a fase atual.
> Validação da cozinha: 467 unitários, 66 testes de servidor, 18 cenários
> de navegador e 5 online aprovados no CI do commit 1019a98.
>
> Rodada mobile: controles touch e pausa revisados; plano e auditoria em
> [PLANO_MELHORIAS_RUA_DE_ACO.md](PLANO_MELHORIAS_RUA_DE_ACO.md) e
> [docs/AUDITORIA_MOBILE_2026-09-06.md](docs/AUDITORIA_MOBILE_2026-09-06.md).
> CI em [docs/CI.md](docs/CI.md). A seção de estado abaixo registra a base
> histórica de agosto; a publicação das melhorias deve ser conferida no GitHub.

---

## 1. Identidade e endereços

Os nomes abaixo são o mesmo projeto e nunca devem ser tratados como jogos ou
repositórios diferentes: `RuaDeAco` (pasta e repositório), `Jogo Rua de Aço`
(históricos e conversas) e `Rua de Aço` (nome oficial).

```text
Pasta local:  D:\PROJETOS\RuaDeAco
GitHub:       https://github.com/mikerock12/RuaDeAco
Jogo no ar:   https://mikerock12.github.io/RuaDeAco/
Servidor:     https://rua-de-aco-game-server.maicon-nunes11.workers.dev
Branches:     web-beta (trabalho e publicação) e master (padrão do GitHub)
```

`master` e `web-beta` são mantidas idênticas. O push em `web-beta` dispara o
deploy do GitHub Pages; `master` é a branch que o GitHub exibe na página do
repositório. As duas precisam ser atualizadas.

Também existem as branches `android-beta` e `combat-air-specials-pass`,
antigas e sem uso ativo.

---

## 2. Base histórica — verificada em 28/08/2026

O jogo está **funcional e publicado**, com multiplayer online **funcionando em
produção**. Nada aqui é aspiracional; tudo foi verificado com o jogo rodando.

- **6 lutadores jogáveis** (todos com `available: true`).
- **4 modos**: CPU, dois jogadores no mesmo teclado, treinamento e online.
- **Online validado** contra o Worker publicado: sala criada por código, dois
  clientes conectados, `startFingerprint` igual e hash de estado idêntico nos
  dois lados. Ping medido de 134–203 ms, input delay de 8 frames.
- **Testes**: 438 unitários no cliente (48 arquivos) e 66 no servidor; typecheck
  limpo; CI do GitHub Pages verde.
- **11 cenas** Phaser registradas em `src/main.ts`.
- Arena única: **Cais da Cidade**. Luta em melhor de três rounds
  (`ROUNDS_TO_WIN = 2`), round de 99 segundos.

Pendências reconhecidas: sem ranking, matchmaking, rollback ou reconexão no
meio da luta; o Worker roda fora da América do Sul, o que mantém o ping alto
para o Brasil; balanceamento fino e animações cinematográficas continuam
provisórios; áudio e ícones do PWA são temporários.

---

## 3. Stack e arquitetura

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript no cliente e no servidor |
| Motor | Phaser 4.1, pixel art em 640 × 360 |
| Build | Vite 8 — sem React, sem framework de UI, sem banco de dados |
| Servidor online | Cloudflare Workers + Durable Objects com SQLite |
| Mobile | Capacitor 8 (APK Android) |
| Testes | Vitest e Playwright |
| Publicação | GitHub Pages via GitHub Actions |

A simulação de combate é própria e determinística, em passo fixo de 60 Hz,
separada do desenho. O Phaser cuida de tela e entrada; não se usa a física nem
as colisões automáticas dele.

Separação obrigatória de assets, que nunca deve ser quebrada:

- `PortraitAsset` — retratos conceituais para menu, seleção, ficha, versus, HUD
  e resultado;
- `FighterSpriteAsset` — sprites e spritesheets usados durante a luta.

Fichas conceituais **não** são spritesheets e nunca viram corpo em combate.

Estrutura de pastas, contrato de sprites e o passo a passo para adicionar um
personagem estão em [`docs/PIPELINE_DE_ARTE.md`](docs/PIPELINE_DE_ARTE.md).

---

## 4. Direção visual

Arcade dos anos 1990 em pixel art 16-bits: pixels nítidos, sem antialias, sem
blur, sem suavização; contornos fortes, paleta limitada, sombras em blocos,
efeitos pixelados, fontes pixeladas locais. Interface de metal com azul, prata
e detalhes dourados. Cenário urbano noturno.

Proibido: personagens feitos de círculos, retângulos ou bonecos-palito; upscale
suavizado; gradientes realistas modernos; fotos borradas. Redimensionamento de
pixel art sempre em `nearest-neighbor`, com alpha 255 no corpo e transparência
apenas nos efeitos.

O logo em estética arcade aparece no menu principal e será reaproveitado em
ícones de `.exe`, `.apk`, abertura e material promocional.

---

## 5. Elenco

Todos jogáveis. Os nomes dos golpes abaixo são os que estão no código
(`src/fighters/`), que prevalece sobre qualquer documento antigo.

| Lutador | Arquétipo | Especiais |
| --- | --- | --- |
| **Rafa Maré** | Agile / Rushdown | Mão da Maré · Chute da Ressaca · Eco Tatuado |
| **Guto Barba** | Tank / Grappler | Muralha Norte · Gancho do Urso · Abraço Glacial |
| **Noir Reflexo** | Counter / Zoner | Reflexo Negro · Quebra-Luz · Impacto Solar |
| **Astro Riso** | Speed / Mix-up | Sorriso Relâmpago · Rajada Neon · Astro Giro |
| **Dante Sinal** | Technical / Zoner | Ponto Final · Bomba de Fumaça · Chave Binária |
| **Léo Violeta** | Pressure / Brawler | Olhar Frio · Impacto Sombrio · Pressão Violeta |

**Rafa Maré** — cabelo raspado, bigode e cavanhaque, alargador, tatuagens,
camisa azul-clara, bermuda escura, tênis, corpo atlético, energia de água azul.
Velocidade alta, vida média, alcance curto, pressão ofensiva, pulo mais rápido
e longo que o de Guto.

**Guto Barba** — corpo grande e largo, barba longa, touca escura, moletom e
calça escuros, botas robustas, luvas, efeitos de gelo. Muita vida, velocidade
baixa, salto curto e pesado, agarrão excelente. Nos agarrões, o PNG de Guto
nunca inclui a vítima: os estados da vítima são sprites separados.

---

## 6. Sistema de combate

Cada golpe é definido por dados, nunca por números espalhados pelo código:
startup, frames ativos, recuperação, hitbox, hurtbox, pushbox, dano, hit stun,
block stun, knockback, prioridade, custo de energia, cancelamentos e
invulnerabilidade quando aplicável.

Interfaces centrais: `FighterDefinition`, `MoveDefinition`, `AnimationDefinition`,
`HitboxDefinition`, `HurtboxDefinition`, `InputCommand` e `FighterStats`.

O input buffer reconhece sequências, aceita diagonais, tem tolerância própria,
respeita o lado para o qual o lutador está virado, limpa após a execução e
funciona igual em teclado, touch e gamepad.

Regra permanente: tempos e caixas nunca são ajustados pelo tamanho visual do
PNG. A origem lógica fica nos pés e as regras ficam no núcleo de combate.

---

## 7. Controles

| Ação | Jogador 1 | Jogador 2 |
| --- | --- | --- |
| Mover | A / D | Setas ← → |
| Pular / agachar | W / S | Setas ↑ ↓ |
| Ataque fraco | F | J |
| Ataque forte | G | K |
| Especial | H | L |
| Defesa | R | U |
| Confirmar / pausar | Enter / Esc | — |

Remapeáveis em Configurações. No toque, o jogo mostra direcional à esquerda e
botões à direita, aceita múltiplos dedos, cancela ao sair da área e libera tudo
ao perder foco ou girar a tela. Gamepads são reconhecidos ao conectar.

No treinamento: F1 alterna hitboxes/hurtboxes/pushboxes, F2 reposiciona, F3
liga ou desliga a CPU; vida e energia infinitas.

---

## 8. Modo online

Beta privada de duas pessoas por código de sala. O servidor **transporta
inputs e não simula a luta**; os dois clientes rodam a mesma simulação de 60 Hz
em lockstep com atraso fixo.

1. Um jogador cria a sala e recebe um código de 10 caracteres; o outro entra
   com esse código. Dois jogadores por sala, sem espectadores.
2. O Worker emite sessão convidada assinada em HMAC-SHA-256 e um ticket de 45
   segundos, usado apenas no subprotocolo do WebSocket — nunca na URL.
3. Cada sala é um Durable Object isolado com SQLite (slots, seleção, seed,
   prontidão, nonces, deadlines) que hiberna quando ninguém está conectado.
4. Cada frame vira uma máscara de 8 bits — direções mais fraco, forte, especial
   e defesa — em lotes de até 3 frames. `pause`, `confirm` e `cancel` não
   trafegam.
5. Input delay de 8 frames (`INPUT_DELAY_FRAMES`, mínimo 2 e máximo 12). Quando
   a rede atrasa mais que isso, o cliente segura o frame e mostra
   `AGUARDANDO INPUT DO RIVAL` em vez de dessincronizar.
6. A cada 60 frames os dois lados enviam um hash canônico do estado completo;
   divergência é detectada na hora.

O cliente lê `VITE_MULTIPLAYER_URL`. Em desenvolvimento cai para
`http://127.0.0.1:8787`; em produção sem a variável o modo online é desligado.
O `TICKET_SECRET` do servidor nunca vai para arquivo versionado, log ou print.

Detalhes completos em [`docs/MULTIPLAYER_SERVER_ARCHITECTURE.md`](docs/MULTIPLAYER_SERVER_ARCHITECTURE.md)
e [`docs/ONLINE_CLIENT_ARCHITECTURE.md`](docs/ONLINE_CLIENT_ARCHITECTURE.md).

---

## 9. Comandos do projeto

```powershell
npm install
npm run dev                 # jogo em http://127.0.0.1:5173
npm run typecheck
npm test
npm run build
npm run preview
npm run validate:sprites
npm run audit:hitboxes
```

Servidor online local:

```powershell
npm.cmd --prefix server ci
npm.cmd --prefix server run dev      # http://127.0.0.1:8787
npm.cmd --prefix server test
npm.cmd --prefix server run smoke
```

Para testar o cliente local contra o servidor **de produção**, basta subir o
Vite com a variável apontada para o Worker — a allowlist de origins já aceita
`http://127.0.0.1:5173`.

---

## 10. Preferências de trabalho com assistentes

Quando a resposta entregar um prompt, comando ou procedimento para alterar,
testar, buildar ou publicar o jogo, informar **antes do prompt**:

1. ferramenta recomendada (Codex, Claude Code, Gemini/Antigravity);
2. modelo exato;
3. nível de raciocínio, com o nome usado por aquela ferramenta;
4. motivo curto da escolha;
5. comando para abrir ou retomar a ferramenta;
6. o prompt completo, pronto para copiar;
7. o que será feito;
8. como testar e o critério de aprovação.

Não entregar só o prompt nem só os comandos.

Critério de raciocínio: **médio** para inspeção, documentação, build, commit,
push e correções focadas; **alto** para arquitetura, bugs persistentes, sistema
de combate, pipeline de sprites, agarrões e mudanças que cruzem subsistemas.
Evitar níveis Ultra em tarefa rotineira por consumo de cota.

Prompts longos devem ir para um `.md` em vez de colados inteiros no terminal.
Quando os modelos disponíveis mudarem, recomendar o melhor acessível no
momento em vez de repetir uma indicação antiga.

**Atribuição de IA:** commits e PRs nunca levam `Co-Authored-By: Claude` nem
assinatura equivalente — o GitHub transforma isso em contribuinte visível. Em
28/08/2026 esse rastro foi removido de 77 commits em 8 repositórios.

---

## 11. Regras para agentes

Antes de alterar qualquer coisa:

```powershell
git status --short --branch
git diff --stat
git log -5 --oneline --decorate
```

Nunca iniciar uma tarefa com `git reset --hard`, `git clean -fd`,
`git restore .`, `git checkout -- .` ou `git push --force`.

1. Não recriar o projeto do zero; ler `package.json` e os scripts antes.
2. Corrigir apenas o escopo pedido.
3. Não substituir sprites aprovados nem alterar retratos de outros lutadores ao
   mexer em um.
4. Não usar imagens conceituais como spritesheets.
5. Não declarar validação visual sem realmente abrir o jogo.
6. Separar claramente o que foi automatizado do que exige conferência manual.
7. Não remover arquivos sem backup ou sem Git.
8. Não iniciar Electron ou Capacitor sem pedido explícito.
9. Manter alinhamento dos pés, origem e linha de chão consistentes.
10. Rodar `npm run typecheck`, `npm test` e o build antes de publicar.

---

## 12. Backup

O backup canônico fora do computador fica no Google Drive da conta do projeto,
na pasta `Projetos/Rua de Aço` (o link não é versionado aqui por ser um
repositório público). O GitHub é o repositório operacional do código; o Drive
guarda também contexto local, histórico completo, material de produção e
áudios-mestres.

Não há backup automático. Renovar o Drive apenas quando o usuário pedir; após
grandes alterações, lembrar que o backup pode ser atualizado.

---

## 13. Histórico resumido

| Data | Marco |
| --- | --- |
| 15/07/2026 | Contexto inicial do projeto registrado |
| 16–17/07/2026 | Controles remapeáveis, gamepad, touch e menu de pausa |
| 18/07/2026 | Primeira tentativa de Dante reprovada em auditoria; APK beta 0.2.0 |
| 22–23/07/2026 | Dante Sinal implementado, escala corrigida, trava Guto × Dante resolvida e publicado |
| 26/07/2026 | Auditoria de textos e retratos; servidor Cloudflare fase 1; cliente online fase 2; Worker publicado |
| 29/07/2026 | Léo Violeta e Noir Reflexo implementados, escala e recortes corrigidos, CI ajustado |
| 01/08/2026 | Correção global de hitboxes auditada e publicada |
| 28/08/2026 | README reescrito com prints reais; contexto unificado neste arquivo; atribuição de IA removida do histórico |

Registrar aqui também tentativas que falharam, para que ninguém repita uma
solução já rejeitada.
