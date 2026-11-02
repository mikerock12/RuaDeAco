# Contexto Operacional — Rua de Aço (`contexto.md`)

**Última atualização:** 01/11/2026  
**Repositório:** `https://github.com/mikerock12/RuaDeAco` (`master` e `web-beta` mantidas idênticas)  
**Documento detalhado complementar:** [`CONTEXTO_PROJETO_RUA_DE_ACO.md`](CONTEXTO_PROJETO_RUA_DE_ACO.md)

---

## Estado Atual (01/11/2026 — Fase G0 Baseline)

- **Fonte canônica de gameplay**: Versão Web/PWA em TypeScript + Phaser 4.1 (`640 × 360` pixel art, simulação determinística própria em 60 Hz separada da renderização).
- **Elenco completo (6 lutadores)**:
  - `guto` (Guto Barba), `rafa` (Rafa Maré), `noir` (Noir Reflexo), `astro` (Astro Riso), `dante` (Dante Sinal), `leo` (Léo Violeta).
- **Arenas (3 palcos com stage finishers exclusivos)**:
  - `cais` (Cais da Cidade), `cozinha` (Cozinha Macabra), `sitio` (Sítio).
- **Sistemas ativos**:
  - Agarrão universal (`F+G` / `J+K` / `L+H`), especiais por comando, supers (`50` de barra), stage finishers (`100` de barra + oponente `<= 150` HP + distância `<= 135 px`), sonoplastia Suno (`suno_*.ogg`), modos Vs CPU, Versus Local, Treinamento e Online Lockstep (`lockstep-v6-roster-v4-sitio-cais`).
- **Verificação de Baseline G0 (01/11/2026)**:
  - Commit base: `e39c8fa87640698fb89dd23deb1c21b624dfb4e6` (`master` / `web-beta`).
  - `npm.cmd run typecheck`: OK (0 erros).
  - `npm.cmd test`: **59 arquivos / 590 testes aprovados**.
  - `npm.cmd run validate:sprites`: OK (todos os 6 lutadores com `status: ok`).
  - `npm.cmd run audit:hitboxes`: OK.
  - `npm.cmd run build`: OK (`dist/` gerado sem erros).
  - `npm.cmd --prefix server test`: **11 arquivos / 71 testes aprovados**.
- **Próximo passo (Fase G1)**:
  - Exportar fixtures e replays golden determinísticos (`golden_fixtures.json`) a partir do motor TypeScript sem alterar o gameplay nem `__COMBAT_ENGINE_VERSION__`, servindo de contrato para o runtime nativo C++20 (`RuaDeAcoUnreal`).
- **Responsável**: Agente Coordenador SLT Games.


## Fase G1 — Exportador de Fixtures e Replays Golden (01/11/2026)

- Implementado `src/combat/parityExporter.ts` e teste automatizado `src/combat/__tests__/parityExporter.test.ts`.
- Gerado o artefato canônico `docs/parity/golden_fixtures.json` contendo:
  - Contrato do motor 60 Hz (`640×360`, `groundY = 304`, `stageLeft = 36`, `stageRight = 604`, `roundTimeFrames = 5940`, `finishWindow = 480`, `finishThrow = 60`, `finishEnd = 300`).
  - As 3 arenas (`cais-da-cidade`, `cozinha-macabra`, `sitio`).
  - As definições completas dos 6 lutadores (`rafa-mare`, `noir-reflexo`, `astro-riso`, `dante-sinal`, `leo-violeta`, `guto-barba`), incluindo stats, hurtboxes, pushboxes, golpes, `universalGrab`, supers e projéteis.
  - 3 cenários de replay determinístico com checkpoints e hashes FNV-1a de 64 bits (`guto-vs-rafa-walk-jump-strikes`, `noir-vs-astro-specials-and-projectiles`, `dante-vs-leo-universal-grab`).
- Verificação: `typecheck` OK, `vitest` **60 arquivos / 591 testes aprovados**, `build` OK.
- Responsável: Coordenador SLT Games.
