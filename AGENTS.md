# AGENTS.md — Rua de Aço

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
- Pasta local do autor: `D:\PROJETOS\RuaDeAco`

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
