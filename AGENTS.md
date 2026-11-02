# AGENTS.md — Rua de Aço

## Localização real dos projetos — 02/11/2026

Raiz de trabalho confirmada: `D:\PROJETOS\SoftwaresSmellsLikeTech`. Não procurar nem criar cópias em `D:\PROJETOS\RuaDeAco`, `D:\PROJETOS\RuaDeAcoUnreal` ou `D:\MikeAndDenyse`: referências a esses locais em registros antigos são históricas.

| Pasta real | Papel |
|---|---|
| `D:\PROJETOS\SoftwaresSmellsLikeTech` | Portal existente e coordenação da publicação; preserva seus cinco submódulos de softwares. |
| `D:\PROJETOS\SoftwaresSmellsLikeTech\RuaDeAco` | Jogo original TypeScript/Phaser atualizado; fonte canônica de regras, lutadores, golpes, apresentação, arte e áudio para o port C++. |
| `D:\PROJETOS\SoftwaresSmellsLikeTech\RuaDeAcoUnreal` | Base C++ reaproveitada e atualizada conforme o original; sua implementação antiga não define o gameplay nem as capturas atuais. |
| `D:\PROJETOS\SoftwaresSmellsLikeTech\MikeAndDenyse` | Repositório Nightfall; referência Unity preservada em `NightfallUnity/` e port C++ em `NightfallNative/`. |
| `D:\PROJETOS\SoftwaresSmellsLikeTech\RuaDeAco_AndroidBuild` | Árvore auxiliar existente de build Android/Capacitor do Rua de Aço; não substitui a fonte canônica `RuaDeAco` nem o build nativo em `RuaDeAcoUnreal`. |
| `D:\PROJETOS\SoftwaresSmellsLikeTech\RuaDeAco_AudioMasters` | Matrizes de áudio existentes (`music/`); preservar os originais. Não é uma fonte alternativa de gameplay. |

Confirmar o Git de cada pasta antes de editar; estas pastas de jogos são projetos independentes dentro da raiz do portal, não novos submódulos nem assets estáticos a publicar. Capturas do site devem vir da versão indicada em execução e mostrar os lutadores atuais. Responsável: Codex.

## Correção de paridade em andamento — 02/11/2026

O exportador e o fixture de desenvolvimento usam schema 2, com entradas e checkpoints por passo e dados de apresentação/colisão. O runner C++ agora compara 33 replays / 16.170 passos, incluindo os seis lutadores e as finalizações nos três palcos, com tolerância numérica declarada (0,002 px), sem divergências nos campos exportados. Typecheck, 591 testes e auditoria de sprites passaram. Isso não comprova toda a apresentação nem a execução Android: validação visual/funcional, pacotes finais, releases e backups seguem em andamento. Sem aparelhos físicos disponíveis. Referências e limites em docs/parity/README.md e no projeto C++ Docs/PARITY_REPLAYS.md. Responsável: Codex.

Instruções para qualquer assistente de código (Claude Code, Codex, Gemini e
outros) que trabalhe neste repositório. A fonte completa e atualizada é
[`CONTEXTO_PROJETO_RUA_DE_ACO.md`](CONTEXTO_PROJETO_RUA_DE_ACO.md): leia-o
antes de começar. Este arquivo só resume as regras que não podem ser
esquecidas. O estado real do Git sempre vale mais do que o que está escrito.

Responda e documente em português do Brasil.

## Projeto

Jogo de luta 2D em pixel art 16-bit (640 × 360), Phaser 4 + TypeScript + Vite,
com combate próprio determinístico a 60 Hz em `src/combat/` e online por
lockstep em Cloudflare Workers (`server/`). Android via Capacitor 8.

- Jogo no ar: https://mikerock12.github.io/RuaDeAco/
- Pasta local do autor: `D:\PROJETOS\SoftwaresSmellsLikeTech\RuaDeAco`

## Antes de mexer

```bash
git status --short --branch
git diff --stat
git log -5 --oneline --decorate
```

Nunca comece com `git reset --hard`, `git clean -fd`, `git restore .`,
`git checkout -- .` ou `git push --force`.

## Regras

1. Mexa só no escopo pedido. Não recrie o projeto; leia `package.json` antes.
2. Assets separados: `PortraitAsset` (retratos de menu, seleção, HUD, versus,
   resultado) nunca vira `FighterSpriteAsset` (spritesheets da luta).
3. Não substitua sprites aprovados nem altere outro lutador ao mexer em um.
   Pixel art sempre em nearest-neighbor, sem antialias nem blur; pés, origem e
   linha do chão alinhados.
4. **Rostos:** os lutadores têm rostos fictícios e não podem lembrar pessoas
   reais. O **Guto Barba** é baseado no autor: não altere o rosto dele.
   Veja [`docs/ROSTOS_E_RETRATOS.md`](docs/ROSTOS_E_RETRATOS.md).
5. Golpes são dados (frame data e caixas), não números espalhados no código.
   Tempos e caixas não se ajustam pelo tamanho visual do sprite.
6. Qualquer mudança que altere a simulação de combate exige subir a versão do
   motor em `vite.config.ts` (`__COMBAT_ENGINE_VERSION__`), para clientes de
   versões diferentes não se enfrentarem online.
7. Sprites e folhas exportadas têm hash travado na auditoria
   (`npm run validate:sprites`). Ao regerar arte, atualize os manifestos com os
   scripts do projeto, nunca à mão.
8. Não inicie Electron ou Capacitor sem pedido explícito.
9. Não declare validação visual sem abrir o jogo. Separe o que foi testado
   automaticamente do que precisa de conferência manual.

## Validação antes de publicar

```bash
npm run typecheck
npm test
npm run build
npm run validate:sprites
npm run test:e2e          # Playwright, quando a mudança afeta tela ou combate
npm --prefix server test  # quando mexer no servidor
```

## Git e publicação

- `master` e `web-beta` ficam **idênticas**. Push em `web-beta` publica o
  GitHub Pages; `master` é a branch padrão do GitHub. Atualize as duas.
- Trabalhe em branch própria e abra PR para o `master`; o CI
  (`.github/workflows/ci.yml`) precisa estar verde.
- **Commits e PRs nunca levam `Co-Authored-By` de IA nem assinatura
  equivalente.** Autor dos commits: Maicon Nunes.
- Android: compilado em `.github/workflows/android-release.yml`. A versão fica
  em `android/app/build.gradle` (suba o `versionCode` a cada envio à Play).
  Publicação na loja: [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md).

## Segredos

- A chave de upload Android (`*.jks`, `*.keystore`) e as senhas dela nunca vão
  para o Git.
- O `TICKET_SECRET` do servidor nunca vai para arquivo versionado, log ou
  print.

## Depois de terminar

Atualize o `CONTEXTO_PROJETO_RUA_DE_ACO.md` (data da revisão, resumo no topo e
histórico) e o doc específico em `docs/` quando a mudança for relevante.


## Registro de etapas (Plano SLT Games 2026)

- **2026-11-01 / Fase G0 (Inventário e Baseline P0)**: Criado `contexto.md` sincronizado com `CONTEXTO_PROJETO_RUA_DE_ACO.md`. Base `master`/`web-beta` verificada em `e39c8fa87640698fb89dd23deb1c21b624dfb4e6`. Bateria completa executada e aprovada localmente: `typecheck` OK, `vitest` 59/59 arquivos (590/590 testes), `validate:sprites` OK, `audit:hitboxes` OK, `build` OK e `server test` 11/11 arquivos (71/71 testes). Próxima etapa: Fase G1 (exportador determinístico de fixtures golden para paridade C++). Responsável: Coordenador SLT Games.

- **2026-11-01 / Fase G1 (Exportador de Fixtures e Replays Golden para Paridade C++)**: Criados `src/combat/parityExporter.ts`, `src/combat/__tests__/parityExporter.test.ts` e o manifesto determinístico `docs/parity/golden_fixtures.json` (exportando os 6 lutadores completos, 3 arenas, constantes de 60 Hz e 3 cenários de replay com hashes FNV-1a de 64 bits). Nenhuma regra de combate nem `__COMBAT_ENGINE_VERSION__` foi alterada. Testes cliente subiram para 60 arquivos / 591 testes aprovados; servidor 71/71 aprovados. Responsável: Coordenador SLT Games.

- **2026-11-01 / Fases G2 e G3 Concluídas em `RuaDeAcoUnreal`**: O runtime nativo C++20 + raylib atingiu paridade de elenco (6 lutadores), arenas (3 palcos com finalizações exclusivas), agarrão universal, projéteis, especiais, supers e áudio `.ogg` consumindo `golden_fixtures.json` exportado deste repositório (`44/44` verificações CTest + benchmark 10.000 ticks em `7,26 ms`). Responsável: Coordenador SLT Games.

- **2026-11-01 / Fase G4 Concluída em `RuaDeAcoUnreal`**: Gerados e verificados os pacotes nativos v0.2.0 Windows (`RuaDeAco-0.2.0-Windows-x64-Setup.exe` e `.zip`) e Android ARM64 (`RuaDeAco-0.2.0-Android-arm64.apk`, assinado v2/v3). Próxima etapa: Fases G5–G6 em `MikeAndDenyse-Nightfall`. Responsável: Coordenador SLT Games.

- **2026-11-01 / Fases G5 e G6 Concluídas em `MikeAndDenyse-Nightfall`**: Implementado `NightfallNative` C++20 + raylib (`77/77` checks de `Smoke.cs` + UDP LAN loopback, 10.000 ticks em `3,95 ms`) e gerados os pacotes v1.0.0 Windows e Android ARM64. Próxima etapa: Fase G7 (publicação das Releases GitHub v0.2.0 e v1.0.0). Responsável: Coordenador SLT Games.
- **2026-11-01 / Fase G7 Concluída**: Publicadas e verificadas as Releases GitHub estáveis `v0.2.0` em `mikerock12/RuaDeAcoUnreal` (`https://github.com/mikerock12/RuaDeAcoUnreal/releases/tag/v0.2.0`) e `v1.0.0` em `mikerock12/MikeAndDenyse-Nightfall` (`https://github.com/mikerock12/MikeAndDenyse-Nightfall/releases/tag/v1.0.0`), com digests SHA-256 remotos confirmados. Próxima etapa: Fase G8 (integração de `/games/` no portal). Responsável: Coordenador SLT Games.
- **2026-11-01 / Fase G8 Concluída**: Portal `softwares.smellsliketech.com.br` atualizado (PR #38, merge `5fe367e`, Worker `f24ab0eb-d181-435b-b8ce-5764468138c8`) com `/games/`, `/games/rua-de-aco/` (incluindo link para jogar na Web `https://mikerock12.github.io/RuaDeAco/` e downloads v0.2.0) e `/games/mike-and-denyse/` (downloads v1.0.0). Próxima etapa: Fase G9 (Backups Google Drive). Responsável: Coordenador SLT Games.
