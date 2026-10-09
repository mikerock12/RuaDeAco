# Elenco v4 e apresentação — 09/10/2026

## Direção de arte

O rascunho do autor em `RuaDeAco-spritesheets-v2-RASCUNHO/` é a referência de identidade.
Cinco lutadores foram recriados em pixel art com corpos, roupas e rostos próprios em todas
as animações. O catálogo de nomes, golpes e especiais continua igual. Nenhuma caixa de
colisão, dano ou tempo foi adaptado ao tamanho da arte.

Guto recebeu apenas acabamento discreto de luz fria, em dois deslocamentos de um pixel
atrás do sprite. O rosto, as cores internas, o retrato e as folhas originais permanecem
protegidos pelos hashes de `guto-preserved.json`. A mesma apresentação leve integra os
outros lutadores. Não há blur ou antialias nos corpos.

## Fontes e exportação

- `art-source/fighters/redesign-v4/`: atlas transparentes de movimento, defesa, golpes,
  aéreos, chão, especiais, reações e agarrão; refinamentos de contato preservados à parte.
- `prompts.json` e `refinement-prompts.json`: instruções usadas no imagegen integrado.
- `characters.json`, `export-plan.json`: identidades, altura de referência e seleção de células.
- `export-manifest.json`: SHA-256 da fonte e da saída, escala uniforme e recortes medidos.
- `hand-landmarks.json`, `lift-angles.json`: mãos e inclinação real do corpo levantado.
- `air-registration.json`: registro visual das poses aéreas compactas, sem mover a raiz
  física nem alterar caixas; deslocamento horizontal espelhado com o lutador.

```bash
npm run assets:characters
npm run validate:sprites
npm run audit:hitboxes
```

O exportador separa componentes corporais completos sem cortar mãos pela grade nominal;
remove partículas soltas, aplica alpha binário e reduz por nearest-neighbor. A escala é
única dentro de cada atlas. Corpos têm margens de seis pixels, quadros de 256 × 256 e
última linha opaca em 249; Guto mantém seu contrato de 288 × 288. O último quadro de
levantamento é espelhado quando necessário para evitar inversão brusca da orientação.
Os retratos são exportados separadamente, nunca registrados como folhas de luta.

`assets:grab` antigo está bloqueado para preservar os corpos novos. Os scripts `faces-v3`
não fazem parte da reprodução atual. Atualizar os manifestos pelos exportadores, não à mão.

## Agarrão e finalizações

Mãos, pontos de pega da vítima e oito inclinações de levantamento foram medidos nas
folhas novas. A vítima acompanha a pose própria, sem rotação duplicada. A adaptação dos
pontos altera a apresentação do levantamento compartilhada pela simulação: o motor passou
para `lockstep-v6-prototype-bodies`, impedindo partidas entre versões diferentes.

Cais: rastro de arremesso, impacto na água, mastigação com deslocamento sutil e áudio com
camadas graves. Cozinha: queda no caldo, movimento das pernas, respingos quentes, vapor,
ossos e caveira. Sítio: avanço/recuo do mascarado e reação à estocada, poeira e fechamento
com peso. Apresentação comum inclui vinheta, faixas discretas, partículas de impacto,
reflexos e tremor curto. Efeitos fortes respeitam a opção de movimento reduzido; os sons
respeitam volume/mudo e reutilizam buffers, sem criar arquivos pesados para cada variação.
Os três Graphics de apresentação são reutilizados e limpos fora da sequência.

A reentrada no Sítio usava implicitamente `Texture.firstFrame`. Ao adicionar os recortes
das portas, o Phaser mudava esse campo do fundo inteiro para a folha esquerda. O fundo
agora solicita `__BASE` explicitamente. O teste de revanche verifica textura integral
640 × 360, portas fechadas e ausência de finalização residual.

## Verificação

Tipos, unitários, build, auditorias de raster/hitboxes e Playwright de desktop/celular.
A reprodução completa dos assets foi comparada por SHA-256 sem divergências.
O CI repete as auditorias, roda a suíte completa de navegador e verifica duas sessões online. A auditoria
atual cobre 242 entradas raster, 98 fases corporais e seis projéteis. Os testes de
finalização observam o jogo real, incluindo a reentrada no Sítio. Capturas do navegador
foram abertas para revisão visual; emulação de celular não equivale a teste físico Android.

Os testes antigos de Astro, Guto e Léo/Noir passaram a tocar a posição atual do botão
de pausa (608, 58). A folha de auditoria inclui também os seis agarrões: 98 figuras.

## Estabilidade do lobby online

Atualizações de ping e confirmações repetidas com o mesmo conteúdo preservam os botões,
em vez de destruir e recriar toda a interface sob o ponteiro. O texto e as barras de
latência são atualizados em objetos reutilizados. Mudanças reais de seleção, arena,
pronto e conexão continuam atualizando a apresentação. O E2E espera a confirmação da
seleção recebida pelos dois jogadores e verifica um ping real sem reconstrução do lobby.

A suíte completa é distribuída em quatro shards no CI, com um navegador por runner.
Os testes legados de Gancho/Abraço e hazards do Dante observam cada tick real,
para que poses de dois frames não se percam entre consultas do processo de teste.
Dano, estados, liberação do agarrão e ausência de erros continuam verificados.
