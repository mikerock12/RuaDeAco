# CONTEXTO DO PROJETO — JOGO RUA DE AÇO

> Documento de continuidade do projeto.  
> Objetivo: permitir que ChatGPT, Codex, Claude Code ou outro agente assuma o projeto sem perder decisões, comandos, estrutura, problemas conhecidos e próximos passos.

---

## 1. Identificação do projeto

**Nome do jogo:** Rua de Aço  
**Tipo:** jogo de luta 2D em pixel art / estética arcade 16-bits  
**Plataformas planejadas:**
- Navegador
- PWA durante o desenvolvimento, embora a opção “Instalar jogo” deva ser removida do menu
- Windows `.exe` futuramente
- Android `.apk` futuramente

**Pasta local principal:**

```text
C:\Projetos\RuaDeAco
```

**Sessão do Codex associada ao projeto:**

```powershell
codex resume 019f5ee1-7331-7e92-864c-64a7b52f6e80
```

Para retomar com acesso amplo:

```powershell
cd C:\Projetos\RuaDeAco
codex --yolo resume 019f5ee1-7331-7e92-864c-64a7b52f6e80
```

**Claude Code no projeto:**

```powershell
cd C:\Projetos\RuaDeAco
claude --dangerously-skip-permissions
```

---

## 2. Stack e arquitetura escolhidas

Base atual recomendada e utilizada:

- Phaser
- TypeScript
- Vite
- HTML5/WebGL
- CSS responsivo
- PWA na estrutura do projeto
- Sem React
- Sem banco de dados
- Sem servidor obrigatório para o jogo final web
- Git local

Estrutura aproximada esperada:

```text
src/
  main.ts
  config/
  scenes/
  fighters/
  combat/
  input/
  ai/
  ui/
  audio/
  pwa/
  utils/
  types/

public/
  assets/
    fighters/
    portraits/
    references/
    stages/
    ui/
    audio/
    fonts/
  icons/
  manifest.webmanifest
  service-worker.js
```

A arquitetura deve manter separados:

- `PortraitAsset`: retratos para HUD, seleção, versus e vitória
- `FighterSpriteAsset`: sprites e spritesheets usados durante a luta

As fichas conceituais não devem ser tratadas como spritesheets.

---

## 3. Direção visual

O jogo deve ter aparência de arcade dos anos 1990, em pixel art 16-bits.

Requisitos visuais:

- pixels nítidos
- sem antialias
- sem blur
- sem suavização
- sem personagens feitos de círculos, retângulos ou bonecos-palito
- contornos fortes
- paleta limitada
- sombras em blocos
- efeitos especiais pixelados
- fontes pixeladas locais
- interface com metal, azul, prata e detalhes dourados
- cenário urbano noturno em pixel art
- imagens dos personagens usadas como referência real de identidade

Configuração desejada após ajustes:

```text
Resolução lógica: 640 × 360
Apresentação principal: 1280 × 720
Escala inteira: 2×
Proporção: 16:9
```

Configuração Phaser esperada:

```text
pixelArt: true
antialias: false
roundPixels: true
Scale.FIT
Scale.CENTER_BOTH
```

CSS esperado:

```css
canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
```

Observação importante: o projeto chegou a usar `320 × 180`, mas a resolução foi considerada baixa demais para preservar barba, rosto, tatuagens e detalhes dos personagens. O objetivo atual é `640 × 360`.

---

## 4. Nome e logo

**Nome oficial:** Rua de Aço

Foi criado um logo com estética arcade 16-bits, metal, azul, dourado e faíscas.

O logo deve aparecer no menu principal e futuramente será usado em:

- ícone do `.exe`
- ícone do `.apk`
- tela de abertura
- materiais promocionais

---

## 5. Elenco

### 5.1 Rafa Maré

**Arquétipo:** Agile / Rushdown

Características visuais:

- cabelo raspado
- bigode e cavanhaque
- alargador
- tatuagens
- camisa azul-clara
- bermuda escura
- tênis
- corpo atlético
- energia de água azul

Habilidades:

1. **Mão da Maré**
   - onda ou projétil curto/médio
   - dano moderado
   - comando preferencial: baixo, diagonal para frente, frente + especial

2. **Chute da Ressaca**
   - avanço rápido seguido de chute
   - energia azul
   - comando preferencial: baixo, diagonal para frente, frente + ataque forte

3. **Eco Tatuado**
   - buff temporário
   - aumenta velocidade, pressão ou recuperação
   - comando preferencial: baixo, diagonal para trás, trás + especial

Características de gameplay:

- velocidade alta
- vida média
- alcance curto
- pressão ofensiva
- pulo mais rápido e longo que Guto

### 5.2 Guto Barba

**Arquétipo:** Tank / Grappler

Características visuais:

- corpo grande, pesado e largo
- barba longa e volumosa
- touca escura
- moletom escuro
- calça escura
- botas robustas
- luvas
- postura intimidadora
- golpes pesados
- efeitos de gelo

Habilidades:

1. **Muralha Norte**
   - avanço protegido
   - absorve ou bloqueia um golpe
   - efeito de gelo/barreira
   - comando preferencial: baixo, diagonal para frente, frente + especial

2. **Gancho do Urso**
   - agarrão de curta distância
   - puxa ou derruba o oponente
   - comando preferencial: frente, baixo, diagonal para frente + ataque forte

3. **Abraço Glacial**
   - agarrão especial de alto dano
   - consome energia
   - efeito de congelamento
   - comando preferencial: baixo, diagonal para trás, trás + especial

Características de gameplay:

- muita vida
- velocidade baixa
- grande força
- salto curto e pesado
- excelente agarrão

### 5.3 Noir Reflexo

**Arquétipo:** Counter / Zoner

Habilidades:

- Reflexo Negro
- Quebra-Luz
- Impacto Solar

### 5.4 Astro Riso

**Arquétipo:** Speed / Mix-up

Habilidades:

- Sorriso Relâmpago
- Rajada Neon
- Astro Giro

### 5.5 Dante Sinal

**Arquétipo:** Technical / Trapper

Habilidades:

- Ponto Final
- Cortina Óptica
- Chave Binária

### 5.6 Léo Violeta

**Arquétipo:** Pressure / Brawler

Habilidades:

- Olhar Frio
- Impacto Sombrio
- Pressão Violeta

---

## 6. Escopo atual do protótipo

O primeiro protótipo deve ter:

- Rafa Maré
- Guto Barba
- menu principal
- seleção de personagens
- arena Cais da Cidade
- luta contra CPU
- dois jogadores no teclado
- controles touch
- melhor de três rounds
- HUD
- barra de energia
- cronômetro
- KO
- tela de resultado
- modo de treinamento, se já implementado
- sprites provisórios ou definitivos, mas reconhecíveis

Os outros quatro personagens podem aparecer como “Em desenvolvimento”.

---

## 7. Controles definidos

### Jogador 1

```text
A / D  → andar
W      → pular
S      → agachar
F      → ataque fraco
G      → ataque forte
H      → especial
R      → defender
Enter  → confirmar
Esc    → pausar ou voltar
```

### Jogador 2

```text
Setas  → movimentação
J      → ataque fraco
K      → ataque forte
L      → especial
U      → defender
```

### Touch

Lado esquerdo:

- direcional
- esquerda
- direita
- cima
- baixo
- diagonais superiores para pulo diagonal

Lado direito:

- ataque fraco
- ataque forte
- especial
- defesa

O touch deve usar multitouch real e permitir direção + ataque simultaneamente.

---

## 8. Pulo e movimentação desejados

O jogo deve suportar:

- pulo vertical
- pulo diagonal para frente
- pulo diagonal para trás
- queda
- aterrissagem correta
- nenhum segundo pulo no ar
- arco natural
- facing direction preservado
- limites da arena respeitados

Estados possíveis:

```text
jumpNeutral
jumpForward
jumpBackward
fall
landing
```

Também pode ser mantido um único estado `jump`, desde que velocidades e animações sejam diferenciadas corretamente.

Rafa:

- pulo mais rápido
- maior alcance horizontal

Guto:

- pulo mais curto
- sensação mais pesada

---

## 9. Golpes normais desejados

Golpes contextuais por direção:

### Em pé

- neutro + ataque fraco: soco rápido
- frente + ataque fraco: golpe avançando
- baixo + ataque fraco: golpe baixo rápido
- neutro + ataque forte: soco pesado
- frente + ataque forte: chute forte ou golpe de alcance
- baixo + ataque forte: rasteira ou golpe baixo pesado

### No ar

- pulo + ataque fraco: ataque aéreo rápido
- pulo + ataque forte: ataque aéreo pesado

### Agachado

- baixo + ataque fraco: ataque agachado rápido
- baixo + ataque forte: rasteira ou golpe agachado forte

A prioridade de comandos recomendada:

1. super/especial completo
2. agarrão
3. ataque aéreo
4. ataque agachado
5. ataque direcional
6. ataque normal

O sistema deve auditar quais animações já existem e quais golpes estão realmente conectados aos controles.

---

## 10. Sistema de combate desejado

Cada golpe deve ter:

- startup
- frames ativos
- recuperação
- hitbox
- hurtbox
- pushbox
- dano
- hit stun
- block stun
- knockback
- prioridade
- custo de energia
- cancelamentos
- invulnerabilidade, quando aplicável

O sistema deve usar dados configuráveis, não números espalhados.

Interfaces esperadas:

```text
FighterDefinition
MoveDefinition
AnimationDefinition
HitboxDefinition
HurtboxDefinition
InputCommand
FighterStats
```

O input buffer deve:

- reconhecer sequências
- aceitar diagonais
- ter tolerância adequada
- considerar frente/trás conforme o lado para o qual o lutador está virado
- limpar buffer após execução
- funcionar em teclado e touch

---

## 11. Arena inicial

**Nome:** Cais da Cidade

Características:

- cidade próxima à água
- noite
- pixel art
- postes
- prédios
- água animada
- parallax
- chão plano
- leitura clara
- sem fotos borradas
- sem gradientes realistas modernos

---

## 12. Problemas encontrados durante os testes

Problemas já observados em diferentes versões:

- resolução `320 × 180` baixa demais
- personagens transparentes ou com alpha intermediário
- membros, barba ou roupas vazados
- HUD muito grande
- barras de vida grandes demais
- Guto invadindo visualmente a área do HUD
- nomes ou elementos cortados
- pulo não funcionando corretamente
- agachamento não funcionando corretamente
- apenas dois golpes aparentemente acessíveis
- retrato de Guto com olhos desalinhados
- sprites iniciais avaliados antes de estarem concluídos; não repetir essa avaliação prematura

As causas e correções devem ser verificadas no código, sem presumir.

---

## 13. Retrato aprovado do Guto Barba

Foi gerado um novo retrato quadrado em pixel art com:

- rosto baseado em uma foto diferente
- olhos alinhados
- olhar sério
- barba cheia
- touca
- moletom
- moldura pixelada
- fundo azul
- nome “GUTO BARBA” na arte

Nome recomendado para o arquivo:

```text
guto-barba-portrait-final.png
```

Pasta recomendada:

```text
C:\Projetos\RuaDeAco\public\assets\references\guto-barba-portrait-final.png
```

A imagem deve substituir o retrato antigo do Guto em:

- HUD
- seleção de personagens
- tela versus
- tela de vitória
- card do personagem

Não deve substituir os sprites corporais.

---

## 14. Opção “Instalar jogo”

O menu principal possuía a opção:

```text
Instalar jogo
```

Essa opção serve para PWA, mas deve ser removida do menu durante o protótipo.

Remover:

- botão visual
- navegação até o botão
- clique
- textos de ajuda
- fluxo visível de `beforeinstallprompt`

A estrutura PWA pode continuar existindo.

Motivo:

- o projeto ainda está em testes
- futuramente serão gerados `.exe` e `.apk`
- não é necessário oferecer instalação PWA ao usuário nesta fase

---

## 15. Empacotamento futuro para Windows

Após estabilizar o protótipo:

- usar Electron
- usar electron-builder
- preservar versão web
- gerar:

```text
Rua-de-Aco-Setup-0.1.0.exe
Rua-de-Aco-Portable-0.1.0.exe
```

Pasta de saída esperada:

```text
C:\Projetos\RuaDeAco\release
```

Requisitos:

- offline
- sem Node instalado na máquina do jogador
- sem servidor local
- teclado funcionando
- áudio funcionando
- tela cheia
- localStorage
- assets incluídos
- ícone do Rua de Aço
- versão portátil
- instalador NSIS

Não implementar ainda enquanto jogabilidade e arte estiverem instáveis.

---

## 16. Empacotamento futuro para Android

Após estabilizar o protótipo:

- usar Capacitor
- empacotar a versão web em app Android
- gerar `.apk`
- preservar controles touch
- orientação horizontal
- funcionamento offline
- ícone próprio
- tela cheia
- safe areas
- sem depender de servidor

Não implementar ainda.

---

## 17. Comandos úteis do projeto

### Rodar no navegador

```powershell
cd C:\Projetos\RuaDeAco
npm.cmd run dev
```

Endereço comum:

```text
http://localhost:5173
```

### Build

```powershell
npm.cmd run build
```

### Preview do build

```powershell
npm.cmd run preview
```

### Ver scripts disponíveis

```powershell
npm.cmd run
```

### Parar servidor

```text
Ctrl + C
```

### Git

```powershell
git status
git add .
git commit -m "mensagem"
```

### Abrir Claude Code

```powershell
cd C:\Projetos\RuaDeAco
claude --dangerously-skip-permissions
```

### Retomar Codex

```powershell
cd C:\Projetos\RuaDeAco
codex --yolo resume 019f5ee1-7331-7e92-864c-64a7b52f6e80
```

---

## 18. Git

Foi necessário configurar identidade do Git:

```powershell
git config --global user.name "Maicon Nunes"
git config --global user.email "EMAIL_ESCOLHIDO"
```

Checkpoint recomendado antes de etapas grandes:

```powershell
git add .
git commit -m "Checkpoint antes da próxima etapa"
```

---

## 19. Regras para agentes que assumirem o projeto

Ao assumir o projeto:

1. Não recriar do zero.
2. Ler `package.json`.
3. Executar `git status`.
4. Identificar scripts.
5. Executar build de linha de base.
6. Preservar versão web.
7. Não substituir sprites aprovados.
8. Não inventar conclusão visual sem abrir o jogo.
9. Não declarar teste visual quando não houver navegador disponível.
10. Informar claramente o que foi automatizado e o que exige validação manual.
11. Corrigir apenas o escopo pedido.
12. Não iniciar Electron ou Capacitor sem solicitação específica.
13. Não usar imagens conceituais como spritesheets.
14. Não aplicar upscale suavizado.
15. Não usar personagens genéricos.
16. Não remover arquivos sem backup ou Git.
17. Não alterar retratos dos demais personagens ao corrigir Guto.
18. Preservar alpha 255 no corpo e usar transparência apenas nos efeitos.
19. Usar `nearest-neighbor` em redimensionamentos de pixel art.
20. Manter alinhamento dos pés, origem e linha de chão consistentes.

---

## 20. Próxima etapa ativa

A última solicitação preparada para o Claude Code inclui:

- remover “Instalar jogo”
- implementar pulo diagonal
- auditar golpes existentes
- conectar golpes dos sprites
- implementar ataques direcionais
- implementar ataques aéreos e agachados
- validar especiais de Rafa e Guto
- atualizar controles e ajuda
- testar input buffer, hitboxes e comandos
- não gerar `.exe` nem `.apk` ainda

Status real dessa etapa deve ser confirmado pelo usuário ou pelo estado atual dos arquivos. Não presumir que já foi concluída.

---

## 21. Critério para considerar o protótipo pronto

Antes de empacotar:

- menu estável
- opção PWA removida
- retratos corretos
- HUD proporcional
- barras de vida adequadas
- Guto não invade HUD
- pulo vertical funciona
- pulo diagonal funciona
- agachamento funciona
- ataques fracos e fortes funcionam
- ataques direcionais funcionam
- ataques aéreos funcionam
- ataques agachados funcionam
- três especiais de cada personagem funcionam
- defesa funciona
- CPU não trava
- touch funciona
- áudio funciona
- build passa
- jogo abre sem erros
- Rafa e Guto visualmente reconhecíveis
- nenhum sprite transparente indevidamente
- nenhuma parte do corpo cortada
- arena legível
- jogo testado em desktop
- jogo testado em celular horizontal

---

## 22. Recomendação de ferramenta/modelo

Para tarefas de programação neste projeto, sempre recomendar explicitamente ferramenta, modelo e nível de raciocínio, equilibrando qualidade e consumo de cota.

Diretriz geral:

- correções pequenas e localizadas: modelo intermediário, raciocínio médio
- auditoria de combate, input e arquitetura: modelo forte, raciocínio alto
- evitar raciocínio máximo para tarefas simples
- Codex, Claude Code e Gemini CLI podem trabalhar na mesma pasta, desde que o Git tenha checkpoints

---

## 23. Observação sobre imagens

As imagens geradas no ChatGPT não aparecem automaticamente no computador.

É necessário:

1. baixar a imagem
2. salvar dentro da pasta do projeto
3. usar nome estável
4. informar o caminho exato ao agente
5. pedir para atualizar manifest e cenas
6. executar build e validar no jogo

Pasta recomendada para referências:

```text
C:\Projetos\RuaDeAco\public\assets\references
```

Pasta recomendada para sprites:

```text
C:\Projetos\RuaDeAco\public\assets\fighters
```

---

## 24. Instrução de continuidade

Ao iniciar uma nova sessão com qualquer agente, usar:

```text
Leia integralmente o arquivo CONTEXTO_PROJETO_RUA_DE_ACO.md antes de alterar o projeto. Em seguida, execute git status, leia package.json, identifique o estado real da implementação e continue apenas a etapa ativa, preservando tudo que já funciona.
```
