# Cais da Cidade — remasterização

A arena ganhou uma nova composição noturna: porto industrial, cidade ao fundo,
água com reflexos animados, iluminação quente, sombras e piso molhado. A lua
fica em uma camada própria, com crateras e halo discreto. A área de combate
continua em 640 × 360, com contato dos pés em Y=304.

## Eventos lentos e espaçados

Um diretor decorativo sorteia a ordem dos cinco encontros. Cada ciclo inclui
todos eles, sem repetir imediatamente o último. A primeira aparição espera
12–20 segundos; entre encontros há 18–34 segundos de descanso. Os tempos são
de jogo ativo: pausar congela água e eventos.

| Encontro | Duração | Comportamento |
| --- | --- | --- |
| Disco distante | 20 s | Cruza o céu atrás da lua, que o oculta durante a passagem |
| Disco próximo | 20 s | Aproxima-se de um lutador, projeta um feixe suave e sobe até desaparecer |
| Bruxa | 22 s | Cruza lentamente o céu de vassoura, perto da lua |
| Monstro | 22 s | Emerge da água, lança fogo para cima e submerge |
| Navio e monstro | 42 s | O navio chega, o monstro emerge, três tiros o atingem e ambos saem |

Só há um encontro principal por vez. Navio e monstro são coordenados dentro
do mesmo encontro; não se sobrepõem a discos ou à bruxa. O feixe acompanha
lentamente um dos lutadores, sem puxá-lo nem aplicar dano. Canhões e fogo
são decorativos. A simulação, os inputs e os hashes do combate não mudam.
O Cais remasterizado aparece em todos os modos, inclusive online. A ordem
decorativa é local a cada cliente e pode ser diferente entre os jogadores.

## Arte e exportação

As quatro imagens-fonte foram criadas com o **imagegen integrado**, a partir
da composição do Cais e da direção visual do jogo. Os prompts completos estão
em `art-source/stages/cais-remaster/prompts.json`.

- `background-source.png`: porto, cidade, água e plataforma, sem lua ou atores.
- `props-source.png`: lua, disco, bruxa e navio, com transparência.
- `monster-source.png`: quatro poses do monstro.
- `effects-source.png`: quatro quadros de fogo e quatro de água deslocada.

Execute `npm run assets:cais` para reproduzir os PNGs de runtime em
`public/assets/stages/cais-da-cidade/remaster/`. O exportador apenas recorta,
registra e reduz com nearest-neighbor, preservando o alpha. As fontes ficam
fora de `public`; o navegador recebe cerca de 0,90 MB em onze texturas.
Os antigos PNGs do Cais permanecem no repositório como referência histórica,
mas não são carregados pela fase. Abertura, menu, seleção e resultado também
usam o novo fundo.

## Implementação e desempenho

- `src/ui/caisAmbience.ts`: relógio local, sorteio, trajetórias e sequência dos encontros.
- `src/ui/CaisStageView.ts`: camadas, recorte de submersão e renderização.
- `src/ui/stagePresentation.ts`: posições e profundidades.
- O disco distante fica atrás da lua. Atores e efeitos ficam abaixo dos
  lutadores e da interface, preservando a leitura do combate.
- Sprites, gráficos, reflexos e poses são reutilizados. Não há criação contínua
  de partículas, luzes dinâmicas, física ou texturas durante a luta.
- A água usa três faixas pequenas com deslocamento lento e reflexos discretos.
  Deltas longos são limitados para não disparar eventos em sequência ao voltar à aba.

## Validação

Os testes de modelo simulam vinte minutos, verificando variedade, intervalos,
exclusão de eventos independentes, passagem pela lua, aproximação/ascensão,
fogo/submersão e os três tiros. A suíte Playwright do Cais cobre desktop e
celular: seleção, movimento da água, evento completo, vida/posição preservadas,
pausa, retomada, descarte e áudio. Avisos de textura ausente também falham o teste.
Essa suíte integra `npm run test:e2e:ci`.

As prévias de todos os encontros foram conferidas visualmente, além da arena
com os lutadores e controles touch. Emulação de celular não substitui medição
de FPS e toque em aparelhos físicos.
