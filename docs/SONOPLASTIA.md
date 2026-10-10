# Sonoplastia — Suno (09/10/2026)

Os efeitos de combate deixaram de ser apenas tons de um oscilador. Agora há
**47 amostras gravadas** em `public/assets/audio/sfx/`, cada uma em OGG e MP3
(2,2 MB no total, mono, 44,1 kHz), carregadas como a música: OGG primeiro,
MP3 se o navegador não decodificar.

## O que soa e quando

| Evento | Som |
| --- | --- |
| Golpe com hitbox ativa (exceto especiais) | `combate/golpe-ar` |
| Acerto fraco / forte / bloqueio | `combate/soco-leve`, `soco-forte`, `bloqueio` |
| Especial | grito do golpe (`vozes/<lutador>/...`) + elemento do lutador |
| Super | grito + amostra própria do super |
| Início de round | locutor "Round 1" a "Round 5" |
| Começo da luta | locutor "Fight!" |
| K.O. | `combate/ko-impacto` e, 0,45 s depois, locutor "K.O.!" |
| Fim por tempo / empate | locutor "Tempo!" / "Empate!" |
| Janela de finalização | tom de tensão + locutor "Finalize!" |
| Monstro do Cais | `finalizacao/monstro-rugido` |
| Resultado com vitória do jogador | locutor "Vitória!" |

Os dois especiais comuns de cada lutador dividem a amostra do elemento, e o
segundo toca em outro tom para não soar repetido: água (Rafa), espelho (Noir),
neon (Astro), fumaça (Dante), sombra (Léo) e gelo (Guto). A tabela fica em
`src/audio/sfxCatalog.ts`, com o volume de cada amostra.

Acertos, bloqueios e golpes no ar variam o tom em até 8% a cada toque, para a
troca de socos não soar como a mesma gravação repetida. Dois toques da mesma
amostra a menos de 30 ms viram um. Tudo isso é apresentação: nada entra na
simulação nem no hash do online, e o motor não muda de versão.

**Sem amostra, o jogo nunca fica mudo.** Se uma amostra não carregar, o evento
cai no tom sintetizado anterior. Round acima do quinto (só em empates seguidos)
também volta ao tom. As finalizações da Cozinha e do Sítio, o agarrão e a queda
continuam com os efeitos sintetizados — ficaram fora da cota de downloads.

O carregamento é explícito (`audioManager.preloadEffects()`), chamado no menu
principal, bem antes da primeira luta, e de novo na luta para quem chega direto
pelo online. A pré-carga entra no cache offline do PWA como os outros assets.

## Origem e direitos

Gerado no Suno com a conta do autor, **plano Pro** (uso comercial permitido,
inclusive Play Store). Falas pela aba *Speech* (voz masculina, sem música de
fundo), efeitos pela aba *Sounds* (one-shot). Custou cerca de 104 créditos e
24 dos 25 desbloqueios de download do ciclo, que renova em 24/10/2026. A outra
variante de cada geração continua na biblioteca do Suno, para troca futura.

Vozes genéricas do Suno: nenhuma voz real foi clonada, inclusive a do Guto.

## Como as falas foram separadas

Cada geração de fala trouxe várias frases num arquivo só (locutor com 11, cada
lutador com os 3 especiais), às vezes com respiração, riso ou eco a mais. A
**ordem e a identidade** de cada frase vieram de uma transcrição local com o
whisper do ffmpeg (modelo `ggml-tiny`, nada enviado à internet); os **limites**
vieram do envelope de energia, refinados para o ponto mais silencioso. Depois do
corte, cada fala foi transcrita de novo isoladamente para conferir que o golpe
certo grita o nome certo.

Duas correções manuais, já embutidas no script:

- o locutor ri antes de "Vitória"; o corte começa em 18,66 s (em 19,0 s sobrava
  só "-tória", por causa do silêncio do "t");
- o Dante disse "Chave… Binária" com 1,8 s de pausa; as duas palavras foram
  emendadas.

## Regerar

```bash
npm run assets:sfx
```

`scripts/process-suno-sfx.py` lê os WAV originais em
`tmp/audio-source/suno-sonoplastia/raw/` (fora do Git, incluídos no backup do
Drive; os ids dos clipes do Suno estão em `clipes-suno.txt` na mesma pasta) e
reescreve `public/assets/audio/sfx/`. Os MP3 saem idênticos byte a byte; os OGG
mudam só o número de série do contêiner, com o áudio decodificado idêntico.

## Pendente de conferência manual

Ninguém ouviu este conjunto ainda: não houve como escutar durante a geração.
O equilíbrio de volume entre vozes e efeitos (`gain` em `sfxCatalog.ts`) e a
escolha da variante de cada efeito precisam de uma rodada de escuta no jogo.
Os efeitos de magia vieram do Suno como texturas de 6 a 12 s e foram recortados
para 1,2 a 3,2 s com fade-out; se algum ficar fraco, a outra variante está na
biblioteca e sobra 1 desbloqueio até 24/10.
