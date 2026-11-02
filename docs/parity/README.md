# Contrato de paridade TypeScript → C++

Revisão: 02/11/2026. Responsável: Codex / agente de paridade.

`src/combat/parityExporter.ts` executa o **motor TypeScript original**, sem mudar
suas regras, e exporta `golden_fixtures.json` (schema 2). A referência de gameplay
foi conferida em `master` e `web-beta`, ambos `62b56c909d23cce54613d547b1f9837f164347bc`.
Este trabalho altera o exportador e seus testes, mantendo o motor lockstep web.

## Gerar e validar

```powershell
npm run typecheck
npx vitest run src/combat/__tests__/parityExporter.test.ts
npm test
npm run build
npm run validate:sprites
```

O teste gera o fixture duas vezes e exige determinismo. A serialização mantém
cada checkpoint e entrada em uma linha, reduzindo o tamanho sem arredondar os
números. Como em todo JSON, `-0` vira `0` e propriedades `undefined` são omitidas.
Os hashes originais de estado continuam registrados nos checkpoints.

## Cobertura

- 33 replays, 16.170 passos de simulação e 33 checkpoints iniciais.
- Os 18 especiais/supers dos seis lutadores, acionados pelos comandos originais.
  O teste exige que cada golpe tenha efetivamente iniciado.
- Ataques normais em pé, agachados e avançando; ataques aéreos; defesa; agarrão.
- Finalizações do Cais, Cozinha e Sítio nos dois sentidos. O teste exige a passagem
  por `stageFinish` e a chegada a `matchOver`.
- Entradas por máscara, com validação de suas transições por passo.
- Elenco completo, golpes, eventos, janelas efetivas de colisão, poses medidas,
  geometria das mãos/pegas, metadados de sprites, retratos e áudio.

Cada checkpoint de lutador contém posição, velocidade, facing, estado/frame,
vida, barra, vitórias, grounded e golpe ativo. `mechanics` tem esta ordem:

1. armorHits
2. passiveFrames
3. invulnerableFrames
4. damageReductionFrames
5. damageReductionMultiplier
6. damageReductionCooldownFrames
7. parryFrames
8. parryRiposteDamage
9. offensiveDebuffFrames
10. offensiveDebuffMultiplier
11. freezeEffectFrames
12. victimRotation
13. victimPoseFrame (`-1` quando ausente)

## Uso no port

Em `RuaDeAcoUnreal`, `python Scripts/generate-canonical-data.py` copia o fixture
e gera os dados C++ e os replays compilados. `RuaDeAcoTests --parity` compara
os passos reais executados pelo core nativo. Os campos discretos precisam ser
idênticos; grandezas `float` usam tolerância absoluta de 0,002.

O runner também verifica a assinatura FNV-1a dos bytes do fixture para recusar
expectativas compiladas desatualizadas. A assinatura do arquivo é distinta dos
hashes de estado do TypeScript: **não se afirma igualdade do estado interno
completo entre os motores**, nem compatibilidade lockstep online nativa.

Esta validação de simulação não substitui QA visual, áudio em execução,
empacotamento nem testes em Android. Esses gates são coordenados no portal.
