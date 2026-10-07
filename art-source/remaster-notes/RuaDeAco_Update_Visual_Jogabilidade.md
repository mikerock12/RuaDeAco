# Rua de Aço — plano objetivo de atualização visual e de jogabilidade

## Objetivo
Aplicar uma atualização geral nas telas, HUD, controles e feedbacks do jogo para:
- melhorar a aparência;
- deixar a interface menor, mais limpa e mais legível;
- melhorar a experiência no celular e no navegador;
- aumentar a sensação de impacto da jogabilidade;
- manter alto desempenho no Phaser e no browser.

---

## 1) Direção geral

### O que precisa mudar
- Reduzir o excesso de caixas grandes, bordas pesadas e áreas vazias.
- Unificar a identidade visual de todas as telas.
- Melhorar hierarquia visual: título, ação principal, ação secundária e ajuda.
- Dar mais destaque ao cenário e menos peso à interface.
- Melhorar leitura com menos texto por tela.
- Manter o estilo pixel art/arcade, mas com acabamento mais moderno.

### Regras visuais
- **Paleta base:** azul escuro, ciano neon, amarelo/dourado para destaque e branco para leitura.
- **Cor de foco/seleção:** ciano para navegação normal; amarelo para confirmação/ação principal.
- **Cor de perigo/espera:** vermelho/rosa apenas para VS, rival, alerta ou dano.
- **Painéis:** mais finos, com menos preenchimento opaco.
- **Espaçamento:** aumentar respiro entre elementos.
- **Tipografia:** manter pixel font, mas reduzir blocos de texto e usar rótulos curtos.

---

## 2) Tela inicial / menu principal

### Problemas atuais
- Layout pesado.
- Botões grandes demais.
- Retratos laterais brigando com a ação principal.
- Falta de foco claro no que é mais importante.

### Mudanças necessárias
- Centralizar o logo no topo com mais respiro.
- Deixar os botões principais em uma coluna central compacta.
- Reduzir o tamanho visual dos retratos laterais.
- Transformar retratos laterais em apoio visual, não em elemento principal.
- Destacar melhor a opção selecionada com borda brilhante e pequeno ícone.
- Adicionar rodapé de ajuda discreto: navegar, selecionar, voltar.
- Remover poluição desnecessária na base da tela.

### Resultado esperado
- Menu mais bonito, mais limpo e mais profissional.
- Leitura imediata da ação principal.

---

## 3) Seleção de lutadores

### Problemas atuais
- Cartões grandes e pesados.
- Ficha do lutador muito rígida.
- Pouca valorização do personagem selecionado.

### Mudanças necessárias
- Redesenhar a grade de lutadores com cards menores.
- Manter 2 linhas x 3 colunas com melhor respiro.
- Destacar o lutador selecionado com brilho, borda animada leve e label “OK”.
- Reduzir a moldura da ficha do lutador.
- Reorganizar a ficha:
  - retrato;
  - nome;
  - arquétipo;
  - lista de habilidades;
  - botão confirmar.
- Adicionar ícones pequenos para habilidades, se possível.
- Melhorar o botão **CONFIRMAR** para parecer realmente a ação principal.
- Melhorar a instrução inferior: curta, clara e centralizada.

### Resultado esperado
- Seleção mais moderna, com melhor leitura e menos peso visual.

---

## 4) Tela de arena e confronto

### Problemas atuais
- Composição antiga e pouco impactante.
- VS e arena com pouca presença.
- Botão lutar sem destaque suficiente.

### Mudanças necessárias
- Reorganizar a tela com foco em três áreas:
  1. arena escolhida;
  2. personagem da esquerda;
  3. personagem da direita.
- Colocar o nome da arena em destaque no topo.
- Manter setas laterais mais limpas e grandes o suficiente para toque.
- Colocar o preview da arena no centro.
- Dar mais presença ao “VS”.
- Transformar o botão **LUTAR** no principal CTA da tela.
- Melhorar equilíbrio de peso visual entre personagens e arena.

### Resultado esperado
- Tela de confronto mais empolgante e mais clara.

---

## 5) Tela online — menu

### Problemas atuais
- Visual simples demais perto do resto.
- Identidade boa, mas subaproveitada.
- Hierarquia fraca entre criar sala e entrar com código.

### Mudanças necessárias
- Manter a identidade “sinal orbital”, porém mais refinada.
- Fortalecer o cabeçalho **RUA DE AÇO // ONLINE**.
- Dar destaque máximo ao botão **CRIAR SALA**.
- Manter **ENTRAR COM CÓDIGO** como ação secundária.
- Deixar **VOLTAR** visualmente menor.
- Melhorar elementos decorativos laterais sem poluir.
- Tornar a ajuda inferior mais discreta.

### Resultado esperado
- Tela online mais coerente com o restante do jogo.

---

## 6) Lobby online

### Problemas atuais
- Muitos blocos visuais competindo entre si.
- Leitura razoável, mas pesada.
- Falta melhor distinção entre “você” e “rival”.

### Mudanças necessárias
- Manter a grade de personagens, mas com cards mais finos.
- Destacar o jogador local com tag **P1** e brilho sutil.
- Destacar o estado do rival: aguardando / pronto.
- Colocar o código da sala em área de destaque na parte superior.
- Reorganizar a escolha da arena no centro inferior.
- Padronizar os botões da base:
  - SAIR;
  - ESCOLHER LUTADOR;
  - COPIAR CÓDIGO.
- Melhorar o indicador de ping no topo direito.
- Reduzir excesso de molduras internas.

### Resultado esperado
- Lobby mais organizado e funcional.

---

## 7) Configurações

### Problemas atuais
- Tabela pesada.
- Título muito grande e lista pouco refinada.
- Pouca separação entre tipos de opção.

### Mudanças necessárias
- Criar um painel central único, mais limpo.
- Reduzir a espessura das linhas separadoras.
- Adicionar ícones pequenos por categoria:
  - volume;
  - música;
  - efeitos;
  - mudo;
  - dificuldade;
  - touch;
  - tela cheia;
  - controles.
- Destacar a linha selecionada com amarelo.
- Manter valores alinhados à direita.
- Melhorar legibilidade das opções numéricas (%).
- Reduzir ruído visual do cabeçalho.

### Resultado esperado
- Tela de configuração mais clara, bonita e intuitiva.

---

## 8) Tela de controles

### Problemas atuais
- Tabela funcional, mas visualmente seca.
- Falta distinção entre categoria, ação e tecla.
- Navegação pouco valorizada visualmente.

### Mudanças necessárias
- Usar um painel central mais limpo.
- Destacar o jogador e o dispositivo no topo da lista.
- Inserir ícones nas ações principais:
  - esquerda;
  - direita;
  - pulo;
  - agachar;
  - fraco;
  - forte;
  - especial;
  - defesa.
- Dar mais destaque à linha selecionada.
- Deixar “restaurar perfil”, “restaurar tudo” e “voltar” visualmente separados das ações de gameplay.
- Melhorar o rodapé de ajuda.

### Resultado esperado
- Tela mais organizada e mais agradável de configurar.

---

## 9) HUD da luta

### Problemas atuais
- HUD muito grande.
- Barras e retratos ocupando espaço demais.
- Informações de treino e round com peso excessivo.

### Mudanças necessárias
- Reduzir a altura do HUD em cerca de **25% a 35%**.
- Diminuir os retratos dos lutadores.
- Afinar as barras de vida e energia.
- Compactar o timer no centro.
- Melhorar indicadores de round vencido.
- Reorganizar a HUD de treino (reset, hitbox, cpu, pause) em uma faixa superior mais discreta.
- Mover “DANO / COMBO” para um painel pequeno e central na base.
- Remover molduras pesadas e excesso de preenchimento escuro.

### Resultado esperado
- Mais área útil para o combate.
- Melhor leitura sem sacrificar identidade.

---

## 10) Controles touch

### Problemas atuais
- Controles muito grandes.
- Botões muito separados.
- Aparência pesada e pouco elegante.
- Interação funcional, mas ainda pode ficar muito melhor.

### Mudanças necessárias

### Analógico
- Substituir o direcional por **analógico radial**.
- Base fixa no canto inferior esquerdo.
- Knob seguindo o dedo em 360°.
- Dead zone de **15% a 20%**.
- Opacidade padrão de **40%**.
- Ao tocar, aumentar brilho/opacidade temporariamente.
- Limitar o knob ao raio máximo da base.
- Manter saída digital em 8 direções para compatibilidade com o combate.

### Botões
- Organizar os botões em diamante no canto inferior direito.
- Manter 4 ações visíveis:
  - **L** = leve/fraco;
  - **H** = forte;
  - **D** = defesa;
  - **S** = especial.
- Tornar os botões grandes o suficiente para toque, mas menores do que hoje.
- Área de toque mínima: **44 CSS px**.
- Visual com brilho leve e bordas finas.
- Permitir deslizar entre botões sem perder resposta.

### Resultado esperado
- Menos obstrução da tela.
- Melhor conforto para o polegar.
- Maior precisão no celular.

---

## 11) Feedback de jogabilidade

### O que precisa melhorar
- Sensação de impacto.
- Clareza entre acerto, bloqueio e erro.
- Resposta visual dos golpes.

### Mudanças necessárias
- Criar **hit spark** pequeno e preciso no ponto de contato.
- Criar **block spark** diferente do hit spark.
- Aplicar **hit stop** visível, mas curto.
- Aplicar **camera shake leve** em golpes fortes e KO.
- Aplicar **flash curto** apenas em heavy/special/KO.
- Melhorar feedback sonoro:
  - hit leve;
  - hit forte;
  - block;
  - whiff;
  - especial;
  - KO.
- Destacar melhor dano/combo no treino.

### Resultado esperado
- Jogo mais gostoso de jogar.
- Melhor leitura dos eventos de combate.

---

## 12) Cenários e apresentação visual da luta

### Problemas atuais
- Bom conceito, mas ainda com sensação de layout grande e rígido.
- O cenário pode ter mais profundidade sem pesar.

### Mudanças necessárias
- Melhorar contraste entre personagens e fundo.
- Reforçar camadas de profundidade com **parallax leve**.
- Priorizar elementos baked/pintados em vez de efeitos caros em tempo real.
- Melhorar luzes, lua, reflexos, água e atmosfera.
- Reduzir ruído visual próximo à área jogável.
- Manter o foco dos olhos no centro da luta.

### Resultado esperado
- Cena mais bonita e mais cinematográfica, sem matar a performance.

---

## 13) Desempenho e otimização

### Regras obrigatórias
- Não reescrever o motor de combate.
- Não trocar Phaser.
- Não depender de shader pesado em tempo integral.
- Preferir soluções 2D baratas e previsíveis.

### Mudanças técnicas recomendadas
- Manter `pixelArt: true`, `roundPixels: true`, `antialias: false`.
- Carregar assets por necessidade sempre que possível.
- Reutilizar componentes visuais entre telas.
- Evitar animações de UI muito longas ou complexas.
- Usar brilho/halo por sprite/painel de forma leve.
- Limitar partículas simultâneas.
- Padronizar tamanhos e molduras em componentes reutilizáveis.
- Revisar paddings, font sizes e escalas para evitar telas “gigantes”.

### Orçamento visual
- Mais nitidez e organização.
- Menos efeitos exagerados.
- Mais performance estável no browser e no mobile.

---

## 14) Arquivos/sistemas que provavelmente serão alterados

### UI / cenas
- telas do menu principal;
- seleção de lutadores;
- arena/confronto;
- online menu;
- lobby online;
- configurações;
- controles;
- HUD da luta;
- HUD de treino.

### Input
- `TouchControls.ts`
- lógica do analógico radial;
- layout dos botões touch;
- transparência dinâmica;
- arraste entre ataques.

### Estilo
- `styles.css`
- componentes de painel, botão, foco, glow, rodapé e overlay.

### Assets
- molduras e painéis;
- ícones pequenos da interface;
- efeitos de hit/block;
- eventuais fundos refinados.

---

## 15) Ordem de implementação

### Fase 1 — Base visual
1. Criar sistema visual unificado de painéis, botões, bordas e cores.
2. Ajustar tipografia, paddings e escalas.
3. Redesenhar menu principal.

### Fase 2 — Fluxo de navegação
4. Redesenhar seleção de lutadores.
5. Redesenhar arena e confronto.
6. Redesenhar menu online e lobby.
7. Redesenhar configurações e controles.

### Fase 3 — Combate
8. Compactar HUD da luta.
9. Compactar HUD de treino.
10. Implementar novo analógico radial.
11. Reorganizar botões touch.
12. Ajustar transparência touch para 40%.

### Fase 4 — Feel
13. Adicionar feedbacks visuais de hit/block.
14. Melhorar feedback sonoro.
15. Ajustar microanimações e pequenos efeitos.

### Fase 5 — Validação
16. Testar desktop.
17. Testar Android.
18. Testar responsividade e fullscreen.
19. Ajustar performance final.

---

## 16) Critérios de pronto

A atualização estará pronta quando:
- todas as telas tiverem a mesma identidade visual;
- o HUD estiver menor e mais elegante;
- os controles touch estiverem menores, mais bonitos e mais precisos;
- o analógico radial estiver funcionando bem;
- o jogo estiver com mais impacto visual e melhor leitura de hit/block;
- a experiência estiver melhor no celular;
- a performance continuar estável no navegador.

---

## 17) Resumo executivo

### Prioridade máxima
1. Compactar HUD.
2. Refazer controles touch.
3. Unificar todas as telas.
4. Melhorar feedback de combate.
5. Polir cenário e profundidade sem pesar.

### O que mais vai mudar a percepção do jogador
- menu e seleção mais bonitos;
- HUD menor;
- analógico melhor;
- botões touch melhores;
- hit/block com mais impacto;
- visual geral mais profissional.
