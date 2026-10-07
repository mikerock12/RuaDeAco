# Rostos e retratos (07/10/2026)

Os rostos de Rafa, Noir, Astro, Dante e Léo pareciam pessoas reais. Foram trocados em
todas as 864 células de animação por visuais novos, em pixel art, combinando com o estilo
de luta de cada um. O Guto ficou igual (é baseado no autor); o retrato dele ganhou só
acabamento: contorno de luz fria e flocos de gelo.

| Lutador | Arquétipo | Rosto novo |
| --- | --- | --- |
| Rafa Maré | Agile / Rushdown | moicano turquesa em onda, pintura de guerra azul na bochecha, sem barba |
| Noir Reflexo | Counter / Zoner | cabelo platinado para trás, óculos espelhados ciano, sem barba |
| Astro Riso | Speed / Mix-up | cabelo espetado magenta, estrela dourada no olho, sorriso |
| Dante Sinal | Technical / Zoner | cabelo cinza-chumbo, visor de LED vermelho, barba ruiva |
| Léo Violeta | Pressure / Brawler | franja violeta caída sobre o olho, cicatriz no rosto, sem barba |

Expressões por animação: neutra, esforço (golpes fortes e especiais) e dor (impacto, queda,
agarrado). Corpo, roupas, golpes, alpha e linha de chão não mudaram, e as caixas de colisão
continuam as mesmas.

## Pipeline

Em `scripts/faces/` (Python 3 com Pillow, NumPy, OpenCV e SciPy):

1. `detect.py` localiza a cabeça em cada quadro por correspondência de molde (posição,
   rotação, escala e espelho). Resultado em `art-source/fighters/faces-v3/heads-*.json`.
2. `restyle.py` leva cada pixel perto da cabeça ao espaço do molde e redesenha cabelo,
   barba, olhos/óculos e traços do rosto. Exceções por quadro ficam em
   `art-source/fighters/faces-v3/overrides-*.json` (pular, posição manual ou só recolorir
   o cabelo quando a cabeça está escondida entre os braços).
3. `refresh-locked-hashes.py` atualiza os SHA-256 de saída que a auditoria trava
   (agarrão e Léo/Noir), registrando o hash anterior.
4. `portraits.py` monta os retratos 512 × 512 de menu, seleção, HUD, versus e resultado a
   partir do sprite, e o acabamento do retrato do Guto. Ficam em `public/assets/portraits/`.

Reprodução a partir das folhas originais (commit `becdd61`):

```bash
git archive becdd61 public/assets/fighters | tar -x -C /tmp/orig
for f in rafa-mare noir-reflexo astro-riso dante-sinal leo-violeta; do
  FACES_SRC=/tmp/orig/public/assets/fighters python3 scripts/faces/restyle.py $f all
done
python3 scripts/faces/refresh-locked-hashes.py
python3 scripts/faces/portraits.py
```

Atenção: `npm run assets:grab` regenera as folhas do agarrão a partir das fontes antigas;
depois dele é preciso rodar de novo o passo 2 para essas folhas.

As fichas conceituais quase fotográficas (`public/assets/references/*-concept.png`,
`character-guides/`) foram removidas do jogo. As notas de design de `public/assets/remaster`
foram para `art-source/remaster-notes` e deixaram de ir para o site e o app.
